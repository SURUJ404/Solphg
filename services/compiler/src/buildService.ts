import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import * as path from "node:path";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BuildRequest, BuildResult, FileInput } from "./types";
import {
  ANCHOR_VERSION,
  RUST_VERSION,
  SOLANA_VERSION,
  anchorToml,
  programCargoToml,
  workspaceCargoToml,
} from "./templates";

export const VALID_PROGRAM_NAME = /^[a-z][a-z0-9_-]{1,63}$/;
const MAX_FILES = 40;
const MAX_FILE_BYTES = 200_000;
const CACHE_SCHEMA = "v2";
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

export class BuildQueueFullError extends Error {
  readonly code = "BUILD_QUEUE_FULL";
  constructor(readonly retryAfterSec = 10) {
    super("Compiler workers at capacity. Retry shortly.");
    this.name = "BuildQueueFullError";
  }
}

export class BuildTimeoutError extends Error {
  readonly code = "BUILD_TIMEOUT";
  constructor(readonly timeoutMs: number) {
    super(`Build exceeded the ${Math.round(timeoutMs / 1000)}s time limit and was terminated.`);
    this.name = "BuildTimeoutError";
  }
}

export interface BuildInput {
  files: Record<string, string>;
  programName: string;
  /** Stable program ID owned by the caller. Enables cache hits. */
  programId?: string;
}

export interface BuildArtifact {
  cached: boolean;
  cacheKey: string;
  soBase64: string;
  idlJson?: Record<string, unknown>;
  logs: string;
  durationMs: number;
  programId: string;
  /** Only set when the service generated a keypair for this request. */
  programKeypairBase64?: string;
}

function envStr(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export function toolchainTag(): string {
  return envStr(
    "TOOLCHAIN_TAG",
    `anchor-${ANCHOR_VERSION}-agave-${SOLANA_VERSION}-rust-${RUST_VERSION}`,
  );
}

export function isValidProgramId(value: string): boolean {
  try {
    const key = new PublicKey(value);
    return key.toBase58() === value;
  } catch {
    return false;
  }
}

export function isSafeRelativePath(p: string): boolean {
  if (!p || p.includes("\0") || p.includes("\\")) return false;
  if (path.posix.isAbsolute(p) || /^[a-zA-Z]:/.test(p)) return false;
  const segments = p.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export function normalizeFilePath(filePath: string, _programName: string): string {
  // Project-root relative form: programs/<crate>/src/lib.rs (template may use
  // a different crate name than programName, e.g. spl_transfer vs spl-transfer).
  return filePath.replace(/^programs\/[^/]+\/src\//, "").replace(/^src\//, "");
}

export function validateRequest(req: BuildRequest): string | null {
  if (!req || typeof req !== "object") return "request body must be an object";
  if (!req.programName || !VALID_PROGRAM_NAME.test(req.programName)) {
    return "programName must match ^[a-z][a-z0-9_-]{1,63}$ (lowercase, 2-64 chars, e.g. 'my_counter')";
  }
  if (req.programId !== undefined && !isValidProgramId(req.programId)) {
    return "programId must be a valid base58 Solana public key";
  }
  if (!Array.isArray(req.files) || req.files.length === 0) {
    return "files must be a non-empty array";
  }
  if (req.files.length > MAX_FILES) {
    return `too many files (max ${MAX_FILES})`;
  }
  for (const f of req.files) {
    if (!f || typeof f.path !== "string" || !isSafeRelativePath(f.path)) {
      return `invalid file path: ${String(f?.path)}`;
    }
    if (typeof f.content !== "string") {
      return `invalid file content for ${f.path}`;
    }
    if (Buffer.byteLength(f.content, "utf8") > MAX_FILE_BYTES) {
      return `file too large: ${f.path}`;
    }
  }
  return null;
}

function usesAnchorSpl(files: Record<string, string>): boolean {
  return Object.values(files).some((content) => /anchor_spl\b/.test(content));
}

/**
 * Replace the `declare_id!` value so the compiled binary matches the program
 * address we hand back. This is the server-side equivalent of
 * `anchor keys sync` and prevents DeclaredProgramIdMismatch at runtime.
 */
export function syncDeclareId(files: Record<string, string>, programId: string): Record<string, string> {
  const out: Record<string, string> = {};
  const anchorSource = Object.values(files).some((c) => /anchor_lang\b/.test(c));
  for (const [rel, content] of Object.entries(files)) {
    if (!rel.endsWith(".rs")) {
      out[rel] = content;
      continue;
    }
    if (/declare_id!\s*\(\s*"[^"]*"\s*\)\s*;/.test(content)) {
      out[rel] = content.replace(
        /declare_id!\s*\(\s*"[^"]*"\s*\)\s*;/g,
        `declare_id!("${programId}");`,
      );
    } else if (anchorSource && /anchor_lang::prelude::\*/.test(content)) {
      out[rel] = content.replace(
        /(use\s+anchor_lang::prelude::\*;)/,
        `$1\n\ndeclare_id!("${programId}");`,
      );
    } else {
      out[rel] = content;
    }
  }
  return out;
}

function baseEnv(cwd: string, homeDir: string, cargoHome: string): NodeJS.ProcessEnv {
  // Scrubbed environment: never forward faucet keys, API tokens, or the
  // server's own env to untrusted build code.
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
    HOME: homeDir,
    CARGO_HOME: cargoHome,
    CARGO_NET_OFFLINE: "true",
    RUST_BACKTRACE: "0",
    RUSTFLAGS:
      process.env.BUILD_RUSTFLAGS ||
      `--remap-path-prefix=${cwd}=workspace --remap-path-prefix=${homeDir}=home`,
  };
  if (process.env.RUSTUP_HOME) env.RUSTUP_HOME = process.env.RUSTUP_HOME;
  if (process.env.SOLANA_CACHE_SRC) env.SOLANA_CACHE_SRC = process.env.SOLANA_CACHE_SRC;
  if (process.env.ANCHOR_BIN) env.ANCHOR_BIN = process.env.ANCHOR_BIN;
  // Test-only knobs for the fake anchor fixture. Never forwarded for the real binary.
  if (process.env.ANCHOR_BIN && /\.(mjs|cjs|js)$/i.test(process.env.ANCHOR_BIN)) {
    if (process.env.FAKE_ANCHOR_MODE) env.FAKE_ANCHOR_MODE = process.env.FAKE_ANCHOR_MODE;
    if (process.env.FAKE_ANCHOR_COUNTER) env.FAKE_ANCHOR_COUNTER = process.env.FAKE_ANCHOR_COUNTER;
  }
  return env;
}

function killProcessTree(pid: number): void {
  if (!pid || pid <= 0) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }).on(
      "error",
      () => {},
    );
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

interface ExecResult {
  stdout: string;
  stderr: string;
}

function runAnchor(
  cwd: string,
  homeDir: string,
  cargoHome: string,
  timeoutMs: number,
): Promise<ExecResult> {
  const configured = envStr("ANCHOR_BIN", "anchor");
  const isScript = /\.(mjs|cjs|js)$/i.test(configured);
  const command = isScript ? process.execPath : configured;
  const args = isScript ? [configured, "build"] : ["build"];

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: baseEnv(cwd, homeDir, cargoHome),
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child.pid ?? 0);
      // Belt-and-braces: on Windows a detached tree kill can occasionally
      // miss; make sure the direct child is gone.
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* already gone */
        }
      }, 250).unref?.();
    }, timeoutMs);

    const append = (target: "out" | "err", chunk: Buffer) => {
      const text = chunk.toString("utf8");
      if (target === "out") stdout += text;
      else stderr += text;
      if (stdout.length + stderr.length > MAX_OUTPUT_BYTES) {
        killProcessTree(child.pid ?? 0);
        finish(() =>
          reject(new Error("Build output exceeded the 10MB limit and was terminated.")),
        );
      }
    };

    child.stdout?.on("data", (c: Buffer) => append("out", c));
    child.stderr?.on("data", (c: Buffer) => append("err", c));
    child.on("error", (err) => finish(() => reject(err)));
    child.on("close", (code) => {
      finish(() => {
        if (timedOut) {
          reject(new BuildTimeoutError(timeoutMs));
          return;
        }
        if (code === 0) resolve({ stdout, stderr });
        else {
          const err = new Error(`anchor build exited with code ${code}`);
          (err as Error & { logs?: string }).logs = `${stdout}\n${stderr}`.trim();
          reject(err);
        }
      });
    });
  });
}

export class SandboxedBuildService {
  private activeBuilds = 0;
  private readonly inflight = new Map<
    string,
    Promise<Omit<BuildArtifact, "cacheKey" | "durationMs">>
  >();

  public get queueDepth(): number {
    return this.activeBuilds;
  }

  public get maxConcurrentBuilds(): number {
    return envInt("MAX_CONCURRENT_BUILDS", 2, 1, 32);
  }

  public get timeoutMs(): number {
    return envInt("BUILD_TIMEOUT_MS", 180_000, 250, 900_000);
  }

  private get cacheDir(): string {
    return envStr("BUILD_CACHE_DIR", "/tmp/solphg-cache");
  }

  private get workRoot(): string {
    return envStr("BUILD_WORK_DIR", "/workspaces/build");
  }

  public computeCacheKey(
    input: BuildInput,
    programId: string,
    tag = toolchainTag(),
  ): string {
    const hash = createHash("sha256");
    hash.update(CACHE_SCHEMA);
    hash.update("\0");
    hash.update(tag);
    hash.update("\0");
    hash.update(input.programName);
    hash.update("\0");
    hash.update(programId);
    hash.update("\0");
    for (const relPath of Object.keys(input.files).sort()) {
      hash.update(relPath);
      hash.update("\0");
      hash.update(input.files[relPath]);
      hash.update("\0");
    }
    return hash.digest("hex");
  }

  public async getStats(): Promise<{ entries: number; maxEntries: number; dir: string; queueDepth: number }> {
    let entries = 0;
    try {
      const names = await readdir(this.cacheDir);
      entries = names.filter((n) => !n.startsWith(".")).length;
    } catch {
      /* cache dir absent */
    }
    return {
      entries,
      maxEntries: envInt("BUILD_CACHE_MAX_ENTRIES", 200, 1, 10_000),
      dir: this.cacheDir,
      queueDepth: this.activeBuilds,
    };
  }

  public async build(input: BuildInput): Promise<BuildArtifact> {
    const start = performance.now();
    const generatedKeypair = input.programId === undefined ? Keypair.generate() : undefined;
    const programId = input.programId ?? generatedKeypair!.publicKey.toBase58();

    const files = syncDeclareId(input.files, programId);
    const normalized: BuildInput = { programName: input.programName, programId, files };
    const cacheKey = this.computeCacheKey(normalized, programId);

    // Register the in-flight promise synchronously so identical concurrent
    // requests share one compilation instead of racing the cache.
    const existing = this.inflight.get(cacheKey);
    if (existing) {
      const artifact = await existing;
      // Do not hand a second caller the first caller's program keypair.
      return {
        ...artifact,
        programKeypairBase64: undefined,
        cached: false,
        cacheKey,
        durationMs: Math.round(performance.now() - start),
        programId,
      };
    }

    const task = this.buildOrRead(normalized, programId, cacheKey, generatedKeypair);
    this.inflight.set(cacheKey, task);
    try {
      const artifact = await task;
      return {
        ...artifact,
        cacheKey,
        durationMs: Math.round(performance.now() - start),
        programId,
      };
    } finally {
      if (this.inflight.get(cacheKey) === task) this.inflight.delete(cacheKey);
    }
  }

  private async buildOrRead(
    input: BuildInput,
    programId: string,
    cacheKey: string,
    generatedKeypair: Keypair | undefined,
  ): Promise<Omit<BuildArtifact, "cacheKey" | "durationMs">> {
    const hit = await this.readCache(cacheKey, programId);
    if (hit) {
      return { ...hit, cached: true, programId };
    }

    if (this.activeBuilds >= this.maxConcurrentBuilds) {
      throw new BuildQueueFullError(10);
    }

    const artifact = await this.executeJob(input, programId, cacheKey);
    return {
      ...artifact,
      cached: false,
      programId,
      programKeypairBase64: generatedKeypair
        ? Buffer.from(generatedKeypair.secretKey).toString("base64")
        : undefined,
    };
  }

  private async executeJob(
    input: BuildInput,
    programId: string,
    cacheKey: string,
  ): Promise<Omit<BuildArtifact, "cacheKey" | "durationMs" | "cached">> {
    this.activeBuilds++;
    const jobDir = path.join(this.workRoot, `${cacheKey.slice(0, 12)}-${randomUUID()}`);
    const homeDir = path.join(jobDir, "home");
    const cargoHome = path.join(jobDir, "cargo-home");
    const projectDir = path.join(jobDir, "project");
    const pkgName = input.programName.replace(/-/g, "_");

    try {
      await this.prepareDirs(jobDir, homeDir, cargoHome);
      const srcDir = path.join(projectDir, "programs", input.programName, "src");
      await mkdir(srcDir, { recursive: true });

      for (const [relPath, content] of Object.entries(input.files)) {
        const rel = normalizeFilePath(relPath, input.programName);
        if (!isSafeRelativePath(rel)) {
          throw new Error(`INVALID_PATH: unsafe relative path "${relPath}"`);
        }
        const dest = path.resolve(srcDir, rel);
        if (dest !== srcDir && !dest.startsWith(srcDir + path.sep)) {
          throw new Error(`INVALID_PATH: path escapes source directory "${relPath}"`);
        }
        await mkdir(path.dirname(dest), { recursive: true });
        await writeFile(dest, content, "utf8");
      }

      const spl = usesAnchorSpl(input.files);
      await writeFile(path.join(projectDir, "Anchor.toml"), anchorToml(input.programName, programId));
      await writeFile(path.join(projectDir, "Cargo.toml"), workspaceCargoToml());
      await writeFile(
        path.join(projectDir, "programs", input.programName, "Cargo.toml"),
        programCargoToml(input.programName, { usesAnchorSpl: spl }),
      );

      await this.copyCanonicalLock(projectDir);

      let logs = "";
      try {
        const result = await runAnchor(projectDir, homeDir, cargoHome, this.timeoutMs);
        logs = `${result.stdout}\n${result.stderr}`.trim();
      } catch (err) {
        const withLogs = err as Error & { logs?: string };
        withLogs.logs = withLogs.logs || logs;
        throw withLogs;
      }

      const soPath = path.join(projectDir, "target", "deploy", `${pkgName}.so`);
      const idlPath = path.join(projectDir, "target", "idl", `${pkgName}.json`);
      const soBuf = await readFile(soPath);
      let idlJson: Record<string, unknown> | undefined;
      try {
        idlJson = JSON.parse(await readFile(idlPath, "utf8"));
      } catch {
        idlJson = undefined;
      }

      const artifactDir = path.join(this.cacheDir, cacheKey);
      await this.writeCacheAtomic(artifactDir, cacheKey, {
        so: soBuf,
        idlJson,
        programId,
        programName: input.programName,
        toolchainTag: toolchainTag(),
        logs,
      });
      await this.pruneCache();

      return {
        soBase64: soBuf.toString("base64"),
        idlJson,
        logs: logs || `[solphg] built ${input.programName}`,
        programId,
      };
    } finally {
      this.activeBuilds--;
      await rm(jobDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async prepareDirs(jobDir: string, homeDir: string, cargoHome: string): Promise<void> {
    await mkdir(path.join(homeDir, ".config", "solana"), { recursive: true });
    await mkdir(path.join(homeDir, ".cache"), { recursive: true });
    await mkdir(cargoHome, { recursive: true });

    const sharedHome = process.env.SOLANA_SHARED_HOME;
    if (sharedHome) {
      await symlinkAsset(path.join(sharedHome, ".cache", "solana"), path.join(homeDir, ".cache", "solana"));
    } else if (process.env.HOME) {
      await symlinkAsset(path.join(process.env.HOME, ".cache", "solana"), path.join(homeDir, ".cache", "solana"));
    }

    await symlinkAsset("/usr/local/cargo/registry", path.join(cargoHome, "registry"));
    await symlinkAsset("/usr/local/cargo/git", path.join(cargoHome, "git"));

    // Anchor only needs a syntactically valid wallet for provider config.
    const dummy = Keypair.generate();
    await writeFile(
      path.join(homeDir, ".config", "solana", "id.json"),
      JSON.stringify(Array.from(dummy.secretKey)),
      { mode: 0o600 },
    ).catch(() => {});
  }

  private async copyCanonicalLock(projectDir: string): Promise<void> {
    const lock = envStr("CANONICAL_ANCHOR_LOCK", "/usr/local/cargo/canonical-anchor.lock");
    try {
      const data = await readFile(lock);
      await writeFile(path.join(projectDir, "Cargo.lock"), data);
    } catch {
      /* No canonical lock (local dev). Cargo resolves from the offline registry. */
    }
  }

  private async readCache(
    cacheKey: string,
    programId: string,
  ): Promise<Omit<BuildArtifact, "cached" | "cacheKey" | "durationMs" | "programId"> | null> {
    const dir = path.join(this.cacheDir, cacheKey);
    try {
      const meta = JSON.parse(await readFile(path.join(dir, "meta.json"), "utf8")) as {
        schema?: string;
        programId?: string;
        toolchainTag?: string;
      };
      if (meta.schema !== CACHE_SCHEMA || meta.programId !== programId || meta.toolchainTag !== toolchainTag()) {
        return null;
      }
      const [soBuf, idlRaw, logs] = await Promise.all([
        readFile(path.join(dir, "program.so")),
        readFile(path.join(dir, "idl.json"), "utf8").catch(() => ""),
        readFile(path.join(dir, "logs.txt"), "utf8").catch(() => ""),
      ]);
      if (soBuf.length === 0) return null;
      const now = new Date();
      await utimes(dir, now, now).catch(() => {});
      return {
        soBase64: soBuf.toString("base64"),
        idlJson: idlRaw ? JSON.parse(idlRaw) : undefined,
        logs: logs || "Cache hit: restored pre-compiled SBF binary and IDL.",
      };
    } catch {
      return null;
    }
  }

  private async writeCacheAtomic(
    dest: string,
    cacheKey: string,
    artifact: {
      so: Buffer;
      idlJson?: Record<string, unknown>;
      programId: string;
      programName: string;
      toolchainTag: string;
      logs: string;
    },
  ): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
    const tmp = path.join(this.cacheDir, `.tmp-${cacheKey}-${randomUUID()}`);
    try {
      await mkdir(tmp, { recursive: true });
      await Promise.all([
        writeFile(path.join(tmp, "program.so"), artifact.so),
        writeFile(
          path.join(tmp, "idl.json"),
          JSON.stringify(artifact.idlJson ?? {}, null, 2),
          "utf8",
        ),
        writeFile(path.join(tmp, "logs.txt"), artifact.logs, "utf8"),
        writeFile(
          path.join(tmp, "meta.json"),
          JSON.stringify({
            schema: CACHE_SCHEMA,
            cacheKey,
            programName: artifact.programName,
            programId: artifact.programId,
            toolchainTag: artifact.toolchainTag,
            createdAt: new Date().toISOString(),
          }),
          "utf8",
        ),
      ]);
      try {
        await rename(tmp, dest);
      } catch {
        // Another request won the race; keep the existing entry.
        await rm(tmp, { recursive: true, force: true }).catch(() => {});
      }
    } catch (err) {
      await rm(tmp, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
  }

  private async pruneCache(): Promise<void> {
    const maxEntries = envInt("BUILD_CACHE_MAX_ENTRIES", 200, 1, 10_000);
    let names: string[];
    try {
      names = (await readdir(this.cacheDir)).filter((n) => !n.startsWith("."));
    } catch {
      return;
    }
    if (names.length <= maxEntries) return;
    const stats = await Promise.all(
      names.map(async (name) => {
        try {
          return { name, mtime: (await stat(path.join(this.cacheDir, name))).mtimeMs };
        } catch {
          return { name, mtime: 0 };
        }
      }),
    );
    stats.sort((a, b) => a.mtime - b.mtime);
    for (const entry of stats.slice(0, stats.length - maxEntries)) {
      await rm(path.join(this.cacheDir, entry.name), { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function symlinkAsset(target: string, linkPath: string): Promise<void> {
  try {
    await mkdir(path.dirname(linkPath), { recursive: true });
    await symlink(target, linkPath, "dir");
  } catch {
    /* target absent or link exists — non-fatal */
  }
}

export const buildService = new SandboxedBuildService();

export async function runBuild(req: BuildRequest): Promise<BuildResult> {
  const validationError = validateRequest(req);
  if (validationError) {
    return { success: false, logs: "", error: validationError, code: "INVALID_REQUEST" };
  }

  const files: Record<string, string> = {};
  for (const f of req.files as FileInput[]) files[f.path] = f.content;

  try {
    const artifact = await buildService.build({
      files,
      programName: req.programName,
      programId: req.programId,
    });
    return {
      success: true,
      logs: artifact.logs,
      program: artifact.soBase64,
      idl: artifact.idlJson,
      programId: artifact.programId,
      programKeypair: artifact.programKeypairBase64,
      cached: artifact.cached,
      cacheKey: artifact.cacheKey,
      durationMs: artifact.durationMs,
    };
  } catch (err) {
    const e = err as Error & { code?: string; retryAfterSec?: number; logs?: string };
    if (e.code === "BUILD_QUEUE_FULL") {
      return {
        success: false,
        logs: "",
        error: e.message,
        code: e.code,
        retryAfterSec: e.retryAfterSec ?? 10,
      };
    }
    return {
      success: false,
      logs: e.logs || "",
      error: e.message || String(err),
      code: e.code || "BUILD_FAILED",
      durationMs: undefined,
    };
  }
}

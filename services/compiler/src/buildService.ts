import { execSync } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { BuildRequest, BuildResult } from "./types";
import { anchorToml, workspaceCargoToml, programCargoToml } from "./templates";

const BUILD_ROOT = process.env.BUILD_ROOT || "/tmp/solshift-builds";
const CARGO_TARGET_DIR = path.join(BUILD_ROOT, "cargo-target");
const BUILD_TIMEOUT_MS = Number(process.env.BUILD_TIMEOUT_MS || 300_000);
const MAX_FILES = 40;
const MAX_FILE_BYTES = 200_000;

const VALID_PROGRAM_NAME = /^[a-z][a-z0-9_-]{1,63}$/;

function isSafeRelativePath(p: string): boolean {
  if (path.isAbsolute(p)) return false;
  const normalized = path.normalize(p);
  if (normalized.startsWith("..") || normalized.includes(`..${path.sep}`)) return false;
  return true;
}

export function validateRequest(req: BuildRequest): string | null {
  if (!req.programName || !VALID_PROGRAM_NAME.test(req.programName)) {
    return "programName must be lowercase snake_case, 2-64 chars (e.g. 'my_counter')";
  }
  if (!Array.isArray(req.files) || req.files.length === 0) {
    return "files must be a non-empty array";
  }
  if (req.files.length > MAX_FILES) {
    return `too many files (max ${MAX_FILES})`;
  }
  for (const f of req.files) {
    if (!f.path || !isSafeRelativePath(f.path)) {
      return `invalid file path: ${f.path}`;
    }
    if (Buffer.byteLength(f.content || "", "utf8") > MAX_FILE_BYTES) {
      return `file too large: ${f.path}`;
    }
  }
  return null;
}

function runLocal(cmd: string, cwd: string, timeoutMs: number): { code: number; output: string } {
  try {
    const output = execSync(cmd, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 100 * 1024 * 1024,
      encoding: "utf8",
      killSignal: "SIGKILL",
    });
    return { code: 0, output: output || "" };
  } catch (err: any) {
    return {
      code: err.status ?? -1,
      output: (err.stdout || "") + (err.stderr || ""),
    };
  }
}

export async function runBuild(req: BuildRequest): Promise<BuildResult> {
  const validationError = validateRequest(req);
  if (validationError) {
    return { success: false, logs: "", error: validationError };
  }

  const jobId = uuidv4();
  const pkgName = req.programName.replace(/-/g, "_");
  let logs = "";

  try {
    const projectDir = path.join(BUILD_ROOT, jobId);
    const programDir = path.join(projectDir, "programs", req.programName);
    const srcDir = path.join(programDir, "src");
    await fs.mkdir(srcDir, { recursive: true });
    await fs.mkdir(CARGO_TARGET_DIR, { recursive: true });

    for (const file of req.files) {
      const dest = path.join(srcDir, file.path);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, file.content, "utf8");
    }

    await fs.writeFile(path.join(projectDir, "Anchor.toml"), anchorToml(req.programName));
    await fs.writeFile(path.join(projectDir, "Cargo.toml"), workspaceCargoToml());
    await fs.writeFile(path.join(programDir, "Cargo.toml"), programCargoToml(req.programName));

    logs += `[solshift] scaffolded project at ${projectDir}\n`;

    // Copy pre-built lockfile
    const lockfileSrc = "/opt/anchor-lockfile";
    try {
      await fs.copyFile(lockfileSrc, path.join(projectDir, "Cargo.lock"));
      logs += `[solshift] copied lockfile\n`;
    } catch {
      logs += `[solshift] no pre-built lockfile, will generate from scratch\n`;
    }

    // Generate lockfile
    logs += "=== generate-lockfile ===\n";
    const genResult = runLocal("cargo generate-lockfile --offline 2>&1", projectDir, 120_000);
    logs += genResult.output;

    // Downgrade lockfile v4 → v3
    logs += "=== downgrade lockfile ===\n";
    const downgradeResult = runLocal("sed -i 's/^version = 4$/version = 3/' Cargo.lock && head -5 Cargo.lock", projectDir, 10_000);
    logs += downgradeResult.output;

    // Build (use persistent CARGO_TARGET_DIR for incremental compilation)
    logs += "=== build-sbf ===\n";
    const buildResult = runLocal(
      `CARGO_TARGET_DIR=${CARGO_TARGET_DIR} cargo build-sbf -- --offline 2>&1`,
      projectDir,
      BUILD_TIMEOUT_MS,
    );
    logs += buildResult.output;

    if (buildResult.code !== 0) {
      return { success: false, logs, error: `build exited with code ${buildResult.code}` };
    }

    // Read artifacts (from persistent CARGO_TARGET_DIR)
    const soPath = path.join(CARGO_TARGET_DIR, "deploy", `${pkgName}.so`);
    const kpPath = path.join(CARGO_TARGET_DIR, "deploy", `${pkgName}-keypair.json`);

    const soBuf = await fs.readFile(soPath);
    let idl: any = undefined;
    let programId: string | undefined;
    let programKeypair: string | undefined;

    try {
      const kpBuf = JSON.parse(await fs.readFile(kpPath, "utf8")) as number[];
      const keypairBytes = Buffer.from(kpBuf);
      programKeypair = keypairBytes.toString("base64");
      const secretHex = keypairBytes.toString("hex");
      const tmpHex = path.join(projectDir, ".secret.hex");
      await fs.writeFile(tmpHex, secretHex);
      const pkResult = runLocal(
        `solana-keygen pubkey ${tmpHex} 2>&1`,
        projectDir,
        10_000,
      );
      if (pkResult.code === 0) programId = pkResult.output.trim();
    } catch {}

    return { success: true, logs, program: soBuf.toString("base64"), idl, programId, programKeypair };
  } catch (err: any) {
    return { success: false, logs, error: err?.message || String(err) };
  } finally {
    fs.rm(path.join(BUILD_ROOT, jobId), { recursive: true, force: true }).catch(() => {});
  }
}

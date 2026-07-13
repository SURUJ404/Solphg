import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { BuildRequest, BuildResult } from "./types";
import { anchorToml, workspaceCargoToml, programCargoToml } from "./templates";

const BUILD_ROOT = process.env.BUILD_ROOT || "/tmp/solshift-builds";
const BUILD_TIMEOUT_MS = Number(process.env.BUILD_TIMEOUT_MS || 180_000);
const MAX_FILES = 40;
const MAX_FILE_BYTES = 200_000;

const VALID_PROGRAM_NAME = /^[a-z][a-z0-9_]{1,63}$/;

function isSafeRelativePath(p: string): boolean {
  // Reject absolute paths, parent traversal, and anything that isn't a plain relative path
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

function runCommand(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: process.env });
    let output = "";
    const timer = setTimeout(() => {
      output += `\n[solshift] build timed out after ${timeoutMs}ms, killing process\n`;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (d) => (output += d.toString()));
    child.stderr.on("data", (d) => (output += d.toString()));

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, output });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      output += `\n[solshift] failed to start process: ${err.message}\n`;
      resolve({ code: -1, output });
    });
  });
}

export async function runBuild(req: BuildRequest): Promise<BuildResult> {
  const validationError = validateRequest(req);
  if (validationError) {
    return { success: false, logs: "", error: validationError };
  }

  const jobId = uuidv4();
  const projectDir = path.join(BUILD_ROOT, jobId);
  const programDir = path.join(projectDir, "programs", req.programName);

  let logs = "";

  try {
    // Write user-provided files relative to the workspace root
    for (const file of req.files) {
      const dest = path.join(projectDir, file.path);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, file.content, "utf8");
    }

    // Scaffold generated files, overwriting any user-provided equivalents
    await fs.writeFile(path.join(projectDir, "Anchor.toml"), anchorToml(req.programName));
    await fs.writeFile(path.join(projectDir, "Cargo.toml"), workspaceCargoToml());
    await fs.writeFile(path.join(programDir, "Cargo.toml"), programCargoToml(req.programName));

    logs += `[solshift] scaffolded project at ${projectDir}\n`;

    // Copy pre-generated Cargo.lock to pin deps to versions compatible with our Rust toolchain
    const lockfile = "/opt/anchor-lockfile";
    try {
      await fs.access(lockfile);
      await fs.copyFile(lockfile, path.join(projectDir, "Cargo.lock"));
    } catch { /* lockfile not found; proceed without it */ }

    logs += `[solshift] running anchor build...\n`;
    const { code, output } = await runCommand("anchor", ["build"], projectDir, BUILD_TIMEOUT_MS);
    logs += output;

    if (code !== 0) {
      return { success: false, logs, error: `anchor build exited with code ${code}` };
    }

    const soPath = path.join(projectDir, "target", "deploy", `${req.programName}.so`);
    const idlPath = path.join(projectDir, "target", "idl", `${req.programName}.json`);
    const keypairPath = path.join(projectDir, "target", "deploy", `${req.programName}-keypair.json`);

    const [soBuf, idlRaw] = await Promise.all([fs.readFile(soPath), fs.readFile(idlPath, "utf8")]);

    let programId: string | undefined;
    const keypairExists = await fs
      .access(keypairPath)
      .then(() => true)
      .catch(() => false);
    if (keypairExists) {
      const { code: pkCode, output: pkOutput } = await runCommand(
        "solana-keygen",
        ["pubkey", keypairPath],
        projectDir,
        10_000
      );
      if (pkCode === 0) programId = pkOutput.trim();
    }

    return {
      success: true,
      logs,
      program: soBuf.toString("base64"),
      idl: JSON.parse(idlRaw),
      programId,
    };
  } catch (err: any) {
    return { success: false, logs, error: err?.message || String(err) };
  } finally {
    // Best-effort cleanup; don't fail the request if this errors
    fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
  }
}

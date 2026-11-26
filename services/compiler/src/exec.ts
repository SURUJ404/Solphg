import { spawn } from "node:child_process";

// Allowlist for CLI child processes. Never inherit the API process env: it
// contains FAUCET_SECRET_KEY, ADMIN_TOKEN and RPC credentials.
const SAFE_ENV_KEYS = [
  "PATH",
  "HOME",
  "LANG",
  "LC_ALL",
  "TZ",
  "SystemRoot",
  "ComSpec",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "TEMP",
  "TMP",
] as const;

export function toolEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const key of SAFE_ENV_KEYS) {
    if (env[key] !== undefined) out[key] = env[key];
  }
  return out;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface RunOptions {
  cwd?: string;
  timeoutMs?: number;
  maxBuffer?: number;
  env?: NodeJS.ProcessEnv;
}

export function killProcessTree(pid: number): void {
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

/**
 * Run an executable with an argument array. Never uses a shell, so values such
 * as addresses, cluster URLs and paths cannot be interpreted as commands.
 */
export function runFile(command: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxBuffer = options.maxBuffer ?? 5 * 1024 * 1024;

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? toolEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const finish = (result: RunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child.pid ?? 0);
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* already gone */
        }
      }, 250).unref?.();
    }, timeoutMs);

    const append = (target: "out" | "err", chunk: Buffer) => {
      if (target === "out") stdout += chunk.toString("utf8");
      else stderr += chunk.toString("utf8");
      if (stdout.length + stderr.length > maxBuffer) {
        killProcessTree(child.pid ?? 0);
        finish({ code: -1, stdout, stderr: `${stderr}\n[output exceeded ${maxBuffer} bytes]`, timedOut });
      }
    };

    child.stdout?.on("data", (c: Buffer) => append("out", c));
    child.stderr?.on("data", (c: Buffer) => append("err", c));
    child.on("error", (err) => {
      finish({ code: -1, stdout, stderr: err.message, timedOut: false });
    });
    child.on("close", (code) => {
      finish({ code: code ?? -1, stdout, stderr, timedOut });
    });
  });
}

export async function runFileOrThrow(command: string, args: string[], options: RunOptions = {}): Promise<string> {
  const result = await runFile(command, args, options);
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout).trim().slice(0, 2000);
    throw new Error(`${command} ${args[0] ?? ""} failed (${result.code}): ${detail || "no output"}`);
  }
  return result.stdout.trim();
}

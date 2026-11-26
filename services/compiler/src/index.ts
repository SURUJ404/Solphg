import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { randomUUID } from "crypto";
import { spawn, ChildProcess } from "child_process";
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { buildService, runBuild } from "./buildService";
import { BuildRequest } from "./types";
import { parseCpiLogs, parseCpuProfileLogs } from "./log-parsers";
import type { CpiNode } from "./log-parsers";
import { loadConfig, AppConfig } from "./config";
import { log, redactText } from "./logger";
import { metrics } from "./metrics";
import { killProcessTree, runFile } from "./exec";
import { createFaucetLedger, FaucetLedger } from "./faucet";
import { IpQuota } from "./quota";
import {
  Cluster,
  MAX_IDL_BYTES,
  MAX_LOGS_CHARS,
  MAX_SO_BYTES,
  decodeBase64Bounded,
  firstErrorLine,
  isCluster,
  isValidAddress,
  isValidSecretHex,
  parseSolAmount,
  resolveRpc,
  safeTokenEqual,
} from "./security";

// Fail fast on invalid configuration before the server accepts traffic.
let config: AppConfig;
try {
  config = loadConfig();
} catch (err) {
  log.error("invalid configuration", { error: (err as Error).message });
  process.exit(1);
}

process.umask(0o077);

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", config.trustProxyHops);

const faucetLedger: FaucetLedger = createFaucetLedger(config);

const versions = { anchor: "unknown", solana: "unknown", rust: "unknown" };

async function probeVersions(): Promise<void> {
  const [anchor, solana] = await Promise.all([
    runFile("anchor", ["--version"], { timeoutMs: 10_000 }),
    runFile("solana", ["--version"], { timeoutMs: 10_000 }),
  ]);
  if (anchor.code === 0) versions.anchor = anchor.stdout.trim();
  if (solana.code === 0) versions.solana = solana.stdout.trim();
  const rustc = await runFile("rustc", ["--version"], { timeoutMs: 10_000 });
  if (rustc.code === 0) versions.rust = rustc.stdout.trim();
}

function requestId(req: Request): string {
  const incoming = req.header("x-request-id");
  if (incoming && /^[a-zA-Z0-9._-]{1,100}$/.test(incoming)) return incoming;
  return randomUUID();
}

app.use((req: Request, res: Response, next: NextFunction) => {
  const id = requestId(req);
  (req as Request & { id: string }).id = id;
  res.setHeader("x-request-id", id);
  const start = performance.now();
  res.on("finish", () => {
    log.info("request", {
      requestId: id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round(performance.now() - start),
      ip: req.ip,
    });
  });
  next();
});

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      callback(null, config.corsOrigins.includes(origin));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Request-Id", "X-Admin-Token", "X-Confirm-Mainnet"],
    maxAge: 600,
  }),
);

app.use(express.json({ limit: config.bodyLimit }));

app.use((err: Error & { status?: number; type?: string }, req: Request, res: Response, next: NextFunction) => {
  if (err?.type === "entity.too.large" || err?.status === 413) {
    return res.status(413).json({ error: "request body too large" });
  }
  if (err instanceof SyntaxError) {
    return res.status(400).json({ error: "invalid JSON body" });
  }
  return next(err);
});

function limiter(limit: number, name: string) {
  return rateLimit({
    windowMs: config.rateLimits.windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => req.ip ?? "unknown",
    handler: (req, res) => {
      log.warn("rate limited", { limiter: name, ip: req.ip, path: req.path });
      res.status(429).json({
        error: "Too many requests. Try again later.",
        code: "RATE_LIMITED",
      });
    },
  });
}

const globalLimiter = limiter(config.rateLimits.global, "global");
const buildLimiter = limiter(config.rateLimits.build, "build");
const deployLimiter = limiter(config.rateLimits.deploy, "deploy");
const airdropLimiter = limiter(config.rateLimits.airdrop, "airdrop");
const writeLimiter = limiter(config.rateLimits.write, "write");

app.use("/api", globalLimiter);

// Concurrency gate for non-build operations that touch RPC/CLI.
const opSem = { count: 0, max: config.maxConcurrentOps };
function acquireOp(): boolean {
  if (opSem.count >= opSem.max) return false;
  opSem.count++;
  return true;
}
function releaseOp(): void {
  opSem.count--;
}

function sendError(res: Response, status: number, message: string, code?: string): void {
  res.status(status).json({ error: redactText(message), ...(code ? { code } : {}) });
}

// Hourly per-IP allowances on the two expensive endpoints. The short-window
// limiter above stops bursts; this stops a single IP from living just under it.
const ipQuota = new IpQuota(config.quotaWindowMs);
function quotaGuard(action: "build" | "deploy", limit: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const decision = ipQuota.check(req.ip ?? "unknown", action, limit);
    res.setHeader("X-RateLimit-Limit", String(decision.limit));
    res.setHeader("X-RateLimit-Remaining", String(decision.remaining));
    if (!decision.ok) {
      res.setHeader("Retry-After", String(decision.retryAfterSec ?? 60));
      log.warn("quota exceeded", { action, ip: req.ip });
      sendError(res, 429, "Hourly quota exceeded for this IP. Try again later.", "QUOTA_EXCEEDED");
      return;
    }
    next();
  };
}

function faucetKeypair(): Keypair | null {
  if (!config.faucet.secretHex) return null;
  try {
    return Keypair.fromSecretKey(Uint8Array.from(Buffer.from(config.faucet.secretHex, "hex")));
  } catch {
    log.error("FAUCET_SECRET_KEY is not a valid ed25519 secret key");
    return null;
  }
}

const faucetAddress: string =
  config.faucet.address || faucetKeypair()?.publicKey.toBase58() || "";

function parseCluster(value: unknown): Cluster | null {
  if (value === undefined || value === null || value === "") return "devnet";
  return isCluster(value) ? value : null;
}

async function tmpDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), `solphg-${prefix}-`));
}

async function writePrivate(file: string, data: string | Buffer): Promise<void> {
  await fs.writeFile(file, data, { mode: 0o600 });
}

// ---------------------------------------------------------------------------
// Health & metrics
// ---------------------------------------------------------------------------

app.get("/api/health", async (_req: Request, res: Response) => {
  const cache = await buildService.getStats();
  res.json({
    status: "ok",
    version: process.env.npm_package_version || "0.1.0",
    uptimeSec: Math.round(process.uptime()),
    activeBuilds: buildService.queueDepth,
    queueDepth: buildService.queueDepth,
    maxConcurrentBuilds: buildService.maxConcurrentBuilds,
    cache,
    toolchain: {
      ...versions,
      toolchainTag: config.toolchainTag,
    },
    faucet: faucetLedger.snapshot(),
    queue: { implementation: "in-memory" },
  });
});

app.get("/api/metrics", async (_req: Request, res: Response) => {
  const cache = await buildService.getStats();
  res.json({
    ...metrics.snapshot(),
    queueDepth: buildService.queueDepth,
    maxConcurrentBuilds: buildService.maxConcurrentBuilds,
    cache,
    opsInFlight: opSem.count,
  });
});

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

app.post("/api/build", buildLimiter, quotaGuard("build", config.quotas.build), async (req: Request, res: Response) => {
  const body = req.body as BuildRequest;
  const started = performance.now();
  try {
    const result = await runBuild(body);
    const durationMs = result.durationMs ?? Math.round(performance.now() - started);
    metrics.recordBuild({ durationMs, cached: Boolean(result.cached), success: result.success });
    if (!result.success) metrics.recordError(result.code || "BUILD_FAILED");

    if (!result.success && result.code === "BUILD_QUEUE_FULL") {
      res.setHeader("Retry-After", String(result.retryAfterSec ?? 10));
      return res.status(429).json(result);
    }
    const status = result.success
      ? 200
      : result.code === "INVALID_REQUEST"
        ? 400
        : result.code === "BUILD_TIMEOUT"
          ? 504
          : 422;
    res.status(status).json(result);
  } catch (err) {
    metrics.recordError("BUILD_INTERNAL");
    log.error("build failed", { error: (err as Error).message, requestId: (req as any).id });
    sendError(res, 500, "internal build error", "BUILD_INTERNAL");
  }
});

// ---------------------------------------------------------------------------
// Airdrop
// ---------------------------------------------------------------------------

function extractSignature(output: string): string | null {
  const match = output.match(/Signature:\s*([1-9A-HJ-NP-Za-km-z]{32,})/);
  return match ? match[1] : null;
}

async function solanaAirdrop(rpcUrl: string, address: string, sol: number): Promise<string | null> {
  const result = await runFile(
    "solana",
    ["airdrop", String(sol), address, "--url", rpcUrl],
    { timeoutMs: 20_000 },
  );
  if (result.code !== 0) return null;
  return extractSignature(`${result.stdout}\n${result.stderr}`) || result.stdout.trim() || null;
}

async function web3Airdrop(rpcUrl: string, address: string, sol: number): Promise<string | null> {
  try {
    const connection = new Connection(rpcUrl, "confirmed");
    const pubkey = new PublicKey(address);
    const lamports = Math.round(sol * 1e9);
    const sig = await Promise.race([
      connection.requestAirdrop(pubkey, lamports),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 20_000)),
    ]);
    await Promise.race([
      connection.confirmTransaction(sig, "confirmed"),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 20_000)),
    ]);
    return sig;
  } catch {
    return null;
  }
}

app.post("/api/airdrop", airdropLimiter, async (req: Request, res: Response) => {
  if (!acquireOp()) {
    res.setHeader("Retry-After", "5");
    return sendError(res, 429, "airdrop service busy, retry shortly", "OPS_BUSY");
  }
  const { address, amount, cluster } = req.body as {
    address?: string;
    amount?: number;
    cluster?: string;
  };
  if (!isValidAddress(address)) {
    releaseOp();
    return sendError(res, 400, "address must be a valid Solana public key", "INVALID_ADDRESS");
  }
  if (cluster && cluster !== "devnet") {
    releaseOp();
    return sendError(res, 400, "airdrops are only available on devnet", "INVALID_CLUSTER");
  }
  const sol = parseSolAmount(amount ?? 2, config.faucet.maxSolPerRequest);
  if (sol === null) {
    releaseOp();
    return sendError(
      res,
      400,
      `amount must be greater than 0 and at most ${config.faucet.maxSolPerRequest} SOL`,
      "INVALID_AMOUNT",
    );
  }

  const dir = await tmpDir("airdrop");
  try {
    const kp = faucetKeypair();
    let lastError = "";

    if (kp) {
      const reservation = await faucetLedger.reserve(address, Math.round(sol * 1e9));
      if (!reservation.ok) {
        res.setHeader("Retry-After", String(reservation.retryAfterSec ?? 60));
        return sendError(res, 429, reservation.reason || "faucet cooldown", "FAUCET_COOLDOWN");
      }
      const faucetPath = path.join(dir, "faucet.json");
      await writePrivate(faucetPath, JSON.stringify(Array.from(kp.secretKey)));
      const transfer = await runFile(
        "solana",
        [
          "transfer",
          "--allow-unfunded-recipient",
          "--url",
          config.devnetRpcUrl,
          "--keypair",
          faucetPath,
          address,
          String(sol),
        ],
        { cwd: dir, timeoutMs: 60_000 },
      );
      if (transfer.code === 0) {
        const signature = extractSignature(`${transfer.stdout}\n${transfer.stderr}`) || transfer.stdout.trim();
        return res.json({ signature, source: "faucet", amountSol: sol });
      }
      // The faucet transfer did not happen; release the reservation.
      await faucetLedger.refund(address, Math.round(sol * 1e9));
      lastError = firstErrorLine(transfer.stderr, transfer.stdout);
    }

    const rpcs = Array.from(new Set([config.devnetRpcUrl, "https://api.devnet.solana.com"])).sort(
      () => Math.random() - 0.5,
    );
    const deadline = Date.now() + 25_000;
    for (const rpcUrl of rpcs) {
      if (Date.now() > deadline) break;
      const cliSig = await solanaAirdrop(rpcUrl, address, sol);
      if (cliSig) return res.json({ signature: cliSig, source: "rpc-cli", amountSol: sol });
      if (Date.now() > deadline) break;
      const webSig = await web3Airdrop(rpcUrl, address, sol);
      if (webSig) return res.json({ signature: webSig, source: "rpc-web3", amountSol: sol });
    }

    const hint = faucetAddress
      ? `Faucet wallet ${faucetAddress} is low or all RPC endpoints are rate-limited. Fund it at https://faucet.solana.com and retry.`
      : "Set FAUCET_SECRET_KEY with a funded devnet keypair, or fund a wallet at https://faucet.solana.com.";
    sendError(res, 503, `${lastError || "airdrop failed"}. ${hint}`, "AIRDROP_FAILED");
  } catch (err) {
    log.error("airdrop failed", { error: (err as Error).message, requestId: (req as any).id });
    sendError(res, 500, "airdrop failed", "AIRDROP_INTERNAL");
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    releaseOp();
  }
});

app.post("/api/faucet-fund", writeLimiter, async (req: Request, res: Response) => {
  if (!config.adminToken) {
    return sendError(res, 503, "faucet bootstrap is disabled", "DISABLED");
  }
  if (!safeTokenEqual(req.header("x-admin-token") || "", config.adminToken)) {
    return sendError(res, 401, "unauthorized", "UNAUTHORIZED");
  }
  if (!faucetAddress) {
    return sendError(res, 400, "set FAUCET_ADDRESS or FAUCET_SECRET_KEY first", "NO_FAUCET");
  }
  if (!acquireOp()) {
    res.setHeader("Retry-After", "5");
    return sendError(res, 429, "service busy", "OPS_BUSY");
  }
  const dir = await tmpDir("faucet-fund");
  try {
    const funded = Keypair.generate();
    const kpPath = path.join(dir, "fresh.json");
    await writePrivate(kpPath, JSON.stringify(Array.from(funded.secretKey)));
    const addr = funded.publicKey.toBase58();

    const rpcs = Array.from(new Set([config.devnetRpcUrl, "https://api.devnet.solana.com"])).sort(
      () => Math.random() - 0.5,
    );
    for (const rpc of rpcs) {
      const sig = await solanaAirdrop(rpc, addr, 2);
      if (!sig) continue;
      const transfer = await runFile(
        "solana",
        [
          "transfer",
          "--allow-unfunded-recipient",
          "--url",
          rpc,
          "--keypair",
          kpPath,
          faucetAddress,
          "1.9",
        ],
        { cwd: dir, timeoutMs: 30_000 },
      );
      if (transfer.code !== 0) continue;
      const balance = await runFile("solana", ["balance", faucetAddress, "--url", rpc], {
        timeoutMs: 10_000,
      });
      return res.json({
        success: true,
        faucetAddress,
        faucetBalance: balance.stdout.trim(),
        message: "Faucet wallet funded.",
      });
    }
    sendError(res, 503, "all RPC endpoints rate-limited; try again later", "FAUCET_FUND_FAILED");
  } catch (err) {
    log.error("faucet bootstrap failed", { error: (err as Error).message });
    sendError(res, 500, "faucet bootstrap failed", "FAUCET_FUND_INTERNAL");
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    releaseOp();
  }
});

// ---------------------------------------------------------------------------
// Balance
// ---------------------------------------------------------------------------

app.get("/api/balance/:address", async (req: Request, res: Response) => {
  const address = req.params.address;
  if (!isValidAddress(address)) return sendError(res, 400, "invalid address", "INVALID_ADDRESS");
  const cluster = parseCluster(req.query.cluster);
  if (!cluster) return sendError(res, 400, "unknown cluster", "INVALID_CLUSTER");
  const rpcUrl = resolveRpc(cluster, config);

  const cli = await runFile("solana", ["balance", address, "--url", rpcUrl], { timeoutMs: 10_000 });
  if (cli.code === 0) {
    const num = parseFloat(cli.stdout.replace(" SOL", "").trim());
    return res.json({ balance: Number.isFinite(num) ? num : 0, cluster });
  }
  try {
    const connection = new Connection(rpcUrl, "confirmed");
    const lamports = await connection.getBalance(new PublicKey(address));
    return res.json({ balance: lamports / 1e9, cluster });
  } catch {
    return sendError(res, 502, firstErrorLine(cli.stderr, cli.stdout), "BALANCE_FAILED");
  }
});

// ---------------------------------------------------------------------------
// Simulate (no key material written to disk)
// ---------------------------------------------------------------------------

function parseSecret(value: unknown): Keypair | null {
  if (!isValidSecretHex(value)) return null;
  try {
    return Keypair.fromSecretKey(Uint8Array.from(Buffer.from(value, "hex")));
  } catch {
    return null;
  }
}

function parseProgramKeypair(value: unknown): Keypair | null {
  const buf = decodeBase64Bounded(value, 128);
  if (!buf || buf.length !== 64) return null;
  try {
    return Keypair.fromSecretKey(Uint8Array.from(buf));
  } catch {
    return null;
  }
}

app.post("/api/simulate", writeLimiter, async (req: Request, res: Response) => {
  if (!acquireOp()) {
    res.setHeader("Retry-After", "5");
    return sendError(res, 429, "service busy", "OPS_BUSY");
  }
  try {
    const { bytecodeBase64, programKeypair, authoritySecretKey } = req.body as Record<string, unknown>;
    const authority = parseSecret(authoritySecretKey);
    if (!authority) {
      return sendError(res, 400, "authoritySecretKey must be 64 bytes of hex", "INVALID_SECRET");
    }
    if (programKeypair !== undefined && programKeypair !== null && !parseProgramKeypair(programKeypair)) {
      return sendError(res, 400, "programKeypair must be base64-encoded 64-byte keypair", "INVALID_KEYPAIR");
    }
    const soBytes = decodeBase64Bounded(bytecodeBase64, MAX_SO_BYTES);
    if (!soBytes) return sendError(res, 400, "bytecodeBase64 is missing or too large", "INVALID_BYTECODE");

    const cluster = parseCluster(req.body.cluster);
    if (!cluster) return sendError(res, 400, "unknown cluster", "INVALID_CLUSTER");
    const rpcUrl = resolveRpc(cluster, config);
    const connection = new Connection(rpcUrl, "confirmed");

    let balance = 0;
    try {
      balance = (await connection.getBalance(authority.publicKey)) / 1e9;
    } catch {
      /* treated as zero */
    }

    const programId = programKeypair ? parseProgramKeypair(programKeypair)!.publicKey.toBase58() : null;
    let programExists = false;
    if (programId) {
      try {
        const info = await connection.getAccountInfo(new PublicKey(programId));
        programExists = Boolean(info);
      } catch {
        /* not found */
      }
    }

    const bytecodeSize = soBytes.length;
    const programAccountBytes = 100 + bytecodeSize;
    const estimatedRent = Math.ceil(programAccountBytes / 1024) * 0.0035;
    const txFee = 0.00001;
    const totalCost = estimatedRent + txFee;

    res.json({
      success: true,
      cluster,
      programId,
      bytecodeSize,
      estimatedRentSol: Math.round(estimatedRent * 1e6) / 1e6,
      authorityBalance: balance,
      hasSufficientBalance: balance >= totalCost,
      programExists,
      output: [
        `Bytecode size: ${(bytecodeSize / 1024).toFixed(1)} KB`,
        `Est. rent-exempt balance: ${estimatedRent.toFixed(6)} SOL`,
        `Authority balance: ${balance.toFixed(4)} SOL`,
        programExists ? "⚠ Program ID already exists — will upgrade" : "✓ Program ID is available",
        balance >= totalCost ? "✓ Sufficient balance" : `⚠ Need ~${totalCost.toFixed(6)} SOL for deploy`,
      ].join("\n"),
    });
  } catch (err) {
    log.error("simulate failed", { error: (err as Error).message });
    sendError(res, 500, "simulation failed", "SIMULATE_INTERNAL");
  } finally {
    releaseOp();
  }
});

// ---------------------------------------------------------------------------
// Local validator helpers (disabled unless ENABLE_LOCAL_VALIDATOR=true)
// ---------------------------------------------------------------------------

interface ValidatorHandle {
  child: ChildProcess;
  rpcUrl: string;
}

async function startLocalValidator(ledgerDir: string): Promise<ValidatorHandle | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const rpcPort = 20_000 + Math.floor(Math.random() * 20_000);
    const rpcUrl = `http://127.0.0.1:${rpcPort}`;
    const child = spawn(
      "solana-test-validator",
      [
        "--reset",
        "--quiet",
        "--ledger",
        ledgerDir,
        "--rpc-port",
        String(rpcPort),
        "--faucet-port",
        "0",
        "--no-bpf-jit",
      ],
      { stdio: "ignore", detached: process.platform !== "win32", windowsHide: true },
    );
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const probe = await runFile("solana", ["cluster-version", "--url", rpcUrl], { timeoutMs: 3_000 });
      if (probe.code === 0) return { child, rpcUrl };
      if (child.exitCode !== null) break;
    }
    killProcessTree(child.pid ?? 0);
  }
  return null;
}

function stopValidator(handle: ValidatorHandle | null): void {
  if (handle?.child.pid) killProcessTree(handle.child.pid);
}

// ---------------------------------------------------------------------------
// CPI debug
// ---------------------------------------------------------------------------

app.post("/api/debug-cpi", writeLimiter, async (req: Request, res: Response) => {
  const { bytecodeBase64, rawLogs: inputLogs } = req.body as Record<string, unknown>;

  if (typeof inputLogs === "string" && inputLogs.length > 0) {
    if (inputLogs.length > MAX_LOGS_CHARS) {
      return sendError(res, 400, `rawLogs must be at most ${MAX_LOGS_CHARS} characters`, "LOGS_TOO_LARGE");
    }
    const parsedTree = parseCpiLogs(inputLogs);
    const allSuccess = parsedTree.length === 0 || parsedTree.every((n) => n.success);
    return res.json({
      success: allSuccess,
      cpiTree: parsedTree,
      rawLogs: inputLogs.slice(0, 5000),
      summary: { totalCpis: parsedTree.length, computeUnits: "varies (depends on transaction)" },
    });
  }

  if (!config.enableLocalValidator) {
    return res.json({
      success: true,
      programId: null,
      cpiTree: [],
      rawLogs:
        "Automatic CPI tracing is disabled on this deployment. Use the 'Paste Raw Logs' feature with output from `solana simulate`.",
      summary: { totalCpis: 0, computeUnits: "N/A" },
      note: "ENABLE_LOCAL_VALIDATOR is false.",
    });
  }

  const soBytes = decodeBase64Bounded(bytecodeBase64, MAX_SO_BYTES);
  if (!soBytes) return sendError(res, 400, "invalid bytecodeBase64", "INVALID_BYTECODE");

  const dir = await tmpDir("cpi");
  const ledger = await tmpDir("cpi-ledger");
  let validator: ValidatorHandle | null = null;
  try {
    const programPath = path.join(dir, "program.so");
    const programKpPath = path.join(dir, "program-kp.json");
    await writePrivate(programPath, soBytes);
    const programKp = Keypair.generate();
    await writePrivate(programKpPath, JSON.stringify(Array.from(programKp.secretKey)));
    const programId = programKp.publicKey.toBase58();

    validator = await startLocalValidator(ledger);
    if (!validator) {
      return res.json({
        success: true,
        programId,
        cpiTree: [],
        rawLogs: "solana-test-validator is not available in this environment.",
        summary: { totalCpis: 0, computeUnits: "N/A" },
      });
    }
    const deploy = await runFile(
      "solana",
      ["program", "deploy", programPath, "--program-id", programKpPath, "--url", validator.rpcUrl],
      { cwd: dir, timeoutMs: 60_000 },
    );
    if (deploy.code !== 0) {
      throw new Error(`deploy to local validator failed: ${firstErrorLine(deploy.stderr, deploy.stdout)}`);
    }
    const sim = await runFile(
      "solana",
      ["transfer", "--allow-unfunded-recipient", "--url", validator.rpcUrl, programId, "0.0001"],
      { timeoutMs: 30_000 },
    );
    const logText = `${sim.stdout}\n${sim.stderr}`;
    const parsedTree: CpiNode[] = parseCpiLogs(logText);
    res.json({
      success: parsedTree.every((n) => n.success),
      programId,
      cpiTree: parsedTree,
      rawLogs: logText.slice(0, 5000),
      summary: { totalCpis: parsedTree.length, computeUnits: "N/A (local validator)" },
    });
  } catch (err) {
    log.error("cpi trace failed", { error: (err as Error).message });
    sendError(res, 500, "CPI trace failed", "CPI_FAILED");
  } finally {
    stopValidator(validator);
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(ledger, { recursive: true, force: true }).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Deploy
// ---------------------------------------------------------------------------

app.post("/api/deploy", deployLimiter, quotaGuard("deploy", config.quotas.deploy), async (req: Request, res: Response) => {
  const { bytecodeBase64, programKeypair, authoritySecretKey, confirmMainnet } = req.body as Record<
    string,
    unknown
  >;
  const cluster = parseCluster(req.body.cluster);
  if (!cluster) return sendError(res, 400, "unknown cluster", "INVALID_CLUSTER");

  if (cluster === "mainnet-beta") {
    if (confirmMainnet !== true) {
      return sendError(
        res,
        400,
        "mainnet deployment requires confirmMainnet=true after reviewing cost and authority",
        "MAINNET_CONFIRMATION_REQUIRED",
      );
    }
  }

  if (!acquireOp()) {
    res.setHeader("Retry-After", "5");
    return sendError(res, 429, "deploy service busy", "OPS_BUSY");
  }

  const dir = await tmpDir("deploy");
  try {
    const authority = parseSecret(authoritySecretKey);
    if (!authority) {
      return sendError(
        res,
        400,
        "authoritySecretKey must be 64 bytes of hex. Browser wallets cannot sign deployments — generate or import a wallet.",
        "INVALID_SECRET",
      );
    }
    const soBytes = decodeBase64Bounded(bytecodeBase64, MAX_SO_BYTES);
    if (!soBytes) return sendError(res, 400, "invalid bytecodeBase64", "INVALID_BYTECODE");

    const programKp = programKeypair !== undefined && programKeypair !== null
      ? parseProgramKeypair(programKeypair)
      : null;
    if (programKeypair !== undefined && programKeypair !== null && !programKp) {
      return sendError(res, 400, "invalid programKeypair", "INVALID_KEYPAIR");
    }

    const authorityPath = path.join(dir, "authority.json");
    const programPath = path.join(dir, "program.so");
    const programKpPath = path.join(dir, "program-kp.json");
    await writePrivate(authorityPath, JSON.stringify(Array.from(authority.secretKey)));
    await writePrivate(programPath, soBytes);
    if (programKp) await writePrivate(programKpPath, JSON.stringify(Array.from(programKp.secretKey)));

    const rpcUrl = resolveRpc(cluster, config);
    const args = [
      "program",
      "deploy",
      programPath,
      "--keypair",
      authorityPath,
      "--url",
      rpcUrl,
    ];
    if (programKp) args.push("--program-id", programKpPath);

    const result = await runFile("solana", args, { cwd: dir, timeoutMs: 180_000 });
    if (result.code !== 0) {
      metrics.recordError("DEPLOY_FAILED");
      return sendError(res, 502, firstErrorLine(result.stderr, result.stdout), "DEPLOY_FAILED");
    }

    const output = `${result.stdout}\n${result.stderr}`;
    const progIdMatch = output.match(/Program Id:\s*([1-9A-HJ-NP-Za-km-z]{32,44})/);
    const programId = progIdMatch?.[1] ?? programKp?.publicKey.toBase58();
    res.json({
      signature: extractSignature(output) || result.stdout.trim(),
      programId,
      cluster,
      authority: authority.publicKey.toBase58(),
      bytecodeSize: soBytes.length,
    });
  } catch (err) {
    log.error("deploy failed", { error: (err as Error).message });
    sendError(res, 500, "deploy failed", "DEPLOY_INTERNAL");
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    releaseOp();
  }
});

// ---------------------------------------------------------------------------
// CU profiler (disabled unless ENABLE_LOCAL_VALIDATOR=true)
// ---------------------------------------------------------------------------

app.post("/api/profile", writeLimiter, async (req: Request, res: Response) => {
  if (!config.enableLocalValidator) {
    return res.json({
      success: false,
      totalCuConsumed: 0,
      cuCap: 1_400_000,
      programId: null,
      instructions: [],
      error: null,
      logs: [],
      note: "Automatic CU profiling is disabled. Set ENABLE_LOCAL_VALIDATOR=true or paste simulation logs in CPI Debug.",
    });
  }
  const { bytecodeBase64, programKeypair, authoritySecretKey, instructionData } = req.body as Record<
    string,
    unknown
  >;
  const authority = parseSecret(authoritySecretKey);
  if (!authority) return sendError(res, 400, "authoritySecretKey must be 64 bytes of hex", "INVALID_SECRET");
  const soBytes = decodeBase64Bounded(bytecodeBase64, MAX_SO_BYTES);
  if (!soBytes) return sendError(res, 400, "invalid bytecodeBase64", "INVALID_BYTECODE");
  let instructionBytes: Buffer = Buffer.alloc(0);
  if (instructionData) {
    const decoded = decodeBase64Bounded(instructionData, MAX_IDL_BYTES);
    if (!decoded) {
      return sendError(res, 400, "invalid instructionData", "INVALID_INSTRUCTION");
    }
    instructionBytes = decoded;
  }

  if (!acquireOp()) {
    res.setHeader("Retry-After", "5");
    return sendError(res, 429, "service busy", "OPS_BUSY");
  }
  const dir = await tmpDir("profile");
  const ledger = await tmpDir("profile-ledger");
  let validator: ValidatorHandle | null = null;
  try {
    const programPath = path.join(dir, "program.so");
    const programKpPath = path.join(dir, "program-kp.json");
    await writePrivate(programPath, soBytes);
    const programKp = programKeypair ? parseProgramKeypair(programKeypair) : Keypair.generate();
    if (!programKp) return sendError(res, 400, "invalid programKeypair", "INVALID_KEYPAIR");
    await writePrivate(programKpPath, JSON.stringify(Array.from(programKp.secretKey)));
    const programId = programKp.publicKey.toBase58();

    validator = await startLocalValidator(ledger);
    if (!validator) {
      return res.json({
        success: false,
        totalCuConsumed: 0,
        cuCap: 1_400_000,
        programId,
        instructions: [],
        error: null,
        logs: [],
        note: "solana-test-validator is not available in this environment.",
      });
    }
    const deploy = await runFile(
      "solana",
      ["program", "deploy", programPath, "--program-id", programKpPath, "--url", validator.rpcUrl],
      { cwd: dir, timeoutMs: 60_000 },
    );
    if (deploy.code !== 0) {
      return sendError(res, 502, firstErrorLine(deploy.stderr, deploy.stdout), "DEPLOY_FAILED");
    }

    const connection = new Connection(validator.rpcUrl, "processed");
    const ix = new TransactionInstruction({
      keys: [{ pubkey: authority.publicKey, isSigner: true, isWritable: true }],
      programId: new PublicKey(programId),
      data: instructionBytes,
    });
    const tx = new Transaction().add(ix);
    tx.feePayer = authority.publicKey;
    const blockhash = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash.blockhash;
    const sim = await connection.simulateTransaction(tx, [authority]);
    const simLogs = sim.value.logs ?? [];
    const parsed = parseCpuProfileLogs(simLogs);
    const totalCuConsumed = sim.value.unitsConsumed ?? parsed.totalCu;
    res.json({
      success: !sim.value.err,
      totalCuConsumed,
      cuCap: 1_400_000,
      cuUtilization: Math.round((totalCuConsumed / 1_400_000) * 10000) / 100,
      programId,
      instructions: parsed.tree,
      error: sim.value.err ? JSON.stringify(sim.value.err) : null,
      logs: simLogs.slice(0, 200),
    });
  } catch (err) {
    log.error("profile failed", { error: (err as Error).message });
    sendError(res, 500, "profile failed", "PROFILE_INTERNAL");
  } finally {
    stopValidator(validator);
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(ledger, { recursive: true, force: true }).catch(() => {});
    releaseOp();
  }
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "not found" });
});

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  log.error("unhandled error", { error: err.message, requestId: (req as any).id });
  if (res.headersSent) return;
  sendError(res, 500, "internal server error");
});

const server = app.listen(config.port, () => {
  log.info("compiler API listening", {
    port: config.port,
    env: config.nodeEnv,
    corsOrigins: config.corsOrigins,
    trustProxyHops: config.trustProxyHops,
    localValidator: config.enableLocalValidator,
  });
});

server.requestTimeout = 300_000;
server.headersTimeout = 60_000;

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info("shutting down", { signal, activeBuilds: buildService.queueDepth });
  server.close();
  const deadline = Date.now() + 25_000;
  while (buildService.queueDepth > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
  }
  log.info("shutdown complete", { remainingBuilds: buildService.queueDepth });
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  log.error("unhandled rejection", { error: String(reason) });
});
process.on("uncaughtException", (err) => {
  log.error("uncaught exception", { error: err.message });
  void shutdown("uncaughtException");
});

void (async () => {
  await faucetLedger.init();
  await probeVersions();
  log.info("startup complete", {
    toolchain: versions,
    faucetConfigured: Boolean(config.faucet.secretHex),
    faucetAddress: faucetAddress || null,
  });
})();

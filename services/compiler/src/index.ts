import express, { Request, Response } from "express";
import cors from "cors";
import * as fs from "fs/promises";
import * as path from "path";
import { execSync } from "child_process";
import { runBuild } from "./buildService";
import { BuildRequest } from "./types";
import { v4 as uuidv4 } from "uuid";
import { Connection, PublicKey } from "@solana/web3.js";

const PORT = Number(process.env.PORT || 8080);
const MAX_CONCURRENT_BUILDS = Number(process.env.MAX_CONCURRENT_BUILDS || 2);

let activeBuilds = 0;
const buildSem = { count: 0, max: MAX_CONCURRENT_BUILDS };
function acquireBuild(): boolean {
  if (buildSem.count >= buildSem.max) return false;
  buildSem.count++;
  return true;
}
function releaseBuild(): void { buildSem.count--; }

const CLUSTER_RPCS: Record<string, string> = {
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};

function resolveRpc(cluster?: string): string {
  return (cluster && CLUSTER_RPCS[cluster]) || CLUSTER_RPCS.devnet;
}

const app = express();
app.use(cors({
  origin: process.env.CORS_ORIGIN || ['https://suruj404.github.io', 'https://solphg-playground.vercel.app'],
}));
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", activeBuilds: buildSem.count, maxConcurrentBuilds: MAX_CONCURRENT_BUILDS });
});

app.post("/api/build", async (req: Request, res: Response) => {
  const body = req.body as BuildRequest;

  if (!acquireBuild()) {
    return res.status(429).json({
      success: false,
      error: `build queue full (${buildSem.count}/${MAX_CONCURRENT_BUILDS} active). Try again shortly.`,
    });
  }

  try {
    const result = await runBuild(body);
    const statusCode = result.success ? 200 : 400;
    res.status(statusCode).json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || "internal error" });
  } finally {
    releaseBuild();
  }
});

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const DEVNET_RPC = process.env.DEVNET_RPC_URL || "https://api.devnet.solana.com";
const FAUCET_SECRET_HEX = process.env.FAUCET_SECRET_KEY || "";
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || "";

const AIRDROP_RPCS = [
  DEVNET_RPC,
  "https://api.devnet.solana.com",
  HELIUS_API_KEY ? `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}` : "",
].filter(Boolean);

function hexToKeypairFile(hex: string): number[] {
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 64) throw new Error(`FAUCET_SECRET_KEY must be 64 bytes (hex), got ${buf.length}`);
  return Array.from(buf);
}

app.post("/api/airdrop", async (req: Request, res: Response) => {
  const { address, amount } = req.body;
  const tmpDir = path.join("/tmp", `airdrop-${uuidv4()}`);
  try {
    await fs.mkdir(tmpDir, { recursive: true });

    const faucetPath = path.join(tmpDir, "faucet.json");
    if (FAUCET_SECRET_HEX) {
      await fs.writeFile(faucetPath, JSON.stringify(hexToKeypairFile(FAUCET_SECRET_HEX)));
    }

    // Try faucet transfer first (bypasses requestAirdrop rate limits)
    if (FAUCET_SECRET_HEX) {
      try {
        const sig = execSync(
          `solana transfer --allow-unfunded-recipient --url ${DEVNET_RPC} --keypair ${faucetPath} ${address} ${amount || 2}`,
          { cwd: tmpDir, timeout: 60_000, encoding: "utf8" },
        ).toString().trim();
        const m = sig.match(/Signature:\s*(\w+)/);
        res.json({ signature: m ? m[1] : sig });
        return;
      } catch { /* fall through to airdrop */ }
    }

    // Fallback: try requestAirdrop across multiple RPC endpoints.
    // Total timeout of 25s max — fail fast instead of retrying forever.
    let lastErr: any;
    const shuffled = [...AIRDROP_RPCS].sort(() => Math.random() - 0.5);
    const lamports = (amount || 2) * 1e9;
    const DEADLINE = Date.now() + 25_000;

    for (const rpcUrl of shuffled) {
      if (Date.now() > DEADLINE) break;

      // Approach 1: CLI solana airdrop (1 attempt per RPC, quick)
      try {
        const sig = execSync(
          `solana airdrop ${amount || 2} ${address} --url ${rpcUrl}`,
          { cwd: tmpDir, timeout: 20_000, encoding: "utf8" },
        ).toString().trim();
        res.json({ signature: sig });
        return;
      } catch (err: any) {
        lastErr = err;
      }

      if (Date.now() > DEADLINE) break;

      // Approach 2: web3.js Connection.requestAirdrop (1 attempt per RPC)
      try {
        const connection = new Connection(rpcUrl, "confirmed");
        const pubkey = new PublicKey(address);
        const sig = await connection.requestAirdrop(pubkey, lamports);
        await connection.confirmTransaction(sig, "confirmed");
        res.json({ signature: sig });
        return;
      } catch (err: any) {
        lastErr = err;
      }
    }

    const hint = FAUCET_SECRET_HEX
      ? "Faucet wallet is low or all RPC endpoints rate-limited. Fund the faucet at https://faucet.solana.com with address 3LymxuUGBT67AXqNJQVkRtbvd7kpywyXoUhpDpob2rgR and try again."
      : "Set FAUCET_SECRET_KEY env var with a funded devnet keypair (hex). Fund it via https://faucet.solana.com";
    const msg = lastErr?.stderr || lastErr?.stdout || lastErr?.message || "airdrop failed";
    res.json({ error: `${msg}. ${hint}` });
  } catch (err: any) {
    const msg = err.stderr || err.stdout || err.message || String(err);
    res.json({ error: msg });
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

app.post("/api/faucet-fund", async (_req: Request, res: Response) => {
  // Generates a fresh keypair, airdrops to it from Railway's IP, then
  // auto-transfers to the faucet wallet (3Lymxu...)
  const tmpDir = path.join("/tmp", `faucet-fund-${uuidv4()}`);
  try {
    await fs.mkdir(tmpDir, { recursive: true });
    const kpPath = path.join(tmpDir, "fresh.json");
    execSync(`solana-keygen new --no-bip39-passphrase --force --silent --outfile ${kpPath}`, { timeout: 10_000 });
    const addr = execSync(`solana-keygen pubkey ${kpPath}`, { encoding: "utf8" }).toString().trim();
    const rpcs = [DEVNET_RPC, "https://api.devnet.solana.com", HELIUS_API_KEY ? `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}` : ""].filter(Boolean);

    const fundDeadline = Date.now() + 20_000;
    for (const rpc of [...rpcs].sort(() => Math.random() - 0.5)) {
      if (Date.now() > fundDeadline) break;
      try {
        execSync(`solana airdrop 2 ${addr} --url ${rpc}`, { timeout: 15_000, encoding: "utf8" });
        const faucetAddr = "3LymxuUGBT67AXqNJQVkRtbvd7kpywyXoUhpDpob2rgR";
        execSync(`solana transfer --allow-unfunded-recipient --url ${rpc} --keypair ${kpPath} ${faucetAddr} 2`, { timeout: 15_000, encoding: "utf8" });
        const bal = execSync(`solana balance ${faucetAddr} --url ${rpc}`, { encoding: "utf8" }).toString().trim();
        res.json({ success: true, faucetAddress: faucetAddr, faucetBalance: bal, message: "Faucet wallet funded! Airdrop should work now." });
        return;
      } catch (e: any) {
        console.warn(`faucet-fund RPC ${rpc} failed:`, e.stderr || e.message);
      }
    }
    res.json({ error: "All RPC endpoints rate-limited. Try again later." });
  } catch (err: any) {
    res.json({ error: err.message || String(err) });
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

app.get("/api/balance/:address", async (req: Request, res: Response) => {
  const cluster = (req.query.cluster as string) || "devnet";
  const rpcUrl = resolveRpc(cluster);
  const tmpDir = path.join("/tmp", `balance-${uuidv4()}`);
  try {
    await fs.mkdir(tmpDir, { recursive: true });
    const balance = execSync(
      `solana balance ${req.params.address} --url ${rpcUrl}`,
      { cwd: tmpDir, timeout: 10_000, encoding: "utf8" },
    ).toString().trim();
    const num = parseFloat(balance.replace(" SOL", ""));
    res.json({ balance: isNaN(num) ? 0 : num });
  } catch (err: any) {
    try {
      const connection = new Connection(rpcUrl, "confirmed");
      const pubkey = new PublicKey(req.params.address);
      const lamports = await connection.getBalance(pubkey);
      res.json({ balance: lamports / 1e9 });
    } catch {
      const msg = err.stderr || err.stdout || err.message || String(err);
      res.json({ error: msg });
    }
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

app.post("/api/simulate", async (req: Request, res: Response) => {
  const { bytecodeBase64, programKeypair, authoritySecretKey } = req.body;
  const cluster = (req.body.cluster as string) || "devnet";
  const rpcUrl = resolveRpc(cluster);
  const tmpDir = path.join("/tmp", `simulate-${uuidv4()}`);
  try {
    await fs.mkdir(tmpDir, { recursive: true });

    const authorityPath = path.join(tmpDir, "authority.json");
    const programPath = path.join(tmpDir, "program.so");
    const programKpPath = path.join(tmpDir, "program-kp.json");

    if (!authoritySecretKey || typeof authoritySecretKey !== "string") {
      return res.json({ error: "authoritySecretKey is required" });
    }
    const authorityBytes = Buffer.from(authoritySecretKey, "hex");
    if (authorityBytes.length !== 64) {
      return res.json({ error: `authoritySecretKey must be 64 bytes` });
    }
    await fs.writeFile(authorityPath, JSON.stringify(Array.from(authorityBytes)));

    if (!bytecodeBase64 || typeof bytecodeBase64 !== "string") {
      return res.json({ error: "bytecodeBase64 is required and must be a string" });
    }
    let soBytes: Buffer;
    try { soBytes = Buffer.from(bytecodeBase64, "base64"); } catch {
      return res.json({ error: "bytecodeBase64 is not valid base64" });
    }
    await fs.writeFile(programPath, soBytes);

    if (programKeypair) {
      const kpBytes = Buffer.from(programKeypair, "base64");
      await fs.writeFile(programKpPath, JSON.stringify(Array.from(kpBytes)));
    }

    // Check authority balance first
    let balance = 0;
    try {
      const balOut = execSync(`solana balance ${authorityPath} --url ${rpcUrl}`, { timeout: 10_000, encoding: "utf8" });
      balance = parseFloat(balOut.toString().trim().replace(" SOL", "")) || 0;
    } catch {}

    // Estimate deploy cost from bytecode size
    // Program account rent ≈ (4 + 32 + 32 + 32 + 4 + bytecode) bytes
    // Rounded to nearest 1KB for estimation
    const bytecodeSize = soBytes.length;
    const programAccountBytes = 100 + bytecodeSize; // ~100 bytes overhead
    const rentExemptionPerKb = 0.0035; // ~0.0035 SOL per KB rent-exempt
    const estimatedRent = Math.ceil(programAccountBytes / 1024) * rentExemptionPerKb;

    // Check if the expected program ID already exists on chain
    let existingProgramId: string | null = null;
    let programExists = false;
    if (programKeypair) {
      try {
        const pkOut = execSync(
          `solana-keygen pubkey ${programKpPath}`,
          { timeout: 5_000, encoding: "utf8" },
        ).toString().trim();
        existingProgramId = pkOut;
        // Try fetching the program account
        execSync(
          `solana program show ${pkOut} --url ${rpcUrl} 2>&1`,
          { timeout: 10_000, encoding: "utf8" },
        );
        programExists = true;
      } catch {
        // Program doesn't exist yet — good
      }
    }

    // Check if authority has enough for tx fee
    const txFee = 0.00001; // ~0.00001 SOL per signature
    const totalCost = estimatedRent + txFee;

    res.json({
      success: true,
      programId: existingProgramId,
      bytecodeSize,
      estimatedRentSol: Math.round(estimatedRent * 1e6) / 1e6,
      authorityBalance: balance,
      hasSufficientBalance: balance >= totalCost,
      programExists,
      output: [
        `Bytecode size: ${(bytecodeSize / 1024).toFixed(1)} KB`,
        `Est. rent-exempt balance: ${(Math.round(estimatedRent * 1e6) / 1e6).toFixed(4)} SOL`,
        `Authority balance: ${balance.toFixed(4)} SOL`,
        programExists ? `⚠ Program ID already exists — will upgrade` : `✓ Program ID is available`,
        balance >= totalCost ? `✓ Sufficient balance` : `⚠ Need ~${totalCost.toFixed(4)} SOL for deploy`,
      ].join('\n'),
    });
  } catch (err: any) {
    const msg = err.stderr || err.stdout || err.message || String(err);
    res.json({ error: msg });
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

interface CpiNode {
  programId: string
  depth: number
  computeUnits?: string
  accounts: string[]
  success: boolean
  error?: string
  children: CpiNode[]
}

interface CpuProfileNode {
  programId: string
  cuConsumed: number
  depth: number
  success: boolean
  error?: string
  children: CpuProfileNode[]
}

function computeOwnCu(node: CpuProfileNode): { nodeCu: number; ownCu: number } {
  const childrenCu = node.children.reduce((sum, c) => sum + computeOwnCu(c).nodeCu, 0)
  return { nodeCu: node.cuConsumed, ownCu: node.cuConsumed - childrenCu }
}

function enhanceProfileTree(nodes: CpuProfileNode[], totalCu: number): any[] {
  return nodes.map(n => {
    const { ownCu } = computeOwnCu(n)
    const pct = totalCu > 0 ? Math.round((n.cuConsumed / totalCu) * 10000) / 100 : 0
    return {
      programId: n.programId,
      cuConsumed: n.cuConsumed,
      ownCu,
      depth: n.depth,
      success: n.success,
      error: n.error,
      percentage: pct,
      isHotspot: pct > 20,
      children: enhanceProfileTree(n.children, totalCu),
    }
  })
}

function parseCpuProfileLogs(logs: string[]): { tree: any[]; totalCu: number } {
  const roots: CpuProfileNode[] = []
  const stack: CpuProfileNode[] = []

  for (const line of logs) {
    const invokeMatch = line.match(/Program\s+(\w+)\s+invoke\s+\[(\d+)\]/)
    if (invokeMatch) {
      const node: CpuProfileNode = {
        programId: invokeMatch[1],
        cuConsumed: 0,
        depth: parseInt(invokeMatch[2]),
        success: false,
        children: [],
      }
      if (node.depth === 1) {
        roots.push(node)
        stack.length = 0
        stack.push(node)
      } else if (stack.length > 0) {
        stack[stack.length - 1].children.push(node)
        stack.push(node)
      }
      continue
    }

    const cuMatch = line.match(/Program\s+(\w+)\s+consumed\s+(\d+)\s+of\s+(\d+)/)
    if (cuMatch) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].programId === cuMatch[1]) {
          stack[i].cuConsumed = parseInt(cuMatch[2])
          break
        }
      }
      continue
    }

    const successMatch = line.match(/Program\s+(\w+)\s+success\b/)
    if (successMatch && stack.length > 0) {
      if (stack[stack.length - 1].programId === successMatch[1]) {
        stack[stack.length - 1].success = true
        stack.pop()
      }
      continue
    }

    const errMatch = line.match(/Program\s+(\w+)\s+failed:\s*(.+)/)
    if (errMatch && stack.length > 0) {
      if (stack[stack.length - 1].programId === errMatch[1]) {
        stack[stack.length - 1].success = false
        stack[stack.length - 1].error = errMatch[2].trim()
        stack.pop()
      }
      continue
    }
  }

  const totalCu = roots.reduce((sum, r) => sum + r.cuConsumed, 0)
  return { tree: enhanceProfileTree(roots, totalCu), totalCu }
}

function parseCpiLogs(logs: string): CpiNode[] {
  const roots: CpiNode[] = []
  const stack: CpiNode[] = []
  const lines = logs.split('\n')

  for (const line of lines) {
    // Match: Program <id> invoke [<depth>]
    const invokeMatch = line.match(/Program\s+(\w+)\s+invoke\s+\[(\d+)\]/)
    if (invokeMatch) {
      const node: CpiNode = {
        programId: invokeMatch[1],
        depth: parseInt(invokeMatch[2]),
        accounts: [],
        success: false,
        children: [],
      }
      if (node.depth === 1) {
        roots.push(node)
        stack.length = 0
        stack.push(node)
      } else if (stack.length > 0) {
        stack[stack.length - 1].children.push(node)
        stack.push(node)
      }
      continue
    }

    // Match: Program consumption: Program <id> consumed <n> of <m>
    const cuMatch = line.match(/Program\s+(\w+)\s+consumed\s+(\d+)\s+of\s+(\d+)/)
    if (cuMatch) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].programId === cuMatch[1]) {
          stack[i].computeUnits = `${cuMatch[2]} / ${cuMatch[3]}`
          break
        }
      }
      continue
    }

    // Match: Program <id> success (always plain, no error message)
    const successMatch = line.match(/Program\s+(\w+)\s+success\b/)
    if (successMatch && stack.length > 0) {
      if (stack[stack.length - 1].programId === successMatch[1]) {
        stack[stack.length - 1].success = true
        stack.pop()
      }
      continue
    }

    // Match: Program <id> failed: <error message>
    const errMatch = line.match(/Program\s+(\w+)\s+failed:\s*(.+)/)
    if (errMatch && stack.length > 0) {
      if (stack[stack.length - 1].programId === errMatch[1]) {
        stack[stack.length - 1].success = false
        stack[stack.length - 1].error = errMatch[2].trim()
        stack.pop()
      }
      continue
    }
  }

  return roots
}

app.post("/api/debug-cpi", async (req: Request, res: Response) => {
  // Two modes:
  // 1) { rawLogs: string } — parse provided logs into CPI tree
  // 2) { bytecodeBase64, idl } — attempt local validator trace
  const { bytecodeBase64, rawLogs: inputLogs } = req.body;

  // Mode 1: Parse provided logs
  if (inputLogs) {
    const parsedTree = parseCpiLogs(inputLogs);
    const isAllSuccessful = (nodes: CpiNode[]): boolean => nodes.every(n => n.success && isAllSuccessful(n.children));
    const allSuccess = parsedTree.length === 0 || isAllSuccessful(parsedTree);
    return res.json({
      success: allSuccess,
      cpiTree: parsedTree,
      rawLogs: inputLogs.slice(0, 5000),
      summary: {
        totalCpis: parsedTree.length,
        computeUnits: "varies (depends on transaction)",
      },
    });
  }

  // Mode 2: Try local validator (if available)
  if (!bytecodeBase64) {
    return res.json({ error: "Provide bytecodeBase64 for auto-trace or rawLogs for log parsing" });
  }

  const tmpDir = path.join("/tmp", `cpi-${uuidv4()}`);

  try {
    await fs.mkdir(tmpDir, { recursive: true });

    const programPath = path.join(tmpDir, "program.so");
    const programKpPath = path.join(tmpDir, "program-kp.json");
    const soBytes = Buffer.from(bytecodeBase64, "base64");
    await fs.writeFile(programPath, soBytes);

    execSync(
      `solana-keygen new --no-bip39-passphrase --force --silent --outfile ${programKpPath}`,
      { timeout: 10_000 }
    );
    const programId = execSync(
      `solana-keygen pubkey ${programKpPath}`,
      { encoding: "utf8", timeout: 5_000 }
    ).toString().trim();

    // Attempt to run full trace on a local validator
    let validator: any = null;
    let ready = false;
    const ledgerDir = path.join("/tmp", `cpi-ledger-${uuidv4()}`);
    const rpcPort = 8899 + Math.floor(Math.random() * 1000);
    const killValidator = () => { try { if (validator) { process.kill(-validator.pid); } } catch {} };

    try {
      const { spawn } = require("child_process");
      validator = spawn("solana-test-validator", [
        "--reset", "--quiet", `--ledger`, ledgerDir,
        `--rpc-port`, String(rpcPort), "--gossip-port", "0", "--faucet-port", "0", "--no-bpf-jit",
      ], { stdio: "ignore", detached: true });

      for (let i = 0; i < 5; i++) {
        await sleep(500);
        try {
          execSync(`solana --url http://127.0.0.1:${rpcPort} cluster-version 2>&1`, { timeout: 3_000 });
          ready = true;
          break;
        } catch {}
      }

      if (!ready) { killValidator(); }
    } catch {}

    if (!ready) {
      killValidator();
      return res.json({
        success: true,
        programId,
        cpiTree: [],
        rawLogs: "solana-test-validator not available in this environment. Use the 'Paste Raw Logs' feature in the CPI Debug tab — run `solana simulate` in your terminal and paste the output here.",
        summary: { totalCpis: 0, computeUnits: "N/A" },
        note: "Local validator not found. Paste raw simulation logs to analyze CPI traces.",
      });
    }

    try {
      execSync(
        `solana program deploy ${programPath} --program-id ${programKpPath} --url http://127.0.0.1:${rpcPort} 2>&1`,
        { timeout: 60_000, cwd: tmpDir, encoding: "utf8" }
      );
    } catch (deployErr: any) {
      killValidator();
      throw new Error(`deploy to local validator failed: ${deployErr.stderr || deployErr.message}`);
    }

    // Simulate a transaction against the deployed program
    let simOutput = "";
    try {
      simOutput = execSync(
        `solana transfer --allow-unfunded-recipient --url http://127.0.0.1:${rpcPort} ${programId} 0.0001 2>&1`,
        { timeout: 30_000, encoding: "utf8" }
      ).toString();
    } catch (err: any) {
      simOutput = err.stdout || err.stderr || err.message || "";
    }

    const parsedTree = parseCpiLogs(simOutput);
    const isAllSuccessful = (nodes: CpiNode[]): boolean => nodes.every(n => n.success && isAllSuccessful(n.children));

    killValidator();

    res.json({
      success: parsedTree.length === 0 || isAllSuccessful(parsedTree),
      programId,
      cpiTree: parsedTree,
      rawLogs: simOutput.slice(0, 5000),
      summary: {
        totalCpis: parsedTree.length,
        computeUnits: "N/A (local validator)",
      },
    });
  } catch (err: any) {
    const msg = err.stderr || err.stdout || err.message || String(err);
    res.json({ error: msg, rawLogs: msg });
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

app.post("/api/deploy", async (req: Request, res: Response) => {
  const { bytecodeBase64, programKeypair, authoritySecretKey } = req.body;
  const cluster = (req.body.cluster as string) || "devnet";
  const rpcUrl = resolveRpc(cluster);
  const tmpDir = path.join("/tmp", `deploy-${uuidv4()}`);
  try {
    await fs.mkdir(tmpDir, { recursive: true });

    const authorityPath = path.join(tmpDir, "authority.json");
    const programPath = path.join(tmpDir, "program.so");
    const programKpPath = path.join(tmpDir, "program-kp.json");

    // Validate and write authority keypair
    if (!authoritySecretKey || typeof authoritySecretKey !== "string") {
      return res.json({ error: "authoritySecretKey is required" });
    }
    const authorityBytes = Buffer.from(authoritySecretKey, "hex");
    if (authorityBytes.length !== 64) {
      return res.json({ error: `authoritySecretKey must be 64 bytes, got ${authorityBytes.length}. Browser wallets (Backpack/Phantom) cannot sign deployments — generate or import a wallet.` });
    }
    await fs.writeFile(authorityPath, JSON.stringify(Array.from(authorityBytes)));

    // Write program binary
    const soBytes = Buffer.from(bytecodeBase64, "base64");
    await fs.writeFile(programPath, soBytes);

    // Write program keypair for deterministic address
    if (programKeypair) {
      const kpBytes = Buffer.from(programKeypair, "base64");
      await fs.writeFile(programKpPath, JSON.stringify(Array.from(kpBytes)));
    }

    execSync(
      `solana config set --url ${rpcUrl} --keypair ${authorityPath} 2>&1`,
      { cwd: tmpDir, timeout: 10_000 },
    );

    const deployCmd = programKeypair
      ? `solana program deploy ${programPath} --program-id ${programKpPath} --keypair ${authorityPath} --url ${rpcUrl} --chunk-size 65536 2>&1`
      : `solana program deploy ${programPath} --keypair ${authorityPath} --url ${rpcUrl} --chunk-size 65536 2>&1`;

    const output = execSync(deployCmd, { cwd: tmpDir, timeout: 120_000, encoding: "utf8" }).toString().trim();

    // Extract program ID from output: "Program Id: <address>"
    const progIdMatch = output.match(/Program Id:\s*(\w+)/);
    const programId = progIdMatch ? progIdMatch[1] : undefined;

    res.json({ signature: output, programId });
  } catch (err: any) {
    const msg = err.stderr || err.stdout || err.message || String(err);
    res.json({ error: msg });
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

app.post("/api/profile", async (req: Request, res: Response) => {
  const { bytecodeBase64, programKeypair, authoritySecretKey, instructionData } = req.body;
  const tmpDir = path.join("/tmp", `profile-${uuidv4()}`);

  let ledgerDir = "";
  try {
    await fs.mkdir(tmpDir, { recursive: true });

    const programPath = path.join(tmpDir, "program.so");
    const programKpPath = path.join(tmpDir, "program-kp.json");
    const authorityPath = path.join(tmpDir, "authority.json");

    const soBytes = Buffer.from(bytecodeBase64, "base64");
    await fs.writeFile(programPath, soBytes);

    if (!authoritySecretKey || typeof authoritySecretKey !== "string") {
      return res.json({ error: "authoritySecretKey is required" });
    }
    const authorityBytes = Buffer.from(authoritySecretKey, "hex");
    if (authorityBytes.length !== 64) {
      return res.json({ error: "authoritySecretKey must be 64 bytes (hex)" });
    }
    await fs.writeFile(authorityPath, JSON.stringify(Array.from(authorityBytes)));

    if (programKeypair) {
      const kpBytes = Buffer.from(programKeypair, "base64");
      await fs.writeFile(programKpPath, JSON.stringify(Array.from(kpBytes)));
    } else {
      execSync(`solana-keygen new --no-bip39-passphrase --force --silent --outfile ${programKpPath}`, { timeout: 10_000 });
    }

    const programId = execSync(`solana-keygen pubkey ${programKpPath}`, { encoding: "utf8", timeout: 5_000 }).toString().trim();

    // Phase 1: Start local validator
    let validator: any = null;
    let ready = false;
    ledgerDir = path.join("/tmp", `profile-ledger-${uuidv4()}`);
    const rpcPort = 8899 + Math.floor(Math.random() * 1000);
    const killValidator = () => { try { if (validator) { process.kill(-validator.pid); } } catch {} };

    try {
      const { spawn } = require("child_process");
      validator = spawn("solana-test-validator", [
        "--reset", "--quiet", `--ledger`, ledgerDir,
        `--rpc-port`, String(rpcPort), "--gossip-port", "0", "--faucet-port", "0", "--no-bpf-jit",
      ], { stdio: "ignore", detached: true });

      for (let i = 0; i < 6; i++) {
        await sleep(800);
        try {
          execSync(`solana --url http://127.0.0.1:${rpcPort} cluster-version 2>&1`, { timeout: 3_000 });
          ready = true;
          break;
        } catch {}
      }
    } catch {}
    if (!ready) {
      killValidator();
      return res.json({
        success: false,
        totalCuConsumed: 0,
        cuCap: 1_400_000,
        programId,
        instructions: [],
        error: null,
        logs: [],
        note: "Automatic CU profiling requires solana-test-validator which is not available in this environment. Build and deploy your program, then run `solana simulate` locally and paste the output into the CPI Debug tab (Paste Raw Logs mode) to analyze CU consumption.",
      });
    }

    // Phase 1: Deploy program to local validator
    try {
      execSync(
        `solana program deploy ${programPath} --program-id ${programKpPath} --url http://127.0.0.1:${rpcPort} 2>&1`,
        { timeout: 60_000, cwd: tmpDir, encoding: "utf8" }
      );
    } catch (deployErr: any) {
      killValidator();
      return res.json({ error: `deploy to local validator failed: ${deployErr.stderr || deployErr.message}` });
    }

    // Phase 1-2: Construct and simulate transaction
    let totalCuConsumed = 0;
    let cuTree: any[] = [];
    let simLogs: string[] = [];
    let simError: string | null = null;

    try {
      const { Connection, PublicKey, Transaction, TransactionInstruction, Keypair } = require("@solana/web3.js");
      const connection = new Connection(`http://127.0.0.1:${rpcPort}`, "processed");
      const feePayer = Keypair.fromSecretKey(new Uint8Array(authorityBytes));
      const programPubkey = new PublicKey(programId);

      const ix = new TransactionInstruction({
        keys: [{ pubkey: feePayer.publicKey, isSigner: true, isWritable: true }],
        programId: programPubkey,
        data: instructionData ? Buffer.from(instructionData, "base64") : Buffer.alloc(0),
      });

      const tx = new Transaction();
      tx.add(ix);
      tx.feePayer = feePayer.publicKey;
      const blockhash = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash.blockhash;

      const simResult = await connection.simulateTransaction(tx, [feePayer], {
        innerInstructions: true,
        sigVerify: false,
        commitment: "processed",
      });

      const sv = simResult.value;
      simLogs = sv.logs || [];

      if (sv.err) {
        simError = typeof sv.err === "string" ? sv.err : JSON.stringify(sv.err);
      }

      // Parse CU from logs
      const parsed = parseCpuProfileLogs(simLogs);
      totalCuConsumed = sv.unitsConsumed || parsed.totalCu || 0;
      cuTree = parsed.tree;
    } catch (simErr: any) {
      killValidator();
      return res.json({ error: `simulation failed: ${simErr.message}` });
    }

    killValidator();

    // Phase 2+5: Build enhanced response with hotspots
    res.json({
      success: !simError,
      totalCuConsumed,
      cuCap: 1_400_000,
      cuUtilization: Math.round((totalCuConsumed / 1_400_000) * 10000) / 100,
      programId,
      instructions: cuTree,
      error: simError,
      logs: simLogs.slice(0, 200),
    });
  } catch (err: any) {
    const msg = err.stderr || err.stdout || err.message || String(err);
    res.json({ error: msg });
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    if (ledgerDir) { fs.rm(ledgerDir, { recursive: true, force: true }).catch(() => {}); }
  }
});

app.listen(PORT, () => {
  console.log(`[solshift] build service listening on port ${PORT}`);
});

import express, { Request, Response } from "express";
import cors from "cors";
import * as fs from "fs/promises";
import * as path from "path";
import { execSync } from "child_process";
import { runBuild } from "./buildService";
import { BuildRequest } from "./types";
import { v4 as uuidv4 } from "uuid";

const PORT = Number(process.env.PORT || 8080);
const MAX_CONCURRENT_BUILDS = Number(process.env.MAX_CONCURRENT_BUILDS || 2);

let activeBuilds = 0;

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", activeBuilds, maxConcurrentBuilds: MAX_CONCURRENT_BUILDS });
});

app.post("/api/build", async (req: Request, res: Response) => {
  const body = req.body as BuildRequest;

  if (activeBuilds >= MAX_CONCURRENT_BUILDS) {
    return res.status(429).json({
      success: false,
      error: `build queue full (${activeBuilds}/${MAX_CONCURRENT_BUILDS} active). Try again shortly.`,
    });
  }

  activeBuilds++;
  try {
    const result = await runBuild(body);
    const statusCode = result.success ? 200 : 400;
    res.status(statusCode).json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || "internal error" });
  } finally {
    activeBuilds--;
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
  "https://solana-devnet.api.onfinality.io/public",
  "https://solana-devnet.gateway.tatum.io",
  "https://rpc.ankr.com/solana_devnet",
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

    // Fallback: try requestAirdrop across multiple RPC endpoints
    // Each endpoint has its own daily rate limit, so rotate through them
    let lastErr: any;
    const shuffled = [...AIRDROP_RPCS].sort(() => Math.random() - 0.5);

    for (const rpcUrl of shuffled) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const sig = execSync(
            `solana airdrop ${amount || 2} ${address} --url ${rpcUrl}`,
            { cwd: tmpDir, timeout: 60_000, encoding: "utf8" },
          ).toString().trim();
          res.json({ signature: sig });
          return;
        } catch (err: any) {
          lastErr = err;
          const msg = (err.stderr || err.stdout || err.message || "").toLowerCase();
          const isRateLimit = msg.includes("rate limit") || msg.includes("429") || msg.includes("airdrop limit") || msg.includes("too many requests");
          if (isRateLimit) {
            await sleep(Math.min(5000 * Math.pow(2, attempt), 30_000));
            continue;
          }
          break;
        }
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

app.get("/api/balance/:address", async (req: Request, res: Response) => {
  const tmpDir = path.join("/tmp", `balance-${uuidv4()}`);
  try {
    await fs.mkdir(tmpDir, { recursive: true });
    const balance = execSync(
      `solana balance ${req.params.address} --url https://api.devnet.solana.com`,
      { cwd: tmpDir, timeout: 10_000, encoding: "utf8" },
    ).toString().trim();
    const num = parseFloat(balance.replace(" SOL", ""));
    res.json({ balance: isNaN(num) ? 0 : num });
  } catch (err: any) {
    const msg = err.stderr || err.stdout || err.message || String(err);
    res.json({ error: msg });
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

app.post("/api/deploy", async (req: Request, res: Response) => {
  const { bytecodeBase64, programKeypair, authoritySecretKey } = req.body;
  const tmpDir = path.join("/tmp", `deploy-${uuidv4()}`);
  try {
    await fs.mkdir(tmpDir, { recursive: true });

    const authorityPath = path.join(tmpDir, "authority.json");
    const programPath = path.join(tmpDir, "program.so");
    const programKpPath = path.join(tmpDir, "program-kp.json");

    // Write authority keypair
    const authorityBytes = Buffer.from(authoritySecretKey, "hex");
    await fs.writeFile(authorityPath, JSON.stringify(Array.from(authorityBytes)));

    // Write program binary
    const soBytes = Buffer.from(bytecodeBase64, "base64");
    await fs.writeFile(programPath, soBytes);

    // Write program keypair for deterministic address
    if (programKeypair) {
      const kpBytes = Buffer.from(programKeypair, "base64");
      await fs.writeFile(programKpPath, JSON.stringify(Array.from(kpBytes)));
    }

    // Configure solana CLI
    execSync(
      `solana config set --url https://api.devnet.solana.com --keypair ${authorityPath} 2>&1`,
      { cwd: tmpDir, timeout: 10_000 },
    );

    // Deploy
    const deployCmd = programKeypair
      ? `solana program deploy ${programPath} --program-id ${programKpPath} --keypair ${authorityPath} --url https://api.devnet.solana.com 2>&1`
      : `solana program deploy ${programPath} --keypair ${authorityPath} --url https://api.devnet.solana.com 2>&1`;

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

app.listen(PORT, () => {
  console.log(`[solshift] build service listening on port ${PORT}`);
});

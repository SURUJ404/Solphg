import express from "express";
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

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", activeBuilds, maxConcurrentBuilds: MAX_CONCURRENT_BUILDS });
});

app.post("/api/build", async (req, res) => {
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

app.post("/api/airdrop", async (req, res) => {
  const { address, amount } = req.body;
  const tmpDir = path.join("/tmp", `airdrop-${uuidv4()}`);
  try {
    await fs.mkdir(tmpDir, { recursive: true });
    execSync(
      `solana config set --url https://api.devnet.solana.com --keypair /root/.config/solana/id.json 2>&1`,
      { cwd: tmpDir, timeout: 10_000 },
    );
    const sig = execSync(
      `solana airdrop ${amount} ${address} --url https://api.devnet.solana.com 2>&1`,
      { cwd: tmpDir, timeout: 30_000, encoding: "utf8" },
    ).toString().trim();
    res.json({ signature: sig });
  } catch (err: any) {
    res.json({ error: err.stderr || err.message || String(err) });
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

app.get("/api/balance/:address", async (req, res) => {
  const tmpDir = path.join("/tmp", `balance-${uuidv4()}`);
  try {
    await fs.mkdir(tmpDir, { recursive: true });
    const balance = execSync(
      `solana balance ${req.params.address} --url https://api.devnet.solana.com 2>&1`,
      { cwd: tmpDir, timeout: 10_000, encoding: "utf8" },
    ).toString().trim();
    const num = parseFloat(balance.replace(" SOL", ""));
    res.json({ balance: isNaN(num) ? 0 : num });
  } catch (err: any) {
    res.json({ error: err.stderr || err.message || String(err) });
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

app.post("/api/deploy", async (req, res) => {
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
    res.json({ error: err.stderr || err.message || String(err) });
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

app.listen(PORT, () => {
  console.log(`[solshift] build service listening on port ${PORT}`);
});

import express from "express";
import cors from "cors";
import { execSync } from "child_process";
import { runBuild } from "./buildService";
import { BuildRequest } from "./types";

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
  try {
    const { Connection, PublicKey, LAMPORTS_PER_SOL } = await import("@solana/web3.js");
    const conn = new Connection("https://api.devnet.solana.com", "confirmed");
    const sig = await conn.requestAirdrop(new PublicKey(address), amount * LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig);
    res.json({ signature: sig });
  } catch (err: any) {
    res.json({ error: err.message });
  }
});

app.get("/api/balance/:address", async (req, res) => {
  try {
    const { Connection, PublicKey } = await import("@solana/web3.js");
    const conn = new Connection("https://api.devnet.solana.com", "confirmed");
    const balance = await conn.getBalance(new PublicKey(req.params.address));
    res.json({ balance: balance / 1e9 });
  } catch (err: any) {
    res.json({ error: err.message });
  }
});

app.post("/api/deploy", async (req, res) => {
  const { bytecodeBase64, authoritySecretKey } = req.body;
  try {
    const { Keypair, Connection, PublicKey, Transaction, SystemProgram } = await import("@solana/web3.js");
    const authority = Keypair.fromSecretKey(Buffer.from(authoritySecretKey, "hex"));
    const programKp = Keypair.fromSecretKey(new Uint8Array(Buffer.from(bytecodeBase64, "base64")));
    const conn = new Connection("https://api.devnet.solana.com", "confirmed");

    const lamports = await conn.getMinimumBalanceForRentExemption(programKp.secretKey.length);
    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: authority.publicKey,
        newAccountPubkey: programKp.publicKey,
        lamports,
        space: programKp.secretKey.length,
        programId: new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"),
      })
    );
    tx.feePayer = authority.publicKey;
    const sig = await conn.sendTransaction(tx, [authority, programKp]);
    await conn.confirmTransaction(sig);
    res.json({ signature: sig });
  } catch (err: any) {
    res.json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[solshift] build service listening on port ${PORT}`);
});

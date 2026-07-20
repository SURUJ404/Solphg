# Building Solana Playground: A Browser-Based IDE for Solana Smart Contracts

**By Suruj Kalita**

---

## Why I Built It

Learning Solana development has a steep barrier to entry. Before you can write your first "Hello World" program, you need:

1. Install Rust and the Solana CLI
2. Install Anchor framework
3. Set up a local validator
4. Configure your IDE
5. Figure out devnet faucets

That's 5 steps before writing a single line of code. I wanted to remove all of it.

**Solana Playground** (Solphg) is a browser-based IDE where you write Rust/Anchor code in a Monaco editor, click "Build," and get a compiled `.so` program — no local toolchain required. Deploy to devnet with one more click.

---

## System Architecture

```
apps/playground (Vite + React SPA) ─── HTTP ─── services/compiler (Express + Solana CLI)
                                                        │
                                                        ├── POST /api/build      → cargo build-sbf
                                                        ├── POST /api/deploy     → solana program deploy
                                                        ├── POST /api/simulate   → rent est. + balance + conflict check
                                                        ├── POST /api/debug-cpi  → CPI tree parser (logs / auto-trace)
                                                        ├── POST /api/profile    → CU profiler (flamechart data)
                                                        ├── POST /api/airdrop    → faucet + RPC pool + client fallback
                                                        ├── POST /api/faucet-fund→ bootstrap faucet wallet
                                                        └── GET  /api/balance    → solana balance (any cluster)
```

The frontend is a **Vite + React 19 SPA** with TypeScript. The backend is an **Express server** running inside a **Docker image** that bundles the full Solana CLI (1.18), Anchor (0.30), and Rust (1.85) toolchain.

---

## How The Build Pipeline Works

When you click "Build," here's what happens:

1. **Frontend** sends your `.rs` source files to `POST /api/build`
2. **Backend** scaffolds an Anchor project structure in `/tmp` — writes `Anchor.toml`, `Cargo.toml`, `lib.rs`
3. **Docker container** runs `cargo build-sbf` (Solana's SBF compiler)
4. **Backend** reads the compiled `.so` file, base64-encodes it, and returns it with the program ID and keypair
5. **Frontend** shows the build result — program ID, bytecode size, and deploy controls

Cold builds take ~2 minutes (dependency download). Warm builds take ~15 seconds with cached lockfiles.

---

## The Airdrop Challenge

One of the hardest problems was reliably getting devnet SOL to users. The public `requestAirdrop` endpoint is aggressively rate-limited. I built a **3-tier fallback system**:

**Tier 1 — Faucet Wallet Transfer**
A pre-funded faucet wallet sends a regular Solana transfer. No rate limits on transfers — only on airdrops. This is instant when the faucet has funds.

**Tier 2 — RPC Pool**
If the faucet is dry, the backend shuffles a pool of RPC endpoints and tries each one with two strategies:
- CLI `solana airdrop` (20s timeout)
- Web3.js `requestAirdrop` (15s timeout)
- Hard deadline of 25 seconds total

**Tier 3 — Client-Side Fallback**
If all server-side attempts fail, the frontend retries `requestAirdrop` directly from the user's browser. The user's IP has its own rate-limit pool, separate from Railway's.

---

## CU Profiling — The Latest Feature

The most recent addition is a **Compute Unit profiler** that answers the question every Solana developer eventually asks: *"Why is my program consuming so many CUs?"*

**How it works:**

1. The backend deploys your program to a local `solana-test-validator`
2. Constructs a test transaction and simulates it via `simulateTransaction`
3. Parses the runtime logs — every `Program X consumed N of M compute units` line
4. Returns a tree: each program's CU consumption, own CU (minus CPIs), and percentage of total
5. The frontend renders an icicle chart where bar width = CU cost and nesting = CPI depth

Instructions consuming >20% of total CU are flagged as **hotspots**. A reference line at 1.4M CU shows how close you are to the transaction cap.

---

## The Monorepo Structure

```
apps/
  playground/         Vite + React frontend
packages/
  core/               Shared types, constants, wallet helpers
  engine/             CompilerClient (HTTP client to build service)
  shell/              Terminal emulator (interprets commands)
  plugin-manager/     Project/file CRUD and templates
  integrations/       Third-party integration stubs
services/
  compiler/           Express build service (Docker)
```

Five packages share types, API clients, and utilities — the frontend imports them as npm workspace dependencies.

---

## Deployment

- **Frontend**: Vercel — auto-deploys on push to `main`
- **Backend**: Railway — deployed via GitHub Actions, Docker image with Solana toolchain
- **Cost**: The entire backend runs on Railway's free tier (the Docker image caches help a lot)

---

## What's Next

- **Real job queue** (BullMQ + Redis) — the current in-memory build counter doesn't survive restarts
- **Persistent build cache** — per-user S3 buckets for near-instant rebuilds
- **Sandboxed execution** — Firecracker microVMs for per-build isolation
- **Shareable project links** — encode full project state in a URL

---

The project is open-source at [github.com/SURUJ404/Solphg](https://github.com/SURUJ404/Solphg). Contributions, feedback, and ideas are always welcome.

---

*Built with React, TypeScript, Express, Docker, and a lot of Solana.*

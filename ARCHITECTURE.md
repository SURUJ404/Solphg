# 🏗️ Solana Playground — Architecture

<p align="center">
  <img src="https://img.shields.io/badge/status-active-success" alt="Status" />
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License" />
  <img src="https://img.shields.io/badge/Solana-1.18-9945FF" alt="Solana" />
  <img src="https://img.shields.io/badge/Anchor-0.30-FF69B4" alt="Anchor" />
  <img src="https://img.shields.io/badge/Rust-1.85-000000" alt="Rust" />
  <img src="https://img.shields.io/badge/TypeScript-5.0-3178C6" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-6.0-646CFF" alt="Vite" />
  <img src="https://img.shields.io/badge/Railway-deployed-0B0D0E" alt="Railway" />
  <img src="https://img.shields.io/badge/Vercel-deployed-000000" alt="Vercel" />
</p>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [System Architecture](#-system-architecture)
- [Monorepo Structure](#-monorepo-structure)
- [Frontend — Playground](#-frontend--playground)
- [Backend — Compiler API](#-backend--compiler-api)
- [Shared Packages](#-shared-packages)
- [Build Pipeline](#-build-pipeline)
- [Deployment](#-deployment)
- [Wallet System](#-wallet-system)
- [Airdrop System](#-airdrop-system)
- [Use Cases](#-use-cases)
- [Tech Stack](#-tech-stack)
- [Data Flow](#-data-flow)
- [Security](#-security)
- [Roadmap — Next Evolution](#-roadmap--next-evolution)

---

## 🔭 Overview

**Solana Playground** is a browser-based IDE for writing, compiling, and deploying **Solana programs** (smart contracts) using the **Anchor framework**. It eliminates local setup — developers write Rust code in a Monaco editor, build via a remote API, and deploy directly to **Solana Devnet** — all from the browser.

### Key Capabilities

| Capability | Description |
|---|---|
| **Write** | In-browser Rust editor with syntax highlighting (Monaco) |
| **Build** | Remote Anchor/SBF build service (Railway) |
| **Deploy** | Deploy programs to Solana Devnet |
| **Wallet** | Generate, import, or connect browser wallets (Phantom, Solflare, Backpack) |
| **Airdrop** | Get devnet SOL via faucet transfer, server RPC pool (CLI + web3.js dual client), or client-side browser fallback |
| **Simulate** | Pre-deploy simulation with rent estimate, balance check, and program ID conflict detection |
| **Multi-Cluster** | Switch between devnet/testnet/mainnet with per-cluster wallet state |
| **Templates** | One-click project templates (Counter, SPL Transfer, Coin Flip, Native) |
| **Account Visualizer** | PDA tree view showing all accounts a transaction touches |
| **Terminal** | Built-in terminal emulator with Solana CLI commands |

---

## 🧱 System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        ┌───────────────┐                         │
│                        │    Browser     │                         │
│                        │  (Vercel CDN)  │                         │
│                        └───────┬───────┘                         │
│                                │                                 │
│                                ▼                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │               React SPA (Vite)                           │   │
│  │  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──────────────┐ │   │
│  │  │  Editor  │ │ Terminal │ │ Wallet │ │  Build/Deploy │ │   │
│  │  │ (Monaco) │ │ (Emulator)│ │ Panel  │ │   Controls   │ │   │
│  │  └──────────┘ └──────────┘ └────────┘ └──────────────┘ │   │
│  └──────────────────────┬───────────────────────────────────┘   │
│                         │ HTTP (fetch)                           │
│                         ▼                                        │
│  ┌──────────────────────────────────────────────┐               │
│  │        Compiler API (Railway)                │               │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │               │
│  │  │  Build   │ │  Deploy  │ │   Airdrop    │ │               │
│  │  │ Service  │ │ Service  │ │   Service    │ │               │
│  │  └────┬─────┘ └────┬─────┘ └──────┬───────┘ │               │
│  │       │            │              │         │               │
│  │       ▼            ▼              ▼         │               │
│  │  ┌─────────────────────────────────────┐    │               │
│  │  │     Docker Container (Rust + CLI)   │    │               │
│  │  │  ┌────────┐ ┌───────┐ ┌──────────┐ │    │               │
│  │  │  │ Anchor │ │Solana │ │solana-   │ │    │               │
│  │  │  │ 0.30.1 │ │1.18.18│ │keygen    │ │    │               │
│  │  │  └────────┘ └───────┘ └──────────┘ │    │               │
│  │  └─────────────────────────────────────┘    │               │
│  └──────────────────────────────────────────────┘               │
│                         │                                        │
│                         ▼                                        │
│              ┌────────────────────┐                              │
│              │  Solana Devnet     │                              │
│              │  (RPC API)         │                              │
│              └────────────────────┘                              │
└──────────────────────────────────────────────────────────────────┘
```

---

## 📦 Monorepo Structure

The project uses **npm workspaces** with the following layout:

```
solpg/
├── apps/
│   └── playground/          # React frontend (Vite + TypeScript)
│       ├── src/
│       │   ├── components/
│       │   │   ├── landing/      # Landing page sections
│       │   │   ├── EditorPanel   # Monaco editor
│       │   │   ├── TerminalPanel # Terminal emulator
│       │   │   ├── WalletPanel   # Wallet management
│       │   │   ├── FileExplorer  # Project file browser
│       │   │   ├── BuildResult   # Build output display
│       │   │   └── DocsPanel     # Documentation sidebar
│       │   ├── App.tsx           # Main app component
│       │   ├── LandingPage.tsx   # Marketing page
│       │   ├── useBrowserWallet  # Wallet adapter hooks
│       │   └── styles.css        # Global styles
│       └── vercel.json
├── services/
│   ├── compiler/            # Backend API (Express + TypeScript)
│   │   ├── src/
│   │   │   ├── index.ts          # Express server (routes)
│   │   │   ├── buildService.ts   # Anchor build orchestrator
│   │   │   ├── templates.ts      # Project scaffolding templates
│   │   │   └── types.ts          # TypeScript interfaces
│   │   └── scripts/
│   │       └── generate-faucet.mjs  # Faucet keypair generator
│   └── Dockerfile            # Multi-stage Docker build
├── packages/
│   ├── core/                 # Shared types + constants
│   │   └── src/
│   │       ├── wallet.ts        # Wallet storage (XOR encrypted)
│   │       └── constants.ts     # API URL, config
│   ├── engine/               # API client library
│   │   └── src/
│   │       └── compiler-client.ts  # HTTP client for backend
│   ├── shell/                # Terminal emulator
│   │   └── src/
│   │       └── terminal.ts       # Solana CLI emulation
│   ├── plugin-manager/       # Project/file management
│   │   └── src/
│   │       ├── templates.ts     # Anchor project templates
│   │       └── manager.ts       # CRUD operations
│   └── integrations/         # Third-party integrations
│       └── src/
│           └── index.ts
├── .github/workflows/
│   └── secrets.yml           # Railway deploy workflow
├── ARCHITECTURE.md           # This document
└── package.json              # Root workspace config
```

---

## 🎨 Frontend — Playground

### Framework

| Layer | Technology |
|---|---|
| UI Framework | React 19 |
| Build Tool | Vite 6 |
| Language | TypeScript 5 |
| Editor | Monaco Editor (@monaco-editor/react) |
| Styling | Plain CSS (CSS custom properties) |
| Deployment | Vercel |

### Component Tree

```
App
├── LandingPage
│   ├── Navbar
│   ├── HeroSection
│   ├── StatsSection
│   ├── PartnersSection
│   ├── BuildFeature
│   ├── DeployFeature
│   ├── PricingSection
│   ├── ExploreSection
│   ├── DownloadSection
│   ├── CommunitySection
│   └── Footer
└── Playground (App)
    ├── Toolbar
    │   ├── Cluster selector (devnet/testnet/mainnet)
    │   ├── Build button
    │   ├── Deploy button
    │   ├── API status indicator
    │   └── Project name
    ├── Sidebar
    │   ├── FileExplorer
    │   └── WalletPanel
    │       ├── Generate Wallet
    │       ├── Connect Wallet (Backpack/Phantom/Solflare)
    │       └── Import Wallet
    ├── DocsPanel (sidebar tab)
    ├── BuildResult panel
    ├── EditorPanel (Monaco)
    └── TerminalPanel
```

### Key State

```typescript
interface AppState {
  project: SolpgProject | null        // Current project with files
  activeFile: SolpgFile | null        // Currently open file
  wallet: WalletState | null          // Wallet (generated/imported/adapter)
  balance: number | null              // Devnet SOL balance
  builtBytecode: string | null        // Compiled .so (base64)
  builtKeypair: string | undefined    // Program keypair (base64)
  buildResult: BuildResultData | null // Build output info
  terminalLines: TerminalLine[]       // Terminal history
  isBuilding: boolean
  isAirdropping: boolean              // True during server + client airdrop attempts
  apiConnected: boolean | undefined
  activeSidebar: 'files' | 'search' | 'docs' | 'settings' | ''
}
```

### Airdrop Handler (`handleAirdrop`)

The airdrop handler in `App.tsx` orchestrates a multi-strategy approach:

```typescript
handleAirdrop():
  1. POST /api/airdrop → server tries:
     a) Faucet solana transfer
     b) RPC pool: CLI solana airdrop × 3 retries per endpoint
     c) RPC pool: web3.js requestAirdrop × 2 retries per endpoint
  2. If server returns { error } → client-side fallback:
     a) "Backend busy, retrying from browser..." message
     b) createSolanaRpc(url).requestAirdrop(address, 2e9).send()
     c) Tries api.devnet.solana.com then helius (if key available)
     d) Uses user's IP (separate rate-limit pool from Railway)
  3. Show result (tx hash or error message) in terminal
```

---

## ⚙️ Backend — Compiler API

### Framework

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 (Docker) |
| Framework | Express 4 |
| Language | TypeScript 5 |
| Build System | Docker (multi-stage) |
| Container Base | `rust:1.75-slim-bookworm` |
| Deployment | Railway |

### Installed Toolchain

| Tool | Version | Purpose |
|---|---|---|
| Solana CLI | 1.18.18 | `solana airdrop`, `solana transfer`, `solana program deploy` |
| solana-keygen | (bundled) | Keypair generation for `/api/faucet-fund` |
| Anchor CLI | 0.30.1 | `anchor build` for program compilation |
| Rust | 1.85.1 | Program compilation target |
| platform-tools | v1.41 | SBF (Solana Binary Format) toolchain |

### API Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Service health check |
| `POST` | `/api/build` | Build Anchor program (Rust → .so) |
| `POST` | `/api/simulate` | Pre-deploy simulation: rent estimate, balance check, program ID conflict |
| `POST` | `/api/debug-cpi` | CPI trace parser — accepts raw logs or bytecode for local validator trace |
| `POST` | `/api/deploy` | Deploy program to selected cluster (devnet/testnet/mainnet) |
| `POST` | `/api/airdrop` | Request devnet SOL (faucet transfer + RPC fallback) |
| `POST` | `/api/faucet-fund` | Bootstrap faucet wallet with fresh airdrop |
| `GET` | `/api/balance/:address` | Get SOL balance for any cluster (`?cluster=testnet`) |

### Endpoint Details

#### `POST /api/build`

```
Body: { programName: string, files: { path: string, content: string }[] }
Steps:
  1. Scaffold Anchor project structure in /tmp
  2. Write source files + Anchor.toml + Cargo.toml
  3. Copy pre-built Cargo.lock for faster deps
  4. Generate lockfile if needed
  5. Run `anchor build` (internally calls `cargo build-sbf`)
  6. Return .so bytecode (base64) + programId + programKeypair (base64)
```

#### `POST /api/simulate`

```
Body: { bytecodeBase64: string, authoritySecretKey: string, programKeypair?: string, cluster?: string }
Steps:
  1. Validate and write authority keypair + program binary
  2. Get authority SOL balance for the target cluster
  3. Derive program ID from program keypair (if provided)
  4. Check if program ID already exists on chain (upgrade vs fresh deploy)
  5. Estimate rent-exempt cost from bytecode size (~0.0035 SOL/KB)
  6. Return: bytecodeSize, estimatedRentSol, authorityBalance, hasSufficientBalance, programExists
```

#### `POST /api/debug-cpi`

```
Mode 1 — Parse raw logs:
  Body: { rawLogs: string }
  Parses Solana simulation log output into structured CPI call tree.
  Returns: { cpiTree: CpiNode[], summary, rawLogs }

Mode 2 — Auto-trace (if solana-test-validator available):
  Body: { bytecodeBase64: string, idl?: object }
  Starts ephemeral test validator, deploys program, simulates execution,
  captures and parses CPI trace. Falls back gracefully if validator unavailable.

CpiNode structure:
  { programId, depth, computeUnits, success, error?, children: CpiNode[] }
```

#### `POST /api/deploy`

```
Body: { bytecodeBase64: string, authoritySecretKey: string, programKeypair?: string, cluster?: string }
Steps:
  1. Validate authoritySecretKey is 64 bytes
  2. Write authority keypair + program binary to /tmp
  3. Configure solana CLI with authority keypair for target cluster
  4. Run `solana program deploy` with optional --program-id
  5. Return transaction signature + program ID
```

#### `POST /api/airdrop`

```
Body: { address: string, amount?: number, cluster?: string }
Strategy (tried in order):
  1. Faucet transfer (if FAUCET_SECRET_KEY has SOL) — no rate limits
  2. RPC requestAirdrop (shuffled pool, dual HTTP client per endpoint)
     - DEVNET_RPC_URL env var
     - api.devnet.solana.com
     - devnet.helius-rpc.com (if HELIUS_API_KEY set)

     Per endpoint, both approaches are tried:
       a) CLI: solana airdrop (3 retries, exponential backoff 5s→10s→20s)
       b) Web3.js: Connection.requestAirdrop (2 retries, backoff 3s→6s)

     Using two different HTTP clients (CLI's reqwest vs web3.js's fetch)
     helps bypass client-specific blocks or rate-limit counters.
```

---

## 🔧 Shared Packages

### `@solshift/core`

Shared types, constants, and wallet utilities.

```typescript
// Wallet storage (XOR-encrypted with sessionStorage-derived key)
loadWallet(): WalletState | null
saveWallet(wallet: WalletState): void
clearWallet(): void

// Constants
COMPILER_API_URL = 'https://...'
BUILD_LIMITS = { concurrent: 2, payload: '5mb' }
```

**Security**: Wallet secret keys are XOR-encrypted with a key derived from `sessionStorage`, ensuring keys don't persist in `localStorage` as plaintext after tab close.

### `@solshift/engine`

HTTP client for the Compiler API.

```typescript
class CompilerClient {
  constructor(apiUrl?: string)
  build(req: BuildRequest): Promise<BuildResult>
  deploy(bytecode: string, secretKey: string, programKp?: string): Promise<DeployResult>
  airdrop(address: string, amount?: number): Promise<AirdropResult>
  getBalance(address: string): Promise<BalanceResult>
  health(): Promise<HealthResult>
}
```

### `@solshift/shell`

Terminal emulator that simulates Solana CLI commands.

| Command | Action |
|---|---|
| `help` | List available commands |
| `clear` | Clear terminal |
| `solana airdrop <amount> [address]` | Request devnet SOL |
| `solana balance [address]` | Check balance |
| `solana address` | Show wallet public key |
| `anchor build` | Trigger build |
| `anchor deploy` | Trigger deploy |

### `@solshift/plugin-manager`

Project scaffolding and file management.

| Template | Description |
|---|---|
| `ANCHOR_TEMPLATE` | Minimal Anchor program (counter) |
| `SPL_TRANSFER_TEMPLATE` | SPL token transfer example |
| `COINFLIP_TEMPLATE` | Coin flip game program |

---

## 🏗️ Build Pipeline

```
┌─────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Editor  │───▶│  Client  │───▶│   API    │───▶│  Docker  │
│ (Rust)   │    │ Compiler │    │ Express  │    │ Container│
│          │    │ Client   │    │          │    │          │
└─────────┘    └──────────┘    └──────────┘    └──────────┘
                                                    │
                                                    ▼
                                              ┌──────────┐
                                              │  Anchor  │
                                              │  Build   │
                                              │(cargo    │
                                              │ build-sbf)│
                                              └──────────┘
                                                    │
                                                    ▼
                                              ┌──────────┐
                                              │   .so    │
                                              │ Bytecode │
                                              └──────────┘
```

**Flow:**
1. User writes Rust code in Monaco editor
2. Frontend sends `.rs` files to `POST /api/build`
3. API scaffolds project, runs `anchor build`
4. Returns compiled `.so` (base64) + program ID + keypair
5. Frontend shows Build Result panel with Program ID + bytecode size
6. User clicks Deploy → sends to `POST /api/deploy`
7. API runs `solana program deploy` → returns signature

---

## 🚀 Deployment

### Frontend — Vercel

| Setting | Value |
|---|---|
| Framework Preset | Vite |
| Build Command | `npm run build -w packages/* && npm run build` |
| Output Directory | `apps/playground/dist` |
| Auto-deploy | On push to `main` |

### Backend — Railway

| Setting | Value |
|---|---|
| Deploy Method | GitHub Actions (`.github/workflows/secrets.yml`) |
| Trigger | Push to `main` |
| Service Name | `compiler-api` |
| Project | `agile-sparkle` |
| Railway CLI | v3.5.9 (via npx) |
| Auth | `RAILWAY_TOKEN` secret |

**Environment Variables:**

| Variable | Type | Purpose |
|---|---|---|
| `PORT` | Public | Server port (8080) |
| `DEVNET_RPC_URL` | Secret | Custom devnet RPC endpoint |
| `FAUCET_SECRET_KEY` | Secret | Faucet wallet private key (hex) |
| `HELIUS_API_KEY` | Secret | Helius RPC API key for airdrop fallback |
| `MAX_CONCURRENT_BUILDS` | Public | Build queue limit (default 2) |

**Deploy Workflow (`.github/workflows/secrets.yml`):**
```yaml
on: push → main
steps:
  - Checkout code
  - Create .railway/railway.ts with project ID
  - npx railway up --detach --yes
```

---

## 👛 Wallet System

### Wallet Types

| Type | Secret Key | Can Build | Can Deploy | Can Airdrop |
|---|---|---|---|---|
| **Generated** | ✅ Hex (64 bytes) | ✅ | ✅ | ✅ |
| **Imported** | ✅ Hex/JSON/Base58 | ✅ | ✅ | ✅ |
| **Browser (Phantom/Solflare/Backpack)** | ❌ Not exposed | ✅ | ❌ | ✅ |

### Storage

```
localStorage['solpg_wallet'] = XOR_encrypt(JSON.stringify(wallet), sessionKey)
```

- Key derived from `sessionStorage` (per-tab, ephemeral)
- Encrypted with XOR cipher
- Cleared on wallet disconnect

### Browser Wallet Detection

Uses **wallet-standard** events + legacy `window.solana` injection:

1. Listens for `wallet-standard:app-ready` event
2. Queries `window.navigator.wallets` for standard-compliant wallets
3. Falls back to `window.solana` for legacy adapters
4. Supports: Phantom, Solflare, Backpack

---

## 💧 Airdrop System

### Strategy (Server-Side)

```
Request → Faucet transfer (if faucet has SOL) ──✅ Success
        └── No ──→ For each RPC in shuffled pool:
                   ├── CLI: solana airdrop (3 retries, backoff) ──✅ Success
                   └── Web3.js: Connection.requestAirdrop (2 retries, backoff) ──✅ Success
                   └── Next RPC ──→ ...
                  └── All fail ──→ Return error to frontend
```

### Client-Side Fallback

When the server returns an error (faucet dry + all RPCs rate-limited from Railway's IP), the frontend automatically retries `requestAirdrop` directly from the **user's browser**:

```
Frontend receives error ──→ createSolanaRpc().requestAirdrop() from user's IP
                           ├── https://api.devnet.solana.com
                           └── https://devnet.helius-rpc.com
```

- User's IP has its own daily rate limit quota, separate from Railway's
- Uses `@solana/web3.js` v2 (`createSolanaRpc` + `requestAirdrop`)
- No user action needed — happens automatically after backend failure

### Faucet Transfer (Primary)

Uses `solana transfer` from a pre-funded faucet wallet. This is a regular Solana transfer transaction — **no rate limits**.

- Requires `FAUCET_SECRET_KEY` environment variable (hex-encoded 64 bytes)
- Faucet address: `3LymxuUGBT67AXqNJQVkRtbvd7kpywyXoUhpDpob2rgR`
- Fund via [solfaucet.com](https://solfaucet.com), [devnetfaucet.org](https://www.devnetfaucet.org), or [QuickNode faucet](https://faucet.quicknode.com/solana/devnet)

### RPC Fallback (Rate-Limited)

Tries `requestAirdrop` across multiple RPC endpoints in shuffled order:

1. `DEVNET_RPC_URL` env var (custom)
2. `api.devnet.solana.com` (public)
3. `devnet.helius-rpc.com` (with API key, if `HELIUS_API_KEY` set)

Each endpoint uses two concurrent HTTP strategies:

| Strategy | Client | Retries | Backoff |
|---|---|---|---|
| CLI solana airdrop | reqwest (C library) | 3 | 5s → 10s → 20s |
| Web3.js Connection.requestAirdrop | fetch (Node.js) | 2 | 3s → 6s |

This dual-approach per endpoint provides resilience against client-specific blocks.

### Faucet Bootstrap

`POST /api/faucet-fund` — generates a fresh keypair, airdrops 2 SOL via RPC (CLI + web3.js fallback), then auto-transfers to the faucet wallet.

---

## 🎯 Use Cases

| Use Case | Flow |
|---|---|
| **Learning Solana** | User reads docs, writes Anchor program, builds, deploys, verifies on explorer |
| **Prototyping** | Rapid iteration: edit → build → deploy cycle in under 2 minutes |
| **Testing dApps** | Generate test wallets, airdrop devnet SOL, deploy and test programs |
| **CI/CD Integration** | Frontend API can be called programmatically for automated testing |
| **Education** | Workshops and tutorials — no local setup required |
| **Audit Preparation** | Review and verify program bytecode before mainnet deployment |

---

## 🛠️ Tech Stack

| Category | Technology | Version |
|---|---|---|
| **Frontend** | React | 19 |
| | Vite | 6 |
| | TypeScript | 5 |
| | Monaco Editor | latest |
| **Backend** | Node.js | 20 |
| | Express | 4 |
| | TypeScript | 5 |
| **Blockchain** | Solana CLI | 1.18.18 |
| | Anchor Framework | 0.30.1 |
| | Rust | 1.85.1 / 1.75.0 |
| | platform-tools | v1.41 |
| **Infrastructure** | Docker | multi-stage build |
| | Railway | backend hosting |
| | Vercel | frontend hosting |
| | GitHub Actions | CI/CD |

---

## 🔄 Data Flow

### Build Flow

```
User writes code
       │
       ▼
Monaco Editor ──(onChange)──▶ ProjectManager.updateFile()
       │
User clicks "Build"
       │
       ▼
handleBuild()
       │
       ▼
CompilerClient.build(files)
       │
       ▼
POST /api/build { programName, files }
       │
       ▼
buildService.ts:
  ├── mkdir + write files to /tmp
  ├── anchor build (docker)
  ├── read .so bytecode
  └── return { success, programId, program( base64) }
       │
       ▼
App.tsx:
  ├── setBuiltBytecode(result.program)
  ├── setBuiltKeypair(result.programKeypair)
  ├── setBuildResult({ programId, bytecodeSize })
  └── Terminal: "Build complete."
```

### Deploy Flow (with Simulation)

```
User clicks "Simulate Deploy"
       │
       ▼
handleSimulate()
       │
       ▼
POST /api/simulate { bytecode, authorityKey, programKp, cluster }
       │
       ▼
Backend:
  ├── Get authority balance for cluster
  ├── Derive program ID from keypair
  ├── Check if program ID already exists
  ├── Estimate rent from bytecode size
  └── Return { rent, balance, sufficient, exists }
       │
       ▼
BuildResult panel:
  ├── Shows estimated rent cost
  ├── Shows authority balance
  ├── Warns if insufficient
  └── Enables "Deploy" only if sufficient
       │
User clicks "Deploy"
       │
       ▼
handleDeploy()
       │
       ▼
POST /api/deploy { bytecode, authorityKey, programKp, cluster }
       │
       ▼
Backend: solana program deploy --url <cluster-rpc>
       │
       ▼
Return { signature, programId }
```

### Airdrop Flow

```
User clicks "AirDrop SOL"
       │
       ▼
handleAirdrop()
       │
       ├──────────────────────────────────────┐
       ▼                                      │
CompilerClient.airdrop(address, amount)        │
       │                                      │
       ▼                                      │
POST /api/airdrop { address, amount }          │
       │                                      │
       ▼                                      │
index.ts (server-side):                       │
  ├── Faucet path (FAUCET_SECRET_KEY set?)    │
  │   ├── YES → solana transfer → return ✅    │
  │   └── NO  → fall through                  │
  ├── RPC fallback (shuffled pool)            │
  │   For each RPC:                           │
  │   ├── CLI solana airdrop × 3 retries      │
  │   └── Web3.js requestAirdrop × 2 retries  │
  └── All fail → return { error } ────────────┘
                                               │
                                               ▼
                              Client-side fallback (App.tsx):
                              ├── "Backend busy, retrying from browser..."
                              ├── createSolanaRpc(url).requestAirdrop()
                              │   └── success → show tx hash ✅
                              └── all fail → show original error
```

---

## 🔒 Security

| Concern | Mitigation |
|---|---|
| **Wallet secret keys** | XOR-encrypted in localStorage, key from sessionStorage |
| **API authentication** | Railway deployment uses RAILWAY_TOKEN (GitHub secret) |
| **CORS** | Backend allows all origins (development service) |
| **Payload limits** | 5MB JSON limit on Express |
| **Build isolation** | Each build in unique /tmp directory, cleaned after |
| **Docker isolation** | Containerized build environment |
| **Faucet key** | Stored as Railway secret, not in code |
| **Frontend secrets** | API URL is public; no secrets in client bundle |

---

## 📊 Performance

| Metric | Target |
|---|---|
| Build time (cold) | < 2 min (dependency download) |
| Build time (warm) | < 15 sec (cached lockfile) |
| Deploy time | < 30 sec |
| Airdrop (faucet) | < 5 sec |
| Airdrop (RPC server) | < 120 sec (CLI + web3.js dual retries) |
| Airdrop (client fallback) | < 15 sec (single request from browser) |
| Simulate | < 15 sec (balance check + program lookup) |
| Concurrent builds | 2 max |

---

## 🧪 Testing

```bash
# Frontend typecheck
cd apps/playground && npx tsc --noEmit

# Backend typecheck
cd services/compiler && npx tsc --noEmit

# Build test (from API)
curl -X POST https://.../api/build \
  -H "Content-Type: application/json" \
  -d '{"programName":"test","files":[{"path":"lib.rs","content":"..."}]}'
```

---

---

## 🧭 Roadmap — Next Evolution

The following architectural upgrades transform the playground from a basic IDE into a professional Solana development platform. Items marked ✅ are implemented.

### 1. Sandboxed Per-Build Execution ⏳

| Current | Target |
|---|---|
| All builds share the same Docker container and `/tmp` namespace | Each build gets an **isolated sandbox** (Firecracker microVM, gVisor, or ephemeral Docker container) |
| Temp dir cleanup with `fs.rm().catch(())` — race conditions under load | Hard resource limits per sandbox (CPU, memory, disk, network) |
| No network isolation — builds can reach the internet | **Air-gapped** by default, opt-in network for dependency fetching |
| State leaks between builds via shared filesystem | Clean-room filesystem per sandbox, destroyed on completion |

**Why:** Prevents malicious programs from exfiltrating data, ensures reproducible builds, and eliminates cross-build contamination. This is the difference between a CRUD endpoint and a secure build platform.

### 2. Real Job Queue (BullMQ + Redis) ⏳

| Current | Target |
|---|---|
| `activeBuilds` in-memory counter | BullMQ queue with Redis persistence |
| Lost on restart — `activeBuilds` resets to 0 | Survives restarts, survives replica scaling |
| `MAX_CONCURRENT_BUILDS = 2` per process | Dynamic scaling — queue workers auto-scale |
| No build history — result lost on restart | Persistent job history — status, logs, artifacts |
| No retry on failure | Automatic retry with configurable policy |

```
┌──────────┐    ┌──────────┐    ┌────────────┐
│  Client  │───▶│  BullMQ  │───▶│  Worker 1  │
│          │    │  (Redis) │    ├────────────┤
│          │    │          │    │  Worker 2  │
│          │    │          │    ├────────────┤
│          │    │          │    │  Worker N  │
└──────────┘    └──────────┘    └────────────┘
```

**Why:** The current in-memory approach cannot scale beyond a single process. A queue architecture enables horizontal scaling, persistence, and observability.

### 3. Program Simulation Before Deploy ✅

Run a **simulated transaction** against the built program to catch failures before spending SOL on deployment:

```
Build .so ──→ Simulate deploy transaction ──→ Show user:
                                               ├── Estimated rent cost (SOL)
                                               ├── Account space needed (bytes)
                                               ├── Expected program ID
                                               └── Simulation errors (if any)
```

- Uses `solana program deploy --simulate` or raw `solana simulate`
- Shows users **exactly** what will happen before they commit
- Detects: insufficient balance, account conflicts, rent-exemption failures, BPF loader version mismatches

**Why:** Deployment costs SOL — users should never learn about rent or account space the hard way. This is the "type-check before compile" moment for Solana.

### 4. PDA / Account Visualizer ✅

Given an IDL, auto-derive and display **every account** a transaction will touch:

```
Transaction: initializeCounter(user, counter)
              │
              ├── User Account (signer)
              │   ├── Address: 3Lymx...2rgR
              │   ├── Lamports: 2.5 SOL
              │   └── Owner: System Program
              │
              ├── Counter Account (PDA)
              │   ├── Address: 8fG7...9aB2
              │   ├── Seeds: ["counter", user] + bump
              │   ├── Space: 40 bytes
              │   ├── Rent: 0.002 SOL
              │   └── Owner: Counter Program (new)
              │
              └── System Program (CPM)
                  └── Transfers: 0.002 SOL (rent)
```

- **Seeds + bump derivation** shown explicitly so users understand PDAs
- **Rent cost** shown per account — instant mental model for "why does Solana need rent?"
- **Account hierarchy** visualised as a tree — shows relationship between accounts
- **"Why this matters"** tooltips connect Solana's account model to the UI

**Goal:** The visualizer should trigger the "I understand why Solana's architecture is different from EVM" insight in under 30 seconds.

### 5. CPI Debugging View ✅

Trace cross-program invocations during transaction execution:

```
Transaction Flow:
  ┌──────────────────────────────────────────────┐
  │  User → Counter Program                      │
  │    ├── CPI: System Program (create_account)  │
  │    │     ├── Input: user, counter PDA        │
  │    │     └── Output: account created         │
  │    ├── CPI: Counter Program (initialize)     │
  │    │     ├── Input: counter PDA              │
  │    │     └── Output: counter.data = 0        │
  │    └── Result: CounterInitialized { count:0 }│
  └──────────────────────────────────────────────┘
```

- **Real CPI trace** from `solana simulate` output
- **Nested call tree** — each CPI is a child node
- **Account mutations** shown per instruction (which accounts changed, by how much)
- **Error pinpointing** — if a CPI fails, highlight the exact call that failed

### 6. One-Click Program Templates ✅

Pre-built, deployable program templates with one click:

| Template | Description | Accounts | CPI Targets |
|---|---|---|---|
| **Counter** | Minimal Anchor example | 2 | None |
| **Token Vault** | SPL token escrow | 4 | Token Program |
| **NFT Minter** | Metaplex-compatible mint | 5 | Token + Metaplex |
| **Staking** | Stake SOL, earn rewards | 6 | System + Token |
| **AMM** | Constant product market maker | 7 | Token Program |

Each template includes:
- Ready-to-deploy Rust source
- Pre-generated IDL
- Auto-generated TS client
- Visualized account model

### 7. Auto-Generated TypeScript Client from IDL

```
Build → IDL → Auto-generate → @project/client/
  ├── index.ts           (all instructions)
  ├── accounts/          (account decoders)
  ├── instructions/      (typed instruction builders)
  ├── errors/            (typed error classes)
  └── types.ts           (TypeScript types)
```

- Generated on build, downloadable as a package
- Compatible with `@project-serum/anchor` or standalone
- **Live in the editor** — user can `import` it immediately after build

### 8. Shareable Project Links

```
solphg.app/p/SURUJ404/counter-amm-7f8a3
```

- Encodes full project state (files, dependencies, cluster)
- **Read-only by default** — recipient can fork
- Version-pinned — links always compile the same thing
- Embeddable — `<iframe>` for docs/tutorials

### 9. Multi-Cluster Switching ✅

| Cluster | RPC Endpoint | Wallet State | Explorer Link |
|---|---|---|---|
| **Devnet** | `api.devnet.solana.com` | devnet-wallet-1 | ✅ |
| **Testnet** | `api.testnet.solana.com` | testnet-wallet-1 | ✅ |
| **Mainnet** | Custom RPC | mainnet-wallet-1 | ✅ (read-only) |

- **Per-cluster wallet state** — different keys for different clusters
- **Balance shown per cluster** — no confusion about which network you're on
- **Cluster badge** prominently displayed in the toolbar
- **Mainnet is read-only** — build + simulate only, deploy blocked by confirmation dialog

### 10. Persistent Build Cache Per User

```
User: SURUJ404
  └── Project: counter-amm
       ├── .anchor/          (cached Anchor build artifacts)
       ├── target/deploy/    (cached .so files)
       └── target/idl/       (cached IDL)
```

- **Per-user S3/GCS bucket** keyed by project hash + dependency lockfile hash
- **Warm build**: < 5 seconds (skip `cargo build-sbf`, use cached artifact)
- **Cold build**: < 2 minutes (first time)
- **Cache busting**: lockfile change, Solana CLI version change, or manual "rebuild clean"
- Solves the **"first anchor build takes forever"** pain point directly

**Why:** The #1 complaint about web-based Solana IDEs is slow builds. A persistent cache makes repeat builds instant, matching the local development experience.

---

## 📚 References

- [Solana Documentation](https://solana.com/docs)
- [Anchor Framework](https://www.anchor-lang.com/)
- [Solana Devnet Faucet](https://faucet.solana.com)
- [Railway Documentation](https://docs.railway.app/)
- [Vite Documentation](https://vitejs.dev/)
- [BullMQ](https://bullmq.io/) — Redis-backed job queue
- [Firecracker](https://firecracker-microvm.github.io/) — Secure microVM for sandboxed execution

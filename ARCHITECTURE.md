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
| **Airdrop** | Get devnet SOL via faucet wallet or RPC fallback |
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
  isAirdropping: boolean
  apiConnected: boolean | undefined
  activeSidebar: 'files' | 'search' | 'docs' | 'settings' | ''
}
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
| `POST` | `/api/deploy` | Deploy program to Solana Devnet |
| `POST` | `/api/airdrop` | Request devnet SOL (faucet transfer + RPC fallback) |
| `POST` | `/api/faucet-fund` | Bootstrap faucet wallet with fresh airdrop |
| `GET` | `/api/balance/:address` | Get devnet SOL balance |

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

#### `POST /api/deploy`

```
Body: { bytecodeBase64: string, authoritySecretKey: string, programKeypair?: string }
Steps:
  1. Validate authoritySecretKey is 64 bytes
  2. Write authority keypair + program binary to /tmp
  3. Configure solana CLI with authority keypair
  4. Run `solana program deploy` with optional --program-id
  5. Return transaction signature + program ID
```

#### `POST /api/airdrop`

```
Body: { address: string, amount?: number }
Strategy (tried in order):
  1. Faucet transfer (if FAUCET_SECRET_KEY has SOL) — no rate limits
  2. RPC requestAirdrop (shuffled pool, 3 retries each)
     - DEVNET_RPC_URL env var
     - api.devnet.solana.com
     - devnet.helius-rpc.com (if HELIUS_API_KEY set)
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

### Strategy

```
Request → Faucet transfer (if faucet has SOL)
        └── No ──→ requestAirdrop (shuffled RPC pool, 3 retries each)
                  └── All fail ──→ Error with faucet funding instructions
```

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

Each endpoint gets 3 attempts with exponential backoff (5s → 10s → 30s).

### Faucet Bootstrap

`POST /api/faucet-fund` — generates a fresh keypair, airdrops 2 SOL via RPC, then auto-transfers to the faucet wallet.

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

### Deploy Flow

```
User clicks "Deploy"
       │
       ▼
handleDeploy()
       │
       ▼
Check: builtBytecode? wallet? wallet.secretKey?
       │
       ▼
CompilerClient.deploy(bytecode, secretKey, programKp)
       │
       ▼
POST /api/deploy { bytecodeBase64, authoritySecretKey, programKeypair }
       │
       ▼
index.ts:
  ├── Validate secret key (64 bytes)
  ├── Write authority keypair file
  ├── Write program binary
  ├── solana config set --keypair authority
  └── solana program deploy
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
       ▼
CompilerClient.airdrop(address, amount)
       │
       ▼
POST /api/airdrop { address, amount }
       │
       ▼
index.ts:
  ├── Faucet path (FAUCET_SECRET_KEY set?)
  │   ├── YES → solana transfer --keypair faucet → return
  │   └── NO  → fall through
  ├── RPC fallback (shuffled pool)
  │   ├── Try RPC 1 → 3 retries
  │   ├── Try RPC 2 → 3 retries
  │   └── Try RPC 3 → 3 retries
  └── All fail → error + funding instructions
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
| Airdrop (RPC) | < 60 sec (with retries) |
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

## 📚 References

- [Solana Documentation](https://solana.com/docs)
- [Anchor Framework](https://www.anchor-lang.com/)
- [Solana Devnet Faucet](https://faucet.solana.com)
- [Railway Documentation](https://docs.railway.app/)
- [Vite Documentation](https://vitejs.dev/)

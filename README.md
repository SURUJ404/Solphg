# Solphg — Solana Playground

A browser-based IDE for writing, compiling, and deploying Solana Anchor programs — no local toolchain required.

## Architecture

```
apps/playground (Vite + React SPA) ─── HTTP ─── services/compiler (Express + Solana CLI)
                                                       │
                                                       ├── POST /api/build      → cargo build-sbf
                                                       ├── POST /api/deploy     → solana program deploy
                                                       ├── POST /api/simulate   → rent est. + balance + conflict check
                                                       ├── POST /api/debug-cpi  → CPI tree parser (logs / auto-trace)
                                                       ├── POST /api/airdrop    → faucet + RPC pool + client fallback
                                                       ├── POST /api/faucet-fund→ bootstrap faucet wallet
                                                       ├── GET  /api/balance    → solana balance (any cluster)
                                                       └── GET  /api/health
```

**Frontend** → Vite React SPA with Monaco editor, terminal emulator, file explorer, and wallet panel. Communicates with the build service over HTTP.

**API** → Express server in a Docker image with the full Solana CLI + Anchor + Rust toolchain. Accepts source files, compiles to SBF bytecode, and returns program binaries.

**Hosting** → Frontend on Vercel, API on Railway. The frontend connects to the Railway API for all builds, deploys, and RPC operations.

## Directory Layout

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
  Dockerfile          Multi-stage image (toolchain + Node)
```

## Monorepo Packages

| Package | Role |
|---|---|
| `@solshift/core` | Shared types (`SolpgProject`, `WalletState`, `TerminalLine`, IDL interfaces), constants (program IDs, endpoints), wallet persistence |
| `@solshift/engine` | `CompilerClient` — `build()`, `deploy()`, `simulate()`, `debugCpi()`, `airdrop()`, `getBalance()`, `health()` |
| `@solshift/shell` | `TerminalEmulator` — interprets `solana airdrop`, `anchor build`, etc. |
| `@solshift/plugin-manager` | `ProjectManager` — scaffold projects from templates, manage files |
| `@solshift/integrations` | Extension stubs for future tooling |

## Build Flow

1. User writes Rust code in the Monaco editor
2. Click Build → `CompilerClient.build()` sends `.rs` files to the API
3. API scaffolds an Anchor project (`Cargo.toml`, `Anchor.toml`, etc.)
4. Runs `cargo build-sbf --offline` (with persistent cargo cache)
5. Returns base64 `.so` bytecode, `programId`, and `programKeypair`
6. User can then Deploy — API calls `solana program deploy --program-id`

## Getting Started

```bash
# Install dependencies
npm install

# Run frontend locally (connects to Railway API)
cd apps/playground
cp .env.example .env   # or set VITE_COMPILER_API_URL
npm run dev
```

## Documentation

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — System architecture, API endpoints, deployment, roadmap
- [`docs/HOW_AND_WHY.md`](./docs/HOW_AND_WHY.md) — Deep dive into why each feature exists and how it works (CPI debugger, airdrop, simulation, templates, wallet, etc.)

## Deployment

- **Frontend**: Pushed to `main` → auto-deploys to Vercel
- **API**: `cd services/compiler && npx railway up --service agile-sparkle`

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Monaco Editor
- **Backend**: Express, TypeScript, Solana CLI 1.18, Anchor 0.30
- **Infrastructure**: Docker, Railway, Vercel, Solana Devnet

# How & Why — Solphg Internals

Every feature in Solphg exists because of a specific pain point in Solana
development. This document explains the reasoning behind each design decision
and how each piece works under the hood.

---

## 1. CPI Debugger

### Why

Cross-Program Invocation (CPI) is how Solana programs call other programs.
When a transaction fails, the error message often says something generic like
"Program failed to complete". The developer has no idea *which* CPI call
failed, *why* it failed, or how much compute each call consumed.

The CPI debugger exists to answer three questions:
- Which programs were called?
- Did each call succeed or fail?
- How much compute did each call use?

### How

**Two modes:**

1. **Log parsing** — The user pastes raw `solana simulate` output. The parser
   walks line-by-line:
   - `"Program <id> invoke [<depth>]"` → pushes a new node onto the stack
   - `"Program <id> consumed <n> of <m>"` → searches the stack backward by
     program ID to assign compute units (not just `stack[-1]`, because CU
     lines may appear after the program has been popped)
   - `"Program <id> success"` → pops the stack, marks node as successful
   - `"Program <id> failed: <message>"` → pops the stack, extracts the error
     message into the node's `error` field

   The regex splits `success` and `failed:` into separate matchers. This is
   critical: `"Program 2222 failed: custom program error: 0x1"` must be caught
   by the `failed: <message>` pattern, not by a generic `(success|failed)`
   pattern that would discard the error message.

2. **Auto-trace** — The backend receives compiled bytecode, starts a local
   `solana-test-validator`, deploys the program, simulates a transaction, then
   captures and parses the log output. If the validator can't start (common in
   serverless environments like Railway), it bails out in ~2.5s with a
   fallback message directing the user to the Paste Raw Logs feature.

The frontend `CpiDebugView` component renders the resulting tree with
color-coded success/failure dots, collapsible nesting, and raw log toggle.
The `CpiLogParser` sub-component runs the *exact same parsing logic*
client-side so users can paste arbitrary logs without any backend call.

### Design Decisions

| Decision | Why |
|----------|-----|
| Stack-based parser | CPI calls are naturally nested — the stack mirrors the call hierarchy |
| Search CU by program ID, not stack position | Log lines can arrive out of order (CU after failed), and popped nodes are gone from the stack |
| Separate `success` / `failed:` matchers | A `(success\|failed)` regex swallows the error text |
| Recursive `allSuccessful` check | A single failed child means the entire transaction failed — top-level `success` must reflect the whole tree |
| Auto-trace fallback message | Not every environment can run a validator; paste-raw-logs is always available as a client-side fallback |

---

## 2. Airdrop System

### Why

Every Solana developer needs devnet SOL to deploy and test programs. Public
RPC endpoints (Helius, public solana.com, QuickNode) each have daily rate
limits. Railway's IP address is shared, so all limits get exhausted quickly
from a single deploy. The faucet wallet also runs dry.

### How

The airdrop handler tries four strategies in order, each with its own
rate-limit pool:

```
Request
  ├── 1. Faucet transfer (solana transfer from pre-funded wallet)
  │       No rate limit — it's a real transaction, not a faucet request
  │       Requires FAUCET_SECRET_KEY env var
  │       Instant (< 5s)
  │
  ├── 2. CLI solana airdrop (per RPC in shuffled pool, 20s timeout)
  │       Uses reqwest HTTP client (C library, different from Node.js fetch)
  │       One attempt per RPC, then move on
  │
  ├── 3. Web3.js Connection.requestAirdrop (per RPC)
  │       Uses Node.js fetch (different HTTP client than CLI)
  │       May have different rate-limit tracking
  │
  └── 4. Client-side browser fallback
        Runs from the user's browser IP — completely separate rate-limit pool
        Uses @solana/web3.js v2 createSolanaRpc().requestAirdrop()
        Automatic — no user action needed
```

**Hard deadline:** All strategies combined have a 25s total timeout. If all
fail, the endpoint returns a clear error message with funding instructions
instead of retrying for 2+ minutes.

### Design Decisions

| Decision | Why |
|----------|-----|
| Shuffle RPC pool order | Distributes load evenly across endpoints |
| Dual HTTP client per RPC | Different rate-limit counters per client (reqwest vs fetch) |
| 25s hard cap | Better to fail fast with actionable error than hang for 2 minutes |
| Client-side browser fallback | User's home IP has its own daily quota, separate from Railway's |

### Why the old approach failed

The original implementation tried 3 retries per RPC with exponential backoff
(5s → 10s → 20s) for CLI, plus 2 retries (3s → 6s) for web3.js, across 3
RPCs = up to 132 seconds of waiting. All retries hit the same rate limits.
The user got a timeout instead of a helpful error.

---

## 3. Program Simulation

### Why

Deploying a program costs SOL. If the deploy fails (insufficient balance,
program ID already exists, rent too high), the user wastes the transaction
fee and has to figure out what went wrong from a cryptic CLI error.

Simulation exists to answer before spending SOL:
- How much rent-exempt SOL does this program need?
- Does the authority wallet have enough?
- Does the program ID already exist on-chain?

### How

The backend:
1. Writes the bytecode and authority keypair to temp files
2. Calls `solana balance <authority> --url <cluster>` to get current balance
3. Derives program ID from the keypair (or uses the provided one)
4. Calls `solana program show <programId> --url <cluster>` to check if it exists
5. Estimates rent from bytecode size (~0.0035 SOL per KB)
6. Returns all data + a human-readable summary string

The frontend uses this to:
- Show rent cost and balance side by side
- Warn if insufficient
- Disable the Deploy button until balance >= rent
- Detect upgrade vs fresh deploy

---

## 4. Multi-Cluster Switching

### Why

Developers need to test on devnet, stress-test on testnet, and eventually
deploy to mainnet. Each cluster has different RPC endpoints, different
wallet addresses, different explorer URLs. Manually swapping config is
error-prone.

### How

The `CLUSTERS[]` constant in `packages/core/src/constants.ts` defines all
three clusters with their RPC, WebSocket, and explorer URLs:

```typescript
[
  { name: 'devnet',  rpc: 'https://api.devnet.solana.com', ... },
  { name: 'testnet', rpc: 'https://api.testnet.solana.com', ... },
  { name: 'mainnet', rpc: 'https://api.mainnet-beta.solana.com', ... },
]
```

- Cluster state is stored in `localStorage` and propagated via `?cluster=`
  query param on API calls
- Each cluster has its own wallet in local storage — switching clusters
  switches wallets
- The Toolbar shows a dropdown with the current cluster prominently displayed
- Mainnet is read-only: build + simulate work, deploy shows a confirmation
  dialog

---

## 5. One-Click Templates

### Why

Starting an Anchor project from scratch requires:
1. Installing Anchor CLI
2. Running `anchor init`
3. Understanding the project structure
4. Writing boilerplate

Templates remove all friction — one click gives you a complete, deployable
project.

### How

Four templates are defined in `packages/plugin-manager/src/templates.ts`:

| Template | Programs | Learning Goal |
|----------|----------|---------------|
| Counter (Anchor) | 1 | Basic state management, PDA derivation |
| Hello World (Native) | 1 | Raw Solana BPF programming (no framework) |
| SPL Token Transfer | 2 | Cross-program invocation with Token Program |
| Coin Flip Game | 2 | Randomness, account validation, CPI |

When selected, `ProjectManager.createFromTemplate()` creates files (lib.rs,
Cargo.toml, Anchor.toml, test files, TS client) and loads them into the
editor. The user can build and deploy immediately without writing a line.

---

## 6. PDA / Account Visualizer

### Why

Solana's account model is fundamentally different from EVM. New developers
struggle with concepts like PDAs, rent-exemption, seeds, and bump
derivation. The visualizer makes these concepts tangible.

### How

Given a program ID and cluster, the visualizer:
1. Determines known PDAs from the program's IDL (if available)
2. Derives PDA addresses using `PublicKey.findProgramAddress()` with the
   correct seeds
3. Shows the seed derivation chain for each PDA
4. Queries each account's balance and owner via RPC
5. Renders a tree view: signers at root, PDAs as children, system program as
   leaf
6. Shows rent cost per account with an educational tooltip explaining *why*
   Solana requires rent (unlike Ethereum's one-time storage fee)

---

## 7. Wallet System

### Why

Solana programs need a keypair to sign transactions. Browser wallets
(Phantom, Backpack) don't expose the private key — they sign through a
secure API. For program deployment, the backend needs the raw private key to
call `solana program deploy`.

### How

Three wallet types:

| Type | Secret Key | Deployment | Storage |
|------|-----------|------------|---------|
| Generated | Hex (64 bytes) | ✅ Backend signs | XOR-encrypted in localStorage |
| Imported | Hex/JSON/Base58 | ✅ Backend signs | XOR-encrypted in localStorage |
| Browser (Phantom etc.) | Not exposed | ❌ (no raw key) | Wallet adapter only |

**Security:** Wallet keys are XOR-encrypted with a key derived from
`sessionStorage` (ephemeral per-tab). On tab close, the encryption key is
lost, making the stored ciphertext useless.

**Browser wallet detection** uses the wallet-standard protocol:
1. Listens for `wallet-standard:app-ready` event
2. Queries `window.navigator.wallets` for standard-compliant wallets
3. Falls back to `window.solana` for legacy adapters
4. Supports: Phantom, Solflare, Backpack

---

## 8. Build Pipeline

### Why

Compiling a Solana program requires the full Rust toolchain with Solana's SBF
target, Anchor framework, and platform-tools. Installing all of this locally
is the #1 barrier for new developers.

### How

The Railway backend has a Docker image with:
- Rust 1.75 + Solana platform-tools v1.41
- Anchor CLI 0.30.1
- Solana CLI 1.18.18
- Pre-built Cargo.lock (cached dependencies)

When the user clicks Build:
1. Frontend sends `.rs` source files to `POST /api/build`
2. Backend scaffolds a complete Anchor project (lib.rs, Cargo.toml,
   Anchor.toml, Xargo.toml) in `/tmp/<uuid>`
3. Copies pre-generated Cargo.lock so dependency resolution is instant
4. Runs `anchor build` (which internally calls `cargo build-sbf`)
5. Reads the resulting `.so` file, base64-encodes it, returns with programId
   and keypair
6. Frontend stores the bytecode and shows the BuildResult panel

Warm builds take ~15s. Cold builds (first time, downloading deps) take ~2min.

---

## 9. Deployment

### Why

`solana program deploy` is the final step — it uploads the compiled bytecode
to the Solana cluster and creates the program account. The API automates this
so users don't need the CLI.

### How

1. Frontend sends bytecode + authority secret key (64 hex bytes) + optional
   program keypair to `POST /api/deploy`
2. Backend writes the keypair and program binary to temp files
3. Configures `solana` CLI to use the authority keypair: `solana config set
   --keypair <path> --url <cluster>`
4. Runs `solana program deploy <program.so> --program-id <keypair>`
5. Returns transaction signature + deployed program ID
6. Frontend shows the result with an explorer link

Browser wallets (Phantom etc.) cannot deploy because they don't expose the
private key. Users must generate or import a wallet.

---

## 10. Terminal Emulator

### Why

Users expect a terminal in an IDE. The emulator provides familiar Solana CLI
commands (`solana airdrop`, `solana balance`, `anchor build`) that trigger
the real API under the hood.

### How

`packages/shell/src/terminal.ts` implements a simple parser:
- `solana airdrop <amount> [address]` → calls `CompilerClient.airdrop()`
- `solana balance [address]` → calls `CompilerClient.getBalance()`
- `anchor build` → triggers frontend build handler
- `anchor deploy` → triggers frontend deploy handler
- `help` / `clear` → local emulator commands

The terminal UI (`TerminalPanel.tsx`) renders a scrollable list of
`TerminalLine` objects with type-based styling (system, output, error).

---

## Summary: Why Things Are the Way They Are

| Problem | Solution | Why This Way |
|---------|----------|--------------|
| CPI failures have cryptic errors | CPI tree parser with error extraction | Developers need to see *which* call failed and *why* |
| Airdrop rate limits exhaust quickly | Multi-strategy: faucet → CLI → web3.js → browser fallback | Each strategy hits a different rate-limit bucket |
| Deploy costs SOL | Simulation before deploy | Never waste SOL on a deploy that will fail |
| Hard to switch networks | Cluster selector with per-cluster wallet state | Each network needs different keys and RPCs |
| Starting from scratch is slow | One-click templates | Remove friction from the first "hello world" |
| Account model is confusing | PDA visualizer with seeds and rent | Make abstract concepts tangible |
| Can't deploy with browser wallets | Generate/import wallet gives raw key | `solana program deploy` needs the raw key |
| Local toolchain is heavy | Remote Docker build service | No installs, no setup, works from any browser |

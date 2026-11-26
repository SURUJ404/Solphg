# Security controls and deployment boundaries

This document describes the security controls in the current tree, what actually
enforces them, and what remains unverified. It is written for the Phase 2
security hardening pass; it is **not** a claim that the service is safe to expose
to the public without the verification steps at the end.

## Threat model

The compiler API accepts anonymous, untrusted input and does two dangerous
things with it:

1. **Compiles arbitrary Rust/Anchor source.** `build.rs` scripts and procedural
   macros execute on the server during `anchor build`. They can read files,
   open network connections, consume CPU/memory, and spawn processes. The only
   durable boundary is the OS container in which compilation happens.
2. **Handles key material.** `/api/deploy` and `/api/simulate` receive a
   caller-supplied authority secret, and the faucet holds a server-side secret
   used to fund devnet accounts.

The browser playground never persists secret keys (see below), but the API
necessarily sees them in memory for the duration of one request.

## Controls in the code

### Untrusted build execution

- `services/compiler/src/buildService.ts` generates `Anchor.toml`/`Cargo.toml`
  server-side, validates `programName` against `^[a-z][a-z0-9_-]{1,63}$`, and
  rejects path traversal in every file path.
- Builds run with `spawn(..., { detached: true })`, an argument-array CLI
  invocation (no shell), a scrubbed environment, per-job `HOME`/`CARGO_HOME`,
  and an output-byte cap. On timeout the entire process group is killed with
  `process.kill(-pid)`.
- `services/compiler/src/exec.ts::toolEnv()` allowlists the environment passed
  to every CLI child. `FAUCET_SECRET_KEY`, `ADMIN_TOKEN`, RPC URLs and arbitrary
  caller env vars are **not** inherited.
- Content-addressed build results are cached with atomic tmp-dir + rename
  writes and an LRU bound. Program keypairs are generated per request and are
  never part of a cache key or cached artifact.

### Command execution and input validation

- There are **no shell-interpolated `execSync` calls** left in
  `services/compiler/src/index.ts`. Every CLI call uses `runFile()` with an
  argument array, so addresses, clusters, URLs and paths cannot be interpreted
  as shell syntax.
- `services/compiler/src/security.ts` validates Solana addresses by parsing and
  re-serializing them as canonical base58, restricts clusters to
  `devnet|testnet|mainnet-beta`, bounds base64 fields by decoded byte length,
  caps SOL amounts, and uses a constant-time token comparison for the admin
  header.
- RPC URLs come only from server config, never from request fields.
- Field limits: bytecode 4 MiB, IDL 512 KiB, raw logs 100,000 chars, JSON body
  `BODY_LIMIT` (default 8 MiB, hard maximum 16 MiB).

### Rate limits, quotas, and faucet spend controls

- `express-rate-limit` applies a global per-IP limiter plus stricter limiters on
  `/api/build`, `/api/deploy`, `/api/airdrop` and write endpoints.
- `services/compiler/src/quota.ts` adds a bounded fixed-window quota per
  `(action, IP)` — default 60 builds and 10 deploys per hour — so a client
  cannot stay just under the per-minute limiter. Quota responses include
  `Retry-After`.
- `services/compiler/src/faucet.ts` persists a daily spending cap (default 50
  SOL) and per-address cooldown (default 1 hour) to disk with atomic writes and
  a serialized reservation chain. It survives process restarts and cannot be
  overspent by concurrent requests. Failed transfers trigger a refund.
- `TRUST_PROXY_HOPS` is validated at startup and must be >= 1 in production, so
  behind Railway's proxy the limiter sees the real client IP rather than one
  shared proxy IP. It is 0 by default in development.

### CORS, configuration, and secrets

- `services/compiler/src/config.ts` fails fast on bad configuration: invalid
  integers, non-HTTPS RPC URLs, wildcard or non-HTTPS production origins, an
  invalid faucet key, or a missing `CORS_ORIGIN` in production.
- CORS is an exact-origin allowlist — no `*.vercel.app` wildcard.
- `services/compiler/src/logger.ts` emits structured JSON and redacts
  secret-looking field names plus 64-byte hex/base64 values. Error responses
  pass through `redactText()`. No request bodies are logged.
- Browser wallet storage (`packages/core/src/wallet.ts`) persists **only** the
  public key. Earlier XOR-"encrypted" secrets are migrated away; the secret
  lives only in React memory for the tab lifetime.
- The API process does not log keys, full bodies, or wallet secret bytes.

### Dependency and CI controls

- Root and compiler lockfiles pass `npm audit --audit-level=high`. The
  `qs`/Express advisory was cleared with the non-breaking Express 4.22.3 bump.
  Residual moderate advisories come from `@solana/web3.js` v1 →
  `jayson`/`stream-json`/`uuid`; clearing them requires a breaking v3 migration
  that is out of scope here.
- GitHub Actions are pinned to commit SHAs.
- Workflow permissions are least-privilege per job.

## Container isolation: where limits are enforced

### Local Docker Compose (`services/docker-compose.yml`)

The API container runs with:

- `read_only: true` root filesystem
- `cap_drop: ALL`
- `security_opt: no-new-privileges:true`
- `pids_limit: 512`, `mem_limit: 4g`, `cpus: 2.0`
- `/tmp` as `noexec,nosuid` tmpfs (128 MiB) for tiny keypair files
- `/workspaces` as an executable `nosuid,nodev` tmpfs (3 GiB), owned by
  uid/gid 10001, used as `BUILD_WORK_DIR`

Build work was moved off `/tmp` because `/tmp` is `noexec` and `anchor build`
needs to execute generated scripts. `docker compose config` confirms the
rendered flags.

### Railway (production)

Railway does **not** expose a Docker socket. The API therefore cannot spawn
sibling build containers, and Docker-level flags such as `read_only`,
`cap_drop`, `no-new-privileges`, `pids_limit`, and explicit tmpfs mounts are
**not enforced by Railway**. On Railway, isolation relies on:

- the hardened `railway.Dockerfile` image: non-root `solbuilder` (uid 10001),
  no shell interpolation, scrubbed child environments, and per-job HOME;
- Railway service resource limits (memory/CPU) configured in the Railway
  dashboard — these must be set manually and are not part of this repo;
- application-level limits: request quotas, build concurrency gate, build
  timeout, output caps, and process-group kill on timeout.

This is a weaker boundary than a per-build container. A malicious `build.rs`
runs as `solbuilder` inside the same container as the API process and can read
anything that user can read (including `/var/lib/solphg/cache` and any secret
mounted into that user's reach). Do not co-locate unrelated secrets with the
build service.

## Build cache operations

The content-addressed cache lives at `BUILD_CACHE_DIR`
(`/var/lib/solphg/cache` in both images). On Railway, mount a persistent volume
there and cap it with `BUILD_CACHE_MAX_ENTRIES` (default 200 LRU entries) plus
the volume's own size limit in the Railway dashboard. The cache is just a
performance optimization: losing it only forces a rebuild.

Cache keys include the source files, `programName`, the generated program ID,
and `TOOLCHAIN_TAG`. To bust every cached artifact after a toolchain change,
set `TOOLCHAIN_TAG` to a new value (for example
`anchor-0.31.1-agave-2.2.7-rust-1.86.0-2026-11-26`) and redeploy. Old entries
are evicted by the LRU bound; they can also be deleted manually from the volume.
Program keypairs are generated per request and are never cached.

The build concurrency gate is defined by the `BuildQueue` interface in
`services/compiler/src/queue.ts`. The default `InMemoryBuildQueue` is
process-local; a Redis/BullMQ implementation is **not** included, so running
more than one API replica would multiply capacity and fragment the cache.
Scale vertically until that implementation exists.

## Verification status

Verified locally:

- `npm run build`, `npx vitest run` (128 tests), and
  `cd services/compiler && npx tsc --noEmit` pass.
- `npm audit --audit-level=high` passes in both the root and
  `services/compiler` lockfiles.
- `docker compose -f services/docker-compose.yml config` renders the expected
  `read_only`, `cap_drop`, `security_opt`, `pids_limit`, `mem_limit`, `cpus`,
  and tmpfs settings.
- `npm run test:smoke:playground` passes locally with Chromium installed: the
  built SPA mounts, launches, builds successfully with an IDL viewer, the
  second build shows a cache hit, and the returned IDL generates a typed
  Anchor 0.31 client preview. The API is stubbed in the browser, so this
  verifies UI wiring, not the compiler.

**Not verified — do not assume these work:**

- The builder image or API image was **not built or run**. The Docker CLI is
  installed (29.9.2) but the daemon was unavailable locally, so neither
  `docker build` nor `npm run test:integration:api` ran. In particular the
  Rust 1.86, Agave 2.2.7, Anchor 0.31.1 installation and the warmed
  registry/platform tools have not been exercised end-to-end. The integration
  script fails with a clear error in that environment rather than skipping.
- Devnet airdrop, deploy, and mainnet confirmation flows were not exercised
  against live clusters.
- Railway enforcement of the resource limits, `TRUST_PROXY_HOPS` behavior
  behind Railway's proxy, and the persistent cache volume were not verified.
- The `cargo audit` step in CI and the new `api-integration` /
  `playground-smoke` jobs have not been observed on GitHub Actions.

Before go-live, build and run the images locally, execute at least one real
build against the container, and confirm the Railway settings in the dashboard.

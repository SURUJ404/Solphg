# Production runbook

This is the operating procedure for Solphg. **Read `docs/SECURITY.md` first**: it
describes which isolation controls are actually enforced and which are not.
Nothing in this repo deploys to production automatically — CI builds and
publishes the builder image, but API and frontend deployments are manual.

## System overview

| Component | Where | Artifact | Notes |
|---|---|---|---|
| Compiler API | Railway service `solphg-api` | `services/railway.Dockerfile` | Built from the GHCR builder image; non-root uid 10001 |
| Builder image | GHCR `ghcr.io/<owner>/solphg-builder` | `services/builder.Dockerfile` | Published by `.github/workflows/ci.yml` on `main` |
| Playground SPA | Vercel | `apps/playground/dist` (`npm run build`) | API URL baked in from `VITE_COMPILER_API_URL` |
| Docs site | GitHub Pages | `docs/` | Deployed by `.github/workflows/static.yml` |
| Build cache | Railway volume | `/var/lib/solphg/cache` | Content-addressed; safe to lose |
| Faucet ledger | Railway volume | `FAUCET_STATE_FILE` | Must persist or daily caps reset |

## Required GitHub repository settings

These are **checks**, not secrets. In `Settings → Branches → Branch protection
rules` for `main`, require the `Quality gate` check (`quality-gate`) to pass
before merge. It only succeeds when all four underlying jobs succeed:

- `Typecheck, test, audit` (`verify`)
- `Builder image` (`builder-image`)
- `API integration` (`api-integration`)
- `Playground smoke` (`playground-smoke`)

Requiring the individual job names instead is also valid, but `Quality gate`
keeps the branch-protection configuration to a single entry.

Secrets used by workflows:

| Secret | Used by | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | CI, release | GHCR push and release creation (provided automatically) |
| `RAILWAY_API_TOKEN` | Manual `railway` CLI | Deploy/rollback (not used by any workflow today) |
| `VERCEL_TOKEN` | Manual `vercel` CLI | Frontend deploy/rollback (not used by any workflow today) |

Do not put `FAUCET_SECRET_KEY`, `ADMIN_TOKEN`, or RPC credentials in a GitHub
secret that gets passed to the frontend build — frontend env vars are public.

## First-time Railway setup (API)

1. Create a Railway project and service. Deploy from the repo using
   `services/railway.Dockerfile` as the Dockerfile. Set the build arg
   `BUILDER_IMAGE` to the image CI published, e.g.
   `ghcr.io/<owner>/solphg-builder:latest` (the default in the file).
2. Add a persistent volume mounted at `/var/lib/solphg`. Set
   `BUILD_CACHE_DIR=/var/lib/solphg/cache` and
   `FAUCET_STATE_FILE=/var/lib/solphg/faucet-state.json` so both survive
   redeploys.
3. Set service limits in the Railway dashboard: memory at least 4 GB and CPU at
   least 2 vCPU, matching `services/docker-compose.yml`. **Railway does not
   enforce Docker's `read_only`, `cap_drop`, `no-new-privileges` or tmpfs
   flags**; the limits you set here are the only OS-level resource boundary.
4. Set a custom domain (or use the Railway-provided `*.up.railway.app` host) and
   terminate TLS there. The API must be reached over HTTPS.
5. Set the environment variables below. `NODE_ENV=production` makes startup
   fail fast on invalid config.

### API environment variables

| Variable | Secret? | Value / notes |
|---|---|---|
| `NODE_ENV` | no | `production` |
| `PORT` | no | `8080` (or Railway's injected port) |
| `CORS_ORIGIN` | no | Exact HTTPS origin of the SPA, e.g. `https://playground.example.com`. No wildcards. |
| `TRUST_PROXY_HOPS` | no | `1` on Railway so rate limits see real client IPs. Must be >= 1 in production. |
| `BODY_LIMIT` | no | `8mb` (hard max 16mb) |
| `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `RATE_LIMIT_BUILD_MAX`, `RATE_LIMIT_DEPLOY_MAX`, `RATE_LIMIT_AIRDROP_MAX`, `RATE_LIMIT_WRITE_MAX` | no | Tune after observing `/api/metrics` |
| `QUOTA_WINDOW_MS`, `BUILD_QUOTA_MAX`, `DEPLOY_QUOTA_MAX` | no | Defaults `3600000`, `60`, `10` |
| `MAX_CONCURRENT_BUILDS` | no | `2` (per replica; see scaling note below) |
| `MAX_CONCURRENT_OPS` | no | `3` |
| `BUILD_TIMEOUT_MS` | no | `180000` |
| `BUILD_WORK_DIR` | no | `/workspaces/build` (executable) |
| `BUILD_CACHE_DIR` | no | `/var/lib/solphg/cache` |
| `BUILD_CACHE_MAX_ENTRIES` | no | `200` LRU entries |
| `TOOLCHAIN_TAG` | no | Bump to bust all cached artifacts after a toolchain change |
| `DEVNET_RPC_URL` | yes | HTTPS only; use a private RPC with a quota |
| `MAINNET_RPC_URL` | yes | HTTPS only |
| `FAUCET_SECRET_KEY` | yes | 128 hex chars (64 bytes). **Never** put this in the frontend. |
| `FAUCET_ADDRESS` | no | Public address to display; derived from the key if omitted |
| `FAUCET_STATE_FILE` | no | `/var/lib/solphg/faucet-state.json` on the persistent volume |
| `FAUCET_MAX_SOL_PER_REQUEST` | no | `2` |
| `FAUCET_DAILY_CAP_SOL` | no | `50` |
| `FAUCET_COOLDOWN_SECONDS` | no | `3600` |
| `ADMIN_TOKEN` | yes | Optional; leave unset to disable `/api/faucet-fund` |
| `ENABLE_LOCAL_VALIDATOR` | no | `false` in production |

Scale **vertically only**. The build queue is in-process
(`InMemoryBuildQueue`); running more than one replica multiplies build
capacity, bypasses quotas per replica, and fragments the cache. Horizontal
scaling requires a Redis-backed `BuildQueue` that does not exist yet.

## Frontend deployment (Vercel)

1. Build with the production API URL baked in:
   `VITE_COMPILER_API_URL=https://api.example.com npm run build`.
2. Optionally set `VITE_FAUCET_ADDRESS` to the public faucet address shown in
   the wallet/docs panels. Leave it unset to hide those panels. This is a
   **public** value; never put a secret key in a `VITE_` variable.
3. Deploy the `dist/` output to Vercel. There is no deploy workflow in this
   repo today; use `vercel --prod` or the dashboard. Record the deployment URL.
4. Confirm the API's `CORS_ORIGIN` includes exactly that URL, and that the
   domain's DNS points at Vercel with HTTPS enabled.
5. Run `npm run smoke:playground` against the deployed URL (see below) or run
   `node smoke-spa.mjs` for the lightweight mount check.

## DNS and TLS checklist

- [ ] API custom domain resolves to the Railway service; TLS certificate valid.
- [ ] SPA custom domain resolves to Vercel; TLS certificate valid.
- [ ] `VITE_COMPILER_API_URL` uses the API's HTTPS domain (no mixed content).
- [ ] API `CORS_ORIGIN` equals the SPA origin (scheme + host + port, no wildcard).
- [ ] No browser console errors about blocked requests or CORS.

## Monitoring and alerts

The API exposes two unauthenticated read-only endpoints:

- `GET /api/health` — status, toolchain versions, build queue depth, cache
  stats, faucet ledger snapshot.
- `GET /api/metrics` — build count, cache hits, error counts by code, duration
  percentiles, queue depth, ops in flight.

Configure an uptime check on `/api/health` (expect HTTP 200 and
`body.status === "ok"`) every 60 seconds from at least two regions. Alert on:

| Condition | Why | First action |
|---|---|---|
| Health endpoint down for 2 consecutive checks | API process or Railway service is down | Check Railway logs, then roll back |
| `5xx` rate > 1% over 10 min | Builds or deploys failing server-side | Inspect `/api/metrics` error codes and structured logs |
| Queue depth pinned at `maxConcurrentBuilds` | Build backlog | Reduce traffic or raise `MAX_CONCURRENT_BUILDS` vertically |
| Faucet `remainingTodaySol` near 0 | Airdrops will start failing | Fund the faucet (below) |
| Cache `entries` at `maxEntries` with low cache-hit ratio | Cache thrashing | Raise `BUILD_CACHE_MAX_ENTRIES` or volume size |
| Any `MAINNET_CONFIRMATION_REQUIRED` count spike | Users attempting mainnet deploys | Verify UI confirm dialog is present |

## Faucet funding and key rotation

**Funding:** send devnet SOL to the address in `GET /api/health` →
`faucet.address`. The per-IP rate limit, per-address cooldown and durable daily
cap are enforced by `FAUCET_STATE_FILE`; do not delete that file to reset caps
unless you intend to reopen spending for the day.

**Rotating a leaked or exhausted key:**

1. Generate a new keypair: `node scripts/generate-faucet.mjs` (or
   `solana-keygen new`) and record the public address.
2. Fund the new address on devnet.
3. Update `FAUCET_SECRET_KEY` in Railway, and `FAUCET_ADDRESS` /
   `VITE_FAUCET_ADDRESS` wherever the public address is shown. Redeploy API and
   SPA.
4. Verify a single airdrop through the UI. The old key should no longer be in
   any dashboard secret or frontend bundle.

## Rollback

### API

Every builder image is published with an immutable `:<sha>` tag. To roll back
the API:

1. Find the last known-good SHA tag in GHCR (or `git log`).
2. In Railway, set the build arg `BUILDER_IMAGE` to
   `ghcr.io/<owner>/solphg-builder:<good-sha>`, or redeploy the previous
   deployment from the Railway dashboard.
3. If the bad release changed `TOOLCHAIN_TAG`, keep that change when rolling
   back if cached artifacts were built with the new toolchain. Otherwise bump
   the tag and clear `/var/lib/solphg/cache` to force clean builds.
4. Verify `GET /api/health` reports the expected `toolchain.toolchainTag` and
   that one real build succeeds.

### Frontend

Promote the previous deployment in Vercel (`Deployments → Promote to
Production`) or redeploy the previous commit. Then verify
`VITE_COMPILER_API_URL` still points at the current API and run the smoke test.

### Database/cache state

There is no database. The cache is disposable: deleting the Railway volume
contents only causes rebuilds. The **faucet ledger is not disposable** —
restoring an old `FAUCET_STATE_FILE` resets spend accounting, so back it up
before any manual volume work.

## Release procedure

1. Confirm CI is green on `main`, including all four required checks above.
2. Tag the release: `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. `.github/workflows/release.yaml` builds, tests, packages `dist/` and attaches
   both zips to a GitHub release with generated notes.
4. Deploy API and SPA in that order, then run the smoke and integration tests
   against production. Record the tag in the deployment description.
5. If anything fails, follow the rollback steps above and open an issue with
   the health/metrics snapshot.

## Verification status

Both tests are wired into CI. Locally, `npm run test:smoke:playground` passed
with Chromium installed; `npm run test:integration:api` could not run because
the Docker daemon was unavailable and failed with an explicit error. The first
CI run of the integration job is therefore a real quality gate, not a
formality.

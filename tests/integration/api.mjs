// API container integration test.
//
// Boots the hardened API container via Docker Compose, builds the shipped
// counter and SPL templates through the real /api/build endpoint, and asserts:
//   1. each build returns a valid ELF .so and an Anchor IDL
//   2. repeating an identical build is served from the content-addressed cache
//
// Run from the repo root with:
//   npm run build
//   npm run test:integration:api
//
// Requires a running Docker daemon. The CI job `api-integration` runs this on
// every push and pull request. If Docker is unavailable the script fails with
// a clear message instead of silently skipping.

import { spawnSync } from 'node:child_process'
import { ANCHOR_TEMPLATE, SPL_TRANSFER_TEMPLATE } from '@solshift/plugin-manager'

const COMPOSE = ['compose', '-f', 'services/docker-compose.yml']
const API = process.env.API_URL || 'http://127.0.0.1:8080'
const PROGRAM_ID = '11111111111111111111111111111111' // deterministic for cache-key stability
const BUILD_TIMEOUT_MS = Number(process.env.BUILD_TIMEOUT_MS || 300_000)
const HEALTH_TIMEOUT_MS = Number(process.env.HEALTH_TIMEOUT_MS || 180_000)

function fail(message) {
  console.error(`\n[api-integration] FAIL: ${message}\n`)
  process.exitCode = 1
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function docker(args, opts = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    stdio: opts.quiet ? 'pipe' : 'inherit',
    ...opts,
  })
  if (result.error) throw new Error(`docker ${args.join(' ')} could not start: ${result.error.message}`)
  if (result.status !== 0) {
    const detail = opts.quiet ? (result.stderr || result.stdout || '').trim() : ''
    throw new Error(`docker ${args.join(' ')} exited ${result.status}${detail ? `: ${detail}` : ''}`)
  }
  return result.stdout || ''
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForHealth() {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS
  let lastError = ''
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(10_000) })
      if (res.ok) {
        const body = await res.json()
        assert(body.status === 'ok', `unexpected health status: ${JSON.stringify(body)}`)
        return body
      }
      lastError = `HTTP ${res.status}`
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
    await sleep(2_000)
  }
  let logs = ''
  try {
    logs = docker([...COMPOSE, 'logs', '--tail', '200', 'build-api'], { quiet: true }).trim()
  } catch {
    // Keep the original health error as the primary failure.
  }
  throw new Error(
    `API did not become healthy within ${HEALTH_TIMEOUT_MS} ms: ${lastError}` +
      (logs ? `\n--- build-api logs ---\n${logs}` : ''),
  )
}

function toBuildRequest(template) {
  const files = template.files
    .filter((file) => file.path.endsWith('.rs'))
    .map((file) => ({ path: file.path, content: file.content }))
  assert(files.length > 0, `template ${template.name} has no Rust source files`)
  return { programName: template.name, programId: PROGRAM_ID, files }
}

async function postBuild(request) {
  const res = await fetch(`${API}/api/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(BUILD_TIMEOUT_MS),
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

function checkArtifact(label, result, { expectCached }) {
  assert(result.status === 200, `${label}: expected HTTP 200, got ${result.status}: ${JSON.stringify(result.body).slice(0, 500)}`)
  const body = result.body
  assert(body.success === true, `${label}: build reported failure: ${JSON.stringify(body).slice(0, 500)}`)
  assert(typeof body.program === 'string' && body.program.length > 100, `${label}: missing or empty .so bytecode`)
  assert(body.cached === expectCached, `${label}: expected cached=${expectCached}, got ${body.cached}`)
  assert(body.programId === PROGRAM_ID, `${label}: program ID mismatch: ${body.programId}`)
  assert(typeof body.cacheKey === 'string' && body.cacheKey.length > 8, `${label}: missing cache key`)
  assert(typeof body.durationMs === 'number', `${label}: missing durationMs`)

  const so = Buffer.from(body.program, 'base64')
  assert(so.length > 4, `${label}: decoded .so is too small (${so.length} bytes)`)
  assert(so[0] === 0x7f && so[1] === 0x45 && so[2] === 0x4c && so[3] === 0x46,
    `${label}: .so is not an ELF binary (first bytes ${so.subarray(0, 4).toString('hex')})`)

  assert(body.idl && typeof body.idl === 'object', `${label}: missing IDL`)
  assert(Array.isArray(body.idl.instructions), `${label}: IDL has no instructions array`)
  assert(body.idl.instructions.length > 0, `${label}: IDL instructions are empty`)
  assert(typeof body.idl.name === 'string' && body.idl.name.length > 0, `${label}: IDL has no name`)
  assert(body.idl.address === PROGRAM_ID, `${label}: IDL address ${body.idl.address} != ${PROGRAM_ID}`)

  return {
    template: label,
    cached: body.cached,
    soBytes: so.length,
    idlName: body.idl.name,
    instructions: body.idl.instructions.length,
    durationMs: body.durationMs,
    cacheKey: body.cacheKey.slice(0, 12),
  }
}

let started = false
try {
  // Fail early and clearly when Docker cannot be reached (e.g. local dev box).
  docker(['info', '--format', '{{.ServerVersion}}'], { quiet: true })

  // Build the heavy toolchain image first. Naming only `build-api` in
  // `up --build` does not rebuild its `depends_on` base image, which would
  // otherwise make the API image pull `solphg-builder:latest` from Docker Hub.
  docker([...COMPOSE, 'build', 'builder-image'])
  docker([...COMPOSE, 'up', '-d', '--build', 'build-api'])
  started = true

  const health = await waitForHealth()
  console.log('[api-integration] health:', JSON.stringify({
    status: health.status,
    toolchain: health.toolchain?.toolchainTag,
    queue: health.queue,
  }))

  const results = []

  const counterReq = toBuildRequest(ANCHOR_TEMPLATE)
  const counterFirst = await postBuild(counterReq)
  results.push(checkArtifact('counter (cold)', counterFirst, { expectCached: false }))

  const counterSecond = await postBuild(counterReq)
  results.push(checkArtifact('counter (repeat)', counterSecond, { expectCached: true }))

  const splReq = toBuildRequest(SPL_TRANSFER_TEMPLATE)
  const splFirst = await postBuild(splReq)
  results.push(checkArtifact('spl-transfer (cold)', splFirst, { expectCached: false }))

  console.log('\n[api-integration] artifacts:')
  for (const row of results) console.log(' ', JSON.stringify(row))
  console.log('\n[api-integration] PASS: counter and SPL templates produced valid .so + IDL; repeat build was a cache hit.\n')
} catch (err) {
  fail(err instanceof Error ? err.message : String(err))
} finally {
  if (started) {
    try {
      docker([...COMPOSE, 'down', '-v', '--remove-orphans'], { quiet: true })
    } catch (err) {
      console.error('[api-integration] cleanup failed:', err instanceof Error ? err.message : String(err))
      process.exitCode = 1
    }
  }
}

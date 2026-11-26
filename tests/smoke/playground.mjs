// Playground browser smoke test with a stubbed compiler API.
//
// Serves the built SPA (apps/playground/dist -> ../../dist), stubs every
// /api/* request in the browser, and verifies the full UI flow:
//   landing page -> launch -> build -> success + IDL -> rebuild -> cache hit
//
// Run from the repo root with:
//   npm run build
//   npx playwright install chromium   (first time only)
//   npm run test:smoke:playground
//
// Requires Playwright's Chromium binary. CI installs it in the
// `playground-smoke` job. No live API, RPC, or wallet is involved.

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const DIST = join(ROOT, 'dist')
const OUT = join(ROOT, 'smoke-output')
const PROGRAM_ID = '11111111111111111111111111111111'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

function fail(message) {
  console.error(`\n[playground-smoke] FAIL: ${message}\n`)
  process.exitCode = 1
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function startStaticServer() {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname)
      let filePath = join(DIST, urlPath === '/' ? 'index.html' : urlPath)
      // Guard against path traversal; fall back to the SPA entry point.
      if (!filePath.startsWith(DIST)) filePath = join(DIST, 'index.html')
      let info
      try {
        info = await stat(filePath)
      } catch {
        filePath = join(DIST, 'index.html')
        info = await stat(filePath)
      }
      if (info.isDirectory()) filePath = join(filePath, 'index.html')
      const data = await readFile(filePath)
      res.writeHead(200, {
        'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      res.end(data)
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end(`static server error: ${err instanceof Error ? err.message : String(err)}`)
    }
  })
  await new Promise((resolveReady) => server.listen(0, '127.0.0.1', resolveReady))
  const address = server.address()
  assert(address && typeof address === 'object', 'could not start static server')
  return { server, url: `http://127.0.0.1:${address.port}/` }
}

let browser
let staticServer
try {
  // Ensure dist exists before starting the browser.
  await stat(join(DIST, 'index.html'))
  const served = await startStaticServer()
  staticServer = served.server

  browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  const pageErrors = []
  const consoleErrors = []
  page.on('pageerror', (err) => pageErrors.push(err.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300))
  })

  let buildCalls = 0
  let healthCalls = 0
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  }

  await page.route('**/api/**', async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    if (req.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: cors })
    }
    if (path === '/api/health') {
      healthCalls++
      return route.fulfill({
        status: 200,
        headers: cors,
        body: JSON.stringify({ status: 'ok', activeBuilds: 0, maxConcurrentBuilds: 2, queue: { implementation: 'stub' } }),
      })
    }
    if (path.startsWith('/api/balance/')) {
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ balance: 0 }) })
    }
    if (path === '/api/build') {
      buildCalls++
      let body = {}
      try { body = JSON.parse(req.postData() || '{}') } catch {}
      if (!body.programName || !Array.isArray(body.files) || body.files.length === 0) {
        return route.fulfill({
          status: 400,
          headers: cors,
          body: JSON.stringify({ success: false, error: 'stub: invalid build request', code: 'INVALID_REQUEST' }),
        })
      }
      return route.fulfill({
        status: 200,
        headers: cors,
        body: JSON.stringify({
          success: true,
          logs: 'stub: anchor build ok',
          program: Buffer.from('stub-elf-binary').toString('base64'),
          programId: PROGRAM_ID,
          programKeypair: Buffer.alloc(64).toString('base64'),
          idl: {
            version: '0.1.0',
            name: body.programName,
            address: PROGRAM_ID,
            instructions: [{
              name: 'initialize',
              args: [{ name: 'amount', type: 'u64' }],
              accounts: [{ name: 'counter', writable: true, signer: false }],
            }],
            types: [],
          },
          cached: buildCalls > 1,
          cacheKey: 'stub-cache-key',
          durationMs: 12,
        }),
      })
    }
    return route.fulfill({ status: 404, headers: cors, body: JSON.stringify({ error: 'stub: unhandled endpoint' }) })
  })

  await page.goto(served.url, { waitUntil: 'networkidle', timeout: 45_000 })

  // 1. Landing page mounts.
  await page.locator('.l-navbar-cta').waitFor({ state: 'visible', timeout: 15_000 })
  assert((await page.locator('h1').innerText()).includes('Solana Development'), 'landing headline missing')

  // 2. Launch the app.
  await page.locator('.l-navbar-cta').click()
  await page.locator('.toolbar').waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForFunction(() => document.querySelectorAll('.toolbar-actions button').length >= 2)

  // Wait for the stubbed health call so the UI has settled.
  await page.waitForFunction(() => document.querySelector('.toolbar-status') !== null)
  assert(healthCalls >= 1, 'health endpoint was never called')

  // The StableSwap AMM template is selectable from the template picker.
  await page.getByRole('button', { name: '+ New from Template' }).click()
  await page.getByText('StableSwap AMM Pool', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
  await page.getByRole('button', { name: 'Cancel' }).click()

  const buildButton = page.locator('.toolbar-actions button.btn-primary')
  await buildButton.waitFor({ state: 'visible', timeout: 15_000 })

  // 3. First build: success, fresh, IDL available.
  await buildButton.click()
  await page.locator('.build-result.success').waitFor({ state: 'visible', timeout: 15_000 })
  const firstText = await page.locator('.build-result').innerText()
  assert(firstText.includes('Build Successful'), `first build did not report success: ${firstText}`)
  assert(firstText.includes('Fresh'), `first build did not report a fresh build: ${firstText}`)
  assert(await page.getByRole('button', { name: 'View IDL' }).isVisible(), 'IDL viewer button missing')
  await page.locator('.terminal-output').getByText('Build complete', { exact: false }).first()
    .waitFor({ state: 'visible', timeout: 15_000 })
  assert(buildCalls === 1, `expected 1 build call after first build, got ${buildCalls}`)

  // 4. Second identical build: cache hit surfaced in both result panel and terminal.
  await buildButton.click()
  await page.waitForFunction(() => {
    const el = document.querySelector('.build-result')
    return !!el && el.textContent.includes('Cache hit')
  }, null, { timeout: 15_000 })
  const secondText = await page.locator('.build-result').innerText()
  assert(secondText.includes('Cache hit'), `second build did not report a cache hit: ${secondText}`)
  await page.locator('.terminal-output').getByText('Served from build cache', { exact: false }).first()
    .waitFor({ state: 'visible', timeout: 15_000 })
  assert(buildCalls === 2, `expected 2 build calls after the second build, got ${buildCalls}`)

  // 5. Typed client generation from the returned IDL.
  await page.getByRole('button', { name: 'Generate Client' }).click()
  const clientPreview = page.locator('[data-testid="generated-client"]')
  await clientPreview.waitFor({ state: 'visible', timeout: 15_000 })
  const clientCode = await clientPreview.innerText()
  assert(clientCode.includes('import * as anchor from "@coral-xyz/anchor"'),
    `client preview is missing the Anchor 0.31 import: ${clientCode.slice(0, 200)}`)
  assert(clientCode.includes('new anchor.Program(idl, provider)'),
    'client preview is missing the Program construction')
  assert(clientCode.includes('amount: bigint'), 'client preview is missing the typed u64 arg')
  assert(clientCode.includes('counter: PublicKey'), 'client preview is missing the typed account map')
  assert(clientCode.includes('async initialize('), 'client preview is missing the instruction method')
  assert(await page.getByRole('button', { name: 'Copy Client' }).isVisible(), 'Copy Client button missing')
  await page.getByRole('button', { name: 'Hide Client' }).click()
  await clientPreview.waitFor({ state: 'hidden', timeout: 15_000 })

  assert(pageErrors.length === 0, `uncaught page errors: ${pageErrors.join(' | ')}`)

  await import('node:fs/promises').then(({ mkdir, writeFile }) => mkdir(OUT, { recursive: true })
    .then(() => writeFile(join(OUT, 'smoke-report.json'), JSON.stringify({
      url: served.url,
      buildCalls,
      healthCalls,
      firstBuildCached: false,
      secondBuildCached: true,
      generatedClientChecked: true,
      consoleErrors: consoleErrors.slice(0, 10),
      verdict: 'PASS',
    }, null, 2))))

  console.log('\n[playground-smoke] PASS: landing -> launch -> build success + IDL -> rebuild cache hit -> typed client generated.\n')
  console.log(`  build calls: ${buildCalls}, health calls: ${healthCalls}`)
  if (consoleErrors.length) console.log(`  console errors (not fatal): ${consoleErrors.slice(0, 3).join(' | ')}`)
} catch (err) {
  fail(err instanceof Error ? err.message : String(err))
} finally {
  if (browser) await browser.close().catch(() => {})
  if (staticServer) await new Promise((resolveClose) => staticServer.close(resolveClose))
}

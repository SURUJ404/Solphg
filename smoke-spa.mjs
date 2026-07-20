// Smoke test: load the production Vercel SPA, confirm the React app mounts,
// capture console errors, and screenshot. Run with:
//   npx --yes playwright install chromium
//   node smoke-spa.mjs
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'

const URL = process.env.SMOKE_URL || 'https://solphg-playground.vercel.app'
const OUT = './smoke-output'
mkdirSync(OUT, { recursive: true })

const consoleMessages = []
const pageErrors = []
const failedRequests = []

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()

page.on('console', m => consoleMessages.push({ type: m.type(), text: m.text() }))
page.on('pageerror', e => pageErrors.push({ message: e.message, stack: e.stack }))
page.on('requestfailed', r => failedRequests.push({ url: r.url(), failure: r.failure()?.errorText }))

let navStatus = null
try {
  const resp = await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 })
  navStatus = resp ? resp.status() : null
} catch (e) {
  console.error('navigation failed:', e.message)
}

// Give the React tree a moment to render past the loading state
await page.waitForTimeout(2000)

// Look for signs the app mounted: any non-empty body, any button, any editor element
const signals = await page.evaluate(() => {
  const body = document.body
  return {
    bodyTextLength: body.innerText.length,
    buttonCount: document.querySelectorAll('button').length,
    monacoPresent: !!document.querySelector('.monaco-editor, [class*="monaco"]'),
    terminalPresent: !!document.querySelector('[class*="terminal"], [class*="xterm"]'),
    titleText: document.title,
  }
})

await page.screenshot({ path: `${OUT}/playground.png`, fullPage: false })

await browser.close()

const report = {
  url: URL,
  navStatus,
  signals,
  consoleErrors: consoleMessages.filter(m => m.type === 'error'),
  consoleWarnings: consoleMessages.filter(m => m.type === 'warning').slice(0, 5),
  pageErrors,
  failedRequests: failedRequests.slice(0, 5),
  verdict: navStatus === 200 && signals.bodyTextLength > 50
    ? 'APP_MOUNTED'
    : 'APP_DID_NOT_MOUNT',
}
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))

// Exit non-zero if the app didn't mount
if (report.verdict !== 'APP_MOUNTED') process.exit(1)

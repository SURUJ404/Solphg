import { chromium } from 'playwright';

const URL = 'http://localhost:3000';
const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  let total = 0, passed = 0;
  const check = (name, cond) => { total++; if (cond) { passed++; console.log(`  ${PASS} ${name}`); } else { console.log(`  ${FAIL} ${name}`); } };

  console.log('=== CPI Debugger - Full UI Test ===\n');

  // Navigate to landing page
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  check('Page loaded', await page.title() === 'Solana Playground');

  // Click "Launch App" to get to IDE
  const launchBtn = page.locator('a, button', { hasText: 'Launch App' }).first();
  await launchBtn.click();
  await page.waitForURL('**/app**', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1000);
  check('Navigated to /app', page.url().includes('/app'));

  await page.screenshot({ path: 'cpi-ide.png' });

  // Look for the build/editor area
  const body = await page.textContent('body');
  const hasEditor = body.includes('editor') || body.includes('code') || body.includes('Build');
  check('Editor/IDE area visible', hasEditor);

  // Check if there's a build panel with CPI trace button
  const allBtns = await page.locator('button').allTextContents();
  console.log('\nButtons in IDE:', allBtns.map(b => '"' + b.trim() + '"').join(', '));

  // Look for the CpiDebugView or "Paste Raw Logs" anywhere
  const hasPasteRawLogs = body.includes('Paste Raw Logs') || body.includes('paste raw');
  check('CpiLogParser accessible on page', hasPasteRawLogs);

  // If CpiLogParser exists, test it
  if (hasPasteRawLogs) {
    const pasteBtn = page.locator('button', { hasText: /Paste.*Logs/i });
    await pasteBtn.click();
    await page.waitForTimeout(300);

    const textarea = page.locator('textarea');
    const taCount = await textarea.count();
    if (taCount > 0) {
      // Find visible textarea
      for (let i = 0; i < taCount; i++) {
        if (await textarea.nth(i).isVisible()) {
          await textarea.nth(i).fill('Program 1111 invoke [1]\nProgram 2222 invoke [2]\nProgram 2222 consumed 5000 of 200000 CU\nProgram 2222 failed: custom program error: 0x1\nProgram 1111 consumed 10000 of 200000 CU\nProgram 1111 failed: Program 2222 failed');
          await page.waitForTimeout(200);
          break;
        }
      }

      const parseBtn = page.locator('button', { hasText: 'Parse' });
      if (await parseBtn.count() > 0) {
        await parseBtn.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: 'cpi-parsed.png' });

        const body2 = await page.textContent('body');
        check('Error "custom program error: 0x1" displayed', body2.includes('custom program error: 0x1'));
        check('Program 2222 visible', body2.includes('2222'));
      }
    }
  }

  console.log(`\n=== RESULTS: ${passed}/${total} passed ===`);
  await browser.close();
}

main().catch(err => { console.error('TEST CRASH:', err.message); process.exit(1); });

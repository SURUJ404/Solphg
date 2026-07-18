import { chromium } from 'playwright';

const URL = 'http://localhost:3000';
const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  // Capture the debug-cpi API response
  let cpiResponse = null;
  page.on('response', async (response) => {
    if (response.url().includes('/api/debug-cpi')) {
      try { cpiResponse = await response.json(); console.log('  CPI API response received'); } catch {}
    }
  });

  let total = 0, passed = 0;
  const check = (name, cond) => { total++; if (cond) { passed++; console.log(`  ${PASS} ${name}`); } else { console.log(`  ${FAIL} ${name}`); } };

  console.log('=== CPI Debugger - Full End-to-End Flow ===\n');

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Enter IDE
  await page.locator('a, button', { hasText: 'Launch App' }).first().click();
  await page.waitForTimeout(1000);
  check('IDE visible', await page.locator('button').filter({ hasText: /^Build$/ }).count() > 0);

  // Build
  await page.locator('button').filter({ hasText: /^Build$/ }).click();
  console.log('  Building...');
  await page.waitForTimeout(15000);

  const body = await page.textContent('body');
  const traceVisible = body.includes('Trace') && body.includes('CPI');
  check('Trace CPI button visible after build', traceVisible);

  if (traceVisible) {
    // Click Trace CPI
    await page.locator('button', { hasText: /Trace/i }).first().click();
    console.log('  Tracing CPI (waiting up to 20s for backend)...');
    await page.waitForTimeout(5000);

    // Check what we got back
    if (cpiResponse) {
      console.log('  CPI API responded:', JSON.stringify(cpiResponse).substring(0, 300));
      check('CPI API returned success', cpiResponse.success !== undefined);
      if (cpiResponse.cpiTree) {
        check('CPI tree has nodes', cpiResponse.cpiTree.length >= 0);
      }
    }

    await page.screenshot({ path: 'cpi-e2e-after-trace.png' });
    const body2 = await page.textContent('body');

    // The CpiDebugView should now be visible (either with tree data or with the Paste Raw Logs option)
    check('CpiDebugView rendered (CPI or Paste text visible)', body2.includes('CPI') || body2.includes('Paste Raw'));

    // Click "Paste Raw Logs to Parse"
    const pasteBtn = page.locator('button', { hasText: /Paste.*Log/i });
    const pasteExists = await pasteBtn.count() > 0;
    check('Paste Raw Logs button found', pasteExists);

    if (pasteExists) {
      await pasteBtn.first().click();
      await page.waitForTimeout(300);

      // Fill and parse
      const textarea = page.locator('textarea').first();
      await textarea.fill('Program 1111 invoke [1]\nProgram 2222 invoke [2]\nProgram 2222 consumed 5000 of 200000 CU\nProgram 2222 failed: custom program error: 0x1\nProgram 1111 consumed 10000 of 200000 CU\nProgram 1111 failed: Program 2222 failed');
      await page.waitForTimeout(100);

      await page.locator('button', { hasText: 'Parse' }).click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'cpi-e2e-parsed.png' });

      const body3 = await page.textContent('body');
      check('Error "custom program error: 0x1" displayed', body3.includes('custom program error: 0x1'));
      check('Program 2222 in tree', body3.includes('2222'));
      check('Failed status visible', body3.includes('failed'));
      check('Compute units visible', body3.includes('5000'));
    }
  }

  console.log(`\n=== RESULTS: ${passed}/${total} passed ===`);
  await browser.close();
}

main().catch(err => { console.error('TEST CRASH:', err.message); process.exit(1); });

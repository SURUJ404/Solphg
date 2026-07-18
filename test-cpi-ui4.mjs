import { chromium } from 'playwright';

const URL = 'http://localhost:3000';
const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  let total = 0, passed = 0;
  const check = (name, cond) => { total++; if (cond) { passed++; console.log(`  ${PASS} ${name}`); } else { console.log(`  ${FAIL} ${name}`); } };

  console.log('=== CPI Debugger - Full IDE Flow Test ===\n');

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  check('Page loaded', await page.title() === 'Solana Playground');

  await page.screenshot({ path: 'cpi-flow-01-load.png' });

  // Click Build
  const buildBtn = page.locator('button', { hasText: '^Build$|^Build ' }).first();
  if (await buildBtn.count() > 0) {
    await buildBtn.click();
    console.log('  Build clicked, waiting...');
  } else {
    // Try finding any Build button
    const allBtns = await page.locator('button').allTextContents();
    console.log('  Available buttons:', allBtns.map(b => '"' + b.trim() + '"').join(', '));
    const anyBuild = page.locator('button').filter({ hasText: /build/i }).first();
    if (await anyBuild.count() > 0) { await anyBuild.click(); console.log('  Build clicked (fuzzy)'); }
  }

  // Wait for build to complete
  await page.waitForTimeout(8000);
  await page.screenshot({ path: 'cpi-flow-02-after-build.png' });

  const body = await page.textContent('body');
  console.log('  Build result contains:', body.includes('success') ? 'success' : 'no success',
    '|', body.includes('error') ? 'error' : 'no error',
    '|', body.includes('Trace') ? 'Trace' : 'no Trace');

  // Look for Trace CPI button
  const traceBtn = page.locator('button', { hasText: /Trace/i });
  const traceCount = await traceBtn.count();
  check('Trace CPI button present after build', traceCount > 0);

  if (traceCount > 0) {
    await traceBtn.first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'cpi-flow-03-trace.png' });
    console.log('  Trace CPI clicked');

    const body2 = await page.textContent('body');
    check('CpiDebugView rendered', body2.includes('CPI') || body2.includes('invocation'));

    // Look for "Paste Raw Logs to Parse" button
    const pasteBtn = page.locator('button', { hasText: /Paste.*Log/i });
    const pasteCount = await pasteBtn.count();
    check('Paste Raw Logs button visible', pasteCount > 0);

    if (pasteCount > 0) {
      await pasteBtn.first().click();
      await page.waitForTimeout(300);

      // Find and fill the textarea
      const textareas = page.locator('textarea');
      const taCount = await textareas.count();
      for (let i = 0; i < taCount; i++) {
        if (await textareas.nth(i).isVisible()) {
          await textareas.nth(i).fill('Program 1111 invoke [1]\nProgram 2222 invoke [2]\nProgram 2222 consumed 5000 of 200000 CU\nProgram 2222 failed: custom program error: 0x1\nProgram 1111 consumed 10000 of 200000 CU\nProgram 1111 failed: Program 2222 failed');
          await page.waitForTimeout(100);
          break;
        }
      }

      const parseBtn = page.locator('button', { hasText: 'Parse' });
      if (await parseBtn.count() > 0) {
        await parseBtn.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: 'cpi-flow-04-parsed.png' });

        const body3 = await page.textContent('body');
        check('Error "custom program error: 0x1" displayed', body3.includes('custom program error: 0x1'));
        check('Program 2222 visible in tree', body3.includes('2222'));
        check('Compute units visible', body3.includes('5000'));
      }
    }
  }

  console.log(`\n=== RESULTS: ${passed}/${total} passed ===`);
  await browser.close();
}

main().catch(err => { console.error('TEST CRASH:', err.message); process.exit(1); });

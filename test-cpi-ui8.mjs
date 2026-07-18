import { chromium } from 'playwright';

const URL = 'http://localhost:3000';
const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  let total = 0, passed = 0;
  const check = (name, cond) => { total++; if (cond) { passed++; console.log(`  ${PASS} ${name}`); } else { console.log(`  ${FAIL} ${name}`); } };

  console.log('=== CPI Debugger - Full End-to-End Flow (v2) ===\n');

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
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
    console.log('  Waiting for CPI trace...');
    await page.waitForTimeout(6000);

    await page.screenshot({ path: 'cpi-e2e-after-trace.png' });

    // Dump what's visible in the CPI area
    const body2 = await page.textContent('body');
    console.log('  Page contains "Paste":', body2.includes('Paste'));
    console.log('  Page contains "Hide Log":', body2.includes('Hide Log'));
    console.log('  Page contains "textarea":', body2.includes('textarea'));

    // The parser may be auto-shown when tree is empty
    // Button text is either "Paste Raw Logs to Parse" or "Hide Log Parser" depending on showParser state
    const pasteBtn = page.locator('button').filter({ hasText: /Log Parser|Paste.*Log/i });
    const pasteCount = await pasteBtn.count();
    console.log(`  Buttons matching /Log Parser|Paste.*Log/: ${pasteCount}`);

    if (pasteCount > 0) {
      // The parser might already be open
      const textarea = page.locator('textarea').first();
      const taVisible = await textarea.isVisible().catch(() => false);
      check('Textarea accessible (parser open)', taVisible);

      if (taVisible) {
        await textarea.fill('Program 1111 invoke [1]\nProgram 2222 invoke [2]\nProgram 2222 consumed 5000 of 200000 CU\nProgram 2222 failed: custom program error: 0x1\nProgram 1111 consumed 10000 of 200000 CU\nProgram 1111 failed: Program 2222 failed');
        await page.waitForTimeout(100);

        const parseBtn = page.locator('button', { hasText: 'Parse' });
        if (await parseBtn.count() > 0) {
          await parseBtn.click();
          await page.waitForTimeout(500);
          await page.screenshot({ path: 'cpi-e2e-parsed.png' });

          const body3 = await page.textContent('body');
          check('Error "custom program error: 0x1" extracted', body3.includes('custom program error: 0x1'));
          check('Program 2222 visible in tree', body3.includes('2222'));
          check('Failed status visible', body3.includes('failed'));
          check('Compute units 5000 visible', body3.includes('5000'));
        }
      }
    } else {
      check('Parser accessible (via toggle or direct)', false);
    }
  }

  console.log(`\n=== RESULTS: ${passed}/${total} passed ===`);
  await browser.close();
}

main().catch(err => { console.error('TEST CRASH:', err.message); process.exit(1); });

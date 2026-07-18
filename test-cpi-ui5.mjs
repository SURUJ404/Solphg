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

  // Load landing page
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  check('Page loaded', await page.title() === 'Solana Playground');

  // Click "Launch App" to reveal IDE
  await page.locator('a, button', { hasText: 'Launch App' }).first().click();
  await page.waitForTimeout(1000);

  // Verify IDE is visible (Build button)
  const buildBtn = page.locator('button').filter({ hasText: /^Build$/ });
  check('IDE visible (Build button found)', await buildBtn.count() > 0);

  await page.screenshot({ path: 'cpi-ide.png' });

  // Click Build
  await buildBtn.click();
  console.log('  Build clicked, waiting for result...');
  await page.waitForTimeout(10000);
  await page.screenshot({ path: 'cpi-after-build.png' });

  const body = await page.textContent('body');
  const hasTrace = body.includes('Trace');
  console.log('  After build - has Trace?:', hasTrace);

  // Click Trace CPI if present
  if (hasTrace) {
    const traceBtn = page.locator('button', { hasText: /Trace/i }).first();
    await traceBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'cpi-trace-panel.png' });
    console.log('  Trace CPI clicked');

    const body2 = await page.textContent('body');
    check('CpiDebugView visible', body2.includes('CPI') || body2.includes('invocation'));

    // Click "Paste Raw Logs to Parse"
    const pasteBtn = page.locator('button', { hasText: /Paste.*Log/i });
    if (await pasteBtn.count() > 0) {
      await pasteBtn.first().click();
      await page.waitForTimeout(300);

      // Find textarea
      const textareas = page.locator('textarea');
      for (let i = 0; i < await textareas.count(); i++) {
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
        await page.screenshot({ path: 'cpi-parsed-result.png' });

        const body3 = await page.textContent('body');
        check('Error "custom program error: 0x1" extracted', body3.includes('custom program error: 0x1'));
        check('Program 2222 in tree', body3.includes('2222'));
        check('Compute units visible', body3.includes('5000'));
      }
    }
  }

  console.log(`\n=== RESULTS: ${passed}/${total} passed ===`);
  await browser.close();
}

main().catch(err => { console.error('TEST CRASH:', err.message); process.exit(1); });

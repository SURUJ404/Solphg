import { chromium } from 'playwright';

const URL = 'http://localhost:3000';
const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  let total = 0, passed = 0;
  const check = (name, cond) => { total++; if (cond) { passed++; console.log(`  ${PASS} ${name}`); } else { console.log(`  ${FAIL} ${name}`); } };

  console.log('=== CPI Debugger - Automated UI Test ===\n');

  await page.goto(URL, { waitUntil: 'networkidle' });
  check('Page loaded', await page.title() === 'Solana Playground');
  await page.screenshot({ path: 'cpi-test-01-initial.png' });

  const pasteBtn = page.locator('button', { hasText: 'Paste Raw Logs to Parse' });
  const pasteBtnExists = await pasteBtn.count() > 0;
  check('Paste Raw Logs button exists', pasteBtnExists);

  if (pasteBtnExists) {
    await pasteBtn.click();
    await page.waitForTimeout(300);

    const textarea = page.locator('textarea');
    check('Textarea appeared after click', await textarea.count() > 0);

    if (await textarea.count() > 0) {
      // Test 1: Failure with error message
      await textarea.fill('');
      await textarea.type('Program 1111 invoke [1]\nProgram 2222 invoke [2]\nProgram 2222 consumed 5000 of 200000 CU\nProgram 2222 failed: custom program error: 0x1\nProgram 1111 consumed 10000 of 200000 CU\nProgram 1111 failed: Program 2222 failed', { delay: 2 });
      await page.waitForTimeout(200);

      await page.locator('button', { hasText: 'Parse' }).click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'cpi-test-02-failure.png' });

      const body = await page.textContent('body');
      check('Tree nodes rendered', (await page.locator('code').count()) >= 1);
      check('Error "custom program error: 0x1" visible', body.includes('custom program error: 0x1'));
      check('Failure status visible', body.includes('failed') || body.includes('failed'));
      check('Program 2222 visible in tree', body.includes('2222'));

      // Test 2: All-success deep nested
      await textarea.fill('');
      await textarea.type('Program AAAA invoke [1]\nProgram BBBB invoke [2]\nProgram CCCC invoke [3]\nProgram CCCC consumed 3000 of 200000 CU\nProgram CCCC success\nProgram BBBB consumed 8000 of 200000 CU\nProgram BBBB success\nProgram AAAA consumed 12000 of 200000 CU\nProgram AAAA success', { delay: 1 });
      await page.waitForTimeout(200);

      await page.locator('button', { hasText: 'Parse' }).click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'cpi-test-03-nested-success.png' });

      const body2 = await page.textContent('body');
      check('3-level nesting: AAAA', body2.includes('AAAA'));
      check('3-level nesting: BBBB', body2.includes('BBBB'));
      check('3-level nesting: CCCC', body2.includes('CCCC'));
      check('No failure text in success case', !body2.includes('failed'));
    }
  }

  console.log(`\n=== RESULTS: ${passed}/${total} passed ===`);
  await browser.close();
}

main().catch(err => { console.error('TEST CRASH:', err.message); process.exit(1); });

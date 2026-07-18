import { chromium } from 'playwright';

const URL = 'http://localhost:3000';
const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  // Capture API responses
  let buildResponse = null;
  page.on('response', async (response) => {
    if (response.url().includes('/api/build')) {
      try { buildResponse = await response.json(); } catch {}
    }
  });

  let total = 0, passed = 0;
  const check = (name, cond) => { total++; if (cond) { passed++; console.log(`  ${PASS} ${name}`); } else { console.log(`  ${FAIL} ${name}`); } };

  console.log('=== CPI Debugger - Full IDE Flow + API Trace ===\n');

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Click "Launch App" to reveal IDE
  await page.locator('a, button', { hasText: 'Launch App' }).first().click();
  await page.waitForTimeout(1000);
  check('IDE visible', await page.locator('button').filter({ hasText: /^Build$/ }).count() > 0);

  // Click Build
  await page.locator('button').filter({ hasText: /^Build$/ }).click();
  console.log('  Build clicked...');
  await page.waitForTimeout(15000);

  // Check what the API returned
  if (buildResponse) {
    console.log('  Build API response:', JSON.stringify(buildResponse).substring(0, 200));
    check('Build succeeded', buildResponse.success === true);
    const hasBytecode = buildResponse.program && buildResponse.program.length > 0;
    check('Bytecode returned', hasBytecode);
  } else {
    console.log('  No /api/build response captured');
    // Check for any network errors
    const consoleMessages = [];
    page.on('console', msg => consoleMessages.push(msg.text()));
    check('No /api/build response - network error?', false);
  }

  // Check if Trace CPI button appeared
  await page.waitForTimeout(1000);
  const body = await page.textContent('body');
  check('Trace CPI button visible', body.includes('Trace') && body.includes('CPI'));

  // If Trace is visible, test the full flow
  if (body.includes('Trace')) {
    const traceBtn = page.locator('button', { hasText: /Trace/i }).first();
    await traceBtn.click();
    await page.waitForTimeout(1000);

    const body2 = await page.textContent('body');
    check('CpiDebugView panel opened', body2.includes('Paste Raw Logs'));

    // Click Paste Raw Logs
    await page.locator('button', { hasText: /Paste.*Log/i }).first().click();
    await page.waitForTimeout(300);

    // Fill textarea
    const textareas = page.locator('textarea');
    for (let i = 0; i < await textareas.count(); i++) {
      if (await textareas.nth(i).isVisible()) {
        await textareas.nth(i).fill('Program 1111 invoke [1]\nProgram 2222 invoke [2]\nProgram 2222 consumed 5000 of 200000 CU\nProgram 2222 failed: custom program error: 0x1\nProgram 1111 consumed 10000 of 200000 CU\nProgram 1111 failed: Program 2222 failed');
        break;
      }
    }

    await page.locator('button', { hasText: 'Parse' }).click();
    await page.waitForTimeout(500);

    const body3 = await page.textContent('body');
    check('Error "custom program error: 0x1" displayed', body3.includes('custom program error: 0x1'));
    check('Program 2222 in tree', body3.includes('2222'));
    check('Failed status visible', body3.includes('failed') || body3.includes('failed'));
    check('Compute units visible', body3.includes('5000'));

    await page.screenshot({ path: 'cpi-full-flow-success.png' });
  } else {
    await page.screenshot({ path: 'cpi-build-failed.png' });
  }

  console.log(`\n=== RESULTS: ${passed}/${total} passed ===`);
  await browser.close();
}

main().catch(err => { console.error('TEST CRASH:', err.message); process.exit(1); });

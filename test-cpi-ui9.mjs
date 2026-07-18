import { chromium } from 'playwright';

const URL = 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  // Capture debug-cpi API response
  let cpiApiResponse = null;
  page.on('response', async (response) => {
    if (response.url().includes('/api/debug-cpi')) {
      try { cpiApiResponse = await response.json(); } catch {}
    }
  });

  console.log('=== CPI Debugger - Diagnostic Test ===\n');

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.locator('a, button', { hasText: 'Launch App' }).first().click();
  await page.waitForTimeout(1000);

  // Build
  await page.locator('button').filter({ hasText: /^Build$/ }).click();
  await page.waitForTimeout(20000);

  const body = await page.textContent('body');
  console.log('After build - Trace CPI visible:', body.includes('Trace'));

  if (body.includes('Trace')) {
    await page.locator('button', { hasText: /Trace/i }).first().click();
    await page.waitForTimeout(10000);

    // Dump API response
    if (cpiApiResponse) {
      console.log('\nCPI API response:', JSON.stringify(cpiApiResponse, null, 2).substring(0, 500));
    } else {
      console.log('No CPI API response captured');
    }

    // Dump all visible text
    const body2 = await page.textContent('body');
    console.log('\nPage body (last 2000 chars):');
    console.log(body2.substring(Math.max(0, body2.length - 2000)));

    // Check for specific elements
    const allButtons = await page.locator('button').allTextContents();
    console.log('\nAll buttons:', allButtons.map(b => '"' + b.trim() + '"').join(', '));

    await page.screenshot({ path: 'cpi-diagnostic.png' });
  }

  await browser.close();
}

main().catch(err => { console.error('TEST CRASH:', err.message); process.exit(1); });

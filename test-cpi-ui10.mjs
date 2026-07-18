import { chromium } from 'playwright';

const URL = 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  console.log('=== CPI Debugger - Network Diagnostic ===\n');

  // Log all requests
  page.on('request', req => {
    if (req.url().includes('/api/')) {
      console.log('  REQUEST:', req.method(), req.url().substring(0, 100));
    }
  });

  page.on('requestfailed', req => {
    if (req.url().includes('/api/')) {
      console.log('  REQUEST FAILED:', req.url().substring(0, 100), req.failure()?.errorText);
    }
  });

  page.on('response', async (res) => {
    if (res.url().includes('/api/debug-cpi')) {
      console.log('  RESPONSE:', res.status(), res.statusText());
      try {
        const json = await res.json();
        console.log('  BODY:', JSON.stringify(json).substring(0, 300));
      } catch (e) {
        console.log('  BODY (text):', (await res.text()).substring(0, 200));
      }
    }
  });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.locator('a, button', { hasText: 'Launch App' }).first().click();
  await page.waitForTimeout(1000);

  // Build
  console.log('\n-- Starting build --');
  await page.locator('button').filter({ hasText: /^Build$/ }).click();
  await page.waitForTimeout(20000);
  console.log('-- Build done --');

  const body = await page.textContent('body');
  if (body.includes('Trace')) {
    console.log('\n-- Clicking Trace CPI --');
    await page.locator('button', { hasText: /Trace/i }).first().click();
    await page.waitForTimeout(15000);
    console.log('-- Done waiting for CPI --');
  }

  const body2 = await page.textContent('body');
  console.log('\nCPI area contains "Paste":', body2.includes('Paste'));
  console.log('CPI area contains "No CPI":', body2.includes('No CPI'));
  console.log('CPI area contains "textarea":', body2.includes('textarea'));

  const btns = await page.locator('button').allTextContents();
  console.log('Buttons now:', btns.map(b => '"' + b.trim() + '"').join(', '));

  await page.screenshot({ path: 'cpi-network-diag.png' });
  await browser.close();
}

main().catch(err => { console.error('TEST CRASH:', err.message); process.exit(1); });

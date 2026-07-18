import { chromium } from 'playwright';

const URL = 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Dump all button text
  const buttons = await page.locator('button').allTextContents();
  console.log('All buttons on page:');
  for (const b of buttons) console.log('  "' + b.trim() + '"');

  // Dump all headings
  const headings = await page.locator('h1, h2, h3, h4, strong').allTextContents();
  console.log('\nAll headings/strong:');
  for (const h of headings) console.log('  "' + h.trim() + '"');

  // Full page text (first 3000 chars)
  const body = await page.textContent('body');
  console.log('\nPage body text (first 2000):');
  console.log(body.substring(0, 2000));

  await page.screenshot({ path: 'cpi-test-debug.png' });
  console.log('\nScreenshot saved to cpi-test-debug.png');

  await browser.close();
}

main().catch(err => { console.error('CRASH:', err.message); process.exit(1); });

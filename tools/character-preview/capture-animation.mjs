import { chromium } from '@playwright/test';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const browser = await chromium.launch(executablePath ? { executablePath, args: ['--no-sandbox'] } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  await page.goto('http://127.0.0.1:5175/animation-poses.html');
  await page.locator('#poses img').evaluateAll(async images => Promise.all(images.map(image => image.decode())));
  await page.screenshot({ path: 'assets/characters/minimorph/animation/contact-sheet.png', fullPage: true });
} finally { await browser.close(); }

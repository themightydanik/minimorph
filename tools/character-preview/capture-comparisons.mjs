// Exact screenshots of the rendered source/candidate pairs; no image synthesis.
// Run the preview server before this script. Uses Playwright's installed browser.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const output = process.argv[2] ?? 'assets/characters/minimorph/comparisons';
await mkdir(output, { recursive: true });
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const browser = await chromium.launch(executablePath ? { executablePath, args: ['--no-sandbox'] } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1320, height: 1100 }, deviceScaleFactor: 1 });
  for (const candidate of ['40k', '80k', 'selected']) {
    for (const view of ['front', 'three-quarter', 'side', 'back', 'face-front', 'face-three-quarter']) {
      await page.goto(`http://127.0.0.1:5175/comparison.html?candidate=${candidate}&view=${view}`);
      await page.locator('#comparison img').evaluateAll(async images => {
        await Promise.all(images.map(image => image.decode()));
      });
      await page.locator('#comparison').screenshot({ path: `${output}/${candidate}-${view}.png` });
    }
  }
} finally { await browser.close(); }

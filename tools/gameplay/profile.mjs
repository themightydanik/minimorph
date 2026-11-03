import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const url = process.env.GAME_URL ?? 'http://127.0.0.1:5173';
const out = process.env.PROFILE_OUTPUT ?? 'artifacts/gameplay-profile';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const report = { environment: 'Cloud Chromium / forced SwiftShader software rendering, not physical-phone FPS. Run alone without regression browsers.', url, samples: [] };
try {
  for (const [device, settings] of [['desktop', { viewport: { width: 1280, height: 720 } }], ['mobile-emulation', devices['Pixel 7']]]) {
    const context = await browser.newContext(settings);
    // Unlocks only selection for profiling; no race completion or score is fabricated.
    await context.addInitScript(() => localStorage.setItem('minimorph.progress.v2', JSON.stringify({ version: 2, unlocked: 3, best: {} })));
    const page = await context.newPage();
    await page.route('https://telegram.org/**', route => route.abort());
    const start = Date.now();
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector('canvas')?.dataset.character === 'minimorph-animated-v1-temporary', null, { timeout: 60000 });
    const navigationToCharacterSelectedMs = Date.now() - start;
    for (const [id, name] of [['cosmic-sprint', 'Cosmic Sprint'], ['orbit-chaos', 'Orbit Chaos'], ['gravity-mayhem', 'Gravity Mayhem']]) {
      await page.getByRole('button', { name: `Play ${name}`, exact: true }).click();
      await page.getByRole('button', { name: 'Start race', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('canvas')?.dataset.phase === 'racing');
      await page.locator('.countdown').waitFor({ state: 'hidden' });
      const sample = await page.evaluate(() => new Promise(resolve => {
        const intervals = []; let previous = performance.now(); const start = previous;
        function frame(now) {
          intervals.push(now - previous); previous = now;
          if (now - start < 3000) requestAnimationFrame(frame);
          else {
            intervals.sort((a, b) => a - b);
            const canvas = document.querySelector('canvas');
            const gl = canvas.getContext('webgl2'), debug = gl.getExtension('WEBGL_debug_renderer_info');
            resolve({ frames: intervals.length, durationMs: now - start, softwareFps: intervals.length / ((now - start) / 1000), medianFrameMs: intervals[Math.floor(intervals.length / 2)], p95FrameMs: intervals[Math.ceil(intervals.length * .95) - 1], bufferWidth: canvas.width, bufferHeight: canvas.height, renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable', glbResources: performance.getEntriesByType('resource').filter(r => r.name.includes('minimorph_animated_v1')).map(r => ({ encodedBytes: r.encodedBodySize, transferBytes: r.transferSize, durationMs: r.duration })) });
          }
        }
        requestAnimationFrame(frame);
      }));
      report.samples.push({ device, arena: id, navigationToCharacterSelectedMs, ...sample });
      await page.screenshot({ path: path.join(out, `${id}-${device}.jpg`), type: 'jpeg', quality: 85 });
      await page.getByRole('button', { name: 'Arenas', exact: true }).click();
    }
    await context.close();
  }
} finally { await browser.close(); }
fs.writeFileSync(path.join(out, 'measurements.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Wrote ${report.samples.length} software-renderer samples to ${out}`);

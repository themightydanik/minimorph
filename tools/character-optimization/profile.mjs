import { chromium } from "@playwright/test";
import fs from "node:fs";
const out = "docs/evidence/character-optimization";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const report = {
  method:
    "Isolated render-only probe in unchanged createGame/Cosmic Sprint scene, original ambient/directional light, materials, effects pool and DPR cap. Fixed normal gameplay camera, arena phase 1.2s, Run playing, 1280x720 viewport and drawing buffer at DPR1 for every case. No HUD/networking; not full multiplayer FPS. Forced Chromium SwiftShader software rendering, not Redmi Note 8 or hardware-GPU performance. Paired AB/BA trials, no concurrent regression browsers/builds.",
  samples: [],
};
try {
  for (const count of [1, 2, 4, 8])
    for (let trial = 0; trial < 2; trial++)
      for (const variant of trial === 0
        ? ["original", "candidate"]
        : ["candidate", "original"]) {
        const context = await browser.newContext({
            viewport: { width: 1280, height: 720 },
            deviceScaleFactor: 1,
          }),
          page = await context.newPage();
        await page.goto(
          `http://127.0.0.1:5175/optimization-study.html?count=${count}&variant=${variant}&clip=Run`,
        );
        await page.waitForFunction(() => window.studyReady, undefined, { timeout: 60000 });
        await page.waitForTimeout(3000);
        const sample = await page.evaluate(
          () =>
            new Promise((resolve) => {
              const intervals = [];
              let previous = performance.now(),
                start = previous;
              function frame(now) {
                intervals.push(now - previous);
                previous = now;
                if (
                  (now - start < 15000 || intervals.length < 20) &&
                  now - start < 30000
                )
                  requestAnimationFrame(frame);
                else {
                  intervals.sort((a, b) => a - b);
                  const canvas = document.querySelector("canvas"),
                    gl = canvas.getContext("webgl2"),
                    debug = gl.getExtension("WEBGL_debug_renderer_info");
                  resolve({
                    frames: intervals.length,
                    durationMs: now - start,
                    softwareFps: intervals.length / ((now - start) / 1000),
                    medianFrameMs:
                      intervals[Math.floor(intervals.length * 0.5)],
                    p95FrameMs:
                      intervals[Math.ceil(intervals.length * 0.95) - 1],
                    renderer: debug
                      ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
                      : "unavailable",
                    ...window.studyInfo(),
                  });
                }
              }
              requestAnimationFrame(frame);
            }),
        );
        if (
          sample.bufferWidth !== 1280 ||
          sample.bufferHeight !== 720 ||
          sample.activeMeshInstances !== count ||
          sample.positions.some(
            (p) => p.x < 0 || p.x > 1280 || p.y < 0 || p.y > 720 || p.z <= 0,
          )
        )
          throw Error("Drawing buffer or visible actor invariant failed");
        report.samples.push({ trial, ...sample });
        if (trial === 0)
          await page.screenshot({
            path: `${out}/load-${count}-${variant}.png`,
          });
        fs.writeFileSync(
          `${out}/performance.json`,
          JSON.stringify(report, null, 2) + "\n",
        );
        console.log(
          `${count} ${variant} trial ${trial}: ${sample.softwareFps.toFixed(2)} software FPS / ${sample.frames} frames`,
        );
        await context.close();
      }
} finally {
  await browser.close();
}

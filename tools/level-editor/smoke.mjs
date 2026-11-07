import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  acceptDownloads: true,
});
page.setDefaultTimeout(30000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(
    process.env.EDITOR_REVIEW_URL ?? "http://127.0.0.1:5178/editor",
  );
  await page.locator("canvas").waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector("canvas")?.dataset.arenaAssetCount === "14/14" &&
      document.querySelector("canvas")?.dataset.arenaAssets === "ready",
    null,
    { timeout: 150000 },
  );

  const editor = page.locator(
    'canvas[aria-label="Cosmic Sprint editor viewport"]',
  );
  await page.locator('[data-object="launch-island"]').click();
  await page.locator("[data-collider-mode]").check();
  for (const [key, value] of [
    ["z", 16],
    ["width", 8],
    ["depth", 8],
  ]) {
    await page.locator(`[data-collider-property="${key}"]`).fill(String(value));
    await page.locator(`[data-collider-property="${key}"]`).press("Tab");
  }
  const draft = JSON.parse(await editor.getAttribute("data-layout"));
  assert.equal(draft.objects[0].z, 12);
  assert.equal(draft.objects[0].colliders[0].z, 16);
  await page.locator("[data-undo]").click();
  await page.locator("[data-redo]").click();
  assert.deepEqual(JSON.parse(await editor.getAttribute("data-layout")), draft);
  const sockets = [];
  page.on("websocket", (socket) => sockets.push(socket.url()));
  await page.locator("[data-playtest]").click();
  const game = page.locator('canvas[aria-label="Local Playtest"]');
  await page.waitForFunction(
    () => {
      const c = document.querySelector('canvas[aria-label="Local Playtest"]');
      return (
        c?.dataset.character === "minimorph-optimized-v1" &&
        c.dataset.arenaAssets === "ready"
      );
    },
    null,
    { timeout: 150000 },
  );
  await game.focus();
  await page.keyboard.down("KeyD");
  await page.waitForFunction(
    () => {
      const d = document.querySelector(
        'canvas[aria-label="Local Playtest"]',
      ).dataset;
      return Number(d.playtestX) > 4 && Number(d.playtestY) < -0.05;
    },
    null,
    { timeout: 40000 },
  );
  await page.keyboard.up("KeyD");
  await page.locator("[data-exit-playtest]").click();
  assert.deepEqual(JSON.parse(await editor.getAttribute("data-layout")), draft);
  assert.equal(
    await page.locator('[data-collider-property="width"]').inputValue(),
    "8",
  );
  const download = page.waitForEvent("download");
  await page.locator("[data-export]").click();
  const file = await download,
    path = await file.path();
  await page.locator("[data-reset]").click();
  await page.locator("[data-file]").setInputFiles(path);
  await page.waitForFunction(
    () =>
      JSON.parse(
        document.querySelector(
          'canvas[aria-label="Cosmic Sprint editor viewport"]',
        ).dataset.layout,
      ).objects.length === 1,
  );
  assert.deepEqual(JSON.parse(await editor.getAttribute("data-layout")), draft);
  assert.deepEqual(sockets, []);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: independent collider offsets/dimensions -> Undo/Redo -> real Playtest falling beyond edited collider while visual unchanged -> Exit -> JSON export/reset/import; no sockets or errors.",
  );
} finally {
  await browser.close();
}

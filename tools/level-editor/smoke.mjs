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
  await page.locator('[data-property="x"]').fill("2");
  await page.locator('[data-property="x"]').press("Tab");
  await page.locator('[data-property="width"]').fill("30");
  await page.locator('[data-property="width"]').press("Tab");
  const draft = JSON.parse(await editor.getAttribute("data-layout"));
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
  const startZ = Number(await game.getAttribute("data-playtest-z"));
  await game.focus();
  await page.keyboard.down("KeyW");
  await page.waitForFunction(
    (z) =>
      Number(
        document.querySelector('canvas[aria-label="Local Playtest"]').dataset
          .playtestZ,
      ) <
      z - 0.1,
    startZ,
    { timeout: 30000 },
  );
  await page.keyboard.up("KeyW");
  await page.keyboard.press("Space");
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector('canvas[aria-label="Local Playtest"]').dataset
          .playtestY,
      ) > 0.05,
    null,
    { timeout: 15000 },
  );
  await page.locator("[data-exit-playtest]").click();
  assert.deepEqual(JSON.parse(await editor.getAttribute("data-layout")), draft);
  assert.equal(
    await page.locator('[data-property="width"]').inputValue(),
    "30",
  );
  await page.locator("[data-undo]").click();
  await page.locator("[data-redo]").click();
  assert.deepEqual(JSON.parse(await editor.getAttribute("data-layout")), draft);
  await page.locator("[data-playtest]").click();
  await page.waitForFunction(
    () =>
      document.querySelector('canvas[aria-label="Local Playtest"]')?.dataset
        .arenaAssets === "ready",
    null,
    { timeout: 90000 },
  );
  await page.locator("[data-exit-playtest]").click();
  assert.deepEqual(JSON.parse(await editor.getAttribute("data-layout")), draft);
  assert.deepEqual(sockets, []);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: unsaved edit -> real Minimorph Playtest -> move/jump -> Exit -> exact draft + history preserved; repeated Playtest/Exit; no WebSockets or page errors.",
  );
} finally {
  await browser.close();
}

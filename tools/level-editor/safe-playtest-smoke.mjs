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
  const read = async () => JSON.parse(await editor.getAttribute("data-layout"));
  const start = async () =>
    JSON.parse(await editor.getAttribute("data-playtest-start-validation"));
  const sockets = [];
  page.on("websocket", (s) => sockets.push(s.url()));
  const storage = await page.evaluate(() => JSON.stringify(localStorage));
  assert.equal(await page.locator("[data-grid-snap]").isChecked(), false);
  assert.equal((await start()).valid, true);
  await page.locator('[data-object="launch-island"]').click();
  const original = await read();
  await page.locator("[data-grid-snap]").check();
  await page.locator("[data-grid-step]").selectOption("0.5");
  assert.deepEqual(await read(), original);
  await page.locator('[data-property="x"]').fill("1.13");
  await page.locator('[data-property="x"]').press("Tab");
  assert.equal(
    (await read()).objects.find((o) => o.id === "launch-island").x,
    1,
  );
  await page.locator("[data-undo]").click();
  assert.deepEqual(await read(), original);
  await page.locator("[data-redo]").click();
  await page.locator("[data-playtest-start]").selectOption("selection");
  assert.equal((await start()).valid, true);
  await page.locator("[data-focus]").click();
  const draft = await read(),
    selection = await editor.getAttribute("data-editor-selection"),
    camera = await editor.getAttribute("data-editor-camera");
  await page.locator("[data-playtest-start]").selectOption("checkpoint");
  await page.locator("[data-start-checkpoint]").selectOption("0");
  const checkpoint = await start();
  assert.equal(checkpoint.valid, true);
  async function enter() {
    await page.locator("[data-playtest]").click();
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
    return page.locator('canvas[aria-label="Local Playtest"]');
  }
  let game = await enter();
  assert.ok(
    Math.abs(
      Number(await game.getAttribute("data-playtest-x")) -
        checkpoint.start.point.x,
    ) < 0.01,
  );
  await game.focus();
  await page.keyboard.down("KeyD");
  await page.waitForFunction(
    (x) =>
      Number(
        document.querySelector('canvas[aria-label="Local Playtest"]').dataset
          .playtestX,
      ) >
      x + 0.5,
    checkpoint.start.point.x,
    { timeout: 30000 },
  );
  await page.keyboard.up("KeyD");
  await page.locator("[data-restart-playtest]").click();
  await page.waitForFunction(
    (x) =>
      Math.abs(
        Number(
          document.querySelector('canvas[aria-label="Local Playtest"]').dataset
            .playtestX,
        ) - x,
      ) < 0.01,
    checkpoint.start.point.x,
  );
  assert.equal(Number(await game.getAttribute("data-playtest-checkpoint")), 1);
  await page.locator("[data-exit-playtest]").click();
  assert.deepEqual(await read(), draft);
  assert.equal(await editor.getAttribute("data-editor-selection"), selection);
  assert.equal(await editor.getAttribute("data-editor-camera"), camera);
  await page.locator("[data-undo]").click();
  assert.deepEqual(await read(), original);
  await page.locator("[data-redo]").click();
  assert.deepEqual(await read(), draft);
  await page.locator("[data-top]").click();
  await page.locator("[data-focus]").click();
  await page.locator("[data-pick-start]").click();
  const box = await editor.boundingBox();
  await editor.click({ position: { x: box.width / 2, y: box.height / 2 } });
  const point = await start();
  assert.equal(point.valid, true);
  const camera2 = await editor.getAttribute("data-editor-camera");
  game = await enter();
  assert.ok(
    Math.abs(
      Number(await game.getAttribute("data-playtest-x")) - point.start.point.x,
    ) < 0.01,
  );
  await page.locator("[data-exit-playtest]").click();
  assert.deepEqual(await read(), draft);
  assert.equal(await editor.getAttribute("data-editor-selection"), selection);
  assert.equal(await editor.getAttribute("data-editor-camera"), camera2);
  assert.equal(await page.locator("canvas").count(), 1);
  assert.equal(
    await page.evaluate(() => JSON.stringify(localStorage)),
    storage,
  );
  assert.deepEqual(sockets, []);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: grid opt-in/rounding/Undo/Redo; default/selected/checkpoint/picked starts; actual local movement + Restart; two Playtest sessions restore draft/selection/camera/history, no extra canvas, sockets, storage writes or page errors.",
  );
} finally {
  await browser.close();
}

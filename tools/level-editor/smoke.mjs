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

  await page.locator("[data-asset-search]").fill("main-floor-tile");
  await page.locator("[data-catalog]").selectOption("catalog:main-floor-tile");
  await page.locator("[data-add]").click();
  const id = await page.locator("canvas").getAttribute("data-editor-selected");
  assert.match(id, /^editor-/);
  const edit = async (key, value) => {
    await page.locator(`[data-property="${key}"]`).fill(String(value));
    await page.locator(`[data-property="${key}"]`).press("Tab");
  };
  const draft = async () =>
    JSON.parse(await page.locator("canvas").getAttribute("data-layout"));
  await edit("x", 25);
  await edit("width", 18);
  await edit("scale", 1.5);
  assert.equal((await draft()).objects[0].scale, 1.5);
  await page.locator("[data-undo]").click();
  assert.equal((await draft()).objects[0].scale, undefined);
  await page.locator("[data-redo]").click();
  assert.equal((await draft()).objects[0].scale, 1.5);
  await page.keyboard.press("Control+z");
  assert.equal((await draft()).objects[0].scale, undefined);
  await page.keyboard.press("Control+Shift+z");
  const before = await draft();
  const download = page.waitForEvent("download");
  await page.locator("[data-export]").click();
  const file = await download,
    path = await file.path();
  await page.locator("[data-reset]").click();
  assert.deepEqual((await draft()).objects, []);
  await page.locator("[data-file]").setInputFiles(path);
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector("canvas").dataset.layout).objects
        .length === 1,
  );
  assert.deepEqual(await draft(), before);
  await page.locator("[data-asset-search]").fill("curved-floor-corner");
  await page
    .locator("[data-catalog]")
    .selectOption("catalog:curved-floor-corner");
  await page.locator("[data-add]").click();
  await page.waitForFunction(
    () =>
      document.querySelector("canvas").dataset.arenaAssetCount === "15/15" &&
      document.querySelector("canvas").dataset.arenaAssets === "ready",
    null,
    { timeout: 90000 },
  );
  assert.match(
    await page.locator("[data-inspector]").innerText(),
    /NON-COLLIDABLE/,
  );
  const added = await page
    .locator("canvas")
    .getAttribute("data-editor-selected");
  await page.locator("[data-undo]").click();
  assert.equal(await page.locator(`[data-object="${added}"]`).count(), 0);
  await page.locator("[data-redo]").click();
  assert.equal(await page.locator(`[data-object="${added}"]`).count(), 1);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: add -> move -> linked scale -> undo/redo + shortcuts -> export/reset/import; newly streamed catalog GLB; creation undo/redo; no page errors.",
  );
} finally {
  await browser.close();
}

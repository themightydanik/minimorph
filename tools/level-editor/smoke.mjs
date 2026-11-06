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
  console.log(
    "Actual GLBs ready",
    await page.locator("canvas").getAttribute("data-arena-instances"),
  );
  await page.locator("[data-top]").click();
  const rect = await page.locator("canvas").boundingBox(),
    scale = rect.height / (2 * 290 * Math.tan((29 * Math.PI) / 180));
  await page.mouse.click(
    rect.x + rect.width / 2 - 38 * scale,
    rect.y + rect.height / 2 + 102 * scale,
  );
  assert.equal(
    await page.locator("canvas").getAttribute("data-editor-selected"),
    "launch-island",
  );
  console.log("Viewport selection passed");
  await page.locator("[data-property=x]").fill("6");
  await page.locator("[data-property=x]").press("Tab");
  await page.locator("[data-property=yaw]").fill("30");
  await page.locator("[data-property=yaw]").press("Tab");
  await page.locator('[data-object="art-park-hammer-0"]').click();
  assert.equal(await page.locator("[data-property=yaw]").isDisabled(), true);
  await page.locator("[data-property=x]").fill("9");
  await page.locator("[data-property=x]").press("Tab");
  await page.locator("[data-property=y]").fill("1.25");
  await page.locator("[data-property=y]").press("Tab");
  const before = JSON.parse(
    await page.locator("canvas").getAttribute("data-layout"),
  );
  const download = page.waitForEvent("download");
  await page.locator("[data-export]").click();
  const file = await download;
  const path = await file.path();
  await page.locator("[data-reset]").click();
  assert.deepEqual(
    JSON.parse(await page.locator("canvas").getAttribute("data-layout"))
      .objects,
    [],
  );
  await page.locator("[data-file]").setInputFiles(path);
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector("canvas").dataset.layout).objects
        .length === 2,
  );
  assert.deepEqual(
    JSON.parse(await page.locator("canvas").getAttribute("data-layout")),
    before,
  );
  await page.locator('[data-object="launch-island"]').click();
  assert.equal(await page.locator("[data-property=x]").inputValue(), "6");
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  assert.equal(
    await page
      .locator('[data-hierarchy] button[data-object^="editor-"]')
      .count(),
    1,
  );
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  assert.equal(
    await page
      .locator('[data-hierarchy] button[data-object^="editor-"]')
      .count(),
    0,
  );
  await page
    .locator("[data-file]")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":2}'),
    });
  await page
    .getByRole("status")
    .filter({ hasText: "Import rejected" })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: GLBs, viewport selection, platform + hammer move, rotation restriction, export/reset/import, duplicate/delete, invalid import; no page errors.",
  );
} finally {
  await browser.close();
}

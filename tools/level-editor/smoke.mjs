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
  const change = async (selector, value) => {
    await page.locator(selector).fill(String(value));
    await page.locator(selector).press("Tab");
  };
  await page.locator("[data-add-layer]").selectOption("environment");
  await page
    .locator("[data-catalog]")
    .selectOption("catalog:space-decoration-kit:0");
  await page.locator("[data-add]").click();
  const a = (await read()).environment[0].id;
  await change('[data-environment-property="x"]', 0);
  await page.locator("[data-add]").click();
  const b = (await read()).environment[1].id;
  await change('[data-environment-property="x"]', 10);
  await page.locator(`[data-object="${a}"]`).click();
  await page.locator(`[data-object="${b}"]`).click({ modifiers: ["Control"] });
  await page.locator('button[data-group=""]').click();
  assert.equal((await read()).groups.length, 1);
  await change('[data-group-property="x"]', 20);
  await change('[data-group-property="yaw"]', 90);
  await change('[data-group-property="scale"]', 2);
  const transformed = await read();
  assert.equal(transformed.environment[0].scale, 2);
  assert.ok(Math.abs(transformed.environment[0].x - 20) < 1e-9);
  await page.locator("[data-undo]").click();
  assert.equal((await read()).environment[0].scale, 1);
  await page.locator("[data-redo]").click();
  assert.deepEqual(await read(), transformed);
  await page.locator("[data-duplicate-selection]").click();
  assert.equal((await read()).environment.length, 4);
  assert.equal((await read()).groups.length, 2);
  await page.locator("[data-focus]").click();
  await page.locator("[data-ungroup]").click();
  assert.equal((await read()).groups.length, 1);
  const c = (await read()).environment[2].id;
  await page.locator(`[data-object="${c}"]`).click();
  await page.locator("[data-environment-animation]").selectOption("pulse");
  await change('[data-animation-property="speed"]', 0.5);
  await change('[data-animation-property="amplitude"]', 1.5);
  await page.waitForFunction(
    () => document.querySelector("canvas").dataset.arenaAssets === "ready",
    null,
    { timeout: 150000 },
  );
  await page.locator(`[data-toggle-locked="${c}"]`).click();
  assert.equal(await page.locator(`[data-object="${c}"]`).isDisabled(), true);
  await page.locator(`[data-toggle-locked="${c}"]`).click();
  await page.locator(`[data-toggle-visible="${c}"]`).click();
  assert.equal((await read()).environment[2].visible, false);
  await page.locator(`[data-toggle-visible="${c}"]`).click();
  await page.locator("[data-show-environment]").uncheck();
  await page.locator("[data-show-environment]").check();
  const draft = await read();
  const download = page.waitForEvent("download");
  await page.locator("[data-export]").click();
  const file = await download,
    path = await file.path();
  await page.locator("[data-reset]").click();
  assert.equal((await read()).environment, undefined);
  await page.locator("[data-file]").setInputFiles(path);
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector("canvas").dataset.layout).environment
        ?.length === 4,
  );
  assert.deepEqual(await read(), draft);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: add environment → multi-select → group → move/rotate/scale → Undo/Redo → duplicate → focus → ungroup → pulse → lock/visibility/layer → JSON export/reset/import; no page errors.",
  );
} finally {
  await browser.close();
}

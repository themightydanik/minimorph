import { expect } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";
import {
  copyFileSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from "node:fs";
export async function waitParkAssets(page: Page) {
  const canvas = page.locator("canvas");
  if (await canvas.getAttribute("data-arena-assets"))
    await expect
      .poll(
        async () => {
          const status = await canvas.getAttribute("data-arena-assets");
          // PlayCanvas defers embedded file.contents callbacks with setTimeout(0).
          // Flush that queue under the replay clock without rendering idle wait frames.
          if (status === "loading") await page.clock.runFor(1);
          return canvas.getAttribute("data-arena-assets");
        },
        { timeout: 180000 },
      )
      .toBe("ready");
}
/** Waits on real asset events; advances only the intended amount of simulation, never player state. */
export async function advancePark(page: Page, seconds: number) {
  const canvas = page.locator("canvas"),
    start = Number(await canvas.getAttribute("data-simulation-time")),
    target = start + seconds;
  for (let i = 0; i < Math.ceil(seconds * 20) + 60; i++) {
    await waitParkAssets(page);
    const time = Number(await canvas.getAttribute("data-simulation-time"));
    if (
      time >= target - 0.004 ||
      (await canvas.getAttribute("data-phase")) === "finished"
    )
      return;
    await page.clock.fastForward(
      Math.max(9, Math.min(100, Math.ceil((target - time) * 1000))),
    );
  }
  throw Error(`Simulation did not reach ${target}s`);
}
export async function capturePark(page: Page, info: TestInfo, name: string) {
  await waitParkAssets(page);
  await expect
    .poll(
      async () => {
        const value = await page
          .locator("canvas")
          .getAttribute("data-arena-asset-count");
        if (!value) return true;
        const [loaded, total] = value.split("/").map(Number);
        if (loaded !== total) await page.clock.runFor(1);
        return loaded === total;
      },
      { timeout: 180000 },
    )
    .toBe(true);
  await page.clock.runFor(20);
  const file = `test-results/park-${info.project.name}-${name}.png`;
  await page.screenshot({ path: file });
  if (process.env.COSMIC_EVIDENCE === "1") {
    const directory = "docs/evidence/cosmic-sprint";
    mkdirSync(directory, { recursive: true });
    copyFileSync(file, `${directory}/${info.project.name}-${name}.png`);
    const metadata = `${directory}/${info.project.name}.json`,
      rows = existsSync(metadata)
        ? JSON.parse(readFileSync(metadata, "utf8"))
        : [];
    const row = {
      name,
      performanceBenchmark: false,
      physicalDevice: false,
      clockMode:
        "Playwright controlled clock for input replay; screenshot timing counters are not performance measurements",
      method:
        "Actual integrated PlayCanvas scene, ordinary game controls; no injected position/checkpoint/result",
      ...(await page.locator("canvas").evaluate((c) => ({
        viewport: [innerWidth, innerHeight],
        devicePixelRatio,
        buffer: [
          (c as HTMLCanvasElement).width,
          (c as HTMLCanvasElement).height,
        ],
        data: { ...c.dataset },
      }))),
    };
    writeFileSync(
      metadata,
      JSON.stringify(
        [...rows.filter((r: { name: string }) => r.name !== name), row],
        null,
        2,
      ) + "\n",
    );
  }
}

import { test, expect } from "@playwright/test";
test("original and approved candidate remain comparable in the review harness with unchanged resolution policy", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    "http://127.0.0.1:5175/optimization-study.html?compare=1&clip=Run&time=0.15&view=front",
  );
  await page.waitForFunction(
    () => (window as unknown as Window & { studyReady?: boolean }).studyReady,
    undefined,
    { timeout: 60000 },
  );
  const info = await page.evaluate(() => {
    const study = (
      window as unknown as Window & {
        studyInfo: () => {
          activeMeshInstances: number;
          triangleCounts: number[];
          animationTimes: number[];
          bufferWidth: number;
          bufferHeight: number;
          pixelRatio: number;
        };
      }
    ).studyInfo();
    const canvas = document.querySelector("canvas")!;
    return {
      ...study,
      cssWidth: canvas.clientWidth,
      cssHeight: canvas.clientHeight,
      dpr: devicePixelRatio,
    };
  });
  expect(info.activeMeshInstances).toBe(2);
  expect(info.triangleCounts).toEqual([160000, 125928]);
  expect(info.animationTimes.every((t) => Math.abs(t - 0.15) < 0.001)).toBe(
    true,
  );
  expect(info.pixelRatio).toBe(Math.min(info.dpr, 1.5));
  expect(
    Math.abs(info.bufferWidth - info.cssWidth * info.pixelRatio),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(info.bufferHeight - info.cssHeight * info.pixelRatio),
  ).toBeLessThanOrEqual(1);
  await expect(page.locator("#status")).toContainText("candidate approved in PR #9");
  await expect(page.locator("#right")).toContainText("PRODUCTION APPROVED");
  expect(errors).toEqual([]);
});

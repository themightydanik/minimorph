import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { courseRun } from "../helpers/course-run";
for (const [target, port] of [
  ["telegram", 5173],
  ["minima", 5174],
] as const) {
  test(`${target}: renders, moves, jumps, recovers, restarts and resizes`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // Browser practice must remain usable if the optional Telegram SDK is offline.
    await page.route("https://telegram.org/**", (route) => route.abort());
    await page.goto(`http://127.0.0.1:${port}`);
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveAttribute("data-ready", "true");
    await expect(page.locator(".host-status")).toContainText(
      "Browser practice",
    );
    // A live HUD cannot hide an invalid camera: sample actual WebGL scene
    // pixels in a frame, before the default drawing buffer is discarded.
    const litPixels = await canvas.evaluate(
      (c) =>
        new Promise<number>((resolve) =>
          requestAnimationFrame(() => {
            const sample = document.createElement("canvas");
            sample.width = 64;
            sample.height = 64;
            const context = sample.getContext("2d")!;
            context.drawImage(c as HTMLCanvasElement, 0, 0, 64, 64);
            const pixels = context.getImageData(0, 0, 64, 64).data;
            let lit = 0;
            for (let i = 0; i < pixels.length; i += 4)
              if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 60) lit++;
            resolve(lit);
          }),
        ),
    );
    expect(litPixels).toBeGreaterThan(30);
    const distance = page.locator("[data-distance]");
    await expect(distance).toHaveText("34.0m");
    if (testInfo.project.name === "mobile") {
      const forward = page.getByRole("button", {
        name: "Move forward",
        exact: true,
      });
      const box = (await forward.boundingBox())!;
      const jumpBox = (await page
        .getByRole("button", { name: "Jump", exact: true })
        .boundingBox())!;
      const session = await page.context().newCDPSession(page);
      const direction = {
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
        id: 1,
      };
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [direction],
      });
      await expect(distance).not.toHaveText("34.0m");
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          direction,
          {
            x: jumpBox.x + jumpBox.width / 2,
            y: jumpBox.y + jumpBox.height / 2,
            id: 2,
          },
        ],
      });
      await expect(canvas).toHaveAttribute("aria-description", "Airborne");
      await session.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await session.detach();
    } else {
      await canvas.click();
      await page.keyboard.down("KeyW");
      await expect(distance).not.toHaveText("34.0m");
      await page.keyboard.up("KeyW");
      await page.keyboard.press("Space");
    }
    await expect(canvas).toHaveAttribute("aria-description", "Airborne");
    await expect(canvas).toHaveAttribute("aria-description", "On platform");
    await canvas.focus();
    await page.keyboard.down("KeyD");
    await expect(page.locator("[data-falls]")).toHaveText("1", {
      timeout: 7000,
    });
    await page.keyboard.up("KeyD");
    await page.getByRole("button", { name: "Restart" }).click();
    await expect(page.locator("[data-falls]")).toHaveText("0");
    await expect(distance).toHaveText("34.0m");
    await page.setViewportSize({ width: 900, height: 450 });
    await expect
      .poll(() =>
        canvas.evaluate(
          (c) =>
            (c as HTMLCanvasElement).width / (c as HTMLCanvasElement).height,
        ),
      )
      .toBeCloseTo(2, 1);
    await page.screenshot({
      path: `test-results/${target}-${testInfo.project.name}.png`,
    });
    expect(errors).toEqual([]);
  });
}
test("Telegram bridge initializes without using host data as authentication", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.Telegram = {
      WebApp: {
        initData: "mock-host-data",
        ready() {
          document.documentElement.dataset.tgReady = "true";
        },
        expand() {},
        viewportStableHeight: 640,
        onEvent() {},
        offEvent() {},
      },
    };
  });
  await page.goto("http://127.0.0.1:5173");
  await expect(page.locator("html")).toHaveAttribute("data-tg-ready", "true");
  await expect(page.locator(".host-status")).toHaveText(
    "Telegram · practice mode",
  );
});
test("MDS shell uses the bridge for status only (mock, not a live node)", async ({
  page,
}) => {
  await page.route("**/mds.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.MDS = { init(cb) { cb({event:'inited'}); }, cmd(command, cb) { if(command !== 'status') throw new Error('Unexpected command'); cb({status:true,response:{chain:{block:123}}}); } };`,
    }),
  );
  await page.goto("http://127.0.0.1:5174/?uid=0x123abc");
  await expect(page.locator(".host-status")).toHaveText(
    "Minima node · block 123 · read only",
  );
});

async function setKeys(page: Page, keys: string[], held: Set<string>) {
  for (const key of held)
    if (!keys.includes(key)) {
      await page.keyboard.up(key);
      held.delete(key);
    }
  for (const key of keys)
    if (!held.has(key)) {
      await page.keyboard.down(key);
      held.add(key);
    }
}
async function startControlledRun(page: Page, port: number) {
  await page.clock.install();
  await page.route("https://telegram.org/**", (route) => route.abort());
  await page.goto(`http://127.0.0.1:${port}`);
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true");
  await page.clock.pauseAt(
    new Date(await page.evaluate(() => Date.now() + 100)),
  );
  await page.getByRole("button", { name: "Restart" }).click();
  await page.clock.runFor(32);
}
async function playSegments(page: Page, count: number) {
  const held = new Set<string>();
  for (const segment of courseRun.slice(0, count)) {
    await setKeys(page, segment.keys, held);
    if (segment.jump) await page.keyboard.press("Space");
    await page.clock.runFor(Math.round(segment.seconds * 1000));
  }
  await setKeys(page, [], held);
}
for (const [target, port] of [
  ["telegram", 5173],
  ["minima", 5174],
] as const) {
  test(`${target}: completes course, celebrates, restarts and restores checkpoint after a fall`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await startControlledRun(page, port);
    await playSegments(page, courseRun.length);
    await expect(page.locator("[data-checkpoints]")).toHaveText("2 / 2");
    await expect(page.locator("[data-falls]")).toHaveText("0");
    await expect(page.getByRole("status")).toContainText("Orbit complete");
    await expect(page.locator("#app")).toHaveClass(/celebrating/);
    const finishTime = await page.locator("[data-time]").textContent();
    await page.clock.runFor(500);
    await expect(page.locator("[data-time]")).toHaveText(finishTime!);
    await page.screenshot({
      path: `test-results/${target}-finish-${page.viewportSize()!.width}.png`,
    });
    await page.getByRole("button", { name: "Restart" }).click();
    await page.clock.runFor(16);
    await expect(page.locator("[data-checkpoints]")).toHaveText("0 / 2");
    await expect(page.locator("#app")).not.toHaveClass(/celebrating/);
    await playSegments(page, 2);
    await expect(page.locator("[data-checkpoints]")).toHaveText("1 / 2");
    await page.keyboard.down("KeyD");
    for (let i = 0; i < 25; i++) {
      await page.clock.runFor(100);
      if (
        (await page.locator("canvas").getAttribute("aria-description")) ===
        "Respawning"
      )
        break;
    }
    await expect(page.locator("canvas")).toHaveAttribute(
      "aria-description",
      "Respawning",
    );
    await page.keyboard.up("KeyD");
    await page.clock.runFor(700);
    await expect(page.locator("[data-falls]")).toHaveText("1");
    await expect(page.locator("[data-checkpoints]")).toHaveText("1 / 2");
    await expect(page.locator("canvas")).toHaveAttribute(
      "aria-description",
      "On platform",
    );
    const distance = parseFloat(
      (await page.locator("[data-distance]").textContent())!,
    );
    expect(distance).toBeGreaterThan(22);
    expect(distance).toBeLessThan(25);
    expect(errors).toEqual([]);
  });
  test(`${target}: sweeper collision gives readable feedback and checkpoint recovery`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await startControlledRun(page, port);
    await playSegments(page, 4);
    await page.keyboard.down("KeyW");
    for (let i = 0; i < 10; i++) {
      await page.clock.runFor(100);
      if (await page.locator('canvas').getAttribute('aria-description') === 'Respawning') break;
    }
    await page.keyboard.up("KeyW");
    await expect(page.getByRole("status")).toContainText("Sweeper hit");
    await expect(page.locator("canvas")).toHaveAttribute(
      "aria-description",
      "Respawning",
    );
    await page.clock.runFor(600);
    await expect(page.locator("[data-falls]")).toHaveText("1");
    await expect(page.locator("[data-checkpoints]")).toHaveText("1 / 2");
    await expect(page.locator("canvas")).toHaveAttribute(
      "aria-description",
      "On platform",
    );
  });
}

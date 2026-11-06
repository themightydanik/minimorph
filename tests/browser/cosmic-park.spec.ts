import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { RunSegment } from "../helpers/arena-runs";
import {
  advancePark,
  capturePark,
  waitParkAssets,
} from "../helpers/park-browser";
const run: { segments: RunSegment[] } = JSON.parse(
  readFileSync("tests/fixtures/park-easy-run.json", "utf8"),
);
test("Galactic Fun Park GLBs, course overview, Bounce Garden, mobile controls, all five zones and disposal", async ({
  page,
}, info) => {
  // Full-map loading plus a complete legal-input route on CI software rendering.
  test.setTimeout(1200000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /shader|webgl/i.test(m.text()))
      errors.push(m.text());
  });
  await page.route("https://telegram.org/**", (r) => r.abort());
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.goto("http://127.0.0.1:5173");
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute(
    "data-character",
    "minimorph-optimized-v1",
    { timeout: 60000 },
  );
  // Pause while the scene is still cheap; async asset events continue without rendering idle wait frames.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 50));
  await page
    .getByRole("button", { name: "Play Cosmic Sprint", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Galactic Fun Park", exact: true }),
  ).toBeVisible();
  await waitParkAssets(page);
  await page
    .getByRole("button", { name: "Course overview", exact: true })
    .click();
  await waitParkAssets(page);
  await expect(canvas).toHaveAttribute("data-overview", "true");
  await expect(
    page.getByRole("button", { name: "Back to character", exact: true }),
  ).toBeVisible();
  await capturePark(page, info, "overview");
  await page
    .getByRole("button", { name: "Back to character", exact: true })
    .click();
  await waitParkAssets(page);
  await expect(canvas).toBeVisible();
  await page.getByRole("button", { name: "Start race", exact: true }).click();
  await page.clock.fastForward(3100);
  await expect(canvas).toHaveAttribute("data-phase", "racing");
  if (info.project.name === "mobile") {
    const cdp = await page.context().newCDPSession(page),
      stick = (await page
        .getByRole("group", { name: "Movement joystick" })
        .boundingBox())!,
      jump = (await page
        .getByRole("button", { name: "Jump", exact: true })
        .boundingBox())!;
    const touch = {
      x: stick.x + stick.width * 0.73,
      y: stick.y + stick.height * 0.27,
      id: 1,
    };
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        touch,
        { x: jump.x + jump.width / 2, y: jump.y + jump.height / 2, id: 2 },
      ],
    });
    await page.clock.runFor(150);
    await expect(canvas).toHaveAttribute("aria-description", "Airborne");
    expect(Number(await canvas.getAttribute("data-heading"))).toBeLessThan(
      -0.2,
    );
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(page.locator(".touch-controls .pressed")).toHaveCount(0);
    await cdp.detach();
    await page.getByRole("button", { name: "Restart", exact: false }).click();
    await page.clock.fastForward(3100);
  }
  await capturePark(page, info, "star-launch");
  await canvas.focus();
  const held = new Set<string>(),
    captured = new Set<string>();
  let elapsed = 0;
  for (const segment of run.segments) {
    await waitParkAssets(page);
    for (const key of held)
      if (!segment.keys.includes(key)) {
        await page.keyboard.up(key);
        held.delete(key);
      }
    for (const key of segment.keys)
      if (!held.has(key)) {
        await page.keyboard.down(key);
        held.add(key);
      }
    if (segment.jump) await page.keyboard.press("Space");
    await advancePark(page, segment.seconds);
    elapsed += segment.seconds;
    for (const [name, time] of [
      ["hammer-plaza", 10],
      ["bounce-garden", 31],
      ["orbit-carousel", 51],
      ["star-finish", 64],
    ] as const)
      if (elapsed >= time && !captured.has(name)) {
        captured.add(name);
        await capturePark(page, info, name);
      }
  }
  for (const key of held) await page.keyboard.up(key);
  await expect(canvas).toHaveAttribute("data-phase", "finished");
  await expect(canvas).toHaveAttribute("data-character-active", "Victory");
  await expect(canvas).toHaveAttribute("data-hits", "0");
  await expect(page.locator("[data-falls]")).toHaveText("0");
  await expect(page.locator("[data-checkpoints]")).toHaveText("6 / 6");
  await capturePark(page, info, "bounce-finish");
  await page.getByRole("button", { name: "Choose arena", exact: true }).click();
  await page
    .getByRole("button", { name: "Training tracks", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Play Cosmic Sprint", exact: true })
    .click();
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.getAttribute("data-arena-assets")).toBeNull();
  await page.getByRole("button", { name: "Start race", exact: true }).click();
  await page.clock.fastForward(3100);
  await expect(canvas).toHaveAttribute("data-phase", "racing");
  expect(errors).toEqual([]);
});
test("missing GLB fails visibly without primitive substitution; delayed loads cannot resurrect a disposed arena", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let release = () => {};
  const delayed = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/wide-floating-island-*.glb", (r) => r.abort());
  await page.route("**/cosmic-start-gate-*.glb", async (r) => {
    await delayed;
    await r.continue();
  });
  await page.route("https://telegram.org/**", (r) => r.abort());
  await page.goto("http://127.0.0.1:5173");
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute(
    "data-character",
    "minimorph-optimized-v1",
    { timeout: 60000 },
  );
  await page
    .getByRole("button", { name: "Play Cosmic Sprint", exact: true })
    .click();
  await expect(canvas).toHaveAttribute("data-arena-assets", "error", {
    timeout: 60000,
  });
  await expect(
    page.getByRole("button", { name: "Start race", exact: true }),
  ).toBeDisabled();
  await expect(page.locator("[data-arena-loading]")).toContainText(
    "Arena assets unavailable",
  );
  await page.getByRole("button", { name: "Choose arena", exact: true }).click();
  await page
    .getByRole("button", { name: "Training tracks", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Play Cosmic Sprint", exact: true })
    .click();
  const gateResponse = page.waitForResponse(
    (r) => r.url().includes("cosmic-start-gate") && r.status() === 200,
  );
  release();
  await gateResponse;
  await page.getByRole("button", { name: "Start race", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-phase", "racing");
  await page.waitForTimeout(1500);
  await expect.poll(() => canvas.getAttribute("data-arena-assets")).toBeNull();
  await expect(canvas).toBeVisible();
  expect(errors).toEqual([]);
});

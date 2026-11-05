import { test, expect } from "@playwright/test";
import { mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import type { RoomSnapshot } from "@minimorph/multiplayer-protocol";
test("authoritative tournament lobby, 8 → 6 → 4 transitions, spectator, reconnect, podium and replay", async ({
  page,
  request,
}, info) => {
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const control = async (body: object) => {
    const response = await request.post("http://127.0.0.1:3013/control", {
      headers: { "x-minimorph-review": "tournament-review-v1" },
      data: body,
      timeout: 60000,
    });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()) as { rooms: RoomSnapshot[] };
  };
  await control({ action: "reset" });
  await page.addInitScript(() => {
    const Original = window.WebSocket;
    window.WebSocket = class extends Original {
      constructor(url: string | URL, protocols?: string | string[]) {
        const endpoint = new URL(String(url));
        if (endpoint.hostname === "127.0.0.1" && endpoint.pathname === "/ws")
          endpoint.port = "3012";
        super(endpoint.href, protocols);
      }
    };
  });
  let blocked = false,
    cut = () => {};
  await page.routeWebSocket("**/ws", (route) => {
    if (blocked) {
      route.close();
      return;
    }
    const upstream = route.connectToServer();
    route.onMessage((m) => upstream.send(m));
    upstream.onMessage((m) => route.send(m));
    cut = () => {
      upstream.close();
      route.close();
    };
  });
  await page.route("https://telegram.org/**", (r) => r.abort());
  await page.goto("http://127.0.0.1:5173");
  const root = page.locator("#app"),
    canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute(
    "data-character",
    "minimorph-optimized-v1",
    { timeout: 60000 },
  );
  await expect(page.getByLabel("Multiplayer format")).toHaveValue("tournament");
  await page.locator("[data-online-name]").fill("Review Cadet");
  await page.getByRole("button", { name: "Create Room", exact: true }).click();
  await expect(root).toHaveAttribute("data-online-phase", "waiting");
  await expect(
    page.getByRole("heading", { name: "Tournament Lobby", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-mp-players] li")).toHaveCount(8);
  await expect(page.locator("[data-tournament-rail]")).toContainText("8 → 6");
  const roomId = (await root.getAttribute("data-online-room"))!;
  const captured: object[] = [];
  const shot = async (name: string) => {
    const file = `test-results/pr12-${name}-${info.project.name}.png`;
    await page.screenshot({ path: file });
    captured.push({
      name,
      ...(await page.evaluate(() => ({
        viewport: [innerWidth, innerHeight],
        devicePixelRatio,
        buffer: [
          document.querySelector("canvas")!.width,
          document.querySelector("canvas")!.height,
        ],
        arena: document.querySelector("canvas")!.dataset.arena,
        phase: document.querySelector<HTMLElement>("#app")!.dataset.onlinePhase,
      }))),
    });
    if (process.env.TOURNAMENT_EVIDENCE === "1") {
      mkdirSync("docs/evidence/tournament", { recursive: true });
      copyFileSync(
        file,
        `docs/evidence/tournament/${info.project.name}-${name}.png`,
      );
    }
  };
  await shot("lobby");
  await page.getByRole("button", { name: "Start match", exact: true }).click();
  await control({ action: "advance", roomId, phase: "racing", round: 1 });
  await expect(root).toHaveAttribute("data-online-phase", "racing");
  await expect(page.locator("[data-tournament-live]")).toContainText(
    "ROUND 1 / 3",
  );
  await expect(canvas).toHaveAttribute("data-remote-count", "7", {
    timeout: 60000,
  });
  await shot("round-1");
  const result = await control({
    action: "advance",
    roomId,
    phase: "round-results",
    round: 1,
  });
  expect(result.rooms[0].tournament!.history[0].qualifiedIds).toHaveLength(6);
  await expect(
    page.getByRole("heading", { name: "Round results", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-tournament-own]")).toContainText(
    "ELIMINATED",
  );
  await expect(page.locator("[data-mp-players] .qualified-result")).toHaveCount(
    6,
  );
  await shot("qualification");
  await control({ action: "advance", roomId, phase: "intermission", round: 1 });
  // A real socket disconnect/resume must restore the same room, frozen result and eliminated role.
  blocked = true;
  cut();
  await expect(root).toHaveAttribute("data-online-state", "reconnecting", {
    timeout: 15000,
  });
  blocked = false;
  await expect(root).toHaveAttribute("data-online-state", "intermission", {
    timeout: 20000,
  });
  await expect(root).toHaveAttribute("data-online-room", roomId);
  await expect(page.locator("[data-tournament-own]")).toContainText(
    "ELIMINATED",
  );
  await control({ action: "advance", roomId, phase: "racing", round: 2 });
  await expect(canvas).toHaveAttribute("data-arena", "orbit-chaos");
  await expect(root).toHaveAttribute("data-tournament-round", "2");
  await expect(root).toHaveAttribute("data-spectating", "true");
  await expect(canvas).toHaveAttribute("data-remote-count", "5", {
    timeout: 60000,
  });
  await expect(
    page.getByRole("navigation", { name: "Spectator controls" }),
  ).toBeVisible();
  const followed = await root.getAttribute("data-followed-player");
  await page.getByRole("button", { name: "Next racer", exact: true }).click();
  await expect(root).not.toHaveAttribute("data-followed-player", followed!);
  await expect(
    page.locator('.touch-controls [aria-label="Jump"]'),
  ).toBeDisabled();
  await shot("spectator");
  await page.getByText("Round standings", { exact: true }).click();
  await expect(page.locator("[data-live-standings] li")).toHaveCount(6);
  await shot("round-2");
  await control({ action: "advance", roomId, phase: "racing", round: 3 });
  await expect(canvas).toHaveAttribute("data-arena", "gravity-mayhem");
  await expect(root).toHaveAttribute("data-tournament-round", "3");
  await expect(canvas).toHaveAttribute("data-remote-count", "3", {
    timeout: 60000,
  });
  await shot("final");
  const final = await control({
    action: "advance",
    roomId,
    phase: "tournament-results",
    round: 3,
  });
  const t = final.rooms[0].tournament!;
  expect(t.history.map((r) => r.rows.length)).toEqual([8, 6, 4]);
  expect(t.placements).toHaveLength(8);
  expect(t.championId).toBe(t.placements[0].id);
  await expect(
    page.getByRole("heading", { name: "Tournament champion", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-tournament-champion]")).toContainText(
    t.placements[0].name,
  );
  await expect(page.locator("[data-mp-players] li")).toHaveCount(8);
  await shot("champion");
  await page.getByRole("button", { name: "Play Again", exact: true }).click();
  await expect(root).toHaveAttribute("data-tournament-edition", "2");
  await expect(root).toHaveAttribute("data-tournament-round", "1");
  await expect(canvas).toHaveAttribute("data-arena", "cosmic-sprint");
  await page
    .getByRole("button", { name: "Solo / Training", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Arena selection", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  if (process.env.TOURNAMENT_EVIDENCE === "1")
    writeFileSync(
      `docs/evidence/tournament/${info.project.name}.json`,
      JSON.stringify(
        {
          profile: info.project.name,
          method:
            "Actual PlayCanvas and real WebSocket server; accelerated authoritative clock, ordinary bot inputs; no position/result injection",
          workingTreeModified: true,
          performanceBenchmark: false,
          captured,
        },
        null,
        2,
      ) + "\n",
    );
});
test("explicit single-race format preserves standalone arena selection and results", async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const control = async (body: object) => {
    const response = await request.post("http://127.0.0.1:3013/control", {
      headers: { "x-minimorph-review": "tournament-review-v1" },
      data: body,
      timeout: 60000,
    });
    expect(response.ok(), await response.text()).toBe(true);
  };
  await control({ action: "reset" });
  await page.addInitScript(() => {
    const Original = window.WebSocket;
    window.WebSocket = class extends Original {
      constructor(url: string | URL, protocols?: string | string[]) {
        const endpoint = new URL(String(url));
        if (endpoint.hostname === "127.0.0.1" && endpoint.pathname === "/ws")
          endpoint.port = "3012";
        super(endpoint.href, protocols);
      }
    };
  });
  await page.route("https://telegram.org/**", (r) => r.abort());
  await page.goto("http://127.0.0.1:5173");
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-character",
    "minimorph-optimized-v1",
    { timeout: 60000 },
  );
  await page.getByLabel("Multiplayer format").selectOption("race");
  await page.locator("[data-online-arena]").selectOption("orbit-chaos");
  await page.getByRole("button", { name: "Create Room", exact: true }).click();
  await expect(page.locator("#app")).toHaveAttribute(
    "data-online-phase",
    "waiting",
  );
  await expect(page.locator("[data-mp-players] li")).toHaveCount(1);
  await page.getByRole("button", { name: "Start match", exact: true }).click();
  await control({ action: "advance", phase: "racing" });
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-arena",
    "orbit-chaos",
  );
  await expect(page.locator("#app")).toHaveAttribute(
    "data-tournament-round",
    "0",
  );
  await expect(page.locator("[data-tournament-rail]")).toBeHidden();
  await control({ action: "advance", phase: "finished" });
  await expect(
    page.getByRole("heading", { name: "Race results", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Solo / Training", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Arena selection", exact: true }),
  ).toBeVisible();
});

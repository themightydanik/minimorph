import { test, expect, devices } from "@playwright/test";
import type { Page } from "@playwright/test";
import type {
  RoomSnapshot,
  ServerMessage,
} from "@minimorph/multiplayer-protocol";
function observe(page: Page) {
  const state: {
    id?: string;
    snapshot?: RoomSnapshot;
    loads: number;
    welcomes: number;
  } = { loads: 0, welcomes: 0 };
  page.on("request", (r) => {
    if (r.url().endsWith(".glb") && r.url().includes("minimorph_candidate_v1"))
      state.loads++;
  });
  page.on("websocket", (ws) =>
    ws.on("framereceived", (f) => {
      if (typeof f.payload !== "string") return;
      const m = JSON.parse(f.payload) as ServerMessage;
      if (m.type === "welcome") {
        state.welcomes++;
        state.id = m.id;
        state.snapshot = m.snapshot;
      } else if (m.type === "snapshot") state.snapshot = m.snapshot;
    }),
  );
  return state;
}
async function menu(page: Page, name: string) {
  await page.route("https://telegram.org/**", (r) => r.abort());
  await page.goto("http://127.0.0.1:5173");
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-character",
    "minimorph-optimized-v1",
    { timeout: 60000 },
  );
  await page.locator("[data-online-name]").fill(name);
}
test("two actual browsers share eight authoritative participants, movement, animations, reconnect and solo return", async ({
  page,
  browser,
}, info) => {
  // Two complete mobile software-WebGL scenes can spend >3 minutes on cold
  // preparation; keep action/reconnect assertion and server deadlines unchanged.
  test.setTimeout(600000);
  const other = await browser.newContext(
      info.project.name === "mobile"
        ? devices["Pixel 7"]
        : { viewport: { width: 1280, height: 720 } },
    ),
    second = await other.newPage();
  let blocked = false,
    cut = () => {};
  let packets = 0;
  await second.routeWebSocket("**/ws", (route) => {
    if (blocked) {
      route.close();
      return;
    }
    const upstream = route.connectToServer();
    let closed = false;
    route.onMessage((m) => upstream.send(m));
    upstream.onMessage((m) => {
      if (
        typeof m === "string" &&
        JSON.parse(m).type === "snapshot" &&
        ++packets % 5 === 0
      )
        return;
      setTimeout(() => {
        if (!closed) route.send(m);
      }, 60);
    });
    route.onClose(() => {
      closed = true;
      upstream.close();
    });
    upstream.onClose(() => {
      closed = true;
      route.close();
    });
    cut = () => {
      upstream.close();
      route.close();
    };
  });
  const a = observe(page),
    b = observe(second),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  second.on("pageerror", (e) => errors.push(e.message));
  try {
    const prepare = async (client: Page) => {
      // Compile/upload the full authored scene before opening sockets: two software
      // GPUs doing cold imports must not consume the unchanged peer/reconnect limits.
      await client
        .getByRole("button", { name: "Play Cosmic Sprint", exact: true })
        .click();
      await expect(client.locator("canvas")).toHaveAttribute(
        "data-arena-assets",
        "ready",
        { timeout: 120000 },
      );
      await client
        .getByRole("button", { name: "Course overview", exact: true })
        .click();
      await expect(client.locator("canvas")).toHaveAttribute(
        "data-arena-asset-count",
        "14/14",
        { timeout: 120000 },
      );
      await client
        .getByRole("button", { name: "Back to character", exact: true })
        .click();
      await client
        .getByRole("button", { name: "Choose arena", exact: true })
        .click();
    };
    await menu(page, "Alice");
    await prepare(page);
    await menu(second, "Bob");
    await prepare(second);
    await page
      .getByRole("button", { name: "Create Room", exact: true })
      .click();
    await expect(page.locator("[data-online-phase]")).toHaveAttribute(
      "data-online-phase",
      "waiting",
    );
    const code = a.snapshot!.code!;
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    await second
      .getByRole("button", { name: "Private Room", exact: true })
      .click();
    await second.locator("[data-room-code]").fill(code);
    await second
      .getByRole("button", { name: "Join by Code", exact: true })
      .click();
    await expect
      .poll(() => b.snapshot?.roomId, { timeout: 20000 })
      .toBe(a.snapshot!.roomId);
    await expect(page.locator("[data-mp-players]")).toContainText("Bob");
    // GLB import and the first eight-character frames are preparation, not race time.
    // Wait before Start so software-rendering uploads cannot consume the interaction window.
    await Promise.all(
      [page, second].map((client) =>
        expect(client.locator("canvas")).toHaveAttribute(
          "data-arena-assets",
          "ready",
          { timeout: 90000 },
        ),
      ),
    );
    await expect
      .poll(
        () =>
          page.locator(`.participant-labels [data-player="${b.id}"]`).count(),
        { timeout: 20000 },
      )
      .toBe(1);
    await expect
      .poll(
        () =>
          second.locator(`.participant-labels [data-player="${a.id}"]`).count(),
        { timeout: 20000 },
      )
      .toBe(1);
    await page
      .getByRole("button", { name: "Start match", exact: true })
      .click();
    await expect
      .poll(() => a.snapshot?.phase, { timeout: 20000 })
      .toBe("racing");
    await expect.poll(() => b.snapshot?.phase).toBe("racing");
    expect(a.snapshot!.startAt).toBe(b.snapshot!.startAt);
    expect(a.snapshot!.participants).toHaveLength(8);
    expect(a.snapshot!.participants.filter((p) => p.bot)).toHaveLength(6);
    await expect(page.locator("canvas")).toHaveAttribute(
      "data-remote-count",
      "7",
      { timeout: 60000 },
    );
    await expect(second.locator("canvas")).toHaveAttribute(
      "data-remote-count",
      "7",
      { timeout: 60000 },
    );
    const initial = a.snapshot!.participants.find((p) => p.id === a.id)!.state
      .z;
    await page.locator("canvas").focus();
    let release: () => Promise<void>;
    if (info.project.name === "mobile") {
      const cdp = await page.context().newCDPSession(page),
        direction = (await page
          .getByRole("group", { name: "Movement joystick" })
          .boundingBox())!,
        jump = (await page
          .getByRole("button", { name: "Jump", exact: true })
          .boundingBox())!;
      const finger = {
        x: direction.x + direction.width / 2,
        y: direction.y + direction.height * 0.18,
        id: 1,
      };
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [finger],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          finger,
          { x: jump.x + jump.width / 2, y: jump.y + jump.height / 2, id: 2 },
        ],
      });
      release = async () => {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await cdp.detach();
      };
    } else {
      await page.keyboard.down("KeyW");
      await page.keyboard.press("Space");
      release = () => page.keyboard.up("KeyW");
    }
    await expect
      .poll(
        () => b.snapshot?.participants.find((p) => p.id === a.id)?.state.z,
        { timeout: 20000 },
      )
      .toBeLessThan(initial - 0.6);
    await release();
    await expect
      .poll(
        () =>
          page.locator(`.participant-labels [data-player="${b.id}"]`).count(),
        { timeout: 20000 },
      )
      .toBe(1);
    // Software rendering may still be uploading seven remote character instances.
    await expect
      .poll(
        () =>
          second
            .locator(`.participant-labels [data-player="${a.id}"]`)
            .getAttribute("data-z"),
        { timeout: 20000 },
      )
      .not.toBe(String(initial));
    // Optional diagnostic readback must not block the network/reconnect assertions
    // on two concurrent software WebGL contexts. Dedicated arena tests capture visuals.
    if (process.env.MULTIPLAYER_EVIDENCE === "1") {
      await page.screenshot({
        path: `test-results/pr7-two-clients-${info.project.name}.png`,
      });
      await second.screenshot({
        path: `test-results/pr7-other-client-${info.project.name}.png`,
      });
    }
    const oldId = b.id,
      welcomes = b.welcomes;
    blocked = true;
    cut();
    await expect(second.locator("[data-online-state]")).toHaveAttribute(
      "data-online-state",
      "reconnecting",
      { timeout: 10000 },
    );
    blocked = false;
    await expect
      .poll(() => b.welcomes, { timeout: 20000 })
      .toBeGreaterThan(welcomes);
    await expect.poll(() => b.id, { timeout: 20000 }).toBe(oldId);
    await expect(second.locator("[data-online-state]")).toHaveAttribute(
      "data-online-state",
      "racing",
      { timeout: 20000 },
    );
    expect(b.snapshot!.participants).toHaveLength(8);
    expect(a.loads).toBe(1);
    expect(b.loads).toBe(1);
    expect(errors).toEqual([]);
    await page
      .getByRole("button", { name: "Leave match", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Arena selection", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Training tracks", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Play Cosmic Sprint", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Start race", exact: true }),
    ).toBeVisible();
  } finally {
    await other.close();
  }
});
test("invalid private code shows a retry and a usable solo exit", async ({
  page,
}) => {
  await menu(page, "Cadet");
  await page.getByRole("button", { name: "Private Room", exact: true }).click();
  await page.locator("[data-room-code]").fill("ZZZZZZ");
  await page.getByRole("button", { name: "Join by Code", exact: true }).click();
  await expect(page.locator("[data-mp-status]")).toContainText(
    "invalid or expired",
  );
  await expect(
    page.getByRole("button", { name: "Retry connection", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Solo / Training", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Arena selection", exact: true }),
  ).toBeVisible();
});
test("Quick Match fills seven bot slots and starts on the common server deadline", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const state = observe(page);
  await menu(page, "Quick Cadet");
  await page.getByRole("button", { name: "Quick Match", exact: true }).click();
  await expect
    .poll(() => state.snapshot?.phase, { timeout: 15000 })
    .toBe("waiting");
  const waitUntil = state.snapshot!.waitUntil;
  await expect
    .poll(() => state.snapshot?.phase, { timeout: 35000 })
    .toBe("racing");
  expect(state.snapshot!.participants).toHaveLength(8);
  expect(state.snapshot!.participants.filter((p) => p.bot)).toHaveLength(7);
  expect(state.snapshot!.startAt! - waitUntil).toBeGreaterThanOrEqual(3000);
  expect(state.snapshot!.startAt! - waitUntil).toBeLessThan(3100);
  await page.screenshot({
    path: `test-results/pr7-quick-match-${info.project.name}.png`,
  });
});

/** Real-clock render sample of the integrated game, using the existing local review server. */
import { chromium, devices, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  for (const profile of ["desktop", "mobile"]) {
    const context = await browser.newContext(
      profile === "mobile"
        ? devices["Pixel 7"]
        : { viewport: { width: 1280, height: 720 } },
    );
    const page = await context.newPage();
    const control = async (data) => {
      const r = await context.request.post("http://127.0.0.1:3013/control", {
        headers: { "x-minimorph-review": "tournament-review-v1" },
        data,
      });
      if (!r.ok()) throw Error(await r.text());
    };
    await control({ action: "reset" });
    await page.addInitScript(() => {
      const Original = window.WebSocket;
      window.WebSocket = class extends Original {
        constructor(url, protocols) {
          const endpoint = new URL(String(url));
          if (endpoint.pathname === "/ws") {
            endpoint.hostname = "127.0.0.1";
            endpoint.port = "3012";
            endpoint.protocol = "ws:";
          }
          super(endpoint.href, protocols);
        }
      };
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
      .getByRole("button", { name: "Create Room", exact: true })
      .click();
    await expect(canvas).toHaveAttribute("data-remote-count", "7", {
      timeout: 90000,
    });
    await expect(canvas).toHaveAttribute("data-arena-assets", "ready", {
      timeout: 180000,
    });
    await expect
      .poll(
        async () => {
          const [a, b] = (await canvas.getAttribute("data-arena-asset-count"))
            .split("/")
            .map(Number);
          return a === b;
        },
        { timeout: 180000 },
      )
      .toBe(true);
    await page
      .getByRole("button", { name: "Start match", exact: true })
      .click();
    await control({ action: "advance", phase: "racing", round: 1 });
    await expect(page.locator("#app")).toHaveAttribute(
      "data-online-phase",
      "racing",
    );
    await page.waitForTimeout(2000);
    const result = await page.evaluate(async () => {
      const deltas = [];
      let last = await new Promise(requestAnimationFrame);
      for (let i = 0; i < 60; i++) {
        const now = await new Promise(requestAnimationFrame);
        deltas.push(now - last);
        last = now;
      }
      deltas.sort((a, b) => a - b);
      const c = document.querySelector("canvas"),
        gl = c.getContext("webgl2"),
        ext = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        viewport: [innerWidth, innerHeight],
        devicePixelRatio,
        buffer: [c.width, c.height],
        renderer: ext
          ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
        assetTransfers: performance
          .getEntriesByType("resource")
          .filter((entry) => /\.(glb|wasm)(?:$|\?)/.test(entry.name))
          .map((entry) => ({
            file: new URL(entry.name).pathname.split("/").at(-1),
            encodedBytes: entry.encodedBodySize,
            transferBytes: entry.transferSize,
            durationMs: entry.duration,
          })),
        samples: deltas.length,
        medianFrameMs: deltas[30],
        p95FrameMs: deltas[57],
        medianCadenceFps: 1000 / deltas[30],
        data: { ...c.dataset },
      };
    });
    writeFileSync(
      `docs/evidence/cosmic-sprint/performance-${profile}.json`,
      JSON.stringify(
        {
          profile,
          physicalDevice: false,
          method:
            "Native requestAnimationFrame clock, 60 frames after loading and warmup; actual integrated multiplayer race scene with 8 animated approved characters and real WebSocket snapshots. Ordinary owner Start and bounded review-clock advance reach racing; the existing local review server then holds physics between commands. Software Chromium rendering; not a Redmi Note 8 FPS claim.",
          ...result,
        },
        null,
        2,
      ) + "\n",
    );
    await page.screenshot({
      path: `docs/evidence/cosmic-sprint/${profile}-eight-players.png`,
    });
    console.log(profile, JSON.stringify(result));
    await context.close();
  }
} finally {
  await browser.close();
}

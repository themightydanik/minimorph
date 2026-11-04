import { chromium } from "@playwright/test";
import fs from "node:fs";
const output = "docs/evidence/character-optimization";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const times = {
  Idle: 0.5,
  Run: 0.15,
  Jump: 0.2,
  Fall: 0,
  Land: 0.2,
  Victory: 0.5,
};
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (e) => {
    throw e;
  });
  const captures = [];
  for (const [clip, time] of Object.entries(times)) {
    const cases = [
      {
        compare: "1",
        view: "front",
        name: `compare-${clip.toLowerCase()}-gameplay`,
      },
      ...(clip === "Run" || clip === "Victory"
        ? [
            {
              compare: "1",
              view: "back",
              name: `compare-${clip.toLowerCase()}-back`,
            },
          ]
        : []),
      ...(["Idle", "Run", "Victory"].includes(clip)
        ? [
            {
              compare: "1",
              view: "front",
              distance: "close",
              name: `compare-${clip.toLowerCase()}-close`,
            },
          ]
        : []),
      {
        variant: "original",
        count: "1",
        view: "front",
        name: `original-${clip.toLowerCase()}-matched`,
      },
      {
        variant: "candidate",
        count: "1",
        view: "front",
        name: `candidate-${clip.toLowerCase()}-matched`,
      },
    ];
    for (const c of cases) {
      const { name, ...params } = c;
      await page.goto(
        `http://127.0.0.1:5175/optimization-study.html?${new URLSearchParams({ ...params, clip, time: String(time) })}`,
      );
      await page.waitForFunction(() => window.studyReady, undefined, { timeout: 60000 });
      const info = await page.evaluate(() => window.studyInfo());
      if (info.bufferWidth !== 1280 || info.bufferHeight !== 720)
        throw Error("Unexpected drawing buffer");
      if (info.animationTimes.some((t) => Math.abs(t - time) > 0.001))
        throw Error("Animation pose mismatch");
      await page.screenshot({ path: `${output}/${name}.png` });
      captures.push({ name, clip, time, ...info });
      console.log(name);
    }
  }
  fs.writeFileSync(
    `${output}/captures.json`,
    JSON.stringify(captures, null, 2) + "\n",
  );
} finally {
  await browser.close();
}

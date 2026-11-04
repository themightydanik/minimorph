/** Isolated review harness. The production config and renderer quality are never changed. */
import * as pc from "playcanvas";
import {
  createGame,
  gltfCharacterSource,
  createPlayer,
} from "@minimorph/game-engine";
import type { CharacterSource, CharacterVisual } from "@minimorph/game-engine";
import { getArena } from "@minimorph/game-content";
import { CHARACTER_CLIPS } from "../../packages/game-engine/src/character";
const q = new URLSearchParams(location.search),
  compare = q.get("compare") === "1",
  variant = q.get("variant") === "candidate" ? "candidate" : "original";
const count = compare ? 2 : Number(q.get("count") ?? 8);
if (![1, 2, 4, 8].includes(count)) throw Error("Count must be 1/2/4/8");
const clip = q.get("clip") ?? "Run",
  paused = q.has("time"),
  time = Number(q.get("time") ?? 0),
  front = q.get("view") === "front";
if (!CHARACTER_CLIPS.includes(clip as (typeof CHARACTER_CLIPS)[number]))
  throw Error("Unknown clip");
const urls = {
  original: "/animation/minimorph_animated_v1.glb",
  candidate: "/optimization/minimorph_candidate_v1.glb",
};
const canvas = document.querySelector("canvas")!,
  status = document.querySelector<HTMLElement>("#status")!;
const visuals: CharacterVisual[] = [],
  anchors: pc.Entity[] = [];
let application: pc.Application;
const source: CharacterSource = {
  async load(app, signal) {
    application = app;
    const root = new pc.Entity("Isolated candidate review crowd");
    for (let i = 0; i < count; i++) {
      const selected = compare ? (i === 0 ? "original" : "candidate") : variant;
      const visual = await gltfCharacterSource(urls[selected]).load(
        app,
        signal,
      );
      visuals.push(visual);
      const anchor = new pc.Entity(`Study ${selected} ${i}`);
      root.addChild(anchor);
      anchor.addChild(visual.root);
      anchors.push(anchor);
      const x = compare
        ? i === 0
          ? -1.2
          : 1.2
        : count === 1
          ? 0
          : count === 2
            ? (i - 0.5) * 1.4
            : ((i % 4) - 1.5) * 1.4;
      anchor.setLocalPosition(x, 0, count === 8 && i >= 4 ? -2 : 0);
      visual.root.setLocalEulerAngles(0, front ? 180 : 0, 0);
      const asset = app.assets
        .list()
        .find(
          (a) =>
            a.type === "container" &&
            (a.file as { url?: string } | undefined)?.url === urls[selected],
        );
      const resource = asset?.resource as pc.ContainerResource;
      const tracks = new Map(
        resource.animations.map((a) => {
          const track = a.resource as pc.AnimTrack;
          return [track.name || a.name, track];
        }),
      );
      visual.root.addComponent("anim", { activate: true });
      for (const name of CHARACTER_CLIPS)
        visual.root.anim!.assignAnimation(
          name,
          tracks.get(name)!,
          undefined,
          1,
          true,
        );
      visual.root.anim!.baseLayer!.transition(clip, 0, 0);
      if (paused) {
        visual.root.anim!.baseLayer!.activeStateCurrentTime = time;
        visual.root.anim!.speed = 0;
      }
    }
    canvas.dataset.loaded = "true";
    canvas.dataset.count = String(count);
    canvas.dataset.variant = compare ? "comparison" : variant;
    canvas.dataset.clip = clip;
    status.textContent =
      "UNAPPROVED STUDY · full unchanged Cosmic Sprint scene · identical viewport and drawing buffer across variants · original renderer/DPR cap · " +
      (paused ? `${clip} at ${time.toFixed(2)}s` : `${clip} playing`);
    return {
      root,
      update() {},
      destroy() {
        visuals.forEach((v) => v.destroy());
        root.destroy();
      },
    };
  },
};
const game = createGame(
  canvas,
  () => ({ x: 0, z: 0, jump: false }),
  () => {},
  { character: source, raceFlow: false },
);
const state = createPlayer(getArena("cosmic-sprint"));
// Render probe only: identical fixed arena phase, no networking or gameplay score claims.
game.setOnline({
  frame: () => ({
    local: state,
    remotes: [],
    elapsed: 1.2,
    phase: "racing",
    yaw: 0,
  }),
});
document.querySelector("#left")!.textContent = compare
  ? "ORIGINAL · 160,000 triangles"
  : `${variant.toUpperCase()} · ${count} visible character(s)`;
document.querySelector("#right")!.textContent = compare
  ? "CANDIDATE · 125,928 triangles · NOT APPROVED"
  : "Render-only study · no production asset replacement";
const wait = setInterval(() => {
  if (!application || visuals.length !== count) return;
  clearInterval(wait);
  application.on("prerender", () => {
    const c = application.root.findByName("Follow camera") as pc.Entity;
    if (q.get("distance") === "close") {
      c.setPosition(0, 1.1, 5.4);
      c.lookAt(0, 1, 2);
    } else {
      const portrait = canvas.clientWidth / canvas.clientHeight < 1;
      c.setPosition(0, portrait ? 8 : 5.7, portrait ? 12.5 : 9.5);
      c.lookAt(0, 1, 1);
      c.camera!.fov = portrait ? 64 : 58;
    }
  });
  const measure = window as Window & {
    studyReady?: boolean;
    studyInfo?: () => unknown;
  };
  measure.studyInfo = () => ({
    count,
    variant: compare ? "comparison" : variant,
    clip,
    paused,
    bufferWidth: canvas.width,
    bufferHeight: canvas.height,
    pixelRatio: application.graphicsDevice.maxPixelRatio,
    drawCalls: application.stats.drawCalls.total,
    activeMeshInstances: visuals.reduce(
      (sum, v) =>
        sum +
        (v.root.findComponents("render") as pc.RenderComponent[]).reduce(
          (n, r) => n + r.meshInstances.length,
          0,
        ),
      0,
    ),
    trianglesPerCharacter: compare
      ? null
      : variant === "candidate"
        ? 125928
        : 160000,
    triangleCounts: compare
      ? [160000, 125928]
      : Array(count).fill(variant === "candidate" ? 125928 : 160000),
    animationTimes: visuals.map(
      (v) => v.root.anim?.baseLayer?.activeStateCurrentTime,
    ),
    positions: anchors.map((a) => {
      const p = a.getPosition();
      const c = application.root.findByName("Follow camera") as pc.Entity;
      const at = c.camera!.worldToScreen(new pc.Vec3(p.x, p.y + 1, p.z));
      return { x: at.x, y: at.y, z: at.z };
    }),
  });
  setTimeout(() => {
    measure.studyReady = true;
  }, 1000);
}, 50);
window.addEventListener(
  "pagehide",
  () => {
    clearInterval(wait);
    game.destroy();
  },
  { once: true },
);

if (q.has("controls")) {
  const controls = document.querySelector<HTMLElement>("#controls")!;
  controls.hidden = false;
  controls
    .querySelectorAll<HTMLButtonElement>("[data-variant],[data-count]")
    .forEach(
      (button) =>
        (button.onclick = () => {
          const next = new URL(location.href);
          if (button.dataset.variant)
            next.searchParams.set("variant", button.dataset.variant);
          if (button.dataset.count)
            next.searchParams.set("count", button.dataset.count);
          next.searchParams.delete("compare");
          location.href = next.href;
        }),
    );
  document.querySelector<HTMLButtonElement>("#measure")!.onclick = async () => {
    const output = document.querySelector<HTMLElement>("#manual-output")!;
    output.textContent =
      "Measuring at the current unchanged device resolution…";
    const samples: number[] = [];
    let previous = performance.now();
    const start = previous;
    await new Promise<void>((resolve) => {
      function frame(now: number) {
        samples.push(now - previous);
        previous = now;
        if (now - start < 20000) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
    const duration = previous - start;
    samples.sort((a, b) => a - b);
    output.textContent = JSON.stringify(
      {
        method:
          "Render-only probe; confirm full multiplayer performance separately",
        variant,
        count,
        frames: samples.length,
        durationMs: duration,
        fps: samples.length / (duration / 1000),
        medianMs: samples[Math.floor(samples.length * 0.5)],
        p95Ms: samples[Math.ceil(samples.length * 0.95) - 1],
        viewport: [innerWidth, innerHeight],
        buffer: [canvas.width, canvas.height],
        devicePixelRatio,
        rendererDprCap: application.graphicsDevice.maxPixelRatio,
      },
      null,
      2,
    );
  };
}

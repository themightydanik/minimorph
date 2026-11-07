import { it, expect } from "vitest";
import { cosmicSprint } from "../../game-content/src/cosmic-sprint";
import type { ArenaConfig } from "@minimorph/game-content";
import { createPlayer, stepArenaPlayer, FIXED_STEP } from "./physics";
it("uses deterministic bounded hazard strength and one impulse per continuous contact", () => {
  const arena = (impactStrength?: number): ArenaConfig => ({
    ...structuredClone(cosmicSprint),
    spawn: { x: 0, y: 0, z: 0 },
    finish: { x: 100, y: 0, z: 100, radius: 1 },
    checkpoints: [],
    navigation: undefined,
    platforms: [{ x: 0, y: 0, z: 0, width: 3, depth: 4 }],
    obstacles: [],
    mechanisms: [
      {
        id: "impact",
        kind: "pusher",
        x: 0,
        y: 0,
        z: 0,
        width: 1,
        depth: 1,
        height: 2,
        side: 1,
        reach: 0,
        period: 2,
        phase: 0.2,
        activeFor: 1.9,
        warning: 0,
        ...(impactStrength === undefined ? {} : { impactStrength }),
      },
    ],
  });
  const input = { x: 0, z: 0, jump: false, dive: false };
  const weakArena = arena(2),
    strongArena = arena(24),
    a = createPlayer(weakArena),
    b = createPlayer(strongArena),
    same = createPlayer(strongArena),
    legacy = createPlayer(arena());
  stepArenaPlayer(a, input, FIXED_STEP, weakArena);
  stepArenaPlayer(b, input, FIXED_STEP, strongArena);
  stepArenaPlayer(same, input, FIXED_STEP, strongArena);
  stepArenaPlayer(legacy, input, FIXED_STEP, arena());
  expect(Math.abs(a.knockX)).toBe(2);
  expect(Math.abs(b.knockX)).toBe(24);
  expect(Math.abs(legacy.knockX)).toBe(8);
  for (let i = 0; i < 70; i++) {
    stepArenaPlayer(a, input, FIXED_STEP, weakArena);
    stepArenaPlayer(b, input, FIXED_STEP, strongArena);
    stepArenaPlayer(same, input, FIXED_STEP, strongArena);
  }
  expect(b).toEqual(same);
  expect(b.x).toBeLessThan(-1.5);
  expect(a.x).toBeGreaterThan(-1.5);
  const held = createPlayer(strongArena);
  for (let i = 0; i < 130; i++) {
    Object.assign(held, {
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      knockX: 0,
      knockZ: 0,
      grounded: true,
    });
    stepArenaPlayer(held, input, FIXED_STEP, strongArena);
  }
  expect(held.obstacleHits).toBe(1);
});

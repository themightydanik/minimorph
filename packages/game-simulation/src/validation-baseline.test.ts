import { describe, it, expect } from "vitest";
import { getArena } from "@minimorph/game-content";
import type { ArenaConfig, ArenaObstacle } from "@minimorph/game-content";
import {
  createPlayer,
  stepArenaPlayer,
  FIXED_STEP,
  idleInput,
  beginRecovery,
} from "./physics";
import type { Input, PlayerState } from "./physics";
// Same small isolated-course pattern as existing obstacles/editor-v04 fixtures.
const fixture = (mechanisms: ArenaObstacle[] = []): ArenaConfig => ({
  ...getArena("cosmic-sprint"),
  spawn: { x: 0, y: 0, z: 0 },
  finish: { x: 100, y: 0, z: 100, radius: 1 },
  checkpoints: [],
  platforms: [{ id: "floor", x: 0, y: 0, z: 0, width: 200, depth: 200 }],
  mechanisms,
  obstacles: [],
});
const ticks = (
  s: PlayerState,
  a: ArenaConfig,
  n: number,
  input: Input = idleInput,
) => {
  for (let i = 0; i < n; i++) stepArenaPlayer(s, input, FIXED_STEP, a);
};
describe("level validation gameplay baseline (real shared simulation)", () => {
  it("accelerates to the unchanged normal cap and brakes on a supported surface", () => {
    const a = fixture(),
      p = createPlayer(a);
    ticks(p, a, 1, { ...idleInput, x: 1 });
    expect(p.vx).toBeGreaterThan(0);
    expect(p.vx).toBeLessThan(6);
    ticks(p, a, 24, { ...idleInput, x: 1 });
    expect(p.vx).toBe(6);
    const x = p.x;
    ticks(p, a, 24);
    expect(p.vx).toBe(0);
    expect(p.x - x).toBeLessThan(0.5);
    expect(p.supportId).toBe("floor");
  });
  it("jumps and lands on the actual support without an automatic held-input jump", () => {
    const a = fixture(),
      p = createPlayer(a);
    ticks(p, a, 1, { ...idleInput, jump: true });
    expect(p.vy).toBeGreaterThan(8);
    expect(p.grounded).toBe(false);
    ticks(p, a, 150, { ...idleInput, jump: true });
    expect(p.grounded).toBe(true);
    expect(p.y).toBe(0);
    expect(p.supportId).toBe("floor");
  });
  it("honours short coyote and jump-buffer windows, and rejects expired coyote input", () => {
    const a = fixture(),
      p = createPlayer(a);
    a.platforms = [];
    ticks(p, a, 6);
    ticks(p, a, 1, { ...idleInput, jump: true });
    expect(p.vy).toBeGreaterThan(8);
    const late = createPlayer(a);
    ticks(late, a, 20);
    ticks(late, a, 1, { ...idleInput, jump: true });
    expect(late.vy).toBeLessThan(0);
    const floor = fixture(),
      buffer = createPlayer(floor);
    Object.assign(buffer, { grounded: false, coyote: 0, y: 0.02, vy: -1 });
    ticks(buffer, floor, 1, { ...idleInput, jump: true });
    ticks(buffer, floor, 3);
    expect(buffer.vy).toBeGreaterThan(8);
    expect(buffer.grounded).toBe(false);
  });
  it("consumes held Dive/Jump through Slide and Recovery instead of restarting the action", () => {
    const a = fixture(),
      p = createPlayer(a);
    ticks(p, a, 1, { ...idleInput, dive: true });
    expect(p.action).toBe("slide");
    ticks(p, a, 100, { ...idleInput, dive: true, jump: true });
    expect(p.action).toBe("normal");
    expect(p.grounded).toBe(true);
    expect(p.diveCooldown).toBeGreaterThan(0);
    ticks(p, a, 100, { ...idleInput, dive: true, jump: true });
    expect(p.action).toBe("normal");
    expect(p.grounded).toBe(true);
  });
  it("carries a grounded passenger on an actual moving platform", () => {
    const a = fixture([
      {
        id: "lift",
        kind: "moving-platform",
        x: 0,
        y: 0,
        z: 0,
        width: 4,
        depth: 4,
        axis: "x",
        amplitude: 2,
        period: 4,
      },
    ]);
    a.platforms = [];
    const p = createPlayer(a);
    ticks(p, a, 120);
    expect(p.grounded).toBe(true);
    expect(p.supportId).toBe("lift");
    expect(p.x).toBeCloseTo(2, 1);
  });
  it("lands on and launches from a floating bounce pad without an invisible floor", () => {
    const a = fixture([
      {
        id: "pad",
        kind: "jump-pad",
        x: 0,
        y: 0,
        z: 0,
        width: 4,
        depth: 4,
        boost: 10.5,
        period: 1,
      },
    ]);
    a.platforms = [];
    const p = createPlayer(a);
    Object.assign(p, { grounded: false, coyote: 0, y: 2, vy: -1 });
    for (let i = 0; i < 120 && p.lastEvent !== "pad"; i++) ticks(p, a, 1);
    expect(p.lastEvent).toBe("pad");
    expect(p.vy).toBe(10.5);
    expect(p.grounded).toBe(false);
    expect(p.falls).toBe(0);
  });
  it("refreshes a bounded turbo tail without stacking overlapping multipliers", () => {
    const boost = {
      id: "boost",
      kind: "conveyor" as const,
      surface: false,
      x: 0,
      y: 0,
      z: 0,
      width: 2,
      depth: 2,
      period: 1,
      velocityX: 0,
      velocityZ: 0,
      turboMultiplier: 1.5,
      turboDuration: 5,
    };
    const a = fixture([boost, { ...boost, id: "boost-2", turboMultiplier: 2 }]),
      p = createPlayer(a);
    ticks(p, a, 120);
    expect(p.turboMultiplier).toBe(2);
    expect(p.turboTime).toBe(5);
    p.x = 5;
    ticks(p, a, 590);
    expect(p.turboTime).toBeGreaterThan(0);
    ticks(p, a, 12);
    expect(p.turboTime).toBe(0);
    expect(p.turboMultiplier).toBe(1);
  });
  it("retains optional out-of-order checkpoints and restores the latest selected respawn", () => {
    const a = fixture();
    a.checkpoints = [
      { x: 0, y: 0, z: 0, radius: 0.5 },
      { x: 2, y: 0, z: 0, radius: 0.5 },
    ];
    const p = createPlayer(a);
    p.x = 2;
    ticks(p, a, 1);
    expect(p.checkpoint).toBe(2);
    p.x = 0;
    ticks(p, a, 1);
    expect(p.checkpoint).toBe(1);
    beginRecovery(p, "fall");
    ticks(p, a, 60);
    expect(p.respawns).toBe(1);
    expect(p.x).toBe(0);
    expect(p.y).toBe(0);
    expect(p.checkpoint).toBe(1);
    const finisher = createPlayer(a);
    Object.assign(finisher, { ...a.finish });
    ticks(finisher, a, 1);
    expect(finisher.won).toBe(true);
    expect(finisher.checkpoint).toBe(0);
  });
});

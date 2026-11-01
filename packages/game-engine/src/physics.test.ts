import { describe, it, expect } from "vitest";
import {
  platforms,
  checkpoints,
  obstacles,
  finish,
} from "@minimorph/game-content";
import {
  createPlayer,
  stepPlayer,
  FIXED_STEP,
  SPEED,
  COYOTE_TIME,
  JUMP_BUFFER_TIME,
  cameraRelativeMovement,
  obstaclePosition,
  beginRecovery,
  idleInput,
} from "./physics";
import type { Input } from "./physics";
const idle = { x: 0, z: 0, jump: false };
function simulate(
  state: ReturnType<typeof createPlayer>,
  input: Input,
  seconds: number,
) {
  for (let i = 0; i < Math.round(seconds / FIXED_STEP); i++)
    stepPlayer(state, { ...input, jump: input.jump && i === 0 }, FIXED_STEP);
}
describe("player physics", () => {
  it("rests on the spawn platform under gravity", () => {
    const s = createPlayer();
    simulate(s, idle, 2);
    expect(s.y).toBe(0);
    expect(s.grounded).toBe(true);
  });
  it("normalizes diagonal movement", () => {
    const s = createPlayer();
    simulate(s, { x: 1, z: -1, jump: false }, 0.2);
    const straight = createPlayer();
    simulate(straight, { x: 0, z: -1, jump: false }, 0.2);
    expect(Math.hypot(s.x, s.z - 2)).toBeCloseTo(2 - straight.z);
    expect(Math.hypot(s.vx, s.vz)).toBeCloseTo(SPEED);
  });
  it("jumps, rejects a midair jump, and lands", () => {
    const s = createPlayer();
    stepPlayer(s, { ...idle, jump: true }, FIXED_STEP);
    expect(s.y).toBeGreaterThan(0);
    expect(s.grounded).toBe(false);
    const vy = s.vy;
    stepPlayer(s, { ...idle, jump: true }, FIXED_STEP);
    expect(s.vy).toBeLessThan(vy);
    simulate(s, idle, 1.2);
    expect(s.y).toBe(0);
    expect(s.grounded).toBe(true);
  });
  it("falls when walking off an edge and recovers without resetting time", () => {
    const s = createPlayer();
    s.x = 20;
    simulate(s, idle, 2);
    expect(s.falls).toBe(1);
    expect(s.x).toBe(0);
    expect(s.elapsed).toBeCloseTo(2);
  });
  it("lands on raised platforms only from above", () => {
    const s = createPlayer();
    Object.assign(s, { x: 0, z: -9, y: 1, vy: -10, grounded: false });
    stepPlayer(s, idle, 0.1);
    expect(s.y).toBe(0.4);
    expect(s.grounded).toBe(true);
    s.y = 0;
    s.vy = 0;
    stepPlayer(s, idle, FIXED_STEP);
    expect(s.y).toBeLessThan(0);
    expect(s.grounded).toBe(false);
  });
  it("can traverse every gap using normal movement and jumps", () => {
    const s = createPlayer();
    // Approach each departure edge, then travel toward the next platform center.
    for (let i = 0; i < platforms.length - 1; i++) {
      const from = platforms[i],
        to = platforms[i + 1];
      const departure = i === 2 ? -16 : from.z - from.depth / 2 + 0.35;
      for (let frame = 0; s.z > departure && frame < 300; frame++)
        stepPlayer(
          s,
          { x: Math.max(-1, Math.min(1, from.x - s.x)), z: -1, jump: false },
          FIXED_STEP,
        );
      expect(s.z).toBeLessThanOrEqual(departure);
      expect(s.grounded).toBe(true);
      stepPlayer(s, { ...idle, jump: true }, FIXED_STEP);
      for (let frame = 0; frame < 180 && !s.grounded; frame++) {
        const dx = to.x - s.x,
          dz = to.z - s.z,
          length = Math.hypot(dx, dz);
        stepPlayer(
          s,
          length > 0.08
            ? { x: dx / length, z: dz / length, jump: false }
            : idle,
          FIXED_STEP,
        );
      }
      expect(
        s.falls,
        `gap ${i}, position ${s.x}, ${s.y}, ${s.z}, reason ${s.recovery}`,
      ).toBe(0);
      expect(s.grounded).toBe(true);
      expect(s.y).toBe(to.y);
    }
    for (let frame = 0; !s.won && frame < 180; frame++) {
      const dx = finish.x - s.x,
        dz = finish.z - s.z;
      const length = Math.hypot(dx, dz);
      stepPlayer(
        s,
        { x: dx / length, z: dz / length, jump: false },
        FIXED_STEP,
      );
    }
    expect(s.checkpoint).toBe(2);
    expect(s.won).toBe(true);
  });
  it("stops the timer and movement at the finish; restart is clean", () => {
    const s = createPlayer();
    Object.assign(s, { x: 0, z: -32, y: 0.9, checkpoint: 2 });
    stepPlayer(s, idle, FIXED_STEP);
    expect(s.won).toBe(true);
    const snapshot = { ...s };
    simulate(s, { ...idle, x: 1 }, 2);
    expect(s).toEqual(snapshot);
    expect(createPlayer().won).toBe(false);
  });
});

describe("responsive deterministic controller", () => {
  it("accelerates smoothly and stops without sliding indefinitely", () => {
    const s = createPlayer();
    stepPlayer(s, { ...idle, x: 1 }, FIXED_STEP);
    expect(s.vx).toBeGreaterThan(0);
    expect(s.vx).toBeLessThan(SPEED);
    simulate(s, { ...idle, x: 1 }, 0.2);
    expect(s.vx).toBeCloseTo(SPEED);
    const before = s.x;
    simulate(s, idle, 0.3);
    expect(s.vx).toBe(0);
    expect(s.x - before).toBeGreaterThan(0);
    expect(s.x - before).toBeLessThan(0.5);
  });
  it("moves relative to camera yaw and smooths rotation across angle wrap", () => {
    expect(cameraRelativeMovement(0, -1, Math.PI / 2).x).toBeCloseTo(-1);
    const s = createPlayer();
    s.heading = Math.PI - 0.01;
    stepPlayer(s, { ...idle, z: 1 }, FIXED_STEP);
    expect(Math.abs(s.heading)).toBeGreaterThan(3);
    const other = createPlayer();
    simulate(other, { ...idle, z: -1, cameraYaw: Math.PI / 2 }, 0.2);
    expect(other.x).toBeLessThan(0);
    expect(other.z).toBeCloseTo(2);
  });
  it("allows coyote jumps briefly after an edge, then expires", () => {
    const s = createPlayer();
    s.x = 4.02;
    stepPlayer(s, idle, FIXED_STEP);
    expect(s.grounded).toBe(false);
    simulate(s, idle, COYOTE_TIME / 2);
    stepPlayer(s, { ...idle, jump: true }, FIXED_STEP);
    expect(s.vy).toBeGreaterThan(8);
    const late = createPlayer();
    late.x = 4.02;
    simulate(late, idle, COYOTE_TIME + 0.05);
    stepPlayer(late, { ...idle, jump: true }, FIXED_STEP);
    expect(late.vy).toBeLessThan(0);
  });
  it("buffers a jump pressed before landing, without granting a double jump", () => {
    const s = createPlayer();
    Object.assign(s, { y: 0.12, vy: -3, grounded: false, coyote: 0 });
    stepPlayer(s, { ...idle, jump: true }, FIXED_STEP);
    for (let i = 0; i < 10; i++) stepPlayer(s, idle, FIXED_STEP);
    expect(s.vy).toBeGreaterThan(6);
    expect(s.grounded).toBe(false);
    const expired = createPlayer();
    Object.assign(expired, { y: 2, vy: 0, grounded: false, coyote: 0 });
    stepPlayer(expired, { ...idle, jump: true }, FIXED_STEP);
    simulate(expired, idle, JUMP_BUFFER_TIME + 0.03);
    expect(expired.jumpBuffer).toBe(0);
    simulate(expired, idle, 0.5);
    expect(expired.grounded).toBe(true);
  });
  it("replays identical tick inputs identically including obstacle timing", () => {
    const a = createPlayer(),
      b = createPlayer();
    for (let i = 0; i < 1000; i++) {
      const input = {
        x: Math.sin(i * 0.02),
        z: -1,
        jump: i % 109 === 0,
        cameraYaw: i * 0.001,
      };
      stepPlayer(a, input, FIXED_STEP);
      stepPlayer(b, input, FIXED_STEP);
    }
    expect(a).toEqual(b);
  });
});
describe("checkpoints and hazards", () => {
  it("activates checkpoints only on their surfaces and in order", () => {
    const s = createPlayer();
    Object.assign(s, checkpoints[1]);
    stepPlayer(s, idle, FIXED_STEP);
    expect(s.checkpoint).toBe(0);
    Object.assign(s, checkpoints[0], {
      y: checkpoints[0].y + 0.4,
      grounded: false,
      coyote: 0,
    });
    stepPlayer(s, idle, FIXED_STEP);
    expect(s.checkpoint).toBe(0);
    Object.assign(s, checkpoints[0], { grounded: true });
    stepPlayer(s, idle, FIXED_STEP);
    expect(s.checkpoint).toBe(1);
    expect(s.checkpointFlash).toBeGreaterThan(0);
    Object.assign(s, checkpoints[1]);
    stepPlayer(s, idle, FIXED_STEP);
    expect(s.checkpoint).toBe(2);
  });
  it("respawns at the latest checkpoint preserving timer and progress, clears queued input", () => {
    const s = createPlayer();
    Object.assign(s, checkpoints[0]);
    stepPlayer(s, idle, FIXED_STEP);
    s.x = 30;
    s.y = -7;
    stepPlayer(s, idle, FIXED_STEP);
    expect(s.recovery).toBe("fall");
    expect(s.falls).toBe(1);
    simulate(s, { ...idle, jump: true }, 0.45);
    expect(s.x).toBe(checkpoints[0].x);
    expect(s.z).toBe(checkpoints[0].z);
    expect(s.y).toBe(checkpoints[0].y);
    expect(s.checkpoint).toBe(1);
    expect(s.elapsed).toBeGreaterThan(0.4);
    expect(s.respawns).toBe(1);
    expect(s.protection).toBeGreaterThan(0);
    expect(s.jumpBuffer).toBe(0);
    expect(createPlayer().checkpoint).toBe(0);
    expect(createPlayer().falls).toBe(0);
  });
  it("sweeps predictably, triggers one recovery, and can be jumped over", () => {
    const obstacle = obstacles[0],
      point = obstaclePosition(obstacle, FIXED_STEP);
    expect(obstaclePosition(obstacle, 0).x).toBeCloseTo(
      obstaclePosition(obstacle, obstacle.period).x,
    );
    const hit = createPlayer();
    Object.assign(hit, { ...point, y: obstacle.y, checkpoint: 1 });
    stepPlayer(hit, idle, FIXED_STEP);
    expect(hit.recovery).toBe("obstacle");
    expect(hit.obstacleHits).toBe(1);
    beginRecovery(hit, "obstacle");
    expect(hit.falls).toBe(1);
    const above = createPlayer();
    Object.assign(above, point, {
      y: obstacle.y + obstacle.height + 0.2,
      vy: 3,
      grounded: false,
      coyote: 0,
    });
    stepPlayer(above, idleInput, FIXED_STEP);
    expect(above.recovery).toBeNull();
  });
  it("grants a brief recovery grace period, then restores hazard collision", () => {
    const s = createPlayer();
    const point = obstaclePosition(obstacles[0], FIXED_STEP);
    Object.assign(s, point, { protection: 0.2 });
    stepPlayer(s, idle, FIXED_STEP);
    expect(s.recovery).toBeNull();
    s.protection = 0;
    stepPlayer(s, idle, FIXED_STEP);
    expect(s.recovery).toBe("obstacle");
  });
});

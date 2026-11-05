import { describe, it, expect } from 'vitest';
import { createPlayer, stepPlayer, FIXED_STEP, SPEED, DIVE_SPEED, beginRecovery } from './physics';
import type { Input, PlayerState } from './physics';
const idle: Input = { x: 0, z: 0, jump: false };
const forward: Input = { ...idle, z: -1 };
const floor = [{ x: 0, y: 0, z: 0, width: 1000, depth: 1000 }];
const tick = (s: PlayerState, input = idle) => stepPlayer(s, input, FIXED_STEP, floor, [], undefined, false);
const run = (s: PlayerState, input: Input, time: number) => { for (let i = 0; i < Math.ceil(time / FIXED_STEP); i++) tick(s, input); };
describe('shared arcade action controller', () => {
  it('preserves analog intensity and normalizes diagonal movement', () => {
    const slow = createPlayer(), diagonal = createPlayer();
    run(slow, { ...idle, x: .25 }, .5); run(diagonal, { ...idle, x: 1, z: 1 }, .5);
    expect(slow.vx).toBeCloseTo(SPEED * .25);
    expect(Math.hypot(diagonal.vx, diagonal.vz)).toBeCloseTo(SPEED);
    tick(slow, idle); expect(slow.vx).toBeLessThan(1.5);
  });
  it('runs, jumps, dives forward without an upward impulse, slides, recovers and runs', () => {
    const s = createPlayer(); run(s, forward, .3);
    tick(s, { ...forward, jump: true }); run(s, forward, .2);
    const height = s.y, vy = s.vy;
    tick(s, { ...forward, dive: true });
    expect(s.action).toBe('dive'); expect(s.vy).toBeLessThan(vy); expect(s.vy).toBeLessThan(0);
    expect(s.y).toBeLessThan(height); expect(-s.vz).toBeGreaterThan(SPEED);
    expect(Math.hypot(s.vx, s.vz)).toBeLessThanOrEqual(DIVE_SPEED);
    for (let i = 0; i < 120 && s.action === 'dive'; i++) tick(s, forward);
    expect(s.action).toBe('slide'); expect(s.grounded).toBe(true);
    const slideSpeed = Math.hypot(s.vx, s.vz);
    run(s, { ...forward, jump: true, dive: true }, .2);
    expect(s.action).toBe('slide'); expect(s.vy).toBe(0);
    expect(Math.hypot(s.vx, s.vz)).toBeLessThan(slideSpeed);
    for (let i = 0; i < 100 && s.action === 'slide'; i++) tick(s, forward);
    expect(s.action).toBe('recover');
    run(s, forward, .6); expect(s.action).toBe('normal'); expect(-s.vz).toBeCloseTo(SPEED);
  });
  it('prevents held jump auto-repeat, midair double jumps and repeated dive speed stacking', () => {
    const s = createPlayer(); tick(s, { ...forward, jump: true });
    run(s, { ...forward, jump: true }, 1.5);
    expect(s.grounded).toBe(true); expect(s.vy).toBe(0);
    tick(s, forward); tick(s, { ...forward, jump: true });
    tick(s, { ...forward, dive: true });
    for (let i = 0; i < 15; i++) {
      tick(s, { ...forward, jump: true, dive: i % 2 === 0 });
      expect(s.vy).toBeLessThanOrEqual(0);
      expect(Math.hypot(s.vx, s.vz)).toBeLessThanOrEqual(DIVE_SPEED);
    }
    expect(s.diveCooldown).toBeGreaterThan(0);
  });
  it('supports airborne steering and keeps dive cooldown across checkpoint recovery', () => {
    const s = createPlayer(); tick(s, { ...forward, jump: true });
    run(s, { ...idle, x: 1 }, .15); expect(s.vx).toBeGreaterThan(0);
    tick(s, { ...idle, dive: true });
    beginRecovery(s, 'fall'); run(s, { ...idle, dive: true }, .5);
    expect(s.recovery).toBeNull(); expect(s.action).toBe('normal');
    expect(s.diveCooldown).toBeGreaterThan(0); expect(s.diveUsed).toBe(false);
  });
});

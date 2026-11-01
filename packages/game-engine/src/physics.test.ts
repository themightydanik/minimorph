import { describe, it, expect } from 'vitest';
import { platforms } from '@minimorph/game-content';
import { createPlayer, stepPlayer, FIXED_STEP, SPEED } from './physics';
const idle = { x: 0, z: 0, jump: false };
function simulate(state: ReturnType<typeof createPlayer>, input: typeof idle, seconds: number) {
  for (let i = 0; i < Math.round(seconds / FIXED_STEP); i++) stepPlayer(state, { ...input, jump: input.jump && i === 0 }, FIXED_STEP);
}
describe('player physics', () => {
  it('rests on the spawn platform under gravity', () => { const s = createPlayer(); simulate(s, idle, 2); expect(s.y).toBe(0); expect(s.grounded).toBe(true); });
  it('normalizes diagonal movement', () => { const s = createPlayer(); simulate(s, { x: 1, z: -1, jump: false }, 0.2); expect(Math.hypot(s.x, s.z - 2)).toBeCloseTo(SPEED * 0.2); });
  it('jumps, rejects a midair jump, and lands', () => {
    const s = createPlayer(); stepPlayer(s, { ...idle, jump: true }, FIXED_STEP); expect(s.y).toBeGreaterThan(0); expect(s.grounded).toBe(false);
    const vy = s.vy; stepPlayer(s, { ...idle, jump: true }, FIXED_STEP); expect(s.vy).toBeLessThan(vy);
    simulate(s, idle, 1.2); expect(s.y).toBe(0); expect(s.grounded).toBe(true);
  });
  it('falls when walking off an edge and recovers without resetting time', () => {
    const s = createPlayer(); s.x = 20; simulate(s, idle, 2); expect(s.falls).toBe(1); expect(s.x).toBe(0); expect(s.elapsed).toBeCloseTo(2);
  });
  it('lands on raised platforms only from above', () => {
    const s = createPlayer(); Object.assign(s, { x: 0, z: -9, y: 1, vy: -10, grounded: false });
    stepPlayer(s, idle, 0.1); expect(s.y).toBe(0.4); expect(s.grounded).toBe(true);
    s.y = 0; s.vy = 0; stepPlayer(s, idle, FIXED_STEP); expect(s.y).toBeLessThan(0); expect(s.grounded).toBe(false);
  });
  it('can traverse every gap using normal movement and jumps', () => {
    const s = createPlayer();
    // Approach each departure edge, then travel toward the next platform center.
    for (let i = 0; i < platforms.length - 1; i++) {
      const from = platforms[i], to = platforms[i + 1];
      const departure = from.z - from.depth / 2 + 0.35;
      while (s.z > departure) stepPlayer(s, { ...idle, z: -1 }, FIXED_STEP);
      expect(s.grounded).toBe(true);
      stepPlayer(s, { ...idle, jump: true }, FIXED_STEP);
      for (let frame = 0; frame < 180 && !s.grounded; frame++) {
        const dx = to.x - s.x, dz = to.z - s.z, length = Math.hypot(dx, dz);
        stepPlayer(s, length > 0.08 ? { x: dx / length, z: dz / length, jump: false } : idle, FIXED_STEP);
      }
      expect(s.falls).toBe(0); expect(s.grounded).toBe(true); expect(s.y).toBe(to.y);
    }
    simulate(s, { ...idle, z: -1 }, 0.2); expect(s.won).toBe(true);
  });
  it('stops the timer and movement at the finish; restart is clean', () => {
    const s = createPlayer(); Object.assign(s, { x: 0, z: -32, y: 0.9 }); stepPlayer(s, idle, FIXED_STEP); expect(s.won).toBe(true);
    const snapshot = { ...s }; simulate(s, { ...idle, x: 1 }, 2); expect(s).toEqual(snapshot); expect(createPlayer().won).toBe(false);
  });
});

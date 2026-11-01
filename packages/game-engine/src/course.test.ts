import { it, expect } from 'vitest';
import { courseRun } from '../../../tests/helpers/course-run';
import { createPlayer, stepPlayer, FIXED_STEP } from './physics';
function replay(mask?: number) {
  const player = createPlayer();
  for (const [phase, segment] of courseRun.entries()) {
    const jitter = mask === undefined ? 0 : (mask >> phase & 1 ? 2 : -2);
    for (let i = 0; i < Math.round(segment.seconds / FIXED_STEP) + jitter; i++) {
      stepPlayer(player, {
        x: Number(segment.keys.includes('KeyD')) - Number(segment.keys.includes('KeyA')),
        z: -Number(segment.keys.includes('KeyW')),
        jump: segment.jump && i === 0,
      }, FIXED_STEP);
    }
    expect(player.falls, `phase ${phase}, jitter mask ${mask}`).toBe(0);
  }
  expect(player.checkpoint).toBe(2); expect(player.won).toBe(true);
}
it('completes the whole course with digital inputs and the sweeper enabled', () => replay());
it('keeps the course replay valid across all 128 combinations of frame-boundary offsets', () => {
  // Input edges are sampled at render boundaries. Cover +/- two physics ticks
  // at every segment, together, without moving the course or disabling hazards.
  for (let mask = 0; mask < 128; mask++) replay(mask);
});

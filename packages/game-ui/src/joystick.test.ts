import { expect, it } from 'vitest';
import { analogVector } from './joystick';
it('analog stick has radial dead zone, continuous strength, arbitrary angles and capped diagonals', () => {
  expect(analogVector(4, 4, 50)).toEqual({ x: 0, z: 0 });
  const half = analogVector(25, 0, 50);
  expect(half.x).toBeCloseTo((.5 - .14) / .86); expect(half.z).toBe(0);
  const diagonal = analogVector(100, -100, 50);
  expect(diagonal.x).toBeCloseTo(Math.SQRT1_2); expect(diagonal.z).toBeCloseTo(-Math.SQRT1_2);
  const angle = analogVector(9, -23, 50);
  expect(angle.x / angle.z).toBeCloseTo(-9 / 23);
});

export interface Platform { x: number; y: number; z: number; width: number; depth: number }
// Coordinates describe top surfaces. The route is intentionally short and jumpable.
export const platforms: readonly Platform[] = [
  { x: 0, y: 0, z: 0, width: 8, depth: 10 },
  { x: 0, y: 0.4, z: -9, width: 5, depth: 5 },
  { x: 2.5, y: 0.8, z: -16, width: 5, depth: 5 },
  { x: -1, y: 0.5, z: -23, width: 5, depth: 5 },
  { x: 0, y: 0.9, z: -31, width: 8, depth: 8 },
];
export const spawn = { x: 0, y: 0, z: 2 };
export const finish = { x: 0, y: 0.9, z: -32, radius: 1.8 };

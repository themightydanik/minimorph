export interface Platform {
  id?: string;
  radius?: number;
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
}
export const platforms: readonly Platform[] = [
  { x: 0, y: 0, z: 0, width: 8, depth: 10 },
  { x: 0, y: 0.4, z: -9, width: 5, depth: 5 },
  { x: 2.5, y: 0.8, z: -16, width: 5, depth: 5 },
  { x: -1, y: 0.5, z: -23, width: 5, depth: 5 },
  { x: 0, y: 0.9, z: -31, width: 8, depth: 8 },
];
export const spawn = { x: 0, y: 0, z: 2 };
export const finish = { x: 0, y: 0.9, z: -32, radius: 1.8 };
export const checkpoints = [
  { x: 0, y: 0.4, z: -8.5, radius: 2.2 },
  { x: -1, y: 0.5, z: -22.5, radius: 2.2 },
] as const;
export interface MovingObstacle {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  amplitude: number;
  period: number;
  phase: number;
}
export const obstacles: readonly MovingObstacle[] = [
  {
    x: 2.5,
    y: 0.8,
    z: -17.2,
    width: 1.3,
    height: 0.75,
    depth: 0.65,
    amplitude: 1.65,
    period: 3.5,
    phase: 0,
  },
];

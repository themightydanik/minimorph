import { courseRun } from './course-run';
export interface RunSegment { seconds: number; keys: string[]; jump: boolean }
/** Recorded manual-style digital controls. No teleports, hazard overrides or runtime autopilot. */
export const arenaRuns: Record<string, readonly RunSegment[]> = {
  'cosmic-sprint': courseRun,
  'orbit-chaos': [
    { seconds: 0.44, keys: ['KeyW', 'KeyD'], jump: false },
    { seconds: 0.72, keys: ['KeyW'], jump: false },
    { seconds: 1.0, keys: ['KeyW'], jump: true },
    { seconds: 0.42, keys: ['KeyW', 'KeyA'], jump: true },
    { seconds: 0.64, keys: ['KeyW'], jump: false },
    { seconds: 0.35, keys: ['KeyW'], jump: false },
    { seconds: 1.0, keys: ['KeyW'], jump: true },
    { seconds: 0.55, keys: ['KeyW'], jump: true },
    { seconds: 1.3, keys: ['KeyW'], jump: false },
  ],
  'gravity-mayhem': [
    { seconds: 1.14, keys: ['KeyW'], jump: false },
    { seconds: 0.94, keys: ['KeyW'], jump: true },
    { seconds: 0.96, keys: ['KeyW'], jump: true },
    { seconds: 0.46, keys: ['KeyW'], jump: false },
    { seconds: 0.98, keys: ['KeyW'], jump: true },
    { seconds: 0.28, keys: ['KeyW'], jump: false },
    { seconds: 1, keys: ['KeyW'], jump: true },
    { seconds: 0.32, keys: ['KeyW'], jump: false },
    { seconds: 1.0, keys: [], jump: false },
    { seconds: 1.5, keys: ['KeyW'], jump: true },
  ],
};

export const orbitShuttleRun: readonly RunSegment[] = [
  { seconds: 0.44, keys: ['KeyW', 'KeyA'], jump: false },
  { seconds: 0.72, keys: ['KeyW'], jump: false },
  { seconds: 0.9, keys: ['KeyW'], jump: false },
  { seconds: 0.5, keys: [], jump: false },
  { seconds: 0.5, keys: ['KeyW', 'KeyD'], jump: true },
  { seconds: 0.64, keys: ['KeyW'], jump: false },
  { seconds: 0.35, keys: ['KeyW'], jump: false },
  { seconds: 1.0, keys: ['KeyW'], jump: true },
  { seconds: 0.55, keys: ['KeyW'], jump: true },
  { seconds: 1.3, keys: ['KeyW'], jump: false },
];

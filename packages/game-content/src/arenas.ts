import { platforms, obstacles, spawn, finish, checkpoints } from './legacy';
import type { Platform, MovingObstacle } from './legacy';
export interface Point { x: number; y: number; z: number }
export interface Marker extends Point { radius: number }
export type RaceMode = "race" | "training";
export interface ArenaSection { id: string; name: string; start: number; end: number; hint: string; cameraDistance?: number; cameraLift?: number; elevation?: number }
export interface CourseDefinition {
  navigation?: readonly NavigationRoute[];
  airControl?: number;
  spawn: Point;
  finish: Marker;
  checkpoints: readonly Marker[];
}
export interface NavigationRoute { id: string; stage: number; name: string; skill?: 'easy' | 'hard'; points: readonly Point[] }
export interface ArenaVisual extends Point { id: string; asset: string; width: number; depth: number; yaw?: number; part?: number; mechanismId?: string; fit?: 'floor' | 'gate' | 'prop'; }
interface Mechanism extends Point { impactStrength?: number; id: string; period: number; phase?: number; yaw?: number }
export type ArenaObstacle =
  | (Mechanism & { kind: 'sweeper'; length: number; width: number; height: number })
  | (Mechanism & { kind: 'moving-platform'; width: number; depth: number; axis: 'x' | 'y' | 'z'; amplitude: number })
  | (Mechanism & { kind: 'sliding-block'; width: number; depth: number; height: number; axis: 'x' | 'z'; amplitude: number })
  | (Mechanism & { kind: 'disappearing-platform'; width: number; depth: number; onFor: number; warning: number })
  | (Mechanism & { kind: 'jump-pad'; width: number; depth: number; boost: number })
  | (Mechanism & { kind: 'laser'; width: number; depth: number; height: number; warning: number; activeFor: number })
  | (Mechanism & { kind: 'rotating-disc'; radius: number })
  | (Mechanism & { kind: 'pendulum'; radius: number; length: number; swing: number })
  | (Mechanism & { kind: 'moving-wall'; width: number; depth: number; height: number; gap: number; amplitude: number })
  | (Mechanism & { kind: 'conveyor'; width: number; depth: number; velocityX: number; velocityZ: number })
  | (Mechanism & { kind: 'bounce-platform'; width: number; depth: number; amplitude: number; boost: number })
  | (Mechanism & { kind: 'timed-gate'; width: number; depth: number; height: number; warning: number; activeFor: number })
  | (Mechanism & { kind: 'pusher'; width: number; depth: number; height: number; side: -1 | 1; reach: number; warning: number; activeFor: number; shaft?: boolean })
  | (Mechanism & { kind: 'collapse-platform'; width: number; depth: number; delay: number; warning: number; resetAfter: number });
export interface RouteChoice {
  id: string;
  name: string;
  tradeoff: string;
  start: number;
  end: number;
  x: number;
  skill: 'easy' | 'hard';
}
export interface ArenaConfig extends CourseDefinition {
  visuals?: readonly ArenaVisual[];
  /** Optional branch target over a shared, ordered checkpoint interval. */
  branches?: readonly RouteChoice[];
  sections?: readonly ArenaSection[];
  expectedSeconds?: readonly [number, number];
  id: string;
  name: string;
  subtitle: string;
  difficulty: string;
  description: string;
  palette: { sky: string; deck: string; alternate: string; accent: string; hazard: string; planet: string };
  platforms: readonly Platform[];
  obstacles: readonly MovingObstacle[];
  mechanisms: readonly ArenaObstacle[];
  routes: readonly { name: string; points: readonly Point[] }[];
}
/** Original PR #2–4 course remains available to regression tests and API clients. */
export const legacyCourse: CourseDefinition = { spawn, finish, checkpoints };
export const trainingArenas: readonly ArenaConfig[] = [
  {
    id: 'cosmic-sprint', name: 'Cosmic Sprint', subtitle: '01 / LIFT OFF', difficulty: 'CADET',
    description: 'Find your rhythm. Leap between orbital islands and jump the moving sweeper.',
    palette: { sky: '#101a38', deck: '#283f7d', alternate: '#7462ef', accent: '#48f5dc', hazard: '#ffb75b', planet: '#c87cff' },
    ...legacyCourse, platforms, obstacles,
    mechanisms: [
      { id: 'sprint-sweeper', kind: 'sweeper', x: 2.7, y: 0, z: 1, length: 2.6, width: 0.3, height: 0.5, period: 4.8 },
      { id: 'finish-sweeper', kind: 'sweeper', x: 3, y: 0.9, z: -29, length: 2.2, width: 0.28, height: 0.45, period: 4 },
    ],
    routes: [{ name: 'Launch lane', points: [spawn, ...checkpoints, finish] }],
  },
  {
    id: 'orbit-chaos', name: 'Orbit Chaos', subtitle: '02 / KEEP YOUR BALANCE', difficulty: 'PILOT',
    description: 'Ride the shuttle or take the narrow outer lane. Discs carry you; jump pads launch you.',
    palette: { sky: '#251337', deck: '#533475', alternate: '#bd5292', accent: '#9aff9c', hazard: '#ffb65f', planet: '#ffb66c' },
    spawn: { x: 0, y: 0, z: 2 }, finish: { x: 0, y: 0.5, z: -33, radius: 1.5 },
    checkpoints: [{ x: 0, y: 0.4, z: -16, radius: 1.5 }, { x: -1, y: 0.5, z: -24, radius: 1.4 }],
    platforms: [
      { x: 0, y: 0, z: 0, width: 8, depth: 10 },
      { x: 2, y: 0.2, z: -9, width: 3.2, depth: 5 },
      { x: -1, y: 0.5, z: -24, width: 4.4, depth: 5 },
      { x: 0, y: 0.5, z: -32, width: 7, depth: 7 },
    ], obstacles: [],
    mechanisms: [
      { id: 'orbit-shuttle', kind: 'moving-platform', x: -2.2, y: 0.2, z: -9, width: 3.6, depth: 5, axis: 'x', amplitude: 1.2, period: 5 },
      { id: 'orbit-disc', kind: 'rotating-disc', x: 0, y: 0.4, z: -16, radius: 3, period: 12 },
      { id: 'orbit-boost', kind: 'jump-pad', x: -1.5, y: 0, z: -3.7, width: 1.5, depth: 1.1, boost: 11.8, period: 1 },
      { id: 'orbit-block', kind: 'sliding-block', x: -1, y: 0.5, z: -25, width: 1.2, depth: 0.6, height: 0.85, axis: 'x', amplitude: 1.7, period: 3.6 },
      { id: 'orbit-sweeper', kind: 'sweeper', x: 2.4, y: 0.5, z: -30.5, length: 2.2, width: 0.25, height: 0.5, period: 3.5 },
    ],
    routes: [
      { name: 'Shuttle route', points: [{ x: -1.5, y: 0, z: -3.7 }, { x: -2.2, y: 0.2, z: -9 }, { x: 0, y: 0.4, z: -16 }] },
      { name: 'Outer lane', points: [{ x: 2, y: 0, z: -3 }, { x: 2, y: 0.2, z: -9 }, { x: 0, y: 0.4, z: -16 }] },
    ],
  },
  {
    id: 'gravity-mayhem', name: 'Gravity Mayhem', subtitle: '03 / BEAT THE PULSE', difficulty: 'ACE',
    description: 'Read the warning lights. Cross vanishing decks, time the lasers and clear the final rotor.',
    palette: { sky: '#081f2c', deck: '#1c6370', alternate: '#359a9f', accent: '#ffe68b', hazard: '#ff588b', planet: '#66d3d8' },
    spawn: { x: 0, y: 0, z: 2 }, finish: { x: 0, y: 0.4, z: -41, radius: 1.3 },
    checkpoints: [{ x: 0, y: 0.4, z: -15.5, radius: 1.4 }, { x: 0, y: 0.4, z: -31.5, radius: 1.4 }],
    platforms: [
      { x: 0, y: 0, z: 0, width: 7, depth: 10 },
      { x: 0, y: 0.4, z: -16, width: 4.2, depth: 5 },
      { x: 0, y: 0.4, z: -32, width: 4.2, depth: 5 },
      { x: 0, y: 0.4, z: -40, width: 6, depth: 7 },
    ], obstacles: [],
    mechanisms: [
      { id: 'gravity-fade', kind: 'disappearing-platform', x: 0, y: 0.2, z: -8, width: 4, depth: 4.5, period: 6, onFor: 4.3, warning: 0.9 },
      { id: 'gravity-shuttle', kind: 'moving-platform', x: 0, y: 0.4, z: -24, width: 4, depth: 5, axis: 'x', amplitude: 1.2, period: 5 },
      { id: 'gravity-laser', kind: 'laser', x: 0, y: 0.4, z: -17.4, width: 4.1, depth: 0.22, height: 2.2, period: 5.5, warning: 1, activeFor: 1.2 },
      { id: 'gravity-block', kind: 'sliding-block', x: 0, y: 0.4, z: -32.7, width: 1, depth: 0.6, height: 0.7, axis: 'x', amplitude: 1.5, period: 3.2 },
      { id: 'gravity-final', kind: 'sweeper', x: 0, y: 0.4, z: -38.1, length: 4.4, width: 0.28, height: 0.55, period: 4 },
      { id: 'gravity-final-laser', kind: 'laser', x: 0, y: 0.4, z: -40, width: 5.5, depth: 0.2, height: 2.2, period: 6, phase: 2, warning: 1.2, activeFor: 1.1 },
    ],
    routes: [{ name: 'Pulse route', points: [{ x: 0, y: 0.2, z: -8 }, { x: 0, y: 0.4, z: -16 }, { x: 0, y: 0.4, z: -24 }, { x: 0, y: 0.4, z: -32 }, { x: 0, y: 0.4, z: -41 }] }],
  },
];
export function getTrainingArena(id: string): ArenaConfig {
  const arena = trainingArenas.find(a => a.id === id);
  if (!arena) throw new Error(`Unknown arena: ${id}`);
  return arena;
}

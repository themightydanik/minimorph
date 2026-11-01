import { platforms, spawn, finish } from '@minimorph/game-content';
import type { Platform } from '@minimorph/game-content';
export interface PlayerState { x: number; y: number; z: number; vy: number; grounded: boolean; won: boolean; elapsed: number; falls: number }
export interface Input { x: number; z: number; jump: boolean }
export const SPEED = 6;
export const GRAVITY = 18;
export const JUMP_SPEED = 8.5;
export const FIXED_STEP = 1 / 120;
export function createPlayer(): PlayerState { return { ...spawn, vy: 0, grounded: true, won: false, elapsed: 0, falls: 0 }; }
export function stepPlayer(state: PlayerState, input: Input, dt: number, surfaces: readonly Platform[] = platforms): void {
  if (state.won) return;
  state.elapsed += dt;
  const length = Math.hypot(input.x, input.z);
  const scale = Math.max(1, length);
  state.x += input.x / scale * SPEED * dt;
  state.z += input.z / scale * SPEED * dt;
  if (input.jump && state.grounded) { state.vy = JUMP_SPEED; state.grounded = false; }
  const oldY = state.y;
  state.vy -= GRAVITY * dt;
  state.y += state.vy * dt;
  state.grounded = false;
  // Swept vertical foot collision; side overlap never teleports the player upward.
  const landing = surfaces.filter(p => Math.abs(state.x - p.x) <= p.width / 2 && Math.abs(state.z - p.z) <= p.depth / 2 && oldY >= p.y - 0.001 && state.y <= p.y && state.vy <= 0).sort((a, b) => b.y - a.y)[0];
  if (landing) { state.y = landing.y; state.vy = 0; state.grounded = true; }
  if (state.y < -12) { const falls = state.falls + 1; const elapsed = state.elapsed; Object.assign(state, createPlayer(), { falls, elapsed }); }
  if (state.grounded && Math.abs(state.y - finish.y) < 0.01 && Math.hypot(state.x - finish.x, state.z - finish.z) < finish.radius) state.won = true;
}

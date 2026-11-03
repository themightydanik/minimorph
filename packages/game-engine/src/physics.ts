import {
  platforms,
  legacyCourse,
  obstacles,
} from "@minimorph/game-content";
import type { ArenaConfig, CourseDefinition, Platform, MovingObstacle } from "@minimorph/game-content";
import { advanceCheckpoints, respawnPoint } from "./checkpoints";
import type { CollisionSurface } from "./obstacles";
import { arenaSurfaces, surfaceContains, supportDisplacement, mechanismContact, sampleMechanism } from "./obstacles";
export interface PlayerState {
  supportId: string | null;
  lastHazard: string | null;
  knockTime: number;
  knockX: number;
  knockZ: number;
  eventSerial: number;
  lastEvent: "jump" | "land" | "hit" | "pad" | null;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  heading: number;
  grounded: boolean;
  won: boolean;
  elapsed: number;
  falls: number;
  checkpoint: number;
  checkpointFlash: number;
  coyote: number;
  jumpBuffer: number;
  respawnTimer: number;
  protection: number;
  respawns: number;
  recovery: "fall" | "obstacle" | null;
  obstacleHits: number;
  landingTime: number;
  landingImpact: number;
}
export interface Input {
  x: number;
  z: number;
  jump: boolean;
  cameraYaw?: number;
  cameraTurn?: number;
}
export const SPEED = 6;
export const ACCELERATION = 34;
export const DECELERATION = 42;
export const GRAVITY = 18;
export const JUMP_SPEED = 8.5;
export const FIXED_STEP = 1 / 120;
export const COYOTE_TIME = 0.1;
export const JUMP_BUFFER_TIME = 0.12;
export const RESPAWN_DELAY = 0.4;
export const PLAYER_RADIUS = 0.25;
export const idleInput: Input = { x: 0, z: 0, jump: false };
export function createPlayer(course: CourseDefinition = legacyCourse): PlayerState {
  return {
    ...course.spawn,
    supportId: null, lastHazard: null, knockTime: 0, knockX: 0, knockZ: 0, eventSerial: 0, lastEvent: null,
    vx: 0,
    vy: 0,
    vz: 0,
    heading: 0,
    grounded: true,
    won: false,
    elapsed: 0,
    falls: 0,
    checkpoint: 0,
    checkpointFlash: 0,
    coyote: COYOTE_TIME,
    jumpBuffer: 0,
    respawnTimer: 0,
    protection: 0,
    respawns: 0,
    recovery: null,
    obstacleHits: 0,
    landingTime: 0,
    landingImpact: 0,
  };
}
export function cameraRelativeMovement(
  x: number,
  z: number,
  yaw = 0,
): { x: number; z: number } {
  const length = Math.max(1, Math.hypot(x, z));
  return {
    x: (x * Math.cos(yaw) + z * Math.sin(yaw)) / length,
    z: (z * Math.cos(yaw) - x * Math.sin(yaw)) / length,
  };
}
export function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
export function obstaclePosition(obstacle: MovingObstacle, time: number) {
  return {
    x:
      obstacle.x +
      Math.sin((time * Math.PI * 2) / obstacle.period + obstacle.phase) *
        obstacle.amplitude,
    y: obstacle.y,
    z: obstacle.z,
  };
}
export function beginRecovery(
  state: PlayerState,
  reason: "fall" | "obstacle",
): void {
  if (state.recovery || state.won) return;
  state.recovery = reason;
  state.respawnTimer = RESPAWN_DELAY;
  state.falls++;
  if (reason === "obstacle") state.obstacleHits++;
  state.vx = state.vy = state.vz = 0;
  state.jumpBuffer = state.coyote = 0;
  state.grounded = false;
}
function restoreCheckpoint(state: PlayerState, course: CourseDefinition): void {
  const point = respawnPoint(state, course);
  Object.assign(state, {
    supportId: null, knockTime: 0, knockX: 0, knockZ: 0,
    x: point.x,
    y: point.y,
    z: point.z,
    vx: 0,
    vy: 0,
    vz: 0,
    grounded: true,
    recovery: null,
    respawnTimer: 0,
    protection: 0.65,
    jumpBuffer: 0,
    coyote: COYOTE_TIME,
    landingTime: 0.2,
    landingImpact: 0.5,
    respawns: state.respawns + 1,
  });
}
function approachVelocity(
  state: PlayerState,
  x: number,
  z: number,
  dt: number,
): void {
  const dx = x - state.vx,
    dz = z - state.vz,
    distance = Math.hypot(dx, dz);
  const amount = (Math.hypot(x, z) > 0 ? ACCELERATION : DECELERATION) * dt;
  if (distance <= amount) {
    state.vx = x;
    state.vz = z;
  } else {
    state.vx += (dx / distance) * amount;
    state.vz += (dz / distance) * amount;
  }
}
export function stepPlayer(
  state: PlayerState,
  input: Input,
  dt: number,
  surfaces: readonly CollisionSurface[] = platforms,
  hazards: readonly MovingObstacle[] = obstacles,
  course: CourseDefinition = legacyCourse,
  evaluateCourse = true,
): void {
  if (state.won) return;
  state.elapsed += dt;
  state.checkpointFlash = Math.max(0, state.checkpointFlash - dt);
  state.landingTime = Math.max(0, state.landingTime - dt);
  state.protection = Math.max(0, state.protection - dt);
  if (state.recovery) {
    state.respawnTimer -= dt;
    if (state.respawnTimer <= 0) restoreCheckpoint(state, course);
    return;
  }
  state.coyote = state.grounded ? COYOTE_TIME : Math.max(0, state.coyote - dt);
  state.jumpBuffer = input.jump
    ? JUMP_BUFFER_TIME
    : Math.max(0, state.jumpBuffer - dt);
  const movement = cameraRelativeMovement(input.x, input.z, input.cameraYaw);
  approachVelocity(state, movement.x * SPEED, movement.z * SPEED, dt);
  if (state.jumpBuffer > 0 && state.coyote > 0) {
    state.vy = JUMP_SPEED;
    state.lastEvent = "jump"; state.eventSerial++;
    state.grounded = false;
    state.jumpBuffer = state.coyote = 0;
  }
  const oldY = state.y;
  state.x += (state.vx + state.knockX) * dt;
  state.z += (state.vz + state.knockZ) * dt;
  state.knockTime = Math.max(0, state.knockTime - dt);
  state.knockX *= Math.exp(-5 * dt); state.knockZ *= Math.exp(-5 * dt);
  if (Math.hypot(state.vx, state.vz) > 0.05) {
    const target = Math.atan2(-state.vx, -state.vz);
    state.heading = wrapAngle(
      state.heading +
        wrapAngle(target - state.heading) * (1 - Math.exp(-15 * dt)),
    );
  }
  const wasGrounded = state.grounded;
  state.vy -= GRAVITY * dt;
  state.y += state.vy * dt;
  state.grounded = false;
  let landing: Platform | undefined;
  for (const p of surfaces) {
    if (
      surfaceContains(p, state.x, state.z) &&
      oldY >= (p.previousY ?? p.y) - 0.001 &&
      state.y <= p.y &&
      state.vy <= (dt > 0 ? (p.y - (p.previousY ?? p.y)) / dt : 0) &&
      (!landing || p.y > landing.y)
    )
      landing = p;
  }
  state.supportId = landing?.id ?? null;
  if (landing) {
    if (!wasGrounded) {
      state.lastEvent = "land"; state.eventSerial++;
      state.landingTime = 0.2;
      state.landingImpact = Math.min(1, -state.vy / 10);
    }
    state.y = landing.y;
    state.vy = 0;
    state.grounded = true;
  }
  // Sample hazards from simulation time, not wall-clock/render frames.
  if (state.protection === 0)
    for (const obstacle of hazards) {
      const now = obstaclePosition(obstacle, state.elapsed),
        before = obstaclePosition(obstacle, state.elapsed - dt);
      const left =
        Math.min(now.x, before.x) - obstacle.width / 2 - PLAYER_RADIUS;
      const right =
        Math.max(now.x, before.x) + obstacle.width / 2 + PLAYER_RADIUS;
      if (
        state.x >= left &&
        state.x <= right &&
        Math.abs(state.z - now.z) < obstacle.depth / 2 + PLAYER_RADIUS &&
        state.y < now.y + obstacle.height &&
        state.y + 1.7 > now.y
      ) {
        beginRecovery(state, "obstacle");
        return;
      }
    }
  if (state.y < -6) {
    beginRecovery(state, "fall");
    return;
  }
  if (evaluateCourse) advanceCheckpoints(state, course);
}

/** Extends the original controller; rendering uses the exact same mechanism sampler. */
export function stepArenaPlayer(state: PlayerState, input: Input, dt: number, arena: ArenaConfig): void {
  if (state.won) return;
  if (state.grounded && !state.supportId && !state.recovery) {
    state.supportId = arenaSurfaces(arena, state.elapsed).find(p => surfaceContains(p, state.x, state.z) && Math.abs(p.y - state.y) < 0.01)?.id ?? null;
  }
  if (state.grounded && state.supportId && !state.recovery) {
    const support = arena.mechanisms.find(o => o.id === state.supportId);
    if (support) {
      const delta = supportDisplacement(support, state.elapsed, dt, state.x, state.z);
      state.x += delta.x; state.y += delta.y; state.z += delta.z;
    }
  }
  const surfaces = arenaSurfaces(arena, state.elapsed + dt, state.elapsed);
  // A carried foot is already in the support's new frame; airborne contacts use swept Y.
  if (state.grounded) for (const surface of surfaces) if (surface.id === state.supportId) surface.previousY = surface.y;
  stepPlayer(state, input, dt, surfaces, arena.obstacles, arena, false);
  if (state.recovery || state.won) return;
  for (const o of arena.mechanisms) {
    if (o.kind === "jump-pad" && state.grounded && Math.abs(state.y - o.y) < 0.05 && Math.abs(state.x - o.x) < o.width / 2 && Math.abs(state.z - o.z) < o.depth / 2) {
      state.vy = o.boost; state.grounded = false; state.coyote = state.jumpBuffer = 0;
      state.supportId = null; state.lastEvent = "pad"; state.eventSerial++;
    }
    if (state.protection <= 0 && mechanismContact(o, state.elapsed, state)) {
      const p = sampleMechanism(o, state.elapsed);
      let dx = state.x - p.x, dz = state.z - p.z;
      if (Math.hypot(dx, dz) < 0.05) { dx = Math.cos(p.angle + Math.PI / 2); dz = Math.sin(p.angle + Math.PI / 2); }
      const length = Math.hypot(dx, dz);
      state.lastHazard = o.id;
      state.knockX = dx / length * 8; state.knockZ = dz / length * 8;
      state.vy = Math.max(state.vy, 4.8); state.grounded = false; state.supportId = null;
      state.knockTime = 0.55; state.protection = 0.8; state.obstacleHits++;
      state.coyote = state.jumpBuffer = 0; state.lastEvent = "hit"; state.eventSerial++;
      break;
    }
  }
  advanceCheckpoints(state, arena);
}

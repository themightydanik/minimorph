import {
  platforms,
  legacyCourse,
  obstacles,
} from "@minimorph/game-content";
import type { ArenaConfig, CourseDefinition, MovingObstacle } from "@minimorph/game-content";
import { advanceCheckpoints, respawnPoint } from "./checkpoints";
import type { CollisionSurface } from "./obstacles";
import { ArenaRuntime, surfaceContains, mechanismContact, sampleMechanism } from "./obstacles";
export type MovementAction = "normal" | "dive" | "slide" | "recover";
export interface PlayerState {
  action: MovementAction;
  actionTime: number;
  diveCooldown: number;
  diveUsed: boolean;
  jumpHeld: boolean;
  diveHeld: boolean;
  collapseTimes: Record<string,number>;
  splits: number[];
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
  dive?: boolean;
  cameraYaw?: number;
  cameraTurn?: number;
}
export const SPEED = 6;
export const DIVE_SPEED = 8.4;
export const DIVE_COOLDOWN = 1.1;
export const SLIDE_TIME = 0.42;
export const ACTION_RECOVERY_TIME = 0.22;
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
    action: "normal", actionTime: 0, diveCooldown: 0, diveUsed: false, jumpHeld: false, diveHeld: false,
    collapseTimes: {}, splits: [],
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
  state.action = "normal"; state.actionTime = 0;
  // Only checkpoint restoration rearms the dive; entering respawn is an interruption.
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
    action: "normal", actionTime: 0, diveUsed: false,
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
  airControl = 1,
): void {
  const dx = x - state.vx,
    dz = z - state.vz,
    distance = Math.hypot(dx, dz);
  const amount = (Math.hypot(x, z) > 0 ? ACCELERATION : DECELERATION) * dt * (state.grounded ? 1 : airControl);
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
  const jumpPressed = input.jump && !state.jumpHeld;
  const divePressed = !!input.dive && !state.diveHeld;
  state.jumpHeld = input.jump; state.diveHeld = !!input.dive;
  state.diveCooldown = Math.max(0, state.diveCooldown - dt);
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
  state.jumpBuffer = jumpPressed
    ? JUMP_BUFFER_TIME
    : Math.max(0, state.jumpBuffer - dt);
  const movement = cameraRelativeMovement(input.x, input.z, input.cameraYaw);
  // Consume edges even while locked; expiry must not accept an input from a locked tick.
  const actionAtStart = state.action;
  // Action timers and physics live here so prediction and the authoritative server agree.
  if (state.action === "slide" || state.action === "recover") {
    state.actionTime = Math.max(0, state.actionTime - dt);
    if (state.actionTime <= 0) {
      state.action = state.action === "slide" ? "recover" : "normal";
      state.actionTime = state.action === "recover" ? ACTION_RECOVERY_TIME : 0;
    }
  }
  if (divePressed && actionAtStart === "normal" && state.action === "normal" && state.diveCooldown === 0 &&
      !state.diveUsed && state.knockTime === 0) {
    const magnitude = Math.hypot(movement.x, movement.z);
    const dx = magnitude > 0.1 ? movement.x / magnitude : -Math.sin(state.heading);
    const dz = magnitude > 0.1 ? movement.z / magnitude : -Math.cos(state.heading);
    // Fixed capped forward impulse, never an upward impulse or an additive speed boost.
    state.vx = dx * DIVE_SPEED; state.vz = dz * DIVE_SPEED;
    state.vy = Math.min(state.vy, -1);
    state.action = state.grounded ? "slide" : "dive";
    state.actionTime = state.grounded ? SLIDE_TIME : 0;
    state.diveUsed = true; state.diveCooldown = DIVE_COOLDOWN;
    state.jumpBuffer = state.coyote = 0;
  }
  if (state.action === "normal") {
    approachVelocity(state, movement.x * SPEED, movement.z * SPEED, dt, course.airControl ?? 1);
  } else if (state.action === "dive") {
    // Limited steering; no extra thrust after the initial dive.
    approachVelocity(state, movement.x * SPEED, movement.z * SPEED, dt, 0.18);
    state.jumpBuffer = state.coyote = 0;
  } else {
    const friction = state.action === "slide" ? 2.4 : 8;
    state.vx *= Math.exp(-friction * dt); state.vz *= Math.exp(-friction * dt);
    state.jumpBuffer = state.coyote = 0;
  }
  if (state.action === "normal" && state.jumpBuffer > 0 && state.coyote > 0) {
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
  let landing: CollisionSurface | undefined;
  for (const p of surfaces) {
    if (
      surfaceContains(p, state.x, state.z) &&
      oldY >= (p.previousY ?? p.y) - 0.001 &&
      state.y <= p.y &&
      state.vy <= (dt > 0 ? (p.y - (p.previousY ?? p.y)) / dt : 0) &&
      (!landing || p.y > landing.y || p.y === landing.y && (p.priority ?? 0) > (landing.priority ?? 0))
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
    if (state.action === "dive") { state.action = "slide"; state.actionTime = SLIDE_TIME; }
    // Ground contact only rearms after the action chain, never during Slide/Recovery.
    // Cooldown and the held-input latch survive landing and all interruptions.
    if (state.action === "normal") state.diveUsed = false;
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

const runtimes = new WeakMap<PlayerState,ArenaRuntime>();
/** Extends the original controller; each run owns reusable collision/sampling buffers. */
export function stepArenaPlayer(state:PlayerState,input:Input,dt:number,arena:ArenaConfig,runtime?:ArenaRuntime):void {
 if(state.won)return;
 let world=runtime??runtimes.get(state);if(!world||world.arena!==arena){world=new ArenaRuntime(arena);runtimes.set(state,world);}
 if(state.grounded&&!state.supportId&&!state.recovery)state.supportId=world.surfaces(state.elapsed,state.elapsed,state.collapseTimes,state.z).find(p=>surfaceContains(p,state.x,state.z)&&Math.abs(p.y-state.y)<.01)?.id??null;
 if(state.grounded&&state.supportId&&!state.recovery){const d=world.displacement(state.supportId,state.elapsed,dt,state.x,state.z);state.x+=d.x;state.y+=d.y;state.z+=d.z;}
 const surfaces=world.surfaces(state.elapsed+dt,state.elapsed,state.collapseTimes,state.z);
 if(state.grounded)for(const s of surfaces)if(s.id===state.supportId)s.previousY=s.y;
 const oldZ=state.z;
 stepPlayer(state,input,dt,surfaces,arena.obstacles,arena,false);
 if(state.recovery||state.won)return;
 for(const e of world.entries){
  const o=e.o;if(Math.abs(o.z-state.z)>18)continue;
  if(o.kind==='collapse-platform'&&state.grounded&&state.supportId===o.id){const t=state.collapseTimes[o.id];if(t===undefined||state.elapsed-t>=o.delay+o.resetAfter)state.collapseTimes[o.id]=state.elapsed;}
  if((o.kind==='jump-pad'&&state.grounded&&Math.abs(state.y-o.y)<.05&&Math.abs(state.x-o.x)<o.width/2&&Math.abs(state.z-o.z)<o.depth/2)||(o.kind==='bounce-platform'&&state.grounded&&state.supportId===o.id)){
   state.action='normal';state.actionTime=0;state.vy=o.boost;state.grounded=false;state.coyote=state.jumpBuffer=0;state.supportId=null;state.lastEvent='pad';state.eventSerial++;
  }
  const p=sampleMechanism(o,state.elapsed,e.now,state.collapseTimes[o.id]);
  if(!mechanismContact(o,state.elapsed,state,PLAYER_RADIUS,p))continue;
  // Solid barriers never become permeable during knockback/recovery grace.
  const barrier=o.kind==='moving-wall'||o.kind==='timed-gate';
  if(barrier){const side=oldZ>=p.z?1:-1;state.z=p.z+side*(o.depth/2+PLAYER_RADIUS+.01);if(state.vz*side<0)state.vz=0;}
  if(state.protection>0)continue;
  let dx=state.x-p.x,dz=state.z-p.z;
  if(o.kind==='pusher'){dx=-o.side;dz=0;}
  if(barrier){dx=0;dz=oldZ>=p.z?1:-1;}
  if(Math.hypot(dx,dz)<.05){dx=Math.cos(p.angle+Math.PI/2);dz=Math.sin(p.angle+Math.PI/2);}
  const l=Math.hypot(dx,dz);state.lastHazard=o.id;state.knockX=dx/l*8;state.knockZ=dz/l*8;
  state.vy=Math.max(state.vy,barrier?2.5:4.8);state.grounded=false;state.supportId=null;
  state.action='normal';state.actionTime=0;state.knockTime=.55;state.protection=.8;state.obstacleHits++;state.coyote=state.jumpBuffer=0;state.lastEvent='hit';state.eventSerial++;
  break;
 }
 advanceCheckpoints(state,arena);
}

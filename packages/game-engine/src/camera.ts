import { legacyCourse } from "@minimorph/game-content";
import type { CourseDefinition } from "@minimorph/game-content";
import type { PlayerState } from "./physics";
export interface CameraPose {
  x: number;
  y: number;
  z: number;
  lookX: number;
  lookY: number;
  lookZ: number;
  fov: number;
}
export function createCameraPose(): CameraPose {
  return { x: 0, y: 5, z: 9, lookX: 0, lookY: 1, lookZ: 0, fov: 58 };
}
function damp(
  current: number,
  target: number,
  rate: number,
  dt: number,
  maxSpeed = Infinity,
) {
  if (dt <= 0) return current;
  const offset = (target - current) * (1 - Math.exp(-rate * dt));
  return current + Math.max(-maxSpeed * dt, Math.min(maxSpeed * dt, offset));
}
export function updateCamera(
  pose: CameraPose,
  player: Readonly<PlayerState>,
  yaw: number,
  aspect: number,
  dt: number,
  course: CourseDefinition = legacyCourse,
  framing?: { cameraDistance?: number; cameraLift?: number },
): void {
  const safe = course.checkpoints[player.checkpoint - 1] ?? course.spawn;
  const targetY = Math.max(safe.y - 0.8, player.y) + 1;
  // Hold above the course while falling; damp the look target as well as the eye.
  pose.lookX = damp(
    pose.lookX,
    player.x + (course.navigation ? player.vx * 0.3 : 0),
    7,
    dt,
    24,
  );
  pose.lookY = damp(pose.lookY, targetY, 5, dt, 12);
  pose.lookZ = damp(
    pose.lookZ,
    player.z + (course.navigation ? player.vz * 0.3 : -1),
    7,
    dt,
    24,
  );
  const lag = Math.hypot(player.x - pose.lookX, player.z - 1 - pose.lookZ);
  const distance =
    (aspect < 1
      ? cameraFollowConfig.portraitDistance
      : cameraFollowConfig.distance) +
    (framing?.cameraDistance ?? 0) * 0.5 +
    Math.min(lag * 0.5, 4);
  const speed = Math.hypot(player.vx, player.vz);
  pose.x = damp(pose.x, pose.lookX + Math.sin(yaw) * distance, 6, dt, 18);
  pose.z = damp(pose.z, pose.lookZ + Math.cos(yaw) * distance, 6, dt, 18);
  pose.y = damp(
    pose.y,
    pose.lookY +
      (aspect < 1 ? 5.5 : 3.8) +
      (framing?.cameraLift ?? 0) * 0.6 +
      Math.min(lag * 0.3, 3),
    5,
    dt,
    12,
  );
  pose.fov = damp(pose.fov, (aspect < 1 ? 64 : 58) + speed * 0.6, 4, dt);
}

/** Long rounds can respawn 50m away; reframe at re-entry instead of leaving the avatar off screen. */
export function reframeRecovery(
  pose: CameraPose,
  player: Readonly<PlayerState>,
  yaw: number,
  aspect: number,
): void {
  const distance =
    aspect < 1
      ? cameraFollowConfig.portraitDistance
      : cameraFollowConfig.distance;
  pose.lookX = player.x;
  pose.lookY = player.y + 1;
  pose.lookZ = player.z - 1;
  pose.x = pose.lookX + Math.sin(yaw) * distance;
  pose.z = pose.lookZ + Math.cos(yaw) * distance;
  pose.y = pose.lookY + (aspect < 1 ? 5.5 : 3.8);
  pose.fov = aspect < 1 ? 64 : 58;
}

/** Presentation-only partial follow: manual input yaw stays authoritative for movement. */
export const cameraFollowConfig = {
  distance: 6.5,
  portraitDistance: 8.5,
  strength: 0.6,
  maxOffset: 0.65,
  manualHold: 1.2,
  restoreRate: 1.8,
  damping: 2.5,
};
export function createCameraFollow() {
  return { offset: 0, quietTime: 0, previousYaw: 0 };
}
export function updateCameraFollow(
  state: ReturnType<typeof createCameraFollow>,
  player: Readonly<PlayerState>,
  manualYaw: number,
  manualTurn: number,
  dt: number,
): number {
  const wrap = (n: number) => Math.atan2(Math.sin(n), Math.cos(n));
  if (dt <= 0) return manualYaw + state.offset;
  const manual =
    Math.abs(manualTurn) > 0.001 ||
    Math.abs(wrap(manualYaw - state.previousYaw)) > 0.001;
  state.previousYaw = manualYaw;
  state.quietTime = manual ? 0 : state.quietTime + dt;
  const weight =
    1 -
    Math.exp(
      -cameraFollowConfig.restoreRate *
        Math.max(0, state.quietTime - cameraFollowConfig.manualHold),
    );
  const moving = Math.hypot(player.vx, player.vz) > 0.5 && !player.recovery;
  const target = moving
    ? Math.max(
        -cameraFollowConfig.maxOffset,
        Math.min(
          cameraFollowConfig.maxOffset,
          wrap(Math.atan2(-player.vx, -player.vz) - manualYaw),
        ),
      ) *
      cameraFollowConfig.strength *
      weight
    : 0;
  state.offset = damp(
    state.offset,
    target,
    manual ? 8 : cameraFollowConfig.damping,
    dt,
  );
  return wrap(manualYaw + state.offset);
}

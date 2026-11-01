import { spawn, checkpoints } from "@minimorph/game-content";
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
  return { x: 0, y: 5, z: 11, lookX: 0, lookY: 1, lookZ: 0, fov: 58 };
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
): void {
  const safe = checkpoints[player.checkpoint - 1] ?? spawn;
  const targetY = Math.max(safe.y - 0.8, player.y) + 1;
  // Hold above the course while falling; damp the look target as well as the eye.
  pose.lookX = damp(pose.lookX, player.x, 7, dt, 24);
  pose.lookY = damp(pose.lookY, targetY, 5, dt, 12);
  pose.lookZ = damp(pose.lookZ, player.z - 1, 7, dt, 24);
  const lag = Math.hypot(player.x - pose.lookX, player.z - 1 - pose.lookZ);
  const distance = (aspect < 1 ? 11.5 : 8.5) + Math.min(lag * 0.8, 12);
  const speed = Math.hypot(player.vx, player.vz);
  pose.x = damp(pose.x, pose.lookX + Math.sin(yaw) * distance, 6, dt, 18);
  pose.z = damp(pose.z, pose.lookZ + Math.cos(yaw) * distance, 6, dt, 18);
  pose.y = damp(
    pose.y,
    pose.lookY + (aspect < 1 ? 7 : 4.7) + Math.min(lag * 0.4, 6),
    5,
    dt,
    12,
  );
  pose.fov = damp(pose.fov, (aspect < 1 ? 64 : 58) + speed * 0.6, 4, dt);
}

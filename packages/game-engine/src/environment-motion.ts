import type { EnvironmentAnimation } from "@minimorph/game-content";
export function sampleEnvironmentMotion(
  a: EnvironmentAnimation | undefined,
  time: number,
  out = { x: 0, y: 0, z: 0, yaw: 0, pulse: 0 },
) {
  out.x = out.y = out.z = out.yaw = out.pulse = 0;
  if (!a) return out;
  const t = time * a.speed;
  if (a.type === "rotate") out.yaw = t;
  if (a.type === "bob") out.y = Math.sin(t) * a.amplitude;
  if (a.type === "orbit") {
    out.x = (Math.cos(t) - 1) * a.amplitude;
    out.z = Math.sin(t) * a.amplitude;
  }
  if (a.type === "pulse") out.pulse = (0.5 + 0.5 * Math.sin(t)) * a.amplitude;
  return out;
}

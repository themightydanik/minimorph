import type { ArenaConfig, ArenaObstacle, Platform } from '@minimorph/game-content';
export interface CollisionSurface extends Platform { previousY?: number }
export type MechanismPhase = 'safe' | 'warning' | 'active' | 'hidden';
export function cycle(o: ArenaObstacle, time: number): number {
  return ((time + (o.phase ?? 0)) % o.period + o.period) % o.period;
}
/** One deterministic sampler is shared by collisions and PlayCanvas visuals. */
export function sampleMechanism(o: ArenaObstacle, time: number) {
  const p = { x: o.x, y: o.y, z: o.z, angle: 0, phase: 'safe' as MechanismPhase };
  const t = cycle(o, time);
  if (o.kind === 'moving-platform' || o.kind === 'sliding-block') {
    p[o.axis] += Math.sin(t / o.period * Math.PI * 2) * o.amplitude;
  }
  if (o.kind === 'sweeper' || o.kind === 'rotating-disc') p.angle = t / o.period * Math.PI * 2;
  if (o.kind === 'disappearing-platform') p.phase = t >= o.onFor ? 'hidden' : t >= o.onFor - o.warning ? 'warning' : 'safe';
  if (o.kind === 'laser') p.phase = t >= o.period - o.activeFor ? 'active' : t >= o.period - o.activeFor - o.warning ? 'warning' : 'safe';
  return p;
}
export function arenaSurfaces(arena: ArenaConfig, time: number, previousTime = time): CollisionSurface[] {
  const surfaces: CollisionSurface[] = arena.platforms.map((p, i) => ({ ...p, id: `deck-${i}` }));
  for (const o of arena.mechanisms) {
    const p = sampleMechanism(o, time);
    if (o.kind === 'moving-platform' || (o.kind === 'disappearing-platform' && p.phase !== 'hidden'))
      surfaces.push({ ...p, previousY: sampleMechanism(o, previousTime).y, id: o.id, width: o.width, depth: o.depth });
    if (o.kind === 'rotating-disc') surfaces.push({ ...p, id: o.id, width: o.radius * 2, depth: o.radius * 2, radius: o.radius });
  }
  return surfaces;
}
export function surfaceContains(p: Platform, x: number, z: number): boolean {
  return p.radius !== undefined ? Math.hypot(x - p.x, z - p.z) <= p.radius : Math.abs(x - p.x) <= p.width / 2 && Math.abs(z - p.z) <= p.depth / 2;
}
export function supportDisplacement(o: ArenaObstacle, time: number, dt: number, x: number, z: number) {
  const before = sampleMechanism(o, time), after = sampleMechanism(o, time + dt);
  if (o.kind === 'rotating-disc') {
    const angle = dt / o.period * Math.PI * 2, dx = x - o.x, dz = z - o.z;
    return { x: dx * Math.cos(angle) - dz * Math.sin(angle) - dx, y: 0, z: dx * Math.sin(angle) + dz * Math.cos(angle) - dz };
  }
  return { x: after.x - before.x, y: after.y - before.y, z: after.z - before.z };
}
export function mechanismContact(o: ArenaObstacle, time: number, player: { x: number; y: number; z: number }, radius = 0.25): boolean {
  const p = sampleMechanism(o, time);
  if (o.kind !== 'sweeper' && o.kind !== 'sliding-block' && o.kind !== 'laser') return false;
  if (o.kind === 'laser' && p.phase !== 'active') return false;
  if (player.y >= p.y + o.height || player.y + 1.7 <= p.y) return false;
  const dx = player.x - p.x, dz = player.z - p.z;
  if (o.kind === 'sweeper') {
    const along = dx * Math.cos(p.angle) + dz * Math.sin(p.angle);
    const across = -dx * Math.sin(p.angle) + dz * Math.cos(p.angle);
    return Math.hypot(Math.max(0, Math.abs(along) - o.length / 2), across) < o.width / 2 + radius;
  }
  return Math.abs(dx) < o.width / 2 + radius && Math.abs(dz) < o.depth / 2 + radius;
}

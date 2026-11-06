import type {
  ArenaConfig,
  NavigationRoute,
  Point,
  CourseDefinition,
} from "@minimorph/game-content";
import type { Input, PlayerState } from "./physics";
import { ArenaRuntime, surfaceContains, mechanismContact } from "./obstacles";
export function projectRoute(route: NavigationRoute, x: number, z: number) {
  let best = Infinity,
    along = 0,
    total = 0,
    segment = 0,
    fraction = 0;
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1],
      b = route.points[i],
      dx = b.x - a.x,
      dz = b.z - a.z,
      len = Math.hypot(dx, dz);
    const t = Math.max(
      0,
      Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (len * len || 1)),
    );
    const distance = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    if (distance < best) {
      best = distance;
      along = total + len * t;
      segment = i;
      fraction = t;
    }
    total += len;
  }
  return { distance: best, along, total, segment, fraction };
}
/** A spatial progress measure over the current ordered checkpoint interval. */
export function courseProgress(
  course: CourseDefinition,
  state: Pick<PlayerState, "checkpoint" | "x" | "z" | "won">,
): number {
  if (state.won) return 1;
  const candidates = course.navigation?.filter(
    (r) => r.stage === state.checkpoint,
  );
  if (!candidates?.length)
    return Math.min(
      1,
      Math.max(
        0,
        (course.spawn.z - state.z) / (course.spawn.z - course.finish.z),
      ),
    );
  const projected = candidates
    .map((r) => projectRoute(r, state.x, state.z))
    .sort((a, b) => a.distance - b.distance)[0];
  return Math.min(
    1,
    (state.checkpoint +
      Math.min(0.999, projected.along / (projected.total || 1))) /
      (course.checkpoints.length + 1),
  );
}
/** Stateless 2D path follower. Outputs only legal movement; never changes physics, checkpoints or position. */
export function navigatePark(
  state: Readonly<PlayerState>,
  arena: ArenaConfig,
  world: ArenaRuntime,
  choice: "easy" | "hard",
): Input {
  const route = arena.navigation!.find(
    (r) => r.stage === state.checkpoint && (!r.skill || r.skill === choice),
  );
  if (!route || state.action === "slide" || state.action === "recover")
    return { x: 0, z: 0, jump: false };
  const projected = projectRoute(route, state.x, state.z);
  let remaining = 1.5,
    target: Point = route.points.at(-1)!;
  for (let i = projected.segment; i < route.points.length; i++) {
    const a = route.points[i - 1],
      b = route.points[i],
      t = i === projected.segment ? projected.fraction : 0;
    const length = Math.hypot(b.x - a.x, b.z - a.z),
      available = length * (1 - t);
    if (remaining <= available) {
      const u = t + remaining / (length || 1);
      target = {
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
        z: a.z + (b.z - a.z) * u,
      };
      break;
    }
    remaining -= available;
  }
  let dx = target.x - state.x,
    dz = target.z - state.z;
  const distance = Math.hypot(dx, dz) || 1;
  dx /= distance;
  dz /= distance;
  // Compensate the real passenger displacement, including rotating floors and conveyors.
  if (state.grounded && state.supportId) {
    const d = world.displacement(
      state.supportId,
      state.elapsed,
      1 / 30,
      state.x,
      state.z,
    );
    dx -= (d.x * 30) / 6;
    dz -= (d.z * 30) / 6;
  }
  const x = Math.abs(dx) > 0.18 ? Math.sign(dx) : 0,
    z = Math.abs(dz) > 0.18 ? Math.sign(dz) : 0;
  const n = Math.hypot(x, z) || 1,
    nx = x / n,
    nz = z / n;
  const surfaces = world.surfaces(
    state.elapsed,
    state.elapsed,
    state.collapseTimes,
    state.z,
  );
  const at = (distance: number) =>
    surfaces.filter((s) =>
      surfaceContains(s, state.x + nx * distance, state.z + nz * distance),
    );
  let jump = false;
  if (state.grounded || state.coyote > 0) {
    const near = at(1),
      far = at(1.8);
    if (
      !state.grounded ||
      !near.some((s) => Math.abs(s.y - state.y) < 0.3) ||
      far.some((s) => s.y > state.y + 0.1 && s.y < state.y + 1.5)
    )
      jump = true;
    for (const o of arena.mechanisms)
      if (
        ["sweeper", "sliding-block", "pusher"].includes(o.kind) &&
        Math.hypot(o.x - state.x, o.z - state.z) < 8
      )
        for (const ahead of [0.18, 0.3])
          if (
            mechanismContact(o, state.elapsed + ahead, {
              x: state.x + nx * 6 * ahead,
              y: state.y,
              z: state.z + nz * 6 * ahead,
            })
          )
            jump = true;
  }
  return { x, z, jump, dive: false };
}

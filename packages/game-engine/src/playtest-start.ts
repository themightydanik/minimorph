import type { ArenaConfig, Point, Platform } from "@minimorph/game-content";
import { surfaceContains } from "@minimorph/game-content";
import { ArenaRuntime, mechanismContact } from "@minimorph/game-simulation";
import { createPlayer, PLAYER_RADIUS } from "./physics";
export interface LocalPlaytestStart {
  point: Point;
  supportId: string;
  checkpoint: number;
}
export type PlaytestStartRequest =
  | { mode: "default" }
  | { mode: "checkpoint"; index: number }
  | { mode: "selection"; objectId: string; colliderId?: string }
  | { mode: "point"; point: Point; supportId: string };
export type PlaytestStartResult =
  | { valid: true; start: LocalPlaytestStart; message: string }
  | { valid: false; message: string };
const HEIGHT = 1.7,
  MARGIN = PLAYER_RADIUS + 0.05;
const inset = (s: Platform) => ({
  ...s,
  width: s.width - 2 * MARGIN,
  depth: s.depth - 2 * MARGIN,
  ...(s.radius === undefined ? {} : { radius: s.radius - MARGIN }),
});
function fits(s: Platform, p: Point) {
  const inner = inset(s);
  return (
    inner.width > 0 &&
    inner.depth > 0 &&
    (inner.radius === undefined || inner.radius > 0) &&
    surfaceContains(inner, p.x, p.z)
  );
}
function overlap(s: Platform, p: Point) {
  return surfaceContains(
    {
      ...s,
      width: s.width + 2 * MARGIN,
      depth: s.depth + 2 * MARGIN,
      ...(s.radius === undefined ? {} : { radius: s.radius + MARGIN }),
    },
    p.x,
    p.z,
  );
}
/** Editor-only conservative policy, not a second simulation or permission to teleport online. */
export function resolvePlaytestStart(
  arena: ArenaConfig,
  request: PlaytestStartRequest,
): PlaytestStartResult {
  const reject = (message: string): PlaytestStartResult => ({
    valid: false,
    message,
  });
  const world = new ArenaRuntime(arena),
    all = world.surfaces(0, 0, {}),
    stable = world.staticSurfaces;
  let point: Point,
    supportId: string | undefined,
    checkpoint = 0;
  if (request.mode === "default") point = { ...arena.spawn };
  else if (request.mode === "checkpoint") {
    const cp = arena.checkpoints[request.index];
    if (!Number.isInteger(request.index) || !cp || cp.enabled === false)
      return reject("Choose an existing enabled checkpoint.");
    point = { x: cp.x, y: cp.y, z: cp.z };
    checkpoint = request.index + 1;
  } else if (request.mode === "selection") {
    const owned = all
      .filter(
        (s) =>
          s.id === request.objectId ||
          arena.colliderOwners?.[s.id ?? ""]?.ownerId === request.objectId,
      )
      .filter(
        (s) =>
          !request.colliderId ||
          arena.colliderOwners?.[s.id ?? ""]?.localId === request.colliderId,
      );
    if (!owned.length)
      return reject(
        "Selection has no walkable collision surface. Decorations and Environment geometry are not landing supports.",
      );
    if (owned.some((s) => world.byId.has(s.id ?? "")))
      return reject(
        "Moving, rotating, timed and automatic-action supports are not safe editor starts. Select a static platform.",
      );
    if (owned.length !== 1)
      return reject(
        "Selection has multiple landing surfaces. Pick the intended point on a surface.",
      );
    point = { x: owned[0].x, y: owned[0].y, z: owned[0].z };
    supportId = owned[0].id;
  } else {
    point = { ...request.point };
    supportId = request.supportId;
  }
  if (![point.x, point.y, point.z].every(Number.isFinite) || point.y <= -6)
    return reject(
      "Start has invalid coordinates or is at/below the level fall-recovery height.",
    );
  if (supportId && world.byId.has(supportId))
    return reject(
      "Moving, rotating or timed supports are ambiguous at a fresh clock. Use a static support.",
    );
  const support = stable.find(
    (s) =>
      (!supportId || s.id === supportId) &&
      Math.abs(s.y - point.y) < 1e-6 &&
      fits(s, point),
  );
  if (!support)
    return reject(
      "No static landing support with 0.30 m edge clearance at this height. Choose a point further inside a valid platform.",
    );
  if (
    stable.some(
      (s) =>
        s.y > point.y + 1e-6 &&
        s.y < point.y + HEIGHT + 0.05 &&
        overlap(s, point),
    )
  )
    return reject(
      "Insufficient head clearance: another compiled surface crosses the player body.",
    );
  for (const m of arena.mechanisms) {
    if (m.kind === "solid-box") {
      if (mechanismContact(m, 0, point, MARGIN))
        return reject(`Start intersects solid collider ${m.id}.`);
      continue;
    }
    if (
      [
        "jump-pad",
        "conveyor",
        "moving-platform",
        "disappearing-platform",
        "rotating-disc",
        "bounce-platform",
        "collapse-platform",
      ].includes(m.kind)
    ) {
      const s = all.find((s) => s.id === m.id);
      const amp =
        m.kind === "moving-platform" || m.kind === "bounce-platform"
          ? m.amplitude
          : 0;
      const vertical =
        m.kind === "bounce-platform" ||
        (m.kind === "moving-platform" && m.axis === "y")
          ? amp
          : 0;
      const movingFootprint = s
        ? {
            ...s,
            width:
              s.width +
              2 * (m.kind === "moving-platform" && m.axis === "x" ? amp : 0),
            depth:
              s.depth +
              2 * (m.kind === "moving-platform" && m.axis === "z" ? amp : 0),
          }
        : undefined;
      if (
        movingFootprint &&
        point.y <= m.y + vertical + 0.05 &&
        point.y + HEIGHT >=
          m.y - (m.kind === "collapse-platform" ? 8 : vertical) - 0.05 &&
        overlap(movingFootprint, point)
      )
        return reject(
          `Start overlaps the conservative sweep/clearance of support ${m.id}.`,
        );
      const trigger =
        m.kind === "conveyor" && m.surface === false ? m : undefined;
      if (
        (s && Math.abs(s.y - point.y) < 1e-6 && overlap(s, point)) ||
        (trigger &&
          point.y <= trigger.y + (trigger.triggerHeight ?? 0.35) &&
          point.y + HEIGHT >= trigger.y &&
          overlap(trigger, point))
      )
        return reject(
          `Start overlaps automatic-action or moving support ${m.id}. Use a static, inactive area.`,
        );
      continue;
    }
    // Reject the full conservative hazard sweep envelope, not just an inactive t=0 pose.
    const reach =
      m.kind === "sweeper"
        ? m.length / 2 + m.width / 2
        : m.kind === "pendulum"
          ? m.length + m.radius
          : Math.hypot(
              "width" in m ? m.width / 2 : 0,
              "depth" in m ? m.depth / 2 : 0,
            ) +
            ("amplitude" in m ? m.amplitude : 0) +
            ("reach" in m ? m.reach : 0);
    const height =
      m.kind === "pendulum"
        ? 2 * m.length + 2 * m.radius
        : "height" in m
          ? m.height
          : 0;
    if (
      point.y < m.y + height + 0.05 &&
      point.y + HEIGHT > m.y - 0.05 &&
      Math.hypot(point.x - m.x, point.z - m.z) <= reach + MARGIN
    )
      return reject(
        `Start is inside the conservative hazard sweep envelope of ${m.id}. Choose a clear waiting area.`,
      );
  }
  for (const m of arena.obstacles) {
    if (
      point.y < m.y + m.height &&
      point.y + HEIGHT > m.y &&
      Math.abs(point.x - m.x) <= m.width / 2 + m.amplitude + MARGIN &&
      Math.abs(point.z - m.z) <= m.depth / 2 + MARGIN
    )
      return reject(`Start is inside moving hazard legacy obstacle.`);
  }
  return {
    valid: true,
    start: { point, supportId: support.id!, checkpoint },
    message: `Ready · (${point.x.toFixed(2)}, ${point.y.toFixed(2)}, ${point.z.toFixed(2)}) · ${support.id} · clock 0`,
  };
}
export function pickPlaytestSurface(
  arena: ArenaConfig,
  origin: Point,
  direction: Point,
): { point: Point; supportId: string } | undefined {
  if (Math.abs(direction.y) < 1e-9) return;
  let best = Infinity,
    result: { point: Point; supportId: string } | undefined;
  for (const s of new ArenaRuntime(arena).surfaces(0, 0, {})) {
    const t = (s.y - origin.y) / direction.y;
    if (t < 0 || t >= best) continue;
    const point = {
      x: origin.x + direction.x * t,
      y: s.y,
      z: origin.z + direction.z * t,
    };
    if (surfaceContains(s, point.x, point.z)) {
      best = t;
      result = { point, supportId: s.id! };
    }
  }
  return result;
}
/** Fresh state on initial entry and Restart; the arena's spawn/checkpoints remain untouched. */
export function createLocalPlaytestState(
  arena: ArenaConfig,
  start?: LocalPlaytestStart,
) {
  if (!start) return createPlayer(arena);
  const checked = resolvePlaytestStart(arena, { mode: "point", ...start });
  if (!checked.valid) throw Error(checked.message);
  if (
    !Number.isInteger(start.checkpoint) ||
    start.checkpoint < 0 ||
    start.checkpoint > arena.checkpoints.length ||
    (start.checkpoint > 0 &&
      arena.checkpoints[start.checkpoint - 1].enabled === false)
  )
    throw Error("Invalid local checkpoint context.");
  return {
    ...createPlayer(arena),
    ...checked.start.point,
    supportId: checked.start.supportId,
    checkpoint: start.checkpoint,
  };
}

import raw from "./published/cosmic-sprint.json";
import { applyLayout, validateLayout } from "./layout-override";
import { cosmicSprint } from "./cosmic-sprint";
import type { ArenaConfig, NavigationRoute } from "./arenas";
/** Deterministic content fingerprint for compatibility, not an authentication credential. */
export function layoutFingerprint(value: unknown): string {
  const canonical = (v: unknown): string =>
    v === null || typeof v !== "object"
      ? JSON.stringify(v)
      : Array.isArray(v)
        ? `[${v.map(canonical).join(",")}]`
        : `{${Object.keys(v)
            .sort()
            .map(
              (k) =>
                `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`,
            )
            .join(",")}}`;
  let hash = 0xcbf29ce484222325n;
  for (const c of new TextEncoder().encode(canonical(value)))
    hash = BigInt.asUintN(64, (hash ^ BigInt(c)) * 0x100000001b3n);
  return hash.toString(16).padStart(16, "0");
}
export function validatePublication(value: unknown): {
  arena: ArenaConfig;
  revision: string;
} {
  if (!value || typeof value !== "object") throw Error("Invalid publication");
  const p = value as typeof raw;
  if (
    Object.keys(p).some(
      (k) => !["layout", "navigation", "navigationReviewedFor"].includes(k),
    )
  )
    throw Error("Unknown publication property");
  const layout = validateLayout(p.layout),
    arena = applyLayout(layout),
    revision = layoutFingerprint({ layout, navigation: p.navigation, world: arena });
  if (layout.objects.length || layout.checkpoints?.length) {
    if (
      !Array.isArray(p.navigation) ||
      p.navigationReviewedFor !== revision ||
      JSON.stringify(p.navigation) === JSON.stringify(cosmicSprint.navigation)
    )
      throw Error(
        `Multiplayer publication blocked: update and review navigation for ${revision}`,
      );
    const routes = p.navigation as unknown as NavigationRoute[];
    if (
      !routes.length ||
      routes.length > 32 ||
      new Set(routes.map((r) => r.id)).size !== routes.length
    )
      throw Error("Invalid navigation");
    const surfaces = [
      ...arena.platforms,
      ...arena.mechanisms
        .filter(
          (m) =>
            ["rotating-disc", "jump-pad", "conveyor"].includes(m.kind) &&
            !(m.kind === "conveyor" && m.surface === false),
        )
        .map((m) => ({
          ...m,
          width: "radius" in m ? m.radius * 2 : "width" in m ? m.width : 0,
          depth: "radius" in m ? m.radius * 2 : "depth" in m ? m.depth : 0,
        })),
    ];
    for (const r of routes) {
      if (
        !r ||
        typeof r.id !== "string" ||
        typeof r.name !== "string" ||
        !Number.isInteger(r.stage) ||
        r.stage < 0 ||
        r.stage > arena.checkpoints.length ||
        !Array.isArray(r.points) ||
        r.points.length < 2 ||
        r.points.length > 128 ||
        (r.skill !== undefined && !["easy", "hard"].includes(r.skill))
      )
        throw Error("Invalid navigation route");
      for (const point of r.points) {
        if (!point || ![point.x, point.y, point.z].every(Number.isFinite))
          throw Error("Invalid waypoint");
        if (
          !surfaces.some((s) => {
            const dx = point.x - s.x,
              dz = point.z - s.z,
              co = Math.cos(s.yaw ?? 0),
              si = Math.sin(s.yaw ?? 0);
            return (
              Math.abs(point.y - s.y) < 0.15 &&
              ("radius" in s && typeof s.radius === "number"
                ? Math.hypot(dx, dz) <= s.radius
                : Math.abs(dx * co - dz * si) <= s.width / 2 &&
                  Math.abs(dx * si + dz * co) <= s.depth / 2)
            );
          })
        )
          throw Error("Navigation waypoint has no supported landing surface");
      }
    }
    for (let stage = 0; stage <= arena.checkpoints.length; stage++)
      if (!routes.some((r) => r.stage === stage))
        throw Error("Missing navigation stage");
    arena.navigation = structuredClone(routes);
  } else if (p.navigation !== null || p.navigationReviewedFor !== null)
    throw Error("Default publication must use default navigation");
  return { arena, revision };
}
const published = validatePublication(raw);
export const publishedCosmicSprint = published.arena;
export const publishedLayoutOverride = validateLayout(raw.layout);
export const publishedLayoutRevision = published.revision;

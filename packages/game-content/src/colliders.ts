import type { ArenaConfig, ArenaObstacle } from "./arenas";
import { layoutSource } from "./editor-catalog";
import type { LayoutObject } from "./layout-override";
export interface LayoutCollider {
  id: string;
  kind: "surface" | "solid" | "hazard" | "bounce" | "turbo";
  x: number;
  y: number;
  z: number;
  yaw: number;
  width: number;
  depth: number;
  height: number;
  radius?: number;
  strength?: number;
  boost?: number;
  multiplier?: number;
  duration?: number;
}
export function defaultColliders(sourceId: string): LayoutCollider[] {
  const s = layoutSource(sourceId);
  if (!s) return [];
  const p = s.platform,
    m = s.mechanism,
    v = s.visual;
  if (!p && !m) return [];
  return [
    {
      id: "body",
      kind:
        p || m?.kind === "rotating-disc"
          ? "surface"
          : m?.kind === "jump-pad"
            ? "bounce"
            : m?.kind === "conveyor"
              ? "turbo"
              : "hazard",
      x: 0,
      y: (p?.y ?? m?.y ?? v.y) - v.y,
      z: 0,
      yaw: (p?.yaw ?? m?.yaw ?? (p ? v.yaw : 0) ?? 0) - (v.yaw ?? 0),
      width:
        p?.width ??
        (m && "length" in m
          ? m.length
          : m && "radius" in m
            ? m.radius * 2
            : m && "width" in m
              ? m.width
              : 1),
      depth:
        p?.depth ??
        (m?.kind === "sweeper"
          ? m.width
          : m && "radius" in m
            ? m.radius * 2
            : m && "depth" in m
              ? m.depth
              : 1),
      height: m && "height" in m ? m.height : 0.35,
      ...(p?.radius !== undefined
        ? { radius: p.radius }
        : m?.kind === "rotating-disc"
          ? { radius: m.radius }
          : {}),
      ...(m?.kind === "jump-pad" ? { boost: m.boost } : {}),
      ...(m?.kind === "conveyor" ? { multiplier: 1.5, duration: 5 } : {}),
      ...(m && "height" in m ? { strength: m.impactStrength ?? 8 } : {}),
    },
  ];
}
export function validateColliders(raw: unknown): LayoutCollider[] {
  if (!Array.isArray(raw) || raw.length > 8)
    throw Error("At most 8 colliders per object.");
  const ids = new Set<string>();
  return raw.map((value) => {
    if (!value || typeof value !== "object") throw Error("Invalid collider.");
    const c = value as LayoutCollider;
    if (
      Object.keys(c).some(
        (k) =>
          ![
            "id",
            "kind",
            "x",
            "y",
            "z",
            "yaw",
            "width",
            "depth",
            "height",
            "radius",
            "strength",
            "boost",
            "multiplier",
            "duration",
          ].includes(k),
      ) ||
      typeof c.id !== "string" ||
      !/^[a-zA-Z0-9-]{1,50}$/.test(c.id) ||
      ids.has(c.id) ||
      !["surface", "solid", "hazard", "bounce", "turbo"].includes(c.kind)
    )
      throw Error("Invalid collider ID/type.");
    for (const [k, min, max] of [
      ["x", -200, 200],
      ["y", -100, 100],
      ["z", -200, 200],
      ["yaw", -Math.PI * 2, Math.PI * 2],
      ["width", 0.1, 100],
      ["depth", 0.1, 100],
      ["height", 0.02, 50],
      ["radius", 0.1, 100],
      ["strength", 2, 24],
      ["boost", 2, 20],
      ["multiplier", 1, 2],
      ["duration", 0, 10],
    ] as const) {
      const v = c[k];
      if (
        v === undefined &&
        ["radius", "strength", "boost", "multiplier", "duration"].includes(k)
      )
        continue;
      if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
        throw Error(`Invalid collider ${k}.`);
    }
    if (c.radius !== undefined && c.kind !== "surface")
      throw Error("Radius is supported on landing surfaces only.");
    if (
      (c.boost !== undefined && c.kind !== "bounce") ||
      (c.multiplier !== undefined && c.kind !== "turbo") ||
      (c.duration !== undefined && c.kind !== "turbo") ||
      (c.strength !== undefined && !["hazard", "solid"].includes(c.kind))
    )
      throw Error("Collider behavior/property mismatch.");
    ids.add(c.id);
    return { ...c };
  });
}
export function colliderTransform(o: LayoutObject, c: LayoutCollider) {
  const source = layoutSource(o.sourceId)!.visual,
    scale = o.scale ?? 1,
    sx = ((o.width ?? source.width) / source.width) * scale,
    sz = ((o.depth ?? source.depth) / source.depth) * scale,
    co = Math.cos(o.yaw),
    si = Math.sin(o.yaw);
  return {
    x: o.x + co * c.x * sx + si * c.z * sz,
    y: o.y + c.y * scale,
    z: o.z - si * c.x * sx + co * c.z * sz,
    yaw: o.yaw + c.yaw,
    width: c.width * sx,
    depth: c.depth * sz,
    height: c.height * scale,
    ...(c.radius === undefined ? {} : { radius: c.radius * Math.min(sx, sz) }),
  };
}
/** Compile parent-local collider definitions to the existing shared surfaces/mechanisms. */
export function applyColliderOverrides(
  arena: ArenaConfig,
  objects: LayoutObject[],
): ArenaConfig {
  const visuals = [...arena.visuals!],
    platforms = [...arena.platforms],
    mechanisms = [...arena.mechanisms];
  const owners: NonNullable<ArenaConfig["colliderOwners"]> = {};
  for (const p of platforms) {
    const v = visuals.find((v) => v.id === p.id || `${v.id}-support` === p.id);
    if (p.id && v) owners[p.id] = { ownerId: v.id, localId: "body" };
  }
  for (const m of mechanisms) {
    const v = visuals.find((v) => v.mechanismId === m.id);
    if (v) owners[m.id] = { ownerId: v.id, localId: "body" };
  }
  for (const o of objects) {
    if (o.deleted || o.colliders === undefined) continue;
    const v = visuals.find((v) => v.id === o.id)!;
    const native = mechanisms.find((m) => m.id === v.mechanismId);
    if (native) v.animation = { ...native };
    for (const list of [platforms, mechanisms])
      for (let i = list.length - 1; i >= 0; i--)
        if (owners[list[i].id ?? ""]?.ownerId === o.id) list.splice(i, 1);
    for (const [id, binding] of Object.entries(owners))
      if (binding.ownerId === o.id) delete owners[id];
    for (const c of o.colliders) {
      const id =
          c.id === "body" && (native || layoutSource(o.sourceId)?.platform)
            ? (native?.id ?? o.id)
            : `${o.id}::${c.id}`,
        t = colliderTransform(o, c);
      owners[id] = { ownerId: o.id, localId: c.id };
      if (c.kind === "surface") {
        if (native?.kind === "rotating-disc" && c.id === "body")
          mechanisms.push({
            ...native,
            ...t,
            id,
            radius: t.radius ?? Math.min(t.width, t.depth) / 2,
          });
        else platforms.push({ ...t, id });
      } else if (c.kind === "solid") {
        mechanisms.push({ ...t, id, kind: "solid-box", period: 1 });
        platforms.push({ ...t, id: `${id}-top`, y: t.y + t.height });
        owners[`${id}-top`] = { ownerId: o.id, localId: c.id };
      } else if (c.kind === "bounce")
        mechanisms.push({
          ...t,
          id,
          kind: "jump-pad",
          period: 1,
          boost: c.boost ?? 10.5,
        });
      else if (c.kind === "turbo")
        mechanisms.push({
          ...t,
          id,
          kind: "conveyor",
          surface: native?.kind === "conveyor" && c.id === "body",
          period: 1,
          velocityX: 0,
          velocityZ: 0,
          turboMultiplier: c.multiplier ?? 1.5,
          turboDuration: c.duration ?? 5,
          triggerHeight: t.height,
        });
      else {
        const template =
          native &&
          ["sweeper", "pusher"].includes(native.kind) &&
          c.id === "body"
            ? native
            : undefined;
        const m: ArenaObstacle = template
          ? { ...template, ...t, id, impactStrength: c.strength ?? 8 }
          : {
              ...t,
              id,
              kind: "sliding-block",
              axis: "x",
              amplitude: 0,
              period: 1,
              impactStrength: c.strength ?? 8,
            };
        if (m.kind === "sweeper") {
          m.length = t.width;
          m.width = t.depth;
        }
        mechanisms.push(m);
      }
    }
  }
  const ids = [...platforms, ...mechanisms].map((v) => v.id);
  if (new Set(ids).size !== ids.length)
    throw Error("Duplicate gameplay collider ID.");
  // Both supplied turbo surfaces and catalog duplicates have the same functional default.
  for (const v of visuals)
    if (v.asset === "turbo-conveyor") {
      const m = mechanisms.find((m) => m.id === v.mechanismId);
      if (m?.kind === "conveyor") {
        m.turboMultiplier ??= 1.5;
        m.turboDuration ??= 5;
        m.triggerHeight ??= 0.35;
      }
    }
  return { ...arena, visuals, platforms, mechanisms, colliderOwners: owners };
}

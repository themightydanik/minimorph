import type { ArenaConfig, ArenaVisual } from "./arenas";
import { cosmicSprint } from "./cosmic-sprint";
import { applyColliderOverrides, validateColliders } from "./colliders";
import type { LayoutCollider } from "./colliders";
import { layoutSource } from "./editor-catalog";
export interface LayoutObject {
  id: string;
  sourceId: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  deleted?: boolean;
  width?: number;
  depth?: number;
  scale?: number;
  impactStrength?: number;
  colliders?: LayoutCollider[];
}
export interface LayoutOverride {
  version: 3;
  arenaId: "cosmic-sprint";
  objects: LayoutObject[];
  checkpoints?: { index: number; radius: number; enabled: boolean }[];
}
export function editableVisuals(): ArenaVisual[] {
  return cosmicSprint.visuals!.filter(
    (v) =>
      cosmicSprint.platforms.some((p) => p.id === v.id) ||
      !!v.mechanismId ||
      layoutSource(v.id)?.category === "decoration",
  );
}
export function canRotateLayoutObject(sourceId: string): boolean {
  const s = layoutSource(sourceId);
  return !!s && s.category !== "mechanism";
}
export function emptyLayout(): LayoutOverride {
  return { version: 3, arenaId: "cosmic-sprint", objects: [] };
}
export function validateLayout(value: unknown): LayoutOverride {
  const fail = (): never => {
    throw new Error(
      "Invalid Cosmic Sprint layout (version, IDs, dimensions, gameplay property or read-only object).",
    );
  };
  if (!value || typeof value !== "object") return fail();
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some(
      (k) =>
        ![
          "version",
          "arenaId",
          "objects",
          ...(v.version === 3 ? ["checkpoints"] : []),
        ].includes(k),
    ) ||
    ![1, 2, 3].includes(v.version as number) ||
    v.arenaId !== "cosmic-sprint" ||
    !Array.isArray(v.objects) ||
    v.objects.length > 200
  )
    return fail();
  const ids = new Set<string>();
  const objects = v.objects.map((raw: unknown) => {
    if (!raw || typeof raw !== "object") return fail();
    const o = raw as Record<string, unknown>;
    const base = ["id", "sourceId", "x", "y", "z", "yaw", "deleted"];
    if (
      Object.keys(o).some(
        (k) =>
          !(
            v.version === 1
              ? base
              : [
                  ...base,
                  "width",
                  "depth",
                  "scale",
                  "impactStrength",
                  ...(v.version === 3 ? ["colliders"] : []),
                ]
          ).includes(k),
      )
    )
      return fail();
    const source =
      typeof o.sourceId === "string" ? layoutSource(o.sourceId) : undefined;
    if (
      !source ||
      (v.version === 1 && String(o.sourceId).startsWith("catalog:")) ||
      typeof o.id !== "string" ||
      (o.id !== source.visual.id &&
        !/^editor-[a-zA-Z0-9-]{1,70}$/.test(o.id)) ||
      String(o.id).startsWith("catalog:") ||
      ids.has(o.id) ||
      (o.deleted !== undefined && typeof o.deleted !== "boolean")
    )
      return fail();
    if (
      cosmicSprint.visuals!.some(
        (s) => s.id === o.id && s.id !== source.visual.id,
      )
    )
      return fail();
    for (const k of ["x", "y", "z", "yaw"])
      if (
        typeof o[k] !== "number" ||
        !Number.isFinite(o[k]) ||
        Math.abs(o[k] as number) >
          (k === "yaw" ? Math.PI * 2 : k === "y" ? 100 : 2000)
      )
        return fail();
    if (
      !canRotateLayoutObject(source.visual.id) &&
      Math.abs((o.yaw as number) - (source.visual.yaw ?? 0)) > 1e-9
    )
      return fail();
    for (const [key, min, max] of [
      ["width", 0.25, 200],
      ["depth", 0.25, 200],
      ["scale", 0.1, 4],
      ["impactStrength", 2, 24],
    ] as const)
      if (
        o[key] !== undefined &&
        (typeof o[key] !== "number" ||
          !Number.isFinite(o[key]) ||
          (o[key] as number) < min ||
          (o[key] as number) > max)
      )
        return fail();
    if (source.mechanism && ((o.scale as number) ?? 1) > 2) return fail();
    if (
      (o.width !== undefined || o.depth !== undefined) &&
      (!source.platform || source.platform.radius !== undefined)
    )
      return fail();
    if (
      o.impactStrength !== undefined &&
      !["sweeper", "pusher"].includes(source.mechanism?.kind ?? "")
    )
      return fail();
    if (o.colliders !== undefined) o.colliders = validateColliders(o.colliders);
    ids.add(o.id);
    return { ...o } as unknown as LayoutObject;
  });
  for (const o of objects) {
    if (
      !o.deleted &&
      o.sourceId.startsWith("catalog:") &&
      layoutSource(o.sourceId)?.mechanism?.kind === "jump-pad" &&
      ids.has(`${o.id}-support`)
    )
      return fail();
  }
  let checkpoints: LayoutOverride["checkpoints"];
  if (v.checkpoints !== undefined) {
    if (
      !Array.isArray(v.checkpoints) ||
      v.checkpoints.length > cosmicSprint.checkpoints.length
    )
      return fail();
    const seen = new Set<number>();
    checkpoints = v.checkpoints.map((value: unknown) => {
      if (!value || typeof value !== "object") return fail();
      const c = value as { index: number; radius: number; enabled: boolean };
      if (
        Object.keys(c).some(
          (k) => !["index", "radius", "enabled"].includes(k),
        ) ||
        !Number.isInteger(c.index) ||
        c.index < 0 ||
        c.index >= cosmicSprint.checkpoints.length ||
        seen.has(c.index) ||
        typeof c.radius !== "number" ||
        !Number.isFinite(c.radius) ||
        c.radius < 0.25 ||
        c.radius > 10 ||
        typeof c.enabled !== "boolean"
      )
        return fail();
      seen.add(c.index);
      return { ...c };
    });
  }
  return {
    version: 3,
    arenaId: "cosmic-sprint",
    objects,
    ...(checkpoints ? { checkpoints } : {}),
  };
}
/** Trusted templates own visual/collision associations; imports can never supply arbitrary colliders. */
export function applyLayout(value: unknown): ArenaConfig {
  const layout = validateLayout(value),
    arena = structuredClone(cosmicSprint),
    visuals = [...arena.visuals!],
    platforms = [...arena.platforms],
    mechanisms = [...arena.mechanisms];
  for (const o of layout.objects) {
    const s = layoutSource(o.sourceId)!,
      source = s.visual,
      original = o.id === source.id,
      platform = s.platform,
      mechanism = s.mechanism,
      gameplayId = original ? (mechanism?.id ?? source.id) : o.id;
    if (original) {
      visuals.splice(
        visuals.findIndex((v) => v.id === source.id),
        1,
      );
      if (platform)
        platforms.splice(
          platforms.findIndex((p) => p.id === platform.id),
          1,
        );
      if (mechanism)
        mechanisms.splice(
          mechanisms.findIndex((m) => m.id === mechanism.id),
          1,
        );
    }
    if (o.deleted) continue;
    const scale = o.scale ?? 1,
      width = (o.width ?? source.width) * scale,
      depth = (o.depth ?? source.depth) * scale;
    visuals.push({
      ...source,
      id: o.id,
      x: o.x,
      y: o.y,
      z: o.z,
      yaw: o.yaw,
      width,
      depth,
      ...(mechanism ? { mechanismId: gameplayId } : {}),
    });
    if (platform)
      platforms.push({
        ...platform,
        id: gameplayId,
        x: o.x,
        y: o.y,
        z: o.z,
        yaw: o.yaw,
        width,
        depth,
        ...(platform.radius === undefined
          ? {}
          : { radius: platform.radius * scale }),
      });
    if (mechanism) {
      const m = {
        ...mechanism,
        id: gameplayId,
        x: o.x,
        y: o.y + (mechanism.y - source.y) * scale,
        z: o.z,
      };
      for (const key of [
        "width",
        "depth",
        "height",
        "length",
        "radius",
        "reach",
      ] as const)
        if (key in m) (m as unknown as Record<string, number>)[key] *= scale;
      if (o.impactStrength !== undefined) m.impactStrength = o.impactStrength;
      mechanisms.push(m);
      // New pads need their own real landing surface; original pads retain the existing level decks.
      if (o.sourceId.startsWith("catalog:") && m.kind === "jump-pad")
        platforms.push({
          id: `${gameplayId}-support`,
          x: o.x,
          y: o.y,
          z: o.z,
          width,
          depth,
        });
    }
  }
  const checkpoints = arena.checkpoints.map((cp, i) => {
    const override = layout.checkpoints?.find((c) => c.index === i);
    return override
      ? { ...cp, radius: override.radius, enabled: override.enabled }
      : cp;
  });
  return applyColliderOverrides(
    { ...arena, visuals, platforms, mechanisms, checkpoints },
    layout.objects,
  );
}

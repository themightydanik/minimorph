import type { ArenaConfig, ArenaVisual } from "./arenas";
import { cosmicSprint } from "./cosmic-sprint";
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
}
export interface LayoutOverride {
  version: 2;
  arenaId: "cosmic-sprint";
  objects: LayoutObject[];
}
export function editableVisuals(): ArenaVisual[] {
  return cosmicSprint.visuals!.filter(
    (v) => cosmicSprint.platforms.some((p) => p.id === v.id) || !!v.mechanismId,
  );
}
export function canRotateLayoutObject(sourceId: string): boolean {
  const s = layoutSource(sourceId);
  return !!s && s.category !== "mechanism";
}
export function emptyLayout(): LayoutOverride {
  return { version: 2, arenaId: "cosmic-sprint", objects: [] };
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
      (k) => !["version", "arenaId", "objects"].includes(k),
    ) ||
    ![1, 2].includes(v.version as number) ||
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
              : [...base, "width", "depth", "scale", "impactStrength"]
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
  return { version: 2, arenaId: "cosmic-sprint", objects };
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
  return { ...arena, visuals, platforms, mechanisms };
}

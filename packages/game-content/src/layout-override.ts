import type { ArenaConfig, ArenaVisual } from "./arenas";
import { cosmicSprint } from "./cosmic-sprint";
export interface LayoutObject {
  id: string;
  sourceId: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  deleted?: boolean;
}
export interface LayoutOverride {
  version: 1;
  arenaId: "cosmic-sprint";
  objects: LayoutObject[];
}
export function editableVisuals(): ArenaVisual[] {
  return cosmicSprint.visuals!.filter(
    (v) => cosmicSprint.platforms.some((p) => p.id === v.id) || !!v.mechanismId,
  );
}
export function canRotateLayoutObject(sourceId: string): boolean {
  return cosmicSprint.platforms.some((p) => p.id === sourceId);
}
export function emptyLayout(): LayoutOverride {
  return { version: 1, arenaId: "cosmic-sprint", objects: [] };
}
/** Never accept imported collider/mechanism references: derive associations from trusted source IDs. */
export function validateLayout(value: unknown): LayoutOverride {
  const fail = (): never => {
    throw new Error(
      "Invalid Cosmic Sprint layout (version, IDs, transforms or read-only object).",
    );
  };
  if (!value || typeof value !== "object") return fail();
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some(
      (k) => !["version", "arenaId", "objects"].includes(k),
    ) ||
    v.version !== 1 ||
    v.arenaId !== "cosmic-sprint" ||
    !Array.isArray(v.objects) ||
    v.objects.length > 200
  )
    return fail();
  const sources = editableVisuals(),
    ids = new Set<string>();
  const objects = v.objects.map((raw: unknown) => {
    if (!raw || typeof raw !== "object") return fail();
    const o = raw as Record<string, unknown>;
    if (
      Object.keys(o).some(
        (k) => !["id", "sourceId", "x", "y", "z", "yaw", "deleted"].includes(k),
      )
    )
      return fail();
    const source = sources.find((s) => s.id === o.sourceId);
    if (
      !source ||
      typeof o.id !== "string" ||
      (o.id !== source.id && !/^editor-[a-zA-Z0-9-]{1,70}$/.test(o.id)) ||
      ids.has(o.id) ||
      (o.deleted !== undefined && typeof o.deleted !== "boolean")
    )
      return fail();
    if (sources.some((s) => s.id === o.id && s.id !== source.id)) return fail();
    for (const k of ["x", "y", "z", "yaw"])
      if (
        typeof o[k] !== "number" ||
        !Number.isFinite(o[k]) ||
        Math.abs(o[k] as number) >
          (k === "yaw" ? Math.PI * 2 : k === "y" ? 100 : 2000)
      )
        return fail();
    if (
      !canRotateLayoutObject(source.id) &&
      Math.abs((o.yaw as number) - (source.yaw ?? 0)) > 1e-9
    )
      return fail();
    ids.add(o.id);
    return {
      id: o.id,
      sourceId: source.id,
      x: o.x as number,
      y: o.y as number,
      z: o.z as number,
      yaw: o.yaw as number,
      ...(o.deleted ? { deleted: true } : {}),
    };
  });
  return { version: 1, arenaId: "cosmic-sprint", objects };
}
/** A detached editor-only arena. Original content and navigation remain untouched. */
export function applyLayout(value: unknown): ArenaConfig {
  const layout = validateLayout(value),
    arena = structuredClone(cosmicSprint);
  const visuals = [...arena.visuals!],
    platforms = [...arena.platforms],
    mechanisms = [...arena.mechanisms];
  for (const o of layout.objects) {
    const source = cosmicSprint.visuals!.find((v) => v.id === o.sourceId)!;
    const original = o.id === o.sourceId;
    const platform = cosmicSprint.platforms.find((p) => p.id === source.id);
    const mechanism = cosmicSprint.mechanisms.find(
      (m) => m.id === source.mechanismId,
    );
    const gameplayId = original ? (mechanism?.id ?? source.id) : o.id;
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
    const dx = o.x - source.x,
      dy = o.y - source.y,
      dz = o.z - source.z;
    visuals.push({
      ...source,
      id: o.id,
      x: o.x,
      y: o.y,
      z: o.z,
      yaw: o.yaw,
      ...(mechanism ? { mechanismId: gameplayId } : {}),
    });
    if (platform)
      platforms.push({
        ...platform,
        id: gameplayId,
        x: platform.x + dx,
        y: platform.y + dy,
        z: platform.z + dz,
        yaw: o.yaw,
      });
    if (mechanism)
      mechanisms.push({
        ...mechanism,
        id: gameplayId,
        x: mechanism.x + dx,
        y: mechanism.y + dy,
        z: mechanism.z + dz,
      });
  }
  return { ...arena, visuals, platforms, mechanisms };
}

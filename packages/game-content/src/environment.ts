import type { LayoutObject, LayoutOverride } from "./layout-override";
import { layoutSource, editorCatalog } from "./editor-catalog";
export type EnvironmentAnimationType =
  | "none"
  | "rotate"
  | "bob"
  | "orbit"
  | "pulse";
export interface EnvironmentAnimation {
  type: EnvironmentAnimationType;
  speed: number;
  amplitude: number;
}
export interface EnvironmentObject {
  id: string;
  sourceId: string;
  category:
    | "planet"
    | "island"
    | "cloud"
    | "satellite"
    | "star"
    | "rocket"
    | "structure";
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  viewDistance: number;
  visible?: boolean;
  locked?: boolean;
  animation: EnvironmentAnimation;
}
export interface EnvironmentGroup {
  id: string;
  name: string;
  members: string[];
}
export function validateEnvironment(raw: unknown): EnvironmentObject[] {
  if (!Array.isArray(raw) || raw.length > 200)
    throw Error("At most 200 environment objects.");
  const ids = new Set<string>(),
    pulses = new Set<string>();
  return raw.map((v) => {
    if (!v || typeof v !== "object") throw Error("Invalid environment object.");
    const o = v as EnvironmentObject;
    if (
      Object.keys(o).some(
        (k) =>
          ![
            "id",
            "sourceId",
            "category",
            "x",
            "y",
            "z",
            "yaw",
            "scale",
            "viewDistance",
            "visible",
            "locked",
            "animation",
          ].includes(k),
      ) ||
      !/^environment-[a-zA-Z0-9-]{1,70}$/.test(o.id) ||
      ids.has(o.id) ||
      !editorCatalog.some((s) => s.visual.id === o.sourceId) ||
      ![
        "planet",
        "island",
        "cloud",
        "satellite",
        "star",
        "rocket",
        "structure",
      ].includes(o.category)
    )
      throw Error(
        "Invalid environment ID/source/category; physics is not allowed in this layer.",
      );
    for (const [key, min, max] of [
      ["x", -3000, 3000],
      ["y", -2000, 2000],
      ["z", -3000, 3000],
      ["yaw", -Math.PI * 2, Math.PI * 2],
      ["scale", 0.1, 20],
      ["viewDistance", 100, 1500],
    ] as const)
      if (
        typeof o[key] !== "number" ||
        !Number.isFinite(o[key]) ||
        o[key] < min ||
        o[key] > max
      )
        throw Error(`Invalid environment ${key}.`);
    if (
      (o.visible !== undefined && typeof o.visible !== "boolean") ||
      (o.locked !== undefined && typeof o.locked !== "boolean")
    )
      throw Error("Invalid environment flags.");
    const a = o.animation;
    if (
      !a ||
      typeof a !== "object" ||
      Object.keys(a).some((k) => !["type", "speed", "amplitude"].includes(k)) ||
      !["none", "rotate", "bob", "orbit", "pulse"].includes(a.type) ||
      !Number.isFinite(a.speed) ||
      a.speed < 0 ||
      a.speed > 3 ||
      !Number.isFinite(a.amplitude) ||
      a.amplitude < 0 ||
      a.amplitude > (a.type === "pulse" ? 2 : 100)
    )
      throw Error("Invalid environment animation.");
    if (a.type === "pulse") pulses.add(`${a.speed}:${a.amplitude}`);
    if (pulses.size > 8)
      throw Error("At most 8 shared emissive pulse settings.");
    ids.add(o.id);
    return { ...o, animation: { ...a } };
  });
}
export function validateGroups(
  raw: unknown,
  objects: LayoutObject[],
  environment: EnvironmentObject[],
): EnvironmentGroup[] {
  if (!Array.isArray(raw) || raw.length > 50)
    throw Error("At most 50 flat groups.");
  const ids = new Set<string>(),
    members = new Set<string>();
  return raw.map((value) => {
    const g = value as EnvironmentGroup;
    if (
      !g ||
      Object.keys(g).some((k) => !["id", "name", "members"].includes(k)) ||
      typeof g.id !== "string" ||
      !/^group-[a-zA-Z0-9-]{1,70}$/.test(g.id) ||
      ids.has(g.id) ||
      typeof g.name !== "string" ||
      !g.name.trim() ||
      g.name.length > 80 ||
      !Array.isArray(g.members) ||
      g.members.length < 2 ||
      g.members.length > 100
    )
      throw Error("Invalid environment group.");
    for (const id of g.members) {
      const o = objects.find((o) => o.id === id);
      const source = layoutSource(o?.sourceId ?? id);
      if (
        typeof id !== "string" ||
        members.has(id) ||
        (!environment.some((o) => o.id === id) &&
          (!source || source.category !== "decoration" || o?.deleted))
      )
        throw Error("Groups require disjoint decorative/environment members.");
      members.add(id);
    }
    ids.add(g.id);
    return { ...g, members: [...g.members] };
  });
}
export function authoringObject(
  layout: LayoutOverride,
  id: string,
): LayoutObject | EnvironmentObject | undefined {
  const env = layout.environment?.find((o) => o.id === id);
  if (env) return env;
  const found = layout.objects.find((o) => o.id === id);
  if (found) return found.deleted ? undefined : found;
  const source = layoutSource(id);
  if (!source) return;
  const v = source.visual;
  return { id, sourceId: id, x: v.x, y: v.y, z: v.z, yaw: v.yaw ?? 0 };
}
export function decorativeObject(layout: LayoutOverride, id: string) {
  const o = authoringObject(layout, id);
  return (
    !!o &&
    (id.startsWith("environment-") ||
      layoutSource(o.sourceId)?.category === "decoration")
  );
}
export function selectionPivot(layout: LayoutOverride, ids: readonly string[]) {
  const values = ids
    .map((id) => authoringObject(layout, id))
    .filter((o): o is NonNullable<typeof o> => !!o);
  if (!values.length) throw Error("Empty selection");
  return {
    x: values.reduce((n, o) => n + o.x, 0) / values.length,
    y: values.reduce((n, o) => n + o.y, 0) / values.length,
    z: values.reduce((n, o) => n + o.z, 0) / values.length,
  };
}
function replaceObject(
  layout: LayoutOverride,
  o: LayoutObject | EnvironmentObject,
) {
  if (o.id.startsWith("environment-")) {
    const i = layout.environment!.findIndex((v) => v.id === o.id);
    layout.environment![i] = o as EnvironmentObject;
  } else {
    const i = layout.objects.findIndex((v) => v.id === o.id);
    if (i < 0) layout.objects.push(o as LayoutObject);
    else layout.objects[i] = o as LayoutObject;
  }
}
export function transformSelection(
  layout: LayoutOverride,
  ids: readonly string[],
  change: { x?: number; y?: number; z?: number; yaw?: number; scale?: number },
): LayoutOverride {
  const next = structuredClone(layout),
    pivot = selectionPivot(layout, ids),
    yaw = change.yaw ?? 0,
    scale = change.scale ?? 1;
  if (
    !Number.isFinite(scale) ||
    scale <= 0 ||
    ![yaw, change.x ?? 0, change.y ?? 0, change.z ?? 0].every(Number.isFinite)
  )
    throw Error("Invalid group transform");
  for (const id of new Set(ids)) {
    const o = authoringObject(layout, id);
    if (!o || o.locked) throw Error("Unlock all selected objects first.");
    if (ids.length > 1 && !decorativeObject(layout, id))
      throw Error("Multi-selection is decorative/environment only.");
    const dx = (o.x - pivot.x) * scale,
      dz = (o.z - pivot.z) * scale;
    replaceObject(next, {
      ...o,
      x: pivot.x + dx * Math.cos(yaw) + dz * Math.sin(yaw) + (change.x ?? 0),
      y: pivot.y + (o.y - pivot.y) * scale + (change.y ?? 0),
      z: pivot.z - dx * Math.sin(yaw) + dz * Math.cos(yaw) + (change.z ?? 0),
      yaw: Math.atan2(Math.sin(o.yaw + yaw), Math.cos(o.yaw + yaw)),
      scale: (o.scale ?? 1) * scale,
    });
  }
  return next;
}
export function groupSelection(
  layout: LayoutOverride,
  ids: readonly string[],
  id: string,
): LayoutOverride {
  const unique = [...new Set(ids)];
  if (
    unique.length < 2 ||
    unique.some(
      (id) =>
        !decorativeObject(layout, id) || authoringObject(layout, id)?.locked,
    )
  )
    throw Error(
      "Select at least two unlocked decorations/environment objects.",
    );
  return {
    ...structuredClone(layout),
    groups: [
      ...(layout.groups ?? []).filter(
        (g) => !g.members.some((id) => unique.includes(id)),
      ),
      { id, name: "Environment group", members: unique },
    ],
  };
}
export function ungroupSelection(
  layout: LayoutOverride,
  ids: readonly string[],
): LayoutOverride {
  return {
    ...structuredClone(layout),
    groups: (layout.groups ?? []).filter(
      (g) => !g.members.some((id) => ids.includes(id)),
    ),
  };
}
export function duplicateSelection(
  layout: LayoutOverride,
  ids: readonly string[],
  makeId: (prefix: string) => string = (prefix) =>
    `${prefix}-${crypto.randomUUID()}`,
) {
  const next = structuredClone(layout),
    mapping = new Map<string, string>();
  for (const id of new Set(ids)) {
    const o = authoringObject(layout, id);
    if (!o || o.locked) throw Error("Unlock selected objects first.");
    const copy = {
      ...structuredClone(o),
      id: makeId(id.startsWith("environment-") ? "environment" : "editor"),
      x: o.x + 5,
    };
    mapping.set(id, copy.id);
    if (id.startsWith("environment-"))
      (next.environment ??= []).push(copy as EnvironmentObject);
    else next.objects.push(copy as LayoutObject);
  }
  for (const group of layout.groups ?? [])
    if (group.members.every((id) => mapping.has(id)))
      (next.groups ??= []).push({
        ...group,
        id: makeId("group"),
        name: `${group.name.slice(0, 70)} copy`,
        members: group.members.map((id) => mapping.get(id)!),
      });
  return { layout: next, ids: [...mapping.values()] };
}
export function deleteSelection(
  layout: LayoutOverride,
  ids: readonly string[],
): LayoutOverride {
  const next = structuredClone(layout);
  for (const id of ids) {
    const o = authoringObject(layout, id);
    if (!o || o.locked) throw Error("Unlock selected objects first.");
    if (id.startsWith("environment-"))
      next.environment = next.environment?.filter((o) => o.id !== id);
    else replaceObject(next, { ...o, deleted: true } as LayoutObject);
  }
  next.groups = (next.groups ?? [])
    .map((g) => ({
      ...g,
      members: g.members.filter((id) => !ids.includes(id)),
    }))
    .filter((g) => g.members.length > 1);
  return next;
}
export function setAuthoringMetadata(
  layout: LayoutOverride,
  id: string,
  flags: { visible?: boolean; locked?: boolean },
): LayoutOverride {
  const next = structuredClone(layout),
    o = authoringObject(layout, id);
  if (!o) throw Error("Read-only object");
  replaceObject(next, { ...o, ...flags });
  return next;
}

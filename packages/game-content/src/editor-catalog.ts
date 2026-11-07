import manifest from "../../../assets/arenas/cosmic-sprint/runtime-manifest.json";
import { cosmicSprint } from "./cosmic-sprint";
import type { ArenaVisual, ArenaObstacle } from "./arenas";
import type { Platform } from "./legacy";
export interface LayoutSource {
  visual: ArenaVisual;
  platform?: Platform;
  mechanism?: ArenaObstacle;
  category: "platform" | "mechanism" | "decoration";
  name: string;
}
const floors = new Set([
  "wide-floating-island",
  "main-floor-tile",
  "large-floor-panel",
  "circular-arena-floor",
  "landing-transition-platform",
]);
const mechanisms = new Map(
  cosmicSprint.visuals!.filter((v) => v.mechanismId).map((v) => [v.asset, v]),
);
/** Catalog references prepared data only; unsafe collision shapes remain explicitly decorative. */
export const editorCatalog: LayoutSource[] = manifest.assets.flatMap(
  (record) => {
    const asset = record.runtime.replace(".glb", ""),
      mechanismVisual = mechanisms.get(asset);
    const parts =
      mechanismVisual || record.parts.length === 1
        ? [undefined]
        : record.parts.map((_, i) => i);
    return parts.map((part) => {
      const id = `catalog:${asset}${part === undefined ? "" : `:${part}`}`;
      const visual: ArenaVisual = mechanismVisual
        ? { ...mechanismVisual, id, x: 0, y: 0, z: 0 }
        : {
            id,
            asset,
            x: 0,
            y: 0,
            z: 0,
            width: 12,
            depth: 12,
            fit: floors.has(asset) ? "floor" : "prop",
            ...(part === undefined ? {} : { part }),
          };
      const category = mechanismVisual
        ? "mechanism"
        : floors.has(asset)
          ? "platform"
          : "decoration";
      const mechanism = mechanismVisual
        ? {
            ...cosmicSprint.mechanisms.find(
              (m) => m.id === mechanismVisual.mechanismId,
            )!,
            x: 0,
            y:
              cosmicSprint.mechanisms.find(
                (m) => m.id === mechanismVisual.mechanismId,
              )!.y - mechanismVisual.y,
            z: 0,
          }
        : undefined;
      return {
        visual,
        category,
        name: `${asset}${part === undefined ? "" : ` / ${record.parts[part].name}`} · ${category === "decoration" ? "NON-COLLIDABLE decoration" : category}`,
        platform:
          category === "platform"
            ? {
                id,
                x: 0,
                y: 0,
                z: 0,
                width: 12,
                depth: 12,
                ...(asset === "circular-arena-floor" ? { radius: 6 } : {}),
              }
            : undefined,
        mechanism,
      };
    });
  },
);
export function layoutSource(id: string): LayoutSource | undefined {
  const catalog = editorCatalog.find((s) => s.visual.id === id);
  if (catalog) return catalog;
  const visual = cosmicSprint.visuals!.find((v) => v.id === id);
  if (!visual) return;
  const platform = cosmicSprint.platforms.find((p) => p.id === id),
    mechanism = cosmicSprint.mechanisms.find(
      (m) => m.id === visual.mechanismId,
    );
  if (!platform && !mechanism) return;
  return {
    visual,
    platform,
    mechanism,
    category: platform ? "platform" : "mechanism",
    name: id,
  };
}

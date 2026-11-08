import type { LayoutOverride } from "@minimorph/game-content";
import { selectionPivot } from "@minimorph/game-content";
export const GRID_STEPS = [0.25, 0.5, 1, 2] as const;
export function snapCoordinate(value: number, step?: number) {
  if (step === undefined) return value;
  if (!GRID_STEPS.some((s) => s === step) || !Number.isFinite(value))
    throw Error("Invalid grid coordinate/step.");
  const rounded = Number(
    (Math.sign(value) * Math.round(Math.abs(value) / step) * step).toFixed(8),
  );
  return Object.is(rounded, -0) ? 0 : rounded;
}
export function snapPositionEdit<T extends { x: number; y: number; z: number }>(
  before: T,
  after: T,
  step?: number,
): T {
  const next = { ...after };
  for (const key of ["x", "y", "z"] as const)
    if (before[key] !== after[key])
      next[key] = snapCoordinate(after[key], step);
  return next;
}
/** Snap only moved axes of the absolute pivot; member spacing and local colliders remain exact. */
export function snapTranslation(
  layout: LayoutOverride,
  ids: readonly string[],
  change: { x?: number; y?: number; z?: number; yaw?: number; scale?: number },
  step?: number,
) {
  const next = { ...change };
  if (
    step === undefined ||
    change.yaw !== undefined ||
    change.scale !== undefined
  )
    return next;
  const pivot = selectionPivot(layout, ids);
  for (const key of ["x", "y", "z"] as const)
    if (change[key])
      next[key] = snapCoordinate(pivot[key] + change[key]!, step) - pivot[key];
  return next;
}

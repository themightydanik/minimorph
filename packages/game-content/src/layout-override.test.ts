import { describe, expect, it } from "vitest";
import {
  applyLayout,
  emptyLayout,
  validateLayout,
  editableVisuals,
} from "./layout-override";
import { cosmicSprint } from "./cosmic-sprint";
const move = (id: string) => {
  const v = editableVisuals().find((v) => v.id === id)!;
  return {
    id,
    sourceId: id,
    x: v.x + 7,
    y: v.y + 2,
    z: v.z - 5,
    yaw: v.yaw ?? 0,
  };
};
describe("editor layout overrides", () => {
  it("moves and rotates platform art together with its real collision surface without changing default", () => {
    const before = JSON.stringify(cosmicSprint),
      o = { ...move("launch-island"), yaw: 0.7 },
      arena = applyLayout({ ...emptyLayout(), objects: [o] });
    expect(arena.visuals!.find((v) => v.id === o.id)).toMatchObject({
      x: o.x,
      y: o.y,
      z: o.z,
      yaw: 0.7,
    });
    expect(arena.platforms.find((v) => v.id === o.id)).toMatchObject({
      x: o.x,
      y: o.y,
      z: o.z,
      yaw: 0.7,
    });
    expect(JSON.stringify(cosmicSprint)).toBe(before);
    expect(applyLayout(emptyLayout())).toEqual(cosmicSprint);
  });
  it("moves every mechanism with the art, preserving hammer height and animation parameters", () => {
    for (const source of cosmicSprint.mechanisms) {
      const v = cosmicSprint.visuals!.find((v) => v.mechanismId === source.id)!,
        o = move(v.id),
        arena = applyLayout({ ...emptyLayout(), objects: [o] });
      expect(arena.mechanisms.find((m) => m.id === source.id)).toEqual({
        ...source,
        x: source.x + 7,
        y: source.y + 2,
        z: source.z - 5,
      });
      expect(arena.visuals!.find((a) => a.id === v.id)).toMatchObject({
        x: o.x,
        y: o.y,
        z: o.z,
        mechanismId: source.id,
      });
    }
  });
  it("round trips export/reset/import without changing read-only navigation", () => {
    const l = {
      ...emptyLayout(),
      objects: [move("launch-island"), move("art-park-hammer-0")],
    };
    const a = applyLayout(l),
      b = applyLayout(JSON.parse(JSON.stringify(l)));
    expect(b).toEqual(a);
    expect(b.navigation).toEqual(cosmicSprint.navigation);
    expect(b.checkpoints).toEqual(cosmicSprint.checkpoints);
  });
  it("duplicates and deletes linked art/collision/mechanisms by stable IDs", () => {
    for (const id of ["launch-island", "art-garden-pad-a"]) {
      const o = move(id),
        copy = { ...o, id: "editor-copy" },
        a = applyLayout({
          ...emptyLayout(),
          objects: [{ ...o, deleted: true }, copy],
        });
      expect(a.visuals!.some((v) => v.id === id)).toBe(false);
      expect(a.visuals!.find((v) => v.id === copy.id)).toMatchObject({
        x: copy.x,
      });
      expect(
        [...a.platforms, ...a.mechanisms].filter((v) => v.id === copy.id),
      ).toHaveLength(1);
      const art = a.visuals!.find((v) => v.id === copy.id)!;
      if (art.mechanismId) expect(art.mechanismId).toBe(copy.id);
    }
  });
  it("rejects invalid imports atomically, read-only IDs and unsupported rotations", () => {
    const o = move("art-turbo-piston-a");
    for (const input of [
      null,
      {},
      { ...emptyLayout(), version: 2 },
      { ...emptyLayout(), arenaId: "orbit-chaos" },
      { ...emptyLayout(), objects: [{ ...o, x: Infinity }] },
      { ...emptyLayout(), objects: [o, o] },
      { ...emptyLayout(), objects: [{ ...o, sourceId: "finish-gate" }] },
      { ...emptyLayout(), objects: [{ ...o, yaw: 0 }] },
      { ...emptyLayout(), objects: [{ ...o, mechanismId: "forged" }] },
    ])
      expect(() => validateLayout(input)).toThrow();
  });
});

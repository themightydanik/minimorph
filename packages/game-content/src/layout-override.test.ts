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
      { ...emptyLayout(), version: 3 },
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

it("migrates v0.1 exports and round trips catalog instances and gameplay properties", () => {
  const old = {
    version: 1,
    arenaId: "cosmic-sprint",
    objects: [move("launch-island")],
  };
  expect(validateLayout(old).version).toBe(2);
  const object = {
    id: "editor-new",
    sourceId: "catalog:giant-padded-hammer",
    x: 4,
    y: 0,
    z: 2,
    yaw: Math.PI / 2,
    scale: 1.5,
    impactStrength: 20,
  };
  const layout = { ...emptyLayout(), objects: [object] };
  expect(validateLayout(JSON.parse(JSON.stringify(layout)))).toEqual(layout);
  const arena = applyLayout(layout);
  expect(arena.mechanisms.find((m) => m.id === object.id)).toMatchObject({
    impactStrength: 20,
    length: 7.6 * 1.5,
  });
  expect(() =>
    validateLayout({
      ...emptyLayout(),
      objects: [
        {
          id: "editor-pad",
          sourceId: "catalog:inflatable-bounce-pad",
          x: 0,
          y: 0,
          z: 0,
          yaw: 0,
        },
        {
          id: "editor-pad-support",
          sourceId: "catalog:main-floor-tile",
          x: 0,
          y: 0,
          z: 0,
          yaw: 0,
        },
      ],
    }),
  ).toThrow();
  for (const patch of [
    { scale: 0 },
    { scale: 3 },
    { impactStrength: 25 },
    { sourceId: "catalog:unknown" },
    { width: 14 },
  ])
    expect(() =>
      validateLayout({ ...layout, objects: [{ ...object, ...patch }] }),
    ).toThrow();
});
it("scales visual and collision dimensions together, preserving separate decoration and pad support", () => {
  const arena = applyLayout({
    ...emptyLayout(),
    objects: [
      { ...move("launch-island"), width: 16, depth: 10, scale: 1.5 },
      {
        id: "editor-disc",
        sourceId: "catalog:rotating-carousel",
        x: 4,
        y: 2,
        z: 3,
        yaw: 0,
        scale: 2,
      },
      {
        id: "editor-pad",
        sourceId: "catalog:inflatable-bounce-pad",
        x: 1,
        y: 0,
        z: 0,
        yaw: 0,
      },
      {
        id: "editor-decor",
        sourceId: "catalog:curved-platform-ramp-kit:0",
        x: 0,
        y: 0,
        z: 0,
        yaw: 0.2,
        scale: 2,
      },
    ],
  });
  for (const id of ["launch-island", "editor-disc"]) {
    const visual = arena.visuals!.find((v) => v.id === id)!;
    const body =
      arena.platforms.find((p) => p.id === id) ??
      arena.mechanisms.find((m) => m.id === id)!;
    expect(body.x).toBe(visual.x);
    expect(body.y).toBe(visual.y);
    if ("radius" in body) expect(body.radius! * 2).toBe(visual.width);
    else
      expect(body).toMatchObject({ width: visual.width, depth: visual.depth });
  }
  expect(arena.platforms.find((p) => p.id === "launch-island")).toMatchObject({
    width: 24,
    depth: 15,
  });
  expect(
    arena.platforms.find((p) => p.id === "editor-pad-support"),
  ).toMatchObject({ x: 1, y: 0, width: 5, depth: 5 });
  expect(
    [...arena.platforms, ...arena.mechanisms].some(
      (p) => p.id === "editor-decor",
    ),
  ).toBe(false);
});

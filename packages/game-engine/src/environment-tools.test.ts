import { it, expect } from "vitest";
import {
  emptyLayout,
  validateLayout,
  applyLayout,
  groupSelection,
  ungroupSelection,
  duplicateSelection,
  deleteSelection,
  transformSelection,
  setAuthoringMetadata,
  validatePublication,
  publishedLayoutRevision,
} from "@minimorph/game-content";
import type {
  EnvironmentObject,
  LayoutOverride,
} from "@minimorph/game-content";
import published from "../../game-content/src/published/cosmic-sprint.json";
import { EditorHistory } from "./editor-history";
import { sampleEnvironmentMotion } from "./environment-motion";
const env = (id: string, x: number): EnvironmentObject => ({
  id,
  sourceId: "catalog:space-decoration-kit:0",
  category: "planet",
  x,
  y: 0,
  z: 0,
  yaw: 0,
  scale: 1,
  viewDistance: 600,
  animation: { type: "none", speed: 0.25, amplitude: 1 },
});
const draft = (): LayoutOverride => ({
  ...emptyLayout(),
  environment: [env("environment-a", 0), env("environment-b", 10)],
});
it("moves/rotates/scales flat groups atomically, duplicates/ungroups and coalesces drag Undo/Redo", () => {
  const grouped = validateLayout(
    groupSelection(draft(), ["environment-a", "environment-b"], "group-test"),
  );
  const moved = validateLayout(
    transformSelection(grouped, ["environment-a", "environment-b"], {
      x: 3,
      y: 2,
      z: -2,
      yaw: Math.PI / 2,
      scale: 2,
    }),
  );
  expect(moved.environment![0]).toMatchObject({ y: 2, z: 8, scale: 2 });
  expect(moved.environment![0].x).toBeCloseTo(8);
  expect(moved.environment![1].z).toBeCloseTo(-12);
  const h = new EditorHistory();
  h.record(grouped, moved);
  expect(h.undo(moved)).toEqual(grouped);
  expect(h.redo(grouped)).toEqual(moved);
  h.begin(moved);
  let end = moved;
  for (let i = 0; i < 30; i++) {
    const next = transformSelection(moved, ["environment-a", "environment-b"], {
      x: i,
    });
    h.record(end, next);
    end = next;
  }
  h.end(end);
  expect(h.undo(end)).toEqual(moved);
  let serial = 0;
  const copy = duplicateSelection(
    grouped,
    ["environment-a", "environment-b"],
    (prefix) => `${prefix}-${++serial}`,
  );
  expect(validateLayout(copy.layout).groups).toHaveLength(2);
  expect(copy.ids).toHaveLength(2);
  const removed = validateLayout(deleteSelection(copy.layout, copy.ids));
  expect(removed.environment).toHaveLength(2);
  expect(ungroupSelection(removed, ["environment-a"]).groups).toHaveLength(0);
});
it("round trips environment/groups/flags while keeping bodies and published compatibility unchanged", () => {
  const baseline = applyLayout(emptyLayout());
  const value = groupSelection(
    draft(),
    ["environment-a", "environment-b"],
    "group-a",
  );
  value.environment![0].animation = { type: "orbit", speed: 0.2, amplitude: 8 };
  value.environment![1].visible = false;
  value.environment![1].locked = true;
  const restored = validateLayout(JSON.parse(JSON.stringify(value))),
    arena = applyLayout(restored);
  expect(restored).toEqual(value);
  expect(arena.platforms).toEqual(baseline.platforms);
  expect(arena.mechanisms).toEqual(baseline.mechanisms);
  expect(arena.environment).toHaveLength(2);
  expect(validatePublication({ ...published, layout: value }).revision).toBe(
    publishedLayoutRevision,
  );
  expect(publishedLayoutRevision).toBe("95476a6fcdcc57ce");
  const flags = setAuthoringMetadata(emptyLayout(), "launch-island", {
    visible: false,
    locked: true,
  });
  expect(applyLayout(flags).platforms).toEqual(baseline.platforms);
  expect(validatePublication({ ...published, layout: flags }).revision).toBe(
    publishedLayoutRevision,
  );
  for (const version of [1, 2, 3])
    expect(
      validateLayout({ version, arenaId: "cosmic-sprint", objects: [] })
        .version,
    ).toBe(4);
  expect(() =>
    validateLayout({
      ...value,
      environment: [{ ...env("environment-x", 0), colliders: [] }],
    }),
  ).toThrow();
});
it("validates bounded animation settings and samples presentation motion without changing authoring state", () => {
  const source = env("environment-a", 0),
    before = structuredClone(source);
  const out = { x: 0, y: 0, z: 0, yaw: 0, pulse: 0 };
  for (const type of ["none", "rotate", "bob", "orbit", "pulse"] as const) {
    const a = { type, speed: 0.5, amplitude: 1 };
    expect(sampleEnvironmentMotion(a, 2, out)).toBe(out);
    expect(Object.values(out).every(Number.isFinite)).toBe(true);
  }
  expect(source).toEqual(before);
  expect(
    sampleEnvironmentMotion({ type: "rotate", speed: 0.5, amplitude: 1 }, 2)
      .yaw,
  ).toBe(1);
  expect(
    sampleEnvironmentMotion({ type: "orbit", speed: 0.5, amplitude: 1 }, 0),
  ).toMatchObject({ x: 0, z: 0 });
  for (const animation of [
    { type: "physics", speed: 1, amplitude: 1 },
    { type: "bob", speed: -1, amplitude: 1 },
    { type: "pulse", speed: 1, amplitude: 3 },
  ])
    expect(() =>
      validateLayout({
        ...emptyLayout(),
        environment: [{ ...source, animation }],
      }),
    ).toThrow();
});
it("keeps decorative owner-local colliders intact through group transforms and blocks locked movement", () => {
  const local = {
    id: "body",
    kind: "surface" as const,
    x: 2,
    y: 1,
    z: 3,
    yaw: 0.3,
    width: 4,
    depth: 5,
    height: 0.1,
  };
  const objects = [
    {
      id: "editor-a",
      sourceId: "catalog:space-decoration-kit:0",
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      colliders: [local],
    },
    {
      id: "editor-b",
      sourceId: "catalog:space-decoration-kit:1",
      x: 10,
      y: 0,
      z: 0,
      yaw: 0,
    },
  ];
  const value = { ...emptyLayout(), objects },
    moved = validateLayout(
      transformSelection(value, ["editor-a", "editor-b"], {
        yaw: Math.PI / 2,
        scale: 2,
      }),
    ),
    arena = applyLayout(moved),
    body = arena.platforms.find((p) => p.id === "editor-a::body")!;
  expect(moved.objects[0].colliders).toEqual([local]);
  expect(body.x).toBeCloseTo(11);
  expect(body.z).toBeCloseTo(6);
  expect(body.y).toBe(2);
  expect(body.width).toBe(8);
  expect(body.yaw).toBeCloseTo(0.3 + Math.PI / 2);
  const locked = setAuthoringMetadata(value, "editor-a", { locked: true });
  expect(() =>
    transformSelection(locked, ["editor-a", "editor-b"], { x: 10 }),
  ).toThrow(/Unlock/);
  expect(locked.objects[0].x).toBe(0);
});

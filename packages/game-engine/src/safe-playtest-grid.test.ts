import { it, expect } from "vitest";
import {
  getArena,
  applyLayout,
  emptyLayout,
  defaultColliders,
  transformSelection,
  groupSelection,
  colliderTransform,
  validatePublication,
  publishedLayoutRevision,
} from "@minimorph/game-content";
import type { ArenaConfig, ArenaObstacle } from "@minimorph/game-content";
import published from "../../game-content/src/published/cosmic-sprint.json";
import {
  resolvePlaytestStart,
  pickPlaytestSurface,
  createLocalPlaytestState,
} from "./playtest-start";
import {
  snapCoordinate,
  snapTranslation,
  snapPositionEdit,
  GRID_STEPS,
} from "./editor-grid";
import { EditorHistory } from "./editor-history";
import {
  stepArenaPlayer,
  FIXED_STEP,
  idleInput,
  beginRecovery,
} from "./physics";
const fixture = (): ArenaConfig => ({
  ...getArena("cosmic-sprint"),
  spawn: { x: 0, y: 0, z: 0 },
  finish: { x: 30, y: 0, z: 30, radius: 1 },
  checkpoints: [
    { x: 2, y: 0, z: 0, radius: 0.5 },
    { x: 4, y: 0, z: 0, radius: 0.5, enabled: false },
  ],
  platforms: [{ id: "floor", x: 0, y: 0, z: 0, width: 20, depth: 20 }],
  mechanisms: [],
  obstacles: [],
  visuals: [],
  colliderOwners: {},
});
const ready = (
  a: ArenaConfig,
  mode: Parameters<typeof resolvePlaytestStart>[1],
) => {
  const r = resolvePlaytestStart(a, mode);
  if (!r.valid) throw Error(r.message);
  return r.start;
};
it("supports default/checkpoint/selected compiled support and exact ray-picked points", () => {
  const a = fixture();
  expect(ready(a, { mode: "default" }).point).toEqual(a.spawn);
  expect(ready(a, { mode: "checkpoint", index: 0 }).checkpoint).toBe(1);
  expect(ready(a, { mode: "selection", objectId: "floor" }).supportId).toBe(
    "floor",
  );
  const picked = pickPlaytestSurface(
    a,
    { x: 3, y: 10, z: 2 },
    { x: 0, y: -1, z: 0 },
  )!;
  expect(picked.point).toEqual({ x: 3, y: 0, z: 2 });
  expect(ready(a, { mode: "point", ...picked }).point).toEqual(picked.point);
  expect(
    pickPlaytestSurface(a, { x: 30, y: 10, z: 30 }, { x: 0, y: -1, z: 0 }),
  ).toBeUndefined();
});
it("rejects decorations, disabled checkpoints, unsupported heights, edges and ambiguous supports", () => {
  const a = fixture();
  expect(
    resolvePlaytestStart(a, { mode: "selection", objectId: "decor" }).valid,
  ).toBe(false);
  expect(resolvePlaytestStart(a, { mode: "checkpoint", index: 1 }).valid).toBe(
    false,
  );
  for (const point of [
    { x: 0, y: 2, z: 0 },
    { x: 0, y: -7, z: 0 },
    { x: 9.9, y: 0, z: 0 },
  ])
    expect(
      resolvePlaytestStart(a, { mode: "point", point, supportId: "floor" })
        .valid,
    ).toBe(false);
  for (const kind of [
    "moving-platform",
    "disappearing-platform",
    "rotating-disc",
    "bounce-platform",
    "collapse-platform",
  ] as const) {
    const m =
      kind === "moving-platform"
        ? { kind, axis: "y" as const, amplitude: 1 }
        : kind === "disappearing-platform"
          ? { kind, onFor: 1, warning: 0.2 }
          : kind === "rotating-disc"
            ? { kind, radius: 3 }
            : kind === "bounce-platform"
              ? { kind, amplitude: 1, boost: 10 }
              : { kind, delay: 1, warning: 0.2, resetAfter: 3 };
    a.mechanisms = [
      {
        id: "dynamic",
        x: 0,
        y: 0,
        z: 0,
        ...(kind === "rotating-disc" ? {} : { width: 4, depth: 4 }),
        period: 4,
        ...m,
      } as ArenaObstacle,
    ];
    expect(
      resolvePlaytestStart(a, { mode: "selection", objectId: "dynamic" }).valid,
    ).toBe(false);
    expect(resolvePlaytestStart(a, { mode: "default" }).valid).toBe(false);
  }
});
it("rejects automatic pads/turbo, future hazard sweeps, solids and insufficient headroom", () => {
  const a = fixture();
  a.mechanisms = [
    {
      id: "pad",
      kind: "jump-pad",
      x: 0,
      y: 0,
      z: 0,
      width: 2,
      depth: 2,
      period: 1,
      boost: 10,
    },
  ];
  expect(resolvePlaytestStart(a, { mode: "default" }).valid).toBe(false);
  a.mechanisms = [
    {
      id: "turbo",
      kind: "conveyor",
      surface: false,
      x: 0,
      y: 0,
      z: 0,
      width: 2,
      depth: 2,
      velocityX: 0,
      velocityZ: 0,
      period: 1,
      turboMultiplier: 1.5,
    },
  ];
  expect(resolvePlaytestStart(a, { mode: "default" }).valid).toBe(false);
  a.mechanisms = [
    {
      id: "hammer",
      kind: "sweeper",
      x: 2,
      y: 0,
      z: 0,
      width: 0.3,
      length: 6,
      height: 0.5,
      period: 4,
    },
  ];
  expect(resolvePlaytestStart(a, { mode: "default" }).valid).toBe(false);
  a.mechanisms = [
    {
      id: "gate",
      kind: "timed-gate",
      x: 0,
      y: 0,
      z: 0,
      width: 4,
      depth: 1,
      height: 2,
      period: 4,
      warning: 1,
      activeFor: 1,
    },
  ];
  expect(resolvePlaytestStart(a, { mode: "default" }).valid).toBe(false);
  a.mechanisms = [
    {
      id: "box",
      kind: "solid-box",
      x: 0,
      y: 1,
      z: 0,
      width: 4,
      depth: 4,
      height: 2,
      period: 1,
    },
  ];
  expect(resolvePlaytestStart(a, { mode: "default" }).valid).toBe(false);
  a.mechanisms = [];
  a.platforms = [
    ...a.platforms,
    { id: "roof", x: 0, y: 1, z: 0, width: 5, depth: 5 },
  ];
  expect(resolvePlaytestStart(a, { mode: "default" }).valid).toBe(false);
});
it("resolves transformed owner-local colliders rather than GLB centres", () => {
  const o = {
    id: "editor-floor",
    sourceId: "catalog:main-floor-tile",
    x: 60,
    y: 3,
    z: 50,
    yaw: Math.PI / 2,
    scale: 2,
    colliders: [
      {
        ...defaultColliders("catalog:main-floor-tile")[0],
        x: 2,
        width: 4,
        depth: 4,
      },
    ],
  };
  const a = applyLayout({ ...emptyLayout(), objects: [o] }),
    expected = colliderTransform(o, o.colliders[0]),
    start = ready(a, { mode: "selection", objectId: o.id });
  expect(start.point).toEqual({ x: expected.x, y: expected.y, z: expected.z });
});
it("creates clean initial/Restart state and keeps real respawn semantics and world identity", () => {
  const a = fixture(),
    before = structuredClone(a),
    start = ready(a, {
      mode: "point",
      point: { x: 6, y: 0, z: 6 },
      supportId: "floor",
    }),
    initial = createLocalPlaytestState(a, start);
  const p = createLocalPlaytestState(a, start);
  Object.assign(p, {
    vx: 8,
    vy: 3,
    action: "slide",
    turboTime: 5,
    knockX: 12,
    diveCooldown: 1,
    elapsed: 9,
  });
  expect(createLocalPlaytestState(a, start)).toEqual(initial);
  expect(initial).toMatchObject({
    vx: 0,
    vy: 0,
    vz: 0,
    action: "normal",
    turboTime: 0,
    knockX: 0,
    diveCooldown: 0,
    elapsed: 0,
    checkpoint: 0,
  });
  beginRecovery(p, "fall");
  for (let i = 0; i < 60; i++) stepArenaPlayer(p, idleInput, FIXED_STEP, a);
  expect(p.x).toBe(a.spawn.x);
  expect(p.z).toBe(a.spawn.z);
  const cp = createLocalPlaytestState(
    a,
    ready(a, { mode: "checkpoint", index: 0 }),
  );
  beginRecovery(cp, "fall");
  for (let i = 0; i < 60; i++) stepArenaPlayer(cp, idleInput, FIXED_STEP, a);
  expect(cp.x).toBe(2);
  expect(a).toEqual(before);
  expect(validatePublication(published).revision).toBe(publishedLayoutRevision);
  expect(publishedLayoutRevision).toBe("95476a6fcdcc57ce");
});
it("rounds all supported grids symmetrically without drift or automatic edits on enable", () => {
  for (const step of GRID_STEPS) {
    expect(snapCoordinate(step * 0.5, step)).toBe(step);
    expect(snapCoordinate(-step * 0.5, step)).toBe(-step);
    expect(snapCoordinate(snapCoordinate(-1.134, step), step)).toBe(
      snapCoordinate(-1.134, step),
    );
  }
  expect(snapCoordinate(0.34)).toBe(0.34);
  expect(Object.is(snapCoordinate(-0.01, 0.25), -0)).toBe(false);
  expect(() => snapCoordinate(1, 0.3)).toThrow();
  const before = { x: 0.13, y: 0.27, z: 0.31, yaw: 0.2 },
    after = snapPositionEdit(before, { ...before, x: 1.12 }, 0.5);
  expect(after).toEqual({ ...before, x: 1 });
  expect(snapPositionEdit(before, { ...before, yaw: 1 }, 1)).toEqual({
    ...before,
    yaw: 1,
  });
});
it("snaps group pivot from drag origin in one history transaction while preserving local colliders and spacing", () => {
  const c = defaultColliders("catalog:main-floor-tile")[0];
  const raw = {
    ...emptyLayout(),
    objects: [
      {
        id: "editor-a",
        sourceId: "catalog:space-decoration-kit:0",
        x: 0.2,
        y: 0,
        z: 0,
        yaw: 0,
        colliders: [c],
      },
      {
        id: "editor-b",
        sourceId: "catalog:space-decoration-kit:0",
        x: 3.2,
        y: 0,
        z: 0,
        yaw: 0,
      },
    ],
  };
  const ids = ["editor-a", "editor-b"],
    base = groupSelection(raw, ids, "group-test"),
    h = new EditorHistory();
  let value = base;
  h.begin(base);
  for (const x of [0.12, 0.5, 0.9, 1.1, 1.24]) {
    const next = transformSelection(
      base,
      ids,
      snapTranslation(base, ids, { x }, 0.5),
    );
    h.record(value, next);
    value = next;
  }
  h.end(value);
  expect(value.objects[1].x - value.objects[0].x).toBeCloseTo(3);
  expect(value.objects[0].colliders).toEqual([c]);
  expect(h.undo(value)).toEqual(base);
  expect(h.canUndo).toBe(false);
  expect(h.redo(base)).toEqual(value);
  expect(snapTranslation(base, ids, { yaw: 0.4 }, 1)).toEqual({ yaw: 0.4 });
  expect(snapTranslation(base, ids, { scale: 2 }, 1)).toEqual({ scale: 2 });
});
it("repeated isolated state creation never mutates the draft or consumes editor history", () => {
  const a = fixture(),
    draft = emptyLayout(),
    h = new EditorHistory(),
    changed = {
      ...draft,
      objects: [
        {
          id: "editor-a",
          sourceId: "catalog:main-floor-tile",
          x: 40,
          y: 0,
          z: 0,
          yaw: 0,
        },
      ],
    };
  h.record(draft, changed);
  const before = structuredClone(changed);
  for (let i = 0; i < 10; i++) {
    const p = createLocalPlaytestState(a, ready(a, { mode: "default" }));
    stepArenaPlayer(p, idleInput, FIXED_STEP, a);
    expect(p.elapsed).toBe(FIXED_STEP);
  }
  expect(changed).toEqual(before);
  expect(h.undo(changed)).toEqual(draft);
  expect(h.redo(draft)).toEqual(changed);
});

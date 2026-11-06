import { expect, it } from "vitest";
import { getArena } from "@minimorph/game-content";
import {
  createPlayer,
  stepArenaPlayer,
  FIXED_STEP,
  ArenaRuntime,
  sampleMechanism,
  surfaceContains,
  courseProgress,
} from "@minimorph/game-simulation";
import { recordPark } from "../../../tests/helpers/park-pilot";
const arena = getArena("cosmic-sprint");
it("is a five-zone spatial park, with genuinely divergent routes rejoining the same checkpoint", () => {
  expect(arena.sections).toHaveLength(5);
  expect(arena.navigation).toBeDefined();
  const routes = arena.navigation!.filter((r) => r.stage === 2),
    [turbo, garden] = routes;
  expect(turbo.points[0]).toEqual(garden.points[0]);
  expect(turbo.points.at(-1)).toEqual(garden.points.at(-1));
  expect(
    Math.max(...turbo.points.map((p) => p.x)) -
      Math.min(...garden.points.map((p) => p.x)),
  ).toBeGreaterThan(90);
  expect(arena.platforms.some((p) => Math.abs(p.yaw ?? 0) > 1)).toBe(true);
  for (const choice of ["easy", "hard"] as const) {
    const run = recordPark(arena, choice);
    expect(run.state.won).toBe(true);
    expect(run.state.falls).toBe(0);
    expect(run.state.obstacleHits).toBe(0);
    expect(run.state.checkpoint).toBe(6);
    expect(run.supports).toContain("carousel-a");
    expect(run.supports).toContain("carousel-b");
    expect(run.state.elapsed).toBeGreaterThanOrEqual(60);
    expect(run.state.elapsed).toBeLessThan(90);
    if (choice === "easy") {
      expect(run.events).toContain("pad");
      expect(run.supports).toContain("garden-island-0");
    } else expect(run.supports).toContain("turbo-north");
  }
  expect(
    recordPark(arena, "easy").state.elapsed -
      recordPark(arena, "hard").state.elapsed,
  ).toBeGreaterThan(6);
});
it("oriented floor containment matches its rendered transform instead of filling the diagonal bounding box", () => {
  const p = arena.platforms.find((p) => p.id === "turbo-lane-2")!;
  expect(surfaceContains(p, p.x, p.z)).toBe(true);
  const yaw = p.yaw!,
    dx = Math.sin(yaw) * p.depth * 0.4,
    dz = Math.cos(yaw) * p.depth * 0.4;
  expect(surfaceContains(p, p.x + dx, p.z + dz)).toBe(true);
  expect(
    surfaceContains(
      p,
      p.x + Math.cos(yaw) * p.width,
      p.z - Math.sin(yaw) * p.width,
    ),
  ).toBe(false);
});
it("both authored carousels carry an off-axis passenger a full turn, release jumping and remain deterministic after snapshot restoration", () => {
  for (const disc of arena.mechanisms.filter(
    (o) => o.kind === "rotating-disc",
  )) {
    const isolated = {
      ...arena,
      navigation: undefined,
      platforms: [],
      mechanisms: [disc],
      checkpoints: [],
      finish: { x: 999, y: 0, z: 999, radius: 1 },
      spawn: { x: disc.x + 3, y: disc.y, z: disc.z },
    };
    const state = createPlayer(isolated),
      world = new ArenaRuntime(isolated),
      start = { x: state.x, z: state.z };
    for (let i = 0; i < Math.round(disc.period / FIXED_STEP); i++)
      stepArenaPlayer(
        state,
        { x: 0, z: 0, jump: false },
        FIXED_STEP,
        isolated,
        world,
      );
    expect(state.grounded).toBe(true);
    expect(state.supportId).toBe(disc.id);
    expect(state.x).toBeCloseTo(start.x, 7);
    expect(state.z).toBeCloseTo(start.z, 7);
    const restored = structuredClone(state),
      fresh = new ArenaRuntime(isolated);
    for (let i = 0; i < 120; i++) {
      const input = { x: 0.4, z: -0.6, jump: i === 0 };
      stepArenaPlayer(state, input, FIXED_STEP, isolated, world);
      stepArenaPlayer(restored, input, FIXED_STEP, isolated, fresh);
      expect(restored).toEqual(state);
      if (i === 12) expect(state.supportId).toBeNull();
    }
  }
});
it("all three hammer heads and both piston strokes produce the same directional knockback in shared simulation", () => {
  for (const o of arena.mechanisms.filter(
    (o) => o.kind === "sweeper" || o.kind === "pusher",
  )) {
    const time =
      o.kind === "pusher" ? o.period - o.activeFor * 0.5 - (o.phase ?? 0) : 0.4;
    const pose = sampleMechanism(o, time),
      at =
        o.kind === "sweeper"
          ? {
              x: pose.x + Math.cos(pose.angle) * 2.5,
              y: 0,
              z: pose.z + Math.sin(pose.angle) * 2.5,
            }
          : { x: pose.x, y: 0, z: pose.z };
    const isolated = {
      ...arena,
      navigation: undefined,
      checkpoints: [],
      spawn: at,
      platforms: [{ ...at, width: 50, depth: 50 }],
      mechanisms: [o],
    };
    const state = createPlayer(isolated);
    state.elapsed = time - FIXED_STEP;
    const peer = structuredClone(state);
    stepArenaPlayer(state, { x: 0, z: 0, jump: false }, FIXED_STEP, isolated);
    stepArenaPlayer(peer, { x: 0, z: 0, jump: false }, FIXED_STEP, isolated);
    expect(state.lastHazard).toBe(o.id);
    expect(state.obstacleHits).toBe(1);
    expect(Math.hypot(state.knockX, state.knockZ)).toBeCloseTo(8);
    expect(state).toEqual(peer);
    if (o.kind === "pusher") expect(Math.sign(state.knockX)).toBe(-o.side);
  }
});
it("garden launches and both conveyor directions are physical, bounded and release when airborne", () => {
  for (const o of arena.mechanisms.filter(
    (o) => o.kind === "jump-pad" || o.kind === "conveyor",
  )) {
    const isolated = {
        ...arena,
        navigation: undefined,
        checkpoints: [],
        spawn: { x: o.x, y: o.y, z: o.z },
        platforms: [{ x: o.x, y: o.y, z: o.z, width: 50, depth: 50 }],
        mechanisms: [o],
      },
      state = createPlayer(isolated);
    stepArenaPlayer(state, { x: 0, z: 0, jump: false }, FIXED_STEP, isolated);
    if (o.kind === "jump-pad") {
      expect(state.vy).toBe(o.boost);
      expect(state.lastEvent).toBe("pad");
      expect(state.grounded).toBe(false);
    } else {
      const before = { x: state.x, z: state.z };
      stepArenaPlayer(state, { x: 0, z: 0, jump: false }, FIXED_STEP, isolated);
      expect(state.x - before.x).toBeCloseTo(o.velocityX * FIXED_STEP, 9);
      expect(state.z - before.z).toBeCloseTo(o.velocityZ * FIXED_STEP, 9);
      stepArenaPlayer(state, { x: 0, z: 0, jump: true }, FIXED_STEP, isolated);
      const x = state.x,
        z = state.z;
      stepArenaPlayer(state, { x: 0, z: 0, jump: false }, FIXED_STEP, isolated);
      expect(state.x).toBe(x);
      expect(state.z).toBe(z);
    }
  }
});
it("spatial progress distinguishes branches and cannot skip ordered checkpoints or finish from below", () => {
  const state = createPlayer(arena);
  Object.assign(state, { checkpoint: 2, x: 76, z: -92 });
  const turbo = courseProgress(arena, state);
  state.x = -24;
  state.z = -92;
  const garden = courseProgress(arena, state);
  expect(turbo).toBeGreaterThan(2 / 7);
  expect(turbo).toBeLessThan(3 / 7);
  expect(garden).toBeGreaterThan(2 / 7);
  expect(garden).toBeLessThan(3 / 7);
  Object.assign(state, arena.finish, { checkpoint: 0 });
  stepArenaPlayer(state, { x: 0, z: 0, jump: false }, FIXED_STEP, arena);
  expect(state.won).toBe(false);
});
it("spatial standings advance along an eastbound branch and equal finish times retain the authoritative ID tie-break", async () => {
  const { compareRaceParticipants } = await import(
    "@minimorph/game-simulation"
  );
  const back = {
    id: "a-back",
    finishTime: null as number | null,
    state: { ...createPlayer(arena), checkpoint: 2, x: 40, z: -54 },
  };
  const front = {
    id: "z-front",
    finishTime: null as number | null,
    state: { ...createPlayer(arena), checkpoint: 2, x: 50, z: -54 },
  };
  expect(courseProgress(arena, front.state)).toBeGreaterThan(
    courseProgress(arena, back.state),
  );
  expect(
    [back, front]
      .sort((a, b) => compareRaceParticipants(a, b, arena))
      .map((p) => p.id),
  ).toEqual(["z-front", "a-back"]);
  front.finishTime = 12;
  back.finishTime = 12;
  expect(
    [front, back]
      .sort((a, b) => compareRaceParticipants(a, b, arena))
      .map((p) => p.id),
  ).toEqual(["a-back", "z-front"]);
  expect([back, front].every((p) => p.finishTime === 12)).toBe(true);
});

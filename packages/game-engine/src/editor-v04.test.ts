import { it, expect } from "vitest";
import {
  applyLayout,
  emptyLayout,
  defaultColliders,
  validateLayout,
  getArena,
  publishedCosmicSprint,
  publishedLayoutRevision,
  validatePublication,
  layoutFingerprint,
} from "@minimorph/game-content";
import { cosmicSprint } from "../../game-content/src/cosmic-sprint";
import published from "../../game-content/src/published/cosmic-sprint.json";
import { createPlayer, stepArenaPlayer, FIXED_STEP } from "./physics";
import { LevelManager } from "./levels";
import { PresentationEvents } from "./presentation-events";
import { Room } from "../../../apps/multiplayer-server/src/rooms";
import { MatchService } from "../../../apps/multiplayer-server/src/matches";
import type { ServerMessage } from "@minimorph/multiplayer-protocol";
import {
  WORLD_REVISION,
  validRoomSnapshot,
} from "@minimorph/multiplayer-protocol";
const idle = { x: 0, z: 0, jump: false };
it("parent-local collider edit changes real Playtest landing, never the GLB, and scales with its owner", () => {
  const c = {
    ...defaultColliders("launch-island")[0],
    x: 40,
    width: 4,
    depth: 4,
  };
  const o = {
    id: "launch-island",
    sourceId: "launch-island",
    x: 0,
    y: 0,
    z: 12,
    yaw: 0,
    colliders: [c],
  };
  const arena = applyLayout({ ...emptyLayout(), objects: [o] }),
    levels = new LevelManager(arena.id, "race", arena);
  expect(levels.current.visuals!.find((v) => v.id === o.id)).toMatchObject({
    x: 0,
    z: 12,
    width: 32,
  });
  const floor = levels.current.platforms.find((p) => p.id === o.id)!;
  expect(floor).toMatchObject({ x: 40, z: 12, width: 4 });
  const isolated = {
      ...levels.current,
      spawn: { x: 40, y: 4, z: 12 },
      platforms: [floor],
      mechanisms: [],
      checkpoints: [],
      finish: { x: 100, y: 0, z: 100, radius: 1 },
    },
    p = createPlayer(isolated);
  p.grounded = false;
  for (let i = 0; i < 120; i++) stepArenaPlayer(p, idle, FIXED_STEP, isolated);
  expect(p.grounded).toBe(true);
  expect(p.y).toBe(0);
  const moved = applyLayout({
    ...emptyLayout(),
    objects: [{ ...o, x: 5, scale: 2 }],
  });
  expect(moved.platforms.find((p) => p.id === o.id)).toMatchObject({
    x: 85,
    width: 8,
  });
  expect(moved.visuals!.find((v) => v.id === o.id)).toMatchObject({
    x: 5,
    width: 64,
  });
});
it("turbo uses the actual trigger, caps overlap and expires about 5 seconds after exit", () => {
  const source = getArena("cosmic-sprint"),
    arena = {
      ...source,
      spawn: { x: 0, y: 0, z: 0 },
      platforms: [{ x: 0, y: 0, z: 0, width: 200, depth: 200 }],
      checkpoints: [],
      finish: { x: 0, y: 0, z: -1000, radius: 1 },
      mechanisms: [
        {
          id: "boost",
          kind: "conveyor" as const,
          surface: false,
          x: 0,
          y: 0,
          z: 0,
          width: 4,
          depth: 4,
          period: 1,
          velocityX: 0,
          velocityZ: 0,
          turboMultiplier: 1.5,
          turboDuration: 5,
        },
      ],
    },
    p = createPlayer(arena);
  while (p.x < 2.2) stepArenaPlayer(p, { ...idle, x: 1 }, FIXED_STEP, arena);
  expect(p.turboMultiplier).toBe(1.5);
  expect(p.turboTime).toBeGreaterThan(4.9);
  expect(p.vx).toBeGreaterThan(6);
  for (let i = 0; i < 588; i++)
    stepArenaPlayer(p, { ...idle, x: 1 }, FIXED_STEP, arena);
  expect(p.turboTime).toBeGreaterThan(0);
  for (let i = 0; i < 30; i++)
    stepArenaPlayer(p, { ...idle, x: 1 }, FIXED_STEP, arena);
  expect(p.turboTime).toBe(0);
  expect(p.turboMultiplier).toBe(1);
  expect(p.vx).toBeCloseTo(6);
});
it("a falling character lands on an airborne edited bounce surface without a level floor", () => {
  const c = {
    id: "body",
    kind: "bounce" as const,
    x: 0,
    y: 3,
    z: 0,
    yaw: 0,
    width: 4,
    depth: 4,
    height: 0.35,
    boost: 10.5,
  };
  const edited = applyLayout({
      ...emptyLayout(),
      objects: [
        {
          id: "editor-pad",
          sourceId: "catalog:inflatable-bounce-pad",
          x: 0,
          y: 0,
          z: 0,
          yaw: 0,
          colliders: [c],
        },
      ],
    }),
    pad = edited.mechanisms.find((m) => m.id === "editor-pad")!;
  const arena = {
      ...edited,
      spawn: { x: 0, y: 7, z: 0 },
      platforms: [],
      checkpoints: [],
      finish: { x: 100, y: 0, z: 100, radius: 1 },
      mechanisms: [pad],
    },
    p = createPlayer(arena);
  p.grounded = false;
  p.vy = -6;
  for (let i = 0; i < 120 && p.lastEvent !== "pad"; i++)
    stepArenaPlayer(p, idle, FIXED_STEP, arena);
  expect(p.lastEvent).toBe("pad");
  expect(p.y).toBe(3);
  expect(p.vy).toBe(10.5);
  const serial = p.eventSerial;
  for (let i = 0; i < 10; i++) stepArenaPlayer(p, idle, FIXED_STEP, arena);
  expect(p.y).toBeGreaterThan(3);
  expect(p.eventSerial).toBe(serial);
});
it("real checkpoint activations pulse once, work out of order and respawn after a fall; restart clears activation", () => {
  const arena = {
      ...getArena("cosmic-sprint"),
      spawn: { x: 2, y: 0, z: 0 },
      platforms: [{ x: 0, y: 0, z: 0, width: 10, depth: 10 }],
      mechanisms: [],
      checkpoints: [
        { x: 0, y: 0, z: 0, radius: 0.5 },
        { x: 2, y: 0, z: 0, radius: 0.5 },
      ],
      finish: { x: 100, y: 0, z: 100, radius: 1 },
    },
    p = createPlayer(arena),
    output: string[] = [],
    events = new PresentationEvents((e) => output.push(e.kind));
  events.observe("local", p);
  stepArenaPlayer(p, idle, FIXED_STEP, arena);
  events.observe("local", p);
  expect(p.checkpoint).toBe(2);
  p.x = 0;
  stepArenaPlayer(p, idle, FIXED_STEP, arena);
  events.observe("local", p);
  for (let i = 0; i < 10; i++) {
    stepArenaPlayer(p, idle, FIXED_STEP, arena);
    events.observe("local", p);
  }
  expect(output.filter((v) => v === "checkpoint")).toHaveLength(2);
  p.y = -7;
  p.grounded = false;
  for (let i = 0; i < 90; i++) stepArenaPlayer(p, idle, FIXED_STEP, arena);
  expect(p.respawns).toBe(1);
  expect(p.x).toBe(0);
  expect(p.y).toBe(0);
  expect(p.checkpoint).toBe(1);
  expect(createPlayer(arena).checkpoint).toBe(0);
});
it("round trips collider/trigger config, blocks unreviewed publication and binds client/server to one published revision", () => {
  const layout = {
    ...emptyLayout(),
    objects: [
      {
        id: "editor-decor",
        sourceId: "catalog:space-decoration-kit:0",
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
        colliders: [
          {
            id: "turbo",
            kind: "turbo" as const,
            x: 1,
            y: 0,
            z: 0,
            yaw: 0.3,
            width: 4,
            depth: 4,
            height: 1,
            multiplier: 1.5,
            duration: 5,
          },
        ],
      },
    ],
    checkpoints: [{ index: 0, radius: 3, enabled: true }],
  };
  expect(validateLayout(JSON.parse(JSON.stringify(layout)))).toEqual(layout);
  expect(() => validatePublication({ ...published, layout })).toThrow(
    /navigation/,
  );
  expect(() =>
    validateLayout({
      ...layout,
      objects: [
        {
          ...layout.objects[0],
          colliders: [{ ...layout.objects[0].colliders[0], width: -1 }],
        },
      ],
    }),
  ).toThrow();
  expect(getArena("cosmic-sprint")).toBe(publishedCosmicSprint);
  const room = new Room("cosmic-sprint", undefined, 0, 0);
  room.add("tester");
  expect(room.arena).toBe(publishedCosmicSprint);
  expect(WORLD_REVISION).toContain(publishedLayoutRevision);
  expect(validatePublication(published).revision).toBe(publishedLayoutRevision);
  expect(layoutFingerprint({ b: 1, a: 2 })).toBe(
    layoutFingerprint({ a: 2, b: 1 }),
  );
  expect(layoutFingerprint({n:.1+.2})).toBe(layoutFingerprint({n:.3}));
  expect(validRoomSnapshot(room.snapshot(0))).toBe(true);
  const messages: ServerMessage[] = [];
  const peer = {
    id: "old-client",
    lastSeen: 0,
    send: (m: ServerMessage) => messages.push(m),
    close: () => {},
  };
  new MatchService().handle(
    peer,
    {
      v: 2,
      type: "join",
      mode: "create",
      name: "tester",
      arenaId: "cosmic-sprint",
      worldRevision: "old",
    },
    0,
  );
  expect(messages[0]).toMatchObject({ type: "error", code: "world_version" });
  expect(
    publishedCosmicSprint.platforms.map((p) => [
      p.x,
      p.y,
      p.z,
      p.width,
      p.depth,
    ]),
  ).toEqual(
    cosmicSprint.platforms.map((p) => [p.x, p.y, p.z, p.width, p.depth]),
  );
});

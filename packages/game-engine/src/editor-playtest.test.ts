import { it, expect } from "vitest";
import { applyLayout, emptyLayout } from "@minimorph/game-content";
import { cosmicSprint } from "../../game-content/src/cosmic-sprint";
import { LevelManager } from "./levels";
import { createPlayer, stepArenaPlayer, FIXED_STEP } from "./physics";
import { advanceCheckpoints, respawnPoint } from "./checkpoints";
import {
  createCameraPose,
  updateCamera,
  createCameraFollow,
  updateCameraFollow,
  cameraFollowConfig,
} from "./camera";
import { parseClientMessage } from "@minimorph/multiplayer-protocol";
import { Room } from "../../../apps/multiplayer-server/src/rooms";
it("local Playtest uses the complete detached draft and normal shared physics", () => {
  const original = JSON.stringify(cosmicSprint),
    source = cosmicSprint.visuals!.find((v) => v.id === "launch-island")!;
  const draft = {
    ...emptyLayout(),
    objects: [
      {
        id: source.id,
        sourceId: source.id,
        x: source.x,
        y: source.y,
        z: source.z,
        yaw: 0,
        deleted: true,
      },
      {
        id: "editor-floor",
        sourceId: "catalog:main-floor-tile",
        x: 0,
        y: 0,
        z: 28,
        yaw: 0,
        width: 14,
        depth: 18,
        scale: 1.5,
      },
      {
        id: "editor-hammer",
        sourceId: "catalog:giant-padded-hammer",
        x: 15,
        y: 0,
        z: 28,
        yaw: Math.PI / 2,
        scale: 1.5,
        impactStrength: 20,
      },
      {
        id: "editor-copy",
        sourceId: source.id,
        x: 30,
        y: 1,
        z: 28,
        yaw: 0,
        scale: 0.5,
      },
      {
        id: "editor-decor",
        sourceId: "catalog:curved-floor-corner",
        x: 0,
        y: 0,
        z: 28,
        yaw: 0,
      },
    ],
  };
  const arena = applyLayout(draft),
    levels = new LevelManager(arena.id, "race", arena),
    player = createPlayer(levels.current);
  expect(levels.current).not.toBe(arena);
  expect(levels.current.platforms.some((p) => p.id === source.id)).toBe(false);
  expect(
    levels.current.platforms.find((p) => p.id === "editor-floor"),
  ).toMatchObject({ width: 21, depth: 27 });
  expect(
    levels.current.mechanisms.find((m) => m.id === "editor-hammer"),
  ).toMatchObject({ x: 15, impactStrength: 20 });
  expect(
    levels.current.platforms.find((p) => p.id === "editor-copy"),
  ).toMatchObject({ x: 30, y: 1, width: 16 });
  expect(
    [...levels.current.platforms, ...levels.current.mechanisms].some(
      (p) => p.id === "editor-decor",
    ),
  ).toBe(false);
  for (let i = 0; i < 30; i++)
    stepArenaPlayer(
      player,
      { x: 0, z: -1, jump: false },
      FIXED_STEP,
      levels.current,
    );
  expect(player.z).toBeLessThan(28);
  expect(player.grounded).toBe(true);
  expect(() => levels.load("orbit-chaos")).toThrow();
  expect(levels.next()).toBeUndefined();
  expect(JSON.stringify(cosmicSprint)).toBe(original);
  expect(JSON.stringify(draft)).toContain('"impactStrength":20');
});
it("finishes from legal simulated movement without any checkpoint and keeps authoritative input guards", () => {
  const arena = {
    ...structuredClone(cosmicSprint),
    navigation: undefined,
    spawn: { x: 0, y: 0, z: 0 },
    finish: { x: 0, y: 0, z: -1, radius: 0.2 },
    checkpoints: [
      { x: 50, y: 0, z: 50, radius: 1 },
      { x: 60, y: 0, z: 60, radius: 1 },
    ],
    platforms: [{ x: 0, y: 0, z: 0, width: 10, depth: 10 }],
    mechanisms: [],
    obstacles: [],
  };
  const p = createPlayer(arena);
  for (let i = 0; i < 120 && !p.won; i++)
    stepArenaPlayer(p, { x: 0, z: -1, jump: false }, FIXED_STEP, arena);
  expect(p.won).toBe(true);
  expect(p.checkpoint).toBe(0);
  expect(p.elapsed).toBeGreaterThan(0);
  expect(p.splits).toEqual([]);
  const room = new Room("cosmic-sprint", undefined, 0, 0);
  room.arena = {
    ...arena,
    navigation: [
      {
        id: "finish",
        stage: 0,
        name: "Finish",
        points: [arena.spawn, arena.finish],
      },
    ],
  };
  const human = room.add("Human"),
    bot = room.add("Bot", true, "hard");
  human.peer = { id: "peer", lastSeen: 0, send: () => {}, close: () => {} };
  human.lastInput = { x: 0, z: -1, jump: false };
  room.phase = 'racing'; room.startAt = 0;
  for (const participant of [human, bot])
    Object.assign(participant.state, arena.spawn);
  for (let i = 0; i < 30; i++) room.simulate();
  room.finish(1000);
  for (const participant of [human, bot]) {
    expect(participant.state.checkpoint).toBe(0);
    expect(participant.status).toBe("finished");
    expect(participant.finishTime).toBeGreaterThan(0);
    expect(
      room.result!.rows.find((r) => r.id === participant.id),
    ).toMatchObject({ status: "finished", time: participant.finishTime });
  }
  const touch = createPlayer(arena);
  Object.assign(touch, arena.checkpoints[1]);
  advanceCheckpoints(touch, arena);
  expect(respawnPoint(touch, arena)).toEqual(arena.checkpoints[1]);
  Object.assign(touch, arena.checkpoints[0]);
  advanceCheckpoints(touch, arena);
  expect(respawnPoint(touch, arena)).toEqual(arena.checkpoints[0]);
  const below = createPlayer(arena);
  Object.assign(below, arena.finish, { y: -1 });
  advanceCheckpoints(below, arena);
  expect(below.won).toBe(false);
  expect(
    parseClientMessage(
      JSON.stringify({
        v: 2,
        type: "input",
        command: {
          seq: 1,
          x: 0,
          z: -1,
          jump: false,
          yaw: 0,
          position: arena.finish,
        },
      }),
    ),
  ).toBeNull();
});
it("uses a closer stable camera with gradual partial follow and manual hold/restore", () => {
  const player = createPlayer(),
    pose = createCameraPose(),
    follow = createCameraFollow(),
    dt = 1 / 60;
  for (let i = 0; i < 300; i++) updateCamera(pose, player, 0, 1.8, dt);
  expect(Math.hypot(pose.x - pose.lookX, pose.z - pose.lookZ)).toBeCloseTo(
    cameraFollowConfig.distance,
    1,
  );
  expect(cameraFollowConfig.distance).toBeLessThan(8.5);
  player.vx = 6;
  let yaw = 0;
  for (let i = 0; i < 240; i++)
    yaw = updateCameraFollow(follow, player, 0, 0, dt);
  expect(yaw).toBeLessThan(-0.1);
  expect(yaw).toBeGreaterThan(-cameraFollowConfig.maxOffset);
  for (let i = 0; i < 60; i++)
    yaw = updateCameraFollow(follow, player, 0.2, 1, dt);
  expect(yaw).toBeCloseTo(0.2, 2);
  for (let i = 0; i < 60; i++)
    yaw = updateCameraFollow(follow, player, 0.2, 0, dt);
  expect(yaw).toBeCloseTo(0.2, 2);
  const before = yaw;
  for (let i = 0; i < 240; i++)
    yaw = updateCameraFollow(follow, player, 0.2, 0, dt);
  expect(yaw).toBeLessThan(before - 0.1);
  player.y = 4;
  const lookY = pose.lookY;
  updateCamera(pose, player, yaw, 1.8, dt);
  expect(pose.lookY - lookY).toBeLessThan(0.21);
  player.y = -10;
  for (let i = 0; i < 300; i++) updateCamera(pose, player, yaw, 1.8, dt);
  expect(pose.y).toBeGreaterThan(0);
});

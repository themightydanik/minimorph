import { it, expect } from "vitest";
import {
  arenas,
  getArena,
  levelRegistry,
  LevelRegistry,
  legacyLevelDocument,
  SIMULATION_REVISION,
  publishedLayoutRevision,
} from "@minimorph/game-content";
import {
  WORLD_REVISION,
  PROTOCOL_VERSION,
  parseClientMessage,
  validRoomSnapshot,
} from "@minimorph/multiplayer-protocol";
import { Room } from "../../../apps/multiplayer-server/src/rooms";
import { MatchService } from "../../../apps/multiplayer-server/src/matches";
import type { Peer } from "../../../apps/multiplayer-server/src/rooms";
import type { ServerMessage } from "@minimorph/multiplayer-protocol";
import { Prediction } from "./index";
it("server and prediction resolve identical registered worlds and replay unchanged commands", () => {
  for (const a of arenas) {
    const room = new Room(a.id, undefined, 0, 0),
      p = room.add("Test"),
      prediction = new Prediction();
    p.peer = { id: "peer", lastSeen: 0, send() {}, close() {} };
    expect(room.arena).toBe(getArena(a.id));
    expect(room.arena).toBe(levelRegistry.resolve(a.id).arena);
    prediction.receive(p.state, 0, a.id, true);
    for (let n = 0; n < 24; n++) {
      const c = prediction.command(
        { x: 0.2, z: -0.7, jump: n === 3, dive: n === 9 },
        0.1,
      );
      p.commands.push(c);
      room.simulate();
      expect(prediction.local).toEqual(p.state);
      if (n % 4 === 0) prediction.receive(p.state, p.ack, a.id, true);
    }
    expect(validRoomSnapshot(room.snapshot(1000))).toBe(true);
  }
  const prediction = new Prediction();
  expect(() =>
    prediction.receive(
      new Room("cosmic-sprint", undefined, 0, 0).add("Test").state,
      0,
      "missing-level",
      true,
    ),
  ).toThrow();
  expect(prediction.local).toBeUndefined();
});
it("retains wire v2, rejects old/altered gameplay revisions and unknown/training identities", () => {
  expect(PROTOCOL_VERSION).toBe(2);
  expect(WORLD_REVISION.length).toBeLessThanOrEqual(64);
  expect(WORLD_REVISION).toContain(publishedLayoutRevision);
  expect(WORLD_REVISION).toContain(levelRegistry.gameplayManifestRevision());
  const messages: ServerMessage[] = [],
    peer: Peer = {
      id: "test",
      lastSeen: 0,
      send: (m) => messages.push(m),
      close() {},
    };
  const service = new MatchService(),
    base = {
      v: 2 as const,
      type: "join" as const,
      mode: "create" as const,
      name: "Test",
      arenaId: "cosmic-sprint",
    };
  const changed = structuredClone(arenas[1]);
  changed.platforms = [
    { ...changed.platforms[0], width: changed.platforms[0].width + 1 },
    ...changed.platforms.slice(1),
  ];
  const source = {
      ref: "test:changed",
      levelId: changed.id,
      arena: changed,
      editor: "read-only" as const,
    },
    registry = new LevelRegistry([legacyLevelDocument(source)], [source]);
  const changedRevision = `${SIMULATION_REVISION}-${publishedLayoutRevision}-r1-${registry.gameplayManifestRevision()}`;
  for (const revision of [
    `${SIMULATION_REVISION}-${publishedLayoutRevision}`,
    changedRevision,
  ]) {
    const message = parseClientMessage(
      JSON.stringify({ ...base, worldRevision: revision }),
    );
    expect(message).not.toBeNull();
    service.handle(peer, message!, 0);
    expect(messages.at(-1)).toMatchObject({ code: "world_version" });
    expect(service.rooms.size).toBe(0);
  }
  for (const arenaId of ["missing-level", "training-cosmic-sprint"]) {
    service.handle(
      peer,
      { ...base, arenaId, worldRevision: WORLD_REVISION },
      0,
    );
    expect(messages.at(-1)).toMatchObject({ code: "bad_arena" });
  }
  const room = new Room("cosmic-sprint", undefined, 0, 0);
  room.add("Test");
  expect(
    validRoomSnapshot({ ...room.snapshot(0), arenaId: "missing-level" }),
  ).toBe(false);
});

import { it, expect } from "vitest";
import {
  WORLD_REVISION,
  TOURNAMENT_ROUNDS,
} from "@minimorph/multiplayer-protocol";
import type {
  ServerMessage,
  ClientMessage,
} from "@minimorph/multiplayer-protocol";
import {
  TournamentRoom,
  ROUND_RESULTS_MS,
  INTERMISSION_MS,
  PREPARING_MS,
  PODIUM_MS,
} from "./tournament";
import { MatchService, MemoryResults } from "./matches";
import type { Peer } from "./matches";
function peer(id = "human") {
  const messages: ServerMessage[] = [];
  return Object.assign(
    {
      id,
      lastSeen: 0,
      send: (m: ServerMessage) => messages.push(structuredClone(m)),
      close() {},
    },
    { messages },
  ) as Peer & { messages: ServerMessage[] };
}
function join(
  mode: "quick" | "create" | "private" = "create",
  code?: string,
): ClientMessage {
  return {
    v: 2,
    type: "join",
    mode,
    name: "Human",
    arenaId: "gravity-mayhem",
    worldRevision: WORLD_REVISION,
    ...(code ? { code } : {}),
  };
}
function welcome(p: ReturnType<typeof peer>) {
  const m = p.messages.find((m) => m.type === "welcome");
  if (m?.type !== "welcome") throw Error("welcome");
  return m;
}
function toRacing(room: TournamentRoom, now = 0) {
  room.start(now);
  room.advance(now + 3000, 240);
  return now + 3000;
}
function finishBoundary(room: TournamentRoom, count: number) {
  for (const p of room.participants
    .filter((p) => room.activeIds.includes(p.id))
    .slice(0, count))
    Object.assign(p.state, {
      ...room.arena.finish,
      checkpoint: room.arena.checkpoints.length,
    });
}
function nextRound(room: TournamentRoom, now: number) {
  room.advance(now + ROUND_RESULTS_MS, 240);
  expect(room.phase).toBe("intermission");
  room.advance(now + ROUND_RESULTS_MS + INTERMISSION_MS, 240);
  expect(room.phase).toBe("preparing");
  room.advance(now + ROUND_RESULTS_MS + INTERMISSION_MS + PREPARING_MS, 240);
  expect(room.phase).toBe("countdown");
  room.advance(
    now + ROUND_RESULTS_MS + INTERMISSION_MS + PREPARING_MS + 3000,
    240,
  );
  return now + ROUND_RESULTS_MS + INTERMISSION_MS + PREPARING_MS + 3000;
}
it("real physics completes a bot-only 8 → 6 → 4 tournament, with no replacement or automatic qualification", () => {
  const room = new TournamentRoom(undefined, 15000, 0),
    originalIds = room.participants.map((p) => p.id);
  let now = toRacing(room);
  const rosters: number[] = [room.activeIds.length];
  let previous = 1,
    previousPhase = room.phase,
    largestSnapshot = 0;
  for (let tick = 0; tick < 30 * 700 && room.phase !== "completed"; tick++) {
    now += 1000 / 30;
    room.advance(now, 240);
    if (room.phase !== previousPhase) {
      previousPhase = room.phase;
      largestSnapshot = Math.max(
        largestSnapshot,
        Buffer.byteLength(JSON.stringify(room.snapshot(now))),
      );
    }
    if (room.round !== previous) {
      rosters.push(room.activeIds.length);
      previous = room.round;
    }
  }
  expect(largestSnapshot).toBeLessThan(32768);
  expect(room.phase).toBe("completed");
  expect(rosters).toEqual([8, 6, 4]);
  expect(room.history.map((r) => r.rows.length)).toEqual([8, 6, 4]);
  expect(room.history.slice(0, 2).map((r) => r.qualifiedIds.length)).toEqual([
    6, 4,
  ]);
  for (const r of room.history.slice(0, 2))
    for (const id of r.qualifiedIds)
      expect(r.rows.find((p) => p.id === id)!.status).toBe("finished");
  expect(room.participants.map((p) => p.id)).toEqual(originalIds);
  expect(room.placements.map((p) => p.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(room.championId).toBe(room.history[2].rows[0].id);
  expect(room.history[2].rows[0].status).toBe("finished");
});
it("one idle human and seven bots complete through MatchService and persist three immutable result records", () => {
  const store = new MemoryResults(),
    service = new MatchService(store),
    human = peer();
  service.handle(human, join("quick"), 0);
  const room = human.room as TournamentRoom;
  expect(room.participants).toHaveLength(8);
  expect(room.participants.filter((p) => p.bot)).toHaveLength(7);
  expect(room.arenaId).toBe("cosmic-sprint");
  const id = human.participant!.id,
    token = welcome(human).token;
  let first = "";
  for (let tick = 0; tick < 30 * 700 && room.phase !== "completed"; tick++) {
    service.tick(15000 + (tick * 1000) / 30);
    if (room.history.length && !first) first = JSON.stringify(room.history[0]);
  }
  expect(room.phase).toBe("completed");
  expect(human.participant!.id).toBe(id);
  expect(human.participant!.status).toBe("eliminated");
  expect(service.tokens.size).toBe(1);
  expect(token).toHaveLength(43);
  expect(JSON.stringify(room.history[0])).toBe(first);
  expect(store.records).toHaveLength(3);
  expect(store.records[2].rows).toHaveLength(8);
  expect(new Set(store.records.map((r) => r.roomId)).size).toBe(1);
  service.disconnect(human, room.lastActive + 1);
  const resumed = peer("post-tournament");
  service.handle(
    resumed,
    { v: 2, type: "resume", token, worldRevision: WORLD_REVISION },
    room.lastActive + 2,
  );
  expect(resumed.participant!.id).toBe(id);
  expect(welcome(resumed).snapshot.phase).toBe("completed");
});
it("equal authoritative finishes use stable ID order, qualify once, and never advance eliminated racers", () => {
  const room = new TournamentRoom("ABC234", 0, 0);
  let now = toRacing(room);
  finishBoundary(room, 8);
  room.advance(now + 34, 240);
  expect(room.phase).toBe("round-results");
  const expected = room.participants.map((p) => p.id).sort();
  expect(room.qualifiedIds).toEqual(expected.slice(0, 6));
  const frozen = JSON.stringify(room.history);
  room.advance(now + 35, 240);
  expect(JSON.stringify(room.history)).toBe(frozen);
  now = nextRound(room, now + 34);
  expect(room.activeIds).toEqual(expected.slice(0, 6));
  expect(
    room.participants.filter((p) => p.status === "eliminated"),
  ).toHaveLength(2);
  finishBoundary(room, 6);
  room.advance(now + 34, 240);
  const finalists = room.qualifiedIds;
  expect(new Set(finalists).size).toBe(4);
  expect(finalists.every((id) => expected.slice(0, 6).includes(id))).toBe(true);
  now = nextRound(room, now + 34);
  finishBoundary(room, 4);
  room.advance(now + 34, 240);
  expect(room.championId).toBe([...finalists].sort()[0]);
  const results = JSON.stringify(room.result);
  room.advance(now + 35, 240);
  expect(JSON.stringify(room.result)).toBe(results);
});
it("timeout fallback is deterministic by checkpoints, forward progress and ID; no finishers never deadlock", () => {
  const room = new TournamentRoom(undefined, 0, 0);
  let now = toRacing(room);
  const ordered = [...room.participants].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  ordered[0].state.checkpoint = 1;
  ordered[1].state.z = -10;
  room.advance(now + 240001, 240);
  expect(room.qualifiedIds[0]).toBe(ordered[0].id);
  expect(room.qualifiedIds[1]).toBe(ordered[1].id);
  expect(room.history[0].rows.every((p) => p.status === "dnf")).toBe(true);
  now = nextRound(room, now + 240001);
  room.advance(now + 240001, 240);
  now = nextRound(room, now + 240001);
  room.advance(now + 240001, 240);
  expect(room.phase).toBe("tournament-results");
  expect(room.championId).toBe(room.placements[0].id);
  expect(room.placements).toHaveLength(8);
  room.advance(now + 240001 + PODIUM_MS, 240);
  expect(room.phase).toBe("completed");
});
it("round preparation clears old velocity, cooldowns, collision triggers, checkpoints and queued input without changing identity", () => {
  const room = new TournamentRoom(undefined, 0, 0);
  const now = toRacing(room);
  finishBoundary(room, 6);
  room.advance(now + 34, 240);
  const p = room.participants.find((p) => room.qualifiedIds.includes(p.id))!,
    id = p.id,
    color = p.color;
  Object.assign(p.state, {
    vx: 9,
    vy: 8,
    vz: -9,
    action: "slide",
    diveHeld: true,
    jumpHeld: true,
    diveCooldown: 1,
    supportId: "old",
    collapseTimes: { old: 5 },
    checkpoint: 99,
  });
  p.commands.push({ seq: 10, x: 1, z: 0, jump: true, yaw: 0 });
  p.lastSeq = 10;
  room.advance(now + 34 + ROUND_RESULTS_MS, 240);
  room.advance(now + 34 + ROUND_RESULTS_MS + INTERMISSION_MS, 240);
  expect(room.phase).toBe("preparing");
  expect(p.id).toBe(id);
  expect(p.color).toBe(color);
  expect(p.commands).toEqual([]);
  expect(p.ack).toBe(10);
  expect(p.state).toMatchObject({
    vx: 0,
    vy: 0,
    vz: 0,
    action: "normal",
    diveHeld: false,
    jumpHeld: false,
    diveCooldown: 0,
    checkpoint: 0,
  });
  expect(p.state.collapseTimes).toEqual({});
  expect(p.state.lastHazard).toBeNull();
  expect(p.state.elapsed).toBe(0);
});
it("private and quick tournament rosters lock after start; spectator and stale round commands cannot affect simulation", () => {
  const service = new MatchService(),
    owner = peer(),
    other = peer("other");
  service.handle(owner, join(), 0);
  const room = owner.room as TournamentRoom;
  service.handle(other, join("private", room.code), 0);
  service.handle(owner, { v: 2, type: "start" }, 0);
  service.tick(3000);
  const late = peer("late");
  service.handle(late, join("private", room.code), 3001);
  expect(late.messages.at(-1)).toMatchObject({ code: "already_started" });
  finishBoundary(room, 8);
  service.tick(3034);
  const loser = room.participants.find(
    (p) => !room.qualifiedIds.includes(p.id),
  )!;
  // Use the owner's actual peer if eliminated; otherwise attach a boundary-test peer to an eliminated slot.
  const viewer = peer("viewer");
  service.issue(viewer, room, loser, 3035);
  const before = structuredClone(loser.state);
  service.handle(
    viewer,
    {
      v: 2,
      type: "input",
      command: {
        seq: 1,
        round: 1,
        tournament: 1,
        x: 1,
        z: -1,
        jump: true,
        yaw: 0,
      },
    },
    3036,
  );
  expect(viewer.messages.at(-1)).toMatchObject({ code: "spectator_input" });
  expect(loser.state).toEqual(before);
  expect(loser.commands).toHaveLength(0);
  const racer = room.participants.find((p) =>
      room.qualifiedIds.includes(p.id),
    )!,
    racerPeer = peer("racer");
  service.issue(racerPeer, room, racer, 3037);
  nextRound(room, 3034);
  service.handle(
    racerPeer,
    {
      v: 2,
      type: "input",
      command: {
        seq: 1,
        round: 1,
        tournament: 1,
        x: 1,
        z: -1,
        jump: true,
        yaw: 0,
      },
    },
    16000,
  );
  expect(racerPeer.messages.at(-1)).toMatchObject({ code: "stale_round" });
  expect(racer.commands).toHaveLength(0);
});
it("reconnect restores full state in every phase, including elimination; a wrong world cannot rotate the token", () => {
  const service = new MatchService(),
    human = peer();
  service.handle(human, join(), 0);
  const room = human.room as TournamentRoom;
  let current = human,
    now = 1;
  function reconnect() {
    const token = welcome(current).token;
    service.disconnect(current, now);
    const resumed = peer(`r${now}`);
    service.handle(
      resumed,
      { v: 2, type: "resume", worldRevision: WORLD_REVISION, token },
      now + 1,
    );
    expect(resumed.participant!.id).toBe(
      human.messages[0].type === "welcome" ? human.messages[0].id : "",
    );
    expect(welcome(resumed).snapshot.tournament?.round).toBe(room.round);
    expect(welcome(resumed).snapshot.phase).toBe(room.phase);
    current = resumed;
    now += 2;
  }
  reconnect();
  service.handle(current, { v: 2, type: "start" }, now);
  reconnect();
  service.tick(now + 3000);
  now += 3000;
  reconnect();
  finishBoundary(room, 8);
  service.tick(now + 34);
  now += 34;
  reconnect();
  room.advance(now + ROUND_RESULTS_MS, 240);
  now += ROUND_RESULTS_MS;
  reconnect();
  room.advance(now + INTERMISSION_MS, 240);
  now += INTERMISSION_MS;
  reconnect();
  room.advance(now + PREPARING_MS, 240);
  now += PREPARING_MS;
  reconnect();
  const token = welcome(current).token,
    wrong = peer("wrong");
  service.disconnect(current, now);
  service.handle(
    wrong,
    { v: 2, type: "resume", token, worldRevision: "old-world" },
    now + 1,
  );
  expect(wrong.messages.at(-1)).toMatchObject({ code: "world_version" });
  const good = peer("good");
  service.handle(
    good,
    { v: 2, type: "resume", token, worldRevision: WORLD_REVISION },
    now + 2,
  );
  expect(good.participant).toBeDefined();
  current = good;
  now = room.startAt!;
  room.advance(now, 240);
  finishBoundary(room, 6);
  room.advance(now + 34, 240);
  now += 34;
  reconnect();
  now = nextRound(room, now);
  finishBoundary(room, 4);
  room.advance(now + 34, 240);
  now += 34;
  reconnect();
  room.advance(now + PODIUM_MS, 240);
  now += PODIUM_MS;
  reconnect();
});
it("withdrawals never refill eliminated slots, owner transfer and all-human departure cannot stall the bracket; replay creates a fresh edition", () => {
  const service = new MatchService(),
    a = peer("a"),
    b = peer("b");
  service.handle(a, join(), 0);
  const room = a.room as TournamentRoom;
  service.handle(b, join("private", room.code), 1);
  service.handle(a, { v: 2, type: "start" }, 2);
  service.disconnect(a, 3, true);
  expect(room.ownerId).toBe(b.participant!.id);
  service.tick(3002);
  const original = room.participants.map((p) => p.id);
  let now = 3002;
  for (let tick = 0; tick < 30 * 700 && room.phase !== "completed"; tick++) {
    now += 1000 / 30;
    service.tick(now);
  }
  expect(room.phase).toBe("completed");
  expect(room.participants.map((p) => p.id)).toEqual(original);
  const oldEdition = room.edition;
  service.handle(b, { v: 2, type: "replay", tournament: oldEdition }, now + 1);
  expect(room.edition).toBe(oldEdition + 1);
  expect(room.phase).toBe("countdown");
  expect(room.history).toEqual([]);
  expect(room.participants).toHaveLength(8);
  expect(room.championId).toBeNull();
  const staleRound = room.round;
  service.handle(b, { v: 2, type: "replay", tournament: oldEdition }, now + 2);
  expect(room.round).toBe(staleRound);
  expect(room.edition).toBe(oldEdition + 1);
  service.tick(now + 3001);
  service.handle(
    b,
    {
      v: 2,
      type: "input",
      command: {
        seq: 1,
        x: 0,
        z: -1,
        jump: false,
        yaw: 0,
        round: 1,
        tournament: oldEdition,
      },
    },
    now + 3002,
  );
  expect(b.messages.at(-1)).toMatchObject({ code: "stale_round" });
});
it("round definitions preserve the required order and thresholds", () => {
  expect(
    TOURNAMENT_ROUNDS.map((r) => [r.arenaId, r.capacity, r.qualify]),
  ).toEqual([
    ["cosmic-sprint", 8, 6],
    ["orbit-chaos", 6, 4],
    ["gravity-mayhem", 4, 1],
  ]);
});
it("a human eliminated while disconnected resumes only as a spectator, then can leave without changing the bracket", () => {
  const service = new MatchService(),
    human = peer();
  service.handle(human, join(), 0);
  const room = human.room as TournamentRoom,
    participant = human.participant!,
    id = participant.id,
    token = welcome(human).token;
  service.handle(human, { v: 2, type: "start" }, 0);
  service.tick(3000);
  service.disconnect(human, 3001);
  for (const p of room.participants.filter((p) => p.bot))
    Object.assign(p.state, {
      ...room.arena.finish,
      checkpoint: room.arena.checkpoints.length,
    });
  service.tick(3034);
  expect(participant.status).toBe("eliminated");
  expect(room.qualifiedIds).not.toContain(id);
  const resumed = peer("spectator");
  service.handle(
    resumed,
    { v: 2, type: "resume", token, worldRevision: WORLD_REVISION },
    3035,
  );
  expect(resumed.participant!.id).toBe(id);
  expect(welcome(resumed).snapshot.tournament!.eliminatedIds).toContain(id);
  nextRound(room, 3034);
  const active = [...room.activeIds],
    history = JSON.stringify(room.history),
    resumedToken = welcome(resumed).token;
  service.handle(resumed, { v: 2, type: "leave" }, 16000);
  expect(room.activeIds).toEqual(active);
  expect(JSON.stringify(room.history)).toBe(history);
  expect(room.participants).toHaveLength(8);
  const again = peer("again");
  service.handle(
    again,
    {
      v: 2,
      type: "resume",
      token: resumedToken,
      worldRevision: WORLD_REVISION,
    },
    16001,
  );
  expect(again.messages.at(-1)).toMatchObject({ code: "session_expired" });
});
it("a qualified disconnected human keeps identity through intermission and receives a fresh round state on resume", () => {
  const service = new MatchService(),
    human = peer();
  service.handle(human, join(), 0);
  const room = human.room as TournamentRoom,
    p = human.participant!,
    id = p.id,
    token = welcome(human).token;
  service.handle(human, { v: 2, type: "start" }, 0);
  service.tick(3000);
  for (const racer of [
    p,
    ...room.participants.filter((p) => p.bot).slice(0, 5),
  ])
    Object.assign(racer.state, {
      ...room.arena.finish,
      checkpoint: room.arena.checkpoints.length,
    });
  service.tick(3034);
  expect(room.qualifiedIds).toContain(id);
  service.disconnect(human, 3035);
  nextRound(room, 3034);
  const resumed = peer("qualified");
  service.handle(
    resumed,
    { v: 2, type: "resume", token, worldRevision: WORLD_REVISION },
    15035,
  );
  expect(resumed.participant!.id).toBe(id);
  expect(resumed.participant!.status).toBe("racing");
  expect(room.activeIds).toContain(id);
  expect(resumed.participant!.state.checkpoint).toBe(0);
  expect(welcome(resumed).snapshot.arenaId).toBe("orbit-chaos");
});
it("empty waiting bot lobbies are reclaimed, while a started room finishes with bots after its only human leaves", () => {
  const service = new MatchService(),
    human = peer();
  service.handle(human, join(), 0);
  service.disconnect(human, 1, true);
  service.tick(2);
  expect(service.rooms.size).toBe(0);
  const player = peer("departing");
  service.handle(player, join(), 3);
  const room = player.room as TournamentRoom;
  service.handle(player, { v: 2, type: "start" }, 4);
  service.disconnect(player, 5, true);
  for (let tick = 0; tick < 30 * 700 && room.phase !== "completed"; tick++)
    service.tick(3004 + (tick * 1000) / 30);
  expect(room.phase).toBe("completed");
  expect(room.participants.find((p) => p.id === room.championId)!.bot).toBe(
    true,
  );
  expect(room.history.map((r) => r.rows.length)).toEqual([8, 6, 4]);
});
it("an expired disconnected entrant cannot resume or enter later rounds", () => {
  const service = new MatchService(),
    human = peer();
  service.handle(human, join(), 0);
  const room = human.room as TournamentRoom,
    id = human.participant!.id,
    token = welcome(human).token;
  service.handle(human, { v: 2, type: "start" }, 0);
  service.tick(3000);
  service.disconnect(human, 3001);
  service.tick(23002);
  expect(room.participants.find((p) => p.id === id)!.withdrawn).toBe(true);
  const late = peer("late-resume");
  service.handle(
    late,
    { v: 2, type: "resume", worldRevision: WORLD_REVISION, token },
    23003,
  );
  expect(late.messages.at(-1)).toMatchObject({ code: "session_expired" });
  finishBoundary(room, 6);
  service.tick(23036);
  expect(room.qualifiedIds).not.toContain(id);
  nextRound(room, 23036);
  expect(room.activeIds).not.toContain(id);
});
it("duplicate owner start and consumed replay requests are idempotent, not disconnect-inducing errors", () => {
  const service = new MatchService(),
    owner = peer();
  service.handle(owner, join(), 0);
  const room = owner.room as TournamentRoom;
  service.handle(owner, { v: 2, type: "start" }, 1);
  const startAt = room.startAt,
    count = owner.messages.length;
  service.handle(owner, { v: 2, type: "start" }, 2);
  expect(room.startAt).toBe(startAt);
  expect(room.phase).toBe("countdown");
  expect(owner.messages).toHaveLength(count);
  let now = 3001;
  service.tick(now);
  for (let round = 1; round <= 3; round++) {
    finishBoundary(room, room.activeIds.length);
    service.tick(now + 34);
    now += 34;
    if (round < 3) now = nextRound(room, now);
  }
  service.handle(owner, { v: 2, type: "replay", tournament: 1 }, now + 1);
  const edition = room.edition,
    messages = owner.messages.length;
  service.handle(owner, { v: 2, type: "replay", tournament: 1 }, now + 2);
  expect(room.edition).toBe(edition);
  expect(owner.messages).toHaveLength(messages);
});

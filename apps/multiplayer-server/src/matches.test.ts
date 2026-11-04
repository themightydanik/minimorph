import { it, expect } from "vitest";
import { MatchService, MemoryResults } from "./matches";
import type { Peer } from "./matches";
import type {
  ClientMessage,
  ServerMessage,
} from "@minimorph/multiplayer-protocol";
const join = (
  mode: "quick" | "create" | "private" = "quick",
  code?: string,
): ClientMessage => ({
  v: 1,
  type: "join",
  mode,
  name: "Human",
  arenaId: "cosmic-sprint",
  ...(code ? { code } : {}),
});
function peer(id = "human") {
  const messages: ServerMessage[] = [];
  return Object.assign(
    {
      id,
      lastSeen: 0,
      send: (m: ServerMessage) => messages.push(structuredClone(m)),
      close: () => {},
    },
    { messages },
  ) as Peer & { messages: ServerMessage[] };
}
function welcome(p: ReturnType<typeof peer>) {
  const m = p.messages.find((m) => m.type === "welcome");
  if (m?.type !== "welcome") throw Error("No welcome");
  return m;
}
it("quick match fills exactly eight slots after at most fifteen seconds and forbids late joins", () => {
  const s = new MatchService(),
    a = peer(),
    b = peer("b");
  s.handle(a, join(), 0);
  s.handle(b, join(), 100);
  expect(a.room).toBe(b.room);
  s.tick(14999);
  expect(a.room!.participants).toHaveLength(2);
  s.tick(15000);
  expect(a.room!.phase).toBe("countdown");
  expect(a.room!.participants).toHaveLength(8);
  expect(a.room!.participants.filter((p) => p.bot)).toHaveLength(6);
  const late = peer("late");
  s.handle(late, join(), 18001);
  expect(late.room).not.toBe(a.room);
});
it("eight humans displace all bot slots before the automatic countdown", () => {
  const s = new MatchService(),
    players = Array.from({ length: 8 }, (_, i) => peer(String(i)));
  for (const p of players) s.handle(p, join(), 0);
  expect(players[0].room!.phase).toBe("countdown");
  expect(players[0].room!.participants.every((p) => !p.bot)).toBe(true);
  expect(
    new Set(
      players[0].room!.participants.map((p) => `${p.state.x}:${p.state.z}`),
    ).size,
  ).toBe(8);
});
it("private codes, owner start, capacity, expiry and one-human seven-bot races", () => {
  const s = new MatchService(),
    a = peer(),
    b = peer("b");
  s.handle(a, join("create"), 0);
  const code = a.room!.code!;
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  s.handle(b, join("private", code), 1);
  s.handle(b, { v: 1, type: "start" }, 2);
  expect(a.room!.phase).toBe("waiting");
  s.handle(a, { v: 1, type: "start" }, 3);
  expect(a.room!.participants).toHaveLength(8);
  const bad = peer();
  s.handle(bad, join("private", "AAAAAA"), 4);
  expect(bad.messages.at(-1)).toMatchObject({ code: "invalid_code" });
  s.handle(bad, join("private", code), 4);
  expect(bad.messages.at(-1)).toMatchObject({ code: "already_started" });
  const solo = peer();
  s.handle(solo, join("create"), 5);
  s.handle(solo, { v: 1, type: "start" }, 6);
  expect(solo.room!.participants.filter((p) => p.bot)).toHaveLength(7);
  const full = peer();
  s.handle(full, join("create"), 7);
  for (let i = 0; i < 7; i++)
    s.handle(peer(String(i)), join("private", full.room!.code!), 8);
  s.handle(bad, join("private", full.room!.code!), 9);
  expect(bad.messages.at(-1)).toMatchObject({ code: "room_full" });
  const expired = full.room!.code!;
  s.tick(600009);
  s.handle(bad, join("private", expired), 600010);
  expect(bad.messages.at(-1)).toMatchObject({ code: "invalid_code" });
});
it("server owns movement, input acknowledgments, obstacle clock and checkpoint recovery", () => {
  const s = new MatchService(),
    a = peer();
  s.handle(a, join("create"), 0);
  s.handle(a, { v: 1, type: "start" }, 0);
  s.tick(3000);
  const p = a.participant!,
    initial = p.state.z;
  s.handle(
    a,
    {
      v: 1,
      type: "input",
      command: { seq: 1, x: 0, z: -1, jump: true, yaw: 0 },
    },
    3001,
  );
  s.tick(3033);
  expect(p.ack).toBe(1);
  expect(p.state.z).toBeLessThan(initial);
  expect(p.state.vy).toBeGreaterThan(0);
  expect(
    new Set(a.room!.participants.map((p) => p.state.elapsed.toFixed(6))).size,
  ).toBe(1);
  for (let i = 0; i < 200; i++) {
    s.handle(
      a,
      {
        v: 1,
        type: "input",
        command: { seq: i + 2, x: -1, z: 0, jump: false, yaw: 0 },
      },
      3066 + (i * 1000) / 30,
    );
    s.tick(3066 + (i * 1000) / 30);
  }
  expect(p.state.falls).toBeGreaterThan(0);
  expect(p.state.respawns).toBeGreaterThan(0);
  const at = p.state.x;
  s.handle(
    a,
    {
      v: 1,
      type: "input",
      command: { seq: 999999, x: 1, z: 0, jump: false, yaw: 0 },
    },
    10000,
  );
  expect(p.state.x).toBe(at);
  expect(a.messages.at(-1)).toMatchObject({ code: "input_sequence" });
});
it("reconnect rotates a participant-scoped token, rejects replay and expires disconnected racers as DNF", () => {
  const s = new MatchService(),
    a = peer();
  s.handle(a, join("create"), 0);
  const first = welcome(a);
  s.handle(a, { v: 1, type: "start" }, 1);
  s.tick(3001);
  const id = a.participant!.id,
    room = a.room!;
  s.disconnect(a, 4000);
  const resumed = peer("resumed");
  s.handle(resumed, { v: 1, type: "resume", token: first.token }, 23999);
  expect(resumed.participant!.id).toBe(id);
  const rotated = welcome(resumed);
  expect(rotated.token).not.toBe(first.token);
  const attacker = peer("other");
  s.handle(attacker, { v: 1, type: "resume", token: first.token }, 24000);
  expect(attacker.messages.at(-1)).toMatchObject({ code: "session_expired" });
  s.disconnect(resumed, 25000);
  s.tick(45001);
  expect(room.participants.find((p) => p.id === id)!.status).toBe("dnf");
  s.handle(attacker, { v: 1, type: "resume", token: rotated.token }, 45002);
  expect(attacker.participant).toBeUndefined();
});
it("finish order uses simulation time with deterministic ties; timeout produces stored server results", async () => {
  const store = new MemoryResults(),
    s = new MatchService(store, { maxRooms: 2, timeoutSeconds: 0.1 }),
    a = peer(),
    b = peer("b");
  s.handle(a, join("create"), 0);
  s.handle(b, join("private", a.room!.code!), 1);
  s.handle(a, { v: 1, type: "start" }, 2);
  const room = a.room!;
  // Boundary fixture only: client protocol has no position/finish fields; browser acceptance races use actual inputs.
  for (const p of [a.participant!, b.participant!])
    Object.assign(p.state, {
      checkpoint: room.arena.checkpoints.length,
      x: 0,
      z: room.arena.finish.z,
      y: 0,
    });
  for (let i = 0; i < 4; i++) s.tick(3002 + (i * 1000) / 30);
  expect(room.phase).toBe("finished");
  expect(room.result!.rows.filter((r) => r.status === "finished")).toHaveLength(
    2,
  );
  expect(room.result!.rows.slice(0, 2).map((r) => r.id)).toEqual(
    [a.participant!.id, b.participant!.id].sort(),
  );
  expect(room.result!.rows.filter((r) => r.status === "dnf")).toHaveLength(6);
    expect(room.participants.filter(p=>p.status==='dnf')).toHaveLength(6);
  await Promise.resolve();
  expect(store.records).toHaveLength(1);
});
it("waiting owner transfer and replacement humans preserve distinct safe start slots", () => {
  const s = new MatchService(),
    a = peer(),
    b = peer("b"),
    c = peer("c");
  s.handle(a, join("create"), 0);
  const room = a.room!;
  s.handle(b, join("private", room.code!), 1);
  s.handle(c, join("private", room.code!), 2);
  s.disconnect(a, 3, true);
  expect(room.ownerId).toBe(b.participant!.id);
  const replacement = peer("new");
  s.handle(replacement, join("private", room.code!), 4);
  expect(new Set(room.participants.map((p) => p.color)).size).toBe(3);
  expect(
    new Set(room.participants.map((p) => `${p.state.x}:${p.state.z}`)).size,
  ).toBe(3);
  s.handle(b, { v: 1, type: "start" }, 5);
  expect(room.participants).toHaveLength(8);
});

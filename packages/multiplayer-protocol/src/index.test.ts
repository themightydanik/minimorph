import { it, expect } from "vitest";
import { parseClientMessage } from "./index";
it("accepts only versioned typed inputs and refuses client authority and malformed messages", () => {
  const valid = {
    v: 2,
    type: "input",
    command: { seq: 1, x: 1, z: -1, jump: true, yaw: 0 },
  };
  expect(parseClientMessage(JSON.stringify(valid))).toEqual(valid);
  for (const value of [
    { ...valid, position: { z: -400 } },
    { v: 2, type: "finish", time: 1 },
    { ...valid, v: 1 },
    { ...valid, command: { ...valid.command, x: 9 } },
    { ...valid, command: { ...valid.command, yaw: null } },
    { ...valid, command: { ...valid.command, seq: 1.5 } },
    {
      v: 2,
      type: "join",
      mode: "quick",
      name: "<script>",
      arenaId: "cosmic-sprint",
    },
    null,
    [],
    {},
  ])
    expect(parseClientMessage(JSON.stringify(value))).toBeNull();
  expect(parseClientMessage("{")).toBeNull();
  expect(parseClientMessage("x".repeat(2049))).toBeNull();
});
it("private joins require a valid code and public matchmaking cannot carry one", () => {
  const join = {
    v: 2,
    type: "join",
    mode: "private",
    name: "Cadet",
    arenaId: "cosmic-sprint",
  };
  expect(parseClientMessage(JSON.stringify(join))).toBeNull();
  expect(
    parseClientMessage(JSON.stringify({ ...join, code: "ABC234" })),
  ).not.toBeNull();
  expect(
    parseClientMessage(
      JSON.stringify({ ...join, mode: "quick", code: "ABC234" }),
    ),
  ).toBeNull();
  expect(
    parseClientMessage(JSON.stringify({ ...join, mode: "quick" })),
  ).not.toBeNull();
});
it("accepts analog dive intent but refuses forged action state or nonboolean dive", () => {
  const command = {
    seq: 2,
    x: 0.24,
    z: -0.61,
    jump: false,
    dive: true,
    yaw: 0.4,
  };
  const wire = (c: unknown) =>
    JSON.stringify({ v: 2, type: "input", command: c });
  expect(parseClientMessage(wire(command))).not.toBeNull();
  expect(parseClientMessage(wire({ ...command, dive: 1 }))).toBeNull();
  expect(parseClientMessage(wire({ ...command, action: "slide" }))).toBeNull();
  expect(parseClientMessage(wire({ ...command, vx: 90 }))).toBeNull();
});
it("bounds the optional v2 course-revision handshake without accepting authority claims", () => {
  const join = {
    v: 2,
    type: "join",
    mode: "quick",
    name: "Cadet",
    arenaId: "cosmic-sprint",
    worldRevision: "advanced-races-v1",
  };
  expect(parseClientMessage(JSON.stringify(join))).toEqual(join);
  for (const revision of [false, 12, "", "x".repeat(65), "../escape"])
    expect(
      parseClientMessage(JSON.stringify({ ...join, worldRevision: revision })),
    ).toBeNull();
  const resume = {
    v: 2,
    type: "resume",
    token: "a".repeat(43),
    worldRevision: "advanced-races-v1",
  };
  expect(parseClientMessage(JSON.stringify(resume))).toEqual(resume);
  expect(
    parseClientMessage(JSON.stringify({ ...join, position: { x: 0 } })),
  ).toBeNull();
});
it("strictly bounds tournament mode, replay edition and round input context while rejecting forged qualification", () => {
  const join = {
    v: 2,
    type: "join",
    mode: "quick",
    name: "Cadet",
    arenaId: "cosmic-sprint",
    experience: "tournament",
  };
  expect(parseClientMessage(JSON.stringify(join))).toEqual(join);
  expect(
    parseClientMessage(JSON.stringify({ ...join, experience: "champion" })),
  ).toBeNull();
  for (const tournament of [0, 1.5, 1000001, "1", null])
    expect(
      parseClientMessage(JSON.stringify({ v: 2, type: "replay", tournament })),
    ).toBeNull();
  expect(
    parseClientMessage(JSON.stringify({ v: 2, type: "replay", tournament: 1 })),
  ).not.toBeNull();
  const command = {
    seq: 1,
    x: 0,
    z: -1,
    jump: false,
    yaw: 0,
    round: 2,
    tournament: 3,
  };
  expect(
    parseClientMessage(JSON.stringify({ v: 2, type: "input", command })),
  ).not.toBeNull();
  for (const extra of [
    { round: 4 },
    { tournament: 0 },
    { qualified: true },
    { championId: "me" },
    { checkpoint: 9 },
  ])
    expect(
      parseClientMessage(
        JSON.stringify({
          v: 2,
          type: "input",
          command: { ...command, ...extra },
        }),
      ),
    ).toBeNull();
});
it("invalid tournament snapshots fail closed before UI access, including malformed nested history", async () => {
  const { validRoomSnapshot } = await import("./index"),
    { TournamentRoom } = await import(
      "../../../apps/multiplayer-server/src/tournament"
    );
  const room = new TournamentRoom(undefined, 0, 0),
    s = room.snapshot(0);
  expect(validRoomSnapshot(s)).toBe(true);
  room.start(0);
  room.advance(3000, 240);
  room.advance(243001, 240);
  const closed = room.snapshot(243001);
  expect(validRoomSnapshot(closed)).toBe(true);
  expect(
    validRoomSnapshot({
      ...closed,
      tournament: { ...closed.tournament!, history: [null] },
    } as unknown as typeof s),
  ).toBe(false);
  expect(
    validRoomSnapshot({
      ...closed,
      tournament: {
        ...closed.tournament!,
        history: [{ ...closed.tournament!.history[0], rows: [null] }],
      },
    } as unknown as typeof s),
  ).toBe(false);
  for (const corrupt of [
    { tournament: null },
    { tournament: { ...s.tournament, history: [null] } },
    { tournament: { ...s.tournament, activeIds: ["unknown"] } },
    { tournament: { ...s.tournament, placements: [null] } },
    { participants: [null] },
  ])
    expect(validRoomSnapshot({ ...s, ...corrupt } as typeof s)).toBe(false);
});
it.each(["equal-time", "all-dnf", "empty-final"])(
  "accepts consistent %s final snapshots and rejects conflicting championship claims",
  async (scenario) => {
    const empty = scenario === "empty-final";
    const { validRoomSnapshot } = await import("./index"),
      { TournamentRoom } = await import(
        "../../../apps/multiplayer-server/src/tournament"
      );
    const room = new TournamentRoom(undefined, 0, 0);
    room.start(0);
    let now = 3000;
    room.advance(now, 240);
    for (let round = 1; round <= 3; round++) {
      if (round === 3 && scenario === "equal-time")
        for (const p of room.participants.filter((p) =>
          room.activeIds.includes(p.id),
        ))
          Object.assign(p.state, {
            ...room.arena.finish,
            checkpoint: room.arena.checkpoints.length,
          });
      room.advance((now += 240001), 240);
      expect(validRoomSnapshot(room.snapshot(now))).toBe(true);
      if (round === 3) break;
      if (empty && round === 2)
        for (const p of room.participants)
          if (room.qualifiedIds.includes(p.id)) p.withdrawn = true;
      for (const delay of [3000, 5000, 1000, 3000]) {
        room.advance((now += delay), 240);
        expect(validRoomSnapshot(room.snapshot(now))).toBe(true);
      }
    }
    room.advance((now += 12000), 240);
    const snapshot = room.snapshot(now),
      t = snapshot.tournament!;
    expect(snapshot.phase).toBe("completed");
    expect(validRoomSnapshot(snapshot)).toBe(true);
    expect(t.history[2].rows.length).toBe(empty ? 0 : 4);
    expect(t.orderIds.length).toBe(empty ? 0 : 4);
    expect(t.championId).toBe(t.placements[0].id);
    expect(snapshot.result!.rows[0].id).toBe(t.championId);
    const corruptions: ((s: typeof snapshot) => void)[] = [
      (s) => {
        s.tournament!.championId = s.tournament!.placements[1].id;
      },
      (s) => {
        s.result!.championId = s.tournament!.placements[1].id;
      },
      (s) => {
        s.result!.rows.reverse();
      },
      (s) => {
        s.result!.rows[0].time = 1;
      },
      (s) => {
        s.tournament!.placements[0].roundReached =
          3 - s.tournament!.placements[0].roundReached;
      },
      (s) => {
        s.tournament!.history[1].rows[0].time = 1;
      },
      (s) => {
        s.tournament!.orderIds.reverse();
        if (empty) s.tournament!.orderIds.push(s.tournament!.championId!);
      },
      (s) => {
        s.result = undefined;
      },
    ];
    for (const corrupt of corruptions) {
      const bad = structuredClone(snapshot);
      corrupt(bad);
      expect(validRoomSnapshot(bad)).toBe(false);
    }
  },
);

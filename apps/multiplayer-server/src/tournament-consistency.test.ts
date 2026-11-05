import { expect, it } from "vitest";
import {
  validRoomSnapshot,
  WORLD_REVISION,
} from "@minimorph/multiplayer-protocol";
import type { ServerMessage } from "@minimorph/multiplayer-protocol";
import { MatchService } from "./matches";
import type { Peer } from "./matches";
import { TournamentRoom, PODIUM_MS } from "./tournament";

function peer(id: string) {
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
function welcome(p: ReturnType<typeof peer>) {
  const m = p.messages.find((m) => m.type === "welcome");
  if (m?.type !== "welcome") throw Error("Missing welcome");
  return m;
}
function finalFixture() {
  const service = new MatchService(),
    humans = Array.from({ length: 8 }, (_, i) => peer(`human-${i}`));
  for (const [i, human] of humans.entries())
    service.handle(
      human,
      {
        v: 2,
        type: "join",
        mode: i ? "private" : "create",
        name: human.id,
        arenaId: "cosmic-sprint",
        worldRevision: WORLD_REVISION,
        ...(i ? { code: humans[0].room!.code } : {}),
      },
      0,
    );
  const room = humans[0].room as TournamentRoom;
  let now = 3000;
  service.handle(humans[0], { v: 2, type: "start" }, 0);
  service.tick(now);
  const finish = (ids: readonly string[]) => {
    for (const p of room.participants.filter((p) => ids.includes(p.id)))
      Object.assign(p.state, {
        ...room.arena.finish,
        checkpoint: room.arena.checkpoints.length,
      });
    service.tick((now += 34));
  };
  const next = () => {
    for (const delay of [3000, 5000, 1000, 3000]) {
      service.tick((now += delay));
      expect(validRoomSnapshot(room.snapshot(now))).toBe(true);
    }
  };
  // Keep the owner as a connected eliminated spectator for reconnect/rematch.
  finish(humans.slice(1, 7).map((p) => p.participant!.id));
  next();
  finish(room.activeIds);
  return {
    service,
    room,
    humans,
    finish,
    next,
    now: () => now,
    tick: (delay: number) => service.tick((now += delay)),
  };
}
const cases = [
  "normal",
  "equal-time",
  "later-equal-time",
  "all-dnf",
  "withdraw-before-final",
  "withdraw-during-final",
  "withdraw-finished",
  "empty-final",
] as const;
it.each(cases)(
  "one championship order survives %s, completion, reconnect and rematch",
  (scenario) => {
    const f = finalFixture(),
      { room, service, humans } = f;
    const finalists = [...room.qualifiedIds].sort();
    const withdraw = (id: string) =>
      service.handle(
        humans.find((p) => p.participant?.id === id)!,
        { v: 2, type: "leave" },
        f.now(),
      );
    if (scenario === "empty-final") for (const id of finalists) withdraw(id);
    if (scenario === "withdraw-before-final") withdraw(finalists[0]);
    f.next();
    if (scenario !== "empty-final") {
      expect(room.phase).toBe("racing");
      if (scenario === "all-dnf") {
        room.participants.find((p) => p.id === finalists[2])!.state.checkpoint =
          1;
        f.tick(240001);
      } else if (scenario === "later-equal-time") {
        const first = room.participants.find((p) => p.id === finalists[1])!;
        f.finish([first.id]);
        expect(room.championId).toBe(first.id);
        // Observe an equal simulation timestamp in a subsequent authoritative tick.
        const tied = room.participants.find((p) => p.id === finalists[0])!;
        tied.state.elapsed = first.finishTime! - 1 / 120;
        f.finish([tied.id]);
        expect(tied.finishTime).toBe(first.finishTime);
        expect(room.championId).toBe(tied.id);
        for (const id of finalists.slice(2)) withdraw(id);
        f.tick(34);
      } else if (scenario === "normal" || scenario === "withdraw-finished") {
        f.finish([finalists[1]]);
        if (scenario === "withdraw-finished") withdraw(finalists[1]);
        f.finish(finalists.filter((id) => id !== finalists[1]));
      } else {
        if (scenario === "withdraw-during-final") withdraw(finalists[0]);
        f.finish(
          room.activeIds.filter(
            (id) => !room.participants.find((p) => p.id === id)!.withdrawn,
          ),
        );
      }
    }
    expect(room.phase).toBe("tournament-results");
    const final = room.history[2],
      champion = room.placements[0].id;
    expect(room.championId).toBe(champion);
    expect(room.result!.championId).toBe(champion);
    expect(room.result!.rows.map((p) => p.id)).toEqual(
      room.placements.map((p) => p.id),
    );
    expect(room.snapshot(f.now()).tournament!.orderIds).toEqual(
      final.rows.map((p) => p.id),
    );
    if (final.rows.length) {
      expect(final.rows[0].id).toBe(champion);
      expect(
        room.placements.slice(0, final.rows.length).map((p) => p.id),
      ).toEqual(final.rows.map((p) => p.id));
    } else {
      expect(room.activeIds).toEqual([]);
      expect(final.rows).toEqual([]);
      expect(champion).toBe(room.history[1].rows[0].id);
      expect(room.placements[0].roundReached).toBe(2);
    }
    if (scenario === "equal-time")
      expect(final.rows.map((p) => p.id)).toEqual(finalists);
    if (scenario === "all-dnf") expect(champion).toBe(finalists[2]);
    if (scenario === "normal" || scenario === "withdraw-finished")
      expect(champion).toBe(finalists[1]);
    for (const r of room.history)
      for (const row of r.rows)
        if (row.status === "dnf") expect(row.time).toBeNull();
    const frozen = JSON.stringify({
      history: room.history,
      result: room.result,
      placements: room.placements,
    });
    const resume = (current: ReturnType<typeof peer>) => {
      service.disconnect(current, f.now());
      const resumed = peer(`resumed-${f.now()}`);
      service.handle(
        resumed,
        {
          v: 2,
          type: "resume",
          token: welcome(current).token,
          worldRevision: WORLD_REVISION,
        },
        f.now() + 1,
      );
      expect(welcome(resumed).id).toBe(welcome(humans[0]).id);
      expect(validRoomSnapshot(welcome(resumed).snapshot)).toBe(true);
      expect(welcome(resumed).snapshot.tournament!.championId).toBe(champion);
      return resumed;
    };
    const resumed = resume(humans[0]);
    f.tick(PODIUM_MS);
    expect(room.phase).toBe("completed");
    const completed = resume(resumed);
    expect(
      JSON.stringify({
        history: room.history,
        result: room.result,
        placements: room.placements,
      }),
    ).toBe(frozen);
    const owner = [completed, ...humans.slice(1)].find(
      (p) => p.participant?.id === room.ownerId,
    )!;
    service.handle(owner, { v: 2, type: "replay", tournament: 1 }, f.now() + 2);
    expect(room.edition).toBe(2);
    expect(room.phase).toBe("countdown");
    expect(room.championId).toBeNull();
    expect(room.history).toEqual([]);
    expect(room.participants).toHaveLength(8);
    expect(validRoomSnapshot(room.snapshot(f.now() + 2))).toBe(true);
  },
);

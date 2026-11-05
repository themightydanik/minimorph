import { it, expect } from "vitest";
import { TournamentFeedback } from "./tournament-feedback";
import {
  TournamentRoom,
  ROUND_RESULTS_MS,
  INTERMISSION_MS,
  PREPARING_MS,
} from "../../../apps/multiplayer-server/src/tournament";
function next(room: TournamentRoom, now: number) {
  room.advance(now + ROUND_RESULTS_MS, 240);
  room.advance(now + ROUND_RESULTS_MS + INTERMISSION_MS, 240);
  room.advance(now + ROUND_RESULTS_MS + INTERMISSION_MS + PREPARING_MS, 240);
  room.advance(
    now + ROUND_RESULTS_MS + INTERMISSION_MS + PREPARING_MS + 3000,
    240,
  );
  return now + ROUND_RESULTS_MS + INTERMISSION_MS + PREPARING_MS + 3000;
}
it("qualification feedback repeats neither on snapshots nor reconnect, but a real rematch can qualify again", () => {
  const room = new TournamentRoom(undefined, 0, 0),
    id = room.participants[0].id,
    feedback = new TournamentFeedback();
  feedback.seed(room.snapshot(0), id);
  expect(feedback.observe(room.snapshot(0), id)).toEqual([]);
  room.start(0);
  room.advance(3000, 240);
  room.advance(243001, 240);
  const result = room.snapshot(243001);
  expect(feedback.observe(result, id)).toEqual(["checkpoint"]);
  expect(feedback.observe(result, id)).toEqual([]);
  const resumed = new TournamentFeedback();
  resumed.seed(result, id);
  expect(resumed.observe(result, id)).toEqual([]);
  let now = 243001;
  for (
    let tick = 0;
    tick < 30 * 700 && room.phase !== "tournament-results";
    tick++
  ) {
    now += 1000 / 30;
    room.advance(now, 240);
  }
  expect(room.phase).toBe("tournament-results");
  feedback.seed(room.snapshot(now), id);
  expect(feedback.observe(room.snapshot(now), id)).toEqual([]);
  expect(room.replay(now + 1)).toBe(true);
  expect(feedback.observe(room.snapshot(now + 1), id)).toEqual([]);
  room.advance(now + 3001, 240);
  room.advance(now + 243002, 240);
  expect(feedback.observe(room.snapshot(now + 243002), id)).toEqual([
    "checkpoint",
  ]);
});
it("individual finish feedback survives automatic spectating and is distinct from qualification and global champion reveal", () => {
  const room = new TournamentRoom(undefined, 0, 0),
    id = room.participants[0].id,
    feedback = new TournamentFeedback();
  feedback.seed(room.snapshot(0), id);
  room.start(0);
  room.advance(3000, 240);
  const me = room.participants[0];
  Object.assign(me.state, {
    ...room.arena.finish,
    checkpoint: room.arena.checkpoints.length,
  });
  room.advance(3034, 240);
  expect(feedback.observe(room.snapshot(3034), id)).toEqual(["finish"]);
  expect(feedback.observe(room.snapshot(3034), id)).toEqual([]);
  room.finish(3035);
  const result = room.snapshot(3035);
  expect(feedback.observe(result, id)).toEqual(["checkpoint"]);
  const resumed = new TournamentFeedback();
  resumed.seed(result, id);
  expect(resumed.observe(result, id)).toEqual([]);
  let now = next(room, 3035);
  for (const p of room.participants
    .filter((p) => room.activeIds.includes(p.id) && p.id !== id)
    .slice(0, 4))
    Object.assign(p.state, {
      ...room.arena.finish,
      checkpoint: room.arena.checkpoints.length,
    });
  room.advance(now + 34, 240);
  now += 34;
  expect(feedback.observe(room.snapshot(now), id)).toEqual(["collision"]);
  expect(me.status).toBe("eliminated");
  now = next(room, now);
  expect(feedback.observe(room.snapshot(now), id)).toEqual(["start"]);
  const champion = room.participants.find((p) =>
    room.activeIds.includes(p.id),
  )!;
  Object.assign(champion.state, {
    ...room.arena.finish,
    checkpoint: room.arena.checkpoints.length,
  });
  room.advance(now + 34, 240);
  expect(room.championId).toBe(champion.id);
  expect(feedback.observe(room.snapshot(now + 34), id)).toEqual(["victory"]);
  expect(feedback.observe(room.snapshot(now + 34), id)).toEqual([]);
  resumed.seed(room.snapshot(now + 34), id);
  expect(resumed.observe(room.snapshot(now + 34), id)).toEqual([]);
});

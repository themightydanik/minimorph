import { it, expect, vi } from "vitest";
import { MultiplayerClient } from "./index";
import {
  TournamentRoom,
  ROUND_RESULTS_MS,
  INTERMISSION_MS,
  PREPARING_MS,
} from "../../../apps/multiplayer-server/src/tournament";
import type { RoomSnapshot } from "@minimorph/multiplayer-protocol";
class Socket {
  static OPEN = 1;
  static instance: Socket;
  readyState = 1;
  bufferedAmount = 0;
  sent: string[] = [];
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: () => void;
  onerror?: () => void;
  constructor() {
    Socket.instance = this;
  }
  send(m: string) {
    this.sent.push(m);
  }
  close() {
    this.readyState = 2;
  }
}
it("client binds commands to rounds, resets prediction at transitions, rejects regressive states and spectates without movement packets", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", Socket);
  const room = new TournamentRoom(undefined, 0, 0),
    human = room.add("Human"),
    states: string[] = [];
  const client = new MultiplayerClient(
    "ws://test/ws",
    () => ({ x: 0, z: -1, jump: false }),
    { onState: (s) => states.push(s), onSnapshot() {}, onWelcome() {} },
  );
  const deliver = (s: RoomSnapshot) =>
    Socket.instance.onmessage?.({
      data: JSON.stringify({ v: 2, type: "snapshot", snapshot: s }),
    });
  try {
    client.connect({
      v: 2,
      type: "join",
      mode: "quick",
      name: "Human",
      arenaId: "cosmic-sprint",
    });
    Socket.instance.onopen?.();
    Socket.instance.onmessage?.({
      data: JSON.stringify({
        v: 2,
        type: "welcome",
        id: human.id,
        token: "a".repeat(43),
        snapshot: room.snapshot(0),
      }),
    });
    room.start(0);
    room.advance(3000, 240);
    const roundOne = structuredClone(room.snapshot(3000));
    deliver(roundOne);
    await vi.advanceTimersByTimeAsync(100);
    const packets = () =>
      Socket.instance.sent
        .map((s) => JSON.parse(s))
        .filter((m) => m.type === "input");
    expect(packets().length).toBeGreaterThan(0);
    expect(packets()[0].command).toMatchObject({ round: 1, tournament: 1 });
    for (const p of room.participants.filter((p) => p.bot))
      Object.assign(p.state, {
        ...room.arena.finish,
        checkpoint: room.arena.checkpoints.length,
      });
    room.advance(3034, 240);
    deliver(room.snapshot(3034));
    expect(human.status).toBe("eliminated");
    expect(client.prediction.pending).toEqual([]);
    const sent = packets().length;
    await vi.advanceTimersByTimeAsync(200);
    expect(packets()).toHaveLength(sent);
    room.advance(3034 + ROUND_RESULTS_MS, 240);
    room.advance(3034 + ROUND_RESULTS_MS + INTERMISSION_MS, 240);
    room.advance(3034 + ROUND_RESULTS_MS + INTERMISSION_MS + PREPARING_MS, 240);
    room.advance(
      3034 + ROUND_RESULTS_MS + INTERMISSION_MS + PREPARING_MS + 3000,
      240,
    );
    deliver(room.snapshot(15034));
    expect(client.snapshot?.arenaId).toBe("orbit-chaos");
    const frame = client.frame()!;
    expect(frame.spectating).toBe(true);
    expect(frame.viewingId).not.toBe(human.id);
    expect(frame.remotes).toHaveLength(5);
    expect(frame.remotes.every((p) => room.activeIds.includes(p.id))).toBe(
      true,
    );
    const first = frame.viewingId;
    client.spectate(1);
    expect(client.frame()!.viewingId).not.toBe(first);
    deliver(roundOne);
    expect(client.snapshot?.tournament?.round).toBe(2);
    expect(client.prediction.pending).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    expect(packets()).toHaveLength(sent);
    deliver({ ...room.snapshot(15034), arenaId: "cosmic-sprint" });
    expect(states.at(-1)).toBe("unavailable");
  } finally {
    client.stop();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});

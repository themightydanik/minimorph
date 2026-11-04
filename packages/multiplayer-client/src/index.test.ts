import { it, expect } from "vitest";
import {
  createPlayer,
  stepArenaPlayer,
  FIXED_STEP,
} from "@minimorph/game-simulation";
import { arenas } from "@minimorph/game-content";
import { Prediction, interpolate } from "./index";
import type { ParticipantSnapshot } from "@minimorph/multiplayer-protocol";
it("reconciliation discards acknowledged inputs and replays only the unacknowledged commands", () => {
  const p = new Prediction(),
    initial = createPlayer(arenas[0]);
  p.receive(initial, 0, arenas[0].id, true);
  const one = p.command({ x: 0, z: -1, jump: false }, 0),
    two = p.command({ x: 0, z: -1, jump: true }, 0),
    server = structuredClone(initial);
  for (let i = 0; i < 4; i++)
    stepArenaPlayer(
      server,
      { ...one, cameraYaw: one.yaw },
      FIXED_STEP,
      arenas[0],
    );
  p.receive(server, 1, arenas[0].id, true);
  const expected = structuredClone(server);
  for (let i = 0; i < 4; i++)
    stepArenaPlayer(
      expected,
      { ...two, jump: two.jump && i === 0, cameraYaw: two.yaw },
      FIXED_STEP,
      arenas[0],
    );
  expect(p.pending).toHaveLength(1);
  expect(p.local).toEqual(expected);
});
it("remote interpolation smooths heading across wrapping and snaps safe checkpoint respawns", () => {
  const state = createPlayer(arenas[0]),
    a = {
      id: "a",
      name: "A",
      bot: false,
      color: 0,
      connected: true,
      ack: 0,
      status: "racing",
      finishTime: null,
      state: { ...state, x: 0, heading: 3.1 },
    } as ParticipantSnapshot;
  const b = { ...a, state: { ...state, x: 2, heading: -3.1 } };
  expect(interpolate(a, b, 0.5).state.x).toBe(1);
  expect(Math.abs(interpolate(a, b, 0.5).state.heading)).toBeCloseTo(Math.PI);
  const respawn = { ...b, state: { ...state, z: 90, respawns: 1 } };
  expect(interpolate(a, respawn, 0.1)).toBe(respawn);
});
it("a silent half-open socket starts recovery without waiting for its close handshake", async () => {
  const { vi } = await import("vitest");
  const { MultiplayerClient } = await import("./index");
  class Socket {
    static OPEN = 1;
    static instances: Socket[] = [];
    readyState = 1;
    sent: string[] = [];
    onopen?: () => void;
    onclose?: () => void;
    onmessage?: (e: { data: string }) => void;
    onerror?: () => void;
    bufferedAmount = 0;
    constructor() {
      Socket.instances.push(this);
    }
    send(s: string) {
      this.sent.push(s);
    }
    close() {
      this.readyState = 2;
    }
  }
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", Socket);
  const states: string[] = [];
  const client = new MultiplayerClient(
    "ws://test.local/ws",
    () => ({ x: 0, z: 0, jump: false }),
    {
      onState: (s) => states.push(s),
      onWelcome: () => {},
      onSnapshot: () => {},
    },
  );
  try {
    client.connect({
      v: 2,
      type: "join",
      mode: "quick",
      name: "Tester",
      arenaId: arenas[0].id,
    });
    const first = Socket.instances[0];
    first.onopen?.();
    first.onmessage?.({
      data: JSON.stringify({
        v: 2,
        type: "welcome",
        id: "human",
        token: "a".repeat(43),
        snapshot: {
          roomId: "room",
          ownerId: "human",
          arenaId: arenas[0].id,
          phase: "racing",
          tick: 0,
          elapsed: 0,
          serverTime: Date.now(),
          startAt: Date.now(),
          waitUntil: Date.now(),
          participants: [
            {
              id: "human",
              name: "Tester",
              bot: false,
              color: 0,
              connected: true,
              ack: 0,
              status: "racing",
              finishTime: null,
              state: createPlayer(arenas[0]),
            },
          ],
        },
      }),
    });
    await vi.advanceTimersByTimeAsync(9000);
    expect(first.readyState).toBe(2);
    expect(states).toContain("reconnecting");
    expect(Socket.instances.length).toBeGreaterThan(1);
    const second = Socket.instances.at(-1)!;
    second.onopen?.();
    expect(JSON.parse(second.sent[0])).toMatchObject({
      type: "resume",
      token: "a".repeat(43),
    });
  } finally {
    client.stop();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
it('dive prediction and replay exactly match authoritative substeps through slide and recovery', () => {
  const prediction = new Prediction(), server = createPlayer(arenas[0]);
  prediction.receive(server, 0, arenas[0].id, true);
  const actions = new Set<string>();
  for (let n = 0; n < 80; n++) {
    const command = prediction.command({ x: .13, z: -.65, jump: n === 5, dive: n === 12 }, .1);
    for (let i = 0; i < 4; i++) stepArenaPlayer(server, {
      ...command, cameraYaw: command.yaw, jump: command.jump && i === 0, dive: command.dive && i === 0,
    }, FIXED_STEP, arenas[0]);
    actions.add(server.action);
    expect(prediction.local).toEqual(server);
    if (n % 4 === 0) prediction.receive(server, command.seq, arenas[0].id, true);
  }
  expect([...actions]).toEqual(expect.arrayContaining(['normal', 'dive', 'slide', 'recover']));
});

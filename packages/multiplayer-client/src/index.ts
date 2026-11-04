import { getArena } from "@minimorph/game-content";
import {
  stepArenaPlayer,
  FIXED_STEP,
  wrapAngle,
} from "@minimorph/game-simulation";
import type { PlayerState, Input } from "@minimorph/game-simulation";
import type {
  InputCommand,
  ClientMessage,
  ServerMessage,
  RoomSnapshot,
  ParticipantSnapshot,
} from "@minimorph/multiplayer-protocol";
export type ConnectionState =
  | "connecting"
  | "waiting"
  | "starting"
  | "racing"
  | "finished"
  | "reconnecting"
  | "unavailable";
export interface OnlineFrame {
  local: PlayerState;
  remotes: ParticipantSnapshot[];
  elapsed: number;
  phase: RoomSnapshot["phase"];
  yaw: number;
}
export interface OnlineDriver {
  frame(now: number): OnlineFrame | undefined;
}
export class Prediction {
  pending: InputCommand[] = [];
  local?: PlayerState;
  seq = 0;
  arenaId = "cosmic-sprint";
  receive(state: PlayerState, ack: number, arenaId: string, racing: boolean) {
    this.arenaId = arenaId;
    this.seq = Math.max(this.seq, ack);
    this.pending = this.pending.filter((c) => c.seq > ack);
    this.local = structuredClone(state);
    if (racing) for (const c of this.pending) this.simulate(c);
    else this.pending = [];
  }
  simulate(c: InputCommand) {
    if (!this.local) return;
    for (let i = 0; i < 4; i++)
      stepArenaPlayer(
        this.local,
        { x: c.x, z: c.z, jump: c.jump && i === 0, cameraYaw: c.yaw },
        FIXED_STEP,
        getArena(this.arenaId),
      );
  }
  command(input: Input, yaw: number) {
    const c = {
      seq: ++this.seq,
      x: input.x,
      z: input.z,
      jump: input.jump,
      yaw,
    };
    this.pending.push(c);
    this.simulate(c);
    return c;
  }
}
export function interpolate(
  a: ParticipantSnapshot,
  b: ParticipantSnapshot,
  t: number,
): ParticipantSnapshot {
  if (
    a.state.respawns !== b.state.respawns ||
    Math.hypot(a.state.x - b.state.x, a.state.z - b.state.z) > 8
  )
    return b;
  return {
    ...b,
    state: {
      ...b.state,
      x: a.state.x + (b.state.x - a.state.x) * t,
      y: a.state.y + (b.state.y - a.state.y) * t,
      z: a.state.z + (b.state.z - a.state.z) * t,
      heading:
        a.state.heading + wrapAngle(b.state.heading - a.state.heading) * t,
    },
  };
}
interface Callbacks {
  onState: (state: ConnectionState, message: string) => void;
  onSnapshot: (s: RoomSnapshot, id: string) => void;
  onWelcome: (s: RoomSnapshot, id: string) => void;
}
export class MultiplayerClient implements OnlineDriver {
  readonly prediction = new Prediction();
  id = "";
  snapshot?: RoomSnapshot;
  yaw = 0;
  rtt = 0;
  private ws?: WebSocket;
  private token = "";
  private connected = false;
  private stopped = false;
  private generation = 0;
  private lostAt = 0;
  private retry?: ReturnType<typeof setTimeout>;
  private interval?: ReturnType<typeof setInterval>;
  private snapshots: RoomSnapshot[] = [];
  private offset = 0;
  private lastMessage = 0;
  private lastPing = 0;
  constructor(
    private url: string,
    private input: () => Input,
    private callbacks: Callbacks,
  ) {}
  connect(join: Extract<ClientMessage, { type: "join" }>) {
    this.stopped = false;
    this.open(join);
    if (this.stopped) return;
    let next = performance.now();
    this.interval = setInterval(() => {
      const now = performance.now();
      let catchup = 0;
      while (now >= next && catchup++ < 3) {
        this.tick();
        next += 1000 / 30;
      }
      if (now - next > 1000) next = now;
    }, 5);
  }
  private send(m: ClientMessage) {
    if (
      this.ws?.readyState === WebSocket.OPEN &&
      this.ws.bufferedAmount < 16384
    )
      this.ws.send(JSON.stringify(m));
  }
  private open(join?: Extract<ClientMessage, { type: "join" }>) {
    if (this.stopped) return;
    const generation = ++this.generation;
    this.callbacks.onState(
      this.token ? "reconnecting" : "connecting",
      this.token
        ? "Reconnecting to your race…"
        : "Connecting… Free server startup can take a minute.",
    );
    let ws: WebSocket;
    try {
      const endpoint = new URL(this.url);
      if (
        !["ws:", "wss:"].includes(endpoint.protocol) ||
        endpoint.username ||
        endpoint.password
      )
        throw Error("Invalid WebSocket URL");
      if (endpoint.pathname === "/") endpoint.pathname = "/ws";
      ws = new WebSocket(endpoint.href);
    } catch {
      this.fail("Invalid multiplayer server URL.");
      return;
    }
    this.ws = ws;
    this.lastMessage = Date.now();
    ws.onopen = () => {
      if (generation !== this.generation) return;
      this.lastMessage = Date.now();
      this.send(
        this.token ? { v: 1, type: "resume", token: this.token } : join!,
      );
    };
    ws.onmessage = (event) => {
      if (
        generation !== this.generation ||
        typeof event.data !== "string" ||
        event.data.length > 131072
      )
        return;
      let m: ServerMessage;
      try {
        m = JSON.parse(event.data);
      } catch {
        return;
      }
      if (m.v !== 1) return;
      this.lastMessage = Date.now();
      if (m.type === "error") {
        if (
          [
            "session_expired",
            "room_expired",
            "invalid_code",
            "room_full",
            "already_started",
            "server_full",
            "not_owner",
            "bad_arena",
            "rate_limited",
            "bad_message",
          ].includes(m.code)
        )
          this.fail(m.message);
        return;
      }
      if (m.type === "pong") {
        this.rtt = Date.now() - m.sent;
        this.offset =
          this.offset * 0.8 + (m.serverTime + this.rtt / 2 - Date.now()) * 0.2;
        return;
      }
      if (m.type !== "welcome" && m.type !== "snapshot") return;
      const s = m.snapshot;
      if (
        !s ||
        !Array.isArray(s.participants) ||
        s.participants.length > 8 ||
        !s.participants.every(
          (p) =>
            p.state && Number.isFinite(p.state.x) && Number.isFinite(p.state.z),
        )
      )
        return;
      if (m.type === "welcome") {
        this.id = m.id;
        this.token = m.token;
        this.connected = true;
        this.lostAt = 0;
        this.offset = s.serverTime - Date.now();
        this.prediction.pending = [];
        this.prediction.seq =
          s.participants.find((p) => p.id === m.id)?.ack ?? 0;
        this.callbacks.onWelcome(s, this.id);
      }
      this.snapshot = s;
      this.snapshots.push(s);
      if (this.snapshots.length > 30) this.snapshots.shift();
      const local = s.participants.find((p) => p.id === this.id);
      if (local)
        this.prediction.receive(
          local.state,
          local.ack,
          s.arenaId,
          s.phase === "racing" && local.status === "racing",
        );
      this.callbacks.onSnapshot(s, this.id);
      this.callbacks.onState(
        s.phase === "countdown" ? "starting" : s.phase,
        s.phase === "waiting" ? "Waiting for players…" : "",
      );
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      if (this.stopped || generation !== this.generation) return;
      this.connected = false;
      if (!this.token) {
        this.fail("Server unavailable or waking up. Wait a moment and retry.");
        return;
      }
      this.retryConnection();
    };
  }
  private retryConnection() {
    this.connected = false;
    this.lostAt ||= Date.now();
    if (Date.now() - this.lostAt >= 19000) {
      this.fail("Reconnection expired. Join a new match.");
      return;
    }
    this.callbacks.onState(
      "reconnecting",
      "Connection lost. Reclaiming your slot…",
    );
    this.retry = setTimeout(
      () => this.open(),
      Math.min(2500, 500 + (Date.now() - this.lostAt) / 5),
    );
  }
  private tick() {
    const now = Date.now();
    if (this.stopped) return;
    if (this.token && this.lostAt && now - this.lostAt >= 19000) {
      this.fail("Reconnection expired. Join a new match.");
      return;
    }
    if (
      now - this.lastMessage > 8000 &&
      this.ws?.readyState === WebSocket.OPEN
    ) {
      if (!this.token) {
        this.fail("Server unavailable. Please retry.");
        return;
      }
      this.generation++;
      this.ws.close();
      this.retryConnection();
      return;
    }
    // A sleeping free service has no welcome/token yet. Bound initial connection time, then offer explicit retry.
    if (now - this.lastMessage > 60000 && !this.connected) {
      this.fail("Server unavailable or still waking. Please retry.");
      return;
    }
    if (!this.connected) return;
    if (now - this.lastPing > 3000) {
      this.lastPing = now;
      this.send({ v: 1, type: "ping", sent: now });
    }
    const input = this.input();
    this.yaw = wrapAngle(this.yaw + ((input.cameraTurn ?? 0) / 30) * 1.5);
    if (
      this.snapshot?.phase !== "racing" ||
      this.prediction.pending.length >= 30
    )
      return;
    const me = this.snapshot.participants.find((p) => p.id === this.id);
    if (me?.status !== "racing") return;
    this.send({
      v: 1,
      type: "input",
      command: this.prediction.command(input, this.yaw),
    });
  }
  frame(now = Date.now()): OnlineFrame | undefined {
    if (!this.snapshot || !this.prediction.local) return;
    const target = now + this.offset - 150;
    let a = this.snapshots[0],
      b = this.snapshots.at(-1)!;
    for (let i = 1; i < this.snapshots.length; i++)
      if (this.snapshots[i].serverTime >= target) {
        a = this.snapshots[i - 1];
        b = this.snapshots[i];
        break;
      }
    const t = Math.max(
      0,
      Math.min(
        1,
        (target - a.serverTime) / Math.max(1, b.serverTime - a.serverTime),
      ),
    );
    const remotes = b.participants
      .filter((p) => p.id !== this.id)
      .map((p) =>
        interpolate(a.participants.find((q) => q.id === p.id) ?? p, p, t),
      );
    return {
      local: this.prediction.local,
      remotes,
      elapsed: this.snapshot.elapsed,
      phase: this.snapshot.phase,
      yaw: this.yaw,
    };
  }
  startMatch() {
    this.send({ v: 1, type: "start" });
  }
  private fail(message: string) {
    this.callbacks.onState("unavailable", message);
    this.stop(false);
  }
  stop(leave = true) {
    this.stopped = true;
    this.connected = false;
    this.generation++;
    if (leave) this.send({ v: 1, type: "leave" });
    this.ws?.close();
    if (this.interval) clearInterval(this.interval);
    if (this.retry) clearTimeout(this.retry);
    this.token = "";
  }
}

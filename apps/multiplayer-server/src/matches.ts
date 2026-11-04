import { randomBytes, randomUUID, createHash } from "node:crypto";
import { getArena, arenas } from "@minimorph/game-content";
import type { ArenaConfig } from "@minimorph/game-content";
import {
  ArenaRuntime,
  createPlayer,
  stepArenaPlayer,
  FIXED_STEP,
} from "@minimorph/game-simulation";
import type { Input, PlayerState } from "@minimorph/game-simulation";
import {
  commandInput,
  CAPACITY,
  RECONNECT_MS,
} from "@minimorph/multiplayer-protocol";
import type {
  ClientMessage,
  ServerMessage,
  InputCommand,
  Skill,
  RoomSnapshot,
  MatchResult,
  RoomPhase,
} from "@minimorph/multiplayer-protocol";
import { botInput } from "./bots";
export interface ResultStore {
  save(result: MatchResult): Promise<void>;
  flush?(): Promise<void>;
}
export class MemoryResults implements ResultStore {
  readonly records: MatchResult[] = [];
  async save(r: MatchResult) {
    this.records.push(r);
    if (this.records.length > 100) this.records.shift();
  }
}
export interface Peer {
  id: string;
  send(message: ServerMessage): void;
  close(): void;
  participant?: Participant;
  room?: Room;
  lastSeen: number;
}
export interface Participant {
  id: string;
  name: string;
  bot: boolean;
  skill?: Skill;
  color: number;
  state: PlayerState;
  world: ArenaRuntime;
  peer?: Peer;
  tokenHash?: string;
  expiresAt: number;
  ack: number;
  lastSeq: number;
  commands: InputCommand[];
  lastInput: Input;
  inputAt: number;
  status: "racing" | "finished" | "dnf";
  finishTime: number | null;
}
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const idle: Input = { x: 0, z: 0, jump: false };
export class Room {
  readonly id = randomUUID();
  readonly arena: ArenaConfig;
  readonly participants: Participant[] = [];
  readonly collapseTimes: Record<string, number> = {};
  phase: RoomPhase = "waiting";
  tick = 0;
  elapsed = 0;
  startAt: number | null = null;
  result?: MatchResult;
  ownerId = "";
  lastActive: number;
  constructor(
    readonly arenaId: string,
    readonly code: string | undefined,
    readonly waitUntil: number,
    readonly createdAt: number,
  ) {
    this.arena = getArena(arenaId);
    this.lastActive = createdAt;
  }
  add(name: string, bot = false, skill?: Skill) {
    const i = Array.from({ length: CAPACITY }, (_, i) => i).find(
      (i) => !this.participants.some((p) => p.color === i),
    );
    if (i === undefined) throw new Error("Room capacity exceeded");
    const state = createPlayer(this.arena);
    state.collapseTimes = this.collapseTimes;
    // Two safe rows entirely on the existing start deck. Participants are non-solid to one another.
    state.x = [-1.8, -0.6, 0.6, 1.8][i % 4];
    state.z = 2 + Math.floor(i / 4) * 2;
    const p: Participant = {
      id: randomUUID(),
      name,
      bot,
      skill,
      color: i,
      state,
      world: new ArenaRuntime(this.arena),
      expiresAt: Infinity,
      ack: 0,
      lastSeq: 0,
      commands: [],
      lastInput: idle,
      inputAt: 0,
      status: "racing",
      finishTime: null,
    };
    this.participants.push(p);
    if (!bot && !this.ownerId) this.ownerId = p.id;
    return p;
  }
  snapshot(now: number): RoomSnapshot {
    return {
      roomId: this.id,
      code: this.code,
      ownerId: this.ownerId,
      arenaId: this.arenaId,
      phase: this.phase,
      tick: this.tick,
      elapsed: this.elapsed,
      serverTime: now,
      startAt: this.startAt,
      waitUntil: this.waitUntil,
      result: this.result,
      participants: this.participants.map((p) => ({
        id: p.id,
        name: p.name,
        bot: p.bot,
        skill: p.skill,
        color: p.color,
        connected: !!p.peer || p.bot,
        ack: p.ack,
        status: p.status,
        finishTime: p.finishTime,
        state: p.state,
      })),
    };
  }
  start(now: number) {
    if (this.phase !== "waiting") return;
    while (this.participants.length < CAPACITY) {
      const i = this.participants.length,
        skill: Skill = (["easy", "normal", "hard"] as const)[i % 3];
      this.add(
        `${skill[0].toUpperCase() + skill.slice(1)} Cadet ${i + 1}`,
        true,
        skill,
      );
    }
    this.phase = "countdown";
    this.startAt = now + 3000;
  }
  simulate() {
    const controls = new Map<Participant, Input>();
    for (const p of this.participants) {
      if (p.status !== "racing") continue;
      if (p.bot) {
        if (this.tick % 3 === 0)
          p.lastInput = botInput(p.state, this.arena, p.world, p.skill!);
        controls.set(p, p.lastInput);
      } else {
        const c = p.commands.shift();
        if (c) {
          p.ack = c.seq;
          p.lastInput = commandInput(c);
        }
        controls.set(p, p.peer ? p.lastInput : idle);
      }
    }
    for (let sub = 0; sub < 4; sub++) {
      for (const [p, input] of controls) {
        if (p.status !== "racing") continue;
        stepArenaPlayer(
          p.state,
          { ...input, jump: input.jump && sub === 0 },
          FIXED_STEP,
          this.arena,
          p.world,
        );
        if (p.state.won) {
          p.status = "finished";
          p.finishTime = p.state.elapsed;
        }
      }
    }
    for (const p of this.participants)
      p.lastInput = { ...p.lastInput, jump: false };
    this.tick++;
    this.elapsed = this.tick / 30;
  }
  finish(now: number) {
    for (const participant of this.participants) {
      if (participant.status === "racing") participant.status = "dnf";
    }
    this.phase = "finished";
    this.lastActive = now;
    const sorted = [...this.participants].sort((a, b) => {
      if (a.finishTime !== null || b.finishTime !== null)
        return (
          (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity) ||
          a.id.localeCompare(b.id)
        );
      return (
        b.state.checkpoint - a.state.checkpoint ||
        a.state.z - b.state.z ||
        a.id.localeCompare(b.id)
      );
    });
    this.result = {
      roomId: this.id,
      arenaId: this.arenaId,
      endedAt: now,
      rows: sorted.map((p, i) => ({
        id: p.id,
        name: p.name,
        bot: p.bot,
        place: i + 1,
        status: p.finishTime === null ? "dnf" : "finished",
        time: p.finishTime,
      })),
    };
  }
}
export class MatchService {
  readonly rooms = new Map<string, Room>();
  readonly tokens = new Map<string, { room: Room; p: Participant }>();
  storeFailures = 0;
  constructor(
    readonly store: ResultStore = new MemoryResults(),
    readonly options = { maxRooms: 32, timeoutSeconds: 240 },
  ) {}
  error(peer: Peer, code: string, message: string) {
    peer.send({ v: 1, type: "error", code, message });
  }
  issue(peer: Peer, room: Room, p: Participant, now: number) {
    if (p.tokenHash) this.tokens.delete(p.tokenHash);
    const token = randomBytes(32).toString("base64url");
    p.tokenHash = digest(token);
    this.tokens.set(p.tokenHash, { room, p });
    const old = p.peer;
    p.peer = peer;
    peer.participant = p;
    peer.room = room;
    p.expiresAt = Infinity;
    p.commands = [];
    p.lastInput = idle;
    p.lastSeq = p.ack;
    if (old && old !== peer) {
      old.participant = undefined;
      old.room = undefined;
      old.close();
    }
    peer.send({
      v: 1,
      type: "welcome",
      id: p.id,
      token,
      snapshot: room.snapshot(now),
    });
  }
  handle(peer: Peer, m: ClientMessage, now: number) {
    peer.lastSeen = now;
    if (m.type === "ping") {
      peer.send({ v: 1, type: "pong", sent: m.sent, serverTime: now });
      return;
    }
    if (m.type === "resume") {
      const found = this.tokens.get(digest(m.token));
      if (!found || found.p.expiresAt < now || found.p.status === "dnf") {
        this.error(
          peer,
          "session_expired",
          "Your session expired. Join a new match.",
        );
        return;
      }
      if (peer.participant) {
        this.error(peer, "already_joined", "Leave the current room first.");
        return;
      }
      this.issue(peer, found.room, found.p, now);
      return;
    }
    if (m.type === "join") {
      if (peer.participant) {
        this.error(peer, "already_joined", "Leave the current room first.");
        return;
      }
      if (!arenas.some((a) => a.id === m.arenaId)) {
        this.error(peer, "bad_arena", "Unknown arena.");
        return;
      }
      let room: Room | undefined;
      if (m.mode === "private") {
        if (!m.code) {
          this.error(peer, "invalid_code", "Enter a valid invitation code.");
          return;
        }
        room = [...this.rooms.values()].find((r) => r.code === m.code);
        if (!room) {
          this.error(peer, "invalid_code", "Room code is invalid or expired.");
          return;
        }
        if (room.phase !== "waiting") {
          this.error(peer, "already_started", "This race has already started.");
          return;
        }
        if (room.participants.length >= CAPACITY) {
          this.error(
            peer,
            "room_full",
            "This room already has eight participants.",
          );
          return;
        }
      } else if (m.mode === "quick")
        room = [...this.rooms.values()].find(
          (r) =>
            !r.code &&
            r.phase === "waiting" &&
            r.arenaId === m.arenaId &&
            r.participants.length < CAPACITY,
        );
      if (!room) {
        if (this.rooms.size >= this.options.maxRooms) {
          this.error(
            peer,
            "server_full",
            "Server is full. Please retry shortly.",
          );
          return;
        }
        let code: string | undefined;
        if (m.mode === "create") {
          do {
            code = Array.from(
              randomBytes(6),
              (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32],
            ).join("");
          } while ([...this.rooms.values()].some((r) => r.code === code));
        }
        room = new Room(m.arenaId, code, now + 15000, now);
        this.rooms.set(room.id, room);
      }
      this.issue(peer, room, room.add(m.name.trim()), now);
      if (!room.code && room.participants.length === CAPACITY) room.start(now);
      return;
    }
    const p = peer.participant,
      room = peer.room;
    if (!p || !room || p.peer !== peer) {
      this.error(peer, "not_joined", "Join a room first.");
      return;
    }
    if (m.type === "leave") {
      this.disconnect(peer, now, true);
      return;
    }
    if (m.type === "start") {
      if (room.ownerId !== p.id || !room.code || room.phase !== "waiting") {
        this.error(
          peer,
          "not_owner",
          "Only the waiting private room owner can start.",
        );
        return;
      }
      room.start(now);
      return;
    }
    if (m.type === "input") {
      const c = m.command;
      if (room.phase !== "racing" || p.status !== "racing") return;
      if (
        c.seq <= p.lastSeq ||
        c.seq > p.lastSeq + 120 ||
        p.commands.length >= 8
      ) {
        this.error(peer, "input_sequence", "Input is stale or too far ahead.");
        return;
      }
      p.lastSeq = c.seq;
      p.commands.push(c);
      p.inputAt = now;
    }
  }
  disconnect(peer: Peer, now: number, permanent = false) {
    const p = peer.participant,
      room = peer.room;
    if (!p || !room || p.peer !== peer) return;
    p.peer = undefined;
    p.commands = [];
    p.lastInput = idle;
    p.expiresAt = permanent ? now - 1 : now + RECONNECT_MS;
    peer.participant = undefined;
    peer.room = undefined;
    if (permanent) this.expire(room, p);
  }
  private expire(room: Room, p: Participant) {
    if (p.tokenHash) this.tokens.delete(p.tokenHash);
    p.tokenHash = undefined;
    if (room.phase === "waiting") {
      room.participants.splice(room.participants.indexOf(p), 1);
      if (room.ownerId === p.id)
        room.ownerId = room.participants.find((p) => !p.bot)?.id ?? "";
    } else if (p.status === "racing") p.status = "dnf";
  }
  tick(now: number) {
    for (const room of this.rooms.values()) {
      for (const p of [...room.participants]) {
        if (!p.bot && !p.peer && p.expiresAt < now && p.tokenHash)
          this.expire(room, p);
        if (!p.bot && now - p.inputAt > 250) {
          p.lastInput = idle;
        }
      }
      if (room.phase === "waiting") {
        if (
          !room.code &&
          now >= room.waitUntil &&
          room.participants.some((p) => !!p.peer)
        )
          room.start(now);
        if (!room.participants.length || now - room.createdAt > 600000) {
          this.remove(room);
          continue;
        }
      }
      if (room.phase === "countdown" && now >= room.startAt!)
        room.phase = "racing";
      if (room.phase === "racing") {
        room.simulate();
        if (
          room.elapsed >= this.options.timeoutSeconds ||
          room.participants.every((p) => p.status !== "racing")
        ) {
          room.finish(now);
          void this.store.save(room.result!).catch(() => this.storeFailures++);
        }
      }
      if (room.phase === "finished" && now - room.lastActive > 120000)
        this.remove(room);
    }
  }
  remove(room: Room) {
    for (const p of room.participants) {
      if (p.tokenHash) this.tokens.delete(p.tokenHash);
      if (p.peer) {
        p.peer.room = undefined;
        p.peer.participant = undefined;
        this.error(p.peer, "room_expired", "Room expired. Join a new match.");
      }
    }
    this.rooms.delete(room.id);
  }
}

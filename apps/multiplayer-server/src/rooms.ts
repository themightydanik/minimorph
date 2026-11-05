import { randomUUID } from "node:crypto";
import { getArena } from "@minimorph/game-content";
import type { ArenaConfig } from "@minimorph/game-content";
import {
  ArenaRuntime,
  createPlayer,
  stepArenaPlayer,
  FIXED_STEP,
} from "@minimorph/game-simulation";
import type { Input, PlayerState } from "@minimorph/game-simulation";
import {
  WORLD_REVISION,
  commandInput,
  CAPACITY,
} from "@minimorph/multiplayer-protocol";
import type {
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
  withdrawn?: boolean;
  status: "racing" | "finished" | "dnf" | "eliminated";
  finishTime: number | null;
}
const idle: Input = { x: 0, z: 0, jump: false };
export class Room {
  readonly id = randomUUID();
  arena: ArenaConfig;
  readonly participants: Participant[] = [];
  collapseTimes: Record<string, number> = {};
  phase: RoomPhase = "waiting";
  tick = 0;
  elapsed = 0;
  startAt: number | null = null;
  result?: MatchResult;
  ownerId = "";
  lastActive: number;
  constructor(
    public arenaId: string,
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
      worldRevision: WORLD_REVISION,
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
          { ...input, jump: input.jump && sub === 0, dive: !!input.dive },
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
    // Dive is a held level: only a neutral/new command or stale-input timeout releases it.
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

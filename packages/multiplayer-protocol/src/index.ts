import type { PlayerState, Input } from "@minimorph/game-simulation";
export const PROTOCOL_VERSION = 1;
export const SERVER_HZ = 30,
  SNAPSHOT_HZ = 10,
  CAPACITY = 8,
  RECONNECT_MS = 20000;
export type Skill = "easy" | "normal" | "hard";
export type RoomPhase = "waiting" | "countdown" | "racing" | "finished";
export interface InputCommand {
  seq: number;
  x: number;
  z: number;
  jump: boolean;
  yaw: number;
}
export interface ParticipantSnapshot {
  id: string;
  name: string;
  bot: boolean;
  skill?: Skill;
  color: number;
  connected: boolean;
  ack: number;
  status: "racing" | "finished" | "dnf";
  finishTime: number | null;
  state: PlayerState;
}
export interface MatchResult {
  roomId: string;
  arenaId: string;
  endedAt: number;
  rows: {
    id: string;
    name: string;
    bot: boolean;
    place: number;
    status: "finished" | "dnf";
    time: number | null;
  }[];
}
export interface RoomSnapshot {
  roomId: string;
  code?: string;
  ownerId: string;
  arenaId: string;
  phase: RoomPhase;
  tick: number;
  elapsed: number;
  serverTime: number;
  startAt: number | null;
  waitUntil: number;
  participants: ParticipantSnapshot[];
  result?: MatchResult;
}
export type ClientMessage =
  | {
      v: 1;
      type: "join";
      mode: "quick" | "create" | "private";
      name: string;
      arenaId: string;
      code?: string;
    }
  | { v: 1; type: "resume"; token: string }
  | { v: 1; type: "input"; command: InputCommand }
  | { v: 1; type: "start" }
  | { v: 1; type: "leave" }
  | { v: 1; type: "ping"; sent: number };
export type ServerMessage =
  | { v: 1; type: "welcome"; id: string; token: string; snapshot: RoomSnapshot }
  | { v: 1; type: "snapshot"; snapshot: RoomSnapshot }
  | { v: 1; type: "pong"; sent: number; serverTime: number }
  | { v: 1; type: "error"; code: string; message: string };
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const keys = (v: Record<string, unknown>, allowed: string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));
/** Strict wire boundary: positions, finish claims, extra fields and non-finite input are rejected. */
export function parseClientMessage(text: string): ClientMessage | null {
  if (text.length > 2048) return null;
  let m: unknown;
  try {
    m = JSON.parse(text);
  } catch {
    return null;
  }
  if (!record(m) || m.v !== 1 || typeof m.type !== "string") return null;
  if (
    m.type === "join" &&
    keys(m, ["v", "type", "mode", "name", "arenaId", "code"]) &&
    ["quick", "create", "private"].includes(String(m.mode)) &&
    typeof m.name === "string" &&
    m.name.trim().length >= 1 &&
    m.name.length <= 24 &&
    /^[\p{L}\p{N} _.-]+$/u.test(m.name) &&
    typeof m.arenaId === "string" &&
    m.arenaId.length < 40 &&
    (m.code === undefined ||
      (typeof m.code === "string" && /^[A-Z2-9]{6}$/.test(m.code)))
  )
    return m as ClientMessage;
  if (
    m.type === "resume" &&
    keys(m, ["v", "type", "token"]) &&
    typeof m.token === "string" &&
    /^[A-Za-z0-9_-]{43}$/.test(m.token)
  )
    return m as ClientMessage;
  if (
    m.type === "input" &&
    keys(m, ["v", "type", "command"]) &&
    record(m.command)
  ) {
    const c = m.command;
    if (
      keys(c, ["seq", "x", "z", "jump", "yaw"]) &&
      Number.isSafeInteger(c.seq) &&
      Number(c.seq) > 0 &&
      finite(c.x) &&
      Math.abs(c.x) <= 1 &&
      finite(c.z) &&
      Math.abs(c.z) <= 1 &&
      typeof c.jump === "boolean" &&
      finite(c.yaw) &&
      Math.abs(c.yaw) <= Math.PI
    )
      return m as ClientMessage;
  }
  if ((m.type === "start" || m.type === "leave") && keys(m, ["v", "type"]))
    return m as ClientMessage;
  if (
    m.type === "ping" &&
    keys(m, ["v", "type", "sent"]) &&
    finite(m.sent) &&
    m.sent >= 0
  )
    return m as ClientMessage;
  return null;
}
export const commandInput = (c: InputCommand): Input => ({
  x: c.x,
  z: c.z,
  jump: c.jump,
  cameraYaw: c.yaw,
});

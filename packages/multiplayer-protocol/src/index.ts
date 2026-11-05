import type { PlayerState, Input } from "@minimorph/game-simulation";
export const PROTOCOL_VERSION = 2;
/** Bump when collision-relevant course/sampling data changes, independently of wire v2. */
export const WORLD_REVISION = "tournament-v1-advanced-races-v1";
export const SERVER_HZ = 30,
  SNAPSHOT_HZ = 10,
  CAPACITY = 8,
  RECONNECT_MS = 20000;
export type Skill = "easy" | "normal" | "hard";
export type RoomPhase =
  | "waiting"
  | "countdown"
  | "racing"
  | "finished"
  | "round-results"
  | "intermission"
  | "preparing"
  | "tournament-results"
  | "completed";
export const TOURNAMENT_ROUNDS = [
  { arenaId: "cosmic-sprint", capacity: 8, qualify: 6 },
  { arenaId: "orbit-chaos", capacity: 6, qualify: 4 },
  { arenaId: "gravity-mayhem", capacity: 4, qualify: 1 },
] as const;
export interface RoundResult extends MatchResult {
  round: number;
  qualifiedIds: string[];
}
export interface TournamentPlacement {
  id: string;
  name: string;
  bot: boolean;
  place: number;
  roundReached: number;
  status: "finished" | "dnf";
  time: number | null;
}
export interface TournamentSnapshot {
  edition: number;
  round: number;
  activeIds: string[];
  orderIds: string[];
  qualifiedIds: string[];
  eliminatedIds: string[];
  history: RoundResult[];
  championId: string | null;
  placements: TournamentPlacement[];
  transitionAt: number | null;
  raceDeadline: number | null;
}
export interface InputCommand {
  seq: number;
  x: number;
  z: number;
  jump: boolean;
  dive?: boolean;
  yaw: number;
  round?: number;
  tournament?: number;
}
export interface ParticipantSnapshot {
  id: string;
  name: string;
  bot: boolean;
  skill?: Skill;
  color: number;
  connected: boolean;
  ack: number;
  status: "racing" | "finished" | "dnf" | "eliminated";
  finishTime: number | null;
  state: PlayerState;
}
export interface MatchResult {
  tournamentEdition?: number;
  championId?: string;
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
  tournament?: TournamentSnapshot;
  worldRevision?: string;
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
      v: 2;
      type: "join";
      mode: "quick" | "create" | "private";
      name: string;
      arenaId: string;
      worldRevision?: string;
      experience?: "race" | "tournament";
      code?: string;
    }
  | { v: 2; type: "resume"; token: string; worldRevision?: string }
  | { v: 2; type: "input"; command: InputCommand }
  | { v: 2; type: "replay"; tournament: number }
  | { v: 2; type: "start" }
  | { v: 2; type: "leave" }
  | { v: 2; type: "ping"; sent: number };
export type ServerMessage =
  | { v: 2; type: "welcome"; id: string; token: string; snapshot: RoomSnapshot }
  | { v: 2; type: "snapshot"; snapshot: RoomSnapshot }
  | { v: 2; type: "pong"; sent: number; serverTime: number }
  | { v: 2; type: "error"; code: string; message: string };
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const revision = (v: unknown) =>
  v === undefined ||
  (typeof v === "string" && /^[a-zA-Z0-9._-]{1,64}$/.test(v));
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
  if (!record(m) || m.v !== 2 || typeof m.type !== "string") return null;
  if (
    m.type === "join" &&
    keys(m, [
      "v",
      "type",
      "mode",
      "name",
      "arenaId",
      "code",
      "worldRevision",
      "experience",
    ]) &&
    ["quick", "create", "private"].includes(String(m.mode)) &&
    typeof m.name === "string" &&
    m.name.trim().length >= 1 &&
    m.name.length <= 24 &&
    /^[\p{L}\p{N} _.-]+$/u.test(m.name) &&
    typeof m.arenaId === "string" &&
    m.arenaId.length < 40 &&
    revision(m.worldRevision) &&
    (m.experience === undefined ||
      m.experience === "race" ||
      m.experience === "tournament") &&
    (m.mode === "private"
      ? typeof m.code === "string" && /^[A-Z2-9]{6}$/.test(m.code)
      : m.code === undefined)
  )
    return m as ClientMessage;
  if (
    m.type === "resume" &&
    keys(m, ["v", "type", "token", "worldRevision"]) &&
    revision(m.worldRevision) &&
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
      keys(c, [
        "seq",
        "x",
        "z",
        "jump",
        "dive",
        "yaw",
        "round",
        "tournament",
      ]) &&
      Number.isSafeInteger(c.seq) &&
      Number(c.seq) > 0 &&
      finite(c.x) &&
      Math.abs(c.x) <= 1 &&
      finite(c.z) &&
      Math.abs(c.z) <= 1 &&
      typeof c.jump === "boolean" &&
      (c.dive === undefined || typeof c.dive === "boolean") &&
      finite(c.yaw) &&
      Math.abs(c.yaw) <= Math.PI &&
      (c.round === undefined ||
        (Number.isSafeInteger(c.round) &&
          Number(c.round) >= 1 &&
          Number(c.round) <= 3)) &&
      (c.tournament === undefined ||
        (Number.isSafeInteger(c.tournament) &&
          Number(c.tournament) >= 1 &&
          Number(c.tournament) <= 1000000))
    )
      return m as ClientMessage;
  }
  if (
    m.type === "replay" &&
    keys(m, ["v", "type", "tournament"]) &&
    Number.isSafeInteger(m.tournament) &&
    Number(m.tournament) >= 1 &&
    Number(m.tournament) <= 1000000
  )
    return m as ClientMessage;
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
/** Structural compatibility checks only; qualification decisions remain server supplied. */
export function validRoomSnapshot(s: RoomSnapshot): boolean {
  if (
    !Array.isArray(s.participants) ||
    s.participants.length > 8 ||
    s.participants.some(
      (p) =>
        !record(p) ||
        !record(p.state) ||
        ![
          p.state.x,
          p.state.y,
          p.state.z,
          p.state.heading,
          p.state.elapsed,
        ].every(finite),
    )
  )
    return false;
  const ids = s.participants.map((p) => p.id);
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => typeof id !== "string")
  )
    return false;
  const t = s.tournament;
  if (t === undefined)
    return ["waiting", "countdown", "racing", "finished"].includes(s.phase);
  if (!record(t)) return false;
  const unique = (
    values: unknown,
    max: number,
    allowed: readonly string[] = ids,
  ): values is string[] =>
    Array.isArray(values) &&
    values.length <= max &&
    new Set(values).size === values.length &&
    values.every((id) => typeof id === "string" && allowed.includes(id));
  if (
    !Number.isSafeInteger(t.edition) ||
    t.edition < 1 ||
    t.edition > 1000000 ||
    !Number.isSafeInteger(t.round) ||
    t.round < 1 ||
    t.round > 3
  )
    return false;
  const definition = TOURNAMENT_ROUNDS[t.round - 1],
    closed = [
      "round-results",
      "intermission",
      "tournament-results",
      "completed",
    ].includes(s.phase);
  if (
    ![
      "waiting",
      "countdown",
      "racing",
      "preparing",
      "round-results",
      "intermission",
      "tournament-results",
      "completed",
    ].includes(s.phase) ||
    s.arenaId !== definition.arenaId
  )
    return false;
  if (
    !unique(t.activeIds, definition.capacity) ||
    !unique(t.orderIds, definition.capacity, t.activeIds) ||
    t.orderIds.length !== t.activeIds.length ||
    !unique(
      t.qualifiedIds,
      t.round === 3 ? 0 : definition.qualify,
      t.activeIds,
    ) ||
    !unique(t.eliminatedIds, 8)
  )
    return false;
  if (
    !Array.isArray(t.history) ||
    t.history.length !== t.round - (closed ? 0 : 1) ||
    t.history.length > 3
  )
    return false;
  for (const [i, r] of t.history.entries()) {
    const def = TOURNAMENT_ROUNDS[i];
    if (
      !record(r) ||
      r.round !== i + 1 ||
      r.arenaId !== def.arenaId ||
      r.tournamentEdition !== t.edition ||
      !Array.isArray(r.rows) ||
      r.rows.length > def.capacity
    )
      return false;
    if (r.rows.some((p) => !record(p))) return false;
    const rowIds = r.rows.map((p) => p.id);
    if (
      !unique(rowIds, def.capacity) ||
      !unique(r.qualifiedIds, i === 2 ? 0 : def.qualify, rowIds) ||
      r.rows.some(
        (p, j) =>
          p.place !== j + 1 ||
          !["finished", "dnf"].includes(p.status) ||
          (p.time !== null && (!Number.isFinite(p.time) || p.time < 0)),
      )
    )
      return false;
  }
  if (
    t.round > 1 &&
    !t.activeIds.every((id) => t.history[t.round - 2].qualifiedIds.includes(id))
  )
    return false;
  if (
    ["racing", "countdown", "preparing", "waiting"].includes(s.phase) &&
    t.activeIds.some((id) => t.eliminatedIds.includes(id))
  )
    return false;
  if (t.championId !== null && (t.round !== 3 || !ids.includes(t.championId)))
    return false;
  if (
    !Array.isArray(t.placements) ||
    t.placements.length > 8 ||
    t.placements.some((p) => !record(p)) ||
    !unique(
      t.placements.map((p) => p.id),
      8,
    ) ||
    t.placements.some((p, i) => p.place !== i + 1)
  )
    return false;
  if (
    ["tournament-results", "completed"].includes(s.phase) &&
    (t.round !== 3 ||
      t.placements.length !== ids.length ||
      t.championId !== t.placements[0]?.id)
  )
    return false;
  if (["round-results", "intermission"].includes(s.phase) && t.round === 3)
    return false;
  return (
    (t.transitionAt === null || Number.isFinite(t.transitionAt)) &&
    (t.raceDeadline === null || Number.isFinite(t.raceDeadline))
  );
}
export const commandInput = (c: InputCommand): Input => ({
  x: c.x,
  z: c.z,
  jump: c.jump,
  dive: c.dive ?? false,
  cameraYaw: c.yaw,
});

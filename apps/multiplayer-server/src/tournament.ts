import type { ArenaConfig } from '@minimorph/game-content';
import { getArena } from "@minimorph/game-content";
import { createPlayer, ArenaRuntime, courseProgress } from "@minimorph/game-simulation";
import { TOURNAMENT_ROUNDS } from "@minimorph/multiplayer-protocol";
import type {
  RoundResult,
  TournamentPlacement,
  TournamentSnapshot,
  Skill,
} from "@minimorph/multiplayer-protocol";
import { Room } from "./rooms";
import type { Participant } from "./rooms";
export const ROUND_RESULTS_MS = 3000,
  INTERMISSION_MS = 5000,
  PREPARING_MS = 1000,
  PODIUM_MS = 12000;
/** Only server state participates in ordering. UUID lexical order resolves exact simulation ties. */
export function rankParticipants(
  players: readonly Participant[], arena?: ArenaConfig,
): Participant[] {
  return [...players].sort((a, b) =>
    a.finishTime !== null || b.finishTime !== null
      ? (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity) ||
        a.id.localeCompare(b.id)
      : b.state.checkpoint - a.state.checkpoint ||
        (arena?.navigation ? courseProgress(arena,b.state)-courseProgress(arena,a.state) : a.state.z - b.state.z) ||
        a.id.localeCompare(b.id),
  );
}
export class TournamentRoom extends Room {
  edition = 1;
  round = 1;
  activeIds: string[] = [];
  qualifiedIds: string[] = [];
  history: RoundResult[] = [];
  championId: string | null = null;
  placements: TournamentPlacement[] = [];
  transitionAt: number | null = null;
  raceDeadline: number | null = null;
  constructor(code: string | undefined, waitUntil: number, createdAt: number) {
    super(TOURNAMENT_ROUNDS[0].arenaId, code, waitUntil, createdAt);
    this.fillLobby();
  }
  fillLobby() {
    while (this.participants.length < 8) {
      const slot = Array.from({ length: 8 }, (_, i) => i).find(
        (i) => !this.participants.some((p) => p.color === i),
      )!;
      const skill: Skill = (["easy", "normal", "hard"] as const)[slot % 3];
      super.add(
        `${skill[0].toUpperCase() + skill.slice(1)} Cadet ${slot + 1}`,
        true,
        skill,
      );
    }
    this.activeIds = this.participants.map((p) => p.id);
  }
  override add(name: string, bot = false, skill?: Skill) {
    if (this.phase !== "waiting") throw Error("Tournament roster is locked");
    if (!bot && this.participants.length === 8) {
      const vacant = this.participants.findIndex((p) => p.bot);
      if (vacant < 0) throw Error("Tournament is full");
      this.participants.splice(vacant, 1);
    }
    const p = super.add(name, bot, skill);
    this.activeIds = this.participants.map((p) => p.id);
    return p;
  }
  override start(now: number) {
    if (this.phase !== "waiting") return;
    this.fillLobby();
    super.start(now);
    this.activeIds = this.participants.map((p) => p.id);
  }
  private active() {
    return this.participants.filter((p) => this.activeIds.includes(p.id));
  }
  private finishers() {
    return rankParticipants(
      this.active().filter((p) => p.finishTime !== null && !p.withdrawn), this.arena,
    );
  }
  override snapshot(now: number) {
    const snapshot = super.snapshot(now);
    const tournament: TournamentSnapshot = {
      edition: this.edition,
      round: this.round,
      activeIds: this.activeIds,
      orderIds: (
        this.history.find((r) => r.round === this.round)?.rows ??
        rankParticipants(this.active(), this.arena)
      ).map((p) => p.id),
      qualifiedIds:
        this.phase === "racing" && this.round < 3
          ? this.finishers()
              .slice(0, TOURNAMENT_ROUNDS[this.round - 1].qualify)
              .map((p) => p.id)
          : this.qualifiedIds,
      eliminatedIds: this.participants
        .filter((p) => p.status === "eliminated")
        .map((p) => p.id),
      history: this.history,
      championId: this.championId,
      placements: this.placements,
      transitionAt: this.transitionAt,
      raceDeadline: this.raceDeadline,
    };
    return { ...snapshot, tournament };
  }
  override simulate() {
    super.simulate();
    if (this.round === 3) {
      const first = rankParticipants(
        this.active().filter((p) => p.finishTime !== null), this.arena,
      )[0];
      // Derive the live leader from the same total order as final results.
      // A later observed finish can tie an earlier one in simulation time.
      this.championId = first?.id ?? null;
    }
  }
  override finish(now: number) {
    if (this.phase !== "racing") return;
    const ordered = rankParticipants(this.active(), this.arena);
    for (const p of ordered) if (p.status === "racing") p.status = "dnf";
    const target = TOURNAMENT_ROUNDS[this.round - 1].qualify;
    this.qualifiedIds =
      this.round < 3
        ? ordered
            .filter((p) => !p.withdrawn)
            .slice(0, target)
            .map((p) => p.id)
        : [];
    const record: RoundResult = {
      roomId: this.id,
      arenaId: this.arenaId,
      endedAt: now,
      tournamentEdition: this.edition,
      round: this.round,
      qualifiedIds: [...this.qualifiedIds],
      rows: ordered.map((p, i) => ({
        id: p.id,
        name: p.name,
        bot: p.bot,
        place: i + 1,
        status: p.finishTime === null ? "dnf" : "finished",
        time: p.finishTime,
      })),
    };
    this.history = [...this.history, record];
    this.result = record;
    if (this.round < 3) {
      for (const p of ordered)
        if (!this.qualifiedIds.includes(p.id)) p.status = "eliminated";
      this.phase = "round-results";
      this.transitionAt = now + ROUND_RESULTS_MS;
    } else {
      this.placements = this.participants
        .map((p) => {
          const reached = [...this.history]
            .reverse()
            .find((r) => r.rows.some((row) => row.id === p.id));
          const row = reached?.rows.find((row) => row.id === p.id);
          return {
            id: p.id,
            name: p.name,
            bot: p.bot,
            place: row?.place ?? 8,
            roundReached: reached?.round ?? 0,
            status: row?.status ?? "dnf",
            time: row?.time ?? null,
          };
        })
        .sort(
          (a, b) =>
            b.roundReached - a.roundReached ||
            a.place - b.place ||
            a.id.localeCompare(b.id),
        )
        .map((p, i) => ({ ...p, place: i + 1 }));
      this.championId = this.placements[0]?.id ?? null;
      this.result = {
        roomId: this.id,
        arenaId: this.arenaId,
        endedAt: now,
        tournamentEdition: this.edition,
        ...(this.championId ? { championId: this.championId } : {}),
        rows: this.placements.map((p) => ({
          id: p.id,
          name: p.name,
          bot: p.bot,
          place: p.place,
          status: p.status,
          time: p.time,
        })),
      };
      this.phase = "tournament-results";
      this.transitionAt = now + PODIUM_MS;
    }
    this.lastActive = now;
    for (const p of this.participants) {
      p.commands = [];
      p.lastInput = { x: 0, z: 0, jump: false };
      p.ack = p.lastSeq;
    }
  }
  private prepare(now: number) {
    this.round++;
    this.arenaId = TOURNAMENT_ROUNDS[this.round - 1].arenaId;
    this.arena = getArena(this.arenaId);
    this.activeIds = this.qualifiedIds.filter(
      (id) => !this.participants.find((p) => p.id === id)!.withdrawn,
    );
    this.qualifiedIds = [];
    this.collapseTimes = {};
    this.tick = 0;
    this.elapsed = 0;
    this.result = undefined;
    this.raceDeadline = null;
    for (const [i, p] of this.active().entries()) {
      p.state = createPlayer(this.arena);
      p.state.collapseTimes = this.collapseTimes;
      p.state.x = this.arena.spawn.x + [-1.8, -0.6, 0.6, 1.8][i % 4];
      p.state.z = this.arena.spawn.z + Math.floor(i / 4) * 2;
      p.world = new ArenaRuntime(this.arena);
      p.status = "racing";
      p.finishTime = null;
      p.commands = [];
      p.lastInput = { x: 0, z: 0, jump: false };
      p.ack = p.lastSeq;
    }
    for (const p of this.participants)
      if (!this.activeIds.includes(p.id)) p.status = "eliminated";
    this.phase = "preparing";
    this.startAt = null;
    this.transitionAt = now + PREPARING_MS;
  }
  /** At most one transition per tick; wall-clock deadlines and fixed-step race physics are server owned. */
  advance(now: number, timeoutSeconds: number): boolean {
    if (this.phase === "countdown") {
      this.raceDeadline ??= this.startAt! + timeoutSeconds * 1000;
      if (now >= this.startAt!) this.phase = "racing";
    }
    if (this.phase === "racing") {
      this.simulate();
      if (
        now >= this.raceDeadline! ||
        this.elapsed >= timeoutSeconds ||
        this.active().every((p) => p.status !== "racing") ||
        (this.round < 3 &&
          this.finishers().length >= TOURNAMENT_ROUNDS[this.round - 1].qualify)
      ) {
        this.finish(now);
        return true;
      }
      return false;
    }
    if (this.transitionAt !== null && now >= this.transitionAt) {
      if (this.phase === "round-results") {
        this.phase = "intermission";
        this.transitionAt = now + INTERMISSION_MS;
      } else if (this.phase === "intermission") this.prepare(now);
      else if (this.phase === "preparing") {
        this.phase = "countdown";
        this.startAt = now + 3000;
        this.transitionAt = null;
      } else if (this.phase === "tournament-results") {
        this.phase = "completed";
        this.transitionAt = null;
        this.lastActive = now;
      }
    }
    return false;
  }
  replay(now: number): boolean {
    if (
      !["completed", "tournament-results"].includes(this.phase) ||
      this.edition >= 1000000
    )
      return false;
    this.edition++;
    this.round = 1;
    this.arenaId = TOURNAMENT_ROUNDS[0].arenaId;
    this.arena = getArena(this.arenaId);
    this.history = [];
    this.qualifiedIds = [];
    this.championId = null;
    this.placements = [];
    this.result = undefined;
    this.transitionAt = this.raceDeadline = null;
    this.collapseTimes = {};
    this.tick = this.elapsed = 0;
    for (let i = this.participants.length - 1; i >= 0; i--)
      if (this.participants[i].withdrawn) this.participants.splice(i, 1);
    this.phase = "waiting";
    this.fillLobby();
    for (const [i, p] of this.participants.entries()) {
      p.state = createPlayer(this.arena);
      p.state.collapseTimes = this.collapseTimes;
      p.state.x = this.arena.spawn.x + [-1.8, -0.6, 0.6, 1.8][i % 4];
      p.state.z = this.arena.spawn.z + Math.floor(i / 4) * 2;
      p.world = new ArenaRuntime(this.arena);
      p.status = "racing";
      p.finishTime = null;
      p.commands = [];
      p.lastInput = { x: 0, z: 0, jump: false };
      p.ack = p.lastSeq;
    }
    this.start(now);
    return true;
  }
}

import { randomBytes, createHash } from "node:crypto";
import { levelRegistry } from "@minimorph/game-content";
import {
  WORLD_REVISION,
  CAPACITY,
  RECONNECT_MS,
} from "@minimorph/multiplayer-protocol";
import type { ClientMessage } from "@minimorph/multiplayer-protocol";
import type { Input } from "@minimorph/game-simulation";
import { Room, MemoryResults } from "./rooms";
import type { Peer, Participant, ResultStore } from "./rooms";
import { TournamentRoom } from "./tournament";
export { Room, MemoryResults } from "./rooms";
export type { Peer, Participant, ResultStore } from "./rooms";
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const idle: Input = { x: 0, z: 0, jump: false };
export class MatchService {
  readonly rooms = new Map<string, Room>();
  readonly tokens = new Map<string, { room: Room; p: Participant }>();
  storeFailures = 0;
  constructor(
    readonly store: ResultStore = new MemoryResults(),
    readonly options = { maxRooms: 32, timeoutSeconds: 240 },
  ) {}
  error(peer: Peer, code: string, message: string) {
    peer.send({ v: 2, type: "error", code, message });
  }
  issue(peer: Peer, room: Room, p: Participant, now: number) {
    if (p.tokenHash) this.tokens.delete(p.tokenHash);
    const token = randomBytes(32).toString("base64url");
    p.tokenHash = digest(token);
    this.tokens.set(p.tokenHash, { room, p });
    const old = p.peer;
    p.peer = peer;
    if (
      room instanceof TournamentRoom &&
      !room.participants.find((other) => other.id === room.ownerId)?.peer
    )
      room.ownerId = p.id;
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
      v: 2,
      type: "welcome",
      id: p.id,
      token,
      snapshot: room.snapshot(now),
    });
  }
  handle(peer: Peer, m: ClientMessage, now: number) {
    peer.lastSeen = now;
    if (
      (m.type === "join" || m.type === "resume") &&
      m.worldRevision !== WORLD_REVISION
    ) {
      this.error(
        peer,
        "world_version",
        "Game levels have changed. Reload the game and use a matching server.",
      );
      return;
    }
    if (m.type === "ping") {
      peer.send({ v: 2, type: "pong", sent: m.sent, serverTime: now });
      return;
    }
    if (m.type === "resume") {
      const found = this.tokens.get(digest(m.token));
      if (
        !found ||
        found.p.expiresAt < now ||
        found.p.withdrawn ||
        (!(found.room instanceof TournamentRoom) && found.p.status === "dnf")
      ) {
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
      if (!levelRegistry.isPublishedRace(m.arenaId)) {
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
        if (room.participants.filter((p) => !p.bot).length >= CAPACITY) {
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
            (m.experience === "race"
              ? !(r instanceof TournamentRoom) && r.arenaId === m.arenaId
              : r instanceof TournamentRoom) &&
            r.participants.filter((p) => !p.bot).length < CAPACITY,
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
        room =
          m.experience === "race"
            ? new Room(m.arenaId, code, now + 15000, now)
            : new TournamentRoom(code, now + 15000, now);
        this.rooms.set(room.id, room);
      }
      this.issue(peer, room, room.add(m.name.trim()), now);
      if (
        !room.code &&
        room.participants.filter((p) => !p.bot).length === CAPACITY
      )
        room.start(now);
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
      if (
        room instanceof TournamentRoom &&
        room.ownerId === p.id &&
        room.code &&
        room.phase !== "waiting"
      )
        return;
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
    if (m.type === "replay") {
      if (
        room instanceof TournamentRoom &&
        room.ownerId === p.id &&
        m.tournament < room.edition
      )
        return;
      if (
        !(room instanceof TournamentRoom) ||
        room.ownerId !== p.id ||
        m.tournament !== room.edition ||
        !room.replay(now)
      )
        this.error(
          peer,
          "not_owner",
          "Only the current tournament owner can replay completed results.",
        );
      return;
    }
    if (m.type === "input") {
      const c = m.command;
      if (room instanceof TournamentRoom) {
        if (
          !room.activeIds.includes(p.id) ||
          p.status === "eliminated" ||
          p.withdrawn
        ) {
          this.error(
            peer,
            "spectator_input",
            "Spectators cannot control racers.",
          );
          return;
        }
        if (c.round !== room.round || c.tournament !== room.edition) {
          this.error(peer, "stale_round", "Input belongs to another round.");
          return;
        }
      }
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
    if (room instanceof TournamentRoom && room.ownerId === p.id)
      room.ownerId =
        room.participants.find((other) => !other.bot && other.peer)?.id ?? p.id;
    if (permanent) this.expire(room, p);
  }
  private expire(room: Room, p: Participant) {
    if (p.tokenHash) this.tokens.delete(p.tokenHash);
    p.tokenHash = undefined;
    if (room.phase === "waiting") {
      room.participants.splice(room.participants.indexOf(p), 1);
      if (room.ownerId === p.id)
        room.ownerId = room.participants.find((p) => !p.bot)?.id ?? "";
      if (room instanceof TournamentRoom) room.fillLobby();
    } else {
      p.withdrawn = true;
      if (p.status === "racing") p.status = "dnf";
    }
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
        if (
          !room.participants.some((p) => !p.bot) ||
          now - room.createdAt > 600000
        ) {
          this.remove(room);
          continue;
        }
      }
      if (room instanceof TournamentRoom) {
        if (room.advance(now, this.options.timeoutSeconds))
          void this.store.save(room.result!).catch(() => this.storeFailures++);
        if (room.phase === "completed" && now - room.lastActive > 120000)
          this.remove(room);
        continue;
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

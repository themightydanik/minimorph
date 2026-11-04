import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { appendFile } from "node:fs/promises";
import { WebSocketServer, WebSocket } from "ws";
import { parseClientMessage } from "@minimorph/multiplayer-protocol";
import type {
  ServerMessage,
  MatchResult,
} from "@minimorph/multiplayer-protocol";
import { MatchService, MemoryResults } from "./matches";
import type { Peer, ResultStore } from "./matches";
export class FileResults implements ResultStore {
  private pending = Promise.resolve();
  constructor(private path: string) {}
  save(result: MatchResult) {
    this.pending = this.pending
      .catch(() => {})
      .then(() => appendFile(this.path, JSON.stringify(result) + "\n"));
    return this.pending;
  }
  flush() {
    return this.pending;
  }
}
class Rate {
  tokens: number;
  at: number;
  constructor(
    readonly capacity: number,
    readonly perSecond: number,
    now: number,
  ) {
    this.tokens = capacity;
    this.at = now;
  }
  take(now: number) {
    this.tokens = Math.min(
      this.capacity,
      this.tokens + ((now - this.at) * this.perSecond) / 1000,
    );
    this.at = now;
    if (this.tokens < 1) return false;
    this.tokens--;
    return true;
  }
}
export interface ServerOptions {
  origins: string[];
  port?: number;
  host?: string;
  store?: ResultStore;
  timeoutSeconds?: number;
  maxRooms?: number;
  allowNoOrigin?: boolean;
  manual?: boolean;
  now?: () => number;
}
export async function startServer(options: ServerOptions) {
  const clock = options.now ?? Date.now;
  const service = new MatchService(options.store ?? new MemoryResults(), {
    maxRooms: options.maxRooms ?? 32,
    timeoutSeconds: options.timeoutSeconds ?? 240,
  });
  let ready = true,
    closing = false,
    bytesIn = 0,
    bytesOut = 0,
    messagesIn = 0,
    messagesOut = 0,
    slowTicks = 0,
    overloadDrops = 0,
    ticks = 0;
  const tickDurations: number[] = [];
  const peers = new Map<WebSocket, Peer>();
  const ipRates = new Map<
    string,
    { rate: Rate; guesses: Rate; last: number; connections: number }
  >();
  const originAllowed = (origin: string | undefined) =>
    origin === undefined
      ? !!options.allowNoOrigin
      : options.origins.includes(origin);
  const server = createServer((req, res) => {
    const origin = req.headers.origin;
    if (origin && !originAllowed(origin)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Cache-Control", "no-store");
    if (req.url === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } else if (req.url === "/readyz") {
      res.writeHead(ready ? 200 : 503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ ready, protocol: 1, rooms: service.rooms.size }),
      );
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 2048,
    perMessageDeflate: false,
  });
  const send = (ws: WebSocket, data: string) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 128 * 1024) {
      ws.close(1013, "Slow connection");
      return;
    }
    ws.send(data);
    bytesOut += Buffer.byteLength(data);
    messagesOut++;
  };
  server.on("upgrade", (req, socket, head) => {
    const reject = (status: string) => {
      socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    if (closing || req.url !== "/ws" || !originAllowed(req.headers.origin)) {
      reject("403 Forbidden");
      return;
    }
    // Do not trust client-controlled X-Forwarded-For. Render's proxy may share an IP; global caps stay bounded.
    const ip = req.socket.remoteAddress ?? "unknown",
      now = clock();
    let r = ipRates.get(ip);
    if (!r) {
      r = {
        rate: new Rate(12, 1, now),
        guesses: new Rate(12, 0.5, now),
        last: now,
        connections: 0,
      };
      ipRates.set(ip, r);
    }
    if (r.connections >= 24 || !r.rate.take(now) || peers.size >= 256) {
      reject("429 Too Many Requests");
      return;
    }
    r.last = now;
    r.connections++;
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
      ws.once("close", () => r!.connections--);
    });
  });
  wss.on("connection", (ws, req) => {
    const now = clock(),
      inputRate = new Rate(90, 60, now),
      controlRate = new Rate(10, 1, now);
    let strikes = 0;
    const peer: Peer = {
      id: randomUUID(),
      lastSeen: now,
      send: (m: ServerMessage) => send(ws, JSON.stringify(m)),
      close: () => ws.close(4000, "Session replaced"),
    };
    peers.set(ws, peer);
    const joinDeadline = setTimeout(() => {
      if (!peer.participant) ws.close(1008, "Join timeout");
    }, 8000);
    ws.on("pong", () => (peer.lastSeen = clock()));
    ws.on("error", () => {});
    ws.on("message", (data, binary) => {
      const at = clock();
      bytesIn += Array.isArray(data)
        ? data.reduce((n, b) => n + b.byteLength, 0)
        : data.byteLength;
      messagesIn++;
      const m = binary ? null : parseClientMessage(data.toString());
      if (!m) {
        service.error(
          peer,
          "bad_message",
          "Invalid protocol or input message.",
        );
        if (++strikes >= 3) ws.close(1008, "Invalid protocol");
        return;
      }
      const ip = req.socket.remoteAddress ?? "unknown";
      // Code guesses are limited across reconnects as well as within one socket.
      const guesses = ipRates.get(ip);
      const limited =
        m.type === "input"
          ? !inputRate.take(at)
          : !controlRate.take(at) ||
            (m.type === "join" &&
              m.mode === "private" &&
              !!guesses &&
              !guesses.guesses.take(at));
      if (limited) {
        service.error(
          peer,
          "rate_limited",
          "Too many requests. Wait and retry.",
        );
        if (++strikes >= 3) ws.close(1008, "Rate limit");
        return;
      }
      service.handle(peer, m, at);
    });
    ws.once("close", () => {
      clearTimeout(joinDeadline);
      service.disconnect(peer, clock());
      peers.delete(ws);
    });
  });
  function broadcast(now: number) {
    for (const room of service.rooms.values()) {
      const data = JSON.stringify({
        v: 1,
        type: "snapshot",
        snapshot: room.snapshot(now),
      });
      for (const p of room.participants)
        if (p.peer) {
          const ws = [...peers.entries()].find(
            ([, peer]) => peer === p.peer,
          )?.[0];
          if (ws) send(ws, data);
        }
    }
  }
  const step = (now: number) => {
    const begin = performance.now();
    service.tick(now);
    if (++ticks % 3 === 0) broadcast(now);
    const cost = performance.now() - begin;
    tickDurations.push(cost);
    if (tickDurations.length > 6000) tickDurations.shift();
    if (cost > 1000 / 30) slowTicks++;
  };
  let last = performance.now(),
    accumulator = 0;
  const timer = options.manual
    ? undefined
    : setInterval(() => {
        const now = performance.now();
        accumulator += now - last;
        last = now;
        let steps = 0;
        while (accumulator >= 1000 / 30 && steps++ < 8) {
          step(clock() - accumulator + 1000 / 30);
          accumulator -= 1000 / 30;
        }
        if (accumulator > 1000) {
          overloadDrops++;
          accumulator = 0;
        }
      }, 5);
  const heartbeat = setInterval(() => {
    const now = clock();
    for (const [ws, p] of peers) {
      if (now - p.lastSeen > 12000) ws.terminate();
      else ws.ping();
    }
    for (const [ip, r] of ipRates)
      if (!r.connections && now - r.last > 60000) ipRates.delete(ip);
  }, 3000);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, options.host ?? "0.0.0.0", resolve);
  });
  return {
    service,
    port: (server.address() as AddressInfo).port,
    step,
    broadcast,
    metrics() {
      const sorted = [...tickDurations].sort((a, b) => a - b);
      return {
        ticks,
        rooms: service.rooms.size,
        connections: peers.size,
        bytesIn,
        bytesOut,
        messagesIn,
        messagesOut,
        slowTicks,
        overloadDrops,
        storeFailures: service.storeFailures,
        tickMedianMs: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
        tickP95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
        tickMaxMs: sorted.at(-1) ?? 0,
        memory: process.memoryUsage(),
        peakRssBytes: process.resourceUsage().maxRSS * 1024,
      };
    },
    async close() {
      if (closing) return;
      closing = true;
      ready = false;
      if (timer) clearInterval(timer);
      clearInterval(heartbeat);
      for (const ws of peers.keys()) ws.close(1001, "Server restarting");
      const kill = setTimeout(() => {
        for (const ws of peers.keys()) ws.terminate();
      }, 1000);
      await new Promise<void>((resolve) =>
        wss.close(() => server.close(() => resolve())),
      );
      clearTimeout(kill);
      await service.store.flush?.().catch(() => {});
    },
  };
}

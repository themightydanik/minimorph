import { WORLD_REVISION } from '@minimorph/multiplayer-protocol';
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { WebSocket } from "ws";
import { startServer } from "../../apps/multiplayer-server/src/server";
import type { ServerMessage } from "@minimorph/multiplayer-protocol";
const duration = Number(process.env.PROFILE_SECONDS ?? 80);
const server = await startServer({ origins: ["http://benchmark.local"] });
const clients: WebSocket[] = [],
  intervals: ReturnType<typeof setInterval>[] = [],
  starts = new Set<string>();
let received = 0,
  sent = 0;
const start = performance.now(),
  cpu = process.cpuUsage();
try {
  for (let i = 0; i < 8; i++) {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`, {
      origin: "http://benchmark.local",
    });
    clients.push(ws);
    let seq = 0,
      phase = "waiting";
    const send = (m: object) => {
      const data = JSON.stringify('type' in m && (m.type === 'join' || m.type === 'resume') ? {...m,...(m.type==='join'?{experience:'race'}:{}),worldRevision:WORLD_REVISION} : m);
      if (ws.readyState === WebSocket.OPEN) {
        sent += Buffer.byteLength(data);
        ws.send(data);
      }
    };
    ws.on("message", (raw) => {
      received += Array.isArray(raw)
        ? raw.reduce((n, b) => n + b.byteLength, 0)
        : raw.byteLength;
      const m = JSON.parse(String(raw)) as ServerMessage;
      if (m.type === "error") throw Error(m.message);
      if (m.type === "welcome" || m.type === "snapshot") {
        const s = m.snapshot;
        phase = s.phase;
        if (
          i % 4 === 0 &&
          s.code &&
          s.participants.filter((p) => !p.bot).length === 4 &&
          s.phase === "waiting" &&
          !starts.has(s.roomId)
        ) {
          starts.add(s.roomId);
          send({ v: 2, type: "start" });
        }
      }
    });
    await new Promise<void>((resolve) => ws.once("open", () => resolve()));
    // Two real rooms, four network humans and four server bots each.
    const group = Math.floor(i / 4),
      arenaId = group ? "orbit-chaos" : "cosmic-sprint";
    if (i % 4 === 0)
      send({ v: 2, type: "join", mode: "create", name: `Load ${i}`, arenaId });
    else {
      const room = [...server.service.rooms.values()].find(
        (r) => r.arenaId === arenaId,
      );
      if (!room) throw Error("Missing benchmark room");
      send({
        v: 2,
        type: "join",
        mode: "private",
        code: room.code,
        name: `Load ${i}`,
        arenaId,
      });
    }
    await new Promise((r) => setTimeout(r, 20));
    let next = performance.now();
    intervals.push(
      setInterval(() => {
        const at = performance.now();
        if (at < next) return;
        next += 1000 / 30;
        if (at - next > 1000) next = at;
        if (phase === "racing")
          send({
            v: 2,
            type: "input",
            command: { seq: ++seq, x: 0, z: -1, jump: seq % 30 === 0, yaw: 0 },
          });
      }, 5),
    );
  }
  await new Promise((r) => setTimeout(r, duration * 1000));
  const wallSeconds = (performance.now() - start) / 1000,
    usage = process.cpuUsage(cpu),
    metrics = server.metrics();
  const report = {
    method:
      "Real loopback WebSockets, eight human connections across two rooms, four humans + four authoritative bots per room. No browser renderer. CPU/RSS include the colocated load generator; tick costs measure server simulation/broadcast only.",
    wallSeconds,
    cpuUserMs: usage.user / 1000,
    cpuSystemMs: usage.system / 1000,
    cpuPercentOfOneCore:
      ((usage.user + usage.system) / 1000 / (wallSeconds * 1000)) * 100,
    clientSentPayloadBytes: sent,
    clientReceivedPayloadBytes: received,
    serverInboundPayloadBytesPerSecond: metrics.bytesIn / wallSeconds,
    serverOutboundPayloadBytesPerSecond: metrics.bytesOut / wallSeconds,
    metrics,
    rooms: [...server.service.rooms.values()].map((r) => ({
      arena: r.arenaId,
      participants: r.participants.length,
      humans: r.participants.filter((p) => !p.bot).length,
      bots: r.participants.filter((p) => p.bot).length,
      finishedBots: r.participants.filter((p) => p.bot && p.state.won).length,
      elapsed: r.elapsed,
    })),
  };
  await mkdir("artifacts/multiplayer-profile", { recursive: true });
  await writeFile(
    "artifacts/multiplayer-profile/measurements.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  for (const i of intervals) clearInterval(i);
  for (const ws of clients) ws.close();
  await server.close();
}

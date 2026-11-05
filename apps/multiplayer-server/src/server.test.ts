import { WORLD_REVISION } from '@minimorph/multiplayer-protocol';
import { it, expect } from "vitest";
import { WebSocket } from "ws";
import { startServer } from "./server";
import type { ServerMessage } from "@minimorph/multiplayer-protocol";
function next(ws: WebSocket, predicate: (m: ServerMessage) => boolean) {
  return new Promise<ServerMessage>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", read);
      reject(Error("Message timeout"));
    }, 3000);
    function read(data: unknown) {
      const m = JSON.parse(String(data)) as ServerMessage;
      if (predicate(m)) {
        clearTimeout(timer);
        ws.off("message", read);
        resolve(m);
      }
    }
    ws.on("message", read);
  });
}
async function open(port: number, origin = "http://127.0.0.1:5173") {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin });
  await new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  return ws;
}
const send = (ws: WebSocket, m: object) => ws.send(JSON.stringify(
  'type' in m && (m.type === 'join' || m.type === 'resume') ? { ...m, ...(m.type==='join'?{experience:'race'}:{}), worldRevision: WORLD_REVISION } : m,
));
it("real sockets share rooms, authoritative snapshots and reconnect slots; HTTP health and origins are enforced", async () => {
  const server = await startServer({
    origins: ["http://127.0.0.1:5173"],
    manual: true,
  });
  try {
    expect(
      (await fetch(`http://127.0.0.1:${server.port}/healthz`)).status,
    ).toBe(200);
    expect((await fetch(`http://127.0.0.1:${server.port}/readyz`)).status).toBe(
      200,
    );
    expect(
      (
        await fetch(`http://127.0.0.1:${server.port}/readyz`, {
          headers: { origin: "https://evil.example" },
        })
      ).status,
    ).toBe(403);
    const a = await open(server.port),
      first = next(a, (m) => m.type === "welcome");
    send(a, {
      v: 2,
      type: "join",
      mode: "create",
      name: "Alice",
      arenaId: "cosmic-sprint",
    });
    const welcome = await first;
    if (welcome.type !== "welcome") throw Error("welcome");
    const b = await open(server.port),
      second = next(b, (m) => m.type === "welcome");
    send(b, {
      v: 2,
      type: "join",
      mode: "private",
      name: "Bob",
      arenaId: "cosmic-sprint",
      code: welcome.snapshot.code,
    });
    const wb = await second;
    if (wb.type !== "welcome") throw Error("welcome");
    expect(wb.snapshot.roomId).toBe(welcome.snapshot.roomId);
    send(a, { v: 2, type: "start" });
    await new Promise((r) => setTimeout(r, 20));
    const started = next(b, (m) => m.type === "snapshot");
    server.step(Date.now() + 3100);
    server.broadcast(Date.now() + 3100);
    const m = await started;
    if (m.type !== "snapshot") throw Error("snapshot");
    expect(m.snapshot.participants).toHaveLength(8);
    expect(m.snapshot.phase).toBe("racing");
    const input = next(
      a,
      (m) =>
        m.type === "snapshot" &&
        m.snapshot.participants.some((p) => p.id === welcome.id && p.ack === 1),
    );
    send(a, {
      v: 2,
      type: "input",
      command: { seq: 1, x: 0, z: -1, jump: true, yaw: 0 },
    });
    await new Promise((r) => setTimeout(r, 20));
    server.step(Date.now() + 3133);
    server.broadcast(Date.now() + 3133);
    const moved = await input;
    if (moved.type !== "snapshot") throw Error("snapshot");
    expect(
      moved.snapshot.participants.find((p) => p.id === welcome.id)!.state.vy,
    ).toBeGreaterThan(0);
    a.terminate();
    await new Promise((r) => setTimeout(r, 20));
    const resumed = await open(server.port),
      back = next(resumed, (m) => m.type === "welcome");
    send(resumed, { v: 2, type: "resume", token: welcome.token });
    const wr = await back;
    if (wr.type !== "welcome") throw Error("welcome");
    expect(wr.id).toBe(welcome.id);
    expect(wr.token).not.toBe(welcome.token);
    expect(server.metrics().bytesIn).toBeGreaterThan(0);
    expect(server.metrics().bytesOut).toBeGreaterThan(0);
  } finally {
    await server.close();
  }
});
it("binary, authority injection, message floods and oversized frames cannot mutate server state", async () => {
  const server = await startServer({
    origins: ["http://127.0.0.1:5173"],
    manual: true,
  });
  try {
    const ws = await open(server.port),
      error = next(ws, (m) => m.type === "error");
    send(ws, { v: 2, type: "position", x: 0, z: -400, won: true });
    expect(await error).toMatchObject({ code: "bad_message" });
    expect(server.service.rooms.size).toBe(0);
    const large = await open(server.port);
    large.on("error", () => {});
    const closed = new Promise<number>((resolve) =>
      large.once("close", (code) => resolve(code)),
    );
    large.send("x".repeat(2049));
    expect(await closed).toBe(1009);
    const flood = await open(server.port),
      rate = next(
        flood,
        (m) => m.type === "error" && m.code === "rate_limited",
      );
    for (let i = 0; i < 15; i++)
      send(flood, { v: 2, type: "ping", sent: Date.now() });
    expect(await rate).toMatchObject({ code: "rate_limited" });
  } finally {
    await server.close();
  }
});
it("eight real network humans and server bots complete each full arena with ordinary inputs", async () => {
  const { arenas } = await import("@minimorph/game-content");
  const { botInput } = await import("./bots");
  for (const arena of arenas) {
    let simulatedNow = Date.now();
    const server = await startServer({
      origins: ["http://127.0.0.1:5173"],
      manual: true,
      now: () => simulatedNow,
    });
    try {
      const sockets: WebSocket[] = [];
      for (let i = 0; i < 8; i++) {
        const ws = await open(server.port);
        sockets.push(ws);
        const accepted = next(ws, (m) => m.type === "welcome");
        const room = [...server.service.rooms.values()][0];
        send(ws, {
          v: 2,
          type: "join",
          mode: i === 0 ? "create" : "private",
          name: `Human ${i}`,
          arenaId: arena.id,
          ...(room ? { code: room.code } : {}),
        });
        await accepted;
      }
      // Real input sockets and a concurrent server-only bot room share the same physics clock.
      const mixed = new (await import("./matches")).Room(
        arena.id,
        "ABC234",
        0,
        Date.now(),
      );
      for (let i = 0; i < 8; i++)
        mixed.add(
          `Bot ${i}`,
          true,
          (["easy", "normal", "hard"] as const)[i % 3],
        );
      mixed.start(Date.now());
      server.service.rooms.set(mixed.id, mixed);
      const room = [...server.service.rooms.values()][0];
      send(sockets[0], { v: 2, type: "start" });
      await new Promise((r) => setTimeout(r, 5));
      const base = Date.now() + 3100;
      simulatedNow = base;
      server.step(simulatedNow);
      const controls = room.participants.map(() => ({
        x: 0,
        z: 0,
        jump: false,
      }));
      for (
        let tick = 0;
        tick < 30 * 240 &&
        (room.phase !== "finished" ||
          mixed.participants.some((p) => !p.state.won));
        tick++
      ) {
        simulatedNow = base + ((tick + 1) * 1000) / 30;
        for (const [i, p] of room.participants.entries())
          if (p.status === "racing") {
            if (tick % 3 === 0)
              controls[i] = botInput(p.state, room.arena, p.world, "normal");
            else controls[i] = { ...controls[i], jump: false };
            send(sockets[i], {
              v: 2,
              type: "input",
              command: { seq: tick + 1, ...controls[i], yaw: 0 },
            });
          }
        await new Promise((r) => setTimeout(r, 0));
        server.step(simulatedNow);
      }
      expect(
        room.result?.rows.every((r) => r.status === "finished"),
        JSON.stringify(room.result),
      ).toBe(true);
      expect(
        room.participants.every(
          (p) => p.state.checkpoint === arena.checkpoints.length,
        ),
      ).toBe(true);
      expect(
        mixed.participants.filter((p) => p.bot).every((p) => p.state.won),
      ).toBe(true);
    } finally {
      await server.close();
    }
  }
}, 60000);
it("configured results adapter writes completed matches as JSONL and flushes on shutdown", async () => {
  const { mkdtemp, readFile, rm } = await import("node:fs/promises"),
    { tmpdir } = await import("node:os"),
    { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "minimorph-results-"));
  const { FileResults } = await import("./server");
  const store = new FileResults(join(dir, "results.jsonl"));
  const server = await startServer({ origins: [], manual: true, store });
  try {
    await store.save({
      roomId: "first",
      arenaId: "cosmic-sprint",
      endedAt: 1,
      rows: [],
    });
    await store.save({
      roomId: "second",
      arenaId: "orbit-chaos",
      endedAt: 2,
      rows: [],
    });
    await server.close();
    expect(
      (await readFile(join(dir, "results.jsonl"), "utf8"))
        .trim()
        .split("\n")
        .map((s) => JSON.parse(s).roomId),
    ).toEqual(["first", "second"]);
  } finally {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
it("malformed upgrades cannot exhaust the active IP connection count", async () => {
  const { request } = await import("node:http");
  let now = Date.now();
  const server = await startServer({
    origins: ["http://127.0.0.1:5173"],
    manual: true,
    now: () => now,
  });
  try {
    for (let i = 0; i < 24; i++) {
      now += 1100;
      const status = await new Promise<number>((resolve, reject) => {
        const req = request(
          {
            hostname: "127.0.0.1",
            port: server.port,
            path: "/ws",
            headers: {
              Connection: "Upgrade",
              Upgrade: "websocket",
              Origin: "http://127.0.0.1:5173",
              "Sec-WebSocket-Version": "13",
              "Sec-WebSocket-Key": "invalid",
            },
          },
          (res) => {
            res.resume();
            res.once("end", () => resolve(res.statusCode!));
          },
        );
        req.once("error", reject);
        req.end();
      });
      expect(status).toBe(400);
    }
    now += 1100;
    const ws = await open(server.port);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    expect(server.metrics().connections).toBe(1);
  } finally {
    await server.close();
  }
});

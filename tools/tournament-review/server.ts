/** Local/CI review harness only. It accelerates the real server clock, never player positions or results. */
import { createServer } from "node:http";
import { startServer } from "../../apps/multiplayer-server/src/server";
let now = Date.now();
const game = await startServer({
  host: "127.0.0.1",
  port: 3012,
  origins: ["http://127.0.0.1:5173", "http://127.0.0.1:5174"],
  manual: true,
  now: () => now,
});
const snapshots = setInterval(() => game.broadcast(now), 100);
const controls = createServer(async (req, res) => {
  if (req.url === "/readyz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"ready":true}');
    return;
  }
  if (
    req.method !== "POST" ||
    req.url !== "/control" ||
    req.headers["x-minimorph-review"] !== "tournament-review-v1"
  ) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    let body = "";
    for await (const chunk of req) {
      body += String(chunk);
      if (body.length > 2048) throw Error("Payload limit");
    }
    const command = JSON.parse(body) as {
      action: string;
      roomId?: string;
      phase?: string;
      round?: number;
      seconds?: number;
    };
    if (command.action === "reset") {
      for (const room of game.service.rooms.values()) game.service.remove(room);
    } else if (command.action === "advance") {
      const room = command.roomId
        ? game.service.rooms.get(command.roomId)
        : [...game.service.rooms.values()].at(-1);
      if (!room) throw Error("No room");
      const seconds = command.seconds ?? 900;
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 900)
        throw Error("Clock limit");
      const start = now;
      for (let tick = 0; tick < Math.ceil(seconds * 30); tick++) {
        if (
          command.phase &&
          room.phase === command.phase &&
          (!command.round ||
            room.snapshot(now).tournament?.round === command.round)
        )
          break;
        now += 1000 / 30;
        for (const participant of room.participants)
          if (participant.peer) participant.peer.lastSeen = now;
        game.service.tick(now);
      }
      if (
        command.phase &&
        (room.phase !== command.phase ||
          (command.round &&
            room.snapshot(now).tournament?.round !== command.round))
      )
        throw Error(`Deadline: ${room.phase} after ${(now - start) / 1000}s`);
    } else throw Error("Unknown action");
    game.broadcast(now);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        now,
        rooms: [...game.service.rooms.values()].map((r) => r.snapshot(now)),
      }),
    );
  } catch (error) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Review command failed",
      }),
    );
  }
});
await new Promise<void>((resolve) =>
  controls.listen(3013, "127.0.0.1", resolve),
);
async function close() {
  clearInterval(snapshots);
  controls.close();
  await game.close();
  process.exit(0);
}
process.on("SIGTERM", () => void close());
process.on("SIGINT", () => void close());
console.log(
  "Local tournament review: WS 3012, bounded clock controller 3013; production server is unchanged.",
);

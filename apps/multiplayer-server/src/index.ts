import { startServer, FileResults } from "./server";
const port = Number(process.env.PORT ?? 3001),
  timeoutSeconds = Number(process.env.RACE_TIMEOUT_SECONDS ?? 240),
  maxRooms = Number(process.env.MAX_ROOMS ?? 32);
if (
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65535 ||
  !Number.isFinite(timeoutSeconds) ||
  timeoutSeconds < 90 ||
  timeoutSeconds > 900 ||
  !Number.isInteger(maxRooms) ||
  maxRooms < 1 ||
  maxRooms > 64
)
  throw new Error("Invalid multiplayer server configuration");
const origins = (
  process.env.ALLOWED_ORIGINS ??
  "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174"
)
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
const server = await startServer({
  port,
  origins,
  timeoutSeconds,
  maxRooms,
  allowNoOrigin: process.env.ALLOW_NO_ORIGIN === "true",
  store: process.env.RESULTS_FILE
    ? new FileResults(process.env.RESULTS_FILE)
    : undefined,
});
console.log(`Minimorph multiplayer listening on 0.0.0.0:${server.port}`);
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => {
    void server.close().then(() => process.exit(0));
  });

# Real-time multiplayer foundation

Both existing hosts keep their Solo/Racing and Training modes. Quick Match, Create Room and Join by Code connect to a real Node/WebSocket service; remote movement is received from that service and rendered in the same PlayCanvas scene. The service runs without PlayCanvas, GLB downloads, a database, Minima or Telegram SDKs. No paid infrastructure, accounts, rewards, tokens or tournaments are introduced.

## Run locally

Use Node 24 and `npm ci`. In one terminal:

```sh
npm run build:server
npm run start:server
```

In another terminal, build/serve a frontend or use Vite development:

```sh
VITE_MULTIPLAYER_WS_URL=ws://127.0.0.1:3001/ws npm run dev:telegram
# Minima uses the same setting and shared UI:
VITE_MULTIPLAYER_WS_URL=ws://127.0.0.1:3001/ws npm run dev:minima
```

Open two browser tabs/contexts, enter different names, create a private room in one, enter its code in the other, and let the owner start. Both participants receive the same countdown and six server bots. Move/jump in each tab and watch the other named Minimorph. Quick Match waits no more than 15 seconds before filling remaining slots; eight humans start immediately. Private rooms allow one human and seven bots. Racing joins are refused; reconnects reclaim an existing participant.

The game remains manually controlled. Bot decisions execute only on the server. Test/navigation drivers do not ship in the frontend. There are no client position or finish claims in the protocol.

## Ownership and timing

`packages/game-simulation` contains the original physics, supports, collisions and checkpoints extracted from `game-engine`; the old engine import paths re-export it. No physics constants, arena configurations, source GLBs, maps, clips or rig files were changed. Server simulation and client prediction both call the same `stepArenaPlayer` at 120 Hz through four fixed substeps per 30 Hz network tick. Server scheduling uses its own timer/accumulator, never a browser frame. Snapshots broadcast at 10 Hz. Overload catch-up is bounded to eight ticks per scheduler callback; backlog beyond one second is dropped and counted. Under overload race simulation time can lag wall time; the measured profile must be consulted before raising capacity.

`Room` owns eight independent participant states. Starting slots form two safe rows on the original start deck. Participants do not collide with each other in this foundation; obstacles and supports remain fully physical. The room owns one shared contact-triggered collapse map: the first participant to touch a deck starts its warning/fall/reset for everyone. Periodic obstacles and collapsing supports use the same authoritative simulation time and state for all participants. Solo retains its original per-run state. Finished/DNF actors stop simulating; scene obstacle rendering continues using room time.

`MatchService` owns room lookup, owner permissions, matchmaking, token rotation, lifecycle and finalization. It accepts only inputs. One queued command per human is consumed per tick; at most eight are queued. Unacknowledged inputs are replayed against each authoritative snapshot by `Prediction`. Client controls/prediction run on a 30 Hz timer independent of rendering. Remote actors interpolate buffered snapshots 150 ms behind the server clock, with wrapped heading and immediate checkpoint-respawn transitions. Missing snapshots freeze remote positions rather than inventing movement. A ping estimates RTT/clock offset. Browser suspension can throttle local timers, but the server continues the race and neutralizes stale input after 250 ms.

The same approved animated container is reference-counted per PlayCanvas Application/URL. Each participant instantiates its own skin and animation controller from the shared mesh/texture/clip resource. Remote presentation selects Idle/Run/Jump/Fall/Land/Victory from received physics. Name labels and colored ground rings distinguish participants without changing the approved materials or assets. One GLB request per page is asserted in browser tests. Eight full-detail skinned models can be expensive: this is not physical-phone performance certification.

## Match rules and results

Quick rooms group humans requesting the same arena. Private codes are unpredictable six-character, 30-bit invitations, not authentication. Humans occupy every available waiting slot before bots are created at start. Bot profiles use real input decisions every 100 ms: Easy uses a wider steering deadband and occasional safe-ground hesitation; Normal follows the mainline; Hard aims more precisely and attempts the exposed conveyor shortcut. All react to gaps, phase signals, wall openings, conveyors and recovery; none writes its position or completion flag.

A 3-second server countdown precedes racing. Both clients use the server's `startAt`; live order is explicitly an estimate based on finish time, checkpoint and distance. Final order comes exclusively from authoritative finish detection. Equal simulation times break ties lexicographically by stable participant ID. The race finishes when every participant has finished/DNF or `RACE_TIMEOUT_SECONDS` elapses (default 240). Unfinished participants are DNF; finished actors precede DNFs. DNF presentation order uses checkpoint/progress and stable ID, not a claimed completion time. Multiplayer results never change Solo/Training personal bests.

## Disconnects, limits and storage

WebSocket ping/pong runs every 3 seconds; the server terminates unresponsive sockets after 12 seconds. Browser application heartbeats and snapshot inactivity detection initiate reconnection. After the server observes disconnection, a slot is reserved for 20 seconds with neutral input; reconnecting rotates a random 256-bit participant-bound bearer token and retains ID, checkpoint, race state and finish. The old token/socket cannot reclaim that session after replacement. Tokens are held in tab memory, never in URLs, localStorage or logs. Automatic reconnect works in the same page; reloading/closing a tab loses its token and cannot reclaim the session. The client gives up after approximately 19 seconds from observed connection loss and offers a new match. Sleep/wake handshakes without a token have a separate bounded initial wait and explicit Retry. Permanent disconnects become DNF; waiting-room owners transfer after session expiry. Leaving voluntarily immediately releases a waiting slot or marks an unfinished racer DNF.

Wire version is 1. Strict parsers reject unknown fields/types, authority claims, non-finite/out-of-range input and malformed names/codes. `ws` limits payloads to 2 KiB and disables compression. Each socket allows an input burst of 90, refilling at 60/s, and control burst of 10, refilling at 1/s. IP connection and code-guess buckets are separate (12 burst, 1/s connection refill; 12 burst, 0.5/s guesses). Repeated violations close the connection. Connections are capped at 24 per observed IP and 256 total; rooms default to 32, input queues to 8, outgoing backpressure to 128 KiB. These are development limits, not DDoS protection. X-Forwarded-For is deliberately not trusted; Render proxy/NAT sharing can make IP caps apply to multiple users. Production scaling needs a verified proxy trust policy, stronger admission controls and observability.

Result persistence is isolated behind the async `ResultStore` adapter. Default `MemoryResults` keeps only the last 100 completed matches and **does not survive process restarts**. `RESULTS_FILE` opts into a JSONL file adapter; its errors are counted. A local Render Free file is also ephemeral. No durable external database has been provisioned or claimed. A durable future adapter must implement `save(MatchResult)` with match-ID idempotency/retry policy; it can be added without trusting client results or changing room physics. Rooms/tokens are intentionally in memory and are lost on a server restart. Lobby codes expire after ten minutes; finished rooms expire after two minutes.

## Render Free: manual setup

1. Connect the repository in Render and use `render.yaml` as a Blueprint, or create a **Free** Node Web Service manually. No service has been provisioned automatically.
2. Repository root is the build root. Build: `npm ci --include=dev && npm run build:server`. Start: `npm start -w @minimorph/multiplayer-server`. Use Node 24. The server binds `0.0.0.0` and respects Render's `PORT`.
3. Set `ALLOWED_ORIGINS` to exact comma-separated frontend origins, e.g. `https://your-site.netlify.app`. Add each preview origin explicitly when needed; no wildcard matching is used. Keep `ALLOW_NO_ORIGIN=false` for browser-only public use. Set optional `MAX_ROOMS` / `RACE_TIMEOUT_SECONDS` after load testing; free-tier capacity is not assumed.
4. Health endpoint `/healthz` returns liveness. `/readyz` returns readiness/protocol/room count and becomes unavailable during shutdown. WebSockets use `/ws` on the same service. Health is not an artificial sleep-prevention mechanism.
5. In Netlify/frontend build settings set `VITE_MULTIPLAYER_WS_URL=wss://YOUR-SERVICE.onrender.com/ws` and rebuild. This is a build-time variable. Do the same for a separately built Minima ZIP if online mode is desired. Empty configuration keeps Solo/Training available and explains online unavailability. No temporary Render domain is hardcoded.
6. Open two independent clients against the deployed frontend and verify both characters, countdown, checkpoints, finish order, reconnect and host origin rules. A free service may sleep/cold-start, disconnect or restart and lose rooms. The UI offers an explicit retry; there is no background traffic intended solely to defeat sleep.

SIGTERM/SIGINT stop acceptance, mark readiness false, close clients with a restart reason and force remaining sockets closed after a grace period. A client cannot resume a room lost in a restart; it must join a new match. No production Render account/service or physical-phone/live-host test is implied by local CI.

## Verification and future work

Run `npm run check`, `npm run test:browser`, and `npm run profile:multiplayer`. The profile defaults to 80 real wall-clock seconds and eight actual WebSocket connections across two rooms, with four humans/four bots per room; it reports CPU, RSS, tick costs and payload traffic. CPU/RSS include the colocated Node load generator; simulation/broadcast tick costs are measured separately. Payload counters exclude TCP/TLS/WebSocket framing overhead. Simulated humans send normal inputs; the benchmark is not a claim of skilled human play. Detailed results and actual PlayCanvas captures are collected in `docs/evidence/multiplayer`.

Tests cover protocol rejection, capacity, malformed-upgrade connection accounting, owner starts, bot filling, all bot routes/profiles, eight input sockets finishing every arena, real socket reconnection/token rotation, expiry, timeout/final order, shared clocks, checkpoint recovery, prediction/reconciliation/interpolation and two actual browser clients in the same room. Accelerated socket regression tests inject only the server clock to avoid waiting several minutes; they still send input over real sockets and retain all rate/physics/finish validation. The real-time load profile uses the production clock. The complete previous Solo/Training suite remains blocking. The pre-existing strict deformation diagnostic remains unchanged and separately non-blocking under the accepted art exception.

This is one-process, unauthenticated development multiplayer. Future scaling needs measured room placement/capacity, durable result storage, authenticated identity, trusted proxy/rate limiting, protocol evolution and server upgrades without losing all rooms. Qualification/tournament rules, physical player-player collisions, spectator controls, authoritative replay/anti-bot identity, database-backed reconnects and economics are deferred.

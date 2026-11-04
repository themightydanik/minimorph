# Multiplayer gameplay and load evidence

Actual PlayCanvas browser clients connect to the same local Node WebSocket server. No participant positions, finish flags or rankings were injected into the browser. Both pages load the approved GLB once and instantiate participant skins from that resource.

## Browser evidence

| Capture | Scenario |
| --- | --- |
| [Alice / desktop](pr7-two-clients-desktop.png) · [Bob / desktop](pr7-other-client-desktop.png) | Two independent browser contexts in one private race; two humans + six bots; shared server countdown and observed remote movement |
| [Alice / mobile](pr7-two-clients-mobile.png) · [Bob / mobile](pr7-other-client-mobile.png) | Pixel 7 emulation; simultaneous movement/Jump touch inputs; same eight participants |
| [Quick Match / desktop](pr7-quick-match-desktop.png) · [mobile](pr7-quick-match-mobile.png) | One human, seven bots, bounded 15-second wait and server start |

The second browser relays genuine WebSocket traffic through the Playwright transport route, delaying received messages by 60 ms and discarding every fifth snapshot. The test then cuts both ends of that transport, temporarily refuses reconnect attempts and verifies that a rotated welcome reclaims the same participant ID. This is application snapshot impairment, not a claim of physical wireless packet-loss testing. No server simulation or result messages are mocked.

Both multiplayer browser suites passed locally. The existing Solo/Training browser regressions remain part of the required CI. `npm run check` passed 85 unit tests, 22 Python character tests, typecheck, lint, both client builds, server build and validated MDS packaging. Protocol/service boundaries reject missing private codes, and malformed upgrades cannot consume active connection slots. Eight real input sockets complete each full-length arena in the accelerated server-clock regression, with physics, message validation, rate limits and server finish detection enabled. These are automated ordinary inputs, not claimed manual human skill.

## Real-time load measurement

Production-clock run on cloud Linux / Node 24, with no concurrent regression browser or production build. Two rooms each contain four WebSocket humans and four server bots: **8 real connections, 16 simulated participants, 8 bots**. The eight benchmark humans send normal input commands (straight running / periodic jumps); they are not claimed to navigate cleanly. The profile is separate from the accelerated regression tests.

| Metric | Measured |
| --- | --- |
| Wall duration | 100.19 s |
| Server ticks / achieved rate | 3005 / 29.99 Hz |
| CPU user / system | 5841.1 / 1229.2 ms |
| CPU, percent of one core | 7.06% |
| End RSS / peak RSS | 65.11 / 68.27 MiB |
| Tick median / p95 / maximum | 0.348 / 0.890 / 5.785 ms |
| Ticks exceeding 33.3 ms / overload drops | 0 / 0 |
| Inbound / outbound JSON payload | 17.83 / 506.47 KiB/s |
| Total received by eight clients | 49.55 MiB |
| Completed bots | 8 / 8 |

CPU/RSS include the colocated Node load generator. Tick costs cover server simulation and snapshot broadcasting; RAM is process RSS, not a per-room allocation estimate. Traffic counts application JSON payload, excluding WebSocket control/framing, TCP, TLS and internet retransmissions. Loopback RTT is not a Render/internet measurement. Absolute packet-loss or physical-phone FPS claims cannot be made from this run.

Full snapshots are intentionally straightforward and bandwidth-heavy. Quantized/delta/binary snapshots and admission limits based on real hosted measurements are appropriate follow-up work. The default room cap is a guard, not a tested Render Free capacity promise.

[Raw measured counters](measurements.json). Reproduce with `PROFILE_SECONDS=100 npm run profile:multiplayer`. No paid or free Render service was provisioned during this task. Follow the [manual Render Free guide](../../multiplayer.md) and repeat the profile against the actual deployed service before making hosting-capacity claims.

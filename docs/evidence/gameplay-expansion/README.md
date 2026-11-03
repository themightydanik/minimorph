# Orbit Circuit verification evidence

All images are actual PlayCanvas browser captures. No generated/synthesized character or gameplay images are used. The desktop/mobile gameplay captures come from ordinary-input full-course tests with all hazards enabled; profiling captures are idle scenes selected through the real menus.

| Arena | Desktop gameplay | Mobile gameplay |
| --- | --- | --- |
| Cosmic Sprint | [Desktop](pr5-cosmic-sprint-desktop.png) | [Mobile](pr5-cosmic-sprint-mobile.png) |
| Orbit Chaos | [Desktop](pr5-orbit-chaos-desktop.png) | [Mobile](pr5-orbit-chaos-mobile.png) |
| Gravity Mayhem | [Desktop](pr5-gravity-mayhem-desktop.png) | [Mobile](pr5-gravity-mayhem-mobile.png) |

[Desktop arena menu](pr5-selection-desktop.png), [mobile arena menu](pr5-selection-mobile.png), [landscape unlocked menu](selection-landscape.png), [final compact mobile results and Victory](results-mobile.png), [physical rotor hit](pr5-rotor-hit-mobile.png).

## Functional verification

- All three courses complete with ordinary digital controls, checkpoints enabled and no teleports. Orbit's alternative shuttle route actually triggers its jump pad and boards the moving deck in a separate physics replay.
- 50 unit tests pass, including the unchanged legacy replays, all mechanism interactions, vertical carrying/swept lift landing, hazard-before-finish ordering, route input-edge jitter, actual walk-off checkpoint recovery in each arena, progression/storage errors and race-state transitions.
- 22 Python character structural/skin regressions pass. TypeScript, ESLint, both production targets and read-only MDS packaging pass. The animated GLB/static asset hashes are unchanged from PR #4.
- Local desktop full-circuit browser run passed in 5.0 minutes; mobile in 5.7 minutes. These verify countdown values with a stopped race timer, three finishes, real saves/unlocks, next-level transitions, reload restoration and exactly one character load across all three scenes.
- Both host menus pass mobile pause/resume, frozen animation/timer and landscape selection checks. The original simultaneous touch movement/jump and original finish/restart/checkpoint recovery scenarios also pass. A separate actual rotor contact test verifies airborne impulse, no instant recovery and accurate hit feedback.
- These timings are automation wall time on a software renderer. Reference clean course runs take about 6–9 seconds of simulation time. They are compact gameplay vertical slices, not long production rounds or multiplayer matches.

## Standalone software-renderer samples

[Raw measurements](measurements.json). Node 24.19.0 / Chromium 154.0.8037.57 on Debian 13; the reported renderer is **ANGLE Vulkan SwiftShader (Subzero)**. Samples were collected without concurrent regression browsers using [the profiling script](../../../tools/gameplay/profile.mjs). Each sample is approximately three seconds of idle rAF cadence, with only 13–17 frames; p95 is noisy. These are **not physical-phone FPS, GPU frame-time, thermal, network or worst-case gameplay benchmarks**.

| Context | Arena | Frames | Median interval (ms) | p95 interval (ms) |
| --- | --- | ---: | ---: | ---: |
| desktop | cosmic-sprint | 14 | 233.4 | 466.7 |
| desktop | orbit-chaos | 15 | 216.6 | 313.3 |
| desktop | gravity-mayhem | 17 | 183.3 | 333.4 |
| mobile-emulation | cosmic-sprint | 15 | 216.6 | 433.3 |
| mobile-emulation | orbit-chaos | 15 | 216.6 | 466.6 |
| mobile-emulation | gravity-mayhem | 13 | 233.3 | 383.3 |

Initial localhost navigation-to-character-selected was 2.60s desktop and 2.53s Pixel 7 emulation. The retained GLB is 28,567,788 bytes with roughly 64MiB decoded RGBA texture allocation including mipmaps. Real mobile GPU/network/thermal profiling remains unverified; no smooth frame-rate guarantee is claimed.

Profiling scene captures: [Cosmic desktop](cosmic-sprint-desktop.jpg) / [mobile](cosmic-sprint-mobile-emulation.jpg), [Orbit desktop](orbit-chaos-desktop.jpg) / [mobile](orbit-chaos-mobile-emulation.jpg), [Gravity desktop](gravity-mayhem-desktop.jpg) / [mobile](gravity-mayhem-mobile-emulation.jpg).

[Architecture, mechanism rules and new-level instructions](../../arena-system.md). [Accepted temporary character defects and replacement](../../temporary-playable-character.md). The separate strict 2x art diagnostic remains unchanged and temporarily non-blocking; its failure is not falsified by passing gameplay tests.

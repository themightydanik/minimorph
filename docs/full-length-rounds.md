# Full-length Orbit Circuit rounds

Racing rounds are the default in both Telegram and Minima. The previous short courses remain selectable as **Training tracks**, including their original mechanisms and records. All gameplay still uses the shared PlayCanvas/TypeScript engine. No character geometry, textures, clips, rigging sources, SDK permissions or economic features changed.

## Layout and pacing

| Round | Mainline length to beacon | Sections | Checkpoints | Clean controller replay |
| --- | ---: | ---: | ---: | ---: |
| Cosmic Sprint | 383 m | 7 | 6 | 65.79 s |
| Orbit Chaos | 411 m | 7 | 6 | 72.89 s |
| Gravity Mayhem | 437 m | 8 | 7 | 75.64 s |

Times are measured simulation times with ordinary digital movement/jump inputs, no position setters, hazard overrides or automated gameplay in the shipped application. `tests/helpers/round-pilot.ts` records these controls outside production; the JSON fixture is replayed separately in unit and browser tests. The target is a clean 60–90 second run, not a guaranteed novice completion time. Falls add recovery time. There is no artificial timer wait or reduced running speed: ground speed stays 6 m/s, acceleration 34, braking 42, jump 8.5 and gravity 18. Full rounds use 80% air acceleration/braking; Training retains its previous response.

Cosmic introduces rotors, cross-current conveyors, pendulums, moving wall openings, shuttle junction, spring decks and a final gate/collapse gauntlet. Orbit starts with belts and introduces the crossing/steering challenges earlier. Gravity narrows decks to 6 m, starts with collapsing floors and ends with another combined gauntlet. Safe checkpoints divide the sectors; the finish follows the final sector. Sections are defined in metres in `game-content/src/rounds.ts`, with shared builders for consistent deck/obstacle spacing and separate section order/width/palette per round.

The conveyor sector has a narrow exposed forward belt, while shuttle junction offers a central platform shortcut and a longer outer bridge. These are physical routes. In the deterministic clean Orbit replay the boost choice saves approximately 2.57 seconds (70.32 vs 72.89). Total time depends on obstacle phase; a longer geometric route is not necessarily slower in every run. The test driver verifies all three mainlines and both alternative strategies on every round.

## Mechanisms

Seven new reusable kinds augment the seven retained Training kinds:

| Mechanism | Physical behavior | Visible information / recovery |
| --- | --- | --- |
| Pendulum | Bob follows an arc; overlap causes steerable knockback | Swing rod and floor crossing stripe |
| Moving wall | Solid panels with an animated passable opening | Bright gap uprights and floor guide; recently passed panels fade for camera visibility |
| Conveyor | Adds surface velocity only while supported | Animated treads; player can counter-steer or jump off |
| Bounce platform | Vertically moving support launches once per landing | Spring supports and raised deck; air steering for next landing |
| Timed gate | Open/warning/solid sequence; short closed phase | Signals, floor stripe and lifted beam; protection never permits passing through a closed gate |
| Pusher | Extension, hold and retraction; head and shaft impart directional impulse | Warning light, crossing stripe and actual moving piston |
| Collapse platform | Contact starts a per-run warning/fall/reset cycle | Warning deck, falling mesh, then absent support; resets after 3 s |

The original rotating discs, moving/disappearing platforms, sweepers, sliding blocks, jump pads and lasers remain supported and regression tested on Training tracks. Collision is an authored kinematic controller, not arbitrary mesh or general rigid-body simulation. Hits retain player control and decay over 0.55 seconds, with 0.8 seconds of repeated-hit protection. Landing feedback, coyote time, jump buffering, pause and restart are preserved.

`ArenaRuntime` caches surfaces, ID lookup, pose buffers and displacement output per run, culls distant collision checks and reuses the active surface array. Dynamic scene entities are disabled beyond 80 m. Static scene geometry is batched and materials are shared/released per arena. The existing approved character remains the dominant payload (28.57 MB); the DPR cap stays 1.5. This change does not claim physical-phone frame-rate validation.

## Controls, camera and presentation

An eight-way touch pad permits diagonal steering with one pointer while another presses Jump. Targets are 54 px in portrait and at least 48 px in short landscape viewports. Pointer cancellation, blur, release, pause and menu changes clear input. Keyboard and camera-relative controls remain available.

A dive was evaluated and deferred: the current gaps, spring transfers, steerable knockback and optional belt route already provide timing/risk choices. Adding a second airborne action without a dedicated approved clip would add a touch target and recovery state without a necessary route purpose. There is no hidden or partially implemented dive action.

The 3–2–1–GO countdown has changing prompts and a pulsing ring. The HUD shows sector name, a short obstacle hint, progress, remaining distance, timer and checkpoint count. Framing widens around wall/pendulum sections and lifts around spring transfers. Long-distance checkpoint recovery immediately reframes at the safe entry while preserving camera yaw. Results retain Victory, personal best and next/replay controls and add checkpoint split times and improvement against the previous best.

Full races use `minimorph.progress.v2` with schema 2. Training retains `minimorph.progress.v1` with schema 1. Old short times/unlocks are not fabricated into long-course records; they remain accessible in Training. Both storage paths retain guarded reads/writes and session-only fallback.

## Verification and limits

`npm run check` passes 22 Python character tests, type checking, ESLint, 65 unit tests, both production builds and validated Minima packaging. Unit tests cover the new obstacles, all mainlines and alternatives, exact recorded input replay, progress isolation and late-sector checkpoint/camera recovery. Character/rig files have no diff from main. The existing strict 2x deformation diagnostic remains unchanged and temporarily non-blocking under the accepted art exception.

Browser tests retain the original Training regression suite and add a complete full-length three-round circuit, persisted full records, separate old Training records and two-pointer diagonal/jump controls. Full circuit playback advances browser frames in 100 ms increments, exercising the actual fixed-step controller at a controlled 10 Hz render cadence. This is a low-frame-rate functional test, not a real-time FPS measurement; no player or hazard state is injected. Screenshots come from that PlayCanvas implementation.

Evidence and measured software-renderer results are in [evidence/full-length-rounds](evidence/full-length-rounds). Physical phones, live Telegram/Minima hosts and subjective first-time-player difficulty still require manual review. Accepted character deformation defects remain described in [temporary-playable-character.md](temporary-playable-character.md).

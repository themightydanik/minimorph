# Original Training tracks: arenas, mechanisms and progression

This document describes the compact tracks retained in **Training**. The default Racing mode and its expanded layouts are documented in [full-length-rounds.md](full-length-rounds.md).

Minimorph remains a manual party platform racer built on the shared TypeScript/PlayCanvas controller. Both Telegram and Minima mount the same UI and engine. This expansion adds three playable courses, not a new engine or a simulated online lobby. There are no competitors, server authentication, rewards, tokens, transactions or mandatory host connections.

## Components and ownership

| Component | Source | Responsibility |
| --- | --- | --- |
| Arena configurations | `packages/game-content/src/arenas.ts` | Platforms, spawn, ordered checkpoints, finish, routes, palette and mechanisms |
| Level Manager | `packages/game-engine/src/levels.ts` | Validated lookup and selected arena; no host dependencies |
| Obstacle System | `packages/game-engine/src/obstacles.ts` | Deterministic pose/phase, collision surfaces, oriented hazard contact and support displacement |
| Controller | `packages/game-engine/src/physics.ts` | Original 120Hz controller plus carrying, jump pads and recoverable knockback |
| Checkpoint System | `packages/game-engine/src/checkpoints.ts` | Ordered grounded activation, finish validation and arena-specific recovery point |
| Gameplay State Machine | `packages/game-engine/src/session.ts` | Selection → prepare → countdown → racing → finished; paused → countdown → resume |
| PlayCanvas scene | `packages/game-engine/src/arena-scene.ts` | Consumes the same samples as physics, owns/destroys the selected arena's entities and materials |
| Visual Effects | `packages/game-engine/src/effects.ts` | Fixed pool of 24 burst/confetti meshes; no per-event entity creation |
| Progression | `packages/game-ui/src/progression.ts` | Versioned local best times and sequential unlocks; safe in-memory fallback |
| Results UI | `packages/game-ui/src/results.ts` | Cached presentation of time, best, recoveries and next action |
| Menus / controls | `packages/game-ui/src/index.ts` | Shared accessible screens, countdown, HUD, restart, next arena and multi-pointer input |

`createGame` owns one PlayCanvas Application, one camera, one character presenter and one effects pool. `selectLevel` releases the old arena scene, constructs the next configuration and regenerates static batches. It does **not** destroy/reload the character or download another GLB. Initial briefing reframes the new arena; restart and checkpoint recovery retain the current camera view and damp its return. `game-content/src/legacy.ts` preserves the original course exports and the old `stepPlayer` API, so historical controller/replay tests continue running unchanged.

## Courses

- **Cosmic Sprint / Cadet:** the original five-island course, broad starting/finish decks, the original sinusoidal moving sweeper, extra rotating beams on the side lanes and safe checkpoint islands. Mint/violet with a pink ringed planet. Both original checkpoints are still required.
- **Orbit Chaos / Pilot:** choose the left jump-pad/shuttle route or the narrow right deck. Both meet at a rotating disc that carries the player. A sliding block guards the second checkpoint area, followed by a rotor near the finish. Plum/rose, green markers and an amber planet. Both routes are covered by ordinary-input physics replays.
- **Gravity Mayhem / Ace:** a warning/fade deck, timed laser gate, lateral shuttle, narrow checkpoint decks, sliding block and a final rotor/laser combination. Teal, gold and pink. The safe final jump requires reading the mechanism timing; the reference replay deliberately waits rather than disabling hazards.

Route points are authoring/visual markers; they do not steer the character. Runtime never runs an autopilot. Reference controls live under `tests/helpers/arena-runs.ts`, outside the application dependency graph.

## Seven functional mechanisms

All cycles use **race simulation elapsed time**, reset on restart and frozen during briefing, countdown, pause and results. `sampleMechanism` is the single source of render poses and collision phases. Positions are Y-up, platform `y` means the standing surface, and angles use the same sign in physics and rendering.

| Kind | Parameters | Actual interaction |
| --- | --- | --- |
| `sweeper` | `length`, `width`, `height`, `period` | Rotating horizontal capsule footprint, vertical overlap, upward/lateral impulse; can be jumped |
| `moving-platform` | `width`, `depth`, `axis`, `amplitude`, `period` | Sinusoidal x/y/z support carries a grounded player by per-tick displacement; jumping detaches |
| `sliding-block` | `width`, `depth`, `height`, `axis`, `amplitude`, `period` | Moving box contact produces knockback and hit feedback |
| `disappearing-platform` | `width`, `depth`, `onFor`, `warning`, `period` | Solid, amber warning, no support/hidden deck, then returns; falling players are never teleported on top |
| `jump-pad` | `width`, `depth`, `boost` | Grounded trigger sets upward speed, consumes coyote/jump buffer and emits a burst; no double jump |
| `laser` | `width`, `depth`, `height`, `warning`, `activeFor`, `period` | Safe green signals, pulsing amber warning, active pink field with real collision; warning is non-damaging |
| `rotating-disc` | `radius`, `period` | Circular support rotates a grounded player's position around its center; its bounding-box corners do not support the player |

Every mechanism also has unique `id`, `x/y/z`, and optional phase offset in **seconds**. Moving/rotating solids are kinematic supports, not general rigid bodies. Sweeper contact uses an oriented capsule, block/laser contact uses expanded boxes, and the controller still resolves platform tops rather than arbitrary side walls. Author reasonably slow mechanisms for the 1/120s collision step; this is not continuous collision detection for arbitrarily fast objects. Jumping does not inherit platform momentum. Hits add a decaying impulse while leaving steering available, plus 0.8s grace; they can knock you off a deck. Actual falls and the original legacy sweeper retain checkpoint recovery. No decorative entity is counted as a functional mechanism.

## Race lifecycle and storage

Choose an unlocked arena, read its briefing, then Start. The real-time 3–2–1–GO countdown is independent of render FPS; player physics and the race timer begin afterwards. The race timer remains local simulation time, capped catch-up as in the foundation, and has no competitive authority. Pausing on blur/visibility loss clears held input and freezes simulation; Resume provides a fresh countdown without resetting position, checkpoints or elapsed time. Restart clears the current run and mechanism phase, retaining camera orientation. Opening Arenas stops gameplay.

Finish requires every ordered checkpoint. Results save the fastest positive finite time, unlock only the next course, and offer replay / next / selection. Best times and unlocked count use `minimorph.progress.v1`, schema `{version:1, unlocked:1..3, best:{[arenaId]:seconds}}`. Unknown IDs/times and corrupt JSON are rejected; failed reads/writes or inaccessible `localStorage` keep session-only progress. Menus state whether persistence is available. Local data is a convenience, not authentication or anti-cheat.

## Add an arena without changing the engine

1. Add an `ArenaConfig` object to the `arenas` list. Use a stable ID, palette and static platforms. Keep the spawn, checkpoints and finish on permanent safe supports; do not put respawn points on fading decks.
2. Place each mechanism by data with a unique ID. Keep `warning + activeFor < period` for lasers, `warning < onFor < period` for fading decks, and positive periods/geometry. Use route point lists for alternative route signage.
3. The selection cards, sequential unlocks, next button, HUD, renderer and physics discover the new configuration. No host-shell or `createGame` rewrite is needed. Update the content count regression expectation intentionally when adding a course.
4. Add an ordinary-input route recording and tests. Verify checkpoints, hazards enabled, both movement/jump paths and timing margins. Check mobile portrait/landscape, resume, replay, next and reload.
5. Run `npm run check`, `npm run test:browser`, and inspect real screenshots. Use the existing character config for artist GLB replacement; do not re-rig the character to add a course.

## Rendering and limits

Colored deck rims, chevrons, landing markers, checkpoint pulses, ringed planets, moons and stars are original procedural geometry. Static geometry is batched with shared materials; a single directional light, ambient fill, no dynamic shadows/post effects, 1.5 DPR cap and a 24-mesh effects pool bound scene overhead. There are no third-party game assets, copied levels or logos. The approved 160k Minimorph, its textures, six animations and packed Blender workbench are unchanged. [Temporary rig caveats and replacement workflow](temporary-playable-character.md) remain applicable; the strict 2x diagnostic still records the accepted deformation failure.

The GLB still costs 28.57MB and roughly 64MiB decoded textures with mipmaps. This task does not certify low-end phone performance. Software Chromium measurements, automated mobile emulation, mocked Telegram/MDS and source/build verification must not be presented as physical-phone, live-client, live-node or multiplayer validation. Manual physical-device input, safe-area, frame time, thermals and network testing remains necessary before a mobile performance claim.

## Validation

`npm run check` covers structural character checks, TypeScript, ESLint, unit tests, both builds and read-only MDS ZIP packaging. Unit tests exercise each mechanism's collision/carrying/phase, both Orbit routes, complete courses, input-boundary jitter, checkpoint recovery, state-machine transitions and storage failures. Browser tests retain the original game/character regressions and add a complete three-arena progression run, save/reload, one character load across switches, countdown assertions, blur/resume, storage denial and both host menus on desktop/mobile.

CI runs core checks and the desktop/mobile browser projects separately, then retains **`validate` as a required aggregate** that fails unless core and both projects succeed. No functional test is made non-blocking. Only the pre-existing strict art-quality job remains non-blocking under the explicit temporary-art decision. Browser screenshots/traces are uploaded for both projects even on successful runs.

These are three compact authored courses: the reference clean replays finish in roughly 6–9 seconds of simulation time; a first manual attempt generally needs more time and recoveries. They form a complete progression/obstacle vertical slice, not long production race rounds, a multiplayer service or a physical-device certification. Subsequent work can author longer courses through the same data format.

To capture reproducible idle frame-cadence samples and scene screenshots, build/preview a host, then run `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node tools/gameplay/profile.mjs`. `GAME_URL` chooses the host and `PROFILE_OUTPUT` chooses the report directory (default `artifacts/gameplay-profile`). Run it without concurrent regression browsers. It forces software rendering, labels its measurements accordingly and unlocks only the menu for scene selection; it does not fabricate finishes or best times. Three-second rAF cadence samples are smoke measurements, not GPU frame-time or smartphone benchmarks.

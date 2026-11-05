# PR #11 — advanced racing geometry

Base: merged PR #10 (`615b14a`). This PR changes the three **full racing rounds**; the short training tracks and their progression/records remain available unchanged. All rounds retain their identities, length, ordered checkpoints and 60–90 second reference driving window. No character, movement constants, collision body, protocol version, render resolution, lighting, materials, effects or audio are downgraded.

## Course design

| Arena | New physical sections | Route decisions / final challenge |
| --- | --- | --- |
| Cosmic Sprint | The introductory rotor runway now has a broad lateral shuttle (8×10 m, ±0.9 m over 6 s) and a fixed outer bypass with wide entry/exit decks. The direct line rewards jump timing. | Three decisions: new launch bypass versus direct rotor/shuttle route; exposed faster belt versus wide middle; moving central shuttle versus longer fixed outer bridge. The familiar timed-gate/pusher finale remains. |
| Orbit Chaos | Two 4.4 s sliding blocks cross in opposite phases over the first conveyor crossing. The sliding-window sector climbs onto 0.65 m raised platforms before descending. | Exposed conveyor shortcut versus wide crossing, and direct shuttle versus outer bridge. Timed gates, moving windows, pendulums and rotors remain learnable from shared timing; the final pulse crossing keeps its clear warning signals. |
| Gravity Mayhem | Two skyward terrace sectors each climb 1.8 m through 0.6 m steps and a vertical lift. Other intervening sectors retain the attained elevation. The summit finish is 3.6 m above spawn. | Fast belt versus wide middle and moving shuttle versus fixed bridge reconnect before mandatory checkpoints. The final terrace/lift/rotor sequence ends at the raised finish arch; broad landings allow Dive → Slide → Recovery between hazards. |

New instances reuse existing deterministic mechanism types rather than adding a separate physics system. Lateral/longitudinal shuttles and vertical lifts share the same sampled surface/displacement model. All moving blocks, bars, lifts and gates derive their pose and contact phase from `PlayerState.elapsed`; the renderer imports the same sampler. The only sampler correction canonicalizes sub-nanosecond modulo roundoff at a full cycle boundary. No independent collision randomness, wall clock animation or new network fields are introduced.

## Routes, checkpoints and bots

`ArenaConfig.branches` describes optional lane targets, approach/rejoin distances and explicit tradeoffs. This is authored navigation metadata, not a position override. Easy bots choose the fixed bypass/outer bridge; hard bots choose the exposed belt. Normal/hard bots use central shuttles. All continue to steer, jump, wait at gates, suffer hits/falls and respawn through ordinary authoritative inputs. They neither teleport to route nodes nor ignore collisions.

Every branch ends before the next shared checkpoint. Checkpoint order and grounded height checks remain authoritative; arriving at the finish without all splits, or passing below the raised finish, cannot win. Respawn pads remain on static decks outside active hazard envelopes, at their actual sector elevation. Sector entry markers and route beacons follow the authored elevations. The existing follow camera tracks player/support height; skyward sectors request the existing extra camera lift for landing visibility.

## Reachability and grounding

Physics remain speed 6 m/s, jump impulse 8.5 m/s and gravity 18 m/s². The theoretical apex is approximately 2.01 m. The largest terrace lift-to-landing rise is 0.82 m and the horizontal gap is 2 m. These calculations are supplemented by actual fixed-step runs: all required routes complete with ordinary controls and no hits/falls. Recorded browser input fixtures have been regenerated for the new geometry; they never modify player positions.

Moving-platform tests stand through a complete cycle on every newly authored support, check x/y/z and support identity each tick, jump without continuing to inherit platform displacement, and land again. Server tests exercise ordinary commands and delayed prediction replay on moving supports inside eight-slot rooms. Existing eight-bot completion tests are extended with a different starting phase and checks that bots actually visit the authored branches and moving surfaces.

Reference clean main-route runs (not device performance measurements): Cosmic Sprint 65.8 s, Orbit Chaos 72.875 s, Gravity Mayhem 74.508 s. Reference routes do not establish that every arbitrary input sequence is safe; exposed lanes, missed jumps and poorly timed hazard crossings remain intentionally punishable.

## Evidence and validation

[Actual in-engine before/after captures](evidence/advanced-levels/README.md). Screenshots use the same fixed camera, 1280×720 buffer, DPR 1 and 1.2 s obstacle phase. They are staged section inspections; browser regression races separately replay ordinary controls through all three rounds.

Checks cover moving support grounding/jump/relanding, periodic deterministic poses, ordered branch progression, required route completion, alternate-phase eight-bot completion, static respawn safety, and client/server prediction equality including delayed snapshots. Existing character/audio integrity checks, types, lint, unit/integration/server tests, production packages and browser/multiplayer regressions remain required. CI results are recorded in PR #11. The historical strict original-rig diagnostic remains unchanged and nonblocking under the accepted exception.

No physical-device benchmark is required or claimed. Existing geometry/material batching, render distance for mechanisms and reusable simulation buffers remain in use. There is no adaptive quality, reduced resolution or disabled PR #10 polish. Character assets, original rollback model, animation bridge, rooms/reconnect/results and protocol v2 are preserved.

Owner level-design review is required before production activation. Do not automatically merge PR #11.

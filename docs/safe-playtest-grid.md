# Safe local Playtest starts and Grid Snap

Level Factory PR 2, based on main after #18 (`3696986`). These are preview/development editor tools. Published layout JSON v4, Cosmic Sprint data, physics rules, character assets, multiplayer wire format/WORLD_REVISION and fingerprint `95476a6fcdcc57ce` are unchanged.

## Playtest Start

The left sidebar offers four modes:

- **Default level spawn**: validate and start at the arena's normal spawn.
- **Enabled checkpoint**: choose an enabled checkpoint; initialize that checkpoint's real respawn context, without fabricated split times.
- **Selected walkable platform**: select one object with exactly one static compiled landing surface. The start is the actual collider centre, including owner-relative offset/rotation/scale, rather than the GLB centre. In Collider Edit Mode a selected local collider can disambiguate an owner.
- **Pick point on surface**: click **Pick surface point**, then click the viewport. The ray intersects shared compiled landing planes/footprints rather than mesh bounds or a global floor. Escape cancels. Grid settings do not round this chosen point off its support.

Coordinates/support ID and rejection reason appear under the control. Playtest is disabled for an invalid start. Changes to the draft or selection revalidate the choice; moving/deleting its support cannot leave a stale accepted start. Picked points retain their coordinates until explicitly picked again.

Validation uses `ArenaRuntime` at time zero and the shared `surfaceContains` footprint predicate. Static landing support must contain the player with a 0.30m edge inset (existing 0.25m radius plus 0.05m authoring margin). Invalid/nonfinite positions and heights at/below the existing −6m recovery threshold are rejected. Compiled overhead surfaces and solid boxes are checked against body clearance. Moving/rotating/timed/collapse supports and automatic bounce/conveyor/turbo contact areas are rejected. A conservative full hazard sweep envelope prevents accepting an inactive time-zero hazard just because its damaging phase occurs later.

This is deliberately restrictive: a visually plausible location may be rejected near a mechanism sweep or when an owner has several landing surfaces. Choose a clear static rest area or an explicit collider/point. This policy does not solve arbitrary mesh clearance, future route safety or all visually decorative overhangs; visual-only meshes do not become physics geometry. No physics body, level floor or new teleport/network command is introduced.

## State and Restart

`localPlaytestStart` is accepted only with an isolated `localArena`. The engine clones that choice and calls the fresh state factory on entry and Restart. Velocity, action/timers, turbo, knockback, cooldown, held-input latches, collapse state and elapsed simulation time start clean at zero/default values. The local adapter clears controls on Restart. Nearby real contacts/checkpoints can subsequently activate through the unchanged simulation.

**Restart** returns to the selected start and its initial checkpoint context. **Falling/respawning** continues to use the real arena spawn or most recently activated checkpoint. A custom point/selection starts with checkpoint 0, so a fall before checkpoint activation returns to the real level spawn, not to an invented checkpoint. Checkpoint mode starts with the selected checkpoint index. The arena's spawn/checkpoint definitions are never rewritten.

Playtest still mounts the local game directly: no menu/progression storage or multiplayer client. Exit disposes that local game and listeners, restores the retained editor application/camera/selection and leaves draft/history untouched. The UI disposer is idempotent. Resource destruction/late-load handling stays with the existing engine ownership path.

## Grid Snap

Off by default; steps are **0.25, 0.5, 1 and 2 metres**. Toggling or changing the step does not modify existing objects. Position edits through owner/environment inspectors, keyboard and translation gizmos snap moved axes to the absolute world grid. New asset placement uses the active grid. Rotation, scale, physics and local collider edits are not snapped.

Decorative groups/multi-selection snap their centroid's translation. Member spacing, relative heights and owner-local collider definitions are preserved. Drag positions are evaluated from the original drag snapshot, not by accumulating rounded deltas. A continuous drag remains one history transaction. Negative half-step ties round away from zero consistently, and negative zero is normalized.

The current gizmo remains an X/Z translation tool; Y can be set precisely in the existing inspector. There is no rotation/scale snapping or grid mesh/visual redesign. Grid and start preferences are editor-session state, not new layout JSON fields.

## Verification

Targeted checks cover four start modes/actual ray intersections, disabled and unsafe locations, dynamic/automatic supports, headroom/hazards, transformed local colliders, fresh state/restart and real checkpoint respawn, all four grid steps, group spacing/collider offsets and one-action Undo/Redo. Existing editor history, Playtest and Environment tests are included: 17 tests passed across four files. TypeScript and changed-file ESLint passed.

The focused Chromium smoke exercises grid opt-in/rounding/history, checkpoint movement + Restart, a viewport-picked start, two real Playtest entry/exit sessions, exact draft/selection/camera/history restoration, a single remaining editor canvas, zero WebSockets, unchanged localStorage and no page errors. The Telegram preview build is required to run that focused smoke; no full browser suite, Android build, asset processing or benchmark is used.

Known baseline test limitation: `cosmic-lifecycle.test.ts` has a fake PlayCanvas Application without a render system. Both existing tests fail during unchanged renderer construction at `bands.addComponent('render')`, before their intended lifecycle assertions. Neither that test nor `cosmic-scene.ts` is modified here. Actual repeated Playtest disposal is exercised by the focused browser smoke; long-duration GPU-memory profiling is not claimed.

The existing PR #18 carousel waypoint diagnostic is unrelated and remains unchanged. No default-level geometry, navigation or fingerprint correction is included.

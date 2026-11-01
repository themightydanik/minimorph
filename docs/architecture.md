# Foundation architecture

Both Vite applications import `@minimorph/game-ui`, which mounts `@minimorph/game-engine`. The engine consumes a small input interface and reports run state; neither Telegram nor MDS is referenced by the engine. `game-content` is plain typed course data. npm workspaces link source packages locally and Vite builds each shell independently. TypeScript checks all workspace sources from the root.

Physics uses a 120 Hz fixed step, normalized movement, gravity, an edge-triggered jump and swept downward foot collision with platform top surfaces. It is intentionally a simple platform controller, not a general rigid-body engine: side walls and moving obstacles are outside this PR. Gaps are covered by a complete traversal unit test. Frame catch-up is capped at 100 ms so tab suspension cannot cause a physics spiral; hidden tabs pause. Local timer values are practice feedback and have no competitive authority.

The camera follows from behind with frame-rate-independent damping. The cat is assembled from primitive meshes with silver armor, ears, a dark visor and cyan eyes. The environment uses shared materials, batched static geometry, capped pixel ratio (1.5), no dynamic shadows, no post effects, no network-loaded game assets and no physics WASM dependency. PlayCanvas is pinned to 2.23.3. Production bundles currently include roughly 531 KB gzipped of engine/application JavaScript per target; first-load performance and physical low-end devices still require profiling.

Pointer capture supports simultaneous direction and jump. Input clears on blur, visibility changes, pointer cancellation and restart. ResizeObserver tracks the canvas; Telegram viewport events can override available height. Safe-area insets and landscape layouts keep controls visible. Screen-reader text and button labels describe controls and run state, but the 3D course still requires visual navigation.

`mountGame().destroy()` aborts UI listeners, clears input, destroys the PlayCanvas application and scene, releases materials and disconnects resize/visibility listeners. The engine owns its procedural meshes through scene render components. Page exit disposes the shell; a restored back-forward-cache page reloads rather than keeping a destroyed canvas. Graphics context loss reports a reload action. The official MDS SDK owns page-lifetime polling and exposes no disposal API; the adapter stops its callbacks and timers on exit, while page navigation ends SDK polling.

## Deferred directories

`apps/telegram-bot`, `packages/replay`, `services/game-api`, `blockchain/contracts`, `blockchain/tests`, and custom `assets/characters` / `assets/environments` are reserved design directions, not fake packages. This PR adds no empty implementations. All visible geometry is procedural and all game rules are shared.

## Recommended PR #2

Add a stronger obstacle-course loop: checkpoints, one moving obstacle, a refined camera and physical-device performance budgets. Expand collision/controller tests and add an automated whole-course browser run. Keep multiplayer, identity/backend verification, replay validation and blockchain economics as separate scoped work.

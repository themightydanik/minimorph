# Cosmic Sprint → Galactic Fun Park

These are captures of the integrated PlayCanvas game, not concept images. `before-main.png` is the published main game before this redesign; all `desktop-*` and `mobile-*` images are local production-build captures. Controlled-clock route recordings use ordinary keyboard/touch inputs, never injected player positions, checkpoints or results. Their frame-time counters are **not performance benchmarks**.

| Review | Before | Redesigned |
| --- | --- | --- |
| Layout | [Old straight corridor](before-main.png) | [Desktop overview](desktop-overview.png), [mobile overview](mobile-overview.png) |
| Star Launch | | [Desktop](desktop-star-launch.png), [mobile](mobile-star-launch.png) |
| Hammer Plaza | | [Desktop](desktop-hammer-plaza.png), [mobile](mobile-hammer-plaza.png) |
| Turbo Lane | | [Desktop](desktop-turbo-lane.png), [mobile](mobile-turbo-lane.png) |
| Bounce Garden | | [Desktop](desktop-bounce-garden.png), [mobile](mobile-bounce-garden.png) |
| Orbit Carousel | | [Desktop](desktop-orbit-carousel.png), [mobile](mobile-orbit-carousel.png) |
| Star Finish | | [Desktop](desktop-star-finish.png), [mobile](mobile-star-finish.png) |
| Completed legal route | | [Desktop](desktop-bounce-finish.png), [mobile](mobile-bounce-finish.png) |
| Eight approved characters | | [Desktop](desktop-eight-players.png), [mobile](mobile-eight-players.png) |

The former footprint was 23 × 394 m with seven repeated longitudinal sections. The new footprint is approximately 139 × 261 m: a broad launch fan, 48 m plaza, branches separated by 100 m, two rotating discs and a turning final promenade. [Scope integrity](scope-integrity.json) records computed bounds, identical Orbit/Gravity content hashes and protected character/audio/lighting/physics paths.

The short Turbo route completes in 60.44 s and the longer Bounce route in 68.36 s in deterministic recorded runs, both with six checkpoints, zero falls and zero hits. Human races can take longer or encounter hazards. The render captures retain supplied materials, 2048px texture resolution and the approved character; no automatic quality tiers or resolution changes are introduced.

## Performance interpretation

`performance-desktop.json` and `performance-mobile.json` are separate **native-clock** Chromium software-renderer samples: 60 requestAnimationFrame intervals after loading/warmup, eight animated approved characters and real WebSocket snapshots in the actual multiplayer race scene after ordinary owner Start and a bounded review-clock advance through countdown. The existing local review harness then holds server physics between commands. These measure a reproducible rendering workload, not latency, a moving eight-player match or a hardware guarantee. Texture bytes are PlayCanvas tracked texture allocation, not total physical GPU memory.

No physical Xiaomi Redmi Note 8 was available. Its approximately 30 FPS target remains subject to real-device validation. Browser mobile emulation is not a substitute for that measurement.

Reproduce functional screenshots with `COSMIC_EVIDENCE=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser`. Run `node tools/cosmic-assets/profile.mjs` with the production preview on 5173 and the existing `npm run preview:tournament` review harness on 3013/3012 for native-clock samples. [Asset inventory and reproduction](../../cosmic-sprint-assets.md) contains every source/runtime hash, mesh budget and preparation constraint.

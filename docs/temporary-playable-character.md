# Temporary playable Minimorph

The product decision in PR #4 accepts the retained rig's visible deformation defects so game development can continue. The existing 160,000-triangle, 20-bone GLB is enabled in the actual Telegram and Minima game, not only the animation viewer. No new weight optimization was attempted: the previous bounded correction already regressed Run and was rejected. Reusing the best retained functional asset is the bounded delivery choice.

## Runtime and replacement

`packages/game-ui/src/character-config.ts` selects the local GLB, version, uniform scale (1), yaw (0), and 20-second loading deadline for both hosts. Vite fingerprints and includes the GLB in each build and the offline MDS archive. The procedural cat remains visible while loading and remains playable on network, decoding, missing-clip or timeout failure. Restart does not redownload the asset. Scene disposal cancels pending loads and releases loaded assets.

`animatedCharacterSource` in `packages/game-engine/src/character.ts` validates all six clips before replacing the fallback. Gameplay physics alone moves the anchor; animation is in-place. The retained export uses Y up, feet at local origin, faces -Z, and is approximately 1.8 world units tall. No additional root motion or procedural bob is applied to the skinned model.

Selection priority: Victory when won; Idle during recovery; Jump while airborne with positive vertical speed; Fall while descending; Land during the physics landing timer; otherwise Run above 0.15 units/s and Idle at rest. Transitions blend for 80ms. Idle/Run/Fall loop; Jump/Land/Victory play once and hold until the physics state changes. Land is intentionally interrupted after the existing 0.2s landing-feedback window (clip is 0.4s); an immediate jump always wins. Restart returns to physics-selected Idle. Movement, hazards, checkpoints, camera, controls and host integrations are unchanged.

To replace the temporary rig, add an artist GLB, change the URL and version in the shared config, and retain the six exact clip names. Supply in-place animations with the same origin/orientation/height; scale and yaw are configurable. Rerun functional checks and inspect both host builds. Keep the approved static GLB and packed editable workbench as source/reference artifacts.

## Accepted defects and CI

The retained rig has cuff/body strain and shin/knee/hip folding, especially Run and Victory. The previous measured maximum local edge stretch is 9.312x. This is temporary art, not final deformation approval. The approved static asset, all textures and Blender workbench remain unchanged; no 10k substitute is used.

`npm run check` and the desktop/mobile browser suite remain blocking in `validate`. The separate `rig-deformation-quality` job has job-level `continue-on-error: true`: its strict evaluator still exits nonzero for edge stretch above 2x, and its report is uploaded even on failure. `npm run check:rig-quality` still fails locally. A green functional workflow therefore does not mean the art passed. Remove the temporary non-blocking treatment after artist replacement passes the original gate.

The GLB is 28,567,788 bytes, with three embedded 2048px texture maps (~48MiB decoded RGBA before mips). This is a substantial download/GPU cost. Browser mobile emulation is functional evidence, not proof of real-device performance. Real Android/iOS GPU, thermal and network profiling remains future work.

[Recorded strict quality summary](evidence/temporary-character/quality-summary.json) retains asset and semantic hashes, thresholds, per-clip extrema and all gate results.

## Measured cloud run

[Raw measurements](evidence/temporary-character/performance.json), [desktop gameplay](evidence/temporary-character/gameplay-desktop.png), [mobile gameplay](evidence/temporary-character/gameplay-mobile.png). In cloud Chromium using SwiftShader software rendering, a short idle sample recorded desktop median/p95 frame intervals 483/933ms and Pixel 7 emulation 483/717ms; navigation-to-GLB selection was 4.20/4.45s. The regression suite was running concurrently. These low software-renderer results establish no real-device frame-rate claim. They explicitly leave GPU performance unverified; the asset needs physical-device profiling before performance acceptance.

Course finish evidence with the actual animated model: [desktop Victory](evidence/temporary-character/victory-desktop.png), [mobile Victory](evidence/temporary-character/victory-mobile.png). The game browser tests observe all six active PlayCanvas animation states during ordinary course controls before accepting the finish.

## Validation on 2026-11-03

Node 24.19.0, Python 3.12.14, Chromium 154.0.8037.57 on Debian 13, SwiftShader software rendering.

- `npm run check`: PASS — 22 Python structural/skin tests, TypeScript, ESLint, 28 unit tests, both production builds, read-only MDS packaging. Existing JS bundle-size warning remains.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test`: 22 passed in 10.1 minutes; two tests timed out during browser **context setup**, before running game code (desktop Minima course and mobile Telegram failed-download fallback).
- With the final shared 60s browser context timeout, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test --last-failed`: both passed in 1.8 minutes. All 24 scenarios are covered successfully across these runs; this is not a claim of a single uninterrupted 24/24 run. Controlled course tests allow 180s for the skinned model on software rendering; functional assertions are unchanged or expanded. CI validation has a 20-minute budget.
- `npm run check:rig-quality`: expected FAIL (`edge_stretch` only), threshold still 2x. See the recorded quality summary; asset SHA-256 is unchanged.
- Approved static GLB and editable Blender workbench remain byte-for-byte unchanged. Gameplay, checkpoint recovery, hazards, controls, camera and Telegram/read-only Minima bridge checks pass.

Ready for review/merge as a **temporary playable character**, with the documented visual defects accepted by the product decision. Final deformation approval and physical-device performance acceptance remain future work.

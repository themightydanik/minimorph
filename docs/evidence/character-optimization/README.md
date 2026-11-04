# Isolated character candidate: review evidence

**Production selection remains the original. Candidate is not approved.** [Both production package audits](production-package-audit.json) contain only the original GLB with its unchanged SHA-256; the candidate is not bundled. All images are actual PlayCanvas renders from the unchanged full Cosmic Sprint scene, not generated illustrations. Original is left and candidate right in each comparison. The normal camera distance/FOV, lighting, environmental materials and rendering-resolution policy are unchanged.

## Side-by-side review

| Clip / sampled time | Normal gameplay distance | Additional inspection |
| --- | --- | --- |
| Idle / 0.50 s | [Original / candidate](compare-idle-gameplay.png) | [Close-up](compare-idle-close.png) |
| Run / 0.15 s | [Original / candidate](compare-run-gameplay.png) | [Back](compare-run-back.png) · [Close-up](compare-run-close.png) |
| Jump / 0.20 s | [Original / candidate](compare-jump-gameplay.png) | See matched frames below |
| Fall / 0.00 s | [Original / candidate](compare-fall-gameplay.png) | See matched frames below |
| Land / 0.20 s | [Original / candidate](compare-land-gameplay.png) | See matched frames below |
| Victory / 0.50 s | [Original / candidate](compare-victory-gameplay.png) | [Back](compare-victory-back.png) · [Close-up](compare-victory-close.png) |

The Run 0.15 s capture is the worst sampled removed-vertex distance pose. Face/helmet/ears and proportions remain very similar in these views. Body/limb contour, surface interpolation and specular/texture detail can change; close inspection is required. Existing temporary skinning defects are present in both. These captures do not constitute owner or artist approval.

## Matched camera frames and pixel analysis

Each pair below places one original/candidate at exactly the same location, camera, animation time, full scene and drawing buffer. The pixel comparison uses a fixed `[550,300,730,510]` character-region rectangle, including some background. It is not a perceptual-quality score or a claim that the same fraction of the character is identical.

| Clip | Original | Candidate | Mean channel absolute error /255 | ROI pixels with any channel change >10 |
| --- | --- | --- | ---: | ---: |
| Idle | [Original](original-idle-matched.png) | [Candidate](candidate-idle-matched.png) | 0.485 | 1.41% |
| Run | [Original](original-run-matched.png) | [Candidate](candidate-run-matched.png) | 0.414 | 1.22% |
| Jump | [Original](original-jump-matched.png) | [Candidate](candidate-jump-matched.png) | 0.440 | 1.28% |
| Fall | [Original](original-fall-matched.png) | [Candidate](candidate-fall-matched.png) | 0.462 | 1.40% |
| Land | [Original](original-land-matched.png) | [Candidate](candidate-land-matched.png) | 0.432 | 1.31% |
| Victory | [Original](original-victory-matched.png) | [Candidate](candidate-victory-matched.png) | 0.523 | 1.55% |

[Pixel metrics](pixel-comparison.json) · [Capture metadata](captures.json) · [Geometry/skin/clip preservation audit](geometry-validation.json).

## Paired 1 / 2 / 4 / 8 actor load measurements

Cloud Chromium with forced SwiftShader software rendering; **not Redmi Note 8 FPS, hardware GPU measurements or full multiplayer performance**. All cases use the real game renderer and full unchanged Cosmic Sprint scene, a fixed normal gameplay camera and arena phase 1.2 s, Run animations playing, and exactly **1280×720 CSS pixels / 1280×720 drawing buffer / DPR 1**. No world/lighting/material/effect quality was lowered. The normal DPR ceiling remains 1.5; DPR 1 is this desktop browser context’s actual device pixel ratio.

The render probe omits normal HUD/network processing. For each actor count it runs original/candidate then candidate/original in fresh contexts, with 3 seconds of post-load warmup and at least 15 seconds / 20 frames per sample (30-second cap). No concurrent regression browser or build ran during measurement. Rows below pool frame counts and measured seconds across the two trials. At eight actors each variant has only 40 measured frames, so the result is an estimate with limited samples.

| Visible actors | Original software FPS (trial range) | Candidate software FPS (trial range) | Relative change | Frames original / candidate | Draw calls original / candidate |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 4.37 (4.09–4.65) | 4.87 (4.87–4.87) | +11.6% | 133 / 148 | 52 / 52 |
| 2 | 3.04 (2.91–3.17) | 3.52 (3.52–3.52) | +15.9% | 95 / 106 | 53 / 53 |
| 4 | 1.83 (1.75–1.92) | 2.11 (2.02–2.21) | +15.3% | 57 / 65 | 55 / 55 |
| 8 | 1.07 (1.07–1.07) | 1.18 (1.18–1.19) | +10.2% | 40 / 40 | 59 / 59 |

The eight-actor improvement is about **10%**, not a 21% FPS promise from the triangle reduction. The target of approximately 30 FPS on Xiaomi Redmi Note 8 remains unverified. Software-rasterizer timing must not be extrapolated to its Adreno GPU. The conservative candidate creates some geometry headroom; it is not sufficient evidence to declare the device target achieved.

[Raw trials, frame intervals, actor visibility, animation times, draw calls and renderer strings](performance.json). All actor centers are in view, each instance remains enabled and the measured draw calls include all 1/2/4/8 meshes. No automatic LOD or resolution changes are present.

| Count | Original scene | Candidate scene |
| ---: | --- | --- |
| 1 | [Original](load-1-original.png) | [Candidate](load-1-candidate.png) |
| 2 | [Original](load-2-original.png) | [Candidate](load-2-candidate.png) |
| 4 | [Original](load-4-original.png) | [Candidate](load-4-candidate.png) |
| 8 | [Original](load-8-original.png) | [Candidate](load-8-candidate.png) |

The original and candidate have one material/primitive and 20 joints/four influence slots each. Draw-call and bone counts were not artificially reduced. Textures and all animation/skin data are unchanged; the saved file bytes and GPU mesh buffers are shared once per variant rather than duplicated per instance.

[Method, reproduction, physical Redmi Note 8 test instructions and approval/rollback boundary](../../character-optimization-study.md).

Validation: `npm run check` passed 85 unit tests, 22 existing Python character tests, the additional candidate integrity/30-pose audit, type checking, lint, both frontend builds, server build and MDS packaging. The isolated comparison browser test passed on desktop and mobile with unchanged DPR/buffer behavior. Full repository browser regressions remain required in CI.

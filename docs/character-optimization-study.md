# Minimorph character optimization study — not approved for production

**PR #9 update:** The owner explicitly approved activation of the exact PR #8 candidate. Production now selects it; the original and historical study evidence remain intact. See [activation, movement and rollback](character-movement.md). Any statements below about an unapproved candidate describe the earlier PR #8 study stage.


The owner authorized preparing and comparing a candidate, with a separate approval required before replacement. [The policy](character-optimization-policy.md) applies to this PR. The production URL/version in `packages/game-ui/src/character-config.ts`, original animated/static GLBs, textures, rig sources and game renderer are unchanged. No production menu, automatic LOD, adaptive resolution or fallback selects this candidate.

## Prepared variant

| Property | Production original | Isolated candidate |
| --- | ---: | ---: |
| Triangles / triangulated polygons | 160,000 | 125,928 |
| Vertices | 145,409 | 117,157 |
| File bytes | 28,567,788 | 26,238,044 |
| Mesh primitives / material slots | 1 / 1 | 1 / 1 |
| Skin joints / GPU influence slots | 20 / 4 | 20 / 4 |
| Animation clips | 6 | Same 6, exact original data |
| Textures and material definitions | Original | Exact original bytes/definitions |
| Production approval | Existing temporary character | **Not approved** |

Triangle count falls 21.30%, vertex count 19.43%, and file size 8.16%. Both GLBs contain triangle lists, so no additional quad/n-gon polygon count is implied. Eight visible instances represent 1,280,000 versus 1,007,424 triangles and 1,163,272 versus 937,256 vertex instances before GPU caching. Shared buffers/textures are loaded once per variant; file/memory savings must not be multiplied by eight.

The candidate is `assets/characters/minimorph/optimization/minimorph_candidate_v1.glb`. Its adjacent JSON records source hash, algorithm settings, counts and `productionApproved: false`. The `.vertex-map.u32` maps each candidate vertex to its original vertex for auditing. The candidate SHA-256 is `cd566c9024676775e3efe8d751de3605a035eca3ca4bc3c00082d7b5d283d6b6`.

## Method and preservation

Meshoptimizer 0.25.0 performs index-only simplification with a requested 75% triangle target and 0.15% relative error budget. Topological borders and 105,497 vertices are locked: upper head/ears, head/neck-weighted vertices and hand-weighted vertices. Normals, UVs and dense skin-weight attributes influence simplification. The error/protection constraints stop at 125,928 triangles rather than forcing the requested 120,000. There is no component pruning, welding of differing attributes, reweighting, bone deletion or Blender re-export.

Only the index buffer and retained rows of the mesh vertex buffers change. Unused vertex rows are compacted. Retained positions, normals, tangents, UVs, joint indices and weights remain bit-identical. Node hierarchy, inverse bind matrices, every animation sampler, all embedded texture bytes, materials, clip names and durations remain exact. The source SHA-256 stays `1bcecf7f25e35f1cfb7e4afce6542098a29c44bd9e86cd4ac281da3c3a818f76`.

One primitive/material is already the minimum useful draw-call count, and 20 joints/four influences are modest. Removing more joints or quantizing/pruning weights would risk changing the approved poses. This candidate therefore reduces GPU vertex/skinning and triangle work without claiming a draw-call or bone-animation reduction.

The separate candidate audit retains the original pinned 160,000-triangle production checks. It verifies source integrity, unchanged production selection, geometry bounds, original attribute mapping, exact rig/clips/images, protected vertices and all six clips at five sampled times each. Retained vertices have **zero measured pose difference** in those 30 poses; exact shared transforms/weights also preserve their mathematical deformation between samples.

This is not whole-surface equivalence. Removed vertices are replaced by larger interpolated triangles. In the sampled poses the maximum removed-original-vertex distance to a candidate triangle was **15.21 mm** (Run at 0.15 s), while the largest per-pose p99 was **3.48 mm**. Distances use a 24-nearest-centroid triangle shortlist, giving distances to actual triangles at those sample points, not a continuous Hausdorff bound. The simplifier's 2.69 mm object-space error estimate is not a guarantee for a deformed pose.

## Visible differences and approval evidence

[Gameplay-distance comparisons, close-ups, matched frames and measured frame cadence](evidence/character-optimization/README.md).

At normal camera distance the face, helmet, ears, palette and proportions remain recognizable and very similar in the captured views. Larger body/limb triangles can change sleeve, torso, knee/boot edge interpolation and specular/texture detail. Small contour/highlight changes are more apparent on close inspection and in matched-camera differences. They are not described as pixel-identical or artist-approved. The most different sampled Run pose is included, rather than selecting only the smallest-error pose.

The existing temporary rig's deformation defects remain. No strict deformation threshold was relaxed, and the candidate audit is not a claim that the original artist-quality exception has been resolved. Owner review of all six clips is required before production activation.

## Reproduce

```sh
npm ci
npm run prepare:character-candidate
npm run check:character-candidate
# Optional full sampled surface analysis; requires tools/blender/requirements-build.txt:
python3 -m pip install -r tools/blender/requirements-build.txt
python3 tools/character-optimization/validate.py --report artifacts/full-candidate-analysis.json
npm run preview:character
```

In another terminal:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node tools/character-optimization/capture.mjs
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run profile:character-candidate
python3 tools/character-optimization/compare-pixels.py
```

The isolated review page is `/optimization-study.html?compare=1&clip=Run&time=0.15&view=front`. Add `&distance=close` for enlarged inspection. Use `variant=original` or `variant=candidate`, `count=1|2|4|8` and `clip=Idle|Run|Jump|Fall|Land|Victory`; omit `time` for playing animations. The tool imports the real `createGame` and unchanged full Cosmic Sprint scene. It fixes arena phase/camera to compare the same environment and samples an animated crowd; it is a render-only probe, not a claim of full network/gameplay FPS. Lighting, world geometry, materials, effects allocation and the normal 1.5 DPR ceiling remain the existing game settings.

`npm run check` includes the candidate integrity/pose audit alongside all original checks. The separate browser smoke verifies both variants, a frozen Run pose and the unchanged resolution/DPR policy. Production builds still package only the approved original model.

## Redmi Note 8 validation

Cloud SwiftShader measurements cannot establish 30 FPS on the Redmi Note 8 or predict its Adreno GPU bottlenecks. The goal remains open until physical-device testing. Keep the original game quality settings and screen orientation fixed; do not lower resolution or world quality to reach the goal.

1. On a computer on the same trusted Wi-Fi, run `npm run preview:character -- --host 0.0.0.0`; open `http://COMPUTER-LAN-IP:5175/optimization-study.html?controls=1&variant=original&count=8` in Chrome on the phone.
2. Use the manual count and Original/Candidate buttons. They select only isolated study assets/counts, with no production setting changes. Wait for load/warmup, then tap **Measure frame cadence** for a 20-second sample. Record phone/Chrome version, orientation, viewport/buffer dimensions, DPR, thermal/battery state and repeated AB/BA samples for 1, 2, 4 and 8 actors.
3. Repeat sustained runs after the device warms. A render-only probe omits normal HUD/networking and does not certify full multiplayer FPS; repeat a real eight-participant match as part of any later approved activation review.

## Activation and rollback boundary

**Do not change production selection in this PR.** Review counts, performance and all visual comparisons, then obtain explicit owner approval naming the candidate. Until then, the original remains the only production choice and rollback is unnecessary.

If activation is approved later, make a separate, reversible activation commit selecting the approved candidate URL/version through the existing CharacterSource contract. Record the owner approval and update the study-only production-selection/approval guards in that same commit; keep the geometry, texture, rig and clip preservation checks. Keep the original GLB. Rollback is reverting that activation commit (restoring the existing `animation/minimorph_animated_v1.glb` URL and `minimorph-animated-v1-temporary` version) and rebuilding both hosts. Do not rewrite clips, rigs, environments or lighting as part of that switch.

# Character rig and animation — experimental intermediate, NOT approved

**The automated skin is not acceptable for production.** This PR supplies the best technically validated intermediate artifact, actual defect renders and a plan for artist refinement. It does not claim that the character is animation-ready. The approved `minimorph_v1.glb` is unchanged, and production gameplay still uses its current fallback.

The source is merged PR #3 on `main` (`84d9a9c3fcf828223f8f1c5c7e9e5ecb79ef4650`). Its GLB SHA-256 remains `52dff3dd1f96d7c7958f48a0a06013e2a0b1bb8f515183dabeed499fd584c851`. No character reconstruction, geometric simplification, material redesign or texture replacement is performed. The animated neutral mesh has the same 160,000 triangles and 145,409 exported vertices; measured neutral world positions match the static source exactly and all three embedded image hashes match.

## Rig and clips actually implemented

Twenty bones: Root, Pelvis, Spine, Chest, Neck, Head and left/right Shoulder, UpperArm, LowerArm, Hand, UpperLeg, LowerLeg and Foot. The short original anatomy is retained. The mask-based weights are explicitly authored by the script, not automatic heat weights. Head/helmet/eyes/ears are assigned rigidly; flexible joint bands blend adjacent limb weights. No independent head turning is authored because the neck/helmet boundary needs artist review.

| Clip | Duration | Playback | Current quality |
| --- | ---: | --- | --- |
| Idle | 2.0 s | Loop | Conservative body breathing; neutral reference is intact |
| Run | 0.6 s | Loop | Arms/legs move, but wrist/hip stretching and ground penetration fail quality review |
| Jump | 0.4 s | Once | Takeoff pose draft; wrist/body transition stretches |
| Fall | 0.8 s | Loop | Descending pose draft; limb boundaries require repainting |
| Land | 0.4 s | Once | Compression draft penetrates ground and distorts limb transitions |
| Victory | 2.0 s | Once | Raised-arm pose exposes severe membrane-like stretching; rejected as final animation |

Clips are in place: the skeleton does not translate horizontally. Root vertical motion is small visual body bob/compression, not a jump trajectory or gravity simulation. Run's intended stance reference is 0.8 units/s; the preview supports 0.25–2× playback. Actual foot contact is currently wrong, so no foot-sliding or speed-match guarantee is made.

## Measured deformation failures

[Key-pose contact sheet](../assets/characters/minimorph/animation/contact-sheet.png) deliberately shows defects. [Per-pose measurements](../assets/characters/minimorph/animation/deformation.json) distinguish structural validity from artistic quality:

- Run minimum height approximately −0.0231 units; Land approximately −0.0606. The −0.01 ground-clearance gate fails.
- Edge stretch ratios reach approximately 151× in a Run key pose and 278× in Victory, for source edges longer than 0.0001 units. Hard anatomical mask boundaries are visibly unsuitable; these figures are not an acceptable deformation budget.
- Head/helmet-region vertices follow their rigid bone within 1e−6 units in the seven measured poses. That local pass does not excuse the body/armor failures.
- Only seven representative poses are measured/rendered. No complete self-intersection or all-frame contact certification is claimed.

The unified triangulated mesh has no semantic armor/paw boundaries or deformation-oriented joint loops. Coordinate masks cross some wrist/hip/armor regions. A single connected surface does **not** prove that every apparent paw/body contact is welded: those contacts must be inspected before any topology edits. This is a limitation of the current automated weighting, not a claim that the approved character cannot be animated.

## Reproduce and open an editable source

Use Blender 4.3.2 with its bundled NumPy, from the repository root:

```sh
blender --background --factory-startup --python-exit-code 1 --python tools/blender/rig_character.py -- --renders
python tools/blender/inspect_animation.py --report assets/characters/minimorph/animation/validation.json
```

To generate a complete editable rig/weights/actions source outside Git:

```sh
blender --background --factory-startup --python-exit-code 1 --python tools/blender/rig_character.py -- --output /tmp/minimorph-rig --save-source /tmp/minimorph-rig/source.blend --renders
```

The script refuses a changed source hash so anatomical masks cannot silently bind a different model. The `.blend` is generated on demand rather than duplicating large packed sources in Git. The animated GLB embeds its own three necessary PBR maps; separate unused texture copies are not added. Both standalone static and animated review GLBs necessarily contain textures, but neither is selected or copied into the current production host bundles. No byte-identical cross-platform export claim is made.

## Actual PlayCanvas playback

Run `npm run preview:character`, open `/animation.html`. Select any of six clips, pause/resume, adjust speed, change loop behavior for Idle/Run/Fall, and use **Neutral pose** to restore bind transforms. Jump/Land/Victory remain non-looping. The static comparison link opens the approved source viewer. A visible warning explains the rejected deformation quality; it is not hidden behind passing tests.

The page uses the existing shared `gltfCharacterSource`, then binds actual container `AnimTrack` resources to an animation component. It owns no world movement and does not change engine/controller APIs. Skin/clip loading, bone count, moving hand transforms, switching, pause/resume and speed are exercised in desktop/mobile browser tests. Viewport emulation is not physical-mobile performance validation.

For the exact browser capture of Blender key poses (no generated/repainted substitute images), run the preview and:

```sh
node tools/character-preview/capture-animation.mjs
```

## Existing gameplay integration points — documentation only

`CharacterVisual.update(state, dt)` is the existing visual-update boundary, owned by `loadCharacterVisual`. `PlayerState` exposes horizontal velocity, `grounded`, vertical velocity `vy`, `landingTime`/`landingImpact`, `won` and `recovery`. A later, approved animation integration can prioritize Victory on `won`, reset during recovery/respawn, use Land on touchdown, Jump/Fall according to airborne `vy`, and Idle/Run by horizontal speed. The fixed-step controller retains all movement, collision, gravity and checkpoint responsibility. This PR does not enable that state mapping in gameplay.

## Actionable completion plan

1. Open the generated editable source. Select wrist/palm/hip/armor regions manually; correct the masks and inspect whether contacts are physically connected before cutting anything. Preserve neutral vertex positions, UVs and textures.
2. Assign each complete hard helmet/chest/pauldron/cuff/knee/shin region to a rigid bone or separate rigid accessory. Avoid cutting a metal panel with a coordinate plane. Check the original silhouette from all directions.
3. Paint smooth shoulder/elbow/hip/knee/ankle transitions and check rotated joints. If weights alone cannot work, perform local artist retopology/segmentation with reference-constrained projection; revalidate neutral appearance and texture preservation before exporting.
4. Align actual joint pivots, author a three-dimensional leg IK/pole/foot-roll setup and correct foot plants throughout Run/Land. Replace the provisional sagittal solver; keep world root X/Z fixed.
5. Polish all six motions, reduce hand/body and leg/body intersections, and measure contact, armor rigidity and texture strain across every frame. Retest several Run rates against a moving reference ground.
6. Re-export and verify actual PlayCanvas deformation. Human art approval and real-device profiling are required before production enablement. Do not merge or label the current rig production-ready.

Structural CI checks can pass while `quality-status.json` correctly records `deformation_quality_pass: false` and `production_ready: false`. No blockchain features, gameplay physics, production camera or host integration changes are part of this work.

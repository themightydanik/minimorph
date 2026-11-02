# PR #4 skinning rework — improved, still NOT approved

**The complete deformation-quality gate still fails.** Palm/thigh and inner-toe/pelvis assignment errors are corrected, contacts now pass the declared tolerance, and selected PBR armor cores remain rigid. Remaining cuff-to-waist and knee/hip strain prevents claiming that the character is fixed or production-ready. PR #4 must remain Draft. Gameplay and the approved static GLB are unchanged.

## What the source actually shows

The source is the exact approved Meshy-derived `minimorph_v1.glb`, SHA-256 `52dff3dd1f96d7c7958f48a0a06013e2a0b1bb8f515183dabeed499fd584c851`. It has 160,000 triangles, 145,409 GPU vertices and 79,904 unique geometric positions. No faces were cut, vertices moved, UVs repainted or textures replaced in this rework. Neutral raw positions still match exactly; all three embedded image hashes match.

[Semantic/connectivity diagnosis](../assets/characters/minimorph/animation/rework/semantic-regions.json) is reproducible from actual face edges, UVs and the supplied metallic/base-color atlas:

- The old arm mask required `z>0.40`, but the actual paws extend down to approximately `0.303`. Lower palm vertices were incorrectly assigned to thigh bones. Baseline Run's worst edge joins Hand and UpperLeg across that artificial boundary.
- The old leg mask required `|x|>0.095`, leaving inner toes on Pelvis. Diagnostic foot-bone positions reached their target while those vertices descended with the pelvis: the principal floor defect was wrong weights, not an incorrect IK ankle target.
- Below `z=0.55`, the body and two lower paws are separate face-edge components. They are not connected simply because they appear close.
- Below `z=0.60`, three large components remain. Below `z=0.65`, they join through actual shared face edges. This proves a real low cuff/waist surface connection, not just coincident vertices. The shoulder connection is above this diagnostic cut.
- Original hip masks also switch Pelvis/UpperLeg abruptly near `z=0.50`; knee/armor boundaries require semantic treatment rather than a coordinate plane.

Coordinates above use Blender Z-up after import; exported glTF uses Y-up. Values are game units, not an assumed physical meter scale.

## Changes selected after comparison

`prepare_rig_weights.py` welds positions **for analysis only** and identifies isolated lower paw components. Whole connected silver cores are classified using PBR values and actual surface connectivity; complete cores receive one rigid bone. Harmonic interpolation is confined to joint/boundary neighborhoods. Paws cannot carry leg/pelvis influence, and paw controls cannot leak into torso labels. Sole assignments include the inner toes. Original vertex/UV ordering is retained.

Joint pivots follow the compact anatomy more closely. Idle breathing stays above the pelvis; Victory keeps neutral planted legs rather than unnecessarily compressing knees. Run alternates stance/swing, and Land uses an eased compression/recovery curve. That easing also reduces inter-keyframe FK penetration, which a keyframe-only test missed. Root X/Z motion remains zero in the exported GLB; the existing game controller retains world movement/gravity.

Automatic dilation of rigid cores into adjacent rims was tested and rejected: it increased a Run short-edge stretch to approximately 108.6x. The selected artifact is the better validated intermediate; we did not hide the result by lowering expressive motion or raising the acceptance threshold.

## Actual old/new measurements

[Comparison JSON](../assets/characters/minimorph/animation/rework/comparison.json) compares the rejected `a83af6f` GLB and the revised exported GLB using the same evaluator at **60 Hz**, including half-frames between 30 fps keys: 378 poses per version. [Per-frame revised data](../assets/characters/minimorph/animation/rework/full-frame.json) includes worst-edge vertex IDs, original positions, actual influences and required stance contacts.

| Check | Result |
| --- | --- |
| Neutral raw geometry / embedded textures | PASS: exact raw positions and unchanged three image hashes |
| Skin-bind roundoff | PASS within 3e-6 units, accounting for float32 inverse-bind matrices |
| Paw/torso joint roles | PASS |
| Selected connected armor-core rigidity | PASS within 1e-5 units; this does not certify every rim or all armor intersections |
| Ground penetration | PASS within −0.002 game units |
| Required foot contacts throughout clips | PASS within 0.002 units, not a claim of zero sliding at every gameplay speed |
| Maximum local edge stretch ≤2x | **FAIL** — remaining cuff/knee/hip regions need manual work |
| Human visual approval / production readiness | **NOT granted** |

The maximum across clips drops from roughly 277.94x to 9.31x. Run floor minimum improves from −0.03858 to about −0.000843; Land from −0.060344 to about −0.001052. New stance contact failures are zero. These are substantial measured improvements, but 9.31x is still unacceptable by the unchanged 2x gate. Edge measurements exclude source edges shorter than 0.0001 units to avoid meaningless division by microscopic edges.

[New contact sheet](../assets/characters/minimorph/animation/contact-sheet.png) and [old sheet](../assets/characters/minimorph/animation/rework/baseline-contact-sheet.png) deliberately show the full character and remaining defects. There is no generated substitute character or face-only crop hiding bad joints.

## Editable project and exact minimal manual workflow

The actual [editable Blender project](../assets/characters/minimorph/animation/source/minimorph_rig_workbench.blend) contains the approved mesh, 20 bones, weights, six actions, packed maps, studio camera/lights, and selection groups. It opens in neutral pose with NLA tracks muted; bone display is in front. No source download or procedural reconstruction is needed to edit it.

1. Open it in **Blender 4.3.2** and Save As a separate working copy. Use material preview and NumPad 0 for the ready studio camera. Do not modify the approved static GLB.
2. Select `Minimorph_Meshy`, enter Edit Mode, deselect, then choose Object Data → Vertex Groups → `Manual_CuffContact_L` → Select. Frame selection with NumPad period. Repeat `_R`. These groups cover the measured true contact around `|x|=0.29…0.36`, `z=0.57…0.67`; the remaining worst Victory edge is around `x=0.315, z=0.61`.
3. Separate cuff ownership (`LowerArm.L/R`) from waist ownership (`Chest`) by inspecting the actual shared faces. First correct weights; if the real welded bridge prevents both panels staying rigid, repair **only that small contact**, close its hidden internal sides and preserve the exterior silhouette/UVs. Do not slice the whole mesh at an X plane, and do not disconnect the natural upper-arm/shoulder attachment.
4. Select `Manual_Knee_L/R` (`z=0.18…0.34`). Keep complete knee shields/rims on LowerLeg, thigh shells on UpperLeg and boot shells on Foot. Repaint only flexible underlay transitions. Current hard cores are rigid, but automatic core/rim boundaries still strain; local underlay retopology may be needed. `Manual_Hip_L/R` isolates the remaining pelvis/thigh transition (`z=0.44…0.56`).
5. Select the rig and use the Action Editor to choose the existing named action; leave the other NLA tracks muted. Scrub Run frames 0–18, Land/Jump 0–12, Fall 0–24, and Idle/Victory 0–60 at 30 fps. Victory frame 30 exposes the cuff contact; Run/Land expose knee transitions. Compare neutral shape against an imported copy of the approved static GLB before accepting any local topology edit.
6. Save the edited project and export **without rebuilding its weights**:

```sh
blender --background --factory-startup --python-exit-code 1 --python tools/blender/export_rig_workbench.py -- --project /tmp/artist-work.blend --output /tmp/minimorph-edited.glb
```

7. Re-run structural validation, full-frame skin evaluation and PlayCanvas review. If topology or vertex order changes, regenerate the semantic/exterior correspondence for the repaired patch; current fidelity checks deliberately reject unexplained changes. Do not bypass them or replace the static reference. Re-render all poses from the edited project before requesting human approval.

The workbench exporter was tested on the supplied project. It exports the stored artist weights/actions, not the procedural generator's defaults. **Do not run `rig_character.py` over a manually edited project**; that command is for reproducible baseline generation.

## Reproduce the selected automated intermediate

```sh
python -m pip install -r tools/blender/requirements-build.txt
python tools/blender/prepare_rig_weights.py --output /tmp/minimorph-semantic.npz
blender --background --factory-startup --python-exit-code 1 --python tools/blender/rig_character.py -- --weights /tmp/minimorph-semantic.npz --output /tmp/minimorph-rig --renders --save-source /tmp/minimorph-rig/workbench.blend
```

NumPy/SciPy/Pillow are build/test tools only, not production runtime dependencies. The animated GLB still has six named in-place clips: Idle 2s, Run 0.6s, Jump 0.4s, Fall 0.8s, Land 0.4s, Victory 2s. Idle/Run/Fall loop; the other three do not. Run's stance reference is 0.8 units/s; physical-device performance and arbitrary gameplay-speed foot sliding are not certified.

## Checks and preview

```sh
python -m pip install -r tools/blender/requirements-test.txt
npm run check
npm run test:browser
npm run check:rig-quality
npm run preview:character
```

`check:rig-quality` currently **exits nonzero** because the 2x strain gate is not passed. CI exposes this as a separate `rig-deformation-quality` job and uploads the per-frame report. Existing build/unit/browser checks remain separate; a green technical job cannot approve the rig. Mutation tests reproduce a bad paw→thigh weight, a sole→root weight and an armor→root weight and verify the relevant measurements detect them.

Open `/animation.html` for actual GLB clip selection, play/pause, speed, loop controls and neutral comparison; `/animation-poses.html` shows key poses. The shared `gltfCharacterSource` loads it, but production gameplay does not select it. `CharacterVisual.update(state, dt)` remains the later integration boundary: `won`, `recovery`, `grounded`, `vy`, `landingTime` and horizontal speed can select states after approval. No physics, camera, checkpoints, Telegram or read-only Minima behavior is changed.

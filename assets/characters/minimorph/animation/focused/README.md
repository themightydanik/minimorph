# Focused correction pass — REJECTED, manual intervention required

The preserved functional intermediate remains the animated GLB and editable
`../source/minimorph_rig_workbench.blend` from commit `902eb20`. The approved static
GLB, gameplay, animation amplitudes, armor constraints and 2× threshold are unchanged.
No topology was cut. This is a failed correction experiment, not visual approval.

## Measured candidate versus preserved intermediate

All six exported clips are evaluated at 60 Hz (378 samples), including between
30 Hz animation keys. `before-full-frame.json` records the preserved intermediate;
`rejected-export-full-frame.json` records the attempted weights. IDs below are zero-based
GPU/workbench vertex IDs; coordinates in the JSON diagnosis are explicitly labelled.

| Clip | Before / retained | Rejected candidate |
|---|---:|---:|
| Idle | 1.086× | 1.086× |
| Run | 9.312× | 19.019× |
| Jump | 5.830× | 5.176× |
| Fall | 6.549× | 5.355× |
| Land | 6.081× | 5.567× |
| Victory | 9.009× | 9.009× |

A single bounded, pose-aware weight solve modified 2,431 unique positions / 4,026 GPU
vertices selected in knee and hip underlays (3,911 GPU vertices actually changed). Rigid armor cores, head and soles were fixed.
The hip solves converged; both knee solves reached the iteration limit. Although
the fitting objective decreased, an abrupt semantic/spatial mask boundary introduced
a worse Run edge `66794–66796` at 0.266667 s. The candidate is rejected. Its weights
are reproducible with the script, not installed in the preview or gameplay.

Ground penetration, required sole contacts, rigid armor, neutral fidelity and joint
influence checks pass for both versions. **Edge stretch fails.** Passing these five
gates is not approval of skinning or visual quality.

## Exact remaining defects and minimal manual workflow

Open the preserved workbench. All NLA tracks are muted in the saved neutral state.
Activate the named action and inspect the stated time (scene FPS is 30). Select IDs in Object Mode before switching to Edit Mode (direct mesh selections
are not synchronized while Edit Mode owns the mesh); use the named `Manual_*`
groups for surrounding context. For example, run this in Blender’s Text Editor:

```python
import bpy
obj = bpy.data.objects["Minimorph_Meshy"]
if bpy.context.object and bpy.context.object.mode != "OBJECT":
    bpy.ops.object.mode_set(mode="OBJECT")
bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
ids = {54390, 54553}  # replace with the diagnosed edge IDs
for vertex in obj.data.vertices:
    vertex.select = vertex.index in ids
bpy.ops.object.mode_set(mode="EDIT")
```
 Inspect in solid wireframe
and textured material mode. Do not merge coincident vertices automatically: UV seams
can share positions without being a single surface.

1. **Manual_CuffContact_L/R:** Victory at 1 s, `44257–45127` (9.009×).
   `exact-edge-diagnosis.json` lists actual indexed triangles and influences: one
   endpoint is rigid LowerArm.L, the other includes Chest. Incident triangle 46947
   extends from Blender z≈0.611 down to z≈0.478. This is a real triangle connection,
   not merely two touching render surfaces. The bounded dual-graph cut reaches open
   ends: L `50659,43620`, R `98485,97232`. See `contact-cut-diagnostic.json` for all
   candidate edges, degrees and coordinates. **Do not cut those open paths.** Manually
   trace the full accidental cuff/waist connection with linked-face selection; exclude
   the normal upper-arm/shoulder attachment. Separate only the confirmed accidental
   bridge, finish each hidden boundary under the cuff/armor, and interpolate existing
   UVs onto any replacement faces. Keep arm-side armor rigid to LowerArm and torso-side
   panels rigid to Chest/Pelvis; feather only flexible sleeve/waist underlay. A closed,
   visually inspected boundary is required before cutting. The automation did not
   establish such a boundary and cannot safely supply a blind cut recipe.
2. **Manual_Knee_L/R:** Run at 0.4 s (`54390–54553`, 9.312×), Jump at 0.4 s
   (5.830×), Fall at 0 s (6.549×). This is lower shin/boot underlay around Blender
   z≈0.185, not an upper hip. Endpoint LowerLeg/Foot weights differ by about 0.145
   over a 0.00177-unit edge. Paint a continuous geodesic LowerLeg→Foot transition
   across the flexible underlay, including neighbours outside the group. Keep the
   boot sole and metal panel cores rigid. Mirror only after checking both surfaces.
   If the existing underlay has too few rings, add local joint loops with UV
   interpolation; do not subdivide or smooth the visible armor globally.
3. **Manual_Knee_L/R, upper boundary:** Land at 0.166667 s, `54358–54781`
   (6.081×). One endpoint has ≈23.2% LowerLeg, the other is rigid UpperLeg. Inspect
   the actual panel/underlay boundary before changing weights: retain the rigid panel,
   feather the adjacent flexible patch, add local supporting topology only if needed.
4. **Manual_Hip_L/R:** inspect Run throughout the stride, especially the rejected
   candidate boundary `66794–66796`. The baseline has a Chest/Pelvis/both-thigh blend
   at this cross-body transition. A one-sided box mask removed the opposite thigh
   influence from one endpoint and created a discontinuity. Do not apply that mask.
   Use a connected underlay selection crossing the centerline and a smooth, normalized
   pelvis/thigh transition; protect rigid panels and keep hands out of the selection.

The exact required face ownership / closed cuff contour and sufficient flexible joint
loops require manual painting or local retopology. These are not claimed fixed.
After edits, neutral mesh appearance and UV/PBR must be reviewed against the approved
static source; the current validator deliberately requires unchanged topology, so a
reviewed local repair also needs a localized provenance/mapping validation rather
than deleting the neutral-fidelity requirement.

## Reproduction

Install `tools/blender/requirements-build.txt`, then from repository root:

```sh
python tools/blender/focused_skin_pass.py --asset assets/characters/minimorph/animation/minimorph_animated_v1.glb --semantic assets/characters/minimorph/animation/rework/semantic-weights.npz --output /tmp/focused-weights.npz
blender -b -t 4 --python tools/blender/apply_focused_weights.py -- --project assets/characters/minimorph/animation/source/minimorph_rig_workbench.blend --weights /tmp/focused-weights.npz --baseline assets/characters/minimorph/animation/rework/semantic-weights.npz --output /tmp/rejected-candidate.blend
blender -b -t 4 --python tools/blender/export_rig_workbench.py -- --project /tmp/rejected-candidate.blend --output /tmp/rejected-candidate.glb
python tools/blender/evaluate_skin.py --input /tmp/rejected-candidate.glb --semantic /tmp/focused-weights.npz --report /tmp/rejected-full-frame.json --require-pass
python tools/blender/diagnose_contact_cut.py --semantic assets/characters/minimorph/animation/rework/semantic-weights.npz --output /tmp/contact-cut.json
blender -b -t 4 --python tools/blender/render_workbench.py -- --project /tmp/rejected-candidate.blend --output /tmp/rejected-renders
```

The strict evaluator must fail for both preserved intermediate and rejected candidate.
Do not overwrite the retained GLB with the candidate. Draft PR #4 remains blocked on
manual deformation fixes and human visual approval.

## Integrity and render provenance

`integrity.json` compares the actual Blender-exported candidate against the retained
GLB: positions, normals, triangle indices, UVs, material JSON, embedded image hashes
and all animation sampler/channel data are identical. Exporter tangent rounding
changed by at most 0.000100017; no candidate is promoted. The approved static SHA-256
remains `52dff3dd1f96d7c7958f48a0a06013e2a0b1bb8f515183dabeed499fd584c851`.

The fresh before/after contact sheet uses identical workbench camera, lighting and
32-sample Cycles settings at actual seconds: Idle 0, Run 0.4 and 0.266667, Jump 0.4,
Fall 0, Land 0.166667, Victory 1. These emphasize measured defects. Left is the
retained intermediate; right is the REJECTED candidate. Images are real renders,
not approval or evidence that every subpixel strained edge is visually resolved.

## Visual review — FAIL

The new contact sheet shows pronounced folding/black inward-facing regions in the
knee/shin underlays during Run, Jump, Fall and Land in both columns. The cuff/body
connection remains strained in Victory. The candidate is not a substantial visual
fix and is not approved. A lower aggregate fitting error does not justify replacing
the current functional intermediate. Manual joint topology/weights work is necessary.

## Verification

- Structural candidate inspection: pass, 160,000 triangles, 145,409 exported vertices,
  20 bones, six clips, three embedded maps, static texture hash match.
- Python structural/deformation regressions: 22 passed.
- TypeScript, ESLint: pass. Unit tests: 27 passed.
- Desktop/mobile browser tests (including six PlayCanvas clips): 20 passed.
- Telegram build, Minima build, MDS packaging: pass (existing bundle-size warning).
- Strict 60 Hz deformation gate: **FAIL, edge stretch**, for both retained and rejected
  candidate. Five other measured gates pass. CI success is not claimed.
- Approved static GLB, retained animated GLB, editable workbench, gameplay and
  integrations are unchanged. No merge; PR remains Draft.

## Both-sided regional diagnostics

`retained-region-worst-edges.json` measures every original `Manual_*` region in every clip at 60 Hz (all indexed edges touching the region). These maxima refer to the retained GLB, not the rejected candidate.

| Region | Clip / seconds | Edge vertex IDs | Stretch |
|---|---|---|---:|
| Manual_CuffContact_L | Victory / 1.000000 | 44257–45127 | 9.009× |
| Manual_Knee_L | Run / 0.400000 | 54390–54553 | 9.312× |
| Manual_Hip_L | Run / 0.533333 | 49585–49598 | 2.039× |
| Manual_CuffContact_R | Victory / 1.000000 | 102668–103642 | 6.352× |
| Manual_Knee_R | Run / 0.133333 | 94407–94804 | 7.883× |
| Manual_Hip_R | Run / 0.233333 | 97423–97513 | 2.173× |

Regional diagnostic reproduction:

```sh
python tools/blender/diagnose_rig_regions.py --input assets/characters/minimorph/animation/minimorph_animated_v1.glb --full-frame assets/characters/minimorph/animation/rework/full-frame.json --output /tmp/region-worst-edges.json
```

[Before/after full pose sheet](before-after-contact-sheet.jpg). Individual full-size
renders are under `before/` and `after/`; `after` means the rejected experiment,
not a newly approved or installed character.

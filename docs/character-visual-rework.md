# PR #3 visual rework — rejected baseline, not a new model

The current character was explicitly rejected on visual fidelity. Successful
GLB audits, reproducibility checks and browser loading do not establish likeness
or visual approval. The existing model/renders are a negative baseline only.
This note records the diagnosis; it does not claim that the modeling rework is
complete or that a revised character has been approved.

## Reference inputs

The approved design sheet is visible in the earlier task conversation. The new
rework request names an original approved illustration, the design sheet and a
negative comparison image, but no new image attachments are available in this
submission or as files under `/workspace/attachments` at this inspection.
The original illustration and actual reference image files are needed before
reference-aligned remodeling and a genuine side-by-side comparison can proceed.
Do not substitute generated concept art or another generic cat astronaut.

## Diagnosis of the existing generator

| Area | Existing implementation | Required replacement / visual criterion |
| --- | --- | --- |
| Face | A remeshed sphere/cheek union is reduced to 18% before another runtime reduction. Eye surrounds, dark lids, irises and pupils are separate outward ellipsoids. There are no sculpted eye sockets. | Rebuild continuous feline facial volumes and recessed sockets with integrated eyelid contours. Judge front and three-quarter likeness before optimization. |
| Eyes | Layered oval surfaces and geometric catchlights look attached to the face rather than seated in it. | Match reference spacing, gaze, iris/pupil proportions and lid shape; use believable gloss/corneal response without floating rims. |
| Fur | Analytic vertex colors provide a few coarse stripes and a cream region; no fur-detail maps are embedded. | Reference-aligned tabby/muzzle painting and subtle directional fur detail, baked into portable textures or efficient supported geometry. |
| Ears | Subdivided triangular fans have little inner-ear anatomy. | Rounded pinna, rim thickness, recessed inner structure and fur transitions matching the reference. |
| Helmet | A single ellipsoidal/spherical cap plus oval tubes and surface seam curves. | Reference-shaped oval opening and segmented shell volumes with fitted thickness, integrated ear exits and side modules. Avoid oversized spherical silhouette. |
| Armor | Repeated beveled panels, ellipsoids and cuffs suggest simplified toy parts. | Fit layered shell plates to the body, distinguish joint recesses from armor thickness and reproduce reference panel contours front/side/back. |
| Materials | Constant PBR values and low-frequency vertex colors lack brushed-metal and fur surface information. | Separate subtle surface treatment for silver, graphite, cyan emission, fur and glossy blue eyes. Verify packed glTF textures/material response in PlayCanvas. |
| Optimization | Fixed 20k-triangle/eight-material/eight-primitive limits and blanket reduction precede visual acceptance. | Keep a higher-quality editable source. Select and document runtime budgets after visual review and measured export tests; never equate more polygons with fidelity or silently disable validation. |

## Review sequence

1. Obtain the approved illustration and design-sheet image files. Preserve the
   rejected baseline by its existing Git commit rather than relabeling it as a
   revised result.
2. First review the head/face and helmet at front and three-quarter angles in
   consistent lighting. Confirm silhouette, facial proportions, sockets, ears,
   muzzle and markings against the actual references.
3. Rework armor fit, back construction and materials; produce front,
   three-quarter, side and back renders of the revised asset.
4. Produce an actual side-by-side contact sheet with the supplied approved
   images and clearly labeled rejected/revised renders. Record remaining
   mismatches rather than claiming approval automatically.
5. Preserve the high-quality source and make a separately optimized GLB.
   Measure geometry/material/texture statistics from that export and preserve
   origin, height, negative-Z facing, loading, ownership and fallback behavior.
6. Re-run the existing asset audits, PlayCanvas browser tests, Telegram/Minima
   builds and MDS packaging. Present revised renders for human visual review.

## Integrity boundaries

Keep the existing GLB validation/reproducibility/browser work. Do not modify
physics, checkpoints, game camera, host integration or the procedural fallback.
No rig, animation, skinning, NFT, token or marketplace work belongs in this task.
If the available generation/sculpting/texturing approach does not demonstrate a
substantial visual improvement, report that limitation and leave the model
explicitly unapproved rather than presenting another simplified toy as final.

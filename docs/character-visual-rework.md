# PR #3 visual rework — unapproved work in progress

All three supplied images have been visually reviewed in the conversation: the original illustration, approved design sheet and rejected Blender output. The original and sheet remain the visual authority. The supplied `blob:https://chatgpt.com/…` URLs refer to browser-local data and cannot be downloaded by this environment. No reference pixels have been recreated or substituted.

**The required facial likeness has not been achieved. This candidate is not a finished or approved Minimorph model.** Repeated procedural surface adjustments improved construction and material detail, but the result still has a generic toy appearance. A character artist needs to sculpt the facial planes and eyelids and author the fur painting against the original references. Passing technical tests does not change this assessment.

## What changed

- Continuous remeshed facial surface with socket depressions, cheek/muzzle volumes, shaped nose and curved mouth; single textured glossy eye surfaces instead of stacked iris/pupil primitives.
- Curved ear surfaces with recessed inner structure and integrated shell exits.
- Shallow segmented helmet loft, separate shell thickness, oval cyan bezel, side modules and rear access plate.
- Fitted layered chest, shoulder, forearm, thigh, knee and shin plates, rear armor and connected remeshed paws.
- Six packed PBR maps: fur color, normal and roughness, iris color, silver normal and roughness. These are procedural textures, not reference-authored fur painting.
- Separate editable source and reduced runtime GLB. No rig or animations.

## Remaining visual mismatches

| Area | Unresolved issue |
| --- | --- |
| Face | Eyes remain too prominent and generic; eyelid anatomy and the reference's soft kitten expression are missing. Cheeks, brow, muzzle transition and nose proportions still need sculpting. |
| Fur | Directional maps and tabby masks lack the original's authored strand flow, nuanced markings and soft transitions. |
| Ears | Simplified pinna, rim and silhouette do not reproduce the reference's natural anatomy. |
| Helmet | Opening depth and rim/shell proportions need adjustment against actual reference pixels; shell still frames the head differently. |
| Armor | Panel topology is improved but chest and leg contours, paw anatomy and overall silhouette still diverge. |
| Rendering | Studio lighting, reflections and noisy CPU renders differ from the illustration. Material detail alone does not establish likeness. |

## Review assets

The [asset README](../assets/characters/minimorph/README.md) displays four renders of the **actual optimized GLB**, with separate source-model renders. `review/rejected-*.png` preserves actual renders from rejected commit `e4d02398578a9d79fc4c3e80ad45818d91607543`; these are repository artifacts, not the user's uploaded negative-example pixels.

Run `npm run preview:character`, then open `/comparison.html`. The page compares the candidate and rejected baseline and allows selecting an actual local approved image for the reference column. No file leaves the browser. A reference-versus-candidate contact sheet with original pixels is **pending accessible PNG/JPG files or HTTPS URLs**; the empty reference column is explicitly labeled. Do not describe it as a completed reference comparison.

## Technical scope

Measured runtime statistics and review limits are in `validation.json` and `budgets.json`. The raised limits are temporary review ceilings, not evidence of mobile readiness. The larger source and export need optimization after art review. The gameplay fallback, controller, camera, checkpoints, Telegram and read-only Minima adapter remain unchanged.

Human review is requested to diagnose the candidate, **not to declare the task complete**. Further procedural parameter tuning has reached a practical quality limit here; manual sculpting and texture authoring are the next step.

## Validation results

- `npm run check`: seven GLB audit tests, TypeScript, ESLint, 27 unit tests, Telegram/Minima production builds and read-only MDS packaging pass. TypeScript and ESLint were repeated after adding texture inspection.
- Independent Blender 4.3.2 import audit passes.
- Desktop/mobile PlayCanvas asset tests pass with explicit fur color/normal/roughness-map binding assertions.
- Two regeneration runs match geometry counts, bounds and texture hashes, but canonical geometry hashes differ. Exact geometric repeatability remains unresolved; no byte-identity claim is made.
- Physical-device performance and artistic approval are not established.

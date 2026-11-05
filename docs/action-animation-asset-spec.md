# External Minimorph action animation specification

PR #10's procedural bridge is not a completed high-quality Dive/Slide/Get-up animation set. Commission/author the following clips against the **existing approved rig and skin**. No replacement model, rebind, weight edits, new bones, texture/material edits or changed proportions are authorized by this specification.

## Source and delivery contract

- Source character: `assets/characters/minimorph/optimization/minimorph_candidate_v1.glb`, SHA-256 `cd566c9024676775e3efe8d751de3605a035eca3ca4bc3c00082d7b5d283d6b6`. Preserve all bind transforms/inverse bind matrices.
- glTF 2.0 / GLB, Y up, meters, approximately 1.8 m character, feet at origin, forward −Z. In-place animations: no gameplay/root-motion translation, heading changes or scaling.
- Deliver animation-only `minimorph_actions_v1.glb` with identical skeleton names/hierarchy, plus a neutral reference pose and preview videos from front/side/back/gameplay distance. Do not duplicate or replace the production mesh/materials in the game.
- Existing twenty deform nodes: `Root`, `Pelvis`, `Spine`, `Chest`, `Neck`, `Head`, `Shoulder.L`, `UpperArm.L`, `LowerArm.L`, `Hand.L`, `Shoulder.R`, `UpperArm.R`, `LowerArm.R`, `Hand.R`, `UpperLeg.L`, `LowerLeg.L`, `Foot.L`, `UpperLeg.R`, `LowerLeg.R`, `Foot.R`. Preserve parent hierarchy/container nodes from the source rather than reconstructing it from this list.
- Quaternion local rotations, 30 fps or higher clean sampling, continuous shortest-arc interpolation, no NaN/zero quaternions, scale keys or animation of mesh/material properties. Keep the six existing production clips intact.

## Required clips

| Exact clip name | Timing / looping | Motion and contact |
| --- | --- | --- |
| `Dive` | 0.18–0.28 s entry, non-loop; hold final prone-ready pose while airborne | Clear forward reach, controlled chest/hip extension, trailing legs, helmet looking toward the route. No second-jump/upward propulsion or root translation. Blend from both rising Jump and falling Fall. |
| `Slide` | Seamless 0.32–0.42 s loop; game action currently lasts 0.42 s | Convincing belly/forearm contact on y=0, hands/helmet clear of the deck, feet trailing with small controlled motion, recognizable silhouette. Start from Dive final pose; no frozen whole-body plank as final art. |
| `Recovery` | 0.22 s non-loop, matching authoritative recovery duration | Forearm push → knees/feet under pelvis → standing ready. First pose compatible with Slide; last pose compatible with Idle/Run. Avoid large contact pops or foot skating. If quality requires a longer duration, return that proposal separately; do not change gameplay timing in an art asset. |

## Review and acceptance

Preview at representative 1× playback and slow motion on the exact production mesh. Check skin strain at shoulders, elbows, hips and knees, helmet/neck intersections, palm/sole/deck contacts, silhouette, pose continuity and cancellation into obstacle knockback or checkpoint respawn. Allow about 0.08–0.12 s crossfade from existing clips. Demonstrate interruption and remote-state corrections without snapping; art must not require collision-body changes.

Provide standalone pose/frame renders and all nine runtime states at normal gameplay camera distance. Validate that the original mesh, skin, bind data, six clips, materials and textures remain unchanged. If the existing rig/weights cannot achieve acceptable poses, deliver a precise diagnostic with affected bones/vertices and proposed changes **for separate owner approval**; do not silently alter the approved asset or mark the action work complete. Ownership/license provenance must accompany externally supplied animations.

Import plan: load the new animation-only container once, bind its named tracks to each existing character instance, select the authored tracks from the same authoritative action state, and retire the procedural bridge only after owner visual approval. Physics, protocol v2 and action cooldowns remain unchanged.

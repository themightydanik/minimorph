# Minimorph v1 — static character asset

Based on the approved “Minimorph Character Design Sheet v1.0” supplied in the task
conversation. The sheet is the visual authority, not a source mesh or a measured
specification for this export. No rig, skeletal animation or facial-expression
system is implemented.

- [Exported GLB](minimorph_v1.glb) — self-contained, Y-up, facing negative Z, feet at zero, height 1.8.
- [Editable Blender source](minimorph_v1.blend) — named construction parts, materials and studio setup.
- [Measured validation report](validation.json) — actual triangle/vertex/material counts and bounds.
- [Independent Blender import audit](validation-blender.json).
- [Two-run geometry repeatability](reproducibility.json).
- [Pipeline and reference comparison](../../../docs/character-model-v1.md).

| Front                       | Three-quarter                               | Side                      | Back                      |
| --------------------------- | ------------------------------------------- | ------------------------- | ------------------------- |
| ![Front](renders/front.png) | ![Three-quarter](renders/three-quarter.png) | ![Side](renders/side.png) | ![Back](renders/back.png) |

The renders show the actual optimized GLB re-imported into Blender, not a denser
source model. The game keeps its current procedural fallback; this PR provides
the model and a real PlayCanvas inspection/loading test without changing gameplay.

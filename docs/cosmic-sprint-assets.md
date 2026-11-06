# Cosmic Sprint — owner asset audit

Source: [cosmic-assets-v1](https://github.com/themightydanik/minimorph/releases/tag/cosmic-assets-v1), all 23 GLB files. Actual source/runtime hashes, vertex/triangle counts, image hashes and sizes, pivots, original nodes, components, prepared parts and measured bounds are versioned in [inventory.json](../assets/arenas/cosmic-sprint/inventory.json). No live release downloads occur in gameplay.

Source total: **15,282,430 triangles**, 7,991,405 vertices, 149.63 MiB. Prepared total: **459,994 triangles**, 224.14 MiB across all 23 versioned GLBs (the game packages only referenced models).

## Complete measured inventory

Each original has one node, one mesh, one primitive, one material, identity transforms and a centered (0,0,0) pivot. “Components” counts welded connected triangle islands, not independently addressable glTF nodes. “Parts” is the independently addressable prepared hierarchy.

| Original GLB | Vertices | Source → runtime triangles | Dimensions X × Y × Z (source units) | Components → parts | Runtime MiB |
| --- | ---: | ---: | --- | ---: | ---: |
| Checkpoint.Gate.Marker.glb | 335,041 | 647,624 → 20,000 | 0.6650 × 0.6211 × 1.0000 | 1 → 1 | 10.48 |
| Circular.Arena.Floor.glb | 353,218 | 669,933 → 20,000 | 0.9992 × 0.2103 × 1.0000 | 1 → 1 | 8.38 |
| Cosmic.Start.Gate.glb | 350,642 | 680,326 → 20,000 | 0.2605 × 0.4710 × 1.0000 | 1 → 1 | 9.24 |
| Curved.Floor.Corner.glb | 353,591 | 674,452 → 20,000 | 0.6522 × 0.2139 × 1.0000 | 1 → 1 | 9.20 |
| Curved.Platform.Ramp.Kit.glb | 353,195 | 675,277 → 20,000 | 0.9607 × 0.2581 × 1.0000 | 5 → 5 | 11.64 |
| Decorative.Floor.Surface.Variants.glb | 341,914 | 648,192 → 20,000 | 0.9630 × 0.2629 × 1.0000 | 4 → 4 | 9.70 |
| Floor.Markings.Directional.Indicators.glb | 354,555 | 687,648 → 20,000 | 0.8723 × 0.0662 × 1.0000 | 6 → 6 | 8.57 |
| Giant.Padded.Hammer.glb | 341,981 | 663,264 → 19,994 | 0.3643 × 0.5300 × 1.0000 | 1 → 2 | 10.36 |
| Inflatable.Bounce.Pad.glb | 351,637 | 663,811 → 20,000 | 0.9999 × 0.3642 × 1.0000 | 1 → 1 | 10.76 |
| Landing.Transition.Platform.glb | 354,821 | 670,014 → 20,000 | 0.9145 × 0.2248 × 1.0000 | 1 → 1 | 10.10 |
| Large.Floor.Panel.glb | 347,184 | 662,922 → 20,000 | 0.4360 × 0.1438 × 1.0000 | 1 → 1 | 8.47 |
| Main.Floor.Tile.glb | 349,167 | 659,711 → 20,000 | 1.0000 × 0.2489 × 0.9996 | 1 → 1 | 8.55 |
| Narrow.Wide.Bridge.Kit.glb | 352,925 | 676,699 → 20,000 | 1.0000 × 0.1387 × 0.7643 | 3 → 3 | 10.50 |
| Platform.Edge.Trim.Kit.glb | 354,626 | 682,736 → 20,000 | 1.0000 × 0.2059 × 0.9579 | 5 → 5 | 9.61 |
| Platform.Underside.Support.Kit.glb | 362,205 | 685,034 → 20,000 | 0.6990 × 0.6276 × 1.0000 | 4 → 4 | 11.75 |
| Rotating.Carousel.glb | 354,600 | 677,462 → 20,000 | 0.9960 × 0.4978 × 1.0000 | 1 → 2 | 9.18 |
| Safety.Barrier.Kit.glb | 358,648 | 691,012 → 20,000 | 0.8067 × 0.1776 × 1.0000 | 4 → 4 | 9.37 |
| Sliding.Bumper.glb | 353,944 | 680,882 → 20,000 | 0.3313 × 0.3680 × 1.0000 | 1 → 1 | 10.51 |
| Slope.Ramp.Surface.glb | 332,995 | 636,860 → 20,000 | 0.4244 × 0.2594 × 1.0000 | 1 → 1 | 8.32 |
| Space.Decoration.Kit.glb | 333,943 | 641,882 → 20,000 | 0.3393 × 0.6216 × 1.0000 | 7 → 7 | 9.37 |
| Star.Finish.Gate.glb | 340,853 | 655,582 → 20,000 | 0.3456 × 0.4874 × 1.0000 | 1 → 1 | 9.28 |
| Turbo.Conveyor.glb | 344,877 | 653,587 → 20,000 | 0.4476 × 0.2017 × 1.0000 | 1 → 1 | 11.77 |
| Wide.Floating.Island.glb | 314,843 | 597,520 → 20,000 | 0.6767 × 0.2877 × 1.0000 | 1 → 1 | 9.02 |

## Format, textures and mobile preparation

- All 23 original GLBs are valid glTF 2.0 with embedded images and required `EXT_meshopt_compression` / `KHR_mesh_quantization`. The pipeline decodes every accessor and validates finite positions, index ranges and buffer bounds; runtime geometry uses ordinary float attributes and local embedded KTX2 images.
- Every original has three **2048 × 2048** maps: base color, ORM and OpenGL normal. Materials, UVs and decoded normals are preserved. No recoloring, image resizing, material substitution or device-dependent quality tier is applied.
- UASTC LDR 4×4, level 2, **no RDO**, full 12-level mip chains; base color is sRGB and data maps linear. Full-resolution encoder RGB PSNR ranges **45.16–65.66 dB**. These are encoder comparisons with source pixels, not a claim about every hardware transcode target. BasisU v2_50 and the matching vendored transcoder are pinned; Apache-2.0 and Zstandard notices ship in both app packages.
- Meshoptimizer 0.25 uses attribute-aware, bounded-error simplification. Positions/UVs/normals of retained vertices are kept; normal-map detail stays intact. The configured relative error limit is 0.25%; actual per-model error is stored in the inventory. This is the simplifier’s error estimate, not a claim of exact surface identity.
- Source exports are centered, right-handed, Y-up and roughly one source unit across their longest horizontal axis; they are not metre-sized level modules. Floors fit their authored gameplay footprints, with a fixed vertical scale cap of 8 (2 for carousel relief) to keep padded surface relief and collision-plane differences small. Gates and prominent props retain uniform scale; gates span local Z and turn 90° for the start/finish approach. Rendering and simple invisible colliders share the authored placement/rotation.
- One asset container, material and map set serves all instances of that model. Hardware instancing batches repeated floors, gates and hammer parts. Visibility-aware resource streaming with distance hysteresis and ordinary frustum culling bounds the working set; it changes resource lifetime, not model fidelity, DPR or lighting quality.

## Kits, moving parts and limitations

The eight multi-object kits are initially packed into a single primitive. They contain 3–7 disconnected objects; the preparation tool partitions those components without removing triangles or rebaking UVs. All prepared parts share the original material/maps. Their actual part names, bounds and floor ray-sampled walk heights are recorded. They remain available even when a particular shape is not placed in this course; no owner model is silently discarded.

Hammer and Carousel are single connected assemblies, not ready-made animation rigs. The tool partitions existing faces at the concealed shaft/hub seams (hammer Y=-0.095, carousel Y=0.045), preserving every prepared triangle. The pedestal stays fixed while the upper geometry rotates around the authored central axis. At the rest transform the combined geometry is unchanged. Small seam behavior is reviewable in the actual game.

Sliding Bumper is also fused. The conservative workaround translates the complete authored padded assembly along the authoritative piston stroke; it does not pretend the housing/head are independently modeled. A future artist-authored separated housing/head could improve this presentation. Conveyor tread art remains intact rather than scrolling its whole baked atlas; the authored belt direction and real surface velocity provide the mechanic. Raised Star Finish uses broad landing decks and a real jump/drop instead of presenting an unimplemented walkable ramp.

## Reproduction and runtime budgets

Run `npm run download:cosmic-assets` (GitHub CLI), then `COSMIC_BASISU=/path/to/pinned/basisu npm run prepare:cosmic-assets`. The encoder source is BinomialLLC/basis_universal v2_50 at 9bebe16726b3a61c8c213eeee3b7cffb462ef34e; build Release with SSE enabled. Source GLBs remain unmodified in the ignored source directory, and their release hashes are checked. Runtime GLBs and both manifests are committed.

`npm run check:cosmic-assets` verifies all 23 runtime hashes, GLB buffers/indices, part hierarchy/triangle conservation, local embedded textures, unchanged 2048px dimensions, full mips and color-space flags. Actual browser resource/frame measurements and the course comparison are recorded with the [in-engine evidence](evidence/cosmic-sprint/README.md). Physical Xiaomi Redmi Note 8 testing is unavailable in this environment; no device FPS claim is made.

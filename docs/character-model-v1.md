# Minimorph v1 character pipeline

## Source of visual authority

The approved “Minimorph Character Design Sheet v1.0” supplied in this task defines
the orange kitten, huge blue eyes, silver astronaut suit, cyan oval visor rim,
triangular exposed ears and compact chibi proportions. Its turnaround was used
for the front, side and back construction. The original sheet remains in the task
conversation; it is not bundled as a texture or claimed as mesh source data.
Concept-sheet topology counts, example animations and illustrated texture maps
are not measurements or implemented features of this export.

## Files and regeneration

Use Blender **4.3.2** (the tested version). From the repository root:

```sh
blender --background --factory-startup --python-exit-code 1 \
  --python tools/blender/build_character.py -- --renders
```

The command creates `assets/characters/minimorph/minimorph_v1.glb`, an editable
`minimorph_v1.blend`, `validation.json` and four PNG renders. Omit `--renders` to
skip the CPU studio render pass; use `--output /absolute/directory` for a separate
regeneration. No manual UI steps, external meshes, downloaded textures or Blender
add-ons are needed. Rendering uses Cycles CPU at 128 samples and does not require
OpenImageDenoise, CUDA or a desktop display. Nonfatal exporter messages about an
unavailable Draco library do not apply: this asset is exported without Draco.

The script makes a continuous remeshed/softened face and muzzle, vertex-paints the
fur, builds an actual open helmet shell and rounded armor plates, then repairs
coincident endpoints and degenerate geometry. The source scene retains named
editable parts. Export copies are joined by material and mildly simplified for
the runtime budget; the source parts are preserved. The GLB is re-imported for
the reference renders, so they show the optimized geometry and exported colors.

Blender authoring coordinates are Z-up/front +Y. The standard glTF conversion
produces Y-up/front -Z. All mesh transforms are baked, the single root is identity,
the lowest foot vertex is at zero and the highest ear vertex is at 1.8 units.
The exported hierarchy has one `Minimorph_v1` root and eight material meshes.

## Materials and budgets

Eight glTF metallic/roughness PBR materials cover silver armor, dark joints,
cyan emission, orange/cream vertex-painted fur, blue irises, dark pupils/gaskets,
eye highlights/whiskers and the nose/mouth. Fur color is embedded as `COLOR_0`,
not an unsupported Blender procedural shader. There are no images or external
resource paths, so no texture downloads are required. A glass visor is not added;
the approved oval face opening stays visibly open. The low-cost opaque eye layers
avoid transparency sorting on mobile.

The pipeline enforces **20,000 triangles**, **8 materials**, **8 render primitives**
and **8 MiB** as upper budgets. Exact measured counts, bounds and file size are in
[validation.json](../assets/characters/minimorph/validation.json). Exported vertex
counts include glTF splits for normals, UVs and colors; they should not be compared
to the concept sheet's illustrative authoring-vertex number.

## Validation and PlayCanvas inspection

```sh
npm run test:character
blender --background --factory-startup --python-exit-code 1 \
  --python tools/blender/validate_character.py -- \
  --input assets/characters/minimorph/minimorph_v1.glb \
  --report /tmp/minimorph-blender-validation.json
npm run preview:character
```

The dependency-free Python audit reads the real JSON/BIN chunks and vertex/index
buffers. It checks access bounds, finite positions, unit normals, nondegenerate
triangles, embedded resources, root transforms, scene hierarchy, origin/height,
fur colors and budgets. Regression tests mutate the real GLB to demonstrate
rejection of truncation, external geometry, wrong root transforms, missing colors
and degenerate triangles. They also require the committed report to match the
asset. The Blender check independently imports the file and measures evaluated
world-space geometry. Negative-Z facing is confirmed from the front/side views;
it is not inferred from a bounding box.

The inspection page uses the existing `gltfCharacterSource` directly. The browser
test checks real PlayCanvas load/instantiation, actual mesh/material counts, world
height, visible WebGL pixels and all four view buttons on desktop and mobile
emulation. `npm run test:browser` runs that test alongside the existing game tests.
`npm run check` includes the Python audit, existing type/lint/unit checks, both
frontend builds and MDS packaging. No production physics, checkpoint, camera,
Telegram or Minima code is changed.

To use the asset in a later gameplay integration, serve the GLB with the target
application and pass `character: gltfCharacterSource(url)` in `createGame` options.
The existing presenter retains the procedural cat while loading and on failure,
and disposes replaced/late visual resources. This PR does not switch the default
game character or pretend the static mesh has the procedural fallback's animation.

## Comparison with the approved sheet

| Area       | Preserved from reference                                                                                                                     | Differences / limitations                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Silhouette | Large head, exposed triangular ears, small armored torso and short legs                                                                      | Exact contour and panel dimensions are a first model interpretation rather than a pixel-identical reconstruction.                               |
| Face       | Orange/cream kitten fur, very large blue eyes, small triangular nose, joined cheeks/muzzle and fine whiskers                                 | Neutral expression only; fur/markings are vertex-painted without individual hair or 2K texture maps. Eye surfaces are simplified opaque layers. |
| Helmet     | Silver shell with oval opening, cyan seal, side comms discs and rear panel seams                                                             | Fewer tiny recesses and rim details; no refractive glass or optical coating.                                                                    |
| Suit       | Silver chest with cyan M core/circuits, shoulder plates, tapered forearm guards, articulated-looking knee/shin segments and exposed toe paws | Static fitted components; no actual joint rig, deforming fabric, cloth simulation or mechanical articulation.                                   |
| Back       | Closed segmented helmet and integrated life-support/status unit                                                                              | Fine vents/fasteners and fabric texture are simplified.                                                                                         |
| Motion     | Pose suitable for a future character source                                                                                                  | No skeleton, skin weights, animation clips, blend shapes or expression variants. These must be authored and tested separately.                  |

The coin, platform, expression examples and animation/rig diagrams on the sheet
are not included as character geometry or implemented systems. The four exported
views are linked in the [asset README](../assets/characters/minimorph/README.md).
Studio lighting and PlayCanvas scene lighting differ: the same PBR surface can
look brighter/chromier under the studio's area lights. Physical-device performance
and a production character rig remain unverified; browser tests use emulation.

## Repeatability

Rebuild with the pinned Blender version and compare the validation reports. Raw
GLB hashes can differ because Blender may reorder equivalent vertex/index records.
`geometry_sha256_1e6` canonicalizes oriented triangles to 1e-6 units for a geometry
comparison independent of record ordering; `glb_sha256` identifies the exact file.
The `.blend` binary also contains scene/serialization metadata and is not claimed
to be byte-for-byte reproducible across Blender versions or machines.

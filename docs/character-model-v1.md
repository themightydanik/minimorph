# Official Meshy character: optimization pipeline

The only authoritative 3D source is the user's [assets-v1 Release](https://github.com/themightydanik/minimorph/releases/tag/assets-v1). The illustration/design sheet remain the artistic reference. This pipeline edits the actual Meshy mesh; it does not construct a replacement from primitives. The prior procedural asset, Blender source, generator and obsolete textures/renders have been removed from the branch tip. They remain in Git history.

## Retrieve and reproduce

Blender 4.3.2 (bundled NumPy), Python 3, authenticated `gh` and Node 22 are used. No extra Blender add-ons or runtime model dependencies are required.

```sh
python tools/blender/download_meshy.py --output /tmp/minimorph-master
blender --background --factory-startup --python-exit-code 1 --python tools/blender/optimize_meshy.py -- --source /tmp/minimorph-master --output /tmp/minimorph-40k --triangles 40000 --bake-normals --source-renders --renders --samples 48
blender --background --factory-startup --python-exit-code 1 --python tools/blender/optimize_meshy.py -- --source /tmp/minimorph-master --output /tmp/minimorph-80k --triangles 80000 --bake-normals --renders --samples 48
blender --background --factory-startup --python-exit-code 1 --python tools/blender/optimize_meshy.py -- --source /tmp/minimorph-master --output /tmp/minimorph-160k --triangles 160000 --preserve-seams --bake-normals --renders --samples 48
```

The download helper verifies **all five exact filenames, published sizes, SHA-256 digests and GLB/PNG headers** against the committed `source-manifest.json`. Existing downloads are verified before Blender imports them. Missing or changed files stop the pipeline. Keep master files outside the repository; the helper rejects a repository-local destination. Masters remain untouched in GitHub Releases, not Git/LFS or the application bundle. Pin hashes even if the Release tag is later edited.

## Source inspection and rigging assessment

The GLB is 50,384,156 bytes, with 1,408,570 triangles, 762,042 exported vertices, one mesh/primitive/material, one UV set, three embedded 2048² JPEG maps, and no skeleton or animations. Its glTF bounds are X −0.595689…0.595229, Y −0.952027…0.950987, Z −0.511001…0.511781. Front is +Z, verified from actual renders.

Face, helmet, suit and paws share one textured surface. The 1744 imported topological islands are **UV/seam splits**, not 1744 separately modeled character parts. Welding only coincident positions at 1e−7 yields one connected, closed surface with 704,189 vertices, zero boundary/nonmanifold edges and unchanged triangles. These measurements do not prove absence of self-intersections.

The model is **not rig-ready**. No separate eyes/jaw/armor objects, skeleton, skin weights or deformation-friendly joint loops are provided. A character artist must plan segmentation/retopology, rigid armor versus soft-tissue weighting, shoulder/hip deformation and facial controls. No rigging or animation is implemented in this PR.

## Optimization and normalization

1. Verify masters and import actual Meshy GLB.
2. Rotate 180° around vertical, apply uniform scale to height 1.8, center horizontally and put feet on ground. No nonuniform shape change.
3. Preserve a copy of the high-resolution normals. Weld coincident vertices on the runtime copy **while preserving per-corner UVs**.
4. Collapse to the requested budget; transfer original interpolated corner normals to preserve smooth silver highlights. Direct collapse of independent UV islands caused visible dents and was rejected during experiments.
5. Protect UV-seam vertices in the selected 160k candidate. Reproject the supplied high-resolution normal detail with a selected-to-active tangent bake (2k, cage 0.02, ray distance 0.04, margin 8); export tangent vectors so the runtime uses the same basis. This corrects highlight distortion caused by reusing a high-resolution tangent normal map unchanged. Base color and scalar PBR inputs remain unchanged.
6. Reconfirm height/ground after reduction; export one identity root, one textured mesh/material, Y-up facing negative Z.
7. Re-import the exported GLB before rendering. Measure the file, not an intermediate Blender modifier.

Compare 40k, 80k and selected 160k at normal distance and in face/helmet closeups. Geometry reduction alone does not establish visual approval. See [visual review](character-visual-rework.md) and measured reports in the asset folder.

## Material handling

The source already embeds base-color JPEG, packed metallic/roughness JPEG and tangent normal JPEG with correct bindings. External PNGs share the atlas and provide lossless source maps. They replace the lossy embedded copies; measured pixel differences are recorded in `optimization.json` (not assumed identical).

- Base color: supplied `texture_0.png`, sRGB.
- Normal: supplied `texture_0_normal.png`, Non-Color, tangent normal node, strength 1; reprojected into the reduced mesh tangent basis with the source detail retained. The derived PNG is embedded.
- Roughness and metallic: scalar maps read as Non-Color, packed losslessly into G/B of one PNG for standard glTF metallic-roughness. R is unused/white.
- Opaque and double-sided, as original. No transparency invented.
- No emissive map/factor exists in the source; no emission is added. Cyan remains its textured PBR appearance, not a claim of physical illumination.

Three 2048² PNGs are embedded in the optimized GLB. This is one material/draw primitive with 48 MiB RGBA8 texture storage before mipmaps (about 64 MiB with full mip chains); compressed download bytes are a different measurement. Physical-mobile performance is not benchmarked. Further texture reduction/compression should be separately compared against the source before adoption.

## Inspect and validate

```sh
python tools/blender/inspect_character.py --input assets/characters/minimorph/minimorph_v1.glb
blender --background --factory-startup --python-exit-code 1 --python tools/blender/validate_character.py -- --input assets/characters/minimorph/minimorph_v1.glb --report /tmp/blender-import.json
npm run check
npm run test:browser
npm run preview:character
```

The inspector verifies GLB chunks, buffers/accessors/indices, finite normals and UVs, geometric closure across UV seams, texture references and embedding, required PBR bindings, origin/height, no unexpected emission/transparency and declared budgets. Negative tests mutate actual buffers/material references. Blender supplies a second import audit. Orientation is visually verified, not inferred from a bounding box.

The PlayCanvas preview uses the existing shared `gltfCharacterSource`. Browser tests assert bounds, mesh/material count, all four PBR texture bindings, nonempty rendering and no page errors on desktop/mobile. They do not approve art or certify frame rate.

Open `/comparison.html` for original Meshy versus both candidates, including face closeups. To capture exact side-by-side PNGs of these real renders, run the preview server, then:

```sh
node tools/character-preview/capture-comparisons.mjs
```

Both columns use identical cameras, lighting, exposure and supplied PBR maps. Left is unreduced original Meshy geometry normalized only for scale/facing; right is the actual optimized GLB. Matching materials isolates geometry/shading differences. The untouched raw original with embedded JPEGs remains in the Release.

The production game does not select this GLB. Its existing procedural fallback and all controller/camera/checkpoint/Telegram/read-only Minima functionality remain unchanged. No master textures or render/reference files are copied into host app production bundles. PR #3 remains Draft until human visual approval; no automatic merge.

## Repeatability and verification record

Two independent Blender runs produce matching canonical geometry hashes, triangle/vertex counts and bounds. Base color and packed metallic/roughness image hashes match. The 2k normal bake differs in just 3 of 4,194,304 pixels, by at most one 8-bit level (measured mean absolute RGB difference 9.35e−10). Four-thread Cycles baking is therefore not byte deterministic; no identical-GLB-hash claim is made. See `reproducibility.json`.

Local `npm run check` passes: 11 GLB/provenance/negative tests, TypeScript, ESLint, 27 unit tests, Telegram/Minima builds and MDS packaging. Independent Blender import also passes. The complete browser suite passes all 18 desktop/mobile tests (system Chromium, software WebGL). All required map bindings and ground placement are checked in desktop/mobile PlayCanvas browser tests. Physical-device profiling and human visual approval remain pending.

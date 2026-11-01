# Character generation and inspection

This is an **unapproved visual rework candidate**. Read [the visual assessment](character-visual-rework.md) before evaluating it. Technical compatibility is separate from artistic approval.

## Reproduce

Requires Blender 4.3.2 (including its bundled NumPy). No UI operations or external add-ons are needed.

```sh
blender --background --factory-startup --python-exit-code 1 --python tools/blender/build_character.py -- --output assets/characters/minimorph --renders --samples 128
blender --background --factory-startup --python-exit-code 1 --python tools/blender/validate_character.py -- --input assets/characters/minimorph/minimorph_v1.glb --report assets/characters/minimorph/validation-blender.json
npm run check
npm run test:browser
```

`character_fidelity.py` builds continuous fur surfaces, helmet shell plates, fitted armor and deterministic procedural PBR maps. The `.blend` saves the higher-resolution editable construction before export reduction. Material groups are reduced separately and exported as eight meshes. All six images are embedded; no external runtime dependencies are required. PNG sources are also included in `textures/`.

For source-model renders without reduction, use another output directory:

```sh
blender --background --factory-startup --python-exit-code 1 --python tools/blender/build_character.py -- --output /tmp/minimorph-source --source-only --renders --samples 128
```

`--head-review` renders front and three-quarter source closeups. Default `--renders` shows the actual re-imported optimized GLB from front, three-quarter, side and back. Render samples are configurable; renders may retain noise. CPU denoising is disabled for compatibility.

## Measured export

The candidate has 96,206 triangles, 62,759 exported vertices, eight primitives/materials and six embedded images; the GLB is 9,588,016 bytes. Texture RGBA8 storage before mipmaps is 31,457,280 bytes, independent of PNG compression. No skins or animation clips are implemented. Feet are at zero within tolerance, Y-up height approximately 1.8, and the character faces local negative Z.

`budgets.json` enforces temporary review ceilings of 100,000 triangles, 12 materials, 16 primitives and 24 MiB. This replaces the earlier 20k/8 MiB review assumptions explicitly; it is not a mobile performance claim. No device performance benchmark has been conducted. Optimize only after the face and silhouette are accepted.

The standalone inspector checks binary structure, finite attributes, index bounds, winding/normals, transforms, dimensions, texture embedding, fur UV/PBR inputs and budgets. Mutation tests exercise invalid assets. Blender independently imports and measures the GLB. Repeatability records compare actual regeneration results; byte identity is not assumed. In the current two-run experiment, counts, bounds and image hashes match, but the canonical geometry hash differs. Exact geometry reproducibility remains unresolved; consult `reproducibility.json`.

## PlayCanvas and manual review

Run `npm run preview:character`. The viewer uses the existing `gltfCharacterSource` and supports four camera views. Open `/comparison.html` for candidate/rejected views and a local approved-reference file selector. Original reference pixels remain unavailable to this environment; see the visual assessment for limitations.

Check front and three-quarter facial likeness first, then helmet depth, ear attachment, armor silhouette, exposed paws and back construction. Inspect textures and cyan emission in PlayCanvas. Browser tests verify actual loading and nonempty rendering on desktop and mobile viewports; they do not judge likeness or device frame rate.

Neither game host selects this asset by default. Procedural fallback, shared gameplay, Telegram integration and Minima MDS remain unchanged. No rigging, animation, blockchain or account functionality is added.

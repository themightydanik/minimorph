# Official Meshy source versus optimized character

PR #3 now derives from the five exact official [assets-v1 Release assets](https://github.com/themightydanik/minimorph/releases/tag/assets-v1), verified by size and SHA-256. The former procedural character is rejected and removed from the branch tip. Its renders are not used as the new comparison authority.

**Human visual approval is pending.** These are optimization candidates of the actual Meshy character, not newly generated designs. The original illustration and approved design sheet remain the artistic reference, but the official Meshy model is the 3D source to preserve.

## Comparison method

Source and candidate images use the same 640×720 orthographic cameras, AgX exposure/look, area lights, environment and 48 samples. Six views include front, three-quarter, side, back, face-front and face-three-quarter. The source retains all 1,408,570 triangles, normalized only for game scale/facing. Both use the supplied lossless PBR maps, so the comparison isolates mesh/UV/shading changes rather than JPEG-versus-PNG differences. Candidates are exported and re-imported before rendering. Normal-detail reprojection corrects the changed tangent basis; base color and roughness/metallic inputs are preserved.

Open `/comparison.html` in `npm run preview:character`. Static side-by-side PNGs in the asset folder are exact browser captures of these render pairs; no image synthesis or substituted character is used. They include each candidate and the real Meshy source.

## Findings and trade-offs

- Direct collapse of the imported, seam-split mesh damaged metal highlights. The source's apparent 1744 islands were UV splits: welding coincident positions produces one closed connected surface without changing its triangles or UV-corner data.
- The 40k and 80k trials preserve overall character identity and silhouette, but show visible pupil/iris and helmet/armor texture-border distortion in closeups. Those budgets are not accepted solely for their lower triangle counts.
- The selected 160k candidate protects source seam vertices, transfers source corner normals and reprojects the source tangent normal detail. This improves the eye borders and metal highlights compared to 40k/80k. Its quality and cost must be evaluated from the actual comparison images and measured reports. No automated artistic approval is claimed.
- Source appearance includes detailed fur, cyan-colored trim and metallic armor. There is no true emissive source channel, and none is added.
- The surface is a single triangulated character mesh. Panel lines and some details are texture features rather than separately articulated armor. No rig, expressions or animations have been added.
- CPU renders retain sampling noise. PNG download sizes do not measure GPU memory or frame rate. Physical-mobile performance has not been benchmarked.

## Human review instructions

1. Compare normal-distance front and three-quarter renders for eye proportions, muzzle, whiskers, ear shape, helmet opening, cyan line continuity and chest panel contours.
2. Inspect face closeups for jagged pupil/iris boundaries, texture seams and small metallic highlight changes.
3. Compare side/back silhouette and paw/leg shape, and inspect ear and helmet seams from both directions.
4. Load the selected optimized GLB in the PlayCanvas preview on desktop and a real mobile device. Confirm front faces the preview camera, feet meet ground level, all PBR maps are bound, and rendering is stable.
5. Approve or request changes explicitly. Successful tests, a lower triangle count or this report do not approve the art.

The existing production character fallback and gameplay remain unchanged. Source masters stay in the Release outside Git and application bundles. See the asset README for actual candidate statistics, audit reports and comparison links.

## Measured selected export

160,000 triangles, 145,409 exported vertices (including UV/normal/tangent splits), one mesh/primitive/material, three embedded 2048² PNGs, 25,551,344 bytes. This is an 88.6% triangle reduction from the source, with zero geometric boundary/nonmanifold edges after merging exact seam positions. The original illustration is not replaced or redesigned. No visual approval, rigging or animation is claimed.

Geometry is repeatable across two runs; the normal bake differs in only three pixels by one 8-bit level, so binary identity is not claimed. Review source/candidate images rather than assuming a triangle count proves fidelity.

# Experimental rig intermediate — NOT animation-ready

**Known deformation failures are blocking production use.** The static approved character is unchanged. This folder supplies the best technical intermediate for manual rig refinement, not approved animation.

- [Rigged GLB with 20 bones and six actual clips](minimorph_animated_v1.glb).
- [Clip metadata](animation-metadata.json), [skin/clip audit](validation.json).
- [Failed deformation measurements](deformation.json) and [quality gates / artist plan](quality-status.json).
- [Reproduction, limitations, integration points and completion plan](../../../../docs/character-animation.md).

![Actual key-pose contact sheet — known defects](contact-sheet.png)

The raised-arm pose visibly stretches wrist/body regions into membranes. Run/Land also penetrate ground. No automatic visual approval is claimed. Run `npm run preview:character` and open `/animation.html` to examine the actual GLB, including neutral comparison, clip selection, playback, loop controls and speed.

Actual PlayCanvas neutral-state captures: [desktop](playcanvas-desktop.png), [mobile](playcanvas-mobile.png). These prove loading/neutral display only, not acceptable deformation.

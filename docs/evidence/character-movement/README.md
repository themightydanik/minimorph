# PR #9 gameplay captures

Actual PlayCanvas production renders using the approved optimized character. No generated images, resolution/lighting changes or arena edits. These are functional temporary action poses from existing Fall/Land clips, not final dedicated dive/get-up artwork.

| State | Desktop | Touch layout |
| --- | --- | --- |
| Dive | [Desktop](pr9-dive-desktop.png) | [Mobile](pr9-dive-mobile.png) |
| Slide | [Desktop](pr9-slide-desktop.png) | [Mobile](pr9-slide-mobile.png) |
| Analog controls after cancellation | — | [Mobile](pr9-analog-mobile.png) |

The production browser regression drives Jump → Dive → Slide → Recovery → Run and checks clips/action states. The touch regression checks radial dead zone, partial displacement, diagonal movement, simultaneous stick/Jump/Dive fingers, cancellation and release. Screens show early-race poses; the existing GO overlay can overlap the character during that period. They do not prove physical Android latency or final animation quality.

Local validation: `npm run check` passed 95 unit/server tests, 22 existing Python character tests, candidate preservation across 30 sampled poses, types, lint, builds, production bundle hash checks and MDS packaging. Final movement browser tests passed on desktop/mobile (3 passed, 1 touch-only desktop skip). Full regression CI status is recorded on PR #9.

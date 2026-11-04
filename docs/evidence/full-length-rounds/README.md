# Gameplay evidence and measured performance

Captured from the actual production PlayCanvas app in Chromium. Race screenshots use ordinary key playback; two-touch screenshots use CDP touch events. No teleport, forced finish or hazard override was used.

The desktop race captures precede the final HUD spacing correction. The profile images and two-touch captures use the corrected spacing; successful CI also runs that final UI.

## Completion and controls

| Evidence | Observed result |
| --- | --- |
| [cosmic-sprint finish](pr6-cosmic-sprint-finish-desktop.png) | 65.79 s, zero falls, all checkpoints, Victory |
| [orbit-chaos finish](pr6-orbit-chaos-finish-desktop.png) | 72.89 s, zero falls, all checkpoints, Victory |
| [gravity-mayhem finish](pr6-gravity-mayhem-finish-desktop.png) | 75.64 s, zero falls, all checkpoints, Victory |
| [Portrait two-touch](pr6-two-touch-393.png) / [landscape](pr6-two-touch-900.png) | Diagonal movement plus Jump, safe release, 48 px or larger targets |

## Obstacles

[Pendulum](pr6-cosmic-sprint-2-desktop.png), [wall openings](pr6-cosmic-sprint-3-desktop.png), [spring section](pr6-cosmic-sprint-5-desktop.png), [collapsing/gate sector](pr6-gravity-mayhem-0-desktop.png) and [final combined gauntlet](pr6-gravity-mayhem-6-desktop.png).

## Standalone frame-cadence measurement

No regression browsers ran concurrently. Forced SwiftShader software rendering; 3-second idle rAF samples, with no clock override. These are cloud CPU-renderer measurements, **not physical-device FPS** or hardware GPU benchmarks. Physical phones and live hosts remain unmeasured. The 100 ms gameplay test cadence is independent of these measurements.

| Mode | Arena | Frames / seconds | Software FPS | Median ms | p95 ms | Drawing buffer |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| desktop | cosmic-sprint | 16 / 3.21 | 4.98 | 200.0 | 316.6 | 1280×720 |
| desktop | orbit-chaos | 16 / 3.18 | 5.03 | 200.0 | 264.3 | 1280×720 |
| desktop | gravity-mayhem | 15 / 3.32 | 4.52 | 216.6 | 400.0 | 1280×720 |
| mobile-emulation | cosmic-sprint | 15 / 3.12 | 4.80 | 216.7 | 266.7 | 618×1258 |
| mobile-emulation | orbit-chaos | 12 / 3.34 | 3.59 | 249.9 | 733.3 | 618×1258 |
| mobile-emulation | gravity-mayhem | 13 / 3.22 | 4.04 | 233.3 | 399.9 | 618×1258 |

The unchanged animated GLB transferred 28,567,788 encoded bytes once per browser context and was reused across arena switches. Navigation-to-character selection was 2.97 s desktop and 1.92 s mobile emulation on this local run; these are local warm-host observations, not internet loading guarantees.

[Raw samples and renderer strings](measurements.json). Reproduce with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium PROFILE_OUTPUT=artifacts/full-round-profile node tools/gameplay/profile.mjs` against a built preview server. The measurements are short smoke samples and cannot establish sustained performance or mobile readiness.

Profile scene captures: [desktop Cosmic](cosmic-sprint-desktop.jpg), [mobile Cosmic](cosmic-sprint-mobile-emulation.jpg), [mobile Orbit](orbit-chaos-mobile-emulation.jpg), [mobile Gravity](gravity-mayhem-mobile-emulation.jpg).

# PR #10 — visual and audio polish review

**Status: artistic review required; do not merge automatically.** This branch starts at merged PR #9 (`ae0008d`). Passing CI is not visual or listening approval. The dedicated high-quality Dive/Slide/Get-up animation deliverable remains **partial**: the procedural skeletal bridge is reviewable, but external authored action clips are still required for final contact and motion quality. See the [exact external asset specification](action-animation-asset-spec.md).

## Character presentation

`action-pose.ts` replaces PR #9's whole-character entity pitch with an overlay on fourteen existing skeleton nodes: skeletal Root/Pelvis, spine/chest, neck/head, upper/lower arms and upper/lower legs. Dive reaches/braces with the arms; Slide lowers the body and folds the legs; Recovery uses the authoritative 0.22 s action timer to return through a crouched brace toward standing. Exponential target/weight smoothing blends entries, corrections, interruptions and exits. Each overlay is removed before PlayCanvas evaluates the next frame's original GLB animation, preventing accumulated rotations and pause drift. Local and remote characters use the same source and authoritative/predicted state fields.

The approved GLB remains byte-identical, SHA-256 `cd566c9024676775e3efe8d751de3605a035eca3ca4bc3c00082d7b5d283d6b6`: mesh, proportions, rig/bind data, skin weights, textures, materials and six supplied clips are unchanged. The original 160,000-triangle asset remains available for rollback. There are no collision-body adjustments, new physics constants, actions or protocol fields.

**Animation limitation:** these are controlled procedural poses, not newly authored motion-capture/artist clips. They have no planted-contact IK, can show imperfect hand/foot contact and inherited shoulder/hip skin strain, and the short get-up is a stylized approximation. They must not be represented as completed high-quality action animation. Owner visual review must decide whether this bridge is acceptable; otherwise keep the artistic changes unmerged pending the external assets. Do not silently rebind or change the approved mesh to hide limitations.

## Lighting and materials

All three arenas share a fixed warm key, cool fill and cyan rim rig. Balanced ambient illumination and controlled specular response give planets/platforms more depth and separate the silver character from the route. Existing arena colors and geometry are retained; arena materials have consistent mild metalness/gloss and restrained emissive accents. No photorealistic texture sets or bloom were added. Character material definitions were not edited; their appearance responds to the new scene lights.

Soft reusable contact-shadow planes ground characters on actual sampled supports, including moving platforms; they disappear over unsupported voids and during respawn. These are **contact shadows**, not directional/world-cast shadow maps. Large arena-object cast shadows remain an external/future lighting refinement; no existing shadow feature was removed (PR #9 had none). Three directional lights have no additional shadow-render passes.

Resolution, DPR ceiling, antialias policy, camera controls, arenas, scenery, obstacle models, environmental geometry and route layout are unchanged. No frame-rate/device heuristics or automatic quality reductions exist.

## Event feedback and multiplayer

A scene-wide reusable pool handles jump, landing, Dive, Slide trail, collision, checkpoint, finish and victory cues for local and remote participants. The fixed shared limits are 48 sparks, eight expanding impact pulses and nine contact-shadow slots. Small world-space sparks and brief impact pulses avoid covering hazards; contact shadows share a single texture/material. Pool sizes and emission intervals are fixed internal artistic settings in `POLISH_EFFECT_LIMITS`, not adaptive performance settings. Changing visible quality later still requires owner approval.

`PresentationEvents` keeps bounded session high-water marks for physics event serials, checkpoints, victory and action episodes. Reconciliation rewinds do not replay cues. Initial snapshots seed remote cursors without replaying the match history; reconnect to the same driver/arena retains cursors. An arena/new race resets them. Tab suspension clears transient VFX and suspends sound without a catch-up sound backlog. Conservative deduplication can omit a corrected predicted cue whose serial was already presented; it favors no duplicate burst/sound over replaying disputed history.

Protocol v2, simulation, movement constants, prediction/reconciliation, bots, eight-player rooms, private/quick matches, checkpoints, reconnect and ranking/results are unchanged. Presentation consumes state and never writes it or determines outcomes.

## Original audio and settings

The centralized `AudioManager` owns one Web Audio context, cached decoded buffers, eight reusable effect voice gains, prioritization/nearby-remote attenuation and bounded music crossfades. Context creation/resume requires a trusted user gesture. Nothing downloads or plays as a pre-gesture backlog. Suspended/unsupported audio never blocks gameplay. High-priority local start/checkpoint/collision/finish cues outrank remote effects, with a master limiter for overlapping peaks.

Original effects cover Jump, Land, Dive, Slide, Collision, Checkpoint, Countdown, Start, Finish and Victory. Three original stereo compositions provide menu, race and results music with native looping and smooth fades. These are original synthetic arcade audio, not commercial recordings or a claim of studio sound design. All thirteen WAV files are bundled for Telegram and offline MDS; there are no paid dependencies, external music services or third-party samples. [CC0 license and provenance](../assets/audio/LICENSE.md), [hash/duration manifest](../assets/audio/manifest.json), [generator](../tools/audio/generate.py).

Audio settings in the footer provide Master/Music/Effects volume and Mute with locally persisted, clamped preferences. Storage failure falls back to session settings. The panel supports touch and keyboard without stealing movement keys while controls are focused. Native browser/OS interruptions may require another tap to resume audio, as required by autoplay policies.

**Listening review:** run `npm run preview:character`, open `http://127.0.0.1:5175/audio-review.html`, and audition the music and effects individually. Nothing on that page autoplays. Music/SFX assets are available and licensed; no external audio asset is currently missing. Art-direction/mix approval remains the owner's decision.

## Review evidence and reproduction

[Before/after screenshots and review notes](evidence/visual-audio-polish/README.md) include all three arenas, Dive/Slide/Recovery, VFX, menu/race and audio settings. They are actual PlayCanvas/browser captures, not generated illustrations. The isolated `polish-review.html` harness freezes authoritative-style state, arena phase and camera for comparison; it is not imported by production hosts and does not change their physics.

To reproduce current comparisons, run `npm run preview:character`, install Playwright Chromium (or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`), then `node tools/visual-audio-polish/capture.mjs after`. The before captures were made before presentation edits, at PR #9. To reproduce them in a separate checkout of `ae0008d`, copy only the review HTML/TS and capture script into that checkout, install its dependencies there, and run its preview plus the capture script with `before`. The script rejects a `before` capture against modified production packages.

Regenerate audio with `python3 tools/audio/generate.py`; validate with `python3 tools/audio/validate.py`. Required checks include original/candidate integrity, audio hashes/format/peaks/fades, both production package contents, TypeScript, ESLint, unit/integration/server tests, builds and desktop/mobile browser regressions. New tests cover skeletal state samples, audio persistence/autoplay, snapshot cue suppression, VFX pooling/cleanup and actual remote visual events. The pre-existing strict original-rig deformation diagnostic remains unchanged and nonblocking under the accepted temporary-character exception.

No new physical-device benchmark was required or run. The Redmi Note 8 target is not newly validated by this work. Automated checks are mechanical verification, not artistic approval.

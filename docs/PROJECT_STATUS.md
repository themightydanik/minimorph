# Minimorph — project status and AI handoff

**Updated:** 2026-11-19. **Evidence:** current repository README and documentation, plus GitHub PR metadata checked for #17–#20. This is a handoff, not a fresh end-to-end runtime or physical-device certification. Recheck `main` and open PRs before relying on it.

## Product vision
A premium-feeling, colorful, accessible 3D obstacle racer inspired by the readable, wide-arena, playful competition of party racers (without copying assets). Eight participants per multiplayer match (players and server bots), strong mobile controls, distinct fun courses, polished approved space-cat character, and engaging obstacles. Target delivery: Telegram Mini App, Android APK, and Minima MiniDapp/node experience; planned deeper Minima-backed assets/progression/economy. Avoid advertising planned integrations as shipped.

## Implemented in repository (source/documentation-backed; deployment not independently verified here)
- Shared PlayCanvas-based engine and deterministic game simulation; keyboard/touch movement, jump, dive, camera, checkpoints, race HUD.
- Three full-length race arenas: Cosmic Sprint / Galactic Fun Park, Orbit Chaos, Gravity Mayhem; three retained training variants.
- Multiplayer server with authoritative WebSocket rooms, eight-participant Quick Match/private rooms, server bots, reconnect, tournament progression and spectating.
- Telegram browser shell and a **read-only** Minima MiniDapp shell/adapter; no verified wallet transactions, on-chain game economy or published Android APK established by this handoff.
- Approved optimized character asset and prepared animations; some action/deformation quality limitations remain documented. Preserve asset and rollback path.
- Cosmic Sprint-focused level editor, visual environment tooling, Playtest and snap/alignment work.
- PR #17 documentation/audit, PR #18 structured diagnostics/validation, PR #19 safe Playtest start and grid snap, PR #20 independent level registry/legacy compatibility — all marked merged in GitHub at this review. PR #20 is **not** a completed section prefab/compiler or new level.

## Architecture and known constraints
- Shared `ArenaConfig` is the runtime representation. Existing physics supports defined surfaces, colliders and mechanisms, **not** arbitrary 3D mesh physics, slopes/ceilings, or player-player collision as a general feature.
- Bots follow waypoint/control policies; a static path check is not proof of full traversal. Some world-axis/negative-Z assumptions constrain section transforms.
- Registry v1 resolves trusted compiled arenas and preserves existing published levels. Section instances, authored new-level compiler and generalized authoring are future work until confirmed in code.
- `WORLD_REVISION` changed in PR #20; matching frontend and multiplayer server revisions are required. This handoff does **not** verify live Render/Netlify deployment alignment.
- Earlier review identified two baseline `rounds.test.ts` failures (race-duration expectation and Cosmic Sprint replay). Verify against current `main` rather than assuming they persist or were fixed.
- Performance on a physical lower-end Android device, release packaging, and full course fun/fairness require actual testing; passing CI does not establish them.

## Primary source documents
- [README](../README.md), [architecture](architecture.md), [deployment](deployment.md), [multiplayer](multiplayer.md)
- [Technical audit](audits/MINIMORPH_TECHNICAL_AUDIT.md) — dated 2026-11-08
- [Level Factory architecture](audits/LEVEL_FACTORY_ARCHITECTURE.md) — proposed architecture
- [Gameplay quality roadmap](audits/GAMEPLAY_QUALITY_ROADMAP.md) — planning, not completed work
- [Cosmic Sprint 2 design brief](audits/COSMIC_SPRINT_2_DESIGN_BRIEF.md) — unbuilt concept
- [Level registry](level-registry.md) — PR #20 implementation and limits

## Owner decisions / quality bar
- No silent downgrades of graphics, character quality, lighting, or materials for performance.
- Wide, readable, attractive obstacle arenas; fun and fairness must be judged in actual play.
- Prefer small PRs, explicit acceptance criteria, focused tests, and no automatic merges/deployments.
- The largest production bottleneck is **creating even one visually polished, well-designed section**. A library of reusable sections is not yet the solution: first prove an efficient single-section workflow with a visual reference, measured plan, required assets, implementation and playtest.
- Separate code implementation from game design and visual approval. Do not ask the coding agent to invent an entire beautiful game level from vague prose and present it as final.

## Status interpretation
This file records known source evidence and product decisions. Before each task, inspect the actual current branch and deployment state. Update this handoff when meaningful milestones merge.

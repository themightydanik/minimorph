# Minimorph — next steps and decision gates

**Updated:** 2026-11-19. Priorities are recommendations, not authorizations to merge/deploy. Confirm current `main`, open PRs, and real test results before starting.

## Immediate — make one excellent playable section
1. **Verify baseline:** check PR #20 registry on `main`, inspect open work, test relevant compiler/registry/editor paths, and verify frontend/server `WORLD_REVISION` deployment compatibility before any multiplayer release.
2. **Choose one section as a production experiment** (Star Launch is a reasonable low-mechanic candidate). Owner and assistant define gameplay intent, broad readable routes, entry/exit, precise top-down plan, reference render, and a small asset list. A render is an art target, **not** a physics blueprint or proof of playability.
3. **Implement the section with existing physics and approved visuals.** Identify unsupported shapes/mechanisms before coding. Use existing GLB where appropriate, authored simple geometry for structural parts, and explicit local colliders. Do not generate an unreviewed mountain of placeholder primitives and call it finished art.
4. **Playtest and measure:** checkpoint/spawn support, gaps, collisions, hazard timing, bot legal-input traversal where possible, camera, fun/fairness, and lower-end Android FPS. Iterate against a reference and concrete issues. Owner approves quality.
5. **Only after this experiment:** decide whether a reusable procedural section builder, section library, or faster asset-authoring workflow actually reduces time.

## Level Factory technical sequence
- **Section prefab + deterministic headless compiler MVP** (previously planned after merged PR #20): versioned section definitions, stable instance IDs, translation-only transforms initially, entry/exit contract, deterministic ID namespacing, owner-local colliders, source mapping, dependency manifest, diagnostics, tests, and registry integration. Drafts must not auto-publish. Existing races must remain unchanged. This is **planned, not confirmed implemented** in the reviewed docs.
- **Section editing/catalog UX** after compiler contract is proven: placement, alignment, duplicate, undo, safe connections and validation feedback.
- **Bot route editing + simulated traversal evidence**, with explicit distinction between static validation and verified full completion.
- **Mechanism timeline/phase diagnostics** and mobile playtest.
- **Cosmic Sprint 2.0** as a separate course; preserve the published original until owner approval. The design brief proposes five sections (Star Launch, Hammer Plaza, Turbo Boulevard, Bounce Garden, Orbit Finale), not a committed or finished level.

## Release / platform workstreams
- Telegram: maintain browser/Mini App playability, input and performance.
- Android: decide packaging/release path, build and test APK on physical device; do not mark released without evidence.
- Minima: current documented shell is read-only. Define exact MiniDapp/node execution architecture and separately design security, identity, persistence and future on-chain features. No wallet transactions or P2E claims without implementation, security review and owner approval.
- Multiplayer: measure 8-participant mobile/network performance, reconnect, protocol compatibility, and Render/Netlify deployment pairing.

## First task for a new AI agent
Read `AGENTS.md`, `docs/PROJECT_STATUS.md`, `docs/NEXT_STEPS.md`, the current README, and the four audit/design documents. Inspect the latest `main` and open PRs. Report a short evidence-based **implemented / missing / uncertain** matrix. Propose a small, testable Draft PR that advances the single-section experiment or necessary Section Compiler foundation. **Do not edit code until the owner approves the scope.**

## Definition of done for each coding PR
- Scope and acceptance criteria agreed; no unrelated changes.
- Real tests run and reported, including failures; no unsupported claims about gameplay quality.
- Legacy courses, approved character/visual assets and shared physics preserved.
- Explicit client/server compatibility and deployment note if network/gameplay revisions change.
- Manual playtest instructions; owner review; PR remains unmerged.

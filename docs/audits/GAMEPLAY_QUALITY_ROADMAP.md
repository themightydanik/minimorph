# Gameplay quality and production roadmap

Planning document, 8 November 2026. Base `e7638a2`, after PR #16. No implementation or benchmark is included. [Audit/evidence](MINIMORPH_TECHNICAL_AUDIT.md), [architecture](LEVEL_FACTORY_ARCHITECTURE.md), [design brief/template](COSMIC_SPRINT_2_DESIGN_BRIEF.md).

## 1. Priorities and success definition

The goal is 6–10 distinct, attractive multiplayer courses built through a repeatable section workflow. Counting levels is insufficient: each should offer a readable safe route, meaningful optional risk, recoverable mistakes, matching physics/art, legal bot traversal and verified device behavior. A Fall Guys/Stumble Guys quality goal does not imply feature parity, unrestricted mesh physics or a full engine rewrite.

The best current investment is reducing the time between a design question and a playable, trustworthy answer. Preserve the approved optimized Minimorph, existing mechanics, shared simulation, visual quality and full original character rollback. No automatic quality downgrade, scene simplification or character reprocessing is authorized by this plan.

| Rank | Improvement | Player / production impact | Implementation risk | Gate |
| --- | --- | --- | --- | --- |
| 1 | Explicit walkability/contact/connection diagnostics | Prevents unfair invisible falls/walls and repeated layout rework | Low–medium: reuse actual collider/compiler data | Representative movement fixtures and no editor-only physics |
| 2 | Start-anywhere Playtest with validated spawn | Rapid human iteration on landings, hazards and recovery | Low–medium: isolate debug state from progression/network | Safe support, clear reset context, exit preserves draft |
| 3 | Grid/surface snap + alignment | Improves seams, measured jumps and visual polish | Medium: thin/decor surfaces and parent-local offsets | Transactional edits, snap only to valid target types |
| 4 | Route editing + simulated reachability report | More reliable bots, branches and publication | Medium: phase coverage/progress semantics | No claim that waypoint support alone proves completion |
| 5 | Versioned sections/ports | Multiplies output after first course, reduces copied bugs | Medium: IDs/migrations/transform restrictions | Shared deterministic compiler and pinned versions |
| 6 | Mechanism scrub timeline / contact preview | Makes timing and hazard telegraphs easier to tune | Medium: shared phase and trigger state | Visuals/overlays from one sample time |
| 7 | Landing readability and camera obstruction work | Strong direct game-feel gain in complex scenes | Medium: new scenery can reveal camera edge cases | Record observed cases; preserve input yaw/physics |
| 8 | Dedicated Dive/Slide/get-up art | Removes a conspicuous temporary visual limitation | Medium–high: assets/rig/art review dependency | Approved clips, same simulation states and silhouette |
| 9 | Measured delivery/GPU headroom work | Faster entry and stable crowded play on phones | Medium–high until hardware evidence exists | Profile first; retain rendering/lighting quality policy |
| 10 | Release identity/operations and durable results | Essential to reliable online release/economics later | High if mixed with gameplay production | Separate host/release/security milestones |

No evidence currently justifies replacing acceleration, jump or dive physics wholesale. Constants and state transitions are already shared and tested in source. First capture controlled scenarios and human observations. Make any later tuning small, measurable and common to authority/prediction/bots.

## 2. Dependency-aware phases

| Phase | Work | Entry / exit gate |
| --- | --- | --- |
| 1 — Gameplay Foundation | Contract fixtures, diagnostics, targeted contact/camera observations, safe playtest entry and precise placement. Preserve current behavior until a defect/tuning need is evidenced. | Exit: existing movement/action and collider rules documented and regression-ready; a designer can reproduce a problem locally without replaying the whole level. |
| 2 — Level Factory MVP | Level registry, legacy adapter, deterministic section compiler, pinned IDs, ports, constrained instance editing, routes and validation panel/timeline. | Depends on Phase 1 contracts. Exit: two instances of one section compile independently, export/import/undo, validate and play on client/server with matching identity. No automatic live publication. |
| 3 — Cosmic Sprint 2.0 | Five designed sections using the supported vocabulary; safe/risky routes, reviewed collision and composition. Iterate one section before decorating all five. | Depends on Phase 2. Exit: owner reviews actual gameplay, bots complete mandatory route, changed authority cases pass, target-device evidence obtained before performance/release claims. Publish as a new level first unless replacement is approved. |
| 4 — Additional level production | Reuse pinned sections; create distinct themes/rhythm and limited new mechanics. Start with two contrasting courses before scaling to 6–10. | Depends on a successful Phase 3 cycle. Exit per course: validation report, human sign-off, asset/dependency budget, route identity and rollback. Avoid ten near-identical remixes. |
| 5 — Multiplayer and presentation polish | Already-existing tournaments are hardened, not newly invented: latency/reconciliation presentation, spectators, camera, dedicated action clips, mix/VFX/art direction, live-room operations. | Preserve tie/DNF/withdrawal/reconnect contracts. Some art work can run alongside Phases 3–4 after states stabilize. Exit: verified long online sessions and approved presentation. |
| 6 — Telegram, Web and Android release readiness | Real WebView/browser/device matrix, loading/thermal testing, safe areas/audio lifecycle, HTTPS/WSS/deploy pairing, identity/results/observability/rollback. Android delivery choice and signed packaging are separate. | Depends on stable content and hardware evidence; release no earlier than explicit host checks. Engine/account code does not imply native Android readiness. |
| 7 — Future Minima P2E integration | Threat model, authenticated identity, durable idempotent match records, server-side anti-abuse, reviewed settlement interface and legal/product decisions. | After reliable nonfinancial game release. Existing READ `status` adapter is not wallet auth or a reward system. Owner separately authorizes economics implementation. |

Critical dependency chain: **PR 1 → PR 3 → PR 4 → PR 5/6 → PR 7 → PR 8** below. PR 2 follows PR 1 and can proceed before PR 3. PR 5 and PR 6 share PR 4 but should be reviewed independently. Early target-device sampling can occur after the first representative section; do not wait for ten completed levels to discover a memory limit.

## 3. Exact first eight implementation PRs

These are proposed sequential work packages, **not reserved GitHub PR numbers**. Each changes one reviewable boundary. Every preview in future implementation tasks requires a matching scope/authorization; this documentation audit creates none.

### PR 1 — Level validation contract and gameplay baseline

- **Goal:** make existing authoring failures observable before changing movement or adding a factory.
- **Scope:** pure structured report API around existing layout/publication validation; expose supported collider/transform constraints; a small set of representative movement/support fixtures and report issue codes with source IDs. Distinguish schema failure, unsupported shape, unproven reachability and human review. Do not label a route “complete” from static support checks.
- **Dependencies:** merged PR #16 only.
- **Likely modules:** game-content `layout-override.ts`, `colliders.ts`, `published-cosmic.ts`; proposed `level-validation.ts`; `tools/level-editor/validate-published.ts`; existing movement/editor tests in game-engine and game-simulation.
- **Acceptance:** unchanged default world/gameplay revision; invalid/missing owner/source/landing cases have actionable stable diagnostics; deterministic report for identical data; current moving supports, bounce/turbo and action locks represented by fixtures.
- **Targeted tests:** report determinism and known-invalid imports; parent-local collider compilation; normal jump/landing/support fixture; no changed physics constant or unrelated snapshot churn. TypeScript and changed-module lint.
- **Risks:** overclaiming reachability; accidentally changing compilation order/hash while wrapping validation.
- **Exclusions:** physics tuning, new arenas/assets, generalized prefab schema, browser performance work, full browser suite.

### PR 2 — Safe local playtest entry and grid placement

- **Goal:** reproduce section problems quickly and place objects precisely.
- **Scope:** Playtest start at selected supported surface or checkpoint; explicit local reset state/clock; opt-in grid snap with configurable step; keep existing default start and translation behavior. Surface snapping/alignment beyond a validated start point follows in PR 5.
- **Dependencies:** PR 1 diagnostics.
- **Likely modules:** `game-engine/src/editor.ts`, `game-ui/src/playtest.ts`, engine localArena/debug entry interface and editor-history tests.
- **Acceptance:** unsafe/decorative/occupied starts rejected; zero velocities/actions/boost, no competitive result/unlock/network mutation; draft/history/camera restored on exit; snap applies once per drag transaction and preserves collider-local offsets.
- **Targeted tests:** safe/unsafe start, restart/exit preservation, grid rounding and Undo/Redo; one focused browser section-entry smoke; TypeScript.
- **Risks:** starting above an unsupported plane; accidental carryover of checkpoint/protection; new debug input accepted by server.
- **Exclusions:** teleport network commands, physics changes, general camera redesign, full mobile editor, checkpoint policy changes.

### PR 3 — Independent level registry and legacy publication adapter

- **Goal:** remove single-Cosmic coupling without changing an existing level.
- **Scope:** headless level registry/resolver and versioned document envelope; adapt current v4 Cosmic export/publication; shared gameplay/presentation identity contract; preserve three current races/training. Centralize source resolution instead of duplicating the layout compiler.
- **Dependencies:** PR 1; PR 2 can remain independent.
- **Likely modules:** `game-content/src/{rounds,layout-override,editor-catalog,published-cosmic}.ts`, proposed registry/schema files, `LevelManager`, editor document loading, protocol `WORLD_REVISION` and server/client arena selection where necessary.
- **Acceptance:** two independent test-only level documents resolve by ID; legacy round geometry and default fingerprint remain stable; client/server consume the same selected-level digest; physical mismatches fail join/resume, presentation-only edits do not spuriously change collision identity. No uncontrolled “latest prefab” resolution.
- **Targeted tests:** v1–v4 migration, registry resolution/unknown IDs, all current arena outputs, digest mismatch and prediction/server selected-level equality. Focused editor load/export smoke if UI selection is touched.
- **Risks:** dependency cycles, mixed-version joins, global epoch missing changes to a non-Cosmic arena. Any wire change must be explicit/versioned.
- **Exclusions:** randomized tournament rotation, new production course, dynamic remote content download, database, new mechanics.

### PR 4 — Headless section prefab/compiler MVP

- **Goal:** reuse self-contained sections safely.
- **Scope:** stable definition/version/instance IDs, local owners and collider associations, entry/exit anchors, explicit connections, route/marker/environment data; translation-only gameplay section transforms; deterministic expansion/source map. Two tiny fixture prefabs, not a production redesign.
- **Dependencies:** PR 3.
- **Likely modules:** proposed `game-content/src/level-factory/{schema,compiler,connections}.ts`, source/collider resolver, static report integration.
- **Acceptance:** duplicated instances have unique IDs and no cross-bound references; exact pinned version resolution; collider values remain owner-local; anchors compile into consistent world positions; missing links/unsupported rotation/scale fail atomically; unchanged legacy adapter output.
- **Targeted tests:** deterministic repeated compile, instance duplication/remapping, XYZ translation, parent-relative collider positions, dependency deduplication, invalid ports/transforms and version mismatch.
- **Risks:** pretending arbitrary yaw/scale is safe for world-axis mechanisms; losing array-order semantics or shared collapse IDs.
- **Exclusions:** arbitrary rotation, nonuniform section scale, slopes/mesh physics, runtime procedural arena generation, editor overhaul.

### PR 5 — Section authoring, surface snap and alignment

- **Goal:** let the owner refine prefab assemblies interactively.
- **Scope:** section catalog/instance placement, connector snapping and instance/contents selection; local overrides/revert; surface placement on compiled walkable geometry; small align tools; transactional duplicate/move/delete. Existing decoration groups stay separate.
- **Dependencies:** PR 4; builds on PR 2.
- **Likely modules:** `editor.ts`, inspector/selection/history adapters extracted only as needed, layout source-map integration, editor CSS.
- **Acceptance:** placement/port mismatch is visible; surface snap ignores unsupported decorative meshes; duplicate remaps internal refs and requires explicit external reconnect; Undo restores a section and its links in one action; export/import retains overrides/version pins.
- **Targeted tests:** section operation history, source maps/collider relationships, align/snap validity; one focused browser add/connect/move/duplicate/revert/export/import flow.
- **Risks:** stale inspector selection, snapping art rather than physics, accidentally applying a child edit to the shared definition.
- **Exclusions:** nested arbitrary groups, phone authoring redesign, baked lighting, automatic creation of bridges or changes to existing Cosmic Sprint.

### PR 6 — Conservative bot route editor and reachability evidence

- **Goal:** produce editable, demonstrably traversable mandatory routes.
- **Scope:** waypoint/branch overlays and constrained route editing; support/connection diagnostics; headless legal-input bot runs with phase/seed/stall/fall report. Accept only route semantics supported by current follower initially; add wait semantics only if a confirmed section needs them, with shared tests.
- **Dependencies:** PR 4; UI integrates PR 5 selection/source maps.
- **Likely modules:** editor route adapter, `game-simulation/src/navigation.ts`, server `bots.ts` if required, publication validator, proposed `tools/level-editor/validate-routes.ts`.
- **Acceptance:** every mandatory stage connects entry/exit; invalid airborne waypoints rejected; real inputs complete representative safe routes without teleports; report distinguishes static support from successful replay and finite phase coverage; human-only risky routes labeled. Owner settles new-level checkpoint/progress policy before branching publication.
- **Targeted tests:** waypoint edit/undo/JSON, unsupported routes, stall detection, boundary start phases, bot completion of fixtures and server/prediction replay when any shared rule changes.
- **Risks:** adaptive planner scope creep; false proof from a single phase; optional-checkpoint progress bias on branches.
- **Exclusions:** general navmesh, machine learning, bot position correction/cheats, guaranteed arbitrary-level solution.

### PR 7 — Mechanism timeline and authoring validation panel

- **Goal:** inspect timing and publish actionable evidence in the editor.
- **Scope:** play/pause/scrub of shared mechanism time, explicit collapse trigger preview; actual visual/collider overlays at the same phase; report panel linking issues to objects/ports/routes, export report with input digest. Preserve separate Environment presentation time semantics.
- **Dependencies:** PRs 1, 5 and 6.
- **Likely modules:** editor preview adapter, `collider-overlays.ts`, `cosmic-scene.ts`, shared `sampleMechanism` consumers and report UI.
- **Acceptance:** scrub never mutates authoritative race/playtest state; warning/active/hidden and moving support visuals match collision samples; report click focuses the responsible object; unverified checks stay unverified; history unaffected by playback.
- **Targeted tests:** boundary phase samples and overlay poses, collapse reset, report/source navigation; one focused browser scrub/Playtest/exit smoke.
- **Risks:** two phase clocks, sampling trigger-dependent mechanics incorrectly, timeline state leaking into exported gameplay.
- **Exclusions:** general cinematic editor, keyframed physics, heatmap telemetry service, new effects or lighting changes.

### PR 8 — Cosmic Sprint 2.0 reviewed section assembly

- **Goal:** validate the entire production loop on one distinct polished course.
- **Scope:** the five-section brief, existing prepared assets and supported mechanisms, explicit safe/risky routes/checkpoints, owner refinements, evidence and registry entry. Build/review the first section before composing all five. Default tournament selection remains unchanged until approved.
- **Dependencies:** PRs 2–7 and owner decisions in the brief. Hardware evidence is required for device performance claims, not a reason to silently degrade art.
- **Likely modules:** new level/section data in game-content, dependency manifest, route fixtures, focused browser traversal and design notes. Existing physics/character/other arena data should not change.
- **Acceptance:** all five connections validate; safe route can finish without Dive; mandatory bot route completes across declared phases; no unsupported walkable art; reviewed respawns/finish; authority/digest tests pass; owner approves gameplay/composition. Publish a new level ID with rollback; no automatic replacement/merge.
- **Targeted tests:** static report, section route replays, selected eight-player authoritative completion/reconnect regression, one focused desktop/touch browser traversal of changed content. This future content PR has its own agreed check budget; do not launch those checks during this audit.
- **Risks:** expanding to five new mechanics, art-first placement outside supported physics, declaring polish without human/device review.
- **Exclusions:** redesigning legacy Cosmic Sprint automatically, arbitrary character optimization, rewards/accounts, native Android or broad rendering rewrite.

## 4. Work after the first eight PRs

- Complete Phase 3 art iteration in small follow-ups based on actual owner feedback, not a monolithic “polish everything” PR. Dedicated action clips require the artist asset contract in `docs/action-animation-asset-spec.md`; current approved temporary poses remain until replacement review.
- Produce levels 2–3 with contrasting route density, pacing and atmosphere using the same factory. Track authoring time, report failure classes and prefab reuse before committing to all ten. New mechanisms are separate shared-simulation PRs with fixtures and one representative section.
- Add atmosphere presets with bounded shared materials/lighting configuration, reviewed visuals and explicit device evidence. Existing fixed lighting is a good baseline, not a final limitation on ambition.
- Add optional local playtest heatmaps (falls/hits/stalls/route choice) before network analytics. Define sampling, privacy/retention and consent for any transmitted telemetry.
- Add measured multiplayer presentation smoothing, spectator controls and release operations without changing championship ordering accidentally. Preserve all-DNF/null times, empty-final completion and reconnect/rematch regressions.
- Treat Android packaging, host authentication, durable results and any economic integration as separate product/security decisions.

## 5. Approval and release decisions

Decisions needing owner approval before dependent implementation:

1. **Course identity:** ship Cosmic Sprint 2.0 as a new ID first (recommended) or replace the existing race after an explicit review; default three-round rotation remains unchanged meanwhile.
2. **Checkpoint/progress policy:** preserve optional checkpoints for legacy content; decide monotonic progress/respawn behavior and branch ranking for new levels. Decide whether successful final finish remains independent of checkpoints.
3. **Crowd interactions:** keep players non-solid for the MVP (recommended) or separately fund player-player collisions/grab mechanics and authority/prediction work. No such mechanic is required by this brief.
4. **Device/loading envelope:** exact Redmi-class hardware/browser, target higher-end phones, cold-load network envelope and acceptable package size; agree proposed frame-time gates after first physical samples.
5. **Art resources:** existing prepared assets for initial sections, dedicated action animation delivery, and the budget/approval boundary for any new assets/lighting experiments.
6. **Release product:** Telegram/Web first (recommended), Android wrapper versus native distribution later; accounts/results retention and deployment hosting capacity.
7. **Economics:** whether/when to pursue P2E, identity/abuse controls and legal/security review; no financial implementation follows merely from the existing MDS bridge.

No confirmation is required to finish this analysis PR. These are future implementation dependencies, not requests to interrupt the audit.

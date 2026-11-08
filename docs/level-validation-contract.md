# Level validation contract (Level Factory PR 1)

This is a read-only static diagnostic layer over existing v1–v4 Cosmic Sprint layouts and compiled `ArenaConfig` data. It introduces no level registry, prefab/connection schema, geometry, physics rule, editor UI or protocol change. `valid: true` means **no blocking static diagnostic**, not certified reachability, safety or publication approval.

## Shared APIs and data

`@minimorph/game-content` exports:

- `validateLevelLayout(unknown)` — diagnose source/ID/collider/transform failures, invoke existing `validateLayout`/`applyLayout`, then inspect their compiled data. Inputs are cloned before the legacy parser can normalize collider data.
- `validateCompiledLevel(ArenaConfig)` — inspect an existing typed compiled arena: manifest references, owner bindings, supports, markers and navigation. It does not parse arbitrary untrusted arena JSON or load GLBs.
- `validateLevelPublication(unknown)` — include diagnostics for the proposed routes and call the unchanged `validatePublication` review gate. A revision can be present even when additional static diagnostics block the CLI.
- `formatLevelValidationReport(report)` — human-readable text. The plain report itself is JSON-serializable.

Reports contain `schemaVersion: 1`, `phase: "static"`, `arenaId`, `valid`, optional legacy `revision`, and `diagnostics`. Each diagnostic has stable `code`, `severity`, explanation, optional `objectId`/`colliderId`/`sectionId`/`routeId`/`connectionId`/`path`, measured/configured `values`, and a suggested correction. Section/connection references are reserved optional context fields; no section connection model or connection solver is implemented.

Ordering is deterministic: severity (error, warning, unverified), code, object, collider, route, path, then serialized diagnostic as a tie-break. Comparison is locale-independent. No clock, random ID or input/world mutation participates.

The exact existing `surfaceContains` predicate was relocated from game-simulation to game-content and re-exported from its old simulation path. Simulation and diagnostics therefore use the same rectangle/circle containment rules. Formulae/constants and simulation stepping are unchanged. Diagnostic supports use the compiled physical arrays, never visual GLB bounds. Moving/timed supports are considered only at their configured pose and explicitly marked conditional; this is not a phase sampler or collision simulator.

## Diagnostic codes

| Code | Severity | Meaning |
| --- | --- | --- |
| `INPUT_INVALID` | error | CLI read/JSON/argument failure |
| `LAYOUT_INVALID` | error | Existing layout parser rejected the input; compilation did not proceed |
| `SOURCE_MISSING` | error | Source is absent from the trusted catalog/base layout |
| `ASSET_MISSING` | error | Compiled model/part is absent from the prepared runtime manifest |
| `OBJECT_REFERENCE_INVALID` | error | Missing/duplicate object ID, stale group/owner/physical/visual reference |
| `COLLIDER_INVALID` | error | Existing collider parser rejects type/properties/ID/count |
| `COLLIDER_DIMENSIONS_INVALID` | error | Invalid bounded collider field or compiled primitive coordinates/dimensions/period |
| `TRANSFORM_UNSUPPORTED` | error | Source transform restrictions, or unequal X/Z scale with rotated/circular local collider unsupported by the current compiler |
| `WALKABLE_SURFACE_MISSING` | error | Platform source has no compiled landing surface |
| `DECORATION_NON_COLLIDABLE` | warning | Explicit decorative placement has no collision; it must not be assumed walkable |
| `MARKER_SUPPORT_MISSING` | error | Spawn/finish/enabled checkpoint centre lacks configured landing support at its height |
| `MARKER_EDGE_SUPPORT` | warning | A cardinal sample at the marker region edge lacks stable support; not a full footprint/clearance proof |
| `SUPPORT_PHASE_UNVERIFIED` | unverified | Marker/waypoint relies solely on moving/timed/contact-triggered support |
| `WAYPOINT_UNSUPPORTED` | error | Waypoint lacks configured support under the existing publication height tolerance |
| `ROUTE_INVALID` | error | Invalid route structure, duplicate ID, stage or insufficient points |
| `ROUTE_STAGE_MISSING` | error | No route for a checkpoint stage in an arena with authored navigation |
| `PUBLICATION_REVIEW_REQUIRED` | error | Unchanged publication/navigation review gate blocks the candidate |
| `PUBLICATION_INVALID` | error | Other rejection by the existing publication validator |
| `CONNECTIONS_UNVERIFIED` | unverified | Current section metadata has no anchor/connection contract; seams/gaps are not certified |
| `REACHABILITY_UNVERIFIED` | unverified | Jump range, route/bot completion, hazard phases and recovery safety require simulation |
| `PLAYTEST_UNVERIFIED` | unverified | Asset decode/art agreement, clearance, crowd spawn offsets and perceived safety require Playtest |

This layer intentionally exposes an unsupported transform even if legacy import accepts it. It does **not** modify that parser, its compiled result or runtime physics. General slopes, shear/elliptical collision, arbitrary mechanism rotation and section connectivity remain outside this PR.

## CLI

Build just the headless CLI tool (not either application):

```sh
npx esbuild tools/level-editor/validate-published.ts --bundle --platform=node --format=esm --outfile=/tmp/minimorph-validate-published.mjs
```

Choose one invocation:

```sh
node /tmp/minimorph-validate-published.mjs
node /tmp/minimorph-validate-published.mjs candidate-publication.json --json
node /tmp/minimorph-validate-published.mjs exported-layout-v4.json --layout --json
```

Default input is the existing published Cosmic Sprint JSON. Default mode is publication validation; `--layout` explicitly selects a bare existing layout. Text and JSON contain the same diagnostics. Exit code is 1 for any error (including malformed input), otherwise 0. Warnings and unverified checks do not themselves fail static validation. No auto-review hash generation/approval, publication or editor write occurs.

## Examples

**Valid static data, traversal unverified.** The supported floor/spawn/finish/stage-0 route fixture in `level-validation.test.ts` returns:

```json
{
  "schemaVersion": 1,
  "phase": "static",
  "arenaId": "cosmic-sprint",
  "valid": true,
  "diagnostics": [
    { "code": "CONNECTIONS_UNVERIFIED", "severity": "unverified", "message": "Existing section metadata has no connection/anchor contract. No section adjacency or gap reachability is certified.", "suggestion": "Review seams in Playtest; connection validation depends on a future section schema." },
    { "code": "PLAYTEST_UNVERIFIED", "severity": "unverified", "message": "Asset decode, visual/collider agreement, head clearance, spawn crowd offsets and player-perceived safety require Playtest.", "suggestion": "Review the actual level in desktop/touch Playtest." },
    { "code": "REACHABILITY_UNVERIFIED", "severity": "unverified", "message": "Static support checks do not prove jump range, route completion, bot completion, hazard timing or recovery safety.", "suggestion": "Run shared-simulation legal-input traversals at documented initial states and phases." }
  ]
}
```

**Invalid collider.** A v4 platform instance `editor-test` with local collider `body` width −1 produces `valid: false`, `LAYOUT_INVALID` and the attributed diagnostic below (excerpt; full report also contains bounded configured collider values):

```json
{
  "code": "COLLIDER_DIMENSIONS_INVALID",
  "severity": "error",
  "objectId": "editor-test",
  "colliderId": "body",
  "path": "objects[0].colliders[0]",
  "message": "Invalid collider width."
}
```

**Existing published data: an exposed pre-existing route issue.** The one focused CLI run for this PR produced `valid: false`, unchanged revision `95476a6fcdcc57ce`, one blocking `WAYPOINT_UNSUPPORTED` for route `carousel-crossing`, point `(48, 0.2, -155)`, plus the three global unverified checks. The point is outside both configured rotating discs: distance √136 ≈11.662 from disc A (radius 11) and √145 ≈12.042 from disc B (radius 12). No static deck supports that point at its configured height. This is an authored waypoint support issue, not proof the entire route is impossible; the path follower need not touch each waypoint exactly.

The previous publication validator bypasses navigation checks for the untouched default publication. It continues to accept the default and generate the identical revision. The new CLI diagnoses the actual route rather than silently moving the point, relaxing the threshold, changing geometry or pretending the report is valid. Fixing/reviewing that waypoint belongs in a separate content/navigation PR. This expected diagnostic is asserted explicitly in tests.

## Verification and limitations

Targeted checks for this PR: 61 tests across validation, new shared-simulation baseline fixtures and existing physics/action/support/editor-v0.4 contracts; TypeScript; changed-file ESLint. One actual CLI execution (`--json`, default publication), with the pre-existing issue above. CLI text/JSON, valid/invalid exit behavior and malformed input are also covered using injected I/O, without additional processes or browser suites.

Baseline fixtures cover normal acceleration/braking, jump/landing, coyote/buffer, Dive/Slide/Recovery held-input locks, moving support, floating bounce landing/launch, turbo expiry/non-stacking and optional/out-of-order checkpoint/respawn/finish semantics. Existing exact action-boundary tests remain unchanged. No constants or simulation outcomes were adjusted to satisfy the new tests.

Limitations: manifest presence is not file/network/GLB integrity; marker centre/cardinal-edge support is not full character clearance or hazard safety; dynamic supports are not sampled through time; valid waypoints do not certify their connecting segments; no section connection checks can exist without a future section schema. Imported publication navigation remains subject to the original review contract. Reports do not replace simulation/Playtest or human review.

Follow-ups: separately review the carousel waypoint; add safe Playtest start placement; then multi-level/section contracts and route editing/phase-aware traversal validation in the roadmap order. Documentation PR #17 was still open when this branch was created: its four audit documents were read from `docs/technical-audit-level-factory`; this implementation is based on current `main` (`e7638a2`) and does not merge #17 automatically.

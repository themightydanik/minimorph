# Level Factory architecture proposal

Status: design only, 8 November 2026; based on `e7638a2` after PR #16. **Existing behavior** is linked below. All schema names, directories and APIs marked “proposed” are future work; none is implemented by this PR. See [audit](MINIMORPH_TECHNICAL_AUDIT.md) for maturity/evidence and [roadmap](GAMEPLAY_QUALITY_ROADMAP.md) for delivery order.

## 1. Design boundary

The reusable unit is a **gameplay section prefab**, not a copied arena file, a GLB or a decoration group. A level document assembles pinned section versions, instance overrides and explicit connections. One deterministic headless compiler emits the existing `ArenaConfig` representation. The editor, browser Playtest, multiplayer server and offline validators must consume the same compiler output.

Preserve these current systems:

- [ArenaConfig](../../packages/game-content/src/arenas.ts) and [arena registry/buildRound](../../packages/game-content/src/rounds.ts): runtime surfaces, mechanisms, markers, sections and routes.
- [Local collider compilation](../../packages/game-content/src/colliders.ts): owner transform + local collider transform → authoritative surfaces/mechanisms; `colliderOwners` preserves picking associations.
- [Shared simulation](../../packages/game-simulation/src/physics.ts) and [mechanism sampler](../../packages/game-simulation/src/obstacles.ts): authoritative semantics remain here, not inside editor entities or prefabs.
- [Environment schema/group tools](../../packages/game-content/src/environment.ts), [renderer](../../packages/game-engine/src/cosmic-scene.ts), [history](../../packages/game-engine/src/editor-history.ts) and [publication review](../../packages/game-content/src/published-cosmic.ts).

Current constraints matter: layouts are Cosmic Sprint overrides; decorative groups exclude arbitrary mechanisms; checkpoints have editable radius/enabled but fixed positions; some physics, bots and camera sections assume progress along negative Z; several mechanism behaviors use world axes. A section system must expose these restrictions rather than hide them under a generic 4×4 transform.

## 2. Proposed data and ownership

Proposed home: `packages/game-content/src/level-factory/` for schemas, migration, compiler, manifests and static validators. Pure simulation validators can live in game-simulation or a headless tool importing it. No PlayCanvas, DOM, network requests or runtime asset downloads in the compiler. Avoid a new package until there is a real dependency boundary requiring it.

| Document | Owns | Does not own |
| --- | --- | --- |
| Asset catalog | Stable model/part IDs, bounds, supported collision templates, provenance/dependencies | Player state, instance transforms or remote URLs supplied by arbitrary imports |
| SectionDefinition | Pinned ID/version, local owners/colliders/mechanisms, anchors, routes, optional markers/decor/audio/VFX intent | Physics implementation, client authority, duplicated embedded GLBs |
| SectionInstance | Stable instance ID, definition reference, admissible transform, typed sparse overrides | A mutable pointer to “latest” prefab |
| LevelDocument | Level identity/version, ordered instances, connections/route graph, spawn/finish, checkpoint policy, atmosphere preset, loose objects | Live room state, secrets, results, render-quality auto reduction |
| CompiledLevel | Runtime `ArenaConfig`, owner/source map, dependencies, gameplay/presentation digests, diagnostics | Authoring UI or editable simulation state |
| ValidationReport | Compiler version/content digests, issues, phase coverage, replay artifacts, human approvals | A claim that a reviewed hash proves fun or full route completion |

### Illustrative section schema

This is a **schema sketch**, not valid current v4 JSON. Required definitions/colliders use the existing primitive vocabulary; real numeric presets must be validated against it.

```json
{
  "schemaVersion": 1,
  "id": "park.rotor-plaza",
  "version": "1.0.0",
  "theme": "timing-and-route-choice",
  "difficulty": "introductory",
  "transformPolicy": "translation-only",
  "anchors": {
    "entry": { "position": [0, 0, 0], "forward": [0, 0, -1], "width": 10 },
    "exit": { "position": [0, 0, -44], "forward": [0, 0, -1], "width": 10 }
  },
  "owners": [
    {
      "id": "deck",
      "sourceId": "catalog:main-floor-tile",
      "transform": { "position": [0, 0, -22], "yaw": 0, "scale": 1 },
      "dimensions": { "width": 12, "depth": 44 },
      "colliders": [
        { "id": "body", "kind": "surface", "x": 0, "y": 0, "z": 0,
          "yaw": 0, "width": 12, "depth": 44, "height": 0.1 }
      ]
    }
  ],
  "mechanisms": [],
  "checkpoints": [],
  "routes": [
    { "id": "safe", "skill": "easy", "entry": "entry", "exit": "exit",
      "points": [[-3, 0, 0], [-3, 0, -22], [0, 0, -44]] }
  ],
  "environment": [],
  "presentation": { "audioPreset": "park-default", "vfxPreset": "park-default" },
  "validation": { "requiredRoutes": ["safe"], "minimumLandingWidth": 3 }
}
```

A real plaza definition would add approved hammer mechanisms and a risky route; the sketch demonstrates ownership only. Mechanism definitions must bind to stable owner/local IDs and existing typed parameters, rather than independently adding a duplicate invisible collision object. Version locks are exact; editing 1.0.0 does not alter existing levels. A new section release is 1.0.1/1.1.0/etc and upgrading an instance is explicit with a diff/report.

### Illustrative level assembly

```json
{
  "schemaVersion": 1,
  "levelId": "cosmic-sprint-2",
  "version": 1,
  "instances": [
    { "id": "launch-a", "section": "park.launch@1.0.0",
      "transform": { "position": [0, 0, 0], "yaw": 0, "scale": 1 } },
    { "id": "plaza-a", "section": "park.rotor-plaza@1.0.0",
      "transform": { "position": [0, 0, -40], "yaw": 0, "scale": 1 } }
  ],
  "connections": [
    { "from": "launch-a/exit", "to": "plaza-a/entry", "mode": "walk" }
  ],
  "spawnAnchor": "launch-a/spawn",
  "finishAnchor": "plaza-a/exit",
  "atmospherePreset": "galactic-park-day"
}
```

Full levels require supported spawn/finish pads, complete route/checkpoint metadata and all required schema fields. This abbreviated example is not a committed new level or an instruction to modify the existing course.

## 3. Deterministic compilation

Proposed pipeline:

1. Validate and migrate the document; reject unknown executable fields, invalid IDs, nonfinite values, excess limits and unresolved definition versions.
2. Resolve pinned definitions and trusted catalog assets. Build a dependency set by asset/part/material variant; never concatenate GLB copies into each prefab.
3. Expand instances in stable explicit order. IDs derive from `instanceId/localId`, with collider IDs additionally namespaced. No random IDs, wall time, browser-dependent bounds or runtime GLB inspection in compilation. Editor UUID creation occurs once when authoring and is serialized.
4. Apply instance overrides in prefab-local coordinates, then validate transform capabilities. Owner references, connections and route IDs must survive duplicate/reinstantiate/export.
5. Compile local owners with the existing collider compiler logic through a generalized source resolver. Preserve the local collider definitions in authoring data and owner bindings in runtime output.
6. Resolve connections, route graphs and checkpoint IDs into the runtime stage/index representation. Emit current `sections` and `navigation` arrays as derived compatibility data, not a second hand-edited source of truth.
7. Emit compiled arena, dependencies, source map, bounds, separate identities and a structured report. Repeated compilation of the same inputs must be byte-stable after canonical serialization.

Keep the old `applyLayout` API as a compatibility adapter initially. Generalize resolution/base-arena inputs internally rather than copying its implementation into `compileLevel`. Add serialization/compiler tests before splitting the large editor controller into document, selection/history, inspector and viewport adapters. Refactor only seams needed by the current PR.

### Coordinate and collider rules

Y is up, metres, yaw is radians, nominal course forward is −Z. Existing owner transform convention is:

`worldX = ownerX + cos(yaw) * localX * scaleX + sin(yaw) * localZ * scaleZ`

`worldZ = ownerZ − sin(yaw) * localX * scaleX + cos(yaw) * localZ * scaleZ`

`worldY = ownerY + localY * uniformScale`.

Compose section→owner→collider using one tested helper; do not add world offsets into stored collider-local values. Stable maps connect inspector selection to the same compiled collider used in simulation. Decorations remain non-collidable unless an explicit supported gameplay owner is authored; Environment stays strictly presentation-only.

**MVP transform policy:** move entire gameplay sections in XYZ; require section yaw=0 and scale=1 for mechanism-bearing sections. Existing independent owner transforms retain their current permitted behavior. Presentation-only groups retain existing rotation/scale.

**Incremental extension:** static-only sections may later support yaw and uniform scale after transform/connection/reachability tests. Arbitrary pitch/roll, nonuniform section scale, or rotated local colliders under nonuniform parent scaling can imply slopes/shear that current primitives cannot represent. Reject them, do not silently approximate. Rotating mechanism-bearing sections additionally requires explicit axis/direction remapping: pusher displacement, moving-wall blocking, conveyor vectors, translating-platform axis and bot/camera assumptions. Do not advertise arbitrary rotation by merely changing model yaw. A later supported-transform capability table should state which combinations are exact.

Translation also needs constraints: existing fall recovery is global `y < -6`, spatial culling uses Z windows, and camera sections use `-player.z`. The first factory levels should stay in the validated height/progress envelope. Extending kill volumes and progress coordinates is a separate shared-rule change, not an invisible prefab side effect.

## 4. Connections, routes and checkpoints

An anchor is a usable opening with position, forward, width, supported height and clearance envelope, not just a point. Connectors declare `walk`, `jump` or `pad-launch`; required support owners, tolerances and landing zone are explicit. Walk connection checks compare actual compiled support edges and head clearance. Gap connections require simulation evidence; matching anchor positions alone does not prove connection.

Placement can solve the next instance translation from exit/entry anchor positions. The user explicitly accepts the connection; no silent bridge geometry is generated. Incompatible height/forward/width produces a diagnostic, not an arbitrary snap or rotation.

Multiple routes are explicit paths from entry to exit with branch/merge anchors, intended skill and mandatory/default bot route. The graph records progress through branches so risky shortcuts cannot gain fabricated checkpoint progress. Initially flatten conservative routes into existing `NavigationRoute[]` stages. The current follower chooses one route per stage and lacks a general graph/planner: accept only its supported subset until route-choice/wait semantics are implemented and tested.

Section checkpoint markers have stable IDs. The level compiler decides deterministic order and mapping into current checkpoint indices; duplicates get distinct namespaced IDs. Entry/exit checkpoints must be on safe surfaces outside hazard sweeps. Current game permits optional/out-of-order visits and completion without all checkpoints. Preserve the legacy policy. A new level policy for monotonic respawn/progress and branch fairness requires explicit design approval and shared simulation/protocol regression coverage.

For moving platforms, a route point may refer to a support-local location/time window in the future authoring model. Current publication only checks static authored support positions; do not accept arbitrary floating timed waypoints through the old validator. MVP factory routes must use supported static safe paths; mechanism shortcuts can remain human-only until timed traversal validation exists.

## 5. Editor integration and backward compatibility

- Keep current v4 import/export working for Cosmic Sprint. A versioned **level-document envelope** with a discriminant prevents confusing independent levels with v4 override files. Do not relabel a new schema as v4 or reinterpret old coordinates.
- Importing a legacy document pins its original base and stores overrides; old stable IDs remain mapped. Exporting back to v4 is allowed only for the supported single-Cosmic override subset; otherwise explicitly report unsupported data, never drop prefab/route information.
- A prefab instance has instance and “edit contents” selection modes. Override edits remain local and undoable. Revert restores definition values; detach bakes a copy only after a reviewable operation. No bidirectional auto-update of every placed instance.
- Section duplicate remaps internal owner/collider/route/anchor IDs and internal links atomically. External links require reconnecting; accidental duplicated cross-links must fail validation. One section drag is one history action.
- Existing decorative groups remain independent metadata. Lock/visibility is editor metadata for gameplay owners; hiding a physical section must not remove its collision from a published world.
- Environment animations sample presentation time only. A mechanism timeline samples `sampleMechanism` at explicit preview time and drives both actual GLB pose and collider overlays; it never mutates race state. Trigger-dependent collapse preview needs an explicit trigger event, not inferred editor wall time.
- Start-anywhere Playtest uses a validated support point, zero velocity/action/boost and a deliberate checkpoint/clock context. It remains local/debug only and cannot generate competitive results, unlocks or network position commands.

## 6. Publication and consistency

Proposed committed artifacts: level documents and pinned section definitions in game-content, a generated/validated level registry manifest, and small validation reports referencing exact input digests. Runtime compilation may remain build-time or deterministic module initialization initially; do not maintain two compilers. Generated files should be reproducible and checked for staleness.

Publish through a normal PR with: document and section diffs, compiled geometry/route summary, dependency diff, static report, simulation replay evidence, focused browser result and human playtest sign-off. No editor token, direct GitHub write, automatic live publication or change to existing Cosmic Sprint is necessary.

**Identity split:**

- Authoring identity includes groups, locks, visibility and prefab/source versions.
- Gameplay identity includes collision arrays and their significant order, triggers, markers, routes/progress policy, time/phase parameters, simulation revision and registry selection. Canonical rounding must not hide meaningful geometry changes. Avoid sorting physics arrays when first-match/tie behavior makes order significant.
- Presentation identity includes asset versions/parts, environment, animation, atmosphere/audio/VFX presets; a changed visual manifest requires compatible delivery but need not invalidate collision prediction.

Current FNV64 fingerprint is a compatibility marker, not security. Existing `WORLD_REVISION` hashes the Cosmic publication plus a manual simulation epoch; other arenas are covered only through that epoch convention. For multiple published levels, include a canonical per-level gameplay digest map plus explicit simulation revision in the join/readiness contract, or advertise the selected level's digest with an agreed registry revision. Preserve wire v2 until a real message shape change requires a deliberate version bump; never weaken rejection of unknown/mismatched worlds. Agree the migration in a focused protocol PR.

Static server consumption must not import PlayCanvas, assets via network or browser URLs. Both clients and server compile the same pinned definitions, compare digests and reject mismatches before prediction. Keep a paired frontend/server release artifact or deployment procedure. Content rollback restores the previous document/definition/manifest set and matching server build, not just a frontend URL.

Audio/VFX/lighting references use trusted named presets and bounded typed parameters. They do not carry scripts or spawn physics. Shared assets are loaded once per appropriate resource owner with existing cleanup/retry guarantees; optional visual failures must not block authoritative simulation readiness. Any asset dependency needed to see a walkable surface is gameplay-critical visually even though its bytes are excluded from collision identity.

## 7. Feasible automated validation

Proposed report fields: `levelId`, input/compiler/simulation versions, gameplay/presentation digests, issues with stable code/severity/source IDs, phase/route coverage, replay seed/input artifact, and separate human review status. Each issue identifies a fixable owner/connection. Categories are **error** (cannot compile/publish), **warning** (bounded review required) and **unverified** (no evidence). Passing a check never erases untested route/phase coverage.

| Check | Deterministic static checks | Simulation-based checks | Browser / human limits |
| --- | --- | --- | --- |
| Assets | Trusted asset/part resolution, manifest presence/hash reference, dependency uniqueness, bounds and budgets | Not a physics concern | Browser confirms decode, materials, missing requests and actual GLB silhouette; human assesses composition. |
| Colliders | Finite positive dimensions, supported kind/properties, owner references, transform capability, duplicate IDs, required walkable surfaces | High-speed contact, side blocking, landing/edge/support transfer | Human confirms invisible walls, acceptable seams and obvious art mismatch. |
| Section connections | Anchor references, tolerances, overlap/gaps/clearance, supported height | Traverse entry→exit under valid input profiles, both directions only where intended | Human judges route readability and recovery space; numerical touching is insufficient. |
| Spawn/finish/checkpoints | On supported safe surfaces with full player clearance; no immediate hazard sweep; IDs/order/enabled policy | Spawn/drop, checkpoint activation/respawn and finish reachability; restart clears state | Browser confirms camera and signage; human tests intentional skips/backtracking. |
| Jump range/landing | Analytical upper bound from constants as an early impossibility filter, route slope/height limits | Actual 120 Hz trials from specified initial speed, air control, takeoff window and landing footprint; turbo/pad/support profiles separately | Cannot prove every human trajectory; conservative safe envelope and measured success window needed. |
| Moving obstacles | Period>0, valid warning/active windows, swept bounds, safe waiting zones | Fixed start-phase samples + boundary times; legal controller/bot traversals and escape from recovery | Finite sampling does not prove all phases; coupled/collapse events depend on player contacts. Human fairness review remains required. |
| Bot navigation | Required entry→finish path/stage coverage; waypoints supported by the intended owner, valid branch/merge references | Run all intended bot profiles using actual inputs; record stalls, falls, checkpoints, completion over selected phases/seeds | Bot success is not human fun; one fast bot run does not prove robustness for eight participants. |
| World consistency | Same ordered compiled data/digests in headless browser bundle and server; explicit simulation revision | Replay identical commands/snapshots and compare state fields; include shared collapse/contact state | Browser exercises reconnect and presentation but does not replace headless equality tests. |
| Asset/draw budgets | Unique dependencies, estimated instance/material/pulse variants, triangles and texture dimensions versus reviewed budgets | Not sufficient to estimate driver cost | Browser captures actual draws/visibility/texture counters; physical devices needed for memory/FPS. |

Use current tests and pilots as fixtures, not as an unconstrained solver. A later input search can find candidate jumps but must report its initial state and searched action space. It cannot certify impossible routes by timeout alone. Deterministic simulation validators should operate on compiled worlds, not approximate editor-only collision math.

Browser Playtest should remain focused: load, traverse the changed section, verify geometry/animation/controls, export/import, and dispose/re-enter. Authority/protocol tests are triggered by changes to shared rules or registry, not by every decorative edit. Human playtesting covers visual excitement, fairness, crowd readability, skill progression, route choice, perceived latency and fatigue. These cannot be reliably replaced by static validation, bots, screenshots or AI judgment.

## 8. Factory operating loop

1. ChatGPT and owner choose theme/rhythm and fill the brief template; owner settles gameplay policy/art direction.
2. Codex checks the vocabulary, creates only supported pinned section data/mechanics in a scoped PR and attaches the first report. New mechanics get shared simulation tests before elaborate art placement.
3. Static checks reject unsafe documents. Simulation checks annotate proven routes, start phases and remaining gaps. No automatic “approved” flag from a digest.
4. Human opens a matching editor preview, refines collision/placement/composition and plays the section with safe restart points. Save the exported document; Codex reviews the diff and reruns only affected checks.
5. A complete level gets route/bot, authority/identity and physical-device evidence appropriate to its changes. Owner approves the actual playable result.
6. Codex publishes that reviewed data through a PR with rollback instructions and a matching server/client plan. Merge/release remains a separate explicit action.
7. Reuse pinned sections and assets for subsequent levels, tracking where each version is used. Promote lessons into prefab defaults only through a new version and explicit instance upgrade.

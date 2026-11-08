# Independent level registry and legacy compatibility

Level Factory PR 3, based on `c27b02f` after #19. This adds a headless registry/document boundary, not a Section Library, new course or multi-level authoring UI. The production catalog still contains exactly three races and three retained training arenas.

## Implemented document envelope

A document is JSON data with an explicit discriminator and schema version. It is never inferred from a legacy layout export:

```json
{
  "kind": "minimorph.level",
  "schemaVersion": 1,
  "levelId": "example-level",
  "version": 1,
  "metadata": { "name": "Example level", "description": "Planning example" },
  "geometry": { "type": "trusted-arena", "ref": "example:reviewed-v1" },
  "assets": [],
  "publication": { "state": "draft" }
}
```

This illustration cannot resolve until the corresponding trusted compiled source is explicitly registered. The two independent runnable fixtures (`test-alpha`, `test-beta`) exist only in tests and are not published, packaged as courses or added to tournaments.

`parseLevelDocument` requires stable lowercase IDs (up to 39 characters, compatible with the existing network arenaId limit), a positive safe integer version, bounded metadata, unique prepared model dependency IDs and a trusted reference. URLs/scripts and unknown keys are rejected. Publication state is a declaration from code-reviewed registry data, not a human-review receipt or authorization to publish arbitrary JSON.

Implemented geometry refers to an existing, trusted **compiled ArenaConfig**. That source owns real geometry, spawn/finish/checkpoints, navigation, visuals/environment and supported mechanisms. Those fields are therefore already consumable through a resolved document, with no second collision compiler. They are **not inline document override fields** in schema v1.

Future inline markers/navigation/visuals, section instances, local overrides and validation-review receipts require an explicit later schema/compiler extension. Current attempts to use those fields receive `LEVEL_FEATURE_UNSUPPORTED`; empty arrays are not silently treated as working prefab support. Section instances are not implemented here.

## Registry and resolution

`LevelRegistry` receives explicit documents and `TrustedLevelSource[]` from compiled modules. Sources bind `ref → levelId → ArenaConfig`; they cannot be resolved from network locations or arbitrary executable callbacks. Construction checks document identity, duplicate level IDs/references, source binding and prepared-model dependencies (including all actually referenced environment/gameplay models). Missing, unknown or incompatible inputs throw `LevelRegistryError` with a stable code.

- `resolve(id, version?)`: exact registered document, compiled arena, dependency references, editor capability and identity. Omitting version selects the registry's sole active version for that ID, never a remote/latest-version lookup. Supplying a version must match exactly.
- `resolveDocument(value)`: parse and compare with the exact registered document/version. A changed unregistered document is rejected rather than applied to a production world.
- `resolveArena(id, version?)`: zero-allocation lookup used by `getArena`/physics prediction. It preserves original legacy object references, including `LevelManager.next()` index identity.
- `list()`: deterministic ID-sorted cloned document descriptors. This sorting never reorders physics arrays or the existing arena selection arrays.
- `isPublishedRace(id)`: explicit online eligibility, excluding unknown IDs, drafts and training aliases. MatchService and snapshot validation share it.

Registry definitions are recursively frozen when registered, protecting cached identities from mutation. Documents and descriptor arrays returned to callers are copies. Compiled arenas are shared read-only definitions; editor/local Playtest already clones data before authoring or simulation state changes. The registry has no runtime mutation API. Changing a level requires a new reviewed document/source set and a rebuilt matching release.

Current source references are `legacy:race:<arenaId>` and `legacy:training:<arenaId>`. Racing IDs remain `cosmic-sprint`, `orbit-chaos`, `gravity-mayhem`; registry training IDs are `training-cosmic-sprint`, `training-orbit-chaos`, `training-gravity-mayhem`. Their resolved runtime `arena.id` values stay unchanged. `getArena(id, 'training')` performs this explicit compatibility mapping; old callers and training progression namespaces need no migration.

The existing `arenas`/`trainingArenas` arrays, generation code and order are retained. No new public course is exposed by this PR. Future independently published levels add a reviewed source/document to the registry; online resolution no longer assumes every valid world must be a Cosmic Sprint override. A future production selector/catalog extension is separate from this registry-only foundation.

## Legacy/editor adapters

`adaptLegacyEditorLayout(value)` explicitly validates/migrates v1–v4 with the existing `validateLayout`. It returns a `legacy-cosmic-layout` **draft** wrapper with a registered base-document descriptor and the normalized v4 layout. That wrapper is not a new `LevelDocument` and is not an approved publication. Exporting its `.layout` preserves the existing v4 format. No draft layout is silently applied to another level.

`openEditorLevel(id, version?)` is the safe interface for future editor entry:

- Registered racing Cosmic Sprint returns `mode: 'legacy-cosmic-v4'`, its registered descriptor/arena and a detached copy of `publishedLayoutOverride` for the existing editing path.
- Other documents return `mode: 'read-only'`, a descriptor and an explicit unsupported-authoring reason. The v4 adapter cannot be assigned to unrelated source IDs.
- Unknown IDs/versions fail deterministically before opening anything.

The existing editor UI/mount path is unchanged and continues to edit Cosmic Sprint. No dropdown implying working independent-level editing has been added, so no new browser interaction is required in this PR. The adapter is tested headlessly, including legacy draft round-trips. Safe Playtest/Grid Snap from #19 and environment/group authoring are untouched.

## Three identities and the network migration

`SIMULATION_REVISION = 'tournament-v1-colliders-v4'` is the explicit semantic epoch for current simulation/sampling rules. Those rules are unchanged. A future shared-rule change must still deliberately bump this epoch.

Each resolved level has:

1. **gameplayDigest**: existing canonical `layoutFingerprint` over the simulation epoch, ordered surfaces/mechanisms/legacy hazards, spawn/finish/checkpoints, air control, navigation route IDs/stages/skills/points and bot branch selection fields. Array order is preserved because collision ties and route selection can depend on it. Visual/environment data, display labels, authoring groups/locks and document-only metadata are excluded.
2. **presentationRevision**: canonical identity of palette, visual/environment placements and animation presets, presentation sections/routes/labels, descriptive metadata and prepared asset-manifest references. Document metadata and declared asset dependencies are included by the registry. This is not a binary-file integrity certificate; existing asset verification and Vite content-addressed delivery remain separate.
3. **document version**: an authoring/publication pin, independently validated by resolution. A metadata-only version/title change need not invalidate collision compatibility.

The registry's gameplay manifest is the ID-sorted digest list of **published racing** levels. Drafts and offline training aliases have their own per-level identities but are not online joinable and are excluded from the network manifest. Presentation-only changes do not alter this gameplay manifest.

Wire messages remain **protocol v2**, with the same fields, strict parser and 64-character revision bound. The existing worldRevision string now has the form:

```text
<simulationRevision>-<legacyCosmicFingerprint>-r1-<publishedRaceManifestDigest>
```

It currently fits within the retained 64-character limit. The preserved legacy Cosmic publication fingerprint remains `95476a6fcdcc57ce`; its inclusion does not substitute for the new all-published-race manifest. Every registered online world's gameplay changes are now covered, including Orbit/Gravity.

**Deployment consequence:** old and new worldRevision strings intentionally differ. Deploy frontend and server from the same new commit. Old join/resume requests are rejected before room allocation/token rotation, and mismatched server snapshots are rejected before prediction/welcome callbacks. Wire v2 was not loosened or silently made tolerant of old gameplay. Existing reconnect sessions cannot cross a mixed-version release. An environment-only or other presentation-only rebuild using the same gameplay manifest can remain collision-compatible.

`Prediction.receive` rejects an unknown arena before mutating its state; client/server `getArena` resolve the same registry definitions. Snapshot validation also rejects unknown/training arena IDs. Tournament capacity, order, qualification, clocks, champion/DNF policy and room machinery are unchanged.

For rollback, restore the previous source/document/protocol revision set and deploy matching frontend/server builds together. Rolling back only one host build produces the intentional version rejection. No economic/authentication trust follows from these noncryptographic compatibility digests.

## Structured validation and CLI

`validateRegisteredLevel(idOrDocument, registry?)` extends PR #18 reports. Successful resolution attaches `level: { id, version, simulationRevision, gameplayDigest, presentationRevision }` to the existing static report; normal marker/route checks and unverified traversal/Playtest status remain intact. New errors are:

- `LEVEL_DOCUMENT_INVALID`: wrong discriminator/schema, malformed identity or metadata.
- `LEVEL_FEATURE_UNSUPPORTED`: future fields or an unavailable editor adapter.
- `LEVEL_UNKNOWN`: missing registered ID.
- `LEVEL_VERSION_MISMATCH`: requested version differs from the active pin.
- `LEVEL_DUPLICATE`: more than one document with the same ID.
- `LEVEL_REFERENCE_INVALID`: missing/duplicate/wrongly bound source or changed unregistered document.
- `LEVEL_ASSET_INVALID`: missing prepared dependency or incomplete compiled dependency declaration.

The existing CLI supports explicit `--document file.json` and `--level=registered-id` modes alongside unchanged publication/default and `--layout` modes; `--json` works with all of them. Modes cannot be combined. Reports and error exit statuses are covered through injected-I/O tests. A legacy export supplied as `--document` fails explicitly, rather than being reinterpreted.

The pre-existing carousel waypoint finding remains `WAYPOINT_UNSUPPORTED` when statically inspecting registered Cosmic Sprint. The legacy publication parser/review policy is unchanged and still accepts the default publication. Registration does not turn that known report error into a new rejection of previously accepted legacy publication data.

## Preservation evidence and verification

Before changing resolution, a headless baseline capture on `c27b02f` recorded the following fingerprints of the **entire ordered ArenaConfig**, including presentation. Tests assert them after registration, plus exact original object references. The existing canonical helper rounds finite numbers to 1e-9; these are compatibility fingerprints, not cryptographic proof.

| Mode | ID | Before and after |
| --- | --- | --- |
| race | cosmic-sprint | `fcfc39873df4c391` |
| race | orbit-chaos | `dd13c7c61e68e19c` |
| race | gravity-mayhem | `81a1a6e400ef2b27` |
| training | cosmic-sprint | `0e949b1f457d2a36` |
| training | orbit-chaos | `27c308f4dad00fac` |
| training | gravity-mayhem | `577b53ffc5bc8199` |

No geometry generator, published JSON, collision sampler/constant, controller, character/GLB asset or renderer is modified. Tests cover unknown/duplicate/missing sources, exact versions, two independent test-only documents, immutable references, asset declarations, display/environment versus physical identity, ordered collisions, legacy v1–v4 import/export, safe editor adapters, structured CLI reports, actual Room/Prediction replay equality in all three races, world mismatch and tournament edge cases.

Targeted verification: 71 tests pass across ten files, TypeScript and changed-file ESLint pass. An additional attempted `rounds.test.ts` run has two pre-existing failures: a recorded run is 54.64166666666421s rather than ≥60s, and the historical Cosmic Sprint full-round replay does not finish. An isolated copy of clean `c27b02f` with local package aliases reproduces both failures with the same results (2 passed/2 failed). They are not fixed or hidden by changing physics/data/fixtures in this PR.

No full suite, browser suite, app build, Android build, GLB processing or benchmark was run. There is no editor UI/rendering change requiring a browser smoke; headless adapter/legacy tests cover the actual changed surface.

## Section Library integration next

A later Section Library compiler can add a new geometry-reference variant/version that resolves pinned section instances into the same ArenaConfig/source-map/dependency representation. It should feed the existing registry and identity projection rather than duplicate physics, collision compilation or publication logic. Preserve ordered arrays and owner-relative collider definitions; static source registration must not become a remote script loader.

Future inline marker/navigation editing, per-instance overrides, connection validation and multi-level editor controls need their own compiler/schema/validation work. Do not populate a future field with fake support now. Cosmic Sprint 2.0 and new playable courses remain explicitly outside this PR.

# Cosmic Sprint 2.0 — design brief and reusable production template

Planning artifact only, 8 November 2026. No new level data is committed or published. Proposed new ID: `cosmic-sprint-2`; existing Cosmic Sprint and tournament order stay unchanged unless the owner explicitly approves replacement. The following coordinates, timings and success rates are **design hypotheses**, not measured gameplay evidence. Build with the proposed [Level Factory](LEVEL_FACTORY_ARCHITECTURE.md) after its required tools exist; see [roadmap](GAMEPLAY_QUALITY_ROADMAP.md).

## 1. Reusable level-design specification

ChatGPT drafts this specification with the owner. Codex checks it against actual supported primitives and returns explicit unsupported requirements before building. The owner judges fun, fairness and visual composition in the actual Playtest; a screenshot or passing bot does not substitute for that approval.

| Field | Required information |
| --- | --- |
| Identity | Stable level ID/version, base commit, exact section versions, intended mode/player count, new level versus replacement decision |
| Intent | Theme, reference qualities, target audience/difficulty, one-sentence player promise, estimated run-time range and how to measure it |
| Rhythm | Ordered sections with learning → test → choice → recovery → climax; expected time and failure/recovery cost for each |
| World contract | Metres, Y-up, −Z nominal progression; spawn/finish/kill limits, admissible section transforms, player/physics revision |
| Each section | ID/version, local bounds, entry/exit anchors/width/height/forward, geometry/colliders, mechanism types/parameters/phase, safe waiting/landing regions |
| Routes | Main/safe/risky entry→exit paths, branch/merge points, reward versus risk, minimum clear width, jump takeoff/landing windows, intended bot route |
| Checkpoints | Stable IDs, supported position/radius, policy for optional visits/backtracking, expected respawn, finish requirements |
| Visual composition | Foreground/gameplay/background hierarchy, prepared asset/part IDs, protected sightlines, atmosphere palette, environmental animation limits |
| Audio/VFX | Existing approved preset references, readable cues, bounded effects, no gameplay trigger hidden in presentation data |
| Bots | Required skill profiles/routes, supported waypoint owners, start phases/seeds, completion/stall/fall criteria, optional human-only shortcuts |
| Technical budgets | Unique dependencies, instances/material/pulse variants, target device/quality policy, measured versus proposed budgets |
| Acceptance | Static issues blocked, reproducible legal-input traversals, authority/digest checks, focused browser flow, human playtest checklist and review artifact |
| Delivery/rollback | Data/code files expected, validation report versions, owner export, paired client/server publication plan, previous manifest fallback |
| Exclusions/open decisions | Unsupported mechanics/assets, what will not be changed, questions blocking only dependent work |

A section specification must include a collision plan, not just a list of attractive GLBs. “Safe” means a forgiving intended route, not invulnerability. Codex should annotate the exact tested input/start state and report failures; it must not teleport bots, fabricate times or automatically simplify the art to pass a test.

## 2. Concept and rhythm

**Player promise:** race through a floating cosmic amusement park that teaches one clear action at a time, offers visible shortcuts and ends with a readable rotating finale.

- Eight participants; current non-solid player interaction and authoritative shared controller.
- Current jump/air control/Dive/Slide/Recovery, conveyors/turbo, pads, hammers and rotating discs. No new physics mechanic required for the first assembly.
- Five distinct sections, all primary entry/exit anchors at Y=0 and yaw=0 for the first compiler. Optional raised landings stay within explicit simulation-tested bounds. No arbitrary section rotation or slope/mesh collision.
- Desired ordinary finish window approximately 60–90 seconds; safe path somewhat slower, skilled risky path faster. These are targets to tune after legal-input and human runs. Do not claim target timing from straight-line distance alone.
- Rhythm: broad confident start → timing/route choice → fast momentum → recovery/launch play → controlled climax and wide finish.
- Failure should normally cost a few seconds and a short checkpoint retry. Exact median/P95 costs and success percentages need human evidence. No invisible global floor or extended forced waiting to stretch race duration.

## 3. Coordinate plan and connections

This plan is deliberately compatible with negative-Z progress and current global fall threshold. Coordinates are proposed **world** positions; section-local forward distance `d` maps to `worldZ = entryZ − d`. Section transforms are translations. All entry/exit forward vectors are `[0,0,-1]`.

| Section | Stable proposed reference | Entry / exit centre | Minimum port width | Intended rhythm/time hypothesis |
| --- | --- | --- | ---: | --- |
| 1 | `park.star-launch@1.0.0` | `(0,0,0)` → `(0,0,-40)` | 12m | Learn and accelerate, 8–12s |
| 2 | `park.hammer-plaza@1.0.0` | `(0,0,-40)` → `(0,0,-100)` | 12m | Read timing and choose, 13–20s |
| 3 | `park.turbo-boulevard@1.0.0` | `(0,0,-100)` → `(0,0,-164)` | 12m | Fast flow with a controlled merge, 10–15s |
| 4 | `park.bounce-garden@1.0.0` | `(0,0,-164)` → `(0,0,-212)` | 12m | Reset pace, optional launch, 13–20s |
| 5 | `park.orbit-finale@1.0.0` | `(0,0,-212)` → `(0,0,-268)` | 12m | Precision, then release, 12–18s |

Total hypotheses: 56–85s section traversal plus short branch/decision variation. Ports connect through full-width supported flat regions, without hidden gaps, vertical steps or hazards across the join. Visual seams can overlap, but physical duplicate surfaces must not cause unstable support priority. Connection reports should identify the actual owning surfaces.

Spawn proposal `(0,0,-4)` on a ≥12m-wide, sufficiently deep start deck supporting all eight server spawn offsets/rows. Finish proposal `(0,0,-264)`, radius about 1.7m, on a wide flat celebratory pad continuing to −268. Final approach and podium sightline remain free of obstructing scenery. Require actual 8-slot start and finish support checks, not only the central marker.

## 4. Section specifications

### 1 — Star Launch: confidence before pressure

- **Local envelope:** roughly X ±12m, d=0–40m, gameplay at Y=0. Broad launch deck narrows toward two clearly visible lanes; 6m of hazard-free exit deck.
- **Main geometry:** prepared `main-floor-tile`, `large-floor-panel`, `landing-transition-platform`; supported planar rectangles. A short central gap around d=18 is initially 1.8m, with wide takeoff/landing pads. This is a candidate, not an accepted reachable jump until the shared simulation validates it.
- **Main action:** accelerate, read the first jump, land and regain control. No compulsory Dive and no surprise hammer.
- **Safe route:** X≈−6, width ≥4m; continuous static bypass with gentle horizontal turns and no forced jump. Rejoins by d=32.
- **Risk route:** X≈0, width ≥5m; short direct jump, then an optional ground Dive/Slide on a long clear straight. The speed advantage must be measured; it cannot be created by a hidden boost.
- **Checkpoint:** no intermediate checkpoint. Spawn is the recovery point until the safe plaza entrance checkpoint.
- **Bots:** all profiles can take the static bypass. Validate opening eight spawn offsets, both connection edges and merge with ordinary inputs. Risk route is optional test coverage, not mandatory AI behavior.
- **Composition:** hero entrance arch/rocket-like prepared silhouette outside collision lanes, distant planet behind/side of camera and sparse stars. Keep the landing platform brighter/more legible than the background. One shared slow-rotate configuration is sufficient.
- **Section gate:** no required precision jump in the safe path; 8-way spawn support; clear exit; safe route finishable without Dive. Human first-run direction must be obvious without debug overlays.

### 2 — Hammer Plaza: timing with a visible alternative

- **Local envelope:** X ±18m, d=0–60m; branch at d≈10, merge at d≈46. Flat generous entrance/exit pockets.
- **Main obstacles:** two `giant-padded-hammer` mechanisms using existing sweeper behavior, staggered periods initially about 4.8s/5.6s and documented phases. Keep parameters within current trusted templates; authored Impact Strength starts at existing/default behavior and changes only after Playtest review.
- **Safe route:** broad outer walkway near X=−9 with ≥4m clear width outside the complete sampled hammer sweep. A longer bend trades time for low timing demand. Wide waiting pads before any crossing; no required waiting zone inside the sweep.
- **Risk route:** central shorter line with two telegraphed timed crossings, large landing/recovery areas and room to brake. Do not make Dive mandatory to avoid a hit. A hit may knock a player off; recovery returns to section entrance.
- **Checkpoint `cp-plaza`:** proposed `(0,0,-44)`, radius ~1.8m, on the common entrance deck before the branch and outside all hazard phases. All safe bots cross its usable region.
- **Bots:** safe mandatory route for all skills initially; later hard route allowed only after phase coverage. Verify start phases near warning/active boundaries and avoid passing waypoints through decorative rail meshes.
- **Composition:** hammers are visual landmarks. Raised decorative islands/rockets sit outside player silhouette and camera paths. Emissive pulsing can decorate remote signs but must not masquerade as an authoritative danger timer.
- **Section gate:** safe route exists at every sampled start phase; hazard shape/pose agrees with the visible moving head; no decorative collider accidentally blocks the outer bend. Human must perceive the shortcut before committing.

### 3 — Turbo Boulevard: speed with space to recover

- **Local envelope:** X ±14m, d=0–64m. At least 10m of choice/read-in and a broad final merge/braking area, adjusted for actual boost tail/stopping distance.
- **Main obstacles/mechanics:** one real turbo trigger/strip based on `turbo-conveyor`; optional modest lateral conveyor on a separate supported lane. A turbo trigger is not automatically a walkable floor; provide its owning support explicitly.
- **Safe route:** X≈−6, width ≥4m, ordinary speed, generous rails/readable edges and no mandatory boost. Flat continuous geometry with optional minor lane-choice obstacles only if timing remains readable.
- **Risk route:** X≈+6, width initially ≥3.5m; turbo multiplier starts at current 1.5, duration tail 5s, never stacked. Wider exposed outside edge rather than a new lethal mechanic. No moving hazard placed immediately after boost expiry or at a blind merge.
- **Checkpoint `cp-turbo`:** `(0,0,-104)`, on the common unboosted entry deck. Respawn clears boost/action; the actual contact may reactivate it later.
- **Bots:** mandatory ordinary-speed route, explicit common checkpoint and merge; use the same trigger rules as humans if a later bot route chooses turbo. Test no multiplicative boost from overlapping instances and no stale turbo after respawn.
- **Composition:** directional art and luminous strips communicate speed; far structures frame the vista without hiding the next surface. Transparent clouds remain sparse to avoid overdraw. No extra expensive per-object effects are needed.
- **Section gate:** safe and boost routes merge fairly; stopping/turning distances measured with actual tail state; no speed exploit through repeated triggers; exit safe under the longest allowed boost state.

### 4 — Bounce Garden: optional vertical play

- **Local envelope:** X ±16m, d=0–48m; entry and exit at Y=0. Raised optional landings initially around Y=0.6m only, with clear flat return regions.
- **Main obstacles/mechanics:** two prepared `bounce-pad`/existing jump-pad mechanisms with candidate boost around 10.5m/s; static garden landings. Keep pads physically supported and swept landing checks active; no platform under the entire void. Use moving bounce-platform type only if a separate timing test validates it.
- **Safe route:** static outer bridge near X=−8, width ≥4m, continuous walk or small validated jumps with safe rest pads. It must not accidentally cross a pad trigger.
- **Risk route:** two visible pad-to-pad/landing launches, width ≥5m at receiving pads, return to common Y=0 exit. Launches, trajectories and landing zones must be simulated with plausible approach states; a GLB placed beneath a parabola is not proof of support.
- **Checkpoint `cp-garden`:** `(0,0,-168)`, shared safe entrance, not on a bouncing support. A fall on either risky jump returns here.
- **Bots:** all profiles initially use static bypass. Optional launch route is human-only until input follower and time/phase coverage demonstrate legal completion. No teleport fallback.
- **Composition:** floating garden/island clusters below and to the sides, with gentle bobbing on a shared setting; do not put animated decorative islands where they appear to be required platforms. Rockets/stars can indicate the launch direction without obscuring the landing footprint.
- **Section gate:** real floating pad landing and launch, no double-jump Dive, no hidden support at void level; camera keeps receiving platform visible on portrait. Human assesses depth perception and recovery frustration.

### 5 — Orbit Finale: precision then celebration

- **Local envelope:** X ±18m, d=0–56m, with the final ~12m a wide hazard-free promenade/finish pad.
- **Main obstacles/mechanics:** one or two `rotating-disc-platform` assets with existing circular support/displacement. Initial radii roughly 6–8m and slow periods (e.g. 7–9s) are design candidates; the physical/support and visual scales must be compiled together.
- **Safe route:** a clearly differentiated static outer walkway, width ≥4m, that goes around the moving floor and rejoins before the last promenade. Its extra length is the cost; it should not be hidden behind the carousel.
- **Risk route:** shorter disc crossing and a final small validated transfer onto the promenade. Use distinct static takeoff/landing regions; no moving wall or hammer added solely to raise difficulty. Passenger displacement and jump-off must match authority/prediction.
- **Checkpoint `cp-orbit`:** `(0,0,-216)`, common static deck before routes diverge. No checkpoint on a rotating disc. All branches reach the same finish zone and use identical result rules.
- **Bots:** static safe route with support-aware waypoints; disc route may be a later hard-profile enhancement. Full course bot replay must reach the real finish, not just the final waypoint.
- **Composition:** the largest distant cosmic structure frames the final arch; one bounded orbit animation can add life off the race path. Keep finish silhouettes, remote avatars and VFX legible. Use existing finish/victory sound/effect presets rather than new unbounded emitters.
- **Section gate:** measured support transfer; clear finish region; no forced last-metre hazard; null DNF times and deterministic champion ordering remain unchanged in multiplayer.

## 5. Checkpoint, route and multiplayer policy

Current optional/out-of-order checkpoint and finish behavior remains the legacy contract. For this new course, recommended authoring is four common-entry checkpoints that both routes naturally cross, with a conservative mandatory bot path. Do not silently enforce mandatory checkpoints or change backtracking/ranking in this data PR. Owner must settle whether new-level progress should be monotonic and how shortcut branch progress is compared; the compiler/protocol tests must reflect the accepted policy.

Every branch must connect its entry and exit without fake intermediate checkpoint times. Shared navigation stages, human race progress and final DNF ordering must use compatible progress definitions. Hiding or locking an owner in the editor must not remove gameplay collision in publication. All participants use the same hit/boost/pad rules. Eight players are non-solid to one another unless separately approved mechanics change this.

Bot requirements: authored safe route at every stage, common checkpoint support, valid rest/landing points, no arbitrary hovering waypoints and no server-side state correction. Phase/seed suite must be declared in the report. Proposed release goal is repeatable completion for all intended skill profiles over those cases with bounded stalls; start with “no >10s stationary stall outside an intentional wait” and revise only with evidence. The criteria are not proof of all possible phases or player contacts.

Three-round tournament logic already exists. Test new course integration only if its selection is approved; do not change round capacity/qualification/order as an incidental content edit. Reconnect, shared collapse state, world mismatch and result consistency remain mandatory when integrating any newly selected online level.

## 6. Environment and technical budgets

Use existing prepared catalog assets/parts wherever their silhouette fits. The prepared library does not guarantee a distinct authored mesh for every “planet/cloud/satellite” label. Record the exact selected IDs at authoring time; request new art separately if composition cannot meet the concept with existing models.

Layer plan:

- Gameplay: visually readable supported platforms/mechanisms, minimal occlusion of player path and upcoming landings. Explicit colliders and triggers.
- Mid-distance: non-collidable island/garden structures framing each section; lock them after placement. Avoid surfaces that look like a shortcut but cannot be landed on.
- Far background: planets/stars/rockets/cosmic structures, shared model instances with distance visibility. Slow rotation/bob/orbit/pulse remain presentation only; no new bodies or physics tick callbacks.

Initial **authoring caps**, not measured phone budgets: ≤20 background instances/section, ≤8 unique environment model dependencies across the course, ≤3 shared pulse settings, no more than 2 simultaneous foreground atmospheric particle emitters if any are later approved. The schema currently permits more; these smaller proposals encourage composition and reuse. Actual draw/texture/frame-time gates require hardware evidence. Keep existing texture/material/lighting/DPR policy; do not lower resolution to hit these numbers.

No new global postprocessing, dynamic shadows, character asset processing or automatic quality tiers. Any future atmosphere preset must be bounded and independently reviewed against target devices. Deduplicate model dependencies across sections and levels; never copy embedded textures per prefab.

## 7. Technical acceptance and human review

Before owner publication review:

1. Stable level/section IDs and version pins; no modified original Cosmic Sprint layout, character/audio masters or unrelated race geometry.
2. All five connectors compile with supported walking surfaces, clearance and no hidden gaps; owner-local collider relationships survive section duplicate/move/export/import/Undo.
3. Spawn supports every eight-slot offset/row; finish and all enabled checkpoint centres/radii are on safe valid surfaces. No unsupported ramps/concave collision or arbitrary mechanism yaw enters the compiled level.
4. Mandatory safe route completes without Dive or risky launch sections using legal inputs; proposed phase tests include cycle start/quarter/half/three-quarter and warning/active boundaries. Coupled periods and shared trigger cases need additional selected scenarios; finite samples are labeled honestly.
5. Risky jumps/launches have recorded initial speed/boost/support/phase, takeoff window and supported landing evidence. No DNF finish times or forced bot position writes.
6. Client/server compile the same gameplay digest and replay representative action/support interactions consistently. Mismatched builds fail before join/prediction. Reconnect/rematch/result checks are scoped to actual integration changes.
7. Focused browser check covers new-level load, a representative traversal, portrait landing visibility, editor export/import and disposal/re-entry. No shader/missing asset errors; actual counters recorded without claiming device FPS from emulation.
8. Physical-phone measurements follow the audit benchmark plan before asserting 30/60 FPS. The level can be reviewed as a draft earlier, with unverified performance clearly marked.
9. Human plays safe and risky routes, verifies signage/depth, control feel, fall recovery, wait fairness, camera occlusion and visual distinction across five sections. Record actual finish times/falls/hits and subjective notes; the owner approves the real playable result.
10. Publish reviewed document plus report through a PR with matching frontend/backend build plan and a one-step previous-manifest rollback. No automatic publication or merge from the editor.

## 8. Production handoff and decisions

ChatGPT: refine theme/rhythm, draft each section's measurable intent and communicate art direction. Codex: check support limits, implement/reuse data, validate with real shared simulation, integrate editor exports, report evidence/unknowns and open the review PR. Human: play, refine placements/colliders/composition and make final product judgments. Editor: make those local edits and short Playtest loops immediate, with history and stable IDs.

First handoff is **one Star Launch section**, not all five fully decorated. Validate the factory loop, then Plaza timing, then speed/launch/finale. Reuse the resulting section versions for later levels only after successful review; retain exact pins for reproducibility.

Owner decisions before implementing this brief: new level versus replacement; checkpoint/progress policy; exact target phone/loading budget; art/animation availability; whether risky routes must be bot-capable at first publication. Recommended defaults are a new level, unchanged legacy behavior, static mandatory bot routes, approved existing assets and no new player collision mechanics. None of these decisions authorizes changes during this analysis-only task.

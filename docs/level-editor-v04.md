# Editor v0.4

`/editor` remains preview/development-only. Show Colliders displays authoritative
landing surfaces (green), hazards (red), interaction triggers (cyan), and
checkpoint/finish regions (yellow). Collider Edit Mode selects a collider in the
viewport or inspector; XYZ are **parent-local offsets**, dimensions are local
metres, and rotation is local Y. Model transforms preserve these relationships;
collider edits do not change GLB geometry. No concave/mesh collision is implied.
Custom decorations remain non-collidable until a surface, solid/hazard box or
bounce/turbo trigger is explicitly added. Solid boxes include a walkable top.
Checkpoint radius/enabled are supported; checkpoint/finish positions stay fixed.

Playtest uses the shared simulation and unsaved JSON. Restart clears the player,
checkpoint selection and boost, then real contacts can activate them again.
Exit retains the draft/history. Checkpoint pulses occur only on a new activation.
Turbo defaults to 1.5x controlled movement, capped at 2x, with a 5-second tail;
triggers can refresh but do not multiply/stack. Floating bounce pads have their
own swept landing surface, never a floor beneath the level.

## Publication through a normal PR

The owner exports v3 JSON (v1/v2 imports migrate). Codex places it in the `layout`
field of `packages/game-content/src/published/cosmic-sprint.json`. No browser GitHub
credentials or automatic publication exist. Both `getArena()` and the authoritative
server consume this file. Any non-default objects/checkpoint settings block
publication until navigation is explicitly updated, its waypoint support/stages
validate, and `navigationReviewedFor` equals the reported content fingerprint.
That field is a review acknowledgement, **not automatic proof of bot traversal**:
review legal bot routes before approving it. Do not copy the hash to bypass review.

Validate a candidate with:

```sh
npx esbuild tools/level-editor/validate-published.ts --bundle --platform=node --format=esm --outfile=/tmp/minimorph-validate-published.mjs
node /tmp/minimorph-validate-published.mjs path/to/candidate-publication.json
```

All 23 prepared GLBs are packageable for published catalog placements; the browser
still loads scene resources on demand. No GLB source/texture was reprocessed.
The wire format remains v2. `WORLD_REVISION` includes the v0.4 simulation epoch and
a stable 64-bit fingerprint of the validated layout, compiled world and navigation
(compatibility, not authentication). Deploy
frontend and the existing Render server from the **same commit**, including the
published JSON; mixed revisions must continue to reject join/resume/snapshots.
The default repository JSON contains no geometry overrides. Other arenas are unchanged.

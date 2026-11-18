# Production editor and multi-track draft workflow (experimental)

The production build now includes `/editor`. **No authentication** is applied, at the owner's explicit request. This route is public; it does not have any write credentials or publishing endpoints.

The editor offers two modes:
- **Cosmic Sprint 3D editor:** existing rich scene, collider and asset tools, local Playtest and JSON layout export.
- **All tracks — top-down editor:** select Cosmic Sprint, Orbit Chaos or Gravity Mayhem; drag existing platforms, mechanisms or checkpoints in an X/Z overview; edit numeric properties, or use the advanced full `ArenaConfig` JSON panel. Supports local Playtest, per-level browser draft save/restore, import/export. This is a **limited 2D editor**, not yet the same 3D authoring feature set as Cosmic Sprint.

## Publishing
Changes in either mode are **draft-only**. The all-tracks editor exports an entire `ArenaConfig` JSON; the Cosmic Sprint 3D editor exports a legacy v4 layout override. Neither format is auto-published. For Orbit Chaos/Gravity Mayhem, their generated source definitions in `packages/game-content/src/rounds.ts` must be reconciled with the exported draft by a coding agent/reviewer; do not blindly replace a runtime object. For Cosmic Sprint use the existing publication contract and navigation review. Owner approval and compatible client/server deployments are required.

## Limitations and testing
- The 2D mode's simple numeric checks and static diagnostics do **not** prove a track is valid or traversable. Existing route/bot data are not automatically regenerated when geometry changes.
- Browser drafts are per origin/device and can be lost. Export regularly.
- The full JSON editor is advanced and can make a draft unplayable. No undo history is provided for the 2D mode.
- No production deployment or browser/TypeScript test was performed by this GitHub-only change. Check Netlify build, open `/editor` on production after merge/deploy, test each level's Playtest, import/export and restore before using it for production editing.

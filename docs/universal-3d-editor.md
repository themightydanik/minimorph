# Universal 3D editor — experimental implementation

Route: `/editor` on production builds (enabled in PR #23). The editor mode selector now offers **All tracks · 3D editor** in addition to the existing specialized Cosmic Sprint 3D editor.

## Scope
- Select any of the three registered race arenas: Cosmic Sprint, Orbit Chaos, Gravity Mayhem.
- 3D PlayCanvas scene displays physical platforms, mechanism bounds, checkpoints, spawn/finish, and visual/environment proxies. **Proxies are not faithful GLB renders**; the original Cosmic Sprint editor remains the GLB-rich editing mode.
- Click a marker/box to select, left drag to reposition on X/Z, right drag to orbit, wheel to zoom.
- Inspector edits numeric/string fields; add, duplicate, remove supported platforms/mechanisms/checkpoints and visual/environment entries.
- Full ArenaConfig JSON editor supports additional structures such as routes and navigation, with a validation guard on import.
- Local Playtest, per-track browser draft save/restore, JSON import/export.
- No authentication and no production write API; browser drafts and exports are never published automatically.

## Limitations
- This is **not yet full feature parity** with the specialized Cosmic Sprint editor: it uses primitive geometry for visualization, has no integrated GLB asset picker, no visual collider editor, no route point gizmos, no undo history, and does not regenerate bot navigation.
- Adding visual/environment entries defaults to the existing `main-floor-tile` asset; other asset references must be reviewed and authored explicitly.
- Import checks only basic shape/finite coordinates; Playtest also runs static level diagnostics. Neither proves bot traversal or production multiplayer compatibility.
- Exports for Orbit Chaos and Gravity Mayhem must be reconciled with programmatic builders in `rounds.ts` by a coding agent, validated, reviewed, and deployed with any required network revision changes.

## Validation before merge
This branch was edited via GitHub connector, **without running a build or browser tests**. Run `npm run typecheck`, `npm run build`, relevant editor and registry tests, and a real browser smoke test for all three tracks. Verify selection/dragging, Playtest exit, import/export, and preservation of the specialized Cosmic Sprint editor. Do not merge if build or smoke tests fail.

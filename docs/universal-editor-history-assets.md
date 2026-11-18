# Universal editor history and prepared assets

The all-tracks 3D editor now has **Undo/Redo** (50 snapshots) for inspector edits, adding, duplicating, deleting, reset, drag gestures, restore/import and applying advanced JSON. Each drag is one history step. Switching tracks resets the history; save/export before switching. Browser drafts remain per-track.

For the **Visuals** and **Environment** layers, the Add button now uses a prepared asset selection from the existing editor catalog. This selects a valid manifest asset reference rather than inserting an unreviewed arbitrary ID. The universal viewport **still displays a primitive proxy** instead of the GLB mesh; visual parity with the specialized Cosmic Sprint editor is not yet implemented. Assets from the Cosmic Sprint catalog may not suit other tracks, and their physical collider behavior is not inferred or auto-created.

The production editor remains public with no credentials and does not publish level changes. Exported drafts still require review and integration.

## Required verification
This PR was prepared via GitHub connector only. **No build, typecheck or browser test was run.** Before merge, run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and manually test:
- Undo/Redo across add, duplicate, delete, inspector edits and a continuous drag.
- Import and JSON application, including malformed data, without losing the previous draft.
- Select a prepared visual asset and verify the exported `asset` field.
- Switch between all three tracks; verify per-track drafts and local Playtest.
- Confirm original Cosmic Sprint editor and gameplay remain unaffected.

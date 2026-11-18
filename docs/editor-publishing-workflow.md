# Browser level editor: safe draft workflow

## Opening the editor

The editor is available at `/editor` **only in builds that include it**: local Vite development, Netlify Deploy Preview, or an explicitly opted-in build with `VITE_LEVEL_EDITOR=1`. The default production build excludes the editor. Netlify Deploy Preview URLs are **not authentication**; anyone with the URL may be able to access the editor, so do not treat previews as private. Do not set `VITE_LEVEL_EDITOR=1` on the public production site without a reviewed access-control solution.

To use without cloning locally: open the GitHub PR's Netlify Deploy Preview and append `/editor` to its preview origin. This requires a successful preview build; a PR alone does not prove the preview exists.

## Draft and publication

1. Open the editor and change **Cosmic Sprint**. The editor is not a general-purpose multi-level authoring tool.
2. Use **Playtest** to try the edited course; a successful playtest is not a complete multiplayer/bot traversal certification.
3. Click **Save browser draft** to save a validated layout in this browser's local storage. **Restore browser draft** validates it again before loading; **Clear browser draft** deletes only that browser backup. Browser storage is per-origin, can be cleared, and is not synchronized across preview URLs or devices. Use **Export JSON for PR** as a durable backup.
4. Export `minimorph-cosmic-sprint-layout-v4.json`. Give this file to the coding agent/reviewer. It is a layout override, **not** the entire publication envelope and does not automatically update GitHub.
5. Reviewer validates the layout, navigation, physical changes and publication metadata and prepares a **Draft PR** to update `packages/game-content/src/published/cosmic-sprint.json`. See `packages/game-content/src/published-cosmic.ts` for the publication contract, including `navigationReviewedFor` when gameplay geometry changes.
6. Run targeted validation and playtests, review client/server `WORLD_REVISION` compatibility, obtain owner approval, then merge and coordinate deployment. Never deploy directly from the editor.

## Access-control decision

The current editor build gate is **not** a login system. A genuinely protected production editor needs a trusted identity/authentication layer or a platform access gate, configured and tested separately; a client-side password or hidden URL is not secure. This PR intentionally keeps the production editor disabled and does not claim to implement access control.

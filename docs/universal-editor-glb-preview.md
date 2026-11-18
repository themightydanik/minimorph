# Universal 3D editor: GLB preview (experimental)

The universal editor now attempts to load the **actual prepared GLB meshes** for entries in the `visuals` and `environment` layers, using the existing `editorAssetUrls` and cosmic-sprint runtime manifest. The scene retains simple physical proxies for platforms, mechanisms, checkpoints, spawn, finish and route markers.

## Behavior
- GLB container resources are loaded lazily per unique asset key and reused while the editor is open.
- A visual with a manifest part index displays that selected part; yaw and position come from the authored visual. Width/depth are used to fit a uniform preview scale.
- While loading or when the GLB cannot be found, the editor shows the previous primitive proxy and reports a status message.
- GLB resources are released on editor teardown. This is an **editor preview**, not a replacement for the runtime's optimized instanced cosmic renderer.

## Known limitations
- This does **not** add GLB assets to Orbit Chaos or Gravity Mayhem by default. Users must add visuals from the prepared catalog; the catalog is currently cosmic-sprint-specific.
- GLB preview transforms are approximate, not a guarantee of pixel-identical runtime placement. Mechanism physics still uses independent gameplay definitions.
- No automatic collision creation, bot navigation regeneration, multiplayer publication or secure write API.
- Large GLB scenes can affect performance; test on the Redmi Note 8 before expanding to all meshes.
- **No local build, typecheck or browser testing was available** in this connector-only session. Review before merge.

## Required acceptance checks
Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. In browser: open each race track; add a visual from catalog; confirm real mesh loads and persists after save/restore; select and drag it; verify fallback on a missing asset; run Playtest; switch tracks; exit editor and verify no regressions in the original specialized Cosmic Sprint editor.

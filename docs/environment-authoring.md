# Environment authoring

Open `/editor` on the PR preview. The published Cosmic Sprint layout is unchanged; drafts require explicit export and publication.

- Choose **Environment · NON-COLLIDABLE**, a category and a prepared catalog model/part, then Add. Categories organize the existing assets; they do not generate new models.
- Ctrl/Cmd-click decorative rows or viewport objects to multi-select. Group/Ungroup stores flat, disjoint groups. Clicking a grouped member selects its group. Collider Edit Mode still selects individual owners and edits parent-relative colliders.
- Use the group inspector to move the centroid, rotate around Y, or apply a uniform scale factor. The translation gizmo coalesces a continuous drag into one Undo entry. Duplicate copies all selected members and complete groups with new IDs. History retains 50 actions.
- Hide/Show and Lock/Unlock are available per object. Gameplay visibility is editor-only; Environment visibility is exported. Locked members prevent group movement. The Environment layer checkbox is a temporary editor view filter.
- Focus selection frames the selected model/group, with wider zoom limits. Explicit focus keeps those objects available beyond their editor distance threshold until selection changes.
- Environment animation presets are presentation-only: rotation speed is radians/second; bob/orbit speed is angular frequency and amplitude is metres; pulse amplitude controls emissive intensity. No animation creates or moves collision bodies. Rotation has no amplitude parameter effect.

Layout v4 preserves environment objects, groups and metadata and imports v1–v3. Environment objects reject physics fields. Maximums: 200 background instances, 50 flat groups, 100 members/group, 8 distinct shared pulse settings, 100–1500m visibility distance. Nested groups and non-uniform group scaling are not supported. Distant objects reuse the existing GLB instancing/loading path; pulse variants share textures and materials by setting. No rendering resolution, lighting or environment quality reduction is enabled.

Publication includes background visuals but projects presentation-only data out of the multiplayer compatibility fingerprint. Physical edits retain the existing navigation-review gate. The unchanged published layout keeps revision `95476a6fcdcc57ce`.

Verification: targeted layout/group/history/animation/collider tests, TypeScript, changed-file ESLint, a preview build and one focused Chromium authoring smoke. No full browser suite, benchmarks, asset processing or Android build.

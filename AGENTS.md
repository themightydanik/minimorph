# Minimorph — instructions for AI coding agents

Read this file first, then [project status](docs/PROJECT_STATUS.md), [next steps](docs/NEXT_STEPS.md), [README](README.md), and the relevant architecture/design docs before making changes.

## Mission
Minimorph is a colorful 3D multiplayer obstacle-racing game with a space-cat astronaut, built on PlayCanvas. The product direction is an enjoyable, polished game playable through Telegram, Android APK, and the Minima ecosystem (MiniDapp/node integration plus future Minima-backed game features). Product direction is **not** a claim that all targets are released or implemented. Gameplay quality comes before blockchain features.

## Repository and ownership
- Monorepo: `apps/telegram`, `apps/minima`, `apps/multiplayer-server`, `packages/game-content`, `packages/game-simulation`, `packages/game-engine`, `packages/game-ui`, `packages/multiplayer-protocol`, `packages/multiplayer-client`, `packages/minima-adapter`.
- Shared deterministic simulation and authoritative server behavior are the source of truth; do not implement editor-only physics.
- The published legacy races and training courses must remain functional while Level Factory evolves.
- Read `docs/audits/MINIMORPH_TECHNICAL_AUDIT.md`, `docs/audits/LEVEL_FACTORY_ARCHITECTURE.md`, `docs/audits/GAMEPLAY_QUALITY_ROADMAP.md`, `docs/audits/COSMIC_SPRINT_2_DESIGN_BRIEF.md`, and `docs/level-registry.md`. Older documents are dated snapshots, not proof of today's implementation.

## Working agreement
1. Inspect current `main`, relevant source/tests, and open PRs before choosing work. Distinguish implemented, proposed, unverified, and deprecated features.
2. Work in a focused branch; open a **Draft PR**. Never merge, publish a level, deploy, rotate credentials, or modify production data without explicit owner approval.
3. Do not redesign, replace, reprocess, simplify, or lower the quality of the approved character, GLB assets, rendering, lighting, or mobile visuals without explicit approval. Avoid adding heavyweight assets without measuring impact.
4. Prefer the smallest implementation that produces a verifiable playable result. No broad refactors or new frameworks unless necessary and approved.
5. Preserve backward compatibility, protocol versions, stable IDs, and deterministic output. If `WORLD_REVISION` or gameplay digests change, flag that client and authoritative server must be deployed together; do not silently deploy.
6. Do not claim a level is playable, a route traversable, or mobile FPS acceptable solely from static validation or a generated screenshot. Record what was actually tested, what failed, and what requires real-device playtest.
7. Never commit secrets, tokens, seed phrases, wallet keys, or private credentials. Do not add blockchain signing or payments as a side effect of unrelated work.
8. Keep testing targeted to touched code first; report commands/results honestly, including pre-existing failures. Avoid unnecessary full browser/asset pipelines when the task does not require them.
9. For game design and art, seek owner approval of visual references, geometry, routes, assets, and gameplay feel. The AI is an implementer, not an autonomous art director.

## Expected PR report
Summarize goal, files changed, implementation vs proposal, compatibility/deployment risks, tests actually run, known limitations, manual playtest checklist, and follow-up tasks. Leave the PR unmerged.

## Useful commands
`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run build:server`. Read `README.md` for environment and more expensive browser/packaging commands.

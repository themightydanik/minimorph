# Minimorph

A cosmic 3D obstacle racer with three full-length racing arenas, starring a space-cat biorobot. Two browser shells share the same PlayCanvas engine: a free-to-play Telegram Mini App and a read-only Minima MiniDapp. Solo and Training remain available; an optional authoritative WebSocket service adds eight-participant Quick Match and private rooms with server bots. There are no accounts, rewards, transactions or public leaderboards.

## Develop

Use Node.js 24 (`nvm use` if available) and npm. From the repository root:

```sh
npm install
npm run dev:telegram
# In a separate terminal, for Minima browser practice:
npm run dev:minima
```

Open the address printed by Vite. Choose Cosmic Sprint, read the briefing and launch through 3–2–1–GO. WASD/arrows move; Space jumps; Q/E or ↶/↷ orbit the camera. An eight-way touch pad supports diagonal movement and jump together. Secure the sector checkpoints and finish to save your best time and unlock Orbit Chaos, then Gravity Mayhem. Full rounds take approximately 60–90 seconds; the original short tracks remain under Training with separate records. New mechanisms carry, launch, knock back or remove support; read the warning signals. Blur pauses the race; Resume counts down again. Restart resets the current run. Progress is local with a safe session-only fallback. Desktop browsers need WebGL 2 and hardware acceleration.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run package:mds
# Browser tests (Chromium; desktop and mobile emulation)
npx playwright install chromium
npm run test:browser
```

`npm run check` runs type checking, lint, unit tests, both builds and validated MDS packaging. CI also runs browser tests. On Linux a preinstalled Chromium can be selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`; its software rendering option is for automated validation, not game deployment.

## Structure

| Workspace                 | Responsibility                                                                |
| ------------------------- | ----------------------------------------------------------------------------- |
| `apps/telegram`           | Telegram bridge, browser fallback, Vite target                                |
| `apps/minima`             | Classic MDS shell, local official SDK, MiniDapp metadata                      |
| `apps/multiplayer-server` | Authoritative WebSocket rooms, bots, matchmaking and results |
| `packages/game-simulation` | Shared deterministic movement, supports, collisions and checkpoints |
| `packages/multiplayer-protocol` | Versioned wire types and strict input validation |
| `packages/multiplayer-client` | Input networking, prediction, reconciliation and interpolation |
| `packages/game-engine`    | Fixed-step controller, camera, replaceable character visuals, scene lifecycle |
| `packages/game-content`   | Shared platform course and finish coordinates                                 |
| `packages/game-ui`        | HUD, keyboard and multi-pointer controls, restart and errors                  |
| `packages/minima-adapter` | Optional read-only MDS `status` integration                                   |

See [architecture](docs/architecture.md), [deployment and manual verification](docs/deployment.md), and [reference review](docs/references.md). Additional services and packages are deliberately deferred until they have real implementations.

## Multiplayer

See [multiplayer architecture, local setup and manual Render Free deployment](docs/multiplayer.md). Build the server with `npm run build:server`, run `npm run start:server`, and set `VITE_MULTIPLAYER_WS_URL` when building a frontend. No Render domain is hardcoded, and no paid service is required. `npm run profile:multiplayer` records actual eight-connection CPU/RAM/tick/traffic measurements.

## Security

No secrets or environment variables are required for this prototype. Never commit `.env`, private keys, seed phrases, wallet credentials or bot tokens. Telegram host data is not authentication. A future backend must validate Telegram `initData` server-side before trusting identity. The Telegram dependency graph contains no Minima adapter or blockchain functionality. Minima requests read permission only and never signs or submits transactions.

## Character asset

The approved official Meshy-derived 160k character and six in-game clips from PR #4 are enabled in both hosts, with a procedural fallback on loading failure. The static model, embedded maps and packed Blender workbench remain unchanged. [Temporary character report and replacement config](docs/temporary-playable-character.md) document accepted deformation defects; artist replacement does not require rewriting gameplay.

See [full-length rounds, mechanics and verification](docs/full-length-rounds.md) and the [original training-track authoring guide](docs/arena-system.md).
Character skin-regression tests require `python -m pip install -r tools/blender/requirements-test.txt`. `npm run check:rig-quality` is the separate strict deformation gate and currently fails on remaining local strain; technical CI success does not approve art.

## Character optimization study

PR #8 prepares an isolated 125,928-triangle candidate while production keeps the original 160,000-triangle model. See the [owner approval policy](docs/character-optimization-policy.md), [study and rollback boundary](docs/character-optimization-study.md), and [actual comparisons / 1–8 actor measurements](docs/evidence/character-optimization/README.md). No world quality or rendering resolution is reduced, and candidate activation requires explicit owner approval.

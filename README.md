# Minimorph

A cosmic 3D obstacle course starring a space-cat biorobot. Two browser shells share the same PlayCanvas engine: a free-to-play Telegram Mini App and a read-only Minima MiniDapp. This foundation has no accounts, rewards, transactions, leaderboards or multiplayer.

## Develop

Use Node.js 24 (`nvm use` if available) and npm. From the repository root:

```sh
npm install
npm run dev:telegram
# In a separate terminal, for Minima browser practice:
npm run dev:minima
```

Open the address printed by Vite. WASD or arrow keys move; Space jumps. Q/E or the ↶/↷ buttons orbit the camera; movement follows the camera heading. On touch devices use the directional pad and Jump. Follow the cyan runway lights across five floating platforms to the finish arch. Two amber pads become cyan when secured as checkpoints. Jump over the moving amber sweeper on the middle island. Falling or hitting it returns you to the latest checkpoint and preserves your elapsed time; Restart clears the full run. Desktop browsers need WebGL 2 and hardware acceleration.

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
| `packages/game-engine`    | Fixed-step controller, camera, replaceable character visuals, scene lifecycle |
| `packages/game-content`   | Shared platform course and finish coordinates                                 |
| `packages/game-ui`        | HUD, keyboard and multi-pointer controls, restart and errors                  |
| `packages/minima-adapter` | Optional read-only MDS `status` integration                                   |

See [architecture](docs/architecture.md), [deployment and manual verification](docs/deployment.md), and [reference review](docs/references.md). Additional services and packages are deliberately deferred until they have real implementations.

## Security

No secrets or environment variables are required for this prototype. Never commit `.env`, private keys, seed phrases, wallet credentials or bot tokens. Telegram host data is not authentication. A future backend must validate Telegram `initData` server-side before trusting identity. The Telegram dependency graph contains no Minima adapter or blockchain functionality. Minima requests read permission only and never signs or submits transactions.

## Character asset

The official Meshy-derived character and measured validation reports are in [assets/characters/minimorph](assets/characters/minimorph/README.md). The untouched high-resolution master stays in the [assets-v1 Release](https://github.com/themightydanik/minimorph/releases/tag/assets-v1); see the [optimization pipeline](docs/character-model-v1.md) and [source-versus-optimized review](docs/character-visual-rework.md). PR #3 remains Draft for human visual approval. Production gameplay continues to use its existing procedural fallback.

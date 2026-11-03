# Deployment and manual verification

## Telegram / Netlify

Connect this repository to Netlify with the repository root as base directory. Root `netlify.toml` selects Node 24, builds `@minimorph/telegram`, and publishes `apps/telegram/dist`. Netlify installs the root workspace dependencies using the committed lockfile. No secret values are needed. The resulting HTTPS site also works as ordinary browser practice. Deployment itself is outside the local checks.

Configure your Telegram bot's Mini App/menu URL in BotFather to the Netlify HTTPS URL. No bot token belongs in frontend code. The shell loads Telegram's official WebApp bridge from `https://telegram.org/js/telegram-web-app.js`; failure is nonfatal. The game starts before that optional request completes. `ready()`, `expand()` and stable viewport updates run only when host data is present. `initDataUnsafe` is never used. No authentication is implemented.

On a real Telegram client, check loading/error states, portrait and landscape, expanded viewport, notches and safe areas, simultaneous movement + jump, release after dragging outside a button, app switching, finish, fall recovery and Restart. Open the same URL outside Telegram and verify browser practice. These are manual verification instructions, not claims of completed live-client testing.

## Classic Minima MDS

```sh
npm ci
npm run package:mds
```

Install `artifacts/minimorph-0.1.0.mds.zip` through your classic node's MiniDapp Hub installation interface. Alternatively use the node console's documented `mds action:install file:/absolute/path/minimorph-0.1.0.mds.zip trust:read` on the machine where the node can access that file. Keep READ access. Open the installed app from the Hub so MDS supplies its session `uid` query parameter. Do not paste session URLs into public reports.

The ZIP contains `dapp.conf` as the first entry at its root, `index.html`, the icon, relative `assets/` paths, the bundled official `mds.js` and its license. The packager checks permission, required metadata/files, relative HTML asset references, actual first local ZIP header and complete extraction round-trip. There is no wrapper directory or runtime package installation. All Node APIs are confined to build/test scripts; the MiniDapp itself uses browser APIs.

With an MDS session hint the shell loads the local SDK, waits for the official `inited` event and issues exactly one `MDS.cmd('status', ...)`. A successful response shows `response.chain.block`. Missing/failed bridge or status reports unavailable and leaves practice playable. Plain Vite/browser execution does not initialize MDS polling. Session detection is a hint; successful API response is what establishes usable integration.

On a live classic node, verify installation, READ permission, loading bundled assets without external game requests, status block display and all game controls. Confirm no pending WRITE requests appear. Test node disconnection and browser fallback. A modern WebGL 2 capable browser is required; older WebViews are not supported. No live Minima node has been used for the implementation checks.

## Automated checks and limits

`npm run check` validates source and production outputs. `npm run test:browser` exercises both applications in Chromium desktop and mobile emulation, including a real rendered WebGL canvas, movement, jumping, landing, fall recovery, restart and resizing. Additional course replays complete both checkpoints, jump over the moving sweeper and reach the celebration using ordinary inputs, while collision tests deliberately hit the sweeper and recover to a checkpoint. See [gameplay verification](gameplay.md) for camera, animation and mobile feel checks. Host integrations use explicit mocks, and an offline Telegram SDK is tested. Mobile emulation does not establish performance or compatibility on physical phones. No live Telegram client, live node, Netlify deployment or real transaction is part of those tests.

For the current full-length races, also verify every sector in all three arenas, the eight-way touch pad plus Jump, the outer shuttle bridge and exposed belt route, and checkpoint recovery after a late-sector fall. Racing and Training store separate bests; verify both mode buttons when reviewing an existing device save. [Full-length rounds](full-length-rounds.md) records the automated route timings and limitations.

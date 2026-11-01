# Reference review and third-party code

Read-only reference repositories were inspected outside this checkout. Nothing was migrated from them:

- `themightydanik/minimorph-tg`: existing Telegram/backend infrastructure includes Firebase; excluded from this foundation.
- `themightydanik/minimorph-miniapp`: prior browser assets and Firebase configuration; no business logic or artwork copied.
- `themightydanik/MinimaDEX`: prior frontend reference; no exchange, simulated DEX or transaction behavior copied.

Classic MDS behavior was checked against the official [minima-global/Minima](https://github.com/minima-global/Minima/tree/52542f25605a28a776e9b3b43b0808a05dceab01) source at commit `52542f25605a28a776e9b3b43b0808a05dceab01`:

- [`mds/mds.js`](https://github.com/minima-global/Minima/blob/52542f25605a28a776e9b3b43b0808a05dceab01/mds/mds.js): browser bridge version 2.1.0, session query parameter, `inited` event and `cmd` callback. Vendored without modification at `apps/minima/public/mds.js`; SHA-256 `d0e997873afc9b3d99c83d290792f3d564e02025327646dbc68fa077b11959f9`.
- `mds/code/basic/dapp.conf` and `mds/code/basic/index.html`: metadata and initialization examples.
- `src/org/minima/system/mds/MDSManager.java` and `src/org/minima/system/commands/mds/mds.java`: root `dapp.conf`, default READ permissions, package installation and `trust:read`.
- `src/org/minima/system/commands/base/status.java`: `response.chain.block`.

The SDK is redistributed under the upstream Apache License 2.0, included beside it as `MDS-LICENSE.txt` and in the distributable ZIP. The historical `minima-global/MiniDAPP` documentation describes older `minidapp.conf` / `.minidapp` packaging and was not used as the classic MDS contract. The current runtime source and its included examples take precedence over that legacy format.

Telegram bridge reference: [official Web Apps documentation](https://core.telegram.org/bots/webapps), with runtime script `https://telegram.org/js/telegram-web-app.js`. Browser mocks verify our narrow integration; actual host behavior needs the manual checks in deployment documentation.

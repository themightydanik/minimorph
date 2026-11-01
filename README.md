# Minimorph

Minimorph is a cosmic 3D obstacle-racing game featuring space-cat biorobots.

## Targets
- Telegram Mini App: free-to-play game.
- Minima MiniDapp (Classic Node / MDS): game with optional blockchain economy.

## Technical direction
- PlayCanvas + TypeScript for a shared game core.
- Vite for browser builds.
- A monorepo with separate adapters for Telegram and Minima MDS.
- No blockchain activity inside the Telegram Mini App.

## Development
The initial architecture and playable prototype will be implemented through small reviewed pull requests.

## Security
Never commit .env files, private keys, seed phrases, bot tokens or wallet credentials. Financial features require separate verification and tests.

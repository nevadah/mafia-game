# MafiaTest

MafiaTest is a TypeScript monorepo for a multiplayer implementation of the social deduction game Mafia.

It contains:

- `server/`: REST + WebSocket game service (authoritative game state)
- `client/`: Electron desktop client (main process + renderer UI)

## Quick Start

Requirements:

- Node.js 20+
- npm 10+

Install:

```bash
npm install
```

Run server:

```bash
npm run dev:server
```

Run client:

```bash
npm run dev:client
```

Build all workspaces:

```bash
npm run build
```

Run tests:

```bash
npm run test:server
npm run test:client
```

## Documentation

- `docs/README.md`: Documentation index
- `docs/project-structure.md`: Repository map and key files
- `docs/system-architecture.md`: Runtime architecture and data ownership
- `docs/game-flows.md`: End-to-end gameplay and state-transition flows
- `docs/api-and-events.md`: REST, WebSocket, and Electron IPC contracts
- `docs/onboarding.md`: New developer and AI agent onboarding checklist

## Current Implementation Notes

- In-memory game and session state (no persistent database)
- In-memory auth tokens returned from create/join and used via `x-player-token`
- Session state resets when the server process restarts

This repository is optimized for local development and iteration.

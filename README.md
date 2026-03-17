# mafia-game

mafia-game is a TypeScript monorepo for a multiplayer implementation of the social deduction game Mafia.

Mafia is a social deduction game where players are secretly assigned roles — villagers and mafia members. Mafia members know each other's identities, but villagers do not. Players alternate between a day phase (open discussion and voting to eliminate a suspected mafia member) and a night phase (mafia secretly eliminates a villager). The village wins by eliminating all mafia; the mafia wins by reaching parity with the villagers.

It contains:

- `server/`: REST + WebSocket game service (authoritative game state)
- `client/`: Electron desktop client (main process + renderer UI)

## About This Project

This project was inspired by [Turing Games](https://www.youtube.com/@turing_games), a YouTube channel that pits AI models (Claude, ChatGPT, Gemini, Grok, and others) against each other in games of Mafia.

It serves two purposes: building a functional multiplayer implementation of Mafia, and serving as a hands-on exercise in AI-assisted development using tools including Claude Code and ChatGPT. It is part of the public portfolio of [Nevada Hamaker](https://github.com/nevadah), a senior software engineer.

## Current Status

Active work in progress. The core game loop — lobby, day voting, night actions, and win conditions — is fully implemented and tested. A basic Electron + React UI exists. Not yet implemented: game persistence, production deployment, and a polished UI.

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

Renderer hot-reload workflow (optional, in two terminals):

```bash
npm run dev:renderer --workspace=client
npm run dev:electron --workspace=client
```

Run multiple client instances (for local multiplayer testing):

```bash
npm run dev:multi --workspace=client
```

Run this in as many terminals as needed. Each instance is an independent Electron window connected to the same server.

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

- `docs/README.md`: Documentation index and navigation guide
- `docs/project-structure.md`: Repository map and key files
- `docs/system-architecture.md`: Runtime architecture and data ownership model
- `docs/game-flows.md`: End-to-end gameplay and state-transition flows
- `docs/api-and-events.md`: REST, WebSocket, and Electron IPC contracts
- `docs/onboarding.md`: New developer and AI agent onboarding checklist

## Current Implementation Notes

- In-memory game and session state (no persistent database)
- In-memory auth tokens returned from create/join and used via `x-player-token`
- Session state resets when the server process restarts

This repository is optimized for local development and iteration.

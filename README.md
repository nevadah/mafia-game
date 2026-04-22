# mafia-game

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

mafia-game is a TypeScript monorepo for a multiplayer implementation of the social deduction game Mafia.

Mafia is a social deduction game where players are secretly assigned roles — villagers and mafia members. Mafia members know each other's identities, but villagers do not. Players alternate between a day phase (open discussion and voting to eliminate a suspected mafia member) and a night phase (mafia secretly eliminates a villager). The village wins by eliminating all mafia; the mafia wins by reaching parity with the villagers.

It contains:

- `server/`: REST + WebSocket game service (authoritative game state)
- `client/`: Electron desktop client (main process + renderer UI)

## About This Project

This project was inspired by [Turing Games](https://www.youtube.com/@turing_games), a YouTube channel that pits AI models (Claude, ChatGPT, Gemini, Grok, and others) against each other in games of Mafia.

It serves two purposes: building a functional multiplayer implementation of Mafia, and serving as a hands-on exercise in AI-assisted development using tools including Claude Code and ChatGPT. It is part of the public portfolio of [Nevada Hamaker](https://github.com/nevadah), a senior software engineer.

## AI Assistance Disclosure

This project was developed with substantial assistance from AI coding tools, primarily [Claude Code](https://claude.ai/claude-code) (Anthropic). The AI assisted with code generation, test writing, refactoring, and documentation across most of the codebase. All architectural decisions, feature direction, code review, and acceptance of changes were made by the human author.

The `Co-Authored-By: Claude Sonnet 4.6` lines in commit messages reflect this contribution transparently. Anthropic's Terms of Service assign ownership of AI-generated outputs to the user; the AI holds no copyright interest in this work.

## Current Status

Active work in progress. The core game loop — lobby, day voting, night actions, and win conditions — is fully implemented and tested. The Electron + React UI is functional and includes light/dark themes and a runtime language switcher (English, German, Spanish, French). Not yet implemented: game persistence, production deployment, and a polished UI.

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

Start the server and renderer dev server together (then launch clients in separate terminals):

```bash
npm run dev:backend
```

Run multiple client instances (for local multiplayer testing):

```bash
npm run dev:multi --workspace=client
```

Run this in as many terminals as needed. Each instance is an independent Electron window connected to the same server.

Run a headless end-to-end game simulation (useful for smoke-testing the full client ↔ server contract):

```bash
npm run simulate          # 4 players (default)
npm run simulate -- 6     # 6 players
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

Run Playwright end-to-end tests (Electron UI):

```bash
# First-time setup — install Playwright browsers
npx playwright install --with-deps

# Run the full e2e suite
npm run test:e2e --workspace=client
```

The suite runs serially (one worker) against real Electron windows. A full HTML report is written to `client/e2e-report/` after each run; open `client/e2e-report/index.html` to browse results.

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

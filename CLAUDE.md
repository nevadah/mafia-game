# CLAUDE.md

This file provides Claude Code with context about this repository.

## Project Overview

TypeScript monorepo implementing multiplayer Mafia, a social deduction game. Two NPM workspaces:

- `server/` — Express + WebSocket game service (authoritative state)
- `client/` — Electron desktop app (main process + React renderer)

This is an active work-in-progress portfolio project by Nevada Hamaker, a senior software engineer. It is also a hands-on exercise in AI-assisted development.

## Commands

```bash
# Install
npm install

# Build all workspaces
npm run build

# Run server in dev mode
npm run dev:server

# Run Electron client in dev mode
npm run dev:client

# Run with hot-reload renderer (two terminals)
npm run dev:renderer --workspace=client
npm run dev:electron --workspace=client

# Run multiple independent client instances (for local multiplayer testing)
npm run dev:multi --workspace=client   # repeat in as many terminals as needed

# Tests
npm run test:server
npm run test:client
npm run test                  # both
```

## Architecture

- **Server is authoritative** for all game state and rule enforcement. Never duplicate game logic on the client.
- **Client stores snapshots only** (`MafiaClient.gameState`) and reacts to WebSocket events.
- **Communication layers**: REST (commands/queries) → WebSocket (broadcasts) → Electron IPC (renderer bridge).
- **No database**: all state is in-memory. Server restart clears everything. This is intentional.

### Key Source Files

| File | Role |
|---|---|
| `server/src/Game.ts` | Game rules, state machine, phase transitions, win conditions |
| `server/src/GameManager.ts` | Game registry, session tokens, join/leave lifecycle |
| `server/src/server.ts` | REST routes, WebSocket server, auth, event broadcasting |
| `client/src/MafiaClient.ts` | SDK over server REST + WebSocket APIs |
| `client/src/main.ts` | Electron main process, IPC handlers, deep-link parsing |
| `client/src/preload.ts` | `window.mafia` API exposed securely to renderer |
| `client/renderer/src/App.jsx` | React UI for all game phases |

### Authentication

- Create/join returns a `{ token }` bound to `{ gameId, playerId }`.
- Authenticated endpoints require `x-player-token` header.
- Host-only actions (start, resolve) check `actorId === hostId`.

### Game Phases

`lobby → day ⇄ night → ended`

Roles: `mafia`, `townsperson`, `doctor`, `sheriff`.

Win conditions: town wins when no mafia remain; mafia wins when mafia count ≥ non-mafia count.

## Testing

- Jest + ts-jest in both workspaces.
- 80% line/function/statement coverage enforced; 70% branch.
- Client integration tests spin up a live server (global setup/teardown).
- **CI fails on any warnings or deprecations in test output.** Keep test logs clean.

## Typical Change Workflow

1. Game rule changes → `server/src/Game.ts`
2. New endpoints → `server/src/server.ts`
3. Client SDK → `client/src/MafiaClient.ts`
4. IPC bridge (if needed) → `client/src/main.ts`, `client/src/preload.ts`
5. UI → `client/renderer/src/App.jsx`
6. Add/update tests in the corresponding workspace `tests/` folder.

Keep contracts synchronized across server route payloads, `MafiaClient`, the IPC bridge, and renderer call sites.

## Important Constraints

- Do not introduce persistence assumptions unless explicitly requested.
- Do not duplicate game rule enforcement on the client.
- Role visibility rules: roles are secret during an active game; all roles are revealed at game end.
- Resolve gating: `/resolve-votes` and `/resolve-night` block unless all required actions are submitted, unless `force: true` is passed.
- Tie behavior: day vote tie → no elimination; night mafia vote tie → no kill.
- Host leaving deletes the game.

## Documentation

Full docs live in `docs/`. Key references:

- `docs/system-architecture.md` — runtime components, data ownership, auth model
- `docs/game-flows.md` — end-to-end phase and state transition flows
- `docs/api-and-events.md` — REST endpoints, WebSocket events, Electron IPC contract
- `docs/project-structure.md` — file tree and key file descriptions

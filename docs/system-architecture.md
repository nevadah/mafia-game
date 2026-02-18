# System Architecture

## Runtime Components

- Server process (`server/src/index.ts`): Express + WebSocket service.
- Client desktop app (`client/src/main.ts` + renderer): Electron application.
- Client SDK (`client/src/MafiaClient.ts`): common API layer used by Electron main process and tests.

## Data Ownership

- Server is authoritative for all game state and rule enforcement.
- Client stores local snapshots only (`gameState` in `MafiaClient`) and reacts to server updates.

## Server Internals

- `GameManager` owns:
  - in-memory game map
  - in-memory session token map
- `Game` owns per-game mutable state:
  - players, phase, status, round, votes, night actions, outcome metadata

## Authentication and Authorization

- On create/join, server returns `{ token }` bound to `{ gameId, playerId }`.
- Authenticated REST actions send `x-player-token`.
- Server resolves actor identity from token (and rejects mismatches).
- Host-only actions (start/resolve) enforce `actorId === hostId`.

## Communication Layers

- REST: command-style actions and explicit queries (`/games`, `/ready`, `/vote`, etc).
- WebSocket: state/event broadcasts (`phase_changed`, `player_ready`, `game_ended`, etc).
- Electron IPC: bridge from renderer to main process; main delegates to `MafiaClient`.

## Persistence Model

- All state is in memory.
- Restarting the server clears games and sessions.
- Waiting games are pruned periodically when idle beyond configured TTL.

## Non-Goals (Current)

- Long-term persistence (DB)
- Horizontal scaling/distributed coordination
- Production-grade auth/identity lifecycle

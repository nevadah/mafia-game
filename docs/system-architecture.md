# System Architecture

## Runtime Components

- Server process (`server/src/index.ts`): Express + WebSocket service.
- Client desktop app (`client/src/main.ts` + React renderer): Electron application.
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

## Client UI Build

- Renderer is a React app under `client/renderer/`, built with Vite.
- Production build emits static assets to `client/dist/renderer`.
- Electron main can load:
  - built file output (`dist/renderer/index.html`) in normal mode
  - Vite dev server URL via `ELECTRON_RENDERER_URL` in hot-reload mode

## Persistence Model

- All state is in memory.
- Restarting the server clears games and sessions.
- Waiting games are pruned periodically when idle beyond configured TTL.

## Localization

- UI strings are managed with `i18next` + `react-i18next`.
- All four locale bundles (en, de, es, fr) are pre-bundled at build time — no runtime network fetches, no Suspense boundary needed.
- `i18n.ts` initializes the i18n instance with `useSuspense: false`; reads the saved language from `localStorage['mafia-language']` on startup.
- The language switcher in the app header calls `i18n.changeLanguage(lang)` and persists the choice to localStorage.
- To add a new UI string: add the key + English value to `en.json`, add the translations to `de.json`, `es.json`, and `fr.json`, then use `t('key')` in the component.

## Non-Goals (Current)

- Long-term persistence (DB)
- Horizontal scaling/distributed coordination
- Production-grade auth/identity lifecycle

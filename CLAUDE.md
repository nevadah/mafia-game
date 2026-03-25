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

# Start server + Vite renderer dev server together (recommended before launching clients)
npm run dev:backend

# Auto-launch N pre-wired players (recommended for local multiplayer testing)
npm run dev:party -- 4    # opens 4 windows; Player1 auto-creates, rest auto-join

# Run independent client instances manually (one terminal per player)
npm run dev:multi --workspace=client   # repeat in as many terminals as needed

# Headless end-to-end simulation (no UI required)
npm run simulate              # 4 players (default)
npm run simulate -- 6         # N players

# Tests
npm run test:server
npm run test:client
npm run test                  # both
npm run test:renderer --workspace=client  # renderer component tests only
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
| `client/renderer/src/App.jsx` | Root React component — state, WebSocket subscriptions, action handlers, component assembly |
| `client/renderer/src/components/` | Phase components: AppHeader, EntryScreen, LobbyPhase, DayPhase, NightPhase, NightSummaryModal, GameOver, StatusBar |
| `client/renderer/src/i18n.ts` | i18next initialization; reads saved language from localStorage |
| `client/renderer/src/locales/` | Locale JSON files (en, de, es, fr) — add new UI strings here |
| `client/scripts/simulate-game.ts` | Headless game simulation (spawns server, drives N clients) |

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
5. UI → edit or add a component in `client/renderer/src/components/`; wire it into `client/renderer/src/App.jsx` if it's a new phase-level component
6. New UI strings → add key + English value to `client/renderer/src/locales/en.json`, then `de.json`, `es.json`, `fr.json`; use `t('key')` in the component.
7. Add/update tests in the corresponding workspace `tests/` folder.

Keep contracts synchronized across server route payloads, `MafiaClient`, the IPC bridge, and renderer call sites.

## Important Constraints

- Do not introduce persistence assumptions unless explicitly requested.
- Do not duplicate game rule enforcement on the client.
- Role visibility rules: roles are secret during an active game; all roles are revealed at game end.
- Resolve gating: `/resolve-votes` and `/resolve-night` block unless all required actions are submitted, unless `force: true` is passed.
- Tie behavior: day vote tie → no elimination; night mafia vote tie → no kill.
- WebSocket disconnect starts a 30-second grace timer before removing the player. If the client reconnects with the same token within that window, the timer is cancelled. An explicit leave (`POST /leave`) is immediate. Closing the Electron window mid-game removes the player after the grace period.
- Host leaving or disconnecting deletes the game.

## Documentation

Full docs live in `docs/`. Key references:

- `docs/system-architecture.md` — runtime components, data ownership, auth model
- `docs/game-flows.md` — end-to-end phase and state transition flows
- `docs/api-and-events.md` — REST endpoints, WebSocket events, Electron IPC contract
- `docs/project-structure.md` — file tree and key file descriptions


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->

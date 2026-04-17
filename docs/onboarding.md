# Onboarding Guide (Developers + AI Agents)

## 5-Minute Context Load

1. Read `README.md`.
2. Read `docs/project-structure.md`.
3. Read `docs/system-architecture.md`.
4. Read `docs/game-flows.md`.
5. Read `docs/api-and-events.md`.

## First Commands

```bash
npm install
npm run build
npm run dev:server
npm run dev:client
```

Optional hot-reload renderer workflow (recommended for UI changes):

```bash
npm run dev:backend                    # terminal 1: server + Vite renderer dev server
npm run dev:electron --workspace=client  # terminal 2: Electron (loads from Vite)
```

Multiple client instances (for local multiplayer testing):

```bash
# Option A — one command, auto-wired (recommended)
npm run dev:backend       # terminal 1
npm run dev:party -- 4    # terminal 2: opens 4 windows, Player1 auto-creates, rest auto-join

# Option B — manual, one terminal per client
npm run dev:backend                    # terminal 1
npm run dev:multi --workspace=client   # terminal 2+, repeat as needed
```

Headless simulation (smoke-test the full client ↔ server contract without a UI):

```bash
npm run simulate          # 4 players
npm run simulate -- 6     # 6 players
```

## Typical Change Workflow

1. Update server rules in `server/src/Game.ts` or endpoint logic in `server/src/server.ts`.
2. Update client SDK in `client/src/MafiaClient.ts`.
3. Update Electron bridge if needed:
- `client/src/main.ts`
- `client/src/preload.ts`
- `client/renderer/src/App.jsx`
4. For new UI strings: add to `client/renderer/src/locales/en.json` first, then `de.json`, `es.json`, `fr.json`; use `t('key')` in the component.
5. Add/update tests in corresponding workspace test folders.
6. Before opening a PR: audit `CLAUDE.md` and `docs/` for anything the branch has made stale or undocumented. Update inline — don't defer to a follow-up.

## AI Agent Notes

- Prefer changing the canonical workspace files under `server/` and `client/` only.
- Treat server as source of truth for game logic.
- Keep contracts synchronized across:
- server route payloads
- `MafiaClient` request/response handling
- preload/main IPC bridge
- renderer invocation sites
- Avoid introducing persistence assumptions unless explicitly requested.
- Run `npm run lint` before pushing. CI fails on ESLint errors as well as test failures.
- Before starting a new branch, verify the previous PR is actually merged (`gh pr list` or `git log origin/main`) and pull from main. A divergent branch may be missing recently merged fixes.

## High-Value Verification Targets

- Role visibility rules (self-only during active game, all at end).
- Host-only action enforcement (start/resolve).
- Resolve gating behavior with and without `force`.
- Tie behavior in day votes and mafia night votes.
- Leave-game behavior and host-leave deletion.
- Spectator token rejection: spectator tokens must be refused by all player-action endpoints with `403`, and player tokens must be refused by `spectate-leave` with `403`.

## Known Constraints

- In-memory state only; restart loses games/sessions.
- Local desktop client with Electron; no browser web client.
- Some integration tests require local port binding.

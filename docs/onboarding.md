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
npm run dev:renderer --workspace=client
npm run dev:electron --workspace=client
```

## Typical Change Workflow

1. Update server rules in `server/src/Game.ts` or endpoint logic in `server/src/server.ts`.
2. Update client SDK in `client/src/MafiaClient.ts`.
3. Update Electron bridge if needed:
- `client/src/main.ts`
- `client/src/preload.ts`
- `client/renderer/src/App.jsx`
4. Add/update tests in corresponding workspace test folders.

## AI Agent Notes

- Prefer changing the canonical workspace files under `server/` and `client/` only.
- Treat server as source of truth for game logic.
- Keep contracts synchronized across:
- server route payloads
- `MafiaClient` request/response handling
- preload/main IPC bridge
- renderer invocation sites
- Avoid introducing persistence assumptions unless explicitly requested.

## High-Value Verification Targets

- Role visibility rules (self-only during active game, all at end).
- Host-only action enforcement (start/resolve).
- Resolve gating behavior with and without `force`.
- Tie behavior in day votes and mafia night votes.
- Leave-game behavior and host-leave deletion.

## Known Constraints

- In-memory state only; restart loses games/sessions.
- Local desktop client with Electron; no browser web client.
- Some integration tests require local port binding.

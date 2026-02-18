# Project Structure

## Top-Level Layout

```text
.
├── .github/workflows/ci.yml
├── client/
├── docs/
├── server/
├── package.json
└── README.md
```

## Workspace: `server/`

```text
server/
├── src/
│   ├── index.ts
│   ├── server.ts
│   ├── Game.ts
│   ├── GameManager.ts
│   ├── Player.ts
│   └── types.ts
├── tests/
├── package.json
├── tsconfig.json
└── jest.config.js
```

Key files:

- `server/src/index.ts`: process entrypoint, HTTP server startup, stale-game cleanup interval.
- `server/src/server.ts`: REST routes, WebSocket server, auth/authorization, broadcasts.
- `server/src/Game.ts`: game rules and state transitions.
- `server/src/GameManager.ts`: game registry, sessions, join/leave lifecycle, stale pruning.
- `server/src/types.ts`: shared server API/state types.

## Workspace: `client/`

```text
client/
├── src/
│   ├── main.ts
│   ├── preload.ts
│   ├── MafiaClient.ts
│   ├── types.ts
│   └── renderer/
│       ├── index.html
│       └── renderer.js
├── tests/
├── package.json
├── tsconfig.json
└── jest.config.js
```

Key files:

- `client/src/MafiaClient.ts`: SDK wrapper around server REST + WebSocket APIs.
- `client/src/main.ts`: Electron main-process orchestration and IPC handlers.
- `client/src/preload.ts`: safe renderer API exposed as `window.mafia`.
- `client/src/renderer/renderer.js`: UI behavior and interaction flow.

## Testing Layout

- `server/tests/`: unit and API/WS behavior tests.
- `client/tests/`: SDK and integration tests.

## Build/Test Commands

From repository root:

- `npm run build`
- `npm run test:server`
- `npm run test:client`

Workspace-specific:

- `npm run build --workspace=server`
- `npm run build --workspace=client`

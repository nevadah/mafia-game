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
├── renderer/
│   ├── index.html
│   ├── src/
│   │   ├── App.jsx
│   │   ├── i18n.ts
│   │   ├── locales/
│   │   │   ├── en.json
│   │   │   ├── de.json
│   │   │   ├── es.json
│   │   │   └── fr.json
│   │   ├── main.jsx
│   │   └── styles.css
│   └── tests/
│       └── setup.js
├── scripts/
│   └── simulate-game.ts
├── src/
│   ├── main.ts
│   ├── preload.ts
│   ├── MafiaClient.ts
│   └── types.ts
├── tests/
├── vite.config.mjs
├── package.json
├── tsconfig.json
├── jest.config.js
└── jest.renderer.config.js
```

Key files:

- `client/src/MafiaClient.ts`: SDK wrapper around server REST + WebSocket APIs.
- `client/src/main.ts`: Electron main-process orchestration and IPC handlers.
- `client/src/preload.ts`: safe renderer API exposed as `window.mafia`.
- `client/renderer/src/App.jsx`: React renderer UI behavior and interaction flow.
- `client/renderer/src/i18n.ts`: i18next initialization with pre-bundled locale resources.
- `client/renderer/src/locales/`: locale JSON files (en, de, es, fr); add new UI strings here.
- `client/scripts/simulate-game.ts`: headless end-to-end game simulation script.
- `client/vite.config.mjs`: renderer build configuration (Vite -> `client/dist/renderer`).

## Testing Layout

- `server/tests/`: unit and API/WS behavior tests.
- `client/tests/`: SDK and integration tests.
- `client/renderer/tests/`: React component tests (run via `jest.renderer.config.js`).

## Build/Test Commands

From repository root:

- `npm run build`
- `npm run test:server`
- `npm run test:client`
- `npm run dev:backend` — start server + Vite renderer dev server together
- `npm run simulate` — headless end-to-end game simulation

Workspace-specific:

- `npm run build --workspace=server`
- `npm run build --workspace=client`
- `npm run dev:renderer --workspace=client`
- `npm run dev:electron --workspace=client`
- `npm run test:renderer --workspace=client` — renderer component tests only

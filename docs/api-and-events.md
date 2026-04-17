# API and Events

## REST Endpoints

Base URL: `http://localhost:3000`

### Public / Lobby

- `POST /games`
- `GET /games`
- `GET /games/:gameId`
- `POST /games/:gameId/join`
- `POST /games/:gameId/spectate` — join as a read-only spectator; returns `{ spectatorId, token, state }`. Spectator tokens are rejected by all player-action endpoints with `403`.
- `POST /games/:gameId/spectate-leave` — leave as a spectator; requires a spectator token (`x-player-token`). Returns `{ ok: true }`. Player tokens are rejected with `403`.

### Authenticated Gameplay

These endpoints require the `x-player-token` header. Actor identity is derived from the token.

- `POST /games/:gameId/ready`
- `POST /games/:gameId/unready`
- `POST /games/:gameId/start` (host only)
- `POST /games/:gameId/vote`
- `POST /games/:gameId/chat` — body `{ text }`, returns the stored `ChatMessage`
- `POST /games/:gameId/resolve-votes` (host only, optional `force`)
- `POST /games/:gameId/night-action`
- `POST /games/:gameId/resolve-night` (host only, optional `force`)
- `POST /games/:gameId/leave`

### Common Error Classes

- `400`: validation/rule violation
- `401`: invalid token
- `403`: forbidden action, spectator-only token, or game mismatch
- `404`: game not found
- `409`: resolve blocked waiting for required actions (when not forced)

## WebSocket Contract

Connection URL:

`ws://localhost:3000/?gameId=<id>&playerId=<id>&token=<token>`

`token` is preferred for authenticated identity binding. Spectators connect with their spectator token; they receive public-view state updates but cannot send player actions.

### Server → Client event types

- `connected`
- `game_state`
- `player_joined`
- `player_left`
- `player_ready`
- `game_started`
- `phase_changed`
- `vote_cast`
- `player_eliminated`
- `game_ended`
- `chat_message` — broadcast to all connected clients whenever a player posts a chat message
- `spectator_joined` — broadcast when a spectator connects
- `spectator_left` — broadcast when a spectator disconnects or leaves
- `night_action_submitted` — broadcast after each night action is submitted; payload `{ submittedCount, totalCount }`. Counts only — actor identity is never revealed.
- `error`

## Electron IPC (`window.mafia`)

Actions exposed by preload:

- `createGame(serverUrl, playerName)`
- `joinGame(serverUrl, gameId, playerName)`
- `joinAsSpectator(serverUrl, gameId, spectatorName)` — joins as a read-only spectator
- `listGames(serverUrl)`
- `getState()`
- `markReady()`
- `markUnready()`
- `startGame()`
- `castVote(targetId)`
- `nightAction(targetId)`
- `resolveVotes(force?)`
- `resolveNight(force?)`
- `sendChat(text)`
- `leaveGame()`
- `leaveSpectator()` — leave as a spectator; calls `POST /spectate-leave` and clears client state
- `disconnect()`
- `getStartupDeepLink()` — pulls any deep-link payload buffered before the renderer was ready

Event subscriptions:

- `onStateUpdate`
- `onPlayerJoined`
- `onPlayerLeft`
- `onPlayerReady`
- `onVoteCast`
- `onPlayerEliminated`
- `onGameStarted`
- `onGameEnded`
- `onServerError`
- `onChatMessage`
- `onSpectatorJoined`
- `onSpectatorLeft`
- `onNightActionSubmitted` — payload `{ submittedCount, totalCount }`
- `onReconnecting` — fired on each reconnect attempt; payload `{ attempt, maxAttempts }`
- `onDisconnected` — fired when all reconnect attempts are exhausted or the client disconnects intentionally
- `onDeepLink`

### Deep Link Format

- `mafia://join?gameId=<id>[&name=<playerName>][&serverUrl=<url>]` — pre-fills the join form. If `name` is provided the form is submitted automatically.
- `mafia://spectate?gameId=<id>[&name=<spectatorName>][&serverUrl=<url>]` — pre-fills the spectate form. If `name` is provided the form is submitted automatically.
- `mafia://create[?name=<playerName>][&serverUrl=<url>]` — switches to create mode. If `name` is provided the form is submitted automatically.
- Main process parses and forwards payload to renderer via `onDeepLink`.

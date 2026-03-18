# API and Events

## REST Endpoints

Base URL: `http://localhost:3000`

### Public / Lobby

- `POST /games`
- `GET /games`
- `GET /games/:gameId`
- `POST /games/:gameId/join`

### Authenticated Gameplay

These endpoints accept `x-player-token` and actor identity is derived from token:

- `POST /games/:gameId/ready`
- `POST /games/:gameId/unready`
- `POST /games/:gameId/start` (host only)
- `POST /games/:gameId/vote`
- `POST /games/:gameId/resolve-votes` (host only, optional `force`)
- `POST /games/:gameId/night-action`
- `POST /games/:gameId/resolve-night` (host only, optional `force`)
- `POST /games/:gameId/leave`

### Common Error Classes

- `400`: validation/rule violation
- `401`: invalid token
- `403`: forbidden action or token/game mismatch
- `404`: game not found
- `409`: resolve blocked waiting for required actions (when not forced)

## WebSocket Contract

Connection URL:

`ws://localhost:3000/?gameId=<id>&playerId=<id>&token=<token>`

`token` is preferred for authenticated identity binding.

### Server -> Client event types

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
- `error`

## Electron IPC (`window.mafia`)

Actions exposed by preload:

- `createGame(serverUrl, playerName)`
- `joinGame(serverUrl, gameId, playerName)`
- `listGames(serverUrl)`
- `getState()`
- `markReady()`
- `markUnready()`
- `startGame()`
- `castVote(targetId)`
- `nightAction(targetId)`
- `resolveVotes(force?)`
- `resolveNight(force?)`
- `leaveGame()`
- `disconnect()`

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
- `onDeepLink`

### Deep Link Format

- `mafia://join?gameId=<id>[&name=<playerName>][&serverUrl=<url>]` — pre-fills the join form. If `name` is provided the form is submitted automatically.
- `mafia://create[?name=<playerName>][&serverUrl=<url>]` — switches to create mode. If `name` is provided the form is submitted automatically.
- Main process parses and forwards payload to renderer via `onDeepLink`.

# Game Flows

## 1. Lobby Flow

1. Host creates game (`POST /games`), receives `gameId`, `playerId`, and `token`.
2. Players join (`POST /games/:gameId/join`), each receives unique `playerId` + `token`.
3. Players mark ready/unready.
4. Host starts game when minimum-player and readiness conditions are met.

## 2. Start Flow

1. Host calls `POST /games/:gameId/start`.
2. Server assigns roles and switches state:
- status: `waiting -> active`
- phase: `lobby -> night`
- round: stays `0` (increments to `1` after the first night resolves)
3. Server broadcasts `game_started`.

## 3. Day Flow

1. Alive players vote (`POST /games/:gameId/vote`).
2. Host resolves day (`POST /games/:gameId/resolve-votes`).
3. If `force=false`, server requires all alive players to have voted.
4. Vote outcome rule:
- single top target -> eliminated
- tie for top votes -> no elimination
5. Server checks win condition:
- if win, game ends
- else phase advances to `night`

## 4. Night Flow

1. Eligible roles submit night actions (`POST /games/:gameId/night-action`):
- mafia: kill target vote
- doctor: save target
- sheriff: investigate target
2. Host resolves night (`POST /games/:gameId/resolve-night`).
3. If `force=false`, server requires all eligible alive night actors to submit actions.
4. Mafia kill rule:
- mafia consensus target (single top mafia vote) required
- tied mafia targets → no kill (per the original Davidoff rules, which require unanimous agreement among mafia; if they cannot agree, no one dies that night)
- doctor save on mafia target prevents elimination
5. Sheriff investigation result is recorded in round metadata.
6. Server checks win condition:
- if win, game ends
- else phase advances to `day` and round increments

## 5. Win Conditions

- Town wins when no alive mafia remain.
- Mafia wins when alive mafia count is greater than or equal to alive non-mafia count.

## 6. Leave/Disconnect Flow

- Disconnect (`WebSocket close`) starts a 30-second grace timer. If the player reconnects within that window (using the same token), the timer is cancelled and the player remains in the game. If the timer expires, the player is removed and `player_left` is broadcast to remaining players.
- Leave (`POST /games/:gameId/leave`) removes player from game and sessions immediately. Broadcasts `player_left` to remaining players.
- If host leaves or disconnects, game is deleted (host migration is not implemented). No `player_left` broadcast is sent when the game is deleted.

## 7. Spectator Flow

1. Any client can join any game as a spectator at any phase (lobby, active, or ended) via `POST /games/:gameId/spectate`, passing a `spectatorName`.
2. Server returns `{ spectatorId, token, state }`. The token is a spectator token and is bound to `{ gameId, spectatorId, isSpectator: true }` in the session store.
3. Spectator connects to the WebSocket with their token and receives the same public-view state updates as players.
4. Spectator tokens are rejected with `403` by all player-action endpoints (`/ready`, `/unready`, `/start`, `/vote`, `/chat`, `/night-action`, `/resolve-votes`, `/resolve-night`).
5. To leave, the spectator calls `POST /games/:gameId/spectate-leave` with their token. Server removes the spectator, broadcasts `spectator_left`, and the client clears its session. Player tokens used on this endpoint are rejected with `403`.
6. Spectators are not counted in `getPlayerCount()` and do not affect readiness checks, role assignment, win conditions, or resolve gating.
7. If the game is deleted (host leaves), spectator sessions are revoked along with player sessions.

## 8. State Visibility Rules

- During active game, role is visible to that player only.
- At game end, all roles are visible to all players.

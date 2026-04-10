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
- tied mafia targets -> no kill
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

## 7. State Visibility Rules

- During active game, role is visible to that player only.
- At game end, all roles are visible to all players.

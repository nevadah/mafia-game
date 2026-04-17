// Game-domain types are defined once in @mafia/shared and re-exported here
// so all existing server imports remain unchanged.
export type {
  Role,
  GamePhase,
  GameStatus,
  PlayerData,
  GameSettings,
  EliminationRecord,
  ChatMessage,
  SpectatorData,
  GameState,
} from '@mafia/shared';

// ── Server-only types ─────────────────────────────────────────────────────────

import type { GameSettings } from '@mafia/shared';

export interface CreateGameRequest {
  hostName: string;
  settings?: Partial<GameSettings>;
}

export interface JoinGameRequest {
  playerName: string;
}

export interface VoteRequest {
  voterId?: string;
  targetId: string;
}

export interface NightActionRequest {
  playerId?: string;
  targetId: string;
}

export interface ReadyRequest {
  playerId?: string;
}

export interface LeaveRequest {
  playerId?: string;
}

export interface SpectateRequest {
  spectatorName: string;
}

export interface WebSocketMessage {
  type: string;
  payload?: unknown;
}

export interface ServerToClientMessage {
  type:
    | 'game_state'
    | 'player_joined'
    | 'player_left'
    | 'player_ready'
    | 'game_started'
    | 'phase_changed'
    | 'vote_cast'
    | 'player_eliminated'
    | 'game_ended'
    | 'chat_message'
    | 'spectator_joined'
    | 'spectator_left'
    | 'night_action_submitted'
    | 'error'
    | 'connected';
  payload?: unknown;
}

// Game-domain types are defined once in @mafia/shared and re-exported here
// so all existing client imports remain unchanged.
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

// ── Client-only types ─────────────────────────────────────────────────────────

import type { PlayerData } from '@mafia/shared';

export interface EndGameSummary {
  winner: 'mafia' | 'town';
  players: PlayerData[];
}

export interface ServerMessage {
  type: string;
  payload?: unknown;
}

export interface FetchLike {
  (url: string, init?: RequestInit): Promise<ResponseLike>;
}

export interface ResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

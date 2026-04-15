/**
 * @mafia/shared — single source of truth for types used by both the server
 * and the client.  Server-only types (request shapes, WS message envelopes)
 * and client-only types (IPC helpers, SDK internals) live in their respective
 * workspace packages; only the game-domain types live here.
 */

export type Role = 'mafia' | 'townsperson' | 'doctor' | 'sheriff';

export type GamePhase = 'lobby' | 'day' | 'night' | 'ended';

export type GameStatus = 'waiting' | 'active' | 'ended';

export interface PlayerData {
  id: string;
  name: string;
  role?: Role;
  isAlive: boolean;
  isConnected: boolean;
  isReady: boolean;
}

export interface GameSettings {
  minPlayers: number;
  maxPlayers: number;
  mafiaRatio: number;
  hasDoctor: boolean;
  hasSheriff: boolean;
}

export interface EliminationRecord {
  playerId: string;
  playerName: string;
  role: Role;
  by: 'mafia' | 'town';
  round: number;
}

export interface ChatMessage {
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export interface SpectatorData {
  id: string;
  name: string;
  isConnected: boolean;
}

export interface GameState {
  id: string;
  phase: GamePhase;
  status: GameStatus;
  players: PlayerData[];
  spectators: SpectatorData[];
  round: number;
  winner?: 'mafia' | 'town';
  hostId: string;
  votes: Record<string, string>;
  nightActions: Record<string, string>;
  eliminatedThisRound?: string;
  doctorProtectedThisRound?: string | null;
  investigatedThisRound?: { target: string; result: Role } | null;
  settings: GameSettings;
  readyCount: number;
  messages: ChatMessage[];
  eliminations: EliminationRecord[];
}

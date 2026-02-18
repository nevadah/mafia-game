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

export interface GameState {
  id: string;
  phase: GamePhase;
  status: GameStatus;
  players: PlayerData[];
  round: number;
  winner?: 'mafia' | 'town';
  hostId: string;
  votes: Record<string, string>;
  nightActions: Record<string, string>;
  eliminatedThisRound?: string;
  savedThisRound?: string;
  investigatedThisRound?: { target: string; result: Role } | null;
  settings: GameSettings;
  readyCount: number;
}

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

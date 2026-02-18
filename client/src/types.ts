export type Role = 'mafia' | 'townsperson' | 'doctor' | 'detective';
export type GamePhase = 'lobby' | 'day' | 'night' | 'ended';
export type GameStatus = 'waiting' | 'active' | 'ended';

export interface PlayerData {
  id: string;
  name: string;
  role?: Role;
  isAlive: boolean;
  isConnected: boolean;
}

export interface GameSettings {
  minPlayers: number;
  maxPlayers: number;
  mafiaRatio: number;
  hasDoctor: boolean;
  hasDetective: boolean;
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
  settings: GameSettings;
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

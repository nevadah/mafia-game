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
}

export interface GameSettings {
  minPlayers: number;
  maxPlayers: number;
  mafiaRatio: number;
  hasDoctor: boolean;
  hasDetective: boolean;
}

export interface CreateGameRequest {
  hostName: string;
  settings?: Partial<GameSettings>;
}

export interface JoinGameRequest {
  playerName: string;
}

export interface VoteRequest {
  voterId: string;
  targetId: string;
}

export interface NightActionRequest {
  playerId: string;
  targetId: string;
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
    | 'game_started'
    | 'phase_changed'
    | 'vote_cast'
    | 'player_eliminated'
    | 'game_ended'
    | 'error'
    | 'connected';
  payload?: unknown;
}

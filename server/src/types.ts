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

export interface ChatMessage {
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
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
  doctorProtectedThisRound?: string | null;
  investigatedThisRound?: { target: string; result: Role } | null;
  settings: GameSettings;
  readyCount: number;
  messages: ChatMessage[];
}

export interface GameSettings {
  minPlayers: number;
  maxPlayers: number;
  mafiaRatio: number;
  hasDoctor: boolean;
  hasSheriff: boolean;
}

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
    | 'error'
    | 'connected';
  payload?: unknown;
}

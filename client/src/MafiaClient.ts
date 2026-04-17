import { EventEmitter } from 'events';
import { GameState, ChatMessage, EndGameSummary, Role, ServerMessage, FetchLike } from './types';

export type WebSocketLike = {
  readyState: number;
  send(data: string): void;
  close(): void;
  // Single generic overload so mock implementations can satisfy the type
  addEventListener(type: string, listener: (event?: unknown) => void): void;
};

export type WebSocketFactory = (url: string) => WebSocketLike;

export interface MafiaClientOptions {
  /** Injectable fetch implementation (defaults to global fetch) */
  fetch?: FetchLike;
  /** Injectable WebSocket factory (defaults to ws package) */
  webSocketFactory?: WebSocketFactory;
  /** Override reconnect delay in ms (default: RECONNECT_DELAY_MS) */
  reconnectDelayMs?: number;
}

/**
 * MafiaClient — core client logic for connecting to the Mafia game server.
 *
 * Emits:
 *   'state_update'     (gameState: GameState)  — when any state-bearing message arrives
 *   'player_joined'    (payload)
 *   'player_left'      (payload)
 *   'player_ready'     (payload)
 *   'player_eliminated'(payload)
 *   'vote_cast'        (payload)
 *   'game_started'     (payload)
 *   'game_ended'       (payload)
 *   'server_error'     (payload)
 *   'reconnecting'     ({ attempt: number, maxAttempts: number })
 *   'disconnected'     ()
 */
export class MafiaClient extends EventEmitter {
  private readonly baseUrl: string;
  private readonly wsUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly wsFactory: WebSocketFactory;

  private ws?: WebSocketLike;
  private _gameId?: string;
  private _playerId?: string;
  private _token?: string;
  private _gameState?: GameState;
  private _isSpectator = false;
  private _intentionalDisconnect = false;
  private _reconnectAttempts = 0;
  private readonly _reconnectDelayMs: number;
  static readonly MAX_RECONNECT_ATTEMPTS = 3;
  static readonly RECONNECT_DELAY_MS = 2_000;

  constructor(serverUrl: string, options: MafiaClientOptions = {}) {
    super();
    const normalised = serverUrl.replace(/\/$/, '');
    this.baseUrl = normalised;
    this.wsUrl = normalised.replace(/^http/, 'ws');
    this._reconnectDelayMs = options.reconnectDelayMs ?? MafiaClient.RECONNECT_DELAY_MS;

    this.fetchImpl = options.fetch ?? (globalThis as unknown as { fetch: FetchLike }).fetch;

    if (options.webSocketFactory) {
      this.wsFactory = options.webSocketFactory;
    } else {
      // Use the `ws` package when running in Node.js (Electron main / tests)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const WS = require('ws') as new (url: string) => WebSocketLike;
      this.wsFactory = (url: string) => new WS(url);
    }
  }

  // ── Accessors ────────────────────────────────────────────────────────────

  get gameId(): string | undefined { return this._gameId; }
  get playerId(): string | undefined { return this._playerId; }
  get token(): string | undefined { return this._token; }
  get gameState(): GameState | undefined { return this._gameState; }
  get isSpectator(): boolean { return this._isSpectator; }

  isConnected(): boolean {
    return !!this.ws && this.ws.readyState === 1; // WebSocket.OPEN
  }

  /**
   * Returns the current player's role from the game state, or undefined if
   * not yet assigned (lobby) or not the player's own data.
   */
  getMyRole(): Role | undefined {
    if (!this._gameState || !this._playerId) return undefined;
    const me = this._gameState.players.find(p => p.id === this._playerId);
    return me?.role;
  }

  /**
   * Returns the end-game summary when the game has ended, or null otherwise.
   */
  getEndGameSummary(): EndGameSummary | null {
    if (!this._gameState || this._gameState.status !== 'ended') return null;
    if (!this._gameState.winner) return null;
    return {
      winner: this._gameState.winner,
      players: this._gameState.players
    };
  }

  // ── HTTP API ─────────────────────────────────────────────────────────────

  private authHeaders(): Record<string, string> {
    if (!this._token) {
      return {};
    }
    return { 'x-player-token': this._token };
  }

  /**
   * Create a new game and become the host.
   */
  async createGame(playerName: string, settings?: Partial<GameState['settings']>): Promise<GameState> {
    const res = await this.fetchImpl(`${this.baseUrl}/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostName: playerName, settings })
    });

    if (!res.ok) {
      const err = await res.json() as { error?: string };
      throw new Error(err.error ?? `Server error ${res.status}`);
    }

    const data = await res.json() as { gameId: string; playerId: string; token?: string; state: GameState };
    this._gameId = data.gameId;
    this._playerId = data.playerId;
    this._token = data.token;
    this._gameState = data.state;
    return data.state;
  }

  /**
   * Join an existing game by ID.
   */
  async joinGame(gameId: string, playerName: string): Promise<GameState> {
    const res = await this.fetchImpl(`${this.baseUrl}/games/${gameId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName })
    });

    if (!res.ok) {
      const err = await res.json() as { error?: string };
      throw new Error(err.error ?? `Server error ${res.status}`);
    }

    const data = await res.json() as { playerId: string; token?: string; state: GameState };
    this._gameId = gameId;
    this._playerId = data.playerId;
    this._token = data.token;
    this._gameState = data.state;
    return data.state;
  }

  /**
   * Join an existing game as a spectator (read-only observer).
   */
  async joinAsSpectator(gameId: string, spectatorName: string): Promise<GameState> {
    const res = await this.fetchImpl(`${this.baseUrl}/games/${gameId}/spectate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spectatorName })
    });

    if (!res.ok) {
      const err = await res.json() as { error?: string };
      throw new Error(err.error ?? `Server error ${res.status}`);
    }

    const data = await res.json() as { spectatorId: string; token?: string; state: GameState };
    this._gameId = gameId;
    this._playerId = data.spectatorId;
    this._token = data.token;
    this._gameState = data.state;
    this._isSpectator = true;
    return data.state;
  }

  /**
   * Mark the current player as ready.
   */
  async markReady(): Promise<{ allReady: boolean; readyCount: number }> {
    if (!this._gameId || !this._playerId) throw new Error('Not in a game');
    const res = await this.fetchImpl(`${this.baseUrl}/games/${this._gameId}/ready`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify({ playerId: this._playerId })
    });
    if (!res.ok) {
      const err = await res.json() as { error?: string };
      throw new Error(err.error ?? `Server error ${res.status}`);
    }
    const data = await res.json() as { allReady: boolean; readyCount: number; state: GameState };
    this._gameState = data.state;
    return { allReady: data.allReady, readyCount: data.readyCount };
  }

  /**
   * Mark the current player as not ready.
   */
  async markUnready(): Promise<void> {
    if (!this._gameId || !this._playerId) throw new Error('Not in a game');
    const res = await this.fetchImpl(`${this.baseUrl}/games/${this._gameId}/unready`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify({ playerId: this._playerId })
    });
    if (!res.ok) {
      const err = await res.json() as { error?: string };
      throw new Error(err.error ?? `Server error ${res.status}`);
    }
    const data = await res.json() as { state: GameState };
    this._gameState = data.state;
  }

  /**
   * Start the game (host only).
   */
  async startGame(): Promise<GameState> {
    if (!this._gameId || !this._playerId) throw new Error('Not in a game');
    const res = await this.fetchImpl(`${this.baseUrl}/games/${this._gameId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify({ playerId: this._playerId })
    });
    if (!res.ok) {
      const err = await res.json() as { error?: string };
      throw new Error(err.error ?? `Server error ${res.status}`);
    }
    const data = await res.json() as { state: GameState };
    this._gameState = data.state;
    return data.state;
  }

  /**
   * Cast a vote during the day phase.
   */
  async castVote(targetId: string): Promise<GameState> {
    if (!this._gameId || !this._playerId) throw new Error('Not in a game');
    const res = await this.fetchImpl(`${this.baseUrl}/games/${this._gameId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify({ voterId: this._playerId, targetId })
    });
    if (!res.ok) {
      const err = await res.json() as { error?: string };
      throw new Error(err.error ?? `Server error ${res.status}`);
    }
    const data = await res.json() as { state: GameState };
    this._gameState = data.state;
    return data.state;
  }

  /**
   * Submit a night action (mafia kill, doctor save, or sheriff investigate).
   */
  async submitNightAction(targetId: string): Promise<GameState> {
    if (!this._gameId || !this._playerId) throw new Error('Not in a game');
    const res = await this.fetchImpl(`${this.baseUrl}/games/${this._gameId}/night-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify({ playerId: this._playerId, targetId })
    });
    if (!res.ok) {
      const err = await res.json() as { error?: string };
      throw new Error(err.error ?? `Server error ${res.status}`);
    }
    const data = await res.json() as { state: GameState };
    this._gameState = data.state;
    return data.state;
  }

  /**
   * Resolve day votes and advance phase (host only).
   */
  async resolveVotes(force = false): Promise<{ eliminated: string | null; winner: 'mafia' | 'town' | null }> {
    if (!this._gameId || !this._playerId) throw new Error('Not in a game');
    const res = await this.fetchImpl(`${this.baseUrl}/games/${this._gameId}/resolve-votes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify({ playerId: this._playerId, force })
    });
    if (!res.ok) {
      const err = await res.json() as { error?: string };
      throw new Error(err.error ?? `Server error ${res.status}`);
    }
    const data = await res.json() as { eliminated: string | null; winner: 'mafia' | 'town' | null; state: GameState };
    this._gameState = data.state;
    return { eliminated: data.eliminated, winner: data.winner };
  }

  /**
   * Resolve night actions and advance phase (host only).
   */
  async resolveNight(force = false): Promise<{ eliminated: string | null; winner: 'mafia' | 'town' | null }> {
    if (!this._gameId || !this._playerId) throw new Error('Not in a game');
    const res = await this.fetchImpl(`${this.baseUrl}/games/${this._gameId}/resolve-night`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify({ playerId: this._playerId, force })
    });
    if (!res.ok) {
      const err = await res.json() as { error?: string };
      throw new Error(err.error ?? `Server error ${res.status}`);
    }
    const data = await res.json() as { eliminated: string | null; winner: 'mafia' | 'town' | null; state: GameState };
    this._gameState = data.state;
    return { eliminated: data.eliminated, winner: data.winner };
  }

  /**
   * Send a chat message during the day phase.
   */
  async sendChat(text: string): Promise<ChatMessage> {
    if (!this._gameId || !this._playerId) throw new Error('Not in a game');
    const res = await this.fetchImpl(`${this.baseUrl}/games/${this._gameId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify({ text })
    });
    if (!res.ok) {
      const err = await res.json() as { error?: string };
      throw new Error(err.error ?? `Server error ${res.status}`);
    }
    const data = await res.json() as { message: ChatMessage; state: GameState };
    this._gameState = data.state;
    return data.message;
  }

  /**
   * Leave the current game.
   */
  async leaveGame(): Promise<{ deletedGame: boolean }> {
    if (!this._gameId || !this._playerId) throw new Error('Not in a game');
    const res = await this.fetchImpl(`${this.baseUrl}/games/${this._gameId}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify({ playerId: this._playerId })
    });

    if (!res.ok) {
      const err = await res.json() as { error?: string };
      throw new Error(err.error ?? `Server error ${res.status}`);
    }

    const data = await res.json() as { deletedGame: boolean };
    this.disconnect();
    this._gameId = undefined;
    this._playerId = undefined;
    this._token = undefined;
    this._gameState = undefined;
    this._isSpectator = false;
    return data;
  }

  /**
   * Leave the current game as a spectator.
   */
  async leaveAsSpectator(): Promise<void> {
    if (!this._gameId || !this._playerId) throw new Error('Not in a game');
    const res = await this.fetchImpl(`${this.baseUrl}/games/${this._gameId}/spectate-leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify({})
    });

    if (!res.ok) {
      const err = await res.json() as { error?: string };
      throw new Error(err.error ?? `Server error ${res.status}`);
    }

    this.disconnect();
    this._gameId = undefined;
    this._playerId = undefined;
    this._token = undefined;
    this._gameState = undefined;
    this._isSpectator = false;
  }

  /**
   * Poll the server for the current game state.
   */
  async fetchGameState(): Promise<GameState> {
    if (!this._gameId) throw new Error('Not in a game');

    const url = `${this.baseUrl}/games/${this._gameId}?playerId=${this._playerId ?? ''}`;
    const res = await this.fetchImpl(url, {
      headers: this.authHeaders()
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch game state: ${res.status}`);
    }

    const data = await res.json() as { state: GameState };
    this._gameState = data.state;
    return data.state;
  }

  /**
   * List games waiting for players.
   */
  async listGames(): Promise<Array<{ gameId: string; playerCount: number; readyCount: number }>> {
    const res = await this.fetchImpl(`${this.baseUrl}/games`);
    if (!res.ok) throw new Error(`Failed to list games: ${res.status}`);
    return res.json() as Promise<Array<{ gameId: string; playerCount: number; readyCount: number }>>;
  }

  // ── WebSocket ─────────────────────────────────────────────────────────────

  /**
   * Open a WebSocket connection to the server for real-time updates.
   * Resolves when the server sends the initial 'connected' acknowledgement.
   */
  connect(): Promise<void> {
    if (!this._gameId) {
      return Promise.reject(new Error('Join or create a game before connecting'));
    }

    this._intentionalDisconnect = false;
    this._reconnectAttempts = 0;
    return this._openWebSocket();
  }

  private _openWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const params = new URLSearchParams();
      params.set('gameId', this._gameId!);
      if (this._playerId) params.set('playerId', this._playerId);
      if (this._token) params.set('token', this._token);

      const url = `${this.wsUrl}/?${params.toString()}`;
      const ws = this.wsFactory(url);
      this.ws = ws;

      let resolved = false;
      const onConnectedOnce = (msg: ServerMessage) => {
        if (!resolved && msg.type === 'connected') {
          resolved = true;
          this._reconnectAttempts = 0;
          resolve();
        }
      };

      ws.addEventListener('message', (event?: unknown) => {
        try {
          const data = (event as { data: string }).data;
          const msg = JSON.parse(data) as ServerMessage;
          onConnectedOnce(msg);
          this.handleMessage(msg);
        } catch {
          // ignore malformed frames
        }
      });

      ws.addEventListener('error', (err?: unknown) => {
        if (!resolved) reject(err);
      });

      ws.addEventListener('close', () => {
        if (this._intentionalDisconnect) {
          this.emit('disconnected');
          return;
        }

        if (this._reconnectAttempts < MafiaClient.MAX_RECONNECT_ATTEMPTS) {
          this._reconnectAttempts++;
          this.emit('reconnecting', {
            attempt: this._reconnectAttempts,
            maxAttempts: MafiaClient.MAX_RECONNECT_ATTEMPTS,
          });
          setTimeout(() => {
            this._openWebSocket().catch(() => {
              // If retry also fails, fall through to final disconnect below
              // (the close handler on the new socket will decrement attempts)
            });
          }, this._reconnectDelayMs);
        } else {
          this.emit('disconnected');
        }
      });
    });
  }

  /**
   * Close the WebSocket connection.
   */
  disconnect(): void {
    this._intentionalDisconnect = true;
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private handleMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'connected':
      case 'game_state':
      case 'phase_changed': {
        const p = msg.payload as { state?: GameState } | undefined;
        if (p?.state) {
          this._gameState = p.state;
          this.emit('state_update', this._gameState);
        }
        break;
      }
      case 'game_started': {
        const p = msg.payload as { state?: GameState } | undefined;
        if (p?.state) {
          this._gameState = p.state;
          this.emit('state_update', this._gameState);
        }
        this.emit('game_started', msg.payload);
        break;
      }
      case 'player_ready': {
        const p = msg.payload as { state?: GameState } | undefined;
        if (p?.state) {
          this._gameState = p.state;
        }
        this.emit('player_ready', msg.payload);
        break;
      }
      case 'player_joined':
      case 'player_left':
      case 'player_eliminated':
      case 'game_ended':
      case 'spectator_joined':
      case 'spectator_left': {
        const p = msg.payload as { state?: GameState } | undefined;
        if (p?.state) {
          this._gameState = p.state;
          this.emit('state_update', this._gameState);
        }
        this.emit(msg.type, msg.payload);
        break;
      }
      case 'vote_cast': {
        const p = msg.payload as { votes?: Record<string, string> } | undefined;
        if (p?.votes && this._gameState) {
          this._gameState = { ...this._gameState, votes: p.votes };
          this.emit('state_update', this._gameState);
        }
        this.emit(msg.type, msg.payload);
        break;
      }
      case 'chat_message': {
        const p = msg.payload as ChatMessage | undefined;
        if (p && this._gameState) {
          this._gameState = {
            ...this._gameState,
            messages: [...(this._gameState.messages ?? []), p]
          };
          this.emit('state_update', this._gameState);
        }
        this.emit('chat_message', msg.payload);
        break;
      }
      case 'error':
        this.emit('server_error', msg.payload);
        break;
    }
  }
}

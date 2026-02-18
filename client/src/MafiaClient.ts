import { EventEmitter } from 'events';
import { GameState, ServerMessage, FetchLike } from './types';

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
}

/**
 * MafiaClient — core client logic for connecting to the Mafia game server.
 *
 * Emits:
 *   'state_update'   (gameState: GameState)  — when any state-bearing message arrives
 *   'player_joined'  (payload)
 *   'player_left'    (payload)
 *   'vote_cast'      (payload)
 *   'game_ended'     (payload)
 *   'server_error'   (payload)
 *   'disconnected'   ()
 */
export class MafiaClient extends EventEmitter {
  private readonly baseUrl: string;
  private readonly wsUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly wsFactory: WebSocketFactory;

  private ws?: WebSocketLike;
  private _gameId?: string;
  private _playerId?: string;
  private _gameState?: GameState;

  constructor(serverUrl: string, options: MafiaClientOptions = {}) {
    super();
    const normalised = serverUrl.replace(/\/$/, '');
    this.baseUrl = normalised;
    this.wsUrl = normalised.replace(/^http/, 'ws');

    this.fetchImpl = options.fetch ?? (globalThis as unknown as { fetch: FetchLike }).fetch;

    if (options.webSocketFactory) {
      this.wsFactory = options.webSocketFactory;
    } else {
      // Use the `ws` package when running in Node.js (Electron main / tests)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const WS = require('ws') as new (url: string) => WebSocketLike;
      this.wsFactory = (url: string) => new WS(url);
    }
  }

  // ── Accessors ────────────────────────────────────────────────────────────

  get gameId(): string | undefined { return this._gameId; }
  get playerId(): string | undefined { return this._playerId; }
  get gameState(): GameState | undefined { return this._gameState; }

  isConnected(): boolean {
    return !!this.ws && this.ws.readyState === 1; // WebSocket.OPEN
  }

  // ── HTTP API ─────────────────────────────────────────────────────────────

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

    const data = await res.json() as { gameId: string; playerId: string; state: GameState };
    this._gameId = data.gameId;
    this._playerId = data.playerId;
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

    const data = await res.json() as { playerId: string; state: GameState };
    this._gameId = gameId;
    this._playerId = data.playerId;
    this._gameState = data.state;
    return data.state;
  }

  /**
   * Poll the server for the current game state.
   */
  async fetchGameState(): Promise<GameState> {
    if (!this._gameId) throw new Error('Not in a game');

    const url = `${this.baseUrl}/games/${this._gameId}?playerId=${this._playerId ?? ''}`;
    const res = await this.fetchImpl(url);

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
  async listGames(): Promise<Array<{ gameId: string; playerCount: number }>> {
    const res = await this.fetchImpl(`${this.baseUrl}/games`);
    if (!res.ok) throw new Error(`Failed to list games: ${res.status}`);
    return res.json() as Promise<Array<{ gameId: string; playerCount: number }>>;
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

    return new Promise((resolve, reject) => {
      const url = `${this.wsUrl}/?gameId=${this._gameId}&playerId=${this._playerId ?? ''}`;
      const ws = this.wsFactory(url);
      this.ws = ws;

      const onConnectedOnce = (msg: ServerMessage) => {
        if (msg.type === 'connected') resolve();
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

      ws.addEventListener('error', (err?: unknown) => reject(err));
      ws.addEventListener('close', () => this.emit('disconnected'));
    });
  }

  /**
   * Close the WebSocket connection.
   */
  disconnect(): void {
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
      case 'player_joined':
      case 'player_left':
      case 'vote_cast':
      case 'player_eliminated':
      case 'game_ended':
        this.emit(msg.type, msg.payload);
        break;
      case 'error':
        this.emit('server_error', msg.payload);
        break;
    }
  }
}

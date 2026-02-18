import { MafiaClient, WebSocketLike, WebSocketFactory } from '../src/MafiaClient';
import { GameState } from '../src/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    id: 'game-123',
    phase: 'lobby',
    status: 'waiting',
    players: [{ id: 'p1', name: 'Alice', isAlive: true, isConnected: true }],
    round: 0,
    hostId: 'p1',
    votes: {},
    nightActions: {},
    settings: {
      minPlayers: 4,
      maxPlayers: 12,
      mafiaRatio: 0.25,
      hasDoctor: true,
      hasDetective: true
    },
    ...overrides
  };
}

type FetchMock = jest.Mock<Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>>;

function makeFetch(responses: Array<{ ok: boolean; body: unknown }>): FetchMock {
  let i = 0;
  return jest.fn().mockImplementation(() => {
    const r = responses[i++] ?? responses[responses.length - 1];
    return Promise.resolve({
      ok: r.ok,
      status: r.ok ? 200 : 400,
      json: () => Promise.resolve(r.body)
    });
  });
}

// A minimal mock WebSocket that fires 'connected' on open
class MockWebSocket implements WebSocketLike {
  readyState = 1; // OPEN
  private handlers: Record<string, Array<(e?: unknown) => void>> = {};
  sentMessages: string[] = [];

  addEventListener(type: string, listener: (e?: unknown) => void): void {
    this.handlers[type] = this.handlers[type] ?? [];
    this.handlers[type].push(listener);
  }

  send(data: string): void { this.sentMessages.push(data); }
  close(): void { this.readyState = 3; this.fire('close'); }

  fire(type: string, event?: unknown): void {
    for (const h of this.handlers[type] ?? []) h(event);
  }

  /** Simulate receiving a server message */
  receive(msg: object): void {
    this.fire('message', { data: JSON.stringify(msg) });
  }
}

function makeWsFactory(ws: MockWebSocket): WebSocketFactory {
  return (_url: string) => ws;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MafiaClient — createGame', () => {
  it('POST /games and stores gameId, playerId, gameState', async () => {
    const state = makeGameState();
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const client = new MafiaClient('http://localhost:3000', { fetch });

    const result = await client.createGame('Alice');

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/games',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result).toEqual(state);
    expect(client.gameId).toBe('g1');
    expect(client.playerId).toBe('p1');
    expect(client.gameState).toEqual(state);
  });

  it('throws on non-OK response', async () => {
    const fetch = makeFetch([{ ok: false, body: { error: 'hostName is required' } }]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await expect(client.createGame('')).rejects.toThrow('hostName is required');
  });

  it('throws generic error when no error field in response', async () => {
    const fetch = makeFetch([{ ok: false, body: {} }]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await expect(client.createGame('Alice')).rejects.toThrow('Server error 400');
  });

  it('passes settings to server', async () => {
    const state = makeGameState();
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const client = new MafiaClient('http://localhost:3000', { fetch });

    await client.createGame('Alice', { minPlayers: 6 });

    const body = JSON.parse((fetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.settings.minPlayers).toBe(6);
  });
});

describe('MafiaClient — joinGame', () => {
  it('POST /games/:id/join and stores ids', async () => {
    const state = makeGameState();
    const fetch = makeFetch([{ ok: true, body: { playerId: 'p2', state } }]);
    const client = new MafiaClient('http://localhost:3000', { fetch });

    const result = await client.joinGame('game-123', 'Bob');

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/games/game-123/join',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result).toEqual(state);
    expect(client.gameId).toBe('game-123');
    expect(client.playerId).toBe('p2');
  });

  it('throws on error', async () => {
    const fetch = makeFetch([{ ok: false, body: { error: 'Game not found' } }]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await expect(client.joinGame('bad-id', 'Bob')).rejects.toThrow('Game not found');
  });

  it('throws generic error when no error field', async () => {
    const fetch = makeFetch([{ ok: false, body: {} }]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await expect(client.joinGame('g1', 'Bob')).rejects.toThrow('Server error 400');
  });
});

describe('MafiaClient — fetchGameState', () => {
  it('throws when not in a game', async () => {
    const fetch = makeFetch([]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await expect(client.fetchGameState()).rejects.toThrow('Not in a game');
  });

  it('GETs game state and stores it', async () => {
    const state = makeGameState({ phase: 'day', round: 2 });
    const createFetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state: makeGameState() } },
      { ok: true, body: { state } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch: createFetch });

    await client.createGame('Alice');
    const result = await client.fetchGameState();

    expect(result).toEqual(state);
    expect(client.gameState).toEqual(state);
    expect(createFetch.mock.calls[1][0]).toContain('/games/g1?playerId=p1');
  });

  it('throws on non-OK response', async () => {
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state: makeGameState() } },
      { ok: false, body: {} }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    await expect(client.fetchGameState()).rejects.toThrow('Failed to fetch game state');
  });
});

describe('MafiaClient — listGames', () => {
  it('GET /games and returns list', async () => {
    const list = [{ gameId: 'g1', playerCount: 2 }];
    const fetch = makeFetch([{ ok: true, body: list }]);
    const client = new MafiaClient('http://localhost:3000', { fetch });

    const result = await client.listGames();
    expect(result).toEqual(list);
    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/games');
  });

  it('throws on error', async () => {
    const fetch = makeFetch([{ ok: false, body: {} }]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await expect(client.listGames()).rejects.toThrow('Failed to list games');
  });
});

describe('MafiaClient — connect (WebSocket)', () => {
  it('rejects when not in a game', async () => {
    const client = new MafiaClient('http://localhost:3000', {
      fetch: makeFetch([]),
      webSocketFactory: makeWsFactory(new MockWebSocket())
    });
    await expect(client.connect()).rejects.toThrow('Join or create a game');
  });

  it('resolves when server sends connected message', async () => {
    const state = makeGameState();
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const ws = new MockWebSocket();
    const client = new MafiaClient('http://localhost:3000', {
      fetch,
      webSocketFactory: makeWsFactory(ws)
    });

    await client.createGame('Alice');

    const connectPromise = client.connect();
    ws.receive({ type: 'connected', payload: { state } });
    await connectPromise;

    expect(client.isConnected()).toBe(true);
  });

  it('emits state_update on connected message with state payload', async () => {
    const state = makeGameState();
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const ws = new MockWebSocket();
    const client = new MafiaClient('http://localhost:3000', {
      fetch,
      webSocketFactory: makeWsFactory(ws)
    });

    await client.createGame('Alice');

    const updates: GameState[] = [];
    client.on('state_update', (s) => updates.push(s));

    const connectPromise = client.connect();
    ws.receive({ type: 'connected', payload: { state } });
    await connectPromise;

    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual(state);
  });

  it('emits state_update on game_state message', async () => {
    const state = makeGameState();
    const newState = makeGameState({ phase: 'day', round: 1 });
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const ws = new MockWebSocket();
    const client = new MafiaClient('http://localhost:3000', {
      fetch,
      webSocketFactory: makeWsFactory(ws)
    });

    await client.createGame('Alice');
    const connectPromise = client.connect();
    ws.receive({ type: 'connected', payload: { state } });
    await connectPromise;

    const updates: GameState[] = [];
    client.on('state_update', (s) => updates.push(s));

    ws.receive({ type: 'game_state', payload: { state: newState } });
    expect(updates[0]).toEqual(newState);
    expect(client.gameState).toEqual(newState);
  });

  it('emits state_update on phase_changed message', async () => {
    const state = makeGameState();
    const newState = makeGameState({ phase: 'night' });
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const ws = new MockWebSocket();
    const client = new MafiaClient('http://localhost:3000', {
      fetch,
      webSocketFactory: makeWsFactory(ws)
    });

    await client.createGame('Alice');
    const connectPromise = client.connect();
    ws.receive({ type: 'connected', payload: { state } });
    await connectPromise;

    const updates: GameState[] = [];
    client.on('state_update', (s) => updates.push(s));
    ws.receive({ type: 'phase_changed', payload: { state: newState } });
    expect(updates[0]).toEqual(newState);
  });

  it('emits player_joined event', async () => {
    const state = makeGameState();
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const ws = new MockWebSocket();
    const client = new MafiaClient('http://localhost:3000', {
      fetch,
      webSocketFactory: makeWsFactory(ws)
    });

    await client.createGame('Alice');
    const connectPromise = client.connect();
    ws.receive({ type: 'connected', payload: { state } });
    await connectPromise;

    const events: unknown[] = [];
    client.on('player_joined', (p) => events.push(p));
    ws.receive({ type: 'player_joined', payload: { playerId: 'p2' } });
    expect(events).toHaveLength(1);
  });

  it('emits player_left event', async () => {
    const state = makeGameState();
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const ws = new MockWebSocket();
    const client = new MafiaClient('http://localhost:3000', {
      fetch,
      webSocketFactory: makeWsFactory(ws)
    });

    await client.createGame('Alice');
    const connectPromise = client.connect();
    ws.receive({ type: 'connected', payload: { state } });
    await connectPromise;

    const events: unknown[] = [];
    client.on('player_left', (p) => events.push(p));
    ws.receive({ type: 'player_left', payload: { playerId: 'p2' } });
    expect(events).toHaveLength(1);
  });

  it('emits vote_cast event', async () => {
    const state = makeGameState();
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const ws = new MockWebSocket();
    const client = new MafiaClient('http://localhost:3000', {
      fetch,
      webSocketFactory: makeWsFactory(ws)
    });

    await client.createGame('Alice');
    const connectPromise = client.connect();
    ws.receive({ type: 'connected', payload: { state } });
    await connectPromise;

    const events: unknown[] = [];
    client.on('vote_cast', (p) => events.push(p));
    ws.receive({ type: 'vote_cast', payload: { voterId: 'p1', targetId: 'p2' } });
    expect(events).toHaveLength(1);
  });

  it('emits player_eliminated event', async () => {
    const state = makeGameState();
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const ws = new MockWebSocket();
    const client = new MafiaClient('http://localhost:3000', {
      fetch,
      webSocketFactory: makeWsFactory(ws)
    });

    await client.createGame('Alice');
    const connectPromise = client.connect();
    ws.receive({ type: 'connected', payload: { state } });
    await connectPromise;

    const events: unknown[] = [];
    client.on('player_eliminated', (p) => events.push(p));
    ws.receive({ type: 'player_eliminated', payload: { playerId: 'p2' } });
    expect(events).toHaveLength(1);
  });

  it('emits game_ended event', async () => {
    const state = makeGameState();
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const ws = new MockWebSocket();
    const client = new MafiaClient('http://localhost:3000', {
      fetch,
      webSocketFactory: makeWsFactory(ws)
    });

    await client.createGame('Alice');
    const connectPromise = client.connect();
    ws.receive({ type: 'connected', payload: { state } });
    await connectPromise;

    const events: unknown[] = [];
    client.on('game_ended', (p) => events.push(p));
    ws.receive({ type: 'game_ended', payload: { winner: 'town' } });
    expect(events).toHaveLength(1);
  });

  it('emits server_error event', async () => {
    const state = makeGameState();
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const ws = new MockWebSocket();
    const client = new MafiaClient('http://localhost:3000', {
      fetch,
      webSocketFactory: makeWsFactory(ws)
    });

    await client.createGame('Alice');
    const connectPromise = client.connect();
    ws.receive({ type: 'connected', payload: { state } });
    await connectPromise;

    const errors: unknown[] = [];
    client.on('server_error', (e) => errors.push(e));
    ws.receive({ type: 'error', payload: { message: 'oops' } });
    expect(errors).toHaveLength(1);
  });

  it('ignores messages with no payload state for state-bearing types', async () => {
    const state = makeGameState();
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const ws = new MockWebSocket();
    const client = new MafiaClient('http://localhost:3000', {
      fetch,
      webSocketFactory: makeWsFactory(ws)
    });

    await client.createGame('Alice');
    const connectPromise = client.connect();
    ws.receive({ type: 'connected', payload: { state } });
    await connectPromise;

    const updates: GameState[] = [];
    client.on('state_update', (s) => updates.push(s));
    // game_state with no state in payload — should not emit
    ws.receive({ type: 'game_state', payload: {} });
    expect(updates).toHaveLength(0);
  });

  it('ignores malformed JSON messages', async () => {
    const state = makeGameState();
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const ws = new MockWebSocket();
    const client = new MafiaClient('http://localhost:3000', {
      fetch,
      webSocketFactory: makeWsFactory(ws)
    });

    await client.createGame('Alice');
    const connectPromise = client.connect();
    ws.receive({ type: 'connected', payload: { state } });
    await connectPromise;

    // Fire a raw invalid JSON message — should not throw
    expect(() => ws.fire('message', { data: 'not-json{' })).not.toThrow();
  });

  it('emits disconnected on WebSocket close', async () => {
    const state = makeGameState();
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const ws = new MockWebSocket();
    const client = new MafiaClient('http://localhost:3000', {
      fetch,
      webSocketFactory: makeWsFactory(ws)
    });

    await client.createGame('Alice');
    const connectPromise = client.connect();
    ws.receive({ type: 'connected', payload: { state } });
    await connectPromise;

    const disconnected: boolean[] = [];
    client.on('disconnected', () => disconnected.push(true));
    ws.close();
    expect(disconnected).toHaveLength(1);
  });

  it('rejects connect on WebSocket error', async () => {
    const state = makeGameState();
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const ws = new MockWebSocket();
    const client = new MafiaClient('http://localhost:3000', {
      fetch,
      webSocketFactory: makeWsFactory(ws)
    });

    await client.createGame('Alice');
    const connectPromise = client.connect();
    ws.fire('error', new Error('connection refused'));
    await expect(connectPromise).rejects.toBeDefined();
  });
});

describe('MafiaClient — disconnect', () => {
  it('closes WebSocket and isConnected returns false', async () => {
    const state = makeGameState();
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const ws = new MockWebSocket();
    const client = new MafiaClient('http://localhost:3000', {
      fetch,
      webSocketFactory: makeWsFactory(ws)
    });

    await client.createGame('Alice');
    const connectPromise = client.connect();
    ws.receive({ type: 'connected', payload: { state } });
    await connectPromise;

    expect(client.isConnected()).toBe(true);
    client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  it('is safe to call when not connected', () => {
    const client = new MafiaClient('http://localhost:3000', {
      fetch: makeFetch([])
    });
    expect(() => client.disconnect()).not.toThrow();
  });
});

describe('MafiaClient — isConnected', () => {
  it('returns false when no WebSocket', () => {
    const client = new MafiaClient('http://localhost:3000', { fetch: makeFetch([]) });
    expect(client.isConnected()).toBe(false);
  });
});

describe('MafiaClient — URL normalisation', () => {
  it('strips trailing slash from server URL', async () => {
    const state = makeGameState();
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const client = new MafiaClient('http://localhost:3000/', { fetch });
    await client.createGame('Alice');
    expect(fetch.mock.calls[0][0]).toBe('http://localhost:3000/games');
  });
});

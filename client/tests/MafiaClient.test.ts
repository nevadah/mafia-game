import { MafiaClient, WebSocketLike, WebSocketFactory } from '../src/MafiaClient';
import { GameState } from '../src/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    id: 'game-123',
    phase: 'lobby',
    status: 'waiting',
    players: [{ id: 'p1', name: 'Alice', isAlive: true, isConnected: true, isReady: false }],
    spectators: [],
    round: 0,
    hostId: 'p1',
    votes: {},
    nightActions: {},
    settings: {
      minPlayers: 4,
      maxPlayers: 12,
      mafiaRatio: 0.25,
      hasDoctor: true,
      hasSheriff: true
    },
    readyCount: 0,
    messages: [],
    eliminations: [],
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
    // Simulate a failed reconnect: if already closed, fire close immediately.
    if (type === 'close' && this.readyState === 3) {
      listener();
    }
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

/** Helper: create a connected client (reconnectDelayMs defaults to 0 for fast test retries) */
async function makeConnectedClient(stateOverrides: Partial<GameState> = {}) {
  const state = makeGameState(stateOverrides);
  const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
  const ws = new MockWebSocket();
  const client = new MafiaClient('http://localhost:3000', { fetch, webSocketFactory: makeWsFactory(ws), reconnectDelayMs: 0 });
  await client.createGame('Alice');
  const connectPromise = client.connect();
  ws.receive({ type: 'connected', payload: { state } });
  await connectPromise;
  return { client, ws, fetch, state };
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

describe('MafiaClient — markReady', () => {
  it('throws when not in a game', async () => {
    const client = new MafiaClient('http://localhost:3000', { fetch: makeFetch([]) });
    await expect(client.markReady()).rejects.toThrow('Not in a game');
  });

  it('POST /games/:id/ready with playerId', async () => {
    const state = makeGameState();
    const readyState = makeGameState({ readyCount: 1 });
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: true, body: { allReady: false, readyCount: 1, state: readyState } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');

    const result = await client.markReady();

    expect(fetch.mock.calls[1][0]).toContain('/games/g1/ready');
    expect(result.readyCount).toBe(1);
    expect(result.allReady).toBe(false);
    expect(client.gameState).toEqual(readyState);
  });

  it('reports allReady true when all players ready', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: true, body: { allReady: true, readyCount: 4, state } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    const result = await client.markReady();
    expect(result.allReady).toBe(true);
  });

  it('throws on error response', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: false, body: { error: 'Player not found' } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    await expect(client.markReady()).rejects.toThrow('Player not found');
  });

  it('throws generic error when no error field', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: false, body: {} }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    await expect(client.markReady()).rejects.toThrow('Server error 400');
  });
});

describe('MafiaClient — markUnready', () => {
  it('throws when not in a game', async () => {
    const client = new MafiaClient('http://localhost:3000', { fetch: makeFetch([]) });
    await expect(client.markUnready()).rejects.toThrow('Not in a game');
  });

  it('POST /games/:id/unready and updates state', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: true, body: { allReady: false, readyCount: 0, state } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    await client.markUnready();

    expect(fetch.mock.calls[1][0]).toContain('/games/g1/unready');
    expect(client.gameState).toEqual(state);
  });

  it('throws on error response', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: false, body: { error: 'Player not found' } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    await expect(client.markUnready()).rejects.toThrow('Player not found');
  });

  it('throws generic error when no error field', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: false, body: {} }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    await expect(client.markUnready()).rejects.toThrow('Server error 400');
  });
});

describe('MafiaClient — startGame', () => {
  it('throws when not in a game', async () => {
    const client = new MafiaClient('http://localhost:3000', { fetch: makeFetch([]) });
    await expect(client.startGame()).rejects.toThrow('Not in a game');
  });

  it('POST /games/:id/start and stores state', async () => {
    const state = makeGameState();
    const activeState = makeGameState({ status: 'active', phase: 'day', round: 1 });
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: true, body: { state: activeState } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    const result = await client.startGame();

    expect(fetch.mock.calls[1][0]).toContain('/games/g1/start');
    expect(result.status).toBe('active');
    expect(client.gameState?.status).toBe('active');
  });

  it('throws on error response', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: false, body: { error: 'Need at least 4 players' } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    await expect(client.startGame()).rejects.toThrow('Need at least 4 players');
  });

  it('throws generic error when no error field', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: false, body: {} }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    await expect(client.startGame()).rejects.toThrow('Server error 400');
  });
});

describe('MafiaClient — castVote', () => {
  it('throws when not in a game', async () => {
    const client = new MafiaClient('http://localhost:3000', { fetch: makeFetch([]) });
    await expect(client.castVote('p2')).rejects.toThrow('Not in a game');
  });

  it('POST /games/:id/vote with voterId and targetId', async () => {
    const state = makeGameState({ status: 'active', phase: 'day' });
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: true, body: { state } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    const result = await client.castVote('p2');

    expect(fetch.mock.calls[1][0]).toContain('/games/g1/vote');
    const body = JSON.parse((fetch.mock.calls[1][1] as RequestInit).body as string);
    expect(body.voterId).toBe('p1');
    expect(body.targetId).toBe('p2');
    expect(result).toEqual(state);
  });

  it('throws on error response', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: false, body: { error: 'Cannot vote for yourself' } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    await expect(client.castVote('p1')).rejects.toThrow('Cannot vote for yourself');
  });

  it('throws generic error when no error field', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: false, body: {} }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    await expect(client.castVote('p2')).rejects.toThrow('Server error 400');
  });
});

describe('MafiaClient — submitNightAction', () => {
  it('throws when not in a game', async () => {
    const client = new MafiaClient('http://localhost:3000', { fetch: makeFetch([]) });
    await expect(client.submitNightAction('p2')).rejects.toThrow('Not in a game');
  });

  it('POST /games/:id/night-action', async () => {
    const state = makeGameState({ status: 'active', phase: 'night' });
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: true, body: { state } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    const result = await client.submitNightAction('p2');

    expect(fetch.mock.calls[1][0]).toContain('/games/g1/night-action');
    const body = JSON.parse((fetch.mock.calls[1][1] as RequestInit).body as string);
    expect(body.playerId).toBe('p1');
    expect(body.targetId).toBe('p2');
    expect(result).toEqual(state);
  });

  it('throws on error response', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: false, body: { error: 'Night actions only allowed during night phase' } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    await expect(client.submitNightAction('p2')).rejects.toThrow('Night actions only allowed during night phase');
  });

  it('throws generic error when no error field', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: false, body: {} }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    await expect(client.submitNightAction('p2')).rejects.toThrow('Server error 400');
  });
});

describe('MafiaClient — resolveVotes', () => {
  it('throws when not in a game', async () => {
    const client = new MafiaClient('http://localhost:3000', { fetch: makeFetch([]) });
    await expect(client.resolveVotes()).rejects.toThrow('Not in a game');
  });

  it('POST /games/:id/resolve-votes and returns result', async () => {
    const state = makeGameState({ status: 'active', phase: 'day' });
    const nightState = makeGameState({ status: 'active', phase: 'night' });
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: true, body: { eliminated: 'p2', winner: null, state: nightState } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    const result = await client.resolveVotes();

    expect(fetch.mock.calls[1][0]).toContain('/games/g1/resolve-votes');
    expect(result.eliminated).toBe('p2');
    expect(result.winner).toBeNull();
    expect(client.gameState?.phase).toBe('night');
  });

  it('returns winner when game ends', async () => {
    const state = makeGameState({ status: 'active', phase: 'day' });
    const endState = makeGameState({ status: 'ended', phase: 'ended', winner: 'town' });
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: true, body: { eliminated: 'p2', winner: 'town', state: endState } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    const result = await client.resolveVotes();
    expect(result.winner).toBe('town');
  });

  it('throws on error response', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: false, body: { error: 'Only the host can resolve votes' } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    await expect(client.resolveVotes()).rejects.toThrow('Only the host can resolve votes');
  });

  it('throws generic error when no error field', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: false, body: {} }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    await expect(client.resolveVotes()).rejects.toThrow('Server error 400');
  });
});

describe('MafiaClient — resolveNight', () => {
  it('throws when not in a game', async () => {
    const client = new MafiaClient('http://localhost:3000', { fetch: makeFetch([]) });
    await expect(client.resolveNight()).rejects.toThrow('Not in a game');
  });

  it('POST /games/:id/resolve-night and returns result', async () => {
    const state = makeGameState({ status: 'active', phase: 'night' });
    const dayState = makeGameState({ status: 'active', phase: 'day', round: 2 });
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: true, body: { eliminated: 'p3', winner: null, state: dayState } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    const result = await client.resolveNight();

    expect(fetch.mock.calls[1][0]).toContain('/games/g1/resolve-night');
    expect(result.eliminated).toBe('p3');
    expect(result.winner).toBeNull();
    expect(client.gameState?.phase).toBe('day');
  });

  it('returns winner when mafia wins', async () => {
    const state = makeGameState({ status: 'active', phase: 'night' });
    const endState = makeGameState({ status: 'ended', phase: 'ended', winner: 'mafia' });
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: true, body: { eliminated: 'p2', winner: 'mafia', state: endState } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    const result = await client.resolveNight();
    expect(result.winner).toBe('mafia');
  });

  it('throws on error response', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: false, body: { error: 'Only the host can resolve night actions' } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    await expect(client.resolveNight()).rejects.toThrow('Only the host can resolve night actions');
  });

  it('throws generic error when no error field', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: false, body: {} }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    await expect(client.resolveNight()).rejects.toThrow('Server error 400');
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
    const list = [{ gameId: 'g1', playerCount: 2, readyCount: 1 }];
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

describe('MafiaClient — getMyRole', () => {
  it('returns undefined when not in a game', () => {
    const client = new MafiaClient('http://localhost:3000', { fetch: makeFetch([]) });
    expect(client.getMyRole()).toBeUndefined();
  });

  it('returns undefined when player has no role (lobby)', async () => {
    const state = makeGameState();
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    expect(client.getMyRole()).toBeUndefined();
  });

  it('returns the role when assigned', async () => {
    const state = makeGameState({
      status: 'active',
      phase: 'day',
      players: [{ id: 'p1', name: 'Alice', isAlive: true, isConnected: true, isReady: true, role: 'sheriff' }]
    });
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    expect(client.getMyRole()).toBe('sheriff');
  });

  it('returns mafia role when assigned mafia', async () => {
    const state = makeGameState({
      status: 'active',
      phase: 'day',
      players: [{ id: 'p1', name: 'Alice', isAlive: true, isConnected: true, isReady: true, role: 'mafia' }]
    });
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    expect(client.getMyRole()).toBe('mafia');
  });

  it('returns doctor role when assigned doctor', async () => {
    const state = makeGameState({
      status: 'active',
      phase: 'day',
      players: [{ id: 'p1', name: 'Alice', isAlive: true, isConnected: true, isReady: true, role: 'doctor' }]
    });
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    expect(client.getMyRole()).toBe('doctor');
  });

  it('returns townsperson role when assigned townsperson', async () => {
    const state = makeGameState({
      status: 'active',
      phase: 'day',
      players: [{ id: 'p1', name: 'Alice', isAlive: true, isConnected: true, isReady: true, role: 'townsperson' }]
    });
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    expect(client.getMyRole()).toBe('townsperson');
  });
});

describe('MafiaClient — getEndGameSummary', () => {
  it('returns null when game not ended', async () => {
    const state = makeGameState({ status: 'active', phase: 'day' });
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    expect(client.getEndGameSummary()).toBeNull();
  });

  it('returns null when not in a game', () => {
    const client = new MafiaClient('http://localhost:3000', { fetch: makeFetch([]) });
    expect(client.getEndGameSummary()).toBeNull();
  });

  it('returns null when status is ended but no winner', async () => {
    const state = makeGameState({ status: 'ended', phase: 'ended' });
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    expect(client.getEndGameSummary()).toBeNull();
  });

  it('returns summary with winner and players when town wins', async () => {
    const state = makeGameState({
      status: 'ended',
      phase: 'ended',
      winner: 'town',
      players: [
        { id: 'p1', name: 'Alice', isAlive: true, isConnected: true, isReady: true, role: 'sheriff' },
        { id: 'p2', name: 'Bob', isAlive: false, isConnected: false, isReady: true, role: 'mafia' }
      ]
    });
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    const summary = client.getEndGameSummary();
    expect(summary).not.toBeNull();
    expect(summary!.winner).toBe('town');
    expect(summary!.players).toHaveLength(2);
    expect(summary!.players.find(p => p.id === 'p2')?.role).toBe('mafia');
  });

  it('returns summary with mafia winner', async () => {
    const state = makeGameState({
      status: 'ended',
      phase: 'ended',
      winner: 'mafia'
    });
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    const summary = client.getEndGameSummary();
    expect(summary!.winner).toBe('mafia');
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
    const { client } = await makeConnectedClient();
    expect(client.isConnected()).toBe(true);
  });

  it('emits state_update on connected message with state payload', async () => {
    const state = makeGameState();
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const ws = new MockWebSocket();
    const client = new MafiaClient('http://localhost:3000', { fetch, webSocketFactory: makeWsFactory(ws) });
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
    const newState = makeGameState({ phase: 'day', round: 1 });
    const { client, ws } = await makeConnectedClient();

    const updates: GameState[] = [];
    client.on('state_update', (s) => updates.push(s));
    ws.receive({ type: 'game_state', payload: { state: newState } });
    expect(updates[0]).toEqual(newState);
    expect(client.gameState).toEqual(newState);
  });

  it('emits state_update on phase_changed message', async () => {
    const newState = makeGameState({ phase: 'night' });
    const { client, ws } = await makeConnectedClient();

    const updates: GameState[] = [];
    client.on('state_update', (s) => updates.push(s));
    ws.receive({ type: 'phase_changed', payload: { state: newState } });
    expect(updates[0]).toEqual(newState);
  });

  it('emits state_update and game_started on game_started message', async () => {
    const activeState = makeGameState({ status: 'active', phase: 'day', round: 1 });
    const { client, ws } = await makeConnectedClient();

    const stateUpdates: GameState[] = [];
    const startedEvents: unknown[] = [];
    client.on('state_update', (s) => stateUpdates.push(s));
    client.on('game_started', (p) => startedEvents.push(p));

    ws.receive({ type: 'game_started', payload: { state: activeState } });
    expect(stateUpdates).toHaveLength(1);
    expect(stateUpdates[0].status).toBe('active');
    expect(startedEvents).toHaveLength(1);
    expect(client.gameState?.phase).toBe('day');
  });

  it('handles game_started without state payload', async () => {
    const { client, ws } = await makeConnectedClient();

    const startedEvents: unknown[] = [];
    client.on('game_started', (p) => startedEvents.push(p));
    ws.receive({ type: 'game_started', payload: {} });
    expect(startedEvents).toHaveLength(1);
  });

  it('emits player_ready and updates state on player_ready message', async () => {
    const readyState = makeGameState({ readyCount: 1 });
    const { client, ws } = await makeConnectedClient();

    const readyEvents: unknown[] = [];
    client.on('player_ready', (p) => readyEvents.push(p));
    ws.receive({ type: 'player_ready', payload: { playerId: 'p1', readyCount: 1, allReady: false, state: readyState } });

    expect(readyEvents).toHaveLength(1);
    expect(client.gameState?.readyCount).toBe(1);
  });

  it('handles player_ready without state payload', async () => {
    const { client, ws } = await makeConnectedClient();

    const readyEvents: unknown[] = [];
    client.on('player_ready', (p) => readyEvents.push(p));
    ws.receive({ type: 'player_ready', payload: { playerId: 'p1', readyCount: 1 } });
    expect(readyEvents).toHaveLength(1);
  });

  it('emits player_joined event', async () => {
    const { client, ws } = await makeConnectedClient();

    const events: unknown[] = [];
    client.on('player_joined', (p) => events.push(p));
    ws.receive({ type: 'player_joined', payload: { playerId: 'p2' } });
    expect(events).toHaveLength(1);
  });

  it('emits state_update and updates gameState on player_joined with state', async () => {
    const joinedState = makeGameState({ readyCount: 0 });
    const { client, ws } = await makeConnectedClient();

    const stateUpdates: GameState[] = [];
    const joinedEvents: unknown[] = [];
    client.on('state_update', (s) => stateUpdates.push(s));
    client.on('player_joined', (p) => joinedEvents.push(p));
    ws.receive({ type: 'player_joined', payload: { playerId: 'p2', state: joinedState } });

    expect(stateUpdates).toHaveLength(1);
    expect(stateUpdates[0]).toEqual(joinedState);
    expect(client.gameState).toEqual(joinedState);
    expect(joinedEvents).toHaveLength(1);
  });

  it('does not emit state_update on player_joined without state', async () => {
    const { client, ws } = await makeConnectedClient();

    const stateUpdates: GameState[] = [];
    client.on('state_update', (s) => stateUpdates.push(s));
    ws.receive({ type: 'player_joined', payload: { playerId: 'p2' } });
    expect(stateUpdates).toHaveLength(0);
  });

  it('emits player_left event', async () => {
    const { client, ws } = await makeConnectedClient();

    const events: unknown[] = [];
    client.on('player_left', (p) => events.push(p));
    ws.receive({ type: 'player_left', payload: { playerId: 'p2' } });
    expect(events).toHaveLength(1);
  });

  it('emits state_update and updates gameState on player_left with state', async () => {
    const leftState = makeGameState();
    const { client, ws } = await makeConnectedClient();

    const stateUpdates: GameState[] = [];
    const leftEvents: unknown[] = [];
    client.on('state_update', (s) => stateUpdates.push(s));
    client.on('player_left', (p) => leftEvents.push(p));
    ws.receive({ type: 'player_left', payload: { playerId: 'p2', state: leftState } });

    expect(stateUpdates).toHaveLength(1);
    expect(stateUpdates[0]).toEqual(leftState);
    expect(client.gameState).toEqual(leftState);
    expect(leftEvents).toHaveLength(1);
  });

  it('emits vote_cast event', async () => {
    const { client, ws } = await makeConnectedClient();

    const events: unknown[] = [];
    client.on('vote_cast', (p) => events.push(p));
    ws.receive({ type: 'vote_cast', payload: { voterId: 'p1', targetId: 'p2' } });
    expect(events).toHaveLength(1);
  });

  it('emits state_update and updates votes on vote_cast with votes map', async () => {
    const { client, ws } = await makeConnectedClient({ status: 'active', phase: 'day', votes: {} });

    const stateUpdates: GameState[] = [];
    client.on('state_update', (s) => stateUpdates.push(s));

    ws.receive({ type: 'vote_cast', payload: { voterId: 'p1', targetId: 'p2', votes: { p1: 'p2' } } });

    expect(stateUpdates).toHaveLength(1);
    expect(stateUpdates[0].votes).toEqual({ p1: 'p2' });
    expect(client.gameState?.votes).toEqual({ p1: 'p2' });
  });

  it('does not emit state_update on vote_cast when gameState is not set', async () => {
    const { client, ws } = await makeConnectedClient();
    // Clear the stored state to simulate an edge case
    (client as unknown as { _gameState: undefined })._gameState = undefined;

    const stateUpdates: GameState[] = [];
    client.on('state_update', (s) => stateUpdates.push(s));

    ws.receive({ type: 'vote_cast', payload: { voterId: 'p1', targetId: 'p2', votes: { p1: 'p2' } } });
    expect(stateUpdates).toHaveLength(0);
  });

  it('emits player_eliminated event', async () => {
    const { client, ws } = await makeConnectedClient();

    const events: unknown[] = [];
    client.on('player_eliminated', (p) => events.push(p));
    ws.receive({ type: 'player_eliminated', payload: { playerId: 'p2' } });
    expect(events).toHaveLength(1);
  });

  it('emits state_update and updates gameState on player_eliminated with state', async () => {
    const eliminatedState = makeGameState({ status: 'active', phase: 'night' });
    const { client, ws } = await makeConnectedClient();

    const stateUpdates: GameState[] = [];
    const eliminatedEvents: unknown[] = [];
    client.on('state_update', (s) => stateUpdates.push(s));
    client.on('player_eliminated', (p) => eliminatedEvents.push(p));
    ws.receive({ type: 'player_eliminated', payload: { playerId: 'p2', state: eliminatedState } });

    expect(stateUpdates).toHaveLength(1);
    expect(stateUpdates[0]).toEqual(eliminatedState);
    expect(client.gameState).toEqual(eliminatedState);
    expect(eliminatedEvents).toHaveLength(1);
  });

  it('emits game_ended event and summary is available', async () => {
    const endedState = makeGameState({
      status: 'ended',
      phase: 'ended',
      winner: 'town',
      players: [
        { id: 'p1', name: 'Alice', isAlive: true, isConnected: true, isReady: true, role: 'sheriff' }
      ]
    });
    const { client, ws } = await makeConnectedClient();

    const events: unknown[] = [];
    client.on('game_ended', (p) => events.push(p));
    ws.receive({ type: 'game_ended', payload: { winner: 'town', state: endedState } });
    expect(events).toHaveLength(1);
  });

  it('emits state_update and updates gameState on game_ended with state', async () => {
    const endedState = makeGameState({ status: 'ended', phase: 'ended', winner: 'mafia' });
    const { client, ws } = await makeConnectedClient();

    const stateUpdates: GameState[] = [];
    const endedEvents: unknown[] = [];
    client.on('state_update', (s) => stateUpdates.push(s));
    client.on('game_ended', (p) => endedEvents.push(p));
    ws.receive({ type: 'game_ended', payload: { winner: 'mafia', state: endedState } });

    expect(stateUpdates).toHaveLength(1);
    expect(stateUpdates[0]).toEqual(endedState);
    expect(client.gameState).toEqual(endedState);
    expect(endedEvents).toHaveLength(1);
  });

  it('emits server_error event', async () => {
    const { client, ws } = await makeConnectedClient();

    const errors: unknown[] = [];
    client.on('server_error', (e) => errors.push(e));
    ws.receive({ type: 'error', payload: { message: 'oops' } });
    expect(errors).toHaveLength(1);
  });

  it('ignores messages with no payload state for state-bearing types', async () => {
    const { client, ws } = await makeConnectedClient();

    const updates: GameState[] = [];
    client.on('state_update', (s) => updates.push(s));
    ws.receive({ type: 'game_state', payload: {} });
    expect(updates).toHaveLength(0);
  });

  it('ignores malformed JSON messages', async () => {
    const { ws } = await makeConnectedClient();
    expect(() => ws.fire('message', { data: 'not-json{' })).not.toThrow();
  });

  it('emits disconnected after all reconnect attempts fail', async () => {
    const { client, ws } = await makeConnectedClient();

    const disconnected = new Promise<void>(resolve => client.once('disconnected', resolve));
    ws.close();
    await disconnected; // retries exhaust (reconnectDelayMs: 0 + mock auto-closes)
  });

  it('rejects connect on WebSocket error', async () => {
    const state = makeGameState();
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const ws = new MockWebSocket();
    const client = new MafiaClient('http://localhost:3000', { fetch, webSocketFactory: makeWsFactory(ws) });

    await client.createGame('Alice');
    const connectPromise = client.connect();
    ws.fire('error', new Error('connection refused'));
    await expect(connectPromise).rejects.toBeDefined();
  });
});

describe('MafiaClient — disconnect', () => {
  it('closes WebSocket and isConnected returns false', async () => {
    const { client } = await makeConnectedClient();
    expect(client.isConnected()).toBe(true);
    client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  it('is safe to call when not connected', () => {
    const client = new MafiaClient('http://localhost:3000', { fetch: makeFetch([]) });
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

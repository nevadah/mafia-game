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
    nightActorCount: 0,
    nightSubmittedCount: 0,
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

describe('MafiaClient — sendChat', () => {
  it('throws when not in a game', async () => {
    const client = new MafiaClient('http://localhost:3000', { fetch: makeFetch([]) });
    await expect(client.sendChat('hello')).rejects.toThrow('Not in a game');
  });

  it('POST /games/:id/chat with text in body', async () => {
    const state = makeGameState({ status: 'active', phase: 'day' });
    const message = { id: 'm1', senderId: 'p1', senderName: 'Alice', text: 'hello', timestamp: 1000 };
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: true, body: { message, state } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    await client.sendChat('hello');

    expect(fetch.mock.calls[1][0]).toContain('/games/g1/chat');
    const body = JSON.parse((fetch.mock.calls[1][1] as RequestInit).body as string);
    expect(body.text).toBe('hello');
  });

  it('returns the ChatMessage and updates gameState', async () => {
    const state = makeGameState({ status: 'active', phase: 'day' });
    const updatedState = makeGameState({ status: 'active', phase: 'day', messages: [] });
    const message = { id: 'm1', senderId: 'p1', senderName: 'Alice', text: 'hello', timestamp: 1000 };
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: true, body: { message, state: updatedState } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    const result = await client.sendChat('hello');

    expect(result).toEqual(message);
    expect(client.gameState).toEqual(updatedState);
  });

  it('throws on error response with message', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: false, body: { error: 'Only alive players can send chat messages' } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    await expect(client.sendChat('hello')).rejects.toThrow('Only alive players can send chat messages');
  });

  it('throws generic error when no error field', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: false, body: {} }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    await expect(client.sendChat('hello')).rejects.toThrow('Server error 400');
  });
});

describe('MafiaClient — chat_message WebSocket event', () => {
  it('emits chat_message event', async () => {
    const { client, ws } = await makeConnectedClient();
    const events: unknown[] = [];
    client.on('chat_message', (p) => events.push(p));
    ws.receive({ type: 'chat_message', payload: { id: 'm1', senderId: 'p1', senderName: 'Alice', text: 'hi', timestamp: 1000 } });
    expect(events).toHaveLength(1);
  });

  it('appends message to gameState.messages and emits state_update', async () => {
    const { client, ws } = await makeConnectedClient({ messages: [] });
    const stateUpdates: GameState[] = [];
    client.on('state_update', (s) => stateUpdates.push(s));
    const msg = { id: 'm1', senderId: 'p1', senderName: 'Alice', text: 'hi', timestamp: 1000 };
    ws.receive({ type: 'chat_message', payload: msg });
    expect(stateUpdates).toHaveLength(1);
    expect(stateUpdates[0].messages).toHaveLength(1);
    expect(stateUpdates[0].messages![0]).toEqual(msg);
    expect(client.gameState?.messages).toHaveLength(1);
  });

  it('initializes messages array when gameState.messages is undefined', async () => {
    const { client, ws } = await makeConnectedClient();
    const msg = { id: 'm1', senderId: 'p1', senderName: 'Alice', text: 'hi', timestamp: 1000 };
    ws.receive({ type: 'chat_message', payload: msg });
    expect(client.gameState?.messages).toHaveLength(1);
  });

  it('does not emit state_update when gameState is not set', async () => {
    const { client, ws } = await makeConnectedClient();
    (client as unknown as { _gameState: undefined })._gameState = undefined;
    const stateUpdates: unknown[] = [];
    client.on('state_update', (s) => stateUpdates.push(s));
    ws.receive({ type: 'chat_message', payload: { id: 'm1', senderId: 'p1', senderName: 'Alice', text: 'hi', timestamp: 1000 } });
    expect(stateUpdates).toHaveLength(0);
  });
});

describe('MafiaClient — night_action_submitted WebSocket event', () => {
  it('emits night_action_submitted event', async () => {
    const { client, ws } = await makeConnectedClient();
    const events: unknown[] = [];
    client.on('night_action_submitted', (p) => events.push(p));

    ws.receive({ type: 'night_action_submitted', payload: { submittedCount: 1, totalCount: 3 } });

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ submittedCount: 1, totalCount: 3 });
  });

  it('updates nightSubmittedCount and nightActorCount in gameState and emits state_update', async () => {
    const { client, ws } = await makeConnectedClient();
    const updates: GameState[] = [];
    client.on('state_update', (s) => updates.push(s as GameState));

    ws.receive({ type: 'night_action_submitted', payload: { submittedCount: 2, totalCount: 3 } });

    expect(updates).toHaveLength(1);
    expect(updates[0].nightSubmittedCount).toBe(2);
    expect(updates[0].nightActorCount).toBe(3);
    expect(client.gameState?.nightSubmittedCount).toBe(2);
    expect(client.gameState?.nightActorCount).toBe(3);
  });

  it('does not emit state_update when gameState is not set', async () => {
    const { client, ws } = await makeConnectedClient();
    (client as unknown as { _gameState: undefined })._gameState = undefined;
    const updates: unknown[] = [];
    client.on('state_update', (s) => updates.push(s));

    ws.receive({ type: 'night_action_submitted', payload: { submittedCount: 1, totalCount: 2 } });

    expect(updates).toHaveLength(0);
  });
});

describe('MafiaClient — joinAsSpectator', () => {
  it('POST /games/:id/spectate and stores spectatorId as playerId', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { spectatorId: 'spec1', token: 'tok1', state } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    const result = await client.joinAsSpectator('g1', 'Watcher');
    expect(fetch.mock.calls[0][0]).toContain('/games/g1/spectate');
    expect(client.playerId).toBe('spec1');
    expect(client.gameId).toBe('g1');
    expect(client.isSpectator).toBe(true);
    expect(result).toEqual(state);
  });

  it('exposes token getter after joining as spectator', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { spectatorId: 'spec1', token: 'tok-abc', state } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.joinAsSpectator('g1', 'Watcher');
    expect(client.token).toBe('tok-abc');
  });

  it('throws on error response', async () => {
    const fetch = makeFetch([{ ok: false, body: { error: 'Game not found' } }]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await expect(client.joinAsSpectator('g1', 'Watcher')).rejects.toThrow('Game not found');
  });

  it('throws generic error when no error field', async () => {
    const fetch = makeFetch([{ ok: false, body: {} }]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await expect(client.joinAsSpectator('g1', 'Watcher')).rejects.toThrow('Server error 400');
  });

  it('isSpectator is false before joining as spectator', () => {
    const client = new MafiaClient('http://localhost:3000', { fetch: makeFetch([]) });
    expect(client.isSpectator).toBe(false);
  });
});

describe('MafiaClient — leaveGame', () => {
  it('throws when not in a game', async () => {
    const client = new MafiaClient('http://localhost:3000', { fetch: makeFetch([]) });
    await expect(client.leaveGame()).rejects.toThrow('Not in a game');
  });

  it('POST /games/:id/leave and returns deletedGame flag', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: true, body: { deletedGame: false } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    const result = await client.leaveGame();
    expect(fetch.mock.calls[1][0]).toContain('/games/g1/leave');
    expect(result.deletedGame).toBe(false);
  });

  it('clears game state and disconnects after leaving', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: true, body: { deletedGame: true } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    await client.leaveGame();
    expect(client.gameId).toBeUndefined();
    expect(client.playerId).toBeUndefined();
    expect(client.gameState).toBeUndefined();
  });

  it('throws on error response with message', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: false, body: { error: 'Game not found' } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    await expect(client.leaveGame()).rejects.toThrow('Game not found');
  });

  it('throws generic error when no error field', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: false, body: {} }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    await expect(client.leaveGame()).rejects.toThrow('Server error 400');
  });
});

describe('MafiaClient — reconnect counter reset', () => {
  it('resets attempt counter after successful reconnect', async () => {
    const ws1 = new MockWebSocket();
    const ws2 = new MockWebSocket();
    let wsIndex = 0;
    const wsFactory: WebSocketFactory = (_url: string) => [ws1, ws2][wsIndex++];

    const state = makeGameState();
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state } }]);
    const client = new MafiaClient('http://localhost:3000', { fetch, webSocketFactory: wsFactory, reconnectDelayMs: 0 });
    await client.createGame('Alice');

    const connectPromise = client.connect();
    ws1.receive({ type: 'connected', payload: { state } });
    await connectPromise;

    // Drop ws1 — schedules _openWebSocket() via setTimeout(0)
    ws1.close();

    // The reconnect setTimeout(0) was queued before this one, so it runs first:
    // _openWebSocket() creates ws2 and registers its listeners.
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    // Send 'connected' to ws2 — onConnectedOnce fires and resets the counter
    ws2.receive({ type: 'connected', payload: { state } });

    expect((client as unknown as { _reconnectAttempts: number })._reconnectAttempts).toBe(0);
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

describe('MafiaClient — token and isSpectator accessors', () => {
  it('token returns undefined before joining', () => {
    const client = new MafiaClient('http://localhost:3000', { fetch: makeFetch([]) });
    expect(client.token).toBeUndefined();
  });

  it('token returns value after createGame', async () => {
    const state = makeGameState();
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', token: 'tok-abc', state } }]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    expect(client.token).toBe('tok-abc');
  });

  it('isSpectator returns false by default', () => {
    const client = new MafiaClient('http://localhost:3000', { fetch: makeFetch([]) });
    expect(client.isSpectator).toBe(false);
  });
});

describe('MafiaClient — joinAsSpectator', () => {
  it('POSTs to /spectate and stores spectatorId, token, isSpectator=true', async () => {
    const state = makeGameState();
    const fetch = makeFetch([{ ok: true, body: { spectatorId: 's1', token: 'spec-tok', state } }]);
    const client = new MafiaClient('http://localhost:3000', { fetch });

    const result = await client.joinAsSpectator('g1', 'Watcher');

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/games/g1/spectate',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result).toEqual(state);
    expect(client.gameId).toBe('g1');
    expect(client.playerId).toBe('s1');
    expect(client.token).toBe('spec-tok');
    expect(client.isSpectator).toBe(true);
  });

  it('throws on non-OK response with error field', async () => {
    const fetch = makeFetch([{ ok: false, body: { error: 'Game not found' } }]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await expect(client.joinAsSpectator('bad-id', 'Watcher')).rejects.toThrow('Game not found');
  });

  it('throws generic error when no error field', async () => {
    const fetch = makeFetch([{ ok: false, body: {} }]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await expect(client.joinAsSpectator('g1', 'Watcher')).rejects.toThrow('Server error 400');
  });
});

describe('MafiaClient — sendChat', () => {
  it('throws when not in a game', async () => {
    const client = new MafiaClient('http://localhost:3000', { fetch: makeFetch([]) });
    await expect(client.sendChat('hello')).rejects.toThrow('Not in a game');
  });

  it('POSTs to /chat and returns message', async () => {
    const state = makeGameState();
    const chatMessage = { id: 'msg-1', playerId: 'p1', playerName: 'Alice', text: 'hello', timestamp: 0 };
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', token: 'tok', state } },
      { ok: true, body: { message: chatMessage, state } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');

    const result = await client.sendChat('hello');

    expect(result).toEqual(chatMessage);
    expect(fetch.mock.calls[1][0]).toBe('http://localhost:3000/games/g1/chat');
  });

  it('throws on error response', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: false, body: { error: 'Too long' } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    await expect(client.sendChat('x'.repeat(300))).rejects.toThrow('Too long');
  });
});

describe('MafiaClient — leaveGame', () => {
  it('throws when not in a game', async () => {
    const client = new MafiaClient('http://localhost:3000', { fetch: makeFetch([]) });
    await expect(client.leaveGame()).rejects.toThrow('Not in a game');
  });

  it('POSTs to /leave and clears state', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', token: 'tok', state } },
      { ok: true, body: { deletedGame: false } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');

    const result = await client.leaveGame();

    expect(result).toEqual({ deletedGame: false });
    expect(client.gameId).toBeUndefined();
    expect(client.playerId).toBeUndefined();
    expect(client.token).toBeUndefined();
    expect(client.gameState).toBeUndefined();
    expect(client.isSpectator).toBe(false);
  });

  it('returns deletedGame=true when host leaves', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: true, body: { deletedGame: true } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');

    const result = await client.leaveGame();
    expect(result.deletedGame).toBe(true);
  });

  it('throws on error response', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { gameId: 'g1', playerId: 'p1', state } },
      { ok: false, body: { error: 'Player not found' } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.createGame('Alice');
    await expect(client.leaveGame()).rejects.toThrow('Player not found');
  });
});

describe('MafiaClient — leaveAsSpectator', () => {
  it('throws when not in a game', async () => {
    const client = new MafiaClient('http://localhost:3000', { fetch: makeFetch([]) });
    await expect(client.leaveAsSpectator()).rejects.toThrow('Not in a game');
  });

  it('POSTs to /spectate-leave and clears state', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { spectatorId: 's1', token: 'spec-tok', state } },
      { ok: true, body: { ok: true } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.joinAsSpectator('g1', 'Watcher');

    await client.leaveAsSpectator();

    expect(fetch.mock.calls[1][0]).toBe('http://localhost:3000/games/g1/spectate-leave');
    expect(client.gameId).toBeUndefined();
    expect(client.playerId).toBeUndefined();
    expect(client.token).toBeUndefined();
    expect(client.isSpectator).toBe(false);
  });

  it('throws on error response', async () => {
    const state = makeGameState();
    const fetch = makeFetch([
      { ok: true, body: { spectatorId: 's1', token: 'spec-tok', state } },
      { ok: false, body: { error: 'Spectator not found' } }
    ]);
    const client = new MafiaClient('http://localhost:3000', { fetch });
    await client.joinAsSpectator('g1', 'Watcher');
    await expect(client.leaveAsSpectator()).rejects.toThrow('Spectator not found');
  });
});

describe('MafiaClient — chat_message WebSocket event', () => {
  it('emits chat_message event', async () => {
    const { client, ws } = await makeConnectedClient();
    const msgs: unknown[] = [];
    client.on('chat_message', (p) => msgs.push(p));

    const chatMsg = { id: 'm1', playerId: 'p1', playerName: 'Alice', text: 'hi', timestamp: 1 };
    ws.receive({ type: 'chat_message', payload: chatMsg });

    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toEqual(chatMsg);
  });

  it('appends chat message to gameState.messages and emits state_update', async () => {
    const { client, ws } = await makeConnectedClient();
    const updates: unknown[] = [];
    client.on('state_update', (s) => updates.push(s));

    const chatMsg = { id: 'm1', playerId: 'p1', playerName: 'Alice', text: 'hi', timestamp: 1 };
    ws.receive({ type: 'chat_message', payload: chatMsg });

    expect(updates).toHaveLength(1);
    const updatedState = updates[0] as GameState;
    expect(updatedState.messages).toHaveLength(1);
    expect(updatedState.messages![0]).toEqual(chatMsg);
  });

  it('does not emit state_update when gameState is not set', async () => {
    const { client, ws } = await makeConnectedClient();
    // Clear game state to simulate the no-state path
    client.disconnect();
    (client as unknown as { _gameState: undefined })._gameState = undefined;

    const updates: unknown[] = [];
    client.on('state_update', (s) => updates.push(s));

    const chatMsg = { id: 'm1', playerId: 'p1', playerName: 'Alice', text: 'hi', timestamp: 1 };
    ws.receive({ type: 'chat_message', payload: chatMsg });

    expect(updates).toHaveLength(0);
  });
});

describe('MafiaClient — reconnect counter reset', () => {
  it('resets _reconnectAttempts to 0 when reconnect succeeds', async () => {
    const _state = makeGameState();
    // Responses: createGame, then connect attempts use WS not fetch
    const fetch = makeFetch([{ ok: true, body: { gameId: 'g1', playerId: 'p1', state: _state } }]);

    // ws1 = first connection (succeeds), ws2 = reconnect attempt (will succeed)
    const ws1 = new MockWebSocket();
    const ws2 = new MockWebSocket();
    let wsCallCount = 0;
    const wsFactory = (_url: string): MockWebSocket => wsCallCount++ === 0 ? ws1 : ws2;

    const client = new MafiaClient('http://localhost:3000', {
      fetch,
      webSocketFactory: wsFactory as WebSocketFactory,
      reconnectDelayMs: 0,
    });

    await client.createGame('Alice');
    const connectPromise = client.connect();
    ws1.receive({ type: 'connected', payload: { state: _state } });
    await connectPromise;

    // Simulate disconnect to trigger one reconnect attempt
    ws1.close(); // this queues a setTimeout(0) reconnect

    // Yield so the reconnect setTimeout fires and ws2 is created
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    // Now resolve the reconnect by sending 'connected' on ws2
    ws2.receive({ type: 'connected', payload: { state: _state } });

    // Yield again so the onConnectedOnce handler runs
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    // After a successful reconnect, the counter should be back to 0
    expect((client as unknown as { _reconnectAttempts: number })._reconnectAttempts).toBe(0);
  });
});

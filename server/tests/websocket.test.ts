import http from 'http';
import WebSocket from 'ws';
import { GameManager } from '../src/GameManager';
import { createApp, createWebSocketServer, BroadcastRef } from '../src/server';

interface MsgClient {
  ws: WebSocket;
  getNextMessage: (timeoutMs?: number) => Promise<Record<string, unknown>>;
  close: () => Promise<void>;
}

function connectAndListen(url: string): Promise<MsgClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const messageQueue: Record<string, unknown>[] = [];
    const waiters: Array<{ resolve: (msg: Record<string, unknown>) => void; reject: (err: Error) => void }> = [];

    ws.on('message', (data: Buffer) => {
      const msg = JSON.parse(data.toString()) as Record<string, unknown>;
      if (waiters.length > 0) {
        const waiter = waiters.shift()!;
        waiter.resolve(msg);
      } else {
        messageQueue.push(msg);
      }
    });

    const getNextMessage = (timeoutMs = 3000): Promise<Record<string, unknown>> => {
      if (messageQueue.length > 0) {
        return Promise.resolve(messageQueue.shift()!);
      }
      return new Promise((res, rej) => {
        const timer = setTimeout(() => {
          const idx = waiters.findIndex(w => w.reject === rej);
          if (idx !== -1) waiters.splice(idx, 1);
          rej(new Error('Timeout waiting for WebSocket message'));
        }, timeoutMs);
        waiters.push({
          resolve: (msg) => { clearTimeout(timer); res(msg); },
          reject: rej
        });
      });
    };

    const close = (): Promise<void> =>
      new Promise((res) => {
        if (ws.readyState === WebSocket.CLOSED) { res(); return; }
        ws.once('close', () => res());
        ws.close();
      });

    ws.on('error', reject);
    ws.on('open', () => resolve({ ws, getNextMessage, close }));
  });
}

describe('WebSocket Server', () => {
  let server: http.Server;
  let gameManager: GameManager;
  let port: number;
  const openClients: MsgClient[] = [];

  beforeAll(() => {
    jest.setTimeout(15000);
  });

  let broadcastRef: BroadcastRef;

  beforeEach((done) => {
    gameManager = new GameManager();
    broadcastRef = {};
    const app = createApp(gameManager, broadcastRef);
    server = http.createServer(app);
    createWebSocketServer(server, gameManager, broadcastRef);
    server.listen(0, () => {
      const addr = server.address();
      port = typeof addr === 'object' && addr ? addr.port : 0;
      done();
    });
  });

  afterEach(async () => {
    // Close all tracked clients first
    await Promise.all(openClients.map(c => c.close()));
    openClients.length = 0;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  async function connect(path: string): Promise<MsgClient> {
    const c = await connectAndListen(`ws://localhost:${port}${path}`);
    openClients.push(c);
    return c;
  }

  it('connects without gameId and receives connected message', async () => {
    const client = await connect('/');
    const msg = await client.getNextMessage();
    expect(msg.type).toBe('connected');
  });

  it('connects with valid gameId and receives game state', async () => {
    const { game, hostPlayer } = gameManager.createGame('Alice');
    const client = await connect(`/?gameId=${game.id}&playerId=${hostPlayer.id}`);
    const msg = await client.getNextMessage();
    expect(msg.type).toBe('connected');
    expect((msg.payload as Record<string, unknown>).state).toBeDefined();
  });

  it('closes connection for invalid gameId', async () => {
    const client = await connect('/?gameId=invalid-game-id');
    const msg = await client.getNextMessage();
    expect(msg.type).toBe('error');
    // Wait for close
    await new Promise<void>((resolve) => {
      if (client.ws.readyState === WebSocket.CLOSED) { resolve(); return; }
      client.ws.once('close', () => resolve());
    });
  });

  it('connects with gameId but no playerId', async () => {
    const { game } = gameManager.createGame('Alice');
    const client = await connect(`/?gameId=${game.id}`);
    const msg = await client.getNextMessage();
    expect(msg.type).toBe('connected');
  });

  it('sends game_state on get_state message', async () => {
    const { game, hostPlayer } = gameManager.createGame('Alice');
    const client = await connect(`/?gameId=${game.id}&playerId=${hostPlayer.id}`);
    await client.getNextMessage(); // consume 'connected'
    client.ws.send(JSON.stringify({ type: 'get_state' }));
    const msg = await client.getNextMessage();
    expect(msg.type).toBe('game_state');
  });

  it('handles cast_vote message during day phase', async () => {
    const { game, hostPlayer } = gameManager.createGame('Alice');
    const { player: bob } = gameManager.joinGame(game.id, 'Bob');
    gameManager.joinGame(game.id, 'Carol');
    gameManager.joinGame(game.id, 'Dave');
    game.start();
    game.advancePhase(); // night → day

    const client = await connect(`/?gameId=${game.id}&playerId=${hostPlayer.id}`);
    await client.getNextMessage(); // connected

    client.ws.send(JSON.stringify({ type: 'cast_vote', payload: { targetId: bob.id } }));
    const msg = await client.getNextMessage();
    expect(msg.type).toBe('vote_cast');
  });

  it('handles cast_vote error (self-vote)', async () => {
    const { game, hostPlayer } = gameManager.createGame('Alice');
    gameManager.joinGame(game.id, 'Bob');
    gameManager.joinGame(game.id, 'Carol');
    gameManager.joinGame(game.id, 'Dave');
    game.start();
    game.advancePhase(); // night → day

    const client = await connect(`/?gameId=${game.id}&playerId=${hostPlayer.id}`);
    await client.getNextMessage(); // connected

    client.ws.send(JSON.stringify({ type: 'cast_vote', payload: { targetId: hostPlayer.id } }));
    const msg = await client.getNextMessage();
    expect(msg.type).toBe('error');
  });

  it('handles cast_vote without targetId (no-op)', async () => {
    const { game, hostPlayer } = gameManager.createGame('Alice');
    gameManager.joinGame(game.id, 'Bob');
    gameManager.joinGame(game.id, 'Carol');
    gameManager.joinGame(game.id, 'Dave');
    game.start();
    game.advancePhase(); // night → day

    const client = await connect(`/?gameId=${game.id}&playerId=${hostPlayer.id}`);
    await client.getNextMessage(); // connected

    client.ws.send(JSON.stringify({ type: 'cast_vote', payload: {} }));
    // No targetId means no-op, then get_state should return game_state
    client.ws.send(JSON.stringify({ type: 'get_state' }));
    const msg = await client.getNextMessage();
    expect(msg.type).toBe('game_state');
  });

  it('handles night_action message during night phase', async () => {
    const { game } = gameManager.createGame('Alice');
    gameManager.joinGame(game.id, 'Bob');
    gameManager.joinGame(game.id, 'Carol');
    gameManager.joinGame(game.id, 'Dave');
    gameManager.joinGame(game.id, 'Eve');
    game.start(); // starts in night

    const mafia = game.getAlivePlayers().find(p => p.role === 'mafia')!;
    const target = game.getAlivePlayers().find(p => p.role !== 'mafia')!;

    const client = await connect(`/?gameId=${game.id}&playerId=${mafia.id}`);
    await client.getNextMessage(); // connected

    client.ws.send(JSON.stringify({ type: 'night_action', payload: { targetId: target.id } }));
    const msg = await client.getNextMessage();
    expect(msg.type).toBe('game_state');
  });

  it('handles night_action error (wrong phase)', async () => {
    const { game } = gameManager.createGame('Alice');
    gameManager.joinGame(game.id, 'Bob');
    gameManager.joinGame(game.id, 'Carol');
    gameManager.joinGame(game.id, 'Dave');
    gameManager.joinGame(game.id, 'Eve');
    game.start();
    game.advancePhase(); // night → day

    const mafia = game.getAlivePlayers().find(p => p.role === 'mafia')!;
    const target = game.getAlivePlayers().find(p => p.role !== 'mafia')!;

    const client = await connect(`/?gameId=${game.id}&playerId=${mafia.id}`);
    await client.getNextMessage(); // connected

    client.ws.send(JSON.stringify({ type: 'night_action', payload: { targetId: target.id } }));
    const msg = await client.getNextMessage();
    expect(msg.type).toBe('error');
  });

  it('handles night_action without targetId (no-op)', async () => {
    const { game } = gameManager.createGame('Alice');
    gameManager.joinGame(game.id, 'Bob');
    gameManager.joinGame(game.id, 'Carol');
    gameManager.joinGame(game.id, 'Dave');
    gameManager.joinGame(game.id, 'Eve');
    game.start(); // starts in night

    const mafia = game.getAlivePlayers().find(p => p.role === 'mafia')!;

    const client = await connect(`/?gameId=${game.id}&playerId=${mafia.id}`);
    await client.getNextMessage(); // connected

    client.ws.send(JSON.stringify({ type: 'night_action', payload: {} }));
    client.ws.send(JSON.stringify({ type: 'get_state' }));
    const msg = await client.getNextMessage();
    expect(msg.type).toBe('game_state');
  });

  it('handles unknown message type with error', async () => {
    const { game, hostPlayer } = gameManager.createGame('Alice');
    const client = await connect(`/?gameId=${game.id}&playerId=${hostPlayer.id}`);
    await client.getNextMessage(); // connected

    client.ws.send(JSON.stringify({ type: 'unknown_type' }));
    const msg = await client.getNextMessage();
    expect(msg.type).toBe('error');
  });

  it('handles invalid JSON with error message', async () => {
    const { game, hostPlayer } = gameManager.createGame('Alice');
    const client = await connect(`/?gameId=${game.id}&playerId=${hostPlayer.id}`);
    await client.getNextMessage(); // connected

    client.ws.send('not-valid-json{{{');
    const msg = await client.getNextMessage();
    expect(msg.type).toBe('error');
  });

  it('broadcasts player_joined when player connects', async () => {
    const { game, hostPlayer } = gameManager.createGame('Alice');
    const { player: bob } = gameManager.joinGame(game.id, 'Bob');

    // Alice connects and receives connected
    const aliceClient = await connect(`/?gameId=${game.id}&playerId=${hostPlayer.id}`);
    await aliceClient.getNextMessage(); // connected

    // Bob connects - Alice should get player_joined
    const bobClient = await connect(`/?gameId=${game.id}&playerId=${bob.id}`);
    await bobClient.getNextMessage(); // Bob's 'connected'

    const joinMsg = await aliceClient.getNextMessage();
    expect(joinMsg.type).toBe('player_joined');
  });

  it('broadcasts player_left when player disconnects', async () => {
    const { game, hostPlayer } = gameManager.createGame('Alice');
    const { player: bob } = gameManager.joinGame(game.id, 'Bob');

    const aliceClient = await connect(`/?gameId=${game.id}&playerId=${hostPlayer.id}`);
    await aliceClient.getNextMessage(); // connected

    const bobClient = await connect(`/?gameId=${game.id}&playerId=${bob.id}`);
    await bobClient.getNextMessage(); // Bob connected
    await aliceClient.getNextMessage(); // Alice gets player_joined

    // Bob disconnects
    await bobClient.close();
    const leaveMsg = await aliceClient.getNextMessage();
    expect(leaveMsg.type).toBe('player_left');
  });

  it('removes player from game on WebSocket disconnect', async () => {
    const { game, hostPlayer } = gameManager.createGame('Alice');
    const { player: bob } = gameManager.joinGame(game.id, 'Bob');

    const aliceClient = await connect(`/?gameId=${game.id}&playerId=${hostPlayer.id}`);
    await aliceClient.getNextMessage(); // connected

    const bobClient = await connect(`/?gameId=${game.id}&playerId=${bob.id}`);
    await bobClient.getNextMessage(); // Bob connected
    await aliceClient.getNextMessage(); // player_joined — confirms Bob is registered

    await bobClient.close();
    await aliceClient.getNextMessage(); // player_left — confirms server processed the close

    expect(game.getPlayer(bob.id)).toBeUndefined();
    expect(game.getPlayerCount()).toBe(1);
  });

  it('allows same player name to rejoin after WebSocket disconnect', async () => {
    const { game, hostPlayer } = gameManager.createGame('Alice');
    const { player: bob } = gameManager.joinGame(game.id, 'Bob');

    const aliceClient = await connect(`/?gameId=${game.id}&playerId=${hostPlayer.id}`);
    await aliceClient.getNextMessage(); // connected

    const bobClient = await connect(`/?gameId=${game.id}&playerId=${bob.id}`);
    await bobClient.getNextMessage(); // Bob connected
    await aliceClient.getNextMessage(); // player_joined

    await bobClient.close();
    await aliceClient.getNextMessage(); // player_left — server has processed disconnect

    expect(() => gameManager.joinGame(game.id, 'Bob')).not.toThrow();
  });

  it('deletes game when host disconnects via WebSocket', async () => {
    const { game, hostPlayer } = gameManager.createGame('Alice');
    const gameId = game.id;

    const hostClient = await connect(`/?gameId=${game.id}&playerId=${hostPlayer.id}`);
    await hostClient.getNextMessage(); // connected

    await hostClient.close();
    // No broadcast when game is deleted; use a short delay to let the server process the close
    await new Promise(r => setTimeout(r, 50));

    expect(gameManager.getGame(gameId)).toBeUndefined();
  });

  it('handles mark_ready message and broadcasts player_ready', async () => {
    const { game, hostPlayer } = gameManager.createGame('Alice');
    const { player: bob } = gameManager.joinGame(game.id, 'Bob');

    const aliceClient = await connect(`/?gameId=${game.id}&playerId=${hostPlayer.id}`);
    await aliceClient.getNextMessage(); // connected

    const bobClient = await connect(`/?gameId=${game.id}&playerId=${bob.id}`);
    await bobClient.getNextMessage(); // Bob connected
    await aliceClient.getNextMessage(); // Alice gets player_joined

    // Bob marks ready
    bobClient.ws.send(JSON.stringify({ type: 'mark_ready' }));
    const msg = await aliceClient.getNextMessage();
    expect(msg.type).toBe('player_ready');
    const payload = msg.payload as Record<string, unknown>;
    expect(payload.playerId).toBe(bob.id);
    expect(payload.readyCount).toBe(1);
  });

  it('handles mark_ready error when game is active', async () => {
    const { game, hostPlayer } = gameManager.createGame('Alice');
    gameManager.joinGame(game.id, 'Bob');
    gameManager.joinGame(game.id, 'Carol');
    gameManager.joinGame(game.id, 'Dave');
    game.start(); // status becomes 'active'

    const client = await connect(`/?gameId=${game.id}&playerId=${hostPlayer.id}`);
    await client.getNextMessage(); // connected

    client.ws.send(JSON.stringify({ type: 'mark_ready' }));
    const msg = await client.getNextMessage();
    expect(msg.type).toBe('error');
  });

  it('handles mark_ready without playerId (no-op)', async () => {
    const { game } = gameManager.createGame('Alice');

    // Connect without a playerId
    const client = await connect(`/?gameId=${game.id}`);
    await client.getNextMessage(); // connected

    client.ws.send(JSON.stringify({ type: 'mark_ready' }));
    // No-op - verify socket still open by doing get_state
    client.ws.send(JSON.stringify({ type: 'get_state' }));
    const msg = await client.getNextMessage();
    expect(msg.type).toBe('game_state');
  });

  it('handles message without gameId context silently', async () => {
    const client = await connect('/');
    await client.getNextMessage(); // connected (no gameId)

    // Messages without gameId context are ignored
    client.ws.send(JSON.stringify({ type: 'get_state' }));
    // No response expected - verify socket is still open
    expect(client.ws.readyState).toBe(WebSocket.OPEN);
  });

  // ── game_started sends per-player state (role visibility) ─────────────────

  it('game_started sends each player their own role, not others', async () => {
    const { game, hostPlayer } = gameManager.createGame('Alice');
    const { player: bob }   = gameManager.joinGame(game.id, 'Bob');
    const { player: carol } = gameManager.joinGame(game.id, 'Carol');
    const { player: dave }  = gameManager.joinGame(game.id, 'Dave');

    // All four connect before the game starts
    const aliceClient = await connect(`/?gameId=${game.id}&playerId=${hostPlayer.id}`);
    await aliceClient.getNextMessage(); // connected
    const bobClient = await connect(`/?gameId=${game.id}&playerId=${bob.id}`);
    await bobClient.getNextMessage();
    await aliceClient.getNextMessage(); // player_joined
    const carolClient = await connect(`/?gameId=${game.id}&playerId=${carol.id}`);
    await carolClient.getNextMessage();
    await aliceClient.getNextMessage(); // player_joined
    await bobClient.getNextMessage();   // player_joined
    const daveClient = await connect(`/?gameId=${game.id}&playerId=${dave.id}`);
    await daveClient.getNextMessage();
    await aliceClient.getNextMessage(); // player_joined
    await bobClient.getNextMessage();   // player_joined
    await carolClient.getNextMessage(); // player_joined

    // Start the game via HTTP (triggers broadcastPerPlayer game_started)
    const res = await fetch(`http://localhost:${port}/games/${game.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: hostPlayer.id })
    });
    expect(res.ok).toBe(true);

    // Each client receives game_started with only their own role set
    const [aliceMsg, bobMsg, carolMsg, daveMsg] = await Promise.all([
      aliceClient.getNextMessage(),
      bobClient.getNextMessage(),
      carolClient.getNextMessage(),
      daveClient.getNextMessage()
    ]);

    function myRole(msg: Record<string, unknown>, playerId: string): string | undefined {
      const state = (msg.payload as Record<string, unknown>)?.state as Record<string, unknown>;
      const players = state?.players as Array<Record<string, unknown>>;
      return players?.find(p => p.id === playerId)?.role as string | undefined;
    }

    function othersHaveNoRole(msg: Record<string, unknown>, playerId: string): boolean {
      const state = (msg.payload as Record<string, unknown>)?.state as Record<string, unknown>;
      const players = state?.players as Array<Record<string, unknown>>;
      return players?.filter(p => p.id !== playerId).every(p => p.role === undefined) ?? false;
    }

    expect(aliceMsg.type).toBe('game_started');
    expect(myRole(aliceMsg, hostPlayer.id)).toBeDefined();
    expect(othersHaveNoRole(aliceMsg, hostPlayer.id)).toBe(true);

    expect(bobMsg.type).toBe('game_started');
    expect(myRole(bobMsg, bob.id)).toBeDefined();
    expect(othersHaveNoRole(bobMsg, bob.id)).toBe(true);

    expect(carolMsg.type).toBe('game_started');
    expect(myRole(carolMsg, carol.id)).toBeDefined();
    expect(othersHaveNoRole(carolMsg, carol.id)).toBe(true);

    expect(daveMsg.type).toBe('game_started');
    expect(myRole(daveMsg, dave.id)).toBeDefined();
    expect(othersHaveNoRole(daveMsg, dave.id)).toBe(true);
  });

  // ── resolve-votes: phase_changed sends per-player state, correct phase ──────

  it('phase_changed after resolve-votes sends each player their own role', async () => {
    const { game, hostPlayer } = gameManager.createGame('Alice');
    const { player: bob }   = gameManager.joinGame(game.id, 'Bob');
    const { player: carol } = gameManager.joinGame(game.id, 'Carol');
    const { player: dave }  = gameManager.joinGame(game.id, 'Dave');
    game.start();

    const aliceClient = await connect(`/?gameId=${game.id}&playerId=${hostPlayer.id}`);
    await aliceClient.getNextMessage(); // connected
    const bobClient = await connect(`/?gameId=${game.id}&playerId=${bob.id}`);
    await bobClient.getNextMessage();
    await aliceClient.getNextMessage(); // player_joined
    const carolClient = await connect(`/?gameId=${game.id}&playerId=${carol.id}`);
    await carolClient.getNextMessage();
    await aliceClient.getNextMessage(); // player_joined
    await bobClient.getNextMessage();
    const daveClient = await connect(`/?gameId=${game.id}&playerId=${dave.id}`);
    await daveClient.getNextMessage();
    await aliceClient.getNextMessage(); // player_joined
    await bobClient.getNextMessage();
    await carolClient.getNextMessage();

    // Advance to day first (game starts in night)
    game.advancePhase();

    // Force-resolve votes (day → night)
    const res = await fetch(`http://localhost:${port}/games/${game.id}/resolve-votes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: hostPlayer.id, force: true })
    });
    expect(res.ok).toBe(true);

    const [aliceMsg, bobMsg, carolMsg, daveMsg] = await Promise.all([
      aliceClient.getNextMessage(),
      bobClient.getNextMessage(),
      carolClient.getNextMessage(),
      daveClient.getNextMessage()
    ]);

    function myRole(msg: Record<string, unknown>, playerId: string): string | undefined {
      const state = (msg.payload as Record<string, unknown>)?.state as Record<string, unknown>;
      const players = state?.players as Array<Record<string, unknown>>;
      return players?.find(p => p.id === playerId)?.role as string | undefined;
    }

    function statePhase(msg: Record<string, unknown>): string | undefined {
      const state = (msg.payload as Record<string, unknown>)?.state as Record<string, unknown>;
      return state?.phase as string | undefined;
    }

    // Each message should be phase_changed, in night phase, with own role preserved
    for (const [msg, pid] of [[aliceMsg, hostPlayer.id], [bobMsg, bob.id], [carolMsg, carol.id], [daveMsg, dave.id]] as const) {
      expect(msg.type).toBe('phase_changed');
      expect(statePhase(msg)).toBe('night');
      expect(myRole(msg, pid)).toBeDefined();
    }
  });

  it('player_eliminated after resolve-votes carries the new phase in state', async () => {
    const { game, hostPlayer } = gameManager.createGame('Alice');
    gameManager.joinGame(game.id, 'Bob');
    gameManager.joinGame(game.id, 'Carol');
    gameManager.joinGame(game.id, 'Dave');
    game.start();
    game.advancePhase(); // night → day

    // Pick a non-mafia target so eliminating them won't trigger a winner
    const target = game.getAlivePlayers().find(p => p.role !== 'mafia')!;

    // All alive players vote for target
    for (const p of game.getAlivePlayers()) {
      if (p.id !== target.id) {
        game.castVote(p.id, target.id);
      } else {
        // target votes for someone else to satisfy "all players voted"
        const other = game.getAlivePlayers().find(q => q.id !== target.id)!;
        game.castVote(target.id, other.id);
      }
    }

    const aliceClient = await connect(`/?gameId=${game.id}&playerId=${hostPlayer.id}`);
    await aliceClient.getNextMessage(); // connected

    const res = await fetch(`http://localhost:${port}/games/${game.id}/resolve-votes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: hostPlayer.id, force: false })
    });
    expect(res.ok).toBe(true);

    // Should receive player_eliminated with post-advance phase in state
    const eliminatedMsg = await aliceClient.getNextMessage();
    expect(eliminatedMsg.type).toBe('player_eliminated');
    const eliminatedPayload = eliminatedMsg.payload as Record<string, unknown>;
    expect(eliminatedPayload.playerId).toBe(target.id);
    // State inside player_eliminated should reflect the new phase (night)
    const stateInEliminated = eliminatedPayload.state as Record<string, unknown>;
    expect(stateInEliminated.phase).toBe('night');
  });

  // ── resolve-night: phase_changed sends per-player state, correct phase ──────

  it('phase_changed after resolve-night sends each player their own role', async () => {
    const { game, hostPlayer } = gameManager.createGame('Alice');
    const { player: bob }   = gameManager.joinGame(game.id, 'Bob');
    const { player: carol } = gameManager.joinGame(game.id, 'Carol');
    const { player: dave }  = gameManager.joinGame(game.id, 'Dave');
    game.start(); // starts in night

    const aliceClient = await connect(`/?gameId=${game.id}&playerId=${hostPlayer.id}`);
    await aliceClient.getNextMessage(); // connected
    const bobClient = await connect(`/?gameId=${game.id}&playerId=${bob.id}`);
    await bobClient.getNextMessage();
    await aliceClient.getNextMessage();
    const carolClient = await connect(`/?gameId=${game.id}&playerId=${carol.id}`);
    await carolClient.getNextMessage();
    await aliceClient.getNextMessage();
    await bobClient.getNextMessage();
    const daveClient = await connect(`/?gameId=${game.id}&playerId=${dave.id}`);
    await daveClient.getNextMessage();
    await aliceClient.getNextMessage();
    await bobClient.getNextMessage();
    await carolClient.getNextMessage();

    // Force-resolve night (no actions submitted)
    const res = await fetch(`http://localhost:${port}/games/${game.id}/resolve-night`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: hostPlayer.id, force: true })
    });
    expect(res.ok).toBe(true);

    const [aliceMsg, bobMsg, carolMsg, daveMsg] = await Promise.all([
      aliceClient.getNextMessage(),
      bobClient.getNextMessage(),
      carolClient.getNextMessage(),
      daveClient.getNextMessage()
    ]);

    function myRole(msg: Record<string, unknown>, playerId: string): string | undefined {
      const state = (msg.payload as Record<string, unknown>)?.state as Record<string, unknown>;
      const players = state?.players as Array<Record<string, unknown>>;
      return players?.find(p => p.id === playerId)?.role as string | undefined;
    }

    function statePhase(msg: Record<string, unknown>): string | undefined {
      const state = (msg.payload as Record<string, unknown>)?.state as Record<string, unknown>;
      return state?.phase as string | undefined;
    }

    for (const [msg, pid] of [[aliceMsg, hostPlayer.id], [bobMsg, bob.id], [carolMsg, carol.id], [daveMsg, dave.id]] as const) {
      expect(msg.type).toBe('phase_changed');
      expect(statePhase(msg)).toBe('day');
      expect(myRole(msg, pid)).toBeDefined();
    }
  });

  // ── vote_cast broadcast includes the full votes map ────────────────────────

  it('vote_cast broadcast includes updated votes map', async () => {
    const { game, hostPlayer } = gameManager.createGame('Alice');
    const { player: bob }   = gameManager.joinGame(game.id, 'Bob');
    const { player: carol } = gameManager.joinGame(game.id, 'Carol');
    const { player: dave }  = gameManager.joinGame(game.id, 'Dave');
    game.start();
    game.advancePhase(); // night → day

    const aliceClient = await connect(`/?gameId=${game.id}&playerId=${hostPlayer.id}`);
    await aliceClient.getNextMessage(); // connected

    const bobClient = await connect(`/?gameId=${game.id}&playerId=${bob.id}`);
    await bobClient.getNextMessage();
    await aliceClient.getNextMessage(); // player_joined for bob

    // Bob casts a vote for Carol via WS
    bobClient.ws.send(JSON.stringify({ type: 'cast_vote', payload: { targetId: carol.id } }));

    // Alice should receive vote_cast with a votes map
    const voteMsg = await aliceClient.getNextMessage();
    expect(voteMsg.type).toBe('vote_cast');
    const payload = voteMsg.payload as Record<string, unknown>;
    expect(payload.votes).toBeDefined();
    expect((payload.votes as Record<string, string>)[bob.id]).toBe(carol.id);

    void dave; // suppress unused variable warning
  });
});

import http from 'http';
import WebSocket from 'ws';
import { GameManager } from '../src/GameManager';
import { createApp, createWebSocketServer } from '../src/server';

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

  beforeEach((done) => {
    gameManager = new GameManager();
    const app = createApp(gameManager);
    server = http.createServer(app);
    createWebSocketServer(server, gameManager);
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
    game.start();
    game.resolveVotes(); // no votes, OK
    game.advancePhase(); // day -> night

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
    game.start(); // starts in day phase

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
    game.start();
    game.advancePhase(); // night

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
});

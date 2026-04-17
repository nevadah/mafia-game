import request from 'supertest';
import { createApp } from '../src/server';
import { GameManager } from '../src/GameManager';
import { Game } from '../src/Game';

describe('Spectator feature', () => {
  let gameManager: GameManager;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    gameManager = new GameManager();
    app = createApp(gameManager);
  });

  // ── Helpers ─────────────────────────────────────────────────────────────────

  async function createGame(hostName = 'Alice') {
    const res = await request(app).post('/games').send({ hostName });
    return res.body as { gameId: string; playerId: string; token: string; state: object };
  }

  async function joinGame(gameId: string, playerName: string) {
    const res = await request(app).post(`/games/${gameId}/join`).send({ playerName });
    return res.body as { playerId: string; token: string; state: object };
  }

  async function spectate(gameId: string, spectatorName: string) {
    return request(app).post(`/games/${gameId}/spectate`).send({ spectatorName });
  }

  async function startGame(gameId: string, token: string) {
    // Adds 3 extra players and starts
    for (const name of ['Bob', 'Carol', 'Dave']) {
      await joinGame(gameId, name);
    }
    return request(app)
      .post(`/games/${gameId}/start`)
      .set('x-player-token', token)
      .send({});
  }

  // ── POST /games/:gameId/spectate ─────────────────────────────────────────────

  describe('POST /games/:gameId/spectate', () => {
    it('returns spectatorId, token, and state', async () => {
      const { gameId } = await createGame();
      const res = await spectate(gameId, 'Watcher');

      expect(res.status).toBe(200);
      expect(res.body.spectatorId).toBeDefined();
      expect(res.body.token).toBeDefined();
      expect(res.body.state).toBeDefined();
      expect(res.body.state.spectators).toBeDefined();
    });

    it('returns 400 for missing spectatorName', async () => {
      const { gameId } = await createGame();
      const res = await request(app).post(`/games/${gameId}/spectate`).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('returns 400 for blank spectatorName', async () => {
      const { gameId } = await createGame();
      const res = await request(app).post(`/games/${gameId}/spectate`).send({ spectatorName: '   ' });
      expect(res.status).toBe(400);
    });

    it('returns 404 for unknown game', async () => {
      const res = await spectate('nonexistent-id', 'Watcher');
      expect(res.status).toBe(404);
    });

    it('spectator appears in game state spectators list', async () => {
      const { gameId } = await createGame();
      const res = await spectate(gameId, 'Watcher');

      expect(res.body.state.spectators).toHaveLength(1);
      expect(res.body.state.spectators[0].name).toBe('Watcher');
      expect(res.body.state.spectators[0].id).toBe(res.body.spectatorId);
    });

    it('can join as spectator in any phase — lobby', async () => {
      const { gameId } = await createGame();
      const res = await spectate(gameId, 'Watcher');
      expect(res.status).toBe(200);
    });

    it('can join as spectator during an active game', async () => {
      const { gameId, token } = await createGame();
      await startGame(gameId, token);

      const res = await spectate(gameId, 'Watcher');
      expect(res.status).toBe(200);
      expect(res.body.state.phase).toBe('night');
    });
  });

  // ── Spectator token rejected by player endpoints ──────────────────────────────

  describe('spectator token rejection', () => {
    let gameId: string;
    let spectatorToken: string;

    beforeEach(async () => {
      const game = await createGame();
      gameId = game.gameId;
      const specRes = await spectate(gameId, 'Watcher');
      spectatorToken = specRes.body.token;
    });

    it('rejects spectator token on /ready', async () => {
      const res = await request(app)
        .post(`/games/${gameId}/ready`)
        .set('x-player-token', spectatorToken)
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/spectator/i);
    });

    it('rejects spectator token on /unready', async () => {
      const res = await request(app)
        .post(`/games/${gameId}/unready`)
        .set('x-player-token', spectatorToken)
        .send({});
      expect(res.status).toBe(403);
    });

    it('rejects spectator token on /start', async () => {
      const res = await request(app)
        .post(`/games/${gameId}/start`)
        .set('x-player-token', spectatorToken)
        .send({});
      expect(res.status).toBe(403);
    });

    it('rejects spectator token on /vote', async () => {
      const res = await request(app)
        .post(`/games/${gameId}/vote`)
        .set('x-player-token', spectatorToken)
        .send({ targetId: 'some-player' });
      expect(res.status).toBe(403);
    });

    it('rejects spectator token on /chat', async () => {
      const res = await request(app)
        .post(`/games/${gameId}/chat`)
        .set('x-player-token', spectatorToken)
        .send({ text: 'hello' });
      expect(res.status).toBe(403);
    });

    it('rejects spectator token on /night-action', async () => {
      const res = await request(app)
        .post(`/games/${gameId}/night-action`)
        .set('x-player-token', spectatorToken)
        .send({ targetId: 'some-player' });
      expect(res.status).toBe(403);
    });

    it('rejects spectator token on /resolve-votes', async () => {
      const res = await request(app)
        .post(`/games/${gameId}/resolve-votes`)
        .set('x-player-token', spectatorToken)
        .send({});
      expect(res.status).toBe(403);
    });

    it('rejects spectator token on /resolve-night', async () => {
      const res = await request(app)
        .post(`/games/${gameId}/resolve-night`)
        .set('x-player-token', spectatorToken)
        .send({});
      expect(res.status).toBe(403);
    });
  });

  // ── Game model — spectators excluded from game mechanics ────────────────────

  describe('Game spectator model', () => {
    let game: Game;

    beforeEach(() => {
      game = new Game('host-id');
    });

    it('addSpectator stores spectator and reflects in getSpectators()', () => {
      game.addSpectator('s1', 'Watcher');
      expect(game.getSpectators()).toHaveLength(1);
      expect(game.getSpectators()[0]).toMatchObject({ id: 's1', name: 'Watcher', isConnected: true });
    });

    it('removeSpectator removes by id', () => {
      game.addSpectator('s1', 'Watcher');
      game.removeSpectator('s1');
      expect(game.getSpectators()).toHaveLength(0);
    });

    it('getSpectator returns undefined for unknown id', () => {
      expect(game.getSpectator('unknown')).toBeUndefined();
    });

    it('setSpectatorConnected updates connection status', () => {
      game.addSpectator('s1', 'Watcher');
      game.setSpectatorConnected('s1', false);
      expect(game.getSpectator('s1')!.isConnected).toBe(false);
    });

    it('spectators appear in toState()', () => {
      game.addSpectator('s1', 'Watcher');
      const state = game.toState();
      expect(state.spectators).toHaveLength(1);
      expect(state.spectators[0].name).toBe('Watcher');
    });

    it('spectators are not counted in getPlayerCount()', () => {
      game.addSpectator('s1', 'Watcher');
      expect(game.getPlayerCount()).toBe(0);
    });
  });

  // ── GameManager spectator lifecycle ─────────────────────────────────────────

  describe('GameManager spectator lifecycle', () => {
    it('joinAsSpectator returns game, spectatorId, and token', () => {
      const { game: g, token } = gameManager.createGame('Alice');
      const { game, spectatorId, token: specToken } = gameManager.joinAsSpectator(g.id, 'Watcher');

      expect(spectatorId).toBeDefined();
      expect(specToken).toBeDefined();
      expect(game.getSpectator(spectatorId)).toBeDefined();
      void token; // suppress unused warning
    });

    it('joinAsSpectator throws for unknown game', () => {
      expect(() => gameManager.joinAsSpectator('bad-id', 'Watcher')).toThrow('Game not found');
    });

    it('joinAsSpectator session has isSpectator=true', () => {
      const { game: g } = gameManager.createGame('Alice');
      const { token } = gameManager.joinAsSpectator(g.id, 'Watcher');
      const session = gameManager.getSession(token);
      expect(session?.isSpectator).toBe(true);
    });

    it('leaveSpectator removes spectator and revokes session', () => {
      const { game: g } = gameManager.createGame('Alice');
      const { spectatorId, token } = gameManager.joinAsSpectator(g.id, 'Watcher');

      gameManager.leaveSpectator(g.id, spectatorId);

      expect(g.getSpectator(spectatorId)).toBeUndefined();
      expect(gameManager.getSession(token)).toBeUndefined();
    });

    it('leaveSpectator throws for unknown game', () => {
      expect(() => gameManager.leaveSpectator('bad-id', 'nobody')).toThrow('Game not found');
    });

    it('deleteGame also revokes spectator sessions', () => {
      const { game: g } = gameManager.createGame('Alice');
      const { token } = gameManager.joinAsSpectator(g.id, 'Watcher');

      gameManager.deleteGame(g.id);

      expect(gameManager.getSession(token)).toBeUndefined();
    });
  });

  // ── POST /games/:gameId/spectate-leave ────────────────────────────────────────

  describe('POST /games/:gameId/spectate-leave', () => {
    it('removes the spectator and returns ok', async () => {
      const { gameId } = await createGame();
      const specRes = await spectate(gameId, 'Watcher');
      const { token } = specRes.body;

      const leaveRes = await request(app)
        .post(`/games/${gameId}/spectate-leave`)
        .set('x-player-token', token)
        .send({});

      expect(leaveRes.status).toBe(200);
      expect(leaveRes.body.ok).toBe(true);
    });

    it('spectator no longer appears in game state after leaving', async () => {
      const { gameId } = await createGame();
      const specRes = await spectate(gameId, 'Watcher');
      const { token } = specRes.body;

      await request(app)
        .post(`/games/${gameId}/spectate-leave`)
        .set('x-player-token', token)
        .send({});

      const stateRes = await request(app).get(`/games/${gameId}`);
      expect(stateRes.body.state.spectators).toHaveLength(0);
    });

    it('returns 401 when no token is provided', async () => {
      const { gameId } = await createGame();
      await spectate(gameId, 'Watcher');

      const res = await request(app)
        .post(`/games/${gameId}/spectate-leave`)
        .send({});

      expect(res.status).toBe(401);
    });

    it('returns 403 when a player token is used', async () => {
      const { gameId, token: hostToken } = await createGame();

      const res = await request(app)
        .post(`/games/${gameId}/spectate-leave`)
        .set('x-player-token', hostToken)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/player, not a spectator/i);
    });

    it('returns 404 for unknown game', async () => {
      const { gameId } = await createGame();
      const specRes = await spectate(gameId, 'Watcher');
      const { token } = specRes.body;

      const res = await request(app)
        .post('/games/nonexistent/spectate-leave')
        .set('x-player-token', token)
        .send({});

      expect(res.status).toBe(404);
    });
  });
});

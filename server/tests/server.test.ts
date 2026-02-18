import request from 'supertest';
import { createApp } from '../src/server';
import { GameManager } from '../src/GameManager';

describe('REST API', () => {
  let gameManager: GameManager;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    gameManager = new GameManager();
    app = createApp(gameManager);
  });

  describe('POST /games', () => {
    it('creates a game with valid hostName', async () => {
      const res = await request(app)
        .post('/games')
        .send({ hostName: 'Alice' });
      expect(res.status).toBe(201);
      expect(res.body.gameId).toBeDefined();
      expect(res.body.playerId).toBeDefined();
      expect(res.body.state).toBeDefined();
    });

    it('returns 400 for missing hostName', async () => {
      const res = await request(app).post('/games').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('returns 400 for empty hostName', async () => {
      const res = await request(app).post('/games').send({ hostName: '   ' });
      expect(res.status).toBe(400);
    });

    it('accepts custom settings', async () => {
      const res = await request(app)
        .post('/games')
        .send({ hostName: 'Alice', settings: { minPlayers: 6 } });
      expect(res.status).toBe(201);
      expect(res.body.state.settings.minPlayers).toBe(6);
    });
  });

  describe('GET /games', () => {
    it('returns empty list when no games', async () => {
      const res = await request(app).get('/games');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns waiting games', async () => {
      await request(app).post('/games').send({ hostName: 'Alice' });
      const res = await request(app).get('/games');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].gameId).toBeDefined();
      expect(res.body[0].playerCount).toBe(1);
    });

    it('does not return started games', async () => {
      const createRes = await request(app).post('/games').send({ hostName: 'Alice' });
      const { gameId, playerId } = createRes.body;
      // Add enough players
      for (const name of ['Bob', 'Carol', 'Dave']) {
        await request(app).post(`/games/${gameId}/join`).send({ playerName: name });
      }
      await request(app).post(`/games/${gameId}/start`).send({ playerId });
      const res = await request(app).get('/games');
      expect(res.body.length).toBe(0);
    });
  });

  describe('GET /games/:gameId', () => {
    it('returns game state', async () => {
      const createRes = await request(app).post('/games').send({ hostName: 'Alice' });
      const { gameId } = createRes.body;
      const res = await request(app).get(`/games/${gameId}`);
      expect(res.status).toBe(200);
      expect(res.body.state).toBeDefined();
    });

    it('returns 404 for unknown game', async () => {
      const res = await request(app).get('/games/unknown');
      expect(res.status).toBe(404);
    });

    it('returns player-specific state when playerId query param provided', async () => {
      const createRes = await request(app).post('/games').send({ hostName: 'Alice' });
      const { gameId, playerId } = createRes.body;
      const res = await request(app).get(`/games/${gameId}?playerId=${playerId}`);
      expect(res.status).toBe(200);
    });
  });

  describe('POST /games/:gameId/join', () => {
    it('joins a game successfully', async () => {
      const createRes = await request(app).post('/games').send({ hostName: 'Alice' });
      const { gameId } = createRes.body;
      const res = await request(app)
        .post(`/games/${gameId}/join`)
        .send({ playerName: 'Bob' });
      expect(res.status).toBe(200);
      expect(res.body.playerId).toBeDefined();
      expect(res.body.state).toBeDefined();
    });

    it('returns 400 for missing playerName', async () => {
      const createRes = await request(app).post('/games').send({ hostName: 'Alice' });
      const { gameId } = createRes.body;
      const res = await request(app).post(`/games/${gameId}/join`).send({});
      expect(res.status).toBe(400);
    });

    it('returns 404 for unknown game', async () => {
      const res = await request(app).post('/games/unknown/join').send({ playerName: 'Bob' });
      expect(res.status).toBe(404);
    });

    it('returns 400 for duplicate name', async () => {
      const createRes = await request(app).post('/games').send({ hostName: 'Alice' });
      const { gameId } = createRes.body;
      const res = await request(app).post(`/games/${gameId}/join`).send({ playerName: 'Alice' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for empty playerName', async () => {
      const createRes = await request(app).post('/games').send({ hostName: 'Alice' });
      const { gameId } = createRes.body;
      const res = await request(app).post(`/games/${gameId}/join`).send({ playerName: '' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /games/:gameId/start', () => {
    async function setupGame(playerNames: string[] = ['Bob', 'Carol', 'Dave']) {
      const createRes = await request(app).post('/games').send({ hostName: 'Alice' });
      const { gameId, playerId: hostId } = createRes.body;
      for (const name of playerNames) {
        await request(app).post(`/games/${gameId}/join`).send({ playerName: name });
      }
      return { gameId, hostId };
    }

    it('starts game when host requests', async () => {
      const { gameId, hostId } = await setupGame();
      const res = await request(app)
        .post(`/games/${gameId}/start`)
        .send({ playerId: hostId });
      expect(res.status).toBe(200);
      expect(res.body.state.status).toBe('active');
    });

    it('returns 403 when non-host tries to start', async () => {
      const { gameId } = await setupGame();
      const joinRes = await request(app)
        .post(`/games/${gameId}/join`)
        .send({ playerName: 'Eve' });
      const res = await request(app)
        .post(`/games/${gameId}/start`)
        .send({ playerId: joinRes.body.playerId });
      expect(res.status).toBe(403);
    });

    it('returns 404 for unknown game', async () => {
      const res = await request(app).post('/games/unknown/start').send({ playerId: 'x' });
      expect(res.status).toBe(404);
    });

    it('returns 400 when not enough players', async () => {
      const createRes = await request(app).post('/games').send({ hostName: 'Alice' });
      const { gameId, playerId } = createRes.body;
      const res = await request(app)
        .post(`/games/${gameId}/start`)
        .send({ playerId });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /games/:gameId/ready', () => {
    it('marks player as ready', async () => {
      const createRes = await request(app).post('/games').send({ hostName: 'Alice' });
      const { gameId, playerId } = createRes.body;
      const res = await request(app)
        .post(`/games/${gameId}/ready`)
        .send({ playerId });
      expect(res.status).toBe(200);
      expect(res.body.readyCount).toBe(1);
      expect(res.body.allReady).toBe(false); // need minPlayers ready
    });

    it('returns 404 for unknown game', async () => {
      const res = await request(app).post('/games/unknown/ready').send({ playerId: 'x' });
      expect(res.status).toBe(404);
    });

    it('returns 400 for missing playerId', async () => {
      const createRes = await request(app).post('/games').send({ hostName: 'Alice' });
      const { gameId } = createRes.body;
      const res = await request(app).post(`/games/${gameId}/ready`).send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 for unknown playerId', async () => {
      const createRes = await request(app).post('/games').send({ hostName: 'Alice' });
      const { gameId } = createRes.body;
      const res = await request(app).post(`/games/${gameId}/ready`).send({ playerId: 'nonexistent' });
      expect(res.status).toBe(400);
    });

    it('reports allReady when all minimum players are ready', async () => {
      const createRes = await request(app)
        .post('/games')
        .send({ hostName: 'Alice', settings: { minPlayers: 2 } });
      const { gameId, playerId: hostId } = createRes.body;
      const joinRes = await request(app).post(`/games/${gameId}/join`).send({ playerName: 'Bob' });
      const bobId = joinRes.body.playerId;

      await request(app).post(`/games/${gameId}/ready`).send({ playerId: hostId });
      const res = await request(app).post(`/games/${gameId}/ready`).send({ playerId: bobId });
      expect(res.body.allReady).toBe(true);
    });
  });

  describe('POST /games/:gameId/unready', () => {
    it('marks player as not ready', async () => {
      const createRes = await request(app).post('/games').send({ hostName: 'Alice' });
      const { gameId, playerId } = createRes.body;
      await request(app).post(`/games/${gameId}/ready`).send({ playerId });
      const res = await request(app)
        .post(`/games/${gameId}/unready`)
        .send({ playerId });
      expect(res.status).toBe(200);
      expect(res.body.readyCount).toBe(0);
      expect(res.body.allReady).toBe(false);
    });

    it('returns 404 for unknown game', async () => {
      const res = await request(app).post('/games/unknown/unready').send({ playerId: 'x' });
      expect(res.status).toBe(404);
    });

    it('returns 400 for missing playerId', async () => {
      const createRes = await request(app).post('/games').send({ hostName: 'Alice' });
      const { gameId } = createRes.body;
      const res = await request(app).post(`/games/${gameId}/unready`).send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 for unknown playerId', async () => {
      const createRes = await request(app).post('/games').send({ hostName: 'Alice' });
      const { gameId } = createRes.body;
      const res = await request(app).post(`/games/${gameId}/unready`).send({ playerId: 'nonexistent' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /games includes readyCount', () => {
    it('returns readyCount in game list', async () => {
      const createRes = await request(app).post('/games').send({ hostName: 'Alice' });
      const { gameId, playerId } = createRes.body;
      await request(app).post(`/games/${gameId}/ready`).send({ playerId });
      const res = await request(app).get('/games');
      expect(res.body[0].readyCount).toBe(1);
    });
  });

  describe('POST /games/:gameId/vote', () => {
    async function setupActiveGame() {
      const createRes = await request(app).post('/games').send({ hostName: 'Alice' });
      const { gameId, playerId: hostId } = createRes.body;
      const playerIds: string[] = [hostId];
      for (const name of ['Bob', 'Carol', 'Dave']) {
        const joinRes = await request(app).post(`/games/${gameId}/join`).send({ playerName: name });
        playerIds.push(joinRes.body.playerId);
      }
      await request(app).post(`/games/${gameId}/start`).send({ playerId: hostId });
      return { gameId, playerIds, hostId };
    }

    it('casts a vote', async () => {
      const { gameId, playerIds } = await setupActiveGame();
      const res = await request(app)
        .post(`/games/${gameId}/vote`)
        .send({ voterId: playerIds[0], targetId: playerIds[1] });
      expect(res.status).toBe(200);
    });

    it('returns 400 for missing fields', async () => {
      const { gameId } = await setupActiveGame();
      const res = await request(app).post(`/games/${gameId}/vote`).send({ voterId: 'x' });
      expect(res.status).toBe(400);
    });

    it('returns 404 for unknown game', async () => {
      const res = await request(app).post('/games/unknown/vote').send({ voterId: 'a', targetId: 'b' });
      expect(res.status).toBe(404);
    });

    it('returns 400 for self-vote', async () => {
      const { gameId, playerIds } = await setupActiveGame();
      const res = await request(app)
        .post(`/games/${gameId}/vote`)
        .send({ voterId: playerIds[0], targetId: playerIds[0] });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /games/:gameId/resolve-votes', () => {
    async function setupVotingGame() {
      const createRes = await request(app).post('/games').send({ hostName: 'Alice' });
      const { gameId, playerId: hostId } = createRes.body;
      const playerIds: string[] = [hostId];
      for (const name of ['Bob', 'Carol', 'Dave']) {
        const joinRes = await request(app).post(`/games/${gameId}/join`).send({ playerName: name });
        playerIds.push(joinRes.body.playerId);
      }
      await request(app).post(`/games/${gameId}/start`).send({ playerId: hostId });
      return { gameId, playerIds, hostId };
    }

    it('resolves votes as host', async () => {
      const { gameId, playerIds, hostId } = await setupVotingGame();
      await request(app).post(`/games/${gameId}/vote`).send({ voterId: playerIds[0], targetId: playerIds[1] });
      await request(app).post(`/games/${gameId}/vote`).send({ voterId: playerIds[2], targetId: playerIds[1] });
      await request(app).post(`/games/${gameId}/vote`).send({ voterId: playerIds[1], targetId: playerIds[2] });
      await request(app).post(`/games/${gameId}/vote`).send({ voterId: playerIds[3], targetId: playerIds[2] });
      const res = await request(app)
        .post(`/games/${gameId}/resolve-votes`)
        .send({ playerId: hostId });
      expect(res.status).toBe(200);
      expect(res.body.eliminated).toBeDefined();
    });

    it('returns 409 when votes are missing', async () => {
      const { gameId, playerIds, hostId } = await setupVotingGame();
      await request(app).post(`/games/${gameId}/vote`).send({ voterId: playerIds[0], targetId: playerIds[1] });
      const res = await request(app)
        .post(`/games/${gameId}/resolve-votes`)
        .send({ playerId: hostId });
      expect(res.status).toBe(409);
      expect(Array.isArray(res.body.missingPlayerIds)).toBe(true);
      expect(res.body.missingPlayerIds.length).toBeGreaterThan(0);
    });

    it('allows force resolve with missing votes', async () => {
      const { gameId, playerIds, hostId } = await setupVotingGame();
      await request(app).post(`/games/${gameId}/vote`).send({ voterId: playerIds[0], targetId: playerIds[1] });
      const res = await request(app)
        .post(`/games/${gameId}/resolve-votes`)
        .send({ playerId: hostId, force: true });
      expect(res.status).toBe(200);
    });

    it('returns 403 for non-host', async () => {
      const { gameId, playerIds } = await setupVotingGame();
      const res = await request(app)
        .post(`/games/${gameId}/resolve-votes`)
        .send({ playerId: playerIds[1] });
      expect(res.status).toBe(403);
    });

    it('returns 404 for unknown game', async () => {
      const res = await request(app).post('/games/unknown/resolve-votes').send({ playerId: 'x' });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /games/:gameId/night-action', () => {
    async function setupNightGame() {
      const createRes = await request(app).post('/games').send({ hostName: 'Alice' });
      const { gameId, playerId: hostId } = createRes.body;
      const playerIds: string[] = [hostId];
      for (const name of ['Bob', 'Carol', 'Dave', 'Eve']) {
        const joinRes = await request(app).post(`/games/${gameId}/join`).send({ playerName: name });
        playerIds.push(joinRes.body.playerId);
      }
      await request(app).post(`/games/${gameId}/start`).send({ playerId: hostId });
      // Advance to night
      await request(app).post(`/games/${gameId}/resolve-votes`).send({ playerId: hostId, force: true });
      return { gameId, playerIds, hostId };
    }

    it('submits a night action', async () => {
      const { gameId, playerIds } = await setupNightGame();
      const game = gameManager.getGame(gameId)!;
      const mafia = game.getPlayers().find(p => p.role === 'mafia')!;
      const target = game.getAlivePlayers().find(p => p.role !== 'mafia')!;
      const res = await request(app)
        .post(`/games/${gameId}/night-action`)
        .send({ playerId: mafia.id, targetId: target.id });
      expect(res.status).toBe(200);
    });

    it('returns 400 for missing fields', async () => {
      const { gameId } = await setupNightGame();
      const res = await request(app).post(`/games/${gameId}/night-action`).send({ playerId: 'x' });
      expect(res.status).toBe(400);
    });

    it('returns 404 for unknown game', async () => {
      const res = await request(app).post('/games/unknown/night-action').send({ playerId: 'a', targetId: 'b' });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /games/:gameId/resolve-night', () => {
    async function setupNightGame() {
      const createRes = await request(app).post('/games').send({ hostName: 'Alice' });
      const { gameId, playerId: hostId } = createRes.body;
      for (const name of ['Bob', 'Carol', 'Dave', 'Eve']) {
        await request(app).post(`/games/${gameId}/join`).send({ playerName: name });
      }
      await request(app).post(`/games/${gameId}/start`).send({ playerId: hostId });
      await request(app).post(`/games/${gameId}/resolve-votes`).send({ playerId: hostId, force: true });
      return { gameId, hostId };
    }

    it('resolves night actions as host', async () => {
      const { gameId, hostId } = await setupNightGame();
      const game = gameManager.getGame(gameId)!;
      for (const actor of game.getPlayers().filter(p => p.isAlive && ['mafia', 'doctor', 'sheriff'].includes(p.role!))) {
        const target = game.getAlivePlayers().find(p => p.id !== actor.id)!;
        await request(app).post(`/games/${gameId}/night-action`).send({ playerId: actor.id, targetId: target.id });
      }
      const res = await request(app)
        .post(`/games/${gameId}/resolve-night`)
        .send({ playerId: hostId });
      expect(res.status).toBe(200);
    });

    it('returns 409 when required night actions are missing', async () => {
      const { gameId, hostId } = await setupNightGame();
      const res = await request(app)
        .post(`/games/${gameId}/resolve-night`)
        .send({ playerId: hostId });
      expect(res.status).toBe(409);
      expect(Array.isArray(res.body.missingPlayerIds)).toBe(true);
      expect(res.body.missingPlayerIds.length).toBeGreaterThan(0);
    });

    it('allows force resolve with missing night actions', async () => {
      const { gameId, hostId } = await setupNightGame();
      const res = await request(app)
        .post(`/games/${gameId}/resolve-night`)
        .send({ playerId: hostId, force: true });
      expect(res.status).toBe(200);
    });

    it('returns 403 for non-host', async () => {
      const { gameId } = await setupNightGame();
      const game = gameManager.getGame(gameId)!;
      const nonHost = game.getPlayers().find(p => p.id !== game.hostId)!;
      const res = await request(app)
        .post(`/games/${gameId}/resolve-night`)
        .send({ playerId: nonHost.id });
      expect(res.status).toBe(403);
    });

    it('returns 404 for unknown game', async () => {
      const res = await request(app).post('/games/unknown/resolve-night').send({ playerId: 'x' });
      expect(res.status).toBe(404);
    });
  });
});

import { GameManager } from '../src/GameManager';

describe('GameManager', () => {
  let manager: GameManager;

  beforeEach(() => {
    manager = new GameManager();
  });

  describe('createGame', () => {
    it('creates a game and returns game and host player', () => {
      const { game, hostPlayer } = manager.createGame('Alice');
      expect(game).toBeDefined();
      expect(hostPlayer.name).toBe('Alice');
      expect(game.hostId).toBe(hostPlayer.id);
    });

    it('adds host player to the game', () => {
      const { game, hostPlayer } = manager.createGame('Alice');
      expect(game.getPlayerCount()).toBe(1);
      expect(game.getPlayer(hostPlayer.id)).toBeDefined();
    });

    it('stores the game', () => {
      const { game } = manager.createGame('Alice');
      expect(manager.getGame(game.id)).toBe(game);
    });

    it('creates games with custom settings', () => {
      const { game } = manager.createGame('Alice', { minPlayers: 6 });
      expect(game.settings.minPlayers).toBe(6);
    });

    it('creates multiple unique games', () => {
      const { game: g1 } = manager.createGame('Alice');
      const { game: g2 } = manager.createGame('Bob');
      expect(g1.id).not.toBe(g2.id);
    });
  });

  describe('getGame', () => {
    it('returns undefined for unknown id', () => {
      expect(manager.getGame('unknown')).toBeUndefined();
    });

    it('returns existing game', () => {
      const { game } = manager.createGame('Alice');
      expect(manager.getGame(game.id)).toBe(game);
    });
  });

  describe('deleteGame', () => {
    it('deletes a game', () => {
      const { game } = manager.createGame('Alice');
      expect(manager.deleteGame(game.id)).toBe(true);
      expect(manager.getGame(game.id)).toBeUndefined();
    });

    it('returns false for non-existent game', () => {
      expect(manager.deleteGame('nonexistent')).toBe(false);
    });
  });

  describe('joinGame', () => {
    it('adds a player to the game', () => {
      const { game } = manager.createGame('Alice');
      const { player } = manager.joinGame(game.id, 'Bob');
      expect(player.name).toBe('Bob');
      expect(game.getPlayerCount()).toBe(2);
    });

    it('throws for unknown game', () => {
      expect(() => manager.joinGame('unknown', 'Bob')).toThrow('Game not found');
    });

    it('throws when name is taken', () => {
      const { game } = manager.createGame('Alice');
      expect(() => manager.joinGame(game.id, 'Alice')).toThrow('Player name already taken');
    });

    it('returns game reference', () => {
      const { game } = manager.createGame('Alice');
      const result = manager.joinGame(game.id, 'Bob');
      expect(result.game).toBe(game);
    });
  });

  describe('listGames', () => {
    it('returns all games', () => {
      manager.createGame('Alice');
      manager.createGame('Bob');
      expect(manager.listGames().length).toBe(2);
    });

    it('returns empty array when no games', () => {
      expect(manager.listGames().length).toBe(0);
    });
  });

  describe('getWaitingGames', () => {
    it('returns only waiting games', () => {
      const { game: g1 } = manager.createGame('Alice');
      // Add enough players and start
      manager.joinGame(g1.id, 'Bob');
      manager.joinGame(g1.id, 'Carol');
      manager.joinGame(g1.id, 'Dave');
      g1.start();

      manager.createGame('Eve');

      const waiting = manager.getWaitingGames();
      expect(waiting.length).toBe(1);
      expect(waiting[0].getStatus()).toBe('waiting');
    });
  });

  describe('getActiveGames', () => {
    it('returns only active games', () => {
      const { game } = manager.createGame('Alice');
      manager.joinGame(game.id, 'Bob');
      manager.joinGame(game.id, 'Carol');
      manager.joinGame(game.id, 'Dave');
      game.start();

      manager.createGame('Eve');

      const active = manager.getActiveGames();
      expect(active.length).toBe(1);
      expect(active[0].getStatus()).toBe('active');
    });
  });

  describe('getGameCount', () => {
    it('returns correct count', () => {
      expect(manager.getGameCount()).toBe(0);
      manager.createGame('Alice');
      expect(manager.getGameCount()).toBe(1);
      manager.createGame('Bob');
      expect(manager.getGameCount()).toBe(2);
    });
  });
});

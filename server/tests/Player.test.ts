import { Player } from '../src/Player';

describe('Player', () => {
  let player: Player;

  beforeEach(() => {
    player = new Player('test-id', 'Alice');
  });

  describe('constructor', () => {
    it('creates a player with given id and name', () => {
      expect(player.id).toBe('test-id');
      expect(player.name).toBe('Alice');
    });

    it('starts alive and connected', () => {
      expect(player.isAlive).toBe(true);
      expect(player.isConnected).toBe(true);
    });

    it('starts not ready', () => {
      expect(player.isReady).toBe(false);
    });

    it('starts with no role', () => {
      expect(player.role).toBeUndefined();
    });
  });

  describe('assignRole', () => {
    it('assigns mafia role', () => {
      player.assignRole('mafia');
      expect(player.role).toBe('mafia');
    });

    it('assigns townsperson role', () => {
      player.assignRole('townsperson');
      expect(player.role).toBe('townsperson');
    });

    it('assigns doctor role', () => {
      player.assignRole('doctor');
      expect(player.role).toBe('doctor');
    });

    it('assigns sheriff role', () => {
      player.assignRole('sheriff');
      expect(player.role).toBe('sheriff');
    });
  });

  describe('eliminate', () => {
    it('marks player as dead', () => {
      player.eliminate();
      expect(player.isAlive).toBe(false);
    });
  });

  describe('setConnected', () => {
    it('sets connected to false', () => {
      player.setConnected(false);
      expect(player.isConnected).toBe(false);
    });

    it('sets connected to true', () => {
      player.setConnected(false);
      player.setConnected(true);
      expect(player.isConnected).toBe(true);
    });
  });

  describe('markReady / markNotReady', () => {
    it('markReady sets isReady to true', () => {
      player.markReady();
      expect(player.isReady).toBe(true);
    });

    it('markNotReady sets isReady to false', () => {
      player.markReady();
      player.markNotReady();
      expect(player.isReady).toBe(false);
    });
  });

  describe('toData', () => {
    it('returns full player data including role and isReady', () => {
      player.assignRole('sheriff');
      player.markReady();
      const data = player.toData();
      expect(data).toEqual({
        id: 'test-id',
        name: 'Alice',
        role: 'sheriff',
        isAlive: true,
        isConnected: true,
        isReady: true
      });
    });
  });

  describe('toPublicData', () => {
    it('returns public data without role, but with isReady', () => {
      player.assignRole('mafia');
      player.markReady();
      const data = player.toPublicData();
      expect(data.role).toBeUndefined();
      expect(data.id).toBe('test-id');
      expect(data.name).toBe('Alice');
      expect(data.isAlive).toBe(true);
      expect(data.isReady).toBe(true);
    });
  });
});

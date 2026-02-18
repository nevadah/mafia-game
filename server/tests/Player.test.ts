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

    it('assigns detective role', () => {
      player.assignRole('detective');
      expect(player.role).toBe('detective');
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

  describe('toData', () => {
    it('returns full player data including role', () => {
      player.assignRole('detective');
      const data = player.toData();
      expect(data).toEqual({
        id: 'test-id',
        name: 'Alice',
        role: 'detective',
        isAlive: true,
        isConnected: true
      });
    });
  });

  describe('toPublicData', () => {
    it('returns public data without role', () => {
      player.assignRole('mafia');
      const data = player.toPublicData();
      expect(data.role).toBeUndefined();
      expect(data.id).toBe('test-id');
      expect(data.name).toBe('Alice');
      expect(data.isAlive).toBe(true);
    });
  });
});

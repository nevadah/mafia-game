import { Game } from '../src/Game';
import { Player } from '../src/Player';
import { GameSettings } from '../src/types';

function makeGame(playerCount: number = 4, settings?: Partial<GameSettings>): { game: Game; players: Player[]; hostId: string } {
  const hostId = 'host-id';
  const game = new Game(hostId, settings);
  const players: Player[] = [];

  for (let i = 0; i < playerCount; i++) {
    const p = new Player(`player-${i}`, `Player${i}`);
    game.addPlayer(p);
    players.push(p);
  }

  return { game, players, hostId };
}

describe('Game', () => {
  describe('constructor', () => {
    it('creates game with unique id', () => {
      const g1 = new Game('host1');
      const g2 = new Game('host2');
      expect(g1.id).not.toBe(g2.id);
    });

    it('sets hostId correctly', () => {
      const game = new Game('my-host');
      expect(game.hostId).toBe('my-host');
    });

    it('starts in lobby phase with waiting status', () => {
      const game = new Game('host');
      expect(game.getPhase()).toBe('lobby');
      expect(game.getStatus()).toBe('waiting');
      expect(game.getRound()).toBe(0);
    });

    it('uses default settings when none provided', () => {
      const game = new Game('host');
      expect(game.settings.minPlayers).toBe(4);
      expect(game.settings.maxPlayers).toBe(12);
    });

    it('merges custom settings', () => {
      const game = new Game('host', { minPlayers: 6 });
      expect(game.settings.minPlayers).toBe(6);
      expect(game.settings.maxPlayers).toBe(12);
    });
  });

  describe('addPlayer', () => {
    it('adds players successfully', () => {
      const game = new Game('host');
      const p = new Player('p1', 'Alice');
      game.addPlayer(p);
      expect(game.getPlayerCount()).toBe(1);
    });

    it('throws when game is full', () => {
      const game = new Game('host', { maxPlayers: 2 });
      game.addPlayer(new Player('p1', 'Alice'));
      game.addPlayer(new Player('p2', 'Bob'));
      expect(() => game.addPlayer(new Player('p3', 'Carol'))).toThrow('Game is full');
    });

    it('throws when game has already started', () => {
      const { game } = makeGame(4);
      game.start();
      expect(() => game.addPlayer(new Player('new', 'NewPlayer'))).toThrow(
        'Cannot join a game that has already started'
      );
    });

    it('throws when name is already taken', () => {
      const game = new Game('host');
      game.addPlayer(new Player('p1', 'Alice'));
      expect(() => game.addPlayer(new Player('p2', 'Alice'))).toThrow('Player name already taken');
    });
  });

  describe('removePlayer', () => {
    it('removes a player', () => {
      const { game, players } = makeGame(4);
      game.removePlayer(players[0].id);
      expect(game.getPlayerCount()).toBe(3);
    });
  });

  describe('getPlayer', () => {
    it('returns player by id', () => {
      const { game, players } = makeGame(4);
      const found = game.getPlayer(players[0].id);
      expect(found).toBe(players[0]);
    });

    it('returns undefined for unknown id', () => {
      const { game } = makeGame(4);
      expect(game.getPlayer('unknown')).toBeUndefined();
    });
  });

  describe('getAlivePlayers', () => {
    it('returns only alive players', () => {
      const { game, players } = makeGame(4);
      game.start();
      players[0].eliminate();
      expect(game.getAlivePlayers().length).toBe(3);
    });
  });

  describe('start', () => {
    it('starts the game successfully', () => {
      const { game } = makeGame(4);
      game.start();
      expect(game.getStatus()).toBe('active');
      expect(game.getPhase()).toBe('day');
      expect(game.getRound()).toBe(1);
    });

    it('throws when not enough players', () => {
      const game = new Game('host');
      game.addPlayer(new Player('p1', 'Alice'));
      expect(() => game.start()).toThrow('Need at least 4 players to start');
    });

    it('throws when already started', () => {
      const { game } = makeGame(4);
      game.start();
      expect(() => game.start()).toThrow('Game has already started');
    });

    it('assigns roles to all players', () => {
      const { game, players } = makeGame(4);
      game.start();
      for (const p of players) {
        expect(p.role).toBeDefined();
      }
    });

    it('assigns at least one mafia', () => {
      const { game, players } = makeGame(6);
      game.start();
      const mafiaCount = players.filter(p => p.role === 'mafia').length;
      expect(mafiaCount).toBeGreaterThanOrEqual(1);
    });

    it('assigns doctor when hasDoctor is true', () => {
      const { game, players } = makeGame(6);
      game.start();
      const doctorCount = players.filter(p => p.role === 'doctor').length;
      expect(doctorCount).toBe(1);
    });

    it('skips doctor when hasDoctor is false', () => {
      const { game, players } = makeGame(6, { hasDoctor: false });
      game.start();
      const doctorCount = players.filter(p => p.role === 'doctor').length;
      expect(doctorCount).toBe(0);
    });

    it('assigns detective when hasDetective is true', () => {
      const { game, players } = makeGame(6);
      game.start();
      const detectiveCount = players.filter(p => p.role === 'detective').length;
      expect(detectiveCount).toBe(1);
    });
  });

  describe('castVote', () => {
    it('records a vote', () => {
      const { game, players } = makeGame(4);
      game.start();
      game.castVote(players[0].id, players[1].id);
      const votes = game.getVotes();
      expect(votes[players[0].id]).toBe(players[1].id);
    });

    it('throws when not in day phase', () => {
      const { game, players } = makeGame(4);
      game.start();
      game.advancePhase(); // moves to night
      expect(() => game.castVote(players[0].id, players[1].id)).toThrow(
        'Voting is only allowed during the day phase'
      );
    });

    it('throws when voting for yourself', () => {
      const { game, players } = makeGame(4);
      game.start();
      expect(() => game.castVote(players[0].id, players[0].id)).toThrow(
        'Cannot vote for yourself'
      );
    });

    it('throws when voter is dead', () => {
      const { game, players } = makeGame(4);
      game.start();
      players[0].eliminate();
      expect(() => game.castVote(players[0].id, players[1].id)).toThrow(
        'Voter is not a valid alive player'
      );
    });

    it('throws when target is dead', () => {
      const { game, players } = makeGame(4);
      game.start();
      players[1].eliminate();
      expect(() => game.castVote(players[0].id, players[1].id)).toThrow(
        'Target is not a valid alive player'
      );
    });

    it('throws for unknown voter', () => {
      const { game, players } = makeGame(4);
      game.start();
      expect(() => game.castVote('unknown', players[1].id)).toThrow(
        'Voter is not a valid alive player'
      );
    });
  });

  describe('resolveVotes', () => {
    it('eliminates the player with most votes', () => {
      const { game, players } = makeGame(5);
      game.start();
      game.castVote(players[0].id, players[2].id);
      game.castVote(players[1].id, players[2].id);
      game.castVote(players[3].id, players[4].id);
      const eliminated = game.resolveVotes();
      expect(eliminated).toBe(players[2].id);
      expect(players[2].isAlive).toBe(false);
    });

    it('returns null when no votes', () => {
      const { game } = makeGame(4);
      game.start();
      const eliminated = game.resolveVotes();
      expect(eliminated).toBeNull();
    });

    it('throws when not in day phase', () => {
      const { game } = makeGame(4);
      game.start();
      game.advancePhase(); // move to night
      expect(() => game.resolveVotes()).toThrow('Can only resolve votes during day phase');
    });

    it('clears votes after resolution', () => {
      const { game, players } = makeGame(4);
      game.start();
      game.castVote(players[0].id, players[1].id);
      game.resolveVotes();
      expect(Object.keys(game.getVotes()).length).toBe(0);
    });
  });

  describe('advancePhase', () => {
    it('advances from day to night', () => {
      const { game } = makeGame(4);
      game.start();
      expect(game.getPhase()).toBe('day');
      game.advancePhase();
      expect(game.getPhase()).toBe('night');
    });

    it('advances from night to day and increments round', () => {
      const { game } = makeGame(4);
      game.start();
      game.advancePhase(); // day -> night
      game.advancePhase(); // night -> day
      expect(game.getPhase()).toBe('day');
      expect(game.getRound()).toBe(2);
    });

    it('throws when game is not active', () => {
      const { game } = makeGame(4);
      expect(() => game.advancePhase()).toThrow('Game is not active');
    });
  });

  describe('submitNightAction', () => {
    it('records a night action', () => {
      const { game, players } = makeGame(6);
      game.start();
      game.advancePhase(); // move to night

      const mafia = players.find(p => p.role === 'mafia')!;
      const target = players.find(p => p.role !== 'mafia')!;
      game.submitNightAction(mafia.id, target.id);
      const actions = game.getNightActions();
      expect(actions[mafia.id]).toBe(target.id);
    });

    it('throws when not in night phase', () => {
      const { game, players } = makeGame(6);
      game.start();
      const mafia = players.find(p => p.role === 'mafia')!;
      const target = players.find(p => p.role !== 'mafia')!;
      expect(() => game.submitNightAction(mafia.id, target.id)).toThrow(
        'Night actions are only allowed during the night phase'
      );
    });

    it('throws for townsperson', () => {
      const { game, players } = makeGame(6);
      game.start();
      game.advancePhase();
      const townsperson = players.find(p => p.role === 'townsperson')!;
      const target = players.find(p => p !== townsperson)!;
      expect(() => game.submitNightAction(townsperson.id, target.id)).toThrow(
        'Player does not have a night action'
      );
    });

    it('throws for dead actor', () => {
      const { game, players } = makeGame(6);
      game.start();
      game.advancePhase();
      const mafia = players.find(p => p.role === 'mafia')!;
      mafia.eliminate();
      const target = players.find(p => p !== mafia)!;
      expect(() => game.submitNightAction(mafia.id, target.id)).toThrow(
        'Actor is not a valid alive player'
      );
    });

    it('throws for unknown actor', () => {
      const { game, players } = makeGame(6);
      game.start();
      game.advancePhase();
      const target = players[0];
      expect(() => game.submitNightAction('unknown', target.id)).toThrow(
        'Actor is not a valid alive player'
      );
    });

    it('throws when target is dead', () => {
      const { game, players } = makeGame(6);
      game.start();
      game.advancePhase();
      const mafia = players.find(p => p.role === 'mafia')!;
      const target = players.find(p => p.role !== 'mafia')!;
      target.eliminate();
      expect(() => game.submitNightAction(mafia.id, target.id)).toThrow(
        'Target is not a valid alive player'
      );
    });
  });

  describe('resolveNightActions', () => {
    it('mafia eliminates target', () => {
      const { game, players } = makeGame(6);
      game.start();
      game.advancePhase();
      const mafia = players.find(p => p.role === 'mafia')!;
      const town = players.find(p => p.role === 'townsperson')!;
      game.submitNightAction(mafia.id, town.id);
      const eliminated = game.resolveNightActions();
      expect(eliminated).toBe(town.id);
      expect(town.isAlive).toBe(false);
    });

    it('doctor saves mafia target', () => {
      const { game, players } = makeGame(6);
      game.start();
      game.advancePhase();
      const mafia = players.find(p => p.role === 'mafia')!;
      const doctor = players.find(p => p.role === 'doctor')!;
      const town = players.find(p => p.role === 'townsperson')!;
      game.submitNightAction(mafia.id, town.id);
      game.submitNightAction(doctor.id, town.id);
      const eliminated = game.resolveNightActions();
      expect(eliminated).toBeNull();
      expect(town.isAlive).toBe(true);
    });

    it('detective investigates a player', () => {
      const { game, players } = makeGame(6);
      game.start();
      game.advancePhase();
      const detective = players.find(p => p.role === 'detective')!;
      const mafia = players.find(p => p.role === 'mafia')!;
      game.submitNightAction(detective.id, mafia.id);
      game.resolveNightActions();
      const state = game.toState(detective.id);
      expect(state.investigatedThisRound).toBeDefined();
      expect(state.investigatedThisRound?.result).toBe('mafia');
    });

    it('throws when not in night phase', () => {
      const { game } = makeGame(4);
      game.start();
      expect(() => game.resolveNightActions()).toThrow(
        'Can only resolve night actions during night phase'
      );
    });

    it('resolves with no actions (no elimination)', () => {
      const { game } = makeGame(4);
      game.start();
      game.advancePhase();
      const eliminated = game.resolveNightActions();
      expect(eliminated).toBeNull();
    });
  });

  describe('checkWinCondition', () => {
    it('returns town when no mafia alive', () => {
      const { game, players } = makeGame(4);
      game.start();
      const mafiaPlayers = players.filter(p => p.role === 'mafia');
      mafiaPlayers.forEach(p => p.eliminate());
      const winner = game.checkWinCondition();
      expect(winner).toBe('town');
      expect(game.getStatus()).toBe('ended');
      expect(game.getPhase()).toBe('ended');
    });

    it('returns mafia when mafia >= town', () => {
      const { game, players } = makeGame(4);
      game.start();
      const townPlayers = players.filter(p => p.role !== 'mafia');
      // eliminate all but one townsperson
      townPlayers.slice(1).forEach(p => p.eliminate());
      const winner = game.checkWinCondition();
      expect(winner).toBe('mafia');
      expect(game.getStatus()).toBe('ended');
    });

    it('returns null when game continues', () => {
      const { game } = makeGame(5);
      game.start();
      expect(game.checkWinCondition()).toBeNull();
    });

    it('sets winner', () => {
      const { game, players } = makeGame(4);
      game.start();
      players.filter(p => p.role === 'mafia').forEach(p => p.eliminate());
      game.checkWinCondition();
      expect(game.getWinner()).toBe('town');
    });
  });

  describe('toState', () => {
    it('returns game state object', () => {
      const { game } = makeGame(4);
      const state = game.toState();
      expect(state.id).toBe(game.id);
      expect(state.phase).toBe('lobby');
      expect(state.status).toBe('waiting');
      expect(state.players.length).toBe(4);
    });

    it('includes role for the requesting player', () => {
      const { game, players } = makeGame(4);
      game.start();
      const p = players[0];
      const state = game.toState(p.id);
      const playerData = state.players.find(pd => pd.id === p.id);
      expect(playerData?.role).toBeDefined();
    });

    it('hides roles of other players', () => {
      const { game, players } = makeGame(4);
      game.start();
      const p = players[0];
      const state = game.toState(p.id);
      const otherPlayerData = state.players.find(pd => pd.id !== p.id);
      expect(otherPlayerData?.role).toBeUndefined();
    });

    it('reveals all roles when game ended', () => {
      const { game, players } = makeGame(4);
      game.start();
      players.filter(p => p.role === 'mafia').forEach(p => p.eliminate());
      game.checkWinCondition();
      const state = game.toState(players[0].id);
      for (const pd of state.players) {
        expect(pd.role).toBeDefined();
      }
    });
  });
});

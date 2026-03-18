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
      expect(game.settings.hasSheriff).toBe(true);
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

  // ── Ready status ───────────────────────────────────────────────────────────

  describe('markPlayerReady', () => {
    it('marks player as ready', () => {
      const { game, players } = makeGame(4);
      game.markPlayerReady(players[0].id);
      expect(players[0].isReady).toBe(true);
    });

    it('throws for unknown player', () => {
      const { game } = makeGame(4);
      expect(() => game.markPlayerReady('unknown')).toThrow('Player not found');
    });

    it('throws after game has started', () => {
      const { game, players } = makeGame(4);
      game.start();
      expect(() => game.markPlayerReady(players[0].id)).toThrow(
        'Cannot change ready status after game has started'
      );
    });
  });

  describe('markPlayerNotReady', () => {
    it('marks player as not ready', () => {
      const { game, players } = makeGame(4);
      game.markPlayerReady(players[0].id);
      game.markPlayerNotReady(players[0].id);
      expect(players[0].isReady).toBe(false);
    });

    it('throws for unknown player', () => {
      const { game } = makeGame(4);
      expect(() => game.markPlayerNotReady('unknown')).toThrow('Player not found');
    });

    it('throws after game has started', () => {
      const { game, players } = makeGame(4);
      game.start();
      expect(() => game.markPlayerNotReady(players[0].id)).toThrow(
        'Cannot change ready status after game has started'
      );
    });
  });

  describe('getReadyCount', () => {
    it('returns 0 initially', () => {
      const { game } = makeGame(4);
      expect(game.getReadyCount()).toBe(0);
    });

    it('returns count of ready players', () => {
      const { game, players } = makeGame(4);
      game.markPlayerReady(players[0].id);
      game.markPlayerReady(players[1].id);
      expect(game.getReadyCount()).toBe(2);
    });
  });

  describe('areAllPlayersReady', () => {
    it('returns false when no players are ready', () => {
      const { game } = makeGame(4);
      expect(game.areAllPlayersReady()).toBe(false);
    });

    it('returns false when only some players are ready', () => {
      const { game, players } = makeGame(4);
      game.markPlayerReady(players[0].id);
      expect(game.areAllPlayersReady()).toBe(false);
    });

    it('returns true when all players are ready and meets minPlayers', () => {
      const { game, players } = makeGame(4);
      for (const p of players) game.markPlayerReady(p.id);
      expect(game.areAllPlayersReady()).toBe(true);
    });

    it('returns false when all ready but below minPlayers', () => {
      const game = new Game('host', { minPlayers: 4 });
      const p = new Player('p1', 'Alice');
      game.addPlayer(p);
      game.markPlayerReady(p.id);
      expect(game.areAllPlayersReady()).toBe(false);
    });
  });

  // ── Start ──────────────────────────────────────────────────────────────────

  describe('start', () => {
    it('starts the game successfully', () => {
      const { game } = makeGame(4);
      game.start();
      expect(game.getStatus()).toBe('active');
      expect(game.getPhase()).toBe('night');
      expect(game.getRound()).toBe(0);
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

    it('assigns sheriff when hasSheriff is true', () => {
      const { game, players } = makeGame(6);
      game.start();
      const sheriffCount = players.filter(p => p.role === 'sheriff').length;
      expect(sheriffCount).toBe(1);
    });

    it('skips sheriff when hasSheriff is false', () => {
      const { game, players } = makeGame(6, { hasSheriff: false });
      game.start();
      const sheriffCount = players.filter(p => p.role === 'sheriff').length;
      expect(sheriffCount).toBe(0);
    });
  });

  // ── Day voting ─────────────────────────────────────────────────────────────

  describe('castVote', () => {
    it('records a vote', () => {
      const { game, players } = makeGame(4);
      game.start();
      game.advancePhase();
      game.castVote(players[0].id, players[1].id);
      const votes = game.getVotes();
      expect(votes[players[0].id]).toBe(players[1].id);
    });

    it('throws when not in day phase', () => {
      const { game, players } = makeGame(4);
      game.start(); // starts in night
      expect(() => game.castVote(players[0].id, players[1].id)).toThrow(
        'Voting is only allowed during the day phase'
      );
    });

    it('throws when voting for yourself', () => {
      const { game, players } = makeGame(4);
      game.start();
      game.advancePhase();
      expect(() => game.castVote(players[0].id, players[0].id)).toThrow(
        'Cannot vote for yourself'
      );
    });

    it('throws when voter is dead', () => {
      const { game, players } = makeGame(4);
      game.start();
      game.advancePhase();
      players[0].eliminate();
      expect(() => game.castVote(players[0].id, players[1].id)).toThrow(
        'Voter is not a valid alive player'
      );
    });

    it('throws when target is dead', () => {
      const { game, players } = makeGame(4);
      game.start();
      game.advancePhase();
      players[1].eliminate();
      expect(() => game.castVote(players[0].id, players[1].id)).toThrow(
        'Target is not a valid alive player'
      );
    });

    it('throws for unknown voter', () => {
      const { game, players } = makeGame(4);
      game.start();
      game.advancePhase();
      expect(() => game.castVote('unknown', players[1].id)).toThrow(
        'Voter is not a valid alive player'
      );
    });
  });

  describe('resolveVotes', () => {
    it('eliminates the player with most votes', () => {
      const { game, players } = makeGame(5);
      game.start();
      game.advancePhase();
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
      game.advancePhase();
      const eliminated = game.resolveVotes();
      expect(eliminated).toBeNull();
    });

    it('throws when not in day phase', () => {
      const { game } = makeGame(4);
      game.start(); // starts in night
      expect(() => game.resolveVotes()).toThrow('Can only resolve votes during day phase');
    });

    it('clears votes after resolution', () => {
      const { game, players } = makeGame(4);
      game.start();
      game.advancePhase();
      game.castVote(players[0].id, players[1].id);
      game.resolveVotes();
      expect(Object.keys(game.getVotes()).length).toBe(0);
    });
  });

  // ── Phase management ───────────────────────────────────────────────────────

  describe('advancePhase', () => {
    it('advances from night to day and increments round', () => {
      const { game } = makeGame(4);
      game.start(); // night, round 0
      expect(game.getPhase()).toBe('night');
      game.advancePhase(); // night → day, round++
      expect(game.getPhase()).toBe('day');
      expect(game.getRound()).toBe(1);
    });

    it('advances from day to night', () => {
      const { game } = makeGame(4);
      game.start(); // night
      game.advancePhase(); // → day
      game.advancePhase(); // → night
      expect(game.getPhase()).toBe('night');
      expect(game.getRound()).toBe(1); // round does not increment on day → night
    });

    it('throws when game is not active', () => {
      const { game } = makeGame(4);
      expect(() => game.advancePhase()).toThrow('Game is not active');
    });
  });

  // ── Night actions ──────────────────────────────────────────────────────────

  describe('submitNightAction', () => {
    it('records a night action for mafia', () => {
      const { game, players } = makeGame(6);
      game.start();

      const mafia = players.find(p => p.role === 'mafia')!;
      const target = players.find(p => p.role !== 'mafia')!;
      game.submitNightAction(mafia.id, target.id);
      const actions = game.getNightActions();
      expect(actions[mafia.id]).toBe(target.id);
    });

    it('records a night action for sheriff', () => {
      const { game, players } = makeGame(6);
      game.start();

      const sheriff = players.find(p => p.role === 'sheriff')!;
      const target = players.find(p => p !== sheriff)!;
      game.submitNightAction(sheriff.id, target.id);
      expect(game.getNightActions()[sheriff.id]).toBe(target.id);
    });

    it('throws when not in night phase', () => {
      const { game, players } = makeGame(6);
      game.start();
      game.advancePhase(); // night → day
      const mafia = players.find(p => p.role === 'mafia')!;
      const target = players.find(p => p.role !== 'mafia')!;
      expect(() => game.submitNightAction(mafia.id, target.id)).toThrow(
        'Night actions are only allowed during the night phase'
      );
    });

    it('throws for townsperson', () => {
      const { game, players } = makeGame(6);
      game.start();
      const townsperson = players.find(p => p.role === 'townsperson')!;
      const target = players.find(p => p !== townsperson)!;
      expect(() => game.submitNightAction(townsperson.id, target.id)).toThrow(
        'Player does not have a night action'
      );
    });

    it('throws for dead actor', () => {
      const { game, players } = makeGame(6);
      game.start();
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
      const target = players[0];
      expect(() => game.submitNightAction('unknown', target.id)).toThrow(
        'Actor is not a valid alive player'
      );
    });

    it('throws when target is dead', () => {
      const { game, players } = makeGame(6);
      game.start();
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
      const mafia = players.find(p => p.role === 'mafia')!;
      const doctor = players.find(p => p.role === 'doctor')!;
      const town = players.find(p => p.role === 'townsperson')!;
      game.submitNightAction(mafia.id, town.id);
      game.submitNightAction(doctor.id, town.id);
      const eliminated = game.resolveNightActions();
      expect(eliminated).toBeNull();
      expect(town.isAlive).toBe(true);
    });

    it('sheriff investigates a player', () => {
      const { game, players } = makeGame(6);
      game.start();
      const sheriff = players.find(p => p.role === 'sheriff')!;
      const mafia = players.find(p => p.role === 'mafia')!;
      game.submitNightAction(sheriff.id, mafia.id);
      game.resolveNightActions();
      const state = game.toState(sheriff.id);
      expect(state.investigatedThisRound).toBeDefined();
      expect(state.investigatedThisRound?.result).toBe('mafia');
    });

    it('investigatedThisRound is null for non-sheriff requestors', () => {
      const { game, players } = makeGame(6);
      game.start();
      const sheriff = players.find(p => p.role === 'sheriff')!;
      const mafia = players.find(p => p.role === 'mafia')!;
      const town = players.find(p => p.role === 'townsperson')!;
      game.submitNightAction(sheriff.id, mafia.id);
      game.resolveNightActions();
      expect(game.toState(town.id).investigatedThisRound).toBeNull();
      expect(game.toState(mafia.id).investigatedThisRound).toBeNull();
      expect(game.toState().investigatedThisRound).toBeNull();
    });

    it('doctorProtectedThisRound is visible to doctor', () => {
      const { game, players } = makeGame(6);
      game.start();
      const doctor = players.find(p => p.role === 'doctor')!;
      const town = players.find(p => p.role === 'townsperson')!;
      game.submitNightAction(doctor.id, town.id);
      game.resolveNightActions();
      const state = game.toState(doctor.id);
      expect(state.doctorProtectedThisRound).toBe(town.id);
    });

    it('doctorProtectedThisRound is null for non-doctor requestors', () => {
      const { game, players } = makeGame(6);
      game.start();
      const doctor = players.find(p => p.role === 'doctor')!;
      const town = players.find(p => p.role === 'townsperson')!;
      const mafia = players.find(p => p.role === 'mafia')!;
      game.submitNightAction(doctor.id, town.id);
      game.resolveNightActions();
      expect(game.toState(town.id).doctorProtectedThisRound).toBeNull();
      expect(game.toState(mafia.id).doctorProtectedThisRound).toBeNull();
      expect(game.toState().doctorProtectedThisRound).toBeNull();
    });

    it('eliminatedThisRound persists into the day phase after night resolution', () => {
      const { game, players } = makeGame(6);
      game.start();
      const mafia = players.find(p => p.role === 'mafia')!;
      const town = players.find(p => p.role === 'townsperson')!;
      game.submitNightAction(mafia.id, town.id);
      game.resolveNightActions();
      game.advancePhase(); // night → day
      expect(game.toState().eliminatedThisRound).toBe(town.id);
    });

    it('eliminatedThisRound is cleared at the start of the next resolveNightActions', () => {
      const { game, players } = makeGame(6);
      game.start();
      const mafia = players.find(p => p.role === 'mafia')!;
      const town = players.find(p => p.role === 'townsperson')!;
      game.submitNightAction(mafia.id, town.id);
      game.resolveNightActions();
      game.advancePhase(); // night → day
      game.advancePhase(); // day → night
      // No mafia kill this time
      game.resolveNightActions();
      expect(game.toState().eliminatedThisRound).toBeUndefined();
    });

    it('throws when not in night phase', () => {
      const { game } = makeGame(4);
      game.start();
      game.advancePhase(); // night → day
      expect(() => game.resolveNightActions()).toThrow(
        'Can only resolve night actions during night phase'
      );
    });

    it('resolves with no actions (no elimination)', () => {
      const { game } = makeGame(4);
      game.start();
      const eliminated = game.resolveNightActions();
      expect(eliminated).toBeNull();
    });
  });

  // ── Chat ──────────────────────────────────────────────────────────────────

  describe('addChatMessage', () => {
    it('adds a message during day phase and returns it', () => {
      const { game, players } = makeGame(4);
      game.start();
      game.advancePhase(); // night → day
      const msg = game.addChatMessage(players[0].id, 'Hello!');
      expect(msg.senderId).toBe(players[0].id);
      expect(msg.senderName).toBe(players[0].name);
      expect(msg.text).toBe('Hello!');
      expect(typeof msg.timestamp).toBe('number');
    });

    it('trims whitespace from message text', () => {
      const { game, players } = makeGame(4);
      game.start();
      game.advancePhase();
      const msg = game.addChatMessage(players[0].id, '  hi  ');
      expect(msg.text).toBe('hi');
    });

    it('includes messages in toState()', () => {
      const { game, players } = makeGame(4);
      game.start();
      game.advancePhase();
      game.addChatMessage(players[0].id, 'Hello!');
      const state = game.toState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].text).toBe('Hello!');
    });

    it('accumulates multiple messages in order', () => {
      const { game, players } = makeGame(4);
      game.start();
      game.advancePhase();
      game.addChatMessage(players[0].id, 'First');
      game.addChatMessage(players[1].id, 'Second');
      expect(game.toState().messages).toHaveLength(2);
      expect(game.toState().messages[0].text).toBe('First');
      expect(game.toState().messages[1].text).toBe('Second');
    });

    it('throws when not in day phase (night)', () => {
      const { game, players } = makeGame(4);
      game.start(); // night
      expect(() => game.addChatMessage(players[0].id, 'hi')).toThrow(
        'Chat is only allowed during the day phase'
      );
    });

    it('throws when not in day phase (lobby)', () => {
      const { game, players } = makeGame(4);
      expect(() => game.addChatMessage(players[0].id, 'hi')).toThrow(
        'Chat is only allowed during the day phase'
      );
    });

    it('throws for a dead player', () => {
      const { game, players } = makeGame(4);
      game.start();
      game.advancePhase();
      players[1].eliminate();
      expect(() => game.addChatMessage(players[1].id, 'hi')).toThrow(
        'Only alive players can send chat messages'
      );
    });

    it('throws for an empty message', () => {
      const { game, players } = makeGame(4);
      game.start();
      game.advancePhase();
      expect(() => game.addChatMessage(players[0].id, '   ')).toThrow(
        'Message cannot be empty'
      );
    });

    it('throws when message exceeds 200 characters', () => {
      const { game, players } = makeGame(4);
      game.start();
      game.advancePhase();
      expect(() => game.addChatMessage(players[0].id, 'a'.repeat(201))).toThrow(
        'Message cannot exceed 200 characters'
      );
    });
  });

  // ── Win conditions ─────────────────────────────────────────────────────────

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

  // ── toState ────────────────────────────────────────────────────────────────

  describe('toState', () => {
    it('returns game state object', () => {
      const { game } = makeGame(4);
      const state = game.toState();
      expect(state.id).toBe(game.id);
      expect(state.phase).toBe('lobby');
      expect(state.status).toBe('waiting');
      expect(state.players.length).toBe(4);
    });

    it('includes readyCount in state', () => {
      const { game, players } = makeGame(4);
      game.markPlayerReady(players[0].id);
      const state = game.toState();
      expect(state.readyCount).toBe(1);
    });

    it('includes role for the requesting player', () => {
      const { game, players } = makeGame(4);
      game.start();
      const p = players[0];
      const state = game.toState(p.id);
      const playerData = state.players.find(pd => pd.id === p.id);
      expect(playerData?.role).toBeDefined();
    });

    it('hides roles of other players for non-mafia requestors', () => {
      const { game, players } = makeGame(4);
      game.start();
      const nonMafia = players.find(p => p.role !== 'mafia')!;
      const state = game.toState(nonMafia.id);
      const otherPlayers = state.players.filter(pd => pd.id !== nonMafia.id);
      for (const pd of otherPlayers) {
        expect(pd.role).toBeUndefined();
      }
    });

    it('reveals fellow mafia roles to a mafia requestor', () => {
      const { game, players } = makeGame(6);
      game.start();
      const mafia = players.filter(p => p.role === 'mafia');
      // Only meaningful when there are at least 2 mafia members
      if (mafia.length < 2) return;
      const [requester, teammate] = mafia;
      const state = game.toState(requester.id);
      const teammateData = state.players.find(pd => pd.id === teammate.id);
      expect(teammateData?.role).toBe('mafia');
    });

    it('does not reveal non-mafia roles to a mafia requestor', () => {
      const { game, players } = makeGame(4);
      game.start();
      const mafia = players.find(p => p.role === 'mafia')!;
      const state = game.toState(mafia.id);
      const nonMafiaPlayers = state.players.filter(
        pd => pd.id !== mafia.id && players.find(p => p.id === pd.id)?.role !== 'mafia'
      );
      for (const pd of nonMafiaPlayers) {
        expect(pd.role).toBeUndefined();
      }
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

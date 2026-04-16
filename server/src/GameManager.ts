import { v4 as uuidv4 } from 'uuid';
import { Game } from './Game';
import { Player } from './Player';
import { logger } from './logger';
import { GameSettings } from './types';

interface Session {
  token: string;
  gameId: string;
  playerId: string;
  isSpectator: boolean;
}

export class GameManager {
  private games: Map<string, Game>;
  private sessions: Map<string, Session>;

  constructor() {
    this.games = new Map();
    this.sessions = new Map();
  }

  createGame(hostName: string, settings?: Partial<GameSettings>): { game: Game; hostPlayer: Player; token: string } {
    const hostId = uuidv4();
    const game = new Game(hostId, settings);
    const hostPlayer = new Player(hostId, hostName);
    game.addPlayer(hostPlayer);
    this.games.set(game.id, game);

    const token = this.issueSession(game.id, hostId);
    logger.info({ gameId: game.id, hostId, hostName }, 'game created');
    return { game, hostPlayer, token };
  }

  getGame(gameId: string): Game | undefined {
    return this.games.get(gameId);
  }

  deleteGame(gameId: string): boolean {
    const game = this.games.get(gameId);
    if (!game) {
      return false;
    }

    for (const player of game.getPlayers()) {
      this.revokeSessionsForPlayer(gameId, player.id);
    }
    for (const spectator of game.getSpectators()) {
      this.revokeSessionsForPlayer(gameId, spectator.id);
    }

    const deleted = this.games.delete(gameId);
    if (deleted) logger.info({ gameId }, 'game deleted');
    return deleted;
  }

  joinGame(gameId: string, playerName: string): { game: Game; player: Player; token: string } {
    const game = this.getGame(gameId);
    if (!game) {
      throw new Error('Game not found');
    }

    const player = new Player(uuidv4(), playerName);
    game.addPlayer(player);

    const token = this.issueSession(gameId, player.id);
    logger.info({ gameId, playerId: player.id, playerName }, 'player joined');
    return { game, player, token };
  }

  leaveGame(gameId: string, playerId: string): { deletedGame: boolean } {
    const game = this.getGame(gameId);
    if (!game) {
      throw new Error('Game not found');
    }

    if (!game.getPlayer(playerId)) {
      throw new Error('Player not found');
    }

    game.removePlayer(playerId);
    this.revokeSessionsForPlayer(gameId, playerId);

    // Host departure closes the room until host migration is implemented.
    if (playerId === game.hostId || game.getPlayerCount() === 0) {
      this.deleteGame(gameId);
      logger.info({ gameId, playerId, reason: playerId === game.hostId ? 'host left' : 'last player' }, 'player left');
      return { deletedGame: true };
    }

    if (game.getStatus() === 'active') {
      game.checkWinCondition();
    }

    logger.info({ gameId, playerId }, 'player left');
    return { deletedGame: false };
  }

  joinAsSpectator(gameId: string, spectatorName: string): { game: Game; spectatorId: string; token: string } {
    const game = this.getGame(gameId);
    if (!game) {
      throw new Error('Game not found');
    }

    const spectatorId = uuidv4();
    game.addSpectator(spectatorId, spectatorName);

    const token = this.issueSession(gameId, spectatorId, true);
    logger.info({ gameId, spectatorId, spectatorName }, 'spectator joined');
    return { game, spectatorId, token };
  }

  leaveSpectator(gameId: string, spectatorId: string): void {
    const game = this.getGame(gameId);
    if (!game) {
      throw new Error('Game not found');
    }

    game.removeSpectator(spectatorId);
    this.revokeSessionsForPlayer(gameId, spectatorId);
    logger.info({ gameId, spectatorId }, 'spectator left');
  }

  listGames(): Game[] {
    return [...this.games.values()];
  }

  getActiveGames(): Game[] {
    return this.listGames().filter(g => g.getStatus() === 'active');
  }

  getWaitingGames(): Game[] {
    return this.listGames().filter(g => g.getStatus() === 'waiting');
  }

  getGameCount(): number {
    return this.games.size;
  }

  getSession(token: string): Session | undefined {
    return this.sessions.get(token);
  }

  pruneStaleWaitingGames(maxIdleMs: number): number {
    const now = Date.now();
    let removed = 0;

    for (const game of this.getWaitingGames()) {
      if (now - game.getUpdatedAt() > maxIdleMs) {
        this.deleteGame(game.id);
        removed++;
      }
    }

    if (removed > 0) logger.info({ removed, maxIdleMs }, 'pruned stale waiting games');
    return removed;
  }

  private issueSession(gameId: string, playerId: string, isSpectator = false): string {
    const token = uuidv4();
    this.sessions.set(token, { token, gameId, playerId, isSpectator });
    return token;
  }

  private revokeSessionsForPlayer(gameId: string, playerId: string): void {
    for (const [token, session] of this.sessions) {
      if (session.gameId === gameId && session.playerId === playerId) {
        this.sessions.delete(token);
      }
    }
  }
}

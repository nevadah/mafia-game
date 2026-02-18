import { v4 as uuidv4 } from 'uuid';
import { Game } from './Game';
import { Player } from './Player';
import { GameSettings } from './types';

interface Session {
  token: string;
  gameId: string;
  playerId: string;
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

    return this.games.delete(gameId);
  }

  joinGame(gameId: string, playerName: string): { game: Game; player: Player; token: string } {
    const game = this.getGame(gameId);
    if (!game) {
      throw new Error('Game not found');
    }

    const player = new Player(uuidv4(), playerName);
    game.addPlayer(player);

    const token = this.issueSession(gameId, player.id);
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
      return { deletedGame: true };
    }

    if (game.getStatus() === 'active') {
      game.checkWinCondition();
    }

    return { deletedGame: false };
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

    return removed;
  }

  private issueSession(gameId: string, playerId: string): string {
    const token = uuidv4();
    this.sessions.set(token, { token, gameId, playerId });
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

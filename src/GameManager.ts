import { v4 as uuidv4 } from 'uuid';
import { Game } from './Game';
import { Player } from './Player';
import { GameSettings } from './types';

export class GameManager {
  private games: Map<string, Game>;

  constructor() {
    this.games = new Map();
  }

  createGame(hostName: string, settings?: Partial<GameSettings>): { game: Game; hostPlayer: Player } {
    const hostId = uuidv4();
    const game = new Game(hostId, settings);
    const hostPlayer = new Player(hostId, hostName);
    game.addPlayer(hostPlayer);
    this.games.set(game.id, game);
    return { game, hostPlayer };
  }

  getGame(gameId: string): Game | undefined {
    return this.games.get(gameId);
  }

  deleteGame(gameId: string): boolean {
    return this.games.delete(gameId);
  }

  joinGame(gameId: string, playerName: string): { game: Game; player: Player } {
    const game = this.getGame(gameId);
    if (!game) {
      throw new Error('Game not found');
    }
    const player = new Player(uuidv4(), playerName);
    game.addPlayer(player);
    return { game, player };
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
}

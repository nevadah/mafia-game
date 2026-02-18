import express, { Request, Response, NextFunction } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { GameManager } from './GameManager';
import {
  CreateGameRequest,
  JoinGameRequest,
  VoteRequest,
  NightActionRequest,
  ServerToClientMessage
} from './types';

export function createApp(gameManager: GameManager) {
  const app = express();
  app.use(express.json());

  // POST /games - create a new game
  app.post('/games', (req: Request, res: Response) => {
    const { hostName, settings } = req.body as CreateGameRequest;
    if (!hostName || typeof hostName !== 'string' || hostName.trim() === '') {
      return res.status(400).json({ error: 'hostName is required' });
    }
    try {
      const { game, hostPlayer } = gameManager.createGame(hostName.trim(), settings);
      return res.status(201).json({
        gameId: game.id,
        playerId: hostPlayer.id,
        state: game.toState(hostPlayer.id)
      });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  // GET /games - list waiting games
  app.get('/games', (_req: Request, res: Response) => {
    const games = gameManager.getWaitingGames();
    return res.json(
      games.map(g => ({
        gameId: g.id,
        playerCount: g.getPlayerCount(),
        settings: g.settings
      }))
    );
  });

  // GET /games/:gameId - get game state
  app.get('/games/:gameId', (req: Request, res: Response) => {
    const game = gameManager.getGame(req.params.gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    const playerId = req.query.playerId as string | undefined;
    return res.json({ state: game.toState(playerId) });
  });

  // POST /games/:gameId/join - join a game
  app.post('/games/:gameId/join', (req: Request, res: Response) => {
    const { playerName } = req.body as JoinGameRequest;
    if (!playerName || typeof playerName !== 'string' || playerName.trim() === '') {
      return res.status(400).json({ error: 'playerName is required' });
    }
    try {
      const { game, player } = gameManager.joinGame(req.params.gameId, playerName.trim());
      return res.status(200).json({
        playerId: player.id,
        state: game.toState(player.id)
      });
    } catch (err) {
      const message = (err as Error).message;
      if (message === 'Game not found') {
        return res.status(404).json({ error: message });
      }
      return res.status(400).json({ error: message });
    }
  });

  // POST /games/:gameId/start - start the game
  app.post('/games/:gameId/start', (req: Request, res: Response) => {
    const game = gameManager.getGame(req.params.gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    const { playerId } = req.body as { playerId: string };
    if (playerId !== game.hostId) {
      return res.status(403).json({ error: 'Only the host can start the game' });
    }
    try {
      game.start();
      return res.json({ state: game.toState(playerId) });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  // POST /games/:gameId/vote - cast a vote during the day
  app.post('/games/:gameId/vote', (req: Request, res: Response) => {
    const game = gameManager.getGame(req.params.gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    const { voterId, targetId } = req.body as VoteRequest;
    if (!voterId || !targetId) {
      return res.status(400).json({ error: 'voterId and targetId are required' });
    }
    try {
      game.castVote(voterId, targetId);
      return res.json({ state: game.toState(voterId) });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  // POST /games/:gameId/resolve-votes - resolve day votes (host only)
  app.post('/games/:gameId/resolve-votes', (req: Request, res: Response) => {
    const game = gameManager.getGame(req.params.gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    const { playerId } = req.body as { playerId: string };
    if (playerId !== game.hostId) {
      return res.status(403).json({ error: 'Only the host can resolve votes' });
    }
    try {
      const eliminated = game.resolveVotes();
      const winner = game.checkWinCondition();
      if (!winner) {
        game.advancePhase();
      }
      return res.json({ eliminated, winner, state: game.toState(playerId) });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  // POST /games/:gameId/night-action - submit a night action
  app.post('/games/:gameId/night-action', (req: Request, res: Response) => {
    const game = gameManager.getGame(req.params.gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    const { playerId, targetId } = req.body as NightActionRequest;
    if (!playerId || !targetId) {
      return res.status(400).json({ error: 'playerId and targetId are required' });
    }
    try {
      game.submitNightAction(playerId, targetId);
      return res.json({ state: game.toState(playerId) });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  // POST /games/:gameId/resolve-night - resolve night actions (host only)
  app.post('/games/:gameId/resolve-night', (req: Request, res: Response) => {
    const game = gameManager.getGame(req.params.gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    const { playerId } = req.body as { playerId: string };
    if (playerId !== game.hostId) {
      return res.status(403).json({ error: 'Only the host can resolve night actions' });
    }
    try {
      const eliminated = game.resolveNightActions();
      const winner = game.checkWinCondition();
      if (!winner) {
        game.advancePhase();
      }
      return res.json({ eliminated, winner, state: game.toState(playerId) });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

export function createWebSocketServer(
  server: import('http').Server,
  gameManager: GameManager
): WebSocketServer {
  const wss = new WebSocketServer({ server });

  const clients = new Map<WebSocket, { gameId?: string; playerId?: string }>();

  function broadcast(gameId: string, message: ServerToClientMessage, exclude?: WebSocket): void {
    for (const [ws, info] of clients) {
      if (info.gameId === gameId && ws !== exclude && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    }
  }

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? '/', 'ws://localhost');
    const gameId = url.searchParams.get('gameId') ?? undefined;
    const playerId = url.searchParams.get('playerId') ?? undefined;

    clients.set(ws, { gameId, playerId });

    // Validate and send initial state if joining a game
    if (gameId) {
      const game = gameManager.getGame(gameId);
      if (!game) {
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Game not found' } }));
        ws.close();
        return;
      }

      if (playerId) {
        const player = game.getPlayer(playerId);
        if (player) {
          player.setConnected(true);
        }
      }

      ws.send(
        JSON.stringify({
          type: 'connected',
          payload: { state: game.toState(playerId) }
        })
      );

      if (playerId) {
        broadcast(gameId, {
          type: 'player_joined',
          payload: { playerId, state: game.toState() }
        }, ws);
      }
    } else {
      ws.send(JSON.stringify({ type: 'connected', payload: {} }));
    }

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        const info = clients.get(ws);
        if (!info?.gameId) return;

        const game = gameManager.getGame(info.gameId);
        if (!game) return;

        handleClientMessage(ws, game, info.playerId, message, broadcast);
      } catch {
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid message format' } }));
      }
    });

    ws.on('close', () => {
      const info = clients.get(ws);
      clients.delete(ws);

      if (info?.gameId && info?.playerId) {
        const game = gameManager.getGame(info.gameId);
        if (game) {
          const player = game.getPlayer(info.playerId);
          if (player) {
            player.setConnected(false);
          }
          broadcast(info.gameId, {
            type: 'player_left',
            payload: { playerId: info.playerId, state: game.toState() }
          });
        }
      }
    });
  });

  return wss;
}

function handleClientMessage(
  ws: WebSocket,
  game: ReturnType<GameManager['getGame']>,
  playerId: string | undefined,
  message: { type: string; payload?: Record<string, string> },
  broadcast: (gameId: string, msg: ServerToClientMessage) => void
): void {
  if (!game) return;

  switch (message.type) {
    case 'get_state': {
      ws.send(
        JSON.stringify({
          type: 'game_state',
          payload: { state: game.toState(playerId) }
        })
      );
      break;
    }
    case 'cast_vote': {
      if (!playerId || !message.payload?.targetId) break;
      try {
        game.castVote(playerId, message.payload.targetId);
        broadcast(game.id, {
          type: 'vote_cast',
          payload: { voterId: playerId, votes: game.getVotes() }
        });
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', payload: { message: (err as Error).message } }));
      }
      break;
    }
    case 'night_action': {
      if (!playerId || !message.payload?.targetId) break;
      try {
        game.submitNightAction(playerId, message.payload.targetId);
        ws.send(JSON.stringify({ type: 'game_state', payload: { state: game.toState(playerId) } }));
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', payload: { message: (err as Error).message } }));
      }
      break;
    }
    default:
      ws.send(JSON.stringify({ type: 'error', payload: { message: 'Unknown message type' } }));
  }
}

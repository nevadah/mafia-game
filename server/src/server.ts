import express, { Request, Response, NextFunction } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { GameManager } from './GameManager';
import {
  CreateGameRequest,
  JoinGameRequest,
  VoteRequest,
  NightActionRequest,
  ReadyRequest,
  LeaveRequest,
  ServerToClientMessage
} from './types';

/**
 * Mutable reference filled by createWebSocketServer so that REST handlers
 * can broadcast real-time events after the WS server is ready.
 */
export interface BroadcastRef {
  broadcast?: (gameId: string, msg: ServerToClientMessage) => void;
  /** Send a personalised message to each connected player in a game. */
  broadcastPerPlayer?: (gameId: string, makeMsg: (playerId: string) => ServerToClientMessage) => void;
}

class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function authTokenFromRequest(req: Request): string | undefined {
  const header = req.headers['x-player-token'];
  if (Array.isArray(header)) {
    return header[0];
  }
  if (typeof header === 'string' && header.trim() !== '') {
    return header.trim();
  }
  return undefined;
}

function resolveActorPlayerId(
  req: Request,
  gameManager: GameManager,
  gameId: string,
  fallbackPlayerId?: string
): string {
  const token = authTokenFromRequest(req);

  if (token) {
    const session = gameManager.getSession(token);
    if (!session) {
      throw new HttpError(401, 'Invalid player token');
    }
    if (session.gameId !== gameId) {
      throw new HttpError(403, 'Token does not match this game');
    }
    if (fallbackPlayerId && fallbackPlayerId !== session.playerId) {
      throw new HttpError(403, 'playerId does not match authenticated player');
    }
    return session.playerId;
  }

  if (!fallbackPlayerId) {
    throw new HttpError(400, 'playerId is required');
  }

  return fallbackPlayerId;
}

export function createApp(gameManager: GameManager, broadcastRef?: BroadcastRef) {
  const app = express();
  app.use(express.json());

  /** Safely call the broadcast function if it has been registered. */
  function broadcast(gameId: string, msg: ServerToClientMessage): void {
    broadcastRef?.broadcast?.(gameId, msg);
  }

  // ── POST /games ────────────────────────────────────────────────────────────
  app.post('/games', (req: Request, res: Response) => {
    const { hostName, settings } = req.body as CreateGameRequest;
    if (!hostName || typeof hostName !== 'string' || hostName.trim() === '') {
      return res.status(400).json({ error: 'hostName is required' });
    }
    try {
      const { game, hostPlayer, token } = gameManager.createGame(hostName.trim(), settings);
      return res.status(201).json({
        gameId: game.id,
        playerId: hostPlayer.id,
        token,
        state: game.toState(hostPlayer.id)
      });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  // ── GET /games ─────────────────────────────────────────────────────────────
  app.get('/games', (_req: Request, res: Response) => {
    const games = gameManager.getWaitingGames();
    return res.json(
      games.map(g => ({
        gameId: g.id,
        playerCount: g.getPlayerCount(),
        readyCount: g.getReadyCount(),
        settings: g.settings
      }))
    );
  });

  // ── GET /games/:gameId ─────────────────────────────────────────────────────
  app.get('/games/:gameId', (req: Request, res: Response) => {
    const game = gameManager.getGame(req.params.gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    try {
      let playerId = req.query.playerId as string | undefined;
      const token = authTokenFromRequest(req);
      if (token) {
        const session = gameManager.getSession(token);
        if (!session) {
          return res.status(401).json({ error: 'Invalid player token' });
        }
        if (session.gameId !== game.id) {
          return res.status(403).json({ error: 'Token does not match this game' });
        }
        playerId = session.playerId;
      }

      return res.json({ state: game.toState(playerId) });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 400;
      return res.status(status).json({ error: (err as Error).message });
    }
  });

  // ── POST /games/:gameId/join ───────────────────────────────────────────────
  app.post('/games/:gameId/join', (req: Request, res: Response) => {
    const { playerName } = req.body as JoinGameRequest;
    if (!playerName || typeof playerName !== 'string' || playerName.trim() === '') {
      return res.status(400).json({ error: 'playerName is required' });
    }
    try {
      const { game, player, token } = gameManager.joinGame(req.params.gameId, playerName.trim());
      broadcast(game.id, {
        type: 'player_joined',
        payload: { playerId: player.id, playerName: player.name, state: game.toState() }
      });
      return res.status(200).json({
        playerId: player.id,
        token,
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

  // ── POST /games/:gameId/ready ──────────────────────────────────────────────
  app.post('/games/:gameId/ready', (req: Request, res: Response) => {
    const game = gameManager.getGame(req.params.gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    try {
      const { playerId } = req.body as ReadyRequest;
      const actorId = resolveActorPlayerId(req, gameManager, game.id, playerId);
      game.markPlayerReady(actorId);
      const allReady = game.areAllPlayersReady();
      broadcast(game.id, {
        type: 'player_ready',
        payload: { playerId: actorId, readyCount: game.getReadyCount(), allReady, state: game.toState() }
      });
      return res.json({
        allReady,
        readyCount: game.getReadyCount(),
        state: game.toState(actorId)
      });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 400;
      return res.status(status).json({ error: (err as Error).message });
    }
  });

  // ── POST /games/:gameId/unready ────────────────────────────────────────────
  app.post('/games/:gameId/unready', (req: Request, res: Response) => {
    const game = gameManager.getGame(req.params.gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    try {
      const { playerId } = req.body as ReadyRequest;
      const actorId = resolveActorPlayerId(req, gameManager, game.id, playerId);
      game.markPlayerNotReady(actorId);
      broadcast(game.id, {
        type: 'player_ready',
        payload: { playerId: actorId, readyCount: game.getReadyCount(), allReady: false, state: game.toState() }
      });
      return res.json({
        allReady: false,
        readyCount: game.getReadyCount(),
        state: game.toState(actorId)
      });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 400;
      return res.status(status).json({ error: (err as Error).message });
    }
  });

  // ── POST /games/:gameId/start ──────────────────────────────────────────────
  app.post('/games/:gameId/start', (req: Request, res: Response) => {
    const game = gameManager.getGame(req.params.gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    try {
      const { playerId } = req.body as { playerId?: string };
      const actorId = resolveActorPlayerId(req, gameManager, game.id, playerId);
      if (actorId !== game.hostId) {
        return res.status(403).json({ error: 'Only the host can start the game' });
      }

      game.start();
      broadcastRef?.broadcastPerPlayer?.(game.id, (pid) => ({
        type: 'game_started',
        payload: { state: game.toState(pid) }
      }));
      return res.json({ state: game.toState(actorId) });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 400;
      return res.status(status).json({ error: (err as Error).message });
    }
  });

  // ── POST /games/:gameId/vote ───────────────────────────────────────────────
  app.post('/games/:gameId/vote', (req: Request, res: Response) => {
    const game = gameManager.getGame(req.params.gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    try {
      const { voterId, targetId } = req.body as VoteRequest;
      if (!targetId) {
        return res.status(400).json({ error: 'targetId is required' });
      }
      const actorId = resolveActorPlayerId(req, gameManager, game.id, voterId);
      game.castVote(actorId, targetId);
      broadcast(game.id, {
        type: 'vote_cast',
        payload: { voterId: actorId, targetId, votes: game.getVotes() }
      });
      return res.json({ state: game.toState(actorId) });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 400;
      return res.status(status).json({ error: (err as Error).message });
    }
  });

  // ── POST /games/:gameId/chat ──────────────────────────────────────────────
  app.post('/games/:gameId/chat', (req: Request, res: Response) => {
    const game = gameManager.getGame(req.params.gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    try {
      const { text, playerId } = req.body as { text?: string; playerId?: string };
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'text is required' });
      }
      const actorId = resolveActorPlayerId(req, gameManager, game.id, playerId);
      const message = game.addChatMessage(actorId, text);
      broadcast(game.id, {
        type: 'chat_message',
        payload: message
      });
      return res.json({ message, state: game.toState(actorId) });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 400;
      return res.status(status).json({ error: (err as Error).message });
    }
  });

  // ── POST /games/:gameId/resolve-votes ─────────────────────────────────────
  app.post('/games/:gameId/resolve-votes', (req: Request, res: Response) => {
    const game = gameManager.getGame(req.params.gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    try {
      const { playerId, force } = req.body as { playerId?: string; force?: boolean };
      const actorId = resolveActorPlayerId(req, gameManager, game.id, playerId);
      if (actorId !== game.hostId) {
        return res.status(403).json({ error: 'Only the host can resolve votes' });
      }

      if (!force && !game.hasAllRequiredVotes()) {
        return res.status(409).json({
          error: 'Not all alive players have voted',
          missingPlayerIds: game.getMissingVotePlayerIds(),
          state: game.toState(actorId)
        });
      }

      const eliminated = game.resolveVotes();
      const winner = game.checkWinCondition();

      if (!winner) {
        game.advancePhase();
      }

      if (eliminated) {
        broadcastRef?.broadcastPerPlayer?.(game.id, (pid) => ({
          type: 'player_eliminated',
          payload: { playerId: eliminated, phase: game.getPhase(), state: game.toState(pid) }
        }));
      }

      if (winner) {
        broadcastRef?.broadcastPerPlayer?.(game.id, (pid) => ({
          type: 'game_ended',
          payload: { winner, state: game.toState(pid) }
        }));
      } else {
        broadcastRef?.broadcastPerPlayer?.(game.id, (pid) => ({
          type: 'phase_changed',
          payload: { phase: game.getPhase(), round: game.getRound(), state: game.toState(pid) }
        }));
      }

      return res.json({ eliminated, winner, state: game.toState(actorId) });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 400;
      return res.status(status).json({ error: (err as Error).message });
    }
  });

  // ── POST /games/:gameId/night-action ──────────────────────────────────────
  app.post('/games/:gameId/night-action', (req: Request, res: Response) => {
    const game = gameManager.getGame(req.params.gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    try {
      const { playerId, targetId } = req.body as NightActionRequest;
      if (!targetId) {
        return res.status(400).json({ error: 'targetId is required' });
      }
      const actorId = resolveActorPlayerId(req, gameManager, game.id, playerId);
      game.submitNightAction(actorId, targetId);
      return res.json({ state: game.toState(actorId) });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 400;
      return res.status(status).json({ error: (err as Error).message });
    }
  });

  // ── POST /games/:gameId/resolve-night ─────────────────────────────────────
  app.post('/games/:gameId/resolve-night', (req: Request, res: Response) => {
    const game = gameManager.getGame(req.params.gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    try {
      const { playerId, force } = req.body as { playerId?: string; force?: boolean };
      const actorId = resolveActorPlayerId(req, gameManager, game.id, playerId);
      if (actorId !== game.hostId) {
        return res.status(403).json({ error: 'Only the host can resolve night actions' });
      }

      if (!force && !game.hasAllRequiredNightActions()) {
        return res.status(409).json({
          error: 'Not all required night actions have been submitted',
          missingPlayerIds: game.getMissingNightActionPlayerIds(),
          state: game.toState(actorId)
        });
      }

      const eliminated = game.resolveNightActions();
      const winner = game.checkWinCondition();

      if (!winner) {
        game.advancePhase();
      }

      if (eliminated) {
        broadcastRef?.broadcastPerPlayer?.(game.id, (pid) => ({
          type: 'player_eliminated',
          payload: { playerId: eliminated, phase: game.getPhase(), state: game.toState(pid) }
        }));
      }

      if (winner) {
        broadcastRef?.broadcastPerPlayer?.(game.id, (pid) => ({
          type: 'game_ended',
          payload: { winner, state: game.toState(pid) }
        }));
      } else {
        broadcastRef?.broadcastPerPlayer?.(game.id, (pid) => ({
          type: 'phase_changed',
          payload: { phase: game.getPhase(), round: game.getRound(), state: game.toState(pid) }
        }));
      }

      return res.json({ eliminated, winner, state: game.toState(actorId) });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 400;
      return res.status(status).json({ error: (err as Error).message });
    }
  });

  // ── POST /games/:gameId/leave ──────────────────────────────────────────────
  app.post('/games/:gameId/leave', (req: Request, res: Response) => {
    const game = gameManager.getGame(req.params.gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    try {
      const { playerId } = req.body as LeaveRequest;
      const actorId = resolveActorPlayerId(req, gameManager, game.id, playerId);
      const { deletedGame } = gameManager.leaveGame(game.id, actorId);

      if (!deletedGame) {
        broadcast(game.id, {
          type: 'player_left',
          payload: { playerId: actorId, state: game.toState() }
        });
      }

      return res.json({ deletedGame });
    } catch (err) {
      const message = (err as Error).message;
      if (message === 'Game not found') {
        return res.status(404).json({ error: message });
      }
      const status = err instanceof HttpError ? err.status : 400;
      return res.status(status).json({ error: message });
    }
  });

  // ── Error handler ──────────────────────────────────────────────────────────
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

export const RECONNECT_GRACE_MS = 30_000;

export function createWebSocketServer(
  server: import('http').Server,
  gameManager: GameManager,
  broadcastRef?: BroadcastRef,
  gracePeriodMs: number = RECONNECT_GRACE_MS
): WebSocketServer {
  const wss = new WebSocketServer({ server });

  const clients = new Map<WebSocket, { gameId?: string; playerId?: string }>();
  /** Pending disconnect timers keyed by "gameId:playerId". */
  const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function broadcast(gameId: string, message: ServerToClientMessage, exclude?: WebSocket): void {
    for (const [ws, info] of clients) {
      if (info.gameId === gameId && ws !== exclude && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    }
  }

  // Register broadcast functions so REST handlers can also send events
  if (broadcastRef) {
    broadcastRef.broadcast = (gameId, msg) => broadcast(gameId, msg);
    broadcastRef.broadcastPerPlayer = (gameId, makeMsg) => {
      for (const [ws, info] of clients) {
        if (info.gameId === gameId && info.playerId && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(makeMsg(info.playerId)));
        }
      }
    };
  }

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? '/', 'ws://localhost');
    let gameId = url.searchParams.get('gameId') ?? undefined;
    let playerId = url.searchParams.get('playerId') ?? undefined;
    const token = url.searchParams.get('token') ?? undefined;

    if (token) {
      const session = gameManager.getSession(token);
      if (!session) {
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid player token' } }));
        ws.close();
        return;
      }

      if (gameId && gameId !== session.gameId) {
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Token does not match this game' } }));
        ws.close();
        return;
      }

      if (playerId && playerId !== session.playerId) {
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'playerId does not match token' } }));
        ws.close();
        return;
      }

      gameId = session.gameId;
      playerId = session.playerId;
    }

    clients.set(ws, { gameId, playerId });

    if (gameId) {
      const game = gameManager.getGame(gameId);
      if (!game) {
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Game not found' } }));
        ws.close();
        return;
      }

      if (playerId) {
        const timerKey = `${gameId}:${playerId}`;
        const pending = disconnectTimers.get(timerKey);
        if (pending !== undefined) {
          clearTimeout(pending);
          disconnectTimers.delete(timerKey);
        }

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
        const { gameId, playerId } = info;
        const timerKey = `${gameId}:${playerId}`;

        // Don't remove immediately — give the client a window to reconnect.
        const timer = setTimeout(() => {
          disconnectTimers.delete(timerKey);
          const game = gameManager.getGame(gameId);
          if (game && game.getPlayer(playerId)) {
            try {
              const { deletedGame } = gameManager.leaveGame(gameId, playerId);
              if (!deletedGame) {
                broadcast(gameId, {
                  type: 'player_left',
                  payload: { playerId, state: game.toState() }
                });
              }
            } catch {
              // player or game already removed
            }
          }
        }, gracePeriodMs);

        timer.unref();
        disconnectTimers.set(timerKey, timer);
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
  broadcast: (gameId: string, msg: ServerToClientMessage, exclude?: WebSocket) => void
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
    case 'mark_ready': {
      if (!playerId) break;
      try {
        game.markPlayerReady(playerId);
        broadcast(game.id, {
          type: 'player_ready',
          payload: { playerId, readyCount: game.getReadyCount(), allReady: game.areAllPlayersReady(), state: game.toState() }
        });
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', payload: { message: (err as Error).message } }));
      }
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

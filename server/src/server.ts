import express, { Request, Response, NextFunction } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { GameManager } from './GameManager';
import { logger } from './logger';
import {
  CreateGameSchema,
  JoinGameSchema,
  SpectateSchema,
  ReadySchema,
  StartSchema,
  VoteSchema,
  ChatSchema,
  ResolveSchema,
  NightActionSchema,
  LeaveSchema,
} from './schemas';
import { ServerToClientMessage } from './types';

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

// ── Per-player chat rate limiter (sliding window) ─────────────────────────────

const CHAT_RATE_LIMIT = 10;          // max messages
const CHAT_RATE_WINDOW_MS = 10_000;  // per 10 seconds
const _chatTimestamps = new Map<string, number[]>();

function checkChatRateLimit(token: string): boolean {
  const now = Date.now();
  const recent = (_chatTimestamps.get(token) ?? []).filter(t => now - t < CHAT_RATE_WINDOW_MS);
  if (recent.length >= CHAT_RATE_LIMIT) return false;
  recent.push(now);
  _chatTimestamps.set(token, recent);
  return true;
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
    if (session.isSpectator) {
      throw new HttpError(403, 'Spectators cannot perform player actions');
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

function resolveSpectatorId(req: Request, gameManager: GameManager, gameId: string): string {
  const token = authTokenFromRequest(req);
  if (!token) {
    throw new HttpError(401, 'Authentication required');
  }
  const session = gameManager.getSession(token);
  if (!session) {
    throw new HttpError(401, 'Invalid player token');
  }
  if (session.gameId !== gameId) {
    throw new HttpError(403, 'Token does not match this game');
  }
  if (!session.isSpectator) {
    throw new HttpError(403, 'Token belongs to a player, not a spectator');
  }
  return session.playerId;
}

/**
 * Parse and validate a request body against a Zod schema.
 * Returns the typed data on success, or responds with 400 and returns null.
 */
function parseBody<T>(
  schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } },
  body: unknown,
  res: Response
): T | null {
  const result = schema.safeParse(body);
  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0].message });
    return null;
  }
  return result.data;
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
    const body = parseBody(CreateGameSchema, req.body, res);
    if (!body) return;
    try {
      const { game, hostPlayer, token } = gameManager.createGame(body.hostName, body.settings);
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
    const body = parseBody(JoinGameSchema, req.body, res);
    if (!body) return;
    try {
      const { game, player, token } = gameManager.joinGame(req.params.gameId, body.playerName);
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

  // ── POST /games/:gameId/spectate ──────────────────────────────────────────
  app.post('/games/:gameId/spectate', (req: Request, res: Response) => {
    const body = parseBody(SpectateSchema, req.body, res);
    if (!body) return;
    try {
      const { game, spectatorId, token } = gameManager.joinAsSpectator(req.params.gameId, body.spectatorName);
      broadcast(game.id, {
        type: 'spectator_joined',
        payload: { spectatorId, spectatorName: body.spectatorName, state: game.toState() }
      });
      return res.status(200).json({
        spectatorId,
        token,
        state: game.toState()
      });
    } catch (err) {
      const message = (err as Error).message;
      if (message === 'Game not found') {
        return res.status(404).json({ error: message });
      }
      return res.status(400).json({ error: message });
    }
  });

  // ── POST /games/:gameId/spectate-leave ────────────────────────────────────
  app.post('/games/:gameId/spectate-leave', (req: Request, res: Response) => {
    const game = gameManager.getGame(req.params.gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    try {
      const spectatorId = resolveSpectatorId(req, gameManager, game.id);
      gameManager.leaveSpectator(game.id, spectatorId);
      broadcast(game.id, {
        type: 'spectator_left',
        payload: { spectatorId, state: game.toState() }
      });
      return res.json({ ok: true });
    } catch (err) {
      const message = (err as Error).message;
      if (message === 'Game not found') {
        return res.status(404).json({ error: message });
      }
      const status = err instanceof HttpError ? err.status : 400;
      return res.status(status).json({ error: message });
    }
  });

  // ── POST /games/:gameId/ready ──────────────────────────────────────────────
  app.post('/games/:gameId/ready', (req: Request, res: Response) => {
    const game = gameManager.getGame(req.params.gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    try {
      const body = parseBody(ReadySchema, req.body, res);
      if (!body) return;
      const actorId = resolveActorPlayerId(req, gameManager, game.id, body.playerId);
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
      const body = parseBody(ReadySchema, req.body, res);
      if (!body) return;
      const actorId = resolveActorPlayerId(req, gameManager, game.id, body.playerId);
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
      const body = parseBody(StartSchema, req.body, res);
      if (!body) return;
      const actorId = resolveActorPlayerId(req, gameManager, game.id, body.playerId);
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
      const body = parseBody(VoteSchema, req.body, res);
      if (!body) return;
      const actorId = resolveActorPlayerId(req, gameManager, game.id, body.voterId);
      const { targetId } = body;
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
      const body = parseBody(ChatSchema, req.body, res);
      if (!body) return;
      const token = authTokenFromRequest(req);
      if (token && !checkChatRateLimit(token)) {
        return res.status(429).json({ error: 'Too many messages. Slow down.' });
      }
      const actorId = resolveActorPlayerId(req, gameManager, game.id, body.playerId);
      const message = game.addChatMessage(actorId, body.text);
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
      const body = parseBody(ResolveSchema, req.body, res);
      if (!body) return;
      const actorId = resolveActorPlayerId(req, gameManager, game.id, body.playerId);
      const { force } = body;
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
      const body = parseBody(NightActionSchema, req.body, res);
      if (!body) return;
      const actorId = resolveActorPlayerId(req, gameManager, game.id, body.playerId);
      game.submitNightAction(actorId, body.targetId);
      const totalCount = game.getNightActionActorIds().length;
      const submittedCount = totalCount - game.getMissingNightActionPlayerIds().length;
      broadcast(game.id, {
        type: 'night_action_submitted',
        payload: { submittedCount, totalCount }
      });
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
      const body = parseBody(ResolveSchema, req.body, res);
      if (!body) return;
      const actorId = resolveActorPlayerId(req, gameManager, game.id, body.playerId);
      const { force } = body;
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
      const body = parseBody(LeaveSchema, req.body, res);
      if (!body) return;
      const actorId = resolveActorPlayerId(req, gameManager, game.id, body.playerId);
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
    logger.error({ err }, 'unhandled server error');
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

  const clients = new Map<WebSocket, { gameId?: string; playerId?: string; isSpectator?: boolean }>();
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
        if (info.gameId !== gameId || ws.readyState !== WebSocket.OPEN) continue;
        if (info.playerId && !info.isSpectator) {
          ws.send(JSON.stringify(makeMsg(info.playerId)));
        } else if (info.isSpectator) {
          // Spectators get the public state (no player-specific visibility)
          ws.send(JSON.stringify(makeMsg('')));
        }
      }
    };
  }

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? '/', 'ws://localhost');
    let gameId = url.searchParams.get('gameId') ?? undefined;
    let playerId = url.searchParams.get('playerId') ?? undefined;
    const token = url.searchParams.get('token') ?? undefined;
    let isSpectator = false;

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
      isSpectator = session.isSpectator;
    }

    clients.set(ws, { gameId, playerId, isSpectator });

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
          logger.info({ gameId, playerId, isSpectator }, 'ws reconnected within grace period');
        } else {
          logger.info({ gameId, playerId, isSpectator }, 'ws connected');
        }

        if (isSpectator) {
          game.setSpectatorConnected(playerId, true);
        } else {
          const player = game.getPlayer(playerId);
          if (player) {
            player.setConnected(true);
          }
        }
      }

      ws.send(
        JSON.stringify({
          type: 'connected',
          payload: { state: game.toState(isSpectator ? undefined : playerId) }
        })
      );

      if (playerId && !isSpectator) {
        broadcast(gameId, {
          type: 'player_joined',
          payload: { playerId, state: game.toState() }
        }, ws);
      }
    } else {
      ws.send(JSON.stringify({ type: 'connected', payload: {} }));
    }

    ws.on('close', () => {
      const info = clients.get(ws);
      clients.delete(ws);

      if (info?.gameId && info?.playerId) {
        const { gameId, playerId, isSpectator } = info;
        const timerKey = `${gameId}:${playerId}`;

        // Don't remove immediately — give the client a window to reconnect.
        logger.debug({ gameId, playerId, isSpectator, gracePeriodMs }, 'ws disconnected — grace timer started');
        const timer = setTimeout(() => {
          disconnectTimers.delete(timerKey);
          const game = gameManager.getGame(gameId);
          if (!game) return;

          if (isSpectator) {
            if (game.getSpectator(playerId)) {
              try {
                gameManager.leaveSpectator(gameId, playerId);
                broadcast(gameId, {
                  type: 'spectator_left',
                  payload: { spectatorId: playerId, state: game.toState() }
                });
              } catch {
                // spectator or game already removed
              }
            }
          } else if (game.getPlayer(playerId)) {
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


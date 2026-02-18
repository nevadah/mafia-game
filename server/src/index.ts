import http from 'http';
import { GameManager } from './GameManager';
import { createApp, createWebSocketServer, BroadcastRef } from './server';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

const gameManager = new GameManager();

// Shared mutable ref: createWebSocketServer fills this so REST handlers
// can broadcast WebSocket events after the WS server is ready.
const broadcastRef: BroadcastRef = {};

const app = createApp(gameManager, broadcastRef);
const server = http.createServer(app);
createWebSocketServer(server, gameManager, broadcastRef);

const STALE_WAITING_GAME_MAX_IDLE_MS = 60 * 60 * 1000; // 1 hour
const cleanupInterval = setInterval(() => {
  gameManager.pruneStaleWaitingGames(STALE_WAITING_GAME_MAX_IDLE_MS);
}, 60 * 1000);

server.listen(PORT, () => {
  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : PORT;
  console.log(`Mafia server running on port ${actualPort}`);
});

server.on('close', () => {
  clearInterval(cleanupInterval);
});

export { server, gameManager };

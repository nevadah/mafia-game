import http from 'http';
import { GameManager } from './GameManager';
import { createApp, createWebSocketServer } from './server';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

const gameManager = new GameManager();
const app = createApp(gameManager);
const server = http.createServer(app);
createWebSocketServer(server, gameManager);

server.listen(PORT, () => {
  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : PORT;
  console.log(`Mafia server running on port ${actualPort}`);
});

export { server, gameManager };

/**
 * Party launcher — opens N Electron windows pre-wired for a local game session.
 *
 * The first window automatically creates a game; the rest automatically join
 * once the game ID is visible on the server.
 *
 * Usage (from repo root):
 *   npm run dev:party              # 2 windows (default)
 *   npm run dev:party -- 4         # N windows
 *   npm run dev:party -- 4 http://localhost:4000   # custom server URL
 */

import { spawn, ChildProcess } from 'child_process';
import http from 'http';
import path from 'path';

const args = process.argv.slice(2);
const N = Math.max(2, parseInt(args[0] ?? '2', 10) || 2);
const SERVER_URL = args[1] ?? 'http://localhost:3000';
const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 15_000;

const ELECTRON_BIN = path.resolve(__dirname, '../../node_modules/.bin/electron');
const CLIENT_DIR   = path.resolve(__dirname, '..');
const RENDERER_URL = 'http://localhost:5173';

const BASE_ENV = {
  ...process.env,
  MAFIA_MULTI_INSTANCE: '1',
  ELECTRON_RENDERER_URL: RENDERER_URL
};

const children: ChildProcess[] = [];

function spawnWindow(deepLink: string, label: string): void {
  const child = spawn(ELECTRON_BIN, ['.', deepLink], {
    cwd: CLIENT_DIR,
    env: BASE_ENV,
    stdio: 'ignore'
  });
  children.push(child);
  console.log(`[party] opened ${label} → ${deepLink}`);
}

function shutdown(): void {
  console.log('\n[party] shutting down...');
  for (const child of children) {
    child.kill();
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function fetchGames(serverUrl: string): Promise<Array<{ gameId: string }>> {
  return new Promise((resolve, reject) => {
    http.get(`${serverUrl}/games`, (res) => {
      let body = '';
      res.on('data', (chunk: string) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body) as Array<{ gameId: string }>); }
        catch { reject(new Error('Failed to parse /games response')); }
      });
    }).on('error', reject);
  });
}

async function pollForGame(serverUrl: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const games = await fetchGames(serverUrl);
      if (games.length > 0) return games[0].gameId;
    } catch {
      // server not ready yet — keep polling
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`No game appeared on ${serverUrl} within ${POLL_TIMEOUT_MS / 1000}s`);
}

async function main(): Promise<void> {
  console.log(`[party] launching ${N} windows against ${SERVER_URL}`);

  // Window 1: create the game
  const createLink = `mafia://create?name=Player1&serverUrl=${encodeURIComponent(SERVER_URL)}`;
  spawnWindow(createLink, 'Player1 (host)');

  // Wait for the game to appear
  console.log('[party] waiting for game to be created...');
  const gameId = await pollForGame(SERVER_URL);
  console.log(`[party] found game ${gameId}`);

  // Windows 2…N: join the game, staggered by 300 ms
  for (let i = 2; i <= N; i++) {
    await new Promise(r => setTimeout(r, 300));
    const joinLink = `mafia://join?gameId=${gameId}&name=${encodeURIComponent(`Player${i}`)}&serverUrl=${encodeURIComponent(SERVER_URL)}`;
    spawnWindow(joinLink, `Player${i}`);
  }

  console.log('[party] all windows launched — press Ctrl-C to close all clients');
}

main().catch((err: Error) => {
  console.error('[party] error:', err.message);
  process.exit(1);
});

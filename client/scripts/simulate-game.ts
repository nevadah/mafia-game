/**
 * Headless game simulation.
 *
 * Starts a real server in-process, creates N MafiaClient instances, plays
 * through a complete game, and asserts a clean winner.  Useful for verifying
 * the full client ↔ server contract without any UI.
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/simulate-game.ts [N]
 *   npm run simulate              # 4 players (default)
 *   npm run simulate -- 6         # 6 players
 */

import { execSync, spawn } from 'child_process';
import http from 'http';
import path from 'path';
import WebSocket from 'ws';
import { MafiaClient } from '../src/MafiaClient';
import type { GameState } from '../src/types';

// ── Server lifecycle ───────────────────────────────────────────────────────

async function startServer(): Promise<{ url: string; stop: () => void }> {
  const serverDir = path.resolve(__dirname, '../../server');
  console.log('[sim] Building server...');
  execSync('npm run build', { cwd: serverDir, stdio: 'pipe' });

  return new Promise((resolve, reject) => {
    const proc = spawn('node', [path.join(serverDir, 'dist/index.js')], {
      env: { ...process.env, PORT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let resolved = false;

    proc.stdout!.on('data', (chunk: Buffer) => {
      const match = /running on port (\d+)/.exec(chunk.toString());
      if (match && !resolved) {
        resolved = true;
        resolve({ url: `http://localhost:${match[1]}`, stop: () => proc.kill() });
      }
    });

    proc.stderr!.on('data', (chunk: Buffer) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`Server failed to start: ${chunk.toString()}`));
      }
    });

    proc.on('error', (err) => { if (!resolved) { resolved = true; reject(err); } });

    setTimeout(() => {
      if (!resolved) { resolved = true; proc.kill(); reject(new Error('Server start timed out')); }
    }, 10_000);
  });
}

// ── HTTP + WebSocket helpers ───────────────────────────────────────────────

function nodeFetch(url: string, init?: RequestInit) {
  return new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>((resolve, reject) => {
    const u = new URL(url);
    const body = init?.body as string | undefined;
    const req = http.request(
      {
        hostname: u.hostname,
        port: parseInt(u.port),
        path: u.pathname + u.search,
        method: (init?.method ?? 'GET').toUpperCase(),
        headers: { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string> ?? {}) },
      },
      (res) => {
        let data = '';
        res.on('data', (c: Buffer) => { data += c.toString(); });
        res.on('end', () => {
          const status = res.statusCode ?? 200;
          resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(JSON.parse(data)) });
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function makeClient(serverUrl: string): MafiaClient {
  return new MafiaClient(serverUrl, {
    fetch: nodeFetch,
    webSocketFactory: (url: string) => new WebSocket(url),
  });
}

// Resolves on the next state_update event for a client.
function nextStateUpdate(client: MafiaClient): Promise<GameState> {
  return new Promise(resolve => client.once('state_update', (s) => resolve(s as GameState)));
}

// ── Simulation logic ───────────────────────────────────────────────────────

const NAMES = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Hank'];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function log(msg: string) { console.log(`[sim] ${msg}`); }

async function simulate(serverUrl: string, numPlayers: number): Promise<void> {
  // ── Setup ────────────────────────────────────────────────────────────────

  log(`Creating ${numPlayers} clients...`);
  const clients = Array.from({ length: numPlayers }, () => makeClient(serverUrl));
  const [host, ...rest] = clients;

  await host.createGame(NAMES[0]);
  await host.connect();

  for (let i = 0; i < rest.length; i++) {
    await rest[i].joinGame(host.gameId!, NAMES[i + 1]);
    await rest[i].connect();
  }

  log('Marking all players ready...');
  await Promise.all(clients.map(c => c.markReady()));

  // ── Start game ───────────────────────────────────────────────────────────

  log('Starting game...');
  const pendingStart = rest.map(c => nextStateUpdate(c));
  await host.startGame();
  await Promise.all(pendingStart);

  log('Roles assigned:');
  clients.forEach((c, i) => log(`  ${NAMES[i]}: ${c.getMyRole()}`));

  // ── Game loop ────────────────────────────────────────────────────────────

  for (let iteration = 0; iteration < 30; iteration++) {
    const state = host.gameState!;

    if (state.status === 'ended') break;

    if (state.phase === 'night') {
      log(`--- Night ${state.round + 1} ---`);

      // Each role-player submits their night action
      await Promise.all(
        clients.map(async (client) => {
          const role = client.getMyRole();
          if (role !== 'mafia' && role !== 'doctor' && role !== 'sheriff') return;

          const myState = client.gameState!;
          const me = myState.players.find(p => p.id === client.playerId);
          if (!me?.isAlive) return;

          const candidates = myState.players.filter(p =>
            p.isAlive && (role === 'doctor' || p.id !== client.playerId)
          );
          if (candidates.length === 0) return;

          const target = pickRandom(candidates);
          log(`  ${me.name} (${role}) → ${target.name}`);
          await client.submitNightAction(target.id);
        })
      );

      log('  Resolving night...');
      const pendingNight = rest.map(c => nextStateUpdate(c));
      const { eliminated, winner } = await host.resolveNight(false);
      await Promise.all(pendingNight);

      const elimName = eliminated ? state.players.find(p => p.id === eliminated)?.name : null;
      log(elimName ? `  Eliminated: ${elimName}` : '  No elimination (save or tie)');
      if (winner) { log(`  Winner: ${winner}`); break; }

    } else if (state.phase === 'day') {
      log(`--- Day ${state.round} ---`);

      // Each alive player votes for a random non-self alive target
      for (const client of clients) {
        const myState = client.gameState!;
        const me = myState.players.find(p => p.id === client.playerId);
        if (!me?.isAlive) continue;

        const candidates = myState.players.filter(p => p.isAlive && p.id !== client.playerId);
        if (candidates.length === 0) continue;

        const target = pickRandom(candidates);
        log(`  ${me.name} votes for ${target.name}`);
        await client.castVote(target.id);
      }

      log('  Resolving day...');
      const pendingDay = rest.map(c => nextStateUpdate(c));
      const { eliminated, winner } = await host.resolveVotes(true);
      await Promise.all(pendingDay);

      const elimName = eliminated ? state.players.find(p => p.id === eliminated)?.name : null;
      log(elimName ? `  Eliminated: ${elimName}` : '  No elimination (tie vote)');
      if (winner) { log(`  Winner: ${winner}`); break; }
    }
  }

  // ── Assertions ───────────────────────────────────────────────────────────

  const final = host.gameState!;
  if (final.status !== 'ended') throw new Error(`Expected status 'ended', got '${final.status}'`);
  if (!final.winner) throw new Error('Game ended with no winner recorded');

  log(`\n✓ Simulation complete. Winner: ${final.winner}`);
  log('Final player statuses:');
  final.players.forEach(p =>
    log(`  ${p.name}: ${p.role ?? '?'} — ${p.isAlive ? 'survived' : 'eliminated'}`)
  );

  clients.forEach(c => c.disconnect());
}

// ── Entry point ───────────────────────────────────────────────────────────

async function main() {
  const numPlayers = parseInt(process.argv[2] ?? '4', 10);
  if (isNaN(numPlayers) || numPlayers < 4 || numPlayers > NAMES.length) {
    console.error(`Usage: simulate-game.ts [N]  (4 ≤ N ≤ ${NAMES.length})`);
    process.exit(1);
  }

  const { url, stop } = await startServer();
  log(`Server running at ${url}`);

  let exitCode = 0;
  try {
    await simulate(url, numPlayers);
  } catch (err) {
    console.error('[sim] FAILED:', (err as Error).message);
    exitCode = 1;
  } finally {
    log('Stopping server...');
    stop();
  }

  process.exit(exitCode);
}

main().catch(err => { console.error(err); process.exit(1); });

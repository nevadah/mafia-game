/**
 * Integration tests: requires the Mafia server to be running.
 * The server is started/stopped automatically via Jest globalSetup/globalTeardown.
 */
import fs from 'fs';
import http from 'http';
import { MafiaClient } from '../src/MafiaClient';
import WebSocket from 'ws';
import { PORT_FILE } from './globalSetup';

// Read port from file written by globalSetup (global vars aren't shared to workers)
const PORT: number = parseInt(fs.readFileSync(PORT_FILE, 'utf-8'), 10);

function serverUrl(): string {
  return `http://localhost:${PORT}`;
}

// Polyfill fetch for Node.js (uses http module directly since Node 18 has fetch)
async function nodeFetch(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const body = init?.body as string | undefined;
    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parseInt(parsedUrl.port),
      path: parsedUrl.pathname + parsedUrl.search,
      method: (init?.method ?? 'GET').toUpperCase(),
      headers: { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string> | undefined ?? {}) }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => {
        const status = res.statusCode ?? 200;
        resolve({
          ok: status >= 200 && status < 300,
          status,
          json: () => Promise.resolve(JSON.parse(data))
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function makeWsFactory(): (url: string) => WebSocket {
  return (url: string) => new WebSocket(url);
}

describe('Integration — MafiaClient ↔ server', () => {
  beforeAll(() => {
    jest.setTimeout(15000);
  });
  it('creates a game and receives initial state', async () => {
    const client = new MafiaClient(serverUrl(), {
      fetch: nodeFetch,
      webSocketFactory: makeWsFactory()
    });

    const state = await client.createGame('IntegrationAlice');

    expect(state).toBeDefined();
    expect(state.status).toBe('waiting');
    expect(state.players).toHaveLength(1);
    expect(state.players[0].name).toBe('IntegrationAlice');
    expect(client.gameId).toBeDefined();
    expect(client.playerId).toBeDefined();
  });

  it('registers (joins) an existing game', async () => {
    // Host creates the game
    const host = new MafiaClient(serverUrl(), { fetch: nodeFetch, webSocketFactory: makeWsFactory() });
    const hostState = await host.createGame('HostPlayer');

    // Second player joins
    const joiner = new MafiaClient(serverUrl(), { fetch: nodeFetch, webSocketFactory: makeWsFactory() });
    const joinState = await joiner.joinGame(hostState.id, 'JoinerPlayer');

    expect(joinState.players).toHaveLength(2);
    expect(joinState.players.map(p => p.name)).toContain('JoinerPlayer');
    expect(joiner.gameId).toBe(hostState.id);
    expect(joiner.playerId).toBeDefined();
  });

  it('retrieves game state via fetchGameState', async () => {
    const client = new MafiaClient(serverUrl(), { fetch: nodeFetch, webSocketFactory: makeWsFactory() });
    await client.createGame('StateFetcher');

    const state = await client.fetchGameState();
    expect(state.id).toBe(client.gameId);
    expect(state.players[0].name).toBe('StateFetcher');
  });

  it('lists waiting games', async () => {
    const host = new MafiaClient(serverUrl(), { fetch: nodeFetch, webSocketFactory: makeWsFactory() });
    const state = await host.createGame('ListTestHost');

    const listing = new MafiaClient(serverUrl(), { fetch: nodeFetch, webSocketFactory: makeWsFactory() });
    const games = await listing.listGames();

    expect(Array.isArray(games)).toBe(true);
    const found = games.find((g) => g.gameId === state.id);
    expect(found).toBeDefined();
  });

  it('connects via WebSocket and receives connected message with state', async function() {
    const client = new MafiaClient(serverUrl(), { fetch: nodeFetch, webSocketFactory: makeWsFactory() });
    await client.createGame('WSAlice');

    const updates: unknown[] = [];
    client.on('state_update', (s) => updates.push(s));

    await client.connect();

    expect(client.isConnected()).toBe(true);
    // The 'connected' message includes state, so state_update should have fired
    expect(updates.length).toBeGreaterThanOrEqual(1);

    client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  it('receives player_joined broadcast when second player connects', async () => {
    const host = new MafiaClient(serverUrl(), { fetch: nodeFetch, webSocketFactory: makeWsFactory() });
    await host.createGame('BroadcastHost');

    const joinEvents: unknown[] = [];
    host.on('player_joined', (p) => joinEvents.push(p));
    await host.connect();

    // Second player joins and connects
    const joiner = new MafiaClient(serverUrl(), { fetch: nodeFetch, webSocketFactory: makeWsFactory() });
    await joiner.joinGame(host.gameId!, 'BroadcastJoiner');
    await joiner.connect();

    // Give broadcast time to arrive
    await new Promise((r) => setTimeout(r, 100));

    expect(joinEvents.length).toBeGreaterThanOrEqual(1);

    host.disconnect();
    joiner.disconnect();
  });
});

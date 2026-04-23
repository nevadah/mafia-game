import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { MafiaClient } from './MafiaClient';

app.setName('Mafia');

let mainWindow: BrowserWindow | null = null;
let client: MafiaClient | null = null;
let pendingDeepLink: DeepLinkPayload | null = null;

export type DeepLinkPayload =
  | { action: 'join'; gameId: string; name?: string; serverUrl?: string }
  | { action: 'spectate'; gameId: string; name?: string; serverUrl?: string }
  | { action: 'create'; name?: string; serverUrl?: string };

function parseDeepLink(raw: string): DeepLinkPayload | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'mafia:') {
      return null;
    }

    const target = (url.hostname || url.pathname.replace(/^\/+/, '')).toLowerCase();
    const name = url.searchParams.get('name') ?? undefined;
    const serverUrl = url.searchParams.get('serverUrl') ?? undefined;

    if (target === 'join') {
      const gameId = url.searchParams.get('gameId') ?? undefined;
      if (!gameId) return null;
      return { action: 'join', gameId, name, serverUrl };
    }

    if (target === 'spectate') {
      const gameId = url.searchParams.get('gameId') ?? undefined;
      if (!gameId) return null;
      return { action: 'spectate', gameId, name, serverUrl };
    }

    if (target === 'create') {
      return { action: 'create', name, serverUrl };
    }

    return null;
  } catch {
    return null;
  }
}

function deepLinkFromArgv(argv: string[]): string | undefined {
  return argv.find((arg) => arg.startsWith('mafia://'));
}

function dispatchDeepLink(payload: DeepLinkPayload): void {
  // If the window is loaded and the renderer is ready, push immediately.
  // Otherwise buffer — the renderer will pull via mafia:get-startup-deep-link
  // once its useEffect has run and listeners are registered.
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send('mafia:deep_link', payload);
  } else {
    pendingDeepLink = payload;
  }
}

function createWindow(): void {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Mafia Game',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  }
  mainWindow.on('closed', () => { mainWindow = null; });
}

function attachClientEvents(c: MafiaClient): void {
  c.on('state_update', (s) => mainWindow?.webContents.send('mafia:state_update', s));
  c.on('player_joined', (p) => mainWindow?.webContents.send('mafia:player_joined', p));
  c.on('player_left', (p) => mainWindow?.webContents.send('mafia:player_left', p));
  c.on('player_ready', (p) => mainWindow?.webContents.send('mafia:player_ready', p));
  c.on('vote_cast', (p) => mainWindow?.webContents.send('mafia:vote_cast', p));
  c.on('player_eliminated', (p) => mainWindow?.webContents.send('mafia:player_eliminated', p));
  c.on('game_started', (p) => mainWindow?.webContents.send('mafia:game_started', p));
  c.on('game_ended', (p) => mainWindow?.webContents.send('mafia:game_ended', p));
  c.on('server_error', (p) => mainWindow?.webContents.send('mafia:server_error', p));
  c.on('chat_message', (p) => mainWindow?.webContents.send('mafia:chat_message', p));
  c.on('spectator_joined', (p) => mainWindow?.webContents.send('mafia:spectator_joined', p));
  c.on('spectator_left', (p) => mainWindow?.webContents.send('mafia:spectator_left', p));
  c.on('night_action_submitted', (p) => mainWindow?.webContents.send('mafia:night_action_submitted', p));
  c.on('game_closed', () => mainWindow?.webContents.send('mafia:game_closed'));
  c.on('reconnecting', (p) => mainWindow?.webContents.send('mafia:reconnecting', p));
  c.on('disconnected', () => mainWindow?.webContents.send('mafia:disconnected'));
}

const multiInstance = Boolean(process.env.MAFIA_MULTI_INSTANCE);
const hasSingleInstanceLock = multiInstance || app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const raw = deepLinkFromArgv(argv);
    if (raw) {
      const payload = parseDeepLink(raw);
      if (payload) {
        dispatchDeepLink(payload);
      }
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  const payload = parseDeepLink(url);
  if (payload) {
    dispatchDeepLink(payload);
  }
});

app.whenReady().then(() => {
  app.setAsDefaultProtocolClient('mafia');
  createWindow();

  const startupLink = deepLinkFromArgv(process.argv);
  if (startupLink) {
    const payload = parseDeepLink(startupLink);
    if (payload) {
      dispatchDeepLink(payload);
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  client?.disconnect();
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC handlers (renderer → main) ──────────────────────────────────────────

// Renderer pulls this once its useEffect has run, avoiding the push-before-listen race.
ipcMain.handle('mafia:get-startup-deep-link', () => {
  const link = pendingDeepLink;
  pendingDeepLink = null;
  return link;
});

ipcMain.handle('mafia:create-game', async (_event, serverUrl: string, playerName: string, settings?: object) => {
  client?.disconnect();
  client = new MafiaClient(serverUrl);
  attachClientEvents(client);

  const state = await client.createGame(playerName, settings);
  await client.connect();
  return { state, playerId: client.playerId, gameId: client.gameId };
});

ipcMain.handle('mafia:join-as-spectator', async (_event, serverUrl: string, gameId: string, spectatorName: string) => {
  client?.disconnect();
  client = new MafiaClient(serverUrl);
  attachClientEvents(client);

  const state = await client.joinAsSpectator(gameId, spectatorName);
  await client.connect();
  return { state, spectatorId: client.playerId, gameId: client.gameId };
});

ipcMain.handle('mafia:join-game', async (_event, serverUrl: string, gameId: string, playerName: string) => {
  client?.disconnect();
  client = new MafiaClient(serverUrl);
  attachClientEvents(client);

  const state = await client.joinGame(gameId, playerName);
  await client.connect();
  return { state, playerId: client.playerId, gameId: client.gameId };
});

ipcMain.handle('mafia:get-state', async () => {
  if (!client) throw new Error('Not connected to a game');
  return client.fetchGameState();
});

ipcMain.handle('mafia:list-games', async (_event, serverUrl: string) => {
  const c = new MafiaClient(serverUrl);
  return c.listGames();
});

ipcMain.handle('mafia:mark-ready', async () => {
  if (!client) throw new Error('Not connected to a game');
  return client.markReady();
});

ipcMain.handle('mafia:mark-unready', async () => {
  if (!client) throw new Error('Not connected to a game');
  return client.markUnready();
});

ipcMain.handle('mafia:start-game', async () => {
  if (!client) throw new Error('Not connected to a game');
  return client.startGame();
});

ipcMain.handle('mafia:cast-vote', async (_event, targetId: string) => {
  if (!client) throw new Error('Not connected to a game');
  return client.castVote(targetId);
});

ipcMain.handle('mafia:night-action', async (_event, targetId: string) => {
  if (!client) throw new Error('Not connected to a game');
  return client.submitNightAction(targetId);
});

ipcMain.handle('mafia:resolve-votes', async (_event, force?: boolean) => {
  if (!client) throw new Error('Not connected to a game');
  return client.resolveVotes(Boolean(force));
});

ipcMain.handle('mafia:resolve-night', async (_event, force?: boolean) => {
  if (!client) throw new Error('Not connected to a game');
  return client.resolveNight(Boolean(force));
});

ipcMain.handle('mafia:send-chat', async (_event, text: string) => {
  if (!client) throw new Error('Not connected to a game');
  return client.sendChat(text);
});

ipcMain.handle('mafia:leave-game', async () => {
  if (!client) throw new Error('Not connected to a game');
  const result = await client.leaveGame();
  client = null;
  return result;
});

ipcMain.handle('mafia:leave-spectator', async () => {
  if (!client) throw new Error('Not connected to a game');
  await client.leaveAsSpectator();
  client = null;
});

ipcMain.handle('mafia:disconnect', () => {
  client?.disconnect();
});

ipcMain.handle('mafia:connect', async () => {
  if (client) await client.connect();
});

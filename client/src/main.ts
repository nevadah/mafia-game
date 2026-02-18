import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { MafiaClient } from './MafiaClient';

let mainWindow: BrowserWindow | null = null;
let client: MafiaClient | null = null;

function createWindow(): void {
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

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
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
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  client?.disconnect();
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC handlers (renderer → main) ──────────────────────────────────────────

ipcMain.handle('mafia:create-game', async (_event, serverUrl: string, playerName: string) => {
  client?.disconnect();
  client = new MafiaClient(serverUrl);
  attachClientEvents(client);

  const state = await client.createGame(playerName);
  await client.connect();
  return { state, playerId: client.playerId, gameId: client.gameId };
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

ipcMain.handle('mafia:leave-game', async () => {
  if (!client) throw new Error('Not connected to a game');
  const result = await client.leaveGame();
  client = null;
  return result;
});

ipcMain.handle('mafia:disconnect', () => {
  client?.disconnect();
  client = null;
});

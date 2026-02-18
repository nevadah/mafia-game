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
  client = new MafiaClient(serverUrl);
  const state = await client.createGame(playerName);

  // Forward real-time events to renderer
  client.on('state_update', (s) => mainWindow?.webContents.send('mafia:state_update', s));
  client.on('player_joined', (p) => mainWindow?.webContents.send('mafia:player_joined', p));
  client.on('player_left', (p) => mainWindow?.webContents.send('mafia:player_left', p));
  client.on('game_ended', (p) => mainWindow?.webContents.send('mafia:game_ended', p));

  await client.connect();
  return { state, playerId: client.playerId, gameId: client.gameId };
});

ipcMain.handle('mafia:join-game', async (_event, serverUrl: string, gameId: string, playerName: string) => {
  client = new MafiaClient(serverUrl);
  const state = await client.joinGame(gameId, playerName);

  client.on('state_update', (s) => mainWindow?.webContents.send('mafia:state_update', s));
  client.on('player_joined', (p) => mainWindow?.webContents.send('mafia:player_joined', p));
  client.on('player_left', (p) => mainWindow?.webContents.send('mafia:player_left', p));
  client.on('game_ended', (p) => mainWindow?.webContents.send('mafia:game_ended', p));

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

ipcMain.handle('mafia:disconnect', () => {
  client?.disconnect();
  client = null;
});

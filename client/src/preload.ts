import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('mafia', {
  createGame: (serverUrl: string, playerName: string) =>
    ipcRenderer.invoke('mafia:create-game', serverUrl, playerName),
  joinGame: (serverUrl: string, gameId: string, playerName: string) =>
    ipcRenderer.invoke('mafia:join-game', serverUrl, gameId, playerName),
  getState: () => ipcRenderer.invoke('mafia:get-state'),
  listGames: (serverUrl: string) => ipcRenderer.invoke('mafia:list-games', serverUrl),
  disconnect: () => ipcRenderer.invoke('mafia:disconnect'),
  onStateUpdate: (cb: (state: unknown) => void) =>
    ipcRenderer.on('mafia:state_update', (_e, s) => cb(s)),
  onPlayerJoined: (cb: (payload: unknown) => void) =>
    ipcRenderer.on('mafia:player_joined', (_e, p) => cb(p)),
  onPlayerLeft: (cb: (payload: unknown) => void) =>
    ipcRenderer.on('mafia:player_left', (_e, p) => cb(p)),
  onGameEnded: (cb: (payload: unknown) => void) =>
    ipcRenderer.on('mafia:game_ended', (_e, p) => cb(p))
});

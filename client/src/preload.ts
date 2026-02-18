import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('mafia', {
  createGame: (serverUrl: string, playerName: string) =>
    ipcRenderer.invoke('mafia:create-game', serverUrl, playerName),
  joinGame: (serverUrl: string, gameId: string, playerName: string) =>
    ipcRenderer.invoke('mafia:join-game', serverUrl, gameId, playerName),
  getState: () => ipcRenderer.invoke('mafia:get-state'),
  listGames: (serverUrl: string) => ipcRenderer.invoke('mafia:list-games', serverUrl),
  markReady: () => ipcRenderer.invoke('mafia:mark-ready'),
  markUnready: () => ipcRenderer.invoke('mafia:mark-unready'),
  startGame: () => ipcRenderer.invoke('mafia:start-game'),
  castVote: (targetId: string) => ipcRenderer.invoke('mafia:cast-vote', targetId),
  nightAction: (targetId: string) => ipcRenderer.invoke('mafia:night-action', targetId),
  resolveVotes: (force = false) => ipcRenderer.invoke('mafia:resolve-votes', force),
  resolveNight: (force = false) => ipcRenderer.invoke('mafia:resolve-night', force),
  leaveGame: () => ipcRenderer.invoke('mafia:leave-game'),
  disconnect: () => ipcRenderer.invoke('mafia:disconnect'),
  onStateUpdate: (cb: (state: unknown) => void) =>
    ipcRenderer.on('mafia:state_update', (_e, s) => cb(s)),
  onPlayerJoined: (cb: (payload: unknown) => void) =>
    ipcRenderer.on('mafia:player_joined', (_e, p) => cb(p)),
  onPlayerLeft: (cb: (payload: unknown) => void) =>
    ipcRenderer.on('mafia:player_left', (_e, p) => cb(p)),
  onPlayerReady: (cb: (payload: unknown) => void) =>
    ipcRenderer.on('mafia:player_ready', (_e, p) => cb(p)),
  onVoteCast: (cb: (payload: unknown) => void) =>
    ipcRenderer.on('mafia:vote_cast', (_e, p) => cb(p)),
  onPlayerEliminated: (cb: (payload: unknown) => void) =>
    ipcRenderer.on('mafia:player_eliminated', (_e, p) => cb(p)),
  onGameStarted: (cb: (payload: unknown) => void) =>
    ipcRenderer.on('mafia:game_started', (_e, p) => cb(p)),
  onGameEnded: (cb: (payload: unknown) => void) =>
    ipcRenderer.on('mafia:game_ended', (_e, p) => cb(p)),
  onServerError: (cb: (payload: unknown) => void) =>
    ipcRenderer.on('mafia:server_error', (_e, p) => cb(p))
});

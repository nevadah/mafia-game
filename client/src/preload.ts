import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('mafia', {
  createGame: (serverUrl: string, playerName: string, settings?: object) =>
    ipcRenderer.invoke('mafia:create-game', serverUrl, playerName, settings),
  joinGame: (serverUrl: string, gameId: string, playerName: string) =>
    ipcRenderer.invoke('mafia:join-game', serverUrl, gameId, playerName),
  joinAsSpectator: (serverUrl: string, gameId: string, spectatorName: string) =>
    ipcRenderer.invoke('mafia:join-as-spectator', serverUrl, gameId, spectatorName),
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
    ipcRenderer.on('mafia:server_error', (_e, p) => cb(p)),
  sendChat: (text: string) => ipcRenderer.invoke('mafia:send-chat', text),
  onChatMessage: (cb: (payload: unknown) => void) =>
    ipcRenderer.on('mafia:chat_message', (_e, p) => cb(p)),
  onDeepLink: (cb: (payload: { gameId?: string; serverUrl?: string }) => void) =>
    ipcRenderer.on('mafia:deep_link', (_e, p) => cb(p)),
  getStartupDeepLink: () => ipcRenderer.invoke('mafia:get-startup-deep-link'),
  onSpectatorJoined: (cb: (payload: unknown) => void) =>
    ipcRenderer.on('mafia:spectator_joined', (_e, p) => cb(p)),
  onSpectatorLeft: (cb: (payload: unknown) => void) =>
    ipcRenderer.on('mafia:spectator_left', (_e, p) => cb(p))
});

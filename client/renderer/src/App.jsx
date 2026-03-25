import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './i18n';

import AppHeader       from './components/AppHeader';
import EntryScreen     from './components/EntryScreen';
import LobbyPhase      from './components/LobbyPhase';
import DayPhase        from './components/DayPhase';
import NightPhase      from './components/NightPhase';
import GameOver        from './components/GameOver';
import StatusBar       from './components/StatusBar';

// ── Clipboard helpers ──────────────────────────────────────────────────────────

function fallbackCopy(text) {
  const temp = document.createElement('textarea');
  temp.value = text;
  temp.setAttribute('readonly', '');
  temp.style.position = 'absolute';
  temp.style.left = '-9999px';
  document.body.appendChild(temp);
  temp.select();
  document.execCommand('copy');
  document.body.removeChild(temp);
}

async function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  fallbackCopy(text);
}

function summarizeResult(result) {
  if (!result || typeof result !== 'object' || result.state) {
    return '';
  }
  return Object.entries(result).map(([k, v]) => `${k}=${v}`).join(', ');
}

// ── App ────────────────────────────────────────────────────────────────────────

export default function App() {
  const { t } = useTranslation();

  // ── Theme ────────────────────────────────────────────────────────────────────

  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem('mafia-theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('mafia-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }, []);

  // ── Entry form state ──────────────────────────────────────────────────────────

  const [joinMode, setJoinMode] = useState(false);
  const [serverUrl, setServerUrl] = useState('http://localhost:3000');
  const [playerName, setPlayerName] = useState('');
  const [gameIdInput, setGameIdInput] = useState('');
  const [gameSettings, setGameSettings] = useState({
    minPlayers: 4,
    maxPlayers: 12,
    mafiaRatio: 0.25,
    hasDoctor: true,
    hasSheriff: true
  });

  function handleSettingChange(key, value) {
    setGameSettings((prev) => ({ ...prev, [key]: value }));
  }

  // ── Game state ────────────────────────────────────────────────────────────────

  const [status, setStatus] = useState({ message: '', error: false });
  const [currentState, setCurrentState] = useState(null);
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [currentGameId, setCurrentGameId] = useState(null);
  const [isSpectator, setIsSpectator] = useState(false);
  const [dismissedNightSummaryRound, setDismissedNightSummaryRound] = useState(null);

  const currentStateRef = useRef(currentState);
  const currentGameIdRef = useRef(currentGameId);
  const pendingAutoAction = useRef(null); // { action: 'create'|'join', name, gameId }

  useEffect(() => { currentStateRef.current = currentState; }, [currentState]);
  useEffect(() => { currentGameIdRef.current = currentGameId; }, [currentGameId]);

  // Fires after state has flushed when a deep-link with auto-submit was received.
  useEffect(() => {
    const pending = pendingAutoAction.current;
    if (!pending) return;
    if (pending.action === 'create' && playerName === pending.name) {
      pendingAutoAction.current = null;
      handleCreate();
    } else if (pending.action === 'join' && playerName === pending.name && gameIdInput === pending.gameId) {
      pendingAutoAction.current = null;
      handleJoin();
    } else if (pending.action === 'spectate' && playerName === pending.name && gameIdInput === pending.gameId) {
      pendingAutoAction.current = null;
      handleSpectate();
    }
  }, [playerName, gameIdInput]);

  const me = useMemo(() => {
    if (!currentState || !currentPlayerId) return null;
    return currentState.players.find((p) => p.id === currentPlayerId) || null;
  }, [currentState, currentPlayerId]);

  const isHost = Boolean(currentState && currentPlayerId && currentState.hostId === currentPlayerId);

  const inLobby = Boolean(currentState && currentState.phase === 'lobby' && currentState.status === 'waiting');
  const inDay   = Boolean(currentState && currentState.phase === 'day'   && currentState.status === 'active');
  const inNight = Boolean(currentState && currentState.phase === 'night' && currentState.status === 'active');
  const isEnded = Boolean(currentState && currentState.status === 'ended');

  const canStart = isHost
    && currentState?.players.length >= currentState?.settings?.minPlayers
    && currentState?.readyCount === currentState?.players.length;

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function showStatus(message, error = false) {
    setStatus({ message, error });
  }

  function applyState(state) {
    if (!state) return;
    setCurrentState(state);
    setCurrentGameId(state.id);
  }

  function resetGameUi() {
    setCurrentState(null);
    setCurrentPlayerId(null);
    setCurrentGameId(null);
    setIsSpectator(false);
    setDismissedNightSummaryRound(null);
    setStatus({ message: '', error: false });
  }

  function onConnected(result) {
    setCurrentPlayerId(result.playerId);
    setCurrentGameId(result.gameId);
    applyState(result.state);
  }

  function onSpectating(result) {
    setCurrentPlayerId(result.spectatorId);
    setCurrentGameId(result.gameId);
    setIsSpectator(true);
    applyState(result.state);
  }

  async function runAction(label, action) {
    try {
      showStatus(`${label}...`);
      const result = await action();
      if (result && result.state) applyState(result.state);
      const summary = summarizeResult(result);
      if (summary) showStatus(`${label} complete (${summary})`);
      else showStatus('');
    } catch (err) {
      showStatus(`Error: ${err.message}`, true);
    }
  }

  function buildJoinDeepLink() {
    const gameId = currentGameId || (currentState && currentState.id);
    if (!gameId) return null;
    const params = new URLSearchParams({ gameId, serverUrl: serverUrl || 'http://localhost:3000' });
    return `mafia://join?${params.toString()}`;
  }

  function buildSpectateDeepLink() {
    const gameId = currentGameId || (currentState && currentState.id);
    if (!gameId) return null;
    const params = new URLSearchParams({ gameId, serverUrl: serverUrl || 'http://localhost:3000' });
    return `mafia://spectate?${params.toString()}`;
  }

  // ── Entry handlers ────────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!playerName.trim()) { showStatus(t('statusEnterName'), true); return; }
    try {
      showStatus(t('statusCreatingGame'));
      const result = await window.mafia.createGame(serverUrl.trim(), playerName.trim(), gameSettings);
      onConnected(result);
    } catch (err) {
      showStatus(`Error: ${err.message}`, true);
    }
  }

  async function handleJoin() {
    if (!playerName.trim()) { showStatus(t('statusEnterName'), true); return; }
    if (!gameIdInput.trim()) { showStatus(t('statusEnterCode'), true); return; }
    try {
      showStatus(t('statusJoiningGame'));
      const result = await window.mafia.joinGame(serverUrl.trim(), gameIdInput.trim(), playerName.trim());
      onConnected(result);
    } catch (err) {
      showStatus(`Error: ${err.message}`, true);
    }
  }

  async function handleSpectate() {
    if (!playerName.trim()) { showStatus(t('statusEnterName'), true); return; }
    if (!gameIdInput.trim()) { showStatus(t('statusEnterCode'), true); return; }
    try {
      showStatus(t('statusSpectatingGame'));
      const result = await window.mafia.joinAsSpectator(serverUrl.trim(), gameIdInput.trim(), playerName.trim());
      onSpectating(result);
    } catch (err) {
      showStatus(`Error: ${err.message}`, true);
    }
  }

  async function handleLeave() {
    try {
      const result = await window.mafia.leaveGame();
      resetGameUi();
      showStatus(result.deletedGame ? t('statusGameClosed') : t('statusLeftGame'));
    } catch (err) {
      showStatus(`Error: ${err.message}`, true);
    }
  }

  async function handleBrowse() {
    try {
      const games = await window.mafia.listGames(serverUrl.trim());
      if (!games.length) { showStatus(t('statusNoGames')); return; }
      const summary = games.map((g) => `${g.gameId} (${g.readyCount}/${g.playerCount})`).join(' · ');
      showStatus(t('statusWaitingGames', { summary }));
    } catch (err) {
      showStatus(`Error: ${err.message}`, true);
    }
  }

  // ── Lobby copy handlers ───────────────────────────────────────────────────────

  async function handleCopyCode() {
    try {
      await copyText(currentState.id);
      showStatus(t('statusCodeCopied'));
    } catch {
      showStatus(t('statusCopyFailed', { code: currentState.id }), true);
    }
  }

  async function handleCopySpectateLink() {
    const link = buildSpectateDeepLink();
    if (!link) { showStatus(t('statusNoSpectateLink'), true); return; }
    try {
      await copyText(link);
      showStatus(t('statusSpectateCopied'));
    } catch {
      showStatus(t('statusInviteFailed', { link }), true);
    }
  }

  async function handleCopyInviteLink() {
    const link = buildJoinDeepLink();
    if (!link) { showStatus(t('statusNoJoinLink'), true); return; }
    try {
      await copyText(link);
      showStatus(t('statusInviteCopied'));
    } catch {
      showStatus(t('statusInviteFailed', { link }), true);
    }
  }

  // ── WebSocket event subscriptions ─────────────────────────────────────────────

  useEffect(() => {
    window.mafia.onStateUpdate((state) => applyState(state));
    window.mafia.onPlayerJoined(() => showStatus(t('statusPlayerJoined')));
    window.mafia.onPlayerLeft(() => showStatus(t('statusPlayerLeft')));
    window.mafia.onPlayerReady((payload) => {
      if (payload && payload.state) applyState(payload.state);
      showStatus(t('statusReadyUpdated'));
    });
    window.mafia.onVoteCast(() => showStatus(t('statusVoteCast')));
    window.mafia.onPlayerEliminated((payload) =>
      showStatus(t('statusPlayerEliminated', { name: payload?.playerId || 'A player' }))
    );
    window.mafia.onGameStarted(() => showStatus(t('statusGameStarted')));
    window.mafia.onGameEnded((payload) =>
      showStatus(t('statusGameEnded', { winner: payload?.winner || 'unknown' }))
    );
    window.mafia.onServerError((payload) =>
      showStatus(t('statusServerError', { message: payload?.message || 'unknown' }), true)
    );
    function handleDeepLink(payload) {
      if (!payload) return;
      if (currentStateRef.current) {
        showStatus(t('statusJoinLinkBlocked'), true);
        return;
      }
      if (payload.serverUrl) setServerUrl(payload.serverUrl);

      if (payload.action === 'create') {
        if (payload.name) {
          setPlayerName(payload.name);
          pendingAutoAction.current = { action: 'create', name: payload.name };
        }
      } else if (payload.action === 'spectate' && payload.gameId) {
        setGameIdInput(payload.gameId);
        setJoinMode(true);
        if (payload.name) {
          setPlayerName(payload.name);
          pendingAutoAction.current = { action: 'spectate', name: payload.name, gameId: payload.gameId };
        } else {
          showStatus(t('statusSpectateLinkLoaded', { gameId: payload.gameId }));
        }
      } else if (payload.gameId) {
        setGameIdInput(payload.gameId);
        setJoinMode(true);
        if (payload.name) {
          setPlayerName(payload.name);
          pendingAutoAction.current = { action: 'join', name: payload.name, gameId: payload.gameId };
        } else {
          showStatus(t('statusJoinLinkLoaded', { gameId: payload.gameId }));
        }
      }
    }

    window.mafia.onDeepLink(handleDeepLink);

    // Pull any deep link that arrived before the renderer was ready to listen.
    window.mafia.getStartupDeepLink().then(handleDeepLink);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="app">
      <AppHeader theme={theme} onToggleTheme={toggleTheme} isSpectator={isSpectator} />

      {!currentState && (
        <EntryScreen
          joinMode={joinMode} setJoinMode={setJoinMode}
          playerName={playerName} setPlayerName={setPlayerName}
          gameIdInput={gameIdInput} setGameIdInput={setGameIdInput}
          serverUrl={serverUrl} setServerUrl={setServerUrl}
          settings={gameSettings} onSettingChange={handleSettingChange}
          onCreate={handleCreate} onJoin={handleJoin} onSpectate={handleSpectate} onBrowse={handleBrowse}
        />
      )}

      {inLobby && (
        <LobbyPhase
          currentState={currentState}
          currentPlayerId={currentPlayerId}
          me={me}
          isHost={isHost}
          canStart={canStart}
          isSpectator={isSpectator}
          runAction={runAction}
          onLeave={handleLeave}
          onCopyCode={handleCopyCode}
          onCopyInviteLink={handleCopyInviteLink}
          onCopySpectateLink={handleCopySpectateLink}
        />
      )}

      {inDay && (
        <DayPhase
          currentState={currentState}
          currentPlayerId={currentPlayerId}
          me={me}
          isHost={isHost}
          isSpectator={isSpectator}
          dismissedNightSummaryRound={dismissedNightSummaryRound}
          onDismissNightSummary={setDismissedNightSummaryRound}
          runAction={runAction}
          onLeave={handleLeave}
        />
      )}

      {inNight && (
        <NightPhase
          currentState={currentState}
          currentPlayerId={currentPlayerId}
          me={me}
          isHost={isHost}
          isSpectator={isSpectator}
          runAction={runAction}
          onLeave={handleLeave}
        />
      )}

      {isEnded && (
        <GameOver
          currentState={currentState}
          currentPlayerId={currentPlayerId}
          onBackToMenu={resetGameUi}
        />
      )}

      <StatusBar message={status.message} error={status.error} />
    </div>
  );
}

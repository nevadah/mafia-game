import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

export default function App() {
  // ── Theme ──────────────────────────────────────────────────────────────────

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

  // ── Entry form state ───────────────────────────────────────────────────────

  const [joinMode, setJoinMode] = useState(false);
  const [serverUrl, setServerUrl] = useState('http://localhost:3000');
  const [playerName, setPlayerName] = useState('');
  const [gameIdInput, setGameIdInput] = useState('');

  // ── Game state ─────────────────────────────────────────────────────────────

  const [status, setStatus] = useState({ message: '', error: false });
  const [currentState, setCurrentState] = useState(null);
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [currentGameId, setCurrentGameId] = useState(null);
  const [forceResolve, setForceResolve] = useState(false);
  const [targetId, setTargetId] = useState('');

  const currentStateRef = useRef(currentState);
  const currentGameIdRef = useRef(currentGameId);

  useEffect(() => { currentStateRef.current = currentState; }, [currentState]);
  useEffect(() => { currentGameIdRef.current = currentGameId; }, [currentGameId]);

  const me = useMemo(() => {
    if (!currentState || !currentPlayerId) return null;
    return currentState.players.find((p) => p.id === currentPlayerId) || null;
  }, [currentState, currentPlayerId]);

  const isHost = Boolean(currentState && currentPlayerId && currentState.hostId === currentPlayerId);

  const targetCandidates = useMemo(() => {
    if (!currentState || !me || !me.isAlive) return [];
    if (currentState.phase === 'day') {
      return currentState.players.filter((p) => p.isAlive && p.id !== me.id);
    }
    if (currentState.phase === 'night') {
      if (me.role !== 'mafia' && me.role !== 'doctor' && me.role !== 'sheriff') return [];
      return currentState.players.filter((p) => p.isAlive);
    }
    return [];
  }, [currentState, me]);

  useEffect(() => {
    if (!targetCandidates.length) { setTargetId(''); return; }
    if (!targetCandidates.some((p) => p.id === targetId)) {
      setTargetId(targetCandidates[0].id);
    }
  }, [targetCandidates, targetId]);

  const inLobby  = Boolean(currentState && currentState.phase === 'lobby' && currentState.status === 'waiting');
  const inDay    = Boolean(currentState && currentState.phase === 'day'   && currentState.status === 'active');
  const inNight  = Boolean(currentState && currentState.phase === 'night' && currentState.status === 'active');

  // ── Helpers ────────────────────────────────────────────────────────────────

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
    setTargetId('');
    setStatus({ message: '', error: false });
  }

  function onConnected(result) {
    setCurrentPlayerId(result.playerId);
    setCurrentGameId(result.gameId);
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

  async function handleCreate() {
    if (!playerName.trim()) { showStatus('Enter a player name', true); return; }
    try {
      showStatus('Creating game...');
      const result = await window.mafia.createGame(serverUrl.trim(), playerName.trim());
      onConnected(result);
    } catch (err) {
      showStatus(`Error: ${err.message}`, true);
    }
  }

  async function handleJoin() {
    if (!playerName.trim()) { showStatus('Enter a player name', true); return; }
    if (!gameIdInput.trim()) { showStatus('Enter a game code', true); return; }
    try {
      showStatus('Joining game...');
      const result = await window.mafia.joinGame(serverUrl.trim(), gameIdInput.trim(), playerName.trim());
      onConnected(result);
    } catch (err) {
      showStatus(`Error: ${err.message}`, true);
    }
  }

  async function handleLeave() {
    try {
      const result = await window.mafia.leaveGame();
      resetGameUi();
      showStatus(result.deletedGame ? 'Game closed.' : 'You left the game.');
    } catch (err) {
      showStatus(`Error: ${err.message}`, true);
    }
  }

  async function handleBrowse() {
    try {
      const games = await window.mafia.listGames(serverUrl.trim());
      if (!games.length) { showStatus('No waiting games found.'); return; }
      const summary = games.map((g) => `${g.gameId} (${g.readyCount}/${g.playerCount})`).join(' · ');
      showStatus(`Waiting games: ${summary}`);
    } catch (err) {
      showStatus(`Error: ${err.message}`, true);
    }
  }

  // ── WebSocket event subscriptions ──────────────────────────────────────────

  useEffect(() => {
    window.mafia.onStateUpdate((state) => applyState(state));
    window.mafia.onPlayerJoined(() => showStatus('A player joined.'));
    window.mafia.onPlayerLeft(() => showStatus('A player left.'));
    window.mafia.onPlayerReady((payload) => {
      if (payload && payload.state) applyState(payload.state);
      showStatus('Ready status updated.');
    });
    window.mafia.onVoteCast(() => showStatus('Vote cast.'));
    window.mafia.onPlayerEliminated((payload) => showStatus(`${payload?.playerId || 'A player'} was eliminated.`));
    window.mafia.onGameStarted(() => showStatus('Game started.'));
    window.mafia.onGameEnded((payload) => showStatus(`Game over — ${payload?.winner || 'unknown'} wins!`));
    window.mafia.onServerError((payload) => showStatus(`Server error: ${payload?.message || 'unknown'}`, true));
    window.mafia.onDeepLink((payload) => {
      if (currentStateRef.current) {
        showStatus('Join link received — leave your current game first.', true);
        return;
      }
      if (payload?.serverUrl) setServerUrl(payload.serverUrl);
      if (payload?.gameId) {
        setGameIdInput(payload.gameId);
        setJoinMode(true);
        showStatus(`Join link loaded for game ${payload.gameId}.`);
      }
    });
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  const canStart = isHost
    && currentState?.players.length >= currentState?.settings?.minPlayers
    && currentState?.readyCount === currentState?.players.length;

  return (
    <div className="app">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="app-header">
        <h1>Mafia</h1>
        <button className="theme-toggle" onClick={toggleTheme}>
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </div>

      {/* ── Entry screen ───────────────────────────────────────────────────── */}
      {!currentState && (
        <div className="entry-screen">
          <p className="entry-subtitle">A social deduction game</p>

          <div className="card entry-card">
            <div className="mode-tabs">
              <button
                className={`mode-tab${!joinMode ? ' active' : ''}`}
                onClick={() => setJoinMode(false)}
              >
                New Game
              </button>
              <button
                className={`mode-tab${joinMode ? ' active' : ''}`}
                onClick={() => setJoinMode(true)}
              >
                Join Game
              </button>
            </div>

            <div className="field">
              <label>Your Name</label>
              <input
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                onKeyDown={(e) => e.key === 'Enter' && (joinMode ? handleJoin() : handleCreate())}
                autoFocus
              />
            </div>

            {joinMode && (
              <div className="field">
                <label>Game Code</label>
                <input
                  value={gameIdInput}
                  onChange={(e) => setGameIdInput(e.target.value)}
                  placeholder="Enter game code"
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                />
              </div>
            )}

            <button className="btn-full" onClick={joinMode ? handleJoin : handleCreate}>
              {joinMode ? 'Join Game' : 'Create Game'}
            </button>

            {!joinMode && (
              <button className="btn-full btn-secondary" onClick={handleBrowse}>
                Browse Waiting Games
              </button>
            )}

            <details className="advanced-section">
              <summary>Advanced</summary>
              <div className="field">
                <label>Server URL</label>
                <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
              </div>
            </details>
          </div>
        </div>
      )}

      {/* ── Waiting room ───────────────────────────────────────────────────── */}
      {currentState && inLobby && (
        <div className="card stack">
          <div className="lobby-header">
            <span className="phase">Lobby</span>
            <span className="lobby-meta">
              {currentState.players.length} / {currentState.settings.maxPlayers} players
              &nbsp;·&nbsp;
              {currentState.readyCount} ready
            </span>
          </div>

          <div>
            <label>Game Code</label>
            <div className="game-code-box">
              <span className="game-code-value">{currentState.id}</span>
              <div className="game-code-actions">
                <button
                  className="copy-btn"
                  onClick={async () => {
                    try { await copyText(currentState.id); showStatus('Game code copied.'); }
                    catch { showStatus(`Copy failed. Code: ${currentState.id}`, true); }
                  }}
                >
                  Copy Code
                </button>
                <button
                  className="copy-link-btn"
                  onClick={async () => {
                    const link = buildJoinDeepLink();
                    if (!link) { showStatus('No join link available.', true); return; }
                    try { await copyText(link); showStatus('Invite link copied.'); }
                    catch { showStatus(`Copy failed. Link: ${link}`, true); }
                  }}
                >
                  Copy Invite Link
                </button>
              </div>
            </div>
          </div>

          <div>
            <label>Players</label>
            <div className="players">
              {currentState.players.map((player) => (
                <div key={player.id} className="player">
                  <div className="player-name">{player.name}</div>
                  <div className="badges">
                    {player.id === currentPlayerId && <span className="badge you">You</span>}
                    {player.id === currentState.hostId && <span className="badge host">Host</span>}
                    <span className={`badge ${player.isReady ? 'ready' : 'not-ready'}`}>
                      {player.isReady ? 'Ready' : 'Not Ready'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lobby-actions">
            {!me?.isReady
              ? <button onClick={() => runAction('Marking ready', window.mafia.markReady)}>Ready</button>
              : <button onClick={() => runAction('Marking unready', window.mafia.markUnready)}>Unready</button>
            }
            {isHost && (
              <button disabled={!canStart} onClick={() => runAction('Starting game', window.mafia.startGame)}>
                Start Game
              </button>
            )}
            <button className="btn-secondary" onClick={handleLeave}>Leave</button>
          </div>

          {isHost && !canStart && (
            <p className="lobby-hint">
              {currentState.players.length < currentState.settings.minPlayers
                ? `Need at least ${currentState.settings.minPlayers} players to start.`
                : 'Waiting for all players to ready up.'}
            </p>
          )}
        </div>
      )}

      {/* ── Active game ────────────────────────────────────────────────────── */}
      {currentState && !inLobby && (
        <>
          <div className="card stack">
            <div>
              <div className="phase">Phase: {currentState.phase}</div>
              <p className="meta">
                Round {currentState.round} · Status: {currentState.status}
              </p>
              <p className="meta">
                You: {currentPlayerId || '-'} · Role: {me?.role || 'hidden'} {isHost ? '· Host' : ''}
              </p>
            </div>

            <div>
              <label>Players</label>
              <div className="players">
                {currentState.players.map((player) => (
                  <div key={player.id} className={`player${player.isAlive ? '' : ' dead'}`}>
                    <div className="player-name">{player.name}</div>
                    <div className="badges">
                      {player.id === currentPlayerId && <span className="badge you">You</span>}
                      {player.id === currentState.hostId && <span className="badge host">Host</span>}
                      <span className={`badge ${player.isAlive ? 'ready' : 'dead'}`}>
                        {player.isAlive ? 'Alive' : 'Dead'}
                      </span>
                      {player.role && <span className="badge">{player.role}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="row">
              <div>
                <label>Target</label>
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  disabled={!targetCandidates.length}
                >
                  {!targetCandidates.length && <option value="">No valid targets</option>}
                  {targetCandidates.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={forceResolve}
                    onChange={(e) => setForceResolve(e.target.checked)}
                  />
                  Force resolve (host)
                </label>
              </div>
            </div>

            <div className="controls">
              <button
                disabled={!inDay || !me || !me.isAlive || !targetCandidates.length}
                onClick={() => runAction('Casting vote', () => window.mafia.castVote(targetId))}
              >
                Vote
              </button>
              <button
                disabled={!inNight || !me || !me.isAlive || !targetCandidates.length}
                onClick={() => runAction('Submitting night action', () => window.mafia.nightAction(targetId))}
              >
                Night Action
              </button>
              <button
                disabled={!inDay || !isHost}
                onClick={() => runAction('Resolving day', () => window.mafia.resolveVotes(forceResolve))}
              >
                Resolve Day
              </button>
              <button
                disabled={!inNight || !isHost}
                onClick={() => runAction('Resolving night', () => window.mafia.resolveNight(forceResolve))}
              >
                Resolve Night
              </button>
              <button
                onClick={async () => {
                  try { const s = await window.mafia.getState(); applyState(s); showStatus('State refreshed.'); }
                  catch (err) { showStatus(`Error: ${err.message}`, true); }
                }}
              >
                Refresh
              </button>
              <button onClick={handleLeave}>Leave Game</button>
              <button
                onClick={async () => {
                  await window.mafia.disconnect();
                  resetGameUi();
                  showStatus('Disconnected.');
                }}
              >
                Disconnect
              </button>
            </div>
          </div>

          <div className="card">
            <strong>Raw Game State</strong>
            <pre className="state-view">{JSON.stringify(currentState, null, 2)}</pre>
          </div>
        </>
      )}

      {/* ── Status bar ─────────────────────────────────────────────────────── */}
      {status.message && (
        <div className={`status${status.error ? ' error' : ''}`}>{status.message}</div>
      )}

    </div>
  );
}

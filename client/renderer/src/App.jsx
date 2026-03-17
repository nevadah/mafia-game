import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './i18n';

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
  const { t, i18n } = useTranslation();

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
  // Tracks which (phase, round) the current player has submitted a night action for
  const [submittedNightKey, setSubmittedNightKey] = useState(null);

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
  const isEnded  = Boolean(currentState && currentState.status === 'ended');

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
    if (!playerName.trim()) { showStatus(t('statusEnterName'), true); return; }
    try {
      showStatus(t('statusCreatingGame'));
      const result = await window.mafia.createGame(serverUrl.trim(), playerName.trim());
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

  // ── WebSocket event subscriptions ──────────────────────────────────────────

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
    window.mafia.onDeepLink((payload) => {
      if (currentStateRef.current) {
        showStatus(t('statusJoinLinkBlocked'), true);
        return;
      }
      if (payload?.serverUrl) setServerUrl(payload.serverUrl);
      if (payload?.gameId) {
        setGameIdInput(payload.gameId);
        setJoinMode(true);
        showStatus(t('statusJoinLinkLoaded', { gameId: payload.gameId }));
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
        <div className="header-controls">
          <div className="lang-switcher">
            {['en', 'de', 'es', 'fr'].map((lang) => (
              <button
                key={lang}
                className={`lang-btn${i18n.language === lang ? ' active' : ''}`}
                onClick={() => {
                  i18n.changeLanguage(lang);
                  localStorage.setItem('mafia-language', lang);
                }}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === 'dark' ? t('lightMode') : t('darkMode')}
          </button>
        </div>
      </div>

      {/* ── Entry screen ───────────────────────────────────────────────────── */}
      {!currentState && (
        <div className="entry-screen">
          <p className="entry-subtitle">{t('entrySubtitle')}</p>

          <div className="card entry-card">
            <div className="mode-tabs">
              <button
                className={`mode-tab${!joinMode ? ' active' : ''}`}
                onClick={() => setJoinMode(false)}
              >
                {t('newGame')}
              </button>
              <button
                className={`mode-tab${joinMode ? ' active' : ''}`}
                onClick={() => setJoinMode(true)}
              >
                {t('joinGame')}
              </button>
            </div>

            <div className="field">
              <label>{t('yourName')}</label>
              <input
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder={t('namePlaceholder')}
                onKeyDown={(e) => e.key === 'Enter' && (joinMode ? handleJoin() : handleCreate())}
                autoFocus
              />
            </div>

            {joinMode && (
              <div className="field">
                <label>{t('gameCodeLabel')}</label>
                <input
                  value={gameIdInput}
                  onChange={(e) => setGameIdInput(e.target.value)}
                  placeholder={t('gameCodePlaceholder')}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                />
              </div>
            )}

            <button className="btn-full" onClick={joinMode ? handleJoin : handleCreate}>
              {joinMode ? t('joinGame') : t('createGame')}
            </button>

            {!joinMode && (
              <button className="btn-full btn-secondary" onClick={handleBrowse}>
                {t('browseGames')}
              </button>
            )}

            <details className="advanced-section">
              <summary>{t('advanced')}</summary>
              <div className="field">
                <label>{t('serverUrl')}</label>
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
            <span className="phase">{t('lobbyPhase')}</span>
            <span className="lobby-meta">
              {t('lobbyPlayerCount', { current: currentState.players.length, max: currentState.settings.maxPlayers })}
              &nbsp;·&nbsp;
              {t('readyCount', { count: currentState.readyCount })}
            </span>
          </div>

          <div>
            <label>{t('gameCodeLabel')}</label>
            <div className="game-code-box">
              <span className="game-code-value">{currentState.id}</span>
              <div className="game-code-actions">
                <button
                  className="copy-btn"
                  onClick={async () => {
                    try { await copyText(currentState.id); showStatus(t('statusCodeCopied')); }
                    catch { showStatus(t('statusCopyFailed', { code: currentState.id }), true); }
                  }}
                >
                  {t('copyCode')}
                </button>
                <button
                  className="copy-link-btn"
                  onClick={async () => {
                    const link = buildJoinDeepLink();
                    if (!link) { showStatus(t('statusNoJoinLink'), true); return; }
                    try { await copyText(link); showStatus(t('statusInviteCopied')); }
                    catch { showStatus(t('statusInviteFailed', { link }), true); }
                  }}
                >
                  {t('copyInviteLink')}
                </button>
              </div>
            </div>
          </div>

          <div>
            <label>{t('playersLabel')}</label>
            <div className="players">
              {currentState.players.map((player) => (
                <div key={player.id} className="player">
                  <div className="player-name">{player.name}</div>
                  <div className="badges">
                    {player.id === currentPlayerId && <span className="badge you">{t('youBadge')}</span>}
                    {player.id === currentState.hostId && <span className="badge host">{t('hostBadge')}</span>}
                    <span className={`badge ${player.isReady ? 'ready' : 'not-ready'}`}>
                      {player.isReady ? t('readyBadge') : t('notReadyBadge')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lobby-actions">
            {!me?.isReady
              ? <button onClick={() => runAction(t('actionMarkingReady'), window.mafia.markReady)}>{t('readyButton')}</button>
              : <button onClick={() => runAction(t('actionMarkingUnready'), window.mafia.markUnready)}>{t('unreadyButton')}</button>
            }
            {isHost && (
              <button disabled={!canStart} onClick={() => runAction(t('actionStartingGame'), window.mafia.startGame)}>
                {t('startGame')}
              </button>
            )}
            <button className="btn-secondary" onClick={handleLeave}>{t('leaveButton')}</button>
          </div>

          {isHost && !canStart && (
            <p className="lobby-hint">
              {currentState.players.length < currentState.settings.minPlayers
                ? t('needMorePlayers', { count: currentState.settings.minPlayers })
                : t('waitingForReady')}
            </p>
          )}
        </div>
      )}

      {/* ── Day phase ──────────────────────────────────────────────────────── */}
      {currentState && inDay && (() => {
        const myVote = currentState.votes[currentPlayerId];
        const pendingVoters = currentState.players.filter(
          (p) => p.isAlive && !currentState.votes[p.id]
        );
        const alivePlayers = currentState.players.filter((p) => p.isAlive);
        const deadPlayers  = currentState.players.filter((p) => !p.isAlive);
        const dayInvestigation = currentState.investigatedThisRound;
        const dayInvestigatedPlayer = dayInvestigation
          ? currentState.players.find((p) => p.id === dayInvestigation.target)
          : null;

        return (
          <>
            <div className="card stack">
              <div className="day-header">
                <span className="phase">{t('dayPhase', { round: currentState.round })}</span>
                <span className="phase-meta">{t('dayMeta')}</span>
              </div>
              <p className="meta">
                {t('playingAs')} <strong>{me?.name}</strong>
                {me?.role && <> · {t('roleLabel')}: <strong>{me.role}</strong></>}
                {isHost && ` · ${t('hostBadge')}`}
              </p>
            </div>

            {me?.role === 'sheriff' && dayInvestigatedPlayer && (
              <div className="card stack">
                <div className="section-heading">{t('prevInvestigation')}</div>
                <p className="meta">
                  <strong>{dayInvestigatedPlayer.name}</strong>{' '}
                  {t('investigationIs')}{' '}
                  <strong className={dayInvestigation.result === 'mafia' ? 'role-mafia' : 'role-town'}>
                    {t(dayInvestigation.result === 'mafia' ? 'investigationMafia' : 'investigationNotMafia')}
                  </strong>.
                </p>
              </div>
            )}

            <div className="card stack">
              <div className="section-heading">{t('castYourVote')}</div>
              <div className="players">
                {alivePlayers.map((player) => {
                  const isMe      = player.id === currentPlayerId;
                  const voteCount = Object.values(currentState.votes).filter((t) => t === player.id).length;
                  const iVotedFor = myVote === player.id;

                  return (
                    <div key={player.id} className={`player${iVotedFor ? ' voted-for' : ''}`}>
                      <div className="player-name">{player.name}</div>
                      <div className="badges">
                        {isMe      && <span className="badge you">{t('youBadge')}</span>}
                        {player.id === currentState.hostId && <span className="badge host">{t('hostBadge')}</span>}
                        {!isMe && player.role && <span className="badge role-mafia">{player.role}</span>}
                        {voteCount > 0 && (
                          <span className="badge vote-count">
                            {t('voteCount', { count: voteCount })}
                          </span>
                        )}
                        {iVotedFor && <span className="badge your-vote">{t('yourVote')}</span>}
                      </div>
                      {!isMe && me?.isAlive && !myVote && (
                        <button
                          className="vote-btn"
                          onClick={() => runAction(t('actionCastingVote'), () => window.mafia.castVote(player.id))}
                        >
                          {t('voteButton')}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {pendingVoters.length > 0 && (
                <p className="lobby-hint">
                  {t('waitingToVote', { names: pendingVoters.map((p) => p.name).join(', ') })}
                </p>
              )}

              {isHost && (
                <div className="day-controls">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={forceResolve}
                      onChange={(e) => setForceResolve(e.target.checked)}
                    />
                    {t('forceResolve')}
                  </label>
                  <button onClick={() => runAction(t('actionResolvingDay'), () => window.mafia.resolveVotes(forceResolve))}>
                    {t('resolveDay')}
                  </button>
                </div>
              )}
            </div>

            {deadPlayers.length > 0 && (
              <div className="card stack">
                <div className="section-heading">{t('eliminated')}</div>
                <div className="players">
                  {deadPlayers.map((player) => (
                    <div key={player.id} className="player dead">
                      <div className="player-name">{player.name}</div>
                      <div className="badges">
                        <span className="badge dead">{t('eliminated')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="controls">
              <button className="btn-secondary" onClick={handleLeave}>{t('leaveGame')}</button>
            </div>
          </>
        );
      })()}

      {/* ── Night phase ────────────────────────────────────────────────────── */}
      {currentState && inNight && (() => {
        const nightNumber = currentState.round + 1;
        const myRole = me?.role;
        const nightKey = `night-${currentState.round}`;
        const hasSubmitted = submittedNightKey === nightKey;

        const nightTargets = (() => {
          if (!me?.isAlive) return [];
          if (myRole === 'doctor') return currentState.players.filter((p) => p.isAlive);
          if (myRole === 'mafia' || myRole === 'sheriff') {
            return currentState.players.filter((p) => p.isAlive && p.id !== me.id);
          }
          return [];
        })();

        const actionLabel = myRole === 'mafia' ? t('eliminateAction') : myRole === 'doctor' ? t('protectAction') : t('investigateAction');
        const investigation = currentState.investigatedThisRound;
        const investigatedPlayer = investigation
          ? currentState.players.find((p) => p.id === investigation.target)
          : null;

        const deadPlayers = currentState.players.filter((p) => !p.isAlive);

        return (
          <>
            <div className="card stack">
              <div className="day-header">
                <span className="phase">{t('nightPhase', { number: nightNumber })}</span>
                <span className="phase-meta">
                  {myRole === 'mafia'   && t('nightMafiaMeta')}
                  {myRole === 'doctor'  && t('nightDoctorMeta')}
                  {myRole === 'sheriff' && t('nightSheriffMeta')}
                  {(!myRole || myRole === 'townsperson') && t('nightTownMeta')}
                </span>
              </div>
              <p className="meta">
                {t('playingAs')} <strong>{me?.name}</strong>
                {myRole && <> · {t('roleLabel')}: <strong>{myRole}</strong></>}
                {isHost && ` · ${t('hostBadge')}`}
              </p>
            </div>

            {myRole === 'sheriff' && investigatedPlayer && (
              <div className="card stack">
                <div className="section-heading">{t('prevInvestigation')}</div>
                <p className="meta">
                  <strong>{investigatedPlayer.name}</strong>{' '}
                  {t('investigationIs')}{' '}
                  <strong className={investigation.result === 'mafia' ? 'role-mafia' : 'role-town'}>
                    {t(investigation.result === 'mafia' ? 'investigationMafia' : 'investigationNotMafia')}
                  </strong>.
                </p>
              </div>
            )}

            {nightTargets.length > 0 && (
              <div className="card stack">
                <div className="section-heading">
                  {myRole === 'mafia'   && t('selectEliminate')}
                  {myRole === 'doctor'  && t('selectProtect')}
                  {myRole === 'sheriff' && t('selectInvestigate')}
                </div>
                {hasSubmitted ? (
                  <p className="lobby-hint">{t('actionSubmitted')}</p>
                ) : (
                  <div className="players">
                    {nightTargets.map((player) => (
                      <div key={player.id} className="player">
                        <div className="player-name">{player.name}</div>
                        <div className="badges">
                          {player.id === currentState.hostId && <span className="badge host">{t('hostBadge')}</span>}
                          {player.role && <span className="badge role-mafia">{player.role}</span>}
                        </div>
                        <button
                          className="vote-btn"
                          onClick={() => runAction(actionLabel, async () => {
                            const result = await window.mafia.nightAction(player.id);
                            setSubmittedNightKey(nightKey);
                            return result;
                          })}
                        >
                          {actionLabel}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {myRole === 'townsperson' && me?.isAlive && (
              <div className="card stack">
                <p className="lobby-hint">{t('townSleepsHint')}</p>
              </div>
            )}

            <div className="card stack">
              <div className="section-heading">{t('playersLabel')}</div>
              <div className="players">
                {currentState.players.filter((p) => p.isAlive).map((player) => (
                  <div key={player.id} className="player">
                    <div className="player-name">{player.name}</div>
                    <div className="badges">
                      {player.id === currentPlayerId && <span className="badge you">{t('youBadge')}</span>}
                      {player.id === currentState.hostId && <span className="badge host">{t('hostBadge')}</span>}
                      {player.id !== currentPlayerId && player.role && <span className="badge role-mafia">{player.role}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {deadPlayers.length > 0 && (
              <div className="card stack">
                <div className="section-heading">{t('eliminated')}</div>
                <div className="players">
                  {deadPlayers.map((player) => (
                    <div key={player.id} className="player dead">
                      <div className="player-name">{player.name}</div>
                      <div className="badges">
                        <span className="badge dead">{t('eliminated')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isHost && (
              <div className="card stack">
                <div className="day-controls">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={forceResolve}
                      onChange={(e) => setForceResolve(e.target.checked)}
                    />
                    {t('forceResolve')}
                  </label>
                  <button onClick={() => runAction(t('actionResolvingNight'), () => window.mafia.resolveNight(forceResolve))}>
                    {t('resolveNight')}
                  </button>
                </div>
              </div>
            )}

            <div className="controls">
              <button className="btn-secondary" onClick={handleLeave}>{t('leaveGame')}</button>
            </div>
          </>
        );
      })()}

      {/* ── Game over ──────────────────────────────────────────────────────── */}
      {currentState && isEnded && (
        <>
          <div className="card stack">
            <div className="day-header">
              <span className="phase">{t('gameOver')}</span>
              <span className="phase-meta">
                {currentState.winner === 'town' ? t('townWins') : t('mafiaWins')}
              </span>
            </div>
          </div>

          <div className="card stack">
            <div className="section-heading">{t('finalStandings')}</div>
            <div className="players">
              {currentState.players.map((player) => (
                <div key={player.id} className={`player${player.isAlive ? '' : ' dead'}`}>
                  <div className="player-name">{player.name}</div>
                  <div className="badges">
                    {player.id === currentPlayerId && <span className="badge you">{t('youBadge')}</span>}
                    {player.role && <span className="badge">{player.role}</span>}
                    <span className={`badge ${player.isAlive ? 'ready' : 'dead'}`}>
                      {player.isAlive ? t('survivedBadge') : t('eliminated')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="controls">
            <button onClick={resetGameUi}>{t('backToMenu')}</button>
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

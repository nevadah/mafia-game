/* global mafia */
'use strict';

const $ = (id) => document.getElementById(id);

let currentState = null;
let currentPlayerId = null;
let currentGameId = null;

function showStatus(msg, isError = false) {
  const el = $('status');
  el.textContent = msg;
  el.style.color = isError ? '#e94560' : '#aaa';
}

function resetGameUi() {
  currentState = null;
  currentPlayerId = null;
  currentGameId = null;
  $('connect-panel').style.display = 'block';
  $('game-panel').style.display = 'none';
  $('raw-panel').style.display = 'none';
}

function myPlayer() {
  if (!currentState || !currentPlayerId) return null;
  return currentState.players.find((p) => p.id === currentPlayerId) || null;
}

function isHost() {
  return Boolean(currentState && currentPlayerId && currentState.hostId === currentPlayerId);
}

function targetCandidates() {
  if (!currentState) return [];
  const me = myPlayer();
  if (!me || !me.isAlive) return [];

  if (currentState.phase === 'day') {
    return currentState.players.filter((p) => p.isAlive && p.id !== me.id);
  }

  if (currentState.phase === 'night') {
    if (me.role !== 'mafia' && me.role !== 'doctor' && me.role !== 'sheriff') {
      return [];
    }
    return currentState.players.filter((p) => p.isAlive);
  }

  return [];
}

function renderTargets() {
  const select = $('target-select');
  const candidates = targetCandidates();
  const oldValue = select.value;

  select.innerHTML = '';
  if (candidates.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No valid targets';
    select.appendChild(opt);
    select.disabled = true;
    return;
  }

  for (const p of candidates) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  }

  if (candidates.some((p) => p.id === oldValue)) {
    select.value = oldValue;
  }

  select.disabled = false;
}

function updateButtonStates() {
  const state = currentState;
  const me = myPlayer();
  const host = isHost();
  const targetAvailable = targetCandidates().length > 0;

  const inLobby = Boolean(state && state.phase === 'lobby' && state.status === 'waiting');
  const inDay = Boolean(state && state.phase === 'day' && state.status === 'active');
  const inNight = Boolean(state && state.phase === 'night' && state.status === 'active');

  $('btn-ready').disabled = !inLobby || !me || me.isReady;
  $('btn-unready').disabled = !inLobby || !me || !me.isReady;
  $('btn-start').disabled = !inLobby || !host;
  $('btn-vote').disabled = !inDay || !me || !me.isAlive || !targetAvailable;
  $('btn-night').disabled = !inNight || !me || !me.isAlive || !targetAvailable;
  $('btn-resolve-day').disabled = !inDay || !host;
  $('btn-resolve-night').disabled = !inNight || !host;
  $('btn-refresh').disabled = !state;
  $('btn-leave').disabled = !state;
  $('btn-disconnect').disabled = !state;
}

function renderState(state) {
  if (!state) return;
  currentState = state;

  $('phase-display').textContent = `Phase: ${state.phase}`;
  $('round-display').textContent = `Round ${state.round} · Status: ${state.status} · Ready ${state.readyCount}/${state.players.length}`;

  const me = myPlayer();
  const roleLabel = me && me.role ? me.role : 'hidden';
  $('me-display').textContent = `Game ${state.id} · You ${currentPlayerId || '-'} · Role ${roleLabel} ${isHost() ? '· Host' : ''}`;

  const list = $('players-list');
  list.innerHTML = '';
  for (const p of state.players) {
    const span = document.createElement('span');
    span.className = `player${p.isAlive ? '' : ' dead'}`;
    const readyText = state.status === 'waiting' ? (p.isReady ? 'ready' : 'not ready') : (p.isAlive ? 'alive' : 'dead');
    span.textContent = `${p.name}${p.role ? ` (${p.role})` : ''} [${readyText}]`;
    list.appendChild(span);
  }

  renderTargets();
  updateButtonStates();
  $('state-view').textContent = JSON.stringify(state, null, 2);
}

function onConnected(result) {
  currentPlayerId = result.playerId;
  currentGameId = result.gameId;
  $('connect-panel').style.display = 'none';
  $('game-panel').style.display = 'block';
  $('raw-panel').style.display = 'block';
  showStatus(`Connected · Game ${result.gameId} · You ${result.playerId}`);
  renderState(result.state);
}

async function runAction(actionLabel, action) {
  try {
    showStatus(`${actionLabel}...`);
    const result = await action();
    if (result && result.state) {
      renderState(result.state);
    }
    if (result && typeof result === 'object' && !result.state) {
      const summary = Object.entries(result).map(([k, v]) => `${k}=${v}`).join(', ');
      if (summary) showStatus(`${actionLabel} complete (${summary})`);
    }
  } catch (err) {
    showStatus(`Error: ${err.message}`, true);
  }
}

$('btn-create').addEventListener('click', async () => {
  const serverUrl = $('server-url').value.trim();
  const playerName = $('player-name').value.trim();
  if (!playerName) { showStatus('Enter a player name', true); return; }
  try {
    showStatus('Creating game...');
    const result = await mafia.createGame(serverUrl, playerName);
    onConnected(result);
  } catch (err) {
    showStatus(`Error: ${err.message}`, true);
  }
});

$('btn-join').addEventListener('click', async () => {
  const serverUrl = $('server-url').value.trim();
  const gameId = $('game-id').value.trim();
  const playerName = $('player-name').value.trim();
  if (!playerName) { showStatus('Enter a player name', true); return; }
  if (!gameId) { showStatus('Enter a game ID to join', true); return; }
  try {
    showStatus('Joining game...');
    const result = await mafia.joinGame(serverUrl, gameId, playerName);
    onConnected(result);
  } catch (err) {
    showStatus(`Error: ${err.message}`, true);
  }
});

$('btn-list').addEventListener('click', async () => {
  const serverUrl = $('server-url').value.trim();
  try {
    const games = await mafia.listGames(serverUrl);
    if (!games.length) {
      showStatus('No waiting games found');
      return;
    }
    const summary = games.map((g) => `${g.gameId} (${g.readyCount}/${g.playerCount})`).join(' | ');
    showStatus(`Waiting games: ${summary}`);
  } catch (err) {
    showStatus(`Error: ${err.message}`, true);
  }
});

$('btn-ready').addEventListener('click', () => runAction('Marking ready', () => mafia.markReady()));
$('btn-unready').addEventListener('click', () => runAction('Marking unready', () => mafia.markUnready()));
$('btn-start').addEventListener('click', () => runAction('Starting game', () => mafia.startGame()));

$('btn-vote').addEventListener('click', () => {
  const targetId = $('target-select').value;
  if (!targetId) { showStatus('Pick a vote target', true); return; }
  runAction('Casting vote', () => mafia.castVote(targetId));
});

$('btn-night').addEventListener('click', () => {
  const targetId = $('target-select').value;
  if (!targetId) { showStatus('Pick a night target', true); return; }
  runAction('Submitting night action', () => mafia.nightAction(targetId));
});

$('btn-resolve-day').addEventListener('click', () => {
  const force = $('force-resolve').checked;
  runAction('Resolving day', () => mafia.resolveVotes(force));
});

$('btn-resolve-night').addEventListener('click', () => {
  const force = $('force-resolve').checked;
  runAction('Resolving night', () => mafia.resolveNight(force));
});

$('btn-refresh').addEventListener('click', async () => {
  try {
    const state = await mafia.getState();
    renderState(state);
    showStatus('State refreshed');
  } catch (err) {
    showStatus(`Error: ${err.message}`, true);
  }
});

$('btn-leave').addEventListener('click', async () => {
  try {
    const result = await mafia.leaveGame();
    resetGameUi();
    showStatus(result.deletedGame ? 'Left game; host/game closed' : 'Left game');
  } catch (err) {
    showStatus(`Error: ${err.message}`, true);
  }
});

$('btn-disconnect').addEventListener('click', async () => {
  await mafia.disconnect();
  resetGameUi();
  showStatus('Disconnected');
});

// Real-time updates
mafia.onStateUpdate((state) => renderState(state));
mafia.onPlayerJoined(() => showStatus('A player joined'));
mafia.onPlayerLeft(() => showStatus('A player left'));
mafia.onPlayerReady((payload) => {
  if (payload && typeof payload === 'object' && payload.state) {
    renderState(payload.state);
  }
  showStatus('Ready status updated');
});
mafia.onVoteCast(() => showStatus('Vote cast'));
mafia.onPlayerEliminated((p) => showStatus(`Player eliminated: ${p?.playerId || 'unknown'}`));
mafia.onGameStarted(() => showStatus('Game started'));
mafia.onGameEnded((p) => showStatus(`Game over: ${p?.winner || 'unknown'} wins`));
mafia.onServerError((p) => showStatus(`Server error: ${p?.message || 'unknown'}`, true));

resetGameUi();

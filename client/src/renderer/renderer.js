/* global mafia */
'use strict';

const $ = (id) => document.getElementById(id);

function showStatus(msg, isError = false) {
  const el = $('status');
  el.textContent = msg;
  el.style.color = isError ? '#e94560' : '#aaa';
}

function renderState(state) {
  if (!state) return;
  $('phase-display').textContent = `Phase: ${state.phase}`;
  $('round-display').textContent = `Round ${state.round} · Status: ${state.status}`;

  const list = $('players-list');
  list.innerHTML = '';
  for (const p of state.players) {
    const span = document.createElement('span');
    span.className = `player${p.isAlive ? '' : ' dead'}`;
    span.textContent = `${p.name}${p.role ? ` (${p.role})` : ''}`;
    list.appendChild(span);
  }

  $('state-view').textContent = JSON.stringify(state, null, 2);
}

function onConnected(result) {
  $('connect-panel').style.display = 'none';
  $('game-panel').style.display = 'block';
  $('raw-panel').style.display = 'block';
  showStatus(`Connected — Game: ${result.gameId} · You: ${result.playerId}`);
  renderState(result.state);
}

$('btn-create').addEventListener('click', async () => {
  const serverUrl = $('server-url').value.trim();
  const playerName = $('player-name').value.trim();
  if (!playerName) { showStatus('Enter a player name', true); return; }
  try {
    showStatus('Creating game…');
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
    showStatus('Joining game…');
    const result = await mafia.joinGame(serverUrl, gameId, playerName);
    onConnected(result);
  } catch (err) {
    showStatus(`Error: ${err.message}`, true);
  }
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

$('btn-disconnect').addEventListener('click', async () => {
  await mafia.disconnect();
  $('connect-panel').style.display = 'block';
  $('game-panel').style.display = 'none';
  $('raw-panel').style.display = 'none';
  showStatus('Disconnected');
});

// Real-time updates
mafia.onStateUpdate((state) => renderState(state));
mafia.onPlayerJoined(() => showStatus('A player joined!'));
mafia.onPlayerLeft(() => showStatus('A player left'));
mafia.onGameEnded((p) => showStatus(`Game over — ${p?.winner ?? 'unknown'} wins!`));

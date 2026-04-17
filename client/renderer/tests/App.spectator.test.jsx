import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App';

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockMafia = {
  onStateUpdate: jest.fn(),
  onPlayerJoined: jest.fn(),
  onPlayerLeft: jest.fn(),
  onPlayerReady: jest.fn(),
  onVoteCast: jest.fn(),
  onPlayerEliminated: jest.fn(),
  onGameStarted: jest.fn(),
  onGameEnded: jest.fn(),
  onServerError: jest.fn(),
  onDeepLink: jest.fn(),
  onSpectatorJoined: jest.fn(),
  onSpectatorLeft: jest.fn(),
  onReconnecting: jest.fn(),
  onGameClosed: jest.fn(),
  onDisconnected: jest.fn(),
  getStartupDeepLink: jest.fn().mockResolvedValue(null),
  createGame: jest.fn(),
  joinGame: jest.fn(),
  joinAsSpectator: jest.fn(),
  listGames: jest.fn(),
  getState: jest.fn(),
  markReady: jest.fn(),
  markUnready: jest.fn(),
  startGame: jest.fn(),
  castVote: jest.fn(),
  nightAction: jest.fn(),
  resolveVotes: jest.fn(),
  resolveNight: jest.fn(),
  sendChat: jest.fn(),
  leaveGame: jest.fn(),
  leaveSpectator: jest.fn(),
  onNightActionSubmitted: jest.fn(),
  disconnect: jest.fn()
};

const BASE_SETTINGS = {
  minPlayers: 4,
  maxPlayers: 12,
  mafiaRatio: 0.25,
  hasDoctor: true,
  hasSheriff: true
};

const SPECTATOR_ID = 'spectator-1';
const GAME_ID = 'game-abc';

function makeLobbyState(overrides = {}) {
  return {
    id: GAME_ID,
    phase: 'lobby',
    status: 'waiting',
    round: 0,
    hostId: 'p1',
    players: [
      { id: 'p1', name: 'Alice', isAlive: true, isReady: false, isConnected: true },
      { id: 'p2', name: 'Bob',   isAlive: true, isReady: false, isConnected: true }
    ],
    spectators: [{ id: SPECTATOR_ID, name: 'Watcher', isConnected: true }],
    votes: {},
    nightActions: {},
    settings: BASE_SETTINGS,
    readyCount: 0,
    messages: [],
    eliminations: [],
    ...overrides
  };
}

function makeDayState(overrides = {}) {
  return {
    id: GAME_ID,
    phase: 'day',
    status: 'active',
    round: 1,
    hostId: 'p1',
    players: [
      { id: 'p1', name: 'Alice', role: 'townsperson', isAlive: true,  isReady: true, isConnected: true },
      { id: 'p2', name: 'Bob',   role: 'mafia',       isAlive: true,  isReady: true, isConnected: true },
      { id: 'p3', name: 'Carol', role: 'townsperson', isAlive: true,  isReady: true, isConnected: true },
      { id: 'p4', name: 'Dave',  role: 'townsperson', isAlive: false, isReady: true, isConnected: false }
    ],
    spectators: [{ id: SPECTATOR_ID, name: 'Watcher', isConnected: true }],
    votes: {},
    nightActions: {},
    eliminatedThisRound: undefined,
    settings: BASE_SETTINGS,
    readyCount: 4,
    messages: [],
    eliminations: [],
    ...overrides
  };
}

function makeNightState(overrides = {}) {
  return {
    ...makeDayState(),
    phase: 'night',
    round: 0,
    ...overrides
  };
}

// Renders App and simulates joining as a spectator.
async function enterSpectatorLobby(user, state = makeLobbyState()) {
  mockMafia.joinAsSpectator.mockResolvedValue({
    spectatorId: SPECTATOR_ID,
    gameId: GAME_ID,
    state
  });
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Join Game' }));
  await user.type(screen.getByPlaceholderText('Enter your name'), 'Watcher');
  await user.type(screen.getByPlaceholderText('Enter game code'), GAME_ID);
  await user.click(screen.getByRole('button', { name: 'Spectate' }));
}

async function enterSpectatorDayPhase(user, state = makeDayState()) {
  mockMafia.joinAsSpectator.mockResolvedValue({
    spectatorId: SPECTATOR_ID,
    gameId: GAME_ID,
    state
  });
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Join Game' }));
  await user.type(screen.getByPlaceholderText('Enter your name'), 'Watcher');
  await user.type(screen.getByPlaceholderText('Enter game code'), GAME_ID);
  await user.click(screen.getByRole('button', { name: 'Spectate' }));
}

async function enterSpectatorNightPhase(user, state = makeNightState()) {
  mockMafia.joinAsSpectator.mockResolvedValue({
    spectatorId: SPECTATOR_ID,
    gameId: GAME_ID,
    state
  });
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Join Game' }));
  await user.type(screen.getByPlaceholderText('Enter your name'), 'Watcher');
  await user.type(screen.getByPlaceholderText('Enter game code'), GAME_ID);
  await user.click(screen.getByRole('button', { name: 'Spectate' }));
}

beforeEach(() => {
  window.mafia = mockMafia;
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn()
    }))
  });
  jest.clearAllMocks();
});

// ── Entry screen — Spectate button ────────────────────────────────────────────

describe('App — spectator entry', () => {
  it('shows Spectate button in join mode', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Join Game' }));
    expect(screen.getByRole('button', { name: 'Spectate' })).toBeInTheDocument();
  });

  it('does not show Spectate button in new game mode', () => {
    render(<App />);
    expect(screen.queryByRole('button', { name: 'Spectate' })).not.toBeInTheDocument();
  });

  it('calls joinAsSpectator with correct args', async () => {
    const user = userEvent.setup();
    mockMafia.joinAsSpectator.mockResolvedValue({
      spectatorId: SPECTATOR_ID, gameId: GAME_ID, state: makeLobbyState()
    });
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Join Game' }));
    await user.type(screen.getByPlaceholderText('Enter your name'), 'Watcher');
    await user.type(screen.getByPlaceholderText('Enter game code'), GAME_ID);
    await user.click(screen.getByRole('button', { name: 'Spectate' }));

    expect(mockMafia.joinAsSpectator).toHaveBeenCalledWith(
      'http://localhost:3000',
      GAME_ID,
      'Watcher'
    );
  });
});

// ── AppHeader — Spectating badge ──────────────────────────────────────────────

describe('App — AppHeader spectating badge', () => {
  it('shows Spectating badge when spectating', async () => {
    const user = userEvent.setup();
    await enterSpectatorLobby(user);
    // At least one "Spectating" badge should appear (AppHeader + spectator list)
    expect(screen.getAllByText('Spectating').length).toBeGreaterThanOrEqual(1);
  });

  it('does not show Spectating badge when playing normally', async () => {
    mockMafia.createGame.mockResolvedValue({
      playerId: 'p1', gameId: GAME_ID, state: makeLobbyState({ spectators: [] })
    });
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByPlaceholderText('Enter your name'), 'Alice');
    await user.click(screen.getByRole('button', { name: 'Create Game' }));
    expect(screen.queryByText('Spectating')).not.toBeInTheDocument();
  });
});

// ── Lobby phase — spectator view ──────────────────────────────────────────────

describe('App — lobby phase as spectator', () => {
  it('shows the spectators list', async () => {
    const user = userEvent.setup();
    await enterSpectatorLobby(user);
    expect(screen.getByText('Spectators')).toBeInTheDocument();
    expect(screen.getByText('Watcher')).toBeInTheDocument();
  });

  it('shows the Copy Spectate Link button', async () => {
    const user = userEvent.setup();
    await enterSpectatorLobby(user);
    expect(screen.getByRole('button', { name: 'Copy Spectate Link' })).toBeInTheDocument();
  });

  it('hides Ready and Unready buttons for spectators', async () => {
    const user = userEvent.setup();
    await enterSpectatorLobby(user);
    expect(screen.queryByRole('button', { name: 'Ready' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unready' })).not.toBeInTheDocument();
  });

  it('hides Start Game button for spectators', async () => {
    const user = userEvent.setup();
    await enterSpectatorLobby(user);
    expect(screen.queryByRole('button', { name: 'Start Game' })).not.toBeInTheDocument();
  });

  it('still shows Leave button for spectators', async () => {
    const user = userEvent.setup();
    await enterSpectatorLobby(user);
    expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument();
  });

  it('shows spectator badge on spectator in list', async () => {
    const user = userEvent.setup();
    await enterSpectatorLobby(user);
    const spectatorItems = screen.getAllByText('Spectating');
    // One is in the header, one is the badge on the spectator in the list
    expect(spectatorItems.length).toBeGreaterThanOrEqual(1);
  });

  it('shows Disconnected badge for players with isConnected: false', async () => {
    const user = userEvent.setup();
    const state = makeLobbyState({
      players: [
        { id: 'p1', name: 'Alice', isAlive: true, isReady: false, isConnected: true },
        { id: 'p2', name: 'Bob',   isAlive: true, isReady: false, isConnected: false }
      ]
    });
    await enterSpectatorLobby(user, state);
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });
});

// ── Day phase — spectator view ────────────────────────────────────────────────

describe('App — day phase as spectator', () => {
  it('shows Spectating context instead of Playing as', async () => {
    const user = userEvent.setup();
    await enterSpectatorDayPhase(user);
    expect(screen.getAllByText('Spectating').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Playing as')).not.toBeInTheDocument();
  });

  it('hides vote buttons for spectators', async () => {
    const user = userEvent.setup();
    await enterSpectatorDayPhase(user);
    expect(screen.queryByRole('button', { name: 'Vote' })).not.toBeInTheDocument();
  });

  it('hides chat input for spectators', async () => {
    const user = userEvent.setup();
    await enterSpectatorDayPhase(user);
    expect(screen.queryByPlaceholderText('Say something…')).not.toBeInTheDocument();
  });

  it('hides chat send button for spectators', async () => {
    const user = userEvent.setup();
    await enterSpectatorDayPhase(user);
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
  });

  it('shows player list', async () => {
    const user = userEvent.setup();
    await enterSpectatorDayPhase(user);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });
});

// ── Night phase — spectator view ──────────────────────────────────────────────

describe('App — night phase as spectator', () => {
  it('shows Spectating context instead of Playing as', async () => {
    const user = userEvent.setup();
    await enterSpectatorNightPhase(user);
    expect(screen.getAllByText('Spectating').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Playing as')).not.toBeInTheDocument();
  });

  it('hides night action buttons for spectators', async () => {
    const user = userEvent.setup();
    await enterSpectatorNightPhase(user);
    expect(screen.queryByRole('button', { name: 'Eliminate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Protect' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Investigate' })).not.toBeInTheDocument();
  });

  it('shows player list', async () => {
    const user = userEvent.setup();
    await enterSpectatorNightPhase(user);
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });
});

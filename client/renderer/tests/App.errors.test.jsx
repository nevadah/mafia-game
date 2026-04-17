import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
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
  onReconnecting: jest.fn(),
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
  disconnect: jest.fn()
};

function makeLobbyState(overrides = {}) {
  return {
    id: 'game-1',
    phase: 'lobby',
    status: 'waiting',
    round: 0,
    hostId: 'p1',
    players: [
      { id: 'p1', name: 'Alice', role: undefined, isAlive: true, isReady: false, isConnected: true }
    ],
    spectators: [],
    votes: {},
    nightActions: {},
    settings: { minPlayers: 4, maxPlayers: 12, mafiaRatio: 0.25, hasDoctor: true, hasSheriff: true },
    readyCount: 0,
    messages: [],
    ...overrides
  };
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

// ── Entry validation errors ───────────────────────────────────────────────────

describe('App — entry validation errors', () => {
  it('shows error when Create Game is clicked with no name', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Create Game' }));
    expect(screen.getByText('Enter a player name')).toBeInTheDocument();
    expect(mockMafia.createGame).not.toHaveBeenCalled();
  });

  it('shows error when Join Game action is clicked with no name', async () => {
    const user = userEvent.setup();
    render(<App />);
    // Switch to join tab
    const tabs = document.querySelector('.mode-tabs');
    await user.click(tabs.querySelector('button:last-child'));
    // Click action button with no name entered
    await user.click(document.querySelector('.btn-full'));
    expect(screen.getByText('Enter a player name')).toBeInTheDocument();
    expect(mockMafia.joinGame).not.toHaveBeenCalled();
  });

  it('shows error when Join Game is clicked with name but no game code', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Join Game' }));
    await user.type(screen.getByPlaceholderText('Enter your name'), 'Alice');
    // Find and click the action "Join Game" button (btn-full)
    await user.click(document.querySelector('.btn-full'));
    expect(screen.getByText('Enter a game code')).toBeInTheDocument();
    expect(mockMafia.joinGame).not.toHaveBeenCalled();
  });
});

// ── IPC rejection errors ──────────────────────────────────────────────────────

describe('App — IPC rejection errors', () => {
  it('shows error status when createGame rejects', async () => {
    const user = userEvent.setup();
    mockMafia.createGame.mockRejectedValue(new Error('Server unavailable'));
    render(<App />);
    await user.type(screen.getByPlaceholderText('Enter your name'), 'Alice');
    await user.click(screen.getByRole('button', { name: 'Create Game' }));
    expect(await screen.findByText(/Error: Server unavailable/)).toBeInTheDocument();
  });

  it('shows error status when joinGame rejects', async () => {
    const user = userEvent.setup();
    mockMafia.joinGame.mockRejectedValue(new Error('Game not found'));
    render(<App />);
    // Switch to join tab
    await user.click(screen.getByRole('button', { name: 'Join Game' }));
    await user.type(screen.getByPlaceholderText('Enter your name'), 'Alice');
    await user.type(screen.getByPlaceholderText('Enter game code'), 'abc123');
    await user.click(document.querySelector('.btn-full'));
    expect(await screen.findByText(/Error: Game not found/)).toBeInTheDocument();
  });

  it('shows error status when joinAsSpectator rejects', async () => {
    const user = userEvent.setup();
    mockMafia.joinAsSpectator.mockRejectedValue(new Error('Game is full'));
    render(<App />);
    // Switch to join tab which also exposes spectate
    await user.click(screen.getByRole('button', { name: 'Join Game' }));
    await user.type(screen.getByPlaceholderText('Enter your name'), 'Alice');
    await user.type(screen.getByPlaceholderText('Enter game code'), 'abc123');
    await user.click(screen.getByRole('button', { name: 'Spectate' }));
    expect(await screen.findByText(/Error: Game is full/)).toBeInTheDocument();
  });

  it('shows error status when listGames rejects', async () => {
    const user = userEvent.setup();
    mockMafia.listGames.mockRejectedValue(new Error('Network error'));
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Browse Waiting Games' }));
    expect(await screen.findByText(/Error: Network error/)).toBeInTheDocument();
  });
});

// ── WebSocket event errors ────────────────────────────────────────────────────

describe('App — WebSocket event errors', () => {
  it('shows error status when onServerError fires', () => {
    render(<App />);
    const cb = mockMafia.onServerError.mock.calls[0][0];
    act(() => cb({ message: 'Something went wrong' }));
    expect(screen.getByText(/Server error: Something went wrong/)).toBeInTheDocument();
  });

  it('shows error status when onServerError fires with no message', () => {
    render(<App />);
    const cb = mockMafia.onServerError.mock.calls[0][0];
    act(() => cb({}));
    expect(screen.getByText(/Server error: unknown/)).toBeInTheDocument();
  });

  it('shows reconnecting status on first reconnect attempt', () => {
    render(<App />);
    const cb = mockMafia.onReconnecting.mock.calls[0][0];
    act(() => cb({ attempt: 1, maxAttempts: 3 }));
    expect(screen.getByText(/reconnecting \(attempt 1 of 3\)/i)).toBeInTheDocument();
  });

  it('shows reconnecting status on final reconnect attempt', () => {
    render(<App />);
    const cb = mockMafia.onReconnecting.mock.calls[0][0];
    act(() => cb({ attempt: 3, maxAttempts: 3 }));
    expect(screen.getByText(/reconnecting \(attempt 3 of 3\)/i)).toBeInTheDocument();
  });

  it('shows disconnected status when onDisconnected fires', () => {
    render(<App />);
    const cb = mockMafia.onDisconnected.mock.calls[0][0];
    act(() => cb());
    expect(screen.getByText(/Connection lost/i)).toBeInTheDocument();
  });

  it('resets to entry screen when onDisconnected fires mid-game', async () => {
    const user = userEvent.setup();
    mockMafia.createGame.mockResolvedValue({
      playerId: 'p1',
      gameId: 'game-1',
      state: makeLobbyState()
    });

    render(<App />);
    await user.type(screen.getByPlaceholderText('Enter your name'), 'Alice');
    await user.click(screen.getByRole('button', { name: 'Create Game' }));

    // Confirm we're in the lobby
    expect(await screen.findByText('Lobby')).toBeInTheDocument();

    // Fire disconnect
    const cb = mockMafia.onDisconnected.mock.calls[0][0];
    act(() => cb());

    // Entry screen should be visible again
    expect(screen.getByRole('button', { name: 'Create Game' })).toBeInTheDocument();
    expect(screen.queryByText('Lobby')).not.toBeInTheDocument();
  });
});

import '@testing-library/jest-dom';
import { act, render, screen, within } from '@testing-library/react';
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
  listGames: jest.fn(),
  getState: jest.fn(),
  markReady: jest.fn(),
  markUnready: jest.fn(),
  startGame: jest.fn(),
  castVote: jest.fn(),
  nightAction: jest.fn(),
  resolveVotes: jest.fn(),
  resolveNight: jest.fn(),
  leaveGame: jest.fn(),
  leaveSpectator: jest.fn(),
  onNightActionSubmitted: jest.fn(),
  disconnect: jest.fn()
};

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

// ── Entry screen rendering ────────────────────────────────────────────────────

describe('App — entry screen', () => {
  it('shows New Game and Join Game tabs', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'New Game' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join Game' })).toBeInTheDocument();
  });

  it('New Game tab is active by default', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'New Game' })).toHaveClass('active');
    expect(screen.getByRole('button', { name: 'Join Game' })).not.toHaveClass('active');
  });

  it('shows Your Name input', () => {
    render(<App />);
    expect(screen.getByPlaceholderText('Enter your name')).toBeInTheDocument();
  });

  it('does not show Game Code input in New Game mode', () => {
    render(<App />);
    expect(screen.queryByPlaceholderText('Enter game code')).not.toBeInTheDocument();
  });

  it('shows Create Game button in New Game mode', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Create Game' })).toBeInTheDocument();
  });

  it('shows Browse Waiting Games button in New Game mode', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Browse Waiting Games' })).toBeInTheDocument();
  });
});

// ── Tab switching ─────────────────────────────────────────────────────────────

describe('App — tab switching', () => {
  it('switching to Join Game tab shows Game Code input', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Join Game' }));
    expect(screen.getByPlaceholderText('Enter game code')).toBeInTheDocument();
  });

  it('switching to Join Game tab activates Join Game tab', async () => {
    const user = userEvent.setup();
    render(<App />);
    const tabs = document.querySelector('.mode-tabs');
    await user.click(within(tabs).getByRole('button', { name: 'Join Game' }));
    expect(within(tabs).getByRole('button', { name: 'Join Game' })).toHaveClass('active');
    expect(within(tabs).getByRole('button', { name: 'New Game' })).not.toHaveClass('active');
  });

  it('switching to Join Game tab shows Join Game action button', async () => {
    const user = userEvent.setup();
    render(<App />);
    const tabs = document.querySelector('.mode-tabs');
    await user.click(within(tabs).getByRole('button', { name: 'Join Game' }));
    // The full-width action button (btn-full) should now read "Join Game"
    expect(document.querySelector('.btn-full')).toHaveTextContent('Join Game');
  });

  it('switching to Join Game tab hides Browse Waiting Games button', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Join Game' }));
    expect(screen.queryByRole('button', { name: 'Browse Waiting Games' })).not.toBeInTheDocument();
  });

  it('switching back to New Game tab hides Game Code input', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Join Game' }));
    await user.click(screen.getByRole('button', { name: 'New Game' }));
    expect(screen.queryByPlaceholderText('Enter game code')).not.toBeInTheDocument();
  });
});

// ── Deep link handling ────────────────────────────────────────────────────────

describe('App — deep link handling', () => {
  it('registers a deep link handler on mount', () => {
    render(<App />);
    expect(mockMafia.onDeepLink).toHaveBeenCalledTimes(1);
  });

  it('switches to join mode and populates game code on deep link', async () => {
    render(<App />);

    // Retrieve and invoke the registered deep link callback inside act()
    // so React processes all resulting state updates synchronously
    const deepLinkCallback = mockMafia.onDeepLink.mock.calls[0][0];
    act(() => deepLinkCallback({ gameId: 'test-game-id', serverUrl: 'http://localhost:3000' }));

    expect(screen.getByPlaceholderText('Enter game code')).toHaveValue('test-game-id');
    // Use within(.mode-tabs) to avoid ambiguity with the "Join Game" action button
    const tabs = document.querySelector('.mode-tabs');
    expect(within(tabs).getByRole('button', { name: 'Join Game' })).toHaveClass('active');
  });

  it('shows a status message on deep link', () => {
    render(<App />);
    const deepLinkCallback = mockMafia.onDeepLink.mock.calls[0][0];
    act(() => deepLinkCallback({ gameId: 'abc123' }));
    expect(screen.getByText(/Join link loaded for game abc123/)).toBeInTheDocument();
  });
});

// ── Game settings form ────────────────────────────────────────────────────────

describe('App — game settings', () => {
  it('shows Game Settings section in New Game mode', () => {
    render(<App />);
    expect(screen.getByText('Game Settings')).toBeInTheDocument();
  });

  it('does not show Game Settings section in Join Game mode', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Join Game' }));
    expect(screen.queryByText('Game Settings')).not.toBeInTheDocument();
  });

  it('min players input has default value of 4', () => {
    render(<App />);
    const details = screen.getByText('Game Settings').closest('details');
    details.open = true;
    expect(within(details).getByDisplayValue('4')).toBeInTheDocument();
  });

  it('max players input has default value of 12', () => {
    render(<App />);
    const details = screen.getByText('Game Settings').closest('details');
    details.open = true;
    expect(within(details).getByDisplayValue('12')).toBeInTheDocument();
  });

  it('Doctor role checkbox is checked by default', () => {
    render(<App />);
    const details = screen.getByText('Game Settings').closest('details');
    details.open = true;
    expect(within(details).getByLabelText('Doctor role')).toBeChecked();
  });

  it('Sheriff role checkbox is checked by default', () => {
    render(<App />);
    const details = screen.getByText('Game Settings').closest('details');
    details.open = true;
    expect(within(details).getByLabelText('Sheriff role')).toBeChecked();
  });

  it('passes settings to createGame when creating a game', async () => {
    const user = userEvent.setup();
    mockMafia.createGame.mockResolvedValue({
      playerId: 'p1',
      gameId: 'g1',
      state: { id: 'g1', phase: 'lobby', status: 'waiting', players: [], hostId: 'p1', settings: {}, readyCount: 0 }
    });

    render(<App />);

    const details = screen.getByText('Game Settings').closest('details');
    details.open = true;

    // Change min players to 6
    const minInput = within(details).getByDisplayValue('4');
    await user.clear(minInput);
    await user.type(minInput, '6');

    // Uncheck Doctor role
    await user.click(within(details).getByLabelText('Doctor role'));

    await user.type(screen.getByPlaceholderText('Enter your name'), 'Alice');
    await user.click(screen.getByRole('button', { name: 'Create Game' }));

    expect(mockMafia.createGame).toHaveBeenCalledWith(
      'http://localhost:3000',
      'Alice',
      expect.objectContaining({ minPlayers: 6, hasDoctor: false })
    );
  });
});

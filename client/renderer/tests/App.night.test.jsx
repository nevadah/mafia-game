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
  disconnect: jest.fn()
};

const BASE_SETTINGS = {
  minPlayers: 4,
  maxPlayers: 12,
  mafiaRatio: 0.25,
  hasDoctor: true,
  hasSheriff: true
};

const ALL_PLAYERS = [
  { id: 'p1', name: 'Alice',  isAlive: true,  isReady: true, isConnected: true },
  { id: 'p2', name: 'Bob',    isAlive: true,  isReady: true, isConnected: true },
  { id: 'p3', name: 'Carol',  isAlive: true,  isReady: true, isConnected: true },
  { id: 'p4', name: 'Dave',   isAlive: true,  isReady: true, isConnected: true },
  { id: 'p5', name: 'Eve',    isAlive: false, isReady: true, isConnected: false }
];

function makeNightState({ myRole = 'mafia', investigatedThisRound = null, overrides = {} } = {}) {
  return {
    id: 'game-1',
    phase: 'night',
    status: 'active',
    round: 0,
    hostId: 'p1',
    players: ALL_PLAYERS.map((p) => ({
      ...p,
      role: p.id === 'p1' ? myRole : undefined
    })),
    votes: {},
    nightActions: {},
    investigatedThisRound,
    eliminatedThisRound: undefined,
    settings: BASE_SETTINGS,
    readyCount: 4,
    ...overrides
  };
}

// Renders the app and simulates entering the night phase as player p1 (Alice, host)
async function enterNightPhase(user, state) {
  mockMafia.createGame.mockResolvedValue({ playerId: 'p1', gameId: 'game-1', state });
  render(<App />);
  await user.type(screen.getByPlaceholderText('Enter your name'), 'Alice');
  await user.click(screen.getByRole('button', { name: 'Create Game' }));
}

function getOnStateUpdate() {
  return mockMafia.onStateUpdate.mock.calls[0]?.[0];
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

// ── Phase header ──────────────────────────────────────────────────────────────

describe('App — night phase header', () => {
  it('shows "Night 1" (round 0 + 1)', async () => {
    const user = userEvent.setup();
    await enterNightPhase(user, makeNightState());
    expect(screen.getByText('Night 1')).toBeInTheDocument();
  });

  it('shows "Night 2" for round 1', async () => {
    const user = userEvent.setup();
    await enterNightPhase(user, makeNightState({ overrides: { round: 1 } }));
    expect(screen.getByText('Night 2')).toBeInTheDocument();
  });

  it("shows the player's name and role in the header", async () => {
    const user = userEvent.setup();
    await enterNightPhase(user, makeNightState({ myRole: 'mafia' }));
    const header = screen.getByText('Night 1').closest('.card');
    expect(within(header).getByText(/Alice/)).toBeInTheDocument();
    expect(within(header).getByText(/mafia/i)).toBeInTheDocument();
  });

  it('shows role-appropriate subtitle for mafia', async () => {
    const user = userEvent.setup();
    await enterNightPhase(user, makeNightState({ myRole: 'mafia' }));
    expect(screen.getByText(/Choose a target to eliminate/i)).toBeInTheDocument();
  });

  it('shows role-appropriate subtitle for doctor', async () => {
    const user = userEvent.setup();
    await enterNightPhase(user, makeNightState({ myRole: 'doctor' }));
    expect(screen.getByText(/Choose a player to protect/i)).toBeInTheDocument();
  });

  it('shows role-appropriate subtitle for sheriff', async () => {
    const user = userEvent.setup();
    await enterNightPhase(user, makeNightState({ myRole: 'sheriff' }));
    expect(screen.getByText(/Choose a player to investigate/i)).toBeInTheDocument();
  });

  it('shows waiting message for townsperson', async () => {
    const user = userEvent.setup();
    await enterNightPhase(user, makeNightState({ myRole: 'townsperson' }));
    expect(screen.getByText(/The town sleeps/i)).toBeInTheDocument();
  });
});

// ── Action target list ────────────────────────────────────────────────────────

describe('App — night phase action targets', () => {
  it('mafia sees action buttons for alive players (excluding self)', async () => {
    const user = userEvent.setup();
    await enterNightPhase(user, makeNightState({ myRole: 'mafia' }));
    const actionSection = screen.getByText(/Select a target to eliminate/i).closest('.card');
    const buttons = within(actionSection).getAllByRole('button', { name: /Eliminate/i });
    // 4 alive, minus self = 3 targets
    expect(buttons).toHaveLength(3);
  });

  it('mafia does not see self in the target list', async () => {
    const user = userEvent.setup();
    await enterNightPhase(user, makeNightState({ myRole: 'mafia' }));
    const actionSection = screen.getByText(/Select a target to eliminate/i).closest('.card');
    expect(within(actionSection).queryByText('Alice')).not.toBeInTheDocument();
  });

  it('doctor sees action buttons including self', async () => {
    const user = userEvent.setup();
    await enterNightPhase(user, makeNightState({ myRole: 'doctor' }));
    const actionSection = screen.getByText(/Select a player to protect/i).closest('.card');
    const buttons = within(actionSection).getAllByRole('button', { name: /Protect/i });
    // 4 alive players including self
    expect(buttons).toHaveLength(4);
  });

  it('sheriff sees action buttons excluding self', async () => {
    const user = userEvent.setup();
    await enterNightPhase(user, makeNightState({ myRole: 'sheriff' }));
    const actionSection = screen.getByText(/Select a player to investigate/i).closest('.card');
    const buttons = within(actionSection).getAllByRole('button', { name: /Investigate/i });
    // 4 alive, minus self = 3 targets
    expect(buttons).toHaveLength(3);
  });

  it('townsperson sees no action buttons', async () => {
    const user = userEvent.setup();
    await enterNightPhase(user, makeNightState({ myRole: 'townsperson' }));
    expect(screen.queryByRole('button', { name: /Eliminate|Protect|Investigate/i })).not.toBeInTheDocument();
  });

  it('dead players see no action buttons', async () => {
    const user = userEvent.setup();
    const state = makeNightState({
      myRole: 'mafia',
      overrides: {
        players: ALL_PLAYERS.map((p) => ({
          ...p,
          role: p.id === 'p1' ? 'mafia' : undefined,
          isAlive: false  // everyone dead (including p1)
        }))
      }
    });
    await enterNightPhase(user, state);
    expect(screen.queryByRole('button', { name: /Eliminate/i })).not.toBeInTheDocument();
  });
});

// ── Night action submission ───────────────────────────────────────────────────

describe('App — night action submission', () => {
  it('calls nightAction with the correct target id', async () => {
    const user = userEvent.setup();
    mockMafia.nightAction.mockResolvedValue({ state: makeNightState({ myRole: 'mafia' }) });
    await enterNightPhase(user, makeNightState({ myRole: 'mafia' }));

    const actionSection = screen.getByText(/Select a target to eliminate/i).closest('.card');
    const bobRow = within(actionSection).getByText('Bob').closest('.player');
    await user.click(within(bobRow).getByRole('button', { name: /Eliminate/i }));

    expect(mockMafia.nightAction).toHaveBeenCalledWith('p2');
  });

  it('hides action buttons and shows submitted message after submitting', async () => {
    const user = userEvent.setup();
    mockMafia.nightAction.mockResolvedValue({ state: makeNightState({ myRole: 'mafia' }) });
    await enterNightPhase(user, makeNightState({ myRole: 'mafia' }));

    const actionSection = screen.getByText(/Select a target to eliminate/i).closest('.card');
    const firstButton = within(actionSection).getAllByRole('button', { name: /Eliminate/i })[0];
    await user.click(firstButton);

    expect(screen.queryByRole('button', { name: /Eliminate/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Action submitted/i)).toBeInTheDocument();
  });

  it('resets submitted state when phase updates to a new night round', async () => {
    const user = userEvent.setup();
    mockMafia.nightAction.mockResolvedValue({ state: makeNightState({ myRole: 'mafia' }) });
    await enterNightPhase(user, makeNightState({ myRole: 'mafia' }));

    // Submit an action
    const actionSection = screen.getByText(/Select a target to eliminate/i).closest('.card');
    await user.click(within(actionSection).getAllByRole('button', { name: /Eliminate/i })[0]);
    expect(screen.getByText(/Action submitted/i)).toBeInTheDocument();

    // Simulate a new night (round 1) arriving via state update
    const onStateUpdate = getOnStateUpdate();
    act(() => onStateUpdate(makeNightState({ myRole: 'mafia', overrides: { round: 1 } })));

    // Buttons should be back
    expect(screen.queryByText(/Action submitted/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Eliminate/i }).length).toBeGreaterThan(0);
  });
});

// ── Players list ──────────────────────────────────────────────────────────────

describe('App — night phase players list', () => {
  it('shows alive players', async () => {
    const user = userEvent.setup();
    await enterNightPhase(user, makeNightState());
    const playersSection = screen.getByText('Players').closest('.card');
    expect(within(playersSection).getByText('Alice')).toBeInTheDocument();
    expect(within(playersSection).getByText('Bob')).toBeInTheDocument();
  });

  it('shows eliminated section for dead players', async () => {
    const user = userEvent.setup();
    await enterNightPhase(user, makeNightState());
    // 'Eliminated' is both a section heading and a badge — find the section heading
    const headings = screen.getAllByText('Eliminated');
    const elimSection = headings.find((el) => el.classList.contains('section-heading')).closest('.card');
    expect(within(elimSection).getByText('Eve')).toBeInTheDocument();
  });

  it('does not show dead players in alive players list', async () => {
    const user = userEvent.setup();
    await enterNightPhase(user, makeNightState());
    const playersSection = screen.getByText('Players').closest('.card');
    expect(within(playersSection).queryByText('Eve')).not.toBeInTheDocument();
  });
});

// ── Sheriff investigation result ──────────────────────────────────────────────

describe('App — sheriff investigation result', () => {
  it('shows previous investigation result for sheriff', async () => {
    const user = userEvent.setup();
    const state = makeNightState({
      myRole: 'sheriff',
      investigatedThisRound: { target: 'p2', result: 'mafia' }
    });
    await enterNightPhase(user, state);
    const investigationCard = screen.getByText(/Previous Investigation/i).closest('.card');
    expect(within(investigationCard).getByText(/Bob/)).toBeInTheDocument();
    expect(within(investigationCard).getByText(/Mafia/)).toBeInTheDocument();
  });

  it('shows "not Mafia" result for townsperson investigation', async () => {
    const user = userEvent.setup();
    const state = makeNightState({
      myRole: 'sheriff',
      investigatedThisRound: { target: 'p3', result: 'townsperson' }
    });
    await enterNightPhase(user, state);
    expect(screen.getByText(/not Mafia/i)).toBeInTheDocument();
  });

  it('does not show investigation section when result is null', async () => {
    const user = userEvent.setup();
    await enterNightPhase(user, makeNightState({ myRole: 'sheriff' }));
    expect(screen.queryByText(/Previous Investigation/i)).not.toBeInTheDocument();
  });

  it('does not show investigation section for non-sheriff roles', async () => {
    const user = userEvent.setup();
    const state = makeNightState({
      myRole: 'mafia',
      investigatedThisRound: { target: 'p2', result: 'mafia' }
    });
    await enterNightPhase(user, state);
    expect(screen.queryByText(/Previous Investigation/i)).not.toBeInTheDocument();
  });
});

// ── Host controls ─────────────────────────────────────────────────────────────

describe('App — night phase host controls', () => {
  it('shows Resolve Night button for host', async () => {
    const user = userEvent.setup();
    await enterNightPhase(user, makeNightState());
    expect(screen.getByRole('button', { name: /Resolve Night/i })).toBeInTheDocument();
  });

  it('does not show Resolve Night for non-host', async () => {
    const user = userEvent.setup();
    const state = makeNightState({
      overrides: { hostId: 'p2' }
    });
    await enterNightPhase(user, state);
    expect(screen.queryByRole('button', { name: /Resolve Night/i })).not.toBeInTheDocument();
  });

  it('calls resolveNight with force=false by default', async () => {
    const user = userEvent.setup();
    mockMafia.resolveNight.mockResolvedValue({ eliminated: null, winner: null, state: makeNightState() });
    await enterNightPhase(user, makeNightState());
    await user.click(screen.getByRole('button', { name: /Resolve Night/i }));
    expect(mockMafia.resolveNight).toHaveBeenCalledWith(false);
  });

  it('calls resolveNight with force=true when checkbox checked', async () => {
    const user = userEvent.setup();
    mockMafia.resolveNight.mockResolvedValue({ eliminated: null, winner: null, state: makeNightState() });
    await enterNightPhase(user, makeNightState());
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Resolve Night/i }));
    expect(mockMafia.resolveNight).toHaveBeenCalledWith(true);
  });
});

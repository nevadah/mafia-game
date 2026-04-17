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

const BASE_SETTINGS = {
  minPlayers: 4,
  maxPlayers: 12,
  mafiaRatio: 0.33,
  hasDoctor: true,
  hasSheriff: false
};

function makeDayState(overrides = {}) {
  return {
    id: 'game-1',
    phase: 'day',
    status: 'active',
    round: 1,
    hostId: 'p1',
    players: [
      { id: 'p1', name: 'Alice', role: 'townsperson', isAlive: true, isReady: true, isConnected: true },
      { id: 'p2', name: 'Bob',   role: undefined,     isAlive: true, isReady: true, isConnected: true },
      { id: 'p3', name: 'Carol', role: undefined,     isAlive: true, isReady: true, isConnected: true }
    ],
    votes: {},
    nightActions: {},
    eliminatedThisRound: undefined,
    doctorProtectedThisRound: null,
    investigatedThisRound: null,
    settings: BASE_SETTINGS,
    readyCount: 3,
    ...overrides
  };
}

async function enterDayPhase(user, state) {
  mockMafia.createGame.mockResolvedValue({ playerId: 'p1', gameId: 'game-1', state });
  render(<App />);
  await user.type(screen.getByPlaceholderText('Enter your name'), 'Alice');
  await user.click(screen.getByRole('button', { name: 'Create Game' }));
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

// ── Night summary modal visibility ────────────────────────────────────────────

describe('App — night summary modal', () => {
  it('shows the modal when entering day phase with round > 0', async () => {
    const user = userEvent.setup();
    await enterDayPhase(user, makeDayState({ round: 1 }));
    expect(document.querySelector('.night-summary-modal')).toBeInTheDocument();
  });

  it('does not show the modal when round is 0', async () => {
    const user = userEvent.setup();
    await enterDayPhase(user, makeDayState({ round: 0 }));
    expect(document.querySelector('.night-summary-modal')).not.toBeInTheDocument();
  });

  it('shows "no kill" message when no one was eliminated', async () => {
    const user = userEvent.setup();
    await enterDayPhase(user, makeDayState({ eliminatedThisRound: undefined }));
    const modal = document.querySelector('.night-summary-modal');
    expect(within(modal).getByText(/No one was eliminated tonight/i)).toBeInTheDocument();
  });

  it('shows eliminated player name when eliminatedThisRound is set', async () => {
    const user = userEvent.setup();
    const state = makeDayState({
      players: [
        { id: 'p1', name: 'Alice', role: 'townsperson', isAlive: true, isReady: true, isConnected: true },
        { id: 'p2', name: 'Bob',   role: undefined,     isAlive: false, isReady: true, isConnected: false }
      ],
      eliminatedThisRound: 'p2'
    });
    await enterDayPhase(user, state);
    const modal = document.querySelector('.night-summary-modal');
    expect(within(modal).getByText(/Bob/)).toBeInTheDocument();
    expect(within(modal).getByText(/eliminated by the Mafia/i)).toBeInTheDocument();
  });

  it('dismisses the modal when "Got it" is clicked', async () => {
    const user = userEvent.setup();
    await enterDayPhase(user, makeDayState());
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(document.querySelector('.night-summary-modal')).not.toBeInTheDocument();
  });

  it('shows doctor protection note for doctor role', async () => {
    const user = userEvent.setup();
    const state = makeDayState({
      players: [
        { id: 'p1', name: 'Alice', role: 'doctor',  isAlive: true, isReady: true, isConnected: true },
        { id: 'p2', name: 'Bob',   role: undefined, isAlive: true, isReady: true, isConnected: true }
      ],
      doctorProtectedThisRound: 'p2'
    });
    await enterDayPhase(user, state);
    const modal = document.querySelector('.night-summary-modal');
    expect(within(modal).getByText(/You protected Bob/i)).toBeInTheDocument();
  });

  it('does not show doctor note when doctorProtectedThisRound is null', async () => {
    const user = userEvent.setup();
    const state = makeDayState({
      players: [
        { id: 'p1', name: 'Alice', role: 'doctor',  isAlive: true, isReady: true, isConnected: true },
        { id: 'p2', name: 'Bob',   role: undefined, isAlive: true, isReady: true, isConnected: true }
      ],
      doctorProtectedThisRound: null
    });
    await enterDayPhase(user, state);
    const modal = document.querySelector('.night-summary-modal');
    expect(within(modal).queryByText(/You protected/i)).not.toBeInTheDocument();
  });

  it('does not show doctor note for non-doctor players', async () => {
    const user = userEvent.setup();
    await enterDayPhase(user, makeDayState({ doctorProtectedThisRound: 'p2' }));
    // p1 is townsperson
    const modal = document.querySelector('.night-summary-modal');
    expect(within(modal).queryByText(/You protected/i)).not.toBeInTheDocument();
  });

  it('does not show modal again for the same round after dismissal', async () => {
    const user = userEvent.setup();
    await enterDayPhase(user, makeDayState({ round: 1 }));
    await user.click(screen.getByRole('button', { name: 'Got it' }));

    // Simulate a state update with the same round
    const sameRoundState = makeDayState({ round: 1, votes: { p2: 'p3' } });
    const stateUpdateCallback = mockMafia.onStateUpdate.mock.calls[0][0];
    act(() => stateUpdateCallback(sameRoundState));

    expect(document.querySelector('.night-summary-modal')).not.toBeInTheDocument();
  });

  it('shows modal again when a new round starts', async () => {
    const user = userEvent.setup();
    await enterDayPhase(user, makeDayState({ round: 1 }));
    await user.click(screen.getByRole('button', { name: 'Got it' }));

    // Simulate advancing to round 2
    const nextRoundState = makeDayState({ round: 2 });
    const stateUpdateCallback = mockMafia.onStateUpdate.mock.calls[0][0];
    act(() => stateUpdateCallback(nextRoundState));

    expect(document.querySelector('.night-summary-modal')).toBeInTheDocument();
  });
});

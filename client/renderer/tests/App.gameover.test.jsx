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
  sendChat: jest.fn(),
  leaveGame: jest.fn(),
  disconnect: jest.fn()
};

const BASE_SETTINGS = {
  minPlayers: 4, maxPlayers: 12, mafiaRatio: 0.25, hasDoctor: true, hasSheriff: true
};

function makeEndedState(overrides = {}) {
  return {
    id: 'game-1',
    phase: 'ended',
    status: 'ended',
    round: 3,
    hostId: 'p1',
    winner: 'town',
    players: [
      { id: 'p1', name: 'Alice', role: 'townsperson', isAlive: true,  isReady: true, isConnected: true },
      { id: 'p2', name: 'Bob',   role: 'mafia',       isAlive: false, isReady: true, isConnected: true },
      { id: 'p3', name: 'Carol', role: 'doctor',      isAlive: true,  isReady: true, isConnected: true },
      { id: 'p4', name: 'Dave',  role: 'townsperson', isAlive: false, isReady: true, isConnected: false }
    ],
    votes: {},
    nightActions: {},
    settings: BASE_SETTINGS,
    readyCount: 4,
    messages: [],
    eliminations: [
      { playerId: 'p4', playerName: 'Dave',  role: 'townsperson', by: 'mafia', round: 1 },
      { playerId: 'p2', playerName: 'Bob',   role: 'mafia',       by: 'town',  round: 2 }
    ],
    ...overrides
  };
}

async function enterGameOver(user, state) {
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
      matches: false, media: query, onchange: null,
      addListener: jest.fn(), removeListener: jest.fn(),
      addEventListener: jest.fn(), removeEventListener: jest.fn(),
      dispatchEvent: jest.fn()
    }))
  });
  jest.clearAllMocks();
});

// ── Winner banner ─────────────────────────────────────────────────────────────

describe('App — game over banner', () => {
  it('shows "Town wins!" when town wins', async () => {
    const user = userEvent.setup();
    await enterGameOver(user, makeEndedState({ winner: 'town' }));
    expect(screen.getByText('Town wins!')).toBeInTheDocument();
  });

  it('shows "Mafia wins!" when mafia wins', async () => {
    const user = userEvent.setup();
    await enterGameOver(user, makeEndedState({ winner: 'mafia' }));
    expect(screen.getByText('Mafia wins!')).toBeInTheDocument();
  });

  it('shows town win condition text when town wins', async () => {
    const user = userEvent.setup();
    await enterGameOver(user, makeEndedState({ winner: 'town' }));
    expect(screen.getByText('All Mafia members were eliminated.')).toBeInTheDocument();
  });

  it('shows mafia win condition text when mafia wins', async () => {
    const user = userEvent.setup();
    await enterGameOver(user, makeEndedState({ winner: 'mafia' }));
    expect(screen.getByText('Mafia gained control of the town.')).toBeInTheDocument();
  });

  it('shows "You won!" for a town player when town wins', async () => {
    const user = userEvent.setup();
    // Alice is townsperson (p1), town wins
    await enterGameOver(user, makeEndedState({ winner: 'town' }));
    expect(screen.getByText('You won!')).toBeInTheDocument();
  });

  it('shows "You lost." for a town player when mafia wins', async () => {
    const user = userEvent.setup();
    await enterGameOver(user, makeEndedState({ winner: 'mafia' }));
    expect(screen.getByText('You lost.')).toBeInTheDocument();
  });

  it('shows "You won!" for a mafia player when mafia wins', async () => {
    const user = userEvent.setup();
    const state = makeEndedState({
      winner: 'mafia',
      players: [
        { id: 'p1', name: 'Alice', role: 'mafia',       isAlive: true,  isReady: true, isConnected: true },
        { id: 'p2', name: 'Bob',   role: 'townsperson', isAlive: false, isReady: true, isConnected: true }
      ]
    });
    await enterGameOver(user, state);
    expect(screen.getByText('You won!')).toBeInTheDocument();
  });
});

// ── Game recap stats ──────────────────────────────────────────────────────────

describe('App — game over recap stats', () => {
  it('shows the Game Recap heading', async () => {
    const user = userEvent.setup();
    await enterGameOver(user, makeEndedState());
    expect(screen.getByText('Game Recap')).toBeInTheDocument();
  });

  it('shows the correct round count', async () => {
    const user = userEvent.setup();
    await enterGameOver(user, makeEndedState({ round: 3 }));
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('3 rounds')).toBeInTheDocument();
  });

  it('shows singular "1 round" label', async () => {
    const user = userEvent.setup();
    await enterGameOver(user, makeEndedState({ round: 1 }));
    expect(screen.getByText('1 round')).toBeInTheDocument();
  });

  it('shows correct night kill count', async () => {
    const user = userEvent.setup();
    // default state has 1 mafia elimination (Dave, by mafia)
    await enterGameOver(user, makeEndedState());
    expect(screen.getByText('1 night kill')).toBeInTheDocument();
  });

  it('shows correct day elimination count', async () => {
    const user = userEvent.setup();
    // default state has 1 town elimination (Bob, by town)
    await enterGameOver(user, makeEndedState());
    expect(screen.getByText('1 voted out')).toBeInTheDocument();
  });

  it('shows town accuracy when there were day eliminations', async () => {
    const user = userEvent.setup();
    // 1 of 1 day votes was correct (Bob is mafia)
    await enterGameOver(user, makeEndedState());
    expect(screen.getByText('Town accuracy: 1/1')).toBeInTheDocument();
  });

  it('hides town accuracy when there were no day eliminations', async () => {
    const user = userEvent.setup();
    const state = makeEndedState({
      eliminations: [
        { playerId: 'p4', playerName: 'Dave', role: 'townsperson', by: 'mafia', round: 1 }
      ]
    });
    await enterGameOver(user, state);
    expect(screen.queryByText(/Town accuracy/i)).not.toBeInTheDocument();
  });
});

// ── Final standings ───────────────────────────────────────────────────────────

describe('App — game over final standings', () => {
  it('shows Final Standings heading', async () => {
    const user = userEvent.setup();
    await enterGameOver(user, makeEndedState());
    expect(screen.getByText('Final Standings')).toBeInTheDocument();
  });

  it('shows all players in standings', async () => {
    const user = userEvent.setup();
    await enterGameOver(user, makeEndedState());
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Carol')).toBeInTheDocument();
    expect(screen.getByText('Dave')).toBeInTheDocument();
  });

  it('shows revealed roles for all players', async () => {
    const user = userEvent.setup();
    await enterGameOver(user, makeEndedState());
    const standings = document.querySelector('.players');
    expect(within(standings).getByText('mafia')).toBeInTheDocument();
    expect(within(standings).getByText('doctor')).toBeInTheDocument();
  });

  it('shows Survived badge for alive players', async () => {
    const user = userEvent.setup();
    await enterGameOver(user, makeEndedState());
    const aliceCard = screen.getByText('Alice').closest('.player');
    expect(within(aliceCard).getByText('Survived')).toBeInTheDocument();
  });

  it('shows Eliminated badge for dead players', async () => {
    const user = userEvent.setup();
    await enterGameOver(user, makeEndedState());
    const bobCard = screen.getByText('Bob').closest('.player');
    expect(within(bobCard).getByText('Eliminated')).toBeInTheDocument();
  });

  it('shows You badge for the current player', async () => {
    const user = userEvent.setup();
    await enterGameOver(user, makeEndedState());
    const aliceCard = screen.getByText('Alice').closest('.player');
    expect(within(aliceCard).getByText('You')).toBeInTheDocument();
  });
});

// ── Back to menu ──────────────────────────────────────────────────────────────

describe('App — game over back to menu', () => {
  it('shows Back to Menu button', async () => {
    const user = userEvent.setup();
    await enterGameOver(user, makeEndedState());
    expect(screen.getByRole('button', { name: 'Back to Menu' })).toBeInTheDocument();
  });

  it('returns to entry screen when Back to Menu is clicked', async () => {
    const user = userEvent.setup();
    await enterGameOver(user, makeEndedState());
    await user.click(screen.getByRole('button', { name: 'Back to Menu' }));
    expect(screen.getByPlaceholderText('Enter your name')).toBeInTheDocument();
  });
});

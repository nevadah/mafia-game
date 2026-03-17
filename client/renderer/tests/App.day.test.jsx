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
  mafiaRatio: 0.33,
  hasDoctor: true,
  hasSheriff: false
};

function makeDayState(overrides = {}) {
  return {
    id: 'game-1',
    phase: 'day',
    status: 'active',
    round: 2,
    hostId: 'p1',
    players: [
      { id: 'p1', name: 'Alice', role: 'townsperson', isAlive: true, isReady: true, isConnected: true },
      { id: 'p2', name: 'Bob',   role: undefined,     isAlive: true, isReady: true, isConnected: true },
      { id: 'p3', name: 'Carol', role: undefined,     isAlive: true, isReady: true, isConnected: true },
      { id: 'p4', name: 'Dave',  role: undefined,     isAlive: false, isReady: true, isConnected: false }
    ],
    votes: {},
    nightActions: {},
    eliminatedThisRound: undefined,
    settings: BASE_SETTINGS,
    readyCount: 3,
    ...overrides
  };
}

// Renders the app and simulates entering the day phase as player p1 (Alice, host)
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

// ── Phase header ──────────────────────────────────────────────────────────────

describe('App — day phase header', () => {
  it('shows "Day 2" heading with round number', async () => {
    const user = userEvent.setup();
    await enterDayPhase(user, makeDayState());
    expect(screen.getByText('Day 2')).toBeInTheDocument();
  });

  it('shows discussion subtitle', async () => {
    const user = userEvent.setup();
    await enterDayPhase(user, makeDayState());
    expect(screen.getByText(/Discuss and vote to eliminate/i)).toBeInTheDocument();
  });

  it("shows the current player's name and role in the header", async () => {
    const user = userEvent.setup();
    await enterDayPhase(user, makeDayState());
    const meta = document.querySelector('.meta');
    expect(meta).toHaveTextContent('Playing as');
    expect(meta).toHaveTextContent('Alice');
    expect(meta).toHaveTextContent('townsperson');
  });
});

// ── Voting grid ───────────────────────────────────────────────────────────────

describe('App — day phase voting grid', () => {
  it('shows alive players in the voting grid', async () => {
    const user = userEvent.setup();
    await enterDayPhase(user, makeDayState());
    const grid = document.querySelector('.players');
    expect(within(grid).getByText('Alice')).toBeInTheDocument();
    expect(within(grid).getByText('Bob')).toBeInTheDocument();
    expect(within(grid).getByText('Carol')).toBeInTheDocument();
  });

  it('shows Vote button for alive opponents when no vote cast yet', async () => {
    const user = userEvent.setup();
    await enterDayPhase(user, makeDayState());
    // Alice (self) gets no Vote button; Bob and Carol do
    const voteButtons = screen.getAllByRole('button', { name: 'Vote' });
    expect(voteButtons).toHaveLength(2);
  });

  it('does not show a Vote button for self', async () => {
    const user = userEvent.setup();
    await enterDayPhase(user, makeDayState());
    // Find Alice's card via the player-name element inside the players grid
    const grid = document.querySelector('.players');
    const aliceCard = within(grid).getByText('Alice').closest('.player');
    expect(within(aliceCard).queryByRole('button', { name: 'Vote' })).not.toBeInTheDocument();
  });

  it('hides all Vote buttons after the local player has voted', async () => {
    const user = userEvent.setup();
    const stateWithMyVote = makeDayState({ votes: { p1: 'p2' } });
    await enterDayPhase(user, stateWithMyVote);
    expect(screen.queryByRole('button', { name: 'Vote' })).not.toBeInTheDocument();
  });

  it('shows "Your vote" badge on the player voted for', async () => {
    const user = userEvent.setup();
    await enterDayPhase(user, makeDayState({ votes: { p1: 'p2' } }));
    const bobCard = screen.getByText('Bob').closest('.player');
    expect(within(bobCard).getByText('Your vote')).toBeInTheDocument();
  });

  it('shows vote count badge on players with votes against them', async () => {
    const user = userEvent.setup();
    // p1 and p2 both vote for p3
    await enterDayPhase(user, makeDayState({ votes: { p1: 'p3', p2: 'p3' } }));
    const carolCard = screen.getByText('Carol').closest('.player');
    expect(within(carolCard).getByText('2 votes')).toBeInTheDocument();
  });

  it('shows singular "1 vote" when only one vote cast', async () => {
    const user = userEvent.setup();
    await enterDayPhase(user, makeDayState({ votes: { p1: 'p2' } }));
    const bobCard = screen.getByText('Bob').closest('.player');
    expect(within(bobCard).getByText('1 vote')).toBeInTheDocument();
  });

  it('calls castVote with the correct player id when Vote is clicked', async () => {
    const user = userEvent.setup();
    mockMafia.castVote.mockResolvedValue({});
    await enterDayPhase(user, makeDayState());
    const bobCard = screen.getByText('Bob').closest('.player');
    await user.click(within(bobCard).getByRole('button', { name: 'Vote' }));
    expect(mockMafia.castVote).toHaveBeenCalledWith('p2');
  });
});

// ── Pending voters ────────────────────────────────────────────────────────────

describe('App — day phase pending voters', () => {
  it('shows pending voters when some alive players have not yet voted', async () => {
    const user = userEvent.setup();
    await enterDayPhase(user, makeDayState({ votes: { p1: 'p2' } }));
    // Bob (p2) and Carol (p3) haven't voted
    const hint = document.querySelector('.lobby-hint');
    expect(hint).toHaveTextContent('Waiting to vote:');
    expect(hint).toHaveTextContent('Bob');
    expect(hint).toHaveTextContent('Carol');
  });

  it('hides pending voters hint when all alive players have voted', async () => {
    const user = userEvent.setup();
    // All three alive players have voted
    await enterDayPhase(user, makeDayState({ votes: { p1: 'p2', p2: 'p3', p3: 'p1' } }));
    expect(screen.queryByText(/Waiting to vote:/)).not.toBeInTheDocument();
  });
});

// ── Host controls ─────────────────────────────────────────────────────────────

describe('App — day phase host controls', () => {
  it('shows Resolve Day button for the host', async () => {
    const user = userEvent.setup();
    await enterDayPhase(user, makeDayState());
    expect(screen.getByRole('button', { name: 'Resolve Day' })).toBeInTheDocument();
  });

  it('does not show Resolve Day button for a non-host player', async () => {
    const user = userEvent.setup();
    // Join as p2 (non-host)
    const state = makeDayState();
    mockMafia.joinGame.mockResolvedValue({ playerId: 'p2', gameId: 'game-1', state });
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Join Game' }));
    await user.type(screen.getByPlaceholderText('Enter your name'), 'Bob');
    await user.type(screen.getByPlaceholderText('Enter game code'), 'game-1');
    await user.click(document.querySelector('.btn-full'));
    expect(screen.queryByRole('button', { name: 'Resolve Day' })).not.toBeInTheDocument();
  });

  it('calls resolveVotes when Resolve Day is clicked', async () => {
    const user = userEvent.setup();
    mockMafia.resolveVotes.mockResolvedValue({});
    await enterDayPhase(user, makeDayState());
    await user.click(screen.getByRole('button', { name: 'Resolve Day' }));
    expect(mockMafia.resolveVotes).toHaveBeenCalledWith(false);
  });

  it('calls resolveVotes with force=true when Force resolve is checked', async () => {
    const user = userEvent.setup();
    mockMafia.resolveVotes.mockResolvedValue({});
    await enterDayPhase(user, makeDayState());
    await user.click(screen.getByRole('checkbox', { name: /Force resolve/i }));
    await user.click(screen.getByRole('button', { name: 'Resolve Day' }));
    expect(mockMafia.resolveVotes).toHaveBeenCalledWith(true);
  });
});

// ── Eliminated players ────────────────────────────────────────────────────────

describe('App — day phase eliminated players', () => {
  it('shows the Eliminated section when dead players exist', async () => {
    const user = userEvent.setup();
    await enterDayPhase(user, makeDayState()); // Dave (p4) is dead
    // Both the section heading and Dave's badge use "Eliminated"
    expect(screen.getAllByText('Eliminated').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Dave')).toBeInTheDocument();
  });

  it('hides the Eliminated section when all players are alive', async () => {
    const user = userEvent.setup();
    const allAlive = makeDayState({
      players: [
        { id: 'p1', name: 'Alice', role: 'townsperson', isAlive: true, isReady: true, isConnected: true },
        { id: 'p2', name: 'Bob',   role: undefined,     isAlive: true, isReady: true, isConnected: true },
        { id: 'p3', name: 'Carol', role: undefined,     isAlive: true, isReady: true, isConnected: true }
      ]
    });
    await enterDayPhase(user, allAlive);
    expect(screen.queryByText('Eliminated')).not.toBeInTheDocument();
  });
});

// ── Sheriff investigation result (night summary modal) ───────────────────────

describe('App — day phase sheriff investigation result (night summary modal)', () => {
  it('shows investigation result for sheriff in the night summary modal', async () => {
    const user = userEvent.setup();
    const state = makeDayState({
      players: [
        { id: 'p1', name: 'Alice', role: 'sheriff', isAlive: true, isReady: true, isConnected: true },
        { id: 'p2', name: 'Bob',   role: undefined,  isAlive: true, isReady: true, isConnected: true },
        { id: 'p3', name: 'Carol', role: undefined,  isAlive: true, isReady: true, isConnected: true }
      ],
      investigatedThisRound: { target: 'p2', result: 'mafia' }
    });
    await enterDayPhase(user, state);
    const modal = document.querySelector('.night-summary-modal');
    expect(within(modal).getByText(/Bob/)).toBeInTheDocument();
    expect(within(modal).getByText(/Mafia/)).toBeInTheDocument();
  });

  it('shows "not Mafia" result in night summary modal', async () => {
    const user = userEvent.setup();
    const state = makeDayState({
      players: [
        { id: 'p1', name: 'Alice', role: 'sheriff', isAlive: true, isReady: true, isConnected: true },
        { id: 'p2', name: 'Bob',   role: undefined,  isAlive: true, isReady: true, isConnected: true },
        { id: 'p3', name: 'Carol', role: undefined,  isAlive: true, isReady: true, isConnected: true }
      ],
      investigatedThisRound: { target: 'p3', result: 'townsperson' }
    });
    await enterDayPhase(user, state);
    const modal = document.querySelector('.night-summary-modal');
    expect(within(modal).getByText(/not Mafia/i)).toBeInTheDocument();
  });

  it('does not show investigation note when investigatedThisRound is null', async () => {
    const user = userEvent.setup();
    await enterDayPhase(user, makeDayState({ investigatedThisRound: null }));
    const modal = document.querySelector('.night-summary-modal');
    expect(within(modal).queryByText(/You investigated/i)).not.toBeInTheDocument();
  });

  it('does not show investigation note for non-sheriff players', async () => {
    const user = userEvent.setup();
    const state = makeDayState({
      investigatedThisRound: { target: 'p2', result: 'mafia' }
    });
    // p1 is 'townsperson' in makeDayState
    await enterDayPhase(user, state);
    const modal = document.querySelector('.night-summary-modal');
    expect(within(modal).queryByText(/You investigated/i)).not.toBeInTheDocument();
  });
});

// ── State update ──────────────────────────────────────────────────────────────

describe('App — day phase state updates', () => {
  it('updates the vote display when a state_update event arrives', async () => {
    const user = userEvent.setup();
    await enterDayPhase(user, makeDayState());

    // Bob initially has no votes; simulate a state update where p2 voted for Bob (p2)
    const updatedState = makeDayState({ votes: { p2: 'p2' } });
    const stateUpdateCallback = mockMafia.onStateUpdate.mock.calls[0][0];
    act(() => stateUpdateCallback(updatedState));

    const bobCard = screen.getByText('Bob').closest('.player');
    expect(within(bobCard).getByText('1 vote')).toBeInTheDocument();
  });
});

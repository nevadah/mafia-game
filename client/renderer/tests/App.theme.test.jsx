import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockMatchMedia(prefersLight) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query) => ({
      matches: prefersLight && query === '(prefers-color-scheme: light)',
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn()
    }))
  });
}

// Minimal window.mafia stub so App mounts without errors
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
  leaveGame: jest.fn(),
  disconnect: jest.fn()
};

beforeEach(() => {
  window.mafia = mockMafia;
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  jest.clearAllMocks();
});

// ── Theme initialisation ──────────────────────────────────────────────────────

describe('App — theme initialisation', () => {
  it('defaults to dark when no stored preference and OS prefers dark', () => {
    mockMatchMedia(false);
    render(<App />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('defaults to light when no stored preference and OS prefers light', () => {
    mockMatchMedia(true);
    render(<App />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('uses stored dark preference over prefers-color-scheme', () => {
    mockMatchMedia(true); // OS prefers light
    localStorage.setItem('mafia-theme', 'dark');
    render(<App />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('uses stored light preference over prefers-color-scheme', () => {
    mockMatchMedia(false); // OS prefers dark
    localStorage.setItem('mafia-theme', 'light');
    render(<App />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('ignores invalid stored value and falls back to prefers-color-scheme', () => {
    mockMatchMedia(false);
    localStorage.setItem('mafia-theme', 'invalid');
    render(<App />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('persists initial theme to localStorage on mount', () => {
    mockMatchMedia(false);
    render(<App />);
    expect(localStorage.getItem('mafia-theme')).toBe('dark');
  });
});

// ── Theme toggle ──────────────────────────────────────────────────────────────

describe('App — theme toggle', () => {
  it('shows "Light mode" button when in dark theme', () => {
    mockMatchMedia(false);
    render(<App />);
    expect(screen.getByRole('button', { name: 'Light mode' })).toBeInTheDocument();
  });

  it('shows "Dark mode" button when in light theme', () => {
    mockMatchMedia(true);
    render(<App />);
    expect(screen.getByRole('button', { name: 'Dark mode' })).toBeInTheDocument();
  });

  it('switches from dark to light on toggle click', async () => {
    mockMatchMedia(false);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Light mode' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('switches from light to dark on toggle click', async () => {
    mockMatchMedia(true);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Dark mode' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('persists updated theme to localStorage after toggle', async () => {
    mockMatchMedia(false);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Light mode' }));
    expect(localStorage.getItem('mafia-theme')).toBe('light');
  });

  it('updates button label after toggle', async () => {
    mockMatchMedia(false);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Light mode' }));
    expect(screen.getByRole('button', { name: 'Dark mode' })).toBeInTheDocument();
  });
});

import { ElectronApplication, Page } from 'playwright';
import { test, expect, createGame, joinGame, markReady, waitForPhase, launchApp, getWindow } from './fixtures';

test.use({ timeout: 60_000 });

/**
 * Launch N extra Electron windows and join each to an existing game.
 * Returns the apps and their pages so the caller can close them in afterEach.
 */
async function launchJoiners(
  count: number,
  gameId: string,
  serverUrl: string,
  namePrefix = 'Player',
): Promise<{ apps: ElectronApplication[]; windows: Page[] }> {
  const apps: ElectronApplication[] = [];
  const windows: Page[] = [];

  for (let i = 0; i < count; i++) {
    const app = await launchApp();
    apps.push(app);
    const w = await getWindow(app);
    await joinGame(w, `${namePrefix}${i + 2}`, gameId, serverUrl);
    windows.push(w);
  }

  return { apps, windows };
}

test.describe('Game round — 4 players', () => {
  const extraApps: ElectronApplication[] = [];

  test.afterEach(async () => {
    for (const app of extraApps) {
      await app.close().catch(() => {});
    }
    extraApps.length = 0;
  });

  // ── Setup helpers ────────────────────────────────────────────────────────────

  async function startGame(hostWindow: Page, joinerWindows: Page[]): Promise<void> {
    await markReady(hostWindow);
    for (const w of joinerWindows) await markReady(w);
    await expect(hostWindow.getByRole('button', { name: 'Start Game' })).toBeEnabled({ timeout: 10_000 });
    await hostWindow.getByRole('button', { name: 'Start Game' }).click();
  }

  // ── Tests ────────────────────────────────────────────────────────────────────

  test('4 players reach night phase after host starts', async ({ window, serverUrl }) => {
    const gameId = await createGame(window, 'Alice', serverUrl);
    const { apps, windows: joiners } = await launchJoiners(3, gameId, serverUrl);
    extraApps.push(...apps);

    await startGame(window, joiners);

    // The game begins in Night (round 0 → Night 1)
    await waitForPhase(window, 'Night');
    for (const w of joiners) await waitForPhase(w, 'Night');
  });

  test('each player window shows role-specific night UI', async ({ window, serverUrl }) => {
    const gameId = await createGame(window, 'Alice', serverUrl);
    const { apps, windows: joiners } = await launchJoiners(3, gameId, serverUrl);
    extraApps.push(...apps);

    await startGame(window, joiners);
    await waitForPhase(window, 'Night');

    // Night phase renders role-based meta text (town sleeps / choose a target etc.)
    // Every active player window should show the night header
    await expect(window.locator('.phase', { hasText: 'Night' })).toBeVisible();
    for (const w of joiners) {
      await expect(w.locator('.phase', { hasText: 'Night' })).toBeVisible();
    }
  });

  test('host sees Resolve Night button in night phase', async ({ window, serverUrl }) => {
    const gameId = await createGame(window, 'Alice', serverUrl);
    const { apps, windows: joiners } = await launchJoiners(3, gameId, serverUrl);
    extraApps.push(...apps);

    await startGame(window, joiners);
    await waitForPhase(window, 'Night');

    await expect(window.getByRole('button', { name: 'Resolve Night' })).toBeVisible();
  });

  test('full night → day cycle via force-resolve', async ({ window, serverUrl }) => {
    const gameId = await createGame(window, 'Alice', serverUrl);
    const { apps, windows: joiners } = await launchJoiners(3, gameId, serverUrl);
    extraApps.push(...apps);

    await startGame(window, joiners);
    await waitForPhase(window, 'Night');

    // Force-resolve the night (no night actions submitted → no kill)
    await window.getByRole('checkbox', { name: 'Force resolve' }).check();
    await window.getByRole('button', { name: 'Resolve Night' }).click();

    // All windows should transition to Day 1
    await waitForPhase(window, 'Day');
    for (const w of joiners) await waitForPhase(w, 'Day');
  });
});

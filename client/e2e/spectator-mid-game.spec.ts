import { ElectronApplication, Page } from 'playwright';
import {
  test,
  expect,
  createGame,
  joinGame,
  markReady,
  waitForPhase,
  launchApp,
  getWindow,
  spectateGame,
} from './fixtures';

test.use({ timeout: 60_000 });

test.describe('Spectator joins mid-game', () => {
  const extraApps: ElectronApplication[] = [];

  test.afterEach(async () => {
    for (const app of extraApps) {
      await app.close().catch(() => {});
    }
    extraApps.length = 0;
  });

  /**
   * Launch 4 players, start the game, force-resolve Night 1 and arrive in Day 1.
   * Returns the host window (already in the day phase) and all extra apps.
   */
  async function setupDayPhase(hostWindow: Page, serverUrl: string): Promise<string> {
    const gameId = await createGame(hostWindow, 'Alice', serverUrl);

    for (const name of ['Bob', 'Carol', 'Dave']) {
      const app = await launchApp();
      extraApps.push(app);
      const w = await getWindow(app);
      await joinGame(w, name, gameId, serverUrl);
      await markReady(w);
    }

    await markReady(hostWindow);
    await expect(hostWindow.getByRole('button', { name: 'Start Game' })).toBeEnabled({ timeout: 10_000 });
    await hostWindow.getByRole('button', { name: 'Start Game' }).click();

    await waitForPhase(hostWindow, 'Night');
    await hostWindow.getByRole('checkbox', { name: 'Force resolve' }).check();
    await hostWindow.getByRole('button', { name: 'Resolve Night' }).click();
    await waitForPhase(hostWindow, 'Day');

    return gameId;
  }

  test('spectator joining an active game sees the day phase', async ({ window, serverUrl }) => {
    const gameId = await setupDayPhase(window, serverUrl);

    const spectatorApp = await launchApp();
    extraApps.push(spectatorApp);
    const spectatorWindow = await getWindow(spectatorApp);
    await spectateGame(spectatorWindow, 'Watcher', gameId, serverUrl);

    // Spectator should see the day phase, not the lobby
    await waitForPhase(spectatorWindow, 'Day');
  });

  test('spectator mid-game has the Spectating badge', async ({ window, serverUrl }) => {
    const gameId = await setupDayPhase(window, serverUrl);

    const spectatorApp = await launchApp();
    extraApps.push(spectatorApp);
    const spectatorWindow = await getWindow(spectatorApp);
    await spectateGame(spectatorWindow, 'Watcher', gameId, serverUrl);

    await waitForPhase(spectatorWindow, 'Day');
    await expect(spectatorWindow.locator('h1 .badge.spectating')).toBeVisible();
  });

  test('spectator mid-game cannot vote', async ({ window, serverUrl }) => {
    const gameId = await setupDayPhase(window, serverUrl);

    const spectatorApp = await launchApp();
    extraApps.push(spectatorApp);
    const spectatorWindow = await getWindow(spectatorApp);
    await spectateGame(spectatorWindow, 'Watcher', gameId, serverUrl);

    await waitForPhase(spectatorWindow, 'Day');

    // No vote buttons should be visible for a spectator
    await expect(spectatorWindow.locator('.vote-btn').first()).not.toBeVisible();
  });

  test('spectator mid-game sees the player list', async ({ window, serverUrl }) => {
    const gameId = await setupDayPhase(window, serverUrl);

    const spectatorApp = await launchApp();
    extraApps.push(spectatorApp);
    const spectatorWindow = await getWindow(spectatorApp);
    await spectateGame(spectatorWindow, 'Watcher', gameId, serverUrl);

    await waitForPhase(spectatorWindow, 'Day');

    // All four player names should be visible to the spectator
    for (const name of ['Alice', 'Bob', 'Carol', 'Dave']) {
      await expect(spectatorWindow.locator('.player-name', { hasText: name })).toBeVisible();
    }
  });
});

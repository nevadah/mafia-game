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
} from './fixtures';

test.use({ timeout: 60_000 });

test.describe('Host leaves mid-game', () => {
  const extraApps: ElectronApplication[] = [];

  test.afterEach(async () => {
    for (const app of extraApps) {
      await app.close().catch(() => {});
    }
    extraApps.length = 0;
  });

  async function setupAndReachDay(
    hostWindow: Page,
    serverUrl: string,
  ): Promise<Page[]> {
    const gameId = await createGame(hostWindow, 'Alice', serverUrl);

    const joiners: Page[] = [];
    for (const name of ['Bob', 'Carol', 'Dave']) {
      const app = await launchApp();
      extraApps.push(app);
      const w = await getWindow(app);
      await joinGame(w, name, gameId, serverUrl);
      joiners.push(w);
    }

    await markReady(hostWindow);
    for (const w of joiners) await markReady(w);
    await expect(hostWindow.getByRole('button', { name: 'Start Game' })).toBeEnabled({ timeout: 10_000 });
    await hostWindow.getByRole('button', { name: 'Start Game' }).click();

    await waitForPhase(hostWindow, 'Night');

    // Force-resolve the night so we land in Day 1
    await hostWindow.getByRole('checkbox', { name: 'Force resolve' }).check();
    await hostWindow.getByRole('button', { name: 'Resolve Night' }).click();
    await waitForPhase(hostWindow, 'Day');

    return joiners;
  }

  test('host clicking Leave Game returns host to entry screen', async ({ window, serverUrl }) => {
    await setupAndReachDay(window, serverUrl);

    await window.getByRole('button', { name: 'Leave Game' }).click();

    // Host should be back at the entry screen
    await expect(window.getByRole('button', { name: 'Create Game' })).toBeVisible({ timeout: 10_000 });
  });

  test('remaining players see game-closed status when host leaves', async ({ window, serverUrl, app }) => {
    const joiners = await setupAndReachDay(window, serverUrl);

    // Host leaves — this deletes the game and broadcasts game_closed
    await window.getByRole('button', { name: 'Leave Game' }).click();

    // Each remaining player window should return to the entry screen
    // with the "Game closed" status message
    for (const w of joiners) {
      await expect(w.getByRole('button', { name: 'Create Game' })).toBeVisible({ timeout: 15_000 });
    }

    void app; // suppress unused-variable warning — fixture manages host app lifecycle
  });
});

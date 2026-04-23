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

test.describe('Non-host player leaves mid-game', () => {
  const extraApps: ElectronApplication[] = [];

  test.afterEach(async () => {
    for (const app of extraApps) {
      await app.close().catch(() => {});
    }
    extraApps.length = 0;
  });

  async function setupAndStart(hostWindow: Page, serverUrl: string): Promise<Page[]> {
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
    return joiners;
  }

  test('non-host player leaving removes them from the game', async ({ window, serverUrl }) => {
    const joiners = await setupAndStart(window, serverUrl);
    // joiners[0] is Bob

    // Bob explicitly leaves mid-game
    await joiners[0].evaluate(async () => {
      await (window as any).mafia.leaveGame(); // eslint-disable-line @typescript-eslint/no-explicit-any
    });

    // Host window should no longer show Bob in the player list
    await expect(window.locator('.player-name', { hasText: 'Bob' })).not.toBeVisible({ timeout: 10_000 });

    // Game should still be active with the 3 remaining players
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state: any = await window.evaluate(async () => (window as any).mafia.getState());
    expect(state.status).toBe('active');
    expect(state.players.length).toBe(3);
    expect(state.players.find((p: any) => p.name === 'Bob')).toBeUndefined(); // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  test('game continues after non-host player leaves', async ({ window, serverUrl }) => {
    const joiners = await setupAndStart(window, serverUrl);

    // Bob leaves mid-game
    await joiners[0].evaluate(async () => {
      await (window as any).mafia.leaveGame(); // eslint-disable-line @typescript-eslint/no-explicit-any
    });
    await expect(window.locator('.player-name', { hasText: 'Bob' })).not.toBeVisible({ timeout: 10_000 });

    // The host should still be able to resolve the current night phase
    await window.evaluate(() => (window as any).mafia.resolveNight(true)).catch(() => {}); // eslint-disable-line @typescript-eslint/no-explicit-any
    await waitForPhase(window, 'Day');
  });
});

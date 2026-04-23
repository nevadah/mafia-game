import { ElectronApplication, Page } from 'playwright';
import {
  test,
  expect,
  createGame,
  joinGame,
  markReady,
  waitForPhase,
  waitForGameOver,
  dismissNightSummary,
  launchApp,
  getWindow,
} from './fixtures';

test.use({ timeout: 120_000 });

/**
 * Advance through one night (force-resolve) and one day (every alive window
 * casts a vote, then host force-resolves). Returns true if game over was
 * reached, false if play should continue.
 */
async function playRound(hostWindow: Page, joinerWindows: Page[]): Promise<boolean> {
  // ── Night ───────────────────────────────────────────────────────────────────
  const isNight = await hostWindow.evaluate(() => {
    const el = document.querySelector('.phase');
    return el !== null && (el.textContent ?? '').startsWith('Night');
  });

  if (isNight) {
    await hostWindow.getByRole('checkbox', { name: 'Force resolve' }).check();
    await hostWindow.getByRole('button', { name: 'Resolve Night' }).click();
    // Wait for day or game over on host window
    await hostWindow.waitForFunction(() => {
      const el = document.querySelector('.phase');
      const banner = document.querySelector('.game-over-banner');
      return banner !== null || (el !== null && (el.textContent ?? '').startsWith('Day'));
    }, undefined, { timeout: 15_000 });
  }

  // Check game over after night resolve
  const overAfterNight = await hostWindow.evaluate(() =>
    document.querySelector('.game-over-banner') !== null
  );
  if (overAfterNight) return true;

  // ── Day ─────────────────────────────────────────────────────────────────────
  const allWindows = [hostWindow, ...joinerWindows];

  // Wait for every window to reach Day before dismissing the modal — joiner
  // windows may not have received the state update yet when the host transitions.
  for (const w of allWindows) {
    await waitForPhase(w, 'Day');
  }
  for (const w of allWindows) {
    await dismissNightSummary(w);
  }
  for (const w of allWindows) {
    const btn = w.locator('.vote-btn').first();
    const visible = await btn.isVisible().catch(() => false);
    if (visible) {
      await btn.click();
    }
  }

  // Host force-resolves the day vote
  await hostWindow.getByRole('checkbox', { name: 'Force resolve' }).check();
  await hostWindow.getByRole('button', { name: 'Resolve Day' }).click();

  // Wait for night or game over on host window
  await hostWindow.waitForFunction(() => {
    const el = document.querySelector('.phase');
    const banner = document.querySelector('.game-over-banner');
    return (
      banner !== null ||
      (el !== null && ((el.textContent ?? '').startsWith('Night') || (el.textContent ?? '').startsWith('Day')))
    );
  }, undefined, { timeout: 15_000 });

  const overAfterDay = await hostWindow.evaluate(() =>
    document.querySelector('.game-over-banner') !== null
  );
  return overAfterDay;
}

test.describe('Complete game flow — 4 players', () => {
  const extraApps: ElectronApplication[] = [];

  test.afterEach(async () => {
    for (const app of extraApps) {
      await app.close().catch(() => {});
    }
    extraApps.length = 0;
  });

  test('game reaches game-over screen for all players', async ({ window, serverUrl }) => {
    // ── Setup ──────────────────────────────────────────────────────────────────
    const gameId = await createGame(window, 'Alice', serverUrl);

    const joiners: Page[] = [];
    for (const name of ['Bob', 'Carol', 'Dave']) {
      const app = await launchApp();
      extraApps.push(app);
      const w = await getWindow(app);
      await joinGame(w, name, gameId, serverUrl);
      joiners.push(w);
    }

    // Mark everyone ready and start
    await markReady(window);
    for (const w of joiners) await markReady(w);
    await expect(window.getByRole('button', { name: 'Start Game' })).toBeEnabled({ timeout: 10_000 });
    await window.getByRole('button', { name: 'Start Game' }).click();

    // Wait for night phase (game starts in Night 1)
    await waitForPhase(window, 'Night');

    // ── Play rounds until game over (max 4 rounds to be safe) ─────────────────
    let over = false;
    for (let round = 0; round < 4 && !over; round++) {
      over = await playRound(window, joiners);
    }

    expect(over).toBe(true);

    // All joiner windows should also reach game over
    for (const w of joiners) {
      await waitForGameOver(w);
    }
  });

  test('game-over screen shows a winner', async ({ window, serverUrl }) => {
    const gameId = await createGame(window, 'Alice', serverUrl);

    const joiners: Page[] = [];
    for (const name of ['Bob', 'Carol', 'Dave']) {
      const app = await launchApp();
      extraApps.push(app);
      const w = await getWindow(app);
      await joinGame(w, name, gameId, serverUrl);
      joiners.push(w);
    }

    await markReady(window);
    for (const w of joiners) await markReady(w);
    await expect(window.getByRole('button', { name: 'Start Game' })).toBeEnabled({ timeout: 10_000 });
    await window.getByRole('button', { name: 'Start Game' }).click();
    await waitForPhase(window, 'Night');

    let over = false;
    for (let round = 0; round < 4 && !over; round++) {
      over = await playRound(window, joiners);
    }

    await waitForGameOver(window);

    // Should show either "Town wins!" or "Mafia wins!"
    const winner = window.locator('.game-over-winner');
    await expect(winner).toBeVisible();
    const text = (await winner.textContent()) ?? '';
    expect(text).toMatch(/wins!/i);
  });

  test('"Back to Menu" returns host to entry screen after game over', async ({ window, serverUrl }) => {
    const gameId = await createGame(window, 'Alice', serverUrl);

    const joiners: Page[] = [];
    for (const name of ['Bob', 'Carol', 'Dave']) {
      const app = await launchApp();
      extraApps.push(app);
      const w = await getWindow(app);
      await joinGame(w, name, gameId, serverUrl);
      joiners.push(w);
    }

    await markReady(window);
    for (const w of joiners) await markReady(w);
    await expect(window.getByRole('button', { name: 'Start Game' })).toBeEnabled({ timeout: 10_000 });
    await window.getByRole('button', { name: 'Start Game' }).click();
    await waitForPhase(window, 'Night');

    let over = false;
    for (let round = 0; round < 4 && !over; round++) {
      over = await playRound(window, joiners);
    }

    await waitForGameOver(window);
    await window.getByRole('button', { name: 'Back to Menu' }).click();

    // Entry screen should be visible again
    await expect(window.getByRole('button', { name: 'Create Game' })).toBeVisible({ timeout: 5_000 });
  });
});

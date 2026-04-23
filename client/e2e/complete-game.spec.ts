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

/**
 * Advance through one night (force-resolve) and one day (cast one vote then
 * force-resolve). Returns true if game over was reached, false otherwise.
 *
 * All game-state actions go through window.mafia IPC rather than clicking UI
 * elements. Clicking UI in multiple Electron windows simultaneously causes
 * race conditions and timeouts due to resource contention and WS event lag.
 * The IPC path is synchronous with the server response and doesn't depend on
 * render timing.
 *
 * Phase detection still uses the DOM on the host window — it is the
 * authoritative source for when the server's broadcast arrived.
 */
async function playRound(hostWindow: Page, joinerWindows: Page[]): Promise<boolean> {
  // ── Night ───────────────────────────────────────────────────────────────────
  const isNight = await hostWindow.evaluate(() => {
    const el = document.querySelector('.phase');
    return el !== null && (el.textContent ?? '').startsWith('Night');
  });

  if (isNight) {
    // Force-resolve night via IPC; no UI interaction needed.
    await hostWindow.evaluate(() => window.mafia.resolveNight(true)).catch(() => {});
    // Wait for the host's DOM to reflect the new day (or game-over) state.
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

  // Cast one vote from the first window that can do so, to avoid a no-elimination
  // tie (0 votes for everyone). Tries each alive player as a target and catches
  // self-vote errors automatically.
  const allWindows = [hostWindow, ...joinerWindows];
  for (const w of allWindows) {
    const voted = await w.evaluate(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const state = await (window as any).mafia.getState() as Record<string, any> | null;
        if (!state || state['phase'] !== 'day' || state['status'] !== 'active') return false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const targets: any[] = (state['players'] as any[]).filter((p: any) => p.isAlive);
        for (const target of targets) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (window as any).mafia.castVote(target.id);
            return true; // one vote cast — enough to break the tie
          } catch {
            // self-vote or already voted; try next target
          }
        }
        return false;
      } catch {
        return false;
      }
    }).catch(() => false);
    if (voted) break;
  }

  // Force-resolve the day via IPC on the host window.
  await hostWindow.evaluate(() => window.mafia.resolveVotes(true)).catch(() => {});

  // Wait for host's DOM to reflect Night or game-over.
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

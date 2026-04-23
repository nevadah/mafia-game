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

test.describe('WebSocket reconnect — 30s grace period', () => {
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

  test('player reconnects within grace period and game state is intact', async ({ window, serverUrl }) => {
    const joiners = await setupAndStart(window, serverUrl);
    // joiners[0] = Bob

    // Capture Bob's player ID and role before disconnect
    const before: { id: string; role: string } = await joiners[0].evaluate(async () => {
      const state = await (window as any).mafia.getState(); // eslint-disable-line @typescript-eslint/no-explicit-any
      const me = state.players.find((p: any) => p.role !== undefined); // eslint-disable-line @typescript-eslint/no-explicit-any
      return { id: me.id as string, role: me.role as string };
    });

    // Drop Bob's WebSocket — server starts a 30s grace timer
    await joiners[0].evaluate(() => (window as any).mafia.disconnect()); // eslint-disable-line @typescript-eslint/no-explicit-any

    // Reconnect immediately within the grace window; awaits server 'connected' confirmation
    await joiners[0].evaluate(async () => {
      await (window as any).mafia.connect(); // eslint-disable-line @typescript-eslint/no-explicit-any
    });

    // ── Bob's perspective: state is intact after reconnect ─────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const afterReconnect: any = await joiners[0].evaluate(
      async () => (window as any).mafia.getState(), // eslint-disable-line @typescript-eslint/no-explicit-any
    );
    expect(afterReconnect.status).toBe('active');
    expect(afterReconnect.phase).toBe('night');
    expect(afterReconnect.players.length).toBe(4);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meAfter = afterReconnect.players.find((p: any) => p.id === before.id);
    expect(meAfter?.isAlive).toBe(true);
    expect(meAfter?.role).toBe(before.role);

    // ── Host's perspective: Bob was not removed from the game ──────────────────
    // The server broadcasts player_joined on reconnect; poll until host state reflects it.
    await expect.poll(
      async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s: any = await window.evaluate(async () => (window as any).mafia.getState()); // eslint-disable-line @typescript-eslint/no-explicit-any
        return s.players.length;
      },
      { timeout: 10_000 },
    ).toBe(4);
  });

  test('game continues normally after a reconnect', async ({ window, serverUrl }) => {
    const joiners = await setupAndStart(window, serverUrl);

    // Bob disconnects and reconnects
    await joiners[0].evaluate(() => (window as any).mafia.disconnect()); // eslint-disable-line @typescript-eslint/no-explicit-any
    await joiners[0].evaluate(async () => {
      await (window as any).mafia.connect(); // eslint-disable-line @typescript-eslint/no-explicit-any
    });

    // Host should still be able to drive the game forward
    await window.evaluate(() => (window as any).mafia.resolveNight(true)).catch(() => {}); // eslint-disable-line @typescript-eslint/no-explicit-any
    await waitForPhase(window, 'Day');
  });
});

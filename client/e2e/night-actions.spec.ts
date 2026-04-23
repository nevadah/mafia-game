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

test.describe('Night role mechanics — 4 players', () => {
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

  /**
   * Find the window whose owning player has the given role.
   * Each window's state reveals only that player's own role.
   */
  async function findByRole(
    windows: Page[],
    role: string,
  ): Promise<{ window: Page; id: string } | null> {
    for (const w of windows) {
      const result: { id: string } | null = await w.evaluate(async (r: string) => {
        const state = await (window as any).mafia.getState(); // eslint-disable-line @typescript-eslint/no-explicit-any
        const me = state.players.find((p: any) => p.role !== undefined); // eslint-disable-line @typescript-eslint/no-explicit-any
        return me?.role === r ? { id: me.id as string } : null;
      }, role);
      if (result) return { window: w, id: result.id };
    }
    return null;
  }

  test('mafia kill eliminates the targeted player', async ({ window, serverUrl }) => {
    const joiners = await setupAndStart(window, serverUrl);
    const allWindows = [window, ...joiners];

    const mafia = await findByRole(allWindows, 'mafia');
    expect(mafia).not.toBeNull();

    // Pick any alive non-mafia player as the kill target
    const targetId: string = await mafia!.window.evaluate(async (mafiaId: string) => {
      const state = await (window as any).mafia.getState(); // eslint-disable-line @typescript-eslint/no-explicit-any
      return state.players.find((p: any) => p.isAlive && p.id !== mafiaId)?.id; // eslint-disable-line @typescript-eslint/no-explicit-any
    }, mafia!.id);
    expect(targetId).toBeDefined();

    await mafia!.window.evaluate(async (id: string) => {
      await (window as any).mafia.nightAction(id); // eslint-disable-line @typescript-eslint/no-explicit-any
    }, targetId);
    await window.evaluate(() => (window as any).mafia.resolveNight(true)).catch(() => {}); // eslint-disable-line @typescript-eslint/no-explicit-any
    await waitForPhase(window, 'Day');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state: any = await window.evaluate(async () => (window as any).mafia.getState());
    expect(state.eliminatedThisRound).toBe(targetId);
    expect(state.players.find((p: any) => p.id === targetId)?.isAlive).toBe(false); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(state.players.filter((p: any) => p.isAlive).length).toBe(3); // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  test('doctor save prevents mafia kill', async ({ window, serverUrl }) => {
    const joiners = await setupAndStart(window, serverUrl);
    const allWindows = [window, ...joiners];

    const mafia = await findByRole(allWindows, 'mafia');
    const doctor = await findByRole(allWindows, 'doctor');
    expect(mafia).not.toBeNull();
    expect(doctor).not.toBeNull();

    // Mafia targets the doctor; doctor saves themselves — kill is blocked
    await mafia!.window.evaluate(async (id: string) => {
      await (window as any).mafia.nightAction(id); // eslint-disable-line @typescript-eslint/no-explicit-any
    }, doctor!.id);
    await doctor!.window.evaluate(async (id: string) => {
      await (window as any).mafia.nightAction(id); // eslint-disable-line @typescript-eslint/no-explicit-any
    }, doctor!.id);
    await window.evaluate(() => (window as any).mafia.resolveNight(true)).catch(() => {}); // eslint-disable-line @typescript-eslint/no-explicit-any
    await waitForPhase(window, 'Day');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state: any = await window.evaluate(async () => (window as any).mafia.getState());
    expect(state.eliminatedThisRound).toBeFalsy();
    expect(state.players.filter((p: any) => p.isAlive).length).toBe(4); // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  test('sheriff investigate returns the target player\'s role', async ({ window, serverUrl }) => {
    const joiners = await setupAndStart(window, serverUrl);
    const allWindows = [window, ...joiners];

    const sheriff = await findByRole(allWindows, 'sheriff');
    const mafia = await findByRole(allWindows, 'mafia');
    expect(sheriff).not.toBeNull();
    expect(mafia).not.toBeNull();

    // Sheriff investigates the known mafia player — result must come back as 'mafia'
    await sheriff!.window.evaluate(async (id: string) => {
      await (window as any).mafia.nightAction(id); // eslint-disable-line @typescript-eslint/no-explicit-any
    }, mafia!.id);
    await window.evaluate(() => (window as any).mafia.resolveNight(true)).catch(() => {}); // eslint-disable-line @typescript-eslint/no-explicit-any
    await waitForPhase(window, 'Day');

    // investigatedThisRound is only populated in the sheriff's own state view
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sheriffState: any = await sheriff!.window.evaluate(
      async () => (window as any).mafia.getState(), // eslint-disable-line @typescript-eslint/no-explicit-any
    );
    expect(sheriffState.investigatedThisRound).not.toBeNull();
    expect(sheriffState.investigatedThisRound.target).toBe(mafia!.id);
    expect(sheriffState.investigatedThisRound.result).toBe('mafia');
  });
});

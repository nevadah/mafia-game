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

test.describe('Game outcome scenarios — 4 players', () => {
  const extraApps: ElectronApplication[] = [];

  test.afterEach(async () => {
    for (const app of extraApps) {
      await app.close().catch(() => {});
    }
    extraApps.length = 0;
  });

  /**
   * Launch 3 joiners (Bob, Carol, Dave), mark all ready, start the game,
   * and wait for Night 1. Returns the joiner windows.
   */
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

  test('day vote tie eliminates no one and advances to night', async ({ window, serverUrl }) => {
    const joiners = await setupAndStart(window, serverUrl);

    // Force-resolve Night 1 with no actions — all 4 players survive into Day 1
    await window.evaluate(() => (window as any).mafia.resolveNight(true)).catch(() => {});
    await waitForPhase(window, 'Day');
    await dismissNightSummary(window);

    // Look up player IDs by name from the host's state
    const playerIds: Record<string, string> = await window.evaluate(async () => {
      const state = await (window as any).mafia.getState();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return Object.fromEntries(state.players.map((p: any) => [p.name, p.id]));
    });

    // 1-1 tie: Bob votes for Carol, Carol votes for Bob.
    // Neither is a self-vote; the top-vote tally is [Bob=1, Carol=1] → tie → no elimination.
    await joiners[0].evaluate(async (id: string) => {
      await (window as any).mafia.castVote(id);
    }, playerIds['Carol']);
    await joiners[1].evaluate(async (id: string) => {
      await (window as any).mafia.castVote(id);
    }, playerIds['Bob']);

    // Force-resolve: tie → no one eliminated, phase advances to Night 2
    await window.evaluate(() => (window as any).mafia.resolveVotes(true)).catch(() => {});
    await waitForPhase(window, 'Night');

    // All 4 players must still be alive
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state: any = await window.evaluate(async () => (window as any).mafia.getState());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(state.players.filter((p: any) => p.isAlive).length).toBe(4);
  });

  test('mafia wins when equal to remaining town', async ({ window, serverUrl }) => {
    const joiners = await setupAndStart(window, serverUrl);
    const allWindows = [window, ...joiners];

    // Each window's state shows the owning player's role. Find the mafia window.
    let mafiaWindow: Page | null = null;
    let mafiaId: string | null = null;
    for (const w of allWindows) {
      const result: { id: string; role: string } | null = await w.evaluate(async () => {
        const state = await (window as any).mafia.getState();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const me = state.players.find((p: any) => p.role !== undefined);
        return me ? { id: me.id as string, role: me.role as string } : null;
      });
      if (result?.role === 'mafia') {
        mafiaWindow = w;
        mafiaId = result.id;
        break;
      }
    }
    expect(mafiaWindow).not.toBeNull();
    expect(mafiaId).not.toBeNull();

    // Returns the ID of any alive player who is not the mafia.
    const getKillTarget = (): Promise<string | null> =>
      mafiaWindow!.evaluate(async (selfId: string) => {
        const state = await (window as any).mafia.getState();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return state.players.find((p: any) => p.isAlive && p.id !== selfId)?.id ?? null;
      }, mafiaId!);

    // ── Night 1: mafia kills → 1 mafia + 2 town survive ──────────────────────
    const target1 = await getKillTarget();
    expect(target1).not.toBeNull();
    await mafiaWindow!.evaluate(async (id: string) => {
      await (window as any).mafia.nightAction(id);
    }, target1!);
    await window.evaluate(() => (window as any).mafia.resolveNight(true)).catch(() => {});
    await waitForPhase(window, 'Day');
    await dismissNightSummary(window);

    // ── Day 1: no votes → force-resolve → no elimination ─────────────────────
    await window.evaluate(() => (window as any).mafia.resolveVotes(true)).catch(() => {});
    await waitForPhase(window, 'Night');

    // ── Night 2: mafia kills again → 1 mafia + 1 town → mafia wins ───────────
    const target2 = await getKillTarget();
    expect(target2).not.toBeNull();
    await mafiaWindow!.evaluate(async (id: string) => {
      await (window as any).mafia.nightAction(id);
    }, target2!);
    await window.evaluate(() => (window as any).mafia.resolveNight(true)).catch(() => {});

    await waitForGameOver(window);
    await expect(window.locator('.game-over-winner')).toContainText('Mafia wins!');
  });
});

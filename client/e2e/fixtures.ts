import { test as base, Page } from '@playwright/test';
import { ElectronApplication, _electron as electron } from 'playwright';
import fs from 'fs';
import path from 'path';
import { PORT_FILE } from './constants';

export { expect } from '@playwright/test';

const MAIN_JS = path.resolve(__dirname, '../dist/main.js');

// ── Fixture types ────────────────────────────────────────────────────────────

type TestFixtures = {
  /** URL of the E2E test server (e.g. http://localhost:PORT). */
  serverUrl: string;
  /** A launched Electron application instance. */
  app: ElectronApplication;
  /** The first BrowserWindow of the launched Electron app. */
  window: Page;
};

// ── Fixtures ─────────────────────────────────────────────────────────────────

export const test = base.extend<TestFixtures>({
  serverUrl: async ({}, use) => {
    const port = fs.readFileSync(PORT_FILE, 'utf-8').trim();
    await use(`http://localhost:${port}`);
  },

  app: async ({}, use) => {
    const electronApp = await launchApp();
    await use(electronApp);
    await electronApp.close();
  },

  window: async ({ app }, use) => {
    await use(await getWindow(app));
  },
});

// ── Raw helpers (also used by multi-window tests) ────────────────────────────

/** Launch a fresh Electron app instance with multi-instance lock bypassed. */
export async function launchApp(): Promise<ElectronApplication> {
  // ELECTRON_RUN_AS_NODE=1 (set by some runners) makes Electron behave as
  // plain Node.js, breaking require('electron') — unset it explicitly.
  const raw: Record<string, string | undefined> = { ...process.env, MAFIA_MULTI_INSTANCE: '1' };
  delete raw['ELECTRON_RUN_AS_NODE'];
  const env = Object.fromEntries(
    Object.entries(raw).filter((e): e is [string, string] => e[1] !== undefined),
  );
  return electron.launch({ args: [MAIN_JS], env });
}

/** Wait for the first window of an Electron app to finish loading. */
export async function getWindow(app: ElectronApplication): Promise<Page> {
  const w = await app.firstWindow();
  await w.waitForLoadState('domcontentloaded');
  return w;
}

// ── UI helpers ────────────────────────────────────────────────────────────────

/**
 * Expand the "Advanced" details panel and set the server URL input.
 * Safe to call multiple times — opens the panel only if it is closed.
 */
export async function setServerUrl(page: Page, url: string): Promise<void> {
  // The server URL lives in the last <details class="advanced-section">.
  const details = page.locator('details.advanced-section').last();
  const isOpen  = await details.evaluate((el: HTMLDetailsElement) => el.open);
  if (!isOpen) {
    await details.locator('summary').click();
  }
  const input = details.locator('input');
  await input.clear();
  await input.fill(url);
}

/**
 * From the entry screen, create a new game. Returns the game ID shown in the lobby.
 */
export async function createGame(page: Page, playerName: string, serverUrl: string): Promise<string> {
  await page.locator('.mode-tab', { hasText: 'New Game' }).click();
  await setServerUrl(page, serverUrl);
  await page.getByPlaceholder('Enter your name').fill(playerName);
  await page.locator('.btn-full', { hasText: 'Create Game' }).click();
  await page.waitForSelector('.game-code-value');
  return (await page.locator('.game-code-value').textContent()) ?? '';
}

/**
 * From the entry screen, join an existing game as a player.
 */
export async function joinGame(
  page: Page,
  playerName: string,
  gameId: string,
  serverUrl: string,
): Promise<void> {
  await page.locator('.mode-tab', { hasText: 'Join Game' }).click();
  await setServerUrl(page, serverUrl);
  await page.getByPlaceholder('Enter your name').fill(playerName);
  await page.getByPlaceholder('Enter game code').fill(gameId);
  await page.locator('.btn-full:not(.btn-secondary)', { hasText: 'Join Game' }).click();
  await page.waitForSelector('.game-code-value');
}

/**
 * From the entry screen, join an existing game as a spectator.
 */
export async function spectateGame(
  page: Page,
  spectatorName: string,
  gameId: string,
  serverUrl: string,
): Promise<void> {
  await page.locator('.mode-tab', { hasText: 'Join Game' }).click();
  await setServerUrl(page, serverUrl);
  await page.getByPlaceholder('Enter your name').fill(spectatorName);
  await page.getByPlaceholder('Enter game code').fill(gameId);
  await page.locator('.btn-full.btn-secondary', { hasText: 'Spectate' }).click();
  await page.waitForSelector('.game-code-value');
}

/**
 * Click the Ready button in the lobby and wait for it to flip to Unready,
 * confirming the server acknowledged the action.
 */
export async function markReady(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Ready' }).click();
  await page.getByRole('button', { name: 'Unready' }).waitFor({ state: 'visible', timeout: 10_000 });
}

/**
 * Wait for a phase element whose text starts with `phasePrefix` (e.g. 'Day', 'Night', 'Lobby').
 */
export async function waitForPhase(page: Page, phasePrefix: string): Promise<void> {
  await page.waitForFunction(
    (prefix) => {
      const el = document.querySelector('.phase');
      return el !== null && (el.textContent ?? '').startsWith(prefix);
    },
    phasePrefix,
    { timeout: 15_000 },
  );
}

/**
 * Wait for the game-over screen to appear.
 */
export async function waitForGameOver(page: Page): Promise<void> {
  await page.waitForSelector('.game-over-banner', { timeout: 15_000 });
}

/**
 * Dismiss the NightSummaryModal ("Got it") if it is currently visible.
 * Safe to call when the modal is absent.
 */
export async function dismissNightSummary(page: Page): Promise<void> {
  const btn = page.getByRole('button', { name: 'Got it' });
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await btn.waitFor({ state: 'hidden', timeout: 5_000 });
  }
}

import { ElectronApplication } from 'playwright';
import { test, expect, createGame, spectateGame, launchApp, getWindow } from './fixtures';

test.describe('Spectate flow', () => {
  let secondApp: ElectronApplication | null = null;

  test.afterEach(async () => {
    await secondApp?.close();
    secondApp = null;
  });

  test('spectating a game lands in the lobby', async ({ window, serverUrl }) => {
    const gameId = await createGame(window, 'Alice', serverUrl);

    secondApp = await launchApp();
    const spectator = await getWindow(secondApp);
    await spectateGame(spectator, 'Watcher', gameId, serverUrl);

    await expect(spectator.locator('.phase', { hasText: 'Lobby' })).toBeVisible();
  });

  test('spectator header shows Spectating badge', async ({ window, serverUrl }) => {
    const gameId = await createGame(window, 'Alice', serverUrl);

    secondApp = await launchApp();
    const spectator = await getWindow(secondApp);
    await spectateGame(spectator, 'Watcher', gameId, serverUrl);

    await expect(spectator.locator('h1 .badge.spectating')).toBeVisible();
  });

  test('spectator appears in the host\'s spectators list', async ({ window, serverUrl }) => {
    const gameId = await createGame(window, 'Alice', serverUrl);

    secondApp = await launchApp();
    const spectator = await getWindow(secondApp);
    await spectateGame(spectator, 'Watcher', gameId, serverUrl);

    // Alice's window should show Watcher in the spectators section
    await expect(window.locator('.player-name', { hasText: 'Watcher' })).toBeVisible();
  });

  test('spectator does not see Ready or Start Game buttons', async ({ window, serverUrl }) => {
    const gameId = await createGame(window, 'Alice', serverUrl);

    secondApp = await launchApp();
    const spectator = await getWindow(secondApp);
    await spectateGame(spectator, 'Watcher', gameId, serverUrl);

    await expect(spectator.getByRole('button', { name: 'Ready' })).not.toBeVisible();
    await expect(spectator.getByRole('button', { name: 'Start Game' })).not.toBeVisible();
  });

  test('spectator sees Leave button', async ({ window, serverUrl }) => {
    const gameId = await createGame(window, 'Alice', serverUrl);

    secondApp = await launchApp();
    const spectator = await getWindow(secondApp);
    await spectateGame(spectator, 'Watcher', gameId, serverUrl);

    await expect(spectator.getByRole('button', { name: 'Leave' })).toBeVisible();
  });

  test('spectator does not appear in the player list', async ({ window, serverUrl }) => {
    const gameId = await createGame(window, 'Alice', serverUrl);

    secondApp = await launchApp();
    const spectator = await getWindow(secondApp);
    await spectateGame(spectator, 'Watcher', gameId, serverUrl);

    // Spectator count: 1 player (Alice), 1 spectator (Watcher)
    const playerNames = await window.locator('.player-name').allTextContents();
    expect(playerNames).toContain('Alice');
    expect(playerNames).toContain('Watcher');

    // But the Watcher entry should carry a "Spectating" badge, not a "Ready"/"Not Ready" badge
    const watcherRow = window.locator('.player', { hasText: 'Watcher' });
    await expect(watcherRow.locator('.badge.spectating')).toBeVisible();
    await expect(watcherRow.locator('.badge.ready, .badge.not-ready')).not.toBeVisible();
  });
});

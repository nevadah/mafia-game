import { ElectronApplication } from 'playwright';
import { test, expect, createGame, joinGame, launchApp, getWindow, setServerUrl } from './fixtures';

test.describe('Join game flow', () => {
  let secondApp: ElectronApplication | null = null;

  test.afterEach(async () => {
    await secondApp?.close();
    secondApp = null;
  });

  test('joining an existing game lands in the lobby', async ({ window, serverUrl }) => {
    const gameId = await createGame(window, 'Alice', serverUrl);

    secondApp = await launchApp();
    const joiner = await getWindow(secondApp);
    await joinGame(joiner, 'Bob', gameId, serverUrl);

    await expect(joiner.locator('.phase', { hasText: 'Lobby' })).toBeVisible();
  });

  test('both players appear in each other\'s player list', async ({ window, serverUrl }) => {
    const gameId = await createGame(window, 'Alice', serverUrl);

    secondApp = await launchApp();
    const joiner = await getWindow(secondApp);
    await joinGame(joiner, 'Bob', gameId, serverUrl);

    // Alice sees Bob; Bob sees Alice
    await expect(window.locator('.player-name', { hasText: 'Bob' })).toBeVisible();
    await expect(joiner.locator('.player-name', { hasText: 'Alice' })).toBeVisible();
  });

  test('Host badge shown only on creator', async ({ window, serverUrl }) => {
    const gameId = await createGame(window, 'Alice', serverUrl);

    secondApp = await launchApp();
    const joiner = await getWindow(secondApp);
    await joinGame(joiner, 'Bob', gameId, serverUrl);

    // From Alice's window: Alice row has Host badge, Bob row does not
    const aliceRow = window.locator('.player', { hasText: 'Alice' });
    const bobRow   = window.locator('.player', { hasText: 'Bob' });
    await expect(aliceRow.locator('.badge.host')).toBeVisible();
    await expect(bobRow.locator('.badge.host')).not.toBeVisible();
  });

  test('joiner has You badge on their own entry', async ({ window, serverUrl }) => {
    const gameId = await createGame(window, 'Alice', serverUrl);

    secondApp = await launchApp();
    const joiner = await getWindow(secondApp);
    await joinGame(joiner, 'Bob', gameId, serverUrl);

    // In Bob's window, the Bob row should have the You badge
    const bobRowInJoinerWindow = joiner.locator('.player', { hasText: 'Bob' });
    await expect(bobRowInJoinerWindow.locator('.badge.you')).toBeVisible();
  });

  test('joining a nonexistent game shows an error status', async ({ window, serverUrl }) => {
    await window.locator('.mode-tab', { hasText: 'Join Game' }).click();
    await setServerUrl(window, serverUrl);
    await window.getByPlaceholder('Enter your name').fill('Bob');
    await window.getByPlaceholder('Enter game code').fill('does-not-exist');
    await window.locator('.btn-full:not(.btn-secondary)', { hasText: 'Join Game' }).click();

    // Status bar should show an error (not navigate to lobby)
    await expect(window.locator('.status.error')).toBeVisible({ timeout: 5_000 });
    await expect(window.locator('.entry-screen')).toBeVisible();
  });
});

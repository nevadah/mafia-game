import { test, expect, createGame } from './fixtures';

test.describe('Create game flow', () => {
  test('entry screen shows New Game tab by default', async ({ window }) => {
    await expect(window.locator('.entry-screen')).toBeVisible();
    await expect(window.locator('.mode-tab.active', { hasText: 'New Game' })).toBeVisible();
  });

  test('creates a game and enters the lobby', async ({ window, serverUrl }) => {
    const gameId = await createGame(window, 'Alice', serverUrl);

    expect(gameId).toBeTruthy();
    await expect(window.locator('.phase', { hasText: 'Lobby' })).toBeVisible();
  });

  test('game code is displayed in the lobby', async ({ window, serverUrl }) => {
    const gameId = await createGame(window, 'Alice', serverUrl);

    const displayed = await window.locator('.game-code-value').textContent();
    expect(displayed?.trim()).toBe(gameId.trim());
  });

  test('creator has the Host badge', async ({ window, serverUrl }) => {
    await createGame(window, 'Alice', serverUrl);

    await expect(window.locator('.badge.host')).toBeVisible();
  });

  test('creator has You badge', async ({ window, serverUrl }) => {
    await createGame(window, 'Alice', serverUrl);

    await expect(window.locator('.badge.you')).toBeVisible();
  });

  test('Ready and Start Game buttons are visible for the host', async ({ window, serverUrl }) => {
    await createGame(window, 'Alice', serverUrl);

    await expect(window.getByRole('button', { name: 'Ready' })).toBeVisible();
    await expect(window.getByRole('button', { name: 'Start Game' })).toBeVisible();
  });

  test('Start Game button is disabled until all players are ready', async ({ window, serverUrl }) => {
    await createGame(window, 'Alice', serverUrl);

    await expect(window.getByRole('button', { name: 'Start Game' })).toBeDisabled();
  });

  test('Copy Code and Copy Invite Link buttons are present', async ({ window, serverUrl }) => {
    await createGame(window, 'Alice', serverUrl);

    await expect(window.getByRole('button', { name: 'Copy Code' })).toBeVisible();
    await expect(window.getByRole('button', { name: 'Copy Invite Link' })).toBeVisible();
  });

  test('leaving returns to the entry screen', async ({ window, serverUrl }) => {
    await createGame(window, 'Alice', serverUrl);
    await window.getByRole('button', { name: 'Leave' }).click();

    await expect(window.locator('.entry-screen')).toBeVisible();
  });
});

import { defineConfig } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: path.join(__dirname, 'e2e'),

  // Electron apps are expensive; run tests serially to avoid resource contention.
  workers: 1,

  // Per-test timeout (seconds). game-round.spec.ts overrides to 60 s.
  timeout: 30_000,

  // Default assertion timeout.
  expect: { timeout: 10_000 },

  retries: 0,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'e2e-report' }],
  ],

  globalSetup:    path.join(__dirname, 'e2e/global-setup.ts'),
  globalTeardown: path.join(__dirname, 'e2e/global-teardown.ts'),
});

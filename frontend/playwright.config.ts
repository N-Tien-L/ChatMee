import { defineConfig, devices } from '@playwright/test';
import { assertLocalTarget } from './tests/e2e/local-only.mjs';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['line'], ['./tests/e2e/diagnostics-reporter.ts']],
  globalTimeout: 12 * 60_000,
  use: {
    baseURL: assertLocalTarget(),
    actionTimeout: 15_000, navigationTimeout: 30_000,
    trace: 'off', screenshot: 'off', video: 'off',
    serviceWorkers: 'block',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node tests/e2e/run-local.mjs',
    url: 'http://127.0.0.1:3100/login',
    reuseExistingServer: false,
    timeout: 300_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 },
  },
});
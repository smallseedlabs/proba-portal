import { defineConfig, devices } from '@playwright/test';

/** Captures the main screens for the documentation (npm run screenshots). Uses the in-memory build. */
export default defineConfig({
  testDir: './e2e/screenshots',
  timeout: 90_000,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    timezoneId: 'UTC',
    locale: 'en-GB',
    baseURL: 'http://localhost:4190',
    deviceScaleFactor: 1,
  },
  webServer: {
    command: 'npm run build:e2e && npm run preview:e2e',
    url: 'http://localhost:4190',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

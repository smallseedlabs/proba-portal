import { defineConfig, devices } from '@playwright/test';

/**
 * Browser checks. No audit API and no Firebase project are needed: Firebase Authentication is
 * stood in for at the network level (the real Firebase SDK runs unmodified), and
 * - "app": the portal reads from the in-memory data source (build:e2e, which compiles it in);
 * - "http": the production code path (HttpAuditApi over HTTP); the audit API is stood in for at the
 *   network level by the same in-memory behaviour (e2e/support/audit-api-mock.ts).
 */
const viewport = { width: 1440, height: 900 };
const common = { ...devices['Desktop Chrome'], viewport, timezoneId: 'UTC', locale: 'en-GB' };

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: { trace: 'on-first-retry' },
  projects: [
    { name: 'app', testMatch: /app\/.*\.spec\.ts/, use: { ...common, baseURL: 'http://localhost:4190' } },
    { name: 'http', testMatch: /http\/.*\.spec\.ts/, use: { ...common, baseURL: 'http://localhost:4191' } },
  ],
  webServer: [
    {
      command: 'npm run build:e2e && npm run preview:e2e',
      url: 'http://localhost:4190',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run build:e2e-http && npm run preview:e2e-http',
      url: 'http://localhost:4191',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});

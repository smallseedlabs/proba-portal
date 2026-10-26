import { test, expect } from '@playwright/test';
import { ACCOUNT, mockFirebase } from '../support/firebase-mock';
import { goTo } from '../support/app';

const OUT = process.env.SCREENSHOT_DIR ?? 'docs/screenshots';

test.describe.configure({ mode: 'serial' });

test('main screens', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockFirebase(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in to Proba Insights' })).toBeVisible();
  await page.screenshot({ path: `${OUT}/01-sign-in.png` });

  await page.getByLabel('Work email').fill(ACCOUNT.email);
  await page.getByLabel('Password', { exact: true }).fill(ACCOUNT.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Audit Explorer', level: 1 })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Audit events' })).toBeVisible();
  await page.screenshot({ path: `${OUT}/02-audit-explorer.png` });

  await goTo(page, '#/explorer?outcome=failure');
  await expect(page.getByRole('table', { name: 'Audit events' })).toBeVisible();
  await page.getByRole('button', { name: /tool\.failed/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: `${OUT}/03-event-detail.png` });
  await page.keyboard.press('Escape');

  await goTo(page, '#/traces');
  await expect(page.getByRole('table', { name: 'Recent traces' })).toBeVisible();
  await page.screenshot({ path: `${OUT}/04-traces.png` });
  await page.getByRole('link', { name: /command\.received/ }).first().click();
  await expect(page.getByRole('tree', { name: 'Steps of this trace' })).toBeVisible();
  await page.screenshot({ path: `${OUT}/05-trace-view.png` });
  // The administrator-only raw text of the steps, below the step list.
  const panel = page.getByTestId('content-panel');
  await expect(panel).toBeVisible();
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({ path: `${OUT}/10-trace-raw-text.png` });
  await panel.getByRole('button', { name: /^Open step/ }).first().click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Raw text', level: 3 })).toBeVisible();
  await expect(page.getByRole('dialog').getByTestId('content-text')).toBeVisible();
  // A tall window shows the whole record, with its raw text, in one picture.
  await page.setViewportSize({ width: 1440, height: 1250 });
  await page.screenshot({ path: `${OUT}/11-event-raw-text.png` });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 900 });

  await goTo(page, '#/integrity');
  await page.getByRole('button', { name: 'Verify integrity' }).click();
  await expect(page.getByTestId('integrity-verdict')).toHaveText('Chain intact');
  await page.screenshot({ path: `${OUT}/06-integrity-intact.png` });
  await page.getByLabel('Period').selectOption('previous24');
  await page.getByRole('button', { name: 'Verify integrity' }).click();
  await expect(page.getByTestId('integrity-verdict')).toContainText('problem');
  await page.screenshot({ path: `${OUT}/07-integrity-problem.png` });

  // The page scrolls inside the app shell, so a tall window shows the whole screen in one picture.
  await page.setViewportSize({ width: 1440, height: 1500 });
  await goTo(page, '#/analytics');
  await expect(page.getByTestId('metric-chart')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Top campaigns by spend' })).toBeVisible();
  await page.screenshot({ path: `${OUT}/08-analytics.png`, fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  await goTo(page, '#/explorer');
  await expect(page.getByRole('table', { name: 'Audit events' })).toBeVisible();
  await page.screenshot({ path: `${OUT}/09-explorer-mobile.png` });
});

test('memory screens', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockFirebase(page);
  await page.goto('/');
  await page.getByLabel('Work email').fill(ACCOUNT.email);
  await page.getByLabel('Password', { exact: true }).fill(ACCOUNT.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main' }).first()).toBeVisible();
  // The page scrolls inside the app shell, so a tall window shows a whole screen in one picture.
  await page.setViewportSize({ width: 1440, height: 1000 });

  await goTo(page, '#/memory?q=campaign+budget+approval');
  await expect(page.getByRole('table', { name: 'Memories ranked for the search' })).toBeVisible();
  await page.screenshot({ path: `${OUT}/13-memory-explorer.png` });

  await page.setViewportSize({ width: 1440, height: 1900 });
  await goTo(page, '#/memory/7a1c0000-0000-4000-8000-000000000003');
  await expect(page.getByRole('list', { name: 'Memories in order, newest first' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Retrievals that returned this memory' })).toBeVisible();
  await page.screenshot({ path: `${OUT}/14-memory-detail.png` });

  await page.setViewportSize({ width: 1440, height: 1650 });
  await goTo(page, '#/retrievals');
  await page.getByLabel('Question').fill('when does a campaign budget need administrator approval');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('candidates-table')).toBeVisible();
  await page.screenshot({ path: `${OUT}/15-retrieval-inspector.png` });

  await page.setViewportSize({ width: 1440, height: 1100 });
  await goTo(page, '#/profiles');
  await expect(page.getByTestId('active-default')).toBeVisible();
  await page.locator('summary', { hasText: 'Configuration' }).nth(1).click();
  await page.screenshot({ path: `${OUT}/16-scoring-profiles.png` });

  await page.setViewportSize({ width: 1440, height: 1100 });
  await goTo(page, '#/jobs');
  await expect(page.getByRole('table', { name: /Recent background job runs/ })).toBeVisible();
  await page.screenshot({ path: `${OUT}/17-jobs.png` });
});

test('the memory screens for a viewer', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => window.sessionStorage.setItem('proba.e2e.role', 'viewer'));
  await mockFirebase(page);
  await page.goto('/');
  await page.getByLabel('Work email').fill(ACCOUNT.email);
  await page.getByLabel('Password', { exact: true }).fill(ACCOUNT.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await goTo(page, '#/memory');
  await expect(page.getByRole('table', { name: 'Memories, newest first' })).toBeVisible();
  await page.screenshot({ path: `${OUT}/18-memory-explorer-viewer.png` });
});

test('the same trace for a viewer has no raw text', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => window.sessionStorage.setItem('proba.e2e.role', 'viewer'));
  await mockFirebase(page);
  await page.goto('/');
  await page.getByLabel('Work email').fill(ACCOUNT.email);
  await page.getByLabel('Password', { exact: true }).fill(ACCOUNT.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await goTo(page, '#/traces');
  await expect(page.getByRole('table', { name: 'Recent traces' })).toBeVisible();
  await page.getByRole('link', { name: /command\.received/ }).first().click();
  await expect(page.getByRole('tree', { name: 'Steps of this trace' })).toBeVisible();
  await expect(page.getByTestId('content-panel')).toHaveCount(0);
  await page.screenshot({ path: `${OUT}/12-trace-view-viewer.png` });
});

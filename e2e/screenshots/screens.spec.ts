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

  await goTo(page, '#/integrity');
  await page.getByRole('button', { name: 'Verify integrity' }).click();
  await expect(page.getByTestId('integrity-verdict')).toHaveText('Chain intact');
  await page.screenshot({ path: `${OUT}/06-integrity-intact.png` });
  await page.getByLabel('Period').selectOption('previous24');
  await page.getByRole('button', { name: 'Verify integrity' }).click();
  await expect(page.getByTestId('integrity-verdict')).toContainText('problem');
  await page.screenshot({ path: `${OUT}/07-integrity-problem.png` });

  await goTo(page, '#/analytics');
  await expect(page.getByTestId('metric-chart')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Top campaigns by spend' })).toBeVisible();
  await page.screenshot({ path: `${OUT}/08-analytics.png`, fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  await goTo(page, '#/explorer');
  await expect(page.getByRole('table', { name: 'Audit events' })).toBeVisible();
  await page.screenshot({ path: `${OUT}/09-explorer-mobile.png` });
});

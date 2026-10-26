import { test, expect } from '@playwright/test';
import { expectNoAxeViolations, signIn, goTo } from '../support/app';

test.describe('Integrity', () => {
  test('verifies an intact chain, then reports an altered record with a link to it', async ({ page }) => {
    await signIn(page, { hash: '#/integrity' });
    await expect(page.getByText('No check run yet')).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByRole('button', { name: 'Verify integrity' }).click();
    await expect(page.getByTestId('integrity-verdict')).toHaveText('Chain intact');
    await page.getByLabel('Period').selectOption('previous24');
    await page.getByRole('button', { name: 'Verify integrity' }).click();
    await expect(page.getByTestId('integrity-verdict')).toContainText('1 problem found');
    await expectNoAxeViolations(page);
    await page.getByRole('table', { name: 'Records that failed verification' }).getByRole('link').click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Raw event' })).toBeVisible();
  });

  test('is hidden from people who are not administrators', async ({ page }) => {
    await page.addInitScript(() => window.sessionStorage.setItem('proba.e2e.role', 'viewer'));
    await signIn(page);
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Integrity' })).toHaveCount(0);
    await goTo(page, '#/integrity');
    await expect(page.getByText('Integrity checks need an administrator')).toBeVisible();
  });
});

test.describe('Analytics', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, { hash: '#/analytics' });
    await expect(page.getByTestId('metric-chart')).toBeVisible();
  });

  test('shows summary cards with comparison, a chart, top campaigns and freshness; and is accessible', async ({ page }) => {
    const summary = page.getByLabel('Summary');
    for (const label of ['Impressions', 'Clicks', 'Spend', 'Conversions']) await expect(summary.getByText(label, { exact: true })).toBeVisible();
    await expect(summary.getByText(/vs previous 30 days/).first()).toBeVisible();
    await expect(page.getByRole('table', { name: 'Top campaigns by spend' })).toBeVisible();
    await expect(page.getByTestId('freshness')).toContainText('Data as of');
    await expectNoAxeViolations(page);
  });

  test('switches metric, granularity and campaign, and the address follows', async ({ page }) => {
    await page.getByRole('button', { name: 'Spend' }).click();
    await expect(page.getByRole('heading', { name: 'Spend over time' })).toBeVisible();

    await page.getByLabel('Granularity').selectOption('hour');
    await expect(page).toHaveURL(/granularity=hour/);
    await expect(page.getByText(/Hourly figures cover complete hours/)).toBeVisible();
    await expect(page.getByTestId('metric-chart')).toBeVisible();

    await page.getByLabel('Granularity').selectOption('day');
    await page.getByRole('table', { name: 'Top campaigns by spend' }).getByRole('button', { name: /cmp_/ }).first().click();
    await expect(page).toHaveURL(/campaignId=cmp_/);
    await expect(page.getByTestId('metric-chart')).toBeVisible();
  });

  test('never mixes currencies', async ({ page }) => {
    const group = page.getByRole('group', { name: 'Currency' });
    await expect(group.getByRole('button', { name: 'USD' })).toHaveAttribute('aria-pressed', 'true');
    await group.getByRole('button', { name: 'EUR' }).click();
    await expect(group.getByRole('button', { name: 'EUR' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(/€|EUR/).first()).toBeVisible();
  });

  test('the chart can be read with the keyboard', async ({ page }) => {
    await page.locator('[role="group"][tabindex="0"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('chart-tooltip')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('chart-tooltip')).toHaveCount(0);
  });

  test('fits a phone-sized screen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await goTo(page, '#/analytics?granularity=day');
    await expect(page.getByTestId('metric-chart')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });
});

test.describe('Navigation', () => {
  test('shows the Memory entry only because the build configures it, and opens it in a new tab', async ({ page }) => {
    await signIn(page);
    const link = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /Memory/ });
    await expect(link).toHaveAttribute('href', 'https://memory.example.com/');
    await expect(link).toHaveAttribute('target', '_blank');
  });

  test('moves between every screen and keeps the page title in step', async ({ page }) => {
    await signIn(page);
    const nav = page.getByRole('navigation', { name: 'Main' });
    for (const [name, heading] of [['Traces', 'Traces'], ['Integrity', 'Integrity'], ['Analytics', 'Analytics'], ['Audit Explorer', 'Audit Explorer']] as const) {
      await nav.getByRole('link', { name, exact: true }).click();
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
      await expect(page).toHaveTitle(new RegExp(`${heading}.*Proba Insights`));
    }
  });
});

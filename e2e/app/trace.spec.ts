import { test, expect } from '@playwright/test';
import { expectNoAxeViolations, signIn, goTo } from '../support/app';

test.describe('Trace View', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
    await signIn(page, { hash: '#/traces' });
    await expect(page.getByRole('table', { name: 'Recent traces' })).toBeVisible();
    await page.getByRole('link', { name: /command\.received/ }).first().click();
    await expect(page.getByRole('tree', { name: 'Steps of this trace' })).toBeVisible();
  });

  test('shows the span tree with durations, outcomes and risk, and is accessible', async ({ page }) => {
    const tree = page.getByRole('tree', { name: 'Steps of this trace' });
    const first = tree.getByRole('treeitem').first();
    await expect(first).toHaveAttribute('aria-level', '1');
    await expect(first).toContainText(/\d+(\.\d+)? ?(ms|s)/);
    await expect(tree.getByRole('treeitem').nth(1)).toHaveAttribute('aria-level', '2');
    await expectNoAxeViolations(page);
  });

  test('copies the trace ID', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions differ');
    const id = (await page.getByTestId('trace-id').innerText()).trim();
    await page.getByRole('button', { name: 'Copy trace ID' }).click();
    await expect(page.getByText('Copied trace ID')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(id);
  });

  test('links to the goal and the campaign, and opens a step', async ({ page }) => {
    await page.getByRole('link', { name: /^cmp_/ }).first().click();
    await expect(page).toHaveURL(/#\/analytics\?campaignId=cmp_/);
    await page.goBack();
    await expect(page.getByRole('tree', { name: 'Steps of this trace' })).toBeVisible();
    await page.getByRole('tree').getByRole('button').nth(1).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Raw event' })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('says plainly when a trace does not exist', async ({ page }) => {
    await goTo(page, '#/traces/00000000-0000-4000-8000-000000000000');
    await expect(page.getByRole('alert')).toContainText('We couldn’t find this trace');
    await page.getByRole('link', { name: /Back to traces|All traces/ }).first().click();
    await expect(page.getByRole('table', { name: 'Recent traces' })).toBeVisible();
  });
});

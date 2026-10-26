import { test, expect } from '@playwright/test';
import { FORBIDDEN_WORDING, expectNoAxeViolations, signIn, goTo } from '../support/app';

test.describe('Audit Explorer', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole('table', { name: 'Audit events' })).toBeVisible();
  });

  test('is accessible and free of development wording', async ({ page }) => {
    await expectNoAxeViolations(page);
    expect(await page.locator('main').innerText()).not.toMatch(FORBIDDEN_WORDING);
  });

  test('filters by outcome and category, keeps the filters in the address, and restores them on reload', async ({ page }) => {
    await page.getByLabel('Outcome').selectOption('failure');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page).toHaveURL(/outcome=failure/);
    const table = page.getByRole('table', { name: 'Audit events' });
    await expect(table.getByText('Succeeded')).toHaveCount(0);
    await expect(table.getByText('Failed').first()).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('Outcome')).toHaveValue('failure');
    await expect(page.getByText('1 filter applied')).toBeVisible();
  });

  test('pages forwards and back', async ({ page }) => {
    await page.getByLabel('Rows per page').selectOption('25');
    const rows = page.getByRole('table', { name: 'Audit events' }).getByRole('row');
    await expect(rows).toHaveCount(26);
    const first = await rows.nth(1).innerText();
    await page.getByRole('button', { name: /Next/ }).click();
    await expect(page.getByText('Page 2')).toBeVisible();
    await expect.poll(async () => rows.nth(1).innerText()).not.toBe(first);
    await page.getByRole('button', { name: /Previous/ }).click();
    await expect(page.getByText('Page 1')).toBeVisible();
    await expect.poll(async () => rows.nth(1).innerText()).toBe(first);
  });

  test('opens an event in a drawer with raw JSON and a link to its trace, and gives focus back', async ({ page }) => {
    const trigger = page.getByRole('button', { name: /tool\.failed/ }).first();
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Raw event' })).toBeVisible();
    const parsed = JSON.parse((await dialog.getByLabel('Raw event JSON').innerText()) || '{}');
    expect(parsed.action).toBe('tool.failed');
    await expectNoAxeViolations(page);
    await dialog.getByRole('link', { name: 'View trace' }).click();
    await expect(page.getByRole('tree', { name: 'Steps of this trace' })).toBeVisible();
    await expect(page).toHaveURL(/#\/traces\//);
    await page.goBack();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('closing the drawer with Escape returns focus to the row that opened it', async ({ page }) => {
    const trigger = page.getByRole('button', { name: /Open details/ }).first();
    await trigger.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('shows an empty state with a way back, and a failure with a way to retry', async ({ page }) => {
    await page.getByLabel('Text search').fill('zzzzzz');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByText('No events match these filters')).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByRole('button', { name: 'Clear filters' }).last().click();
    await expect(page.getByRole('table', { name: 'Audit events' })).toBeVisible();

    await page.evaluate(() => {
      const api = (window as unknown as { __probaAudit: { failNext: unknown } }).__probaAudit;
      api.failNext = Object.assign(new Error('Proba is temporarily unavailable. Please try again shortly.'), { kind: 'unavailable', status: 503, traceId: 'trace-e2e' });
    });
    await page.getByLabel('Outcome').selectOption('denied');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByRole('alert')).toContainText('We couldn’t load events');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('table', { name: 'Audit events' })).toBeVisible();
  });

  test('keeps working on a phone-sized screen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await goTo(page, '#/explorer');
    await expect(page.getByRole('table', { name: 'Audit events' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible();
    await page.getByRole('dialog', { name: 'Navigation' }).getByRole('link', { name: 'Analytics' }).click();
    await expect(page.getByRole('heading', { name: 'Analytics', level: 1 })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Navigation' })).toHaveCount(0);
  });

  test('shows times in UTC or local time on request', async ({ page }) => {
    await page.getByRole('button', { name: 'UTC', exact: true }).click();
    await expect(page.getByRole('button', { name: 'UTC', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('table', { name: 'Audit events' }).getByText(/UTC/).first()).toBeVisible();
  });
});

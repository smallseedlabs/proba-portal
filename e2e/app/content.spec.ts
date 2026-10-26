import { test, expect } from '@playwright/test';
import { FORBIDDEN_WORDING, expectNoAxeViolations, goTo, signIn } from '../support/app';

async function openFirstTrace(page: import('@playwright/test').Page) {
  await expect(page.getByRole('table', { name: 'Recent traces' })).toBeVisible();
  await page.getByRole('link', { name: /command\.received/ }).first().click();
  await expect(page.getByRole('tree', { name: 'Steps of this trace' })).toBeVisible();
}

test.describe('Raw text, administrator', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined);
    await signIn(page, { hash: '#/traces' });
    await openFirstTrace(page);
  });

  test('shows the text of the steps with its details, and is accessible', async ({ page }) => {
    const panel = page.getByTestId('content-panel');
    await expect(panel.getByRole('heading', { name: 'Raw text', level: 2 })).toBeVisible();
    await expect(panel).toContainText('Visible to administrators only');
    const first = panel.getByTestId('content-block').first();
    await expect(first.getByRole('heading', { name: /Message from a person/ })).toBeVisible();
    await expect(first.getByTestId('content-text')).not.toBeEmpty();
    await expect(first.getByTestId('content-redactions')).toBeVisible();
    await expect(first.getByText('Matches the audit trail record')).toBeVisible();
    expect(await panel.innerText()).not.toMatch(FORBIDDEN_WORDING);
    await expectNoAxeViolations(page);
  });

  test('copies the text, and keeps it out of the address', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions differ');
    const block = page.getByTestId('content-block').first();
    const text = (await block.getByTestId('content-text').innerText()).trim();
    await block.getByRole('button', { name: 'Copy text' }).click();
    await expect(block.getByText(/^Copied /)).toBeAttached();
    expect((await page.evaluate(() => navigator.clipboard.readText())).trim()).toBe(text);
    expect(page.url()).not.toContain(encodeURIComponent(text.slice(0, 15)));
  });

  test('opens a step from its text and shows the text in the event record too', async ({ page }) => {
    await page.getByTestId('content-block').first().getByRole('button', { name: /^Open step/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Raw text', level: 3 })).toBeVisible();
    await expect(dialog.getByTestId('content-text')).not.toBeEmpty();
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
  });

  test('can be read with the keyboard: the text area takes focus', async ({ page }) => {
    const area = page.getByTestId('content-text').first();
    await area.focus();
    await expect(area).toBeFocused();
  });

  test('shows a long text in part and says so', async ({ page }) => {
    await goTo(page, '#/explorer?range=7d&action=command.received');
    await page.getByRole('button', { name: /command\.received/ }).first().waitFor();
    const traceIds = await page.evaluate(async () => {
      const api = (window as unknown as { __probaAudit: { searchEvents(q: object): Promise<{ events: { traceId: string; hasContent?: boolean }[] }> } }).__probaAudit;
      const page = await api.searchEvents({ action: 'command.received', limit: 200, from: new Date(Date.now() - 7 * 86_400_000).toISOString() });
      return page.events.map((e) => e.traceId);
    });
    let seen = false;
    for (const id of traceIds) {
      await goTo(page, `#/traces/${id}`);
      await expect(page.getByTestId('content-panel')).toBeVisible();
      if (await page.getByText(/Shortened when it was recorded/).count()) {
        await expect(page.getByText('2,000 of 18,250 characters', { exact: true })).toBeVisible();
        seen = true;
        break;
      }
    }
    expect(seen).toBe(true);
  });
});

test.describe('Raw text, viewer', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.sessionStorage.setItem('proba.e2e.role', 'viewer'));
    await signIn(page, { hash: '#/traces' });
    await openFirstTrace(page);
  });

  test('shows no raw text panel and never asks for the text', async ({ page }) => {
    await expect(page.getByTestId('content-panel')).toHaveCount(0);
    await expect(page.getByText('Raw text')).toHaveCount(0);
    await page.getByRole('tree').getByRole('button', { name: 'command.received', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Raw event' })).toBeVisible();
    await expect(dialog.getByText('Raw text')).toHaveCount(0);
    const calls = await page.evaluate(() => (window as unknown as { __probaAudit: { calls: Record<string, number> } }).__probaAudit.calls);
    expect(calls['getTraceContent']).toBeUndefined();
    expect(calls['getEventContent']).toBeUndefined();
    await expectNoAxeViolations(page);
  });
});

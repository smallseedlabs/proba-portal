import { test, expect } from '@playwright/test';
import { ACCOUNT, mockFirebase } from '../support/firebase-mock';
import { mockAuditApi, API_ORIGIN } from '../support/audit-api-mock';
import { goTo } from '../support/app';

async function signInThroughNetwork(page: import('@playwright/test').Page, hash = '') {
  await page.goto(`/${hash}`);
  await page.getByLabel('Work email').fill(ACCOUNT.email);
  await page.getByLabel('Password', { exact: true }).fill(ACCOUNT.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test.describe('over the audit API', () => {
  test('sends the Firebase ID token as a bearer token and shows what the API returns', async ({ page }) => {
    const firebase = await mockFirebase(page);
    const api = await mockAuditApi(page);
    await signInThroughNetwork(page);
    await expect(page.getByRole('table', { name: 'Audit events' })).toBeVisible();

    expect(api.count('/v1/session')).toBe(1);
    const events = api.requests.find((r) => r.path === '/v1/events')!;
    expect(events.authorization).toBe(`Bearer ${firebase.issued[0]}`);
    expect(Number(events.query.limit)).toBeGreaterThan(0);
    expect(events.query.from).toBeTruthy();
    await expect(page.getByRole('link', { name: /Memory/ })).toHaveCount(0);
  });

  test('refreshes the token once and retries when the API answers 401', async ({ page }) => {
    const firebase = await mockFirebase(page);
    const api = await mockAuditApi(page);
    await signInThroughNetwork(page);
    await expect(page.getByRole('table', { name: 'Audit events' })).toBeVisible();

    api.rejectTokens.add(firebase.issued[0]!);
    const refreshesBefore = firebase.count('firebase:refresh');
    await goTo(page, '#/analytics');
    await expect(page.getByTestId('metric-chart')).toBeVisible();
    expect(firebase.count('firebase:refresh')).toBeGreaterThan(refreshesBefore);
    const analytics = api.requests.filter((r) => r.path === '/v1/analytics/summary');
    expect(analytics[0]!.authorization).toBe(`Bearer ${firebase.issued[0]}`);
    // Three requests were rejected together; they shared one refresh.
    expect(firebase.count('firebase:refresh') - refreshesBefore).toBe(1);
    expect(analytics.at(-1)!.authorization).toBe(`Bearer ${firebase.issued.at(-1)}`);
  });

  test('returns to sign-in, with an explanation, when the session can no longer be renewed', async ({ page }) => {
    const firebase = await mockFirebase(page);
    const api = await mockAuditApi(page);
    await signInThroughNetwork(page);
    await expect(page.getByRole('table', { name: 'Audit events' })).toBeVisible();

    firebase.refreshRevoked = true;
    api.rejectAll = true;
    await goTo(page, '#/traces');
    await expect(page.getByRole('heading', { name: 'Sign in to Proba Insights' })).toBeVisible();
    await expect(page.getByText(/session (has )?expired|sign in again/i).first()).toBeVisible();
  });

  test('shows a clear access screen when the account is not allowed', async ({ page }) => {
    await mockFirebase(page);
    const api = await mockAuditApi(page);
    api.forbidSession = true;
    await signInThroughNetwork(page);
    await expect(page.getByRole('heading', { name: 'You don’t have access to Proba Insights' })).toBeVisible();
    await expect(page.getByText(ACCOUNT.email)).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in to Proba Insights' })).toBeVisible();
  });

  test('pages with the cursors the API returns and passes filters as query parameters', async ({ page }) => {
    await mockFirebase(page);
    const api = await mockAuditApi(page);
    await signInThroughNetwork(page, '#/explorer?outcome=failure');
    await expect(page.getByRole('table', { name: 'Audit events' })).toBeVisible();
    await page.getByLabel('Rows per page').selectOption('25');
    await expect(page.getByText('Page 1')).toBeVisible();
    const next = page.getByRole('button', { name: /Next/ });
    if (await next.isEnabled()) {
      await next.click();
      await expect(page.getByText('Page 2')).toBeVisible();
      const withCursor = api.requests.filter((r) => r.path === '/v1/events' && r.query.cursor);
      expect(withCursor.length).toBeGreaterThan(0);
      expect(withCursor.at(-1)!.query.outcome).toBe('failure');
    }
    expect(api.requests.some((r) => r.path === '/v1/events' && r.query.outcome === 'failure')).toBe(true);
  });

  test('integrity checks are asked of the API and an altered record is reported', async ({ page }) => {
    await mockFirebase(page);
    const api = await mockAuditApi(page);
    await signInThroughNetwork(page, '#/integrity');
    await page.getByLabel('Period').selectOption('previous24');
    await page.getByRole('button', { name: 'Verify integrity' }).click();
    await expect(page.getByTestId('integrity-verdict')).toContainText('problem');
    expect(api.count('/v1/chain/verify')).toBe(1);
  });

  test('a viewer does not see the Integrity entry', async ({ page }) => {
    await mockFirebase(page);
    await mockAuditApi(page, { role: 'viewer' });
    await signInThroughNetwork(page);
    await expect(page.getByRole('table', { name: 'Audit events' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Integrity' })).toHaveCount(0);
  });

  test('explains an outage and recovers on retry', async ({ page }) => {
    await mockFirebase(page);
    await mockAuditApi(page);
    let fail = true;
    await page.route(`${API_ORIGIN}/v1/events*`, async (route) => {
      if (route.request().method() !== 'GET' || !fail) return route.fallback();
      fail = false;
      await route.fulfill({
        status: 503,
        headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'x-trace-id', 'x-trace-id': 'outage-ref', 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'unavailable', message: 'down', traceId: 'outage-ref' }),
      });
    });
    await signInThroughNetwork(page);
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('We couldn’t load events');
    await expect(alert).toContainText('outage-ref');
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('table', { name: 'Audit events' })).toBeVisible();
  });
});

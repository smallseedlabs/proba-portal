import { test, expect, type Page } from '@playwright/test';
import { ACCOUNT, mockFirebase } from '../support/firebase-mock';
import { mockAuditApi } from '../support/audit-api-mock';
import { MEMORY_ORIGIN, mockMemoryApi } from '../support/memory-api-mock';
import { goTo } from '../support/app';

async function signInThroughNetwork(page: Page, hash = '') {
  await page.goto(`/${hash}`);
  await page.getByLabel('Work email').fill(ACCOUNT.email);
  await page.getByLabel('Password', { exact: true }).fill(ACCOUNT.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test.describe('over the memory API', () => {
  test('sends the Firebase ID token as a bearer token, and no workspace, and shows what the API returns', async ({ page }) => {
    const firebase = await mockFirebase(page);
    await mockAuditApi(page);
    const memory = await mockMemoryApi(page);
    await signInThroughNetwork(page, '#/memory');
    await expect(page.getByRole('table', { name: 'Memories, newest first' })).toBeVisible();

    const list = memory.requests.find((r) => r.method === 'GET' && r.path === '/v1/memories')!;
    expect(list.authorization).toBe(`Bearer ${firebase.issued[0]}`);
    expect(Object.keys(list.query)).not.toContain('workspaceId');
    expect(page.url()).not.toContain(String(firebase.issued[0]));
  });

  test('sends a search as a POST body, never in the address', async ({ page }) => {
    await mockFirebase(page);
    await mockAuditApi(page);
    const memory = await mockMemoryApi(page);
    await signInThroughNetwork(page, '#/memory?category=semantic');
    await expect(page.getByRole('table')).toBeVisible();
    await page.getByLabel('Search memories').fill('campaign budget approval');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Memories ranked for the search' })).toBeVisible();
    const search = memory.requests.filter((r) => r.method === 'POST' && r.path === '/v1/memories/search').at(-1)!;
    expect(search.body).toEqual({ query: 'campaign budget approval', filter: { categories: ['semantic'] }, limit: 25 });
    expect(search.query).toEqual({});
  });

  test('asks for the candidates of an inspected search, and opens the logged retrieval from its history', async ({ page }) => {
    await mockFirebase(page);
    await mockAuditApi(page);
    const memory = await mockMemoryApi(page);
    await signInThroughNetwork(page, '#/retrievals');
    await page.getByLabel('Question').fill('campaign budget approval');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.getByTestId('candidates-table')).toBeVisible();
    expect(memory.requests.find((r) => r.path === '/v1/memories/search')!.body).toMatchObject({ includeCandidates: true });
    expect((memory.requests.find((r) => r.path === '/v1/memories/search')!.body as { query: string }).query).toBe('campaign budget approval');

    // A logged retrieval is opened by its address, and read from /v1/retrievals/{id}.
    const logged = await memory.source.searchMemories({ query: 'campaign budget approval', limit: 3 });
    await goTo(page, `#/retrievals/${logged.retrievalId}`);
    await expect(page.getByTestId('retrieval-panel')).toBeVisible();
    expect(memory.requests.some((r) => r.method === 'GET' && r.path === `/v1/retrievals/${logged.retrievalId}`)).toBe(true);
  });

  test('a viewer gets the screens they may see and is never sent to the administrator routes', async ({ page }) => {
    await mockFirebase(page);
    await mockAuditApi(page, { role: 'viewer' });
    const memory = await mockMemoryApi(page, { role: 'viewer' });
    await signInThroughNetwork(page, '#/jobs');
    await expect(page.getByTestId('not-permitted')).toBeVisible();
    await expect(page.getByText('Not permitted')).toBeVisible();
    await goTo(page, '#/retrievals/3f2b8c1e-5a7d-4e90-b1c2-6d8f0a9e4b73');
    await expect(page.getByTestId('not-permitted')).toBeVisible();
    await goTo(page, '#/profiles');
    await expect(page.getByTestId('not-permitted')).toBeVisible();
    expect(
      memory.requests.some(
        (r) => r.path === '/v1/jobs/runs' || r.path.startsWith('/v1/retrievals/') || r.path === '/v1/profiles'
      )
    ).toBe(false);
  });

  test('explains a service that does not provide job runs', async ({ page }) => {
    await mockFirebase(page);
    await mockAuditApi(page);
    await mockMemoryApi(page, { unserved: ['jobs'] });
    await signInThroughNetwork(page, '#/jobs');
    await expect(page.getByText('This memory service does not report job runs')).toBeVisible();
  });

  test('explains an outage with a reference, and recovers on retry', async ({ page }) => {
    await mockFirebase(page);
    await mockAuditApi(page);
    await mockMemoryApi(page);
    let fail = true;
    await page.route(`${MEMORY_ORIGIN}/v1/profiles*`, async (route) => {
      if (route.request().method() !== 'GET' || !fail) return route.fallback();
      fail = false;
      await route.fulfill({
        status: 503,
        headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'x-trace-id', 'x-trace-id': 'memory-outage-ref', 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'unavailable', message: 'down', traceId: 'memory-outage-ref' }),
      });
    });
    await signInThroughNetwork(page, '#/profiles');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('We couldn’t load the scoring profiles');
    await expect(alert).toContainText('memory-outage-ref');
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('table', { name: 'Scoring profile versions' })).toBeVisible();
  });
});

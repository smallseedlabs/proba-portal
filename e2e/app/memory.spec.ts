import { test, expect, type Page } from '@playwright/test';
import { FORBIDDEN_WORDING, expectNoAxeViolations, goTo, signIn } from '../support/app';

const THREE = '7a1c0000-0000-4000-8000-000000000003';
const NAV = (page: Page) => page.getByRole('navigation', { name: 'Main' }).first();

async function mainText(page: Page) {
  return page.locator('main').innerText();
}

test.describe('Memory Explorer', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, { hash: '#/memory' });
    await expect(page.getByRole('table', { name: 'Memories, newest first' })).toBeVisible();
  });

  test('lists memories, carries no placeholder wording and is accessible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Memory Explorer', level: 1 })).toBeVisible();
    expect(await mainText(page)).not.toMatch(FORBIDDEN_WORDING);
    await expectNoAxeViolations(page);
  });

  test('searches and keeps the question, filters and page in the address', async ({ page }) => {
    await page.getByLabel('Search memories').fill('campaign budget approval');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const table = page.getByRole('table', { name: 'Memories ranked for the search' });
    await expect(table).toBeVisible();
    await expect(table.getByRole('link').first()).toContainText('5,000 USD');
    await expect(page).toHaveURL(/q=campaign\+budget\+approval/);
    await page.getByLabel('Category').selectOption('semantic');
    await expect(page).toHaveURL(/category=semantic/);
    await expectNoAxeViolations(page);
  });

  test('filters by status and source, and opens a memory', async ({ page }) => {
    await page.getByLabel('Status').selectOption('superseded');
    await expect(page.getByRole('table').getByText('Replaced').first()).toBeVisible();
    await page.getByLabel('Status').selectOption('');
    await page.getByLabel('Source').selectOption('approval');
    await expect(page).toHaveURL(/source=approval/);
    await page.getByRole('table').getByRole('link').first().click();
    await expect(page.getByRole('heading', { name: 'What Proba remembers' })).toBeVisible();
  });

  test('fits a phone-sized screen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await goTo(page, '#/memory?category=semantic');
    await expect(page.getByRole('table', { name: 'Memories, newest first' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });
});

test.describe('Memory Detail', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, { hash: `#/memory/${THREE}` });
    await expect(page.getByTestId('memory-content')).toBeVisible();
  });

  test('shows provenance, links, the replacement history and the retrieval history, and is accessible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Where it came from' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Links to other memories' })).toBeVisible();
    const chain = page.getByRole('list', { name: 'Memories in order, newest first' });
    await expect(chain.getByRole('listitem')).toHaveCount(3);
    await expect(page.getByRole('heading', { name: 'Retrieval history' })).toBeVisible();
    expect(await mainText(page)).not.toMatch(FORBIDDEN_WORDING);
    await expectNoAxeViolations(page);
  });

  test('follows the replacement history to an earlier memory', async ({ page }) => {
    await page.getByRole('list', { name: 'Memories in order, newest first' }).getByRole('link').first().click();
    await expect(page).toHaveURL(/#\/memory\/7a1c0000-0000-4000-8000-000000000002/);
    await expect(page.getByTestId('memory-content')).toContainText('3,000 USD');
    await expect(page.getByText('Replaced', { exact: true }).first()).toBeVisible();
  });

  test('opens a retrieval from the retrieval history', async ({ page }) => {
    await page.getByRole('table', { name: 'Retrievals that returned this memory' }).getByRole('link').first().click();
    await expect(page.getByTestId('retrieval-panel')).toBeVisible();
  });
});

test.describe('Retrieval Inspector', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, { hash: '#/retrievals' });
    await expect(page.getByText('No retrieval open')).toBeVisible();
  });

  test('runs a search and shows every candidate with its feature scores, and is accessible', async ({ page }) => {
    await expectNoAxeViolations(page);
    await page.getByLabel('Question').fill('when does a campaign budget need administrator approval');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    const table = page.getByRole('table', { name: 'Candidates considered for this retrieval' });
    await expect(table).toBeVisible();
    for (const header of ['Score', 'Relevance', 'Recency', 'Importance', 'Confidence', 'Usefulness']) {
      await expect(table.getByRole('columnheader', { name: header, exact: true })).toBeVisible();
    }
    await expect(table.getByText('Returned #1')).toBeVisible();
    expect(await mainText(page)).not.toMatch(FORBIDDEN_WORDING);
    await expectNoAxeViolations(page);
  });

  test('filters candidates and opens the breakdown of a score', async ({ page }) => {
    await page.getByLabel('Question').fill('campaign budget approval');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.getByTestId('candidates-table')).toBeVisible();
    await page.getByRole('button', { name: 'Returned', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Returned', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('candidates-table').locator('summary').first().click();
    await expect(page.getByText('Combined rank').first()).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

test.describe('Scoring profiles', () => {
  test('lists every version, the active one and, for administrators, the configuration', async ({ page }) => {
    await signIn(page, { hash: '#/profiles' });
    await expect(page.getByTestId('active-default')).toHaveText('Version 2');
    await expect(page.getByRole('table', { name: 'Scoring profile versions' })).toBeVisible();
    await page.locator('summary', { hasText: 'Configuration' }).first().click();
    await expect(page.getByText('Share of the score').first()).toBeVisible();
    expect(await mainText(page)).not.toMatch(FORBIDDEN_WORDING);
    await expectNoAxeViolations(page);
  });
});

test.describe('Jobs', () => {
  test('lists recent runs with their results, and is accessible', async ({ page }) => {
    await signIn(page, { hash: '#/jobs' });
    const table = page.getByRole('table', { name: /Recent background job runs/ });
    await expect(table).toBeVisible();
    await expect(table.getByText('Failed').first()).toBeVisible();
    await page.getByLabel('Result').selectOption('failed');
    await expect(table.getByRole('row')).toHaveCount(2);
    expect(await mainText(page)).not.toMatch(FORBIDDEN_WORDING);
    await expectNoAxeViolations(page);
  });
});

test.describe('Memory screens for people who are not administrators', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.sessionStorage.setItem('proba.e2e.role', 'viewer'));
    await signIn(page, { hash: '#/memory' });
  });

  test('offer only what they may see', async ({ page }) => {
    await expect(page.getByRole('table', { name: 'Memories, newest first' })).toBeVisible();
    await expect(page.getByLabel('Status')).toHaveCount(0);
    await expect(NAV(page).getByRole('link', { name: 'Memory Explorer' })).toBeVisible();
    await expect(NAV(page).getByRole('link', { name: 'Scoring profiles' })).toHaveCount(0);
    await expect(NAV(page).getByRole('link', { name: 'Retrieval Inspector' })).toHaveCount(0);
    await expect(NAV(page).getByRole('link', { name: 'Jobs' })).toHaveCount(0);
    await expectNoAxeViolations(page);
  });

  test('are told, not shown an error, when they open an administrator screen by its address', async ({ page }) => {
    for (const hash of ['#/jobs', '#/retrievals', '#/profiles'] as const) {
      await goTo(page, hash);
      await expect(page.getByTestId('not-permitted')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Not permitted' })).toBeVisible();
    }
    await expectNoAxeViolations(page);
  });

  test('read a memory without the retrieval history', async ({ page }) => {
    await goTo(page, `#/memory/${THREE}`);
    await expect(page.getByTestId('memory-content')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Retrieval history' })).toHaveCount(0);
    await expect(page.getByText('Extraction model')).toHaveCount(0);
    await expectNoAxeViolations(page);
  });
});

test.describe('Navigation', () => {
  test('moves between the memory screens, and the page title follows', async ({ page }) => {
    await signIn(page);
    const group = page.getByRole('navigation', { name: 'Main' }).first().getByRole('group', { name: 'Memory' });
    for (const [name, heading] of [['Memory Explorer', 'Memory Explorer'], ['Retrieval Inspector', 'Retrieval Inspector'], ['Scoring profiles', 'Scoring profiles'], ['Jobs', 'Jobs']] as const) {
      await group.getByRole('link', { name, exact: true }).click();
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
      await expect(page).toHaveTitle(new RegExp(`${heading}.*Proba Insights`));
    }
  });
});

import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ACCOUNT, mockFirebase, type FirebaseMock } from './firebase-mock';

/** Text that must never be visible to a person using the product. */
export const FORBIDDEN_WORDING = /\b(test|testing|dev|mock|fixture|dev login|alpha|beta|prototype|stub|demo|placeholder|coming soon|lorem ipsum)\b/i;

export async function openSignIn(page: Page): Promise<FirebaseMock> {
  const firebase = await mockFirebase(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in to Proba Insights' })).toBeVisible();
  return firebase;
}

/** Signs in with email and password and waits for the app shell. */
export async function signIn(page: Page, options: { hash?: string } = {}): Promise<FirebaseMock> {
  const firebase = await mockFirebase(page);
  await page.goto(`/${options.hash ?? ''}`);
  await expect(page.getByRole('heading', { name: 'Sign in to Proba Insights' })).toBeVisible();
  await page.getByLabel('Work email').fill(ACCOUNT.email);
  await page.getByLabel('Password', { exact: true }).fill(ACCOUNT.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main' }).first()).toBeVisible();
  return firebase;
}

export async function goTo(page: Page, hash: string) {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
}

export async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
  expect(summary).toEqual([]);
}

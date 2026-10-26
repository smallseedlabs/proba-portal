import { test, expect } from '@playwright/test';
import { ACCOUNT } from '../support/firebase-mock';
import { FORBIDDEN_WORDING, expectNoAxeViolations, openSignIn, signIn } from '../support/app';

test.describe('signing in', () => {
  test('has no development wording and passes the accessibility checks', async ({ page }) => {
    await openSignIn(page);
    expect(await page.locator('body').innerText()).not.toMatch(FORBIDDEN_WORDING);
    await expectNoAxeViolations(page);
  });

  test('fits a phone-sized screen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await openSignIn(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  });

  test('validates before contacting the identity provider', async ({ page }) => {
    const firebase = await openSignIn(page);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Enter your work email address.')).toBeVisible();
    await expect(page.getByText('Enter your password.')).toBeVisible();
    expect(firebase.count('firebase:signInWithPassword')).toBe(0);
  });

  test('says plainly that the email or password is wrong, and keeps the email', async ({ page }) => {
    await openSignIn(page);
    await page.getByLabel('Work email').fill(ACCOUNT.email);
    await page.getByLabel('Password', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('The email or password you entered is incorrect.');
    await expect(page.getByLabel('Work email')).toHaveValue(ACCOUNT.email);
    await expect(page.getByRole('heading', { name: 'Audit Explorer' })).toHaveCount(0);
  });

  test('sends a password reset link', async ({ page }) => {
    const firebase = await openSignIn(page);
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await page.getByLabel('Work email').fill(ACCOUNT.email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText(new RegExp(`If an account exists for ${ACCOUNT.email}`))).toBeVisible();
    expect(firebase.count('firebase:sendOobCode')).toBe(1);
    await page.getByRole('button', { name: 'Back to sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in to Proba Insights' })).toBeVisible();
  });

  test('opens the page that was asked for after signing in, stays signed in on reload, and signs out', async ({ page }) => {
    await signIn(page, { hash: '#/analytics' });
    await expect(page.getByRole('heading', { name: 'Analytics', level: 1 })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Analytics', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sign in to Proba Insights' })).toHaveCount(0);

    await page.getByRole('button', { name: /account menu/ }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in to Proba Insights' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Sign in to Proba Insights' })).toBeVisible();
  });

  test('keeps the signed-in session out of persistent storage', async ({ page }) => {
    await signIn(page);
    const persisted = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    expect(persisted).not.toContain('apiKey');
    expect(persisted).not.toContain(ACCOUNT.email);
  });
});

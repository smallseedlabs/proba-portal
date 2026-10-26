import type { Page, Route } from '@playwright/test';

/**
 * Network-level stand-ins for Firebase Authentication (the identitytoolkit and securetoken REST APIs
 * the Firebase JS SDK uses), so the real SDK runs with no Firebase project. Values match the e2e
 * builds in package.json.
 */
export const PROJECT_ID = 'proba-e2e';

export const ACCOUNT = {
  uid: 'firebase-uid-amelia',
  email: 'amelia.frost@northwind.example',
  password: 'correct-horse-battery',
  name: 'Amelia Frost',
};

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** A Firebase-shaped ID token. The browser never verifies signatures; the audit API does. */
export function idToken(n: number): string {
  const now = Math.floor(Date.now() / 1000);
  return [
    b64url({ alg: 'RS256', kid: 'e2e', typ: 'JWT' }),
    b64url({
      iss: `https://securetoken.google.com/${PROJECT_ID}`,
      aud: PROJECT_ID,
      auth_time: now,
      user_id: ACCOUNT.uid,
      sub: ACCOUNT.uid,
      iat: now,
      exp: now + 3600,
      email: ACCOUNT.email,
      email_verified: true,
      name: ACCOUNT.name,
      n,
      firebase: { identities: { email: [ACCOUNT.email] }, sign_in_provider: 'password' },
    }),
    'c2lnbmF0dXJl',
  ].join('.');
}

export interface FirebaseMock {
  calls: { name: string; body?: unknown }[];
  /** ID tokens issued so far (sign-in and refreshes), oldest first. */
  issued: string[];
  /** When true, Firebase can no longer refresh the ID token (refresh token revoked). */
  refreshRevoked: boolean;
  count(name: string): number;
}

async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

export async function mockFirebase(page: Page): Promise<FirebaseMock> {
  const mock: FirebaseMock = {
    calls: [],
    issued: [],
    refreshRevoked: false,
    count: (name) => mock.calls.filter((c) => c.name === name).length,
  };
  const issue = () => {
    const token = idToken(mock.issued.length + 1);
    mock.issued.push(token);
    return token;
  };
  const firebaseError = (route: Route, message: string) =>
    json(route, 400, { error: { code: 400, message, errors: [{ message, reason: 'invalid' }] } });

  await page.route('https://identitytoolkit.googleapis.com/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(request.url());
    const method = url.pathname.split(':').pop() ?? url.pathname;
    const body = request.postDataJSON() as Record<string, unknown> | null;
    mock.calls.push({ name: `firebase:${method}`, body });

    switch (method) {
      case 'signInWithPassword':
        if (body?.email !== ACCOUNT.email || body?.password !== ACCOUNT.password) {
          return firebaseError(route, 'INVALID_LOGIN_CREDENTIALS');
        }
        return json(route, 200, {
          kind: 'identitytoolkit#VerifyPasswordResponse',
          localId: ACCOUNT.uid,
          email: ACCOUNT.email,
          displayName: ACCOUNT.name,
          idToken: issue(),
          registered: true,
          refreshToken: 'refresh-token',
          expiresIn: '3600',
        });
      case 'lookup':
        return json(route, 200, {
          kind: 'identitytoolkit#GetAccountInfoResponse',
          users: [
            {
              localId: ACCOUNT.uid,
              email: ACCOUNT.email,
              emailVerified: true,
              displayName: ACCOUNT.name,
              providerUserInfo: [{ providerId: 'password', email: ACCOUNT.email, rawId: ACCOUNT.email }],
              validSince: '1700000000',
              lastLoginAt: String(Date.now()),
              createdAt: '1700000000000',
            },
          ],
        });
      case 'sendOobCode':
        return json(route, 200, { kind: 'identitytoolkit#GetOobConfirmationCodeResponse', email: body?.email });
      default:
        return firebaseError(route, 'OPERATION_NOT_ALLOWED');
    }
  });

  await page.route('https://securetoken.googleapis.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    mock.calls.push({ name: 'firebase:refresh' });
    if (mock.refreshRevoked) return firebaseError(route, 'TOKEN_EXPIRED');
    const token = issue();
    return json(route, 200, {
      access_token: token,
      expires_in: '3600',
      token_type: 'Bearer',
      refresh_token: 'refresh-token',
      id_token: token,
      user_id: ACCOUNT.uid,
      project_id: PROJECT_ID,
    });
  });

  return mock;
}

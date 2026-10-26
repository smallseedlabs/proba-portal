import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FirebaseAuthClient, toAuthError, type IdentityProvider, type IdentityUser } from './firebase';
import { AuthError } from './types';

const CONFIG = { apiKey: 'k', authDomain: 'proba.firebaseapp.com', projectId: 'proba', appId: 'app' };

function firebaseError(code: string) {
  return Object.assign(new Error(code), { code });
}

function user(tokens: string[] = ['id-1', 'id-2']): IdentityUser & { getIdToken: ReturnType<typeof vi.fn> } {
  let i = 0;
  return {
    uid: 'uid-1',
    email: 'ana@acme.com',
    displayName: 'Ana Reyes',
    getIdToken: vi.fn(async () => tokens[Math.min(i++, tokens.length - 1)]),
  };
}

function setup(identity: Partial<IdentityProvider> = {}) {
  const signedIn = user();
  const provider: IdentityProvider = {
    signInWithPassword: vi.fn().mockResolvedValue(signedIn),
    signInWithGoogle: vi.fn().mockResolvedValue(signedIn),
    sendPasswordReset: vi.fn().mockResolvedValue(undefined),
    currentUser: vi.fn().mockResolvedValue(signedIn),
    signOut: vi.fn().mockResolvedValue(undefined),
    ...identity,
  };
  const loadIdentity = vi.fn().mockResolvedValue(provider);
  const client = new FirebaseAuthClient({ firebase: CONFIG, loadIdentity });
  return { client, provider, loadIdentity, signedIn };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('FirebaseAuthClient', () => {
  it('signs in with email and password and exposes the person and their ID token', async () => {
    const { client, provider, loadIdentity, signedIn } = setup();
    const session = await client.signIn({ email: 'ana@acme.com', password: 'pw' });
    expect(loadIdentity).toHaveBeenCalledWith(CONFIG);
    expect(provider.signInWithPassword).toHaveBeenCalledWith('ana@acme.com', 'pw');
    expect(session.user).toEqual({ id: 'uid-1', email: 'ana@acme.com', name: 'Ana Reyes' });
    await expect(session.getIdToken()).resolves.toBe('id-1');
    await session.getIdToken(true);
    expect(signedIn.getIdToken).toHaveBeenLastCalledWith(true);
  });

  it('names a person without a display name from their email', async () => {
    const { client } = setup({ signInWithPassword: vi.fn().mockResolvedValue({ ...user(), displayName: null }) });
    expect((await client.signIn({ email: 'ana@acme.com', password: 'pw' })).user.name).toBe('ana');
  });

  it('continues with Google', async () => {
    const { client, provider } = setup();
    await client.signInWithGoogle();
    expect(provider.signInWithGoogle).toHaveBeenCalled();
  });

  it.each([
    ['auth/invalid-credential', 'invalid_credentials'],
    ['auth/wrong-password', 'invalid_credentials'],
    ['auth/too-many-requests', 'rate_limited'],
    ['auth/user-disabled', 'account_disabled'],
    ['auth/popup-closed-by-user', 'cancelled'],
    ['auth/popup-blocked', 'popup_blocked'],
    ['auth/network-request-failed', 'network'],
    ['auth/unauthorized-domain', 'unavailable'],
    ['auth/something-new', 'unknown'],
  ])('maps %s to %s', async (code, expected) => {
    const { client } = setup({ signInWithPassword: vi.fn().mockRejectedValue(firebaseError(code)) });
    await expect(client.signIn({ email: 'a@b.co', password: 'x' })).rejects.toMatchObject({ code: expected });
  });

  it('is unavailable, not crashed, when Firebase is not configured', async () => {
    const client = new FirebaseAuthClient({ firebase: null });
    expect(client.configured).toBe(false);
    await expect(client.signIn({ email: 'a@b.co', password: 'x' })).rejects.toMatchObject({ code: 'unavailable' });
    await expect(client.restore()).resolves.toBeNull();
    await expect(client.signOut()).resolves.toBeUndefined();
  });

  it('reports a failure to load the SDK as unavailable and tries again next time', async () => {
    const loadIdentity = vi.fn().mockRejectedValueOnce(new Error('chunk failed')).mockResolvedValue(setup().provider);
    const client = new FirebaseAuthClient({ firebase: CONFIG, loadIdentity });
    await expect(client.signIn({ email: 'a@b.co', password: 'x' })).rejects.toMatchObject({ code: 'unavailable' });
    await expect(client.signIn({ email: 'a@b.co', password: 'x' })).resolves.toBeDefined();
  });

  it('maps a token refresh failure to an expired session', async () => {
    const { client, signedIn } = setup();
    const session = await client.signIn({ email: 'a@b.co', password: 'x' });
    signedIn.getIdToken.mockRejectedValue(firebaseError('auth/user-token-expired'));
    await expect(session.getIdToken(true)).rejects.toMatchObject({ code: 'session_expired' });
  });

  it('does not reveal whether an account exists when sending a reset link', async () => {
    const { client } = setup({ sendPasswordReset: vi.fn().mockRejectedValue(firebaseError('auth/user-not-found')) });
    await expect(client.sendPasswordReset('ghost@acme.com')).resolves.toBeUndefined();
    const failing = setup({ sendPasswordReset: vi.fn().mockRejectedValue(firebaseError('auth/network-request-failed')) });
    await expect(failing.client.sendPasswordReset('a@b.co')).rejects.toMatchObject({ code: 'network' });
  });

  it('restores a signed-in person after a reload, or nothing', async () => {
    expect((await setup().client.restore())?.user.email).toBe('ana@acme.com');
    expect(await setup({ currentUser: vi.fn().mockResolvedValue(null) }).client.restore()).toBeNull();
    expect(await setup({ currentUser: vi.fn().mockRejectedValue(new Error('x')) }).client.restore()).toBeNull();
  });

  it('signs out of Firebase and never throws doing so', async () => {
    const { client, provider } = setup();
    await client.signOut();
    expect(provider.signOut).toHaveBeenCalled();
    const failing = setup({ signOut: vi.fn().mockRejectedValue(new Error('x')) });
    await expect(failing.client.signOut()).resolves.toBeUndefined();
  });
});

describe('toAuthError', () => {
  it('keeps AuthErrors and turns anything else into an unknown error', () => {
    const original = new AuthError('rate_limited');
    expect(toAuthError(original)).toBe(original);
    expect(toAuthError('boom').code).toBe('unknown');
    expect(toAuthError(null).code).toBe('unknown');
  });
});

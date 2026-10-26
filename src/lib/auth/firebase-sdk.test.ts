import { describe, it, expect, vi } from 'vitest';

// Module-level mock of the Firebase JS SDK: no Firebase project or network.
const auth = { currentUser: null as unknown, authStateReady: vi.fn(async () => {}) };
const user = { getIdToken: vi.fn() };

vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({ name: '[DEFAULT]' })) }));
vi.mock('firebase/auth', () => {
  class GoogleAuthProvider {
    params: Record<string, string> = {};
    setCustomParameters(p: Record<string, string>) {
      this.params = p;
    }
  }
  return {
    initializeAuth: vi.fn(() => auth),
    browserSessionPersistence: { type: 'SESSION' },
    browserPopupRedirectResolver: { resolver: true },
    GoogleAuthProvider,
    signInWithEmailAndPassword: vi.fn(async () => ({ user })),
    signInWithPopup: vi.fn(async () => ({ user })),
    sendPasswordResetEmail: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
  };
});

const CONFIG = { apiKey: 'k', authDomain: 'proba.firebaseapp.com', projectId: 'proba', appId: 'app' };

describe('createFirebaseIdentity', () => {
  it('initialises Firebase once from the web config with per-tab persistence', async () => {
    const { initializeApp } = await import('firebase/app');
    const fa = await import('firebase/auth');
    const { createFirebaseIdentity } = await import('./firebase-sdk');

    createFirebaseIdentity(CONFIG);
    createFirebaseIdentity(CONFIG);
    expect(initializeApp).toHaveBeenCalledTimes(1);
    expect(initializeApp).toHaveBeenCalledWith(CONFIG);
    expect(fa.initializeAuth).toHaveBeenCalledWith(expect.anything(), {
      persistence: fa.browserSessionPersistence,
      popupRedirectResolver: fa.browserPopupRedirectResolver,
    });
  });

  it('wraps the modular auth API', async () => {
    const fa = await import('firebase/auth');
    const { createFirebaseIdentity } = await import('./firebase-sdk');
    const identity = createFirebaseIdentity(CONFIG);

    await expect(identity.signInWithPassword('ana@acme.com', 'pw')).resolves.toBe(user);
    expect(fa.signInWithEmailAndPassword).toHaveBeenCalledWith(auth, 'ana@acme.com', 'pw');

    await expect(identity.signInWithGoogle()).resolves.toBe(user);
    const provider = vi.mocked(fa.signInWithPopup).mock.calls[0][1] as unknown as { params: Record<string, string> };
    expect(provider).toBeInstanceOf(fa.GoogleAuthProvider);
    expect(provider.params).toEqual({ prompt: 'select_account' });

    await identity.sendPasswordReset('ana@acme.com');
    expect(fa.sendPasswordResetEmail).toHaveBeenCalledWith(auth, 'ana@acme.com');

    auth.currentUser = user;
    await expect(identity.currentUser()).resolves.toBe(user);
    expect(auth.authStateReady).toHaveBeenCalled();

    await identity.signOut();
    expect(fa.signOut).toHaveBeenCalledWith(auth);
  });
});

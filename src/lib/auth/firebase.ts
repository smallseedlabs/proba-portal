import { AuthError, type AuthClient, type AuthErrorCode, type Credentials, type Session } from './types';

/** Firebase web app config, from VITE_FIREBASE_* at build time (or window.ENV at runtime). */
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

/** The parts of a Firebase user the portal needs. */
export interface IdentityUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  /** Firebase returns the cached ID token, refreshing it when it is about to expire. */
  getIdToken(forceRefresh?: boolean): Promise<string>;
}

/** The Firebase Authentication operations the portal uses (see firebase-sdk.ts). */
export interface IdentityProvider {
  signInWithPassword(email: string, password: string): Promise<IdentityUser>;
  signInWithGoogle(): Promise<IdentityUser>;
  sendPasswordReset(email: string): Promise<void>;
  /** The signed-in user once Firebase has restored its state, or null. */
  currentUser(): Promise<IdentityUser | null>;
  signOut(): Promise<void>;
}

const FIREBASE_ERRORS: Record<string, AuthErrorCode> = {
  'auth/invalid-credential': 'invalid_credentials',
  'auth/invalid-login-credentials': 'invalid_credentials',
  'auth/wrong-password': 'invalid_credentials',
  'auth/user-not-found': 'invalid_credentials',
  'auth/missing-password': 'invalid_credentials',
  'auth/invalid-email': 'invalid_email',
  'auth/missing-email': 'invalid_email',
  'auth/too-many-requests': 'rate_limited',
  'auth/user-disabled': 'account_disabled',
  'auth/account-exists-with-different-credential': 'account_exists',
  'auth/popup-blocked': 'popup_blocked',
  'auth/popup-closed-by-user': 'cancelled',
  'auth/cancelled-popup-request': 'cancelled',
  'auth/user-cancelled': 'cancelled',
  'auth/network-request-failed': 'network',
  'auth/user-token-expired': 'session_expired',
  'auth/requires-recent-login': 'session_expired',
  'auth/invalid-user-token': 'session_expired',
  'auth/user-mismatch': 'session_expired',
  'auth/operation-not-allowed': 'unavailable',
  'auth/unauthorized-domain': 'unavailable',
  'auth/invalid-api-key': 'unavailable',
  'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'unavailable',
  'auth/configuration-not-found': 'unavailable',
  'auth/operation-not-supported-in-this-environment': 'unavailable',
  'auth/internal-error': 'unknown',
};

/** Map a Firebase Auth error (or anything else) to an AuthError. */
export function toAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) return error;
  const code = (error as { code?: unknown } | null)?.code;
  const mapped = typeof code === 'string' ? FIREBASE_ERRORS[code] : undefined;
  if (typeof code === 'string' && (mapped === 'unavailable' || !mapped)) {
    // Configuration problems are for the administrator, not the user.
    console.error(`Firebase Authentication error: ${code}`);
  }
  return new AuthError(mapped ?? 'unknown');
}

export interface FirebaseAuthClientOptions {
  /** null when the Firebase web config is incomplete: sign-in is unavailable. */
  firebase: FirebaseWebConfig | null;
  /** Defaults to the lazily loaded Firebase JS SDK. */
  loadIdentity?: (config: FirebaseWebConfig) => Promise<IdentityProvider>;
}

const defaultLoader = async (config: FirebaseWebConfig) =>
  (await import('./firebase-sdk')).createFirebaseIdentity(config);

function toSession(user: IdentityUser): Session {
  const email = user.email ?? '';
  return {
    user: { id: user.uid, email, name: user.displayName?.trim() || email.split('@')[0] || 'Signed-in user' },
    getIdToken: async (forceRefresh) => {
      try {
        return await user.getIdToken(forceRefresh);
      } catch (error) {
        throw toAuthError(error);
      }
    },
  };
}

/**
 * Sign-in with Firebase Authentication: the same Firebase project as proba-web and proba-hub. The
 * audit API verifies the ID token itself, so there is nothing to exchange: the session simply hands
 * out the current ID token.
 */
export class FirebaseAuthClient implements AuthClient {
  private identity: Promise<IdentityProvider> | null = null;
  private readonly load: (config: FirebaseWebConfig) => Promise<IdentityProvider>;

  constructor(private readonly options: FirebaseAuthClientOptions) {
    this.load = options.loadIdentity ?? defaultLoader;
  }

  get configured(): boolean {
    return this.options.firebase !== null;
  }

  private provider(): Promise<IdentityProvider> {
    const config = this.options.firebase;
    if (!config) {
      console.error(
        'Firebase is not configured: set VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID and VITE_FIREBASE_APP_ID.'
      );
      return Promise.reject(new AuthError('unavailable'));
    }
    if (!this.identity) {
      this.identity = this.load(config).catch((error) => {
        this.identity = null;
        throw error instanceof AuthError ? error : new AuthError('unavailable');
      });
    }
    return this.identity;
  }

  private async complete(signIn: (identity: IdentityProvider) => Promise<IdentityUser>): Promise<Session> {
    const identity = await this.provider();
    try {
      return toSession(await signIn(identity));
    } catch (error) {
      throw toAuthError(error);
    }
  }

  signIn({ email, password }: Credentials): Promise<Session> {
    return this.complete((identity) => identity.signInWithPassword(email, password));
  }

  signInWithGoogle(): Promise<Session> {
    return this.complete((identity) => identity.signInWithGoogle());
  }

  async sendPasswordReset(email: string): Promise<void> {
    const identity = await this.provider();
    try {
      await identity.sendPasswordReset(email);
    } catch (error) {
      const authError = toAuthError(error);
      // Do not reveal whether an account exists for this address.
      if (authError.code === 'invalid_credentials') return;
      throw authError;
    }
  }

  async restore(): Promise<Session | null> {
    if (!this.configured) return null;
    try {
      const user = await (await this.provider()).currentUser();
      return user ? toSession(user) : null;
    } catch {
      return null;
    }
  }

  async signOut(): Promise<void> {
    if (!this.configured) return;
    try {
      await (await this.provider()).signOut();
    } catch {
      // Best effort: the local session is always cleared.
    }
  }
}

import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserPopupRedirectResolver,
  browserSessionPersistence,
  GoogleAuthProvider,
  initializeAuth,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type Auth,
} from 'firebase/auth';
import type { FirebaseWebConfig, IdentityProvider } from './firebase';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

/**
 * The Firebase JS SDK (modular `firebase/auth`) behind the IdentityProvider
 * interface. Loaded lazily so the SDK is fetched only when sign-in needs it.
 * Persistence is per browser tab, like the Hub session it backs.
 */
export function createFirebaseIdentity(config: FirebaseWebConfig): IdentityProvider {
  if (!auth) {
    app = initializeApp({
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      appId: config.appId,
    });
    auth = initializeAuth(app, {
      persistence: browserSessionPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  }
  const a = auth;

  return {
    async signInWithPassword(email, password) {
      return (await signInWithEmailAndPassword(a, email, password)).user;
    },
    async signInWithGoogle() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      return (await signInWithPopup(a, provider)).user;
    },
    async sendPasswordReset(email) {
      await sendPasswordResetEmail(a, email);
    },
    async currentUser() {
      await a.authStateReady();
      return a.currentUser;
    },
    async signOut() {
      await signOut(a);
    },
  };
}

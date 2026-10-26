import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from './lib/api/errors';
import { createAuditApi } from './lib/api/factory';
import type { AuditApi } from './lib/api/port';
import type { ApiSession } from './lib/api/schemas';
import { AUTH_ERROR_MESSAGES, AuthError, FirebaseAuthClient, type Session } from './lib/auth';
import { useConfig } from './lib/config';
import { getLogger } from './lib/log/logger';
import { SignInPage } from './components/auth/SignInPage';
import { AppShell } from './components/shell/AppShell';
import { LogoMark } from './components/brand/Logo';
import { Button } from './components/ui/button';
import { Spinner } from './components/ui/feedback';
import { ApiProvider } from './state/api';

function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <LogoMark className="h-10 w-10" />
      <Spinner label="Loading Proba Insights" />
    </div>
  );
}

function Blocked({ title, message, action }: { title: string; message: string; action: { label: string; onClick: () => void } }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <LogoMark className="h-10 w-10" />
      <h1 className="mt-6 text-heading text-foreground">{title}</h1>
      <p className="mt-2 max-w-md text-body text-muted-foreground">{message}</p>
      <Button className="mt-6" onClick={action.onClick}>
        {action.label}
      </Button>
    </main>
  );
}

type Phase =
  | { name: 'starting' }
  | { name: 'signed-out'; notice: string | null }
  /** Signed in; checking with the audit API who this person is. */
  | { name: 'connecting'; session: Session }
  | { name: 'ready'; session: Session; api: AuditApi; access: ApiSession }
  | { name: 'no-access'; session: Session; error: ApiError };

export default function App() {
  const config = useConfig();
  const auth = useMemo(() => new FirebaseAuthClient({ firebase: config.firebase }), [config.firebase]);
  const [phase, setPhase] = useState<Phase>({ name: 'starting' });
  // The token source always reads the current session, so a refreshed token is used automatically.
  const sessionRef = useRef<Session | null>(null);

  // Resume a signed-in identity (e.g. after a reload) without asking again.
  useEffect(() => {
    let cancelled = false;
    void auth.restore().then((session) => {
      if (cancelled) return;
      sessionRef.current = session;
      setPhase(session ? { name: 'connecting', session } : { name: 'signed-out', notice: null });
    });
    return () => {
      cancelled = true;
    };
  }, [auth]);

  const handleSignedIn = useCallback((session: Session) => {
    sessionRef.current = session;
    setPhase({ name: 'connecting', session });
  }, []);

  const signedOut = useCallback((notice: string | null) => {
    sessionRef.current = null;
    setPhase({ name: 'signed-out', notice });
    window.location.hash = '';
  }, []);

  const handleSignOut = useCallback(() => {
    void auth.signOut();
    signedOut('You have been signed out.');
  }, [auth, signedOut]);

  const handleExpired = useCallback(() => {
    getLogger().warn('session.expired');
    void auth.signOut();
    signedOut(AUTH_ERROR_MESSAGES.session_expired);
  }, [auth, signedOut]);

  // Once signed in, build the data source and ask the audit API who this person is and what they may do.
  const connectingSession = phase.name === 'connecting' ? phase.session : null;
  useEffect(() => {
    if (!connectingSession) return;
    let cancelled = false;
    void (async () => {
      try {
        const api = await createAuditApi({
          apiBaseUrl: config.apiBaseUrl,
          getToken: async (forceRefresh) => {
            const session = sessionRef.current;
            if (!session) throw new AuthError('session_expired');
            return session.getIdToken(forceRefresh);
          },
        });
        const access = await api.getSession();
        getLogger().info('session.ready', { role: access.role, workspaceId: access.workspaceId });
        if (!cancelled) setPhase({ name: 'ready', session: connectingSession, api, access });
      } catch (error) {
        if (cancelled) return;
        const apiError = error instanceof ApiError ? error : new ApiError('unavailable', 'Proba is temporarily unavailable. Please try again shortly.');
        getLogger().warn('session.rejected', { kind: apiError.kind, status: apiError.status, traceId: apiError.traceId });
        if (apiError.kind === 'unauthenticated') {
          void auth.signOut();
          signedOut(AUTH_ERROR_MESSAGES.session_expired);
        } else {
          setPhase({ name: 'no-access', session: connectingSession, error: apiError });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connectingSession, config.apiBaseUrl, auth, signedOut]);

  if (phase.name === 'starting' || phase.name === 'connecting') return <Splash />;

  if (phase.name === 'signed-out') {
    return <SignInPage auth={auth} onSignedIn={handleSignedIn} notice={phase.notice} unavailable={!auth.configured} />;
  }

  if (phase.name === 'no-access') {
    const forbidden = phase.error.kind === 'forbidden';
    return (
      <Blocked
        title={forbidden ? 'You don’t have access to Proba Insights' : 'We couldn’t open Proba Insights'}
        message={
          forbidden
            ? `${phase.session.user.email} isn’t allowed to view this workspace. Ask your workspace administrator for access, or sign in with a different account.`
            : `${phase.error.message}${phase.error.traceId ? ` Reference ${phase.error.traceId}.` : ''}`
        }
        action={
          forbidden
            ? { label: 'Sign out', onClick: handleSignOut }
            : { label: 'Try again', onClick: () => setPhase({ name: 'connecting', session: phase.session }) }
        }
      />
    );
  }

  return (
    <ApiProvider
      api={phase.api}
      user={phase.session.user}
      access={phase.access}
      memoryUrl={config.memoryUrl}
      onSessionExpired={handleExpired}
      onSignOut={handleSignOut}
    >
      <AppShell />
    </ApiProvider>
  );
}

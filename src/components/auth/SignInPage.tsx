import { useId, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, CircleAlert, Eye, EyeOff, ScrollText, ShieldCheck, BarChart3 } from 'lucide-react';
import { AuthError, AUTH_ERROR_MESSAGES, type AuthClient, type Session } from '../../lib/auth';
import { Logo, LogoMark } from '../brand/Logo';
import { Button } from '../ui/button';
import { Callout } from '../ui/feedback';
import { FieldError, Input, Label } from '../ui/field';
import { validateEmail, validateSignIn } from '../../lib/auth/validation';

const highlights = [
  { icon: ScrollText, title: 'Every action, on the record', body: 'Search the full audit trail by person, service, outcome and risk, and open any event down to its raw record.' },
  { icon: ShieldCheck, title: 'Proof that nothing was changed', body: 'Verify the integrity of the audit chain for any period, so the record can be trusted.' },
  { icon: BarChart3, title: 'Performance you can compare', body: 'Impressions, clicks, spend and conversions across campaigns, against the period before.' },
];

type Pending = 'password' | 'google' | 'reset' | null;

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function FormAlert({ children }: { children: string }) {
  return (
    <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive-subtle px-4 py-3">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <p className="text-body text-foreground">{children}</p>
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof AuthError ? error.message : AUTH_ERROR_MESSAGES.unknown;
}

export function SignInPage({
  auth,
  onSignedIn,
  notice,
}: {
  auth: AuthClient;
  onSignedIn: (session: Session) => void;
  notice?: string | null;
}) {
  const [mode, setMode] = useState<'sign-in' | 'reset'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const ids = { email: useId(), password: useId(), emailError: useId(), passwordError: useId(), resetEmail: useId(), resetEmailError: useId() };
  const busy = pending !== null;

  const switchMode = (next: 'sign-in' | 'reset') => {
    setMode(next);
    setFormError(null);
    setErrors({});
    setResetSentTo(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    const nextErrors = validateSignIn(email, password);
    setErrors(nextErrors);
    if (nextErrors.email) return emailRef.current?.focus();
    if (nextErrors.password) return passwordRef.current?.focus();

    setPending('password');
    try {
      const session = await auth.signIn({ email: email.trim(), password });
      onSignedIn(session);
    } catch (error) {
      setFormError(errorMessage(error));
      setPending(null);
      passwordRef.current?.select();
    }
  };

  const continueWithGoogle = async () => {
    if (busy) return;
    setFormError(null);
    setPending('google');
    try {
      const session = await auth.signInWithGoogle();
      onSignedIn(session);
    } catch (error) {
      // Closing the Google window is not an error worth showing.
      if (!(error instanceof AuthError && error.code === 'cancelled')) setFormError(errorMessage(error));
      setPending(null);
    }
  };

  const sendReset = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    const emailError = validateEmail(email);
    setErrors({ email: emailError });
    if (emailError) return emailRef.current?.focus();

    setPending('reset');
    try {
      await auth.sendPasswordReset(email.trim());
      setResetSentTo(email.trim());
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setPending(null);
    }
  };

  const emailField = (id: string, errorId: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Work email</Label>
      <Input
        ref={emailRef}
        id={id}
        type="email"
        name="email"
        autoComplete="username"
        inputMode="email"
        autoFocus
        placeholder="name@company.com"
        value={email}
        disabled={busy}
        aria-invalid={errors.email ? true : undefined}
        aria-describedby={errors.email ? errorId : undefined}
        onChange={(e) => {
          setEmail(e.target.value);
          if (errors.email) setErrors((x) => ({ ...x, email: undefined }));
        }}
      />
      <FieldError id={errorId}>{errors.email}</FieldError>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="relative hidden w-[46%] max-w-[640px] flex-col justify-between overflow-hidden bg-sidebar px-12 py-10 text-sidebar-foreground lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              'radial-gradient(1200px 600px at -10% -10%, hsl(233 64% 45% / 0.55), transparent 60%), radial-gradient(800px 500px at 120% 110%, hsl(172 66% 32% / 0.35), transparent 60%)',
          }}
          aria-hidden="true"
        />
        <div className="relative">
          <Logo inverted />
        </div>
        <div className="relative max-w-md">
          <p className="text-display text-white">See everything your Proba workspace has done, and how it performed.</p>
          <ul className="mt-10 space-y-6">
            {highlights.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <Icon className="h-5 w-5 text-[#5EEAD4]" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-body font-semibold text-white">{title}</p>
                  <p className="mt-1 text-body text-sidebar-muted">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-caption text-sidebar-muted">© {new Date().getFullYear()} Small Seed Labs. All rights reserved.</p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>
          {mode === 'sign-in' ? (
            <>
              <div className="mb-8">
                <LogoMark className="mb-6 hidden h-10 w-10 lg:block" />
                <h1 className="text-heading text-foreground">Sign in to Proba Insights</h1>
                <p className="mt-2 text-body text-muted-foreground">Use your work account to open the audit trail and analytics for your workspace.</p>
              </div>

              {notice && !formError && (
                <Callout tone="info" role="status" className="mb-6">
                  {notice}
                </Callout>
              )}
              {formError && <FormAlert>{formError}</FormAlert>}

              <Button
                variant="outline"
                size="lg"
                className="w-full"
                loading={pending === 'google'}
                disabled={busy}
                onClick={continueWithGoogle}
              >
                {pending !== 'google' && <GoogleIcon />}
                Continue with Google
              </Button>

              <div className="my-6 flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-border" />
                <span className="text-caption uppercase tracking-wide text-muted-foreground">or</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <form onSubmit={submit} noValidate aria-label="Sign in" className="space-y-5">
                {emailField(ids.email, ids.emailError)}

                <div className="space-y-1.5">
                  <Label htmlFor={ids.password}>Password</Label>
                  <div className="relative">
                    <Input
                      ref={passwordRef}
                      id={ids.password}
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      autoComplete="current-password"
                      value={password}
                      disabled={busy}
                      className="pr-11"
                      aria-invalid={errors.password ? true : undefined}
                      aria-describedby={errors.password ? ids.passwordError : undefined}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errors.password) setErrors((x) => ({ ...x, password: undefined }));
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      aria-controls={ids.password}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </div>
                  <FieldError id={ids.passwordError}>{errors.password}</FieldError>
                  <div className="flex justify-end pt-0.5">
                    <button
                      type="button"
                      onClick={() => switchMode('reset')}
                      disabled={busy}
                      className="rounded-sm text-caption font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                    >
                      Forgot password?
                    </button>
                  </div>
                </div>

                <Button type="submit" size="lg" className="w-full" loading={pending === 'password'} disabled={busy}>
                  {pending === 'password' ? 'Signing in…' : 'Sign in'}
                </Button>
              </form>

              <p className="mt-8 text-center text-body text-muted-foreground">
                Need access? Contact your workspace administrator.
              </p>
            </>
          ) : (
            <>
              <div className="mb-8">
                <LogoMark className="mb-6 hidden h-10 w-10 lg:block" />
                <h1 className="text-heading text-foreground">Reset your password</h1>
                <p className="mt-2 text-body text-muted-foreground">
                  Enter your work email and we&apos;ll send you a link to choose a new password.
                </p>
              </div>

              {formError && <FormAlert>{formError}</FormAlert>}

              {resetSentTo ? (
                <Callout tone="success" role="status" className="mb-6">
                  If an account exists for {resetSentTo}, you&apos;ll receive an email with a link to reset your password shortly.
                </Callout>
              ) : (
                <form onSubmit={sendReset} noValidate aria-label="Reset password" className="space-y-5">
                  {emailField(ids.resetEmail, ids.resetEmailError)}
                  <Button type="submit" size="lg" className="w-full" loading={pending === 'reset'} disabled={busy}>
                    {pending === 'reset' ? 'Sending link…' : 'Send reset link'}
                  </Button>
                </form>
              )}

              <Button variant="ghost" className="mt-6 w-full" onClick={() => switchMode('sign-in')} disabled={busy}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to sign in
              </Button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

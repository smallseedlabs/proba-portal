import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthError, type AuthClient, type Session } from '../../lib/auth';
import { SignInPage } from './SignInPage';

const session: Session = { user: { id: 'u', email: 'ana@acme.com', name: 'Ana' }, getIdToken: async () => 'token' };

function setup(signIn: AuthClient['signIn'], overrides: Partial<AuthClient> = {}) {
  const auth: AuthClient = {
    signIn,
    signInWithGoogle: vi.fn(),
    sendPasswordReset: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(null),
    signOut: vi.fn(),
    ...overrides,
  };
  const onSignedIn = vi.fn();
  render(<SignInPage auth={auth} onSignedIn={onSignedIn} />);
  return { onSignedIn, signIn, auth };
}

describe('SignInPage', () => {
  it('shows a branded sign-in form with no development wording', () => {
    setup(vi.fn());
    expect(screen.getByRole('heading', { name: 'Sign in to Proba Insights' })).toBeInTheDocument();
    expect(screen.getByLabelText('Work email')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(document.body.textContent).not.toMatch(/\b(mock|dev login|fixture|test data|beta|alpha|stub|demo)\b/i);
  });

  it('validates the fields before contacting the identity provider', async () => {
    const { signIn } = setup(vi.fn());
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter your work email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(screen.getByLabelText('Work email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Work email')).toHaveFocus();

    await userEvent.type(screen.getByLabelText('Work email'), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText(/Enter a valid email address/)).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('shows a loading state and completes sign-in', async () => {
    let resolve: (s: Session) => void = () => {};
    const { onSignedIn } = setup(vi.fn(() => new Promise<Session>((r) => (resolve = r))));
    await userEvent.type(screen.getByLabelText('Work email'), 'ana@acme.com');
    await userEvent.type(screen.getByLabelText('Password'), 'long-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const button = screen.getByRole('button', { name: 'Signing in…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText('Work email')).toBeDisabled();

    resolve(session);
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(session));
  });

  it('announces sign-in errors from the auth client', async () => {
    setup(vi.fn().mockRejectedValue(new AuthError('invalid_credentials')));
    await userEvent.type(screen.getByLabelText('Work email'), 'ana@acme.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The email or password you entered is incorrect.');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('toggles password visibility', async () => {
    setup(vi.fn());
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('continues with Google', async () => {
    const signInWithGoogle = vi.fn().mockResolvedValue(session);
    const { onSignedIn, signIn } = setup(vi.fn(), { signInWithGoogle });
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(session));
    expect(signIn).not.toHaveBeenCalled();
  });

  it('stays quiet when the Google window is closed, but reports other Google errors', async () => {
    const signInWithGoogle = vi
      .fn()
      .mockRejectedValueOnce(new AuthError('cancelled'))
      .mockRejectedValueOnce(new AuthError('popup_blocked'));
    setup(vi.fn(), { signInWithGoogle });
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/blocked the Google sign-in window/);
  });

  it('disables every sign-in option while one is in progress', async () => {
    setup(vi.fn(), { signInWithGoogle: vi.fn(() => new Promise<Session>(() => {})) });
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    expect(screen.getByLabelText('Work email')).toBeDisabled();
  });

  it('sends a password reset link without revealing whether the account exists', async () => {
    const sendPasswordReset = vi.fn().mockResolvedValue(undefined);
    setup(vi.fn(), { sendPasswordReset });
    await userEvent.type(screen.getByLabelText('Work email'), 'ana@acme.com');
    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));

    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
    expect(screen.getByLabelText('Work email')).toHaveValue('ana@acme.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(sendPasswordReset).toHaveBeenCalledWith('ana@acme.com');
    expect(await screen.findByRole('status')).toHaveTextContent(
      "If an account exists for ana@acme.com, you'll receive an email with a link to reset your password shortly."
    );

    await userEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(screen.getByRole('heading', { name: 'Sign in to Proba Insights' })).toBeInTheDocument();
  });

  it('validates the reset email and reports reset errors', async () => {
    const sendPasswordReset = vi.fn().mockRejectedValue(new AuthError('rate_limited'));
    setup(vi.fn(), { sendPasswordReset });
    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(screen.getByText('Enter your work email address.')).toBeInTheDocument();
    expect(sendPasswordReset).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Work email'), 'ana@acme.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Too many sign-in attempts/);
  });

  it('explains when sign-in has not been set up and keeps the form from being used', () => {
    const auth: AuthClient = {
      signIn: vi.fn(), signInWithGoogle: vi.fn(), sendPasswordReset: vi.fn(),
      restore: vi.fn().mockResolvedValue(null), signOut: vi.fn(),
    };
    render(<SignInPage auth={auth} onSignedIn={vi.fn()} unavailable />);
    expect(screen.getByRole('status')).toHaveTextContent('Sign-in isn’t available yet');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    expect(screen.getByLabelText('Work email')).toBeDisabled();
  });
});

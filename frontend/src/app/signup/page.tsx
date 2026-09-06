'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  getMe,
  isAuthenticated,
  register,
  clearToken,
} from '../../lib/api';
import AuthShell from '../../components/AuthShell';

export default function SignupPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Already signed in: new accounts start at
  // onboarding, existing sessions go home.
  useEffect(() => {
    if (!isAuthenticated()) {
      return;
    }

    let cancelled = false;

    getMe()
      .then(() => {
        if (!cancelled) {
          router.replace('/');
        }
      })
      .catch(() => {
        // Stale token: stay on signup.
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      await register({
        name: name.trim(),
        organizationName: organizationName.trim(),
        email: email.trim(),
        password,
      });

      // Registration creates the account, but the user must
      // explicitly log in before entering onboarding.
      clearToken();

      router.push('/login?next=/onboarding');
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to create your account',
      );
    } finally {
      setLoading(false);
    }
  }

  const passwordMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  return (
    <AuthShell
      title="Create your account"
      subtitle="Create your RENKOO workspace to turn growth data into actions."
      footer={
        <p className="text-center text-sm text-rk-secondary">
          Already have an account?{' '}
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="rk-focusable font-bold text-rk-ink underline decoration-rk-border-strong underline-offset-4 hover:decoration-rk-ink"
          >
            Sign in
          </button>
        </p>
      }
    >
      {error ? (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2.5 rounded-rk-md border border-rk-danger/30 bg-rk-dangerSoft px-3.5 py-3 text-sm font-medium leading-5 text-rk-danger"
        >
          <AlertTriangle
            size={16}
            aria-hidden
            className="mt-0.5 shrink-0"
          />
          <span>{error}</span>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="signup-name"
              className="rk-field-label mb-1.5 block"
            >
              Your name
            </label>

            <input
              id="signup-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ava Sharma"
              minLength={2}
              required
              autoComplete="name"
              className="rk-input"
            />
          </div>

          <div>
            <label
              htmlFor="signup-org"
              className="rk-field-label mb-1.5 block"
            >
              Company
            </label>

            <input
              id="signup-org"
              type="text"
              value={organizationName}
              onChange={(e) =>
                setOrganizationName(e.target.value)
              }
              placeholder="Acme Inc"
              minLength={2}
              required
              autoComplete="organization"
              className="rk-input"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="signup-email"
            className="rk-field-label mb-1.5 block"
          >
            Work email
          </label>

          <input
            id="signup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
            autoComplete="email"
            className="rk-input"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="signup-password"
              className="rk-field-label mb-1.5 block"
            >
              Password
            </label>

            <input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8+ characters"
              minLength={8}
              required
              autoComplete="new-password"
              aria-invalid={passwordMismatch}
              className="rk-input"
            />
          </div>

          <div>
            <label
              htmlFor="signup-confirm"
              className="rk-field-label mb-1.5 block"
            >
              Confirm
            </label>

            <input
              id="signup-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) =>
                setConfirmPassword(e.target.value)
              }
              placeholder="Repeat password"
              minLength={8}
              required
              autoComplete="new-password"
              aria-invalid={passwordMismatch}
              className="rk-input"
            />
          </div>
        </div>

        {passwordMismatch ? (
          <p role="alert" className="rk-error-text">
            Passwords do not match.
          </p>
        ) : (
          <p className="rk-helper">
            Use at least 8 characters. You&apos;ll sign in
            right after creating your workspace.
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="rk-focusable flex h-11 w-full items-center justify-center gap-2 rounded-rk-md bg-rk-ink text-sm font-bold text-white shadow-rk-sm transition-all hover:opacity-90 hover:shadow-rk-md disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          {loading ? (
            <>
              <Loader2
                size={16}
                aria-hidden
                className="animate-spin"
              />
              Creating account…
            </>
          ) : (
            'Create account'
          )}
        </button>
      </form>
    </AuthShell>
  );
}

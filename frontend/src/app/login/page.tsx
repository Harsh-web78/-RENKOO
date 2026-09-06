'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  getMe,
  isAuthenticated,
  login,
} from '../../lib/api';
import AuthShell from '../../components/AuthShell';

function safeNextPath(value: string | null) {
  if (
    value &&
    value.startsWith('/') &&
    !value.startsWith('//')
  ) {
    return value;
  }

  return '/';
}

function readNext() {
  if (typeof window === 'undefined') {
    return '/';
  }

  return safeNextPath(
    new URLSearchParams(window.location.search).get(
      'next',
    ),
  );
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Already signed in (e.g. refresh on /login):
  // validate the token and go where it points.
  useEffect(() => {
    if (!isAuthenticated()) {
      return;
    }

    let cancelled = false;

    getMe()
      .then(() => {
        if (!cancelled) {
          router.replace(readNext());
        }
      })
      .catch(() => {
        // Stale token: stay on login; the gate
        // clears it when leaving this page.
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    setError('');
    setLoading(true);

    try {
      await login({
        email,
        password,
      });

      router.push(readNext());
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Login failed',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your RENKOO workspace."
      footer={
        <>
          <p className="text-center text-sm text-rk-secondary">
            Don&apos;t have an account?{' '}
            <button
              type="button"
              onClick={() => router.push('/signup')}
              className="rk-focusable font-bold text-rk-ink underline decoration-rk-border-strong underline-offset-4 hover:decoration-rk-ink"
            >
              Create account
            </button>
          </p>

          <p className="mt-3 text-center text-sm">
            <button
              type="button"
              onClick={() =>
                router.push('/reset-password')
              }
              className="rk-focusable font-semibold text-rk-secondary underline decoration-rk-border underline-offset-4 hover:text-rk-ink"
            >
              Forgot your password?
            </button>
          </p>
        </>
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
        <div>
          <label
            htmlFor="login-email"
            className="rk-field-label mb-1.5 block"
          >
            Email
          </label>

          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
            autoComplete="email"
            aria-invalid={Boolean(error)}
            className="rk-input"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label
              htmlFor="login-password"
              className="rk-field-label"
            >
              Password
            </label>
            <button
              type="button"
              onClick={() =>
                router.push('/reset-password')
              }
              className="rk-focusable text-xs font-semibold text-rk-secondary hover:text-rk-ink"
            >
              Forgot?
            </button>
          </div>

          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
            autoComplete="current-password"
            aria-invalid={Boolean(error)}
            className="rk-input"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !email.trim() || !password}
          className="rk-focusable flex h-11 w-full items-center justify-center gap-2 rounded-rk-md bg-rk-ink text-sm font-bold text-white shadow-rk-sm transition-all hover:opacity-90 hover:shadow-rk-md disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          {loading ? (
            <>
              <Loader2
                size={16}
                aria-hidden
                className="animate-spin"
              />
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </form>
    </AuthShell>
  );
}

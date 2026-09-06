'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import {
  getMe,
  isAuthenticated,
  login,
} from '../../lib/api';

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
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-5">
      <div className="w-full max-w-md">

        <div className="mb-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-2xl font-black text-white">
            R
          </div>

          <h1 className="mt-4 text-3xl font-bold text-slate-900">
            RENKOO
          </h1>

          <p className="mt-1 text-sm text-blue-600">
            AI Growth Operating System
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">

          <div className="mb-6">
            <div className="flex items-center gap-2">
              <Sparkles size={19} className="text-blue-600" />

              <h2 className="text-xl font-bold">
                Welcome back
              </h2>
            </div>

            <p className="mt-1 text-sm text-slate-500">
              Sign in to your RENKOO workspace.
            </p>
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="space-y-5"
          >
            <div>
              <label className="mb-2 block text-sm font-medium">
                Email
              </label>

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Password
              </label>

              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-slate-500">
            Don't have an account?{' '}
            <button
              type="button"
              onClick={() => router.push('/signup')}
              className="font-semibold text-blue-600 hover:text-blue-700 hover:underline"
            >
              Create account
            </button>
          </p>

          <p className="mt-4 text-center text-sm">
            <button
              type="button"
              onClick={() =>
                router.push('/reset-password')
              }
              className="font-semibold text-blue-600 hover:text-blue-700 hover:underline"
            >
              Forgot your password?
            </button>
          </p>
        </div>
      </div>
    </main>
  );
}

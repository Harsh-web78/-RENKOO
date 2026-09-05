'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import {
  forgotPassword,
  resetPassword,
} from '../../lib/api';

export default function ResetPasswordPage() {
  const router = useRouter();

  const [token, setToken] = useState<
    string | null
  >(null);

  const [email, setEmail] = useState('');
  const [forgotLoading, setForgotLoading] =
    useState(false);
  const [forgotMessage, setForgotMessage] =
    useState('');

  const [newPassword, setNewPassword] =
    useState('');
  const [confirmPassword, setConfirmPassword] =
    useState('');
  const [resetLoading, setResetLoading] =
    useState(false);
  const [resetError, setResetError] =
    useState('');
  const [resetDone, setResetDone] =
    useState('');

  useEffect(() => {
    setToken(
      new URLSearchParams(
        window.location.search,
      ).get('token'),
    );
  }, []);

  async function handleForgot(
    e: FormEvent,
  ) {
    e.preventDefault();

    setForgotMessage('');
    setForgotLoading(true);

    try {
      /*
       * Generic backend response by design: shown
       * verbatim, never upgraded to a delivery
       * claim.
       */
      const result = await forgotPassword(
        email.trim(),
      );

      setForgotMessage(result.message);
    } catch (err) {
      setForgotMessage(
        err instanceof Error
          ? err.message
          : 'Unable to process this request right now.',
      );
    } finally {
      setForgotLoading(false);
    }
  }

  async function handleReset(
    e: FormEvent,
  ) {
    e.preventDefault();

    setResetError('');
    setResetDone('');

    if (newPassword.length < 8) {
      setResetError(
        'New password must be at least 8 characters.',
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match.');
      return;
    }

    if (!token) {
      setResetError(
        'This reset link is incomplete. Request a new one.',
      );
      return;
    }

    setResetLoading(true);

    try {
      const result = await resetPassword(
        token,
        newPassword,
      );

      setResetDone(result.message);
    } catch (err) {
      setResetError(
        err instanceof Error
          ? err.message
          : 'This reset link is invalid or has expired.',
      );
    } finally {
      setResetLoading(false);
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
              <KeyRound
                size={19}
                className="text-blue-600"
              />

              <h2 className="text-xl font-bold text-slate-900">
                {token
                  ? 'Choose a new password'
                  : 'Reset your password'}
              </h2>
            </div>

            <p className="mt-1 text-sm text-slate-500">
              {token
                ? 'Enter a new password for your RENKOO account.'
                : 'Enter your account email and we will process a reset request.'}
            </p>
          </div>

          {token ? (
            <>
              {resetError && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {resetError}
                </div>
              )}

              {resetDone ? (
                <>
                  <div className="mb-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                    {resetDone}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      router.push('/login')
                    }
                    className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700"
                  >
                    Continue to sign in
                  </button>
                </>
              ) : (
                <form
                  onSubmit={handleReset}
                  className="space-y-5"
                >
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-900">
                      New password
                    </label>

                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) =>
                        setNewPassword(
                          e.target.value,
                        )
                      }
                      placeholder="At least 8 characters"
                      minLength={8}
                      required
                      autoComplete="new-password"
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-900">
                      Confirm new password
                    </label>

                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) =>
                        setConfirmPassword(
                          e.target.value,
                        )
                      }
                      placeholder="Repeat your password"
                      minLength={8}
                      required
                      autoComplete="new-password"
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {resetLoading
                      ? 'Updating password...'
                      : 'Update password'}
                  </button>
                </form>
              )}
            </>
          ) : (
            <>
              {forgotMessage && (
                <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  {forgotMessage}
                </div>
              )}

              <form
                onSubmit={handleForgot}
                className="space-y-5"
              >
                <input
                  type="email"
                  value={email}
                  onChange={(e) =>
                    setEmail(e.target.value)
                  }
                  placeholder="you@company.com"
                  required
                  autoComplete="email"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />

                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {forgotLoading
                    ? 'Sending request...'
                    : 'Send reset request'}
                </button>
              </form>
            </>
          )}

          <p className="mt-6 text-center text-sm text-slate-500">
            Remembered your password?{' '}
            <button
              type="button"
              onClick={() =>
                router.push('/login')
              }
              className="font-semibold text-blue-600 hover:text-blue-700 hover:underline"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    </main>
  );
}

'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MailCheck } from 'lucide-react';
import {
  resendVerification,
  verifyEmail,
} from '../../lib/api';

type State =
  | 'verifying'
  | 'verified'
  | 'invalid'
  | 'missing';

export default function VerifyEmailPage() {
  const router = useRouter();

  const [state, setState] =
    useState<State>('verifying');
  const [message, setMessage] = useState('');

  const [email, setEmail] = useState('');
  const [resending, setResending] =
    useState(false);
  const [resendMessage, setResendMessage] =
    useState('');

  useEffect(() => {
    const token = new URLSearchParams(
      window.location.search,
    ).get('token');

    if (!token) {
      setState('missing');
      setMessage(
        'This verification link is incomplete. Request a new one below.',
      );
      return;
    }

    let cancelled = false;

    verifyEmail(token)
      .then((result) => {
        if (cancelled) return;

        setState('verified');
        setMessage(
          result.message ??
            'Your email address has been verified.',
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;

        setState('invalid');
        setMessage(
          err instanceof Error
            ? err.message
            : 'This verification link is invalid or has expired.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleResend(
    e: FormEvent,
  ) {
    e.preventDefault();

    setResendMessage('');
    setResending(true);

    try {
      /*
       * Generic backend response by design: the
       * message never reveals whether an account
       * exists. It is shown verbatim and never
       * upgraded to a delivery claim.
       */
      const result =
        await resendVerification(
          email.trim(),
        );

      setResendMessage(result.message);
    } catch (err) {
      setResendMessage(
        err instanceof Error
          ? err.message
          : 'Unable to process this request right now.',
      );
    } finally {
      setResending(false);
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
              <MailCheck
                size={19}
                className="text-blue-600"
              />

              <h2 className="text-xl font-bold text-slate-900">
                Email verification
              </h2>
            </div>
          </div>

          {state === 'verifying' && (
            <p className="text-sm text-slate-500">
              Verifying your email address...
            </p>
          )}

          {state === 'verified' && (
            <>
              <div className="mb-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                {message}
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
          )}

          {(state === 'invalid' ||
            state === 'missing') && (
            <>
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {message ||
                  'This verification link is invalid or has expired.'}
              </div>

              <p className="mb-4 text-sm text-slate-500">
                Enter your account email to
                request a new verification
                link.
              </p>

              {resendMessage && (
                <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  {resendMessage}
                </div>
              )}

              <form
                onSubmit={handleResend}
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
                  disabled={resending}
                  className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {resending
                    ? 'Sending request...'
                    : 'Request a new link'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

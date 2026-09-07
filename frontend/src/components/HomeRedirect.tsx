'use client';

/*
 * RENKOO — home redirect for signed-in visitors.
 *
 * `/` is a public landing page. When a visitor who
 * is already authenticated lands here, send them to
 * the Growth Command Center at `/dashboard`.
 *
 * Token validation is unchanged: only a token that
 * passes GET /auth/me redirects. Stale tokens stay
 * on the public page (the login page owns cleanup).
 */

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { getMe, isAuthenticated } from '@/lib/api';

export default function HomeRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) {
      return;
    }

    let cancelled = false;

    getMe()
      .then(() => {
        if (!cancelled) {
          router.replace('/dashboard');
        }
      })
      .catch(() => {
        // Stale token: stay on the public page.
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}

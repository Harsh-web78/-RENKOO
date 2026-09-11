'use client';

/*
 * RENKOO — home redirect for signed-in visitors.
 *
 * `/` is a public landing page. When a visitor who
 * is already authenticated lands here, send them to
 * their canonical home: the Command Center at
 * `/command-center` when first value is ready,
 * `/first-value` while setup remains.
 *
 * Token validation is unchanged: only a token that
 * passes GET /auth/me redirects. Stale tokens stay
 * on the public page (the login page owns cleanup).
 * Any readiness failure falls back to /command-center,
 * which renders its own setup guidance.
 */

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import {
  getFirstValueStatus,
  getMe,
  getWebsites,
  isAuthenticated,
} from '@/lib/api';

export default function HomeRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) {
      return;
    }

    let cancelled = false;

    async function resolve() {
      try {
        await getMe();
      } catch {
        // Stale token: stay on the public page.
        return;
      }

      let destination = '/command-center';

      try {
        const sites = await getWebsites();
        const list = Array.isArray(sites) ? sites : [];
        const stored =
          typeof window !== 'undefined'
            ? localStorage.getItem('renkoo_website_id')
            : null;
        const websiteId =
          stored && list.some((s: any) => s.id === stored)
            ? stored
            : list[0]?.id;

        if (!websiteId) {
          destination = '/first-value';
        } else {
          const status =
            await getFirstValueStatus(websiteId);
          destination = status?.ready
            ? '/command-center'
            : '/first-value';
        }
      } catch {
        // Readiness unknown: Command Center owns the
        // degraded/setup state from here.
        destination = '/command-center';
      }

      if (!cancelled) {
        router.replace(destination);
      }
    }

    void resolve();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}

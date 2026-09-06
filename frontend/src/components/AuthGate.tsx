'use client';

/*
 * RENKOO — Centralized authentication gate.
 *
 * Token storage is localStorage-only
 * (key renkoo_access_token, see lib/api), so route
 * protection must happen client-side. This gate
 * wraps the whole app shell (see app/layout) so
 * individual pages don't each re-implement auth
 * redirects.
 *
 * Behavior:
 * - Public routes render immediately, no checks:
 *   /login, /signup, /verify-email,
 *   /reset-password, /invite/*, /share/*.
 *   (Note: `/` is the Growth Command Center and
 *   is PROTECTED, not public.)
 * - Protected routes with no token redirect to
 *   /login?next=<path>, preserving return URL.
 * - Protected routes with a token validate it
 *   once via GET /auth/me; expired/invalid
 *   tokens are cleared and redirect to /login.
 * - While checking, a neutral loading screen
 *   renders so authenticated UI never flashes
 *   for visitors (and vice versa).
 */

import { usePathname, useRouter } from 'next/navigation';
import {
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import {
  getMe,
  isAuthenticated,
  logout,
} from '@/lib/api';

const PUBLIC_PATHS = new Set([
  '/login',
  '/signup',
  '/verify-email',
  '/reset-password',
]);

const PUBLIC_PREFIXES = ['/invite/', '/share/'];

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.has(pathname)) {
    return true;
  }

  return PUBLIC_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
}

export default function AuthGate({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      setReady(false);

      if (isPublicPath(pathname)) {
        if (!cancelled) setReady(true);
        return;
      }

      if (!isAuthenticated()) {
        router.replace(
          `/login?next=${encodeURIComponent(pathname)}`,
        );
        return;
      }

      try {
        await getMe();
      } catch {
        logout();
        router.replace(
          `/login?next=${encodeURIComponent(pathname)}`,
        );
        return;
      }

      if (!cancelled) setReady(true);
    }

    void check();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (isPublicPath(pathname)) {
    return <>{children}</>;
  }

  if (!ready) {
    return (
      <main className="grid min-h-screen place-items-center bg-rk-bg px-5">
        <div className="text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-rk-md bg-rk-ink text-xl font-black text-white">
            R
          </div>

          <p className="mt-4 text-sm font-semibold text-rk-secondary">
            Loading your workspace…
          </p>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}

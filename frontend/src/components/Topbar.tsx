'use client';

/*
 * RENKOO V2 — Topbar.
 * Shared application header for the AppShell foundation:
 * mobile menu button, current workspace + website context,
 * global search trigger (opens the command palette), a
 * notifications entry point, and the account area.
 * Presentation only: auth/session/token behavior is untouched
 * (account data comes from the existing getCurrentAccount
 * call owned by AppShell; unauthenticated redirects stay in
 * pages).
 */

import Link from 'next/link';
import { Bell, Menu, Search } from 'lucide-react';

import type { CurrentAccount } from '@/lib/api';
import { PERSONA_META, usePersona } from '@/lib/persona';

export default function Topbar({
  onMenu,
  onSearch,
  account,
}: {
  onMenu: () => void;
  onSearch: () => void;
  account: CurrentAccount | null;
}) {
  const { effectivePersona } = usePersona();

  const organizationName =
    account?.organization?.name || 'Workspace';
  const websiteName =
    account?.website?.name ||
    account?.website?.url ||
    'No website connected';
  const userLabel =
    account?.user?.name ||
    account?.user?.email ||
    'Account';

  return (
    <header className="rk-topbar sticky top-0 z-20 border-b backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-4 sm:px-6">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Open navigation"
          className="rk-focusable grid h-9 w-9 shrink-0 place-items-center rounded-rk-md text-rk-secondary hover:bg-rk-soft hover:text-rk-ink lg:hidden"
        >
          <Menu size={18} aria-hidden />
        </button>

        <div className="hidden min-w-0 lg:block">
          <p
            className="truncate text-sm font-bold text-rk-ink"
            title={organizationName}
          >
            {organizationName}
          </p>
          <p
            className="truncate text-xs text-rk-secondary"
            title={websiteName}
          >
            {websiteName}
          </p>
        </div>

        <button
          type="button"
          onClick={onSearch}
          aria-label="Search and jump to pages (Command K)"
          className="rk-focusable mx-auto flex h-9 w-full max-w-md items-center gap-2 rounded-rk-md border border-rk-border bg-rk-soft px-3 text-sm text-rk-muted hover:border-rk-strong hover:text-rk-secondary sm:mx-0 sm:ml-4"
        >
          <Search size={15} aria-hidden />
          <span className="truncate">
            Search pages, reports, actions…
          </span>
          <kbd
            aria-hidden
            className="ml-auto hidden shrink-0 rounded border border-rk-border bg-rk-surface px-1.5 py-0.5 text-[10px] font-bold text-rk-muted sm:block"
          >
            ⌘K
          </kbd>
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Link
            href="/monitoring"
            aria-label="Notifications and changes"
            className="rk-focusable grid h-9 w-9 place-items-center rounded-rk-md text-rk-secondary hover:bg-rk-soft hover:text-rk-ink"
          >
            <Bell size={17} aria-hidden />
          </Link>

          <Link
            href="/settings"
            aria-label={`Account settings — ${userLabel}, ${PERSONA_META[effectivePersona].label} view`}
            title={`${userLabel} · ${PERSONA_META[effectivePersona].label}`}
            className="rk-focusable flex h-9 items-center gap-2 rounded-rk-md px-2 hover:bg-rk-soft"
          >
            <span
              aria-hidden
              className="grid h-7 w-7 place-items-center rounded-full bg-rk-ink text-[11px] font-black text-white"
            >
              {userLabel.slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden max-w-[140px] truncate text-xs font-semibold text-rk-ink md:block">
              {userLabel}
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  CreditCard,
  LogOut,
  Menu,
  Search,
  Settings,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  logout,
  type CurrentAccount,
} from "@/lib/api";
import { PERSONA_META, usePersona } from "@/lib/persona";
import WebsiteSelector from "./WebsiteSelector";

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
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function handleLogout() {
    logout();
    setMenuOpen(false);
    router.push("/login");
    router.refresh();
  }

  const userLabel =
    account?.user?.name ||
    account?.user?.email ||
    "Account";

  return (
    <header className="rk-topbar sticky top-0 z-20 border-b border-rk-border bg-white/90 backdrop-blur-md">
      <div className="flex h-[60px] items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Open navigation"
          className="rk-focusable grid h-9 w-9 shrink-0 place-items-center rounded-rk-md text-rk-secondary hover:bg-rk-soft hover:text-rk-ink lg:hidden"
        >
          <Menu size={18} aria-hidden />
        </button>

        {/*
         * Workspace identity lives in one place: the
         * sidebar card (org + site) and the website
         * selector (site + domain). A third org label
         * here only repeats them, so it stays out.
         */}
        <div className="min-w-0 shrink-0">
          <WebsiteSelector />
        </div>

        <button
          type="button"
          onClick={onSearch}
          aria-label="Search and jump to pages (Command K)"
          className="rk-focusable mx-auto hidden h-10 w-full max-w-md items-center gap-2.5 rounded-rk-md border border-rk-border bg-rk-soft px-3.5 text-[13px] text-rk-muted shadow-rk-sm transition-all hover:border-rk-strong hover:bg-white hover:text-rk-secondary hover:shadow-rk-md md:flex"
        >
          <Search size={15} aria-hidden className="shrink-0" />
          <span className="truncate">
            Search pages, reports, actions…
          </span>

          <kbd
            aria-hidden
            className="ml-auto hidden shrink-0 items-center gap-1 rounded-md border border-rk-border bg-rk-surface px-1.5 py-0.5 text-[10px] font-bold text-rk-muted lg:flex"
          >
            ⌘K
          </kbd>
        </button>

        <button
          type="button"
          onClick={onSearch}
          aria-label="Search pages"
          className="rk-focusable grid h-10 w-10 shrink-0 place-items-center rounded-rk-md border border-rk-border bg-rk-surface text-rk-secondary hover:bg-rk-soft md:hidden"
        >
          <Search size={17} aria-hidden />
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Link
            href="/billing"
            aria-label="Subscription"
            className="rk-focusable hidden h-10 items-center gap-2 rounded-rk-md border border-rk-border bg-rk-surface px-3.5 text-[13px] font-semibold text-rk-ink shadow-rk-sm transition-all hover:border-rk-strong hover:bg-rk-soft sm:flex"
          >
            <CreditCard size={15} aria-hidden className="text-rk-secondary" />
            Subscription
          </Link>

          <Link
            href="/monitoring"
            aria-label="Notifications and changes"
            className="rk-focusable grid h-10 w-10 place-items-center rounded-rk-md text-rk-secondary transition-colors hover:bg-rk-soft hover:text-rk-ink"
          >
            <Bell size={17} aria-hidden />
          </Link>

          <div className="relative ml-auto shrink-0">
            <button
              type="button"
              onClick={() =>
                setMenuOpen((open) => !open)
              }
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`Account menu — ${userLabel}, ${PERSONA_META[effectivePersona].label} view`}
              title={`${userLabel} · ${PERSONA_META[effectivePersona].label}`}
              className="rk-focusable flex h-10 items-center gap-2 rounded-rk-md border border-transparent px-1.5 hover:border-rk-border hover:bg-rk-surface"
            >
              <span
                aria-hidden
                className="grid h-8 w-8 place-items-center rounded-full bg-rk-ink text-xs font-black text-white ring-2 ring-rk-border"
              >
                {userLabel.slice(0, 1).toUpperCase()}
              </span>

              <span className="hidden max-w-[140px] truncate text-[13px] font-semibold text-rk-ink md:block">
                {userLabel}
              </span>
            </button>

            {menuOpen ? (
              <>
                <button
                  type="button"
                  aria-label="Close account menu"
                  onClick={() => setMenuOpen(false)}
                  className="fixed inset-0 z-30 cursor-default bg-transparent"
                />

                <div
                  role="menu"
                  aria-label="Account"
                  className="rk-dropdown absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-rk-md border border-rk-border bg-rk-surface py-1.5 shadow-rk-md"
                >
                  <p className="truncate px-3.5 pb-1.5 pt-1 text-xs text-rk-muted">
                    {userLabel}
                  </p>

                  <Link
                    href="/settings"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="rk-focusable flex items-center gap-2.5 px-3.5 py-2 text-sm text-rk-secondary hover:bg-rk-soft hover:text-rk-ink"
                  >
                    <Settings size={15} aria-hidden />
                    Settings
                  </Link>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="rk-focusable flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-rk-secondary hover:bg-rk-soft hover:text-rk-ink"
                  >
                    <LogOut size={15} aria-hidden />
                    Log out
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

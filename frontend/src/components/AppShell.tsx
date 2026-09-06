'use client';

/*
 * RENKOO V2 â€” AppShell (Phase 2 foundation).
 * Grouped primary navigation (7 groups) with the Money
 * group giving /roi its proper home alongside Leads &
 * Revenue. Persona composes through the existing orderNav
 * helper: items re-order within their groups, groups stay
 * fixed, and nothing is ever hidden â€” RBAC remains the
 * sole authority server-side.
 *
 * Legacy /[section] is intentionally absent from
 * navigation; the route itself is preserved untouched.
 * Auth-only routes (/login, /signup, /invite, /onboarding,
 * /reset-password, /verify-email, /share/*) never mount
 * this shell â€” pages own their auth redirects as before.
 *
 * Sidebar.tsx stays authoritative for existing pages until
 * each route migrates. New work may opt into AppShell +
 * Topbar + CommandPalette directly.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bot,
  Brain,
  Briefcase,
  CheckCircle2,
  Cpu,
  CreditCard,
  FileText,
  Globe2,
  Hash,
  LayoutDashboard,
  Link2,
  MapPin,
  Newspaper,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Swords,
  Target,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import {
  getCurrentAccount,
  type CurrentAccount,
} from '@/lib/api';
import {
  PERSONA_META,
  orderNav,
  usePersona,
} from '@/lib/persona';
import Topbar from './Topbar';
import CommandPalette from './CommandPalette';

interface NavItem {
  name: string;
  href: string;
  Icon: LucideIcon;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Command',
    items: [
      {
        name: 'Dashboard',
        href: '/',
        Icon: LayoutDashboard,
      },
      {
        name: 'Opportunities',
        href: '/opportunities',
        Icon: Target,
      },
      {
        name: 'Actions',
        href: '/actions',
        Icon: CheckCircle2,
      },
      {
        name: 'Monitoring',
        href: '/monitoring',
        Icon: Activity,
      },
    ],
  },
  {
    label: 'Insights',
    items: [
      {
        name: 'Search Visibility',
        href: '/search-visibility',
        Icon: Search,
      },
      {
        name: 'Keywords',
        href: '/keywords',
        Icon: Hash,
      },
      {
        name: 'Technical SEO',
        href: '/technical-seo',
        Icon: ShieldCheck,
      },
      {
        name: 'AI Visibility',
        href: '/ai-visibility',
        Icon: Bot,
      },
      {
        name: 'Content Engine',
        href: '/content',
        Icon: FileText,
      },
      {
        name: 'Local SEO',
        href: '/local-seo',
        Icon: MapPin,
      },
      {
        name: 'Traffic & Analytics',
        href: '/analytics',
        Icon: BarChart3,
      },
    ],
  },
  {
    label: 'Growth',
    items: [
      {
        name: 'Competitors',
        href: '/competitors',
        Icon: Swords,
      },
      {
        name: 'Backlinks',
        href: '/backlinks',
        Icon: Link2,
      },
    ],
  },
  {
    label: 'Impact',
    items: [
      {
        name: 'Leads & Revenue',
        href: '/leads',
        Icon: TrendingUp,
      },
      {
        name: 'ROI',
        href: '/roi',
        Icon: Wallet,
      },
      {
        name: 'Reports',
        href: '/reports',
        Icon: Newspaper,
      },
    ],
  },
  {
    label: 'AI',
    items: [
      {
        name: 'Ask RENKOO',
        href: '/agents',
        Icon: Sparkles,
      },
      {
        name: 'Workers',
        href: '/workers',
        Icon: Cpu,
      },
      {
        name: 'Business Brain',
        href: '/business-brain',
        Icon: Brain,
      },
    ],
  },
  {
    label: 'Workspace',
    items: [
      {
        name: 'Websites',
        href: '/websites',
        Icon: Globe2,
      },
      {
        name: 'Clients',
        href: '/clients',
        Icon: Briefcase,
      },
    ],
  },
  {
    label: 'System',
    items: [
      {
        name: 'Integrations',
        href: '/integrations',
        Icon: Globe2,
      },
      {
        name: 'Settings',
        href: '/settings',
        Icon: Settings,
      },
      {
        name: 'Billing',
        href: '/billing',
        Icon: CreditCard,
      },
    ],
  },
];

export default function AppShell({
  children,
  mobileOpen,
  onClose,
  onMenu,
}: {
  children: React.ReactNode;
  mobileOpen: boolean;
  onClose: () => void;
  onMenu?: () => void;
}) {
  const pathname = usePathname();
  const [account, setAccount] =
    useState<CurrentAccount | null>(null);
  const [paletteOpen, setPaletteOpen] =
    useState(false);

  const { effectivePersona, source } =
    usePersona();

  /*
   * Persona ranks every destination once; groups then
   * render in their fixed order with persona-ranked
   * items inside. Group labels are structural, not
   * permissions â€” all routes remain reachable.
   */
  const flat = NAV_GROUPS.flatMap((group) =>
    group.items.map((item) => ({
      ...item,
      group: group.label,
    })),
  );
  const ranked = orderNav(
    flat,
    effectivePersona,
  );
  const grouped = NAV_GROUPS.map((group) => ({
    ...group,
    items: ranked.filter(
      (item) => item.group === group.label,
    ),
  })).filter(
    (group) => group.items.length > 0,
  );

  useEffect(() => {
    let mounted = true;

    async function loadAccount() {
      try {
        const data =
          await getCurrentAccount();

        if (mounted) setAccount(data);
      } catch {
        // Shell must never break the application.
      }
    }

    void loadAccount();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }

    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener(
        'keydown',
        onKey,
      );
    };
  }, []);

  const organizationName =
    account?.organization?.name || 'Workspace';
  const websiteName =
    account?.website?.name ||
    account?.website?.url ||
    'No website connected';

  return (
    <div className="rk-app min-h-screen bg-rk-bg text-rk-ink">
      <a
        href="#rk-main"
        className="rk-focusable sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-rk-md focus:bg-rk-ink focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
      >
        Skip to content
      </a>

      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-rk-scrim lg:hidden"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[270px] flex-col border-r border-rk-border bg-rk-surface transition-transform lg:translate-x-0 ${
          mobileOpen
            ? 'translate-x-0'
            : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2.5 px-5 pt-5">
          <div className="grid h-9 w-9 place-items-center rounded-rk-md bg-rk-ink text-base font-black text-white">
            R
          </div>

          <div className="min-w-0">
            <p className="text-lg font-bold leading-none tracking-tight">
              RENKOO
            </p>

            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-rk-muted">
              Growth OS
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rk-focusable ml-auto grid h-8 w-8 place-items-center rounded-rk-md text-rk-secondary lg:hidden"
          >
            Ã—
          </button>
        </div>

        <div className="mx-5 mt-4 rounded-rk-md border border-rk-border bg-rk-soft px-3 py-2.5">
          <p
            className="truncate text-sm font-bold"
            title={organizationName}
          >
            {organizationName}
          </p>

          <p
            className="mt-0.5 truncate text-xs text-rk-secondary"
            title={websiteName}
          >
            {websiteName}
          </p>
        </div>

        <nav
          aria-label="Primary"
          className="min-h-0 flex-1 overflow-y-auto px-3 py-4"
        >
          <p className="px-2 pb-2 text-[11px] font-semibold text-rk-muted">
            {PERSONA_META[effectivePersona].label}{' '}
            view
            {source === 'default' ? (
              <Link
                href="/settings"
                className="rk-focusable ml-2 text-rk-ink underline underline-offset-2"
              >
                Set role
              </Link>
            ) : null}
          </p>

          {grouped.map((group) => (
            <div
              key={group.label}
              className="mt-1 first:mt-0"
            >
              <p className="rk-label px-2 pb-1 pt-3 first:pt-1">
                {group.label}
              </p>

              <ul className="space-y-0.5">
                {group.items.map(
                  ({ name, href, Icon }) => {
                    const active =
                      href === '/'
                        ? pathname === '/'
                        : pathname === href ||
                          pathname.startsWith(
                            `${href}/`,
                          );

                    return (
                      <li key={href}>
                        <Link
                          href={href}
                          onClick={onClose}
                          aria-current={
                            active
                              ? 'page'
                              : undefined
                          }
                          className={`rk-focusable flex w-full items-center gap-2.5 rounded-rk-md px-2.5 py-2 text-sm transition-colors ${
                            active
                              ? 'bg-rk-ink font-semibold text-white'
                              : 'text-rk-secondary hover:bg-rk-soft hover:text-rk-ink'
                          }`}
                        >
                          <Icon
                            size={16}
                            aria-hidden
                            className="shrink-0"
                          />
                          <span className="truncate">
                            {name}
                          </span>
                        </Link>
                      </li>
                    );
                  },
                )}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 lg:pl-[270px]">
        <Topbar
          account={account}
          onMenu={onMenu ?? onClose}
          onSearch={() => setPaletteOpen(true)}
        />

        <main
          id="rk-main"
          className="rk-main min-w-0 overflow-x-clip px-4 py-6 sm:px-6"
        >
          <div className="mx-auto w-full max-w-6xl">
            {children}
          </div>
        </main>
      </div>

      <CommandPalette
        open={paletteOpen}
        items={flat}
        onClose={() => setPaletteOpen(false)}
      />
    </div>
  );
}



'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  BarChart3,
  Bot,
  FileText,
  Globe2,
  LayoutDashboard,
  Link2,
  MapPin,
  Search,
  Settings,
  CreditCard,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { getCurrentAccount, type CurrentAccount } from '@/lib/api';

const nav = [
  ['Dashboard', '/', LayoutDashboard],
  ['Business Brain', '/business-brain', Sparkles],
  ['Search Visibility', '/search-visibility', Search],
  ['Traffic & Analytics', '/analytics', BarChart3],
  ['AI Visibility (AEO/GEO)', '/ai-visibility', Bot],
  ['Keywords', '/keywords', Target],
  ['Content Engine', '/content', FileText],
  ['Technical SEO', '/technical-seo', ShieldCheck],
  ['Local SEO', '/local-seo', MapPin],
  ['Competitors', '/competitors', Users],
  ['Backlinks & Authority', '/backlinks', Link2],
  ['Leads & Revenue', '/leads', TrendingUp],
  ['Opportunities', '/opportunities', Target],
  ['Actions', '/actions', Target],
  ['Reports', '/reports', FileText],
  ['AI Agents', '/agents', Bot],
  ['Integrations', '/integrations', Globe2],
  ['Settings', '/settings', Settings],
  ['Billing', '/billing', CreditCard],
] as const;

export default function Sidebar({
  mobileOpen,
  onClose,
}: {
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  const [account, setAccount] =
    useState<CurrentAccount | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadAccount() {
      try {
        const data = await getCurrentAccount();

        if (mounted) {
          setAccount(data);
        }
      } catch {
        // Sidebar should never break the application
      }
    }

    loadAccount();

    return () => {
      mounted = false;
    };
  }, []);

  const organizationName =
    account?.organization?.name || 'Workspace';

  const websiteName =
    account?.website?.name ||
    account?.website?.url ||
    'No website connected';

  return (
    <>
      {mobileOpen && (
        <button
          className="fixed inset-0 z-30 bg-black/20 lg:hidden"
          onClick={onClose}
          aria-label="Close menu"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[270px] border-r border-slate-100 bg-white p-5 transition-transform lg:translate-x-0 ${
          mobileOpen
            ? 'translate-x-0'
            : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-xl font-black text-white">
            R
          </div>

          <b className="text-2xl tracking-tight">
            RENKO
          </b>

          <button
            className="ml-auto text-slate-500 lg:hidden"
            onClick={onClose}
            aria-label="Close menu"
          >
            ×
          </button>
        </div>

        <div className="ml-12 -mt-1 text-[11px] font-medium text-blue-600">
          AI Growth Operating System
        </div>

        <div className="mt-8 rounded-xl border border-slate-200 p-3">
          <b
            className="block truncate text-sm"
            title={organizationName}
          >
            {organizationName}
          </b>

          <div
            className="mt-0.5 truncate text-xs text-slate-500"
            title={websiteName}
          >
            {websiteName}
          </div>
        </div>

        <nav className="mt-5 space-y-1">
          {nav.map(([name, href, Icon]) => {
            const active =
              href === '/'
                ? pathname === '/'
                : pathname.startsWith(href);

            return (
              <Link
                key={name}
                href={href}
                onClick={onClose}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                  active
                    ? 'bg-blue-50 font-semibold text-blue-600'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon size={17} />
                <span>{name}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

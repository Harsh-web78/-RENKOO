'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  Bot,
  CreditCard,
  FileText,
  Globe2,
  LayoutDashboard,
  Link2,
  MapPin,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { getCurrentAccount, type CurrentAccount } from '@/lib/api';
import { PERSONA_META, orderNav, usePersona } from '@/lib/persona';

const nav = [
  { group: 'Overview', items: [['Command Center', '/', LayoutDashboard]] },
  {
    group: 'Intelligence',
    items: [
      ['Business Brain', '/business-brain', Sparkles],
      ['Search Visibility', '/search-visibility', Search],
      ['Traffic & Analytics', '/analytics', BarChart3],
      ['AI Visibility', '/ai-visibility', Bot],
    ],
  },
  {
    group: 'Decisions',
    items: [
      ['Opportunities', '/opportunities', Target],
      ['Keywords', '/keywords', Target],
      ['Content Engine', '/content', FileText],
      ['Competitors', '/competitors', Users],
    ],
  },
  {
    group: 'Execution',
    items: [
      ['Actions', '/actions', Target],
      ['Technical SEO', '/technical-seo', ShieldCheck],
      ['Local SEO', '/local-seo', MapPin],
      ['Backlinks & Authority', '/backlinks', Link2],
    ],
  },
  {
    group: 'Business',
    items: [
      ['Leads & Revenue', '/leads', TrendingUp],
      ['Clients', '/clients', Users],
      ['Reports', '/reports', FileText],
    ],
  },
  {
    group: 'Workspace',
    items: [
      ['Monitoring', '/monitoring', Activity],
      ['Intelligence', '/agents', Bot],
      ['Integrations', '/integrations', Globe2],
      ['Settings', '/settings', Settings],
      ['Billing', '/billing', CreditCard],
    ],
  },
] as const;

export default function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const [account, setAccount] = useState<CurrentAccount | null>(null);
  const { effectivePersona, source } = usePersona();
  const flatNav = nav.flatMap((section) => section.items.map(([name, href, Icon]) => ({ name, href, Icon })));
  const orderedNav = orderNav(flatNav, effectivePersona);
  const orderedNames = new Map(orderedNav.map((item, index) => [item.name, index]));

  useEffect(() => {
    let mounted = true;
    getCurrentAccount().then((data) => mounted && setAccount(data)).catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  const organizationName = account?.organization?.name || 'Workspace';
  const websiteName = account?.website?.name || account?.website?.url || 'No website connected';

  return (
    <>
      {mobileOpen && <button className="fixed inset-0 z-30 bg-slate-950/30 backdrop-blur-sm lg:hidden" onClick={onClose} aria-label="Close navigation" />}
      <aside className={`rk-sidebar fixed inset-y-0 left-0 z-40 flex w-[278px] flex-col border-r p-4 transition-transform lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-3 px-2">
          <div className="rk-brand-mark grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-black text-white">R</div>
          <div className="min-w-0">
            <div className="text-[17px] font-bold tracking-[-.03em]">RENKOO</div>
            <div className="text-[10px] font-semibold uppercase tracking-[.12em] text-slate-400">Growth OS</div>
          </div>
          <button className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-100 lg:hidden" onClick={onClose} aria-label="Close navigation"><X size={18} /></button>
        </div>

        <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="rk-label">Workspace</div>
              <div className="mt-1 truncate text-sm font-semibold text-slate-800" title={organizationName}>{organizationName}</div>
              <div className="mt-0.5 truncate text-xs text-slate-500" title={websiteName}>{websiteName}</div>
            </div>
            <Globe2 size={15} className="mt-1 shrink-0 text-blue-600" />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between px-2">
          <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" /><span className="text-xs font-medium text-slate-500">{PERSONA_META[effectivePersona].label} view</span></div>
          {source === 'default' && <Link href="/settings" className="text-[11px] font-semibold text-blue-600 hover:underline">Set role</Link>}
        </div>

        <nav className="mt-3 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1" aria-label="Primary navigation">
          {nav.map((section) => {
            const items = [...section.items].sort(([a], [b]) => (orderedNames.get(a) ?? 0) - (orderedNames.get(b) ?? 0));
            return <div key={section.group}>
              <div className="rk-nav-group px-3 pb-1.5">{section.group}</div>
              <div className="space-y-0.5">
                {items.map(([name, href, Icon]) => {
                  const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
                  return <Link key={name} href={href} onClick={onClose} data-active={active} className="rk-nav-link flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors"><Icon size={16} strokeWidth={active ? 2.2 : 1.8} /><span>{name}</span>{name === 'Actions' && <span className="ml-auto rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Live</span>}</Link>;
                })}
              </div>
            </div>;
          })}
        </nav>

        <div className="mt-3 border-t border-slate-200 pt-3">
          <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50" aria-label="Open notifications">
            <Bell size={16} className="text-slate-500" /><span className="text-xs font-medium text-slate-600">Notifications</span><span className="ml-auto h-2 w-2 rounded-full bg-blue-600" />
          </button>
        </div>
      </aside>
    </>
  );
}

'use client';

import type { ReactNode } from 'react';
import {
  LineChart,
  ScanSearch,
  ListChecks,
  CircleDollarSign,
} from 'lucide-react';

/*
 * RENKOO — premium auth shell (login/signup shared).
 * Split layout on desktop, centered card on mobile.
 * Presentation only; forms own their logic.
 */

const VALUE_POINTS = [
  {
    Icon: ScanSearch,
    title: 'Find growth opportunities',
    description:
      'Technical, search and AI visibility issues ranked by impact.',
  },
  {
    Icon: LineChart,
    title: 'Understand search + AI visibility',
    description:
      'See how customers find you on Google and in AI answers.',
  },
  {
    Icon: ListChecks,
    title: 'Execute what matters',
    description:
      'Turn every insight into a tracked action with an owner.',
  },
  {
    Icon: CircleDollarSign,
    title: 'Measure business impact',
    description:
      'Connect traffic to leads, revenue and ROI — honestly.',
  },
];

export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="rk-auth-grid bg-rk-bg">
      {/* Value panel — desktop only */}
      <div className="rk-auth-panel hidden lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-10">
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-[12px] bg-white text-[17px] font-black text-rk-ink">
              R
            </div>
            <div>
              <p className="text-[17px] font-extrabold leading-none tracking-[-0.02em]">
                RENKOO
              </p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">
                Growth OS
              </p>
            </div>
          </div>

          <h2 className="mt-12 max-w-md text-[32px] font-extrabold leading-[1.15] tracking-[-0.03em]">
            Turn growth data into actions.
          </h2>
          <p className="mt-3 max-w-md text-[15px] leading-6 text-white/70">
            One operating system for search visibility, AI
            visibility, execution and revenue impact.
          </p>

          <ul className="mt-10 space-y-5">
            {VALUE_POINTS.map(
              ({ Icon, title, description }) => (
                <li
                  key={title}
                  className="flex items-start gap-3.5"
                >
                  <span
                    aria-hidden
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-rk-md border border-white/15 bg-white/10"
                  >
                    <Icon size={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">
                      {title}
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-5 text-white/65">
                      {description}
                    </span>
                  </span>
                </li>
              ),
            )}
          </ul>
        </div>

        <p className="relative z-10 mt-10 text-xs leading-5 text-white/50">
          Real data only. No vanity metrics, no invented
          scores — every insight links to its evidence.
        </p>
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[440px]">
          {/* Mobile brand */}
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-rk-ink text-base font-black text-white">
              R
            </div>
            <div>
              <p className="text-base font-extrabold leading-none tracking-tight">
                RENKOO
              </p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-rk-muted">
                Growth OS
              </p>
            </div>
          </div>

          <div className="rk-auth-card rk-animate-pop p-6 sm:p-8">
            <h1 className="text-[22px] font-extrabold tracking-[-0.02em] text-rk-ink">
              {title}
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-rk-secondary">
              {subtitle}
            </p>

            <div className="mt-6">{children}</div>

            {footer ? (
              <div className="mt-6 border-t border-rk-border pt-5">
                {footer}
              </div>
            ) : null}
          </div>

          <p className="mt-5 text-center text-xs leading-5 text-rk-muted">
            Protected by workspace isolation. Your sites,
            data and reports stay inside your workspace.
          </p>
        </div>
      </div>
    </main>
  );
}

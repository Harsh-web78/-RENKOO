import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

import PublicFooter from '../../components/PublicFooter';
import PublicHeader from '../../components/PublicHeader';
import {
  CATALOG_PLANS,
  TRIAL_DAYS,
  formatCount,
  paidCatalogPlans,
  type CatalogPlan,
} from '@/lib/plans';

/*
 * RENKOO — public pricing page.
 *
 * Marketing-only and static: every number below comes from
 * frontend/src/lib/plans.ts, which mirrors the backend
 * commercial config (backend/src/billing/plans.config.ts).
 * No prices or limits are invented here. Only implemented
 * product capabilities are listed — white-label, API
 * access, scheduled reports and client-portal claims are
 * intentionally omitted (no implementation exists).
 */

export const metadata: Metadata = {
  title: 'RENKOO Pricing — plans for every growth operation',
  description:
    'SEO, AI search visibility, and growth intelligence in one command center. Compare Starter, Growth, Scale and Agency plans with real limits.',
};

function usd(value: number): string {
  return `$${value.toLocaleString('en-US')}`;
}

function inr(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

/** Upgrade deltas vs the previous paid plan (all real limits). */
function planHighlights(plan: CatalogPlan): string[] {
  const l = plan.limits;

  switch (plan.code) {
    case 'STARTER':
      return [...plan.capabilities];
    case 'GROWTH':
      return [
        'Everything in Starter, plus:',
        `${formatCount(l.keywords)} tracked keywords`,
        `${formatCount(l.competitors)} competitors`,
        `${formatCount(l.crawlCredits)} crawl credits / month`,
        `${formatCount(l.aiPrompts)} AI prompts tracked`,
        `${formatCount(l.aiScans)} AI scans / month`,
        `${formatCount(l.reportsPerMonth)} reports / month`,
        `${formatCount(l.teamMembers)} team seats`,
        `${formatCount(l.clients)} client workspaces`,
        `${formatCount(l.aiGrowthActionsPerMonth)} growth actions / month`,
      ];
    case 'SCALE':
      return [
        'Everything in Growth, plus:',
        `${formatCount(l.websites)} websites`,
        `${formatCount(l.keywords)} tracked keywords`,
        `${formatCount(l.competitors)} competitors`,
        `${formatCount(l.crawlCredits)} crawl credits / month`,
        `${formatCount(l.reportsPerMonth)} reports / month`,
        `${formatCount(l.teamMembers)} team seats`,
        `${formatCount(l.clients)} client workspaces`,
        'Advanced monitoring',
      ];
    case 'AGENCY':
      return [
        'Everything in Scale, plus:',
        `${formatCount(l.websites)} websites`,
        `${formatCount(l.keywords)} tracked keywords`,
        `${formatCount(l.competitors)} competitors`,
        `${formatCount(l.crawlCredits)} crawl credits / month`,
        `${formatCount(l.reportsPerMonth)} reports / month`,
        `${formatCount(l.teamMembers)} team seats`,
        `${formatCount(l.clients)} client workspaces`,
        'Agency reporting',
      ];
    default:
      return [...plan.capabilities];
  }
}

function PricingCard({ plan }: { plan: CatalogPlan }) {
  const isPopular = plan.emphasis === 'popular';
  const isAgency = plan.emphasis === 'agency';
  const yearlySavings =
    plan.usd.monthly * 12 - plan.usd.yearlyTotal;

  return (
    <article
      aria-labelledby={`plan-${plan.code}`}
      className={`rk-card flex flex-col overflow-hidden ${
        isPopular
          ? 'border-rk-ink shadow-rk-md ring-1 ring-rk-ink xl:-translate-y-1'
          : ''
      } ${isAgency ? 'border-rk-strong' : ''}`}
    >
      {isPopular && (
        <p className="bg-rk-ink px-5 py-2 text-center text-[11px] font-extrabold uppercase tracking-[0.12em] text-white">
          Most popular
        </p>
      )}
      {isAgency && (
        <p className="border-b border-rk-border bg-rk-soft px-5 py-2 text-center text-[11px] font-extrabold uppercase tracking-[0.12em] text-rk-ink">
          Built for agencies
        </p>
      )}

      <div className="flex flex-1 flex-col p-6 sm:p-7">
        <p className="rk-label">{plan.audience}</p>
        <h2
          id={`plan-${plan.code}`}
          className="mt-2 text-[22px] font-extrabold tracking-[-0.02em] text-rk-ink"
        >
          {plan.name}
        </h2>
        <p className="mt-2 min-h-0 text-[14px] font-semibold leading-6 text-rk-ink sm:min-h-[48px]">
          {plan.valueProposition}
        </p>

        <p className="mt-4 flex items-end gap-1.5">
          <span className="rk-metric-number text-[38px] leading-none">
            {usd(plan.usd.monthly)}
          </span>
          <span className="mb-1 text-[13px] font-semibold text-rk-muted">
            /month
          </span>
        </p>
        <p className="rk-metadata mt-1.5">
          {inr(plan.inr.monthly)}/month · billed in INR via
          Razorpay
        </p>
        <p className="rk-metadata mt-0.5">
          or {usd(plan.usd.yearlyTotal)}/year billed annually
          {yearlySavings > 0 &&
            ` · save ${usd(yearlySavings)}`}
        </p>

        <Link
          href="/signup"
          aria-label={`${plan.cta} — ${plan.name} plan, ${usd(plan.usd.monthly)} per month`}
          className={`rk-focusable mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-rk-md px-6 text-[15px] font-bold shadow-rk-sm ${
            isPopular
              ? 'bg-rk-ink text-white hover:opacity-90'
              : 'border border-rk-strong bg-rk-surface text-rk-ink hover:bg-rk-soft'
          }`}
        >
          {plan.cta}
          <ArrowRight size={16} aria-hidden />
        </Link>
        {plan.trialEligible && (
          <p className="mt-2 text-center text-xs font-semibold text-rk-secondary">
            {TRIAL_DAYS}-day trial available · no card required
            to explore
          </p>
        )}

        <dl className="mt-6 grid grid-cols-2 gap-2 rounded-rk-md border border-rk-border bg-rk-soft p-3">
          {(
            [
              ['Websites', plan.limits.websites],
              ['Keywords', plan.limits.keywords],
              ['Competitors', plan.limits.competitors],
              ['Crawls / mo', plan.limits.crawlCredits],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-rk-muted">
                {label}
              </dt>
              <dd className="rk-metric-number mt-0.5 text-[18px]">
                {formatCount(value)}
              </dd>
            </div>
          ))}
        </dl>

        <p className="rk-field-label mt-6">Includes</p>
        <ul className="mt-3 flex-1 space-y-2.5">
          {planHighlights(plan).map((highlight) => (
            <li
              key={highlight}
              className="flex items-start gap-2.5 text-[13px] font-medium leading-6 text-rk-ink"
            >
              <CheckCircle2
                size={15}
                aria-hidden
                className="mt-1 shrink-0 text-rk-success"
              />
              {highlight}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

/*
 * Capacity comparison rows derive from CATALOG_PLANS (which mirrors
 * backend plans.config.ts). No numerical limits are duplicated here —
 * only marketing copy ('Yes', 'Yes + advanced', '—') lives below.
 */
function limitCell(
  code: string,
  key: keyof CatalogPlan['limits'],
): string {
  const plan = CATALOG_PLANS.find((p) => p.code === code);
  const value = plan?.limits[key];
  if (typeof value !== 'number') return '—';
  if (key === 'clients' && value === 0) return '—';
  return formatCount(value);
}

function capacityValues(
  key: keyof CatalogPlan['limits'],
): Record<string, string> {
  return {
    FREE: limitCell('FREE', key),
    STARTER: limitCell('STARTER', key),
    GROWTH: limitCell('GROWTH', key),
    SCALE: limitCell('SCALE', key),
    AGENCY: limitCell('AGENCY', key),
  };
}

const COMPARISON: {
  group: string;
  rows: {
    label: string;
    values: Record<string, string>;
  }[];
}[] = [
  {
    group: 'Capacity',
    rows: [
      { label: 'Websites', values: capacityValues('websites') },
      {
        label: 'Tracked keywords',
        values: capacityValues('keywords'),
      },
      {
        label: 'Competitors',
        values: capacityValues('competitors'),
      },
      {
        label: 'Crawl credits / month',
        values: capacityValues('crawlCredits'),
      },
      {
        label: 'AI scans / month',
        values: capacityValues('aiScans'),
      },
      {
        label: 'AI prompts tracked',
        values: capacityValues('aiPrompts'),
      },
      {
        label: 'Growth actions / month',
        values: capacityValues('aiGrowthActionsPerMonth'),
      },
      {
        label: 'Reports / month',
        values: capacityValues('reportsPerMonth'),
      },
      {
        label: 'Client workspaces',
        values: capacityValues('clients'),
      },
      {
        label: 'Team seats',
        values: capacityValues('teamMembers'),
      },
    ],
  },
  {
    group: 'Product',
    rows: [
      {
        label: 'Search visibility + Technical SEO',
        values: {
          FREE: 'Yes',
          STARTER: 'Yes',
          GROWTH: 'Yes',
          SCALE: 'Yes',
          AGENCY: 'Yes',
        },
      },
      {
        label: 'Google Search Console + GA4',
        values: {
          FREE: 'Yes',
          STARTER: 'Yes',
          GROWTH: 'Yes',
          SCALE: 'Yes',
          AGENCY: 'Yes',
        },
      },
      {
        label: 'AI visibility tracking',
        values: {
          FREE: 'Yes',
          STARTER: 'Yes',
          GROWTH: 'Yes',
          SCALE: 'Yes',
          AGENCY: 'Yes',
        },
      },
      {
        label: 'AEO + GEO insights',
        values: {
          FREE: '—',
          STARTER: 'Yes',
          GROWTH: 'Yes',
          SCALE: 'Yes',
          AGENCY: 'Yes',
        },
      },
      {
        label: 'Content engine',
        values: {
          FREE: '—',
          STARTER: 'Yes',
          GROWTH: 'Yes',
          SCALE: 'Yes',
          AGENCY: 'Yes',
        },
      },
      {
        label: 'Competitor + backlink intelligence',
        values: {
          FREE: '—',
          STARTER: 'Yes',
          GROWTH: 'Yes',
          SCALE: 'Yes',
          AGENCY: 'Yes',
        },
      },
      {
        label: 'Leads, revenue + ROI',
        values: {
          FREE: 'Yes',
          STARTER: 'Yes',
          GROWTH: 'Yes',
          SCALE: 'Yes',
          AGENCY: 'Yes',
        },
      },
      {
        label: 'AI Business Brain',
        values: {
          FREE: 'Yes',
          STARTER: 'Yes',
          GROWTH: 'Yes',
          SCALE: 'Yes',
          AGENCY: 'Yes',
        },
      },
      {
        label: 'Monitoring',
        values: {
          FREE: '—',
          STARTER: 'Yes',
          GROWTH: 'Yes',
          SCALE: 'Yes + advanced',
          AGENCY: 'Yes + advanced',
        },
      },
    ],
  },
];

export default function PricingPage() {
  const paid = paidCatalogPlans();
  const free = CATALOG_PLANS.find(
    (plan) => plan.code === 'FREE',
  );

  return (
    <>
      <a
        href="#pricing-content"
        className="rk-focusable sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-rk-md focus:bg-rk-ink focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
      >
        Skip to content
      </a>

      <PublicHeader />

      <main id="pricing-content">
        <section
          aria-labelledby="pricing-heading"
          className="border-b border-rk-border bg-rk-bg"
        >
          <div className="mx-auto max-w-[1100px] px-5 pb-12 pt-12 sm:pt-16 lg:px-8">
            <div className="max-w-2xl">
              <p className="rk-label">Pricing</p>
              <h1
                id="pricing-heading"
                className="mt-2 text-[32px] font-extrabold leading-[1.1] tracking-[-0.03em] text-rk-ink sm:text-[42px]"
              >
                Choose the plan that fits your growth.
              </h1>
              <p className="mt-4 text-[16px] leading-7 text-rk-secondary">
                SEO, AI search visibility, and growth
                intelligence in one command center — with
                real limits, real billing, and no surprises.{' '}
                <Link
                  href="/snapshot"
                  className="rk-focusable font-bold text-rk-ink underline decoration-rk-border-strong underline-offset-4 hover:decoration-rk-ink"
                >
                  Free AI Visibility Snapshot
                </Link>
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {paid.map((plan) => (
                <PricingCard key={plan.code} plan={plan} />
              ))}
            </div>

            {free && (
              <p className="rk-metadata mt-6 text-center">
                Exploring? Start free — {free.limits.websites}{' '}
                website, {formatCount(free.limits.keywords)}{' '}
                keywords,{' '}
                {formatCount(free.limits.crawlCredits)} crawl
                credits. No card required.{' '}
                <Link
                  href="/signup"
                  className="rk-focusable font-bold text-rk-ink underline decoration-rk-border-strong underline-offset-4 hover:decoration-rk-ink"
                >
                  Create a free account
                </Link>
              </p>
            )}
          </div>
        </section>

        <section
          aria-labelledby="compare-heading"
          className="border-b border-rk-border bg-rk-surface"
        >
          <div className="mx-auto max-w-[1100px] px-5 py-14 lg:px-8">
            <p className="rk-label">Compare</p>
            <h2
              id="compare-heading"
              className="mt-2 text-[24px] font-extrabold tracking-[-0.025em] text-rk-ink sm:text-[30px]"
            >
              What each plan includes
            </h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-7 text-rk-secondary">
              Capacity numbers are enforced limits. Upgrade
              any time — your data is preserved, and
              downgrades never delete anything.
            </p>

            <div
              className="rk-card mt-8 overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-labelledby="compare-heading"
            >
              <table className="w-full min-w-[720px] border-collapse text-left">
                <caption className="sr-only">
                  Capacity and product limits by plan
                </caption>
                <thead>
                  <tr className="border-b border-rk-border">
                    <th
                      scope="col"
                      className="px-5 py-4 text-xs font-bold text-rk-secondary"
                    >
                      <span className="sr-only">Feature</span>
                    </th>
                    {CATALOG_PLANS.map((plan) => (
                      <th
                        key={plan.code}
                        scope="col"
                        className="px-3 py-4 text-right text-xs font-extrabold text-rk-ink"
                      >
                        {plan.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                {COMPARISON.map((section) => (
                  <tbody key={section.group}>
                    <tr className="border-b border-rk-border bg-rk-soft">
                      <td
                        colSpan={CATALOG_PLANS.length + 1}
                        className="rk-field-label px-5 py-2.5"
                      >
                        {section.group}
                      </td>
                    </tr>
                    {section.rows.map((row) => (
                      <tr
                        key={row.label}
                        className="border-b border-rk-border last:border-b-0"
                      >
                        <th
                          scope="row"
                          className="px-5 py-3 text-[13px] font-semibold text-rk-secondary"
                        >
                          {row.label}
                        </th>
                        {CATALOG_PLANS.map((plan) => (
                          <td
                            key={plan.code}
                            className="px-3 py-3 text-right text-[13px] font-bold tabular-nums text-rk-ink"
                          >
                            {row.values[plan.code] ?? '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="billing-notes-heading"
          className="bg-rk-bg"
        >
          <div className="mx-auto max-w-[1100px] px-5 py-14 lg:px-8">
            <div className="rk-card rk-card-padded">
              <h2
                id="billing-notes-heading"
                className="rk-panel-title"
              >
                Billing, honestly
              </h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  'Prices shown in USD with INR equivalents. INR checkout via Razorpay; USD checkout via Stripe where available. Razorpay USD stays gated until international-cards activation.',
                  `Growth includes a ${TRIAL_DAYS}-day trial. Nothing is charged unless you subscribe — expired trials return to free limits.`,
                  'Cancel any time — access continues until the end of the billing period.',
                  'Hitting a limit never deletes data. Upgrade to raise the limit and continue.',
                  'Downgrades take effect at the next cycle, and only when current usage fits the new plan.',
                  'Yearly billing is charged once per year at the annual total shown on checkout. Taxes depend on provider/account settings and are shown at checkout.',
                ].map((note) => (
                  <li
                    key={note}
                    className="flex items-start gap-2.5 text-[13px] font-medium leading-6 text-rk-ink"
                  >
                    <CheckCircle2
                      size={15}
                      aria-hidden
                      className="mt-1 shrink-0 text-rk-success"
                    />
                    {note}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <Link
                  href="/signup"
                  className="rk-focusable inline-flex h-12 items-center justify-center gap-2 rounded-rk-md bg-rk-ink px-7 text-[15px] font-bold text-white shadow-rk-md hover:opacity-90"
                >
                  Get started
                  <ArrowRight size={16} aria-hidden />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </>
  );
}

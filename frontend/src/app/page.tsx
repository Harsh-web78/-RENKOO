import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  Brain,
  CheckCircle2,
  FileText,
  Globe2,
  LayoutDashboard,
  Link2,
  Search,
  ShieldCheck,
  Sparkles,
  Swords,
  Target,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import HomeRedirect from '../components/HomeRedirect';
import PublicFooter from '../components/PublicFooter';
import PublicHeader from '../components/PublicHeader';

/*
 * RENKOO — public homepage.
 *
 * This route is public and marketing-only. It never
 * calls product APIs and never reads workspace data.
 * All product visuals below are static, explicitly
 * labelled illustrative previews — they are not
 * connected to any data source.
 *
 * The authenticated Growth Command Center lives at
 * `/dashboard`. Signed-in visitors are redirected
 * there by <HomeRedirect /> (client-side, after the
 * public page renders).
 */

export const metadata: Metadata = {
  title: 'RENKOO — The AI Growth Operating System',
  description:
    'RENKOO is the AI Growth Operating System: connect your website, search and revenue data to find what is hurting growth, understand why, decide what matters, execute improvements, and prove the revenue impact.',
  verification: {
    google: 'TGVerD5TpgTalkvB79iTOf04w7ZqLf4pMhoY5g3SkOQ',
  },
};

const CORE_LOOP: { title: string; description: string }[] = [
  {
    title: 'Find what is hurting growth',
    description:
      'One workspace for search visibility, technical health, AI visibility, competitors, content, leads and revenue.',
  },
  {
    title: 'Understand why',
    description:
      'Monitoring shows what changed, and RENKOO explains the evidence behind each signal — never more than the data supports.',
  },
  {
    title: 'Decide what matters',
    description:
      'Opportunities are ranked so the highest-impact work comes first.',
  },
  {
    title: 'Execute it',
    description:
      'Turn recommendations into tracked actions and work through them in the product.',
  },
  {
    title: 'Prove the revenue impact',
    description:
      'Follow traffic into leads, conversions and revenue, and report on what actually moved.',
  },
];

const HOW_IT_WORKS: { step: string; title: string; description: string }[] = [
  {
    step: '01',
    title: 'Connect your website',
    description:
      'Add your site and connect Google Search Console and Analytics to bring in real performance data.',
  },
  {
    step: '02',
    title: 'See what changed',
    description:
      'RENKOO audits your site and monitors it over time, surfacing the changes worth your attention.',
  },
  {
    step: '03',
    title: 'Understand why it matters',
    description:
      'Each signal ships with its evidence, so you can judge what deserves action.',
  },
  {
    step: '04',
    title: 'Work the plan',
    description:
      'Ranked opportunities become tracked actions. Execute them in priority order.',
  },
  {
    step: '05',
    title: 'Measure the outcome',
    description:
      'Watch traffic turn into leads and revenue, and report on the result.',
  },
];

interface Capability {
  Icon: LucideIcon;
  name: string;
  description: string;
}

const VISIBILITY: Capability[] = [
  {
    Icon: Search,
    name: 'Search Visibility',
    description:
      'Clicks, impressions, click-through rate and position from your connected Search Console property, plus the queries driving them.',
  },
  {
    Icon: ShieldCheck,
    name: 'Technical SEO',
    description:
      'Scheduled crawl audits that list open, critical and high-priority issues with the pages they affect.',
  },
  {
    Icon: Bot,
    name: 'AI Visibility · AEO / GEO',
    description:
      'Tracked prompts and checks that show how your brand appears in AI answers — and where it is missing.',
  },
];

const DECIDE_EXECUTE: Capability[] = [
  {
    Icon: Target,
    name: 'Opportunities',
    description:
      'Findings from across the workspace, ranked by priority so the team always knows what to fix first.',
  },
  {
    Icon: FileText,
    name: 'Content Engine',
    description:
      'Content workflows grounded in your keywords, visibility gaps and competitor context.',
  },
  {
    Icon: Swords,
    name: 'Competitors & Backlinks',
    description:
      'Side-by-side competitor comparison and backlink tracking to spot the gaps that matter.',
  },
];

const PROVE: Capability[] = [
  {
    Icon: TrendingUp,
    name: 'Leads & Revenue',
    description:
      'Record leads and revenue against your traffic so growth connects to pipeline, not just pageviews.',
  },
  {
    Icon: Wallet,
    name: 'ROI',
    description:
      'A traffic → leads → revenue funnel built from your recorded data — nothing estimated, nothing invented.',
  },
  {
    Icon: Brain,
    name: 'AI · Business Brain',
    description:
      'Ask RENKOO about your own workspace data and get answers with evidence — and an honest answer when data is missing.',
  },
  {
    Icon: Activity,
    name: 'Monitoring & Reports',
    description:
      'Continuous change detection across crawls, plus reports you can share with clients and stakeholders.',
  },
];

function CapabilityCard({ Icon, name, description }: Capability) {
  return (
    <div className="rk-card rk-card-padded">
      <div className="grid h-10 w-10 place-items-center rounded-rk-md border border-rk-border bg-rk-soft text-rk-ink">
        <Icon size={19} aria-hidden />
      </div>
      <h3 className="rk-panel-title mt-4">{name}</h3>
      <p className="mt-2 text-[13px] leading-6 text-rk-secondary">
        {description}
      </p>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="rk-label">{eyebrow}</p>
      <h2 className="mt-2 text-[24px] font-extrabold leading-[1.2] tracking-[-0.025em] text-rk-ink sm:text-[30px]">
        {title}
      </h2>
      <p className="mt-3 text-[15px] leading-7 text-rk-secondary">
        {description}
      </p>
    </div>
  );
}

export default function PublicHomePage() {
  return (
    <>
      <a
        href="#main-content"
        className="rk-focusable sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-rk-md focus:bg-rk-ink focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
      >
        Skip to content
      </a>

      <HomeRedirect />
      <PublicHeader />

      <main id="main-content">
        {/* ================================================
            HERO
        ================================================= */}
        <section
          aria-labelledby="hero-heading"
          className="border-b border-rk-border bg-rk-bg"
        >
          <div className="mx-auto grid max-w-[1100px] items-center gap-10 px-5 pb-14 pt-12 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:pb-20 lg:pt-20">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-rk-border bg-rk-surface px-3 py-1.5 text-xs font-bold text-rk-secondary shadow-rk-sm">
                <Sparkles size={13} aria-hidden />
                RENKOO · AI Growth Operating System
              </p>

              <h1
                id="hero-heading"
                className="mt-5 text-[34px] font-extrabold leading-[1.08] tracking-[-0.035em] text-rk-ink sm:text-[48px]"
              >
                The AI Growth Operating System
              </h1>

              <ol className="mt-6 space-y-2">
                {[
                  'Find what is hurting growth.',
                  'Understand why.',
                  'Decide what matters.',
                  'Execute it.',
                  'Prove the revenue impact.',
                ].map((line) => (
                  <li
                    key={line}
                    className="flex items-start gap-2.5 text-[15px] font-semibold leading-7 text-rk-ink"
                  >
                    <CheckCircle2
                      size={17}
                      aria-hidden
                      className="mt-1.5 shrink-0 text-rk-success"
                    />
                    {line}
                  </li>
                ))}
              </ol>

              <p className="mt-5 max-w-xl text-[15px] leading-7 text-rk-secondary">
                RENKOO brings your website, search, content
                and revenue data into one workspace — then
                turns it into a ranked plan, tracked
                actions, and measurable outcomes.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/signup"
                  className="rk-focusable inline-flex h-12 items-center justify-center gap-2 rounded-rk-md bg-rk-ink px-7 text-[15px] font-bold text-white shadow-rk-md hover:opacity-90"
                >
                  Get started
                  <ArrowRight size={16} aria-hidden />
                </Link>
                <Link
                  href="/login"
                  className="rk-focusable inline-flex h-12 items-center justify-center rounded-rk-md border border-rk-strong bg-rk-surface px-7 text-[15px] font-bold text-rk-ink shadow-rk-sm hover:bg-rk-soft"
                >
                  Sign in
                </Link>
              </div>

              <p className="rk-metadata mt-4">
                Set up your first website in minutes. Your
                data stays inside your workspace.
              </p>
            </div>

            {/* Illustrative product preview — static mock, no APIs */}
            <figure className="rk-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-rk-border bg-rk-soft px-5 py-3">
                <p className="flex items-center gap-2 text-[13px] font-bold text-rk-ink">
                  <LayoutDashboard size={15} aria-hidden />
                  Growth Command Center
                </p>
                <span className="rounded-full border border-rk-border bg-rk-surface px-2.5 py-1 text-[11px] font-bold text-rk-secondary">
                  Example preview
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 p-5">
                {[
                  {
                    label: 'Search visibility',
                    value: '12,480',
                    detail: 'Clicks · last 28 days',
                  },
                  {
                    label: 'Technical health',
                    value: '82',
                    detail: 'Audit score · 14 open issues',
                  },
                  {
                    label: 'High-priority fixes',
                    value: '6',
                    detail: 'Ranked opportunities',
                  },
                  {
                    label: 'Revenue recorded',
                    value: '$48,200',
                    detail: 'From connected lead data',
                  },
                ].map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-rk-md border border-rk-border bg-rk-surface p-3.5"
                  >
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-rk-muted">
                      {metric.label}
                    </p>
                    <p className="rk-metric-number mt-1 text-[22px]">
                      {metric.value}
                    </p>
                    <p className="rk-metadata mt-0.5">
                      {metric.detail}
                    </p>
                  </div>
                ))}
              </div>

              <div className="px-5 pb-5">
                <div className="rounded-rk-md border border-rk-border bg-rk-surface p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-rk-danger-soft px-2.5 py-1 text-[11px] font-bold text-rk-danger">
                      High priority
                    </span>
                    <span className="rk-metadata">
                      Opportunity · example
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-bold text-rk-ink">
                    Fix low-CTR queries ranking on page one
                  </p>
                  <p className="mt-1 text-[13px] leading-6 text-rk-secondary">
                    Example recommendation card. In your
                    workspace, each opportunity ships with
                    its evidence and a one-click action.
                  </p>
                </div>
              </div>

              <figcaption className="border-t border-rk-border bg-rk-soft px-5 py-3 text-xs leading-5 text-rk-muted">
                Illustrative preview with example content —
                your workspace shows your own connected
                data.
              </figcaption>
            </figure>
          </div>
        </section>

        {/* ================================================
            HOW IT WORKS
        ================================================= */}
        <section
          aria-labelledby="how-it-works-heading"
          id="how-it-works"
          className="scroll-mt-20 border-b border-rk-border bg-rk-surface"
        >
          <div className="mx-auto max-w-[1100px] px-5 py-14 lg:px-8 lg:py-20">
            <SectionHeading
              eyebrow="How it works"
              title="From data to revenue, in one loop"
              description="RENKOO runs a continuous operating loop: connect real data, surface what matters, execute the work, and measure what it earned."
            />

            <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:gap-4">
              {HOW_IT_WORKS.map((item) => (
                <li
                  key={item.step}
                  className="rk-card rk-card-padded"
                >
                  <p
                    aria-hidden
                    className="rk-metric-number text-[13px] text-rk-muted"
                  >
                    {item.step}
                  </p>
                  <h3 className="rk-panel-title mt-2">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-6 text-rk-secondary">
                    {item.description}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ================================================
            PRODUCT
        ================================================= */}
        <section
          aria-labelledby="product-heading"
          id="product"
          className="scroll-mt-20 border-b border-rk-border bg-rk-bg"
        >
          <div className="mx-auto max-w-[1100px] px-5 py-14 lg:px-8 lg:py-20">
            <SectionHeading
              eyebrow="Product"
              title="Everything growth needs, in one workspace"
              description="Each area below is a working part of RENKOO — powered by data you connect, with honest states whenever data is missing."
            />

            {/* Growth Command Center */}
            <div className="rk-card mt-8 overflow-hidden lg:mt-10">
              <div className="grid gap-0 lg:grid-cols-2">
                <div className="p-6 sm:p-8 lg:p-10">
                  <p className="rk-label">Start here</p>
                  <h3 className="mt-2 flex items-center gap-2 text-[20px] font-extrabold tracking-[-0.02em] text-rk-ink">
                    <Globe2
                      size={20}
                      aria-hidden
                      className="shrink-0"
                    />
                    Growth Command Center
                  </h3>
                  <p className="mt-3 text-[14px] leading-7 text-rk-secondary">
                    Your daily home in RENKOO: a growth
                    pulse across every connected source,
                    what changed since the last check, why
                    it matters, and today&apos;s ranked
                    growth plan — all for the website you
                    have selected.
                  </p>
                  <ul className="mt-5 space-y-2.5">
                    {[
                      'Growth pulse across search, technical, AI, traffic, leads and revenue',
                      'What changed, with severity and evidence on every item',
                      "Today's growth plan, ranked by priority",
                    ].map((point) => (
                      <li
                        key={point}
                        className="flex items-start gap-2.5 text-[13px] font-medium leading-6 text-rk-ink"
                      >
                        <CheckCircle2
                          size={15}
                          aria-hidden
                          className="mt-1 shrink-0 text-rk-success"
                        />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="border-t border-rk-border bg-rk-soft p-6 sm:p-8 lg:border-l lg:border-t-0">
                  <p className="rk-field-label">
                    Example · today&apos;s growth plan
                  </p>
                  <ol className="mt-3 space-y-2.5">
                    {[
                      {
                        rank: '1',
                        tone: 'bg-rk-danger-soft text-rk-danger',
                        label: 'High',
                        title:
                          'Rewrite titles for 4 low-CTR queries',
                        meta: 'Search visibility · example',
                      },
                      {
                        rank: '2',
                        tone: 'bg-rk-danger-soft text-rk-danger',
                        label: 'High',
                        title:
                          'Fix 3 critical crawl errors on pricing pages',
                        meta: 'Technical SEO · example',
                      },
                      {
                        rank: '3',
                        tone: 'bg-rk-warning-soft text-rk-warning',
                        label: 'Medium',
                        title:
                          'Publish brief for an AI-visible comparison page',
                        meta: 'Content Engine · example',
                      },
                    ].map((item) => (
                      <li
                        key={item.rank}
                        className="rounded-rk-md border border-rk-border bg-rk-surface p-3.5"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            aria-hidden
                            className="rk-metric-number text-[13px] text-rk-muted"
                          >
                            {item.rank}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${item.tone}`}
                          >
                            {item.label}
                          </span>
                          <span className="rk-metadata">
                            {item.meta}
                          </span>
                        </div>
                        <p className="mt-1.5 text-[13px] font-bold text-rk-ink">
                          {item.title}
                        </p>
                      </li>
                    ))}
                  </ol>
                  <p className="rk-metadata mt-3">
                    Illustrative example — your plan is
                    ranked from your own findings.
                  </p>
                </div>
              </div>
            </div>

            {/* Visibility */}
            <h3 className="mt-12 text-[17px] font-extrabold tracking-[-0.02em] text-rk-ink">
              Know exactly where you stand
            </h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
              {VISIBILITY.map((cap) => (
                <CapabilityCard key={cap.name} {...cap} />
              ))}
            </div>

            {/* Decide & execute */}
            <h3 className="mt-12 text-[17px] font-extrabold tracking-[-0.02em] text-rk-ink">
              Decide fast, then execute
            </h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
              {DECIDE_EXECUTE.map((cap) => (
                <CapabilityCard key={cap.name} {...cap} />
              ))}
            </div>

            {/* Prove */}
            <h3 className="mt-12 text-[17px] font-extrabold tracking-[-0.02em] text-rk-ink">
              Prove the revenue impact
            </h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:gap-4">
              {PROVE.map((cap) => (
                <CapabilityCard key={cap.name} {...cap} />
              ))}
            </div>
          </div>
        </section>

        {/* ================================================
            CORE LOOP
        ================================================= */}
        <section
          aria-labelledby="loop-heading"
          className="border-b border-rk-border bg-rk-surface"
        >
          <div className="mx-auto grid max-w-[1100px] gap-8 px-5 py-14 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-20">
            <SectionHeading
              eyebrow="Operating loop"
              title="Data → intelligence → outcome"
              description="Every RENKOO workspace follows the same loop, so growth work compounds instead of scattering across tools and tabs."
            />
            <ol className="space-y-0">
              {CORE_LOOP.map((item, index) => (
                <li
                  key={item.title}
                  className="flex gap-4 border-b border-rk-border py-4 first:pt-0 last:border-b-0 last:pb-0"
                >
                  <span
                    aria-hidden
                    className="rk-metric-number mt-0.5 w-7 shrink-0 text-[15px] text-rk-muted"
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3 className="text-[14px] font-bold text-rk-ink">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-[13px] leading-6 text-rk-secondary">
                      {item.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ================================================
            HONEST AI NOTE + CTA
        ================================================= */}
        <section
          aria-labelledby="cta-heading"
          className="bg-rk-bg"
        >
          <div className="mx-auto max-w-[1100px] px-5 py-14 lg:px-8 lg:py-20">
            <div className="rk-card overflow-hidden">
              <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.2fr_0.8fr] lg:p-12">
                <div>
                  <p className="rk-label">Get started</p>
                  <h2
                    id="cta-heading"
                    className="mt-2 text-[26px] font-extrabold leading-[1.15] tracking-[-0.03em] text-rk-ink sm:text-[32px]"
                  >
                    Stop guessing what to fix next.
                  </h2>
                  <p className="mt-3 max-w-xl text-[15px] leading-7 text-rk-secondary">
                    Create your workspace, connect your
                    website, and see your first growth plan
                    — built from your data, with evidence
                    on every recommendation.
                  </p>
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Link
                      href="/signup"
                      className="rk-focusable inline-flex h-12 items-center justify-center gap-2 rounded-rk-md bg-rk-ink px-7 text-[15px] font-bold text-white shadow-rk-md hover:opacity-90"
                    >
                      Get started
                      <ArrowRight size={16} aria-hidden />
                    </Link>
                    <Link
                      href="/login"
                      className="rk-focusable inline-flex h-12 items-center justify-center rounded-rk-md border border-rk-strong bg-rk-surface px-7 text-[15px] font-bold text-rk-ink shadow-rk-sm hover:bg-rk-soft"
                    >
                      Sign in
                    </Link>
                  </div>
                </div>
                <div className="rounded-rk-md border border-rk-border bg-rk-soft p-5">
                  <p className="flex items-center gap-2 text-[13px] font-bold text-rk-ink">
                    <BarChart3 size={15} aria-hidden />
                    What you get
                  </p>
                  <ul className="mt-3 space-y-2.5">
                    {[
                      'Growth Command Center for every website',
                      'Search, technical and AI visibility in one place',
                      'Ranked opportunities with tracked actions',
                      'Lead, revenue and ROI reporting',
                    ].map((point) => (
                      <li
                        key={point}
                        className="flex items-start gap-2.5 text-[13px] font-medium leading-6 text-rk-ink"
                      >
                        <CheckCircle2
                          size={15}
                          aria-hidden
                          className="mt-1 shrink-0 text-rk-success"
                        />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <p className="rk-metadata mx-auto mt-6 max-w-2xl text-center">
              RENKOO reports what your data shows — and says
              so plainly when data is not connected yet. No
              invented metrics, no guessed revenue.
            </p>
          </div>
        </section>
      </main>

      <PublicFooter />
    </>
  );
}

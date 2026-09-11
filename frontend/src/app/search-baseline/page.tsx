'use client';

/*
 * RENKOO Search Baseline 1.0 — "Where am I now?"
 * command center. ONE composed request
 * (GET /keywords/baseline): GSC period comparison +
 * Strategy 5.0 + content + crawl evidence. No new
 * scores, no invented metrics — every number carries
 * evidence, unavailable renders as a state, never zero.
 *
 * Hierarchy: WHERE YOU ARE → WHAT CHANGED → WHAT
 * MATTERS → WHAT TO DO → DEEP DATA. Source order
 * matches mobile priority (opportunity → moves →
 * metrics → movers → detail).
 */

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import AppShell from '@/components/AppShell';
import {
  DataSourceBadge,
  EmptyState,
  ErrorState,
  FreshnessBadge,
  LoadingBlock,
  NotConnectedState,
  PageHeader,
  Panel,
  Metric,
  SecondaryButton,
} from '@/components/ui';
import {
  TrendChart,
} from '@/components/charts/RenkooCharts';
import type { TrendPoint } from '@/components/charts/primitives';
import {
  getSearchBaseline,
  getWebsites,
  type SearchBaselineResponse,
  type Website,
} from '@/lib/api';
import SearchCapturePanel from './search-capture';

/* ---------- formatting (display only) ---------- */

function fmtInt(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('en-US');
}

function fmtPct(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const pct = n * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function fmtPp(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}pp`;
}

function fmtCtr(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

function fmtPos(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return n.toFixed(1);
}

function compactUrl(url: unknown): string {
  const raw = String(url ?? '').trim();
  if (!raw) return '—';
  return raw
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .slice(0, 72);
}

function Chip({
  label,
  tone,
}: {
  label: string;
  tone: 'positive' | 'warning' | 'negative' | 'neutral';
}) {
  const cls =
    tone === 'positive'
      ? 'border-rk-success/30 bg-rk-success/10 text-rk-success'
      : tone === 'warning'
        ? 'border-rk-border bg-rk-warningSoft text-rk-warning'
        : tone === 'negative'
          ? 'border-rk-border bg-rk-dangerSoft text-rk-danger'
          : 'border-rk-border bg-rk-soft text-rk-secondary';
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-rk-sm border px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}
    >
      {label}
    </span>
  );
}

function priorityTone(
  priority: unknown,
): 'positive' | 'warning' | 'neutral' {
  const p = String(priority ?? '').toUpperCase();
  if (p === 'HIGH') return 'positive';
  if (p === 'MEDIUM') return 'warning';
  return 'neutral';
}

function healthTone(
  state: unknown,
): 'positive' | 'warning' | 'negative' | 'neutral' {
  switch (String(state ?? '').toUpperCase()) {
    case 'STRONG':
    case 'READY':
    case 'COVERED':
      return 'positive';
    case 'GAPS':
    case 'ATTENTION':
      return 'warning';
    case 'BASELINE':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export default function SearchBaselinePage() {
  const [navOpen, setNavOpen] = useState(false);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [days, setDays] = useState(28);
  const [baseline, setBaseline] =
    useState<SearchBaselineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(
    async (siteId: string, periodDays: number) => {
      if (!siteId) return;
      setLoading(true);
      setError('');
      try {
        const res = await getSearchBaseline({
          websiteId: siteId,
          days: periodDays,
        });
        setBaseline(res);
      } catch (err: any) {
        setError(
          err?.message || 'Search baseline failed to load.',
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    getWebsites()
      .then((sites) => {
        if (cancelled) return;
        const list = Array.isArray(sites) ? sites : [];
        setWebsites(list);
        const stored =
          typeof window !== 'undefined'
            ? localStorage.getItem('renkoo_website_id')
            : null;
        const valid =
          stored && list.some((s) => s.id === stored)
            ? stored
            : list[0]?.id || '';
        setWebsiteId(valid);
        if (valid) void load(valid, 28);
        else setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setWebsites([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  function handleWebsiteChange(id: string) {
    setWebsiteId(id);
    setBaseline(null);
    if (typeof window !== 'undefined') {
      if (id) localStorage.setItem('renkoo_website_id', id);
      else localStorage.removeItem('renkoo_website_id');
    }
    if (id) void load(id, days);
  }

  function handleDaysChange(next: number) {
    setDays(next);
    setBaseline(null);
    if (websiteId) void load(websiteId, next);
  }

  const activeWebsite =
    websites.find((w) => w.id === websiteId) ?? null;
  const summary = baseline?.summary ?? null;
  const trendPoints: TrendPoint[] = (
    baseline?.trend.points ?? []
  ).map((p) => ({
    x: String(p.label ?? ''),
    y: Number(p.current ?? 0),
    previous:
      typeof p.previous === 'number'
        ? p.previous
        : undefined,
  }));

  return (
    <AppShell
      mobileOpen={navOpen}
      onClose={() => setNavOpen(false)}
      onMenu={() => setNavOpen(true)}
    >
      <PageHeader
        eyebrow="Search Baseline"
        title="Where am I now?"
        description="Your website's current Google Search position — verified observations, honest gaps, and the next moves that matter."
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <DataSourceBadge
              source="Google Search Console"
              connected={baseline?.gscConnected === true}
            />
            {baseline ? (
              <FreshnessBadge
                label={`${baseline.period.current.startDate} → ${baseline.period.current.endDate}`}
              />
            ) : null}
            {activeWebsite ? (
              <span className="truncate text-xs text-rk-secondary">
                {activeWebsite.name}
              </span>
            ) : null}
          </div>
        }
      />

      {/* Website + period controls */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="flex min-h-[44px] items-center gap-2 text-xs font-semibold text-rk-secondary">
          Website
          <select
            value={websiteId}
            onChange={(e) =>
              handleWebsiteChange(e.target.value)
            }
            aria-label="Website"
            className="input w-auto min-h-[44px]"
          >
            {websites.length === 0 ? (
              <option value="">No websites</option>
            ) : null}
            {websites.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <div
          className="flex gap-1.5"
          role="group"
          aria-label="Comparison period"
        >
          {[7, 28, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => handleDaysChange(d)}
              aria-pressed={days === d}
              className={`min-h-[44px] rounded-rk-sm border px-4 text-sm font-semibold ${
                days === d
                  ? 'border-rk-ink bg-rk-ink text-white'
                  : 'border-rk-border bg-white text-rk-secondary'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
        <SecondaryButton
          type="button"
          onClick={() => {
            if (websiteId) void load(websiteId, days);
          }}
          disabled={!websiteId || loading}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </SecondaryButton>
      </div>

      {loading ? (
        <div className="mt-4 space-y-4" aria-busy="true">
          <LoadingBlock title="Loading search baseline…" />
          <LoadingBlock title="Scoring opportunities…" lines={2} />
        </div>
      ) : error ? (
        <div className="mt-4">
          <ErrorState
            title="Search baseline failed to load"
            description={`${error} Any previously loaded data below remains usable.`}
            onRetry={() => {
              if (websiteId) void load(websiteId, days);
            }}
          />
        </div>
      ) : !websiteId ? (
        <div className="mt-4">
          <EmptyState
            title="No website selected"
            description="Connect a website first, then return for its search baseline."
            actionLabel="Open websites"
            actionHref="/websites"
          />
        </div>
      ) : baseline && !baseline.gscConnected ? (
        <div className="mt-4">
          <NotConnectedState
            title="Search Console is not connected"
            description="Connect Google Search Console to unlock verified ranking and search performance data. Strategy and crawl evidence appear once their sources exist — nothing is estimated meanwhile."
            connectLabel="Continue setup"
            connectHref="/first-value"
          />
        </div>
      ) : baseline && summary ? (
        <div className="mt-4 space-y-6">
          {/* 1. WHERE YOU ARE — hero metrics */}
          <section aria-label="Current search position">
            <Panel
              eyebrow="Baseline"
              title="Your current search position"
              description={`Google Search · ${baseline.period.current.startDate} → ${baseline.period.current.endDate} · vs previous ${baseline.period.days} days (${baseline.period.previous.startDate} → ${baseline.period.previous.endDate}). Averages are impression-weighted estimates.`}
            >
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Metric
                  label="Clicks"
                  value={fmtInt(summary.clicks?.value)}
                  delta={
                    summary.clicks?.deltaPct !== null &&
                    summary.clicks?.deltaPct !== undefined
                      ? `${fmtPct(summary.clicks.deltaPct)} vs prev`
                      : undefined
                  }
                  deltaDirection={
                    (summary.clicks?.delta ?? 0) > 0
                      ? 'up'
                      : (summary.clicks?.delta ?? 0) < 0
                        ? 'down'
                        : 'flat'
                  }
                  tone={
                    (summary.clicks?.delta ?? 0) > 0
                      ? 'positive'
                      : (summary.clicks?.delta ?? 0) < 0
                        ? 'negative'
                        : 'neutral'
                  }
                />
                <Metric
                  label="Impressions"
                  value={fmtInt(summary.impressions?.value)}
                  delta={
                    summary.impressions?.deltaPct !==
                      null &&
                    summary.impressions?.deltaPct !==
                      undefined
                      ? `${fmtPct(summary.impressions.deltaPct)} vs prev`
                      : undefined
                  }
                  deltaDirection={
                    (summary.impressions?.delta ?? 0) > 0
                      ? 'up'
                      : (summary.impressions?.delta ?? 0) <
                          0
                        ? 'down'
                        : 'flat'
                  }
                  tone="neutral"
                />
                <Metric
                  label="CTR"
                  value={fmtCtr(summary.ctr?.value)}
                  delta={
                    summary.ctr?.deltaPp !== null &&
                    summary.ctr?.deltaPp !== undefined
                      ? `${fmtPp(summary.ctr.deltaPp)} vs prev`
                      : undefined
                  }
                  deltaDirection={
                    (summary.ctr?.deltaPp ?? 0) > 0
                      ? 'up'
                      : (summary.ctr?.deltaPp ?? 0) < 0
                        ? 'down'
                        : 'flat'
                  }
                  tone="neutral"
                />
                <Metric
                  label="Avg position"
                  value={fmtPos(
                    summary.avgPosition?.value,
                  )}
                  delta={
                    summary.avgPosition?.delta !==
                      null &&
                    summary.avgPosition?.delta !==
                      undefined
                      ? `${(summary.avgPosition.delta ?? 0) > 0 ? '+' : ''}${summary.avgPosition.delta} vs prev`
                      : undefined
                  }
                  deltaDirection={
                    (summary.avgPosition?.delta ?? 0) > 0
                      ? 'up'
                      : (summary.avgPosition?.delta ?? 0) <
                          0
                        ? 'down'
                        : 'flat'
                  }
                  detail="Lower is better · estimate"
                  tone="neutral"
                />
              </div>
              {baseline.visibility ? (
                <p className="rk-metadata mt-3">
                  {baseline.visibility.top3} top-3 ·{' '}
                  {baseline.visibility.top10} top-10 ·{' '}
                  {baseline.visibility.top20} top-20 ·{' '}
                  {baseline.visibility.top100} indexed
                  keywords
                </p>
              ) : null}
            </Panel>
          </section>

          {/* 2. AHA — dominant insight */}
          <section aria-label="Biggest insight">
            <Panel
              eyebrow={
                baseline.aha.kind === 'EMPTY'
                  ? 'Insight'
                  : 'Biggest opportunity'
              }
              title={baseline.aha.title}
              description={baseline.aha.body}
              actions={
                baseline.aha.kind === 'OPPORTUNITY' ? (
                  <Link
                    href="/keywords?tab=strategy"
                    className="rk-focusable rounded-rk-md bg-rk-ink px-4 py-2 text-xs font-bold text-white"
                  >
                    View opportunities
                  </Link>
                ) : undefined
              }
            >
              <div />
            </Panel>
          </section>

          {/* 3. WHAT TO DO — next moves */}
          <section aria-label="Next moves">
            <Panel
              eyebrow="Action plan"
              title="Your next 5 moves"
              description="Ordered by existing evidence. Purpose statements are strategic rationale, never ranking guarantees."
            >
              {baseline.nextMoves.length === 0 ? (
                <EmptyState
                  title="No moves yet"
                  description="Build strategy depth or create recommendations to generate an action plan."
                />
              ) : (
                <ol className="space-y-2">
                  {baseline.nextMoves.map((move: any) => (
                    <li
                      key={move.rank}
                      className="flex items-start gap-3 rounded-rk-sm border border-rk-border bg-white px-3 py-2"
                    >
                      <span className="rk-number mt-0.5 w-5 shrink-0 text-xs text-rk-muted">
                        {String(move.rank).padStart(
                          2,
                          '0',
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-rk-ink">
                          {move.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-rk-secondary">
                          {move.why}
                        </span>
                        <span className="mt-0.5 block text-xs text-rk-muted">
                          {move.purpose}
                          {(move.evidence ?? []).length >
                          0
                            ? ` · Evidence: ${(move.evidence ?? []).join(' + ')}`
                            : ''}
                        </span>
                      </span>
                      {move.cta?.href ? (
                        <Link
                          href={move.cta.href}
                          className="rk-focusable shrink-0 rounded-rk-md border border-rk-border px-3 py-2 text-xs font-bold text-rk-ink"
                        >
                          {move.cta.label ?? 'Open'}
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          </section>

          {/* 3b. SEARCH CAPTURE — zero-click + commercial (Phase 16) */}
          <section aria-label="Search capture">
            <SearchCapturePanel
              websiteId={websiteId}
              days={days}
            />
          </section>

          {/* 4. TREND — deep data chart */}
          <section aria-label="Clicks trend">
            <Panel
              eyebrow="Trend"
              title={`Organic clicks — ${baseline.period.days}-day trend`}
              description={`Daily clicks, current vs previous period. ${baseline.period.current.startDate} → ${baseline.period.current.endDate}.`}
            >
              <TrendChart
                state={
                  baseline.trend.available &&
                  trendPoints.length > 0
                    ? 'ready'
                    : 'empty'
                }
                points={trendPoints}
                currentLabel="Current"
                previousLabel="Previous"
                summary={`Daily organic clicks, ${baseline.period.days} days vs previous period`}
                formatValue={(v) =>
                  Math.round(v).toLocaleString('en-US')
                }
                emptyTitle="No trend data"
                emptyDescription="Daily Search Console data is unavailable for this window."
              />
            </Panel>
          </section>

          {/* 5. WHAT MATTERS — striking distance */}
          <section aria-label="Striking distance">
            <Panel
              eyebrow="Near-term"
              title="Striking distance"
              description="Keywords already visible (positions 4–20) where small page improvements can earn page-one impact. Ranked by existing priority, then impressions."
            >
              {baseline.striking.length === 0 ? (
                <EmptyState
                  title="No striking-distance keywords"
                  description="Nothing currently ranks 4–20 with meaningful impressions in this window."
                />
              ) : (
                <ul className="space-y-2">
                  {baseline.striking.map(
                    (row: any, i: number) => (
                      <li
                        key={`${row.keyword}-${i}`}
                        className="rounded-rk-sm border border-rk-border bg-white px-3 py-2"
                      >
                        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-rk-ink">
                          <span className="min-w-0 flex-1 truncate">
                            {row.keyword}
                          </span>
                          {row.priority ? (
                            <Chip
                              label={row.priority}
                              tone={priorityTone(
                                row.priority,
                              )}
                            />
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-xs tabular-nums text-rk-secondary">
                          Position{' '}
                          {row.position ?? '—'} ·{' '}
                          {fmtInt(row.impressions)}{' '}
                          impressions · CTR{' '}
                          {fmtCtr(row.ctr)}
                          {row.page
                            ? ` · ${compactUrl(row.page)}`
                            : ''}
                        </p>
                        {(row.why ?? []).length > 0 ? (
                          <p className="mt-0.5 line-clamp-2 text-xs text-rk-muted">
                            {(row.why ?? [])
                              .slice(0, 1)
                              .join(' ')}
                          </p>
                        ) : null}
                        <Link
                          href={`/why-not-number-one?websiteId=${encodeURIComponent(websiteId)}&keyword=${encodeURIComponent(row.keyword)}`}
                          className="rk-focusable mt-1 inline-block text-xs font-bold text-rk-ink underline"
                        >
                          Diagnose why
                        </Link>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </Panel>
          </section>

          {/* 6. WHAT CHANGED — winners & losers */}
          <section aria-label="Winners and losers">
            <div className="grid gap-4 md:grid-cols-2">
              <Panel
                eyebrow="Momentum"
                title="Winning"
                description={`Gained clicks vs previous ${baseline.period.days} days (minimum demand gate applied).`}
              >
                {baseline.winners.length === 0 ? (
                  <EmptyState
                    title="No clear winners"
                    description="No keyword gained enough clicks to clear the materiality gate this period."
                  />
                ) : (
                  <ul className="space-y-2">
                    {baseline.winners.map(
                      (row: any, i: number) => (
                        <li
                          key={`${row.query}-${i}`}
                          className="rounded-rk-sm border border-rk-border bg-white px-3 py-2"
                        >
                          <p className="truncate text-sm font-semibold text-rk-ink">
                            {row.query}
                          </p>
                          <p className="mt-0.5 text-xs tabular-nums text-rk-success">
                            +{row.clicksDelta} clicks
                            {row.positionDelta !==
                            null
                              ? ` · ${row.positionDelta > 0 ? '+' : ''}${row.positionDelta} positions`
                              : ''}{' '}
                            · now #{row.position ?? '—'}
                          </p>
                          {row.page ? (
                            <p className="truncate text-xs text-rk-muted">
                              {compactUrl(row.page)}
                            </p>
                          ) : null}
                        </li>
                      ),
                    )}
                  </ul>
                )}
              </Panel>
              <Panel
                eyebrow="Attention"
                title="Losing"
                description={`Lost clicks vs previous ${baseline.period.days} days. Candidates for refresh investigation.`}
              >
                {baseline.losers.length === 0 ? (
                  <EmptyState
                    title="No clear losers"
                    description="No keyword lost enough clicks to clear the materiality gate this period."
                  />
                ) : (
                  <ul className="space-y-2">
                    {baseline.losers.map(
                      (row: any, i: number) => (
                        <li
                          key={`${row.query}-${i}`}
                          className="rounded-rk-sm border border-rk-border bg-white px-3 py-2"
                        >
                          <p className="truncate text-sm font-semibold text-rk-ink">
                            {row.query}
                          </p>
                          <p className="mt-0.5 text-xs tabular-nums text-rk-danger">
                            {row.clicksDelta} clicks
                            {row.positionDelta !==
                            null
                              ? ` · ${row.positionDelta > 0 ? '+' : ''}${row.positionDelta} positions`
                              : ''}{' '}
                            · now #{row.position ?? '—'}
                          </p>
                          {row.page ? (
                            <p className="truncate text-xs text-rk-muted">
                              {compactUrl(row.page)}
                            </p>
                          ) : null}
                        </li>
                      ),
                    )}
                  </ul>
                )}
              </Panel>
            </div>
          </section>

          {/* 7. PAGES */}
          <section aria-label="Important pages">
            <Panel
              eyebrow="Pages"
              title="Pages that matter"
              description="Top pages by impressions with strategy mapping where a target page matches. Position is an impression-weighted estimate."
            >
              {baseline.pages.length === 0 ? (
                <EmptyState
                  title="No page data"
                  description="Page-level Search Console data is unavailable for this window."
                />
              ) : (
                <ul className="space-y-2">
                  {baseline.pages.map(
                    (page: any, i: number) => (
                      <li
                        key={`${page.url}-${i}`}
                        className="rounded-rk-sm border border-rk-border bg-white px-3 py-2"
                      >
                        <p className="break-all text-sm font-semibold text-rk-ink">
                          {compactUrl(page.url)}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs tabular-nums text-rk-secondary">
                          <span>
                            {fmtInt(page.clicks)} clicks
                            · {fmtInt(page.impressions)}{' '}
                            impr · CTR{' '}
                            {fmtCtr(page.ctr)} · #
                            {fmtPos(page.avgPosition)}
                          </span>
                          {page.mapping ? (
                            <Chip
                              label={page.mapping}
                              tone="neutral"
                            />
                          ) : null}
                          {page.priority ? (
                            <Chip
                              label={page.priority}
                              tone={priorityTone(
                                page.priority,
                              )}
                            />
                          ) : null}
                        </p>
                        {(page.topKeywords ?? [])
                          .length > 0 ? (
                          <p className="mt-0.5 line-clamp-1 text-xs text-rk-muted">
                            {(page.topKeywords ?? []).join(
                              ' · ',
                            )}
                          </p>
                        ) : null}
                      </li>
                    ),
                  )}
                </ul>
              )}
            </Panel>
          </section>

          {/* 8. OPPORTUNITIES */}
          <section aria-label="Biggest opportunities">
            <Panel
              eyebrow="Ranked by existing evidence"
              title="Biggest search opportunities"
              description="Composed from striking distance, refresh signals, link opportunities, consolidation and technical evidence. No new scores."
            >
              {baseline.opportunities.length === 0 ? (
                <EmptyState
                  title="No opportunities surfaced"
                  description="Connect Search Console and build strategy depth to surface opportunities."
                />
              ) : (
                <ol className="space-y-2">
                  {baseline.opportunities.map(
                    (opp: any) => (
                      <li
                        key={opp.rank}
                        className="flex items-start gap-3 rounded-rk-sm border border-rk-border bg-white px-3 py-2"
                      >
                        <span className="rk-number mt-0.5 w-5 shrink-0 text-xs text-rk-muted">
                          {opp.rank}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-rk-ink">
                            {opp.title}
                          </span>
                          <span className="mt-0.5 block text-xs text-rk-secondary">
                            {opp.detail}
                          </span>
                          {(opp.why ?? []).length > 0 ? (
                            <span className="mt-0.5 block text-xs text-rk-muted">
                              {(opp.why ?? [])
                                .slice(0, 1)
                                .join(' ')}
                            </span>
                          ) : null}
                          {(opp.evidence ?? []).length >
                          0 ? (
                            <span className="mt-0.5 block text-xs text-rk-muted">
                              Evidence:{' '}
                              {(opp.evidence ?? []).join(
                                ' + ',
                              )}
                            </span>
                          ) : null}
                        </span>
                        {opp.action?.href ? (
                          <Link
                            href={opp.action.href}
                            className="rk-focusable shrink-0 rounded-rk-md border border-rk-border px-3 py-2 text-xs font-bold text-rk-ink"
                          >
                            {opp.action.label ?? 'Open'}
                          </Link>
                        ) : null}
                      </li>
                    ),
                  )}
                </ol>
              )}
            </Panel>
          </section>

          {/* 9. HEALTH */}
          <section aria-label="Search health">
            <Panel
              eyebrow="Health"
              title="Google Search health"
              description="Five signals, each linking to its detailed surface. Unavailable means unmeasured — never zero."
            >
              <ul className="grid gap-2 md:grid-cols-2">
                {baseline.health.map((h: any) => (
                  <li
                    key={h.key}
                    className="rounded-rk-sm border border-rk-border bg-white px-3 py-2"
                  >
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-rk-ink">
                      <span className="flex-1">
                        {h.label}
                      </span>
                      <Chip
                        label={h.state}
                        tone={healthTone(h.state)}
                      />
                    </p>
                    <p className="mt-0.5 text-xs text-rk-secondary">
                      {h.detail}
                    </p>
                    {h.href ? (
                      <Link
                        href={h.href}
                        className="rk-focusable mt-1 inline-block text-xs font-bold text-rk-ink underline"
                      >
                        Open details
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
              {Object.keys(baseline.unavailable ?? {})
                .length > 0 ? (
                <p className="rk-metadata mt-3">
                  Honestly unavailable:{' '}
                  {Object.entries(
                    baseline.unavailable ?? {},
                  )
                    .map(
                      ([k, v]) => `${k} — ${v}`,
                    )
                    .join(' · ')}
                </p>
              ) : null}
            </Panel>
          </section>
        </div>
      ) : (
        <div className="mt-4">
          <EmptyState
            title="Baseline unavailable"
            description="Search data could not be composed for this website and period."
          />
        </div>
      )}
    </AppShell>
  );
}

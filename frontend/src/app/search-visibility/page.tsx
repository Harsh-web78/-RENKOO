'use client';

/*
 * RENKOO V2 — Search Visibility Command Center (Phase 5A).
 * Real Google Search Console data only: connection status,
 * property selection, performance signals, query/page
 * intelligence, and GSC opportunities with analysis.
 * Unavailable states stay explicit; nothing is fabricated.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  getGoogleAnalytics,
  getGoogleConnectionStatus,
  getGoogleOpportunities,
  getGooglePages,
  getGoogleProperties,
  getGoogleQueries,
  selectGoogleProperty,
  analyzeGoogleOpportunity,
  type GoogleQueryRow,
  type GooglePageRow,
  type GoogleOpportunityRow,
  type GoogleProperty,
} from '@/lib/api';
import AppShell from '@/components/AppShell';
import {
  PageHeader,
  Panel,
  Metric,
  DataTable,
  FilterBar,
  Drawer,
  DrawerSection,
  DrawerMeta,
  PrimaryButton,
  SecondaryButton,
  DataSourceBadge,
  FreshnessBadge,
  PriorityChip,
  ScoreBadge,
  LoadingBlock,
  ErrorState,
  EmptyState,
  NotConnectedState,
  InsightBlock,
  ChangeIndicator,
  RecommendationCallout,
  NextAction,
  type DataTableColumn,
} from '@/components/ui';
import {
  TrendChart,
  BarList,
  type TrendPoint,
} from '@/components/charts';
import { usePersona } from '@/lib/persona';

type Tab = 'queries' | 'pages' | 'opportunities';

const PERIODS = [
  { value: '7', label: 'Last 7 days' },
  { value: '28', label: 'Last 28 days' },
  { value: '90', label: 'Last 90 days' },
];

function rangeFor(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fmtInt(value: unknown) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US');
}

function fmtCtr(value: unknown) {
  const n = num(value);
  return `${(n <= 1 && n > 0 ? n * 100 : n).toFixed(1)}%`;
}

function fmtPos(value: unknown) {
  const n = num(value);
  if (!Number.isFinite(n) || n === 0) return '—';
  return n.toFixed(1);
}

export default function SearchVisibilityPage() {
  const [navOpen, setNavOpen] = useState(false);
  const { effectivePersona } = usePersona();
  const [period, setPeriod] = useState('28');
  const [tab, setTab] = useState<Tab>('queries');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState<boolean | null>(null);
  const [properties, setProperties] = useState<GoogleProperty[]>([]);
  const [property, setProperty] = useState('');
  const [hasSelection, setHasSelection] = useState(false);
  const [draftProperty, setDraftProperty] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [analytics, setAnalytics] = useState<any>(null);
  const [queries, setQueries] = useState<GoogleQueryRow[]>([]);
  const [pages, setPages] = useState<GooglePageRow[]>([]);
  const [opportunities, setOpportunities] = useState<
    GoogleOpportunityRow[]
  >([]);
  const [drawerQuery, setDrawerQuery] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [oppAnalysis, setOppAnalysis] = useState<
    Record<string, { loading: boolean; data: any; error: string }>
  >({});

  const { startDate, endDate } = useMemo(
    () => rangeFor(num(period, 28)),
    [period],
  );

  const load = useCallback(async () => {
    try {
      setError('');
      /*
       * Status gates the data calls below, but the
       * property list is independent of it — fetch
       * both at once instead of in sequence.
       */
      const [status, props] = await Promise.all([
        getGoogleConnectionStatus(),
        getGoogleProperties().catch(() => []),
      ]);
      const isConnected = Boolean(
        (status as any)?.connected,
      );
      setConnected(isConnected);
      if (!isConnected) {
        setLoading(false);
        return;
      }
      const list = Array.isArray(props) ? props : [];
      setProperties(list);
      const selected =
        (status as any)?.selectedProperty ||
        (status as any)?.property ||
        '';
      const persisted =
        selected &&
        list.some(
          (p: any) => (p.siteUrl || p.url) === selected,
        )
          ? selected
          : '';
      setHasSelection(Boolean(persisted));
      if (!persisted) {
        setProperty('');
        setDraftProperty(
          (list[0] as any)?.siteUrl ||
            (list[0] as any)?.url ||
            '',
        );
        setLoading(false);
        return;
      }
      const active = persisted;
      setProperty(active || '');
      const [a, q, pg, o] = await Promise.all([
        getGoogleAnalytics(startDate, endDate),
        getGoogleQueries(startDate, endDate),
        getGooglePages(startDate, endDate),
        getGoogleOpportunities(startDate, endDate).catch(
          () => null,
        ),
      ]);
      setAnalytics(a);
      setQueries(
        Array.isArray((q as any)?.rows)
          ? (q as any).rows
          : [],
      );
      setPages(
        Array.isArray((pg as any)?.rows)
          ? (pg as any).rows
          : [],
      );
      setOpportunities(
        Array.isArray((o as any)?.opportunities)
          ? (o as any).opportunities
          : [],
      );
    } catch (err: any) {
      setError(
        err?.message || 'Failed to load Search Console data.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
  }

  async function handleSelectProperty(siteUrl: string) {
    if (!siteUrl || selecting) return;
    try {
      setSelecting(true);
      await selectGoogleProperty(siteUrl);
      setProperty(siteUrl);
      setHasSelection(true);
      setLoading(true);
      await load();
    } catch (err: any) {
      setError(
        err?.message || 'Failed to select property.',
      );
    } finally {
      setSelecting(false);
    }
  }

  async function openQueryDrawer(row: any) {
    setDrawerQuery(row);
    setAnalysis(null);
    setAnalysisError('');
    setAnalysisLoading(true);
    try {
      const result = await analyzeGoogleOpportunity(
        startDate,
        endDate,
        String(row.query || row.keys?.[0] || ''),
        row.page ? String(row.page) : undefined,
      );
      setAnalysis(result);
    } catch (err: any) {
      setAnalysisError(
        err?.message || 'Analysis unavailable.',
      );
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function toggleOppAnalysis(opp: any) {
    const key =
      String(opp.query || '') + '::' + String(opp.page || '');
    const existing = oppAnalysis[key];
    if (existing?.loading) return;
    if (existing?.data) {
      setOppAnalysis((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    setOppAnalysis((prev) => ({
      ...prev,
      [key]: { loading: true, data: null, error: '' },
    }));
    try {
      const result = await analyzeGoogleOpportunity(
        startDate,
        endDate,
        String(opp.query || ''),
        opp.page ? String(opp.page) : undefined,
      );
      setOppAnalysis((prev) => ({
        ...prev,
        [key]: { loading: false, data: result, error: '' },
      }));
    } catch (err: any) {
      setOppAnalysis((prev) => ({
        ...prev,
        [key]: {
          loading: false,
          data: null,
          error: err?.message || 'Analysis unavailable.',
        },
      }));
    }
  }

  const trendPoints: TrendPoint[] = useMemo(() => {
    const rows = Array.isArray((analytics as any)?.rows)
      ? (analytics as any).rows
      : [];
    return rows
      .map((r: any) => ({
        x: String(
          r.date || r.day || r.keys?.[0] || r.key || '',
        ),
        y: num(
          r.clicks ?? r.value ?? 0,
        ),
        previous:
          r.previousClicks !== undefined &&
          r.previousClicks !== null
            ? num(r.previousClicks)
            : undefined,
      }))
      .filter((p: TrendPoint) => p.x);
  }, [analytics]);

  const filteredQueries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return queries;
    return queries.filter((row: any) =>
      String(row.query || row.keys?.[0] || '')
        .toLowerCase()
        .includes(q),
    );
  }, [queries, search]);

  const filteredPages = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter((row: any) =>
      String(row.page || row.keys?.[0] || row.url || '')
        .toLowerCase()
        .includes(q),
    );
  }, [pages, search]);

  const rising = useMemo(
    () =>
      (queries as any[])
        .filter(
          (r) =>
            r.clicksChange !== undefined &&
            num(r.clicksChange) > 0,
        )
        .sort(
          (a, b) =>
            num(b.clicksChange) - num(a.clicksChange),
        )
        .slice(0, 5),
    [queries],
  );
  const declining = useMemo(
    () =>
      (queries as any[])
        .filter(
          (r) =>
            r.clicksChange !== undefined &&
            num(r.clicksChange) < 0,
        )
        .sort(
          (a, b) =>
            num(a.clicksChange) - num(b.clicksChange),
        )
        .slice(0, 5),
    [queries],
  );
  const lowCtr = useMemo(
    () =>
      (queries as any[])
        .filter(
          (r) =>
            num(r.impressions) >= 500 &&
            num(r.ctr) < 0.03 &&
            num(r.position) <= 20,
        )
        .sort(
          (a, b) =>
            num(b.impressions) - num(a.impressions),
        )
        .slice(0, 5),
    [queries],
  );

  const queryColumns: DataTableColumn<any>[] = [
    {
      key: 'query',
      label: 'Query',
      priority: 'high',
      sortable: true,
      sortValue: (r) => String(r.query || r.keys?.[0] || ''),
      render: (r) => (
        <span className="font-semibold text-rk-ink">
          {String(r.query || r.keys?.[0] || '—')}
        </span>
      ),
    },
    {
      key: 'clicks',
      label: 'Clicks',
      align: 'right',
      priority: 'high',
      sortable: true,
      sortValue: (r) => num(r.clicks),
      render: (r) => (
        <span className="rk-number">{fmtInt(r.clicks)}</span>
      ),
    },
    {
      key: 'impressions',
      label: 'Impressions',
      align: 'right',
      priority: 'medium',
      sortable: true,
      sortValue: (r) => num(r.impressions),
      render: (r) => (
        <span className="rk-number">
          {fmtInt(r.impressions)}
        </span>
      ),
    },
    {
      key: 'ctr',
      label: 'CTR',
      align: 'right',
      priority: 'medium',
      sortable: true,
      sortValue: (r) => num(r.ctr),
      render: (r) => (
        <span className="rk-number">{fmtCtr(r.ctr)}</span>
      ),
    },
    {
      key: 'position',
      label: 'Position',
      align: 'right',
      priority: 'high',
      sortable: true,
      sortValue: (r) => num(r.position),
      render: (r) => (
        <span className="rk-number">
          {fmtPos(r.position)}
        </span>
      ),
    },
    ...(queries.some(
      (r: any) => r.clicksChange !== undefined,
    )
      ? [
          {
            key: 'change',
            label: 'Change',
            align: 'right' as const,
            priority: 'low' as const,
            sortable: true,
            sortValue: (r: any) =>
              num(r.clicksChange),
            render: (r: any) => (
              <ChangeIndicator
                value={`${num(r.clicksChange) > 0 ? '+' : ''}${fmtInt(r.clicksChange)}`}
                direction={
                  num(r.clicksChange) > 0
                    ? 'up'
                    : num(r.clicksChange) < 0
                      ? 'down'
                      : 'flat'
                }
              />
            ),
          },
        ]
      : []),
  ];

  const pageColumns: DataTableColumn<any>[] = [
    {
      key: 'page',
      label: 'Page',
      priority: 'high',
      render: (r) => (
        <span
          className="block max-w-[320px] truncate font-medium text-rk-ink"
          title={String(
            r.page || r.keys?.[0] || r.url || '—',
          )}
        >
          {String(
            r.page || r.keys?.[0] || r.url || '—',
          )}
        </span>
      ),
    },
    {
      key: 'clicks',
      label: 'Clicks',
      align: 'right',
      priority: 'high',
      sortable: true,
      sortValue: (r) => num(r.clicks),
      render: (r) => (
        <span className="rk-number">{fmtInt(r.clicks)}</span>
      ),
    },
    {
      key: 'impressions',
      label: 'Impressions',
      align: 'right',
      priority: 'medium',
      sortable: true,
      sortValue: (r) => num(r.impressions),
      render: (r) => (
        <span className="rk-number">
          {fmtInt(r.impressions)}
        </span>
      ),
    },
    {
      key: 'ctr',
      label: 'CTR',
      align: 'right',
      priority: 'medium',
      sortable: true,
      sortValue: (r) => num(r.ctr),
      render: (r) => (
        <span className="rk-number">{fmtCtr(r.ctr)}</span>
      ),
    },
    {
      key: 'position',
      label: 'Position',
      align: 'right',
      priority: 'high',
      sortable: true,
      sortValue: (r) => num(r.position),
      render: (r) => (
        <span className="rk-number">
          {fmtPos(r.position)}
        </span>
      ),
    },
  ];

  const showSeoDetail =
    effectivePersona === 'SEO_SPECIALIST' ||
    effectivePersona === 'ADMIN';

  return (
    <AppShell
      mobileOpen={navOpen}
      onClose={() => setNavOpen(false)}
      onMenu={() => setNavOpen(true)}
    >
      <PageHeader
        eyebrow="Visibility"
        title="Search Visibility"
        description="Measured Google Search Console performance — what is happening, what changed, and what to do next."
        actions={
          <div className="flex gap-2">
            <SecondaryButton
              onClick={() => void handleRefresh()}
              disabled={refreshing || loading}
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </SecondaryButton>
            <Link href="/opportunities">
              <PrimaryButton type="button">
                Opportunity Engine
              </PrimaryButton>
            </Link>
          </div>
        }
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <DataSourceBadge
              source="Google Search Console"
              connected={connected === true}
            />
            {!loading && (
              <FreshnessBadge
                label={`${startDate} → ${endDate}`}
              />
            )}
          </div>
        }
      />

      {loading ? (
        <div className="mt-6">
          <LoadingBlock title="Loading Search Console data" />
        </div>
      ) : error && connected !== true ? (
        <div className="mt-6">
          <ErrorState
            title="Search data failed to load"
            description={error}
            onRetry={() => {
              setLoading(true);
              void load();
            }}
          />
        </div>
      ) : connected === false ? (
        <div className="mt-6">
          <NotConnectedState
            title="Google Search Console is not connected"
            description="Connect Search Console in Integrations to see measured clicks, impressions, queries and opportunities here. RENKOO will not claim search data until the connection exists."
            connectLabel="Open integrations"
            connectHref="/integrations"
          />
        </div>
      ) : properties.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No Search Console property found"
            description="No verified property is available on the connected Google account. Verify a property in Search Console, then refresh."
            actionLabel="Refresh"
            onAction={() => {
              setLoading(true);
              void load();
            }}
          />
        </div>
      ) : !hasSelection ? (
        <div className="mt-6">
          <Panel
            eyebrow="Action required"
            title="Google Search Console is connected, but no property is selected"
            description="Select your Search Console property to start importing data. This is not a subscription issue — RENKOO only fetches real data for the property you choose."
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                aria-label="Search Console property"
                value={draftProperty}
                onChange={(event) =>
                  setDraftProperty(event.target.value)
                }
                className="rk-focusable min-w-0 flex-1 rounded-rk-md border border-rk-border bg-rk-surface px-3 py-2 text-sm"
              >
                {properties.map((p: any) => {
                  const value =
                    p.siteUrl || p.url || '';
                  return (
                    <option
                      key={value || p.permission}
                      value={value}
                    >
                      {value}
                    </option>
                  );
                })}
              </select>

              <button
                type="button"
                disabled={
                  selecting || !draftProperty
                }
                onClick={() =>
                  void handleSelectProperty(
                    draftProperty,
                  )
                }
                className="rk-focusable shrink-0 rounded-rk-md bg-rk-ink px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {selecting
                  ? 'Selecting…'
                  : 'Select property'}
              </button>
            </div>
          </Panel>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <Panel
            eyebrow="Context"
            title="Property & period"
            description="All signals below are measured from the selected property and period."
          >
            <FilterBar
              selects={[
                {
                  key: 'property',
                  label: 'Property',
                  value: property,
                  options: properties.map((p: any) => ({
                    value: String(p.siteUrl || p.url),
                    label: String(p.siteUrl || p.url),
                  })),
                  onChange: (v) =>
                    void handleSelectProperty(v),
                },
                {
                  key: 'period',
                  label: 'Period',
                  value: period,
                  options: PERIODS,
                  onChange: setPeriod,
                },
                {
                  key: 'view',
                  label: 'View',
                  value: tab,
                  options: [
                    { value: 'queries', label: 'Queries' },
                    { value: 'pages', label: 'Pages' },
                    {
                      value: 'opportunities',
                      label: 'Opportunities',
                    },
                  ],
                  onChange: (v) => setTab(v as Tab),
                },
              ]}
              searchValue={search}
              searchPlaceholder="Search queries or pages…"
              onSearchChange={setSearch}
              meta={
                selecting ? (
                  <span className="text-xs text-rk-muted">
                    Switching property…
                  </span>
                ) : undefined
              }
            />
          </Panel>

          {error ? (
            <ErrorState
              title="Partial load failure"
              description={error}
              onRetry={() => {
                setLoading(true);
                void load();
              }}
            />
          ) : null}

          <section aria-label="Key signals">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric
                label="Clicks"
                value={
                  analytics == null
                    ? '—'
                    : fmtInt(
                        (analytics as any)?.clicks,
                      )
                }
                detail={`Measured ${period}-day total`}
              />
              <Metric
                label="Impressions"
                value={
                  analytics == null
                    ? '—'
                    : fmtInt(
                        (analytics as any)?.impressions,
                      )
                }
                detail="Search exposure"
              />
              <Metric
                label="CTR"
                value={
                  analytics == null
                    ? '—'
                    : fmtCtr((analytics as any)?.ctr)
                }
                detail="Clicks ÷ impressions"
              />
              <Metric
                label="Avg. position"
                value={
                  analytics == null
                    ? '—'
                    : fmtPos(
                        (analytics as any)
                          ?.averagePosition,
                      )
                }
                detail="Lower is better"
              />
            </div>
          </section>

          <Panel
            eyebrow="Primary visual"
            title="Search performance trend"
            description="Measured clicks across the selected period."
          >
            <TrendChart
              state={
                trendPoints.length > 0 ? 'ready' : 'empty'
              }
              points={trendPoints}
              summary={`Daily measured clicks from ${startDate} to ${endDate}.`}
              formatValue={(v) => fmtInt(v)}
              emptyTitle="No daily trend available"
              emptyDescription="The performance summary has totals but no daily rows for this period. Query and page tables below use the same measured data."
            />
          </Panel>

          {(rising.length > 0 ||
            declining.length > 0 ||
            lowCtr.length > 0) && (
            <section
              aria-label="What changed"
              className="grid gap-3 lg:grid-cols-3"
            >
              {rising.length > 0 && (
                <InsightBlock
                  eyebrow="What changed"
                  title="Rising queries"
                >
                  <ul className="mt-2 space-y-1.5">
                    {rising.map((r: any, i: number) => (
                      <li
                        key={i}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="truncate font-medium text-rk-ink">
                          {String(
                            r.query || r.keys?.[0] || '—',
                          )}
                        </span>
                        <ChangeIndicator
                          value={`+${fmtInt(r.clicksChange)}`}
                          direction="up"
                        />
                      </li>
                    ))}
                  </ul>
                </InsightBlock>
              )}
              {declining.length > 0 && (
                <InsightBlock
                  eyebrow="What changed"
                  title="Declining queries"
                >
                  <ul className="mt-2 space-y-1.5">
                    {declining.map((r: any, i: number) => (
                      <li
                        key={i}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="truncate font-medium text-rk-ink">
                          {String(
                            r.query || r.keys?.[0] || '—',
                          )}
                        </span>
                        <ChangeIndicator
                          value={fmtInt(r.clicksChange)}
                          direction="down"
                        />
                      </li>
                    ))}
                  </ul>
                </InsightBlock>
              )}
              {lowCtr.length > 0 && (
                <InsightBlock
                  eyebrow="What matters"
                  title="High exposure, low CTR"
                >
                  <ul className="mt-2 space-y-1.5">
                    {lowCtr.map((r: any, i: number) => (
                      <li
                        key={i}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="truncate font-medium text-rk-ink">
                          {String(
                            r.query || r.keys?.[0] || '—',
                          )}
                        </span>
                        <span className="rk-number text-xs text-rk-secondary">
                          {fmtInt(r.impressions)} impr ·{' '}
                          {fmtCtr(r.ctr)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </InsightBlock>
              )}
            </section>
          )}

          {tab === 'queries' && (
            <Panel
              eyebrow="Query intelligence"
              title="Queries"
              description="Open a query for measured evidence and recommended next step."
            >
              <DataTable
                caption="Search queries with measured performance"
                columns={queryColumns}
                rows={filteredQueries}
                keyOf={(r: any, i: number) =>
                  String(r.query || r.keys?.[0] || i)
                }
                onRowClick={(r) => void openQueryDrawer(r)}
                emptyTitle="No queries in this period"
                emptyDescription="No measured queries match the current filters."
                pageSize={15}
              />
            </Panel>
          )}

          {tab === 'pages' && (
            <Panel
              eyebrow="Page intelligence"
              title="Pages"
              description="Which measured pages earn the exposure."
            >
              <DataTable
                caption="Pages with measured search performance"
                columns={pageColumns}
                rows={filteredPages}
                keyOf={(r: any, i: number) =>
                  String(
                    r.page || r.keys?.[0] || r.url || i,
                  )
                }
                emptyTitle="No pages in this period"
                emptyDescription="No measured pages match the current filters."
                pageSize={15}
              />
            </Panel>
          )}

          {tab === 'opportunities' && (
            <Panel
              eyebrow="Opportunities"
              title="Search opportunities"
              description="Measured gaps worth acting on. Tracked execution lives in the Opportunity Engine."
              actions={
                <Link href="/opportunities">
                  <SecondaryButton type="button">
                    View opportunity
                  </SecondaryButton>
                </Link>
              }
            >
              {opportunities.length === 0 ? (
                <EmptyState
                  title="No search opportunities detected"
                  description="No measured opportunity patterns (e.g. high-impression low-CTR, position 5–20) were found in this period."
                />
              ) : (
                <ul className="divide-y divide-rk-border">
                  {opportunities.map((opp: any, i: number) => {
                    const key =
                      String(opp.query || '') +
                      '::' +
                      String(opp.page || '');
                    const st = oppAnalysis[key];
                    return (
                      <li key={key + i} className="py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-rk-ink">
                            {String(
                              opp.query || opp.title || '—',
                            )}
                          </span>
                          {opp.priority ? (
                            <PriorityChip
                              priority={String(opp.priority)}
                            />
                          ) : null}
                          {opp.score !== undefined &&
                          opp.score !== null ? (
                            <ScoreBadge
                              score={num(opp.score)}
                            />
                          ) : null}
                        </div>
                        {opp.description ? (
                          <p className="rk-body mt-1">
                            {String(opp.description)}
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <SecondaryButton
                            type="button"
                            onClick={() =>
                              void toggleOppAnalysis(opp)
                            }
                          >
                            {st?.loading
                              ? 'Analyzing…'
                              : st?.data
                                ? 'Hide evidence'
                                : 'Open evidence'}
                          </SecondaryButton>
                          <Link href="/opportunities">
                            <SecondaryButton type="button">
                              View opportunity
                            </SecondaryButton>
                          </Link>
                        </div>
                        {st?.error ? (
                          <p className="mt-2 text-sm text-rk-danger">
                            {st.error}
                          </p>
                        ) : null}
                        {st?.data ? (
                          <div className="mt-3">
                            <RecommendationCallout
                              title="Recommended next step"
                              text={String(
                                (st.data as any)
                                  ?.summary ||
                                  (st.data as any)
                                    ?.recommendations?.[0]
                                    ?.text ||
                                  (st.data as any)
                                    ?.recommendations?.[0] ||
                                  'Review the evidence and decide the next step.',
                              )}
                              actionLabel="Open Opportunity Engine"
                              actionHref="/opportunities"
                            />
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          )}

          <RecommendationCallout
            title="What should I do?"
            text={
              declining.length > 0
                ? `${declining.length} measured declining quer${declining.length === 1 ? 'y needs' : 'ies need'} attention first — open the query for evidence, then track the fix in the Opportunity Engine.`
                : lowCtr.length > 0
                  ? 'High-impression, low-CTR queries are the cheapest wins: titles and snippets first, measured by the next crawl period.'
                  : 'Performance looks stable for this period. Keep monitoring; new movement will appear here once measured.'
            }
            actionLabel="Open Opportunity Engine"
            actionHref="/opportunities"
          />

          <NextAction
            label="See what changed after action"
            detail="Re-crawl and reconnect: monitoring measures crawl-over-crawl movement."
            href="/monitoring"
          />
        </div>
      )}

      <Drawer
        open={drawerQuery !== null}
        onClose={() => setDrawerQuery(null)}
        eyebrow="Query evidence"
        title={String(
          drawerQuery?.query ||
            drawerQuery?.keys?.[0] ||
            'Query',
        )}
        description="Measured Search Console evidence and the recommended next step."
        state={
          analysisLoading
            ? 'loading'
            : analysisError && !analysis
              ? 'error'
              : 'ready'
        }
        errorDescription={analysisError}
        onRetry={() =>
          drawerQuery && void openQueryDrawer(drawerQuery)
        }
      >
        {drawerQuery && (
          <>
            <DrawerMeta
              items={[
                {
                  label: 'Clicks',
                  value: fmtInt(drawerQuery.clicks),
                },
                {
                  label: 'Impressions',
                  value: fmtInt(drawerQuery.impressions),
                },
                {
                  label: 'CTR',
                  value: fmtCtr(drawerQuery.ctr),
                },
                {
                  label: 'Position',
                  value: fmtPos(drawerQuery.position),
                },
                ...(showSeoDetail && drawerQuery.page
                  ? [
                      {
                        label: 'Page',
                        value: String(drawerQuery.page),
                      },
                    ]
                  : []),
              ]}
            />
            <DrawerSection title="Why this matters">
              <p className="rk-body">
                {num(drawerQuery.impressions) >= 500 &&
                num(drawerQuery.ctr) < 0.03
                  ? 'High exposure with low CTR: the result is seen but not chosen. Titles, meta descriptions and intent match are the usual levers.'
                  : num(drawerQuery.position) > 3 &&
                      num(drawerQuery.position) <= 20
                    ? 'Ranking on page one or two without top placement: small relevance and authority gains can move this measurably.'
                    : 'Measured performance for this query in the selected period.'}
              </p>
            </DrawerSection>
            <DrawerSection title="Recommended next step">
              {analysisLoading ? (
                <LoadingBlock title="Analyzing opportunity" />
              ) : analysis ? (
                <div className="space-y-2">
                  {Array.isArray(
                    (analysis as any)?.recommendations,
                  ) &&
                  (analysis as any).recommendations.length >
                    0 ? (
                    (analysis as any).recommendations
                      .slice(0, 5)
                      .map((rec: any, i: number) => (
                        <p
                          key={i}
                          className="rk-body"
                        >
                          {String(
                            rec?.text || rec || '',
                          )}
                        </p>
                      ))
                  ) : (
                    <p className="rk-body">
                      {String(
                        (analysis as any)?.summary ||
                          'No specific recommendation returned. Track this query in the Opportunity Engine.',
                      )}
                    </p>
                  )}
                  {(analysis as any)?.priority ? (
                    <p className="mt-2">
                      <PriorityChip
                        priority={String(
                          (analysis as any).priority,
                        )}
                      />
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="rk-body">
                  {analysisError ||
                    'Analysis is unavailable for this query right now.'}
                </p>
              )}
            </DrawerSection>
            <DrawerSection title="Outcome">
              <NextAction
                label="Track in Opportunity Engine"
                detail="Persisted opportunities carry evidence into execution."
                href="/opportunities"
              />
            </DrawerSection>
          </>
        )}
      </Drawer>
    </AppShell>
  );
}

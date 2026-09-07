'use client';

/*
 * RENKOO V2 — Keyword Intelligence workspace (Phase 5C).
 * Measured GSC query data only. Intent is a transparent
 * client-side estimate (labeled as such); opportunity flags
 * are deterministic rules over measured values. No SERP data
 * is claimed. Detail opens in a Drawer.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  analyzeGoogleOpportunity,
  getGoogleConnectionStatus,
  getGoogleQueries,
  getWebsites,
  type GoogleQueryRow,
  type Website,
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

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fmtInt(value: unknown) {
  return num(value).toLocaleString('en-US');
}

function rangeFor(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

/* Transparent client-side estimate — labeled in the UI. */
function estimateIntent(query: string): string {
  const q = query.toLowerCase();
  if (
    /\b(buy|price|pricing|cheap|discount|order|hire|quote|cost)\b/.test(
      q,
    )
  )
    return 'Transactional';
  if (
    /\b(how|what|why|guide|tutorial|tips|best|vs|compare|review)\b/.test(
      q,
    )
  )
    return 'Informational';
  if (/\b(near me|nearby|open now|directions|location)\b/.test(q))
    return 'Local';
  if (
    /\b(job|career|login|sign in|download|contact)\b/.test(q)
  )
    return 'Navigational';
  return 'Mixed';
}

/* Deterministic rule over measured values — labeled as rule-based. */
function ruleOpportunity(row: any): {
  label: string;
  priority: string;
} | null {
  const pos = num(row.position);
  const impr = num(row.impressions);
  const ctr = num(row.ctr);
  if (pos >= 4 && pos <= 20 && impr >= 500)
    return { label: 'Striking distance', priority: 'HIGH' };
  if (impr >= 1000 && ctr < 0.03 && pos <= 20)
    return { label: 'CTR gap', priority: 'MEDIUM' };
  if (pos > 20 && impr >= 300)
    return { label: 'Visibility gap', priority: 'MEDIUM' };
  if (pos >= 1 && pos <= 3 && impr >= 200)
    return { label: 'Defend position', priority: 'LOW' };
  return null;
}

export default function KeywordsPage() {
  const [navOpen, setNavOpen] = useState(false);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [period, setPeriod] = useState('28');
  const [search, setSearch] = useState('');
  const [intentFilter, setIntentFilter] = useState('ALL');
  const [positionFilter, setPositionFilter] = useState('ALL');
  const [oppFilter, setOppFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState<boolean | null>(
    null,
  );
  const [rows, setRows] = useState<GoogleQueryRow[]>([]);
  const [drawerRow, setDrawerRow] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState('');

  const { startDate, endDate } = useMemo(
    () => rangeFor(num(period, 28)),
    [period],
  );

  const load = useCallback(async () => {
    try {
      setError('');
      let queriesError: unknown = null;
      /*
       * Status gates rendering below, but the query
       * rows are independent of it — fetch both at
       * once instead of in sequence. Rows fetched
       * while unconnected are discarded, never shown.
       */
      const [status, res] = await Promise.all([
        getGoogleConnectionStatus(),
        getGoogleQueries(
          startDate,
          endDate,
        ).catch((err) => {
          queriesError = err;
          return null;
        }),
      ]);
      const isConnected = Boolean(
        (status as any)?.connected,
      );
      setConnected(isConnected);
      if (!isConnected) return;
      if (!res) throw queriesError;
      setRows(
        Array.isArray((res as any)?.rows)
          ? (res as any).rows
          : [],
      );
    } catch (err: any) {
      setError(
        err?.message || 'Failed to load keyword data.',
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
          stored && list.some((site) => site.id === stored)
            ? stored
            : list[0]?.id || '';
        setWebsiteId(valid);
      })
      .catch(() => {
        if (!cancelled) setWebsites([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleWebsiteChange(id: string) {
    setWebsiteId(id);
    if (typeof window !== 'undefined') {
      if (id) localStorage.setItem('renkoo_website_id', id);
      else localStorage.removeItem('renkoo_website_id');
    }
  }

  const activeWebsite =
    websites.find((site) => site.id === websiteId) || null;

  async function openDrawer(row: any) {
    setDrawerRow(row);
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
        err?.message || 'Recommendation unavailable.',
      );
    } finally {
      setAnalysisLoading(false);
    }
  }

  const enriched = useMemo(
    () =>
      rows.map((r: any) => {
        const query = String(r.query || r.keys?.[0] || '');
        return {
          ...r,
          _query: query,
          _intent: estimateIntent(query),
          _opp: ruleOpportunity(r),
        };
      }),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((r) => {
      if (q && !r._query.toLowerCase().includes(q))
        return false;
      if (
        intentFilter !== 'ALL' &&
        r._intent.toUpperCase() !== intentFilter
      )
        return false;
      const pos = num(r.position);
      if (positionFilter === 'TOP3' && pos > 3)
        return false;
      if (
        positionFilter === 'STRIKING' &&
        (pos < 4 || pos > 20)
      )
        return false;
      if (positionFilter === 'BEYOND' && pos <= 20)
        return false;
      if (oppFilter === 'WITH_OPP' && !r._opp)
        return false;
      if (oppFilter === 'HIGH' && r._opp?.priority !== 'HIGH')
        return false;
      return true;
    });
  }, [enriched, search, intentFilter, positionFilter, oppFilter]);

  const stats = useMemo(() => {
    const pos = enriched
      .map((r) => num(r.position))
      .filter((p) => p > 0);
    const avg = pos.length
      ? pos.reduce((a, b) => a + b, 0) / pos.length
      : 0;
    return {
      total: enriched.length,
      avg: pos.length ? avg.toFixed(1) : '—',
      top3: enriched.filter((r) => num(r.position) <= 3)
        .length,
      opps: enriched.filter((r) => r._opp).length,
    };
  }, [enriched]);

  const hasChange = enriched.some(
    (r) => (r as any).clicksChange !== undefined,
  );

  const columns: DataTableColumn<any>[] = [
    {
      key: 'keyword',
      label: 'Keyword',
      priority: 'high',
      sortable: true,
      sortValue: (r) => r._query,
      render: (r) => (
        <span className="font-semibold text-rk-ink">
          {r._query || '—'}
        </span>
      ),
    },
    {
      key: 'intent',
      label: 'Intent (estimate)',
      priority: 'medium',
      render: (r) => (
        <span className="text-rk-secondary">
          {r._intent}
        </span>
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
          {num(r.position) > 0
            ? num(r.position).toFixed(1)
            : '—'}
        </span>
      ),
    },
    ...(hasChange
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
    {
      key: 'clicks',
      label: 'Clicks',
      align: 'right',
      priority: 'medium',
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
      priority: 'low',
      sortable: true,
      sortValue: (r) => num(r.ctr),
      render: (r) => (
        <span className="rk-number">
          {(num(r.ctr) <= 1 && num(r.ctr) > 0
            ? num(r.ctr) * 100
            : num(r.ctr)
          ).toFixed(1)}
          %
        </span>
      ),
    },
    {
      key: 'opportunity',
      label: 'Opportunity',
      priority: 'high',
      render: (r) =>
        r._opp ? (
          <PriorityChip priority={r._opp.priority} />
        ) : (
          <span className="text-xs text-rk-muted">—</span>
        ),
    },
  ];

  return (
    <AppShell
      mobileOpen={navOpen}
      onClose={() => setNavOpen(false)}
      onMenu={() => setNavOpen(true)}
    >
      <PageHeader
        eyebrow="Visibility"
        title="Keyword Intelligence"
        description="Measured query performance with rule-based opportunity flags. Open a keyword for evidence."
        actions={
          <div className="flex gap-2">
            <SecondaryButton
              onClick={() => {
                setRefreshing(true);
                void load();
              }}
              disabled={refreshing || loading}
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </SecondaryButton>
            <Link href="/content">
              <PrimaryButton type="button">
                Content Engine
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
            {activeWebsite ? (
              <span className="truncate">
                {activeWebsite.name}
              </span>
            ) : null}
            {!loading && connected ? (
              <FreshnessBadge
                label={`${startDate} → ${endDate}`}
              />
            ) : null}
          </div>
        }
      />

      {loading ? (
        <div className="mt-6">
          <LoadingBlock title="Loading keyword data" />
        </div>
      ) : error && connected !== true ? (
        <div className="mt-6">
          <ErrorState
            title="Keyword data failed to load"
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
            title="Search Console is not connected"
            description="Keyword intelligence needs a connected Search Console property. No keywords are shown until then."
            connectLabel="Open integrations"
            connectHref="/integrations"
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <Panel
            eyebrow="Context"
            title="Website, period & filters"
            description="Queries are property-scoped to the connected Search Console property — the website selector keeps workspace context consistent. Intent is a transparent text estimate; opportunity flags are deterministic rules over measured values."
          >
            <FilterBar
              searchValue={search}
              searchPlaceholder="Search keywords…"
              onSearchChange={setSearch}
              selects={[
                {
                  key: 'website',
                  label: 'Website',
                  value: websiteId,
                  options:
                    websites.length > 0
                      ? websites.map((site) => ({
                          value: site.id,
                          label: site.name,
                        }))
                      : [{ value: '', label: 'No websites' }],
                  onChange: handleWebsiteChange,
                },
                {
                  key: 'period',
                  label: 'Period',
                  value: period,
                  options: [
                    { value: '7', label: 'Last 7 days' },
                    { value: '28', label: 'Last 28 days' },
                    { value: '90', label: 'Last 90 days' },
                  ],
                  onChange: setPeriod,
                },
                {
                  key: 'intent',
                  label: 'Intent',
                  value: intentFilter,
                  options: [
                    { value: 'ALL', label: 'All intents' },
                    {
                      value: 'INFORMATIONAL',
                      label: 'Informational',
                    },
                    {
                      value: 'TRANSACTIONAL',
                      label: 'Transactional',
                    },
                    { value: 'LOCAL', label: 'Local' },
                    {
                      value: 'NAVIGATIONAL',
                      label: 'Navigational',
                    },
                    { value: 'MIXED', label: 'Mixed' },
                  ],
                  onChange: setIntentFilter,
                },
                {
                  key: 'position',
                  label: 'Position',
                  value: positionFilter,
                  options: [
                    { value: 'ALL', label: 'All positions' },
                    { value: 'TOP3', label: 'Top 3' },
                    {
                      value: 'STRIKING',
                      label: 'Striking (4–20)',
                    },
                    {
                      value: 'BEYOND',
                      label: 'Beyond 20',
                    },
                  ],
                  onChange: setPositionFilter,
                },
                {
                  key: 'opp',
                  label: 'Opportunity',
                  value: oppFilter,
                  options: [
                    { value: 'ALL', label: 'All' },
                    {
                      value: 'WITH_OPP',
                      label: 'Flagged only',
                    },
                    {
                      value: 'HIGH',
                      label: 'High priority',
                    },
                  ],
                  onChange: setOppFilter,
                },
              ]}
              onClearAll={() => {
                setSearch('');
                setIntentFilter('ALL');
                setPositionFilter('ALL');
                setOppFilter('ALL');
              }}
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

          <section aria-label="Top signals">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric
                label="Tracked keywords"
                value={fmtInt(stats.total)}
                detail="Measured in period"
              />
              <Metric
                label="Avg. position"
                value={stats.avg}
                detail="Lower is better"
              />
              <Metric
                label="Top-3 keywords"
                value={fmtInt(stats.top3)}
                detail="Defend these"
                tone={
                  stats.top3 > 0 ? 'positive' : 'neutral'
                }
              />
              <Metric
                label="Flagged opportunities"
                value={fmtInt(stats.opps)}
                detail="Rule-based flags"
                tone={
                  stats.opps > 0 ? 'warning' : 'neutral'
                }
              />
            </div>
          </section>

          <Panel
            eyebrow="Main table"
            title="Keywords"
            description="Open a row for movement, evidence and the recommended next step."
          >
            <DataTable
              caption="Keywords with measured search performance"
              columns={columns}
              rows={filtered}
              keyOf={(r: any, i: number) =>
                `${r._query}-${i}`
              }
              onRowClick={(r) => void openDrawer(r)}
              emptyTitle="No keywords match"
              emptyDescription="Adjust filters or choose a longer period."
              pageSize={15}
            />
          </Panel>

          <RecommendationCallout
            title="Keywords → content"
            text="Striking-distance and CTR-gap keywords are content briefs waiting to happen. The Content Engine turns them into briefs from measured evidence."
            actionLabel="Open Content Engine"
            actionHref="/content"
          />
        </div>
      )}

      <Drawer
        open={drawerRow !== null}
        onClose={() => setDrawerRow(null)}
        eyebrow="Keyword detail"
        title={String(drawerRow?._query || 'Keyword')}
        description="Measured evidence and the recommended next step. No SERP data is claimed."
        state={
          analysisLoading
            ? 'loading'
            : analysisError && !analysis
              ? 'error'
              : 'ready'
        }
        errorDescription={analysisError}
        onRetry={() =>
          drawerRow && void openDrawer(drawerRow)
        }
      >
        {drawerRow && (
          <>
            <DrawerMeta
              items={[
                {
                  label: 'Current position',
                  value:
                    num(drawerRow.position) > 0
                      ? num(drawerRow.position).toFixed(1)
                      : '—',
                },
                {
                  label: 'Movement',
                  value:
                    drawerRow.clicksChange !== undefined
                      ? `${num(drawerRow.clicksChange) > 0 ? '+' : ''}${fmtInt(drawerRow.clicksChange)} clicks`
                      : 'No prior-period comparison',
                },
                {
                  label: 'Clicks',
                  value: fmtInt(drawerRow.clicks),
                },
                {
                  label: 'Impressions',
                  value: fmtInt(drawerRow.impressions),
                },
                {
                  label: 'Intent',
                  value: `${drawerRow._intent} (estimate)`,
                },
                ...(drawerRow.page
                  ? [
                      {
                        label: 'Linked page',
                        value: String(drawerRow.page),
                      },
                    ]
                  : []),
              ]}
            />
            {drawerRow._opp ? (
              <DrawerSection title="Opportunity">
                <InsightBlock
                  eyebrow="Rule-based flag"
                  title={drawerRow._opp.label}
                >
                  <p className="rk-body mt-1">
                    Flagged by a deterministic rule over
                    measured position, impressions and
                    CTR — not a prediction.
                  </p>
                </InsightBlock>
              </DrawerSection>
            ) : null}
            <DrawerSection title="Recommended next step">
              {analysisLoading ? (
                <LoadingBlock title="Loading recommendation" />
              ) : analysis ? (
                <div className="space-y-2">
                  {Array.isArray(
                    (analysis as any)?.recommendations,
                  ) &&
                  (analysis as any).recommendations.length >
                    0 ? (
                    (analysis as any).recommendations
                      .slice(0, 4)
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
                          'No specific recommendation returned.',
                      )}
                    </p>
                  )}
                </div>
              ) : (
                <p className="rk-body">
                  {analysisError ||
                    'Recommendation unavailable.'}
                </p>
              )}
            </DrawerSection>
            <DrawerSection title="Outcome">
              <NextAction
                label="Build a content brief"
                detail="Turn this keyword into an evidence-backed brief."
                href="/content"
              />
              <div className="mt-2">
                <NextAction
                  label="Track in Opportunity Engine"
                  detail="Persisted opportunities carry evidence into execution."
                  href="/opportunities"
                />
              </div>
            </DrawerSection>
          </>
        )}
      </Drawer>
    </AppShell>
  );
}

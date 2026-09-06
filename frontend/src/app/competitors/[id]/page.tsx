'use client';

/*
 * RENKOO V2 — Competitor detail comparison (Phase 5F).
 * Real comparison-engine data only: identity, score and
 * comparison metrics, page gaps, opportunity gaps wired to
 * Opportunities/Actions, and history charted only when
 * historical crawls exist. Metric detail opens in a Drawer
 * with RENKOO value, competitor value, delta, evidence,
 * implication and recommended action.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  getCompetitorComparison,
  crawlCompetitor,
  createAction,
  getCompetitorCrawlHistory,
  getCompetitorRecommendations,
  createActionFromRecommendation,
  type ComparisonOpportunity,
  type MetricComparison,
  type PageGap,
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
  InsightBlock,
  EvidenceList,
  RecommendationCallout,
  NextAction,
  type DataTableColumn,
} from '@/components/ui';
import { TrendChart, type TrendPoint } from '@/components/charts';

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fmtInt(value: unknown) {
  return num(value).toLocaleString('en-US');
}

function fmtDate(value: unknown) {
  if (!value) return '—';
  try {
    return new Date(String(value)).toLocaleDateString(
      'en-US',
      { month: 'short', day: 'numeric', year: 'numeric' },
    );
  } catch {
    return String(value);
  }
}

type Tab = 'opportunities' | 'metrics' | 'pages' | 'history';

export default function CompetitorDetailPage() {
  const params = useParams();
  const competitorId = String(
    (params as any)?.id || '',
  );
  const [navOpen, setNavOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('opportunities');
  const [priorityFilter, setPriorityFilter] =
    useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [comparison, setComparison] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [recommendations, setRecommendations] = useState<
    any[]
  >([]);
  const [crawling, setCrawling] = useState(false);
  const [drawerMetric, setDrawerMetric] =
    useState<any>(null);
  const [actionBusy, setActionBusy] = useState<
    Record<string, boolean>
  >({});
  const [actionDone, setActionDone] = useState<
    Record<string, boolean>
  >({});

  const load = useCallback(async () => {
    if (!competitorId) return;
    try {
      setError('');
      setActionError('');
      const res =
        await getCompetitorComparison(competitorId);
      setComparison(res);
      try {
        const h =
          await getCompetitorCrawlHistory(competitorId);
        setHistory(
          Array.isArray(h)
            ? h
            : Array.isArray((h as any)?.crawls)
              ? (h as any).crawls
              : [],
        );
      } catch (err: any) {
        setHistoryError(
          err?.message || 'History unavailable.',
        );
      }
      try {
        const recs = await getCompetitorRecommendations(
          competitorId,
        );
        const list = Array.isArray(recs)
          ? recs
          : Array.isArray((recs as any)?.recommendations)
            ? (recs as any).recommendations
            : [];
        setRecommendations(list);
      } catch {
        setRecommendations([]);
      }
    } catch (err: any) {
      setError(
        err?.message || 'Failed to load comparison.',
      );
    } finally {
      setLoading(false);
    }
  }, [competitorId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  async function handleCrawl() {
    if (!competitorId || crawling) return;
    try {
      setCrawling(true);
      await crawlCompetitor(competitorId);
      const deadline = Date.now() + 10 * 60 * 1000;
      let settled = false;
      while (!settled && Date.now() < deadline) {
        await new Promise((res) =>
          setTimeout(res, 5000),
        );
        try {
          const res = await getCompetitorComparison(
            competitorId,
          );
          const status = String(
            (res as any)?.comparison?.crawlStatus ||
              (res as any)?.crawlStatus ||
              '',
          ).toUpperCase();
          if (
            status === 'COMPLETED' ||
            status === 'FAILED'
          ) {
            settled = true;
            setComparison(res);
          }
        } catch {
          /* keep polling until timeout */
        }
      }
      await load();
    } catch (err: any) {
      setError(err?.message || 'Crawl failed to start.');
    } finally {
      setCrawling(false);
    }
  }

  async function handleOppAction(opp: any) {
    const key = String(
      opp.id || `${opp.title}-${opp.metric || ''}`,
    );
    if (actionBusy[key] || actionDone[key]) return;
    try {
      setActionBusy((p) => ({ ...p, [key]: true }));
      setActionError('');
      if (opp.recommendationId || opp.id) {
        try {
          await createActionFromRecommendation(
            String(opp.recommendationId || opp.id),
          );
        } catch {
          await createAction({
            type: 'COMPETITOR',
            title: `Competitor gap: ${String(opp.title || opp.metric || 'gap')}`.slice(
              0,
              140,
            ),
            description: String(
              opp.description ||
                opp.implication ||
                'Measured competitor gap',
            ).slice(0, 500),
            priority: String(
              opp.priority || 'MEDIUM',
            ).toUpperCase(),
            metadata: {
              source: 'COMPETITOR_COMPARISON',
              competitorId,
              metric: opp.metric,
            },
          });
        }
      } else {
        await createAction({
          type: 'COMPETITOR',
          title: `Competitor gap: ${String(opp.title || opp.metric || 'gap')}`.slice(
            0,
            140,
          ),
          description: String(
            opp.description ||
              opp.implication ||
              'Measured competitor gap',
          ).slice(0, 500),
          priority: String(
            opp.priority || 'MEDIUM',
          ).toUpperCase(),
          metadata: {
            source: 'COMPETITOR_COMPARISON',
            competitorId,
            metric: opp.metric,
          },
        });
      }
      setActionDone((p) => ({ ...p, [key]: true }));
    } catch (err: any) {
      setActionError(
        err?.message || 'Could not create action.',
      );
    } finally {
      setActionBusy((p) => ({ ...p, [key]: false }));
    }
  }

  const comp: any = (comparison as any)?.comparison || {};
  const metrics: MetricComparison[] = useMemo(() => {
    const list = (comparison as any)?.metrics;
    return Array.isArray(list) ? list : [];
  }, [comparison]);
  const pageGaps: PageGap[] = useMemo(() => {
    const list = (comparison as any)?.pageGaps;
    return Array.isArray(list) ? list : [];
  }, [comparison]);
  const opportunities: ComparisonOpportunity[] = useMemo(
    () => {
      const list = (comparison as any)?.opportunities;
      return Array.isArray(list) ? list : [];
    },
    [comparison],
  );
  const summary: any =
    (comparison as any)?.summary || {};

  const filteredOpps = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (opportunities as any[]).filter((o: any) => {
      if (
        priorityFilter !== 'ALL' &&
        String(o.priority || '').toUpperCase() !==
          priorityFilter
      )
        return false;
      if (!q) return true;
      return (
        `${o.title || ''} ${o.metric || ''} ${o.description || ''}`
          .toLowerCase()
          .includes(q)
      );
    });
  }, [opportunities, priorityFilter, search]);

  const trendPoints: TrendPoint[] = useMemo(
    () =>
      history
        .map((h: any) => ({
          x: fmtDate(h.completedAt || h.createdAt),
          y: num(h.score ?? 0),
        }))
        .filter((p) => p.y > 0),
    [history],
  );

  const metricColumns: DataTableColumn<any>[] = [
    {
      key: 'metric',
      label: 'Metric',
      priority: 'high',
      render: (r) => (
        <span className="font-semibold text-rk-ink">
          {String(
            r.metric || r.label || r.name || '—',
          ).replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      key: 'you',
      label: 'RENKOO value',
      align: 'right',
      priority: 'high',
      render: (r) => (
        <span className="rk-number">
          {r.you !== undefined && r.you !== null
            ? String(r.you)
            : r.ownValue !== undefined
              ? String(r.ownValue)
              : '—'}
        </span>
      ),
    },
    {
      key: 'them',
      label: 'Competitor',
      align: 'right',
      priority: 'high',
      render: (r) => (
        <span className="rk-number">
          {r.them !== undefined && r.them !== null
            ? String(r.them)
            : r.competitorValue !== undefined
              ? String(r.competitorValue)
              : '—'}
        </span>
      ),
    },
    {
      key: 'delta',
      label: 'Delta',
      align: 'right',
      priority: 'medium',
      render: (r) => (
        <span className="rk-number text-rk-secondary">
          {r.delta !== undefined && r.delta !== null
            ? String(r.delta)
            : '—'}
        </span>
      ),
    },
  ];

  const pageGapColumns: DataTableColumn<any>[] = [
    {
      key: 'page',
      label: 'Page gap',
      priority: 'high',
      render: (r: any) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-rk-ink">
            {String(
              r.url || r.page || r.title || '—',
            )}
          </p>
          {r.metric || r.reason ? (
            <p className="rk-metadata">
              {String(r.metric || r.reason)}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Gap',
      priority: 'medium',
      render: (r: any) => (
        <span className="text-rk-secondary">
          {String(
            r.gap || r.status || 'Missing or weaker',
          ).replace(/_/g, ' ')}
        </span>
      ),
    },
  ];

  const strengths: string[] = Array.isArray(summary.strengths)
    ? summary.strengths
    : [];
  const weaknesses: string[] = Array.isArray(
    summary.weaknesses,
  )
    ? summary.weaknesses
    : [];

  return (
    <AppShell
      mobileOpen={navOpen}
      onClose={() => setNavOpen(false)}
      onMenu={() => setNavOpen(true)}
    >
      <PageHeader
        eyebrow="Market"
        title={String(
          comp?.competitorName ||
            comp?.name ||
            'Competitor comparison',
        )}
        description={String(
          comp?.competitorUrl || comp?.url || '',
        )}
        actions={
          <div className="flex gap-2">
            <Link href="/competitors">
              <SecondaryButton type="button">
                All competitors
              </SecondaryButton>
            </Link>
            <PrimaryButton
              onClick={() => void handleCrawl()}
              disabled={crawling}
            >
              {crawling ? 'Crawling…' : 'Crawl now'}
            </PrimaryButton>
          </div>
        }
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <DataSourceBadge
              source="Comparison engine"
              connected={metrics.length > 0}
            />
            {metrics.length > 0 ? (
              <FreshnessBadge
                label={(() => {
                  const stamp =
                    (comparison as any)?.comparedAt ||
                    comp?.completedAt ||
                    comp?.createdAt ||
                    comp?.updatedAt ||
                    history.reduce<string | null>(
                      (acc: string | null, h: any) => {
                        const v =
                          h?.completedAt ||
                          h?.createdAt;
                        return v &&
                          (!acc ||
                            String(v) > acc)
                          ? String(v)
                          : acc;
                      },
                      null,
                    );
                  return stamp
                    ? `Compared ${fmtDate(stamp)}`
                    : 'Measured comparison';
                })()}
              />
            ) : !loading ? (
              <FreshnessBadge label="Comparison unavailable" />
            ) : null}
          </div>
        }
      />

      {loading ? (
        <div className="mt-6">
          <LoadingBlock title="Loading comparison" />
        </div>
      ) : error && !comparison ? (
        <div className="mt-6">
          <ErrorState
            title="Comparison failed to load"
            description={error}
            onRetry={() => {
              setLoading(true);
              void load();
            }}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {error ? (
            <ErrorState
              title="Partial load failure"
              description={error}
              onRetry={() => void load()}
            />
          ) : null}
          {actionError ? (
            <ErrorState
              title="Action failed"
              description={actionError}
              onRetry={() => setActionError('')}
            />
          ) : null}

          <section aria-label="Signals">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric
                label="Your score"
                value={
                  comp?.ownScore ?? comp?.score !==
                    undefined
                    ? String(
                        comp?.ownScore ?? comp?.score,
                      )
                    : '—'
                }
                detail="Measured crawl"
              />
              <Metric
                label="Competitor score"
                value={
                  comp?.competitorScore !== undefined
                    ? String(comp.competitorScore)
                    : '—'
                }
                detail="Measured crawl"
              />
              <Metric
                label="Metrics compared"
                value={fmtInt(metrics.length)}
                detail="Coverage"
              />
              <Metric
                label="Opportunity gaps"
                value={fmtInt(opportunities.length)}
                detail="Actionable"
                tone={
                  opportunities.length > 0
                    ? 'warning'
                    : 'neutral'
                }
              />
            </div>
          </section>

          {(strengths.length > 0 ||
            weaknesses.length > 0) && (
            <div className="grid gap-3 lg:grid-cols-2">
              {strengths.length > 0 && (
                <InsightBlock
                  eyebrow="Where you lead"
                  title="Strengths"
                >
                  <EvidenceList
                    items={strengths.map((s) => ({
                      text: String(s),
                      source: 'Comparison',
                    }))}
                  />
                </InsightBlock>
              )}
              {weaknesses.length > 0 && (
                <InsightBlock
                  eyebrow="Where they lead"
                  title="Weaknesses"
                >
                  <EvidenceList
                    items={weaknesses.map((w) => ({
                      text: String(w),
                      source: 'Comparison',
                    }))}
                  />
                </InsightBlock>
              )}
            </div>
          )}

          <Panel
            eyebrow="Detail"
            title="Comparison workspace"
            description="Opportunities, metric deltas, page gaps and measured history."
          >
            <FilterBar
              searchValue={search}
              searchPlaceholder="Search opportunities…"
              onSearchChange={setSearch}
              selects={[
                {
                  key: 'tab',
                  label: 'View',
                  value: tab,
                  options: [
                    {
                      value: 'opportunities',
                      label: `Opportunities (${opportunities.length})`,
                    },
                    {
                      value: 'metrics',
                      label: `Metrics (${metrics.length})`,
                    },
                    {
                      value: 'pages',
                      label: `Page gaps (${pageGaps.length})`,
                    },
                    {
                      value: 'history',
                      label: `History (${history.length})`,
                    },
                  ],
                  onChange: (v) => setTab(v as Tab),
                },
                {
                  key: 'priority',
                  label: 'Priority',
                  value: priorityFilter,
                  options: [
                    { value: 'ALL', label: 'All' },
                    {
                      value: 'CRITICAL',
                      label: 'Critical',
                    },
                    { value: 'HIGH', label: 'High' },
                    { value: 'MEDIUM', label: 'Medium' },
                    { value: 'LOW', label: 'Low' },
                  ],
                  onChange: setPriorityFilter,
                },
              ]}
            />

            {tab === 'opportunities' && (
              <div className="mt-4">
                {filteredOpps.length === 0 ? (
                  <EmptyState
                    title="No opportunity gaps"
                    description="No measured gaps match the current filters."
                  />
                ) : (
                  <ul className="divide-y divide-rk-border">
                    {filteredOpps.map(
                      (opp: any, i: number) => {
                        const key = String(
                          opp.id ||
                            `${opp.title}-${opp.metric || ''}-${i}`,
                        );
                        return (
                          <li
                            key={key}
                            className="py-4"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-rk-ink">
                                {String(
                                  opp.title ||
                                    opp.metric ||
                                    'Gap',
                                )}
                              </span>
                              {opp.priority ? (
                                <PriorityChip
                                  priority={String(
                                    opp.priority,
                                  )}
                                />
                              ) : null}
                            </div>
                            {opp.description ? (
                              <p className="rk-body mt-1">
                                {String(opp.description)}
                              </p>
                            ) : null}
                            <div className="mt-2">
                              <SecondaryButton
                                onClick={() =>
                                  void handleOppAction(
                                    opp,
                                  )
                                }
                                disabled={
                                  actionBusy[key] ||
                                  actionDone[key]
                                }
                              >
                                {actionDone[key]
                                  ? 'Added'
                                  : actionBusy[key]
                                    ? 'Adding…'
                                    : 'Add to Action Plan'}
                              </SecondaryButton>
                            </div>
                          </li>
                        );
                      },
                    )}
                  </ul>
                )}
              </div>
            )}

            {tab === 'metrics' && (
              <div className="mt-4">
                {metrics.length === 0 ? (
                  <EmptyState
                    title="No metric comparison"
                    description="Crawl the competitor to measure metric deltas."
                  />
                ) : (
                  <DataTable
                    caption="Metric-by-metric comparison"
                    columns={metricColumns}
                    rows={metrics as any[]}
                    keyOf={(r: any, i: number) =>
                      String(r.metric || r.label || i)
                    }
                    onRowClick={setDrawerMetric}
                  />
                )}
              </div>
            )}

            {tab === 'pages' && (
              <div className="mt-4">
                {pageGaps.length === 0 ? (
                  <EmptyState
                    title="No page gaps"
                    description="No measured page-level gaps for this competitor."
                  />
                ) : (
                  <DataTable
                    caption="Page-level gaps"
                    columns={pageGapColumns}
                    rows={pageGaps as any[]}
                    keyOf={(r: any, i: number) =>
                      String(r.url || r.page || i)
                    }
                    pageSize={12}
                  />
                )}
              </div>
            )}

            {tab === 'history' && (
              <div className="mt-4">
                {historyError && history.length === 0 ? (
                  <ErrorState
                    title="History unavailable"
                    description={historyError}
                  />
                ) : (
                  <TrendChart
                    state={
                      trendPoints.length > 0
                        ? 'ready'
                        : 'empty'
                    }
                    points={trendPoints}
                    summary="Measured competitor scores across crawls."
                    emptyTitle="No crawl history"
                    emptyDescription="History charts appear once repeated crawls are measured."
                  />
                )}
              </div>
            )}
          </Panel>

          {recommendations.length > 0 && (
            <Panel
              eyebrow="Pipeline"
              title="Recommendations"
              description="Persisted recommendation pipeline for this competitor."
            >
              <ul className="divide-y divide-rk-border">
                {recommendations
                  .slice(0, 8)
                  .map((rec: any, i: number) => (
                    <li
                      key={String(rec.id || i)}
                      className="py-2.5"
                    >
                      <p className="text-sm font-semibold text-rk-ink">
                        {String(
                          rec.title || 'Recommendation',
                        )}
                      </p>
                      {rec.description ? (
                        <p className="rk-body mt-0.5">
                          {String(rec.description)}
                        </p>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </Panel>
          )}

          <RecommendationCallout
            title="Gaps → execution"
            text="Competitor gaps persist into the Opportunity Engine with comparison evidence attached."
            actionLabel="Open Opportunity Engine"
            actionHref="/opportunities"
          />
        </div>
      )}

      <Drawer
        open={drawerMetric !== null}
        onClose={() => setDrawerMetric(null)}
        eyebrow="Metric detail"
        title={String(
          drawerMetric?.metric ||
            drawerMetric?.label ||
            'Metric',
        ).replace(/_/g, ' ')}
        description="Measured values, delta, evidence and the recommended action."
      >
        {drawerMetric && (
          <>
            <DrawerMeta
              items={[
                {
                  label: 'RENKOO value',
                  value: String(
                    drawerMetric.you ??
                      drawerMetric.ownValue ??
                      '—',
                  ),
                },
                {
                  label: 'Competitor value',
                  value: String(
                    drawerMetric.them ??
                      drawerMetric.competitorValue ??
                      '—',
                  ),
                },
                {
                  label: 'Delta',
                  value: String(
                    drawerMetric.delta ?? '—',
                  ),
                },
              ]}
            />
            <DrawerSection title="Evidence">
              <EvidenceList
                items={[
                  {
                    text: `Measured in the latest comparison crawl for ${String(comp?.competitorName || 'this competitor')}.`,
                    source: 'Comparison engine',
                  },
                ]}
              />
            </DrawerSection>
            <DrawerSection title="Implication">
              <p className="rk-body">
                {String(
                  drawerMetric.implication ||
                    drawerMetric.description ||
                    'Where the competitor measures stronger, closing the gap is the opportunity.',
                )}
              </p>
            </DrawerSection>
            <DrawerSection title="Recommended action">
              <NextAction
                label="Add to Action Plan"
                detail="Close this drawer and use Add to Action Plan on the matching opportunity."
                href="/actions"
              />
            </DrawerSection>
          </>
        )}
      </Drawer>
    </AppShell>
  );
}

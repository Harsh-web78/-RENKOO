'use client';

/*
 * RENKOO V2 — Content Intelligence + Execution workspace
 * (Phase 5D). Real Content Engine APIs only: opportunities,
 * briefs, drafts/generation, refresh queue. Publishing is
 * never claimed — states distinguish opportunity, brief,
 * draft, generated content and published state. The existing
 * generation workspace is preserved inside the Workspace
 * section.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import Link from 'next/link';
import ContentWorkspace from './workspace';
import {
  analyzeGoogleOpportunity,
  generateContentBrief,
  getContentOpportunities,
  getContentRefreshQueue,
  listContentBriefs,
  listContentDrafts,
  createAction,
  getWebsites,
  isLimitError,
  limitUsageText,
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
  StatusChip,
  WorkflowBadge,
  LoadingBlock,
  ErrorState,
  EmptyState,
  LimitReachedState,
  InsightBlock,
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

type Section =
  | 'opportunities'
  | 'workspace'
  | 'refresh';

export default function ContentPage() {
  const [navOpen, setNavOpen] = useState(false);
  const [section, setSection] = useState<Section>(
    'opportunities',
  );
  const [period, setPeriod] = useState('28');
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] =
    useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [opportunities, setOpportunities] = useState<any[]>(
    [],
  );
  const [refreshQueue, setRefreshQueue] = useState<any[]>(
    [],
  );
  const [briefCount, setBriefCount] = useState<number | null>(
    null,
  );
  const [draftCount, setDraftCount] = useState<number | null>(
    null,
  );
  const [drawerOpp, setDrawerOpp] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [analysisLoading, setAnalysisLoading] =
    useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefMsg, setBriefMsg] = useState('');
  const [briefLimit, setBriefLimit] =
    useState<unknown>(null);
  const [actionBusy, setActionBusy] = useState<
    Record<string, boolean>
  >({});
  const [actionDone, setActionDone] = useState<
    Record<string, boolean>
  >({});

  const { startDate, endDate } = useMemo(
    () => rangeFor(num(period, 28)),
    [period],
  );

  const load = useCallback(async () => {
    try {
      setError('');
      const sites = await getWebsites().catch(
        () => [] as Website[],
      );
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
      const oppRes = await getContentOpportunities(
        startDate,
        endDate,
        valid || undefined,
      );
      const opps = Array.isArray((oppRes as any)?.opportunities)
        ? (oppRes as any).opportunities
        : [];
      setOpportunities(opps);
      const [rq, briefs, drafts] = await Promise.all([
        getContentRefreshQueue(valid || undefined).catch(
          () => null,
        ),
        valid
          ? listContentBriefs(valid).catch(() => null)
          : null,
        valid
          ? listContentDrafts(valid).catch(() => null)
          : null,
      ]);
      const rqList = Array.isArray((rq as any)?.refresh)
        ? (rq as any).refresh
        : Array.isArray(rq)
          ? rq
          : [];
      setRefreshQueue(rqList);
      setBriefCount(
        typeof (briefs as any)?.total === 'number'
          ? (briefs as any).total
          : Array.isArray((briefs as any)?.briefs)
            ? (briefs as any).briefs.length
            : null,
      );
      setDraftCount(
        typeof (drafts as any)?.total === 'number'
          ? (drafts as any).total
          : Array.isArray((drafts as any)?.drafts)
            ? (drafts as any).drafts.length
            : null,
      );
    } catch (err: any) {
      setError(
        err?.message || 'Failed to load content data.',
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

  function handleWebsite(id: string) {
    setWebsiteId(id);
    setDrawerOpp(null);
    if (typeof window !== 'undefined')
      localStorage.setItem('renkoo_website_id', id);
    setLoading(true);
    void load();
  }

  async function openDrawer(opp: any) {
    setDrawerOpp(opp);
    setAnalysis(null);
    setAnalysisError('');
    setBriefMsg('');
    if (!opp.query) return;
    setAnalysisLoading(true);
    try {
      const result = await analyzeGoogleOpportunity(
        startDate,
        endDate,
        String(opp.query),
        opp.pageUrl || opp.page
          ? String(opp.pageUrl || opp.page)
          : undefined,
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

  async function handleGenerateBrief() {
    if (!drawerOpp || briefLoading) return;
    try {
      setBriefLoading(true);
      setBriefMsg('');
      setBriefLimit(null);
      await generateContentBrief({
        websiteId: drawerOpp.websiteId || websiteId,
        query: String(drawerOpp.query || ''),
        page: drawerOpp.pageUrl
          ? String(drawerOpp.pageUrl)
          : undefined,
      } as any);
      setBriefMsg(
        'Brief generated — open the Workspace section to review it.',
      );
      if (websiteId) {
        const b = await listContentBriefs(websiteId).catch(
          () => null,
        );
        setBriefCount(
          typeof (b as any)?.total === 'number'
            ? (b as any).total
            : briefCount,
        );
      }
    } catch (err: any) {
      if (isLimitError(err)) {
        setBriefLimit(err);
      } else {
        setBriefMsg(
          err?.message || 'Brief generation failed.',
        );
      }
    } finally {
      setBriefLoading(false);
    }
  }

  async function handleCreateAction(opp: any) {
    const key = String(
      opp.id || `${opp.query}-${opp.pageUrl || ''}`,
    );
    if (actionBusy[key] || actionDone[key]) return;
    try {
      setActionBusy((p) => ({ ...p, [key]: true }));
      await createAction({
        websiteId: opp.websiteId || websiteId,
        type: 'CONTENT',
        title: `Content: ${String(opp.query || opp.topic || 'opportunity')}`.slice(
          0,
          140,
        ),
        description: String(
          opp.description || opp.signal || 'Content opportunity',
        ).slice(0, 500),
        priority: String(
          opp.priority || 'MEDIUM',
        ).toUpperCase(),
        metadata: {
          source: 'CONTENT',
          query: opp.query,
          pageUrl: opp.pageUrl,
        },
      });
      setActionDone((p) => ({ ...p, [key]: true }));
    } catch {
      /* button stays usable on failure */
    } finally {
      setActionBusy((p) => ({ ...p, [key]: false }));
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return opportunities.filter((o: any) => {
      if (
        priorityFilter !== 'ALL' &&
        String(o.priority || '').toUpperCase() !==
          priorityFilter
      )
        return false;
      if (
        statusFilter !== 'ALL' &&
        String(o.status || '').toUpperCase() !==
          statusFilter
      )
        return false;
      if (!q) return true;
      return (
        `${o.query || ''} ${o.topic || ''} ${o.pageUrl || o.page || ''} ${o.intent || ''}`
          .toLowerCase()
          .includes(q)
      );
    });
  }, [opportunities, search, priorityFilter, statusFilter]);

  const stats = useMemo(() => {
    const high = opportunities.filter(
      (o: any) =>
        String(o.priority || '').toUpperCase() === 'HIGH',
    ).length;
    return {
      total: opportunities.length,
      high,
      briefs: briefCount,
      drafts: draftCount,
      refresh: refreshQueue.length,
    };
  }, [opportunities, briefCount, draftCount, refreshQueue]);

  const columns: DataTableColumn<any>[] = [
    {
      key: 'topic',
      label: 'Page / topic',
      priority: 'high',
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-rk-ink">
            {String(r.query || r.topic || '—')}
          </p>
          {r.pageUrl || r.page ? (
            <p className="rk-metadata truncate">
              {String(r.pageUrl || r.page)}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'intent',
      label: 'Intent',
      priority: 'medium',
      render: (r) => (
        <span className="text-rk-secondary">
          {String(r.intent || '—').replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      key: 'signal',
      label: 'Signal',
      priority: 'medium',
      render: (r) => (
        <span className="rk-number text-rk-secondary">
          {r.impressions !== undefined
            ? `${fmtInt(r.impressions)} impr`
            : r.signal
              ? String(r.signal)
              : '—'}
        </span>
      ),
    },
    {
      key: 'priority',
      label: 'Priority',
      priority: 'high',
      sortable: true,
      sortValue: (r) => String(r.priority || ''),
      render: (r) =>
        r.priority ? (
          <PriorityChip priority={String(r.priority)} />
        ) : (
          <span className="text-xs text-rk-muted">—</span>
        ),
    },
    {
      key: 'status',
      label: 'Status',
      priority: 'medium',
      render: (r) => (
        <StatusChip
          status={String(r.status || 'OPEN')}
        />
      ),
    },
    {
      key: 'action',
      label: 'Action',
      priority: 'high',
      render: (r) => {
        const key = String(
          r.id || `${r.query}-${r.pageUrl || ''}`,
        );
        return (
          <SecondaryButton
            onClick={(e) => {
              e.stopPropagation();
              void handleCreateAction(r);
            }}
            disabled={actionBusy[key] || actionDone[key]}
          >
            {actionDone[key]
              ? 'Added'
              : actionBusy[key]
                ? 'Adding…'
                : 'Add to Actions'}
          </SecondaryButton>
        );
      },
    },
  ];

  return (
    <AppShell
      mobileOpen={navOpen}
      onClose={() => setNavOpen(false)}
      onMenu={() => setNavOpen(true)}
    >
      <PageHeader
        eyebrow="Grow"
        title="Content Engine"
        description="Content intelligence and execution — from measured opportunity to brief to draft."
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
            <Link href="/actions">
              <PrimaryButton type="button">
                Action Engine
              </PrimaryButton>
            </Link>
          </div>
        }
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <DataSourceBadge
              source="Search Console"
              connected={!loading && !error}
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
          <LoadingBlock title="Loading content data" />
        </div>
      ) : error && opportunities.length === 0 ? (
        <div className="mt-6">
          <ErrorState
            title="Content data failed to load"
            description={error}
            onRetry={() => {
              setLoading(true);
              void load();
            }}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <Panel
            eyebrow="Context"
            title="Website, period & section"
            description="Opportunities are measured from Search Console signals for the selected scope."
          >
            <FilterBar
              searchValue={search}
              searchPlaceholder="Search topics, pages, intents…"
              onSearchChange={setSearch}
              selects={[
                {
                  key: 'website',
                  label: 'Website',
                  value: websiteId,
                  options: websites.map((w) => ({
                    value: w.id,
                    label: w.name,
                  })),
                  onChange: handleWebsite,
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
                  key: 'section',
                  label: 'Section',
                  value: section,
                  options: [
                    {
                      value: 'opportunities',
                      label: 'Opportunities',
                    },
                    {
                      value: 'workspace',
                      label: 'Workspace',
                    },
                    {
                      value: 'refresh',
                      label: 'Refresh queue',
                    },
                  ],
                  onChange: (v) =>
                    setSection(v as Section),
                },
                {
                  key: 'priority',
                  label: 'Priority',
                  value: priorityFilter,
                  options: [
                    { value: 'ALL', label: 'All' },
                    { value: 'HIGH', label: 'High' },
                    { value: 'MEDIUM', label: 'Medium' },
                    { value: 'LOW', label: 'Low' },
                  ],
                  onChange: setPriorityFilter,
                },
                {
                  key: 'status',
                  label: 'Status',
                  value: statusFilter,
                  options: [
                    { value: 'ALL', label: 'All' },
                    { value: 'OPEN', label: 'Open' },
                    {
                      value: 'IN_PROGRESS',
                      label: 'In progress',
                    },
                    { value: 'DONE', label: 'Done' },
                  ],
                  onChange: setStatusFilter,
                },
              ]}
              onClearAll={() => {
                setSearch('');
                setPriorityFilter('ALL');
                setStatusFilter('ALL');
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

          <section aria-label="Content performance">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Metric
                label="Opportunities"
                value={fmtInt(stats.total)}
                detail="Measured topics"
              />
              <Metric
                label="High priority"
                value={fmtInt(stats.high)}
                detail="Act first"
                tone={stats.high > 0 ? 'warning' : 'neutral'}
              />
              <Metric
                label="Briefs"
                value={
                  stats.briefs === null
                    ? '—'
                    : fmtInt(stats.briefs)
                }
                detail="Generated briefs"
              />
              <Metric
                label="Drafts"
                value={
                  stats.drafts === null
                    ? '—'
                    : fmtInt(stats.drafts)
                }
                detail="AI-generated drafts"
              />
              <Metric
                label="Refresh queue"
                value={fmtInt(stats.refresh)}
                detail="Declining pages"
              />
            </div>
          </section>

          {section === 'opportunities' && (
            <Panel
              eyebrow="Content opportunities"
              title="Opportunity table"
              description="Open a row for analysis, brief generation and tracked action."
            >
              <DataTable
                caption="Content opportunities from measured signals"
                columns={columns}
                rows={filtered}
                keyOf={(r: any, i: number) =>
                  String(
                    r.id || `${r.query}-${i}`,
                  )
                }
                onRowClick={(r) => void openDrawer(r)}
                emptyTitle="No content opportunities"
                emptyDescription="No measured content gaps in this scope and period."
                pageSize={12}
              />
            </Panel>
          )}

          {section === 'workspace' && (
            <Panel
              eyebrow="Briefs & drafts"
              title="Content workspace"
              description="Briefs, AI generation state, provider, evidence and limitations live here."
            >
              <ContentWorkspace websiteId={websiteId} />
            </Panel>
          )}

          {section === 'refresh' && (
            <Panel
              eyebrow="Refresh queue"
              title="Pages losing ground"
              description="Actual decline signals where available — refresh, don't rewrite blindly."
            >
              {refreshQueue.length === 0 ? (
                <EmptyState
                  title="Refresh queue is clear"
                  description="No measured declining pages need a refresh right now."
                />
              ) : (
                <DataTable
                  caption="Pages with measured decline signals"
                  columns={[
                    {
                      key: 'page',
                      label: 'Page',
                      priority: 'high',
                      render: (r: any) => (
                        <span
                          className="block max-w-[320px] truncate font-medium text-rk-ink"
                          title={String(
                            r.pageUrl ||
                              r.url ||
                              r.query ||
                              '—',
                          )}
                        >
                          {String(
                            r.pageUrl ||
                              r.url ||
                              r.query ||
                              '—',
                          )}
                        </span>
                      ),
                    },
                    {
                      key: 'signal',
                      label: 'Decline signal',
                      priority: 'high',
                      render: (r: any) => (
                        <span className="text-rk-secondary">
                          {String(
                            r.signal ||
                              r.reason ||
                              'Measured decline',
                          )}
                        </span>
                      ),
                    },
                    {
                      key: 'priority',
                      label: 'Priority',
                      priority: 'medium',
                      render: (r: any) =>
                        r.priority ? (
                          <PriorityChip
                            priority={String(r.priority)}
                          />
                        ) : (
                          <span className="text-xs text-rk-muted">
                            —
                          </span>
                        ),
                      },
                    ]}
                  rows={refreshQueue}
                  keyOf={(r: any, i: number) =>
                    String(r.id || r.pageUrl || i)
                  }
                  pageSize={12}
                />
              )}
            </Panel>
          )}

          <RecommendationCallout
            title="Execution, honestly"
            text="RENKOO prepares opportunity, brief and draft. Publishing happens on your side — mark published only when it is really live."
            actionLabel="Open Action Engine"
            actionHref="/actions"
          />
        </div>
      )}

      <Drawer
        open={drawerOpp !== null}
        onClose={() => setDrawerOpp(null)}
        eyebrow="Content opportunity"
        title={String(
          drawerOpp?.query || drawerOpp?.topic || 'Opportunity',
        )}
        description="Measured signal, analysis and the path to brief and action."
      >
        {drawerOpp && (
          <>
            <DrawerMeta
              items={[
                {
                  label: 'Intent',
                  value: String(
                    drawerOpp.intent || '—',
                  ).replace(/_/g, ' '),
                },
                {
                  label: 'Priority',
                  value: String(
                    drawerOpp.priority || '—',
                  ).replace(/_/g, ' '),
                },
                {
                  label: 'Status',
                  value: String(
                    drawerOpp.status || 'OPEN',
                  ).replace(/_/g, ' '),
                },
                ...(drawerOpp.pageUrl || drawerOpp.page
                  ? [
                      {
                        label: 'Page',
                        value: String(
                          drawerOpp.pageUrl ||
                            drawerOpp.page,
                        ),
                      },
                    ]
                  : []),
              ]}
            />
            <DrawerSection title="Why this matters">
              {analysisLoading ? (
                <LoadingBlock title="Analyzing opportunity" />
              ) : analysis ? (
                <p className="rk-body">
                  {String(
                    (analysis as any)?.summary ||
                      'Measured signal supports this topic.',
                  )}
                </p>
              ) : (
                <p className="rk-body">
                  {analysisError ||
                    String(
                      drawerOpp.description ||
                        drawerOpp.signal ||
                        'Measured content gap.',
                    )}
                </p>
              )}
            </DrawerSection>
            <DrawerSection
              title="Brief"
              actions={
                <SecondaryButton
                  onClick={() => void handleGenerateBrief()}
                  disabled={
                    briefLoading || !drawerOpp.query
                  }
                >
                  {briefLoading
                    ? 'Generating…'
                    : 'Generate brief'}
                </SecondaryButton>
              }
            >
              <p className="rk-body">
                {briefMsg ||
                  'Generate an evidence-backed brief. Review it in the Workspace section before drafting.'}
              </p>
              {briefLimit ? (
                <div className="mt-2">
                  <LimitReachedState
                    title="Free plan limit reached"
                    description="This brief could not be generated because the workspace hit its AI generation allowance. Existing briefs are untouched."
                    detail={limitUsageText(
                      briefLimit,
                    )}
                    actionLabel="View plans"
                    actionHref="/billing"
                  />
                </div>
              ) : null}
            </DrawerSection>
            <DrawerSection title="Outcome">
              <NextAction
                label="Track in Action Engine"
                detail="Content work becomes a tracked action."
                href="/actions"
              />
            </DrawerSection>
          </>
        )}
      </Drawer>
    </AppShell>
  );
}

'use client';

/*
 * RENKOO — Opportunity Engine (V2 design-system pass).
 * UI ONLY: shared PageHeader / Panel / Metric / FilterBar /
 * badges / states. All data, filters, sorting, grouping,
 * persona re-ranking, evidence, action creation, website
 * behavior and business logic are unchanged.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Globe2, RefreshCw } from 'lucide-react';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import Panel from '@/components/ui/Panel';
import Metric from '@/components/ui/Metric';
import FilterBar from '@/components/ui/FilterBar';
import {
  Badge,
  DataSourceBadge,
  StatusBadge,
} from '@/components/ui/badge';
import {
  PrimaryButton,
  SecondaryButton,
} from '@/components/ui/buttons';
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
} from '@/components/ui/states';
import {
  getUnifiedOpportunities,
  getWebsites,
  createAction,
  createActionFromRecommendation,
  Website,
  UnifiedOpportunity,
} from '@/lib/api';
import {
  PERSONA_META,
  rankOpportunities,
  usePersona,
} from '@/lib/persona';

type SourceFilter =
  | 'ALL'
  | 'SEO'
  | 'COMPETITOR'
  | 'BACKLINK'
  | 'GEO'
  | 'AEO'
  | 'BUSINESS_BRAIN';

type PriorityFilter = 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW';
type StatusFilter = 'ALL' | 'OPEN' | 'IN_PROGRESS' | 'COMPLETED';
type SortMode =
  | 'MY_ROLE'
  | 'PRIORITY'
  | 'SCORE'
  | 'RECENT';

const SOURCE_FILTERS: { value: SourceFilter; label: string }[] = [
  { value: 'ALL', label: 'All sources' },
  { value: 'SEO', label: 'SEO' },
  { value: 'COMPETITOR', label: 'Competitors' },
  { value: 'BACKLINK', label: 'Backlinks' },
  { value: 'GEO', label: 'GEO' },
  { value: 'AEO', label: 'AEO' },
  { value: 'BUSINESS_BRAIN', label: 'Business Brain' },
];

const PRIORITY_ORDER: Record<string, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

function isPersistedRecommendation(opportunity: UnifiedOpportunity) {
  return (
    opportunity.sourceId === opportunity.id &&
    !opportunity.id.includes(':')
  );
}

export default function OpportunitiesPage() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState<string>('');
  const [data, setData] = useState<any>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('ALL');
  const [priorityFilter, setPriorityFilter] =
    useState<PriorityFilter>('ALL');
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>('ALL');
  const [sortMode, setSortMode] =
    useState<SortMode>('MY_ROLE');

  /*
   * Persona re-ranks the engine's real output
   * for role relevance. Filters, scores and
   * evidence are untouched; nothing is hidden.
   */
  const { effectivePersona } = usePersona();
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [websitesLoading, setWebsitesLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [actionLoadingMap, setActionLoadingMap] = useState<
    Record<string, boolean>
  >({});
  const [actionSuccessMap, setActionSuccessMap] = useState<
    Record<string, boolean>
  >({});
  const [actionError, setActionError] = useState('');

  const loadQueue = useCallback(async (id: string) => {
    if (!id) return;
    try {
      setLoading(true);
      setError('');
      const result = await getUnifiedOpportunities(id);
      setData(result);
    } catch (err: any) {
      console.error('[RENKOO] OPPORTUNITIES ERROR', err);
      setError(err?.message || 'Failed to load opportunities');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setWebsitesLoading(true);
        const sites = await getWebsites();
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

        setWebsiteId(valid || '');
        if (valid) {
          await loadQueue(valid);
        } else {
          setLoading(false);
          if (list.length === 0) {
            setError('No website found. Add a website first.');
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load websites');
          setLoading(false);
        }
      } finally {
        if (!cancelled) setWebsitesLoading(false);
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [loadQueue]);

  function handleWebsiteChange(id: string) {
    setWebsiteId(id);
    setData(null);
    if (typeof window !== 'undefined') {
      localStorage.setItem('renkoo_website_id', id);
    }
    void loadQueue(id);
  }

  const opportunities: UnifiedOpportunity[] =
    data?.opportunities || [];

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result = opportunities.filter((item) => {
      if (sourceFilter !== 'ALL') {
        const matches =
          sourceFilter === 'SEO'
            ? ['SEO_AUDIT', 'CONTENT', 'GSC_SEO'].includes(item.source)
            : sourceFilter === 'COMPETITOR'
              ? item.source === 'COMPETITOR_COMPARISON'
              : sourceFilter === 'BACKLINK'
                ? item.source === 'BACKLINK'
                : sourceFilter === 'GEO'
                  ? ['GEO', 'GEO_AUDIT'].includes(item.source)
                  : sourceFilter === 'AEO'
                    ? ['AEO', 'AEO_AUDIT'].includes(item.source)
                    : item.source === 'BUSINESS_BRAIN';
        if (!matches) return false;
      }

      if (
        priorityFilter !== 'ALL' &&
        String(item.priority || '').toUpperCase() !== priorityFilter
      ) {
        return false;
      }

      if (
        statusFilter !== 'ALL' &&
        String(item.status || '').toUpperCase() !== statusFilter
      ) {
        return false;
      }

      if (query) {
        const haystack =
          `${item.title} ${item.description} ${item.type} ${item.source} ${item.pageUrl || ''}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    });

    return [...result].sort((a, b) => {
      if (sortMode === 'MY_ROLE') {
        const ranked = rankOpportunities(
          result,
          effectivePersona,
        );
        const order = new Map(
          ranked.map((entry, index) => [
            entry.opportunity.id,
            index,
          ]),
        );

        return (
          (order.get(a.id) ?? 0) -
          (order.get(b.id) ?? 0)
        );
      }
      if (sortMode === 'SCORE') {
        return (Number(b.score) || 0) - (Number(a.score) || 0);
      }
      if (sortMode === 'RECENT') {
        const aTime = a.updatedAt || a.createdAt || '';
        const bTime = b.updatedAt || b.createdAt || '';
        return String(bTime).localeCompare(String(aTime));
      }
      const priorityDifference =
        (PRIORITY_ORDER[String(b.priority || '').toUpperCase()] || 0) -
        (PRIORITY_ORDER[String(a.priority || '').toUpperCase()] || 0);
      if (priorityDifference !== 0) return priorityDifference;
      return (Number(b.score) || 0) - (Number(a.score) || 0);
    });
  }, [
    opportunities,
    sourceFilter,
    priorityFilter,
    statusFilter,
    sortMode,
    search,
    effectivePersona,
  ]);

  const grouped = useMemo(() => {
    const groups: Record<string, UnifiedOpportunity[]> = {
      HIGH: [],
      MEDIUM: [],
      LOW: [],
    };
    for (const item of filtered) {
      const key = String(item.priority || '').toUpperCase();
      if (groups[key]) groups[key].push(item);
      else groups.LOW.push(item);
    }
    return (['HIGH', 'MEDIUM', 'LOW'] as const)
      .filter((key) => groups[key].length > 0)
      .map((key) => ({ priority: key, items: groups[key] }));
  }, [filtered]);

  async function handleCreateAction(opportunity: UnifiedOpportunity) {
    const key = opportunity.id;
    if (actionLoadingMap[key] || actionSuccessMap[key]) return;
    try {
      setActionLoadingMap((prev) => ({ ...prev, [key]: true }));
      setActionError('');

      if (isPersistedRecommendation(opportunity)) {
        await createActionFromRecommendation(opportunity.sourceId);
      } else {
        await createAction({
          websiteId,
          recommendationId: undefined,
          type: opportunity.type || opportunity.source,
          title: opportunity.title,
          description: opportunity.recommendation || opportunity.description,
          url: opportunity.pageUrl || undefined,
          priority: opportunity.priority,
          metadata: {
            source: opportunity.source,
            sourceId: opportunity.sourceId,
            opportunityType: opportunity.type,
            score: opportunity.score,
          },
        });
      }

      setActionSuccessMap((prev) => ({ ...prev, [key]: true }));
    } catch (err: any) {
      setActionError(
        err?.message || 'Unable to create action from this opportunity.',
      );
    } finally {
      setActionLoadingMap((prev) => ({ ...prev, [key]: false }));
    }
  }

  function clearFilters() {
    setSourceFilter('ALL');
    setPriorityFilter('ALL');
    setStatusFilter('ALL');
    setSortMode('MY_ROLE');
    setSearch('');
  }

  if (loading || websitesLoading) {
    return (
      <AppShell
        mobileOpen={navOpen}
        onClose={() => setNavOpen(false)}
        onMenu={() => setNavOpen(true)}
      >
        <LoadingBlock title="Loading opportunities…" lines={5} />
      </AppShell>
    );
  }

  if (error && !data) {
    return (
      <AppShell
        mobileOpen={navOpen}
        onClose={() => setNavOpen(false)}
        onMenu={() => setNavOpen(true)}
      >
        <PageHeader
          eyebrow="Growth intelligence"
          title="Opportunity Engine"
          description="One prioritized growth queue across RENKOO."
        />

        <div className="mt-6">
          <ErrorState
            title="Could not load opportunities"
            description={error}
            onRetry={
              websiteId
                ? () => loadQueue(websiteId)
                : undefined
            }
          />
        </div>
      </AppShell>
    );
  }

  const summary = data?.summary;
  const activeWebsite =
    websites.find((site) => site.id === websiteId) || null;

  return (
    <AppShell
      mobileOpen={navOpen}
      onClose={() => setNavOpen(false)}
      onMenu={() => setNavOpen(true)}
    >
      <div className="rk-page">
        <PageHeader
          eyebrow="Growth intelligence"
          title="Opportunity Engine"
          description="One prioritized growth queue across RENKOO, built only from measured workspace data."
          meta={
            <>
              <span>
                {filtered.length} of {opportunities.length} shown
              </span>
              <span aria-hidden>·</span>
              <span>
                {PERSONA_META[effectivePersona].label} view
              </span>
              {activeWebsite ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="truncate">
                    {activeWebsite.name}
                  </span>
                </>
              ) : null}
            </>
          }
          actions={
            <>
              <SecondaryButton
                onClick={() => websiteId && loadQueue(websiteId)}
                disabled={!websiteId || loading}
              >
                <RefreshCw
                  size={14}
                  aria-hidden
                  className={loading ? 'animate-spin' : ''}
                />
                Refresh
              </SecondaryButton>

              <Link
                href="/actions"
                className="rk-focusable inline-flex h-9 items-center gap-1.5 rounded-rk-md bg-rk-ink px-4 text-[13px] font-bold text-white shadow-rk-sm transition-all hover:opacity-90 hover:shadow-rk-md"
              >
                Open Actions
                <ArrowRight size={14} aria-hidden />
              </Link>
            </>
          }
        />

        {/* Website context — preserved selector behavior */}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label
            htmlFor="opp-website"
            className="rk-field-label flex shrink-0 items-center gap-1.5"
          >
            <Globe2 size={13} aria-hidden className="text-rk-muted" />
            Website
          </label>

          <select
            id="opp-website"
            value={websiteId}
            onChange={(e) => handleWebsiteChange(e.target.value)}
            className="rk-focusable h-10 w-full max-w-md rounded-rk-md border border-rk-border bg-rk-surface px-3 text-sm font-semibold text-rk-ink shadow-rk-sm outline-none transition-all hover:border-rk-strong sm:w-auto sm:min-w-[240px]"
          >
            {websites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </div>

        {/* Summary — shared Metric cards */}
        <section
          aria-label="Opportunity summary"
          className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          <div className="rounded-rk-lg border border-rk-border bg-rk-surface p-4 shadow-rk-sm sm:p-5">
            <Metric
              label="Total opportunities"
              value={String(data?.total || 0)}
              detail="Open and in-progress items only"
            />
          </div>

          <div className="rounded-rk-lg border border-rk-border bg-rk-surface p-4 shadow-rk-sm sm:p-5">
            <Metric
              label="High priority"
              value={String(summary?.high || 0)}
              detail="Requires attention first"
              tone="negative"
            />
          </div>

          <div className="rounded-rk-lg border border-rk-border bg-rk-surface p-4 shadow-rk-sm sm:p-5">
            <Metric
              label="Medium"
              value={String(summary?.medium || 0)}
              detail="Meaningful growth potential"
              tone="warning"
            />
          </div>

          <div className="rounded-rk-lg border border-rk-border bg-rk-surface p-4 shadow-rk-sm sm:p-5">
            <Metric
              label="Low"
              value={String(summary?.low || 0)}
              detail="Useful optimization queue"
            />
          </div>
        </section>

        {/* Queue */}
        <div className="mt-6">
          <Panel
            eyebrow="Priority queue"
            title="Growth opportunities"
            description={
              sortMode === 'MY_ROLE'
                ? `Prioritized for ${PERSONA_META[effectivePersona].label} — engine scores and evidence are unchanged. Switch sort to see the raw engine order.`
                : undefined
            }
            padded={false}
          >
            <div className="px-4 pt-4 sm:px-5">
              <FilterBar
                searchValue={search}
                searchPlaceholder="Search opportunities, pages, types…"
                onSearchChange={setSearch}
                selects={[
                  {
                    key: 'source',
                    label: 'Source',
                    value: sourceFilter,
                    options: SOURCE_FILTERS.map((item) => ({
                      value: item.value,
                      label: item.label,
                    })),
                    onChange: (value) =>
                      setSourceFilter(value as SourceFilter),
                  },
                  {
                    key: 'priority',
                    label: 'Priority',
                    value: priorityFilter,
                    options: ['ALL', 'HIGH', 'MEDIUM', 'LOW'].map(
                      (value) => ({
                        value,
                        label: formatLabel(value),
                      }),
                    ),
                    onChange: (value) =>
                      setPriorityFilter(value as PriorityFilter),
                  },
                  {
                    key: 'status',
                    label: 'Status',
                    value: statusFilter,
                    options: [
                      'ALL',
                      'OPEN',
                      'IN_PROGRESS',
                      'COMPLETED',
                    ].map((value) => ({
                      value,
                      label: formatLabel(value),
                    })),
                    onChange: (value) =>
                      setStatusFilter(value as StatusFilter),
                  },
                  {
                    key: 'sort',
                    label: 'Sort',
                    value: sortMode,
                    options: (['MY_ROLE', 'PRIORITY', 'SCORE', 'RECENT'] as SortMode[]).map(
                      (value) => ({
                        value,
                        label: formatLabel(value),
                      }),
                    ),
                    onChange: (value) =>
                      setSortMode(value as SortMode),
                  },
                ]}
                onClearAll={clearFilters}
                meta={`Showing ${filtered.length} of ${opportunities.length} opportunities`}
              />
            </div>

            {actionError ? (
              <div className="px-4 pt-4 sm:px-5">
                <div
                  role="alert"
                  className="rounded-rk-md border border-rk-danger/30 bg-rk-dangerSoft px-3.5 py-3 text-sm font-medium leading-5 text-rk-danger"
                >
                  {actionError}
                </div>
              </div>
            ) : null}

            {filtered.length === 0 ? (
              <div className="px-4 py-4 sm:px-5">
                <EmptyState
                  title="No opportunities found"
                  description={`No persisted opportunities match ${(
                    SOURCE_FILTERS.find(
                      (item) => item.value === sourceFilter,
                    )?.label || 'these filters'
                  ).toLowerCase()} right now. Run audits, crawls, and intelligence scans to generate real evidence-backed items.`}
                  actionLabel="Clear filters"
                  onAction={clearFilters}
                />
              </div>
            ) : (
              <div className="mt-4 divide-y divide-rk-border border-t border-rk-border">
                {grouped.map((group) => (
                  <div key={group.priority}>
                    <p className="rk-label bg-rk-soft/60 px-4 py-2.5 sm:px-5">
                      {formatLabel(group.priority)} priority —{' '}
                      {group.items.length}
                    </p>

                    <div className="divide-y divide-rk-border">
                      {group.items.map((opportunity, index) => (
                        <OpportunityCard
                          key={opportunity.id}
                          opportunity={opportunity}
                          index={index}
                          expanded={Boolean(
                            expandedMap[opportunity.id],
                          )}
                          actionLoading={Boolean(
                            actionLoadingMap[opportunity.id],
                          )}
                          actionSuccess={Boolean(
                            actionSuccessMap[opportunity.id],
                          )}
                          onToggleEvidence={() =>
                            setExpandedMap((prev) => ({
                              ...prev,
                              [opportunity.id]:
                                !prev[opportunity.id],
                            }))
                          }
                          onCreateAction={() =>
                            handleCreateAction(opportunity)
                          }
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* Intelligence footer — existing copy, rk tokens */}
        <section className="mt-6 overflow-hidden rounded-rk-lg border border-rk-ink bg-rk-ink text-white shadow-rk-sm">
          <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[1fr_auto] md:items-center">
            <div className="min-w-0">
              <p className="rk-label !text-white/60">
                RENKOO Intelligence
              </p>

              <h2 className="mt-2 max-w-2xl text-xl font-extrabold tracking-[-0.02em]">
                Turn opportunities into measurable growth.
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">
                Persisted SEO, competitor, backlink, GEO, AEO and
                Business Brain signals in one queue. Completed and
                dismissed items stay out of the active queue.
              </p>
            </div>

            <div className="shrink-0 rounded-rk-md border border-white/15 bg-white/5 px-5 py-4 text-right">
              <p className="rk-label !text-white/60">
                Active queue
              </p>
              <p className="rk-number mt-1 text-2xl font-extrabold text-white">
                {filtered.length}
              </p>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function OpportunityCard({
  opportunity,
  index,
  expanded,
  actionLoading,
  actionSuccess,
  onToggleEvidence,
  onCreateAction,
}: {
  opportunity: UnifiedOpportunity;
  index: number;
  expanded: boolean;
  actionLoading: boolean;
  actionSuccess: boolean;
  onToggleEvidence: () => void;
  onCreateAction: () => void;
}) {
  const priority = String(opportunity.priority || '').toUpperCase();
  const priorityTone =
    priority === 'HIGH'
      ? ('danger' as const)
      : priority === 'MEDIUM'
        ? ('warning' as const)
        : ('neutral' as const);

  return (
    <article className="rk-table-row px-4 py-5 sm:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        <div className="min-w-0 flex-1">
          {/* What is it + how important */}
          <div className="flex flex-wrap items-center gap-1.5">
            {sourceHref(opportunity.source) ? (
              <Link
                href={sourceHref(opportunity.source) as string}
                className="rk-focusable inline-flex items-center gap-1 rounded-rk-sm border border-rk-border bg-rk-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rk-secondary underline decoration-rk-border-strong underline-offset-2 hover:text-rk-ink"
              >
                {formatLabel(opportunity.source)}
              </Link>
            ) : (
              <DataSourceBadge source={formatLabel(opportunity.source)} />
            )}

            <Badge label={formatLabel(priority)} tone={priorityTone} />

            {opportunity.businessRelevance ? (
              <Badge
                label={`Business priority: ${formatLabel(opportunity.businessRelevance)}`}
                tone="info"
              />
            ) : null}

            <StatusBadge status={String(opportunity.status || 'OPEN')} />
          </div>

          <div className="mt-3 flex gap-3">
            <span
              aria-hidden
              className="hidden pt-1 text-xs font-bold tabular-nums text-rk-muted md:block"
            >
              {String(index + 1).padStart(2, '0')}
            </span>

            <div className="min-w-0 flex-1">
              <h2 className="text-[16px] font-bold leading-6 tracking-[-0.015em] text-rk-ink">
                {opportunity.title}
              </h2>

              <p className="mt-1.5 max-w-4xl text-sm leading-6 text-rk-secondary">
                {opportunity.description}
              </p>

              {/* Why it matters — score / impact / effort evidence */}
              <p className="rk-metadata mt-2">
                Score {opportunity.score}
                {opportunity.impact
                  ? ` · Impact ${formatLabel(opportunity.impact)}`
                  : ''}
                {opportunity.effort
                  ? ` · Effort ${formatLabel(opportunity.effort)}`
                  : ''}
                {opportunity.pageUrl
                  ? ` · ${opportunity.pageUrl}`
                  : ''}
              </p>

              {/* What to do next */}
              {opportunity.recommendation ? (
                <div className="mt-3 rounded-rk-md border-l-2 border-rk-ink bg-rk-soft px-4 py-3">
                  <p className="rk-label">Recommended action</p>

                  <p className="mt-1.5 text-sm font-medium leading-6 text-rk-ink">
                    {opportunity.recommendation}
                  </p>
                </div>
              ) : null}

              <div className="mt-3.5 flex flex-wrap items-center gap-2">
                <SecondaryButton
                  size="sm"
                  onClick={onToggleEvidence}
                  aria-expanded={expanded}
                >
                  {expanded ? 'Hide evidence' : 'View evidence'}
                </SecondaryButton>

                {actionSuccess ? (
                  <>
                    <span className="inline-flex h-8 items-center gap-1.5 rounded-rk-md bg-rk-success px-3 text-xs font-bold text-white">
                      Action created
                    </span>
                    <Link
                      href="/actions"
                      className="rk-focusable inline-flex h-8 items-center rounded-rk-md border border-rk-border bg-rk-surface px-3 text-xs font-bold text-rk-ink hover:bg-rk-soft"
                    >
                      Open in Actions
                    </Link>
                  </>
                ) : (
                  <PrimaryButton
                    size="sm"
                    onClick={onCreateAction}
                    disabled={actionLoading}
                  >
                    {actionLoading
                      ? 'Creating…'
                      : isPersistedRecommendation(opportunity)
                        ? 'Create action from recommendation'
                        : 'Create action'}
                  </PrimaryButton>
                )}
              </div>

              {opportunity.businessReason ? (
                <p className="rk-metadata mt-2.5">
                  Business relevance: {opportunity.businessReason}
                </p>
              ) : null}

              {expanded ? (
                <EvidencePanel opportunity={opportunity} />
              ) : null}
            </div>
          </div>
        </div>

        {/* Status rail — same data, shared badge */}
        <div className="flex shrink-0 items-center gap-6 border-t border-rk-border pt-3 sm:gap-8 lg:min-w-[150px] lg:flex-col lg:items-end lg:justify-start lg:gap-4 lg:border-t-0 lg:pt-0">
          <div className="lg:text-right">
            <p className="rk-label">Status</p>
            <div className="mt-1.5">
              <StatusBadge
                status={String(opportunity.status || 'OPEN')}
              />
            </div>
          </div>

          <div className="lg:text-right">
            <p className="rk-label">Priority</p>
            <p className="mt-1.5 text-xs font-bold text-rk-ink">
              {formatLabel(opportunity.priority)}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

function EvidencePanel({
  opportunity,
}: {
  opportunity: UnifiedOpportunity;
}) {
  const metadata = opportunity.metadata || {};
  const entries = Object.entries(metadata).slice(0, 12);

  return (
    <div className="rk-animate-fade mt-4 rounded-rk-md border border-rk-border bg-rk-surface px-4 py-3.5 shadow-rk-sm">
      <p className="rk-label">Evidence</p>
      <dl className="mt-2.5 grid gap-x-6 gap-y-2.5 text-xs sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-rk-muted">Source</dt>
          <dd className="mt-0.5 font-medium text-rk-ink">
            {formatLabel(opportunity.source)}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-rk-muted">Type</dt>
          <dd className="mt-0.5 font-medium text-rk-ink">
            {formatLabel(opportunity.type)}
          </dd>
        </div>
        {opportunity.pageUrl && (
          <div className="sm:col-span-2">
            <dt className="font-semibold text-rk-muted">
              Affected page
            </dt>
            <dd className="rk-technical-value mt-0.5 !text-rk-ink">
              {opportunity.pageUrl}
            </dd>
          </div>
        )}
        <div>
          <dt className="font-semibold text-rk-muted">Source ID</dt>
          <dd className="rk-technical-value mt-0.5 break-all !text-rk-ink">
            {opportunity.sourceId}
          </dd>
        </div>
        {(opportunity.updatedAt || opportunity.createdAt) && (
          <div>
            <dt className="font-semibold text-rk-muted">Updated</dt>
            <dd className="mt-0.5 font-medium text-rk-ink">
              {formatDateTime(
                opportunity.updatedAt || opportunity.createdAt,
              )}
            </dd>
          </div>
        )}
        {entries.map(([key, value]) => (
          <div key={key}>
            <dt className="font-semibold text-rk-muted">
              {formatLabel(key)}
            </dt>
            <dd className="mt-0.5 break-words font-medium text-rk-ink">
              {formatMetadataValue(value)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="rk-metadata mt-3 border-t border-rk-border pt-2.5">
        Ownership is not tracked on opportunities yet; actions carry
        execution ownership once created.
      </p>
    </div>
  );
}

function formatLabel(value: unknown) {
  return String(value || '—')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/*
 * Core-loop cross-link: map an opportunity source back to its
 * existing RENKOO route. Unknown sources stay plain text.
 */
function sourceHref(source: unknown): string | null {
  const value = String(source || '').toUpperCase();
  if (value === 'COMPETITOR_COMPARISON') return '/competitors';
  if (value === 'BACKLINK') return '/backlinks';
  if (value === 'BUSINESS_BRAIN') return '/business-brain';
  if (value === 'CONTENT') return '/content';
  if (value === 'SEO_AUDIT') return '/technical-seo';
  if (value === 'GSC_SEO') return '/search-visibility';
  if (value === 'GEO' || value === 'GEO_AUDIT') return null;
  if (value === 'AEO' || value === 'AEO_AUDIT')
    return '/ai-visibility';
  return null;
}

function formatDateTime(value: unknown) {
  if (!value) return '—';
  try {
    return new Date(String(value)).toLocaleString();
  } catch {
    return String(value);
  }
}

function formatMetadataValue(value: unknown) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'string') {
    return value.length > 180 ? `${value.slice(0, 180)}…` : value;
  }
  try {
    const text = JSON.stringify(value);
    return text.length > 180 ? `${text.slice(0, 180)}…` : text;
  } catch {
    return '—';
  }
}

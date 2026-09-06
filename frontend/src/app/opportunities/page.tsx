'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

  if (loading || websitesLoading) {
    return <LoadingState />;
  }

  if (error && !data) {
    return (
      <main className="min-h-screen bg-[#f7f8fb] px-6 py-8 text-[#111827] md:px-10">
        <div className="mx-auto max-w-[1400px]">
          <PageHeader
            eyebrow="Growth intelligence"
            title="Opportunity Engine"
            description="One prioritized growth queue across RENKOO."
          />

          <div className="mt-8 border border-red-200 bg-white p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-red-500">
              Connection error
            </div>
            <div className="mt-2 text-sm text-red-700">{error}</div>
            {websiteId && (
              <button
                type="button"
                onClick={() => loadQueue(websiteId)}
                className="mt-4 border border-red-300 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  const summary = data?.summary;

  return (
    <main className="min-h-screen bg-[#f7f8fb] px-5 py-6 text-[#111827] md:px-8 lg:px-10">
      <div className="mx-auto max-w-[1440px]">
        <PageHeader
          eyebrow="Growth intelligence"
          title="Opportunity Engine"
          description="One prioritized growth queue across RENKOO, built only from measured workspace data."
          count={data?.total || 0}
        />

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6b7280]">
            Website
          </label>
          <select
            value={websiteId}
            onChange={(e) => handleWebsiteChange(e.target.value)}
            className="max-w-md border border-[#e5e7eb] bg-white px-3 py-2 text-sm outline-none"
          >
            {websites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search opportunities, pages, types..."
            className="w-full max-w-md border border-[#e5e7eb] bg-white px-3 py-2 text-sm outline-none sm:ml-auto"
          />
        </div>

        <section className="mt-6 grid grid-cols-2 gap-px overflow-hidden border border-[#e5e7eb] bg-[#e5e7eb] md:grid-cols-4">
          <SummaryCard
            label="Total opportunities"
            value={data?.total || 0}
            description="Persisted open and in-progress items only"
          />

          <SummaryCard
            label="High priority"
            value={summary?.high || 0}
            description="Requires attention first"
            emphasis="high"
          />

          <SummaryCard
            label="Medium"
            value={summary?.medium || 0}
            description="Meaningful growth potential"
          />

          <SummaryCard
            label="Low"
            value={summary?.low || 0}
            description="Useful optimization queue"
          />
        </section>

        <section className="mt-8 border border-[#e5e7eb] bg-white">
          <div className="flex flex-col gap-5 border-b border-[#e5e7eb] px-5 py-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6b7280]">
                Priority queue
              </div>
              <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em]">
                Growth opportunities
              </h2>
            </div>

            <div className="text-sm text-[#6b7280]">
              Showing{' '}
              <span className="font-semibold text-[#111827]">
                {filtered.length}
              </span>{' '}
              of {opportunities.length}
            </div>
          </div>

          <div className="space-y-4 border-b border-[#e5e7eb] px-5 py-4">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {SOURCE_FILTERS.map((item) => (
                <button
                  key={item.value}
                  onClick={() => setSourceFilter(item.value)}
                  className={`whitespace-nowrap border px-3.5 py-2 text-xs font-semibold transition ${
                    sourceFilter === item.value
                      ? 'border-[#111827] bg-[#111827] text-white'
                      : 'border-[#e5e7eb] bg-white text-[#4b5563] hover:border-[#9ca3af] hover:text-[#111827]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect
                label="Priority"
                value={priorityFilter}
                options={['ALL', 'HIGH', 'MEDIUM', 'LOW']}
                onChange={(value) =>
                  setPriorityFilter(value as PriorityFilter)
                }
              />
              <FilterSelect
                label="Status"
                value={statusFilter}
                options={['ALL', 'OPEN', 'IN_PROGRESS', 'COMPLETED']}
                onChange={(value) =>
                  setStatusFilter(value as StatusFilter)
                }
              />
              <FilterSelect
                label="Sort"
                value={sortMode}
                options={[
                  'MY_ROLE',
                  'PRIORITY',
                  'SCORE',
                  'RECENT',
                ]}
                onChange={(value) => setSortMode(value as SortMode)}
              />
            </div>

            {sortMode === 'MY_ROLE' && (
              <p className="mt-2 text-[11px] text-slate-500">
                Prioritized for{' '}
                {
                  PERSONA_META[effectivePersona]
                    .label
                }{' '}
                — engine scores and evidence
                are unchanged. Switch sort to
                see the raw engine order.
              </p>
            )}

            {actionError && (
              <div className="border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                {actionError}
              </div>
            )}
          </div>

          {filtered.length === 0 ? (
            <EmptyState filter={sourceFilter} />
          ) : (
            <div>
              {grouped.map((group) => (
                <div key={group.priority}>
                  <div className="border-b border-[#e5e7eb] bg-[#fafafa] px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#6b7280] md:px-6">
                    {formatLabel(group.priority)} priority —{' '}
                    {group.items.length}
                  </div>
                  {group.items.map((opportunity, index) => (
                    <OpportunityCard
                      key={opportunity.id}
                      opportunity={opportunity}
                      index={index}
                      expanded={Boolean(expandedMap[opportunity.id])}
                      actionLoading={Boolean(
                        actionLoadingMap[opportunity.id],
                      )}
                      actionSuccess={Boolean(
                        actionSuccessMap[opportunity.id],
                      )}
                      onToggleEvidence={() =>
                        setExpandedMap((prev) => ({
                          ...prev,
                          [opportunity.id]: !prev[opportunity.id],
                        }))
                      }
                      onCreateAction={() =>
                        handleCreateAction(opportunity)
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 border border-[#1f2937] bg-[#111827] text-white">
          <div className="grid gap-8 p-6 md:grid-cols-[1fr_auto] md:p-8">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-white" />
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d1d5db]">
                  RENKOO Intelligence
                </span>
              </div>

              <h2 className="mt-4 max-w-2xl text-2xl font-semibold tracking-[-0.03em]">
                Turn opportunities into measurable growth.
              </h2>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#9ca3af]">
                Persisted SEO, competitor, backlink, GEO, AEO and
                Business Brain signals in one queue. Completed and
                dismissed items stay out of the active queue.
              </p>
            </div>

            <div className="flex items-end">
              <div className="border border-[#374151] px-4 py-3 text-right">
                <div className="text-[11px] uppercase tracking-[0.14em] text-[#9ca3af]">
                  Active queue
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {filtered.length}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-[#6b7280]">
      <span className="font-semibold uppercase tracking-[0.12em]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-[#e5e7eb] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#111827] outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {formatLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  count,
}: {
  eyebrow: string;
  title: string;
  description: string;
  count?: number;
}) {
  return (
    <header className="flex flex-col gap-5 border-b border-[#e5e7eb] pb-7 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6b7280]">
          {eyebrow}
        </div>

        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#111827] md:text-[36px]">
          {title}
        </h1>

        <p className="mt-2 max-w-xl text-sm leading-6 text-[#6b7280]">
          {description}
        </p>
      </div>

      {typeof count === 'number' && (
        <div className="border border-[#e5e7eb] bg-white px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9ca3af]">
            Opportunities
          </div>
          <div className="mt-1 text-xl font-semibold text-[#111827]">
            {count}
          </div>
        </div>
      )}
    </header>
  );
}

function SummaryCard({
  label,
  value,
  description,
  emphasis,
}: {
  label: string;
  value: number;
  description: string;
  emphasis?: 'high';
}) {
  return (
    <div className="bg-white p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6b7280]">
          {label}
        </div>

        {emphasis === 'high' && (
          <span className="h-2 w-2 rounded-full bg-[#111827]" />
        )}
      </div>

      <div className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#111827]">
        {value}
      </div>

      <div className="mt-2 text-xs leading-5 text-[#9ca3af]">
        {description}
      </div>
    </div>
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

  return (
    <article className="group border-b border-[#e5e7eb] px-5 py-5 last:border-b-0 md:px-6 md:py-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:gap-8">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {sourceHref(opportunity.source) ? (
              <Link
                href={
                  sourceHref(opportunity.source) as string
                }
                className="border border-[#dfe2e6] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#111827] underline hover:border-[#9ca3af]"
              >
                {formatLabel(opportunity.source)}
              </Link>
            ) : (
              <SourceBadge source={opportunity.source} />
            )}

            <PriorityBadge priority={priority} />

            {opportunity.businessRelevance && (
              <span
                title={
                  opportunity.businessReason ||
                  'Aligned with business priority'
                }
                className="border border-[#111827] bg-[#eef2ff] px-2.5 py-1 text-[11px] font-semibold text-[#111827]"
              >
                Business priority: {formatLabel(opportunity.businessRelevance)}
              </span>
            )}

            <span className="border border-[#e5e7eb] bg-[#fafafa] px-2.5 py-1 text-[11px] font-medium text-[#6b7280]">
              Score {opportunity.score}
            </span>

            {opportunity.impact && (
              <span className="border border-[#e5e7eb] bg-white px-2.5 py-1 text-[11px] font-medium text-[#6b7280]">
                Impact {formatLabel(opportunity.impact)}
              </span>
            )}

            {opportunity.effort && (
              <span className="border border-[#e5e7eb] bg-white px-2.5 py-1 text-[11px] font-medium text-[#6b7280]">
                Effort {formatLabel(opportunity.effort)}
              </span>
            )}
          </div>

          <div className="flex gap-4">
            <div className="hidden pt-1 text-xs font-medium tabular-nums text-[#c4c8ce] md:block">
              {String(index + 1).padStart(2, '0')}
            </div>

            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold leading-6 tracking-[-0.015em] text-[#111827]">
                {opportunity.title}
              </h2>

              <p className="mt-2 max-w-4xl text-sm leading-6 text-[#6b7280]">
                {opportunity.description}
              </p>

              {opportunity.recommendation && (
                <div className="mt-5 border-l-2 border-[#111827] bg-[#fafafa] px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6b7280]">
                    Recommended action
                  </div>

                  <div className="mt-1.5 text-sm font-medium leading-6 text-[#374151]">
                    {opportunity.recommendation}
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onToggleEvidence}
                  className="border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-semibold text-[#374151] hover:border-[#9ca3af]"
                >
                  {expanded ? 'Hide evidence' : 'View evidence'}
                </button>
                <button
                  type="button"
                  onClick={onCreateAction}
                  disabled={actionLoading || actionSuccess}
                  className={`px-3 py-1.5 text-xs font-semibold transition ${
                    actionSuccess
                      ? 'cursor-default bg-green-700 text-white'
                      : 'bg-[#111827] text-white hover:bg-black disabled:opacity-60'
                  }`}
                >
                  {actionLoading
                    ? 'Creating...'
                    : actionSuccess
                      ? 'Action created'
                      : isPersistedRecommendation(opportunity)
                        ? 'Create action from recommendation'
                        : 'Create action'}
                </button>
                {actionSuccess && (
                  <Link
                    href="/actions"
                    className="border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-semibold text-[#111827] hover:border-[#9ca3af]"
                  >
                    Open in Actions
                  </Link>
                )}
              </div>

              {expanded && (
                <EvidencePanel opportunity={opportunity} />
              )}
            </div>
          </div>
        </div>

        <div className="flex items-start justify-between gap-6 border-t border-[#f0f1f3] pt-4 lg:min-w-[180px] lg:flex-col lg:items-end lg:border-t-0 lg:pt-0">
          <div className="text-left lg:text-right">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">
              Status
            </div>

            <div className="mt-1.5 text-xs font-semibold text-[#374151]">
              {formatLabel(opportunity.status)}
            </div>
          </div>

          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">
              Priority
            </div>

            <div className="mt-1.5 text-xs font-semibold text-[#111827]">
              {formatLabel(opportunity.priority)}
            </div>
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
    <div className="mt-4 border border-[#e5e7eb] bg-white px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">
        Evidence
      </div>
      <dl className="mt-2 grid gap-2 text-xs text-[#4b5563] sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-[#9ca3af]">Source</dt>
          <dd className="mt-0.5 text-[#111827]">
            {formatLabel(opportunity.source)}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-[#9ca3af]">Type</dt>
          <dd className="mt-0.5 text-[#111827]">
            {formatLabel(opportunity.type)}
          </dd>
        </div>
        {opportunity.pageUrl && (
          <div className="sm:col-span-2">
            <dt className="font-semibold text-[#9ca3af]">
              Affected page
            </dt>
            <dd className="mt-0.5 break-all text-[#111827]">
              {opportunity.pageUrl}
            </dd>
          </div>
        )}
        <div>
          <dt className="font-semibold text-[#9ca3af]">Source ID</dt>
          <dd className="mt-0.5 break-all text-[#111827]">
            {opportunity.sourceId}
          </dd>
        </div>
        {(opportunity.updatedAt || opportunity.createdAt) && (
          <div>
            <dt className="font-semibold text-[#9ca3af]">Updated</dt>
            <dd className="mt-0.5 text-[#111827]">
              {formatDateTime(
                opportunity.updatedAt || opportunity.createdAt,
              )}
            </dd>
          </div>
        )}
        {entries.map(([key, value]) => (
          <div key={key}>
            <dt className="font-semibold text-[#9ca3af]">
              {formatLabel(key)}
            </dt>
            <dd className="mt-0.5 break-words text-[#111827]">
              {formatMetadataValue(value)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[11px] leading-5 text-[#9ca3af]">
        Ownership is not tracked on opportunities yet; actions carry
        execution ownership once created.
      </p>
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  return (
    <span className="border border-[#dfe2e6] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#4b5563]">
      {formatLabel(source)}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const isHigh = priority === 'HIGH';
  const isMedium = priority === 'MEDIUM';

  return (
    <span
      className={`px-2.5 py-1 text-[11px] font-semibold ${
        isHigh
          ? 'bg-[#111827] text-white'
          : isMedium
            ? 'border border-[#d1d5db] bg-[#f3f4f6] text-[#374151]'
            : 'border border-[#e5e7eb] bg-white text-[#6b7280]'
      }`}
    >
      {formatLabel(priority)}
    </span>
  );
}

function EmptyState({ filter }: { filter: SourceFilter }) {
  const label =
    SOURCE_FILTERS.find((item) => item.value === filter)?.label ||
    'these filters';

  return (
    <div className="px-6 py-16 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center border border-[#e5e7eb] bg-[#fafafa] text-sm font-semibold text-[#6b7280]">
        —
      </div>

      <h2 className="mt-4 text-sm font-semibold text-[#111827]">
        No opportunities found
      </h2>

      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6b7280]">
        No persisted opportunities match {label.toLowerCase()} right
        now. Run audits, crawls, and intelligence scans to generate
        real evidence-backed items.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <main className="min-h-screen bg-[#f7f8fb] px-5 py-8 md:px-10">
      <div className="mx-auto max-w-[1440px] animate-pulse">
        <div className="h-3 w-28 bg-[#e5e7eb]" />
        <div className="mt-4 h-10 w-72 bg-[#e5e7eb]" />
        <div className="mt-3 h-4 w-96 max-w-full bg-[#e5e7eb]" />

        <div className="mt-8 grid grid-cols-2 gap-px bg-[#e5e7eb] md:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-36 bg-white" />
          ))}
        </div>

        <div className="mt-8 h-24 bg-white" />
        <div className="mt-1 space-y-px bg-[#e5e7eb]">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-44 bg-white" />
          ))}
        </div>
      </div>
    </main>
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

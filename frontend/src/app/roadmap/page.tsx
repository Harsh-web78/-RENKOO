'use client';

/*
 * RENKOO Search Growth Roadmap 1.0 — "What exactly
 * should I do next?" Website-level prioritized,
 * executable roadmap composed from existing RENKOO
 * evidence (Strategy 5.0 + Why-Not-#1 + content +
 * links + recommendations + actions + crawl). One
 * composed request (GET /keywords/roadmap). Scores
 * nothing new, guarantees nothing — planning
 * objectives only ("Target: Top 3").
 *
 * Hierarchy: DO THIS FIRST → NEXT 5 MOVES →
 * TIMELINE → PROGRESS → UNLOCKS. Source order
 * matches mobile priority.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  EvidenceList,
  PageHeader,
  Panel,
  PrimaryButton,
  SecondaryButton,
  PriorityChip,
  StatusChip,
  RecommendationCallout,
} from '@/components/ui';
import {
  createAction,
  getRoadmap,
  getWebsites,
  type RoadmapItem,
  type RoadmapResponse,
  type Website,
} from '@/lib/api';

/* ---------- formatting (display only) ---------- */

function compactUrl(url: unknown): string {
  const raw = String(url ?? '').trim();
  if (!raw) return '—';
  return raw
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .slice(0, 72);
}

function fmtRank(position: unknown): string {
  const n = Number(position);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `#${n.toFixed(1).replace(/\.0$/, '')}`;
}

function kindLabel(kind: unknown): string {
  switch (String(kind ?? '')) {
    case 'IMPROVE_PAGE':
      return 'Improve page';
    case 'OPTIMIZE_PAGE':
      return 'Optimize page';
    case 'CREATE_PAGE':
      return 'Create content';
    case 'CONSOLIDATE_PAGES':
      return 'Consolidate';
    case 'PROTECT_PAGE':
      return 'Protect';
    case 'REFRESH_PAGE':
      return 'Refresh';
    case 'BUILD_INTERNAL_SUPPORT':
      return 'Internal support';
    case 'FIX_TECHNICAL_BLOCKER':
      return 'Technical fix';
    case 'TRACK_KEYWORD':
      return 'Track';
    default:
      return 'Monitor';
  }
}

function statusLabel(status: unknown): string {
  switch (String(status ?? '')) {
    case 'IN_PROGRESS':
      return 'In progress';
    case 'TODO':
      return 'Action open';
    case 'DONE':
      return 'Completed';
    case 'DISMISSED':
      return 'Dismissed';
    default:
      return 'Not started';
  }
}

function ImpactEffort({
  impact,
  effort,
}: {
  impact: unknown;
  effort: unknown;
}) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-rk-secondary">
      <span>
        Impact:{' '}
        <strong className="font-semibold text-rk-ink">
          {String(impact ?? '—')}
        </strong>
      </span>
      <span aria-hidden className="text-rk-muted">
        ·
      </span>
      <span>
        Effort:{' '}
        <strong className="font-semibold text-rk-ink">
          {String(effort ?? '—')}
        </strong>
      </span>
    </span>
  );
}

export default function RoadmapPage() {
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [keyword, setKeyword] = useState('');
  const [keywordFilter, setKeywordFilter] = useState('');
  const [roadmap, setRoadmap] =
    useState<RoadmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewAll, setViewAll] = useState(false);
  const [startingId, setStartingId] = useState('');
  const [startError, setStartError] = useState('');

  const load = useCallback(
    async (siteId: string, kw?: string) => {
      if (!siteId) return;
      setLoading(true);
      setError('');
      try {
        const res = await getRoadmap({
          websiteId: siteId,
          keyword: kw?.trim() ? kw.trim() : undefined,
        });
        setRoadmap(res);
      } catch (err: any) {
        setError(
          err?.message || 'Growth roadmap failed to load.',
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
        if (valid) void load(valid);
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
    setRoadmap(null);
    setViewAll(false);
    if (typeof window !== 'undefined') {
      if (id) localStorage.setItem('renkoo_website_id', id);
      else localStorage.removeItem('renkoo_website_id');
    }
    if (id) void load(id, keywordFilter);
  }

  function handleKeywordSearch() {
    setRoadmap(null);
    setViewAll(false);
    if (websiteId) void load(websiteId, keyword);
    setKeywordFilter(keyword.trim());
  }

  function handleClearKeyword() {
    setKeyword('');
    setKeywordFilter('');
    setRoadmap(null);
    setViewAll(false);
    if (websiteId) void load(websiteId);
  }

  async function handleStart(item: RoadmapItem) {
    if (!websiteId || startingId) return;
    setStartingId(item.id);
    setStartError('');
    try {
      if (item.action?.id) {
        if (item.cta?.href) router.push(item.cta.href);
        return;
      }
      await createAction({
        websiteId,
        recommendationId: item.recommendation?.id,
        type: item.kind,
        title: item.title,
        description: `${item.why} Evidence: ${item.evidence.map((e) => `${e.source} — ${e.label}`).join('; ').slice(0, 500)}`,
        url: item.targetPage ?? undefined,
        priority: item.priority,
        metadata: {
          source: 'ROADMAP',
          roadmapIdentity: item.measurement.identityKey,
          strategyKeyword: item.keyword,
          targetPage: item.targetPage,
        },
      });
      if (item.cta?.href) router.push(item.cta.href);
      else await load(websiteId, keywordFilter);
    } catch (err: any) {
      setStartError(
        err?.message || 'Could not start this action.',
      );
    } finally {
      setStartingId('');
    }
  }

  const activeWebsite =
    websites.find((w) => w.id === websiteId) ?? null;
  const first = roadmap?.doThisFirst.item ?? null;
  const priorities = roadmap?.priorities ?? [];
  const horizons = roadmap?.horizons ?? null;
  const allOrdered = horizons
    ? [
        ...horizons.now,
        ...horizons.next7Days,
        ...horizons.next30Days,
        ...horizons.ongoing,
      ]
    : [];
  const visiblePriorities = viewAll
    ? allOrdered.filter((i) => !roadmap?.priorities.some((p) => p.id === i.id))
    : [];
  const depReason = (id: string) =>
    roadmap?.dependencies.find((d) => d.from === id)?.reason ??
    null;

  return (
    <AppShell
      mobileOpen={navOpen}
      onClose={() => setNavOpen(false)}
      onMenu={() => setNavOpen(true)}
    >
      <PageHeader
        eyebrow="Search Growth Roadmap"
        title="What exactly should I do next?"
        description="Prioritized from your current rankings, search demand, content, technical health and observed opportunities — evidence-backed, executable, measurable."
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <DataSourceBadge
              source="RENKOO strategy + diagnosis"
              connected={(roadmap?.currentState.candidates ?? 0) > 0}
            />
            {roadmap ? (
              <FreshnessBadge
                label={`Generated ${new Date(roadmap.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
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

      {/* Website + keyword scope */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="roadmap-website">
          Website
        </label>
        <select
          id="roadmap-website"
          value={websiteId}
          onChange={(e) => handleWebsiteChange(e.target.value)}
          className="rk-focusable min-h-[44px] min-w-0 flex-1 rounded-rk-md border border-rk-border bg-rk-surface px-3 text-sm text-rk-ink"
        >
          <option value="">Select a website…</option>
          {websites.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <div className="flex min-w-0 flex-1 gap-2">
          <label className="sr-only" htmlFor="roadmap-keyword">
            Focus keyword (optional)
          </label>
          <input
            id="roadmap-keyword"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleKeywordSearch();
            }}
            placeholder="Focus on one keyword (optional)…"
            className="rk-focusable min-h-[44px] min-w-0 flex-1 rounded-rk-md border border-rk-border bg-rk-surface px-3 text-sm text-rk-ink"
          />
          <SecondaryButton onClick={handleKeywordSearch}>
            Apply
          </SecondaryButton>
          {keywordFilter ? (
            <SecondaryButton onClick={handleClearKeyword}>
              Clear
            </SecondaryButton>
          ) : null}
        </div>
      </div>

      {loading ? (
        <>
          <LoadingBlock title="Composing your roadmap…" />
          <LoadingBlock title="Ordering priorities…" />
        </>
      ) : error ? (
        <ErrorState
          title="Roadmap unavailable"
          description={error}
          onRetry={() => websiteId && void load(websiteId, keywordFilter)}
        />
      ) : !websiteId ? (
        <EmptyState
          title="Select a website"
          description="Choose a website to see its prioritized growth roadmap."
        />
      ) : !roadmap ? (
        <EmptyState
          title="No roadmap yet"
          description="RENKOO could not compose a roadmap for this website right now."
        />
      ) : (
        <>
          {/* HERO: current → opportunity → next */}
          <Panel>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide text-rk-muted">
                  Current position
                </p>
                <p className="mt-1 text-xl font-bold text-rk-ink">
                  {roadmap.currentState.candidates} tracked moves
                </p>
                <p className="mt-0.5 text-xs text-rk-secondary">
                  {roadmap.currentState.highPriority} high-priority
                  {roadmap.progress.completed > 0
                    ? ` · ${roadmap.progress.completed} completed`
                    : ''}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide text-rk-muted">
                  Biggest opportunity
                </p>
                <p className="mt-1 truncate text-xl font-bold text-rk-ink">
                  {first ? first.title : '—'}
                </p>
                <p className="mt-0.5 break-words text-xs text-rk-secondary">
                  {first?.keyword
                    ? `“${first.keyword}”`
                    : 'Evidence-backed'}
                  {first?.ranking
                    ? ` · now ${fmtRank(first.ranking.current)}`
                    : ''}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide text-rk-muted">
                  Next move
                </p>
                <p className="mt-1 text-xl font-bold text-rk-ink">
                  {first ? kindLabel(first.kind) : '—'}
                </p>
                <p className="mt-0.5 break-all text-xs text-rk-secondary">
                  {first?.targetPage
                    ? compactUrl(first.targetPage)
                    : (roadmap.doThisFirst.reason ?? '').slice(0, 90)}
                </p>
              </div>
            </div>
          </Panel>

          {/* DO THIS FIRST */}
          <div className="mt-4">
            {first ? (
              <Panel>
                <p className="text-[11px] font-bold uppercase tracking-wide text-rk-muted">
                  Do this first
                </p>
                <h2 className="mt-1 text-2xl font-bold leading-tight text-rk-ink">
                  {first.title}
                </h2>
                {first.ranking ? (
                  <p className="mt-1 text-sm font-semibold text-rk-ink">
                    {fmtRank(first.ranking.current)}{' '}
                    <span aria-hidden className="text-rk-muted">
                      →
                    </span>{' '}
                    Target: {first.ranking.target}
                  </p>
                ) : null}
                <p className="mt-2 max-w-2xl text-sm leading-6 text-rk-ink">
                  {first.why}
                </p>
                {first.observedChange ? (
                  <p className="mt-1 text-xs text-rk-secondary">
                    {first.observedChange}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <PriorityChip priority={first.priority} />
                  <StatusChip status={statusLabel(first.executionStatus)} />
                  <ImpactEffort
                    impact={first.impact}
                    effort={first.effort}
                  />
                </div>
                <div className="mt-3">
                  <EvidenceList
                    items={first.evidence.map((e) => ({
                      text: e.label,
                      source: e.source,
                    }))}
                  />
                </div>
                {depReason(first.id) ? (
                  <p className="mt-2 text-xs text-rk-secondary">
                    Depends on earlier work: {depReason(first.id)}
                  </p>
                ) : null}
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <PrimaryButton
                    onClick={() => void handleStart(first)}
                    disabled={startingId === first.id}
                  >
                    {startingId === first.id
                      ? 'Starting…'
                      : first.action
                        ? 'Continue action'
                        : 'Start action'}
                  </PrimaryButton>
                  {first.cta ? (
                    <Link
                      href={first.cta.href}
                      className="rk-focusable inline-flex min-h-[44px] items-center justify-center gap-1 rounded-rk-md border border-rk-border px-4 text-sm font-semibold text-rk-ink"
                    >
                      {first.cta.label}
                    </Link>
                  ) : first.planNote ? (
                    <span className="text-xs text-rk-secondary">
                      {first.planNote}
                    </span>
                  ) : null}
                </div>
                {startError && startingId === first.id ? (
                  <p className="mt-2 text-xs text-rk-danger">
                    {startError}
                  </p>
                ) : null}
              </Panel>
            ) : (
              <EmptyState
                title="No single first move yet"
                description={roadmap.doThisFirst.reason}
              />
            )}
          </div>

          {startError && !first ? (
            <p className="mt-2 text-xs text-rk-danger">
              {startError}
            </p>
          ) : null}

          {/* NEXT 5 MOVES */}
          {priorities.length > 0 ? (
            <section aria-label="Your next 5 moves" className="mt-6">
              <h2 className="text-lg font-bold text-rk-ink">
                Your next 5 moves
              </h2>
              <p className="mt-0.5 text-xs text-rk-secondary">
                Ordered by dependencies, then priority, then
                observed demand. No ranking guarantees —
                evidence-backed next steps.
              </p>
              <ol className="mt-3 space-y-3">
                {priorities.map((item, index) => (
                  <li key={item.id}>
                    <Panel>
                      <div className="flex items-start gap-3">
                        <span
                          aria-hidden
                          className="mt-0.5 w-7 shrink-0 text-lg font-bold text-rk-muted"
                        >
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <PriorityChip
                              priority={item.priority}
                            />
                            <span className="text-xs font-bold uppercase tracking-wide text-rk-secondary">
                              {kindLabel(item.kind)}
                            </span>
                            <StatusChip
                              status={statusLabel(
                                item.executionStatus,
                              )}
                            />
                          </div>
                          <p className="mt-1 break-words text-sm font-bold text-rk-ink">
                            {item.title}
                          </p>
                          {item.targetPage ? (
                            <p className="break-all text-xs text-rk-secondary">
                              {compactUrl(item.targetPage)}
                            </p>
                          ) : null}
                          <p className="mt-1 text-sm leading-6 text-rk-ink">
                            {item.why}
                          </p>
                          <div className="mt-1.5">
                            <ImpactEffort
                              impact={item.impact}
                              effort={item.effort}
                            />
                          </div>
                          {item.ranking ? (
                            <p className="mt-1 text-xs font-semibold text-rk-ink">
                              {fmtRank(item.ranking.current)}{' '}
                              <span
                                aria-hidden
                                className="text-rk-muted"
                              >
                                →
                              </span>{' '}
                              Target: {item.ranking.target}
                            </p>
                          ) : null}
                          {depReason(item.id) ? (
                            <p className="mt-1 text-xs text-rk-secondary">
                              Depends on earlier work:{' '}
                              {depReason(item.id)}
                            </p>
                          ) : null}
                          <details className="mt-1.5">
                            <summary className="rk-focusable inline-block min-h-[44px] cursor-pointer py-2 text-xs font-semibold text-rk-info">
                              Evidence
                            </summary>
                            <div className="pb-1">
                              <EvidenceList
                                items={item.evidence.map(
                                  (e) => ({
                                    text: e.label,
                                    source: e.source,
                                  }),
                                )}
                              />
                            </div>
                          </details>
                          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                            <SecondaryButton
                              onClick={() =>
                                void handleStart(item)
                              }
                            >
                              {startingId === item.id
                                ? 'Starting…'
                                : item.action
                                  ? 'Continue action'
                                  : 'Start action'}
                            </SecondaryButton>
                            {item.cta ? (
                              <Link
                                href={item.cta.href}
                                className="rk-focusable inline-flex min-h-[44px] items-center text-sm font-semibold text-rk-info underline underline-offset-2"
                              >
                                {item.cta.label}
                              </Link>
                            ) : item.planNote ? (
                              <span className="text-xs text-rk-secondary">
                                {item.planNote}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </Panel>
                  </li>
                ))}
              </ol>
              {allOrdered.length > priorities.length ? (
                <div className="mt-3">
                  <SecondaryButton
                    onClick={() => setViewAll((v) => !v)}
                  >
                    {viewAll
                      ? 'Show top 5 only'
                      : `View all (${allOrdered.length})`}
                  </SecondaryButton>
                </div>
              ) : null}
              {viewAll && visiblePriorities.length > 0 ? (
                <ol className="mt-3 space-y-3">
                  {visiblePriorities.map((item) => (
                    <li key={item.id}>
                      <Panel>
                        <div className="flex flex-wrap items-center gap-2">
                          <PriorityChip
                            priority={item.priority}
                          />
                          <span className="text-xs font-bold uppercase tracking-wide text-rk-secondary">
                            {kindLabel(item.kind)}
                          </span>
                          <StatusChip
                            status={statusLabel(
                              item.executionStatus,
                            )}
                          />
                        </div>
                        <p className="mt-1 break-words text-sm font-bold text-rk-ink">
                          {item.title}
                        </p>
                        <p className="mt-0.5 text-sm leading-6 text-rk-ink">
                          {item.why}
                        </p>
                        <div className="mt-2">
                          <SecondaryButton
                            onClick={() =>
                              void handleStart(item)
                            }
                          >
                            {item.action
                              ? 'Continue action'
                              : 'Start action'}
                          </SecondaryButton>
                        </div>
                      </Panel>
                    </li>
                  ))}
                </ol>
              ) : null}
            </section>
          ) : (
            <div className="mt-6">
              <EmptyState
                title="No high-priority growth actions right now"
                description="No high-priority growth actions are currently supported by enough evidence. Connect Search Console, run a crawl, or build strategy coverage to unlock the roadmap."
              />
            </div>
          )}

          {/* TIMELINE */}
          {horizons ? (
            <section aria-label="Roadmap timeline" className="mt-6">
              <h2 className="text-lg font-bold text-rk-ink">
                Timeline
              </h2>
              <div className="mt-3 space-y-4">
                {(
                  [
                    ['Now', horizons.now],
                    ['Next 7 days', horizons.next7Days],
                    ['Next 30 days', horizons.next30Days],
                    ['Ongoing', horizons.ongoing],
                  ] as Array<[string, RoadmapItem[]]>
                ).map(([label, items]) => (
                  <div key={label}>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-rk-muted">
                      {label} · {items.length}
                    </p>
                    {items.length === 0 ? (
                      <p className="mt-1 text-xs text-rk-secondary">
                        Nothing scheduled here.
                      </p>
                    ) : (
                      <ul className="mt-1.5 space-y-1.5 border-l-2 border-rk-border pl-3">
                        {items.map((item) => (
                          <li
                            key={item.id}
                            className="min-w-0 rounded-rk-sm bg-rk-soft px-3 py-2"
                          >
                            <p className="break-words text-sm font-semibold text-rk-ink">
                              {item.title}
                            </p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-rk-secondary">
                              <span className="font-semibold">
                                {item.priority}
                              </span>
                              <span aria-hidden>·</span>
                              <span>
                                {kindLabel(item.kind)}
                              </span>
                              <span aria-hidden>·</span>
                              <span>
                                {statusLabel(
                                  item.executionStatus,
                                )}
                              </span>
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* PROGRESS */}
          <div className="mt-6">
            <Panel>
              <h2 className="text-sm font-bold text-rk-ink">
                Progress
              </h2>
              <p className="mt-1 text-sm text-rk-ink">
                {roadmap.progress.completed} of{' '}
                {roadmap.progress.total} actions completed
                {roadmap.progress.inProgress > 0
                  ? ` · ${roadmap.progress.inProgress} in progress`
                  : ''}
              </p>
              <p className="mt-1 text-xs text-rk-secondary">
                Search result:{' '}
                {roadmap.progress.searchResult} —{' '}
                {roadmap.progress.searchResultNote}
              </p>
            </Panel>
          </div>

          {/* UNLOCKS */}
          {roadmap.unavailable.length > 0 ? (
            <div className="mt-4">
              <RecommendationCallout
                title="What would unlock more of the roadmap"
                text={roadmap.unavailable
                  .map((u) => u.unlocks)
                  .slice(0, 3)
                  .join(' ')}
              />
            </div>
          ) : null}
        </>
      )}
    </AppShell>
  );
}

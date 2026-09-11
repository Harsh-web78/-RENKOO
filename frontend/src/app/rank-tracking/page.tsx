'use client';

/*
 * RENKOO — Rank Intelligence 2.0 (Phase 31).
 * WHERE DO I RANK → WHAT CHANGED → WHICH PAGE →
 * WHY IT MATTERS → NEXT ACTION.
 *
 * Hierarchy: SEARCH VISIBILITY → RANK MOVEMENT →
 * KEYWORD TABLE → RANKING PAGE → WHY IT MATTERS →
 * NEXT ACTION. GSC POSITION vs TRACKED POSITION stay
 * labeled as DIFFERENT_MEASUREMENT_CONTEXT. Missing
 * history is a visible gap — never interpolated.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getWebsites,
  getTrackingOverview,
  listTrackedKeywords,
  addTrackedKeywords,
  getTrackedKeyword,
  getTrackedKeywordHistory,
  updateTrackedKeyword,
  startTrackingRun,
  listTrackingRuns,
  listTrackingSchedules,
  createTrackingSchedule,
  updateTrackingSchedule,
  deleteTrackingSchedule,
  getTrackingDigest,
  getTrackingPreferences,
  setTrackingScope,
  muteTracking,
  unmuteTracking,
  resolveReversedAlerts,
  getTrackingObservability,
  getTrackingPages,
  getTrackingCompetitors,
  evaluateTrackingAlerts,
  getTrackingCommandSignals,
  type TrackedKeywordRow,
  type TrackedKeywordDetail,
  type TrackingScheduleRow,
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
  LoadingBlock,
  ErrorState,
  EmptyState,
  InsightBlock,
  NextAction,
  type DataTableColumn,
} from '@/components/ui';

type Tab = 'keywords' | 'pages' | 'competitors' | 'runs' | 'schedule';

function fmtPos(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `#${v}`;
}

function movementLabel(m: string): string {
  switch (m) {
    case 'GAINED':
      return '▲ Gained';
    case 'LOST':
      return '▼ Lost';
    case 'STABLE':
      return 'Stable';
    case 'NEW':
      return 'New';
    case 'DROPPED_OUT':
      return 'Dropped out';
    case 'RETURNED':
      return 'Returned';
    default:
      return 'Unknown';
  }
}

export default function RankTrackingPage() {
  const [navOpen, setNavOpen] = useState(false);
  const [websites, setWebsites] = useState<Array<{ id: string; name?: string; url?: string }>>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [tab, setTab] = useState<Tab>('keywords');
  const [overview, setOverview] = useState<any>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState('');
  const [rows, setRows] = useState<TrackedKeywordRow[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [search, setSearch] = useState('');
  const [device, setDevice] = useState('');
  const [origin, setOrigin] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [detail, setDetail] = useState<TrackedKeywordDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [windowDays, setWindowDays] = useState(28);
  const [addOpen, setAddOpen] = useState(false);
  const [addText, setAddText] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addMsg, setAddMsg] = useState('');
  const [runBusy, setRunBusy] = useState(false);
  const [runMsg, setRunMsg] = useState('');
  const [runs, setRuns] = useState<any[]>([]);
  const [pages, setPages] = useState<any[]>([]);
  const [competitors, setCompetitors] = useState<any>(null);
  const [signals, setSignals] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<TrackingScheduleRow[]>([]);
  const [digest, setDigest] = useState<any>(null);
  const [obs, setObs] = useState<any>(null);
  const [prefs, setPrefs] = useState<any>(null);
  const [schedBusy, setSchedBusy] = useState(false);
  const [schedMsg, setSchedMsg] = useState('');
  const [muteKeyword, setMuteKeyword] = useState('');

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
          stored && list.some((s: any) => s.id === stored)
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

  const refresh = useCallback(async () => {
    if (!websiteId) return;
    setOverviewLoading(true);
    setOverviewError('');
    setListLoading(true);
    setListError('');
    try {
      const [ov, list, sig] = await Promise.all([
        getTrackingOverview(websiteId),
        listTrackedKeywords(websiteId, {
          isActive: activeOnly ? true : undefined,
          device: device || undefined,
          origin: origin || undefined,
          search: search || undefined,
          pageNum: 1,
          pageSize: 50,
        }),
        getTrackingCommandSignals(websiteId).catch(() => ({ signals: [] })),
      ]);
      setOverview(ov);
      setRows(list.keywords ?? []);
      setTotal(list.total ?? 0);
      setSignals(sig.signals ?? []);
    } catch (e: any) {
      setOverviewError(e?.message || 'Failed to load rank intelligence.');
      setListError(e?.message || 'Failed to load tracked keywords.');
    } finally {
      setOverviewLoading(false);
      setListLoading(false);
    }
  }, [websiteId, activeOnly, device, origin, search]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!websiteId) return;
    if (tab === 'runs') {
      listTrackingRuns(websiteId)
        .then((r) => setRuns(Array.isArray(r) ? r : []))
        .catch(() => setRuns([]));
    }
    if (tab === 'pages') {
      getTrackingPages(websiteId)
        .then((p) => setPages(p.pages ?? []))
        .catch(() => setPages([]));
    }
    if (tab === 'competitors') {
      getTrackingCompetitors(websiteId)
        .then(setCompetitors)
        .catch(() => setCompetitors(null));
    }
    if (tab === 'schedule') {
      void refreshSchedule();
    }
  }, [tab, websiteId]);

  async function refreshSchedule() {
    if (!websiteId) return;
    try {
      const [s, d, o, p] = await Promise.all([
        listTrackingSchedules(websiteId),
        getTrackingDigest(websiteId).catch(() => null),
        getTrackingObservability(websiteId).catch(() => null),
        getTrackingPreferences(websiteId).catch(() => null),
      ]);
      setSchedules(s.schedules ?? []);
      setDigest(d);
      setObs(o);
      setPrefs(p);
    } catch {
      /* panels show empty states honestly */
    }
  }

  async function handleCreateSchedule(cadence: string) {
    if (!websiteId || schedBusy) return;
    setSchedBusy(true);
    setSchedMsg('');
    try {
      await createTrackingSchedule({ websiteId, cadence });
      setSchedMsg(`Daily recurring tracking ${cadence === 'WEEKLY' ? 'weekly' : 'daily'} schedule saved. External cron drives due → execute → recover.`);
      void refreshSchedule();
    } catch (e: any) {
      setSchedMsg(e?.message || 'Could not save schedule.');
    } finally {
      setSchedBusy(false);
    }
  }

  async function handleToggleSchedule(row: TrackingScheduleRow) {
    try {
      await updateTrackingSchedule(row.id, {
        websiteId,
        isActive: !row.isActive,
      });
      void refreshSchedule();
    } catch {
      /* list refresh shows truth */
    }
  }

  async function handleMuteKeyword() {
    const kw = muteKeyword.trim();
    if (!websiteId || !kw) return;
    try {
      await muteTracking({ websiteId, keyword: kw });
      setMuteKeyword('');
      void refreshSchedule();
    } catch {
      /* preferences reload shows truth */
    }
  }

  async function openDetail(id: string, days = windowDays) {
    if (!websiteId) return;
    setDetailLoading(true);
    try {
      const d =
        days === 28
          ? await getTrackedKeyword(id, websiteId)
          : await getTrackedKeywordHistory(id, websiteId, days);
      setDetail(d);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleAdd() {
    if (!websiteId || addBusy) return;
    const keywords = addText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (keywords.length === 0) {
      setAddMsg('Paste at least one keyword (one per line).');
      return;
    }
    setAddBusy(true);
    setAddMsg('');
    try {
      const res = await addTrackedKeywords({
        websiteId,
        items: keywords.map((keyword) => ({
          keyword,
          origin: 'MANUAL',
        })),
      });
      setAddMsg(
        `${res.created} tracked, ${res.duplicates} duplicate${res.duplicates === 1 ? '' : 's'} skipped.`,
      );
      setAddText('');
      void refresh();
    } catch (e: any) {
      setAddMsg(e?.message || 'Could not add keywords.');
    } finally {
      setAddBusy(false);
    }
  }

  async function handleRun() {
    if (!websiteId || runBusy) return;
    setRunBusy(true);
    setRunMsg('');
    try {
      const run = await startTrackingRun({ websiteId });
      setRunMsg(
        `Run ${run.status}: ${run.succeeded} observed, ${run.failed} failed, ${run.skipped} skipped (window ${run.windowKey}).`,
      );
      void refresh();
    } catch (e: any) {
      setRunMsg(
        e?.message ||
          'TRACKING_PROVIDER_UNAVAILABLE: connect DataForSEO credentials. Nothing was faked.',
      );
    } finally {
      setRunBusy(false);
    }
  }

  async function handleToggleActive(row: TrackedKeywordRow) {
    try {
      await updateTrackedKeyword(row.id, {
        websiteId,
        isActive: !row.isActive,
      });
      void refresh();
    } catch {
      /* surface stays honest — list refresh shows truth */
    }
  }

  const keywordColumns: DataTableColumn<any>[] = [
    {
      key: 'keyword',
      label: 'Keyword',
      priority: 'high',
      sortable: true,
      sortValue: (r) => String(r.keyword || ''),
      render: (r) => (
        <span className="font-semibold text-rk-ink">{String(r.keyword)}</span>
      ),
    },
    {
      key: 'lastPosition',
      label: 'Tracked position',
      align: 'right',
      sortable: true,
      sortValue: (r) => (r.lastPosition === null ? 999 : Number(r.lastPosition)),
      render: (r) => <span className="rk-number">{fmtPos(r.lastPosition)}</span>,
    },
    {
      key: 'lastRankingUrl',
      label: 'Ranking URL',
      render: (r) =>
        r.lastRankingUrl ? (
          <span className="block max-w-[220px] truncate" title={String(r.lastRankingUrl)}>
            {String(r.lastRankingUrl)}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'targetUrl',
      label: 'Target URL',
      render: (r) =>
        r.targetUrl ? (
          <span className="block max-w-[220px] truncate" title={String(r.targetUrl)}>
            {String(r.targetUrl)}
          </span>
        ) : (
          <span className="text-rk-muted">Not set</span>
        ),
    },
    { key: 'device', label: 'Device' },
    { key: 'country', label: 'Country' },
    { key: 'origin', label: 'Source' },
    {
      key: 'lastObservedAt',
      label: 'Last observed',
      render: (r) =>
        r.lastObservedAt
          ? new Date(String(r.lastObservedAt)).toLocaleDateString()
          : 'Never',
    },
  ];

  return (
    <AppShell
      mobileOpen={navOpen}
      onClose={() => setNavOpen(false)}
      onMenu={() => setNavOpen(true)}
    >
      <PageHeader
        tourAnchor="discover-ranks"
        eyebrow="Search visibility"
        title="Rank Intelligence"
        description="Where you rank, what changed, and which page is responsible — observed, never fabricated."
        actions={
          <div className="flex gap-2">
            <select
              aria-label="Website"
              className="rk-focusable min-w-0 rounded-rk-md border border-rk-border bg-rk-surface px-3 py-2 text-sm"
              value={websiteId}
              onChange={(e) => {
                setWebsiteId(e.target.value);
                if (typeof window !== 'undefined' && e.target.value) {
                  localStorage.setItem('renkoo_website_id', e.target.value);
                }
              }}
            >
              <option value="">Select website</option>
              {websites.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name || w.url || w.id}
                </option>
              ))}
            </select>
            <SecondaryButton type="button" onClick={() => setAddOpen((v) => !v)}>
              Add keywords
            </SecondaryButton>
            <PrimaryButton type="button" onClick={() => void handleRun()}>
              {runBusy ? 'Running…' : 'Start tracking'}
            </PrimaryButton>
          </div>
        }
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <DataSourceBadge
              source="DataForSEO SERP"
              connected={overview?.providerConfigured === true}
            />
            {overview?.health ? (
              <FreshnessBadge label={`Health: ${String(overview.health)}`} />
            ) : null}
          </div>
        }
      />

      {runMsg ? (
        <div className="mt-4">
          <InsightBlock eyebrow="Tracking run" title="Latest run">
            {runMsg}
          </InsightBlock>
        </div>
      ) : null}

      {signals.length > 0 ? (
        <section aria-label="Command signals" className="mt-4 grid gap-3 md:grid-cols-3">
          {signals.map((s, i) => (
            <InsightBlock key={i} eyebrow="Signal" title={String(s.title)}>
              <p className="text-sm text-rk-muted">{String(s.why)}</p>
              <p className="mt-2 text-sm font-medium">{String(s.action)}</p>
              <p className="rk-metadata mt-1">{String(s.measurement)}</p>
            </InsightBlock>
          ))}
        </section>
      ) : null}

      {overviewLoading ? (
        <div className="mt-6">
          <LoadingBlock title="Loading rank intelligence" />
        </div>
      ) : overviewError ? (
        <div className="mt-6">
          <ErrorState
            title="Rank intelligence failed to load"
            description={overviewError}
            onRetry={() => void refresh()}
          />
        </div>
      ) : overview ? (
        <section aria-label="Key signals" className="mt-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Metric
              label="Tracked keywords"
              value={String(overview.trackedKeywords ?? 0)}
              detail="Active + paused watchlist"
            />
            <Metric
              label="Top 3"
              value={String(overview.top3 ?? 0)}
              detail="TRACKED POSITION 1–3"
            />
            <Metric
              label="Top 10"
              value={String(overview.top10 ?? 0)}
              detail="TRACKED POSITION 1–10"
            />
            <Metric
              label="Wrong page ranking"
              value={String(overview.wrongUrlCount ?? 0)}
              detail="Target ≠ ranking URL"
            />
            <Metric
              label="Health"
              value={String(overview.health ?? 'UNKNOWN')}
              detail="ACTIVE / STALE / FAILED"
            />
            <Metric
              label="Provider"
              value={overview.providerConfigured ? 'Connected' : 'Unavailable'}
              detail="DataForSEO SERP"
            />
          </div>
        </section>
      ) : null}

      {overview && !overview.providerConfigured ? (
        <div className="mt-4">
          <InsightBlock eyebrow="Provider" title="RANK_TRACKING_UNAVAILABLE">
            {String(overview.providerNote ?? '')}
          </InsightBlock>
        </div>
      ) : null}

      {addOpen ? (
        <div className="mt-4">
          <Panel
            eyebrow="Setup"
            title="Add keywords"
            description="One keyword per line. Country defaults to US, device to desktop. GSC queries are only tracked when explicitly pasted here."
          >
            <textarea
              aria-label="Keywords, one per line"
              className="input mb-2 min-h-[120px] w-full"
              value={addText}
              onChange={(e) => setAddText(e.target.value)}
              placeholder={'real estate CRM\nbest crm for agencies'}
            />
            <div className="flex items-center gap-2">
              <PrimaryButton type="button" onClick={() => void handleAdd()}>
                {addBusy ? 'Adding…' : 'Start tracking'}
              </PrimaryButton>
              {addMsg ? <span className="text-sm text-rk-muted">{addMsg}</span> : null}
            </div>
          </Panel>
        </div>
      ) : null}

      <div className="mb-4 mt-6 flex gap-2 border-b border-rk-border">
        {(['keywords', 'pages', 'competitors', 'runs', 'schedule'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`rk-focusable px-3 py-2 text-sm font-medium ${tab === t ? 'border-b-2 border-rk-ink text-rk-ink' : 'text-rk-muted'}`}
            onClick={() => setTab(t)}
          >
            {t === 'keywords'
              ? 'Rank movement'
              : t === 'pages'
                ? 'Ranking pages'
                : t === 'competitors'
                  ? 'Competitors'
                  : t === 'runs'
                    ? 'Runs & health'
                    : 'Schedule & digest'}
          </button>
        ))}
      </div>

      {tab === 'keywords' ? (
        <>
          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            selects={[
              {
                key: 'device',
                label: 'Device',
                value: device,
                options: [
                  { value: '', label: 'All devices' },
                  { value: 'DESKTOP', label: 'Desktop' },
                  { value: 'MOBILE', label: 'Mobile' },
                ],
                onChange: setDevice,
              },
              {
                key: 'origin',
                label: 'Source',
                value: origin,
                options: [
                  { value: '', label: 'All sources' },
                  { value: 'MANUAL', label: 'Manual' },
                  { value: 'GSC', label: 'GSC' },
                  { value: 'KEYWORD_RESEARCH', label: 'Keyword research' },
                  { value: 'STRATEGY', label: 'Strategy' },
                  { value: 'CUSTOMER_DEMAND', label: 'Customer demand' },
                ],
                onChange: setOrigin,
              },
              {
                key: 'active',
                label: 'Status',
                value: activeOnly ? 'active' : 'all',
                options: [
                  { value: 'active', label: 'Active only' },
                  { value: 'all', label: 'All' },
                ],
                onChange: (v) => setActiveOnly(v !== 'all'),
              },
            ]}
          />
          {listLoading ? (
            <div className="mt-4">
              <LoadingBlock title="Loading tracked keywords" />
            </div>
          ) : listError ? (
            <div className="mt-4">
              <ErrorState
                title="Tracked keywords failed to load"
                description={listError}
                onRetry={() => void refresh()}
              />
            </div>
          ) : rows.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No tracked keywords yet"
                description="Add keywords, select location + device, then start tracking. History begins at TRACKING STARTED — nothing is backfilled."
              />
            </div>
          ) : (
            <div className="mt-4">
              <Panel
                eyebrow="Keyword table"
                title={`Rank movement — ${total} tracked`}
                description="TRACKED POSITION per keyword. GSC POSITION lives in the detail drawer as a different measurement context."
              >
                <DataTable
                  caption="Tracked keywords with observed positions"
                  columns={keywordColumns}
                  rows={rows}
                  keyOf={(r: any) => String(r.id)}
                  onRowClick={(r) => void openDetail(String((r as any).id))}
                  emptyTitle="No tracked keywords"
                  emptyDescription="Add keywords to start tracking."
                  pageSize={15}
                />
              </Panel>
            </div>
          )}
        </>
      ) : null}

      {tab === 'pages' ? (
        <Panel
          eyebrow="Ranking pages"
          title="Pages with ranking keywords"
          description="Which pages the tracked positions resolve to. GSC clicks attach per query in keyword detail."
        >
          {pages.length === 0 ? (
            <EmptyState
              title="No ranking pages yet"
              description="Pages appear here once tracking runs store ranking URLs. Unavailable stays unavailable."
            />
          ) : (
            <DataTable
              caption="Pages with ranking keywords"
              columns={[
                { key: 'page', label: 'Page', priority: 'high' },
                { key: 'keywordCount', label: 'Keywords', align: 'right' },
                { key: 'top3', label: 'Top 3', align: 'right' },
                { key: 'top10', label: 'Top 10', align: 'right' },
                {
                  key: 'bestPosition',
                  label: 'Best',
                  align: 'right',
                  render: (r: any) => fmtPos(r.bestPosition),
                },
                {
                  key: 'averagePosition',
                  label: 'Avg',
                  align: 'right',
                  render: (r: any) =>
                    r.averagePosition === null ? '—' : `#${r.averagePosition}`,
                },
              ]}
              rows={pages}
              keyOf={(r: any) => String(r.page)}
              emptyTitle="No ranking pages"
              emptyDescription="No ranking URLs observed yet."
              pageSize={15}
            />
          )}
        </Panel>
      ) : null}

      {tab === 'competitors' ? (
        <Panel
          eyebrow="Competitors"
          title="Competitor movement — provider-observed only"
          description="No invented competitors. Domain-level evidence lives in Competitive Intelligence."
        >
          <p className="text-sm text-rk-muted">
            {competitors?.note ??
              'Competitor movement appears here only when the SERP provider observes it.'}
          </p>
          {competitors?.keyword ? (
            <p className="mt-2 text-sm">
              {String(competitors.keyword)}: you {fmtPos(competitors.yourPosition)} —{' '}
              {String(competitors.movementState ?? 'UNKNOWN')}
            </p>
          ) : null}
        </Panel>
      ) : null}

      {tab === 'runs' ? (
        <Panel
          eyebrow="Runs & health"
          title="Tracking runs"
          description="Bounded runs: QUEUED → RUNNING → COMPLETED / PARTIAL / FAILED. Repeated runs for the same day are idempotent."
        >
          <div className="mb-2 flex items-center gap-2">
            {overview?.health ? (
              <DataSourceBadge source={`Health: ${String(overview.health)}`} connected={overview.health === 'ACTIVE'} />
            ) : null}
            {overview?.lastRun ? (
              <FreshnessBadge label={`Last run: ${String((overview.lastRun as any)?.status ?? '')}`} />
            ) : null}
          </div>
          {runs.length === 0 ? (
            <EmptyState
              title="No runs yet"
              description="Start tracking to create the first bounded run."
            />
          ) : (
            <DataTable
              caption="Tracking runs"
              columns={[
                { key: 'windowKey', label: 'Window' },
                { key: 'status', label: 'Status' },
                { key: 'totalKeywords', label: 'Keywords', align: 'right' },
                { key: 'succeeded', label: 'Observed', align: 'right' },
                { key: 'failed', label: 'Failed', align: 'right' },
                { key: 'skipped', label: 'Skipped', align: 'right' },
              ]}
              rows={runs}
              keyOf={(r: any) => String(r.id)}
              emptyTitle="No runs"
              emptyDescription="No tracking runs yet."
              pageSize={15}
            />
          )}
        </Panel>
      ) : null}

      {tab === 'schedule' ? (
        <>
          <Panel
            eyebrow="Daily digest"
            title={digest ? `${digest.title} — ${digest.day}` : 'Search changes digest'}
            description={digest?.note ?? 'One concise digest per day. Instant alerts only for configured high-value events.'}
          >
            {!digest ? (
              <EmptyState
                title="No digest yet"
                description="The digest appears after scheduled runs produce meaningful changes. Noise stays suppressed."
              />
            ) : (
              <>
                <div className="mb-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Metric label="Meaningful changes" value={String(digest.total ?? 0)} detail="Capped at 10" />
                  <Metric label="Positive" value={String(digest.positive ?? 0)} detail="Gains + entries" />
                  <Metric label="Negative" value={String(digest.negative ?? 0)} detail="Losses + exits" />
                  <Metric label="AI divergence" value={String(digest.divergences ?? 0)} detail="Google × AI split" />
                </div>
                {digest.topAttention ? (
                  <InsightBlock eyebrow="Top attention" title={String(digest.topAttention)}>
                    CHANGE ≠ CAUSE — open the keyword for evidence, unknowns, and next best action.
                  </InsightBlock>
                ) : null}
                <ul className="mt-2 space-y-1">
                  {(digest.items ?? []).map((it: any, i: number) => (
                    <li key={i} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{String(it.title)}</span>
                      <span className="rk-metadata shrink-0">{String(it.alertType)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>

          <div className="mt-4">
            <Panel
              eyebrow="Recurring schedule"
              title="Tracking schedules"
              description="DAILY default, WEEKLY optional. Missed days are never replayed — the latest eligible run executes. Stale runs recover safely."
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <SecondaryButton type="button" onClick={() => void handleCreateSchedule('DAILY')}>
                  {schedBusy ? 'Saving…' : 'Add daily schedule'}
                </SecondaryButton>
                <SecondaryButton type="button" onClick={() => void handleCreateSchedule('WEEKLY')}>
                  Add weekly schedule
                </SecondaryButton>
                {schedMsg ? <span className="text-sm text-rk-muted">{schedMsg}</span> : null}
              </div>
              {schedules.length === 0 ? (
                <EmptyState
                  title="No schedules yet"
                  description="Create a daily schedule to start the recurring SCHEDULE → COLLECT → … → LEARN loop."
                />
              ) : (
                <DataTable
                  caption="Rank tracking schedules"
                  columns={[
                    { key: 'device', label: 'Device' },
                    { key: 'country', label: 'Country' },
                    { key: 'cadence', label: 'Cadence' },
                    {
                      key: 'isActive',
                      label: 'Active',
                      render: (r: any) => (r.isActive ? 'Yes' : 'Paused'),
                    },
                    {
                      key: 'nextRunAt',
                      label: 'Next run',
                      render: (r: any) =>
                        r.nextRunAt ? new Date(String(r.nextRunAt)).toLocaleString() : 'Due now',
                    },
                    { key: 'lastStatus', label: 'Last status', render: (r: any) => String(r.lastStatus ?? '—') },
                    { key: 'missedWindows', label: 'Missed', align: 'right' },
                  ]}
                  rows={schedules}
                  keyOf={(r: any) => String(r.id)}
                  onRowClick={(r) => void handleToggleSchedule(r as TrackingScheduleRow)}
                  emptyTitle="No schedules"
                  emptyDescription="Create a schedule above."
                  pageSize={10}
                />
              )}
              <p className="rk-metadata mt-2">Select a row to pause or resume. Deleting schedule config never deletes observations or alert evidence.</p>
              <div className="mt-2 flex gap-2">
                <SecondaryButton
                  type="button"
                  onClick={() =>
                    void resolveReversedAlerts({ websiteId }).then(() => refreshSchedule())
                  }
                >
                  Resolve reversed alerts
                </SecondaryButton>
              </div>
            </Panel>
          </div>

          <div className="mt-4">
            <Panel
              eyebrow="Observability"
              title="Scheduler health"
              description={obs?.note ?? 'Raw counts and timestamps — no health score, no fake percentages.'}
            >
              {obs ? (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Metric label="Health" value={String(obs.health ?? '—')} detail="Deterministic state" />
                  <Metric
                    label="Last successful run"
                    value={obs.lastSuccessfulRunAt ? new Date(String(obs.lastSuccessfulRunAt)).toLocaleDateString() : 'Never'}
                    detail={obs.lastSuccessfulRunAt ? new Date(String(obs.lastSuccessfulRunAt)).toLocaleString() : 'Awaiting first success'}
                  />
                  <Metric label="Running now" value={String(obs.currentlyRunning ?? 0)} detail="Never stuck" />
                  <Metric label="Recoveries" value={String(obs.recoveries ?? 0)} detail="Stale-run recoveries" />
                </div>
              ) : (
                <EmptyState
                  title="No observability yet"
                  description="Health appears after the first schedule and run."
                />
              )}
            </Panel>
          </div>

          <div className="mt-4">
            <Panel
              eyebrow="Preferences"
              title="Alert preferences"
              description={prefs?.note ?? 'RANK / AI / COMPETITOR / SITE / EXECUTION scopes. Muted keeps evidence.'}
            >
              <div className="mb-2 flex flex-wrap gap-2">
                {['RANK', 'AI', 'COMPETITOR', 'SITE', 'EXECUTION'].map((scope) => {
                  const on = (prefs?.scopes ?? ['RANK', 'AI', 'COMPETITOR', 'SITE', 'EXECUTION']).includes(scope);
                  return (
                    <button
                      key={scope}
                      type="button"
                      className={`rk-focusable rounded-rk-md border border-rk-border px-3 py-1.5 text-xs font-semibold ${on ? 'bg-rk-ink text-white' : 'text-rk-muted'}`}
                      onClick={() =>
                        void setTrackingScope({ websiteId, scope, enabled: !on }).then(() => refreshSchedule())
                      }
                    >
                      {scope}: {on ? 'on' : 'off'}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  aria-label="Keyword to mute"
                  className="input"
                  placeholder="Mute keyword (evidence kept)…"
                  value={muteKeyword}
                  onChange={(e) => setMuteKeyword(e.target.value)}
                />
                <SecondaryButton type="button" onClick={() => void handleMuteKeyword()}>
                  Mute keyword
                </SecondaryButton>
                {(prefs?.mutedKeywords ?? []).length > 0 ? (
                  <span className="rk-metadata">
                    Muted: {(prefs.mutedKeywords as Array<any>).map((m) => String(m.key)).join(', ')}
                  </span>
                ) : null}
              </div>
              {(prefs?.mutedKeywords ?? []).length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {(prefs.mutedKeywords as Array<any>).map((m) => (
                    <button
                      key={String(m.key)}
                      type="button"
                      className="rk-focusable text-xs font-semibold text-rk-secondary underline underline-offset-2"
                      onClick={() =>
                        void unmuteTracking({ websiteId, keyword: String(m.key) }).then(() => refreshSchedule())
                      }
                    >
                      Unmute {String(m.key)}
                    </button>
                  ))}
                </div>
              ) : null}
            </Panel>
          </div>
        </>
      ) : null}

      <Drawer
        open={detail !== null}
        onClose={() => setDetail(null)}
        eyebrow="Keyword evidence"
        title={String(detail?.trackedKeyword.keyword ?? 'Keyword detail')}
        description="Current position, history, ranking URL, GSC, SERP, AI — observed, never fabricated."
      >
        {detailLoading && !detail ? (
          <LoadingBlock title="Loading keyword" />
        ) : detail ? (
          <>
            <div className="mb-2 flex gap-2">
              {[7, 28, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`rk-focusable rounded-rk-md border border-rk-border px-2 py-1 text-xs ${windowDays === d ? 'bg-rk-ink text-white' : ''}`}
                  onClick={() => {
                    setWindowDays(d);
                    void openDetail(detail.trackedKeyword.id, d);
                  }}
                >
                  {d}d
                </button>
              ))}
            </div>
            <DrawerMeta
              items={[
                { label: 'TRACKED POSITION', value: fmtPos(detail.current) },
                { label: 'Previous', value: fmtPos(detail.previous) },
                { label: 'Movement', value: movementLabel(detail.movement) },
                { label: 'Delta', value: detail.delta.statement },
                { label: 'Band', value: detail.band },
                {
                  label: 'Ranking URL',
                  value: detail.rankingUrl ?? 'No URL observed',
                },
                {
                  label: 'Target URL',
                  value: detail.targetUrl ?? 'Not set',
                },
                { label: 'Target state', value: detail.targetState },
                { label: 'URL state', value: detail.urlState },
                {
                  label: 'SERP features',
                  value:
                    detail.serpFeatures.length > 0
                      ? detail.serpFeatures.join(', ')
                      : 'None observed',
                },
                { label: 'AI Overview', value: detail.aiOverview },
                { label: 'AI mode', value: detail.aiMode },
                { label: 'Google × AI', value: detail.divergence },
                { label: 'Volatility', value: detail.volatility },
                { label: 'History', value: detail.historyState },
              ]}
            />
            {detail.wrongUrlRanking ? (
              <DrawerSection title="Wrong page ranking">
                <InsightBlock eyebrow="URL intelligence" title="WRONG_URL_RANKING">
                  {`Target ${detail.targetUrl} is not ranking; ${detail.rankingUrl} ranks instead (observed). Check cannibalization, internal links, and Why-Not-#1.`}
                </InsightBlock>
                <div className="mt-2 flex gap-3">
                  <Link
                    className="rk-focusable text-sm font-semibold text-rk-secondary underline underline-offset-2"
                    href="/why-not-number-one"
                  >
                    Open Why-Not-#1
                  </Link>
                  <Link
                    className="rk-focusable text-sm font-semibold text-rk-secondary underline underline-offset-2"
                    href="/roadmap"
                  >
                    Open Roadmap
                  </Link>
                </div>
              </DrawerSection>
            ) : null}
            <DrawerSection title="GSC panel — different measurement context">
              <p className="text-sm text-rk-muted">{detail.gscComparison.statement}</p>
              <p className="mt-1 text-sm">
                GSC POSITION: {detail.gscPosition ?? 'unavailable'} · TRACKED
                POSITION: {detail.current ?? 'unavailable'}
              </p>
            </DrawerSection>
            <DrawerSection title="AI search panel — separate from Google rank">
              <p className="text-sm text-rk-muted">
                Google {fmtPos(detail.current)} · AI Overview {detail.aiOverview} ·
                AI mode {detail.aiMode}. Never combined into a universal score.
              </p>
            </DrawerSection>
            <DrawerSection title="Rank history — actual observations">
              {detail.historyState === 'TRACKING_STARTED' ? (
                <p className="text-sm text-rk-muted">
                  TRACKING STARTED — history insufficient for this window. Gaps
                  are missing runs, not losses.
                </p>
              ) : null}
              {detail.note ? (
                <p className="rk-metadata mb-2">{detail.note}</p>
              ) : null}
              <div className="max-h-64 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-rk-muted">
                      <th className="py-1">Observed</th>
                      <th>Position</th>
                      <th>URL</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...detail.observations].reverse().map((o, i) => (
                      <tr key={i} className="border-t border-rk-border">
                        <td className="py-1">
                          {new Date(o.observedAt).toLocaleDateString()}
                        </td>
                        <td>{fmtPos(o.position)}</td>
                        <td className="max-w-[180px] truncate">
                          {o.rankingUrl ?? '—'}
                        </td>
                        <td>{o.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DrawerSection>
            <DrawerSection title="Why it matters — next action">
              <p className="text-sm">{detail.investigation}</p>
              <div className="mt-2">
                <NextAction
                  label="Review page intent and competitive gap"
                  detail="Observed movement only — cause unknown. Route through Why-Not-#1, then propose → approve → execute → verify → measure."
                  href="/why-not-number-one"
                />
              </div>
              <div className="mt-2 flex gap-2">
                <SecondaryButton
                  type="button"
                  onClick={() => void handleToggleActive(detail.trackedKeyword)}
                >
                  {detail.trackedKeyword.isActive ? 'Pause tracking' : 'Resume tracking'}
                </SecondaryButton>
                <SecondaryButton
                  type="button"
                  onClick={() =>
                    void evaluateTrackingAlerts({
                      websiteId,
                      keywordId: detail.trackedKeyword.id,
                    })
                  }
                >
                  Evaluate alerts
                </SecondaryButton>
              </div>
            </DrawerSection>
          </>
        ) : null}
      </Drawer>
    </AppShell>
  );
}

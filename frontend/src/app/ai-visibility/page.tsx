'use client';

/*
 * RENKOO V2 — AI Search Command Center (Phase 5B).
 * Real persisted AI visibility observations only. Manual
 * observations stay visibly labeled as observations and are
 * never presented as live provider responses. Provider
 * availability is shown honestly from provider states.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  getWebsites,
  getAiVisibilityDashboard,
  getAiVisibilityHistory,
  getAiVisibilityIntelligence,
  getAiProviderStates,
  createAiVisibilityQuery,
  updateAiVisibilityQuery,
  deleteAiVisibilityQuery,
  suggestAiVisibilityQueries,
  recordAiVisibilityCheck,
  runAiVisibilityCheck,
  createActionFromRecommendation,
  isLimitError,
  limitDetails,
  limitUsageText,
  type Website,
} from '@/lib/api';
import { limitTitle } from '@/lib/plans';
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
  DangerButton,
  DataSourceBadge,
  FreshnessBadge,
  StatusChip,
  LoadingBlock,
  ErrorState,
  EmptyState,
  LimitReachedState,
  InsightBlock,
  EvidenceList,
  ConfidenceIndicator,
  RecommendationCallout,
  NextAction,
  type DataTableColumn,
} from '@/components/ui';
import {
  TrendChart,
  BarList,
  type TrendPoint,
} from '@/components/charts';

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fmtPct(value: unknown) {
  const n = num(value);
  if (n === 0) return '—';
  return `${(n <= 1 ? n * 100 : n).toFixed(0)}%`;
}

function fmtInt(value: unknown) {
  return num(value).toLocaleString('en-US');
}

function fmtDate(value: unknown) {
  if (!value) return '—';
  try {
    return new Date(String(value)).toLocaleDateString(
      'en-US',
      { month: 'short', day: 'numeric' },
    );
  } catch {
    return String(value);
  }
}

const PLATFORMS = [
  'CHATGPT',
  'GOOGLE_AI',
  'GEMINI',
  'CLAUDE',
  'PERPLEXITY',
  'OTHER',
];

export default function AiVisibilityPage() {
  const [navOpen, setNavOpen] = useState(false);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [dashboard, setDashboard] = useState<any>(null);
  const [history, setHistory] = useState<any>(null);
  const [intel, setIntel] = useState<any>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [drawerCheck, setDrawerCheck] = useState<any>(null);
  const [newPrompt, setNewPrompt] = useState('');
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestNote, setSuggestNote] = useState('');
  const [recordOpen, setRecordOpen] = useState(false);
  const [recForm, setRecForm] = useState({
    query: '',
    platform: 'CHATGPT',
    mentioned: true,
    citationFound: false,
    response: '',
  });
  const [recording, setRecording] = useState(false);
  const [recordMsg, setRecordMsg] = useState('');
  const [runForm, setRunForm] = useState({
    query: '',
    provider: 'GEMINI',
  });
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState('');
  const [runLimit, setRunLimit] =
    useState<unknown>(null);
  const [actionBusy, setActionBusy] = useState<
    Record<string, boolean>
  >({});
  const [actionDone, setActionDone] = useState<
    Record<string, boolean>
  >({});

  const loadAll = useCallback(async (id: string) => {
    if (!id) return;
    try {
      setError('');
      const [d, h, intelRes, prov] = await Promise.all([
        getAiVisibilityDashboard(id).catch(() => null),
        getAiVisibilityHistory(id).catch(() => null),
        getAiVisibilityIntelligence(id).catch(() => null),
        getAiProviderStates().catch(() => null),
      ]);
      setDashboard(d);
      setHistory(h);
      setIntel(intelRes);
      const plist = Array.isArray(
        (prov as any)?.providers,
      )
        ? (prov as any).providers
        : [];
      setProviders(plist);
    } catch (err: any) {
      setError(
        err?.message ||
          'Failed to load AI visibility data.',
      );
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const sites = await getWebsites();
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
        if (valid) await loadAll(valid);
        else if (list.length === 0)
          setError('No website found. Add a website first.');
      } catch (err: any) {
        if (!cancelled)
          setError(
            err?.message || 'Failed to load websites.',
          );
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [loadAll]);

  function handleWebsite(id: string) {
    setWebsiteId(id);
    setDrawerCheck(null);
    if (typeof window !== 'undefined')
      localStorage.setItem('renkoo_website_id', id);
    setLoading(true);
    void loadAll(id).finally(() => setLoading(false));
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadAll(websiteId);
    setRefreshing(false);
  }

  const queries: any[] = useMemo(() => {
    const d = dashboard as any;
    const list =
      d?.queries || d?.prompts || d?.trackedQueries || [];
    return Array.isArray(list) ? list : [];
  }, [dashboard]);

  const checks: any[] = useMemo(() => {
    const d = dashboard as any;
    const list =
      d?.checks || d?.observations || d?.recentChecks || [];
    return Array.isArray(list) ? list : [];
  }, [dashboard]);

  const latestCheckDate: string | null = useMemo(() => {
    let latest: string | null = null;
    for (const c of checks) {
      const v = c?.observedAt || c?.createdAt;
      if (v && (!latest || String(v) > latest))
        latest = String(v);
    }
    return latest;
  }, [checks]);

  const citations: any[] = useMemo(() => {
    const src = (intel as any)?.citations || [];
    return Array.isArray(src) ? src : [];
  }, [intel]);

  const gaps: any[] = useMemo(() => {
    const src = (intel as any)?.gaps || [];
    return Array.isArray(src) ? src : [];
  }, [intel]);

  const recommendations: any[] = useMemo(() => {
    const src =
      (intel as any)?.recommendations ||
      (dashboard as any)?.recommendations ||
      [];
    return Array.isArray(src) ? src : [];
  }, [intel, dashboard]);

  const trendPoints: TrendPoint[] = useMemo(() => {
    const h = history as any;
    const list = Array.isArray(h)
      ? h
      : Array.isArray(h?.points)
        ? h.points
        : Array.isArray(h?.history)
          ? h.history
          : [];
    return list
      .map((p: any) => ({
        x: String(
          p.date || p.day || p.label || p.createdAt || '',
        ),
        y: num(
          p.visibility ?? p.score ?? p.mentions ?? 0,
        ),
      }))
      .filter((p: TrendPoint) => p.x);
  }, [history]);

  const providerBars = useMemo(() => {
    const counts = (intel as any)?.counts;
    if (counts && typeof counts === 'object') {
      return Object.entries(counts)
        .map(([label, value]) => ({
          label: label
            .replace(/_/g, ' ')
            .toLowerCase()
            .replace(/\b\w/g, (c) => c.toUpperCase()),
          value: num(value),
        }))
        .filter((b) => b.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);
    }
    const byProvider: Record<string, number> = {};
    for (const c of checks) {
      const p = String(
        c.provider || c.platform || 'Observation',
      );
      byProvider[p] = (byProvider[p] || 0) + 1;
    }
    return Object.entries(byProvider)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [intel, checks]);

  const filteredChecks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return checks.filter((c: any) => {
      if (
        statusFilter !== 'ALL' &&
        String(
          c.status || (c.mentioned ? 'MENTIONED' : 'MISSED'),
        ).toUpperCase() !== statusFilter
      )
        return false;
      if (!q) return true;
      return (
        `${c.query || ''} ${c.provider || c.platform || ''} ${c.response || ''}`
          .toLowerCase()
          .includes(q)
      );
    });
  }, [checks, search, statusFilter]);

  async function handleCreatePrompt() {
    const q = newPrompt.trim();
    if (!q || !websiteId || savingPrompt) return;
    try {
      setSavingPrompt(true);
      await createAiVisibilityQuery({ websiteId, query: q });
      setNewPrompt('');
      await loadAll(websiteId);
    } catch (err: any) {
      setSuggestNote(
        err?.message || 'Could not save prompt.',
      );
    } finally {
      setSavingPrompt(false);
    }
  }

  async function handleTogglePrompt(row: any) {
    try {
      await updateAiVisibilityQuery(String(row.id), {
        isActive: !row.isActive,
      });
      await loadAll(websiteId);
    } catch (err: any) {
      setSuggestNote(
        err?.message || 'Could not update prompt.',
      );
    }
  }

  async function handleDeletePrompt(row: any) {
    try {
      await deleteAiVisibilityQuery(String(row.id));
      await loadAll(websiteId);
    } catch (err: any) {
      setSuggestNote(
        err?.message || 'Could not delete prompt.',
      );
    }
  }

  async function handleSuggest() {
    if (!websiteId || suggesting) return;
    try {
      setSuggesting(true);
      setSuggestNote('');
      const res = await suggestAiVisibilityQueries(
        websiteId,
      );
      const count = Array.isArray(
        (res as any)?.suggestions,
      )
        ? (res as any).suggestions.length
        : 0;
      setSuggestNote(
        count > 0
          ? `${count} suggested prompt${count === 1 ? '' : 's'} added from your measured data.`
          : 'No new prompt suggestions from current data.',
      );
      await loadAll(websiteId);
    } catch (err: any) {
      setSuggestNote(
        err?.message || 'Suggestion failed.',
      );
    } finally {
      setSuggesting(false);
    }
  }

  async function handleRecord() {
    if (!websiteId || recording || !recForm.query.trim())
      return;
    try {
      setRecording(true);
      setRecordMsg('');
      await recordAiVisibilityCheck({
        websiteId,
        platform: recForm.platform as any,
        query: recForm.query.trim(),
        mentioned: recForm.mentioned,
        citationFound: recForm.citationFound,
        response: recForm.response.trim() || undefined,
      } as any);
      setRecordMsg(
        'Observation recorded and labeled as a manual observation.',
      );
      setRecForm({
        query: '',
        platform: 'CHATGPT',
        mentioned: true,
        citationFound: false,
        response: '',
      });
      await loadAll(websiteId);
    } catch (err: any) {
      setRecordMsg(err?.message || 'Recording failed.');
    } finally {
      setRecording(false);
    }
  }

  async function handleRunCheck() {
    if (!websiteId || running || !runForm.query.trim())
      return;
    try {
      setRunning(true);
      setRunMsg('');
      setRunLimit(null);
      const res = await runAiVisibilityCheck({
        websiteId,
        query: runForm.query.trim(),
        provider: runForm.provider as any,
      });
      const ok = Boolean((res as any)?.check || res);
      setRunMsg(
        ok
          ? `Live ${runForm.provider} check completed and stored with provider attribution.`
          : 'Check finished with no stored observation.',
      );
      await loadAll(websiteId);
    } catch (err: any) {
      if (isLimitError(err)) {
        setRunLimit(err);
      } else {
        setRunMsg(
          err?.message || 'Live check failed.',
        );
      }
    } finally {
      setRunning(false);
    }
  }

  async function handleCreateAction(rec: any) {
    const key = String(rec.id || rec.title);
    if (actionBusy[key] || actionDone[key]) return;
    try {
      setActionBusy((p) => ({ ...p, [key]: true }));
      if (!rec.id) return;
      await createActionFromRecommendation(String(rec.id));
      setActionDone((p) => ({ ...p, [key]: true }));
    } catch {
      /* surface stays; button remains usable */
    } finally {
      setActionBusy((p) => ({ ...p, [key]: false }));
    }
  }

  const checkColumns: DataTableColumn<any>[] = [
    {
      key: 'query',
      label: 'Prompt',
      priority: 'high',
      render: (r) => (
        <span className="font-semibold text-rk-ink">
          {String(r.query || '—')}
        </span>
      ),
    },
    {
      key: 'provider',
      label: 'Platform',
      priority: 'medium',
      render: (r) => (
        <span className="text-rk-secondary">
          {String(r.provider || r.platform || '—')
            .replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Result',
      priority: 'high',
      render: (r) => (
        <StatusChip
          status={String(
            r.status ||
              (r.mentioned ? 'MENTIONED' : 'MISSED'),
          )}
        />
      ),
    },
    {
      key: 'source',
      label: 'Source',
      priority: 'medium',
      render: (r) => (
        <DataSourceBadge
          source={
            r.sourceType === 'PROVIDER' ||
            r.isLive ||
            r.providerRun
              ? 'Provider'
              : 'Observation'
          }
        />
      ),
    },
    {
      key: 'date',
      label: 'Observed',
      priority: 'low',
      render: (r) => (
        <span className="rk-number text-rk-secondary">
          {fmtDate(r.observedAt || r.createdAt)}
        </span>
      ),
    },
  ];

  const visibility = (dashboard as any)?.visibility;
  const visibilityScore =
    visibility?.score ??
    (dashboard as any)?.score ??
    (intel as any)?.visibilityScore ??
    null;
  const mentions =
    (dashboard as any)?.mentions ??
    (intel as any)?.totalMentions ??
    checks.filter((c: any) => c.mentioned).length;
  const citationCount =
    (dashboard as any)?.citations ??
    (intel as any)?.totalCitations ??
    citations.length;

  return (
    <AppShell
      mobileOpen={navOpen}
      onClose={() => setNavOpen(false)}
      onMenu={() => setNavOpen(true)}
    >
      <PageHeader
        eyebrow="AI search"
        title="AI Search Visibility"
        description="Measured AI-search observations with evidence — never a chatbot, never invented coverage."
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
              source="AI observations"
              connected={checks.length > 0}
            />
            <FreshnessBadge
              label={
                latestCheckDate
                  ? `Observed ${fmtDate(latestCheckDate)}`
                  : 'Freshness unavailable'
              }
            />
          </div>
        }
      />

      {loading ? (
        <div className="mt-6">
          <LoadingBlock title="Loading AI visibility" />
        </div>
      ) : error && websites.length === 0 ? (
        <div className="mt-6">
          <ErrorState
            title="AI visibility failed to load"
            description={error}
            onRetry={() => window.location.reload()}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <Panel
            eyebrow="Context"
            title="Website scope"
            description="All observations below are measured for the selected website."
          >
            <FilterBar
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
                  key: 'status',
                  label: 'Result',
                  value: statusFilter,
                  options: [
                    { value: 'ALL', label: 'All results' },
                    {
                      value: 'MENTIONED',
                      label: 'Mentioned',
                    },
                    { value: 'MISSED', label: 'Missed' },
                  ],
                  onChange: setStatusFilter,
                },
              ]}
              searchValue={search}
              searchPlaceholder="Search prompts, platforms…"
              onSearchChange={setSearch}
            />
          </Panel>

          {error ? (
            <ErrorState
              title="Partial load failure"
              description={error}
              onRetry={() => void handleRefresh()}
            />
          ) : null}

          <section aria-label="Key signals">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric
                label="AI visibility"
                value={
                  visibilityScore === null ||
                  visibilityScore === undefined
                    ? '—'
                    : fmtPct(visibilityScore)
                }
                detail="Measured across observations"
              />
              <Metric
                label="Brand mentions"
                value={fmtInt(mentions)}
                detail="Persisted observations"
              />
              <Metric
                label="Citations"
                value={fmtInt(citationCount)}
                detail="Measured citations"
              />
              <Metric
                label="Tracked prompts"
                value={fmtInt(queries.length)}
                detail="Active prompt set"
              />
            </div>
          </section>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              eyebrow="Primary visual"
              title="Visibility trend"
              description="Measured movement across persisted snapshots."
            >
              <TrendChart
                state={
                  trendPoints.length > 0
                    ? 'ready'
                    : 'empty'
                }
                points={trendPoints}
                summary="Measured AI visibility over time."
                formatValue={(v) => fmtPct(v)}
                emptyTitle="No trend history yet"
                emptyDescription="Snapshots accumulate as observations are recorded and live checks run."
              />
            </Panel>
            <Panel
              eyebrow="Primary visual"
              title="Mentions by platform"
              description="Where measured mentions actually occurred."
            >
              <BarList
                state={
                  providerBars.length > 0
                    ? 'ready'
                    : 'empty'
                }
                bars={providerBars}
                summary="Measured mentions grouped by AI platform."
                emptyTitle="No platform breakdown yet"
                emptyDescription="Record observations or run live checks to build this comparison."
              />
            </Panel>
          </div>

          <Panel
            eyebrow="Provider context"
            title="Provider availability"
            description="Live checks are only possible on connected providers. Everything else is a manual observation."
          >
            {providers.length === 0 ? (
              <EmptyState
                title="No AI provider connected"
                description="Manual observations keep working and stay labeled as observations. Connect a provider in Integrations for live checks."
                actionLabel="Open integrations"
                actionHref="/integrations"
              />
            ) : (
              <ul className="divide-y divide-rk-border">
                {providers.map((p: any, i: number) => (
                  <li
                    key={String(p.provider || p.name || i)}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <span className="font-semibold text-rk-ink">
                      {String(
                        p.provider || p.name || 'Provider',
                      ).replace(/_/g, ' ')}
                    </span>
                    <DataSourceBadge
                      source="Provider"
                      connected={Boolean(
                        p.connected || p.available,
                      )}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            eyebrow="Prompt intelligence"
            title="Observations"
            description="Open a row for full evidence. Manual rows are labeled observations."
          >
            <DataTable
              caption="AI visibility observations with evidence"
              columns={checkColumns}
              rows={filteredChecks}
              keyOf={(r: any, i: number) =>
                String(r.id || `${r.query}-${i}`)
              }
              onRowClick={setDrawerCheck}
              emptyTitle="No observations yet"
              emptyDescription="Record a manual observation or run a live check on a connected provider."
              pageSize={12}
            />
          </Panel>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              eyebrow="Prompt set"
              title="Tracked prompts"
              description="Prompts are measured repeatedly; suggestions come from your data."
              actions={
                <SecondaryButton
                  onClick={() => void handleSuggest()}
                  disabled={suggesting || !websiteId}
                >
                  {suggesting
                    ? 'Suggesting…'
                    : 'Suggest from data'}
                </SecondaryButton>
              }
            >
              <div className="mb-3 flex gap-2">
                <input
                  value={newPrompt}
                  onChange={(e) =>
                    setNewPrompt(e.target.value)
                  }
                  placeholder="Add a prompt to track…"
                  maxLength={500}
                  className="input flex-1"
                />
                <PrimaryButton
                  onClick={() => void handleCreatePrompt()}
                  disabled={savingPrompt || !newPrompt.trim()}
                >
                  {savingPrompt ? 'Adding…' : 'Add'}
                </PrimaryButton>
              </div>
              {suggestNote ? (
                <p className="rk-body mb-2">{suggestNote}</p>
              ) : null}
              {queries.length === 0 ? (
                <EmptyState
                  title="No tracked prompts"
                  description="Add the questions buyers ask AI tools about your category."
                />
              ) : (
                <ul className="divide-y divide-rk-border">
                  {queries.slice(0, 10).map((q: any) => (
                    <li
                      key={String(q.id || q.query)}
                      className="flex items-center justify-between gap-2 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-rk-ink">
                        {String(q.query || q.prompt)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          void handleTogglePrompt(q)
                        }
                        className="rk-focusable text-xs font-semibold text-rk-secondary underline underline-offset-2"
                      >
                        {q.isActive === false
                          ? 'Activate'
                          : 'Pause'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void handleDeletePrompt(q)
                        }
                        className="rk-focusable text-xs font-semibold text-rk-danger underline underline-offset-2"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <div className="space-y-3">
              <Panel
                eyebrow="Manual evidence"
                title="Record observation"
                description="Stored as an observation — never shown as a provider response."
              >
                {!recordOpen ? (
                  <SecondaryButton
                    onClick={() => setRecordOpen(true)}
                  >
                    Record observation
                  </SecondaryButton>
                ) : (
                  <div className="space-y-2">
                    <input
                      value={recForm.query}
                      onChange={(e) =>
                        setRecForm((f) => ({
                          ...f,
                          query: e.target.value,
                        }))
                      }
                      placeholder="Prompt that was asked…"
                      maxLength={500}
                      className="input w-full"
                    />
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={recForm.platform}
                        onChange={(e) =>
                          setRecForm((f) => ({
                            ...f,
                            platform: e.target.value,
                          }))
                        }
                        className="input"
                        aria-label="Platform"
                      >
                        {PLATFORMS.map((p) => (
                          <option key={p} value={p}>
                            {p.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-rk-secondary">
                        <input
                          type="checkbox"
                          checked={recForm.mentioned}
                          onChange={(e) =>
                            setRecForm((f) => ({
                              ...f,
                              mentioned: e.target.checked,
                            }))
                          }
                        />
                        Mentioned
                      </label>
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-rk-secondary">
                        <input
                          type="checkbox"
                          checked={recForm.citationFound}
                          onChange={(e) =>
                            setRecForm((f) => ({
                              ...f,
                              citationFound:
                                e.target.checked,
                            }))
                          }
                        />
                        Cited
                      </label>
                    </div>
                    <textarea
                      value={recForm.response}
                      onChange={(e) =>
                        setRecForm((f) => ({
                          ...f,
                          response: e.target.value,
                        }))
                      }
                      placeholder="What the response said (optional)…"
                      rows={2}
                      maxLength={2000}
                      className="input w-full"
                    />
                    <div className="flex gap-2">
                      <PrimaryButton
                        onClick={() => void handleRecord()}
                        disabled={
                          recording || !recForm.query.trim()
                        }
                      >
                        {recording
                          ? 'Saving…'
                          : 'Save observation'}
                      </PrimaryButton>
                      <SecondaryButton
                        onClick={() => setRecordOpen(false)}
                      >
                        Cancel
                      </SecondaryButton>
                    </div>
                    {recordMsg ? (
                      <p className="rk-body">{recordMsg}</p>
                    ) : null}
                  </div>
                )}
              </Panel>

              <Panel
                eyebrow="Live check"
                title="Run provider check"
                description="Only on connected providers; stored with provider attribution."
              >
                <div className="space-y-2">
                  <input
                    value={runForm.query}
                    onChange={(e) =>
                      setRunForm((f) => ({
                        ...f,
                        query: e.target.value,
                      }))
                    }
                    placeholder="Prompt to check live…"
                    maxLength={500}
                    className="input w-full"
                  />
                  <div className="flex gap-2">
                    <select
                      value={runForm.provider}
                      onChange={(e) =>
                        setRunForm((f) => ({
                          ...f,
                          provider: e.target.value,
                        }))
                      }
                      className="input"
                      aria-label="Provider"
                    >
                      <option value="GEMINI">Gemini</option>
                      <option value="OPENAI">OpenAI</option>
                    </select>
                    <PrimaryButton
                      onClick={() => void handleRunCheck()}
                      disabled={
                        running || !runForm.query.trim()
                      }
                    >
                      {running ? 'Checking…' : 'Run check'}
                    </PrimaryButton>
                  </div>
                  {runMsg ? (
                    <p className="rk-body">{runMsg}</p>
                  ) : null}
                  {runLimit ? (
                    <LimitReachedState
                      title={limitTitle(
                        limitDetails(runLimit)?.planCode,
                      )}
                      description="This check could not run because the workspace hit its AI scan allowance. Existing data is untouched."
                      detail={limitUsageText(
                        runLimit,
                      )}
                      actionLabel="View plans"
                      actionHref="/billing"
                    />
                  ) : null}
                </div>
              </Panel>
            </div>
          </div>

          {gaps.length > 0 && (
            <Panel
              eyebrow="What matters"
              title="AI visibility gaps"
              description="Evidence-backed gaps worth closing."
              actions={
                <Link href="/opportunities">
                  <SecondaryButton type="button">
                    View opportunity
                  </SecondaryButton>
                </Link>
              }
            >
              <ul className="divide-y divide-rk-border">
                {gaps.slice(0, 8).map((g: any, i: number) => (
                  <li key={i} className="py-2.5">
                    <p className="text-sm font-semibold text-rk-ink">
                      {String(
                        g.title || g.gap || g.prompt || 'Gap',
                      )}
                    </p>
                    {g.description || g.detail ? (
                      <p className="rk-body mt-0.5">
                        {String(g.description || g.detail)}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {recommendations.length > 0 && (
            <Panel
              eyebrow="Recommendations"
              title="What should I do?"
              description="Each recommendation can become a tracked action."
            >
              <ul className="divide-y divide-rk-border">
                {recommendations
                  .slice(0, 8)
                  .map((rec: any, i: number) => {
                    const key = String(rec.id || rec.title || i);
                    return (
                      <li
                        key={key}
                        className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
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
                        </div>
                        {rec.id ? (
                          <SecondaryButton
                            onClick={() =>
                              void handleCreateAction(rec)
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
                                : 'Add to Actions'}
                          </SecondaryButton>
                        ) : null}
                      </li>
                    );
                  })}
              </ul>
            </Panel>
          )}

          <RecommendationCallout
            title="Outcome"
            text="Close the loop: gaps become opportunities, opportunities become actions, monitoring measures the change."
            actionLabel="Open Opportunity Engine"
            actionHref="/opportunities"
          />
          <NextAction
            label="See what changed"
            detail="Monitoring measures crawl-over-crawl and visibility movement."
            href="/monitoring"
          />
        </div>
      )}

      <Drawer
        open={drawerCheck !== null}
        onClose={() => setDrawerCheck(null)}
        eyebrow="Observation evidence"
        title={String(drawerCheck?.query || 'Observation')}
        description={
          drawerCheck?.sourceType === 'PROVIDER' ||
          drawerCheck?.isLive ||
          drawerCheck?.providerRun
            ? 'Stored live provider response.'
            : 'Manual observation — not a live provider response.'
        }
      >
        {drawerCheck && (
          <>
            <DrawerMeta
              items={[
                {
                  label: 'Platform',
                  value: String(
                    drawerCheck.provider ||
                      drawerCheck.platform ||
                      '—',
                  ).replace(/_/g, ' '),
                },
                {
                  label: 'Timestamp',
                  value: fmtDate(
                    drawerCheck.observedAt ||
                      drawerCheck.createdAt,
                  ),
                },
                {
                  label: 'Result',
                  value: String(
                    drawerCheck.status ||
                      (drawerCheck.mentioned
                        ? 'MENTIONED'
                        : 'MISSED'),
                  ).replace(/_/g, ' '),
                },
                {
                  label: 'Citation',
                  value: drawerCheck.citationFound
                    ? String(
                        drawerCheck.citationUrl ||
                          'Found',
                      )
                    : 'None recorded',
                },
              ]}
            />
            {drawerCheck.response ? (
              <DrawerSection title="Response">
                <p className="rk-body">
                  {String(drawerCheck.response)}
                </p>
              </DrawerSection>
            ) : null}
            {Array.isArray(drawerCheck.competitors) &&
            drawerCheck.competitors.length > 0 ? (
              <DrawerSection title="Competitors seen">
                <EvidenceList
                  items={drawerCheck.competitors.map(
                    (c: any) => ({
                      text: String(c?.name || c),
                      source: 'Observation',
                    }),
                  )}
                />
              </DrawerSection>
            ) : null}
            {drawerCheck.evidence ||
            drawerCheck.note ? (
              <DrawerSection title="Source evidence">
                <p className="rk-body">
                  {String(
                    drawerCheck.evidence ||
                      drawerCheck.note,
                  )}
                </p>
              </DrawerSection>
            ) : null}
            <DrawerSection title="Confidence">
              <ConfidenceIndicator
                level={
                  drawerCheck.sourceType === 'PROVIDER' ||
                  drawerCheck.isLive
                    ? 'high'
                    : 'medium'
                }
                reason={
                  drawerCheck.sourceType === 'PROVIDER' ||
                  drawerCheck.isLive
                    ? 'Stored provider response.'
                    : 'Human-recorded observation; coverage depends on prompt set.'
                }
              />
            </DrawerSection>
            {(drawerCheck.limitations ||
              (!drawerCheck.isLive &&
                drawerCheck.sourceType !== 'PROVIDER')) && (
              <DrawerSection title="Limitations">
                <p className="rk-body">
                  {String(
                    drawerCheck.limitations ||
                      'Manual observation: a point-in-time record, not continuous provider coverage.',
                  )}
                </p>
              </DrawerSection>
            )}
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

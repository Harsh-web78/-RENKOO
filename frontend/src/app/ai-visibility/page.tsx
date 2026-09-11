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
  generateAiPromptSet,
  getAiComparison,
  getAiDiagnoses,
  getAiRoadmapCandidates,
  getAiPromptHistory,
  getAiCommandCenter,
  getAiPromptLab,
  getAiPromptDetail,
  createAiOpportunity,
  getAiMonitoringStatus,
  listAiMonitorSchedules,
  createAiMonitorSchedule,
  updateAiMonitorSchedule,
  estimateAiMonitorRun,
  requestAiMonitorRun,
  getAiMonitorChanges,
  getAiMonitorHistory,
  getAiMonitorPromptHistory,
  getAiMonitoringHealth,
  getOfficialSummary,
  syncOfficialGoogle,
  getAgentActivity,
  previewAgentImport,
  confirmAgentImport,
  getAgentCoverage,
  getAgentDetail,
  getNextBestAction,
  getRankOverview,
  getRankChanges,
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
  InsufficientHistoryState,
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
  /* Phase 6 — AI Search Intelligence 1.0 (additive). */
  const [comparison, setComparison] = useState<any>(null);
  const [diagnosesData, setDiagnosesData] =
    useState<any>(null);
  const [candidates, setCandidates] = useState<any[]>(
    [],
  );
  const [trends, setTrends] = useState<any[]>([]);
  const [historyDays, setHistoryDays] = useState(30);
  const [generating, setGenerating] = useState(false);
  const [generatedPrompts, setGeneratedPrompts] =
    useState<any[]>([]);
  const [genMsg, setGenMsg] = useState('');
  const [trackingPrompt, setTrackingPrompt] = useState<
    Record<string, boolean>
  >({});
  /* Phase 6 — AI Search OS 1.0 Command Center (additive). */
  const [commandCenter, setCommandCenter] =
    useState<any>(null);
  const [lab, setLab] = useState<any>(null);
  const [labQuery, setLabQuery] = useState('');
  const [labGroup, setLabGroup] = useState('ALL');
  const [promptDetail, setPromptDetail] =
    useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [oppBusy, setOppBusy] = useState<
    Record<string, boolean>
  >({});
  const [oppMsg, setOppMsg] = useState('');
  /* Phase 7 — AI Prompt Monitoring 1.0 (additive). */
  const [monitorStatus, setMonitorStatus] =
    useState<any>(null);
  const [monitorChanges, setMonitorChanges] =
    useState<any>(null);
  const [monitorHistory, setMonitorHistory] =
    useState<any>(null);
  const [monitorHistoryDays, setMonitorHistoryDays] =
    useState<7 | 30 | 90>(30);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [setupCadence, setSetupCadence] = useState('WEEKLY');
  const [setupSurfaces, setSetupSurfaces] = useState(
    'GEMINI',
  );
  const [setupMsg, setSetupMsg] = useState('');
  const [setupBusy, setSetupBusy] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const [monitorRunMsg, setMonitorRunMsg] = useState('');
  const [promptTimeline, setPromptTimeline] =
    useState<any>(null);
  /* Phase 8A — production health (additive). */
  const [monitorHealth, setMonitorHealth] =
    useState<any>(null);
  /* Phase 8C — official data (additive). */
  const [official, setOfficial] = useState<any>(null);
  const [officialBusy, setOfficialBusy] = useState(false);
  const [officialMsg, setOfficialMsg] = useState('');
  /* Phase 8D — agent analytics (additive). */
  const [agentActivity, setAgentActivity] =
    useState<any>(null);
  const [agentCoverage, setAgentCoverage] =
    useState<any>(null);
  const [agentDetail, setAgentDetail] =
    useState<any>(null);
  const [agentCsv, setAgentCsv] = useState('');
  const [agentPreview, setAgentPreview] =
    useState<any>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentMsg, setAgentMsg] = useState('');
  /* Phase 8E — next best action hero (additive). */
  const [nextBest, setNextBest] = useState<any>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  /* Phase 11 — rank movement (additive). */
  const [rankOverview, setRankOverview] =
    useState<any>(null);

  const loadAll = useCallback(async (id: string) => {
    if (!id) return;
    try {
      setError('');
      const [d, h, intelRes, prov, comp, diag, cand, os, labRes, mStatus, mChanges, mHist, sched, mHealth, off, agAct, agCov, nb, rk] =
        await Promise.all([
          getAiVisibilityDashboard(id).catch(() => null),
          getAiVisibilityHistory(id).catch(() => null),
          getAiVisibilityIntelligence(id).catch(
            () => null,
          ),
          getAiProviderStates().catch(() => null),
          getAiComparison(id).catch(() => null),
          getAiDiagnoses(id).catch(() => null),
          getAiRoadmapCandidates(id).catch(() => null),
          getAiCommandCenter(id).catch(() => null),
          getAiPromptLab(id).catch(() => null),
          getAiMonitoringStatus(id).catch(() => null),
          getAiMonitorChanges(id).catch(() => null),
          getAiMonitorHistory(id, 30).catch(() => null),
          listAiMonitorSchedules(id).catch(() => []),
          getAiMonitoringHealth(id).catch(() => null),
          getOfficialSummary(id).catch(() => null),
          getAgentActivity(id).catch(() => null),
          getAgentCoverage(id).catch(() => null),
          getNextBestAction(id).catch(() => null),
          getRankOverview(id).catch(() => null),
        ]);
      setDashboard(d);
      setHistory(h);
      setIntel(intelRes);
      setComparison(comp);
      setDiagnosesData(diag);
      setCommandCenter(os);
      setLab(labRes);
      setMonitorStatus(mStatus);
      setMonitorChanges(mChanges);
      setMonitorHistory(mHist);
      setMonitorHealth(mHealth);
      setOfficial(off);
      setAgentActivity(agAct);
      setAgentCoverage(agCov);
      setNextBest(nb);
      setRankOverview(rk);
      setSchedules(
        Array.isArray(sched) ? sched : [],
      );
      setCandidates(
        Array.isArray((cand as any)?.candidates)
          ? (cand as any).candidates
          : [],
      );
      const plist = Array.isArray(
        (prov as any)?.providers,
      )
        ? (prov as any).providers
        : [];
      setProviders(plist);
      const t = await getAiPromptHistory(id, 30).catch(
        () => null,
      );
      setTrends(
        Array.isArray((t as any)?.trends)
          ? (t as any).trends
          : [],
      );
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

  /* Phase 6 memos — derived from existing intelligence
     plus the additive comparison/diagnosis endpoints. */
  const shareOfVoice: any = useMemo(
    () => (intel as any)?.shareOfVoice || null,
    [intel],
  );

  const competitorTracked: any[] = useMemo(() => {
    const list =
      (intel as any)?.competitors?.tracked || [];
    return Array.isArray(list) ? list : [];
  }, [intel]);

  const competitorUnlisted: any[] = useMemo(() => {
    const list =
      (intel as any)?.competitors?.unlisted || [];
    return Array.isArray(list) ? list : [];
  }, [intel]);

  const matrixRows: any[] = useMemo(() => {
    const list =
      (comparison as any)?.comparisons || [];
    return Array.isArray(list) ? list : [];
  }, [comparison]);

  const diagnoses: any[] = useMemo(() => {
    const list =
      (diagnosesData as any)?.diagnoses || [];
    return Array.isArray(list) ? list : [];
  }, [diagnosesData]);

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

  async function handleGeneratePromptSet() {
    if (!websiteId || generating) return;
    try {
      setGenerating(true);
      setGenMsg('');
      const res = await generateAiPromptSet({
        keywords: queries.slice(0, 40).map((q: any) => ({
          keyword: String(q.query || q.text || ''),
          intent: q.category || null,
          topic: q.topic || null,
          sourceUrl: null,
          country: 'US',
          language: 'en',
        })),
        maxPrompts: 60,
        defaultCountry: 'US',
        defaultLanguage: 'en',
      });
      const list = Array.isArray(
        (res as any)?.prompts,
      )
        ? (res as any).prompts
        : [];
      setGeneratedPrompts(list);
      setGenMsg(
        list.length > 0
          ? `${list.length} evidence-based prompts generated. Track the ones that matter.`
          : 'No prompts could be generated from current evidence.',
      );
    } catch (err: any) {
      setGenMsg(
        err?.message || 'Prompt generation failed.',
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleTrackPrompt(p: any) {
    const key = String(p.text || '');
    if (!key || !websiteId || trackingPrompt[key]) return;
    try {
      setTrackingPrompt((s) => ({ ...s, [key]: true }));
      await createAiVisibilityQuery({
        websiteId,
        query: key,
        category: String(p.intent || 'INFORMATIONAL'),
      });
      await loadAll(websiteId);
    } catch (err: any) {
      setGenMsg(
        err?.message || 'Could not track prompt.',
      );
    } finally {
      setTrackingPrompt((s) => ({ ...s, [key]: false }));
    }
  }

  async function handleHistoryDays(days: number) {
    if (!websiteId) return;
    setHistoryDays(days);
    const t = await getAiPromptHistory(
      websiteId,
      days,
    ).catch(() => null);
    setTrends(
      Array.isArray((t as any)?.trends)
        ? (t as any).trends
        : [],
    );
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
        tourAnchor="discover-ai-visibility"
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
          {/* Phase 6 — AI Search Command Center hierarchy. */}
          <Panel
            eyebrow="Command center"
            title="How often is your business appearing in AI answers?"
            description="Evidence-backed visibility across tracked prompts — biggest opportunity first, then citation, coverage, competitors, sources, diagnosis and actions."
          >
            {!commandCenter ? (
              <EmptyState
                title="Command Center unavailable"
                description="No composed AI-search state yet. Track prompts and record observations to unlock it."
              />
            ) : (
              <div className="space-y-4">
                {commandCenter.biggestOpportunity ? (
                  <RecommendationCallout
                    title={`Do this first — ${commandCenter.biggestOpportunity.prompt}`}
                    text={`${commandCenter.biggestOpportunity.why} Priority: ${commandCenter.biggestOpportunity.priority}.`}
                    actionLabel="Open roadmap"
                    actionHref="/roadmap"
                  />
                ) : (
                  <EmptyState
                    title="No evidence-backed first move yet"
                    description="RENKOO does not have enough observable answers to recommend a single first move."
                  />
                )}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Metric
                    label="Mention rate"
                    value={
                      commandCenter.metrics?.mentionRate ===
                      null
                        ? 'Insufficient data'
                        : fmtPct(
                            commandCenter.metrics
                              ?.mentionRate,
                          )
                    }
                    detail="Mentions / observable answers"
                  />
                  <Metric
                    label="Citation rate"
                    value={
                      commandCenter.metrics?.citationRate ===
                      null
                        ? 'Insufficient data'
                        : fmtPct(
                            commandCenter.metrics
                              ?.citationRate,
                          )
                    }
                    detail="Citations / observable answers"
                  />
                  <Metric
                    label="Visibility index"
                    value={
                      commandCenter.index?.score === null
                        ? '—'
                        : String(
                            commandCenter.index?.score,
                          )
                    }
                    detail={String(
                      commandCenter.index?.band ??
                        'INSUFFICIENT_DATA',
                    )}
                  />
                  <Metric
                    label="Observable prompts"
                    value={fmtInt(
                      commandCenter.metrics
                        ?.promptsObservable ?? 0,
                    )}
                    detail={`Tracked ${fmtInt(commandCenter.metrics?.promptsTracked ?? 0)}`}
                  />
                </div>
                {Array.isArray(
                  commandCenter.radar,
                ) &&
                commandCenter.radar.length > 0 ? (
                  <div>
                    <h3 className="rk-h3">
                      Competitor radar
                    </h3>
                    <DataTable
                      caption="Competitors observed in AI answers"
                      columns={[
                        {
                          key: 'competitor',
                          label: 'Competitor',
                        },
                        {
                          key: 'promptsAppeared',
                          label: 'Appeared',
                        },
                        {
                          key: 'promptsCited',
                          label: 'Cited',
                        },
                      ]}
                      rows={commandCenter.radar.slice(
                        0,
                        5,
                      )}
                      keyOf={(row: any, index: number) =>
                        String(
                          row?.competitor ?? index,
                        )
                      }
                      emptyTitle="No competitors observed"
                      emptyDescription="Competitors appear here once observations record them."
                    />
                  </div>
                ) : null}
                {Array.isArray(
                  commandCenter.opportunities,
                ) &&
                commandCenter.opportunities.length > 0 ? (
                  <div className="space-y-2">
                    <h3 className="rk-h3">
                      Recommended actions
                    </h3>
                    {commandCenter.opportunities
                      .slice(0, 3)
                      .map((opp: any) => (
                        <NextAction
                          key={opp.kind}
                          label={opp.title}
                          detail={`${opp.why} Measure: ${opp.measurement}`}
                          href="/roadmap"
                        />
                      ))}
                    {oppMsg ? (
                      <p className="rk-body">{oppMsg}</p>
                    ) : null}
                  </div>
                ) : null}
                {Array.isArray(
                  commandCenter.unavailable,
                ) &&
                commandCenter.unavailable.length > 0 ? (
                  <EvidenceList
                    items={commandCenter.unavailable.map(
                      (u: any) => ({
                        text: `${u.reason} ${u.unlocks}`,
                        source: 'Gap',
                      }),
                    )}
                  />
                ) : null}
              </div>
            )}
          </Panel>

          {/* Phase 8E — Next Best Action hero (fused evidence). */}
          <Panel
            eyebrow="Next best action"
            title="Your biggest growth opportunity"
            description="One decision fused from Search + AI + technical evidence. No scores — existing priorities only."
          >
            {!nextBest?.action ? (
              <EmptyState
                title="No evidence-backed next move yet"
                description={String(
                  nextBest?.reason ??
                    'Generate strategy opportunities or track AI prompts to unlock the next move.',
                )}
              />
            ) : (
              <div className="space-y-4">
                <RecommendationCallout
                  title={`DO: ${nextBest.action.title}`}
                  text={`WHY: ${nextBest.why}`}
                  actionLabel="Why this recommendation?"
                  onAction={() =>
                    setEvidenceOpen(true)
                  }
                />
                <div className="flex flex-wrap gap-2">
                  {(nextBest.evidence ?? [])
                    .slice(0, 6)
                    .map(
                      (
                        item: any,
                        index: number,
                      ) => (
                        <StatusChip
                          key={index}
                          status={`${item.source} ${item.state}`}
                        />
                      ),
                    )}
                </div>
                <NextAction
                  label={`Measure: ${nextBest.action.measurement}`}
                  detail={`Priority ${nextBest.action.priority} · ${nextBest.traceability?.note ?? ''}`}
                  href="/roadmap"
                />
              </div>
            )}
          </Panel>

          {/* Phase 11 — ranking movement summary. */}
          {rankOverview &&
          (rankOverview.tracked ?? 0) > 0 ? (
            <Panel
              eyebrow="Rank movement"
              title="Google ranking movement"
              description="Persistent observations from labeled sources. GSC averages are VERIFIED window means — never exact ranks."
            >
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Metric
                  label="Tracked"
                  value={fmtInt(
                    rankOverview.tracked ?? 0,
                  )}
                  detail="keywords with history"
                />
                <Metric
                  label="Gaining"
                  value={fmtInt(
                    rankOverview.gaining ?? 0,
                  )}
                  detail="observed improvement"
                />
                <Metric
                  label="Losing"
                  value={fmtInt(
                    rankOverview.losing ?? 0,
                  )}
                  detail="observed decline"
                />
                <Metric
                  label="Top 10"
                  value={fmtInt(
                    rankOverview.top10 ?? 0,
                  )}
                  detail="currently top-10"
                />
              </div>
              {Array.isArray(
                rankOverview.keywords,
              ) &&
              rankOverview.keywords.length > 0 ? (
                <div className="mt-3">
                  <EvidenceList
                    items={rankOverview.keywords
                      .slice(0, 5)
                      .map((row: any) => ({
                        text: `“${row.keyword}” ${row.current === null ? 'not observed' : `#${row.current}`} ${row.change !== null && row.change !== 0 ? `(${row.change > 0 ? '+' : ''}${row.change})` : ''} [${row.source}]`,
                        source: row.movement,
                      }))}
                  />
                </div>
              ) : null}
              <div className="mt-3">
                <NextAction
                  label="Open rank tracking"
                  detail="Positions, changes and ranking URLs live under Keywords."
                  href="/keywords"
                />
              </div>
            </Panel>
          ) : null}

          <Panel
            eyebrow="Monitoring"
            title="What changed since your last run?"
            description="Continuous prompt monitoring with append-only history — baseline first, never interpolated, never invented."
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Metric
                  label="Monitoring"
                  value={String(
                    monitorStatus?.status ??
                      'NOT_CONFIGURED',
                  )}
                  detail={
                    monitorStatus?.nextRunAt
                      ? `Next run ${fmtDate(monitorStatus.nextRunAt)}`
                      : 'No schedule yet'
                  }
                />
                <Metric
                  label="Last run"
                  value={String(
                    monitorStatus?.lastRun?.status ??
                      '—',
                  )}
                  detail={
                    monitorStatus?.lastRun?.completedAt
                      ? `Finished ${fmtDate(monitorStatus.lastRun.completedAt)}`
                      : 'No runs yet'
                  }
                />
                <Metric
                  label="Citations gained / lost"
                  value={
                    monitorChanges?.summary
                      ? `${fmtInt(monitorChanges.summary.citationsGained)} / ${fmtInt(monitorChanges.summary.citationsLost)}`
                      : '—'
                  }
                  detail="Latest vs previous observations"
                />
                <Metric
                  label="Credit used (last run)"
                  value={fmtInt(
                    monitorStatus?.lastRun?.creditUsed ??
                      0,
                  )}
                  detail="Successful runs only — failures free"
                />
              </div>
              {monitorHealth ? (
                <div className="space-y-2">
                  <p className="rk-body">
                    {monitorHealth.lastSuccessfulRun
                      ? `Last successful run ${fmtDate(monitorHealth.lastSuccessfulRun.completedAt)}.`
                      : 'No successful run yet.'}{' '}
                    {monitorHealth.consecutiveFailures >
                    0
                      ? `${monitorHealth.consecutiveFailures} consecutive failure(s) — check the last run reason.`
                      : 'No failure streak.'}{' '}
                    {monitorHealth.staleRuns > 0
                      ? `${monitorHealth.staleRuns} stale run(s) recovered as FAILED — retry safely, completed work is kept.`
                      : 'No stale runs.'}
                  </p>
                  {monitorHealth.credits?.blocked ? (
                    <ErrorState
                      title="Credits blocked"
                      description={String(
                        monitorHealth.credits
                          ?.reason ??
                          'Allowance exhausted.',
                      )}
                      onRetry={() =>
                        void handleRefresh()
                      }
                    />
                  ) : null}
                  {monitorHealth.lastRun &&
                  (monitorHealth.lastRun.status ===
                    'FAILED' ||
                    monitorHealth.lastRun.status ===
                      'PARTIAL') ? (
                    <p className="rk-body">
                      Current run state:{' '}
                      {monitorHealth.lastRun.status}.
                      Partial runs keep successful
                      observations — only failed work
                      retries.
                    </p>
                  ) : null}
                  {monitorHealth.currentRunning ? (
                    <p className="rk-body">
                      Running — last heartbeat{' '}
                      {monitorHealth.currentRunning
                        .heartbeatAgeMs === null
                        ? 'just now'
                        : `${Math.max(0, Math.round(monitorHealth.currentRunning.heartbeatAgeMs / 1000))}s ago`}
                      . Long runs keep beating; only
                      silent workers are recovered.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {monitorChanges?.baseline ? (
                <EmptyState
                  title="Baseline established"
                  description={monitorChanges.baseline}
                />
              ) : monitorChanges?.summary ? (
                <div className="space-y-2">
                  <p className="rk-body">
                    {monitorChanges.summary.headline}
                  </p>
                  {monitorChanges.summary.biggestWin ? (
                    <NextAction
                      label={`Biggest win — ${monitorChanges.summary.biggestWin.prompt.slice(0, 70)}`}
                      detail={`${monitorChanges.summary.biggestWin.primary} on ${monitorChanges.summary.biggestWin.surface}`}
                      href="/roadmap"
                    />
                  ) : null}
                  {monitorChanges.summary.biggestLoss ? (
                    <NextAction
                      label={`Biggest loss — ${monitorChanges.summary.biggestLoss.prompt.slice(0, 70)}`}
                      detail={`${monitorChanges.summary.biggestLoss.primary} on ${monitorChanges.summary.biggestLoss.surface}`}
                      href="/roadmap"
                    />
                  ) : null}
                </div>
              ) : (
                <EmptyState
                  title="No change data yet"
                  description="Run monitoring to establish the baseline."
                />
              )}
              {Array.isArray(
                monitorHistory?.trend,
              ) &&
              monitorHistory.trend.length > 0 ? (
                <div>
                  <h3 className="rk-h3">
                    Mention & citation trend
                  </h3>
                  <TrendChart
                    state="ready"
                    points={monitorHistory.trend.map(
                      (b: any) => ({
                        date: b.day,
                        value: b.mentions,
                      }),
                    )}
                    summary={`${monitorHistory.observations} observations in window. Missing days remain missing.`}
                    formatValue={(v) => fmtInt(v)}
                    emptyTitle="No trend yet"
                    emptyDescription="Observations accumulate per run."
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {([7, 30, 90] as const).map(
                      (days) => (
                        <SecondaryButton
                          key={days}
                          type="button"
                          onClick={() =>
                            void (async () => {
                              setMonitorHistoryDays(
                                days,
                              );
                              const next =
                                await getAiMonitorHistory(
                                  websiteId,
                                  days,
                                ).catch(() => null);
                              if (next)
                                setMonitorHistory(
                                  next,
                                );
                            })()
                          }
                        >
                          {days}d
                          {monitorHistoryDays ===
                          days
                            ? ' ✓'
                            : ''}
                        </SecondaryButton>
                      ),
                    )}
                  </div>
                </div>
              ) : null}
              <div className="space-y-2">
                <h3 className="rk-h3">
                  Setup — prompt set → surfaces →
                  cadence
                </h3>
                <FilterBar
                  selects={[
                    {
                      key: 'cadence',
                      label: 'Cadence',
                      value: setupCadence,
                      options: [
                        {
                          value: 'DAILY',
                          label: 'Daily',
                        },
                        {
                          value: 'WEEKLY',
                          label: 'Weekly',
                        },
                      ],
                      onChange: setSetupCadence,
                    },
                    {
                      key: 'surfaces',
                      label: 'Surfaces',
                      value: setupSurfaces,
                      options: [
                        {
                          value: 'GEMINI',
                          label: 'Gemini',
                        },
                        {
                          value: 'OPENAI',
                          label: 'OpenAI',
                        },
                        {
                          value: 'GEMINI,OPENAI',
                          label: 'Gemini + OpenAI',
                        },
                      ],
                      onChange: setSetupSurfaces,
                    },
                  ]}
                  searchValue=""
                  searchPlaceholder=""
                  onSearchChange={() => undefined}
                />
                <div className="flex flex-wrap gap-2">
                  <PrimaryButton
                    type="button"
                    disabled={setupBusy || !websiteId}
                    onClick={() =>
                      void (async () => {
                        try {
                          setSetupBusy(true);
                          setSetupMsg('');
                          const surfaces =
                            setupSurfaces
                              .split(',')
                              .map((s) =>
                                s.trim(),
                              )
                              .filter(Boolean);
                          const est =
                            await estimateAiMonitorRun(
                              {
                                websiteId,
                                surfaces,
                              },
                            );
                          if (!est.guard.allowed) {
                            setSetupMsg(
                              est.guard.reason,
                            );
                            return;
                          }
                          await createAiMonitorSchedule(
                            {
                              websiteId,
                              surfaces,
                              cadence:
                                setupCadence,
                            },
                          );
                          setSetupMsg(
                            `Schedule created — about ${est.perRun.billableEstimate} check(s) per run, ~${est.estimatedMonthlyChecks}/month.`,
                          );
                          const sched =
                            await listAiMonitorSchedules(
                              websiteId,
                            ).catch(() => []);
                          setSchedules(
                            Array.isArray(sched)
                              ? sched
                              : [],
                          );
                        } catch (err: any) {
                          setSetupMsg(
                            err?.message ||
                              'Could not create the schedule.',
                          );
                        } finally {
                          setSetupBusy(false);
                        }
                      })()
                    }
                  >
                    {setupBusy
                      ? 'Saving…'
                      : 'Confirm schedule'}
                  </PrimaryButton>
                  <SecondaryButton
                    type="button"
                    disabled={runBusy || !websiteId}
                    onClick={() =>
                      void (async () => {
                        try {
                          setRunBusy(true);
                          setMonitorRunMsg('');
                          const run =
                            await requestAiMonitorRun(
                              {
                                websiteId,
                                surfaces:
                                  setupSurfaces
                                    .split(',')
                                    .map((s) =>
                                      s.trim(),
                                    )
                                    .filter(Boolean),
                              },
                            );
                          setMonitorRunMsg(
                            `Run ${run.status}: ${run.successCount} succeeded, ${run.failureCount} failed, ${run.creditUsed} credit(s) used.`,
                          );
                          const [ms, mc, mh] =
                            await Promise.all([
                              getAiMonitoringStatus(
                                websiteId,
                              ).catch(() => null),
                              getAiMonitorChanges(
                                websiteId,
                              ).catch(() => null),
                              getAiMonitoringHealth(
                                websiteId,
                              ).catch(() => null),
                            ]);
                          if (ms)
                            setMonitorStatus(ms);
                          if (mc)
                            setMonitorChanges(mc);
                          if (mh)
                            setMonitorHealth(mh);
                        } catch (err: any) {
                          setMonitorRunMsg(
                            err?.message ||
                              'Could not start the run.',
                          );
                        } finally {
                          setRunBusy(false);
                        }
                      })()
                    }
                  >
                    {runBusy
                      ? 'Running…'
                      : 'Run now'}
                  </SecondaryButton>
                </div>
                {setupMsg ? (
                  <p className="rk-body">{setupMsg}</p>
                ) : null}
                {monitorRunMsg ? (
                  <p className="rk-body">{monitorRunMsg}</p>
                ) : null}
                {schedules.length > 0 ? (
                  <DataTable
                    caption="Active monitoring schedules"
                    columns={[
                      {
                        key: 'cadence',
                        label: 'Cadence',
                      },
                      {
                        key: 'surfaces',
                        label: 'Surfaces',
                      },
                      {
                        key: 'isActive',
                        label: 'Active',
                      },
                    ]}
                    rows={schedules.map((s: any) => ({
                      ...s,
                      surfaces: Array.isArray(
                        s.surfaces,
                      )
                        ? s.surfaces.join(', ')
                        : String(s.surfaces ?? ''),
                      isActive: s.isActive
                        ? 'Yes'
                        : 'No',
                    }))}
                    keyOf={(row: any) =>
                      String(row?.id ?? row?.cadence)
                    }
                    emptyTitle="No schedules"
                    emptyDescription="Create one above."
                  />
                ) : null}
              </div>
            </div>
          </Panel>

          <Panel
            eyebrow="Official data"
            title="Google & Bing, labeled honestly"
            description="First-party data only. VERIFIED = Search Console API. OBSERVED = your exported UI rows. Third-party answers stay separate below."
          >
            {!official ? (
              <EmptyState
                title="No official data yet"
                description="Sync Search Console demand or import exported UI rows to unlock first-party evidence."
              />
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <DataSourceBadge
                    source="Google Search Console"
                    connected={
                      (official.demand?.topQueries
                        ?.length ?? 0) > 0
                    }
                  />
                  <DataSourceBadge
                    source="Bing Webmaster"
                    connected={
                      (official.aiVisibility
                        ?.importCount ?? 0) > 0
                    }
                  />
                </div>
                <p className="rk-body">
                  {official.demand?.semantics}
                </p>
                {Array.isArray(
                  official.demand?.topQueries,
                ) &&
                official.demand.topQueries.length >
                  0 ? (
                  <div>
                    <h3 className="rk-h3">
                      Verified demand queries
                    </h3>
                    <EvidenceList
                      items={official.demand.topQueries
                        .slice(0, 5)
                        .map((q: any) => ({
                          text: `${q.query} — ${fmtInt(q.impressions)} impressions`,
                          source: 'VERIFIED',
                        }))}
                    />
                  </div>
                ) : null}
                <p className="rk-body">
                  {official.aiVisibility?.note}
                </p>
                {Array.isArray(
                  official.unavailable,
                ) &&
                official.unavailable.length > 0 ? (
                  <EvidenceList
                    items={official.unavailable.map(
                      (u: any) => ({
                        text: u.reason,
                        source: 'UNAVAILABLE',
                      }),
                    )}
                  />
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <SecondaryButton
                    type="button"
                    disabled={
                      officialBusy || !websiteId
                    }
                    onClick={() =>
                      void (async () => {
                        try {
                          setOfficialBusy(true);
                          setOfficialMsg('');
                          const res =
                            await syncOfficialGoogle(
                              {
                                websiteId,
                                days: 30,
                              },
                            );
                          setOfficialMsg(
                            `Synced ${res.stored} rows (${res.skipped} unchanged). ${res.semantics}`,
                          );
                          const next =
                            await getOfficialSummary(
                              websiteId,
                            ).catch(() => null);
                          if (next)
                            setOfficial(next);
                        } catch (err: any) {
                          setOfficialMsg(
                            err?.message ||
                              'Connect Search Console first.',
                          );
                        } finally {
                          setOfficialBusy(false);
                        }
                      })()
                    }
                  >
                    {officialBusy
                      ? 'Syncing…'
                      : 'Sync Search Console'}
                  </SecondaryButton>
                </div>
                {officialMsg ? (
                  <p className="rk-body">
                    {officialMsg}
                  </p>
                ) : null}
              </div>
            )}
          </Panel>

          {/* Phase 8D — AI Agent Activity (first-party logs only). */}
          <Panel
            eyebrow="Agent activity"
            title="AI Agent Activity"
            description="Observed crawler requests from your own logs. A visit is never a citation, mention, ranking or traffic signal."
          >
            {!agentActivity ||
            agentActivity.connected === false ? (
              <EmptyState
                title="Connect access logs to see which AI/search agents are visiting your site."
                description="Import a CSV of server or CDN access logs. IPs are hashed, tracking parameters stripped, nothing sensitive stored."
              />
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Metric
                    label="Observed agents"
                    value={fmtInt(
                      agentActivity.summary?.families
                        ?.length ?? 0,
                    )}
                    detail="User-Agent signatures"
                  />
                  <Metric
                    label="Requests"
                    value={fmtInt(
                      agentActivity.summary?.requests ??
                        0,
                    )}
                    detail="Imported log rows"
                  />
                  <Metric
                    label="Pages reached"
                    value={fmtInt(
                      agentActivity.summary?.pages ??
                        0,
                    )}
                    detail="Distinct normalized URLs"
                  />
                  <Metric
                    label="Last activity"
                    value={
                      agentActivity.summary
                        ?.lastSeen
                        ? fmtDate(
                            agentActivity.summary
                              .lastSeen,
                          )
                        : '—'
                    }
                    detail="OBSERVED_USER_AGENT"
                  />
                </div>
                <p className="rk-body">
                  {agentActivity.verificationNote}
                </p>
                {Array.isArray(
                  agentActivity.topAgents,
                ) &&
                agentActivity.topAgents.length > 0 ? (
                  <div>
                    <h3 className="rk-h3">
                      Top agents
                    </h3>
                    <DataTable
                      caption="Agents observed in imported logs"
                      columns={[
                        {
                          key: 'family',
                          label: 'Agent',
                        },
                        {
                          key: 'requests',
                          label: 'Requests',
                        },
                        {
                          key: 'pages',
                          label: 'Pages',
                        },
                      ]}
                      rows={agentActivity.topAgents.slice(
                        0,
                        8,
                      )}
                      keyOf={(row: any) =>
                        String(row?.family)
                      }
                      onRowClick={(row: any) =>
                        void (async () => {
                          try {
                            const detail =
                              await getAgentDetail(
                                websiteId,
                                String(row.family),
                              );
                            setAgentDetail(detail);
                          } catch {
                            setAgentDetail(null);
                          }
                        })()
                      }
                      emptyTitle="No agents"
                      emptyDescription="Import logs first."
                    />
                  </div>
                ) : null}
                {Array.isArray(
                  agentActivity.accessIssues,
                ) &&
                agentActivity.accessIssues.length >
                  0 ? (
                  <div>
                    <h3 className="rk-h3">
                      Access issues
                    </h3>
                    <EvidenceList
                      items={agentActivity.accessIssues
                        .slice(0, 5)
                        .map((issue: any) => ({
                          text: issue.evidence,
                          source: issue.aiRelated
                            ? 'AI agent'
                            : 'Crawler',
                        }))}
                    />
                  </div>
                ) : null}
                {agentCoverage?.headline ? (
                  <div>
                    <h3 className="rk-h3">
                      Page coverage
                    </h3>
                    <p className="rk-body">
                      {agentCoverage.headline}
                    </p>
                  </div>
                ) : null}
                {Array.isArray(
                  agentActivity.changes,
                ) &&
                agentActivity.changes.length > 0 ? (
                  <div>
                    <h3 className="rk-h3">
                      Recent changes
                    </h3>
                    <EvidenceList
                      items={agentActivity.changes
                        .slice(0, 5)
                        .map((change: any) => ({
                          text: `${change.kind}: ${change.evidence}`,
                          source: 'Change',
                        }))}
                    />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <h3 className="rk-h3">
                    Import logs (CSV, max 10MB)
                  </h3>
                  <p className="rk-body">
                    Columns: timestamp, method,
                    path/url, status, user-agent,
                    bytes, referrer, country. Preview
                    before import — malformed rows
                    never import silently.
                  </p>
                  <textarea
                    className="rk-input min-h-[120px] w-full font-mono text-xs"
                    placeholder="timestamp,method,path,status,user-agent&#10;2026-09-01T10:00:00Z,GET,/pricing,200,GPTBot/1.0"
                    value={agentCsv}
                    onChange={(event) =>
                      setAgentCsv(
                        event.target.value,
                      )
                    }
                  />
                  <div className="flex flex-wrap gap-2">
                    <SecondaryButton
                      type="button"
                      disabled={
                        agentBusy || !agentCsv.trim()
                      }
                      onClick={() =>
                        void (async () => {
                          try {
                            setAgentBusy(true);
                            setAgentMsg('');
                            const preview =
                              await previewAgentImport(
                                {
                                  csv: agentCsv,
                                  source:
                                    'MANUAL_IMPORT',
                                },
                              );
                            setAgentPreview(preview);
                            setAgentMsg(
                              `Detected ${preview.parsed} valid rows (${preview.rejected} rejected) across ${preview.families.join(', ') || 'no agents'}.`,
                            );
                          } catch (err: any) {
                            setAgentMsg(
                              err?.message ||
                                'Preview failed.',
                            );
                          } finally {
                            setAgentBusy(false);
                          }
                        })()
                      }
                    >
                      Preview
                    </SecondaryButton>
                    <PrimaryButton
                      type="button"
                      disabled={
                        agentBusy ||
                        !agentPreview ||
                        !websiteId
                      }
                      onClick={() =>
                        void (async () => {
                          try {
                            setAgentBusy(true);
                            setAgentMsg('');
                            const res =
                              await confirmAgentImport(
                                {
                                  websiteId,
                                  csv: agentCsv,
                                  source:
                                    'MANUAL_IMPORT',
                                },
                              );
                            setAgentMsg(
                              `Imported ${res.imported} rows.${res.baseline ? ` ${res.baseline}` : ''}`,
                            );
                            setAgentCsv('');
                            setAgentPreview(null);
                            const [act, cov] =
                              await Promise.all([
                                getAgentActivity(
                                  websiteId,
                                ).catch(() => null),
                                getAgentCoverage(
                                  websiteId,
                                ).catch(() => null),
                              ]);
                            if (act)
                              setAgentActivity(act);
                            if (cov)
                              setAgentCoverage(cov);
                          } catch (err: any) {
                            setAgentMsg(
                              err?.message ||
                                'Import failed.',
                            );
                          } finally {
                            setAgentBusy(false);
                          }
                        })()
                      }
                    >
                      Confirm import
                    </PrimaryButton>
                  </div>
                  {agentMsg ? (
                    <p className="rk-body">
                      {agentMsg}
                    </p>
                  ) : null}
                </div>
              </div>
            )}
          </Panel>

          <Panel
            eyebrow="Prompt Lab"
            title="Prompt universe"
            description="Every prompt names its evidence — generated from tracked keywords, SERP terms, content and competitors. Never random."
          >            <FilterBar
              selects={[
                {
                  key: 'lab-group',
                  label: 'Group',
                  value: labGroup,
                  options: [
                    { value: 'ALL', label: 'All groups' },
                    ...((lab?.groups ?? []) as string[]).map(
                      (g: string) => ({
                        value: g,
                        label: g,
                      }),
                    ),
                  ],
                  onChange: setLabGroup,
                },
              ]}
              searchValue={labQuery}
              searchPlaceholder="Search prompts, topics…"
              onSearchChange={setLabQuery}
            />
            {!lab ||
            !Array.isArray(lab.prompts) ||
            lab.prompts.length === 0 ? (
              <EmptyState
                title="No lab prompts yet"
                description="Generate a prompt set to populate the universe."
              />
            ) : (
              <DataTable
                caption="Prompt universe from real evidence"
                columns={[
                  { key: 'prompt', label: 'Prompt' },
                  { key: 'intent', label: 'Intent' },
                  { key: 'topic', label: 'Topic' },
                ]}
                rows={(lab.prompts as any[])
                  .filter(
                    (p: any) =>
                      (labGroup === 'ALL' ||
                        (p.groups ?? []).includes(
                          labGroup,
                        )) &&
                      (!labQuery ||
                        String(p.prompt)
                          .toLowerCase()
                          .includes(
                            labQuery.toLowerCase(),
                          )),
                  )
                  .slice(0, 10)
                  .map((p: any) => ({
                    ...p,
                    prompt:
                      String(p.prompt).slice(0, 80) ||
                      '—',
                  }))}
                keyOf={(row: any, index: number) =>
                  String(row?.prompt ?? index)
                }
                onRowClick={(row: any) =>
                  void (async () => {
                    try {
                      setDetailLoading(true);
                      setPromptTimeline(null);
                      const fullPrompt = String(
                        (lab.prompts as any[]).find(
                          (p: any) =>
                            String(
                              p.prompt,
                            ).slice(0, 80) ===
                            row.prompt,
                        )?.prompt ?? row.prompt,
                      );
                      const [detail, timeline] =
                        await Promise.all([
                          getAiPromptDetail(
                            websiteId,
                            fullPrompt,
                          ),
                          getAiMonitorPromptHistory(
                            websiteId,
                            fullPrompt,
                          ).catch(() => null),
                        ]);
                      setPromptDetail(detail);
                      setPromptTimeline(timeline);
                    } catch {
                      setPromptDetail(null);
                    } finally {
                      setDetailLoading(false);
                    }
                  })()
                }
                emptyTitle="No prompts match"
                emptyDescription="Adjust the group filter or search."
              />
            )}
          </Panel>

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

          {/*
           * Phase 6 — AI Search Intelligence 1.0.
           * Unified layer over existing evidence:
           * prompts → answers → citations → competitors
           * → diagnoses → roadmap candidates → history.
           * Every figure carries its evidence state;
           * missing data renders as designed
           * UNAVAILABLE, never as broken or faked.
           */}
          <Panel
            eyebrow="Prompt intelligence"
            title="AI prompt set"
            description="Bounded, deduplicated prompts generated from your tracked keywords. No provider calls, no credits."
            actions={
              <SecondaryButton
                type="button"
                onClick={() =>
                  void handleGeneratePromptSet()
                }
                disabled={generating}
              >
                {generating
                  ? 'Generating…'
                  : 'Generate set'}
              </SecondaryButton>
            }
          >
            {genMsg ? (
              <p className="rk-body mb-2">{genMsg}</p>
            ) : null}
            {generatedPrompts.length > 0 ? (
              <ul className="divide-y divide-rk-border">
                {generatedPrompts
                  .slice(0, 20)
                  .map((p: any, i: number) => {
                    const key = String(p.text || i);
                    const tracked = queries.some(
                      (q: any) =>
                        String(
                          q.query || q.text || '',
                        ).toLowerCase() ===
                        key.toLowerCase(),
                    );
                    return (
                      <li
                        key={i}
                        className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-rk-ink">
                            {key}
                          </p>
                          <p className="rk-body mt-0.5">
                            {String(
                              p.intent || 'INFORMATIONAL',
                            ).replace(/_/g, ' ')}{' '}
                            · {String(p.evidenceSource || 'UNKNOWN')}
                          </p>
                        </div>
                        {tracked ? (
                          <StatusChip status="TRACKED" />
                        ) : (
                          <SecondaryButton
                            onClick={() =>
                              void handleTrackPrompt(p)
                            }
                            disabled={
                              trackingPrompt[key]
                            }
                          >
                            {trackingPrompt[key]
                              ? 'Tracking…'
                              : 'Track'}
                          </SecondaryButton>
                        )}
                      </li>
                    );
                  })}
              </ul>
            ) : (
              <EmptyState
                title="No generated set yet"
                description="Generate a bounded prompt set from your existing tracked keywords."
              />
            )}
          </Panel>

          <Panel
            eyebrow="Source intelligence"
            title="Citation domains"
            description="Which sources AI answers actually cite. Extracted from recorded answers, never assumed."
          >
            {citations.length > 0 ? (
              <DataTable
                caption="Source domains cited by recorded AI answers"
                columns={[
                  {
                    key: 'domain',
                    label: 'Domain',
                    priority: 'high',
                  },
                  {
                    key: 'citations',
                    label: 'Citations',
                    priority: 'high',
                  },
                  {
                    key: 'queries',
                    label: 'Prompts',
                    priority: 'medium',
                  },
                ]}
                rows={citations.slice(0, 10).map(
                  (c: any, i: number) => ({
                    id: String(c.domain || i),
                    domain: String(c.domain || '—'),
                    citations: fmtInt(c.citations),
                    queries: Array.isArray(c.queries)
                      ? String(c.queries.length)
                      : '—',
                  }),
                )}
                keyOf={(r: any) => r.id}
                emptyTitle="No citations recorded"
                emptyDescription="Citations appear once recorded answers contain source links."
              />
            ) : (
              <EmptyState
                title="Citation data unavailable"
                description="No recorded AI answer has contained a source link yet. Record an observation with a response to populate this."
              />
            )}
          </Panel>

          <Panel
            eyebrow="Competitor intelligence"
            title="Where competitors are winning"
            description="Brand versus competitor presence across recorded AI answers."
          >
            {shareOfVoice ? (
              <div className="mb-3 flex flex-wrap gap-2">
                <StatusChip
                  status={`Brand ${fmtPct(shareOfVoice.brand)}`}
                />
                <StatusChip
                  status={`Competitors ${fmtPct(shareOfVoice.competitors)}`}
                />
              </div>
            ) : null}
            {competitorTracked.length > 0 ||
            competitorUnlisted.length > 0 ? (
              <DataTable
                caption="Competitor presence across recorded AI answers"
                columns={[
                  {
                    key: 'name',
                    label: 'Competitor',
                    priority: 'high',
                  },
                  {
                    key: 'mentions',
                    label: 'Mentions',
                    priority: 'high',
                  },
                  {
                    key: 'source',
                    label: 'Source',
                    priority: 'medium',
                  },
                ]}
                rows={[
                  ...competitorTracked.map(
                    (c: any, i: number) => ({
                      id: `t-${i}`,
                      name: String(c.name || '—'),
                      mentions: fmtInt(c.mentions),
                      source: 'Tracked',
                    }),
                  ),
                  ...competitorUnlisted
                    .slice(0, 5)
                    .map((c: any, i: number) => ({
                      id: `u-${i}`,
                      name: String(c.name || '—'),
                      mentions: fmtInt(c.mentions),
                      source: 'Observed',
                    })),
                ].slice(0, 10)}
                keyOf={(r: any) => r.id}
                emptyTitle="No competitor mentions"
                emptyDescription="Competitors appear here once recorded answers mention them."
              />
            ) : (
              <EmptyState
                title="Competitor comparison unavailable"
                description="No recorded AI answer has mentioned a competitor yet."
              />
            )}
          </Panel>

          {matrixRows.length > 0 && (
            <Panel
              eyebrow="Prompt comparison"
              title="Prompt-by-prompt presence"
              description="Brand and competitor presence per tracked prompt."
            >
              <ul className="divide-y divide-rk-border">
                {matrixRows.slice(0, 10).map(
                  (row: any, i: number) => (
                    <li key={i} className="py-2.5">
                      <p className="text-sm font-semibold text-rk-ink">
                        {String(row.prompt || 'Prompt')}
                      </p>
                      <p className="rk-body mt-0.5">
                        {row.brandPresent
                          ? row.brandCited
                            ? 'Mentioned and cited.'
                            : 'Mentioned, not cited.'
                          : 'Not mentioned.'}{' '}
                        {Array.isArray(
                          row.competitorsPresent,
                        ) &&
                        row.competitorsPresent.length >
                          0
                          ? `Competitors seen: ${row.competitorsPresent.slice(0, 3).join(', ')}.`
                          : 'No competitors seen.'}{' '}
                        {row.evidenceState === 'UNAVAILABLE'
                          ? 'No observations recorded.'
                          : `${num(row.prompts)} observation(s).`}
                      </p>
                    </li>
                  ),
                )}
              </ul>
            </Panel>
          )}

          {diagnoses.length > 0 && (
            <Panel
              eyebrow="Why are we losing"
              title="Evidence-backed diagnoses"
              description="Each diagnosis carries its evidence. No unsupported claims."
            >
              <ul className="divide-y divide-rk-border">
                {diagnoses.slice(0, 8).map(
                  (d: any, i: number) => (
                    <li key={i} className="py-2.5">
                      <p className="text-sm font-semibold text-rk-ink">
                        {String(
                          d.headline || d.diagnosis || 'Diagnosis',
                        )}
                      </p>
                      <p className="rk-body mt-0.5">
                        {String(d.prompt || '')}
                        {d.evidenceState
                          ? ` · Evidence: ${String(d.evidenceState)}`
                          : ''}
                      </p>
                      {d?.action?.href ? (
                        <Link
                          href={String(d.action.href)}
                          className="rk-link text-sm"
                        >
                          {String(
                            d.action.label ||
                              'Take action',
                          )}{' '}
                          →
                        </Link>
                      ) : null}
                    </li>
                  ),
                )}
              </ul>
            </Panel>
          )}

          {candidates.length > 0 && (
            <Panel
              eyebrow="Roadmap input"
              title="AI actions for your #1 roadmap"
              description="These extend the existing roadmap — same priorities, same horizons. Open the roadmap to schedule them."
              actions={
                <Link href="/roadmap">
                  <SecondaryButton type="button">
                    Open roadmap
                  </SecondaryButton>
                </Link>
              }
            >
              <ul className="divide-y divide-rk-border">
                {candidates
                  .slice(0, 6)
                  .map((c: any, i: number) => (
                    <li key={i} className="py-2.5">
                      <p className="text-sm font-semibold text-rk-ink">
                        {String(c.title || 'Action')}
                      </p>
                      <p className="rk-body mt-0.5">
                        {String(c.why || '').slice(0, 220)}
                      </p>
                      <p className="rk-body mt-0.5">
                        Priority {String(c.strategyPriority || '—')} ·
                        Impact {String(c.impact || '—')} ·
                        Effort {String(c.effort || '—')}
                      </p>
                    </li>
                  ))}
              </ul>
            </Panel>
          )}

          <Panel
            eyebrow="Historical movement"
            title="Prompt movement"
            description="First observation sets the baseline. Movement is measured only against recorded observations."
            actions={
              <div className="flex gap-2">
                {[7, 30, 90].map((days) => (
                  <SecondaryButton
                    key={days}
                    type="button"
                    onClick={() =>
                      void handleHistoryDays(days)
                    }
                    disabled={historyDays === days}
                  >
                    {days}d
                  </SecondaryButton>
                ))}
              </div>
            }
          >
            {trends.length > 0 ? (
              <ul className="divide-y divide-rk-border">
                {trends.slice(0, 10).map(
                  (t: any, i: number) => (
                    <li key={i} className="py-2.5">
                      <p className="text-sm font-semibold text-rk-ink">
                        {String(t.prompt || 'Prompt')}
                      </p>
                      <p className="rk-body mt-0.5">
                        {String(
                          t.status || 'INSUFFICIENT_DATA',
                        ).replace(/_/g, ' ')}
                        {' — '}
                        {String(
                          t.note || 'No movement recorded.',
                        )}
                      </p>
                    </li>
                  ),
                )}
              </ul>
            ) : (
              <InsufficientHistoryState
                title="No prompt history yet"
                description="Record observations for a prompt twice to start measuring movement."
              />
            )}
          </Panel>

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

      {/* Phase 6 — AI Search detail view: prompt → visibility → why → what-to-do. */}
      <Drawer
        open={Boolean(promptDetail) || detailLoading}
        onClose={() => {
          setPromptDetail(null);
          setPromptTimeline(null);
        }}
        title={promptDetail?.prompt ?? 'AI prompt detail'}
        description={
          promptDetail
            ? `Visibility: ${promptDetail.visibilityState} · Intent: ${promptDetail.intent}`
            : 'Loading the strongest screen in RENKOO…'
        }
      >
        {detailLoading && !promptDetail ? (
          <LoadingBlock title="Loading prompt evidence" />
        ) : promptDetail ? (
          <>
            <DrawerMeta
              items={[
                {
                  label: 'Brand mentioned',
                  value: promptDetail.brandMentioned
                    ? 'Yes'
                    : 'No',
                },
                {
                  label: 'Brand cited',
                  value: promptDetail.brandCited
                    ? 'Yes'
                    : 'No',
                },
                {
                  label: 'Competitors',
                  value: String(
                    promptDetail.competitorMentions
                      ?.length ?? 0,
                  ),
                },
              ]}
            />
            {Array.isArray(promptDetail.why) &&
            promptDetail.why.length > 0 ? (
              <DrawerSection title="Why you are / aren't visible">
                <EvidenceList
                  items={promptDetail.why.map(
                    (w: any) => ({
                      text: `${w.label}: ${w.evidence}`,
                      source:
                        w.passed === false
                          ? 'Gap'
                          : 'Evidence',
                    }),
                  )}
                />
              </DrawerSection>
            ) : null}
            {Array.isArray(promptDetail.whatToDo) &&
            promptDetail.whatToDo.length > 0 ? (
              <DrawerSection title="What to do">
                <div className="space-y-2">
                  {promptDetail.whatToDo.map(
                    (todo: any) => (
                      <div
                        key={todo.kind}
                        className="flex flex-col gap-2"
                      >
                        <NextAction
                          label={todo.title}
                          detail={`${todo.why} Measure: ${todo.measurement}`}
                          href="/roadmap"
                        />
                        <SecondaryButton
                          type="button"
                          disabled={Boolean(
                            oppBusy[todo.kind],
                          )}
                          onClick={() =>
                            void (async () => {
                              try {
                                setOppBusy((prev) => ({
                                  ...prev,
                                  [todo.kind]: true,
                                }));
                                setOppMsg('');
                                await createAiOpportunity({
                                  websiteId,
                                  kind: todo.kind,
                                  title: todo.title,
                                  prompt:
                                    promptDetail.prompt,
                                  topic:
                                    promptDetail.prompt,
                                  priority:
                                    todo.priority,
                                  why: todo.why,
                                });
                                setOppMsg(
                                  `Recommendation created for ${todo.kind}. Convert it to an action from Opportunities.`,
                                );
                              } catch (err: any) {
                                setOppMsg(
                                  err?.message ||
                                    'Could not create the recommendation.',
                                );
                              } finally {
                                setOppBusy((prev) => ({
                                  ...prev,
                                  [todo.kind]: false,
                                }));
                              }
                            })()
                          }
                        >
                          {oppBusy[todo.kind]
                            ? 'Creating…'
                            : 'Create recommendation'}
                        </SecondaryButton>
                      </div>
                    ),
                  )}
                </div>
              </DrawerSection>
            ) : null}
            <DrawerSection title="Trust">
              <p className="rk-body">
                Recorded observations only. INSUFFICIENT
                DATA is shown instead of 0% when evidence
                is missing.
              </p>
            </DrawerSection>
            {promptTimeline &&
            Array.isArray(promptTimeline.rows) &&
            promptTimeline.rows.length > 0 ? (
              <DrawerSection title="History timeline">
                <EvidenceList
                  items={promptTimeline.rows
                    .slice(0, 10)
                    .map((entry: any) => ({
                      text: `${entry.surface} · ${entry.status} · mentioned ${entry.mentioned ? 'yes' : 'no'} · cited ${entry.citationFound ? 'yes' : 'no'} — ${entry.observedAt ? fmtDate(entry.observedAt) : 'date unavailable'}`,
                      source: 'Observation',
                    }))}
                />
                {Array.isArray(
                  promptTimeline.changes,
                ) &&
                promptTimeline.changes.length > 0 ? (
                  <p className="rk-body">
                    {promptTimeline.changes
                      .map(
                        (c: any) =>
                          `${c.surface}: ${c.primary}`,
                      )
                      .join(' · ')}
                  </p>
                ) : null}
              </DrawerSection>
            ) : null}
          </>
        ) : null}
      </Drawer>
      {/* Phase 8D — agent detail (first-party evidence only). */}
      <Drawer
        open={Boolean(agentDetail)}
        onClose={() => setAgentDetail(null)}
        title={
          agentDetail
            ? `${agentDetail.family} — agent detail`
            : 'Agent detail'
        }
        description="Observed requests from imported logs. Never traffic, never citations."
      >
        {agentDetail ? (
          <>
            <DrawerMeta
              items={[
                {
                  label: 'Type',
                  value: String(
                    agentDetail.category ?? 'UNKNOWN',
                  ),
                },
                {
                  label: 'Verification',
                  value: String(
                    agentDetail.verificationState ??
                      'OBSERVED_USER_AGENT',
                  ),
                },
                {
                  label: 'Requests',
                  value: String(
                    agentDetail.requests ?? 0,
                  ),
                },
              ]}
            />
            <DrawerSection title="Top requested pages">
              <EvidenceList
                items={(
                  agentDetail.pagesDetail ?? []
                )
                  .slice(0, 10)
                  .map((page: any) => ({
                    text: `${page.url} — ${page.requests} request(s), statuses ${(page.statuses ?? []).join('/') || '—'}`,
                    source: 'Observation',
                  }))}
              />
            </DrawerSection>
            <DrawerSection title="Trust">
              <p className="rk-body">
                Identity from User-Agent signature
                (spoofable). No reverse-DNS
                verification in this phase — rows
                stay OBSERVED_USER_AGENT.
              </p>
            </DrawerSection>
          </>
        ) : null}
      </Drawer>
      {/* Phase 8E — evidence drawer (why this recommendation). */}
      <Drawer
        open={evidenceOpen}
        onClose={() => setEvidenceOpen(false)}
        title="Why this recommendation?"
        description="Every claim names its source and evidence state. Long URLs wrap safely."
      >
        {nextBest?.action ? (
          <>
            <DrawerMeta
              items={[
                {
                  label: 'Category',
                  value: String(
                    nextBest.action.category ?? '—',
                  ),
                },
                {
                  label: 'Priority',
                  value: String(
                    nextBest.action.priority ?? '—',
                  ),
                },
                {
                  label: 'Execution',
                  value: String(
                    nextBest.traceability
                      ?.actionStatus ??
                      'NOT_STARTED',
                  ),
                },
              ]}
            />
            <DrawerSection title="Evidence">
              <EvidenceList
                items={(
                  nextBest.evidence ?? []
                ).map((item: any) => ({
                  text: `[${item.source} · ${item.state}] ${item.summary}${item.page ? ` — ${item.page}` : ''}${item.keyword ? ` — “${item.keyword}”` : ''}`,
                  source: item.state,
                }))}
              />
            </DrawerSection>
            <DrawerSection title="Measurement">
              <p className="rk-body break-words">
                {String(
                  nextBest.action.measurement ?? '',
                )}
              </p>
            </DrawerSection>
            <DrawerSection title="Traceability">
              <NextAction
                label={
                  nextBest.traceability
                    ?.recommendationId
                    ? 'Open existing recommendation'
                    : 'No execution action available.'
                }
                detail={String(
                  nextBest.traceability?.note ?? '',
                )}
                href="/roadmap"
              />
            </DrawerSection>
          </>
        ) : null}
      </Drawer>
    </AppShell>
  );
}

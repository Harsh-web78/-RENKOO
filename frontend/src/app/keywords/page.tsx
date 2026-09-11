'use client';

/*
 * RENKOO Keyword Research 2.0.
 *
 * Discover (new opportunities from real site + competitor
 * crawl evidence) + Your Keywords (measured GSC performance,
 * preserved) + Competitors (keyword gap, preserved backend).
 *
 * Honesty contract: search volume, KD, CPC, Traffic
 * Potential, trend and SERP render as "— Not available"
 * until a real provider connects. Opportunity Score is a
 * transparent rule over available signals only, with
 * "Why this score?" on every row.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  analyzeGoogleOpportunity,
  clusterKeywords,
  clusterSerpKeywords,
  createAction,
  createTrackedLocalQuery,
  generateContentBrief,
  getCompetitors,
  getGoogleConnectionStatus,
  getGoogleQueries,
  getKeywordGap,
  getKeywordSerp,
  getKeywordStrategy,
  getKeywordUniverse,
  getKeywordUsage,
  getLinkRecommendations,
  getOrphanCandidates,
  getQuickWins2,
  getStrategyBrief,
  getStrategyLinks,
  getWebsites,
  listStrategyBriefs,
  lookupCompetitorKeywords,
  researchKeywords,
  getRankOverview,
  trackRanks,
  syncGscRanks,
  getRankChanges,
  getTopicIntelligence,
  type GoogleQueryRow,
  type LinkRecommendation,
  type MonthlyPoint,
  type OrphanCandidate,
  type ResearchCluster,
  type ResearchIdea,
  type ResearchResponse,
  type SerpCluster,
  type SerpObservation,
  type SerpResultRow,
  type SerpScoring,
  type StrategyAction,
  type StrategyBucket,
  type StrategyContentStatus,
  type StrategyOpportunity,
  type StrategyResponse,
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
  GhostButton,
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
  EvidenceList,
  RecommendationCallout,
  NextAction,
  type DataTableColumn,
} from '@/components/ui';
import {
  actionTypeLabel,
  bucketLabel,
  bucketTone,
  categoryLabel,
  decisionLabel,
  decisionTone,
  downloadCsv,
  evidenceSourceLabel,
  fmtDate,
  fmtVolume,
  ideasToCsv,
  intentLabel,
  loadLists,
  loadRecent,
  pageMappingLabel,
  priorityTone,
  pushRecent,
  saveLists,
  serpFeatureLabel,
  sourceLabel,
  trendLabel,
  type KeywordList,
} from './research-lib';

/* 12-month trend sparkline (pure SVG, no new deps). */
function TrendSpark({
  points,
}: {
  points: MonthlyPoint[] | undefined;
}) {
  const vols = (points ?? [])
    .slice(-12)
    .map((p) => p.searchVolume);
  if (
    vols.length < 2 ||
    vols.every((v) => v === null || v === undefined)
  ) {
    return <span className="text-rk-muted">—</span>;
  }
  const nums = vols.map((v) => Number(v) || 0);
  const max = Math.max(...nums, 1);
  const w = 72;
  const h = 22;
  const step = w / (nums.length - 1);
  const d = nums
    .map(
      (v, i) =>
        `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`,
    )
    .join(' ');
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={`12-month trend: ${nums.join(', ')}`}
      className="overflow-visible"
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-rk-info"
      />
    </svg>
  );
}

/* ---------- small formatting helpers ---------- */

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

function titleCase(s: string) {
  return s.replace(
    /\w\S*/g,
    (w) => w.charAt(0).toUpperCase() + w.slice(1),
  );
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

/* Subtle professional intent chip (never a giant badge). */
function IntentChip({ intent }: { intent: string }) {
  return (
    <span className="inline-flex items-center rounded-rk-sm border border-rk-border bg-rk-soft px-1.5 py-0.5 text-[11px] font-medium text-rk-secondary">
      {intentLabel(intent)}
    </span>
  );
}

function DecisionChip({ decision }: { decision: string }) {
  const tone = decisionTone(decision);
  const cls =
    tone === 'positive'
      ? 'border-rk-success/30 bg-rk-success/10 text-rk-success'
      : tone === 'warning'
        ? 'border-rk-border bg-rk-warningSoft text-rk-warning'
        : tone === 'negative'
          ? 'border-rk-border bg-rk-dangerSoft text-rk-danger'
          : 'border-rk-border bg-rk-soft text-rk-secondary';
  return (
    <span
      className={`inline-flex items-center rounded-rk-sm border px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}
    >
      {decisionLabel(decision)}
    </span>
  );
}

function OpportunityCell({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const bar =
    score >= 70
      ? 'bg-rk-success'
      : score >= 40
        ? 'bg-rk-warning'
        : 'bg-rk-border';
  return (
    <span className="inline-flex min-w-[120px] items-center gap-2">
      <ScoreBadge score={score} />
      <span
        className="h-1.5 w-14 overflow-hidden rounded-full bg-rk-soft"
        role="img"
        aria-label={`Opportunity score ${score} out of 100`}
      >
        <span
          className={`block h-full rounded-full ${bar}`}
          style={{ width: `${pct}%` }}
        />
      </span>
    </span>
  );
}

/* Strategy priority uses HIGH/MEDIUM/LOW bands (HIGH ≥ 60,
   MEDIUM 38–59, LOW < 38) for color so a HIGH score never
   renders an amber opportunity bar. Score itself is never
   altered here. */
function StrategyPriorityCell({
  score,
  priority,
}: {
  score: number;
  priority: string;
}) {
  const pct = Math.min(100, Math.max(0, score));
  const bar =
    priority === 'HIGH'
      ? 'bg-rk-success'
      : priority === 'MEDIUM'
        ? 'bg-rk-warning'
        : 'bg-rk-border';
  return (
    <span className="inline-flex min-w-[120px] items-center gap-2">
      <ScoreBadge score={score} />
      <span
        className="h-1.5 w-14 overflow-hidden rounded-full bg-rk-soft"
        role="img"
        aria-label={`Strategy priority ${priority}, score ${score} out of 100`}
      >
        <span
          className={`block h-full rounded-full ${bar}`}
          style={{ width: `${pct}%` }}
        />
      </span>
    </span>
  );
}

function StrengthBadge({
  strength,
}: {
  strength: string | null | undefined;
}) {
  const cls =
    strength === 'Strong'
      ? 'border-rk-border bg-rk-dangerSoft text-rk-danger'
      : strength === 'Medium'
        ? 'border-rk-border bg-rk-warningSoft text-rk-warning'
        : strength === 'Weak'
          ? 'border-rk-success/30 bg-rk-success/10 text-rk-success'
          : 'border-rk-border bg-rk-soft text-rk-muted';
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-rk-sm border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}
      title={
        strength === 'Weak'
          ? 'Authority weakness: low rank signals across the available evidence'
          : strength === 'Unknown' || !strength
            ? 'No authority signals available for this result'
            : `Page strength: ${strength} (DataForSEO rank signals)`
      }
    >
      {strength ?? 'Unknown'}
    </span>
  );
}

function VerdictChip({
  verdict,
}: {
  verdict: string | null | undefined;
}) {
  const cls =
    verdict === 'OPPORTUNITY'
      ? 'border-rk-success/30 bg-rk-success/10 text-rk-success'
      : verdict === 'HARD'
        ? 'border-rk-border bg-rk-dangerSoft text-rk-danger'
        : verdict === 'MODERATE'
          ? 'border-rk-border bg-rk-warningSoft text-rk-warning'
          : 'border-rk-border bg-rk-soft text-rk-secondary';
  return (
    <span
      className={`inline-flex items-center rounded-rk-sm border px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}
    >
      {verdict === 'OPPORTUNITY'
        ? 'Opportunity'
        : verdict === 'HARD'
          ? 'Hard'
          : verdict === 'MODERATE'
            ? 'Moderate'
            : 'Unknown'}
    </span>
  );
}

function ToneChip({
  label,
  tone,
}: {
  label: string;
  tone: 'positive' | 'warning' | 'negative' | 'neutral';
}) {
  const cls =
    tone === 'positive'
      ? 'border-rk-success/30 bg-rk-success/10 text-rk-success'
      : tone === 'warning'
        ? 'border-rk-border bg-rk-warningSoft text-rk-warning'
        : tone === 'negative'
          ? 'border-rk-border bg-rk-dangerSoft text-rk-danger'
          : 'border-rk-border bg-rk-soft text-rk-secondary';
  return (
    <span
      className={`inline-flex items-center rounded-rk-sm border px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}
    >
      {label}
    </span>
  );
}

function pageActionLabel(action: string): string {
  switch (action) {
    case 'IMPROVE_EXISTING_PAGE':
      return 'Improve existing page';
    case 'CREATE_NEW_PAGE':
      return 'Create new page';
    case 'CONSOLIDATE_PAGES':
      return 'Consolidate pages';
    case 'TRACK_ONLY':
      return 'Track only';
    default:
      return 'Ignore';
  }
}

/* Unavailable metric — never a zero. */
function UnavailableCell({ reason }: { reason: string }) {
  return (
    <span
      className="cursor-help text-rk-muted"
      title={reason}
    >
      — <span className="sr-only">{reason}</span>
    </span>
  );
}

const VOLUME_REASON =
  'Search volume is unavailable — no keyword data provider is connected.';
const KD_REASON =
  'Keyword Difficulty is unavailable — no keyword data provider is connected. Validate difficulty against real SERP evidence once a provider connects.';
const TRAFFIC_REASON =
  'Traffic Potential needs per-keyword clickstream data, which is not in the current provider plan. Search volume is the demand ceiling shown instead.';

/* ========================================================= */

type Tab = 'discover' | 'strategy' | 'yours' | 'competitors';

export default function KeywordsPage() {
  const [navOpen, setNavOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('discover');
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState('');

  /* ---------- Phase 11 rank tracking ---------- */
  const [rankOverview, setRankOverview] =
    useState<any>(null);
  const [rankChanges, setRankChanges] =
    useState<any>(null);
  const [rankInput, setRankInput] = useState('');
  const [rankBusy, setRankBusy] = useState(false);
  const [rankMsg, setRankMsg] = useState('');

  async function refreshRanks(id: string) {
    if (!id) return;
    const [overview, changes] = await Promise.all([
      getRankOverview(id).catch(() => null),
      getRankChanges(id).catch(() => null),
    ]);
    if (overview) setRankOverview(overview);
    if (changes) setRankChanges(changes);
  }

  /* ---------- Phase 12 topic intelligence ---------- */
  const [topic, setTopic] = useState<any>(null);
  const [topicInput, setTopicInput] = useState('');
  const [topicBusy, setTopicBusy] = useState(false);
  const [topicMsg, setTopicMsg] = useState('');

  function loadTopic(id: string, query: string) {
    const trimmed = query.trim();
    if (!id || !trimmed || topicBusy) return;
    setTopicBusy(true);
    setTopicMsg('');
    getTopicIntelligence(id, trimmed)
      .then((res) => setTopic(res))
      .catch((err: any) => {
        setTopicMsg(
          err?.message ||
            'Topic intelligence unavailable for this query.',
        );
      })
      .finally(() => setTopicBusy(false));
  }

  /* ---------- research hero ---------- */
  const [mode, setMode] = useState<
    'keyword' | 'website' | 'competitor'
  >('keyword');
  const [seedInput, setSeedInput] = useState('');
  const [country, setCountry] = useState('US');
  const [language, setLanguage] = useState('en');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  /* ---------- discover state ---------- */
  const [researchLoading, setResearchLoading] =
    useState(false);
  const [researchError, setResearchError] = useState('');
  const [result, setResult] =
    useState<ResearchResponse | null>(null);
  const [activeSeed, setActiveSeed] = useState('');
  const [intentFilter, setIntentFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [decisionFilter, setDecisionFilter] =
    useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [minOpp, setMinOpp] = useState('0');
  const [minVol, setMinVol] = useState('0');
  const [maxKd, setMaxKd] = useState('ANY');
  const [trendFilter, setTrendFilter] = useState('ALL');
  const [tableSearch, setTableSearch] = useState('');
  const [usage, setUsage] = useState<any>(null);
  const [serpMap, setSerpMap] = useState<
    Record<string, SerpObservation>
  >({});
  const [serpMetaMap, setSerpMetaMap] = useState<
    Record<
      string,
      {
        scoring: SerpScoring | null;
        cached: boolean;
        fetchedAt: string;
        previousFetchedAt: string | null;
      }
    >
  >({});
  const [serpLoading, setSerpLoading] = useState('');
  const [serpError, setSerpError] = useState('');
  const [expandedSerp, setExpandedSerp] = useState<
    string | null
  >(null);
  const [serpClusters, setSerpClusters] = useState<
    SerpCluster[] | null
  >(null);
  const [serpClusterMeta, setSerpClusterMeta] =
    useState<any>(null);
  const [serpClusterLoading, setSerpClusterLoading] =
    useState(false);
  const [serpClusterError, setSerpClusterError] =
    useState('');
  const [selectedKeys, setSelectedKeys] = useState<
    string[]
  >([]);
  const [drawerIdea, setDrawerIdea] =
    useState<ResearchIdea | null>(null);
  const [clusterResult, setClusterResult] = useState<
    ResearchCluster[] | null
  >(null);
  const [clusterLoading, setClusterLoading] =
    useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [actionErr, setActionErr] = useState('');

  /* ---------- strategy ---------- */
  const [strategy, setStrategy] =
    useState<StrategyResponse | null>(null);
  const [strategyLoading, setStrategyLoading] =
    useState(false);
  const [strategyError, setStrategyError] = useState('');
  const [strategyBucket, setStrategyBucket] =
    useState('ALL');
  const [strategySearch, setStrategySearch] = useState('');
  const [briefText, setBriefText] = useState('');
  const [briefProvider, setBriefProvider] = useState<
    'GEMINI' | 'OPENAI'
  >('GEMINI');
  const [briefLoading, setBriefLoading] =
    useState(false);
  const [briefError, setBriefError] = useState('');
  const [strategyDrawer, setStrategyDrawer] =
    useState<StrategyOpportunity | null>(null);

  /* ---------- content strategy foundation 6.0 ----------
     Lightweight persisted link statuses (Content / Brief /
     Draft / Action) + saved AI brief history. Honest:
     missing rows read as not-created, never inferred. */
  const [contentLinks, setContentLinks] = useState<
    Record<string, StrategyContentStatus>
  >({});
  const [contentLinksLoading, setContentLinksLoading] =
    useState(false);
  const [briefHistory, setBriefHistory] = useState<
    Array<{
      id: string;
      provider: string;
      model: string | null;
      itemCount: number;
      createdAt: string;
    }>
  >([]);
  const [briefHistoryLoading, setBriefHistoryLoading] =
    useState(false);
  const [pipelineMsg, setPipelineMsg] = useState('');
  const [pipelineErr, setPipelineErr] = useState('');
  const [pipelineBusy, setPipelineBusy] = useState(false);

  /* ---------- link graph orphans 6.0 Phase 2C ---------
     POTENTIAL_ORPHAN candidates from observed inbound
     edges. Factual coverage signal, never a verdict. */
  const [orphans, setOrphans] = useState<
    OrphanCandidate[]
  >([]);
  const [orphanLoading, setOrphanLoading] =
    useState(false);
  const [orphanCrawlId, setOrphanCrawlId] = useState<
    string | null
  >(null);
  const [orphanCrawlCompletedAt, setOrphanCrawlCompletedAt] =
    useState<string | null>(null);

  async function refreshOrphans() {
    if (!websiteId) return;
    setOrphanLoading(true);
    try {
      const res = await getOrphanCandidates({
        websiteId,
        limit: 10,
      });
      setOrphans(res.candidates ?? []);
      setOrphanCrawlId(res.crawlId);
      setOrphanCrawlCompletedAt(res.crawlCompletedAt);
    } catch {
      setOrphans([]);
      setOrphanCrawlId(null);
      setOrphanCrawlCompletedAt(null);
    } finally {
      setOrphanLoading(false);
    }
  }

  /* ---------- internal-link recommender 6.0 Phase 2A -----
     Structured source → anchor → target suggestions for
     the open drawer keyword. Anchors are INFERENCE. */
  const [linkRecs, setLinkRecs] = useState<
    LinkRecommendation[]
  >([]);
  const [linkRecsLoading, setLinkRecsLoading] =
    useState(false);

  async function refreshLinkRecs(keyword: string) {
    if (!websiteId || !keyword) {
      setLinkRecs([]);
      return;
    }
    setLinkRecsLoading(true);
    try {
      const res = await getLinkRecommendations({
        websiteId,
        keyword,
        limit: 5,
      });
      setLinkRecs(res.recommendations ?? []);
    } catch {
      setLinkRecs([]);
    } finally {
      setLinkRecsLoading(false);
    }
  }

  async function createLinkAction(
    rec: LinkRecommendation,
  ) {
    if (!websiteId || pipelineBusy) return;
    setPipelineBusy(true);
    setPipelineMsg('');
    setPipelineErr('');
    try {
      await createAction({
        websiteId,
        type: 'INTERNAL_LINK',
        title: `Link ${rec.sourceUrl.replace(/^https?:\/\//, '')} → ${rec.targetUrl.replace(/^https?:\/\//, '')}`,
        description: rec.reason,
        url: rec.sourceUrl,
        priority: rec.priority,
        metadata: {
          sourceUrl: rec.sourceUrl,
          targetUrl: rec.targetUrl,
          suggestedAnchor: rec.suggestedAnchor,
          anchorSource: rec.anchorSource,
          strategyKeyword: rec.keyword
            .trim()
            .toLowerCase(),
          topic: rec.topic,
          source: 'LINK_2A',
        },
      });
      setPipelineMsg(
        'Link action created in the Action Engine.',
      );
      if (strategyDrawer) {
        await refreshLinkRecs(strategyDrawer.keyword);
      }
      await refreshContentLinks();
    } catch (err: any) {
      setPipelineErr(
        err?.message || 'Link action creation failed.',
      );
    } finally {
      setPipelineBusy(false);
    }
  }

  /* ---------- lists ---------- */
  const [lists, setLists] = useState<KeywordList[]>([]);
  const [listDialogIdea, setListDialogIdea] =
    useState<ResearchIdea | null>(null);
  const [newListName, setNewListName] = useState('');

  /* ---------- GSC (Your Keywords, preserved) ---------- */
  const [period, setPeriod] = useState('28');
  const [gscSearch, setGscSearch] = useState('');
  const [gscIntent, setGscIntent] = useState('ALL');
  const [gscPosition, setGscPosition] = useState('ALL');
  const [gscOpp, setGscOpp] = useState('ALL');
  const [gscLoading, setGscLoading] = useState(true);
  const [gscRefreshing, setGscRefreshing] = useState(false);
  const [gscError, setGscError] = useState('');
  const [connected, setConnected] = useState<
    boolean | null
  >(null);
  const [gscRows, setGscRows] = useState<GoogleQueryRow[]>(
    [],
  );
  const [gscDrawer, setGscDrawer] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [analysisLoading, setAnalysisLoading] =
    useState(false);
  const [analysisError, setAnalysisError] = useState('');

  /* ---------- competitors ---------- */
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [competitorId, setCompetitorId] = useState('');
  const [gap, setGap] = useState<any>(null);
  const [gapLoading, setGapLoading] = useState(false);
  const [gapError, setGapError] = useState('');
  const [gapFilter, setGapFilter] = useState<
    'missing' | 'shared' | 'all'
  >('missing');
  const [providerDomain, setProviderDomain] = useState('');
  const [providerGap, setProviderGap] = useState<any>(null);
  const [providerGapLoading, setProviderGapLoading] =
    useState(false);
  const [providerGapError, setProviderGapError] =
    useState('');

  /* ---------- quick wins 2.0 ---------- */
  const [qw2, setQw2] = useState<any>(null);
  const [qw2Loading, setQw2Loading] = useState(false);
  const [qw2Error, setQw2Error] = useState('');

  const { startDate, endDate } = useMemo(
    () => rangeFor(num(period, 28)),
    [period],
  );

  /* ---------- bootstrap ---------- */
  useEffect(() => {
    setRecent(loadRecent());
    void refreshUsage();
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
      })
      .catch(() => {
        if (!cancelled) setWebsites([]);
      });
    getCompetitors()
      .then((c) => {
        if (!cancelled)
          setCompetitors(Array.isArray(c) ? c : []);
      })
      .catch(() => {
        if (!cancelled) setCompetitors([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (websiteId) setLists(loadLists(websiteId));
    if (websiteId) void refreshRanks(websiteId);
  }, [websiteId]);

  function handleWebsiteChange(id: string) {
    setWebsiteId(id);
    setResult(null);
    setGap(null);
    setSelectedKeys([]);
    setClusterResult(null);
    setStrategy(null);
    setBriefText('');
    if (typeof window !== 'undefined') {
      if (id) localStorage.setItem('renkoo_website_id', id);
      else localStorage.removeItem('renkoo_website_id');
    }
  }

  /* Cmd/Ctrl+K focuses research search. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === 'k'
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () =>
      window.removeEventListener('keydown', onKey);
  }, []);

  /* ---------- research actions ---------- */
  const refreshUsage = useCallback(async () => {
    try {
      setUsage(await getKeywordUsage());
    } catch {
      /* Usage chip is informational — never blocks. */
    }
  }, []);

  const runResearch = useCallback(
    async (seed: string, refresh = false) => {
      const clean = seed.trim();
      if (!clean || researchLoading) return;
      const controller = new AbortController();
      setResearchLoading(true);
      setResearchError('');
      setClusterResult(null);
      setSelectedKeys([]);
      try {
        const res = await researchKeywords({
          websiteId: websiteId || undefined,
          seed: clean,
          mode,
          country: country || undefined,
          language: language || undefined,
          limit: 100,
          refresh,
        });
        if (controller.signal.aborted) return;
        setResult(res);
        setActiveSeed(clean);
        pushRecent(clean);
        setRecent(loadRecent());
        void refreshUsage();
      } catch (err: any) {
        if (!controller.signal.aborted)
          setResearchError(
            err?.message || 'Keyword research failed.',
          );
      } finally {
        if (!controller.signal.aborted)
          setResearchLoading(false);
      }
    },
    [
      websiteId,
      mode,
      country,
      language,
      researchLoading,
      refreshUsage,
    ],
  );

  /* ---------- strategy actions (zero provider cost) ---------- */
  async function refreshContentLinks() {
    if (!websiteId) return;
    setContentLinksLoading(true);
    try {
      const res = await getStrategyLinks(websiteId);
      const map: Record<string, StrategyContentStatus> =
        {};
      for (const link of res.links ?? []) {
        map[link.keyword.trim().toLowerCase()] = link;
      }
      setContentLinks(map);
    } catch {
      /* Links are progressive enhancement — the strategy
         itself stays fully usable without them. */
      setContentLinks({});
    } finally {
      setContentLinksLoading(false);
    }
  }

  async function refreshBriefHistory() {
    if (!websiteId) return;
    setBriefHistoryLoading(true);
    try {
      const res = await listStrategyBriefs(websiteId);
      setBriefHistory(res.briefs ?? []);
    } catch {
      setBriefHistory([]);
    } finally {
      setBriefHistoryLoading(false);
    }
  }

  async function runStrategy() {
    if (!websiteId || strategyLoading) return;
    setStrategyLoading(true);
    setStrategyError('');
    try {
      const res = await getKeywordStrategy({
        websiteId,
        startDate,
        endDate,
        country: country || undefined,
        language: language || undefined,
        limit: 100,
      });
      setStrategy(res);
      void refreshContentLinks();
      void refreshBriefHistory();
      void refreshOrphans();
    } catch (err: any) {
      setStrategyError(
        err?.message || 'Strategy failed to load.',
      );
    } finally {
      setStrategyLoading(false);
    }
  }

  async function runBrief() {
    if (!websiteId || briefLoading) return;
    setBriefLoading(true);
    setBriefError('');
    try {
      const res = await getStrategyBrief({
        websiteId,
        provider: briefProvider,
        maxItems: 8,
        startDate,
        endDate,
        country: country || undefined,
        language: language || undefined,
      });
      setBriefText(res.text);
      void refreshBriefHistory();
    } catch (err: any) {
      setBriefError(
        err?.message || 'AI brief failed.',
      );
    } finally {
      setBriefLoading(false);
    }
  }

  /* Strategy → Content bridge: create a brief through the
     existing Content Engine, or an action through the
     existing Action Engine. Never duplicates silently —
     buttons only render when no linked row exists, and the
     backend matches on stable identifiers. */
  function drawerLink(): StrategyContentStatus | null {
    if (!strategyDrawer) return null;
    return (
      contentLinks[
        strategyDrawer.keyword.trim().toLowerCase()
      ] ?? null
    );
  }

  async function createBriefFromDrawer() {
    if (!strategyDrawer || !websiteId || pipelineBusy)
      return;
    setPipelineBusy(true);
    setPipelineMsg('');
    setPipelineErr('');
    try {
      await generateContentBrief({
        websiteId,
        query: strategyDrawer.keyword,
        page: strategyDrawer.targetPage ?? undefined,
      });
      setPipelineMsg(
        'Brief created in the Content Engine.',
      );
      await refreshContentLinks();
    } catch (err: any) {
      setPipelineErr(
        err?.message || 'Brief creation failed.',
      );
    } finally {
      setPipelineBusy(false);
    }
  }

  async function createActionFromDrawer() {
    if (!strategyDrawer || !websiteId || pipelineBusy)
      return;
    setPipelineBusy(true);
    setPipelineMsg('');
    setPipelineErr('');
    try {
      await createAction({
        websiteId,
        type: 'CONTENT_STRATEGY',
        title: `${pageMappingLabel(strategyDrawer.pageMapping)}: "${strategyDrawer.keyword}"`,
        description:
          strategyDrawer.mappingReason ??
          'Strategy opportunity from RENKOO 5.0.',
        url: strategyDrawer.targetPage ?? undefined,
        priority: strategyDrawer.priority,
        metadata: {
          strategyKeyword: strategyDrawer.keyword
            .trim()
            .toLowerCase(),
          topic:
            drawerLink()?.topic ?? null,
          pageMapping: strategyDrawer.pageMapping,
          bucket: strategyDrawer.bucket,
          source: 'STRATEGY_6_0',
        },
      });
      setPipelineMsg(
        'Action created in the Action Engine.',
      );
      await refreshContentLinks();
    } catch (err: any) {
      setPipelineErr(
        err?.message || 'Action creation failed.',
      );
    } finally {
      setPipelineBusy(false);
    }
  }

  async function loadSerp(idea: ResearchIdea) {
    const key = idea.keyword;
    if (serpMap[key] || serpLoading) return;
    setSerpLoading(key);
    setSerpError('');
    try {
      const res = await getKeywordSerp({
        keyword: key,
        country: country || undefined,
        language: language || undefined,
        websiteId: websiteId || undefined,
      });
      setSerpMap((m) => ({
        ...m,
        [key]: res.observation,
      }));
      setSerpMetaMap((m) => ({
        ...m,
        [key]: {
          scoring: res.scoring,
          cached: res.cached,
          fetchedAt: res.fetchedAt,
          previousFetchedAt:
            res.previousFetchedAt ?? null,
        },
      }));
      void refreshUsage();
    } catch (err: any) {
      setSerpError(
        err?.message || 'SERP is temporarily unavailable.',
      );
    } finally {
      setSerpLoading('');
    }
  }

  async function runSerpCluster() {
    const keys =
      selectedKeys.length > 0
        ? selectedKeys
        : filtered.slice(0, 25).map((i) => i.keyword);
    if (keys.length < 2 || serpClusterLoading) return;
    setSerpClusterLoading(true);
    setSerpClusterError('');
    try {
      const res = await clusterSerpKeywords({
        websiteId: websiteId || undefined,
        keywords: keys,
        country: country || undefined,
        language: language || undefined,
        maxSerp: 25,
      });
      setSerpClusters(res.clusters ?? []);
      setSerpClusterMeta(res);
      void refreshUsage();
    } catch (err: any) {
      setSerpClusterError(
        err?.message || 'SERP clustering failed.',
      );
    } finally {
      setSerpClusterLoading(false);
    }
  }

  async function runProviderLookup() {
    const domain = providerDomain.trim();
    if (!domain || providerGapLoading) return;
    setProviderGapLoading(true);
    setProviderGapError('');
    try {
      const res = await lookupCompetitorKeywords({
        websiteId: websiteId || undefined,
        domain,
        country: country || undefined,
        language: language || undefined,
        limit: 100,
        includeSerpStrength: 5,
      });
      setProviderGap(res);
      void refreshUsage();
    } catch (err: any) {
      setProviderGapError(
        err?.message || 'Competitor lookup failed.',
      );
    } finally {
      setProviderGapLoading(false);
    }
  }

  async function runQuickWins2() {
    if (!websiteId || qw2Loading) return;
    setQw2Loading(true);
    setQw2Error('');
    try {
      const res = await getQuickWins2({
        websiteId,
        startDate,
        endDate,
        country: country || undefined,
        language: language || undefined,
        limit: 50,
      });
      setQw2(res);
    } catch (err: any) {
      setQw2Error(
        err?.message ||
          'Quick Wins enrichment is unavailable.',
      );
    } finally {
      setQw2Loading(false);
    }
  }

  async function browseUniverse() {
    if (!websiteId || researchLoading) return;
    setResearchLoading(true);
    setResearchError('');
    setClusterResult(null);
    setSelectedKeys([]);
    try {
      const res = await getKeywordUniverse(websiteId, 100);
      setResult(res);
      setActiveSeed('');
    } catch (err: any) {
      setResearchError(
        err?.message || 'Could not load the keyword universe.',
      );
    } finally {
      setResearchLoading(false);
    }
  }

  /* ---------- discover filtering ---------- */
  const ideas = useMemo(
    () => result?.ideas ?? [],
    [result],
  );

  const availabilityOf = useCallback(
    (metric: string) =>
      (result?.availability ?? []).find(
        (a: any) => a.metric === metric,
      ),
    [result],
  );

  const providerReady =
    availabilityOf('volume')?.availability ===
      'AVAILABLE' ||
    availabilityOf('keywordDifficulty')
      ?.availability === 'AVAILABLE';

  const filtered = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    const min = num(minOpp, 0);
    const minV = num(minVol, 0);
    return ideas.filter((i) => {
      if (q && !i.keyword.includes(q)) return false;
      if (
        intentFilter !== 'ALL' &&
        i.intent !== intentFilter
      )
        return false;
      if (
        typeFilter !== 'ALL' &&
        !i.categories.includes(typeFilter)
      )
        return false;
      if (decisionFilter === 'TARGET' &&
        i.targetDecision !== 'TARGET_NOW')
        return false;
      if (decisionFilter === 'GAP' &&
        (i.sources.includes('SITE_CORPUS') ||
          !i.sources.includes('COMPETITOR_CORPUS')))
        return false;
      if (decisionFilter === 'QUICK' &&
        !(i.sitePages > 0 && i.opportunityScore >= 50))
        return false;
      if (
        sourceFilter !== 'ALL' &&
        !i.sources.includes(sourceFilter)
      )
        return false;
      if (i.opportunityScore < min) return false;
      if (minV > 0 && (i.volume ?? 0) < minV)
        return false;
      if (
        maxKd !== 'ANY' &&
        (i.keywordDifficulty === null ||
          i.keywordDifficulty === undefined ||
          i.keywordDifficulty > num(maxKd, 100))
      )
        return false;
      if (
        trendFilter !== 'ALL' &&
        (i.trend ?? '').toLowerCase() !==
          trendFilter.toLowerCase()
      )
        return false;
      return true;
    });
  }, [
    ideas,
    tableSearch,
    intentFilter,
    typeFilter,
    decisionFilter,
    sourceFilter,
    minOpp,
    minVol,
    maxKd,
    trendFilter,
  ]);

  /* ---------- action plan (signature UX, rule-based) ---------- */
  const actionPlan = useMemo(() => {
    if (!result) return null;
    const byOpp = [...ideas].sort(
      (a, b) => b.opportunityScore - a.opportunityScore,
    );
    return {
      improve: byOpp
        .filter((i) => i.sitePages > 0)
        .slice(0, 2),
      create: byOpp
        .filter(
          (i) =>
            !i.sources.includes('SITE_CORPUS') &&
            i.sources.includes('COMPETITOR_CORPUS'),
        )
        .slice(0, 2),
      consolidate: byOpp
        .filter((i) => i.cannibalizationFlag)
        .slice(0, 2),
      track: byOpp
        .filter((i) => i.targetDecision === 'TARGET_NOW')
        .slice(0, 2),
    };
  }, [result, ideas]);

  const topOpportunities = useMemo(
    () =>
      [...ideas]
        .sort(
          (a, b) =>
            b.opportunityScore - a.opportunityScore,
        )
        .slice(0, 3),
    [ideas],
  );

  /* ---------- bulk + row actions ---------- */
  function persistLists(next: KeywordList[]) {
    setLists(next);
    saveLists(websiteId, next);
  }

  function addToList(
    listId: string | null,
    name: string,
    keywords: string[],
  ) {
    let next = [...lists];
    if (listId) {
      next = next.map((l) =>
        l.id === listId
          ? {
              ...l,
              keywords: [
                ...new Set([...l.keywords, ...keywords]),
              ],
            }
          : l,
      );
    } else {
      next.push({
        id: `list_${Date.now()}`,
        name: name.trim() || 'Untitled list',
        websiteId,
        keywords: [...new Set(keywords)],
        createdAt: new Date().toISOString(),
      });
    }
    persistLists(next);
    setListDialogIdea(null);
    setNewListName('');
    setActionMsg(
      `Saved ${keywords.length} keyword${keywords.length === 1 ? '' : 's'} to list.`,
    );
    window.setTimeout(() => setActionMsg(''), 4000);
  }

  async function handleClusterSelected() {
    const keys =
      selectedKeys.length > 0
        ? selectedKeys
        : filtered.slice(0, 30).map((i) => i.keyword);
    if (keys.length === 0) return;
    setClusterLoading(true);
    setActionErr('');
    try {
      const res = await clusterKeywords(keys);
      setClusterResult(res.clusters ?? []);
    } catch (err: any) {
      setActionErr(
        err?.message || 'Clustering failed.',
      );
    } finally {
      setClusterLoading(false);
    }
  }

  async function handleBrief(idea: {
    keyword: string;
    siteUrls?: string[];
  }) {
    if (!websiteId) {
      setActionErr(
        'Select a website first — briefs are website-scoped.',
      );
      return;
    }
    setActionErr('');
    setActionMsg('Creating content brief…');
    try {
      await generateContentBrief({
        websiteId,
        query: idea.keyword,
        page: idea.siteUrls?.[0],
      });
      setActionMsg(
        `Brief created for "${idea.keyword}" — open the Content Engine to review it.`,
      );
    } catch (err: any) {
      setActionErr(
        err?.message || 'Could not create the brief.',
      );
      setActionMsg('');
    }
    window.setTimeout(() => {
      setActionMsg('');
      setActionErr('');
    }, 6000);
  }

  async function handleTrack(idea: {
    keyword: string;
  }) {
    if (!websiteId) {
      setActionErr(
        'Select a website first — tracking is website-scoped.',
      );
      return;
    }
    setActionErr('');
    try {
      await createTrackedLocalQuery(websiteId, {
        query: idea.keyword,
      });
      setActionMsg(`Tracking "${idea.keyword}".`);
    } catch (err: any) {
      setActionErr(
        err?.message || 'Could not track the keyword.',
      );
      return;
    }
    window.setTimeout(() => setActionMsg(''), 4000);
  }

  /* ---------- GSC loading (preserved) ---------- */
  const loadGsc = useCallback(async () => {
    try {
      setGscError('');
      let queriesError: unknown = null;
      const [status, res] = await Promise.all([
        getGoogleConnectionStatus(),
        getGoogleQueries(startDate, endDate).catch(
          (err) => {
            queriesError = err;
            return null;
          },
        ),
      ]);
      const isConnected = Boolean(
        (status as any)?.connected,
      );
      setConnected(isConnected);
      if (!isConnected) return;
      if (!res) throw queriesError;
      setGscRows(
        Array.isArray((res as any)?.rows)
          ? (res as any).rows
          : [],
      );
    } catch (err: any) {
      setGscError(
        err?.message || 'Failed to load keyword data.',
      );
    } finally {
      setGscLoading(false);
      setGscRefreshing(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    if (tab !== 'yours') return;
    setGscLoading(true);
    void loadGsc();
  }, [tab, loadGsc]);

  async function openGscDrawer(row: any) {
    setGscDrawer(row);
    setAnalysis(null);
    setAnalysisError('');
    setAnalysisLoading(true);
    try {
      const res = await analyzeGoogleOpportunity(
        startDate,
        endDate,
        String(row.query || row.keys?.[0] || ''),
        row.page ? String(row.page) : undefined,
      );
      setAnalysis(res);
    } catch (err: any) {
      setAnalysisError(
        err?.message || 'Recommendation unavailable.',
      );
    } finally {
      setAnalysisLoading(false);
    }
  }

  const gscEnriched = useMemo(
    () =>
      gscRows.map((r: any) => {
        const query = String(r.query || r.keys?.[0] || '');
        return {
          ...r,
          _query: query,
          _intent: estimateIntent(query),
          _opp: ruleOpportunity(r),
        };
      }),
    [gscRows],
  );

  const gscFiltered = useMemo(() => {
    const q = gscSearch.trim().toLowerCase();
    return gscEnriched.filter((r) => {
      if (q && !r._query.toLowerCase().includes(q))
        return false;
      if (
        gscIntent !== 'ALL' &&
        r._intent.toUpperCase() !== gscIntent
      )
        return false;
      const pos = num(r.position);
      if (gscPosition === 'TOP3' && pos > 3) return false;
      if (
        gscPosition === 'STRIKING' &&
        (pos < 4 || pos > 20)
      )
        return false;
      if (gscPosition === 'BEYOND' && pos <= 20)
        return false;
      if (gscOpp === 'WITH_OPP' && !r._opp) return false;
      if (gscOpp === 'HIGH' && r._opp?.priority !== 'HIGH')
        return false;
      return true;
    });
  }, [
    gscEnriched,
    gscSearch,
    gscIntent,
    gscPosition,
    gscOpp,
  ]);

  const gscStats = useMemo(() => {
    const pos = gscEnriched
      .map((r) => num(r.position))
      .filter((p) => p > 0);
    const avg = pos.length
      ? pos.reduce((a, b) => a + b, 0) / pos.length
      : 0;
    return {
      total: gscEnriched.length,
      avg: pos.length ? avg.toFixed(1) : '—',
      top3: gscEnriched.filter(
        (r) => num(r.position) <= 3 && num(r.position) > 0,
      ).length,
      opps: gscEnriched.filter((r) => r._opp).length,
    };
  }, [gscEnriched]);

  const gscQuickWins = useMemo(
    () =>
      gscEnriched
        .filter((r) => r._opp?.priority === 'HIGH')
        .slice(0, 5),
    [gscEnriched],
  );

  /* ---------- gap ---------- */
  const websiteCompetitors = useMemo(
    () =>
      competitors.filter(
        (c) => !websiteId || c.websiteId === websiteId,
      ),
    [competitors, websiteId],
  );

  async function loadGap(id: string) {
    if (!websiteId || !id) return;
    setGapLoading(true);
    setGapError('');
    try {
      const res = await getKeywordGap(websiteId, id);
      setGap(res);
    } catch (err: any) {
      setGapError(
        err?.message ||
          'Could not load the keyword gap. Both sites need a completed crawl.',
      );
    } finally {
      setGapLoading(false);
    }
  }

  /* ---------- discover table columns ---------- */
  const discoverColumns: DataTableColumn<ResearchIdea>[] = [
    {
      key: 'keyword',
      label: 'Keyword',
      priority: 'high',
      sortable: true,
      sortValue: (r) => r.keyword,
      render: (r) => (
        <span className="font-semibold text-rk-ink">
          {r.keyword}
          {r.cannibalizationFlag ? (
            <span
              className="ml-1.5 inline-flex items-center rounded-rk-sm border border-rk-border bg-rk-warningSoft px-1 py-px text-[10px] font-semibold text-rk-warning"
              title="Multiple pages on your site touch this topic — consider consolidating."
            >
              Split
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'intent',
      label: 'Intent',
      priority: 'medium',
      render: (r) => (
        <span
          className="inline-flex items-center gap-1"
          title={
            r.intentSource === 'PROVIDER'
              ? 'Provider-classified intent (DataForSEO model on SERP behavior)'
              : 'RENKOO-classified intent (deterministic text rules)'
          }
        >
          <IntentChip intent={r.intent} />
          {r.intentSource === 'PROVIDER' ? (
            <span className="text-[10px] text-rk-muted">
              P
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'volume',
      label: 'Volume',
      align: 'right',
      priority: 'medium',
      sortable: true,
      sortValue: (r) => r.volume ?? -1,
      render: (r) =>
        r.volume === null ||
        r.volume === undefined ? (
          <UnavailableCell
            reason={
              availabilityOf('volume')?.reason ??
              VOLUME_REASON
            }
          />
        ) : (
          <span
            className="rk-number"
            title={`Source: ${r.dataSource ?? 'provider'} · ${result?.country ?? ''} · Updated ${fmtDate(r.metricUpdatedAt)}`}
          >
            {fmtVolume(r.volume)}
          </span>
        ),
    },
    {
      key: 'kd',
      label: 'KD',
      align: 'right',
      priority: 'medium',
      sortable: true,
      sortValue: (r) => r.keywordDifficulty ?? 999,
      render: (r) =>
        r.keywordDifficulty === null ||
        r.keywordDifficulty === undefined ? (
          <UnavailableCell
            reason={
              availabilityOf('keywordDifficulty')
                ?.reason ?? KD_REASON
            }
          />
        ) : (
          <span
            className="rk-number"
            title={`Provider KD ${r.keywordDifficulty} (${r.kdLabel ?? ''}). Relative top-10 difficulty, not absolute truth — validate against the SERP.`}
          >
            {r.keywordDifficulty}
            <span className="ml-1 text-[10px] font-medium text-rk-muted">
              {r.kdLabel ?? ''}
            </span>
          </span>
        ),
    },
    {
      key: 'trend',
      label: 'Trend',
      priority: 'low',
      render: (r) => (
        <span
          className="inline-flex items-center gap-1.5"
          title={r.trendDetail ?? trendLabel(r.trend)}
        >
          <TrendSpark points={r.monthlySearches} />
          <span className="text-[11px] text-rk-secondary">
            {trendLabel(r.trend)}
          </span>
        </span>
      ),
    },
    {
      key: 'serp',
      label: 'SERP',
      priority: 'low',
      render: (r) => {
        const loaded = serpMap[r.keyword];
        if (loaded) {
          return (
            <span className="inline-flex max-w-[180px] flex-wrap gap-1">
              {loaded.features
                .slice(0, 3)
                .map((f) => (
                  <span
                    key={f.type}
                    className="rounded-rk-sm border border-rk-border bg-rk-soft px-1 py-px text-[10px] text-rk-secondary"
                    title={`${f.count} occurrence(s)`}
                  >
                    {serpFeatureLabel(f.type)}
                  </span>
                ))}
              {loaded.features.length === 0 ? (
                <span className="text-[11px] text-rk-secondary">
                  {loaded.results.length} organic
                </span>
              ) : null}
            </span>
          );
        }
        return providerReady ? (
          <span className="text-[11px] text-rk-muted">
            On demand
          </span>
        ) : (
          <UnavailableCell
            reason={
              availabilityOf('serp')?.reason ??
              'SERP is unavailable — no provider connected.'
            }
          />
        );
      },
    },
    {
      key: 'traffic',
      label: 'Traffic pot.',
      align: 'right',
      priority: 'low',
      render: () => (
        <UnavailableCell reason={TRAFFIC_REASON} />
      ),
    },
    {
      key: 'opportunity',
      label: 'Opportunity',
      priority: 'high',
      sortable: true,
      sortValue: (r) => r.opportunityScore,
      render: (r) => (
        <OpportunityCell score={r.opportunityScore} />
      ),
    },
    {
      key: 'evidence',
      label: 'Evidence',
      priority: 'medium',
      render: (r) => (
        <span className="text-xs text-rk-secondary">
          {r.sitePages > 0
            ? `Site ×${r.sitePages}`
            : 'Site —'}
          {' · '}
          {r.competitorCount > 0
            ? `${r.competitorCount} comp.`
            : 'No comp.'}
        </span>
      ),
    },
    {
      key: 'decision',
      label: 'Decision',
      priority: 'medium',
      render: (r) => (
        <DecisionChip decision={r.targetDecision} />
      ),
    },
  ];

  const activeWebsite =
    websites.find((s) => s.id === websiteId) || null;

  const seedPlaceholder =
    mode === 'competitor'
      ? 'Enter a competitor domain — e.g. competitor.com'
      : mode === 'website'
        ? 'Enter a website URL — e.g. example.com/services'
        : 'Enter a topic or keyword — e.g. real estate software';

  return (
    <AppShell
      mobileOpen={navOpen}
      onClose={() => setNavOpen(false)}
      onMenu={() => setNavOpen(true)}
    >
      <PageHeader
        eyebrow="Growth OS"
        title="Keyword Research"
        description="Find the keywords worth ranking for — not just thousands of keywords."
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <DataSourceBadge
              source="Site + competitor crawls"
              connected={(result?.corpus.sitePhrases ?? 0) > 0 || result !== null}
            />
            <DataSourceBadge
              source="Google Search Console"
              connected={connected === true}
            />
            {activeWebsite ? (
              <span className="truncate">
                {activeWebsite.name}
              </span>
            ) : null}
          </div>
        }
      />

      {/* ============ RANK TRACKING (Phase 11) ============ */}
      <section
        aria-label="Rank tracking"
        className="mt-6"
      >
        <Panel
          eyebrow="Rank tracking"
          title="Positions, movement and ranking URLs"
          description="Persistent observations from labeled sources. GSC = VERIFIED window average (never an exact rank). SERP = OBSERVED position. Missing stays unavailable — never zero."
        >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Metric
              label="Tracked"
              value={String(
                rankOverview?.tracked ?? '—',
              )}
              detail="keywords with history"
            />
            <Metric
              label="Gaining"
              value={String(
                rankOverview?.gaining ?? '—',
              )}
              detail="observed improvement"
            />
            <Metric
              label="Losing"
              value={String(
                rankOverview?.losing ?? '—',
              )}
              detail="observed decline"
            />
            <Metric
              label="Top 10"
              value={String(
                rankOverview?.top10 ?? '—',
              )}
              detail="current top-10"
            />
            <Metric
              label="Striking"
              value={String(
                rankOverview?.striking ?? '—',
              )}
              detail="positions 4–20"
            />
          </div>
          {Array.isArray(
            rankOverview?.keywords,
          ) &&
          rankOverview.keywords.length > 0 ? (
            <div className="mt-3">
              <DataTable
                caption="Tracked keyword positions"
                columns={[
                  {
                    key: 'keyword',
                    label: 'Keyword',
                  },
                  {
                    key: 'current',
                    label: 'Position',
                  },
                  {
                    key: 'change',
                    label: 'Change',
                  },
                  { key: 'url', label: 'Ranking URL' },
                  {
                    key: 'source',
                    label: 'Source',
                  },
                ]}
                rows={rankOverview.keywords
                  .slice(0, 15)
                  .map((row: any) => ({
                    ...row,
                    current:
                      row.current === null
                        ? '—'
                        : `#${row.current}`,
                    change:
                      row.change === null
                        ? '—'
                        : row.change > 0
                          ? `+${row.change}`
                          : String(row.change),
                    url: row.url
                      ? String(row.url)
                          .replace(
                            /^https?:\/\//,
                            '',
                          )
                          .slice(0, 48)
                      : '—',
                  }))}
                keyOf={(row: any, index: number) =>
                  `${row.keyword}|${row.scope}|${index}`
                }
                emptyTitle="No rank history"
                emptyDescription="Track keywords or sync Search Console below."
              />
            </div>
          ) : (
            <div className="mt-3">
              <EmptyState
                title="No rank history yet"
                description="Track keywords against live SERPs or sync verified Search Console averages to start history."
              />
            </div>
          )}
          {Array.isArray(rankChanges?.events) &&
          rankChanges.events.length > 0 ? (
            <div className="mt-3">
              <EvidenceList
                items={rankChanges.events
                  .slice(0, 5)
                  .map((event: any) => ({
                    text: `[${event.source}] ${event.statement}`,
                    source: event.kind,
                  }))}
              />
            </div>
          ) : null}
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (!websiteId || rankBusy) return;
              const keywords = rankInput
                .split(/[\n,]+/)
                .map((k) => k.trim())
                .filter(Boolean);
              if (keywords.length === 0) return;
              setRankBusy(true);
              setRankMsg('');
              trackRanks({
                websiteId,
                keywords,
                country,
                language,
              })
                .then((res) => {
                  const charged = res.results.filter(
                    (r: any) => r.charged,
                  ).length;
                  setRankMsg(
                    `Tracked ${res.tracked} keyword(s). Fresh provider calls: ${charged} (cached reads free).`,
                  );
                  setRankInput('');
                  return refreshRanks(websiteId);
                })
                .catch((err: any) => {
                  setRankMsg(
                    err?.message ||
                      'Rank tracking unavailable until a SERP provider is connected.',
                  );
                })
                .finally(() => setRankBusy(false));
            }}
          >
            <label htmlFor="rank-input" className="sr-only">
              Keywords to track
            </label>
            <input
              id="rank-input"
              value={rankInput}
              onChange={(e) =>
                setRankInput(e.target.value)
              }
              placeholder="Track keywords (comma-separated, max 25)"
              autoComplete="off"
              className="min-h-[44px] flex-1 rounded-rk-sm border border-rk-border bg-white px-3 text-sm text-rk-ink placeholder:text-rk-muted focus:border-rk-ink focus:outline-none"
            />
            <PrimaryButton type="submit">
              {rankBusy ? 'Tracking…' : 'Track'}
            </PrimaryButton>
            <SecondaryButton
              type="button"
              disabled={!websiteId || rankBusy}
              onClick={() => {
                if (!websiteId || rankBusy) return;
                setRankBusy(true);
                setRankMsg('');
                syncGscRanks({ websiteId, days: 30 })
                  .then((res) => {
                    setRankMsg(
                      `Synced ${res.stored} verified GSC rows. ${res.semantics}`,
                    );
                    return refreshRanks(websiteId);
                  })
                  .catch((err: any) => {
                    setRankMsg(
                      err?.message ||
                        'Verified Search Console ranking data unavailable.',
                    );
                  })
                  .finally(() => setRankBusy(false));
              }}
            >
              Sync GSC
            </SecondaryButton>
          </form>
          {rankMsg ? (
            <p className="rk-body mt-2">{rankMsg}</p>
          ) : null}
        </Panel>
      </section>

      {/* ============ TOPIC INTELLIGENCE (Phase 12) ============ */}
      <section
        aria-label="Topic intelligence"
        className="mt-6"
      >
        <Panel
          eyebrow="Topic intelligence"
          title="What the topic needs — and how completely you own it"
          description="Query fan-out derived from observed queries only (never invented). Coverage is qualitative — strong, partial, weak, or insufficient — never a fake authority score."
        >
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              loadTopic(websiteId, topicInput);
            }}
          >
            <label htmlFor="topic-input" className="sr-only">
              Primary query
            </label>
            <input
              id="topic-input"
              value={topicInput}
              onChange={(e) =>
                setTopicInput(e.target.value)
              }
              placeholder="Primary query, e.g. best CRM for startups"
              autoComplete="off"
              className="min-h-[44px] flex-1 rounded-rk-sm border border-rk-border bg-white px-3 text-sm text-rk-ink placeholder:text-rk-muted focus:border-rk-ink focus:outline-none"
            />
            <PrimaryButton type="submit">
              {topicBusy ? 'Reading…' : 'Analyze topic'}
            </PrimaryButton>
          </form>
          {topicMsg ? (
            <p className="rk-body mt-2">{topicMsg}</p>
          ) : null}
          {topic ? (
            <div className="mt-3">
              <p className="text-sm text-rk-secondary">
                Topic:{' '}
                <span className="font-semibold text-rk-ink">
                  {topic.topic}
                </span>{' '}
                <span className="text-xs text-rk-muted">
                  ({String(topic.topicSource).toLowerCase().replace(/_/g, ' ')})
                </span>
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
                <Metric
                  label="Google"
                  value={String(topic.ownership.google.state)
                    .toLowerCase()
                    .replace(/_/g, ' ')}
                  detail={`${topic.ownership.google.queriesCovered}/${topic.ownership.google.queriesObserved} queries covered`}
                />
                <Metric
                  label="AI answers"
                  value={String(topic.ownership.ai.state)
                    .toLowerCase()
                    .replace(/_/g, ' ')}
                  detail={`${topic.ownership.ai.promptsCovered}/${topic.ownership.ai.promptsTracked} prompts covered`}
                />
                <Metric
                  label="Content"
                  value={String(topic.ownership.content.state)
                    .toLowerCase()
                    .replace(/_/g, ' ')}
                  detail={`${topic.ownership.content.queriesMapped}/${topic.ownership.content.queriesObserved} queries mapped`}
                />
              </div>
              <p className="mt-3 text-sm text-rk-secondary">
                {topic.ownership.relationshipStatement}
              </p>
              {Array.isArray(topic.needs) &&
              topic.needs.length > 0 ? (
                <div className="mt-3">
                  <EvidenceList
                    items={topic.needs
                      .slice(0, 8)
                      .flatMap((group: any) =>
                        group.queries
                          .slice(0, 2)
                          .map((row: any) => ({
                            text: `[${String(group.need).toLowerCase()}] ${row.query} — ${row.gapStatement}`,
                            source: row.gap,
                          })),
                      )
                      .slice(0, 8)}
                  />
                </div>
              ) : (
                <div className="mt-3">
                  <EmptyState
                    title="No observed sub-questions"
                    description="No related queries observed for this topic yet across strategy, ranks, or AI prompts."
                  />
                </div>
              )}
              <p className="mt-3 text-xs text-rk-muted">
                Freshness — rank:{' '}
                {topic.freshness?.rank ?? 'unavailable'}
                {' · '}AI:{' '}
                {topic.freshness?.ai ?? 'unavailable'}.
                Sources are stamped independently.
              </p>
            </div>
          ) : null}
        </Panel>
      </section>

      {/* ============ RESEARCH HERO ============ */}
      <section
        aria-label="Keyword research search"
        className="mt-6"
      >
        <Panel
          eyebrow="Research"
          title="Start with a keyword, topic or competitor"
          description="Discover → Analyze → Compare → Cluster → Prioritize → Target → Track. Volume, KD and SERP metrics stay unavailable until a real provider connects — every score below is computed from evidence you own."
        >
          <div
            className="flex flex-wrap gap-1.5"
            role="tablist"
            aria-label="Research mode"
          >
            {(
              [
                ['keyword', 'Keyword'],
                ['website', 'Website'],
                ['competitor', 'Competitor'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                role="tab"
                aria-selected={mode === value}
                type="button"
                onClick={() => setMode(value)}
                className={`min-h-[44px] rounded-rk-sm border px-3 text-sm font-semibold transition-colors ${
                  mode === value
                    ? 'border-rk-ink bg-rk-ink text-white'
                    : 'border-rk-border bg-white text-rk-secondary hover:text-rk-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              void runResearch(seedInput);
            }}
          >
            <label htmlFor="kw-seed" className="sr-only">
              Research seed
            </label>
            <input
              id="kw-seed"
              ref={searchRef}
              value={seedInput}
              onChange={(e) => setSeedInput(e.target.value)}
              placeholder={seedPlaceholder}
              autoComplete="off"
              className="min-h-[44px] flex-1 rounded-rk-sm border border-rk-border bg-white px-3 text-sm text-rk-ink placeholder:text-rk-muted focus:border-rk-ink focus:outline-none"
            />
            <PrimaryButton type="submit">
              {researchLoading ? 'Researching…' : 'Search'}
            </PrimaryButton>
          </form>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="flex min-h-[44px] items-center gap-1.5 text-xs text-rk-secondary">
              Country
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="min-h-[36px] rounded-rk-sm border border-rk-border bg-white px-2 text-xs text-rk-ink"
                aria-label="Country"
              >
                {['US', 'GB', 'IN', 'CA', 'AU', 'DE', 'AE'].map(
                  (c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="flex min-h-[44px] items-center gap-1.5 text-xs text-rk-secondary">
              Language
              <select
                value={language}
                onChange={(e) =>
                  setLanguage(e.target.value)
                }
                className="min-h-[36px] rounded-rk-sm border border-rk-border bg-white px-2 text-xs text-rk-ink"
                aria-label="Language"
              >
                {['en', 'es', 'de', 'fr', 'hi'].map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              aria-expanded={advancedOpen}
              className="min-h-[44px] px-2 text-xs font-semibold text-rk-secondary underline-offset-2 hover:text-rk-ink hover:underline"
            >
              {advancedOpen
                ? 'Hide advanced'
                : 'Advanced options'}
            </button>
            <span className="hidden text-[11px] text-rk-muted sm:inline">
              Press Ctrl/⌘ + K to focus search
            </span>
          </div>

          {advancedOpen ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="flex min-h-[44px] items-center gap-1.5 text-xs text-rk-secondary">
                Website context
                <select
                  value={websiteId}
                  onChange={(e) =>
                    handleWebsiteChange(e.target.value)
                  }
                  className="min-h-[36px] max-w-[220px] rounded-rk-sm border border-rk-border bg-white px-2 text-xs text-rk-ink"
                >
                  <option value="">
                    No website (seed ideas only)
                  </option>
                  {websites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <SecondaryButton
                type="button"
                onClick={() => void browseUniverse()}
                disabled={!websiteId || researchLoading}
              >
                Browse site universe
              </SecondaryButton>
            </div>
          ) : null}

          {recent.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-rk-muted">
                Recent
              </span>
              {recent.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setSeedInput(r);
                    void runResearch(r);
                  }}
                  className="min-h-[32px] rounded-full border border-rk-border bg-rk-soft px-2.5 text-xs text-rk-secondary hover:text-rk-ink"
                >
                  {r}
                </button>
              ))}
            </div>
          ) : null}
        </Panel>
      </section>

      {/* ============ MODE TABS ============ */}
      <div
        className="mt-4 flex flex-wrap gap-1.5"
        role="tablist"
        aria-label="Research views"
      >
        {(
          [
            ['discover', 'Discover'],
            ['strategy', 'Strategy'],
            ['yours', 'Your Keywords'],
            ['competitors', 'Competitors'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            type="button"
            onClick={() => setTab(value)}
            className={`min-h-[44px] rounded-rk-sm border px-4 text-sm font-semibold transition-colors ${
              tab === value
                ? 'border-rk-ink bg-rk-ink text-white'
                : 'border-rk-border bg-white text-rk-secondary hover:text-rk-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {actionMsg ? (
        <div
          className="mt-3 rounded-rk-sm border border-rk-success/30 bg-rk-success/10 px-3 py-2 text-sm text-rk-success"
          role="status"
        >
          {actionMsg}{' '}
          <Link
            href="/content"
            className="font-semibold underline"
          >
            Open Content Engine
          </Link>
        </div>
      ) : null}
      {actionErr ? (
        <div
          className="mt-3 rounded-rk-sm border border-rk-danger/30 bg-rk-dangerSoft px-3 py-2 text-sm text-rk-danger"
          role="alert"
        >
          {actionErr}
        </div>
      ) : null}

      {/* ============ DISCOVER ============ */}
      {tab === 'discover' ? (
        <div className="mt-4 space-y-6">
          {researchLoading ? (
            <div className="space-y-3" aria-busy="true">
              <LoadingBlock title="Analyzing keyword opportunities…" />
              <p className="text-xs text-rk-muted">
                Loading keyword ideas first — metrics,
                opportunities and clusters follow from
                real crawl evidence. Numbers are never
                invented while you wait.
              </p>
            </div>
          ) : researchError ? (
            <ErrorState
              title="Keyword data couldn't be loaded"
              description={researchError}
              onRetry={() => void runResearch(seedInput)}
            />
          ) : !result ? (
            <EmptyState
              title="Start with a keyword, topic or competitor"
              description="Try: real estate marketing · seo tools · dentist near me. Research runs on your site and competitor crawl evidence — no fake volumes."
            />
          ) : (
            <>
              {/* summary */}
              <section aria-label="Research results">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                  <Metric
                    label="Keywords found"
                    value={fmtInt(result.summary.total)}
                    detail={
                      activeSeed
                        ? `for "${activeSeed}"`
                        : 'site universe'
                    }
                  />
                  <Metric
                    label="High opportunity"
                    value={fmtInt(
                      result.summary.highOpportunity,
                    )}
                    detail="Score 70+"
                    tone={
                      result.summary.highOpportunity > 0
                        ? 'positive'
                        : 'neutral'
                    }
                  />
                  <Metric
                    label="Quick wins"
                    value={fmtInt(result.summary.quickWins)}
                    detail="Existing coverage"
                    tone={
                      result.summary.quickWins > 0
                        ? 'positive'
                        : 'neutral'
                    }
                  />
                  <Metric
                    label="Content gaps"
                    value={fmtInt(
                      result.summary.contentGaps,
                    )}
                    detail="Competitor-only"
                    tone={
                      result.summary.contentGaps > 0
                        ? 'warning'
                        : 'neutral'
                    }
                  />
                  <Metric
                    label="Commercial"
                    value={fmtInt(result.summary.commercial)}
                    detail="Buying intent"
                  />
                </div>
                {!result.corpus.siteCrawled ? (
                  <p className="mt-2 text-xs text-rk-muted">
                    No completed site crawl for this
                    website yet — results lean on
                    competitor evidence and seed ideas.
                    Run a crawl to unlock site-foothold
                    scoring.
                  </p>
                ) : null}
                {/* data source + cost transparency */}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-rk-secondary">
                  <DataSourceBadge
                    source={
                      result.provider === 'DATAFORSEO'
                        ? 'DataForSEO'
                        : 'RENKOO crawl + GSC'
                    }
                    connected={
                      result.provider === 'DATAFORSEO'
                    }
                  />
                  {result.locationFallback ? (
                    <span className="rounded-rk-sm border border-rk-border bg-rk-warningSoft px-1.5 py-0.5 text-[11px] text-rk-warning">
                      Country not covered — showing US
                      data
                    </span>
                  ) : null}
                  {result.cost ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <FreshnessBadge
                        label={
                          result.cost.fresh
                            ? `Fresh lookup · ${result.cost.providerCalls} provider call(s)`
                            : `Cached · ${result.cost.cacheHits} cache hit(s)`
                        }
                      />
                      {usage &&
                      usage.freeLimit !== null ? (
                        <span>
                          Free researches:{' '}
                          {usage.freeUsed}/
                          {usage.freeLimit} this month
                        </span>
                      ) : null}
                      {usage?.apiCalls &&
                      typeof usage.apiCalls
                        .remaining === 'number' ? (
                        <span>
                          API calls left:{' '}
                          {fmtInt(
                            usage.apiCalls.remaining,
                          )}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          void runResearch(
                            activeSeed ||
                              seedInput,
                            true,
                          )
                        }
                        disabled={
                          researchLoading ||
                          (!activeSeed && !seedInput)
                        }
                        className="min-h-[32px] rounded-rk-sm border border-rk-border bg-white px-2 font-semibold text-rk-secondary hover:text-rk-ink disabled:opacity-50"
                        title="Bypass the cache and fetch fresh provider data. Counts against your allowance."
                      >
                        Refresh data
                      </button>
                    </span>
                  ) : null}
                </div>
              </section>

              {/* action plan + top opportunities */}
              {actionPlan ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  <Panel
                    eyebrow="RENKOO action plan"
                    title="What should I do?"
                    description="Rule-based next steps from real evidence — not generic advice."
                  >
                    <div className="space-y-2">
                      {actionPlan.improve.length > 0 ? (
                        <NextAction
                          label={`Improve: ${actionPlan.improve[0].keyword}`}
                          detail={`Your site covers this on ${actionPlan.improve[0].sitePages} page(s) · score ${actionPlan.improve[0].opportunityScore}`}
                          href="/content"
                        />
                      ) : null}
                      {actionPlan.create.length > 0 ? (
                        <NextAction
                          label={`Create: ${actionPlan.create[0].keyword}`}
                          detail="Competitor-covered gap — no relevant page detected"
                          href="/content"
                        />
                      ) : null}
                      {actionPlan.consolidate.length > 0 ? (
                        <NextAction
                          label={`Consolidate: ${actionPlan.consolidate[0].keyword}`}
                          detail="Multiple pages compete for this topic"
                          href="/opportunities"
                        />
                      ) : null}
                      {actionPlan.track.length > 0 ? (
                        <NextAction
                          label={`Track: ${actionPlan.track[0].keyword}`}
                          detail="High opportunity — monitor it"
                          href="/opportunities"
                        />
                      ) : null}
                      {actionPlan.improve.length === 0 &&
                      actionPlan.create.length === 0 ? (
                        <p className="rk-body">
                          Not enough evidence to prescribe
                          yet — widen the seed or run a
                          site crawl.
                        </p>
                      ) : null}
                    </div>
                  </Panel>
                  <Panel
                    eyebrow="Top opportunities"
                    title="Target these first"
                    description="Highest RENKOO Opportunity Scores with the reason attached."
                  >
                    <div className="space-y-2">
                      {topOpportunities.map((o, i) => (
                        <button
                          key={o.keyword}
                          type="button"
                          onClick={() => setDrawerIdea(o)}
                          className="flex w-full items-center gap-3 rounded-rk-sm border border-rk-border bg-white px-3 py-2 text-left hover:border-rk-ink"
                        >
                          <span className="rk-number text-xs text-rk-muted">
                            {i + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-rk-ink">
                              {o.keyword}
                            </span>
                            <span className="block truncate text-xs text-rk-secondary">
                              {o.sitePages > 0
                                ? 'Target: existing page'
                                : 'Target: new page'}{' '}
                              ·{' '}
                              {o.opportunityReasons[0] ??
                                o.decisionReason}
                            </span>
                          </span>
                          <ScoreBadge
                            score={o.opportunityScore}
                          />
                        </button>
                      ))}
                    </div>
                  </Panel>
                </div>
              ) : null}

              {/* filters */}
              <Panel
                eyebrow="Refine"
                title="Filters"
                description={
                  providerReady
                    ? 'Volume, KD and trend filters run on real provider data for the selected country. CPC filtering stays out — CPC informs the score, not the filter set.'
                    : 'Volume, KD and trend filters unlock when a provider connects — filtering runs on intent, type, decision, source and opportunity.'
                }
              >
                <FilterBar
                  searchValue={tableSearch}
                  searchPlaceholder="Filter keywords…"
                  onSearchChange={setTableSearch}
                  selects={[
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
                          value: 'COMMERCIAL',
                          label: 'Commercial',
                        },
                        {
                          value: 'TRANSACTIONAL',
                          label: 'Transactional',
                        },
                        {
                          value: 'BUYER_RESEARCH',
                          label: 'Buyer research',
                        },
                        {
                          value: 'COMPARISON',
                          label: 'Comparison',
                        },
                        {
                          value: 'LOCAL',
                          label: 'Local',
                        },
                      ],
                      onChange: setIntentFilter,
                    },
                    {
                      key: 'type',
                      label: 'Type',
                      value: typeFilter,
                      options: [
                        { value: 'ALL', label: 'All types' },
                        {
                          value: 'questions',
                          label: 'Questions',
                        },
                        {
                          value: 'long-tail',
                          label: 'Long-tail',
                        },
                        {
                          value: 'comparison',
                          label: 'Comparison',
                        },
                        {
                          value: 'commercial',
                          label: 'Commercial',
                        },
                        {
                          value: 'transactional',
                          label: 'Transactional',
                        },
                        {
                          value: 'problem-aware',
                          label: 'Problem-aware',
                        },
                        {
                          value: 'local',
                          label: 'Local',
                        },
                      ],
                      onChange: setTypeFilter,
                    },
                    {
                      key: 'decision',
                      label: 'Decision',
                      value: decisionFilter,
                      options: [
                        { value: 'ALL', label: 'All' },
                        {
                          value: 'TARGET',
                          label: 'Target now',
                        },
                        {
                          value: 'GAP',
                          label: 'Content gaps',
                        },
                        {
                          value: 'QUICK',
                          label: 'Quick wins',
                        },
                      ],
                      onChange: setDecisionFilter,
                    },
                    {
                      key: 'source',
                      label: 'Source',
                      value: sourceFilter,
                      options: [
                        {
                          value: 'ALL',
                          label: 'All sources',
                        },
                        {
                          value: 'SITE_CORPUS',
                          label: 'Your site',
                        },
                        {
                          value: 'COMPETITOR_CORPUS',
                          label: 'Competitors',
                        },
                        {
                          value: 'DERIVED_FROM_SEED',
                          label: 'Seed ideas',
                        },
                        {
                          value: 'PROVIDER',
                          label: 'Provider data',
                        },
                      ],
                      onChange: setSourceFilter,
                    },
                    {
                      key: 'minopp',
                      label: 'Min score',
                      value: minOpp,
                      options: [
                        { value: '0', label: 'Any score' },
                        { value: '30', label: '30+' },
                        { value: '50', label: '50+' },
                        { value: '70', label: '70+' },
                      ],
                      onChange: setMinOpp,
                    },
                    {
                      key: 'minvol',
                      label: 'Min volume',
                      value: minVol,
                      options: [
                        {
                          value: '0',
                          label: providerReady
                            ? 'Any volume'
                            : 'Needs provider',
                        },
                        { value: '100', label: '100+' },
                        { value: '1000', label: '1K+' },
                        {
                          value: '10000',
                          label: '10K+',
                        },
                      ],
                      onChange: setMinVol,
                    },
                    {
                      key: 'maxkd',
                      label: 'Max KD',
                      value: maxKd,
                      options: [
                        {
                          value: 'ANY',
                          label: providerReady
                            ? 'Any KD'
                            : 'Needs provider',
                        },
                        {
                          value: '30',
                          label: 'Easy (≤30)',
                        },
                        {
                          value: '50',
                          label: '≤50',
                        },
                        {
                          value: '65',
                          label: '≤65',
                        },
                      ],
                      onChange: setMaxKd,
                    },
                    {
                      key: 'trend',
                      label: 'Trend',
                      value: trendFilter,
                      options: [
                        {
                          value: 'ALL',
                          label: providerReady
                            ? 'Any trend'
                            : 'Needs provider',
                        },
                        {
                          value: 'rising',
                          label: 'Rising',
                        },
                        {
                          value: 'seasonal',
                          label: 'Seasonal',
                        },
                        {
                          value: 'stable',
                          label: 'Stable',
                        },
                        {
                          value: 'declining',
                          label: 'Declining',
                        },
                      ],
                      onChange: setTrendFilter,
                    },
                  ]}
                  onClearAll={() => {
                    setTableSearch('');
                    setIntentFilter('ALL');
                    setTypeFilter('ALL');
                    setDecisionFilter('ALL');
                    setSourceFilter('ALL');
                    setMinOpp('0');
                    setMinVol('0');
                    setMaxKd('ANY');
                    setTrendFilter('ALL');
                  }}
                />
                {/* AI research commands → real filters */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[
                    {
                      label: 'Find easy wins',
                      run: () => {
                        setDecisionFilter('QUICK');
                        setMinOpp('50');
                      },
                    },
                    {
                      label: 'High commercial intent',
                      run: () => {
                        setIntentFilter('COMMERCIAL');
                        setMinOpp('0');
                      },
                    },
                    {
                      label: 'Content gaps',
                      run: () => {
                        setDecisionFilter('GAP');
                        setMinOpp('0');
                      },
                    },
                    {
                      label: 'Rising questions',
                      run: () => {
                        setTypeFilter('questions');
                        setTrendFilter('rising');
                        setMinOpp('0');
                      },
                    },
                    {
                      label: 'Low KD wins',
                      run: () => {
                        setMaxKd('30');
                        setMinVol('100');
                        setMinOpp('30');
                      },
                    },
                    {
                      label: 'Worth a new page',
                      run: () => {
                        setDecisionFilter('TARGET');
                        setSourceFilter(
                          'COMPETITOR_CORPUS',
                        );
                      },
                    },
                  ].map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      onClick={c.run}
                      className="min-h-[32px] rounded-full border border-rk-border bg-white px-2.5 text-xs font-medium text-rk-secondary hover:border-rk-ink hover:text-rk-ink"
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </Panel>

              {/* bulk toolbar */}
              {selectedKeys.length > 0 ? (
                <div
                  className="flex flex-wrap items-center gap-2 rounded-rk-sm border border-rk-ink bg-white px-3 py-2"
                  role="toolbar"
                  aria-label="Bulk keyword actions"
                >
                  <span className="text-sm font-semibold text-rk-ink">
                    {selectedKeys.length} selected
                  </span>
                  <SecondaryButton
                    type="button"
                    onClick={() =>
                      void handleClusterSelected()
                    }
                  >
                    {clusterLoading
                      ? 'Clustering…'
                      : 'AI Cluster'}
                  </SecondaryButton>
                  <SecondaryButton
                    type="button"
                    onClick={() =>
                      downloadCsv(
                        'renkoo-keywords.csv',
                        ideasToCsv(
                          ideas.filter((i) =>
                            selectedKeys.includes(
                              i.keyword,
                            ),
                          ),
                        ),
                      )
                    }
                  >
                    Export
                  </SecondaryButton>
                  <GhostButton
                    type="button"
                    onClick={() => setSelectedKeys([])}
                  >
                    Clear
                  </GhostButton>
                </div>
              ) : null}

              {/* table */}
              <Panel
                eyebrow="Results"
                title="Keyword ideas"
                description="Default sort is Opportunity — action first, vanity metrics never. Open a row for the full Keyword Overview."
              >
                <DataTable
                  caption="Keyword research results from real crawl evidence"
                  columns={discoverColumns}
                  rows={filtered}
                  keyOf={(r) => r.keyword}
                  onRowClick={(r) => setDrawerIdea(r)}
                  selectedKeys={selectedKeys}
                  onSelectionChange={setSelectedKeys}
                  defaultSort={{
                    key: 'opportunity',
                    direction: 'desc',
                  }}
                  rowActions={(r) => [
                    {
                      label: 'View',
                      onSelect: () => setDrawerIdea(r),
                    },
                    {
                      label: 'Save to list',
                      onSelect: () =>
                        setListDialogIdea(r),
                    },
                    {
                      label: 'Create brief',
                      onSelect: () => void handleBrief(r),
                    },
                    {
                      label: 'Track keyword',
                      onSelect: () => void handleTrack(r),
                    },
                  ]}
                  emptyTitle="No keywords match"
                  emptyDescription="Loosen filters, try a broader seed, or browse the site universe."
                  pageSize={15}
                />
              </Panel>

              {/* clusters */}
              <Panel
                eyebrow="Clustering"
                title="Topic clusters"
                description="Token grouping is instant and free. SERP-similarity clustering proves which keywords belong on ONE page because Google returns the same results — sampled to protect cost."
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <SecondaryButton
                    type="button"
                    onClick={() => void runSerpCluster()}
                    disabled={
                      serpClusterLoading ||
                      ideas.length < 2
                    }
                  >
                    {serpClusterLoading
                      ? 'Analyzing SERP results…'
                      : 'Cluster by SERP'}
                  </SecondaryButton>
                  <span className="text-[11px] text-rk-muted">
                    {selectedKeys.length > 0
                      ? `Uses your ${selectedKeys.length} selected keywords`
                      : 'Uses the top 25 filtered keywords'}{' '}
                    · cache-first · striking-distance
                    keywords sampled first
                  </span>
                </div>
                {serpClusterError ? (
                  <p
                    className="rk-body mb-2 text-rk-danger"
                    role="alert"
                  >
                    {serpClusterError}
                  </p>
                ) : null}
                {serpClusters ? (
                  <div className="mb-3 rounded-rk-sm border border-rk-border bg-rk-soft px-2 py-1.5">
                    <p className="text-[11px] font-semibold text-rk-ink">
                      Cluster basis: SERP similarity
                    </p>
                    <p className="text-[11px] text-rk-secondary">
                      {serpClusterMeta?.basis ?? ''}
                    </p>
                    <p className="mt-0.5 text-[11px] text-rk-muted">
                      Analyzed{' '}
                      {serpClusterMeta?.analyzed ??
                        0} SERPs (
                      {serpClusterMeta?.fromCache ??
                        0}{' '}
                      cached
                      {serpClusterMeta?.fresh
                        ? `, ${serpClusterMeta.fresh} fresh`
                        : ''}
                      {serpClusterMeta?.skipped
                        ? `, ${serpClusterMeta.skipped} skipped over the sampling cap — refine filters or select keywords, then run again`
                        : ''}
                      ).
                    </p>
                  </div>
                ) : null}
                {serpClusters &&
                serpClusters.length > 0 ? (
                  <div className="mb-3 grid gap-2 md:grid-cols-2">
                    {serpClusters.map((c) => (
                      <div
                        key={c.name}
                        className="rounded-rk-sm border border-rk-border bg-white p-3"
                      >
                        <p className="text-sm font-bold text-rk-ink">
                          {c.name}
                        </p>
                        <p className="mt-0.5 text-xs text-rk-secondary">
                          Primary:{' '}
                          <span className="font-semibold text-rk-ink">
                            {c.primaryKeyword}
                          </span>{' '}
                          · {c.size} keyword
                          {c.size === 1 ? '' : 's'}
                          {c.serpSimilarity !==
                            null &&
                          c.serpSimilarity !==
                            undefined
                            ? ` · SERP similarity ${c.serpSimilarity.toFixed(2)}`
                            : ''}
                          {c.volume !== null &&
                          c.volume !== undefined
                            ? ` · ${fmtVolume(c.volume)}/mo`
                            : ''}
                        </p>
                        <p className="mt-0.5 text-xs text-rk-secondary">
                          {intentLabel(c.intent)} ·{' '}
                          {c.recommendedPageType}
                          {c.pageDecision
                            ? ` · ${pageActionLabel(c.pageDecision.action)}`
                            : ''}
                        </p>
                        {c.supportingKeywords.length >
                        0 ? (
                          <p className="mt-1 line-clamp-2 text-xs text-rk-muted">
                            {c.supportingKeywords
                              .slice(0, 4)
                              .join(' · ')}
                            {c.supportingKeywords
                              .length > 4
                              ? ` · +${c.supportingKeywords.length - 4} more`
                              : ''}
                          </p>
                        ) : null}
                        {c.splitNote ? (
                          <p className="mt-1 text-[11px] font-medium text-rk-warning">
                            {c.splitNote}
                          </p>
                        ) : (
                          <p className="mt-1 text-[11px] text-rk-success">
                            One page can serve this
                            cluster.
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <GhostButton
                            type="button"
                            onClick={() =>
                              void handleBrief({
                                keyword:
                                  c.primaryKeyword,
                              })
                            }
                          >
                            Brief primary
                          </GhostButton>
                          <GhostButton
                            type="button"
                            onClick={() =>
                              void handleTrack({
                                keyword:
                                  c.primaryKeyword,
                              })
                            }
                          >
                            Track primary
                          </GhostButton>
                          <GhostButton
                            type="button"
                            onClick={() =>
                              downloadCsv(
                                `cluster-${c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`,
                                [
                                  'keyword,role,volume,kd',
                                  [
                                    c.primaryKeyword,
                                    'primary',
                                    c.volume ?? '',
                                    c.keywordDifficulty ??
                                      '',
                                  ].join(','),
                                  ...c.supportingKeywords.map(
                                    (k) =>
                                      `"${k.replace(/"/g, '""')}",supporting,,`,
                                  ),
                                ].join('\n'),
                              )
                            }
                          >
                            Export
                          </GhostButton>
                          <GhostButton
                            type="button"
                            onClick={() =>
                              addToList(
                                null,
                                `Cluster: ${c.name}`,
                                [
                                  c.primaryKeyword,
                                  ...c.supportingKeywords,
                                ],
                              )
                            }
                          >
                            Save cluster
                          </GhostButton>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                <p className="mb-2 text-[11px] font-semibold text-rk-muted">
                  Cluster basis: RENKOO semantic
                  fallback (token overlap + parent
                  topic)
                </p>
                {(clusterResult ?? result.clusters).length ===
                0 ? (
                  <p className="rk-body">
                    No clusters yet.
                  </p>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2">
                    {(clusterResult ?? result.clusters)
                      .slice(0, 6)
                      .map((c) => (
                        <div
                          key={c.cluster}
                          className="rounded-rk-sm border border-rk-border bg-white p-3"
                        >
                          <p className="text-sm font-bold text-rk-ink">
                            {c.cluster}
                          </p>
                          <p className="mt-0.5 text-xs text-rk-secondary">
                            Primary:{' '}
                            <span className="font-semibold text-rk-ink">
                              {c.primaryKeyword}
                            </span>{' '}
                            · {c.size} keywords ·{' '}
                            {intentLabel(c.intent)} ·{' '}
                            {c.recommendedPageType}
                            {c.avgOpportunity !== null
                              ? ` · score ${c.avgOpportunity}`
                              : ''}
                          </p>
                          {c.supportingKeywords.length >
                          0 ? (
                            <p className="mt-1 line-clamp-2 text-xs text-rk-muted">
                              {c.supportingKeywords
                                .slice(0, 4)
                                .join(' · ')}
                              {c.supportingKeywords.length >
                              4
                                ? ` · +${c.supportingKeywords.length - 4} more`
                                : ''}
                            </p>
                          ) : null}
                        </div>
                      ))}
                  </div>
                )}
              </Panel>

              {/* lists */}
              <Panel
                eyebrow="Organize"
                title="Keyword lists"
                description="Lists persist per website in this workspace. Export carries actual data only."
              >
                {lists.length === 0 ? (
                  <p className="rk-body">
                    No lists yet — open any keyword and
                    choose “Save to list”.
                  </p>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2">
                    {lists.map((l) => (
                      <div
                        key={l.id}
                        className="flex items-center gap-2 rounded-rk-sm border border-rk-border bg-white p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-rk-ink">
                            {l.name}
                          </p>
                          <p className="text-xs text-rk-secondary">
                            {l.keywords.length} keywords
                          </p>
                        </div>
                        <SecondaryButton
                          type="button"
                          onClick={() =>
                            downloadCsv(
                              `${l.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`,
                              ideasToCsv(
                                l.keywords.map(
                                  (k) =>
                                    ideas.find(
                                      (i) =>
                                        i.keyword === k,
                                    ) ?? {
                                      keyword: k,
                                      intent: 'UNKNOWN',
                                      opportunityScore: 0,
                                      targetDecision:
                                        'LOW_PRIORITY',
                                      sitePages: 0,
                                      competitorCount: 0,
                                      parentTopic: '',
                                      sources: [],
                                    },
                                ) as ResearchIdea[],
                              ),
                            )
                          }
                        >
                          Export
                        </SecondaryButton>
                        <GhostButton
                          type="button"
                          onClick={() =>
                            persistLists(
                              lists.filter(
                                (x) => x.id !== l.id,
                              ),
                            )
                          }
                        >
                          Delete
                        </GhostButton>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <RecommendationCallout
                title="Keywords → content"
                text="High-opportunity clusters are content briefs waiting to happen. The Content Engine builds them from measured evidence."
                actionLabel="Open Content Engine"
                actionHref="/content"
              />
            </>
          )}
        </div>
      ) : null}

      {/* ============ STRATEGY ============ */}
      {tab === 'strategy' ? (
        <div className="mt-4 space-y-6">
          <Panel
            eyebrow="Strategy"
            title="SEO strategy"
            description="Deterministic priorities from observed GSC and crawl evidence plus cached provider data. Zero provider cost — nothing here triggers fresh billable lookups."
            actions={
              <PrimaryButton
                type="button"
                onClick={() => void runStrategy()}
                disabled={!websiteId || strategyLoading}
              >
                {strategyLoading
                  ? 'Building…'
                  : strategy
                    ? 'Rebuild strategy'
                    : 'Build strategy'}
              </PrimaryButton>
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <DataSourceBadge
                source="GSC + crawl corpus"
                connected={
                  strategy
                    ? strategy.dataAvailability
                        .gscConnected
                    : false
                }
              />
              {strategy ? (
                <FreshnessBadge
                  label={`${strategy.period.startDate} → ${strategy.period.endDate}`}
                />
              ) : null}
              {!websiteId ? (
                <span className="text-xs text-rk-muted">
                  Select a website above to begin.
                </span>
              ) : null}
            </div>
            {strategyError ? (
              <ErrorState
                title="Strategy failed to load"
                description={strategyError}
                onRetry={() => void runStrategy()}
              />
            ) : null}
            {strategy ? (
              <p className="rk-body mt-2">
                {strategy.universe.gscKeywords} ranking
                keywords +{' '}
                {strategy.universe.gapCandidates}{' '}
                competitor-gap candidates scored.
                {strategy.dataAvailability.notes.map(
                  (n) => ` ${n}`,
                )}
              </p>
            ) : null}
            {!strategy &&
            !strategyLoading &&
            !strategyError ? (
              <div className="mt-3">
                <EmptyState
                  title="No strategy yet"
                  description="Building the strategy is zero provider cost — it scores observed GSC and crawl evidence plus cached provider data. Select a website above, then build."
                  actionLabel="Build strategy"
                  onAction={() => void runStrategy()}
                />
              </div>
            ) : null}
          </Panel>

          {strategyLoading ? (
            <LoadingBlock title="Scoring keyword strategy" />
          ) : null}

          {strategy && !strategyLoading ? (
            <>
              <section aria-label="Strategy health">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Metric
                    label="Target now"
                    value={fmtInt(
                      strategy.summary.TARGET_NOW,
                    )}
                    detail="Strategic focus"
                    tone={
                      strategy.summary.TARGET_NOW > 0
                        ? 'positive'
                        : 'neutral'
                    }
                  />
                  <Metric
                    label="Quick wins"
                    value={fmtInt(
                      strategy.summary.QUICK_WIN,
                    )}
                    detail="Positions 4–20"
                    tone={
                      strategy.summary.QUICK_WIN > 0
                        ? 'positive'
                        : 'neutral'
                    }
                  />
                  <Metric
                    label="Create"
                    value={fmtInt(
                      strategy.summary.CREATE,
                    )}
                    detail="Missing content"
                    tone={
                      strategy.summary.CREATE > 0
                        ? 'warning'
                        : 'neutral'
                    }
                  />
                  <Metric
                    label="Grow"
                    value={fmtInt(
                      strategy.summary.GROW,
                    )}
                    detail="Optimize/expand"
                  />
                  <Metric
                    label="Consolidate"
                    value={fmtInt(
                      strategy.summary.CONSOLIDATE,
                    )}
                    detail="Cannibalization risk"
                    tone={
                      strategy.summary.CONSOLIDATE > 0
                        ? 'warning'
                        : 'neutral'
                    }
                  />
                  <Metric
                    label="Protect"
                    value={fmtInt(
                      strategy.summary.PROTECT,
                    )}
                    detail="Top-3 defend"
                  />
                  <Metric
                    label="Monitor"
                    value={fmtInt(
                      strategy.summary.MONITOR,
                    )}
                    detail="Watch"
                  />
                  <Metric
                    label="Ignore"
                    value={fmtInt(
                      strategy.summary.IGNORE,
                    )}
                    detail="Deprioritized"
                    tone={
                      strategy.summary.IGNORE > 0
                        ? 'warning'
                        : 'neutral'
                    }
                  />
                </div>
              </section>

              <Panel
                eyebrow="Action queue"
                title="Next 10 actions"
                description="Sorted by impact × feasibility. Effort is a qualitative estimate, never a time promise."
              >
                {strategy.nextActions.length === 0 ? (
                  <EmptyState
                    title="No actions surfaced"
                    description="Current evidence does not produce actionable opportunities. Broaden demand or improve GSC/provider coverage."
                  />
                ) : (
                  <div className="space-y-2">
                    {strategy.nextActions.map((a) => (
                      <button
                        key={a.rank}
                        type="button"
                        onClick={() => {
                          const opp =
                            strategy.opportunities.find(
                              (o) =>
                                o.keyword ===
                                a.keyword,
                            ) ?? null;
                          setStrategyDrawer(opp);
                          setPipelineMsg('');
                          setPipelineErr('');
                          setLinkRecs([]);
                          void refreshContentLinks();
                          if (opp) {
                            void refreshLinkRecs(
                              opp.keyword,
                            );
                          }
                        }}
                        className="flex w-full items-start gap-3 rounded-rk-sm border border-rk-border bg-white px-3 py-2 text-left hover:border-rk-ink"
                      >
                        <span className="rk-number mt-0.5 w-5 shrink-0 text-xs text-rk-muted">
                          {a.rank}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-rk-ink">
                            {a.keyword}
                          </span>
                          <span
                            className="block truncate text-xs text-rk-secondary"
                            title={
                              a.targetUrl ??
                              undefined
                            }
                          >
                            {actionTypeLabel(
                              a.actionType,
                            )}
                            {a.targetUrl
                              ? ` → ${a.targetUrl.replace(/^https?:\/\//, '')}`
                              : ' → new page'}{' '}
                            · Effort {a.effort.toLowerCase()}
                          </span>
                          <span className="block truncate text-xs text-rk-muted">
                            {a.reason}
                          </span>
                        </span>
                        <ToneChip
                          label={a.priority}
                          tone={priorityTone(a.priority)}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel
                eyebrow="Opportunities"
                title="Top opportunities"
                description="Priority bands: HIGH ≥ 60 · MEDIUM 38–59 · LOW < 38, scored from available evidence such as position, impressions, CTR gap, intent, coverage, competitor gap, trend/provider data and SERP evidence when available. Open a row for evidence."
              >
                <FilterBar
                  searchValue={strategySearch}
                  searchPlaceholder="Filter opportunities…"
                  onSearchChange={setStrategySearch}
                  selects={[
                    {
                      key: 'bucket',
                      label: 'Bucket',
                      value: strategyBucket,
                      options: [
                        { value: 'ALL', label: 'All' },
                        {
                          value: 'TARGET_NOW',
                          label: 'Target now',
                        },
                        {
                          value: 'QUICK_WIN',
                          label: 'Quick wins',
                        },
                        { value: 'GROW', label: 'Grow' },
                        {
                          value: 'PROTECT',
                          label: 'Protect',
                        },
                        {
                          value: 'CREATE',
                          label: 'Create',
                        },
                        {
                          value: 'CONSOLIDATE',
                          label: 'Consolidate',
                        },
                        {
                          value: 'MONITOR',
                          label: 'Monitor',
                        },
                        {
                          value: 'IGNORE',
                          label: 'Ignore',
                        },
                      ],
                      onChange: setStrategyBucket,
                    },
                  ]}
                  onClearAll={() => {
                    setStrategySearch('');
                    setStrategyBucket('ALL');
                  }}
                />
                <details className="mt-3 rounded-rk-sm border border-rk-border bg-white px-3 py-2">
                  <summary className="cursor-pointer text-xs font-semibold text-rk-ink">
                    What do these actions mean?
                  </summary>
                  <dl className="mt-2 space-y-1.5 text-xs leading-5 text-rk-secondary">
                    <div>
                      <dt className="inline font-semibold text-rk-ink">
                        Improve —{' '}
                      </dt>
                      <dd className="inline">
                        Ranking 4–20 with a strong page
                        match → improve the existing
                        page.
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-semibold text-rk-ink">
                        Optimize —{' '}
                      </dt>
                      <dd className="inline">
                        Page has weak/partial coverage or
                        is outside striking distance →
                        optimize it for the intent.
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-semibold text-rk-ink">
                        Create —{' '}
                      </dt>
                      <dd className="inline">
                        Demand exists but no suitable page
                        is covered → create a page.
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-semibold text-rk-ink">
                        Consolidate —{' '}
                      </dt>
                      <dd className="inline">
                        Multiple URLs compete/earn
                        impressions for the same
                        keyword/topic → choose and
                        consolidate around a primary page.
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-semibold text-rk-ink">
                        Protect —{' '}
                      </dt>
                      <dd className="inline">
                        Top-3 performance → protect and
                        maintain the page.
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-semibold text-rk-ink">
                        Ignore —{' '}
                      </dt>
                      <dd className="inline">
                        No meaningful evidence or
                        strategically irrelevant → do not
                        prioritize.
                      </dd>
                    </div>
                  </dl>
                </details>
                <div className="mt-3">
                  <DataTable
                    caption="Strategy opportunities ranked by priority"
                    columns={[
                      {
                        key: 'keyword',
                        label: 'Keyword',
                        priority: 'high',
                        sortable: true,
                        sortValue: (r) => r.keyword,
                        render: (r) => (
                          <span className="font-semibold text-rk-ink">
                            {r.keyword}
                          </span>
                        ),
                      },
                      {
                        key: 'intent',
                        label: 'Intent',
                        priority: 'medium',
                        render: (r) => (
                          <span className="text-rk-secondary">
                            {intentLabel(r.intent)}
                          </span>
                        ),
                      },
                      {
                        key: 'position',
                        label: 'Pos',
                        align: 'right',
                        priority: 'high',
                        sortable: true,
                        sortValue: (r) =>
                          r.position ?? 999,
                        render: (r) => (
                          <span className="rk-number">
                            {r.position !== null
                              ? r.position.toFixed(1)
                              : '—'}
                          </span>
                        ),
                      },
                      {
                        key: 'page',
                        label: 'Page',
                        priority: 'medium',
                        render: (r) => (
                          <span
                            className="block max-w-[220px] truncate text-xs text-rk-secondary"
                            title={r.targetPage ?? ''}
                          >
                            {r.targetPage
                              ? r.targetPage.replace(
                                  /^https?:\/\//,
                                  '',
                                )
                              : '—'}
                          </span>
                        ),
                      },
                      {
                        key: 'priority',
                        label: 'Priority',
                        priority: 'high',
                        sortable: true,
                        sortValue: (r) =>
                          r.priorityScore,
                        render: (r) => (
                          <StrategyPriorityCell
                            score={r.priorityScore}
                            priority={r.priority}
                          />
                        ),
                      },
                      {
                        key: 'action',
                        label: 'Action',
                        priority: 'medium',
                        render: (r) => (
                          <ToneChip
                            label={`${pageMappingLabel(r.pageMapping)} · ${bucketLabel(r.bucket)}`}
                            tone={bucketTone(r.bucket)}
                          />
                        ),
                      },
                    ]}
                    rows={strategy.opportunities.filter(
                      (o) => {
                        const q = strategySearch
                          .trim()
                          .toLowerCase();
                        if (
                          q &&
                          !o.keyword
                            .toLowerCase()
                            .includes(q)
                        )
                          return false;
                        if (
                          strategyBucket !== 'ALL' &&
                          o.bucket !== strategyBucket
                        )
                          return false;
                        return true;
                      },
                    )}
                    keyOf={(r) => r.keyword}
                    onRowClick={(r) => {
                      setStrategyDrawer(r);
                      setPipelineMsg('');
                      setPipelineErr('');
                      setLinkRecs([]);
                      void refreshContentLinks();
                      void refreshLinkRecs(r.keyword);
                    }}
                    emptyTitle="No opportunities match"
                    emptyDescription="Adjust the bucket filter or search."
                    pageSize={15}
                  />
                </div>
              </Panel>

              <Panel
                eyebrow="Topic strategy"
                title="Topic strategy"
                description="Clusters with existing pages, missing content, cannibalization risk and pillar recommendations."
              >
                {strategy.clusters.length === 0 ? (
                  <EmptyState
                    title="No clusters yet"
                    description="Clusters appear once opportunities are scored."
                  />
                ) : (
                  <div className="grid gap-2 md:grid-cols-2">
                    {strategy.clusters
                      .slice(0, 8)
                      .map((c) => (
                        <div
                          key={c.topic}
                          className="rounded-rk-sm border border-rk-border bg-white p-3"
                        >
                          <p className="flex items-center gap-2 text-sm font-bold text-rk-ink">
                            {c.topic}
                            <ToneChip
                              label={c.priority}
                              tone={priorityTone(
                                c.priority,
                              )}
                            />
                          </p>
                          <p className="mt-0.5 text-xs text-rk-secondary">
                            Primary:{' '}
                            <span className="font-semibold text-rk-ink">
                              {c.primaryKeyword}
                            </span>{' '}
                            · {c.size} keyword
                            {c.size === 1 ? '' : 's'} ·{' '}
                            {intentLabel(c.intent)}
                          </p>
                          <p className="mt-0.5 text-xs text-rk-secondary">
                            Pillar:{' '}
                            {c.pillarPage ??
                              'no page yet — create one'}
                          </p>
                          {c.missingPages > 0 ? (
                            <p className="mt-0.5 text-xs text-rk-warning">
                              Missing content for{' '}
                              {c.missingPages} keyword
                              {c.missingPages === 1
                                ? ''
                                : 's'}
                            </p>
                          ) : null}
                          {c.cannibalizationRisk ? (
                            <p className="mt-0.5 text-xs font-semibold text-rk-danger">
                              Cannibalization risk —
                              consolidate before
                              creating.
                            </p>
                          ) : null}
                          {c.supportingContent.length >
                          0 ? (
                            <p className="mt-1 line-clamp-2 text-xs text-rk-muted">
                              Supporting:{' '}
                              {c.supportingContent
                                .slice(0, 4)
                                .join(' · ')}
                            </p>
                          ) : null}
                        </div>
                      ))}
                  </div>
                )}
              </Panel>

              <Panel
                eyebrow="Link graph"
                title="Potential orphans"
                description="Pages with zero observed inbound internal links in the latest completed crawl. Candidates only — never an orphan verdict."
              >
                {orphanLoading ? (
                  <LoadingBlock title="Checking inbound links" />
                ) : orphans.length === 0 ? (
                  <EmptyState
                    title="No orphan candidates"
                    description={
                      orphanCrawlId
                        ? 'Every crawled page has at least one observed inbound internal link, or ineligible pages were excluded.'
                        : 'Run a website crawl first — orphan analysis needs a completed crawl.'
                    }
                  />
                ) : (
                  <div className="space-y-2">
                    <p className="rk-metadata">
                      {orphans.length} candidate
                      {orphans.length === 1 ? '' : 's'}{' '}
                      · crawl{' '}
                      {orphanCrawlCompletedAt
                        ? fmtDate(orphanCrawlCompletedAt)
                        : orphanCrawlId ?? 'unknown'}
                    </p>
                    {orphans.slice(0, 10).map((o) => (
                      <div
                        key={o.url}
                        className="rounded-rk-sm border border-rk-border bg-white px-3 py-2"
                      >
                        <p className="break-all text-sm font-semibold text-rk-ink">
                          {o.url}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-rk-secondary">
                          <span>
                            Inbound internal links: 0
                            (observed)
                          </span>
                          {o.strategy ? (
                            <ToneChip
                              label={
                                o.strategy.priority ??
                                'UNRATED'
                              }
                              tone={priorityTone(
                                o.strategy.priority ??
                                  'LOW',
                              )}
                            />
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-xs text-rk-muted">
                          {o.explanation} Add links from
                          related pages, then re-crawl to
                          verify.
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel
                eyebrow="AI strategist"
                title="AI strategist"
                description="Evidence-only summaries from verified strategy facts. Unavailable data is stated, never invented. Uses AI credits."
              >
                <div className="flex flex-wrap items-center gap-2">
                  {(['GEMINI', 'OPENAI'] as const).map(
                    (p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() =>
                          setBriefProvider(p)
                        }
                        aria-pressed={
                          briefProvider === p
                        }
                        className={`min-h-[36px] rounded-rk-sm border px-3 text-xs font-semibold ${
                          briefProvider === p
                            ? 'border-rk-ink bg-rk-ink text-white'
                            : 'border-rk-border bg-white text-rk-secondary'
                        }`}
                      >
                        {p === 'GEMINI'
                          ? 'Gemini'
                          : 'OpenAI'}
                      </button>
                    ),
                  )}
                  <SecondaryButton
                    type="button"
                    onClick={() => void runBrief()}
                    disabled={
                      briefLoading || !websiteId
                    }
                  >
                    {briefLoading
                      ? 'Writing…'
                      : briefText
                        ? 'Regenerate brief'
                        : 'Generate brief'}
                  </SecondaryButton>
                </div>
                {briefError ? (
                  <ErrorState
                    title="AI brief unavailable"
                    description={briefError}
                    onRetry={() => void runBrief()}
                  />
                ) : null}
                {briefText ? (
                  <div className="mt-3 whitespace-pre-wrap rounded-rk-sm border border-rk-border bg-rk-soft px-3 py-2 text-sm text-rk-ink">
                    {briefText}
                  </div>
                ) : null}
                <div className="mt-3">
                  <p className="rk-label">
                    Saved briefs
                  </p>
                  {briefHistoryLoading ? (
                    <p className="rk-metadata mt-1">
                      Loading saved briefs…
                    </p>
                  ) : briefHistory.length === 0 ? (
                    <p className="rk-metadata mt-1">
                      No saved briefs for this website
                      yet — generated briefs appear here
                      with date, provider and evidence
                      size.
                    </p>
                  ) : (
                    <ul className="mt-1 space-y-1">
                      {briefHistory.map((b) => (
                        <li
                          key={b.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-rk-sm border border-rk-border bg-white px-3 py-2 text-xs"
                        >
                          <span className="text-rk-secondary">
                            {fmtDate(b.createdAt)} ·{' '}
                            {b.provider} ·{' '}
                            {b.model ?? 'model unknown'} ·{' '}
                            {b.itemCount} keywords
                          </span>
                          <SecondaryButton
                            type="button"
                            onClick={() =>
                              void runBrief()
                            }
                            disabled={
                              briefLoading || !websiteId
                            }
                          >
                            Regenerate
                          </SecondaryButton>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Panel>
            </>
          ) : null}
        </div>
      ) : null}

      {/* ============ YOUR KEYWORDS (GSC, preserved) ============ */}
      {tab === 'yours' ? (
        <div className="mt-4">
          {gscLoading ? (
            <LoadingBlock title="Loading keyword data" />
          ) : connected === false ? (
            <NotConnectedState
              title="Search Console is not connected"
              description="Keyword intelligence needs a connected Search Console property. No keywords are shown until then — nothing is estimated."
              connectLabel="Continue setup"
              connectHref="/first-value"
            />
          ) : (
            <div className="space-y-6">
              <Panel
                eyebrow="Context"
                title="Website, period & filters"
                description="Queries are property-scoped to the connected Search Console property. Intent is a transparent text estimate; opportunity flags are deterministic rules over measured values."
              >
                <FilterBar
                  searchValue={gscSearch}
                  searchPlaceholder="Search keywords…"
                  onSearchChange={setGscSearch}
                  selects={[
                    {
                      key: 'website',
                      label: 'Website',
                      value: websiteId,
                      options:
                        websites.length > 0
                          ? websites.map((s) => ({
                              value: s.id,
                              label: s.name,
                            }))
                          : [
                              {
                                value: '',
                                label: 'No websites',
                              },
                            ],
                      onChange: handleWebsiteChange,
                    },
                    {
                      key: 'period',
                      label: 'Period',
                      value: period,
                      options: [
                        { value: '7', label: 'Last 7 days' },
                        {
                          value: '28',
                          label: 'Last 28 days',
                        },
                        {
                          value: '90',
                          label: 'Last 90 days',
                        },
                      ],
                      onChange: setPeriod,
                    },
                    {
                      key: 'intent',
                      label: 'Intent',
                      value: gscIntent,
                      options: [
                        {
                          value: 'ALL',
                          label: 'All intents',
                        },
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
                      onChange: setGscIntent,
                    },
                    {
                      key: 'position',
                      label: 'Position',
                      value: gscPosition,
                      options: [
                        {
                          value: 'ALL',
                          label: 'All positions',
                        },
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
                      onChange: setGscPosition,
                    },
                    {
                      key: 'opp',
                      label: 'Opportunity',
                      value: gscOpp,
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
                      onChange: setGscOpp,
                    },
                  ]}
                  onClearAll={() => {
                    setGscSearch('');
                    setGscIntent('ALL');
                    setGscPosition('ALL');
                    setGscOpp('ALL');
                  }}
                />
              </Panel>

              {gscError ? (
                <ErrorState
                  title="Keyword data couldn't be loaded"
                  description={gscError}
                  onRetry={() => {
                    setGscLoading(true);
                    void loadGsc();
                  }}
                />
              ) : null}

              <section aria-label="Top signals">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Metric
                    label="Tracked keywords"
                    value={fmtInt(gscStats.total)}
                    detail="Measured in period"
                  />
                  <Metric
                    label="Avg. position"
                    value={gscStats.avg}
                    detail="Lower is better"
                  />
                  <Metric
                    label="Top-3 keywords"
                    value={fmtInt(gscStats.top3)}
                    detail="Defend these"
                    tone={
                      gscStats.top3 > 0
                        ? 'positive'
                        : 'neutral'
                    }
                  />
                  <Metric
                    label="Flagged opportunities"
                    value={fmtInt(gscStats.opps)}
                    detail="Rule-based flags"
                    tone={
                      gscStats.opps > 0
                        ? 'warning'
                        : 'neutral'
                    }
                  />
                </div>
              </section>

              <Panel
                eyebrow="Quick wins 2.0"
                title="Striking distance × real demand"
                description="GSC positions 4–20 enriched with provider volume and KD where available. Manageable KD (≤65) sorts first."
              >
                {!qw2 && !qw2Loading ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <SecondaryButton
                      type="button"
                      onClick={() => void runQuickWins2()}
                      disabled={!websiteId}
                    >
                      Enrich quick wins
                    </SecondaryButton>
                    <span className="text-xs text-rk-muted">
                      One cached-or-fresh provider lookup;
                      failures never consume credits.
                    </span>
                  </div>
                ) : null}
                {qw2Loading ? (
                  <LoadingBlock title="Enriching quick wins with provider data…" />
                ) : null}
                {qw2Error ? (
                  <ErrorState
                    title="Quick Wins enrichment unavailable"
                    description={qw2Error}
                    onRetry={() => void runQuickWins2()}
                  />
                ) : null}
                {qw2 && !qw2Loading ? (
                  <DataTable
                    caption="Quick wins enriched with provider demand data"
                    columns={[
                      {
                        key: 'keyword',
                        label: 'Keyword',
                        priority: 'high',
                        render: (r: any) => (
                          <span className="font-semibold text-rk-ink">
                            {r.keyword}
                          </span>
                        ),
                      },
                      {
                        key: 'position',
                        label: 'Pos',
                        align: 'right',
                        priority: 'high',
                        sortable: true,
                        sortValue: (r: any) =>
                          num(r.position),
                        render: (r: any) => (
                          <span className="rk-number">
                            {num(r.position).toFixed(1)}
                          </span>
                        ),
                      },
                      {
                        key: 'volume',
                        label: 'Volume',
                        align: 'right',
                        priority: 'medium',
                        sortable: true,
                        sortValue: (r: any) =>
                          r.volume ?? -1,
                        render: (r: any) => (
                          <span className="rk-number">
                            {r.volume === null ||
                            r.volume === undefined
                              ? '—'
                              : fmtVolume(r.volume)}
                          </span>
                        ),
                      },
                      {
                        key: 'kd',
                        label: 'KD',
                        align: 'right',
                        priority: 'medium',
                        sortable: true,
                        sortValue: (r: any) =>
                          r.keywordDifficulty ?? 999,
                        render: (r: any) => (
                          <span className="rk-number">
                            {r.keywordDifficulty ??
                              '—'}
                          </span>
                        ),
                      },
                      {
                        key: 'impr',
                        label: 'Impr.',
                        align: 'right',
                        priority: 'medium',
                        sortable: true,
                        sortValue: (r: any) =>
                          num(r.impressions),
                        render: (r: any) => (
                          <span className="rk-number">
                            {fmtInt(r.impressions)}
                          </span>
                        ),
                      },
                      {
                        key: 'opp',
                        label: 'Opportunity',
                        priority: 'high',
                        sortable: true,
                        sortValue: (r: any) =>
                          num(r.opportunity),
                        render: (r: any) => (
                          <OpportunityCell
                            score={num(r.opportunity)}
                          />
                        ),
                      },
                      {
                        key: 'action',
                        label: 'Recommended action',
                        priority: 'low',
                        render: (r: any) => (
                          <span className="text-xs text-rk-secondary">
                            {r.recommendedAction}
                          </span>
                        ),
                      },
                    ]}
                    rows={qw2.quickWins ?? []}
                    keyOf={(r: any, i: number) =>
                      `${r.keyword}-${i}`
                    }
                    emptyTitle="No quick wins in range"
                    emptyDescription="No GSC queries sit in positions 4–20 with 50+ impressions in this period."
                    pageSize={10}
                  />
                ) : null}
              </Panel>
              {gscQuickWins.length > 0 ? (
                <Panel
                  eyebrow="Quick wins"
                  title="Ranking 4–20 with real impressions"
                  description="Your pages already rank here — strengthening them is the fastest path to traffic."
                >
                  <div className="grid gap-2 md:grid-cols-2">
                    {gscQuickWins.map((r: any) => (
                      <button
                        key={r._query}
                        type="button"
                        onClick={() => void openGscDrawer(r)}
                        className="flex w-full items-center gap-3 rounded-rk-sm border border-rk-border bg-white px-3 py-2 text-left hover:border-rk-ink"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-rk-ink">
                            {r._query}
                          </span>
                          <span className="block text-xs text-rk-secondary">
                            Position{' '}
                            {num(r.position).toFixed(1)} ·{' '}
                            {fmtInt(r.impressions)}{' '}
                            impressions
                          </span>
                        </span>
                        <PriorityChip priority="HIGH" />
                      </button>
                    ))}
                  </div>
                </Panel>
              ) : null}

              <Panel
                eyebrow="Main table"
                title="Keywords"
                description="Open a row for movement, evidence and the recommended next step."
              >
                <DataTable
                  caption="Keywords with measured search performance"
                  columns={[
                    {
                      key: 'keyword',
                      label: 'Keyword',
                      priority: 'high',
                      sortable: true,
                      sortValue: (r: any) => r._query,
                      render: (r: any) => (
                        <span className="font-semibold text-rk-ink">
                          {r._query || '—'}
                        </span>
                      ),
                    },
                    {
                      key: 'intent',
                      label: 'Intent (estimate)',
                      priority: 'medium',
                      render: (r: any) => (
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
                      sortValue: (r: any) =>
                        num(r.position),
                      render: (r: any) => (
                        <span className="rk-number">
                          {num(r.position) > 0
                            ? num(r.position).toFixed(1)
                            : '—'}
                        </span>
                      ),
                    },
                    {
                      key: 'clicks',
                      label: 'Clicks',
                      align: 'right',
                      priority: 'medium',
                      sortable: true,
                      sortValue: (r: any) =>
                        num(r.clicks),
                      render: (r: any) => (
                        <span className="rk-number">
                          {fmtInt(r.clicks)}
                        </span>
                      ),
                    },
                    {
                      key: 'impressions',
                      label: 'Impressions',
                      align: 'right',
                      priority: 'medium',
                      sortable: true,
                      sortValue: (r: any) =>
                        num(r.impressions),
                      render: (r: any) => (
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
                      sortValue: (r: any) => num(r.ctr),
                      render: (r: any) => (
                        <span className="rk-number">
                          {(num(r.ctr) <= 1 &&
                          num(r.ctr) > 0
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
                      render: (r: any) =>
                        r._opp ? (
                          <PriorityChip
                            priority={r._opp.priority}
                          />
                        ) : (
                          <span className="text-xs text-rk-muted">
                            —
                          </span>
                        ),
                    },
                  ]}
                  rows={gscFiltered}
                  keyOf={(r: any, i: number) =>
                    `${r._query}-${i}`
                  }
                  onRowClick={(r) => void openGscDrawer(r)}
                  emptyTitle="No keywords match"
                  emptyDescription="Adjust filters or choose a longer period."
                  pageSize={15}
                />
              </Panel>

              <div className="flex gap-2">
                <SecondaryButton
                  onClick={() => {
                    setGscRefreshing(true);
                    void loadGsc();
                  }}
                  disabled={gscRefreshing || gscLoading}
                >
                  {gscRefreshing
                    ? 'Refreshing…'
                    : 'Refresh GSC data'}
                </SecondaryButton>
                <Link href="/content">
                  <PrimaryButton type="button">
                    Content Engine
                  </PrimaryButton>
                </Link>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* ============ COMPETITORS ============ */}
      {tab === 'competitors' ? (
        <div className="mt-4 space-y-6">
          <Panel
            eyebrow="Provider lookup"
            title="What does any competitor rank for?"
            description="Real ranking keywords for any domain — position, volume, KD, intent and ranking URL. Compared against your site corpus and GSC so provider data and observed data stay labeled."
          >
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                void runProviderLookup();
              }}
            >
              <label
                htmlFor="kw-comp-domain"
                className="sr-only"
              >
                Competitor domain
              </label>
              <input
                id="kw-comp-domain"
                value={providerDomain}
                onChange={(e) =>
                  setProviderDomain(e.target.value)
                }
                placeholder="competitor.com"
                autoComplete="off"
                className="min-h-[44px] flex-1 rounded-rk-sm border border-rk-border bg-white px-3 text-sm text-rk-ink placeholder:text-rk-muted focus:border-rk-ink focus:outline-none"
              />
              <PrimaryButton type="submit">
                {providerGapLoading
                  ? 'Looking up…'
                  : 'Look up'}
              </PrimaryButton>
            </form>
            {providerGapError ? (
              <div className="mt-2">
                <ErrorState
                  title="Competitor data temporarily unavailable"
                  description={providerGapError}
                  onRetry={() => void runProviderLookup()}
                />
              </div>
            ) : null}
            {providerGapLoading ? (
              <div className="mt-2">
                <LoadingBlock title="Fetching competitor ranking keywords…" />
              </div>
            ) : null}
            {providerGap && !providerGapLoading ? (
              <div className="mt-3">
                {providerGap.domainStrength ? (
                  <p className="mb-2 text-xs text-rk-secondary">
                    <span className="font-semibold text-rk-ink">
                      {providerGap.domain}
                    </span>{' '}
                    strength:{' '}
                    {providerGap.domainStrength
                      .domainRank !== null &&
                    providerGap.domainStrength
                      .domainRank !== undefined
                      ? `Domain Rank ${providerGap.domainStrength.domainRank}`
                      : 'Domain Rank —'}
                    {' · '}
                    {providerGap.domainStrength
                      .domainTraffic !== null &&
                    providerGap.domainStrength
                      .domainTraffic !== undefined
                      ? `≈${fmtVolume(providerGap.domainStrength.domainTraffic)} est. monthly visits`
                      : 'traffic unavailable'}{' '}
                    (DataForSEO, domain-level)
                  </p>
                ) : null}
                {(providerGap.missingSerp ?? [])
                  .length > 0 ? (
                  <div className="mb-3 space-y-1.5">
                    {(providerGap.missingSerp ?? [])
                      .slice(0, 5)
                      .map((m: any) => (
                        <div
                          key={m.keyword}
                          className="flex items-start gap-2 rounded-rk-sm border border-rk-border bg-white px-2 py-1.5"
                        >
                          <VerdictChip
                            verdict={m.serpVerdict}
                          />
                          <p className="text-[11px] text-rk-secondary">
                            <span className="font-semibold text-rk-ink">
                              {m.keyword}
                            </span>{' '}
                            — {m.whyItMatters}
                          </p>
                        </div>
                      ))}
                  </div>
                ) : null}
                <div className="grid grid-cols-3 gap-3">
                  <Metric
                    label="Ranking keywords"
                    value={fmtInt(
                      providerGap.summary?.total,
                    )}
                    detail={`for ${providerGap.domain}`}
                  />
                  <Metric
                    label="Missing"
                    value={fmtInt(
                      providerGap.summary?.missing,
                    )}
                    detail="They rank, you don't"
                    tone="warning"
                  />
                  <Metric
                    label="Shared"
                    value={fmtInt(
                      providerGap.summary?.shared,
                    )}
                    detail="Both cover"
                  />
                </div>
                <div className="mt-3">
                  <DataTable
                    caption="Competitor ranking keywords from provider data"
                    columns={[
                      {
                        key: 'keyword',
                        label: 'Keyword',
                        priority: 'high',
                        render: (r: any) => (
                          <span className="font-semibold text-rk-ink">
                            {r.keyword}
                          </span>
                        ),
                      },
                      {
                        key: 'position',
                        label: 'Pos',
                        align: 'right',
                        priority: 'high',
                        sortable: true,
                        sortValue: (r: any) =>
                          r.position ?? 999,
                        render: (r: any) => (
                          <span className="rk-number">
                            {r.position ?? '—'}
                          </span>
                        ),
                      },
                      {
                        key: 'volume',
                        label: 'Volume',
                        align: 'right',
                        priority: 'medium',
                        sortable: true,
                        sortValue: (r: any) =>
                          r.searchVolume ?? -1,
                        render: (r: any) => (
                          <span className="rk-number">
                            {r.searchVolume === null ||
                            r.searchVolume ===
                              undefined
                              ? '—'
                              : fmtVolume(r.searchVolume)}
                          </span>
                        ),
                      },
                      {
                        key: 'kd',
                        label: 'KD',
                        align: 'right',
                        priority: 'low',
                        sortable: true,
                        sortValue: (r: any) =>
                          r.keywordDifficulty ?? 999,
                        render: (r: any) => (
                          <span className="rk-number">
                            {r.keywordDifficulty ??
                              '—'}
                          </span>
                        ),
                      },
                      {
                        key: 'url',
                        label: 'Ranking URL',
                        priority: 'low',
                        render: (r: any) => (
                          <span
                            className="block max-w-[220px] truncate text-xs text-rk-secondary"
                            title={r.rankingUrl ?? ''}
                          >
                            {r.rankingUrl
                              ? r.rankingUrl.replace(
                                  /^https?:\/\//,
                                  '',
                                )
                              : '—'}
                          </span>
                        ),
                      },
                    ]}
                    rows={
                      (gapFilter === 'shared'
                        ? providerGap.sharedKeywords
                        : providerGap.missingKeywords) ??
                      []
                    }
                    keyOf={(r: any, i: number) =>
                      `${r.keyword}-${i}`
                    }
                    emptyTitle="No keywords in this view"
                    emptyDescription="Missing shows keywords they rank for and you don't; Shared shows overlap."
                    pageSize={15}
                  />
                </div>
              </div>
            ) : null}
          </Panel>
          <Panel
            eyebrow="Keyword gap"
            title="You vs competitors"
            description="Missing, shared and unique topics from real crawl evidence — both sites need a completed crawl."
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="flex min-h-[44px] flex-1 items-center gap-2 text-xs text-rk-secondary">
                Competitor
                <select
                  value={competitorId}
                  onChange={(e) => {
                    setCompetitorId(e.target.value);
                    void loadGap(e.target.value);
                  }}
                  className="min-h-[36px] flex-1 rounded-rk-sm border border-rk-border bg-white px-2 text-xs text-rk-ink"
                >
                  <option value="">
                    Select a competitor…
                  </option>
                  {websiteCompetitors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.domain})
                    </option>
                  ))}
                </select>
              </label>
              <div
                className="flex gap-1.5"
                role="tablist"
                aria-label="Gap view"
              >
                {(
                  [
                    ['missing', 'Missing'],
                    ['shared', 'Shared'],
                    ['all', 'All'],
                  ] as const
                ).map(([v, l]) => (
                  <button
                    key={v}
                    role="tab"
                    aria-selected={gapFilter === v}
                    type="button"
                    onClick={() => setGapFilter(v)}
                    className={`min-h-[44px] rounded-rk-sm border px-3 text-xs font-semibold ${
                      gapFilter === v
                        ? 'border-rk-ink bg-rk-ink text-white'
                        : 'border-rk-border bg-white text-rk-secondary'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </Panel>

          {gapLoading ? (
            <LoadingBlock title="Comparing keyword coverage…" />
          ) : gapError ? (
            <ErrorState
              title="Gap analysis unavailable"
              description={gapError}
              onRetry={() => void loadGap(competitorId)}
            />
          ) : !gap ? (
            <EmptyState
              title="Pick a competitor to reveal the gap"
              description="RENKOO compares real on-page topics — keywords they cover that you don't, and where you lead."
            />
          ) : (
            <>
              <section aria-label="Gap summary">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Metric
                    label="Missing keywords"
                    value={fmtInt(
                      gap.summary?.missingKeywords,
                    )}
                    detail="They cover, you don't"
                    tone="warning"
                  />
                  <Metric
                    label="Shared keywords"
                    value={fmtInt(
                      gap.summary?.sharedKeywords,
                    )}
                    detail="Both cover"
                  />
                  <Metric
                    label="Your unique"
                    value={fmtInt(
                      gap.summary?.renkooOnlyKeywords,
                    )}
                    detail="Only you cover"
                    tone="positive"
                  />
                  <Metric
                    label="High priority"
                    value={fmtInt(
                      gap.summary?.highPriority,
                    )}
                    detail="Top gaps"
                    tone={
                      num(gap.summary?.highPriority) > 0
                        ? 'positive'
                        : 'neutral'
                    }
                  />
                </div>
              </section>
              <Panel
                eyebrow={
                  gapFilter === 'shared'
                    ? 'Shared topics'
                    : 'Opportunities'
                }
                title={
                  gapFilter === 'shared'
                    ? 'Where you stand head-to-head'
                    : 'Keywords they rank for and you don’t'
                }
                description="Evidence comes from completed crawls — relevance scores measure on-page coverage, not search volume."
              >
                <DataTable
                  caption="Keyword gap results"
                  columns={
                    gapFilter === 'shared'
                      ? ([
                          {
                            key: 'keyword',
                            label: 'Keyword',
                            priority: 'high',
                            render: (r: any) => (
                              <span className="font-semibold text-rk-ink">
                                {r.keyword}
                              </span>
                            ),
                          },
                          {
                            key: 'winner',
                            label: 'Leader',
                            priority: 'medium',
                            render: (r: any) => (
                              <span className="text-xs font-semibold text-rk-secondary">
                                {r.winner}
                              </span>
                            ),
                          },
                          {
                            key: 'you',
                            label: 'Your relevance',
                            align: 'right',
                            priority: 'medium',
                            sortable: true,
                            sortValue: (r: any) =>
                              num(
                                r.renkooRelevanceScore,
                              ),
                            render: (r: any) => (
                              <span className="rk-number">
                                {num(
                                  r.renkooRelevanceScore,
                                )}
                              </span>
                            ),
                          },
                          {
                            key: 'them',
                            label: 'Their relevance',
                            align: 'right',
                            priority: 'medium',
                            sortable: true,
                            sortValue: (r: any) =>
                              num(
                                r.competitorRelevanceScore,
                              ),
                            render: (r: any) => (
                              <span className="rk-number">
                                {num(
                                  r.competitorRelevanceScore,
                                )}
                              </span>
                            ),
                          },
                        ] as DataTableColumn<any>[])
                      : ([
                          {
                            key: 'keyword',
                            label: 'Keyword',
                            priority: 'high',
                            render: (r: any) => (
                              <span className="font-semibold text-rk-ink">
                                {r.keyword}
                              </span>
                            ),
                          },
                          {
                            key: 'intent',
                            label: 'Intent',
                            priority: 'medium',
                            render: (r: any) => (
                              <IntentChip
                                intent={r.intent}
                              />
                            ),
                          },
                          {
                            key: 'score',
                            label: 'Opportunity',
                            priority: 'high',
                            sortable: true,
                            sortValue: (r: any) =>
                              num(r.opportunityScore),
                            render: (r: any) => (
                              <OpportunityCell
                                score={num(
                                  r.opportunityScore,
                                )}
                              />
                            ),
                          },
                          {
                            key: 'action',
                            label: 'Suggested action',
                            priority: 'low',
                            render: (r: any) => (
                              <span className="text-xs text-rk-secondary">
                                {r.suggestedAction ??
                                  '—'}
                              </span>
                            ),
                          },
                        ] as DataTableColumn<any>[])
                  }
                  rows={
                    gapFilter === 'shared'
                      ? (gap.sharedKeywords ?? [])
                      : gapFilter === 'all'
                        ? [
                            ...(gap.missingKeywords ??
                              []),
                            ...(gap.renkooOnlyKeywords ??
                              []),
                          ]
                        : (gap.missingKeywords ?? [])
                  }
                  keyOf={(r: any, i: number) =>
                    `${r.keyword}-${i}`
                  }
                  emptyTitle="No keywords in this view"
                  emptyDescription="Try another view or crawl the competitor first."
                  pageSize={15}
                />
              </Panel>
            </>
          )}
        </div>
      ) : null}

      {/* ============ KEYWORD OVERVIEW DRAWER (Discover) ============ */}
      <Drawer
        open={drawerIdea !== null}
        onClose={() => setDrawerIdea(null)}
        eyebrow="Keyword overview"
        title={drawerIdea?.keyword ?? 'Keyword'}
        description="Evidence, opportunity reasoning and the target decision — with unavailable metrics labeled, never zeroed."
      >
        {drawerIdea ? (
          <>
            <DrawerMeta
              items={[
                {
                  label: 'Intent',
                  value: `${intentLabel(drawerIdea.intent)}${drawerIdea.intentSource === 'PROVIDER' ? ' (provider)' : ' (RENKOO)'}`,
                },
                {
                  label: 'Opportunity',
                  value: `${drawerIdea.opportunityScore}/100`,
                },
                {
                  label: 'Decision',
                  value: decisionLabel(
                    drawerIdea.targetDecision,
                  ),
                },
                {
                  label: 'Volume',
                  value:
                    drawerIdea.volume === null ||
                    drawerIdea.volume === undefined
                      ? 'Not available (no provider)'
                      : `${fmtVolume(drawerIdea.volume)}/mo · ${drawerIdea.dataSource ?? ''} · ${result?.country ?? ''} · ${fmtDate(drawerIdea.metricUpdatedAt)}`,
                },
                {
                  label: 'KD',
                  value:
                    drawerIdea.keywordDifficulty ===
                      null ||
                    drawerIdea.keywordDifficulty ===
                      undefined
                      ? 'Not available (no provider)'
                      : `${drawerIdea.keywordDifficulty} (${drawerIdea.kdLabel ?? ''})`,
                },
                {
                  label: 'CPC',
                  value:
                    drawerIdea.cpc === null ||
                    drawerIdea.cpc === undefined
                      ? '—'
                      : `$${Number(drawerIdea.cpc).toFixed(2)}${drawerIdea.competitionLevel ? ` · Ads ${drawerIdea.competitionLevel.toLowerCase()}` : ''}`,
                },
                {
                  label: 'Parent topic',
                  value: `${drawerIdea.parentTopic} (RENKOO Topic Cluster)`,
                },
                ...(drawerIdea.gscPosition !== null &&
                drawerIdea.gscPosition !== undefined
                  ? [
                      {
                        label: 'Your ranking',
                        value: `#${Number(drawerIdea.gscPosition).toFixed(1)} · ${fmtInt(drawerIdea.gscImpressions)} impr. · ${fmtInt(drawerIdea.gscClicks)} clicks`,
                      },
                    ]
                  : []),
              ]}
            />
            {(() => {
              const meta = drawerIdea
                ? serpMetaMap[drawerIdea.keyword]
                : undefined;
              const scoring = meta?.scoring;
              if (!scoring?.pageDecision) {
                return (
                  <DrawerSection title="RENKOO recommendation">
                    <p className="rk-body">
                      <span className="font-semibold">
                        {decisionLabel(
                          drawerIdea.targetDecision,
                        )}
                      </span>{' '}
                      — {drawerIdea.decisionReason}
                    </p>
                    {providerReady ? (
                      <p className="rk-body mt-1 text-rk-muted">
                        Load the SERP below for the
                        evidence-backed page decision
                        (new vs existing page) and the
                        Opportunity 3.0 adjustment.
                      </p>
                    ) : null}
                  </DrawerSection>
                );
              }
              const pd = scoring.pageDecision;
              return (
                <DrawerSection title="RENKOO recommendation">
                  <InsightBlock
                    eyebrow={
                      scoring.adjustedOpportunity !==
                        null &&
                      scoring.baseOpportunity !==
                        null &&
                      scoring.adjustedOpportunity !==
                        scoring.baseOpportunity
                        ? `Opportunity ${scoring.baseOpportunity} → ${scoring.adjustedOpportunity} (SERP-adjusted)`
                        : `Opportunity ${drawerIdea.opportunityScore}/100`
                    }
                    title={pageActionLabel(pd.action)}
                  >
                    <p className="rk-body mt-1">
                      {pd.reason}
                    </p>
                    {scoring.serpReasons.length >
                    0 ? (
                      <ul className="mt-1 list-disc space-y-1 pl-4">
                        {scoring.serpReasons.map(
                          (r, i) => (
                            <li
                              key={i}
                              className="rk-body"
                            >
                              {r}
                            </li>
                          ),
                        )}
                      </ul>
                    ) : null}
                  </InsightBlock>
                  {pd.cannibalization?.detected ? (
                    <p
                      className="rk-body mt-2 font-semibold text-rk-warning"
                      role="note"
                    >
                      {pd.cannibalization.confidence ===
                      'strong'
                        ? 'Cannibalization likely: '
                        : 'Potential cannibalization: '}
                      {pd.cannibalization.recommendation}
                    </p>
                  ) : null}
                </DrawerSection>
              );
            })()}
            {(drawerIdea.monthlySearches ?? []).length >
            0 ? (
              <DrawerSection title="12-month trend">
                <div className="flex items-center gap-3">
                  <TrendSpark
                    points={drawerIdea.monthlySearches}
                  />
                  <div>
                    <p className="text-sm font-semibold text-rk-ink">
                      {trendLabel(drawerIdea.trend)}
                    </p>
                    {drawerIdea.trendDetail ? (
                      <p className="rk-body text-rk-muted">
                        {drawerIdea.trendDetail}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div
                  className="mt-2 flex h-16 items-end gap-[3px]"
                  role="img"
                  aria-label="Monthly search volume bars"
                >
                  {(drawerIdea.monthlySearches ?? [])
                    .slice(-12)
                    .map((p, i) => {
                      const max = Math.max(
                        ...(drawerIdea.monthlySearches ?? []).map(
                          (x) => Number(x.searchVolume) || 0,
                        ),
                        1,
                      );
                      return (
                        <div
                          key={i}
                          className="flex-1 rounded-sm bg-rk-info/40"
                          style={{
                            height: `${Math.max(6, ((Number(p.searchVolume) || 0) / max) * 100)}%`,
                          }}
                          title={`${p.year}-${String(p.month).padStart(2, '0')}: ${p.searchVolume ?? '—'}`}
                        />
                      );
                    })}
                </div>
              </DrawerSection>
            ) : null}
            <DrawerSection title="Why this is an opportunity">
              <InsightBlock
                eyebrow="RENKOO opportunity score"
                title={`${drawerIdea.opportunityScore}/100 — ${decisionLabel(drawerIdea.targetDecision)}`}
              >
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {drawerIdea.opportunityReasons.map(
                    (reason, i) => (
                      <li key={i} className="rk-body">
                        {reason}
                      </li>
                    ),
                  )}
                </ul>
                <p className="rk-body mt-2 text-rk-muted">
                  Score uses site coverage, competitor
                  coverage, intent value and
                  specificity
                  {providerReady
                    ? ', plus real provider signals: volume, KD manageability, CPC value, trend and your GSC foothold. Loading the SERP adds the 3.0 adjustment (authority weakness, intent match, winnable formats).'
                    : ' only. Volume, KD, CPC, trend and SERP signals join the score once a provider connects.'}{' '}
                  Traffic Potential is excluded until
                  per-keyword clickstream data exists.
                </p>
              </InsightBlock>
            </DrawerSection>
            <DrawerSection title="Search demand evidence">
              <p className="rk-body">
                {drawerIdea.sitePages > 0
                  ? `Your site covers this on ${drawerIdea.sitePages} page(s). `
                  : 'Your site has no measured coverage of this topic. '}
                {drawerIdea.competitorCount > 0
                  ? `${drawerIdea.competitorCount} competitor(s) cover it across ${drawerIdea.competitorPages} page(s).`
                  : 'No tracked competitor covers it.'}
              </p>
              <p className="rk-body mt-1 text-rk-muted">
                Sources:{' '}
                {drawerIdea.sources
                  .map(sourceLabel)
                  .join(' · ')}
                {' · '}Types:{' '}
                {drawerIdea.categories
                  .map(categoryLabel)
                  .join(', ')}
              </p>
              {drawerIdea.cannibalizationFlag ? (
                <p className="rk-body mt-1 font-semibold text-rk-warning">
                  Multiple existing pages touch this
                  topic — consolidate or differentiate
                  intent before creating a new page.
                </p>
              ) : null}
            </DrawerSection>
            <DrawerSection title="SERP overview">
              {(() => {
                const serp = drawerIdea
                  ? serpMap[drawerIdea.keyword]
                  : undefined;
                if (serp) {
                  return (
                    <div className="space-y-2">
                      {serp.features.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {serp.features.map((f) => (
                            <span
                              key={f.type}
                              className="rounded-rk-sm border border-rk-border bg-rk-soft px-1.5 py-0.5 text-[11px] text-rk-secondary"
                            >
                              {serpFeatureLabel(f.type)}
                              {f.count > 1
                                ? ` ×${f.count}`
                                : ''}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="rk-body text-rk-muted">
                          No special SERP features — 10
                          classic organic results.
                        </p>
                      )}
                      <p className="text-[11px] text-rk-muted">
                        Source: {serp.dataSource} ·{' '}
                        {serp.country} · Fetched{' '}
                        {fmtDate(serp.fetchedAt)}
                        {(() => {
                          const meta = drawerIdea
                            ? serpMetaMap[
                                drawerIdea.keyword
                              ]
                            : undefined;
                          if (
                            meta?.previousFetchedAt
                          ) {
                            return ` (previously ${fmtDate(meta.previousFetchedAt)})`;
                          }
                          return meta?.cached
                            ? ' (cached)'
                            : '';
                        })()}{' '}
                        ·{' '}
                        {serp.totalResults !== null &&
                        serp.totalResults !== undefined
                          ? `${fmtInt(serp.totalResults)} results`
                          : 'result count unavailable'}
                        . Backlinks and referring domains
                        are returned only where the
                        provider reports them — otherwise
                        —, never 0.
                      </p>
                      <ol className="space-y-1.5">
                        {serp.results.map((r) => {
                          const rowKey = `${r.position}-${r.url}`;
                          const open =
                            expandedSerp === rowKey;
                          return (
                            <li
                              key={rowKey}
                              className="rounded-rk-sm border border-rk-border px-2 py-1.5"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedSerp(
                                    open ? null : rowKey,
                                  )
                                }
                                aria-expanded={open}
                                className="flex w-full items-center gap-2 text-left"
                              >
                                <span className="rk-number w-5 shrink-0 text-xs text-rk-muted">
                                  {r.position ?? '—'}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs font-semibold text-rk-ink">
                                    {r.title || r.domain}
                                  </span>
                                  <span className="block truncate text-[11px] text-rk-muted">
                                    {r.domain}
                                    {r.contentType &&
                                    r.contentType !==
                                      'Other'
                                      ? ` · ${r.contentType}`
                                      : ''}
                                  </span>
                                </span>
                                <StrengthBadge
                                  strength={
                                    r.pageStrength
                                  }
                                />
                              </button>
                              {open ? (
                                <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-rk-border pt-1.5 text-[11px]">
                                  <div className="flex justify-between gap-2">
                                    <dt className="text-rk-muted">
                                      Domain Rank
                                    </dt>
                                    <dd className="rk-number font-semibold">
                                      {r.domainRank ??
                                        '—'}
                                    </dd>
                                  </div>
                                  <div className="flex justify-between gap-2">
                                    <dt className="text-rk-muted">
                                      Page Rank
                                    </dt>
                                    <dd className="rk-number font-semibold">
                                      {r.pageRank ??
                                        '—'}
                                    </dd>
                                  </div>
                                  <div className="flex justify-between gap-2">
                                    <dt className="text-rk-muted">
                                      Backlinks
                                    </dt>
                                    <dd className="rk-number font-semibold">
                                      {r.backlinks !==
                                        null &&
                                      r.backlinks !==
                                        undefined
                                        ? fmtInt(
                                            r.backlinks,
                                          )
                                        : '—'}
                                    </dd>
                                  </div>
                                  <div className="flex justify-between gap-2">
                                    <dt className="text-rk-muted">
                                      Ref. domains
                                    </dt>
                                    <dd className="rk-number font-semibold">
                                      {r.referringDomains !==
                                        null &&
                                      r.referringDomains !==
                                        undefined
                                        ? fmtInt(
                                            r.referringDomains,
                                          )
                                        : '—'}
                                    </dd>
                                  </div>
                                  <div className="col-span-2 break-all">
                                    <dt className="text-rk-muted">
                                      URL
                                    </dt>
                                    <dd className="text-rk-secondary">
                                      {r.url}
                                    </dd>
                                  </div>
                                  {r.snippet ? (
                                    <div className="col-span-2">
                                      <dt className="text-rk-muted">
                                        Snippet
                                      </dt>
                                      <dd className="text-rk-secondary">
                                        {r.snippet}
                                      </dd>
                                    </div>
                                  ) : null}
                                  {r.strengthEvidence &&
                                  r.strengthEvidence
                                    .length > 0 ? (
                                    <div className="col-span-2">
                                      <dt className="text-rk-muted">
                                        Strength evidence
                                        (RENKOO
                                        classification)
                                      </dt>
                                      <dd className="text-rk-secondary">
                                        {r.strengthEvidence.join(
                                          ' · ',
                                        )}
                                      </dd>
                                    </div>
                                  ) : null}
                                </dl>
                              ) : null}
                            </li>
                          );
                        })}
                      </ol>
                      {serp.competition ? (
                        <div className="rounded-rk-sm border border-rk-border bg-rk-soft px-2 py-1.5">
                          <p className="flex items-center gap-2 text-xs font-semibold text-rk-ink">
                            SERP competition{' '}
                            <VerdictChip
                              verdict={
                                serp.competition
                                  .verdict
                              }
                            />
                          </p>
                          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-rk-secondary">
                            {serp.competition.evidence.map(
                              (e, i) => (
                                <li key={i}>{e}</li>
                              ),
                            )}
                          </ul>
                        </div>
                      ) : null}
                      {serp.intentCheck ? (
                        <p className="text-[11px] text-rk-secondary">
                          <span className="font-semibold text-rk-ink">
                            Intent{' '}
                            {serp.intentCheck.check ===
                            'MATCH'
                              ? 'match ✓'
                              : serp.intentCheck
                                    .check ===
                                  'MISMATCH'
                                ? 'mismatch'
                                : serp.intentCheck.check ===
                                    'MIXED'
                                  ? 'mixed'
                                  : 'unknown'}
                          </span>{' '}
                          — {serp.intentCheck.detail} (
                          {serp.intentCheck
                            .intentSource === 'PROVIDER'
                            ? 'provider'
                            : 'RENKOO'}
                          -classified keyword intent vs
                          observed ranking pages)
                        </p>
                      ) : null}
                      {(serp.featureOpportunities ??
                        []).length > 0 ? (
                        <div>
                          <p className="text-[11px] font-semibold text-rk-ink">
                            SERP feature opportunities
                          </p>
                          <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[11px] text-rk-secondary">
                            {(
                              serp.featureOpportunities ??
                              []
                            ).map((f) => (
                              <li key={f.type}>
                                <span className="font-semibold">
                                  {serpFeatureLabel(
                                    f.type,
                                  )}
                                </span>{' '}
                                — {f.opportunity}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {serp.aiPresence ? (
                        <p className="text-[11px] text-rk-secondary">
                          <span className="font-semibold text-rk-ink">
                            AI search presence:{' '}
                            {serp.aiPresence
                              .detected
                              ? 'AI Overview detected'
                              : 'none detected'}
                          </span>{' '}
                          — {serp.aiPresence.detail}
                          {serp.aiPresence
                            .referencedDomains.length >
                          0 ? (
                            <span>
                              {' '}
                              Likely-cited domains:{' '}
                              {serp.aiPresence.referencedDomains
                                .slice(0, 5)
                                .join(', ')}
                              .
                            </span>
                          ) : null}
                        </p>
                      ) : null}
                    </div>
                  );
                }
                return providerReady ? (
                  <div>
                    <p className="rk-body text-rk-muted">
                      Live SERP is available on demand
                      (cached 3 days; fresh lookups pass
                      through usage controls and never
                      charge on failure).
                    </p>
                    {serpError ? (
                      <p
                        className="rk-body mt-1 text-rk-danger"
                        role="alert"
                      >
                        {serpError}{' '}
                        <button
                          type="button"
                          className="font-semibold underline"
                          onClick={() =>
                            drawerIdea &&
                            void loadSerp(drawerIdea)
                          }
                        >
                          Retry
                        </button>
                      </p>
                    ) : null}
                    <div className="mt-2">
                      <SecondaryButton
                        type="button"
                        onClick={() =>
                          drawerIdea &&
                          void loadSerp(drawerIdea)
                        }
                        disabled={
                          !!serpLoading ||
                          !drawerIdea
                        }
                      >
                        {serpLoading
                          ? 'Loading SERP…'
                          : 'Load SERP'}
                      </SecondaryButton>
                    </div>
                  </div>
                ) : (
                  <p className="rk-body text-rk-muted">
                    No SERP provider is connected — top
                    results, SERP features and
                    SERP-based difficulty are
                    unavailable. Validate difficulty
                    manually against the live results
                    page before committing.
                  </p>
                );
              })()}
            </DrawerSection>
            <DrawerSection title="Content strategy">
              {(() => {
                const meta = drawerIdea
                  ? serpMetaMap[drawerIdea.keyword]
                  : undefined;
                const pd =
                  meta?.scoring?.pageDecision;
                if (!pd) return null;
                return (
                  <div className="mb-2 rounded-rk-sm border border-rk-border bg-rk-soft px-2 py-1.5">
                    <p className="text-xs font-semibold text-rk-ink">
                      {pageActionLabel(pd.action)}
                    </p>
                    <p className="rk-body mt-0.5">
                      {pd.reason}
                    </p>
                    {pd.primaryUrl ? (
                      <p className="mt-0.5 break-all text-[11px] text-rk-secondary">
                        Primary: {pd.primaryUrl}
                      </p>
                    ) : null}
                    {pd.competingUrls.length >
                    1 ? (
                      <p className="mt-0.5 text-[11px] text-rk-secondary">
                        Competing URLs:{' '}
                        {pd.competingUrls
                          .map(
                            (u) =>
                              u.page ?? u.url ?? '',
                          )
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    ) : null}
                  </div>
                );
              })()}
              <p className="rk-body">
                Recommended page type:{' '}
                <span className="font-semibold">
                  {
                    (
                      result?.clusters ?? []
                    ).find((c) =>
                      [
                        c.primaryKeyword,
                        ...c.supportingKeywords,
                      ].includes(drawerIdea.keyword),
                    )?.recommendedPageType ??
                    'Educational guide / blog post'
                  }
                </span>
              </p>
              <p className="rk-body mt-1">
                Suggested H1:{' '}
                <span className="font-semibold">
                  {titleCase(drawerIdea.keyword)}
                </span>
              </p>
              <p className="rk-body mt-1 text-rk-muted">
                Starting template — refine into an
                evidence brief in the Content Engine,
                which adds GSC, Business Brain and
                competitor evidence automatically.
              </p>
              {(() => {
                const cluster = (
                  result?.clusters ?? []
                ).find((c) =>
                  [
                    c.primaryKeyword,
                    ...c.supportingKeywords,
                  ].includes(drawerIdea.keyword),
                );
                const serpCluster = (
                  serpClusters ?? []
                ).find((c) =>
                  [
                    c.primaryKeyword,
                    ...c.supportingKeywords,
                  ].includes(drawerIdea.keyword),
                );
                if (!cluster && !serpCluster)
                  return null;
                const related = [
                  ...new Set(
                    [
                      ...(cluster
                        ? [
                            cluster.primaryKeyword,
                            ...cluster.supportingKeywords,
                          ]
                        : []),
                      ...(serpCluster
                        ? [
                            serpCluster.primaryKeyword,
                            ...serpCluster.supportingKeywords,
                          ]
                        : []),
                    ].filter(
                      (k) => k !== drawerIdea.keyword,
                    ),
                  ),
                ].slice(0, 8);
                if (related.length === 0)
                  return null;
                return (
                  <div className="mt-2">
                    <p className="text-[11px] font-semibold text-rk-ink">
                      Related keywords
                      {serpCluster
                        ? ` (same SERP — one page, similarity ${serpCluster.serpSimilarity ?? '—'})`
                        : ' (same topic — verify SERP before merging pages)'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-rk-secondary">
                      {related.join(' · ')}
                    </p>
                  </div>
                );
              })()}
            </DrawerSection>
            <DrawerSection title="Next action">
              <p className="rk-body font-semibold">
                {drawerIdea.decisionReason}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <PrimaryButton
                  type="button"
                  onClick={() =>
                    void handleBrief(drawerIdea)
                  }
                >
                  Create Content Brief
                </PrimaryButton>
                <SecondaryButton
                  type="button"
                  onClick={() =>
                    void handleTrack(drawerIdea)
                  }
                >
                  Track Keyword
                </SecondaryButton>
                <SecondaryButton
                  type="button"
                  onClick={() => {
                    setListDialogIdea(drawerIdea);
                  }}
                >
                  Save to List
                </SecondaryButton>
              </div>
              <div className="mt-2">
                <NextAction
                  label="Open in Content Engine"
                  detail="Briefs, drafts and refresh queue."
                  href="/content"
                />
              </div>
            </DrawerSection>
          </>
        ) : null}
      </Drawer>

      {/* ============ SAVE-TO-LIST DIALOG ============ */}
      {listDialogIdea ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Save keyword to list"
          onClick={() => setListDialogIdea(null)}
        >
          <div
            className="w-full max-w-md rounded-rk-md bg-white p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-bold text-rk-ink">
              Save “{listDialogIdea.keyword}”
            </p>
            {lists.length > 0 ? (
              <div className="mt-2 space-y-1.5">
                {lists.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() =>
                      addToList(
                        l.id,
                        l.name,
                        (selectedKeys.length > 0
                          ? selectedKeys
                          : [listDialogIdea.keyword]
                        ).filter(Boolean),
                      )
                    }
                    className="flex min-h-[44px] w-full items-center justify-between rounded-rk-sm border border-rk-border px-3 text-sm hover:border-rk-ink"
                  >
                    <span className="font-semibold text-rk-ink">
                      {l.name}
                    </span>
                    <span className="text-xs text-rk-secondary">
                      {l.keywords.length} saved
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addToList(
                  null,
                  newListName,
                  (selectedKeys.length > 0
                    ? selectedKeys
                    : [listDialogIdea.keyword]
                  ).filter(Boolean),
                );
              }}
            >
              <input
                value={newListName}
                onChange={(e) =>
                  setNewListName(e.target.value)
                }
                placeholder="New list name…"
                aria-label="New list name"
                className="min-h-[44px] flex-1 rounded-rk-sm border border-rk-border px-3 text-sm"
              />
              <PrimaryButton type="submit">
                Save
              </PrimaryButton>
            </form>
            <div className="mt-2 text-right">
              <GhostButton
                type="button"
                onClick={() => setListDialogIdea(null)}
              >
                Cancel
              </GhostButton>
            </div>
          </div>
        </div>
      ) : null}

      {/* ============ STRATEGY DETAIL DRAWER ============ */}
      <Drawer
        open={strategyDrawer !== null}
        onClose={() => setStrategyDrawer(null)}
        eyebrow="Strategy detail"
        title={strategyDrawer?.keyword ?? 'Keyword'}
        description="Priority, evidence and the recommended action — every number labeled by source."
      >
        {strategyDrawer ? (
          <>
            <DrawerMeta
              items={[
                {
                  label: 'Intent',
                  value: `${intentLabel(strategyDrawer.intent)}${strategyDrawer.intentSource === 'PROVIDER' ? ' (provider)' : ' (RENKOO)'}`,
                },
                {
                  label: 'Priority',
                  value: `${strategyDrawer.priority} (${strategyDrawer.priorityScore}/100)`,
                },
                {
                  label: 'Opportunity',
                  value: `${strategyDrawer.opportunityScore}/100`,
                },
                {
                  label: 'Bucket',
                  value: bucketLabel(
                    strategyDrawer.bucket,
                  ),
                },
              ]}
            />
            <p className="mt-3 text-xs leading-5 text-rk-muted">
              Priority is the RENKOO Strategy score used
              to rank actions; Opportunity is the
              underlying keyword opportunity score from
              research.
            </p>
            <DrawerSection title="Why this matters">
              <ul className="list-disc space-y-1 pl-4">
                {strategyDrawer.priorityReasons.map(
                  (r, i) => (
                    <li key={i} className="rk-body">
                      {r}
                    </li>
                  ),
                )}
              </ul>
            </DrawerSection>
            <DrawerSection title="Current state">
              <DrawerMeta
                items={[
                  {
                    label: 'Ranking',
                    value:
                      strategyDrawer.position !== null
                        ? `#${strategyDrawer.position.toFixed(1)}`
                        : 'Not ranking',
                  },
                  {
                    label: 'Clicks',
                    value:
                      strategyDrawer.clicks !== null
                        ? fmtInt(strategyDrawer.clicks)
                        : strategy &&
                            !strategy.dataAvailability
                              .gscConnected
                          ? 'Not connected — connect Search Console.'
                          : 'No observed data',
                  },
                  {
                    label: 'Impressions',
                    value:
                      strategyDrawer.impressions !==
                      null
                        ? fmtInt(
                            strategyDrawer.impressions,
                          )
                        : strategy &&
                            !strategy.dataAvailability
                              .gscConnected
                          ? 'Not connected — connect Search Console.'
                          : 'No observed data',
                  },
                  {
                    label: 'CTR',
                    value:
                      strategyDrawer.ctr !== null
                        ? `${(strategyDrawer.ctr * 100).toFixed(1)}%`
                        : strategy &&
                            !strategy.dataAvailability
                              .gscConnected
                          ? 'Not connected — connect Search Console.'
                          : 'No observed data',
                  },
                  {
                    label: 'Target page',
                    value: strategyDrawer.targetPage ? (
                      <span
                        className="break-all"
                        title={
                          strategyDrawer.targetPage
                        }
                      >
                        {strategyDrawer.targetPage}
                      </span>
                    ) : (
                      'None yet'
                    ),
                  },
                  {
                    label: 'Volume',
                    value:
                      strategyDrawer.volume !== null
                        ? `${fmtVolume(strategyDrawer.volume)}/mo (provider)`
                        : 'Not available yet — connect a supported provider.',
                  },
                  {
                    label: 'KD',
                    value:
                      strategyDrawer.keywordDifficulty !==
                      null
                        ? `${strategyDrawer.keywordDifficulty} (provider)`
                        : 'Not available yet — connect a supported provider.',
                  },
                ]}
              />
            </DrawerSection>
            {strategyDrawer.serpVerdict ? (
              <DrawerSection title="SERP / competition">
                <p className="rk-body">
                  SERP verdict:{' '}
                  <span className="font-semibold">
                    {strategyDrawer.serpVerdict.toLowerCase()}
                  </span>
                  {strategyDrawer.serpWeakCount !==
                  null
                    ? ` (${strategyDrawer.serpWeakCount} weak results, provider data)`
                    : ''}
                  . Load the full SERP from Discover for
                  per-result strength.
                </p>
              </DrawerSection>
            ) : null}
            <DrawerSection title="Recommended action">
              <p className="rk-body">
                <span className="font-semibold">
                  {pageMappingLabel(
                    strategyDrawer.pageMapping,
                  )}
                </span>{' '}
                — {strategyDrawer.mappingReason}
              </p>
              {strategyDrawer.quickWin ? (
                <div className="mt-2 rounded-rk-sm border border-rk-border bg-rk-soft px-3 py-2">
                  <p className="text-xs font-semibold text-rk-ink">
                    Quick win · effort{' '}
                    {strategyDrawer.quickWin.effort.toLowerCase()}
                  </p>
                  <p className="rk-body mt-1">
                    {strategyDrawer.quickWin.action}
                  </p>
                  <p className="rk-body mt-1 text-rk-muted">
                    {strategyDrawer.quickWin.expectedImpact}
                  </p>
                </div>
              ) : null}
              {linkRecsLoading ? (
                <p className="rk-metadata mt-2">
                  Checking internal-link opportunities…
                </p>
              ) : linkRecs.length > 0 ? (
                <div className="mt-2 rounded-rk-sm border border-rk-border bg-white px-3 py-2">
                  <p className="text-xs font-semibold text-rk-ink">
                    Internal link{' '}
                    {linkRecs.length === 1
                      ? 'opportunity'
                      : 'opportunities'}{' '}
                    · anchors suggested (INFERENCE — never
                    observed)
                  </p>
                  <ul className="mt-1 space-y-2">
                    {linkRecs.map((rec) => (
                      <li
                        key={`${rec.sourceUrl}|${rec.targetUrl}`}
                        className="text-xs leading-5 text-rk-secondary"
                      >
                        <span className="block break-all">
                          <span className="font-semibold text-rk-ink">
                            From:
                          </span>{' '}
                          {rec.sourceUrl}
                        </span>
                        <span className="block break-all">
                          <span className="font-semibold text-rk-ink">
                            To:
                          </span>{' '}
                          {rec.targetUrl}
                        </span>
                        <span className="block">
                          <span className="font-semibold text-rk-ink">
                            Suggested anchor:
                          </span>{' '}
                          “{rec.suggestedAnchor}”
                        </span>
                        <span className="block text-rk-muted">
                          {rec.reason}
                        </span>
                        {rec.verification ? (
                          <span className="mt-1 block rounded-rk-sm border border-rk-border bg-rk-soft px-2 py-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <ToneChip
                                label={
                                  rec.verification
                                    .status ===
                                  'VERIFIED'
                                    ? 'Verified'
                                    : rec.verification
                                          .status ===
                                        'NOT_VERIFIED'
                                      ? 'Not verified'
                                      : rec.verification
                                            .status ===
                                          'BROKEN'
                                        ? 'Broken'
                                        : 'Unavailable'
                                }
                                tone={
                                  rec.verification
                                    .status ===
                                  'VERIFIED'
                                    ? 'positive'
                                    : rec.verification
                                          .status ===
                                        'NOT_VERIFIED'
                                      ? 'warning'
                                      : rec.verification
                                            .status ===
                                          'BROKEN'
                                        ? 'negative'
                                        : 'neutral'
                                }
                              />
                              <span className="text-rk-muted">
                                {rec.verification
                                  .crawlCompletedAt
                                  ? `Latest completed crawl ${fmtDate(rec.verification.crawlCompletedAt)}`
                                  : 'No completed crawl'}
                              </span>
                            </span>
                            <span className="mt-0.5 block text-rk-muted">
                              {rec.verification.reason}
                            </span>
                            {rec.verification.anchorMatch ===
                            'DIFFERENT' ? (
                              <span className="mt-0.5 block">
                                Link verified — anchor
                                differs. Suggested: “
                                {rec.suggestedAnchor}”
                                · Observed:{' '}
                                {rec.verification.observedAnchors
                                  .slice(0, 3)
                                  .map((a) => `“${a}”`)
                                  .join(', ') || '—'}
                              </span>
                            ) : rec.verification
                                .anchorMatch ===
                                'EXACT_MATCH' ||
                              rec.verification
                                .anchorMatch ===
                                'RELATED_MATCH' ? (
                              <span className="mt-0.5 block">
                                Observed anchor:{' '}
                                {rec.verification.observedAnchors
                                  .slice(0, 3)
                                  .map((a) => `“${a}”`)
                                  .join(', ') || '—'}
                              </span>
                            ) : null}
                            {rec.verification.linkLost ===
                            true ? (
                              <span className="mt-0.5 block font-semibold text-rk-warning">
                                Link observed in a previous
                                crawl but absent now
                                (factual).
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                        <span className="mt-1 flex flex-wrap items-center gap-2">
                          <ToneChip
                            label={rec.priority}
                            tone={priorityTone(
                              rec.priority,
                            )}
                          />
                          {rec.action?.exists ? (
                            <Link
                              href="/actions"
                              className="font-semibold text-rk-ink underline"
                            >
                              Open action
                              {rec.action.status
                                ? ` (${rec.action.status})`
                                : ''}
                            </Link>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                void createLinkAction(rec)
                              }
                              disabled={
                                pipelineBusy || !websiteId
                              }
                              className="rk-focusable font-semibold text-rk-ink underline disabled:opacity-40"
                            >
                              Create Action
                            </button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </DrawerSection>
            <DrawerSection title="Next step">
              <p className="rk-body font-semibold">
                {strategyDrawer.quickWin
                  ? strategyDrawer.quickWin.action
                  : strategyDrawer.pageMapping ===
                      'CREATE'
                    ? `Create a dedicated page for "${strategyDrawer.keyword}" and brief it in the Content Engine.`
                    : strategyDrawer.pageMapping ===
                        'CONSOLIDATE'
                      ? `Pick one primary URL for "${strategyDrawer.keyword}" and consolidate or differentiate the rest.`
                      : strategyDrawer.pageMapping ===
                          'PROTECT'
                        ? `Defend the ranking for "${strategyDrawer.keyword}" — monitor, do not rebuild.`
                        : strategyDrawer.pageMapping ===
                            'OPTIMIZE'
                          ? `Optimize "${strategyDrawer.targetPage ?? 'existing coverage'}" for "${strategyDrawer.keyword}" — align the H1, intro and one dedicated section to ${intentLabel(strategyDrawer.intent)} intent and add one internal link from the most relevant page.`
                          : strategyDrawer.pageMapping ===
                              'IGNORE'
                            ? `Ignore "${strategyDrawer.keyword}" for now and revisit when demand appears.`
                            : `Track "${strategyDrawer.keyword}" and revisit when evidence changes.`}
              </p>
            </DrawerSection>
            <DrawerSection title="Content pipeline">
              <DrawerMeta
                items={[
                  {
                    label: 'Content',
                    value:
                      drawerLink()?.content.exists
                        ? (drawerLink()?.content.status ??
                          'Created')
                        : 'Not created',
                  },
                  {
                    label: 'Brief',
                    value: drawerLink()?.brief.exists
                      ? 'Ready'
                      : 'Not created',
                  },
                  {
                    label: 'Draft',
                    value: drawerLink()?.draft.exists
                      ? 'Draft'
                      : '—',
                  },
                  {
                    label: 'Action',
                    value:
                      drawerLink()?.action.exists
                        ? (drawerLink()?.action.status ??
                          'Open')
                        : 'Not created',
                  },
                ]}
              />
              {contentLinksLoading ? (
                <p className="rk-metadata mt-2">
                  Checking linked content…
                </p>
              ) : null}
              {pipelineMsg ? (
                <p
                  role="status"
                  className="mt-2 text-xs font-semibold text-rk-success"
                >
                  {pipelineMsg}{' '}
                  <Link
                    href="/content"
                    className="underline"
                  >
                    Open Content Engine
                  </Link>
                </p>
              ) : null}
              {pipelineErr ? (
                <p
                  role="alert"
                  className="mt-2 text-xs font-semibold text-rk-danger"
                >
                  {pipelineErr}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {drawerLink()?.brief.exists ? null : (
                  <SecondaryButton
                    type="button"
                    onClick={() =>
                      void createBriefFromDrawer()
                    }
                    disabled={
                      pipelineBusy || !websiteId
                    }
                  >
                    {pipelineBusy
                      ? 'Working…'
                      : 'Create Brief'}
                  </SecondaryButton>
                )}
                <Link
                  href="/content"
                  className="rk-focusable rounded-rk-md border border-rk-border bg-white px-4 py-2 text-xs font-bold text-rk-ink"
                >
                  Open Content
                </Link>
                {drawerLink()?.action.exists ? (
                  <Link
                    href="/actions"
                    className="rk-focusable rounded-rk-md border border-rk-border bg-white px-4 py-2 text-xs font-bold text-rk-ink"
                  >
                    Open Actions
                  </Link>
                ) : (
                  <SecondaryButton
                    type="button"
                    onClick={() =>
                      void createActionFromDrawer()
                    }
                    disabled={
                      pipelineBusy || !websiteId
                    }
                  >
                    {pipelineBusy
                      ? 'Working…'
                      : 'Create Action'}
                  </SecondaryButton>
                )}
              </div>
            </DrawerSection>
            <DrawerSection title="Evidence sources">
              <ul className="space-y-1">
                {strategyDrawer.signals.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="text-rk-secondary">
                      {s.label}:{' '}
                      <span className="font-semibold text-rk-ink">
                        {s.value}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-rk-muted">
                      {evidenceSourceLabel(s.source)}
                    </span>
                  </li>
                ))}
              </ul>
            </DrawerSection>
          </>
        ) : null}
      </Drawer>

      {/* ============ GSC DETAIL DRAWER (preserved) ============ */}
      <Drawer
        open={gscDrawer !== null}
        onClose={() => setGscDrawer(null)}
        eyebrow="Keyword detail"
        title={String(gscDrawer?._query || 'Keyword')}
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
          gscDrawer && void openGscDrawer(gscDrawer)
        }
      >
        {gscDrawer && (
          <>
            <DrawerMeta
              items={[
                {
                  label: 'Current position',
                  value:
                    num(gscDrawer.position) > 0
                      ? num(gscDrawer.position).toFixed(1)
                      : '—',
                },
                {
                  label: 'Movement',
                  value:
                    gscDrawer.clicksChange !== undefined
                      ? `${num(gscDrawer.clicksChange) > 0 ? '+' : ''}${fmtInt(gscDrawer.clicksChange)} clicks`
                      : 'No prior-period comparison',
                },
                {
                  label: 'Clicks',
                  value: fmtInt(gscDrawer.clicks),
                },
                {
                  label: 'Impressions',
                  value: fmtInt(gscDrawer.impressions),
                },
                {
                  label: 'Intent',
                  value: `${gscDrawer._intent} (estimate)`,
                },
                ...(gscDrawer.page
                  ? [
                      {
                        label: 'Linked page',
                        value: String(gscDrawer.page),
                      },
                    ]
                  : []),
              ]}
            />
            {gscDrawer._opp ? (
              <DrawerSection title="Opportunity">
                <InsightBlock
                  eyebrow="Rule-based flag"
                  title={gscDrawer._opp.label}
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
                        <p key={i} className="rk-body">
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

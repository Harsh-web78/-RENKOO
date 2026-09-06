'use client';

/*
 * RENKOO V2 — Phase 6: Growth Command Center.
 *
 * Narrative order:
 *   1. Header / context
 *   2. Growth Pulse
 *   3. What Changed (monitoring)
 *   4. Why It Matters (correlation-only)
 *   5. Today's Growth Plan (ranked opportunities)
 *   6. Top Opportunities (compact table)
 *   7. Search + AI Visibility
 *   8. Traffic → Leads → Revenue (ROI outcome)
 *   9. Competitor / market signals
 *   10. Action Progress
 *   11. Outcome / Learning
 *   12. Ask RENKOO (intelligence)
 *
 * FRONTEND ONLY. All data comes from existing
 * frontend/src/lib/api.ts endpoints. Nothing is
 * invented: unavailable sources render honest
 * states (not connected / no data / insufficient
 * history / error / loading).
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  Eye,
  Globe2,
  MousePointerClick,
  RefreshCw,
  Search,
  Sparkles,
  Swords,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react';

import AppShell from '../components/AppShell';
import PersonaHomeStrip from '../components/PersonaHomeStrip';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import DataTable from '../components/ui/DataTable';
import FilterBar from '../components/ui/FilterBar';
import {
  Badge,
  DataSourceBadge,
  FreshnessBadge,
  StatusBadge,
} from '../components/ui/badge';
import { SecondaryButton } from '../components/ui/buttons';
import {
  EmptyState,
  ErrorState,
  InsufficientHistoryState,
  LoadingBlock,
  NotConnectedState,
} from '../components/ui/states';
import {
  FunnelStages,
  ProgressBar,
  Sparkline,
  TrendChart,
  type TrendPoint,
} from '../components/charts/RenkooCharts';

import {
  PERSONA_META,
  rankOpportunities,
  usePersona,
} from '../lib/persona';

import {
  askIntelligence,
  createActionFromRecommendation,
  getActions,
  getAiVisibilityIntelligence,
  getCompetitorComparison,
  getCompetitors,
  getGoogleAnalytics,
  getGoogleAnalyticsReport,
  getGoogleConnectionStatus,
  getGoogleQueries,
  getLatestCrawlSummary,
  getMonitoringChanges,
  getMonitoringSummary,
  getRoiOutcome,
  getTechnicalSeoLatest,
  getUnifiedOpportunities,
  getWebsites,
  type AiIntelligence,
  type Competitor,
  type CrawlSummary,
  type GoogleAnalytics,
  type GoogleAnalyticsReport,
  type GoogleAnalyticsReportRow,
  type GoogleQueriesResponse,
  type IntelligenceResponse,
  type MonitoringChangesResponse,
  type MonitoringSummary,
  type OutcomeResponse,
  type TechnicalSeoResponse,
  type UnifiedOpportunity,
  type Website,
} from '../lib/api';

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getDateRange() {
  const end = new Date();
  const start = new Date();

  start.setDate(start.getDate() - 28);

  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-US').format(value);
}

function shortDate(value: string) {
  if (!value) return value;
  return value.length > 5 ? value.slice(5) : value;
}

const ASK_SUGGESTIONS = [
  'What should I fix first?',
  'Why did visibility change?',
  'Where am I losing opportunities?',
  'Which competitor gap matters most?',
  'What changed this week?',
];

type ChangeSeverityFilter =
  | 'ALL'
  | 'CRITICAL'
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW';

export default function Home() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const [websites, setWebsites] = useState<Website[]>([]);
  const [selectedWebsite, setSelectedWebsite] =
    useState<Website | null>(null);

  const [loadingWebsites, setLoadingWebsites] = useState(true);
  const [websiteError, setWebsiteError] = useState('');

  const [seoSummary, setSeoSummary] =
    useState<CrawlSummary | null>(null);

  const [technicalSeo, setTechnicalSeo] =
    useState<TechnicalSeoResponse | null>(null);

  const [loadingSeo, setLoadingSeo] = useState(false);
  const [seoError, setSeoError] = useState('');

  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail, setGoogleEmail] =
    useState<string | null>(null);

  const [selectedSearchProperty, setSelectedSearchProperty] =
    useState<string | null>(null);

  const [selectedAnalyticsProperty, setSelectedAnalyticsProperty] =
    useState<string | null>(null);

  const [searchAnalytics, setSearchAnalytics] =
    useState<GoogleAnalytics | null>(null);

  const [searchQueries, setSearchQueries] =
    useState<GoogleQueriesResponse | null>(null);

  const [loadingSearchAnalytics, setLoadingSearchAnalytics] =
    useState(false);

  const [searchAnalyticsError, setSearchAnalyticsError] =
    useState('');

  const [ga4Report, setGa4Report] =
    useState<GoogleAnalyticsReport | null>(null);

  const [loadingGa4, setLoadingGa4] = useState(false);
  const [ga4Error, setGa4Error] = useState('');

  const [opportunities, setOpportunities] =
    useState<UnifiedOpportunity[]>([]);

  const [opportunitiesLoading, setOpportunitiesLoading] =
    useState(false);

  const [opportunitiesError, setOpportunitiesError] =
    useState<string | null>(null);

  const [creatingActionId, setCreatingActionId] =
    useState<string | null>(null);

  const [actionsSummary, setActionsSummary] = useState({
    high: 0,
    medium: 0,
    low: 0,
    todo: 0,
    inProgress: 0,
    done: 0,
  });

  const [actionsLoading, setActionsLoading] = useState(false);

  /* ---------- Phase 6: monitoring / what changed ---------- */

  const [monitoring, setMonitoring] =
    useState<MonitoringChangesResponse | null>(null);
  const [monitoringLoading, setMonitoringLoading] =
    useState(false);
  const [monitoringError, setMonitoringError] = useState('');
  const [monitoringSummary, setMonitoringSummary] =
    useState<MonitoringSummary | null>(null);
  const [changeFilter, setChangeFilter] =
    useState<ChangeSeverityFilter>('ALL');

  /* ---------- Phase 6: AI visibility ---------- */

  const [aiIntel, setAiIntel] = useState<AiIntelligence | null>(
    null,
  );
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  /* ---------- Phase 6: competitors ---------- */

  const [competitors, setCompetitors] = useState<Competitor[]>(
    [],
  );
  const [competitorsLoading, setCompetitorsLoading] =
    useState(false);
  const [competitorsError, setCompetitorsError] = useState('');
  const [competitorComparison, setCompetitorComparison] =
    useState<any | null>(null);
  const [comparisonLoading, setComparisonLoading] =
    useState(false);

  /* ---------- Phase 6: outcome / revenue ---------- */

  const [roiOutcome, setRoiOutcome] =
    useState<OutcomeResponse | null>(null);
  const [roiLoading, setRoiLoading] = useState(false);
  const [roiError, setRoiError] = useState('');

  /* ---------- Phase 6: ask RENKOO ---------- */

  const [askQuestion, setAskQuestion] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState('');
  const [askResponse, setAskResponse] =
    useState<IntelligenceResponse | null>(null);

  const [refreshing, setRefreshing] = useState(false);

  const dateRange = useMemo(() => getDateRange(), []);

  /*
   * Persona only re-orders and re-labels this
   * dashboard. Data loading is unchanged.
   */
  const { effectivePersona } = usePersona();

  /*
   * =========================================================
   * WEBSITE
   * =========================================================
   */

  async function loadWebsites() {
    try {
      setLoadingWebsites(true);
      setWebsiteError('');

      const token = localStorage.getItem('renkoo_access_token');

      if (!token) {
        setWebsiteError('Please login to RENKOO first.');
        setWebsites([]);
        setSelectedWebsite(null);
        return;
      }

      const data = await getWebsites();

      setWebsites(data);

      if (data.length > 0) {
        setSelectedWebsite((current) => {
          if (current) {
            return (
              data.find((website) => website.id === current.id) ??
              data[0]
            );
          }

          return data[0];
        });
      } else {
        setSelectedWebsite(null);
      }
    } catch (error) {
      console.error('Failed to load websites:', error);

      setWebsiteError(
        error instanceof Error
          ? error.message
          : 'Unable to load your websites.',
      );

      setWebsites([]);
      setSelectedWebsite(null);
    } finally {
      setLoadingWebsites(false);
    }
  }

  /*
   * =========================================================
   * SEO
   * =========================================================
   */

  async function loadSeoData(websiteId: string) {
    try {
      setLoadingSeo(true);
      setSeoError('');

      const [summaryResult, technicalResult] =
        await Promise.allSettled([
          getLatestCrawlSummary(websiteId),
          getTechnicalSeoLatest(websiteId),
        ]);

      if (summaryResult.status === 'fulfilled') {
        setSeoSummary(summaryResult.value);
      } else {
        setSeoSummary(null);
      }

      if (technicalResult.status === 'fulfilled') {
        setTechnicalSeo(technicalResult.value);
      } else {
        setTechnicalSeo(null);
      }

      if (
        summaryResult.status === 'rejected' &&
        technicalResult.status === 'rejected'
      ) {
        setSeoError('No completed SEO audit found.');
      }
    } catch (error) {
      setSeoSummary(null);
      setTechnicalSeo(null);

      setSeoError(
        error instanceof Error
          ? error.message
          : 'Unable to load SEO data.',
      );
    } finally {
      setLoadingSeo(false);
    }
  }

  /*
   * =========================================================
   * GOOGLE STATUS
   * =========================================================
   */

  async function loadGoogleStatus() {
    try {
      const connection = await getGoogleConnectionStatus();

      setGoogleConnected(Boolean(connection.connected));

      setGoogleEmail(connection.googleEmail ?? null);

      setSelectedSearchProperty(
        connection.selectedProperty ?? null,
      );

      setSelectedAnalyticsProperty(
        connection.selectedAnalyticsProperty ?? null,
      );

      return connection;
    } catch (error) {
      console.error('Failed to load Google status:', error);

      setGoogleConnected(false);
      setGoogleEmail(null);
      setSelectedSearchProperty(null);
      setSelectedAnalyticsProperty(null);

      return null;
    }
  }

  /*
   * =========================================================
   * SEARCH CONSOLE
   * =========================================================
   */

  async function loadSearchAnalytics(
    connected?: boolean,
    property?: string | null,
  ) {
    try {
      setLoadingSearchAnalytics(true);
      setSearchAnalyticsError('');

      const isConnected = connected ?? googleConnected;

      const activeProperty = property ?? selectedSearchProperty;

      if (!isConnected || !activeProperty) {
        setSearchAnalytics(null);
        setSearchQueries(null);
        return;
      }

      const [analyticsData, queriesData] = await Promise.all([
        getGoogleAnalytics(
          dateRange.startDate,
          dateRange.endDate,
        ),
        getGoogleQueries(
          dateRange.startDate,
          dateRange.endDate,
        ),
      ]);

      setSearchAnalytics(analyticsData);
      setSearchQueries(queriesData);
    } catch (error) {
      console.error(
        'Failed to load Search Console data:',
        error,
      );

      setSearchAnalytics(null);
      setSearchQueries(null);

      setSearchAnalyticsError(
        error instanceof Error
          ? error.message
          : 'Unable to load Search Console data.',
      );
    } finally {
      setLoadingSearchAnalytics(false);
    }
  }

  /*
   * =========================================================
   * GA4
   * =========================================================
   */

  async function loadGa4Data(
    connected?: boolean,
    property?: string | null,
  ) {
    try {
      setLoadingGa4(true);
      setGa4Error('');

      const isConnected = connected ?? googleConnected;

      const activeProperty =
        property ?? selectedAnalyticsProperty;

      if (!isConnected || !activeProperty) {
        setGa4Report(null);
        return;
      }

      const data = await getGoogleAnalyticsReport(
        dateRange.startDate,
        dateRange.endDate,
      );

      setGa4Report(data);
    } catch (error) {
      console.error('Failed to load GA4 report:', error);

      setGa4Report(null);

      setGa4Error(
        error instanceof Error
          ? error.message
          : 'Unable to load Google Analytics 4 data.',
      );
    } finally {
      setLoadingGa4(false);
    }
  }

  /*
   * =========================================================
   * OPPORTUNITIES
   * =========================================================
   */

  async function loadOpportunities(websiteId: string) {
    try {
      setOpportunitiesLoading(true);
      setOpportunitiesError(null);

      const response = await getUnifiedOpportunities(websiteId);

      setOpportunities(
        Array.isArray(response.opportunities)
          ? response.opportunities
          : [],
      );
    } catch (error) {
      console.error('Failed to load opportunities:', error);

      setOpportunitiesError(
        error instanceof Error
          ? error.message
          : 'Unable to load growth opportunities.',
      );

      setOpportunities([]);
    } finally {
      setOpportunitiesLoading(false);
    }
  }

  /*
   * =========================================================
   * ACTIONS
   * =========================================================
   */

  async function loadActions() {
    try {
      setActionsLoading(true);

      const response = await getActions();

      setActionsSummary(response.summary);
    } catch (error) {
      console.error('Failed to load actions:', error);

      setActionsSummary({
        high: 0,
        medium: 0,
        low: 0,
        todo: 0,
        inProgress: 0,
        done: 0,
      });
    } finally {
      setActionsLoading(false);
    }
  }

  /*
   * =========================================================
   * MONITORING — WHAT CHANGED
   * =========================================================
   */

  async function loadMonitoring(websiteId: string) {
    try {
      setMonitoringLoading(true);
      setMonitoringError('');

      const [changesResult, summaryResult] =
        await Promise.allSettled([
          getMonitoringChanges(websiteId),
          getMonitoringSummary(websiteId),
        ]);

      if (changesResult.status === 'fulfilled') {
        setMonitoring(changesResult.value);
      } else {
        setMonitoring(null);
        setMonitoringError(
          changesResult.reason instanceof Error
            ? changesResult.reason.message
            : 'Unable to load detected changes.',
        );
      }

      if (summaryResult.status === 'fulfilled') {
        setMonitoringSummary(summaryResult.value);
      } else {
        setMonitoringSummary(null);
      }
    } catch (error) {
      setMonitoring(null);
      setMonitoringError(
        error instanceof Error
          ? error.message
          : 'Unable to load monitoring data.',
      );
    } finally {
      setMonitoringLoading(false);
    }
  }

  /*
   * =========================================================
   * AI VISIBILITY
   * =========================================================
   */

  async function loadAiIntel(websiteId: string) {
    try {
      setAiLoading(true);
      setAiError('');

      const data = await getAiVisibilityIntelligence(websiteId);
      setAiIntel(data);
    } catch (error) {
      console.error('Failed to load AI visibility:', error);
      setAiIntel(null);
      setAiError(
        error instanceof Error
          ? error.message
          : 'Unable to load AI visibility data.',
      );
    } finally {
      setAiLoading(false);
    }
  }

  /*
   * =========================================================
   * COMPETITORS
   * =========================================================
   */

  async function loadCompetitors() {
    try {
      setCompetitorsLoading(true);
      setCompetitorsError('');

      const data = await getCompetitors();
      setCompetitors(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load competitors:', error);
      setCompetitors([]);
      setCompetitorsError(
        error instanceof Error
          ? error.message
          : 'Unable to load competitors.',
      );
    } finally {
      setCompetitorsLoading(false);
    }
  }

  async function loadComparison(competitorId: string) {
    try {
      setComparisonLoading(true);
      const data = await getCompetitorComparison(competitorId);
      setCompetitorComparison(data);
    } catch {
      // Honest unavailable state — never fake a score.
      setCompetitorComparison(null);
    } finally {
      setComparisonLoading(false);
    }
  }

  /*
   * =========================================================
   * OUTCOME — TRAFFIC → LEADS → REVENUE
   * =========================================================
   */

  async function loadOutcome(websiteId: string) {
    try {
      setRoiLoading(true);
      setRoiError('');

      const data = await getRoiOutcome(
        websiteId,
        dateRange.startDate,
        dateRange.endDate,
      );
      setRoiOutcome(data);
    } catch (error) {
      console.error('Failed to load outcome:', error);
      setRoiOutcome(null);
      setRoiError(
        error instanceof Error
          ? error.message
          : 'Unable to load revenue outcome data.',
      );
    } finally {
      setRoiLoading(false);
    }
  }

  /*
   * =========================================================
   * ASK RENKOO
   * =========================================================
   */

  async function askRenkoo(question: string) {
    const trimmed = question.trim();

    if (!selectedWebsite?.id || !trimmed || askLoading) return;

    try {
      setAskLoading(true);
      setAskError('');

      const response = await askIntelligence(
        selectedWebsite.id,
        trimmed,
      );
      setAskResponse(response);
    } catch (error) {
      setAskResponse(null);
      setAskError(
        error instanceof Error
          ? error.message
          : 'RENKOO could not answer right now.',
      );
    } finally {
      setAskLoading(false);
    }
  }

  async function createActionForOpportunity(
    opportunity: UnifiedOpportunity,
  ) {
    try {
      setCreatingActionId(opportunity.sourceId);

      await createActionFromRecommendation(opportunity.sourceId);

      if (selectedWebsite?.id) {
        await loadOpportunities(selectedWebsite.id);
      }

      await loadActions();
    } catch (error) {
      console.error('Create action error:', error);

      setOpportunitiesError(
        error instanceof Error
          ? error.message
          : 'Unable to create action.',
      );
    } finally {
      setCreatingActionId(null);
    }
  }

  /*
   * =========================================================
   * INITIAL
   * =========================================================
   */

  useEffect(() => {
    loadWebsites();
    loadActions();
    loadCompetitors();
  }, []);

  /*
   * =========================================================
   * WEBSITE CHANGE
   * =========================================================
   */

  useEffect(() => {
    if (!selectedWebsite?.id) {
      setSeoSummary(null);
      setTechnicalSeo(null);
      setOpportunities([]);
      setMonitoring(null);
      setAiIntel(null);
      setRoiOutcome(null);
      setCompetitorComparison(null);
      setAskResponse(null);
      return;
    }

    loadSeoData(selectedWebsite.id);
    loadOpportunities(selectedWebsite.id);
    loadMonitoring(selectedWebsite.id);
    loadAiIntel(selectedWebsite.id);
    loadOutcome(selectedWebsite.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWebsite?.id]);

  /*
   * =========================================================
   * GOOGLE INITIAL DATA
   * =========================================================
   */

  useEffect(() => {
    async function initializeGoogle() {
      const connection = await loadGoogleStatus();

      if (!connection?.connected) {
        return;
      }

      await Promise.all([
        loadSearchAnalytics(
          true,
          connection.selectedProperty,
        ),
        loadGa4Data(
          true,
          connection.selectedAnalyticsProperty,
        ),
      ]);
    }

    initializeGoogle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * =========================================================
   * COMPETITOR COMPARISON (first workspace competitor only)
   * =========================================================
   */

  const workspaceCompetitors = useMemo(() => {
    if (!selectedWebsite?.id) return competitors;
    const scoped = competitors.filter(
      (c) =>
        !c.websiteId || c.websiteId === selectedWebsite.id,
    );
    return scoped.length > 0 ? scoped : competitors;
  }, [competitors, selectedWebsite?.id]);

  useEffect(() => {
    if (workspaceCompetitors.length > 0) {
      loadComparison(workspaceCompetitors[0].id);
    } else {
      setCompetitorComparison(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceCompetitors.length, selectedWebsite?.id]);

  /*
   * =========================================================
   * REFRESH
   * =========================================================
   */

  async function refreshDashboard() {
    setRefreshing(true);

    try {
      const connection = await loadGoogleStatus();

      await Promise.all([
        selectedWebsite?.id
          ? loadSeoData(selectedWebsite.id)
          : Promise.resolve(),

        selectedWebsite?.id
          ? loadOpportunities(selectedWebsite.id)
          : Promise.resolve(),

        selectedWebsite?.id
          ? loadMonitoring(selectedWebsite.id)
          : Promise.resolve(),

        selectedWebsite?.id
          ? loadAiIntel(selectedWebsite.id)
          : Promise.resolve(),

        selectedWebsite?.id
          ? loadOutcome(selectedWebsite.id)
          : Promise.resolve(),

        loadActions(),
        loadCompetitors(),

        loadSearchAnalytics(
          connection?.connected,
          connection?.selectedProperty,
        ),

        loadGa4Data(
          connection?.connected,
          connection?.selectedAnalyticsProperty,
        ),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  /*
   * =========================================================
   * SEO DERIVED
   * =========================================================
   */

  const seoScore =
    seoSummary?.score ?? technicalSeo?.score?.value ?? null;

  const scoreLabel =
    seoScore === null
      ? 'No audit yet'
      : seoScore >= 80
        ? 'Healthy'
        : seoScore >= 60
          ? 'Needs attention'
          : 'Critical attention';

  const openIssues =
    seoSummary?.open ?? technicalSeo?.issues.open ?? null;

  const criticalIssues =
    seoSummary?.critical ??
    technicalSeo?.issues.critical ??
    null;

  const highIssues =
    seoSummary?.high ?? technicalSeo?.issues.high ?? null;

  const mediumIssues =
    seoSummary?.medium ?? technicalSeo?.issues.medium ?? null;

  const crawledPages =
    seoSummary?.pages ?? technicalSeo?.pages.total ?? null;

  const lastAuditAt =
    technicalSeo?.crawl?.completedAt ??
    technicalSeo?.crawl?.createdAt ??
    null;

  /*
   * =========================================================
   * SEARCH
   * =========================================================
   */

  const hasSearchData = Boolean(searchAnalytics);

  const searchClicks = searchAnalytics?.clicks ?? 0;
  const searchImpressions = searchAnalytics?.impressions ?? 0;
  const searchCtr = searchAnalytics?.ctr ?? 0;
  const searchPosition = searchAnalytics?.averagePosition ?? 0;

  /*
   * =========================================================
   * GA4
   * =========================================================
   */

  const ga4Totals = useMemo(() => {
    if (!ga4Report?.rows?.length) {
      return {
        activeUsers: 0,
        newUsers: 0,
        sessions: 0,
        pageViews: 0,
        conversions: 0,
        engagementRate: 0,
        averageSessionDuration: 0,
      };
    }

    const rows = ga4Report.rows;

    const total = rows.reduce(
      (
        acc: {
          activeUsers: number;
          newUsers: number;
          sessions: number;
          pageViews: number;
          conversions: number;
          averageSessionDuration: number;
          engagementRate: number;
        },
        row: GoogleAnalyticsReportRow,
      ) => {
        acc.activeUsers += row.activeUsers ?? 0;
        acc.newUsers += row.newUsers ?? 0;
        acc.sessions += row.sessions ?? 0;
        acc.pageViews += row.pageViews ?? 0;
        acc.conversions += row.conversions ?? 0;

        acc.averageSessionDuration +=
          row.averageSessionDuration ?? 0;

        return acc;
      },
      {
        activeUsers: 0,
        newUsers: 0,
        sessions: 0,
        pageViews: 0,
        conversions: 0,
        averageSessionDuration: 0,
        engagementRate: 0,
      },
    );

    const totalSessions = rows.reduce(
      (sum: number, row: GoogleAnalyticsReportRow) =>
        sum + (row.sessions ?? 0),
      0,
    );

    total.engagementRate =
      totalSessions > 0
        ? rows.reduce(
            (sum: number, row: GoogleAnalyticsReportRow) =>
              sum +
              (row.engagementRate ?? 0) *
                (row.sessions ?? 0),
            0,
          ) / totalSessions
        : 0;

    total.averageSessionDuration =
      rows.length > 0
        ? total.averageSessionDuration / rows.length
        : 0;

    return total;
  }, [ga4Report]);

  /*
   * =========================================================
   * SEARCH TREND (RenkooCharts)
   * =========================================================
   */

  const searchTrend: TrendPoint[] = useMemo(() => {
    const rows = searchAnalytics?.rows ?? [];
    if (!rows.length) return [];

    return rows.slice(-28).map((row) => ({
      x: shortDate(row.keys?.[0] ?? ''),
      y: Number(row.impressions ?? 0),
    }));
  }, [searchAnalytics]);

  const searchSpark = useMemo(
    () => searchTrend.slice(-14).map((p) => p.y),
    [searchTrend],
  );

  /*
   * =========================================================
   * TOP QUERIES
   * =========================================================
   */

  const topQueries = useMemo(() => {
    return (
      searchQueries?.rows
        ?.map((row) => ({
          query: row.query ?? 'Unknown query',
          clicks: row.clicks ?? 0,
          impressions: row.impressions ?? 0,
          ctr: row.ctr ?? 0,
          position: row.position ?? 0,
        }))
        .sort((a, b) => {
          if (b.clicks !== a.clicks) {
            return b.clicks - a.clicks;
          }

          if (b.impressions !== a.impressions) {
            return b.impressions - a.impressions;
          }

          return a.position - b.position;
        })
        .slice(0, 5) ?? []
    );
  }, [searchQueries]);

  /*
   * =========================================================
   * ISSUES / OPPORTUNITIES
   * =========================================================
   */

  const technicalIssues = technicalSeo?.topIssues?.slice(0, 5) ?? [];

  const rankedOpportunities = useMemo(() => {
    const open = opportunities.filter(
      (item) =>
        item.status !== 'DISMISSED' &&
        item.status !== 'COMPLETED',
    );

    /*
     * Persona re-orders the engine's real output
     * for relevance; evidence and scores are
     * untouched, nothing hidden.
     */
    return rankOpportunities(open, effectivePersona);
  }, [opportunities, effectivePersona]);

  const growthPlan = useMemo(
    () => rankedOpportunities.slice(0, 5).map((e) => e.opportunity),
    [rankedOpportunities],
  );

  const topOpportunities = useMemo(
    () => rankedOpportunities.slice(0, 7).map((e) => e.opportunity),
    [rankedOpportunities],
  );

  const highPriorityOpen = useMemo(
    () =>
      opportunities.filter(
        (o) =>
          o.priority === 'HIGH' &&
          o.status !== 'DISMISSED' &&
          o.status !== 'COMPLETED',
      ).length,
    [opportunities],
  );

  /*
   * =========================================================
   * WHAT CHANGED — derived
   * =========================================================
   */

  const changes = useMemo(
    () =>
      Array.isArray(monitoring?.changes)
        ? monitoring.changes
        : [],
    [monitoring],
  );

  const filteredChanges = useMemo(() => {
    if (changeFilter === 'ALL') return changes;
    return changes.filter(
      (c) => String(c.severity).toUpperCase() === changeFilter,
    );
  }, [changes, changeFilter]);

  const changeCounts = useMemo(() => {
    const counts: Record<string, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };
    for (const c of changes) {
      const key = String(c.severity).toUpperCase();
      if (key in counts) counts[key] += 1;
    }
    return counts;
  }, [changes]);

  /*
   * =========================================================
   * WHY IT MATTERS — correlation-only, evidence-first
   * =========================================================
   */

  const correlations = useMemo(() => {
    const items: {
      title: string;
      evidence: string;
      href: string;
      hrefLabel: string;
    }[] = [];

    if (hasSearchData && searchImpressions > 0) {
      const ctrPct = searchCtr * 100;
      if (ctrPct < 2 && searchPosition > 8) {
        items.push({
          title:
            'RENKOO detected a correlation between high impressions, low CTR and deep average position.',
          evidence: `${formatNumber(searchImpressions)} impressions · ${ctrPct.toFixed(2)}% CTR · position ${searchPosition.toFixed(1)} — consistent with a SERP snippet opportunity, not proof of one.`,
          href: '/search-visibility',
          hrefLabel: 'View Search Intelligence',
        });
      }
    }

    if (ga4Report && roiOutcome) {
      const users = ga4Totals.activeUsers;
      const leads = roiOutcome.funnel?.leads ?? 0;
      if (users > 0 && leads === 0) {
        items.push({
          title:
            'RENKOO detected a correlation between recorded traffic and zero recorded leads.',
          evidence: `${formatNumber(users)} GA4 active users with no leads recorded — consistent with a conversion-measurement or funnel gap, not proof of one.`,
          href: '/roi',
          hrefLabel: 'Open Revenue Intelligence',
        });
      }
    }

    const negative = changes.filter(
      (c) => String(c.direction).toUpperCase() === 'NEGATIVE',
    );
    if (negative.length > 0 && openIssues !== null && openIssues > 0) {
      items.push({
        title:
          'RENKOO detected a correlation between recent negative technical changes and open issue load.',
        evidence: `${negative.length} negative change${negative.length === 1 ? '' : 's'} detected · ${openIssues} open technical issues — review the change evidence before acting.`,
        href: '/monitoring',
        hrefLabel: 'Open Monitoring',
      });
    }

    const lowCtrQueries = topQueries.filter(
      (q) => q.impressions > 0 && q.ctr < 0.02 && q.position <= 10,
    );
    if (lowCtrQueries.length > 0) {
      items.push({
        title:
          'RENKOO detected a correlation between page-one positions and low CTR on specific queries.',
        evidence: `${lowCtrQueries.length} quer${lowCtrQueries.length === 1 ? 'y' : 'ies'} ranking on page one with CTR below 2% — consistent with title/meta snippet upside.`,
        href: '/search-visibility',
        hrefLabel: 'View Search Intelligence',
      });
    }

    return items;
  }, [
    hasSearchData,
    searchImpressions,
    searchCtr,
    searchPosition,
    ga4Report,
    roiOutcome,
    ga4Totals.activeUsers,
    changes,
    openIssues,
    topQueries,
  ]);

  /*
   * =========================================================
   * OUTCOME — derived funnel stages (only real stages)
   * =========================================================
   */

  const funnelStages = useMemo(() => {
    if (!roiOutcome) return [];

    const stages: { label: string; value: number }[] = [];
    const funnel = roiOutcome.funnel;

    if (
      typeof funnel.visitors === 'number' &&
      funnel.visitors !== null
    ) {
      stages.push({ label: 'Traffic', value: funnel.visitors });
    }
    if (
      typeof funnel.engaged === 'number' &&
      funnel.engaged !== null
    ) {
      stages.push({ label: 'Engaged', value: funnel.engaged });
    }
    stages.push({ label: 'Leads', value: funnel.leads ?? 0 });
    stages.push({
      label: 'Qualified',
      value: funnel.qualified ?? 0,
    });
    stages.push({
      label: 'Conversions',
      value: funnel.conversions ?? 0,
    });
    stages.push({ label: 'Revenue', value: funnel.revenue ?? 0 });

    return stages;
  }, [roiOutcome]);

  const totalActions =
    actionsSummary.todo +
    actionsSummary.inProgress +
    actionsSummary.done;

  const freshnessMeta = [
    selectedWebsite?.name ?? 'No website selected',
    lastAuditAt
      ? `Audit ${formatDate(new Date(lastAuditAt))}`
      : 'No audit yet',
    `Data window ${dateRange.startDate} → ${dateRange.endDate}`,
  ].join(' · ');

  /*
   * =========================================================
   * RENDER
   * =========================================================
   */

  return (
    <AppShell
      mobileOpen={mobileOpen}
      onClose={() => setMobileOpen(false)}
      onMenu={() => setMobileOpen(true)}
    >
      {/* ================================================
          1. HEADER / CONTEXT
      ================================================= */}

      <PageHeader
        eyebrow="Growth Operating System"
        title="Growth Command Center"
        description="Here's what needs attention — what changed, why it matters, and what RENKOO recommends doing today."
        meta={freshnessMeta}
        actions={
          <>
            <SecondaryButton
              onClick={refreshDashboard}
              disabled={refreshing}
            >
              <RefreshCw
                size={14}
                className={refreshing ? 'animate-spin' : ''}
                aria-hidden
              />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </SecondaryButton>

            <Link
              href="/opportunities"
              className="rk-focusable inline-flex h-9 items-center gap-1.5 rounded-rk-md bg-rk-ink px-4 text-[13px] font-bold text-white shadow-rk-sm transition-all hover:opacity-90 hover:shadow-rk-md"
            >
              Review opportunities
              <ArrowRight size={14} aria-hidden />
            </Link>
          </>
        }
      />

      {/* Website context — preserved working selector */}

      <div className="mt-4">
        {loadingWebsites ? (
          <LoadingBlock title="Loading workspace…" lines={1} />
        ) : websiteError ? (
          <ErrorState
            title="Workspace unavailable"
            description={websiteError}
            onRetry={loadWebsites}
            retryLabel="Retry"
          />
        ) : websites.length === 0 ? (
          <NotConnectedState
            title="No website connected"
            description="Set up your first website to activate the Growth Command Center. Nothing here is estimated until real data arrives."
            connectLabel="Set up your first website"
            connectHref="/onboarding"
          />
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label
              htmlFor="gcc-website"
              className="rk-label shrink-0"
            >
              Active website
            </label>

            <div className="relative min-w-0 flex-1">
              <Globe2
                size={15}
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-rk-muted"
              />

              <select
                id="gcc-website"
                value={selectedWebsite?.id ?? ''}
                onChange={(event) => {
                  const next =
                    websites.find(
                      (w) => w.id === event.target.value,
                    ) ?? null;
                  setSelectedWebsite(next);
                }}
                className="rk-focusable w-full appearance-none rounded-rk-md border border-rk-strong bg-rk-surface py-2.5 pl-9 pr-9 text-sm font-semibold text-rk-ink"
              >
                {websites.map((website) => (
                  <option key={website.id} value={website.id}>
                    {website.name} — {website.url}
                  </option>
                ))}
              </select>
            </div>

            <FreshnessBadge
              label={
                lastAuditAt
                  ? `Audit ${formatDate(new Date(lastAuditAt))}`
                  : 'No audit yet'
              }
            />

            <span className="rk-metadata shrink-0">
              {PERSONA_META[effectivePersona].label} view
            </span>
          </div>
        )}
      </div>

      <div className="mt-4">
        <PersonaHomeStrip
          websiteId={selectedWebsite?.id ?? null}
        />
      </div>

      {/* ================================================
          2. GROWTH PULSE
      ================================================= */}

      <section aria-labelledby="gcc-pulse" className="mt-8">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2
            id="gcc-pulse"
            className="text-[15px] font-extrabold tracking-[-0.015em] text-rk-ink"
          >
            Growth pulse
          </h2>
          <p className="rk-metadata hidden sm:block">
            Live signals from connected sources
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <PulseSignal
            label="Search visibility"
            value={
              loadingSearchAnalytics
                ? '…'
                : hasSearchData
                  ? formatNumber(searchClicks)
                  : '—'
            }
            detail={
              loadingSearchAnalytics
                ? 'Loading Search Console'
                : hasSearchData
                  ? `${formatNumber(searchImpressions)} impressions · ${(searchCtr * 100).toFixed(2)}% CTR`
                  : 'Search Console not connected'
            }
            source="GSC"
            connected={hasSearchData}
            spark={
              hasSearchData && searchSpark.length > 1 ? (
                <Sparkline
                  points={searchSpark}
                  summary={`Organic search impressions over the last ${searchSpark.length} days`}
                />
              ) : undefined
            }
          />

          <PulseSignal
            label="Technical health"
            value={
              loadingSeo
                ? '…'
                : seoScore !== null
                  ? String(seoScore)
                  : '—'
            }
            detail={
              loadingSeo
                ? 'Loading audit'
                : seoScore !== null
                  ? `${scoreLabel} · ${openIssues ?? 0} open issues`
                  : 'No completed audit'
            }
            source="SEO audit"
            connected={seoScore !== null}
          />

          <PulseSignal
            label="AI visibility"
            value={
              aiLoading
                ? '…'
                : aiIntel
                  ? formatNumber(aiIntel.counts?.brandMentions)
                  : '—'
            }
            detail={
              aiLoading
                ? 'Loading AI checks'
                : aiIntel
                  ? `${formatNumber(aiIntel.counts?.trackedQueries)} tracked prompts · ${formatNumber(aiIntel.counts?.completedChecks)} checks`
                  : 'No AI visibility data'
            }
            source="AI search"
            connected={Boolean(aiIntel)}
          />

          <PulseSignal
            label="Traffic"
            value={
              loadingGa4
                ? '…'
                : ga4Report
                  ? formatNumber(ga4Totals.activeUsers)
                  : '—'
            }
            detail={
              loadingGa4
                ? 'Loading Analytics'
                : ga4Report
                  ? `${formatNumber(ga4Totals.conversions)} conversions · last 28 days`
                  : 'Analytics not connected'
            }
            source="GA4"
            connected={Boolean(ga4Report)}
          />

          <PulseSignal
            label="Leads"
            value={
              roiLoading
                ? '…'
                : roiOutcome
                  ? formatNumber(roiOutcome.funnel?.leads)
                  : '—'
            }
            detail={
              roiLoading
                ? 'Loading outcome'
                : roiOutcome
                  ? `${formatNumber(roiOutcome.funnel?.conversions)} conversions`
                  : 'No lead data'
            }
            source="ROI"
            connected={Boolean(roiOutcome)}
          />

          <PulseSignal
            label="Revenue"
            value={
              roiLoading
                ? '…'
                : roiOutcome
                  ? `${roiOutcome.currency ?? ''} ${formatNumber(roiOutcome.funnel?.revenue)}`.trim()
                  : '—'
            }
            detail={
              roiLoading
                ? 'Loading outcome'
                : roiOutcome
                  ? 'Revenue not measurable beyond recorded transactions'
                  : 'Revenue not measurable'
            }
            source="ROI"
            connected={Boolean(roiOutcome)}
          />

          <PulseSignal
            label="High-priority opportunities"
            value={
              opportunitiesLoading ? '…' : String(highPriorityOpen)
            }
            detail={
              opportunitiesLoading
                ? 'Loading opportunities'
                : `${opportunities.length} open total`
            }
            source="Opportunities"
            connected={opportunities.length > 0}
          />

          <PulseSignal
            label="Active actions"
            value={
              actionsLoading
                ? '…'
                : String(actionsSummary.inProgress)
            }
            detail={
              actionsLoading
                ? 'Loading actions'
                : `${actionsSummary.todo} to do · ${actionsSummary.done} done`
            }
            source="Actions"
            connected={totalActions > 0}
          />
        </div>

        {googleConnected && (
          <p className="rk-metadata mt-2">
            Google connected
            {googleEmail ? ` · ${googleEmail}` : ''}
            {selectedSearchProperty
              ? ` · GSC: ${selectedSearchProperty}`
              : ''}
            {selectedAnalyticsProperty
              ? ` · GA4: ${selectedAnalyticsProperty}`
              : ''}
          </p>
        )}

        {seoError && (
          <p className="rk-metadata mt-2">
            SEO audit: {seoError}
          </p>
        )}
      </section>

      {/* ================================================
          3. WHAT CHANGED
      ================================================= */}

      <div className="mt-6">
        <Panel
          eyebrow="Monitoring · what changed"
          title="What changed"
          description="Meaningful recent changes from monitoring. Each change shows what moved, where, the correlation-only explanation, its business relevance, and where to act."
          actions={
            <Link
              href="/monitoring"
              className="rk-focusable inline-flex items-center gap-1.5 rounded-rk-md border border-rk-strong bg-rk-surface px-3 py-1.5 text-xs font-bold text-rk-ink"
            >
              View all
              <ArrowRight size={13} aria-hidden />
            </Link>
          }
          footer={
            monitoring?.latestCrawlAt
              ? `Latest crawl ${formatDate(new Date(monitoring.latestCrawlAt))} · ${monitoring.completedCrawls ?? 0} completed crawls`
              : 'Change detection needs completed crawls to compare.'
          }
        >
          {!selectedWebsite ? (
            <NotConnectedState
              title="Select a website to see changes"
              description="Monitoring compares completed crawls per website. Nothing is shown until a workspace is active."
              connectLabel="Connect a website"
              connectHref="/integrations"
            />
          ) : monitoringLoading ? (
            <LoadingBlock title="Loading detected changes…" />
          ) : monitoringError && !monitoring ? (
            <ErrorState
              title="Could not load changes"
              description={monitoringError}
              onRetry={() =>
                selectedWebsite?.id &&
                loadMonitoring(selectedWebsite.id)
              }
            />
          ) : monitoring?.notEnoughData ? (
            <InsufficientHistoryState
              title="Not enough history to detect changes"
              description={
                monitoring.notEnoughDataReason ??
                'Monitoring needs at least two completed crawls before it can report what changed.'
              }
              actionLabel="Open Monitoring"
              actionHref="/monitoring"
            />
          ) : changes.length === 0 ? (
            <EmptyState
              title="No meaningful changes detected"
              description="RENKOO compared the latest completed crawls and found nothing worth surfacing. New changes appear here automatically."
            />
          ) : (
            <>
              <FilterBar
                selects={[
                  {
                    key: 'severity',
                    label: 'Severity',
                    value: changeFilter,
                    options: (
                      [
                        'ALL',
                        'CRITICAL',
                        'HIGH',
                        'MEDIUM',
                        'LOW',
                      ] as ChangeSeverityFilter[]
                    ).map((severity) => ({
                      value: severity,
                      label:
                        severity === 'ALL'
                          ? `All (${changes.length})`
                          : `${severity.charAt(0)}${severity.slice(1).toLowerCase()} (${changeCounts[severity] ?? 0})`,
                    })),
                    onChange: (value) =>
                      setChangeFilter(
                        value as ChangeSeverityFilter,
                      ),
                  },
                ]}
                onClearAll={
                  changeFilter !== 'ALL'
                    ? () => setChangeFilter('ALL')
                    : undefined
                }
                meta={`${filteredChanges.length} of ${changes.length} changes shown`}
              />

              {filteredChanges.length === 0 ? (
                <div className="mt-3">
                  <EmptyState
                    title={`No ${changeFilter.toLowerCase()} changes`}
                    description="Try a different severity filter to see the remaining detected changes."
                  />
                </div>
              ) : (
                <ol className="mt-3 space-y-3">
                  {filteredChanges.slice(0, 6).map((change) => (
                    <li
                      key={change.id}
                      className="rounded-rk-md border border-rk-border bg-rk-surface p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          status={String(change.severity)}
                        />
                        <Badge
                          label={String(
                            change.direction,
                          ).replaceAll('_', ' ')}
                          tone={
                            String(change.direction) ===
                            'NEGATIVE'
                              ? 'danger'
                              : String(change.direction) ===
                                  'POSITIVE'
                                ? 'positive'
                                : 'neutral'
                          }
                        />
                        <DataSourceBadge
                          source={String(
                            change.source ?? 'monitoring',
                          )}
                        />
                        <span className="rk-metadata">
                          {String(change.type ?? '').replaceAll(
                            '_',
                            ' ',
                          )}
                        </span>
                      </div>

                      <p className="mt-2 text-sm font-bold text-rk-ink">
                        {change.title}
                      </p>

                      <p className="mt-1 text-sm leading-6 text-rk-secondary">
                        {change.previousValue !== null &&
                        change.currentValue !== null
                          ? `${formatNumber(change.previousValue)} → ${formatNumber(change.currentValue)}`
                          : change.description}
                      </p>

                      {Array.isArray(change.why) &&
                      change.why.length > 0 ? (
                        <p className="mt-2 text-xs leading-5 text-rk-secondary">
                          <strong className="text-rk-ink">
                            Possible correlation:{' '}
                          </strong>
                          {change.why.slice(0, 2).join(' ')}
                        </p>
                      ) : null}

                      {change.businessNote ? (
                        <p className="mt-1 text-xs leading-5 text-rk-secondary">
                          <strong className="text-rk-ink">
                            Business relevance:{' '}
                          </strong>
                          {change.businessNote}
                        </p>
                      ) : null}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Link
                          href="/monitoring"
                          className="rk-focusable inline-flex items-center gap-1.5 rounded-rk-md border border-rk-strong bg-rk-surface px-3 py-1.5 text-xs font-bold text-rk-ink"
                        >
                          Open evidence
                          <ArrowRight
                            size={13}
                            aria-hidden
                          />
                        </Link>

                        <Link
                          href="/actions"
                          className="rk-focusable inline-flex items-center gap-1.5 rounded-rk-md bg-rk-ink px-3 py-1.5 text-xs font-bold text-white"
                        >
                          Open Actions
                        </Link>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}

          {/* Preserved technical signals from the latest crawl */}
          {technicalIssues.length > 0 && (
            <div className="mt-4 border-t border-rk-border pt-4">
              <p className="rk-label">
                Technical signals · latest crawl
              </p>
              <ul className="mt-2 space-y-2">
                {technicalIssues.map((issue, index) => (
                  <li
                    key={issue.id}
                    className="flex items-start gap-3 text-sm"
                  >
                    <span
                      aria-hidden
                      className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-rk-sm bg-rk-soft text-[11px] font-bold text-rk-secondary"
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-rk-ink">
                        {issue.title}
                      </p>
                      <p className="rk-metadata truncate">
                        {issue.severity} · {issue.category}
                        {issue.page?.url
                          ? ` · ${issue.page.url}`
                          : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <Link
                href="/technical-seo"
                className="rk-focusable mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-rk-ink underline underline-offset-2"
              >
                Open technical audit
                <ArrowRight size={13} aria-hidden />
              </Link>
            </div>
          )}

          {monitoringSummary && (
            <p className="rk-metadata mt-3">
              {monitoringSummary.detected} detected ·{' '}
              {monitoringSummary.acknowledged} acknowledged ·{' '}
              {monitoringSummary.resolved} resolved
            </p>
          )}
        </Panel>
      </div>

      {/* ================================================
          4. WHY IT MATTERS
      ================================================= */}

      <div className="mt-4">
        <Panel
          eyebrow="Evidence first"
          title="Why it matters"
          description="RENKOO connects signals across modules. Relationships are correlations with evidence — never claimed causality."
        >
          {correlations.length === 0 ? (
            <p className="rounded-rk-md border border-rk-border bg-rk-soft p-4 text-sm leading-6 text-rk-secondary">
              Not enough evidence to determine why. Connect
              Search Console and Analytics, run a technical
              audit, and record leads so RENKOO can relate
              signals to each other.
            </p>
          ) : (
            <ol className="space-y-3">
              {correlations.map((item, index) => (
                <li
                  key={index}
                  className="rounded-rk-md border border-rk-border bg-rk-surface p-4"
                >
                  <p className="text-sm font-bold leading-6 text-rk-ink">
                    {item.title}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-rk-secondary">
                    {item.evidence}
                  </p>
                  <Link
                    href={item.href}
                    className="rk-focusable mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-rk-ink underline underline-offset-2"
                  >
                    {item.hrefLabel}
                    <ArrowRight size={13} aria-hidden />
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      {/* ================================================
          5. TODAY'S GROWTH PLAN
      ================================================= */}

      <div className="mt-4">
        <Panel
          eyebrow="Most actionable"
          title="Today's growth plan"
          description="A short ranked list by impact, priority, effort and business relevance — drawn from the existing opportunity engine, not a second one."
          actions={
            <Link
              href="/actions"
              className="rk-focusable inline-flex items-center gap-1.5 rounded-rk-md border border-rk-strong bg-rk-surface px-3 py-1.5 text-xs font-bold text-rk-ink"
            >
              Open Actions
              <ArrowRight size={13} aria-hidden />
            </Link>
          }
        >
          {!selectedWebsite ? (
            <NotConnectedState
              title="Select a website to build today's plan"
              description="The growth plan ranks real opportunities for the active workspace."
              connectLabel="Connect a website"
              connectHref="/integrations"
            />
          ) : opportunitiesLoading ? (
            <LoadingBlock title="Ranking today's plan…" />
          ) : opportunitiesError && growthPlan.length === 0 ? (
            <ErrorState
              title="Could not load the growth plan"
              description={opportunitiesError}
              onRetry={() =>
                selectedWebsite?.id &&
                loadOpportunities(selectedWebsite.id)
              }
            />
          ) : growthPlan.length === 0 ? (
            <EmptyState
              title="No open growth opportunities"
              description="RENKOO will surface new opportunities here as fresh data arrives."
              actionLabel="View opportunities"
              actionHref="/opportunities"
            />
          ) : (
            <ol className="space-y-3">
              {growthPlan.map((opportunity, index) => (
                <li
                  key={opportunity.id}
                  className="rounded-rk-md border border-rk-border bg-rk-surface p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      aria-hidden
                      className="grid h-6 w-6 place-items-center rounded-rk-sm bg-rk-ink text-[11px] font-bold text-white"
                    >
                      {index + 1}
                    </span>
                    <StatusBadge
                      status={opportunity.priority}
                    />
                    <DataSourceBadge
                      source={opportunity.source}
                    />
                    {opportunity.status && (
                      <Badge
                        label={String(
                          opportunity.status,
                        ).replaceAll('_', ' ')}
                        tone="neutral"
                      />
                    )}
                  </div>

                  <p className="mt-2 text-sm font-bold text-rk-ink">
                    {opportunity.title}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-rk-secondary">
                    {opportunity.description}
                  </p>

                  <p className="rk-metadata mt-2">
                    Impact{' '}
                    {opportunity.impact ?? 'unknown'} ·
                    Effort {opportunity.effort ?? 'unknown'}{' '}
                    · Score {opportunity.score}
                    <span title="Score 0–100 · rule-based ranking">
                      {' '}
                      (0–100 · rule-based ranking)
                    </span>
                    {opportunity.pageUrl
                      ? ` · ${opportunity.pageUrl}`
                      : ''}
                  </p>

                  {opportunity.recommendation && (
                    <p className="mt-2 text-sm leading-6 text-rk-secondary">
                      <strong className="text-rk-ink">
                        Recommended action:{' '}
                      </strong>
                      {opportunity.recommendation}
                    </p>
                  )}

                  <div className="mt-3">
                    <SecondaryButton
                      size="sm"
                      disabled={
                        creatingActionId ===
                        opportunity.sourceId
                      }
                      onClick={() =>
                        createActionForOpportunity(opportunity)
                      }
                    >
                      {creatingActionId ===
                      opportunity.sourceId
                        ? 'Creating…'
                        : 'Create action'}
                    </SecondaryButton>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      {/* ================================================
          6. TOP OPPORTUNITIES
      ================================================= */}

      <div className="mt-4">
        <Panel
          eyebrow="Opportunity workspace"
          title="Top opportunities"
          description="The highest-value open opportunities with their real backend source labels."
          actions={
            <Link
              href="/opportunities"
              className="rk-focusable inline-flex items-center gap-1.5 rounded-rk-md border border-rk-strong bg-rk-surface px-3 py-1.5 text-xs font-bold text-rk-ink"
            >
              View all opportunities
              <ArrowRight size={13} aria-hidden />
            </Link>
          }
        >
          <DataTable
            caption="Top open growth opportunities ranked by the existing opportunity engine"
            rows={topOpportunities}
            keyOf={(row) => row.id}
            loading={opportunitiesLoading}
            emptyTitle="No open growth opportunities"
            emptyDescription="RENKOO will surface new opportunities as fresh data arrives."
            error={
              opportunitiesError &&
              topOpportunities.length === 0
                ? {
                    title: 'Unable to load opportunities',
                    description: opportunitiesError,
                    onRetry: () =>
                      selectedWebsite?.id &&
                      loadOpportunities(selectedWebsite.id),
                  }
                : null
            }
            density="comfortable"
            defaultSort={{ key: 'score', direction: 'desc' }}
            columns={[
              {
                key: 'priority',
                label: 'Priority',
                priority: 'high',
                render: (opportunity) => (
                  <StatusBadge
                    status={opportunity.priority}
                  />
                ),
              },
              {
                key: 'opportunity',
                label: 'Opportunity',
                priority: 'high',
                sortable: true,
                sortValue: (opportunity) =>
                  opportunity.score ?? 0,
                render: (opportunity) => (
                  <span className="block max-w-[280px]">
                    <span className="block truncate font-semibold text-rk-ink">
                      {opportunity.title}
                    </span>
                    <span
                      className="rk-metadata"
                      title="Score 0–100 · rule-based ranking"
                    >
                      Score {opportunity.score} · 0–100
                      rule-based
                    </span>
                  </span>
                ),
              },
              {
                key: 'source',
                label: 'Source',
                priority: 'medium',
                render: (opportunity) => (
                  <DataSourceBadge
                    source={opportunity.source}
                  />
                ),
              },
              {
                key: 'impact',
                label: 'Impact',
                priority: 'low',
                render: (opportunity) => (
                  <span className="text-rk-secondary">
                    {opportunity.impact ?? '—'}
                  </span>
                ),
              },
              {
                key: 'effort',
                label: 'Effort',
                priority: 'low',
                render: (opportunity) => (
                  <span className="text-rk-secondary">
                    {opportunity.effort ?? '—'}
                  </span>
                ),
              },
              {
                key: 'status',
                label: 'Status',
                priority: 'medium',
                render: (opportunity) => (
                  <Badge
                    label={String(
                      opportunity.status ?? 'open',
                    ).replaceAll('_', ' ')}
                    tone="neutral"
                  />
                ),
              },
              {
                key: 'open',
                label: 'Open',
                priority: 'high',
                align: 'right',
                render: () => (
                  <Link
                    href="/opportunities"
                    className="rk-focusable text-xs font-bold text-rk-ink underline underline-offset-2"
                  >
                    Open
                  </Link>
                ),
              },
            ]}
            renderExpanded={(opportunity) => (
              <div className="space-y-1.5 text-sm leading-6">
                <p className="text-rk-secondary">
                  {opportunity.description}
                </p>
                {opportunity.recommendation ? (
                  <p className="text-rk-secondary">
                    <strong className="text-rk-ink">
                      Recommended action:{' '}
                    </strong>
                    {opportunity.recommendation}
                  </p>
                ) : null}
                <p className="rk-metadata">
                  Impact {opportunity.impact ?? 'unknown'} ·
                  Effort {opportunity.effort ?? 'unknown'}
                  {opportunity.pageUrl
                    ? ` · ${opportunity.pageUrl}`
                    : ''}
                </p>
              </div>
            )}
            footer={`${topOpportunities.length} of ${opportunities.length} open opportunities shown`}
          />
        </Panel>
      </div>

      {/* ================================================
          7. SEARCH + AI VISIBILITY
      ================================================= */}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel
          eyebrow="Search intelligence"
          title="Search visibility"
          description="Real Search Console performance for the selected workspace."
          actions={
            <Link
              href="/search-visibility"
              className="rk-focusable inline-flex items-center gap-1.5 rounded-rk-md border border-rk-strong bg-rk-surface px-3 py-1.5 text-xs font-bold text-rk-ink"
            >
              View Search Intelligence
              <ArrowRight size={13} aria-hidden />
            </Link>
          }
          footer={
            hasSearchData
              ? `Source: Search Console · ${dateRange.startDate} → ${dateRange.endDate}`
              : undefined
          }
        >
          {!hasSearchData ? (
            <NotConnectedState
              title="Search Console isn't connected"
              description={
                searchAnalyticsError ||
                'Connect Search Console to unlock clicks, queries, impressions and ranking intelligence.'
              }
              connectLabel="Connect Search Console"
              connectHref="/integrations"
            />
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SearchMetric
                  icon={<MousePointerClick size={14} />}
                  label="Clicks"
                  value={formatNumber(searchClicks)}
                />
                <SearchMetric
                  icon={<Eye size={14} />}
                  label="Impressions"
                  value={formatNumber(searchImpressions)}
                />
                <SearchMetric
                  icon={<Target size={14} />}
                  label="CTR"
                  value={`${(searchCtr * 100).toFixed(2)}%`}
                />
                <SearchMetric
                  icon={<TrendingUp size={14} />}
                  label="Avg position"
                  value={searchPosition.toFixed(1)}
                />
              </dl>

              <div className="mt-4">
                <p className="rk-label mb-2">
                  Organic search impressions — last 28 days
                </p>
                <TrendChart
                  state={
                    loadingSearchAnalytics
                      ? 'loading'
                      : searchTrend.length > 0
                        ? 'ready'
                        : 'empty'
                  }
                  points={searchTrend}
                  currentLabel="Impressions"
                  summary={`Organic search impressions per day from ${dateRange.startDate} to ${dateRange.endDate}`}
                  emptyTitle="No daily rows available"
                  emptyDescription="Search Console returned no daily rows for this period."
                />
              </div>

              <div className="mt-4">
                <p className="rk-label mb-2">
                  Queries needing attention
                </p>
                {topQueries.length === 0 ? (
                  <p className="rk-metadata">
                    No search query data was returned for
                    this period.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {topQueries.map((query, index) => (
                      <li
                        key={`${query.query}-${index}`}
                        className="flex items-center gap-3 text-sm"
                      >
                        <span
                          aria-hidden
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-rk-sm bg-rk-soft text-[11px] font-bold text-rk-secondary"
                        >
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-rk-ink">
                            {query.query}
                          </p>
                          <p className="rk-metadata">
                            Position {query.position.toFixed(1)}{' '}
                            ·{' '}
                            {formatNumber(query.impressions)}{' '}
                            impressions
                          </p>
                        </div>
                        <p className="rk-number shrink-0 font-bold text-rk-ink">
                          {formatNumber(query.clicks)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </Panel>

        <Panel
          eyebrow="AI search visibility"
          title="AI search visibility"
          description="Tracked prompts, mentions, citations and provider coverage. AI provider metrics are not equivalent to Search Console metrics."
          actions={
            <Link
              href="/ai-visibility"
              className="rk-focusable inline-flex items-center gap-1.5 rounded-rk-md border border-rk-strong bg-rk-surface px-3 py-1.5 text-xs font-bold text-rk-ink"
            >
              View AI Search
              <ArrowRight size={13} aria-hidden />
            </Link>
          }
          footer={
            aiIntel ? 'Source: RENKOO AI visibility checks' : undefined
          }
        >
          {!selectedWebsite ? (
            <NotConnectedState
              title="Select a website to see AI visibility"
              description="AI visibility is tracked per website."
              connectLabel="Connect a website"
              connectHref="/integrations"
            />
          ) : aiLoading ? (
            <LoadingBlock title="Loading AI visibility…" />
          ) : aiError && !aiIntel ? (
            <ErrorState
              title="Could not load AI visibility"
              description={aiError}
              onRetry={() =>
                selectedWebsite?.id &&
                loadAiIntel(selectedWebsite.id)
              }
            />
          ) : !aiIntel ||
            (aiIntel.counts?.trackedQueries ?? 0) === 0 ? (
            <EmptyState
              title="No AI visibility data yet"
              description="Track prompts for this website to measure mentions, citations and provider coverage."
              actionLabel="Open AI Visibility"
              actionHref="/ai-visibility"
            />
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-3">
                <SearchMetric
                  icon={<Bot size={14} />}
                  label="Tracked prompts"
                  value={formatNumber(
                    aiIntel.counts?.trackedQueries,
                  )}
                />
                <SearchMetric
                  icon={<Sparkles size={14} />}
                  label="Brand mentions"
                  value={formatNumber(
                    aiIntel.counts?.brandMentions,
                  )}
                />
                <SearchMetric
                  icon={<Eye size={14} />}
                  label="Completed checks"
                  value={formatNumber(
                    aiIntel.counts?.completedChecks,
                  )}
                />
                <SearchMetric
                  icon={<Globe2 size={14} />}
                  label="Cited domains"
                  value={formatNumber(
                    aiIntel.counts?.citedDomains,
                  )}
                />
              </dl>

              {aiIntel.shareOfVoice ? (
                <p className="mt-3 text-sm leading-6 text-rk-secondary">
                  Share of voice: brand{' '}
                  {aiIntel.shareOfVoice.brand} of{' '}
                  {aiIntel.shareOfVoice.denominator}{' '}
                  mentions
                  {aiIntel.shareOfVoice.note
                    ? ` — ${aiIntel.shareOfVoice.note}`
                    : ''}
                  . Share is only shown where a
                  denominator exists.
                </p>
              ) : (
                <p className="rk-metadata mt-3">
                  Share of voice unavailable — no mention
                  denominator recorded yet.
                </p>
              )}

              {aiIntel.trend &&
              typeof aiIntel.trend.recentMentionRate ===
                'number' ? (
                <p className="mt-2 text-sm leading-6 text-rk-secondary">
                  Recent mention rate{' '}
                  {(
                    (aiIntel.trend.recentMentionRate ?? 0) *
                    100
                  ).toFixed(1)}
                  %
                  {typeof aiIntel.trend.pointChange ===
                  'number'
                    ? ` (${(aiIntel.trend.pointChange * 100).toFixed(1)} pts vs prior window)`
                    : ''}
                  .
                </p>
              ) : (
                <p className="rk-metadata mt-2">
                  Insufficient history for an AI trend
                  comparison.
                </p>
              )}

              {Array.isArray(aiIntel.citations) &&
              aiIntel.citations.length > 0 ? (
                <div className="mt-3">
                  <p className="rk-label mb-2">
                    Top cited domains
                  </p>
                  <ul className="space-y-1.5 text-sm">
                    {aiIntel.citations
                      .slice(0, 4)
                      .map((citation) => (
                        <li
                          key={citation.domain}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="truncate font-medium text-rk-ink">
                            {citation.domain}
                          </span>
                          <span className="rk-metadata shrink-0">
                            {citation.citations} citations
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}

              {Array.isArray(aiIntel.providers) &&
              aiIntel.providers.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {aiIntel.providers.map((provider) => (
                    <DataSourceBadge
                      key={provider.id}
                      source={provider.displayName}
                      connected={Boolean(provider.connected)}
                    />
                  ))}
                </div>
              ) : null}
            </>
          )}
        </Panel>
      </div>

      {/* ================================================
          8. TRAFFIC → LEADS → REVENUE
      ================================================= */}

      <div className="mt-4">
        <Panel
          eyebrow="Business outcome loop"
          title="From traffic to revenue"
          description="Traffic, leads, conversions and revenue — only stages with actual data are shown."
          actions={
            <Link
              href="/roi"
              className="rk-focusable inline-flex items-center gap-1.5 rounded-rk-md border border-rk-strong bg-rk-surface px-3 py-1.5 text-xs font-bold text-rk-ink"
            >
              Open Revenue Intelligence
              <ArrowRight size={13} aria-hidden />
            </Link>
          }
          footer="RENKOO does not invent monetary opportunity from traffic alone."
        >
          {!selectedWebsite ? (
            <NotConnectedState
              title="Select a website to see the outcome loop"
              description="Traffic, lead and revenue signals resolve per website."
              connectLabel="Connect a website"
              connectHref="/integrations"
            />
          ) : roiLoading ? (
            <LoadingBlock title="Loading outcome funnel…" />
          ) : roiError && !roiOutcome ? (
            <ErrorState
              title="Could not load the outcome loop"
              description={roiError}
              onRetry={() =>
                selectedWebsite?.id &&
                loadOutcome(selectedWebsite.id)
              }
            />
          ) : !roiOutcome ? (
            <EmptyState
              title="No outcome data yet"
              description="Record leads, conversions and revenue to make the business outcome measurable."
              actionLabel="Open Revenue Intelligence"
              actionHref="/roi"
            />
          ) : (
            <>
              <FunnelStages
                state={
                  funnelStages.length > 0 ? 'ready' : 'empty'
                }
                stages={funnelStages}
                summary="Outcome funnel from traffic through revenue using recorded data only"
                formatValue={(value) => formatNumber(value)}
                emptyTitle="No funnel data yet"
                emptyDescription="No recorded traffic, lead or revenue signals for this period."
              />

              <div className="mt-3 space-y-1.5 text-sm leading-6">
                {roiOutcome.funnel?.conversionRate ===
                null ? (
                  <p className="text-rk-secondary">
                    No conversion rate — no leads recorded.
                  </p>
                ) : (
                  <p className="text-rk-secondary">
                    Conversion rate{' '}
                    {(
                      (roiOutcome.funnel
                        ?.conversionRate ?? 0) * 100
                    ).toFixed(1)}
                    %.
                  </p>
                )}

                {(roiOutcome.funnel?.revenue ?? 0) === 0 && (
                  <p className="text-rk-secondary">
                    Revenue not measurable — no revenue
                    transactions recorded.
                  </p>
                )}

                {typeof roiOutcome.attribution?.coverage ===
                'number' ? (
                  <p className="text-rk-secondary">
                    Attribution coverage{' '}
                    {(
                      (roiOutcome.attribution.coverage ??
                        0) * 100
                    ).toFixed(0)}
                    % · attributed{' '}
                    {roiOutcome.currency}{' '}
                    {formatNumber(
                      roiOutcome.attribution
                        .attributedRevenue,
                    )}{' '}
                    of {roiOutcome.currency}{' '}
                    {formatNumber(
                      roiOutcome.attribution.totalRevenue,
                    )}
                    .
                  </p>
                ) : (
                  <p className="rk-metadata">
                    Attribution coverage unavailable.
                  </p>
                )}
              </div>
            </>
          )}
        </Panel>
      </div>

      {/* ================================================
          9. COMPETITOR / MARKET SIGNALS
      ================================================= */}

      <div className="mt-4">
        <Panel
          eyebrow="Market intelligence"
          title="Competitor signals"
          description="Where competitors are ahead, where this workspace leads, and the gaps worth acting on — from real comparison data only."
          actions={
            <Link
              href="/competitors"
              className="rk-focusable inline-flex items-center gap-1.5 rounded-rk-md border border-rk-strong bg-rk-surface px-3 py-1.5 text-xs font-bold text-rk-ink"
            >
              Open Competitor War Room
              <ArrowRight size={13} aria-hidden />
            </Link>
          }
        >
          {competitorsLoading ? (
            <LoadingBlock title="Loading competitors…" />
          ) : competitorsError && competitors.length === 0 ? (
            <ErrorState
              title="Could not load competitors"
              description={competitorsError}
              onRetry={loadCompetitors}
            />
          ) : workspaceCompetitors.length === 0 ? (
            <EmptyState
              title="No competitors tracked"
              description="Add competitors to unlock gap analysis and market signals. No competitive scores are estimated until then."
              actionLabel="Open Competitors"
              actionHref="/competitors"
            />
          ) : (
            <>
              <ul className="space-y-2">
                {workspaceCompetitors.slice(0, 5).map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 text-sm"
                  >
                    <span
                      aria-hidden
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-rk-md bg-rk-soft text-rk-secondary"
                    >
                      <Swords size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-rk-ink">
                        {c.name}
                      </p>
                      <p className="rk-metadata truncate">
                        {c.url}
                      </p>
                    </div>
                    <Link
                      href={`/competitors/${c.id}`}
                      className="rk-focusable shrink-0 text-xs font-bold text-rk-ink underline underline-offset-2"
                    >
                      Compare
                    </Link>
                  </li>
                ))}
              </ul>

              <div className="mt-3 border-t border-rk-border pt-3 text-sm leading-6">
                {comparisonLoading ? (
                  <p className="rk-metadata">
                    Loading comparison…
                  </p>
                ) : competitorComparison &&
                  typeof competitorComparison === 'object' ? (
                  <ComparisonSummary
                    comparison={competitorComparison}
                  />
                ) : (
                  <p className="rk-metadata">
                    Detailed gap comparison unavailable for{' '}
                    {workspaceCompetitors[0]?.name ??
                      'this competitor'}{' '}
                    — open the Competitor War Room for the
                    latest crawl state.
                  </p>
                )}
              </div>
            </>
          )}
        </Panel>
      </div>

      {/* ================================================
          10. ACTION PROGRESS + 11. OUTCOME / LEARNING
      ================================================= */}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel
          eyebrow="Action engine"
          title="Action progress"
          description="Your active growth work — real execution state, never invented completion."
          actions={
            <Link
              href="/actions"
              className="rk-focusable inline-flex items-center gap-1.5 rounded-rk-md border border-rk-strong bg-rk-surface px-3 py-1.5 text-xs font-bold text-rk-ink"
            >
              Open Actions
              <ArrowRight size={13} aria-hidden />
            </Link>
          }
        >
          {actionsLoading ? (
            <LoadingBlock title="Loading actions…" lines={2} />
          ) : (
            <>
              <dl className="grid grid-cols-3 gap-3">
                <ActionStat
                  label="To do"
                  value={actionsSummary.todo}
                />
                <ActionStat
                  label="In progress"
                  value={actionsSummary.inProgress}
                />
                <ActionStat
                  label="Done"
                  value={actionsSummary.done}
                />
              </dl>

              <div className="mt-4">
                <ProgressBar
                  value={actionsSummary.done}
                  target={Math.max(1, totalActions)}
                  summary={`${actionsSummary.done} of ${totalActions} actions completed`}
                  label="Completion"
                />
                <p className="rk-metadata mt-2">
                  {totalActions === 0
                    ? 'No actions created yet.'
                    : `${actionsSummary.high} high priority · ${totalActions} total`}
                </p>
              </div>
            </>
          )}
        </Panel>

        <Panel
          eyebrow="Learning loop"
          title="What happened after action?"
          description="Post-action impact from verified outcome signals only."
        >
          {!selectedWebsite ? (
            <p className="rk-metadata">
              Select a website to measure post-action impact.
            </p>
          ) : roiLoading || monitoringLoading ? (
            <LoadingBlock title="Measuring post-action impact…" />
          ) : roiOutcome &&
            (roiOutcome.recentChanges?.leadsDelta !== 0 ||
              roiOutcome.recentChanges?.revenueDelta !==
                0) ? (
            <ul className="space-y-2 text-sm leading-6">
              <li className="flex items-start gap-2">
                <Activity
                  size={15}
                  aria-hidden
                  className="mt-1 shrink-0 text-rk-secondary"
                />
                <span className="text-rk-secondary">
                  Leads{' '}
                  <strong className="text-rk-ink">
                    {roiOutcome.recentChanges.leadsDelta > 0
                      ? '+'
                      : ''}
                    {roiOutcome.recentChanges.leadsDelta}
                  </strong>{' '}
                  vs prior window (
                  {roiOutcome.recentChanges.leadsRecent}{' '}
                  recent /{' '}
                  {roiOutcome.recentChanges.leadsPrior}{' '}
                  prior).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Wallet
                  size={15}
                  aria-hidden
                  className="mt-1 shrink-0 text-rk-secondary"
                />
                <span className="text-rk-secondary">
                  Revenue{' '}
                  <strong className="text-rk-ink">
                    {roiOutcome.currency}{' '}
                    {formatNumber(
                      roiOutcome.recentChanges.revenueDelta,
                    )}
                  </strong>{' '}
                  vs prior window. Movement is reported,
                  not attributed to any single action.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2
                  size={15}
                  aria-hidden
                  className="mt-1 shrink-0 text-rk-secondary"
                />
                <span className="text-rk-secondary">
                  {actionsSummary.done} actions completed ·{' '}
                  {monitoring?.summary?.positive ?? 0}{' '}
                  positive changes detected.
                </span>
              </li>
            </ul>
          ) : (
            <InsufficientHistoryState
              title="Collecting post-action history"
              description="RENKOO is collecting enough history to measure post-action impact. Completed work, monitoring changes and outcome signals will be related here once the evidence exists."
            />
          )}
        </Panel>
      </div>

      {/* ================================================
          12. ASK RENKOO
      ================================================= */}

      <div className="mt-4">
        <Panel
          eyebrow="RENKOO Intelligence"
          title="Ask RENKOO"
          description="Question → evidence → answer → next action. Answers use real workspace context and state their limits."
          footer="Deterministic intelligence is preserved when the LLM provider is unavailable."
        >
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Suggested questions"
          >
            {ASK_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={
                  !selectedWebsite || askLoading
                }
                onClick={() => {
                  setAskQuestion(suggestion);
                  askRenkoo(suggestion);
                }}
                className="rk-focusable shrink-0 rounded-rk-md border border-rk-strong bg-rk-surface px-3 py-1.5 text-xs font-semibold text-rk-secondary disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>

          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              askRenkoo(askQuestion);
            }}
          >
            <label htmlFor="gcc-ask" className="sr-only">
              Ask RENKOO about this workspace
            </label>
            <input
              id="gcc-ask"
              value={askQuestion}
              onChange={(event) =>
                setAskQuestion(event.target.value)
              }
              placeholder={
                selectedWebsite
                  ? 'Ask about priorities, changes, opportunities…'
                  : 'Select a website first'
              }
              disabled={!selectedWebsite || askLoading}
              className="rk-focusable min-w-0 flex-1 rounded-rk-md border border-rk-strong bg-rk-surface px-3 py-2.5 text-sm text-rk-ink placeholder:text-rk-muted disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={
                !selectedWebsite ||
                askLoading ||
                !askQuestion.trim()
              }
              className="rk-focusable inline-flex shrink-0 items-center justify-center gap-1.5 rounded-rk-md bg-rk-ink px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
            >
              <Search size={14} aria-hidden />
              {askLoading ? 'Asking…' : 'Ask'}
            </button>
          </form>

          <div className="mt-3" aria-live="polite">
            {!selectedWebsite ? (
              <p className="rk-metadata">
                Select a website to ask RENKOO about real
                workspace evidence.
              </p>
            ) : askLoading ? (
              <LoadingBlock title="RENKOO is gathering evidence…" />
            ) : askError && !askResponse ? (
              <ErrorState
                title="RENKOO could not answer"
                description={askError}
                onRetry={() => askRenkoo(askQuestion)}
              />
            ) : askResponse ? (
              <div className="space-y-3">
                <div className="rounded-rk-md border border-rk-border bg-rk-soft p-4">
                  <p className="rk-label">Question</p>
                  <p className="mt-1 text-sm font-semibold text-rk-ink">
                    {askResponse.question}
                  </p>
                </div>

                <div className="rounded-rk-md border border-rk-border bg-rk-surface p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      label={`Confidence ${askResponse.confidence}`}
                      tone={
                        askResponse.confidence === 'HIGH'
                          ? 'positive'
                          : askResponse.confidence === 'LOW'
                            ? 'warning'
                            : 'neutral'
                      }
                    />
                    {!askResponse.llm?.available && (
                      <Badge
                        label="Deterministic answer"
                        tone="neutral"
                      />
                    )}
                  </div>

                  <p className="mt-2 text-sm leading-6 text-rk-ink">
                    {askResponse.answer}
                  </p>

                  {askResponse.confidenceNote && (
                    <p className="rk-metadata mt-1">
                      {askResponse.confidenceNote}
                    </p>
                  )}

                  {!askResponse.llm?.available &&
                    askResponse.llm?.reason && (
                      <p className="rk-metadata mt-1">
                        LLM unavailable:{' '}
                        {askResponse.llm.reason}
                      </p>
                    )}
                </div>

                {Array.isArray(askResponse.evidence) &&
                askResponse.evidence.length > 0 ? (
                  <div className="rounded-rk-md border border-rk-border bg-rk-surface p-4">
                    <p className="rk-label mb-2">Evidence</p>
                    <ul className="space-y-1.5 text-sm text-rk-secondary">
                      {askResponse.evidence
                        .slice(0, 5)
                        .map((item, index) => (
                          <li key={index}>
                            <strong className="text-rk-ink">
                              {item.source} · {item.metric}:
                            </strong>{' '}
                            {String(
                              item.value ??
                                item.currentValue ??
                                item.note ??
                                '',
                            )}
                          </li>
                        ))}
                    </ul>
                  </div>
                ) : null}

                {Array.isArray(
                  askResponse.suggestedActions,
                ) &&
                askResponse.suggestedActions.length > 0 ? (
                  <div className="rounded-rk-md border border-rk-border bg-rk-surface p-4">
                    <p className="rk-label mb-2">
                      Next actions
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-rk-secondary">
                      {askResponse.suggestedActions
                        .slice(0, 4)
                        .map((action, index) => (
                          <li key={index}>{action}</li>
                        ))}
                    </ul>
                    <Link
                      href="/agents"
                      className="rk-focusable mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-rk-ink underline underline-offset-2"
                    >
                      Continue in Ask RENKOO
                      <ArrowRight size={13} aria-hidden />
                    </Link>
                  </div>
                ) : (
                  <Link
                    href="/agents"
                    className="rk-focusable inline-flex items-center gap-1.5 text-xs font-bold text-rk-ink underline underline-offset-2"
                  >
                    Continue in Ask RENKOO
                    <ArrowRight size={13} aria-hidden />
                  </Link>
                )}
              </div>
            ) : (
              <p className="rk-metadata">
                No question asked yet. Start with a
                suggestion above.
              </p>
            )}
          </div>
        </Panel>
      </div>

      {/* ================================================
          FOOTER STATUS
      ================================================= */}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-rk-border py-5">
        <p className="rk-metadata">
          RENKOO live workspace
          {googleEmail ? ` · ${googleEmail}` : ''}
        </p>

        <p className="rk-metadata">
          Data window: {dateRange.startDate} →{' '}
          {dateRange.endDate}
        </p>
      </div>
    </AppShell>
  );
}

/*
 * ===========================================================
 * PULSE SIGNAL
 * ===========================================================
 */

function PulseSignal({
  label,
  value,
  detail,
  source,
  connected,
  spark,
}: {
  label: string;
  value: string;
  detail: string;
  source: string;
  connected: boolean;
  spark?: React.ReactNode;
}) {
  return (
    <div className="rk-surface-interactive group rounded-rk-lg border border-rk-border bg-rk-surface p-4 shadow-rk-sm">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${connected ? 'bg-rk-success' : 'bg-rk-border-strong'}`}
        />
        <p className="rk-label min-w-0 flex-1 truncate">
          {label}
        </p>
      </div>

      <p className="rk-number mt-2.5 truncate text-[26px] font-extrabold leading-none tracking-[-0.03em] text-rk-ink">
        {value}
      </p>

      <p className="rk-metadata mt-1.5 min-h-[2rem] leading-[1.5]">
        {detail}
      </p>

      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          {spark ? (
            <div aria-hidden>{spark}</div>
          ) : (
            <span className="rk-metadata">—</span>
          )}
        </div>
        <DataSourceBadge
          source={source}
          connected={connected}
        />
      </div>
    </div>
  );
}

/*
 * ===========================================================
 * SEARCH METRIC
 * ===========================================================
 */

function SearchMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-rk-md border border-rk-border bg-rk-surface p-3">
      <p className="rk-label flex items-center gap-1.5">
        <span aria-hidden className="text-rk-muted">
          {icon}
        </span>
        {label}
      </p>

      <p className="rk-number mt-2 truncate text-xl font-bold text-rk-ink">
        {value}
      </p>
    </div>
  );
}

/*
 * ===========================================================
 * ACTION STAT
 * ===========================================================
 */

function ActionStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-rk-md border border-rk-border bg-rk-surface p-3 text-center">
      <p className="rk-label">{label}</p>
      <p className="rk-number mt-1 text-xl font-bold text-rk-ink">
        {value}
      </p>
    </div>
  );
}

/*
 * ===========================================================
 * COMPARISON SUMMARY — defensive, real data only
 * ===========================================================
 */

function ComparisonSummary({ comparison }: { comparison: any }) {
  const summary =
    comparison?.summary ?? comparison?.comparison ?? null;

  const ourWins =
    summary?.ourWins ?? comparison?.ourWins ?? null;
  const competitorWins =
    summary?.competitorWins ??
    comparison?.competitorWins ??
    null;
  const equal = summary?.equal ?? comparison?.equal ?? null;
  const gaps =
    summary?.totalPageGaps ??
    comparison?.totalPageGaps ??
    comparison?.totalGaps ??
    null;

  const numbers = [ourWins, competitorWins, equal, gaps].filter(
    (v) => typeof v === 'number',
  );

  if (numbers.length === 0) {
    return (
      <p className="rk-metadata">
        Comparison loaded but carries no countable gap
        summary — open the Competitor War Room for page-level
        evidence.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1">
      {typeof ourWins === 'number' && (
        <span className="text-xs text-rk-secondary">
          Workspace ahead:{' '}
          <strong className="text-rk-ink">{ourWins}</strong>
        </span>
      )}
      {typeof competitorWins === 'number' && (
        <span className="text-xs text-rk-secondary">
          Competitor ahead:{' '}
          <strong className="text-rk-ink">
            {competitorWins}
          </strong>
        </span>
      )}
      {typeof equal === 'number' && (
        <span className="text-xs text-rk-secondary">
          Equal: <strong className="text-rk-ink">{equal}</strong>
        </span>
      )}
      {typeof gaps === 'number' && (
        <span className="text-xs text-rk-secondary">
          Page gaps:{' '}
          <strong className="text-rk-ink">{gaps}</strong>
        </span>
      )}
    </div>
  );
}

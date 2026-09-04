'use client';

import Link from 'next/link';

import { useEffect, useMemo, useState } from 'react';

import {
  Menu,
  Search,
  Bell,
  ArrowUpRight,
  AlertTriangle,
  Sparkles,
  Globe2,
  ChevronDown,
  RefreshCw,
  CheckCircle2,
  Users,
  MousePointerClick,
  Eye,
  Target,
  Activity,
} from 'lucide-react';

import Sidebar from '../components/Sidebar';

import {
  getWebsites,
  getLatestCrawlSummary,
  getGoogleConnectionStatus,
  getGoogleAnalytics,
  getGoogleQueries,
  getGoogleAnalyticsReport,
  getTechnicalSeoLatest,
  getUnifiedOpportunities,
  
  getActions,createActionFromRecommendation,
  Website,
  CrawlSummary,
  GoogleAnalytics,
  GoogleQueriesResponse,
  GoogleAnalyticsReport,
  GoogleAnalyticsRow,
  GoogleAnalyticsReportRow,
  TechnicalSeoResponse,
  UnifiedOpportunity,
} from '../lib/api';

/*
 * =========================================================
 * DATE HELPERS
 * =========================================================
 */

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

/*
 * =========================================================
 * COMPONENT
 * =========================================================
 */

export default function Home() {
  const [open, setOpen] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState<boolean>(false);

  /*
   * =======================================================
   * WEBSITE
   * =======================================================
   */

  const [websites, setWebsites] = useState<Website[]>([]);

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
  const [actionsError, setActionsError] = useState<string | null>(null);

  const [selectedWebsite, setSelectedWebsite] =
    useState<Website | null>(null);
  useEffect(() => {
    if (!selectedWebsite?.id) {
      setActionsSummary({ high: 0, medium: 0, low: 0, todo: 0, inProgress: 0, done: 0 });
      return;
    }

    let cancelled = false;

    async function loadActions() {
      setActionsLoading(true);
      setActionsError(null);
      try {
        const response = await getActions();
        if (!cancelled) {
          setActionsSummary(response.summary);
        }
      } catch (error) {
        if (!cancelled) {
          setActionsError(error instanceof Error ? error.message : 'Unable to load actions.');
          setActionsSummary({ high: 0, medium: 0, low: 0, todo: 0, inProgress: 0, done: 0 });
        }
      } finally {
        if (!cancelled) setActionsLoading(false);
      }
    }

    loadActions();
    return () => { cancelled = true; };
  }, [selectedWebsite?.id]);

  useEffect(() => {
    if (!selectedWebsite?.id) {
      setOpportunities([]);
      return;
    }

    let cancelled = false;

    async function loadOpportunities() {
      setOpportunitiesLoading(true);
      setOpportunitiesError(null);

      try {
        const websiteId = selectedWebsite?.id;

        if (!websiteId) {
          setOpportunities([]);
          setOpportunitiesLoading(false);
          return;
        }

        const response =
          await getUnifiedOpportunities(websiteId);

        if (!cancelled) {
          setOpportunities(
            Array.isArray(response.opportunities)
              ? response.opportunities
              : [],
          );
        }
      } catch (error) {
        if (!cancelled) {
          setOpportunitiesError(
            error instanceof Error
              ? error.message
              : 'Unable to load growth opportunities.',
          );
          setOpportunities([]);
        }
      } finally {
        if (!cancelled) {
          setOpportunitiesLoading(false);
        }
      }
    }

    loadOpportunities();

    return () => {
      cancelled = true;
    };
  }, [selectedWebsite?.id]);

  const [loadingWebsites, setLoadingWebsites] =
    useState(true);

  const [websiteError, setWebsiteError] =
    useState('');

  const [showWebsiteMenu, setShowWebsiteMenu] =
    useState(false);

  /*
   * =======================================================
   * TECHNICAL SEO
   * =======================================================
   */

  const [seoSummary, setSeoSummary] =
    useState<CrawlSummary | null>(null);

  const [technicalSeo, setTechnicalSeo] =
    useState<TechnicalSeoResponse | null>(null);

  const [loadingSeo, setLoadingSeo] =
    useState(false);

  const [seoError, setSeoError] =
    useState('');

  /*
   * =======================================================
   * GOOGLE CONNECTION
   * =======================================================
   */

  const [googleConnected, setGoogleConnected] =
    useState(false);

  const [googleEmail, setGoogleEmail] =
    useState<string | null>(null);

  const [selectedSearchProperty, setSelectedSearchProperty] =
    useState<string | null>(null);

  const [selectedAnalyticsProperty, setSelectedAnalyticsProperty] =
    useState<string | null>(null);

  /*
   * =======================================================
   * GOOGLE SEARCH CONSOLE
   * =======================================================
   */

  const [searchAnalytics, setSearchAnalytics] =
    useState<GoogleAnalytics | null>(null);

  const [searchQueries, setSearchQueries] =
    useState<GoogleQueriesResponse | null>(null);

  const [loadingSearchAnalytics, setLoadingSearchAnalytics] =
    useState(false);

  const [searchAnalyticsError, setSearchAnalyticsError] =
    useState('');

  /*
   * =======================================================
   * GOOGLE ANALYTICS 4
   * =======================================================
   */

  const [ga4Report, setGa4Report] =
    useState<GoogleAnalyticsReport | null>(null);

  const [loadingGa4, setLoadingGa4] =
    useState(false);

  const [ga4Error, setGa4Error] =
    useState('');

  /*
   * =======================================================
   * GLOBAL REFRESH
   * =======================================================
   */

  const [refreshing, setRefreshing] =
    useState(false);

  /*
   * =========================================================
   * DATE RANGE
   * =========================================================
   */

  const dateRange = useMemo(
    () => getDateRange(),
    [],
  );

  /*
   * =========================================================
   * LOAD WEBSITES
   * =========================================================
   */

  async function loadWebsites() {
    try {
      setLoadingWebsites(true);
      setWebsiteError('');

      const token =
        localStorage.getItem(
          'renkoo_access_token',
        );

      if (!token) {
        setWebsiteError(
          'Please login to RENKOO first.',
        );

        setWebsites([]);
        setSelectedWebsite(null);

        return;
      }

      const data =
        await getWebsites();

      setWebsites(data);

      if (data.length > 0) {
        setSelectedWebsite((current) => {
          if (current) {
            const sameWebsite =
              data.find(
                (website) =>
                  website.id ===
                  current.id,
              );

            return (
              sameWebsite ??
              data[0]
            );
          }

          return data[0];
        });
      } else {
        setSelectedWebsite(null);
      }
    } catch (error) {
      console.error(
        'Failed to load websites:',
        error,
      );

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
   * LOAD SEO DATA
   * =========================================================
   */

  async function loadSeoData(
    websiteId: string,
  ) {
    try {
      setLoadingSeo(true);
      setSeoError('');

      /*
       * Load latest crawl summary and
       * detailed technical SEO independently.
       *
       * One failure should not destroy the
       * whole dashboard.
       */

      const [
        summaryResult,
        technicalResult,
      ] = await Promise.allSettled([
        getLatestCrawlSummary(
          websiteId,
        ),

        getTechnicalSeoLatest(
          websiteId,
        ),
      ]);

      if (
        summaryResult.status ===
        'fulfilled'
      ) {
        setSeoSummary(
          summaryResult.value,
        );
      } else {
        setSeoSummary(null);
      }

      if (
        technicalResult.status ===
        'fulfilled'
      ) {
        setTechnicalSeo(
          technicalResult.value,
        );
      } else {
        setTechnicalSeo(null);
      }

      if (
        summaryResult.status ===
          'rejected' &&
        technicalResult.status ===
          'rejected'
      ) {
        setSeoError(
          'No completed SEO audit found.',
        );
      }
    } catch (error) {
      console.error(
        'Failed to load SEO data:',
        error,
      );

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
   * LOAD GOOGLE STATUS
   * =========================================================
   */

  async function loadGoogleStatus() {
    try {
      const connection =
        await getGoogleConnectionStatus();

      setGoogleConnected(
        Boolean(
          connection.connected,
        ),
      );

      setGoogleEmail(
        connection.googleEmail ??
          null,
      );

      setSelectedSearchProperty(
        connection.selectedProperty ??
          null,
      );

      setSelectedAnalyticsProperty(
        connection.selectedAnalyticsProperty ??
          null,
      );

      return connection;
    } catch (error) {
      console.error(
        'Failed to load Google status:',
        error,
      );

      setGoogleConnected(false);
      setGoogleEmail(null);
      setSelectedSearchProperty(null);
      setSelectedAnalyticsProperty(null);

      return null;
    }
  }

  /*
   * =========================================================
   * LOAD SEARCH CONSOLE DATA
   * =========================================================
   */

async function loadSearchAnalytics(
  connected?: boolean,
  property?: string | null,
) {
  try {
    setLoadingSearchAnalytics(true);
    setSearchAnalyticsError('');

    const isConnected =
      connected ??
      googleConnected;

    const activeProperty =
      property ??
      selectedSearchProperty;

    if (
      !isConnected ||
      !activeProperty
    ) {
      setSearchAnalytics(null);
      setSearchQueries(null);
      return;
    }

    /*
     * Load Search Console overview metrics
     * and actual search queries separately.
     *
     * /google/analytics
     *   -> date-based performance rows
     *
     * /google/queries
     *   -> actual Google search queries
     */

    const [
      analyticsData,
      queriesData,
    ] = await Promise.all([
      getGoogleAnalytics(
        dateRange.startDate,
        dateRange.endDate,
      ),

      getGoogleQueries(
        dateRange.startDate,
        dateRange.endDate,
      ),
    ]);

    setSearchAnalytics(
      analyticsData,
    );

    setSearchQueries(
      queriesData,
    );
  } catch (error) {
    console.error(
      'Failed to load Search Console data:',
      error,
    );

    /*
     * Keep the two datasets independent
     * as much as possible.
     */

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
   * LOAD GA4 DATA
   * =========================================================
   */

  async function loadGa4Data(
    connected?: boolean,
    property?: string | null,
  ) {
    try {
      setLoadingGa4(true);
      setGa4Error('');

      const isConnected =
        connected ?? googleConnected;

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
      console.error(
        'Failed to load GA4 report:',
        error,
      );

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
   * LOAD ALL DASHBOARD DATA
   * =========================================================
   */

  async function loadDashboardData() {
    setRefreshing(true);

    try {
      const connection = await loadGoogleStatus();

      await Promise.all([
        selectedWebsite?.id
          ? loadSeoData(selectedWebsite.id)
          : Promise.resolve(),

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
   * INITIAL LOAD
   * =========================================================
   */

  useEffect(() => {
    loadWebsites();
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
      return;
    }

    loadSeoData(
      selectedWebsite.id,
    );
  }, [
    selectedWebsite?.id,
  ]);

  /*
   * =========================================================
   * GOOGLE INITIAL LOAD
   * =========================================================
   */

  useEffect(() => {
    async function initializeGoogle() {
      const connection =
        await loadGoogleStatus();

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
  }, []);

  /*
   * =========================================================
   * DERIVED SEO VALUES
   * =========================================================
   */

  const seoScore =
    seoSummary?.score ??
    technicalSeo?.score?.value ??
    null;

  const scoreLabel =
    seoScore === null
      ? 'No audit yet'
      : seoScore >= 80
        ? 'Healthy'
        : seoScore >= 60
          ? 'Needs attention'
          : 'Critical attention required';

  const scoreClass =
    seoScore === null
      ? 'text-slate-400'
      : seoScore >= 80
        ? 'text-emerald-600'
        : seoScore >= 60
          ? 'text-orange-600'
          : 'text-red-600';

  const openIssues =
    seoSummary?.open ??
    technicalSeo?.issues.open ??
    null;

  const criticalIssues =
    seoSummary?.critical ??
    technicalSeo?.issues.critical ??
    null;

  const highIssues =
    seoSummary?.high ??
    technicalSeo?.issues.high ??
    null;

  const mediumIssues =
    seoSummary?.medium ??
    technicalSeo?.issues.medium ??
    null;

  const crawledPages =
    seoSummary?.pages ??
    technicalSeo?.pages.total ??
    null;

  /*
   * =========================================================
   * REAL SEARCH METRICS
   * =========================================================
   */

  const searchClicks =
    searchAnalytics?.clicks ??
    0;

  const searchImpressions =
    searchAnalytics?.impressions ??
    0;

  const searchCtr =
    searchAnalytics?.ctr ??
    0;

  const searchPosition =
    searchAnalytics?.averagePosition ??
    0;

  /*
   * =========================================================
   * REAL GA4 METRICS
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

    const rows =
      ga4Report.rows;

    const total =
      rows.reduce(
        (acc: any, row: GoogleAnalyticsReportRow) => {
          acc.activeUsers +=
            row.activeUsers ?? 0;

          acc.newUsers +=
            row.newUsers ?? 0;

          acc.sessions +=
            row.sessions ?? 0;

          acc.pageViews +=
            row.pageViews ?? 0;

          acc.conversions +=
            row.conversions ?? 0;

          acc.averageSessionDuration +=
            row.averageSessionDuration ??
            0;

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

    const totalSessions =
      rows.reduce(
        (
          sum: number,
          row: GoogleAnalyticsReportRow,
        ) =>
          sum +
          (row.sessions ?? 0),
        0,
      );

    const weightedEngagement =
      totalSessions > 0
        ? rows.reduce(
            (
              sum: number,
              row: GoogleAnalyticsReportRow,
            ) =>
              sum +
              (row.engagementRate ??
                0) *
                (row.sessions ??
                  0),
            0,
          ) /
          totalSessions
        : 0;

    total.engagementRate =
      weightedEngagement;

    total.averageSessionDuration =
      rows.length > 0
        ? total.averageSessionDuration /
          rows.length
        : 0;

    return total;
  }, [
    ga4Report,
  ]);

  /*
   * =========================================================
   * SEARCH CHART
   * =========================================================
   */

  const searchChart =
    useMemo(() => {
      const rows =
        searchAnalytics?.rows ??
        [];

      if (!rows.length) {
        return [];
      }

      const values =
        rows.map(
          (row) =>
            Number(
              row.impressions ??
                0,
            ),
        );

      const max =
        Math.max(
          ...values,
          1,
        );

      return rows
        .slice(-14)
        .map(
          (row) => ({
            date:
              row.keys?.[0] ??
              '',
            impressions:
              row.impressions ??
              0,
            height: Math.max(
              8,
              ((row.impressions ??
                0) /
                max) *
                100,
            ),
          }),
        );
    }, [
      searchAnalytics,
    ]);

  /*
   * =========================================================
   * TOP SEARCH QUERIES
   * =========================================================
   */

  const topQueries =
    useMemo(() => {
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
   * TECHNICAL TOP ISSUES
   * =========================================================
   */

  const technicalIssues =
    technicalSeo?.topIssues
      ?.slice(0, 6) ??
    [];

  /*
   * =========================================================
   * GROWTH OPPORTUNITIES
   * =========================================================
   */

  const topOpportunities =
    useMemo(
      () =>
        opportunities
          .filter(
            (item) =>
              item.status !== 'DISMISSED' &&
              item.status !== 'COMPLETED',
          )
          .slice(0, 5),
      [opportunities],
    );
  /*
   * =========================================================
   * RENDER
   * =========================================================
   */

  return (
    <div className="rk-app min-h-screen text-slate-900">
      <Sidebar
        mobileOpen={open}
        onClose={() =>
          setOpen(false)
        }
      />

      <main className="rk-main lg:pl-[270px]">
        {/* HEADER */}

        <header className="rk-topbar sticky top-0 z-30 flex h-[72px] items-center border-b px-5 backdrop-blur lg:px-8">
          <button
            className="lg:hidden"
            onClick={() =>
              setOpen(true)
            }
            aria-label="Open menu"
          >
            <Menu />
          </button>

          <div className="ml-4 hidden w-full max-w-[420px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-400 lg:flex">
            <Search size={17} />

            <span>
              Search anything...
            </span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={
                loadDashboardData
              }
              disabled={
                refreshing
              }
              className="rounded-xl border border-slate-200 bg-white p-2 transition hover:bg-slate-50 disabled:opacity-50"
              aria-label="Refresh dashboard"
            >
              <RefreshCw
                size={17}
                className={
                  refreshing
                    ? 'animate-spin'
                    : ''
                }
              />
            </button>

            <button
              className="hidden rounded-xl border border-slate-200 bg-white p-2 hover:bg-slate-50 sm:block"
              aria-label="Notifications"
            >
              <Bell size={17} />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAccountMenu((value) => !value)}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold transition hover:border-slate-300 hover:bg-slate-50"
                aria-haspopup="menu"
                aria-expanded={showAccountMenu}
              >
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-slate-900 text-xs font-bold text-white">
                  B
                </div>

                <span className="hidden sm:block">
                  Business Owner
                </span>

                <ChevronDown
                  size={15}
                  className={`text-slate-400 transition-transform ${
                    showAccountMenu ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {showAccountMenu && (
                <div
                  role="menu"
                  className="absolute right-0 top-12 z-[60] w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"
                >
                  <div className="border-b border-slate-100 px-3 py-2.5">
                    <div className="text-sm font-semibold text-slate-900">
                      Business Owner
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      RENKOO workspace
                    </div>
                  </div>

                  <Link
                    href="/settings"
                    onClick={() => setShowAccountMenu(false)}
                    className="mt-1 flex items-center rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    role="menuitem"
                  >
                    Account & Settings
                  </Link>

                  <Link
                    href="/billing"
                    onClick={() => setShowAccountMenu(false)}
                    className="flex items-center rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    role="menuitem"
                  >
                    Billing & Plan
                  </Link>

                  <Link
                    href="/integrations"
                    onClick={() => setShowAccountMenu(false)}
                    className="flex items-center rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    role="menuitem"
                  >
                    Integrations
                  </Link>

                  <button
                    type="button"
                    onClick={() => {
                      localStorage.removeItem('renkoo_access_token');
                      localStorage.removeItem('accessToken');
                      localStorage.removeItem('token');
                      window.location.href = '/login';
                    }}
                    className="mt-1 flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50"
                    role="menuitem"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <section className="rk-dashboard mx-auto max-w-[1600px] p-5 lg:p-8">
          {/* PAGE HEADING */}

          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">
                Growth Command Center 👋
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Your highest-priority growth signals, opportunities, and actions in one place.
              </p>
            </div>

            {/* WEBSITE SWITCHER */}

            <div className="relative w-full xl:w-[360px]">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Active Website
              </div>

              {loadingWebsites ? (
                <div className="flex h-[58px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 shadow-sm">
                  <RefreshCw
                    size={18}
                    className="animate-spin text-slate-700"
                  />

                  <div>
                    <div className="text-sm font-semibold">
                      Loading workspace...
                    </div>

                    <div className="text-xs text-slate-400">
                      Fetching connected websites
                    </div>
                  </div>
                </div>
              ) : websiteError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                  <div className="text-sm font-semibold text-red-700">
                    Workspace unavailable
                  </div>

                  <div className="mt-1 text-xs leading-5 text-red-600">
                    {websiteError}
                  </div>

                  <button
                    onClick={
                      loadWebsites
                    }
                    className="mt-3 flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
                  >
                    <RefreshCw
                      size={14}
                    />

                    Retry
                  </button>
                </div>
              ) : websites.length ===
                0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="text-sm font-semibold text-amber-800">
                    No website connected
                  </div>

                  <div className="mt-1 text-xs leading-5 text-amber-700">
                    Connect your first website to start using RENKOO.
                  </div>
                </div>
              ) : (
                <>
                  <button
                    onClick={() =>
                      setShowWebsiteMenu(
                        (value) =>
                          !value,
                      )
                    }
                    className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm hover:border-blue-300 hover:shadow"
                  >
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-50 text-slate-700">
                      <Globe2
                        size={19}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">
                        {
                          selectedWebsite?.name
                        }
                      </div>

                      <div className="truncate text-xs text-slate-500">
                        {
                          selectedWebsite?.url
                        }
                      </div>
                    </div>

                    <ChevronDown
                      size={18}
                      className={`shrink-0 text-slate-400 transition-transform ${
                        showWebsiteMenu
                          ? 'rotate-180'
                          : ''
                      }`}
                    />
                  </button>

                  {showWebsiteMenu && (
                    <div className="absolute left-0 right-0 top-[82px] z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                      {websites.map(
                        (
                          website,
                        ) => (
                          <button
                            key={
                              website.id
                            }
                            onClick={() => {
                              setSelectedWebsite(
                                website,
                              );

                              setShowWebsiteMenu(
                                false,
                              );
                            }}
                            className={`flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-slate-50 ${
                              selectedWebsite?.id ===
                              website.id
                                ? 'bg-slate-50'
                                : ''
                            }`}
                          >
                            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                              <Globe2
                                size={17}
                              />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold">
                                {
                                  website.name
                                }
                              </div>

                              <div className="truncate text-xs text-slate-500">
                                {
                                  website.url
                                }
                              </div>
                            </div>

                            {selectedWebsite?.id ===
                              website.id && (
                              <div className="text-xs font-bold text-slate-700">
                                Active
                              </div>
                            )}
                          </button>
                        ),
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ACTIVE WEBSITE */}

          {selectedWebsite && (
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
              <div>
                <div className="text-xs font-medium text-slate-700">
                  RENKOO WORKSPACE
                </div>

                <div className="mt-1 text-sm font-bold">
                  {
                    selectedWebsite.name
                  }
                </div>
              </div>

              <div className="hidden h-8 w-px bg-blue-200 sm:block" />

              <div>
                <div className="text-xs text-slate-500">
                  Website
                </div>

                <div className="mt-1 text-sm font-medium text-slate-700">
                  {
                    selectedWebsite.url
                  }
                </div>
              </div>

              {selectedWebsite.industry && (
                <>
                  <div className="hidden h-8 w-px bg-blue-200 sm:block" />

                  <div>
                    <div className="text-xs text-slate-500">
                      Industry
                    </div>

                    <div className="mt-1 text-sm font-medium text-slate-700">
                      {
                        selectedWebsite.industry
                      }
                    </div>
                  </div>
                </>
              )}

              {selectedWebsite.country && (
                <>
                  <div className="hidden h-8 w-px bg-blue-200 sm:block" />

                  <div>
                    <div className="text-xs text-slate-500">
                      Country
                    </div>

                    <div className="mt-1 text-sm font-medium text-slate-700">
                      {
                        selectedWebsite.country
                      }
                    </div>
                  </div>
                </>
              )}

              <div className="ml-auto flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-emerald-600 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />

                Connected
              </div>
            </div>
          )}

          {/* DESCRIPTION */}

          <div className="mt-7">
            <p className="text-sm text-slate-500">
              RENKOO growth overview for{' '}
              <span className="font-semibold text-slate-700">
                {
                  selectedWebsite?.name ??
                  'your business'
                }
              </span>
              .
            </p>
          </div>

          {/* =====================================================
              CORE SEO METRICS
          ====================================================== */}

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              title="Organic Growth Health"
              value={
                loadingSeo
                  ? '...'
                  : seoScore !==
                      null
                    ? `${seoScore}/100`
                    : '-'
              }
              subtitle={
                loadingSeo
                  ? 'Loading latest crawl...'
                  : scoreLabel
              }
              valueClassName={
                scoreClass
              }
            />

            <MetricCard
              title="Crawled Pages"
              value={
                loadingSeo
                  ? '...'
                  : crawledPages ??
                    '-'
              }
              subtitle={
                crawledPages !==
                null
                  ? 'Latest completed crawl'
                  : 'Run an SEO audit first'
              }
            />

            <MetricCard
              title="Open Issues"
              value={
                loadingSeo
                  ? '...'
                  : openIssues ??
                    '-'
              }
              subtitle="Current SEO issues"
            />

            <MetricCard
              title="GSC Clicks"
              value={
                loadingSearchAnalytics
                  ? '...'
                  : searchAnalytics
                    ? searchClicks
                    : '-'
              }
              subtitle={
                searchAnalytics
                  ? 'Last 28 days'
                  : 'Connect Search Console'
              }
              valueClassName="text-slate-700"
            />

            <MetricCard
              title="GA4 Users"
              value={
                loadingGa4
                  ? '...'
                  : ga4Report
                    ? ga4Totals.activeUsers
                    : '-'
              }
              subtitle={
                ga4Report
                  ? 'Last 28 days'
                  : 'Connect Google Analytics'
              }
              valueClassName="text-violet-600"
            />
          </div>

          {/* SEO STATUS */}

          {seoError && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
              <span className="font-semibold text-amber-800">
                SEO audit status:
              </span>{' '}
              {seoError}
            </div>
          )}

          {/* GOOGLE CONNECTION STATUS */}

          {googleConnected && (
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2
                  size={15}
                />

                Google connected
              </div>

              {googleEmail && (
                <span>
                  {googleEmail}
                </span>
              )}

              {selectedSearchProperty && (
                <span>
                  GSC:{' '}
                  {
                    selectedSearchProperty
                  }
                </span>
              )}

              {selectedAnalyticsProperty && (
                <span>
                  GA4:{' '}
                  {
                    selectedAnalyticsProperty
                  }
                </span>
              )}
            </div>
          )}

          {/* =====================================================
              REAL SEARCH + GA4
          ====================================================== */}

          <div className="mt-6 grid gap-5 xl:grid-cols-2">
            {/* SEARCH VISIBILITY */}

            <Panel
              title="Search Intelligence"
            >
              {!searchAnalytics ? (
                <EmptyState
                  loading={
                    loadingSearchAnalytics
                  }
                  title="Search performance isn't connected yet"
                  description={
                    searchAnalyticsError ||
                    'Connect Search Console to unlock clicks, queries and growth opportunities.'
                  }
                  actionLabel="Connect Search Console"
                  actionHref="/integrations"
                />
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <MiniMetric
                      icon={
                        <MousePointerClick
                          size={15}
                        />
                      }
                      label="Clicks"
                      value={
                        searchClicks
                      }
                    />

                    <MiniMetric
                      icon={
                        <Eye
                          size={15}
                        />
                      }
                      label="Impressions"
                      value={
                        searchImpressions
                      }
                    />

                    <MiniMetric
                      icon={
                        <Target
                          size={15}
                        />
                      }
                      label="CTR"
                      value={`${(
                        searchCtr *
                        100
                      ).toFixed(
                        2,
                      )}%`}
                    />

                    <MiniMetric
                      icon={
                        <Activity
                          size={15}
                        />
                      }
                      label="Position"
                      value={
                        searchPosition.toFixed(
                          1,
                        )
                      }
                    />
                  </div>

                  <div className="rk-chart mt-5 h-44 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                    {searchChart.length ===
                    0 ? (
                      <div className="grid h-full place-items-center text-xs text-slate-400">
                        No daily Search Console rows available.
                      </div>
                    ) : (
                      <div className="flex h-full items-end gap-1.5">
                        {searchChart.map(
                          (
                            point,
                            index,
                          ) => (
                            <div
                              key={
                                `${point.date}-${index}`
                              }
                              className="group relative flex h-full flex-1 items-end"
                            >
                              <div
                                className="w-full rounded-t-md bg-slate-900/80 transition-all duration-200 hover:bg-slate-900"
                                style={{
                                  height: `${point.height}%`,
                                }}
                                title={`${point.date}: ${point.impressions} impressions`}
                              />
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex justify-between text-[10px] text-slate-400">
                    <span>
                      {
                        dateRange.startDate
                      }
                    </span>

                    <span>
                      {
                        dateRange.endDate
                      }
                    </span>
                  </div>
                </>
              )}
            </Panel>

            {/* GA4 */}

            <Panel
              title="Traffic & Analytics"
            >
              {!ga4Report ? (
                <EmptyState
                  loading={
                    loadingGa4
                  }
                  title="Analytics isn't connected yet"
                  description={
                    ga4Error ||
                    'Connect Google Analytics to measure traffic, engagement and conversions.'
                  }
                  actionLabel="Connect Google Analytics"
                  actionHref="/integrations"
                />
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <MiniMetric
                      icon={
                        <Users
                          size={15}
                        />
                      }
                      label="Active Users"
                      value={
                        ga4Totals.activeUsers
                      }
                    />

                    <MiniMetric
                      icon={
                        <Activity
                          size={15}
                        />
                      }
                      label="Sessions"
                      value={
                        ga4Totals.sessions
                      }
                    />

                    <MiniMetric
                      icon={
                        <Eye
                          size={15}
                        />
                      }
                      label="Page Views"
                      value={
                        ga4Totals.pageViews
                      }
                    />

                    <MiniMetric
                      icon={
                        <Target
                          size={15}
                        />
                      }
                      label="Conversions"
                      value={
                        ga4Totals.conversions
                      }
                    />
                  </div>

                  <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">
                        Engagement Rate
                      </span>

                      <span className="text-sm font-bold text-violet-600">
                        {(
                          ga4Totals.engagementRate *
                          100
                        ).toFixed(
                          1,
                        )}
                        %
                      </span>
                    </div>

                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-violet-500"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(
                              0,
                              ga4Totals.engagementRate *
                                100,
                            ),
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 text-xs text-slate-400">
                    {dateRange.startDate}{' '}
                    {'->'}{' '}
                    {dateRange.endDate}
                  </div>
                </>
              )}
            </Panel>

            {/* GROWTH OPPORTUNITIES */}

            <div className="xl:col-span-2">
              <Panel title="Priority Growth Opportunities">
              <div className="space-y-3">
                {opportunitiesLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((item) => (
                      <div
                        key={item}
                        className="animate-pulse rounded-xl border border-slate-100 p-4"
                      >
                        <div className="h-4 w-3/4 rounded bg-slate-100" />
                        <div className="mt-3 h-3 w-full rounded bg-slate-100" />
                        <div className="mt-2 h-3 w-2/3 rounded bg-slate-100" />
                      </div>
                    ))}
                  </div>
                ) : opportunitiesError ? (
                  <div className="rounded-xl border border-red-100 bg-red-50 p-4">
                    <p className="text-sm font-medium text-red-700">
                      Unable to load growth opportunities
                    </p>
                    <p className="mt-1 text-xs text-red-600">
                      {opportunitiesError}
                    </p>
                  </div>
                ) : topOpportunities.length === 0 ? (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-5 text-center">
                    <CheckCircle2
                      size={24}
                      className="mx-auto text-emerald-500"
                    />
                    <p className="mt-2 text-sm font-semibold text-slate-800">
                      No open growth opportunities
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      RENKOO will surface new opportunities as fresh data arrives.
                    </p>
                  </div>
                ) : (
                  topOpportunities.map((opportunity) => (
                    <div
                      key={opportunity.id}
                      className="group rounded-2xl border border-slate-200 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 rounded-lg bg-orange-50 p-2">
                          <AlertTriangle
                            size={16}
                            className="text-orange-500"
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">
                              {opportunity.title}
                            </p>

                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                              {opportunity.source.replaceAll('_', ' ')}
                            </span>

                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                opportunity.priority === 'HIGH'
                                  ? 'bg-red-50 text-red-600'
                                  : opportunity.priority === 'MEDIUM'
                                    ? 'bg-amber-50 text-amber-600'
                                    : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {opportunity.priority}
                            </span>
                          </div>

                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                            {opportunity.description}
                          </p>

                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                            <span>
                              Score <strong className="text-slate-800">{opportunity.score}</strong>
                            </span>

                            <span>•</span>

                            <span>
                              Impact <strong className="text-slate-800">{opportunity.impact || 'MEDIUM'}</strong>
                            </span>

                            <span>•</span>

                            <span>
                              Effort <strong className="text-slate-800">{opportunity.effort || 'MEDIUM'}</strong>
                            </span>
                          </div>

                          <div className="mt-3 rounded-lg bg-slate-50 p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                              Recommended action
                            </p>
                            <p className="mt-1 text-xs leading-5 text-slate-700">
                              {opportunity.recommendation}
                            </p>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-3">
                            {opportunity.pageUrl ? (
                              <a
                                href={opportunity.pageUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-medium text-slate-500 hover:text-slate-900"
                              >
                                View page →
                              </a>
                            ) : (
                              <span />
                            )}

                            {opportunity.source === 'SEO_AUDIT' ||
                            opportunity.source === 'CONTENT' ||
                            opportunity.source === 'AEO_AUDIT' ||
                            opportunity.source === 'GEO_AUDIT' ||
                            opportunity.source === 'BUSINESS_BRAIN' ? (
                              <button
                                type="button"
                                disabled={creatingActionId === opportunity.sourceId}
                                onClick={async () => {
                                  try {
                                    setCreatingActionId(opportunity.sourceId);

                                    await createActionFromRecommendation(
                                      opportunity.sourceId,
                                    );

                                    setOpportunities((current) =>
                                      current.map((item) =>
                                        item.id === opportunity.id
                                          ? {
                                              ...item,
                                              status: 'IN_PROGRESS',
                                            }
                                          : item,
                                      ),
                                    );
                                  } catch (error) {
                                    console.error(
                                      'RENKOO CREATE ACTION ERROR:',
                                      error,
                                    );
                                    setOpportunitiesError(
                                      error instanceof Error
                                        ? error.message
                                        : 'Unable to create action.',
                                    );
                                  } finally {
                                    setCreatingActionId(null);
                                  }
                                }}
                                className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {creatingActionId === opportunity.sourceId
                                  ? 'Creating...'
                                  : 'Create Action'}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              </Panel>
            </div>
          </div>

          {/* =====================================================
              TOP SEARCH QUERIES
          ====================================================== */}

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <Panel title="Top Search Queries">
              {!searchAnalytics && !searchQueries ? (
                <EmptyState
                  loading={
                    loadingSearchAnalytics
                  }
                  title="No Search Console data"
                  description="Select a Search Console property to see real queries."
                />
              ) : topQueries.length ===
                0 ? (
                <div className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
                  No search query data was returned for this period.
                </div>
              ) : (
                <div className="space-y-2">
                  {topQueries.map(
                    (
                      query,
                      index,
                    ) => (
                      <div
                        key={`${query.query}-${index}`}
                        className="flex items-center gap-3 rounded-xl border border-slate-100 p-3"
                      >
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-50 text-xs font-bold text-slate-700">
                          {index +
                            1}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">
                            {
                              query.query
                            }
                          </div>

                          <div className="mt-1 text-xs text-slate-400">
                            Position{' '}
                            {query.position.toFixed(
                              1,
                            )}{' '}
                            ·{' '}
                            {
                              query.impressions
                            }{' '}
                            impressions
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-sm font-bold">
                            {
                              query.clicks
                            }
                          </div>

                          <div className="text-[10px] text-slate-400">
                            clicks
                          </div>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              )}
            </Panel>

            {/* TECHNICAL ISSUES */}

            <Panel title="Technical SEO Priorities">
              {technicalIssues.length ===
              0 ? (
                <EmptyState
                  loading={
                    loadingSeo
                  }
                  title="No technical issues loaded"
                  description={
                    technicalSeo
                      ? 'No top issues were returned by the latest crawl.'
                      : 'Run a Technical SEO crawl to generate issue intelligence.'
                  }
                  actionLabel={
                    technicalSeo ? undefined : 'Run Technical SEO Audit'
                  }
                  actionHref={
                    technicalSeo ? undefined : '/technical-seo'
                  }
                />
              ) : (
                <div className="space-y-2">
                  {technicalIssues.map(
                    (
                      issue,
                      index,
                    ) => (
                      <div
                        key={
                          issue.id
                        }
                        className="flex items-center gap-3 rounded-xl border border-slate-100 p-3"
                      >
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-orange-50 text-xs font-bold text-orange-600">
                          {index +
                            1}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold uppercase text-orange-600">
                              {
                                issue.severity
                              }
                            </span>

                            <span className="text-[9px] font-bold uppercase text-slate-400">
                              {
                                issue.category
                              }
                            </span>
                          </div>

                          <div className="mt-1 truncate text-sm font-semibold">
                            {
                              issue.title
                            }
                          </div>

                          <div className="mt-1 truncate text-xs text-slate-400">
                            {
                              issue.page?.url
                            }
                          </div>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              )}
            </Panel>
          </div>

          {/* =====================================================
              INTELLIGENCE + BUSINESS IMPACT
          ====================================================== */}

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <Panel title="RENKOO Intelligence">
              <div className="rounded-xl bg-slate-50 p-5">
                <div className="flex gap-3">
                  <Sparkles
                    className="mt-1 shrink-0 text-slate-700"
                    size={20}
                  />

                  <div>
                    <h3 className="font-semibold">
                      {openIssues !==
                        null &&
                      openIssues >
                        0
                        ? `${openIssues} SEO issues need your attention`
                        : 'Your SEO workspace is ready'}
                    </h3>

                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      RENKOO combines your technical SEO crawl,
                      Google Search Console visibility and GA4
                      traffic signals to prioritize the next
                      growth actions.
                    </p>
                  </div>
                </div>

                <button className="mt-5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">
                  Ask RENKOO
                </button>
              </div>
            </Panel>

            <Panel title="Business Impact">
              {ga4Report ? (
                <>
                  <div className="text-sm text-slate-500">
                    Conversion signals
                  </div>

                  <div className="mt-3 text-4xl font-bold text-blue-900">
                    {
                      ga4Totals.conversions
                    }
                  </div>

                  <div className="mt-3 text-sm font-medium text-slate-500">
                    GA4 conversions in last 28 days
                  </div>

                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Actual revenue opportunity still requires
                    lead value or revenue data. RENKOO should not
                    invent a monetary estimate from traffic alone.
                  </p>
                </>
              ) : (
                <>
                  <div className="text-sm text-slate-500">
                    Estimated opportunity
                  </div>

                  <div className="mt-3 text-4xl font-bold text-blue-900">
                    -
                  </div>

                  <div className="mt-3 text-sm font-medium text-slate-500">
                    Awaiting GA4 / conversion data
                  </div>

                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Revenue opportunity will be calculated after
                    real traffic, conversion, lead and revenue
                    signals are connected.
                  </p>
                </>
              )}
            </Panel>
          </div>

          {/* =====================================================
              AI AGENTS
          ====================================================== */}

          <Panel
            title="RENKOO AI Agents Working for You"
            className="mt-5"
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {[
                'SEO Researcher',
                'Content Strategist',
                'Technical SEO',
                'AI Visibility',
                'Local SEO',
                'Report Generator',
              ].map(
                (
                  agent,
                ) => (
                  <div
                    key={agent}
                    className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-200 hover:shadow-sm"
                  >
                    <Sparkles
                      size={18}
                      className="text-slate-700"
                    />

                    <div className="mt-4 text-sm font-semibold">
                      {agent}
                    </div>

                    <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />

                      Ready
                    </div>
                  </div>
                ),
              )}
            </div>
          </Panel>
        </section>
      </main>
    </div>
  );
}

/*
 * ===========================================================
 * METRIC CARD
 * ===========================================================
 */

function MetricCard({
  title,
  value,
  subtitle,
  valueClassName = '',
}: {
  title: string;
  value: string | number;
  subtitle: string;
  valueClassName?: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
          {title}
        </div>

        <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-slate-300 transition-colors group-hover:bg-slate-900" />
      </div>

      <div
        className={`mt-4 text-[30px] font-bold leading-none tracking-[-0.04em] text-slate-950 ${valueClassName}`}
      >
        {value}
      </div>

      <div className="mt-3 text-xs font-medium text-slate-500">
        {subtitle}
      </div>

      <div className="mt-5 h-px w-full bg-slate-100" />

      <div className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
        Live workspace signal
      </div>
    </div>
  );
}

/*
 * ===========================================================
 * MINI METRIC
 * ===========================================================
 */

function MiniMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="group rounded-xl border border-slate-200 bg-white p-3.5 transition-all duration-200 hover:border-slate-300 hover:shadow-sm">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-50 text-slate-500 transition-colors group-hover:bg-slate-100 group-hover:text-slate-900">
          {icon}
        </span>

        <span>{label}</span>
      </div>

      <div className="mt-3 text-xl font-bold tracking-[-0.025em] text-slate-950">
        {value}
      </div>
    </div>
  );
}

/*
 * ===========================================================
 * EMPTY STATE
 * ===========================================================
 */

function EmptyState({
  loading,
  title,
  description,
  actionLabel,
  actionHref,
}: {
  loading: boolean;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5">
      <div className="flex items-start gap-3">
        {loading ? (
          <RefreshCw
            size={18}
            className="mt-0.5 animate-spin text-slate-700"
          />
        ) : (
          <AlertTriangle
            size={18}
            className="mt-0.5 text-slate-400"
          />
        )}

        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-800">
            {title}
          </div>

          <div className="mt-1 max-w-xl text-xs leading-5 text-slate-500">
            {description}
          </div>

          {actionLabel && actionHref && !loading && (
            <a
              href={actionHref}
              className="mt-4 inline-flex items-center rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
            >
              {actionLabel} ?
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/*
 * ===========================================================
 * PANEL
 * ===========================================================
 */

function Panel({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      <h2 className="mb-5 text-sm font-bold">
        {title}
      </h2>

      {children}
    </section>
  );
}





























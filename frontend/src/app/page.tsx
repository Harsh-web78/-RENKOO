'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Eye,
  Globe2,
  Menu,
  MousePointerClick,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';

import Sidebar from '../components/Sidebar';

import {
  getActions,
  getGoogleAnalytics,
  getGoogleAnalyticsReport,
  getGoogleConnectionStatus,
  getGoogleQueries,
  getLatestCrawlSummary,
  getTechnicalSeoLatest,
  getUnifiedOpportunities,
  getWebsites,
  createActionFromRecommendation,
  Website,
  CrawlSummary,
  GoogleAnalytics,
  GoogleQueriesResponse,
  GoogleAnalyticsReport,
  GoogleAnalyticsReportRow,
  TechnicalSeoResponse,
  UnifiedOpportunity,
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

export default function Home() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showWebsiteMenu, setShowWebsiteMenu] = useState(false);

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

  const [refreshing, setRefreshing] = useState(false);

  const dateRange = useMemo(() => getDateRange(), []);

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

      const isConnected =
        connected ?? googleConnected;

      const activeProperty =
        property ?? selectedSearchProperty;

      if (!isConnected || !activeProperty) {
        setSearchAnalytics(null);
        setSearchQueries(null);
        return;
      }

      const [analyticsData, queriesData] =
        await Promise.all([
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

      const isConnected =
        connected ?? googleConnected;

      const activeProperty =
        property ?? selectedAnalyticsProperty;

      if (!isConnected || !activeProperty) {
        setGa4Report(null);
        return;
      }

      const data =
        await getGoogleAnalyticsReport(
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
   * OPPORTUNITIES
   * =========================================================
   */

  async function loadOpportunities(websiteId: string) {
    try {
      setOpportunitiesLoading(true);
      setOpportunitiesError(null);

      const response =
        await getUnifiedOpportunities(websiteId);

      setOpportunities(
        Array.isArray(response.opportunities)
          ? response.opportunities
          : [],
      );
    } catch (error) {
      console.error(
        'Failed to load opportunities:',
        error,
      );

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
      console.error(
        'Failed to load actions:',
        error,
      );

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
   * INITIAL
   * =========================================================
   */

  useEffect(() => {
    loadWebsites();
    loadGoogleStatus();
    loadActions();
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
      return;
    }

    loadSeoData(selectedWebsite.id);
    loadOpportunities(selectedWebsite.id);
  }, [selectedWebsite?.id]);

  /*
   * =========================================================
   * GOOGLE INITIAL DATA
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
   * REFRESH
   * =========================================================
   */

  async function refreshDashboard() {
    setRefreshing(true);

    try {
      const connection =
        await loadGoogleStatus();

      await Promise.all([
        selectedWebsite?.id
          ? loadSeoData(selectedWebsite.id)
          : Promise.resolve(),

        selectedWebsite?.id
          ? loadOpportunities(selectedWebsite.id)
          : Promise.resolve(),

        loadActions(),

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
          : 'Critical attention';

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
   * SEARCH
   * =========================================================
   */

  const searchClicks =
    searchAnalytics?.clicks ?? 0;

  const searchImpressions =
    searchAnalytics?.impressions ?? 0;

  const searchCtr =
    searchAnalytics?.ctr ?? 0;

  const searchPosition =
    searchAnalytics?.averagePosition ?? 0;

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

    const total = rows.reduce((acc: { activeUsers: number; newUsers: number; sessions: number; pageViews: number; conversions: number; averageSessionDuration: number; engagementRate: number }, row: GoogleAnalyticsReportRow) => {
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

    const totalSessions = rows.reduce((sum: number, row: GoogleAnalyticsReportRow) =>
        sum + (row.sessions ?? 0),
      0,
    );

    total.engagementRate =
      totalSessions > 0
        ? rows.reduce((sum: number, row: GoogleAnalyticsReportRow) =>
              sum +
              (row.engagementRate ?? 0) *
                (row.sessions ?? 0),
            0,
          ) / totalSessions
        : 0;

    total.averageSessionDuration =
      rows.length > 0
        ? total.averageSessionDuration /
          rows.length
        : 0;

    return total;
  }, [ga4Report]);

  /*
   * =========================================================
   * SEARCH CHART
   * =========================================================
   */

  const searchChart = useMemo(() => {
    const rows =
      searchAnalytics?.rows ?? [];

    if (!rows.length) {
      return [];
    }

    const values = rows.map((row) =>
      Number(row.impressions ?? 0),
    );

    const max = Math.max(...values, 1);

    return rows
      .slice(-14)
      .map((row) => ({
        date: row.keys?.[0] ?? '',
        impressions: row.impressions ?? 0,
        height: Math.max(
          7,
          ((row.impressions ?? 0) / max) *
            100,
        ),
      }));
  }, [searchAnalytics]);

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

          if (
            b.impressions !==
            a.impressions
          ) {
            return (
              b.impressions -
              a.impressions
            );
          }

          return (
            a.position -
            b.position
          );
        })
        .slice(0, 5) ?? []
    );
  }, [searchQueries]);

  /*
   * =========================================================
   * ISSUES / OPPORTUNITIES
   * =========================================================
   */

  const technicalIssues =
    technicalSeo?.topIssues
      ?.slice(0, 5) ?? [];

  const topOpportunities =
    useMemo(
      () =>
        opportunities
          .filter(
            (item) =>
              item.status !==
                'DISMISSED' &&
              item.status !==
                'COMPLETED',
          )
          .slice(0, 4),
      [opportunities],
    );

  /*
   * =========================================================
   * RENDER
   * =========================================================
   */

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <Sidebar
        mobileOpen={mobileOpen}
        onClose={() =>
          setMobileOpen(false)
        }
      />

      <main className="lg:pl-[270px]">
        {/* =====================================================
            TOP BAR
        ====================================================== */}

        <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
          <div className="flex h-[68px] items-center gap-4 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() =>
                setMobileOpen(true)
              }
              className="rounded-lg border border-slate-200 p-2 lg:hidden"
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>

            <div className="hidden items-center gap-2 text-xs font-medium text-slate-400 sm:flex">
              <span className="text-slate-700">
                Growth
              </span>

              <span>/</span>

              <span>
                Command Center
              </span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                className="hidden h-9 w-[230px] items-center gap-2 border border-slate-200 bg-slate-50 px-3 text-xs text-slate-400 md:flex"
              >
                <Search size={15} />
                <span>
                  Search anything...
                </span>
                <span className="ml-auto border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-slate-400">
                  /
                </span>
              </button>

              <button
                type="button"
                onClick={refreshDashboard}
                disabled={refreshing}
                className="grid h-9 w-9 place-items-center border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                aria-label="Refresh dashboard"
              >
                <RefreshCw
                  size={15}
                  className={
                    refreshing
                      ? 'animate-spin'
                      : ''
                  }
                />
              </button>

              <button
                type="button"
                className="hidden h-9 w-9 place-items-center border border-slate-200 bg-white text-slate-600 sm:grid"
                aria-label="Notifications"
              >
                <Bell size={15} />
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() =>
                    setShowAccountMenu(
                      (value) => !value,
                    )
                  }
                  className="flex h-9 items-center gap-2 border border-slate-200 bg-white px-2.5 text-xs font-semibold"
                >
                  <span className="grid h-6 w-6 place-items-center bg-slate-950 text-[10px] font-bold text-white">
                    B
                  </span>

                  <span className="hidden sm:block">
                    Business Owner
                  </span>

                  <ChevronDown
                    size={13}
                    className={
                      showAccountMenu
                        ? 'rotate-180'
                        : ''
                    }
                  />
                </button>

                {showAccountMenu && (
                  <div className="absolute right-0 top-11 z-50 w-56 border border-slate-200 bg-white p-2 shadow-xl">
                    <div className="border-b border-slate-100 px-3 py-3">
                      <div className="text-xs font-bold">
                        Business Owner
                      </div>

                      <div className="mt-1 text-[10px] text-slate-400">
                        RENKOO workspace
                      </div>
                    </div>

                    <Link
                      href="/settings"
                      className="mt-1 block px-3 py-2.5 text-xs font-medium hover:bg-slate-50"
                      onClick={() =>
                        setShowAccountMenu(false)
                      }
                    >
                      Account & Settings
                    </Link>

                    <Link
                      href="/billing"
                      className="block px-3 py-2.5 text-xs font-medium hover:bg-slate-50"
                      onClick={() =>
                        setShowAccountMenu(false)
                      }
                    >
                      Billing & Plan
                    </Link>

                    <Link
                      href="/integrations"
                      className="block px-3 py-2.5 text-xs font-medium hover:bg-slate-50"
                      onClick={() =>
                        setShowAccountMenu(false)
                      }
                    >
                      Integrations
                    </Link>

                    <button
                      type="button"
                      onClick={() => {
                        localStorage.removeItem(
                          'renkoo_access_token',
                        );

                        localStorage.removeItem(
                          'accessToken',
                        );

                        localStorage.removeItem(
                          'token',
                        );

                        window.location.href =
                          '/login';
                      }}
                      className="mt-1 w-full px-3 py-2.5 text-left text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <section className="mx-auto max-w-[1540px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {/* =====================================================
              HERO
          ====================================================== */}

          <div className="flex flex-col gap-5 border-b border-slate-200 pb-7 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  <CircleDot size={10} />
                  Growth Operating System
                </span>

                <span className="h-px w-8 bg-slate-300" />

                <span className="text-[10px] font-semibold text-slate-400">
                  28 DAYS
                </span>
              </div>

              <h1 className="text-[30px] font-bold leading-tight tracking-[-0.04em] sm:text-[38px]">
                Growth Command Center
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Understand what is happening,
                why it matters, and what RENKOO
                recommends doing next.
              </p>
            </div>

            {/* WEBSITE SWITCHER */}

            <div className="relative w-full xl:w-[330px]">
              <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Active workspace
              </div>

              {loadingWebsites ? (
                <div className="flex h-[52px] items-center gap-3 border border-slate-200 bg-white px-3">
                  <RefreshCw
                    size={15}
                    className="animate-spin text-slate-400"
                  />

                  <span className="text-xs font-semibold text-slate-500">
                    Loading workspace...
                  </span>
                </div>
              ) : websiteError ? (
                <div className="border border-red-200 bg-red-50 p-3">
                  <div className="text-xs font-semibold text-red-700">
                    Workspace unavailable
                  </div>

                  <div className="mt-1 text-[11px] text-red-600">
                    {websiteError}
                  </div>

                  <button
                    type="button"
                    onClick={loadWebsites}
                    className="mt-2 text-[10px] font-bold text-red-700 underline"
                  >
                    Retry
                  </button>
                </div>
              ) : websites.length === 0 ? (
                <div className="border border-amber-200 bg-amber-50 p-3">
                  <div className="text-xs font-semibold text-amber-800">
                    No website connected
                  </div>

                  <Link
                    href="/integrations"
                    className="mt-1 block text-[11px] text-amber-700 underline"
                  >
                    Connect your first website
                  </Link>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setShowWebsiteMenu(
                        (value) => !value,
                      )
                    }
                    className="flex h-[52px] w-full items-center gap-3 border border-slate-200 bg-white px-3 text-left transition hover:border-slate-400"
                  >
                    <div className="grid h-8 w-8 shrink-0 place-items-center bg-slate-950 text-white">
                      <Globe2 size={15} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-bold">
                        {selectedWebsite?.name}
                      </div>

                      <div className="mt-0.5 truncate text-[10px] text-slate-400">
                        {selectedWebsite?.url}
                      </div>
                    </div>

                    <ChevronDown
                      size={15}
                      className={
                        showWebsiteMenu
                          ? 'rotate-180 text-slate-900'
                          : 'text-slate-400'
                      }
                    />
                  </button>

                  {showWebsiteMenu && (
                    <div className="absolute left-0 right-0 top-[67px] z-50 border border-slate-200 bg-white p-1.5 shadow-xl">
                      {websites.map(
                        (website) => (
                          <button
                            type="button"
                            key={website.id}
                            onClick={() => {
                              setSelectedWebsite(
                                website,
                              );

                              setShowWebsiteMenu(
                                false,
                              );
                            }}
                            className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50 ${
                              selectedWebsite?.id ===
                              website.id
                                ? 'bg-slate-50'
                                : ''
                            }`}
                          >
                            <div className="grid h-7 w-7 place-items-center bg-slate-100">
                              <Globe2
                                size={13}
                                className="text-slate-600"
                              />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-semibold">
                                {website.name}
                              </div>

                              <div className="truncate text-[10px] text-slate-400">
                                {website.url}
                              </div>
                            </div>

                            {selectedWebsite?.id ===
                              website.id && (
                              <CheckCircle2
                                size={14}
                                className="text-slate-900"
                              />
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

          {/* =====================================================
              WORKSPACE CONTEXT
          ====================================================== */}

          {selectedWebsite && (
            <div className="grid border-b border-slate-200 bg-white sm:grid-cols-2 lg:grid-cols-4">
              <WorkspaceItem
                label="Website"
                value={selectedWebsite.name}
                icon={<Globe2 size={14} />}
              />

              <WorkspaceItem
                label="URL"
                value={selectedWebsite.url}
                icon={<ArrowRight size={14} />}
              />

              <WorkspaceItem
                label="Industry"
                value={
                  selectedWebsite.industry ??
                  'Not specified'
                }
                icon={<BarChart3 size={14} />}
              />

              <WorkspaceItem
                label="Data window"
                value={`${dateRange.startDate} → ${dateRange.endDate}`}
                icon={<Activity size={14} />}
              />
            </div>
          )}

          {/* =====================================================
              CORE SIGNALS
          ====================================================== */}

          <div className="mt-7 grid border-y border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-5">
            <SignalMetric
              label="SEO Health"
              value={
                loadingSeo
                  ? '...'
                  : seoScore !== null
                    ? `${seoScore}`
                    : '—'
              }
              detail={
                loadingSeo
                  ? 'Loading audit'
                  : scoreLabel
              }
              suffix={
                seoScore !== null
                  ? '/100'
                  : ''
              }
              tone={
                seoScore === null
                  ? 'neutral'
                  : seoScore >= 80
                    ? 'positive'
                    : seoScore >= 60
                      ? 'warning'
                      : 'negative'
              }
            />

            <SignalMetric
              label="Crawled Pages"
              value={
                loadingSeo
                  ? '...'
                  : crawledPages ?? '—'
              }
              detail="Latest completed crawl"
            />

            <SignalMetric
              label="Open Issues"
              value={
                loadingSeo
                  ? '...'
                  : openIssues ?? '—'
              }
              detail={
                criticalIssues !== null
                  ? `${criticalIssues} critical · ${highIssues ?? 0} high`
                  : 'Current technical issues'
              }
              tone={
                openIssues &&
                openIssues > 0
                  ? 'warning'
                  : 'neutral'
              }
            />

            <SignalMetric
              label="GSC Clicks"
              value={
                loadingSearchAnalytics
                  ? '...'
                  : searchAnalytics
                    ? searchClicks
                    : '—'
              }
              detail={
                searchAnalytics
                  ? 'Last 28 days'
                  : 'Search Console not connected'
              }
            />

            <SignalMetric
              label="GA4 Users"
              value={
                loadingGa4
                  ? '...'
                  : ga4Report
                    ? ga4Totals.activeUsers
                    : '—'
              }
              detail={
                ga4Report
                  ? `${ga4Totals.conversions} conversions`
                  : 'Analytics not connected'
              }
            />
          </div>

          {/* =====================================================
              CONNECTION STATUS
          ====================================================== */}

          {googleConnected && (
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] font-bold text-emerald-700">
                <CheckCircle2 size={14} />
                Google connected
              </div>

              {googleEmail && (
                <span className="text-[10px] text-emerald-700">
                  {googleEmail}
                </span>
              )}

              {selectedSearchProperty && (
                <span className="text-[10px] text-emerald-700">
                  GSC: {selectedSearchProperty}
                </span>
              )}

              {selectedAnalyticsProperty && (
                <span className="text-[10px] text-emerald-700">
                  GA4: {selectedAnalyticsProperty}
                </span>
              )}
            </div>
          )}

          {seoError && (
            <div className="mt-4 flex items-center gap-2 border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] text-amber-700">
              <AlertTriangle size={14} />
              <span>
                <strong>SEO audit:</strong>{' '}
                {seoError}
              </span>
            </div>
          )}

          {/* =====================================================
              SEARCH + TRAFFIC
          ====================================================== */}

          <div className="mt-7 grid gap-5 xl:grid-cols-[1.35fr_0.85fr]">
            {/* SEARCH */}

            <section className="border border-slate-200 bg-white">
              <SectionHeader
                eyebrow="Search intelligence"
                title="Organic visibility"
                description="Real Search Console performance across the selected workspace."
                href="/search-visibility"
                hrefLabel="Open Search"
              />

              {!searchAnalytics ? (
                <div className="p-6">
                  <EmptyState
                    loading={
                      loadingSearchAnalytics
                    }
                    icon={
                      <Search size={17} />
                    }
                    title="Search Console data isn't connected"
                    description={
                      searchAnalyticsError ||
                      'Connect Search Console to unlock clicks, queries, impressions and ranking intelligence.'
                    }
                    href="/integrations"
                    action="Connect Search Console"
                  />
                </div>
              ) : (
                <div className="p-5">
                  <div className="grid grid-cols-2 gap-px border border-slate-200 bg-slate-200 sm:grid-cols-4">
                    <InlineMetric
                      icon={
                        <MousePointerClick
                          size={14}
                        />
                      }
                      label="Clicks"
                      value={searchClicks}
                    />

                    <InlineMetric
                      icon={
                        <Eye size={14} />
                      }
                      label="Impressions"
                      value={searchImpressions}
                    />

                    <InlineMetric
                      icon={
                        <Target size={14} />
                      }
                      label="CTR"
                      value={`${(
                        searchCtr * 100
                      ).toFixed(2)}%`}
                    />

                    <InlineMetric
                      icon={
                        <TrendingUp
                          size={14}
                        />
                      }
                      label="Avg position"
                      value={searchPosition.toFixed(
                        1,
                      )}
                    />
                  </div>

                  <div className="mt-5 border border-slate-200 bg-[#fafafa] p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                          Search demand
                        </div>

                        <div className="mt-1 text-xs font-semibold text-slate-700">
                          Daily impressions
                        </div>
                      </div>

                      <div className="text-[10px] text-slate-400">
                        {dateRange.startDate}
                        {' → '}
                        {dateRange.endDate}
                      </div>
                    </div>

                    {searchChart.length ===
                    0 ? (
                      <div className="grid h-32 place-items-center text-xs text-slate-400">
                        No daily Search Console rows available.
                      </div>
                    ) : (
                      <div className="flex h-32 items-end gap-1">
                        {searchChart.map(
                          (point, index) => (
                            <div
                              key={`${point.date}-${index}`}
                              className="group relative flex h-full flex-1 items-end"
                              title={`${point.date}: ${point.impressions} impressions`}
                            >
                              <div
                                className="w-full bg-slate-900 transition-all group-hover:bg-slate-700"
                                style={{
                                  height: `${point.height}%`,
                                }}
                              />
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* GA4 */}

            <section className="border border-slate-200 bg-white">
              <SectionHeader
                eyebrow="Traffic & analytics"
                title="User behaviour"
                description="Real GA4 traffic and conversion signals."
                href="/analytics"
                hrefLabel="Open Analytics"
              />

              {!ga4Report ? (
                <div className="p-6">
                  <EmptyState
                    loading={loadingGa4}
                    icon={
                      <Activity size={17} />
                    }
                    title="Analytics isn't connected"
                    description={
                      ga4Error ||
                      'Connect Google Analytics to measure traffic, engagement and conversions.'
                    }
                    href="/integrations"
                    action="Connect Google Analytics"
                  />
                </div>
              ) : (
                <div className="p-5">
                  <div className="grid grid-cols-2 gap-3">
                    <CompactStat
                      label="Active users"
                      value={
                        ga4Totals.activeUsers
                      }
                      icon={
                        <Users size={14} />
                      }
                    />

                    <CompactStat
                      label="Sessions"
                      value={
                        ga4Totals.sessions
                      }
                      icon={
                        <Activity size={14} />
                      }
                    />

                    <CompactStat
                      label="Page views"
                      value={
                        ga4Totals.pageViews
                      }
                      icon={
                        <Eye size={14} />
                      }
                    />

                    <CompactStat
                      label="Conversions"
                      value={
                        ga4Totals.conversions
                      }
                      icon={
                        <Target size={14} />
                      }
                    />
                  </div>

                  <div className="mt-5 border border-slate-200 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                        Engagement rate
                      </span>

                      <span className="text-sm font-bold">
                        {(
                          ga4Totals.engagementRate *
                          100
                        ).toFixed(1)}
                        %
                      </span>
                    </div>

                    <div className="mt-3 h-1.5 bg-slate-100">
                      <div
                        className="h-full bg-slate-900"
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

                    <div className="mt-3 text-[10px] text-slate-400">
                      {dateRange.startDate}
                      {' → '}
                      {dateRange.endDate}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* =====================================================
              OPPORTUNITY ENGINE
          ====================================================== */}

          <section className="mt-5 border border-slate-200 bg-white">
            <SectionHeader
              eyebrow="Opportunity engine"
              title="What should happen next?"
              description="RENKOO prioritizes the highest-value growth opportunities from connected signals."
              href="/opportunities"
              hrefLabel="View all opportunities"
            />

            <div className="p-5">
              {opportunitiesLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(
                    (item) => (
                      <div
                        key={item}
                        className="h-20 animate-pulse border border-slate-100 bg-slate-50"
                      />
                    ),
                  )}
                </div>
              ) : opportunitiesError ? (
                <div className="border border-red-200 bg-red-50 p-4">
                  <div className="text-xs font-bold text-red-700">
                    Unable to load opportunities
                  </div>

                  <div className="mt-1 text-[11px] text-red-600">
                    {opportunitiesError}
                  </div>
                </div>
              ) : topOpportunities.length ===
                0 ? (
                <div className="border border-slate-200 bg-slate-50 p-8 text-center">
                  <CheckCircle2
                    size={22}
                    className="mx-auto text-emerald-600"
                  />

                  <div className="mt-3 text-sm font-bold">
                    No open growth opportunities
                  </div>

                  <div className="mt-1 text-[11px] text-slate-500">
                    RENKOO will surface new opportunities as fresh data arrives.
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-slate-200 border-y border-slate-200">
                  {topOpportunities.map(
                    (opportunity) => (
                      <OpportunityRow
                        key={opportunity.id}
                        opportunity={
                          opportunity
                        }
                        creating={
                          creatingActionId ===
                          opportunity.sourceId
                        }
                        onCreateAction={async () => {
                          try {
                            setCreatingActionId(
                              opportunity.sourceId,
                            );

                            await createActionFromRecommendation(
                              opportunity.sourceId,
                            );

                            if (
                              selectedWebsite?.id
                            ) {
                              await loadOpportunities(
                                selectedWebsite.id,
                              );
                            }

                            await loadActions();
                          } catch (error) {
                            console.error(
                              'Create action error:',
                              error,
                            );

                            setOpportunitiesError(
                              error instanceof Error
                                ? error.message
                                : 'Unable to create action.',
                            );
                          } finally {
                            setCreatingActionId(
                              null,
                            );
                          }
                        }}
                      />
                    ),
                  )}
                </div>
              )}
            </div>
          </section>

          {/* =====================================================
              ACTION + INTELLIGENCE
          ====================================================== */}

          <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1.25fr]">
            {/* ACTION PIPELINE */}

            <section className="border border-slate-200 bg-white">
              <SectionHeader
                eyebrow="Action engine"
                title="Execution status"
                description="Turn growth opportunities into work that gets completed."
                href="/actions"
                hrefLabel="Open Actions"
              />

              <div className="p-5">
                <div className="grid grid-cols-3 border border-slate-200">
                  <ActionStat
                    label="To do"
                    value={
                      actionsLoading
                        ? '...'
                        : actionsSummary.todo
                    }
                  />

                  <ActionStat
                    label="In progress"
                    value={
                      actionsLoading
                        ? '...'
                        : actionsSummary.inProgress
                    }
                  />

                  <ActionStat
                    label="Completed"
                    value={
                      actionsLoading
                        ? '...'
                        : actionsSummary.done
                    }
                  />
                </div>

                <div className="mt-5">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                      Priority queue
                    </span>

                    <span className="text-[10px] font-semibold text-slate-400">
                      {actionsSummary.high} high priority
                    </span>
                  </div>

                  <div className="space-y-2">
                    <PipelineStep
                      label="Opportunity"
                      active={
                        topOpportunities.length >
                        0
                      }
                    />

                    <PipelineStep
                      label="Recommendation"
                      active={
                        topOpportunities.length >
                        0
                      }
                    />

                    <PipelineStep
                      label="Assigned"
                      active={
                        actionsSummary.inProgress >
                        0
                      }
                    />

                    <PipelineStep
                      label="Monitoring"
                      active={
                        actionsSummary.done >
                        0
                      }
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* DARK INTELLIGENCE */}

            <section className="overflow-hidden bg-[#101113] text-white">
              <div className="border-b border-white/10 px-5 py-4 sm:px-6">
                <div className="flex items-center gap-2">
                  <Sparkles
                    size={15}
                    className="text-white"
                  />

                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/50">
                    RENKOO Intelligence
                  </span>
                </div>
              </div>

              <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_0.8fr]">
                <div>
                  <div className="max-w-xl text-[25px] font-semibold leading-tight tracking-[-0.03em] sm:text-[32px]">
                    {openIssues !==
                      null &&
                    openIssues > 0
                      ? `${openIssues} technical signals need attention.`
                      : topOpportunities.length >
                          0
                        ? 'There are actionable growth opportunities waiting.'
                        : 'Your growth workspace is ready for the next signal.'}
                  </div>

                  <p className="mt-4 max-w-xl text-sm leading-6 text-white/55">
                    RENKOO connects technical SEO,
                    Search Console, analytics and
                    opportunity signals to help you
                    decide what deserves attention next.
                  </p>

                  <div className="mt-7 flex flex-wrap gap-2">
                    <Link
                      href="/opportunities"
                      className="inline-flex items-center gap-2 bg-white px-4 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-slate-200"
                    >
                      Review opportunities
                      <ArrowRight size={14} />
                    </Link>

                    <Link
                      href="/actions"
                      className="inline-flex items-center gap-2 border border-white/15 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-white/5"
                    >
                      Open actions
                    </Link>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-px self-start border border-white/10 bg-white/10">
                  <DarkMetric
                    label="Open issues"
                    value={
                      openIssues ?? '—'
                    }
                  />

                  <DarkMetric
                    label="High issues"
                    value={
                      highIssues ?? '—'
                    }
                  />

                  <DarkMetric
                    label="Medium issues"
                    value={
                      mediumIssues ?? '—'
                    }
                  />

                  <DarkMetric
                    label="Opportunities"
                    value={
                      topOpportunities.length
                    }
                  />
                </div>
              </div>
            </section>
          </div>

          {/* =====================================================
              QUERY + TECHNICAL
          ====================================================== */}

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            {/* QUERIES */}

            <section className="border border-slate-200 bg-white">
              <SectionHeader
                eyebrow="Search intelligence"
                title="Top search queries"
                description="Queries currently driving organic visibility."
                href="/search-visibility"
                hrefLabel="Explore queries"
              />

              <div className="p-5">
                {!searchAnalytics &&
                !searchQueries ? (
                  <EmptyState
                    loading={
                      loadingSearchAnalytics
                    }
                    icon={
                      <Search size={16} />
                    }
                    title="No Search Console data"
                    description="Select a Search Console property to see real queries."
                  />
                ) : topQueries.length ===
                  0 ? (
                  <div className="border border-slate-200 bg-slate-50 p-5 text-xs text-slate-500">
                    No search query data was returned for this period.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 border-y border-slate-200">
                    {topQueries.map(
                      (query, index) => (
                        <div
                          key={`${query.query}-${index}`}
                          className="flex items-center gap-3 py-3"
                        >
                          <div className="grid h-7 w-7 shrink-0 place-items-center bg-slate-100 text-[10px] font-bold text-slate-600">
                            {index + 1}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-semibold">
                              {query.query}
                            </div>

                            <div className="mt-1 text-[10px] text-slate-400">
                              Position{' '}
                              {query.position.toFixed(
                                1,
                              )}
                              {' · '}
                              {
                                query.impressions
                              }{' '}
                              impressions
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-xs font-bold">
                              {query.clicks}
                            </div>

                            <div className="text-[9px] uppercase tracking-wide text-slate-400">
                              clicks
                            </div>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* TECHNICAL SEO */}

            <section className="border border-slate-200 bg-white">
              <SectionHeader
                eyebrow="Technical SEO"
                title="Issues requiring attention"
                description="Highest-priority issues from the latest completed crawl."
                href="/technical-seo"
                hrefLabel="Open audit"
              />

              <div className="p-5">
                {technicalIssues.length ===
                0 ? (
                  <EmptyState
                    loading={loadingSeo}
                    icon={
                      <AlertTriangle
                        size={16}
                      />
                    }
                    title="No technical issues loaded"
                    description={
                      technicalSeo
                        ? 'No top issues were returned by the latest crawl.'
                        : 'Run a Technical SEO crawl to generate issue intelligence.'
                    }
                    href={
                      technicalSeo
                        ? undefined
                        : '/technical-seo'
                    }
                    action={
                      technicalSeo
                        ? undefined
                        : 'Run Technical SEO Audit'
                    }
                  />
                ) : (
                  <div className="divide-y divide-slate-200 border-y border-slate-200">
                    {technicalIssues.map(
                      (
                        issue,
                        index,
                      ) => (
                        <div
                          key={issue.id}
                          className="flex items-center gap-3 py-3"
                        >
                          <div className="grid h-7 w-7 shrink-0 place-items-center bg-slate-100 text-[10px] font-bold text-slate-600">
                            {index + 1}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-bold uppercase text-red-600">
                                {issue.severity}
                              </span>

                              <span className="text-[9px] font-bold uppercase text-slate-400">
                                {issue.category}
                              </span>
                            </div>

                            <div className="mt-1 truncate text-xs font-semibold">
                              {issue.title}
                            </div>

                            <div className="mt-1 truncate text-[10px] text-slate-400">
                              {issue.page?.url}
                            </div>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* =====================================================
              BUSINESS IMPACT
          ====================================================== */}

          <section className="mt-5 border border-slate-200 bg-white">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
                  Business impact
                </div>

                <h2 className="mt-1 text-sm font-bold">
                  From visibility to revenue
                </h2>
              </div>

              <Link
                href="/leads"
                className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-600 hover:text-slate-950"
              >
                View leads & revenue
                <ArrowRight size={13} />
              </Link>
            </div>

            <div className="grid lg:grid-cols-4">
              <ImpactStage
                step="01"
                label="Traffic"
                value={
                  ga4Report
                    ? ga4Totals.activeUsers
                    : '—'
                }
                description={
                  ga4Report
                    ? 'GA4 active users'
                    : 'Connect GA4'
                }
                icon={
                  <Users size={17} />
                }
              />

              <ImpactStage
                step="02"
                label="Qualified leads"
                value="—"
                description="Lead data"
                icon={
                  <Target size={17} />
                }
              />

              <ImpactStage
                step="03"
                label="Pipeline"
                value="—"
                description="Revenue pipeline"
                icon={
                  <TrendingUp size={17} />
                }
              />

              <ImpactStage
                step="04"
                label="Revenue"
                value="—"
                description="Recognized revenue"
                icon={
                  <BarChart3 size={17} />
                }
              />
            </div>

            <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 text-[10px] leading-5 text-slate-500 sm:px-6">
              RENKOO does not invent monetary
              opportunity from traffic alone. Revenue
              becomes measurable when real lead,
              conversion and revenue signals are available.
            </div>
          </section>

          {/* =====================================================
              FOOTER STATUS
          ====================================================== */}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 py-5">
            <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-400">
              <span className="h-1.5 w-1.5 bg-emerald-500" />
              RENKOO live workspace
            </div>

            <div className="text-[10px] text-slate-400">
              Data window: {dateRange.startDate}
              {' → '}
              {dateRange.endDate}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

/*
 * ===========================================================
 * WORKSPACE ITEM
 * ===========================================================
 */

function WorkspaceItem({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-r border-slate-200 px-4 py-4 last:border-r-0">
      <div className="grid h-7 w-7 shrink-0 place-items-center bg-slate-100 text-slate-500">
        {icon}
      </div>

      <div className="min-w-0">
        <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
          {label}
        </div>

        <div className="mt-1 truncate text-[11px] font-semibold text-slate-700">
          {value}
        </div>
      </div>
    </div>
  );
}

/*
 * ===========================================================
 * SIGNAL METRIC
 * ===========================================================
 */

function SignalMetric({
  label,
  value,
  detail,
  suffix = '',
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  detail: string;
  suffix?: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'negative';
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-emerald-600'
      : tone === 'warning'
        ? 'text-amber-600'
        : tone === 'negative'
          ? 'text-red-600'
          : 'text-slate-950';

  return (
    <div className="border-r border-slate-200 px-4 py-5 last:border-r-0">
      <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </div>

      <div
        className={`mt-3 text-[27px] font-bold leading-none tracking-[-0.04em] ${toneClass}`}
      >
        {value}

        {suffix && (
          <span className="ml-1 text-xs font-semibold text-slate-400">
            {suffix}
          </span>
        )}
      </div>

      <div className="mt-2 text-[10px] font-medium text-slate-400">
        {detail}
      </div>
    </div>
  );
}

/*
 * ===========================================================
 * SECTION HEADER
 * ===========================================================
 */

function SectionHeader({
  eyebrow,
  title,
  description,
  href,
  hrefLabel,
}: {
  eyebrow: string;
  title: string;
  description: string;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div>
        <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">
          {eyebrow}
        </div>

        <h2 className="mt-1 text-sm font-bold tracking-[-0.01em]">
          {title}
        </h2>

        <p className="mt-1 max-w-xl text-[10px] leading-5 text-slate-400">
          {description}
        </p>
      </div>

      {href && hrefLabel && (
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-950"
        >
          {hrefLabel}
          <ArrowRight size={12} />
        </Link>
      )}
    </div>
  );
}

/*
 * ===========================================================
 * INLINE METRIC
 * ===========================================================
 */

function InlineMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="bg-white p-3.5">
      <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
        {icon}
        {label}
      </div>

      <div className="mt-2 text-xl font-bold tracking-[-0.03em]">
        {value}
      </div>
    </div>
  );
}

/*
 * ===========================================================
 * COMPACT STAT
 * ===========================================================
 */

function CompactStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
}) {
  return (
    <div className="border border-slate-200 p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">
          {label}
        </span>

        <span className="text-slate-400">
          {icon}
        </span>
      </div>

      <div className="mt-3 text-xl font-bold tracking-[-0.03em]">
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
  icon,
  title,
  description,
  href,
  action,
}: {
  loading: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="border border-slate-200 bg-slate-50 p-5">
      <div className="flex gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center bg-white text-slate-500">
          {loading ? (
            <RefreshCw
              size={15}
              className="animate-spin"
            />
          ) : (
            icon
          )}
        </div>

        <div>
          <div className="text-xs font-bold text-slate-800">
            {title}
          </div>

          <div className="mt-1 max-w-lg text-[10px] leading-5 text-slate-500">
            {description}
          </div>

          {href && action && !loading && (
            <Link
              href={href}
              className="mt-3 inline-flex items-center gap-1.5 bg-slate-950 px-3 py-2 text-[10px] font-bold text-white hover:bg-slate-800"
            >
              {action}
              <ArrowRight size={12} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/*
 * ===========================================================
 * OPPORTUNITY ROW
 * ===========================================================
 */

function OpportunityRow({
  opportunity,
  creating,
  onCreateAction,
}: {
  opportunity: UnifiedOpportunity;
  creating: boolean;
  onCreateAction: () => void;
}) {
  const priorityClass =
    opportunity.priority === 'HIGH'
      ? 'bg-red-50 text-red-600 border-red-100'
      : opportunity.priority === 'MEDIUM'
        ? 'bg-amber-50 text-amber-600 border-amber-100'
        : 'bg-slate-50 text-slate-500 border-slate-200';

  return (
    <div className="group flex flex-col gap-4 py-4 lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center border border-slate-200 bg-slate-50">
          <AlertTriangle
            size={14}
            className="text-slate-500"
          />
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xs font-bold text-slate-900">
              {opportunity.title}
            </h3>

            <span className="border border-slate-200 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-slate-400">
              {opportunity.source.replaceAll(
                '_',
                ' ',
              )}
            </span>

            <span
              className={`border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${priorityClass}`}
            >
              {opportunity.priority}
            </span>
          </div>

          <p className="mt-1.5 line-clamp-2 max-w-3xl text-[10px] leading-5 text-slate-500">
            {opportunity.description}
          </p>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[9px] font-medium text-slate-400">
            <span>
              Score{' '}
              <strong className="text-slate-700">
                {opportunity.score}
              </strong>
            </span>

            <span>
              Impact{' '}
              <strong className="text-slate-700">
                {opportunity.impact ||
                  'MEDIUM'}
              </strong>
            </span>

            <span>
              Effort{' '}
              <strong className="text-slate-700">
                {opportunity.effort ||
                  'MEDIUM'}
              </strong>
            </span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 lg:w-[330px]">
        <div className="min-w-0 flex-1 border-l border-slate-200 pl-3">
          <div className="text-[8px] font-bold uppercase tracking-[0.1em] text-slate-400">
            Recommended action
          </div>

          <div className="mt-1 line-clamp-2 text-[10px] font-medium leading-4 text-slate-700">
            {opportunity.recommendation}
          </div>
        </div>

        {(opportunity.source ===
          'SEO_AUDIT' ||
          opportunity.source ===
            'CONTENT' ||
          opportunity.source ===
            'AEO_AUDIT' ||
          opportunity.source ===
            'GEO_AUDIT' ||
          opportunity.source ===
            'BUSINESS_BRAIN') && (
          <button
            type="button"
            disabled={creating}
            onClick={onCreateAction}
            className="shrink-0 bg-slate-950 px-3 py-2 text-[9px] font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating
              ? 'Creating...'
              : 'Create Action'}
          </button>
        )}
      </div>
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
    <div className="border-r border-slate-200 p-4 last:border-r-0">
      <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
        {label}
      </div>

      <div className="mt-2 text-xl font-bold">
        {value}
      </div>
    </div>
  );
}

/*
 * ===========================================================
 * PIPELINE STEP
 * ===========================================================
 */

function PipelineStep({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`h-2 w-2 ${
          active
            ? 'bg-slate-950'
            : 'bg-slate-200'
        }`}
      />

      <div
        className={`h-px flex-1 ${
          active
            ? 'bg-slate-300'
            : 'bg-slate-100'
        }`}
      />

      <span
        className={`text-[10px] font-semibold ${
          active
            ? 'text-slate-800'
            : 'text-slate-400'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

/*
 * ===========================================================
 * DARK METRIC
 * ===========================================================
 */

function DarkMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="bg-[#101113] p-4">
      <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-white/35">
        {label}
      </div>

      <div className="mt-2 text-xl font-bold text-white">
        {value}
      </div>
    </div>
  );
}

/*
 * ===========================================================
 * BUSINESS IMPACT
 * ===========================================================
 */

function ImpactStage({
  step,
  label,
  value,
  description,
  icon,
}: {
  step: string;
  label: string;
  value: string | number;
  description: string;
  icon: ReactNode;
}) {
  return (
    <div className="relative border-r border-slate-200 p-5 last:border-r-0">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold tracking-[0.12em] text-slate-300">
          {step}
        </span>

        <span className="text-slate-400">
          {icon}
        </span>
      </div>

      <div className="mt-6 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </div>

      <div className="mt-2 text-[27px] font-bold tracking-[-0.04em]">
        {value}
      </div>

      <div className="mt-1 text-[10px] text-slate-400">
        {description}
      </div>
    </div>
  );
}

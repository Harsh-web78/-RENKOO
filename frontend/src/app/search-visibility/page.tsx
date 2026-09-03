'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Globe2,
  Menu,
  RefreshCw,
  Search,
  Target,
  TrendingUp,
  X,
} from 'lucide-react';

import Sidebar from '../../components/Sidebar';

import {
  getGoogleAnalytics,
  getGoogleConnectionStatus,
  getGoogleOpportunities,
  getGooglePages,
  getGoogleProperties,
  getGoogleQueries,
  selectGoogleProperty,
  analyzeGoogleOpportunity,
  GoogleAnalytics,
  GoogleConnectionStatus,
  GoogleOpportunityAnalysis,
  GoogleOpportunityRow,
  GooglePageRow,
  GoogleProperty,
  GoogleQueryRow,
} from '../../lib/api';

type Tab =
  | 'overview'
  | 'queries'
  | 'pages'
  | 'opportunities';

function getDateRange() {
  const end = new Date();

  const start = new Date();
  // Inclusive 28-day window: today + previous 27 days.
  start.setDate(end.getDate() - 27);

  const format = (date: Date) =>
    date.toISOString().slice(0, 10);

  return {
    startDate: format(start),
    endDate: format(end),
  };
}

export default function SearchVisibilityPage() {
  const [mobileOpen, setMobileOpen] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState('');

  const [connection, setConnection] =
    useState<GoogleConnectionStatus | null>(null);

  const [properties, setProperties] =
    useState<GoogleProperty[]>([]);

  const [selectedProperty, setSelectedProperty] =
    useState('');

  const [showPropertyMenu, setShowPropertyMenu] =
    useState(false);

  const [analytics, setAnalytics] =
    useState<GoogleAnalytics | null>(null);

  const [queries, setQueries] =
    useState<GoogleQueryRow[]>([]);

  const [pages, setPages] =
    useState<GooglePageRow[]>([]);

  const [opportunities, setOpportunities] =
    useState<GoogleOpportunityRow[]>([]);

  const [activeTab, setActiveTab] =
    useState<Tab>('overview');

  /*
   * =========================================================
   * OPPORTUNITY ANALYSIS
   * =========================================================
   */

  const [analysis, setAnalysis] =
    useState<GoogleOpportunityAnalysis | null>(
      null,
    );

  const [analysisLoading, setAnalysisLoading] =
    useState(false);

  const [analysisError, setAnalysisError] =
    useState('');

  const [analysisQuery, setAnalysisQuery] =
    useState('');

  const [showAnalysis, setShowAnalysis] =
    useState(false);

  const { startDate, endDate } =
    useMemo(() => getDateRange(), []);

  /*
   * =========================================================
   * LOAD SEARCH VISIBILITY DATA
   * =========================================================
   */

  async function loadData(
    showRefresh = false,
  ) {
    try {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError('');

      const status =
        await getGoogleConnectionStatus();

      setConnection(status);

      if (!status.connected) {
        setProperties([]);
        setAnalytics(null);
        setQueries([]);
        setPages([]);
        setOpportunities([]);
        return;
      }

      let property =
        status.selectedProperty ?? '';

      let availableProperties: GoogleProperty[] =
        [];

      try {
        availableProperties =
          await getGoogleProperties();

        setProperties(
          availableProperties,
        );
      } catch (propertyError) {
        console.error(
          'Unable to load properties',
          propertyError,
        );
      }

      if (
        !property &&
        availableProperties.length > 0
      ) {
        property =
          availableProperties[0].siteUrl;

        await selectGoogleProperty(
          property,
        );
      }

      setSelectedProperty(property);

      if (!property) {
        setAnalytics(null);
        setQueries([]);
        setPages([]);
        setOpportunities([]);
        return;
      }

      const [
        analyticsData,
        queriesData,
        pagesData,
        opportunitiesData,
      ] = await Promise.all([
        getGoogleAnalytics(
          startDate,
          endDate,
        ),
        getGoogleQueries(
          startDate,
          endDate,
        ),
        getGooglePages(
          startDate,
          endDate,
        ),
        getGoogleOpportunities(
          startDate,
          endDate,
        ),
      ]);

      setAnalytics(
        analyticsData,
      );

      setQueries(
        queriesData.rows ?? [],
      );

      setPages(
        pagesData.rows ?? [],
      );

      setOpportunities(
        opportunitiesData.opportunities ??
          [],
      );
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load Search Visibility data.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  /*
   * =========================================================
   * CHANGE GOOGLE PROPERTY
   * =========================================================
   */

  async function changeProperty(
    property: string,
  ) {
    try {
      setShowPropertyMenu(false);
      setError('');
      setRefreshing(true);

      await selectGoogleProperty(
        property,
      );

      setSelectedProperty(property);

      const [
        analyticsData,
        queriesData,
        pagesData,
        opportunitiesData,
      ] = await Promise.all([
        getGoogleAnalytics(
          startDate,
          endDate,
        ),
        getGoogleQueries(
          startDate,
          endDate,
        ),
        getGooglePages(
          startDate,
          endDate,
        ),
        getGoogleOpportunities(
          startDate,
          endDate,
        ),
      ]);

      setAnalytics(
        analyticsData,
      );

      setQueries(
        queriesData.rows ?? [],
      );

      setPages(
        pagesData.rows ?? [],
      );

      setOpportunities(
        opportunitiesData.opportunities ??
          [],
      );

      setConnection(
        (current) =>
          current
            ? {
                ...current,
                selectedProperty:
                  property,
              }
            : current,
      );
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to change Search Console property.',
      );
    } finally {
      setRefreshing(false);
    }
  }

  /*
   * =========================================================
   * ANALYZE OPPORTUNITY
   * =========================================================
   */

  async function handleAnalyzeOpportunity(
    opportunity: GoogleOpportunityRow,
  ) {
    if (analysisLoading) {
      return;
    }

    try {
      setAnalysisLoading(true);
      setAnalysisError('');
      setAnalysis(null);
      setAnalysisQuery(
        opportunity.query,
      );
      setShowAnalysis(true);

      const result =
        await analyzeGoogleOpportunity(
          startDate,
          endDate,
          opportunity.query,
          opportunity.page ?? undefined,
        );

      setAnalysis(result);
    } catch (err) {
      console.error(err);

      setAnalysisError(
        err instanceof Error
          ? err.message
          : 'Unable to analyze this opportunity.',
      );
    } finally {
      setAnalysisLoading(false);
    }
  }

  function closeAnalysis() {
    if (analysisLoading) {
      return;
    }

    setShowAnalysis(false);
    setAnalysis(null);
    setAnalysisError('');
    setAnalysisQuery('');
  }

  /*
   * =========================================================
   * METRICS
   * =========================================================
   */

  const totalClicks =
    analytics?.clicks ?? 0;

  const totalImpressions =
    analytics?.impressions ?? 0;

  const ctr =
    analytics?.ctr ?? 0;

  const averagePosition =
    analytics?.averagePosition ?? 0;

  /*
   * =========================================================
   * SORTED DATA
   * =========================================================
   */

  const topQueries =
    [...queries]
      .sort(
        (a, b) =>
          b.clicks - a.clicks,
      )
      .slice(0, 10);

  const topPages =
    [...pages]
      .sort(
        (a, b) =>
          b.clicks - a.clicks,
      )
      .slice(0, 10);

  const topOpportunities =
    [...opportunities]
      .sort(
        (a, b) =>
          b.score - a.score,
      )
      .slice(0, 10);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Sidebar
        mobileOpen={mobileOpen}
        onClose={() =>
          setMobileOpen(false)
        }
      />

      <main className="lg:pl-[270px]">
        <header className="flex h-[72px] items-center border-b border-slate-200 bg-white px-5 lg:px-8">
          <button
            className="mr-4 lg:hidden"
            onClick={() =>
              setMobileOpen(true)
            }
            aria-label="Open menu"
          >
            <Menu />
          </button>

          <div>
            <div className="text-sm font-semibold">
              RENKO / Search Visibility
            </div>

            <div className="text-xs text-slate-400">
              Google Search Console performance intelligence
            </div>
          </div>

          <div className="ml-auto">
            <button
              onClick={() =>
                loadData(true)
              }
              disabled={
                loading ||
                refreshing
              }
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw
                size={15}
                className={
                  refreshing
                    ? 'animate-spin'
                    : ''
                }
              />

              Refresh
            </button>
          </div>
        </header>

        <section className="mx-auto max-w-[1500px] p-5 lg:p-8">

          {/* =================================================
              HEADER
          ================================================= */}

          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-violet-600">
                <Search size={20} />

                <span className="text-xs font-bold uppercase tracking-wide">
                  Search Visibility
                </span>
              </div>

              <h1 className="mt-2 text-3xl font-bold">
                Search Performance
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Understand how your website appears
                in Google Search, which queries drive
                traffic and where the biggest SEO
                opportunities exist.
              </p>
            </div>

            {/* PROPERTY */}

            <div className="relative w-full xl:w-[420px]">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Search Console Property
              </div>

              {loading ? (
                <div className="flex h-[58px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4">
                  <RefreshCw
                    size={18}
                    className="animate-spin text-violet-600"
                  />

                  <span className="text-sm font-medium">
                    Loading property...
                  </span>
                </div>
              ) : !connection?.connected ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="text-sm font-bold text-amber-800">
                    Google Search Console not connected
                  </div>

                  <div className="mt-1 text-xs text-amber-700">
                    Connect Google Search Console from
                    Integrations before viewing search
                    visibility data.
                  </div>
                </div>
              ) : properties.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                  No Search Console properties available.
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setShowPropertyMenu(
                        (value) => !value,
                      )
                    }
                    className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm"
                  >
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600">
                      <Globe2 size={19} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">
                        {selectedProperty ||
                          'Select property'}
                      </div>

                      <div className="text-xs text-slate-500">
                        Google Search Console
                      </div>
                    </div>

                    <ChevronDown
                      size={18}
                      className={
                        showPropertyMenu
                          ? 'rotate-180 text-slate-400'
                          : 'text-slate-400'
                      }
                    />
                  </button>

                  {showPropertyMenu && (
                    <div className="absolute left-0 right-0 top-[82px] z-50 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                      {properties.map(
                        (property) => (
                          <button
                            key={
                              property.siteUrl
                            }
                            onClick={() =>
                              changeProperty(
                                property.siteUrl,
                              )
                            }
                            className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-slate-50"
                          >
                            <Globe2
                              size={17}
                              className="text-slate-500"
                            />

                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold">
                                {
                                  property.siteUrl
                                }
                              </div>

                              <div className="text-xs text-slate-500">
                                {
                                  property.permissionLevel
                                }
                              </div>
                            </div>
                          </button>
                        ),
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* =================================================
              ERROR
          ================================================= */}

          {error && (
            <div className="mt-6 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
              <AlertTriangle
                size={19}
                className="shrink-0 text-red-600"
              />

              <div>
                <div className="text-sm font-bold text-red-700">
                  Search Visibility error
                </div>

                <div className="mt-1 text-xs leading-5 text-red-600">
                  {error}
                </div>
              </div>
            </div>
          )}

          {/* =================================================
              LOADING
          ================================================= */}

          {loading && (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <div className="flex items-center gap-3">
                <RefreshCw
                  size={20}
                  className="animate-spin text-violet-600"
                />

                <div>
                  <div className="text-sm font-bold">
                    Loading Search Visibility
                  </div>

                  <div className="mt-1 text-xs text-slate-500">
                    Fetching Google Search Console data...
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =================================================
              MAIN
          ================================================= */}

          {!loading &&
            connection?.connected &&
            selectedProperty && (
              <>
                {/* DATE */}

                <div className="mt-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                  <div>
                    <div className="text-sm font-bold">
                      Last 28 days
                    </div>

                    <div className="mt-1 text-xs text-slate-500">
                      {startDate} → {endDate}
                    </div>
                  </div>

                  <div className="text-xs font-semibold text-slate-400">
                    Google Search Console
                  </div>
                </div>

                {/* METRICS */}

                <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric
                    title="Clicks"
                    value={formatNumber(
                      totalClicks,
                    )}
                    icon={
                      <TrendingUp
                        size={18}
                      />
                    }
                  />

                  <Metric
                    title="Impressions"
                    value={formatNumber(
                      totalImpressions,
                    )}
                    icon={
                      <BarChart3
                        size={18}
                      />
                    }
                  />

                  <Metric
                    title="Average CTR"
                    value={`${formatPercent(
                      ctr,
                    )}%`}
                    icon={
                      <Target
                        size={18}
                      />
                    }
                  />

                  <Metric
                    title="Average Position"
                    value={averagePosition.toFixed(
                      1,
                    )}
                    icon={
                      <Search
                        size={18}
                      />
                    }
                  />
                </div>

                {/* =================================================
                    TABS
                ================================================= */}

                <div className="mt-6 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                  <TabButton
                    active={
                      activeTab ===
                      'overview'
                    }
                    onClick={() =>
                      setActiveTab(
                        'overview',
                      )
                    }
                  >
                    Overview
                  </TabButton>

                  <TabButton
                    active={
                      activeTab ===
                      'queries'
                    }
                    onClick={() =>
                      setActiveTab(
                        'queries',
                      )
                    }
                  >
                    Queries
                  </TabButton>

                  <TabButton
                    active={
                      activeTab ===
                      'pages'
                    }
                    onClick={() =>
                      setActiveTab(
                        'pages',
                      )
                    }
                  >
                    Pages
                  </TabButton>

                  <TabButton
                    active={
                      activeTab ===
                      'opportunities'
                    }
                    onClick={() =>
                      setActiveTab(
                        'opportunities',
                      )
                    }
                  >
                    Opportunities
                  </TabButton>
                </div>

                {/* =================================================
                    OVERVIEW
                ================================================= */}

                {activeTab ===
                  'overview' && (
                  <div className="mt-6 grid gap-6 xl:grid-cols-2">
                    <DataCard
                      title="Top Search Queries"
                      subtitle="Queries generating the most clicks."
                    >
                      {topQueries.length ===
                      0 ? (
                        <Empty />
                      ) : (
                        <div className="space-y-2">
                          {topQueries.map(
                            (
                              row,
                              index,
                            ) => (
                              <QueryRow
                                key={`${row.query}-${index}`}
                                row={row}
                              />
                            ),
                          )}
                        </div>
                      )}
                    </DataCard>

                    <DataCard
                      title="Top Pages"
                      subtitle="Pages receiving the most organic clicks."
                    >
                      {topPages.length ===
                      0 ? (
                        <Empty />
                      ) : (
                        <div className="space-y-2">
                          {topPages.map(
                            (
                              row,
                              index,
                            ) => (
                              <PageRow
                                key={`${row.page}-${index}`}
                                row={row}
                              />
                            ),
                          )}
                        </div>
                      )}
                    </DataCard>

                    <DataCard
                      title="SEO Opportunities"
                      subtitle="Queries with potential for additional search traffic."
                    >
                      {topOpportunities.length ===
                      0 ? (
                        <Empty />
                      ) : (
                        <div className="space-y-2">
                          {topOpportunities
                            .slice(
                              0,
                              6,
                            )
                            .map(
                              (
                                opportunity,
                                index,
                              ) => (
                                <OpportunityRow
                                  key={`${opportunity.query}-${index}`}
                                  row={
                                    opportunity
                                  }
                                  onAnalyze={() =>
                                    handleAnalyzeOpportunity(
                                      opportunity,
                                    )
                                  }
                                />
                              ),
                            )}
                        </div>
                      )}
                    </DataCard>

                    <DataCard
                      title="Visibility Snapshot"
                      subtitle="Current organic search performance."
                    >
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Snapshot
                          label="Queries"
                          value={queries.length}
                        />

                        <Snapshot
                          label="Ranking pages"
                          value={pages.length}
                        />

                        <Snapshot
                          label="Opportunities"
                          value={
                            opportunities.length
                          }
                        />

                        <Snapshot
                          label="CTR"
                          value={`${formatPercent(
                            ctr,
                          )}%`}
                        />
                      </div>
                    </DataCard>
                  </div>
                )}

                {/* =================================================
                    QUERIES
                ================================================= */}

                {activeTab ===
                  'queries' && (
                  <DataCard
                    className="mt-6"
                    title="Search Queries"
                    subtitle="Actual queries reported by Google Search Console."
                  >
                    <Table>
                      <thead>
                        <tr>
                          <Th>Query</Th>
                          <Th>Clicks</Th>
                          <Th>Impressions</Th>
                          <Th>CTR</Th>
                          <Th>Position</Th>
                        </tr>
                      </thead>

                      <tbody>
                        {queries.map(
                          (
                            row,
                            index,
                          ) => (
                            <tr
                              key={`${row.query}-${index}`}
                              className="border-b border-slate-50"
                            >
                              <Td strong>
                                {row.query}
                              </Td>

                              <Td>
                                {formatNumber(
                                  row.clicks,
                                )}
                              </Td>

                              <Td>
                                {formatNumber(
                                  row.impressions,
                                )}
                              </Td>

                              <Td>
                                {formatPercent(
                                  row.ctr,
                                )}
                                %
                              </Td>

                              <Td>
                                {row.position.toFixed(
                                  1,
                                )}
                              </Td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </Table>

                    {queries.length ===
                      0 && (
                      <Empty />
                    )}
                  </DataCard>
                )}

                {/* =================================================
                    PAGES
                ================================================= */}

                {activeTab ===
                  'pages' && (
                  <DataCard
                    className="mt-6"
                    title="Search Performance by Page"
                    subtitle="Pages receiving traffic from Google Search."
                  >
                    <Table>
                      <thead>
                        <tr>
                          <Th>Page</Th>
                          <Th>Clicks</Th>
                          <Th>Impressions</Th>
                          <Th>CTR</Th>
                          <Th>Position</Th>
                        </tr>
                      </thead>

                      <tbody>
                        {pages.map(
                          (
                            row,
                            index,
                          ) => (
                            <tr
                              key={`${row.page}-${index}`}
                              className="border-b border-slate-50"
                            >
                              <Td strong>
                                <div className="flex items-center gap-2">
                                  <span className="max-w-[420px] truncate">
                                    {row.page}
                                  </span>

                                  <ExternalLink
                                    size={12}
                                    className="shrink-0 text-slate-400"
                                  />
                                </div>
                              </Td>

                              <Td>
                                {formatNumber(
                                  row.clicks,
                                )}
                              </Td>

                              <Td>
                                {formatNumber(
                                  row.impressions,
                                )}
                              </Td>

                              <Td>
                                {formatPercent(
                                  row.ctr,
                                )}
                                %
                              </Td>

                              <Td>
                                {row.position.toFixed(
                                  1,
                                )}
                              </Td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </Table>

                    {pages.length ===
                      0 && (
                      <Empty />
                    )}
                  </DataCard>
                )}

                {/* =================================================
                    OPPORTUNITIES
                ================================================= */}

                {activeTab ===
                  'opportunities' && (
                  <DataCard
                    className="mt-6"
                    title="SEO Opportunities"
                    subtitle="Prioritized opportunities generated from Search Console performance data."
                  >
                    <div className="space-y-3">
                      {opportunities.map(
                        (
                          row,
                          index,
                        ) => (
                          <OpportunityCard
                            key={`${row.query}-${index}`}
                            row={row}
                            onAnalyze={() =>
                              handleAnalyzeOpportunity(
                                row,
                              )
                            }
                          />
                        ),
                      )}
                    </div>

                    {opportunities.length ===
                      0 && (
                      <Empty />
                    )}
                  </DataCard>
                )}
              </>
            )}
        </section>
      </main>

      {/* =========================================================
          OPPORTUNITY ANALYSIS MODAL
      ========================================================= */}

      {showAnalysis && (
        <OpportunityAnalysisModal
          query={analysisQuery}
          analysis={analysis}
          loading={analysisLoading}
          error={analysisError}
          onClose={closeAnalysis}
        />
      )}
    </div>
  );
}

/* =========================================================
 * METRIC
 * ========================================================= */

function Metric({
  title,
  value,
  icon,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-slate-500">
          {title}
        </div>

        <div className="grid h-9 w-9 place-items-center rounded-xl bg-violet-50 text-violet-600">
          {icon}
        </div>
      </div>

      <div className="mt-4 text-3xl font-bold">
        {value}
      </div>
    </div>
  );
}

/* =========================================================
 * TAB BUTTON
 * ========================================================= */

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-bold transition ${
        active
          ? 'bg-slate-900 text-white'
          : 'text-slate-500 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  );
}

/* =========================================================
 * DATA CARD
 * ========================================================= */

function DataCard({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      <div className="mb-5">
        <h2 className="text-sm font-bold">
          {title}
        </h2>

        <p className="mt-1 text-xs text-slate-500">
          {subtitle}
        </p>
      </div>

      {children}
    </section>
  );
}

/* =========================================================
 * QUERY ROW
 * ========================================================= */

function QueryRow({
  row,
}: {
  row: GoogleQueryRow;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-600">
        <Search size={15} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-bold">
          {row.query}
        </div>

        <div className="mt-1 text-[10px] text-slate-400">
          Position {row.position.toFixed(1)}
        </div>
      </div>

      <div className="text-right">
        <div className="text-xs font-bold">
          {formatNumber(row.clicks)}
        </div>

        <div className="text-[10px] text-slate-400">
          clicks
        </div>
      </div>
    </div>
  );
}

/* =========================================================
 * PAGE ROW
 * ========================================================= */

function PageRow({
  row,
}: {
  row: GooglePageRow;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
        <Globe2 size={15} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-bold">
          {row.page}
        </div>

        <div className="mt-1 text-[10px] text-slate-400">
          Position {row.position.toFixed(1)}
        </div>
      </div>

      <div className="text-right">
        <div className="text-xs font-bold">
          {formatNumber(row.clicks)}
        </div>

        <div className="text-[10px] text-slate-400">
          clicks
        </div>
      </div>
    </div>
  );
}

/* =========================================================
 * OVERVIEW OPPORTUNITY ROW
 * ========================================================= */

function OpportunityRow({
  row,
  onAnalyze,
}: {
  row: GoogleOpportunityRow;
  onAnalyze: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-100 p-3">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-700">
          {row.type}
        </span>

        <span className="truncate text-xs font-bold">
          {row.query}
        </span>

        <span className="ml-auto shrink-0 text-xs font-bold text-violet-600">
          {row.score}
        </span>
      </div>

      <p className="mt-2 text-[11px] leading-5 text-slate-500">
        {row.recommendation}
      </p>

      <button
        type="button"
        onClick={onAnalyze}
        className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-[10px] font-bold text-violet-700 transition hover:bg-violet-100"
      >
        Analyze opportunity
      </button>
    </div>
  );
}

/* =========================================================
 * FULL OPPORTUNITY CARD
 * ========================================================= */

function OpportunityCard({
  row,
  onAnalyze,
}: {
  row: GoogleOpportunityRow;
  onAnalyze: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-100 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-700">
              {row.type}
            </span>

            <span className="text-sm font-bold">
              {row.query}
            </span>
          </div>

          <div className="mt-2 text-xs text-slate-500">
            {row.recommendation}
          </div>

          {row.page && (
            <div className="mt-2 truncate text-[11px] text-slate-400">
              {row.page}
            </div>
          )}

          <button
            type="button"
            onClick={onAnalyze}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800"
          >
            <Search size={14} />
            Analyze opportunity
          </button>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4">
          <Snapshot
            label="Clicks"
            value={row.clicks}
          />

          <Snapshot
            label="Impressions"
            value={row.impressions}
          />

          <Snapshot
            label="Position"
            value={row.position.toFixed(
              1,
            )}
          />

          <Snapshot
            label="Score"
            value={row.score}
          />
        </div>
      </div>
    </div>
  );
}

/* =========================================================
 * SNAPSHOT
 * ========================================================= */

function Snapshot({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="text-[10px] text-slate-400">
        {label}
      </div>

      <div className="mt-1 text-lg font-bold">
        {value}
      </div>
    </div>
  );
}

/* =========================================================
 * EMPTY
 * ========================================================= */

function Empty() {
  return (
    <div className="rounded-xl bg-slate-50 p-6 text-center text-xs text-slate-500">
      No data available for the selected period.
    </div>
  );
}

/* =========================================================
 * TABLE
 * ========================================================= */

function Table({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] text-left text-xs">
        {children}
      </table>
    </div>
  );
}

/* =========================================================
 * TH
 * ========================================================= */

function Th({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <th className="border-b border-slate-100 px-3 py-3 font-semibold text-slate-400">
      {children}
    </th>
  );
}

/* =========================================================
 * TD
 * ========================================================= */

function Td({
  children,
  strong = false,
}: {
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <td
      className={`px-3 py-3 ${
        strong
          ? 'font-semibold text-slate-700'
          : 'text-slate-500'
      }`}
    >
      {children}
    </td>
  );
}

/* =========================================================
 * OPPORTUNITY ANALYSIS MODAL
 * ========================================================= */

function OpportunityAnalysisModal({
  query,
  analysis,
  loading,
  error,
  onClose,
}: {
  query: string;
  analysis: GoogleOpportunityAnalysis | null;
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-[1000px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">

        {/* HEADER */}

        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wide text-violet-600">
              RENKO Opportunity Analysis
            </div>

            <div className="mt-1 truncate text-lg font-bold text-slate-900">
              {query}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-40"
            aria-label="Close analysis"
          >
            <X size={18} />
          </button>
        </div>

        {/* BODY */}

        <div className="overflow-y-auto p-5">
          {loading && (
            <div className="flex min-h-[350px] items-center justify-center">
              <div className="text-center">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-50 text-violet-600">
                  <RefreshCw
                    size={25}
                    className="animate-spin"
                  />
                </div>

                <div className="mt-4 text-sm font-bold">
                  RENKO is analyzing this opportunity
                </div>

                <div className="mt-2 text-xs text-slate-500">
                  Comparing search visibility, ranking,
                  clicks, CTR and page mapping.
                </div>
              </div>
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
              <div className="flex gap-3">
                <AlertTriangle
                  size={19}
                  className="shrink-0 text-red-600"
                />

                <div>
                  <div className="text-sm font-bold text-red-700">
                    Opportunity analysis failed
                  </div>

                  <div className="mt-1 text-xs leading-5 text-red-600">
                    {error}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!loading &&
            !error &&
            analysis && (
              <div className="space-y-5">

                {/* TOP SUMMARY */}

                <div className="grid gap-4 sm:grid-cols-3">
                  <AnalysisMetric
                    label="Priority"
                    value={
                      analysis.priority
                    }
                  />

                  <AnalysisMetric
                    label="Opportunity"
                    value={
                      analysis.opportunityType
                    }
                  />

                  <AnalysisMetric
                    label="Ranking Stage"
                    value={
                      analysis.rankingStage
                    }
                  />
                </div>

                {/* SEARCH DATA */}

                <section className="rounded-2xl border border-slate-200 p-5">
                  <div>
                    <h3 className="text-sm font-bold">
                      Search Performance
                    </h3>

                    <p className="mt-1 text-xs text-slate-500">
                      Actual Search Console data used by RENKO.
                    </p>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <AnalysisMetric
                      label="Clicks"
                      value={formatNumber(
                        analysis.clicks,
                      )}
                    />

                    <AnalysisMetric
                      label="Impressions"
                      value={formatNumber(
                        analysis.impressions,
                      )}
                    />

                    <AnalysisMetric
                      label="CTR"
                      value={`${formatPercent(
                        analysis.ctr,
                      )}%`}
                    />

                    <AnalysisMetric
                      label="Position"
                      value={analysis.position.toFixed(
                        1,
                      )}
                    />
                  </div>

                  {analysis.page && (
                    <div className="mt-4 rounded-xl bg-slate-50 p-4">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        Ranking page
                      </div>

                      <div className="mt-1 break-all text-xs font-semibold text-slate-700">
                        {analysis.page}
                      </div>
                    </div>
                  )}
                </section>

                {/* CHECKS */}

                <section className="rounded-2xl border border-slate-200 p-5">
                  <div>
                    <h3 className="text-sm font-bold">
                      RENKO Checks
                    </h3>

                    <p className="mt-1 text-xs text-slate-500">
                      Signals evaluated for this opportunity.
                    </p>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <AnalysisCheck
                      title="Search Visibility"
                      check={
                        analysis.checks
                          .searchVisibility
                      }
                    />

                    <AnalysisCheck
                      title="Ranking"
                      check={
                        analysis.checks
                          .ranking
                      }
                    />

                    <AnalysisCheck
                      title="Clicks"
                      check={
                        analysis.checks
                          .clicks
                      }
                    />

                    <AnalysisCheck
                      title="CTR"
                      check={
                        analysis.checks
                          .ctr
                      }
                    />

                    <AnalysisCheck
                      title="Page Mapping"
                      check={
                        analysis.checks
                          .pageMapping
                      }
                    />
                  </div>
                </section>

                {/* RECOMMENDATIONS */}

                <section className="rounded-2xl border border-slate-200 p-5">
                  <div>
                    <h3 className="text-sm font-bold">
                      RENKO Recommendations
                    </h3>

                    <p className="mt-1 text-xs text-slate-500">
                      Actions generated from the opportunity analysis.
                    </p>
                  </div>

                  {analysis.recommendations
                    .length === 0 ? (
                    <div className="mt-5 rounded-xl bg-slate-50 p-5 text-xs text-slate-500">
                      No additional recommendations available.
                    </div>
                  ) : (
                    <div className="mt-5 space-y-3">
                      {analysis.recommendations.map(
                        (
                          recommendation,
                          index,
                        ) => (
                          <div
                            key={`${recommendation}-${index}`}
                            className="flex gap-3 rounded-xl border border-slate-100 p-4"
                          >
                            <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-600">
                              <Target
                                size={14}
                              />
                            </div>

                            <div className="text-xs leading-5 text-slate-700">
                              {recommendation}
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </section>
              </div>
            )}
        </div>

        {/* FOOTER */}

        {!loading && (
          <div className="flex shrink-0 justify-end border-t border-slate-200 bg-slate-50 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
 * ANALYSIS METRIC
 * ========================================================= */

function AnalysisMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>

      <div className="mt-2 break-words text-sm font-bold text-slate-900">
        {value}
      </div>
    </div>
  );
}

/* =========================================================
 * ANALYSIS CHECK
 * ========================================================= */

function AnalysisCheck({
  title,
  check,
}: {
  title: string;
  check: {
    status: string;
    impressions?: number;
    position?: number;
    clicks?: number;
    ctr?: number;
    page?: string | null;
  };
}) {
  const status =
    check.status?.toUpperCase() ||
    'UNKNOWN';

  const positive =
    status === 'PASS' ||
    status === 'GOOD' ||
    status === 'OK' ||
    status === 'HEALTHY';

  return (
    <div className="rounded-xl border border-slate-100 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-bold">
          {title}
        </div>

        <span
          className={`rounded-full px-2 py-1 text-[10px] font-bold ${
            positive
              ? 'bg-emerald-50 text-emerald-700'
              : status === 'WARNING' ||
                  status === 'REVIEW'
                ? 'bg-yellow-50 text-yellow-700'
                : 'bg-slate-100 text-slate-600'
          }`}
        >
          {status}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {check.impressions !==
          undefined && (
          <MiniValue
            label="Impressions"
            value={formatNumber(
              check.impressions,
            )}
          />
        )}

        {check.position !==
          undefined && (
          <MiniValue
            label="Position"
            value={check.position.toFixed(
              1,
            )}
          />
        )}

        {check.clicks !==
          undefined && (
          <MiniValue
            label="Clicks"
            value={formatNumber(
              check.clicks,
            )}
          />
        )}

        {check.ctr !==
          undefined && (
          <MiniValue
            label="CTR"
            value={`${formatPercent(
              check.ctr,
            )}%`}
          />
        )}
      </div>

      {check.page && (
        <div className="mt-3 truncate text-[10px] text-slate-400">
          {check.page}
        </div>
      )}
    </div>
  );
}

/* =========================================================
 * MINI VALUE
 * ========================================================= */

function MiniValue({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <div className="text-[10px] text-slate-400">
        {label}
      </div>

      <div className="mt-1 text-xs font-bold text-slate-700">
        {value}
      </div>
    </div>
  );
}

/* =========================================================
 * FORMATTERS
 * ========================================================= */

function formatNumber(
  value: number,
) {
  return new Intl.NumberFormat(
    'en-US',
  ).format(value);
}

function formatPercent(
  value: number,
) {
  if (!Number.isFinite(value)) {
    return '0.00';
  }

  // Google Search Console CTR is normally returned as a decimal:
  // 0.1 = 10%, 0.025 = 2.5%.
  // Keep this defensive if an API returns a percentage such as 10.
  const percentage =
    Math.abs(value) <= 1
      ? value * 100
      : value;

  return percentage.toFixed(2);
}
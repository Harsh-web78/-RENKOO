'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  ExternalLink,
  Eye,
  MousePointerClick,
  RefreshCw,
  Search,
  Target,
  TrendingUp,
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import {
  analyzeGoogleOpportunity,
  getGoogleQueries,
  type GoogleOpportunityAnalysis,
  type GoogleQueriesResponse,
  type GoogleQueryRow,
} from '@/lib/api';
type DateRangeKey = '7' | '28' | '90';

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getRange(days: DateRangeKey) {
  const end = new Date();
  const start = new Date(end);

  start.setDate(start.getDate() - (Number(days) - 1));

  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(Math.round(value));
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function positionLabel(position: number) {
  if (!position) return '—';
  return position.toFixed(1);
}

function positionTone(position: number) {
  if (position >= 1 && position <= 3) {
    return 'bg-emerald-50 text-emerald-700';
  }

  if (position > 3 && position <= 10) {
    return 'bg-blue-50 text-blue-700';
  }

  if (position > 10 && position <= 20) {
    return 'bg-amber-50 text-amber-700';
  }

  return 'bg-slate-100 text-slate-600';
}

function getKeywordIntent(query: string) {
  const q = query.toLowerCase();
  if (/\b(near me|nearby|in pune|in mumbai|in delhi|location)\b/.test(q)) return 'Local';
  if (/\b(buy|price|pricing|cost|hire|service|agency|company|book|quote)\b/.test(q)) return 'Commercial';
  if (/\b(how|what|why|when|where|guide|tutorial|meaning|difference|best)\b/.test(q)) return 'Informational';
  return 'Mixed';
}

function getKeywordType(query: string, property?: string) {
  const q = query.toLowerCase();
  let hostname = '';
  try { hostname = property ? new URL(property).hostname.replace(/^www\./, '').split('.')[0].toLowerCase() : ''; } catch { hostname = ''; }
  return hostname && q.includes(hostname) ? 'Branded' : 'Non-branded';
}

function getGscOpportunityScore(row: GoogleQueryRow) {
  const position = Number(row.position ?? 0);
  const impressions = Number(row.impressions ?? 0);
  const ctr = Number(row.ctr ?? 0);
  const clicks = Number(row.clicks ?? 0);
  let score = 0;
  if (position >= 4 && position <= 10) score += 40;
  else if (position > 10 && position <= 20) score += 30;
  else if (position > 20) score += 15;
  else if (position >= 1 && position < 4) score += 20;
  if (impressions >= 100) score += 30;
  else if (impressions >= 50) score += 25;
  else if (impressions >= 20) score += 20;
  else if (impressions >= 5) score += 10;
  else if (impressions > 0) score += 5;
  if (impressions >= 5 && ctr < 0.02) score += 20;
  else if (impressions >= 3 && ctr < 0.05) score += 15;
  else if (ctr >= 0.05) score += 10;
  if (clicks > 0) score += 10;
  return Math.min(100, score);
}

function getOpportunityLabel(row: GoogleQueryRow) {
  const position = Number(row.position ?? 0);
  const impressions = Number(row.impressions ?? 0);
  const ctr = Number(row.ctr ?? 0);
  if (position >= 4 && position <= 10 && impressions >= 5) return 'Quick Win';
  if (impressions >= 5 && ctr < 0.02) return 'CTR Opportunity';
  if (position >= 1 && position <= 3) return 'Protect';
  if (position > 10 && position <= 20) return 'Growth';
  return 'Visibility';
}

export default function KeywordsPage() {
  const [data, setData] =
    useState<GoogleQueriesResponse | null>(null);

  const [range, setRange] =
    useState<DateRangeKey>('90');

  const [search, setSearch] =
    useState('');

  const [sortBy, setSortBy] =
    useState<'clicks' | 'impressions' | 'position' | 'ctr'>(
      'clicks',
    );

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState('');
const [selectedKeyword, setSelectedKeyword] =
  useState<GoogleQueryRow | null>(null);

const [analysis, setAnalysis] =
  useState<GoogleOpportunityAnalysis | null>(null);

const [analysisLoading, setAnalysisLoading] =
  useState(false);

const [analysisError, setAnalysisError] =
  useState('');
  const dateRange = useMemo(
    () => getRange(range),
    [range],
  );

  const loadData = useCallback(
    async () => {
      try {
        setError('');

        const result =
          await getGoogleQueries(
            dateRange.startDate,
            dateRange.endDate,
          );

        setData(result);
      } catch (err) {
        console.error(
          'Failed to load Search Console queries:',
          err,
        );

        setData(null);

        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load Google Search Console keyword data.',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      dateRange.startDate,
      dateRange.endDate,
    ],
  );

  const handleAnalyzeKeyword = useCallback(
    async (row: GoogleQueryRow) => {
      setSelectedKeyword(row);
      setAnalysis(null);
      setAnalysisError('');
      setAnalysisLoading(true);

      try {
        const result =
          await analyzeGoogleOpportunity(
            dateRange.startDate,
            dateRange.endDate,
            row.query,
          );

        setAnalysis(result);
      } catch (err) {
        console.error(
          'Failed to analyze keyword:',
          err,
        );

        setAnalysisError(
          err instanceof Error
            ? err.message
            : 'Unable to analyze this keyword.',
        );
      } finally {
        setAnalysisLoading(false);
      }
    },
    [
      dateRange.startDate,
      dateRange.endDate,
    ],
  );

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  const rows = data?.rows ?? [];

  const totals = useMemo(() => {
    const clicks = rows.reduce(
      (sum, row) =>
        sum + Number(row.clicks ?? 0),
      0,
    );

    const impressions = rows.reduce(
      (sum, row) =>
        sum + Number(row.impressions ?? 0),
      0,
    );

    const weightedPosition = rows.reduce(
      (sum, row) =>
        sum +
        Number(row.position ?? 0) *
          Number(row.impressions ?? 0),
      0,
    );

    const weightedCtr = rows.reduce(
      (sum, row) =>
        sum +
        Number(row.ctr ?? 0) *
          Number(row.impressions ?? 0),
      0,
    );

    return {
      keywords: rows.length,
      clicks,
      impressions,
      ctr:
        impressions > 0
          ? weightedCtr / impressions
          : 0,
      position:
        impressions > 0
          ? weightedPosition / impressions
          : 0,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const query =
      search.trim().toLowerCase();

    return [...rows]
      .filter((row) =>
        query
          ? row.query
              .toLowerCase()
              .includes(query)
          : true,
      )
      .sort((a, b) => {
        if (sortBy === 'clicks') {
          return b.clicks - a.clicks;
        }

        if (sortBy === 'impressions') {
          return (
            b.impressions -
            a.impressions
          );
        }

        if (sortBy === 'position') {
          return (
            a.position -
            b.position
          );
        }

        return b.ctr - a.ctr;
      });
  }, [
    rows,
    search,
    sortBy,
  ]);

  const quickWins = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.position >= 4 &&
          row.position <= 10 &&
          row.impressions >= 5,
      ).length,
    [rows],
  );

  const pageOne = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.position >= 1 &&
          row.position <= 10,
      ).length,
    [rows],
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

return (
  <div className="min-h-screen bg-slate-50 text-slate-900">
    <Sidebar
      mobileOpen={false}
      onClose={() => {}}
    />

    <main className="lg:pl-[270px]">
        <header className="flex min-h-[72px] items-center justify-between gap-4 border-b border-slate-100 bg-white px-5 lg:px-8">
          <div>
            <div className="text-sm font-semibold text-slate-500">
              RENKO / Keywords
            </div>

            <div className="mt-0.5 text-xs text-slate-400">
              Organic search queries and ranking intelligence from Google Search Console
            </div>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              size={16}
              className={
                refreshing
                  ? 'animate-spin'
                  : ''
              }
            />
            Refresh
          </button>
        </header>

        <section className="mx-auto max-w-[1500px] p-5 lg:p-8">
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm lg:p-7">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                  <Target size={23} />
                </div>

                <div>
                  <h1 className="text-2xl font-bold">
                    Keywords
                  </h1>

                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                    See which Google searches bring visibility to the website, where the site ranks and which keywords deserve attention.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative">
                  <select
                    value={range}
                    onChange={(event) =>
                      setRange(
                        event.target
                          .value as DateRangeKey,
                      )
                    }
                    className="appearance-none rounded-xl border border-slate-200 bg-white py-3 pl-4 pr-10 text-sm font-semibold outline-none focus:border-blue-400"
                  >
                    <option value="7">
                      Last 7 days
                    </option>
                    <option value="28">
                      Last 28 days
                    </option>
                    <option value="90">
                      Last 90 days
                    </option>
                  </select>

                  <ChevronDown
                    size={16}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                </div>
              </div>
            </div>

            {data?.property && (
              <div className="mt-5 rounded-xl bg-slate-50 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Search Console Property
                </div>

                <div className="mt-1 break-all text-sm font-bold text-slate-800">
                  {data.property}
                </div>

                <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  <CalendarDays size={14} />

                  {data.startDate}
                  {' → '}
                  {data.endDate}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
              <div className="text-sm font-bold text-red-800">
                Search Console error
              </div>

              <div className="mt-1 text-sm leading-6 text-red-700">
                {error}
              </div>
            </div>
          )}

          {loading ? (
            <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-12 text-center shadow-sm">
              <RefreshCw
                size={30}
                className="mx-auto animate-spin text-blue-600"
              />

              <div className="mt-4 text-sm font-bold">
                Loading keyword data...
              </div>

              <div className="mt-1 text-sm text-slate-500">
                RENKO is retrieving Search Console query data.
              </div>
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  title="Keywords"
                  value={formatNumber(
                    totals.keywords,
                  )}
                  subtitle="Search queries returned by Search Console"
                  icon={<Search size={18} />}
                />

                <MetricCard
                  title="Clicks"
                  value={formatNumber(
                    totals.clicks,
                  )}
                  subtitle="Organic clicks generated"
                  icon={
                    <MousePointerClick
                      size={18}
                    />
                  }
                />

                <MetricCard
                  title="Impressions"
                  value={formatNumber(
                    totals.impressions,
                  )}
                  subtitle="Google search impressions"
                  icon={<Eye size={18} />}
                />

                <MetricCard
                  title="Avg. Position"
                  value={
                    totals.position
                      ? totals.position.toFixed(
                          1,
                        )
                      : '—'
                  }
                  subtitle="Impression-weighted average position"
                  icon={
                    <BarChart3 size={18} />
                  }
                />
              </div>

              <div className="mt-5 grid gap-5 md:grid-cols-3">
                <SmallSignal
                  label="Organic CTR"
                  value={formatPercent(
                    totals.ctr,
                  )}
                  detail="Weighted by impressions"
                />

                <SmallSignal
                  label="Page 1 Keywords"
                  value={formatNumber(
                    pageOne,
                  )}
                  detail="Queries ranking in positions 1–10"
                />

                <SmallSignal
                  label="Quick Wins"
                  value={formatNumber(
                    quickWins,
                  )}
                  detail="Queries ranking positions 4–10"
                />
              </div>

              <section className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-lg font-bold">
                      Organic Keywords
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                      Search queries reported by Google Search Console for the selected period.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative">
                      <Search
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />

                      <input
                        value={search}
                        onChange={(event) =>
                          setSearch(
                            event.target.value,
                          )
                        }
                        placeholder="Search keywords..."
                        className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400 sm:w-[240px]"
                      />
                    </div>

                    <select
                      value={sortBy}
                      onChange={(event) =>
                        setSortBy(
                          event.target
                            .value as typeof sortBy,
                        )
                      }
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-blue-400"
                    >
                      <option value="clicks">
                        Sort: Clicks
                      </option>

                      <option value="impressions">
                        Sort: Impressions
                      </option>

                      <option value="position">
                        Sort: Position
                      </option>

                      <option value="ctr">
                        Sort: CTR
                      </option>
                    </select>
                  </div>
                </div>

                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[1200px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <Th>Keyword</Th>
                        <Th>Intent</Th>
                        <Th>Type</Th>
                        <Th>Clicks</Th>
                        <Th>Impressions</Th>
                        <Th>CTR</Th>
                        <Th>Position</Th>
                        <Th>Score</Th>
                        <Th>Opportunity</Th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredRows.map(
                        (
                          row: GoogleQueryRow,
                          index,
                        ) => {
                          return (
                            <tr
                              key={`${row.query}-${index}`}
                              onClick={() => handleAnalyzeKeyword(row)}
                              className={`cursor-pointer border-b border-slate-50 transition hover:bg-blue-50 ${selectedKeyword?.query === row.query ? 'bg-blue-50' : ''}`}
                            >
                              <Td strong>
                                <div className="max-w-[300px] truncate">{row.query}</div>
                              </Td>
                              <Td>
                                <span className="inline-flex rounded-lg bg-slate-50 px-2.5 py-1 font-semibold text-slate-600">{getKeywordIntent(row.query)}</span>
                              </Td>
                              <Td>
                                <span className={`inline-flex rounded-lg px-2.5 py-1 font-semibold ${getKeywordType(row.query, data?.property) === 'Branded' ? 'bg-violet-50 text-violet-700' : 'bg-slate-50 text-slate-600'}`}>
                                  {getKeywordType(row.query, data?.property)}
                                </span>
                              </Td>
                              <Td>{formatNumber(row.clicks)}</Td>
                              <Td>{formatNumber(row.impressions)}</Td>
                              <Td>{formatPercent(row.ctr)}</Td>
                              <Td>
                                <span className={`inline-flex rounded-lg px-2.5 py-1 font-bold ${positionTone(row.position)}`}>{positionLabel(row.position)}</span>
                              </Td>
                              <Td>
                                <span className="font-bold text-slate-700">{getGscOpportunityScore(row)}</span>
                              </Td>
                              <Td>
                                {getOpportunityLabel(row) === 'Quick Win' ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 font-bold text-amber-700"><TrendingUp size={13} />Quick Win</span>
                                ) : getOpportunityLabel(row) === 'Protect' ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 font-bold text-emerald-700"><Target size={13} />Protect</span>
                                ) : getOpportunityLabel(row) === 'CTR Opportunity' ? (
                                  <span className="inline-flex rounded-lg bg-purple-50 px-2.5 py-1 font-bold text-purple-700">CTR Opportunity</span>
                                ) : getOpportunityLabel(row) === 'Growth' ? (
                                  <span className="inline-flex rounded-lg bg-blue-50 px-2.5 py-1 font-bold text-blue-700">Growth</span>
                                ) : (
                                  <span className="inline-flex rounded-lg bg-slate-100 px-2.5 py-1 font-bold text-slate-600">Visibility</span>
                                )}
                              </Td>
                            </tr>
                          );
                        },
                      )}
                    </tbody>
                  </table>

                  {filteredRows.length ===
                    0 && (
                    <div className="p-10 text-center text-sm text-slate-500">
                      No keywords match your search.
                    </div>
                  )}

                  {selectedKeyword && (
                    <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/40 p-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="text-xs font-bold uppercase tracking-wide text-blue-600">
                            Keyword Intelligence
                          </div>

                          <h3 className="mt-1 text-xl font-bold text-slate-900">
                            {selectedKeyword.query}
                          </h3>

                          <p className="mt-1 text-sm text-slate-500">
                            Detailed SEO opportunity analysis from Google Search Console.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedKeyword(null);
                            setAnalysis(null);
                            setAnalysisError('');
                          }}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          Close
                        </button>
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <DetailMetric
                          label="Position"
                          value={positionLabel(
                            selectedKeyword.position,
                          )}
                        />

                        <DetailMetric
                          label="Impressions"
                          value={formatNumber(
                            selectedKeyword.impressions,
                          )}
                        />

                        <DetailMetric
                          label="Clicks"
                          value={formatNumber(
                            selectedKeyword.clicks,
                          )}
                        />

                        <DetailMetric
                          label="CTR"
                          value={formatPercent(
                            selectedKeyword.ctr,
                          )}
                        />
                      </div>

                      {analysisLoading && (
                        <div className="mt-5 flex items-center gap-2 rounded-xl border border-slate-100 bg-white p-5 text-sm font-medium text-slate-500">
                          <RefreshCw
                            size={16}
                            className="animate-spin"
                          />
                          Analyzing keyword opportunity...
                        </div>
                      )}

                      {analysisError && (
                        <div className="mt-5 rounded-xl border border-red-100 bg-red-50 p-5 text-sm text-red-700">
                          {analysisError}
                        </div>
                      )}

                      {analysis && (
                        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.4fr]">
                          <div className="rounded-xl border border-slate-100 bg-white p-5">
                            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                              Opportunity
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              <span className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">
                                {analysis.opportunityType.replaceAll(
                                  '_',
                                  ' ',
                                )}
                              </span>

                              <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">
                                {analysis.priority}
                              </span>

                              <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
                                {analysis.rankingStage.replaceAll(
                                  '_',
                                  ' ',
                                )}
                              </span>
                            </div>

                            <div className="mt-5">
                              <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                                Ranking Page
                              </div>

                              {analysis.page ? (
                                <a
                                  href={analysis.page}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(event) =>
                                    event.stopPropagation()
                                  }
                                  className="mt-2 flex items-center gap-2 break-all text-sm font-semibold text-blue-600 hover:underline"
                                >
                                  {analysis.page}
                                  <ExternalLink size={14} />
                                </a>
                              ) : (
                                <div className="mt-2 text-sm text-slate-500">
                                  No ranking page mapped.
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="rounded-xl border border-slate-100 bg-white p-5">
                            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                              RENKO Recommendations
                            </div>

                            <div className="mt-4 space-y-3">
                              {analysis.recommendations.map(
                                (
                                  recommendation,
                                  index,
                                ) => (
                                  <div
                                    key={`${recommendation}-${index}`}
                                    className="flex gap-3 rounded-xl bg-slate-50 p-4"
                                  >
                                    <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                                      {index + 1}
                                    </div>

                                    <p className="text-sm leading-6 text-slate-600">
                                      {recommendation}
                                    </p>
                                  </div>
                                ),
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>

              <section className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                    <TrendingUp size={19} />
                  </div>

                  <div>
                    <h2 className="text-sm font-bold">
                      RENKO Keyword Signal
                    </h2>

                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      Keywords are sourced directly from the connected Google Search Console property. RENKO highlights positions 4–10 as potential quick wins because those queries already have page-one visibility.
                    </p>
                  </div>
                </div>
              </section>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function DetailMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </div>

      <div className="mt-2 text-xl font-bold text-slate-900">
        {value}
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-slate-500">
          {title}
        </div>

        <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-600">
          {icon}
        </div>
      </div>

      <div className="mt-4 text-3xl font-bold">
        {value}
      </div>

      <div className="mt-2 text-xs leading-5 text-slate-400">
        {subtitle}
      </div>
    </div>
  );
}

function SmallSignal({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </div>

      <div className="mt-2 text-2xl font-bold">
        {value}
      </div>

      <div className="mt-1 text-xs text-slate-400">
        {detail}
      </div>
    </div>
  );
}

function Th({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <th className="px-3 py-3 font-semibold text-slate-400">
      {children}
    </th>
  );
}

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

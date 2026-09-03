'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  AlertTriangle,
  BarChart3,
  Check,
  CheckCircle2,
  Clipboard,
  FileText,
  Filter,
  ExternalLink,
  Lightbulb,
  Loader2,
  RefreshCw,
  Search,
  Target,
  TrendingUp,
  X,
  XCircle,
} from 'lucide-react';

import Sidebar from '../../components/Sidebar';

import {
  analyzeGoogleOpportunity,
  getContentOpportunities,
  type ContentOpportunity,
  type ContentOpportunitiesResponse,
  type GoogleOpportunityAnalysis,
} from '../../lib/api';

type DateRangeKey = '7' | '28' | '90';

type PriorityFilter =
  | 'ALL'
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW';

type Brief = {
  query: string;
  page: string | null;
  intent: string;
  recommendedPageType: string;
  contentAction: string;
  suggestedTitle: string;
  suggestedMetaDescription: string;
  h1: string;
  headings: string[];
  internalLinkIdeas: string[];
  checklist: string[];
};

function formatDate(date: Date) {
  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1,
  ).padStart(2, '0');

  const day = String(
    date.getDate(),
  ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getDateRange(
  days: DateRangeKey,
) {
  const end = new Date();

  const start = new Date(end);

  start.setDate(
    start.getDate() -
      (Number(days) - 1),
  );

  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
    label:
      days === '7'
        ? 'Last 7 days'
        : days === '28'
          ? 'Last 28 days'
          : 'Last 90 days',
  };
}

function formatNumber(
  value: number,
) {
  return new Intl.NumberFormat(
    'en-US',
  ).format(
    Math.round(
      Number(value ?? 0),
    ),
  );
}

function formatPercent(
  value: number,
) {
  return `${(
    Number(value ?? 0) * 100
  ).toFixed(1)}%`;
}

function formatPosition(
  value: number,
) {
  return Number(
    value ?? 0,
  ).toFixed(1);
}

function getPriorityClass(
  priority: ContentOpportunity['priority'],
) {
  if (priority === 'HIGH') {
    return 'bg-red-50 text-red-700 border-red-100';
  }

  if (priority === 'MEDIUM') {
    return 'bg-amber-50 text-amber-700 border-amber-100';
  }

  return 'bg-slate-50 text-slate-600 border-slate-100';
}

function getTypeLabel(
  type: string,
) {
  switch (type) {
    case 'QUICK_WIN':
      return 'Quick Win';

    case 'PAGE_ONE_GROWTH':
      return 'Page 1 Growth';

    case 'RANKING_GROWTH':
      return 'Ranking Growth';

    case 'CONTENT_PROTECTION':
      return 'Content Protection';

    case 'LOW_CTR':
      return 'Low CTR';

    case 'CONTENT_GROWTH':
      return 'Content Growth';

    case 'TOP_POSITION':
      return 'Top Position';

    case 'VISIBILITY':
      return 'Visibility';

    case 'BEYOND_PAGE_ONE':
      return 'Beyond Page 1';

    case 'PAGE_1':
      return 'Page 1';

    case 'PAGE_2':
      return 'Page 2';

    case 'TOP_3':
      return 'Top 3';

    default:
      return type
        .replaceAll('_', ' ')
        .toLowerCase()
        .replace(
          /\b\w/g,
          (char) =>
            char.toUpperCase(),
        );
  }
}

function getAnalysisStatusClass(
  status: string,
) {
  if (status === 'PASS') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  }

  return 'bg-amber-50 text-amber-700 border-amber-100';
}

function getAnalysisStatusLabel(
  status: string,
) {
  return status === 'PASS'
    ? 'PASS'
    : 'NEEDS ATTENTION';
}

function inferIntent(
  query: string,
) {
  const value =
    query.toLowerCase();

  if (
    /\b(buy|price|pricing|cost|hire|service|agency|company|near me)\b/.test(
      value,
    )
  ) {
    return 'Commercial';
  }

  if (
    /\b(best|top|vs|versus|compare|comparison|review)\b/.test(
      value,
    )
  ) {
    return 'Commercial Investigation';
  }

  if (
    /\b(how|what|why|guide|meaning|learn|tips|ideas)\b/.test(
      value,
    )
  ) {
    return 'Informational';
  }

  if (
    /\b(login|signin|sign in|website)\b/.test(
      value,
    )
  ) {
    return 'Navigational';
  }

  return 'Informational';
}

function getRecommendedPageType(
  opportunity: ContentOpportunity,
  intent: string,
) {
  if (
    opportunity.type ===
      'LOW_CTR' ||
    opportunity.type ===
      'TOP_POSITION'
  ) {
    return 'Existing Landing Page';
  }

  if (
    intent === 'Commercial' ||
    intent ===
      'Commercial Investigation'
  ) {
    return 'Service / Landing Page';
  }

  return 'SEO Blog / Guide';
}

function cleanQuery(
  query: string,
) {
  return query
    .trim()
    .replace(/\s+/g, ' ');
}

function titleCase(
  value: string,
) {
  return value
    .split(' ')
    .filter(Boolean)
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1),
    )
    .join(' ');
}

function buildBrief(
  opportunity: ContentOpportunity,
): Brief {
  const query =
    cleanQuery(
      opportunity.query,
    );

  const intent =
    inferIntent(query);

  const recommendedPageType =
    getRecommendedPageType(
      opportunity,
      intent,
    );

  const isExistingPage =
    Boolean(opportunity.page);

  let contentAction =
    'Improve the existing ranking page to better satisfy the search intent.';

  if (
    opportunity.type ===
    'QUICK_WIN'
  ) {
    contentAction =
      'Optimize the existing ranking page and strengthen topical relevance to move this query toward the top 3.';
  } else if (
    opportunity.type ===
    'LOW_CTR'
  ) {
    contentAction =
      'Prioritize title and meta description improvements before making major content changes.';
  } else if (
    opportunity.type ===
    'RANKING_GROWTH'
  ) {
    contentAction =
      'Expand content depth, improve internal linking and strengthen topical coverage.';
  } else if (
    opportunity.type ===
    'VISIBILITY'
  ) {
    contentAction =
      'Build stronger topical relevance and supporting content around this search query.';
  }

  const suggestedTitle =
    `${titleCase(query)} | Complete Guide & Expert Tips`;

  const suggestedMetaDescription =
    `Learn about ${query}, key considerations, practical tips and what to do next. Get clear, useful information from RENKO.`;

  const h1 =
    titleCase(query);

  const headings = [
    `What is ${query}?`,
    `Why ${query} matters`,
    `Key factors to consider`,
    `Common mistakes to avoid`,
    `Frequently asked questions`,
    `Next steps`,
  ];

  const internalLinkIdeas = [
    'Link from a relevant high-authority page on the website.',
    'Link to the main service or conversion page where relevant.',
    'Add contextual links from related supporting articles.',
  ];

  const checklist = [
    'Match the page content to the actual search intent.',
    'Improve the title and meta description.',
    'Use the target query naturally in the H1 and relevant headings.',
    'Add useful supporting sections and FAQs.',
    'Add relevant internal links.',
    'Review competing Google results before publishing major changes.',
    'Monitor Search Console performance after the update.',
  ];

  return {
    query,
    page:
      opportunity.page ??
      null,
    intent,
    recommendedPageType,
    contentAction,
    suggestedTitle,
    suggestedMetaDescription,
    h1,
    headings,
    internalLinkIdeas,
    checklist,
  };
}

function buildBriefText(
  brief: Brief,
) {
  return [
    `RENKO CONTENT BRIEF`,
    ``,
    `Target query: ${brief.query}`,
    `Search intent: ${brief.intent}`,
    `Recommended page type: ${brief.recommendedPageType}`,
    `Existing page: ${brief.page ?? 'None mapped'}`,
    ``,
    `CONTENT ACTION`,
    brief.contentAction,
    ``,
    `SUGGESTED TITLE`,
    brief.suggestedTitle,
    ``,
    `META DESCRIPTION`,
    brief.suggestedMetaDescription,
    ``,
    `H1`,
    brief.h1,
    ``,
    `CONTENT OUTLINE`,
    ...brief.headings.map(
      (item, index) =>
        `${index + 1}. ${item}`,
    ),
    ``,
    `INTERNAL LINK IDEAS`,
    ...brief.internalLinkIdeas.map(
      (item) => `- ${item}`,
    ),
    ``,
    `SEO CHECKLIST`,
    ...brief.checklist.map(
      (item) => `- ${item}`,
    ),
  ].join('\n');
}

export default function ContentPage() {
  const [
    data,
    setData,
  ] =
    useState<ContentOpportunitiesResponse | null>(
      null,
    );

  const [
    selectedRange,
    setSelectedRange,
  ] =
    useState<DateRangeKey>('90');

  const [
    filter,
    setFilter,
  ] =
    useState<PriorityFilter>('ALL');

  const [
    search,
    setSearch,
  ] = useState('');

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState('');

  const [
    selectedOpportunity,
    setSelectedOpportunity,
  ] =
    useState<ContentOpportunity | null>(
      null,
    );

  const [
    analysis,
    setAnalysis,
  ] =
    useState<GoogleOpportunityAnalysis | null>(
      null,
    );

  const [
    analysisLoading,
    setAnalysisLoading,
  ] = useState(false);

  const [
    analysisError,
    setAnalysisError,
  ] = useState('');

  const [
    briefOpportunity,
    setBriefOpportunity,
  ] =
    useState<ContentOpportunity | null>(
      null,
    );

  const [
    copied,
    setCopied,
  ] = useState(false);

  const dateRange =
    useMemo(
      () =>
        getDateRange(
          selectedRange,
        ),
      [selectedRange],
    );

  const loadData =
    useCallback(
      async () => {
        try {
          setLoading(true);
          setError('');

          const response =
            await getContentOpportunities(
              dateRange.startDate,
              dateRange.endDate,
            );

          setData(response);
        } catch (err) {
          console.error(
            'Failed to load content opportunities:',
            err,
          );

          setData(null);

          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load content opportunities.',
          );
        } finally {
          setLoading(false);
        }
      },
      [
        dateRange.startDate,
        dateRange.endDate,
      ],
    );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh =
    async () => {
      try {
        setRefreshing(true);
        await loadData();
      } finally {
        setRefreshing(false);
      }
    };

  const handleAnalyze =
    async (
      opportunity: ContentOpportunity,
    ) => {
      setSelectedOpportunity(
        opportunity,
      );

      setAnalysis(null);
      setAnalysisError('');
      setAnalysisLoading(true);

      try {
        const result =
          await analyzeGoogleOpportunity(
            dateRange.startDate,
            dateRange.endDate,
            opportunity.query,
            opportunity.page ??
              undefined,
          );

        setAnalysis(result);
      } catch (err) {
        console.error(
          'Failed to analyze opportunity:',
          err,
        );

        setAnalysisError(
          err instanceof Error
            ? err.message
            : 'Unable to analyze this opportunity.',
        );
      } finally {
        setAnalysisLoading(false);
      }
    };

  const closeAnalysis =
    () => {
      if (analysisLoading) {
        return;
      }

      setSelectedOpportunity(
        null,
      );

      setAnalysis(null);
      setAnalysisError('');
    };

  const openBrief =
    (opportunity: ContentOpportunity) => {
      setBriefOpportunity(
        opportunity,
      );
      setCopied(false);
    };

  const closeBrief =
    () => {
      setBriefOpportunity(null);
      setCopied(false);
    };

  const copyBrief =
    async () => {
      if (!briefOpportunity) {
        return;
      }

      const brief =
        buildBrief(
          briefOpportunity,
        );

      try {
        await navigator.clipboard.writeText(
          buildBriefText(brief),
        );

        setCopied(true);

        window.setTimeout(
          () => setCopied(false),
          1800,
        );
      } catch (err) {
        console.error(
          'Unable to copy content brief:',
          err,
        );
      }
    };

  const opportunities =
    data?.opportunities ?? [];

  const filteredOpportunities =
    useMemo(() => {
      const normalizedSearch =
        search
          .trim()
          .toLowerCase();

      return opportunities.filter(
        (item) => {
          const priorityMatch =
            filter === 'ALL' ||
            item.priority ===
              filter;

          if (!priorityMatch) {
            return false;
          }

          if (
            !normalizedSearch
          ) {
            return true;
          }

          return (
            item.query
              .toLowerCase()
              .includes(
                normalizedSearch,
              ) ||
            (
              item.page ??
              ''
            )
              .toLowerCase()
              .includes(
                normalizedSearch,
              ) ||
            item.type
              .toLowerCase()
              .includes(
                normalizedSearch,
              )
          );
        },
      );
    }, [
      opportunities,
      filter,
      search,
    ]);

  const stats =
    useMemo(() => {
      return {
        total:
          opportunities.length,

        high:
          opportunities.filter(
            (item) =>
              item.priority ===
              'HIGH',
          ).length,

        medium:
          opportunities.filter(
            (item) =>
              item.priority ===
              'MEDIUM',
          ).length,

        low:
          opportunities.filter(
            (item) =>
              item.priority ===
              'LOW',
          ).length,

        quickWins:
          opportunities.filter(
            (item) =>
              item.type ===
              'QUICK_WIN',
          ).length,

        lowCtr:
          opportunities.filter(
            (item) =>
              item.type ===
              'LOW_CTR',
          ).length,
      };
    }, [opportunities]);

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
              RENKO / Content Engine
            </div>

            <div className="mt-0.5 text-xs text-slate-400">
              Search-driven content
              opportunities powered by
              Google Search Console
            </div>
          </div>

          <button
            type="button"
            onClick={
              handleRefresh
            }
            disabled={
              refreshing ||
              loading
            }
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
                  <FileText
                    size={23}
                  />
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-bold">
                      Content Engine
                    </h1>

                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                      LIVE DATA
                    </span>
                  </div>

                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                    Discover content
                    opportunities from
                    real Google Search
                    Console data and
                    turn ranking signals
                    into actionable
                    content briefs.
                  </p>
                </div>
              </div>

              <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1">
                {(
                  [
                    {
                      key: '7',
                      label: '7D',
                    },
                    {
                      key: '28',
                      label: '28D',
                    },
                    {
                      key: '90',
                      label: '90D',
                    },
                  ] as const
                ).map(
                  (range) => (
                    <button
                      key={
                        range.key
                      }
                      type="button"
                      onClick={() =>
                        setSelectedRange(
                          range.key,
                        )
                      }
                      className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
                        selectedRange ===
                        range.key
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {
                        range.label
                      }
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="text-xs font-semibold text-slate-500">
                  Search Console period
                </div>

                <div className="mt-1 text-sm font-bold text-slate-800">
                  {
                    dateRange.startDate
                  }{' '}
                  →{' '}
                  {
                    dateRange.endDate
                  }
                </div>
              </div>

              <div className="rounded-xl bg-blue-50 p-4">
                <div className="text-xs font-semibold text-blue-600">
                  Data source
                </div>

                <div className="mt-1 text-sm font-bold text-blue-900">
                  Google Search Console
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
              <div className="flex items-start gap-3">
                <XCircle
                  size={20}
                  className="mt-0.5 shrink-0 text-red-600"
                />

                <div>
                  <div className="text-sm font-bold text-red-800">
                    Content Engine
                    error
                  </div>

                  <div className="mt-1 text-sm leading-6 text-red-700">
                    {error}
                  </div>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-12 shadow-sm">
              <div className="flex flex-col items-center justify-center text-center">
                <Loader2
                  size={32}
                  className="animate-spin text-blue-600"
                />

                <div className="mt-4 text-sm font-bold">
                  Loading content
                  opportunities...
                </div>

                <div className="mt-1 text-sm text-slate-500">
                  RENKO is analyzing
                  your Search Console
                  data.
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  title="Opportunities"
                  value={
                    stats.total
                  }
                  icon={
                    <Target
                      size={18}
                    />
                  }
                />

                <StatCard
                  title="High Priority"
                  value={
                    stats.high
                  }
                  icon={
                    <AlertTriangle
                      size={18}
                    />
                  }
                />

                <StatCard
                  title="Quick Wins"
                  value={
                    stats.quickWins
                  }
                  icon={
                    <TrendingUp
                      size={18}
                    />
                  }
                />

                <StatCard
                  title="Low CTR"
                  value={
                    stats.lowCtr
                  }
                  icon={
                    <BarChart3
                      size={18}
                    />
                  }
                />
              </div>

              <section className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-lg font-bold">
                      Content Opportunities
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                      {
                        filteredOpportunities.length
                      }{' '}
                      opportunities
                      matching your
                      current filters.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative">
                      <Search
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />

                      <input
                        value={
                          search
                        }
                        onChange={(
                          event,
                        ) =>
                          setSearch(
                            event
                              .target
                              .value,
                          )
                        }
                        placeholder="Search query or page..."
                        className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400 sm:w-[260px]"
                      />
                    </div>

                    <div className="flex items-center gap-1 rounded-xl border border-slate-200 p-1">
                      <Filter
                        size={15}
                        className="ml-2 text-slate-400"
                      />

                      {(
                        [
                          'ALL',
                          'HIGH',
                          'MEDIUM',
                          'LOW',
                        ] as const
                      ).map(
                        (item) => (
                          <button
                            key={
                              item
                            }
                            type="button"
                            onClick={() =>
                              setFilter(
                                item,
                              )
                            }
                            className={`rounded-lg px-3 py-2 text-[11px] font-bold transition ${
                              filter ===
                              item
                                ? 'bg-slate-900 text-white'
                                : 'text-slate-500 hover:bg-slate-50'
                            }`}
                          >
                            {item}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                </div>

                {filteredOpportunities.length ===
                0 ? (
                  <div className="mt-6 rounded-xl bg-slate-50 p-10 text-center">
                    <CheckCircle2
                      size={36}
                      className="mx-auto text-slate-300"
                    />

                    <div className="mt-3 text-sm font-bold">
                      No opportunities
                      found
                    </div>

                    <div className="mt-1 text-xs text-slate-500">
                      Try another date
                      range or remove
                      your filters.
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full min-w-[1250px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <Th>
                            Query
                          </Th>

                          <Th>
                            Ranking Page
                          </Th>

                          <Th>
                            Priority
                          </Th>

                          <Th>
                            Type
                          </Th>

                          <Th>
                            Position
                          </Th>

                          <Th>
                            Impressions
                          </Th>

                          <Th>
                            CTR
                          </Th>

                          <Th>
                            Clicks
                          </Th>

                          <Th>
                            Recommendation
                          </Th>

                          <Th>
                            Actions
                          </Th>
                        </tr>
                      </thead>

                      <tbody>
                        {filteredOpportunities.map(
                          (
                            item,
                            index,
                          ) => (
                            <tr
                              key={`${item.query}-${item.page}-${index}`}
                              className="border-b border-slate-50 transition hover:bg-slate-50"
                            >
                              <Td strong>
                                <div className="max-w-[220px] truncate">
                                  {
                                    item.query
                                  }
                                </div>
                              </Td>

                              <Td>
                                <div className="max-w-[220px] truncate text-slate-500">
                                  {item.page ||
                                    'No ranking page mapped'}
                                </div>
                              </Td>

                              <Td>
                                <span
                                  className={`inline-flex rounded-lg border px-2 py-1 text-[10px] font-bold ${getPriorityClass(
                                    item.priority,
                                  )}`}
                                >
                                  {
                                    item.priority
                                  }
                                </span>
                              </Td>

                              <Td>
                                <span className="inline-flex rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">
                                  {getTypeLabel(
                                    item.type,
                                  )}
                                </span>
                              </Td>

                              <Td>
                                <span className="font-bold text-slate-700">
                                  {formatPosition(
                                    item.position,
                                  )}
                                </span>
                              </Td>

                              <Td>
                                {formatNumber(
                                  item.impressions,
                                )}
                              </Td>

                              <Td>
                                {formatPercent(
                                  item.ctr,
                                )}
                              </Td>

                              <Td>
                                {formatNumber(
                                  item.clicks,
                                )}
                              </Td>

                              <Td>
                                <div className="max-w-[300px] leading-5 text-slate-500">
                                  {
                                    item.recommendation
                                  }
                                </div>
                              </Td>

                              <Td>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleAnalyze(
                                        item,
                                      )
                                    }
                                    disabled={
                                      analysisLoading &&
                                      selectedOpportunity?.query ===
                                        item.query
                                    }
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {analysisLoading &&
                                    selectedOpportunity?.query ===
                                      item.query ? (
                                      <>
                                        <Loader2
                                          size={
                                            13
                                          }
                                          className="animate-spin"
                                        />
                                        Analyzing
                                      </>
                                    ) : (
                                      <>
                                        <Target
                                          size={
                                            13
                                          }
                                        />
                                        Analyze
                                      </>
                                    )}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      openBrief(
                                        item,
                                      )
                                    }
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50"
                                  >
                                    <Lightbulb
                                      size={
                                        13
                                      }
                                    />
                                    Brief
                                  </button>
                                </div>
                              </Td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="mt-6 grid gap-5 lg:grid-cols-3">
                <SignalCard
                  icon={
                    <Target
                      size={19}
                    />
                  }
                  title="Ranking Opportunities"
                  value={
                    stats.quickWins +
                    opportunities.filter(
                      (item) =>
                        item.type ===
                        'RANKING_GROWTH',
                    ).length
                  }
                  description="Queries where stronger content can potentially improve ranking."
                />

                <SignalCard
                  icon={
                    <BarChart3
                      size={19}
                    />
                  }
                  title="CTR Opportunities"
                  value={
                    stats.lowCtr
                  }
                  description="Existing impressions that may benefit from better search snippets."
                />

                <SignalCard
                  icon={
                    <FileText
                      size={19}
                    />
                  }
                  title="Content Briefs"
                  value={
                    opportunities.length
                  }
                  description="Every opportunity can be converted into a structured SEO brief."
                />
              </section>

              <section className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                    <FileText
                      size={19}
                    />
                  </div>

                  <div>
                    <h2 className="text-sm font-bold">
                      RENKO Content Signal
                    </h2>

                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      Opportunities are
                      derived from actual
                      Google Search Console
                      queries, impressions,
                      clicks, CTR and
                      average ranking
                      position. RENKO does
                      not invent search
                      demand or ranking
                      data.
                    </p>
                  </div>
                </div>
              </section>
            </>
          )}
        </section>
      </main>

      {/* ANALYSIS DRAWER */}

      {selectedOpportunity && (
        <>
          <button
            type="button"
            aria-label="Close analysis"
            onClick={
              closeAnalysis
            }
            disabled={
              analysisLoading
            }
            className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[1px]"
          />

          <aside className="fixed right-0 top-0 z-50 h-screen w-full max-w-[540px] overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-5">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  RENKO Analysis
                </div>

                <h2 className="mt-1 text-lg font-bold">
                  Opportunity Analysis
                </h2>
              </div>

              <button
                type="button"
                onClick={
                  closeAnalysis
                }
                disabled={
                  analysisLoading
                }
                className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"
              >
                <X
                  size={18}
                />
              </button>
            </div>

            <div className="p-6">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Search Query
                </div>

                <div className="mt-2 break-words text-lg font-bold">
                  {
                    selectedOpportunity.query
                  }
                </div>

                <div className="mt-3 break-all text-xs leading-5 text-slate-500">
                  {
                    selectedOpportunity.page ||
                    'No ranking page mapped'
                  }
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span
                    className={`rounded-lg border px-2.5 py-1 text-[10px] font-bold ${getPriorityClass(
                      selectedOpportunity.priority,
                    )}`}
                  >
                    {
                      selectedOpportunity.priority
                    }
                  </span>

                  <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">
                    {getTypeLabel(
                      selectedOpportunity.type,
                    )}
                  </span>
                </div>
              </div>

              {analysisLoading ? (
                <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-10">
                  <div className="flex flex-col items-center text-center">
                    <Loader2
                      size={30}
                      className="animate-spin text-blue-600"
                    />

                    <div className="mt-4 text-sm font-bold">
                      Analyzing opportunity...
                    </div>

                    <div className="mt-1 text-xs leading-5 text-slate-500">
                      RENKO is checking
                      Search Console
                      performance and
                      ranking signals.
                    </div>
                  </div>
                </div>
              ) : analysisError ? (
                <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
                  <div className="flex items-start gap-3">
                    <XCircle
                      size={19}
                      className="mt-0.5 shrink-0 text-red-600"
                    />

                    <div>
                      <div className="text-sm font-bold text-red-800">
                        Analysis failed
                      </div>

                      <div className="mt-1 text-sm leading-6 text-red-700">
                        {
                          analysisError
                        }
                      </div>
                    </div>
                  </div>
                </div>
              ) : analysis ? (
                <>
                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <AnalysisMetric
                      label="Position"
                      value={formatPosition(
                        Number(
                          analysis.position ??
                            0,
                        ),
                      )}
                    />

                    <AnalysisMetric
                      label="Impressions"
                      value={formatNumber(
                        Number(
                          analysis.impressions ??
                            0,
                        ),
                      )}
                    />

                    <AnalysisMetric
                      label="CTR"
                      value={formatPercent(
                        Number(
                          analysis.ctr ??
                            0,
                        ),
                      )}
                    />

                    <AnalysisMetric
                      label="Clicks"
                      value={formatNumber(
                        Number(
                          analysis.clicks ??
                            0,
                        ),
                      )}
                    />
                  </div>

                  <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                    <div className="text-sm font-bold">
                      Classification
                    </div>

                    <div className="mt-4 grid gap-3">
                      <InfoRow
                        label="Priority"
                        value={
                          analysis.priority
                        }
                      />

                      <InfoRow
                        label="Opportunity"
                        value={getTypeLabel(
                          analysis.opportunityType,
                        )}
                      />

                      <InfoRow
                        label="Ranking Stage"
                        value={getTypeLabel(
                          analysis.rankingStage,
                        )}
                      />
                    </div>
                  </div>

                  <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                    <div className="text-sm font-bold">
                      SEO Checks
                    </div>

                    <div className="mt-4 space-y-3">
                      <AnalysisCheck
                        label="Search Visibility"
                        status={
                          analysis
                            .checks
                            .searchVisibility
                            ?.status ??
                          'NEEDS_ATTENTION'
                        }
                        detail={`${formatNumber(
                          Number(
                            analysis
                              .checks
                              .searchVisibility
                              ?.impressions ??
                              0,
                          ),
                        )} impressions`}
                      />

                      <AnalysisCheck
                        label="Ranking"
                        status={
                          analysis
                            .checks
                            .ranking
                            ?.status ??
                          'NEEDS_ATTENTION'
                        }
                        detail={`Position ${formatPosition(
                          Number(
                            analysis
                              .checks
                              .ranking
                              ?.position ??
                              0,
                          ),
                        )}`}
                      />

                      <AnalysisCheck
                        label="Clicks"
                        status={
                          analysis
                            .checks
                            .clicks
                            ?.status ??
                          'NEEDS_ATTENTION'
                        }
                        detail={`${formatNumber(
                          Number(
                            analysis
                              .checks
                              .clicks
                              ?.clicks ??
                              0,
                          ),
                        )} clicks`}
                      />

                      <AnalysisCheck
                        label="CTR"
                        status={
                          analysis
                            .checks
                            .ctr
                            ?.status ??
                          'NEEDS_ATTENTION'
                        }
                        detail={formatPercent(
                          Number(
                            analysis
                              .checks
                              .ctr
                              ?.ctr ??
                              0,
                          ),
                        )}
                      />

                      <AnalysisCheck
                        label="Page Mapping"
                        status={
                          analysis
                            .checks
                            .pageMapping
                            ?.status ??
                          'NEEDS_ATTENTION'
                        }
                        detail={
                          analysis
                            .checks
                            .pageMapping
                            ?.page ||
                          'No page mapped'
                        }
                      />
                    </div>
                  </div>

                  <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold">
                          Recommended Actions
                        </div>

                        <div className="mt-1 text-xs text-slate-400">
                          Based on the
                          current Search
                          Console signals.
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          openBrief(
                            selectedOpportunity,
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-blue-700"
                      >
                        <Lightbulb
                          size={13}
                        />
                        Build Brief
                      </button>
                    </div>

                    {analysis.recommendations.length ===
                    0 ? (
                      <div className="mt-4 text-sm text-slate-500">
                        No additional
                        recommendations
                        available.
                      </div>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {analysis.recommendations.map(
                          (
                            recommendation,
                            index,
                          ) => (
                            <div
                              key={`${recommendation}-${index}`}
                              className="flex items-start gap-3 rounded-xl bg-slate-50 p-4"
                            >
                              <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-xs font-bold shadow-sm">
                                {index +
                                  1}
                              </div>

                              <div className="text-sm leading-6 text-slate-600">
                                {
                                  recommendation
                                }
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-5">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                      Data Source
                    </div>

                    <div className="mt-2 text-sm font-semibold">
                      Google Search Console
                    </div>

                    <div className="mt-1 break-all text-xs leading-5 text-slate-500">
                      {
                        analysis.property
                      }
                    </div>

                    <div className="mt-3 text-xs text-slate-400">
                      {
                        analysis.startDate
                      }{' '}
                      →{' '}
                      {
                        analysis.endDate
                      }
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </aside>
        </>
      )}

      {/* CONTENT BRIEF DRAWER */}

      {briefOpportunity && (
        <>
          <button
            type="button"
            aria-label="Close content brief"
            onClick={
              closeBrief
            }
            className="fixed inset-0 z-[60] bg-slate-900/30 backdrop-blur-[1px]"
          />

          <aside className="fixed right-0 top-0 z-[70] h-screen w-full max-w-[620px] overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
            {(() => {
              const brief =
                buildBrief(
                  briefOpportunity,
                );

              return (
                <>
                  <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-5">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wide text-blue-600">
                        RENKO Content Engine
                      </div>

                      <h2 className="mt-1 text-lg font-bold">
                        Content Brief
                      </h2>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={
                          copyBrief
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      >
                        {copied ? (
                          <Check
                            size={14}
                          />
                        ) : (
                          <Clipboard
                            size={14}
                          />
                        )}

                        {copied
                          ? 'Copied'
                          : 'Copy'}
                      </button>

                      <button
                        type="button"
                        onClick={
                          closeBrief
                        }
                        className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
                      >
                        <X
                          size={18}
                        />
                      </button>
                    </div>
                  </div>

                  <div className="p-6">
                    <div className="rounded-2xl bg-slate-900 p-5 text-white">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Target Query
                      </div>

                      <div className="mt-2 text-xl font-bold">
                        {
                          brief.query
                        }
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="rounded-lg bg-white/10 px-2.5 py-1 text-[10px] font-bold">
                          {brief.intent}
                        </span>

                        <span className="rounded-lg bg-white/10 px-2.5 py-1 text-[10px] font-bold">
                          {
                            brief.recommendedPageType
                          }
                        </span>
                      </div>
                    </div>

                    <BriefSection title="Content Action">
                      <div className="rounded-xl bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                        {
                          brief.contentAction
                        }
                      </div>
                    </BriefSection>

                    <BriefSection title="Current Ranking Signal">
                      <div className="grid grid-cols-3 gap-3">
                        <MiniMetric
                          label="Position"
                          value={formatPosition(
                            briefOpportunity.position,
                          )}
                        />

                        <MiniMetric
                          label="CTR"
                          value={formatPercent(
                            briefOpportunity.ctr,
                          )}
                        />

                        <MiniMetric
                          label="Impressions"
                          value={formatNumber(
                            briefOpportunity.impressions,
                          )}
                        />
                      </div>
                    </BriefSection>

                    <BriefSection title="SEO Title">
                      <CopyField
                        value={
                          brief.suggestedTitle
                        }
                      />
                    </BriefSection>

                    <BriefSection title="Meta Description">
                      <CopyField
                        value={
                          brief.suggestedMetaDescription
                        }
                      />
                    </BriefSection>

                    <BriefSection title="H1">
                      <CopyField
                        value={
                          brief.h1
                        }
                      />
                    </BriefSection>

                    <BriefSection title="Recommended Outline">
                      <div className="space-y-2">
                        {brief.headings.map(
                          (
                            heading,
                            index,
                          ) => (
                            <div
                              key={
                                heading
                              }
                              className="flex items-start gap-3 rounded-xl border border-slate-100 p-3"
                            >
                              <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-bold">
                                {index +
                                  1}
                              </div>

                              <div className="text-sm font-medium text-slate-700">
                                {heading}
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </BriefSection>

                    <BriefSection title="Internal Linking">
                      <div className="space-y-2">
                        {brief.internalLinkIdeas.map(
                          (
                            idea,
                          ) => (
                            <div
                              key={
                                idea
                              }
                              className="flex items-start gap-3 rounded-xl bg-slate-50 p-3"
                            >
                              <ExternalLink
                                size={
                                  15
                                }
                                className="mt-0.5 shrink-0 text-slate-400"
                              />

                              <div className="text-sm leading-5 text-slate-600">
                                {idea}
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </BriefSection>

                    <BriefSection title="Publishing Checklist">
                      <div className="space-y-2">
                        {brief.checklist.map(
                          (
                           item,
                          ) => (
                            <div
                              key={
                                item
                              }
                              className="flex items-start gap-3 rounded-xl border border-slate-100 p-3"
                            >
                              <CheckCircle2
                                size={
                                  16
                                }
                                className="mt-0.5 shrink-0 text-emerald-600"
                              />

                              <div className="text-sm leading-5 text-slate-600">
                                {item}
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </BriefSection>

                    <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50 p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle
                          size={17}
                          className="mt-0.5 shrink-0 text-amber-600"
                        />

                        <div>
                          <div className="text-xs font-bold text-amber-900">
                            RENKO note
                          </div>

                          <div className="mt-1 text-xs leading-5 text-amber-800">
                            This brief is
                            generated from
                            the Search
                            Console signal
                            and query
                            context. It is
                            not claiming
                            competitor or
                            keyword-volume
                            data that RENKO
                            has not collected.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </aside>
        </>
      )}
    </div>
  );
}

function BriefSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-6">
      <div className="mb-3 text-sm font-bold text-slate-900">
        {title}
      </div>

      {children}
    </section>
  );
}

function CopyField({
  value,
}: {
  value: string;
}) {
  const [
    copied,
    setCopied,
  ] = useState(false);

  const copy =
    async () => {
      try {
        await navigator.clipboard.writeText(
          value,
        );

        setCopied(true);

        window.setTimeout(
          () => setCopied(false),
          1500,
        );
      } catch (err) {
        console.error(
          'Copy failed:',
          err,
        );
      }
    };

  return (
    <div className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="min-w-0 flex-1 text-sm leading-6 text-slate-700">
        {value}
      </div>

      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-500 opacity-0 transition group-hover:opacity-100 hover:bg-slate-50"
        title="Copy"
      >
        {copied ? (
          <Check size={14} />
        ) : (
          <Clipboard
            size={14}
          />
        )}
      </button>
    </div>
  );
}

function MiniMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-[10px] font-semibold text-slate-400">
        {label}
      </div>

      <div className="mt-1 text-sm font-bold text-slate-800">
        {value}
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3">
      <span className="text-xs font-semibold text-slate-500">
        {label}
      </span>

      <span className="text-right text-xs font-bold text-slate-900">
        {value}
      </span>
    </div>
  );
}

function AnalysisMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold text-slate-400">
        {label}
      </div>

      <div className="mt-2 text-xl font-bold text-slate-900">
        {value}
      </div>
    </div>
  );
}

function AnalysisCheck({
  label,
  status,
  detail,
}: {
  label: string;
  status: string;
  detail: string;
}) {
  const passed =
    status === 'PASS';

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
      <div className="min-w-0">
        <div className="text-xs font-bold text-slate-700">
          {label}
        </div>

        <div className="mt-1 truncate text-[11px] text-slate-400">
          {detail}
        </div>
      </div>

      <span
        className={`shrink-0 rounded-lg border px-2 py-1 text-[9px] font-bold ${getAnalysisStatusClass(
          status,
        )}`}
      >
        {passed ? (
          <span className="inline-flex items-center gap-1">
            <CheckCircle2
              size={11}
            />

            {getAnalysisStatusLabel(
              status,
            )}
          </span>
        ) : (
          getAnalysisStatusLabel(
            status,
          )
        )}
      </span>
    </div>
  );
}

function SignalCard({
  title,
  value,
  description,
  icon,
}: {
  title: string;
  value: number;
  description: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
          {icon}
        </div>

        <div className="text-2xl font-bold">
          {formatNumber(value)}
        </div>
      </div>

      <div className="mt-4 text-sm font-bold">
        {title}
      </div>

      <div className="mt-1 text-xs leading-5 text-slate-500">
        {description}
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-slate-500">
          {title}
        </div>

        <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-600">
          {icon}
        </div>
      </div>

      <div className="mt-4 text-3xl font-bold">
        {formatNumber(value)}
      </div>
    </div>
  );
}

function Th({
  children,
}: {
  children: ReactNode;
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
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <td
      className={`px-3 py-4 ${
        strong
          ? 'font-semibold text-slate-700'
          : 'text-slate-500'
      }`}
    >
      {children}
    </td>
  );
}
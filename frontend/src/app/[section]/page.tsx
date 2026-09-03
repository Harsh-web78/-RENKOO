'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Globe2,
  Loader2,
  Menu,
  Play,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

import Sidebar from '../../components/Sidebar';

import {
  getCrawlAnalysis,
  getWebsites,
  startCrawl,
  Website,
} from '../../lib/api';

type Summary = {
  crawlId: string;
  websiteId: string;
  score: number;
  pages: number;
  totalIssues: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  open: number;
  resolved: number;
  ignored: number;
  fixed: number;
};

type Issue = {
  code: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  recommendation: string;
  affectedPages: number;
  affectedPercentage: number;
  priorityScore: number;
  isSiteWide?: boolean;
  pages?: {
    id: string;
    url: string;
  }[];
};

type Recommendation = {
  code: string;
  category: string;
  title: string;
  priority: string;
  urgency: string;
  impact: string;
  severity: string;
  affectedPages: number;
  affectedPercentage: number;
  priorityScore: number;
  problem: string;
  action: string;
  whyItMatters: string;
  suggestedFix: string;
};

type PageIntelligence = {
  id: string;
  url: string;
  title: string | null;
  issueCount: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  priority: string;
  priorityScore: number;
  issueCodes: string[];
};

type Analysis = {
  issues?: {
    intelligence?: Issue[];
    topPriority?: Issue[];
  };
  recommendations?: Recommendation[];
  pageIntelligence?: PageIntelligence[];
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-IN').format(
    Math.round(Number(value) || 0),
  );
}

function getScoreLabel(score: number) {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Good';
  if (score >= 70) return 'Needs Improvement';
  if (score >= 50) return 'Poor';
  return 'Critical';
}

function getScoreClass(score: number) {
  if (score >= 90) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }

  if (score >= 80) {
    return 'bg-blue-50 text-blue-700 border-blue-200';
  }

  if (score >= 70) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }

  if (score >= 50) {
    return 'bg-orange-50 text-orange-700 border-orange-200';
  }

  return 'bg-red-50 text-red-700 border-red-200';
}

function getSeverityClass(severity: string) {
  switch (severity?.toUpperCase()) {
    case 'CRITICAL':
      return 'bg-red-100 text-red-700 border-red-200';

    case 'HIGH':
      return 'bg-orange-100 text-orange-700 border-orange-200';

    case 'MEDIUM':
      return 'bg-amber-100 text-amber-700 border-amber-200';

    case 'LOW':
      return 'bg-blue-100 text-blue-700 border-blue-200';

    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

function getPriorityClass(priority: string) {
  switch (priority?.toUpperCase()) {
    case 'HIGH':
    case 'CRITICAL':
      return 'bg-red-50 text-red-700 border-red-200';

    case 'MEDIUM':
      return 'bg-amber-50 text-amber-700 border-amber-200';

    case 'LOW':
      return 'bg-blue-50 text-blue-700 border-blue-200';

    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

function formatLabel(value: string) {
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function truncateUrl(url: string, length = 90) {
  if (!url) return 'No URL';

  if (url.length <= length) {
    return url;
  }

  return `${url.slice(0, length)}...`;
}

export default function TechnicalSeoPage() {
  const [open, setOpen] = useState(false);

  const [websites, setWebsites] = useState<Website[]>([]);
  const [selectedWebsite, setSelectedWebsite] =
    useState<Website | null>(null);

  const [loadingWebsites, setLoadingWebsites] =
    useState(true);

  const [running, setRunning] = useState(false);

  const [loadingReport, setLoadingReport] =
    useState(false);

  const [error, setError] = useState('');

  const [summary, setSummary] =
    useState<Summary | null>(null);

  const [analysis, setAnalysis] =
    useState<Analysis | null>(null);

  const [showWebsiteMenu, setShowWebsiteMenu] =
    useState(false);

  const [expandedIssue, setExpandedIssue] =
    useState<string | null>(null);

  const [expandedRecommendation, setExpandedRecommendation] =
    useState<string | null>(null);

  const getAuthHeaders = useCallback(() => {
    const token =
      typeof window !== 'undefined'
        ? localStorage.getItem('renkoo_access_token')
        : null;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  }, []);

  const getLatestSummaryForWebsite = useCallback(
    async (websiteId: string): Promise<Summary> => {
      const response = await fetch(
        `http://localhost:4000/api/crawl/latest/${encodeURIComponent(
          websiteId,
        )}/summary`,
        {
          method: 'GET',
          headers: getAuthHeaders(),
        },
      );

      const data = await response
        .json()
        .catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.message ??
            'No valid completed crawl found for this website.',
        );
      }

      return data as Summary;
    },
    [getAuthHeaders],
  );

  const loadWebsites = useCallback(async () => {
    try {
      setLoadingWebsites(true);
      setError('');

      const data = await getWebsites();

      setWebsites(data);

      if (data.length === 0) {
        setSelectedWebsite(null);
        setSummary(null);
        setAnalysis(null);
        return;
      }

      const activeWebsite =
        data.find((website) => website.isActive) ??
        data[0];

      setSelectedWebsite(activeWebsite);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to load websites.';

      setError(message);
    } finally {
      setLoadingWebsites(false);
    }
  }, []);

  const loadLatestReport = useCallback(
    async (websiteId: string) => {
      try {
        setLoadingReport(true);
        setError('');

        const latestSummary =
          await getLatestSummaryForWebsite(websiteId);

        setSummary(latestSummary);

        const latestAnalysis =
          await getCrawlAnalysis(
            latestSummary.crawlId,
          );

        setAnalysis(
          latestAnalysis as Analysis,
        );
      } catch (err) {
        setSummary(null);
        setAnalysis(null);

        const message =
          err instanceof Error
            ? err.message
            : 'No completed technical SEO crawl found.';

        setError(message);
      } finally {
        setLoadingReport(false);
      }
    },
    [getLatestSummaryForWebsite],
  );

  const handleSelectWebsite = async (
    website: Website,
  ) => {
    setSelectedWebsite(website);
    setShowWebsiteMenu(false);
    setSummary(null);
    setAnalysis(null);

    await loadLatestReport(website.id);
  };

  const handleRunCrawl = async () => {
    if (!selectedWebsite) {
      setError('Please select a website first.');
      return;
    }

    try {
      setRunning(true);
      setError('');

      const result = await startCrawl(
        selectedWebsite.id,
      );

      if (result?.summary) {
        setSummary(result.summary);

        try {
          const crawlAnalysis =
            await getCrawlAnalysis(
              result.crawl.id,
            );

          setAnalysis(
            crawlAnalysis as Analysis,
          );
        } catch {
          setAnalysis(null);
        }
      } else if (result?.crawl?.id) {
        const crawlAnalysis =
          await getCrawlAnalysis(
            result.crawl.id,
          );

        setAnalysis(
          crawlAnalysis as Analysis,
        );

        try {
          const latestSummary =
            await getLatestSummaryForWebsite(
              selectedWebsite.id,
            );

          setSummary(latestSummary);
        } catch {
          setSummary(null);
        }
      } else {
        await loadLatestReport(
          selectedWebsite.id,
        );
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to run website crawl.';

      setError(message);
    } finally {
      setRunning(false);
    }
  };

  const handleRefresh = async () => {
    if (!selectedWebsite) {
      await loadWebsites();
      return;
    }

    await loadLatestReport(
      selectedWebsite.id,
    );
  };

  useEffect(() => {
    loadWebsites();
  }, [loadWebsites]);

  useEffect(() => {
    if (
      selectedWebsite &&
      !summary &&
      !loadingWebsites &&
      !loadingReport
    ) {
      loadLatestReport(
        selectedWebsite.id,
      );
    }
  }, [
    selectedWebsite,
    summary,
    loadingWebsites,
    loadingReport,
    loadLatestReport,
  ]);

  const issues = useMemo(() => {
    return (
      analysis?.issues?.intelligence ??
      analysis?.issues?.topPriority ??
      []
    );
  }, [analysis]);

  const topIssues = useMemo(() => {
    return (
      analysis?.issues?.topPriority ??
      issues
    ).slice(0, 10);
  }, [analysis, issues]);

  const recommendations =
    analysis?.recommendations ?? [];

  const pageIntelligence =
    analysis?.pageIntelligence ?? [];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Sidebar
        mobileOpen={open}
        onClose={() => setOpen(false)}
      />

      <main className="lg:pl-[270px]">
        <header className="flex h-[72px] items-center justify-between border-b border-slate-100 bg-white px-5 lg:px-8">
          <div className="flex items-center">
            <button
              className="mr-4 lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              type="button"
            >
              <Menu size={22} />
            </button>

            <div>
              <div className="text-sm font-semibold text-slate-500">
                RENKO / Technical SEO
              </div>

              <div className="mt-0.5 text-xs text-slate-400">
                Technical website health & crawl intelligence
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={
              loadingReport ||
              running ||
              loadingWebsites
            }
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              size={16}
              className={
                loadingReport ||
                running ||
                loadingWebsites
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
                  <ShieldCheck size={23} />
                </div>

                <div>
                  <h1 className="text-2xl font-bold">
                    Technical SEO
                  </h1>

                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                    Crawl your website, detect technical SEO
                    problems and prioritize the fixes that matter.
                  </p>
                </div>
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() =>
                    setShowWebsiteMenu(
                      (value) => !value,
                    )
                  }
                  disabled={loadingWebsites}
                  className="flex min-w-[280px] items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm hover:bg-slate-50 disabled:opacity-60"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                      <Globe2 size={18} />
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-400">
                        Active Website
                      </div>

                      <div className="truncate text-sm font-bold text-slate-900">
                        {loadingWebsites
                          ? 'Loading...'
                          : selectedWebsite?.name ??
                            'Select website'}
                      </div>
                    </div>
                  </div>

                  <ChevronDown
                    size={17}
                    className={
                      showWebsiteMenu
                        ? 'rotate-180 transition-transform'
                        : 'transition-transform'
                    }
                  />
                </button>

                {showWebsiteMenu && (
                  <div className="absolute right-0 top-full z-30 mt-2 w-full min-w-[280px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                    {websites.map(
                      (website) => (
                        <button
                          key={website.id}
                          type="button"
                          onClick={() =>
                            handleSelectWebsite(
                              website,
                            )
                          }
                          className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${
                            selectedWebsite?.id ===
                            website.id
                              ? 'bg-blue-50'
                              : ''
                          }`}
                        >
                          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100">
                            <Globe2 size={16} />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold">
                              {website.name}
                            </div>

                            <div className="truncate text-xs text-slate-400">
                              {website.url}
                            </div>
                          </div>

                          {selectedWebsite?.id ===
                            website.id && (
                            <CheckCircle2
                              size={17}
                              className="text-blue-600"
                            />
                          )}
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>
            </div>

            {selectedWebsite && (
              <div className="mt-5 rounded-xl bg-slate-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Website
                </div>

                <div className="mt-1 text-sm font-semibold text-slate-800">
                  {selectedWebsite.url}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  size={20}
                  className="mt-0.5 shrink-0 text-red-600"
                />

                <div>
                  <div className="text-sm font-bold text-red-800">
                    Technical SEO error
                  </div>

                  <div className="mt-1 text-sm leading-6 text-red-700">
                    {error}
                  </div>

                  {!summary && (
                    <div className="mt-3 text-xs text-red-600">
                      Run a crawl for the selected website to
                      generate a Technical SEO report.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {!loadingWebsites &&
            !selectedWebsite && (
              <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-12 text-center shadow-sm">
                <Globe2
                  size={38}
                  className="mx-auto text-slate-300"
                />

                <h2 className="mt-4 text-lg font-bold">
                  No website connected
                </h2>

                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                  Add a website in your RENKO workspace before
                  running Technical SEO analysis.
                </p>
              </div>
            )}

          {selectedWebsite && (
            <>
              <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      Website Crawl
                    </div>

                    <p className="mt-1 text-sm text-slate-500">
                      Run a fresh crawl to update technical SEO
                      issues and page intelligence.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleRunCrawl}
                    disabled={running}
                    className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {running ? (
                      <>
                        <Loader2
                          size={17}
                          className="animate-spin"
                        />
                        Crawling...
                      </>
                    ) : (
                      <>
                        <Play size={17} />
                        Run Technical SEO Crawl
                      </>
                    )}
                  </button>
                </div>
              </div>

              {(loadingWebsites ||
                loadingReport ||
                running) &&
                !summary && (
                  <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-12 shadow-sm">
                    <div className="flex flex-col items-center justify-center text-center">
                      <Loader2
                        size={32}
                        className="animate-spin text-blue-600"
                      />

                      <div className="mt-4 text-sm font-bold">
                        {running
                          ? 'Crawling website...'
                          : 'Loading Technical SEO report...'}
                      </div>

                      <div className="mt-1 text-sm text-slate-500">
                        RENKO is analyzing crawlability,
                        metadata, performance, accessibility,
                        schema and other technical signals.
                      </div>
                    </div>
                  </div>
                )}

              {summary && (
                <>
                  <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                      <div className="text-sm font-medium text-slate-500">
                        Technical SEO Score
                      </div>

                      <div className="mt-3 flex items-end gap-3">
                        <div className="text-4xl font-bold">
                          {summary.score}
                        </div>

                        <div
                          className={`mb-1 rounded-full border px-2.5 py-1 text-xs font-bold ${getScoreClass(
                            summary.score,
                          )}`}
                        >
                          {getScoreLabel(
                            summary.score,
                          )}
                        </div>
                      </div>

                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-blue-600 transition-all"
                          style={{
                            width: `${Math.min(
                              Math.max(
                                summary.score,
                                0,
                              ),
                              100,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                      <div className="text-sm font-medium text-slate-500">
                        Pages Crawled
                      </div>

                      <div className="mt-3 text-3xl font-bold">
                        {formatNumber(
                          summary.pages,
                        )}
                      </div>

                      <div className="mt-2 text-xs text-slate-400">
                        Pages analyzed in latest crawl
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                      <div className="text-sm font-medium text-slate-500">
                        Open Issues
                      </div>

                      <div className="mt-3 text-3xl font-bold">
                        {formatNumber(
                          summary.open,
                        )}
                      </div>

                      <div className="mt-2 text-xs text-slate-400">
                        {summary.fixed} fixed ·{' '}
                        {summary.ignored} ignored
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                      <div className="text-sm font-medium text-slate-500">
                        High Priority
                      </div>

                      <div className="mt-3 text-3xl font-bold text-orange-600">
                        {formatNumber(
                          summary.critical +
                            summary.high,
                        )}
                      </div>

                      <div className="mt-2 text-xs text-slate-400">
                        {summary.critical} critical ·{' '}
                        {summary.high} high
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                    <div>
                      <h2 className="text-lg font-bold">
                        Issue Breakdown
                      </h2>

                      <p className="mt-1 text-sm text-slate-500">
                        Current technical SEO issues grouped by
                        severity.
                      </p>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-xl border border-red-100 bg-red-50 p-4">
                        <div className="text-xs font-bold uppercase tracking-wide text-red-500">
                          Critical
                        </div>

                        <div className="mt-2 text-2xl font-bold text-red-700">
                          {summary.critical}
                        </div>
                      </div>

                      <div className="rounded-xl border border-orange-100 bg-orange-50 p-4">
                        <div className="text-xs font-bold uppercase tracking-wide text-orange-500">
                          High
                        </div>

                        <div className="mt-2 text-2xl font-bold text-orange-700">
                          {summary.high}
                        </div>
                      </div>

                      <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
                        <div className="text-xs font-bold uppercase tracking-wide text-amber-500">
                          Medium
                        </div>

                        <div className="mt-2 text-2xl font-bold text-amber-700">
                          {summary.medium}
                        </div>
                      </div>

                      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                        <div className="text-xs font-bold uppercase tracking-wide text-blue-500">
                          Low
                        </div>

                        <div className="mt-2 text-2xl font-bold text-blue-700">
                          {summary.low}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                    <div>
                      <h2 className="text-lg font-bold">
                        Top Technical Issues
                      </h2>

                      <p className="mt-1 text-sm text-slate-500">
                        Highest-priority issues detected by RENKO.
                      </p>
                    </div>

                    {topIssues.length === 0 ? (
                      <div className="mt-6 rounded-xl bg-emerald-50 p-8 text-center">
                        <CheckCircle2
                          size={30}
                          className="mx-auto text-emerald-600"
                        />

                        <div className="mt-3 text-sm font-bold text-emerald-800">
                          No technical issues detected
                        </div>

                        <div className="mt-1 text-sm text-emerald-700">
                          This crawl currently has no issue
                          intelligence to display.
                        </div>
                      </div>
                    ) : (
                      <div className="mt-5 space-y-3">
                        {topIssues.map(
                          (issue, index) => {
                            const issueKey =
                              `${issue.code}-${index}`;

                            const expanded =
                              expandedIssue ===
                              issueKey;

                            return (
                              <div
                                key={issueKey}
                                className="overflow-hidden rounded-xl border border-slate-200"
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedIssue(
                                      expanded
                                        ? null
                                        : issueKey,
                                    )
                                  }
                                  className="flex w-full items-center gap-4 p-4 text-left hover:bg-slate-50"
                                >
                                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-sm font-bold text-slate-600">
                                    {index + 1}
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span
                                        className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${getSeverityClass(
                                          issue.severity,
                                        )}`}
                                      >
                                        {issue.severity}
                                      </span>

                                      <span className="text-xs font-medium text-slate-400">
                                        {issue.category}
                                      </span>
                                    </div>

                                    <div className="mt-2 text-sm font-bold text-slate-900">
                                      {issue.title}
                                    </div>
                                  </div>

                                  <div className="hidden text-right sm:block">
                                    <div className="text-xs text-slate-400">
                                      Affected
                                    </div>

                                    <div className="text-sm font-bold">
                                      {issue.affectedPages}
                                    </div>
                                  </div>

                                  {expanded ? (
                                    <ChevronUp
                                      size={18}
                                      className="shrink-0 text-slate-400"
                                    />
                                  ) : (
                                    <ChevronDown
                                      size={18}
                                      className="shrink-0 text-slate-400"
                                    />
                                  )}
                                </button>

                                {expanded && (
                                  <div className="border-t border-slate-100 bg-slate-50 p-5">
                                    <div className="grid gap-4 lg:grid-cols-2">
                                      <div>
                                        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                                          Problem
                                        </div>

                                        <p className="mt-2 text-sm leading-6 text-slate-700">
                                          {issue.description}
                                        </p>
                                      </div>

                                      <div>
                                        <div className="text-xs font-bold uppercase tracking-wide text-blue-500">
                                          Recommended Action
                                        </div>

                                        <p className="mt-2 text-sm leading-6 text-slate-700">
                                          {issue.recommendation}
                                        </p>
                                      </div>
                                    </div>

                                    {issue.pages &&
                                      issue.pages.length >
                                        0 && (
                                        <div className="mt-5">
                                          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                                            Affected Pages
                                          </div>

                                          <div className="mt-2 space-y-2">
                                            {issue.pages.map(
                                              (
                                                page,
                                                pageIndex,
                                              ) => (
                                                <div
                                                  key={`${page.id}-${pageIndex}`}
                                                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"
                                                >
                                                  {page.url}
                                                </div>
                                              ),
                                            )}
                                          </div>
                                        </div>
                                      )}
                                  </div>
                                )}
                              </div>
                            );
                          },
                        )}
                      </div>
                    )}
                  </div>

                  {recommendations.length >
                    0 && (
                    <div className="mt-6 rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
                      <div>
                        <h2 className="text-lg font-bold">
                          RENKO Recommendations
                        </h2>

                        <p className="mt-1 text-sm text-slate-500">
                          Prioritized actions generated from the
                          technical SEO analysis.
                        </p>
                      </div>

                      <div className="mt-5 space-y-3">
                        {recommendations.map(
                          (
                            recommendation,
                            index,
                          ) => {
                            const key =
                              `${recommendation.code}-${index}`;

                            const expanded =
                              expandedRecommendation ===
                              key;

                            return (
                              <div
                                key={key}
                                className="overflow-hidden rounded-xl border border-slate-200"
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedRecommendation(
                                      expanded
                                        ? null
                                        : key,
                                    )
                                  }
                                  className="flex w-full items-center gap-4 p-4 text-left hover:bg-slate-50"
                                >
                                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-sm font-bold text-blue-600">
                                    {index + 1}
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span
                                        className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${getPriorityClass(
                                          recommendation.priority,
                                        )}`}
                                      >
                                        {recommendation.priority}
                                      </span>

                                      <span className="text-xs text-slate-400">
                                        {recommendation.category}
                                      </span>
                                    </div>

                                    <div className="mt-2 text-sm font-bold text-slate-900">
                                      {recommendation.title}
                                    </div>
                                  </div>

                                  {expanded ? (
                                    <ChevronUp
                                      size={18}
                                      className="shrink-0 text-slate-400"
                                    />
                                  ) : (
                                    <ChevronDown
                                      size={18}
                                      className="shrink-0 text-slate-400"
                                    />
                                  )}
                                </button>

                                {expanded && (
                                  <div className="border-t border-slate-100 bg-slate-50 p-5">
                                    <div className="grid gap-4 md:grid-cols-2">
                                      <div className="rounded-xl bg-white p-4">
                                        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                                          Problem
                                        </div>

                                        <p className="mt-2 text-sm leading-6 text-slate-700">
                                          {
                                            recommendation.problem
                                          }
                                        </p>
                                      </div>

                                      <div className="rounded-xl bg-white p-4">
                                        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                                          Action
                                        </div>

                                        <p className="mt-2 text-sm leading-6 text-slate-700">
                                          {
                                            recommendation.action
                                          }
                                        </p>
                                      </div>

                                      <div className="rounded-xl bg-white p-4">
                                        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                                          Why It Matters
                                        </div>

                                        <p className="mt-2 text-sm leading-6 text-slate-700">
                                          {
                                            recommendation.whyItMatters
                                          }
                                        </p>
                                      </div>

                                      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                                        <div className="text-xs font-bold uppercase tracking-wide text-blue-600">
                                          Suggested Fix
                                        </div>

                                        <p className="mt-2 text-sm leading-6 text-slate-700">
                                          {
                                            recommendation.suggestedFix
                                          }
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          },
                        )}
                      </div>
                    </div>
                  )}

                  {pageIntelligence.length >
                    0 && (
                    <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                      <div>
                        <h2 className="text-lg font-bold">
                          Page Intelligence
                        </h2>

                        <p className="mt-1 text-sm text-slate-500">
                          Page-level technical SEO health and
                          priority.
                        </p>
                      </div>

                      <div className="mt-5 overflow-x-auto">
                        <table className="w-full min-w-[900px] text-left text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                              <th className="px-4 py-3">
                                Page
                              </th>

                              <th className="px-4 py-3">
                                Issues
                              </th>

                              <th className="px-4 py-3">
                                Critical
                              </th>

                              <th className="px-4 py-3">
                                High
                              </th>

                              <th className="px-4 py-3">
                                Medium
                              </th>

                              <th className="px-4 py-3">
                                Low
                              </th>

                              <th className="px-4 py-3">
                                Priority
                              </th>
                            </tr>
                          </thead>

                          <tbody>
                            {pageIntelligence.map(
                              (
                                page,
                                index,
                              ) => (
                                <tr
                                  key={`${page.id}-${index}`}
                                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                                >
                                  <td className="max-w-[430px] px-4 py-4">
                                    <div
                                      className="truncate font-semibold text-slate-900"
                                      title={page.url}
                                    >
                                      {truncateUrl(
                                        page.url,
                                        75,
                                      )}
                                    </div>

                                    {page.title && (
                                      <div
                                        className="mt-1 truncate text-xs text-slate-400"
                                        title={page.title}
                                      >
                                        {page.title}
                                      </div>
                                    )}
                                  </td>

                                  <td className="px-4 py-4 font-bold">
                                    {page.issueCount}
                                  </td>

                                  <td className="px-4 py-4 text-red-600">
                                    {page.critical}
                                  </td>

                                  <td className="px-4 py-4 text-orange-600">
                                    {page.high}
                                  </td>

                                  <td className="px-4 py-4 text-amber-600">
                                    {page.medium}
                                  </td>

                                  <td className="px-4 py-4 text-blue-600">
                                    {page.low}
                                  </td>

                                  <td className="px-4 py-4">
                                    <span
                                      className={`rounded-full border px-2.5 py-1 text-xs font-bold ${getPriorityClass(
                                        page.priority,
                                      )}`}
                                    >
                                      {formatLabel(
                                        page.priority,
                                      )}
                                    </span>
                                  </td>
                                </tr>
                              ),
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                    <div>
                      <h2 className="text-lg font-bold">
                        Crawl Information
                      </h2>

                      <p className="mt-1 text-sm text-slate-500">
                        Details about the crawl used for this
                        Technical SEO report.
                      </p>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-xl bg-slate-50 p-4">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                          Crawl ID
                        </div>

                        <div className="mt-2 break-all text-xs font-semibold text-slate-700">
                          {summary.crawlId}
                        </div>
                      </div>

                      <div className="rounded-xl bg-slate-50 p-4">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                          Status
                        </div>

                        <div className="mt-2 flex items-center gap-2 text-sm font-bold text-emerald-600">
                          <CheckCircle2 size={16} />
                          Completed
                        </div>
                      </div>

                      <div className="rounded-xl bg-slate-50 p-4">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                          Fixed
                        </div>

                        <div className="mt-2 text-lg font-bold">
                          {summary.fixed}
                        </div>
                      </div>

                      <div className="rounded-xl bg-slate-50 p-4">
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                          Ignored
                        </div>

                        <div className="mt-2 text-lg font-bold">
                          {summary.ignored}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
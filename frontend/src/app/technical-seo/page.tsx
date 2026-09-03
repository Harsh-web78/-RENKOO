'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Globe2,
  Menu,
  Play,
  RefreshCw,
  ShieldCheck,
  XCircle,
  EyeOff,
  RotateCcw,
} from 'lucide-react';

import Sidebar from '../../components/Sidebar';

import {
  getCrawlAnalysis,
  getCrawlSummary,
  getCrawlIssues,
  getWebsites,
  startCrawl,
  resolveSeoIssue,
  ignoreSeoIssue,
  reopenSeoIssue,
  Website,
  SeoIssue,
  CrawlSummary,
} from '../../lib/api';

/*
 * =========================================================
 * TYPES
 * =========================================================
 */

type IssueFilter =
  | 'ALL'
  | 'OPEN'
  | 'FIXED'
  | 'IGNORED';

type IssueIntelligence = {
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

type Analysis = {
  issues?: {
    intelligence?: IssueIntelligence[];
    topPriority?: IssueIntelligence[];
  };

  recommendations?: Recommendation[];

  pageIntelligence?: {
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
  }[];
};

/*
 * =========================================================
 * PAGE
 * =========================================================
 */

export default function TechnicalSeoPage() {
  /*
   * =======================================================
   * UI STATE
   * =======================================================
   */

  const [open, setOpen] = useState(false);

  const [websites, setWebsites] =
    useState<Website[]>([]);

  const [selectedWebsite, setSelectedWebsite] =
    useState<Website | null>(null);

  const [loadingWebsites, setLoadingWebsites] =
    useState(true);

  const [running, setRunning] =
    useState(false);

  const [error, setError] =
    useState('');

  const [issueActionError, setIssueActionError] =
    useState('');

  const [summary, setSummary] =
    useState<CrawlSummary | null>(null);

  const [analysis, setAnalysis] =
    useState<Analysis | null>(null);

  const [crawlIssues, setCrawlIssues] =
    useState<SeoIssue[]>([]);

  const [activeFilter, setActiveFilter] =
    useState<IssueFilter>('ALL');

  const [issueActionLoading, setIssueActionLoading] =
    useState<string | null>(null);

  const [showWebsiteMenu, setShowWebsiteMenu] =
    useState(false);

  /*
   * =======================================================
   * LOAD WEBSITES
   * =======================================================
   */

  async function loadWebsites() {
    try {
      setLoadingWebsites(true);
      setError('');

      const data =
        await getWebsites();

      setWebsites(data);

      if (data.length > 0) {
        setSelectedWebsite((current) => {
          if (current) {
            return (
              data.find(
                (website) =>
                  website.id === current.id,
              ) ?? data[0]
            );
          }

          return data[0];
        });
      } else {
        setSelectedWebsite(null);
      }
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load websites.',
      );
    } finally {
      setLoadingWebsites(false);
    }
  }

  useEffect(() => {
    loadWebsites();
  }, []);

  /*
   * =======================================================
   * LOAD AUDIT DATA
   * =======================================================
   */

  async function loadAuditData(
    crawlId: string,
  ) {
    const [
      summaryData,
      analysisData,
      issuesData,
    ] = await Promise.all([
      getCrawlSummary(crawlId),
      getCrawlAnalysis(crawlId),
      getCrawlIssues(crawlId),
    ]);

    setSummary(summaryData);
    setAnalysis(analysisData);
    setCrawlIssues(
      issuesData?.issues ?? [],
    );
  }

  /*
   * =======================================================
   * RUN AUDIT
   * =======================================================
   */

  async function runAudit() {
    if (!selectedWebsite) {
      setError(
        'Please connect a website first.',
      );
      return;
    }

    try {
      setRunning(true);
      setError('');
      setIssueActionError('');

      setSummary(null);
      setAnalysis(null);
      setCrawlIssues([]);

      setActiveFilter('ALL');

      const crawl =
        await startCrawl(
          selectedWebsite.id,
        );

      const crawlId =
        crawl?.crawl?.id;

      if (!crawlId) {
        throw new Error(
          'Crawl started but no crawl ID was returned.',
        );
      }

      await loadAuditData(
        crawlId,
      );
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : 'SEO audit failed.',
      );
    } finally {
      setRunning(false);
    }
  }

  /*
   * =======================================================
   * ISSUE ACTION
   * =======================================================
   */

  async function handleIssueAction(
    issueId: string,
    action:
      | 'FIX'
      | 'IGNORE'
      | 'REOPEN',
  ) {
    try {
      setIssueActionLoading(
        issueId,
      );

      setIssueActionError('');

      /*
       * FIX
       */

      if (action === 'FIX') {
        await resolveSeoIssue(
          issueId,
        );
      }

      /*
       * IGNORE
       */

      if (action === 'IGNORE') {
        await ignoreSeoIssue(
          issueId,
        );
      }

      /*
       * REOPEN
       */

      if (action === 'REOPEN') {
        await reopenSeoIssue(
          issueId,
        );
      }

      /*
       * Reload everything after
       * status change.
       */

      if (summary?.crawlId) {
        await loadAuditData(
          summary.crawlId,
        );
      }
    } catch (err) {
      console.error(err);

      setIssueActionError(
        err instanceof Error
          ? err.message
          : 'Unable to update issue status.',
      );
    } finally {
      setIssueActionLoading(
        null,
      );
    }
  }

  /*
   * =======================================================
   * FILTER ISSUES
   * =======================================================
   */

  const filteredIssues =
    useMemo(() => {
      if (
        activeFilter === 'ALL'
      ) {
        return crawlIssues;
      }

      return crawlIssues.filter(
        (issue) =>
          issue.status ===
          activeFilter,
      );
    }, [
      crawlIssues,
      activeFilter,
    ]);

  /*
   * =======================================================
   * ISSUE COUNTS
   * =======================================================
   */

  const openIssueCount =
    crawlIssues.filter(
      (issue) =>
        issue.status === 'OPEN',
    ).length;

  const fixedIssueCount =
    crawlIssues.filter(
      (issue) =>
        issue.status === 'FIXED',
    ).length;

  const ignoredIssueCount =
    crawlIssues.filter(
      (issue) =>
        issue.status === 'IGNORED',
    ).length;

  /*
   * =======================================================
   * ANALYSIS DATA
   * =======================================================
   */

  const intelligence =
    analysis?.issues
      ?.intelligence ?? [];

  const recommendations =
    analysis?.recommendations ?? [];

  /*
   * =======================================================
   * RENDER
   * =======================================================
   */

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Sidebar
        mobileOpen={open}
        onClose={() =>
          setOpen(false)
        }
      />

      <main className="lg:pl-[270px]">
        {/* =================================================
            HEADER
        ================================================= */}

        <header className="flex h-[72px] items-center border-b border-slate-200 bg-white px-5 lg:px-8">
          <button
            className="mr-4 lg:hidden"
            onClick={() =>
              setOpen(true)
            }
            aria-label="Open menu"
          >
            <Menu size={21} />
          </button>

          <div>
            <div className="text-sm font-semibold">
              RENKO / Technical SEO
            </div>

            <div className="text-xs text-slate-400">
              Real website crawl and technical SEO intelligence
            </div>
          </div>
        </header>

        <section className="mx-auto max-w-[1500px] p-5 lg:p-8">
          {/* =================================================
              PAGE HEADER
          ================================================= */}

          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-blue-600">
                <ShieldCheck size={20} />

                <span className="text-xs font-bold uppercase tracking-wide">
                  Technical SEO
                </span>
              </div>

              <h1 className="mt-2 text-3xl font-bold">
                SEO Health & Audit
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Crawl your website and identify technical,
                on-page, content, performance and SEO issues.
              </p>
            </div>

            {/* =================================================
                WEBSITE SELECTOR
            ================================================= */}

            <div className="relative w-full xl:w-[380px]">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Active Website
              </div>

              {loadingWebsites ? (
                <div className="flex h-[58px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4">
                  <RefreshCw
                    size={18}
                    className="animate-spin text-blue-600"
                  />

                  <span className="text-sm font-medium">
                    Loading websites...
                  </span>
                </div>
              ) : websites.length === 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  No website connected.
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setShowWebsiteMenu(
                        (value) =>
                          !value,
                      )
                    }
                    className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm"
                  >
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                      <Globe2 size={19} />
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
                      className={
                        showWebsiteMenu
                          ? 'rotate-180 text-slate-400'
                          : 'text-slate-400'
                      }
                    />
                  </button>

                  {showWebsiteMenu && (
                    <div className="absolute left-0 right-0 top-[82px] z-50 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                      {websites.map(
                        (website) => (
                          <button
                            type="button"
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

                              setSummary(
                                null,
                              );

                              setAnalysis(
                                null,
                              );

                              setCrawlIssues(
                                [],
                              );

                              setActiveFilter(
                                'ALL',
                              );
                            }}
                            className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-slate-50"
                          >
                            <Globe2
                              size={17}
                              className="text-slate-500"
                            />

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
              RUN AUDIT
          ================================================= */}

          <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-blue-100 bg-blue-50 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-bold">
                {selectedWebsite
                  ? `Ready to audit ${selectedWebsite.name}`
                  : 'Connect a website to begin'}
              </div>

              <div className="mt-1 text-xs text-slate-500">
                RENKO will crawl the website and generate
                technical SEO issues and recommendations.
              </div>
            </div>

            <button
              type="button"
              onClick={runAudit}
              disabled={
                running ||
                !selectedWebsite
              }
              className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {running ? (
                <>
                  <RefreshCw
                    size={17}
                    className="animate-spin"
                  />

                  Crawling...
                </>
              ) : (
                <>
                  <Play size={17} />

                  Run SEO Audit
                </>
              )}
            </button>
          </div>

          {/* =================================================
              ERROR
          ================================================= */}

          {error && (
            <div className="mt-5 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
              <AlertTriangle
                size={19}
                className="shrink-0 text-red-600"
              />

              <div>
                <div className="text-sm font-bold text-red-700">
                  Audit error
                </div>

                <div className="mt-1 text-xs leading-5 text-red-600">
                  {error}
                </div>
              </div>
            </div>
          )}

          {/* =================================================
              ISSUE ACTION ERROR
          ================================================= */}

          {issueActionError && (
            <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle
                  size={18}
                  className="text-red-600"
                />

                <div className="text-sm font-medium text-red-700">
                  {issueActionError}
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  setIssueActionError(
                    '',
                  )
                }
                className="text-red-500 hover:text-red-700"
              >
                <XCircle size={18} />
              </button>
            </div>
          )}

          {/* =================================================
              EMPTY STATE
          ================================================= */}

          {!summary &&
            !running &&
            !error && (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                  <ShieldCheck
                    size={27}
                  />
                </div>

                <h2 className="mt-4 text-lg font-bold">
                  No audit loaded yet
                </h2>

                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
                  Run an SEO audit to see real crawl data,
                  health score, issues and recommendations.
                </p>
              </div>
            )}

          {/* =================================================
              LOADING
          ================================================= */}

          {running && (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <div className="flex items-center gap-3">
                <RefreshCw
                  className="animate-spin text-blue-600"
                  size={21}
                />

                <div>
                  <div className="text-sm font-bold">
                    RENKO is crawling your website
                  </div>

                  <div className="mt-1 text-xs text-slate-500">
                    Discovering pages and running SEO checks...
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =================================================
              AUDIT RESULTS
          ================================================= */}

          {summary && (
            <>
              {/* =================================================
                  SUMMARY METRICS
              ================================================= */}

              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
                <Metric
                  title="SEO Health"
                  value={
                    summary.score
                  }
                  suffix="/100"
                  positive={
                    summary.score >=
                    80
                  }
                />

                <Metric
                  title="Pages"
                  value={
                    summary.pages
                  }
                />

                <Metric
                  title="Open Issues"
                  value={
                    summary.open
                  }
                  danger={
                    summary.open > 0
                  }
                />

                <Metric
                  title="Critical"
                  value={
                    summary.critical
                  }
                  danger={
                    summary.critical >
                    0
                  }
                />

                <Metric
                  title="High"
                  value={
                    summary.high
                  }
                  warning={
                    summary.high >
                    0
                  }
                />

                <Metric
                  title="Medium"
                  value={
                    summary.medium
                  }
                />
              </div>

              {/* =================================================
                  SEO ISSUES
              ================================================= */}

              <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-sm font-bold">
                      SEO Issues
                    </h2>

                    <p className="mt-1 text-xs text-slate-500">
                      Real issues detected during the latest website crawl.
                    </p>
                  </div>

                  {/* FILTER TABS */}

                  <div className="flex flex-wrap gap-2">
                    <IssueTab
                      label="All"
                      count={
                        crawlIssues.length
                      }
                      active={
                        activeFilter ===
                        'ALL'
                      }
                      onClick={() =>
                        setActiveFilter(
                          'ALL',
                        )
                      }
                    />

                    <IssueTab
                      label="Open"
                      count={
                        openIssueCount
                      }
                      active={
                        activeFilter ===
                        'OPEN'
                      }
                      onClick={() =>
                        setActiveFilter(
                          'OPEN',
                        )
                      }
                    />

                    <IssueTab
                      label="Fixed"
                      count={
                        fixedIssueCount
                      }
                      active={
                        activeFilter ===
                        'FIXED'
                      }
                      onClick={() =>
                        setActiveFilter(
                          'FIXED',
                        )
                      }
                    />

                    <IssueTab
                      label="Ignored"
                      count={
                        ignoredIssueCount
                      }
                      active={
                        activeFilter ===
                        'IGNORED'
                      }
                      onClick={() =>
                        setActiveFilter(
                          'IGNORED',
                        )
                      }
                    />
                  </div>
                </div>

                {/* ISSUE SUMMARY */}

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <MiniMetric
                    label="Open"
                    value={
                      openIssueCount
                    }
                  />

                  <MiniMetric
                    label="Fixed"
                    value={
                      fixedIssueCount
                    }
                  />

                  <MiniMetric
                    label="Ignored"
                    value={
                      ignoredIssueCount
                    }
                  />
                </div>

                {/* ISSUE LIST */}

                {filteredIssues.length ===
                0 ? (
                  <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-6 text-center">
                    <CheckCircle2
                      size={24}
                      className="mx-auto text-emerald-600"
                    />

                    <div className="mt-2 text-sm font-bold text-slate-700">
                      No issues in this filter
                    </div>

                    <div className="mt-1 text-xs text-slate-500">
                      Try another status filter.
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 space-y-3">
                    {filteredIssues.map(
                      (issue) => (
                        <IssueCard
                          key={
                            issue.id
                          }
                          issue={
                            issue
                          }
                          loading={
                            issueActionLoading ===
                            issue.id
                          }
                          onAction={
                            handleIssueAction
                          }
                        />
                      ),
                    )}
                  </div>
                )}
              </section>

              {/* =================================================
                  ISSUE INTELLIGENCE
              ================================================= */}

              <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold">
                      Issue Intelligence
                    </h2>

                    <p className="mt-1 text-xs text-slate-500">
                      Grouped by issue type and affected page coverage.
                    </p>
                  </div>

                  <div className="text-xs font-semibold text-slate-400">
                    {
                      intelligence.length
                    }{' '}
                    issue types
                  </div>
                </div>

                {intelligence.length ===
                0 ? (
                  <div className="mt-5 rounded-xl bg-emerald-50 p-5 text-sm font-medium text-emerald-700">
                    No issue intelligence available.
                  </div>
                ) : (
                  <div className="mt-5 space-y-3">
                    {intelligence
                      .slice(
                        0,
                        10,
                      )
                      .map(
                        (
                          issue,
                        ) => (
                          <div
                            key={
                              issue.code
                            }
                            className="rounded-xl border border-slate-100 p-4"
                          >
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Severity
                                    value={
                                      issue.severity
                                    }
                                  />

                                  <span className="text-sm font-bold">
                                    {
                                      issue.title
                                    }
                                  </span>

                                  {issue.isSiteWide && (
                                    <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-600">
                                      SITE-WIDE
                                    </span>
                                  )}
                                </div>

                                <p className="mt-2 text-xs leading-5 text-slate-500">
                                  {
                                    issue.description
                                  }
                                </p>
                              </div>

                              <div className="grid shrink-0 grid-cols-3 gap-4 text-center">
                                <Stat
                                  label="Pages"
                                  value={
                                    issue.affectedPages
                                  }
                                />

                                <Stat
                                  label="Coverage"
                                  value={`${issue.affectedPercentage}%`}
                                />

                                <Stat
                                  label="Priority"
                                  value={
                                    issue.priorityScore
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        ),
                      )}
                  </div>
                )}
              </section>

              {/* =================================================
                  RECOMMENDATIONS
              ================================================= */}

              <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-bold">
                  RENKO Recommendations
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Prioritized actions generated from the audit.
                </p>

                {recommendations.length ===
                0 ? (
                  <div className="mt-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
                    No recommendations available.
                  </div>
                ) : (
                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    {recommendations
                      .slice(
                        0,
                        10,
                      )
                      .map(
                        (
                          recommendation,
                        ) => (
                          <div
                            key={`${recommendation.code}-${recommendation.priorityScore}`}
                            className="rounded-xl border border-slate-100 p-4"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <h3 className="text-sm font-bold">
                                {
                                  recommendation.title
                                }
                              </h3>

                              <Severity
                                value={
                                  recommendation.priority
                                }
                              />
                            </div>

                            <div className="mt-3 text-xs text-slate-500">
                              {
                                recommendation.problem
                              }
                            </div>

                            <div className="mt-4 rounded-lg bg-blue-50 p-3">
                              <div className="text-[10px] font-bold uppercase tracking-wide text-blue-600">
                                Recommended action
                              </div>

                              <div className="mt-1 text-xs leading-5 text-slate-700">
                                {
                                  recommendation.action
                                }
                              </div>
                            </div>

                            <div className="mt-3 text-xs leading-5 text-slate-500">
                              <b>
                                Why:
                              </b>{' '}
                              {
                                recommendation.whyItMatters
                              }
                            </div>

                            <div className="mt-2 text-xs leading-5 text-slate-500">
                              <b>
                                Fix:
                              </b>{' '}
                              {
                                recommendation.suggestedFix
                              }
                            </div>
                          </div>
                        ),
                      )}
                  </div>
                )}
              </section>

              {/* =================================================
                  PAGE INTELLIGENCE
              ================================================= */}

              <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-bold">
                  Page Intelligence
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Pages ranked by SEO issue priority.
                </p>

                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[800px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400">
                        <th className="px-3 py-3 font-semibold">
                          URL
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          Priority
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          Issues
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          Critical
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          High
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          Medium
                        </th>

                        <th className="px-3 py-3 font-semibold">
                          Low
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {(
                        analysis?.pageIntelligence ??
                        []
                      )
                        .slice(
                          0,
                          25,
                        )
                        .map(
                          (page) => (
                            <tr
                              key={
                                page.id
                              }
                              className="border-b border-slate-50"
                            >
                              <td className="max-w-[400px] truncate px-3 py-3 font-medium text-slate-700">
                                {
                                  page.url
                                }
                              </td>

                              <td className="px-3 py-3">
                                <Severity
                                  value={
                                    page.priority
                                  }
                                />
                              </td>

                              <td className="px-3 py-3 font-semibold">
                                {
                                  page.issueCount
                                }
                              </td>

                              <td className="px-3 py-3">
                                {
                                  page.critical
                                }
                              </td>

                              <td className="px-3 py-3">
                                {
                                  page.high
                                }
                              </td>

                              <td className="px-3 py-3">
                                {
                                  page.medium
                                }
                              </td>

                              <td className="px-3 py-3">
                                {
                                  page.low
                                }
                              </td>
                            </tr>
                          ),
                        )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

/*
 * =========================================================
 * ISSUE CARD
 * =========================================================
 */

function IssueCard({
  issue,
  loading,
  onAction,
}: {
  issue: SeoIssue;
  loading: boolean;
  onAction: (
    issueId: string,
    action:
      | 'FIX'
      | 'IGNORE'
      | 'REOPEN',
  ) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-100 p-4 transition hover:border-slate-200">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        {/* ISSUE INFO */}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Severity
              value={
                issue.severity
              }
            />

            <StatusBadge
  status={
    issue.status
  }
/>

<span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">
  {issue.category}
</span>
          </div>

          <h3 className="mt-3 text-sm font-bold text-slate-900">
            {issue.title}
          </h3>

          <p className="mt-2 text-xs leading-5 text-slate-500">
            {
              issue.description
            }
          </p>

          <div className="mt-3 rounded-lg bg-slate-50 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Recommendation
            </div>

            <div className="mt-1 text-xs leading-5 text-slate-600">
              {
                issue.recommendation
              }
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[10px] font-semibold text-slate-500">
              {
                issue.code
              }
            </span>

            <span className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[10px] font-semibold text-slate-500">
              Page:{' '}
              {
                issue
                  .crawlPage
                  ?.url
              }
            </span>
          </div>
        </div>

        {/* ACTIONS */}

        <div className="flex shrink-0 flex-wrap gap-2 lg:w-[150px] lg:justify-end">
          {issue.status ===
            'OPEN' && (
            <>
              <button
                type="button"
                disabled={
                  loading
                }
                onClick={() =>
                  onAction(
                    issue.id,
                    'FIX',
                  )
                }
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <RefreshCw
                    size={14}
                    className="animate-spin"
                  />
                ) : (
                  <CheckCircle2
                    size={14}
                  />
                )}

                Fix
              </button>

              <button
                type="button"
                disabled={
                  loading
                }
                onClick={() =>
                  onAction(
                    issue.id,
                    'IGNORE',
                  )
                }
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <EyeOff
                  size={14}
                />

                Ignore
              </button>
            </>
          )}

          {issue.status ===
            'FIXED' && (
            <button
              type="button"
              disabled={
                loading
              }
              onClick={() =>
                onAction(
                  issue.id,
                  'REOPEN',
                )
              }
              className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RotateCcw
                size={14}
              />

              Reopen
            </button>
          )}

          {issue.status ===
            'IGNORED' && (
            <button
              type="button"
              disabled={
                loading
              }
              onClick={() =>
                onAction(
                  issue.id,
                  'REOPEN',
                )
              }
              className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RotateCcw
                size={14}
              />

              Reopen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/*
 * =========================================================
 * METRIC
 * =========================================================
 */

function Metric({
  title,
  value,
  suffix,
  positive,
  danger,
  warning,
}: {
  title: string;
  value: string | number;
  suffix?: string;
  positive?: boolean;
  danger?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-medium text-slate-500">
        {title}
      </div>

      <div className="mt-3 text-3xl font-bold">
        {value}

        {suffix && (
          <span className="text-sm font-medium text-slate-400">
            {suffix}
          </span>
        )}
      </div>

      {positive && (
        <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-emerald-600">
          <CheckCircle2
            size={14}
          />

          Healthy
        </div>
      )}

      {danger && (
        <div className="mt-2 text-xs font-semibold text-red-600">
          Needs attention
        </div>
      )}

      {warning && (
        <div className="mt-2 text-xs font-semibold text-orange-600">
          Review required
        </div>
      )}
    </div>
  );
}

/*
 * =========================================================
 * MINI METRIC
 * =========================================================
 */

function MiniMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>

      <div className="mt-1 text-xl font-bold">
        {value}
      </div>
    </div>
  );
}

/*
 * =========================================================
 * ISSUE TAB
 * =========================================================
 */

function IssueTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white'
          : 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50'
      }
    >
      {label}

      <span
        className={
          active
            ? 'ml-1.5 opacity-70'
            : 'ml-1.5 text-slate-400'
        }
      >
        {count}
      </span>
    </button>
  );
}

/*
 * =========================================================
 * STATUS BADGE
 * =========================================================
 */

function StatusBadge({
  status,
}: {
  status:
    | 'OPEN'
    | 'FIXED'
    | 'IGNORED';
}) {
  const config =
    status === 'OPEN'
      ? {
          className:
            'bg-orange-50 text-orange-700',
          icon: null,
        }
      : status === 'FIXED'
        ? {
            className:
              'bg-emerald-50 text-emerald-700',
            icon: (
              <CheckCircle2
                size={11}
              />
            ),
          }
        : {
            className:
              'bg-slate-100 text-slate-600',
            icon: (
              <EyeOff
                size={11}
              />
            ),
          };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${config.className}`}
    >
      {config.icon}

      {status}
    </span>
  );
}

/*
 * =========================================================
 * SEVERITY
 * =========================================================
 */

function Severity({
  value,
}: {
  value: string;
}) {
  const normalized =
    value.toUpperCase();

  const className =
    normalized ===
    'CRITICAL'
      ? 'bg-red-50 text-red-700'
      : normalized ===
          'HIGH'
        ? 'bg-orange-50 text-orange-700'
        : normalized ===
            'MEDIUM'
          ? 'bg-yellow-50 text-yellow-700'
          : 'bg-slate-100 text-slate-600';

  return (
    <span
      className={`rounded-full px-2 py-1 text-[10px] font-bold ${className}`}
    >
      {normalized}
    </span>
  );
}

/*
 * =========================================================
 * STAT
 * =========================================================
 */

function Stat({
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

      <div className="mt-1 text-sm font-bold">
        {value}
      </div>
    </div>
  );
}
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  Users,
  Plus,
  RefreshCw,
  Trash2,
  Play,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  BarChart3,
} from 'lucide-react';

import Sidebar from '../../components/Sidebar';

import {
  getWebsites,
  getCompetitors,
  createCompetitor,
  deleteCompetitor,
  crawlCompetitor,
  getLatestCompetitorCrawl,
  Website,
  Competitor,
} from '../../lib/api';

/*
 * =========================================================
 * TYPES
 * =========================================================
 */

type CrawlStatus =
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'PENDING'
  | string;

interface CrawlSummary {
  id?: string;
  competitorId?: string;

  status?: CrawlStatus;

  pagesCrawled?: number;
  pagesDiscovered?: number;

  score?: number;
  totalIssues?: number;

  critical?: number;
  high?: number;
  medium?: number;
  low?: number;

  startedAt?: string;
  completedAt?: string;
  createdAt?: string;
}

interface LatestCrawlResponse {
  competitor?: {
    id?: string;
    name?: string;
    url?: string;
    domain?: string;
  };

  crawl?: CrawlSummary;
}

type CompetitorWithCrawl = Omit<
  Competitor,
  'crawls'
> & {
  crawls?: CrawlSummary[];
};

/*
 * =========================================================
 * CONSTANTS
 * =========================================================
 */

const POLL_INTERVAL = 2000;

/*
 * Maximum time frontend will wait for one crawl.
 *
 * Backend can continue running after this, but the UI will
 * stop showing the local loading state.
 */
const MAX_POLL_TIME = 10 * 60 * 1000;

/*
 * =========================================================
 * PAGE
 * =========================================================
 */

export default function CompetitorsPage() {
  /*
   * =======================================================
   * WEBSITE STATE
   * =======================================================
   */

  const [websites, setWebsites] = useState<Website[]>([]);

  const [websiteId, setWebsiteId] =
    useState<string>('');

  /*
   * =======================================================
   * COMPETITOR STATE
   * =======================================================
   */

  const [
    competitors,
    setCompetitors,
  ] = useState<CompetitorWithCrawl[]>([]);

  /*
   * =======================================================
   * FORM STATE
   * =======================================================
   */

  const [name, setName] =
    useState<string>('');

  const [url, setUrl] =
    useState<string>('');

  /*
   * =======================================================
   * LOADING STATE
   * =======================================================
   */

  const [loading, setLoading] =
    useState<boolean>(true);

  const [creating, setCreating] =
    useState<boolean>(false);

  /*
   * =======================================================
   * CRAWL STATE
   *
   * competitor id currently being crawled
   * =======================================================
   */

  const [crawling, setCrawling] =
    useState<string | null>(null);

  /*
   * =======================================================
   * CRAWL STATUS
   *
   * Keeps latest crawl information for each competitor.
   * =======================================================
   */

  const [crawlStates, setCrawlStates] =
    useState<
      Record<string, CrawlSummary | undefined>
    >({});

  /*
   * =======================================================
   * ERROR
   * =======================================================
   */

  const [error, setError] =
    useState<string>('');

  /*
   * =======================================================
   * POLLING REFS
   *
   * Refs are used so polling does not create stale
   * closures or multiple timers.
   * =======================================================
   */

  const pollTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );

  const pollStartedAtRef =
    useRef<number>(0);

  const pollingCompetitorRef =
    useRef<string | null>(null);

  /*
   * =======================================================
   * CLEANUP POLLING
   * =======================================================
   */

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(
        pollTimerRef.current,
      );

      pollTimerRef.current = null;
    }

    pollingCompetitorRef.current =
      null;

    pollStartedAtRef.current = 0;
  }, []);

  /*
   * =======================================================
   * LOAD INITIAL DATA
   * =======================================================
   */

  const loadInitial =
    useCallback(async () => {
      try {
        setLoading(true);
        setError('');

        const [
          sites,
          comps,
        ] = await Promise.all([
          getWebsites(),
          getCompetitors(),
        ]);

        /*
         * Defensive array handling.
         */

        const websiteList =
          Array.isArray(sites)
            ? sites
            : [];

        const competitorList =
          Array.isArray(comps)
            ? comps
            : [];

        /*
         * Save data.
         */

        setWebsites(
          websiteList,
        );

        setCompetitors(
          competitorList as CompetitorWithCrawl[],
        );

        /*
         * =================================================
         * WEBSITE SELECTION
         * =================================================
         */

        if (
          websiteList.length > 0
        ) {
          /*
           * Keep currently selected website if it still
           * exists.
           */

          const currentStillExists =
            websiteList.some(
              (website) =>
                website.id ===
                websiteId,
            );

          if (
            !currentStillExists
          ) {
            const firstWebsite =
              websiteList[0];

            if (
              firstWebsite?.id
            ) {
              setWebsiteId(
                firstWebsite.id,
              );

              console.log(
                'RENKOO selected website:',
                firstWebsite.id,
              );
            }
          }
        } else {
          setWebsiteId('');

          console.warn(
            'RENKOO: No websites found.',
          );
        }

        /*
         * =================================================
         * LOAD LATEST CRAWL STATES
         * =================================================
         *
         * This is important after page refresh.
         *
         * If backend is currently crawling, frontend can
         * discover that state again.
         */

        const crawlStateEntries: Array<
          [
            string,
            CrawlSummary | undefined,
          ]
        > = [];

        for (
          const competitor of competitorList
        ) {
          if (
            !competitor?.id
          ) {
            continue;
          }

          try {
            const latest =
              (await getLatestCompetitorCrawl(
                competitor.id,
              )) as LatestCrawlResponse;

            crawlStateEntries.push([
              competitor.id,
              latest?.crawl,
            ]);
          } catch {
            /*
             * No crawl yet is normal.
             */
          }
        }

        if (
          crawlStateEntries.length > 0
        ) {
          setCrawlStates(
            (current) => {
              const next = {
                ...current,
              };

              for (
                const [
                  id,
                  crawl,
                ] of crawlStateEntries
              ) {
                next[id] = crawl;
              }

              return next;
            },
          );
        }

        // Remember a backend crawl that is already running.
        // A separate effect below starts polling after render, avoiding
        // a forward-reference to pollCrawl.
        const runningEntry = crawlStateEntries.find(
          ([, crawl]) =>
            String(crawl?.status || '').toUpperCase() === 'RUNNING',
        );

        if (runningEntry?.[0]) {
          setCrawling(runningEntry[0]);
        }
      } catch (
        err: unknown
      ) {
        console.error(
          'RENKOO competitors load error:',
          err,
        );

        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load competitors',
        );
      } finally {
        setLoading(false);
      }
    }, [websiteId, stopPolling]);

  /*
   * =======================================================
   * INITIAL LOAD
   * =======================================================
   */

  useEffect(() => {
    void loadInitial();

    return () => {
      stopPolling();
    };
  }, [loadInitial, stopPolling]);

  /*
   * =======================================================
   * CREATE COMPETITOR
   * =======================================================
   */

  async function handleCreate() {
    setError('');

    /*
     * Website validation.
     */

    if (!websiteId) {
      setError(
        'Please select a website before adding a competitor.',
      );

      return;
    }

    /*
     * Name validation.
     */

    const cleanName =
      name.trim();

    if (!cleanName) {
      setError(
        'Competitor name is required.',
      );

      return;
    }

    if (
      cleanName.length < 2
    ) {
      setError(
        'Competitor name must be at least 2 characters.',
      );

      return;
    }

    /*
     * URL validation.
     */

    const cleanUrl =
      url.trim();

    if (!cleanUrl) {
      setError(
        'Competitor URL is required.',
      );

      return;
    }

    /*
     * Add protocol automatically.
     */

    let normalizedUrl =
      cleanUrl;

    if (
      !normalizedUrl.startsWith(
        'http://',
      ) &&
      !normalizedUrl.startsWith(
        'https://',
      )
    ) {
      normalizedUrl =
        `https://${normalizedUrl}`;
    }

    /*
     * Validate URL.
     */

    try {
      const parsed =
        new URL(
          normalizedUrl,
        );

      if (
        parsed.protocol !==
          'http:' &&
        parsed.protocol !==
          'https:'
      ) {
        throw new Error(
          'Invalid protocol',
        );
      }
    } catch {
      setError(
        'Please enter a valid competitor URL.',
      );

      return;
    }

    /*
     * DEBUG
     */

    console.log(
      '========================================',
    );

    console.log(
      'RENKOO CREATE COMPETITOR',
    );

    console.log(
      'websiteId:',
      websiteId,
    );

    console.log(
      'name:',
      cleanName,
    );

    console.log(
      'url:',
      normalizedUrl,
    );

    console.log(
      '========================================',
    );

    try {
      setCreating(true);

      /*
       * IMPORTANT:
       *
       * websiteId MUST be included.
       *
       * This fixes the earlier:
       *
       * websiteId must be longer than or equal to 1
       * websiteId must be a string
       */

      const competitor =
        await createCompetitor({
          websiteId,
          name: cleanName,
          url: normalizedUrl,
        });

      console.log(
        'RENKOO competitor created:',
        competitor,
      );

      /*
       * Add immediately to UI.
       */

      setCompetitors(
        (current) => [
          competitor as CompetitorWithCrawl,
          ...current,
        ],
      );

      /*
       * Clear form.
       */

      setName('');
      setUrl('');

      /*
       * Refresh from backend after creation.
       *
       * This guarantees websiteId / domain / server
       * generated id are correct.
       */

      try {
        const comps =
          await getCompetitors();

        if (
          Array.isArray(comps)
        ) {
          setCompetitors(
            comps as CompetitorWithCrawl[],
          );
        }
      } catch {
        /*
         * Immediate local result is already available.
         */
      }
    } catch (
      err: unknown
    ) {
      console.error(
        'RENKOO create competitor error:',
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to create competitor',
      );
    } finally {
      setCreating(false);
    }
  }

  /*
   * =======================================================
   * DELETE COMPETITOR
   * =======================================================
   */

  async function handleDelete(
    id: string,
  ) {
    const confirmed =
      window.confirm(
        'Remove this competitor?',
      );

    if (!confirmed) {
      return;
    }

    try {
      setError('');

      /*
       * If this competitor is currently crawling,
       * stop frontend polling.
       */

      if (
        crawling === id
      ) {
        stopPolling();
        setCrawling(null);
      }

      await deleteCompetitor(
        id,
      );

      /*
       * Remove locally.
       */

      setCompetitors(
        (current) =>
          current.filter(
            (item) =>
              item.id !== id,
          ),
      );

      /*
       * Remove crawl state.
       */

      setCrawlStates(
        (current) => {
          const next = {
            ...current,
          };

          delete next[id];

          return next;
        },
      );
    } catch (
      err: unknown
    ) {
      console.error(
        'RENKOO delete competitor error:',
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to delete competitor',
      );
    }
  }

  /*
   * =======================================================
   * UPDATE CRAWL STATE
   * =======================================================
   */

  function updateCrawlState(
    competitorId: string,
    crawl:
      | CrawlSummary
      | undefined,
  ) {
    setCrawlStates(
      (current) => ({
        ...current,
        [competitorId]:
          crawl,
      }),
    );
  }

  /*
   * =======================================================
   * REFRESH ONE CRAWL
   * =======================================================
   */

  const refreshCrawlState =
    useCallback(
      async (
        competitorId: string,
      ): Promise<
        CrawlSummary | undefined
      > => {
        try {
          const latest =
            (await getLatestCompetitorCrawl(
              competitorId,
            )) as LatestCrawlResponse;

          const crawl =
            latest?.crawl;

          updateCrawlState(
            competitorId,
            crawl,
          );

          return crawl;
        } catch (
          err
        ) {
          console.warn(
            'RENKOO latest crawl fetch failed:',
            competitorId,
            err,
          );

          return undefined;
        }
      },
      [],
    );

  /*
   * =======================================================
   * POLL CRAWL
   * =======================================================
   */

  const pollCrawl = useCallback(async (
    competitorId: string,
  ) => {
        /*
         * Prevent multiple poll loops for same competitor.
         */

        if (
          pollingCompetitorRef.current !==
          competitorId
        ) {
          return;
        }

        /*
         * Timeout protection.
         */

        const elapsed =
          Date.now() -
          pollStartedAtRef.current;

        if (
          elapsed >=
          MAX_POLL_TIME
        ) {
          console.warn(
            'RENKOO crawl polling timeout:',
            competitorId,
          );

          setError(
            'Crawl is taking longer than expected. The backend may still be processing it. Refresh to check the final result.',
          );

          setCrawling(
            null,
          );

          stopPolling();

          return;
        }

        /*
         * Ask backend for latest crawl.
         */

        const crawl =
          await refreshCrawlState(
            competitorId,
          );

        /*
         * If no crawl response, try again.
         */

        if (!crawl) {
          pollTimerRef.current =
            setTimeout(
              () => {
                void pollCrawl(
                  competitorId,
                );
              },
              POLL_INTERVAL,
            );

          return;
        }

        const status =
          String(
            crawl.status ||
              '',
          ).toUpperCase();

        console.log(
          'RENKOO crawl poll:',
          {
            competitorId,
            crawlId:
              crawl.id,
            status,
            pagesCrawled:
              crawl.pagesCrawled,
            pagesDiscovered:
              crawl.pagesDiscovered,
            score:
              crawl.score,
            issues:
              crawl.totalIssues,
          },
        );

        /*
         * =================================================
         * COMPLETED
         * =================================================
         */

        if (
          status ===
          'COMPLETED'
        ) {
          console.log(
            'RENKOO competitor crawl completed:',
            competitorId,
            crawl,
          );

          setCrawling(
            null,
          );

          stopPolling();

          /*
           * Refresh complete competitor list.
           */

          try {
            const comps =
              await getCompetitors();

            if (
              Array.isArray(
                comps,
              )
            ) {
              setCompetitors(
                comps as CompetitorWithCrawl[],
              );
            }
          } catch {
            /*
             * Crawl data is already displayed from
             * crawlStates.
             */
          }

          return;
        }

        /*
         * =================================================
         * FAILED
         * =================================================
         */

        if (
          status ===
          'FAILED'
        ) {
          console.error(
            'RENKOO competitor crawl failed:',
            competitorId,
            crawl,
          );

          setError(
            'Competitor crawl failed. Check the backend console for the exact error.',
          );

          setCrawling(
            null,
          );

          stopPolling();

          return;
        }

        /*
         * =================================================
         * STILL RUNNING
         * =================================================
         */

        pollTimerRef.current =
          setTimeout(
            () => {
              void pollCrawl(
                competitorId,
              );
            },
            POLL_INTERVAL,
          );
  }, [refreshCrawlState, stopPolling]);

  /*
   * =======================================================
   * START CRAWL
   * =======================================================
   */

  async function handleCrawl(
    id: string,
  ) {
    /*
     * Don't start another crawl if one is already being
     * monitored by this frontend.
     */

    if (
      crawling &&
      crawling !== id
    ) {
      setError(
        'Another competitor crawl is already running.',
      );

      return;
    }

    if (
      crawling === id
    ) {
      return;
    }

    try {
      setError('');

      /*
       * Stop any old timer.
       */

      stopPolling();

      /*
       * Set UI immediately.
       */

      setCrawling(id);

      pollingCompetitorRef.current =
        id;

      pollStartedAtRef.current =
        Date.now();

      console.log(
        '========================================',
      );

      console.log(
        'RENKOO START COMPETITOR CRAWL',
      );

      console.log(
        'competitorId:',
        id,
      );

      console.log(
        '========================================',
      );

      /*
       * =================================================
       * START BACKEND CRAWL
       * =================================================
       *
       * IMPORTANT:
       *
       * This endpoint should return quickly if backend
       * uses startCrawl() background execution.
       */

      try {
        const startResult =
          await crawlCompetitor(
            id,
          );

        console.log(
          'RENKOO crawl start response:',
          startResult,
        );
      } catch (
        err: unknown
      ) {
        /*
         * If request failed, don't keep spinner forever.
         */

        throw err;
      }

      /*
       * =================================================
       * FIRST STATUS CHECK
       * =================================================
       */

      const firstCrawl =
        await refreshCrawlState(
          id,
        );

      /*
       * Show first state immediately.
       */

      if (
        firstCrawl
      ) {
        console.log(
          'RENKOO first crawl state:',
          firstCrawl,
        );
      }

      /*
       * =================================================
       * START POLLING
       * =================================================
       *
       * Even if the start endpoint returned immediately,
       * continue checking until DB says COMPLETED/FAILED.
       */

      pollTimerRef.current =
        setTimeout(
          () => {
            void pollCrawl(
              id,
            );
          },
          500,
        );
    } catch (
      err: unknown
    ) {
      console.error(
        'RENKOO competitor crawl error:',
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Competitor crawl failed',
      );

      setCrawling(
        null,
      );

      stopPolling();
    }
  }

  /*
   * =======================================================
   * MANUAL REFRESH
   * =======================================================
   */

  async function handleRefresh() {
    /*
     * If a crawl is currently running, don't kill its
     * frontend polling.
     */

    const currentCrawling =
      crawling;

    await loadInitial();

    /*
     * Reconnect polling after manual refresh.
     */

    if (
      currentCrawling
    ) {
      const latest =
        await refreshCrawlState(
          currentCrawling,
        );

      const status =
        String(
          latest?.status ||
            '',
        ).toUpperCase();

      if (
        status ===
        'RUNNING'
      ) {
        /*
         * Restart polling.
         */

        stopPolling();

        pollingCompetitorRef.current =
          currentCrawling;

        pollStartedAtRef.current =
          Date.now();

        pollTimerRef.current =
          setTimeout(
            () => {
              void pollCrawl(
                currentCrawling,
              );
            },
            POLL_INTERVAL,
          );
      } else if (
        status ===
          'COMPLETED' ||
        status ===
          'FAILED'
      ) {
        setCrawling(
          null,
        );

        stopPolling();
      }
    }
  }

  /*
   * =======================================================
   * FILTER
   * =======================================================
   */

  const selectedCompetitors =
    websiteId
      ? competitors.filter(
          (item) =>
            item.websiteId ===
            websiteId,
        )
      : competitors;

  /*
   * =======================================================
   * RENDER CRAWL STATUS
   * =======================================================
   */

  function getCrawlForCompetitor(
    competitor:
      CompetitorWithCrawl,
  ): CrawlSummary | undefined {
    return (
      crawlStates[
        competitor.id
      ] ||
      competitor.crawls?.[0]
    );
  }

  /*
   * =======================================================
   * FORMAT DATE
   * =======================================================
   */

  function formatDate(
    value:
      | string
      | undefined
      | null,
  ) {
    if (!value) {
      return 'Unknown';
    }

    try {
      return new Date(
        value,
      ).toLocaleString();
    } catch {
      return 'Unknown';
    }
  }

  /*
   * =======================================================
   * UI
   * =======================================================
   */

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        mobileOpen={false}
        onClose={() => {}}
      />

      <main className="lg:ml-64">
        <div className="mx-auto max-w-7xl p-5 lg:p-8">

          {/* =================================================
              HEADER
          ================================================= */}

          <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Users
                  size={23}
                  className="text-blue-600"
                />

                <h1 className="text-2xl font-bold text-slate-900">
                  Competitors
                </h1>
              </div>

              <p className="mt-1 text-sm text-slate-500">
                Track competitor websites and crawl
                their SEO performance.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">

              {/* WEBSITE SELECT */}

              <select
                value={websiteId}
                onChange={(e) => {
                  const value =
                    e.target.value;

                  console.log(
                    'RENKOO website changed:',
                    value,
                  );

                  setWebsiteId(
                    value,
                  );

                  setError('');
                }}
                disabled={
                  loading ||
                  websites.length ===
                    0
                }
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">
                  {websites.length ===
                  0
                    ? 'No websites'
                    : 'Select website'}
                </option>

                {websites.map(
                  (website) => (
                    <option
                      key={
                        website.id
                      }
                      value={
                        website.id
                      }
                    >
                      {
                        website.name
                      }
                    </option>
                  ),
                )}
              </select>

              {/* REFRESH */}

              <button
                type="button"
                onClick={() => {
                  void handleRefresh();
                }}
                disabled={loading}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw
                  size={15}
                  className={
                    loading
                      ? 'animate-spin'
                      : ''
                  }
                />

                Refresh
              </button>
            </div>
          </header>

          {/* =================================================
              ERROR
          ================================================= */}

          {error && (
            <div className="mt-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertTriangle
                size={17}
                className="mt-0.5 shrink-0"
              />

              <span>
                {error}
              </span>

              <button
                type="button"
                onClick={() =>
                  setError('')
                }
                className="ml-auto text-xs font-bold underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* =================================================
              NO WEBSITE WARNING
          ================================================= */}

          {!loading &&
            websites.length ===
              0 && (
              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle
                    size={17}
                  />

                  Add a website first
                </div>

                <p className="mt-1 text-xs">
                  You need at least one website
                  before adding a competitor.
                </p>
              </div>
            )}

          {/* =================================================
              ADD COMPETITOR
          ================================================= */}

          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <Plus
                size={18}
                className="text-blue-600"
              />

              <h2 className="text-sm font-bold">
                Add Competitor
              </h2>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1.5fr_auto]">

              {/* NAME */}

              <input
                value={name}
                onChange={(e) => {
                  setName(
                    e.target.value,
                  );

                  setError('');
                }}
                placeholder="Competitor name"
                disabled={
                  creating ||
                  websites.length ===
                    0
                }
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-400 disabled:bg-slate-50"
              />

              {/* URL */}

              <input
                value={url}
                onChange={(e) => {
                  setUrl(
                    e.target.value,
                  );

                  setError('');
                }}
                placeholder="https://competitor.com"
                disabled={
                  creating ||
                  websites.length ===
                    0
                }
                onKeyDown={(e) => {
                  if (
                    e.key ===
                    'Enter'
                  ) {
                    e.preventDefault();

                    void handleCreate();
                  }
                }}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-400 disabled:bg-slate-50"
              />

              {/* ADD */}

              <button
                type="button"
                onClick={() => {
                  void handleCreate();
                }}
                disabled={
                  creating ||
                  loading ||
                  websites.length ===
                    0 ||
                  !websiteId
                }
                className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? (
                  <RefreshCw
                    size={15}
                    className="animate-spin"
                  />
                ) : (
                  <Plus
                    size={15}
                  />
                )}

                {creating
                  ? 'Adding...'
                  : 'Add'}
              </button>
            </div>

            {/* SELECTED WEBSITE INFO */}

            {websiteId && (
              <div className="mt-3 text-xs text-slate-400">
                Adding competitor to:{' '}

                <span className="font-semibold text-slate-600">
                  {websites.find(
                    (website) =>
                      website.id ===
                      websiteId,
                  )?.name ||
                    'Selected website'}
                </span>
              </div>
            )}
          </section>

          {/* =================================================
              COMPETITOR LIST
          ================================================= */}

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm">

            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h2 className="text-sm font-bold">
                  Competitor List
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  {
                    selectedCompetitors.length
                  }{' '}
                  competitor
                  {selectedCompetitors.length ===
                  1
                    ? ''
                    : 's'}
                </p>
              </div>
            </div>

            {/* LOADING */}

            {loading ? (
              <div className="flex items-center justify-center p-10">
                <RefreshCw
                  size={22}
                  className="animate-spin text-blue-600"
                />
              </div>
            ) : selectedCompetitors.length ===
              0 ? (
              /* EMPTY */

              <div className="p-10 text-center">
                <Users
                  size={38}
                  className="mx-auto text-slate-300"
                />

                <h3 className="mt-3 text-sm font-bold">
                  No competitors yet
                </h3>

                <p className="mt-1 text-xs text-slate-500">
                  Add your first competitor
                  above.
                </p>
              </div>
            ) : (
              /* LIST */

              <div className="divide-y divide-slate-100">
                {selectedCompetitors.map(
                  (
                    competitor,
                  ) => {
                    const crawl =
                      getCrawlForCompetitor(
                        competitor,
                      );

                    const isThisCrawling =
                      crawling ===
                      competitor.id;

                    const crawlStatus =
                      String(
                        crawl?.status ||
                          '',
                      ).toUpperCase();

                    return (
                      <div
                        key={
                          competitor.id
                        }
                        className="p-5"
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

                          {/* INFO */}

                          <div className="flex min-w-0 items-center gap-4">

                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50">
                              <Users
                                size={19}
                                className="text-blue-600"
                              />
                            </div>

                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900">
                                {
                                  competitor.name
                                }
                              </div>

                              <a
                                href={
                                  competitor.url
                                }
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 flex max-w-xl items-center gap-1 truncate text-xs text-slate-500 hover:text-blue-600"
                              >
                                <span className="truncate">
                                  {competitor.domain ||
                                    competitor.url}
                                </span>

                                <ExternalLink
                                  size={
                                    11
                                  }
                                  className="shrink-0"
                                />
                              </a>

                              <div className="mt-2 text-[10px] font-medium text-slate-400">
                                Added{' '}
                                {formatDate(
                                  competitor.createdAt,
                                )}
                              </div>
                            </div>
                          </div>

                          {/* ACTIONS */}

                          <div className="flex flex-wrap items-center gap-2">

                            {/* CRAWL */}

                            <button
                              type="button"
                              onClick={() => {
                                void handleCrawl(
                                  competitor.id,
                                );
                              }}
                              disabled={
                                Boolean(
                                  crawling &&
                                    crawling !==
                                      competitor.id,
                                ) ||
                                isThisCrawling
                              }
                              className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isThisCrawling ? (
                                <RefreshCw
                                  size={
                                    14
                                  }
                                  className="animate-spin"
                                />
                              ) : (
                                <Play
                                  size={
                                    14
                                  }
                                />
                              )}

                              {isThisCrawling
                                ? 'Crawling...'
                                : 'Crawl'}
                            </button>

                            {/* DELETE */}

                            <button
                              type="button"
                              onClick={() => {
                                void handleDelete(
                                  competitor.id,
                                );
                              }}
                              disabled={
                                isThisCrawling
                              }
                              className="rounded-xl border border-red-100 p-2 text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                              title="Delete competitor"
                            >
                              <Trash2
                                size={
                                  15
                                }
                              />
                            </button>
                          </div>
                        </div>

                        {/* =================================================
                            CRAWL STATUS CARD
                        ================================================= */}

                        {crawl && (
                          <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-4">

                            {/* STATUS HEADER */}

                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-center gap-2">

                                {isThisCrawling ||
                                crawlStatus ===
                                  'RUNNING' ? (
                                  <RefreshCw
                                    size={
                                      15
                                    }
                                    className="animate-spin text-blue-600"
                                  />
                                ) : crawlStatus ===
                                  'COMPLETED' ? (
                                  <CheckCircle2
                                    size={
                                      15
                                    }
                                    className="text-green-600"
                                  />
                                ) : crawlStatus ===
                                  'FAILED' ? (
                                  <XCircle
                                    size={
                                      15
                                    }
                                    className="text-red-600"
                                  />
                                ) : (
                                  <BarChart3
                                    size={
                                      15
                                    }
                                    className="text-slate-500"
                                  />
                                )}

                                <span className="text-xs font-bold text-slate-700">
                                  {isThisCrawling
                                    ? 'Crawling'
                                    : crawlStatus ===
                                      'COMPLETED'
                                    ? 'Completed'
                                    : crawlStatus ===
                                      'FAILED'
                                    ? 'Failed'
                                    : crawlStatus ||
                                      'Pending'}
                                </span>
                              </div>

                              {crawl.completedAt && (
                                <span className="text-[10px] text-slate-400">
                                  Completed{' '}
                                  {formatDate(
                                    crawl.completedAt,
                                  )}
                                </span>
                              )}
                            </div>

                            {/* PROGRESS */}

                            {(isThisCrawling ||
                              crawlStatus ===
                                'RUNNING') && (
                              <div className="mt-4">
                                <div className="flex items-center justify-between text-[10px] font-medium text-slate-500">
                                  <span>
                                    Pages crawled
                                  </span>

                                  <span>
                                    {crawl.pagesCrawled ??
                                      0}
                                    {' / '}
                                    {crawl.pagesDiscovered ??
                                      0}
                                  </span>
                                </div>

                                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                                  <div
                                    className="h-full rounded-full bg-blue-600 transition-all duration-500"
                                    style={{
                                      width:
                                        crawl.pagesDiscovered &&
                                        crawl.pagesDiscovered >
                                          0
                                          ? `${Math.min(
                                              100,
                                              ((crawl.pagesCrawled ??
                                                0) /
                                                crawl.pagesDiscovered) *
                                                100,
                                            )}%`
                                          : '5%',
                                    }}
                                  />
                                </div>

                                <p className="mt-2 text-[10px] text-slate-400">
                                  RENKOO is crawling
                                  the competitor
                                  website. This page
                                  checks the backend
                                  every 2 seconds.
                                </p>
                              </div>
                            )}

                            {/* METRICS */}

                            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">

                              <div className="rounded-lg border border-slate-200 bg-white p-3">
                                <div className="text-[10px] font-medium text-slate-400">
                                  Pages
                                </div>

                                <div className="mt-1 text-lg font-bold text-slate-900">
                                  {
                                    crawl.pagesCrawled ??
                                    0
                                  }
                                </div>
                              </div>

                              <div className="rounded-lg border border-slate-200 bg-white p-3">
                                <div className="text-[10px] font-medium text-slate-400">
                                  Score
                                </div>

                                <div className="mt-1 text-lg font-bold text-slate-900">
                                  {crawl.score ??
                                    '--'}
                                </div>
                              </div>

                              <div className="rounded-lg border border-slate-200 bg-white p-3">
                                <div className="text-[10px] font-medium text-slate-400">
                                  Issues
                                </div>

                                <div className="mt-1 text-lg font-bold text-slate-900">
                                  {crawl.totalIssues ??
                                    0}
                                </div>
                              </div>

                              <div className="rounded-lg border border-slate-200 bg-white p-3">
                                <div className="text-[10px] font-medium text-slate-400">
                                  Critical
                                </div>

                                <div className="mt-1 text-lg font-bold text-red-600">
                                  {crawl.critical ??
                                    0}
                                </div>
                              </div>
                            </div>

                            {/* ISSUE BREAKDOWN */}

                            {crawlStatus ===
                              'COMPLETED' && (
                              <div className="mt-4 flex flex-wrap gap-2">

                                <span className="rounded-lg bg-red-50 px-3 py-1.5 text-[10px] font-semibold text-red-700">
                                  Critical:{' '}
                                  {crawl.critical ??
                                    0}
                                </span>

                                <span className="rounded-lg bg-orange-50 px-3 py-1.5 text-[10px] font-semibold text-orange-700">
                                  High:{' '}
                                  {crawl.high ??
                                    0}
                                </span>

                                <span className="rounded-lg bg-yellow-50 px-3 py-1.5 text-[10px] font-semibold text-yellow-700">
                                  Medium:{' '}
                                  {crawl.medium ??
                                    0}
                                </span>

                                <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-[10px] font-semibold text-slate-600">
                                  Low:{' '}
                                  {crawl.low ??
                                    0}
                                </span>
                              </div>
                            )}

                            {/* START DATE */}

                            {crawl.startedAt && (
                              <div className="mt-3 text-[10px] text-slate-400">
                                Started{' '}
                                {formatDate(
                                  crawl.startedAt,
                                )}
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
          </section>

          {/* =================================================
              STATS
          ================================================= */}

          <section className="mt-5 grid gap-5 md:grid-cols-3">

            <Stat
              label="Tracked Competitors"
              value={
                selectedCompetitors.length
              }
            />

            <Stat
              label="Active"
              value={
                selectedCompetitors.filter(
                  (item) =>
                    item.isActive,
                ).length
              }
            />

            <Stat
              label="Websites"
              value={
                websites.length
              }
            />

          </section>

        </div>
      </main>
    </div>
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
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-medium text-slate-500">
        {label}
      </div>

      <div className="mt-2 text-2xl font-bold text-slate-900">
        {value}
      </div>
    </div>
  );
}


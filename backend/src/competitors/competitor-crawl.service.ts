import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import {
  chromium,
  Browser,
  BrowserContext,
  Page,
} from 'playwright';

import * as cheerio from 'cheerio';

// =========================================================
// TYPES
// =========================================================

interface CrawledPage {
  url: string;
  statusCode: number;

  title: string | null;
  metaDescription: string | null;

  canonical: string | null;
  canonicalAbsolute: string | null;

  h1: string[];
  h2: string[];

  images: number;
  imagesWithoutAlt: number;

  internalLinks: number;
  externalLinks: number;

  wordCount: number;

  robots: string | null;
  robotsIndexable: boolean | null;
  robotsFollow: boolean | null;

  viewport: string | null;
  lang: string | null;
  charset: string | null;

  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;

  twitterCard: string | null;

  structuredDataCount: number;
  jsonLd: unknown | null;

  redirectCount: number;
  finalUrl: string | null;
  contentType: string | null;

  loadTimeMs: number;
}

interface CrawlIssue {
  code: string;
  severity:
    | 'CRITICAL'
    | 'HIGH'
    | 'MEDIUM'
    | 'LOW';
  title: string;
  description: string;
}

interface CrawlPageResult {
  page: CrawledPage;
  internalUrls: string[];
}

// =========================================================
// SERVICE
// =========================================================

@Injectable()
export class CompetitorCrawlService {
  // =======================================================
  // PERFORMANCE SETTINGS
  // =======================================================

  private readonly MAX_PAGES = 25;

  /**
   * Number of pages crawled simultaneously.
   *
   * 4 is a safe local-machine value.
   * If everything is stable later, this can become 5 or 6.
   */
  private readonly CONCURRENCY = 6;

  /**
   * Maximum time for one URL.
   */
  private readonly PAGE_TIMEOUT = 7000;

  /**
   * Browser DOM wait.
   */
  private readonly DOM_TIMEOUT = 2500;

  /**
   * Small JS/render wait.
   */
  private readonly RENDER_WAIT = 50;

  /**
   * Sitemap/robots timeout.
   */
  private readonly SITEMAP_TIMEOUT = 4000;

  /**
   * Maximum URLs read from a single sitemap.
   */
  private readonly MAX_SITEMAP_URLS = 100;

  /**
   * Maximum URLs accepted from all sitemaps.
   */
  private readonly MAX_TOTAL_SITEMAP_URLS = 200;

  /**
   * Running crawl older than this is considered stale.
   */
  private readonly STALE_AFTER_MS =
    5 * 60 * 1000;

  /**
   * Absolute safety limit for a single background crawl.
   * Prevents a pathological site from keeping the worker alive forever.
   */
  private readonly MAX_CRAWL_TIME_MS =
    4 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  // =========================================================
  // START CRAWL
  // =========================================================

  async startCrawl(
    organizationId: string,
    competitorId: string,
  ) {
    const competitor =
      await this.prisma.competitor.findFirst({
        where: {
          id: competitorId,
          organizationId,
        },
      });

    if (!competitor) {
      throw new BadRequestException(
        'Competitor not found',
      );
    }

    if (!competitor.isActive) {
      throw new BadRequestException(
        'Competitor is inactive',
      );
    }

    const startUrl =
      this.normalizeUrl(
        competitor.url,
      );

    if (!startUrl) {
      throw new BadRequestException(
        'Invalid competitor URL',
      );
    }

    // =======================================================
    // PREVENT DUPLICATE CRAWLS
    // =======================================================

    const runningCrawl =
      await this.prisma.competitorCrawl.findFirst({
        where: {
          competitorId,
          status: 'RUNNING',
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

    if (runningCrawl) {
      const startedAt =
        runningCrawl.startedAt?.getTime() ??
        runningCrawl.createdAt.getTime();

      const ageMs =
        Date.now() - startedAt;

      if (
        ageMs <
        this.STALE_AFTER_MS
      ) {
        return {
          success: true,
          alreadyRunning: true,
          message:
            'Competitor crawl is already running',
          crawl: runningCrawl,
        };
      }

      console.warn(
        `[COMPETITOR] Marking stale crawl ${runningCrawl.id} as FAILED`,
      );

      await this.markCrawlFailed(
        runningCrawl.id,
        'Stale crawl detected after backend restart',
      );
    }

    // =======================================================
    // CREATE CRAWL
    // =======================================================

    const crawl =
      await this.prisma.competitorCrawl.create({
        data: {
          competitorId,
          status: 'RUNNING',

          pagesCrawled: 0,
          pagesDiscovered: 0,

          score: 0,
          totalIssues: 0,

          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
        },
      });

    console.log(
      `[COMPETITOR] START ${competitor.name} (${competitor.id})`,
    );

    console.log(
      `[COMPETITOR] Crawl ${crawl.id} -> ${competitor.url}`,
    );

    // =======================================================
    // BACKGROUND CRAWL
    // =======================================================

    void this.runCrawl(
      organizationId,
      competitorId,
      crawl.id,
    ).catch(async (error) => {
      console.error(
        `[COMPETITOR] Background crawl crashed ${crawl.id}:`,
        error instanceof Error
          ? error.stack ||
            error.message
          : error,
      );

      await this.markCrawlFailed(
        crawl.id,
        error instanceof Error
          ? error.message
          : 'Unknown background error',
      );
    });

    // =======================================================
    // RETURN IMMEDIATELY
    // =======================================================

    return {
      success: true,
      alreadyRunning: false,

      message:
        'Competitor crawl started',

      crawl: {
        id: crawl.id,
        competitorId:
          crawl.competitorId,

        status: crawl.status,

        pagesCrawled:
          crawl.pagesCrawled,

        pagesDiscovered:
          crawl.pagesDiscovered,

        score: crawl.score,

        totalIssues:
          crawl.totalIssues,

        critical: crawl.critical,
        high: crawl.high,
        medium: crawl.medium,
        low: crawl.low,

        startedAt:
          crawl.startedAt,

        completedAt:
          crawl.completedAt,

        createdAt:
          crawl.createdAt,
      },
    };
  }

  // =========================================================
  // MAIN BACKGROUND CRAWLER
  // =========================================================

  private async runCrawl(
    organizationId: string,
    competitorId: string,
    crawlId: string,
  ) {
    let browser:
      | Browser
      | undefined;

    let context:
      | BrowserContext
      | undefined;

    const crawlStartedAt = Date.now();

    try {
      // =====================================================
      // GET COMPETITOR
      // =====================================================

      const competitor =
        await this.prisma.competitor.findFirst({
          where: {
            id: competitorId,
            organizationId,
          },
        });

      if (!competitor) {
        await this.markCrawlFailed(
          crawlId,
          'Competitor not found',
        );

        return;
      }

      const startUrl =
        this.normalizeUrl(
          competitor.url,
        );

      if (!startUrl) {
        await this.markCrawlFailed(
          crawlId,
          'Invalid competitor URL',
        );

        return;
      }

      const websiteHost =
        this.normalizeHostname(
          new URL(startUrl).hostname,
        );

      // =====================================================
      // LAUNCH BROWSER
      // =====================================================

      console.log(
        `[COMPETITOR] ${crawlId} launching Chromium`,
      );

      browser =
        await chromium.launch({
          headless: true,

          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-features=Translate,BackForwardCache',
          ],
        });

      context =
        await browser.newContext({
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',

          viewport: {
            width: 1280,
            height: 720,
          },

          locale: 'en-IN',

          timezoneId:
            'Asia/Kolkata',

          ignoreHTTPSErrors: true,

          serviceWorkers: 'block',

          extraHTTPHeaders: {
            'Accept-Language':
              'en-IN,en;q=0.9',
          },
        });

      context.setDefaultTimeout(
        6000,
      );

      context.setDefaultNavigationTimeout(
        this.PAGE_TIMEOUT,
      );

      // =====================================================
      // RESOURCE BLOCKING
      // =====================================================

      await context.route(
        '**/*',
        async (route) => {
          try {
            const request =
              route.request();

            const resourceType =
              request.resourceType();

            const requestUrl =
              request.url().toLowerCase();

            // -------------------------------------------------
            // BLOCK HEAVY RESOURCES
            // -------------------------------------------------

            if (
              resourceType ===
                'image' ||
              resourceType ===
                'media' ||
              resourceType ===
                'font'
            ) {
              await route.abort();
              return;
            }

            // -------------------------------------------------
            // BLOCK TRACKING
            // -------------------------------------------------

            const blockedHosts = [
              'google-analytics.com',
              'googletagmanager.com',
              'doubleclick.net',
              'facebook.net',
              'connect.facebook.net',
              'hotjar.com',
              'clarity.ms',
              'segment.io',
              'analytics.twitter.com',
              'bat.bing.com',
              'googlesyndication.com',
              'adservice.google.com',
              'amazon-adsystem.com',
            ];

            if (
              blockedHosts.some(
                (host) =>
                  requestUrl.includes(
                    host,
                  ),
              )
            ) {
              await route.abort();
              return;
            }

            await route.continue();
          } catch {
            try {
              await route.continue();
            } catch {
              // Ignore.
            }
          }
        },
      );

      // =====================================================
      // QUEUE
      // =====================================================

      const queue: string[] = [];

      const discovered =
        new Set<string>();

      const processed =
        new Set<string>();

      const finalUrls =
        new Set<string>();

      const pages:
        CrawledPage[] = [];

      queue.push(startUrl);
      discovered.add(startUrl);

      // =====================================================
      // SITEMAP DISCOVERY
      // =====================================================

      console.log(
        `[COMPETITOR] ${crawlId} discovering sitemaps`,
      );

      const sitemapUrls =
        await this.discoverSitemaps(
          startUrl,
        );

      console.log(
        `[COMPETITOR] ${crawlId} sitemap candidates: ${sitemapUrls.length}`,
      );

      // -----------------------------------------------------
      // READ SITEMAPS IN PARALLEL
      // -----------------------------------------------------

      const sitemapResults =
        await Promise.all(
          sitemapUrls
            .slice(0, 8)
            .map(async (sitemapUrl) => {
              console.log(
                `[COMPETITOR] ${crawlId} reading sitemap: ${sitemapUrl}`,
              );

              const urls =
                await this.fetchSitemap(
                  sitemapUrl,
                );

              console.log(
                `[COMPETITOR] ${crawlId} sitemap URLs: ${urls.length}`,
              );

              return urls;
            }),
        );

      let totalSitemapUrls = 0;

      for (
        const urls of sitemapResults
      ) {
        if (
          totalSitemapUrls >=
          this.MAX_TOTAL_SITEMAP_URLS
        ) {
          break;
        }

        for (
          const sitemapPageUrl of urls
        ) {
          if (
            totalSitemapUrls >=
            this.MAX_TOTAL_SITEMAP_URLS
          ) {
            break;
          }

          if (
            discovered.size >=
            this.MAX_PAGES
          ) {
            break;
          }

          const normalized =
            this.normalizeUrl(
              sitemapPageUrl,
            );

          if (!normalized) {
            continue;
          }

          try {
            const hostname =
              this.normalizeHostname(
                new URL(
                  normalized,
                ).hostname,
              );

            if (
              hostname !==
              websiteHost
            ) {
              continue;
            }
          } catch {
            continue;
          }

          if (
            this.isProbablyNonHtmlUrl(
              normalized,
            )
          ) {
            continue;
          }

          if (
            discovered.has(
              normalized,
            )
          ) {
            continue;
          }

          discovered.add(
            normalized,
          );

          queue.push(
            normalized,
          );

          totalSitemapUrls++;
        }
      }

      // =====================================================
      // ALWAYS KEEP START URL FIRST
      // =====================================================

      const startIndex =
        queue.indexOf(
          startUrl,
        );

      if (
        startIndex > 0
      ) {
        queue.splice(
          startIndex,
          1,
        );

        queue.unshift(
          startUrl,
        );
      }

      await this.updateCrawlProgress(
        crawlId,
        0,
        discovered.size,
      );

      console.log(
        `[COMPETITOR] ${crawlId} queue ready: ${queue.length} URLs`,
      );

      // =====================================================
      // PARALLEL CRAWL
      // =====================================================

      while (
        queue.length > 0 &&
        pages.length <
          this.MAX_PAGES
      ) {
        if (
          Date.now() - crawlStartedAt >
          this.MAX_CRAWL_TIME_MS
        ) {
          throw new Error(
            'Crawl safety timeout reached',
          );
        }

        const remainingSlots =
          this.MAX_PAGES -
          pages.length;

        const batchSize =
          Math.min(
            this.CONCURRENCY,
            remainingSlots,
            queue.length,
          );

        const batch: string[] = [];

        while (
          batch.length < batchSize &&
          queue.length > 0
        ) {
          const url = queue.shift();

          if (!url) {
            continue;
          }

          if (processed.has(url)) {
            continue;
          }

          // Reserve the URL immediately so it cannot be scheduled twice.
          processed.add(url);
          batch.push(url);
        }

        if (
          batch.length === 0
        ) {
          continue;
        }

        console.log(
          `[COMPETITOR] ${crawlId} crawling ${batch.length} pages in parallel | ${pages.length}/${this.MAX_PAGES}`,
        );

        const results =
          await Promise.all(
            batch.map(
              async (currentUrl) => {
                let page:
                  | Page
                  | undefined;

                try {
                  page =
                    await context!.newPage();

                  console.log(
                    `[COMPETITOR] ${crawlId} page start: ${currentUrl}`,
                  );

                  const result =
                    await this.crawlPage(
                      page,
                      currentUrl,
                      websiteHost,
                    );

                  return {
                    ok: true,
                    result,
                    requestedUrl:
                      currentUrl,
                  };
                } catch (error) {
                  console.error(
                    `[COMPETITOR] ${crawlId} page skipped: ${currentUrl}`,
                    error instanceof
                      Error
                      ? error.message
                      : error,
                  );

                  return {
                    ok: false,
                    result:
                      null,
                    requestedUrl:
                      currentUrl,
                  };
                } finally {
                  if (page) {
                    try {
                      await page.close();
                    } catch {
                      // Ignore.
                    }
                  }
                }
              },
            ),
          );

        // ===================================================
        // PROCESS RESULTS
        // ===================================================

        for (
          const item of results
        ) {
          if (
            !item.ok ||
            !item.result
          ) {
            continue;
          }

          const result =
            item.result;

          const pageUrl =
            result.page.url;

          // -------------------------------------------------
          // FINAL URL DEDUPE
          // -------------------------------------------------

          if (
            finalUrls.has(
              pageUrl,
            )
          ) {
            continue;
          }

          finalUrls.add(
            pageUrl,
          );

          // -------------------------------------------------
          // MAX PAGE CHECK
          // -------------------------------------------------

          if (
            pages.length >=
            this.MAX_PAGES
          ) {
            break;
          }

          pages.push(
            result.page,
          );

          // -------------------------------------------------
          // DISCOVER INTERNAL LINKS
          // -------------------------------------------------

          for (
            const internalUrl of
            result.internalUrls
          ) {
            if (
              discovered.size >=
              this.MAX_PAGES
            ) {
              break;
            }

            if (
              discovered.has(
                internalUrl,
              )
            ) {
              continue;
            }

            if (
              processed.has(
                internalUrl,
              )
            ) {
              continue;
            }

            if (
              this.isProbablyNonHtmlUrl(
                internalUrl,
              )
            ) {
              continue;
            }

            discovered.add(
              internalUrl,
            );

            queue.push(
              internalUrl,
            );
          }
        }

        // ===================================================
        // SAVE BATCH IN PARALLEL
        // ===================================================
        //
        // Saving one page at a time makes a 6-page crawl batch
        // wait on 6 separate DB round-trips. Save the accepted
        // pages together after result processing instead.
        //

        const batchPages = Array.from(
          new Map(
            results
              .filter(
                (
                  item,
                ): item is {
                  ok: true;
                  result: CrawlPageResult;
                  requestedUrl: string;
                } =>
                  item.ok === true &&
                  !!item.result,
              )
              .map((item) => [
                item.result.page.url,
                item.result.page,
              ]),
          ).values(),
        ).filter((page) =>
          finalUrls.has(page.url),
        );

        await Promise.all(
          batchPages.map((page) =>
            this.savePage(crawlId, page),
          ),
        );

        // ===================================================
        // PROGRESS
        // ===================================================

        await this.updateCrawlProgress(
          crawlId,
          pages.length,
          discovered.size,
        );

        console.log(
          `[COMPETITOR] ${crawlId} progress: ${pages.length} crawled / ${discovered.size} discovered / ${queue.length} queued`,
        );
      }

      // =====================================================
      // CLOSE CONTEXT
      // =====================================================

      if (context) {
        try {
          await context.close();
        } catch {
          // Ignore.
        }

        context =
          undefined;
      }

      // =====================================================
      // ANALYZE
      // =====================================================

      console.log(
        `[COMPETITOR] ${crawlId} analyzing ${pages.length} pages`,
      );

      const issues =
        this.analyzePages(
          pages,
        );

      const critical =
        issues.filter(
          (issue) =>
            issue.severity ===
            'CRITICAL',
        ).length;

      const high =
        issues.filter(
          (issue) =>
            issue.severity ===
            'HIGH',
        ).length;

      const medium =
        issues.filter(
          (issue) =>
            issue.severity ===
            'MEDIUM',
        ).length;

      const low =
        issues.filter(
          (issue) =>
            issue.severity ===
            'LOW',
        ).length;

      const score =
        this.calculateScore(
          pages.length,
          critical,
          high,
          medium,
          low,
        );

      // =====================================================
      // COMPLETE
      // =====================================================

      const completed =
        await this.prisma.competitorCrawl.update(
          {
            where: {
              id: crawlId,
            },

            data: {
              status: 'COMPLETED',

              pagesCrawled:
                pages.length,

              pagesDiscovered:
                discovered.size,

              score,

              totalIssues:
                issues.length,

              critical,
              high,
              medium,
              low,

              completedAt:
                new Date(),
            },
          },
        );

      console.log(
        `[COMPETITOR] COMPLETE ${crawlId} | pages=${pages.length} discovered=${discovered.size} score=${score} issues=${issues.length}`,
      );

      return {
        competitor: {
          id: competitor.id,
          name: competitor.name,
          url: competitor.url,
          domain: competitor.domain,
        },

        crawl: completed,

        summary: {
          score,

          pages: {
            crawled:
              pages.length,

            discovered:
              discovered.size,

            saved:
              pages.length,
          },

          issues: {
            total:
              issues.length,

            critical,
            high,
            medium,
            low,
          },
        },

        topIssues:
          issues.slice(0, 20),
      };
    } catch (error) {
      console.error(
        `[COMPETITOR] FAILED ${crawlId}:`,
        error instanceof Error
          ? error.stack ||
            error.message
          : error,
      );

      await this.markCrawlFailed(
        crawlId,
        error instanceof Error
          ? error.message
          : 'Unknown error',
      );

      throw error;
    } finally {
      if (context) {
        try {
          await context.close();
        } catch {
          // Ignore.
        }
      }

      if (browser) {
        try {
          await browser.close();
        } catch {
          // Ignore.
        }
      }
    }
  }

  // =========================================================
  // COMPATIBILITY METHOD
  // =========================================================

  async crawlCompetitor(
    organizationId: string,
    competitorId: string,
  ) {
    return this.startCrawl(
      organizationId,
      competitorId,
    );
  }

  // =========================================================
  // CRAWL ONE PAGE
  // =========================================================

  private async crawlPage(
    page: Page,
    url: string,
    websiteHost: string,
  ): Promise<CrawlPageResult> {
    const startedAt =
      Date.now();

    let response:
      Awaited<
        ReturnType<Page['goto']>
      > = null;

    // =======================================================
    // NAVIGATION
    // =======================================================

    try {
      response =
        await page.goto(
          url,
          {
            /**
             * IMPORTANT:
             *
             * Do not wait for all network requests.
             * Some large websites keep network connections
             * open indefinitely.
             */
            waitUntil:
              'commit',

            timeout:
              this.PAGE_TIMEOUT,
          },
        );
    } catch (error) {
      console.warn(
        `[COMPETITOR] navigation warning ${url}:`,
        error instanceof Error
          ? error.message
          : error,
      );
    }

    // =======================================================
    // DOM CONTENT
    // =======================================================

    try {
      await page.waitForLoadState(
        'domcontentloaded',
        {
          timeout:
            this.DOM_TIMEOUT,
        },
      );
    } catch {
      // The page can still contain usable HTML.
    }

    // =======================================================
    // SMALL RENDER WINDOW
    // =======================================================

    try {
      await page.waitForTimeout(
        this.RENDER_WAIT,
      );
    } catch {
      // Ignore.
    }

    // =======================================================
    // CURRENT URL
    // =======================================================

    const currentPageUrl =
      page.url();

    if (
      !currentPageUrl ||
      currentPageUrl ===
        'about:blank'
    ) {
      throw new Error(
        `Unable to load page: ${url}`,
      );
    }

    const finalUrl =
      this.normalizeUrl(
        currentPageUrl,
      );

    if (!finalUrl) {
      throw new Error(
        `Invalid final URL: ${currentPageUrl}`,
      );
    }

    // =======================================================
    // STATUS
    // =======================================================

    const statusCode =
      response?.status() ??
      0;

    // =======================================================
    // HTML
    // =======================================================

    let html = '';

    try {
      html =
        await this.withTimeout(
          page.content(),
          5000,
          `HTML timeout: ${url}`,
        );
    } catch {
      try {
        html =
          await this.withTimeout(
            page.evaluate(
              () =>
                document
                  .documentElement
                  ?.outerHTML ||
                '',
            ),
            3000,
            `DOM extraction timeout: ${url}`,
          );
      } catch {
        html = '';
      }
    }

    if (!html) {
      throw new Error(
        `Empty HTML: ${url}`,
      );
    }

    const $ =
      cheerio.load(html);

    // =======================================================
    // TITLE
    // =======================================================

    const title =
      $('title')
        .first()
        .text()
        .replace(/\s+/g, ' ')
        .trim() ||
      null;

    // =======================================================
    // META DESCRIPTION
    // =======================================================

    const metaDescription =
      $(
        'meta[name="description"]',
      )
        .first()
        .attr('content')
        ?.replace(/\s+/g, ' ')
        .trim() ||
      null;

    // =======================================================
    // CANONICAL
    // =======================================================

    const canonical =
      $(
        'link[rel="canonical"]',
      )
        .first()
        .attr('href')
        ?.trim() ||
      null;

    let canonicalAbsolute:
      string | null = null;

    if (canonical) {
      try {
        canonicalAbsolute =
          new URL(
            canonical,
            finalUrl,
          ).toString();
      } catch {
        canonicalAbsolute =
          null;
      }
    }

    // =======================================================
    // H1
    // =======================================================

    const h1 =
      $('h1')
        .map(
          (_, element) =>
            $(element)
              .text()
              .replace(/\s+/g, ' ')
              .trim(),
        )
        .get()
        .filter(Boolean);

    // =======================================================
    // H2
    // =======================================================

    const h2 =
      $('h2')
        .map(
          (_, element) =>
            $(element)
              .text()
              .replace(/\s+/g, ' ')
              .trim(),
        )
        .get()
        .filter(Boolean);

    // =======================================================
    // IMAGES
    // =======================================================

    const images =
      $('img').length;

    const imagesWithoutAlt =
      $('img').filter(
        (_, element) => {
          const alt =
            $(element).attr(
              'alt',
            );

          return (
            !alt ||
            !alt.trim()
          );
        },
      ).length;

    // =======================================================
    // CONTENT
    // =======================================================

    $(
      'script, style, noscript, template, svg',
    ).remove();

    const bodyText =
      $('body')
        .text()
        .replace(/\s+/g, ' ')
        .trim();

    const wordCount =
      bodyText
        ? bodyText
            .split(/\s+/)
            .filter(Boolean)
            .length
        : 0;

    // =======================================================
    // ROBOTS
    // =======================================================

    const robots =
      $('meta[name="robots"]')
        .first()
        .attr('content')
        ?.trim() ||
      null;

    let robotsIndexable:
      boolean | null = null;

    let robotsFollow:
      boolean | null = null;

    if (robots) {
      const robotsLower =
        robots.toLowerCase();

      robotsIndexable =
        !robotsLower.includes(
          'noindex',
        );

      robotsFollow =
        !robotsLower.includes(
          'nofollow',
        );
    }

    // =======================================================
    // VIEWPORT
    // =======================================================

    const viewport =
      $('meta[name="viewport"]')
        .first()
        .attr('content')
        ?.trim() ||
      null;

    // =======================================================
    // LANGUAGE
    // =======================================================

    const lang =
      $('html')
        .attr('lang')
        ?.trim() ||
      null;

    // =======================================================
    // CHARSET
    // =======================================================

    const charset =
      $('meta[charset]')
        .first()
        .attr('charset')
        ?.trim() ||
      null;

    // =======================================================
    // OPEN GRAPH
    // =======================================================

    const ogTitle =
      $(
        'meta[property="og:title"]',
      )
        .first()
        .attr('content')
        ?.trim() ||
      null;

    const ogDescription =
      $(
        'meta[property="og:description"]',
      )
        .first()
        .attr('content')
        ?.trim() ||
      null;

    const ogImage =
      $(
        'meta[property="og:image"]',
      )
        .first()
        .attr('content')
        ?.trim() ||
      null;

    // =======================================================
    // TWITTER
    // =======================================================

    const twitterCard =
      $(
        'meta[name="twitter:card"]',
      )
        .first()
        .attr('content')
        ?.trim() ||
      null;

    // =======================================================
    // JSON-LD
    // =======================================================

    const jsonLdValues =
      $(
        'script[type="application/ld+json"]',
      )
        .map(
          (_, element) =>
            $(element)
              .text()
              .trim(),
        )
        .get()
        .filter(Boolean);

    const parsedJsonLd:
      unknown[] = [];

    for (
      const value of
      jsonLdValues
    ) {
      try {
        parsedJsonLd.push(
          JSON.parse(value),
        );
      } catch {
        // Invalid JSON-LD ignored.
      }
    }

    const jsonLd =
      parsedJsonLd.length > 0
        ? parsedJsonLd
        : null;

    // =======================================================
    // LINKS
    // =======================================================

    const internalUrls:
      string[] = [];

    let internalLinks = 0;
    let externalLinks = 0;

    const hrefs =
      $('a')
        .map(
          (_, element) =>
            $(element).attr(
              'href',
            ),
        )
        .get()
        .filter(Boolean);

    for (
      const href of hrefs
    ) {
      try {
        const link =
          new URL(
            href,
            finalUrl,
          );

        if (
          link.protocol !==
            'http:' &&
          link.protocol !==
            'https:'
        ) {
          continue;
        }

        link.hash = '';

        const normalized =
          this.normalizeUrl(
            link.toString(),
          );

        if (!normalized) {
          continue;
        }

        if (
          this.isProbablyNonHtmlUrl(
            normalized,
          )
        ) {
          continue;
        }

        const hostname =
          this.normalizeHostname(
            new URL(
              normalized,
            ).hostname,
          );

        if (
          hostname ===
          websiteHost
        ) {
          internalLinks++;

          if (
            normalized !==
            finalUrl
          ) {
            internalUrls.push(
              normalized,
            );
          }
        } else {
          externalLinks++;
        }
      } catch {
        continue;
      }
    }

    // =======================================================
    // REDIRECT COUNT
    // =======================================================

    const redirectCount =
      await this.getRedirectCount(
        page,
      );

    // =======================================================
    // CONTENT TYPE
    // =======================================================

    const contentType =
      response
        ?.headers()
        ?.['content-type'] ||
      null;

    // =======================================================
    // LOAD TIME
    // =======================================================

    const loadTimeMs =
      Date.now() -
      startedAt;

    // =======================================================
    // RESULT
    // =======================================================

    const crawledPage:
      CrawledPage = {
        url: finalUrl,

        statusCode,

        title,
        metaDescription,

        canonical,
        canonicalAbsolute,

        h1,
        h2,

        images,
        imagesWithoutAlt,

        internalLinks,
        externalLinks,

        wordCount,

        robots,
        robotsIndexable,
        robotsFollow,

        viewport,
        lang,
        charset,

        ogTitle,
        ogDescription,
        ogImage,

        twitterCard,

        structuredDataCount:
          parsedJsonLd.length,

        jsonLd,

        redirectCount,

        finalUrl,

        contentType,

        loadTimeMs,
      };

    console.log(
      `[COMPETITOR] page done: ${finalUrl} (${statusCode}) ${loadTimeMs}ms`,
    );

    return {
      page: crawledPage,

      internalUrls:
        Array.from(
          new Set(
            internalUrls,
          ),
        ),
    };
  }

  // =========================================================
  // SAVE PAGE
  // =========================================================

  private async savePage(
    crawlId: string,
    page: CrawledPage,
  ) {
    try {
      await this.prisma.competitorCrawlPage.create(
        {
          data: {
            competitorCrawlId:
              crawlId,

            url:
              page.url,

            statusCode:
              page.statusCode,

            title:
              page.title,

            metaDescription:
              page.metaDescription,

            canonical:
              page.canonical,

            canonicalAbsolute:
              page.canonicalAbsolute,

            h1:
              page.h1,

            h2:
              page.h2,

            images:
              page.images,

            imagesWithoutAlt:
              page.imagesWithoutAlt,

            internalLinks:
              page.internalLinks,

            externalLinks:
              page.externalLinks,

            wordCount:
              page.wordCount,

            robots:
              page.robots,

            robotsIndexable:
              page.robotsIndexable,

            robotsFollow:
              page.robotsFollow,

            viewport:
              page.viewport,

            lang:
              page.lang,

            charset:
              page.charset,

            ogTitle:
              page.ogTitle,

            ogDescription:
              page.ogDescription,

            ogImage:
              page.ogImage,

            twitterCard:
              page.twitterCard,

            structuredDataCount:
              page.structuredDataCount,

            jsonLd:
              page.jsonLd as any,

            redirectCount:
              page.redirectCount,

            finalUrl:
              page.finalUrl,

            contentType:
              page.contentType,

            loadTimeMs:
              page.loadTimeMs,
          },
        },
      );
    } catch (error) {
      console.error(
        `[COMPETITOR] Could not save page ${page.url}:`,
        error instanceof Error
          ? error.message
          : error,
      );
    }
  }

  // =========================================================
  // SEO ANALYSIS
  // =========================================================

  private analyzePages(
    pages: CrawledPage[],
  ): CrawlIssue[] {
    const issues:
      CrawlIssue[] = [];

    for (
      const page of pages
    ) {
      // =====================================================
      // HTTP ERROR
      // =====================================================

      if (
        page.statusCode >=
        400
      ) {
        issues.push({
          code:
            'HTTP_ERROR',

          severity:
            'CRITICAL',

          title:
            'HTTP error page',

          description:
            `Page returned HTTP ${page.statusCode}.`,
        });
      }

      // =====================================================
      // TITLE
      // =====================================================

      if (!page.title) {
        issues.push({
          code:
            'MISSING_TITLE',

          severity:
            'HIGH',

          title:
            'Missing title tag',

          description:
            'The page does not have a title tag.',
        });
      }

      if (
        page.title &&
        page.title.length >
          60
      ) {
        issues.push({
          code:
            'LONG_TITLE',

          severity:
            'LOW',

          title:
            'Title tag is too long',

          description:
            'The title is longer than approximately 60 characters.',
        });
      }

      if (
        page.title &&
        page.title.length <
          20
      ) {
        issues.push({
          code:
            'SHORT_TITLE',

          severity:
            'LOW',

          title:
            'Title tag is short',

          description:
            'The title may not provide enough context.',
        });
      }

      // =====================================================
      // META DESCRIPTION
      // =====================================================

      if (
        !page.metaDescription
      ) {
        issues.push({
          code:
            'MISSING_META_DESCRIPTION',

          severity:
            'MEDIUM',

          title:
            'Missing meta description',

          description:
            'The page does not have a meta description.',
        });
      }

      if (
        page.metaDescription &&
        page.metaDescription
          .length >
          160
      ) {
        issues.push({
          code:
            'LONG_META_DESCRIPTION',

          severity:
            'LOW',

          title:
            'Meta description is too long',

          description:
            'The meta description is longer than approximately 160 characters.',
        });
      }

      // =====================================================
      // CANONICAL
      // =====================================================

      if (!page.canonical) {
        issues.push({
          code:
            'MISSING_CANONICAL',

          severity:
            'MEDIUM',

          title:
            'Missing canonical',

          description:
            'The page does not declare a canonical URL.',
        });
      }

      // =====================================================
      // H1
      // =====================================================

      if (
        page.h1.length ===
        0
      ) {
        issues.push({
          code:
            'MISSING_H1',

          severity:
            'HIGH',

          title:
            'Missing H1',

          description:
            'The page does not contain an H1 heading.',
        });
      }

      if (
        page.h1.length >
        1
      ) {
        issues.push({
          code:
            'MULTIPLE_H1',

          severity:
            'LOW',

          title:
            'Multiple H1 headings',

          description:
            'The page contains more than one H1 heading.',
        });
      }

      // =====================================================
      // ALT
      // =====================================================

      if (
        page.imagesWithoutAlt >
        0
      ) {
        issues.push({
          code:
            'IMAGES_MISSING_ALT',

          severity:
            'MEDIUM',

          title:
            'Images missing alt text',

          description:
            `${page.imagesWithoutAlt} image(s) do not have useful alt text.`,
        });
      }

      // =====================================================
      // CONTENT
      // =====================================================

      if (
        page.wordCount <
        300
      ) {
        issues.push({
          code:
            'THIN_CONTENT',

          severity:
            'MEDIUM',

          title:
            'Thin content',

          description:
            `The page contains approximately ${page.wordCount} words.`,
        });
      }

      // =====================================================
      // SPEED
      // =====================================================

      if (
        page.loadTimeMs >
        3000
      ) {
        issues.push({
          code:
            'SLOW_PAGE',

          severity:
            'HIGH',

          title:
            'Slow page load',

          description:
            `The page took approximately ${page.loadTimeMs}ms to load.`,
        });
      }
    }

    return issues;
  }

  // =========================================================
  // SCORE
  // =========================================================

  private calculateScore(
    pageCount: number,
    critical: number,
    high: number,
    medium: number,
    low: number,
  ): number {
    const pages =
      Math.max(
        pageCount,
        1,
      );

    const impact =
      (count: number) =>
        count /
        (count + pages);

    const penalty =
      impact(critical) * 35 +
      impact(high) * 25 +
      impact(medium) * 20 +
      impact(low) * 10;

    return Math.round(
      Math.max(
        0,
        Math.min(
          100,
          100 - penalty,
        ),
      ),
    );
  }

  // =========================================================
  // DISCOVER SITEMAPS
  // =========================================================

  private async discoverSitemaps(
    websiteUrl: string,
  ): Promise<string[]> {
    const results =
      new Set<string>();

    try {
      const parsed =
        new URL(
          websiteUrl,
        );

      const robotsUrl =
        `${parsed.protocol}//${parsed.host}/robots.txt`;

      // =====================================================
      // ROBOTS
      // =====================================================

      try {
        const response =
          await fetch(
            robotsUrl,
            {
              signal:
                AbortSignal.timeout(
                  this.SITEMAP_TIMEOUT,
                ),

              headers: {
                'User-Agent':
                  'RENKOO-SEO-Crawler/1.0',
              },
            },
          );

        if (response.ok) {
          const content =
            await response.text();

          for (
            const line of
            content.split(
              /\r?\n/,
            )
          ) {
            const trimmed =
              line.trim();

            if (
              trimmed
                .toLowerCase()
                .startsWith(
                  'sitemap:',
                )
            ) {
              const sitemap =
                trimmed
                  .substring(
                    'sitemap:'.length,
                  )
                  .trim();

              if (
                sitemap
              ) {
                results.add(
                  sitemap,
                );
              }
            }
          }
        }
      } catch (error) {
        console.warn(
          `[COMPETITOR] robots.txt skipped:`,
          error instanceof Error
            ? error.message
            : error,
        );
      }

      // =====================================================
      // DEFAULT SITEMAP
      // =====================================================

      results.add(
        `${parsed.origin}/sitemap.xml`,
      );

      // =====================================================
      // COMMON SITEMAPS
      // =====================================================

      results.add(
        `${parsed.origin}/sitemap_index.xml`,
      );

      results.add(
        `${parsed.origin}/sitemap-index.xml`,
      );
    } catch {
      // Invalid URL.
    }

    return Array.from(
      results,
    );
  }

  // =========================================================
  // FETCH SITEMAP
  // =========================================================

  private async fetchSitemap(
    sitemapUrl: string,
  ): Promise<string[]> {
    try {
      const response =
        await fetch(
          sitemapUrl,
          {
            signal:
              AbortSignal.timeout(
                this.SITEMAP_TIMEOUT,
              ),

            headers: {
              'User-Agent':
                'RENKOO-SEO-Crawler/1.0',

              Accept:
                'application/xml,text/xml,text/plain,*/*',
            },
          },
        );

      if (!response.ok) {
        return [];
      }

      const xml =
        await response.text();

      if (
        !xml ||
        !xml.trim()
      ) {
        return [];
      }

      const urls:
        string[] = [];

      const matches =
        xml.matchAll(
          /<loc[^>]*>\s*([\s\S]*?)\s*<\/loc>/gi,
        );

      for (
        const match of matches
      ) {
        if (
          urls.length >=
          this.MAX_SITEMAP_URLS
        ) {
          break;
        }

        const value =
          this.decodeXml(
            match[1]?.trim() ||
              '',
          );

        if (!value) {
          continue;
        }

        // Do not put sitemap XML
        // into browser crawl queue.
        if (
          /\.xml(?:[?#].*)?$/i.test(
            value,
          )
        ) {
          continue;
        }

        urls.push(
          value,
        );
      }

      return Array.from(
        new Set(
          urls,
        ),
      );
    } catch (error) {
      console.warn(
        `[COMPETITOR] sitemap skipped ${sitemapUrl}:`,
        error instanceof Error
          ? error.message
          : error,
      );

      return [];
    }
  }

  // =========================================================
  // REDIRECT COUNT
  // =========================================================

  private async getRedirectCount(
    page: Page,
  ): Promise<number> {
    try {
      return await this.withTimeout(
        page.evaluate(() => {
          const navigation =
            performance.getEntriesByType(
              'navigation',
            )[0] as
              | PerformanceNavigationTiming
              | undefined;

          if (!navigation) {
            return 0;
          }

          return Math.max(
            0,
            navigation.redirectCount ||
              0,
          );
        }),

        500,

        'Redirect count timeout',
      );
    } catch {
      return 0;
    }
  }

  // =========================================================
  // UPDATE PROGRESS
  // =========================================================

  private async updateCrawlProgress(
    crawlId: string,
    pagesCrawled: number,
    pagesDiscovered: number,
  ) {
    try {
      await this.prisma.competitorCrawl.update(
        {
          where: {
            id: crawlId,
          },

          data: {
            pagesCrawled,
            pagesDiscovered,
          },
        },
      );
    } catch (error) {
      console.error(
        `[COMPETITOR] Progress update failed ${crawlId}:`,
        error instanceof Error
          ? error.message
          : error,
      );
    }
  }

  // =========================================================
  // MARK FAILED
  // =========================================================

  private async markCrawlFailed(
    crawlId: string,
    reason?: string,
  ) {
    try {
      await this.prisma.competitorCrawl.update(
        {
          where: {
            id: crawlId,
          },

          data: {
            status: 'FAILED',

            completedAt:
              new Date(),
          },
        },
      );

      console.error(
        `[COMPETITOR] Crawl ${crawlId} marked FAILED: ${
          reason ||
          'Unknown error'
        }`,
      );
    } catch (error) {
      console.error(
        `[COMPETITOR] Failed to update crawl ${crawlId}:`,
        error,
      );
    }
  }

  // =========================================================
  // GENERIC TIMEOUT
  // =========================================================

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string,
  ): Promise<T> {
    let timer:
      | ReturnType<
          typeof setTimeout
        >
      | undefined;

    try {
      return await Promise.race([
        promise,

        new Promise<T>(
          (_, reject) => {
            timer =
              setTimeout(() => {
                reject(
                  new Error(
                    message,
                  ),
                );
              }, timeoutMs);
          },
        ),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  // =========================================================
  // XML DECODE
  // =========================================================

  private decodeXml(
    value: string,
  ): string {
    return value
      .replace(
        /&amp;/gi,
        '&',
      )
      .replace(
        /&lt;/gi,
        '<',
      )
      .replace(
        /&gt;/gi,
        '>',
      )
      .replace(
        /&quot;/gi,
        '"',
      )
      .replace(
        /&#39;/gi,
        "'",
      );
  }

  // =========================================================
  // NORMALIZE HOSTNAME
  // =========================================================

  private normalizeHostname(
    hostname: string,
  ): string {
    return hostname
      .toLowerCase()
      .replace(
        /^www\./,
        '',
      );
  }

  // =========================================================
  // NON HTML URL CHECK
  // =========================================================

  private isProbablyNonHtmlUrl(
    input: string,
  ): boolean {
    try {
      const pathname =
        new URL(
          input,
        ).pathname.toLowerCase();

      return /\.(pdf|jpg|jpeg|png|gif|webp|svg|ico|mp4|mp3|avi|mov|zip|rar|7z|css|js|xml|json|csv|doc|docx|xls|xlsx|ppt|pptx|woff|woff2|ttf|eot)$/i.test(
        pathname,
      );
    } catch {
      return true;
    }
  }

  // =========================================================
  // NORMALIZE URL
  // =========================================================

  private normalizeUrl(
    input: string,
  ): string {
    try {
      const url =
        new URL(
          input,
        );

      if (
        url.protocol !==
          'http:' &&
        url.protocol !==
          'https:'
      ) {
        return '';
      }

      url.hostname =
        this.normalizeHostname(
          url.hostname,
        );

      url.hash = '';

      // =====================================================
      // REMOVE TRACKING PARAMETERS
      // =====================================================

      const trackingParams = [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_term',
        'utm_content',
        'gclid',
        'fbclid',
        'msclkid',
        'dclid',
        '_ga',
        '_gl',
      ];

      for (
        const param of
        trackingParams
      ) {
        url.searchParams.delete(
          param,
        );
      }

      // =====================================================
      // REMOVE TRAILING SLASH
      // =====================================================

      if (
        url.pathname.length >
          1 &&
        url.pathname.endsWith(
          '/',
        )
      ) {
        url.pathname =
          url.pathname.slice(
            0,
            -1,
          );
      }

      // =====================================================
      // DEFAULT PORTS
      // =====================================================

      if (
        url.protocol ===
          'http:' &&
        url.port === '80'
      ) {
        url.port = '';
      }

      if (
        url.protocol ===
          'https:' &&
        url.port === '443'
      ) {
        url.port = '';
      }

      return url.toString();
    } catch {
      return '';
    }
  }
}
import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';

import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { SeoAuditService } from './seo-audit.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { CrawlLinkService } from './crawl-link.service';
import {
  cleanAnchorText,
  normalizeCrawlHostname,
  normalizeCrawlUrl,
  parseLinkRel,
  type RawLinkObservation,
} from './crawl-links';
import {
  VERIFICATION_CRAWL_COMPLETED,
  VERIFICATION_CRAWL_FAILED,
} from './crawl-status';

import {
  chromium,
  Browser,
  Page,
} from 'playwright';

import {
  SeoIssueSeverity,
  SeoIssueStatus,
} from '@prisma/client';

import * as cheerio from 'cheerio';

@Injectable()
export class CrawlService {
  /*
   * Bounded crawl tuning. Defaults preserve the
   * long-standing production behavior; operators
   * may override via environment (values are
   * clamped to the safe ranges below).
   */
  private static readIntEnv(
    name: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const raw = process.env[name];

    if (!raw) {
      return fallback;
    }

    const parsed =
      Number.parseInt(raw, 10);

    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.min(
      max,
      Math.max(min, parsed),
    );
  }

  private readonly MAX_PAGES =
    CrawlService.readIntEnv(
      'CRAWL_MAX_PAGES',
      50,
      1,
      200,
    );

  private readonly PAGE_TIMEOUT =
    CrawlService.readIntEnv(
      'CRAWL_PAGE_TIMEOUT_MS',
      30000,
      5000,
      120000,
    );

  /*
   * Bounded concurrency for independent page
   * fetches. Each unit of work owns its own
   * Playwright Page; shared crawl state is only
   * touched in synchronous sections (JS is
   * single-threaded, so check-then-act on the
   * Sets/counters below is atomic). Slots are
   * reserved at dispatch so the crawl can never
   * exceed MAX_PAGES + CONCURRENCY - 1 saves,
   * and timeouts/limits/tenant checks are
   * unchanged.
   */
  private readonly PAGE_CONCURRENCY =
    CrawlService.readIntEnv(
      'CRAWL_PAGE_CONCURRENCY',
      5,
      1,
      10,
    );

  /*
   * Absolute safety limit for one crawl.
   * Prevents a pathological site (or a stalled
   * worker pool) from leaving the crawl row in
   * RUNNING forever and holding the HTTP
   * request open indefinitely.
   */
  private readonly MAX_CRAWL_TIME_MS =
    CrawlService.readIntEnv(
      'CRAWL_MAX_TIME_MS',
      8 * 60 * 1000,
      60 * 1000,
      30 * 60 * 1000,
    );

  constructor(
    private readonly prisma: PrismaService,
    private readonly seoAuditService: SeoAuditService,
    private readonly monitoringService: MonitoringService,
    private readonly crawlLinkService: CrawlLinkService,
  ) {}

  /*
   * =========================================================
    * VERIFY SINGLE PAGE (Phase 28) — bounded on-demand
    * observation for execution verification. Reuses the
    * same browser flags, timeout, normalization and
    * extraction as full crawls via crawlSinglePage.
    * Persists as a one-page Crawl row (honest history,
    * quota-consumed by the caller). Never full-site.
    * Phase 41 (Group G): terminal status is
    * COMPLETED_VERIFICATION / FAILED_VERIFICATION so
    * verification rows can never become the
    * authoritative latest site crawl (every authority
    * query filters status COMPLETED exactly).
    * The URL must belong to the website host — cross-org
    * URLs are rejected before any fetch.
    * =========================================================
    */

  async verifyPageUrl(
    organizationId: string,
    websiteId: string,
    url: string,
  ): Promise<{
    crawlId: string;
    page: Record<string, unknown> | null;
    crawlAt: string;
  }> {
    let browser: Browser | undefined;

    const website =
      await this.prisma.website.findFirst({
        where: {
          id: websiteId,
          organizationId,
        },
      });
    if (!website) {
      throw new BadRequestException(
        'Website not found',
      );
    }
    const websiteHost = this.normalizeHostname(
      new URL(
        this.normalizeUrl(website.url) ??
          website.url,
      ).hostname,
    );
    const target = this.normalizeUrl(url);
    if (!target) {
      throw new BadRequestException(
        'Invalid URL for verification',
      );
    }
    let targetHost = '';
    try {
      targetHost = this.normalizeHostname(
        new URL(target).hostname,
      );
    } catch {
      throw new BadRequestException(
        'Invalid URL for verification',
      );
    }
    if (targetHost !== websiteHost) {
      throw new BadRequestException(
        'Verification URL must belong to the website',
      );
    }

    const crawl = await this.prisma.crawl.create({
      data: {
        websiteId,
        status: 'RUNNING',
      },
    });

    try {
      try {
        browser = await chromium.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
          ],
        });
      } catch (launchError) {
        const message =
          launchError instanceof Error
            ? launchError.message
            : 'Unknown error';
        throw new BadRequestException(
          `Live verification could not start: browser launch failed (${message}).`,
        );
      }

      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (compatible; RENKOOBot/1.0; +https://renkoo.ai)',
      });
      context.setDefaultNavigationTimeout(
        this.PAGE_TIMEOUT,
      );
      const page = await context.newPage();
      await this.crawlSinglePage(
        page,
        target,
        websiteHost,
        crawl.id,
        { organizationId, websiteId },
      );
      await page.close().catch(() => null);
      await context.close().catch(() => null);

      await this.prisma.crawl.update({
        where: { id: crawl.id },
        data: {
          status: VERIFICATION_CRAWL_COMPLETED,
          completedAt: new Date(),
        },
      });

      const saved =
        await this.prisma.crawlPage.findFirst({
          where: { crawlId: crawl.id },
        });

      return {
        crawlId: crawl.id,
        page: (saved ?? null) as Record<
          string,
          unknown
        > | null,
        crawlAt: new Date().toISOString(),
      };
    } catch (error) {
      await this.prisma.crawl
        .update({
          where: { id: crawl.id },
          data: { status: VERIFICATION_CRAWL_FAILED },
        })
        .catch(() => null);
      throw error;
    } finally {
      await browser?.close().catch(() => null);
    }
  }

  /*
   * =========================================================
   * MAIN WEBSITE CRAWLER
   * =========================================================
   */

  async crawlWebsite(
    organizationId: string,
    websiteId: string,
  ) {
    let browser: Browser | undefined;

    const website =
      await this.prisma.website.findFirst({
        where: {
          id: websiteId,
          organizationId,
        },
      });

    if (!website) {
      throw new BadRequestException(
        'Website not found',
      );
    }

    const startUrl =
      this.normalizeUrl(website.url);

    if (!startUrl) {
      throw new BadRequestException(
        'Invalid website URL',
      );
    }

    const crawl =
      await this.prisma.crawl.create({
        data: {
          websiteId,
          status: 'RUNNING',
        },
      });

    try {
      /*
       * =======================================================
       * BROWSER
       * =======================================================
       */

      /*
       * Production-hardened launch flags (same set
       * the competitor crawler already uses):
       * --no-sandbox and --disable-dev-shm-usage
       * are required inside minimal containers
       * such as Render's native Node runtime.
       * They are harmless on developer machines.
       */
      try {
        browser =
          await chromium.launch({
            headless: true,

            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-gpu',
            ],
          });
      } catch (launchError) {
        const message =
          launchError instanceof
          Error
            ? launchError.message
            : 'Unknown error';

        const missingBinary =
          /executable doesn'?t exist/i.test(
            message,
          );

        throw new BadRequestException(
          missingBinary
            ? `Website crawl could not start: the server browser runtime is not installed (${message}). Deployment step required: run \`npx playwright install chromium\` for the installed Playwright version, then restart the backend.`
            : `Website crawl could not start: browser launch failed (${message}).`,
        );
      }

      const context =
        await browser.newContext({
          userAgent:
            'Mozilla/5.0 (compatible; RENKOOBot/1.0; +https://renkoo.ai)',
        });

      context.setDefaultNavigationTimeout(
        this.PAGE_TIMEOUT,
      );

      /*
       * Resource blocking (same policy the
       * competitor crawler already uses).
       * SEO extraction reads the DOM, never the
       * bytes of images/fonts/media — blocking
       * them only removes network wait, never
       * evidence (img counts and alt attributes
       * come from the HTML markup itself).
       */
      await context.route(
        '**/*',
        async (route) => {
          try {
            const request =
              route.request();

            const resourceType =
              request.resourceType();

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

            const requestUrl =
              request
                .url()
                .toLowerCase();

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
              // Ignore routing teardown races.
            }
          }
        },
      );

      /*
       * =======================================================
       * CRAWL STATE
       * =======================================================
       */

      const queue: string[] = [];

      const discovered =
        new Set<string>();

      const processed =
        new Set<string>();

      const saved =
        new Set<string>();

      /*
       * =======================================================
       * INITIAL URL
       * =======================================================
       */

      queue.push(startUrl);
      discovered.add(startUrl);

      const websiteHost =
        this.normalizeHostname(
          new URL(startUrl).hostname,
        );

      /*
       * =======================================================
       * ROBOTS.TXT + SITEMAP DISCOVERY
       * =======================================================
       */

      const robotsData =
        await this.fetchRobotsTxt(
          startUrl,
        );

      /*
       * Sitemap URLs discovered from robots.txt.
       */

      const sitemapUrls =
        [...robotsData.sitemapUrls];

      /*
       * Also try standard sitemap.xml.
       */

      const standardSitemap =
        this.normalizeUrl(
          `${new URL(startUrl).origin}/sitemap.xml`,
        );

      if (
        standardSitemap &&
        !sitemapUrls.includes(
          standardSitemap,
        )
      ) {
        sitemapUrls.push(
          standardSitemap,
        );
      }

      /*
       * =======================================================
       * LOAD SITEMAP URLS (bounded parallel fetch, then
       * sequential processing so discovery order and the
       * MAX_PAGES cap stay deterministic)
       * =======================================================
       */

      const sitemapResults =
        await Promise.all(
          sitemapUrls.map((sitemapUrl) =>
            this.fetchSitemap(
              sitemapUrl,
            ),
          ),
        );

      for (
        const sitemapResult of
        sitemapResults
      ) {
        if (!sitemapResult.exists) {
          continue;
        }

        for (
          const sitemapPageUrl of
          sitemapResult.urls
        ) {
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
                new URL(normalized).hostname,
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
        }
      }

      /*
       * =======================================================
       * CRAWL PAGES (bounded worker pool over the shared
       * FIFO queue; BFS discovery order is preserved on
       * average, dedupe sets and the page cap keep the
       * exact same semantics as the sequential loop)
       * =======================================================
       */

      let pagesCrawled = 0;

      let activeWorkers = 0;

      let crawlFailed = false;

      const enqueueInternalLinks = (
        internalUrls: string[],
      ) => {
        for (
          const link of
          internalUrls
        ) {
          if (
            discovered.size >=
            this.MAX_PAGES
          ) {
            break;
          }

          const normalized =
            this.normalizeUrl(
              link,
            );

          if (!normalized) {
            continue;
          }

          try {
            const linkHost =
              this.normalizeHostname(
                new URL(normalized).hostname,
              );

            if (
              linkHost !==
              websiteHost
            ) {
              continue;
            }
          } catch {
            continue;
          }

          if (
            discovered.has(
              normalized,
            )
          ) {
            continue;
          }

          if (
            processed.has(
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
        }
      };

      /*
       * A single un-fetchable page must never fail
       * the whole crawl. Failed pages are persisted
       * with a PAGE_FETCH_FAILED issue (real
       * evidence: URL + error) and the crawl
       * continues. Only a dead browser — or the
       * absolute crawl timeout — fails the run.
       */
      let pagesFailed = 0;

      const crawlStartedAt =
        Date.now();

      const crawlOneUrl = async (
        currentUrl: string,
      ): Promise<{
        crawlPageUrl: string;
        internalUrls: string[];
      } | null> => {
        let page:
          | Page
          | undefined;

        try {
          page =
            await context.newPage();

          const result =
            await this.crawlSinglePage(
              page,
              currentUrl,
              websiteHost,
              crawl.id,
              {
                organizationId,
                websiteId,
              },
            );

          return {
            crawlPageUrl:
              result.crawlPage.url,

            internalUrls:
              result.internalUrls,
          };
        } catch (error) {
          const browserAlive =
            !!browser &&
            browser.isConnected();

          if (!browserAlive) {
            // eslint-disable-next-line no-console
            console.error(
              `[RENKOO] Crawl ${crawl.id} aborted: browser disconnected during ${currentUrl}`,
            );

            throw error;
          }

          const reason =
            error instanceof
            Error
              ? error.message
              : 'Unknown error';

          // eslint-disable-next-line no-console
          console.error(
            `[RENKOO] Crawl ${crawl.id} page failed (continuing): ${currentUrl} — ${reason}`,
          );

          try {
            const failedPage =
              await this.prisma.crawlPage.create(
                {
                  data: {
                    crawlId:
                      crawl.id,

                    url: currentUrl,
                  },
                },
              );

            await this.prisma.seoIssue.create(
              {
                data: {
                  crawlPageId:
                    failedPage.id,

                  code: 'PAGE_FETCH_FAILED',

                  category:
                    'TECHNICAL',

                  severity:
                    SeoIssueSeverity.HIGH,

                  title:
                    'Page could not be fetched',

                  description:
                    `RENKOO could not load ${currentUrl}: ${reason}`.slice(
                      0,
                      500,
                    ),

                  recommendation:
                    'Check that the URL loads in a browser, fix redirects, DNS or server errors, then run the crawl again. The remaining pages in this crawl were still checked.',

                  status:
                    SeoIssueStatus.OPEN,
                },
              },
            );
          } catch {
            // Failure evidence must never fail the crawl itself.
          }

          pagesFailed++;

          return null;
        } finally {
          if (page) {
            try {
              await page.close();
            } catch {
              // Ignore page close errors.
            }
          }
        }
      };

      const worker = async () => {
        for (;;) {
          if (
            crawlFailed ||
            pagesCrawled >=
              this.MAX_PAGES
          ) {
            return;
          }

          if (
            Date.now() -
              crawlStartedAt >
            this.MAX_CRAWL_TIME_MS
          ) {
            throw new Error(
              `Website crawl timed out after ${Math.round(this.MAX_CRAWL_TIME_MS / 60000)} minutes.`,
            );
          }

          const currentUrl =
            queue.shift();

          if (!currentUrl) {
            if (activeWorkers === 0) {
              return;
            }

            /*
             * Queue is momentarily drained while
             * sibling workers are still producing
             * links — wait, don't exit.
             */

            await new Promise<void>(
              (resolve) =>
                setTimeout(
                  resolve,
                  25,
                ),
            );

            continue;
          }

          if (
            processed.has(
              currentUrl,
            )
          ) {
            continue;
          }

          processed.add(
            currentUrl,
          );

          activeWorkers++;

          try {
            const outcome =
              await crawlOneUrl(
                currentUrl,
              );

            if (!outcome) {
              continue;
            }

            /*
             * Count successfully saved pages.
             */

            if (
              !saved.has(
                outcome.crawlPageUrl,
              )
            ) {
              saved.add(
                outcome.crawlPageUrl,
              );

              pagesCrawled++;
            }

            enqueueInternalLinks(
              outcome.internalUrls,
            );
          } catch (error) {
            crawlFailed = true;

            queue.length = 0;

            throw error;
          } finally {
            activeWorkers--;
          }
        }
      };

      await Promise.all(
        Array.from(
          {
            length:
              this.PAGE_CONCURRENCY,
          },
          () => worker(),
        ),
      );

      /*
       * =======================================================
       * CLOSE CONTEXT
       * =======================================================
       */

      try {
        await context.close();
      } catch {
        // Ignore context close errors.
      }

      /*
       * =======================================================
       * COMPLETE CRAWL
       * =======================================================
       */

      const completedCrawl =
        await this.prisma.crawl.update({
          where: {
            id: crawl.id,
          },
          data: {
            status: 'COMPLETED',
            completedAt:
              new Date(),
          },
        });

      /*
       * =======================================================
       * SUMMARY
       * =======================================================
       */

      const summary =
        await this.getCrawlSummary(
          organizationId,
          crawl.id,
        );

      /*
       * =======================================================
       * MONITORING DETECTION
       *
       * Fire-and-forget: technical SEO alerts are derived from
       * the completed crawl. Detection must never break the
       * crawl response.
       * =======================================================
       */

      void this.monitoringService
        .detectTechnicalSeoAlerts(
          organizationId,
          websiteId,
          crawl.id,
        )
        .catch((detectionError) => {
          // eslint-disable-next-line no-console
          console.error(
            '[RENKOO] Monitoring detection failed for crawl',
            crawl.id,
            detectionError instanceof Error
              ? detectionError.message
              : detectionError,
          );
        });

      return {
        crawl:
          completedCrawl,

        pagesCrawled,

        pagesFailed,

        pagesDiscovered:
          discovered.size,

        summary,
      };
    } catch (error) {
      /*
       * =======================================================
       * FAILED CRAWL
       * =======================================================
       */

      await this.prisma.crawl.update({
        where: {
          id: crawl.id,
        },
        data: {
          status: 'FAILED',
          completedAt:
            new Date(),
        },
      });

      if (
        error instanceof
        BadRequestException
      ) {
        throw error;
      }

      throw new BadRequestException(
        `Website crawl failed: ${
          error instanceof Error
            ? error.message
            : 'Unknown error'
        }`,
      );
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch {
          // Ignore browser close errors.
        }
      }
    }
  }

  /*
   * =========================================================
   * CRAWL SINGLE PAGE
   * =========================================================
   */

  private async crawlSinglePage(
    page: Page,
    url: string,
    websiteHost: string,
    crawlId: string,
    linkCtx: {
      organizationId: string;
      websiteId: string;
    },
  ) {
    const startedAt =
      Date.now();

    /*
     * =======================================================
     * PAGE REQUEST
     * =======================================================
     */

    const response =
      await page.goto(url, {
        waitUntil:
          'domcontentloaded',
        timeout:
          this.PAGE_TIMEOUT,
      });

    if (!response) {
      throw new Error(
        'Unable to load website',
      );
    }

    const loadTimeMs =
      Date.now() - startedAt;

    const statusCode =
      response.status();

    /*
     * =======================================================
     * RESPONSE HEADERS
     * =======================================================
     */

    const responseHeaders =
      await response.allHeaders();

    const contentType =
      responseHeaders[
        'content-type'
      ] ?? null;

    /*
     * =======================================================
     * FINAL URL
     * =======================================================
     */

    const finalUrl =
      this.normalizeUrl(
        page.url(),
      );

    if (!finalUrl) {
      throw new Error(
        'Unable to normalize final URL',
      );
    }

    /*
     * =======================================================
     * HTML
     * =======================================================
     */

    const html =
      await page.content();

    const $ =
      cheerio.load(html);

    /*
     * =======================================================
     * TITLE
     * =======================================================
     */

    const title =
      $('title')
        .first()
        .text()
        .trim() || null;

    /*
     * =======================================================
     * META DESCRIPTION
     * =======================================================
     */

    const metaDescription =
      $(
        'meta[name="description"]',
      )
        .first()
        .attr('content')
        ?.trim() || null;

    /*
     * =======================================================
     * CANONICAL
     * =======================================================
     */

    const canonical =
      $('link[rel="canonical"]')
        .first()
        .attr('href')
        ?.trim() || null;

    /*
     * =======================================================
     * ABSOLUTE CANONICAL
     * =======================================================
     */

    let canonicalAbsolute:
      string | null = null;

    if (canonical) {
      try {
        canonicalAbsolute =
          this.normalizeUrl(
            new URL(
              canonical,
              finalUrl,
            ).toString(),
          ) || null;
      } catch {
        canonicalAbsolute = null;
      }
    }

    /*
     * =======================================================
     * H1
     * =======================================================
     */

    const h1 =
      $('h1')
        .map(
          (_, el) =>
            $(el)
              .text()
              .trim(),
        )
        .get()
        .filter(Boolean);

    /*
     * =======================================================
     * H2
     * =======================================================
     */

    const h2 =
      $('h2')
        .map(
          (_, el) =>
            $(el)
              .text()
              .trim(),
        )
        .get()
        .filter(Boolean);

    /*
     * =======================================================
     * IMAGES
     * =======================================================
     */

    const images =
      $('img').length;

    /*
     * =======================================================
     * IMAGES WITHOUT ALT
     * =======================================================
     */

    const imagesWithoutAlt =
      $('img')
        .filter((_, el) => {
          const alt =
            $(el).attr('alt');

          return (
            !alt ||
            !alt.trim()
          );
        })
        .length;

    /*
     * =======================================================
     * LINKS
     * =======================================================
     */

    /*
     * Phase 2B: collect href + anchor + rel per element.
     * Counting and frontier semantics below are
     * unchanged; edge observations are captured
     * alongside for the persisted link graph.
     */

    const linkNodes =
      $('a')
        .map((_, el) => ({
          href:
            $(el).attr('href') ?? '',
          anchor: cleanAnchorText(
            $(el).text(),
          ),
          rel:
            $(el).attr('rel') ??
            '',
        }))
        .get()
        .filter(
          (node) => !!node.href,
        );

    const internalUrls: string[] =
      [];

    const linkEdges: RawLinkObservation[] =
      [];

    let internalLinks = 0;
    let externalLinks = 0;

    for (
      const node of linkNodes
    ) {
      const href = node.href;
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

        const linkHost =
          this.normalizeHostname(
            new URL(normalized).hostname,
          );

        if (
          linkHost ===
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

            /*
             * Observed edge for the link graph.
             * Self-links (logo/home, fragment-only
             * hrefs resolving to the page itself)
             * stay counted above but are NOT
             * graphed — they carry no pass-through
             * navigational value and would swamp
             * inbound counts with self-references.
             */

            const flags =
              parseLinkRel(
                node.rel,
              );

            linkEdges.push({
              sourceUrl: finalUrl,
              targetUrl: normalized,
              anchorText:
                node.anchor,
              nofollow:
                flags.nofollow,
              sponsored:
                flags.sponsored,
              ugc: flags.ugc,
            });
          }
        } else {
          externalLinks++;
        }
      } catch {
        continue;
      }
    }

    const uniqueInternalUrls =
      Array.from(
        new Set(
          internalUrls,
        ),
      );

    /*
     * =======================================================
     * VISIBLE BODY TEXT
     * =======================================================
     */

    const bodyText =
      $('body')
        .text()
        .replace(/\s+/g, ' ')
        .trim();

    /*
     * =======================================================
     * WORD COUNT
     * =======================================================
     */

    const wordCount =
      bodyText
        ? bodyText
            .split(/\s+/)
            .filter(Boolean)
            .length
        : 0;

    /*
     * =======================================================
     * ROBOTS META
     * =======================================================
     */

    const robots =
      $(
        'meta[name="robots"]',
      )
        .first()
        .attr('content')
        ?.trim() || null;

    const robotsLower =
      robots?.toLowerCase() ?? '';

    const robotsIndexable =
      !robotsLower.includes(
        'noindex',
      );

    const robotsFollow =
      !robotsLower.includes(
        'nofollow',
      );

    /*
     * =======================================================
     * VIEWPORT
     * =======================================================
     */

    const viewport =
      $(
        'meta[name="viewport"]',
      )
        .first()
        .attr('content')
        ?.trim() || null;

    /*
     * =======================================================
     * LANGUAGE
     * =======================================================
     */

    const lang =
      $('html')
        .first()
        .attr('lang')
        ?.trim() || null;

    /*
     * =======================================================
     * CHARSET
     * =======================================================
     */

    let charset:
      string | null = null;

    const charsetMeta =
      $('meta[charset]')
        .first()
        .attr('charset')
        ?.trim();

    if (charsetMeta) {
      charset =
        charsetMeta;
    } else {
      const contentTypeMeta =
        $(
          'meta[http-equiv="Content-Type"]',
        )
          .first()
          .attr('content')
          ?.trim();

      if (contentTypeMeta) {
        const match =
          contentTypeMeta.match(
            /charset\s*=\s*([^\s;]+)/i,
          );

        charset =
          match?.[1] ?? null;
      }
    }

    /*
     * =======================================================
     * OPEN GRAPH
     * =======================================================
     */

    const ogTitle =
      $(
        'meta[property="og:title"]',
      )
        .first()
        .attr('content')
        ?.trim() || null;

    const ogDescription =
      $(
        'meta[property="og:description"]',
      )
        .first()
        .attr('content')
        ?.trim() || null;

    let ogImage =
      $(
        'meta[property="og:image"]',
      )
        .first()
        .attr('content')
        ?.trim() || null;

    if (ogImage) {
      try {
        ogImage =
          new URL(
            ogImage,
            finalUrl,
          ).toString();
      } catch {
        // Keep original value.
      }
    }

    /*
     * =======================================================
     * TWITTER CARD
     * =======================================================
     */

    const twitterCard =
      $(
        'meta[name="twitter:card"]',
      )
        .first()
        .attr('content')
        ?.trim() || null;

    /*
     * =======================================================
     * JSON-LD / STRUCTURED DATA
     * =======================================================
     */

    const jsonLdValues: Prisma.InputJsonValue[] =
      [];

    let invalidJsonLdCount = 0;

    $(
      'script[type="application/ld+json"]',
    ).each((_, el) => {
      const raw =
        $(el)
          .text()
          .trim();

      if (!raw) {
        return;
      }

      try {
        const parsed: unknown =
          JSON.parse(raw);

        if (
          Array.isArray(parsed)
        ) {
          for (
            const item of parsed
          ) {
            try {
              jsonLdValues.push(
                item as Prisma.InputJsonValue,
              );
            } catch {
              invalidJsonLdCount++;
            }
          }
        } else {
          jsonLdValues.push(
            parsed as Prisma.InputJsonValue,
          );
        }
      } catch {
        invalidJsonLdCount++;
      }
    });

    const structuredDataCount =
      jsonLdValues.length;

    /*
     * Prisma JSONB accepts Prisma.JsonNull
     * when there is no JSON-LD.
     */

    const jsonLd:
      | Prisma.InputJsonValue
      | Prisma.NullableJsonNullValueInput =
      jsonLdValues.length > 0
        ? jsonLdValues
        : Prisma.JsonNull;

    /*
     * =======================================================
     * REDIRECT COUNT
     * =======================================================
     */

    let redirectCount = 0;

    try {
      let currentRequest =
        response.request();

      while (true) {
        const redirectedFrom =
          currentRequest.redirectedFrom();

        if (!redirectedFrom) {
          break;
        }

        redirectCount++;

        currentRequest =
          redirectedFrom;
      }
    } catch {
      redirectCount = 0;
    }

    /*
     * =======================================================
     * SAVE CRAWL PAGE
     * =======================================================
     */

    const crawlPage =
      await this.prisma.crawlPage.create({
        data: {
          crawlId,

          url: finalUrl,

          statusCode,

          title,

          metaDescription,

          canonical,

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

          structuredDataCount,

          jsonLd,

          canonicalAbsolute,

          redirectCount,

          finalUrl,

          contentType,

          loadTimeMs,
        },
      });

    /*
     * =======================================================
     * SEO AUDIT
     * =======================================================
     */

    await this.seoAuditService.auditPage(
      crawlPage,
    );

    /*
     * =======================================================
     * LINK GRAPH (Phase 2B)
     * =======================================================
     *
     * Batched per page: one createMany for the page's
     * deduplicated edges — never one insert per link.
     * Edge persistence must never fail the page: audit
     * evidence above already stands on its own.
     */

    try {
      await this.crawlLinkService.persistPageEdges(
        {
          organizationId:
            linkCtx.organizationId,
          websiteId:
            linkCtx.websiteId,
          crawlId,
          sourceUrl: finalUrl,
          edges: linkEdges,
        },
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `[RENKOO] Crawl ${crawlId} link edges skipped for ${finalUrl}: ${
          error instanceof Error
            ? error.message
            : 'Unknown error'
        }`,
      );
    }

    return {
      crawlPage,

      internalUrls:
        uniqueInternalUrls,

      invalidJsonLdCount,
    };
  }

  /*
   * =========================================================
   * ROBOTS.TXT
   * =========================================================
   */

  private async fetchRobotsTxt(
    websiteUrl: string,
  ): Promise<{
    exists: boolean;
    content: string | null;
    sitemapUrls: string[];
  }> {
    try {
      const baseUrl =
        new URL(websiteUrl);

      const robotsUrl =
        `${baseUrl.protocol}//${baseUrl.host}/robots.txt`;

      const response =
        await fetch(
          robotsUrl,
          {
            method: 'GET',
            signal:
              AbortSignal.timeout(
                10000,
              ),
          },
        );

      if (!response.ok) {
        return {
          exists: false,
          content: null,
          sitemapUrls: [],
        };
      }

      const content =
        await response.text();

      const sitemapUrls: string[] =
        [];

      for (
        const line of
        content.split(/\r?\n/)
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

          if (sitemap) {
            sitemapUrls.push(
              sitemap,
            );
          }
        }
      }

      return {
        exists: true,
        content,
        sitemapUrls:
          Array.from(
            new Set(
              sitemapUrls,
            ),
          ),
      };
    } catch {
      return {
        exists: false,
        content: null,
        sitemapUrls: [],
      };
    }
  }

  /*
   * =========================================================
   * SITEMAP
   * =========================================================
   */

  private async fetchSitemap(
    sitemapUrl: string,
  ): Promise<{
    exists: boolean;
    urls: string[];
  }> {
    try {
      const response =
        await fetch(
          sitemapUrl,
          {
            method: 'GET',
            signal:
              AbortSignal.timeout(
                15000,
              ),
          },
        );

      if (!response.ok) {
        return {
          exists: false,
          urls: [],
        };
      }

      const xml =
        await response.text();

      const urls: string[] =
        [];

      const matches =
        xml.matchAll(
          /<loc>\s*([\s\S]*?)\s*<\/loc>/gi,
        );

      for (
        const match of matches
      ) {
        const value =
          match[1]?.trim();

        if (value) {
          urls.push(value);
        }
      }

      return {
        exists: true,
        urls:
          Array.from(
            new Set(urls),
          ),
      };
    } catch {
      return {
        exists: false,
        urls: [],
      };
    }
  }

  /*
   * =========================================================
   * NORMALIZE HOSTNAME
   * =========================================================
   *
   * Treat www.example.com and example.com as the same
   * website for crawl/internal-link detection.
   */

  /*
   * Hostname/URL normalization lives in crawl-links.ts
   * (single source of truth shared with link-graph
   * edges). These wrappers preserve the long-standing
   * call sites and behavior verbatim.
   */
  private normalizeHostname(
    hostname: string,
  ): string {
    return normalizeCrawlHostname(hostname);
  }

  /*
   * =========================================================
   * NORMALIZE URL
   * =========================================================
   *
   * Rules:
   *
   * 1. HTTP/HTTPS only.
   * 2. Remove hash.
   * 3. Remove tracking parameters.
   * 4. Remove remaining query parameters.
   * 5. Remove trailing slash except root.
   * 6. Lowercase hostname.
   * 7. Remove default ports.
   */

  private normalizeUrl(
    input: string,
  ): string {
    return normalizeCrawlUrl(input);
  }

  /*
   * =========================================================
   * GET COMPLETE CRAWL
   * =========================================================
   */

  async getCrawl(
    organizationId: string,
    crawlId: string,
  ) {
    const crawl =
      await this.prisma.crawl.findFirst({
        where: {
          id: crawlId,

          website: {
            organizationId,
          },
        },

        include: {
          website: true,

          pages: {
            include: {
              issues: true,
            },

            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      });

    if (!crawl) {
      throw new BadRequestException(
        'Crawl not found',
      );
    }

    return crawl;
  }

  /*
   * =========================================================
   * GET CRAWL SUMMARY
   * =========================================================
   */

  async getCrawlSummary(
    organizationId: string,
    crawlId: string,
  ) {
    const crawl =
      await this.prisma.crawl.findFirst({
        where: {
          id: crawlId,

          website: {
            organizationId,
          },
        },

        include: {
          website: true,

          pages: {
            include: {
              issues: true,
            },
          },
        },
      });

    if (!crawl) {
      throw new BadRequestException(
        'Crawl not found',
      );
    }

    const issues =
      crawl.pages.flatMap(
        (page) =>
          page.issues,
      );

    /*
     * =======================================================
     * ISSUE COUNTS
     * =======================================================
     */

    const totalIssues =
      issues.length;

    const critical =
      issues.filter(
        (issue) =>
          issue.severity ===
            'CRITICAL' &&
          issue.status ===
            'OPEN',
      ).length;

    const high =
      issues.filter(
        (issue) =>
          issue.severity ===
            'HIGH' &&
          issue.status ===
            'OPEN',
      ).length;

    const medium =
      issues.filter(
        (issue) =>
          issue.severity ===
            'MEDIUM' &&
          issue.status ===
            'OPEN',
      ).length;

    const low =
      issues.filter(
        (issue) =>
          issue.severity ===
            'LOW' &&
          issue.status ===
            'OPEN',
      ).length;

    const open =
      issues.filter(
        (issue) =>
          issue.status ===
          'OPEN',
      ).length;

    const fixed =
      issues.filter(
        (issue) =>
          issue.status ===
          'FIXED',
      ).length;

    const ignored =
      issues.filter(
        (issue) =>
          issue.status ===
          'IGNORED',
      ).length;

    /*
     * =======================================================
     * PRODUCTION SEO HEALTH SCORE
     * =======================================================
     *
     * Only OPEN issues affect the score.
     *
     * CRITICAL -> 35
     * HIGH     -> 25
     * MEDIUM   -> 20
     * LOW      -> 10
     *
     * Impact is normalized against page count so that
     * repeated issues don't immediately destroy the score.
     */

    const pageCount =
      Math.max(
        crawl.pages.length,
        1,
      );

    const normalizedImpact = (
      issueCount: number,
    ): number => {
      return (
        issueCount /
        (issueCount + pageCount)
      );
    };

    const criticalImpact =
      normalizedImpact(
        critical,
      ) * 35;

    const highImpact =
      normalizedImpact(
        high,
      ) * 25;

    const mediumImpact =
      normalizedImpact(
        medium,
      ) * 20;

    const lowImpact =
      normalizedImpact(
        low,
      ) * 10;

    const penalty =
      criticalImpact +
      highImpact +
      mediumImpact +
      lowImpact;

    const score =
      Math.round(
        Math.max(
          0,
          Math.min(
            100,
            100 - penalty,
          ),
        ),
      );

    /*
     * =======================================================
     * RESULT
     * =======================================================
     */

    return {
      crawlId:
        crawl.id,

      websiteId:
        crawl.websiteId,

      website:
        crawl.website,

      score,

      pages:
        crawl.pages.length,

      totalIssues,

      critical,

      high,

      medium,

      low,

      open,

      resolved:
        fixed,

      ignored,

      fixed,
    };
  }
  /*
   * =========================================================
   * GET LATEST VALID COMPLETED CRAWL SUMMARY
   * =========================================================
   */

  async getLatestCrawlSummary(
    organizationId: string,
    websiteId: string,
  ) {
    const crawl =
      await this.prisma.crawl.findFirst({
        where: {
          websiteId,

          website: {
            organizationId,
          },

          status: 'COMPLETED',

          pages: {
            some: {},
          },
        },

        orderBy: {
          createdAt: 'desc',
        },

        select: {
          id: true,
        },
      });

    if (!crawl) {
      throw new BadRequestException(
        'No valid completed crawl found for this website',
      );
    }

    return this.getCrawlSummary(
      organizationId,
      crawl.id,
    );
  }

}

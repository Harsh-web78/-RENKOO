import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  MAX_EDGES_PER_PAGE,
  anchorKeyOf,
  dedupeLinkEdges,
  type RawLinkObservation,
} from './crawl-links';

/*
 * =========================================================
 * CRAWL LINK GRAPH 6.0 Phase 2B — persistence + factual
 * reads over observed internal links.
 *
 * Writes: one createMany per crawled page (never one
 * insert per link), skipDuplicates against the
 * (crawlId, sourceUrl, targetUrl, anchorKey, rel-flags)
 * unique key. In-memory page dedupe keeps batches small;
 * MAX_EDGES_PER_PAGE bounds pathological pages.
 *
 * Reads: outbound / inbound / single edge / orphan
 * candidates within one crawl snapshot. Every read is
 * scoped (organizationId, websiteId) and verified
 * against website ownership — never websiteId alone.
 *
 * Orphan honesty: zero inbound in the graph is an
 * OBSERVED fact about crawl coverage, not an SEO
 * verdict. Sitemap-only pages, redirects, noindex and
 * canonicalized pages need exclusion in a later phase;
 * this query returns candidates, never labels.
 * =========================================================
 */

export interface PageEdgeBatch {
  organizationId: string;
  websiteId: string;
  crawlId: string;
  sourceUrl: string;
  edges: RawLinkObservation[];
}

@Injectable()
export class CrawlLinkService {
  private readonly logger = new Logger(
    CrawlLinkService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private async verifyWebsite(
    organizationId: string,
    websiteId: string,
  ) {
    const website =
      await this.prisma.website.findFirst({
        where: {
          id: websiteId,
          organizationId,
        },
        select: { id: true },
      });
    if (!website) {
      throw new NotFoundException(
        'Website not found',
      );
    }
    return website;
  }

  /*
   * Persist one page's deduplicated edges. Returns the
   * number of distinct edges written (0 when the page
   * had none). Never throws for oversized input —
   * truncates to MAX_EDGES_PER_PAGE and logs.
   */
  async persistPageEdges(
    batch: PageEdgeBatch,
  ): Promise<{ written: number; truncated: boolean }> {
    const deduped = dedupeLinkEdges(batch.edges);
    const truncated =
      deduped.length > MAX_EDGES_PER_PAGE;
    const rows = deduped
      .slice(0, MAX_EDGES_PER_PAGE)
      .map((edge) => ({
        organizationId: batch.organizationId,
        websiteId: batch.websiteId,
        crawlId: batch.crawlId,
        sourceUrl: edge.sourceUrl,
        targetUrl: edge.targetUrl,
        anchorText: edge.anchorText,
        anchorKey: anchorKeyOf(edge.anchorText),
        linkType: 'INTERNAL',
        isInternal: true,
        nofollow: edge.nofollow,
        sponsored: edge.sponsored,
        ugc: edge.ugc,
        occurrenceCount: edge.occurrenceCount,
      }));
    if (rows.length === 0) {
      return { written: 0, truncated: false };
    }
    if (truncated) {
      this.logger.warn(
        `CrawlLink batch truncated for ${batch.sourceUrl} in crawl ${batch.crawlId} (${deduped.length} distinct edges).`,
      );
    }
    await this.prisma.crawlLink.createMany({
      data: rows,
      skipDuplicates: true,
    });
    return { written: rows.length, truncated };
  }

  async getOutboundEdges(
    organizationId: string,
    websiteId: string,
    crawlId: string,
    sourceUrl: string,
  ) {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    return this.prisma.crawlLink.findMany({
      where: {
        organizationId,
        websiteId,
        crawlId,
        sourceUrl,
      },
      orderBy: { targetUrl: 'asc' },
      take: 500,
    });
  }

  async getInboundEdges(
    organizationId: string,
    websiteId: string,
    crawlId: string,
    targetUrl: string,
  ) {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    return this.prisma.crawlLink.findMany({
      where: {
        organizationId,
        websiteId,
        crawlId,
        targetUrl,
      },
      orderBy: { sourceUrl: 'asc' },
      take: 500,
    });
  }

  async countInbound(
    organizationId: string,
    websiteId: string,
    crawlId: string,
    targetUrl: string,
  ): Promise<number> {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    return this.prisma.crawlLink.count({
      where: {
        organizationId,
        websiteId,
        crawlId,
        targetUrl,
      },
    });
  }

  /*
   * Orphan candidates: successfully crawled pages (have a
   * CrawlPage row with 2xx status) with zero inbound
   * CrawlLink rows in the same crawl. Factual coverage
   * signal only — NOT an "SEO orphan" verdict.
   */
  async getOrphanCandidates(
    organizationId: string,
    websiteId: string,
    crawlId: string,
  ): Promise<
    Array<{
      url: string;
      title: string | null;
      statusCode: number | null;
      robotsIndexable: boolean | null;
      canonical: string | null;
      canonicalAbsolute: string | null;
      redirectCount: number | null;
      finalUrl: string | null;
    }>
  > {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    const [pages, inbound] = await Promise.all([
      this.prisma.crawlPage.findMany({
        where: {
          crawlId,
          statusCode: { gte: 200, lt: 300 },
        },
        select: {
          url: true,
          title: true,
          statusCode: true,
          robotsIndexable: true,
          canonical: true,
          canonicalAbsolute: true,
          redirectCount: true,
          finalUrl: true,
        },
        take: 2000,
      }),
      this.prisma.crawlLink.findMany({
        where: {
          organizationId,
          websiteId,
          crawlId,
        },
        select: { targetUrl: true },
        take: 20000,
      }),
    ]);
    const linked = new Set(
      inbound.map((row) => row.targetUrl),
    );
    return pages
      .filter((page) => !linked.has(page.url))
      .map((page) => ({
        url: page.url,
        title: page.title,
        statusCode: page.statusCode,
        robotsIndexable: page.robotsIndexable,
        canonical: page.canonical,
        canonicalAbsolute: page.canonicalAbsolute,
        redirectCount: page.redirectCount,
        finalUrl: page.finalUrl,
      }));
  }

  async latestCrawlId(
    organizationId: string,
    websiteId: string,
  ): Promise<string | null> {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    const crawl = await this.prisma.crawl.findFirst({
      where: { websiteId, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      select: { id: true },
    });
    return crawl?.id ?? null;
  }

  // =======================================================
  // PHASE 2C — batched factual reads for verification.
  // Only COMPLETED crawls are authoritative. RUNNING /
  // FAILED crawls never verify anything (callers treat
  // their absence as UNAVAILABLE, never fall back
  // silently). All reads stay tenant-scoped.
  // =======================================================

  async latestCompletedCrawl(
    organizationId: string,
    websiteId: string,
  ): Promise<{
    id: string;
    completedAt: Date | null;
    status: string;
  } | null> {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    const crawl = await this.prisma.crawl.findFirst({
      where: { websiteId, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      select: {
        id: true,
        completedAt: true,
        status: true,
      },
    });
    return crawl;
  }

  async recentCompletedCrawls(
    organizationId: string,
    websiteId: string,
    take = 5,
  ): Promise<
    Array<{
      id: string;
      completedAt: Date | null;
      status: string;
    }>
  > {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    return this.prisma.crawl.findMany({
      where: { websiteId, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      select: {
        id: true,
        completedAt: true,
        status: true,
      },
      take: Math.min(Math.max(take, 1), 10),
    });
  }

  /*
   * Batch page facts for BROKEN/eligibility checks.
   * Keyed by normalized URL; unmatched inputs are
   * absent from the map (caller decides: missing page
   * facts mean the graph cannot resolve the URL).
   */
  async getPageFacts(
    organizationId: string,
    websiteId: string,
    crawlId: string,
    urls: string[],
  ): Promise<
    Map<
      string,
      {
        url: string;
        statusCode: number | null;
        robotsIndexable: boolean | null;
        canonical: string | null;
        canonicalAbsolute: string | null;
        redirectCount: number | null;
        finalUrl: string | null;
      }
    >
  > {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    const out = new Map<
      string,
      {
        url: string;
        statusCode: number | null;
        robotsIndexable: boolean | null;
        canonical: string | null;
        canonicalAbsolute: string | null;
        redirectCount: number | null;
        finalUrl: string | null;
      }
    >();
    const wanted = [
      ...new Set(
        urls
          .map((u) =>
            String(u ?? '')
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
    ];
    if (wanted.length === 0) return out;
    const pages = await this.prisma.crawlPage.findMany({
      where: { crawlId },
      select: {
        url: true,
        statusCode: true,
        robotsIndexable: true,
        canonical: true,
        canonicalAbsolute: true,
        redirectCount: true,
        finalUrl: true,
      },
      take: 5000,
    });
    const byNorm = new Map<string, (typeof pages)[number]>();
    for (const page of pages) {
      byNorm.set(
        String(page.url ?? '')
          .trim()
          .toLowerCase(),
        page,
      );
    }
    for (const url of wanted) {
      const page = byNorm.get(url);
      if (page) out.set(url, { ...page });
    }
    return out;
  }

  /*
   * Batch edge presence for pairs. Returns matching
   * rows (self-edges excluded: a page linking to
   * itself never verifies a recommendation).
   */
  async getEdgesForPairs(
    organizationId: string,
    websiteId: string,
    crawlId: string,
    pairs: Array<{
      sourceUrl: string;
      targetUrl: string;
    }>,
  ) {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    const sources = [
      ...new Set(
        pairs
          .map((p) => p.sourceUrl)
          .filter(Boolean),
      ),
    ];
    const targets = [
      ...new Set(
        pairs
          .map((p) => p.targetUrl)
          .filter(Boolean),
      ),
    ];
    if (
      sources.length === 0 ||
      targets.length === 0
    ) {
      return [];
    }
    const rows = await this.prisma.crawlLink.findMany({
      where: {
        organizationId,
        websiteId,
        crawlId,
        sourceUrl: { in: sources },
        targetUrl: { in: targets },
      },
      take: 5000,
    });
    return rows.filter(
      (row) =>
        String(row.sourceUrl ?? '')
          .trim()
          .toLowerCase() !==
        String(row.targetUrl ?? '')
          .trim()
          .toLowerCase(),
    );
  }

  /*
   * Distinct edge counts per source page (truncation
   * guard: a source at MAX_EDGES_PER_PAGE may have
   * unpersisted edges, so negative verification for
   * that source is unsafe).
   */
  async countDistinctEdgesBySource(
    organizationId: string,
    websiteId: string,
    crawlId: string,
    sourceUrls: string[],
  ): Promise<Map<string, number>> {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    const wanted = [
      ...new Set(
        sourceUrls.filter(Boolean),
      ),
    ];
    const out = new Map<string, number>();
    if (wanted.length === 0) return out;
    const rows = await this.prisma.crawlLink.findMany({
      where: {
        organizationId,
        websiteId,
        crawlId,
        sourceUrl: { in: wanted },
      },
      select: {
        sourceUrl: true,
        targetUrl: true,
        anchorKey: true,
        nofollow: true,
        sponsored: true,
        ugc: true,
      },
      take: 20000,
    });
    const seen = new Map<string, Set<string>>();
    for (const row of rows) {
      const key = [
        row.targetUrl,
        row.anchorKey,
        row.nofollow ? 'nf' : '',
        row.sponsored ? 'sp' : '',
        row.ugc ? 'ugc' : '',
      ].join('|');
      let set = seen.get(row.sourceUrl);
      if (!set) {
        set = new Set();
        seen.set(row.sourceUrl, set);
      }
      set.add(key);
    }
    for (const [source, set] of seen) {
      out.set(source, set.size);
    }
    return out;
  }
}

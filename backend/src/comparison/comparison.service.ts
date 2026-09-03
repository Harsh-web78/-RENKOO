import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

type ComparisonStatus =
  | 'STRONGER'
  | 'WEAKER'
  | 'EQUAL';

interface MetricComparison {
  metric: string;
  renkoo: number;
  competitor: number;
  gap: number;
  winner: 'RENKOO' | 'COMPETITOR' | 'EQUAL';
}

interface PageGap {
  url: string;
  renkoo: {
    exists: boolean;
    title: string | null;
    metaDescription: string | null;
    h1Count: number;
    wordCount: number;
    images: number;
    imagesWithoutAlt: number;
    internalLinks: number;
    loadTimeMs: number | null;
    structuredDataCount: number;
  };
  competitor: {
    exists: boolean;
    title: string | null;
    metaDescription: string | null;
    h1Count: number;
    wordCount: number;
    images: number;
    imagesWithoutAlt: number;
    internalLinks: number;
    loadTimeMs: number | null;
    structuredDataCount: number;
  };
  gaps: string[];
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

@Injectable()
export class ComparisonService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  // =========================================================
  // MAIN COMPARISON
  // =========================================================

  async compare(
    organizationId: string,
    competitorId: string,
  ) {
    const competitor =
      await this.prisma.competitor.findFirst({
        where: {
          id: competitorId,
          organizationId,
        },
        include: {
          website: true,
        },
      });

    if (!competitor) {
      throw new NotFoundException(
        'Competitor not found',
      );
    }

    // -------------------------------------------------------
    // Latest RENKOO crawl
    // -------------------------------------------------------

    const renkooCrawl =
      await this.prisma.crawl.findFirst({
        where: {
          websiteId:
            competitor.websiteId,
          status: 'COMPLETED',
          website: {
            organizationId,
          },
          pages: {
            some: {},
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          pages: true,
        },
      });

    if (!renkooCrawl) {
      throw new BadRequestException(
        'No completed RENKOO crawl found. Run a website crawl first.',
      );
    }

    // -------------------------------------------------------
    // Latest competitor crawl
    // -------------------------------------------------------

    const competitorCrawl =
      await this.prisma.competitorCrawl.findFirst({
        where: {
          competitorId,
          status: 'COMPLETED',
        },
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          pages: true,
        },
      });

    if (!competitorCrawl) {
      throw new BadRequestException(
        'No completed competitor crawl found. Crawl the competitor first.',
      );
    }

    const renkooPages =
      renkooCrawl.pages ?? [];

    const competitorPages =
      competitorCrawl.pages ?? [];

    // -------------------------------------------------------
    // Aggregate metrics
    // -------------------------------------------------------

    const renkooMetrics =
      this.calculateMetrics(
        renkooPages,
      );

    const competitorMetrics =
      this.calculateMetrics(
        competitorPages,
      );

    const metrics =
      this.compareMetrics(
        renkooMetrics,
        competitorMetrics,
      );

    // -------------------------------------------------------
    // Page matching
    // -------------------------------------------------------

    const pageGaps =
      this.buildPageGaps(
        renkooPages,
        competitorPages,
      );

    // -------------------------------------------------------
    // Overall winner
    // -------------------------------------------------------

    const renkooWins =
      metrics.filter(
        (metric) =>
          metric.winner === 'RENKOO',
      ).length;

    const competitorWins =
      metrics.filter(
        (metric) =>
          metric.winner === 'COMPETITOR',
      ).length;

    const overallStatus =
      this.getOverallStatus(
        renkooWins,
        competitorWins,
      );

    // -------------------------------------------------------
    // Opportunities
    // -------------------------------------------------------

    const opportunities =
      this.buildOpportunities(
        metrics,
        pageGaps,
      );

    return {
      comparison: {
        status: overallStatus,

        renkoo: {
          websiteId:
            competitor.websiteId,

          websiteName:
            competitor.website.name,

          websiteUrl:
            competitor.website.url,

          crawlId:
            renkooCrawl.id,

          crawlDate:
            renkooCrawl.createdAt,

          pages:
            renkooPages.length,
        },

        competitor: {
          id:
            competitor.id,

          name:
            competitor.name,

          url:
            competitor.url,

          domain:
            competitor.domain,

          crawlId:
            competitorCrawl.id,

          crawlDate:
            competitorCrawl.createdAt,

          pages:
            competitorPages.length,
        },
      },

      metrics,

      pageGaps,

      opportunities,

      summary: {
        totalMetrics:
          metrics.length,

        renkooWins,

        competitorWins,

        equal:
          metrics.length -
          renkooWins -
          competitorWins,

        totalPageGaps:
          pageGaps.length,

        highPriority:
          opportunities.filter(
            (item) =>
              item.priority ===
              'HIGH',
          ).length,

        mediumPriority:
          opportunities.filter(
            (item) =>
              item.priority ===
              'MEDIUM',
          ).length,

        lowPriority:
          opportunities.filter(
            (item) =>
              item.priority ===
              'LOW',
          ).length,
      },
    };
  }

  // =========================================================
  // METRICS
  // =========================================================

  private calculateMetrics(
    pages: any[],
  ) {
    const total =
      Math.max(pages.length, 1);

    const pagesWithTitle =
      pages.filter(
        (page) =>
          !!page.title?.trim(),
      ).length;

    const pagesWithMeta =
      pages.filter(
        (page) =>
          !!page.metaDescription?.trim(),
      ).length;

    const pagesWithH1 =
      pages.filter(
        (page) =>
          Array.isArray(page.h1)
            ? page.h1.length > 0
            : !!page.h1,
      ).length;

    const pagesWithCanonical =
      pages.filter(
        (page) =>
          !!page.canonical?.trim(),
      ).length;

    const pagesWithStructuredData =
      pages.filter(
        (page) =>
          Number(
            page.structuredDataCount ??
              0,
          ) > 0,
      ).length;

    const pagesWithAltProblems =
      pages.filter(
        (page) =>
          Number(
            page.imagesWithoutAlt ??
              0,
          ) > 0,
      ).length;

    const pagesWithThinContent =
      pages.filter(
        (page) =>
          Number(
            page.wordCount ?? 0,
          ) < 300,
      ).length;

    const pagesWithSlowLoad =
      pages.filter(
        (page) =>
          Number(
            page.loadTimeMs ?? 0,
          ) > 3000,
      ).length;

    const averageWordCount =
      this.average(
        pages.map(
          (page) =>
            Number(
              page.wordCount ?? 0,
            ),
        ),
      );

    const averageInternalLinks =
      this.average(
        pages.map(
          (page) =>
            Number(
              page.internalLinks ?? 0,
            ),
        ),
      );

    const averageLoadTime =
      this.average(
        pages.map(
          (page) =>
            Number(
              page.loadTimeMs ?? 0,
            ),
        ),
      );

    return {
      pages: pages.length,

      titleCoverage:
        this.percentage(
          pagesWithTitle,
          total,
        ),

      metaCoverage:
        this.percentage(
          pagesWithMeta,
          total,
        ),

      h1Coverage:
        this.percentage(
          pagesWithH1,
          total,
        ),

      canonicalCoverage:
        this.percentage(
          pagesWithCanonical,
          total,
        ),

      structuredDataCoverage:
        this.percentage(
          pagesWithStructuredData,
          total,
        ),

      altProblemRate:
        this.percentage(
          pagesWithAltProblems,
          total,
        ),

      thinContentRate:
        this.percentage(
          pagesWithThinContent,
          total,
        ),

      slowPageRate:
        this.percentage(
          pagesWithSlowLoad,
          total,
        ),

      averageWordCount,
      averageInternalLinks,
      averageLoadTime,
    };
  }

  // =========================================================
  // METRIC COMPARISON
  // =========================================================

  private compareMetrics(
    renkoo: any,
    competitor: any,
  ): MetricComparison[] {
    return [
      this.metric(
        'Title Coverage',
        renkoo.titleCoverage,
        competitor.titleCoverage,
        true,
      ),

      this.metric(
        'Meta Description Coverage',
        renkoo.metaCoverage,
        competitor.metaCoverage,
        true,
      ),

      this.metric(
        'H1 Coverage',
        renkoo.h1Coverage,
        competitor.h1Coverage,
        true,
      ),

      this.metric(
        'Canonical Coverage',
        renkoo.canonicalCoverage,
        competitor.canonicalCoverage,
        true,
      ),

      this.metric(
        'Structured Data Coverage',
        renkoo.structuredDataCoverage,
        competitor.structuredDataCoverage,
        true,
      ),

      this.metric(
        'Average Word Count',
        renkoo.averageWordCount,
        competitor.averageWordCount,
        true,
      ),

      this.metric(
        'Average Internal Links',
        renkoo.averageInternalLinks,
        competitor.averageInternalLinks,
        true,
      ),

      // Lower is better.
      this.metric(
        'Pages With Alt Problems',
        renkoo.altProblemRate,
        competitor.altProblemRate,
        false,
      ),

      // Lower is better.
      this.metric(
        'Thin Content Rate',
        renkoo.thinContentRate,
        competitor.thinContentRate,
        false,
      ),

      // Lower is better.
      this.metric(
        'Slow Page Rate',
        renkoo.slowPageRate,
        competitor.slowPageRate,
        false,
      ),

      // Lower is not necessarily better.
      // This metric is informational.
      this.metric(
        'Pages Crawled',
        renkoo.pages,
        competitor.pages,
        true,
      ),
    ];
  }

  private metric(
    metric: string,
    renkoo: number,
    competitor: number,
    higherIsBetter: boolean,
  ): MetricComparison {
    const gap =
      Number(
        (
          competitor -
          renkoo
        ).toFixed(2),
      );

    let winner:
      | 'RENKOO'
      | 'COMPETITOR'
      | 'EQUAL' =
      'EQUAL';

    if (higherIsBetter) {
      if (renkoo > competitor) {
        winner = 'RENKOO';
      } else if (
        competitor > renkoo
      ) {
        winner = 'COMPETITOR';
      }
    } else {
      if (renkoo < competitor) {
        winner = 'RENKOO';
      } else if (
        competitor < renkoo
      ) {
        winner = 'COMPETITOR';
      }
    }

    return {
      metric,
      renkoo: Number(
        renkoo.toFixed(2),
      ),
      competitor: Number(
        competitor.toFixed(2),
      ),
      gap,
      winner,
    };
  }

  // =========================================================
  // PAGE GAPS
  // =========================================================

  private buildPageGaps(
    renkooPages: any[],
    competitorPages: any[],
  ): PageGap[] {
    const renkooMap =
      new Map<string, any>();

    const competitorMap =
      new Map<string, any>();

    for (const page of renkooPages) {
      const key =
        this.pageKey(page.url);

      if (key) {
        renkooMap.set(
          key,
          page,
        );
      }
    }

    for (const page of competitorPages) {
      const key =
        this.pageKey(page.url);

      if (key) {
        competitorMap.set(
          key,
          page,
        );
      }
    }

    const keys =
      new Set<string>([
        ...renkooMap.keys(),
        ...competitorMap.keys(),
      ]);

    const result: PageGap[] = [];

    for (const key of keys) {
      const renkoo =
        renkooMap.get(key);

      const competitor =
        competitorMap.get(key);

      const gaps: string[] = [];

      if (
        !renkoo &&
        competitor
      ) {
        gaps.push(
          'Competitor has a page that RENKOO did not crawl.',
        );

        result.push({
          url:
            competitor.url,

          renkoo:
            this.emptyPageData(),

          competitor:
            this.pageData(
              competitor,
            ),

          gaps,

          priority: 'HIGH',
        });

        continue;
      }

      if (
        renkoo &&
        !competitor
      ) {
        gaps.push(
          'RENKOO has a page that the competitor did not crawl.',
        );

        result.push({
          url:
            renkoo.url,

          renkoo:
            this.pageData(renkoo),

          competitor:
            this.emptyPageData(),

          gaps,

          priority: 'LOW',
        });

        continue;
      }

      if (!renkoo || !competitor) {
        continue;
      }

      // Title
      if (
        !renkoo.title &&
        competitor.title
      ) {
        gaps.push(
          'Competitor has a title while RENKOO is missing one.',
        );
      }

      // Meta
      if (
        !renkoo.metaDescription &&
        competitor.metaDescription
      ) {
        gaps.push(
          'Competitor has a meta description while RENKOO is missing one.',
        );
      }

      // H1
      const renkooH1 =
        Array.isArray(renkoo.h1)
          ? renkoo.h1.length
          : Number(
              renkoo.h1 ?? 0,
            );

      const competitorH1 =
        Array.isArray(
          competitor.h1,
        )
          ? competitor.h1.length
          : Number(
              competitor.h1 ?? 0,
            );

      if (
        renkooH1 === 0 &&
        competitorH1 > 0
      ) {
        gaps.push(
          'Competitor has an H1 while RENKOO is missing one.',
        );
      }

      // Content
      const renkooWords =
        Number(
          renkoo.wordCount ?? 0,
        );

      const competitorWords =
        Number(
          competitor.wordCount ?? 0,
        );

      if (
        competitorWords >
        renkooWords * 1.2
      ) {
        gaps.push(
          `Competitor has significantly more content (${competitorWords} vs ${renkooWords} words).`,
        );
      }

      // Internal links
      const renkooLinks =
        Number(
          renkoo.internalLinks ??
            0,
        );

      const competitorLinks =
        Number(
          competitor.internalLinks ??
            0,
        );

      if (
        competitorLinks >
        renkooLinks * 1.25
      ) {
        gaps.push(
          `Competitor has stronger internal linking (${competitorLinks} vs ${renkooLinks}).`,
        );
      }

      // Images / alt
      const renkooAlt =
        Number(
          renkoo.imagesWithoutAlt ??
            0,
        );

      const competitorAlt =
        Number(
          competitor.imagesWithoutAlt ??
            0,
        );

      if (
        renkooAlt >
          competitorAlt &&
        renkooAlt > 0
      ) {
        gaps.push(
          `RENKOO has more images without alt text (${renkooAlt} vs ${competitorAlt}).`,
        );
      }

      // Structured data
      const renkooSchema =
        Number(
          renkoo.structuredDataCount ??
            0,
        );

      const competitorSchema =
        Number(
          competitor.structuredDataCount ??
            0,
        );

      if (
        competitorSchema >
        renkooSchema
      ) {
        gaps.push(
          `Competitor has more structured data (${competitorSchema} vs ${renkooSchema}).`,
        );
      }

      // Performance
      const renkooLoad =
        Number(
          renkoo.loadTimeMs ?? 0,
        );

      const competitorLoad =
        Number(
          competitor.loadTimeMs ??
            0,
        );

      if (
        renkooLoad >
          competitorLoad * 1.25 &&
        renkooLoad > 3000
      ) {
        gaps.push(
          `RENKOO page is slower (${renkooLoad}ms vs ${competitorLoad}ms).`,
        );
      }

      if (gaps.length > 0) {
        result.push({
          url: renkoo.url,

          renkoo:
            this.pageData(renkoo),

          competitor:
            this.pageData(
              competitor,
            ),

          gaps,

          priority:
            this.getPagePriority(
              gaps,
            ),
        });
      }
    }

    return result.sort(
      (a, b) =>
        this.priorityValue(
          b.priority,
        ) -
        this.priorityValue(
          a.priority,
        ),
    );
  }

  // =========================================================
  // OPPORTUNITIES
  // =========================================================

  private buildOpportunities(
    metrics: MetricComparison[],
    pageGaps: PageGap[],
  ) {
    const opportunities: Array<{
      type: string;
      title: string;
      description: string;
      priority:
        | 'HIGH'
        | 'MEDIUM'
        | 'LOW';
      metric?: string;
      gap?: number;
      affectedPages?: number;
    }> = [];

    for (const metric of metrics) {
      if (
        metric.winner !==
        'COMPETITOR'
      ) {
        continue;
      }

      const absoluteGap =
        Math.abs(metric.gap);

      let priority:
        | 'HIGH'
        | 'MEDIUM'
        | 'LOW' =
        'LOW';

      if (
        absoluteGap >= 30
      ) {
        priority = 'HIGH';
      } else if (
        absoluteGap >= 15
      ) {
        priority = 'MEDIUM';
      }

      opportunities.push({
        type: 'METRIC_GAP',

        title:
          `Improve ${metric.metric}`,

        description:
          `Competitor is stronger on ${metric.metric} by ${absoluteGap.toFixed(1)} points.`,

        priority,

        metric:
          metric.metric,

        gap:
          absoluteGap,
      });
    }

    for (const page of pageGaps) {
      if (
        page.gaps.length === 0
      ) {
        continue;
      }

      opportunities.push({
        type: 'PAGE_GAP',

        title:
          `Improve ${page.url}`,

        description:
          page.gaps.join(' '),

        priority:
          page.priority,

        affectedPages: 1,
      });
    }

    return opportunities.sort(
      (a, b) =>
        this.priorityValue(
          b.priority,
        ) -
        this.priorityValue(
          a.priority,
        ),
    );
  }

  // =========================================================
  // PAGE DATA
  // =========================================================

  private pageData(
    page: any,
  ) {
    const h1Count =
      Array.isArray(page.h1)
        ? page.h1.length
        : Number(
            page.h1 ?? 0,
          );

    return {
      exists: true,

      title:
        page.title ?? null,

      metaDescription:
        page.metaDescription ??
        null,

      h1Count,

      wordCount:
        Number(
          page.wordCount ?? 0,
        ),

      images:
        Number(
          page.images ?? 0,
        ),

      imagesWithoutAlt:
        Number(
          page.imagesWithoutAlt ??
            0,
        ),

      internalLinks:
        Number(
          page.internalLinks ??
            0,
        ),

      loadTimeMs:
        page.loadTimeMs == null
          ? null
          : Number(
              page.loadTimeMs,
            ),

      structuredDataCount:
        Number(
          page.structuredDataCount ??
            0,
        ),
    };
  }

  private emptyPageData() {
    return {
      exists: false,
      title: null,
      metaDescription: null,
      h1Count: 0,
      wordCount: 0,
      images: 0,
      imagesWithoutAlt: 0,
      internalLinks: 0,
      loadTimeMs: null,
      structuredDataCount: 0,
    };
  }

  // =========================================================
  // HELPERS
  // =========================================================

  private pageKey(
    url: string,
  ): string {
    try {
      const parsed =
        new URL(url);

      return (
        parsed.pathname
          .replace(
            /\/+$/,
            '',
          )
          .toLowerCase() ||
        '/'
      );
    } catch {
      return url
        .replace(
          /\/+$/,
          '',
        )
        .toLowerCase();
    }
  }

  private percentage(
    value: number,
    total: number,
  ): number {
    if (total <= 0) {
      return 0;
    }

    return Number(
      (
        (value / total) *
        100
      ).toFixed(1),
    );
  }

  private average(
    values: number[],
  ): number {
    if (
      values.length === 0
    ) {
      return 0;
    }

    return Number(
      (
        values.reduce(
          (sum, value) =>
            sum + value,
          0,
        ) /
        values.length
      ).toFixed(1),
    );
  }

  private getOverallStatus(
    renkooWins: number,
    competitorWins: number,
  ): ComparisonStatus {
    if (
      renkooWins >
      competitorWins
    ) {
      return 'STRONGER';
    }

    if (
      competitorWins >
      renkooWins
    ) {
      return 'WEAKER';
    }

    return 'EQUAL';
  }

  private getPagePriority(
    gaps: string[],
  ):
    | 'HIGH'
    | 'MEDIUM'
    | 'LOW' {
    if (gaps.length >= 3) {
      return 'HIGH';
    }

    if (gaps.length === 2) {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  private priorityValue(
    priority:
      | 'HIGH'
      | 'MEDIUM'
      | 'LOW',
  ): number {
    if (priority === 'HIGH') {
      return 3;
    }

    if (
      priority === 'MEDIUM'
    ) {
      return 2;
    }

    return 1;
  }
}
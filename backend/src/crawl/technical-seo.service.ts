import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';

import { SeoIssueSeverity } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

type TechnicalCategory =
  | 'CRAWLABILITY'
  | 'INDEXABILITY'
  | 'METADATA'
  | 'CANONICAL'
  | 'PERFORMANCE'
  | 'ACCESSIBILITY'
  | 'STRUCTURED_DATA'
  | 'LINKS'
  | 'CONTENT'
  | 'OTHER';

@Injectable()
export class TechnicalSeoService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /*
   * =========================================================
   * LATEST TECHNICAL SEO REPORT
   * =========================================================
   */

  async getLatest(
    organizationId: string,
    websiteId: string,
  ) {
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
        'No valid completed crawl found. Run a website crawl first.',
      );
    }

    return this.buildReport(crawl);
  }

  /*
   * =========================================================
   * SPECIFIC CRAWL
   * =========================================================
   */

  async getByCrawl(
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

    return this.buildReport(crawl);
  }

  /*
   * =========================================================
   * REPORT BUILDER
   * =========================================================
   */

  private buildReport(crawl: any) {
    const pages = crawl.pages ?? [];

    const allIssues = pages.flatMap(
      (page: any) =>
        (page.issues ?? []).map(
          (issue: any) => ({
            ...issue,
            page: {
              id: page.id,
              url: page.url,
              statusCode:
                page.statusCode,
              title:
                page.title,
              metaDescription:
                page.metaDescription,
              canonical:
                page.canonical,
              loadTimeMs:
                page.loadTimeMs,
            },
          }),
        ),
    );

    const openIssues =
      allIssues.filter(
        (issue: any) =>
          issue.status === 'OPEN',
      );

    const fixedIssues =
      allIssues.filter(
        (issue: any) =>
          issue.status === 'FIXED',
      );

    const ignoredIssues =
      allIssues.filter(
        (issue: any) =>
          issue.status === 'IGNORED',
      );

    /*
     * =======================================================
     * SEVERITY COUNTS
     * =======================================================
     */

    const critical =
      openIssues.filter(
        (issue: any) =>
          issue.severity ===
          SeoIssueSeverity.CRITICAL,
      ).length;

    const high =
      openIssues.filter(
        (issue: any) =>
          issue.severity ===
          SeoIssueSeverity.HIGH,
      ).length;

    const medium =
      openIssues.filter(
        (issue: any) =>
          issue.severity ===
          SeoIssueSeverity.MEDIUM,
      ).length;

    const low =
      openIssues.filter(
        (issue: any) =>
          issue.severity ===
          SeoIssueSeverity.LOW,
      ).length;

    /*
     * =======================================================
     * TECHNICAL SEO SCORE
     *
     * Critical = -20
     * High     = -10
     * Medium   = -5
     * Low      = -2
     *
     * Only OPEN issues affect score.
     * =======================================================
     */

    const penalty =
      critical * 20 +
      high * 10 +
      medium * 5 +
      low * 2;

    const score = Math.max(
      0,
      Math.min(
        100,
        100 - penalty,
      ),
    );

    /*
     * =======================================================
     * SCORE LABEL
     * =======================================================
     */

    let scoreLabel = 'Excellent';

    if (score < 90) {
      scoreLabel = 'Good';
    }

    if (score < 75) {
      scoreLabel = 'Needs Improvement';
    }

    if (score < 50) {
      scoreLabel = 'Poor';
    }

    if (score < 25) {
      scoreLabel = 'Critical';
    }

    /*
     * =======================================================
     * CATEGORY ANALYSIS
     * =======================================================
     */

    const categoryNames: TechnicalCategory[] = [
      'CRAWLABILITY',
      'INDEXABILITY',
      'METADATA',
      'CANONICAL',
      'PERFORMANCE',
      'ACCESSIBILITY',
      'STRUCTURED_DATA',
      'LINKS',
      'CONTENT',
      'OTHER',
    ];

    const categorySummary =
      categoryNames.map(
        (category) => {
          const categoryIssues =
            openIssues.filter(
              (issue: any) =>
                this.getCategory(
                  issue,
                ) === category,
            );

          const affectedPageIds =
            new Set(
              categoryIssues.map(
                (issue: any) =>
                  issue.crawlPageId,
              ),
            );

          const categoryPenalty =
            categoryIssues.reduce(
              (
                total: number,
                issue: any,
              ) =>
                total +
                this.getSeverityPenalty(
                  issue.severity,
                ),
              0,
            );

          const categoryScore =
            Math.max(
              0,
              Math.min(
                100,
                100 -
                  categoryPenalty,
              ),
            );

          return {
            category,

            label:
              this.getCategoryLabel(
                category,
              ),

            score:
              categoryScore,

            openIssues:
              categoryIssues.length,

            affectedPages:
              affectedPageIds.size,

            status:
              this.getCategoryStatus(
                categoryScore,
              ),
          };
        },
      );

    /*
     * =======================================================
     * PAGE INTELLIGENCE
     * =======================================================
     */

    const pageIntelligence =
      pages
        .map((page: any) => {
          const pageIssues =
            (page.issues ?? []).filter(
              (issue: any) =>
                issue.status ===
                'OPEN',
            );

          const pagePenalty =
            pageIssues.reduce(
              (
                total: number,
                issue: any,
              ) =>
                total +
                this.getSeverityPenalty(
                  issue.severity,
                ),
              0,
            );

          const pageScore =
            Math.max(
              0,
              Math.min(
                100,
                100 - pagePenalty,
              ),
            );

          const pageCritical =
            pageIssues.filter(
              (issue: any) =>
                issue.severity ===
                'CRITICAL',
            ).length;

          const pageHigh =
            pageIssues.filter(
              (issue: any) =>
                issue.severity ===
                'HIGH',
            ).length;

          const pageMedium =
            pageIssues.filter(
              (issue: any) =>
                issue.severity ===
                'MEDIUM',
            ).length;

          const pageLow =
            pageIssues.filter(
              (issue: any) =>
                issue.severity ===
                'LOW',
            ).length;

          const priorityScore =
            pageCritical * 1000 +
            pageHigh * 500 +
            pageMedium * 250 +
            pageLow * 100;

          return {
            id: page.id,

            url: page.url,

            title:
              page.title,

            statusCode:
              page.statusCode,

            loadTimeMs:
              page.loadTimeMs,

            issueCount:
              pageIssues.length,

            critical:
              pageCritical,

            high:
              pageHigh,

            medium:
              pageMedium,

            low:
              pageLow,

            score:
              pageScore,

            priority:
              this.getPriority(
                pageCritical,
                pageHigh,
                pageMedium,
                pageLow,
              ),

            priorityScore,

            issueCodes:
              pageIssues.map(
                (issue: any) =>
                  issue.code,
              ),
          };
        })
        .sort(
          (
            a: any,
            b: any,
          ) =>
            b.priorityScore -
            a.priorityScore,
        );

    /*
     * =======================================================
     * TOP ISSUES
     * =======================================================
     */

    const topIssues =
      [...openIssues]
        .sort(
          (
            a: any,
            b: any,
          ) =>
            this.getSeverityPenalty(
              b.severity,
            ) -
            this.getSeverityPenalty(
              a.severity,
            ),
        )
        .slice(0, 20)
        .map(
          (issue: any) => ({
            id:
              issue.id,

            code:
              issue.code,

            category:
              this.getCategory(
                issue,
              ),

            severity:
              issue.severity,

            title:
              issue.title,

            description:
              issue.description,

            recommendation:
              issue.recommendation,

            page:
              issue.page,
          }),
        );

    /*
     * =======================================================
     * SITE-WIDE ISSUE GROUPS
     * =======================================================
     */

    const issueGroups =
      this.groupIssues(
        openIssues,
        pages.length,
      );

    /*
     * =======================================================
     * PAGE METRICS
     * =======================================================
     */

    const pagesWithErrors =
      pages.filter(
        (page: any) =>
          typeof page.statusCode ===
            'number' &&
          page.statusCode >= 400,
      ).length;

    const pagesNotIndexable =
      pages.filter(
        (page: any) =>
          page.robotsIndexable ===
          false,
      ).length;

    const pagesWithoutCanonical =
      pages.filter(
        (page: any) =>
          !page.canonical,
      ).length;

    const pagesWithoutTitle =
      pages.filter(
        (page: any) =>
          !page.title,
      ).length;

    const pagesWithoutMetaDescription =
      pages.filter(
        (page: any) =>
          !page.metaDescription,
      ).length;

    const slowPages =
      pages.filter(
        (page: any) =>
          Number(
            page.loadTimeMs ?? 0,
          ) > 3000,
      ).length;

    /*
     * =======================================================
     * RESULT
     * =======================================================
     */

    return {
      website: {
        id:
          crawl.website.id,

        name:
          crawl.website.name,

        url:
          crawl.website.url,
      },

      crawl: {
        id:
          crawl.id,

        status:
          crawl.status,

        startedAt:
          crawl.startedAt,

        completedAt:
          crawl.completedAt,

        createdAt:
          crawl.createdAt,
      },

      score: {
        value:
          score,

        label:
          scoreLabel,
      },

      pages: {
        total:
          pages.length,

        withErrors:
          pagesWithErrors,

        notIndexable:
          pagesNotIndexable,

        withoutCanonical:
          pagesWithoutCanonical,

        withoutTitle:
          pagesWithoutTitle,

        withoutMetaDescription:
          pagesWithoutMetaDescription,

        slow:
          slowPages,
      },

      issues: {
        total:
          allIssues.length,

        open:
          openIssues.length,

        fixed:
          fixedIssues.length,

        ignored:
          ignoredIssues.length,

        critical,

        high,

        medium,

        low,
      },

      categories:
        categorySummary,

      issueGroups,

      topIssues,

      pageIntelligence:
        pageIntelligence.slice(
          0,
          50,
        ),
    };
  }

  /*
   * =========================================================
   * CATEGORY MAPPING
   * =========================================================
   */

  private getCategory(
    issue: any,
  ): TechnicalCategory {
    const code =
      String(
        issue.code ?? '',
      ).toUpperCase();

    const category =
      String(
        issue.category ?? '',
      ).toUpperCase();

    if (
      code.includes('ROBOTS') ||
      code.includes('CRAWL') ||
      code.includes('SITEMAP')
    ) {
      return 'CRAWLABILITY';
    }

    if (
      code.includes('INDEX') ||
      code.includes('NOINDEX') ||
      category === 'INDEXABILITY'
    ) {
      return 'INDEXABILITY';
    }

    if (
      code.includes('TITLE') ||
      code.includes(
        'META_DESCRIPTION',
      ) ||
      code.includes('META') ||
      category === 'METADATA'
    ) {
      return 'METADATA';
    }

    if (
      code.includes('CANONICAL') ||
      code.includes('REDIRECT')
    ) {
      return 'CANONICAL';
    }

    if (
      code.includes('LOAD') ||
      code.includes('SPEED') ||
      code.includes(
        'PERFORMANCE',
      )
    ) {
      return 'PERFORMANCE';
    }

    if (
      code.includes('IMAGE') ||
      category === 'ACCESSIBILITY'
    ) {
      return 'ACCESSIBILITY';
    }

    if (
      code.includes('STRUCTURED') ||
      code.includes('SCHEMA') ||
      code.includes('JSON_LD') ||
      category ===
        'STRUCTURED_DATA'
    ) {
      return 'STRUCTURED_DATA';
    }

    if (
      code.includes('LINK') ||
      category === 'LINKS'
    ) {
      return 'LINKS';
    }

    if (
      code.includes('CONTENT') ||
      code.includes('WORD') ||
      category === 'CONTENT'
    ) {
      return 'CONTENT';
    }

    return 'OTHER';
  }

  /*
   * =========================================================
   * SEVERITY PENALTY
   * =========================================================
   */

  private getSeverityPenalty(
    severity: string,
  ): number {
    switch (
      String(
        severity,
      ).toUpperCase()
    ) {
      case 'CRITICAL':
        return 20;

      case 'HIGH':
        return 10;

      case 'MEDIUM':
        return 5;

      case 'LOW':
        return 2;

      default:
        return 0;
    }
  }

  /*
   * =========================================================
   * PRIORITY
   * =========================================================
   */

  private getPriority(
    critical: number,
    high: number,
    medium: number,
    low: number,
  ): string {
    if (critical > 0) {
      return 'CRITICAL';
    }

    if (high > 0) {
      return 'HIGH';
    }

    if (medium > 0) {
      return 'MEDIUM';
    }

    if (low > 0) {
      return 'LOW';
    }

    return 'HEALTHY';
  }

  /*
   * =========================================================
   * CATEGORY STATUS
   * =========================================================
   */

  private getCategoryStatus(
    score: number,
  ): string {
    if (score >= 90) {
      return 'HEALTHY';
    }

    if (score >= 75) {
      return 'GOOD';
    }

    if (score >= 50) {
      return 'NEEDS_ATTENTION';
    }

    return 'CRITICAL';
  }

  /*
   * =========================================================
   * CATEGORY LABEL
   * =========================================================
   */

  private getCategoryLabel(
    category: TechnicalCategory,
  ): string {
    switch (category) {
      case 'CRAWLABILITY':
        return 'Crawlability';

      case 'INDEXABILITY':
        return 'Indexability';

      case 'METADATA':
        return 'Metadata';

      case 'CANONICAL':
        return 'Canonical & Redirects';

      case 'PERFORMANCE':
        return 'Performance';

      case 'ACCESSIBILITY':
        return 'Accessibility';

      case 'STRUCTURED_DATA':
        return 'Structured Data';

      case 'LINKS':
        return 'Internal & External Links';

      case 'CONTENT':
        return 'Content';

      default:
        return 'Other';
    }
  }

  /*
   * =========================================================
   * ISSUE GROUPS
   * =========================================================
   */

  private groupIssues(
    issues: any[],
    totalPages: number,
  ) {
    const groups =
      new Map<
        string,
        any
      >();

    for (
      const issue of issues
    ) {
      const existing =
        groups.get(
          issue.code,
        );

      if (existing) {
        existing.affectedPages += 1;

        existing.pages.push({
          id:
            issue.page.id,

          url:
            issue.page.url,
        });

        /*
         * FIX:
         * Recalculate percentage whenever
         * another affected page is added.
         */

        existing.affectedPercentage =
          totalPages > 0
            ? Number(
                (
                  (existing.affectedPages /
                    totalPages) *
                  100
                ).toFixed(1),
              )
            : 0;

        /*
         * Keep the highest severity
         * associated with the group.
         */

        const existingPenalty =
          this.getSeverityPenalty(
            existing.severity,
          );

        const currentPenalty =
          this.getSeverityPenalty(
            issue.severity,
          );

        if (
          currentPenalty >
          existingPenalty
        ) {
          existing.severity =
            issue.severity;

          existing.priorityScore =
            currentPenalty * 100;
        }

        continue;
      }

      const severityPenalty =
        this.getSeverityPenalty(
          issue.severity,
        );

      groups.set(
        issue.code,
        {
          code:
            issue.code,

          category:
            this.getCategory(
              issue,
            ),

          severity:
            issue.severity,

          title:
            issue.title,

          description:
            issue.description,

          recommendation:
            issue.recommendation,

          affectedPages:
            1,

          affectedPercentage:
            totalPages > 0
              ? Number(
                  (
                    (1 /
                      totalPages) *
                    100
                  ).toFixed(1),
                )
              : 0,

          priorityScore:
            severityPenalty * 100,

          pages: [
            {
              id:
                issue.page.id,

              url:
                issue.page.url,
            },
          ],
        },
      );
    }

    return Array.from(
      groups.values(),
    )
      .sort(
        (
          a: any,
          b: any,
        ) => {
          if (
            b.priorityScore !==
            a.priorityScore
          ) {
            return (
              b.priorityScore -
              a.priorityScore
            );
          }

          return (
            b.affectedPages -
            a.affectedPages
          );
        },
      );
  }
}
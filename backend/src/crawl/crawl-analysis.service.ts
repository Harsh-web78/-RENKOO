import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { RecommendationService } from './recommendation.service';

@Injectable()
export class CrawlAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recommendationService: RecommendationService,
  ) {}

  async analyzeCrawl(
    organizationId: string,
    crawlId: string,
  ) {
    /*
     * =========================================================
     * 1. LOAD CRAWL
     * =========================================================
     */

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
      throw new Error('Crawl not found');
    }

    const pages = crawl.pages;

    /*
     * =========================================================
     * 2. DUPLICATE TITLES
     * =========================================================
     */

    const titleGroups =
      new Map<string, typeof pages>();

    for (const page of pages) {
      const title =
        page.title?.trim();

      if (!title) {
        continue;
      }

      const key =
        title.toLowerCase();

      const group =
        titleGroups.get(key) || [];

      group.push(page);

      titleGroups.set(
        key,
        group,
      );
    }

    const duplicateTitles =
      Array.from(
        titleGroups.entries(),
      )
        .filter(
          ([, group]) =>
            group.length > 1,
        )
        .map(
          ([title, group]) => ({
            title,

            count:
              group.length,

            pages:
              group.map(
                (page) => ({
                  id:
                    page.id,

                  url:
                    page.url,
                }),
              ),
          }),
        );

    /*
     * =========================================================
     * 3. DUPLICATE META DESCRIPTIONS
     * =========================================================
     */

    const metaGroups =
      new Map<string, typeof pages>();

    for (const page of pages) {
      const description =
        page.metaDescription?.trim();

      if (!description) {
        continue;
      }

      const key =
        description.toLowerCase();

      const group =
        metaGroups.get(key) || [];

      group.push(page);

      metaGroups.set(
        key,
        group,
      );
    }

    const duplicateMetaDescriptions =
      Array.from(
        metaGroups.entries(),
      )
        .filter(
          ([, group]) =>
            group.length > 1,
        )
        .map(
          ([description, group]) => ({
            description,

            count:
              group.length,

            pages:
              group.map(
                (page) => ({
                  id:
                    page.id,

                  url:
                    page.url,
                }),
              ),
          }),
        );

    /*
     * =========================================================
     * 4. DUPLICATE H1
     * =========================================================
     */

    const h1Groups =
      new Map<string, typeof pages>();

    for (const page of pages) {
      const h1 =
        page.h1?.[0]?.trim();

      if (!h1) {
        continue;
      }

      const key =
        h1.toLowerCase();

      const group =
        h1Groups.get(key) || [];

      group.push(page);

      h1Groups.set(
        key,
        group,
      );
    }

    const duplicateH1 =
      Array.from(
        h1Groups.entries(),
      )
        .filter(
          ([, group]) =>
            group.length > 1,
        )
        .map(
          ([h1, group]) => ({
            h1,

            count:
              group.length,

            pages:
              group.map(
                (page) => ({
                  id:
                    page.id,

                  url:
                    page.url,
                }),
              ),
          }),
        );

    /*
     * =========================================================
     * 5. PAGE STATISTICS
     * =========================================================
     */

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
          page.h1.length > 0,
      ).length;

    const pagesWithCanonical =
      pages.filter(
        (page) =>
          !!page.canonical?.trim(),
      ).length;

    const pagesWithStructuredData =
      pages.filter(
        (page) =>
          page.structuredDataCount > 0,
      ).length;

    const pagesWithNoindex =
      pages.filter(
        (page) =>
          page.robotsIndexable === false,
      ).length;

    /*
     * =========================================================
     * 6. ALL ISSUES
     * =========================================================
     */

    const allIssues =
      pages.flatMap(
        (page) =>
          page.issues,
      );

    /*
     * Only OPEN issues are used for
     * current issue intelligence.
     */

    const openIssues =
      allIssues.filter(
        (issue) =>
          issue.status === 'OPEN',
      );

    /*
     * =========================================================
     * 7. ISSUE DISTRIBUTION BY CATEGORY
     * =========================================================
     */

    const issueByCategory =
      openIssues.reduce(
        (
          result,
          issue,
        ) => {
          result[issue.category] =
            (result[issue.category] || 0) +
            1;

          return result;
        },

        {} as Record<
          string,
          number
        >,
      );

    /*
     * =========================================================
     * 8. ISSUE DISTRIBUTION BY CODE
     * =========================================================
     */

    const issueByCode =
      openIssues.reduce(
        (
          result,
          issue,
        ) => {
          result[issue.code] =
            (result[issue.code] || 0) +
            1;

          return result;
        },

        {} as Record<
          string,
          number
        >,
      );

    /*
     * =========================================================
     * 9. ISSUE INTELLIGENCE
     * =========================================================
     *
     * Group identical issue codes together.
     *
     * Example:
     *
     * 50 pages
     * 50 MISSING_CANONICAL
     *
     * becomes:
     *
     * affectedPages: 50
     * affectedPercentage: 100
     * isSiteWide: true
     */

    const issueGroups =
      new Map<
        string,
        {
          code: string;

          category: string;

          severity: string;

          title: string;

          description: string;

          recommendation: string;

          pages: Map<
            string,
            {
              id: string;
              url: string;
            }
          >;
        }
      >();

    for (
      const issue of openIssues
    ) {
      let group =
        issueGroups.get(
          issue.code,
        );

      if (!group) {
        group = {
          code:
            issue.code,

          category:
            issue.category,

          severity:
            issue.severity,

          title:
            issue.title,

          description:
            issue.description,

          recommendation:
            issue.recommendation,

          pages:
            new Map(),
        };

        issueGroups.set(
          issue.code,
          group,
        );
      }

      /*
       * Use crawlPageId as unique key.
       * Prevents accidental duplicate counting.
       */

      group.pages.set(
        issue.crawlPageId,
        {
          id:
            issue.crawlPageId,

          url:
            pages.find(
              (page) =>
                page.id ===
                issue.crawlPageId,
            )?.url || '',
        },
      );
    }

    /*
     * =========================================================
     * 10. ISSUE PRIORITY
     * =========================================================
     */

    const severityWeight:
      Record<
        string,
        number
      > = {
        CRITICAL: 4,
        HIGH: 3,
        MEDIUM: 2,
        LOW: 1,
      };

    const issueIntelligence =
      Array.from(
        issueGroups.values(),
      )
        .map(
          (group) => {
            const affectedPages =
              group.pages.size;

            const affectedPercentage =
              pages.length > 0
                ? Math.round(
                    (
                      affectedPages /
                      pages.length
                    ) *
                      100,
                  )
                : 0;

            const severity =
              group.severity;

            const severityScore =
              severityWeight[
                severity
              ] || 0;

            /*
             * Severity dominates.
             * Page coverage determines
             * site-wide impact.
             */

            const priorityScore =
              severityScore * 100 +
              affectedPercentage;

            return {
              code:
                group.code,

              category:
                group.category,

              severity,

              title:
                group.title,

              description:
                group.description,

              recommendation:
                group.recommendation,

              affectedPages,

              affectedPercentage,

              priorityScore,

              isSiteWide:
                pages.length > 0 &&
                affectedPages ===
                  pages.length,

              pages:
                Array.from(
                  group.pages.values(),
                ),
            };
          },
        )
        .sort(
          (
            a,
            b,
          ) =>
            b.priorityScore -
            a.priorityScore,
        );

    /*
     * =========================================================
     * 11. TOP PRIORITY ISSUES
     * =========================================================
     */

    const topPriorityIssues =
      issueIntelligence.slice(
        0,
        10,
      );

    /*
     * =========================================================
     * 12. SITE-WIDE ISSUES
     * =========================================================
     */

    const siteWideIssues =
      issueIntelligence.filter(
        (issue) =>
          issue.isSiteWide,
      );

    /*
     * =========================================================
     * 13. HIGH IMPACT ISSUES
     * =========================================================
     *
     * High impact means:
     *
     * - CRITICAL / HIGH severity
     * OR
     * - affected >= 50%
     */

    const highImpactIssues =
      issueIntelligence.filter(
        (issue) =>
          issue.severity ===
            'CRITICAL' ||
          issue.severity ===
            'HIGH' ||
          issue.affectedPercentage >=
            50,
      );

    /*
     * =========================================================
     * 14. UNIQUE ISSUE TYPES
     * =========================================================
     */

    const uniqueIssueTypes =
      issueIntelligence.length;

    /*
     * =========================================================
     * 15. PAGE INTELLIGENCE
     * =========================================================
     *
     * Converts raw page issues into
     * page-level priorities.
     */

    const pageIntelligence =
      pages
        .map(
          (page) => {
            const pageIssues =
              page.issues.filter(
                (issue) =>
                  issue.status ===
                  'OPEN',
              );

            const critical =
              pageIssues.filter(
                (issue) =>
                  issue.severity ===
                  'CRITICAL',
              ).length;

            const high =
              pageIssues.filter(
                (issue) =>
                  issue.severity ===
                  'HIGH',
              ).length;

            const medium =
              pageIssues.filter(
                (issue) =>
                  issue.severity ===
                  'MEDIUM',
              ).length;

            const low =
              pageIssues.filter(
                (issue) =>
                  issue.severity ===
                  'LOW',
              ).length;

            /*
             * Page-level score.
             *
             * Critical = 500
             * High     = 300
             * Medium   = 200
             * Low      = 100
             *
             * Issue count is also included.
             */

            const priorityScore =
              critical * 500 +
              high * 300 +
              medium * 200 +
              low * 100 +
              pageIssues.length * 10;

            let priority =
              'LOW';

            if (
              critical > 0
            ) {
              priority =
                'CRITICAL';
            } else if (
              high > 0
            ) {
              priority =
                'HIGH';
            } else if (
              medium > 0
            ) {
              priority =
                'MEDIUM';
            }

            return {
              id:
                page.id,

              url:
                page.url,

              title:
                page.title,

              issueCount:
                pageIssues.length,

              critical,

              high,

              medium,

              low,

              priority,

              priorityScore,

              issueCodes:
                pageIssues.map(
                  (issue) =>
                    issue.code,
                ),
            };
          },
        )
        .sort(
          (
            a,
            b,
          ) =>
            b.priorityScore -
            a.priorityScore,
        );

    /*
     * =========================================================
     * 16. DUPLICATE INTELLIGENCE
     * =========================================================
     */

    const duplicateIntelligence: any[] =
      [];

    /*
     * Duplicate titles
     */

    for (
      const group of
      duplicateTitles
    ) {
      const affectedPages =
        group.count;

      const affectedPercentage =
        pages.length > 0
          ? Math.round(
              (
                affectedPages /
                pages.length
              ) *
                100,
            )
          : 0;

      duplicateIntelligence.push({
        code:
          'DUPLICATE_TITLE',

        type:
          'TITLE',

        title:
          'Duplicate page titles',

        severity:
          'MEDIUM',

        affectedPages,

        affectedPercentage,

        priorityScore:
          200 +
          affectedPercentage,

        pages:
          group.pages,

        value:
          group.title,
      });
    }

    /*
     * Duplicate meta descriptions
     */

    for (
      const group of
      duplicateMetaDescriptions
    ) {
      const affectedPages =
        group.count;

      const affectedPercentage =
        pages.length > 0
          ? Math.round(
              (
                affectedPages /
                pages.length
              ) *
                100,
            )
          : 0;

      duplicateIntelligence.push({
        code:
          'DUPLICATE_META_DESCRIPTION',

        type:
          'META_DESCRIPTION',

        title:
          'Duplicate meta descriptions',

        severity:
          'MEDIUM',

        affectedPages,

        affectedPercentage,

        priorityScore:
          200 +
          affectedPercentage,

        pages:
          group.pages,

        value:
          group.description,
      });
    }

    /*
     * Duplicate H1
     */

    for (
      const group of
      duplicateH1
    ) {
      const affectedPages =
        group.count;

      const affectedPercentage =
        pages.length > 0
          ? Math.round(
              (
                affectedPages /
                pages.length
              ) *
                100,
            )
          : 0;

      duplicateIntelligence.push({
        code:
          'DUPLICATE_H1',

        type:
          'H1',

        title:
          'Duplicate H1 headings',

        severity:
          'MEDIUM',

        affectedPages,

        affectedPercentage,

        priorityScore:
          200 +
          affectedPercentage,

        pages:
          group.pages,

        value:
          group.h1,
      });
    }

    /*
     * Sort duplicate intelligence.
     */

    duplicateIntelligence.sort(
      (
        a,
        b,
      ) =>
        b.priorityScore -
        a.priorityScore,
    );

    /*
     * =========================================================
     * 17. DUPLICATE SUMMARY
     * =========================================================
     */

    const affectedTitlePages =
      new Set(
        duplicateTitles.flatMap(
          (group) =>
            group.pages.map(
              (page) =>
                page.id,
            ),
        ),
      ).size;

    const affectedMetaDescriptionPages =
      new Set(
        duplicateMetaDescriptions.flatMap(
          (group) =>
            group.pages.map(
              (page) =>
                page.id,
            ),
        ),
      ).size;

    const affectedH1Pages =
      new Set(
        duplicateH1.flatMap(
          (group) =>
            group.pages.map(
              (page) =>
                page.id,
            ),
        ),
      ).size;

    const duplicateSummary = {
      duplicateTitleGroups:
        duplicateTitles.length,

      duplicateMetaDescriptionGroups:
        duplicateMetaDescriptions.length,

      duplicateH1Groups:
        duplicateH1.length,

      affectedTitlePages,

      affectedMetaDescriptionPages,

      affectedH1Pages,
    };

    /*
     * =========================================================
     * 18. BASE ANALYSIS
     * =========================================================
     *
     * Build this first because RecommendationService
     * uses the complete analysis data.
     */

    const baseAnalysis = {
      crawlId:
        crawl.id,

      websiteId:
        crawl.websiteId,

      website: {
        id:
          crawl.website.id,

        name:
          crawl.website.name,

        url:
          crawl.website.url,

        industry:
          crawl.website.industry,

        country:
          crawl.website.country,
      },

      pages: {
        total:
          pages.length,

        withTitle:
          pagesWithTitle,

        withMetaDescription:
          pagesWithMeta,

        withH1:
          pagesWithH1,

        withCanonical:
          pagesWithCanonical,

        withStructuredData:
          pagesWithStructuredData,

        noindex:
          pagesWithNoindex,
      },

      duplicates: {
        titles:
          duplicateTitles,

        metaDescriptions:
          duplicateMetaDescriptions,

        h1:
          duplicateH1,

        summary:
          duplicateSummary,

        intelligence:
          duplicateIntelligence,
      },

      issues: {
        /*
         * Raw count.
         */

        total:
          openIssues.length,

        /*
         * Unique issue types.
         */

        uniqueIssueTypes,

        /*
         * Distribution.
         */

        byCategory:
          issueByCategory,

        byCode:
          issueByCode,

        /*
         * Grouped issue intelligence.
         */

        intelligence:
          issueIntelligence,

        /*
         * Site-wide findings.
         */

        siteWide:
          siteWideIssues,

        /*
         * High-impact findings.
         */

        highImpact:
          highImpactIssues,

        /*
         * Highest priority findings.
         */

        topPriority:
          topPriorityIssues,
      },

      pageIntelligence,

      intelligenceSummary: {
        totalOpenIssues:
          openIssues.length,

        uniqueIssueTypes,

        siteWideIssueTypes:
          siteWideIssues.length,

        highImpactIssueTypes:
          highImpactIssues.length,

        pagesWithIssues:
          pageIntelligence.filter(
            (page) =>
              page.issueCount > 0,
          ).length,

        healthyPages:
          pageIntelligence.filter(
            (page) =>
              page.issueCount === 0,
          ).length,

        duplicateGroups:
          duplicateIntelligence.length,
      },
    };

    /*
     * =========================================================
     * 19. RECOMMENDATIONS
     * =========================================================
     */

    const recommendations =
      this.recommendationService
        .generateRecommendations(
          baseAnalysis,
        );

    /*
     * =========================================================
     * 20. FINAL RESULT
     * =========================================================
     */

    return {
      ...baseAnalysis,

      recommendations,
    };
  }
}
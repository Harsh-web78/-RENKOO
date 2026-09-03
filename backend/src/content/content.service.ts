import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { GoogleService } from '../google/google.service';
import { PrismaService } from '../prisma/prisma.service';

type OpportunityPriority =
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW';

type OpportunityType =
  | 'QUICK_WIN'
  | 'PAGE_ONE_GROWTH'
  | 'CONTENT_PROTECTION'
  | 'LOW_CTR'
  | 'CONTENT_GROWTH';

@Injectable()
export class ContentService {
  constructor(
    private readonly googleService: GoogleService,
    private readonly prisma: PrismaService,
  ) {}

  /*
   * =========================================================
   * CONTENT OPPORTUNITIES
   * =========================================================
   */


  /*
   * =========================================================
   * CONTENT -> RECOMMENDATION BRIDGE
   * =========================================================
   *
   * Persists real GSC content opportunities into the existing
   * Recommendation Engine.
   * =========================================================
   */

  private async createContentRecommendations(
    organizationId: string,
    websiteId: string,
    opportunities: any[],
  ) {
    if (!websiteId || opportunities.length === 0) {
      return [];
    }

    const results: any[] = [];

    for (const opportunity of opportunities) {
      const existing = await this.prisma.recommendation.findFirst({
        where: {
          organizationId,
          websiteId,
          source: 'CONTENT',
          type: opportunity.type,
          metadata: {
            path: ['query'],
            equals: opportunity.query,
          },
        },
      });

      if (existing) {
        results.push(existing);
        continue;
      }

      const recommendation =
        await this.prisma.recommendation.create({
          data: {
            organizationId,
            websiteId,
            source: 'CONTENT',
            type: opportunity.type,
            title: `Improve content for "${opportunity.query}"`,
            description:
              opportunity.whyItMatters ||
              opportunity.recommendation ||
              'Improve the page based on real Google Search Console performance data.',
            priority: opportunity.priority,
            impact: opportunity.estimatedImpact,
            effort:
              opportunity.type === 'LOW_CTR'
                ? 'LOW'
                : opportunity.priority === 'HIGH'
                  ? 'MEDIUM'
                  : 'HIGH',
            actionText:
              opportunity.action ||
              opportunity.recommendation,
            pageUrl:
              opportunity.page || undefined,
            metadata: {
              query: opportunity.query,
              clicks: opportunity.clicks,
              impressions: opportunity.impressions,
              ctr: opportunity.ctr,
              position: opportunity.position,
              score: opportunity.score,
              rankingStage: opportunity.rankingStage,
              opportunityType: opportunity.type,
              estimatedImpact:
                opportunity.estimatedImpact,
              startDate:
                opportunity.startDate || null,
              endDate:
                opportunity.endDate || null,
            },
          },
        });

      results.push(recommendation);
    }

    return results;
  }

  async getOpportunities(
    organizationId: string,
    startDate: string,
    endDate: string,
    websiteId?: string,
  ) {
    if (!startDate || !endDate) {
      throw new UnauthorizedException(
        'startDate and endDate are required',
      );
    }

    /*
     * Get real Google Search Console query data.
     */

    const queries =
      await this.googleService.getSearchQueries(
        organizationId,
        startDate,
        endDate,
      );

    /*
     * Get query -> page mapping.
     */

    const queryPages =
      await this.googleService.getQueryPages(
        organizationId,
        startDate,
        endDate,
      );

    /*
     * Get active websites belonging to this organization.
     */

    const websites =
      await this.prisma.website.findMany({
        where: {
          organizationId,
          isActive: true,
        },

        select: {
          id: true,
          name: true,
          url: true,
        },
      });

    /*
     * =======================================================
     * QUERY -> BEST RANKING PAGE
     * =======================================================
     *
     * A query can have multiple pages.
     *
     * Prefer the page with the highest impressions because
     * that page represents the strongest available GSC signal.
     */

    const pageMap =
      new Map<
        string,
        {
          page: string;
          impressions: number;
          clicks: number;
          position: number;
        }
      >();

    for (const row of queryPages.rows) {
      const existing =
        pageMap.get(row.query);

      if (!existing) {
        pageMap.set(
          row.query,
          {
            page: row.page,
            impressions:
              row.impressions,
            clicks:
              row.clicks,
            position:
              row.position,
          },
        );

        continue;
      }

      if (
        row.impressions >
        existing.impressions
      ) {
        pageMap.set(
          row.query,
          {
            page: row.page,
            impressions:
              row.impressions,
            clicks:
              row.clicks,
            position:
              row.position,
          },
        );
      }
    }

    /*
     * =======================================================
     * BUILD OPPORTUNITIES
     * =======================================================
     */

    const opportunities =
      queries.rows
        .filter(
          (row) =>
            row.impressions > 0 &&
            row.position > 0,
        )
        .map((row) => {
          const pageData =
            pageMap.get(row.query);

          const page =
            pageData?.page ??
            null;

          const position =
            Number(row.position);

          const impressions =
            Number(row.impressions);

          const clicks =
            Number(row.clicks);

          const ctr =
            Number(row.ctr);

          /*
           * =================================================
           * RANKING STAGE
           * =================================================
           */

          let rankingStage =
            'BEYOND_PAGE_ONE';

          if (
            position >= 1 &&
            position < 4
          ) {
            rankingStage =
              'TOP_3';
          } else if (
            position >= 4 &&
            position <= 10
          ) {
            rankingStage =
              'PAGE_1';
          } else if (
            position > 10 &&
            position <= 20
          ) {
            rankingStage =
              'PAGE_2';
          }

          /*
           * =================================================
           * BASE SCORE
           * =================================================
           */

          let score = 0;

          /*
           * Ranking signal.
           */

          if (
            position >= 4 &&
            position <= 10
          ) {
            score += 40;
          } else if (
            position > 10 &&
            position <= 20
          ) {
            score += 30;
          } else if (
            position >= 1 &&
            position < 4
          ) {
            score += 25;
          } else if (
            position > 20
          ) {
            score += 10;
          }

          /*
           * Impression signal.
           */

          if (
            impressions >= 100
          ) {
            score += 30;
          } else if (
            impressions >= 50
          ) {
            score += 25;
          } else if (
            impressions >= 20
          ) {
            score += 20;
          } else if (
            impressions >= 5
          ) {
            score += 10;
          } else {
            score += 5;
          }

          /*
           * CTR signal.
           *
           * Only treat low CTR as meaningful when there
           * are enough impressions to support the signal.
           */

          const lowCtr =
            ctr < 0.02 &&
            impressions >= 5;

          const weakCtr =
            ctr < 0.05 &&
            impressions >= 3;

          if (lowCtr) {
            score += 20;
          } else if (weakCtr) {
            score += 15;
          } else if (
            ctr >= 0.05
          ) {
            score += 10;
          }

          /*
           * Click validation signal.
           */

          if (clicks > 0) {
            score += 10;
          }

          score =
            Math.min(
              100,
              score,
            );

          /*
           * =================================================
           * OPPORTUNITY CLASSIFICATION
           * =================================================
           */

          let type:
            OpportunityType =
            'CONTENT_GROWTH';

          let priority:
            OpportunityPriority =
            'LOW';

          let recommendation =
            'Improve content depth and relevance for this search query.';

          let action =
            'Improve the ranking page with stronger search-intent coverage.';

          let whyItMatters =
            'The query has existing Google Search visibility, creating an opportunity to improve organic performance.';

          /*
           * TOP 3
           */

          if (
            position >= 1 &&
            position < 4
          ) {
            type =
              'CONTENT_PROTECTION';

            priority =
              'MEDIUM';

            recommendation =
              'Protect the current ranking while improving content clarity and organic CTR.';

            action =
              'Avoid major content changes. Improve the title, meta description and supporting internal links carefully.';

            whyItMatters =
              'The page already ranks in the top 3, so aggressive changes could put valuable visibility at risk.';
          }

          /*
           * PAGE 1 QUICK WIN
           */

          else if (
            position >= 4 &&
            position <= 10
          ) {
            type =
              'QUICK_WIN';

            priority =
              'HIGH';

            recommendation =
              'Strengthen the existing ranking page with deeper search-intent coverage and clearer content structure.';

            action =
              'Optimize the existing page before creating a new page. Expand missing subtopics, improve headings and strengthen internal links.';

            whyItMatters =
              'The query already ranks on page one, so improving the existing page can potentially move it into the top 3.';
          }

          /*
           * PAGE 2
           */

          else if (
            position > 10 &&
            position <= 20
          ) {
            type =
              'PAGE_ONE_GROWTH';

            priority =
              'HIGH';

            recommendation =
              'Expand topical coverage, improve internal linking and strengthen the page around this query.';

            action =
              'Expand the existing ranking page and build relevant internal links from supporting pages.';

            whyItMatters =
              'The query is already close to page one, making it a stronger growth candidate than a query with no existing visibility.';
          }

          /*
           * BEYOND PAGE 2
           */

          else if (
            position > 20
          ) {
            type =
              'CONTENT_GROWTH';

            priority =
              'LOW';

            recommendation =
              'Build stronger topical relevance and supporting content for this search query.';

            action =
              'Improve topical coverage and consider supporting content before expecting major ranking movement.';

            whyItMatters =
              'The query has visibility but currently ranks too far from page one for a quick optimization win.';
          }

          /*
           * =================================================
           * LOW CTR OVERRIDE
           * =================================================
           *
           * Do not overwrite strong QUICK_WIN signals blindly.
           *
           * A page ranking 4–10 with low CTR is still a
           * quick-win candidate, but we expose CTR as the
           * primary action.
           */

          if (lowCtr) {
            type =
              'LOW_CTR';

            recommendation =
              'Review the ranking page title and meta description to improve organic click-through rate.';

            action =
              'Rewrite the title and meta description to better match the query intent and make the search snippet more compelling.';

            whyItMatters =
              'Google is already showing the page for this query, but the low CTR suggests the search snippet is not converting enough impressions into clicks.';
          }

          /*
           * =================================================
           * PRIORITY ADJUSTMENT
           * =================================================
           *
           * Low CTR with meaningful impressions is actionable.
           */

          if (
            lowCtr &&
            impressions >= 20
          ) {
            priority =
              'HIGH';
          }

          /*
           * A page-one query with clicks is stronger
           * than an unvalidated visibility-only query.
           */

          if (
            position >= 4 &&
            position <= 10 &&
            impressions >= 20
          ) {
            priority =
              'HIGH';
          }

          /*
           * =================================================
           * ESTIMATED IMPACT
           * =================================================
           */

          let estimatedImpact =
            'LOW';

          if (
            score >= 70
          ) {
            estimatedImpact =
              'HIGH';
          } else if (
            score >= 45
          ) {
            estimatedImpact =
              'MEDIUM';
          }

          /*
           * =================================================
           * RETURN
           * =================================================
           */

          return {
            query:
              row.query,

            page,

            clicks,

            impressions,

            ctr,

            position,

            score,

            priority,

            type,

            rankingStage,

            estimatedImpact,

            recommendation,

            action,

            whyItMatters,
          };
        })
        .sort(
          (a, b) => {
            const priorityScore:
              Record<
                OpportunityPriority,
                number
              > = {
                HIGH: 3,
                MEDIUM: 2,
                LOW: 1,
              };

            const priorityDifference =
              priorityScore[
                b.priority
              ] -
              priorityScore[
                a.priority
              ];

            if (
              priorityDifference !==
              0
            ) {
              return priorityDifference;
            }

            /*
             * Higher opportunity score first.
             */

            if (
              b.score !==
              a.score
            ) {
              return (
                b.score -
                a.score
              );
            }

            /*
             * Then strongest search demand.
             */

            return (
              b.impressions -
              a.impressions
            );
          },
        )
        .slice(
          0,
          50,
        );

    /*
     * =========================================================
     * RESPONSE
     * =========================================================
     */


    /*
     * =========================================================
     * CONTENT_RECOMMENDATIONS_SYNC
     * =========================================================
     */

    if (websiteId) {
      await this.createContentRecommendations(
        organizationId,
        websiteId,
        opportunities.map((item) => ({
          ...item,
          startDate,
          endDate,
        })),
      );
    }

    return {
      startDate,

      endDate,

      websites,

      total:
        opportunities.length,

      opportunities,
    };
  }
}
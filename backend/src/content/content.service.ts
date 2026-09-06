import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { GoogleService } from '../google/google.service';
import { BusinessBrainService } from '../business-brain/business-brain.service';
import { AiVisibilityService } from '../ai-visibility/ai-visibility.service';
import { BillingService } from '../billing/billing.service';
import { AiProviderRegistry } from '../ai-visibility/providers/provider.registry';
import { AiProviderError } from '../ai-visibility/providers/provider.errors';
import { PrismaService } from '../prisma/prisma.service';
import {
  classifyIntent,
  type SearchIntent,
} from './intent';
import { serpStatus } from './serp.provider';
import {
  CONTENT_STATUSES,
  CreateBriefDto,
  CreateItemDto,
  GenerateDto,
  OptimizeDto,
  UpdateItemDto,
} from './dto/content.dto';

type OpportunityPriority =
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW';

type OpportunityType =
  | 'QUICK_WIN'
  | 'PAGE_ONE_GROWTH'
  | 'CONTENT_PROTECTION'
  | 'LOW_CTR'
  | 'CONTENT_GROWTH'
  | 'REFRESH_REQUIRED';

/*
 * AI credit cost per generation mode. One unit
 * ≈ one provider call; DRAFT costs more because
 * it requests a long completion.
 */
const MODE_CREDIT_COST: Record<string, number> = {
  OUTLINE: 1,
  SECTION: 1,
  FAQ: 1,
  REWRITE: 2,
  DRAFT: 3,
};

const FREE_MONTHLY_AI_CREDITS = 20;

@Injectable()
export class ContentService {
  private readonly logger = new Logger(
    ContentService.name,
  );

  constructor(
    private readonly googleService: GoogleService,
    private readonly prisma: PrismaService,
    private readonly businessBrainService: BusinessBrainService,
    private readonly aiVisibilityService: AiVisibilityService,
    private readonly billingService: BillingService,
    private readonly providerRegistry: AiProviderRegistry,
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
          isActive: true,
        },
      });

    if (!website) {
      throw new NotFoundException(
        'Website not found',
      );
    }

    return website;
  }

  private isoDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().slice(0, 10);
  }

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

  // =========================================================
  // CONTENT ITEMS (tenant-scoped workflow objects)
  // =========================================================

  async listItems(
    organizationId: string,
    websiteId: string,
  ) {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );

    const items =
      await this.prisma.contentItem.findMany(
        {
          where: {
            organizationId,
            websiteId,
          },
          orderBy: {
            updatedAt: 'desc',
          },
          take: 200,
          include: {
            briefs: {
              select: { id: true },
            },
            drafts: {
              select: {
                id: true,
                mode: true,
                provider: true,
                humanCreated: true,
              },
            },
          },
        },
      );

    return {
      total: items.length,
      publishing: this.publishingStatus(),
      items,
    };
  }

  async getItem(
    organizationId: string,
    id: string,
  ) {
    const item =
      await this.prisma.contentItem.findFirst(
        {
          where: {
            id,
            organizationId,
          },
          include: {
            briefs: {
              orderBy: {
                createdAt: 'desc',
              },
            },
            drafts: {
              orderBy: {
                createdAt: 'desc',
              },
            },
          },
        },
      );

    if (!item) {
      throw new NotFoundException(
        'Content item not found',
      );
    }

    return {
      ...item,
      publishing: this.publishingStatus(),
    };
  }

  async createItem(
    organizationId: string,
    dto: CreateItemDto,
  ) {
    await this.verifyWebsite(
      organizationId,
      dto.websiteId,
    );

    const title = dto.title.trim();

    if (!title) {
      throw new BadRequestException(
        'Title is required',
      );
    }

    return this.prisma.contentItem.create(
      {
        data: {
          organizationId,
          websiteId: dto.websiteId,
          title,
          targetQuery:
            dto.targetQuery?.trim() ||
            null,
          intent:
            dto.intent?.trim() || null,
          pageUrl:
            dto.pageUrl?.trim() || null,
          status: 'IDEA',
        },
      },
    );
  }

  async updateItem(
    organizationId: string,
    id: string,
    dto: UpdateItemDto,
  ) {
    const existing =
      await this.prisma.contentItem.findFirst(
        {
          where: {
            id,
            organizationId,
          },
          select: { id: true },
        },
      );

    if (!existing) {
      throw new NotFoundException(
        'Content item not found',
      );
    }

    if (
      dto.status !== undefined &&
      !(
        CONTENT_STATUSES as readonly string[]
      ).includes(dto.status)
    ) {
      throw new BadRequestException(
        `Status must be one of: ${CONTENT_STATUSES.join(', ')}`,
      );
    }

    /*
     * PUBLISHED via status patch alone is not
     * trusted: explicit confirmation endpoint
     * required (see markPublished).
     */
    if (dto.status === 'PUBLISHED') {
      throw new BadRequestException(
        'Use the publish confirmation endpoint to mark content published',
      );
    }

    const clean = (
      value: string | undefined,
    ) =>
      value === undefined
        ? undefined
        : value?.trim() || null;

    return this.prisma.contentItem.update(
      {
        where: { id },
        data: {
          ...(dto.title !== undefined
            ? {
                title:
                  dto.title.trim(),
              }
            : {}),
          ...(dto.targetQuery !==
          undefined
            ? {
                targetQuery: clean(
                  dto.targetQuery,
                ),
              }
            : {}),
          ...(dto.intent !== undefined
            ? {
                intent: clean(
                  dto.intent,
                ),
              }
            : {}),
          ...(dto.pageUrl !== undefined
            ? {
                pageUrl: clean(
                  dto.pageUrl,
                ),
              }
            : {}),
          ...(dto.status !== undefined
            ? { status: dto.status }
            : {}),
        },
      },
    );
  }

  async removeItem(
    organizationId: string,
    id: string,
  ) {
    const existing =
      await this.prisma.contentItem.findFirst(
        {
          where: {
            id,
            organizationId,
          },
          select: { id: true },
        },
      );

    if (!existing) {
      throw new NotFoundException(
        'Content item not found',
      );
    }

    await this.prisma.contentItem.delete({
      where: { id },
    });

    return { success: true, id };
  }

  // =========================================================
  // EVIDENCE BRIEFS (deterministic, never generic)
  // =========================================================

  private significantWords(
    query: string,
  ): string[] {
    const stop = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'of',
      'to',
      'in',
      'on',
      'for',
      'with',
      'is',
      'are',
      'what',
      'how',
      'why',
      'best',
      'top',
    ]);

    return query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(
        (word) =>
          word.length > 2 &&
          !stop.has(word),
      );
  }

  async generateBrief(
    organizationId: string,
    dto: CreateBriefDto,
  ) {
    const website =
      await this.verifyWebsite(
        organizationId,
        dto.websiteId,
      );

    const query = dto.query.trim();

    if (!query) {
      throw new BadRequestException(
        'Query is required',
      );
    }

    let itemId: string | null =
      dto.itemId?.trim() || null;

    if (itemId) {
      const item =
        await this.prisma.contentItem.findFirst(
          {
            where: {
              id: itemId,
              organizationId,
              websiteId: dto.websiteId,
            },
            select: { id: true },
          },
        );

      if (!item) {
        throw new NotFoundException(
          'Content item not found',
        );
      }
    }

    /*
     * Evidence assembly — every source real,
     * every gap labeled.
     */
    const evidenceSources: string[] = [];
    const limitations: string[] = [];

    let context: any = null;

    try {
      context =
        await this.businessBrainService.getBusinessContext(
          organizationId,
          dto.websiteId,
        );
      evidenceSources.push(
        'Business Brain profile, offerings, audience and locations',
      );
    } catch {
      limitations.push(
        'Business Brain context is unavailable; the brief is less personalized.',
      );
    }

    const locations: string[] = [
      ...(context?.priorities
        ?.targetLocations ?? []),
      ...(
        context?.locations ?? []
      ).map(
        (location: any) =>
          location.city,
      ),
    ].filter(Boolean);

    const { primary: intent, all: intents } =
      classifyIntent(query, {
        locations,
      });
    evidenceSources.push(
      `Deterministic intent classification (${intents.join(', ')})`,
    );

    let gscRow: any = null;
    let gscPage: string | null =
      dto.page?.trim() || null;

    try {
      const end = this.isoDaysAgo(1);
      const start = this.isoDaysAgo(29);
      const [queries, queryPages] =
        await Promise.all([
          this.googleService.getSearchQueries(
            organizationId,
            start,
            end,
          ),
          this.googleService.getQueryPages(
            organizationId,
            start,
            end,
          ),
        ]);

      const match = queries.rows.find(
        (row: any) =>
          String(
            row.query ?? '',
          ).toLowerCase() ===
          query.toLowerCase(),
      );

      if (match) {
        gscRow = match;
        evidenceSources.push(
          `GSC query evidence (${match.impressions} impressions, ${match.clicks} clicks, position ${match.position}, ${start} to ${end})`,
        );

        if (!gscPage) {
          const mapping =
            queryPages.rows
              .filter(
                (row: any) =>
                  String(
                    row.query ?? '',
                  ).toLowerCase() ===
                  query.toLowerCase(),
              )
              .sort(
                (a: any, b: any) =>
                  Number(
                    b.impressions ?? 0,
                  ) -
                  Number(
                    a.impressions ?? 0,
                  ),
              )[0];

          gscPage =
            mapping?.page ?? null;
        }
      } else {
        limitations.push(
          'No GSC query data for this exact query in the last 28 days.',
        );
      }
    } catch {
      limitations.push(
        'GSC is not connected or query data is unavailable.',
      );
    }

    const trackedCompetitors =
      await this.prisma.competitor
        .findMany({
          where: {
            organizationId,
            websiteId: dto.websiteId,
            isActive: true,
          },
          select: {
            name: true,
            domain: true,
            url: true,
          },
          take: 10,
        })
        .catch(() => []);

    if (trackedCompetitors.length > 0) {
      evidenceSources.push(
        `${trackedCompetitors.length} tracked competitor(s) for manual review`,
      );
    }

    let internalLinks: Array<{
      title: string | null;
      url: string;
    }> = [];

    try {
      const latest =
        await this.prisma.crawl.findFirst({
          where: {
            websiteId: dto.websiteId,
            status: 'COMPLETED',
          },
          orderBy: {
            completedAt: 'desc',
          },
          select: { id: true },
        });

      if (latest) {
        const terms =
          this.significantWords(query);
        const pages =
          await this.prisma.crawlPage.findMany(
            {
              where: {
                crawlId: latest.id,
              },
              select: {
                url: true,
                title: true,
              },
              take: 500,
            },
          );

        internalLinks = pages
          .map((page) => {
            const haystack =
              `${page.title ?? ''} ${page.url}`.toLowerCase();
            const hits = terms.filter(
              (term) =>
                haystack.includes(
                  term,
                ),
            ).length;

            return { page, hits };
          })
          .filter(
            (entry) =>
              entry.hits > 0,
          )
          .sort(
            (a, b) =>
              b.hits - a.hits,
          )
          .slice(0, 5)
          .map((entry) => ({
            title:
              entry.page.title ??
              null,
            url: entry.page.url,
          }));

        if (internalLinks.length > 0) {
          evidenceSources.push(
            `${internalLinks.length} existing page(s) from the latest crawl for internal linking`,
          );
        } else {
          limitations.push(
            'No existing crawled pages match this query for internal linking.',
          );
        }
      } else {
        limitations.push(
          'No completed crawl exists, so existing-page suggestions are unavailable.',
        );
      }
    } catch {
      limitations.push(
        'Existing content inventory is unavailable.',
      );
    }

    const aiNotes: string[] = [];

    try {
      const intel =
        await this.aiVisibilityService.getIntelligence(
          organizationId,
          dto.websiteId,
        );

      const related = (
        intel.gaps ?? []
      ).filter((gap: any) =>
        String(
          gap.queries?.join(' ') ?? '',
        )
          .toLowerCase()
          .includes(
            query.toLowerCase(),
          ),
      );

      for (const gap of related.slice(
        0,
        3,
      )) {
        aiNotes.push(
          `${gap.title}: ${gap.description}`,
        );
      }

      if (related.length > 0) {
        evidenceSources.push(
          `${related.length} AI visibility gap(s) related to this query`,
        );
      }
    } catch {
      // AI context is optional.
    }

    aiNotes.push(
      'Optimizing content does not guarantee AI citations. Treat AI visibility as observed, never promised.',
    );

    limitations.push(
      'SERP evidence is unavailable: no SERP provider is connected. Competitor review is manual.',
    );

    const businessName =
      context?.profile?.businessName ??
      website.name;
    const offerings: string[] = [
      ...(context?.offerings?.services ??
        []),
      ...(context?.offerings?.products ??
        []),
    ].slice(0, 4);
    const audience: string | null =
      context?.priorities
        ?.targetAudience ?? null;
    const goal: string | null =
      context?.priorities?.primaryGoal ??
      null;
    const place =
      locations[0] ?? null;

    const payload = this.buildBriefPayload(
      {
        query,
        intent,
        intents,
        businessName,
        offerings,
        audience,
        goal,
        place,
        gscRow,
        gscPage,
        trackedCompetitors,
        internalLinks,
        aiNotes,
      },
    );

    if (!itemId) {
      const created =
        await this.prisma.contentItem.create(
          {
            data: {
              organizationId,
              websiteId: dto.websiteId,
              title:
                payload.recommendedTitle,
              targetQuery: query,
              intent,
              pageUrl: gscPage,
              status: 'BRIEF',
            },
            select: { id: true },
          },
        );

      itemId = created.id;
    } else {
      await this.prisma.contentItem.update(
        {
          where: { id: itemId },
          data: {
            targetQuery: query,
            intent,
            status: 'BRIEF',
            ...(gscPage
              ? { pageUrl: gscPage }
              : {}),
          },
        },
      );
    }

    const brief =
      await this.prisma.contentBrief.create(
        {
          data: {
            organizationId,
            websiteId: dto.websiteId,
            itemId,
            targetQuery: query,
            intent,
            payload: payload as any,
            evidence: {
              sources: evidenceSources,
              serp: serpStatus(),
            } as any,
          },
        },
      );

    return {
      ...brief,
      limitations,
      serp: serpStatus(),
    };
  }

  private buildBriefPayload(input: {
    query: string;
    intent: SearchIntent;
    intents: SearchIntent[];
    businessName: string;
    offerings: string[];
    audience: string | null;
    goal: string | null;
    place: string | null;
    gscRow: any;
    gscPage: string | null;
    trackedCompetitors: Array<{
      name: string;
      domain: string;
      url: string;
    }>;
    internalLinks: Array<{
      title: string | null;
      url: string;
    }>;
    aiNotes: string[];
  }): Record<string, any> {
    const {
      query,
      intent,
      businessName,
      offerings,
      audience,
      goal,
      place,
    } = input;

    const offeringLine =
      offerings.length > 0
        ? offerings.join(', ')
        : null;

    const outline: string[] = [];

    if (
      intent === 'COMPARISON' ||
      intent === 'ALTERNATIVES'
    ) {
      outline.push(
        `Verdict first: ${query} in one paragraph`,
        'Option A: strengths and limits',
        'Option B: strengths and limits',
        'Side-by-side comparison',
        `Who should choose what${audience ? ` (for ${audience})` : ''}`,
        'Frequently asked questions',
      );
    } else if (
      intent === 'PROBLEM_SOLUTION'
    ) {
      outline.push(
        'Symptoms and how to confirm the problem',
        'Common causes',
        'Step-by-step fixes',
        'When to call an expert',
        'Frequently asked questions',
      );
    } else if (
      intent === 'TRANSACTIONAL' ||
      intent === 'COMMERCIAL'
    ) {
      outline.push(
        `The problem behind "${query}"`,
        'Available options',
        offeringLine
          ? `Why ${businessName}: ${offeringLine}`
          : `Why ${businessName}`,
        'Pricing and engagement factors',
        place
          ? `Proof and service area: ${place}`
          : 'Proof and trust signals',
        'Frequently asked questions',
        'Next step and contact',
      );
    } else {
      outline.push(
        `Direct answer: ${query}`,
        'Key concepts a beginner must grasp',
        offeringLine
          ? `How it relates to ${offeringLine}`
          : 'How it works in practice',
        'Common mistakes to avoid',
        'Frequently asked questions',
        'What to do next',
      );
    }

    if (place) {
      outline.splice(
        outline.length - 1,
        0,
        `Local angle: ${place}`,
      );
    }

    const questions = [
      `What is ${query}?`,
      ...(offeringLine
        ? [
            `How does ${businessName} handle ${query}?`,
          ]
        : []),
      ...(place
        ? [
            `Where in ${place} does this apply?`,
          ]
        : []),
      `What mistakes do people make with ${query}?`,
      `What should I do next about ${query}?`,
    ].slice(0, 6);

    const recommendedTitle =
      intent === 'TRANSACTIONAL' ||
      intent === 'COMMERCIAL'
        ? `${this.titleCase(query)} | ${businessName}`
        : `${this.titleCase(query)} — Explained`;

    return {
      targetQuery: query,
      intent,
      intents: input.intents,
      businessGoal: goal,
      targetAudience: audience,
      recommendedTitle,
      angle:
        input.gscRow &&
        Number(
          input.gscRow.position ?? 0,
        ) > 0 &&
        Number(
          input.gscRow.position ?? 0,
        ) <= 20
          ? `Strengthen the ranking page (GSC position ${input.gscRow.position}) rather than starting from zero.`
          : 'No ranking page evidence; treat as new or weak coverage.',
      contentType:
        intent === 'TRANSACTIONAL' ||
        intent === 'COMMERCIAL'
          ? 'Service / conversion page'
          : intent === 'COMPARISON' ||
              intent === 'ALTERNATIVES'
            ? 'Comparison guide'
            : 'Informational guide with conversion path',
      outline,
      subtopics: outline.slice(0, 4),
      questionsToAnswer: questions,
      internalLinks:
        input.internalLinks,
      competitorNotes:
        input.trackedCompetitors.map(
          (competitor) => ({
            name: competitor.name,
            domain: competitor.domain,
            url: competitor.url,
            note: 'Manually review this competitor result before publishing.',
          }),
        ),
      aiVisibilityNotes:
        input.aiNotes,
      cta: goal
        ? `End with one action tied to the business goal: ${goal}.`
        : 'End with one clear next step (contact, quote, or related guide).',
      conversionGoal: goal,
      gscEvidence: input.gscRow
        ? {
            clicks: Number(
              input.gscRow.clicks ??
                0,
            ),
            impressions: Number(
              input.gscRow.impressions ??
                0,
            ),
            ctr: Number(
              input.gscRow.ctr ?? 0,
            ),
            position: Number(
              input.gscRow.position ??
                0,
            ),
          }
        : null,
      rankingPage:
        input.gscPage,
    };
  }

  private titleCase(value: string): string {
    return value
      .split(/\s+/)
      .map((word) =>
        word
          ? word[0].toUpperCase() +
            word.slice(1)
          : word,
      )
      .join(' ');
  }

  async removeBrief(
    organizationId: string,
    id: string,
  ) {
    const existing =
      await this.prisma.contentBrief.findFirst(
        {
          where: {
            id,
            organizationId,
          },
          select: { id: true },
        },
      );

    if (!existing) {
      throw new NotFoundException(
        'Content brief not found',
      );
    }

    await this.prisma.contentBrief.delete({
      where: { id },
    });

    return { success: true, id };
  }

  async listBriefs(
    organizationId: string,
    websiteId: string,
  ) {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );

    const briefs =
      await this.prisma.contentBrief.findMany(
        {
          where: {
            organizationId,
            websiteId,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 100,
        },
      );

    return {
      total: briefs.length,
      serp: serpStatus(),
      briefs,
    };
  }

  async getBrief(
    organizationId: string,
    id: string,
  ) {
    const brief =
      await this.prisma.contentBrief.findFirst(
        {
          where: {
            id,
            organizationId,
          },
        },
      );

    if (!brief) {
      throw new NotFoundException(
        'Content brief not found',
      );
    }

    return {
      ...brief,
      serp: serpStatus(),
    };
  }

  // =========================================================
  // METERED AI GENERATION (real provider, real budget)
  // =========================================================

  private async consumeAiCredits(
    organizationId: string,
    amount: number,
  ): Promise<void> {
    const subscription =
      await this.billingService.getSubscription(
        organizationId,
      );

    if (!subscription) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const used =
        await this.prisma.contentDraft.count(
          {
            where: {
              organizationId,
              humanCreated: false,
              createdAt: {
                gte: monthStart,
              },
            },
          },
        );

      /*
       * Draft rows are the spend unit on free
       * workspaces; cost is enforced by capping
       * generations, not by estimating tokens.
       */
      const freeAllowance =
        FREE_MONTHLY_AI_CREDITS;

      if (used >= freeAllowance) {
        throw new ForbiddenException({
          code: 'LIMIT_REACHED',
          message:
            'Monthly AI generation allowance reached. Upgrade your plan to continue.',
          metric: 'AI_CREDITS',
          used,
          limit: freeAllowance,
        });
      }

      return;
    }

    try {
      await this.billingService.consumeUsage(
        organizationId,
        'AI_CREDITS',
        amount,
      );
    } catch (error: any) {
      throw new ForbiddenException({
        code: 'LIMIT_REACHED',
        message:
          error?.message ??
          'AI generation allowance reached. Upgrade your plan to continue.',
        metric: 'AI_CREDITS',
      });
    }
  }

  private providerHttpStatus(
    code: string,
  ) {
    switch (code) {
      case 'PROVIDER_NOT_CONFIGURED':
        return HttpStatus.SERVICE_UNAVAILABLE;
      case 'INVALID_PROVIDER_KEY':
        return HttpStatus.UNPROCESSABLE_ENTITY;
      case 'RATE_LIMITED':
      case 'QUOTA_EXCEEDED':
        return HttpStatus.TOO_MANY_REQUESTS;
      case 'PROVIDER_TIMEOUT':
        return HttpStatus.GATEWAY_TIMEOUT;
      default:
        return HttpStatus.BAD_GATEWAY;
    }
  }

  async generate(
    organizationId: string,
    dto: GenerateDto,
  ) {
    const website =
      await this.verifyWebsite(
        organizationId,
        dto.websiteId,
      );

    const provider =
      this.providerRegistry.get(
        dto.provider as
          | 'GEMINI'
          | 'OPENAI',
      );

    if (!provider) {
      throw new BadRequestException(
        `Provider ${dto.provider} is not available for generation`,
      );
    }

    if (!provider.isConfigured()) {
      throw new HttpException(
        {
          code: 'PROVIDER_NOT_CONFIGURED',
          provider: provider.id,
          message: `${provider.displayName} is not configured. Set the provider API key on the backend.`,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    let item: any = null;

    if (dto.itemId?.trim()) {
      item =
        await this.prisma.contentItem.findFirst(
          {
            where: {
              id: dto.itemId.trim(),
              organizationId,
              websiteId: dto.websiteId,
            },
          },
        );

      if (!item) {
        throw new NotFoundException(
          'Content item not found',
        );
      }
    }

    let brief: any = null;

    if (dto.briefId?.trim()) {
      brief =
        await this.prisma.contentBrief.findFirst(
          {
            where: {
              id: dto.briefId.trim(),
              organizationId,
              websiteId: dto.websiteId,
            },
          },
        );

      if (!brief) {
        throw new NotFoundException(
          'Content brief not found',
        );
      }
    }

    const cost =
      MODE_CREDIT_COST[dto.mode] ?? 1;

    await this.consumeAiCredits(
      organizationId,
      cost,
    );

    let context: any = null;

    try {
      context =
        await this.businessBrainService.getBusinessContext(
          organizationId,
          dto.websiteId,
        );
    } catch {
      context = null;
    }

    const businessName =
      context?.profile?.businessName ??
      website.name;
    const audience =
      context?.priorities
        ?.targetAudience ??
      'the target audience';

    const briefPayload: Record<
      string,
      any
    > =
      (brief?.payload as any) ?? {};

    const prompt = this.buildGenerationPrompt(
      {
        mode: dto.mode,
        businessName,
        audience,
        query:
          item?.targetQuery ??
          brief?.targetQuery ??
          null,
        outline: Array.isArray(
          briefPayload.outline,
        )
          ? briefPayload.outline
          : [],
        topic: dto.topic?.trim() || null,
        input: dto.input?.trim() || null,
      },
    );

    let output: Awaited<
      ReturnType<
        typeof provider.executePrompt
      >
    >;

    try {
      output =
        await provider.executePrompt({
          prompt,
          maxOutputTokens:
            dto.mode === 'DRAFT'
              ? 2048
              : 1024,
        });
    } catch (error) {
      if (error instanceof AiProviderError) {
        throw new HttpException(
          {
            code: error.code,
            provider: error.provider,
            message: error.message,
          },
          this.providerHttpStatus(
            error.code,
          ),
        );
      }

      throw error;
    }

    const existingCount =
      await this.prisma.contentDraft.count(
        {
          where: {
            organizationId,
            websiteId: dto.websiteId,
            itemId: item?.id ?? null,
            mode: dto.mode,
          },
        },
      );

    const draft =
      await this.prisma.contentDraft.create(
        {
          data: {
            organizationId,
            websiteId: dto.websiteId,
            itemId: item?.id ?? null,
            briefId: brief?.id ?? null,
            mode: dto.mode,
            provider: provider.id,
            model: output.model,
            humanCreated: false,
            title:
              item?.title ??
              brief?.targetQuery ??
              null,
            content: output.text.slice(
              0,
              20000,
            ),
            version:
              existingCount + 1,
          },
        },
      );

    if (item) {
      await this.prisma.contentItem.update(
        {
          where: { id: item.id },
          data: { status: 'DRAFT' },
        },
      );
    }

    return {
      ...draft,
      resultLabel:
        'LIVE_PROVIDER_RESULT' as const,
      usage: output.usage,
      latencyMs: output.latencyMs,
    };
  }

  private buildGenerationPrompt(input: {
    mode: string;
    businessName: string;
    audience: string;
    query: string | null;
    outline: string[];
    topic: string | null;
    input: string | null;
  }): string {
    const lines = [
      `You write for ${input.businessName}. Audience: ${input.audience}.`,
      'Rules: be specific and practical. Do not invent statistics, studies, prices, or competitor claims. If unsure, say what is unknown.',
    ];

    if (input.query) {
      lines.push(
        `Target search query: "${input.query}".`,
      );
    }

    if (input.outline.length > 0) {
      lines.push(
        `Approved outline:\n${input.outline.map((section, index) => `${index + 1}. ${section}`).join('\n')}`,
      );
    }

    switch (input.mode) {
      case 'OUTLINE':
        lines.push(
          `Write a detailed article outline for "${input.topic ?? input.query ?? 'the topic'}". Sections with 2-3 bullets each. Plain text, no fluff.`,
        );
        break;
      case 'DRAFT':
        lines.push(
          'Write the full article following the approved outline. Plain text with clear headings. End with one action step.',
        );
        break;
      case 'SECTION':
        lines.push(
          `Write one section on: "${input.topic ?? 'the requested section'}". Concrete and concise.`,
        );
        break;
      case 'FAQ':
        lines.push(
          `Write 5 frequently asked questions with direct answers${input.query ? ` about "${input.query}"` : ''}.`,
        );
        break;
      case 'REWRITE':
        lines.push(
          `Rewrite the following text for clarity and search-intent alignment. Keep all facts identical:\n\n${input.input ?? ''}`,
        );
        break;
      default:
        lines.push(
          `Help with: ${input.topic ?? input.query ?? 'content'}.`,
        );
        break;
    }

    return lines.join('\n\n');
  }

  async listDrafts(
    organizationId: string,
    websiteId: string,
    itemId?: string,
  ) {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );

    const drafts =
      await this.prisma.contentDraft.findMany(
        {
          where: {
            organizationId,
            websiteId,
            ...(itemId
              ? { itemId }
              : {}),
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 100,
        },
      );

    return {
      total: drafts.length,
      aiGenerated: drafts.filter(
        (draft) =>
          !draft.humanCreated,
      ).length,
      drafts,
    };
  }

  async getDraft(
    organizationId: string,
    id: string,
  ) {
    const draft =
      await this.prisma.contentDraft.findFirst(
        {
          where: {
            id,
            organizationId,
          },
        },
      );

    if (!draft) {
      throw new NotFoundException(
        'Content draft not found',
      );
    }

    return draft;
  }

  // =========================================================
  // OPTIMIZATION (deterministic checks, disclosed method)
  // =========================================================

  async analyzePage(
    organizationId: string,
    dto: OptimizeDto,
  ) {
    const website =
      await this.verifyWebsite(
        organizationId,
        dto.websiteId,
      );

    const pageUrl = dto.pageUrl.trim();

    if (!pageUrl) {
      throw new BadRequestException(
        'pageUrl is required',
      );
    }

    const query =
      dto.query?.trim() || null;
    const terms = query
      ? this.significantWords(query)
      : [];

    const checks: Array<{
      key: string;
      title: string;
      state:
        | 'GOOD'
        | 'ATTENTION'
        | 'MISSING'
        | 'NOT_AVAILABLE';
      evidence: string;
    }> = [];

    const latest =
      await this.prisma.crawl.findFirst({
        where: {
          websiteId: dto.websiteId,
          status: 'COMPLETED',
        },
        orderBy: {
          completedAt: 'desc',
        },
        select: { id: true },
      });

    if (!latest) {
      return {
        pageUrl,
        query,
        methodology:
          'Rule-based checks over the latest completed crawl, GSC mapping and Business Brain context. No score is invented.',
        passing: 0,
        total: 0,
        checks: [
          {
            key: 'crawl',
            title: 'Crawl data',
            state: 'NOT_AVAILABLE',
            evidence:
              'No completed crawl exists for on-page checks.',
          },
        ],
        limitations: [
          'Run a technical crawl to enable title, heading and coverage checks.',
        ],
      };
    }

    const pages =
      await this.prisma.crawlPage.findMany(
        {
          where: {
            crawlId: latest.id,
          },
          select: {
            url: true,
            title: true,
            metaDescription: true,
            h1: true,
            wordCount: true,
            internalLinks: true,
          },
          take: 2000,
        },
      );

    const target =
      pages.find(
        (page) =>
          page.url === pageUrl ||
          page.url.endsWith(pageUrl) ||
          pageUrl.endsWith(page.url),
      ) ?? null;

    if (!target) {
      checks.push({
        key: 'page_found',
        title: 'Page in crawl',
        state: 'MISSING',
        evidence:
          'This URL was not found in the latest completed crawl.',
      });
    } else {
      checks.push({
        key: 'page_found',
        title: 'Page in crawl',
        state: 'GOOD',
        evidence: `Found: ${target.url}.`,
      });

      const titleText = (
        target.title ?? ''
      ).toLowerCase();

      if (!target.title?.trim()) {
        checks.push({
          key: 'title',
          title: 'Title tag',
          state: 'MISSING',
          evidence:
            'The page has no title tag.',
        });
      } else if (
        terms.length > 0 &&
        !terms.some((term) =>
          titleText.includes(term),
        )
      ) {
        checks.push({
          key: 'title',
          title: 'Title tag',
          state: 'ATTENTION',
          evidence: `Title "${target.title}" contains none of the query terms.`,
        });
      } else {
        checks.push({
          key: 'title',
          title: 'Title tag',
          state: 'GOOD',
          evidence: `Title present${terms.length > 0 ? ' and aligned with the query' : ''}.`,
        });
      }

      if (!target.metaDescription?.trim()) {
        checks.push({
          key: 'meta',
          title: 'Meta description',
          state: 'MISSING',
          evidence:
            'No meta description; the snippet is uncontrolled.',
        });
      } else {
        checks.push({
          key: 'meta',
          title: 'Meta description',
          state: 'GOOD',
          evidence: `${target.metaDescription.length} characters present.`,
        });
      }

      const h1Text = (target.h1 ?? [])
        .join(' ')
        .toLowerCase();

      if ((target.h1 ?? []).length === 0) {
        checks.push({
          key: 'h1',
          title: 'H1 heading',
          state: 'MISSING',
          evidence:
            'The page has no H1 heading.',
        });
      } else if (
        terms.length > 0 &&
        !terms.some((term) =>
          h1Text.includes(term),
        )
      ) {
        checks.push({
          key: 'h1',
          title: 'H1 heading',
          state: 'ATTENTION',
          evidence:
            'H1 present but aligned with none of the query terms.',
        });
      } else {
        checks.push({
          key: 'h1',
          title: 'H1 heading',
          state: 'GOOD',
          evidence: `H1 present: "${(target.h1 ?? [])[0]}".`,
        });
      }

      const words =
        target.wordCount ?? 0;

      checks.push({
        key: 'depth',
        title: 'Content depth',
        state:
          words >= 600
            ? 'GOOD'
            : words >= 300
              ? 'ATTENTION'
              : 'MISSING',
        evidence: `${words} words counted. Thresholds: 600+ good, 300+ needs work, below is thin.`,
      });

      checks.push({
        key: 'internal_links',
        title: 'Internal links',
        state:
          (target.internalLinks ??
            0) >= 3
            ? 'GOOD'
            : 'ATTENTION',
        evidence: `${target.internalLinks ?? 0} internal links counted. 3+ is the working threshold.`,
      });
    }

    if (query) {
      try {
        const end = this.isoDaysAgo(1);
        const start = this.isoDaysAgo(29);
        const queryPages =
          await this.googleService.getQueryPages(
            organizationId,
            start,
            end,
          );

        const rows = queryPages.rows.filter(
          (row: any) =>
            String(
              row.query ?? '',
            ).toLowerCase() ===
              query.toLowerCase() &&
            (row.page === pageUrl ||
              pageUrl.endsWith(
                row.page,
              ) ||
              row.page.endsWith(
                pageUrl,
              )),
        );

        if (rows.length === 0) {
          checks.push({
            key: 'gsc_mapping',
            title: 'GSC query mapping',
            state: 'NOT_AVAILABLE',
            evidence:
              'No GSC query-page rows link this query to this URL in the last 28 days.',
          });
        } else {
          const clicks = rows.reduce(
            (total: number, row: any) =>
              total +
              Number(
                row.clicks ?? 0,
              ),
            0,
          );
          const impressions =
            rows.reduce(
              (
                total: number,
                row: any,
              ) =>
                total +
                Number(
                  row.impressions ??
                    0,
                ),
              0,
            );

          checks.push({
            key: 'gsc_mapping',
            title: 'GSC query mapping',
            state: 'GOOD',
            evidence: `${clicks} clicks, ${impressions} impressions across ${rows.length} GSC row(s), ${start} to ${end}.`,
          });
        }
      } catch {
        checks.push({
          key: 'gsc_mapping',
          title: 'GSC query mapping',
          state: 'NOT_AVAILABLE',
          evidence:
            'GSC is not connected or query data is unavailable.',
        });
      }
    }

    const passing = checks.filter(
      (check) =>
        check.state === 'GOOD',
    ).length;

    return {
      pageUrl,
      query,
      website: {
        name: website.name,
        url: website.url,
      },
      methodology:
        'Rule-based checks over the latest completed crawl (title/meta/H1/depth/links with disclosed thresholds) plus optional GSC query mapping. Passing means X/Y checks GOOD. No invented SEO score.',
      passing,
      total: checks.length,
      checks,
      limitations: [
        'Checks reflect the latest crawl snapshot, not the live page.',
        'No SERP comparison: no SERP provider is connected.',
      ],
    };
  }

  // =========================================================
  // REFRESH (period-over-period GSC evidence only)
  // =========================================================

  async getRefreshQueue(
    organizationId: string,
    websiteId?: string,
  ) {
    const end = this.isoDaysAgo(1);
    const mid = this.isoDaysAgo(29);
    const start = this.isoDaysAgo(57);

    let current: any;
    let prior: any;

    try {
      [current, prior] =
        await Promise.all([
          this.googleService.getSearchQueries(
            organizationId,
            mid,
            end,
          ),
          this.googleService.getSearchQueries(
            organizationId,
            start,
            this.isoDaysAgo(30),
          ),
        ]);
    } catch (error: any) {
      throw new HttpException(
        {
          code: 'REFRESH_UNAVAILABLE',
          message:
            'GSC query data is unavailable, so refresh evidence cannot be computed.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const priorByQuery = new Map<
      string,
      any
    >();

    for (const row of prior.rows) {
      priorByQuery.set(
        String(
          row.query ?? '',
        ).toLowerCase(),
        row,
      );
    }

    const candidates: any[] = [];

    for (const row of current.rows) {
      const key = String(
        row.query ?? '',
      ).toLowerCase();
      const before =
        priorByQuery.get(key);

      if (!before) {
        continue;
      }

      const clicksBefore = Number(
        before.clicks ?? 0,
      );
      const clicksNow = Number(
        row.clicks ?? 0,
      );
      const imprBefore = Number(
        before.impressions ?? 0,
      );
      const imprNow = Number(
        row.impressions ?? 0,
      );

      const clicksDecline =
        clicksBefore >= 5 &&
        clicksNow <
          clicksBefore * 0.7;
      const imprDecline =
        imprBefore >= 50 &&
        imprNow < imprBefore * 0.6;

      if (
        !clicksDecline &&
        !imprDecline
      ) {
        continue;
      }

      candidates.push({
        query: row.query,
        clicksBefore,
        clicksNow,
        impressionsBefore: imprBefore,
        impressionsNow: imprNow,
        position: Number(
          row.position ?? 0,
        ),
        reason: clicksDecline
          ? `Clicks fell ${clicksBefore} to ${clicksNow} over comparable 28-day windows.`
          : `Impressions fell ${imprBefore} to ${imprNow} over comparable 28-day windows.`,
      });
    }

    candidates.sort(
      (a, b) =>
        b.clicksBefore -
        b.clicksNow -
        (a.clicksBefore -
          a.clicksNow),
    );

    const top = candidates.slice(0, 20);

    const persisted: any[] = [];

    if (websiteId) {
      await this.verifyWebsite(
        organizationId,
        websiteId,
      );

      for (const candidate of top) {
        const existing =
          await this.prisma.recommendation.findFirst(
            {
              where: {
                organizationId,
                websiteId,
                source: 'CONTENT',
                type: 'REFRESH_REQUIRED',
                metadata: {
                  path: ['query'],
                  equals:
                    candidate.query,
                },
              },
            },
          );

        const data = {
          organizationId,
          websiteId,
          source: 'CONTENT',
          type: 'REFRESH_REQUIRED',
          title: `Refresh content for "${candidate.query}"`,
          description: candidate.reason,
          priority: 'MEDIUM',
          impact: 'MEDIUM',
          effort: 'MEDIUM',
          actionText:
            'Review the ranking page against current intent, update stale sections, and resubmit for indexing after republishing.',
          metadata: {
            query: candidate.query,
            clicksBefore:
              candidate.clicksBefore,
            clicksNow:
              candidate.clicksNow,
            impressionsBefore:
              candidate.impressionsBefore,
            impressionsNow:
              candidate.impressionsNow,
            position:
              candidate.position,
          },
        };

        const recommendation = existing
          ? await this.prisma.recommendation.update(
              {
                where: {
                  id: existing.id,
                },
                data,
              },
            )
          : await this.prisma.recommendation.create(
              {
                data,
              },
            );

        persisted.push({
          ...candidate,
          recommendationId:
            recommendation.id,
        });
      }
    }

    return {
      currentRange: { start: mid, end },
      priorRange: {
        start,
        end: this.isoDaysAgo(30),
      },
      total: top.length,
      refresh: top,
      persisted,
    };
  }

  // =========================================================
  // PUBLISHING (honest: no integration connected)
  // =========================================================

  publishingStatus() {
    return {
      status: 'NOT_CONNECTED' as const,
      connected: false,
      providers: [],
      supported: ['COPY', 'EXPORT', 'MARK_AS_READY'],
      limitation:
        'No publishing integration (WordPress, Webflow, Shopify) is connected. Content can be copied, exported, or marked ready/published by explicit confirmation only.',
    };
  }

  async markReady(
    organizationId: string,
    id: string,
  ) {
    const item =
      await this.prisma.contentItem.findFirst(
        {
          where: {
            id,
            organizationId,
          },
          select: { id: true },
        },
      );

    if (!item) {
      throw new NotFoundException(
        'Content item not found',
      );
    }

    return this.prisma.contentItem.update(
      {
        where: { id },
        data: { status: 'READY' },
      },
    );
  }

  async markPublished(
    organizationId: string,
    id: string,
    confirmed: boolean,
    pageUrl?: string,
  ) {
    if (!confirmed) {
      throw new BadRequestException(
        'Explicit confirmation is required to mark content published',
      );
    }

    const item =
      await this.prisma.contentItem.findFirst(
        {
          where: {
            id,
            organizationId,
          },
          select: { id: true },
        },
      );

    if (!item) {
      throw new NotFoundException(
        'Content item not found',
      );
    }

    return this.prisma.contentItem.update(
      {
        where: { id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          ...(pageUrl?.trim()
            ? {
                pageUrl:
                  pageUrl.trim(),
              }
            : {}),
        },
      },
    );
  }

  // =========================================================
  // PERFORMANCE (page-level GSC + attributed leads/revenue)
  // =========================================================

  async getPerformance(
    organizationId: string,
    websiteId: string,
    pageUrl: string,
  ) {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );

    const url = pageUrl.trim();

    if (!url) {
      throw new BadRequestException(
        'pageUrl is required',
      );
    }

    const limitations: string[] = [];
    let gsc: any = null;

    try {
      const end = this.isoDaysAgo(1);
      const start = this.isoDaysAgo(29);
      const [pages, queryPages] =
        await Promise.all([
          this.googleService.getSearchPages(
            organizationId,
            start,
            end,
          ),
          this.googleService.getQueryPages(
            organizationId,
            start,
            end,
          ),
        ]);

      const pageRow = pages.rows.find(
        (row: any) =>
          row.page === url ||
          url.endsWith(row.page) ||
          row.page.endsWith(url),
      );

      const rows = queryPages.rows.filter(
        (row: any) =>
          row.page === url ||
          url.endsWith(row.page) ||
          row.page.endsWith(url),
      );

      if (!pageRow && rows.length === 0) {
        gsc = null;
        limitations.push(
          'No GSC page rows match this URL in the last 28 days.',
        );
      } else {
        const clicks =
          (pageRow
            ? Number(
                pageRow.clicks ?? 0,
              )
            : 0) ||
          rows.reduce(
            (total: number, row: any) =>
              total +
              Number(
                row.clicks ?? 0,
              ),
            0,
          );
        const impressions =
          (pageRow
            ? Number(
                pageRow.impressions ??
                  0,
              )
            : 0) ||
          rows.reduce(
            (total: number, row: any) =>
              total +
              Number(
                row.impressions ?? 0,
              ),
            0,
          );

        gsc = {
          range: { start, end },
          clicks,
          impressions,
          ctr: pageRow
            ? Number(
                pageRow.ctr ?? 0,
              )
            : null,
          position: pageRow
            ? Number(
                pageRow.position ??
                  0,
              )
            : null,
          queries: rows.length,
          source: 'LIVE',
        };
      }
    } catch {
      limitations.push(
        'GSC is not connected or page data is unavailable.',
      );
    }

    const leads =
      await this.prisma.lead.findMany({
        where: {
          websiteId,
          landingPage: url,
        },
        select: {
          id: true,
          converted: true,
          estimatedValue: true,
          Revenue: {
            select: {
              amount: true,
              currency: true,
              status: true,
            },
          },
        },
      });

    const converted = leads.filter(
      (lead) => lead.converted,
    ).length;

    let revenueTotal = 0;
    let revenueCurrency: string | null =
      null;

    for (const lead of leads) {
      for (const revenue of lead.Revenue) {
        revenueTotal += Number(
          revenue.amount ?? 0,
        );
        revenueCurrency =
          revenueCurrency ??
          revenue.currency ??
          null;
      }
    }

    if (leads.length === 0) {
      limitations.push(
        'No leads attribute this landing page, so content-attributed revenue is not measurable.',
      );
    }

    return {
      pageUrl: url,
      gsc,
      leads: {
        total: leads.length,
        converted,
        source: 'RENKOO_LEADS',
      },
      revenue:
        leads.length === 0
          ? {
              state: 'NOT_MEASURABLE',
              reason:
                'No attributed leads or revenue records exist for this URL.',
            }
          : {
              state: 'LIVE',
              total: revenueTotal,
              currency: revenueCurrency,
              source: 'RENKOO_ATTRIBUTION',
            },
      limitations,
    };
  }
}
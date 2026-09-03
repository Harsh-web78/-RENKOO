import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ComparisonService } from '../comparison/comparison.service';
import { GoogleService } from '../google/google.service';

type Priority = 'HIGH' | 'MEDIUM' | 'LOW';

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly comparisonService: ComparisonService,
    private readonly googleService: GoogleService,
  ) {}

  async getRecommendations(
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
      throw new NotFoundException(
        'Competitor not found',
      );
    }

    const comparison =
      await this.comparisonService.compare(
        organizationId,
        competitorId,
      );

    const recommendations: any[] = [];

    for (const opportunity of comparison.opportunities) {
      const priority =
        opportunity.priority as Priority;

      const existing =
        await this.prisma.recommendation.findFirst({
          where: {
            organizationId,
            competitorId,
            source: 'COMPETITOR_COMPARISON',
            type: opportunity.type,
            title: opportunity.title,
          },
        });

      const data = {
        organizationId,
        websiteId: competitor.websiteId,
        competitorId: competitor.id,
        source: 'COMPETITOR_COMPARISON',
        type: opportunity.type,
        title: opportunity.title,
        description: opportunity.description,
        priority,
        impact: this.getImpact(priority),
        effort: this.getEffort(opportunity.type),
        actionText: this.buildAction(opportunity),
        metadata: opportunity,
      };

      const saved =
        existing
          ? await this.prisma.recommendation.update({
              where: { id: existing.id },
              data,
            })
          : await this.prisma.recommendation.create({
              data,
            });

      recommendations.push(saved);
    }

    const crawl =
      await this.prisma.crawl.findFirst({
        where: {
          websiteId: competitor.websiteId,
          status: 'COMPLETED',
        },
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          pages: {
            include: {
              issues: true,
            },
          },
        },
      });

    if (crawl) {
      for (const page of crawl.pages) {
        for (const issue of page.issues) {
          const priority =
            issue.severity as Priority;

          const existing =
            await this.prisma.recommendation.findFirst({
              where: {
                organizationId,
                websiteId: competitor.websiteId,
                source: 'SEO_AUDIT',
                type: issue.code,
                title: issue.title,
                pageUrl: page.url,
              },
            });

          const data = {
            organizationId,
            websiteId: competitor.websiteId,
            competitorId: competitor.id,
            source: 'SEO_AUDIT',
            type: issue.code,
            title: issue.title,
            description: issue.description,
            priority,
            impact: this.getImpact(priority),
            effort: 'MEDIUM',
            actionText: issue.recommendation,
            pageUrl: page.url,
            metadata: {
              crawlId: crawl.id,
              pageId: page.id,
            },
          };

          const saved =
            existing
              ? await this.prisma.recommendation.update({
                  where: { id: existing.id },
                  data,
                })
              : await this.prisma.recommendation.create({
                  data,
                });

          recommendations.push(saved);
        }
      }
    }

    const sorted =
      recommendations.sort(
        (a, b) =>
          this.priorityValue(b.priority) -
          this.priorityValue(a.priority),
      );

    return {
      competitor: {
        id: competitor.id,
        name: competitor.name,
        url: competitor.url,
      },
      summary: {
        total: sorted.length,
        high: sorted.filter(
          r => r.priority === 'HIGH',
        ).length,
        medium: sorted.filter(
          r => r.priority === 'MEDIUM',
        ).length,
        low: sorted.filter(
          r => r.priority === 'LOW',
        ).length,
      },
      recommendations: sorted.slice(0, 100),
    };
  }

  private buildAction(opportunity: any): string {
    if (opportunity.type === 'METRIC_GAP') {
      const metric =
        opportunity.metric ?? '';

      if (
        metric.toLowerCase().includes('title')
      ) {
        return 'Audit missing and weak title tags, then create unique intent-focused titles.';
      }

      if (
        metric.toLowerCase().includes('meta')
      ) {
        return 'Add and improve unique meta descriptions for important pages.';
      }

      if (
        metric.toLowerCase().includes('structured')
      ) {
        return 'Identify relevant Schema.org types and add valid structured data.';
      }

      if (
        metric.toLowerCase().includes('internal')
      ) {
        return 'Add contextual internal links from relevant pages to priority pages.';
      }

      if (
        metric.toLowerCase().includes('word')
      ) {
        return 'Expand thin pages with useful search-intent-focused content.';
      }
    }

    return opportunity.description;
  }

  private getImpact(
    priority: Priority,
  ): Priority {
    return priority;
  }

  private getEffort(
    type: string,
  ): Priority {
    return type === 'PAGE_GAP'
      ? 'MEDIUM'
      : 'LOW';
  }

  private priorityValue(
    priority: Priority,
  ): number {
    if (priority === 'HIGH') return 3;
    if (priority === 'MEDIUM') return 2;
    return 1;
  }


  /*
   * =========================================================
   * UNIFIED OPPORTUNITY ENGINE
   * =========================================================
   */

  private async syncGoogleSeoRecommendations(
    organizationId: string,
    websiteId: string,
  ) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 28);

    const formatDate = (date: Date) =>
      date.toISOString().slice(0, 10);

    const result =
      await this.googleService.getSeoOpportunities(
        organizationId,
        formatDate(startDate),
        formatDate(endDate),
      );

    const synced: any[] = [];

    for (const opportunity of result.opportunities ?? []) {
      const score = Number(opportunity.score ?? 0);

      const priority: Priority =
        score >= 75
          ? 'HIGH'
          : score >= 45
            ? 'MEDIUM'
            : 'LOW';

      const type =
        opportunity.type || 'SEO_OPPORTUNITY';

      const pageUrl =
        opportunity.page || undefined;

      const title =
        `SEO opportunity: "${opportunity.query}"`;

      const description =
        `Google Search Console identified a ${type.toLowerCase().replace(/_/g, ' ')} opportunity for "${opportunity.query}" at position ${Number(opportunity.position ?? 0).toFixed(1)}.`;

      const actionText =
        opportunity.recommendation ||
        `Improve search performance for "${opportunity.query}".`;

      const existing =
        await this.prisma.recommendation.findFirst({
          where: {
            organizationId,
            websiteId,
            source: 'GSC_SEO',
            type,
            title,
            pageUrl,
          },
        });

      const data = {
        organizationId,
        websiteId,
        source: 'GSC_SEO',
        type,
        title,
        description,
        priority,
        impact: this.getImpact(priority),
        effort: 'MEDIUM' as Priority,
        actionText,
        pageUrl,
        metadata: {
          query: opportunity.query,
          googleOpportunityType: opportunity.type,
          score,
          position: opportunity.position,
          impressions: opportunity.impressions,
          clicks: opportunity.clicks,
          ctr: opportunity.ctr,
          cannibalization:
            opportunity.cannibalization,
          rankingPages:
            opportunity.rankingPages,
          source: 'GOOGLE_SEARCH_CONSOLE',
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
        },
      };

      const saved = existing
        ? await this.prisma.recommendation.update({
            where: { id: existing.id },
            data,
          })
        : await this.prisma.recommendation.create({
            data,
          });

      synced.push(saved);
    }

    return synced;
  }
  async getUnifiedOpportunities(
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
        select: {
          id: true,
          name: true,
          url: true,
        },
      });

    if (!website) {
      throw new NotFoundException(
        'Website not found',
      );
    }

    const [
      recommendations,
      backlinkOpportunities,
      geoQueries,
    ] = await Promise.all([
      this.prisma.recommendation.findMany({
        where: {
          organizationId,
          websiteId,
          status: {
            not: 'DISMISSED',
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
        take: 200,
      }),

      this.prisma.backlinkOpportunity.findMany({
        where: {
          websiteId,
          status: 'OPEN',
        },
        orderBy: [
          {
            opportunityScore: 'desc',
          },
          {
            createdAt: 'desc',
          },
        ],
        take: 200,
      }),

      this.prisma.geoQuery.findMany({
        where: {
          websiteId,
          OR: [
            { mentioned: false },
            { cited: false },
          ],
        },
        orderBy: {
          checkedAt: 'desc',
        },
        take: 200,
      }),
    ]);

    const opportunities: any[] = [];

    for (const item of recommendations) {
      const priority =
        item.priority === 'HIGH'
          ? 'HIGH'
          : item.priority === 'MEDIUM'
            ? 'MEDIUM'
            : 'LOW';

      const metadata =
        item.metadata &&
        typeof item.metadata === 'object'
          ? item.metadata as Record<string, any>
          : null;

      const score =
        item.source === 'GSC_SEO' &&
        typeof metadata?.score === 'number'
          ? Math.max(
              0,
              Math.min(100, metadata.score),
            )
          : priority === 'HIGH'
            ? 80
            : priority === 'MEDIUM'
              ? 55
              : 30;

      opportunities.push({
        id: item.id,
        source: item.source,
        sourceId: item.id,
        type: item.type,
        title: item.title,
        description: item.description,
        recommendation:
          item.actionText ||
          item.description,
        priority,
        score,
        impact:
          item.impact ||
          priority,
        effort:
          item.effort ||
          'MEDIUM',
        status: item.status,
        pageUrl:
          item.pageUrl || null,
        metadata:
          item.metadata || null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      });
    }

    for (const item of backlinkOpportunities) {
      const priority =
        item.priority === 'HIGH'
          ? 'HIGH'
          : item.priority === 'MEDIUM'
            ? 'MEDIUM'
            : 'LOW';

      opportunities.push({
        id: `backlink:${item.id}`,
        source: 'BACKLINK',
        sourceId: item.id,
        type:
          item.opportunityType ||
          'RESOURCE_LINK',
        title:
          `Backlink opportunity: ${item.sourceDomain}`,
        description:
          `Potential backlink opportunity from ${item.sourceDomain}.`,
        recommendation:
          'Evaluate the referring domain and pursue a relevant contextual backlink.',
        priority,
        score: Math.max(
          0,
          Math.min(
            100,
            Number(item.opportunityScore || 0),
          ),
        ),
        impact: priority,
        effort: 'MEDIUM',
        status: item.status,
        pageUrl: null,
        metadata: {
          sourceDomain:
            item.sourceDomain,
          opportunityType:
            item.opportunityType,
        },
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      });
    }

    for (const item of geoQueries) {
      const bothMissing =
        !item.mentioned &&
        !item.cited;

      const priority =
        bothMissing
          ? 'HIGH'
          : 'MEDIUM';

      const score =
        bothMissing
          ? 80
          : 60;

      opportunities.push({
        id: `geo:${item.id}`,
        source: 'GEO',
        sourceId: item.id,
        type:
          bothMissing
            ? 'GEO_VISIBILITY'
            : 'GEO_CITATION',
        title:
          bothMissing
            ? `Improve AI visibility for "${item.query}"`
            : `Improve AI citation for "${item.query}"`,
        description:
          bothMissing
            ? 'The business is neither mentioned nor cited for this tracked query.'
            : 'The business is mentioned but is not receiving a citation for this tracked query.',
        recommendation:
          bothMissing
            ? 'Improve entity relevance, location-specific content and authority signals.'
            : 'Strengthen citation-worthy content and authority signals.',
        priority,
        score,
        impact: priority,
        effort: 'MEDIUM',
        status: 'OPEN',
        pageUrl: null,
        metadata: {
          query: item.query,
          engine: item.engine,
          mentioned: item.mentioned,
          cited: item.cited,
          position: item.position,
        },
        createdAt: item.checkedAt,
        updatedAt: item.checkedAt,
      });
    }

    const unique =
      new Map<string, any>();

    for (const opportunity of opportunities) {
      const key =
        [
          opportunity.source,
          opportunity.type,
          opportunity.title,
          opportunity.pageUrl || '',
        ].join('|');

      const existing =
        unique.get(key);

      if (
        !existing ||
        opportunity.score >
          existing.score
      ) {
        unique.set(
          key,
          opportunity,
        );
      }
    }

    const sorted =
      Array.from(unique.values())
        .sort((a, b) => {
          const priorityValue: Record<
            'HIGH' | 'MEDIUM' | 'LOW',
            number
          > = {
            HIGH: 3,
            MEDIUM: 2,
            LOW: 1,
          };

          const priorityDifference =
            priorityValue[
              b.priority as 'HIGH' | 'MEDIUM' | 'LOW'
            ] -
            priorityValue[
              a.priority as 'HIGH' | 'MEDIUM' | 'LOW'
            ];

          if (
            priorityDifference !== 0
          ) {
            return priorityDifference;
          }

          return b.score - a.score;
        })
        .slice(0, 200);

    return {
      website,
      total: sorted.length,

      summary: {
        high: sorted.filter(
          (item) =>
            item.priority === 'HIGH',
        ).length,

        medium: sorted.filter(
          (item) =>
            item.priority === 'MEDIUM',
        ).length,

        low: sorted.filter(
          (item) =>
            item.priority === 'LOW',
        ).length,

        bySource: {
          SEO: sorted.filter(
            (item) =>
              item.source === 'SEO_AUDIT' ||
              item.source === 'CONTENT',
          ).length,

          COMPETITOR: sorted.filter(
            (item) =>
              item.source === 'COMPETITOR_COMPARISON',
          ).length,

          BACKLINK: sorted.filter(
            (item) =>
              item.source === 'BACKLINK',
          ).length,

          GEO: sorted.filter(
            (item) =>
              item.source === 'GEO' ||
              item.source === 'GEO_AUDIT',
          ).length,

          AEO: sorted.filter(
            (item) =>
              item.source === 'AEO' ||
              item.source === 'AEO_AUDIT',
          ).length,

          BUSINESS_BRAIN: sorted.filter(
            (item) =>
              item.source === 'BUSINESS_BRAIN',
          ).length,
        },
      },

      opportunities: sorted,
    };
  }

  async generateAeoRecommendations(
    organizationId: string,
    websiteId: string,
  ) {
    const website = await this.prisma.website.findFirst({
      where: {
        id: websiteId,
        organizationId,
        isActive: true,
      },
    });

    if (!website) {
      throw new NotFoundException('Website not found');
    }

    const audit = await this.prisma.aeoAudit.findFirst({
      where: { websiteId },
      orderBy: { createdAt: 'desc' },
      include: {
        AeoIssue: {
          where: { status: 'OPEN' },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!audit) {
      throw new NotFoundException(
        'Run an AEO audit before generating recommendations',
      );
    }

    const recommendations: any[] = [];

    const createOrUpdate = async (
      type: string,
      title: string,
      description: string,
      priority: Priority,
      actionText: string,
      metadata: any,
    ) => {
      const existing =
        await this.prisma.recommendation.findFirst({
          where: {
            organizationId,
            websiteId,
            source: 'AEO_AUDIT',
            type,
            title,
          },
        });

      const data = {
        organizationId,
        websiteId,
        source: 'AEO_AUDIT',
        type,
        title,
        description,
        priority,
        impact: this.getImpact(priority),
        effort: 'MEDIUM' as Priority,
        actionText,
        metadata,
      };

      return existing
        ? this.prisma.recommendation.update({
            where: { id: existing.id },
            data,
          })
        : this.prisma.recommendation.create({ data });
    };

    const issuesByType = new Map<string, number>();

    for (const issue of audit.AeoIssue) {
      issuesByType.set(
        issue.checkType,
        (issuesByType.get(issue.checkType) ?? 0) + 1,
      );
    }

    for (const [checkType, count] of issuesByType) {
      const issue =
        audit.AeoIssue.find(
          (item) => item.checkType === checkType,
        );

      if (!issue) continue;

      const priority: Priority =
        issue.severity === 'CRITICAL'
          ? 'HIGH'
          : issue.severity === 'HIGH'
            ? 'HIGH'
            : issue.severity === 'MEDIUM'
              ? 'MEDIUM'
              : 'LOW';

      let title = '';
      let description = '';
      let actionText = '';

      switch (checkType) {
        case 'STRUCTURED_DATA':
          title = 'Improve structured data for answer engines';
          description =
            'Important pages have substantial content but lack detected structured data that can help machines understand page entities and content context.';
          actionText =
            'Add accurate, relevant structured data to important pages and validate the implementation.';
          break;

        case 'ENTITY':
          title = 'Strengthen entity clarity for answer engines';
          description =
            'Important pages are missing one or more basic entity signals such as title, meta description or primary H1.';
          actionText =
            'Improve titles, meta descriptions and primary headings so each important page clearly communicates its entity and intent.';
          break;

        case 'CONTENT_DEPTH':
          title = 'Improve content depth for answer readiness';
          description =
            'Some pages do not contain enough substantive content to provide strong answer-oriented coverage.';
          actionText =
            'Expand useful, intent-focused content where additional depth genuinely helps users.';
          break;

        case 'FAQ':
          title = 'Add useful question-based content';
          description =
            'Substantial pages lack question-oriented heading structures that can make relevant answers easier to discover.';
          actionText =
            'Add genuinely useful question-based sections and concise answers where they match user intent.';
          break;

        case 'ANSWER_READINESS':
          title = 'Improve answer-oriented page structure';
          description =
            'Some substantial pages do not expose a clear structure for answer-oriented discovery.';
          actionText =
            'Organize important content into clear questions, sections and concise direct answers.';
          break;

        case 'DIRECT_ANSWER':
          title = 'Improve direct-answer coverage';
          description =
            'Some pages lack a clear question-and-answer structure suitable for direct answer extraction.';
          actionText =
            'Add concise, direct answers beneath relevant question headings.';
          break;

        default:
          title = `Resolve ${checkType.toLowerCase()} AEO issues`;
          description =
            `${count} open AEO issue${count === 1 ? '' : 's'} of type ${checkType} were detected.`;
          actionText =
            'Review and resolve the detected AEO issues on affected pages.';
      }

      recommendations.push(
        await createOrUpdate(
          `AEO_${checkType}`,
          title,
          description,
          priority,
          actionText,
          {
            auditId: audit.id,
            checkType,
            issueCount: count,
            score: audit.score,
          },
        ),
      );
    }

    const sorted = recommendations.sort(
      (a, b) =>
        this.priorityValue(b.priority) -
        this.priorityValue(a.priority),
    );

    return {
      website: {
        id: website.id,
        name: website.name,
        url: website.url,
      },
      audit: {
        id: audit.id,
        score: audit.score,
        pagesChecked: audit.pagesChecked,
        issuesCount: audit.issuesCount,
      },
      summary: {
        total: sorted.length,
        high: sorted.filter(
          (item) => item.priority === 'HIGH',
        ).length,
        medium: sorted.filter(
          (item) => item.priority === 'MEDIUM',
        ).length,
        low: sorted.filter(
          (item) => item.priority === 'LOW',
        ).length,
      },
      recommendations: sorted,
    };
  }
  async generateGeoRecommendations(
    organizationId: string,
    websiteId: string,
  ) {
    const website = await this.prisma.website.findFirst({
      where: {
        id: websiteId,
        organizationId,
        isActive: true,
      },
    });

    if (!website) {
      throw new NotFoundException('Website not found');
    }

    const audit = await this.prisma.geoAudit.findFirst({
      where: { websiteId },
      orderBy: { createdAt: 'desc' },
    });

    if (!audit) {
      throw new NotFoundException(
        'Run a GEO audit before generating recommendations',
      );
    }

    const recommendations: any[] = [];

    const createOrUpdate = async (
      type: string,
      title: string,
      description: string,
      priority: Priority,
      actionText: string,
      metadata: any,
    ) => {
      const existing =
        await this.prisma.recommendation.findFirst({
          where: {
            organizationId,
            websiteId,
            source: 'GEO_AUDIT',
            type,
            title,
          },
        });

      const data = {
        organizationId,
        websiteId,
        source: 'GEO_AUDIT',
        type,
        title,
        description,
        priority,
        impact: this.getImpact(priority),
        effort: 'MEDIUM' as Priority,
        actionText,
        metadata,
      };

      return existing
        ? this.prisma.recommendation.update({
            where: { id: existing.id },
            data,
          })
        : this.prisma.recommendation.create({ data });
    };

    if (audit.entityScore < 70) {
      recommendations.push(
        await createOrUpdate(
          'GEO_ENTITY',
          'Strengthen entity clarity for AI discovery',
          'Important business and page-level entity signals are incomplete. Improve titles, descriptions, headings, structured data, and business identity signals.',
          audit.entityScore < 40 ? 'HIGH' : 'MEDIUM',
          'Improve entity-defining content and structured data across important pages.',
          {
            auditId: audit.id,
            entityScore: audit.entityScore,
          },
        ),
      );
    }

    if (audit.contentScore < 70) {
      recommendations.push(
        await createOrUpdate(
          'GEO_CONTENT',
          'Improve content readiness for AI answers',
          'Important pages are missing one or more content signals required for strong machine understanding.',
          audit.contentScore < 40 ? 'HIGH' : 'MEDIUM',
          'Improve page titles, meta descriptions, headings, and useful substantive content.',
          {
            auditId: audit.id,
            contentScore: audit.contentScore,
          },
        ),
      );
    }

    if (audit.authorityScore < 50) {
      recommendations.push(
        await createOrUpdate(
          'GEO_AUTHORITY',
          'Strengthen authority signals',
          'The current backlink authority profile is not strong enough to support competitive AI-search visibility.',
          audit.authorityScore < 25 ? 'HIGH' : 'MEDIUM',
          'Acquire relevant authoritative backlinks and reduce harmful link signals.',
          {
            auditId: audit.id,
            authorityScore: audit.authorityScore,
          },
        ),
      );
    }

    if (audit.citationScore < 50) {
      recommendations.push(
        await createOrUpdate(
          'GEO_CITATION',
          'Increase AI citation coverage',
          'Current GEO observations show limited citation coverage. Connect real AI query observations before treating citation performance as strong.',
          audit.citationScore === 0 ? 'MEDIUM' : 'HIGH',
          'Run real AI visibility queries and improve authoritative source coverage for target topics.',
          {
            auditId: audit.id,
            citationScore: audit.citationScore,
          },
        ),
      );
    }

    const sorted = recommendations.sort(
      (a, b) =>
        this.priorityValue(b.priority) -
        this.priorityValue(a.priority),
    );

    return {
      website: {
        id: website.id,
        name: website.name,
        url: website.url,
      },
      audit,
      summary: {
        total: sorted.length,
        high: sorted.filter(
          (r) => r.priority === 'HIGH',
        ).length,
        medium: sorted.filter(
          (r) => r.priority === 'MEDIUM',
        ).length,
        low: sorted.filter(
          (r) => r.priority === 'LOW',
        ).length,
      },
      recommendations: sorted,
    };
  }

  async generateBusinessBrainRecommendations(
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

    const businessBrain =
      await this.prisma.businessBrain.findUnique({
        where: {
          websiteId,
        },
        select: {
          businessScore: true,
          lastAnalyzedAt: true,
        },
      });

    if (!businessBrain) {
      throw new NotFoundException(
        'Run Business Brain analysis before generating recommendations',
      );
    }

    const recommendations =
      await this.prisma.recommendation.findMany({
        where: {
          organizationId,
          websiteId,
          source: 'BUSINESS_BRAIN',
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

    const sorted =
      recommendations.sort(
        (a, b) =>
          this.priorityValue(
            b.priority as Priority,
          ) -
          this.priorityValue(
            a.priority as Priority,
          ),
      );

    return {
      website: {
        id: website.id,
        name: website.name,
        url: website.url,
      },

      businessScore:
        businessBrain.businessScore,

      analyzedAt:
        businessBrain.lastAnalyzedAt,

      summary: {
        total: sorted.length,

        high: sorted.filter(
          (r) =>
            r.priority === 'HIGH',
        ).length,

        medium: sorted.filter(
          (r) =>
            r.priority === 'MEDIUM',
        ).length,

        low: sorted.filter(
          (r) =>
            r.priority === 'LOW',
        ).length,
      },

      recommendations:
        sorted,
    };
  }
  async createActionFromRecommendation(
    organizationId: string,
    recommendationId: string,
  ) {
    if (!organizationId) {
      throw new NotFoundException(
        'Organization not found',
      );
    }

    if (!recommendationId) {
      throw new NotFoundException(
        'Recommendation ID is required',
      );
    }

    const recommendation =
      await this.prisma.recommendation.findFirst({
        where: {
          id: recommendationId,
          organizationId,
        },
      });

    if (!recommendation) {
      throw new NotFoundException(
        'Recommendation not found',
      );
    }

    const actionEligibleSources = new Set([
      'SEO_AUDIT',
      'GSC_SEO',
      'CONTENT',
      'AEO_AUDIT',
      'GEO_AUDIT',
      'BUSINESS_BRAIN',
      'COMPETITOR_COMPARISON',
    ]);

    if (!actionEligibleSources.has(recommendation.source)) {
      throw new NotFoundException(
        'This opportunity cannot be converted to an action yet',
      );
    }

    const existing =
      await this.prisma.action.findFirst({
        where: {
          organizationId,
          recommendationId,
        },
      });

    if (existing) {
      return existing;
    }

    const action =
      await this.prisma.$transaction(
        async (tx) => {
          const created =
            await tx.action.create({
              data: {
                organizationId,
                websiteId:
                  recommendation.websiteId,
                recommendationId:
                  recommendation.id,
                type:
                  recommendation.type,
                title:
                  recommendation.title,
                description:
                  recommendation.description,
                url:
                  recommendation.pageUrl ??
                  undefined,
                priority:
                  recommendation.priority,
                status: 'TODO',
                metadata:
                  recommendation.metadata ??
                  undefined,
              },
            });

          return created;
        },
      );

    return action;
  }
}






import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { EmailProviderError } from '../email/email.errors';
import { BillingService } from '../billing/billing.service';
import { BusinessBrainService } from '../business-brain/business-brain.service';
import { RoiService } from '../roi/roi.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { AiVisibilityService } from '../ai-visibility/ai-visibility.service';
import { LocalSeoService } from '../local-seo/local-seo.service';
import { ContentService } from '../content/content.service';
import { BacklinksService } from '../backlinks/backlinks.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { SearchSurfacesService } from '../keywords/search-surfaces.service';
import { CustomerDemandService } from '../keywords/customer-demand.service';
import { ChangeIntelligenceService } from '../content/change-intelligence.service';
import { CompetitiveIntelligenceService } from '../keywords/competitive-intelligence.service';
import { ActionExecutionService } from '../actions/action-execution.service';

const TYPE_SECTIONS: Record<
  string,
  string[]
> = {
  EXECUTIVE: [
    'overview',
    'narrative',
    'changes',
    'wins',
    'risks',
    'priorities',
    'seo',
    'opportunities',
    'completed',
    'actions',
    'nextPlan',
    'monitoring',
    'outcome',
    'local',
    'content',
    'backlinks',
    'limitations',
    'connectivity',
    'surfaces',
    'customerDemand',
    'changeSummary',
    'competitiveMovement',
    'executionStatus',
    'executionSummary',
  ],
  SEO: [
    'overview',
    'narrative',
    'changes',
    'wins',
    'risks',
    'priorities',
    'seo',
    'technical',
    'opportunities',
    'completed',
    'actions',
    'nextPlan',
    'monitoring',
    'limitations',
    'connectivity',
    'surfaces',
    'customerDemand',
    'changeSummary',
    'competitiveMovement',
    'executionStatus',
    'executionSummary',
  ],
  AI_VISIBILITY: [
    'overview',
    'narrative',
    'changes',
    'wins',
    'risks',
    'ai_visibility',
    'opportunities',
    'completed',
    'actions',
    'nextPlan',
    'limitations',
    'connectivity',
    'surfaces',
    'customerDemand',
    'changeSummary',
    'competitiveMovement',
    'executionStatus',
    'executionSummary',
  ],
  TECHNICAL: [
    'overview',
    'narrative',
    'technical',
    'completed',
    'actions',
    'nextPlan',
    'limitations',
    'connectivity',
    'surfaces',
    'customerDemand',
    'changeSummary',
    'competitiveMovement',
    'executionStatus',
    'executionSummary',
  ],
  COMPETITOR: [
    'overview',
    'narrative',
    'changes',
    'competitors',
    'opportunities',
    'completed',
    'actions',
    'nextPlan',
    'limitations',
    'connectivity',
    'surfaces',
    'customerDemand',
    'changeSummary',
    'competitiveMovement',
    'executionStatus',
    'executionSummary',
  ],
  OUTCOME: [
    'overview',
    'narrative',
    'outcome',
    'opportunities',
    'completed',
    'actions',
    'nextPlan',
    'limitations',
    'connectivity',
    'surfaces',
    'customerDemand',
    'changeSummary',
    'competitiveMovement',
    'executionStatus',
    'executionSummary',
  ],
  AGENCY_CLIENT: [
    'overview',
    'narrative',
    'changes',
    'wins',
    'risks',
    'priorities',
    'seo',
    'opportunities',
    'completed',
    'actions',
    'nextPlan',
    'monitoring',
    'outcome',
    'ai_visibility',
    'local',
    'content',
    'backlinks',
    'limitations',
    'connectivity',
    'surfaces',
    'customerDemand',
    'changeSummary',
    'competitiveMovement',
    'executionStatus',
    'executionSummary',
  ],
};

const TYPE_TITLES: Record<
  string,
  string
> = {
  EXECUTIVE: 'Executive Growth Report',
  SEO: 'SEO Report',
  AI_VISIBILITY:
    'AI Search Visibility Report',
  TECHNICAL: 'Technical SEO Report',
  COMPETITOR: 'Competitor Report',
  OUTCOME: 'Business Outcome Report',
  AGENCY_CLIENT: 'Agency Client Report',
};

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
    private readonly businessBrainService: BusinessBrainService,
    private readonly roiService: RoiService,
    private readonly recommendationsService: RecommendationsService,
    private readonly monitoringService: MonitoringService,
    private readonly aiVisibilityService: AiVisibilityService,
    private readonly emailService: EmailService,
    private readonly localSeoService: LocalSeoService,
    private readonly contentService: ContentService,
    private readonly backlinksService: BacklinksService,
    private readonly integrationsService: IntegrationsService,
    private readonly searchSurfacesService: SearchSurfacesService,
    private readonly customerDemandService: CustomerDemandService,
    private readonly changeIntelligenceService: ChangeIntelligenceService,
    private readonly competitiveService: CompetitiveIntelligenceService,
    private readonly executionService: ActionExecutionService,
  ) {}

  // =========================================================
  // GENERATE (persisted snapshot from real data)
  // =========================================================

  async generate(
    organizationId: string,
    userId: string | null,
    websiteId: string,
    type: string,
    options: {
      title?: string;
      from?: string;
      to?: string;
      clientId?: string;
      agencyName?: string;
    } = {},
  ) {
    const website =
      await this.prisma.website.findFirst(
        {
          where: {
            id: websiteId,
            organizationId,
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            url: true,
            clientId: true,
          },
        },
      );

    if (!website) {
      throw new NotFoundException(
        'Website not found',
      );
    }

    const current =
      await this.prisma.report.count({
        where: { organizationId },
      });

    await this.billingService.enforceCreation(
      organizationId,
      'REPORTS',
      current,
    );

    let client = null;

    const clientId =
      options.clientId ??
      website.clientId ??
      null;

    if (clientId) {
      client =
        await this.prisma.client.findFirst(
          {
            where: {
              id: clientId,
              organizationId,
            },
            select: {
              id: true,
              name: true,
              company: true,
              status: true,
            },
          },
        );

      if (!client) {
        throw new NotFoundException(
          'Client not found',
        );
      }
    }

    const keys =
      TYPE_SECTIONS[type] ??
      TYPE_SECTIONS.EXECUTIVE;

    const organization =
      await this.prisma.organization.findUnique(
        {
          where: {
            id: organizationId,
          },
          select: { name: true },
        },
      );

    const dataAvailability: Record<
      string,
      string
    > = {};
    const sections: Record<
      string,
      any
    > = {};

    const builders: Record<
      string,
      () => Promise<any>
    > = {
      overview: () =>
        this.buildOverview(
          organizationId,
          websiteId,
          website,
          client,
          dataAvailability,
        ),
      seo: () =>
        this.buildSeo(
          websiteId,
          dataAvailability,
        ),
      technical: () =>
        this.buildTechnical(
          websiteId,
          dataAvailability,
        ),
      opportunities: () =>
        this.buildOpportunities(
          organizationId,
          websiteId,
          dataAvailability,
        ),
      connectivity: () =>
        this.buildConnectivity(
          organizationId,
          websiteId,
          dataAvailability,
        ),
      surfaces: () =>
        this.buildSurfaces(
          organizationId,
          websiteId,
          dataAvailability,
        ),
      customerDemand: () =>
        this.buildCustomerDemand(
          organizationId,
          websiteId,
          dataAvailability,
        ),
      changeSummary: () =>
        this.buildChangeSummary(
          organizationId,
          websiteId,
          dataAvailability,
        ),
      competitiveMovement: () =>
        this.buildCompetitiveMovement(
          organizationId,
          websiteId,
          dataAvailability,
        ),
      executionStatus: () =>
        this.buildExecutionStatus(
          organizationId,
          websiteId,
          dataAvailability,
        ),
      executionSummary: () =>
        this.buildExecutionSummary(
          organizationId,
          websiteId,
          dataAvailability,
        ),
      actions: () =>
        this.buildActions(
          organizationId,
          websiteId,
          dataAvailability,
        ),
      monitoring: () =>
        this.buildMonitoring(
          organizationId,
          websiteId,
          dataAvailability,
        ),
      ai_visibility: () =>
        this.buildAiVisibility(
          organizationId,
          websiteId,
          dataAvailability,
        ),
      competitors: () =>
        this.buildCompetitors(
          organizationId,
          websiteId,
          dataAvailability,
        ),
      outcome: () =>
        this.buildOutcome(
          organizationId,
          websiteId,
          options.from,
          options.to,
          dataAvailability,
        ),
      local: () =>
        this.buildLocal(
          organizationId,
          websiteId,
          dataAvailability,
        ),
      content: () =>
        this.buildContent(
          organizationId,
          websiteId,
          dataAvailability,
        ),
      backlinks: () =>
        this.buildBacklinks(
          organizationId,
          websiteId,
          dataAvailability,
        ),
    };

    for (const key of keys) {
      if (
        [
          'narrative',
          'changes',
          'wins',
          'risks',
          'priorities',
          'completed',
          'nextPlan',
          'limitations',
        ].includes(key)
      )
        continue;
      try {
        sections[key] =
          await builders[key]();
      } catch {
        sections[key] = {
          status: 'NO_DATA',
          reason:
            'This section could not be assembled.',
        };
        dataAvailability[key] =
          'NO_DATA';
      }
    }

    /* Narrative sections compose over built sections —
     * deterministic, bounded, no new providers. */
    const narrativeKeys = keys.filter((key) =>
      [
        'narrative',
        'changes',
        'wins',
        'risks',
        'priorities',
        'completed',
        'nextPlan',
        'limitations',
      ].includes(key),
    );
    if (narrativeKeys.length > 0) {
      try {
        const narrative =
          await this.buildNarrative(
            organizationId,
            websiteId,
            sections,
            dataAvailability,
            options.from,
            options.to,
          );
        for (const key of narrativeKeys)
          sections[key] = narrative[key];
      } catch {
        for (const key of narrativeKeys) {
          sections[key] = {
            status: 'NO_DATA',
            reason:
              'Narrative sections could not be assembled.',
          };
          dataAvailability[key] = 'NO_DATA';
        }
      }
    }

    return this.prisma.report.create({
      data: {
        organizationId,
        websiteId,
        clientId,
        type,
        title:
          options.title?.trim() ||
          `${TYPE_TITLES[type] ?? 'Growth Report'} — ${website.name}`,
        dateFrom: options.from
          ? new Date(options.from)
          : null,
        dateTo: options.to
          ? new Date(options.to)
          : null,
        /* DRAFT until explicitly published; published
         * snapshots are immutable, regeneration
         * creates a new snapshot. */
        status: 'DRAFT',
        sections: sections as any,
        dataAvailability:
          dataAvailability as any,
        branding: {
          agencyName:
            options.agencyName?.trim() ||
            organization?.name ||
            'RENKOO',
        } as any,
        createdBy: userId,
      },
    });
  }

  // =========================================================
  // SECTION BUILDERS (real data, honest gaps)
  // =========================================================

  private async buildOverview(
    organizationId: string,
    websiteId: string,
    website: {
      id: string;
      name: string;
      url: string;
    },
    client: {
      id: string;
      name: string;
      company: string | null;
      status: string;
    } | null,
    dataAvailability: Record<
      string,
      string
    >,
  ) {
    let context: any = null;

    try {
      context =
        await this.businessBrainService.getBusinessContext(
          organizationId,
          websiteId,
        );
    } catch {
      context = null;
    }

    dataAvailability.overview =
      'AVAILABLE';

    return {
      status: 'AVAILABLE',
      website: {
        name: website.name,
        url: website.url,
      },
      client: client
        ? {
            name: client.name,
            company:
              client.company,
            status:
              client.status,
          }
        : null,
      businessGoal:
        context?.priorities
          ?.primaryGoal ?? null,
      contextConfidence:
        context?.contextConfidence ??
        null,
      missing: (
        context?.missing ?? []
      ).slice(0, 8),
    };
  }

  private async buildSeo(
    websiteId: string,
    dataAvailability: Record<
      string,
      string
    >,
  ) {
    const latest =
      await this.prisma.crawl.findFirst({
        where: {
          websiteId,
          status: 'COMPLETED',
        },
        orderBy: {
          completedAt: 'desc',
        },
        select: {
          id: true,
          completedAt: true,
        },
      });

    if (!latest) {
      dataAvailability.seo =
        'NO_DATA';

      return {
        status: 'NO_DATA',
        reason:
          'No completed crawl exists.',
      };
    }

    const pages =
      await this.prisma.crawlPage.findMany(
        {
          where: {
            crawlId: latest.id,
          },
          select: {
            issues: {
              where: {
                status: 'OPEN',
              },
              select: {
                severity: true,
              },
            },
          },
        },
      );

    const bySeverity: Record<
      string,
      number
    > = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };

    let open = 0;

    for (const page of pages) {
      for (const issue of page.issues) {
        open += 1;
        const key = String(
          issue.severity,
        ).toUpperCase();

        if (
          bySeverity[key] !== undefined
        ) {
          bySeverity[key] += 1;
        }
      }
    }

    const penalty =
      bySeverity.CRITICAL * 20 +
      bySeverity.HIGH * 10 +
      bySeverity.MEDIUM * 5 +
      bySeverity.LOW * 2;
    const score = Math.max(
      0,
      Math.min(100, 100 - penalty),
    );

    dataAvailability.seo =
      'AVAILABLE';

    return {
      status: 'AVAILABLE',
      crawlId: latest.id,
      completedAt:
        latest.completedAt,
      pages: pages.length,
      openIssues: open,
      bySeverity,
      score,
    };
  }

  private async buildTechnical(
    websiteId: string,
    dataAvailability: Record<
      string,
      string
    >,
  ) {
    const latest =
      await this.prisma.crawl.findFirst({
        where: {
          websiteId,
          status: 'COMPLETED',
        },
        orderBy: {
          completedAt: 'desc',
        },
        select: { id: true },
      });

    if (!latest) {
      dataAvailability.technical =
        'NO_DATA';

      return {
        status: 'NO_DATA',
        reason:
          'No completed crawl exists.',
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
            issues: {
              where: {
                status: 'OPEN',
              },
              select: {
                code: true,
                severity: true,
                title: true,
                recommendation: true,
              },
            },
          },
        },
      );

    const groups = new Map<
      string,
      any
    >();

    for (const page of pages) {
      for (const issue of page.issues) {
        const existing = groups.get(
          issue.code,
        );

        if (existing) {
          existing.count += 1;
        } else {
          groups.set(issue.code, {
            code: issue.code,
            severity: issue.severity,
            title: issue.title,
            recommendation:
              issue.recommendation,
            count: 1,
          });
        }
      }
    }

    const top = [...groups.values()]
      .sort(
        (a, b) =>
          b.count - a.count,
      )
      .slice(0, 10);

    dataAvailability.technical =
      'AVAILABLE';

    return {
      status: 'AVAILABLE',
      groups: top,
      totalGroups: groups.size,
    };
  }

  private async buildOpportunities(
    organizationId: string,
    websiteId: string,
    dataAvailability: Record<
      string,
      string
    >,
  ) {
    const unified =
      await this.recommendationsService.getUnifiedOpportunities(
        organizationId,
        websiteId,
      );

    const items: any[] =
      unified.opportunities ?? [];

    if (items.length === 0) {
      dataAvailability.opportunities =
        'NO_DATA';

      return {
        status: 'NO_DATA',
        reason:
          'The opportunity queue is empty.',
      };
    }

    dataAvailability.opportunities =
      'AVAILABLE';

    return {
      status: 'AVAILABLE',
      total: unified.total,
      summary: unified.summary,
      top: items
        .slice(0, 10)
        .map((item: any) => ({
          title: item.title,
          priority: item.priority,
          score: item.score,
          source: item.source,
          recommendation:
            item.recommendation ??
            null,
        })),
    };
  }

  private async buildActions(
    organizationId: string,
    websiteId: string,
    dataAvailability: Record<
      string,
      string
    >,
  ) {
    const [open, done] =
      await Promise.all([
        this.prisma.action.count({
          where: {
            organizationId,
            websiteId,
            status: {
              in: [
                'TODO',
                'IN_PROGRESS',
              ],
            },
          },
        }),
        this.prisma.action.count({
          where: {
            organizationId,
            websiteId,
            status: 'DONE',
          },
        }),
      ]);

    const recent =
      await this.prisma.action.findMany({
        where: {
          organizationId,
          websiteId,
        },
        orderBy: {
          updatedAt: 'desc',
        },
        take: 10,
        select: {
          title: true,
          status: true,
          priority: true,
          completedAt: true,
        },
      });

    dataAvailability.actions =
      'AVAILABLE';

    return {
      status: 'AVAILABLE',
      open,
      done,
      recent,
    };
  }

  private async buildMonitoring(
    organizationId: string,
    websiteId: string,
    dataAvailability: Record<
      string,
      string
    >,
  ) {
    const changes =
      await this.monitoringService.getChanges(
        organizationId,
        websiteId,
      );

    const alerts =
      await this.monitoringService
        .listAlerts(organizationId, {
          websiteId,
        })
        .catch(() => ({
          alerts: [],
          total: 0,
          storageReady: false,
        }));

    dataAvailability.monitoring =
      'AVAILABLE';

    return {
      status: 'AVAILABLE',
      changes: (
        changes.changes ?? []
      )
        .slice(0, 10)
        .map((item: any) => ({
          title: item.title,
          severity: item.severity,
          direction:
            item.direction,
          detectedAt:
            item.detectedAt,
        })),
      changesSummary:
        changes.summary ?? null,
      activeAlerts:
        alerts.total ?? 0,
      alertsStorageReady:
        (alerts as any)
          .storageReady ?? true,
    };
  }

  private async buildAiVisibility(
    organizationId: string,
    websiteId: string,
    dataAvailability: Record<
      string,
      string
    >,
  ) {
    const intel =
      await this.aiVisibilityService.getIntelligence(
        organizationId,
        websiteId,
      );

    if (
      intel.counts.completedChecks ===
      0
    ) {
      dataAvailability.ai_visibility =
        'NO_DATA';

      return {
        status: 'NO_DATA',
        reason:
          'No completed AI observations exist.',
      };
    }

    dataAvailability.ai_visibility =
      'AVAILABLE';

    return {
      status: 'AVAILABLE',
      counts: intel.counts,
      shareOfVoice:
        intel.shareOfVoice,
      trend: intel.trend,
      topCitations:
        intel.citations.slice(0, 5),
      gaps: intel.gaps.slice(0, 5),
    };
  }

  private async buildLocal(
    organizationId: string,
    websiteId: string,
    dataAvailability: Record<
      string,
      string
    >,
  ) {
    const health =
      await this.localSeoService.getHealth(
        organizationId,
        websiteId,
      );

    const locations =
      await this.localSeoService.listLocations(
        organizationId,
        websiteId,
      );

    dataAvailability.local =
      health.overall === 'GOOD'
        ? 'AVAILABLE'
        : 'NO_DATA';

    const citationsArea =
      health.areas.find(
        (area: any) =>
          area.key === 'citations',
      );

    return {
      status:
        health.overall === 'GOOD'
          ? 'AVAILABLE'
          : 'NO_DATA',
      overall: health.overall,
      overallNote:
        health.overallNote,
      areas: health.areas,
      locations:
        locations.locations.slice(
          0,
          10,
        ),
      totalLocations:
        locations.total,
      rankings: 'NOT_AVAILABLE',
      reviews: 'NOT_AVAILABLE',
      citations:
        citationsArea?.state ===
        'ATTENTION'
          ? 'MANUAL'
          : 'NOT_AVAILABLE',
      gbp: 'NOT_AVAILABLE',
    };
  }

  private async buildContent(
    organizationId: string,
    websiteId: string,
    dataAvailability: Record<
      string,
      string
    >,
  ) {
    const [items, briefs, drafts] =
      await Promise.all([
        this.contentService.listItems(
          organizationId,
          websiteId,
        ),
        this.contentService.listBriefs(
          organizationId,
          websiteId,
        ),
        this.contentService.listDrafts(
          organizationId,
          websiteId,
        ),
      ]);

    const byStatus: Record<
      string,
      number
    > = {};

    for (const item of items.items) {
      byStatus[item.status] =
        (byStatus[item.status] ?? 0) + 1;
    }

    const refresh =
      await this.contentService
        .getRefreshQueue(
          organizationId,
          websiteId,
        )
        .catch(() => null);

    dataAvailability.content =
      items.total > 0 ||
      briefs.total > 0
        ? 'AVAILABLE'
        : 'NO_DATA';

    return {
      status:
        items.total > 0 ||
        briefs.total > 0
          ? 'AVAILABLE'
          : 'NO_DATA',
      itemsByStatus: byStatus,
      totalItems: items.total,
      totalBriefs: briefs.total,
      totalDrafts: drafts.total,
      aiDrafts: drafts.aiGenerated,
      refreshQueue:
        refresh?.refresh?.slice(0, 10) ??
        [],
      refreshTotal:
        refresh?.total ?? 0,
      publishing:
        items.publishing,
      serp: 'NOT_AVAILABLE',
    };
  }

  private async buildBacklinks(
    organizationId: string,
    websiteId: string,
    dataAvailability: Record<
      string,
      string
    >,
  ) {
    const [overview, opportunities, gap] =
      await Promise.all([
        this.backlinksService.getOverview(
          organizationId,
          websiteId,
        ),
        this.backlinksService.getOpportunities(
          organizationId,
          websiteId,
        ),
        this.backlinksService.getCompetitorGap(
          organizationId,
          websiteId,
        ),
      ]);

    const total: number =
      overview.summary?.totalBacklinks ??
      0;

    dataAvailability.backlinks =
      total > 0 ? 'AVAILABLE' : 'NO_DATA';

    return {
      status:
        total > 0
          ? 'AVAILABLE'
          : 'NO_DATA',
      summary: overview.summary,
      qualityBreakdown:
        overview.qualityBreakdown,
      sources: overview.sources,
      authorityNote:
        overview.authorityNote,
      openOpportunities:
        opportunities.opportunities.slice(
          0,
          10,
        ),
      openOpportunityCount:
        opportunities.summary?.total ??
        0,
      competitorGap: {
        status: gap.status,
        reason: gap.reason,
      },
      provider: 'NOT_AVAILABLE',
    };
  }

  private async buildCompetitors(
    organizationId: string,
    websiteId: string,
    dataAvailability: Record<
      string,
      string
    >,
  ) {
    const competitors =
      await this.prisma.competitor.findMany(
        {
          where: {
            organizationId,
            websiteId,
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            crawls: {
              orderBy: {
                createdAt: 'desc',
              },
              take: 1,
              select: {
                status: true,
                score: true,
                totalIssues: true,
              },
            },
          },
        },
      );

    if (competitors.length === 0) {
      dataAvailability.competitors =
        'NO_DATA';

      return {
        status: 'NO_DATA',
        reason:
          'No competitors are tracked.',
      };
    }

    dataAvailability.competitors =
      'AVAILABLE';

    return {
      status: 'AVAILABLE',
      competitors: competitors.map(
        (competitor) => ({
          id: competitor.id,
          name: competitor.name,
          crawl:
            competitor.crawls[0] ??
            null,
        }),
      ),
    };
  }

  private async buildOutcome(
    organizationId: string,
    websiteId: string,
    from: string | undefined,
    to: string | undefined,
    dataAvailability: Record<
      string,
      string
    >,
  ) {
    const outcome =
      await this.roiService.outcome(
        organizationId,
        websiteId,
        from,
        to,
      );

    dataAvailability.outcome =
      'AVAILABLE';

    return {
      status: 'AVAILABLE',
      funnel: outcome.funnel,
      attribution:
        outcome.attribution,
      roi: outcome.roi,
      sources: outcome.sources,
      recentChanges:
        outcome.recentChanges,
    };
  }

  /*
   * Data-source disclosure (Phase 21): which sources the
   * report used and which are missing. Stored metadata
   * only — no provider calls, no technical OAuth detail.
   */
  private async buildConnectivity(
    organizationId: string,
    websiteId: string,
    dataAvailability: Record<string, string>,
  ) {
    try {
      const capabilities =
        await this.integrationsService.getCapabilities(
          organizationId,
          websiteId,
        );
      const used = capabilities.capabilities.filter(
        (entry: any) =>
          entry.status === 'AVAILABLE' ||
          entry.status === 'PARTIAL',
      );
      const missing = capabilities.capabilities.filter(
        (entry: any) =>
          entry.status !== 'AVAILABLE' &&
          entry.status !== 'PARTIAL',
      );
      dataAvailability.connectivity = 'AVAILABLE';
      return {
        status: 'AVAILABLE',
        used: used.map((entry: any) => ({
          capability: entry.key,
          source: entry.source,
        })),
        missing: missing.map((entry: any) => ({
          capability: entry.key,
          source: entry.source,
          action: entry.action,
        })),
      };
    } catch {
      dataAvailability.connectivity = 'NO_DATA';
      return {
        status: 'NO_DATA',
        reason:
          'Data-source disclosure is unavailable for this report.',
      };
    }
  }

  /*
   * Search surfaces (Phase 22): where the brand is
   * visible, where competitors are observed, what to do
   * next. Stored evidence only — no new engine.
   */
  private async buildSurfaces(
    organizationId: string,
    websiteId: string,
    dataAvailability: Record<string, string>,
  ) {
    try {
      const summary =
        await this.searchSurfacesService.getSurfaceSummary(
          organizationId,
          websiteId,
          28,
        );
      dataAvailability.surfaces = 'AVAILABLE';
      return {
        status: 'AVAILABLE',
        summary: summary.summary,
        opportunities: (
          summary.opportunities as unknown[]
        ).slice(0, 5),
        competitors: (
          summary.competitors as unknown[]
        ).slice(0, 5),
      };
    } catch {
      dataAvailability.surfaces = 'NO_DATA';
      return {
        status: 'NO_DATA',
        reason:
          'Search surface evidence is unavailable for this report.',
      };
    }
  }

  /*
   * Customer demand (Phase 24): top needs with journey,
   * evidence, gaps and actions. Stored evidence only.
   */
  private async buildCustomerDemand(
    organizationId: string,
    websiteId: string,
    dataAvailability: Record<string, string>,
  ) {
    try {
      const demand =
        await this.customerDemandService.getCustomerNeeds(
          organizationId,
          websiteId,
          28,
        );
      dataAvailability.customerDemand = 'AVAILABLE';
      return {
        status: 'AVAILABLE',
        topNeeds: (
          demand.topNeeds as unknown[]
        ).slice(0, 5),
      };
    } catch {
      dataAvailability.customerDemand = 'NO_DATA';
      return {
        status: 'NO_DATA',
        reason:
          'Customer demand evidence is unavailable for this report.',
      };
    }
  }

  /*
   * Change summary (Phase 26): max 10 material changes
   * with evidence, impact signal and limitation. Stored
   * composition only — no causal language.
   */
  private async buildChangeSummary(
    organizationId: string,
    websiteId: string,
    dataAvailability: Record<string, string>,
  ) {
    try {
      const summary =
        await this.changeIntelligenceService.getChangeSummary(
          organizationId,
          websiteId,
          28,
        );
      dataAvailability.changeSummary = 'AVAILABLE';
      return {
        status: 'AVAILABLE',
        total: (
          summary.materialChanges as unknown[]
        ).length,
        items: (
          summary.materialChanges as unknown[]
        ).slice(0, 10),
      };
    } catch {
      dataAvailability.changeSummary = 'NO_DATA';
      return {
        status: 'NO_DATA',
        reason:
          'Change evidence is unavailable for this report.',
      };
    }
  }

  /*
   * Competitive movement (Phase 27): max 5 observed
   * movements with evidence, gap, action, limitation.
   * No competitive score, no superiority claims.
   */
  private async buildCompetitiveMovement(
    organizationId: string,
    websiteId: string,
    dataAvailability: Record<string, string>,
  ) {
    try {
      const summary =
        await this.competitiveService.getCompetitiveSummary(
          organizationId,
          websiteId,
          28,
        );
      dataAvailability.competitiveMovement = 'AVAILABLE';
      const movements = (
        summary.movements as unknown[]
      ).slice(0, 5);
      return {
        status: 'AVAILABLE',
        total: movements.length,
        items: movements.map((entry) => {
          const row = entry as Record<string, unknown>;
          return {
            competitor: String(row.competitor ?? '').trim(),
            movement: String(row.movement ?? '').trim(),
            evidence: 'OBSERVED',
            limitation:
              'Observed presence only; never superiority or causation.',
          };
        }),
      };
    } catch {
      dataAvailability.competitiveMovement = 'NO_DATA';
      return {
        status: 'NO_DATA',
        reason:
          'Competitive movement evidence is unavailable for this report.',
      };
    }
  }

  /*
   * Execution status (Phase 28): max 5 recent actions
   * with completed/verified/not-verified states.
   * Verification detail lives behind the action API;
   * the report carries status only. No causal wording.
   */
  private async buildExecutionStatus(
    organizationId: string,
    websiteId: string,
    dataAvailability: Record<string, string>,
  ) {
    try {
      const actions = await this.prisma.action.findMany({
        where: { organizationId, websiteId },
        orderBy: { completedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          status: true,
          completedAt: true,
        },
      });
      dataAvailability.executionStatus = 'AVAILABLE';
      return {
        status: 'AVAILABLE',
        total: actions.length,
        items: actions.map((action) => ({
          title: action.title,
          status: action.status,
          completedAt: action.completedAt,
          verificationHref: `/api/actions/${action.id}/verification`,
          note: 'DONE is not VERIFIED: confirm the live-page change before interpreting outcomes.',
        })),
      };
    } catch {
      dataAvailability.executionStatus = 'NO_DATA';
      return {
        status: 'NO_DATA',
        reason:
          'Execution status is unavailable for this report.',
      };
    }
  }

  /*
   * Execution summary (Phase 29): max 5 counts and
   * items — proposed, approved, executed, verified,
   * measured. No success percentage, no execution
   * score.
   */
  private async buildExecutionSummary(
    organizationId: string,
    websiteId: string,
    dataAvailability: Record<string, string>,
  ) {
    try {
      const summary =
        await this.executionService.executionSummary(
          organizationId,
          websiteId,
        );
      const queue =
        await this.executionService.reviewQueue(
          organizationId,
          websiteId,
          5,
        );
      dataAvailability.executionSummary = 'AVAILABLE';
      return {
        status: 'AVAILABLE',
        counts: {
          proposed: summary.proposed,
          approved: summary.approved,
          executed: summary.executed,
          measured: summary.measured,
        },
        reviewQueue: queue.items,
      };
    } catch {
      dataAvailability.executionSummary = 'NO_DATA';
      return {
        status: 'NO_DATA',
        reason:
          'Execution evidence is unavailable for this report.',
      };
    }
  }

  /*
   * Narrative sections (Phase 20): deterministic
   * composition over already-built sections plus two
   * bounded reads (completed actions in period, open
   * priorities). No scores, no causal claims, no
   * invented metrics. Unavailable stays unavailable.
   */
  private async buildNarrative(
    organizationId: string,
    websiteId: string,
    sections: Record<string, any>,
    dataAvailability: Record<string, string>,
    from: string | undefined,
    to: string | undefined,
  ): Promise<Record<string, any>> {
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    const validRange =
      fromDate !== null &&
      toDate !== null &&
      !Number.isNaN(fromDate.getTime()) &&
      !Number.isNaN(toDate.getTime()) &&
      toDate >= fromDate;

    const completedActions =
      await this.prisma.action.findMany({
        where: {
          organizationId,
          websiteId,
          status: 'DONE',
          ...(validRange
            ? {
                completedAt: {
                  gte: fromDate as Date,
                  lte: toDate as Date,
                },
              }
            : {}),
        },
        orderBy: { completedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          title: true,
          type: true,
          url: true,
          priority: true,
          status: true,
          completedAt: true,
        },
      });

    const openPriorities: any[] =
      sections.opportunities?.top
        ?.filter(
          (item: any) =>
            item.priority === 'HIGH' ||
            item.priority === 'MEDIUM',
        )
        .slice(0, 5) ?? [];

    const monitoring: any[] = Array.isArray(
      sections.monitoring?.changes,
    )
      ? sections.monitoring.changes
      : Array.isArray(sections.monitoring?.alerts)
        ? sections.monitoring.alerts
        : [];

    const outcome = sections.outcome ?? null;
    const opportunityTotal =
      sections.opportunities?.total ?? 0;

    const summary: string[] = [];
    if (
      sections.seo?.status === 'AVAILABLE' ||
      sections.monitoring?.status === 'AVAILABLE'
    )
      summary.push(
        'Search visibility was observed across the reporting window; section detail below carries the evidence.',
      );
    if (completedActions.length > 0)
      summary.push(
        `${completedActions.length} recorded action(s) were completed in the reporting period.`,
      );
    if (openPriorities.length > 0)
      summary.push(
        `${openPriorities.length} high-relevance open opportunitie(s) define the next period plan.`,
      );
    if (outcome?.status === 'AVAILABLE')
      summary.push(
        'Recorded business outcomes are connected below; unattributed stages remain unavailable, never zero.',
      );
    if (summary.length === 0)
      summary.push(
        'Limited evidence is available for this reporting period; gaps are labeled unavailable throughout.',
      );

    const wins = [
      ...completedActions.slice(0, 3).map((action) => ({
        kind: 'ACTION_COMPLETED',
        label: action.title,
        detail: `Completed ${action.completedAt ? new Date(action.completedAt).toISOString().slice(0, 10) : 'on an unrecorded date'}. Observed after action — never claimed as caused by it.`,
        evidenceState: 'OBSERVED',
      })),
      ...monitoring
        .filter((entry: any) =>
          /improv|gain|new/i.test(
            JSON.stringify(entry).slice(0, 200),
          ),
        )
        .slice(0, 2)
        .map((entry: any) => ({
          kind: 'OBSERVED_IMPROVEMENT',
          label:
            entry.title ?? entry.label ?? 'Observed change',
          detail:
            'Improvement observed in monitoring evidence. Observed after action — never claimed as caused by it.',
          evidenceState: 'OBSERVED',
        })),
    ].slice(0, 5);

    const risks = monitoring
      .filter((entry: any) =>
        /declin|loss|drop|fail|weak/i.test(
          JSON.stringify(entry).slice(0, 200),
        ),
      )
      .slice(0, 5)
      .map((entry: any) => ({
        kind: 'OBSERVED_RISK',
        label:
          entry.title ?? entry.label ?? 'Observed risk',
        detail:
          'Risk signal observed in monitoring evidence. No risk score is computed.',
        evidenceState: 'OBSERVED',
      }));

    const changes = [
      {
        label: 'Recorded actions completed',
        before: null,
        after: completedActions.length,
        change: null,
        statement:
          completedActions.length > 0
            ? `${completedActions.length} action(s) completed in period. Before/after metric comparison requires both observations; see section detail.`
            : 'UNKNOWN — no completed actions recorded in this period.',
      },
      {
        label: 'Open opportunities',
        before: null,
        after: opportunityTotal || null,
        change: null,
        statement:
          opportunityTotal > 0
            ? `${opportunityTotal} open opportunitie(s) observed at generation time.`
            : 'UNKNOWN — opportunity queue state unavailable.',
      },
    ];

    dataAvailability.narrative = 'AVAILABLE';
    dataAvailability.priorities =
      openPriorities.length > 0
        ? 'AVAILABLE'
        : 'NO_DATA';
    dataAvailability.completed = 'AVAILABLE';
    dataAvailability.nextPlan =
      openPriorities.length > 0
        ? 'AVAILABLE'
        : 'NO_DATA';
    dataAvailability.limitations = 'AVAILABLE';
    dataAvailability.changes = 'AVAILABLE';
    dataAvailability.wins = 'AVAILABLE';
    dataAvailability.risks = 'AVAILABLE';

    return {
      narrative: {
        status: 'AVAILABLE',
        summary: summary.slice(0, 5),
        evidenceState: 'OBSERVED',
      },
      changes: {
        status: 'AVAILABLE',
        rows: changes,
      },
      wins: {
        status: 'AVAILABLE',
        total: wins.length,
        items: wins,
      },
      risks: {
        status: 'AVAILABLE',
        total: risks.length,
        items: risks,
      },
      priorities: {
        status:
          openPriorities.length > 0
            ? 'AVAILABLE'
            : 'NO_DATA',
        total: openPriorities.length,
        items: openPriorities.map((item: any) => ({
          title: item.title,
          priority: item.priority,
          source: item.source,
          evidenceState: 'OBSERVED',
          measurement:
            'Track the underlying metrics before and after action. Observed change — never causal proof.',
        })),
      },
      completed: {
        status: 'AVAILABLE',
        total: completedActions.length,
        items: completedActions.map((action) => ({
          ...action,
          measurementHref: `/api/actions/${action.id}/measurement`,
          measurement:
            'Outcome not yet observable where no post-action measurement exists.',
        })),
      },
      nextPlan: {
        status:
          openPriorities.length > 0
            ? 'AVAILABLE'
            : 'NO_DATA',
        total: Math.min(5, openPriorities.length),
        items: openPriorities
          .slice(0, 5)
          .map((item: any, index: number) => ({
            rank: index + 1,
            title: item.title,
            priority: item.priority,
            source: item.source,
            reason:
              'Existing open opportunity reused — no new priority is computed.',
            measurement:
              'Track the underlying metrics before and after action.',
          })),
      },
      limitations: {
        status: 'AVAILABLE',
        items: [
          'Complete backlink index unavailable.',
          'Google Business Profile performance unavailable.',
          'AI referral traffic unavailable where not observed.',
          'Exact zero-click sessions unavailable.',
          'Keyword-level revenue attribution unavailable where not recorded.',
          'Causal action impact unavailable: results are observed after action.',
        ],
      },
    };
  }

  // =========================================================
  // LIST / GET / DELETE
  // =========================================================

  async list(
    organizationId: string,
    websiteId?: string,
    clientId?: string,
  ) {
    if (websiteId) {
      await this.assertWebsite(
        organizationId,
        websiteId,
      );
    }

    if (clientId) {
      await this.assertClient(
        organizationId,
        clientId,
      );
    }

    const reports =
      await this.prisma.report.findMany({
        where: {
          organizationId,
          ...(websiteId
            ? { websiteId }
            : {}),
          ...(clientId
            ? { clientId }
            : {}),
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 100,
        select: {
          id: true,
          websiteId: true,
          clientId: true,
          type: true,
          title: true,
          dateFrom: true,
          dateTo: true,
          status: true,
          createdBy: true,
          shareToken: true,
          shareExpiresAt: true,
          shareRevoked: true,
          createdAt: true,
          website: {
            select: {
              name: true,
              url: true,
            },
          },
          client: {
            select: {
              name: true,
            },
          },
        },
      });

    return {
      total: reports.length,
      reports: reports.map(
        (report) => ({
          ...report,
          shared:
            Boolean(
              report.shareToken,
            ) &&
            !report.shareRevoked &&
            (!report.shareExpiresAt ||
              new Date(
                report.shareExpiresAt,
              ) > new Date()),
        }),
      ),
    };
  }

  async get(
    organizationId: string,
    id: string,
  ) {
    const report =
      await this.prisma.report.findFirst(
        {
          where: {
            id,
            organizationId,
          },
          include: {
            website: {
              select: {
                name: true,
                url: true,
              },
            },
            client: {
              select: {
                name: true,
              },
            },
          },
        },
      );

    if (!report) {
      throw new NotFoundException(
        'Report not found',
      );
    }

    return report;
  }

  async remove(
    organizationId: string,
    id: string,
  ) {
    const report =
      await this.prisma.report.findFirst(
        {
          where: {
            id,
            organizationId,
          },
          select: { id: true },
        },
      );

    if (!report) {
      throw new NotFoundException(
        'Report not found',
      );
    }

    await this.prisma.report.delete({
      where: { id },
    });

    return {
      success: true,
      id,
    };
  }

  // =========================================================
  // SHARING (token-gated, read-only, revocable)
  // =========================================================

  async share(
    organizationId: string,
    id: string,
    expiresInDays?: number,
  ) {
    const report =
      await this.prisma.report.findFirst(
        {
          where: {
            id,
            organizationId,
          },
          select: { id: true },
        },
      );

    if (!report) {
      throw new NotFoundException(
        'Report not found',
      );
    }

    const shareToken =
      randomBytes(24).toString(
        'hex',
      );

    const shareExpiresAt =
      expiresInDays &&
      expiresInDays > 0
        ? new Date(
            Date.now() +
              expiresInDays *
                86400000,
          )
        : null;

    return this.prisma.report.update({
      where: { id },
      data: {
        shareToken,
        shareExpiresAt,
        shareRevoked: false,
      },
      select: {
        id: true,
        shareToken: true,
        shareExpiresAt: true,
      },
    });
  }

  async revoke(
    organizationId: string,
    id: string,
  ) {
    const report =
      await this.prisma.report.findFirst(
        {
          where: {
            id,
            organizationId,
          },
          select: { id: true },
        },
      );

    if (!report) {
      throw new NotFoundException(
        'Report not found',
      );
    }

    return this.prisma.report.update({
      where: { id },
      data: {
        shareRevoked: true,
      },
      select: {
        id: true,
        shareRevoked: true,
      },
    });
  }

  /*
   * Lifecycle (Phase 20): DRAFT → PUBLISHED → ARCHIVED.
   * Publishing freezes the snapshot; regeneration
   * creates a new snapshot via generate(). READY is
   * the legacy published-equivalent value.
   */

  async publish(
    organizationId: string,
    id: string,
  ) {
    const report =
      await this.prisma.report.findFirst({
        where: { id, organizationId },
        select: { id: true, status: true },
      });
    if (!report)
      throw new NotFoundException('Report not found');
    if (report.status !== 'DRAFT') {
      throw new BadRequestException(
        'Only draft reports can be published',
      );
    }
    return this.prisma.report.update({
      where: { id },
      data: { status: 'PUBLISHED' },
      select: { id: true, status: true },
    });
  }

  async archive(
    organizationId: string,
    id: string,
  ) {
    const report =
      await this.prisma.report.findFirst({
        where: { id, organizationId },
        select: { id: true, status: true },
      });
    if (!report)
      throw new NotFoundException('Report not found');
    if (
      report.status !== 'PUBLISHED' &&
      report.status !== 'READY'
    ) {
      throw new BadRequestException(
        'Only published reports can be archived',
      );
    }
    return this.prisma.report.update({
      where: { id },
      data: { status: 'ARCHIVED' },
      select: { id: true, status: true },
    });
  }

  /*
   * CSV export (Phase 20): structured snapshot sections
   * only — opportunities, actions, changes. Bounded rows,
   * never a raw database dump.
   */
  async exportCsv(
    organizationId: string,
    id: string,
    section: string,
  ) {
    const report =
      await this.prisma.report.findFirst({
        where: { id, organizationId },
        select: {
          id: true,
          title: true,
          sections: true,
        },
      });
    if (!report)
      throw new NotFoundException('Report not found');
    const sections = (report.sections ?? {}) as Record<
      string,
      any
    >;
    const cell = (value: unknown): string => {
      const text = String(value ?? '');
      return /[",\n\r]/.test(text)
        ? `"${text.replace(/"/g, '""')}"`
        : text;
    };
    const toCsv = (
      headers: string[],
      rows: string[][],
    ): string =>
      [
        headers.map(cell).join(','),
        ...rows.slice(0, 500).map((row) =>
          row.map(cell).join(','),
        ),
      ].join('\n');
    if (section === 'opportunities') {
      const items: any[] =
        sections.opportunities?.top ??
        sections.priorities?.items ??
        [];
      return {
        filename: `report-${id}-opportunities.csv`,
        contentType: 'text/csv',
        content: toCsv(
          ['title', 'priority', 'source'],
          items.map((item: any) => [
            String(item.title ?? ''),
            String(item.priority ?? ''),
            String(item.source ?? ''),
          ]),
        ),
      };
    }
    if (section === 'actions') {
      const items: any[] =
        sections.completed?.items ??
        sections.actions?.recent ??
        [];
      return {
        filename: `report-${id}-actions.csv`,
        contentType: 'text/csv',
        content: toCsv(
          ['title', 'status', 'completedAt'],
          items.map((item: any) => [
            String(item.title ?? ''),
            String(item.status ?? ''),
            String(item.completedAt ?? ''),
          ]),
        ),
      };
    }
    if (section === 'changes') {
      const rows: any[] =
        sections.changes?.rows ?? [];
      return {
        filename: `report-${id}-changes.csv`,
        contentType: 'text/csv',
        content: toCsv(
          ['metric', 'before', 'after', 'statement'],
          rows.map((row: any) => [
            String(row.label ?? ''),
            String(row.before ?? 'UNKNOWN'),
            String(row.after ?? 'UNKNOWN'),
            String(row.statement ?? ''),
          ]),
        ),
      };
    }
    throw new BadRequestException(
      'Unsupported export section. Use opportunities, actions, or changes.',
    );
  }

  // =========================================================
  // EMAIL DELIVERY (secure share link, no PDF claim)
  // =========================================================

  async sendEmail(
    organizationId: string,
    id: string,
    to: string,
    message?: string,
  ) {
    /*
     * Org-scoped load: a report can only be emailed
     * by a member of the owning organization, and
     * only a whitelisted snapshot travels by email
     * (title + secure share link, never raw org
     * internals). No PDF attachment is claimed:
     * there is no server-side PDF renderer.
     */
    const report =
      await this.prisma.report.findFirst({
        where: {
          id,
          organizationId,
        },
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          shareToken: true,
          shareExpiresAt: true,
          shareRevoked: true,
          website: {
            select: {
              name: true,
              url: true,
            },
          },
        },
      });

    if (!report) {
      throw new NotFoundException(
        'Report not found',
      );
    }

    if (
      report.status !== 'READY' &&
      report.status !== 'PUBLISHED'
    ) {
      throw new BadRequestException(
        'Only ready reports can be emailed',
      );
    }

    const shareValid =
      Boolean(report.shareToken) &&
      !report.shareRevoked &&
      (!report.shareExpiresAt ||
        new Date(report.shareExpiresAt) >
          new Date());

    /*
     * Reuse the existing share-token flow so emailed
     * links honour the same expiry/revocation rules
     * as dashboard-shared links. Default emailed
     * links to 30 days.
     */
    const shared = shareValid
      ? {
          shareToken: report.shareToken as string,
        }
      : await this.share(
          organizationId,
          id,
          30,
        );

    const organization =
      await this.prisma.organization.findUnique(
        {
          where: { id: organizationId },
          select: { name: true },
        },
      );

    const shareUrl =
      `${this.emailService.resolveAppUrl()}/share/${shared.shareToken}`;

    try {
      await this.emailService.sendReportEmail({
        to: to.trim().toLowerCase(),
        reportTitle: report.title,
        websiteName: report.website.name,
        websiteUrl: report.website.url,
        shareUrl,
        senderOrgName:
          organization?.name ?? null,
        message: message?.trim() || null,
      });
    } catch (error) {
      if (error instanceof EmailProviderError) {
        const httpStatus =
          error.code ===
          'PROVIDER_NOT_CONFIGURED'
            ? HttpStatus.SERVICE_UNAVAILABLE
            : error.code ===
                'SENDER_NOT_VERIFIED'
              ? HttpStatus.UNPROCESSABLE_ENTITY
              : HttpStatus.BAD_GATEWAY;

        throw new HttpException(
          {
            EMAIL_PROVIDER: error.code,
            delivery: 'NOT_SENT',
            message: error.message,
          },
          httpStatus,
        );
      }

      throw error;
    }

    return {
      sent: true,
      EMAIL_PROVIDER: 'CONFIGURED',
      delivery: 'SENT',
      shareUrl,
    };
  }

  async getShared(token: string) {
    const report =
      await this.prisma.report.findUnique(
        {
          where: {
            shareToken: token,
          },
          include: {
            website: {
              select: {
                name: true,
                url: true,
              },
            },
          },
        },
      );

    if (
      !report ||
      report.shareRevoked ||
      (report.status !== 'READY' &&
        report.status !== 'PUBLISHED') ||
      (report.shareExpiresAt &&
        new Date(
          report.shareExpiresAt,
        ) <= new Date())
    ) {
      throw new NotFoundException(
        'Shared report not found or no longer available',
      );
    }

    // Whitelisted snapshot only — never org internals,
    // team data, credentials, or other clients.
    return {
      title: report.title,
      type: report.type,
      dateFrom: report.dateFrom,
      dateTo: report.dateTo,
      generatedAt:
        report.createdAt,
      website: report.website,
      branding: report.branding,
      sections: report.sections,
      dataAvailability:
        report.dataAvailability,
    };
  }

  // =========================================================
  // AGENCY COMMAND CENTER (lightweight aggregates)
  // =========================================================

  async commandCenter(
    organizationId: string,
    take = 20,
  ) {
    /* Phase 41 (P1-14): this fans out to 5 count reads
     * per website. Default to 20 (bounded validation
     * path); callers may request up to 50. A reporting
     * warehouse is FOLLOW-UP, not this task. */
    const boundedTake = Math.min(
      Math.max(1, Number(take) || 20),
      50,
    );
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
          clientId: true,
          client: {
            select: {
              id: true,
              name: true,
              status: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
        take: boundedTake,
      });

    const entries = await Promise.all(
      websites.map(async (website) => {
        const [
          highOpportunities,
          openActions,
          activeAlerts,
          completedCrawls,
          latestReport,
        ] = await Promise.all([
          this.prisma.recommendation.count(
            {
              where: {
                organizationId,
                websiteId:
                  website.id,
                priority: 'HIGH',
                status: {
                  in: [
                    'OPEN',
                    'IN_PROGRESS',
                  ],
                },
              },
            },
          ),

          this.prisma.action.count({
            where: {
              organizationId,
              websiteId: website.id,
              status: {
                in: [
                  'TODO',
                  'IN_PROGRESS',
                ],
              },
            },
          }),

          this.prisma.monitoringAlert
            .count({
              where: {
                organizationId,
                websiteId:
                  website.id,
                active: true,
              },
            })
            .catch(() => 0),

          this.prisma.crawl.count({
            where: {
              websiteId:
                website.id,
              status: 'COMPLETED',
            },
          }),

          this.prisma.report.findFirst(
            {
              where: {
                organizationId,
                websiteId:
                  website.id,
              },
              orderBy: {
                createdAt: 'desc',
              },
              select: {
                id: true,
                title: true,
                type: true,
                createdAt: true,
              },
            },
          ),
        ]);

        const attention =
          highOpportunities * 3 +
          activeAlerts * 2 +
          openActions;

        return {
          website: {
            id: website.id,
            name: website.name,
            url: website.url,
          },
          client: website.client,
          highOpportunities,
          openActions,
          activeAlerts,
          completedCrawls,
          latestReport,
          missingData:
            completedCrawls === 0,
          attention,
        };
      }),
    );

    const sorted = [...entries].sort(
      (a, b) =>
        b.attention - a.attention,
    );

    return {
      totalWebsites: entries.length,
      needingAttention: sorted.filter(
        (entry) =>
          entry.attention > 0,
      ).length,
      missingData: sorted.filter(
        (entry) =>
          entry.missingData,
      ).length,
      entries: sorted,
    };
  }

  // =========================================================
  // HELPERS
  // =========================================================

  private async assertWebsite(
    organizationId: string,
    websiteId: string,
  ) {
    const website =
      await this.prisma.website.findFirst(
        {
          where: {
            id: websiteId,
            organizationId,
            isActive: true,
          },
          select: { id: true },
        },
      );

    if (!website) {
      throw new NotFoundException(
        'Website not found',
      );
    }
  }

  private async assertClient(
    organizationId: string,
    clientId: string,
  ) {
    const client =
      await this.prisma.client.findFirst(
        {
          where: {
            id: clientId,
            organizationId,
          },
          select: { id: true },
        },
      );

    if (!client) {
      throw new NotFoundException(
        'Client not found',
      );
    }

    return client;
  }
}

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

const TYPE_SECTIONS: Record<
  string,
  string[]
> = {
  EXECUTIVE: [
    'overview',
    'seo',
    'opportunities',
    'actions',
    'monitoring',
    'outcome',
    'local',
    'content',
    'backlinks',
  ],
  SEO: [
    'overview',
    'seo',
    'technical',
    'opportunities',
    'monitoring',
  ],
  AI_VISIBILITY: [
    'overview',
    'ai_visibility',
    'opportunities',
  ],
  TECHNICAL: [
    'overview',
    'seo',
    'technical',
  ],
  COMPETITOR: [
    'overview',
    'competitors',
    'opportunities',
  ],
  OUTCOME: [
    'overview',
    'outcome',
    'opportunities',
    'actions',
  ],
  AGENCY_CLIENT: [
    'overview',
    'seo',
    'opportunities',
    'actions',
    'monitoring',
    'outcome',
    'ai_visibility',
    'local',
    'content',
    'backlinks',
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
        status: 'READY',
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

    if (report.status !== 'READY') {
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
      report.status !== 'READY' ||
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
  ) {
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
        take: 50,
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

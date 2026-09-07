import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AiVisibilityService } from '../ai-visibility/ai-visibility.service';
import { GoogleService } from '../google/google.service';
import { ContentService } from '../content/content.service';
import { WebsitesService } from '../websites/websites.service';
import { CompetitorsService } from '../competitors/competitors.service';
import { MonitoringService } from '../monitoring/monitoring.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiVisibilityService: AiVisibilityService,
    private readonly googleService: GoogleService,
    private readonly contentService: ContentService,
    private readonly websitesService: WebsitesService,
    private readonly competitorsService: CompetitorsService,
    private readonly monitoringService: MonitoringService,
  ) {}

  /*
   * =========================================================
   * DASHBOARD BOOTSTRAP — first-paint payload
   * =========================================================
   *
   * Consolidates the cheap dashboard reads that every
   * Growth Command Center mount needs into ONE
   * authenticated request: one guard check, one website
   * resolution, one parallel query wave.
   *
   * Deliberately EXCLUDED (stay separate + progressive):
   * - crawl/technical-SEO summaries (heavy crawl reads)
   * - unified opportunities (heavy, up to 200 records)
   * - monitoring changes (heavier change detection)
   * - AI visibility intelligence (heavy, writes on read)
   * - ROI outcome (embeds a live GA4 call)
   * - GSC/GA4 analytics (live external Google APIs)
   * - competitor comparison (needs a competitor id first)
   * - business context (12-query fan-out of its own)
   *
   * Tenant isolation: every read below is filtered by the
   * guard-provided organizationId. A preferred websiteId
   * from another workspace can never leak — it simply
   * misses the org-scoped list and falls back to [0].
   */
  async getBootstrap(
    organizationId: string,
    preferredWebsiteId?: string,
  ): Promise<any> {
    const websites =
      await this.websitesService.findAll(
        organizationId,
      );

    const selectedWebsite =
      (preferredWebsiteId
        ? websites.find(
            (website) =>
              website.id ===
              preferredWebsiteId,
          )
        : undefined) ??
      websites[0] ??
      null;

    const selectedWebsiteId =
      selectedWebsite?.id;

    /*
     * All independent — one wave. The monitoring
     * summary reuses its tested service (which does
     * one extra indexed website check internally);
     * action buckets mirror getActions() exactly
     * (TODO/IN_PROGRESS/DONE + HIGH/MEDIUM/LOW;
     * anything else is ignored, same as today).
     */
    const [
      competitors,
      actionsByStatus,
      actionsByPriority,
      monitoringSummary,
      googleStatus,
    ] = await Promise.all([
      this.competitorsService.findAll(
        organizationId,
      ),

      this.prisma.action.groupBy({
        by: ['status'],
        where: { organizationId },
        _count: { _all: true },
      }),

      this.prisma.action.groupBy({
        by: ['priority'],
        where: { organizationId },
        _count: { _all: true },
      }),

      this.monitoringService.getSummary(
        organizationId,
        selectedWebsiteId,
      ),

      this.googleService.getConnectionStatus(
        organizationId,
      ),
    ]);

    const statusCount = new Map(
      actionsByStatus.map((row) => [
        row.status,
        row._count._all,
      ]),
    );

    const priorityCount = new Map(
      actionsByPriority.map((row) => [
        row.priority,
        row._count._all,
      ]),
    );

    return {
      websites,

      selectedWebsite,

      actionsSummary: {
        high:
          priorityCount.get('HIGH') ?? 0,
        medium:
          priorityCount.get('MEDIUM') ?? 0,
        low:
          priorityCount.get('LOW') ?? 0,
        todo:
          statusCount.get('TODO') ?? 0,
        inProgress:
          statusCount.get('IN_PROGRESS') ??
          0,
        done:
          statusCount.get('DONE') ?? 0,
      },

      competitors,

      monitoringSummary,

      googleStatus,

      generatedAt: new Date(),
    };
  }

  async getDashboard(
    organizationId: string,
    websiteId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<any> {
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

    const [
      crawls,
      competitors,
      ai,
    ] = await Promise.all([
      this.prisma.crawl.findMany({
        where: {
          websiteId,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 5,
        include: {
          pages: {
            include: {
              issues: true,
            },
          },
        },
      }),

      this.prisma.competitor.findMany({
        where: {
          websiteId,
          isActive: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          crawls: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
          },
        },
      }),

      this.aiVisibilityService.getDashboard(
        organizationId,
        websiteId,
      ),
    ]);

    const latestCrawl =
      crawls[0] ?? null;

    let seo = {
      score: 0,
      pages: 0,
      issues: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    if (latestCrawl) {
      const issues =
        latestCrawl.pages.flatMap(
          (page) => page.issues,
        );

      seo = {
        score: this.calculateSeoScore(
          latestCrawl.pages.length,
          issues,
        ),
        pages:
          latestCrawl.pages.length,
        issues:
          issues.length,
        critical:
          issues.filter(
            (i) => i.severity === 'CRITICAL',
          ).length,
        high:
          issues.filter(
            (i) => i.severity === 'HIGH',
          ).length,
        medium:
          issues.filter(
            (i) => i.severity === 'MEDIUM',
          ).length,
        low:
          issues.filter(
            (i) => i.severity === 'LOW',
          ).length,
      };
    }

    let opportunities: any = null;

    if (startDate && endDate) {
      try {
        opportunities =
          await this.contentService.getOpportunities(
            organizationId,
            startDate,
            endDate,
          );
      } catch {
        opportunities = null;
      }
    }

    return {
      website: {
        id: website.id,
        name: website.name,
        url: website.url,
        industry: website.industry,
        country: website.country,
      },

      seo,

      latestCrawl,

      competitors,

      aiVisibility: ai,

      opportunities,

      generatedAt: new Date(),
    };
  }

  private calculateSeoScore(
    pageCount: number,
    issues: any[],
  ): number {
    const pages =
      Math.max(pageCount, 1);

    const critical =
      issues.filter(
        (i) => i.severity === 'CRITICAL',
      ).length;

    const high =
      issues.filter(
        (i) => i.severity === 'HIGH',
      ).length;

    const medium =
      issues.filter(
        (i) => i.severity === 'MEDIUM',
      ).length;

    const low =
      issues.filter(
        (i) => i.severity === 'LOW',
      ).length;

    const impact = (
      count: number,
    ) =>
      count / (count + pages);

    const penalty =
      impact(critical) * 35 +
      impact(high) * 25 +
      impact(medium) * 20 +
      impact(low) * 10;

    return Math.round(
      Math.max(
        0,
        Math.min(
          100,
          100 - penalty,
        ),
      ),
    );
  }
}
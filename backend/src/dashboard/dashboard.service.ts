import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AiVisibilityService } from '../ai-visibility/ai-visibility.service';
import { GoogleService } from '../google/google.service';
import { ContentService } from '../content/content.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiVisibilityService: AiVisibilityService,
    private readonly googleService: GoogleService,
    private readonly contentService: ContentService,
  ) {}

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
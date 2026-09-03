import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AiVisibilityService {
  constructor(private readonly prisma: PrismaService) {}

  private async verifyWebsite(
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

    return website;
  }

  async getDashboard(
    organizationId: string,
    websiteId: string,
  ) {
    const website = await this.verifyWebsite(
      organizationId,
      websiteId,
    );

    const queries =
      await this.prisma.aiVisibilityQuery.findMany({
        where: {
          websiteId,
          isActive: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

    const checks =
      await this.prisma.aiVisibilityCheck.findMany({
        where: {
          websiteId,
        },
        orderBy: {
          checkedAt: 'desc',
        },
        take: 100,
      });

    const latestSummary =
      await this.prisma.aiVisibilitySummary.findFirst({
        where: {
          websiteId,
        },
        orderBy: {
          date: 'desc',
        },
      });

    const latestAeoAudit =
      await this.prisma.aeoAudit.findFirst({
        where: {
          websiteId,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

    const latestGeoAudit =
      await this.prisma.geoAudit.findFirst({
        where: {
          websiteId,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

    const completedChecks = checks.filter(
      (check) => check.status === 'COMPLETED',
    );

    const mentionedChecks = completedChecks.filter(
      (check) => check.mentioned,
    );

    const citedChecks = completedChecks.filter(
      (check) => check.citationFound,
    );

    const mentionedQueries = new Set<string>();

    const citedQueries = new Set<string>();

    for (const check of completedChecks) {
      if (check.mentioned) {
        mentionedQueries.add(check.query);
      }

      if (check.citationFound) {
        citedQueries.add(check.query);
      }
    }

    const positions = mentionedChecks
      .map((check) => check.position)
      .filter(
        (position): position is number =>
          position !== null,
      );

    const averagePosition = positions.length
      ? positions.reduce(
          (sum, position) => sum + position,
          0,
        ) / positions.length
      : null;

    const visibilityScore =
      latestSummary?.visibilityScore ??
      this.calculateVisibilityScore(
        queries.length,
        mentionedQueries.size,
        citedQueries.size,
      );

    return {
      website,
      score: visibilityScore,
      queries,
      checks,
      summary: latestSummary,
      metrics: {
        totalQueries: queries.length,
        completedChecks: completedChecks.length,
        mentionedQueries: mentionedQueries.size,
        citedQueries: citedQueries.size,
        averagePosition,
        competitorMentions: completedChecks.reduce(
          (total, check) =>
            total +
            (check.competitorNames?.length ?? 0),
          0,
        ),
      },
      aeo: latestAeoAudit,
      geo: latestGeoAudit,
    };
  }

  async getHistory(
    organizationId: string,
    websiteId: string,
    days = 30,
  ) {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );

    const safeDays = Math.min(
      Math.max(Number(days) || 30, 1),
      365,
    );

    const from = new Date();

    from.setHours(0, 0, 0, 0);

    from.setDate(
      from.getDate() - (safeDays - 1),
    );

    const summaries =
      await this.prisma.aiVisibilitySummary.findMany({
        where: {
          websiteId,
          date: {
            gte: from,
          },
        },
        orderBy: {
          date: 'asc',
        },
      });

    return {
      websiteId,
      days: safeDays,
      summaries,
    };
  }

  async createSnapshot(
    organizationId: string,
    websiteId: string,
  ) {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );

    const queries =
      await this.prisma.aiVisibilityQuery.findMany({
        where: {
          websiteId,
          isActive: true,
        },
        select: {
          id: true,
          query: true,
        },
      });

    const checks =
      await this.prisma.aiVisibilityCheck.findMany({
        where: {
          websiteId,
          status: 'COMPLETED',
        },
        orderBy: {
          checkedAt: 'desc',
        },
        take: 1000,
      });

    const uniqueMentionedQueries =
      new Set<string>();

    const uniqueCitedQueries =
      new Set<string>();

    for (const check of checks) {
      if (check.mentioned) {
        uniqueMentionedQueries.add(
          check.query,
        );
      }

      if (check.citationFound) {
        uniqueCitedQueries.add(
          check.query,
        );
      }
    }

    const mentionedQueries =
      uniqueMentionedQueries.size;

    const citedQueries =
      uniqueCitedQueries.size;

    const positions = checks
      .filter((check) => check.mentioned)
      .map((check) => check.position)
      .filter(
        (position): position is number =>
          position !== null,
      );

    const averagePosition = positions.length
      ? positions.reduce(
          (sum, position) => sum + position,
          0,
        ) / positions.length
      : null;

    const totalQueries = queries.length;

    const visibilityScore =
      this.calculateVisibilityScore(
        totalQueries,
        mentionedQueries,
        citedQueries,
      );

    const citationRate =
      totalQueries > 0
        ? (citedQueries / totalQueries) * 100
        : 0;

    const competitorMentions =
      checks.reduce(
        (total, check) =>
          total +
          (check.competitorNames?.length ?? 0),
        0,
      );

    const now = new Date();

    const date = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    const summary =
      await this.prisma.aiVisibilitySummary.upsert({
        where: {
          websiteId_date: {
            websiteId,
            date,
          },
        },
        create: {
          id: crypto.randomUUID(),
          websiteId,
          date,
          totalQueries,
          mentionedQueries,
          citedQueries,
          visibilityScore,
          citationRate,
          averagePosition,
          competitorMentions,
          updatedAt: now,
        },
        update: {
          totalQueries,
          mentionedQueries,
          citedQueries,
          visibilityScore,
          citationRate,
          averagePosition,
          competitorMentions,
          updatedAt: now,
        },
      });

    return summary;
  }

  private calculateVisibilityScore(
    totalQueries: number,
    mentions: number,
    citations: number,
  ) {
    if (!totalQueries) {
      return 0;
    }

    const mentionRate = Math.min(
      mentions / totalQueries,
      1,
    );

    const citationRate = Math.min(
      citations / totalQueries,
      1,
    );

    return Math.round(
      mentionRate * 70 +
      citationRate * 30,
    );
  }
}

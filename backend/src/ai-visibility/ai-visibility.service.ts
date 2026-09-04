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

    const platformStats = new Map<
      string,
      {
        completed: number;
        mentioned: number;
        cited: number;
      }
    >();

    for (const check of completedChecks) {
      const platform = check.platform || 'Unknown';

      const current = platformStats.get(platform) ?? {
        completed: 0,
        mentioned: 0,
        cited: 0,
      };

      current.completed += 1;

      if (check.mentioned) {
        current.mentioned += 1;
      }

      if (check.citationFound) {
        current.cited += 1;
      }

      platformStats.set(platform, current);
    }

    const queryPerformance = queries.map((query) => {
      const queryChecks = completedChecks.filter(
        (check) => check.query === query.query,
      );

      const mentioned = queryChecks.filter(
        (check) => check.mentioned,
      ).length;

      const cited = queryChecks.filter(
        (check) => check.citationFound,
      ).length;

      const queryPositions = queryChecks
        .map((check) => check.position)
        .filter(
          (position): position is number =>
            position !== null,
        );

      return {
        id: query.id,
        query: query.query,
        category: query.category,
        checks: queryChecks.length,
        mentioned,
        cited,
        mentionRate:
          queryChecks.length > 0
            ? Math.round(
                (mentioned / queryChecks.length) * 100,
              )
            : null,
        citationRate:
          queryChecks.length > 0
            ? Math.round(
                (cited / queryChecks.length) * 100,
              )
            : null,
        averagePosition: queryPositions.length
          ? queryPositions.reduce(
              (sum, position) => sum + position,
              0,
            ) / queryPositions.length
          : null,
      };
    });

    const citationGapQueries = queryPerformance
      .filter(
        (item) =>
          item.checks > 0 &&
          item.mentioned > 0 &&
          item.cited === 0,
      )
      .sort(
        (a, b) => b.mentioned - a.mentioned,
      );

    const visibilityGapQueries = queryPerformance
      .filter(
        (item) =>
          item.checks > 0 &&
          item.mentioned === 0,
      );

    const competitorMentionCount =
      completedChecks.reduce(
        (total, check) =>
          total +
          (check.competitorNames?.length ?? 0),
        0,
      );

    const opportunities: any[] = [];

    if (citationGapQueries.length > 0) {
      opportunities.push({
        key: 'AI_CITATION_GAP',
        type: 'AI_VISIBILITY',
        priority: 'HIGH',
        title: 'Convert AI mentions into citations',
        description:
          `${citationGapQueries.length} tracked queries mention the website without a recorded citation.`,
        count: citationGapQueries.length,
        queries: citationGapQueries
          .slice(0, 10)
          .map((item) => item.query),
        actionText:
          'Strengthen authoritative, quotable content around these queries and improve supporting entity signals.',
      });
    }

    if (visibilityGapQueries.length > 0) {
      opportunities.push({
        key: 'AI_VISIBILITY_GAP',
        type: 'AI_VISIBILITY',
        priority: 'MEDIUM',
        title: 'Improve uncovered AI queries',
        description:
          `${visibilityGapQueries.length} tracked queries have completed checks without a recorded brand mention.`,
        count: visibilityGapQueries.length,
        queries: visibilityGapQueries
          .slice(0, 10)
          .map((item) => item.query),
        actionText:
          'Create or improve content that directly answers these queries and reinforces the website entity.',
      });
    }

    if (
      competitorMentionCount > 0 &&
      citedQueries.size < mentionedQueries.size
    ) {
      opportunities.push({
        key: 'AI_COMPETITOR_GAP',
        type: 'AI_VISIBILITY',
        priority: 'MEDIUM',
        title: 'Close competitor visibility gaps',
        description:
          'Completed AI checks contain competitor mentions while some tracked queries lack a recorded citation.',
        count: competitorMentionCount,
        actionText:
          'Compare competitor-mentioned topics with your strongest pages and strengthen missing authority signals.',
      });
    }

    // Persist AI visibility opportunities as real Recommendation records.
    // Uses findFirst because Recommendation has no compound unique constraint.
    const persistedOpportunities: any[] = [];

    for (const opportunity of opportunities) {
      const existing = await this.prisma.recommendation.findFirst({
        where: {
          organizationId,
          websiteId,
          source: 'AI_VISIBILITY',
          type: opportunity.key,
          title: opportunity.title,
        },
      });

      const data = {
        organizationId,
        websiteId,
        source: 'AI_VISIBILITY',
        type: opportunity.key,
        title: opportunity.title,
        description: opportunity.description,
        priority: opportunity.priority,
        impact: opportunity.impact || 'MEDIUM',
        effort: opportunity.effort || 'MEDIUM',
        actionText: opportunity.actionText || null,
        metadata: {
          websiteId,
          source: 'AI_VISIBILITY',
          opportunityKey: opportunity.key,
          count: opportunity.count || 0,
          queries: opportunity.queries || [],
        },
      };

      const recommendation = existing
        ? await this.prisma.recommendation.update({
            where: { id: existing.id },
            data,
          })
        : await this.prisma.recommendation.create({
            data,
          });

      persistedOpportunities.push({
        ...opportunity,
        recommendationId: recommendation.id,
      });
    }

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
        competitorMentions: competitorMentionCount,
      },
      platformStats: Array.from(
        platformStats.entries(),
      ).map(([platform, stats]) => ({
        platform,
        ...stats,
        mentionRate:
          stats.completed > 0
            ? Math.round(
                (stats.mentioned / stats.completed) * 100,
              )
            : 0,
        citationRate:
          stats.completed > 0
            ? Math.round(
                (stats.cited / stats.completed) * 100,
              )
            : 0,
      })),
      queryPerformance,
      opportunities: persistedOpportunities,
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
        uniqueMentionedQueries.add(check.query);
      }

      if (check.citationFound) {
        uniqueCitedQueries.add(check.query);
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

    return this.prisma.aiVisibilitySummary.upsert({
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






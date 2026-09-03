import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LocalSeoService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private async getWebsite(
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

  async summary(
    organizationId: string,
    websiteId: string,
  ) {
    await this.getWebsite(organizationId, websiteId);

    const latestAudit = await this.prisma.geoAudit.findFirst({
      where: { websiteId },
      orderBy: { createdAt: 'desc' },
    });

    const queries = await this.prisma.geoQuery.findMany({
      where: { websiteId },
    });

    const totalQueries = queries.length;
    const mentioned = queries.filter((q) => q.mentioned).length;
    const cited = queries.filter((q) => q.cited).length;

    const mentionRate =
      totalQueries > 0
        ? Math.round((mentioned / totalQueries) * 100)
        : 0;

    const citationRate =
      totalQueries > 0
        ? Math.round((cited / totalQueries) * 100)
        : 0;

    return {
      websiteId,
      audit: latestAudit,
      queries: {
        total: totalQueries,
        mentioned,
        cited,
        mentionRate,
        citationRate,
      },
    };
  }

  async audits(
    organizationId: string,
    websiteId: string,
  ) {
    await this.getWebsite(organizationId, websiteId);

    const audits = await this.prisma.geoAudit.findMany({
      where: { websiteId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      websiteId,
      total: audits.length,
      audits,
    };
  }

  async queries(
    organizationId: string,
    websiteId: string,
  ) {
    await this.getWebsite(organizationId, websiteId);

    const queries = await this.prisma.geoQuery.findMany({
      where: { websiteId },
      orderBy: { checkedAt: 'desc' },
      take: 500,
    });

    return {
      websiteId,
      total: queries.length,
      queries,
    };
  }

  async opportunities(
    organizationId: string,
    websiteId: string,
  ) {
    await this.getWebsite(organizationId, websiteId);

    const queries = await this.prisma.geoQuery.findMany({
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
      take: 100,
    });

    const opportunities = queries.map((q) => ({
      id: q.id,
      query: q.query,
      engine: q.engine,
      mentioned: q.mentioned,
      cited: q.cited,
      position: q.position,
      priority:
        !q.mentioned && !q.cited
          ? 'HIGH'
          : 'MEDIUM',
      reason:
        !q.mentioned
          ? 'Business is not being mentioned for this local query.'
          : 'Business is mentioned but not cited.',
      suggestedAction:
        !q.mentioned
          ? 'Improve local relevance, entity signals and location-specific content.'
          : 'Improve citation and authority signals for this query.',
    }));

    return {
      websiteId,
      total: opportunities.length,
      opportunities,
    };
  }
}

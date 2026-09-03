import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GeoService {
  constructor(private readonly prisma: PrismaService) {}

  private clamp(value: number): number {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  private ratio(
    numerator: number,
    denominator: number,
  ): number {
    return denominator > 0 ? numerator / denominator : 0;
  }

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

  async getLatestAudit(
    organizationId: string,
    websiteId: string,
  ) {
    await this.getWebsite(organizationId, websiteId);

    return this.prisma.geoAudit.findFirst({
      where: { websiteId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getQueries(
    organizationId: string,
    websiteId: string,
  ) {
    await this.getWebsite(organizationId, websiteId);

    return this.prisma.geoQuery.findMany({
      where: { websiteId },
      orderBy: { checkedAt: 'desc' },
      take: 100,
    });
  }

  async runAudit(
    organizationId: string,
    websiteId: string,
  ) {
    const website = await this.getWebsite(
      organizationId,
      websiteId,
    );

    const crawl = await this.prisma.crawl.findFirst({
      where: {
        websiteId,
        status: 'COMPLETED',
      },
      orderBy: {
        completedAt: 'desc',
      },
      include: {
        pages: true,
      },
    });

    const businessBrain =
      await this.prisma.businessBrain.findUnique({
        where: { websiteId },
      });

    const backlinks =
      await this.prisma.backlink.findMany({
        where: {
          websiteId,
          status: 'ACTIVE',
        },
        select: {
          domainAuthority: true,
          pageAuthority: true,
          isToxic: true,
        },
      });

    const geoQueries =
      await this.prisma.geoQuery.findMany({
        where: { websiteId },
      });

    const pages = crawl?.pages ?? [];

    /*
     * =========================================================
     * ENTITY SCORE
     * =========================================================
     *
     * Measures whether the website clearly communicates:
     * - title
     * - meta
     * - H1
     * - structured data
     * - business identity
     */

    const entitySignals = [
      pages.filter((p) => Boolean(p.title?.trim())).length,
      pages.filter((p) => Boolean(p.metaDescription?.trim())).length,
      pages.filter((p) => p.h1?.length > 0).length,
      pages.filter((p) => p.structuredDataCount > 0).length,
      businessBrain?.businessName ? 1 : 0,
      businessBrain?.description ? 1 : 0,
      businessBrain?.services?.length ? 1 : 0,
      businessBrain?.targetAudience ? 1 : 0,
      businessBrain?.uniqueSellingPoint ? 1 : 0,
    ];

    const entityPageDenominator =
      pages.length * 4;

    const pageEntitySignals =
      entitySignals
        .slice(0, 4)
        .reduce((a, b) => a + b, 0);

    const businessEntitySignals =
      entitySignals
        .slice(4)
        .reduce((a, b) => a + b, 0);

    const entityPageScore =
      entityPageDenominator > 0
        ? this.ratio(
            pageEntitySignals,
            entityPageDenominator,
          ) * 80
        : 0;

    const entityBusinessScore =
      this.ratio(
        businessEntitySignals,
        5,
      ) * 20;

    const entityScore = this.clamp(
      entityPageScore + entityBusinessScore,
    );

    /*
     * =========================================================
     * CONTENT SCORE
     * =========================================================
     */

    const contentReadyPages =
      pages.filter(
        (p) =>
          Boolean(p.title?.trim()) &&
          Boolean(p.metaDescription?.trim()) &&
          p.h1?.length > 0 &&
          p.wordCount >= 300,
      ).length;

    const contentScore =
      this.clamp(
        this.ratio(
          contentReadyPages,
          pages.length,
        ) * 100,
      );

    /*
     * =========================================================
     * AUTHORITY SCORE
     * =========================================================
     */

    const usableAuthority =
      backlinks
        .map(
          (b) =>
            b.domainAuthority ??
            b.pageAuthority ??
            0,
        )
        .filter((v) => Number.isFinite(v));

    const nonToxicBacklinks =
      backlinks.filter(
        (b) => !b.isToxic,
      ).length;

    const authorityAverage =
      usableAuthority.length > 0
        ? usableAuthority.reduce(
            (sum, value) => sum + value,
            0,
          ) / usableAuthority.length
        : 0;

    const authorityBase =
      this.clamp(authorityAverage);

    const authorityCoverage =
      this.clamp(
        Math.min(
          20,
          nonToxicBacklinks > 0
            ? Math.log10(
                nonToxicBacklinks + 1,
              ) * 10
            : 0,
        ),
      );

    const authorityScore =
      this.clamp(
        authorityBase * 0.8 +
        authorityCoverage,
      );

    /*
     * =========================================================
     * CITATION SCORE
     * =========================================================
     *
     * Only real GeoQuery observations count.
     */

    const cited =
      geoQueries.filter(
        (q) => q.cited,
      ).length;

    const mentioned =
      geoQueries.filter(
        (q) => q.mentioned,
      ).length;

    const citationScore =
      geoQueries.length > 0
        ? this.clamp(
            this.ratio(
              cited,
              geoQueries.length,
            ) * 70 +
            this.ratio(
              mentioned,
              geoQueries.length,
            ) * 30,
          )
        : 0;

    /*
     * =========================================================
     * OVERALL GEO SCORE
     * =========================================================
     *
     * Citation receives the strongest weight only when
     * real GEO observations exist.
     */

    const hasGeoObservations =
      geoQueries.length > 0;

    const overallScore =
      hasGeoObservations
        ? this.clamp(
            entityScore * 0.25 +
            citationScore * 0.30 +
            authorityScore * 0.20 +
            contentScore * 0.25,
          )
        : this.clamp(
            entityScore * 0.35 +
            authorityScore * 0.25 +
            contentScore * 0.40,
          );

    const audit =
      await this.prisma.geoAudit.create({
        data: {
          id: `geo_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 9)}`,
          websiteId: website.id,
          overallScore,
          entityScore,
          citationScore,
          authorityScore,
          contentScore,
          updatedAt: new Date(),
        },
      });

    return {
      audit,
      data: {
        website: {
          id: website.id,
          name: website.name,
          url: website.url,
        },
        crawlId: crawl?.id ?? null,
        pagesAnalyzed: pages.length,
        geoQueries: geoQueries.length,
        mentioned,
        cited,
        hasGeoObservations,
        backlinksAnalyzed: backlinks.length,
      },
    };
  }
}


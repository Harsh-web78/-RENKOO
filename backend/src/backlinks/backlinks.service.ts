import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

interface ImportBacklinkItem {
  sourceUrl: string;
  targetUrl: string;
  sourceDomain: string;

  anchorText?: string;

  linkType?: string;

  status?: string;

  domainAuthority?: number;

  pageAuthority?: number;

  isToxic?: boolean;
}

interface ImportBacklinksDto {
  backlinks: ImportBacklinkItem[];
}

@Injectable()
export class BacklinksService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /*
   * =========================================================
   * WEBSITE VALIDATION
   * =========================================================
   */

  private async getWebsite(
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

  /*
   * =========================================================
   * OVERVIEW
   * GET /backlinks/:websiteId
   * =========================================================
   */

  async getOverview(
    organizationId: string,
    websiteId: string,
  ) {
    await this.getWebsite(
      organizationId,
      websiteId,
    );

    const [
      totalBacklinks,
      referringDomains,
      dofollowLinks,
      nofollowLinks,
      toxicLinks,
      snapshot,
    ] = await Promise.all([
      this.prisma.backlink.count({
        where: {
          websiteId,
          status: 'ACTIVE',
        },
      }),

      this.prisma.backlinkDomain.count({
        where: {
          websiteId,
        },
      }),

      this.prisma.backlink.count({
        where: {
          websiteId,
          status: 'ACTIVE',
          linkType: 'DOFOLLOW',
        },
      }),

      this.prisma.backlink.count({
        where: {
          websiteId,
          status: 'ACTIVE',
          linkType: 'NOFOLLOW',
        },
      }),

      this.prisma.backlink.count({
        where: {
          websiteId,
          isToxic: true,
        },
      }),

      this.prisma.backlinkSnapshot.findFirst({
        where: {
          websiteId,
        },
        orderBy: {
          date: 'desc',
        },
      }),
    ]);

    const authorityScore =
      snapshot?.authorityScore ?? 0;

    return {
      websiteId,

      summary: {
        totalBacklinks,
        referringDomains,
        dofollowLinks,
        nofollowLinks,
        toxicLinks,
        authorityScore,

        newBacklinks:
          snapshot?.newBacklinks ?? 0,

        lostBacklinks:
          snapshot?.lostBacklinks ?? 0,
      },

      snapshot: snapshot
        ? {
            date: snapshot.date,

            totalBacklinks:
              snapshot.totalBacklinks,

            referringDomains:
              snapshot.referringDomains,

            dofollowLinks:
              snapshot.dofollowLinks,

            nofollowLinks:
              snapshot.nofollowLinks,

            toxicLinks:
              snapshot.toxicLinks,

            authorityScore:
              snapshot.authorityScore,

            newBacklinks:
              snapshot.newBacklinks,

            lostBacklinks:
              snapshot.lostBacklinks,
          }
        : null,
    };
  }

  /*
   * =========================================================
   * BACKLINK LIST
   * GET /backlinks/:websiteId/list
   * =========================================================
   */

  async getBacklinks(
    organizationId: string,
    websiteId: string,
  ) {
    await this.getWebsite(
      organizationId,
      websiteId,
    );

    const backlinks =
      await this.prisma.backlink.findMany({
        where: {
          websiteId,
        },

        orderBy: {
          lastSeenAt: 'desc',
        },

        take: 500,
      });

    return {
      websiteId,
      total: backlinks.length,
      backlinks,
    };
  }

  /*
   * =========================================================
   * REFERRING DOMAINS
   * GET /backlinks/:websiteId/domains
   * =========================================================
   */

  async getDomains(
    organizationId: string,
    websiteId: string,
  ) {
    await this.getWebsite(
      organizationId,
      websiteId,
    );

    const domains =
      await this.prisma.backlinkDomain.findMany({
        where: {
          websiteId,
        },

        orderBy: [
          {
            authorityScore: 'desc',
          },
          {
            backlinkCount: 'desc',
          },
        ],

        take: 500,
      });

    return {
      websiteId,
      total: domains.length,
      domains,
    };
  }

  /*
   * =========================================================
   * OPPORTUNITIES
   * GET /backlinks/:websiteId/opportunities
   * =========================================================
   */

  async getOpportunities(
    organizationId: string,
    websiteId: string,
  ) {
    await this.getWebsite(
      organizationId,
      websiteId,
    );

    const opportunities =
      await this.prisma.backlinkOpportunity.findMany({
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
      });

    const summary = {
      total: opportunities.length,

      high: opportunities.filter(
        (item) =>
          item.priority === 'HIGH',
      ).length,

      medium: opportunities.filter(
        (item) =>
          item.priority === 'MEDIUM',
      ).length,

      low: opportunities.filter(
        (item) =>
          item.priority === 'LOW',
      ).length,
    };

    return {
      websiteId,
      summary,
      opportunities,
    };
  }

  /*
   * =========================================================
   * IMPORT BACKLINKS
   *
   * POST /backlinks/:websiteId/import
   * =========================================================
   */

  async importBacklinks(
    organizationId: string,
    websiteId: string,
    dto: ImportBacklinksDto,
  ) {
    await this.getWebsite(
      organizationId,
      websiteId,
    );

    if (
      !dto ||
      !Array.isArray(dto.backlinks)
    ) {
      return {
        websiteId,
        imported: 0,
        updated: 0,
        success: false,
        message:
          'backlinks must be an array',
      };
    }

    const now = new Date();

    let imported = 0;
    let updated = 0;

    /*
     * ---------------------------------------------------------
     * PROCESS EACH BACKLINK
     * ---------------------------------------------------------
     */

    for (const item of dto.backlinks) {
      if (
        !item.sourceUrl ||
        !item.targetUrl ||
        !item.sourceDomain
      ) {
        continue;
      }

      const sourceUrl =
        item.sourceUrl.trim();

      const targetUrl =
        item.targetUrl.trim();

      const sourceDomain =
        item.sourceDomain
          .trim()
          .toLowerCase();

      /*
       * Find existing backlink.
       */

      const existing =
        await this.prisma.backlink.findFirst({
          where: {
            websiteId,
            sourceUrl,
            targetUrl,
          },
        });

      /*
       * -------------------------------------------------------
       * UPDATE EXISTING
       * -------------------------------------------------------
       */

      if (existing) {
        await this.prisma.backlink.update({
          where: {
            id: existing.id,
          },

          data: {
            sourceDomain,

            anchorText:
              item.anchorText?.trim() ??
              null,

            linkType:
              item.linkType?.trim() ??
              'UNKNOWN',

            status:
              item.status?.trim() ??
              'ACTIVE',

            domainAuthority:
              item.domainAuthority ??
              null,

            pageAuthority:
              item.pageAuthority ??
              null,

            isToxic:
              item.isToxic ?? false,

            lastSeenAt: now,
          },
        });

        updated++;

        continue;
      }

      /*
       * -------------------------------------------------------
       * CREATE NEW
       * -------------------------------------------------------
       */

      await this.prisma.backlink.create({
        data: {
          websiteId,

          sourceUrl,

          targetUrl,

          sourceDomain,

          anchorText:
            item.anchorText?.trim() ??
            null,

          linkType:
            item.linkType?.trim() ??
            'UNKNOWN',

          status:
            item.status?.trim() ??
            'ACTIVE',

          domainAuthority:
            item.domainAuthority ??
            null,

          pageAuthority:
            item.pageAuthority ??
            null,

          isToxic:
            item.isToxic ?? false,

          firstSeenAt: now,

          lastSeenAt: now,
        },
      });

      imported++;
    }

    /*
     * ---------------------------------------------------------
     * REBUILD DOMAIN AGGREGATES
     * ---------------------------------------------------------
     */

    await this.rebuildDomains(
      websiteId,
    );

    /*
     * ---------------------------------------------------------
     * CREATE / UPDATE DAILY SNAPSHOT
     * ---------------------------------------------------------
     */

    await this.createSnapshot(
      websiteId,
    );

    /*
     * ---------------------------------------------------------
     * GENERATE OPPORTUNITIES
     * ---------------------------------------------------------
     */

    await this.generateOpportunities(
      websiteId,
    );

    return {
      websiteId,

      imported,

      updated,

      totalProcessed:
        imported + updated,

      success: true,
    };
  }

  /*
   * =========================================================
   * REBUILD REFERRING DOMAINS
   * =========================================================
   */

  private async rebuildDomains(
    websiteId: string,
  ) {
    const backlinks =
      await this.prisma.backlink.findMany({
        where: {
          websiteId,
          status: 'ACTIVE',
        },
      });

    const grouped =
      new Map<
        string,
        typeof backlinks
      >();

    /*
     * Group backlinks by source domain.
     */

    for (const backlink of backlinks) {
      const domain =
        backlink.sourceDomain
          .trim()
          .toLowerCase();

      const existing =
        grouped.get(domain) ?? [];

      existing.push(backlink);

      grouped.set(
        domain,
        existing,
      );
    }

    /*
     * Upsert each domain.
     */

    for (const [
      domain,
      links,
    ] of grouped.entries()) {
      const authorityValues =
        links
          .map(
            (link) =>
              link.domainAuthority,
          )
          .filter(
            (
              value,
            ): value is number =>
              value !== null &&
              value !== undefined,
          );

      const authorityScore =
        authorityValues.length > 0
          ? authorityValues.reduce(
              (
                sum,
                value,
              ) =>
                sum + value,
              0,
            ) /
            authorityValues.length
          : 0;

      const dofollowCount =
        links.filter(
          (link) =>
            link.linkType ===
            'DOFOLLOW',
        ).length;

      const nofollowCount =
        links.filter(
          (link) =>
            link.linkType ===
            'NOFOLLOW',
        ).length;

      const toxicCount =
        links.filter(
          (link) =>
            link.isToxic === true,
        ).length;

      /*
       * IMPORTANT:
       *
       * This uses the existing compound unique key:
       * websiteId + domain
       *
       * If Prisma reports that this key does not exist,
       * do NOT guess the schema. Run:
       *
       * npx prisma db pull
       * npx prisma generate
       *
       * and inspect the generated model.
       */

      await this.prisma.backlinkDomain.upsert({
        where: {
          websiteId_domain: {
            websiteId,
            domain,
          },
        },

        create: {
          websiteId,

          domain,

          backlinkCount:
            links.length,

          authorityScore,

          dofollowCount,

          nofollowCount,

          toxicCount,
        },

        update: {
          backlinkCount:
            links.length,

          authorityScore,

          dofollowCount,

          nofollowCount,

          toxicCount,

          lastSeenAt:
            new Date(),
        },
      });
    }
  }

  /*
   * =========================================================
   * DAILY SNAPSHOT
   * =========================================================
   */

  private async createSnapshot(
    websiteId: string,
  ) {
    const [
      backlinks,
      domains,
    ] = await Promise.all([
      this.prisma.backlink.findMany({
        where: {
          websiteId,
          status: 'ACTIVE',
        },
      }),

      this.prisma.backlinkDomain.findMany({
        where: {
          websiteId,
        },
      }),
    ]);

    const dofollowLinks =
      backlinks.filter(
        (link) =>
          link.linkType ===
          'DOFOLLOW',
      ).length;

    const nofollowLinks =
      backlinks.filter(
        (link) =>
          link.linkType ===
          'NOFOLLOW',
      ).length;

    const toxicLinks =
      backlinks.filter(
        (link) =>
          link.isToxic === true,
      ).length;

    /*
     * Average authority across referring domains.
     */

    const authorityValues =
      domains
        .map(
          (domain) =>
            domain.authorityScore,
        )
        .filter(
          (value) =>
            typeof value ===
              'number' &&
            value > 0,
        );

    const authorityScore =
      authorityValues.length > 0
        ? authorityValues.reduce(
            (
              sum,
              value,
            ) =>
              sum + value,
            0,
          ) /
          authorityValues.length
        : 0;

    /*
     * Start of today.
     */

    const today =
      new Date();

    today.setHours(
      0,
      0,
      0,
      0,
    );

    /*
     * ---------------------------------------------------------
     * PREVIOUS SNAPSHOT
     * ---------------------------------------------------------
     */

    const previousSnapshot =
      await this.prisma.backlinkSnapshot.findFirst({
        where: {
          websiteId,
          date: {
            lt: today,
          },
        },

        orderBy: {
          date: 'desc',
        },
      });

    const previousTotal =
      previousSnapshot
        ?.totalBacklinks ?? 0;

    /*
     * New / lost is based on count difference.
     *
     * This is intentionally conservative.
     * We are NOT pretending to know exact lost URLs
     * unless historical backlink records prove it.
     */

    const difference =
      backlinks.length -
      previousTotal;

    const newBacklinks =
      difference > 0
        ? difference
        : 0;

    const lostBacklinks =
      difference < 0
        ? Math.abs(difference)
        : 0;

    /*
     * ---------------------------------------------------------
     * UPSERT TODAY
     * ---------------------------------------------------------
     */

    await this.prisma.backlinkSnapshot.upsert({
      where: {
        websiteId_date: {
          websiteId,
          date: today,
        },
      },

      create: {
        websiteId,

        date: today,

        totalBacklinks:
          backlinks.length,

        referringDomains:
          domains.length,

        dofollowLinks,

        nofollowLinks,

        toxicLinks,

        authorityScore,

        newBacklinks,

        lostBacklinks,
      },

      update: {
        totalBacklinks:
          backlinks.length,

        referringDomains:
          domains.length,

        dofollowLinks,

        nofollowLinks,

        toxicLinks,

        authorityScore,

        newBacklinks,

        lostBacklinks,
      },
    });
  }

  /*
   * =========================================================
   * OPPORTUNITY ENGINE
   * =========================================================
   *
   * Generates actionable backlink opportunities from
   * referring domains.
   *
   * We deliberately avoid fake "competitor backlinks"
   * because we don't have competitor backlink data yet.
   * =========================================================
   */

  private async generateOpportunities(
    websiteId: string,
  ) {
    const domains =
      await this.prisma.backlinkDomain.findMany({
        where: {
          websiteId,
        },
      });

    for (const domain of domains) {
      /*
       * Skip weak / toxic domains.
       */

      if (
        domain.authorityScore <= 0 ||
        domain.toxicCount > 0
      ) {
        continue;
      }

      /*
       * If the domain already links to the website,
       * this is not automatically a prospect.
       *
       * We only create an opportunity when there are
       * multiple links but limited dofollow links.
       */

      if (
        domain.backlinkCount < 2 ||
        domain.dofollowCount > 0
      ) {
        continue;
      }

      const score =
        Math.min(
          100,
          Math.round(
            domain.authorityScore *
              0.7 +
              Math.min(
                domain.backlinkCount *
                  5,
                30,
              ),
          ),
        );

      const priority =
        score >= 70
          ? 'HIGH'
          : score >= 40
            ? 'MEDIUM'
            : 'LOW';

      /*
       * Avoid duplicate OPEN opportunities.
       */

      const existing =
        await this.prisma.backlinkOpportunity.findFirst(
          {
            where: {
              websiteId,

              sourceDomain:
                domain.domain,

              status: 'OPEN',
            },
          },
        );

      if (existing) {
        await this.prisma.backlinkOpportunity.update(
          {
            where: {
              id: existing.id,
            },

            data: {
              opportunityScore:
                score,

              priority,
            },
          },
        );

        continue;
      }

      /*
       * Create new opportunity.
       */

      await this.prisma.backlinkOpportunity.create({
        data: {
          websiteId,

          sourceDomain:
            domain.domain,

          opportunityType:
            'RESOURCE_LINK',

          opportunityScore:
            score,

          priority,

          status: 'OPEN',
        },
      });
    }
  }
}


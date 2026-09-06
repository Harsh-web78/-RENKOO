import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import {
  classifyQuality,
  relevanceHit,
} from './quality';
import { backlinkProviderStatus } from './backlinks.provider';
import type {
  CreateBacklinkOpportunityDto,
  UpdateBacklinkOpportunityDto,
} from './dto/import-backlinks.dto';

const OPPORTUNITY_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'DONE',
  'DISMISSED',
] as const;

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

  source?: string;
}

interface ImportBacklinksDto {
  backlinks: ImportBacklinkItem[];
  source?: string;
}

@Injectable()
export class BacklinksService {
  private readonly logger = new Logger(
    BacklinksService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly monitoringService: MonitoringService,
  ) {}

  getProviderStatus() {
    return backlinkProviderStatus();
  }

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
      activeLinks,
      historyCount,
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

      this.prisma.backlink.findMany({
        where: {
          websiteId,
          status: 'ACTIVE',
        },
        select: {
          linkType: true,
          status: true,
          domainAuthority: true,
          isToxic: true,
          source: true,
        },
        take: 2000,
      }),

      this.prisma.backlinkSnapshot.count({
        where: {
          websiteId,
        },
      }),
    ]);

    const authorityScore =
      snapshot?.authorityScore ?? 0;

    const qualityBreakdown: Record<
      string,
      number
    > = {
      HIGH_VALUE: 0,
      RELEVANT: 0,
      NEUTRAL: 0,
      LOW_SIGNAL: 0,
      UNKNOWN: 0,
    };

    const sources: Record<string, number> =
      {};

    for (const link of activeLinks) {
      sources[link.source] =
        (sources[link.source] ?? 0) + 1;

      const verdict = classifyQuality({
        linkType: link.linkType,
        status: link.status,
        domainAuthority:
          link.domainAuthority,
        isToxic: link.isToxic,
      });

      qualityBreakdown[verdict.quality] +=
        1;
    }

    return {
      websiteId,

      provider: backlinkProviderStatus(),

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

        history:
          historyCount > 1
            ? 'LIVE'
            : 'NO_HISTORY',
      },

      qualityBreakdown,

      sources: Object.entries(sources).map(
        ([source, count]) => ({
          source,
          count,
        }),
      ),

      authorityNote:
        'Authority is the average of source-supplied domain authority numbers, never a RENKOO measurement. New/lost counts derive from recorded snapshot differences.',


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
    filters?: {
      status?: string;
      linkType?: string;
      domain?: string;
      quality?: string;
    },
  ) {
    const website = await this.getWebsite(
      organizationId,
      websiteId,
    );

    const backlinks =
      await this.prisma.backlink.findMany({
        where: {
          websiteId,
          ...(filters?.status
            ? {
                status:
                  filters.status.toUpperCase(),
              }
            : {}),
          ...(filters?.linkType
            ? {
                linkType:
                  filters.linkType.toUpperCase(),
              }
            : {}),
          ...(filters?.domain
            ? {
                sourceDomain: {
                  contains:
                    filters.domain.toLowerCase(),
                },
              }
            : {}),
        },

        orderBy: {
          lastSeenAt: 'desc',
        },

        take: 500,
      });

    const domainCounts = new Map<
      string,
      number
    >();

    for (const link of backlinks) {
      domainCounts.set(
        link.sourceDomain,
        (domainCounts.get(
          link.sourceDomain,
        ) ?? 0) + 1,
      );
    }

    const withQuality = backlinks.map(
      (link) => {
        const verdict =
          classifyQuality({
            linkType: link.linkType,
            status: link.status,
            domainAuthority:
              link.domainAuthority,
            pageAuthority:
              link.pageAuthority,
            isToxic: link.isToxic,
            anchorText:
              link.anchorText,
            domainLinkCount:
              domainCounts.get(
                link.sourceDomain,
              ) ?? 1,
            relevanceHit:
              relevanceHit(
                link.anchorText,
                link.sourceDomain,
                website.url,
                website.industry,
              ),
          });

        return {
          ...link,
          quality: verdict.quality,
          qualityWhy: verdict.why,
        };
      },
    );

    const filtered = filters?.quality
      ? withQuality.filter(
          (link) =>
            link.quality ===
            filters.quality!.toUpperCase(),
        )
      : withQuality;

    return {
      websiteId,
      total: filtered.length,
      provider: backlinkProviderStatus(),
      authorityNote:
        'Domain authority numbers are supplied by the import source, never measured by RENKOO.',
      backlinks: filtered,
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

    /*
     * Provenance: every row carries the source
     * that supplied it. Authority numbers are
     * source-supplied, never measured by RENKOO.
     */
    const batchSource = (
      dto.source?.trim() ||
      'MANUAL_IMPORT'
    )
      .toUpperCase()
      .slice(0, 60);

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

      const rowSource = (
        item.source?.trim() ||
        batchSource
      )
        .toUpperCase()
        .slice(0, 60);

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

            source: rowSource,

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

          source: rowSource,

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
      organizationId,
      websiteId,
    );

    /*
     * ---------------------------------------------------------
     * MONITORING (event-driven, history-backed only)
     * ---------------------------------------------------------
     */

    try {
      await this.detectBacklinkAlerts(
        organizationId,
        websiteId,
      );
    } catch (error) {
      this.logger.warn(
        `Backlink alert detection skipped: ${String((error as Error)?.message ?? error).slice(0, 160)}`,
      );
    }

    return {
      websiteId,

      imported,

      updated,

      totalProcessed:
        imported + updated,

      success: true,

      provider: backlinkProviderStatus(),
    };
  }

  /*
   * =========================================================
   * MONITORING HOOKS (no scheduler; import-driven)
   *
   * Alerts fire only from recorded history:
   * valuable lost links and sharp referring-domain
   * drops versus the previous snapshot.
   * =========================================================
   */

  private async detectBacklinkAlerts(
    organizationId: string,
    websiteId: string,
  ) {
    const snapshots =
      await this.prisma.backlinkSnapshot.findMany(
        {
          where: { websiteId },
          orderBy: { date: 'desc' },
          take: 2,
        },
      );

    if (snapshots.length < 2) {
      return;
    }

    const [latest, previous] = snapshots;
    const day = latest.date
      .toISOString()
      .slice(0, 10);

    const valuableLost =
      await this.prisma.backlink.findMany({
        where: {
          websiteId,
          status: 'LOST',
          linkType: 'DOFOLLOW',
          domainAuthority: { gte: 30 },
          updatedAt: {
            gte: latest.date,
          },
        },
        select: {
          sourceUrl: true,
          sourceDomain: true,
          domainAuthority: true,
        },
        take: 10,
      });

    if (valuableLost.length > 0) {
      await this.monitoringService.createAlert(
        organizationId,
        {
          websiteId,
          type: 'LOST_VALUABLE_LINK',
          source: 'BACKLINKS',
          severity: 'HIGH',
          title: `${valuableLost.length} valuable backlink(s) lost`,
          description: `Dofollow links with supplied authority >= 30 were marked lost: ${valuableLost.slice(0, 3).map((link) => link.sourceDomain).join(', ')}.`,
          evidence: {
            lost: valuableLost,
            snapshotDate:
              latest.date,
          } as any,
          deduplicationKey: `backlinks-lost-${day}`,
        },
      );
    }

    const previousDomains =
      previous.referringDomains ?? 0;
    const latestDomains =
      latest.referringDomains ?? 0;

    if (
      previousDomains >= 5 &&
      latestDomains <
        previousDomains * 0.7
    ) {
      await this.monitoringService.createAlert(
        organizationId,
        {
          websiteId,
          type: 'REFERRING_DOMAIN_LOSS',
          source: 'BACKLINKS',
          severity: 'MEDIUM',
          title:
            'Sharp referring-domain drop',
          description: `Referring domains fell from ${previousDomains} to ${latestDomains} between snapshots.`,
          evidence: {
            previous: previousDomains,
            latest: latestDomains,
            snapshotDate:
              latest.date,
          } as any,
          deduplicationKey: `backlinks-domains-${day}`,
        },
      );
    }
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
    organizationId: string,
    websiteId: string,
  ) {
    const website =
      await this.prisma.website.findFirst({
        where: { id: websiteId },
        select: {
          url: true,
          industry: true,
        },
      });

    const websiteHost = (() => {
      try {
        return new URL(
          website?.url ?? '',
        ).hostname.toLowerCase();
      } catch {
        return '';
      }
    })();

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

          reason: `${domain.backlinkCount} link(s) from ${domain.domain} but no dofollow yet. Supplied domain authority ${domain.authorityScore}.`,
          suggestedAction:
            'Ask for a dofollow editorial link from this already-linking domain.',
        },
      });
    }

    /*
     * Lost valuable links: dofollow, supplied
     * authority >= 30, currently LOST.
     */
    const lostValuable =
      await this.prisma.backlink.findMany({
        where: {
          websiteId,
          status: 'LOST',
          linkType: 'DOFOLLOW',
          domainAuthority: {
            gte: 30,
          },
        },
        take: 20,
      });

    for (const lost of lostValuable) {
      const existingLost =
        await this.prisma.backlinkOpportunity.findFirst(
          {
            where: {
              websiteId,
              sourceDomain:
                lost.sourceDomain,
              opportunityType:
                'LOST_VALUABLE_LINK',
              status: 'OPEN',
            },
          },
        );

      if (existingLost) {
        continue;
      }

      await this.prisma.backlinkOpportunity.create(
        {
          data: {
            websiteId,
            sourceDomain:
              lost.sourceDomain,
            targetUrl:
              lost.targetUrl,
            anchorSuggestion:
              lost.anchorText,
            opportunityType:
              'LOST_VALUABLE_LINK',
            opportunityScore: 75,
            priority: 'HIGH',
            status: 'OPEN',
            reason: `Dofollow link from ${lost.sourceDomain} (supplied authority ${lost.domainAuthority ?? 'unknown'}) is marked lost.`,
            suggestedAction:
              'Reclaim the link: check the source page, fix the target, or request reinstatement.',
          },
        },
      );
    }

    /*
     * Link target mismatch: backlink targets not
     * present in the latest completed crawl.
     */
    try {
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

      if (latest) {
        const pages =
          await this.prisma.crawlPage.findMany(
            {
              where: {
                crawlId: latest.id,
              },
              select: { url: true },
              take: 2000,
            },
          );

        const known = new Set(
          pages.map((page) =>
            page.url
              .toLowerCase()
              .replace(/\/+$/, ''),
          ),
        );

        const active =
          await this.prisma.backlink.findMany(
            {
              where: {
                websiteId,
                status: 'ACTIVE',
              },
              select: {
                targetUrl: true,
                sourceDomain: true,
              },
              take: 500,
            },
          );

        const mismatched = new Map<
          string,
          string
        >();

        for (const link of active) {
          const normalized = link.targetUrl
            .toLowerCase()
            .replace(/\/+$/, '');

          const sameHost =
            !websiteHost ||
            normalized.includes(
              websiteHost,
            );

          if (
            sameHost &&
            !known.has(normalized) &&
            !mismatched.has(normalized)
          ) {
            mismatched.set(
              normalized,
              link.sourceDomain,
            );
          }
        }

        for (const [
          targetUrl,
          sourceDomain,
        ] of [...mismatched.entries()].slice(
          0,
          10,
        )) {
          const existingMismatch =
            await this.prisma.backlinkOpportunity.findFirst(
              {
                where: {
                  websiteId,
                  opportunityType:
                    'LINK_TARGET_MISMATCH',
                  targetUrl,
                  status: 'OPEN',
                },
              },
            );

          if (existingMismatch) {
            continue;
          }

          await this.prisma.backlinkOpportunity.create(
            {
              data: {
                websiteId,
                sourceDomain,
                targetUrl,
                opportunityType:
                  'LINK_TARGET_MISMATCH',
                opportunityScore: 55,
                priority: 'MEDIUM',
                status: 'OPEN',
                reason: `Backlinks point to ${targetUrl}, which is absent from the latest completed crawl.`,
                suggestedAction:
                  'Restore the page, redirect it, or ask linking domains to update the target.',
              },
            },
          );
        }
      }
    } catch {
      // Target matching is best-effort.
    }
  }

  /*
   * =========================================================
   * MANUAL OPPORTUNITY (user-asserted, labeled MANUAL)
   * =========================================================
   */

  async createOpportunity(
    organizationId: string,
    websiteId: string,
    dto: CreateBacklinkOpportunityDto,
  ) {
    await this.getWebsite(
      organizationId,
      websiteId,
    );

    const type = dto.opportunityType
      .trim()
      .toUpperCase()
      .slice(0, 60);

    if (!type) {
      throw new BadRequestException(
        'opportunityType is required',
      );
    }

    let competitorId: string | null =
      dto.competitorId?.trim() || null;

    if (competitorId) {
      const competitor =
        await this.prisma.competitor.findFirst(
          {
            where: {
              id: competitorId,
              organizationId,
              websiteId,
            },
            select: { id: true },
          },
        );

      if (!competitor) {
        throw new NotFoundException(
          'Competitor not found for this website',
        );
      }
    }

    return this.prisma.backlinkOpportunity.create(
      {
        data: {
          websiteId,
          sourceDomain:
            dto.targetUrl?.trim()
              ? (() => {
                  try {
                    return new URL(
                      dto.targetUrl.trim(),
                    ).hostname.toLowerCase();
                  } catch {
                    return 'manual';
                  }
                })()
              : 'manual',
          competitorId,
          targetUrl:
            dto.targetUrl?.trim() ||
            null,
          anchorSuggestion:
            dto.anchorSuggestion?.trim() ||
            null,
          opportunityType: `MANUAL_${type}`,
          opportunityScore: 30,
          priority: 'MEDIUM',
          status: 'OPEN',
          reason:
            dto.reason?.trim() ||
            'Manually recorded by the workspace owner.',
          suggestedAction:
            dto.suggestedAction?.trim() ||
            null,
        },
      },
    );
  }

  async updateOpportunityStatus(
    organizationId: string,
    websiteId: string,
    id: string,
    dto: UpdateBacklinkOpportunityDto,
  ) {
    await this.getWebsite(
      organizationId,
      websiteId,
    );

    const opportunity =
      await this.prisma.backlinkOpportunity.findFirst(
        {
          where: {
            id,
            websiteId,
          },
        },
      );

    if (!opportunity) {
      throw new NotFoundException(
        'Backlink opportunity not found',
      );
    }

    const status = dto.status
      ?.trim()
      .toUpperCase();

    if (
      !status ||
      !(
        OPPORTUNITY_STATUSES as readonly string[]
      ).includes(status)
    ) {
      throw new BadRequestException(
        `status must be one of: ${OPPORTUNITY_STATUSES.join(', ')}`,
      );
    }

    return this.prisma.backlinkOpportunity.update(
      {
        where: { id },
        data: { status },
      },
    );
  }

  /*
   * =========================================================
   * OPPORTUNITY -> RECOMMENDATION BRIDGE
   * =========================================================
   */

  async toRecommendation(
    organizationId: string,
    websiteId: string,
    id: string,
  ) {
    await this.getWebsite(
      organizationId,
      websiteId,
    );

    const opportunity =
      await this.prisma.backlinkOpportunity.findFirst(
        {
          where: {
            id,
            websiteId,
          },
        },
      );

    if (!opportunity) {
      throw new NotFoundException(
        'Backlink opportunity not found',
      );
    }

    const existing =
      await this.prisma.recommendation.findFirst(
        {
          where: {
            organizationId,
            websiteId,
            source: 'BACKLINK',
            metadata: {
              path: [
                'backlinkOpportunityId',
              ],
              equals: opportunity.id,
            },
          },
        },
      );

    if (existing) {
      return existing;
    }

    return this.prisma.recommendation.create(
      {
        data: {
          organizationId,
          websiteId,
          source: 'BACKLINK',
          type: opportunity.opportunityType,
          title: this.opportunityTitle(
            opportunity,
          ),
          description:
            opportunity.reason ??
            `Backlink opportunity on ${opportunity.sourceDomain}.`,
          priority: opportunity.priority,
          impact: 'MEDIUM',
          effort: 'MEDIUM',
          actionText:
            opportunity.suggestedAction,
          pageUrl:
            opportunity.targetUrl,
          metadata: {
            backlinkOpportunityId:
              opportunity.id,
            sourceDomain:
              opportunity.sourceDomain,
            opportunityScore:
              opportunity.opportunityScore,
            competitorId:
              opportunity.competitorId,
          },
        },
      },
    );
  }

  private opportunityTitle(opportunity: {
    opportunityType: string;
    sourceDomain: string;
  }): string {
    switch (opportunity.opportunityType) {
      case 'LOST_VALUABLE_LINK':
        return `Reclaim lost link from ${opportunity.sourceDomain}`;
      case 'LINK_TARGET_MISMATCH':
        return `Fix link target served by ${opportunity.sourceDomain}`;
      case 'RESOURCE_LINK':
        return `Earn dofollow from ${opportunity.sourceDomain}`;
      default:
        return `Backlink opportunity: ${opportunity.sourceDomain}`;
    }
  }

  /*
   * =========================================================
   * COMPETITOR LINK GAP (honest: no provider data)
   * =========================================================
   */

  async getCompetitorGap(
    organizationId: string,
    websiteId: string,
  ) {
    await this.getWebsite(
      organizationId,
      websiteId,
    );

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
            domain: true,
            url: true,
          },
          take: 50,
        },
      );

    return {
      websiteId,
      status: 'NOT_AVAILABLE',
      reason:
        'No competitor backlink data source is connected. Competitor referring domains cannot be compared without verified data.',
      competitors,
      manualOpportunities:
        await this.prisma.backlinkOpportunity.findMany(
          {
            where: {
              websiteId,
              status: 'OPEN',
              competitorId: { not: null },
            },
            take: 50,
          },
        ),
    };
  }

  /*
   * =========================================================
   * RECONCILE (explicit observed set -> LOST marking)
   * =========================================================
   */

  async reconcile(
    organizationId: string,
    websiteId: string,
    observedUrls: string[],
  ) {
    await this.getWebsite(
      organizationId,
      websiteId,
    );

    const observed = new Set(
      observedUrls.map((url) =>
        url.trim(),
      ),
    );

    const active =
      await this.prisma.backlink.findMany({
        where: {
          websiteId,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          sourceUrl: true,
          sourceDomain: true,
          linkType: true,
          domainAuthority: true,
        },
      });

    const markedLost: Array<{
      id: string;
      sourceUrl: string;
      sourceDomain: string;
    }> = [];

    for (const link of active) {
      if (
        !observed.has(link.sourceUrl)
      ) {
        await this.prisma.backlink.update(
          {
            where: { id: link.id },
            data: { status: 'LOST' },
          },
        );

        markedLost.push({
          id: link.id,
          sourceUrl: link.sourceUrl,
          sourceDomain:
            link.sourceDomain,
        });
      }
    }

    await this.rebuildDomains(websiteId);
    await this.createSnapshot(websiteId);
    await this.generateOpportunities(
      organizationId,
      websiteId,
    );

    try {
      await this.detectBacklinkAlerts(
        organizationId,
        websiteId,
      );
    } catch (error) {
      this.logger.warn(
        `Backlink alert detection skipped: ${String((error as Error)?.message ?? error).slice(0, 160)}`,
      );
    }

    return {
      websiteId,
      observed: observed.size,
      previouslyActive: active.length,
      markedLost,
      stillActive:
        active.length -
        markedLost.length,
    };
  }

  /*
   * =========================================================
   * HISTORY (snapshot trend for new/lost over time)
   * =========================================================
   */

  async getHistory(
    organizationId: string,
    websiteId: string,
  ) {
    await this.getWebsite(
      organizationId,
      websiteId,
    );

    const snapshots =
      await this.prisma.backlinkSnapshot.findMany(
        {
          where: { websiteId },
          orderBy: { date: 'asc' },
          take: 365,
        },
      );

    return {
      websiteId,
      total: snapshots.length,
      history:
        snapshots.length > 1
          ? 'LIVE'
          : 'NO_HISTORY',
      note:
        snapshots.length > 1
          ? 'New/lost counts derive from recorded snapshot differences.'
          : 'A single snapshot cannot show change. Import or reconcile again later to build history.',
      snapshots,
    };
  }
}


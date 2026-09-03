import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { UpdateBusinessBrainDto } from './dto/update-business-brain.dto';

type WebsiteContext = {
  id: string;
  name: string;
  url: string;
  industry: string | null;
  country: string | null;
};

type Insight = {
  type: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  explanation: string;
};

@Injectable()
export class BusinessBrainService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  // =========================================================
  // WEBSITE
  // =========================================================

  private async getWebsite(
    organizationId: string,
    websiteId: string,
  ): Promise<WebsiteContext> {
    const website =
      await this.prisma.website.findFirst({
        where: {
          id: websiteId,
          organizationId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          url: true,
          industry: true,
          country: true,
        },
      });

    if (!website) {
      throw new NotFoundException(
        'Website not found',
      );
    }

    return website;
  }

  // =========================================================
  // HELPERS
  // =========================================================

  private cleanString(
    value: unknown,
  ): string {
    if (typeof value !== 'string') {
      return '';
    }

    return value
      .replace(/\s+/g, ' ')
      .trim();
  }

  private uniqueStrings(
    values: unknown[],
  ): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const value of values) {
      const cleaned =
        this.cleanString(value);

      if (!cleaned) {
        continue;
      }

      const key =
        cleaned.toLowerCase();

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      result.push(cleaned);
    }

    return result;
  }

  private humanizeSlug(
    value: string,
  ): string {
    return value
      .replace(/^\/+|\/+$/g, '')
      .split('/')
      .pop()
      ?.replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (char) =>
        char.toUpperCase(),
      )
      .trim() || '';
  }

  private normalizeArray(
    value: unknown,
  ): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return this.uniqueStrings(value);
  }

  private extractDomain(
    url: string,
  ): string {
    try {
      return new URL(url)
        .hostname
        .replace(/^www\./i, '')
        .toLowerCase();
    } catch {
      return url
        .replace(/^https?:\/\//i, '')
        .split('/')[0]
        .replace(/^www\./i, '')
        .toLowerCase();
    }
  }

  // =========================================================
  // ENSURE BUSINESS BRAIN
  // =========================================================

  private async ensureBrain(
    website: WebsiteContext,
  ) {
    return this.prisma.businessBrain.upsert({
      where: {
        websiteId: website.id,
      },

      create: {
        websiteId: website.id,
        businessName:
          website.name || undefined,
        industry:
          website.industry ?? undefined,
        country:
          website.country ?? undefined,
      },

      update: {},
    });
  }

  // =========================================================
  // GET
  // =========================================================

  async get(
    organizationId: string,
    websiteId: string,
  ) {
    const website =
      await this.getWebsite(
        organizationId,
        websiteId,
      );

    return this.ensureBrain(
      website,
    );
  }

  // =========================================================
  // UPDATE
  // =========================================================

  async upsert(
    organizationId: string,
    websiteId: string,
    dto: UpdateBusinessBrainDto,
  ) {
    await this.getWebsite(
      organizationId,
      websiteId,
    );

    /*
     * Only fields allowed by the DTO are written.
     *
     * Score and analysis timestamps are controlled
     * exclusively by the analysis engine.
     */

    return this.prisma.businessBrain.upsert({
      where: {
        websiteId,
      },

      create: {
        websiteId,

        ...(dto.businessName !== undefined
          ? {
              businessName:
                this.cleanString(
                  dto.businessName,
                ) || undefined,
            }
          : {}),

        ...(dto.industry !== undefined
          ? {
              industry:
                this.cleanString(
                  dto.industry,
                ) || undefined,
            }
          : {}),

        ...(dto.country !== undefined
          ? {
              country:
                this.cleanString(
                  dto.country,
                ) || undefined,
            }
          : {}),

        ...(dto.city !== undefined
          ? {
              city:
                this.cleanString(
                  dto.city,
                ) || undefined,
            }
          : {}),

        ...(dto.description !== undefined
          ? {
              description:
                this.cleanString(
                  dto.description,
                ) || undefined,
            }
          : {}),

        ...(dto.services !== undefined
          ? {
              services:
                this.normalizeArray(
                  dto.services,
                ),
            }
          : {}),

        ...(dto.products !== undefined
          ? {
              products:
                this.normalizeArray(
                  dto.products,
                ),
            }
          : {}),

        ...(dto.targetAudience !== undefined
          ? {
              targetAudience:
                this.cleanString(
                  dto.targetAudience,
                ) || undefined,
            }
          : {}),

        ...(dto.primaryGoal !== undefined
          ? {
              primaryGoal:
                this.cleanString(
                  dto.primaryGoal,
                ) || undefined,
            }
          : {}),

        ...(dto.primaryKeywords !== undefined
          ? {
              primaryKeywords:
                this.normalizeArray(
                  dto.primaryKeywords,
                ),
            }
          : {}),

        ...(dto.targetLocations !== undefined
          ? {
              targetLocations:
                this.normalizeArray(
                  dto.targetLocations,
                ),
            }
          : {}),

        ...(dto.brandTone !== undefined
          ? {
              brandTone:
                this.cleanString(
                  dto.brandTone,
                ) || undefined,
            }
          : {}),

        ...(dto.uniqueSellingPoint !== undefined
          ? {
              uniqueSellingPoint:
                this.cleanString(
                  dto.uniqueSellingPoint,
                ) || undefined,
            }
          : {}),
      },

      update: {
        ...(dto.businessName !== undefined
          ? {
              businessName:
                this.cleanString(
                  dto.businessName,
                ) || null,
            }
          : {}),

        ...(dto.industry !== undefined
          ? {
              industry:
                this.cleanString(
                  dto.industry,
                ) || null,
            }
          : {}),

        ...(dto.country !== undefined
          ? {
              country:
                this.cleanString(
                  dto.country,
                ) || null,
            }
          : {}),

        ...(dto.city !== undefined
          ? {
              city:
                this.cleanString(
                  dto.city,
                ) || null,
            }
          : {}),

        ...(dto.description !== undefined
          ? {
              description:
                this.cleanString(
                  dto.description,
                ) || null,
            }
          : {}),

        ...(dto.services !== undefined
          ? {
              services:
                this.normalizeArray(
                  dto.services,
                ),
            }
          : {}),

        ...(dto.products !== undefined
          ? {
              products:
                this.normalizeArray(
                  dto.products,
                ),
            }
          : {}),

        ...(dto.targetAudience !== undefined
          ? {
              targetAudience:
                this.cleanString(
                  dto.targetAudience,
                ) || null,
            }
          : {}),

        ...(dto.primaryGoal !== undefined
          ? {
              primaryGoal:
                this.cleanString(
                  dto.primaryGoal,
                ) || null,
            }
          : {}),

        ...(dto.primaryKeywords !== undefined
          ? {
              primaryKeywords:
                this.normalizeArray(
                  dto.primaryKeywords,
                ),
            }
          : {}),

        ...(dto.targetLocations !== undefined
          ? {
              targetLocations:
                this.normalizeArray(
                  dto.targetLocations,
                ),
            }
          : {}),

        ...(dto.brandTone !== undefined
          ? {
              brandTone:
                this.cleanString(
                  dto.brandTone,
                ) || null,
            }
          : {}),

        ...(dto.uniqueSellingPoint !== undefined
          ? {
              uniqueSellingPoint:
                this.cleanString(
                  dto.uniqueSellingPoint,
                ) || null,
            }
          : {}),
      },
    });
  }

  // =========================================================
  // BUILD BUSINESS CONTEXT FROM REAL CRAWL
  // =========================================================

  private async enrichFromCrawl(
    website: WebsiteContext,
    brain: any,
    pages: any[],
  ) {
    if (!pages.length) {
      return brain;
    }

    const titles = this.uniqueStrings(
      pages.map(
        (page) => page.title,
      ),
    );

    const h1s = this.uniqueStrings(
      pages.flatMap(
        (page) =>
          Array.isArray(page.h1)
            ? page.h1
            : [],
      ),
    );

    const h2s = this.uniqueStrings(
      pages.flatMap(
        (page) =>
          Array.isArray(page.h2)
            ? page.h2
            : [],
      ),
    );

    // -------------------------------------------------------
    // SERVICES FROM REAL URL STRUCTURE
    // -------------------------------------------------------

    const serviceCandidates: string[] =
      [];

    for (const page of pages) {
      const url =
        this.cleanString(
          page.url,
        );

      if (!url) {
        continue;
      }

      try {
        const pathname =
          new URL(url).pathname;

        if (
          /\/services?(\/|$)/i.test(
            pathname,
          )
        ) {
          const name =
            this.humanizeSlug(
              pathname,
            );

          if (name) {
            serviceCandidates.push(
              name,
            );
          }
        }
      } catch {
        // Ignore malformed URL.
      }
    }

    // -------------------------------------------------------
    // PRODUCT / COURSE CANDIDATES
    // -------------------------------------------------------

    const productCandidates: string[] =
      [];

    for (const page of pages) {
      const url =
        this.cleanString(
          page.url,
        );

      if (!url) {
        continue;
      }

      try {
        const pathname =
          new URL(url).pathname;

        if (
          /\/products?(\/|$)/i.test(
            pathname,
          ) ||
          /\/courses?(\/|$)/i.test(
            pathname,
          )
        ) {
          const name =
            this.humanizeSlug(
              pathname,
            );

          if (name) {
            productCandidates.push(
              name,
            );
          }
        }
      } catch {
        // Ignore malformed URL.
      }
    }

    // -------------------------------------------------------
    // KEYWORD SIGNALS
    //
    // We use real headings/title signals rather than
    // pretending these are third-party keyword rankings.
    // -------------------------------------------------------

    const keywordSource = [
      ...h1s,
      ...h2s,
      ...titles,
    ];

    const stopWords =
      new Set([
        'the',
        'and',
        'for',
        'with',
        'from',
        'your',
        'you',
        'our',
        'this',
        'that',
        'are',
        'was',
        'will',
        'into',
        'have',
        'has',
        'about',
        'home',
        'page',
        'best',
        'more',
        'read',
        'learn',
        'view',
        'contact',
        'click',
        'now',
      ]);

    const keywordMap =
      new Map<string, number>();

    for (const text of keywordSource) {
      const words =
        text
          .toLowerCase()
          .replace(
            /[^a-z0-9\s-]/g,
            ' ',
          )
          .split(/\s+/)
          .filter(
            (word: string) =>
              word.length >= 4 &&
              !stopWords.has(word),
          );

      for (const word of words) {
        keywordMap.set(
          word,
          (keywordMap.get(word) ?? 0) +
            1,
        );
      }
    }

    const extractedKeywords =
      [...keywordMap.entries()]
        .sort(
          (a, b) => b[1] - a[1],
        )
        .slice(0, 15)
        .map(([word]) => word);

    // -------------------------------------------------------
    // LOCATION SIGNALS
    // -------------------------------------------------------

    const locationCandidates =
      this.uniqueStrings([
        brain.city,
        website.country,
        brain.country,
        ...(Array.isArray(
          brain.targetLocations,
        )
          ? brain.targetLocations
          : []),
      ]);

    // -------------------------------------------------------
    // DESCRIPTION SIGNAL
    // -------------------------------------------------------

    const firstMetaDescription =
      this.uniqueStrings(
        pages.map(
          (page) =>
            page.metaDescription,
        ),
      )[0] ?? '';

    const firstH1 =
      h1s[0] ?? '';

    const generatedDescription =
      firstMetaDescription ||
      firstH1 ||
      '';

    // -------------------------------------------------------
    // ONLY FILL EMPTY USER FIELDS
    //
    // Never overwrite manually configured business data.
    // -------------------------------------------------------

    const services =
      Array.isArray(
        brain.services,
      ) && brain.services.length > 0
        ? brain.services
        : this.uniqueStrings(
            serviceCandidates,
          ).slice(0, 20);

    const products =
      Array.isArray(
        brain.products,
      ) && brain.products.length > 0
        ? brain.products
        : this.uniqueStrings(
            productCandidates,
          ).slice(0, 20);

    const primaryKeywords =
      Array.isArray(
        brain.primaryKeywords,
      ) &&
      brain.primaryKeywords.length > 0
        ? brain.primaryKeywords
        : extractedKeywords;

    const targetLocations =
      Array.isArray(
        brain.targetLocations,
      ) &&
      brain.targetLocations.length > 0
        ? brain.targetLocations
        : locationCandidates;

    const businessName =
      this.cleanString(
        brain.businessName,
      ) ||
      this.cleanString(
        website.name,
      ) ||
      this.extractDomain(
        website.url,
      );

    const industry =
      this.cleanString(
        brain.industry,
      ) ||
      this.cleanString(
        website.industry,
      );

    const country =
      this.cleanString(
        brain.country,
      ) ||
      this.cleanString(
        website.country,
      );

    const description =
      this.cleanString(
        brain.description,
      ) ||
      generatedDescription;

    return this.prisma.businessBrain.update(
      {
        where: {
          websiteId: website.id,
        },

        data: {
          businessName:
            businessName || undefined,

          industry:
            industry || undefined,

          country:
            country || undefined,

          description:
            description || undefined,

          services,

          products,

          primaryKeywords,

          targetLocations,
        },
      },
    );
  }

  // =========================================================
  // ANALYZE
  // =========================================================

  async analyze(
    organizationId: string,
    websiteId: string,
  ) {
    const website =
      await this.getWebsite(
        organizationId,
        websiteId,
      );

    let brain =
      await this.ensureBrain(
        website,
      );

    // =======================================================
    // LATEST CRAWL
    // =======================================================

    const latestCrawl =
      await this.prisma.crawl.findFirst({
        where: {
          websiteId,
        },

        orderBy: {
          createdAt: 'desc',
        },

        include: {
          pages: {
            include: {
              issues: true,
            },
          },
        },
      });

    const seoPages =
      latestCrawl?.pages ?? [];

    // =======================================================
    // ENRICH BRAIN FROM REAL CRAWL
    // =======================================================

    if (seoPages.length > 0) {
      brain =
        await this.enrichFromCrawl(
          website,
          brain,
          seoPages,
        );
    }

    // =======================================================
    // SEO
    // =======================================================

    const seoIssues =
      seoPages.flatMap(
        (page) =>
          Array.isArray(page.issues)
            ? page.issues
            : [],
      );

    const seoCritical =
      seoIssues.filter(
        (issue) =>
          issue.severity ===
          'CRITICAL',
      ).length;

    const seoHigh =
      seoIssues.filter(
        (issue) =>
          issue.severity === 'HIGH',
      ).length;

    const seoMedium =
      seoIssues.filter(
        (issue) =>
          issue.severity ===
          'MEDIUM',
      ).length;

    const seoLow =
      seoIssues.filter(
        (issue) =>
          issue.severity === 'LOW',
      ).length;

    const seoOpenIssues =
      seoIssues.filter(
        (issue) =>
          issue.status === 'OPEN',
      ).length;

    const crawledPages =
      seoPages.length;

    // =======================================================
    // SEO HEALTH
    // =======================================================

    let seoHealthScore =
      latestCrawl ? 100 : 0;

    if (latestCrawl) {
      seoHealthScore -=
        seoCritical * 10;

      seoHealthScore -=
        seoHigh * 5;

      seoHealthScore -=
        seoMedium * 2;

      seoHealthScore -=
        seoLow;

      seoHealthScore =
        Math.max(
          0,
          Math.min(
            100,
            seoHealthScore,
          ),
        );
    }

    // =======================================================
    // COMPETITORS
    // =======================================================

    const competitors =
      await this.prisma.competitor.findMany(
        {
          where: {
            websiteId,
            organizationId,
            isActive: true,
          },

          include: {
            crawls: {
              orderBy: {
                createdAt: 'desc',
              },
              take: 1,
            },
          },
        },
      );

    const competitorCount =
      competitors.length;

    const competitorCrawls =
      competitors.flatMap(
        (competitor) =>
          Array.isArray(
            competitor.crawls,
          )
            ? competitor.crawls
            : [],
      );

    const competitorIssues =
      competitorCrawls.reduce(
        (total, crawl) =>
          total +
          Number(
            crawl.totalIssues ?? 0,
          ),
        0,
      );

    const competitorAverageScore =
      competitorCrawls.length > 0
        ? Math.round(
            competitorCrawls.reduce(
              (total, crawl) =>
                total +
                Number(
                  crawl.score ?? 0,
                ),
              0,
            ) /
              competitorCrawls.length,
          )
        : null;

    // =======================================================
    // AI VISIBILITY
    //
    // REAL DATA ONLY.
    // =======================================================

    const aiQueries =
      await this.prisma.aiVisibilityQuery.findMany(
        {
          where: {
            websiteId,
            isActive: true,
          },
        },
      );

    const aiChecks =
      await this.prisma.aiVisibilityCheck.findMany(
        {
          where: {
            websiteId,
          },

          orderBy: {
            checkedAt: 'desc',
          },
        },
      );

    const completedAiChecks =
      aiChecks.filter(
        (check) =>
          check.status ===
          'COMPLETED',
      );

    const aiMentioned =
      completedAiChecks.filter(
        (check) =>
          Boolean(check.mentioned),
      ).length;

    const aiCited =
      completedAiChecks.filter(
        (check) =>
          Boolean(
            check.citationFound,
          ),
      ).length;

    const aiVisibilityRate =
      completedAiChecks.length > 0
        ? Number(
            (
              (aiMentioned /
                completedAiChecks.length) *
              100
            ).toFixed(2),
          )
        : null;

    const aiCitationRate =
      completedAiChecks.length > 0
        ? Number(
            (
              (aiCited /
                completedAiChecks.length) *
              100
            ).toFixed(2),
          )
        : null;

    // =======================================================
    // GEO
    // =======================================================

    const latestGeoAudit =
      await this.prisma.geoAudit.findFirst(
        {
          where: {
            websiteId,
          },

          orderBy: {
            createdAt: 'desc',
          },
        },
      );

    const geoQueries =
      await this.prisma.geoQuery.findMany(
        {
          where: {
            websiteId,
          },
        },
      );

    const geoMentioned =
      geoQueries.filter(
        (query) =>
          Boolean(query.mentioned),
      ).length;

    const geoCited =
      geoQueries.filter(
        (query) =>
          Boolean(query.cited),
      ).length;

    // =======================================================
    // AEO
    // =======================================================

    const latestAeoAudit =
      await this.prisma.aeoAudit.findFirst(
        {
          where: {
            websiteId,
          },

          orderBy: {
            createdAt: 'desc',
          },

          include: {
            AeoIssue: true,
          },
        },
      );

    const aeoIssues =
      latestAeoAudit?.AeoIssue ?? [];

    const aeoOpenIssues =
      aeoIssues.filter(
        (issue) =>
          issue.status === 'OPEN',
      ).length;

    // =======================================================
    // LEADS
    // =======================================================

    const totalLeads =
      await this.prisma.lead.count({
        where: {
          websiteId,
        },
      });

    const convertedLeads =
      await this.prisma.lead.count({
        where: {
          websiteId,
          converted: true,
        },
      });

    const leadConversionRate =
      totalLeads > 0
        ? Number(
            (
              (convertedLeads /
                totalLeads) *
              100
            ).toFixed(2),
          )
        : null;

    const leadValueAggregate =
      await this.prisma.lead.aggregate(
        {
          where: {
            websiteId,
          },

          _sum: {
            estimatedValue: true,
          },
        },
      );

    const estimatedPipelineValue =
      Number(
        leadValueAggregate._sum
          .estimatedValue ?? 0,
      );

    // =======================================================
    // REVENUE
    // =======================================================

    const revenues =
      await this.prisma.revenue.findMany(
        {
          where: {
            websiteId,
          },

          select: {
            amount: true,
            status: true,
            currency: true,
          },
        },
      );

    const recognizedRevenue =
      revenues
        .filter(
          (revenue) =>
            revenue.status ===
            'RECOGNIZED',
        )
        .reduce(
          (total, revenue) =>
            total +
            Number(
              revenue.amount ?? 0,
            ),
          0,
        );

    // =======================================================
    // PROFILE SCORE
    // =======================================================

    let profileScore = 0;

    if (
      this.cleanString(
        brain.businessName,
      )
    ) {
      profileScore += 15;
    }

    if (
      this.cleanString(
        brain.industry,
      )
    ) {
      profileScore += 10;
    }

    if (
      this.cleanString(
        brain.description,
      )
    ) {
      profileScore += 10;
    }

    if (
      Array.isArray(
        brain.services,
      ) &&
      brain.services.length > 0
    ) {
      profileScore += 15;
    }

    if (
      Array.isArray(
        brain.products,
      ) &&
      brain.products.length > 0
    ) {
      profileScore += 10;
    }

    if (
      this.cleanString(
        brain.targetAudience,
      )
    ) {
      profileScore += 10;
    }

    if (
      this.cleanString(
        brain.primaryGoal,
      )
    ) {
      profileScore += 10;
    }

    if (
      Array.isArray(
        brain.primaryKeywords,
      ) &&
      brain.primaryKeywords.length > 0
    ) {
      profileScore += 10;
    }

    if (
      Array.isArray(
        brain.targetLocations,
      ) &&
      brain.targetLocations.length > 0
    ) {
      profileScore += 10;
    }

    profileScore =
      Math.min(
        100,
        profileScore,
      );

    // =======================================================
    // DATA COVERAGE
    // =======================================================

    let dataCoverageScore = 0;

    if (latestCrawl) {
      dataCoverageScore += 20;
    }

    if (aiQueries.length > 0) {
      dataCoverageScore += 15;
    }

    if (
      completedAiChecks.length > 0
    ) {
      dataCoverageScore += 15;
    }

    if (latestGeoAudit) {
      dataCoverageScore += 10;
    }

    if (latestAeoAudit) {
      dataCoverageScore += 10;
    }

    if (competitorCount > 0) {
      dataCoverageScore += 10;
    }

    if (totalLeads > 0) {
      dataCoverageScore += 10;
    }

    if (revenues.length > 0) {
      dataCoverageScore += 10;
    }

    dataCoverageScore =
      Math.min(
        100,
        dataCoverageScore,
      );

    // =======================================================
    // REAL AI / GEO / AEO SCORES
    // =======================================================

    /*
     * Important:
     *
     * No completed AI checks = 0,
     * not a fabricated visibility score.
     */

    const aiScore =
      aiVisibilityRate === null
        ? 0
        : Math.round(
            aiVisibilityRate,
          );

    const geoScore =
      latestGeoAudit &&
      typeof latestGeoAudit.overallScore ===
        'number'
        ? Math.max(
            0,
            Math.min(
              100,
              latestGeoAudit.overallScore,
            ),
          )
        : 0;

    const aeoScore =
      latestAeoAudit &&
      typeof latestAeoAudit.score ===
        'number'
        ? Math.max(
            0,
            Math.min(
              100,
              latestAeoAudit.score,
            ),
          )
        : 0;

    // =======================================================
    // INTELLIGENCE SCORE
    // =======================================================

    const intelligenceScore =
      Math.round(
        profileScore * 0.25 +
        dataCoverageScore * 0.15 +
        seoHealthScore * 0.25 +
        aiScore * 0.15 +
        geoScore * 0.10 +
        aeoScore * 0.10,
      );

    const finalScore =
      Math.max(
        0,
        Math.min(
          100,
          intelligenceScore,
        ),
      );

    // =======================================================
    // INSIGHTS
    // =======================================================

    const insights: Insight[] = [];

    if (seoCritical > 0) {
      insights.push({
        type: 'SEO',
        priority: 'CRITICAL',
        title:
          'Critical SEO issues require attention',
        explanation:
          `RENKOO detected ${seoCritical} critical SEO issue(s) in the latest crawl.`,
      });
    }

    if (
      seoHigh > 0 &&
      seoCritical === 0
    ) {
      insights.push({
        type: 'SEO',
        priority: 'HIGH',
        title:
          'High-priority SEO issues detected',
        explanation:
          `The latest crawl contains ${seoHigh} high-severity SEO issue(s).`,
      });
    }

    if (
      completedAiChecks.length === 0
    ) {
      insights.push({
        type: 'AI_VISIBILITY',
        priority: 'MEDIUM',
        title:
          'AI visibility is not yet measured',
        explanation:
          'No completed AI visibility checks are available. RENKOO will not fabricate AI visibility metrics.',
      });
    } else if (
      aiMentioned === 0
    ) {
      insights.push({
        type: 'AI_VISIBILITY',
        priority: 'HIGH',
        title:
          'Brand is not appearing in tracked AI answers',
        explanation:
          `No brand mentions were found across ${completedAiChecks.length} completed AI visibility checks.`,
      });
    } else if (
      aiVisibilityRate !== null &&
      aiVisibilityRate < 30
    ) {
      insights.push({
        type: 'AI_VISIBILITY',
        priority: 'HIGH',
        title:
          'AI search visibility is weak',
        explanation:
          `The website was mentioned in approximately ${aiVisibilityRate}% of completed AI checks.`,
      });
    }

    if (
      geoQueries.length === 0
    ) {
      insights.push({
        type: 'GEO',
        priority: 'MEDIUM',
        title:
          'GEO data is not yet available',
        explanation:
          'No GEO query observations are available.',
      });
    } else if (
      geoMentioned === 0
    ) {
      insights.push({
        type: 'GEO',
        priority: 'HIGH',
        title:
          'Low GEO brand visibility',
        explanation:
          `No brand mentions were found across ${geoQueries.length} GEO queries.`,
      });
    }

    if (
      latestAeoAudit &&
      aeoOpenIssues > 0
    ) {
      insights.push({
        type: 'AEO',
        priority: 'MEDIUM',
        title:
          'Answer-readiness opportunities detected',
        explanation:
          `The latest AEO audit contains ${aeoOpenIssues} open issue(s).`,
      });
    }

    if (competitorCount === 0) {
      insights.push({
        type: 'COMPETITOR',
        priority: 'MEDIUM',
        title:
          'No active competitors tracked',
        explanation:
          'Add competitors to unlock competitive intelligence.',
      });
    } else if (
      competitorAverageScore !== null &&
      latestCrawl &&
      competitorAverageScore >
        seoHealthScore
    ) {
      insights.push({
        type: 'COMPETITOR',
        priority: 'HIGH',
        title:
          'Competitors currently show stronger crawl health',
        explanation:
          `Tracked competitors average ${competitorAverageScore} SEO score versus ${seoHealthScore} for this website.`,
      });
    }

    if (totalLeads === 0) {
      insights.push({
        type: 'LEADS',
        priority: 'MEDIUM',
        title:
          'No leads recorded',
        explanation:
          'Add or connect lead data to measure business impact.',
      });
    }

    if (revenues.length === 0) {
      insights.push({
        type: 'REVENUE',
        priority: 'MEDIUM',
        title:
          'Revenue attribution is not configured',
        explanation:
          'Add revenue data to connect visibility and leads with business impact.',
      });
    }

    if (profileScore < 70) {
      insights.push({
        type: 'BUSINESS_BRAIN',
        priority: 'HIGH',
        title:
          'Business Brain needs more context',
        explanation:
          `Business profile completeness is ${profileScore}%.`,
      });
    }

    const priorityWeight: Record<
      string,
      number
    > = {
      CRITICAL: 4,
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1,
    };

    insights.sort(
      (a, b) =>
        priorityWeight[
          b.priority
        ] -
        priorityWeight[
          a.priority
        ],
    );

    // =======================================================
    // PERSIST BUSINESS BRAIN INSIGHTS
    // =======================================================

    for (const insight of insights) {
      const existing =
        await this.prisma.recommendation.findFirst({
          where: {
            organizationId,
            websiteId,
            source: 'BUSINESS_BRAIN',
            type: insight.type,
            title: insight.title,
          },
        });

      const recommendationData = {
        description: insight.explanation,
        priority: insight.priority,
        impact:
          insight.priority === 'CRITICAL' ||
          insight.priority === 'HIGH'
            ? 'HIGH'
            : insight.priority === 'MEDIUM'
              ? 'MEDIUM'
              : 'LOW',
        effort:
          insight.priority === 'CRITICAL' ||
          insight.priority === 'HIGH'
            ? 'MEDIUM'
            : 'LOW',
        actionText: `Fix: ${insight.title}`,
        metadata: {
          insightType: insight.type,
          generatedBy: 'BUSINESS_BRAIN',
          generatedAt: new Date().toISOString(),
          businessScore: finalScore,
        },
      };

      if (existing) {
        await this.prisma.recommendation.update({
          where: { id: existing.id },
          data: recommendationData,
        });
      } else {
        await this.prisma.recommendation.create({
          data: {
            organizationId,
            websiteId,
            source: 'BUSINESS_BRAIN',
            type: insight.type,
            title: insight.title,
            ...recommendationData,
          },
        });
      }
    }
    // =======================================================
    // SAVE SCORE
    // =======================================================

    const updated =
      await this.prisma.businessBrain.update(
        {
          where: {
            websiteId,
          },

          data: {
            businessScore:
              finalScore,

            lastAnalyzedAt:
              new Date(),
          },
        },
      );

    // =======================================================
    // COMPLETE RESPONSE
    // =======================================================

    return {
      websiteId,

      website: {
        id: website.id,
        name: website.name,
        url: website.url,
        industry:
          website.industry,
        country:
          website.country,
      },

      businessBrain:
        updated,

      score:
        finalScore,

      profile: {
        score:
          profileScore,
      },

      dataCoverage: {
        score:
          dataCoverageScore,

        seo:
          Boolean(
            latestCrawl,
          ),

        aiVisibility:
          completedAiChecks.length >
          0,

        geo:
          Boolean(
            latestGeoAudit,
          ),

        aeo:
          Boolean(
            latestAeoAudit,
          ),

        competitors:
          competitorCount > 0,

        leads:
          totalLeads > 0,

        revenue:
          revenues.length > 0,
      },

      seo: {
        crawlId:
          latestCrawl?.id ??
          null,

        pages:
          crawledPages,

        openIssues:
          seoOpenIssues,

        critical:
          seoCritical,

        high:
          seoHigh,

        medium:
          seoMedium,

        low:
          seoLow,

        healthScore:
          seoHealthScore,
      },

      aiVisibility: {
        trackedQueries:
          aiQueries.length,

        completedChecks:
          completedAiChecks.length,

        mentions:
          aiMentioned,

        citations:
          aiCited,

        visibilityRate:
          aiVisibilityRate,

        citationRate:
          aiCitationRate,
      },

      geo: {
        auditScore:
          latestGeoAudit?.overallScore ??
          null,

        queries:
          geoQueries.length,

        mentions:
          geoMentioned,

        citations:
          geoCited,
      },

      aeo: {
        auditScore:
          latestAeoAudit?.score ??
          null,

        pagesChecked:
          latestAeoAudit?.pagesChecked ??
          0,

        issues:
          aeoIssues.length,

        openIssues:
          aeoOpenIssues,
      },

      competitors: {
        tracked:
          competitorCount,

        averageScore:
          competitorAverageScore,

        totalIssues:
          competitorIssues,
      },

      leads: {
        total:
          totalLeads,

        converted:
          convertedLeads,

        conversionRate:
          leadConversionRate,

        estimatedPipelineValue:
          estimatedPipelineValue,
      },

      revenue: {
        transactions:
          revenues.length,

        recognizedRevenue:
          recognizedRevenue,
      },

      insights,

      analyzedAt:
        updated.lastAnalyzedAt,
    };
  }
}

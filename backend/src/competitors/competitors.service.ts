import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateCompetitorDto } from './dto/create-competitor.dto';
import { UpdateCompetitorDto } from './dto/update-competitor.dto';

@Injectable()
export class CompetitorsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  // =========================================================
  // CREATE COMPETITOR
  // =========================================================

  async create(
    organizationId: string,
    dto: CreateCompetitorDto,
  ) {
    const name = dto.name.trim();
    const url = dto.url.trim();

    if (!name) {
      throw new ConflictException(
        'Competitor name is required',
      );
    }

    if (!url) {
      throw new ConflictException(
        'Competitor URL is required',
      );
    }

    const domain = this.extractDomain(url);

    // -------------------------------------------------------
    // CHECK WEBSITE
    // -------------------------------------------------------

    const website =
      await this.prisma.website.findFirst({
        where: {
          id: dto.websiteId,
          organizationId,
        },
      });

    if (!website) {
      throw new NotFoundException(
        'Website not found. Add a website before adding competitors.',
      );
    }

    // -------------------------------------------------------
    // CHECK DUPLICATE
    // -------------------------------------------------------

    const existing =
      await this.prisma.competitor.findFirst({
        where: {
          organizationId,
          url,
        },
      });

    if (existing) {
      throw new ConflictException(
        'This competitor is already added',
      );
    }

    // -------------------------------------------------------
    // CREATE
    // -------------------------------------------------------

    return this.prisma.competitor.create({
      data: {
        organizationId,
        websiteId: website.id,
        name,
        url,
        domain,
      },
    });
  }

  // =========================================================
  // GET ALL COMPETITORS
  // =========================================================

  async findAll(
    organizationId: string,
  ) {
    return this.prisma.competitor.findMany({
      where: {
        organizationId,
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

          select: {
            id: true,
            competitorId: true,
            status: true,

            pagesCrawled: true,
            pagesDiscovered: true,

            score: true,
            totalIssues: true,

            critical: true,
            high: true,
            medium: true,
            low: true,

            startedAt: true,
            completedAt: true,
            createdAt: true,
          },
        },
      },
    });
  }

  // =========================================================
  // GET ONE COMPETITOR
  // =========================================================

  async findOne(
    organizationId: string,
    id: string,
  ) {
    const competitor =
      await this.prisma.competitor.findFirst({
        where: {
          id,
          organizationId,
        },

        include: {
          crawls: {
            orderBy: {
              createdAt: 'desc',
            },

            take: 1,

            select: {
              id: true,
              competitorId: true,
              status: true,

              pagesCrawled: true,
              pagesDiscovered: true,

              score: true,
              totalIssues: true,

              critical: true,
              high: true,
              medium: true,
              low: true,

              startedAt: true,
              completedAt: true,
              createdAt: true,
            },
          },
        },
      });

    if (!competitor) {
      throw new NotFoundException(
        'Competitor not found',
      );
    }

    return competitor;
  }

  // =========================================================
  // CRAWL HISTORY
  // GET /competitors/:id/crawls
  // =========================================================

  async getCrawlHistory(
    organizationId: string,
    competitorId: string,
  ) {
    await this.ensureCompetitor(
      organizationId,
      competitorId,
    );

    return this.prisma.competitorCrawl.findMany({
      where: {
        competitorId,
      },

      orderBy: {
        createdAt: 'desc',
      },

      select: {
        id: true,
        competitorId: true,
        status: true,

        pagesCrawled: true,
        pagesDiscovered: true,

        score: true,
        totalIssues: true,

        critical: true,
        high: true,
        medium: true,
        low: true,

        startedAt: true,
        completedAt: true,
        createdAt: true,
      },
    });
  }

  // =========================================================
  // LATEST CRAWL
  // GET /competitors/:id/crawls/latest
  // =========================================================

  async getLatestCrawl(
    organizationId: string,
    competitorId: string,
  ) {
    const competitor =
      await this.ensureCompetitor(
        organizationId,
        competitorId,
      );

    const crawl =
      await this.prisma.competitorCrawl.findFirst({
        where: {
          competitorId,
        },

        orderBy: {
          createdAt: 'desc',
        },

        include: {
          pages: {
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      });

    if (!crawl) {
      throw new NotFoundException(
        'No crawl found for this competitor',
      );
    }

    return {
      competitor: {
        id: competitor.id,
        name: competitor.name,
        url: competitor.url,
        domain: competitor.domain,
      },

      crawl,
    };
  }

  // =========================================================
  // CRAWL DETAIL
  // GET /competitors/:id/crawls/:crawlId
  // =========================================================

  async getCrawlDetail(
    organizationId: string,
    competitorId: string,
    crawlId: string,
  ) {
    const competitor =
      await this.ensureCompetitor(
        organizationId,
        competitorId,
      );

    const crawl =
      await this.prisma.competitorCrawl.findFirst({
        where: {
          id: crawlId,
          competitorId,
        },

        include: {
          pages: {
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      });

    if (!crawl) {
      throw new NotFoundException(
        'Crawl not found for this competitor',
      );
    }

    return {
      competitor: {
        id: competitor.id,
        name: competitor.name,
        url: competitor.url,
        domain: competitor.domain,
      },

      crawl,
    };
  }

  // =========================================================
  // UPDATE COMPETITOR
  // =========================================================

  async update(
    organizationId: string,
    id: string,
    dto: UpdateCompetitorDto,
  ) {
    const existing =
      await this.ensureCompetitor(
        organizationId,
        id,
      );

    let url = existing.url;
    let domain = existing.domain;

    // -------------------------------------------------------
    // UPDATE URL
    // -------------------------------------------------------

    if (
      dto.url !== undefined &&
      dto.url.trim() !== existing.url
    ) {
      url = dto.url.trim();

      domain = this.extractDomain(url);

      const duplicate =
        await this.prisma.competitor.findFirst({
          where: {
            organizationId,
            url,

            NOT: {
              id,
            },
          },
        });

      if (duplicate) {
        throw new ConflictException(
          'This competitor is already added',
        );
      }
    }

    // -------------------------------------------------------
    // UPDATE
    // -------------------------------------------------------

    return this.prisma.competitor.update({
      where: {
        id,
      },

      data: {
        ...(dto.name !== undefined && {
          name: dto.name.trim(),
        }),

        ...(dto.url !== undefined && {
          url,
          domain,
        }),

        ...(dto.isActive !== undefined && {
          isActive: dto.isActive,
        }),
      },
    });
  }

  // =========================================================
  // DELETE COMPETITOR
  // =========================================================

  async remove(
    organizationId: string,
    id: string,
  ) {
    await this.ensureCompetitor(
      organizationId,
      id,
    );

    return this.prisma.competitor.delete({
      where: {
        id,
      },
    });
  }

  // =========================================================
  // ENSURE COMPETITOR BELONGS TO ORGANIZATION
  // =========================================================

  private async ensureCompetitor(
    organizationId: string,
    competitorId: string,
  ) {
    const competitor =
      await this.prisma.competitor.findFirst({
        where: {
          id: competitorId,
          organizationId,
        },
      });

    if (!competitor) {
      throw new NotFoundException(
        'Competitor not found',
      );
    }

    return competitor;
  }

  // =========================================================
  // EXTRACT DOMAIN
  // =========================================================

  private extractDomain(
    url: string,
  ): string {
    try {
      const parsed = new URL(url);

      if (
        parsed.protocol !== 'http:' &&
        parsed.protocol !== 'https:'
      ) {
        throw new Error(
          'Invalid protocol',
        );
      }

      return parsed.hostname
        .toLowerCase()
        .replace(/^www\./, '');
    } catch {
      throw new ConflictException(
        'Invalid competitor URL. Use http:// or https://',
      );
    }
  }
}
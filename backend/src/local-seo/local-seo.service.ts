import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  CreateLocationDto,
  UpdateLocationDto,
} from './dto/location.dto';
import {
  CreateLocalQueryDto,
  LOCAL_QUERY_CATEGORIES,
  UpdateLocalQueryDto,
} from './dto/local-query.dto';
import {
  CreateCitationDto,
  UpdateCitationDto,
} from './dto/citation.dto';
import { reviewStatus } from './reviews.provider';

export type LocalHealthState =
  | 'GOOD'
  | 'ATTENTION'
  | 'DATA_GAP'
  | 'NOT_AVAILABLE';

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

  // =========================================================
  // BUSINESS LOCATIONS (Phase 14 foundation)
  //
  // Manual, org-scoped location records associated
  // with a website. No rankings, citations, or GBP
  // data — Phase 15 builds verified local evidence
  // on top of these associations.
  // =========================================================

  private async assertLocationWebsite(
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
        select: { id: true },
      });

    if (!website) {
      throw new NotFoundException(
        'Website not found',
      );
    }
  }

  async listLocations(
    organizationId: string,
    websiteId?: string,
  ) {
    if (websiteId) {
      await this.assertLocationWebsite(
        organizationId,
        websiteId,
      );
    }

    const locations =
      await this.prisma.businessLocation.findMany(
        {
          where: {
            organizationId,
            ...(websiteId
              ? { websiteId }
              : {}),
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 100,
        },
      );

    return {
      total: locations.length,
      gbp: {
        status: 'NOT_AVAILABLE',
        reason:
          'Google Business Profile is not connected. Locations below are manually managed.',
      },
      locations,
    };
  }

  async createLocation(
    organizationId: string,
    dto: CreateLocationDto,
  ) {
    const name = dto.name?.trim();

    if (!name) {
      throw new BadRequestException(
        'Location name is required',
      );
    }

    const websiteId =
      dto.websiteId?.trim() || null;

    if (websiteId) {
      await this.assertLocationWebsite(
        organizationId,
        websiteId,
      );
    }

    if (
      dto.latitude !== undefined &&
      (dto.latitude < -90 ||
        dto.latitude > 90)
    ) {
      throw new BadRequestException(
        'Latitude must be between -90 and 90',
      );
    }

    if (
      dto.longitude !== undefined &&
      (dto.longitude < -180 ||
        dto.longitude > 180)
    ) {
      throw new BadRequestException(
        'Longitude must be between -180 and 180',
      );
    }

    const created =
      await this.prisma.businessLocation.create(
        {
          data: {
            organizationId,
            websiteId,
            name,
            address:
              dto.address?.trim() ||
              null,
            city:
              dto.city?.trim() ||
              null,
            state:
              dto.state?.trim() ||
              null,
            country:
              dto.country?.trim() ||
              null,
            postalCode:
              dto.postalCode?.trim() ||
              null,
            latitude:
              dto.latitude ?? null,
            longitude:
              dto.longitude ?? null,
            phone:
              dto.phone?.trim() ||
              null,
            websiteUrl:
              dto.websiteUrl?.trim() ||
              null,
            category:
              dto.category?.trim() ||
              null,
            isPrimary: Boolean(
              dto.isPrimary,
            ),
            source: 'MANUAL',
          },
        },
      );

    if (created.isPrimary) {
      await this.clearOtherPrimaries(
        organizationId,
        created.id,
        created.websiteId,
      );
    }

    return created;
  }

  private async clearOtherPrimaries(
    organizationId: string,
    exceptId: string,
    websiteId: string | null,
  ) {
    await this.prisma.businessLocation.updateMany(
      {
        where: {
          organizationId,
          websiteId,
          isPrimary: true,
          id: { not: exceptId },
        },
        data: { isPrimary: false },
      },
    );
  }

  async updateLocation(
    organizationId: string,
    id: string,
    dto: UpdateLocationDto,
  ) {
    const existing =
      await this.prisma.businessLocation.findFirst(
        {
          where: {
            id,
            organizationId,
          },
        },
      );

    if (!existing) {
      throw new NotFoundException(
        'Location not found',
      );
    }

    let websiteId:
      | string
      | null
      | undefined = undefined;

    if (dto.websiteId !== undefined) {
      websiteId =
        dto.websiteId?.trim() || null;

      if (websiteId) {
        await this.assertLocationWebsite(
          organizationId,
          websiteId,
        );
      }
    }

    if (
      dto.latitude !== undefined &&
      dto.latitude !== null &&
      (dto.latitude < -90 ||
        dto.latitude > 90)
    ) {
      throw new BadRequestException(
        'Latitude must be between -90 and 90',
      );
    }

    if (
      dto.longitude !== undefined &&
      dto.longitude !== null &&
      (dto.longitude < -180 ||
        dto.longitude > 180)
    ) {
      throw new BadRequestException(
        'Longitude must be between -180 and 180',
      );
    }

    const clean = (
      value: string | null | undefined,
    ) =>
      value === undefined
        ? undefined
        : value?.trim() || null;

    const updated =
      await this.prisma.businessLocation.update(
        {
          where: { id },
          data: {
            ...(websiteId !== undefined
              ? { websiteId }
              : {}),
            ...(dto.name !== undefined
              ? {
                  name:
                    dto.name.trim(),
                }
              : {}),
            ...(dto.address !== undefined
              ? {
                  address: clean(
                    dto.address,
                  ),
                }
              : {}),
            ...(dto.city !== undefined
              ? {
                  city: clean(
                    dto.city,
                  ),
                }
              : {}),
            ...(dto.state !== undefined
              ? {
                  state: clean(
                    dto.state,
                  ),
                }
              : {}),
            ...(dto.country !== undefined
              ? {
                  country: clean(
                    dto.country,
                  ),
                }
              : {}),
            ...(dto.postalCode !==
            undefined
              ? {
                  postalCode: clean(
                    dto.postalCode,
                  ),
                }
              : {}),
            ...(dto.latitude !== undefined
              ? {
                  latitude:
                    dto.latitude,
                }
              : {}),
            ...(dto.longitude !==
            undefined
              ? {
                  longitude:
                    dto.longitude,
                }
              : {}),
            ...(dto.phone !== undefined
              ? {
                  phone: clean(
                    dto.phone,
                  ),
                }
              : {}),
            ...(dto.websiteUrl !==
            undefined
              ? {
                  websiteUrl: clean(
                    dto.websiteUrl,
                  ),
                }
              : {}),
            ...(dto.category !== undefined
              ? {
                  category: clean(
                    dto.category,
                  ),
                }
              : {}),
            ...(dto.isPrimary !==
            undefined
              ? {
                  isPrimary:
                    dto.isPrimary,
                }
              : {}),
            ...(dto.status !== undefined
              ? {
                  status: dto.status,
                }
              : {}),
          },
        },
      );

    if (updated.isPrimary) {
      await this.clearOtherPrimaries(
        organizationId,
        updated.id,
        updated.websiteId,
      );
    }

    return updated;
  }

  async removeLocation(
    organizationId: string,
    id: string,
  ) {
    const existing =
      await this.prisma.businessLocation.findFirst(
        {
          where: {
            id,
            organizationId,
          },
          select: { id: true },
        },
      );

    if (!existing) {
      throw new NotFoundException(
        'Location not found',
      );
    }

    await this.prisma.businessLocation.delete({
      where: { id },
    });

    return { success: true, id };
  }

  // =========================================================
  // LOCAL QUERY TRACKING (no fabricated positions)
  // =========================================================

  private async assertLocation(
    organizationId: string,
    locationId: string,
  ) {
    const location =
      await this.prisma.businessLocation.findFirst(
        {
          where: {
            id: locationId,
            organizationId,
          },
          select: {
            id: true,
            websiteId: true,
          },
        },
      );

    if (!location) {
      throw new NotFoundException(
        'Location not found',
      );
    }

    return location;
  }

  async listLocalQueries(
    organizationId: string,
    websiteId: string,
  ) {
    await this.getWebsite(
      organizationId,
      websiteId,
    );

    const queries =
      await this.prisma.localQuery.findMany(
        {
          where: {
            organizationId,
            websiteId,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 200,
        },
      );

    return {
      total: queries.length,
      active: queries.filter(
        (query) => query.isActive,
      ).length,
      rankingData: 'NOT_AVAILABLE',
      rankingNote:
        'No ranking data source is connected. Tracked queries carry no fabricated positions.',
      queries,
    };
  }

  async createLocalQuery(
    organizationId: string,
    dto: CreateLocalQueryDto,
  ) {
    await this.getWebsite(
      organizationId,
      dto.websiteId,
    );

    const query = dto.query?.trim();

    if (!query) {
      throw new BadRequestException(
        'Query text is required',
      );
    }

    /*
     * Controller DTO is an Omit type (not a
     * class), so validation runs here to keep
     * categories within the supported set.
     */
    if (
      dto.category !== undefined &&
      !(
        LOCAL_QUERY_CATEGORIES as readonly string[]
      ).includes(dto.category)
    ) {
      throw new BadRequestException(
        `Category must be one of: ${LOCAL_QUERY_CATEGORIES.join(', ')}`,
      );
    }

    let locationId: string | null = null;

    if (dto.locationId?.trim()) {
      const location =
        await this.assertLocation(
          organizationId,
          dto.locationId.trim(),
        );

      if (
        location.websiteId &&
        location.websiteId !==
          dto.websiteId
      ) {
        throw new BadRequestException(
          'Location belongs to a different website',
        );
      }

      locationId = location.id;
    }

    const duplicate =
      await this.prisma.localQuery.findUnique(
        {
          where: {
            websiteId_query: {
              websiteId: dto.websiteId,
              query,
            },
          },
          select: { id: true },
        },
      );

    if (duplicate) {
      throw new BadRequestException(
        'This local query is already tracked',
      );
    }

    return this.prisma.localQuery.create(
      {
        data: {
          organizationId,
          websiteId: dto.websiteId,
          locationId,
          query,
          category:
            dto.category ??
            'local-service',
        },
      },
    );
  }

  async updateLocalQuery(
    organizationId: string,
    id: string,
    dto: UpdateLocalQueryDto,
  ) {
    const existing =
      await this.prisma.localQuery.findFirst(
        {
          where: {
            id,
            organizationId,
          },
        },
      );

    if (!existing) {
      throw new NotFoundException(
        'Local query not found',
      );
    }

    let locationId:
      | string
      | null
      | undefined = undefined;

    if (dto.locationId !== undefined) {
      if (!dto.locationId?.trim()) {
        locationId = null;
      } else {
        const location =
          await this.assertLocation(
            organizationId,
            dto.locationId.trim(),
          );

        if (
          location.websiteId &&
          location.websiteId !==
            existing.websiteId
        ) {
          throw new BadRequestException(
            'Location belongs to a different website',
          );
        }

        locationId = location.id;
      }
    }

    if (
      dto.category !== undefined &&
      !(
        LOCAL_QUERY_CATEGORIES as readonly string[]
      ).includes(dto.category)
    ) {
      throw new BadRequestException(
        `Category must be one of: ${LOCAL_QUERY_CATEGORIES.join(', ')}`,
      );
    }

    if (dto.query !== undefined) {
      const clean = dto.query.trim();

      if (!clean) {
        throw new BadRequestException(
          'Query text is required',
        );
      }

      const duplicate =
        await this.prisma.localQuery.findFirst(
          {
            where: {
              websiteId:
                existing.websiteId,
              query: clean,
              id: { not: id },
            },
            select: { id: true },
          },
        );

      if (duplicate) {
        throw new BadRequestException(
          'This local query is already tracked',
        );
      }
    }

    return this.prisma.localQuery.update(
      {
        where: { id },
        data: {
          ...(locationId !== undefined
            ? { locationId }
            : {}),
          ...(dto.query !== undefined
            ? {
                query:
                  dto.query.trim(),
              }
            : {}),
          ...(dto.category !==
          undefined
            ? {
                category:
                  dto.category,
              }
            : {}),
          ...(dto.isActive !==
          undefined
            ? {
                isActive:
                  dto.isActive,
              }
            : {}),
        },
      },
    );
  }

  async removeLocalQuery(
    organizationId: string,
    id: string,
  ) {
    const existing =
      await this.prisma.localQuery.findFirst(
        {
          where: {
            id,
            organizationId,
          },
          select: { id: true },
        },
      );

    if (!existing) {
      throw new NotFoundException(
        'Local query not found',
      );
    }

    await this.prisma.localQuery.delete({
      where: { id },
    });

    return { success: true, id };
  }

  // =========================================================
  // CITATIONS (manual records, explicitly labeled)
  // =========================================================

  async listCitations(
    organizationId: string,
    websiteId?: string,
  ) {
    if (websiteId) {
      await this.getWebsite(
        organizationId,
        websiteId,
      );
    }

    const citations =
      await this.prisma.localCitation.findMany(
        {
          where: {
            organizationId,
            ...(websiteId
              ? { websiteId }
              : {}),
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 200,
        },
      );

    return {
      total: citations.length,
      status: 'MANUAL',
      note: 'Citation records are manually managed. No citation data provider is connected.',
      citations,
    };
  }

  async createCitation(
    organizationId: string,
    dto: CreateCitationDto,
  ) {
    const source = dto.source?.trim();

    if (!source) {
      throw new BadRequestException(
        'Citation source is required',
      );
    }

    let websiteId: string | null =
      dto.websiteId?.trim() || null;

    if (websiteId) {
      await this.getWebsite(
        organizationId,
        websiteId,
      );
    }

    let locationId: string | null =
      dto.locationId?.trim() || null;

    if (locationId) {
      const location =
        await this.assertLocation(
          organizationId,
          locationId,
        );

      if (
        websiteId &&
        location.websiteId &&
        location.websiteId !==
          websiteId
      ) {
        throw new BadRequestException(
          'Location belongs to a different website',
        );
      }

      if (!websiteId && location.websiteId) {
        websiteId = location.websiteId;
      }
    }

    return this.prisma.localCitation.create(
      {
        data: {
          organizationId,
          websiteId,
          locationId,
          source,
          sourceUrl:
            dto.sourceUrl?.trim() ||
            null,
          businessName:
            dto.businessName?.trim() ||
            null,
          address:
            dto.address?.trim() ||
            null,
          phone:
            dto.phone?.trim() ||
            null,
          websiteUrl:
            dto.websiteUrl?.trim() ||
            null,
          status:
            dto.status ?? 'UNVERIFIED',
          lastCheckedAt: new Date(),
        },
      },
    );
  }

  async updateCitation(
    organizationId: string,
    id: string,
    dto: UpdateCitationDto,
  ) {
    const existing =
      await this.prisma.localCitation.findFirst(
        {
          where: {
            id,
            organizationId,
          },
          select: { id: true },
        },
      );

    if (!existing) {
      throw new NotFoundException(
        'Citation not found',
      );
    }

    const clean = (
      value: string | undefined,
    ) =>
      value === undefined
        ? undefined
        : value?.trim() || null;

    return this.prisma.localCitation.update(
      {
        where: { id },
        data: {
          ...(dto.source !== undefined
            ? {
                source:
                  dto.source.trim(),
              }
            : {}),
          ...(dto.sourceUrl !==
          undefined
            ? {
                sourceUrl: clean(
                  dto.sourceUrl,
                ),
              }
            : {}),
          ...(dto.businessName !==
          undefined
            ? {
                businessName: clean(
                  dto.businessName,
                ),
              }
            : {}),
          ...(dto.address !== undefined
            ? {
                address: clean(
                  dto.address,
                ),
              }
            : {}),
          ...(dto.phone !== undefined
            ? {
                phone: clean(
                  dto.phone,
                ),
              }
            : {}),
          ...(dto.websiteUrl !==
          undefined
            ? {
                websiteUrl: clean(
                  dto.websiteUrl,
                ),
              }
            : {}),
          ...(dto.status !== undefined
            ? {
                status: dto.status,
                lastCheckedAt:
                  new Date(),
              }
            : {}),
        },
      },
    );
  }

  async removeCitation(
    organizationId: string,
    id: string,
  ) {
    const existing =
      await this.prisma.localCitation.findFirst(
        {
          where: {
            id,
            organizationId,
          },
          select: { id: true },
        },
      );

    if (!existing) {
      throw new NotFoundException(
        'Citation not found',
      );
    }

    await this.prisma.localCitation.delete({
      where: { id },
    });

    return { success: true, id };
  }

  // =========================================================
  // LOCAL COMPETITORS (existing infrastructure)
  // =========================================================

  async listLocalCompetitors(
    organizationId: string,
    websiteId: string,
    locationId?: string,
  ) {
    await this.getWebsite(
      organizationId,
      websiteId,
    );

    if (locationId) {
      await this.assertLocation(
        organizationId,
        locationId,
      );
    }

    const competitors =
      await this.prisma.competitor.findMany(
        {
          where: {
            organizationId,
            websiteId,
            isActive: true,
            ...(locationId
              ? { locationId }
              : {}),
          },
          select: {
            id: true,
            name: true,
            url: true,
            domain: true,
            locationId: true,
            isActive: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
          take: 50,
        },
      );

    return {
      total: competitors.length,
      competitors,
    };
  }

  async attachCompetitor(
    organizationId: string,
    competitorId: string,
    locationId: string | null,
  ) {
    const competitor =
      await this.prisma.competitor.findFirst(
        {
          where: {
            id: competitorId,
            organizationId,
          },
          select: {
            id: true,
            websiteId: true,
          },
        },
      );

    if (!competitor) {
      throw new NotFoundException(
        'Competitor not found',
      );
    }

    if (locationId) {
      const location =
        await this.assertLocation(
          organizationId,
          locationId,
        );

      if (
        location.websiteId &&
        location.websiteId !==
          competitor.websiteId
      ) {
        throw new BadRequestException(
          'Location belongs to a different website',
        );
      }
    }

    return this.prisma.competitor.update(
      {
        where: { id: competitorId },
        data: { locationId },
        select: {
          id: true,
          name: true,
          locationId: true,
        },
      },
    );
  }

  // =========================================================
  // LOCAL HEALTH (evidence only, never penalizes gaps)
  // =========================================================

  private napComplete(location: {
    name?: string | null;
    address?: string | null;
    phone?: string | null;
    websiteUrl?: string | null;
  }): {
    complete: boolean;
    missing: string[];
  } {
    const missing: string[] = [];

    if (!location.name?.trim()) {
      missing.push('business name');
    }

    if (!location.address?.trim()) {
      missing.push('address');
    }

    if (!location.phone?.trim()) {
      missing.push('phone');
    }

    if (!location.websiteUrl?.trim()) {
      missing.push('website');
    }

    return {
      complete: missing.length === 0,
      missing,
    };
  }

  async getHealth(
    organizationId: string,
    websiteId: string,
  ) {
    await this.getWebsite(
      organizationId,
      websiteId,
    );

    const [
      locations,
      queries,
      rankingCount,
      citations,
    ] = await Promise.all([
      this.prisma.businessLocation.findMany(
        {
          where: {
            organizationId,
            websiteId,
            status: 'ACTIVE',
          },
          orderBy: [
            { isPrimary: 'desc' },
            { createdAt: 'asc' },
          ],
          take: 50,
        },
      ),
      this.prisma.localQuery.findMany(
        {
          where: {
            organizationId,
            websiteId,
            isActive: true,
          },
          select: {
            id: true,
            query: true,
            category: true,
            locationId: true,
          },
          take: 200,
        },
      ),
      this.prisma.localRankingObservation.count(
        {
          where: {
            organizationId,
            websiteId,
          },
        },
      ),
      this.prisma.localCitation.findMany(
        {
          where: {
            organizationId,
            websiteId,
          },
          select: {
            id: true,
            source: true,
            status: true,
          },
          take: 200,
        },
      ),
    ]);

    const areas: Array<{
      key: string;
      title: string;
      state: LocalHealthState;
      evidence: string;
      limitation: string | null;
    }> = [];

    if (locations.length === 0) {
      areas.push({
        key: 'locations',
        title: 'Business locations',
        state: 'DATA_GAP',
        evidence:
          'No business locations are configured for this website.',
        limitation:
          'Add at least one location to anchor local tracking.',
      });
    } else {
      const primary =
        locations.find(
          (location) =>
            location.isPrimary,
        ) ?? locations[0];
      const nap = this.napComplete(
        primary,
      );

      areas.push({
        key: 'locations',
        title: 'Business locations',
        state: nap.complete
          ? 'GOOD'
          : 'ATTENTION',
        evidence: `${locations.length} location(s) configured. Primary: ${primary.name}${nap.complete ? ' with complete NAP.' : ` missing ${nap.missing.join(', ')}.`}`,
        limitation: nap.complete
          ? null
          : 'Complete the primary location profile before judging local visibility.',
      });
    }

    if (queries.length === 0) {
      areas.push({
        key: 'queries',
        title: 'Local search tracking',
        state: 'DATA_GAP',
        evidence:
          'No local queries are tracked for this website.',
        limitation:
          'Track local searches to monitor before drawing conclusions.',
      });
    } else {
      areas.push({
        key: 'queries',
        title: 'Local search tracking',
        state: 'GOOD',
        evidence: `${queries.length} local querie(s) tracked across ${new Set(queries.map((query) => query.category)).size} intent categories.`,
        limitation:
          'Tracked queries carry no positions until a ranking source is connected.',
      });
    }

    areas.push({
      key: 'rankings',
      title: 'Local rankings',
      state: 'NOT_AVAILABLE',
      evidence:
        rankingCount > 0
          ? `${rankingCount} ranking observation(s) recorded.`
          : 'No ranking observations recorded.',
      limitation:
        'No ranking data source is connected. Positions are never estimated.',
    });

    areas.push({
      key: 'reviews',
      title: 'Reviews',
      state: 'NOT_AVAILABLE',
      evidence:
        'No review source is connected.',
      limitation: reviewStatus().limitation,
    });

    areas.push({
      key: 'citations',
      title: 'Citations',
      state:
        citations.length > 0
          ? 'ATTENTION'
          : 'NOT_AVAILABLE',
      evidence:
        citations.length > 0
          ? `${citations.length} manually managed citation record(s). None automatically verified.`
          : 'No citation records exist.',
      limitation:
        'No citation data provider is connected. Manual records are labeled MANUAL.',
    });

    areas.push({
      key: 'gbp',
      title: 'Google Business Profile',
      state: 'NOT_AVAILABLE',
      evidence:
        'Google Business Profile is not connected.',
      limitation:
        'Read-only GBP access requires the business.manage OAuth scope and Google API approval, which are not configured.',
    });

    /*
     * Overall never penalizes unavailable
     * sources — only configured evidence counts.
     */
    const decisive = areas.filter(
      (area) =>
        area.key === 'locations' ||
        area.key === 'queries',
    );

    const overall: LocalHealthState =
      decisive.some(
        (area) =>
          area.state === 'DATA_GAP',
      )
        ? 'DATA_GAP'
        : decisive.some(
              (area) =>
                area.state ===
                'ATTENTION',
            )
          ? 'ATTENTION'
          : 'GOOD';

    const persisted =
      await this.syncOpportunities(
        organizationId,
        websiteId,
        locations,
        queries,
      );

    return {
      websiteId,
      overall,
      overallNote:
        'Overall reflects configured locations and tracked queries only. Unavailable sources never lower the rating.',
      areas,
      categories: [
        ...LOCAL_QUERY_CATEGORIES,
      ],
      opportunities: persisted,
    };
  }

  // =========================================================
  // LOCAL OPPORTUNITIES (evidence-gated, unified queue)
  // =========================================================

  private async upsertLocalOpportunity(
    organizationId: string,
    websiteId: string,
    opportunity: {
      key: string;
      title: string;
      description: string;
      priority: string;
      actionText: string;
      metadata: Record<string, unknown>;
    },
  ) {
    const existing =
      await this.prisma.recommendation.findFirst(
        {
          where: {
            organizationId,
            websiteId,
            source: 'LOCAL_SEO',
            type: opportunity.key,
            title: opportunity.title,
          },
        },
      );

    const data = {
      organizationId,
      websiteId,
      source: 'LOCAL_SEO',
      type: opportunity.key,
      title: opportunity.title,
      description:
        opportunity.description,
      priority: opportunity.priority,
      impact: 'MEDIUM',
      effort: 'LOW',
      actionText:
        opportunity.actionText,
      metadata: {
        websiteId,
        source: 'LOCAL_SEO',
        opportunityKey:
          opportunity.key,
        ...opportunity.metadata,
      },
    };

    const recommendation = existing
      ? await this.prisma.recommendation.update(
          {
            where: {
              id: existing.id,
            },
            data,
          },
        )
      : await this.prisma.recommendation.create(
          {
            data,
          },
        );

    return {
      ...opportunity,
      recommendationId:
        recommendation.id,
    };
  }

  private async syncOpportunities(
    organizationId: string,
    websiteId: string,
    locations: Array<{
      id: string;
      name: string;
      address?: string | null;
      phone?: string | null;
      websiteUrl?: string | null;
    }>,
    queries: Array<{
      id: string;
      query: string;
    }>,
  ) {
    const persisted: any[] = [];

    if (locations.length === 0) {
      persisted.push(
        await this.upsertLocalOpportunity(
          organizationId,
          websiteId,
          {
            key: 'LOCATION_PROFILE_INCOMPLETE',
            title:
              'Add a business location',
            description:
              'No business locations are configured, so local tracking has no anchor.',
            priority: 'MEDIUM',
            actionText:
              'Add the primary business location with name, address, phone and website.',
            metadata: { count: 0 },
          },
        ),
      );
    } else {
      const incomplete =
        locations.filter(
          (location) =>
            !this.napComplete(
              location,
            ).complete,
        );

      if (incomplete.length > 0) {
        persisted.push(
          await this.upsertLocalOpportunity(
            organizationId,
            websiteId,
            {
              key: 'NAP_INCOMPLETE',
              title:
                'Complete location NAP details',
              description: `${incomplete.length} location(s) are missing name, address, phone or website.`,
              priority: 'MEDIUM',
              actionText:
                'Fill the missing NAP fields on each location profile.',
              metadata: {
                count:
                  incomplete.length,
                locations:
                  incomplete
                    .slice(0, 10)
                    .map(
                      (location) =>
                        location.name,
                    ),
              },
            },
          ),
        );
      }
    }

    if (queries.length === 0) {
      persisted.push(
        await this.upsertLocalOpportunity(
          organizationId,
          websiteId,
          {
            key: 'LOCAL_QUERY_NOT_TRACKED',
            title:
              'Track local searches',
            description:
              'No local queries are tracked, so local visibility cannot be monitored.',
            priority: 'MEDIUM',
            actionText:
              'Track service + city queries that local buyers actually search.',
            metadata: { count: 0 },
          },
        ),
      );
    }

    persisted.push(
      await this.upsertLocalOpportunity(
        organizationId,
        websiteId,
        {
          key: 'GBP_NOT_CONNECTED',
          title:
            'Google Business Profile unavailable',
          description:
            'GBP read-only access is unavailable: OAuth scopes exclude business.manage and no API approval exists.',
          priority: 'LOW',
          actionText:
            'No action available yet. Manual location data remains the source of truth.',
          metadata: {
            gbpStatus: 'NOT_AVAILABLE',
          },
        },
      ),
    );

    return persisted;
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

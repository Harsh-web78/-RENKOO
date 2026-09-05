import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';

import { CreateWebsiteDto } from './dto/create-website.dto';
import { UpdateWebsiteDto } from './dto/update-website.dto';

@Injectable()
export class WebsitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
  ) {}

  async create(
    organizationId: string,
    dto: CreateWebsiteDto,
  ) {
    const current =
      await this.prisma.website.count({
        where: { organizationId },
      });

    await this.billingService.enforceCreation(
      organizationId,
      'WEBSITES',
      current,
    );

    const url = dto.url.trim();

    const existing =
      await this.prisma.website.findFirst({
        where: {
          organizationId,
          url,
        },
      });

    if (existing) {
      throw new ConflictException(
        'This website is already connected to this workspace',
      );
    }

    return this.prisma.website.create({
      data: {
        organizationId,
        name: dto.name.trim(),
        url,
        industry:
          dto.industry?.trim() || undefined,
        country:
          dto.country?.trim() || undefined,
      },
    });
  }

  async findAll(
    organizationId: string,
  ) {
    return this.prisma.website.findMany({
      where: {
        organizationId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(
    organizationId: string,
    id: string,
  ) {
    const website =
      await this.prisma.website.findFirst({
        where: {
          id,
          organizationId,
        },
      });

    if (!website) {
      throw new NotFoundException(
        'Website not found',
      );
    }

    return website;
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateWebsiteDto,
  ) {
    const existing =
      await this.findOne(
        organizationId,
        id,
      );

    if (
      dto.url &&
      dto.url !== existing.url
    ) {
      const duplicate =
        await this.prisma.website.findFirst({
          where: {
            organizationId,
            url: dto.url,
            NOT: {
              id,
            },
          },
        });

      if (duplicate) {
        throw new ConflictException(
          'This website is already connected to this workspace',
        );
      }
    }

    return this.prisma.website.update({
      where: {
        id,
      },
      data: {
        ...(dto.name !== undefined && {
          name: dto.name.trim(),
        }),

        ...(dto.url !== undefined && {
          url: dto.url.trim(),
        }),

        ...(dto.industry !== undefined && {
          industry:
            dto.industry.trim(),
        }),

        ...(dto.country !== undefined && {
          country:
            dto.country.trim(),
        }),

        ...(dto.isActive !== undefined && {
          isActive: dto.isActive,
        }),
      },
    });
  }

  async remove(
    organizationId: string,
    id: string,
  ) {
    await this.findOne(
      organizationId,
      id,
    );

    return this.prisma.website.delete({
      where: {
        id,
      },
    });
  }
}
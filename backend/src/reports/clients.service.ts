import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';

import type {
  CreateClientDto,
  UpdateClientDto,
} from './dto/client.dto';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
  ) {}

  async list(
    organizationId: string,
  ) {
    const clients =
      await this.prisma.client.findMany(
        {
          where: { organizationId },
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            websites: {
              select: {
                id: true,
                name: true,
                url: true,
                isActive: true,
              },
            },
            _count: {
              select: {
                reports: true,
              },
            },
          },
        },
      );

    return {
      total: clients.length,
      clients: clients.map(
        (client) => ({
          id: client.id,
          name: client.name,
          company: client.company,
          email: client.email,
          status: client.status,
          notes: client.notes,
          createdAt:
            client.createdAt,
          websites:
            client.websites,
          reportCount:
            client._count.reports,
        }),
      ),
    };
  }

  async get(
    organizationId: string,
    id: string,
  ) {
    const client =
      await this.prisma.client.findFirst(
        {
          where: {
            id,
            organizationId,
          },
          include: {
            websites: {
              select: {
                id: true,
                name: true,
                url: true,
                isActive: true,
              },
            },
          },
        },
      );

    if (!client) {
      throw new NotFoundException(
        'Client not found',
      );
    }

    return client;
  }

  async create(
    organizationId: string,
    dto: CreateClientDto,
  ) {
    const name = dto.name.trim();

    if (!name) {
      throw new BadRequestException(
        'Client name is required',
      );
    }

    const current =
      await this.prisma.client.count({
        where: { organizationId },
      });

    await this.billingService.enforceCreation(
      organizationId,
      'CLIENTS',
      current,
    );

    return this.prisma.client.create({
      data: {
        organizationId,
        name,
        company:
          dto.company?.trim() ||
          null,
        email:
          dto.email?.trim() ||
          null,
        notes:
          dto.notes?.trim() ||
          null,
      },
    });
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateClientDto,
  ) {
    await this.get(
      organizationId,
      id,
    );

    if (
      dto.name !== undefined &&
      !dto.name.trim()
    ) {
      throw new BadRequestException(
        'Client name is required',
      );
    }

    return this.prisma.client.update({
      where: { id },
      data: {
        ...(dto.name !== undefined
          ? {
              name: dto.name.trim(),
            }
          : {}),
        ...(dto.company !== undefined
          ? {
              company:
                dto.company.trim() ||
                null,
            }
          : {}),
        ...(dto.email !== undefined
          ? {
              email:
                dto.email.trim() ||
                null,
            }
          : {}),
        ...(dto.status !== undefined
          ? { status: dto.status }
          : {}),
        ...(dto.notes !== undefined
          ? {
              notes:
                dto.notes.trim() ||
                null,
            }
          : {}),
      },
    });
  }

  async remove(
    organizationId: string,
    id: string,
  ) {
    await this.get(
      organizationId,
      id,
    );

    await this.prisma.client.delete({
      where: { id },
    });

    return {
      success: true,
      id,
    };
  }

  async assignWebsite(
    organizationId: string,
    websiteId: string,
    clientId: string | null,
  ) {
    const website =
      await this.prisma.website.findFirst(
        {
          where: {
            id: websiteId,
            organizationId,
            isActive: true,
          },
          select: { id: true },
        },
      );

    if (!website) {
      throw new NotFoundException(
        'Website not found',
      );
    }

    if (clientId) {
      const client =
        await this.prisma.client.findFirst(
          {
            where: {
              id: clientId,
              organizationId,
            },
            select: { id: true },
          },
        );

      if (!client) {
        throw new NotFoundException(
          'Client not found',
        );
      }
    }

    return this.prisma.website.update({
      where: { id: websiteId },
      data: {
        clientId: clientId ?? null,
      },
      select: {
        id: true,
        name: true,
        clientId: true,
      },
    });
  }
}

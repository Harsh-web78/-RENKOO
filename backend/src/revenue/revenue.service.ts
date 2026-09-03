import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RevenueService {
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

    const revenues = await this.prisma.revenue.findMany({
      where: {
        websiteId,
        status: 'RECOGNIZED',
      },
    });

    const totalRevenue = revenues.reduce(
      (sum, item) => sum + item.amount,
      0,
    );

    const transactions = revenues.length;

    const averageRevenue =
      transactions > 0
        ? totalRevenue / transactions
        : 0;

    return {
      websiteId,
      currency: 'INR',
      totalRevenue,
      transactions,
      averageRevenue,
    };
  }

  async list(
    organizationId: string,
    websiteId: string,
  ) {
    await this.getWebsite(organizationId, websiteId);

    const revenues = await this.prisma.revenue.findMany({
      where: {
        websiteId,
      },
      orderBy: {
        recognizedAt: 'desc',
      },
      take: 500,
    });

    return {
      websiteId,
      total: revenues.length,
      revenues,
    };
  }

  async create(
    organizationId: string,
    websiteId: string,
    data: {
      leadId?: string;
      amount: number;
      currency?: string;
      source?: string;
      sourceDetail?: string;
      status?: string;
      description?: string;
    },
  ) {
    await this.getWebsite(organizationId, websiteId);

    if (data.leadId) {
      const lead = await this.prisma.lead.findFirst({
        where: {
          id: data.leadId,
          websiteId,
        },
      });

      if (!lead) {
        throw new NotFoundException('Lead not found');
      }

      await this.prisma.lead.update({
        where: {
          id: lead.id,
        },
        data: {
          converted: true,
          convertedAt: new Date(),
          status: 'CONVERTED',
        },
      });
    }

    return this.prisma.revenue.create({
      data: {
        websiteId,
        leadId: data.leadId,
        amount: data.amount,
        currency: data.currency ?? 'INR',
        source: data.source,
        sourceDetail: data.sourceDetail,
        status: data.status ?? 'RECOGNIZED',
        description: data.description,
      },
    });
  }
}

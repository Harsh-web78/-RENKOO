import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MarketingSpendService {
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

  async create(
    organizationId: string,
    websiteId: string,
    data: {
      amount: number;
      currency?: string;
      source: string;
      campaign?: string;
      description?: string;
      spendDate?: string;
    },
  ) {
    await this.getWebsite(organizationId, websiteId);

    const amount = Number(data.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException(
        'Spend amount must be greater than 0',
      );
    }

    if (
      typeof data.source !== 'string' ||
      !data.source.trim()
    ) {
      throw new BadRequestException(
        'Spend source is required',
      );
    }

    let spendDate: Date | undefined;

    if (data.spendDate) {
      spendDate = new Date(data.spendDate);

      if (Number.isNaN(spendDate.getTime())) {
        throw new BadRequestException(
          'Invalid spend date',
        );
      }
    }

    return this.prisma.marketingSpend.create({
      data: {
        websiteId,
        amount,
        currency: data.currency?.trim() || 'INR',
        source: data.source.trim(),
        campaign: data.campaign?.trim() || undefined,
        description: data.description?.trim() || undefined,
        spendDate,
      },
    });
  }

  async list(
    organizationId: string,
    websiteId: string,
  ) {
    await this.getWebsite(organizationId, websiteId);

    const spends = await this.prisma.marketingSpend.findMany({
      where: {
        websiteId,
      },
      orderBy: {
        spendDate: 'desc',
      },
      take: 500,
    });

    return {
      websiteId,
      total: spends.length,
      spends,
    };
  }

  async summary(
    organizationId: string,
    websiteId: string,
  ) {
    await this.getWebsite(organizationId, websiteId);

    const spends = await this.prisma.marketingSpend.findMany({
      where: {
        websiteId,
      },
    });

    const totalSpend = spends.reduce(
      (sum, item) => sum + item.amount,
      0,
    );

    return {
      websiteId,
      currency: 'INR',
      totalSpend,
      transactions: spends.length,
      averageSpend:
        spends.length > 0
          ? totalSpend / spends.length
          : 0,
    };
  }

  async remove(
    organizationId: string,
    websiteId: string,
    id: string,
  ) {
    await this.getWebsite(organizationId, websiteId);

    const spend = await this.prisma.marketingSpend.findFirst({
      where: {
        id,
        websiteId,
      },
    });

    if (!spend) {
      throw new NotFoundException('Marketing spend not found');
    }

    return this.prisma.marketingSpend.delete({
      where: {
        id: spend.id,
      },
    });
  }
}

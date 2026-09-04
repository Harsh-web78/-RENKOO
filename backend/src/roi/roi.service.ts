import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RoiService {
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
    from?: string,
    to?: string,
  ) {
    await this.getWebsite(organizationId, websiteId);

    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;

    if (
      (fromDate && Number.isNaN(fromDate.getTime())) ||
      (toDate && Number.isNaN(toDate.getTime()))
    ) {
      throw new Error('Invalid date range');
    }

    if (fromDate && toDate && fromDate > toDate) {
      throw new Error('From date must be before to date');
    }

    const revenueWhere: any = {
      websiteId,
      status: 'RECOGNIZED',
    };

    const spendWhere: any = {
      websiteId,
    };

    if (fromDate || toDate) {
      revenueWhere.recognizedAt = {};
      spendWhere.spendDate = {};

      if (fromDate) {
        revenueWhere.recognizedAt.gte = fromDate;
        spendWhere.spendDate.gte = fromDate;
      }

      if (toDate) {
        revenueWhere.recognizedAt.lte = toDate;
        spendWhere.spendDate.lte = toDate;
      }
    }

    const [revenues, spends, convertedLeads] =
      await Promise.all([
        this.prisma.revenue.findMany({
          where: revenueWhere,
          select: {
            id: true,
            amount: true,
            currency: true,
            source: true,
            sourceDetail: true,
            recognizedAt: true,
          },
        }),

        this.prisma.marketingSpend.findMany({
          where: spendWhere,
          select: {
            id: true,
            amount: true,
            currency: true,
            source: true,
            campaign: true,
            spendDate: true,
          },
        }),

        this.prisma.lead.count({
          where: {
            websiteId,
            converted: true,
            ...(fromDate || toDate
              ? {
                  convertedAt: {
                    ...(fromDate
                      ? { gte: fromDate }
                      : {}),
                    ...(toDate
                      ? { lte: toDate }
                      : {}),
                  },
                }
              : {}),
          },
        }),
      ]);

    const totalRevenue = revenues.reduce(
      (sum, item) => sum + item.amount,
      0,
    );

    const totalSpend = spends.reduce(
      (sum, item) => sum + item.amount,
      0,
    );

    const profit = totalRevenue - totalSpend;

    const roi =
      totalSpend > 0
        ? (profit / totalSpend) * 100
        : null;

    const roas =
      totalSpend > 0
        ? totalRevenue / totalSpend
        : null;

    const revenueBySource: Record<string, number> = {};
    const spendBySource: Record<string, number> = {};

    for (const item of revenues) {
      const source = item.source?.trim() || 'OTHER';
      revenueBySource[source] =
        (revenueBySource[source] || 0) + item.amount;
    }

    for (const item of spends) {
      const source = item.source?.trim() || 'OTHER';
      spendBySource[source] =
        (spendBySource[source] || 0) + item.amount;
    }

    const sources = Array.from(
      new Set([
        ...Object.keys(revenueBySource),
        ...Object.keys(spendBySource),
      ]),
    );

    const bySource = sources.map((source) => {
      const revenue = revenueBySource[source] || 0;
      const spend = spendBySource[source] || 0;
      const sourceProfit = revenue - spend;

      return {
        source,
        revenue,
        spend,
        profit: sourceProfit,
        roi:
          spend > 0
            ? (sourceProfit / spend) * 100
            : null,
        roas:
          spend > 0
            ? revenue / spend
            : null,
      };
    });

    return {
      websiteId,
      currency: 'INR',
      dateRange: {
        from: fromDate?.toISOString() ?? null,
        to: toDate?.toISOString() ?? null,
      },
      totalRevenue,
      totalSpend,
      profit,
      roi,
      roas,
      convertedLeads,
      revenueTransactions: revenues.length,
      spendTransactions: spends.length,
      bySource,
    };
  }
}

import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { GoogleService } from '../google/google.service';

export type AttributionTier =
  | 'DIRECTLY_ATTRIBUTED'
  | 'SOURCE_RECORDED'
  | 'UNATTRIBUTED';

@Injectable()
export class RoiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleService: GoogleService,
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

  // =========================================================
  // OUTCOME ENGINE
  //
  // Funnel + attribution tiers + attributed ROI +
  // conversion gaps, all computed from persisted records.
  // Missing stages are null, never zero-filled estimates.
  // =========================================================

  async outcome(
    organizationId: string,
    websiteId: string,
    from?: string,
    to?: string,
  ) {
    await this.getWebsite(
      organizationId,
      websiteId,
    );

    const range = this.parseRange(
      from,
      to,
    );

    const createdFilter = range
      ? {
          createdAt: {
            ...(range.from
              ? { gte: range.from }
              : {}),
            ...(range.to
              ? { lte: range.to }
              : {}),
          },
        }
      : {};

    const recognizedFilter = range
      ? {
          recognizedAt: {
            ...(range.from
              ? { gte: range.from }
              : {}),
            ...(range.to
              ? { lte: range.to }
              : {}),
          },
        }
      : {};

    const spendFilter = range
      ? {
          spendDate: {
            ...(range.from
              ? { gte: range.from }
              : {}),
            ...(range.to
              ? { lte: range.to }
              : {}),
          },
        }
      : {};

    const [
      leads,
      revenues,
      spends,
      visitors,
    ] = await Promise.all([
      this.prisma.lead.findMany({
        where: {
          websiteId,
          ...createdFilter,
        },
        select: {
          id: true,
          source: true,
          status: true,
          converted: true,
          convertedAt: true,
          landingPage: true,
          estimatedValue: true,
          createdAt: true,
        },
      }),

      this.prisma.revenue.findMany({
        where: {
          websiteId,
          status: 'RECOGNIZED',
          ...recognizedFilter,
        },
        select: {
          id: true,
          leadId: true,
          amount: true,
          source: true,
          recognizedAt: true,
        },
      }),

      this.prisma.marketingSpend.findMany(
        {
          where: {
            websiteId,
            ...spendFilter,
          },
          select: {
            amount: true,
            source: true,
          },
        },
      ),

      this.analyticsVisitors(
        organizationId,
        range,
      ),
    ]);

    // -------------------------------------------------------
    // Funnel (real counts only)
    // -------------------------------------------------------

    const converted = leads.filter(
      (lead) => lead.converted,
    ).length;
    const qualified = leads.filter(
      (lead) =>
        lead.status === 'QUALIFIED' ||
        lead.converted,
    ).length;

    const conversionRate =
      leads.length > 0
        ? Number(
            (
              (converted /
                leads.length) *
              100
            ).toFixed(2),
          )
        : null;

    // -------------------------------------------------------
    // Attribution tiers (recognized revenue only)
    // -------------------------------------------------------

    const tierOf = (item: {
      leadId: string | null;
      source: string | null;
    }): AttributionTier => {
      if (item.leadId) {
        return 'DIRECTLY_ATTRIBUTED';
      }

      const source = (
        item.source ?? ''
      )
        .trim()
        .toUpperCase();

      if (source && source !== 'OTHER') {
        return 'SOURCE_RECORDED';
      }

      return 'UNATTRIBUTED';
    };

    const tiers: Record<
      AttributionTier,
      { count: number; amount: number }
    > = {
      DIRECTLY_ATTRIBUTED: {
        count: 0,
        amount: 0,
      },
      SOURCE_RECORDED: {
        count: 0,
        amount: 0,
      },
      UNATTRIBUTED: {
        count: 0,
        amount: 0,
      },
    };

    for (const item of revenues) {
      const tier = tierOf(item);

      tiers[tier].count += 1;
      tiers[tier].amount += Number(
        item.amount ?? 0,
      );
    }

    const totalRevenue = revenues.reduce(
      (sum, item) =>
        sum +
        Number(item.amount ?? 0),
      0,
    );
    const totalSpend = spends.reduce(
      (sum, item) =>
        sum +
        Number(item.amount ?? 0),
      0,
    );

    const attributedRevenue =
      tiers.DIRECTLY_ATTRIBUTED
        .amount;

    const attributionCoverage =
      totalRevenue > 0
        ? Number(
            (
              (attributedRevenue /
                totalRevenue) *
              100
            ).toFixed(2),
          )
        : null;

    // ROI only on attributed revenue with real spend.
    const attributedProfit =
      attributedRevenue - totalSpend;
    const attributedRoi =
      totalSpend > 0 &&
      attributedRevenue > 0
        ? Number(
            (
              (attributedProfit /
                totalSpend) *
              100
            ).toFixed(2),
          )
        : null;

    // -------------------------------------------------------
    // Source performance (leads, conversions, revenue, spend)
    // -------------------------------------------------------

    const bySource = new Map<
      string,
      {
        source: string;
        leads: number;
        conversions: number;
        attributedRevenue: number;
        sourceRevenue: number;
        spend: number;
      }
    >();

    const sourceKey = (
      value: unknown,
    ) =>
      String(value ?? '')
        .trim()
        .toUpperCase() || 'OTHER';

    for (const lead of leads) {
      const key = sourceKey(
        lead.source,
      );
      const entry = bySource.get(
        key,
      ) ?? {
        source: key,
        leads: 0,
        conversions: 0,
        attributedRevenue: 0,
        sourceRevenue: 0,
        spend: 0,
      };

      entry.leads += 1;

      if (lead.converted) {
        entry.conversions += 1;
      }

      bySource.set(key, entry);
    }

    for (const item of revenues) {
      const key = sourceKey(
        item.source,
      );
      const entry = bySource.get(
        key,
      ) ?? {
        source: key,
        leads: 0,
        conversions: 0,
        attributedRevenue: 0,
        sourceRevenue: 0,
        spend: 0,
      };

      const amount = Number(
        item.amount ?? 0,
      );

      entry.sourceRevenue += amount;

      if (item.leadId) {
        entry.attributedRevenue +=
          amount;
      }

      bySource.set(key, entry);
    }

    for (const spend of spends) {
      const key = sourceKey(
        spend.source,
      );
      const entry = bySource.get(
        key,
      ) ?? {
        source: key,
        leads: 0,
        conversions: 0,
        attributedRevenue: 0,
        sourceRevenue: 0,
        spend: 0,
      };

      entry.spend += Number(
        spend.amount ?? 0,
      );
      bySource.set(key, entry);
    }

    const sources = [...bySource.values()]
      .map((entry) => ({
        ...entry,
        conversionRate:
          entry.leads > 0
            ? Number(
                (
                  (entry.conversions /
                    entry.leads) *
                  100
                ).toFixed(2),
              )
            : null,
        roi:
          entry.spend > 0 &&
          entry.attributedRevenue > 0
            ? Number(
                (
                  ((entry.attributedRevenue -
                    entry.spend) /
                    entry.spend) *
                  100
                ).toFixed(2),
              )
            : null,
      }))
      .sort(
        (a, b) =>
          b.attributedRevenue -
          a.attributedRevenue,
      );

    // -------------------------------------------------------
    // Recent changes (absolute deltas, 30d vs prior 30d)
    // -------------------------------------------------------

    const now = new Date();
    const priorStart = new Date(now);
    priorStart.setDate(
      priorStart.getDate() - 60,
    );
    const priorEnd = new Date(now);
    priorEnd.setDate(
      priorEnd.getDate() - 30,
    );

    const [
      recentLeads,
      priorLeads,
      recentRevenue,
      priorRevenue,
    ] = await Promise.all([
      this.prisma.lead.count({
        where: {
          websiteId,
          createdAt: { gte: priorEnd },
        },
      }),
      this.prisma.lead.count({
        where: {
          websiteId,
          createdAt: {
            gte: priorStart,
            lt: priorEnd,
          },
        },
      }),
      this.prisma.revenue.aggregate({
        where: {
          websiteId,
          status: 'RECOGNIZED',
          recognizedAt: {
            gte: priorEnd,
          },
        },
        _sum: { amount: true },
      }),
      this.prisma.revenue.aggregate({
        where: {
          websiteId,
          status: 'RECOGNIZED',
          recognizedAt: {
            gte: priorStart,
            lt: priorEnd,
          },
        },
        _sum: { amount: true },
      }),
    ]);

    // -------------------------------------------------------
    // Conversion gaps → persisted recommendations
    // -------------------------------------------------------

    const gaps =
      await this.persistConversionGaps(
        organizationId,
        websiteId,
        leads.length,
        converted,
        conversionRate,
        attributionCoverage,
        totalRevenue,
        totalSpend,
        attributedRoi,
      );

    return {
      websiteId,
      currency: 'INR',
      dateRange: {
        from:
          range?.from?.toISOString() ??
          null,
        to:
          range?.to?.toISOString() ??
          null,
      },
      funnel: {
        visitors: visitors.value,
        visitorsAvailability:
          visitors.availability,
        engaged: null,
        engagedAvailability:
          'NO_DATA',
        leads: leads.length,
        qualified,
        conversions: converted,
        conversionRate,
        revenue: totalRevenue,
        revenueTransactions:
          revenues.length,
      },
      attribution: {
        tiers,
        attributedRevenue,
        totalRevenue,
        coverage: attributionCoverage,
      },
      roi: {
        spend: totalSpend,
        attributedRevenue,
        attributedProfit,
        attributedRoi,
        measurable:
          attributedRoi !== null,
      },
      sources,
      recentChanges: {
        leadsRecent: recentLeads,
        leadsPrior: priorLeads,
        leadsDelta:
          recentLeads - priorLeads,
        revenueRecent: Number(
          recentRevenue._sum.amount ??
            0,
        ),
        revenuePrior: Number(
          priorRevenue._sum.amount ??
            0,
        ),
        revenueDelta:
          Number(
            recentRevenue._sum
              .amount ?? 0,
          ) -
          Number(
            priorRevenue._sum
              .amount ?? 0,
          ),
      },
      conversionGaps: gaps,
    };
  }

  private parseRange(
    from?: string,
    to?: string,
  ):
    | {
        from?: Date;
        to?: Date;
      }
    | undefined {
    const fromDate = from
      ? new Date(from)
      : undefined;
    const toDate = to
      ? new Date(to)
      : undefined;

    if (
      (fromDate &&
        Number.isNaN(
          fromDate.getTime(),
        )) ||
      (toDate &&
        Number.isNaN(
          toDate.getTime(),
        ))
    ) {
      throw new Error(
        'Invalid date range',
      );
    }

    if (
      fromDate &&
      toDate &&
      fromDate > toDate
    ) {
      throw new Error(
        'From date must be before to date',
      );
    }

    if (!fromDate && !toDate) {
      return undefined;
    }

    return {
      ...(fromDate
        ? { from: fromDate }
        : {}),
      ...(toDate
        ? { to: toDate }
        : {}),
    };
  }

  private async analyticsVisitors(
    organizationId: string,
    range:
      | {
          from?: Date;
          to?: Date;
        }
      | undefined,
  ): Promise<{
    value: number | null;
    availability: string;
  }> {
    const end = (
      range?.to ?? new Date()
    )
      .toISOString()
      .slice(0, 10);
    const startDate = range?.from
      ? range.from
          .toISOString()
          .slice(0, 10)
      : daysAgo(30);

    try {
      const report: any =
        await this.googleService.getAnalyticsReport(
          organizationId,
          startDate,
          end,
        );

      /*
       * Real GA4 shape is { rows: [{ sessions,
       * activeUsers, ... }] }. Aggregate honestly:
       * rows present with activity -> AVAILABLE,
       * rows present but all zero -> NO_DATA
       * (never fabricated business activity).
       */
      const rows: any[] = Array.isArray(
        report?.rows,
      )
        ? report.rows
        : [];

      let sessions = 0;
      let activeUsers = 0;

      for (const row of rows) {
        const rowSessions = Number(
          row?.sessions ?? 0,
        );
        const rowUsers = Number(
          row?.activeUsers ?? 0,
        );

        if (Number.isFinite(rowSessions)) {
          sessions += rowSessions;
        }

        if (Number.isFinite(rowUsers)) {
          activeUsers += rowUsers;
        }
      }

      if (sessions > 0) {
        return {
          value: Math.round(sessions),
          availability: 'AVAILABLE',
        };
      }

      if (rows.length > 0) {
        return {
          value: null,
          availability: 'NO_DATA',
        };
      }

      return {
        value: null,
        availability: 'NO_DATA',
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : '';

      return {
        value: null,
        availability:
          /not connected|no .* selected|property|revok|expir/i.test(
            message,
          )
            ? 'NOT_CONNECTED'
            : 'NO_DATA',
      };
    }
  }

  private async persistConversionGaps(
    organizationId: string,
    websiteId: string,
    totalLeads: number,
    converted: number,
    conversionRate: number | null,
    coverage: number | null,
    totalRevenue: number,
    totalSpend: number,
    attributedRoi: number | null,
  ) {
    const gaps: Array<{
      key: string;
      title: string;
      description: string;
      priority: string;
    }> = [];

    const unconverted =
      totalLeads - converted;

    if (
      totalLeads > 0 &&
      conversionRate !== null &&
      conversionRate < 20 &&
      unconverted >= 3
    ) {
      gaps.push({
        key: 'LOW_CONVERSION',
        title: `Low lead conversion (${conversionRate}%)`,
        description: `${converted} of ${totalLeads} recorded leads converted. ${unconverted} leads did not convert in the selected range.`,
        priority:
          conversionRate < 10
            ? 'HIGH'
            : 'MEDIUM',
      });
    }

    if (
      totalRevenue > 0 &&
      coverage !== null &&
      coverage < 50
    ) {
      gaps.push({
        key: 'WEAK_ATTRIBUTION',
        title: `Weak revenue attribution (${coverage}% linked)`,
        description: `Only ${coverage}% of recognized revenue links directly to a lead record. The rest cannot be attributed to a source journey.`,
        priority: 'MEDIUM',
      });
    }

    if (
      totalSpend > 0 &&
      attributedRoi === null
    ) {
      gaps.push({
        key: 'UNMEASURABLE_ROI',
        title:
          'ROI cannot be measured from attributed revenue',
        description: `Marketing spend is recorded but no attributed revenue exists in the selected range, so ROI stays unavailable rather than guessed.`,
        priority: 'MEDIUM',
      });
    }

    const persisted: any[] = [];

    for (const gap of gaps) {
      const existing =
        await this.prisma.recommendation.findFirst(
          {
            where: {
              organizationId,
              websiteId,
              source: 'CONVERSION',
              type: gap.key,
              title: gap.title,
            },
          },
        );

      const data = {
        description:
          gap.description,
        priority: gap.priority,
        impact: gap.priority,
        effort: 'MEDIUM',
        actionText: `Investigate: ${gap.title}. Work from recorded lead and revenue evidence only.`,
        metadata: {
          source: 'CONVERSION',
          gapKey: gap.key,
          generatedAt:
            new Date().toISOString(),
        },
      };

      const saved = existing
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
              data: {
                organizationId,
                websiteId,
                source: 'CONVERSION',
                type: gap.key,
                title: gap.title,
                ...data,
              },
            },
          );

      persisted.push(saved);
    }

    return persisted;
  }
}

function daysAgo(days: number): string {
  const date = new Date();

  date.setDate(
    date.getDate() - days,
  );

  return date
    .toISOString()
    .slice(0, 10);
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionStatus, UsageMetric } from '@prisma/client';

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async getPlans() {
    return this.prisma.plan.findMany({
      where: {
        active: true,
        public: true,
      },
      orderBy: {
        monthlyPrice: 'asc',
      },
    });
  }

  async getSubscription(organizationId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: {
        organizationId,
      },
      include: {
        plan: true,
        usage: true,
      },
    });

    if (!subscription) {
      return null;
    }

    return subscription;
  }

  async createTrial(organizationId: string) {
    const existing = await this.prisma.subscription.findUnique({
      where: {
        organizationId,
      },
    });

    if (existing) {
      return existing;
    }

    const plan = await this.prisma.plan.findUnique({
      where: {
        code: 'STARTER',
      },
    });

    if (!plan) {
      throw new NotFoundException('STARTER plan not found');
    }

    const now = new Date();

    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + 14);

    return this.prisma.subscription.create({
      data: {
        organizationId,
        planId: plan.id,
        status: SubscriptionStatus.TRIALING,
        trialStart: now,
        trialEnd,
        currentPeriodStart: now,
        currentPeriodEnd: trialEnd,
      },
      include: {
        plan: true,
      },
    });
  }

  async requireActiveSubscription(organizationId: string) {
    const subscription = await this.getSubscription(organizationId);

    if (!subscription) {
      throw new BadRequestException(
        'No active subscription. Please choose a plan.',
      );
    }

    if (
      subscription.status !== SubscriptionStatus.TRIALING &&
      subscription.status !== SubscriptionStatus.ACTIVE
    ) {
      throw new BadRequestException(
        `Subscription is ${subscription.status.toLowerCase()}. Please update your billing plan.`,
      );
    }

    if (
      subscription.status === SubscriptionStatus.TRIALING &&
      subscription.trialEnd &&
      subscription.trialEnd < new Date()
    ) {
      throw new BadRequestException(
        'Your trial has expired. Please choose a plan.',
      );
    }

    if (
      subscription.status === SubscriptionStatus.ACTIVE &&
      subscription.currentPeriodEnd &&
      subscription.currentPeriodEnd < new Date()
    ) {
      throw new BadRequestException(
        'Your subscription period has expired. Please update your billing plan.',
      );
    }

    return subscription;
  }

  async checkUsage(
    organizationId: string,
    metric: UsageMetric,
  ) {
    const subscription =
      await this.requireActiveSubscription(organizationId);

    const limitMap: Record<UsageMetric, number> = {
      WEBSITES: subscription.plan.maxWebsites,
      KEYWORDS: subscription.plan.maxKeywords,
      COMPETITORS: subscription.plan.maxCompetitors,
      AI_PROMPTS: subscription.plan.maxAiPrompts,
      AI_SCANS: subscription.plan.maxAiScans,
      USERS: subscription.plan.maxUsers,
      CLIENTS: subscription.plan.maxClients,
      REPORTS: subscription.plan.maxReports,
      CRAWL_CREDITS: subscription.plan.maxCrawlCredits,
      API_CALLS: subscription.plan.maxApiCalls,
      AI_CREDITS: subscription.plan.maxAiCredits,
    };

    const limit = limitMap[metric];

    if (limit === undefined) {
      throw new BadRequestException(
        `Usage metric ${metric} is not configured for this plan.`,
      );
    }

    const now = new Date();

    const periodStart =
      subscription.currentPeriodStart || subscription.createdAt;

    const periodEnd =
      subscription.currentPeriodEnd ||
      new Date(
        now.getTime() + 30 * 24 * 60 * 60 * 1000,
      );

    const usage = await this.prisma.usageCounter.findUnique({
      where: {
        subscriptionId_metric_periodStart: {
          subscriptionId: subscription.id,
          metric,
          periodStart,
        },
      },
    });

    const used = usage?.used ?? 0;

    return {
      metric,
      used,
      limit,
      remaining: Math.max(0, limit - used),
      allowed: used < limit,
      periodStart,
      periodEnd,
    };
  }

  async consumeUsage(
    organizationId: string,
    metric: UsageMetric,
    amount = 1,
  ) {
    if (amount <= 0) {
      throw new BadRequestException(
        'Usage amount must be greater than zero',
      );
    }

    const subscription =
      await this.requireActiveSubscription(organizationId);

    const limitMap: Record<UsageMetric, number> = {
      WEBSITES: subscription.plan.maxWebsites,
      KEYWORDS: subscription.plan.maxKeywords,
      COMPETITORS: subscription.plan.maxCompetitors,
      AI_PROMPTS: subscription.plan.maxAiPrompts,
      AI_SCANS: subscription.plan.maxAiScans,
      USERS: subscription.plan.maxUsers,
      CLIENTS: subscription.plan.maxClients,
      REPORTS: subscription.plan.maxReports,
      CRAWL_CREDITS: subscription.plan.maxCrawlCredits,
      API_CALLS: subscription.plan.maxApiCalls,
      AI_CREDITS: subscription.plan.maxAiCredits,
    };

    const limit = limitMap[metric];

    if (limit === undefined) {
      throw new BadRequestException(
        `Usage metric ${metric} is not configured for this plan.`,
      );
    }

    const periodStart =
      subscription.currentPeriodStart || subscription.createdAt;

    const periodEnd =
      subscription.currentPeriodEnd ||
      new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      );

    return this.prisma.$transaction(async (tx) => {
      const usage = await tx.usageCounter.findUnique({
        where: {
          subscriptionId_metric_periodStart: {
            subscriptionId: subscription.id,
            metric,
            periodStart,
          },
        },
      });

      const used = usage?.used ?? 0;

      if (used + amount > limit) {
        throw new BadRequestException(
          `${metric} usage limit reached. Upgrade your plan to continue.`,
        );
      }

      if (!usage) {
        return tx.usageCounter.create({
          data: {
            subscriptionId: subscription.id,
            metric,
            periodStart,
            periodEnd,
            used: amount,
          },
        });
      }

      const updated = await tx.usageCounter.updateMany({
        where: {
          id: usage.id,
          used: {
            lte: limit - amount,
          },
        },
        data: {
          used: {
            increment: amount,
          },
          periodEnd,
        },
      });

      if (updated.count !== 1) {
        throw new BadRequestException(
          `${metric} usage limit reached. Upgrade your plan to continue.`,
        );
      }

      return tx.usageCounter.findUnique({
        where: {
          id: usage.id,
        },
      });
    });
  }
}

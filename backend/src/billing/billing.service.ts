import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from './stripe.service';
import {
  COMMERCIAL_PLANS,
  FREE_AI_GENERATIONS_PER_MONTH,
  TRIAL_DAYS,
  TRIAL_PLAN_CODE,
  getCommercialPlan,
} from './plans.config';
import { billingError } from './billing.errors';
import {
  effectiveEntitlementState,
  hasPaidLimits,
  mapRazorpayPaymentStatus,
  mapRazorpayStatus,
} from './billing-state';
import {
  SubscriptionStatus,
  UsageMetric,
} from '@prisma/client';
import Stripe from 'stripe';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly stripeService: StripeService,
  ) {}

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

  /*
   * 14-day Growth trial. Explicit start/end computed
   * server-side. One trial per workspace ever
   * (trialUsed + existing-row guard). No provider
   * subscription is created, so no phantom paid
   * billing can exist.
   */
  async createTrial(organizationId: string) {
    const existing =
      await this.prisma.subscription.findUnique(
        {
          where: {
            organizationId,
          },
        },
      );

    if (existing) {
      const now = new Date();
      const liveTrial =
        existing.status ===
          SubscriptionStatus.TRIALING &&
        existing.trialEnd &&
        existing.trialEnd > now;

      if (liveTrial) {
        return existing;
      }

      throw new ForbiddenException({
        code: 'LIMIT_REACHED',
        message:
          'The free trial was already used for this workspace. Choose a paid plan to continue with Growth limits.',
        planCode: existing.planId,
      });
    }

    const plan =
      await this.prisma.plan.findUnique({
        where: {
          code: TRIAL_PLAN_CODE,
        },
      });

    if (!plan) {
      throw new NotFoundException(
        `${TRIAL_PLAN_CODE} plan not found`,
      );
    }

    const now = new Date();

    const trialEnd = new Date(now);
    trialEnd.setDate(
      trialEnd.getDate() + TRIAL_DAYS,
    );

    return this.prisma.subscription.create({
      data: {
        organizationId,
        planId: plan.id,
        provider: 'NONE',
        status:
          SubscriptionStatus.TRIALING,
        trialUsed: true,
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

  async requireActiveSubscription(
    organizationId: string,
  ) {
    const subscription =
      await this.getSubscription(
        organizationId,
      );

    if (!subscription) {
      throw new BadRequestException(
        'No active subscription. Please choose a plan.',
      );
    }

    const now = new Date();

    if (
      subscription.status ===
        SubscriptionStatus.PENDING ||
      subscription.status ===
        SubscriptionStatus.INCOMPLETE ||
      subscription.status ===
        SubscriptionStatus.INCOMPLETE_EXPIRED
    ) {
      throw new BadRequestException(
        'Payment is not verified yet. Complete checkout to activate paid access.',
      );
    }

    if (
      subscription.status ===
        SubscriptionStatus.TRIALING &&
      subscription.trialEnd &&
      subscription.trialEnd < now
    ) {
      throw new BadRequestException(
        'Your trial has expired. Please choose a plan.',
      );
    }

    if (
      subscription.status ===
        SubscriptionStatus.ACTIVE &&
      subscription.currentPeriodEnd &&
      subscription.currentPeriodEnd <
        now
    ) {
      throw new BadRequestException(
        'Your subscription period has expired. Please update your billing plan.',
      );
    }

    if (
      subscription.status ===
        SubscriptionStatus.PAUSED
    ) {
      throw new BadRequestException(
        'Your subscription is paused. Resume billing to continue metered usage.',
      );
    }

    if (
      subscription.status !==
        SubscriptionStatus.TRIALING &&
      subscription.status !==
        SubscriptionStatus.ACTIVE &&
      subscription.status !==
        SubscriptionStatus.PAST_DUE
    ) {
      throw new BadRequestException(
        `Subscription is ${subscription.status.toLowerCase()}. Please update your billing plan.`,
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

    /*
     * AI_GROWTH_ACTIONS has no Plan column; its
     * limit comes from commercial config (same
     * source as entitlements). The measured
     * monthly Action count in
     * checkActionAllowance stays authoritative.
     */
    const commercial = getCommercialPlan(
      subscription.plan.code,
    );

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
      AI_GROWTH_ACTIONS:
        commercial?.entitlements
          .aiGrowthActionsPerMonth ?? 0,
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

    /*
     * AI_GROWTH_ACTIONS resolves from commercial
     * config (no Plan column). Counter writes for
     * it never happen in practice — the measured
     * checkActionAllowance path gates creation.
     */
    const commercial = getCommercialPlan(
      subscription.plan.code,
    );

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
      AI_GROWTH_ACTIONS:
        commercial?.entitlements
          .aiGrowthActionsPerMonth ?? 0,
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

  // =========================================================
  // STRIPE WEBHOOK (signature-verified, idempotent)
  // =========================================================

  async handleStripeWebhook(
    rawBody: Buffer,
    signature: string,
  ) {
    if (!this.stripeService.providerConfigured()) {
      throw new BadRequestException(
        'Billing provider not connected.',
      );
    }

    const secret = this.config.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );

    if (!secret) {
      throw new BadRequestException(
        'Webhook secret is not configured',
      );
    }

    if (!signature) {
      throw new BadRequestException(
        'Missing webhook signature',
      );
    }

    let event: Stripe.Event;

    try {
      event =
        this.stripeService
          .getClient()
          .webhooks.constructEvent(
            rawBody,
            signature,
            secret,
          );
    } catch {
      throw new BadRequestException(
        'Invalid webhook signature',
      );
    }

    let record;
    try {
      record =
        await this.prisma.billingEvent.create(
          {
            data: {
              eventId: event.id,
              eventType: event.type,
              payload: event as any,
            },
          },
        );
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const existing =
          await this.prisma.billingEvent.findUnique(
            {
              where: {
                eventId: event.id,
              },
            },
          );

        return {
          received: true,
          duplicate: true,
          processed:
            existing?.processed ??
            false,
        };
      }

      throw error;
    }

    try {
      await this.applyStripeEvent(event);

      await this.prisma.billingEvent.update(
        {
          where: { id: record.id },
          data: { processed: true },
        },
      );

      return {
        received: true,
        duplicate: false,
        processed: true,
      };
    } catch (error: any) {
      await this.prisma.billingEvent.update(
        {
          where: { id: record.id },
          data: {
            errorMessage: String(
              error?.message ??
                'Unknown webhook error',
            ).slice(0, 2000),
          },
        },
      );

      throw error;
    }
  }

  private async applyStripeEvent(
    event: Stripe.Event,
  ) {
    const data = event.data
      .object as Record<string, any>;

    const organizationId: string | null =
      data?.metadata?.organizationId ??
      null;

    switch (event.type) {
      case 'checkout.session.completed': {
        if (!organizationId) return;

        const customerId: string | null =
          (typeof data.customer ===
          'string'
            ? data.customer
            : data.customer?.id) ??
          null;
        const subscriptionId: string | null =
          (typeof data.subscription ===
          'string'
            ? data.subscription
            : data.subscription?.id) ??
          null;
        const planCode: string | null =
          data?.metadata?.planCode ??
          null;

        let planId: string | null =
          null;

        if (planCode) {
          const plan =
            await this.prisma.plan.findUnique(
              {
                where: {
                  code: planCode,
                },
                select: { id: true },
              },
            );

          planId = plan?.id ?? null;
        }

        const existing =
          await this.prisma.subscription.findUnique(
            {
              where: { organizationId },
            },
          );

        if (!existing) return;

        await this.prisma.subscription.update(
          {
            where: { organizationId },
            data: {
              ...(planId
                ? { planId }
                : {}),
              status:
                SubscriptionStatus.ACTIVE,
              ...(customerId
                ? {
                    stripeCustomerId:
                      customerId,
                  }
                : {}),
              ...(subscriptionId
                ? {
                    stripeSubscriptionId:
                      subscriptionId,
                  }
                : {}),
              cancelAtPeriodEnd: false,
              canceledAt: null,
              endedAt: null,
            },
          },
        );

        return;
      }

      case 'customer.subscription.updated': {
        const subscription =
          await this.findSubscriptionByStripeId(
            data?.id,
            organizationId,
          );

        if (!subscription) return;

        const status = this.mapStripeStatus(
          data?.status,
        );

        await this.prisma.subscription.update(
          {
            where: {
              id: subscription.id,
            },
            data: {
              status,
              currentPeriodStart:
                data?.current_period_start
                  ? new Date(
                      data.current_period_start *
                        1000,
                    )
                  : undefined,
              currentPeriodEnd:
                data?.current_period_end
                  ? new Date(
                      data.current_period_end *
                        1000,
                    )
                  : undefined,
              cancelAtPeriodEnd:
                data?.cancel_at_period_end ??
                undefined,
            },
          },
        );

        return;
      }

      case 'customer.subscription.deleted': {
        const subscription =
          await this.findSubscriptionByStripeId(
            data?.id,
            organizationId,
          );

        if (!subscription) return;

        await this.prisma.subscription.update(
          {
            where: {
              id: subscription.id,
            },
            data: {
              status:
                SubscriptionStatus.CANCELED,
              cancelAtPeriodEnd: false,
              canceledAt: new Date(),
              endedAt: new Date(),
            },
          },
        );

        return;
      }

      case 'invoice.payment_failed': {
        const subscription =
          await this.findSubscriptionByStripeId(
            data?.subscription,
            organizationId,
          );

        if (!subscription) return;

        await this.prisma.subscription.update(
          {
            where: {
              id: subscription.id,
            },
            data: {
              status:
                SubscriptionStatus.PAST_DUE,
            },
          },
        );

        return;
      }

      case 'invoice.payment_succeeded': {
        const subscription =
          await this.findSubscriptionByStripeId(
            data?.subscription,
            organizationId,
          );

        if (!subscription) return;

        if (
          subscription.status ===
            SubscriptionStatus.PAST_DUE ||
          subscription.status ===
            SubscriptionStatus.INCOMPLETE
        ) {
          await this.prisma.subscription.update(
            {
              where: {
                id: subscription.id,
              },
              data: {
                status:
                  SubscriptionStatus.ACTIVE,
              },
            },
          );
        }

        return;
      }

      default:
        return;
    }
  }

  private async findSubscriptionByStripeId(
    stripeSubscriptionId: unknown,
    organizationId: string | null,
  ) {
    if (
      typeof stripeSubscriptionId ===
        'string' &&
      stripeSubscriptionId
    ) {
      const byStripe =
        await this.prisma.subscription.findFirst(
          {
            where: {
              stripeSubscriptionId,
            },
          },
        );

      if (byStripe) return byStripe;
    }

    if (organizationId) {
      return this.prisma.subscription.findUnique(
        {
          where: { organizationId },
        },
      );
    }

    return null;
  }

  private mapStripeStatus(
    status: unknown,
  ): SubscriptionStatus {
    switch (status) {
      case 'active':
        return SubscriptionStatus.ACTIVE;
      case 'trialing':
        return SubscriptionStatus.TRIALING;
      case 'past_due':
        return SubscriptionStatus.PAST_DUE;
      case 'canceled':
        return SubscriptionStatus.CANCELED;
      case 'incomplete_expired':
        return SubscriptionStatus.INCOMPLETE_EXPIRED;
      case 'unpaid':
        return SubscriptionStatus.UNPAID;
      case 'incomplete':
      default:
        return SubscriptionStatus.INCOMPLETE;
    }
  }

  // =========================================================
  // ENTITLEMENTS (centralized, plan-driven)
  //
  // No subscription  -> FREE defaults (read-safe).
  // Downgrades never delete data: only creation is gated.
  // =========================================================

  /*
   * Free-plan limits mirror the centralized
   * commercial config (FREE row). AI_GROWTH_ACTIONS
   * is measured monthly from Action records.
   */
  private static readonly FREE_LIMITS: Record<
    string,
    number
  > = {
    WEBSITES: 1,
    KEYWORDS: 50,
    COMPETITORS: 1,
    AI_PROMPTS: 10,
    AI_SCANS: 5,
    USERS: 1,
    CLIENTS: 0,
    REPORTS: 3,
    CRAWL_CREDITS: 5,
    API_CALLS: 200,
    AI_CREDITS:
      FREE_AI_GENERATIONS_PER_MONTH,
    AI_GROWTH_ACTIONS: 3,
  };

  private static readonly FEATURE_TIERS: Record<
    string,
    string[]
  > = {
    whiteLabel: ['AGENCY', 'SCALE'],
    scheduledReports: ['AGENCY', 'SCALE'],
    agency: ['AGENCY', 'SCALE'],
    api: ['SCALE'],
    advancedMonitoring: ['PRO', 'AGENCY', 'SCALE'],
  };

  static readonly ENTERPRISE_PLANS = [
    'ENTERPRISE',
  ];

  private planLimits(plan: {
    code: string;
    maxWebsites: number;
    maxKeywords: number;
    maxCompetitors: number;
    maxAiPrompts: number;
    maxAiScans: number;
    maxUsers: number;
    maxClients: number;
    maxReports: number;
    maxCrawlCredits: number;
    maxApiCalls: number;
    maxAiCredits: number;
  }): Record<string, number> {
    const commercial =
      getCommercialPlan(plan.code);

    return {
      WEBSITES: plan.maxWebsites,
      KEYWORDS: plan.maxKeywords,
      COMPETITORS: plan.maxCompetitors,
      AI_PROMPTS: plan.maxAiPrompts,
      AI_SCANS: plan.maxAiScans,
      USERS: plan.maxUsers,
      CLIENTS: plan.maxClients,
      REPORTS: plan.maxReports,
      CRAWL_CREDITS:
        plan.maxCrawlCredits,
      API_CALLS: plan.maxApiCalls,
      AI_CREDITS: plan.maxAiCredits,
      AI_GROWTH_ACTIONS:
        commercial?.entitlements
          .aiGrowthActionsPerMonth ??
        0,
    };
  }

  private freeEntitlements() {
    return {
      planCode: 'FREE',
      planName: 'Free',
      tier: 'FREE',
      status: 'FREE',
      isFree: true,
      customPricing: false,
      provider: null,
      interval: null,
      currency: null,
      trialEnd: null,
      trialDaysLeft: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      limits: {
        ...BillingService.FREE_LIMITS,
      },
      features: {
        whiteLabel: false,
        scheduledReports: false,
        agency: false,
        api: false,
        advancedMonitoring: false,
      },
    };
  }

  /*
   * Effective entitlement state (§25):
   * FREE (no row) -> Free limits.
   * TRIALING (valid) -> Growth limits + countdown.
   * ACTIVE / PAST_DUE (grace) / PAUSED / CANCEL_AT_PERIOD_END -> plan limits.
   * PENDING / CANCELLED / EXPIRED / COMPLETED / INCOMPLETE -> Free limits,
   * informative status. Frontend never decides this.
   */
  async getEntitlements(
    organizationId: string,
  ) {
    const subscription =
      await this.prisma.subscription.findUnique(
        {
          where: { organizationId },
          include: { plan: true },
        },
      );

    if (!subscription) {
      return this.freeEntitlements();
    }

    const effective =
      effectiveEntitlementState({
        status: subscription.status,
        trialEnd:
          subscription.trialEnd,
        currentPeriodEnd:
          subscription.currentPeriodEnd,
        cancelAtPeriodEnd:
          subscription.cancelAtPeriodEnd,
      });

    if (!hasPaidLimits(effective)) {
      const free =
        this.freeEntitlements();

      return {
        ...free,
        status:
          effective === 'FREE' &&
          subscription.status ===
            SubscriptionStatus.TRIALING
            ? 'EXPIRED'
            : subscription.status,
        trialEnd:
          subscription.trialEnd,
        currentPeriodEnd:
          subscription.currentPeriodEnd,
        provider:
          subscription.provider ??
          null,
      };
    }

    const code =
      subscription.plan.code;
    const customPricing =
      BillingService.ENTERPRISE_PLANS.includes(
        code,
      );

    const tiers = BillingService.FEATURE_TIERS;

    const has = (feature: string) =>
      (tiers[feature] ?? []).includes(
        code,
      );

    const now = new Date();
    const trialDaysLeft =
      effective === 'TRIALING' &&
      subscription.trialEnd
        ? Math.max(
            0,
            Math.ceil(
              (subscription.trialEnd.getTime() -
                now.getTime()) /
                86400000,
            ),
          )
        : null;

    return {
      planCode: code,
      planName:
        subscription.plan.name,
      tier: code,
      status: effective,
      isFree: false,
      customPricing,
      provider:
        subscription.provider ??
        'STRIPE',
      interval:
        subscription.interval ??
        null,
      currency:
        subscription.currency ??
        null,
      trialEnd:
        subscription.trialEnd,
      trialDaysLeft,
      currentPeriodEnd:
        subscription.currentPeriodEnd,
      cancelAtPeriodEnd:
        subscription.cancelAtPeriodEnd,
      limits: this.planLimits(
        subscription.plan,
      ),
      features: {
        whiteLabel: has('whiteLabel'),
        scheduledReports: has(
          'scheduledReports',
        ),
        agency: has('agency'),
        api: has('api'),
        advancedMonitoring: has(
          'advancedMonitoring',
        ),
      },
    };
  }

  async checkFeature(
    organizationId: string,
    feature: string,
  ) {
    const entitlements =
      await this.getEntitlements(
        organizationId,
      );

    const allowed =
      Boolean(
        (entitlements.features as Record<
          string,
          boolean
        >)[feature],
      );

    return {
      feature,
      allowed,
      planCode:
        entitlements.planCode,
      requiredPlans: allowed
        ? []
        : (BillingService.FEATURE_TIERS[
            feature
          ] ?? []),
    };
  }

  // =========================================================
  // USAGE SUMMARY (measured counts + real counters)
  // =========================================================

  async getUsageSummary(
    organizationId: string,
  ) {
    const entitlements =
      await this.getEntitlements(
        organizationId,
      );
    const limits = entitlements.limits;

    const subscription =
      await this.prisma.subscription.findUnique(
        {
          where: { organizationId },
          select: {
            id: true,
            currentPeriodStart: true,
            createdAt: true,
          },
        },
      );

    const websiteIds = (
      await this.prisma.website.findMany({
        where: { organizationId },
        select: { id: true },
      })
    ).map((site) => site.id);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [
      websites,
      clients,
      users,
      competitors,
      aiPrompts,
      reports,
      crawlCredits,
      aiScans,
      aiGrowthActions,
    ] = await Promise.all([
      this.prisma.website.count({
        where: { organizationId },
      }),
      this.prisma.client
        .count({
          where: { organizationId },
        })
        .catch(() => 0),
      this.prisma.organizationMember.count(
        {
          where: { organizationId },
        },
      ),
      websiteIds.length > 0
        ? this.prisma.competitor.count({
            where: {
              websiteId: {
                in: websiteIds,
              },
            },
          })
        : 0,
      websiteIds.length > 0
        ? this.prisma.aiVisibilityQuery.count(
            {
              where: {
                websiteId: {
                  in: websiteIds,
                },
              },
            },
          )
        : 0,
      this.prisma.report
        .count({
          where: { organizationId },
        })
        .catch(() => 0),
      this.counterUsed(
        subscription?.id ?? null,
        'CRAWL_CREDITS',
      ),
      this.counterUsed(
        subscription?.id ?? null,
        'AI_SCANS',
      ),
      websiteIds.length > 0
        ? this.prisma.action.count({
            where: {
              websiteId: {
                in: websiteIds,
              },
              createdAt: {
                gte: monthStart,
              },
            },
          })
        : 0,
    ]);

    const measured: Record<
      string,
      number | null
    > = {
      WEBSITES: websites,
      CLIENTS: clients,
      USERS: users,
      COMPETITORS: competitors,
      AI_PROMPTS: aiPrompts,
      REPORTS: reports,
      CRAWL_CREDITS: crawlCredits,
      AI_SCANS: aiScans,
      AI_GROWTH_ACTIONS: aiGrowthActions,
      KEYWORDS: null,
      API_CALLS: null,
      AI_CREDITS: null,
    };

    const usage: Record<
      string,
      {
        used: number | null;
        limit: number;
        remaining: number | null;
        measurable: boolean;
      }
    > = {};

    for (const [metric, limit] of Object.entries(
      limits,
    )) {
      const used =
        measured[metric] ?? null;

      usage[metric] = {
        used,
        limit,
        remaining:
          used === null
            ? null
            : Math.max(0, limit - used),
        measurable: used !== null,
      };
    }

    return {
      planCode:
        entitlements.planCode,
      status:
        entitlements.status,
      periodStart:
        subscription?.currentPeriodStart ??
        subscription?.createdAt ??
        null,
      usage,
    };
  }

  private async counterUsed(
    subscriptionId: string | null,
    metric: UsageMetric,
  ): Promise<number> {
    if (!subscriptionId) {
      return 0;
    }

    const counters =
      await this.prisma.usageCounter.findMany(
        {
          where: {
            subscriptionId,
            metric,
          },
          select: { used: true },
        },
      );

    return counters.reduce(
      (sum, item) =>
        sum + (item.used ?? 0),
      0,
    );
  }

  // =========================================================
  // METERED CRAWL ALLOWANCE (subscription or FREE)
  //
  // Subscribed workspaces consume real usage counters.
  // Workspaces without a subscription are measured
  // against completed crawl records in the current
  // calendar month — no counter rows are fabricated.
  // =========================================================

  async checkCrawlAllowance(
    organizationId: string,
  ) {
    const subscription =
      await this.prisma.subscription.findUnique(
        {
          where: { organizationId },
          include: { plan: true },
        },
      );

    if (subscription) {
      return this.checkUsage(
        organizationId,
        'CRAWL_CREDITS',
      );
    }

    const limit =
      BillingService.FREE_LIMITS
        .CRAWL_CREDITS;

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const websiteIds = (
      await this.prisma.website.findMany(
        {
          where: { organizationId },
          select: { id: true },
        },
      )
    ).map((site) => site.id);

    const used =
      websiteIds.length > 0
        ? await this.prisma.crawl.count({
            where: {
              websiteId: {
                in: websiteIds,
              },
              createdAt: {
                gte: monthStart,
              },
            },
          })
        : 0;

    if (used >= limit) {
      throw new ForbiddenException({
        code: 'LIMIT_REACHED',
        message: `Monthly crawl allowance reached on the Free plan (${used}/${limit}). Start a trial or upgrade to continue. Existing data is untouched.`,
        metric: 'CRAWL_CREDITS',
        used,
        limit,
        planCode: 'FREE',
      });
    }

    return {
      metric: 'CRAWL_CREDITS',
      used,
      limit,
      remaining: limit - used,
      allowed: true,
      planCode: 'FREE',
    };
  }

  // =========================================================
  // CREATION GATE (downgrade-safe: reads never blocked)
  // =========================================================

  async enforceCreation(
    organizationId: string,
    metric: UsageMetric,
    currentCount: number,
  ) {
    const entitlements =
      await this.getEntitlements(
        organizationId,
      );
    const limit =
      entitlements.limits[metric];

    if (
      limit === undefined ||
      currentCount < limit
    ) {
      return {
        allowed: true,
        metric,
        used: currentCount,
        limit: limit ?? -1,
      };
    }

    throw new ForbiddenException({
      code: 'LIMIT_REACHED',
      message: `${metric} limit reached on the ${entitlements.planName} plan (${currentCount}/${limit}). Upgrade to create more. Existing data is untouched.`,
      metric,
      used: currentCount,
      limit,
      planCode:
        entitlements.planCode,
    });
  }

  // =========================================================
  // AI GROWTH ACTION ALLOWANCE (measured monthly)
  //
  // Actions created this calendar month across the
  // workspace websites count against the plan
  // limit. Downgrade-safe: reads never blocked,
  // creation gated with an upgrade path.
  // =========================================================

  async checkActionAllowance(
    organizationId: string,
  ) {
    const entitlements =
      await this.getEntitlements(
        organizationId,
      );
    const limit =
      entitlements.limits[
        'AI_GROWTH_ACTIONS'
      ] ?? 0;

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const websiteIds = (
      await this.prisma.website.findMany({
        where: { organizationId },
        select: { id: true },
      })
    ).map((site) => site.id);

    const used =
      websiteIds.length > 0
        ? await this.prisma.action.count({
            where: {
              websiteId: {
                in: websiteIds,
              },
              createdAt: {
                gte: monthStart,
              },
            },
          })
        : 0;

    if (used >= limit) {
      throw new ForbiddenException({
        code: 'LIMIT_REACHED',
        message: `Monthly AI Growth Action allowance reached on the ${entitlements.planName} plan (${used}/${limit}). Upgrade or wait for the next cycle. Existing actions are untouched.`,
        metric: 'AI_GROWTH_ACTIONS',
        used,
        limit,
        planCode:
          entitlements.planCode,
      });
    }

    return {
      metric: 'AI_GROWTH_ACTIONS',
      used,
      limit,
      remaining: limit - used,
      allowed: true,
      planCode:
        entitlements.planCode,
    };
  }

  // =========================================================
  // PLAN SYNC (central config -> DB rows, additive)
  //
  // Upserts commercial plans only. Legacy rows (PRO
  // and anything else) are never touched.
  // =========================================================

  async syncPlansFromConfig() {
    const results: Array<{
      code: string;
      created: boolean;
      monthlyPrice: number;
      yearlyPrice: number;
      currency: string;
    }> = [];

    for (const commercial of COMMERCIAL_PLANS) {
      if (commercial.code === 'FREE') {
        continue;
      }

      const entitlements =
        commercial.entitlements;

      const existing =
        await this.prisma.plan.findUnique({
          where: {
            code: commercial.code,
          },
        });

      const data = {
        name: commercial.code
          .charAt(0)
          .toUpperCase() +
          commercial.code
            .slice(1)
            .toLowerCase(),
        description:
          commercial.description,
        monthlyPrice:
          commercial.inr.monthly,
        yearlyPrice:
          commercial.inr.yearlyTotal,
        currency: 'INR',
        active: true,
        public: true,
        maxWebsites:
          entitlements.websites,
        maxKeywords:
          entitlements.keywords,
        maxCompetitors:
          entitlements.competitors,
        maxAiPrompts:
          entitlements.aiPrompts,
        maxAiScans:
          entitlements.aiScans,
        maxUsers:
          entitlements.teamMembers,
        maxClients:
          entitlements.clients,
        maxReports:
          entitlements.reportsPerMonth,
        maxCrawlCredits:
          entitlements.crawlCredits,
        maxApiCalls:
          entitlements.apiCalls,
        ...(entitlements.aiGenerationsPerMonth !=
        null
          ? {
              maxAiCredits:
                entitlements.aiGenerationsPerMonth,
            }
          : {}),
      };

      const row = existing
        ? await this.prisma.plan.update(
            {
              where: {
                code: commercial.code,
              },
              data,
            },
          )
        : await this.prisma.plan.create({
            data: {
              code: commercial.code,
              ...data,
            },
          });

      results.push({
        code: row.code,
        created: !existing,
        monthlyPrice:
          row.monthlyPrice,
        yearlyPrice:
          row.yearlyPrice,
        currency: row.currency,
      });
    }

    return {
      synced: results.length,
      plans: results,
    };
  }

  // =========================================================
  // SUBSCRIPTION LIFECYCLE (local-first, Stripe best-effort)
  // =========================================================

  async cancelSubscription(
    organizationId: string,
  ) {
    const subscription =
      await this.prisma.subscription.findUnique(
        {
          where: { organizationId },
        },
      );

    if (!subscription) {
      throw new NotFoundException(
        'No subscription found',
      );
    }

    /*
     * Razorpay rows route through the dedicated
     * Razorpay cancel endpoint (cycle-end
     * semantics); legacy rows keep behavior.
     */
    if (
      subscription.provider ===
        'RAZORPAY' &&
      subscription.razorpaySubscriptionId
    ) {
      throw new BadRequestException(
        'Use the Razorpay cancel endpoint for Razorpay subscriptions.',
      );
    }

    if (
      subscription.stripeSubscriptionId &&
      this.stripeService.providerConfigured()
    ) {
      try {
        await this.stripeService
          .getClient()
          .subscriptions.update(
            subscription.stripeSubscriptionId,
            {
              cancel_at_period_end:
                true,
            },
          );
      } catch {
        // Local state remains the source of truth;
        // Stripe sync is retried via webhook events.
      }
    }

    return this.prisma.subscription.update(
      {
        where: { organizationId },
        data: {
          cancelAtPeriodEnd: true,
        },
        include: { plan: true },
      },
    );
  }

  async listInvoices(
    organizationId: string,
  ) {
    /*
     * Local Razorpay payment records first
     * (provider references, never fabricated
     * PDFs), then live Stripe invoices where a
     * Stripe customer exists.
     */
    const local =
      await this.prisma.payment.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

    const merged: Array<{
      id: string;
      amount: number;
      currency: string;
      status: string;
      created: string;
      url: string | null;
      provider: string;
    }> = local.map((payment) => ({
      id: payment.providerPaymentId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      created:
        payment.createdAt.toISOString(),
      url: null,
      provider: payment.provider,
    }));

    if (
      this.stripeService.providerConfigured()
    ) {
      try {
        const stripe =
          await this.stripeService.listInvoices(
            organizationId,
          );

        for (const invoice of stripe.invoices ??
          []) {
          merged.push({
            ...invoice,
            provider: 'STRIPE',
          });
        }

        return {
          provider: true,
          invoices: merged.slice(0, 50),
        };
      } catch {
        // Fall through to local-only history.
      }
    }

    if (merged.length > 0) {
      return {
        provider: true,
        invoices: merged,
      };
    }

    return {
      provider: false,
      invoices: [],
      reason:
        'Billing provider not connected, so no payment history exists.',
    };
  }

  /*
   * Safe billing history from webhook events:
   * type + processing state only, never
   * sensitive payment details.
   */
  async getBillingHistory(
    organizationId: string,
  ) {
    const events =
      await this.prisma.billingEvent.findMany(
        {
          where: { organizationId },
          select: {
            id: true,
            provider: true,
            eventId: true,
            eventType: true,
            processed: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 50,
        },
      );

    return {
      total: events.length,
      events,
    };
  }

  async billingPortal(
    organizationId: string,
  ) {
    if (
      !this.stripeService.providerConfigured()
    ) {
      throw new BadRequestException({
        code: 'PROVIDER_NOT_CONFIGURED',
        message:
          'Customer billing portal is not configured for this workspace yet.',
      });
    }

    return this.stripeService.createBillingPortal(
      organizationId,
    );
  }

  providerStatus() {
    return {
      provider:
        this.stripeService.providerConfigured(),
      stripeConfigured:
        this.stripeService.providerConfigured(),
    };
  }

  // =========================================================
  // RAZORPAY WEBHOOK (signature + idempotency + state)
  //
  // Only events RENKOO handles are applied; anything
  // else is recorded and ignored. Out-of-order
  // delivery never regresses a live subscription.
  // =========================================================

  private razorpaySecret(): string | null {
    return (
      process.env.RAZORPAY_WEBHOOK_SECRET?.trim() ||
      null
    );
  }

  async handleRazorpayWebhook(
    rawBody: Buffer,
    signature: string,
    eventIdHeader?: string,
  ) {
    const secret = this.razorpaySecret();

    if (!secret) {
      throw billingError(
        'BILLING_PROVIDER_NOT_CONFIGURED',
        'Razorpay webhook secret is not configured.',
      );
    }

    if (!signature) {
      throw billingError(
        'WEBHOOK_SIGNATURE_INVALID',
        'Missing webhook signature.',
      );
    }

    const {
      createHmac,
      timingSafeEqual,
    } = await import('crypto');

    const expected = createHmac(
      'sha256',
      secret,
    )
      .update(rawBody)
      .digest('hex');

    let valid = false;

    try {
      valid = timingSafeEqual(
        Buffer.from(expected, 'utf8'),
        Buffer.from(signature, 'utf8'),
      );
    } catch {
      valid = false;
    }

    if (!valid) {
      throw billingError(
        'WEBHOOK_SIGNATURE_INVALID',
        'Webhook signature verification failed.',
      );
    }

    let body: any;

    try {
      body = JSON.parse(
        rawBody.toString('utf8'),
      );
    } catch {
      throw billingError(
        'WEBHOOK_SIGNATURE_INVALID',
        'Webhook payload is not valid JSON.',
      );
    }

    const event: string = String(
      body?.event ?? '',
    );
    const entity = body?.payload ?? {};
    const entityId: string =
      String(
        entity?.subscription?.entity?.id ??
          entity?.payment?.entity?.id ??
          entity?.refund?.entity?.id ??
          '',
      );
    const createdAt: number = Number(
      body?.created_at ?? 0,
    );

    const eventId =
      eventIdHeader?.trim() ||
      `${event}:${entityId}:${createdAt}`;

    let organizationId: string | null =
      null;

    const existing =
      await this.prisma.billingEvent.findUnique(
        {
          where: { eventId },
        },
      );

    if (existing) {
      throw billingError(
        'WEBHOOK_ALREADY_PROCESSED',
        'Duplicate webhook event ignored.',
        {
          eventId,
          processed: existing.processed,
        },
      );
    }

    const record =
      await this.prisma.billingEvent
        .create({
          data: {
            organizationId: null,
            provider: 'RAZORPAY',
            eventId,
            eventType: event,
            processed: false,
            payload: {
              event,
              entityId,
              createdAt,
            } as any,
          },
        })
        /*
         * Concurrent retries can both pass the
         * findUnique guard above; the unique
         * constraint is the real arbiter. A lost
         * race is a duplicate, not a failure —
         * same contract as the Stripe handler.
         */
        .catch(async (error: any) => {
          if (error?.code !== 'P2002') {
            throw error;
          }

          const raced =
            await this.prisma.billingEvent.findUnique(
              {
                where: { eventId },
              },
            );

          throw billingError(
            'WEBHOOK_ALREADY_PROCESSED',
            'Duplicate webhook event ignored.',
            {
              eventId,
              processed:
                raced?.processed ??
                false,
            },
          );
        });

    try {
      organizationId =
        await this.applyRazorpayEvent(
          event,
          entity,
        );

      await this.prisma.billingEvent.update(
        {
          where: { id: record.id },
          data: {
            organizationId,
            processed: true,
          },
        },
      );

      return {
        received: true,
        duplicate: false,
        processed: true,
        event,
      };
    } catch (error: any) {
      await this.prisma.billingEvent.update(
        {
          where: { id: record.id },
          data: {
            organizationId,
            errorMessage: String(
              error?.message ??
                'unknown',
            ).slice(0, 2000),
          },
        },
      );

      throw error;
    }
  }

  private async applyRazorpayEvent(
    event: string,
    entity: any,
  ): Promise<string | null> {
    const subscriptionEntity =
      entity?.subscription?.entity ?? null;
    const paymentEntity =
      entity?.payment?.entity ?? null;
    const refundEntity =
      entity?.refund?.entity ?? null;

    const findOrgBySubscription = async (
      providerSubscriptionId: string,
    ) => {
      const row =
        await this.prisma.subscription.findUnique(
          {
            where: {
              razorpaySubscriptionId:
                providerSubscriptionId,
            },
            select: { organizationId: true },
          },
        );

      return row?.organizationId ?? null;
    };

    switch (event) {
      case 'subscription.authenticated':
      case 'subscription.activated':
      case 'subscription.charged':
      case 'subscription.pending':
      case 'subscription.halted':
      case 'subscription.paused':
      case 'subscription.resumed':
      case 'subscription.updated':
      case 'subscription.cancelled':
      case 'subscription.completed':
      case 'subscription.expired': {
        if (!subscriptionEntity?.id) {
          return null;
        }

        const organizationId =
          await findOrgBySubscription(
            String(subscriptionEntity.id),
          );

        if (!organizationId) {
          return null;
        }

        const periods = {
          customerId:
            subscriptionEntity.customer_id ??
            null,
          currentStart:
            subscriptionEntity.current_start !=
            null
              ? Number(
                  subscriptionEntity.current_start,
                )
              : null,
          currentEnd:
            subscriptionEntity.current_end !=
            null
              ? Number(
                  subscriptionEntity.current_end,
                )
              : null,
        };

        const state = mapRazorpayStatus(
          String(
            subscriptionEntity.status ??
              'created',
          ),
        );

        const data: Record<string, unknown> =
          {};

        if (state === 'ACTIVE') {
          data.status = 'ACTIVE';
          data.cancelAtPeriodEnd = false;
          data.canceledAt = null;
          data.endedAt = null;
        } else if (state === 'PENDING') {
          const current =
            await this.prisma.subscription.findUnique(
              {
                where: { organizationId },
                select: {
                  status: true,
                },
              },
            );

          if (
            current?.status !== 'ACTIVE'
          ) {
            data.status = 'PENDING';
          }
        } else if (state === 'PAST_DUE') {
          data.status = 'PAST_DUE';
        } else if (state === 'PAUSED') {
          data.status = 'PAUSED';
        } else if (
          state === 'CANCELLED'
        ) {
          data.status = 'CANCELED';
          data.canceledAt = new Date();
          data.endedAt = new Date();
          data.cancelAtPeriodEnd = false;
        } else if (
          state === 'COMPLETED' ||
          state === 'EXPIRED'
        ) {
          data.status = state;
          data.endedAt = new Date();
        }

        if (periods.customerId) {
          data.razorpayCustomerId =
            periods.customerId;
        }

        if (periods.currentStart != null) {
          data.currentPeriodStart =
            new Date(
              periods.currentStart *
                1000,
            );
        }

        if (periods.currentEnd != null) {
          data.currentPeriodEnd =
            new Date(
              periods.currentEnd * 1000,
            );
        }

        if (
          Object.keys(data).length > 0
        ) {
          await this.prisma.subscription.update(
            {
              where: { organizationId },
              data: data as any,
            },
          );
        }

        return organizationId;
      }

      case 'payment.authorized':
      case 'payment.captured': {
        if (!paymentEntity?.id) {
          return null;
        }

        const providerSubscriptionId =
          paymentEntity.subscription_id
            ? String(
                paymentEntity.subscription_id,
              )
            : null;

        const organizationId =
          providerSubscriptionId
            ? await findOrgBySubscription(
                providerSubscriptionId,
              )
            : null;

        if (!organizationId) {
          return null;
        }

        const subscription =
          await this.prisma.subscription.findUnique(
            {
              where: { organizationId },
              select: { id: true },
            },
          );

        const status =
          mapRazorpayPaymentStatus(
            String(
              paymentEntity.status ??
                'created',
            ),
          );

        await this.prisma.payment.upsert({
          where: {
            providerPaymentId: String(
              paymentEntity.id,
            ),
          },
          create: {
            organizationId,
            subscriptionId:
              subscription?.id ?? null,
            provider: 'RAZORPAY',
            providerPaymentId: String(
              paymentEntity.id,
            ),
            providerSubscriptionId,
            providerOrderId:
              paymentEntity.order_id
                ? String(
                    paymentEntity.order_id,
                  )
                : null,
            amount:
              Number(
                paymentEntity.amount ??
                  0,
              ) / 100,
            currency: String(
              paymentEntity.currency ??
                'INR',
            ).toUpperCase(),
            status,
            method:
              paymentEntity.method ??
              null,
            email:
              paymentEntity.email ??
              null,
            contact:
              paymentEntity.contact ??
              null,
            payload: {} as any,
          },
          update: {
            status,
            method:
              paymentEntity.method ??
              null,
          },
        });

        if (
          status === 'CAPTURED' &&
          providerSubscriptionId
        ) {
          const current =
            await this.prisma.subscription.findUnique(
              {
                where: { organizationId },
                select: {
                  status: true,
                },
              },
            );

          if (
            current?.status ===
            'PENDING'
          ) {
            await this.prisma.subscription.update(
              {
                where: { organizationId },
                data: {
                  status: 'ACTIVE',
                  cancelAtPeriodEnd:
                    false,
                  canceledAt: null,
                  endedAt: null,
                },
              },
            );
          }
        }

        return organizationId;
      }

      case 'payment.failed': {
        if (!paymentEntity?.id) {
          return null;
        }

        const providerSubscriptionId =
          paymentEntity.subscription_id
            ? String(
                paymentEntity.subscription_id,
              )
            : null;

        const organizationId =
          providerSubscriptionId
            ? await findOrgBySubscription(
                providerSubscriptionId,
              )
            : null;

        if (!organizationId) {
          return null;
        }

        await this.prisma.payment.upsert({
          where: {
            providerPaymentId: String(
              paymentEntity.id,
            ),
          },
          create: {
            organizationId,
            provider: 'RAZORPAY',
            providerPaymentId: String(
              paymentEntity.id,
            ),
            providerSubscriptionId,
            amount:
              Number(
                paymentEntity.amount ??
                  0,
              ) / 100,
            currency: String(
              paymentEntity.currency ??
                'INR',
            ).toUpperCase(),
            status: 'FAILED',
            payload: {} as any,
          },
          update: { status: 'FAILED' },
        });

        return organizationId;
      }

      case 'refund.created':
      case 'refund.processed':
      case 'refund.failed': {
        if (!refundEntity?.id) {
          return null;
        }

        const paymentId = refundEntity.payment_id
          ? String(
              refundEntity.payment_id,
            )
          : null;

        if (!paymentId) {
          return null;
        }

        const payment =
          await this.prisma.payment.findUnique(
            {
              where: {
                providerPaymentId:
                  paymentId,
              },
              select: {
                organizationId: true,
              },
            },
          );

        if (!payment) {
          return null;
        }

        await this.prisma.payment.update({
          where: {
            providerPaymentId: paymentId,
          },
          data: {
            refundId: String(
              refundEntity.id,
            ),
            status:
              event === 'refund.failed'
                ? undefined
                : 'REFUNDED',
          },
        });

        return payment.organizationId;
      }

      default:
        return null;
    }
  }
}

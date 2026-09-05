import {
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  getCommercialPlan,
  planRank,
  priceFor,
  type BillingInterval,
  type PlanCurrency,
} from './plans.config';
import { billingError } from './billing.errors';
import {
  effectiveEntitlementState,
  mapRazorpayStatus,
} from './billing-state';
import { RazorpayPaymentProvider } from './providers/razorpay.provider';

const REUSE_WINDOW_MS = 30 * 60 * 1000;

@Injectable()
export class RazorpayService {
  private readonly logger = new Logger(
    RazorpayService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: RazorpayPaymentProvider,
  ) {}

  private requireConfigured(): void {
    if (!this.provider.isConfigured()) {
      throw billingError(
        'BILLING_PROVIDER_NOT_CONFIGURED',
        'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the backend.',
      );
    }
  }

  private resolvePrice(
    planCode: string,
    interval: BillingInterval,
    currency: PlanCurrency,
  ): number {
    if (
      !['MONTHLY', 'YEARLY'].includes(
        interval,
      )
    ) {
      throw billingError(
        'PLAN_NOT_AVAILABLE',
        'Billing interval must be MONTHLY or YEARLY.',
      );
    }

    if (
      currency !== 'INR' &&
      currency !== 'USD'
    ) {
      throw billingError(
        'CURRENCY_NOT_SUPPORTED',
        'Currency must be INR or USD.',
      );
    }

    if (planCode === 'FREE') {
      throw billingError(
        'PLAN_NOT_AVAILABLE',
        'The Free plan needs no checkout.',
      );
    }

    const plan = getCommercialPlan(planCode);

    if (!plan) {
      throw billingError(
        'PLAN_NOT_AVAILABLE',
        `Unknown plan: ${planCode}.`,
      );
    }

    if (
      currency === 'USD' &&
      this.provider.internationalCards() !==
        'AVAILABLE'
    ) {
      throw billingError(
        'CURRENCY_NOT_SUPPORTED',
        'USD checkout is unavailable until Razorpay confirms international-cards activation.',
        {
          internationalCards:
            this.provider.internationalCards(),
        },
      );
    }

    const amount = priceFor(
      planCode,
      interval,
      currency,
    );

    if (amount == null || amount <= 0) {
      throw billingError(
        'PLAN_NOT_AVAILABLE',
        'No price is configured for this plan, interval and currency.',
      );
    }

    return amount;
  }

  private async ensureProviderPlan(
    planCode: string,
    interval: BillingInterval,
    currency: PlanCurrency,
  ): Promise<string> {
    const plan = getCommercialPlan(planCode)!;
    const amount = this.resolvePrice(
      planCode,
      interval,
      currency,
    );

    const existing =
      await this.prisma.providerPlan.findUnique(
        {
          where: {
            provider_planCode_interval_currency:
              {
                provider: 'RAZORPAY',
                planCode,
                interval,
                currency,
              },
          },
        },
      );

    const ref =
      await this.provider.ensurePlan({
        planCode,
        interval,
        currency,
        amount,
        name: `RENKOO ${plan.name}`,
        description: plan.description,
      });

    if (
      existing?.providerPlanId ===
      ref.providerPlanId
    ) {
      return ref.providerPlanId;
    }

    await this.prisma.providerPlan.upsert({
      where: {
        provider_planCode_interval_currency:
          {
            provider: 'RAZORPAY',
            planCode,
            interval,
            currency,
          },
      },
      create: {
        provider: 'RAZORPAY',
        planCode,
        interval,
        currency,
        providerPlanId:
          ref.providerPlanId,
        amount: ref.amount,
      },
      update: {
        providerPlanId:
          ref.providerPlanId,
        amount: ref.amount,
        active: true,
      },
    });

    return ref.providerPlanId;
  }

  private blockingSubscriptionState(
    status: string,
  ): boolean {
    const effective =
      effectiveEntitlementState({
        status,
      });

    return (
      effective === 'ACTIVE' ||
      effective === 'TRIALING' ||
      effective === 'PENDING' ||
      effective === 'PAST_DUE' ||
      effective === 'PAUSED' ||
      effective === 'CANCEL_AT_PERIOD_END'
    );
  }

  async createSubscription(
    organizationId: string,
    user: {
      email?: string | null;
    },
    input: {
      planCode: string;
      interval: BillingInterval;
      currency: PlanCurrency;
    },
  ) {
    this.requireConfigured();

    const planCode = String(
      input.planCode ?? '',
    )
      .trim()
      .toUpperCase();
    const interval = String(
      input.interval ?? '',
    )
      .trim()
      .toUpperCase() as BillingInterval;
    const currency = String(
      input.currency ?? '',
    )
      .trim()
      .toUpperCase() as PlanCurrency;

    const amount = this.resolvePrice(
      planCode,
      interval,
      currency,
    );

    const plan =
      await this.prisma.plan.findUnique({
        where: { code: planCode },
      });

    if (!plan || !plan.active) {
      throw billingError(
        'PLAN_NOT_AVAILABLE',
        `Plan ${planCode} is not available.`,
      );
    }

    const existing =
      await this.prisma.subscription.findUnique(
        {
          where: { organizationId },
        },
      );

    if (
      existing &&
      this.blockingSubscriptionState(
        existing.status,
      )
    ) {
      /*
       * Idempotent reuse: a PENDING subscription
       * for the same plan/interval/currency
       * created recently returns its checkout
       * payload instead of a duplicate.
       */
      const sameTarget =
        existing.provider ===
          'RAZORPAY' &&
        existing.planId ===
          plan.id &&
        existing.interval ===
          interval &&
        existing.currency ===
          currency &&
        existing.razorpaySubscriptionId;

      if (
        sameTarget &&
        existing.status ===
          'PENDING' &&
        Date.now() -
          existing.updatedAt.getTime() <
          REUSE_WINDOW_MS
      ) {
        return this.checkoutPayload(
          existing.razorpaySubscriptionId!,
          amount,
          currency,
          planCode,
          interval,
          true,
        );
      }

      throw billingError(
        'SUBSCRIPTION_ALREADY_ACTIVE',
        'This workspace already has an active billing state. Cancel or wait for expiry before starting a new subscription.',
        { status: existing.status },
      );
    }

    const providerPlanId =
      await this.ensureProviderPlan(
        planCode,
        interval,
        currency,
      );

    const created =
      await this.provider.createSubscription(
        {
          providerPlanId,
          customerEmail:
            user.email ?? null,
          notes: {
            renkoo_org: organizationId,
            renkoo_plan: planCode,
          },
        },
      );

    const row = existing
      ? await this.prisma.subscription.update(
          {
            where: { organizationId },
            data: {
              planId: plan.id,
              provider: 'RAZORPAY',
              status: 'PENDING',
              razorpaySubscriptionId:
                created.id,
              razorpayCustomerId:
                created.customerId ??
                null,
              providerPlanId,
              interval,
              currency,
              cancelAtPeriodEnd: false,
              canceledAt: null,
              endedAt: null,
            },
          },
        )
      : await this.prisma.subscription.create(
          {
            data: {
              organizationId,
              planId: plan.id,
              provider: 'RAZORPAY',
              status: 'PENDING',
              razorpaySubscriptionId:
                created.id,
              razorpayCustomerId:
                created.customerId ??
                null,
              providerPlanId,
              interval,
              currency,
            },
          },
        );

    void row;

    return this.checkoutPayload(
      created.id,
      amount,
      currency,
      planCode,
      interval,
      false,
    );
  }

  private checkoutPayload(
    subscriptionId: string,
    amount: number,
    currency: PlanCurrency,
    planCode: string,
    interval: BillingInterval,
    reused: boolean,
  ) {
    const keyId =
      process.env.RAZORPAY_KEY_ID?.trim() ??
      '';

    return {
      provider: 'RAZORPAY',
      mode: this.provider.mode(),
      subscriptionId,
      keyId,
      amount,
      currency,
      planCode,
      interval,
      reused,
    };
  }

  async verifyCheckout(
    organizationId: string,
    input: {
      subscription_id: string;
      payment_id: string;
      signature: string;
    },
  ) {
    this.requireConfigured();

    const subscriptionId = String(
      input.subscription_id ?? '',
    ).trim();
    const paymentId = String(
      input.payment_id ?? '',
    ).trim();
    const signature = String(
      input.signature ?? '',
    ).trim();

    if (
      !subscriptionId ||
      !paymentId ||
      !signature
    ) {
      throw billingError(
        'PAYMENT_VERIFICATION_FAILED',
        'Subscription, payment and signature are all required.',
      );
    }

    const row =
      await this.prisma.subscription.findUnique(
        {
          where: { organizationId },
          include: { plan: true },
        },
      );

    if (
      !row ||
      row.provider !== 'RAZORPAY' ||
      row.razorpaySubscriptionId !==
        subscriptionId
    ) {
      throw billingError(
        'PAYMENT_VERIFICATION_FAILED',
        'No matching pending Razorpay subscription for this workspace.',
      );
    }

    const valid =
      this.provider.verifyCheckoutSignature(
        {
          subscriptionId,
          paymentId,
          signature,
        },
      );

    if (!valid) {
      throw billingError(
        'PAYMENT_VERIFICATION_FAILED',
        'Checkout signature verification failed.',
      );
    }

    /*
     * Signature proves origin; provider state
     * proves money. Both are required.
     */
    const [live, payment] =
      await Promise.all([
        this.provider.fetchSubscription(
          subscriptionId,
        ),
        this.provider.fetchPayment(
          paymentId,
        ),
      ]);

    const paymentState = String(
      payment.status,
    ).toLowerCase();

    if (
      paymentState !== 'captured' &&
      paymentState !== 'authorized'
    ) {
      await this.prisma.payment.upsert({
        where: {
          providerPaymentId: payment.id,
        },
        create: {
          organizationId,
          subscriptionId: row.id,
          provider: 'RAZORPAY',
          providerPaymentId:
            payment.id,
          providerSubscriptionId:
            subscriptionId,
          amount: payment.amount,
          currency:
            payment.currency || 'INR',
          status: 'FAILED',
          payload: {} as any,
        },
        update: { status: 'FAILED' },
      });

      throw billingError(
        'PAYMENT_FAILED',
        `Payment is ${payment.status}; access was not granted.`,
      );
    }

    await this.prisma.payment.upsert({
      where: {
        providerPaymentId: payment.id,
      },
      create: {
        organizationId,
        subscriptionId: row.id,
        provider: 'RAZORPAY',
        providerPaymentId: payment.id,
        providerSubscriptionId:
          subscriptionId,
        providerOrderId:
          payment.orderId,
        amount: payment.amount,
        currency:
          payment.currency || 'INR',
        status:
          paymentState === 'captured'
            ? 'CAPTURED'
            : 'AUTHORIZED',
        method: payment.method,
        email: payment.email,
        contact: payment.contact,
        payload: {} as any,
      },
      update: {
        status:
          paymentState === 'captured'
            ? 'CAPTURED'
            : 'AUTHORIZED',
        method: payment.method,
      },
    });

    const state = mapRazorpayStatus(
      live.status,
    );

    const active =
      state === 'ACTIVE' ||
      paymentState === 'captured';

    const updated =
      await this.prisma.subscription.update(
        {
          where: { organizationId },
          data: {
            status: active
              ? 'ACTIVE'
              : 'PENDING',
            razorpayCustomerId:
              live.customerId ??
              row.razorpayCustomerId,
            currentPeriodStart:
              live.currentStart != null
                ? new Date(
                    live.currentStart *
                      1000,
                  )
                : row.currentPeriodStart,
            currentPeriodEnd:
              live.currentEnd != null
                ? new Date(
                    live.currentEnd * 1000,
                  )
                : row.currentPeriodEnd,
            cancelAtPeriodEnd: false,
            canceledAt: null,
            endedAt: null,
          },
          include: { plan: true },
        },
      );

    return {
      verified: true,
      status: updated.status,
      planCode: updated.plan.code,
      liveProviderStatus: live.status,
      paymentStatus: payment.status,
    };
  }

  async syncFromProvider(
    organizationId: string,
  ) {
    this.requireConfigured();

    const row =
      await this.prisma.subscription.findUnique(
        {
          where: { organizationId },
        },
      );

    if (
      !row ||
      row.provider !== 'RAZORPAY' ||
      !row.razorpaySubscriptionId
    ) {
      throw billingError(
        'BILLING_PROVIDER_NOT_CONFIGURED',
        'No Razorpay subscription exists for this workspace.',
      );
    }

    const live =
      await this.provider.fetchSubscription(
        row.razorpaySubscriptionId,
      );

    return this.applyProviderState(
      organizationId,
      live.status,
      {
        customerId:
          live.customerId ?? null,
        currentStart:
          live.currentStart,
        currentEnd: live.currentEnd,
      },
    );
  }

  async applyProviderState(
    organizationId: string,
    providerStatus: string,
    period?: {
      customerId?: string | null;
      currentStart?: number | null;
      currentEnd?: number | null;
    },
  ) {
    const state = mapRazorpayStatus(
      providerStatus,
    );

    const data: Record<string, unknown> =
      {};

    if (state === 'ACTIVE') {
      data.status = 'ACTIVE';
      data.cancelAtPeriodEnd = false;
      data.canceledAt = null;
      data.endedAt = null;
    } else if (state === 'PENDING') {
      /*
       * Never regress a live subscription on a
       * stale out-of-order event.
       */
      const current =
        await this.prisma.subscription.findUnique(
          {
            where: { organizationId },
            select: { status: true },
          },
        );

      if (
        current?.status === 'ACTIVE'
      ) {
        this.logger.warn(
          `Ignoring stale PENDING event for active subscription (org scoped).`,
        );

        return current;
      }

      data.status = 'PENDING';
    } else if (state === 'PAST_DUE') {
      data.status = 'PAST_DUE';
    } else if (state === 'PAUSED') {
      data.status = 'PAUSED';
    } else if (state === 'CANCELLED') {
      data.status = 'CANCELED';
      data.canceledAt = new Date();
      data.endedAt = new Date();
      data.cancelAtPeriodEnd = false;
    } else if (state === 'COMPLETED') {
      data.status = 'COMPLETED';
      data.endedAt = new Date();
    } else if (state === 'EXPIRED') {
      data.status = 'EXPIRED';
      data.endedAt = new Date();
    }

    if (
      period?.customerId !== undefined &&
      period.customerId
    ) {
      data.razorpayCustomerId =
        period.customerId;
    }

    if (period?.currentStart != null) {
      data.currentPeriodStart = new Date(
        period.currentStart * 1000,
      );
    }

    if (period?.currentEnd != null) {
      data.currentPeriodEnd = new Date(
        period.currentEnd * 1000,
      );
    }

    if (
      Object.keys(data).length === 0
    ) {
      return this.prisma.subscription.findUnique(
        {
          where: { organizationId },
        },
      );
    }

    return this.prisma.subscription.update(
      {
        where: { organizationId },
        data: data as any,
      },
    );
  }

  private async requireRazorpayRow(
    organizationId: string,
  ) {
    const row =
      await this.prisma.subscription.findUnique(
        {
          where: { organizationId },
          include: { plan: true },
        },
      );

    if (
      !row ||
      row.provider !== 'RAZORPAY' ||
      !row.razorpaySubscriptionId
    ) {
      throw billingError(
        'BILLING_PROVIDER_NOT_CONFIGURED',
        'No Razorpay subscription exists for this workspace.',
      );
    }

    return row;
  }

  async cancel(
    organizationId: string,
  ) {
    this.requireConfigured();

    const row =
      await this.requireRazorpayRow(
        organizationId,
      );

    const live =
      await this.provider.fetchSubscription(
        row.razorpaySubscriptionId!,
      );

    const liveState = String(
      live.status,
    ).toLowerCase();

    if (
      liveState === 'created' ||
      liveState === 'authenticated' ||
      liveState === 'pending'
    ) {
      /*
       * No billing cycle exists yet; cycle-end
       * cancellation is rejected by Razorpay.
       */
      await this.provider.cancelSubscription(
        row.razorpaySubscriptionId!,
        false,
      );

      await this.prisma.subscription.update(
        {
          where: { organizationId },
          data: {
            status: 'CANCELED',
            canceledAt: new Date(),
            endedAt: new Date(),
            cancelAtPeriodEnd: false,
          },
        },
      );

      return {
        cancelled: true,
        effective: 'immediate',
        message:
          'Subscription cancelled immediately; no billing cycle had started.',
      };
    }

    await this.provider.cancelSubscription(
      row.razorpaySubscriptionId!,
      true,
    );

    await this.prisma.subscription.update(
      {
        where: { organizationId },
        data: {
          cancelAtPeriodEnd: true,
        },
      },
    );

    return {
      cancelled: true,
      effective: 'period_end',
      currentPeriodEnd:
        row.currentPeriodEnd,
      message:
        'Cancellation scheduled. Paid access continues until the end of the current period.',
    };
  }

  async reactivate(
    organizationId: string,
  ) {
    this.requireConfigured();

    const row =
      await this.requireRazorpayRow(
        organizationId,
      );

    if (row.status === 'PAUSED') {
      const resumed =
        await this.provider.resumeSubscription(
          row.razorpaySubscriptionId!,
        );

      await this.applyProviderState(
        organizationId,
        resumed.status,
        {
          customerId:
            resumed.customerId,
          currentStart:
            resumed.currentStart,
          currentEnd:
            resumed.currentEnd,
        },
      );

      return {
        reactivated: true,
        status: 'ACTIVE',
        message:
          'Paused subscription resumed.',
      };
    }

    if (
      row.cancelAtPeriodEnd &&
      row.status === 'ACTIVE'
    ) {
      throw billingError(
        'BILLING_OPERATION_UNSUPPORTED',
        'This cancellation is already scheduled at period end and cannot be reversed via API. Paid access continues until then; start a new subscription afterwards if needed.',
      );
    }

    throw billingError(
      'BILLING_OPERATION_UNSUPPORTED',
      'Only paused subscriptions can be reactivated. Start a new subscription for cancelled or expired workspaces.',
    );
  }

  async changePlan(
    organizationId: string,
    targetPlanCode: string,
    atCycleEnd: boolean,
  ) {
    this.requireConfigured();

    const code = String(
      targetPlanCode ?? '',
    )
      .trim()
      .toUpperCase();

    const row =
      await this.requireRazorpayRow(
        organizationId,
      );

    if (
      row.status !== 'ACTIVE' &&
      row.status !== 'PAUSED'
    ) {
      throw billingError(
        'SUBSCRIPTION_UPDATE_FAILED',
        'Plan changes require an active subscription.',
      );
    }

    const target =
      await this.prisma.plan.findUnique({
        where: { code },
      });

    if (!target || !target.active) {
      throw billingError(
        'PLAN_NOT_AVAILABLE',
        `Plan ${code} is not available.`,
      );
    }

    if (target.id === row.planId) {
      throw billingError(
        'SUBSCRIPTION_ALREADY_ACTIVE',
        'This workspace is already on the requested plan.',
      );
    }

    const direction =
      planRank(code) >
      planRank(row.plan.code)
        ? 'upgrade'
        : planRank(code) <
            planRank(row.plan.code)
          ? 'downgrade'
          : 'lateral';

    if (direction === 'downgrade') {
      await this.assertDowngradeFits(
        organizationId,
        code,
      );
    }

    const currency = (
      row.currency ?? 'INR'
    ).toUpperCase() as
      | 'INR'
      | 'USD';

    const interval = (
      row.interval ?? 'MONTHLY'
    ).toUpperCase() as
      | 'MONTHLY'
      | 'YEARLY';

    const providerPlanId =
      await this.ensureProviderPlan(
        code,
        interval,
        currency,
      );

    const updated =
      await this.provider.schedulePlanChange(
        {
          subscriptionId:
            row.razorpaySubscriptionId!,
          providerPlanId,
          atCycleEnd:
            direction === 'downgrade'
              ? true
              : atCycleEnd,
        },
      );

    await this.prisma.subscription.update(
      {
        where: { organizationId },
        data: {
          planId: target.id,
          providerPlanId,
        },
      },
    );

    return {
      direction,
      planCode: code,
      effective:
        direction === 'downgrade' ||
        atCycleEnd
          ? 'cycle_end'
          : 'immediate',
      liveProviderStatus:
        updated.status,
      scheduledChangeAt:
        updated.scheduledChangeAt,
      message:
        direction === 'downgrade'
          ? 'Downgrade scheduled at cycle end; current access is preserved until then.'
          : 'Plan change applied through the provider; state verified from the live subscription.',
    };
  }

  private async assertDowngradeFits(
    organizationId: string,
    targetPlanCode: string,
  ): Promise<void> {
    const plan = getCommercialPlan(
      targetPlanCode,
    );

    if (!plan) {
      return;
    }

    const limits = plan.entitlements;
    const problems: string[] = [];

    const websiteIds = (
      await this.prisma.website.findMany({
        where: {
          organizationId,
          isActive: true,
        },
        select: { id: true },
      })
    ).map((website) => website.id);

    if (
      websiteIds.length >
      limits.websites
    ) {
      problems.push(
        `${websiteIds.length} active websites exceed the ${targetPlanCode} limit of ${limits.websites}`,
      );
    }

    const members =
      await this.prisma.organizationMember.count(
        {
          where: { organizationId },
        },
      );

    if (
      members > limits.teamMembers
    ) {
      problems.push(
        `${members} team members exceed the ${targetPlanCode} limit of ${limits.teamMembers}`,
      );
    }

    if (websiteIds.length > 0) {
      const [competitors, prompts] =
        await Promise.all([
          this.prisma.competitor.count({
            where: {
              organizationId,
              isActive: true,
            },
          }),
          this.prisma.aiVisibilityQuery.count(
            {
              where: {
                websiteId: {
                  in: websiteIds,
                },
                isActive: true,
              },
            },
          ),
        ]);

      if (
        competitors > limits.competitors
      ) {
        problems.push(
          `${competitors} tracked competitors exceed the ${targetPlanCode} limit of ${limits.competitors}`,
        );
      }

      if (
        prompts > limits.aiPrompts
      ) {
        problems.push(
          `${prompts} tracked AI prompts exceed the ${targetPlanCode} limit of ${limits.aiPrompts}`,
        );
      }
    }

    if (problems.length > 0) {
      throw new ForbiddenException(
        `Downgrade blocked by current usage: ${problems.join('; ')}. Reduce usage or archive records first — nothing was deleted.`,
      );
    }
  }

  async refund(
    organizationId: string,
    paymentId: string,
    amount?: number | null,
  ) {
    this.requireConfigured();

    const payment =
      await this.prisma.payment.findFirst({
        where: {
          providerPaymentId: paymentId,
          organizationId,
        },
      });

    if (!payment) {
      throw billingError(
        'PLAN_NOT_AVAILABLE',
        'Payment not found for this workspace.',
      );
    }

    if (payment.refundId) {
      return {
        refunded: true,
        refundId: payment.refundId,
        status: payment.status,
        reused: true,
      };
    }

    if (
      payment.status !== 'CAPTURED' &&
      payment.status !== 'AUTHORIZED'
    ) {
      throw billingError(
        'SUBSCRIPTION_UPDATE_FAILED',
        `Only captured payments can be refunded (current: ${payment.status}).`,
      );
    }

    const refund =
      await this.provider.createRefund({
        paymentId,
        amount,
      });

    const updated =
      await this.prisma.payment.update({
        where: {
          providerPaymentId: paymentId,
        },
        data: {
          refundId: refund.id,
          status: 'REFUNDED',
        },
      });

    return {
      refunded: true,
      refundId: updated.refundId,
      status: updated.status,
      reused: false,
    };
  }

  async listPayments(
    organizationId: string,
  ) {
    const payments =
      await this.prisma.payment.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

    return {
      total: payments.length,
      payments: payments.map(
        (payment) => ({
          id: payment.providerPaymentId,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          method: payment.method,
          created: payment.createdAt,
          refundId: payment.refundId,
          url: null,
        }),
      ),
    };
  }
}

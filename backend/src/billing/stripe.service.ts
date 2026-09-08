import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { COMMERCIAL_PLANS } from './plans.config';

@Injectable()
export class StripeService {
  private readonly stripe: Stripe | null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    this.stripe = key ? new Stripe(key) : null;
  }

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new BadRequestException(
        'Billing provider not connected.',
      );
    }

    return this.stripe;
  }

  /*
   * Stripe price synchronization — currency-safe, idempotent, auditable.
   *
   * SOURCE OF TRUTH: backend/src/billing/plans.config.ts `usd` book.
   * - USD unit_amount is derived ONLY from the explicit USD commercial
   *   price (dollars -> cents). INR values are NEVER used here, so
   *   Rs 1,999 can never become $1,999.
   * - DB Plan rows stay canonical in INR (`currency` is never overwritten).
   *   Only `stripeMonthlyPriceId / stripeYearlyPriceId` are stored.
   * - Existing matching Stripe prices are reused (matched on product
   *   metadata + currency + unit_amount + interval). Nothing is created
   *   when a match already exists, and production prices are never
   *   overwritten or deleted by this routine.
   * - Pass `{ dryRun: true }` to inspect the mapping without any
   *   Stripe writes or DB updates. Never run against production without
   *   verified credentials and an explicit review of the dry-run output.
   */
  async syncPlansToStripe(options?: { dryRun?: boolean }) {
    const stripe = this.requireStripe();
    const dryRun = options?.dryRun === true;

    const results: Array<{
      code: string;
      productId: string | null;
      monthlyPriceId: string | null;
      yearlyPriceId: string | null;
      monthlyUnitAmount: number;
      yearlyUnitAmount: number;
      currency: 'usd';
      reusedMonthly: boolean;
      reusedYearly: boolean;
      dryRun: boolean;
    }> = [];

    for (const commercial of COMMERCIAL_PLANS) {
      if (commercial.code === 'FREE') {
        continue;
      }

      const monthlyUnitAmount = Math.round(commercial.usd.monthly * 100);
      const yearlyUnitAmount = Math.round(commercial.usd.yearlyTotal * 100);

      if (
        !Number.isFinite(monthlyUnitAmount) ||
        monthlyUnitAmount <= 0 ||
        !Number.isFinite(yearlyUnitAmount) ||
        yearlyUnitAmount <= 0
      ) {
        throw new BadRequestException(
          `No valid USD price configured for plan ${commercial.code}`,
        );
      }

      const dbPlan = await this.prisma.plan.findUnique({
        where: { code: commercial.code },
      });

      if (dryRun) {
        results.push({
          code: commercial.code,
          productId: null,
          monthlyPriceId: dbPlan?.stripeMonthlyPriceId ?? null,
          yearlyPriceId: dbPlan?.stripeYearlyPriceId ?? null,
          monthlyUnitAmount,
          yearlyUnitAmount,
          currency: 'usd',
          reusedMonthly: Boolean(dbPlan?.stripeMonthlyPriceId),
          reusedYearly: Boolean(dbPlan?.stripeYearlyPriceId),
          dryRun: true,
        });
        continue;
      }

      let product: Stripe.Product;

      const existingProducts = await stripe.products.search({
        query: `metadata['renkoo_plan_code']:'${commercial.code}'`,
      });

      if (existingProducts.data.length > 0) {
        product = existingProducts.data[0];
      } else {
        const planName =
          commercial.code.charAt(0) +
          commercial.code.slice(1).toLowerCase();
        product = await stripe.products.create({
          name: `RENKOO ${planName}`,
          description: commercial.description || undefined,
          metadata: {
            renkoo_plan_code: commercial.code,
          },
        });
      }

      const monthly = await this.findOrCreatePrice(stripe, {
        productId: product.id,
        planCode: commercial.code,
        cycle: 'monthly',
        interval: 'month',
        unitAmount: monthlyUnitAmount,
      });

      const yearly = await this.findOrCreatePrice(stripe, {
        productId: product.id,
        planCode: commercial.code,
        cycle: 'yearly',
        interval: 'year',
        unitAmount: yearlyUnitAmount,
      });

      if (dbPlan) {
        await this.prisma.plan.update({
          where: { id: dbPlan.id },
          data: {
            stripeMonthlyPriceId: monthly.id,
            stripeYearlyPriceId: yearly.id,
          },
        });
      }

      results.push({
        code: commercial.code,
        productId: product.id,
        monthlyPriceId: monthly.id,
        yearlyPriceId: yearly.id,
        monthlyUnitAmount,
        yearlyUnitAmount,
        currency: 'usd',
        reusedMonthly: monthly.reused,
        reusedYearly: yearly.reused,
        dryRun: false,
      });
    }

    return results;
  }

  private async findOrCreatePrice(
    stripe: Stripe,
    input: {
      productId: string;
      planCode: string;
      cycle: 'monthly' | 'yearly';
      interval: 'month' | 'year';
      unitAmount: number;
    },
  ): Promise<{ id: string; reused: boolean }> {
    const existing = await stripe.prices.list({
      product: input.productId,
      active: true,
      limit: 100,
    });

    const match = existing.data.find(
      (price) =>
        (price.currency || '').toLowerCase() === 'usd' &&
        (price.unit_amount ?? -1) === input.unitAmount &&
        price.recurring?.interval === input.interval &&
        price.metadata?.renkoo_plan_code === input.planCode &&
        price.metadata?.billing_cycle === input.cycle,
    );

    if (match) {
      return { id: match.id, reused: true };
    }

    const created = await stripe.prices.create({
      product: input.productId,
      currency: 'usd',
      unit_amount: input.unitAmount,
      recurring: {
        interval: input.interval,
      },
      metadata: {
        renkoo_plan_code: input.planCode,
        billing_cycle: input.cycle,
      },
    });

    return { id: created.id, reused: false };
  }

  /*
   * Explicit PLAN -> USD -> Stripe mapping for auditability.
   * No DB reads, no Stripe calls, no currency inference.
   */
  static stripeUnitAmounts(): Record<
    string,
    { monthlyCents: number; yearlyCents: number; currency: 'usd' }
  > {
    const map: Record<
      string,
      { monthlyCents: number; yearlyCents: number; currency: 'usd' }
    > = {};

    for (const plan of COMMERCIAL_PLANS) {
      if (plan.code === 'FREE') continue;
      map[plan.code] = {
        monthlyCents: Math.round(plan.usd.monthly * 100),
        yearlyCents: Math.round(plan.usd.yearlyTotal * 100),
        currency: 'usd',
      };
    }

    return map;
  }

  providerConfigured(): boolean {
    return this.stripe !== null;
  }

  /**
   * Internal client access for co-located billing
   * flows (webhooks, cancellation). Still throws
   * when no provider key is configured.
   */
  getClient(): Stripe {
    return this.requireStripe();
  }

  private frontendUrl(): string {
    const url = (
      this.config.get<string>(
        'FRONTEND_URL',
      ) ?? ''
    )
      .split(',')[0]
      .trim();

    if (
      !/^https?:\/\/[^/]+$/i.test(
        url,
      )
    ) {
      throw new BadRequestException(
        'Billing return URL is not configured safely',
      );
    }

    return url;
  }

  async createCheckout(
    organizationId: string,
    planCode: string,
    yearly = false,
  ) {
    const stripe = this.requireStripe();
    const baseUrl = this.frontendUrl();

    const plan = await this.prisma.plan.findUnique({
      where: { code: planCode },
    });

    if (!plan || !plan.active) {
      throw new BadRequestException('Plan not found');
    }

    const priceId = yearly
      ? plan.stripeYearlyPriceId
      : plan.stripeMonthlyPriceId;

    if (!priceId) {
      throw new BadRequestException(
        'Stripe price is not configured for this plan',
      );
    }

    const subscription =
      await this.prisma.subscription.findUnique({
        where: { organizationId },
      });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url:
        `${baseUrl}` +
        '/billing?checkout=success',
      cancel_url:
        `${baseUrl}` +
        '/billing?checkout=canceled',
      client_reference_id: organizationId,
      metadata: {
        organizationId,
        planCode: plan.code,
      },
      subscription_data: {
        metadata: {
          organizationId,
          planCode: plan.code,
        },
      },
      customer: subscription?.stripeCustomerId || undefined,
    });

    return {
      sessionId: session.id,
      checkoutUrl: session.url,
    };
  }

  async createBillingPortal(
    organizationId: string,
  ) {
    const stripe = this.requireStripe();
    const baseUrl = this.frontendUrl();

    const subscription =
      await this.prisma.subscription.findUnique(
        {
          where: { organizationId },
        },
      );

    const customerId =
      subscription?.stripeCustomerId;

    if (!customerId) {
      throw new BadRequestException(
        'No Stripe customer exists for this workspace yet',
      );
    }

    const session =
      await stripe.billingPortal.sessions.create(
        {
          customer: customerId,
          return_url: `${baseUrl}/billing`,
        },
      );

    return {
      portalUrl: session.url,
    };
  }

  async listInvoices(
    organizationId: string,
  ) {
    const stripe = this.requireStripe();

    const subscription =
      await this.prisma.subscription.findUnique(
        {
          where: { organizationId },
        },
      );

    const customerId =
      subscription?.stripeCustomerId;

    if (!customerId) {
      return {
        provider: true,
        invoices: [],
      };
    }

    const result =
      await stripe.invoices.list({
        customer: customerId,
        limit: 24,
      });

    return {
      provider: true,
      invoices: result.data.map(
        (invoice) => ({
          id: invoice.id,
          amount:
            (invoice.amount_due ??
              0) / 100,
          currency: (
            invoice.currency ?? 'usd'
          ).toUpperCase(),
          status: invoice.status ?? 'unknown',
          created:
            new Date(
              invoice.created *
                1000,
            ).toISOString(),
          url:
            invoice.hosted_invoice_url ??
            null,
        }),
      ),
    };
  }
}


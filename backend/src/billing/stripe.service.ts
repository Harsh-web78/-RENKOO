import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';

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

  async syncPlansToStripe() {
    const stripe = this.requireStripe();

    const plans = await this.prisma.plan.findMany({
      where: { active: true },
      orderBy: { monthlyPrice: 'asc' },
    });

    const results: any[] = [];

    for (const plan of plans) {
      let product: Stripe.Product;

      const existingProducts = await stripe.products.search({
        query: `metadata['renkoo_plan_code']:'${plan.code}'`,
      });

      if (existingProducts.data.length > 0) {
        product = existingProducts.data[0];
      } else {
        product = await stripe.products.create({
          name: `RENKOO ${plan.name}`,
          description: plan.description || undefined,
          metadata: {
            renkoo_plan_code: plan.code,
          },
        });
      }

      const monthly = await this.stripe!.prices.create({
        product: product.id,
        currency: 'usd',
        unit_amount: Math.round(plan.monthlyPrice * 100),
        recurring: {
          interval: 'month',
        },
        metadata: {
          renkoo_plan_code: plan.code,
          billing_cycle: 'monthly',
        },
      });

      const yearly = await this.stripe!.prices.create({
        product: product.id,
        currency: 'usd',
        unit_amount: Math.round(plan.yearlyPrice * 100),
        recurring: {
          interval: 'year',
        },
        metadata: {
          renkoo_plan_code: plan.code,
          billing_cycle: 'yearly',
        },
      });

      await this.prisma.plan.update({
        where: { id: plan.id },
        data: {
          currency: 'USD',
          stripeMonthlyPriceId: monthly.id,
          stripeYearlyPriceId: yearly.id,
        },
      });

      results.push({
        code: plan.code,
        productId: product.id,
        monthlyPriceId: monthly.id,
        yearlyPriceId: yearly.id,
      });
    }

    return results;
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


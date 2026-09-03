import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StripeService {
  private readonly stripe: Stripe;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const key = this.config.get<string>('STRIPE_SECRET_KEY');

    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }

    this.stripe = new Stripe(key);
  }

  async syncPlansToStripe() {
    const plans = await this.prisma.plan.findMany({
      where: { active: true },
      orderBy: { monthlyPrice: 'asc' },
    });

    const results: any[] = [];

    for (const plan of plans) {
      let product: Stripe.Product;

      const existingProducts = await this.stripe.products.search({
        query: `metadata['renkoo_plan_code']:'${plan.code}'`,
      });

      if (existingProducts.data.length > 0) {
        product = existingProducts.data[0];
      } else {
        product = await this.stripe.products.create({
          name: `RENKOO ${plan.name}`,
          description: plan.description || undefined,
          metadata: {
            renkoo_plan_code: plan.code,
          },
        });
      }

      const monthly = await this.stripe.prices.create({
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

      const yearly = await this.stripe.prices.create({
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

  async createCheckout(
    organizationId: string,
    planCode: string,
    yearly = false,
  ) {
    const plan = await this.prisma.plan.findUnique({
      where: { code: planCode },
    });

    if (!plan) {
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

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url:
        `${this.config.get<string>('FRONTEND_URL')}` +
        '/settings/billing?success=true',
      cancel_url:
        `${this.config.get<string>('FRONTEND_URL')}` +
        '/settings/billing?canceled=true',
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
}

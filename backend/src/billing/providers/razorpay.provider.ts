import {
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  createHmac,
  timingSafeEqual,
} from 'crypto';
import Razorpay from 'razorpay';

import { billingError } from '../billing.errors';
import type {
  PaymentProvider,
  ProviderCapabilities,
  ProviderCurrency,
  ProviderInterval,
  ProviderInvoice,
  ProviderPayment,
  ProviderPlanRef,
  ProviderSubscription,
} from './payment-provider.interface';

/*
 * Razorpay PaymentProvider (PRIMARY).
 * Uses the official razorpay SDK against the
 * documented v1 REST surface (plans,
 * subscriptions, payments, refunds, invoices).
 * Secrets stay server-side; failures are coded,
 * never raw provider dumps.
 */
@Injectable()
export class RazorpayPaymentProvider
  implements PaymentProvider
{
  readonly id = 'RAZORPAY' as const;
  readonly displayName = 'Razorpay';

  private readonly logger = new Logger(
    RazorpayPaymentProvider.name,
  );
  private client: Razorpay | null = null;

  private getClient(): Razorpay {
    if (this.client) {
      return this.client;
    }

    const keyId =
      process.env.RAZORPAY_KEY_ID?.trim();
    const keySecret =
      process.env.RAZORPAY_KEY_SECRET?.trim();

    if (!keyId || !keySecret) {
      throw billingError(
        'BILLING_PROVIDER_NOT_CONFIGURED',
        'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the backend.',
      );
    }

    this.client = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    return this.client;
  }

  isConfigured(): boolean {
    return Boolean(
      process.env.RAZORPAY_KEY_ID?.trim() &&
        process.env.RAZORPAY_KEY_SECRET?.trim(),
    );
  }

  mode(): 'test' | 'live' | 'unconfigured' {
    if (!this.isConfigured()) {
      return 'unconfigured';
    }

    const explicit =
      process.env.RAZORPAY_MODE?.trim().toLowerCase();
    const keyId =
      process.env.RAZORPAY_KEY_ID?.trim() ??
      '';

    if (
      explicit === 'live' ||
      keyId.startsWith('rzp_live_')
    ) {
      return 'live';
    }

    return 'test';
  }

  webhookConfigured(): boolean {
    return Boolean(
      process.env.RAZORPAY_WEBHOOK_SECRET?.trim(),
    );
  }

  internationalCards():
    | 'AVAILABLE'
    | 'PENDING_APPROVAL'
    | 'NOT_CONFIGURED' {
    const explicit =
      process.env.RAZORPAY_INTERNATIONAL_CARDS?.trim().toUpperCase();

    if (explicit === 'AVAILABLE') {
      return 'AVAILABLE';
    }

    if (!this.isConfigured()) {
      return 'NOT_CONFIGURED';
    }

    return 'PENDING_APPROVAL';
  }

  capabilities(): ProviderCapabilities {
    return {
      subscriptions: true,
      scheduledPlanChange: true,
      cancelAtCycleEnd: true,
      pauseResume: true,
      refunds: true,
      invoices: true,
      internationalCards:
        this.internationalCards() ===
        'AVAILABLE',
    };
  }

  private fail(
    operation: string,
    error: unknown,
  ): never {
    const status =
      (error as any)?.statusCode ??
      (error as any)?.status;
    const description = String(
      (error as any)?.error?.description ??
        (error as any)?.message ??
        'unknown',
    ).slice(0, 200);

    this.logger.warn(
      `Razorpay ${operation} failed (status=${status ?? 'unknown'})`,
    );

    throw billingError(
      'BILLING_PROVIDER_UNAVAILABLE',
      `Razorpay ${operation} failed.`,
      { status: status ?? null },
    );
  }

  async ensurePlan(input: {
    planCode: string;
    interval: ProviderInterval;
    currency: ProviderCurrency;
    amount: number;
    name: string;
    description?: string | null;
  }): Promise<ProviderPlanRef> {
    const client = this.getClient();

    try {
      /*
       * Idempotent lookup first: never create
       * duplicate provider plans per checkout.
       */
      const existing: any =
        await client.plans.all({
          count: 100,
        });

      const match = (
        existing?.items ?? []
      ).find(
        (plan: any) =>
          plan?.notes?.renkoo_plan_code ===
            input.planCode &&
          plan?.notes?.renkoo_interval ===
            input.interval &&
          String(
            plan?.currency ?? '',
          ).toUpperCase() ===
            input.currency &&
          Number(plan?.item?.amount ?? 0) ===
            Math.round(
              input.amount * 100,
            ),
      );

      if (match?.id) {
        return {
          providerPlanId: String(
            match.id,
          ),
          amount: input.amount,
          currency: input.currency,
        };
      }

      const created: any =
        await client.plans.create({
          period:
            input.interval === 'MONTHLY'
              ? 'monthly'
              : 'yearly',
          interval: 1,
          item: {
            name: input.name.slice(0, 200),
            description: (
              input.description ?? ''
            ).slice(0, 500),
            amount: Math.round(
              input.amount * 100,
            ),
            currency: input.currency,
          },
          notes: {
            renkoo_plan_code:
              input.planCode,
            renkoo_interval:
              input.interval,
          },
        });

      if (!created?.id) {
        throw new Error(
          'Plan creation returned no id',
        );
      }

      return {
        providerPlanId: String(
          created.id,
        ),
        amount: input.amount,
        currency: input.currency,
      };
    } catch (error) {
      if (
        (error as any)?.code ===
        'BILLING_PROVIDER_NOT_CONFIGURED'
      ) {
        throw error;
      }

      return this.fail(
        'plan sync',
        error,
      );
    }
  }

  async createSubscription(input: {
    providerPlanId: string;
    customerEmail?: string | null;
    customerContact?: string | null;
    notes?: Record<string, string>;
  }): Promise<ProviderSubscription> {
    const client = this.getClient();

    try {
      const created: any =
        await client.subscriptions.create({
          plan_id: input.providerPlanId,
          total_count: 120,
          customer_notify: 1,
          ...(input.customerEmail ||
          input.customerContact
            ? {
                notify_info: {
                  ...(input.customerEmail
                    ? {
                        notify_email:
                          input.customerEmail,
                      }
                    : {}),
                  ...(input.customerContact
                    ? {
                        notify_phone:
                          input.customerContact,
                      }
                    : {}),
                },
              }
            : {}),
          ...(input.notes
            ? { notes: input.notes }
            : {}),
        });

      return this.toSubscription(created);
    } catch (error) {
      return this.fail(
        'subscription creation',
        error,
      );
    }
  }

  async fetchSubscription(
    subscriptionId: string,
  ): Promise<ProviderSubscription> {
    const client = this.getClient();

    try {
      const found: any =
        await client.subscriptions.fetch(
          subscriptionId,
        );

      return this.toSubscription(found);
    } catch (error) {
      return this.fail(
        'subscription fetch',
        error,
      );
    }
  }

  async cancelSubscription(
    subscriptionId: string,
    atCycleEnd: boolean,
  ): Promise<ProviderSubscription> {
    const client = this.getClient();

    try {
      const cancelled: any =
        await client.subscriptions.cancel(
          subscriptionId,
          atCycleEnd,
        );

      return this.toSubscription(
        cancelled,
      );
    } catch (error) {
      return this.fail(
        'subscription cancellation',
        error,
      );
    }
  }

  async schedulePlanChange(input: {
    subscriptionId: string;
    providerPlanId: string;
    atCycleEnd: boolean;
  }): Promise<ProviderSubscription> {
    const client = this.getClient();

    try {
      const updated: any =
        await client.subscriptions.update(
          input.subscriptionId,
          {
            plan_id:
              input.providerPlanId,
            schedule_change_at:
              input.atCycleEnd
                ? 'cycle_end'
                : 'now',
          },
        );

      return this.toSubscription(updated);
    } catch (error) {
      return this.fail(
        'subscription update',
        error,
      );
    }
  }

  async pauseSubscription(
    subscriptionId: string,
  ): Promise<ProviderSubscription> {
    const client = this.getClient();

    try {
      const paused: any =
        await client.subscriptions.pause(
          subscriptionId,
          { pause_at: 'now' },
        );

      return this.toSubscription(paused);
    } catch (error) {
      return this.fail(
        'subscription pause',
        error,
      );
    }
  }

  async resumeSubscription(
    subscriptionId: string,
  ): Promise<ProviderSubscription> {
    const client = this.getClient();

    try {
      const resumed: any =
        await client.subscriptions.resume(
          subscriptionId,
          { resume_at: 'now' },
        );

      return this.toSubscription(
        resumed,
      );
    } catch (error) {
      return this.fail(
        'subscription resume',
        error,
      );
    }
  }

  async fetchPayment(
    paymentId: string,
  ): Promise<ProviderPayment> {
    const client = this.getClient();

    try {
      const found: any =
        await client.payments.fetch(
          paymentId,
        );

      return {
        id: String(found.id),
        subscriptionId:
          found.subscription_id ?? null,
        orderId:
          found.order_id ?? null,
        amount:
          Number(found.amount ?? 0) /
          100,
        currency: String(
          found.currency ?? '',
        ).toUpperCase(),
        status: String(
          found.status ?? 'created',
        ),
        method: found.method ?? null,
        email: found.email ?? null,
        contact:
          found.contact ?? null,
        raw: undefined,
      };
    } catch (error) {
      return this.fail(
        'payment fetch',
        error,
      );
    }
  }

  async listSubscriptionInvoices(
    subscriptionId: string,
  ): Promise<ProviderInvoice[]> {
    const client = this.getClient();

    try {
      const result: any =
        await client.invoices.all({
          subscription_id:
            subscriptionId,
        });

      return (result?.items ?? []).map(
        (invoice: any) => ({
          id: String(invoice.id),
          amount:
            Number(
              invoice.amount ?? 0,
            ) / 100,
          currency: String(
            invoice.currency ?? '',
          ).toUpperCase(),
          status: String(
            invoice.status ?? 'unknown',
          ),
          createdAt: new Date(
            Number(
              invoice.created_at ?? 0,
            ) * 1000,
          ).toISOString(),
          url:
            invoice.short_url ?? null,
        }),
      );
    } catch (error) {
      return this.fail(
        'invoice listing',
        error,
      );
    }
  }

  async createRefund(input: {
    paymentId: string;
    amount?: number | null;
  }): Promise<{
    id: string;
    status: string;
  }> {
    const client = this.getClient();

    try {
      const refund: any =
        await client.payments.refund(
          input.paymentId,
          input.amount != null
            ? {
                amount: Math.round(
                  input.amount * 100,
                ),
              }
            : {},
        );

      return {
        id: String(refund.id),
        status: String(
          refund.status ?? 'created',
        ),
      };
    } catch (error) {
      return this.fail(
        'refund creation',
        error,
      );
    }
  }

  /*
   * Checkout verification: HMAC-SHA256 over
   * "payment_id|subscription_id" with the key
   * secret (documented Razorpay subscription
   * authentication flow). Timing-safe compare.
   */
  verifyCheckoutSignature(input: {
    subscriptionId: string;
    paymentId: string;
    signature: string;
  }): boolean {
    const secret =
      process.env.RAZORPAY_KEY_SECRET?.trim();

    if (!secret) {
      return false;
    }

    const expected = createHmac(
      'sha256',
      secret,
    )
      .update(
        `${input.paymentId}|${input.subscriptionId}`,
      )
      .digest('hex');

    try {
      return timingSafeEqual(
        Buffer.from(expected, 'utf8'),
        Buffer.from(
          input.signature,
          'utf8',
        ),
      );
    } catch {
      return false;
    }
  }

  /*
   * Webhook verification: HMAC-SHA256 over the
   * RAW body with the webhook secret (never the
   * parsed body). Timing-safe compare.
   */
  verifyWebhookSignature(
    rawBody: Buffer,
    signature: string,
  ): boolean {
    const secret =
      process.env.RAZORPAY_WEBHOOK_SECRET?.trim();

    if (!secret || !signature) {
      return false;
    }

    const expected = createHmac(
      'sha256',
      secret,
    )
      .update(rawBody)
      .digest('hex');

    try {
      return timingSafeEqual(
        Buffer.from(expected, 'utf8'),
        Buffer.from(signature, 'utf8'),
      );
    } catch {
      return false;
    }
  }

  private toSubscription(
    raw: any,
  ): ProviderSubscription {
    return {
      id: String(raw.id),
      planId: String(
        raw.plan_id ?? '',
      ),
      status: String(
        raw.status ?? 'created',
      ),
      customerId:
        raw.customer_id ?? null,
      currentStart:
        raw.current_start != null
          ? Number(raw.current_start)
          : null,
      currentEnd:
        raw.current_end != null
          ? Number(raw.current_end)
          : null,
      cancelAtCycleEnd: null,
      scheduledChangeAt:
        raw.change_scheduled_at != null
          ? Number(raw.change_scheduled_at)
          : null,
      raw: undefined,
    };
  }
}

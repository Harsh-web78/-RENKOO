import { Injectable } from '@nestjs/common';

import { StripeService } from '../stripe.service';
import { billingError } from '../billing.errors';
import type {
  PaymentProvider,
  ProviderCapabilities,
  ProviderInvoice,
  ProviderPayment,
  ProviderPlanRef,
  ProviderSubscription,
} from './payment-provider.interface';

/*
 * Stripe facade (SECONDARY / FUTURE provider).
 * Delegates where the existing StripeService has
 * real behavior; honestly reports unsupported
 * operations instead of faking them.
 */
@Injectable()
export class StripePaymentProvider
  implements PaymentProvider
{
  readonly id = 'STRIPE' as const;
  readonly displayName = 'Stripe';

  constructor(
    private readonly stripeService: StripeService,
  ) {}

  isConfigured(): boolean {
    try {
      return this.stripeService.providerConfigured();
    } catch {
      return false;
    }
  }

  capabilities(): ProviderCapabilities {
    return {
      subscriptions: this.isConfigured(),
      scheduledPlanChange: false,
      cancelAtCycleEnd: true,
      pauseResume: false,
      refunds: false,
      invoices: this.isConfigured(),
      internationalCards:
        this.isConfigured(),
    };
  }

  async ensurePlan(): Promise<ProviderPlanRef> {
    throw billingError(
      'BILLING_OPERATION_UNSUPPORTED',
      'Stripe plan sync uses the existing sync-plans flow, not provider plan ensure.',
    );
  }

  async createSubscription(): Promise<ProviderSubscription> {
    throw billingError(
      'BILLING_OPERATION_UNSUPPORTED',
      'Stripe subscriptions are created through Checkout sessions, not direct subscription creation.',
    );
  }

  async fetchSubscription(): Promise<ProviderSubscription> {
    throw billingError(
      'BILLING_OPERATION_UNSUPPORTED',
      'Direct Stripe subscription fetch is not wired in this build.',
    );
  }

  async cancelSubscription(): Promise<ProviderSubscription> {
    throw billingError(
      'BILLING_OPERATION_UNSUPPORTED',
      'Use the existing subscription cancel flow for Stripe.',
    );
  }

  async schedulePlanChange(): Promise<ProviderSubscription> {
    throw billingError(
      'BILLING_OPERATION_UNSUPPORTED',
      'Scheduled Stripe plan changes are not supported in this build.',
    );
  }

  async pauseSubscription(): Promise<ProviderSubscription> {
    throw billingError(
      'BILLING_OPERATION_UNSUPPORTED',
      'Stripe pause/resume is not supported in this build.',
    );
  }

  async resumeSubscription(): Promise<ProviderSubscription> {
    throw billingError(
      'BILLING_OPERATION_UNSUPPORTED',
      'Stripe pause/resume is not supported in this build.',
    );
  }

  async fetchPayment(): Promise<ProviderPayment> {
    throw billingError(
      'BILLING_OPERATION_UNSUPPORTED',
      'Direct Stripe payment fetch is not wired in this build.',
    );
  }

  async listSubscriptionInvoices(): Promise<
    ProviderInvoice[]
  > {
    throw billingError(
      'BILLING_OPERATION_UNSUPPORTED',
      'Use the existing Stripe invoice listing for Stripe customers.',
    );
  }

  async createRefund(): Promise<{
    id: string;
    status: string;
  }> {
    throw billingError(
      'BILLING_OPERATION_UNSUPPORTED',
      'Stripe refunds are not supported in this build.',
    );
  }

  verifyCheckoutSignature(): boolean {
    return false;
  }

  verifyWebhookSignature(): boolean {
    return false;
  }
}

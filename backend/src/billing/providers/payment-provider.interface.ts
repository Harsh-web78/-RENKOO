/*
 * =========================================================
 * PAYMENT PROVIDER ABSTRACTION (provider-neutral domain)
 *
 * RENKOO billing logic talks to PaymentProvider.
 * RazorpayPaymentProvider is PRIMARY; the Stripe
 * facade preserves existing Stripe behavior as a
 * future/secondary provider. No billing flow may
 * hardcode one provider's objects.
 * =========================================================
 */

export type ProviderId =
  | 'RAZORPAY'
  | 'STRIPE';

export type ProviderInterval =
  | 'MONTHLY'
  | 'YEARLY';

export type ProviderCurrency =
  | 'INR'
  | 'USD';

export interface ProviderPlanRef {
  providerPlanId: string;
  amount: number;
  currency: ProviderCurrency;
}

export interface ProviderSubscription {
  id: string;
  planId: string;
  status: string;
  customerId?: string | null;
  currentStart?: number | null;
  currentEnd?: number | null;
  cancelAtCycleEnd?: boolean | null;
  scheduledChangeAt?: number | null;
  raw?: unknown;
}

export interface ProviderPayment {
  id: string;
  subscriptionId?: string | null;
  orderId?: string | null;
  amount: number;
  currency: string;
  status: string;
  method?: string | null;
  email?: string | null;
  contact?: string | null;
  raw?: unknown;
}

export interface ProviderInvoice {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  url?: string | null;
}

export interface ProviderCapabilities {
  subscriptions: boolean;
  scheduledPlanChange: boolean;
  cancelAtCycleEnd: boolean;
  pauseResume: boolean;
  refunds: boolean;
  invoices: boolean;
  internationalCards: boolean;
}

export interface PaymentProvider {
  readonly id: ProviderId;
  readonly displayName: string;

  isConfigured(): boolean;
  capabilities(): ProviderCapabilities;

  ensurePlan(input: {
    planCode: string;
    interval: ProviderInterval;
    currency: ProviderCurrency;
    amount: number;
    name: string;
    description?: string | null;
  }): Promise<ProviderPlanRef>;

  createSubscription(input: {
    providerPlanId: string;
    customerEmail?: string | null;
    customerContact?: string | null;
    notes?: Record<string, string>;
  }): Promise<ProviderSubscription>;

  fetchSubscription(
    subscriptionId: string,
  ): Promise<ProviderSubscription>;

  cancelSubscription(
    subscriptionId: string,
    atCycleEnd: boolean,
  ): Promise<ProviderSubscription>;

  schedulePlanChange(input: {
    subscriptionId: string;
    providerPlanId: string;
    atCycleEnd: boolean;
  }): Promise<ProviderSubscription>;

  pauseSubscription(
    subscriptionId: string,
  ): Promise<ProviderSubscription>;

  resumeSubscription(
    subscriptionId: string,
  ): Promise<ProviderSubscription>;

  fetchPayment(
    paymentId: string,
  ): Promise<ProviderPayment>;

  listSubscriptionInvoices(
    subscriptionId: string,
  ): Promise<ProviderInvoice[]>;

  createRefund(input: {
    paymentId: string;
    amount?: number | null;
  }): Promise<{
    id: string;
    status: string;
  }>;

  verifyCheckoutSignature(input: {
    subscriptionId: string;
    paymentId: string;
    signature: string;
  }): boolean;

  verifyWebhookSignature(
    rawBody: Buffer,
    signature: string,
  ): boolean;
}

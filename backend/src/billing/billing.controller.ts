import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { BillingService } from './billing.service';
import { StripeService } from './stripe.service';
import { RazorpayService } from './razorpay.service';
import { RazorpayPaymentProvider } from './providers/razorpay.provider';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly stripeService: StripeService,
    private readonly razorpayService: RazorpayService,
    private readonly razorpayProvider: RazorpayPaymentProvider,
  ) {}

  private organizationId(req: any): string {
    const id = req.user?.organizationId;

    if (!id) {
      throw new ForbiddenException(
        'Organization context is missing from the authenticated session.',
      );
    }

    return id;
  }

  private assertOrganization(
    req: any,
    organizationId: string,
  ): string {
    const authenticated =
      this.organizationId(req);

    if (
      organizationId !== authenticated
    ) {
      throw new ForbiddenException(
        'You are not authorized to access this organization billing data.',
      );
    }

    return authenticated;
  }

  @Get('entitlements')
  getEntitlements(@Req() req: any) {
    return this.billingService.getEntitlements(
      req.user.organizationId,
    );
  }

  @Get('usage')
  getUsage(@Req() req: any) {
    return this.billingService.getUsageSummary(
      req.user.organizationId,
    );
  }

  @Get('provider')
  providerStatus() {
    return this.billingService.providerStatus();
  }

  /*
   * Safe provider capability surface. Presence
   * booleans and configured state only — never
   * secrets. The public Razorpay Key ID is NOT
   * included here; it is returned only inside a
   * subscription checkout payload.
   */
  @Get('provider-status')
  fullProviderStatus() {
    return {
      razorpayConfigured:
        this.razorpayProvider.isConfigured(),
      razorpayMode:
        this.razorpayProvider.mode(),
      webhookConfigured:
        this.razorpayProvider.webhookConfigured(),
      internationalCards:
        this.razorpayProvider.internationalCards(),
      stripeConfigured:
        this.stripeService.providerConfigured(),
      primaryProvider: 'RAZORPAY',
    };
  }

  @Get('payments')
  listPayments(@Req() req: any) {
    return this.razorpayService.listPayments(
      this.organizationId(req),
    );
  }

  @Get('history')
  billingHistory(@Req() req: any) {
    return this.billingService.getBillingHistory(
      this.organizationId(req),
    );
  }

  @Throttle({
    default: { limit: 20, ttl: 60000 },
  })
  @Post('plans/sync')
  syncPlans() {
    return this.billingService.syncPlansFromConfig();
  }

  @Get('invoices')
  listInvoices(@Req() req: any) {
    return this.billingService.listInvoices(
      req.user.organizationId,
    );
  }

  @Post('portal')
  billingPortal(@Req() req: any) {
    return this.billingService.billingPortal(
      req.user.organizationId,
    );
  }

  @Post('subscription/cancel')
  cancelSubscription(
    @Req() req: any,
  ) {
    return this.billingService.cancelSubscription(
      req.user.organizationId,
    );
  }

  @Get('plans')
  getPlans() {
    return this.billingService.getPlans();
  }

  @Get('subscription/:organizationId')
  async getSubscription(
    @Req() req: any,
    @Param('organizationId') organizationId: string,
  ) {
    const authenticatedOrganizationId =
      req.user?.organizationId;

    if (!authenticatedOrganizationId) {
      throw new ForbiddenException(
        'Organization context is missing from the authenticated session.',
      );
    }

    if (
      organizationId !== authenticatedOrganizationId
    ) {
      throw new ForbiddenException(
        'You are not authorized to access this organization billing data.',
      );
    }

    return this.billingService.getSubscription(
      authenticatedOrganizationId,
    );
  }

  @Post('trial/:organizationId')
  async createTrial(
    @Req() req: any,
    @Param('organizationId') organizationId: string,
  ) {
    const authenticatedOrganizationId =
      req.user?.organizationId;

    if (!authenticatedOrganizationId) {
      throw new ForbiddenException(
        'Organization context is missing from the authenticated session.',
      );
    }

    if (
      organizationId !== authenticatedOrganizationId
    ) {
      throw new ForbiddenException(
        'You are not authorized to modify this organization billing data.',
      );
    }

    return this.billingService.createTrial(
      authenticatedOrganizationId,
    );
  }

  @Post('stripe/sync-plans')
  syncStripePlans() {
    return this.stripeService.syncPlansToStripe();
  }

  @Post('stripe/checkout/:organizationId/:planCode')
  async createMonthlyCheckout(
    @Req() req: any,
    @Param('organizationId') organizationId: string,
    @Param('planCode') planCode: string,
  ) {
    const authenticatedOrganizationId =
      req.user?.organizationId;

    if (!authenticatedOrganizationId) {
      throw new ForbiddenException(
        'Organization context is missing from the authenticated session.',
      );
    }

    if (
      organizationId !== authenticatedOrganizationId
    ) {
      throw new ForbiddenException(
        'You are not authorized to create billing checkout for this organization.',
      );
    }

    if (!planCode) {
      throw new BadRequestException(
        'Plan code is required.',
      );
    }

    return this.stripeService.createCheckout(
      authenticatedOrganizationId,
      planCode,
      false,
    );
  }

  @Post('stripe/checkout/:organizationId/:planCode/yearly')
  async createYearlyCheckout(
    @Req() req: any,
    @Param('organizationId') organizationId: string,
    @Param('planCode') planCode: string,
  ) {
    const authenticatedOrganizationId =
      req.user?.organizationId;

    if (!authenticatedOrganizationId) {
      throw new ForbiddenException(
        'Organization context is missing from the authenticated session.',
      );
    }

    if (
      organizationId !== authenticatedOrganizationId
    ) {
      throw new ForbiddenException(
        'You are not authorized to create billing checkout for this organization.',
      );
    }

    if (!planCode) {
      throw new BadRequestException(
        'Plan code is required.',
      );
    }

    return this.stripeService.createCheckout(
      authenticatedOrganizationId,
      planCode,
      true,
    );
  }

  // =========================================================
  // RAZORPAY (primary provider)
  // =========================================================

  /*
   * Body carries plan/interval/currency only.
   * Price, plan IDs and entitlements resolve
   * server-side from centralized config.
   */
  @Throttle({
    default: { limit: 10, ttl: 60000 },
  })
  @Post('razorpay/subscription')
  createRazorpaySubscription(
    @Req() req: any,
    @Body()
    body: {
      planCode?: string;
      interval?: string;
      currency?: string;
    },
  ) {
    return this.razorpayService.createSubscription(
      this.organizationId(req),
      { email: req.user?.email ?? null },
      {
        planCode: body?.planCode ?? '',
        interval: (body?.interval ??
          'MONTHLY') as
          | 'MONTHLY'
          | 'YEARLY',
        currency: (body?.currency ??
          'INR') as 'INR' | 'USD',
      },
    );
  }

  @Throttle({
    default: { limit: 10, ttl: 60000 },
  })
  @Post('razorpay/verify')
  verifyRazorpayCheckout(
    @Req() req: any,
    @Body()
    body: {
      subscription_id?: string;
      payment_id?: string;
      signature?: string;
    },
  ) {
    return this.razorpayService.verifyCheckout(
      this.organizationId(req),
      {
        subscription_id:
          body?.subscription_id ?? '',
        payment_id:
          body?.payment_id ?? '',
        signature: body?.signature ?? '',
      },
    );
  }

  @Post('razorpay/sync')
  syncRazorpaySubscription(
    @Req() req: any,
  ) {
    return this.razorpayService.syncFromProvider(
      this.organizationId(req),
    );
  }

  @Throttle({
    default: { limit: 10, ttl: 60000 },
  })
  @Post('razorpay/cancel')
  cancelRazorpaySubscription(
    @Req() req: any,
  ) {
    return this.razorpayService.cancel(
      this.organizationId(req),
    );
  }

  @Throttle({
    default: { limit: 10, ttl: 60000 },
  })
  @Post('razorpay/reactivate')
  reactivateRazorpaySubscription(
    @Req() req: any,
  ) {
    return this.razorpayService.reactivate(
      this.organizationId(req),
    );
  }

  @Throttle({
    default: { limit: 10, ttl: 60000 },
  })
  @Post('razorpay/change-plan')
  changeRazorpayPlan(
    @Req() req: any,
    @Body()
    body: {
      planCode?: string;
      atCycleEnd?: boolean;
    },
  ) {
    return this.razorpayService.changePlan(
      this.organizationId(req),
      body?.planCode ?? '',
      body?.atCycleEnd ?? false,
    );
  }

  @Throttle({
    default: { limit: 10, ttl: 60000 },
  })
  @Post('razorpay/refund')
  refundRazorpayPayment(
    @Req() req: any,
    @Body()
    body: {
      paymentId?: string;
      amount?: number;
    },
  ) {
    return this.razorpayService.refund(
      this.organizationId(req),
      body?.paymentId ?? '',
      body?.amount ?? null,
    );
  }
}


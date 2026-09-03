import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { BillingService } from './billing.service';
import { StripeService } from './stripe.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly stripeService: StripeService,
  ) {}

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
}


import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { BillingService } from './billing.service';

/*
 * Public Stripe webhook receiver.
 *
 * Deliberately NOT behind JwtAuthGuard: Stripe
 * cannot authenticate. Trust comes solely from
 * HMAC signature verification inside the service,
 * plus idempotent event recording.
 */
@Controller('billing/stripe')
export class StripeWebhookController {
  constructor(
    private readonly billingService: BillingService,
  ) {}

  @Post('webhook')
  async webhook(
    @Req()
    req: Request & {
      rawBody?: Buffer | string;
    },
    @Headers('stripe-signature')
    signature: string,
  ) {
    const raw = req.rawBody;

    if (!raw) {
      throw new BadRequestException(
        'Missing webhook payload',
      );
    }

    return this.billingService.handleStripeWebhook(
      Buffer.isBuffer(raw)
        ? raw
        : Buffer.from(raw),
      signature,
    );
  }
}

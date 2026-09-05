import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { BillingService } from './billing.service';

/*
 * Public Razorpay webhook. Trust comes from HMAC
 * signature verification only — never from
 * network, payload content, or obscurity.
 * Raw body is preserved by main.ts for the
 * signature check.
 */
@Controller('billing/razorpay')
export class RazorpayWebhookController {
  constructor(
    private readonly billingService: BillingService,
  ) {}

  @Throttle({
    default: { limit: 60, ttl: 60000 },
  })
  @HttpCode(HttpStatus.OK)
  @Post('webhook')
  async webhook(
    @Req() req: { rawBody?: Buffer | string },
    @Headers('x-razorpay-signature')
    signature: string,
    @Headers('x-razorpay-event-id')
    eventId: string,
    @Body() _body: unknown,
  ) {
    void _body;

    const raw = req.rawBody;

    if (!raw) {
      throw new BadRequestException(
        'Missing webhook payload.',
      );
    }

    return this.billingService.handleRazorpayWebhook(
      Buffer.isBuffer(raw)
        ? raw
        : Buffer.from(raw),
      signature,
      eventId,
    );
  }
}

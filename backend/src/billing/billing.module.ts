import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { StripeWebhookController } from './stripe-webhook.controller';
import { RazorpayWebhookController } from './razorpay-webhook.controller';
import { BillingService } from './billing.service';
import { StripeService } from './stripe.service';
import { RazorpayService } from './razorpay.service';
import { RazorpayPaymentProvider } from './providers/razorpay.provider';
import { StripePaymentProvider } from './providers/stripe.provider';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
  ],
  controllers: [
    BillingController,
    StripeWebhookController,
    RazorpayWebhookController,
  ],
  providers: [
    BillingService,
    StripeService,
    RazorpayService,
    RazorpayPaymentProvider,
    StripePaymentProvider,
  ],
  exports: [
    BillingService,
    StripeService,
    RazorpayService,
    RazorpayPaymentProvider,
    StripePaymentProvider,
  ],
})
export class BillingModule {}

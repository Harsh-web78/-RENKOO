import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeService } from './stripe.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
  ],
  controllers: [BillingController],
  providers: [
    BillingService,
    StripeService,
  ],
  exports: [
    BillingService,
    StripeService,
  ],
})
export class BillingModule {}

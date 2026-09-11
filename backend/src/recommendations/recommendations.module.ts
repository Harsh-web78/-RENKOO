import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ComparisonModule } from '../comparison/comparison.module';
import { GoogleModule } from '../google/google.module';
import { BusinessBrainModule } from '../business-brain/business-brain.module';
import { BillingModule } from '../billing/billing.module';

import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ComparisonModule,
    GoogleModule,
    BusinessBrainModule,
    BillingModule,
  ],
  controllers: [
    RecommendationsController,
  ],
  providers: [
    RecommendationsService,
  ],
  exports: [
    RecommendationsService,
  ],
})
export class RecommendationsModule {}

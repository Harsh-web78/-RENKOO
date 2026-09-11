import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BillingModule } from '../billing/billing.module';
import { GoogleModule } from '../google/google.module';
import { CrawlModule } from '../crawl/crawl.module';

import { ActionsController } from './actions.controller';
import { ActionsService } from './actions.service';
import { ActionMeasurementService } from './action-measurement.service';
import { ActionVerificationService } from './action-verification.service';
import { ActionExecutionService } from './action-execution.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    BillingModule,
    GoogleModule,
    CrawlModule,
  ],
  controllers: [
    ActionsController,
  ],
  providers: [
    ActionsService,
    ActionMeasurementService,
    ActionVerificationService,
    ActionExecutionService,
  ],
  exports: [
    ActionsService,
    ActionMeasurementService,
    ActionVerificationService,
    ActionExecutionService,
  ],
})
export class ActionsModule {}
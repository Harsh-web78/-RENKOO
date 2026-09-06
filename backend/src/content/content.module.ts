import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { GoogleModule } from '../google/google.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BusinessBrainModule } from '../business-brain/business-brain.module';
import { AiVisibilityModule } from '../ai-visibility/ai-visibility.module';
import { BillingModule } from '../billing/billing.module';

import { ContentController } from './content.controller';
import { ContentService } from './content.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    GoogleModule,
    BusinessBrainModule,
    AiVisibilityModule,
    BillingModule,
  ],

  controllers: [
    ContentController,
  ],

  providers: [
    ContentService,
  ],

  exports: [
    ContentService,
  ],
})
export class ContentModule {}

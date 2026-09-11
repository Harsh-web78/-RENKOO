import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { GoogleModule } from '../google/google.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BusinessBrainModule } from '../business-brain/business-brain.module';
import { AiVisibilityModule } from '../ai-visibility/ai-visibility.module';
import { BillingModule } from '../billing/billing.module';

import { ContentController } from './content.controller';
import { ChangeIntelligenceController } from './change-intelligence.controller';
import { ContentService } from './content.service';
import { PageIntelligenceService } from './page-intelligence.service';
import { AgentReadinessService } from './agent-readiness.service';
import { InformationIntelligenceService } from './information-intelligence.service';
import { ChangeIntelligenceService } from './change-intelligence.service';
import { KeywordsModule } from '../keywords/keywords.module';
import { BacklinksModule } from '../backlinks/backlinks.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    GoogleModule,
    BusinessBrainModule,
    AiVisibilityModule,
    BillingModule,
    KeywordsModule,
    BacklinksModule,
  ],

  controllers: [
    ContentController,
    ChangeIntelligenceController,
  ],

  providers: [
    ContentService,
    PageIntelligenceService,
    AgentReadinessService,
    InformationIntelligenceService,
    ChangeIntelligenceService,
  ],

  exports: [
    ContentService,
    PageIntelligenceService,
    AgentReadinessService,
    InformationIntelligenceService,
    ChangeIntelligenceService,
  ],
})
export class ContentModule {}

import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BusinessBrainModule } from '../business-brain/business-brain.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { AiVisibilityModule } from '../ai-visibility/ai-visibility.module';
import { ActionsModule } from '../actions/actions.module';
import { GoogleModule } from '../google/google.module';
import { RoiModule } from '../roi/roi.module';
import { ReportsModule } from '../reports/reports.module';
import { LocalSeoModule } from '../local-seo/local-seo.module';
import { ContentModule } from '../content/content.module';
import { BacklinksModule } from '../backlinks/backlinks.module';

import { IntelligenceController } from './intelligence.controller';
import { IntelligenceService } from './intelligence.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    BusinessBrainModule,
    RecommendationsModule,
    MonitoringModule,
    AiVisibilityModule,
    ActionsModule,
    GoogleModule,
    RoiModule,
    ReportsModule,
    LocalSeoModule,
    ContentModule,
    BacklinksModule,
  ],
  controllers: [
    IntelligenceController,
  ],
  providers: [
    IntelligenceService,
  ],
  exports: [
    IntelligenceService,
  ],
})
export class IntelligenceModule {}

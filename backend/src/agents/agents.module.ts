import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BusinessBrainModule } from '../business-brain/business-brain.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { AiVisibilityModule } from '../ai-visibility/ai-visibility.module';
import { ActionsModule } from '../actions/actions.module';
import { ComparisonModule } from '../comparison/comparison.module';
import { GoogleModule } from '../google/google.module';
import { ReportsModule } from '../reports/reports.module';
import { LocalSeoModule } from '../local-seo/local-seo.module';
import { ContentModule } from '../content/content.module';
import { BacklinksModule } from '../backlinks/backlinks.module';

import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    BusinessBrainModule,
    RecommendationsModule,
    MonitoringModule,
    AiVisibilityModule,
    ActionsModule,
    ComparisonModule,
    GoogleModule,
    ReportsModule,
    LocalSeoModule,
    ContentModule,
    BacklinksModule,
  ],
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}

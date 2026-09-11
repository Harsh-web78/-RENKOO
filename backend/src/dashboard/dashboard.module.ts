import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { GoogleModule } from '../google/google.module';
import { AiVisibilityModule } from '../ai-visibility/ai-visibility.module';
import { ContentModule } from '../content/content.module';
import { WebsitesModule } from '../websites/websites.module';
import { CompetitorsModule } from '../competitors/competitors.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { KeywordsModule } from '../keywords/keywords.module';
import { BusinessBrainModule } from '../business-brain/business-brain.module';

import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ActivationService } from './activation.service';
import { FirstValueController } from './first-value.controller';
import { FirstValueService } from './first-value.service';
import { TelemetryService } from './telemetry.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    GoogleModule,
    AiVisibilityModule,
    ContentModule,
    WebsitesModule,
    CompetitorsModule,
    MonitoringModule,
    KeywordsModule,
    BusinessBrainModule,
  ],
  controllers: [
    DashboardController,
    FirstValueController,
  ],
  providers: [
    DashboardService,
    ActivationService,
    FirstValueService,
    TelemetryService,
  ],
  exports: [
    DashboardService,
    ActivationService,
    FirstValueService,
    TelemetryService,
  ],
})
export class DashboardModule {}
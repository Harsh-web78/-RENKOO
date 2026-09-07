import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { GoogleModule } from '../google/google.module';
import { AiVisibilityModule } from '../ai-visibility/ai-visibility.module';
import { ContentModule } from '../content/content.module';
import { WebsitesModule } from '../websites/websites.module';
import { CompetitorsModule } from '../competitors/competitors.module';
import { MonitoringModule } from '../monitoring/monitoring.module';

import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

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
  ],
  controllers: [
    DashboardController,
  ],
  providers: [
    DashboardService,
  ],
  exports: [
    DashboardService,
  ],
})
export class DashboardModule {}
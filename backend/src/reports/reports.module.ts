import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { BillingModule } from '../billing/billing.module';
import { BusinessBrainModule } from '../business-brain/business-brain.module';
import { RoiModule } from '../roi/roi.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { AiVisibilityModule } from '../ai-visibility/ai-visibility.module';
import { LocalSeoModule } from '../local-seo/local-seo.module';
import { ContentModule } from '../content/content.module';
import { BacklinksModule } from '../backlinks/backlinks.module';

import { ReportsController } from './reports.controller';
import { ReportShareController } from './report-share.controller';
import { ReportsService } from './reports.service';
import { ClientsService } from './clients.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    EmailModule,
    BillingModule,
    BusinessBrainModule,
    RoiModule,
    RecommendationsModule,
    MonitoringModule,
    AiVisibilityModule,
    LocalSeoModule,
    ContentModule,
    BacklinksModule,
  ],
  controllers: [
    ReportsController,
    ReportShareController,
  ],
  providers: [
    ReportsService,
    ClientsService,
  ],
  exports: [
    ReportsService,
    ClientsService,
  ],
})
export class ReportsModule {}

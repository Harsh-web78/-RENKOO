import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { MonitoringModule } from '../monitoring/monitoring.module';

import { CrawlController } from './crawl.controller';
import { SeoIssueController } from './seo-issue.controller';
import { TechnicalSeoController } from './technical-seo.controller';

import { CrawlService } from './crawl.service';
import { CrawlAnalysisService } from './crawl-analysis.service';
import { SeoAuditService } from './seo-audit.service';
import { SeoIssueService } from './seo-issue.service';
import { RecommendationService } from './recommendation.service';
import { TechnicalSeoService } from './technical-seo.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    BillingModule,
    MonitoringModule,
  ],

  controllers: [
    CrawlController,
    SeoIssueController,
    TechnicalSeoController,
  ],

  providers: [
    CrawlService,
    CrawlAnalysisService,
    SeoAuditService,
    SeoIssueService,
    RecommendationService,
    TechnicalSeoService,
  ],
})
export class CrawlModule {}

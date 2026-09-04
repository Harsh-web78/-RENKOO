
import { MarketingSpendModule } from './marketing-spend/marketing-spend.module';
import { TeamModule } from './team/team.module';

import { Module } from '@nestjs/common';

import { ConfigModule } from '@nestjs/config';

import { APP_GUARD } from '@nestjs/core';

import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';


import { BillingModule } from './billing/billing.module';

import { AiVisibilityModule } from './ai-visibility/ai-visibility.module';

import { GoogleModule } from './google/google.module';

import { HealthModule } from './health/health.module';

import { PrismaModule } from './prisma/prisma.module';

import { AuthModule } from './auth/auth.module';

import { WebsitesModule } from './websites/websites.module';

import { CrawlModule } from './crawl/crawl.module';

import { ContentModule } from './content/content.module';

import { CompetitorsModule } from './competitors/competitors.module';

import { ComparisonModule } from './comparison/comparison.module';

import { KeywordsModule } from './keywords/keywords.module';

import { DashboardModule } from './dashboard/dashboard.module';

import { RecommendationsModule } from './recommendations/recommendations.module';

import { BacklinksModule } from './backlinks/backlinks.module';

import { ActionsModule } from './actions/actions.module';

import { LocalSeoModule } from './local-seo/local-seo.module';

import { RevenueModule } from './revenue/revenue.module';
import { RoiModule } from './roi/roi.module';

import { LeadsModule } from './leads/leads.module';

import { BusinessBrainModule } from './business-brain/business-brain.module';

import { GeoModule } from './geo/geo.module';

import { AeoModule } from './aeo/aeo.module';

@Module({
  imports: [
    MarketingSpendModule,
TeamModule, 
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 60,
      },
    ]),

    BillingModule,
    ActionsModule,
    LocalSeoModule,
    RevenueModule,
    
    RoiModule,
LeadsModule,
    BusinessBrainModule,
    GeoModule,
    AeoModule,
    BacklinksModule,
    RecommendationsModule,
    DashboardModule,
    KeywordsModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    WebsitesModule,
    CrawlModule,
    GoogleModule,
    ContentModule,
    CompetitorsModule,
    AiVisibilityModule,
    ComparisonModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}




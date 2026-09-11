import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { GoogleModule } from '../google/google.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AiVisibilityModule } from '../ai-visibility/ai-visibility.module';
import { CrawlModule } from '../crawl/crawl.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ActionsModule } from '../actions/actions.module';
import { MonitoringModule } from '../monitoring/monitoring.module';

import { KeywordsController } from './keywords.controller';
import { KeywordsService } from './keywords.service';
import { KeywordResearchService } from './keyword-research.service';
import { KeywordStrategyService } from './keyword-strategy.service';
import { ContentStrategyService } from './content-strategy.service';
import { SearchBaselineService } from './search-baseline.service';
import { SearchCaptureService } from './search-capture.service';
import { CommandCenterService } from './command-center.service';
import { SearchSurfacesService } from './search-surfaces.service';
import { CustomerDemandService } from './customer-demand.service';
import { CompetitiveIntelligenceService } from './competitive-intelligence.service';
import { KeywordDiagnosisService } from './keyword-diagnosis.service';
import { KeywordRoadmapService } from './keyword-roadmap.service';
import { EvidenceFusionService } from './evidence-fusion.service';
import { RankTrackingService } from './rank-tracking.service';
import { RankIntelligenceService } from './rank-intelligence.service';
import { SearchChangeService } from './search-change.service';
import { SchedulerSecretGuard } from '../ai-visibility/scheduler-secret.guard';
import { TopicIntelligenceService } from './topic-intelligence.service';
import { DataForSeoProvider } from './dataforseo.provider';
import { KeywordCacheService } from './keyword-cache.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    BillingModule,
    GoogleModule,
    AiVisibilityModule,
    CrawlModule,
    RecommendationsModule,
    IntegrationsModule,
    ActionsModule,
    MonitoringModule,
  ],

  controllers: [
    KeywordsController,
  ],

  providers: [
    KeywordsService,
    KeywordResearchService,
    KeywordStrategyService,
    ContentStrategyService,
    SearchBaselineService,
    SearchCaptureService,
    CommandCenterService,
    SearchSurfacesService,
    CustomerDemandService,
    CompetitiveIntelligenceService,
    KeywordDiagnosisService,
    KeywordRoadmapService,
    EvidenceFusionService,
    RankTrackingService,
    RankIntelligenceService,
    SearchChangeService,
    SchedulerSecretGuard,
    TopicIntelligenceService,
    DataForSeoProvider,
    KeywordCacheService,
  ],

  exports: [
    KeywordsService,
    KeywordResearchService,
    KeywordStrategyService,
    ContentStrategyService,
    SearchBaselineService,
    SearchCaptureService,
    CommandCenterService,
    SearchSurfacesService,
    CustomerDemandService,
    CompetitiveIntelligenceService,
    KeywordRoadmapService,
    EvidenceFusionService,
    RankTrackingService,
    RankIntelligenceService,
    SearchChangeService,
    TopicIntelligenceService,
  ],
})
export class KeywordsModule {}

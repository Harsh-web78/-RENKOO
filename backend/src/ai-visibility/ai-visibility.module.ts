import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BusinessBrainModule } from '../business-brain/business-brain.module';
import { BillingModule } from '../billing/billing.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { GoogleModule } from '../google/google.module';

import { AiVisibilityController } from './ai-visibility.controller';
import { AiMonitoringSchedulerController } from './ai-monitoring-scheduler.controller';
import { SchedulerSecretGuard } from './scheduler-secret.guard';
import { AiVisibilityService } from './ai-visibility.service';
import { AiCitationService } from './ai-citation.service';
import { AiPromptSetService } from './ai-prompt-set.service';
import { AiSearchIntelligenceService } from './ai-search-intelligence.service';
import { AiMonitoringService } from './ai-monitoring.service';
import { AiAgentAnalyticsService } from './ai-agent-analytics.service';
import { AiOfficialDataService } from './ai-official-data.service';
import { AiSearchOsService } from './ai-search-os.service';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { AiProviderRegistry } from './providers/provider.registry';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    BusinessBrainModule,
    BillingModule,
    MonitoringModule,
    GoogleModule,
  ],
  controllers: [
    AiVisibilityController,
    AiMonitoringSchedulerController,
  ],
  providers: [
    AiVisibilityService,
    SchedulerSecretGuard,
    AiCitationService,
    AiPromptSetService,
    AiSearchIntelligenceService,
    AiMonitoringService,
    AiAgentAnalyticsService,
    AiOfficialDataService,
    AiSearchOsService,
    GeminiProvider,
    OpenAiProvider,
    AiProviderRegistry,
  ],
  exports: [
    AiVisibilityService,
    AiCitationService,
    AiPromptSetService,
    AiSearchIntelligenceService,
    AiMonitoringService,
    AiAgentAnalyticsService,
    AiOfficialDataService,
    AiSearchOsService,
    AiProviderRegistry,
  ],
})
export class AiVisibilityModule {}

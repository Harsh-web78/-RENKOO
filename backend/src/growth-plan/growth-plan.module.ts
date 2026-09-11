import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { KeywordsModule } from '../keywords/keywords.module';
import { RoiModule } from '../roi/roi.module';
import { ActionsModule } from '../actions/actions.module';
import { GrowthPlanController } from './growth-plan.controller';
import { GrowthDecisionService } from './growth-plan.service';
import { GoalRoadmapService } from './goal-roadmap.service';
import { GrowthWorkController } from './growth-work.controller';
import { GrowthWorkService } from './growth-work.service';
import { GrowthOutcomeService } from './growth-outcome.service';
import { GrowthOutcomeController } from './growth-outcome.controller';
import { DecisionGapService } from './decision-gap.service';
import { DecisionGapController } from './decision-gap.controller';
import { SourceIntelligenceService } from './source-intelligence.service';
import { SourceIntelligenceController } from './source-intelligence.controller';

/*
 * Phase 34 — composition-only module. Reads bounded
 * datasets from Keywords (roadmap, fusion NBA, rank),
 * the MonitoringAlert table (dedupe-aware alerts) and
 * Roi (Phase 33 attribution). No tables, no providers,
 * no billing.
 */
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    KeywordsModule,
    RoiModule,
    ActionsModule,
  ],
  controllers: [GrowthPlanController, GrowthWorkController, GrowthOutcomeController, DecisionGapController, SourceIntelligenceController],
  providers: [GrowthDecisionService, GoalRoadmapService, GrowthWorkService, GrowthOutcomeService, DecisionGapService, SourceIntelligenceService],
  exports: [GrowthDecisionService, GoalRoadmapService, GrowthWorkService, GrowthOutcomeService, DecisionGapService, SourceIntelligenceService],
})
export class GrowthPlanModule {}

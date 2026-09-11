import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiVisibilityService } from './ai-visibility.service';
import { AiSearchIntelligenceService } from './ai-search-intelligence.service';
import { AiMonitoringService } from './ai-monitoring.service';
import { AiAgentAnalyticsService } from './ai-agent-analytics.service';
import { AiOfficialDataService } from './ai-official-data.service';
import { AiSearchOsService } from './ai-search-os.service';
import {
  CreateAiVisibilityQueryDto,
  UpdateAiVisibilityQueryDto,
} from './dto/ai-visibility-query.dto';
import { RecordAiCheckDto } from './dto/record-ai-check.dto';
import { RunAiCheckDto } from './dto/run-ai-check.dto';
import { GenerateAiPromptSetDto } from './dto/generate-prompt-set.dto';

@Controller('ai-visibility')
@UseGuards(JwtAuthGuard)
export class AiVisibilityController {
  constructor(
    private readonly aiVisibilityService: AiVisibilityService,
    private readonly aiSearchIntelligenceService: AiSearchIntelligenceService,
    private readonly aiMonitoringService: AiMonitoringService,
    private readonly aiAgentAnalyticsService: AiAgentAnalyticsService,
    private readonly aiOfficialDataService: AiOfficialDataService,
    private readonly aiSearchOsService: AiSearchOsService,
  ) {}

  @Get('dashboard')
  async dashboard(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.aiVisibilityService.getDashboard(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get('history')
  async history(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('days') days?: string,
  ) {
    return this.aiVisibilityService.getHistory(
      req.user.organizationId,
      websiteId,
      Number(days) || 30,
    );
  }

  @Post('snapshot')
  async snapshot(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.aiVisibilityService.createSnapshot(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get('intelligence')
  async intelligence(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.aiVisibilityService.getIntelligence(
      req.user.organizationId,
      websiteId,
    );
  }

  @Post('queries')
  async createQuery(
    @Req() req: any,
    @Body() dto: CreateAiVisibilityQueryDto,
  ) {
    return this.aiVisibilityService.createQuery(
      req.user.organizationId,
      dto,
    );
  }

  @Patch('queries/:id')
  async updateQuery(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateAiVisibilityQueryDto,
  ) {
    return this.aiVisibilityService.updateQuery(
      req.user.organizationId,
      id,
      dto,
    );
  }

  @Delete('queries/:id')
  async deleteQuery(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.aiVisibilityService.deleteQuery(
      req.user.organizationId,
      id,
    );
  }

  @Post('queries/suggest')
  async suggestQueries(
    @Req() req: any,
    @Body() body: { websiteId?: string },
  ) {
    return this.aiVisibilityService.suggestQueries(
      req.user.organizationId,
      String(body?.websiteId ?? ''),
    );
  }

  @Post('checks')
  async recordCheck(
    @Req() req: any,
    @Body() dto: RecordAiCheckDto,
  ) {
    return this.aiVisibilityService.recordCheck(
      req.user.organizationId,
      dto,
    );
  }

  /*
   * Connection honesty matrix: live providers
   * report real key presence; Perplexity /
   * Anthropic are declared NOT_CONFIGURED.
   */
  @Get('providers')
  async providerStates(@Req() req: any) {
    void req;

    return {
      providers:
        this.aiVisibilityService.listLiveProviderStates(),
      googleAiSearch: {
        id: 'GOOGLE_AI_SEARCH',
        displayName: 'Google AI Search',
        state: 'NOT_CONNECTED',
        reason:
          'Google AI Overview / AI Mode is not connected. Gemini API results are labeled GEMINI_RESPONSE and are never presented as Google Search output.',
      },
    };
  }

  /*
   * Manual controlled live execution of one
   * tracked or ad-hoc prompt against one
   * provider. Strictly rate-limited; each call
   * consumes one AI_SCANS unit via the
   * entitlement engine (LIMIT_REACHED enforced).
   */
  @Throttle({
    default: { limit: 10, ttl: 60000 },
  })
  @Post('checks/run')
  async runCheck(
    @Req() req: any,
    @Body() dto: RunAiCheckDto,
  ) {
    return this.aiVisibilityService.runCheck(
      req.user.organizationId,
      dto,
    );
  }

  /*
   * Phase 6 — AI Search Intelligence 1.0 (additive).
   * Deterministic generation + read-model intelligence
   * over existing AiVisibilityQuery/Check rows. No new
   * tables, no billing touch: generation is local-only.
   */
  @Post('prompt-sets/generate')
  async generatePromptSet(
    @Req() req: any,
    @Body() dto: GenerateAiPromptSetDto,
  ) {
    void req;

    return {
      prompts:
        this.aiSearchIntelligenceService.generatePromptSet(
          dto ?? {},
        ),
    };
  }

  @Get('comparison')
  async comparison(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.aiSearchIntelligenceService.getComparison(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get('citations')
  async citations(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.aiSearchIntelligenceService.getCitationReport(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get('diagnoses')
  async diagnoses(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.aiSearchIntelligenceService.getDiagnoses(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get('roadmap-candidates')
  async roadmapCandidates(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.aiSearchIntelligenceService.getRoadmapCandidates(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get('prompt-history')
  async promptHistory(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('days') days?: string,
  ) {
    return this.aiSearchIntelligenceService.getPromptHistory(
      req.user.organizationId,
      websiteId,
      Number(days) || 30,
    );
  }

  /*
   * Phase 6 — AI Search OS 1.0 (additive, composition
   * only). Command Center, Prompt Lab, prompt detail
   * and Opportunity → Recommendation run over existing
   * tables. No live provider calls here, so no billing
   * touch: execution metering stays in checks/run.
   */
  @Get('os/command-center')
  async osCommandCenter(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.aiSearchOsService.getCommandCenter(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get('os/prompt-lab')
  async osPromptLab(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('q') q?: string,
    @Query('intent') intent?: string,
    @Query('topic') topic?: string,
    @Query('stage') stage?: string,
    @Query('group') group?: string,
    @Query('competitor') competitor?: string,
    @Query('visibilityState') visibilityState?: string,
  ) {
    return this.aiSearchOsService.getPromptLab(
      req.user.organizationId,
      websiteId,
      {
        query: q,
        intent: (intent as never) ?? null,
        topic: topic ?? null,
        stage: (stage as never) ?? null,
        group: (group as never) ?? null,
        competitor: competitor ?? null,
        visibilityState: visibilityState ?? null,
      },
    );
  }

  @Get('os/prompts/detail')
  async osPromptDetail(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('prompt') prompt?: string,
  ) {
    return this.aiSearchOsService.getPromptDetail(
      req.user.organizationId,
      websiteId,
      String(prompt ?? ''),
    );
  }

  @Post('os/opportunities')
  async osCreateOpportunity(
    @Req() req: any,
    @Body()
    body: {
      websiteId?: string;
      kind?: string;
      title?: string;
      prompt?: string | null;
      topic?: string | null;
      targetPage?: string | null;
      priority?: 'HIGH' | 'MEDIUM' | 'LOW';
      why?: string | null;
    },
  ) {
    return this.aiSearchOsService.createOpportunityRecommendation(
      req.user.organizationId,
      {
        websiteId: String(body?.websiteId ?? ''),
        kind: String(body?.kind ?? 'AI_CONTENT_GAP'),
        title: String(body?.title ?? ''),
        prompt: body?.prompt ?? null,
        topic: body?.topic ?? null,
        targetPage: body?.targetPage ?? null,
        priority: body?.priority ?? 'MEDIUM',
        why: body?.why ?? null,
      },
    );
  }

  /*
   * Phase 7 — AI Prompt Monitoring 1.0 (additive).
   * Schedule + run ledger over the append-only
   * AiVisibilityCheck history. JWT + organization +
   * website ownership on every route. Live execution
   * reuses the provider registry; billing is
   * consume-on-success (failures never charged).
   */
  @Get('monitoring/status')
  async monitoringStatus(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.aiMonitoringService.getStatus(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get('monitoring/schedules')
  async monitoringSchedules(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.aiMonitoringService.listSchedules(
      req.user.organizationId,
      websiteId,
    );
  }

  @Post('monitoring/schedules')
  async monitoringCreateSchedule(
    @Req() req: any,
    @Body()
    body: {
      websiteId?: string;
      name?: string;
      surfaces?: string[];
      country?: string;
      language?: string;
      cadence?: string;
      timezone?: string;
    },
  ) {
    return this.aiMonitoringService.createSchedule(
      req.user.organizationId,
      req.user.id ?? req.user.sub ?? 'unknown',
      {
        websiteId: String(body?.websiteId ?? ''),
        name: body?.name,
        surfaces: body?.surfaces,
        country: body?.country,
        language: body?.language,
        cadence: body?.cadence,
        timezone: body?.timezone,
      },
    );
  }

  @Patch('monitoring/schedules/:id')
  async monitoringUpdateSchedule(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      surfaces?: string[];
      cadence?: string;
      isActive?: boolean;
      timezone?: string;
    },
  ) {
    return this.aiMonitoringService.updateSchedule(
      req.user.organizationId,
      id,
      body ?? {},
    );
  }

  @Delete('monitoring/schedules/:id')
  async monitoringDeleteSchedule(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.aiMonitoringService.deleteSchedule(
      req.user.organizationId,
      id,
    );
  }

  @Post('monitoring/estimate')
  async monitoringEstimate(
    @Req() req: any,
    @Body()
    body: {
      websiteId?: string;
      surfaces?: string[];
      country?: string;
      language?: string;
    },
  ) {
    return this.aiMonitoringService.estimate(
      req.user.organizationId,
      String(body?.websiteId ?? ''),
      {
        surfaces: body?.surfaces,
        country: body?.country,
        language: body?.language,
      },
    );
  }

  @Post('monitoring/runs/due')
  async monitoringRunDue(@Req() req: any) {
    void req;
    return this.aiMonitoringService.runDueSchedules();
  }

  @Post('monitoring/runs')
  async monitoringRequestRun(
    @Req() req: any,
    @Body()
    body: {
      websiteId?: string;
      scheduleId?: string;
      surfaces?: string[];
      country?: string;
      language?: string;
    },
  ) {
    return this.aiMonitoringService.requestRun(
      req.user.organizationId,
      {
        websiteId: String(body?.websiteId ?? ''),
        scheduleId: body?.scheduleId,
        surfaces: body?.surfaces,
        country: body?.country,
        language: body?.language,
        origin: 'MANUAL',
      },
    );
  }

  @Get('monitoring/runs')
  async monitoringRuns(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.aiMonitoringService.listRuns(
      req.user.organizationId,
      websiteId,
      Number(page) || 1,
      Number(pageSize) || 20,
    );
  }

  @Get('monitoring/runs/:id')
  async monitoringRun(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.aiMonitoringService.getRun(
      req.user.organizationId,
      id,
    );
  }

  @Post('monitoring/runs/:id/cancel')
  async monitoringCancelRun(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.aiMonitoringService.cancelRun(
      req.user.organizationId,
      id,
    );
  }

  @Get('monitoring/changes')
  async monitoringChanges(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('runId') runId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.aiMonitoringService.getChanges(
      req.user.organizationId,
      websiteId,
      {
        runId: runId || undefined,
        page: Number(page) || 1,
        pageSize: Number(pageSize) || 20,
      },
    );
  }

  @Get('monitoring/history')
  async monitoringHistory(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('days') days?: string,
    @Query('surface') surface?: string,
  ) {
    const parsed = Number(days);
    return this.aiMonitoringService.getHistory(
      req.user.organizationId,
      websiteId,
      {
        days: (parsed === 7 || parsed === 90 ? parsed : 30) as
          | 7
          | 30
          | 90,
        surface: surface || undefined,
      },
    );
  }

  @Get('monitoring/prompts/history')
  async monitoringPromptHistory(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('prompt') prompt?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.aiMonitoringService.getPromptHistory(
      req.user.organizationId,
      websiteId,
      String(prompt ?? ''),
      Number(page) || 1,
      Number(pageSize) || 20,
    );
  }

  /*
   * Phase 8A — production health + run observability
   * (additive, JWT tenant-scoped). Extends the
   * MonitoringService-based alerting already in use —
   * never a second monitoring system, never a fake
   * health percentage.
   */
  @Get('monitoring/health')
  async monitoringHealth(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.aiMonitoringService.getMonitoringHealth(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get('monitoring/runs/:id/observability')
  async monitoringRunObservability(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.aiMonitoringService.getRunObservability(
      req.user.organizationId,
      id,
    );
  }

  /*
   * Phase 8C — official Google/Bing data (additive).
   * Only genuinely exposed capabilities are ingested:
   * GSC Search Analytics API (VERIFIED organic demand)
   * and user-exported UI rows (OBSERVED manual imports).
   * Missing official APIs surface as UNAVAILABLE —
   * never scraped, never invented. JWT + organization
   * + website ownership on every route.
   */
  @Get('official/capabilities')
  async officialCapabilities() {
    return this.aiOfficialDataService.getCapabilities();
  }

  @Post('official/google/sync')
  async officialGoogleSync(
    @Req() req: any,
    @Body()
    body: {
      websiteId?: string;
      days?: number;
    },
  ) {
    const days = Number(body?.days);
    return this.aiOfficialDataService.syncGoogleDemand(
      req.user.organizationId,
      String(body?.websiteId ?? ''),
      (days === 90 ? 90 : 30) as 30 | 90,
    );
  }

  @Post('official/import')
  async officialImport(
    @Req() req: any,
    @Body()
    body: {
      websiteId?: string;
      provider?: string;
      rows?: unknown;
    },
  ) {
    return this.aiOfficialDataService.importRows(
      req.user.organizationId,
      String(body?.websiteId ?? ''),
      String(body?.provider ?? 'GOOGLE'),
      body?.rows,
    );
  }

  @Get('official/history')
  async officialHistory(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('provider') provider?: string,
    @Query('kind') kind?: string,
    @Query('days') days?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.aiOfficialDataService.getHistory(
      req.user.organizationId,
      websiteId,
      {
        provider: provider || undefined,
        kind: kind || undefined,
        days: Number(days) || 90,
        page: Number(page) || 1,
        pageSize: Number(pageSize) || 20,
      },
    );
  }

  @Get('official/summary')
  async officialSummary(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.aiOfficialDataService.getSummary(
      req.user.organizationId,
      websiteId,
    );
  }

  /*
   * Phase 8D — AI crawler + agent analytics (additive).
   * First-party imported log evidence only. Imports
   * and aggregation are free (no AI_SCAN/AI_CREDITS).
   * JWT + organization + website ownership on every
   * route. A visit is never a citation, mention,
   * ranking, traffic or conversion signal.
   */
  @Post('agents/import/preview')
  async agentImportPreview(
    @Body()
    body: {
      csv?: string;
      source?: string;
    },
  ) {
    return this.aiAgentAnalyticsService.previewImport(
      String(body?.csv ?? ''),
      String(body?.source ?? 'MANUAL_IMPORT'),
    );
  }

  @Post('agents/import')
  async agentImport(
    @Req() req: any,
    @Body()
    body: {
      websiteId?: string;
      csv?: string;
      source?: string;
      fileName?: string;
    },
  ) {
    return this.aiAgentAnalyticsService.confirmImport(
      req.user.organizationId,
      String(body?.websiteId ?? ''),
      String(body?.csv ?? ''),
      String(body?.source ?? 'MANUAL_IMPORT'),
      body?.fileName,
    );
  }

  @Get('agents/activity')
  async agentActivity(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('days') days?: string,
  ) {
    const parsed = Number(days);
    return this.aiAgentAnalyticsService.getActivity(
      req.user.organizationId,
      websiteId,
      (parsed === 7 || parsed === 90 ? parsed : 30) as
        | 7
        | 30
        | 90,
    );
  }

  @Get('agents/coverage')
  async agentCoverage(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.aiAgentAnalyticsService.getCoverage(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get('agents/history')
  async agentHistory(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('days') days?: string,
  ) {
    const parsed = Number(days);
    return this.aiAgentAnalyticsService.getHistory(
      req.user.organizationId,
      websiteId,
      (parsed === 7 || parsed === 90 ? parsed : 30) as
        | 7
        | 30
        | 90,
    );
  }

  @Get('agents/detail')
  async agentDetail(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('family') family?: string,
    @Query('days') days?: string,
  ) {
    const parsed = Number(days);
    return this.aiAgentAnalyticsService.getAgentDetail(
      req.user.organizationId,
      websiteId,
      String(family ?? ''),
      (parsed === 7 || parsed === 90 ? parsed : 30) as
        | 7
        | 30
        | 90,
    );
  }

  @Post('agents/opportunities')
  async agentOpportunities(
    @Req() req: any,
    @Body() body: { websiteId?: string },
  ) {
    return this.aiAgentAnalyticsService.bridgeOpportunities(
      req.user.organizationId,
      String(body?.websiteId ?? ''),
    );
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
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
import { DataForSeoError } from './dataforseo.client';
import { providerCapabilities } from './keyword-data-provider';

/*
 * Provider failures surface as explicit HTTP statuses —
 * never fake zeros. 503 = not configured, 422 = bad key,
 * 429 = rate/quota, 504 = timeout, 502 = provider error.
 * All other exceptions pass through untouched.
 */
function providerStatus(
  code: string,
): number {
  switch (code) {
    case 'PROVIDER_NOT_CONFIGURED':
      return HttpStatus.SERVICE_UNAVAILABLE;
    case 'INVALID_PROVIDER_KEY':
      return HttpStatus.UNPROCESSABLE_ENTITY;
    case 'RATE_LIMITED':
    case 'QUOTA_EXCEEDED':
      return HttpStatus.TOO_MANY_REQUESTS;
    case 'PROVIDER_TIMEOUT':
      return HttpStatus.GATEWAY_TIMEOUT;
    default:
      return HttpStatus.BAD_GATEWAY;
  }
}

async function translateProvider<T>(
  fn: Promise<T>,
): Promise<T> {
  try {
    return await fn;
  } catch (err) {
    if (err instanceof DataForSeoError) {
      throw new HttpException(
        {
          code: err.code,
          message: err.message,
        },
        providerStatus(err.code),
      );
    }
    throw err;
  }
}
import {
  ClusterKeywordsDto,
  CompetitorLookupDto,
  DiagnoseBatchDto,
  QuickWinsDto,
  ResearchKeywordsDto,
  SerpClusterDto,
  SerpQueryDto,
  StrategyBriefDto,
  StrategyDto,
  StrategyLinkSyncDto,
} from './dto/keyword-research.dto';

@Controller('keywords')
@UseGuards(JwtAuthGuard)
export class KeywordsController {
  constructor(
    private readonly keywordsService: KeywordsService,
    private readonly researchService: KeywordResearchService,
    private readonly strategyService: KeywordStrategyService,
    private readonly contentStrategyService: ContentStrategyService,
    private readonly searchBaselineService: SearchBaselineService,
    private readonly diagnosisService: KeywordDiagnosisService,
    private readonly roadmapService: KeywordRoadmapService,
    private readonly fusionService: EvidenceFusionService,
    private readonly rankService: RankTrackingService,
    private readonly rankIntelligenceService: RankIntelligenceService,
    private readonly searchChangeService: SearchChangeService,
    private readonly topicService: TopicIntelligenceService,
    private readonly searchCaptureService: SearchCaptureService,
    private readonly commandCenterService: CommandCenterService,
    private readonly searchSurfacesService: SearchSurfacesService,
    private readonly customerDemandService: CustomerDemandService,
    private readonly competitiveService: CompetitiveIntelligenceService,
  ) {}

  // =========================================================
  // PROVIDER CAPABILITIES + METRIC AVAILABILITY
  // GET /api/keywords/providers
  // =========================================================

  @Get('providers')
  providers() {
    return providerCapabilities();
  }

  // =========================================================
  // KEYWORD RESEARCH (real corpus only, no fake metrics)
  // POST /api/keywords/research
  // =========================================================

  @Post('research')
  research(
    @Req() req: any,
    @Body() dto: ResearchKeywordsDto,
  ) {
    return translateProvider(
      this.researchService.research(
        req.user.organizationId,
        {
          websiteId: dto.websiteId,
          seed: dto.seed,
          mode: dto.mode ?? 'keyword',
          country: dto.country,
          language: dto.language,
          limit: dto.limit ?? 100,
          refresh: dto.refresh ?? false,
        },
      ),
    );
  }

  // =========================================================
  // SERP INTELLIGENCE (on demand per keyword, cached)
  // POST /api/keywords/serp
  // =========================================================

  @Post('serp')
  serp(
    @Req() req: any,
    @Body() dto: SerpQueryDto,
  ) {
    return translateProvider(
      this.researchService.serp(
        req.user.organizationId,
        dto.keyword,
        dto.country,
        dto.language,
        dto.refresh ?? false,
        dto.websiteId,
      ),
    );
  }

  // =========================================================
  // COMPETITOR LOOKUP (real ranking keywords + gap)
  // POST /api/keywords/competitor
  // =========================================================

  @Post('competitor')
  competitor(
    @Req() req: any,
    @Body() dto: CompetitorLookupDto,
  ) {
    return translateProvider(
      this.researchService.competitorLookup(
        req.user.organizationId,
        {
          websiteId: dto.websiteId,
          domain: dto.domain,
          country: dto.country,
          language: dto.language,
          limit: dto.limit ?? 100,
          refresh: dto.refresh ?? false,
          includeSerpStrength:
            dto.includeSerpStrength ?? 0,
        },
      ),
    );
  }

  // =========================================================
  // QUICK WINS 2.0 (GSC striking distance x provider data)
  // POST /api/keywords/quick-wins
  // =========================================================

  @Post('quick-wins')
  quickWins(
    @Req() req: any,
    @Body() dto: QuickWinsDto,
  ) {
    return translateProvider(
      this.researchService.quickWins(
        req.user.organizationId,
        {
          websiteId: dto.websiteId,
          startDate: dto.startDate,
          endDate: dto.endDate,
          country: dto.country,
          language: dto.language,
          limit: dto.limit ?? 50,
        },
      ),
    );
  }

  // =========================================================
  // PROVIDER USAGE (cost transparency for the UI)
  // GET /api/keywords/usage
  // =========================================================

  @Get('usage')
  usage(@Req() req: any) {
    return this.researchService.usage(
      req.user.organizationId,
    );
  }

  // =========================================================
  // KEYWORD CLUSTERING
  // POST /api/keywords/clusters
  // =========================================================

  @Post('clusters')
  clusters(@Body() dto: ClusterKeywordsDto) {
    return {
      basis:
        'RENKOO semantic fallback (token overlap + parent topic + intent). For SERP-overlap clustering use POST /keywords/serp/cluster.',
      clusters: this.researchService.cluster(
        dto.keywords ?? [],
      ),
    };
  }

  // =========================================================
  // SERP-SIMILARITY CLUSTERING (bulk job, cost-guarded)
  // POST /api/keywords/serp/cluster
  // =========================================================

  @Post('serp/cluster')
  serpCluster(
    @Req() req: any,
    @Body() dto: SerpClusterDto,
  ) {
    return translateProvider(
      this.researchService.clusterBySerp(
        req.user.organizationId,
        {
          websiteId: dto.websiteId,
          keywords: dto.keywords ?? [],
          country: dto.country,
          language: dto.language,
          maxSerp: dto.maxSerp ?? 25,
          threshold: dto.threshold,
          refresh: dto.refresh ?? false,
        },
      ),
    );
  }

  // =========================================================
  // STRATEGY INTELLIGENCE (deterministic, zero provider
  // cost — GSC + crawl + cache-only provider reads)
  // POST /api/keywords/strategy
  // =========================================================

  @Post('strategy')
  strategy(
    @Req() req: any,
    @Body() dto: StrategyDto,
  ) {
    return this.strategyService.strategy(
      req.user.organizationId,
      {
        websiteId: dto.websiteId,
        startDate: dto.startDate,
        endDate: dto.endDate,
        country: dto.country,
        language: dto.language,
        limit: dto.limit ?? 100,
      },
    );
  }

  // =========================================================
  // AI STRATEGIST BRIEF (evidence-only LLM layer, gated on
  // AI_CREDITS / shared free AI allowance)
  // POST /api/keywords/strategy/brief
  // =========================================================

  @Post('strategy/brief')
  strategyBrief(
    @Req() req: any,
    @Body() dto: StrategyBriefDto,
  ) {
    return this.strategyService.strategyBrief(
      req.user.organizationId,
      {
        websiteId: dto.websiteId,
        provider: dto.provider,
        keywords: dto.keywords ?? [],
        maxItems: dto.maxItems ?? 8,
        startDate: dto.startDate,
        endDate: dto.endDate,
        country: dto.country,
        language: dto.language,
      },
    );
  }

  // =========================================================
  // SAVED STRATEGY BRIEFS
  // GET /api/keywords/strategy/briefs?websiteId=
  // =========================================================

  @Get('strategy/briefs')
  strategyBriefs(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.strategyService.listBriefs(
      req.user.organizationId,
      websiteId,
    );
  }

  // =========================================================
  // CONTENT STRATEGY FOUNDATION 6.0 — persistence +
  // composition (reads existing intelligence, never
  // recomputes scores; writes are idempotent upserts).
  // GET /api/keywords/strategy/links?websiteId=
  // GET /api/keywords/strategy/content-opportunities?websiteId=
  // =========================================================

  @Get('strategy/links')
  strategyLinks(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    if (!websiteId) {
      throw new BadRequestException(
        'websiteId is required',
      );
    }
    return this.contentStrategyService.getLinks(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get('strategy/content-opportunities')
  strategyContentOpportunities(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('country') country?: string,
    @Query('language') language?: string,
    @Query('limit') limit?: string,
  ) {
    if (!websiteId) {
      throw new BadRequestException(
        'websiteId is required',
      );
    }
    const parsed = Number(limit);
    return this.contentStrategyService.getContentOpportunities(
      req.user.organizationId,
      {
        websiteId,
        startDate,
        endDate,
        country,
        language,
        limit: Number.isFinite(parsed)
          ? parsed
          : 100,
      },
    );
  }

  // =========================================================
  // INTERNAL LINK RECOMMENDER 6.0 Phase 2A (deterministic,
  // existing data only — no link graph, no provider calls).
  // GET  /api/keywords/strategy/link-recommendations?websiteId=&keyword=&targetUrl=&limit=
  // POST /api/keywords/strategy/link-recommendations/sync
  // =========================================================

  @Get('strategy/link-recommendations')
  strategyLinkRecommendations(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('keyword') keyword?: string,
    @Query('targetUrl') targetUrl?: string,
    @Query('limit') limit?: string,
  ) {
    if (!websiteId) {
      throw new BadRequestException(
        'websiteId is required',
      );
    }
    const parsed = Number(limit);
    return this.contentStrategyService.getLinkRecommendations(
      req.user.organizationId,
      websiteId,
      {
        keyword,
        targetUrl,
        limit: Number.isFinite(parsed)
          ? parsed
          : 20,
      },
    );
  }

  @Post('strategy/link-recommendations/sync')
  syncStrategyLinkRecommendations(
    @Req() req: any,
    @Body() dto: StrategyLinkSyncDto,
  ) {
    return this.contentStrategyService.syncLinkRecommendations(
      req.user.organizationId,
      dto.websiteId,
      { limit: dto.limit ?? 50 },
    );
  }

  // =========================================================
  // POTENTIAL ORPHANS 6.0 Phase 2C (factual candidates from
  // the CrawlLink graph + existing Strategy evidence — no
  // new score, POTENTIAL_ORPHAN label only).
  // GET /api/keywords/strategy/orphan-candidates?websiteId=&limit=
  // =========================================================

  @Get('strategy/orphan-candidates')
  orphanCandidates(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('limit') limit?: string,
  ) {
    if (!websiteId) {
      throw new BadRequestException(
        'websiteId is required',
      );
    }
    const parsed = Number(limit);
    return this.contentStrategyService.getOrphanIntelligence(
      req.user.organizationId,
      websiteId,
      {
        limit: Number.isFinite(parsed)
          ? parsed
          : 20,
      },
    );
  }

  // =========================================================
  // SEARCH BASELINE 1.0 — canonical "Where am I now?"
  // composition (one request: GSC PoP + strategy +
  // content + crawl evidence, each leg degrades alone).
  // GET /api/keywords/baseline?websiteId=&days=
  // =========================================================

  @Get('baseline')
  baseline(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('days') days?: string,
  ) {
    if (!websiteId) {
      throw new BadRequestException(
        'websiteId is required',
      );
    }
    const parsed = Number(days);
    return this.searchBaselineService.getBaseline(
      req.user.organizationId,
      {
        websiteId,
        days: Number.isFinite(parsed)
          ? parsed
          : 28,
      },
    );
  }

  // =========================================================
  // ZERO-CLICK + COMMERCIAL SEARCH INTELLIGENCE 1.0
  // (Phase 16) — read-only composition over GSC windows +
  // strategy links + SERP cache + rank + AI checks +
  // outcome evidence. No provider calls, no new scores,
  // charged:false. Low CTR is never proven zero-click.
  // GET /api/keywords/zero-click?websiteId=&days=
  // GET /api/keywords/zero-click/query?websiteId=&query=&days=
  // =========================================================

  @Get('zero-click')
  zeroClick(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('days') days?: string,
  ) {
    if (!websiteId) {
      throw new BadRequestException(
        'websiteId is required',
      );
    }
    const parsed = Number(days);
    return this.searchCaptureService.getSearchCapture(
      req.user.organizationId,
      websiteId,
      Number.isFinite(parsed) ? parsed : 28,
    );
  }

  @Get('zero-click/query')
  zeroClickQuery(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('query') query: string,
    @Query('days') days?: string,
  ) {
    if (!websiteId) {
      throw new BadRequestException(
        'websiteId is required',
      );
    }
    if (!query) {
      throw new BadRequestException('query is required');
    }
    const parsed = Number(days);
    return this.searchCaptureService.getQueryCapture(
      req.user.organizationId,
      websiteId,
      query,
      Number.isFinite(parsed) ? parsed : 28,
    );
  }

  // =========================================================
  // SEARCH OPPORTUNITY COMMAND CENTER 1.0 (Phase 17) —
  // composition + decision over existing priorities.
  // Top 5 opinionated opportunities, do-this-first, what
  // changed, at risk, working, funnel, health. No new
  // scores, no provider calls, charged:false.
  // GET /api/keywords/command-center?websiteId=&days=
  // =========================================================

  @Get('command-center')
  commandCenter(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('days') days?: string,
  ) {
    if (!websiteId) {
      throw new BadRequestException(
        'websiteId is required',
      );
    }
    const parsed = Number(days);
    return this.commandCenterService.getCommandCenter(
      req.user.organizationId,
      websiteId,
      Number.isFinite(parsed) ? parsed : 28,
    );
  }

  // =========================================================
  // SEARCH EVERYWHERE 1.0 (Phase 22) — cross-surface
  // composition over persisted evidence. No provider
  // calls on reads, no scores, charged:false.
  // GET /api/keywords/search/surfaces?websiteId=&days=
  // GET /api/keywords/search/surfaces/query?websiteId=&query=
  // GET /api/keywords/search/surfaces/topic?websiteId=&topic=
  // =========================================================

  @Get('search/surfaces')
  searchSurfaces(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('days') days?: string,
  ) {
    if (!websiteId) {
      throw new BadRequestException(
        'websiteId is required',
      );
    }
    const parsed = Number(days);
    return this.searchSurfacesService.getSurfaceSummary(
      req.user.organizationId,
      websiteId,
      Number.isFinite(parsed) ? parsed : 28,
    );
  }

  @Get('search/surfaces/query')
  searchSurfaceQuery(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('query') query: string,
    @Query('days') days?: string,
  ) {
    if (!websiteId) {
      throw new BadRequestException(
        'websiteId is required',
      );
    }
    if (!query) {
      throw new BadRequestException('query is required');
    }
    const parsed = Number(days);
    return this.searchSurfacesService.getSurfaceQuery(
      req.user.organizationId,
      websiteId,
      query,
      Number.isFinite(parsed) ? parsed : 28,
    );
  }

  @Get('search/surfaces/topic')
  searchSurfaceTopic(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('topic') topic: string,
    @Query('days') days?: string,
  ) {
    if (!websiteId) {
      throw new BadRequestException(
        'websiteId is required',
      );
    }
    if (!topic) {
      throw new BadRequestException('topic is required');
    }
    const parsed = Number(days);
    return this.searchSurfacesService.getSurfaceTopic(
      req.user.organizationId,
      websiteId,
      topic,
      Number.isFinite(parsed) ? parsed : 28,
    );
  }

  // =========================================================
  // WHY-NOT-#1 DIAGNOSIS 1.0 — evidence-backed "why am I
  // not ranking higher" for one keyword or a bounded
  // batch. Composes GSC + strategy + SERP cache + crawl +
  // links; scores nothing new.
  // GET  /api/keywords/diagnose?websiteId=&keyword=
  // POST /api/keywords/diagnose/batch
  // =========================================================

  @Get('diagnose')
  diagnose(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('keyword') keyword: string,
    @Query('country') country?: string,
    @Query('language') language?: string,
  ) {
    if (!websiteId) {
      throw new BadRequestException(
        'websiteId is required',
      );
    }
    return this.diagnosisService.diagnose(
      req.user.organizationId,
      { websiteId, keyword: keyword ?? '', country, language },
    );
  }

  @Post('diagnose/batch')
  diagnoseBatch(
    @Req() req: any,
    @Body() dto: DiagnoseBatchDto,
  ) {
    return this.diagnosisService.diagnoseBatch(
      req.user.organizationId,
      {
        websiteId: dto.websiteId,
        keywords: dto.keywords ?? [],
        limit: dto.limit ?? 5,
        country: dto.country,
        language: dto.language,
      },
    );
  }

  // =========================================================
  // SEARCH GROWTH ROADMAP 1.0 — "What exactly should I do
  // next?" composition (strategy + diagnosis + content +
  // links + recommendations + actions + crawl blockers;
  // scores nothing new, guarantees nothing).
  // GET /api/keywords/roadmap?websiteId=&keyword=&page=&topic=&limit=
  // NOTE: static route declared before ':websiteId/*'
  // param routes so it is never shadowed.
  // =========================================================

  @Get('roadmap')
  roadmap(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('topic') topic?: string,
    @Query('limit') limit?: string,
  ) {
    if (!websiteId) {
      throw new BadRequestException(
        'websiteId is required',
      );
    }
    const parsed = Number(limit);
    return this.roadmapService.getRoadmap(
      req.user.organizationId,
      {
        websiteId,
        keyword,
        page,
        topic,
        limit: Number.isFinite(parsed) ? parsed : 50,
      },
    );
  }

  /*
   * Phase 12 — Topic Intelligence (additive composition).
   * One bounded read-only wave over existing systems:
   * strategy + content + ranks + AI monitoring +
   * competitors + Business Brain + fusion NBA. No
   * provider calls, no AI credits, no new scores.
   * NOTE: static route declared before ':websiteId/*'
   * param routes so it is never shadowed.
   */
  @Get('topic-intelligence')
  topicIntelligence(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('query') query?: string,
    @Query('days') days?: string,
  ) {
    if (!websiteId) {
      throw new BadRequestException(
        'websiteId is required',
      );
    }
    return this.topicService.getTopic(
      req.user.organizationId,
      {
        websiteId,
        query: query ?? '',
        days: Number(days) || 30,
      },
    );
  }

  // =========================================================
  // CUSTOMER DEMAND 2.0 (Phase 24) — need → journey →
  // decision coverage over observed queries and prompts.
  // Deterministic rules first; patterns not targets.
  // GET /api/keywords/customer-needs?websiteId=
  // NOTE: static routes declared before ':websiteId/*'.
  // =========================================================

  @Get('customer-needs')
  customerNeeds(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('days') days?: string,
  ) {
    if (!websiteId) {
      throw new BadRequestException(
        'websiteId is required',
      );
    }
    const parsed = Number(days);
    return this.customerDemandService.getCustomerNeeds(
      req.user.organizationId,
      websiteId,
      Number.isFinite(parsed) ? parsed : 28,
    );
  }

  @Get('customer-needs/query')
  customerNeedQuery(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('query') query: string,
    @Query('days') days?: string,
  ) {
    if (!websiteId) {
      throw new BadRequestException(
        'websiteId is required',
      );
    }
    if (!query) {
      throw new BadRequestException('query is required');
    }
    const parsed = Number(days);
    return this.customerDemandService.getNeedQuery(
      req.user.organizationId,
      websiteId,
      query,
      Number.isFinite(parsed) ? parsed : 28,
    );
  }

  @Get('customer-needs/topic')
  customerNeedTopic(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('topic') topic: string,
    @Query('days') days?: string,
  ) {
    if (!websiteId) {
      throw new BadRequestException(
        'websiteId is required',
      );
    }
    if (!topic) {
      throw new BadRequestException('topic is required');
    }
    const parsed = Number(days);
    return this.customerDemandService.getNeedTopic(
      req.user.organizationId,
      websiteId,
      topic,
      Number.isFinite(parsed) ? parsed : 28,
    );
  }

  // =========================================================
  // COMPETITIVE INTELLIGENCE 1.0 (Phase 27) — observed
  // competitor presence across needs, surfaces, claims.
  // Never superiority, dominance, share or causation.
  // GET /api/keywords/competitive-intelligence?websiteId=
  // NOTE: static routes declared before ':websiteId/*'.
  // =========================================================

  @Get('competitive-intelligence')
  competitiveIntelligence(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('days') days?: string,
  ) {
    if (!websiteId) {
      throw new BadRequestException(
        'websiteId is required',
      );
    }
    const parsed = Number(days);
    return this.competitiveService.getCompetitiveSummary(
      req.user.organizationId,
      websiteId,
      Number.isFinite(parsed) ? parsed : 28,
    );
  }

  @Get('competitive-intelligence/competitor')
  competitiveDetail(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('competitor') competitor: string,
  ) {
    if (!websiteId) {
      throw new BadRequestException(
        'websiteId is required',
      );
    }
    if (!competitor) {
      throw new BadRequestException(
        'competitor is required',
      );
    }
    return this.competitiveService.getCompetitorDetail(
      req.user.organizationId,
      websiteId,
      competitor,
    );
  }

  @Get('competitive-intelligence/need')
  competitiveNeed(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('needKey') needKey: string,
  ) {
    if (!websiteId) {
      throw new BadRequestException(
        'websiteId is required',
      );
    }
    if (!needKey) {
      throw new BadRequestException(
        'needKey is required',
      );
    }
    return this.competitiveService.getNeedCompetition(
      req.user.organizationId,
      websiteId,
      needKey,
    );
  }

  @Get('competitive-intelligence/query')
  competitiveQuery(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('query') query: string,
  ) {
    if (!websiteId) {
      throw new BadRequestException(
        'websiteId is required',
      );
    }
    if (!query) {
      throw new BadRequestException('query is required');
    }
    return this.competitiveService.getQueryCompetition(
      req.user.organizationId,
      websiteId,
      query,
    );
  }

  // =========================================================
  // KEYWORD UNIVERSE (browse without a seed)
  // GET /api/keywords/:websiteId/universe
  // =========================================================

  @Get(':websiteId/universe')
  universe(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number(limit);
    return this.researchService.universe(
      req.user.organizationId,
      websiteId,
      Number.isFinite(parsed) ? parsed : 100,
    );
  }

  // =========================================================
  // WEBSITE KEYWORD ANALYSIS
  // GET /api/keywords/:websiteId/analyze
  // =========================================================

  @Get(':websiteId/analyze')
  analyze(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.keywordsService.analyze(
      req.user.organizationId,
      websiteId,
    );
  }

  // =========================================================
  // KEYWORD GAP
  // GET /api/keywords/:websiteId/gap/:competitorId
  // =========================================================

  @Get(':websiteId/gap/:competitorId')
  gap(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Param('competitorId') competitorId: string,
  ) {
    return this.keywordsService.gap(
      req.user.organizationId,
      websiteId,
      competitorId,
    );
  }

  /*
   * Phase 8E — evidence fusion (composition only).
   * Read-only over existing systems: no provider
   * calls, no AI credits, no new scores. JWT +
   * organization + website ownership enforced in the
   * service layer per call.
   */
  @Get('strategy/evidence-summary')
  evidenceSummary(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.fusionService.getEvidenceSummary(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get('strategy/next-best-action')
  nextBestAction(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.fusionService.getNextBestAction(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get('strategy/evidence-profile')
  evidenceProfile(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('url') url?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.fusionService.getEvidenceProfile(
      req.user.organizationId,
      websiteId,
      { url, keyword },
    );
  }

  @Get('strategy/why-not-ai')
  whyNotAi(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('topic') topic?: string,
    @Query('page') page?: string,
    @Query('prompt') prompt?: string,
  ) {
    return this.fusionService.getWhyNotAi(
      req.user.organizationId,
      websiteId,
      { topic, page, prompt },
    );
  }

  /*
   * Phase 11 — Rank Intelligence (additive, parity).
   * Persistent append-only rank observations from
   * labeled sources (GSC window averages, SERP
   * provider positions, manual input). Sources never
   * merge; missing stays UNAVAILABLE. SERP fetches
   * reuse research billing (cached reads free, fresh
   * calls charged once); GSC/manual/reads are free.
   */
  @Post('rank/track')
  trackRanks(
    @Req() req: any,
    @Body()
    body: {
      websiteId?: string;
      keywords?: string[];
      country?: string;
      language?: string;
      device?: string;
      refresh?: boolean;
    },
  ) {
    return this.rankService.trackKeywords(
      req.user.organizationId,
      String(body?.websiteId ?? ''),
      {
        keywords: body?.keywords ?? [],
        country: body?.country,
        language: body?.language,
        device: body?.device,
        refresh: body?.refresh,
      },
    );
  }

  @Post('rank/gsc-sync')
  syncGscRanks(
    @Req() req: any,
    @Body() body: { websiteId?: string; days?: number },
  ) {
    const days = Number(body?.days);
    return this.rankService.syncGsc(
      req.user.organizationId,
      String(body?.websiteId ?? ''),
      (days === 90 ? 90 : 30) as 30 | 90,
    );
  }

  @Post('rank/manual')
  recordManualRanks(
    @Req() req: any,
    @Body() body: { websiteId?: string; rows?: never },
  ) {
    return this.rankService.recordManual(
      req.user.organizationId,
      String(body?.websiteId ?? ''),
      {
        rows: Array.isArray(
          (body as { rows?: unknown })?.rows,
        )
          ? ((body as { rows?: Array<Record<string, unknown>> })
              .rows as Array<{
              keyword?: string;
              url?: string | null;
              position?: number | null;
              country?: string;
              language?: string;
              device?: string;
              observedAt?: string;
            }>)
          : [],
      },
    );
  }

  @Get('rank/history')
  rankHistory(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('source') source?: string,
    @Query('days') days?: string,
    @Query('pageNum') pageNum?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const valid: Array<'GSC' | 'SERP_PROVIDER' | 'MANUAL'> =
      ['GSC', 'SERP_PROVIDER', 'MANUAL'];
    return this.rankService.getHistory(
      req.user.organizationId,
      websiteId,
      {
        keyword: keyword || undefined,
        page: page || undefined,
        source: valid.includes(source as never)
          ? (source as 'GSC' | 'SERP_PROVIDER' | 'MANUAL')
          : undefined,
        days: Number(days) || 90,
        pageNum: Number(pageNum) || 1,
        pageSize: Number(pageSize) || 20,
      },
    );
  }

  @Get('rank/overview')
  rankOverview(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('days') days?: string,
    @Query('source') source?: string,
  ) {
    const valid: Array<'GSC' | 'SERP_PROVIDER' | 'MANUAL'> =
      ['GSC', 'SERP_PROVIDER', 'MANUAL'];
    return this.rankService.getOverview(
      req.user.organizationId,
      websiteId,
      {
        days: Number(days) || 30,
        source: valid.includes(source as never)
          ? (source as 'GSC' | 'SERP_PROVIDER' | 'MANUAL')
          : undefined,
      },
    );
  }

  @Get('rank/changes')
  rankChanges(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('days') days?: string,
  ) {
    return this.rankService.getChanges(
      req.user.organizationId,
      websiteId,
      Number(days) || 30,
    );
  }

  @Get('rank/measure')
  rankMeasure(
    @Req() req: any,
    @Query('actionId') actionId: string,
  ) {
    return this.rankService.measureAction(
      req.user.organizationId,
      String(actionId ?? ''),
    );
  }

  /*
   * Phase 31 — Rank Intelligence 2.0 (additive).
   * Persistent tracked-keyword watchlist + bounded runs +
   * URL intelligence + SERP/AI divergence + alerts.
   * GSC POSITION vs TRACKED POSITION stay labeled as
   * DIFFERENT_MEASUREMENT_CONTEXT everywhere.
   */
  @Get('tracking/overview')
  trackingOverview(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.rankIntelligenceService.getIntelligenceOverview(
      req.user.organizationId,
      String(websiteId ?? ''),
    );
  }

  @Get('tracking/keywords')
  listTrackedKeywords(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('isActive') isActive?: string,
    @Query('origin') origin?: string,
    @Query('device') device?: string,
    @Query('country') country?: string,
    @Query('search') search?: string,
    @Query('pageNum') pageNum?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const active =
      isActive === 'true'
        ? true
        : isActive === 'false'
          ? false
          : undefined;
    return this.rankIntelligenceService.listTracked(
      req.user.organizationId,
      String(websiteId ?? ''),
      {
        isActive: active,
        origin: origin || undefined,
        device: device || undefined,
        country: country || undefined,
        search: search || undefined,
        pageNum: Number(pageNum) || 1,
        pageSize: Number(pageSize) || 25,
      },
    );
  }

  @Post('tracking/keywords')
  addTrackedKeywords(
    @Req() req: any,
    @Body()
    body: {
      websiteId?: string;
      items?: Array<{
        keyword?: string;
        country?: string;
        language?: string;
        device?: string;
        searchEngine?: string;
        targetUrl?: string | null;
        origin?: string;
      }>;
    },
  ) {
    return this.rankIntelligenceService.addTracked(
      req.user.organizationId,
      String(body?.websiteId ?? ''),
      { items: body?.items ?? [] },
    );
  }

  @Post('tracking/run')
  startTrackingRun(
    @Req() req: any,
    @Body()
    body: {
      websiteId?: string;
      refresh?: boolean;
      limit?: number;
    },
  ) {
    return this.rankIntelligenceService.startRun(
      req.user.organizationId,
      String(body?.websiteId ?? ''),
      {
        refresh: body?.refresh,
        limit: Number(body?.limit) || 25,
      },
    );
  }

  @Get('tracking/runs')
  listTrackingRuns(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('limit') limit?: string,
  ) {
    return this.rankIntelligenceService.listRuns(
      req.user.organizationId,
      String(websiteId ?? ''),
      Number(limit) || 20,
    );
  }

  @Get('tracking/pages')
  trackingPages(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.rankIntelligenceService.listPages(
      req.user.organizationId,
      String(websiteId ?? ''),
    );
  }

  @Get('tracking/competitors')
  trackingCompetitors(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('keywordId') keywordId?: string,
  ) {
    return this.rankIntelligenceService.listCompetitors(
      req.user.organizationId,
      String(websiteId ?? ''),
      { keywordId: keywordId || undefined },
    );
  }

  @Post('tracking/alerts/evaluate')
  evaluateTrackingAlerts(
    @Req() req: any,
    @Body()
    body: {
      websiteId?: string;
      keywordId?: string;
      limit?: number;
    },
  ) {
    return this.rankIntelligenceService.evaluateAlerts(
      req.user.organizationId,
      String(body?.websiteId ?? ''),
      {
        keywordId: body?.keywordId || undefined,
        limit: Number(body?.limit) || 20,
      },
    );
  }

  @Get('tracking/command-signals')
  trackingCommandSignals(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.rankIntelligenceService.commandSignals(
      req.user.organizationId,
      String(websiteId ?? ''),
    );
  }

  @Get('tracking/keywords/:id/history')
  trackedKeywordHistory(
    @Req() req: any,
    @Param('id') id: string,
    @Query('websiteId') websiteId: string,
    @Query('days') days?: string,
  ) {
    return this.rankIntelligenceService.getHistory(
      req.user.organizationId,
      String(websiteId ?? ''),
      String(id ?? ''),
      Number(days) || 28,
    );
  }

  @Get('tracking/keywords/:id')
  getTrackedKeyword(
    @Req() req: any,
    @Param('id') id: string,
    @Query('websiteId') websiteId: string,
  ) {
    return this.rankIntelligenceService.getTracked(
      req.user.organizationId,
      String(websiteId ?? ''),
      String(id ?? ''),
    );
  }

  @Patch('tracking/keywords/:id')
  updateTrackedKeyword(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      websiteId?: string;
      targetUrl?: string | null;
      isActive?: boolean;
    },
  ) {
    return this.rankIntelligenceService.updateTracked(
      req.user.organizationId,
      String(body?.websiteId ?? ''),
      String(id ?? ''),
      {
        targetUrl: body?.targetUrl,
        isActive: body?.isActive,
      },
    );
  }

  /*
   * Phase 32 — Search Change & Alert Intelligence 2.0
   * (additive). Recurring SCHEDULE → COLLECT →
   * VALIDATE → COMPARE → DETECT → EXPLAIN →
   * PRIORITIZE → NOTIFY → ACTION → VERIFY → MEASURE
   * → LEARN loop reusing Phase 8 scheduler patterns,
   * Phase 31 watchlist/runs, MonitoringAlert
   * dedupe/state and Phase 26 descriptive events.
   * CHANGE ≠ CAUSE everywhere.
   */
  @Get('tracking/schedules')
  listTrackingSchedules(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.searchChangeService.listSchedules(
      req.user.organizationId,
      String(websiteId ?? ''),
    );
  }

  @Post('tracking/schedules')
  createTrackingSchedule(
    @Req() req: any,
    @Body()
    body: {
      websiteId?: string;
      country?: string;
      language?: string;
      device?: string;
      cadence?: string;
    },
  ) {
    return this.searchChangeService.createSchedule(
      req.user.organizationId,
      String(body?.websiteId ?? ''),
      {
        country: body?.country,
        language: body?.language,
        device: body?.device,
        cadence: body?.cadence,
      },
    );
  }

  @Patch('tracking/schedules/:id')
  updateTrackingSchedule(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      websiteId?: string;
      cadence?: string;
      isActive?: boolean;
    },
  ) {
    return this.searchChangeService.updateSchedule(
      req.user.organizationId,
      String(body?.websiteId ?? ''),
      String(id ?? ''),
      {
        cadence: body?.cadence,
        isActive: body?.isActive,
      },
    );
  }

  @Delete('tracking/schedules/:id')
  deleteTrackingSchedule(
    @Req() req: any,
    @Param('id') id: string,
    @Query('websiteId') websiteId: string,
  ) {
    return this.searchChangeService.deleteSchedule(
      req.user.organizationId,
      String(websiteId ?? ''),
      String(id ?? ''),
    );
  }

  /* Scheduler ticks: same secret guard + due /
   * execute-next / recover trilogy as Phase 8. No
   * daemon loops; external cron drives the ticks. */
  @Post('tracking/scheduler/due')
  @UseGuards(SchedulerSecretGuard)
  claimTrackingDue(@Body() body: { nowIso?: string }) {
    return this.searchChangeService.claimDue({
      nowIso: body?.nowIso,
    });
  }

  @Post('tracking/scheduler/execute-next')
  @UseGuards(SchedulerSecretGuard)
  executeTrackingNext(@Body() body: { maxRuns?: number }) {
    return this.searchChangeService.executeNext({
      maxRuns: Number(body?.maxRuns) || 2,
    });
  }

  @Post('tracking/scheduler/recover')
  @UseGuards(SchedulerSecretGuard)
  recoverTrackingRuns() {
    return this.searchChangeService.recover();
  }

  @Get('tracking/digest')
  trackingDigest(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('timeZone') timeZone?: string,
    @Query('maxItems') maxItems?: string,
  ) {
    return this.searchChangeService.getDigest(
      req.user.organizationId,
      String(websiteId ?? ''),
      {
        timeZone: timeZone || undefined,
        maxItems: Number(maxItems) || 10,
      },
    );
  }

  @Get('tracking/preferences')
  trackingPreferences(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.searchChangeService.getPreferences(
      req.user.organizationId,
      String(websiteId ?? ''),
    );
  }

  @Post('tracking/preferences/scope')
  setTrackingScope(
    @Req() req: any,
    @Body()
    body: {
      websiteId?: string;
      scope?: string;
      enabled?: boolean;
    },
  ) {
    return this.searchChangeService.setScope(
      req.user.organizationId,
      String(body?.websiteId ?? ''),
      String(body?.scope ?? ''),
      body?.enabled !== false,
    );
  }

  @Post('tracking/preferences/mute')
  muteTracking(
    @Req() req: any,
    @Body()
    body: {
      websiteId?: string;
      alertType?: string;
      keyword?: string;
      mutedUntil?: string;
    },
  ) {
    return this.searchChangeService.mute(
      req.user.organizationId,
      String(body?.websiteId ?? ''),
      {
        alertType: body?.alertType,
        keyword: body?.keyword,
        mutedUntil: body?.mutedUntil,
      },
    );
  }

  @Post('tracking/preferences/unmute')
  unmuteTracking(
    @Req() req: any,
    @Body()
    body: {
      websiteId?: string;
      alertType?: string;
      keyword?: string;
    },
  ) {
    return this.searchChangeService.unmute(
      req.user.organizationId,
      String(body?.websiteId ?? ''),
      {
        alertType: body?.alertType,
        keyword: body?.keyword,
      },
    );
  }

  @Post('tracking/alerts/resolve-reversed')
  resolveReversedAlerts(
    @Req() req: any,
    @Body() body: { websiteId?: string; keywordId?: string },
  ) {
    return this.searchChangeService.resolveWhereReversed(
      req.user.organizationId,
      String(body?.websiteId ?? ''),
      body?.keywordId || undefined,
    );
  }

  @Get('tracking/observability')
  trackingObservability(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.searchChangeService.observability(
      req.user.organizationId,
      String(websiteId ?? ''),
    );
  }

  @Get('tracking/ai-divergence')
  trackingAiDivergence(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('keywordId') keywordId: string,
  ) {
    return this.searchChangeService.searchAiDivergence(
      req.user.organizationId,
      String(websiteId ?? ''),
      String(keywordId ?? ''),
    );
  }
}

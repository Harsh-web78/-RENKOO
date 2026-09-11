import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { AiProviderRegistry } from '../ai-visibility/providers/provider.registry';
import { AiProviderError } from '../ai-visibility/providers/provider.errors';
import { FREE_AI_GENERATIONS_PER_MONTH } from '../billing/plans.config';

import {
  CorpusEntry,
  GscJoin,
  KeywordResearchService,
  ResearchIntent,
} from './keyword-research.service';
import { KeywordCacheService } from './keyword-cache.service';
import { DataForSeoProvider } from './dataforseo.provider';
import {
  MonthlyPoint,
  NormalizedKeywordMetrics,
  NormalizedSerpObservation,
  ProviderIntent,
} from './keyword-data-provider';

/*
 * =========================================================
 * KEYWORD STRATEGY INTELLIGENCE ENGINE (deterministic)
 *
 * A strategy layer above raw keyword metrics. Answers:
 * "Which keywords should I work on first, why, and what
 * should I do?" — without requiring the user to interpret
 * hundreds of keywords manually.
 *
 * Data discipline:
 *  - OBSERVED  = measured first-party evidence (GSC,
 *    crawl corpus). Always available when connected.
 *  - PROVIDER  = DataForSEO cache reads ONLY. The
 *    strategy endpoint never makes fresh provider calls,
 *    so it costs zero credits and works fully when the
 *    provider is unavailable (fields read "unavailable").
 *  - INFERENCE = deterministic RENKOO rules (priority,
 *    buckets, page mapping, clusters). Labeled as such.
 *
 * Nothing here fabricates metrics. Unavailable provider
 * fields are null with explicit availability notes.
 * =========================================================
 */

export type EvidenceSource =
  | 'OBSERVED'
  | 'PROVIDER'
  | 'INFERENCE';

export type StrategyPriority =
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW';

export type StrategyBucket =
  | 'TARGET_NOW'
  | 'QUICK_WIN'
  | 'GROW'
  | 'PROTECT'
  | 'CREATE'
  | 'CONSOLIDATE'
  | 'MONITOR'
  | 'IGNORE';

export type PageMapping =
  | 'IMPROVE'
  | 'OPTIMIZE'
  | 'CREATE'
  | 'CONSOLIDATE'
  | 'IGNORE'
  | 'PROTECT';

export type ActionEffort =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH';

export interface StrategySignal {
  label: string;
  value: string;
  source: EvidenceSource;
}

export interface QuickWinDetail {
  isQuickWin: boolean;
  why: string[];
  action: string;
  expectedImpact: string;
  effort: ActionEffort;
}

export interface StrategyOpportunity {
  keyword: string;
  intent: ResearchIntent;
  intentSource: 'PROVIDER' | 'RENKOO';
  position: number | null;
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  volume: number | null;
  keywordDifficulty: number | null;
  cpc: number | null;
  trend: string | null;
  serpVerdict:
    | 'OPPORTUNITY'
    | 'MODERATE'
    | 'HARD'
    | 'UNKNOWN'
    | null;
  serpWeakCount: number | null;
  targetPage: string | null;
  targetPageSource:
    | 'OBSERVED'
    | 'INFERENCE'
    | null;
  pageMapping: PageMapping;
  mappingReason: string;
  priority: StrategyPriority;
  priorityScore: number;
  priorityReasons: string[];
  opportunityScore: number;
  bucket: StrategyBucket;
  isTargetNow: boolean;
  quickWin: QuickWinDetail | null;
  signals: StrategySignal[];
}

export interface StrategyCluster {
  topic: string;
  primaryKeyword: string;
  supportingKeywords: string[];
  size: number;
  intent: ResearchIntent;
  existingPages: string[];
  missingPages: number;
  cannibalizationRisk: boolean;
  topOpportunity: number;
  priority: StrategyPriority;
  pillarPage: string | null;
  pillarPageSource: 'OBSERVED' | 'INFERENCE' | null;
  supportingContent: string[];
  recommendedPageType: string;
}

export interface StrategyAction {
  rank: number;
  priority: StrategyPriority;
  actionType:
    | 'IMPROVE_PAGE'
    | 'OPTIMIZE_PAGE'
    | 'CREATE_PAGE'
    | 'CONSOLIDATE_PAGES'
    | 'PROTECT_PAGE'
    | 'TRACK_KEYWORD';
  keyword: string;
  topic: string | null;
  targetUrl: string | null;
  reason: string;
  evidence: string[];
  effort: ActionEffort;
}

const MAX_GAP_CANDIDATES = 200;
const MAX_OPPORTUNITIES = 300;
const MAX_CLUSTERS = 30;
const SERP_BONUS_POOL = 150;

/*
 * Priority Score 0–100 (transparent, fixed weights):
 *  position      4–10:+30  11–20:+22  21–50:+10
 *                top 3:+12  else/none:+4            (max 30)
 *  impressions   ≥5000:+20 ≥1000:+15 ≥300:+10
 *                ≥50:+6  >0:+2                       (max 20)
 *  CTR gap       ctr<0.03 & impr≥300:+12
 *                ctr<0.05 & impr≥100:+6              (max 12)
 *  intent        TRANSACTIONAL:+8  COMMERCIAL-family:+6
 *                LOCAL:+5  PROBLEM_SOLUTION:+4
 *                INFORMATIONAL:+3  else:+0           (max 8)
 *  site cover    siteRelevance>0:+8                  (max 8)
 *  competitor    competitor-only gap:+8              (max 8)
 *  trend         rising:+5  seasonal:+2 (if avail.)  (max 5)
 *  volume        ≥10000:+10 ≥1000:+7 ≥100:+4 >0:+2
 *                (if available)                      (max 10)
 *  KD            ≤30:+6  ≤60:+2  >80:−8 (if avail.)
 *  SERP weakness cached verdict OPPORTUNITY:+6
 *                (if available)
 * Bands: HIGH ≥60, MEDIUM ≥38, LOW otherwise.
 */
const PRIORITY_HIGH = 60;
const PRIORITY_MEDIUM = 38;

function bandOf(score: number): StrategyPriority {
  if (score >= PRIORITY_HIGH) return 'HIGH';
  if (score >= PRIORITY_MEDIUM) return 'MEDIUM';
  return 'LOW';
}

function fmtNum(n: number | null): string {
  if (n === null || !Number.isFinite(n))
    return 'unavailable';
  if (n >= 1000)
    return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return `${Math.round(n)}`;
}

@Injectable()
export class KeywordStrategyService {
  private readonly logger = new Logger(
    KeywordStrategyService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly research: KeywordResearchService,
    private readonly billingService: BillingService,
    private readonly cache: KeywordCacheService,
    private readonly provider: DataForSeoProvider,
    private readonly providerRegistry: AiProviderRegistry,
  ) {}

  // =======================================================
  // STRATEGY
  // =======================================================

  async strategy(
    organizationId: string,
    dto: {
      websiteId: string;
      startDate?: string;
      endDate?: string;
      country?: string;
      language?: string;
      limit?: number;
    },
  ): Promise<{
    website: {
      id: string;
      name: string;
      url: string;
    };
    period: { startDate: string; endDate: string };
    universe: {
      gscKeywords: number;
      gapCandidates: number;
      total: number;
    };
    dataAvailability: {
      provider: boolean;
      gscConnected: boolean;
      volumeCoverage: number;
      kdCoverage: number;
      serpCached: number;
      notes: string[];
    };
    summary: Record<StrategyBucket, number>;
    opportunities: StrategyOpportunity[];
    clusters: StrategyCluster[];
    nextActions: StrategyAction[];
    aiBrief: {
      website: string;
      generatedAt: string;
      period: { startDate: string; endDate: string };
      counts: Record<StrategyBucket, number>;
      topOpportunities: Array<{
        keyword: string;
        intent: string;
        position: number | null;
        impressions: number | null;
        clicks: number | null;
        volume: number | null;
        keywordDifficulty: number | null;
        targetPage: string | null;
        action: string;
        why: string[];
      }>;
      clusterNotes: Array<{
        topic: string;
        primary: string;
        size: number;
        priority: StrategyPriority;
        missingPages: number;
      }>;
      dataGaps: string[];
    };
  }> {
    const { website, siteCorpus, competitorCorpus } =
      await this.research.getCorpora(
        organizationId,
        dto.websiteId,
      );

    const range = this.resolveRange(
      dto.startDate,
      dto.endDate,
    );
    const ctx = this.provider.resolveContext(
      dto.country,
      dto.language,
    );
    const providerOn =
      this.provider.isConfigured();

    /* First-party evidence (free, always attempted). */
    const { byQuery, byQueryPages } =
      await this.research.getGscMaps(
        organizationId,
        range,
      );
    const gscConnected = await this.isGscConnected(
      organizationId,
    );

    /* Universe = observed GSC demand + competitor-only
       corpus gap terms (bounded). */
    const gapTerms = [...competitorCorpus.entries()]
      .filter(([key]) => !siteCorpus.has(key))
      .map(([key, v]) => ({
        key,
        relevance: v.entry.relevanceScore,
      }))
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, MAX_GAP_CANDIDATES)
      .map((g) => g.key);

    /* Cache-only provider reads (batched per family).
       Never fresh: zero credit cost on this endpoint. */
    const enrichment = await this.readCachedEnrichment(
      [...byQuery.keys(), ...gapTerms].slice(0, 1200),
      ctx.country,
      ctx.language,
    );

    /* Two-pass SERP weakness: score first, then read
       cached SERP verdicts only for the top pool. */
    const ideas = new Map<string, StrategyOpportunity>();
    for (const [key, g] of byQuery) {
      ideas.set(
        key,
        this.scoreKeyword({
          keyword: key,
          site: siteCorpus.get(key) ?? null,
          comp: competitorCorpus.get(key)?.entry ?? null,
          competitorIds:
            competitorCorpus.get(key)?.competitorIds
              .size ?? 0,
          gsc: {
            position: g.position,
            clicks: g.clicks,
            impressions: g.impressions,
            ctr: g.ctr,
          },
          gscPages: byQueryPages.get(key) ?? [],
          cached: enrichment.get(key) ?? null,
          hasCompetitor: competitorCorpus.has(key),
        }),
      );
    }
    for (const key of gapTerms) {
      if (ideas.has(key)) continue;
      ideas.set(
        key,
        this.scoreKeyword({
          keyword: key,
          site: null,
          comp:
            competitorCorpus.get(key)?.entry ??
            null,
          competitorIds:
            competitorCorpus.get(key)
              ?.competitorIds.size ?? 0,
          gsc: null,
          gscPages: [],
          cached: enrichment.get(key) ?? null,
          hasCompetitor: true,
        }),
      );
    }

    /* SERP-weakness bonus from cache for the top pool. */
    const ranked = [...ideas.values()].sort(
      (a, b) => b.priorityScore - a.priorityScore,
    );
    let serpCached = 0;
    for (const opp of ranked.slice(
      0,
      SERP_BONUS_POOL,
    )) {
      const hit = await this.cache.get<NormalizedSerpObservation>(
        'DATAFORSEO',
        'serp',
        ctx.country,
        ctx.language,
        opp.keyword,
      );
      const verdict =
        hit?.value?.competition?.verdict ?? null;
      if (!hit?.value) continue;
      serpCached++;
      if (verdict === 'OPPORTUNITY') {
        const weak =
          hit.value.competition?.weakCount ?? 0;
        const total =
          hit.value.competition?.totalResults ?? 0;
        opp.serpVerdict = 'OPPORTUNITY';
        opp.serpWeakCount = weak;
        opp.priorityScore = Math.min(
          100,
          opp.priorityScore + 6,
        );
        opp.priorityReasons.push(
          `SERP shows authority weakness (${weak}/${total} weak results) — PROVIDER data.`,
        );
        opp.signals.push({
          label: 'SERP weakness',
          value: `${weak}/${total} weak results`,
          source: 'PROVIDER',
        });
        opp.priority = bandOf(opp.priorityScore);
        opp.isTargetNow =
          opp.priority === 'HIGH';
        if (
          opp.quickWin &&
          verdict === 'OPPORTUNITY'
        ) {
          opp.quickWin.why.push(
            `SERP contains ${weak} weak competitor(s) out of ${total} — PROVIDER data.`,
          );
        }
      } else if (verdict) {
        opp.serpVerdict = verdict;
      }
    }

    const limit = Math.min(
      Math.max(dto.limit ?? 100, 10),
      MAX_OPPORTUNITIES,
    );
    const opportunities = [...ideas.values()]
      .sort((a, b) => {
        const bandRank = (p: StrategyPriority) =>
          p === 'HIGH' ? 0 : p === 'MEDIUM' ? 1 : 2;
        return (
          bandRank(a.priority) -
            bandRank(b.priority) ||
          b.priorityScore - a.priorityScore
        );
      })
      .slice(0, limit);

    const summary = this.emptySummary();
    for (const o of opportunities) {
      summary[o.bucket]++;
    }

    const clusters = this.buildStrategyClusters(
      opportunities,
    ).slice(0, MAX_CLUSTERS);
    const nextActions = this.buildNextActions(
      opportunities,
      clusters,
    );

    let volumeCoverage = 0;
    let kdCoverage = 0;
    for (const o of opportunities) {
      if (o.volume !== null) volumeCoverage++;
      if (o.keywordDifficulty !== null) kdCoverage++;
    }
    const notes: string[] = [];
    if (!providerOn) {
      notes.push(
        'Search volume, KD, CPC and provider trend are unavailable — connect a supported provider.',
      );
    } else if (volumeCoverage < opportunities.length) {
      notes.push(
        `Search volume available for ${volumeCoverage}/${opportunities.length} opportunities (cached provider data).`,
      );
    }
    if (!gscConnected) {
      notes.push(
        'Search Console is not connected — rankings, clicks and impressions are unavailable; strategy runs on crawl corpus only.',
      );
    }
    if (serpCached < Math.min(ranked.length, 20)) {
      notes.push(
        'SERP weakness evaluated only where cached SERP data exists; open keywords to load fresh SERP evidence.',
      );
    }

    return {
      website: {
        id: website.id,
        name: website.name,
        url: website.url,
      },
      period: range,
      universe: {
        gscKeywords: byQuery.size,
        gapCandidates: gapTerms.length,
        total: ideas.size,
      },
      dataAvailability: {
        provider: providerOn,
        gscConnected,
        volumeCoverage,
        kdCoverage,
        serpCached,
        notes,
      },
      summary,
      opportunities,
      clusters,
      nextActions,
      aiBrief: {
        website: website.name,
        generatedAt: new Date().toISOString(),
        period: range,
        counts: summary,
        topOpportunities: opportunities
          .slice(0, 10)
          .map((o) => ({
            keyword: o.keyword,
            intent: o.intent,
            position: o.position,
            impressions: o.impressions,
            clicks: o.clicks,
            volume: o.volume,
            keywordDifficulty: o.keywordDifficulty,
            targetPage: o.targetPage,
            action: o.pageMapping,
            why: o.priorityReasons.slice(0, 4),
          })),
        clusterNotes: clusters
          .slice(0, 10)
          .map((c) => ({
            topic: c.topic,
            primary: c.primaryKeyword,
            size: c.size,
            priority: c.priority,
            missingPages: c.missingPages,
          })),
        dataGaps: notes,
      },
    };
  }

  // =======================================================
  // AI STRATEGIST BRIEF (evidence-only LLM layer)
  // =======================================================

  async strategyBrief(
    organizationId: string,
    dto: {
      websiteId: string;
      provider: 'GEMINI' | 'OPENAI';
      keywords?: string[];
      maxItems?: number;
      startDate?: string;
      endDate?: string;
      country?: string;
      language?: string;
    },
  ): Promise<{
    id: string;
    text: string;
    provider: string;
    model: string;
    itemCount: number;
    createdAt: string;
  }> {
    const provider = this.providerRegistry.get(
      dto.provider,
    );
    if (!provider) {
      throw new BadRequestException(
        `Provider ${dto.provider} is not available`,
      );
    }
    if (!provider.isConfigured()) {
      throw new HttpException(
        {
          code: 'PROVIDER_NOT_CONFIGURED',
          provider: provider.id,
          message: `${provider.displayName} is not configured. Set the provider API key on the backend.`,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const full = await this.strategy(
      organizationId,
      {
        websiteId: dto.websiteId,
        startDate: dto.startDate,
        endDate: dto.endDate,
        country: dto.country,
        language: dto.language,
        limit: 100,
      },
    );

    const wanted = new Set(
      (dto.keywords ?? [])
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean),
    );
    const maxItems = Math.min(
      Math.max(dto.maxItems ?? 8, 1),
      15,
    );
    const items = (
      wanted.size > 0
        ? full.opportunities.filter((o) =>
            wanted.has(o.keyword),
          )
        : full.opportunities
    ).slice(0, maxItems);
    if (items.length === 0) {
      throw new NotFoundException(
        wanted.size > 0
          ? 'None of the selected keywords have strategy evidence yet.'
          : 'No strategy opportunities available for this website yet.',
      );
    }

    /* AI credits: paid workspaces consume AI_CREDITS;
       free workspaces share the monthly AI allowance
       with content generations (single ledger view). */
    await this.consumeAiCredits(organizationId);

    const prompt = this.buildBriefPrompt(full, items);
    let text: string;
    let model: string;
    try {
      const output = await provider.executePrompt({
        prompt,
        maxOutputTokens: 1024,
      });
      text = output.text;
      model = output.model;
    } catch (error) {
      if (error instanceof AiProviderError) {
        throw new HttpException(
          {
            code: error.code,
            provider: error.provider,
            message: error.message,
          },
          this.providerHttpStatus(error.code),
        );
      }
      throw error;
    }

    const row =
      await this.prisma.strategyBrief.create({
        data: {
          organizationId,
          websiteId: dto.websiteId,
          provider: provider.id,
          model,
          itemCount: items.length,
          brief: text.slice(0, 20000),
        },
      });

    return {
      id: row.id,
      text,
      provider: provider.id,
      model,
      itemCount: items.length,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listBriefs(
    organizationId: string,
    websiteId: string,
  ): Promise<{
    total: number;
    briefs: Array<{
      id: string;
      provider: string;
      model: string | null;
      itemCount: number;
      createdAt: string;
    }>;
  }> {
    const rows =
      await this.prisma.strategyBrief.findMany({
        where: { organizationId, websiteId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
    return {
      total: rows.length,
      briefs: rows.map((r) => ({
        id: r.id,
        provider: r.provider,
        model: r.model,
        itemCount: r.itemCount,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  // =======================================================
  // SCORING
  // =======================================================

  private scoreKeyword(input: {
    keyword: string;
    site: CorpusEntry | null;
    comp: CorpusEntry | null;
    competitorIds: number;
    gsc: GscJoin | null;
    gscPages: Array<{
      page: string;
      position: number | null;
      clicks: number;
      impressions: number;
    }>;
    cached: {
      metrics: NormalizedKeywordMetrics | null;
      difficulty: number | null;
      intent: ProviderIntent | null;
      history: MonthlyPoint[];
      lastUpdated: string | null;
    } | null;
    hasCompetitor: boolean;
  }): StrategyOpportunity {
    const { keyword } = input;
    const pos = input.gsc?.position ?? null;
    const clicks = input.gsc?.clicks ?? null;
    const impressions = input.gsc?.impressions ?? null;
    const ctr = input.gsc?.ctr ?? null;

    const volume =
      input.cached?.metrics?.searchVolume ?? null;
    const kd =
      input.cached?.difficulty ??
      input.cached?.metrics?.keywordDifficulty ??
      null;
    const cpc = input.cached?.metrics?.cpc ?? null;
    const monthly =
      input.cached?.metrics?.monthlySearches ??
      input.cached?.history ??
      [];
    const providerIntent =
      input.cached?.intent ??
      input.cached?.metrics?.providerIntent ??
      null;

    const classified =
      this.research.classifyKeyword(keyword);
    let intent = classified.intent;
    let intentSource: 'PROVIDER' | 'RENKOO' =
      'RENKOO';
    if (providerIntent) {
      intentSource = 'PROVIDER';
      intent =
        providerIntent === 'transactional'
          ? 'TRANSACTIONAL'
          : providerIntent === 'commercial'
            ? 'COMMERCIAL'
            : providerIntent === 'navigational'
              ? 'NAVIGATIONAL'
              : 'INFORMATIONAL';
    }

    /* Reuse the transparent 2.0 formula for the base
       opportunity score (pure, no fetching). */
    const idea = this.research.scoreIdea(
      keyword,
      input.site,
      input.comp,
      input.competitorIds,
      {
        provider: input.cached,
        providerIdea: null,
        gsc: input.gsc,
      },
    );

    const trend = trendDirectionOf(monthly);
    let score = 0;
    const reasons: string[] = [];
    const signals: StrategySignal[] = [];

    const pushSignal = (
      label: string,
      value: string,
      source: EvidenceSource,
    ) => signals.push({ label, value, source });

    /* Position (max 30) — OBSERVED. */
    if (pos !== null && pos >= 4 && pos <= 10) {
      score += 30;
      reasons.push(
        `Ranking at #${pos.toFixed(1)} — page one, within striking distance of the top 3.`,
      );
    } else if (
      pos !== null &&
      pos > 10 &&
      pos <= 20
    ) {
      score += 22;
      reasons.push(
        `Ranking at #${pos.toFixed(1)} — page two, one strong push from page one.`,
      );
    } else if (
      pos !== null &&
      pos > 20 &&
      pos <= 50
    ) {
      score += 10;
      reasons.push(
        `Ranking at #${pos.toFixed(1)} — indexed but buried; needs substantial strengthening.`,
      );
    } else if (
      pos !== null &&
      pos >= 1 &&
      pos < 4
    ) {
      score += 12;
      reasons.push(
        `Ranking at #${pos.toFixed(1)} — defend this position and grow CTR.`,
      );
    } else {
      score += 4;
    }
    pushSignal(
      'Position',
      pos !== null
        ? `#${pos.toFixed(1)}`
        : 'not ranking',
      'OBSERVED',
    );
    pushSignal(
      'Impressions',
      impressions !== null
        ? fmtNum(impressions)
        : 'unavailable',
      'OBSERVED',
    );
    pushSignal(
      'Clicks',
      clicks !== null ? fmtNum(clicks) : 'unavailable',
      'OBSERVED',
    );

    /* Impressions (max 20) — OBSERVED. */
    const impr = impressions ?? 0;
    if (impr >= 5000) {
      score += 20;
      reasons.push(
        `${fmtNum(impr)} monthly impressions — large visible demand.`,
      );
    } else if (impr >= 1000) {
      score += 15;
      reasons.push(
        `${fmtNum(impr)} monthly impressions — strong visible demand.`,
      );
    } else if (impr >= 300) {
      score += 10;
    } else if (impr >= 50) {
      score += 6;
    } else if (impr > 0) {
      score += 2;
    }

    /* CTR gap (max 12) — OBSERVED + INFERENCE threshold.
       Thresholds are fixed RENKOO heuristics, documented
       here rather than presented as measured truth. */
    const ctrN = ctr ?? 0;
    if (ctrN < 0.03 && impr >= 300) {
      score += 12;
      reasons.push(
        `CTR of ${(ctrN * 100).toFixed(1)}% on ${fmtNum(impr)} impressions is below the 3% watch level — title/meta improvement can capture clicks without new rankings.`,
      );
    } else if (ctrN < 0.05 && impr >= 100) {
      score += 6;
      reasons.push(
        `CTR of ${(ctrN * 100).toFixed(1)}% leaves headroom on ${fmtNum(impr)} impressions.`,
      );
    }

    /* Intent (max 8) — PROVIDER preferred, else RENKOO. */
    const intentBonus =
      intent === 'TRANSACTIONAL'
        ? 8
        : intent === 'COMMERCIAL' ||
            intent === 'BUYER_RESEARCH' ||
            intent === 'COMPARISON' ||
            intent === 'ALTERNATIVES'
          ? 6
          : intent === 'LOCAL'
            ? 5
            : intent === 'PROBLEM_SOLUTION'
              ? 4
              : intent === 'INFORMATIONAL'
                ? 3
                : 0;
    score += intentBonus;
    if (intentBonus >= 6) {
      reasons.push(
        `${intentLabelOf(intent)} intent (${intentSource === 'PROVIDER' ? 'provider-classified' : 'RENKOO-classified'}) — close to revenue.`,
      );
    }

    /* Site coverage (max 8) — OBSERVED. */
    const siteRel = input.site?.relevanceScore ?? 0;
    if (siteRel > 0) {
      score += 8;
      reasons.push(
        `Existing page coverage on ${input.site?.pages ?? 0} page(s) — optimize rather than start over.`,
      );
    }
    pushSignal(
      'Site coverage',
      input.site
        ? `${input.site.pages} page(s)`
        : 'none',
      'OBSERVED',
    );

    /* Competitor gap (max 8) — OBSERVED. */
    if (input.hasCompetitor && !input.site) {
      score += 8;
      reasons.push(
        'Competitors cover this topic and this site does not — a real content gap.',
      );
    }

    /* Trend (max 5) — PROVIDER when cached. */
    if (trend === 'rising') {
      score += 5;
      reasons.push(
        'Rising 12-month search trend — PROVIDER data.',
      );
    } else if (trend === 'seasonal') {
      score += 2;
    }
    if (trend) {
      pushSignal(
        'Trend',
        trend,
        'PROVIDER',
      );
    }

    /* Volume (max 10), KD, CPC — PROVIDER when cached. */
    if (volume !== null && volume > 0) {
      const v =
        volume >= 10000
          ? 10
          : volume >= 1000
            ? 7
            : volume >= 100
              ? 4
              : 2;
      score += v;
      reasons.push(
        `${fmtNum(volume)} monthly searches — PROVIDER data.`,
      );
      pushSignal(
        'Volume',
        `${fmtNum(volume)}/mo`,
        'PROVIDER',
      );
    }
    if (kd !== null) {
      if (kd <= 30) {
        score += 6;
        reasons.push(
          `KD ${Math.round(kd)} is achievable — PROVIDER data.`,
        );
      } else if (kd <= 60) {
        score += 2;
      } else if (kd > 80) {
        score -= 8;
        reasons.push(
          `KD ${Math.round(kd)} is very hard — deprioritize until authority grows. PROVIDER data.`,
        );
      }
      pushSignal(
        'KD',
        `${Math.round(kd)}`,
        'PROVIDER',
      );
    }
    if (cpc !== null && cpc > 0) {
      pushSignal(
        'CPC',
        `$${cpc.toFixed(2)}`,
        'PROVIDER',
      );
    }

    score = Math.min(
      100,
      Math.max(0, Math.round(score)),
    );
    const priority = bandOf(score);

    const mapping = this.mapPage(
      keyword,
      input.site,
      input.gscPages,
      pos,
      volume,
      input.hasCompetitor,
      intent,
    );
    const bucket = this.assignBucket(
      mapping.mapping,
      pos,
      impr,
      priority,
    );
    const quickWin = this.buildQuickWin(
      keyword,
      pos,
      impr,
      ctrN,
      mapping,
    );

    if (reasons.length === 0) {
      reasons.push(
        'Limited evidence — monitor or fold into a broader page. INFERENCE.',
      );
    }

    return {
      keyword,
      intent,
      intentSource,
      position: pos,
      clicks,
      impressions,
      ctr,
      volume,
      keywordDifficulty:
        kd !== null ? Math.round(kd) : null,
      cpc,
      trend,
      serpVerdict: null,
      serpWeakCount: null,
      targetPage: mapping.targetPage,
      targetPageSource: mapping.targetPageSource,
      pageMapping: mapping.mapping,
      mappingReason: mapping.reason,
      priority,
      priorityScore: score,
      priorityReasons: reasons,
      opportunityScore: idea.opportunityScore,
      bucket,
      isTargetNow: priority === 'HIGH',
      quickWin,
      signals,
    };
  }

  // =======================================================
  // PAGE MAPPING
  // =======================================================

  /*
   * IMPROVE  = ranking page is a strong match (pos 4–20).
   * OPTIMIZE = a page ranks outside striking distance,
   *            or site covers the topic without ranking
   *            (weak/partial match).
   * CREATE   = no site coverage, no ranking, but real
   *            demand evidence (volume, gap, impressions).
   * CONSOLIDATE = multiple ranking/candidate pages.
   * PROTECT  = already top 3 with engagement.
   * IGNORE   = strategically irrelevant / no evidence.
   *
   * Target page: GSC primary page (most impressions)
   * first (OBSERVED), else best site-corpus URL
   * (OBSERVED), else null.
   */
  private mapPage(
    keyword: string,
    site: CorpusEntry | null,
    gscPages: Array<{
      page: string;
      position: number | null;
      clicks: number;
      impressions: number;
    }>,
    pos: number | null,
    volume: number | null,
    hasCompetitor: boolean,
    intent: ResearchIntent,
  ): {
    mapping: PageMapping;
    reason: string;
    targetPage: string | null;
    targetPageSource: 'OBSERVED' | 'INFERENCE' | null;
  } {
    const visible = gscPages.filter(
      (p) => p.impressions > 0,
    );
    const primary =
      [...visible].sort(
        (a, b) => b.impressions - a.impressions,
      )[0] ?? null;
    const primaryImpressions = primary?.impressions ?? 0;
    const targetPage =
      primary?.page ?? site?.urls[0] ?? null;
    const targetPageSource = primary
      ? ('OBSERVED' as const)
      : site?.urls[0]
        ? ('OBSERVED' as const)
        : null;

    if (visible.length >= 2) {
      return {
        mapping: 'CONSOLIDATE',
        reason: `${visible.length} pages earn impressions for this keyword — consolidate around one primary URL. OBSERVED.`,
        targetPage: primary?.page ?? null,
        targetPageSource,
      };
    }
    if (
      pos !== null &&
      pos >= 1 &&
      pos < 4 &&
      ((primary?.impressions ?? 0) > 0 ||
        (primary?.clicks ?? 0) > 0)
    ) {
      return {
        mapping: 'PROTECT',
        reason: `Already ranking #${pos.toFixed(1)} — defend the position, do not rebuild. OBSERVED.`,
        targetPage,
        targetPageSource,
      };
    }
    /* Someone else's navigational query with no site
       coverage is strategically irrelevant. Placed after
       CONSOLIDATE/PROTECT so own-brand rankings are
       never ignored. */
    if (
      intent === 'NAVIGATIONAL' &&
      !site &&
      (pos === null || pos > 10)
    ) {
      return {
        mapping: 'IGNORE',
        reason:
          'Navigational query for another brand/property with no site coverage — strategically irrelevant. INFERENCE.',
        targetPage: null,
        targetPageSource: null,
      };
    }
    if (pos !== null && pos >= 4 && pos <= 20) {
      return {
        mapping: 'IMPROVE',
        reason: `Ranking page at #${pos.toFixed(1)} is a strong intent match — improve it. OBSERVED.`,
        targetPage,
        targetPageSource,
      };
    }
    if (primary) {
      return {
        mapping: 'OPTIMIZE',
        reason: `A page ranks (#${pos !== null ? pos.toFixed(1) : 'unknown'}) but outside striking distance — partial match, optimize it for intent. OBSERVED.`,
        targetPage,
        targetPageSource,
      };
    }
    if (site && site.pages > 0) {
      return {
        mapping: 'OPTIMIZE',
        reason: `Site covers the topic on ${site.pages} page(s) but it is not ranking — partial match, optimize for intent. OBSERVED.`,
        targetPage,
        targetPageSource,
      };
    }
    if (
      (volume !== null && volume > 0) ||
      hasCompetitor ||
      primaryImpressions > 0
    ) {
      return {
        mapping: 'CREATE',
        reason:
          volume !== null && volume > 0
            ? `No covering page and ${fmtNum(volume)} monthly searches — PROVIDER demand, create a dedicated page.`
            : 'No covering page but competitor demand exists — OBSERVED gap, create a dedicated page.',
        targetPage: null,
        targetPageSource: null,
      };
    }
    return {
      mapping: 'IGNORE',
      reason:
        'No ranking, no site coverage and no demand evidence — strategically irrelevant for now. INFERENCE.',
      targetPage: null,
      targetPageSource: null,
    };
  }

  // =======================================================
  // BUCKETS
  // =======================================================

  private assignBucket(
    mapping: PageMapping,
    pos: number | null,
    impressions: number,
    priority: StrategyPriority,
  ): StrategyBucket {
    if (mapping === 'IGNORE') return 'IGNORE';
    if (mapping === 'CONSOLIDATE')
      return 'CONSOLIDATE';
    if (mapping === 'PROTECT') return 'PROTECT';
    if (
      mapping === 'IMPROVE' &&
      pos !== null &&
      pos >= 4 &&
      pos <= 20 &&
      impressions >= 100
    ) {
      return 'QUICK_WIN';
    }
    if (mapping === 'CREATE') return 'CREATE';
    if (mapping === 'OPTIMIZE') return 'GROW';
    if (
      pos !== null &&
      pos > 20 &&
      impressions > 0
    ) {
      return 'GROW';
    }
    if (priority === 'HIGH') return 'TARGET_NOW';
    return 'MONITOR';
  }

  // =======================================================
  // QUICK WINS
  // =======================================================

  private buildQuickWin(
    keyword: string,
    pos: number | null,
    impressions: number,
    ctr: number,
    mapping: {
      mapping: PageMapping;
      targetPage: string | null;
    },
  ): QuickWinDetail | null {
    void keyword;
    if (
      mapping.mapping !== 'IMPROVE' ||
      pos === null ||
      pos < 4 ||
      pos > 20 ||
      impressions < 100
    ) {
      return null;
    }
    const why: string[] = [
      `Ranks #${pos.toFixed(1)} with ${fmtNum(impressions)} impressions — OBSERVED.`,
    ];
    const fixes: string[] = [];
    if (ctr < 0.05 && impressions >= 100) {
      why.push(
        `CTR of ${(ctr * 100).toFixed(1)}% leaves headroom — OBSERVED.`,
      );
      fixes.push(
        'rewrite the title and meta description to match the query intent',
      );
    }
    fixes.push(
      'strengthen topical coverage (H1, intro, one dedicated section)',
      'add one internal link from the most relevant existing page',
    );
    const action = `On ${mapping.targetPage ?? 'the ranking page'}: ${fixes.join('; ')}.`;
    const expectedImpact =
      pos <= 10
        ? 'High potential — small on-page improvements can move this into the top 3. No traffic increase is promised.'
        : 'Moderate potential — steady on-page work can earn page-one visibility. No traffic increase is promised.';
    const effort: ActionEffort =
      pos <= 10 ? 'LOW' : 'MEDIUM';
    return {
      isQuickWin: true,
      why,
      action,
      expectedImpact,
      effort,
    };
  }

  // =======================================================
  // STRATEGY CLUSTERS + NEXT ACTIONS
  // =======================================================

  private buildStrategyClusters(
    opportunities: StrategyOpportunity[],
  ): StrategyCluster[] {
    const groups = new Map<string, StrategyOpportunity[]>();
    for (const o of opportunities) {
      const topic = this.research.getParentTopic(
        o.keyword,
      );
      const list = groups.get(topic) ?? [];
      list.push(o);
      groups.set(topic, list);
    }

    const clusters: StrategyCluster[] = [];
    for (const [topic, members] of groups) {
      const sorted = [...members].sort(
        (a, b) => b.priorityScore - a.priorityScore,
      );
      const primary = sorted[0];
      const intentCounts = new Map<string, number>();
      for (const m of members) {
        intentCounts.set(
          m.intent,
          (intentCounts.get(m.intent) ?? 0) + 1,
        );
      }
      const intent = (
        [...intentCounts.entries()].sort(
          (a, b) => b[1] - a[1],
        )[0]?.[0] ?? primary.intent
      ) as ResearchIntent;
      const existingPages = [
        ...new Set(
          members
            .map((m) => m.targetPage)
            .filter(
              (p): p is string =>
                typeof p === 'string' && p.length > 0,
            ),
        ),
      ];
      const missingPages = members.filter(
        (m) => m.pageMapping === 'CREATE',
      ).length;
      const cannibalizationRisk = members.some(
        (m) => m.pageMapping === 'CONSOLIDATE',
      );
      const topOpportunity = primary.priorityScore;
      const priority =
        primary.priority === 'HIGH'
          ? ('HIGH' as const)
          : members.some(
                (m) => m.priority === 'MEDIUM',
              )
            ? ('MEDIUM' as const)
            : ('LOW' as const);
      const pillarTarget =
        primary.targetPage ??
        existingPages[0] ??
        null;
      clusters.push({
        topic,
        primaryKeyword: primary.keyword,
        supportingKeywords: sorted
          .slice(1)
          .map((m) => m.keyword),
        size: members.length,
        intent,
        existingPages,
        missingPages,
        cannibalizationRisk,
        topOpportunity,
        priority,
        pillarPage: pillarTarget,
        pillarPageSource: pillarTarget
          ? 'OBSERVED'
          : null,
        supportingContent: sorted
          .filter(
            (m) =>
              m.pageMapping === 'CREATE' ||
              m.pageMapping === 'OPTIMIZE',
          )
          .map((m) => m.keyword),
        recommendedPageType:
          this.research.getPageType(intent),
      });
    }

    return clusters.sort(
      (a, b) => b.topOpportunity - a.topOpportunity,
    );
  }

  private buildNextActions(
    opportunities: StrategyOpportunity[],
    clusters: StrategyCluster[],
  ): StrategyAction[] {
    /* Topic keys mirror buildStrategyClusters grouping, so the
       caps below diversify across clusters without overruling
       relevance: ranked order is preserved, caps only prevent
       a monoculture queue. */
    void clusters;
    const effortBonus: Record<ActionEffort, number> = {
      LOW: 10,
      MEDIUM: 5,
      HIGH: 0,
    };
    const candidates: Array<{
      opp: StrategyOpportunity;
      type: StrategyAction['actionType'];
      title: string;
      targetUrl: string | null;
      effort: ActionEffort;
    }> = [];

    for (const o of opportunities) {
      if (o.bucket === 'IGNORE') continue;
      if (
        o.bucket === 'QUICK_WIN' ||
        o.pageMapping === 'IMPROVE'
      ) {
        candidates.push({
          opp: o,
          type: 'IMPROVE_PAGE',
          title: `Improve ${o.targetPage ?? 'ranking page'} for "${o.keyword}"`,
          targetUrl: o.targetPage,
          effort: o.quickWin?.effort ?? 'MEDIUM',
        });
      } else if (o.pageMapping === 'OPTIMIZE') {
        candidates.push({
          opp: o,
          type: 'OPTIMIZE_PAGE',
          title: `Optimize ${o.targetPage ?? 'existing coverage'} for "${o.keyword}"`,
          targetUrl: o.targetPage,
          effort: 'MEDIUM',
        });
      } else if (o.pageMapping === 'CREATE') {
        candidates.push({
          opp: o,
          type: 'CREATE_PAGE',
          title: `Create content for "${o.keyword}"`,
          targetUrl: null,
          effort: 'HIGH',
        });
      } else if (o.pageMapping === 'CONSOLIDATE') {
        candidates.push({
          opp: o,
          type: 'CONSOLIDATE_PAGES',
          title: `Consolidate competing pages for "${o.keyword}"`,
          targetUrl: o.targetPage,
          effort: 'HIGH',
        });
      } else if (o.pageMapping === 'PROTECT') {
        candidates.push({
          opp: o,
          type: 'PROTECT_PAGE',
          title: `Protect #${o.position?.toFixed(1) ?? '?'} ranking for "${o.keyword}"`,
          targetUrl: o.targetPage,
          effort: 'LOW',
        });
      } else {
        candidates.push({
          opp: o,
          type: 'TRACK_KEYWORD',
          title: `Track "${o.keyword}"`,
          targetUrl: o.targetPage,
          effort: 'LOW',
        });
      }
    }

    const bandRank = (p: StrategyPriority) =>
      p === 'HIGH' ? 0 : p === 'MEDIUM' ? 1 : 2;
    candidates.sort(
      (a, b) =>
        bandRank(a.opp.priority) -
          bandRank(b.opp.priority) ||
        b.opp.priorityScore +
          effortBonus[b.effort] -
          (a.opp.priorityScore +
            effortBonus[a.effort]),
    );

    /* Diversify across pages/topics/action types without
       overruling relevance: first pass respects caps in ranked
       order, second pass fills remaining slots in strict ranked
       order so the queue never ends short. Deterministic. */
    const picked: typeof candidates = [];
    const pickedOpps = new Set<StrategyOpportunity>();
    const urlCount = new Map<string, number>();
    const topicCount = new Map<string, number>();
    const typeCount = new Map<string, number>();
    const urlKeyOf = (
      targetUrl: string | null,
      keyword: string,
    ) =>
      targetUrl
        ? targetUrl.trim().toLowerCase().replace(/\/$/, '')
        : `__new__:${keyword.trim().toLowerCase()}`;
    for (const c of candidates) {
      if (picked.length >= 10) break;
      const urlKey = urlKeyOf(c.targetUrl, c.opp.keyword);
      const topicKey = this.research
        .getParentTopic(c.opp.keyword)
        .trim()
        .toLowerCase();
      if (
        (urlCount.get(urlKey) ?? 0) >= 2 ||
        (topicCount.get(topicKey) ?? 0) >= 3 ||
        (typeCount.get(c.type) ?? 0) >= 4
      )
        continue;
      picked.push(c);
      pickedOpps.add(c.opp);
      urlCount.set(urlKey, (urlCount.get(urlKey) ?? 0) + 1);
      topicCount.set(
        topicKey,
        (topicCount.get(topicKey) ?? 0) + 1,
      );
      typeCount.set(c.type, (typeCount.get(c.type) ?? 0) + 1);
    }
    for (const c of candidates) {
      if (picked.length >= 10) break;
      if (pickedOpps.has(c.opp)) continue;
      picked.push(c);
      pickedOpps.add(c.opp);
    }

    return picked.map((c, i) => ({
      rank: i + 1,
      priority: c.opp.priority,
      actionType: c.type,
      keyword: c.opp.keyword,
      topic: this.research.getParentTopic(
        c.opp.keyword,
      ),
      targetUrl: c.targetUrl,
      reason:
        c.opp.priorityReasons[0] &&
        c.opp.priorityReasons[0] !== c.opp.mappingReason
          ? `${c.opp.mappingReason} ${c.opp.priorityReasons[0]}`
          : (c.opp.priorityReasons[0] ?? c.opp.mappingReason),
      evidence: [
        c.opp.position !== null
          ? `Position #${c.opp.position.toFixed(1)}`
          : 'Not ranking',
        c.opp.impressions !== null
          ? `${fmtNum(c.opp.impressions)} impressions`
          : 'No impression data',
        c.opp.clicks !== null
          ? `${fmtNum(c.opp.clicks)} clicks`
          : 'No click data',
        ...(c.opp.volume !== null
          ? [`${fmtNum(c.opp.volume)} searches/mo (provider)`]
          : []),
      ],
      effort: c.effort,
    }));
  }

  // =======================================================
  // HELPERS
  // =======================================================

  private emptySummary(): Record<StrategyBucket, number> {
    return {
      TARGET_NOW: 0,
      QUICK_WIN: 0,
      GROW: 0,
      PROTECT: 0,
      CREATE: 0,
      CONSOLIDATE: 0,
      MONITOR: 0,
      IGNORE: 0,
    };
  }

  private resolveRange(
    startDate?: string,
    endDate?: string,
  ): { startDate: string; endDate: string } {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 27);
    const fmt = (d: Date) =>
      d.toISOString().slice(0, 10);
    const s =
      startDate && iso.test(startDate)
        ? startDate
        : fmt(start);
    const e =
      endDate && iso.test(endDate) ? endDate : fmt(end);
    if (s > e) {
      throw new BadRequestException(
        'startDate must be on or before endDate (YYYY-MM-DD).',
      );
    }
    return { startDate: s, endDate: e };
  }

  private async isGscConnected(
    organizationId: string,
  ): Promise<boolean> {
    try {
      const conn =
        await this.prisma.googleConnection.findUnique(
          {
            where: { organizationId },
          },
        );
      return Boolean(
        conn && (conn as any).selectedProperty,
      );
    } catch {
      return false;
    }
  }

  /*
   * Cache-only provider reads for a keyword list.
   * Never triggers fresh provider calls: returns what
   * the cache holds, null otherwise.
   */
  private async readCachedEnrichment(
    keywords: string[],
    country: string,
    language: string,
  ): Promise<
    Map<
      string,
      {
        metrics: NormalizedKeywordMetrics | null;
        difficulty: number | null;
        intent: ProviderIntent | null;
        history: MonthlyPoint[];
        lastUpdated: string | null;
      }
    >
  > {
    const out = new Map<
      string,
      {
        metrics: NormalizedKeywordMetrics | null;
        difficulty: number | null;
        intent: ProviderIntent | null;
        history: MonthlyPoint[];
        lastUpdated: string | null;
      }
    >();
    const keys = [
      ...new Set(
        keywords
          .map((k) => k.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
    const BATCH = 50;
    for (let i = 0; i < keys.length; i += BATCH) {
      const batch = keys.slice(i, i + BATCH);
      const rows = await Promise.all(
        batch.map(async (key) => {
          const [m, d, p] = await Promise.all([
            this.cache.get<NormalizedKeywordMetrics>(
              'DATAFORSEO',
              'metrics',
              country,
              language,
              key,
            ),
            this.cache.get<number | null>(
              'DATAFORSEO',
              'difficulty',
              country,
              language,
              key,
            ),
            this.cache.get<ProviderIntent | null>(
              'DATAFORSEO',
              'intent',
              country,
              language,
              key,
            ),
          ]);
          return { key, m, d, p } as const;
        }),
      );
      for (const { key, m, d, p } of rows) {
        /* A cache hit object means the key was looked
           up before — even a null payload is signal
           that no provider data exists (vs never
           checked). Only record real payloads. */
        if (
          m?.value !== null &&
          m?.value !== undefined
        ) {
          out.set(key, {
            metrics: m.value,
            difficulty:
              d?.value ??
              m.value.keywordDifficulty ??
              null,
            intent:
              p?.value ??
              m.value.providerIntent ??
              null,
            history: m.value.monthlySearches ?? [],
            lastUpdated:
              m.value.lastUpdated ?? null,
          });
        } else if (
          (d && d.value !== null) ||
          (p && p.value !== null)
        ) {
          out.set(key, {
            metrics: null,
            difficulty: d?.value ?? null,
            intent: p?.value ?? null,
            history: [],
            lastUpdated: null,
          });
        }
      }
    }
    return out;
  }

  private async consumeAiCredits(
    organizationId: string,
  ): Promise<void> {
    const subscription =
      await this.billingService.getSubscription(
        organizationId,
      );

    if (!subscription) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const [drafts, briefs] = await Promise.all([
        this.prisma.contentDraft.count({
          where: {
            organizationId,
            humanCreated: false,
            createdAt: { gte: monthStart },
          },
        }),
        this.prisma.strategyBrief.count({
          where: {
            organizationId,
            createdAt: { gte: monthStart },
          },
        }),
      ]);
      const used = drafts + briefs;
      if (used >= FREE_AI_GENERATIONS_PER_MONTH) {
        throw new ForbiddenException({
          code: 'LIMIT_REACHED',
          message:
            'Monthly AI allowance reached. Upgrade your plan to continue.',
          metric: 'AI_CREDITS',
          used,
          limit: FREE_AI_GENERATIONS_PER_MONTH,
        });
      }
      return;
    }

    try {
      await this.billingService.consumeUsage(
        organizationId,
        'AI_CREDITS',
        1,
      );
    } catch (error: any) {
      throw new ForbiddenException({
        code: 'LIMIT_REACHED',
        message:
          error?.message ??
          'AI allowance reached. Upgrade your plan to continue.',
        metric: 'AI_CREDITS',
      });
    }
  }

  private providerHttpStatus(code: string): number {
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

  /*
   * Evidence-only prompt. The model receives verified
   * strategy facts and an explicit closed world: anything
   * not in the facts must be labeled "Not available".
   */
  private buildBriefPrompt(
    full: {
      website: { name: string; url: string };
      period: { startDate: string; endDate: string };
      summary: Record<StrategyBucket, number>;
      dataAvailability: { notes: string[] };
    },
    items: StrategyOpportunity[],
  ): string {
    const lines = items.map((o, i) => {
      const parts = [
        `${i + 1}. "${o.keyword}"`,
        `intent=${o.intent}(${o.intentSource})`,
        `position=${o.position !== null ? `#${o.position.toFixed(1)}` : 'not ranking'}`,
        `impressions=${o.impressions ?? 'n/a'}`,
        `clicks=${o.clicks ?? 'n/a'}`,
        `ctr=${o.ctr !== null ? `${(o.ctr * 100).toFixed(1)}%` : 'n/a'}`,
        `volume=${o.volume ?? 'NOT AVAILABLE'}`,
        `kd=${o.keywordDifficulty ?? 'NOT AVAILABLE'}`,
        `targetPage=${o.targetPage ?? 'none'}`,
        `action=${o.pageMapping}`,
        `priority=${o.priority}(${o.priorityScore})`,
      ];
      const why = o.priorityReasons
        .slice(0, 3)
        .map((r) => `   - ${r}`)
        .join('\n');
      return `${parts.join(' | ')}\n${why}`;
    });

    return [
      'You are an SEO strategist writing for a site owner.',
      'Use ONLY the verified facts below. Do not invent search volume, rankings, competitors, SERP features, traffic, backlinks, CPC, or KD.',
      'If a fact reads NOT AVAILABLE or n/a, say "Not available" explicitly instead of guessing.',
      `Website: ${full.website.name} (${full.website.url}). Period: ${full.period.startDate} to ${full.period.endDate}.`,
      `Bucket counts: ${Object.entries(full.summary)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}.`,
      `Data gaps: ${full.dataAvailability.notes.join(' ') || 'none reported'}.`,
      'Opportunities (highest priority first):',
      ...lines,
      '',
      'Write a concise strategy summary (max 300 words):',
      '1) What is happening (2-3 sentences, facts only).',
      '2) Why it matters (tie to the evidence).',
      '3) The top 3 actions in order, each naming the keyword and the exact page to change or create.',
      'End with one line listing anything marked NOT AVAILABLE that would improve this advice.',
    ].join('\n');
  }
}

function trendDirectionOf(
  monthly: MonthlyPoint[],
): string | null {
  const vols = monthly
    .slice(-12)
    .map((p) => p.searchVolume)
    .filter(
      (v): v is number =>
        typeof v === 'number' && v >= 0,
    );
  if (vols.length < 6) return null;
  const first3 =
    vols.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  const last3 =
    vols.slice(-3).reduce((a, b) => a + b, 0) / 3;
  if (first3 <= 0) return null;
  if (last3 >= first3 * 1.2) return 'rising';
  if (last3 <= first3 * 0.8) return 'declining';
  return 'stable';
}

function intentLabelOf(intent: ResearchIntent): string {
  switch (intent) {
    case 'TRANSACTIONAL':
      return 'Transactional';
    case 'COMMERCIAL':
      return 'Commercial';
    case 'NAVIGATIONAL':
      return 'Navigational';
    case 'LOCAL':
      return 'Local';
    case 'COMPARISON':
      return 'Comparison';
    case 'ALTERNATIVES':
      return 'Alternatives';
    case 'PROBLEM_SOLUTION':
      return 'Problem-solution';
    case 'BUYER_RESEARCH':
      return 'Buyer research';
    default:
      return 'Informational';
  }
}

import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { GoogleService } from '../google/google.service';
import {
  DataForSeoProvider,
  trendFromHistory,
} from './dataforseo.provider';
import { mapLimit } from './dataforseo.client';
import { KeywordCacheService } from './keyword-cache.service';
import {
  MonthlyPoint,
  NormalizedKeywordMetrics,
  NormalizedSerpObservation,
  NormalizedSerpResult,
  PageStrengthRow,
  ProviderContext,
  ProviderIntent,
  SerpPageStrength,
  isDataForSeoConfigured,
  providerCapabilities,
} from './keyword-data-provider';
import {
  analyzeSerpCompetition,
  classifyContentType,
  classifyPageStrength,
  clusterByOverlap,
  intentFamily,
  intentsCompatible,
  isAiElement,
  jaccardSimilarity,
  normalizeSerpUrl,
  serpFeatureOpportunities,
  validateSerpIntent,
} from './serp-analysis';

/*
 * =========================================================
 * KEYWORD RESEARCH SERVICE
 *
 * Real data only. The "keyword universe" is built from:
 *  1. SITE_CORPUS — latest completed RENKOO crawl
 *     (titles, meta descriptions, H1/H2).
 *  2. COMPETITOR_CORPUS — completed competitor crawls.
 *  3. DERIVED_FROM_SEED — deterministic expansions of the
 *     seed (question prefixes, comparison suffixes). These
 *     are candidate queries, NOT measured demand, and carry
 *     no metrics. They exist so the workflow (filter →
 *     cluster → brief) works end-to-end today and light up
 *     with volume/KD the day a provider connects.
 *
 * When DATAFORSEO credentials are configured, ideas and
 * metrics are enriched with real provider data (volume,
 * KD, CPC, competition, 12-month history, provider intent,
 * competitor ranking keywords). Traffic Potential stays
 * unavailable: per-keyword clickstream/ETV is not in the
 * current provider plan. SERP is fetched on demand per
 * keyword (cached 3 days), never bulk-prefetched.
 * Without credentials the service degrades exactly to the
 * 2.0 corpus behavior with explicit availability blocks.
 *
 * RENKOO Opportunity Score 2.0 (0–100, transparent):
 *  Corpus signals:
 *  + up to 25  competitor demand (relevance/pages)
 *  + 12        keyword gap (competitor-only)
 *  + up to 15  site foothold (on-page coverage)
 *  + up to 12  intent value (provider intent preferred,
 *              RENKOO classifier otherwise — never both)
 *  + 8         multi-competitor consensus (2+ competitors)
 *  + up to 8   specificity (long-tail/question focus)
 *  Provider signals (only when real data exists):
 *  + up to 15  search demand (log-scaled volume)
 *  + up to 10  KD manageability (KD<=25:+10, <=45:+6,
 *              <=65:+2, >80:-8)
 *  + up to 5   CPC commercial value
 *  + up to 5   trend (rising:+5, seasonal:+3,
 *              declining:-4)
 *  + up to 10  GSC foothold (pos 4–20:+10, top 3:+5)
 * Only fired components are returned in `reasons`, each
 * citing the real number behind it. No false precision:
 * components are integers and the formula is fixed here.
 *
 * Opportunity 3.0 addendum (SERP signals, additive and
 * capped — never dominating the 2.0 base):
 *  + up to +6   SERP authority weakness (>=30% weak and
 *               >=2 weak results, from real rank data)
 *  + up to +4   SERP intent match (validated vs observed
 *               ranking-page content types)
 *  + up to +2   SERP feature opportunity (winnable format
 *               actually present: PAA / snippet / video)
 *  - up to -8   very strong SERP (>=60% strong results)
 *  - up to -5   SERP intent mismatch
 * Total stays within 0–100.
 * =========================================================
 */

/*
 * Free workspaces: fresh provider-backed researches per
 * calendar month (measured from KeywordResearchLog, same
 * pattern as crawl credits). Paid workspaces consume
 * API_CALLS usage per provider call after success.
 * Cache hits never count and never consume.
 */
export const FREE_MONTHLY_KEYWORD_RESEARCHES = 20;

/*
 * SERP-similarity clustering threshold (Jaccard over
 * normalized top-10 URLs). 0.40 means ≥4 shared URLs out
 * of ~10 — strong evidence of same intent without forcing
 * near-identical SERPs. Topical neighbors typically share
 * 1–3 URLs (0.1–0.3); same-intent variants share 4–8
 * (0.4–0.8). Override via SERP_SIMILARITY_THRESHOLD.
 */
export function serpSimilarityThreshold(): number {
  const raw = Number(
    process.env.SERP_SIMILARITY_THRESHOLD ?? 0.4,
  );
  if (!Number.isFinite(raw)) return 0.4;
  return Math.min(0.9, Math.max(0.1, raw));
}

/* Bulk SERP cost guards for clustering jobs. */
export const MAX_SERP_PER_CLUSTER_JOB = 50;
export const DEFAULT_SERP_PER_CLUSTER_JOB = 25;

export type ResearchIntent =
  | 'INFORMATIONAL'
  | 'COMMERCIAL'
  | 'TRANSACTIONAL'
  | 'NAVIGATIONAL'
  | 'LOCAL'
  | 'COMPARISON'
  | 'ALTERNATIVES'
  | 'PROBLEM_SOLUTION'
  | 'BUYER_RESEARCH';

export type IdeaSource =
  | 'SITE_CORPUS'
  | 'COMPETITOR_CORPUS'
  | 'DERIVED_FROM_SEED'
  | 'PROVIDER';

export type TargetDecision =
  | 'TARGET_NOW'
  | 'GOOD_OPPORTUNITY'
  | 'WATCH'
  | 'LOW_PRIORITY'
  | 'AVOID';

export type PageAction =
  | 'IMPROVE_EXISTING_PAGE'
  | 'CREATE_NEW_PAGE'
  | 'CONSOLIDATE_PAGES'
  | 'TRACK_ONLY'
  | 'IGNORE';

export interface PageDecision {
  action: PageAction;
  reason: string;
  primaryUrl: string | null;
  competingUrls: Array<{
    page?: string;
    url?: string;
    position: number | null;
    clicks: number;
    impressions: number;
  }>;
  cannibalization: {
    detected: boolean;
    confidence: 'strong' | 'potential';
    urls: Array<{
      url?: string;
      page?: string;
      position: number | null;
      clicks: number;
      impressions: number;
    }>;
    recommendation: string | null;
  } | null;
}

export interface GscJoin {
  position: number | null;
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
}

/* Provider enrichment attached to an idea. All nullable —
   null means "not available", never zero. */
export interface ProviderEnrichment {
  metrics: NormalizedKeywordMetrics | null;
  difficulty: number | null;
  intent: ProviderIntent | null;
  history: MonthlyPoint[];
  lastUpdated: string | null;
}

export interface ResearchIdea {
  keyword: string;
  intent: ResearchIntent;
  /* PROVIDER = provider I/C/T/N intent; RENKOO = the
     deterministic on-device classifier. Never mixed. */
  intentSource: 'PROVIDER' | 'RENKOO';
  categories: string[];
  sources: IdeaSource[];
  sitePages: number;
  siteRelevance: number;
  siteUrls: string[];
  competitorCount: number;
  competitorPages: number;
  competitorRelevance: number;
  opportunityScore: number;
  opportunityReasons: string[];
  targetDecision: TargetDecision;
  decisionReason: string;
  parentTopic: string;
  parentTopicSource: 'RENKOO_CLUSTER';
  wordCount: number;
  cannibalizationFlag: boolean;
  /* Real provider metrics (null when unavailable). */
  volume: number | null;
  keywordDifficulty: number | null;
  kdLabel: string | null;
  cpc: number | null;
  competition: number | null;
  competitionLevel: string | null;
  monthlySearches: MonthlyPoint[];
  trend: string | null;
  trendDetail: string | null;
  serpFeatures: string[];
  gscPosition: number | null;
  gscClicks: number | null;
  gscImpressions: number | null;
  gscCtr: number | null;
  /* Per-metric traceability for the UI. */
  dataSource: string;
  metricUpdatedAt: string | null;
  trafficPotential: null;
}

export interface CorpusEntry {
  keyword: string;
  pages: number;
  occurrences: number;
  relevanceScore: number;
  urls: string[];
}

const QUESTION_WORDS = [
  'what',
  'why',
  'how',
  'when',
  'where',
  'which',
  'can',
  'is',
  'do',
  'does',
  'should',
];

const COMPARISON_HINTS = [
  ' vs ',
  ' vs',
  'versus',
  'alternative',
  'alternatives',
  'best',
  'top ',
  'top-',
  'review',
  'reviews',
  'pricing',
  'comparison',
  'compare',
];

const COMMERCIAL_HINTS = [
  'service',
  'services',
  'agency',
  'company',
  'hire',
  'demo',
  'trial',
  'quote',
  'pricing',
  'price',
  'cost',
  'software',
  'platform',
  'tool',
  'tools',
];

const TRANSACTIONAL_HINTS = [
  'buy',
  'purchase',
  'order',
  'checkout',
  'subscribe',
  'sign up',
  'signup',
  'book now',
  'get a quote',
  'discount',
  'deal',
];

const PROBLEM_HINTS = [
  'how to fix',
  'how to solve',
  'problem',
  'error',
  'not working',
  'troubleshoot',
  'why is',
  'how do i',
  'mistake',
  'issue',
];

const LOCAL_HINTS = [
  'near me',
  'nearby',
  'local ',
  ' local',
  'in ',
];

@Injectable()
export class KeywordResearchService {
  private readonly logger = new Logger(
    KeywordResearchService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: DataForSeoProvider,
    private readonly cache: KeywordCacheService,
    private readonly billingService: BillingService,
    private readonly googleService: GoogleService,
  ) {}

  // =======================================================
  // RESEARCH
  // =======================================================

  async research(
    organizationId: string,
    dto: {
      websiteId?: string;
      seed: string;
      mode?: string;
      country?: string;
      language?: string;
      limit?: number;
      /* refresh=true bypasses the cache (fresh billable
         lookup). Default false: cheap cached lookup. */
      refresh?: boolean;
    },
  ) {
    const seed = dto.seed.trim();
    const limit = Math.min(
      Math.max(dto.limit ?? 100, 10),
      200,
    );

    let website: any = null;
    let siteCorpus = new Map<
      string,
      CorpusEntry
    >();
    let competitorCorpus = new Map<
      string,
      {
        entry: CorpusEntry;
        competitorIds: Set<string>;
      }
    >();
    let competitorCount = 0;

    if (dto.websiteId) {
      const loaded = await this.loadWebsiteCorpora(
        organizationId,
        dto.websiteId,
      );
      website = loaded.website;
      siteCorpus = loaded.siteCorpus;
      competitorCorpus = loaded.competitorCorpus;
      competitorCount = loaded.competitorCount;
    }

    const providerOn =
      isDataForSeoConfigured();
    const ctx: ProviderContext | null =
      providerOn
        ? this.provider.resolveContext(
            dto.country,
            dto.language,
          )
        : null;
    const counter = {
      providerCalls: 0,
      cacheHits: 0,
    };

    /* GSC join (first-party, free): map normalized query
       to observed position/clicks/impressions. Best
       effort — unconnected properties simply skip. */
    const gsc =
      dto.websiteId
        ? await this.loadGscMap(organizationId)
        : new Map<string, GscJoin>();

    /* Competitor mode with a domain-like seed: real
       ranking keywords become first-class ideas. */
    let competitorIdeas: Array<{
      keyword: string;
      position: number | null;
      searchVolume: number | null;
      keywordDifficulty: number | null;
      estimatedTraffic: number | null;
      providerIntent: ProviderIntent | null;
      rankingUrl: string | null;
    }> = [];
    const looksLikeDomain =
      /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(
        seed,
      ) && !seed.includes(' ');
    if (
      providerOn &&
      ctx &&
      (dto.mode === 'competitor' || looksLikeDomain)
    ) {
      await this.assertFreshAllowance(
        organizationId,
        'competitor lookup',
      );
      const cached =
        dto.refresh
          ? null
          : await this.cache.get<
              typeof competitorIdeas
            >(
              'DATAFORSEO',
              'competitor_keywords',
              ctx.country,
              ctx.language,
              `domain:${seed.toLowerCase()}`,
            );
      if (cached) {
        counter.cacheHits++;
        competitorIdeas = cached.value;
      } else {
        competitorIdeas =
          await this.provider.fetchCompetitorKeywords(
            seed,
            ctx,
            limit,
          );
        counter.providerCalls++;
        if (competitorIdeas.length > 0) {
          await this.cache.set(
            'DATAFORSEO',
            'competitor_keywords',
            ctx.country,
            ctx.language,
            `domain:${seed.toLowerCase()}`,
            competitorIdeas,
          );
        }
      }
    }

    /* Provider keyword ideas (real discovery). Cached per
       seed for 7 days; refresh=true forces fresh lookup. */
    let providerIdeaMap = new Map<
      string,
      {
        searchVolume: number | null;
        keywordDifficulty: number | null;
        cpc: number | null;
        competition: number | null;
        competitionLevel: string | null;
        monthlySearches: MonthlyPoint[];
        providerIntent: ProviderIntent | null;
      }
    >();
    if (
      providerOn &&
      ctx &&
      competitorIdeas.length === 0
    ) {
      await this.assertFreshAllowance(
        organizationId,
        'keyword research',
      );
      const cached =
        dto.refresh
          ? null
          : await this.cache.get<
              Array<{
                keyword: string;
                metrics: NormalizedKeywordMetrics | null;
              }>
            >(
              'DATAFORSEO',
              'competitor_ideas',
              ctx.country,
              ctx.language,
              `seed:${seed.toLowerCase()}`,
            );
      let raw: Array<{
        keyword: string;
        metrics: NormalizedKeywordMetrics | null;
      }>;
      if (cached) {
        counter.cacheHits += 2;
        raw = cached.value;
      } else {
        /* Counted only on success: auth/billing errors
           throw above, so failed lookups never consume. */
        const fetched =
          await this.provider.fetchIdeas(
            seed,
            ctx,
            limit,
          );
        counter.providerCalls += 2;
        raw = fetched.map((f) => ({
          keyword: f.keyword,
          metrics: f.metrics,
        }));
        await this.cache.set(
          'DATAFORSEO',
          'competitor_ideas',
          ctx.country,
          ctx.language,
          `seed:${seed.toLowerCase()}`,
          raw,
        );
      }
      for (const item of raw) {
        providerIdeaMap.set(item.keyword, {
          searchVolume:
            item.metrics?.searchVolume ?? null,
          keywordDifficulty:
            item.metrics?.keywordDifficulty ??
            null,
          cpc: item.metrics?.cpc ?? null,
          competition:
            item.metrics?.competition ?? null,
          competitionLevel:
            item.metrics?.competitionLevel ??
            null,
          monthlySearches:
            item.metrics?.monthlySearches ?? [],
          providerIntent:
            item.metrics?.providerIntent ?? null,
        });
      }
    }

    const seedTokens = this.tokenize(seed);
    const candidates: string[] = [];
    const seen = new Set<string>();

    const allKeys = new Set<string>([
      ...siteCorpus.keys(),
      ...competitorCorpus.keys(),
    ]);

    for (const key of allKeys) {
      const score = this.seedScore(
        seedTokens,
        key,
      );
      /* Keep loose matches; strict "contains" only
         when the corpus is large enough to allow it. */
      const threshold =
        allKeys.size > 400 ? 0.34 : 0.25;
      if (score < threshold) continue;
      candidates.push(key);
      seen.add(key);
    }

    /* Provider ideas join the universe (by volume). */
    const providerRanked = [...providerIdeaMap.entries()]
      .sort(
        (a, b) =>
          (b[1].searchVolume ?? -1) -
          (a[1].searchVolume ?? -1),
      )
      .slice(0, limit);
    for (const [key] of providerRanked) {
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(key);
    }

    /* Competitor-ranking keywords join the universe. */
    for (const item of competitorIdeas) {
      if (seen.has(item.keyword)) continue;
      seen.add(item.keyword);
      candidates.push(item.keyword);
      if (!providerIdeaMap.has(item.keyword)) {
        providerIdeaMap.set(item.keyword, {
          searchVolume: item.searchVolume,
          keywordDifficulty:
            item.keywordDifficulty,
          cpc: null,
          competition: null,
          competitionLevel: null,
          monthlySearches: [],
          providerIntent: item.providerIntent,
        });
      }
    }

    /* Deterministic seed expansions fill gaps the crawl
       corpus cannot cover (questions, comparisons). They
       carry NO metrics — candidates only. */
    const expansions = this.expandSeed(seed);
    for (const phrase of expansions) {
      if (seen.has(phrase)) continue;
      if (candidates.length >= limit + 60) break;
      seen.add(phrase);
      candidates.push(phrase);
    }

    /* Bulk enrichment: one batched call per metric family
       for all candidates (never one request per keyword).
       Cache-first; missing keys are fetched in ≤1000-key
       batches with bounded concurrency inside the
       provider. Partial failures yield nulls, never a
       failed request. */
    const enrichment =
      providerOn && ctx
        ? await this.enrichKeywords(
            candidates.slice(0, limit + 60),
            ctx,
            dto.refresh ?? false,
            counter,
            providerIdeaMap,
          )
        : new Map<string, ProviderEnrichment>();

    const ideas: ResearchIdea[] = candidates.map(
      (key) =>
        this.buildIdea(
          key,
          siteCorpus.get(key) ?? null,
          competitorCorpus.get(key)?.entry ??
            null,
          competitorCorpus.get(key)
            ?.competitorIds.size ?? 0,
          {
            provider:
              enrichment.get(key) ?? null,
            providerIdea:
              providerIdeaMap.get(key) ?? null,
            gsc: gsc.get(key) ?? null,
          },
        ),
    );

    ideas.sort(
      (a, b) =>
        b.opportunityScore -
        a.opportunityScore,
    );

    const sliced = ideas.slice(0, limit);
    const caps = providerCapabilities();

    /* Cost control: record + consume only after success.
       Failures above never reach here, so failures never
       consume credits. Cache-only requests skip metering. */
    let cost: {
      providerCalls: number;
      cacheHits: number;
      fresh: boolean;
      charged: boolean;
    } = {
      providerCalls: counter.providerCalls,
      cacheHits: counter.cacheHits,
      fresh: counter.providerCalls > 0,
      charged: false,
    };
    if (counter.providerCalls > 0) {
      cost.charged = await this.recordFreshUsage(
        organizationId,
        dto.websiteId,
        seed,
        counter.providerCalls,
        counter.cacheHits,
        sliced.length,
      );
    }

    return {
      seed,
      mode: dto.mode ?? 'keyword',
      country: ctx?.country ?? dto.country ?? null,
      language:
        ctx?.language ?? dto.language ?? null,
      locationFallback: ctx?.locationFallback ?? false,
      provider: providerOn ? 'DATAFORSEO' : 'NONE',
      website: website
        ? {
            id: website.id,
            name: website.name,
            url: website.url,
          }
        : null,
      corpus: {
        sitePhrases: siteCorpus.size,
        competitorPhrases:
          competitorCorpus.size,
        competitorsCovered:
          competitorCount,
        siteCrawled: siteCorpus.size > 0,
      },
      summary: this.summarize(sliced),
      availability: caps.metrics,
      providers: caps.providers,
      cost,
      clusteringBasis:
        'Token overlap + parent-topic grouping over real keyword properties and intent. SERP-similarity clustering is not applied (SERP is fetched on demand per keyword, never bulk-prefetched).',
      ideas: sliced,
      clusters: this.clusterIdeas(sliced),
    };
  }

  // =======================================================
  // WEBSITE CORPORA (site + competitor crawls, shared)
  // =======================================================

  /*
   * Latest completed site crawl plus latest completed
   * crawl per active competitor, merged into phrase maps.
   * Shared by research(), universe() and the SERP
   * scoring path so all three see identical evidence.
   */
  private async loadWebsiteCorpora(
    organizationId: string,
    websiteId: string,
  ): Promise<{
    website: any;
    siteCorpus: Map<string, CorpusEntry>;
    competitorCorpus: Map<
      string,
      {
        entry: CorpusEntry;
        competitorIds: Set<string>;
      }
    >;
    competitorCount: number;
  }> {
    const website =
      await this.prisma.website.findFirst({
        where: {
          id: websiteId,
          organizationId,
        },
      });

    if (!website) {
      throw new NotFoundException(
        'Website not found',
      );
    }

    let siteCorpus = new Map<
      string,
      CorpusEntry
    >();
    const competitorCorpus = new Map<
      string,
      {
        entry: CorpusEntry;
        competitorIds: Set<string>;
      }
    >();
    let competitorCount = 0;

    const crawl =
      await this.prisma.crawl.findFirst({
        where: {
          websiteId: website.id,
          status: 'COMPLETED',
        },
        orderBy: {
          createdAt: 'desc',
        },
        include: { pages: true },
      });

    if (crawl) {
      siteCorpus = this.extractCorpus(
        crawl.pages,
      );
    }

    const competitors =
      await this.prisma.competitor.findMany({
        where: {
          organizationId,
          websiteId: website.id,
          isActive: true,
        },
        include: {
          crawls: {
            where: {
              status: 'COMPLETED',
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
            include: { pages: true },
          },
        },
      });

    for (const competitor of competitors) {
      const latest = competitor.crawls[0];
      if (!latest) continue;
      competitorCount++;
      const corpus = this.extractCorpus(
        latest.pages,
      );
      for (const [key, entry] of corpus) {
        const existing =
          competitorCorpus.get(key);
        if (existing) {
          existing.entry.pages +=
            entry.pages;
          existing.entry.occurrences +=
            entry.occurrences;
          existing.entry.relevanceScore =
            Math.max(
              existing.entry.relevanceScore,
              entry.relevanceScore,
            );
          existing.entry.urls.push(
            ...entry.urls.slice(0, 1),
          );
          existing.competitorIds.add(
            competitor.id,
          );
        } else {
          competitorCorpus.set(key, {
            entry,
            competitorIds: new Set([
              competitor.id,
            ]),
          });
        }
      }
    }

    return {
      website,
      siteCorpus,
      competitorCorpus,
      competitorCount,
    };
  }

  // =======================================================
  // GSC JOIN (first-party, free, best-effort)
  // =======================================================

  private async loadGscMap(
    organizationId: string,
    range?: { startDate: string; endDate: string },
  ): Promise<Map<string, GscJoin>> {
    const map = new Map<string, GscJoin>();
    try {
      const fmt = (d: Date) =>
        d.toISOString().slice(0, 10);
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 27);
      const res: any =
        await this.googleService.getSearchQueries(
          organizationId,
          range?.startDate ?? fmt(start),
          range?.endDate ?? fmt(end),
        );
      const rows: any[] = Array.isArray(res?.rows)
        ? res.rows
        : [];
      for (const row of rows) {
        const query = String(
          row?.query ?? row?.keys?.[0] ?? '',
        )
          .trim()
          .toLowerCase();
        if (!query || map.has(query)) continue;
        const position = Number(row?.position);
        map.set(query, {
          position: Number.isFinite(position)
            ? position
            : null,
          clicks: Number.isFinite(
            Number(row?.clicks),
          )
            ? Number(row.clicks)
            : null,
          impressions: Number.isFinite(
            Number(row?.impressions),
          )
            ? Number(row.impressions)
            : null,
          ctr: Number.isFinite(Number(row?.ctr))
            ? Number(row.ctr)
            : null,
        });
      }
    } catch {
      /* Not connected or GSC error — research simply
         runs without the GSC foothold signal. */
    }
    return map;
  }

  // =======================================================
  // COST CONTROL (cheap cached lookup vs fresh research)
  // =======================================================

  private limitError(
    message: string,
    extra?: Record<string, unknown>,
  ): ForbiddenException {
    return new ForbiddenException({
      code: 'LIMIT_REACHED',
      message,
      metric: 'API_CALLS',
      ...extra,
    });
  }

  /* Pre-flight gate before spending provider money. Free
     workspaces are measured from KeywordResearchLog rows
     this calendar month; paid workspaces use API_CALLS. */
  private async assertFreshAllowance(
    organizationId: string,
    what: string,
  ): Promise<void> {
    let subscription: any = null;
    try {
      subscription =
        await this.billingService.getSubscription(
          organizationId,
        );
    } catch {
      subscription = null;
    }

    if (!subscription) {
      let used = 0;
      try {
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        used =
          await this.prisma.keywordResearchLog.count(
            {
              where: {
                organizationId,
                createdAt: { gte: monthStart },
              },
            },
          );
      } catch {
        used = 0;
      }
      if (
        used >= FREE_MONTHLY_KEYWORD_RESEARCHES
      ) {
        throw this.limitError(
          `Monthly free provider-research allowance reached (${FREE_MONTHLY_KEYWORD_RESEARCHES} fresh researches). Cached lookups still work — upgrade for more.`,
          { used, limit: FREE_MONTHLY_KEYWORD_RESEARCHES },
        );
      }
      return;
    }

    try {
      const check =
        await this.billingService.checkUsage(
          organizationId,
          'API_CALLS' as any,
        );
      if (check && check.allowed === false) {
        throw this.limitError(
          `API call allowance for fresh ${what} is exhausted. Cached lookups still work.`,
          {
            used: check.used,
            limit: check.limit,
          },
        );
      }
    } catch (err: any) {
      if (err?.response?.code === 'LIMIT_REACHED') {
        throw err;
      }
      /* Entitlement read failure must not block research;
         the post-success consumeUsage remains the hard
         gate. */
    }
  }

  /* Post-success metering. Returns charged=true when usage
     was recorded. Never called on failure paths. */
  private async recordFreshUsage(
    organizationId: string,
    websiteId: string | undefined,
    seed: string,
    providerCalls: number,
    cacheHits: number,
    resultCount: number,
  ): Promise<boolean> {
    try {
      await this.prisma.keywordResearchLog.create(
        {
          data: {
            organizationId,
            websiteId: websiteId ?? null,
            seed: seed.slice(0, 200),
            provider: 'DATAFORSEO',
            providerCalls,
            cacheHits,
            resultCount,
          },
        },
      );
    } catch {
      /* Ledger write failure must not fail research. */
    }

    let subscription: any = null;
    try {
      subscription =
        await this.billingService.getSubscription(
          organizationId,
        );
    } catch {
      subscription = null;
    }
    if (!subscription) return false;

    try {
      await this.billingService.consumeUsage(
        organizationId,
        'API_CALLS' as any,
        Math.max(1, providerCalls),
      );
      return true;
    } catch (err: any) {
      throw this.limitError(
        err?.message ??
          'API call allowance reached. Cached lookups still work.',
      );
    }
  }

  async usage(organizationId: string): Promise<{
    provider: string;
    configured: boolean;
    freeUsed: number;
    freeLimit: number | null;
    apiCalls: unknown;
  }> {
    const configured = isDataForSeoConfigured();
    let freeUsed = 0;
    try {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      freeUsed =
        await this.prisma.keywordResearchLog.count(
          {
            where: {
              organizationId,
              createdAt: { gte: monthStart },
            },
          },
        );
    } catch {
      freeUsed = 0;
    }

    let subscription: any = null;
    try {
      subscription =
        await this.billingService.getSubscription(
          organizationId,
        );
    } catch {
      subscription = null;
    }

    let apiCalls: unknown = null;
    if (subscription) {
      try {
        apiCalls =
          await this.billingService.checkUsage(
            organizationId,
            'API_CALLS' as any,
          );
      } catch {
        apiCalls = null;
      }
    }

    return {
      provider: 'DATAFORSEO',
      configured,
      freeUsed,
      freeLimit: subscription
        ? null
        : FREE_MONTHLY_KEYWORD_RESEARCHES,
      apiCalls,
    };
  }

  // =======================================================
  // BULK ENRICHMENT (cache-first, batched, partial-safe)
  // =======================================================

  private async enrichKeywords(
    keywords: string[],
    ctx: ProviderContext,
    refresh: boolean,
    counter: { providerCalls: number; cacheHits: number },
    ideaLevel: Map<
      string,
      {
        searchVolume: number | null;
        keywordDifficulty: number | null;
        cpc: number | null;
        competition: number | null;
        competitionLevel: string | null;
        monthlySearches: MonthlyPoint[];
        providerIntent: ProviderIntent | null;
      }
    >,
  ): Promise<Map<string, ProviderEnrichment>> {
    const out = new Map<string, ProviderEnrichment>();
    const keys = [
      ...new Set(
        keywords
          .map((k) => k.trim().toLowerCase())
          .filter(Boolean),
      ),
    ].slice(0, 300);
    if (keys.length === 0) return out;

    const metricsMap = new Map<
      string,
      NormalizedKeywordMetrics
    >();
    const difficultyMap = new Map<
      string,
      number | null
    >();
    const intentMap = new Map<
      string,
      ProviderIntent | null
    >();

    const needMetrics: string[] = [];
    const needDifficulty: string[] = [];
    const needIntent: string[] = [];

    if (!refresh) {
      for (const key of keys) {
        const [m, d, i] = await Promise.all([
          this.cache.get<NormalizedKeywordMetrics>(
            'DATAFORSEO',
            'metrics',
            ctx.country,
            ctx.language,
            key,
          ),
          this.cache.get<number | null>(
            'DATAFORSEO',
            'difficulty',
            ctx.country,
            ctx.language,
            key,
          ),
          this.cache.get<ProviderIntent | null>(
            'DATAFORSEO',
            'intent',
            ctx.country,
            ctx.language,
            key,
          ),
        ]);
        if (m) {
          counter.cacheHits++;
          metricsMap.set(key, m.value);
        } else {
          needMetrics.push(key);
        }
        if (d) {
          counter.cacheHits++;
          difficultyMap.set(key, d.value);
        } else {
          needDifficulty.push(key);
        }
        if (i) {
          counter.cacheHits++;
          intentMap.set(key, i.value);
        } else {
          needIntent.push(key);
        }
      }
    } else {
      needMetrics.push(...keys);
      needDifficulty.push(...keys);
      needIntent.push(...keys);
    }

    /* One batched provider call per metric family —
       never one request per keyword. Each family is
       independent: a failure yields nulls for that
       family only. */
    if (needMetrics.length > 0) {
      try {
        const fetched =
          await this.provider.fetchMetrics(
            needMetrics,
            ctx,
          );
        counter.providerCalls++;
        for (const [key, value] of fetched) {
          metricsMap.set(key, value);
          await this.cache.set(
            'DATAFORSEO',
            'metrics',
            ctx.country,
            ctx.language,
            key,
            value,
          );
        }
      } catch (err) {
        this.logger.warn(
          `Bulk metrics enrichment failed: ${(err as Error)?.message ?? err}`,
        );
      }
    }
    if (needDifficulty.length > 0) {
      try {
        const fetched =
          await this.provider.fetchDifficulty(
            needDifficulty,
            ctx,
          );
        counter.providerCalls++;
        for (const [key, value] of fetched) {
          difficultyMap.set(key, value);
          await this.cache.set(
            'DATAFORSEO',
            'difficulty',
            ctx.country,
            ctx.language,
            key,
            value,
          );
        }
      } catch (err) {
        this.logger.warn(
          `Bulk difficulty enrichment failed: ${(err as Error)?.message ?? err}`,
        );
      }
    }
    if (needIntent.length > 0) {
      try {
        const fetched =
          await this.provider.fetchIntent(
            needIntent,
            ctx,
          );
        counter.providerCalls++;
        for (const [key, value] of fetched) {
          intentMap.set(key, value);
          await this.cache.set(
            'DATAFORSEO',
            'intent',
            ctx.country,
            ctx.language,
            key,
            value,
          );
        }
      } catch (err) {
        this.logger.warn(
          `Bulk intent enrichment failed: ${(err as Error)?.message ?? err}`,
        );
      }
    }

    for (const key of keys) {
      const metrics = metricsMap.get(key) ?? null;
      const idea = ideaLevel.get(key) ?? null;
      const hasAny =
        metrics !== null ||
        difficultyMap.has(key) ||
        intentMap.has(key) ||
        idea !== null;
      if (!hasAny) continue;
      out.set(key, {
        metrics,
        difficulty:
          difficultyMap.get(key) ??
          metrics?.keywordDifficulty ??
          idea?.keywordDifficulty ??
          null,
        intent:
          intentMap.get(key) ??
          metrics?.providerIntent ??
          idea?.providerIntent ??
          null,
        history:
          metrics?.monthlySearches ??
          idea?.monthlySearches ??
          [],
        lastUpdated:
          metrics?.lastUpdated ?? null,
      });
    }
    return out;
  }

  // =======================================================
  // PUBLIC PRIMITIVES (strategy engine composition)
  //
  // Thin read-only wrappers over existing loaders. No
  // behavior change to research flows; the strategy
  // service composes these instead of duplicating
  // crawl/GSC/classifier logic.
  // =======================================================

  async getGscMaps(
    organizationId: string,
    range?: { startDate: string; endDate: string },
  ): Promise<{
    byQuery: Map<string, GscJoin>;
    byQueryPages: Map<
      string,
      Array<{
        page: string;
        position: number | null;
        clicks: number;
        impressions: number;
      }>
    >;
  }> {
    const [byQuery, byQueryPages] =
      await Promise.all([
        this.loadGscMap(organizationId, range),
        this.loadGscPagesMap(organizationId, range),
      ]);
    return { byQuery, byQueryPages };
  }

  async getCorpora(
    organizationId: string,
    websiteId: string,
  ): Promise<{
    website: any;
    siteCorpus: Map<string, CorpusEntry>;
    competitorCorpus: Map<
      string,
      {
        entry: CorpusEntry;
        competitorIds: Set<string>;
      }
    >;
    competitorCount: number;
  }> {
    return this.loadWebsiteCorpora(
      organizationId,
      websiteId,
    );
  }

  classifyKeyword(keyword: string): {
    intent: ResearchIntent;
    categories: string[];
  } {
    return {
      intent: this.detectIntent(keyword).primary,
      categories: this.categorize(keyword),
    };
  }

  /*
   * Pure reuse of the Opportunity 2.0 formula for a
   * single keyword. No fetching, no side effects.
   */
  scoreIdea(
    keyword: string,
    site: CorpusEntry | null,
    comp: CorpusEntry | null,
    competitorCount: number,
    extra?: {
      provider?: ProviderEnrichment | null;
      providerIdea?: {
        searchVolume: number | null;
        keywordDifficulty: number | null;
        cpc: number | null;
        competition: number | null;
        competitionLevel: string | null;
        monthlySearches: MonthlyPoint[];
        providerIntent: ProviderIntent | null;
      } | null;
      gsc?: GscJoin | null;
    },
  ): ResearchIdea {
    return this.buildIdea(
      keyword,
      site,
      comp,
      competitorCount,
      extra,
    );
  }

  getParentTopic(keyword: string): string {
    return this.titleCase(
      this.parentTopic(keyword),
    );
  }

  getPageType(intent: ResearchIntent): string {
    return this.pageTypeForIntent(intent);
  }

  // =======================================================
  // SERP (on demand per keyword, cached 3 days)
  // =======================================================

  async serp(
    organizationId: string,
    keyword: string,
    country?: string,
    language?: string,
    refresh = false,
    websiteId?: string,
  ): Promise<{
    observation: NormalizedSerpObservation;
    cached: boolean;
    fetchedAt: string;
    previousFetchedAt: string | null;
    cost: {
      providerCalls: number;
      cacheHits: number;
      fresh: boolean;
      charged: boolean;
    };
    /* Opportunity 3.0 + page strategy, present only when
       websiteId ties the SERP to first-party evidence. */
    scoring: {
      baseOpportunity: number | null;
      serpAdjustment: number;
      adjustedOpportunity: number | null;
      serpReasons: string[];
      pageDecision: PageDecision | null;
    } | null;
  }> {
    if (!isDataForSeoConfigured()) {
      throw new ForbiddenException({
        code: 'PROVIDER_NOT_CONFIGURED',
        message:
          'SERP is unavailable — no SERP provider is connected.',
      });
    }
    const ctx = this.provider.resolveContext(
      country,
      language,
    );
    const key = keyword.trim().toLowerCase();
    if (!key) {
      throw new ForbiddenException({
        code: 'INVALID_KEYWORD',
        message: 'A keyword is required.',
      });
    }

    const counter = {
      providerCalls: 0,
      cacheHits: 0,
    };
    let observation: NormalizedSerpObservation | null =
      null;
    let previousFetchedAt: string | null = null;
    let serpFresh = false;

    if (!refresh) {
      const hit = await this.cache.get<
        NormalizedSerpObservation
      >(
        'DATAFORSEO',
        'serp',
        ctx.country,
        ctx.language,
        key,
      );
      if (hit?.value) {
        counter.cacheHits++;
        observation = hit.value;
      }
    } else {
      /* Refresh keeps the previous timestamp so the UI
         can show "updated X, previously Y". */
      try {
        const existing = await this.cache.peek<
          NormalizedSerpObservation
        >(
          'DATAFORSEO',
          'serp',
          ctx.country,
          ctx.language,
          key,
        );
        previousFetchedAt =
          existing?.fetchedAt ?? null;
      } catch {
        previousFetchedAt = null;
      }
    }

    if (!observation) {
      await this.assertFreshAllowance(
        organizationId,
        'SERP intelligence',
      );
      const raw =
        await this.provider.fetchSerp(key, ctx);
      counter.providerCalls++;
      serpFresh = true;
      observation = await this.enrichSerp(
        raw,
        ctx,
        counter,
      );
      await this.cache.set(
        'DATAFORSEO',
        'serp',
        ctx.country,
        ctx.language,
        key,
        observation,
      );
    } else if (
      !observation.competition ||
      observation.results.some(
        (r) => r.pageStrength === 'Unknown',
      )
    ) {
      /* Cached SERP from before strength existed, or
         with missing strength — backfill cheaply. */
      observation = await this.enrichSerp(
        observation,
        ctx,
        counter,
      );
      await this.cache.set(
        'DATAFORSEO',
        'serp',
        ctx.country,
        ctx.language,
        key,
        observation,
      );
    }

    let charged = false;
    if (counter.providerCalls > 0) {
      charged = await this.recordFreshUsage(
        organizationId,
        websiteId,
        `serp:${key}`,
        counter.providerCalls,
        counter.cacheHits,
        observation.results.length,
      );
    }

    /* Opportunity 3.0 + page strategy (website-scoped). */
    let scoring: {
      baseOpportunity: number | null;
      serpAdjustment: number;
      adjustedOpportunity: number | null;
      serpReasons: string[];
      pageDecision: PageDecision | null;
    } | null = null;
    if (websiteId) {
      scoring = await this.scoreSerpKeyword(
        organizationId,
        websiteId,
        key,
        ctx,
        observation,
      );
    }

    return {
      observation,
      cached: !serpFresh,
      fetchedAt: observation.fetchedAt,
      previousFetchedAt,
      cost: {
        providerCalls: counter.providerCalls,
        cacheHits: counter.cacheHits,
        fresh: counter.providerCalls > 0,
        charged,
      },
      scoring,
    };
  }

  // =======================================================
  // SERP ENRICHMENT (strength + competition + intent)
  // =======================================================

  /*
   * Attach page strength to every organic result, then
   * derive competition, intent validation, feature
   * opportunities and AI presence. Strength rows are
   * cached per URL (14d) so repeat drawer opens and
   * cluster jobs reuse them for free.
   */
  private async enrichSerp(
    observation: NormalizedSerpObservation,
    ctx: ProviderContext,
    counter: { providerCalls: number; cacheHits: number },
  ): Promise<NormalizedSerpObservation> {
    const organics = observation.results.filter(
      (r) => r.isOrganic && r.url,
    );
    const strength = await this.loadPageStrength(
      organics.map((r) => r.url),
      ctx,
      counter,
    );

    const results: NormalizedSerpResult[] =
      observation.results.map((r) => {
        if (!r.isOrganic) return r;
        const norm = normalizeSerpUrl(r.url);
        const row =
          strength.get(norm) ??
          strength.get(`domain:${r.domain}`) ??
          null;
        const pageRank = row?.pageRank ?? null;
        const domainRank = row?.domainRank ?? null;
        const backlinks = row?.backlinks ?? null;
        const referringDomains =
          row?.referringDomains ?? null;
        const domainTraffic =
          row?.domainTraffic ?? null;
        const classified = classifyPageStrength({
          pageRank,
          domainRank,
          backlinks,
          referringDomains,
          domainTraffic: domainTraffic ?? null,
        });
        return {
          ...r,
          contentType:
            r.contentType && r.contentType !== 'Other'
              ? r.contentType
              : classifyContentType(
                  r.url,
                  r.title,
                ),
          domainRank,
          pageRank,
          backlinks,
          referringDomains,
          estimatedTraffic: row
            ? (row.domainTraffic ?? null)
            : null,
          pageStrength: classified.strength,
          strengthEvidence: classified.evidence,
        };
      });

    const competition = analyzeSerpCompetition(
      results
        .filter((r) => r.isOrganic)
        .map((r) => ({
          strength: r.pageStrength,
          domainRank: r.domainRank,
          pageRank: r.pageRank,
          referringDomains: r.referringDomains,
          backlinks: r.backlinks,
        })),
    );

    /* Intent validation uses the keyword's own RENKOO
       intent unless the drawer caller overrides it —
       scoreSerpKeyword recomputes with provider intent. */
    const renkooIntent =
      this.detectIntent(observation.keyword).primary;
    const pageTypes = results
      .filter((r) => r.isOrganic)
      .map((r) => r.contentType);
    const check = validateSerpIntent(
      renkooIntent,
      pageTypes as never,
    );

    const featureOpportunities =
      serpFeatureOpportunities(
        observation.features.map((f) => f.type),
      );

    const aiTypes = observation.features
      .map((f) => f.type)
      .filter((t) => isAiElement(t));
    const aiPresence = {
      detected: aiTypes.length > 0,
      elementTypes: aiTypes,
      referencedDomains: [
        ...new Set(
          results
            .filter((r) => r.isOrganic)
            .slice(0, 5)
            .map((r) => r.domain)
            .filter(Boolean),
        ),
      ],
      detail:
        aiTypes.length > 0
          ? `The provider returned ${aiTypes.join(', ')} for this SERP. Ranking pages most likely to be cited are listed as referenced domains.`
          : 'No AI Overview / AI Mode element was returned for this SERP.',
    };

    return {
      ...observation,
      results,
      competition,
      intentCheck: {
        check: check.check,
        keywordIntent: renkooIntent,
        intentSource: 'RENKOO',
        detail: check.detail,
      },
      featureOpportunities,
      aiPresence,
    };
  }

  /*
   * Page-strength rows, cache-first per URL. One bulk
   * call covers every uncached URL + domain in the SERP.
   */
  private async loadPageStrength(
    urls: string[],
    ctx: ProviderContext,
    counter: { providerCalls: number; cacheHits: number },
  ): Promise<Map<string, PageStrengthRow>> {
    const out = new Map<string, PageStrengthRow>();
    const missing: string[] = [];
    for (const url of urls) {
      const norm = normalizeSerpUrl(url);
      if (!norm) continue;
      const hit = await this.cache.get<PageStrengthRow>(
        'DATAFORSEO',
        'page_strength',
        ctx.country,
        ctx.language,
        norm,
      );
      if (hit?.value) {
        counter.cacheHits++;
        out.set(norm, hit.value);
      } else {
        missing.push(url);
      }
    }
    if (missing.length === 0) return out;

    /* Strength failure degrades to Unknown — it must
       never fail a SERP that already succeeded, and
       failed calls are never metered. */
    let fetched = new Map<string, PageStrengthRow>();
    try {
      fetched =
        await this.provider.fetchPageStrength(
          missing,
          ctx,
        );
      counter.providerCalls += 2;
    } catch {
      return out;
    }
    for (const [normKey, row] of fetched) {
      await this.cache.set(
        'DATAFORSEO',
        'page_strength',
        ctx.country,
        ctx.language,
        normKey.startsWith('domain:')
          ? row.domain
          : row.url,
        row,
      );
      out.set(normKey, row);
    }
    return out;
  }

  // =======================================================
  // PAGE DECISION + CANNIBALIZATION 2.0 + OPPORTUNITY 3.0
  // =======================================================

  /*
   * GSC query → ranking pages (last 28d, best effort).
   * Powers cannibalization detection and the
   * new-vs-existing page decision with observed data.
   */
  private async loadGscPagesMap(
    organizationId: string,
    range?: { startDate: string; endDate: string },
  ): Promise<
    Map<
      string,
      Array<{
        page: string;
        position: number | null;
        clicks: number;
        impressions: number;
      }>
    >
  > {
    const map = new Map<
      string,
      Array<{
        page: string;
        position: number | null;
        clicks: number;
        impressions: number;
      }>
    >();
    try {
      const fmt = (d: Date) =>
        d.toISOString().slice(0, 10);
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 27);
      const res: any =
        await this.googleService.getQueryPages(
          organizationId,
          range?.startDate ?? fmt(start),
          range?.endDate ?? fmt(end),
        );
      const rows: any[] = Array.isArray(res?.rows)
        ? res.rows
        : [];
      for (const row of rows) {
        const query = String(
          row?.query ?? '',
        )
          .trim()
          .toLowerCase();
        const page = String(
          row?.page ?? '',
        ).trim();
        if (!query || !page) continue;
        const list = map.get(query) ?? [];
        const position = Number(row?.position);
        list.push({
          page,
          position: Number.isFinite(position)
            ? position
            : null,
          clicks: Number(row?.clicks) || 0,
          impressions: Number(row?.impressions) || 0,
        });
        map.set(query, list);
      }
      for (const list of map.values()) {
        list.sort(
          (a, b) =>
            (a.position ?? 999) -
            (b.position ?? 999),
        );
      }
    } catch {
      /* Unconnected GSC — page decisions fall back to
         corpus evidence only. */
    }
    return map;
  }

  /*
   * New-vs-existing page decision (documented rule):
   *  - ≥2 GSC URLs with impressions → potential
   *    cannibalization; "strong" when both rank top 20 →
   *    CONSOLIDATE_PAGES.
   *  - GSC pos 4–20 → IMPROVE_EXISTING_PAGE.
   *  - GSC top 3 → TRACK_ONLY (defend).
   *  - No GSC but site corpus covers the keyword →
   *    IMPROVE_EXISTING_PAGE (optimize coverage).
   *  - No coverage + real demand (volume or gap) →
   *    CREATE_NEW_PAGE.
   *  - Otherwise TRACK_ONLY (watch) or IGNORE (avoid /
   *    no evidence).
   */
  private decidePageAction(
    keyword: string,
    site: CorpusEntry | null,
    gscPages: Array<{
      page: string;
      position: number | null;
      clicks: number;
      impressions: number;
    }>,
    targetDecision: TargetDecision,
    volume: number | null,
  ): PageDecision {
    const visible = gscPages.filter(
      (p) => p.impressions > 0,
    );
    const competingUrls = visible.slice(0, 5);
    const top20 = visible.filter(
      (p) =>
        p.position !== null && p.position <= 20,
    );

    let cannibalization: PageDecision['cannibalization'] =
      null;
    if (visible.length >= 2) {
      const strong =
        top20.length >= 2 &&
        (site?.urls.length ?? 0) >= 1;
      cannibalization = {
        detected: true,
        confidence: strong ? 'strong' : 'potential',
        urls: competingUrls,
        recommendation: strong
          ? `Potential cannibalization: ${visible.length} of your pages earn impressions for “${keyword}”. Consolidate around ${top20[0].page} or differentiate intent per page.`
          : `Potential cannibalization: ${visible.length} of your pages earn impressions for “${keyword}”. Confirm in GSC, then consolidate or differentiate.`,
      };
    } else if ((site?.urls.length ?? 0) >= 2) {
      cannibalization = {
        detected: true,
        confidence: 'potential',
        urls: (site?.urls ?? [])
          .slice(0, 5)
          .map((url) => ({
            url,
            position: null,
            clicks: 0,
            impressions: 0,
          })),
        recommendation: `Potential cannibalization: ${site?.urls.length} site pages cover “${keyword}” with no clear primary. Pick one primary URL and differentiate the rest.`,
      };
    }

    if (cannibalization?.confidence === 'strong') {
      return {
        action: 'CONSOLIDATE_PAGES',
        reason: cannibalization.recommendation!,
        primaryUrl:
          competingUrls[0]?.page ??
          site?.urls[0] ??
          null,
        competingUrls,
        cannibalization,
      };
    }

    const best = visible[0]?.position ?? null;
    if (
      best !== null &&
      best >= 4 &&
      best <= 20
    ) {
      return {
        action: 'IMPROVE_EXISTING_PAGE',
        reason: `Your page ranks #${best.toFixed(1)} for “${keyword}” — strengthening it is the fastest path to traffic.`,
        primaryUrl:
          visible[0].page ??
          site?.urls[0] ??
          null,
        competingUrls,
        cannibalization,
      };
    }
    if (
      best !== null &&
      best >= 1 &&
      best < 4
    ) {
      return {
        action: 'TRACK_ONLY',
        reason: `You already rank #${best.toFixed(1)} — defend the position and track movement.`,
        primaryUrl:
          visible[0].page ??
          site?.urls[0] ??
          null,
        competingUrls,
        cannibalization,
      };
    }
    if (site && site.pages > 0) {
      return {
        action: 'IMPROVE_EXISTING_PAGE',
        reason: `Your site covers “${keyword}” on ${site.pages} page(s) but it is not ranking yet — optimize the best-fit page for this intent.`,
        primaryUrl: site.urls[0] ?? null,
        competingUrls,
        cannibalization,
      };
    }
    if (
      targetDecision === 'TARGET_NOW' ||
      targetDecision === 'GOOD_OPPORTUNITY' ||
      (volume !== null && volume >= 500)
    ) {
      return {
        action: 'CREATE_NEW_PAGE',
        reason: `No ranking or covering page exists for “${keyword}” and demand is real — create a dedicated page.`,
        primaryUrl: null,
        competingUrls,
        cannibalization,
      };
    }
    if (targetDecision === 'AVOID') {
      return {
        action: 'IGNORE',
        reason: `“${keyword}” is not a fit for this site — ignore it.`,
        primaryUrl: null,
        competingUrls,
        cannibalization,
      };
    }
    return {
      action: 'TRACK_ONLY',
      reason: `“${keyword}” shows limited evidence — track it and revisit when demand or coverage changes.`,
      primaryUrl: null,
      competingUrls,
      cannibalization,
    };
  }

  /*
   * Opportunity 3.0: 2.0 base + SERP adjustment
   * (additive, capped, documented):
   *  +6  SERP authority weakness (>=2 weak results AND
   *      >=30% of analyzed results weak, from real ranks)
   *  +4  SERP intent match (validated vs observed types)
   *  +2  SERP feature opportunity (PAA / featured
   *      snippet / video actually present)
   *  -8  very strong SERP (>=60% strong results)
   *  -5  SERP intent mismatch
   * Reasons always cite the underlying numbers.
   */
  private applySerpSignals(
    baseScore: number,
    observation: NormalizedSerpObservation,
    keywordIntent: ResearchIntent,
    intentSource: 'PROVIDER' | 'RENKOO',
  ): {
    adjustment: number;
    adjusted: number;
    reasons: string[];
    intentCheck: NormalizedSerpObservation['intentCheck'];
  } {
    let adjustment = 0;
    const reasons: string[] = [];
    const comp = observation.competition;

    if (comp && comp.totalResults > 0) {
      if (
        comp.weakCount >= 2 &&
        comp.weakCount / comp.totalResults >= 0.3
      ) {
        adjustment += 6;
        reasons.push(
          `${comp.weakCount} of ${comp.totalResults} top results have low Page Rank — authority weakness you can beat.`,
        );
      }
      if (
        comp.strongCount / comp.totalResults >=
        0.6
      ) {
        adjustment -= 8;
        reasons.push(
          `${comp.strongCount} of ${comp.totalResults} top results have strong domain/page authority — expect a hard fight.`,
        );
      }
    }

    const pageTypes = observation.results
      .filter((r) => r.isOrganic)
      .map((r) => r.contentType);
    const validated = validateSerpIntent(
      keywordIntent,
      pageTypes as never,
    );
    const intentCheck = {
      check: validated.check,
      keywordIntent,
      intentSource,
      detail: validated.detail,
    };
    if (validated.check === 'MATCH') {
      adjustment += 4;
      reasons.push(
        `SERP intent match — ${validated.detail}`,
      );
    } else if (validated.check === 'MISMATCH') {
      adjustment -= 5;
      reasons.push(
        `SERP intent mismatch — ${validated.detail}`,
      );
    }

    const winnable =
      observation.featureOpportunities.filter(
        (f) =>
          [
            'people_also_ask',
            'featured_snippet',
            'video',
          ].includes(f.type.toLowerCase()),
      );
    if (winnable.length > 0) {
      adjustment += 2;
      reasons.push(
        `${winnable.length} winnable SERP format${winnable.length > 1 ? 's' : ''} present: ${winnable.map((f) => f.type.replace(/_/g, ' ')).join(', ')}.`,
      );
    }

    return {
      adjustment,
      adjusted: Math.min(
        100,
        Math.max(0, baseScore + adjustment),
      ),
      reasons,
      intentCheck,
    };
  }

  /*
   * Full SERP scoring for one website keyword: rebuilds
   * the 2.0 base from identical corpus evidence (shared
   * loader), joins cached provider metrics (never fresh
   * calls here), applies 3.0 SERP signals, and decides
   * the page action.
   */
  private async scoreSerpKeyword(
    organizationId: string,
    websiteId: string,
    keyword: string,
    ctx: ProviderContext,
    observation: NormalizedSerpObservation,
  ): Promise<{
    baseOpportunity: number;
    serpAdjustment: number;
    adjustedOpportunity: number;
    serpReasons: string[];
    pageDecision: PageDecision;
    volume: number | null;
    keywordDifficulty: number | null;
  }> {
    const loaded = await this.loadWebsiteCorpora(
      organizationId,
      websiteId,
    );
    const site =
      loaded.siteCorpus.get(keyword) ?? null;
    const compEntry = loaded.competitorCorpus.get(
      keyword,
    );
    const gsc = await this.loadGscMap(
      organizationId,
    );
    const gscPages = await this.loadGscPagesMap(
      organizationId,
    );

    /* Cached provider metrics only — scoring a loaded
       SERP must not trigger fresh billable lookups. */
    const [m, d, i] = await Promise.all([
      this.cache.get<NormalizedKeywordMetrics>(
        'DATAFORSEO',
        'metrics',
        ctx.country,
        ctx.language,
        keyword,
      ),
      this.cache.get<number | null>(
        'DATAFORSEO',
        'difficulty',
        ctx.country,
        ctx.language,
        keyword,
      ),
      this.cache.get<ProviderIntent | null>(
        'DATAFORSEO',
        'intent',
        ctx.country,
        ctx.language,
        keyword,
      ),
    ]);
    const enrichment = {
      metrics: m?.value ?? null,
      difficulty: d?.value ?? null,
      intent: i?.value ?? null,
      history:
        m?.value?.monthlySearches ?? [],
      lastUpdated:
        m?.value?.lastUpdated ?? null,
    };

    const idea = this.buildIdea(
      keyword,
      site,
      compEntry?.entry ?? null,
      compEntry?.competitorIds.size ?? 0,
      {
        provider: enrichment,
        providerIdea: null,
        gsc: gsc.get(keyword) ?? null,
      },
    );

    const serp3 = this.applySerpSignals(
      idea.opportunityScore,
      observation,
      idea.intent,
      idea.intentSource,
    );
    observation.intentCheck = serp3.intentCheck;

    const pageDecision = this.decidePageAction(
      keyword,
      site,
      gscPages.get(keyword) ?? [],
      idea.targetDecision,
      idea.volume,
    );

    return {
      baseOpportunity: idea.opportunityScore,
      serpAdjustment: serp3.adjustment,
      adjustedOpportunity: serp3.adjusted,
      serpReasons: serp3.reasons,
      pageDecision,
      volume: idea.volume,
      keywordDifficulty: idea.keywordDifficulty,
    };
  }

  // =======================================================
  // COMPETITOR LOOKUP (real ranking keywords + gap)
  // =======================================================

  async competitorLookup(
    organizationId: string,
    dto: {
      websiteId?: string;
      domain: string;
      country?: string;
      language?: string;
      limit?: number;
      refresh?: boolean;
      includeSerpStrength?: number;
    },
  ) {
    if (!isDataForSeoConfigured()) {
      throw new ForbiddenException({
        code: 'PROVIDER_NOT_CONFIGURED',
        message:
          'Competitor keyword data is unavailable — no provider is connected.',
      });
    }
    const ctx = this.provider.resolveContext(
      dto.country,
      dto.language,
    );
    const limit = Math.min(
      Math.max(dto.limit ?? 100, 10),
      500,
    );
    const domain = dto.domain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0];
    if (!domain) {
      throw new ForbiddenException({
        code: 'INVALID_DOMAIN',
        message:
          'A competitor domain is required.',
      });
    }

    await this.assertFreshAllowance(
      organizationId,
      'competitor lookup',
    );

    const counter = {
      providerCalls: 0,
      cacheHits: 0,
    };
    let rows: Awaited<
      ReturnType<
        DataForSeoProvider['fetchCompetitorKeywords']
      >
    > = [];
    const cached =
      dto.refresh
        ? null
        : await this.cache.get<typeof rows>(
            'DATAFORSEO',
            'competitor_keywords',
            ctx.country,
            ctx.language,
            `domain:${domain}`,
          );
    if (cached) {
      counter.cacheHits++;
      rows = cached.value;
    } else {
      rows =
        await this.provider.fetchCompetitorKeywords(
          domain,
          ctx,
          limit,
        );
      counter.providerCalls++;
      await this.cache.set(
        'DATAFORSEO',
        'competitor_keywords',
        ctx.country,
        ctx.language,
        `domain:${domain}`,
        rows,
      );
    }

    /* Compare against the user's own corpus + GSC so the
       gap stays grounded in first-party evidence. Provider
       rows and GSC rows are labeled, never confused. */
    let siteKeywords = new Set<string>();
    if (dto.websiteId) {
      try {
        const loaded = await this.loadWebsiteCorpora(
          organizationId,
          dto.websiteId,
        );
        siteKeywords = new Set(
          loaded.siteCorpus.keys(),
        );
      } catch {
        /* Unknown website — gap still works on provider
           data alone. */
      }
    }
    const gsc = dto.websiteId
      ? await this.loadGscMap(organizationId)
      : new Map<string, GscJoin>();

    const missing: typeof rows = [];
    const shared: typeof rows = [];
    for (const row of rows.slice(0, limit)) {
      const mine =
        siteKeywords.has(row.keyword) ||
        gsc.has(row.keyword);
      if (mine) shared.push(row);
      else missing.push(row);
    }

    /* Competitor domain strength (1 bulk call, cached
       per domain). Answers "how strong is this rival?". */
    let domainStrength: {
      domainRank: number | null;
      domainTraffic: number | null;
      dataSource: string;
    } | null = null;
    try {
      const cachedDomain =
        await this.cache.get<PageStrengthRow>(
          'DATAFORSEO',
          'page_strength',
          ctx.country,
          ctx.language,
          domain,
        );
      if (cachedDomain?.value) {
        counter.cacheHits++;
        domainStrength = {
          domainRank:
            cachedDomain.value.domainRank,
          domainTraffic:
            cachedDomain.value.domainTraffic,
          dataSource: 'DATAFORSEO',
        };
      } else {
        const fetched =
          await this.provider.fetchPageStrength(
            [domain],
            ctx,
          );
        counter.providerCalls += 2;
        const row =
          fetched.get(`domain:${domain}`) ??
          [...fetched.values()][0] ??
          null;
        if (row) {
          await this.cache.set(
            'DATAFORSEO',
            'page_strength',
            ctx.country,
            ctx.language,
            domain,
            row,
          );
          domainStrength = {
            domainRank: row.domainRank,
            domainTraffic: row.domainTraffic,
            dataSource: 'DATAFORSEO',
          };
        }
      }
    } catch {
      domainStrength = null;
    }

    /* SERP strength for top missing keywords
       (opt-in, bounded). Answers "why should I care?". */
    const includeN = Math.min(
      10,
      Math.max(0, dto.includeSerpStrength ?? 0),
    );
    const topMissing = [...missing]
      .sort(
        (a, b) =>
          (b.searchVolume ?? -1) -
          (a.searchVolume ?? -1),
      )
      .slice(0, includeN);
    const missingSerp: Array<{
      keyword: string;
      competitorPosition: number | null;
      competitorUrl: string | null;
      volume: number | null;
      keywordDifficulty: number | null;
      serpVerdict:
        | 'OPPORTUNITY'
        | 'MODERATE'
        | 'HARD'
        | 'UNKNOWN';
      weakCount: number;
      totalResults: number;
      whyItMatters: string;
    }> = [];
    for (const row of topMissing) {
      try {
        let obs =
          !dto.refresh
            ? (
                await this.cache.get<NormalizedSerpObservation>(
                  'DATAFORSEO',
                  'serp',
                  ctx.country,
                  ctx.language,
                  row.keyword,
                )
              )?.value ?? null
            : null;
        if (!obs) {
          const raw =
            await this.provider.fetchSerp(
              row.keyword,
              ctx,
            );
          counter.providerCalls++;
          obs = await this.enrichSerp(
            raw,
            ctx,
            counter,
          );
          await this.cache.set(
            'DATAFORSEO',
            'serp',
            ctx.country,
            ctx.language,
            row.keyword,
            obs,
          );
        }
        const comp = obs.competition;
        const verdict = comp?.verdict ?? 'UNKNOWN';
        const weak = comp?.weakCount ?? 0;
        const total = comp?.totalResults ?? 0;
        const pos =
          row.position !== null
            ? `Competitor ranks #${row.position}`
            : 'Competitor ranks';
        const weakBit =
          verdict === 'OPPORTUNITY'
            ? ` The SERP has ${weak} relatively weak page(s) out of ${total}.`
            : verdict === 'HARD'
              ? ` The SERP is authority-heavy (${comp?.strongCount ?? 0}/${total} strong).`
              : '';
        missingSerp.push({
          keyword: row.keyword,
          competitorPosition: row.position,
          competitorUrl: row.rankingUrl,
          volume: row.searchVolume,
          keywordDifficulty: row.keywordDifficulty,
          serpVerdict: verdict,
          weakCount: weak,
          totalResults: total,
          whyItMatters: `${pos}. Your domain has no ranking URL.${weakBit}`,
        });
      } catch {
        /* One keyword's SERP must not fail the lookup. */
      }
    }

    const caps = providerCapabilities();
    const cost = {
      providerCalls: counter.providerCalls,
      cacheHits: counter.cacheHits,
      fresh: counter.providerCalls > 0,
      charged: false as boolean,
    };
    if (counter.providerCalls > 0) {
      cost.charged = await this.recordFreshUsage(
        organizationId,
        dto.websiteId,
        `competitor:${domain}`,
        counter.providerCalls,
        counter.cacheHits,
        rows.length,
      );
    }

    return {
      domain,
      country: ctx.country,
      language: ctx.language,
      locationFallback: ctx.locationFallback,
      provider: 'DATAFORSEO',
      summary: {
        total: rows.length,
        missing: missing.length,
        shared: shared.length,
      },
      domainStrength,
      availability: caps.metrics,
      cost,
      missingKeywords: missing,
      sharedKeywords: shared,
      missingSerp,
    };
  }

  // =======================================================
  // QUICK WINS 2.0 (GSC striking distance x provider data)
  // =======================================================

  async quickWins(
    organizationId: string,
    dto: {
      websiteId: string;
      startDate: string;
      endDate: string;
      country?: string;
      language?: string;
      limit?: number;
    },
  ) {
    const website =
      await this.prisma.website.findFirst({
        where: {
          id: dto.websiteId,
          organizationId,
        },
      });
    if (!website) {
      throw new NotFoundException(
        'Website not found',
      );
    }

    let rows: any[] = [];
    try {
      const res: any =
        await this.googleService.getSearchQueries(
          organizationId,
          dto.startDate,
          dto.endDate,
        );
      rows = Array.isArray(res?.rows)
        ? res.rows
        : [];
    } catch (err: any) {
      throw new ForbiddenException({
        code: 'GSC_UNAVAILABLE',
        message:
          err?.message ??
          'Search Console data is unavailable.',
      });
    }

    const striking = rows
      .map((r: any) => ({
        keyword: String(
          r?.query ?? r?.keys?.[0] ?? '',
        ).trim(),
        position: Number(r?.position),
        clicks: Number(r?.clicks) || 0,
        impressions: Number(r?.impressions) || 0,
        ctr: Number(r?.ctr) || 0,
        page: r?.page ? String(r.page) : null,
      }))
      .filter(
        (r) =>
          r.keyword &&
          r.position >= 4 &&
          r.position <= 20 &&
          r.impressions >= 50,
      )
      .sort(
        (a, b) => b.impressions - a.impressions,
      )
      .slice(
        0,
        Math.min(Math.max(dto.limit ?? 50, 10), 100),
      );

    let enrichment = new Map<
      string,
      ProviderEnrichment
    >();
    let cost = {
      providerCalls: 0,
      cacheHits: 0,
      fresh: false,
      charged: false,
    };
    if (
      isDataForSeoConfigured() &&
      striking.length > 0
    ) {
      const ctx = this.provider.resolveContext(
        dto.country,
        dto.language,
      );
      await this.assertFreshAllowance(
        organizationId,
        'quick wins',
      );
      const counter = {
        providerCalls: 0,
        cacheHits: 0,
      };
      enrichment = await this.enrichKeywords(
        striking.map((s) => s.keyword),
        ctx,
        false,
        counter,
        new Map(),
      );
      cost = {
        providerCalls: counter.providerCalls,
        cacheHits: counter.cacheHits,
        fresh: counter.providerCalls > 0,
        charged: false,
      };
      if (counter.providerCalls > 0) {
        cost.charged = await this.recordFreshUsage(
          organizationId,
          dto.websiteId,
          'quick-wins',
          counter.providerCalls,
          counter.cacheHits,
          striking.length,
        );
      }
    }

    const out = striking.map((s) => {
      const e = enrichment.get(
        s.keyword.toLowerCase(),
      );
      const kd = e?.difficulty ?? null;
      const manageable = kd === null || kd <= 65;
      const opportunity =
        (s.position <= 10 ? 40 : 25) +
        (s.impressions >= 500
          ? 30
          : s.impressions >= 100
            ? 20
            : 10) +
        (s.ctr < 0.03 ? 15 : 5) +
        (kd !== null && kd <= 30
          ? 10
          : kd !== null && kd <= 50
            ? 5
            : 0);
      return {
        keyword: s.keyword,
        position: Number(s.position.toFixed(1)),
        volume: e?.metrics?.searchVolume ?? null,
        keywordDifficulty:
          kd !== null ? Math.round(kd) : null,
        clicks: s.clicks,
        impressions: s.impressions,
        ctr: Number(s.ctr.toFixed(4)),
        opportunity: Math.min(100, opportunity),
        rankingUrl: s.page,
        manageable,
        dataSource: e ? 'DATAFORSEO+GSC' : 'GSC',
        metricUpdatedAt:
          e?.lastUpdated ?? null,
        recommendedAction:
          s.position <= 10
            ? 'Strengthen the ranking page to push into the top 3.'
            : 'Improve content depth and internal linking to reach page one.',
      };
    });

    out.sort(
      (a, b) => b.opportunity - a.opportunity,
    );
    const caps = providerCapabilities();
    return {
      website: {
        id: website.id,
        name: website.name,
        url: website.url,
      },
      summary: {
        total: out.length,
        manageable: out.filter((o) => o.manageable)
          .length,
      },
      availability: caps.metrics,
      cost,
      quickWins: out,
    };
  }

  // =======================================================
  // UNIVERSE (browse without a seed)
  // =======================================================

  async universe(
    organizationId: string,
    websiteId: string,
    limit = 100,
  ) {
    const loaded = await this.loadWebsiteCorpora(
      organizationId,
      websiteId,
    );
    const website = loaded.website;
    const siteCorpus = loaded.siteCorpus;
    const competitorCorpus =
      loaded.competitorCorpus;
    const competitorCount = loaded.competitorCount;

    const shortlist: Array<{
      key: string;
      site: CorpusEntry | null;
      comp: CorpusEntry | null;
      ids: number;
      weight: number;
    }> = [];
    const allKeys = new Set<string>([
      ...siteCorpus.keys(),
      ...competitorCorpus.keys(),
    ]);

    for (const key of allKeys) {
      const site = siteCorpus.get(key);
      const comp = competitorCorpus.get(key);
      /* Universe view: skip ultra-thin single-mention
         phrases so the table stays decision-grade. */
      const occurrences =
        (site?.occurrences ?? 0) +
        (comp?.entry.occurrences ?? 0);
      if (
        occurrences < 2 &&
        (site?.pages ?? 0) < 2
      )
        continue;
      shortlist.push({
        key,
        site: site ?? null,
        comp: comp?.entry ?? null,
        ids: comp?.competitorIds.size ?? 0,
        weight:
          (site?.relevanceScore ?? 0) +
          (comp?.entry.relevanceScore ?? 0),
      });
    }

    /* Enrich the strongest candidates only (bounded
       provider cost), then score everything. */
    shortlist.sort((a, b) => b.weight - a.weight);
    const enrichable = shortlist.slice(0, 150);
    const gsc = await this.loadGscMap(
      organizationId,
    );

    let enrichment = new Map<
      string,
      ProviderEnrichment
    >();
    const counter = {
      providerCalls: 0,
      cacheHits: 0,
    };
    let ctx: ProviderContext | null = null;
    if (isDataForSeoConfigured() && enrichable.length > 0) {
      ctx = this.provider.resolveContext();
      await this.assertFreshAllowance(
        organizationId,
        'keyword universe',
      );
      enrichment = await this.enrichKeywords(
        enrichable.map((s) => s.key),
        ctx,
        false,
        counter,
        new Map(),
      );
    }

    const ideas: ResearchIdea[] = shortlist.map(
      (s) =>
        this.buildIdea(
          s.key,
          s.site,
          s.comp,
          s.ids,
          {
            provider:
              enrichment.get(s.key) ?? null,
            providerIdea: null,
            gsc: gsc.get(s.key) ?? null,
          },
        ),
    );

    ideas.sort(
      (a, b) =>
        b.opportunityScore -
        a.opportunityScore,
    );

    const sliced = ideas.slice(
      0,
      Math.min(Math.max(limit, 10), 200),
    );
    const caps = providerCapabilities();

    let cost = {
      providerCalls: counter.providerCalls,
      cacheHits: counter.cacheHits,
      fresh: counter.providerCalls > 0,
      charged: false,
    };
    if (counter.providerCalls > 0) {
      cost.charged = await this.recordFreshUsage(
        organizationId,
        websiteId,
        'universe',
        counter.providerCalls,
        counter.cacheHits,
        sliced.length,
      );
    }

    return {
      website: {
        id: website.id,
        name: website.name,
        url: website.url,
      },
      provider: isDataForSeoConfigured()
        ? 'DATAFORSEO'
        : 'NONE',
      corpus: {
        sitePhrases: siteCorpus.size,
        competitorPhrases:
          competitorCorpus.size,
        competitorsCovered: competitorCount,
        siteCrawled: siteCorpus.size > 0,
      },
      summary: this.summarize(sliced),
      availability: caps.metrics,
      providers: caps.providers,
      cost,
      clusteringBasis:
        'Token overlap + parent-topic grouping over real keyword properties and intent. SERP-similarity clustering is not applied (SERP is fetched on demand per keyword, never bulk-prefetched).',
      ideas: sliced,
      clusters: this.clusterIdeas(sliced),
    };
  }

  // =======================================================
  // CLUSTERING (token-overlap + parent-topic grouping)
  // =======================================================

  cluster(
    keywords: string[],
    enrichment?: Map<string, ResearchIdea>,
  ) {
    const items = keywords
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 200);

    const groups = new Map<
      string,
      string[]
    >();

    for (const kw of items) {
      const parent = this.parentTopic(kw);
      let placed = false;

      for (const [key, members] of groups) {
        /* Match against every member, not just the
           first — siblings join through each other. */
        const hit = members.some(
          (member) =>
            this.jaccard(kw, member) >= 0.33 ||
            this.parentTopic(member) ===
              parent ||
            this.jaccard(
              this.parentTopic(member),
              parent,
            ) >= 0.5,
        );
        if (hit) {
          members.push(kw);
          placed = true;
          break;
        }
        void key;
      }

      if (!placed) {
        groups.set(parent, [kw]);
      }
    }

    /* Second pass: merge clusters that match through
       any cross-member pair (removes input-order bias). */
    let merged = true;
    while (merged) {
      merged = false;
      const entries = Array.from(groups.entries());
      outer: for (let a = 0; a < entries.length; a++) {
        for (let b = a + 1; b < entries.length; b++) {
          const [, aMembers] = entries[a];
          const [bKey, bMembers] = entries[b];
          const hit = aMembers.some((m) =>
            bMembers.some(
              (n) =>
                this.jaccard(m, n) >= 0.33 ||
                this.parentTopic(m) ===
                  this.parentTopic(n) ||
                this.jaccard(
                  this.parentTopic(m),
                  this.parentTopic(n),
                ) >= 0.5,
            ),
          );
          if (hit) {
            aMembers.push(...bMembers);
            groups.delete(bKey);
            merged = true;
            break outer;
          }
        }
      }
    }

    return (
      Array.from(groups.entries())
        .map(([parent, members]) => {
          const enriched = members
            .map((m) => enrichment?.get(m))
            .filter(Boolean) as ResearchIdea[];

          const sorted = [...members].sort(
            (a, b) => {
              const sa =
                enrichment?.get(a)
                  ?.opportunityScore ?? 0;
              const sb =
                enrichment?.get(b)
                  ?.opportunityScore ?? 0;
              if (sb !== sa) return sb - sa;
              return (
                a.split(' ').length -
                b.split(' ').length
              );
            },
          );

          const primary = sorted[0];
          const primaryIdea =
            enrichment?.get(primary);
          const intent =
            primaryIdea?.intent ??
            this.detectIntent(primary).primary;

          const avgOpp = enriched.length
            ? Math.round(
                enriched.reduce(
                  (s, e) =>
                    s + e.opportunityScore,
                  0,
                ) / enriched.length,
              )
            : null;

          return {
            cluster: this.titleCase(parent),
            primaryKeyword: primary,
            supportingKeywords: sorted.slice(
              1,
            ),
            size: members.length,
            intent,
            avgOpportunity: avgOpp,
            recommendedPageType:
              this.pageTypeForIntent(intent),
            groupingReason:
              'Grouped because these queries share the same parent topic and overlapping search terms.',
          };
        })
        .sort((a, b) => b.size - a.size)
    );
  }

  clusterIdeas(ideas: ResearchIdea[]) {
    const enrichment = new Map(
      ideas.map((i) => [i.keyword, i]),
    );
    return this.cluster(
      ideas.map((i) => i.keyword),
      enrichment,
    ).slice(0, 20);
  }

  // =======================================================
  // SERP-SIMILARITY CLUSTERING (bulk job, cost-guarded)
  // =======================================================

  /*
   * Groups keywords whose top-10 ranking URLs overlap
   * (Jaccard >= threshold). Same SERP ⇒ same intent ⇒
   * one page. Intent-family splits keep commercial and
   * informational queries on separate pages even when
   * their SERPs overlap.
   *
   * Cost guards (§18–19): cache-first SERPs, maxSerp cap
   * (default 25), bounded concurrency, allowance gate,
   * post-success metering. Smart sampling: striking-
   * distance GSC keywords first, then input order.
   */
  async clusterBySerp(
    organizationId: string,
    dto: {
      websiteId?: string;
      keywords: string[];
      country?: string;
      language?: string;
      maxSerp?: number;
      threshold?: number;
      refresh?: boolean;
    },
  ): Promise<{
    threshold: number;
    basis: string;
    analyzed: number;
    fromCache: number;
    fresh: number;
    skipped: number;
    cost: {
      providerCalls: number;
      cacheHits: number;
      fresh: boolean;
      charged: boolean;
    };
    clusters: Array<{
      name: string;
      primaryKeyword: string;
      supportingKeywords: string[];
      serpSimilarity: number | null;
      size: number;
      intent: ResearchIntent;
      intentSource: 'PROVIDER' | 'RENKOO';
      volume: number | null;
      keywordDifficulty: number | null;
      pageDecision: PageDecision | null;
      recommendedPageType: string;
      splitNote: string | null;
    }>;
    unclustered: string[];
  }> {
    if (!isDataForSeoConfigured()) {
      throw new ForbiddenException({
        code: 'PROVIDER_NOT_CONFIGURED',
        message:
          'SERP-similarity clustering needs a SERP provider. The RENKOO semantic fallback (POST /keywords/clusters) still works.',
      });
    }
    const ctx = this.provider.resolveContext(
      dto.country,
      dto.language,
    );
    const threshold = Math.min(
      0.9,
      Math.max(
        0.1,
        dto.threshold ?? serpSimilarityThreshold(),
      ),
    );
    const maxSerp = Math.min(
      MAX_SERP_PER_CLUSTER_JOB,
      Math.max(1, dto.maxSerp ?? DEFAULT_SERP_PER_CLUSTER_JOB),
    );

    const keywords = [
      ...new Set(
        (dto.keywords ?? [])
          .map((k) => k.trim().toLowerCase())
          .filter(Boolean),
      ),
    ].slice(0, 200);
    if (keywords.length === 0) {
      throw new ForbiddenException({
        code: 'INVALID_KEYWORDS',
        message:
          'At least one keyword is required.',
      });
    }

    /* Smart sampling: striking-distance GSC keywords
       carry the most decision value — analyze them
       first, then fill up to maxSerp in input order. */
    let ordered = [...keywords];
    let gsc = new Map<string, GscJoin>();
    if (dto.websiteId) {
      gsc = await this.loadGscMap(organizationId);
      const striking = new Set(
        [...gsc.entries()]
          .filter(
            ([, v]) =>
              v.position !== null &&
              v.position >= 4 &&
              v.position <= 20,
          )
          .map(([k]) => k),
      );
      ordered = [
        ...ordered.filter((k) => striking.has(k)),
        ...ordered.filter((k) => !striking.has(k)),
      ];
    }
    const targets = ordered.slice(0, maxSerp);
    const skipped = ordered.length - targets.length;

    const counter = {
      providerCalls: 0,
      cacheHits: 0,
    };

    /* Cache-first pass so the allowance gate only fires
       when fresh spend is actually needed. */
    const observations = new Map<
      string,
      NormalizedSerpObservation
    >();
    const missing: string[] = [];
    if (!dto.refresh) {
      for (const key of targets) {
        const hit = await this.cache.get<
          NormalizedSerpObservation
        >(
          'DATAFORSEO',
          'serp',
          ctx.country,
          ctx.language,
          key,
        );
        if (hit?.value) {
          counter.cacheHits++;
          observations.set(key, hit.value);
        } else {
          missing.push(key);
        }
      }
    } else {
      missing.push(...targets);
    }

    if (missing.length > 0) {
      await this.assertFreshAllowance(
        organizationId,
        'SERP clustering',
      );
      const settled = await mapLimit(
        missing,
        3,
        async (key) => {
          const raw =
            await this.provider.fetchSerp(key, ctx);
          const enriched = await this.enrichSerp(
            raw,
            ctx,
            counter,
          );
          await this.cache.set(
            'DATAFORSEO',
            'serp',
            ctx.country,
            ctx.language,
            key,
            enriched,
          );
          return { key, enriched } as const;
        },
      );
      for (let idx = 0; idx < settled.length; idx++) {
        const res = settled[idx];
        if (res.ok) {
          counter.providerCalls++;
          observations.set(
            res.value.key,
            res.value.enriched,
          );
        }
        /* Partial SERP failure: the keyword stays out
           of similarity clustering (listed unclustered),
           never a failed job. Strength failures inside
           enrichSerp already degrade to Unknown. */
      }
    }

    /* Cached metrics for volume/KD/intent (no fresh
       calls in the clustering path). */
    const meta = new Map<
      string,
      {
        volume: number | null;
        kd: number | null;
        intent: ResearchIntent;
        intentSource: 'PROVIDER' | 'RENKOO';
      }
    >();
    await Promise.all(
      [...observations.keys()].map(async (key) => {
        const [m, d, i] = await Promise.all([
          this.cache.get<NormalizedKeywordMetrics>(
            'DATAFORSEO',
            'metrics',
            ctx.country,
            ctx.language,
            key,
          ),
          this.cache.get<number | null>(
            'DATAFORSEO',
            'difficulty',
            ctx.country,
            ctx.language,
            key,
          ),
          this.cache.get<ProviderIntent | null>(
            'DATAFORSEO',
            'intent',
            ctx.country,
            ctx.language,
            key,
          ),
        ]);
        const renkoo = this.detectIntent(key).primary;
        let intent = renkoo;
        let intentSource: 'PROVIDER' | 'RENKOO' =
          'RENKOO';
        const prov = i?.value ?? null;
        if (prov) {
          intentSource = 'PROVIDER';
          intent =
            prov === 'transactional'
              ? 'TRANSACTIONAL'
              : prov === 'commercial'
                ? 'COMMERCIAL'
                : prov === 'navigational'
                  ? 'NAVIGATIONAL'
                  : 'INFORMATIONAL';
        }
        meta.set(key, {
          volume: m?.value?.searchVolume ?? null,
          kd:
            d?.value ??
            m?.value?.keywordDifficulty ??
            null,
          intent,
          intentSource,
        });
      }),
    );

    /* Pairwise Jaccard over top-10 normalized URLs. */
    const analyzedKeys = [...observations.keys()];
    const urlSets = new Map<string, string[]>(
      analyzedKeys.map((key) => [
        key,
        (observations.get(key)?.results ?? [])
          .filter((r) => r.isOrganic && r.url)
          .slice(0, 10)
          .map((r) => normalizeSerpUrl(r.url))
          .filter(Boolean),
      ]),
    );
    const groupIdx = clusterByOverlap(
      analyzedKeys.map(
        (key) => urlSets.get(key) ?? [],
      ),
      threshold,
    );

    /* Intent-family split: commercial and informational
       queries need separate pages even on overlap. */
    const clusters: Awaited<
      ReturnType<KeywordResearchService['clusterBySerp']>
    >['clusters'] = [];
    const unclustered: string[] = ordered.filter(
      (k) => !observations.has(k),
    );

    let corpora: {
      siteCorpus: Map<string, CorpusEntry>;
    } | null = null;
    let gscPages: Map<
      string,
      Array<{
        page: string;
        position: number | null;
        clicks: number;
        impressions: number;
      }>
    > = new Map();
    if (dto.websiteId) {
      try {
        const loaded = await this.loadWebsiteCorpora(
          organizationId,
          dto.websiteId,
        );
        corpora = {
          siteCorpus: loaded.siteCorpus,
        };
        gscPages = await this.loadGscPagesMap(
          organizationId,
        );
      } catch {
        corpora = null;
      }
    }

    for (const idxs of groupIdx) {
      const members = idxs.map(
        (i) => analyzedKeys[i],
      );
      /* Family subgroups; 'other' joins the largest. */
      const byFamily = new Map<string, string[]>();
      for (const kw of members) {
        const fam = intentFamily(
          meta.get(kw)?.intent ?? 'INFORMATIONAL',
        );
        const list = byFamily.get(fam) ?? [];
        list.push(kw);
        byFamily.set(fam, list);
      }
      /* 'other'-family keywords join the largest real
         family; commercial vs informational always
         split into separate pages. */
      const commercial =
        byFamily.get('commercial') ?? [];
      const informational =
        byFamily.get('informational') ?? [];
      const other = byFamily.get('other') ?? [];
      const biggest =
        commercial.length >= informational.length
          ? commercial
          : informational;
      const smallest =
        commercial.length >= informational.length
          ? informational
          : commercial;
      biggest.push(...other);
      const splitOccurred = smallest.length > 0;
      const subgroups: string[][] = splitOccurred
        ? [biggest, smallest].filter(
            (g) => g.length > 0,
          )
        : [members];

      for (const group of subgroups) {
        /* Primary: highest volume, then lowest KD,
           then shortest keyword. */
        const sorted = [...group].sort((a, b) => {
          const va = meta.get(a)?.volume ?? -1;
          const vb = meta.get(b)?.volume ?? -1;
          if (vb !== va) return vb - va;
          const ka = meta.get(a)?.kd ?? 999;
          const kb = meta.get(b)?.kd ?? 999;
          if (ka !== kb) return ka - kb;
          return a.length - b.length;
        });
        const primary = sorted[0];
        const supporting = sorted.slice(1);

        /* Cohesion = minimum pairwise similarity in
           the final group (honest lower bound). */
        let cohesion: number | null = null;
        if (group.length > 1) {
          let min = 1;
          for (let a = 0; a < group.length; a++) {
            for (
              let b = a + 1;
              b < group.length;
              b++
            ) {
              const s = jaccardSimilarity(
                urlSets.get(group[a]) ?? [],
                urlSets.get(group[b]) ?? [],
              );
              if (s < min) min = s;
            }
          }
          cohesion = min;
        }

        const pMeta = meta.get(primary);
        const intent =
          pMeta?.intent ?? 'INFORMATIONAL';
        let pageDecision = null;
        if (dto.websiteId && corpora) {
          const site =
            corpora.siteCorpus.get(primary) ??
            null;
          pageDecision = this.decidePageAction(
            primary,
            site,
            gscPages.get(primary) ?? [],
            'WATCH',
            pMeta?.volume ?? null,
          );
        }

        clusters.push({
          name: this.titleCase(
            this.parentTopic(primary),
          ),
          primaryKeyword: primary,
          supportingKeywords: supporting,
          serpSimilarity: cohesion,
          size: group.length,
          intent,
          intentSource:
            pMeta?.intentSource ?? 'RENKOO',
          volume: pMeta?.volume ?? null,
          keywordDifficulty:
            pMeta?.kd !== null &&
            pMeta?.kd !== undefined
              ? Math.round(pMeta.kd)
              : null,
          pageDecision,
          recommendedPageType:
            this.pageTypeForIntent(intent),
          splitNote: splitOccurred
            ? 'These keywords share vocabulary but show different SERP intent — commercial and informational queries need separate pages.'
            : null,
        });
      }
    }

    clusters.sort((a, b) => {
      if (b.size !== a.size) return b.size - a.size;
      return (
        (b.volume ?? -1) - (a.volume ?? -1)
      );
    });

    let charged = false;
    if (counter.providerCalls > 0) {
      charged = await this.recordFreshUsage(
        organizationId,
        dto.websiteId,
        `serp-cluster:${targets.length} keywords`,
        counter.providerCalls,
        counter.cacheHits,
        clusters.length,
      );
    }

    return {
      threshold,
      basis: `SERP similarity (Jaccard over normalized top-10 ranking URLs, threshold ${threshold.toFixed(2)}) with intent-family split. ${unclustered.length > 0 ? `${unclustered.length} keyword(s) had no usable SERP and were left unclustered.` : 'All analyzed keywords clustered.'}`,
      analyzed: observations.size,
      fromCache: counter.cacheHits,
      fresh: counter.providerCalls,
      skipped,
      cost: {
        providerCalls: counter.providerCalls,
        cacheHits: counter.cacheHits,
        fresh: counter.providerCalls > 0,
        charged,
      },
      clusters,
      unclustered,
    };
  }

  // =======================================================
  // IDEA BUILDER + OPPORTUNITY SCORE
  // =======================================================

  private buildIdea(
    keyword: string,
    site: CorpusEntry | null,
    comp: CorpusEntry | null,
    competitorCount: number,
    extra?: {
      provider?: ProviderEnrichment | null;
      providerIdea?: {
        searchVolume: number | null;
        keywordDifficulty: number | null;
        cpc: number | null;
        competition: number | null;
        competitionLevel: string | null;
        monthlySearches: MonthlyPoint[];
        providerIntent: ProviderIntent | null;
      } | null;
      gsc?: GscJoin | null;
    },
  ): ResearchIdea {
    const renkoo = this.detectIntent(keyword);
    const providerIntent =
      extra?.provider?.intent ??
      extra?.providerIdea?.providerIntent ??
      null;

    /* Provider intent wins for the primary when present;
       RENKOO extras (comparison, buyer-research, local…)
       survive in categories. Never double-counted. */
    let intent: ResearchIntent;
    let intentSource: 'PROVIDER' | 'RENKOO';
    if (providerIntent) {
      intentSource = 'PROVIDER';
      switch (providerIntent) {
        case 'transactional':
          intent = 'TRANSACTIONAL';
          break;
        case 'commercial':
          intent = 'COMMERCIAL';
          break;
        case 'navigational':
          intent = 'NAVIGATIONAL';
          break;
        default:
          intent = 'INFORMATIONAL';
          break;
      }
    } else {
      intentSource = 'RENKOO';
      intent = renkoo.primary;
    }

    const categories = this.categorize(
      keyword,
    );

    const sources: IdeaSource[] = [];
    if (site) sources.push('SITE_CORPUS');
    if (comp)
      sources.push('COMPETITOR_CORPUS');
    if (
      extra?.provider ||
      extra?.providerIdea
    )
      sources.push('PROVIDER');
    if (sources.length === 0)
      sources.push('DERIVED_FROM_SEED');

    /* Real provider numbers (null = unavailable). */
    const metrics =
      extra?.provider?.metrics ?? null;
    const volume =
      metrics?.searchVolume ??
      extra?.providerIdea?.searchVolume ??
      null;
    const kd =
      extra?.provider?.difficulty ??
      metrics?.keywordDifficulty ??
      extra?.providerIdea?.keywordDifficulty ??
      null;
    const cpc =
      metrics?.cpc ??
      extra?.providerIdea?.cpc ??
      null;
    const monthly =
      metrics?.monthlySearches ??
      extra?.provider?.history ??
      extra?.providerIdea?.monthlySearches ??
      [];
    const gsc = extra?.gsc ?? null;

    let score = 0;
    const reasons: string[] = [];

    const compRel = comp?.relevanceScore ?? 0;
    const compPages = comp?.pages ?? 0;

    /* Corpus: competitor demand up to 25. */
    if (comp) {
      const demand = Math.min(
        25,
        Math.round(
          compRel * 0.22 +
            Math.min(8, compPages * 2),
        ),
      );
      score += demand;
      if (demand >= 10) {
        reasons.push(
          `Competitor pages target this topic (${compPages} page${compPages === 1 ? '' : 's'}).`,
        );
      }
    }

    /* Corpus: keyword gap. */
    if (comp && !site) {
      score += 12;
      reasons.push(
        'Competitors cover this and your site does not — a content gap.',
      );
    }

    /* Corpus: site foothold up to 15. */
    const siteRel = site?.relevanceScore ?? 0;
    if (site) {
      const foothold = Math.min(
        15,
        Math.round(6 + siteRel * 0.1),
      );
      score += foothold;
      reasons.push(
        `Your site already covers this on ${site.pages} page${site.pages === 1 ? '' : 's'} — strengthening it can move visibility.`,
      );
    }

    /* Intent value up to 12 (single source). */
    const bonus = this.intentBonus(intent);
    score += bonus;
    if (bonus >= 10) {
      reasons.push(
        `${this.intentLabel(intent)} intent (${intentSource === 'PROVIDER' ? 'provider-classified' : 'RENKOO-classified'}) — close to revenue or a buying decision.`,
      );
    }

    /* Corpus: multi-competitor consensus. */
    if (competitorCount >= 2) {
      score += 8;
      reasons.push(
        `${competitorCount} competitors cover this topic — validated demand signal.`,
      );
    }

    /* Corpus: specificity. */
    const words = keyword.split(' ').length;
    if (categories.includes('questions')) {
      score += 8;
      reasons.push(
        'Question query — matches a specific search task your content can answer directly.',
      );
    } else if (words >= 4) {
      score += 5;
      reasons.push(
        'Specific long-tail query — typically less contested and easier to satisfy precisely.',
      );
    }

    /* Provider: search demand up to 15 (log-scaled). */
    if (volume !== null && volume > 0) {
      const demand =
        volume >= 10000
          ? 15
          : volume >= 1000
            ? 10
            : volume >= 100
              ? 6
              : 3;
      score += demand;
      reasons.push(
        `${this.fmtVolume(volume)} monthly searches${metrics ? '' : ' (provider idea-level)'}.`,
      );
    }

    /* Provider: KD manageability up to +10 / -8. */
    if (kd !== null) {
      if (kd <= 25) {
        score += 10;
        reasons.push(
          `KD ${Math.round(kd)} (Easy) — realistic to rank with a focused page.`,
        );
      } else if (kd <= 45) {
        score += 6;
        reasons.push(
          `KD ${Math.round(kd)} (Moderate) — winnable with strong content and links.`,
        );
      } else if (kd <= 65) {
        score += 2;
      } else if (kd > 80) {
        score -= 8;
        reasons.push(
          `KD ${Math.round(kd)} (Very hard) — SERP dominated by authorities; expect a long fight.`,
        );
      }
    }

    /* Provider: CPC commercial value up to 5. */
    if (cpc !== null && cpc > 0) {
      const value =
        cpc >= 3 ? 5 : cpc >= 1 ? 3 : 1;
      score += value;
      if (value >= 3) {
        reasons.push(
          `CPC $${cpc.toFixed(2)} — advertisers pay for this traffic, signaling commercial value.`,
        );
      }
    }

    /* Provider: trend up to +5 / -4. */
    const trendSignal =
      metrics?.trend ??
      (monthly.length > 0
        ? this.trendFromPoints(monthly)
        : null);
    if (trendSignal) {
      if (trendSignal.direction === 'rising') {
        score += 5;
        reasons.push(
          `Rising 12-month trend — ${trendSignal.detail}`,
        );
      } else if (
        trendSignal.direction === 'seasonal'
      ) {
        score += 3;
        reasons.push(
          `Seasonal demand — ${trendSignal.detail}`,
        );
      } else if (
        trendSignal.direction === 'declining'
      ) {
        score -= 4;
        reasons.push(
          `Declining trend — ${trendSignal.detail}`,
        );
      }
    }

    /* First-party: GSC foothold up to 10. */
    const gscPos = gsc?.position ?? null;
    const gscImpr = gsc?.impressions ?? 0;
    if (
      gscPos !== null &&
      gscPos >= 4 &&
      gscPos <= 20
    ) {
      score += 10;
      reasons.push(
        `Your page already ranks #${gscPos.toFixed(1)} with ${this.fmtVolume(gscImpr)} impressions — striking distance.`,
      );
    } else if (
      gscPos !== null &&
      gscPos >= 1 &&
      gscPos < 4
    ) {
      score += 5;
      reasons.push(
        `You rank #${gscPos.toFixed(1)} — defend and grow CTR.`,
      );
    }

    score = Math.min(
      100,
      Math.max(0, Math.round(score)),
    );

    if (
      reasons.length === 0 &&
      score > 0
    ) {
      reasons.push(
        'Related to the seed topic with limited on-site or competitor evidence — validate before investing.',
      );
    }

    const { decision, reason } =
      this.decide(
        score,
        intent,
        Boolean(site),
        Boolean(comp),
        site?.urls.length ?? 0,
        gscPos,
      );

    const siteUrls = (site?.urls ?? []).slice(
      0,
      3,
    );

    const lastUpdated =
      extra?.provider?.lastUpdated ??
      metrics?.lastUpdated ??
      null;

    return {
      keyword,
      intent,
      intentSource,
      categories,
      sources,
      sitePages: site?.pages ?? 0,
      siteRelevance: Math.round(siteRel),
      siteUrls,
      competitorCount,
      competitorPages: compPages,
      competitorRelevance:
        Math.round(compRel),
      opportunityScore: score,
      opportunityReasons: reasons,
      targetDecision: decision,
      decisionReason: reason,
      parentTopic: this.titleCase(
        this.parentTopic(keyword),
      ),
      parentTopicSource: 'RENKOO_CLUSTER',
      wordCount: words,
      cannibalizationFlag:
        siteUrls.length >= 2,
      volume,
      keywordDifficulty:
        kd !== null ? Math.round(kd) : null,
      kdLabel:
        kd === null
          ? null
          : kd <= 25
            ? 'Easy'
            : kd <= 45
              ? 'Moderate'
              : kd <= 65
                ? 'Hard'
                : 'Very hard',
      cpc,
      competition:
        metrics?.competition ??
        extra?.providerIdea?.competition ??
        null,
      competitionLevel:
        metrics?.competitionLevel ??
        extra?.providerIdea
          ?.competitionLevel ??
        null,
      monthlySearches: monthly,
      trend: trendSignal?.direction ?? null,
      trendDetail: trendSignal?.detail ?? null,
      serpFeatures:
        metrics?.serpFeatures ?? [],
      gscPosition: gscPos,
      gscClicks: gsc?.clicks ?? null,
      gscImpressions:
        gsc?.impressions ?? null,
      gscCtr: gsc?.ctr ?? null,
      dataSource:
        metrics || extra?.providerIdea
          ? 'DATAFORSEO'
          : site || comp
            ? 'RENKOO_CRAWL'
            : 'RENKOO_DERIVED',
      metricUpdatedAt: lastUpdated,
      trafficPotential: null,
    };
  }

  private fmtVolume(value: number): string {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    return String(Math.round(value));
  }

  /* One documented trend rule for every surface: the
     provider module owns it, including the seasonal
     oscillation test. */
  private trendFromPoints(
    monthly: MonthlyPoint[],
  ): {
    direction: string;
    detail: string;
  } | null {
    const signal = trendFromHistory(monthly);
    if (
      !signal ||
      signal.direction === 'insufficient'
    ) {
      return null;
    }
    return {
      direction: signal.direction,
      detail: signal.detail,
    };
  }

  private decide(
    score: number,
    intent: ResearchIntent,
    hasSite: boolean,
    hasComp: boolean,
    siteUrlCount: number,
    gscPos?: number | null,
  ): {
    decision: TargetDecision;
    reason: string;
  } {
    if (
      intent === 'NAVIGATIONAL' &&
      !hasSite
    ) {
      return {
        decision: 'AVOID',
        reason:
          'Navigational query with no on-site evidence — likely belongs to another brand or site section.',
      };
    }
    /* Striking-distance fast-track: a real ranking in
       positions 4–20 with a decent score is TARGET_NOW. */
    if (
      gscPos !== null &&
      gscPos !== undefined &&
      gscPos >= 4 &&
      gscPos <= 20 &&
      score >= 50
    ) {
      return {
        decision: 'TARGET_NOW',
        reason: `Your page ranks #${gscPos.toFixed(1)} — strengthening it is the fastest path to traffic.`,
      };
    }
    if (score >= 70) {
      return {
        decision: 'TARGET_NOW',
        reason: hasSite
          ? 'Strong evidence on both sides: your site has a foothold and competitors validate demand. Act on this first.'
          : 'Strong competitor-validated gap with buying intent. Create a dedicated page.',
      };
    }
    if (score >= 50) {
      return {
        decision: 'GOOD_OPPORTUNITY',
        reason:
          'Solid demand or gap signal. Worth a page or a section in the parent-topic cluster.',
      };
    }
    if (score >= 30) {
      if (siteUrlCount >= 2) {
        return {
          decision: 'WATCH',
          reason:
            'Multiple existing pages touch this topic — consolidate before creating anything new.',
        };
      }
      return {
        decision: 'WATCH',
        reason:
          'Some evidence but not decisive. Monitor or fold into a broader page.',
      };
    }
    return {
      decision: 'LOW_PRIORITY',
      reason: hasComp
        ? 'Weak signal relative to other ideas — revisit after higher-scoring topics ship.'
        : 'Seed-adjacent idea with no measured site or competitor evidence yet.',
    };
  }

  /* Single-source intent value, capped at 12 per the
     documented Opportunity 2.0 formula. */
  private intentBonus(
    intent: ResearchIntent,
  ): number {
    switch (intent) {
      case 'TRANSACTIONAL':
        return 12;
      case 'COMMERCIAL':
      case 'BUYER_RESEARCH':
        return 11;
      case 'COMPARISON':
      case 'ALTERNATIVES':
        return 10;
      case 'LOCAL':
        return 8;
      case 'PROBLEM_SOLUTION':
        return 6;
      default:
        return 3;
    }
  }

  // =======================================================
  // CATEGORIZATION
  // =======================================================

  private categorize(
    keyword: string,
  ): string[] {
    const k = ` ${keyword.toLowerCase()} `;
    const cats: string[] = [];
    const words = keyword.split(' ').length;

    if (
      QUESTION_WORDS.some((w) =>
        k.includes(` ${w} `),
      ) ||
      keyword.trim().endsWith('?')
    ) {
      cats.push('questions');
    }
    if (words >= 4) cats.push('long-tail');
    if (
      COMPARISON_HINTS.some((h) =>
        k.includes(h),
      )
    )
      cats.push('comparison');
    if (
      TRANSACTIONAL_HINTS.some((h) =>
        k.includes(h),
      )
    )
      cats.push('transactional');
    if (
      COMMERCIAL_HINTS.some((h) =>
        k.includes(h),
      ) ||
      k.includes(' best ') ||
      k.includes(' top ')
    )
      cats.push('commercial');
    if (
      PROBLEM_HINTS.some((h) =>
        k.includes(h),
      )
    )
      cats.push('problem-aware');
    if (
      k.includes(' solution ') ||
      k.includes(' tool ') ||
      k.includes(' software ') ||
      k.includes(' service ')
    )
      cats.push('solution-aware');
    if (
      LOCAL_HINTS.some((h) =>
        k.includes(h),
      )
    )
      cats.push('local');
    if (
      cats.length === 0 ||
      (!cats.includes('commercial') &&
        !cats.includes('transactional'))
    )
      cats.push('informational');

    if (
      keyword
        .toLowerCase()
        .split(' ')
        .length <= 3 &&
      !cats.includes('questions')
    ) {
      cats.push('matching');
    }

    return [...new Set(cats)];
  }

  detectIntent(keyword: string): {
    primary: ResearchIntent;
    all: ResearchIntent[];
  } {
    const k = ` ${keyword.toLowerCase()} `;
    const has = (hints: string[]) =>
      hints.some((h) => k.includes(h));

    const matched = new Set<ResearchIntent>();
    if (has(TRANSACTIONAL_HINTS))
      matched.add('TRANSACTIONAL');
    if (
      has([
        ' vs ',
        ' vs',
        'versus',
        'compared',
        'comparison',
        'difference between',
      ])
    )
      matched.add('COMPARISON');
    if (
      has([
        'alternative',
        'instead of',
        'replace',
        'switch from',
      ])
    )
      matched.add('ALTERNATIVES');
    if (has(PROBLEM_HINTS))
      matched.add('PROBLEM_SOLUTION');
    if (
      has([
        'best',
        'top ',
        'top-',
        'review',
        'reviews',
        'worth it',
        'should i',
        'which one',
        'recommend',
      ])
    )
      matched.add('BUYER_RESEARCH');
    if (has(COMMERCIAL_HINTS))
      matched.add('COMMERCIAL');
    if (
      has([
        'login',
        'sign in',
        'official site',
        'homepage',
      ])
    )
      matched.add('NAVIGATIONAL');
    if (has(LOCAL_HINTS))
      matched.add('LOCAL');
    if (matched.size === 0)
      matched.add('INFORMATIONAL');

    const order: ResearchIntent[] = [
      'TRANSACTIONAL',
      'COMMERCIAL',
      'LOCAL',
      'COMPARISON',
      'ALTERNATIVES',
      'BUYER_RESEARCH',
      'PROBLEM_SOLUTION',
      'NAVIGATIONAL',
      'INFORMATIONAL',
    ];
    const all = order.filter((i) =>
      matched.has(i),
    );
    return { primary: all[0], all };
  }

  private intentLabel(
    intent: ResearchIntent,
  ): string {
    switch (intent) {
      case 'BUYER_RESEARCH':
        return 'Buyer-research';
      case 'PROBLEM_SOLUTION':
        return 'Problem-solution';
      default:
        return (
          intent.charAt(0) +
          intent.slice(1).toLowerCase()
        );
    }
  }

  private pageTypeForIntent(
    intent: string,
  ): string {
    switch (intent) {
      case 'TRANSACTIONAL':
        return 'Product / conversion page';
      case 'COMMERCIAL':
      case 'BUYER_RESEARCH':
      case 'COMPARISON':
      case 'ALTERNATIVES':
        return 'Comparison / commercial landing page';
      case 'LOCAL':
        return 'Location / local service page';
      case 'PROBLEM_SOLUTION':
        return 'How-to / troubleshooting guide';
      default:
        return 'Educational guide / blog post';
    }
  }

  // =======================================================
  // SEED EXPANSION (candidates only — no metrics claimed)
  // =======================================================

  private expandSeed(seed: string): string[] {
    const s = seed
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    if (!s) return [];

    const out = new Set<string>();
    for (const q of [
      'what',
      'how',
      'why',
      'best',
      'how to',
    ]) {
      out.add(`${q} ${s}`);
    }
    for (const tail of [
      'guide',
      'tips',
      'examples',
      'tools',
      'software',
      'services',
      'pricing',
      'reviews',
      'alternatives',
      `vs`,
      'for beginners',
      'ideas',
      'checklist',
    ]) {
      out.add(
        tail === 'vs'
          ? `${s} vs`
          : `${s} ${tail}`,
      );
    }
    return [...out].filter(
      (p) => p !== s && p.length >= 4,
    );
  }

  /*
   * Light normalization so "leads" and "lead" group
   * together. Suffix-stripping only, no dictionary.
   */
  private normTok(token: string): string {
    if (
      token.length > 4 &&
      token.endsWith('ies')
    ) {
      return `${token.slice(0, -3)}y`;
    }
    if (
      token.length > 3 &&
      token.endsWith('es') &&
      !token.endsWith('ses')
    ) {
      return token.slice(0, -2);
    }
    if (
      token.length > 3 &&
      token.endsWith('s') &&
      !token.endsWith('ss')
    ) {
      return token.slice(0, -1);
    }
    return token;
  }

  private parentTopic(keyword: string): string {
    const stop = new Set([
      ...QUESTION_WORDS,
      'the',
      'a',
      'an',
      'for',
      'to',
      'of',
      'and',
      'with',
      'best',
      'top',
      'guide',
      'tips',
      'ideas',
      'vs',
      'review',
      'reviews',
      'software',
      'services',
      'service',
      'pricing',
      'tools',
      'tool',
      'examples',
      'checklist',
      'beginners',
      'near',
      'me',
      'generate',
      'get',
      'make',
      'using',
      'use',
      'find',
      'finding',
      'create',
      'creating',
      'need',
      'needs',
      'want',
    ]);
    const tokens = keyword
      .toLowerCase()
      .split(' ')
      .filter(
        (t) => t && !stop.has(t),
      )
      .map((t) => this.normTok(t));
    if (tokens.length === 0) return keyword;
    if (tokens.length <= 2)
      return tokens.join(' ');
    return tokens.slice(-2).join(' ');
  }

  private titleCase(s: string): string {
    return s.replace(
      /\w\S*/g,
      (w) =>
        w.charAt(0).toUpperCase() +
        w.slice(1),
    );
  }

  private jaccard(a: string, b: string): number {
    const sa = new Set(
      a.split(' ').map((t) => this.normTok(t)),
    );
    const sb = new Set(
      b.split(' ').map((t) => this.normTok(t)),
    );
    let inter = 0;
    for (const t of sa)
      if (sb.has(t)) inter++;
    const union = sa.size + sb.size - inter;
    return union === 0
      ? 0
      : inter / union;
  }

  private seedScore(
    seedTokens: string[],
    phrase: string,
  ): number {
    if (seedTokens.length === 0) return 1;
    const pt = new Set(phrase.split(' '));
    let hit = 0;
    for (const t of seedTokens)
      if (pt.has(t)) hit++;
    return hit / seedTokens.length;
  }

  private summarize(ideas: ResearchIdea[]) {
    const high = ideas.filter(
      (i) => i.opportunityScore >= 70,
    ).length;
    const gaps = ideas.filter(
      (i) =>
        i.sources.includes(
          'COMPETITOR_CORPUS',
        ) &&
        !i.sources.includes('SITE_CORPUS'),
    ).length;
    const quickWins = ideas.filter(
      (i) =>
        i.sitePages > 0 &&
        i.opportunityScore >= 50,
    ).length;
    const commercial = ideas.filter((i) =>
      [
        'COMMERCIAL',
        'TRANSACTIONAL',
        'BUYER_RESEARCH',
        'COMPARISON',
        'ALTERNATIVES',
      ].includes(i.intent),
    ).length;
    return {
      total: ideas.length,
      highOpportunity: high,
      contentGaps: gaps,
      quickWins,
      commercial,
    };
  }

  // =======================================================
  // CORPUS EXTRACTION (same honest source as analyze/gap:
  // titles, meta descriptions, H1/H2 of real crawls)
  // =======================================================

  private extractCorpus(
    pages: any[],
  ): Map<string, CorpusEntry> {
    const map = new Map<string, CorpusEntry>();

    for (const page of pages) {
      const parts = [
        page.title ?? '',
        page.metaDescription ?? '',
        ...(Array.isArray(page.h1)
          ? page.h1
          : []),
        ...(Array.isArray(page.h2)
          ? page.h2
          : []),
      ];
      const tokens = this.tokenize(
        parts.join(' ').toLowerCase(),
      );
      if (tokens.length === 0) continue;

      const phrases = this.ngrams(tokens, 3);
      const unique = new Set(phrases);

      for (const kw of unique) {
        const occurrences = phrases.filter(
          (p) => p === kw,
        ).length;
        const existing = map.get(kw);
        if (existing) {
          existing.pages++;
          existing.occurrences +=
            occurrences;
          if (
            page.url &&
            existing.urls.length < 3 &&
            !existing.urls.includes(page.url)
          ) {
            existing.urls.push(page.url);
          }
        } else {
          map.set(kw, {
            keyword: kw,
            pages: 1,
            occurrences,
            relevanceScore: 0,
            urls: page.url ? [page.url] : [],
          });
        }
      }
    }

    for (const entry of map.values()) {
      entry.relevanceScore =
        this.relevance(
          entry.pages,
          entry.occurrences,
        );
    }

    return map;
  }

  private relevance(
    pages: number,
    occurrences: number,
  ): number {
    return Math.min(
      100,
      Math.min(50, pages * 15) +
        Math.min(35, occurrences * 5),
    );
  }

  private tokenize(text: string): string[] {
    const stop = new Set([
      'the', 'and', 'for', 'with', 'that',
      'this', 'from', 'your', 'you',
      'are', 'was', 'were', 'have', 'has',
      'had', 'will', 'can', 'our', 'their',
      'they', 'them', 'about', 'into',
      'than', 'then', 'there', 'here',
      'which', 'while', 'also', 'more',
      'most', 'very', 'just', 'only',
      'over', 'under', 'such', 'its',
      'not', 'but',
    ]);
    return text
      .replace(/[^a-z0-9\s-]/gi, ' ')
      .split(/\s+/)
      .map((w) => w.trim().toLowerCase())
      .filter(
        (w) => w.length >= 3 && !stop.has(w),
      );
  }

  private ngrams(
    tokens: string[],
    max: number,
  ): string[] {
    const out: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
      for (
        let size = 1;
        size <= max;
        size++
      ) {
        if (i + size > tokens.length) break;
        const phrase = tokens
          .slice(i, i + size)
          .join(' ');
        if (phrase.length >= 3)
          out.push(phrase);
      }
    }
    return out;
  }
}

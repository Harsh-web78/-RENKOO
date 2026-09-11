import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { GoogleService } from '../google/google.service';
import { KeywordResearchService } from './keyword-research.service';
import { KeywordStrategyService } from './keyword-strategy.service';
import { ContentStrategyService } from './content-strategy.service';
import { KeywordCacheService } from './keyword-cache.service';
import { DataForSeoProvider } from './dataforseo.provider';
import { CrawlLinkService } from '../crawl/crawl-link.service';
import {
  anchorKeyOf,
  normalizeCrawlUrl,
} from '../crawl/crawl-links';
import {
  classifyContentType,
  type ContentType,
} from './serp-analysis';

/*
 * =========================================================
 * WHY-NOT-#1 ENGINE 1.0 — evidence-backed diagnosis.
 * COMPOSES existing intelligence, scores nothing new:
 *  - GSC query/page evidence + PoP (GoogleService)
 *  - Strategy 5.0 opportunity (priority/mapping/intent)
 *  - SERP cache reads ONLY (KeywordCacheService, zero
 *    provider cost — DataForSEO stays optional)
 *  - Crawl page facts + CrawlLink inbound (OBSERVED)
 *  - Corpus site-vs-competitor relevance (INFERENCE base)
 *  - Content briefs/items, refresh recs, link recs,
 *    existing actions (execution rails)
 *
 * Precedence is deterministic: blocking technical issues
 * first, then the strongest evidence-backed gap. Anchors
 * and reasons are templated from facts present in the
 * response — no LLM, no invented evidence.
 * =========================================================
 */

export type DiagnosisType =
  | 'INTENT_GAP'
  | 'CONTENT_COVERAGE_GAP'
  | 'INTERNAL_LINK_GAP'
  | 'TECHNICAL_BLOCKER'
  | 'AUTHORITY_GAP'
  | 'SERP_FORMAT_GAP'
  | 'FRESHNESS_GAP'
  | 'CANNIBALIZATION_RISK'
  | 'NO_CLEAR_GAP'
  | 'INSUFFICIENT_DATA';

export type DiagnosisState =
  | 'CONFIRMED'
  | 'ABSENT'
  | 'UNKNOWN';

export interface SubDiagnosis {
  type: DiagnosisType;
  state: DiagnosisState;
  headline: string;
  evidence: string[];
  evidenceState: string;
}

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const normKey = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase();

const normUrl = (value: unknown): string =>
  normalizeCrawlUrl(String(value ?? ''));

function fmtPos(value: number | null): string {
  if (value === null || value <= 0) return 'unranked';
  return `#${value.toFixed(1).replace(/\.0$/, '')}`;
}

/* Commercial vs informational families (same split the
   SERP layer uses for intent compatibility). */
function intentFamily(
  intent: unknown,
): 'COMMERCIAL' | 'INFORMATIONAL' | 'OTHER' {
  switch (String(intent ?? '').toUpperCase()) {
    case 'TRANSACTIONAL':
    case 'COMMERCIAL':
    case 'BUYER_RESEARCH':
    case 'COMPARISON':
    case 'ALTERNATIVES':
      return 'COMMERCIAL';
    case 'INFORMATIONAL':
    case 'PROBLEM_SOLUTION':
      return 'INFORMATIONAL';
    default:
      return 'OTHER';
  }
}

function contentTypeFamily(
  contentType: ContentType | string,
): 'COMMERCIAL' | 'INFORMATIONAL' | 'OTHER' {
  switch (contentType) {
    case 'Product':
    case 'Service':
    case 'Comparison':
    case 'Category':
    case 'Local business':
      return 'COMMERCIAL';
    case 'Blog/article':
    case 'Documentation':
    case 'Video':
      return 'INFORMATIONAL';
    default:
      return 'OTHER';
  }
}

export function composeExplanation(input: {
  keyword: string;
  position: number | null;
  primary: DiagnosisType;
  intentKnown: boolean;
  intentMatches: boolean | null;
  technicalClean: boolean | null;
  coverageGap: boolean;
  linkGap: boolean;
}): { title: string; body: string } {
  const where = `Why you're ${fmtPos(input.position)} for “${input.keyword}”`;
  switch (input.primary) {
    case 'TECHNICAL_BLOCKER':
      return {
        title: where,
        body: 'A technical blocker is directly preventing eligibility. Fix it before any content or link work — nothing else can rank until the page is crawlable and indexable.',
      };
    case 'INTENT_GAP':
      return {
        title: where,
        body: 'The page does not match what the query asks for. Align the page format and angle with the dominant SERP intent before expanding coverage.',
      };
    case 'CANNIBALIZATION_RISK':
      return {
        title: where,
        body: 'Multiple pages compete for this query, splitting authority. Consolidate around one primary URL before creating anything new.',
      };
    case 'CONTENT_COVERAGE_GAP':
      return {
        title: where,
        body: `The page${input.intentMatches ? ' matches the search intent, but' : ''} does not cover the supporting topics observed across stronger results. Strengthen topical coverage on the existing page.`,
      };
    case 'SERP_FORMAT_GAP':
      return {
        title: where,
        body: 'Top results share a content format the current page does not use. Adapt the format to what the SERP rewards for this query.',
      };
    case 'INTERNAL_LINK_GAP':
      return {
        title: where,
        body: 'Relevant supporting pages exist but no verified internal link points at the target. Add contextual internal support from the closest pages.',
      };
    case 'AUTHORITY_GAP':
      return {
        title: where,
        body: 'Competing results show stronger observed page signals. This gap closes with authority earned elsewhere — links, mentions and brand demand.',
      };
    case 'FRESHNESS_GAP':
      return {
        title: where,
        body: 'Measured performance declined over comparable windows. Refresh stale sections against current intent rather than rewriting from scratch.',
      };
    case 'NO_CLEAR_GAP':
      return {
        title: where,
        body: 'Available evidence does not identify one dominant reason this page ranks below the top result. Continue monitoring.',
      };
    default:
      return {
        title: where,
        body: 'Not enough verified evidence exists yet to diagnose this keyword. Connect Search Console and run a crawl to unlock diagnosis.',
      };
  }
}

export function actionForDiagnosis(
  primary: DiagnosisType,
): {
  action: string;
  label: string;
  href: string;
} {
  switch (primary) {
    case 'INTENT_GAP':
    case 'CONTENT_COVERAGE_GAP':
      return {
        action: 'IMPROVE_EXISTING_PAGE',
        label: 'Improve page',
        href: '/content',
      };
    case 'INTERNAL_LINK_GAP':
      return {
        action: 'BUILD_INTERNAL_SUPPORT',
        label: 'Build internal links',
        href: '/keywords?tab=strategy',
      };
    case 'TECHNICAL_BLOCKER':
      return {
        action: 'FIX_TECHNICAL_BLOCKER',
        label: 'Fix technical issue',
        href: '/technical-seo',
      };
    case 'CANNIBALIZATION_RISK':
      return {
        action: 'CONSOLIDATE',
        label: 'Consolidate pages',
        href: '/keywords?tab=strategy',
      };
    case 'SERP_FORMAT_GAP':
      return {
        action: 'ADAPT_CONTENT_FORMAT',
        label: 'Adapt format',
        href: '/content',
      };
    case 'AUTHORITY_GAP':
      return {
        action: 'BUILD_AUTHORITY',
        label: 'Build authority',
        href: '/backlinks',
      };
    case 'FRESHNESS_GAP':
      return {
        action: 'REFRESH_PAGE',
        label: 'Refresh page',
        href: '/content',
      };
    case 'INSUFFICIENT_DATA':
      return {
        action: 'GATHER_MORE_EVIDENCE',
        label: 'Connect data',
        href: '/integrations',
      };
    default:
      return {
        action: 'MONITOR',
        label: 'Monitor',
        href: '/monitoring',
      };
  }
}

@Injectable()
export class KeywordDiagnosisService {
  private readonly logger = new Logger(
    KeywordDiagnosisService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleService: GoogleService,
    private readonly strategyService: KeywordStrategyService,
    private readonly research: KeywordResearchService,
    private readonly cache: KeywordCacheService,
    private readonly provider: DataForSeoProvider,
    private readonly contentStrategy: ContentStrategyService,
    private readonly crawlLinks: CrawlLinkService,
  ) {}

  async diagnose(
    organizationId: string,
    dto: {
      websiteId: string;
      keyword: string;
      country?: string;
      language?: string;
    },
  ): Promise<Record<string, any>> {
    const keyword = String(dto.keyword ?? '').trim();
    if (!keyword) {
      throw new BadRequestException(
        'keyword is required',
      );
    }
    const website =
      await this.prisma.website.findFirst({
        where: {
          id: dto.websiteId,
          organizationId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          url: true,
        },
      });
    if (!website) {
      throw new NotFoundException(
        'Website not found',
      );
    }
    const ctx = this.provider.resolveContext(
      dto.country,
      dto.language,
    );
    const shared = await this.loadSharedEvidence(
      organizationId,
      dto.websiteId,
      ctx,
    );
    return this.diagnoseOne(
      organizationId,
      dto.websiteId,
      website,
      keyword,
      ctx,
      shared,
    );
  }

  async diagnoseBatch(
    organizationId: string,
    dto: {
      websiteId: string;
      keywords?: string[];
      limit?: number;
      country?: string;
      language?: string;
    },
  ): Promise<Record<string, any>> {
    const website =
      await this.prisma.website.findFirst({
        where: {
          id: dto.websiteId,
          organizationId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          url: true,
        },
      });
    if (!website) {
      throw new NotFoundException(
        'Website not found',
      );
    }
    const ctx = this.provider.resolveContext(
      dto.country,
      dto.language,
    );
    /* Shared evidence once: one strategy run, one GSC
       window pair, one corpus load, one crawl snapshot —
       never refetched per card. */
    const shared = await this.loadSharedEvidence(
      organizationId,
      dto.websiteId,
      ctx,
    );
    let keywords = (dto.keywords ?? [])
      .map((k) => String(k ?? '').trim())
      .filter(Boolean)
      .slice(0, 10);
    if (keywords.length === 0) {
      /* Auto-pick: striking distance + HIGH priority
         from the shared strategy run. */
      keywords = (shared.strategy?.opportunities ?? [])
        .filter(
          (o: any) =>
            o.bucket === 'QUICK_WIN' ||
            o.priority === 'HIGH',
        )
        .sort(
          (a: any, b: any) =>
            (b.impressions ?? 0) -
            (a.impressions ?? 0),
        )
        .slice(0, 5)
        .map((o: any) => o.keyword);
    }
    const cap = Math.min(
      Math.max(
        dto.limit ?? keywords.length,
        1,
      ),
      10,
    );
    const results = [];
    for (const kw of keywords.slice(0, cap)) {
      try {
        results.push(
          await this.diagnoseOne(
            organizationId,
            dto.websiteId,
            website,
            kw,
            ctx,
            shared,
          ),
        );
      } catch (error) {
        this.logger.warn(
          `Batch diagnosis skipped "${kw}": ${String(
            (error as any)?.message ?? error,
          )}`,
        );
      }
    }
    return {
      website,
      total: results.length,
      diagnoses: results.map((d) => ({
        keyword: d.keyword,
        position: d.currentRanking.position,
        page: d.currentRanking.page,
        primaryDiagnosis: d.primaryDiagnosis,
        secondaryDiagnoses: d.secondaryDiagnoses,
        recommendedAction: d.recommendedAction,
        strategy: d.strategy,
      })),
    };
  }

  // =======================================================
  // SHARED EVIDENCE (one wave per batch / diagnosis)
  // =======================================================

  private async loadSharedEvidence(
    organizationId: string,
    websiteId: string,
    ctx: { country: string; language: string },
  ) {
    const end = new Date();
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setDate(start.getDate() - 27);
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevEnd.getDate() - 27);
    const fmt = (d: Date) =>
      d.toISOString().slice(0, 10);
    const cur = {
      startDate: fmt(start),
      endDate: fmt(end),
    };
    const prev = {
      startDate: fmt(prevStart),
      endDate: fmt(prevEnd),
    };

    const safe = async <T>(
      fn: () => Promise<T>,
    ): Promise<T | null> => {
      try {
        return await fn();
      } catch {
        return null;
      }
    };

    const [
      gscCur,
      gscPrev,
      gscPages,
      strategy,
      corpora,
      crawl,
      briefs,
      items,
      refreshRecs,
      linkRecs,
      actions,
    ] = await Promise.all([
      safe(() =>
        this.research.getGscMaps(organizationId, cur),
      ),
      safe(() =>
        this.research.getGscMaps(organizationId, prev),
      ),
      safe(() =>
        this.googleService.getQueryPages(
          organizationId,
          cur.startDate,
          cur.endDate,
        ),
      ),
      safe(() =>
        this.strategyService.strategy(organizationId, {
          websiteId,
          startDate: cur.startDate,
          endDate: cur.endDate,
          country: ctx.country,
          language: ctx.language,
          limit: 300,
        }),
      ),
      safe(() =>
        this.research.getCorpora(
          organizationId,
          websiteId,
        ),
      ),
      safe(() =>
        this.prisma.crawl.findFirst({
          where: { websiteId, status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
          select: {
            id: true,
            completedAt: true,
          },
        }),
      ),
      safe(() =>
        this.prisma.contentBrief.findMany({
          where: { organizationId, websiteId },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      ),
      safe(() =>
        this.prisma.contentItem.findMany({
          where: { organizationId, websiteId },
          orderBy: { updatedAt: 'desc' },
          take: 200,
        }),
      ),
      safe(() =>
        this.prisma.recommendation.findMany({
          where: {
            organizationId,
            websiteId,
            source: 'CONTENT',
            type: 'REFRESH_REQUIRED',
            status: { in: ['OPEN', 'IN_PROGRESS'] },
          },
          take: 100,
        }),
      ),
      safe(() =>
        this.prisma.recommendation.findMany({
          where: {
            organizationId,
            websiteId,
            source: 'CONTENT',
            type: 'INTERNAL_LINK_OPPORTUNITY',
            status: { in: ['OPEN', 'IN_PROGRESS'] },
          },
          take: 100,
        }),
      ),
      safe(() =>
        this.prisma.action.findMany({
          where: {
            organizationId,
            websiteId,
            status: { in: ['TODO', 'IN_PROGRESS'] },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
      ),
    ]);

    return {
      windows: { current: cur, previous: prev },
      gscCur,
      gscPrev,
      gscPages,
      strategy,
      corpora,
      crawl,
      briefs: briefs ?? [],
      items: items ?? [],
      refreshRecs: refreshRecs ?? [],
      linkRecs: linkRecs ?? [],
      actions: actions ?? [],
      ctx,
    };
  }

  // =======================================================
  // SINGLE DIAGNOSIS (pure composition over shared ctx)
  // =======================================================

  private async diagnoseOne(
    organizationId: string,
    websiteId: string,
    website: { id: string; name: string; url: string },
    keyword: string,
    ctx: { country: string; language: string },
    shared: Awaited<
      ReturnType<
        KeywordDiagnosisService['loadSharedEvidence']
      >
    >,
  ): Promise<Record<string, any>> {
    const key = keyword.toLowerCase();

    /* ---- GSC current + PoP ---- */
    const gscRow =
      shared.gscCur?.byQuery.get(key) ?? null;
    const gscPrevRow =
      shared.gscPrev?.byQuery.get(key) ?? null;
    const pageRows: Array<{
      page: string;
      position: number | null;
      clicks: number;
      impressions: number;
    }> = [];
    if (shared.gscPages) {
      for (const row of (shared.gscPages as any).rows ??
        []) {
        if (
          String(row.query ?? '').toLowerCase() ===
            key &&
          Number(row.impressions ?? 0) > 0
        ) {
          pageRows.push({
            page: String(row.page ?? ''),
            position:
              Number(row.position) > 0
                ? Number(row.position)
                : null,
            clicks: num(row.clicks),
            impressions: num(row.impressions),
          });
        }
      }
      pageRows.sort(
        (a, b) => b.impressions - a.impressions,
      );
    }
    const position =
      gscRow && num((gscRow as any).position) > 0
        ? num((gscRow as any).position)
        : null;
    const prevPosition =
      gscPrevRow && num((gscPrevRow as any).position) > 0
        ? num((gscPrevRow as any).position)
        : null;

    /* ---- Phase 11 — persistent rank history as
       evidence (additive composition only). Observed
       movement is reported, never causal: existing
       sub-diagnoses above decide what explains it. */
    let rankHistory: {
      statement: string;
      evidenceState: string;
      observations: number;
      current: number | null;
      previous: number | null;
    } = {
      statement:
        'No persistent rank observations for this keyword yet — history unavailable, not zero.',
      evidenceState: 'UNAVAILABLE',
      observations: 0,
      current: null,
      previous: null,
    };
    try {
      const rankRows =
        await this.prisma.rankObservation.findMany({
          where: {
            organizationId,
            websiteId,
            normalizedKeyword: key,
          },
          orderBy: { observedAt: 'asc' },
          take: 20,
        });
      const trail = rankRows.filter(
        (row) => row.position !== null,
      );
      if (trail.length >= 2) {
        const before = trail[trail.length - 2]
          .position as number;
        const after = trail[trail.length - 1]
          .position as number;
        const source =
          trail[trail.length - 1].source;
        const label =
          source === 'GSC'
            ? 'VERIFIED window-average'
            : 'OBSERVED';
        rankHistory = {
          statement:
            after < before
              ? `Observed ranking has improved from ${before} to ${after} across snapshots (${label}).`
              : after > before
                ? `Observed ranking has declined from ${before} to ${after} across snapshots (${label}).`
                : `Observed ranking unchanged at ${after} across snapshots (${label}).`,
          evidenceState:
            source === 'GSC'
              ? 'VERIFIED'
              : 'OBSERVED',
          observations: rankRows.length,
          current: after,
          previous: before,
        };
      } else if (trail.length === 1) {
        const only = trail[0];
        rankHistory = {
          statement: `One ${only.source === 'GSC' ? 'VERIFIED window-average' : 'OBSERVED'} rank observation at position ${only.position} — insufficient history for movement.`,
          evidenceState:
            only.source === 'GSC'
              ? 'VERIFIED'
              : 'OBSERVED',
          observations: rankRows.length,
          current: only.position,
          previous: null,
        };
      }
    } catch {
      /* Rank history degrades alone — diagnosis
         stands on GSC + strategy + crawl evidence. */
    }

    /* ---- Strategy opportunity (existing mapping) ---- */
    const opp = (
      shared.strategy?.opportunities ?? []
    ).find(
      (o: any) =>
        String(o.keyword ?? '').toLowerCase() === key,
    ) as any;
    const cluster = opp
      ? (shared.strategy?.clusters ?? []).find(
          (c: any) =>
            c.primaryKeyword === opp.keyword ||
            (c.supportingKeywords ?? []).includes(
              opp.keyword,
            ),
        )
      : null;

    /* ---- Current page: GSC primary, else strategy
       target. Uncertain when neither agrees. ---- */
    const gscPrimary = pageRows[0]?.page ?? null;
    let currentPage: string | null = gscPrimary;
    let pageCertainty:
      | 'CONFIRMED'
      | 'STRATEGY_ONLY'
      | 'CURRENT_PAGE_UNCERTAIN' = gscPrimary
      ? 'CONFIRMED'
      : 'CURRENT_PAGE_UNCERTAIN';
    if (!currentPage && opp?.targetPage) {
      currentPage = opp.targetPage;
      pageCertainty = 'STRATEGY_ONLY';
    }

    /* ---- SERP cache read ONLY (zero provider cost) ---- */
    let serp: any = null;
    let serpFetchedAt: string | null = null;
    try {
      const hit = await this.cache.get<any>(
        'DATAFORSEO',
        'serp',
        ctx.country,
        ctx.language,
        key,
      );
      if (hit?.value) {
        serp = hit.value;
        serpFetchedAt = hit.fetchedAt;
      }
    } catch {
      serp = null;
    }

    /* ---- Crawl page facts + inbound (OBSERVED) ---- */
    let pageFacts: any = null;
    let inboundCount: number | null = null;
    let crawlId: string | null = null;
    if (shared.crawl && currentPage) {
      crawlId = shared.crawl.id;
      try {
        const target = normalizeCrawlUrl(currentPage);
        const pages =
          await this.prisma.crawlPage.findMany({
            where: { crawlId: shared.crawl.id },
            select: {
              url: true,
              statusCode: true,
              title: true,
              metaDescription: true,
              h1: true,
              h2: true,
              wordCount: true,
              robotsIndexable: true,
              canonical: true,
              canonicalAbsolute: true,
              redirectCount: true,
              finalUrl: true,
              internalLinks: true,
            },
            take: 2000,
          });
        pageFacts =
          pages.find(
            (p: any) =>
              normalizeCrawlUrl(p.url) === target,
          ) ?? null;
        inboundCount =
          await this.prisma.crawlLink.count({
            where: {
              organizationId,
              websiteId,
              crawlId: shared.crawl.id,
              targetUrl: target,
            },
          });
      } catch {
        pageFacts = null;
        inboundCount = null;
      }
    }

    /* ---- Corpus coverage (INFERENCE base) ---- */
    const siteEntry =
      shared.corpora?.siteCorpus.get(key) ?? null;
    const compEntry =
      shared.corpora?.competitorCorpus.get(key)?.entry ??
      null;

    /* ---- Execution rails (existing rows only) ---- */
    const brief =
      (shared.briefs as any[]).find(
        (b: any) =>
          String(b.targetQuery ?? '').toLowerCase() ===
          key,
      ) ?? null;
    const item =
      (shared.items as any[]).find(
        (i: any) =>
          String(i.targetQuery ?? '').toLowerCase() ===
          key,
      ) ?? null;
    const refresh = (shared.refreshRecs as any[]).find(
      (r: any) =>
        String(r.metadata?.query ?? '').toLowerCase() ===
        key,
    );
    const action = (shared.actions as any[]).find(
      (a: any) =>
        String(
          a.metadata?.strategyKeyword ?? '',
        ).toLowerCase() === key && a.status !== 'DISMISSED',
    );

    /* ---- Link recs for this keyword (persisted) ---- */
    const persistedLinkRecs = (
      shared.linkRecs as any[]
    ).filter(
      (r: any) =>
        String(r.metadata?.keyword ?? '').toLowerCase() ===
        key,
    );
    let verifiedLinks: any[] = [];
    let linkRecCount = persistedLinkRecs.length;
    try {
      const computed =
        await this.contentStrategy.getLinkRecommendations(
          organizationId,
          websiteId,
          { keyword, limit: 5 },
        );
      verifiedLinks = (
        computed.recommendations ?? []
      ).map((r: any) => ({
        sourceUrl: r.sourceUrl,
        targetUrl: r.targetUrl,
        suggestedAnchor: r.suggestedAnchor,
        anchorSource: r.anchorSource,
        priority: r.priority,
        verification: r.verification ?? null,
      }));
      if (verifiedLinks.length > 0) {
        linkRecCount = verifiedLinks.length;
      }
    } catch {
      /* Computed recs are enhancement; persisted rows
         above already carry the durable state. */
    }

    /* ---- Sub-diagnoses ---- */
    const subs: SubDiagnosis[] = [
      this.technicalDiagnosis(pageFacts, shared.crawl),
      this.intentDiagnosis(
        opp,
        keyword,
        currentPage,
        pageFacts,
        serp,
      ),
      this.coverageDiagnosis({
        opp,
        cluster,
        siteEntry,
        compEntry,
        pageFacts,
        impressions: gscRow
          ? num((gscRow as any).impressions)
          : null,
      }),
      this.linkDiagnosis({
        inboundCount,
        linkRecCount,
        hasCrawl: shared.crawl !== null,
        supportingCount: cluster
          ? Number(cluster.size ?? 1) - 1
          : 0,
      }),
      this.authorityDiagnosis(serp, currentPage),
      this.formatDiagnosis(serp, currentPage, pageFacts),
      this.freshnessDiagnosis(refresh),
      this.cannibalizationDiagnosis(
        pageRows,
        opp,
        currentPage,
      ),
    ];

    const blocking = subs.find(
      (s) =>
        s.type === 'TECHNICAL_BLOCKER' &&
        s.state === 'CONFIRMED',
    );
    const order: DiagnosisType[] = [
      'TECHNICAL_BLOCKER',
      'INTENT_GAP',
      'CANNIBALIZATION_RISK',
      'CONTENT_COVERAGE_GAP',
      'SERP_FORMAT_GAP',
      'INTERNAL_LINK_GAP',
      'AUTHORITY_GAP',
      'FRESHNESS_GAP',
    ];
    let primary: DiagnosisType = 'NO_CLEAR_GAP';
    if (!gscRow && !opp && blocking === undefined) {
      primary = 'INSUFFICIENT_DATA';
    } else if (blocking) {
      primary = 'TECHNICAL_BLOCKER';
    } else {
      for (const type of order.slice(1)) {
        const sub = subs.find((s) => s.type === type);
        if (sub && sub.state === 'CONFIRMED') {
          primary = type;
          break;
        }
      }
    }
    const secondary = subs
      .filter(
        (s) =>
          s.type !== primary &&
          s.state === 'CONFIRMED',
      )
      .map((s) => s.type);

    const intentKnown = !!(opp?.intent || serp);
    const intentSub = subs.find(
      (s) => s.type === 'INTENT_GAP',
    );
    const explanation = composeExplanation({
      keyword,
      position,
      primary,
      intentKnown,
      intentMatches:
        intentSub?.state === 'ABSENT'
          ? true
          : intentSub?.state === 'CONFIRMED'
            ? false
            : null,
      technicalClean:
        subs
          .find((s) => s.type === 'TECHNICAL_BLOCKER')
          ?.state === 'ABSENT'
          ? true
          : null,
      coverageGap: primary === 'CONTENT_COVERAGE_GAP',
      linkGap: primary === 'INTERNAL_LINK_GAP',
    });
    const recommended = actionForDiagnosis(primary);

    const checklist = [
      {
        label: 'Intent',
        state:
          intentSub?.state === 'CONFIRMED'
            ? 'ATTENTION'
            : intentSub?.state === 'ABSENT'
              ? 'OK'
              : 'UNKNOWN',
        detail: intentSub?.headline ?? 'Intent unevaluated.',
      },
      {
        label: 'Content coverage',
        state:
          primary === 'CONTENT_COVERAGE_GAP'
            ? 'ATTENTION'
            : subs.find(
                  (s) =>
                    s.type ===
                    'CONTENT_COVERAGE_GAP',
                )?.state === 'ABSENT'
              ? 'OK'
              : 'UNKNOWN',
        detail:
          subs.find(
            (s) => s.type === 'CONTENT_COVERAGE_GAP',
          )?.headline ?? 'Coverage unevaluated.',
      },
      {
        label: 'Internal links',
        state:
          primary === 'INTERNAL_LINK_GAP'
            ? 'ATTENTION'
            : subs.find(
                  (s) =>
                    s.type === 'INTERNAL_LINK_GAP',
                )?.state === 'ABSENT'
              ? 'OK'
              : 'UNKNOWN',
        detail:
          subs.find(
            (s) => s.type === 'INTERNAL_LINK_GAP',
          )?.headline ?? 'Link support unevaluated.',
      },
      {
        label: 'Technical',
        state: blocking
          ? 'ATTENTION'
          : subs.find(
                (s) => s.type === 'TECHNICAL_BLOCKER',
              )?.state === 'ABSENT'
            ? 'OK'
            : 'UNKNOWN',
        detail: blocking
          ? blocking.headline
          : 'No observed technical blocker.',
      },
    ];

    return {
      keyword,
      website,
      generatedAt: new Date().toISOString(),
      windows: shared.windows,
      currentRanking: {
        position,
        prevPosition,
        positionDelta:
          position !== null && prevPosition !== null
            ? +(prevPosition - position).toFixed(1)
            : null,
        page: currentPage,
        pageCertainty,
        clicks: gscRow ? num((gscRow as any).clicks) : null,
        impressions: gscRow
          ? num((gscRow as any).impressions)
          : null,
        ctr: gscRow ? num((gscRow as any).ctr) : null,
        evidence: gscRow ? 'VERIFIED' : 'UNAVAILABLE',
      },
      primaryDiagnosis: primary,
      secondaryDiagnoses: secondary,
      explanation,
      checklist,
      subDiagnoses: subs,
      recommendedAction: {
        ...recommended,
        purpose: 'Recommended next step.',
      },
      strategy: opp
        ? {
            priority: opp.priority,
            priorityScore: opp.priorityScore,
            bucket: opp.bucket,
            pageMapping: opp.pageMapping,
            intent: opp.intent,
            intentSource: opp.intentSource,
            topic: cluster?.topic ?? null,
            evidence: 'INFERRED',
          }
        : null,
      serp: this.serpSummary(serp, serpFetchedAt),
      rankHistory,
      technical: this.technicalSummary(
        pageFacts,
        shared.crawl,
      ),
      internalLinks: {
        inboundCount,
        opportunities: verifiedLinks,
        persistedCount: persistedLinkRecs.length,
        evidence:
          inboundCount !== null
            ? 'OBSERVED'
            : 'UNAVAILABLE',
      },
      content: {
        mapping: opp?.pageMapping ?? null,
        brief: brief
          ? { id: brief.id, createdAt: brief.createdAt }
          : null,
        item: item
          ? { id: item.id, status: item.status }
          : null,
        refresh: refresh
          ? {
              id: refresh.id,
              reason: refresh.description,
            }
          : null,
      },
      pages: pageRows.slice(0, 5),
      evidence: this.evidencePanel({
        keyword,
        gscRow,
        gscPrevRow,
        opp,
        pageFacts,
        crawl: shared.crawl,
        serp,
        inboundCount,
        windows: shared.windows,
      }),
    };
  }

  // =======================================================
  // SUB-DIAGNOSES (deterministic, evidence-cited)
  // =======================================================

  private technicalDiagnosis(
    pageFacts: any,
    crawl: { id: string } | null,
  ): SubDiagnosis {
    if (!pageFacts) {
      return {
        type: 'TECHNICAL_BLOCKER',
        state: 'UNKNOWN',
        headline: crawl
          ? 'Target page was not crawled in the latest snapshot.'
          : 'No completed crawl exists to check technical state.',
        evidence: [],
        evidenceState: 'UNAVAILABLE',
      };
    }
    if (
      pageFacts.statusCode === null ||
      pageFacts.statusCode < 200 ||
      pageFacts.statusCode >= 300
    ) {
      return {
        type: 'TECHNICAL_BLOCKER',
        state: 'CONFIRMED',
        headline: `Page unavailable (HTTP ${pageFacts.statusCode ?? 'unknown'}).`,
        evidence: [
          `Status ${pageFacts.statusCode ?? 'unknown'} observed on the crawled page.`,
        ],
        evidenceState: 'OBSERVED',
      };
    }
    if (pageFacts.robotsIndexable === false) {
      return {
        type: 'TECHNICAL_BLOCKER',
        state: 'CONFIRMED',
        headline: 'Page is set to noindex.',
        evidence: [
          'robotsIndexable=false observed in crawl metadata.',
        ],
        evidenceState: 'OBSERVED',
      };
    }
    const canonical =
      pageFacts.canonicalAbsolute || pageFacts.canonical;
    if (
      canonical &&
      normalizeCrawlUrl(canonical) !==
        normalizeCrawlUrl(pageFacts.url)
    ) {
      return {
        type: 'TECHNICAL_BLOCKER',
        state: 'CONFIRMED',
        headline: 'Canonical points away from this URL.',
        evidence: [
          `Canonical ${canonical} does not match the crawled URL.`,
        ],
        evidenceState: 'OBSERVED',
      };
    }
    if (num(pageFacts.redirectCount) > 0) {
      return {
        type: 'TECHNICAL_BLOCKER',
        state: 'CONFIRMED',
        headline: 'Page resolves through redirects.',
        evidence: [
          `${pageFacts.redirectCount} redirect(s) observed before the final URL.`,
        ],
        evidenceState: 'OBSERVED',
      };
    }
    return {
      type: 'TECHNICAL_BLOCKER',
      state: 'ABSENT',
      headline: 'No observed technical blocker.',
      evidence: [
        `HTTP ${pageFacts.statusCode}, indexable, canonical consistent.`,
      ],
      evidenceState: 'OBSERVED',
    };
  }

  private intentDiagnosis(
    opp: any,
    keyword: string,
    currentPage: string | null,
    pageFacts: any,
    serp: any,
  ): SubDiagnosis {
    const keywordIntent = opp?.intent ?? null;
    if (!keywordIntent && !serp) {
      return {
        type: 'INTENT_GAP',
        state: 'UNKNOWN',
        headline: 'Intent cannot be evaluated.',
        evidence: [],
        evidenceState: 'UNAVAILABLE',
      };
    }
    const pageType = currentPage
      ? classifyContentType(
          currentPage,
          pageFacts?.title ?? null,
        )
      : 'Other';
    const serpTypes = this.serpTopTypes(serp);
    const dominant =
      serpTypes.length > 0 ? serpTypes[0].type : null;
    const expected = keywordIntent
      ? intentFamily(keywordIntent)
      : dominant
        ? contentTypeFamily(dominant)
        : 'OTHER';
    const pageFamily = contentTypeFamily(pageType);
    const serpFamily = dominant
      ? contentTypeFamily(dominant)
      : 'OTHER';
    const evidence: string[] = [];
    if (keywordIntent) {
      evidence.push(
        `Query intent ${keywordIntent} (${opp?.intentSource ?? 'RENKOO'}).`,
      );
    }
    evidence.push(`Current page reads as ${pageType}.`);
    if (dominant) {
      evidence.push(
        `Top SERP results are primarily ${dominant} pages.`,
      );
    }
    if (
      expected !== 'OTHER' &&
      pageFamily !== 'OTHER' &&
      serpFamily !== 'OTHER' &&
      (pageFamily !== expected || pageFamily !== serpFamily)
    ) {
      return {
        type: 'INTENT_GAP',
        state: 'CONFIRMED',
        headline: `Intent mismatch: query asks ${expected.toLowerCase()}, page serves ${pageFamily.toLowerCase()}.`,
        evidence,
        evidenceState: 'INFERRED',
      };
    }
    if (
      expected !== 'OTHER' &&
      (pageFamily === 'OTHER' || serpFamily === 'OTHER')
    ) {
      return {
        type: 'INTENT_GAP',
        state: 'UNKNOWN',
        headline: 'Intent comparison is inconclusive.',
        evidence,
        evidenceState: 'INFERRED',
      };
    }
    return {
      type: 'INTENT_GAP',
      state: 'ABSENT',
      headline: 'Page format aligns with query intent.',
      evidence,
      evidenceState: 'INFERRED',
    };
  }

  private coverageDiagnosis(input: {
    opp: any;
    cluster: any;
    siteEntry: any;
    compEntry: any;
    pageFacts: any;
    impressions: number | null;
  }): SubDiagnosis {
    const evidence: string[] = [];
    if (!input.pageFacts && !input.siteEntry && !input.opp) {
      return {
        type: 'CONTENT_COVERAGE_GAP',
        state: 'UNKNOWN',
        headline: 'Coverage cannot be evaluated.',
        evidence,
        evidenceState: 'UNAVAILABLE',
      };
    }
    let signals = 0;
    const siteRel = num(input.siteEntry?.relevanceScore);
    const compRel = num(input.compEntry?.relevanceScore);
    if (input.compEntry && (!input.siteEntry || compRel > siteRel * 1.5)) {
      signals++;
      evidence.push(
        `Competitors cover this topic (relevance ${compRel}) while this site shows ${siteRel} — OBSERVED corpus gap.`,
      );
    }
    const words = num(input.pageFacts?.wordCount);
    if (
      input.pageFacts &&
      words > 0 &&
      words < 300 &&
      (input.impressions ?? 0) >= 100
    ) {
      signals++;
      evidence.push(
        `Page has ${words} observed words against ${input.impressions} impressions — thin for the demand.`,
      );
    }
    const hCount =
      (input.pageFacts?.h1 ?? []).length +
      (input.pageFacts?.h2 ?? []).length;
    if (input.pageFacts && hCount === 0) {
      signals++;
      evidence.push(
        'No H1/H2 structure observed on the page.',
      );
    }
    const missing = num(input.cluster?.missingPages);
    if (missing > 0) {
      signals++;
      evidence.push(
        `Topic cluster is missing supporting content for ${missing} keyword(s).`,
      );
    }
    if (signals >= 2 || (signals >= 1 && input.compEntry && !input.siteEntry)) {
      return {
        type: 'CONTENT_COVERAGE_GAP',
        state: 'CONFIRMED',
        headline:
          'Current coverage does not match the demand and competitive evidence.',
        evidence,
        evidenceState: 'INFERRED',
      };
    }
    if (signals === 0) {
      return {
        type: 'CONTENT_COVERAGE_GAP',
        state: 'ABSENT',
        headline: 'No coverage gap in the observed evidence.',
        evidence,
        evidenceState: 'INFERRED',
      };
    }
    return {
      type: 'CONTENT_COVERAGE_GAP',
      state: 'UNKNOWN',
      headline: 'Coverage evidence is inconclusive.',
      evidence,
      evidenceState: 'INFERRED',
    };
  }

  private linkDiagnosis(input: {
    inboundCount: number | null;
    linkRecCount: number;
    hasCrawl: boolean;
    supportingCount: number;
  }): SubDiagnosis {
    if (input.inboundCount === null) {
      return {
        type: 'INTERNAL_LINK_GAP',
        state: 'UNKNOWN',
        headline: input.hasCrawl
          ? 'Inbound evidence unavailable for this page.'
          : 'No completed crawl — link support cannot be checked.',
        evidence: [],
        evidenceState: 'UNAVAILABLE',
      };
    }
    if (
      input.inboundCount === 0 &&
      (input.linkRecCount > 0 || input.supportingCount > 0)
    ) {
      return {
        type: 'INTERNAL_LINK_GAP',
        state: 'CONFIRMED',
        headline: `No verified inbound internal link points at the target, but ${input.linkRecCount > 0 ? `${input.linkRecCount} link opportunit${input.linkRecCount === 1 ? 'y' : 'ies'} exist` : `${input.supportingCount} supporting topic(s) exist`}.`,
        evidence: [
          `0 inbound CrawlLink edges observed in the latest crawl.`,
        ],
        evidenceState: 'OBSERVED',
      };
    }
    return {
      type: 'INTERNAL_LINK_GAP',
      state: 'ABSENT',
      headline:
        input.inboundCount > 0
          ? `${input.inboundCount} inbound internal link(s) observed.`
          : 'No link gap in the observed evidence.',
      evidence: [],
      evidenceState: 'OBSERVED',
    };
  }

  private authorityDiagnosis(
    serp: any,
    currentPage: string | null,
  ): SubDiagnosis {
    const results: any[] = Array.isArray(serp?.results)
      ? serp.results
      : [];
    /* Without a current page the target cannot be
       located among results — comparison meaningless. */
    if (results.length === 0 || !currentPage) {
      return {
        type: 'AUTHORITY_GAP',
        state: 'UNKNOWN',
        headline: 'Authority comparison needs cached SERP data.',
        evidence: [],
        evidenceState: 'UNAVAILABLE',
      };
    }
    const withSignals = results.filter(
      (r) =>
        r.pageStrength === 'Strong' ||
        num(r.referringDomains) > 0 ||
        num(r.backlinks) > 0,
    );
    if (withSignals.length === 0) {
      return {
        type: 'AUTHORITY_GAP',
        state: 'UNKNOWN',
        headline: 'Cached SERP rows carry no strength signals.',
        evidence: [],
        evidenceState: 'UNAVAILABLE',
      };
    }
    const targetNorm = currentPage
      ? normalizeCrawlUrl(currentPage)
      : '';
    const targetIdx = results.findIndex(
      (r) =>
        normalizeCrawlUrl(r.url ?? '') === targetNorm,
    );
    /* A stronger observed result outranking the target
       is an honest, narrowly-scoped gap signal. */
    const strongAbove = results
      .slice(
        0,
        targetIdx >= 0 ? targetIdx : results.length,
      )
      .filter(
        (r) =>
          r.pageStrength === 'Strong' ||
          num(r.referringDomains) >= 25,
      ).length;
    if (strongAbove >= 1) {
      return {
        type: 'AUTHORITY_GAP',
        state: 'CONFIRMED',
        headline: `${strongAbove} stronger observed result(s) rank above.`,
        evidence: [
          'Page strength / referring-domain signals observed in cached SERP rows.',
        ],
        evidenceState: 'INFERRED',
      };
    }
    return {
      type: 'AUTHORITY_GAP',
      state: 'ABSENT',
      headline: 'No observed authority disadvantage.',
      evidence: [],
      evidenceState: 'INFERRED',
    };
  }

  private formatDiagnosis(
    serp: any,
    currentPage: string | null,
    pageFacts: any,
  ): SubDiagnosis {
    const top = this.serpTopTypes(serp);
    if (top.length === 0 || !currentPage) {
      return {
        type: 'SERP_FORMAT_GAP',
        state: 'UNKNOWN',
        headline: 'Format comparison needs cached SERP data.',
        evidence: [],
        evidenceState: 'UNAVAILABLE',
      };
    }
    const dominant = top[0];
    const pageType = classifyContentType(
      currentPage,
      pageFacts?.title ?? null,
    );
    if (
      dominant.share >= 0.6 &&
      contentTypeFamily(dominant.type) !== 'OTHER' &&
      contentTypeFamily(pageType) !== 'OTHER' &&
      contentTypeFamily(dominant.type) !==
        contentTypeFamily(pageType)
    ) {
      return {
        type: 'SERP_FORMAT_GAP',
        state: 'CONFIRMED',
        headline: `Top results are primarily ${dominant.type} pages while the current page is ${pageType}.`,
        evidence: [
          `${dominant.count} of the top ${dominant.of} cached results share the ${dominant.type} format.`,
        ],
        evidenceState: 'INFERRED',
      };
    }
    return {
      type: 'SERP_FORMAT_GAP',
      state: 'ABSENT',
      headline: 'Page format aligns with the observed SERP mix.',
      evidence: [],
      evidenceState: 'INFERRED',
    };
  }

  private freshnessDiagnosis(
    refresh: any,
  ): SubDiagnosis {
    if (refresh) {
      return {
        type: 'FRESHNESS_GAP',
        state: 'CONFIRMED',
        headline: 'Measured performance declined — refresh candidate.',
        evidence: [
          refresh.description ??
            'GSC decline over comparable windows.',
        ],
        evidenceState: 'VERIFIED',
      };
    }
    return {
      type: 'FRESHNESS_GAP',
      state: 'UNKNOWN',
      headline: 'Freshness not established.',
      evidence: [],
      evidenceState: 'UNAVAILABLE',
    };
  }

  private cannibalizationDiagnosis(
    pageRows: Array<{ page: string }>,
    opp: any,
    currentPage: string | null,
  ): SubDiagnosis {
    const distinct = [
      ...new Set(pageRows.map((r) => r.page)),
    ];
    if (
      opp?.pageMapping === 'CONSOLIDATE' ||
      opp?.bucket === 'CONSOLIDATE' ||
      distinct.length >= 2
    ) {
      return {
        type: 'CANNIBALIZATION_RISK',
        state: 'CONFIRMED',
        headline: `${distinct.length || 'Multiple'} page(s) earn impressions for this query.`,
        evidence: distinct.slice(0, 5).map(
          (url) =>
            `${url}${currentPage && normalizeCrawlUrl(url) === normalizeCrawlUrl(currentPage) ? ' (current page)' : ''}`,
        ),
        evidenceState: 'VERIFIED',
      };
    }
    return {
      type: 'CANNIBALIZATION_RISK',
      state: 'ABSENT',
      headline: 'One page owns this query.',
      evidence: [],
      evidenceState: 'VERIFIED',
    };
  }

  private serpTopTypes(
    serp: any,
  ): Array<{
    type: ContentType;
    count: number;
    share: number;
    of: number;
  }> {
    const results: any[] = Array.isArray(serp?.results)
      ? serp.results.slice(0, 5)
      : [];
    if (results.length === 0) return [];
    const counts = new Map<ContentType, number>();
    for (const r of results) {
      const t: ContentType =
        r.contentType ??
        classifyContentType(
          r.url ?? '',
          r.title ?? null,
        );
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([type, count]) => ({
        type,
        count,
        share: count / results.length,
        of: results.length,
      }))
      .sort((a, b) => b.count - a.count);
  }

  private serpSummary(
    serp: any,
    fetchedAt: string | null,
  ): Record<string, any> {
    if (!serp) {
      return {
        available: false,
        state: 'SERP_INTELLIGENCE_UNAVAILABLE',
        detail:
          'No cached SERP observation for this keyword. Competitor comparison is unavailable — nothing was invented.',
      };
    }
    const results: any[] = Array.isArray(serp.results)
      ? serp.results
      : [];
    return {
      available: true,
      fetchedAt,
      totalResults: serp.totalResults ?? null,
      resultCount: results.length,
      top: results.slice(0, 3).map((r: any) => ({
        url: r.url,
        domain: r.domain,
        title: r.title ?? null,
        contentType:
          r.contentType ??
          classifyContentType(r.url ?? '', r.title ?? null),
        pageStrength: r.pageStrength ?? 'Unknown',
        referringDomains:
          r.referringDomains ?? null,
        backlinks: r.backlinks ?? null,
      })),
      features: (serp.features ?? []).map((f: any) => ({
        type: f.type,
        count: f.count ?? null,
      })),
      aiOverview:
        serp.aiPresence?.detected === true
          ? {
              detected: true,
              elementTypes:
                serp.aiPresence.elementTypes ?? [],
            }
          : { detected: false },
      competition: serp.competition ?? null,
      evidence: 'PROVIDER',
    };
  }

  private technicalSummary(
    pageFacts: any,
    crawl: { id: string } | null,
  ): Record<string, any> {
    if (!pageFacts) {
      return {
        available: false,
        state: crawl
          ? 'PAGE_NOT_CRAWLED'
          : 'CRAWL_UNAVAILABLE',
      };
    }
    return {
      available: true,
      statusCode: pageFacts.statusCode,
      robotsIndexable: pageFacts.robotsIndexable,
      canonical:
        pageFacts.canonicalAbsolute ||
        pageFacts.canonical ||
        null,
      redirectCount: num(pageFacts.redirectCount),
      finalUrl: pageFacts.finalUrl,
      wordCount:
        pageFacts.wordCount !== null &&
        pageFacts.wordCount !== undefined
          ? num(pageFacts.wordCount)
          : null,
      headings: {
        h1: (pageFacts.h1 ?? []).length,
        h2: (pageFacts.h2 ?? []).length,
      },
      evidence: 'OBSERVED',
    };
  }

  private evidencePanel(input: {
    keyword: string;
    gscRow: any;
    gscPrevRow: any;
    opp: any;
    pageFacts: any;
    crawl: { id: string; completedAt?: unknown } | null;
    serp: any;
    inboundCount: number | null;
    windows: {
      current: { startDate: string; endDate: string };
    };
  }): Array<Record<string, any>> {
    const rows: Array<Record<string, any>> = [];
    rows.push({
      source: 'GSC',
      label: input.gscRow
        ? `Position ${num((input.gscRow as any).position).toFixed(1)}, ${num((input.gscRow as any).impressions)} impressions, ${num((input.gscRow as any).clicks)} clicks`
        : 'No ranking data for this keyword',
      evidenceType: input.gscRow
        ? 'VERIFIED'
        : 'UNAVAILABLE',
      date: input.windows.current.endDate,
    });
    if (input.opp) {
      rows.push({
        source: 'Strategy',
        label: `${input.opp.priority} · ${input.opp.bucket} · ${input.opp.pageMapping} · score ${input.opp.priorityScore}`,
        evidenceType: 'INFERRED',
        date: input.windows.current.endDate,
      });
    }
    rows.push({
      source: 'Crawl',
      label: input.pageFacts
        ? `HTTP ${input.pageFacts.statusCode}, ${num(input.pageFacts.wordCount)} words observed`
        : 'Target page not in latest crawl',
      evidenceType: input.pageFacts
        ? 'OBSERVED'
        : 'UNAVAILABLE',
      date: input.crawl
        ? String(
            (input.crawl as any).completedAt ?? '',
          ).slice(0, 10) || null
        : null,
    });
    rows.push({
      source: 'CrawlLink',
      label:
        input.inboundCount !== null
          ? `${input.inboundCount} inbound internal link(s) observed`
          : 'Inbound graph unavailable',
      evidenceType:
        input.inboundCount !== null
          ? 'OBSERVED'
          : 'UNAVAILABLE',
      date: null,
    });
    rows.push({
      source: 'SERP',
      label: input.serp
        ? `${(input.serp.results ?? []).length} cached results`
        : 'SERP_INTELLIGENCE_UNAVAILABLE',
      evidenceType: input.serp
        ? 'PROVIDER'
        : 'UNAVAILABLE',
      date: null,
    });
    return rows;
  }
}

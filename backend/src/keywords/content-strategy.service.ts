import {
  Injectable,
  Logger,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { KeywordStrategyService } from './keyword-strategy.service';
import {
  KeywordResearchService,
  type CorpusEntry,
  type GscJoin,
} from './keyword-research.service';
import { CrawlLinkService } from '../crawl/crawl-link.service';
import {
  MAX_EDGES_PER_PAGE,
  anchorKeyOf,
  normalizeCrawlUrl,
} from '../crawl/crawl-links';

/*
 * =========================================================
 * CONTENT STRATEGY FOUNDATION 6.0 — persistence +
 * composition. CONNECTS existing intelligence, rebuilds
 * nothing.
 *
 * Reads (never recomputes):
 *  - Strategy 5.0 opportunities / clusters / actions
 *    (KeywordStrategyService.strategy — zero provider cost)
 *  - Content Engine items / briefs / drafts
 *    (ContentItem.targetQuery string join)
 *  - Recommendation REFRESH_REQUIRED rows (metadata.query)
 *  - Action rows (metadata.strategyKeyword)
 *
 * Writes (idempotent upserts only):
 *  - ContentCluster  (one row per org+website+topic)
 *  - ContentStrategyLink (one row per org+website+keyword)
 *
 * Identity: keyword = trim().toLowerCase(); URLs compare
 * case-insensitively with trailing slash stripped. There
 * is no canonical Page/Keyword table, so string joins are
 * the stable identifier (same convention as the strategy
 * engine itself).
 *
 * Source labels are preserved, never converted:
 * OBSERVED stays observed, INFERENCE stays inference,
 * PROVIDER fields stay null when uncached, AI rows stay
 * labeled via the caller's own metadata.
 * =========================================================
 */

export type ContentActionDecision =
  | 'CREATE'
  | 'IMPROVE'
  | 'OPTIMIZE'
  | 'REFRESH'
  | 'CONSOLIDATE'
  | 'PROTECT'
  | 'INTERNAL_LINK'
  | 'MONITOR'
  | 'IGNORE';

export function normalizeKeyword(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

export function normalizeUrl(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  return raw.replace(/\/$/, '').toLowerCase();
}

/*
 * Content decision from EXISTING strategy terminology.
 * Backend mapping names are preserved verbatim; this only
 * maps them onto the content-action vocabulary:
 *  - pageMapping IMPROVE/OPTIMIZE/CREATE/CONSOLIDATE/
 *    PROTECT/IGNORE pass through unchanged.
 *  - bucket MONITOR (strategy TRACK_KEYWORD rows) → MONITOR.
 *  - REFRESH overrides only when a persisted GSC decline
 *    (REFRESH_REQUIRED recommendation) names the same query
 *    AND the page already exists (IMPROVE/OPTIMIZE/PROTECT).
 *  - INTERNAL_LINK is never a primary decision: no engine
 *    computes missing-link decisions. It surfaces as a
 *    linkSuggestion (quick-win text or brief internalLinks),
 *    documented explicitly rather than invented.
 */
export function decideContentAction(input: {
  pageMapping: string | null;
  bucket: string | null;
  refreshHit: boolean;
}): ContentActionDecision {
  const mapping = String(
    input.pageMapping ?? '',
  ).toUpperCase();
  const bucket = String(
    input.bucket ?? '',
  ).toUpperCase();
  if (
    input.refreshHit &&
    (mapping === 'IMPROVE' ||
      mapping === 'OPTIMIZE' ||
      mapping === 'PROTECT')
  ) {
    return 'REFRESH';
  }
  if (mapping === 'CREATE') return 'CREATE';
  if (mapping === 'IMPROVE') return 'IMPROVE';
  if (mapping === 'OPTIMIZE') return 'OPTIMIZE';
  if (mapping === 'CONSOLIDATE') return 'CONSOLIDATE';
  if (mapping === 'PROTECT') return 'PROTECT';
  if (mapping === 'IGNORE') return 'IGNORE';
  if (bucket === 'MONITOR') return 'MONITOR';
  return 'MONITOR';
}

function isMissingTable(error: any): boolean {
  const code = String(
    error?.code ?? error?.name ?? '',
  );
  const message = String(error?.message ?? '');
  return (
    code === 'P2021' ||
    /does not exist|relation .* does not exist/i.test(
      message,
    )
  );
}

@Injectable()
export class ContentStrategyService {
  private readonly logger = new Logger(
    ContentStrategyService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly strategy: KeywordStrategyService,
    private readonly research: KeywordResearchService,
    private readonly crawlLinks: CrawlLinkService,
  ) {}

  // =======================================================
  // SYNC — idempotent persistence of a strategy result
  // =======================================================

  async syncFromStrategy(
    organizationId: string,
    websiteId: string,
    result: {
      opportunities: Array<{
        keyword: string;
        intent: string;
        position: number | null;
        impressions: number | null;
        clicks: number | null;
        ctr: number | null;
        volume: number | null;
        keywordDifficulty: number | null;
        targetPage: string | null;
        targetPageSource:
          | 'OBSERVED'
          | 'INFERENCE'
          | null;
        pageMapping: string;
        priority: string;
        priorityScore: number;
        bucket: string;
        quickWin: { action: string } | null;
      }>;
      clusters: Array<{
        topic: string;
        primaryKeyword: string;
        supportingKeywords: string[];
        size: number;
        intent: string;
        existingPages: string[];
        missingPages: number;
        cannibalizationRisk: boolean;
        priority: string;
        pillarPage: string | null;
        supportingContent: string[];
        recommendedPageType: string;
      }>;
    },
  ): Promise<{
    persisted: boolean;
    clusters: number;
    links: number;
  }> {
    try {
      for (const c of result.clusters) {
        await (this.prisma as any).contentCluster.upsert(
          {
            where: {
              organizationId_websiteId_topic: {
                organizationId,
                websiteId,
                topic: c.topic,
              },
            },
            create: {
              organizationId,
              websiteId,
              topic: c.topic,
              primaryKeyword: c.primaryKeyword,
              supportingKeywords:
                c.supportingKeywords ?? [],
              intent: c.intent ?? null,
              pillarPage: c.pillarPage ?? null,
              targetPage:
                c.pillarPage ??
                c.existingPages[0] ??
                null,
              priority: c.priority,
              size: c.size,
              missingPages: c.missingPages,
              cannibalizationRisk:
                c.cannibalizationRisk,
              recommendedPageType:
                c.recommendedPageType ?? null,
            },
            update: {
              primaryKeyword: c.primaryKeyword,
              supportingKeywords:
                c.supportingKeywords ?? [],
              intent: c.intent ?? null,
              pillarPage: c.pillarPage ?? null,
              targetPage:
                c.pillarPage ??
                c.existingPages[0] ??
                null,
              priority: c.priority,
              size: c.size,
              missingPages: c.missingPages,
              cannibalizationRisk:
                c.cannibalizationRisk,
              recommendedPageType:
                c.recommendedPageType ?? null,
            },
          },
        );
      }

      for (const o of result.opportunities) {
        const keyword = normalizeKeyword(o.keyword);
        if (!keyword) continue;
        const topic =
          await this.topicOf(organizationId, websiteId, o);
        const evidence = {
          positionSource: 'OBSERVED',
          engagementSource: 'OBSERVED',
          providerFields:
            o.volume !== null ||
            o.keywordDifficulty !== null
              ? 'PROVIDER'
              : 'UNAVAILABLE',
          targetPageSource: o.targetPageSource,
          quickWin: o.quickWin ? true : false,
        };
        await (this.prisma as any).contentStrategyLink.upsert(
          {
            where: {
              organizationId_websiteId_keyword: {
                organizationId,
                websiteId,
                keyword,
              },
            },
            create: {
              organizationId,
              websiteId,
              keyword,
              topic,
              targetPage: o.targetPage,
              pageMapping: o.pageMapping,
              bucket: o.bucket,
              priority: o.priority,
              priorityScore: o.priorityScore,
              intent: o.intent ?? null,
              contentAction: decideContentAction({
                pageMapping: o.pageMapping,
                bucket: o.bucket,
                refreshHit: false,
              }),
              evidence,
            },
            /* Strategy fields refresh; execution link ids
               are NEVER cleared here — only the composer
               fills them when it discovers real rows. */
            update: {
              topic,
              targetPage: o.targetPage,
              pageMapping: o.pageMapping,
              bucket: o.bucket,
              priority: o.priority,
              priorityScore: o.priorityScore,
              intent: o.intent ?? null,
              evidence,
            },
          },
        );
      }

      return {
        persisted: true,
        clusters: result.clusters.length,
        links: result.opportunities.length,
      };
    } catch (error) {
      if (isMissingTable(error)) {
        this.logger.warn(
          'Content strategy tables missing (migration 20260910000000 not applied) — sync skipped.',
        );
        return {
          persisted: false,
          clusters: 0,
          links: 0,
        };
      }
      throw error;
    }
  }

  private async topicOf(
    organizationId: string,
    websiteId: string,
    opportunity: { keyword: string },
  ): Promise<string | null> {
    /* Prefer the persisted cluster whose members name
       this keyword; fall back to null (the composer still
       shows the opportunity, topic unknown). */
    try {
      const clusters = await (
        this.prisma as any
      ).contentCluster.findMany({
        where: { organizationId, websiteId },
        select: {
          topic: true,
          primaryKeyword: true,
          supportingKeywords: true,
        },
      });
      const key = normalizeKeyword(
        opportunity.keyword,
      );
      for (const c of clusters) {
        const members = [
          normalizeKeyword(c.primaryKeyword),
          ...((Array.isArray(
            c.supportingKeywords,
          ) ? c.supportingKeywords : []) as unknown[]).map(
            normalizeKeyword,
          ),
        ];
        if (members.includes(key)) return c.topic;
      }
      return null;
    } catch (error) {
      if (isMissingTable(error)) return null;
      throw error;
    }
  }

  // =======================================================
  // LIGHT READ — persisted links + clusters (no recompute)
  // =======================================================

  async getLinks(
    organizationId: string,
    websiteId: string,
  ): Promise<{
    persistenceAvailable: boolean;
    total: number;
    clusters: Array<Record<string, any>>;
    links: Array<{
      keyword: string;
      topic: string | null;
      targetPage: string | null;
      pageMapping: string | null;
      bucket: string | null;
      priority: string | null;
      contentAction: string | null;
      content: {
        exists: boolean;
        id: string | null;
        status: string | null;
      };
      brief: {
        exists: boolean;
        id: string | null;
      };
      draft: {
        exists: boolean;
        id: string | null;
      };
      action: {
        exists: boolean;
        id: string | null;
        status: string | null;
      };
    }>;
  }> {
    try {
      const [clusters, links] = await Promise.all([
        (this.prisma as any).contentCluster.findMany({
          where: { organizationId, websiteId },
          orderBy: { updatedAt: 'desc' },
        }),
        (
          this.prisma as any
        ).contentStrategyLink.findMany({
          where: { organizationId, websiteId },
          orderBy: { updatedAt: 'desc' },
          take: 300,
        }),
      ]);
      const composed = await this.attachExecutionState(
        organizationId,
        websiteId,
        links,
        { persist: false },
      );
      return {
        persistenceAvailable: true,
        total: links.length,
        clusters,
        links: composed.map((c) => ({
          keyword: c.keyword,
          topic: c.topic,
          targetPage: c.targetPage,
          pageMapping: c.pageMapping,
          bucket: c.bucket,
          priority: c.priority,
          contentAction: c.contentAction,
          content: c.content,
          brief: c.brief,
          draft: c.draft,
          action: c.action,
        })),
      };
    } catch (error) {
      if (isMissingTable(error)) {
        return {
          persistenceAvailable: false,
          total: 0,
          clusters: [],
          links: [],
        };
      }
      throw error;
    }
  }

  // =======================================================
  // COMPOSITION — one unified content opportunity view.
  // Runs Strategy 5.0 (fresh, zero provider cost), syncs
  // it idempotently, then joins execution state. Uses
  // existing scores only — no new scoring.
  // =======================================================

  async getContentOpportunities(
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
    persistenceAvailable: boolean;
    website: { id: string; name: string; url: string };
    period: { startDate: string; endDate: string };
    dataAvailability: {
      provider: boolean;
      gscConnected: boolean;
      notes: string[];
    };
    total: number;
    clusters: Array<Record<string, any>>;
    opportunities: Array<Record<string, any>>;
    linkRecommendations: Array<
      LinkRecommendation & { verification: LinkVerification }
    >;
  }> {
    const strategy = await this.strategy.strategy(
      organizationId,
      {
        websiteId: dto.websiteId,
        startDate: dto.startDate,
        endDate: dto.endDate,
        country: dto.country,
        language: dto.language,
        limit: Math.min(
          Math.max(dto.limit ?? 100, 10),
          300,
        ),
      },
    );

    const sync = await this.syncFromStrategy(
      organizationId,
      dto.websiteId,
      strategy,
    );

    let links: any[] = [];
    if (sync.persisted) {
      links = await (
        this.prisma as any
      ).contentStrategyLink.findMany({
        where: {
          organizationId,
          websiteId: dto.websiteId,
        },
      });
    }

    const byKeyword = new Map(
      links.map((l: any) => [l.keyword, l]),
    );
    const composed = await this.attachExecutionState(
      organizationId,
      dto.websiteId,
      strategy.opportunities.map((o) => ({
        ...(byKeyword.get(normalizeKeyword(o.keyword)) ??
          null),
        keyword: normalizeKeyword(o.keyword),
        topic:
          byKeyword.get(
            normalizeKeyword(o.keyword),
          )?.topic ?? null,
        targetPage: o.targetPage,
        pageMapping: o.pageMapping,
        bucket: o.bucket,
        priority: o.priority,
        contentAction: null,
      })),
      { persist: sync.persisted },
    );

    const refreshByQuery = await this.refreshMap(
      organizationId,
      dto.websiteId,
    );

    const opportunities = strategy.opportunities.map(
      (o) => {
        const key = normalizeKeyword(o.keyword);
        const state = composed.find(
          (c: any) => c.keyword === key,
        );
        const refresh = refreshByQuery.get(key) ?? null;
        const contentAction = decideContentAction({
          pageMapping: o.pageMapping,
          bucket: o.bucket,
          refreshHit: refresh !== null,
        });
        const linkSuggestion = this.linkSuggestion(
          o,
          state ?? null,
        );
        return {
          keyword: o.keyword,
          topic: state?.topic ?? null,
          intent: o.intent,
          intentSource: o.intentSource,
          priority: o.priority,
          priorityScore: o.priorityScore,
          opportunityScore: o.opportunityScore,
          strategyBucket: o.bucket,
          pageMapping: o.pageMapping,
          targetPage: o.targetPage,
          targetPageSource: o.targetPageSource,
          contentAction,
          mappingNote:
            contentAction === 'REFRESH'
              ? `Page mapping ${o.pageMapping} with measured GSC decline — refresh before new work. OBSERVED.`
              : contentAction === 'MONITOR' &&
                  o.pageMapping !== 'IGNORE'
                ? `Page mapping ${o.pageMapping}; bucket ${o.bucket} — monitor until evidence strengthens. INFERENCE.`
                : null,
          position: o.position,
          clicks: o.clicks,
          impressions: o.impressions,
          ctr: o.ctr,
          volume: o.volume,
          keywordDifficulty: o.keywordDifficulty,
          cpc: o.cpc,
          trend: o.trend,
          serpVerdict: o.serpVerdict,
          sources: {
            position: 'OBSERVED',
            engagement: 'OBSERVED',
            targetPage: o.targetPageSource,
            provider:
              o.volume !== null ||
              o.keywordDifficulty !== null
                ? 'PROVIDER'
                : 'UNAVAILABLE',
            decision: 'INFERENCE',
          },
          content: state?.content ?? {
            exists: false,
            id: null,
            status: null,
          },
          brief: state?.brief ?? {
            exists: false,
            id: null,
          },
          draft: state?.draft ?? {
            exists: false,
            id: null,
          },
          action: state?.action ?? {
            exists: false,
            id: null,
            status: null,
          },
          refresh,
          linkSuggestion,
          priorityReasons: o.priorityReasons,
          mappingReason: o.mappingReason,
        };
      },
    );

    /* Bounded auto-sync of link recommendations into the
       existing Recommendation queue (same read-persists
       precedent as the refresh queue). Best-effort: link
       intelligence never blocks composition. */
    let linkRecommendations: LinkRecommendation[] = [];
    if (sync.persisted) {
      try {
        linkRecommendations =
          await this.computeLinkRecommendations(
            organizationId,
            dto.websiteId,
          );
        for (const rec of linkRecommendations.slice(0, 30)) {
          if (rec.futureContent) continue;
          await this.upsertLinkRecommendation(
            organizationId,
            dto.websiteId,
            rec,
          );
        }
      } catch (error) {
        /* Degrade, never break: composition's contract is
           opportunities + execution state. Link failures
           (missing tables, unavailable evidence) surface
           as an empty list with persistence intact. */
        this.logger.warn(
          `Link recommendation sync degraded: ${String(
            (error as any)?.message ?? error,
          )}`,
        );
        linkRecommendations = [];
      }
    }

    return {
      persistenceAvailable: sync.persisted,
      website: strategy.website,
      period: strategy.period,
      dataAvailability: {
        provider:
          strategy.dataAvailability.provider,
        gscConnected:
          strategy.dataAvailability.gscConnected,
        notes: strategy.dataAvailability.notes,
      },
      total: opportunities.length,
      clusters: sync.persisted
        ? await (this.prisma as any).contentCluster.findMany(
            {
              where: {
                organizationId,
                websiteId: dto.websiteId,
              },
              orderBy: { updatedAt: 'desc' },
            },
          )
        : [],
      opportunities,
      linkRecommendations: await this.withVerification(
        organizationId,
        dto.websiteId,
        linkRecommendations.slice(0, 30),
      ),
    };
  }

  // =======================================================
  // EXECUTION-STATE JOIN (shared by light + full reads)
  // =======================================================

  private async attachExecutionState(
    organizationId: string,
    websiteId: string,
    rows: Array<{
      keyword: string;
      topic?: string | null;
      targetPage?: string | null;
      pageMapping?: string | null;
      bucket?: string | null;
      priority?: string | null;
      contentAction?: string | null;
      contentItemId?: string | null;
      briefId?: string | null;
      draftId?: string | null;
      actionId?: string | null;
    }>,
    opts: { persist: boolean },
  ): Promise<
    Array<{
      keyword: string;
      topic: string | null;
      targetPage: string | null;
      pageMapping: string | null;
      bucket: string | null;
      priority: string | null;
      contentAction: string | null;
      content: {
        exists: boolean;
        id: string | null;
        status: string | null;
      };
      brief: {
        exists: boolean;
        id: string | null;
      };
      draft: {
        exists: boolean;
        id: string | null;
      };
      action: {
        exists: boolean;
        id: string | null;
        status: string | null;
      };
    }>
  > {
    const [items, briefs, drafts, actions] =
      await Promise.all([
        this.prisma.contentItem.findMany({
          where: { organizationId, websiteId },
          select: {
            id: true,
            targetQuery: true,
            pageUrl: true,
            status: true,
            title: true,
          },
          take: 200,
        }),
        this.prisma.contentBrief.findMany({
          where: { organizationId, websiteId },
          select: {
            id: true,
            itemId: true,
            targetQuery: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        this.prisma.contentDraft.findMany({
          where: { organizationId, websiteId },
          select: {
            id: true,
            itemId: true,
            briefId: true,
            mode: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        this.prisma.action.findMany({
          where: { organizationId, websiteId },
          select: {
            id: true,
            status: true,
            title: true,
            metadata: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 200,
        }),
      ]);

    const itemByQuery = new Map<string, any>();
    const itemByUrl = new Map<string, any>();
    for (const item of items) {
      const q = normalizeKeyword(item.targetQuery);
      if (q && !itemByQuery.has(q))
        itemByQuery.set(q, item);
      const u = normalizeUrl(item.pageUrl);
      if (u && !itemByUrl.has(u))
        itemByUrl.set(u, item);
    }
    const briefByItem = new Map<string, any>();
    const briefByQuery = new Map<string, any>();
    for (const brief of briefs) {
      if (
        brief.itemId &&
        !briefByItem.has(brief.itemId)
      )
        briefByItem.set(brief.itemId, brief);
      const q = normalizeKeyword(brief.targetQuery);
      if (q && !briefByQuery.has(q))
        briefByQuery.set(q, brief);
    }
    const draftByItem = new Map<string, any>();
    const draftByBrief = new Map<string, any>();
    for (const draft of drafts) {
      if (
        draft.itemId &&
        !draftByItem.has(draft.itemId)
      )
        draftByItem.set(draft.itemId, draft);
      if (
        draft.briefId &&
        !draftByBrief.has(draft.briefId)
      )
        draftByBrief.set(draft.briefId, draft);
    }
    const actionByKeyword = new Map<string, any>();
    for (const action of actions) {
      const q = normalizeKeyword(
        (action.metadata as any)?.strategyKeyword,
      );
      if (
        q &&
        !actionByKeyword.has(q) &&
        action.status !== 'DISMISSED'
      )
        actionByKeyword.set(q, action);
    }

    const out: Array<{
      keyword: string;
      topic: string | null;
      targetPage: string | null;
      pageMapping: string | null;
      bucket: string | null;
      priority: string | null;
      contentAction: string | null;
      content: {
        exists: boolean;
        id: string | null;
        status: string | null;
      };
      brief: {
        exists: boolean;
        id: string | null;
      };
      draft: {
        exists: boolean;
        id: string | null;
      };
      action: {
        exists: boolean;
        id: string | null;
        status: string | null;
      };
    }> = [];

    for (const row of rows) {
      const key = normalizeKeyword(row.keyword);
      const item =
        itemByQuery.get(key) ??
        (row.targetPage
          ? itemByUrl.get(
              normalizeUrl(row.targetPage) ?? '',
            )
          : null) ??
        null;
      const brief = item
        ? (briefByItem.get(item.id) ?? null)
        : (briefByQuery.get(key) ?? null);
      const draft = item
        ? (draftByItem.get(item.id) ??
          (brief
            ? (draftByBrief.get(brief.id) ?? null)
            : null))
        : brief
          ? (draftByBrief.get(brief.id) ?? null)
          : null;
      const action = actionByKeyword.get(key) ?? null;

      /* Persist discovered ids so rebuilds reuse them
         instead of re-matching. Only fills — never
         clears — and only when persistence is on. */
      if (opts.persist && (item || brief || draft || action)) {
        try {
          await (
            this.prisma as any
          ).contentStrategyLink.update({
            where: {
              organizationId_websiteId_keyword: {
                organizationId,
                websiteId,
                keyword: key,
              },
            },
            data: {
              ...(item ? { contentItemId: item.id } : {}),
              ...(brief ? { briefId: brief.id } : {}),
              ...(draft ? { draftId: draft.id } : {}),
              ...(action
                ? {
                    actionId: action.id,
                    recommendationId:
                      (action as any).recommendationId ??
                      undefined,
                  }
                : {}),
            },
          });
        } catch (error) {
          if (!isMissingTable(error)) throw error;
        }
      }

      out.push({
        keyword: row.keyword,
        topic: row.topic ?? null,
        targetPage: row.targetPage ?? null,
        pageMapping: row.pageMapping ?? null,
        bucket: row.bucket ?? null,
        priority: row.priority ?? null,
        contentAction: row.contentAction ?? null,
        content: {
          exists: item !== null,
          id: item?.id ?? null,
          status: item?.status ?? null,
        },
        brief: {
          exists: brief !== null,
          id: brief?.id ?? null,
        },
        draft: {
          exists: draft !== null,
          id: draft?.id ?? null,
        },
        action: {
          exists: action !== null,
          id: action?.id ?? null,
          status: action?.status ?? null,
        },
      });
    }

    return out;
  }

  private async refreshMap(
    organizationId: string,
    websiteId: string,
  ): Promise<
    Map<
      string,
      {
        needed: true;
        reason: string;
        recommendationId: string;
        source: 'OBSERVED';
      }
    >
  > {
    const out = new Map<
      string,
      {
        needed: true;
        reason: string;
        recommendationId: string;
        source: 'OBSERVED';
      }
    >();
    const rows = await this.prisma.recommendation.findMany(
      {
        where: {
          organizationId,
          websiteId,
          source: 'CONTENT',
          type: 'REFRESH_REQUIRED',
          status: { in: ['OPEN', 'IN_PROGRESS'] },
        },
        select: {
          id: true,
          description: true,
          metadata: true,
        },
        take: 100,
      },
    );
    for (const row of rows) {
      const q = normalizeKeyword(
        (row.metadata as any)?.query,
      );
      if (q && !out.has(q)) {
        out.set(q, {
          needed: true,
          reason:
            row.description ??
            'Measured GSC decline over comparable 28-day windows.',
          recommendationId: row.id,
          source: 'OBSERVED',
        });
      }
    }
    return out;
  }

  private linkSuggestion(
    opportunity: {
      quickWin: { action: string } | null;
      pageMapping: string;
    },
    state: {
      brief: { exists: boolean; id: string | null };
    } | null,
  ): {
    suggested: boolean;
    reason: string;
    source: 'INFERENCE' | 'UNAVAILABLE';
  } {
    /* Coarse flag kept for backward compatibility; the
       structured recommender below is the real engine. */
    if (
      opportunity.quickWin &&
      /internal link/i.test(opportunity.quickWin.action)
    ) {
      return {
        suggested: true,
        reason:
          'Quick-win evidence recommends one internal link from the most relevant existing page. INFERENCE.',
        source: 'INFERENCE',
      };
    }
    return {
      suggested: false,
      reason:
        'No internal-link evidence for this keyword yet — quick-win or brief analysis produces it when available.',
      source: 'UNAVAILABLE',
    };
  }

  // =======================================================
  // INTERNAL LINK RECOMMENDER 6.0 Phase 2A (deterministic)
  //
  // Uses ONLY data RENKOO already has: persisted strategy
  // links + clusters, site crawl corpus (title/meta/H1/H2
  // n-grams — no body text), live GSC query/page joins,
  // and existing brief internal-link candidates.
  //
  // Explicitly NOT used: anchor text (never persisted),
  // inbound counts, orphan status, backlink authority,
  // traffic estimates, provider data. Suggested anchors
  // are INFERENCE from keyword/topic evidence, never
  // observed. No new score: targets rank by existing
  // Strategy 5.0 priority band + priorityScore.
  // =======================================================

  async getLinkRecommendations(
    organizationId: string,
    websiteId: string,
    opts: {
      keyword?: string;
      targetUrl?: string;
      limit?: number;
    } = {},
  ): Promise<{
    persistenceAvailable: boolean;
    total: number;
    recommendations: Array<
      LinkRecommendation & { verification: LinkVerification }
    >;
  }> {
    try {
      const computed = await this.computeLinkRecommendations(
        organizationId,
        websiteId,
      );
      const kw = normalizeKeyword(opts.keyword);
      const tgt = normalizeUrl(opts.targetUrl);
      let recs = computed;
      if (kw) {
        recs = recs.filter(
          (r) => normalizeKeyword(r.keyword) === kw,
        );
      }
      if (tgt) {
        recs = recs.filter(
          (r) => normalizeUrl(r.targetUrl) === tgt,
        );
      }
      const limit = Math.min(
        Math.max(opts.limit ?? 20, 1),
        100,
      );
      const sliced = recs.slice(0, limit);
      return {
        persistenceAvailable: true,
        total: recs.length,
        recommendations: await this.withVerification(
          organizationId,
          websiteId,
          sliced,
        ),
      };
    } catch (error) {
      if (isMissingTable(error)) {
        return {
          persistenceAvailable: false,
          total: 0,
          recommendations: [],
        };
      }
      throw error;
    }
  }

  /*
   * Batch verification attach (one graph read set per
   * call, never per recommendation). Degrades to
   * UNAVAILABLE entries — verification never breaks
   * the recommendation read.
   */
  private async withVerification(
    organizationId: string,
    websiteId: string,
    recs: LinkRecommendation[],
  ): Promise<
    Array<LinkRecommendation & { verification: LinkVerification }>
  > {
    if (recs.length === 0) return [];
    try {
      const { results } = await this.verifyLinkPairs(
        organizationId,
        websiteId,
        recs.map((r) => ({
          sourceUrl: r.sourceUrl,
          targetUrl: r.targetUrl,
          suggestedAnchor: r.suggestedAnchor,
        })),
      );
      return recs.map((rec, i) => ({
        ...rec,
        verification: results[i],
      }));
    } catch (error) {
      this.logger.warn(
        `Link verification degraded: ${String(
          (error as any)?.message ?? error,
        )}`,
      );
      return recs.map((rec) => ({
        ...rec,
        verification: unavailableVerification(
          'Verification unavailable — graph read failed.',
        ),
      }));
    }
  }

  async syncLinkRecommendations(
    organizationId: string,
    websiteId: string,
    opts: { limit?: number } = {},
  ): Promise<{
    persisted: boolean;
    computed: number;
    created: number;
    updated: number;
    skippedDismissed: number;
  }> {
    const cap = Math.min(
      Math.max(opts.limit ?? 50, 1),
      150,
    );
    let computed: LinkRecommendation[];
    try {
      computed = await this.computeLinkRecommendations(
        organizationId,
        websiteId,
      );
    } catch (error) {
      if (isMissingTable(error)) {
        return {
          persisted: false,
          computed: 0,
          created: 0,
          updated: 0,
          skippedDismissed: 0,
        };
      }
      throw error;
    }

    let created = 0;
    let updated = 0;
    let skippedDismissed = 0;
    for (const rec of computed.slice(0, cap)) {
      /* CREATE-future targets have no URL to act on —
         computed on demand, never persisted as work. */
      if (rec.futureContent) continue;
      const outcome = await this.upsertLinkRecommendation(
        organizationId,
        websiteId,
        rec,
      );
      if (outcome === 'created') created++;
      else if (outcome === 'updated') updated++;
      else skippedDismissed++;
    }
    return {
      persisted: true,
      computed: computed.length,
      created,
      updated,
      skippedDismissed,
    };
  }

  // =======================================================
  // PHASE 2C — VERIFICATION (RECOMMENDED vs OBSERVED).
  // Read-only over the CrawlLink graph. Never mutates
  // Recommendation/Action status — lifecycle state stays
  // separate from verification state (layers stay split).
  // =======================================================

  async verifyLinkPairs(
    organizationId: string,
    websiteId: string,
    pairs: Array<{
      sourceUrl: string;
      targetUrl: string;
      suggestedAnchor?: string | null;
    }>,
  ): Promise<{
    crawlId: string | null;
    crawlCompletedAt: string | null;
    results: LinkVerification[];
  }> {
    const normalized = pairs.map((pair) => ({
      sourceUrl: normalizeCrawlUrl(
        String(pair.sourceUrl ?? ''),
      ),
      targetUrl: normalizeCrawlUrl(
        String(pair.targetUrl ?? ''),
      ),
      suggestedAnchor:
        typeof pair.suggestedAnchor === 'string'
          ? pair.suggestedAnchor
          : null,
    }));

    let crawl: {
      id: string;
      completedAt: Date | null;
      status: string;
    } | null = null;
    try {
      crawl =
        await this.crawlLinks.latestCompletedCrawl(
          organizationId,
          websiteId,
        );
    } catch (error) {
      if (isMissingTable(error)) {
        return {
          crawlId: null,
          crawlCompletedAt: null,
          results: normalized.map(() =>
            unavailableVerification(
              'Link graph unavailable (migration pending).',
            ),
          ),
        };
      }
      throw error;
    }
    if (!crawl) {
      return {
        crawlId: null,
        crawlCompletedAt: null,
        results: normalized.map(() =>
          unavailableVerification(
            'No completed crawl yet — run a crawl to verify.',
          ),
        ),
      };
    }

    const sources = normalized.map((p) => p.sourceUrl);
    const targets = normalized.map((p) => p.targetUrl);
    let facts: Map<string, any>;
    let edges: any[];
    let distinctCounts: Map<string, number>;
    let recent: Array<{
      id: string;
      completedAt: Date | null;
      status: string;
    }>;
    try {
      [facts, edges, distinctCounts, recent] =
        await Promise.all([
          this.crawlLinks.getPageFacts(
            organizationId,
            websiteId,
            crawl.id,
            [...sources, ...targets],
          ),
          this.crawlLinks.getEdgesForPairs(
            organizationId,
            websiteId,
            crawl.id,
            normalized.filter(
              (p) => p.sourceUrl && p.targetUrl,
            ),
          ),
          this.crawlLinks.countDistinctEdgesBySource(
            organizationId,
            websiteId,
            crawl.id,
            sources.filter(Boolean),
          ),
          this.crawlLinks.recentCompletedCrawls(
            organizationId,
            websiteId,
            2,
          ),
        ]);
    } catch (error) {
      if (isMissingTable(error)) {
        return {
          crawlId: crawl.id,
          crawlCompletedAt: crawl.completedAt
            ? new Date(crawl.completedAt).toISOString()
            : null,
          results: normalized.map(() =>
            unavailableVerification(
              'Link graph unavailable (migration pending).',
            ),
          ),
        };
      }
      throw error;
    }
    const prevCrawl =
      recent.find((c) => c.id !== crawl!.id) ?? null;
    const prevEdges = prevCrawl
      ? await this.crawlLinks.getEdgesForPairs(
          organizationId,
          websiteId,
          prevCrawl.id,
          normalized.filter(
            (p) => p.sourceUrl && p.targetUrl,
          ),
        )
      : [];
    const prevPairs = new Set(
      prevEdges.map(
        (e) =>
          `${normKey(e.sourceUrl)}|${normKey(e.targetUrl)}`,
      ),
    );

    const edgesByPair = new Map<string, any[]>();
    for (const edge of edges) {
      const key = `${normKey(edge.sourceUrl)}|${normKey(edge.targetUrl)}`;
      const list = edgesByPair.get(key) ?? [];
      list.push(edge);
      edgesByPair.set(key, list);
    }

    const completedAt = crawl.completedAt
      ? new Date(crawl.completedAt).toISOString()
      : null;
    const results = normalized.map((pair) =>
      verifyOnePair(
        pair,
        {
          crawlId: crawl!.id,
          completedAt,
          facts,
          edgesByPair,
          distinctCounts,
          prevPairs,
          prevCrawlId: prevCrawl?.id ?? null,
        },
      ),
    );
    return {
      crawlId: crawl.id,
      crawlCompletedAt: completedAt,
      results,
    };
  }

  // =======================================================
  // PHASE 2C — ORPHAN INTELLIGENCE (POTENTIAL_ORPHAN only).
  // Zero inbound in the graph is an observed coverage
  // fact, never an SEO verdict. Strategy evidence (when
  // present) explains importance — no new score.
  // =======================================================

  async getOrphanIntelligence(
    organizationId: string,
    websiteId: string,
    opts: { limit?: number } = {},
  ): Promise<{
    persistenceAvailable: boolean;
    crawlId: string | null;
    crawlCompletedAt: string | null;
    totalCandidates: number;
    excludedCount: number;
    candidates: OrphanCandidate[];
  }> {
    const limit = Math.min(
      Math.max(opts.limit ?? 20, 1),
      100,
    );
    let crawl: {
      id: string;
      completedAt: Date | null;
      status: string;
    } | null = null;
    let websiteUrl: string | null = null;
    try {
      const website =
        await this.prisma.website.findFirst({
          where: { id: websiteId, organizationId },
          select: { url: true },
        });
      if (!website) {
        throw new Error('Website not found');
      }
      websiteUrl = website.url;
      crawl =
        await this.crawlLinks.latestCompletedCrawl(
          organizationId,
          websiteId,
        );
    } catch (error) {
      if (isMissingTable(error)) {
        return {
          persistenceAvailable: false,
          crawlId: null,
          crawlCompletedAt: null,
          totalCandidates: 0,
          excludedCount: 0,
          candidates: [],
        };
      }
      throw error;
    }
    if (!crawl) {
      return {
        persistenceAvailable: true,
        crawlId: null,
        crawlCompletedAt: null,
        totalCandidates: 0,
        excludedCount: 0,
        candidates: [],
      };
    }

    const rootNorm = normalizeCrawlUrl(
      String(websiteUrl ?? ''),
    );
    let raw: Array<{
      url: string;
      title: string | null;
      statusCode: number | null;
      robotsIndexable: boolean | null;
      canonical: string | null;
      canonicalAbsolute: string | null;
      redirectCount: number | null;
      finalUrl: string | null;
    }>;
    try {
      raw =
        await this.crawlLinks.getOrphanCandidates(
          organizationId,
          websiteId,
          crawl.id,
        );
    } catch (error) {
      if (isMissingTable(error)) {
        return {
          persistenceAvailable: false,
          crawlId: null,
          crawlCompletedAt: null,
          totalCandidates: 0,
          excludedCount: 0,
          candidates: [],
        };
      }
      throw error;
    }

    const eligible: typeof raw = [];
    let excludedCount = 0;
    for (const page of raw) {
      /* Navigational root is not orphan analysis. */
      if (
        rootNorm &&
        normKey(page.url) === normKey(rootNorm)
      ) {
        excludedCount++;
        continue;
      }
      const eligibility = pageLinkEligibility({
        statusCode: page.statusCode,
        robotsIndexable: page.robotsIndexable,
        canonical: page.canonical,
        canonicalAbsolute: page.canonicalAbsolute,
        redirectCount: page.redirectCount,
        url: page.url,
      });
      if (!eligibility.eligible) {
        excludedCount++;
        continue;
      }
      eligible.push(page);
    }

    const links = await (
      this.prisma as any
    ).contentStrategyLink.findMany({
      where: { organizationId, websiteId },
    });
    const byTarget = new Map<string, any[]>();
    for (const link of links) {
      if (!link.targetPage) continue;
      const key = normKey(link.targetPage);
      const list = byTarget.get(key) ?? [];
      list.push(link);
      byTarget.set(key, list);
    }

    const completedAt = crawl.completedAt
      ? new Date(crawl.completedAt).toISOString()
      : null;
    const candidates: OrphanCandidate[] = eligible.map(
      (page) => {
        const matches =
          byTarget.get(normKey(page.url)) ?? [];
        matches.sort(
          (a, b) =>
            bandRankOf(a.priority) -
              bandRankOf(b.priority) ||
            (b.priorityScore ?? 0) -
              (a.priorityScore ?? 0),
        );
        const best = matches[0] ?? null;
        return {
          url: page.url,
          title: page.title,
          label: 'POTENTIAL_ORPHAN',
          inboundCount: 0,
          crawlId: crawl!.id,
          crawlCompletedAt: completedAt,
          strategy: best
            ? {
                keyword: best.keyword,
                topic: best.topic,
                priority: best.priority,
                priorityScore:
                  best.priorityScore ?? null,
                pageMapping: best.pageMapping,
                bucket: best.bucket,
                contentAction:
                  best.contentAction ?? null,
              }
            : null,
          explanation: best
            ? `${best.priority ?? 'UNRATED'} priority Strategy page (“${best.keyword}”, ${best.pageMapping ?? 'unmapped'}) with no observed inbound internal links in the latest completed crawl. Explanation only — not a score.`
            : 'Potential orphan based on crawl graph — no Strategy evidence for this URL.',
        };
      },
    );
    candidates.sort((a, b) => {
      const ar =
        a.strategy != null ? 0 : 1;
      const br =
        b.strategy != null ? 0 : 1;
      if (ar !== br) return ar - br;
      if (a.strategy && b.strategy) {
        return (
          bandRankOf(a.strategy.priority) -
            bandRankOf(b.strategy.priority) ||
          (b.strategy.priorityScore ?? 0) -
            (a.strategy.priorityScore ?? 0)
        );
      }
      return a.url < b.url ? -1 : 1;
    });

    return {
      persistenceAvailable: true,
      crawlId: crawl.id,
      crawlCompletedAt: completedAt,
      totalCandidates: candidates.length,
      excludedCount,
      candidates: candidates.slice(0, limit),
    };
  }

  private async upsertLinkRecommendation(
    organizationId: string,
    websiteId: string,
    rec: LinkRecommendation,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const existing = await this.findLinkRecommendation(
      organizationId,
      websiteId,
      rec,
    );
    /* Dismissed or completed work is never resurrected
       and never duplicated. */
    if (
      existing &&
      (existing.status === 'DISMISSED' ||
        existing.status === 'COMPLETED')
    ) {
      return 'skipped';
    }
    const data = {
      organizationId,
      websiteId,
      source: 'CONTENT',
      type: 'INTERNAL_LINK_OPPORTUNITY',
      title: `Link ${shortUrl(rec.sourceUrl)} → ${shortUrl(rec.targetUrl)} (“${rec.suggestedAnchor}”)`,
      description: rec.reason,
      priority: rec.priority,
      impact: rec.priority === 'HIGH' ? 'HIGH' : 'MEDIUM',
      effort: 'LOW',
      actionText: `Add a contextual link on ${rec.sourceUrl} pointing to ${rec.targetUrl} with anchor text along the lines of “${rec.suggestedAnchor}”. Verify the link renders before marking done.`,
      pageUrl: rec.sourceUrl,
      metadata: {
        sourceUrl: rec.sourceUrl,
        targetUrl: rec.targetUrl,
        suggestedAnchor: rec.suggestedAnchor,
        anchorSource: rec.anchorSource,
        keyword: rec.keyword,
        topic: rec.topic,
        reason: rec.reason,
        priority: rec.priority,
        priorityBand: rec.priorityBand,
        evidenceSources: rec.evidenceSources,
        futureContent: false,
      },
    };
    if (existing) {
      await this.prisma.recommendation.update({
        where: { id: existing.id },
        data,
      });
      return 'updated';
    }
    await this.prisma.recommendation.create({ data });
    return 'created';
  }

  private async findLinkRecommendation(
    organizationId: string,
    websiteId: string,
    rec: LinkRecommendation,
  ): Promise<{ id: string; status: string } | null> {
    const rows = await this.prisma.recommendation.findMany(
      {
        where: {
          organizationId,
          websiteId,
          source: 'CONTENT',
          type: 'INTERNAL_LINK_OPPORTUNITY',
        },
        select: { id: true, status: true, metadata: true },
        take: 200,
      },
    );
    const key = linkIdentityKey(rec);
    for (const row of rows) {
      const meta = (row.metadata ?? {}) as Record<
        string,
        any
      >;
      const candidate: LinkRecommendation = {
        ...rec,
        sourceUrl: String(meta.sourceUrl ?? ''),
        targetUrl: String(meta.targetUrl ?? ''),
        keyword: String(meta.keyword ?? ''),
      };
      if (linkIdentityKey(candidate) === key) return row;
    }
    return null;
  }

  private async computeLinkRecommendations(
    organizationId: string,
    websiteId: string,
  ): Promise<LinkRecommendation[]> {
    const [links, clusters] = await Promise.all([
      (this.prisma as any).contentStrategyLink.findMany({
        where: { organizationId, websiteId },
      }),
      (this.prisma as any).contentCluster.findMany({
        where: { organizationId, websiteId },
      }),
    ]);
    if (links.length === 0) return [];

    const { siteCorpus } = await this.research.getCorpora(
      organizationId,
      websiteId,
    );
    const { byQueryPages } =
      await this.research.getGscMaps(
        organizationId,
        defaultGscRange(),
      );
    const briefSources = await this.briefSourceMap(
      organizationId,
      websiteId,
    );
    const knownPages = knownSitePages(
      siteCorpus,
      byQueryPages,
    );
    const dismissed = await this.dismissedLinkKeys(
      organizationId,
      websiteId,
    );

    const clusterByTopic = new Map<string, any>(
      clusters.map((c: any) => [
        normalizeKeyword(c.topic),
        c,
      ]),
    );

    const recs: LinkRecommendation[] = [];
    const targets = [...links]
      .filter(
        (l: any) =>
          String(l.bucket ?? '').toUpperCase() !==
            'IGNORE' &&
          String(l.pageMapping ?? '').toUpperCase() !==
            'IGNORE',
      )
      .sort(
        (a: any, b: any) =>
          bandRankOf(a.priority) -
            bandRankOf(b.priority) ||
          (b.priorityScore ?? 0) -
            (a.priorityScore ?? 0),
      );

    for (const target of targets) {
      const targetKey = normalizeKeyword(target.keyword);
      const targetUrl =
        typeof target.targetPage === 'string' &&
        target.targetPage.trim()
          ? target.targetPage.trim()
          : null;
      const isCreate =
        String(target.pageMapping ?? '').toUpperCase() ===
        'CREATE';
      /* Missing target: reject unless this is a CREATE
         (future-content target, URL honestly absent). */
      if (!targetUrl && !isCreate) continue;
      if (
        targetUrl &&
        !knownPages.has(normalizeUrl(targetUrl) ?? '')
      ) {
        continue;
      }
      const cluster =
        clusterByTopic.get(normalizeKeyword(target.topic)) ??
        null;
      const supporting = supportingKeywordsOf(
        cluster,
        target,
      );

      const sources = rankLinkSources(
        {
          target,
          targetKey,
          topic: target.topic,
          supporting,
          links,
          siteCorpus,
          byQueryPages,
          briefSources,
          getParentTopic: (kw: string) =>
            this.research.getParentTopic(kw),
        },
        3,
      );

      for (const source of sources) {
        const anchor = pickLinkAnchor({
          supporting: source.viaKeyword,
          primary: target.keyword,
          topic: target.topic,
          sourceUrl: source.url,
          targetUrl,
        });
        if (!anchor) continue;
        const rec = buildLinkRecommendation({
          target,
          source,
          anchor,
          cluster,
          futureContent: isCreate && !targetUrl,
        });
        /* Dismissed work never reappears. */
        if (dismissed.has(linkIdentityKey(rec))) continue;
        recs.push(rec);
      }
    }

    recs.sort(
      (a, b) =>
        bandRankOf(a.priorityBand) -
          bandRankOf(b.priorityBand) ||
        b.targetScore - a.targetScore ||
        b.sourceRank - a.sourceRank ||
        (a.sourceUrl < b.sourceUrl ? -1 : 1),
    );
    const actionByLink = await this.actionByLinkUrl(
      organizationId,
      websiteId,
    );
    return recs.map((r) => ({
      ...r,
      action: actionByLink.get(linkIdentityKey(r)) ?? {
        exists: false,
        id: null,
        status: null,
      },
    }));
  }

  private async briefSourceMap(
    organizationId: string,
    websiteId: string,
  ): Promise<Map<string, Array<{ title: string | null; url: string }>>> {
    const out = new Map<
      string,
      Array<{ title: string | null; url: string }>
    >();
    const briefs = await this.prisma.contentBrief.findMany(
      {
        where: { organizationId, websiteId },
        select: { targetQuery: true, payload: true },
        take: 100,
      },
    );
    for (const brief of briefs) {
      const key = normalizeKeyword(brief.targetQuery);
      const candidates = (
        (brief.payload as any)?.internalLinks ?? []
      ) as Array<{ title?: string | null; url?: string }>;
      const cleaned = candidates
        .filter(
          (c) =>
            typeof c?.url === 'string' && c.url.trim(),
        )
        .map((c) => ({
          title: c.title ?? null,
          url: c.url!.trim(),
        }));
      if (key && cleaned.length > 0) out.set(key, cleaned);
    }
    return out;
  }

  private async dismissedLinkKeys(
    organizationId: string,
    websiteId: string,
  ): Promise<Set<string>> {
    const rows = await this.prisma.recommendation.findMany(
      {
        where: {
          organizationId,
          websiteId,
          source: 'CONTENT',
          type: 'INTERNAL_LINK_OPPORTUNITY',
          status: { in: ['DISMISSED', 'COMPLETED'] },
        },
        select: { metadata: true },
        take: 200,
      },
    );
    const out = new Set<string>();
    for (const row of rows) {
      const meta = (row.metadata ?? {}) as Record<
        string,
        any
      >;
      out.add(
        [
          normalizeUrl(meta.sourceUrl) ?? '',
          normalizeUrl(meta.targetUrl) ?? '',
          normalizeKeyword(meta.keyword),
        ].join('|'),
      );
    }
    return out;
  }

  private async actionByLinkUrl(
    organizationId: string,
    websiteId: string,
  ): Promise<
    Map<
      string,
      { exists: boolean; id: string | null; status: string | null }
    >
  > {
    const out = new Map<
      string,
      { exists: boolean; id: string | null; status: string | null }
    >();
    const actions = await this.prisma.action.findMany({
      where: { organizationId, websiteId },
      select: {
        id: true,
        status: true,
        metadata: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    for (const action of actions) {
      const meta = (action.metadata ?? {}) as Record<
        string,
        any
      >;
      const src = normalizeUrl(meta.sourceUrl);
      const tgt = normalizeUrl(meta.targetUrl);
      if (!src || !tgt) continue;
      const key = [
        src,
        tgt,
        normalizeKeyword(
          meta.strategyKeyword ?? meta.keyword,
        ),
      ].join('|');
      if (!out.has(key) && action.status !== 'DISMISSED') {
        out.set(key, {
          exists: true,
          id: action.id,
          status: action.status,
        });
      }
    }
    return out;
  }
}

/*
 * Link-recommender pure helpers (exported for tests).
 * Everything derived here is INFERENCE except the URL
 * existence and GSC numbers it cites, which are OBSERVED.
 */

export interface LinkSourceCandidate {
  url: string;
  viaKeyword: string | null;
  sameCluster: boolean;
  gscRanked: {
    position: number | null;
    impressions: number;
  } | null;
  briefListed: boolean;
  corpusRelevance: number;
  rank: number;
}

export interface LinkRecommendation {
  sourceUrl: string;
  targetUrl: string;
  suggestedAnchor: string;
  anchorSource:
    | 'SUPPORTING_KEYWORD'
    | 'PRIMARY_KEYWORD'
    | 'TOPIC_TERM';
  keyword: string;
  topic: string | null;
  reason: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  priorityBand: 'HIGH' | 'MEDIUM' | 'LOW';
  targetScore: number;
  sourceRank: number;
  futureContent: boolean;
  evidenceSources: Array<{
    label: string;
    value: string;
    source: 'OBSERVED' | 'INFERENCE' | 'UNAVAILABLE';
  }>;
  action: {
    exists: boolean;
    id: string | null;
    status: string | null;
  };
}

export function bandRankOf(priority: unknown): number {
  const band = String(priority ?? '').toUpperCase();
  if (band === 'HIGH') return 0;
  if (band === 'MEDIUM') return 1;
  return 2;
}

export function linkIdentityKey(rec: {
  sourceUrl: unknown;
  targetUrl: unknown;
  keyword: unknown;
}): string {
  return [
    normalizeUrl(rec.sourceUrl) ?? '',
    normalizeUrl(rec.targetUrl) ?? '',
    normalizeKeyword(rec.keyword),
  ].join('|');
}

/*
 * =========================================================
 * PHASE 2C — verification vocabulary + pure helpers.
 * Layers stay split: these describe OBSERVED crawl state
 * for a recommendation; they never mutate lifecycle.
 * =========================================================
 */

export type LinkVerificationStatus =
  | 'VERIFIED'
  | 'NOT_VERIFIED'
  | 'BROKEN'
  | 'UNAVAILABLE';

export type LinkAnchorMatch =
  | 'EXACT_MATCH'
  | 'RELATED_MATCH'
  | 'DIFFERENT'
  | 'UNKNOWN';

export interface LinkVerification {
  status: LinkVerificationStatus;
  crawlId: string | null;
  crawlCompletedAt: string | null;
  observedAnchors: string[];
  anchorMatch: LinkAnchorMatch;
  linkAttributes: {
    nofollow: boolean;
    sponsored: boolean;
    ugc: boolean;
  } | null;
  linkLost: boolean | null;
  reason: string;
}

export interface OrphanCandidate {
  url: string;
  title: string | null;
  label: 'POTENTIAL_ORPHAN';
  inboundCount: 0;
  crawlId: string;
  crawlCompletedAt: string | null;
  strategy: {
    keyword: string;
    topic: string | null;
    priority: string | null;
    priorityScore: number | null;
    pageMapping: string | null;
    bucket: string | null;
    contentAction: string | null;
  } | null;
  explanation: string;
}

function normKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function unavailableVerification(
  reason: string,
): LinkVerification {
  return {
    status: 'UNAVAILABLE',
    crawlId: null,
    crawlCompletedAt: null,
    observedAnchors: [],
    anchorMatch: 'UNKNOWN',
    linkAttributes: null,
    linkLost: null,
    reason,
  };
}

/*
 * Anchor comparison (deterministic, no semantics):
 * EXACT = normalized anchor keys equal; RELATED =
 * punctuation-stripped equality or containment either
 * way (covers "CRM pricing" vs "crm-pricing:" style
 * variants); else DIFFERENT; UNKNOWN when either side
 * has no text to compare. A different anchor never
 * means broken — LINK_EXISTS with ANCHOR_DIFFERENT.
 */
export function compareLinkAnchors(
  suggested: string | null,
  observed: string[],
): LinkAnchorMatch {
  const sugKey = anchorKeyOf(suggested ?? '');
  const obsKeys = observed
    .map((o) => anchorKeyOf(o))
    .filter(Boolean);
  if (!sugKey || obsKeys.length === 0) return 'UNKNOWN';
  if (obsKeys.includes(sugKey)) return 'EXACT_MATCH';
  const strip = (s: string) =>
    s.replace(/[^a-z0-9]/g, '');
  const sugStripped = strip(sugKey);
  if (!sugStripped) return 'UNKNOWN';
  for (const obs of obsKeys) {
    const obsStripped = strip(obs);
    if (!obsStripped) continue;
    if (
      obsStripped === sugStripped ||
      obsStripped.includes(sugStripped) ||
      sugStripped.includes(obsStripped)
    ) {
      return 'RELATED_MATCH';
    }
  }
  return 'DIFFERENT';
}

/*
 * Page eligibility for link carrying / orphan analysis
 * from existing crawl facts. Missing facts = unknown
 * (caller decides UNAVAILABLE vs exclusion).
 */
export function pageLinkEligibility(facts: {
  statusCode: number | null;
  robotsIndexable: boolean | null;
  canonical: string | null;
  canonicalAbsolute?: string | null;
  redirectCount: number | null;
  url: string;
} | null): { eligible: boolean; exclusions: string[] } {
  if (!facts) {
    return { eligible: false, exclusions: ['not-in-crawl'] };
  }
  const exclusions: string[] = [];
  if (
    facts.statusCode === null ||
    facts.statusCode < 200 ||
    facts.statusCode >= 300
  ) {
    exclusions.push(
      `status-${facts.statusCode ?? 'unknown'}`,
    );
  }
  if (facts.robotsIndexable === false) {
    exclusions.push('noindex');
  }
  const canonical =
    facts.canonicalAbsolute || facts.canonical;
  if (
    canonical &&
    normKey(canonical) !== normKey(facts.url) &&
    normalizeCrawlUrl(canonical) !==
      normalizeCrawlUrl(facts.url)
  ) {
    exclusions.push('canonicalized-away');
  }
  if ((facts.redirectCount ?? 0) > 0) {
    exclusions.push('redirects');
  }
  return {
    eligible: exclusions.length === 0,
    exclusions,
  };
}

function verifyOnePair(
  pair: {
    sourceUrl: string;
    targetUrl: string;
    suggestedAnchor: string | null;
  },
  ctx: {
    crawlId: string;
    completedAt: string | null;
    facts: Map<string, any>;
    edgesByPair: Map<string, any[]>;
    distinctCounts: Map<string, number>;
    prevPairs: Set<string>;
    prevCrawlId: string | null;
  },
): LinkVerification {
  const base = {
    crawlId: ctx.crawlId,
    crawlCompletedAt: ctx.completedAt,
  };
  if (!pair.sourceUrl || !pair.targetUrl) {
    return {
      ...base,
      status: 'BROKEN',
      observedAnchors: [],
      anchorMatch: 'UNKNOWN',
      linkAttributes: null,
      linkLost: null,
      reason:
        'Source or target URL is missing/unresolvable — nothing to verify against.',
    };
  }
  const sourceFacts = ctx.facts.get(
    normKey(pair.sourceUrl),
  );
  if (!sourceFacts) {
    return {
      ...base,
      status: 'UNAVAILABLE',
      observedAnchors: [],
      anchorMatch: 'UNKNOWN',
      linkAttributes: null,
      linkLost: null,
      reason:
        'Source page is not in the latest completed crawl — coverage is incomplete, verification unsafe.',
    };
  }
  const sourceEligibility = pageLinkEligibility(sourceFacts);
  if (!sourceEligibility.eligible) {
    return {
      ...base,
      status: 'BROKEN',
      observedAnchors: [],
      anchorMatch: 'UNKNOWN',
      linkAttributes: null,
      linkLost: null,
      reason: `Source page is not a valid link carrier (${sourceEligibility.exclusions.join(', ')}) in the latest completed crawl.`,
    };
  }

  const key = `${normKey(pair.sourceUrl)}|${normKey(pair.targetUrl)}`;
  const matched = ctx.edgesByPair.get(key) ?? [];
  const targetFacts = ctx.facts.get(
    normKey(pair.targetUrl),
  );
  const targetBroken =
    targetFacts != null &&
    !pageLinkEligibility(targetFacts).eligible;

  if (matched.length > 0) {
    if (targetBroken) {
      return {
        ...base,
        status: 'BROKEN',
        observedAnchors: distinctAnchors(matched),
        anchorMatch: compareLinkAnchors(
          pair.suggestedAnchor,
          matched.map((e) => e.anchorText),
        ),
        linkAttributes: orAttributes(matched),
        linkLost: false,
        reason:
          'Edge observed, but the target does not resolve as a valid page in the latest completed crawl.',
      };
    }
    const anchors = distinctAnchors(matched);
    const match = compareLinkAnchors(
      pair.suggestedAnchor,
      matched.map((e) => e.anchorText),
    );
    return {
      ...base,
      status: 'VERIFIED',
      observedAnchors: anchors,
      anchorMatch: match,
      linkAttributes: orAttributes(matched),
      linkLost: false,
      reason:
        match === 'DIFFERENT'
          ? 'Link exists (VERIFIED); observed anchor text differs from the suggestion — anchor difference is not breakage.'
          : 'Matching source → target edge observed in the latest completed crawl.',
    };
  }

  if (targetBroken) {
    return {
      ...base,
      status: 'BROKEN',
      observedAnchors: [],
      anchorMatch: 'UNKNOWN',
      linkAttributes: null,
      linkLost: null,
      reason:
        'Target does not resolve as a valid page in the latest completed crawl.',
    };
  }
  if (!targetFacts) {
    return {
      ...base,
      status: 'UNAVAILABLE',
      observedAnchors: [],
      anchorMatch: 'UNKNOWN',
      linkAttributes: null,
      linkLost: null,
      reason:
        'Target page is not in the latest completed crawl — coverage is incomplete, verification unsafe.',
    };
  }
  /* Truncation guard: a source at the persist cap may
     have unpersisted edges, so a negative is unsafe.
     (Positives above already returned.) */
  if (
    (ctx.distinctCounts.get(pair.sourceUrl) ?? 0) >=
    MAX_EDGES_PER_PAGE
  ) {
    return {
      ...base,
      status: 'UNAVAILABLE',
      observedAnchors: [],
      anchorMatch: 'UNKNOWN',
      linkAttributes: null,
      linkLost: null,
      reason:
        'Source page reached the per-page edge persist cap (possible truncation) — absence cannot be proven.',
    };
  }
  const lost = ctx.prevCrawlId
    ? ctx.prevPairs.has(key)
    : null;
  return {
    ...base,
    status: 'NOT_VERIFIED',
    observedAnchors: [],
    anchorMatch: 'UNKNOWN',
    linkAttributes: null,
    linkLost: lost,
    reason:
      lost === true
        ? `No matching edge in the latest completed crawl, but one existed in the previous crawl (LINK_LOST, factual).`
        : 'Source and target are valid crawled pages, but no matching edge exists in the latest completed crawl.',
  };
}

function distinctAnchors(edges: any[]): string[] {
  const out: string[] = [];
  for (const edge of edges) {
    const text = String(edge.anchorText ?? '');
    if (text && !out.includes(text) && out.length < 10) {
      out.push(text);
    }
  }
  return out;
}

function orAttributes(edges: any[]): {
  nofollow: boolean;
  sponsored: boolean;
  ugc: boolean;
} {
  return {
    nofollow: edges.some((e) => e.nofollow === true),
    sponsored: edges.some((e) => e.sponsored === true),
    ugc: edges.some((e) => e.ugc === true),
  };
}

function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').slice(0, 80);
}

function defaultGscRange(): {
  startDate: string;
  endDate: string;
} {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 27);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

function topicTerms(topic: unknown): string[] {
  return String(topic ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
}

function supportingKeywordsOf(
  cluster: any,
  target: any,
): string[] {
  const fromCluster = (
    Array.isArray(cluster?.supportingKeywords)
      ? cluster.supportingKeywords
      : []
  )
    .map((k: unknown) => normalizeKeyword(k))
    .filter(Boolean);
  const fromContent = (
    Array.isArray(cluster?.supportingContent)
      ? cluster.supportingContent
      : []
  )
    .map((k: unknown) => normalizeKeyword(k))
    .filter(Boolean);
  const targetKey = normalizeKeyword(target.keyword);
  return [
    ...new Set([...fromCluster, ...fromContent]),
  ].filter((k) => k && k !== targetKey);
}

/*
 * All known site pages (OBSERVED): crawl corpus URLs +
 * GSC impression pages. A target outside this set is
 * rejected — never linked to blindly.
 */
function knownSitePages(
  siteCorpus: Map<string, CorpusEntry>,
  byQueryPages: Map<
    string,
    Array<{
      page: string;
      position: number | null;
      clicks: number;
      impressions: number;
    }>
  >,
): Set<string> {
  const out = new Set<string>();
  for (const entry of siteCorpus.values()) {
    for (const url of entry.urls ?? []) {
      const norm = normalizeUrl(url);
      if (norm) out.add(norm);
    }
  }
  for (const pages of byQueryPages.values()) {
    for (const p of pages ?? []) {
      if (p.impressions > 0) {
        const norm = normalizeUrl(p.page);
        if (norm) out.add(norm);
      }
    }
  }
  return out;
}

function rankLinkSources(
  input: {
    target: any;
    targetKey: string;
    topic: string | null;
    supporting: string[];
    links: any[];
    siteCorpus: Map<string, CorpusEntry>;
    byQueryPages: Map<
      string,
      Array<{
        page: string;
        position: number | null;
        clicks: number;
        impressions: number;
      }>
    >;
    briefSources: Map<
      string,
      Array<{ title: string | null; url: string }>
    >;
    getParentTopic: (keyword: string) => string;
  },
  maxSources: number,
): LinkSourceCandidate[] {
  const targetUrlNorm = normalizeUrl(input.target.targetPage);
  const topicKey = normalizeKeyword(input.topic);
  const terms = topicTerms(input.topic);
  const byUrl = new Map<string, LinkSourceCandidate>();

  const consider = (
    url: string,
    partial: Omit<LinkSourceCandidate, 'url' | 'rank'>,
  ) => {
    const norm = normalizeUrl(url);
    /* Self-link prevention. */
    if (!norm || norm === targetUrlNorm) return;
    const prev = byUrl.get(norm);
    const rank =
      (partial.sameCluster ? 3 : 0) +
      (partial.gscRanked ? 2 : 0) +
      (partial.corpusRelevance >= 30
        ? 2
        : partial.corpusRelevance > 0
          ? 1
          : 0) +
      (partial.briefListed ? 1 : 0);
    const merged: LinkSourceCandidate = {
      url: url.trim(),
      viaKeyword:
        partial.viaKeyword ??
        prev?.viaKeyword ??
        null,
      sameCluster:
        partial.sameCluster ||
        prev?.sameCluster ||
        false,
      gscRanked: partial.gscRanked ?? prev?.gscRanked ?? null,
      briefListed:
        partial.briefListed ||
        prev?.briefListed ||
        false,
      corpusRelevance: Math.max(
        partial.corpusRelevance,
        prev?.corpusRelevance ?? 0,
      ),
      rank: 0,
    };
    merged.rank = Math.max(rank, prev?.rank ?? 0);
    /* Precision > quantity: keep only pages with
       meaningful relevance evidence. A brief listing
       alone qualifies — it is an OBSERVED crawl page
       matched to this query by existing-page overlap. */
    if (
      merged.rank >= 2 ||
      merged.briefListed ||
      (merged.gscRanked &&
        merged.gscRanked.impressions > 0)
    ) {
      byUrl.set(norm, merged);
    }
  };

  /* A. Same cluster: sibling opportunities' target pages. */
  for (const sibling of input.links) {
    if (
      normalizeKeyword(sibling.keyword) ===
      input.targetKey
    )
      continue;
    if (
      !sibling.targetPage ||
      normalizeKeyword(sibling.topic) !== topicKey ||
      !topicKey
    )
      continue;
    consider(sibling.targetPage, {
      viaKeyword: normalizeKeyword(sibling.keyword) || null,
      sameCluster: true,
      gscRanked: null,
      briefListed: false,
      corpusRelevance: 0,
    });
  }

  /* B + D. Corpus overlap: same parent topic or shared
     topic terms (title/H1/H2 n-grams — no body text). */
  for (const [key, entry] of input.siteCorpus) {
    if (key === input.targetKey) continue;
    const entryTopic = normalizeKeyword(
      input.getParentTopic(key),
    );
    const entryTerms = key.split(/[^a-z0-9]+/);
    const shared = terms.filter((t) =>
      entryTerms.includes(t),
    );
    if (entryTopic !== topicKey && shared.length === 0)
      continue;
    const url = entry.urls?.[0];
    if (!url) continue;
    consider(url, {
      viaKeyword: key,
      sameCluster: entryTopic === topicKey && !!topicKey,
      gscRanked: null,
      briefListed: false,
      corpusRelevance: entry.relevanceScore ?? 0,
    });
  }

  /* C. GSC: pages ranking for supporting keywords. */
  for (const support of input.supporting) {
    const pages = input.byQueryPages.get(support) ?? [];
    for (const p of pages) {
      if (p.impressions <= 0) continue;
      consider(p.page, {
        viaKeyword: support,
        sameCluster: false,
        gscRanked: {
          position: p.position,
          impressions: p.impressions,
        },
        briefListed: false,
        corpusRelevance: 0,
      });
    }
  }

  /* E. Brief candidates for this keyword. */
  const briefed = input.briefSources.get(input.targetKey) ?? [];
  for (const candidate of briefed) {
    consider(candidate.url, {
      viaKeyword: null,
      sameCluster: false,
      gscRanked: null,
      briefListed: true,
      corpusRelevance: 0,
    });
  }

  return [...byUrl.values()]
    .sort(
      (a, b) =>
        b.rank - a.rank ||
        (a.url < b.url ? -1 : 1),
    )
    .slice(0, maxSources);
}

/*
 * Anchor chain (INFERENCE only): supporting keyword →
 * primary keyword → parent-topic term. Title-derived
 * phrases are unavailable without per-page title reads
 * and are NOT attempted. Never a URL, never empty.
 */
export function pickLinkAnchor(input: {
  supporting: string | null;
  primary: string | null;
  topic: string | null;
  sourceUrl: string;
  targetUrl: string | null;
}): { anchor: string; source: LinkRecommendation['anchorSource'] } | null {
  const sourceNorm = normalizeUrl(input.sourceUrl);
  const candidates: Array<{
    anchor: string;
    source: LinkRecommendation['anchorSource'];
  }> = [];
  if (input.supporting) {
    candidates.push({
      anchor: input.supporting,
      source: 'SUPPORTING_KEYWORD',
    });
  }
  if (input.primary) {
    candidates.push({
      anchor: input.primary,
      source: 'PRIMARY_KEYWORD',
    });
  }
  if (input.topic) {
    candidates.push({
      anchor: input.topic,
      source: 'TOPIC_TERM',
    });
  }
  for (const candidate of candidates) {
    const text = candidate.anchor.trim();
    if (!text || text.length > 80) continue;
    if (/^https?:\/\//i.test(text)) continue;
    if (text.startsWith('/')) continue;
    if (normalizeUrl(text) === sourceNorm) continue;
    if (
      input.targetUrl &&
      normalizeUrl(text) === normalizeUrl(input.targetUrl)
    )
      continue;
    return candidate;
  }
  return null;
}

function buildLinkRecommendation(input: {
  target: any;
  source: LinkSourceCandidate;
  anchor: {
    anchor: string;
    source: LinkRecommendation['anchorSource'];
  };
  cluster: any;
  futureContent: boolean;
}): LinkRecommendation {
  const t = input.target;
  const s = input.source;
  const targetLabel = input.futureContent
    ? `the planned page for “${t.keyword}” (no URL yet — create the page first)`
    : t.targetPage;
  const relation = s.sameCluster
    ? `same topic cluster “${t.topic}”`
    : `shared topic terms with “${t.topic ?? t.keyword}”`;
  const gscEvidence = s.gscRanked
    ? ` It ranks${s.gscRanked.position !== null ? ` #${s.gscRanked.position.toFixed(1)}` : ''} with ${s.gscRanked.impressions} impressions for “${s.viaKeyword}” (OBSERVED).`
    : '';
  const reason =
    `Source covers ${s.viaKeyword ? `“${s.viaKeyword}” in the ${relation}` : `the ${relation}`} (INFERENCE from crawl headings/meta and strategy clustering).` +
    `${gscEvidence} Target ${targetLabel} is the ${String(t.pageMapping ?? '').toLowerCase() || 'mapped'} page for “${t.keyword}” (${t.priority ?? 'UNRATED'} strategy priority — INFERENCE, not a ranking promise).`;
  const band = String(t.priority ?? '').toUpperCase();
  const priority: 'HIGH' | 'MEDIUM' | 'LOW' =
    band === 'HIGH'
      ? 'HIGH'
      : band === 'MEDIUM'
        ? 'MEDIUM'
        : 'LOW';
  return {
    sourceUrl: s.url,
    targetUrl: t.targetPage,
    suggestedAnchor: input.anchor.anchor,
    anchorSource: input.anchor.source,
    keyword: normalizeKeyword(t.keyword) || t.keyword,
    topic: t.topic ?? null,
    reason,
    priority,
    priorityBand: priority,
    targetScore: t.priorityScore ?? 0,
    sourceRank: s.rank,
    futureContent: input.futureContent,
    evidenceSources: [
      {
        label: 'Source page',
        value: 'Real crawled/site URL (OBSERVED)',
        source: 'OBSERVED',
      },
      {
        label: 'Relevance',
        value: s.gscRanked
          ? `GSC ranking for “${s.viaKeyword}” (OBSERVED)`
          : s.briefListed
            ? 'Brief candidate overlap (OBSERVED list, INFERENCE match)'
            : 'Corpus heading/meta overlap + cluster membership (INFERENCE)',
        source: s.gscRanked ? 'OBSERVED' : 'INFERENCE',
      },
      {
        label: 'Suggested anchor',
        value: `${input.anchor.source} (INFERENCE — never observed)`,
        source: 'INFERENCE',
      },
      {
        label: 'Existing anchors',
        value: 'Unavailable — crawler does not persist anchor text',
        source: 'UNAVAILABLE',
      },
      {
        label: 'Inbound links',
        value: 'Unavailable — no link graph persisted',
        source: 'UNAVAILABLE',
      },
    ],
    action: { exists: false, id: null, status: null },
  };
}

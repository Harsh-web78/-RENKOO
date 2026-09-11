import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { GoogleService } from '../google/google.service';
import { RankTrackingService } from './rank-tracking.service';
import { EvidenceFusionService } from './evidence-fusion.service';
import { IntegrationsService } from '../integrations/integrations.service';
import {
  CANNOT_MEASURE,
  SURFACE_REGISTRY,
  brandVisibility,
  competitorGap,
  competitorGapStatement,
  crossSurfaceSource,
  historyState,
  mapSurfaceOpportunityToNba,
  pageSurfaceState,
  sourceGap,
  surfaceState,
  normalizeSurfaceQuery,
  type SurfaceKey,
  type SurfaceOpportunity,
} from './search-surfaces';

/*
 * =========================================================
 * SEARCH EVERYWHERE INTELLIGENCE 1.0 (Phase 22) — read-only
 * cross-surface composition over persisted evidence.
 * No provider calls on reads, no scores, no new
 * persistence, no new meters. One bounded Promise.all
 * wave; maps only, no N+1.
 *
 * Bounds: topics ≤100, queries ≤200, surfaces ≤12,
 * AI/rank/local rows ≤200, competitors ≤5, sources
 * ≤100, pages ≤100, outcomes ≤200.
 * =========================================================
 */

const MAX_QUERIES = 200;
const MAX_TOPICS = 100;
const MAX_ROWS = 200;
const MAX_SOURCES = 100;

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function norm(value: unknown): string {
  return normalizeSurfaceQuery(value);
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function domainOf(url: unknown): string | null {
  try {
    const host = new URL(clean(url)).hostname
      .toLowerCase()
      .replace(/^www\./, '');
    return host.includes('.') ? host : null;
  } catch {
    return null;
  }
}

const PLATFORM_SURFACE: Record<string, SurfaceKey> = {
  CHATGPT: 'CHATGPT',
  GOOGLE_AI: 'GOOGLE_AI_OVERVIEW',
  GEMINI: 'GEMINI',
  CLAUDE: 'CLAUDE',
  PERPLEXITY: 'PERPLEXITY',
};

@Injectable()
export class SearchSurfacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleService,
    private readonly ranks: RankTrackingService,
    private readonly fusion: EvidenceFusionService,
    private readonly integrations: IntegrationsService,
  ) {}

  private async settled<T>(
    fn: () => Promise<T>,
  ): Promise<T | null> {
    try {
      return await fn();
    } catch {
      return null;
    }
  }

  private windowFor(days: number): {
    startDate: string;
    endDate: string;
  } {
    const end = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const start = new Date(
      end.getTime() - (days - 1) * 24 * 60 * 60 * 1000,
    );
    const iso = (date: Date): string =>
      date.toISOString().slice(0, 10);
    return { startDate: iso(start), endDate: iso(end) };
  }

  async getSurfaceSummary(
    organizationId: string,
    websiteId: string,
    days = 28,
  ) {
    if (!websiteId)
      throw new BadRequestException(
        'websiteId is required',
      );
    const website = await this.prisma.website.findFirst({
      where: {
        id: websiteId,
        organizationId,
        isActive: true,
      },
      select: { id: true, name: true, url: true },
    });
    if (!website)
      throw new NotFoundException('Website not found');
    const window = this.windowFor(days);

    const [
      queriesRes,
      pagesRes,
      checksRes,
      officialRes,
      ranksRes,
      serpRes,
      strategyRes,
      competitorsRes,
      leadsRes,
      revenueRes,
      backlinksRes,
      brainRes,
      nbaRes,
      changesRes,
      capabilitiesRes,
    ] = await Promise.all([
      this.settled(() =>
        this.google.getSearchQueries(
          organizationId,
          window.startDate,
          window.endDate,
        ),
      ),
      this.settled(() =>
        this.google.getQueryPages(
          organizationId,
          window.startDate,
          window.endDate,
        ),
      ),
      this.settled(() =>
        this.prisma.aiVisibilityCheck.findMany({
          where: { websiteId, status: 'COMPLETED' },
          orderBy: { checkedAt: 'desc' },
          take: MAX_ROWS,
        }),
      ),
      this.settled(() =>
        this.prisma.aiOfficialObservation.findMany({
          where: { websiteId },
          orderBy: { date: 'desc' },
          take: MAX_ROWS,
        }),
      ),
      this.settled(() =>
        this.prisma.rankObservation.findMany({
          where: { organizationId, websiteId },
          orderBy: { observedAt: 'desc' },
          take: MAX_ROWS,
        }),
      ),
      this.settled(() =>
        this.prisma.keywordMetricCache.findMany({
          where: { metric: 'serp' },
          select: { keyword: true, payload: true },
          take: MAX_ROWS,
        }),
      ),
      this.settled(() =>
        this.prisma.contentStrategyLink.findMany({
          where: { organizationId, websiteId },
          select: {
            keyword: true,
            topic: true,
            targetPage: true,
            priority: true,
            intent: true,
          },
          take: MAX_ROWS,
        }),
      ),
      this.settled(() =>
        this.prisma.competitor.findMany({
          where: { organizationId, websiteId, isActive: true },
          take: 5,
        }),
      ),
      this.settled(() =>
        this.prisma.lead.findMany({
          where: { websiteId },
          orderBy: { createdAt: 'desc' },
          take: MAX_ROWS,
        }),
      ),
      this.settled(() =>
        this.prisma.revenue.findMany({
          where: { websiteId, status: 'RECOGNIZED' },
          orderBy: { recognizedAt: 'desc' },
          take: MAX_ROWS,
        }),
      ),
      this.settled(() =>
        this.prisma.backlink.findMany({
          where: { websiteId },
          select: { targetUrl: true, sourceDomain: true },
          take: MAX_ROWS,
        }),
      ),
      this.settled(() =>
        this.prisma.businessBrain.findUnique({
          where: { websiteId },
        }),
      ),
      this.settled(() =>
        this.fusion.getNextBestAction(
          organizationId,
          websiteId,
        ),
      ),
      this.settled(() =>
        this.ranks.getChanges(organizationId, websiteId, 30),
      ),
      this.settled(() =>
        this.integrations.getCapabilities(
          organizationId,
          websiteId,
        ),
      ),
    ]);

    const gscQueries = (
      Array.isArray(
        (queriesRes as unknown as { queries?: unknown })
          ?.queries,
      )
        ? (queriesRes as unknown as { queries: unknown[] })
            .queries
        : Array.isArray(
              (
                queriesRes as unknown as {
                  rows?: unknown;
                }
              )?.rows,
            )
          ? (queriesRes as unknown as { rows: unknown[] })
              .rows
          : []
    ).slice(0, MAX_QUERIES) as Array<Record<string, unknown>>;

    const checks = (checksRes ?? []) as Array<
      Record<string, unknown>
    >;
    const byQueryAi = new Map<
      string,
      {
        surfaces: Set<SurfaceKey>;
        mentions: number;
        citations: number;
        urls: string[];
        competitors: Set<string>;
        lastObserved: string | null;
      }
    >();
    let aiRowsTotal = 0;
    for (const row of checks) {
      const key = norm(row.query);
      if (!key) continue;
      aiRowsTotal++;
      const surface =
        PLATFORM_SURFACE[clean(row.platform).toUpperCase()];
      const entry = byQueryAi.get(key) ?? {
        surfaces: new Set<SurfaceKey>(),
        mentions: 0,
        citations: 0,
        urls: [],
        competitors: new Set<string>(),
        lastObserved: null,
      };
      if (surface) entry.surfaces.add(surface);
      if (row.mentioned === true) entry.mentions++;
      if (row.citationFound === true) {
        entry.citations++;
        const url = clean(row.citationUrl);
        if (url) entry.urls.push(url);
      }
      const names = row.competitorNames;
      if (Array.isArray(names))
        for (const name of names) {
          if (clean(name)) entry.competitors.add(clean(name));
        }
      const observed = clean(row.checkedAt);
      if (observed) entry.lastObserved = observed;
      byQueryAi.set(key, entry);
    }

    const official = (officialRes ?? []) as Array<
      Record<string, unknown>
    >;
    const officialByQuery = new Map<string, number>();
    for (const row of official) {
      const key = norm(row.query);
      if (key)
        officialByQuery.set(
          key,
          (officialByQuery.get(key) ?? 0) + 1,
        );
    }

    const rankByQuery = new Map<string, number>();
    for (const row of (ranksRes ??
      []) as Array<Record<string, unknown>>) {
      const key = norm(
        row.keyword ?? row.normalizedKeyword,
      );
      if (!key || rankByQuery.has(key)) continue;
      const position = Number(row.position);
      if (Number.isFinite(position))
        rankByQuery.set(key, position);
    }

    const strategyByQuery = new Map<
      string,
      { topic: string; targetPage: string; priority: string }
    >();
    for (const row of (strategyRes ??
      []) as Array<Record<string, unknown>>) {
      const key = norm(row.keyword);
      if (!key || strategyByQuery.has(key)) continue;
      strategyByQuery.set(key, {
        topic: clean(row.topic),
        targetPage: clean(row.targetPage),
        priority: clean(row.priority),
      });
    }

    const leadsByQuery = new Map<string, number>();
    for (const row of (leadsRes ??
      []) as Array<Record<string, unknown>>) {
      const key = norm(row.keyword);
      if (key)
        leadsByQuery.set(key, (leadsByQuery.get(key) ?? 0) + 1);
    }
    const revenueByQuery = new Map<string, number>();
    for (const row of (revenueRes ??
      []) as Array<Record<string, unknown>>) {
      const key = norm(
        row.keyword ?? row.sourceDetail,
      );
      if (key)
        revenueByQuery.set(
          key,
          (revenueByQuery.get(key) ?? 0) +
            (Number(row.amount) || 0),
        );
    }

    /* ---- query details (≤200) ---- */
    const queryDetails = gscQueries
      .map((row) => {
        const query = clean(row.query ?? row.keyword);
        const key = norm(query);
        if (!key) return null;
        const impressions = numOrNull(row.impressions) ?? 0;
        const clicks = numOrNull(row.clicks) ?? 0;
        const position =
          numOrNull(row.position) ?? rankByQuery.get(key) ?? null;
        const ai = byQueryAi.get(key) ?? null;
        const strategy = strategyByQuery.get(key) ?? null;
        const surfaces: Record<string, unknown> = {
          GOOGLE_SEARCH: {
            state: 'VISIBLE',
            evidenceState: 'VERIFIED',
          },
          GOOGLE_AI_OVERVIEW: {
            state: (officialByQuery.get(key) ?? 0) > 0
              ? 'VISIBLE'
              : 'UNKNOWN',
            evidenceState:
              (officialByQuery.get(key) ?? 0) > 0
                ? 'OBSERVED'
                : 'UNAVAILABLE',
            note: 'Aggregates stay aggregate; no query-level impressions invented.',
          },
          GOOGLE_AI_MODE: {
            state: 'UNKNOWN',
            evidenceState: 'UNAVAILABLE',
          },
          BING_SEARCH: {
            state: 'UNKNOWN',
            evidenceState: 'UNAVAILABLE',
          },
          BING_AI: {
            state: 'UNKNOWN',
            evidenceState: 'UNAVAILABLE',
          },
        };
        for (const surface of [
          'CHATGPT',
          'PERPLEXITY',
          'GEMINI',
          'CLAUDE',
          'COPILOT',
        ] as SurfaceKey[]) {
          const hit =
            ai !== null && ai.surfaces.has(surface);
          surfaces[surface] = {
            state: hit
              ? 'VISIBLE'
              : ai !== null
                ? 'NOT_OBSERVED'
                : 'UNKNOWN',
            evidenceState: hit ? 'OBSERVED' : 'UNAVAILABLE',
            brand: ai
              ? brandVisibility(
                  ai.mentions,
                  ai.citations,
                  true,
                )
              : { mention: 'UNKNOWN', citation: 'UNKNOWN' },
            lastObserved: ai?.lastObserved ?? null,
          };
        }
        const brand = ai
          ? brandVisibility(ai.mentions, ai.citations, true)
          : { mention: 'UNKNOWN', citation: 'UNKNOWN' };
        const competitorPresent =
          (ai?.competitors.size ?? 0) > 0;
        return {
          query,
          topic: strategy?.topic || null,
          google: {
            impressions,
            clicks,
            ctr:
              impressions > 0
                ? clicks / impressions
                : null,
            position,
            evidenceState: 'VERIFIED',
          },
          surfaces,
          brand,
          competitors: ai
            ? [...ai.competitors].slice(0, 5)
            : [],
          competitorGap: competitorGap(
            ai !== null,
            brand.citation === 'YES',
            competitorPresent ? true : ai !== null ? false : null,
            null,
          ),
          competitorNote: competitorPresent
            ? competitorGapStatement()
            : null,
          page: strategy?.targetPage || null,
          business: {
            leads: leadsByQuery.get(key) ?? 0,
            revenue: revenueByQuery.get(key) ?? 0,
            evidenceState:
              (leadsByQuery.get(key) ?? 0) > 0 ||
              (revenueByQuery.get(key) ?? 0) > 0
                ? 'OBSERVED'
                : 'UNAVAILABLE',
          },
        };
      })
      .filter(
        (row): row is NonNullable<typeof row> =>
          row !== null,
      )
      .slice(0, MAX_QUERIES);

    /* AI-only prompts (monitored but no GSC row). */
    for (const [key, ai] of byQueryAi) {
      if (
        queryDetails.some((row) => norm(row.query) === key)
      )
        continue;
      if (queryDetails.length >= MAX_QUERIES) break;
      queryDetails.push({
        query: key,
        topic: strategyByQuery.get(key)?.topic ?? null,
        google: {
          impressions: 0,
          clicks: 0,
          ctr: null,
          position: rankByQuery.get(key) ?? null,
          evidenceState: 'UNAVAILABLE',
        },
        surfaces: Object.fromEntries(
          ['CHATGPT', 'PERPLEXITY', 'GEMINI', 'CLAUDE', 'COPILOT'].map(
            (surface) => [
              surface,
              {
                state: ai.surfaces.has(
                  surface as SurfaceKey,
                )
                  ? 'VISIBLE'
                  : 'NOT_OBSERVED',
                evidenceState: ai.surfaces.has(
                  surface as SurfaceKey,
                )
                  ? 'OBSERVED'
                  : 'UNAVAILABLE',
                brand: brandVisibility(
                  ai.mentions,
                  ai.citations,
                  true,
                ),
                lastObserved: ai.lastObserved,
              },
            ],
          ),
        ),
        brand: brandVisibility(
          ai.mentions,
          ai.citations,
          true,
        ),
        competitors: [...ai.competitors].slice(0, 5),
        competitorGap: 'INSUFFICIENT_EVIDENCE' as const,
        competitorNote: null,
        page: strategyByQuery.get(key)?.targetPage ?? null,
        business: {
          leads: leadsByQuery.get(key) ?? 0,
          revenue: revenueByQuery.get(key) ?? 0,
          evidenceState:
            (leadsByQuery.get(key) ?? 0) > 0
              ? 'OBSERVED'
              : 'UNAVAILABLE',
        },
      });
    }

    /* ---- topics (≤100) ---- */
    const byTopic = new Map<
      string,
      {
        queries: number;
        googleQueries: number;
        aiQueries: number;
        citedQueries: number;
        competitorQueries: number;
      }
    >();
    for (const row of queryDetails) {
      const topic = clean(row.topic) || '(unassigned)';
      const entry = byTopic.get(topic) ?? {
        queries: 0,
        googleQueries: 0,
        aiQueries: 0,
        citedQueries: 0,
        competitorQueries: 0,
      };
      entry.queries++;
      if ((row.google.impressions ?? 0) > 0)
        entry.googleQueries++;
      const aiSurfaces = Object.entries(
        row.surfaces as Record<string, { state?: string }>,
      ).filter(
        ([surface, value]) =>
          ['CHATGPT', 'PERPLEXITY', 'GEMINI', 'CLAUDE', 'COPILOT'].includes(
            surface,
          ) && value.state === 'VISIBLE',
      );
      if (aiSurfaces.length > 0) entry.aiQueries++;
      if (row.brand.citation === 'YES') entry.citedQueries++;
      if (row.competitors.length > 0)
        entry.competitorQueries++;
      byTopic.set(topic, entry);
    }
    const topics = [...byTopic.entries()]
      .map(([topic, entry]) => ({
        topic,
        ...entry,
        ownership:
          entry.googleQueries > 0 && entry.aiQueries > 0
            ? 'STRONG'
            : entry.googleQueries > 0 || entry.aiQueries > 0
              ? 'PARTIAL'
              : 'INSUFFICIENT_EVIDENCE',
        evidenceState: 'OBSERVED' as const,
      }))
      .sort((a, b) => b.queries - a.queries)
      .slice(0, MAX_TOPICS);

    /* ---- cross-surface sources (≤100) ---- */
    const domainSurfaces = new Map<
      string,
      { surfaces: Set<SurfaceKey>; citations: number }
    >();
    for (const row of checks) {
      const domain = domainOf(row.citationUrl);
      if (!domain) continue;
      const surface =
        PLATFORM_SURFACE[clean(row.platform).toUpperCase()];
      const entry = domainSurfaces.get(domain) ?? {
        surfaces: new Set<SurfaceKey>(),
        citations: 0,
      };
      if (surface) entry.surfaces.add(surface);
      if (row.citationFound === true) entry.citations++;
      domainSurfaces.set(domain, entry);
    }
    const sources = [...domainSurfaces.entries()]
      .map(([domain, entry]) => ({
        domain,
        surfaces: [...entry.surfaces],
        citations: entry.citations,
        crossSurface: crossSurfaceSource({
          domain,
          surfaces: [...entry.surfaces],
          citations: entry.citations,
        }),
        evidenceState: 'OBSERVED' as const,
        note: 'Co-occurrence across surfaces is never stated as authority.',
      }))
      .sort((a, b) => b.citations - a.citations)
      .slice(0, MAX_SOURCES);

    /* ---- opportunities ---- */
    const opportunities: Array<{
      label: SurfaceOpportunity;
      title: string;
      detail: string;
      suggestedNba: string;
    }> = [];
    for (const row of queryDetails.slice(0, 100)) {
      if (
        (row.google.impressions ?? 0) >= 500 &&
        row.brand.citation === 'NO' &&
        row.competitors.length > 0
      ) {
        opportunities.push({
          label: 'COMPETITOR_SURFACE_GAP',
          title: `Close the AI gap for "${row.query}"`,
          detail: `Verified Google demand with observed competitor presence and no brand citation in the available sample.`,
          suggestedNba: mapSurfaceOpportunityToNba(
            'COMPETITOR_SURFACE_GAP',
          ),
        });
      } else if (
        (row.google.impressions ?? 0) >= 500 &&
        row.brand.citation === 'NO'
      ) {
        opportunities.push({
          label: 'AI_CITATION_GAP',
          title: `Earn citation coverage for "${row.query}"`,
          detail: `Verified Google demand with no observed brand citation.`,
          suggestedNba: mapSurfaceOpportunityToNba(
            'AI_CITATION_GAP',
          ),
        });
      }
      if (opportunities.length >= 20) break;
    }

    const pages = (
      Array.isArray(
        (pagesRes as unknown as { rows?: unknown })?.rows,
      )
        ? (pagesRes as unknown as { rows: unknown[] }).rows
        : []
    ).slice(0, 100) as Array<Record<string, unknown>>;
    const backlinkDomains = new Set(
      ((backlinksRes ?? []) as Array<Record<string, unknown>>)
        .map((row) =>
          clean(row.sourceDomain).toLowerCase(),
        )
        .filter(Boolean),
    );
    const pageStates = pages.slice(0, 20).map((row) => {
      const url = clean(row.page ?? row.url);
      const key = norm(url);
      const aiHit = [...byQueryAi.entries()].some(
        ([queryKey]) =>
          norm(
            strategyByQuery.get(queryKey)?.targetPage,
          ) === key && key.length > 0,
      );
      return {
        url,
        state: pageSurfaceState({
          google: url ? true : null,
          ai: aiHit ? true : false,
          local: null,
          bing: null,
        }),
        authorityDomains: backlinkDomains.size,
        evidenceState: 'OBSERVED' as const,
      };
    });

    const changes = (
      ((changesRes as Record<string, unknown> | null)
        ?.changes as unknown[]) ??
      ((changesRes as Record<string, unknown> | null)
        ?.events as unknown[]) ??
      []
    )
      .slice(0, 5)
      .map((entry) => {
        const row = entry as Record<string, unknown>;
        return {
          label: clean(row.keyword) || 'Tracked keyword',
          history: historyState(
            row.previous !== undefined ? true : null,
            row.current !== undefined ? true : null,
          ),
          detail: 'Rank history reused; change is observed, never causal.',
        };
      });

    const aiSurfaces = ['CHATGPT', 'PERPLEXITY', 'GEMINI', 'CLAUDE', 'COPILOT'];
    const surfaceCounts: Record<string, number> = {};
    for (const row of checks) {
      const surface =
        PLATFORM_SURFACE[clean(row.platform).toUpperCase()];
      if (surface)
        surfaceCounts[surface] =
          (surfaceCounts[surface] ?? 0) + 1;
    }

    return {
      websiteId,
      summary: {
        queries: queryDetails.length,
        topics: topics.length,
        aiObservations: aiRowsTotal,
        officialRows: official.length,
        crossSurfaceSources: sources.filter(
          (row) => row.crossSurface,
        ).length,
        evidenceState:
          queryDetails.length > 0
            ? 'OBSERVED'
            : 'UNAVAILABLE',
        note: 'Surfaces are observed only with actual evidence; unchecked stays unknown.',
      },
      surfaces: SURFACE_REGISTRY.map((definition) => ({
        ...definition,
        observations:
          definition.key === 'GOOGLE_SEARCH'
            ? queryDetails.length
            : aiSurfaces.includes(definition.key)
              ? (surfaceCounts[definition.key] ?? 0)
              : definition.key === 'GOOGLE_AI_OVERVIEW'
                ? official.length
                : 0,
      })),
      topics,
      queryDetails,
      competitors: (
        (competitorsRes ?? []) as Array<Record<string, unknown>>
      ).map((row) => ({
        name: clean(row.name),
        domain: clean(row.domain),
        note: 'Competitor was observed in available evidence where present.',
      })),
      sources,
      sourceGaps: sources
        .filter((row) =>
          sourceGap(
            row.citations > 0,
            false,
          ),
        )
        .slice(0, 10)
        .map((row) => ({
          domain: row.domain,
          note: 'Competitor source observed; own source linkage not observed in available evidence.',
        })),
      opportunities: opportunities.slice(0, 20),
      pages: pageStates,
      nextBestAction: nbaRes ?? {
        evidenceState: 'UNAVAILABLE',
        statement:
          'Next best action unavailable for this website right now.',
      },
      changes,
      freshness: {
        window,
        note: 'Per observation observedAt with source; no timestamps invented.',
      },
      evidence: {
        note: 'GSC is VERIFIED; AI monitoring is OBSERVED; manual rows are OBSERVED/MANUAL_IMPORT; SERP cache is OBSERVED; unavailable stays unavailable.',
      },
      cannotMeasure: CANNOT_MEASURE,
      capabilities: capabilitiesRes ?? {
        evidenceState: 'UNAVAILABLE',
      },
      billing: {
        charged: false,
        note: 'Read-only cross-surface intelligence. No AI credits, scans, or provider meters consumed.',
      },
    };
  }

  async getSurfaceQuery(
    organizationId: string,
    websiteId: string,
    query: string,
    days = 28,
  ) {
    const full = await this.getSurfaceSummary(
      organizationId,
      websiteId,
      days,
    );
    const key = norm(query);
    const match = (
      full.queryDetails as Array<{ query: string }>
    ).find((row) => norm(row.query) === key);
    if (!match) {
      return {
        query: clean(query),
        evidenceState: 'UNAVAILABLE',
        note: 'No observation for this query in the selected window. Unavailable is not zero.',
        cannotMeasure: CANNOT_MEASURE,
        billing: { charged: false },
      };
    }
    return {
      ...match,
      cannotMeasure: CANNOT_MEASURE,
      billing: { charged: false },
    };
  }

  async getSurfaceTopic(
    organizationId: string,
    websiteId: string,
    topic: string,
    days = 28,
  ) {
    const full = await this.getSurfaceSummary(
      organizationId,
      websiteId,
      days,
    );
    const key = norm(topic);
    const match = (
      full.topics as Array<{ topic: string }>
    ).find((row) => norm(row.topic) === key);
    if (!match) {
      return {
        topic: clean(topic),
        evidenceState: 'UNAVAILABLE',
        note: 'No topic observation in the selected window.',
        cannotMeasure: CANNOT_MEASURE,
        billing: { charged: false },
      };
    }
    const queries = (
      full.queryDetails as Array<{
        query: string;
        topic: string | null;
      }>
    )
      .filter((row) => norm(row.topic ?? '') === key)
      .slice(0, 50);
    return {
      ...match,
      queries,
      cannotMeasure: CANNOT_MEASURE,
      billing: { charged: false },
    };
  }
}

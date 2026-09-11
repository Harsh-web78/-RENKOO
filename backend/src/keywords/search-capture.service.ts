import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { GoogleService } from '../google/google.service';
import { EvidenceFusionService } from './evidence-fusion.service';
import { resolveBaselineWindows } from './search-baseline.service';
import {
  CANNOT_MEASURE,
  CAPTURE_THRESHOLDS,
  aiSearchRelationship,
  capturePattern,
  captureStatement,
  commercialGap,
  commercialTier,
  ctrDiagnosis,
  ctrTrend,
  isStrikingDistanceCommercial,
  mapGroupToNba,
  mapPageDiagnosisToNba,
  opportunityGroups,
  pageDiagnosis,
  serpClickContext,
  type OpportunityGroup,
} from './search-capture';

/*
 * =========================================================
 * ZERO-CLICK + COMMERCIAL SEARCH INTELLIGENCE 1.0
 * (Phase 16) — read-only composition over existing
 * evidence. No new scores, no provider calls on read
 * (SERP cache reads only), no new persistence, no new
 * billing meters. One bounded Promise.all wave; every
 * leg degrades alone; missing stays UNAVAILABLE and is
 * never zero.
 *
 * Bounds: queries ≤200, pages ≤100, rank rows ≤200,
 * AI checks ≤200, SERP cache rows ≤200, strategy links
 * ≤200, leads/revenue ≤200, competitors ≤5.
 * =========================================================
 */

const MAX_QUERIES = 200;
const MAX_PAGES = 100;
const MAX_ROWS = 200;

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function normKey(value: unknown): string {
  return clean(value).toLowerCase();
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function normPage(value: unknown): string | null {
  let raw = clean(value).toLowerCase();
  if (!raw) return null;
  raw = raw.split('?')[0].split('#')[0];
  raw = raw.replace(/^https?:\/\//, '');
  raw = raw.replace(/^www\./, '');
  raw = raw.replace(/\/+$/, '');
  return raw || null;
}

function serpFeatureTypes(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object')
    return [];
  const record = payload as Record<string, unknown>;
  const features = record.features;
  if (!Array.isArray(features)) return [];
  return features
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object')
        return clean(
          (entry as Record<string, unknown>).type,
        );
      return '';
    })
    .filter(Boolean)
    .slice(0, 12);
}

@Injectable()
export class SearchCaptureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleService,
    private readonly fusion: EvidenceFusionService,
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

  async getSearchCapture(
    organizationId: string,
    websiteId: string,
    days = 28,
  ) {
    if (!websiteId) {
      throw new BadRequestException(
        'websiteId is required',
      );
    }
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

    const windows = resolveBaselineWindows(days);
    const { current, previous } = windows;

    const [
      queriesCur,
      queriesPrev,
      queryPages,
      linksRes,
      serpRes,
      ranksRes,
      checksRes,
      leadsRes,
      revenueRes,
      competitorsRes,
      nbaRes,
    ] = await Promise.all([
      this.settled(() =>
        this.google.getSearchQueries(
          organizationId,
          current.startDate,
          current.endDate,
        ),
      ),
      this.settled(() =>
        this.google.getSearchQueries(
          organizationId,
          previous.startDate,
          previous.endDate,
        ),
      ),
      this.settled(() =>
        this.google.getQueryPages(
          organizationId,
          current.startDate,
          current.endDate,
        ),
      ),
      /* Persisted strategy links: intent/priority/page. */
      this.settled(() =>
        this.prisma.contentStrategyLink.findMany({
          where: { organizationId, websiteId },
          select: {
            keyword: true,
            intent: true,
            priority: true,
            targetPage: true,
          },
          take: MAX_ROWS,
        }),
      ),
      /* SERP cache reads only — never a provider call. */
      this.settled(() =>
        this.prisma.keywordMetricCache.findMany({
          where: { metric: 'serp' },
          select: {
            keyword: true,
            payload: true,
            expiresAt: true,
          },
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
        this.prisma.aiVisibilityCheck.findMany({
          where: { websiteId, status: 'COMPLETED' },
          orderBy: { checkedAt: 'desc' },
          take: MAX_ROWS,
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
        this.prisma.competitor.findMany({
          where: { organizationId, websiteId, isActive: true },
          take: 5,
        }),
      ),
      this.settled(() =>
        this.fusion.getNextBestAction(
          organizationId,
          websiteId,
        ),
      ),
    ]);

    const curRows = (
      Array.isArray((queriesCur as any)?.queries)
        ? (queriesCur as any).queries
        : Array.isArray(queriesCur)
          ? queriesCur
          : []
    ).slice(0, MAX_QUERIES);
    const prevRows = (
      Array.isArray((queriesPrev as any)?.queries)
        ? (queriesPrev as any).queries
        : Array.isArray(queriesPrev)
          ? queriesPrev
          : []
    ).slice(0, MAX_QUERIES);
    const pageRows = (
      Array.isArray((queryPages as any)?.pages)
        ? (queryPages as any).pages
        : Array.isArray((queryPages as any)?.rows)
          ? (queryPages as any).rows
          : Array.isArray(queryPages)
            ? queryPages
            : []
    ).slice(0, MAX_ROWS);

    const prevByQuery = new Map<string, any>();
    for (const row of prevRows)
      prevByQuery.set(normKey(row.query ?? row.keyword), row);

    const linkByKeyword = new Map<string, any>();
    for (const link of linksRes ?? [])
      linkByKeyword.set(normKey(link.keyword), link);

    const serpByKeyword = new Map<string, string[]>();
    for (const row of serpRes ?? []) {
      const key = normKey((row as any).keyword);
      if (key && !serpByKeyword.has(key))
        serpByKeyword.set(
          key,
          serpFeatureTypes((row as any).payload),
        );
    }

    const rankByKeyword = new Map<string, any>();
    for (const row of ranksRes ?? []) {
      const key = normKey(
        (row as any).keyword ??
          (row as any).normalizedKeyword,
      );
      if (key && !rankByKeyword.has(key))
        rankByKeyword.set(key, row);
    }

    const aiByQuery = new Map<
      string,
      { mentioned: boolean; cited: boolean; urls: string[] }
    >();
    for (const check of checksRes ?? []) {
      const key = normKey((check as any).query);
      if (!key) continue;
      const entry = aiByQuery.get(key) ?? {
        mentioned: false,
        cited: false,
        urls: [],
      };
      if ((check as any).mentioned) entry.mentioned = true;
      if ((check as any).citationFound) {
        entry.cited = true;
        const url = clean((check as any).citationUrl);
        if (url) entry.urls.push(url);
      }
      aiByQuery.set(key, entry);
    }

    const leads = (leadsRes ?? []) as Array<
      Record<string, any>
    >;
    const revenues = (revenueRes ?? []) as Array<
      Record<string, any>
    >;
    const leadsByKeyword = new Map<string, number>();
    const revenueByKeyword = new Map<string, number>();
    for (const lead of leads) {
      const key = normKey(lead.keyword);
      if (key)
        leadsByKeyword.set(
          key,
          (leadsByKeyword.get(key) ?? 0) + 1,
        );
    }
    for (const revenue of revenues) {
      const key = normKey(
        revenue.keyword ?? revenue.sourceDetail,
      );
      if (key)
        revenueByKeyword.set(
          key,
          (revenueByKeyword.get(key) ?? 0) +
            (Number(revenue.amount) || 0),
        );
    }

    /* ---- per-query composition (≤200) ---- */
    const queryDetails = curRows.map((row: any) => {
      const query = clean(row.query ?? row.keyword);
      const key = normKey(query);
      const impressions = numOrNull(row.impressions) ?? 0;
      const clicks = numOrNull(row.clicks) ?? 0;
      const position = numOrNull(row.position);
      const ctr =
        impressions > 0 ? clicks / impressions : null;
      const prev = prevByQuery.get(key);
      const prevCtr =
        prev &&
        numOrNull(prev.impressions) !== null &&
        (numOrNull(prev.impressions) ?? 0) > 0
          ? (numOrNull(prev.clicks) ?? 0) /
            (numOrNull(prev.impressions) ?? 1)
          : null;
      const link = linkByKeyword.get(key);
      const rank = rankByKeyword.get(key);
      const rankPosition = numOrNull(rank?.position);
      const effectivePosition = position ?? rankPosition;
      const tier = commercialTier({
        intent: link?.intent,
        cpc: null,
        volume: null,
        priority: link?.priority,
      });
      const tierWithRank: typeof tier =
        tier === 'UNAVAILABLE' &&
        numOrNull(row.impressions) !== null
          ? 'LOW_COMMERCIAL'
          : tier;
      const features = serpByKeyword.get(key) ?? [];
      const ai = aiByQuery.get(key);
      const hasRanking =
        effectivePosition !== null || !!link?.targetPage;
      const pattern = capturePattern({
        impressions,
        clicks,
        position: effectivePosition,
        hasSerpFeatures: features.length > 0,
        hasAiCitation: ai?.cited ?? false,
        commercialTier: tierWithRank,
        hasRanking,
      });
      const gap = commercialGap({
        tier: tierWithRank,
        hasRanking,
        position: effectivePosition,
        ctr,
        leads: leadsByKeyword.get(key) ?? 0,
        revenue: revenueByKeyword.get(key) ?? 0,
      });
      const googleStrong =
        effectivePosition !== null
          ? effectivePosition <=
            CAPTURE_THRESHOLDS.strongPosition
          : null;
      const aiStrong: boolean | null = ai
        ? ai.cited || ai.mentioned
        : null;
      const groups = opportunityGroups({
        impressions,
        clicks,
        position: effectivePosition,
        tier: tierWithRank,
        hasRanking,
        hasAiCitation: ai?.cited ?? false,
        aiStrong,
        googleStrong,
        leads: leadsByKeyword.get(key) ?? 0,
        revenue: revenueByKeyword.get(key) ?? 0,
      });
      const pageMatch = pageRows.find(
        (entry: any) =>
          normKey(entry.query ?? entry.keyword) === key,
      );
      return {
        query,
        intent: clean(link?.intent) || null,
        intentEvidenceState: link ? 'OBSERVED' : 'UNAVAILABLE',
        commercialTier: tierWithRank,
        commercialEvidenceState:
          tierWithRank === 'UNAVAILABLE'
            ? 'UNAVAILABLE'
            : 'INFERRED',
        google: {
          impressions,
          clicks,
          ctr,
          position: effectivePosition,
          positionNote:
            'GSC impression-weighted estimated position — not exact current SERP rank.',
          evidenceState: 'VERIFIED',
        },
        trend: {
          state: ctrTrend(ctr, prevCtr),
          currentCtr: ctr,
          previousCtr: prevCtr,
          evidenceState: prev ? 'VERIFIED' : 'UNAVAILABLE',
        },
        ctrDiagnosis: ctrDiagnosis({
          impressions,
          clicks,
          position: effectivePosition,
        }),
        pattern: {
          state: pattern,
          statement: captureStatement(pattern),
          evidenceState:
            pattern === 'INSUFFICIENT_EVIDENCE'
              ? 'UNAVAILABLE'
              : 'OBSERVED',
        },
        serp: {
          features,
          context: serpClickContext({ features, ctr }),
          evidenceState:
            features.length > 0 ? 'OBSERVED' : 'UNAVAILABLE',
          note: 'Observed SERP feature presence is stated alongside CTR — never as its cause.',
        },
        ai: {
          mentioned: ai?.mentioned ?? null,
          cited: ai?.cited ?? null,
          relationship: aiSearchRelationship({
            googleStrong,
            aiStrong,
          }),
          evidenceState: ai ? 'OBSERVED' : 'UNAVAILABLE',
          note: 'AI citation is not traffic; a visit is never a citation.',
        },
        page: {
          rankingUrl:
            clean(pageMatch?.page ?? pageMatch?.url) ||
            clean(link?.targetPage) ||
            clean(rank?.url) ||
            null,
          evidenceState:
            pageMatch || link?.targetPage || rank?.url
              ? 'OBSERVED'
              : 'UNAVAILABLE',
        },
        business: {
          leads: leadsByKeyword.get(key) ?? 0,
          revenue: revenueByKeyword.get(key) ?? 0,
          gap,
          evidenceState:
            (leadsByKeyword.get(key) ?? 0) > 0 ||
            (revenueByKeyword.get(key) ?? 0) > 0
              ? 'OBSERVED'
              : 'UNAVAILABLE',
          note: 'Revenue is never inferred from commercial intent.',
        },
        groups,
        suggestedNba:
          groups.length > 0
            ? mapGroupToNba(groups[0] as OpportunityGroup)
            : 'MONITOR_CHANGE',
      };
    });

    /* ---- page diagnostics (≤100) ---- */
    const pageAgg = new Map<string, any>();
    for (const entry of pageRows) {
      const url = clean(entry.page ?? entry.url);
      if (!url) continue;
      const key = normPage(url) ?? url;
      const agg = pageAgg.get(key) ?? {
        url,
        impressions: 0,
        clicks: 0,
        weighted: 0,
        queries: new Set<string>(),
        commercialQueries: 0,
      };
      agg.impressions += numOrNull(entry.impressions) ?? 0;
      agg.clicks += numOrNull(entry.clicks) ?? 0;
      agg.weighted +=
        (numOrNull(entry.position) ?? 0) *
        (numOrNull(entry.impressions) ?? 0);
      const qkey = normKey(entry.query ?? entry.keyword);
      if (qkey) {
        agg.queries.add(qkey);
        const link = linkByKeyword.get(qkey);
        const tier = commercialTier({
          intent: link?.intent,
          cpc: null,
          volume: null,
          priority: link?.priority,
        });
        if (
          tier === 'HIGH_COMMERCIAL' ||
          tier === 'MEDIUM_COMMERCIAL'
        )
          agg.commercialQueries += 1;
      }
      pageAgg.set(key, agg);
    }
    const pageDiagnostics = [...pageAgg.values()]
      .slice(0, MAX_PAGES)
      .map((agg) => {
        const position =
          agg.impressions > 0
            ? agg.weighted / agg.impressions
            : null;
        const ctr =
          agg.impressions > 0
            ? agg.clicks / agg.impressions
            : null;
        const queryKeys = [...agg.queries] as string[];
        const hasSerpFeatures = queryKeys.some(
          (q) => (serpByKeyword.get(q) ?? []).length > 0,
        );
        const hasAiCitation = queryKeys.some(
          (q) => aiByQuery.get(q)?.cited === true,
        );
        const pageLeads = leads.filter((lead) => {
          const lp = normPage(lead.landingPage);
          return (
            lp !== null &&
            (lp === (normPage(agg.url) ?? '') ||
              queryKeys.includes(normKey(lead.keyword)))
          );
        }).length;
        const diagnosis = pageDiagnosis({
          impressions: agg.impressions,
          clicks: agg.clicks,
          position,
          commercialQueries: agg.commercialQueries,
          hasSerpFeatures,
          hasAiCitation,
          aiTraffic: null,
          leads: pageLeads,
          revenue: 0,
          hasRanking: position !== null,
        });
        return {
          url: agg.url,
          impressions: agg.impressions,
          clicks: agg.clicks,
          ctr,
          position,
          positionNote:
            'GSC impression-weighted estimated position.',
          queries: agg.queries.size,
          commercialQueries: agg.commercialQueries,
          leads: pageLeads,
          leadsEvidenceState:
            pageLeads > 0 ? 'OBSERVED' : 'UNAVAILABLE',
          diagnosis,
          suggestedNba: mapPageDiagnosisToNba(diagnosis),
          evidenceState:
            agg.impressions > 0 ? 'VERIFIED' : 'UNAVAILABLE',
        };
      });

    /* ---- summary ---- */
    const countBy = (pred: (row: any) => boolean) =>
      queryDetails.filter(pred).length;
    const summary = {
      queries: queryDetails.length,
      highVisibilityLowCapture: countBy(
        (row) =>
          row.pattern.state ===
          'HIGH_VISIBILITY_LOW_CLICK_CAPTURE',
      ),
      highCtrOpportunity: countBy(
        (row) => row.ctrDiagnosis === 'HIGH_CTR_OPPORTUNITY',
      ),
      commercialGaps: countBy(
        (row) =>
          row.business.gap === 'COMMERCIAL_VISIBILITY_GAP' ||
          row.business.gap === 'COMMERCIAL_CTR_GAP',
      ),
      strikingCommercial: countBy((row) =>
        isStrikingDistanceCommercial(
          row.google.position,
          row.commercialTier,
        ),
      ),
      aiWithoutTraffic: countBy(
        (row) =>
          row.pattern.state ===
          'AI_VISIBILITY_WITHOUT_OBSERVED_TRAFFIC',
      ),
      outcomeConnected: countBy((row) =>
        (row.groups as string[]).includes(
          'OUTCOME_CONNECTED_SEARCH',
        ),
      ),
      evidenceState:
        queryDetails.length > 0 ? 'VERIFIED' : 'UNAVAILABLE',
      windows: current,
      note: 'VISIBLE ≠ CLICKED ≠ LEAD ≠ CUSTOMER ≠ REVENUE. Low CTR is not proven zero-click.',
    };

    const groupCounts: Record<string, number> = {};
    for (const row of queryDetails)
      for (const group of row.groups as string[])
        groupCounts[group] = (groupCounts[group] ?? 0) + 1;

    return {
      summary,
      patterns: queryDetails
        .filter(
          (row: any) =>
            row.pattern.state !== 'INSUFFICIENT_EVIDENCE',
        )
        .slice(0, 50)
        .map((row: any) => ({
          query: row.query,
          pattern: row.pattern,
          google: row.google,
          commercialTier: row.commercialTier,
        })),
      commercialOpportunities: queryDetails
        .filter(
          (row: any) =>
            row.business.gap ===
              'COMMERCIAL_VISIBILITY_GAP' ||
            row.business.gap === 'COMMERCIAL_CTR_GAP' ||
            (row.groups as string[]).includes(
              'STRIKING_DISTANCE_COMMERCIAL',
            ),
        )
        .slice(0, 50),
      queryDetails: queryDetails.slice(0, MAX_QUERIES),
      pageDiagnostics,
      groupCounts,
      aiContext: {
        checkedQueries: checksRes?.length ?? 0,
        evidenceState:
          (checksRes?.length ?? 0) > 0
            ? 'OBSERVED'
            : 'UNAVAILABLE',
        note: 'AI mention ≠ AI citation ≠ AI traffic ≠ lead.',
      },
      businessContext: {
        leads: leads.length,
        revenueRecognized: revenues.length,
        evidenceState:
          leads.length > 0 || revenues.length > 0
            ? 'OBSERVED'
            : 'UNAVAILABLE',
        competitors: (competitorsRes ?? []).map(
          (row: any) => ({
            name: clean(row.name),
            domain: clean(row.domain),
            note: 'Competitor observed in SERP where SERP evidence exists; never claimed to steal traffic.',
          }),
        ),
      },
      nextBestAction: nbaRes ?? {
        evidenceState: 'UNAVAILABLE',
        statement:
          'Next best action unavailable for this website right now.',
      },
      measurement: {
        note: 'Track position, impressions, clicks, CTR, AI mention/citation, traffic, leads, revenue as BEFORE → ACTION → AFTER → OBSERVED CHANGE. Never ACTION CAUSED X.',
        rankEndpoint: `/keywords/rank/history?websiteId=${website.id}`,
        actionEndpoint: `/keywords/rank/measure?actionId=`,
      },
      freshness: {
        windows,
        note: 'GSC windows end yesterday (freshness lag); previous window is the equal-length period directly before.',
      },
      cannotMeasure: CANNOT_MEASURE,
      honesty: {
        note: 'High search visibility with low observed click capture. AI visibility observed does not imply AI referral traffic. Observed SERP features coincide with low CTR — no causal claim.',
      },
      billing: {
        charged: false,
        note: 'Read-only composition over stored evidence. No AI credits, scans, or provider meters consumed.',
      },
    };
  }

  async getQueryCapture(
    organizationId: string,
    websiteId: string,
    query: string,
    days = 28,
  ) {
    const full = await this.getSearchCapture(
      organizationId,
      websiteId,
      days,
    );
    const key = normKey(query);
    const match = (full.queryDetails as any[]).find(
      (row) => normKey(row.query) === key,
    );
    if (!match) {
      return {
        query: clean(query),
        evidenceState: 'UNAVAILABLE',
        note: 'No GSC observation for this query in the selected window. Unavailable is not zero.',
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
}

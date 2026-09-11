import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { GoogleService } from '../google/google.service';
import { EvidenceFusionService } from './evidence-fusion.service';
import { commercialTier } from './search-capture';
import {
  CANNOT_MEASURE,
  classifyQuery,
  criterionCoverage,
  detectCriteria,
  detectFanoutPatterns,
  mapDemandGapToAction,
  needKey,
  questionFamily,
  type CoverageState,
  type DemandGap,
  type DecisionCriterion,
  type JourneyStage,
  type NeedPattern,
} from './customer-demand';

/*
 * =========================================================
 * CUSTOMER DEMAND INTELLIGENCE 2.0 (Phase 24) — read-only
 * composition over GSC queries, AI prompts, strategy
 * links, ranks, competitors, outcomes. Deterministic
 * rules first; fan-out PATTERNS (never query targets);
 * inferred questions stay hypotheses until observed.
 * No scores, no new meters, no new persistence.
 *
 * Bounds: needs ≤50, queries ≤200, topics ≤100,
 * prompts ≤200, pages ≤100, competitors ≤5, criteria
 * ≤50, outcomes ≤200. One bounded wave, maps only.
 * =========================================================
 */

const MAX_QUERIES = 200;
const MAX_NEEDS = 50;

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function norm(value: unknown): string {
  return clean(value).toLowerCase();
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function rowsOf(response: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(response))
    return response as Array<Record<string, unknown>>;
  const record = response as Record<string, unknown>;
  if (Array.isArray(record.queries))
    return record.queries as Array<Record<string, unknown>>;
  if (Array.isArray(record.rows))
    return record.rows as Array<Record<string, unknown>>;
  return [];
}

function windowFor(days: number): {
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

interface NeedBucket {
  need: NeedPattern;
  journey: JourneyStage;
  topic: string;
  queries: Array<{
    text: string;
    source: 'GSC' | 'AI_PROMPT';
    impressions: number;
    clicks: number;
    position: number | null;
    intent: string | null;
    priority: string | null;
    page: string | null;
    aiMentioned: boolean | null;
    aiCited: boolean | null;
    evidenceState: 'VERIFIED' | 'OBSERVED';
  }>;
  competitors: Set<string>;
  commercialHigh: number;
}

@Injectable()
export class CustomerDemandService {
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

  async getCustomerNeeds(
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
    const window = windowFor(days);

    const [
      brainRes,
      queriesRes,
      checksRes,
      strategyRes,
      ranksRes,
      competitorsRes,
      leadsRes,
      revenueRes,
      linksRes,
      nbaRes,
    ] = await Promise.all([
      this.settled(() =>
        this.prisma.businessBrain.findUnique({
          where: { websiteId },
        }),
      ),
      this.settled(() =>
        this.google.getSearchQueries(
          organizationId,
          window.startDate,
          window.endDate,
        ),
      ),
      this.settled(() =>
        this.prisma.aiVisibilityCheck.findMany({
          where: { websiteId, status: 'COMPLETED' },
          orderBy: { checkedAt: 'desc' },
          take: MAX_QUERIES,
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
          take: MAX_QUERIES,
        }),
      ),
      this.settled(() =>
        this.prisma.rankObservation.findMany({
          where: { organizationId, websiteId },
          orderBy: { observedAt: 'desc' },
          take: MAX_QUERIES,
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
          take: MAX_QUERIES,
        }),
      ),
      this.settled(() =>
        this.prisma.revenue.findMany({
          where: { websiteId, status: 'RECOGNIZED' },
          orderBy: { recognizedAt: 'desc' },
          take: MAX_QUERIES,
        }),
      ),
      this.settled(() =>
        this.prisma.backlink.findMany({
          where: { websiteId },
          select: { sourceDomain: true },
          take: MAX_QUERIES,
        }),
      ),
      this.settled(() =>
        this.fusion.getNextBestAction(
          organizationId,
          websiteId,
        ),
      ),
    ]);

    const strategyByQuery = new Map<
      string,
      { topic: string; targetPage: string; priority: string; intent: string }
    >();
    for (const row of (strategyRes ??
      []) as Array<Record<string, unknown>>) {
      const key = norm(row.keyword);
      if (!key || strategyByQuery.has(key)) continue;
      strategyByQuery.set(key, {
        topic: clean(row.topic),
        targetPage: clean(row.targetPage),
        priority: clean(row.priority),
        intent: clean(row.intent),
      });
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
    const aiByQuery = new Map<
      string,
      { mentioned: boolean; cited: boolean; competitors: string[] }
    >();
    for (const row of (checksRes ??
      []) as Array<Record<string, unknown>>) {
      const key = norm(row.query);
      if (!key) continue;
      const entry = aiByQuery.get(key) ?? {
        mentioned: false,
        cited: false,
        competitors: [],
      };
      if (row.mentioned === true) entry.mentioned = true;
      if (row.citationFound === true) entry.cited = true;
      if (Array.isArray(row.competitorNames))
        for (const name of row.competitorNames) {
          if (clean(name) && !entry.competitors.includes(clean(name)))
            entry.competitors.push(clean(name));
        }
      aiByQuery.set(key, entry);
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
      const key = norm(row.keyword ?? row.sourceDetail);
      if (key)
        revenueByQuery.set(
          key,
          (revenueByQuery.get(key) ?? 0) +
            (Number(row.amount) || 0),
        );
    }

    /* ---- classify observed queries + prompts ---- */
    const buckets = new Map<string, NeedBucket>();
    const register = (
      text: string,
      source: 'GSC' | 'AI_PROMPT',
      extra: Partial<NeedBucket['queries'][number]> = {},
    ): void => {
      const query = clean(text);
      if (!query) return;
      const key = norm(query);
      const classification = classifyQuery(query);
      const strategy = strategyByQuery.get(key);
      const topic =
        strategy?.topic || '(unassigned topic)';
      const bucketKey = needKey(
        classification.need,
        classification.journey,
        topic,
      );
      const bucket = buckets.get(bucketKey) ?? {
        need: classification.need,
        journey: classification.journey,
        topic,
        queries: [],
        competitors: new Set<string>(),
        commercialHigh: 0,
      };
      const ai = aiByQuery.get(key);
      bucket.queries.push({
        text: query,
        source,
        impressions: extra.impressions ?? 0,
        clicks: extra.clicks ?? 0,
        position:
          extra.position ??
          rankByQuery.get(key) ??
          null,
        intent: strategy?.intent ?? null,
        priority: strategy?.priority ?? null,
        page: strategy?.targetPage ?? null,
        aiMentioned: ai ? ai.mentioned : null,
        aiCited: ai ? ai.cited : null,
        evidenceState:
          source === 'GSC' ? 'VERIFIED' : 'OBSERVED',
      });
      if (ai)
        for (const name of ai.competitors)
          bucket.competitors.add(name);
      const tier = commercialTier({
        intent: strategy?.intent,
        cpc: null,
        volume: null,
        priority: strategy?.priority,
      });
      if (tier === 'HIGH_COMMERCIAL') bucket.commercialHigh++;
      buckets.set(bucketKey, bucket);
    };

    for (const row of rowsOf(queriesRes).slice(
      0,
      MAX_QUERIES,
    )) {
      register(clean(row.query ?? row.keyword), 'GSC', {
        impressions: numOrNull(row.impressions) ?? 0,
        clicks: numOrNull(row.clicks) ?? 0,
        position: numOrNull(row.position),
      });
    }
    for (const row of (checksRes ??
      []) as Array<Record<string, unknown>>) {
      register(clean(row.query), 'AI_PROMPT');
    }

    /* ---- compose needs (≤50) ---- */
    const needs = [...buckets.values()]
      .slice(0, MAX_NEEDS)
      .map((bucket) => {
        const texts = bucket.queries.map(
          (row) => row.text,
        );
        const criteria = detectCriteria(texts);
        const pages = [
          ...new Set(
            bucket.queries
              .map((row) => row.page)
              .filter(Boolean) as string[],
          ),
        ].slice(0, 10);
        const cited =
          bucket.queries.some(
            (row) => row.aiCited === true,
          ) || null;
        const coverage: Record<
          DecisionCriterion,
          { state: CoverageState; page: string | null }
        > = {} as Record<
          DecisionCriterion,
          { state: CoverageState; page: string | null }
        >;
        for (const criterion of criteria.slice(0, 50)) {
          const page =
            pages.find((candidate) =>
              norm(candidate).includes(
                norm(criterion).slice(0, 6),
              ),
            ) ??
            pages[0] ??
            null;
          coverage[criterion] = {
            state: criterionCoverage(
              criterion,
              page !== null,
              cited,
            ),
            page,
          };
        }
        const gaps: DemandGap[] = [];
        const missing = (
          Object.entries(coverage) as Array<
            [
              DecisionCriterion,
              { state: CoverageState; page: string | null },
            ]
          >
        ).filter(([, value]) => value.state === 'MISSING');
        if (
          missing.some(([criterion]) =>
            ['PRICE'].includes(criterion),
          )
        )
          gaps.push('MISSING_PRICE_INFORMATION');
        if (
          missing.some(([criterion]) =>
            ['FEATURES', 'ALTERNATIVES'].includes(criterion),
          )
        )
          gaps.push('MISSING_COMPARISON_INFORMATION');
        if (
          missing.some(([criterion]) =>
            ['TRUST', 'REVIEWS'].includes(criterion),
          )
        )
          gaps.push('MISSING_TRUST_INFORMATION');
        if (
          missing.some(([criterion]) =>
            ['IMPLEMENTATION'].includes(criterion),
          )
        )
          gaps.push('MISSING_IMPLEMENTATION_INFORMATION');
        if (
          bucket.queries.every(
            (row) => row.aiCited !== true,
          ) &&
          bucket.queries.some(
            (row) => row.aiCited === false,
          )
        )
          gaps.push('MISSING_AI_CITATION');
        const impressions = bucket.queries.reduce(
          (sum, row) => sum + row.impressions,
          0,
        );
        const hasRanking = bucket.queries.some(
          (row) => row.position !== null,
        );
        if (impressions > 0 && !hasRanking)
          gaps.push('MISSING_GOOGLE_VISIBILITY');
        const leads = bucket.queries.reduce(
          (sum, row) =>
            sum +
            (leadsByQuery.get(norm(row.text)) ?? 0),
          0,
        );
        const revenue = bucket.queries.reduce(
          (sum, row) =>
            sum +
            (revenueByQuery.get(norm(row.text)) ?? 0),
          0,
        );
        if (leads === 0 && revenue === 0)
          gaps.push('MISSING_OUTCOME_DATA');
        const families = [
          ...new Set(
            bucket.queries
              .map((row) => questionFamily(row.text))
              .filter(Boolean),
          ),
        ];
        const patterns = [
          ...new Set(
            bucket.queries.flatMap((row) =>
              detectFanoutPatterns(row.text),
            ),
          ),
        ];
        return {
          key: needKey(
            bucket.need,
            bucket.journey,
            bucket.topic,
          ),
          label: `${clean(bucket.topic) === '(unassigned topic)' ? bucket.need.toLowerCase().replace(/_/g, ' ') : bucket.topic} — ${bucket.need.toLowerCase().replace(/_/g, ' ')}`,
          need: bucket.need,
          journey: bucket.journey,
          topic: bucket.topic,
          queries: bucket.queries.slice(0, 20),
          queryCount: bucket.queries.length,
          impressions,
          commercialHigh: bucket.commercialHigh,
          hasHighCommercial: bucket.commercialHigh > 0,
          competitors: [...bucket.competitors].slice(0, 5),
          criteria: criteria.slice(0, 50),
          coverage,
          gaps,
          families,
          fanoutPatterns: patterns,
          fanoutNote:
            'Inferred patterns from observed queries and prompts — never claimed as AI-generated fan-out queries.',
          pages,
          leads,
          revenue,
          outcomeState:
            leads > 0 || revenue > 0
              ? 'OBSERVED'
              : 'UNAVAILABLE',
          opportunities: gaps.slice(0, 5).map((gap) => ({
            gap,
            action: mapDemandGapToAction(gap),
          })),
        };
      });

    /* ---- top needs ≤5: commercial + demand + gap + priority ---- */
    const rankOf = (priority: string | null): number =>
      priority === 'HIGH'
        ? 0
        : priority === 'MEDIUM'
          ? 1
          : 2;
    const topNeeds = [...needs]
      .sort((a, b) => {
        if (
          (b.hasHighCommercial ? 1 : 0) -
            (a.hasHighCommercial ? 1 : 0) !==
          0
        )
          return (
            (b.hasHighCommercial ? 1 : 0) -
            (a.hasHighCommercial ? 1 : 0)
          );
        if (b.impressions !== a.impressions)
          return b.impressions - a.impressions;
        if (b.gaps.length !== a.gaps.length)
          return b.gaps.length - a.gaps.length;
        const aPriority = Math.min(
          ...a.queries.map((row) =>
            rankOf(row.priority),
          ),
          2,
        );
        const bPriority = Math.min(
          ...b.queries.map((row) =>
            rankOf(row.priority),
          ),
          2,
        );
        if (aPriority !== bPriority)
          return aPriority - bPriority;
        return a.key.localeCompare(b.key);
      })
      .slice(0, 5);

    /* ---- journey view: stages with evidence only ---- */
    const stages = new Map<
      string,
      { queries: number; needs: string[] }
    >();
    for (const need of needs) {
      const entry = stages.get(need.journey) ?? {
        queries: 0,
        needs: [],
      };
      entry.queries += need.queryCount;
      if (!entry.needs.includes(need.key))
        entry.needs.push(need.key);
      stages.set(need.journey, entry);
    }

    const brain = (brainRes ?? null) as Record<
      string,
      unknown
    > | null;

    return {
      websiteId,
      summary: {
        needs: needs.length,
        queries: needs.reduce(
          (sum, row) => sum + row.queryCount,
          0,
        ),
        commercialNeeds: needs.filter(
          (row) => row.hasHighCommercial,
        ).length,
        evidenceState:
          needs.length > 0 ? 'OBSERVED' : 'UNAVAILABLE',
        businessContext: {
          business: clean(brain?.businessName) || null,
          offerings: [
            ...((brain?.services as unknown[]) ?? []),
            ...((brain?.products as unknown[]) ?? []),
          ]
            .map(clean)
            .filter(Boolean)
            .slice(0, 10),
          note: 'BusinessBrain is context, not observed demand.',
        },
      },
      topNeeds,
      journey: [...stages.entries()].map(
        ([stage, entry]) => ({
          stage,
          queries: entry.queries,
          needs: entry.needs.slice(0, 10),
        }),
      ),
      needs: needs.slice(0, MAX_NEEDS),
      competitors: (
        (competitorsRes ?? []) as Array<Record<string, unknown>>
      ).map((row) => ({
        name: clean(row.name),
        domain: clean(row.domain),
        note: 'Competitor observed in available evidence where present.',
      })),
      trustSources: (
        (linksRes ?? []) as Array<Record<string, unknown>>
      )
        .map((row) => clean(row.sourceDomain).toLowerCase())
        .filter(Boolean)
        .slice(0, 20),
      nextBestAction: nbaRes ?? {
        evidenceState: 'UNAVAILABLE',
        statement:
          'Next best action unavailable for this website right now.',
      },
      freshness: {
        window,
        note: 'Every source carries observedAt with its rows; nothing invented.',
      },
      evidence: {
        note: 'GSC queries are VERIFIED; AI prompts are OBSERVED; need labels, journeys and patterns are INFERRED; provider volumes are provider-specific; missing stays UNAVAILABLE.',
      },
      cannotMeasure: CANNOT_MEASURE,
      billing: {
        charged: false,
        note: 'Read-only composition over stored evidence. No AI credits, scans, or provider meters consumed.',
      },
    };
  }

  async getNeedQuery(
    organizationId: string,
    websiteId: string,
    query: string,
    days = 28,
  ) {
    const full = await this.getCustomerNeeds(
      organizationId,
      websiteId,
      days,
    );
    const key = norm(query);
    const match = (
      full.needs as Array<{
        queries: Array<{ text: string }>;
      }>
    ).find((need) =>
      need.queries.some(
        (row) => norm(row.text) === key,
      ),
    );
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

  async getNeedTopic(
    organizationId: string,
    websiteId: string,
    topic: string,
    days = 28,
  ) {
    const full = await this.getCustomerNeeds(
      organizationId,
      websiteId,
      days,
    );
    const key = norm(topic);
    const matches = (
      full.needs as Array<{ topic: string }>
    ).filter((need) => norm(need.topic) === key);
    if (matches.length === 0) {
      return {
        topic: clean(topic),
        evidenceState: 'UNAVAILABLE',
        note: 'No topic observation in the selected window.',
        cannotMeasure: CANNOT_MEASURE,
        billing: { charged: false },
      };
    }
    return {
      topic: clean(topic),
      needs: matches,
      cannotMeasure: CANNOT_MEASURE,
      billing: { charged: false },
    };
  }
}

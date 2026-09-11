import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { RoiService } from './roi.service';
import { KeywordStrategyService } from '../keywords/keyword-strategy.service';
import { RankTrackingService } from '../keywords/rank-tracking.service';
import { EvidenceFusionService } from '../keywords/evidence-fusion.service';
import {
  actionOutcomeStatement,
  attributionStatement,
  channelRow,
  classifyLeadAttribution,
  classifyLeadTier,
  classifyRevenueAttribution,
  commercialRelevance,
  funnelStage,
  orderByAmountDesc,
  roiVerdict,
  sameOutcomePage,
  zeroClickState,
  zeroClickStatement,
  type AttributionLevel,
} from './revenue-intelligence';

/*
 * =========================================================
 * SEARCH-TO-REVENUE + AI ROI 1.0 (Phase 13).
 *
 * Composition over EXISTING systems — creates nothing:
 * RoiService.outcome (funnel/tiers/attributed ROI),
 * Strategy 5.0 (demand/intent/commercial inputs),
 * Rank Intelligence (ranking URLs), Lead/Revenue/
 * MarketingSpend records, AI monitoring (mention/
 * citation checks), Action measurement, fusion NBA.
 *
 * Read-only: no provider calls, no AI credits, no new
 * scores, no attribution engine, no proportional
 * revenue allocation. Missing stays UNAVAILABLE.
 * =========================================================
 */

const MAX_PAGES = 100;
const MAX_PAGE_ROWS = 20;
const MAX_KEYWORDS = 200;
const MAX_LEADS = 500;
const MAX_OUTCOMES = 500;
const MAX_ACTIONS = 5;

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

@Injectable()
export class SearchRevenueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roi: RoiService,
    private readonly strategy: KeywordStrategyService,
    private readonly ranks: RankTrackingService,
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

  async getSearchRevenue(
    organizationId: string,
    websiteId: string,
    days = 28,
  ) {
    const website =
      await this.prisma.website.findFirst({
        where: {
          id: websiteId,
          organizationId,
          isActive: true,
        },
        select: { id: true, name: true, url: true },
      });
    if (!website)
      throw new NotFoundException('Website not found');

    const windowDays = [7, 28, 90].includes(days)
      ? days
      : 28;
    const end = new Date();
    const start = new Date(
      end.getTime() -
        windowDays * 24 * 60 * 60 * 1000,
    );
    const from = start.toISOString().slice(0, 10);
    const to = end.toISOString().slice(0, 10);
    const windowLabel = `${windowDays}d`;

    const [
      outcomeRes,
      strategyRes,
      rankRes,
      leadsRes,
      revenueRes,
      spendRes,
      promptsRes,
      checksRes,
      actionsRes,
      nbaRes,
    ] = await Promise.all([
      this.settled(() =>
        this.roi.outcome(
          organizationId,
          websiteId,
          from,
          to,
        ),
      ),
      this.settled(() =>
        this.strategy.strategy(organizationId, {
          websiteId,
          limit: 100,
        }),
      ),
      this.settled(() =>
        this.ranks.getOverview(organizationId, websiteId, {
          days: windowDays,
        }),
      ),
      this.settled(() =>
        this.prisma.lead.findMany({
          where: { websiteId },
          orderBy: { createdAt: 'desc' },
          take: MAX_LEADS,
        }),
      ),
      this.settled(() =>
        this.prisma.revenue.findMany({
          where: {
            websiteId,
            status: 'RECOGNIZED',
          },
          orderBy: { recognizedAt: 'desc' },
          take: MAX_OUTCOMES,
        }),
      ),
      this.settled(() =>
        this.prisma.marketingSpend.findMany({
          where: { websiteId },
          orderBy: { spendDate: 'desc' },
          take: 200,
        }),
      ),
      this.settled(() =>
        this.prisma.aiVisibilityQuery.findMany({
          where: { websiteId, isActive: true },
          take: 50,
        }),
      ),
      this.settled(() =>
        this.prisma.aiVisibilityCheck.findMany({
          where: {
            websiteId,
            status: 'COMPLETED',
          },
          orderBy: { checkedAt: 'desc' },
          take: 100,
        }),
      ),
      this.settled(() =>
        this.prisma.action.findMany({
          where: {
            organizationId,
            websiteId,
            status: 'DONE',
          },
          orderBy: { completedAt: 'desc' },
          take: MAX_ACTIONS,
        }),
      ),
      this.settled(() =>
        this.fusion.getNextBestAction(
          organizationId,
          websiteId,
        ),
      ),
    ]);

    const opps: Array<Record<string, unknown>> =
      ((strategyRes as { opportunities?: unknown } | null)
        ?.opportunities ?? []) as Array<
        Record<string, unknown>
      >;
    const clusters: Array<Record<string, unknown>> =
      ((strategyRes as { clusters?: unknown } | null)
        ?.clusters ?? []) as Array<
        Record<string, unknown>
      >;
    const rankKeywords: Array<Record<string, unknown>> =
      ((rankRes as { keywords?: unknown } | null)
        ?.keywords ?? []) as Array<
        Record<string, unknown>
      >;
    const leads: Array<Record<string, unknown>> =
      ((leadsRes ?? []) as Array<
        Record<string, unknown>
      >).slice(0, MAX_LEADS);
    const revenues: Array<Record<string, unknown>> =
      ((revenueRes ?? []) as Array<
        Record<string, unknown>
      >).slice(0, MAX_OUTCOMES);
    const checks: Array<Record<string, unknown>> =
      ((checksRes ?? []) as Array<
        Record<string, unknown>
      >).slice(0, 100);
    const prompts: Array<Record<string, unknown>> =
      ((promptsRes ?? []) as Array<
        Record<string, unknown>
      >).slice(0, 50);

    const inWindow = (at: unknown): boolean => {
      const time = new Date(String(at ?? '')).getTime();
      return (
        Number.isFinite(time) &&
        time >= start.getTime() &&
        time <= end.getTime()
      );
    };
    const windowLeads = leads.filter((lead) =>
      inWindow(lead.createdAt),
    );
    const windowRevenue = revenues.filter((row) =>
      inWindow(row.recognizedAt),
    );

    /* ---- search demand + visibility (GSC VERIFIED,
       rank OBSERVED) ---- */
    let demand = 0;
    let traffic = 0;
    for (const opp of opps.slice(0, MAX_KEYWORDS)) {
      demand += numOrNull(opp.impressions) ?? 0;
      traffic += numOrNull(opp.clicks) ?? 0;
    }
    const rankedCount = rankKeywords.filter(
      (row) => numOrNull(row.current) !== null,
    ).length;

    /* ---- lead tiers + attribution ---- */
    const revenueLeadIds = new Set(
      revenues
        .map((row) => clean(row.leadId))
        .filter(Boolean),
    );
    const leadRows = windowLeads.map((lead) => {
      const tier = classifyLeadTier({
        status: lead.status,
        converted: lead.converted,
        hasRevenue: revenueLeadIds.has(
          clean(lead.id),
        ),
      });
      const attribution = classifyLeadAttribution({
        source: lead.source,
        sourceDetail: lead.sourceDetail,
        landingPage: lead.landingPage,
        keyword: lead.keyword,
      });
      return { lead, tier, attribution };
    });
    const qualifiedCount = leadRows.filter(
      (row) =>
        row.tier === 'QUALIFIED' ||
        row.tier === 'CUSTOMER',
    ).length;
    const customerCount = leadRows.filter(
      (row) => row.tier === 'CUSTOMER',
    ).length;
    const directLeads = leadRows.filter(
      (row) => row.attribution === 'DIRECT',
    );

    /* ---- revenue attribution (recorded links only) ---- */
    const leadAttributionById = new Map<
      string,
      AttributionLevel
    >();
    for (const row of leadRows) {
      leadAttributionById.set(
        clean(row.lead.id),
        row.attribution,
      );
    }
    const revenueRows = windowRevenue.map((row) => ({
      row,
      attribution: classifyRevenueAttribution({
        leadId: row.leadId,
        leadAttribution:
          leadAttributionById.get(
            clean(row.leadId),
          ) ?? null,
        source: row.source,
        sourceDetail: row.sourceDetail,
      }),
    }));
    const revenueTotal = revenueRows.reduce(
      (sum, entry) =>
        sum + (numOrNull(entry.row.amount) ?? 0),
      0,
    );
    const directRevenue = revenueRows
      .filter(
        (entry) => entry.attribution === 'DIRECT',
      )
      .reduce(
        (sum, entry) =>
          sum + (numOrNull(entry.row.amount) ?? 0),
        0,
      );

    /* ---- spend + ROI (real inputs only) ---- */
    const spendTotal = (
      (spendRes ?? []) as Array<Record<string, unknown>>
    )
      .filter((row) => inWindow(row.spendDate))
      .reduce(
        (sum, row) =>
          sum + (numOrNull(row.amount) ?? 0),
        0,
      );
    const hasSpendRows = (
      (spendRes ?? []) as Array<Record<string, unknown>>
    ).some((row) => inWindow(row.spendDate));
    const roi = roiVerdict({
      revenue:
        revenueRows.length > 0 ? revenueTotal : null,
      cost: hasSpendRows ? spendTotal : null,
    });

    /* ---- pages: visibility + outcome per URL ---- */
    const rankUrlByKeyword = new Map<string, string>();
    for (const row of rankKeywords) {
      const keyword = clean(row.keyword).toLowerCase();
      const url = clean(row.url);
      if (keyword && url) {
        rankUrlByKeyword.set(keyword, url);
      }
    }
    const pageAgg = new Map<
      string,
      {
        url: string;
        clicks: number;
        impressions: number;
        bestPosition: number | null;
        keywords: string[];
      }
    >();
    for (const opp of opps.slice(0, MAX_KEYWORDS)) {
      const url =
        clean(opp.targetPage) ||
        rankUrlByKeyword.get(
          clean(opp.keyword).toLowerCase(),
        ) ||
        null;
      if (!url) continue;
      const entry = pageAgg.get(url) ?? {
        url,
        clicks: 0,
        impressions: 0,
        bestPosition: null,
        keywords: [],
      };
      entry.clicks += numOrNull(opp.clicks) ?? 0;
      entry.impressions +=
        numOrNull(opp.impressions) ?? 0;
      const position = numOrNull(opp.position);
      if (
        position !== null &&
        (entry.bestPosition === null ||
          position < entry.bestPosition)
      ) {
        entry.bestPosition = position;
      }
      const keyword = clean(opp.keyword);
      if (keyword && entry.keywords.length < 10) {
        entry.keywords.push(keyword);
      }
      pageAgg.set(url, entry);
    }
    const citedPages = new Map<string, number>();
    for (const check of checks) {
      if (check.citationFound !== true) continue;
      const url = clean(check.citationUrl);
      if (url) {
        citedPages.set(
          url,
          (citedPages.get(url) ?? 0) + 1,
        );
      }
    }
    const pages = orderByAmountDesc(
      [...pageAgg.values()]
        .slice(0, MAX_PAGES)
        .map((entry) => {
          const matched = leadRows.filter((row) =>
            sameOutcomePage(
              row.lead.landingPage,
              entry.url,
            ),
          );
          const matchedIds = new Set(
            matched.map((row) =>
              clean(row.lead.id),
            ),
          );
          const pageRevenue = revenueRows
            .filter((entry) =>
              matchedIds.has(
                clean(entry.row.leadId),
              ),
            )
            .reduce(
              (sum, item) =>
                sum +
                (numOrNull(item.row.amount) ?? 0),
              0,
            );
          return {
            url: entry.url,
            amount: entry.clicks,
            clicks: entry.clicks,
            clicksState: 'VERIFIED' as const,
            impressions: entry.impressions,
            bestPosition: entry.bestPosition,
            positionState:
              entry.bestPosition !== null
                ? ('OBSERVED' as const)
                : ('UNAVAILABLE' as const),
            aiCitations:
              citedPages.get(entry.url) ?? 0,
            leads: matched.length,
            leadsState:
              matched.length > 0
                ? ('OBSERVED' as const)
                : ('UNAVAILABLE' as const),
            qualified: matched.filter(
              (row) =>
                row.tier === 'QUALIFIED' ||
                row.tier === 'CUSTOMER',
            ).length,
            revenue:
              matchedIds.size > 0
                ? pageRevenue
                : null,
            revenueState:
              matchedIds.size > 0
                ? ('OBSERVED' as const)
                : ('UNAVAILABLE' as const),
            keywords: entry.keywords,
          };
        }),
    ).slice(0, MAX_PAGE_ROWS);

    /* ---- AI bridge (mention/citation observed;
       AI traffic unavailable unless recorded) ---- */
    const mentions = checks.filter(
      (check) => check.mentioned === true,
    ).length;
    const citations = checks.filter(
      (check) => check.citationFound === true,
    ).length;
    const aiSourcedLeads = leadRows.filter((row) => {
      const source = clean(
        row.lead.source,
      ).toUpperCase();
      return (
        source.includes('AI') ||
        source.includes('CHATGPT') ||
        source.includes('GEMINI') ||
        source.includes('CLAUDE') ||
        source.includes('PERPLEXITY') ||
        source.includes('COPILOT')
      );
    });

    /* ---- channels (existing sources + AI) ---- */
    const outcomeSources: Array<{
      source: string;
      leads: number;
      attributedRevenue: number;
    }> =
      ((outcomeRes as { sources?: unknown } | null)
        ?.sources ?? []) as Array<{
        source: string;
        leads: number;
        attributedRevenue: number;
      }>;
    const channels = [
      channelRow({
        channel: 'ORGANIC SEARCH',
        traffic: traffic > 0 ? traffic : null,
        trafficState: 'VERIFIED',
        leads:
          directLeads.length > 0
            ? directLeads.length
            : null,
        leadsState: 'OBSERVED',
        revenue:
          directRevenue > 0 ? directRevenue : null,
        revenueState: 'OBSERVED',
        note:
          directLeads.length === 0
            ? 'Organic traffic known, lead attribution missing.'
            : attributionStatement(
                'DIRECT',
                `${directLeads.length} lead(s)`,
              ),
      }),
      channelRow({
        channel: 'AI SEARCH',
        traffic: null,
        trafficState: 'UNAVAILABLE',
        leads:
          aiSourcedLeads.length > 0
            ? aiSourcedLeads.length
            : null,
        leadsState: 'OBSERVED',
        revenue: null,
        revenueState: 'UNAVAILABLE',
        note: `${mentions} mention(s), ${citations} citation(s) observed; AI referral traffic unavailable.`,
      }),
      ...outcomeSources.slice(0, 3).map((entry) =>
        channelRow({
          channel: clean(entry.source) || 'OTHER',
          leads:
            entry.leads > 0 ? entry.leads : null,
          leadsState: 'OBSERVED',
          revenue:
            entry.attributedRevenue > 0
              ? entry.attributedRevenue
              : null,
          revenueState: 'OBSERVED',
          note: 'Recorded source performance from the outcome engine.',
        }),
      ),
    ].filter(
      (row): row is NonNullable<typeof row> =>
        row !== null,
    );

    /* ---- commercial opportunities ---- */
    const commercial = opps
      .slice(0, MAX_KEYWORDS)
      .map((opp) => ({
        keyword: clean(opp.keyword),
        intent: clean(opp.intent) || null,
        relevance: commercialRelevance({
          intent: opp.intent,
          cpc: numOrNull(opp.cpc),
          volume: numOrNull(opp.volume),
          priority: opp.priority,
        }),
        position: numOrNull(opp.position),
        impressions: numOrNull(opp.impressions),
        clicks: numOrNull(opp.clicks),
      }))
      .filter((row) => row.keyword)
      .sort((a, b) => {
        const rank: Record<string, number> = {
          HIGH: 0,
          MEDIUM: 1,
          LOW: 2,
          UNAVAILABLE: 3,
        };
        return (
          (rank[a.relevance] ?? 3) -
            (rank[b.relevance] ?? 3) ||
          (b.impressions ?? 0) - (a.impressions ?? 0)
        );
      })
      .slice(0, 10);

    /* ---- zero-click diagnostic (site level) ---- */
    const diagnostic = zeroClickState({
      impressions: demand > 0 ? demand : null,
      clicks: traffic > 0 ? traffic : null,
      aiCitations: citations > 0 ? citations : 0,
      aiTraffic: null,
      leads: leadRows.length > 0 ? leadRows.length : 0,
      revenue: revenueTotal > 0 ? revenueTotal : 0,
    });

    /* ---- topics (Phase 12 cluster reuse) ---- */
    const keywordTopic = new Map<string, string>();
    for (const cluster of clusters) {
      const topic = clean(cluster.topic);
      if (!topic) continue;
      const primary = clean(
        cluster.primaryKeyword,
      ).toLowerCase();
      if (primary) keywordTopic.set(primary, topic);
      for (const entry of ((cluster.supportingKeywords ??
        []) as unknown[]) ?? []) {
        const key = clean(entry).toLowerCase();
        if (key) keywordTopic.set(key, topic);
      }
    }
    const topicAgg = new Map<
      string,
      { clicks: number; leads: number; revenue: number }
    >();
    for (const opp of opps.slice(0, MAX_KEYWORDS)) {
      const topic =
        keywordTopic.get(
          clean(opp.keyword).toLowerCase(),
        ) ?? null;
      if (!topic) continue;
      const entry = topicAgg.get(topic) ?? {
        clicks: 0,
        leads: 0,
        revenue: 0,
      };
      entry.clicks += numOrNull(opp.clicks) ?? 0;
      const page =
        clean(opp.targetPage) ||
        rankUrlByKeyword.get(
          clean(opp.keyword).toLowerCase(),
        );
      if (page) {
        const matchedIds = new Set(
          leadRows
            .filter((row) =>
              sameOutcomePage(
                row.lead.landingPage,
                page,
              ),
            )
            .map((row) => clean(row.lead.id)),
        );
        entry.leads += matchedIds.size;
        entry.revenue += revenueRows
          .filter((item) =>
            matchedIds.has(clean(item.row.leadId)),
          )
          .reduce(
            (sum, item) =>
              sum + (numOrNull(item.row.amount) ?? 0),
            0,
          );
      }
      topicAgg.set(topic, entry);
    }
    const topics = [...topicAgg.entries()]
      .map(([topic, entry]) => ({
        topic,
        clicks: entry.clicks,
        clicksState: 'VERIFIED' as const,
        leads: entry.leads,
        leadsState:
          entry.leads > 0
            ? ('OBSERVED' as const)
            : ('UNAVAILABLE' as const),
        revenue:
          entry.leads > 0 ? entry.revenue : null,
        revenueState:
          entry.leads > 0
            ? ('OBSERVED' as const)
            : ('UNAVAILABLE' as const),
        outcome:
          entry.leads === 0 && entry.clicks > 0
            ? ('BUSINESS OUTCOME: connected traffic, no observed leads.' as const)
            : entry.leads > 0
              ? ('BUSINESS OUTCOME: observed lead linkage.' as const)
              : ('BUSINESS OUTCOME: UNAVAILABLE.' as const),
      }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 8);

    /* ---- action → observed outcome ---- */
    const actionOutcomes: Array<
      Record<string, unknown>
    > = [];
    for (const action of ((actionsRes ?? []) as Array<
      Record<string, unknown>
    >).slice(0, MAX_ACTIONS)) {
      const completedAt = clean(action.completedAt);
      const measure = await this.settled(() =>
        this.ranks.measureAction(
          organizationId,
          clean(action.id),
        ),
      );
      const afterLeads = completedAt
        ? windowLeads.filter(
            (lead) =>
              new Date(
                String(lead.createdAt),
              ).getTime() >=
              new Date(completedAt).getTime(),
          ).length
        : null;
      const beforeLeads = completedAt
        ? windowLeads.filter(
            (lead) =>
              new Date(
                String(lead.createdAt),
              ).getTime() <
              new Date(completedAt).getTime(),
          ).length
        : null;
      actionOutcomes.push({
        actionId: clean(action.id),
        title: clean(action.title),
        completedAt: completedAt || null,
        rank: measure
          ? {
              before: (
                measure as { before?: unknown }
              ).before,
              after: (measure as { after?: unknown })
                .after,
              outcome: (measure as { outcome?: unknown })
                .outcome,
            }
          : null,
        leadsStatement: actionOutcomeStatement({
          title: clean(action.title),
          metric: 'leads',
          before: beforeLeads,
          after: afterLeads,
        }),
      });
    }

    /* ---- attribution gaps (measurement system) ---- */
    const gaps: Array<{
      key: string;
      statement: string;
    }> = [];
    if (traffic > 0 && directLeads.length === 0) {
      gaps.push({
        key: 'lead-attribution',
        statement:
          'Organic traffic is VERIFIED but no lead is directly connected to search — lead attribution missing.',
      });
    }
    if (citations > 0) {
      gaps.push({
        key: 'ai-traffic',
        statement:
          'AI citations observed, but AI referral traffic is unavailable.',
      });
    }
    if (leadRows.length > 0 && revenueRows.length === 0) {
      gaps.push({
        key: 'revenue-linkage',
        statement:
          'Leads observed, but no recognized revenue connection exists.',
      });
    }
    if (
      revenueRows.some(
        (entry) => entry.attribution === 'UNAVAILABLE',
      )
    ) {
      gaps.push({
        key: 'revenue-source',
        statement:
          'Some recognized revenue has no recorded source — revenue attribution unavailable for those rows.',
      });
    }
    if (
      rankedCount > 0 &&
      leadRows.every(
        (row) => row.attribution === 'UNAVAILABLE',
      )
    ) {
      gaps.push({
        key: 'keyword-conversion',
        statement:
          'Rankings observed, but keyword-level conversion is unavailable.',
      });
    }

    return {
      website,
      window: {
        days: windowDays,
        from,
        to,
        gsc: `${from} → ${to} (Search Console window)`,
        ai: 'latest 100 completed AI checks (AI observation window)',
        outcomes: `${from} → ${to} (lead/revenue window)`,
      },
      snapshot: {
        revenue:
          revenueRows.length > 0 ? revenueTotal : null,
        revenueState:
          revenueRows.length > 0
            ? 'OBSERVED'
            : 'UNAVAILABLE',
        customers: customerCount,
        qualified: qualifiedCount,
        leads: leadRows.length,
        outcomesState:
          leads.length > 0 ? 'OBSERVED' : 'UNAVAILABLE',
      },
      funnel: [
        funnelStage(
          'SEARCH_DEMAND',
          demand > 0 ? demand : null,
          `GSC ${windowLabel} window`,
          'VERIFIED',
        ),
        funnelStage(
          'VISIBILITY',
          rankedCount > 0 ? rankedCount : null,
          `rank ${windowLabel} window`,
          'OBSERVED',
        ),
        funnelStage(
          'TRAFFIC',
          traffic > 0 ? traffic : null,
          `GSC ${windowLabel} window`,
          'VERIFIED',
        ),
        funnelStage(
          'LEADS',
          leadRows.length > 0
            ? leadRows.length
            : null,
          `lead ${windowLabel} window`,
          'OBSERVED',
        ),
        funnelStage(
          'QUALIFIED_LEADS',
          qualifiedCount > 0 ? qualifiedCount : null,
          `lead ${windowLabel} window`,
          'OBSERVED',
        ),
        funnelStage(
          'CUSTOMERS',
          customerCount > 0 ? customerCount : null,
          `lead ${windowLabel} window`,
          'OBSERVED',
        ),
        funnelStage(
          'REVENUE',
          revenueRows.length > 0 ? revenueTotal : null,
          `revenue ${windowLabel} window`,
          'OBSERVED',
        ),
      ],
      pages,
      pageTotal: pageAgg.size,
      topics,
      channels,
      ai: {
        promptsTracked: prompts.length,
        mentions,
        citations,
        citedPages: [...citedPages.entries()]
          .map(([url, count]) => ({ url, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        traffic: null,
        trafficState: 'UNAVAILABLE',
        trafficNote:
          'AI mention/citation does not imply traffic. AI referral traffic is unavailable.',
        leads: aiSourcedLeads.length,
        leadsState:
          aiSourcedLeads.length > 0
            ? 'OBSERVED'
            : 'UNAVAILABLE',
      },
      actions: actionOutcomes,
      commercial,
      diagnostic: {
        state: diagnostic,
        statement: zeroClickStatement(diagnostic),
      },
      roi,
      gaps,
      nextBestAction: nbaRes ?? {
        evidenceState: 'UNAVAILABLE',
        statement:
          'Next best action unavailable for this website right now.',
      },
      freshness: {
        gsc: `${from} → ${to}`,
        ai: 'latest completed AI checks (see AI window)',
        outcomes: `${from} → ${to}`,
        note: 'Sources are stamped independently — never synchronized to one timestamp.',
      },
      billing: {
        charged: false,
        note: 'Read-only composition over stored evidence. No AI credits, scans, or provider meters consumed.',
      },
    };
  }
}

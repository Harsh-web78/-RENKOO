import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { KeywordResearchService } from './keyword-research.service';
import { KeywordStrategyService } from './keyword-strategy.service';
import { ContentStrategyService } from './content-strategy.service';
import { RankTrackingService } from './rank-tracking.service';
import { EvidenceFusionService } from './evidence-fusion.service';
import {
  composeTopicEntity,
  coverageState,
  coverageStatement,
  deriveFanout,
  gapStatement,
  googleAiRelationship,
  normalizeTopicQuery,
  relationshipStatement,
  topicGapKind,
  type CoverageState,
} from './topic-intelligence';

/*
 * =========================================================
 * QUERY FAN-OUT + TOPIC OWNERSHIP 1.0 (Phase 12).
 *
 * ONE bounded read wave over existing systems, composed
 * into topic intelligence. Read-only: no provider calls,
 * no AI credits, no AI generation during reads, no new
 * scores, no new prioritization, no new persistence.
 * Every leg degrades alone; missing evidence stays
 * UNAVAILABLE (never zero, never invented).
 *
 * Reused: Strategy 5.0 (opps/clusters/intent), Content
 * Strategy (links/opportunities/page mapping), Rank
 * Intelligence (observations), AI prompt monitoring
 * (queries + mention/citation checks), Competitors,
 * Business Brain (entity), Evidence Fusion NBA.
 * =========================================================
 */

const MAX_OBSERVED_QUERIES = 200;
const MAX_QUERIES_PER_NEED = 8;
const MAX_COMPETITORS = 5;

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

@Injectable()
export class TopicIntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly research: KeywordResearchService,
    private readonly strategy: KeywordStrategyService,
    private readonly content: ContentStrategyService,
    private readonly ranks: RankTrackingService,
    private readonly fusion: EvidenceFusionService,
  ) {}

  private async verifyWebsite(
    organizationId: string,
    websiteId: string,
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
    return website;
  }

  private async settled<T>(
    fn: () => Promise<T>,
  ): Promise<T | null> {
    try {
      return await fn();
    } catch {
      return null;
    }
  }

  async getTopic(
    organizationId: string,
    input: {
      websiteId: string;
      query: string;
      days?: number;
    },
  ) {
    const primaryQuery = clean(input.query);
    if (!primaryQuery) {
      throw new BadRequestException(
        'query is required',
      );
    }
    const website = await this.verifyWebsite(
      organizationId,
      input.websiteId,
    );
    const days = Math.min(
      90,
      Math.max(7, Math.floor(input.days ?? 30) || 30),
    );
    const key = normalizeTopicQuery(primaryQuery);

    const [
      strategyRes,
      contentRes,
      linksRes,
      rankRes,
      promptsRes,
      checksRes,
      brainRes,
      competitorsRes,
      nbaRes,
    ] = await Promise.all([
      this.settled(() =>
        this.strategy.strategy(organizationId, {
          websiteId: website.id,
          limit: 100,
        }),
      ),
      this.settled(() =>
        this.content.getContentOpportunities(
          organizationId,
          { websiteId: website.id, limit: 50 },
        ),
      ),
      this.settled(() =>
        this.content.getLinks(
          organizationId,
          website.id,
        ),
      ),
      this.settled(() =>
        this.ranks.getOverview(organizationId, website.id, {
          days,
        }),
      ),
      this.settled(() =>
        this.prisma.aiVisibilityQuery.findMany({
          where: {
            websiteId: website.id,
            isActive: true,
          },
          take: 50,
          orderBy: { updatedAt: 'desc' },
        }),
      ),
      this.settled(() =>
        this.prisma.aiVisibilityCheck.findMany({
          where: {
            websiteId: website.id,
            status: 'COMPLETED',
          },
          take: 100,
          orderBy: { checkedAt: 'desc' },
        }),
      ),
      this.settled(() =>
        this.prisma.businessBrain.findUnique({
          where: { websiteId: website.id },
        }),
      ),
      this.settled(() =>
        this.prisma.competitor.findMany({
          where: {
            organizationId,
            websiteId: website.id,
            isActive: true,
          },
          take: MAX_COMPETITORS,
        }),
      ),
      this.settled(() =>
        this.fusion.getNextBestAction(
          organizationId,
          website.id,
        ),
      ),
    ]);

    const strategyData = (strategyRes ?? {}) as {
      opportunities?: Array<Record<string, unknown>>;
      clusters?: Array<Record<string, unknown>>;
    };
    const opportunities =
      strategyData.opportunities ?? [];
    const clusters = strategyData.clusters ?? [];

    /* ---- topic resolution: existing cluster first,
       parent-topic derivation second, raw query last.
       Never invented. ---- */
    let topic: string | null = null;
    let clusterKeywords: string[] = [];
    for (const cluster of clusters) {
      const primary = normalizeTopicQuery(
        cluster.primaryKeyword,
      );
      const supporting = (
        (cluster.supportingKeywords ?? []) as unknown[]
      ).map((entry) => normalizeTopicQuery(entry));
      if (
        primary === key ||
        supporting.includes(key) ||
        (key.length > 3 &&
          (primary.includes(key) ||
            key.includes(primary)))
      ) {
        topic = String(
          cluster.topic ?? cluster.primaryKeyword ?? '',
        );
        clusterKeywords = [
          String(cluster.primaryKeyword ?? ''),
          ...((cluster.supportingKeywords ?? []) as unknown[]).map(
            (entry) => String(entry ?? ''),
          ),
        ].filter(Boolean);
        break;
      }
    }
    if (!topic) {
      try {
        topic =
          this.research.getParentTopic(primaryQuery);
      } catch {
        topic = null;
      }
    }
    const topicLabel = topic || primaryQuery;

    /* ---- observed query pool (existing evidence
       only): strategy opps + rank keywords + AI
       prompts + cluster mates. ---- */
    const observed: Array<{
      query: string;
      source: string;
    }> = [];
    for (const opp of opportunities.slice(0, 100)) {
      const keyword = clean(opp.keyword);
      if (keyword) {
        observed.push({
          query: keyword,
          source: 'STRATEGY',
        });
      }
    }
    const rankKeywords: Array<Record<string, unknown>> =
      ((rankRes as { keywords?: unknown } | null)
        ?.keywords ?? []) as Array<
        Record<string, unknown>
      >;
    const rankByQuery = new Map<
      string,
      Record<string, unknown>
    >();
    for (const row of rankKeywords) {
      const keyword = clean(row.keyword);
      if (!keyword) continue;
      rankByQuery.set(
        normalizeTopicQuery(keyword),
        row,
      );
      observed.push({
        query: keyword,
        source: 'RANK',
      });
    }
    const prompts: Array<Record<string, unknown>> = (
      promptsRes ?? []
    ) as Array<Record<string, unknown>>;
    for (const prompt of prompts) {
      const text = clean(prompt.query);
      if (text) {
        observed.push({
          query: text,
          source: 'AI_PROMPT',
        });
      }
    }
    for (const keyword of clusterKeywords) {
      observed.push({
        query: keyword,
        source: 'CLUSTER',
      });
    }
    const fanout = deriveFanout(
      observed.slice(0, MAX_OBSERVED_QUERIES),
      MAX_QUERIES_PER_NEED,
    );

    /* ---- lookup maps from existing systems ---- */
    const oppByQuery = new Map<
      string,
      Record<string, unknown>
    >();
    for (const opp of opportunities) {
      oppByQuery.set(
        normalizeTopicQuery(opp.keyword),
        opp,
      );
    }
    const links: Array<Record<string, unknown>> = (
      (linksRes as { links?: unknown } | null)
        ?.links ??
      (linksRes as Array<Record<string, unknown>> | null) ??
      []
    ) as Array<Record<string, unknown>>;
    const pageByQuery = new Map<string, string>();
    for (const link of Array.isArray(links)
      ? links
      : []) {
      const keyword = normalizeTopicQuery(
        link.keyword,
      );
      const page = clean(
        link.targetPage ?? link.pageUrl,
      );
      if (keyword && page && !pageByQuery.has(keyword)) {
        pageByQuery.set(keyword, page);
      }
    }
    for (const opp of opportunities) {
      const keyword = normalizeTopicQuery(opp.keyword);
      const page = clean(opp.targetPage);
      if (keyword && page && !pageByQuery.has(keyword)) {
        pageByQuery.set(keyword, page);
      }
    }
    const checks: Array<Record<string, unknown>> = (
      checksRes ?? []
    ) as Array<Record<string, unknown>>;
    const checksByQuery = new Map<
      string,
      Array<Record<string, unknown>>
    >();
    for (const check of checks) {
      const query = normalizeTopicQuery(check.query);
      if (!query) continue;
      const list = checksByQuery.get(query) ?? [];
      list.push(check);
      checksByQuery.set(query, list);
    }
    const competitorNames = new Set<string>();
    for (const check of checks) {
      for (const name of ((check.competitorNames ??
        []) as unknown[]) ?? []) {
        const label = clean(name);
        if (label) competitorNames.add(label);
      }
    }

    /* ---- per-need composition ---- */
    const needs = fanout.map((group) => {
      const rows = group.queries.map((query) => {
        const qKey = normalizeTopicQuery(query);
        const rank = rankByQuery.get(qKey);
        const opp = oppByQuery.get(qKey);
        const page =
          pageByQuery.get(qKey) ??
          (typeof opp?.targetPage === 'string'
            ? (opp.targetPage as string)
            : null);
        const promptChecks =
          checksByQuery.get(qKey) ?? [];
        const mentioned = promptChecks.some(
          (check) => check.mentioned === true,
        );
        const cited = promptChecks.some(
          (check) => check.citationFound === true,
        );
        const citedUrl =
          promptChecks.find(
            (check) =>
              check.citationFound === true &&
              clean(check.citationUrl),
          )?.citationUrl ?? null;
        const rivals = Array.from(
          new Set(
            promptChecks.flatMap(
              (check) =>
                ((check.competitorNames ??
                  []) as unknown[]) ?? [],
            )
              .map((name) => clean(name))
              .filter(Boolean),
          ),
        );
        const rankPosition =
          numOrNull(rank?.current) ??
          numOrNull(opp?.position);
        const gap = topicGapKind({
          hasPage: !!page,
          pageRanks:
            rankPosition !== null && rankPosition <= 100,
          competitorPresent: rivals.length > 0,
          cannibalizationRisk:
            (opp as { cannibalizationRisk?: unknown })
              ?.cannibalizationRisk === true,
        });
        return {
          query,
          intent: group.intent,
          google: {
            position: rankPosition,
            url:
              (typeof rank?.url === 'string'
                ? (rank.url as string)
                : null) ?? page,
            evidenceState:
              rankPosition !== null
                ? 'OBSERVED'
                : 'UNAVAILABLE',
          },
          ai: {
            mentioned:
              promptChecks.length > 0
                ? mentioned
                : null,
            cited:
              promptChecks.length > 0 ? cited : null,
            citedUrl:
              typeof citedUrl === 'string'
                ? citedUrl
                : null,
            observations: promptChecks.length,
            evidenceState:
              promptChecks.length > 0
                ? 'OBSERVED'
                : 'UNAVAILABLE',
          },
          page,
          competitors: rivals,
          gap,
          gapStatement: gapStatement(gap, query),
        };
      });
      return {
        need: group.need,
        intent: group.intent,
        queries: rows,
      };
    });

    /* ---- ownership dimensions ---- */
    const googleObserved = needs.flatMap((group) =>
      group.queries.map((row) => row.google),
    );
    const googleCovered = googleObserved.filter(
      (entry) => entry.position !== null,
    ).length;
    const aiObserved = needs.flatMap((group) =>
      group.queries.map((row) => row.ai),
    );
    const aiCovered = aiObserved.filter(
      (entry) =>
        entry.mentioned === true ||
        entry.cited === true,
    ).length;
    const contentMapped = needs.flatMap((group) =>
      group.queries.filter((row) => !!row.page),
    ).length;
    const totalQueries = needs.reduce(
      (sum, group) => sum + group.queries.length,
      0,
    );
    const rivalQueryHits = needs.flatMap((group) =>
      group.queries.filter(
        (row) => row.competitors.length > 0,
      ),
    ).length;

    const google: CoverageState = coverageState({
      covered: googleCovered,
      total: totalQueries,
      competitorCovered: rivalQueryHits,
    });
    const ai: CoverageState = coverageState({
      covered: aiCovered,
      total: Math.max(
        totalQueries,
        prompts.length > 0 ? prompts.length : 0,
      ),
      competitorCovered: rivalQueryHits,
    });
    const content: CoverageState = coverageState({
      covered: contentMapped,
      total: totalQueries,
    });
    const relationship = googleAiRelationship(
      google,
      ai,
    );

    const competitors = (
      (competitorsRes ?? []) as Array<
        Record<string, unknown>
      >
    )
      .slice(0, MAX_COMPETITORS)
      .map((row) => ({
        name: clean(row.name),
        domain: clean(row.domain),
        url: clean(row.url),
        evidenceState:
          'OBSERVED' as const,
      }));

    const entity = composeTopicEntity({
      businessName: (
        brainRes as { businessName?: unknown } | null
      )?.businessName,
      products: (brainRes as { products?: unknown } | null)
        ?.products,
      services: (brainRes as { services?: unknown } | null)
        ?.services,
      primaryKeywords: (
        brainRes as { primaryKeywords?: unknown } | null
      )?.primaryKeywords,
      targetAudience: (
        brainRes as { targetAudience?: unknown } | null
      )?.targetAudience,
    });

    /* ---- freshness: each source stamped alone,
       never implying synchronization. ---- */
    let latestAi: string | null = null;
    for (const check of checks) {
      const at = clean(check.checkedAt);
      if (at && (!latestAi || at > latestAi)) {
        latestAi = at;
      }
    }
    let latestRank: string | null = null;
    for (const row of rankKeywords) {
      const at = clean(row.lastObserved);
      if (at && (!latestRank || at > latestRank)) {
        latestRank = at;
      }
    }

    return {
      website,
      primaryQuery,
      topic: topicLabel,
      topicSource:
        clusterKeywords.length > 0
          ? 'OBSERVED_CLUSTER'
          : topic
            ? 'INFERRED_PARENT_TOPIC'
            : 'QUERY_ONLY',
      days,
      ownership: {
        google: {
          state: google,
          statement: coverageStatement(
            google,
            topicLabel,
          ),
          queriesObserved: totalQueries,
          queriesCovered: googleCovered,
          evidenceState:
            totalQueries > 0
              ? 'OBSERVED'
              : 'UNAVAILABLE',
        },
        ai: {
          state: ai,
          statement: coverageStatement(ai, topicLabel),
          promptsTracked: prompts.length,
          promptsCovered: aiCovered,
          competitorNames: Array.from(
            competitorNames,
          ).slice(0, 20),
          evidenceState:
            prompts.length > 0 || checks.length > 0
              ? 'OBSERVED'
              : 'UNAVAILABLE',
        },
        content: {
          state: content,
          statement: coverageStatement(
            content,
            topicLabel,
          ),
          queriesMapped: contentMapped,
          queriesObserved: totalQueries,
          evidenceState:
            links.length > 0 ||
            opportunities.length > 0
              ? 'OBSERVED'
              : 'UNAVAILABLE',
        },
        competitors: {
          tracked: competitors,
          rivalQueryHits,
          evidenceState:
            competitors.length > 0 || checks.length > 0
              ? 'OBSERVED'
              : 'UNAVAILABLE',
        },
        relationship,
        relationshipStatement:
          relationshipStatement(relationship),
      },
      needs,
      totalNeeds: needs.length,
      totalQueries,
      entity: entity ?? {
        evidenceState: 'UNAVAILABLE' as const,
        statement:
          'No Business Brain entity information — unavailable, never inferred from keyword absence.',
      },
      nextBestAction: nbaRes ?? {
        evidenceState: 'UNAVAILABLE',
        statement:
          'Next best action unavailable for this website right now.',
      },
      measurement: {
        note: 'Topic change is reported as observed movement per dimension — never causal proof any single action caused it.',
        rankEndpoint: `/keywords/rank/history?websiteId=${website.id}`,
        aiEndpoint: 'AI prompt history under AI Visibility monitoring.',
      },
      freshness: {
        rank: latestRank ?? 'unavailable',
        ai: latestAi ?? 'unavailable',
        strategy:
          'latest computed strategy run (see strategy response)',
        content:
          'latest content/crawl state (see content strategy)',
        note: 'Sources are stamped independently — never synchronized to one timestamp.',
      },
      billing: {
        charged: false,
        note: 'Read-only composition over stored evidence. Consumes no AI_CREDITS, AI_SCANS, or provider allowance.',
      },
    };
  }
}

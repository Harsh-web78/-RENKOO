import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  AI_SURFACES,
  honestObservationType,
} from './ai-surfaces';
import {
  clusterLabPrompts,
  filterLabPrompts,
  generatePromptUniverse,
  type AiJourneyStage,
  type AiPromptArchetype,
  type AiPromptGroup,
  type LabPrompt,
} from './ai-prompt-lab.service';
import {
  badgesFor,
  compareHistory,
  computeAiMetrics,
  computeVisibilityIndex,
  metricsByTopic,
  normalizeObservation,
  resolveVisibilityState,
  type AiMetricInput,
} from './ai-observation';
import {
  buildCitationGaps,
  buildCompetitorRadar,
  buildSourceGraph,
  classifyCitation,
  sourceTypeOf,
  summarizeSourceTypes,
} from './ai-source-intelligence.service';
import {
  assessReadiness,
  buildAiContentGaps,
  buildAiOpportunities,
  enrichBrief,
  findEntityContradictions,
  gradeAnswerWorthiness,
  primaryWhyNotCause,
  runWhyNotAiChecks,
  type AiOpportunityKind,
} from './ai-why-not.service';
import {
  bridgeToRoadmapCandidate,
  buildComparisonMatrix,
  classifyAiGaps,
  diagnoseAiGap,
} from './ai-search-intelligence.service';
import { normalizeKeyword } from '../keywords/content-strategy.service';

/*
 * =========================================================
 * AI SEARCH OS 1.0 — Command Center composition
 * (Phase 6 / Parts 22–27).
 *
 * Read-model over EXISTING tables (AiVisibilityQuery /
 * Check, Competitor, BusinessBrain, Crawl/CrawlPage/
 * SeoIssue, Recommendation, Action). No new tables, no
 * new billing counters: live execution stays metered by
 * AiVisibilityService.runCheck (AI_SCANS, failures free);
 * every endpoint here is local composition (no charge).
 * Tenant isolation on every read via organizationId +
 * websiteId verification. No causality claims, no
 * invented ranks, INSUFFICIENT_DATA instead of 0%.
 * =========================================================
 */

const MAX_QUERIES = 200;
const MAX_CHECKS = 1000;

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function domainOfWebsite(url: unknown): string | null {
  try {
    return new URL(String(url ?? '')).hostname
      .toLowerCase()
      .replace(/^www\./, '');
  } catch {
    return null;
  }
}

@Injectable()
export class AiSearchOsService {
  constructor(
    private readonly prisma: PrismaService,
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
        include: { businessBrain: true },
      });
    if (!website)
      throw new NotFoundException('Website not found');
    return website;
  }

  /*
   * GET /ai-visibility/os/command-center
   * One bounded parallel wave (no N+1), then pure
   * composition. Expensive provider calls never run
   * here — the UI renders from recorded observations.
   */
  async getCommandCenter(
    organizationId: string,
    websiteId: string,
  ) {
    const website = await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    const ownDomain = domainOfWebsite(website.url);

    const [
      queries,
      checks,
      competitors,
      recommendations,
      actions,
      latestCrawl,
    ] = await Promise.all([
      this.prisma.aiVisibilityQuery.findMany({
        where: { websiteId, isActive: true },
        orderBy: { createdAt: 'desc' },
        take: MAX_QUERIES,
      }),
      this.prisma.aiVisibilityCheck.findMany({
        where: { websiteId },
        orderBy: { checkedAt: 'desc' },
        take: MAX_CHECKS,
      }),
      this.prisma.competitor.findMany({
        where: { organizationId },
        take: 50,
      }),
      this.prisma.recommendation.findMany({
        where: {
          organizationId,
          websiteId,
          status: { in: ['OPEN', 'IN_PROGRESS'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.action.findMany({
        where: { organizationId, websiteId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.crawl.findFirst({
        where: { websiteId, status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
      }),
    ]);

    const competitorNames = competitors.map((c) => c.name);
    const comparison = buildComparisonMatrix({
      prompts: queries.map((q) => ({
        text: q.query,
        intent: q.category,
      })),
      observations: checks.map((c) => ({
        prompt: c.query,
        provider: c.platform,
        observedAt: c.checkedAt
          ? c.checkedAt.toISOString()
          : null,
        answerText: c.response,
        brandMentioned: c.mentioned,
        checkFailed: c.status === 'FAILED',
        competitorMentions: c.competitorNames ?? [],
      })),
      competitors: competitorNames,
      websiteUrl: website.url,
    });
    const gaps = classifyAiGaps(comparison);

    /* Normalized observations (provider semantics kept). */
    const normalized = checks.slice(0, 200).map((c) =>
      normalizeObservation({
        prompt: c.query,
        surface: c.platform,
        provider: c.platform,
        observationMethod: honestObservationType(
          c.platform,
          false,
        ),
        observedAt: c.checkedAt
          ? c.checkedAt.toISOString()
          : null,
        answerText: c.response,
        brandMentioned: c.mentioned,
        brandNames: website.businessBrain?.businessName
          ? [
              website.businessBrain.businessName,
              website.name,
            ]
          : [website.name],
        competitorMentions: c.competitorNames ?? [],
        citations: c.citationUrl
          ? [{ url: c.citationUrl }]
          : [],
        checkFailed: c.status === 'FAILED',
      }),
    );

    /* Metrics with honest denominators. */
    const byPrompt = new Map<string, typeof checks>();
    for (const c of checks) {
      const key = normalizeKeyword(c.query);
      if (!key) continue;
      const list = byPrompt.get(key) ?? [];
      list.push(c);
      byPrompt.set(key, list);
    }
    const metricRows: Array<
      AiMetricInput & { topic: string }
    > = comparison.map((row) => {
      const key = normalizeKeyword(row.prompt);
      const rows = byPrompt.get(key) ?? [];
      const observable = rows.some(
        (r) => r.status === 'COMPLETED' && r.response,
      );
      return {
        prompt: row.prompt,
        topic: row.prompt,
        observable,
        brandMentioned: row.brandPresent,
        brandCited: row.brandCited,
        competitorMentioned:
          row.competitorsPresent.length > 0,
        competitorCited:
          row.competitorsCited.length > 0,
      };
    });
    const metrics = computeAiMetrics(metricRows);
    const topics = metricsByTopic(metricRows);
    const citedDomains = Array.from(
      new Set(
        normalized.flatMap((n) => n.citedDomains),
      ),
    );
    const index = computeVisibilityIndex({
      metrics,
      uniqueCitedDomains: citedDomains.length,
      topicsCovered: topics.filter(
        (t) => !t.metrics.insufficientData,
      ).length,
      topicsTotal: Math.max(topics.length, 1),
    });

    /* Citation + source + competitor layers. */
    const citationGaps = buildCitationGaps({
      prompts: comparison.map((row) => ({
        prompt: row.prompt,
        topic: row.prompt,
        brandMentioned: row.brandPresent,
        brandCited: row.brandCited,
        competitorCited:
          row.competitorsCited.length > 0,
        relevant: true,
      })),
    });
    const citationRecords = normalized.flatMap((n) =>
      n.citedUrls.map((url) => ({
        prompt: n.prompt,
        topic: n.prompt,
        url,
        domain:
          (() => {
            try {
              return new URL(url).hostname
                .toLowerCase()
                .replace(/^www\./, '');
            } catch {
              return url;
            }
          })(),
        customerDomain: ownDomain,
        competitorDomains: competitorNames,
      })),
    );
    const classified = citationRecords.slice(0, 100).map((r) => ({
      ...r,
      class: classifyCitation(r, true),
    }));
    const sourceGraph = buildSourceGraph(
      citationRecords.slice(0, 300),
    );
    const radar = buildCompetitorRadar({
      promptsTotal: comparison.length,
      observations: comparison.flatMap((row) =>
        row.competitorsPresent.map((comp) => ({
          prompt: row.prompt,
          topic: row.prompt,
          competitor: comp,
          mentioned: true,
          cited: row.competitorsCited.length > 0,
          sourceDomain:
            row.competitorsCited[0] ?? null,
        })),
      ),
    });
    const sourceTypes = summarizeSourceTypes(citedDomains);

    /* Why-not-AI for the top gap (crawl-aware). */
    const topGap = gaps.find(
      (g) => g.evidenceState !== 'UNAVAILABLE',
    );
    const readiness = assessReadiness({
      robotsAllowed: null,
      crawlable: latestCrawl ? true : null,
      indexable: null,
      canonicalOk: null,
      statusOk: latestCrawl ? true : null,
      structuredData: null,
      internalLinks: null,
    });
    const whyNot = topGap
      ? (() => {
          const row = comparison.find(
            (c) =>
              normalizeKeyword(c.prompt) ===
              normalizeKeyword(topGap.prompt),
          );
          const checksFor = runWhyNotAiChecks({
            pageExists: null,
            pageCrawlable: latestCrawl ? true : null,
            pageIndexable: null,
            intentMatch: null,
            topicCovered: row ? row.prompts > 0 : null,
            supportingContent: null,
            internalLinks: null,
            competitorSourceStronger:
              (row?.competitorsCited.length ?? 0) > 0
                ? true
                : null,
            competitorRepeatedlyCited:
              (row?.competitorsCited.length ?? 0) > 0
                ? true
                : null,
            comparisonFaqMissing: null,
            freshnessIssue: null,
            citationGap: row
              ? row.brandPresent && !row.brandCited
              : null,
            brandEntityGap: null,
            localEvidenceGap: null,
            thirdPartyGap:
              sourceTypes.length > 0 ? true : null,
          });
          const primary = primaryWhyNotCause(checksFor);
          const diagnosis = diagnoseAiGap({
            gap: topGap,
            hasRelevantPage: false,
            pageAlignedWithPrompt: false,
            competitorRepeatedlyCited:
              (row?.competitorsCited.length ?? 0) > 0,
            topicCoveredAnywhere: (row?.prompts ?? 0) > 0,
            supportingContentExists: false,
            pageIndexable: true,
            observationCount: row?.prompts ?? 0,
          });
          return { checks: checksFor, primary, diagnosis };
        })()
      : null;

    /* Opportunities → roadmap candidates (no fork). */
    const opportunities = buildAiOpportunities({
      prompt: topGap?.prompt ?? '',
      topic: topGap?.topic ?? '',
      targetPage: null,
      flags: topGap
        ? {
            CITATION_GAP: citationGaps.some(
              (g) => g.kind === 'CITATION_GAP',
            ),
            COMPETITOR_SOURCE_GAP: citationGaps.some(
              (g) => g.kind === 'COMPETITOR_SOURCE_GAP',
            ),
            CONTENT_GAP: true,
          }
        : {},
      highValue: topGap?.priority === 'HIGH',
    });
    const roadmapCandidates = topGap
      ? [
          bridgeToRoadmapCandidate({
            gap: topGap,
            diagnosis: whyNot?.diagnosis ?? {
              prompt: topGap.prompt,
              topic: topGap.topic,
              diagnosis: 'INSUFFICIENT_DATA' as const,
              headline: topGap.why,
              evidence: [],
              evidenceState: topGap.evidenceState,
              action: {
                action: 'MONITOR',
                label: 'Monitor',
                href: '/monitoring',
              },
            },
            keyword: topGap.prompt,
            targetPage: null,
          }),
        ]
      : [];

    /* History: first run = baseline. */
    const history =
      checks.length === 0
        ? compareHistory<string>({
            before: [],
            after: [],
            firstRun: true,
          })
        : null;

    const unavailable = [
      ...(!queries.length
        ? [
            {
              key: 'prompts',
              reason: 'No tracked AI prompts yet.',
              unlocks:
                'Generate a prompt set from Prompt Lab to unlock visibility.',
            },
          ]
        : []),
      ...(!checks.some((c) => c.status === 'COMPLETED')
        ? [
            {
              key: 'observations',
              reason: 'No completed AI observations yet.',
              unlocks:
                'Run a tracked prompt to record the first observation.',
            },
          ]
        : []),
    ];

    return {
      website: {
        id: website.id,
        name: website.name,
        url: website.url,
      },
      surfaces: AI_SURFACES.map((s) => ({
        id: s.id,
        displayName: s.displayName,
        availability: s.availability,
        observationMethod: s.observationMethod,
      })),
      biggestOpportunity: topGap
        ? {
            prompt: topGap.prompt,
            why: topGap.why,
            priority: topGap.priority,
            evidenceState: topGap.evidenceState,
          }
        : null,
      metrics,
      index,
      topics: topics.slice(0, 10),
      comparison: comparison.slice(0, 50),
      gaps: gaps.slice(0, 50),
      citationGaps: citationGaps.slice(0, 30),
      citations: classified.slice(0, 50),
      sourceGraph: sourceGraph.slice(0, 20),
      sourceTypes,
      radar: radar.slice(0, 10),
      whyNot,
      opportunities: opportunities.slice(0, 10),
      roadmapCandidates,
      contentGaps: topGap
        ? buildAiContentGaps({
            topic: topGap.topic,
            affectedPrompts: [topGap.prompt],
            targetUrl: null,
            competitorSources:
              comparison[0]?.competitorsCited ?? [],
            citationGap: citationGaps.some(
              (g) => g.kind === 'CITATION_GAP',
            ),
            comparisonGap: false,
            questionGap: false,
            supportGap: false,
          })
        : [],
      brief: topGap
        ? enrichBrief({
            prompts: [topGap.prompt],
            intent: 'COMMERCIAL',
            competitorSources:
              comparison[0]?.competitorsCited ?? [],
            topic: topGap.topic,
            targetPage: null,
          })
        : null,
      readiness,
      answerWorthiness: gradeAnswerWorthiness({
        directAnswer: null,
        questionCoverage: null,
        topicalCoverage: null,
        headingAlignment: null,
        factualClarity: null,
        entityCoverage: null,
        supportingPages: null,
        internalLinks: null,
        structuredData: null,
        freshnessOk: null,
        indexable: null,
        canonicalOk: null,
        crawlable: latestCrawl ? true : null,
      }),
      entityContradictions: findEntityContradictions({
        website: [],
        aiAnswers: [],
      }),
      history,
      recommendations: recommendations.slice(0, 20),
      actions: actions.slice(0, 20),
      progress: {
        total: comparison.length + actions.filter((a) => a.status === 'DONE').length,
        open: comparison.length,
        completed: actions.filter((a) => a.status === 'DONE').length,
        inProgress: actions.filter((a) => a.status === 'IN_PROGRESS').length,
        searchResult: 'Still measuring',
        searchResultNote:
          'Completed actions count finished work. AI mention movement is observed separately — completion alone never implies a citation gain.',
      },
      unavailable,
      trust: {
        source: 'Recorded AI observations + site evidence',
        observationStates: ['VERIFIED', 'OBSERVED', 'INFERRED', 'ESTIMATED', 'UNAVAILABLE'],
        note: 'Every metric names its denominator. INSUFFICIENT_DATA is shown instead of 0% when observations are missing.',
      },
    };
  }

  /*
   * GET /ai-visibility/os/prompt-lab
   * Universe generation from real evidence (tracked
   * queries + Business Brain + competitors + crawl
   * pages), merged with tracked state. Bounded,
   * deduplicated, clustered. No provider calls.
   */
  async getPromptLab(
    organizationId: string,
    websiteId: string,
    filter: {
      query?: string;
      intent?: AiPromptArchetype | null;
      topic?: string | null;
      stage?: AiJourneyStage | null;
      group?: AiPromptGroup | null;
      competitor?: string | null;
      visibilityState?: string | null;
    },
  ): Promise<{
    prompts: LabPrompt[];
    clusters: Array<{
      topic: string;
      prompts: LabPrompt[];
    }>;
    groups: AiPromptGroup[];
    total: number;
  }> {
    const website = await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    const [queries, competitors, crawlPages] =
      await Promise.all([
        this.prisma.aiVisibilityQuery.findMany({
          where: { websiteId, isActive: true },
          take: MAX_QUERIES,
        }),
        this.prisma.competitor.findMany({
          where: { organizationId },
          take: 20,
        }),
        this.prisma.crawlPage.findMany({
          where: {
            crawl: { websiteId, status: 'COMPLETED' },
          },
          select: { url: true, title: true },
          take: 15,
        }),
      ]);
    const tracked = new Set(
      queries.map((q) =>
        q.query.trim().toLowerCase(),
      ),
    );
    const universe = generatePromptUniverse({
      keywords: queries.map((q) => ({
        keyword: q.query,
        intent: q.category,
        topic: q.category,
        pageUrl: null,
      })),
      gscQueries: [],
      competitorTerms: competitors.map((c) => c.name),
      contentPages: crawlPages.map((p) => ({
        url: p.url,
        topic: p.title,
      })),
      business: website.businessBrain
        ? {
            name:
              website.businessBrain.businessName ??
              website.name,
            category:
              website.businessBrain.industry ??
              null,
            locations:
              website.businessBrain.targetLocations ??
              [],
            services:
              website.businessBrain.services ?? [],
            products:
              website.businessBrain.products ?? [],
            audience:
              website.businessBrain.targetAudience ??
              null,
          }
        : { name: website.name },
      maxPrompts: 60,
    });
    const merged: LabPrompt[] = universe.map((p) => ({
      ...p,
      status: tracked.has(
        p.prompt.trim().toLowerCase(),
      )
        ? ('TRACKED' as const)
        : p.status,
    }));
    const filtered = filterLabPrompts(merged, filter);
    return {
      prompts: filtered.slice(0, 100),
      clusters: clusterLabPrompts(filtered).slice(0, 10),
      groups: [
        'CORE',
        'COMMERCIAL',
        'COMPARISON',
        'COMPETITOR',
        'PROBLEM',
        'LOCAL',
        'BRAND',
        'CATEGORY',
        'HIGH_VALUE',
        'CONTENT_GAP',
        'AI_OPPORTUNITY',
      ],
      total: filtered.length,
    };
  }

  /*
   * GET /ai-visibility/os/prompts/detail
   * One prompt: observations → visibility → why →
   * what-to-do → roadmap/action. Strongest screen
   * in RENKOO for a single AI question.
   */
  async getPromptDetail(
    organizationId: string,
    websiteId: string,
    prompt: string,
  ) {
    const website = await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    const text = clean(prompt);
    if (!text)
      throw new NotFoundException('Prompt not found');
    const [queries, checks, competitors] =
      await Promise.all([
        this.prisma.aiVisibilityQuery.findMany({
          where: { websiteId, query: text },
          take: 5,
        }),
        this.prisma.aiVisibilityCheck.findMany({
          where: { websiteId, query: text },
          orderBy: { checkedAt: 'desc' },
          take: 50,
        }),
        this.prisma.competitor.findMany({
          where: { organizationId },
          take: 20,
        }),
      ]);
    const ownDomain = domainOfWebsite(website.url);
    const observations = checks.map((c) =>
      normalizeObservation({
        prompt: c.query,
        surface: c.platform,
        provider: c.platform,
        observationMethod: 'MANUAL_OBSERVATION',
        observedAt: c.checkedAt
          ? c.checkedAt.toISOString()
          : null,
        answerText: c.response,
        brandMentioned: c.mentioned,
        brandNames: [website.name],
        competitorMentions: c.competitorNames ?? [],
        citations: c.citationUrl
          ? [{ url: c.citationUrl }]
          : [],
        checkFailed: c.status === 'FAILED',
      }),
    );
    const brandCited = observations.some((o) =>
      o.citedDomains.some(
        (d) => ownDomain && d === ownDomain,
      ),
    );
    const brandMentioned = observations.some(
      (o) => o.brandMentioned,
    );
    const competitorPresent = observations.some(
      (o) => o.competitorMentions.length > 0,
    );
    const state = resolveVisibilityState({
      brandMentioned,
      brandCited,
      competitorPresent,
      observationCount: observations.filter(
        (o) => o.observationState !== 'UNAVAILABLE',
      ).length,
    });
    const badges = badgesFor({
      brandCited,
      brandMentioned,
      competitorPresent,
      answerType:
        observations[0]?.answerType ?? 'UNKNOWN',
    });
    const sourceDomains = Array.from(
      new Set(
        observations.flatMap((o) => o.citedDomains),
      ),
    );
    return {
      prompt: text,
      tracked: queries.length > 0,
      intent: queries[0]?.category ?? 'UNKNOWN',
      observations: observations.slice(0, 20),
      visibilityState: state,
      badges,
      brandMentioned,
      brandCited,
      competitorMentions: Array.from(
        new Set(
          observations.flatMap(
            (o) => o.competitorMentions,
          ),
        ),
      ).slice(0, 20),
      citations: observations.flatMap((o) =>
        o.citedUrls.map((url) => ({
          url,
          sourceType: sourceTypeOf(url),
        })),
      ).slice(0, 30),
      sources: sourceDomains.slice(0, 20),
      why: runWhyNotAiChecks({
        pageExists: null,
        pageCrawlable: null,
        pageIndexable: null,
        intentMatch: null,
        topicCovered: null,
        supportingContent: null,
        internalLinks: null,
        competitorSourceStronger: competitorPresent
          ? true
          : null,
        competitorRepeatedlyCited: competitorPresent
          ? true
          : null,
        comparisonFaqMissing: null,
        freshnessIssue: null,
        citationGap:
          brandMentioned && !brandCited
            ? true
            : brandCited
              ? false
              : null,
        brandEntityGap: null,
        localEvidenceGap: null,
        thirdPartyGap: null,
      }),
      whatToDo: buildAiOpportunities({
        prompt: text,
        topic: text,
        targetPage: null,
        flags: {
          CITATION_GAP:
            brandMentioned && !brandCited,
          COMPETITOR_SOURCE_GAP: competitorPresent,
          CONTENT_GAP: !brandMentioned,
        } as Partial<
          Record<AiOpportunityKind, boolean>
        >,
        highValue: competitorPresent,
      }),
      competitors: competitors
        .map((c) => c.name)
        .slice(0, 20),
    };
  }

  /*
   * POST /ai-visibility/os/opportunities
   * AI Opportunity → Recommendation (existing rails).
   * Idempotent per (website, type, prompt): re-posts
   * update the open row instead of duplicating. Action
   * creation stays on the existing
   * POST /recommendations/:id/actions path so the
   * AI_GROWTH_ACTIONS allowance gates consistently.
   */
  async createOpportunityRecommendation(
    organizationId: string,
    input: {
      websiteId: string;
      kind: string;
      title: string;
      prompt?: string | null;
      topic?: string | null;
      targetPage?: string | null;
      priority?: 'HIGH' | 'MEDIUM' | 'LOW';
      why?: string | null;
    },
  ) {
    const website = await this.verifyWebsite(
      organizationId,
      input.websiteId,
    );
    const kind = clean(input.kind).toUpperCase() || 'AI_CONTENT_GAP';
    const title =
      clean(input.title).slice(0, 200) ||
      `AI opportunity for ${clean(input.topic) || website.name}`;
    const existing =
      await this.prisma.recommendation.findFirst({
        where: {
          organizationId,
          websiteId: website.id,
          source: 'AI_VISIBILITY',
          type: kind,
          status: { in: ['OPEN', 'IN_PROGRESS'] },
        },
        orderBy: { createdAt: 'desc' },
      });
    const data = {
      organizationId,
      websiteId: website.id,
      source: 'AI_VISIBILITY',
      type: kind,
      title,
      description: clean(input.why).slice(0, 2000) ||
        `AI Search observation for prompt "${clean(input.prompt)}". Re-run the tracked prompt after shipping to measure mention/citation movement.`,
      priority: input.priority ?? 'MEDIUM',
      impact: 'MEDIUM',
      effort: 'MEDIUM',
      actionText: 'Open the AI prompt detail to execute.',
      pageUrl: clean(input.targetPage) || null,
      metadata: {
        aiPrompt: clean(input.prompt) || null,
        aiTopic: clean(input.topic) || null,
        aiTargetPage: clean(input.targetPage) || null,
        measurement:
          'Re-run the tracked prompt / citation observation after the action ships.',
      },
    };
    if (
      existing &&
      existing.title === title &&
      (existing.metadata as Record<string, unknown> | null)?.[
        'aiPrompt'
      ] === data.metadata.aiPrompt
    ) {
      return existing;
    }
    return this.prisma.recommendation.create({ data });
  }
}

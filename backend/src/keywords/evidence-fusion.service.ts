import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { KeywordStrategyService } from './keyword-strategy.service';
import { KeywordRoadmapService } from './keyword-roadmap.service';
import { RankTrackingService } from './rank-tracking.service';
import {
  categoryFor,
  composePageProfile,
  diagnoseWhyNotAi2,
  evidence,
  fuseChanges,
  measurementFor,
  rankHistorySentence,
  selectNextBestAction,
  unavailable,
  whyForAction,
  type ActionCandidate,
  type FusedChange,
  type FusedEvidence,
} from './evidence-fusion';

/*
 * =========================================================
 * EVIDENCE FUSION 1.0 (Phase 8E).
 *
 * ONE bounded read wave over existing systems, composed
 * into explainable decisions. Read-only: no provider
 * calls, no AI credits, no new scores, no new priority
 * system, no duplicated Strategy/Diagnosis/Roadmap/
 * Content/Crawl/AI logic. Bands stay HIGH/MEDIUM/LOW;
 * UNAVAILABLE stays unavailable (never zero); inference
 * is labeled ("Evidence suggests").
 * =========================================================
 */

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function normUrl(value: unknown): string | null {
  const raw = clean(value).toLowerCase();
  return raw || null;
}

@Injectable()
export class EvidenceFusionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly strategyService: KeywordStrategyService,
    private readonly roadmapService: KeywordRoadmapService,
    private readonly rankService: RankTrackingService,
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

  /* ============ evidence summary ============ */

  async getEvidenceSummary(
    organizationId: string,
    websiteId: string,
  ) {
    const website = await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    const [
      strategy,
      roadmap,
      recommendations,
      actions,
      aiQueries,
      aiChecks,
      monitorRuns,
      officialRows,
      agentImports,
      agentRequests,
      crawl,
      rankChanges,
    ] = await Promise.all([
      this.settled(() =>
        this.strategyService.strategy(organizationId, {
          websiteId,
          limit: 50,
        }),
      ),
      this.settled(() =>
        this.roadmapService.getRoadmap(organizationId, {
          websiteId,
          limit: 50,
        }),
      ),
      this.prisma.recommendation.findMany({
        where: {
          organizationId,
          websiteId,
          status: { in: ['OPEN', 'IN_PROGRESS'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.action.findMany({
        where: { organizationId, websiteId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.aiVisibilityQuery.findMany({
        where: { websiteId, isActive: true },
        take: 100,
      }),
      this.prisma.aiVisibilityCheck.findMany({
        where: { websiteId },
        orderBy: { checkedAt: 'desc' },
        take: 200,
      }),
      this.prisma.aiMonitorRun.findMany({
        where: { organizationId, websiteId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.aiOfficialObservation.findMany({
        where: { organizationId, websiteId },
        orderBy: { date: 'desc' },
        take: 100,
      }),
      this.prisma.aiAgentImport.findMany({
        where: { organizationId, websiteId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.aiAgentRequest.findMany({
        where: { organizationId, websiteId },
        orderBy: { observedAt: 'desc' },
        take: 200,
      }),
      this.prisma.crawl.findFirst({
        where: { websiteId, status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
      }),
      /* Phase 11 — rank movement joins the summary. */
      this.settled(() =>
        this.rankService.getChanges(
          organizationId,
          websiteId,
          30,
        ),
      ),
    ]);

    const opportunities =
      (strategy as { opportunities?: unknown[] } | null)
        ?.opportunities ?? [];
    const completedChecks = aiChecks.filter(
      (check) => check.status === 'COMPLETED',
    );
    const mentions = completedChecks.filter(
      (check) => check.mentioned,
    ).length;
    const aiFamilies = Array.from(
      new Set(
        agentRequests.map((row) => row.agentFamily),
      ),
    );
    const health: Array<{
      area: string;
      state: string;
      detail: string;
    }> = [
      {
        area: 'GOOGLE',
        state:
          opportunities.length > 0
            ? 'EVIDENCE'
            : 'NO_EVIDENCE',
        detail: `${opportunities.length} strategy opportunities from verified search demand.`,
      },
      {
        area: 'AI_VISIBILITY',
        state:
          completedChecks.length > 0
            ? 'EVIDENCE'
            : 'NO_EVIDENCE',
        detail: `${mentions}/${completedChecks.length} recorded observations mention the brand.`,
      },
      {
        area: 'AI_AGENT',
        state:
          agentRequests.length > 0
            ? 'EVIDENCE'
            : 'NO_EVIDENCE',
        detail:
          agentRequests.length > 0
            ? `${agentRequests.length} observed agent requests across ${aiFamilies.length} families.`
            : 'No log observations connected.',
      },
      {
        area: 'OFFICIAL',
        state:
          officialRows.length > 0
            ? 'EVIDENCE'
            : 'NO_EVIDENCE',
        detail:
          officialRows.length > 0
            ? `${officialRows.length} official rows (GSC API + imports).`
            : 'No official rows synced or imported.',
      },
    ];

    const rankSummary = rankChanges as {
      events?: Array<{
        keyword: string;
        source: string;
        kind: string;
        statement: string;
      }>;
      keywords?: number;
      total?: number;
    } | null;
    const changes: FusedChange[] = fuseChanges([
      rankSummary?.events
        ? [
            {
              area: 'GOOGLE' as const,
              statement: `Rank movement across ${rankSummary.keywords ?? 0} tracked keywords: ${rankSummary.events.length} observed events.`,
              evidence: [
                evidence(
                  'GSC',
                  'VERIFIED',
                  'Rank history from labeled GSC/SERP/manual observations.',
                ),
              ],
            },
          ]
        : [],
      monitorRuns.length > 0
        ? [
            {
              area: 'AI_VISIBILITY' as const,
              statement: `Latest AI monitoring run: ${monitorRuns[0].status} (${monitorRuns[0].successCount} succeeded, ${monitorRuns[0].failureCount} failed).`,
              evidence: [
                evidence(
                  'AI_MONITORING',
                  'OBSERVED',
                  `Run ${monitorRuns[0].status.toLowerCase()} with ${monitorRuns[0].successCount} successes.`,
                ),
              ],
            },
          ]
        : [],
      agentImports.length > 0
        ? [
            {
              area: 'AI_AGENT' as const,
              statement: `Latest agent import: ${agentImports[0].imported} requests across ${(agentImports[0].families ?? []).length} families.`,
              evidence: [
                evidence(
                  'AI_AGENT_LOG',
                  'OBSERVED',
                  `${agentImports[0].imported} imported requests.`,
                ),
              ],
            },
          ]
        : [],
    ]);

    return {
      website: {
        id: website.id,
        name: website.name,
        url: website.url,
      },
      health,
      biggestOpportunity:
        (roadmap as { doThisFirst?: unknown } | null)
          ?.doThisFirst ?? null,
      counts: {
        strategyOpportunities: opportunities.length,
        openRecommendations: recommendations.length,
        actions: actions.length,
        trackedPrompts: aiQueries.length,
        aiObservations: completedChecks.length,
        monitorRuns: monitorRuns.length,
        officialRows: officialRows.length,
        agentRequests: agentRequests.length,
        rankKeywords:
          (rankChanges as { keywords?: number } | null)
            ?.keywords ?? 0,
        rankEvents:
          (rankChanges as { total?: number } | null)
            ?.total ?? 0,
        lastCrawlAt: crawl?.completedAt ?? null,
      },
      changes,
      trust: {
        note: 'Every claim names its source and state. UNAVAILABLE is shown, never zero. No new scores were computed.',
      },
    };
  }

  /* ============ next best action ============ */

  async getNextBestAction(
    organizationId: string,
    websiteId: string,
  ) {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    const [roadmap, recommendations, actions, ranks] =
      await Promise.all([
        this.settled(() =>
          this.roadmapService.getRoadmap(organizationId, {
            websiteId,
            limit: 50,
          }),
        ),
        this.prisma.recommendation.findMany({
          where: {
            organizationId,
            websiteId,
            status: { in: ['OPEN', 'IN_PROGRESS'] },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        this.prisma.action.findMany({
          where: {
            organizationId,
            websiteId,
            status: { in: ['TODO', 'IN_PROGRESS'] },
          },
          take: 100,
        }),
        /* Phase 11 — rank evidence joins the decision
         * (composition only; read-only, never charged). */
        this.settled(() =>
          this.rankService.getOverview(
            organizationId,
            websiteId,
            { days: 30 },
          ),
        ),
      ]);
    const candidates: ActionCandidate[] =
      this.toCandidates(
        roadmap,
        recommendations,
        ranks,
      );
    const selected =
      selectNextBestAction(candidates);
    if (!selected) {
      return {
        action: null,
        reason:
          'No open evidence-backed recommendation exists. Generate strategy opportunities or track AI prompts to unlock the next move.',
      };
    }
    const linkedAction = actions.find(
      (row) =>
        (selected.recommendationId &&
          row.recommendationId ===
            selected.recommendationId) ||
        (selected.actionId && row.id === selected.actionId),
    );
    return {
      action: {
        category: selected.category,
        title: selected.title,
        keyword: selected.keyword,
        targetPage: selected.targetPage,
        priority: selected.priority,
        measurement: measurementFor(
          selected.category,
        ),
      },
      why: whyForAction(selected),
      evidence: selected.evidence,
      traceability: {
        recommendationId:
          selected.recommendationId,
        recommendationStatus:
          selected.recommendationStatus,
        actionId:
          linkedAction?.id ?? selected.actionId,
        actionStatus:
          linkedAction?.status ??
          selected.actionStatus ??
          'NOT_STARTED',
        note: linkedAction
          ? `Execution tracked as ${linkedAction.status}.`
          : selected.recommendationId
            ? 'Recommendation open — no execution action available yet.'
            : 'No execution action available.',
      },
    };
  }

  private toCandidates(
    roadmap: unknown,
    recommendations: Array<{
      id: string;
      source: string;
      type: string;
      title: string;
      description: string;
      priority: string;
      status: string;
      pageUrl: string | null;
      metadata: unknown;
    }>,
    ranks: {
      keywords?: Array<{
        keyword: string;
        source: string;
        current: number | null;
        previous: number | null;
        movement: string;
        band: string;
        strikingDistance: boolean;
      }>;
    } | null = null,
  ): ActionCandidate[] {
    const candidates: ActionCandidate[] = [];
    const priorities = (
      roadmap as {
        priorities?: Array<{
          kind?: string;
          title?: string;
          keyword?: string | null;
          targetPage?: string | null;
          priority?: string;
          why?: string;
          evidence?: Array<{
            source: string;
            label: string;
            evidenceType: string;
          }>;
          recommendation?: {
            id: string;
            status: string;
          } | null;
          action?: {
            id: string;
            status: string;
          } | null;
        }>;
      } | null
    )?.priorities;
    (priorities ?? []).forEach((item, index) => {
      const category = categoryFor(
        item.kind ?? '',
        'ROADMAP',
      );
      candidates.push({
        id: `roadmap-${index}`,
        category,
        title: item.title ?? 'Roadmap priority',
        keyword: item.keyword ?? null,
        targetPage: item.targetPage ?? null,
        priority:
          item.priority === 'HIGH' ||
          item.priority === 'MEDIUM' ||
          item.priority === 'LOW'
            ? item.priority
            : 'LOW',
        evidence: (item.evidence ?? []).map((ref) =>
          evidence(
            'STRATEGY',
            ref.evidenceType === 'VERIFIED' ||
            ref.evidenceType === 'OBSERVED' ||
            ref.evidenceType === 'INFERRED'
              ? ref.evidenceType
              : 'INFERRED',
            `${ref.source}: ${ref.label}`,
            {
              keyword: item.keyword,
              page: item.targetPage,
            },
          ),
        ),
        recommendationId:
          item.recommendation?.id ?? null,
        recommendationStatus:
          item.recommendation?.status ?? null,
        actionId: item.action?.id ?? null,
        actionStatus: item.action?.status ?? null,
        order: index,
      });
    });
    recommendations.forEach((rec, index) => {
      const meta = (rec.metadata ?? {}) as Record<
        string,
        unknown
      >;
      const keyword =
        typeof meta.aiPrompt === 'string'
          ? meta.aiPrompt
          : typeof meta.query === 'string'
            ? meta.query
            : typeof meta.keyword === 'string'
              ? meta.keyword
              : null;
      const page =
        rec.pageUrl ??
        (typeof meta.aiTargetPage === 'string'
          ? meta.aiTargetPage
          : typeof meta.targetPage === 'string'
            ? meta.targetPage
            : null);
      candidates.push({
        id: `rec-${rec.id}`,
        category: categoryFor(rec.type, rec.source),
        title: rec.title,
        keyword,
        targetPage: page,
        priority:
          rec.priority === 'HIGH' ||
          rec.priority === 'MEDIUM' ||
          rec.priority === 'LOW'
            ? rec.priority
            : 'LOW',
        evidence: [
          evidence(
            rec.source === 'AI_VISIBILITY'
              ? 'AI_VISIBILITY'
              : rec.source === 'CONTENT'
                ? 'CONTENT'
                : 'STRATEGY',
            'OBSERVED',
            `${rec.source} · ${rec.type}: ${rec.description.slice(0, 200)}`,
            { keyword, page },
          ),
        ],
        recommendationId: rec.id,
        recommendationStatus: rec.status,
        actionId: null,
        actionStatus: null,
        order: 100 + index,
      });
    });
    /* Rank evidence enriches matching candidates by
     * keyword — sources stay labeled, movement stays
     * observed-outcome, never causal. */
    const rankByKeyword = new Map(
      (ranks?.keywords ?? []).map((stat) => [
        stat.keyword.trim().toLowerCase(),
        stat,
      ]),
    );
    for (const candidate of candidates) {
      const key = (candidate.keyword ?? '')
        .trim()
        .toLowerCase();
      if (!key) continue;
      const stat = rankByKeyword.get(key);
      if (!stat || stat.current === null) continue;
      candidate.evidence.push(
        evidence(
          stat.source === 'GSC' ? 'GSC' : 'SERP',
          stat.source === 'GSC' ? 'VERIFIED' : 'OBSERVED',
          stat.source === 'GSC'
            ? `Window-average position ${stat.current}${stat.previous !== null ? ` (was ${stat.previous})` : ''} — average, not an exact rank.`
            : `Observed position ${stat.current}${stat.previous !== null ? ` (was ${stat.previous})` : ''} in the configured search context.`,
          { keyword: candidate.keyword },
        ),
      );
      if (stat.strikingDistance) {
        candidate.evidence.push(
          evidence(
            'STRATEGY',
            'INFERRED',
            'Position 4–20: striking distance with meaningful opportunity.',
            { keyword: candidate.keyword },
          ),
        );
      }
    }
    return candidates;
  }

  /* ============ page evidence profile ============ */

  async getEvidenceProfile(
    organizationId: string,
    websiteId: string,
    input: { url?: string; keyword?: string },
  ) {
    const website = await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    void website;
    const page = normUrl(input.url);
    const keyword = clean(input.keyword) || null;
    if (!page && !keyword) {
      throw new Error(
        'url or keyword is required',
      );
    }
    const [
      strategy,
      recommendations,
      actions,
      officialRows,
      agentRows,
      crawl,
    ] = await Promise.all([
      this.settled(() =>
        this.strategyService.strategy(organizationId, {
          websiteId,
          limit: 100,
        }),
      ),
      this.prisma.recommendation.findMany({
        where: {
          organizationId,
          websiteId,
          status: { in: ['OPEN', 'IN_PROGRESS'] },
        },
        take: 100,
      }),
      this.prisma.action.findMany({
        where: { organizationId, websiteId },
        take: 100,
      }),
      this.prisma.aiOfficialObservation.findMany({
        where: {
          organizationId,
          websiteId,
          ...(page ? { pageUrl: page } : {}),
        },
        orderBy: { impressions: 'desc' },
        take: 20,
      }),
      page
        ? this.prisma.aiAgentRequest.findMany({
            where: {
              organizationId,
              websiteId,
              normalizedUrl: page,
            },
            take: 50,
          })
        : Promise.resolve([]),
      this.prisma.crawl.findFirst({
        where: { websiteId, status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
      }),
    ]);
    const opportunities = (
      (strategy as { opportunities?: Array<Record<string, unknown>> } | null)
        ?.opportunities ?? []
    ).filter((opp) => {
      if (page) {
        const target = normUrl(opp.targetPage);
        if (target && target === page) return true;
      }
      if (
        keyword &&
        clean(opp.keyword).toLowerCase() ===
          keyword.toLowerCase()
      ) {
        return true;
      }
      return false;
    });
    const googleFacts: string[] = [];
    const googleEvidence: FusedEvidence[] = [];
    for (const opp of opportunities.slice(0, 5)) {
      const impressions = Number(
        opp.impressions ?? 0,
      );
      const position = Number(opp.position ?? 0);
      googleFacts.push(
        `Ranks #${position > 0 ? position.toFixed(1).replace(/\.0$/, '') : '—'} for “${clean(opp.keyword)}” with ${impressions.toLocaleString('en-US')} impressions.`,
      );
      googleEvidence.push(
        evidence(
          'GSC',
          impressions > 0 ? 'VERIFIED' : 'INFERRED',
          `Strategy opportunity: priority ${clean(opp.priority) || '—'}.`,
          {
            keyword: clean(opp.keyword) || null,
            page,
          },
        ),
      );
    }
    if (officialRows.length > 0) {
      const top = officialRows[0];
      googleFacts.push(
        `Official demand: ${Number(top.impressions ?? 0).toLocaleString('en-US')} impressions${top.clicks !== null ? `, ${top.clicks} clicks` : ''} (VERIFIED Search Console API).`,
      );
      googleEvidence.push(
        evidence(
          'GSC',
          'VERIFIED',
          'Official Search Console demand row.',
          { page, keyword },
        ),
      );
    } else {
      googleEvidence.push(
        unavailable(
          'GSC',
          'No official demand rows synced for this page.',
        ),
      );
    }
    const aiEvidence: FusedEvidence[] = [
      unavailable(
        'AI_VISIBILITY',
        'AI citation evidence unavailable from connected sources for this page scope.',
      ),
    ];
    const technicalEvidence: FusedEvidence[] = [];
    if (crawl && page) {
      const crawlPage =
        await this.prisma.crawlPage.findFirst({
          where: { crawlId: crawl.id, url: page },
          select: {
            url: true,
            statusCode: true,
            robotsIndexable: true,
          },
        });
      if (crawlPage) {
        technicalEvidence.push(
          evidence(
            'CRAWL',
            'OBSERVED',
            `Status ${crawlPage.statusCode ?? '—'}, indexable ${crawlPage.robotsIndexable ?? 'unknown'}.`,
            { page },
          ),
        );
      } else {
        technicalEvidence.push(
          unavailable(
            'CRAWL',
            'Page not present in the latest completed crawl.',
          ),
        );
      }
    } else {
      technicalEvidence.push(
        unavailable(
          'CRAWL',
          'No completed crawl available.',
        ),
      );
    }
    const contentEvidence: FusedEvidence[] =
      opportunities.length > 0
        ? [
            evidence(
              'CONTENT',
              'INFERRED',
              `Mapped topic “${clean((opportunities[0] as Record<string, unknown>).topic) || clean((opportunities[0] as Record<string, unknown>).keyword)}”.`,
              { page, keyword },
            ),
          ]
        : [
            unavailable(
              'CONTENT',
              'No strategy topic mapping for this page.',
            ),
          ];
    const matchingRec = recommendations.find((rec) => {
      if (
        page &&
        rec.pageUrl &&
        normUrl(rec.pageUrl) === page
      ) {
        return true;
      }
      return false;
    });
    const linkedAction = matchingRec
      ? actions.find(
          (row) =>
            row.recommendationId === matchingRec.id,
        )
      : null;
    return composePageProfile({
      page: page ?? keyword ?? 'unknown',
      googleFacts,
      googleEvidence,
      aiFacts: [],
      aiEvidence,
      technicalFacts: [],
      technicalEvidence,
      contentFacts: [],
      contentEvidence,
      opportunity: {
        recommendationId: matchingRec?.id ?? null,
        actionId: linkedAction?.id ?? null,
        priority: matchingRec?.priority ?? null,
        reason: matchingRec
          ? matchingRec.title
          : 'No execution action available.',
        evidence: matchingRec
          ? [
              evidence(
                'STRATEGY',
                'OBSERVED',
                `${matchingRec.source} · ${matchingRec.type}`,
                { page, keyword },
              ),
            ]
          : [],
      },
    });
  }

  /* ============ Why-Not-AI 2.0 ============ */

  async getWhyNotAi(
    organizationId: string,
    websiteId: string,
    input: {
      topic?: string;
      page?: string;
      prompt?: string;
    },
  ) {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    const topic = clean(input.topic);
    const page = normUrl(input.page);
    const prompt = clean(input.prompt);
    const [checks, strategy, agentRows, officialRows, crawl, rankRows] =
      await Promise.all([
        this.prisma.aiVisibilityCheck.findMany({
          where: {
            websiteId,
            ...(prompt ? { query: prompt } : {}),
          },
          orderBy: { checkedAt: 'desc' },
          take: 50,
        }),
        this.settled(() =>
          this.strategyService.strategy(organizationId, {
            websiteId,
            limit: 100,
          }),
        ),
        page
          ? this.prisma.aiAgentRequest.findMany({
              where: {
                organizationId,
                websiteId,
                normalizedUrl: page,
              },
              take: 50,
            })
          : Promise.resolve([]),
        page
          ? this.prisma.aiOfficialObservation.findMany({
              where: {
                organizationId,
                websiteId,
                pageUrl: page,
              },
              take: 10,
            })
          : Promise.resolve([]),
        this.prisma.crawl.findFirst({
          where: { websiteId, status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
        }),
        /* Phase 11 — rank history joins the diagnosis
         * as evidence (composition only; movement is
         * observed, never causal). */
        this.prisma.rankObservation.findMany({
          where: {
            organizationId,
            websiteId,
            ...(topic || prompt
              ? {
                  normalizedKeyword: (
                    topic ||
                    prompt ||
                    ''
                  )
                    .trim()
                    .toLowerCase()
                    .replace(/\s+/g, ' '),
                }
              : {}),
            ...(page ? { url: page } : {}),
          },
          orderBy: { observedAt: 'asc' },
          take: 50,
        }),
      ]);
    const completed = checks.filter(
      (row) => row.status === 'COMPLETED',
    );
    const mentioned =
      completed.length > 0
        ? completed.some((row) => row.mentioned)
        : null;
    const cited =
      completed.length > 0
        ? completed.some((row) => row.citationFound)
        : null;
    const opportunities =
      (strategy as { opportunities?: Array<Record<string, unknown>> } | null)
        ?.opportunities ?? [];
    const topicNorm = topic.toLowerCase();
    const contentCoversTopic =
      topicNorm && opportunities.length > 0
        ? opportunities.some(
            (opp) =>
              clean(opp.topic)
                .toLowerCase()
                .includes(topicNorm) ||
              clean(opp.keyword)
                .toLowerCase()
                .includes(topicNorm),
          )
        : null;
    let crawlable: boolean | null = null;
    let indexable: boolean | null = null;
    let inboundLinks: number | null = null;
    if (crawl && page) {
      const crawlPage =
        await this.prisma.crawlPage.findFirst({
          where: { crawlId: crawl.id, url: page },
          select: { id: true, robotsIndexable: true },
        });
      if (crawlPage) {
        crawlable = true;
        indexable = crawlPage.robotsIndexable;
        inboundLinks =
          await this.prisma.crawlLink.count({
            where: {
              crawlId: crawl.id,
              targetUrl: page,
            },
          });
      }
    }
    const importsExist =
      (await this.prisma.aiAgentImport.count({
        where: { organizationId, websiteId },
      })) > 0;
    const agentSignal =
      agentRows.length === 0
        ? importsExist
          ? ('NOT_OBSERVED' as const)
          : null
        : agentRows.some(
              (row) =>
                row.statusCode !== null &&
                row.statusCode >= 400,
            )
          ? ('ERROR' as const)
          : ('OK' as const);
    const evidenceList: FusedEvidence[] = [
      rankRows.length > 0
        ? evidence(
            rankRows[rankRows.length - 1].source ===
              'GSC'
              ? 'GSC'
              : 'SERP',
            rankRows[rankRows.length - 1].source ===
              'GSC'
              ? 'VERIFIED'
              : 'OBSERVED',
            rankHistorySentence(rankRows),
            {
              topic: topic || null,
              page,
            },
          )
        : unavailable(
            'GSC',
            'No rank observations exist for this topic yet.',
          ),
      completed.length > 0
        ? evidence(
            'AI_VISIBILITY',
            'OBSERVED',
            `${completed.length} recorded observations${mentioned ? ' with brand mentions' : ''}${cited ? ' and citations' : ''}.`,
            { prompt: prompt || null, topic: topic || null },
          )
        : unavailable(
            'AI_VISIBILITY',
            'AI citation evidence unavailable from connected sources.',
          ),
      contentCoversTopic === null
        ? unavailable(
            'CONTENT',
            'No topic coverage evidence available.',
          )
        : evidence(
            'CONTENT',
            'INFERRED',
            contentCoversTopic
              ? 'Strategy evidence suggests the topic is covered.'
              : 'Strategy evidence suggests the topic is not covered.',
            { topic: topic || null, page },
          ),
      crawl
        ? evidence(
            'CRAWL',
            'OBSERVED',
            `Latest completed crawl ${crawl.completedAt?.toISOString() ?? ''}; inbound internal links ${inboundLinks ?? '—'}.`,
            { page },
          )
        : unavailable(
            'CRAWL',
            'No completed crawl available.',
          ),
      agentSignal === null
        ? unavailable(
            'AI_AGENT_LOG',
            'No log observations connected.',
          )
        : evidence(
            'AI_AGENT_LOG',
            'OBSERVED',
            agentSignal === 'ERROR'
              ? 'Observed AI-agent requests indicate repeated error responses.'
              : agentSignal === 'NOT_OBSERVED'
                ? 'No observed AI-agent requests for this page in the available logs.'
                : 'AI-agent requests observed without access errors.',
            { page },
          ),
      officialRows.length > 0
        ? evidence(
            'OFFICIAL_AI',
            'VERIFIED',
            `${officialRows.length} official rows reference this page.`,
            { page },
          )
        : unavailable(
            'OFFICIAL_AI',
            'No official Google/Bing rows for this page.',
          ),
    ];
    return diagnoseWhyNotAi2(
      {
        brandMentioned: mentioned,
        brandCited: cited,
        promptsTracked: prompt ? 1 : 0,
        observations: completed.length,
        contentCoversTopic,
        entityCovered: null,
        internalLinksSupport:
          inboundLinks === null
            ? null
            : inboundLinks > 0,
        pageCrawlable: crawlable,
        pageIndexable: indexable,
        agentAccessSignal: agentSignal,
        officialEvidence: officialRows.length > 0,
      },
      evidenceList,
    );
  }
}

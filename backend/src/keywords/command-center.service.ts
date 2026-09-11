import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { SearchBaselineService } from './search-baseline.service';
import { KeywordRoadmapService } from './keyword-roadmap.service';
import { SearchCaptureService } from './search-capture.service';
import { ContentStrategyService } from './content-strategy.service';
import { RankTrackingService } from './rank-tracking.service';
import { EvidenceFusionService } from './evidence-fusion.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { AiSearchOsService } from 
'../ai-visibility/ai-search-os.service';
import { IntegrationsService } from 
'../integrations/integrations.service';
import { ActionMeasurementService } from 
'../actions/action-measurement.service';
import { CustomerDemandService } from './customer-demand.service';
import { CompetitiveIntelligenceService } from './competitive-intelligence.service';
import {
  CANNOT_MEASURE,
  NO_ACTION_CONFIDENCE_NOTE,
  assessRisk,
  changeStatement,
  healthOf,
  mixedEvidenceStatement,
  normalizeCandidate,
  selectDoThisFirst,
  selectTopOpportunities,
  type ChangeEntry,
  type NormalizedOpportunity,
  type RawCandidate,
} from './command-center';

/*
 * =========================================================
 * SEARCH OPPORTUNITY COMMAND CENTER 1.0 (Phase 17) —
 * read-only composition + decision over existing systems.
 * No new scores, no provider/AI calls, no new persistence,
 * no new billing meters. One bounded Promise.all wave;
 * every leg degrades alone; missing stays UNAVAILABLE.
 *
 * Bounds: opportunities ≤5 surfaced (from ≤40 normalized),
 * changes/risks/wins ≤5, evidence ≤12/opportunity,
 * competitors ≤5, queries/pages/ranks/AI/outcomes ≤200.
 * =========================================================
 */

const MAX_CANDIDATES = 40;

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

@Injectable()
export class CommandCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly baseline: SearchBaselineService,
    private readonly roadmap: KeywordRoadmapService,
    private readonly capture: SearchCaptureService,
    private readonly contentStrategy: ContentStrategyService,
    private readonly ranks: RankTrackingService,
    private readonly fusion: EvidenceFusionService,
    private readonly recommendations: RecommendationsService,
    private readonly aiOs: AiSearchOsService,
    private readonly integrations: IntegrationsService,
    private readonly measurement: ActionMeasurementService,
    private readonly demand: CustomerDemandService,
    private readonly competitive: CompetitiveIntelligenceService,
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

  async getCommandCenter(
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

    const [
      baselineRes,
      roadmapRes,
      captureRes,
      linksRes,
      unifiedRes,
      nbaRes,
      changesRes,
      aiRes,
      leadsRes,
      revenueRes,
      competitorsRes,
      authorityRes,
      localRes,
      connectivityRes,
      surfaceRes,
      recentWorkRes,
      executionRes,
      reviewRes,
      demandRes,
      competitiveRes,
      crawlPairRes,
    ] = await Promise.all([
      this.settled(() =>
        this.baseline.getBaseline(organizationId, {
          websiteId,
          days,
        }),
      ),
      this.settled(() =>
        this.roadmap.getRoadmap(organizationId, {
          websiteId,
          limit: 10,
        }),
      ),
      this.settled(() =>
        this.capture.getSearchCapture(
          organizationId,
          websiteId,
          days,
        ),
      ),
      this.settled(() =>
        this.contentStrategy.getLinkRecommendations(
          organizationId,
          websiteId,
          { limit: 10 },
        ),
      ),
      this.settled(() =>
        this.recommendations.getUnifiedOpportunities(
          organizationId,
          websiteId,
        ),
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
        this.aiOs.getCommandCenter(
          organizationId,
          websiteId,
        ),
      ),
      this.settled(() =>
        this.prisma.lead.findMany({
          where: {
            websiteId,
            /* Phase 41 (P3-12): org-aware relation
             * filter on top of the upstream website(org)
             * check; id-only (only lengths are used). */
            website: { organizationId },
          },
          orderBy: { createdAt: 'desc' },
          take: 200,
          select: { id: true },
        }),
      ),
      this.settled(() =>
        this.prisma.revenue.findMany({
          where: {
            websiteId,
            website: { organizationId },
            status: 'RECOGNIZED',
          },
          orderBy: { recognizedAt: 'desc' },
          take: 200,
          select: { id: true },
        }),
      ),
      this.settled(() =>
        this.prisma.competitor.findMany({
          where: { organizationId, websiteId, isActive: true },
          take: 5,
        }),
      ),
      /* Authority opportunities (existing backlink rail). */
      this.settled(() =>
        this.prisma.backlinkOpportunity.findMany({
          where: {
            websiteId,
            website: { organizationId },
            status: { notIn: ['DISMISSED', 'COMPLETED'] },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ),
      /* Local opportunities (Phase 19, existing local rail). */
      this.settled(() =>
        this.prisma.localQuery.findMany({
          where: { organizationId, websiteId, isActive: true },
          take: 10,
        }),
      ),
      /* Connectivity snapshot (Phase 21, stored metadata
       * only — no provider calls). */
      this.settled(() =>
        this.integrations.getCapabilities(
          organizationId,
          websiteId,
        ),
      ),
      /* AI citation gaps (Phase 22, existing checks). */
      this.settled(() =>
        this.prisma.aiVisibilityCheck.findMany({
          where: {
            websiteId,
            Website: { organizationId },
            status: 'COMPLETED',
            citationFound: false,
          },
          orderBy: { checkedAt: 'desc' },
          take: 10,
        }),
      ),
      /* Recent measured work (Phase 23, one bounded
       * call covering ≤5 actions — no N+1). */
      this.settled(() =>
        this.measurement.getRecentWork(
          organizationId,
          websiteId,
          5,
        ),
      ),
      /* Execution alerts (Phase 28, max 3): completed
       * without verification, recommendations without
       * actions. Existing data only. */
      this.settled(async () => {
        const since = new Date(
          Date.now() - 14 * 24 * 60 * 60 * 1000,
        );
        const [recentDone, openRecs, linkedActions] =
          await Promise.all([
            this.prisma.action.findMany({
              where: {
                organizationId,
                websiteId,
                status: 'DONE',
                completedAt: { gte: since },
              },
              select: { id: true, title: true },
              take: 10,
            }),
            this.prisma.recommendation.findMany({
              where: {
                organizationId,
                websiteId,
                status: 'OPEN',
              },
              select: { id: true, title: true },
              take: 20,
            }),
            this.prisma.action.findMany({
              where: {
                organizationId,
                websiteId,
                recommendationId: { not: null },
              },
              select: { recommendationId: true },
              take: 100,
            }),
          ]);
        const linked = new Set(
          linkedActions.map((row) => row.recommendationId),
        );
        const unlinked = openRecs.filter(
          (row) => !linked.has(row.id),
        );
        const alerts: Array<{
          label: string;
          detail: string;
        }> = [];
        if (recentDone.length > 0)
          alerts.push({
            label: `${recentDone.length} completed action(s) not yet verified`,
            detail:
              'Marked DONE without observed live-page verification. Verify the live change before interpreting outcomes.',
          });
        if (unlinked.length > 0)
          alerts.push({
            label: `${unlinked.length} recommendation(s) have no action yet`,
            detail:
              'Open recommendations without a linked action record.',
          });
        return alerts.slice(0, 3);
      }),
      /* Review queue (Phase 29, max 3): proposals awaiting
       * human approval. Metadata reads only. */
      this.settled(async () => {
        const actions = await this.prisma.action.findMany({
          where: {
            organizationId,
            websiteId,
            status: { notIn: ['DISMISSED'] },
          },
          orderBy: { updatedAt: 'desc' },
          take: 50,
        });
        const queue: Array<Record<string, unknown>> = [];
        for (const action of actions) {
          const meta = (
            action.metadata ?? {}
          ) as Record<string, unknown>;
          const proposals = Array.isArray(meta.proposals)
            ? (meta.proposals as Array<Record<string, unknown>>)
            : [];
          const latest = proposals[proposals.length - 1];
          if (
            latest &&
            (latest.status === 'READY_FOR_REVIEW' ||
              latest.status === 'APPROVED')
          ) {
            queue.push({
              actionId: action.id,
              title: action.title,
              status: latest.status,
              version: latest.version,
            });
          }
          if (queue.length >= 3) break;
        }
        return queue;
      }),
      /* Top customer need hero (Phase 24, one bounded
       * composition call). */
      this.settled(() =>
        this.demand.getCustomerNeeds(
          organizationId,
          websiteId,
          days,
        ),
      ),
      /* Competitive gaps (Phase 27, one bounded call;
       * max 3 candidates survive diversification). */
      this.settled(() =>
        this.competitive.getCompetitiveSummary(
          organizationId,
          websiteId,
          days,
        ),
      ),
      /* Recent crawl pair (Phase 26 digest, bounded
       * title/url comparison — no rescan). */
      this.settled(async () => {
        const crawls = await this.prisma.crawl.findMany({
          where: {
            websiteId,
            website: { organizationId },
            status: 'COMPLETED',
          },
          orderBy: { completedAt: 'desc' },
          take: 2,
          select: { id: true, completedAt: true },
        });
        if (crawls.length === 0) return null;
        const current =
          await this.prisma.crawlPage.findMany({
            where: { crawlId: crawls[0].id },
            select: { url: true, title: true },
            take: 200,
          });
        let previous: Array<{
          url: string;
          title: string | null;
        }> = [];
        if (crawls.length > 1) {
          previous =
            await this.prisma.crawlPage.findMany({
              where: { crawlId: crawls[1].id },
              select: { url: true, title: true },
              take: 200,
            });
        }
        const normPage = (value: unknown): string | null => {
          let raw = String(value ?? '')
            .trim()
            .toLowerCase();
          if (!raw) return null;
          raw = raw.split('?')[0].split('#')[0];
          raw = raw.replace(/^https?:\/\//, '');
          raw = raw.replace(/^www\./, '');
          raw = raw.replace(/\/+$/, '');
          return raw || null;
        };
        const prevByUrl = new Map(
          previous
            .map((row) => [
              normPage(row.url),
              String(row.title ?? ''),
            ])
            .filter(([key]) => key !== null) as Array<
            [string, string]
          >,
        );
        let changed = 0;
        for (const row of current) {
          const key = normPage(row.url);
          if (!key) continue;
          const prevTitle = prevByUrl.get(key);
          if (
            prevTitle === undefined ||
            prevTitle !== String(row.title ?? '')
          )
            changed++;
        }
        return {
          pagesChanged: changed,
          completedAt: crawls[0].completedAt,
        };
      }),
    ]);

    /* ---- normalize candidates from existing sources ---- */
    const raw: RawCandidate[] = [];

    for (const item of (
      roadmapRes as any
    )?.priorities?.slice(0, 5) ?? []) {
      raw.push({
        id: item.id,
        category: item.kind ?? 'CONTENT',
        title: item.title,
        pageUrl: item.targetPage,
        keyword: item.keyword,
        topic: item.topic,
        priority: item.priority,
        actionType: item.action?.id
          ? 'EXISTING_ACTION'
          : 'ROADMAP_ITEM',
        why: item.why
          ? [clean(item.why)]
          : [],
        evidence: (item.evidence ?? []).map(
          (entry: any) => ({
            source: entry.source ?? 'roadmap',
            label: entry.label ?? 'roadmap evidence',
            evidenceState:
              entry.evidenceType ?? 'OBSERVED',
          }),
        ),
        measurement:
          'Track the roadmap item measurement identity before and after execution.',
        source: 'roadmap',
        status:
          item.executionStatus === 'DONE'
            ? 'OBSERVED'
            : 'READY',
      });
    }

    for (const opp of (
      baselineRes as any
    )?.opportunities?.slice(0, 8) ?? []) {
      raw.push({
        category: opp.kind ?? 'RANKING',
        title: opp.title,
        pageUrl: opp.pageUrl,
        keyword: opp.keyword,
        topic: opp.topic,
        priority: opp.priority,
        actionType: opp.action?.label ?? 'BASELINE_OPPORTUNITY',
        why: opp.why ? [clean(opp.why)] : [],
        evidence: (opp.evidence ?? []).map(
          (label: unknown) => ({
            source: 'search-baseline',
            label: clean(label),
            evidenceState: 'VERIFIED',
          }),
        ),
        measurement:
          'Track position, clicks and CTR for the target query and page.',
        source: 'search-baseline',
        status: 'READY',
      });
    }

    for (const opp of (
      captureRes as any
    )?.commercialOpportunities?.slice(0, 10) ?? []) {
      raw.push({
        category: 'COMMERCIAL_SEARCH',
        title: `Capture commercial demand for "${clean(opp.query)}"`,
        pageUrl: opp.page?.rankingUrl,
        keyword: opp.query,
        priority:
          opp.business?.gap === 'COMMERCIAL_VISIBILITY_GAP'
            ? 'HIGH'
            : 'MEDIUM',
        actionType: opp.suggestedNba ?? 'IMPROVE_EXISTING_PAGE',
        why: [
          clean(opp.pattern?.statement),
          `${opp.google?.impressions ?? 0} impressions observed with CTR ${opp.google?.ctr ?? 'unavailable'}.`,
        ].filter(Boolean),
        evidence: [
          {
            source: 'GSC',
            label: `${opp.google?.impressions ?? 0} impressions, ${opp.google?.clicks ?? 0} clicks`,
            evidenceState: 'VERIFIED',
          },
          {
            source: 'commercial-intent',
            label: `tier ${opp.commercialTier ?? 'unavailable'}`,
            evidenceState:
              opp.commercialTier === 'UNAVAILABLE'
                ? 'UNAVAILABLE'
                : 'INFERRED',
          },
        ],
        measurement:
          'Track CTR, position, clicks and connected leads for this query.',
        source: 'zero-click-commercial',
        status: 'READY',
        businessFlags:
          opp.business?.gap === 'COMMERCIAL_VISIBILITY_GAP'
            ? ['commercial-demand', 'visibility-gap']
            : ['commercial-demand'],
      });
    }

    for (const rec of (
      linksRes as any
    )?.recommendations?.slice(0, 10) ?? []) {
      if ((rec as any)?.action?.exists) continue;
      raw.push({
        category: 'INTERNAL_LINK',
        title: `Link ${clean((rec as any).sourceUrl).slice(0, 60)} → ${clean((rec as any).targetUrl).slice(0, 60)}`,
        pageUrl: (rec as any).targetUrl,
        keyword: (rec as any).keyword,
        topic: (rec as any).topic,
        priority:
          (rec as any).priority ??
          (rec as any).priorityBand ??
          'MEDIUM',
        actionType: 'ADD_INTERNAL_LINK',
        why: clean((rec as any).reason)
          ? [clean((rec as any).reason)]
          : [],
        evidence: (((rec as any).evidenceSources ?? []) as unknown[]).map(
          (source) => ({
            source: 'internal-link-graph',
            label: clean(source),
            evidenceState: 'OBSERVED',
          }),
        ),
        measurement:
          'Re-crawl to verify the link, then watch GSC for the target page.',
        source: 'internal-links',
        status: 'READY',
      });
    }

    for (const opp of (
      unifiedRes as any
    )?.opportunities?.slice(0, 15) ?? []) {
      if (
        ['COMPLETED', 'DISMISSED'].includes(
          clean(opp.status).toUpperCase(),
        )
      )
        continue;
      raw.push({
        id: opp.id,
        category: opp.type ?? 'CONTENT',
        title: opp.title,
        pageUrl: opp.pageUrl,
        keyword: opp.keyword,
        topic: opp.topic,
        priority: opp.priority,
        actionType: opp.type ?? 'RECOMMENDATION',
        why: opp.businessRelevance
          ? [clean(opp.businessRelevance)]
          : [],
        evidence: [
          {
            source: clean(opp.source) || 'recommendations',
            label: clean(opp.description).slice(0, 200),
            evidenceState: 'OBSERVED',
          },
        ],
        measurement:
          'Track the recommendation measurement before and after action.',
        source: clean(opp.source) || 'recommendations',
        status: 'READY',
      });
    }

    const aiBiggest = (aiRes as any)?.biggestOpportunity;
    if (aiBiggest && clean(aiBiggest.prompt)) {
      raw.push({
        category: 'AI_SEARCH',
        title: `Close AI gap for "${clean(aiBiggest.prompt).slice(0, 80)}"`,
        keyword: aiBiggest.prompt,
        priority: aiBiggest.priority ?? 'MEDIUM',
        actionType: 'IMPROVE_AI_VISIBILITY',
        why: clean(aiBiggest.why)
          ? [clean(aiBiggest.why)]
          : [],
        evidence: [
          {
            source: 'ai-search-os',
            label: 'AI command-center opportunity',
            evidenceState: 'OBSERVED',
          },
        ],
        measurement:
          'Rerun tracked prompts and compare mention/citation before and after.',
        source: 'ai-search-os',
        status: 'READY',
        businessFlags: ['ai-visibility-gap'],
      });
    }

    /* Authority opportunities (Phase 18, existing
     * backlink rail — max 2 survive diversification). */
    for (const opp of (
      authorityRes as unknown[] | null
    )?.slice(0, 4) ?? []) {
      const row = opp as Record<string, unknown>;
      raw.push({
        id: clean(row.id),
        category: 'AUTHORITY',
        title: `Pursue link opportunity from ${clean(row.sourceDomain)}`,
        pageUrl: clean(row.targetUrl) || null,
        priority: clean(row.priority) || 'MEDIUM',
        /* Reuses the existing backlink opportunity type
         * as the action identity — no new taxonomy. */
        actionType:
          clean(row.opportunityType) || 'BACKLINK_OPPORTUNITY',
        why: clean(row.reason)
          ? [clean(row.reason).slice(0, 200)]
          : ['Observed link opportunity in stored backlink evidence.'],
        evidence: [
          {
            source: 'backlink-evidence',
            label: `type ${clean(row.opportunityType)} from ${clean(row.sourceDomain)}`,
            evidenceState: 'OBSERVED',
          },
        ],
        measurement:
          'After the action, observe rank, impressions, clicks, CTR and connected outcomes. Never causal proof.',
        source: 'authority',
        status: 'READY',
      });
    }

    /* Local tracked queries (Phase 19, existing
     * local rail — max 2 survive diversification). */
    for (const row of (
      localRes as unknown[] | null
    )?.slice(0, 4) ?? []) {
      const item = row as Record<string, unknown>;
      if (!clean(item.query)) continue;
      raw.push({
        id: clean(item.id),
        category: 'CONTENT',
        title: `Capture local demand for "${clean(item.query).slice(0, 80)}"`,
        keyword: clean(item.query),
        topic: clean(item.category) || null,
        priority: 'MEDIUM',
        actionType: 'LOCAL_QUERY_OPPORTUNITY',
        why: ['Locally tracked query with active monitoring.'],
        evidence: [
          {
            source: 'local-tracking',
            label: `tracked local query in category ${clean(item.category) || 'local-service'}`,
            evidenceState: 'OBSERVED',
          },
        ],
        measurement:
          'Track rank, clicks and CTR for this local query before and after action.',
        source: 'local',
        status: 'READY',
        businessFlags: ['local-demand'],
      });
    }

    /* Cross-surface AI gaps (Phase 22, existing AI
     * checks — max 2 survive diversification). Only rows
     * where a competitor was observed while the brand
     * was not cited. */
    for (const row of (
      ((surfaceRes as unknown[] | null) ?? [])
        .filter(
          (entry) =>
            Array.isArray(
              (entry as Record<string, unknown>)
                .competitorNames,
            ) &&
            (
              (entry as Record<string, unknown>)
                .competitorNames as unknown[]
            ).length > 0,
        )
        .slice(0, 4)
    )) {
      const item = row as Record<string, unknown>;
      if (!clean(item.query)) continue;
      raw.push({
        id: clean(item.id),
        category: 'AI_SEARCH',
        title: `Close the AI citation gap for "${clean(item.query).slice(0, 80)}"`,
        keyword: clean(item.query),
        topic: null,
        priority: 'MEDIUM',
        actionType: 'AI_CITATION_GAP',
        why: [
          'Observed AI visibility gap in monitored prompts.',
          'Competitor observed in the available AI sample.',
        ],
        evidence: [
          {
            source: 'ai-monitoring',
            label: `platform ${clean(item.platform)} observed`,
            evidenceState: 'OBSERVED',
          },
        ],
        measurement:
          'Rerun tracked prompts and compare mention/citation before and after action.',
        source: 'search-everywhere',
        status: 'READY',
        businessFlags: ['ai-visibility-gap'],
      });
    }

    /* Competitive gaps (Phase 27, max 3 candidates).
     * Observed presence only — never superiority. */
    for (const row of (
      ((competitiveRes as Record<string, unknown> | null)
        ?.gaps as unknown[]) ??
      []
    ).slice(0, 3)) {
      const item = row as Record<string, unknown>;
      const action = clean(item.action);
      raw.push({
        category: 'COMMERCIAL_SEARCH',
        title: `Respond to competitive gap: ${clean(item.detail).slice(0, 90)}`,
        keyword: null,
        topic: clean(item.need) || null,
        priority: 'MEDIUM',
        actionType: action || 'IMPROVE_PAGE',
        why: [
          clean(item.detail).slice(0, 200),
          'Competitor observed in available evidence; own response uses existing rails.',
        ],
        evidence: [
          {
            source: 'competitive-intelligence',
            label: `gap ${clean(item.gap)}`,
            evidenceState: clean(item.evidenceState) || 'OBSERVED',
          },
        ],
        measurement:
          'Track rank, AI citation and recorded outcomes before and after action.',
        source: 'competitive',
        status: 'READY',
        businessFlags: ['competitive-gap'],
      });
    }

    const normalized: NormalizedOpportunity[] = raw
      .map(normalizeCandidate)
      .filter(
        (opp): opp is NormalizedOpportunity =>
          opp !== null,
      )
      .slice(0, MAX_CANDIDATES);

    const topOpportunities =
      selectTopOpportunities(normalized, 5);
    const withConflictNotes = topOpportunities.map(
      (opp) => ({
        ...opp,
        conflictNote: mixedEvidenceStatement(opp),
      }),
    );

    const nbaAction = (nbaRes as any)?.action ?? null;
    const doThisFirst = selectDoThisFirst(
      topOpportunities,
      nbaAction
        ? {
            category: nbaAction.category,
            title: nbaAction.title,
            keyword: nbaAction.keyword,
            targetPage: nbaAction.targetPage,
            priority: nbaAction.priority,
          }
        : null,
    );

    /* ---- what changed (≤5, observed only) ---- */
    const changes: ChangeEntry[] = [];
    const rankChanges = (
      (changesRes as any)?.changes ??
      (changesRes as any)?.events ??
      []
    ).slice(0, 5);
    for (const change of rankChanges) {
      changes.push({
        kind: 'RANK',
        direction:
          clean(change.direction).toUpperCase() ===
            'DOWN' ||
          Number(change.delta) < 0
            ? 'DECLINED'
            : 'IMPROVED',
        label: clean(change.keyword) || 'Tracked keyword',
        detail: `Position ${change.position ?? change.current ?? 'unavailable'} observed.`,
      });
      if (changes.length >= 5) break;
    }
    const baselineWinners = (
      (baselineRes as any)?.winners ?? []
    ).slice(0, 2);
    for (const winner of baselineWinners) {
      if (changes.length >= 5) break;
      changes.push({
        kind: 'CTR',
        direction: 'IMPROVED',
        label: clean(winner.query) || 'Query',
        detail: 'Clicks improved versus the previous period (OBSERVED).',
      });
    }

    /* ---- at risk (≤5, no score) ---- */
    const risks: Array<{
      label: string;
      state: 'AT_RISK' | 'WATCH' | 'NO_EVIDENCE';
      detail: string;
    }> = [];
    const losers = (
      (baselineRes as any)?.losers ?? []
    ).slice(0, 3);
    for (const loser of losers) {
      risks.push({
        label: clean(loser.query) || 'Query',
        state: assessRisk({
          rankingDeclined: true,
          ctrDeclined: null,
          aiCitationLost: null,
          commercialWeak: null,
          hasEvidence: true,
        }),
        detail:
          'Ranking declined in the current window. Observed alongside current evidence — never claimed as caused by any action.',
      });
    }
    const aiGaps = (
      (aiRes as any)?.gaps ?? []
    ).slice(0, 2);
    for (const gap of aiGaps) {
      if (risks.length >= 5) break;
      risks.push({
        label: clean(gap.prompt ?? gap.topic) || 'AI prompt',
        state: 'WATCH',
        detail: 'AI visibility gap observed with limited evidence.',
      });
    }

    /* ---- working (observed-after-action wording) ---- */
    const working: Array<{
      label: string;
      detail: string;
    }> = [];
    for (const winner of (
      (baselineRes as any)?.winners ?? []
    ).slice(0, 3)) {
      working.push({
        label: clean(winner.query) || 'Query',
        detail:
          'Improvement observed after recent actions. Observed after action — never claimed as caused by it.',
      });
    }
    if ((leadsRes?.length ?? 0) > 0) {
      working.push({
        label: 'Business outcomes',
        detail: `${leadsRes?.length ?? 0} recorded leads with ${(revenueRes?.length ?? 0)} recognized revenue rows. Outcome data as recorded — never estimated.`,
      });
    }

    /* ---- funnel ---- */
    const gscSummary = (baselineRes as any)?.summary;
    const captureSummary = (captureRes as any)?.summary;
    const funnel = [
      {
        stage: 'SEARCH_DEMAND',
        state:
          gscSummary?.impressions != null
            ? 'VERIFIED'
            : 'UNAVAILABLE',
        value: gscSummary?.impressions?.value ?? null,
      },
      {
        stage: 'GOOGLE_VISIBILITY',
        state:
          gscSummary?.avgPosition != null
            ? 'VERIFIED'
            : 'UNAVAILABLE',
        value: gscSummary?.avgPosition?.value ?? null,
      },
      {
        stage: 'CLICK_CAPTURE',
        state:
          gscSummary?.ctr != null
            ? 'VERIFIED'
            : 'UNAVAILABLE',
        value: gscSummary?.ctr?.value ?? null,
      },
      {
        stage: 'AI_VISIBILITY',
        state: aiRes ? 'OBSERVED' : 'UNAVAILABLE',
        value: null,
      },
      {
        stage: 'TRAFFIC',
        state:
          gscSummary?.clicks != null
            ? 'VERIFIED'
            : 'UNAVAILABLE',
        value: gscSummary?.clicks?.value ?? null,
      },
      {
        stage: 'LEADS',
        state:
          (leadsRes?.length ?? 0) > 0
            ? 'OBSERVED'
            : 'UNAVAILABLE',
        value: leadsRes?.length ?? null,
      },
      {
        stage: 'CUSTOMERS',
        state: 'UNAVAILABLE',
        value: null,
      },
      {
        stage: 'REVENUE',
        state:
          (revenueRes?.length ?? 0) > 0
            ? 'OBSERVED'
            : 'UNAVAILABLE',
        value: revenueRes?.length ?? null,
      },
    ];

    /* ---- health (status summaries, not scores) ---- */
    const health = [
      {
        area: 'SEARCH',
        state: healthOf({
          strongSignals: captureSummary?.outcomeConnected ?? 0,
          watchSignals:
            (captureSummary?.highVisibilityLowCapture ?? 0) +
            (captureSummary?.commercialGaps ?? 0),
          riskSignals: losers.length,
          hasEvidence:
            (baselineRes as any)?.gscConnected === true ||
            (captureSummary?.queries ?? 0) > 0,
        }),
      },
      {
        area: 'CONTENT',
        state: healthOf({
          strongSignals:
            (roadmapRes as any)?.progress?.completed ?? 0,
          watchSignals:
            (roadmapRes as any)?.currentState?.candidates ?? 0,
          riskSignals: 0,
          hasEvidence: roadmapRes !== null,
        }),
      },
      {
        area: 'AI',
        state:
          aiRes !== null
            ? ('Observed' as const)
            : ('Unavailable' as const),
      },
      {
        area: 'TECHNICAL',
        state: healthOf({
          strongSignals: 0,
          watchSignals: risks.length,
          riskSignals: 0,
          hasEvidence: baselineRes !== null,
        }),
      },
      {
        area: 'BUSINESS',
        state:
          (revenueRes?.length ?? 0) > 0
            ? 'Connected'
            : (leadsRes?.length ?? 0) > 0
              ? 'Partial'
              : 'Unavailable',
      },
    ];

    const missing: string[] = [];
    if ((baselineRes as any)?.gscConnected !== true)
      missing.push('Connect Google Search Console');
    if (!aiRes)
      missing.push('Configure AI monitoring');
    if ((leadsRes?.length ?? 0) === 0)
      missing.push('Record business outcomes');

    return {
      hero: {
        title: 'Your top growth opportunities',
        count: topOpportunities.length,
        evidenceState:
          topOpportunities.length > 0
            ? 'OBSERVED'
            : 'UNAVAILABLE',
        note:
          topOpportunities.length === 0
            ? 'RENKOO is still learning this website.'
            : 'Opinionated top 5 from existing priorities — never manufactured, never scored.',
      },
      doThisFirst: doThisFirst ?? {
        evidenceState: 'UNAVAILABLE',
        note: NO_ACTION_CONFIDENCE_NOTE,
      },
      topOpportunities: withConflictNotes.map((opp) => ({
        ...opp,
        changeStatements: [],
      })),
      whatChanged: changes.slice(0, 5).map((entry) => ({
        ...entry,
        statement: changeStatement(entry),
      })),
      atRisk: risks.slice(0, 5),
      working: working.slice(0, 5),
      /* What changed since last period (Phase 26, max
       * 3): crawl pair, rank events, AI gaps. Each links
       * to existing detail. No dashboard explosion. */
      changeDigest: (() => {
        const digest: Array<{
          label: string;
          detail: string;
        }> = [];
        const pair = crawlPairRes as {
          pagesChanged?: number;
        } | null;
        if (
          pair !== null &&
          typeof pair.pagesChanged === 'number'
        )
          digest.push({
            label: `${pair.pagesChanged} page(s) changed between recent crawls`,
            detail:
              'Title or presence difference across the two latest completed crawls.',
          });
        const improved = (
          ((changesRes as Record<string, unknown> | null)
            ?.events as unknown[]) ??
          []
        ).filter((entry) =>
          /IMPROVED|NEW/i.test(
            clean(
              (entry as Record<string, unknown>).kind,
            ),
          ),
        ).length;
        if (improved > 0)
          digest.push({
            label: `${improved} keyword(s) improved`,
            detail:
              'Rank improvement observed in tracked history.',
          });
        const aiLost = (
          ((aiRes as Record<string, unknown> | null)
            ?.gaps as unknown[]) ??
          []
        ).length;
        if (aiLost > 0)
          digest.push({
            label: `${aiLost} AI gap(s) observed`,
            detail:
              'AI visibility gap in monitored evidence.',
          });
        return digest.slice(0, 3);
      })(),
      /* What happened after our work (Phase 23): ≤5
       * recent completed actions with observed changes.
       * No scores, no causal claims. */
      recentWork: ((recentWorkRes ?? []) as unknown[]).slice(
        0,
        5,
      ),
      /* Execution alerts (Phase 28, max 3): completed
       * without verification, recommendations without
       * actions. No new dashboard. */
      executionAlerts: (
        (executionRes ?? []) as unknown[]
      ).slice(0, 3),
      /* Review queue (Phase 29, max 3): evidence-backed
       * fixes awaiting human approval. */
      reviewQueue: (
        (reviewRes ?? []) as unknown[]
      ).slice(0, 3),
      /* Hero customer need (Phase 24, max 1): what the
       * customer is trying to decide, with evidence. */
      heroNeed: (() => {
        const top = (
          (demandRes as any)?.topNeeds ?? []
        )[0] as Record<string, unknown> | undefined;
        if (!top) return null;
        return {
          label: clean(top.label),
          need: clean(top.need),
          journey: clean(top.journey),
          topic: clean(top.topic),
          queryCount: Number(top.queryCount) || 0,
          gaps: (top.gaps as string[] ?? []).slice(0, 3),
          evidenceState: 'OBSERVED',
        };
      })(),
      searchToRevenue: funnel,
      health,
      /* Compact data connectivity (Phase 21): stored
       * metadata only. Never overloads the viewport. */
      connectivity: (() => {
        const capabilities = (
          (connectivityRes as any)?.capabilities ?? []
        ) as Array<Record<string, unknown>>;
        const statusOf = (source: string): string => {
          const entry = capabilities.find(
            (row) => row.source === source,
          );
          return clean(entry?.status) || 'UNAVAILABLE';
        };
        const search = statusOf('GOOGLE_SEARCH_CONSOLE');
        const traffic = statusOf('GOOGLE_ANALYTICS');
        const ai = statusOf('AI_MONITORING');
        const local = statusOf('GOOGLE_BUSINESS_PROFILE');
        const authority = statusOf('BACKLINK_PROVIDER');
        return {
          search,
          traffic,
          ai,
          local,
          authority,
          href: `/integrations?websiteId=${website.id}`,
          note: 'Capability states from stored connection metadata. Partial integrations never collapse the Command Center.',
        };
      })(),
      freshness: {
        gsc: (baselineRes as any)?.period?.current ?? null,
        rank: 'latest rank observation window (30d)',
        ai: (aiRes as any)?.generatedAt ?? null,
        crawl: 'latest completed crawl',
        revenue: 'latest recorded outcome',
        note: 'Each source carries its own freshness; no timestamps invented.',
      },
      evidence: {
        sources: [
          ...new Set(
            normalized.flatMap((opp) => opp.sources),
          ),
        ].slice(0, 12),
      },
      cannotMeasure: CANNOT_MEASURE,
      missing,
      competitors: (competitorsRes ?? []).map(
        (row: any) => ({
          name: clean(row.name),
          domain: clean(row.domain),
        }),
      ),
      roadmapHref: `/roadmap?websiteId=${website.id}`,
      baselineHref: `/search-baseline?websiteId=${website.id}`,
      billing: {
        charged: false,
        note: 'Read-only composition over stored evidence. No AI credits, scans, or provider meters consumed.',
      },
    };
  }
}

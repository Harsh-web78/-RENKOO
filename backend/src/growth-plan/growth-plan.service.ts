import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { KeywordRoadmapService } from '../keywords/keyword-roadmap.service';
import { EvidenceFusionService } from '../keywords/evidence-fusion.service';
import { RankTrackingService } from '../keywords/rank-tracking.service';
import { RankIntelligenceService } from '../keywords/rank-intelligence.service';
import { RevenueAttributionService } from '../roi/revenue-attribution.service';
import {
  MAX_BLOCKED,
  MAX_COMPLETED,
  MAX_EVIDENCE_PER_DECISION,
  MAX_NEXT,
  MAX_NOW,
  MAX_WAIT,
  assignSection,
  buildTrace,
  clientWording,
  compareDecisions,
  conflictNote,
  decisionFingerprint,
  decisionTypeForAlert,
  decisionTypeForRankEvent,
  decisionTypeForRecommendation,
  decisionTypeForRoadmapKind,
  gateDecision,
  mapActionReuse,
  noMaterialDecision,
  normalizePriority,
  reuseNote,
  signalConflict,
  stableKey,
  waitNote,
  whyFirst,
  type ActionReuse,
  type Availability,
  type DecisionEvidenceState,
  type DecisionSignals,
  type DecisionStatus,
  type DecisionType,
  type GrowthDecision,
  type PlanSection,
  type PriorityBand,
  type SignalConflict,
} from './growth-decisions';

/*
 * =========================================================
 * UNIFIED GROWTH DECISION ENGINE 1.0 (Phase 34).
 *
 * PURE COMPOSITION SERVICE — no DB tables, no provider
 * calls, no AI calls, no billing, no auto-execution.
 * Reads bounded datasets from existing systems
 * (roadmap, recommendations, actions, rank 1.0/2.0,
 * RANK alerts, Phase 33 attribution, NBA) and returns
 * deterministically ordered GrowthDecisions with
 * WHY_FIRST, evidence states, conflicts, gating, WAIT
 * and NO_MATERIAL_DECISION where appropriate.
 *
 * Tenant isolation on every read. No PII in outputs.
 * =========================================================
 */

const MAX_ROADMAP = 50;
const MAX_RECS = 50;
const MAX_ACTIONS = 100;
const MAX_DONE = 20;
const MAX_ALERTS = 50;

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function normKey(value: unknown): string {
  return clean(value).toLowerCase().replace(/\s+/g, ' ');
}

interface Stub {
  decisionType: DecisionType;
  title: string;
  summary: string;
  priorityBand: PriorityBand;
  existingPriority: PriorityBand | null;
  page: string | null;
  keyword: string | null;
  customerNeed: string | null;
  recommendationId: string | null;
  recommendationStatus: string | null;
  actionId: string | null;
  actionStatus: string | null;
  verificationState: string | null;
  measurementState: string | null;
  primaryEvidence: string;
  supportingEvidence: string[];
  evidenceState: DecisionEvidenceState;
  signals: DecisionSignals;
  conflict: SignalConflict | null;
  waitReasons: string[];
  claims: {
    searchPerformance: boolean;
    aiLoss: boolean;
    trafficRevenue: boolean;
    revenue: boolean;
    technical: boolean;
    serp: boolean;
    competitorAdvantage: boolean;
  };
  traceParts: Record<string, string | null>;
}

@Injectable()
export class GrowthDecisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roadmap: KeywordRoadmapService,
    private readonly fusion: EvidenceFusionService,
    private readonly ranks: RankTrackingService,
    private readonly rankIntel: RankIntelligenceService,
    private readonly attribution: RevenueAttributionService,
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

  /* ============ evidence collection (bounded) ============ */

  private async collect(
    organizationId: string,
    websiteId: string,
  ) {
    const settled = await Promise.allSettled([
      this.roadmap
        .getRoadmap(organizationId, {
          websiteId,
          limit: MAX_ROADMAP,
        })
        .catch(() => null),
      this.prisma.recommendation.findMany({
        where: {
          organizationId,
          websiteId,
          status: { in: ['OPEN', 'IN_PROGRESS'] },
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_RECS,
      }),
      this.prisma.action.findMany({
        where: {
          organizationId,
          websiteId,
          status: { in: ['TODO', 'IN_PROGRESS'] },
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_ACTIONS,
      }),
      this.prisma.action.findMany({
        where: {
          organizationId,
          websiteId,
          status: 'DONE',
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_DONE,
      }),
      this.prisma.monitoringAlert.findMany({
        where: {
          organizationId,
          websiteId,
          active: true,
          status: { in: ['DETECTED', 'ACKNOWLEDGED'] },
        },
        orderBy: { detectedAt: 'desc' },
        take: MAX_ALERTS,
      }),
      this.ranks
        .getChanges(organizationId, websiteId, 30)
        .catch(() => null),
      this.rankIntel
        .getIntelligenceOverview(organizationId, websiteId)
        .catch(() => null),
      this.attribution
        .overview(organizationId, websiteId, 28)
        .catch(() => null),
      this.fusion
        .getNextBestAction(organizationId, websiteId)
        .catch(() => null),
      this.prisma.googleConnection
        .findUnique({ where: { organizationId } })
        .catch(() => null),
    ]);
    const get = <T>(i: number): T | null =>
      settled[i].status === 'fulfilled'
        ? (settled[i] as PromiseFulfilledResult<T>).value
        : null;
    return {
      roadmap: get<any>(0),
      recommendations: get<any[]>(1) ?? [],
      actions: get<any[]>(2) ?? [],
      doneActions: get<any[]>(3) ?? [],
      alerts: get<any[]>(4) ?? [],
      rankChanges: get<any>(5),
      tracking: get<any>(6),
      revenue: get<any>(7),
      nba: get<any>(8),
      google: get<any>(9),
    };
  }

  private async availability(
    organizationId: string,
    websiteId: string,
    evidence: {
      serpObs: number;
      aiChecks: number;
      revenueRows: number;
      competitorRows: number;
      crawlRuns: number;
    },
  ): Promise<Availability> {
    const google = await this.prisma.googleConnection
      .findUnique({ where: { organizationId } })
      .catch(() => null);
    return {
      gsc: Boolean((google as any)?.selectedSiteUrl),
      aiVisibility: evidence.aiChecks > 0,
      ga4: Boolean(
        (google as any)?.selectedAnalyticsProperty,
      ),
      revenueLinkage: evidence.revenueRows > 0,
      crawl: evidence.crawlRuns > 0,
      serp: evidence.serpObs > 0,
      competitor: evidence.competitorRows > 0,
    };
  }

  private async evidenceCounts(
    organizationId: string,
    websiteId: string,
  ) {
    const db = this.prisma as unknown as Record<
      string,
      any
    >;
    const safe = async (fn: () => Promise<number>) => {
      try {
        return await fn();
      } catch {
        return 0;
      }
    };
    const [serpObs, aiChecks, revenueRows, competitorRows, crawlRuns] =
      await Promise.all([
        safe(() =>
          this.prisma.rankObservation.count({
            where: {
              organizationId,
              websiteId,
              source: 'SERP_PROVIDER',
            },
          }),
        ),
        safe(() =>
          (db.aiVisibilityCheck
            ? db.aiVisibilityCheck.count({
                where: { organizationId, websiteId },
              })
            : Promise.resolve(0)),
        ),
        safe(() =>
          this.prisma.revenue.count({ where: { websiteId } }),
        ),
        safe(() =>
          (db.competitor
            ? db.competitor.count({
                where: { organizationId },
              })
            : Promise.resolve(0)),
        ),
        safe(() =>
          (db.crawlRun
            ? db.crawlRun.count({ where: { websiteId } })
            : db.crawl
              ? db.crawl.count({ where: { websiteId } })
              : Promise.resolve(0)),
        ),
      ]);
    return {
      serpObs,
      aiChecks,
      revenueRows,
      competitorRows,
      crawlRuns,
    };
  }

  /* ============ stub builders ============ */

  private matchAction(
    actions: Array<any>,
    keyword: string | null,
    page: string | null,
    recommendationId: string | null,
  ): any | null {
    const nk = normKey(keyword);
    const np = normKey(page);
    for (const a of actions) {
      if (
        recommendationId &&
        (a as any).recommendationId === recommendationId
      ) {
        return a;
      }
    }
    if (!nk && !np) return null;
    return (
      actions.find((a) => {
        const meta = ((a as any).metadata ?? {}) as Record<
          string,
          unknown
        >;
        const ak = normKey(
          meta.strategyKeyword ??
            meta.keyword ??
            meta.query ??
            (a as any).title,
        );
        const ap = normKey(
          meta.targetPage ?? meta.pageUrl ?? (a as any).url,
        );
        return (
          (nk !== '' && ak !== '' && (ak.includes(nk) || nk.includes(ak))) ||
          (np !== '' && ap !== '' && ap === np)
        );
      }) ?? null
    );
  }

  private revenuePages(revenue: any): Set<string> {
    const set = new Set<string>();
    try {
      for (const p of revenue?.pages ?? []) {
        if ((p as any)?.revenueState?.startsWith('PAGE_REVENUE_ATTRIBUTED')) {
          set.add(normKey((p as any).page));
        }
      }
    } catch {
      /* unavailable stays unavailable */
    }
    return set;
  }

  private buildStubs(
    organizationId: string,
    websiteId: string,
    collected: Awaited<ReturnType<typeof this.collect>>,
  ): Stub[] {
    const stubs: Stub[] = [];
    const revenuePages = this.revenuePages(
      (collected.revenue as any)?.pages,
    );
    const nbaKeyword = normKey(
      (collected.nba as any)?.action?.keyword,
    );
    const roadmapItems: Array<any> = Array.isArray(
      (collected.roadmap as any)?.items,
    )
      ? (collected.roadmap as any).items
      : Array.isArray(collected.roadmap)
        ? (collected.roadmap as Array<any>)
        : [];

    /* 1. Roadmap items → decisions. */
    for (const item of roadmapItems.slice(0, MAX_ROADMAP)) {
      const kind = clean(item.kind);
      const keyword = clean(item.keyword) || null;
      const page = clean(item.targetPage) || null;
      const priority = normalizePriority(item.priority);
      const recId = clean(item.recommendation?.id) || null;
      const action = item.action ?? null;
      const actionStatus = action
        ? clean(action.status)
        : clean(item.executionStatus) || null;
      const verificationState =
        actionStatus === 'DONE' ? 'UNVERIFIED' : null;
      const matched =
        action ??
        this.matchAction(
          collected.actions,
          keyword,
          page,
          recId,
        );
      const type = decisionTypeForRoadmapKind(kind);
      const pageRevenue = page
        ? revenuePages.has(normKey(page))
        : false;
      stubs.push({
        decisionType: type,
        title: clean(item.title) || `${type} — ${keyword ?? page ?? 'untitled'}`,
        summary: clean(item.why) || clean(item.title),
        priorityBand: priority,
        existingPriority: priority,
        page,
        keyword,
        customerNeed: clean(item.topic) || keyword,
        recommendationId: recId,
        recommendationStatus:
          clean(item.recommendation?.status) || null,
        actionId: matched ? clean(matched.id) : null,
        actionStatus: matched
          ? clean(matched.status)
          : actionStatus || null,
        verificationState,
        measurementState: null,
        primaryEvidence: `Roadmap ${kind} (existing priority ${priority}).`,
        supportingEvidence: [
          ...(Array.isArray(item.evidence)
            ? item.evidence
                .slice(0, 6)
                .map(
                  (e: any) =>
                    `${clean(e.source)}: ${clean(e.label)}`,
                )
            : []),
          pageRevenue
            ? 'Page carries recorded lead-linked revenue (Phase 33).'
            : '',
          nbaKeyword !== '' && keyword && nbaKeyword === normKey(keyword)
            ? 'Aligned with the current Next Best Action.'
            : '',
        ].filter(Boolean),
        evidenceState: 'OBSERVED',
        signals: {
          hasRevenueRelevance: pageRevenue,
          revenueVerified: pageRevenue,
          existingPriority: priority,
          executionDependency:
            actionStatus === 'DONE' ? 'VERIFY_PENDING' : null,
          customerNeedRelevance:
            priority === 'HIGH'
              ? 'HIGH'
              : priority === 'MEDIUM'
                ? 'MEDIUM'
                : 'LOW',
          searchOpportunity:
            type === 'IMPROVE' || type === 'PROTECT'
              ? priority === 'HIGH'
                ? 'HIGH'
                : 'MEDIUM'
              : null,
          aiOpportunity: null,
          competitiveEvidence: /competitor/i.test(
            JSON.stringify(item.evidence ?? []),
          ),
          contentEvidence: /CREATE|IMPROVE|REFRESH|CONSOLIDATE/.test(
            kind,
          ),
          technicalEvidence: kind === 'FIX_TECHNICAL_BLOCKER',
          internalLinkEvidence:
            kind === 'BUILD_INTERNAL_SUPPORT',
          changeUrgency: null,
          priorityBand: priority,
          evidenceCompleteness:
            (keyword ? 1 : 0) +
            (page ? 1 : 0) +
            (recId ? 1 : 0) +
            ((item.evidence ?? []).length > 0 ? 1 : 0),
        },
        conflict: null,
        waitReasons: [],
        claims: {
          searchPerformance: true,
          aiLoss: false,
          trafficRevenue: pageRevenue,
          revenue: pageRevenue,
          technical: kind === 'FIX_TECHNICAL_BLOCKER',
          serp: true,
          competitorAdvantage: false,
        },
        traceParts: {
          Keyword: keyword,
          Page: page,
          Recommendation: recId,
          Action: matched ? clean(matched.id) : null,
          Revenue: pageRevenue ? 'page-linked revenue' : null,
        },
      });
    }

    /* 2. Open recommendations without roadmap coverage. */
    const coveredRecs = new Set(
      stubs
        .map((s) => s.recommendationId)
        .filter(Boolean) as string[],
    );
    for (const rec of collected.recommendations) {
      if (coveredRecs.has(rec.id)) continue;
      const meta = (rec.metadata ?? {}) as Record<
        string,
        unknown
      >;
      const keyword =
        clean(meta.strategyKeyword ?? meta.keyword ?? meta.query) ||
        null;
      const page =
        clean(rec.pageUrl ?? meta.targetPage ?? meta.pageUrl) ||
        null;
      const priority = normalizePriority(rec.priority);
      const matched = this.matchAction(
        collected.actions,
        keyword,
        page,
        rec.id,
      );
      const type = decisionTypeForRecommendation(rec.type);
      stubs.push({
        decisionType: type,
        title: clean(rec.title) || `${type} recommendation`,
        summary: clean(rec.description).slice(0, 240),
        priorityBand: priority,
        existingPriority: priority,
        page,
        keyword,
        customerNeed: keyword,
        recommendationId: rec.id,
        recommendationStatus: clean(rec.status) || null,
        actionId: matched ? clean(matched.id) : null,
        actionStatus: matched
          ? clean(matched.status)
          : null,
        verificationState:
          matched && clean(matched.status) === 'DONE'
            ? 'UNVERIFIED'
            : null,
        measurementState: null,
        primaryEvidence: `Open recommendation ${clean(rec.type)} (${clean(rec.source)}, ${priority}).`,
        supportingEvidence: [
          `Status ${clean(rec.status) || 'OPEN'} — existing work reused.`,
        ],
        evidenceState: 'OBSERVED',
        signals: {
          hasRevenueRelevance: false,
          revenueVerified: false,
          existingPriority: priority,
          executionDependency:
            matched && clean(matched.status) === 'DONE'
              ? 'VERIFY_PENDING'
              : null,
          customerNeedRelevance: keyword ? 'MEDIUM' : null,
          searchOpportunity: keyword ? 'MEDIUM' : null,
          aiOpportunity: /AI|GEO|CITATION/i.test(
            clean(rec.type) + clean(rec.source),
          )
            ? 'MEDIUM'
            : null,
          competitiveEvidence: /COMPETITOR/i.test(
            clean(rec.source),
          ),
          contentEvidence: /CONTENT|CREATE|REFRESH/i.test(
            clean(rec.type),
          ),
          technicalEvidence: /TECHNICAL|AUDIT|SEO_AUDIT/i.test(
            clean(rec.source) + clean(rec.type),
          ),
          internalLinkEvidence: /LINK/i.test(
            clean(rec.type),
          ),
          changeUrgency: null,
          priorityBand: priority,
          evidenceCompleteness:
            (keyword ? 1 : 0) + (page ? 1 : 0) + 1,
        },
        conflict: null,
        waitReasons: [],
        claims: {
          searchPerformance: true,
          aiLoss: /AI|GEO/i.test(clean(rec.source)),
          trafficRevenue: false,
          revenue: false,
          technical: /TECHNICAL|AUDIT/i.test(clean(rec.source)),
          serp: false,
          competitorAdvantage: false,
        },
        traceParts: {
          Keyword: keyword,
          Page: page,
          Recommendation: rec.id,
          Action: matched ? clean(matched.id) : null,
        },
      });
    }

    /* 3. Active RANK alerts → decisions (dedupe respected
     * upstream; one decision per alert here). */
    for (const alert of collected.alerts) {
      const ev = (alert.evidence ?? {}) as Record<
        string,
        unknown
      >;
      const keyword = clean(ev.keyword) || null;
      const page = clean(ev.rankingUrl) || null;
      const trigger = clean(alert.type);
      const type = decisionTypeForAlert(trigger);
      const priority = normalizePriority(alert.severity);
      const ageDays =
        (Date.now() -
          new Date(alert.detectedAt).getTime()) /
        (24 * 60 * 60 * 1000);
      const matched = this.matchAction(
        collected.actions,
        keyword,
        page,
        null,
      );
      stubs.push({
        decisionType: type,
        title: clean(alert.title) || `${trigger} alert`,
        summary: clean(alert.description).slice(0, 240),
        priorityBand: priority,
        existingPriority: priority,
        page,
        keyword,
        customerNeed: keyword,
        recommendationId: null,
        recommendationStatus: null,
        actionId: matched ? clean(matched.id) : null,
        actionStatus: matched
          ? clean(matched.status)
          : null,
        verificationState: null,
        measurementState: null,
        primaryEvidence: `Meaningful ${trigger} alert (observed ${Number.isFinite(ageDays) ? Math.max(0, Math.floor(ageDays)) : 'unknown'}d ago).`,
        supportingEvidence: [
          'CHANGE ≠ CAUSE — investigation first, existing diagnosis decides.',
        ],
        evidenceState: 'OBSERVED',
        signals: {
          hasRevenueRelevance: false,
          revenueVerified: false,
          existingPriority: priority,
          executionDependency: null,
          customerNeedRelevance: keyword ? 'MEDIUM' : null,
          searchOpportunity: 'HIGH',
          aiOpportunity:
            trigger === 'AI_VISIBILITY_CHANGE'
              ? 'HIGH'
              : null,
          competitiveEvidence:
            trigger === 'COMPETITOR_MOVEMENT',
          contentEvidence: false,
          technicalEvidence: false,
          internalLinkEvidence: false,
          changeUrgency: Number.isFinite(ageDays)
            ? ageDays <= 7
              ? 'HIGH'
              : ageDays <= 28
                ? 'MEDIUM'
                : 'LOW'
            : null,
          priorityBand: priority,
          evidenceCompleteness:
            (keyword ? 1 : 0) + (page ? 1 : 0) + 1,
        },
        conflict: null,
        waitReasons: [],
        claims: {
          searchPerformance: true,
          aiLoss: trigger === 'AI_VISIBILITY_CHANGE',
          trafficRevenue: false,
          revenue: false,
          technical: false,
          serp: true,
          competitorAdvantage:
            trigger === 'COMPETITOR_MOVEMENT',
        },
        traceParts: {
          Keyword: keyword,
          Page: page,
          Recommendation: null,
          Action: matched ? clean(matched.id) : null,
        },
      });
    }

    /* 4. Rank 1.0 change events → decisions. */
    const events: Array<any> = Array.isArray(
      (collected.rankChanges as any)?.events,
    )
      ? (collected.rankChanges as any).events
      : [];
    for (const event of events.slice(0, 20)) {
      const keyword = clean(event.keyword) || null;
      if (
        stubs.some(
          (s) =>
            s.keyword &&
            keyword &&
            normKey(s.keyword) === normKey(keyword) &&
            (s.decisionType === 'RESPOND' ||
              s.decisionType === 'PROTECT'),
        )
      ) {
        continue;
      }
      const kind = clean(event.kind);
      const type = decisionTypeForRankEvent(kind);
      stubs.push({
        decisionType: type,
        title: clean(event.statement).slice(0, 140) || `${kind} — ${keyword}`,
        summary: clean(event.statement).slice(0, 240),
        priorityBand: 'MEDIUM',
        existingPriority: 'MEDIUM',
        page: null,
        keyword,
        customerNeed: keyword,
        recommendationId: null,
        recommendationStatus: null,
        actionId: null,
        actionStatus: null,
        verificationState: null,
        measurementState: null,
        primaryEvidence: `Rank event ${kind} (Phase 26 vocabulary, observed).`,
        supportingEvidence: [],
        evidenceState: 'OBSERVED',
        signals: {
          hasRevenueRelevance: false,
          revenueVerified: false,
          existingPriority: 'MEDIUM',
          executionDependency: null,
          customerNeedRelevance: 'MEDIUM',
          searchOpportunity: 'MEDIUM',
          aiOpportunity: null,
          competitiveEvidence: false,
          contentEvidence: false,
          technicalEvidence: false,
          internalLinkEvidence: false,
          changeUrgency: 'MEDIUM',
          priorityBand: 'MEDIUM',
          evidenceCompleteness: keyword ? 2 : 1,
        },
        conflict: null,
        waitReasons: [],
        claims: {
          searchPerformance: true,
          aiLoss: false,
          trafficRevenue: false,
          revenue: false,
          technical: false,
          serp: true,
          competitorAdvantage: false,
        },
        traceParts: {
          Keyword: keyword,
          Rank: kind,
        },
      });
    }

    return stubs;
  }

  /* ============ finalize: gate, reuse, order ============ */

  private finalize(
    organizationId: string,
    websiteId: string,
    stubs: Stub[],
    availability: Availability,
  ): GrowthDecision[] {
    const byFingerprint = new Map<string, Stub>();
    for (const stub of stubs) {
      const fingerprint = decisionFingerprint({
        organizationId,
        websiteId,
        decisionType: stub.decisionType,
        keyword: stub.keyword,
        page: stub.page,
        recommendationId: stub.recommendationId,
        actionId: stub.actionId,
      });
      const existing = byFingerprint.get(fingerprint);
      if (existing) {
        /* Dedupe: union evidence, strongest priority
         * wins, never two decisions for one thing. */
        existing.supportingEvidence.push(
          ...stub.supportingEvidence,
        );
        if (
          normalizePriority(stub.priorityBand) ===
            'HIGH' &&
          existing.priorityBand !== 'HIGH'
        ) {
          existing.priorityBand = 'HIGH';
          existing.signals.priorityBand = 'HIGH';
        }
        continue;
      }
      byFingerprint.set(fingerprint, stub);
    }

    const decisions: GrowthDecision[] = [];
    for (const [fingerprint, stub] of byFingerprint) {
      const gate = gateDecision(availability, stub.claims);
      const reuse = mapActionReuse({
        actionId: stub.actionId,
        actionStatus: stub.actionStatus,
        verificationState: stub.verificationState,
        measurementState: stub.measurementState,
      });
      const waitReasons = [...stub.waitReasons];
      if (gate.downgradeToInvestigate) {
        waitReasons.push(
          ...gate.blocked.map((b) => `${b} Waiting on evidence.`),
        );
      }
      const blockedReasons =
        reuse === 'DISMISSED_LEFT_ALONE'
          ? []
          : gate.blocked;
      /* Conflicts: revenue relevance without linkage,
       * DONE without verification, verified without
       * measurement. */
      let conflict: SignalConflict | null = null;
      if (
        stub.actionStatus === 'DONE' &&
        stub.verificationState !== 'VERIFIED' &&
        stub.verificationState !== 'PARTIALLY_VERIFIED'
      ) {
        conflict = signalConflict({
          what: 'Action DONE but verification pending',
          sources: ['Action lifecycle', 'Verification'],
          known: 'Execution finished.',
          unknown: 'Whether the change is live.',
          safeNextStep: 'Verify the live change before new work.',
        });
      }
      const evidenceState: GrowthDecision['evidenceState'] =
        gate.blocked.length > 0
          ? 'UNAVAILABLE'
          : stub.evidenceState;
      const status: DecisionStatus =
        blockedReasons.length > 0
          ? 'BLOCKED'
          : reuse === 'VERIFY_EXISTING_ACTION'
            ? 'NEEDS_VERIFICATION'
            : reuse === 'MEASURE_EXISTING_ACTION'
              ? 'NEEDS_MEASUREMENT'
              : gate.downgradeToInvestigate
                ? 'INVESTIGATE'
                : 'READY';
      const nextAction =
        reuse === 'DISMISSED_LEFT_ALONE'
          ? 'Left alone — a dismissed action exists and is never auto-resurrected. Propose anew only with fresh evidence.'
          : status === 'NEEDS_VERIFICATION'
            ? `Verify existing action ${stub.actionId ?? ''} is live, then measure.`
            : status === 'NEEDS_MEASUREMENT'
              ? `Measure existing action ${stub.actionId ?? ''} before new work.`
              : status === 'BLOCKED'
                ? `Unblock: ${blockedReasons[0] ?? 'missing dependency'}.`
                : status === 'INVESTIGATE'
                  ? 'Investigate with existing diagnosis (Why-Not-#1) — no action proposed yet.'
                  : stub.actionId
                    ? `Continue existing action ${stub.actionId} through approval → execution → verification → measurement.`
                    : 'Propose through the governed flow (proposal → approval → execution → verification → measurement).';
      decisions.push({
        fingerprint,
        decisionType: stub.decisionType,
        title: stub.title,
        summary: stub.summary,
        priorityBand: stub.priorityBand,
        existingPriority: stub.existingPriority,
        status,
        primaryEvidence: stub.primaryEvidence,
        supportingEvidence: stub.supportingEvidence.slice(
          0,
          MAX_EVIDENCE_PER_DECISION,
        ),
        evidenceState,
        page: stub.page,
        keyword: stub.keyword,
        customerNeed: stub.customerNeed
          ? `${stub.customerNeed} (INFERRED CUSTOMER NEED where demand evidence is absent)`
          : null,
        existingRecommendationId: stub.recommendationId,
        existingActionId: stub.actionId,
        existingActionStatus: stub.actionStatus,
        actionReuse: reuse,
        verificationState: stub.verificationState,
        measurementState: stub.measurementState,
        nextAction,
        blockedReason:
          blockedReasons.length > 0
            ? blockedReasons.join(' ')
            : null,
        unavailableReason:
          gate.unavailable.length > 0
            ? `Unavailable: ${gate.unavailable.join(', ')}.`
            : null,
        conflict,
        whyFirst: '',
        trace: buildTrace({
          Decision: `${stub.decisionType} — ${stub.title.slice(0, 80)}`,
          'Customer Need': stub.customerNeed,
          Keyword: stub.keyword,
          Rank: stub.signals.searchOpportunity
            ? `opportunity ${stub.signals.searchOpportunity}`
            : null,
          Page: stub.page,
          SERP: availability.serp ? 'observed' : null,
          Recommendation: stub.recommendationId,
          Action: stub.actionId,
          Verification: stub.verificationState,
          Measurement: stub.measurementState,
          Revenue: stub.signals.hasRevenueRelevance
            ? 'page-linked revenue (Phase 33)'
            : null,
        }),
        section: 'NEXT',
      });
    }

    /* Deterministic order: 12-level rank, fingerprint
     * tie-break (stable sort keeps insertion for exact
     * ties; fingerprint comparison is explicit). */
    const orderOf = new Map<string, DecisionSignals>();
    for (const [fp, stub] of byFingerprint) {
      orderOf.set(fp, stub.signals);
    }
    decisions.sort((a, b) => {
      const cmp = compareDecisions(
        orderOf.get(a.fingerprint)!,
        orderOf.get(b.fingerprint)!,
      );
      if (cmp !== 0) return cmp;
      return a.fingerprint < b.fingerprint ? -1 : 1;
    });

    /* WHY_FIRST vs the first excluded decision. */
    const cutoff = decisions[MAX_NOW] ?? null;
    for (let i = 0; i < Math.min(MAX_NOW, decisions.length); i++) {
      const d = decisions[i];
      d.whyFirst = cutoff
        ? whyFirst(
            orderOf.get(d.fingerprint)!,
            orderOf.get(cutoff.fingerprint)!,
          )
        : 'Only material decision in the current evidence set.';
    }

    /* Sections. */
    decisions.forEach((d, index) => {
      const waitReasons: string[] = [];
      if (d.status === 'INVESTIGATE') {
        waitReasons.push(
          'Evidence incomplete — investigation before action.',
        );
      }
      if (d.conflict) {
        waitReasons.push(conflictNote(d.conflict));
      }
      d.section = assignSection({
        blockedReasons: d.blockedReason ? [d.blockedReason] : [],
        waitReasons,
        completed: false,
        orderIndex: index,
      });
      if (d.section === 'WAIT' && waitReasons.length > 0) {
        d.summary = `${d.summary} ${waitNote(waitReasons.slice(0, 2))}`;
      }
    });

    return decisions;
  }

  /* ============ public plan ============ */

  async getPlan(
    organizationId: string,
    websiteId: string,
  ) {
    await this.verifyWebsite(organizationId, websiteId);
    const collected = await this.collect(
      organizationId,
      websiteId,
    );
    const counts = await this.evidenceCounts(
      organizationId,
      websiteId,
    );
    const availability = await this.availability(
      organizationId,
      websiteId,
      counts,
    );
    const stubs = this.buildStubs(
      organizationId,
      websiteId,
      collected,
    );
    const decisions = this.finalize(
      organizationId,
      websiteId,
      stubs,
      availability,
    );
    const completed = await this.completedSection(
      organizationId,
      websiteId,
      collected.doneActions,
    );
    const now = decisions
      .filter((d) => d.section === 'NOW')
      .slice(0, MAX_NOW);
    const next = decisions
      .filter((d) => d.section === 'NEXT')
      .slice(0, MAX_NEXT);
    const wait = decisions
      .filter((d) => d.section === 'WAIT')
      .slice(0, MAX_WAIT);
    const blocked = decisions
      .filter((d) => d.section === 'BLOCKED')
      .slice(0, MAX_BLOCKED);
    if (decisions.length === 0 && completed.length === 0) {
      return {
        websiteId,
        now: [],
        next: [],
        wait: [],
        blocked: [],
        completed,
        material: noMaterialDecision(
          'No open recommendations, actions, alerts, rank changes or roadmap items with supporting evidence.',
        ),
        availability,
        counts,
      };
    }
    return {
      websiteId,
      now,
      next,
      wait,
      blocked,
      completed: completed.slice(0, MAX_COMPLETED),
      material: null,
      availability,
      counts,
      reuseNote:
        'Existing actions reused, never duplicated; dismissed never resurrected.',
    };
  }

  private async completedSection(
    organizationId: string,
    websiteId: string,
    doneActions: Array<any>,
  ) {
    const out: Array<Record<string, unknown>> = [];
    for (const action of doneActions.slice(0, MAX_COMPLETED)) {
      let measurement: string | null = null;
      try {
        const m = (await this.ranks.measureAction(
          organizationId,
          clean(action.id),
        )) as unknown as { outcome?: string };
        measurement = clean(m?.outcome) || null;
      } catch {
        measurement = null;
      }
      out.push({
        actionId: action.id,
        title: action.title,
        status: 'COMPLETED',
        verificationState:
          (action.metadata as any)?.verificationState ??
          'UNVERIFIED',
        measurementState: measurement ?? 'MEASUREMENT_UNAVAILABLE',
        measurement,
        learning:
          'Completed work with verification/measurement status — learning input for the next plan.',
      });
    }
    return out;
  }

  async getNow(organizationId: string, websiteId: string) {
    const plan = await this.getPlan(
      organizationId,
      websiteId,
    );
    return {
      websiteId,
      now: (plan as any).now ?? [],
      why: 'Top 3 decisions by deterministic 12-level evidence ordering — no score.',
    };
  }

  async getDecisions(
    organizationId: string,
    websiteId: string,
    section?: PlanSection,
  ) {
    const plan = await this.getPlan(
      organizationId,
      websiteId,
    );
    const all: GrowthDecision[] = [
      ...((plan as any).now ?? []),
      ...((plan as any).next ?? []),
      ...((plan as any).wait ?? []),
      ...((plan as any).blocked ?? []),
    ];
    return {
      websiteId,
      decisions: section
        ? all.filter((d) => d.section === section)
        : all,
    };
  }

  async getDecision(
    organizationId: string,
    websiteId: string,
    fingerprint: string,
  ) {
    const { decisions } = await this.getDecisions(
      organizationId,
      websiteId,
    );
    const found =
      decisions.find(
        (d) => d.fingerprint === clean(fingerprint),
      ) ?? null;
    if (!found) {
      throw new NotFoundException('Decision not found');
    }
    return {
      ...found,
      reuse: reuseNote(found.actionReuse),
      clientWording: clientWording(found.decisionType),
    };
  }

  async getBlocked(
    organizationId: string,
    websiteId: string,
  ) {
    return this.getDecisions(
      organizationId,
      websiteId,
      'BLOCKED',
    );
  }

  async getCompleted(
    organizationId: string,
    websiteId: string,
  ) {
    const plan = await this.getPlan(
      organizationId,
      websiteId,
    );
    return {
      websiteId,
      completed: (plan as any).completed ?? [],
    };
  }

  /* POST refresh: stateless recompute (read-only —
   * nothing is persisted, nothing is consumed). */
  async refresh(
    organizationId: string,
    websiteId: string,
  ) {
    const plan = await this.getPlan(
      organizationId,
      websiteId,
    );
    const count =
      ((plan as any).now ?? []).length +
      ((plan as any).next ?? []).length +
      ((plan as any).wait ?? []).length +
      ((plan as any).blocked ?? []).length;
    return {
      websiteId,
      refreshedAt: new Date().toISOString(),
      decisions: count,
      completed: ((plan as any).completed ?? []).length,
      note: 'Recomputed from current evidence. Read-only: no tables written, no credits consumed, no actions created.',
    };
  }
}

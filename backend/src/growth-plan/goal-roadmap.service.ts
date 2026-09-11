import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { GrowthDecisionService } from './growth-plan.service';
import { RevenueAttributionService } from '../roi/revenue-attribution.service';
import { RankIntelligenceService } from '../keywords/rank-intelligence.service';
import {
  MAX_HORIZON_ITEMS,
  MAX_LATER_ITEMS,
  alignGoalToDecision,
  assignHorizon,
  classifyWork,
  composeGoal,
  dependencyNote,
  executiveView,
  goalConflict,
  goalProgress,
  horizonNote,
  outcomeChain,
  replanInfo,
  resourceNote,
  roadmapStateFor,
  sequenceItems,
  type BusinessGoal,
  type DependencyKind,
  type GoalAlignment,
  type RoadmapDependency,
  type TimeHorizon,
  type WorkClass,
} from './goal-roadmap';
import type { GrowthDecision } from './growth-decisions';

/*
 * =========================================================
 * BUSINESS GOAL → GROWTH ROADMAP 1.0 (Phase 35).
 *
 * Deterministic composition over Phase 34 decisions,
 * Phase 33 attribution, BusinessBrain goal text and
 * existing roadmap/action states. No tables, no
 * provider calls, no AI calls, no billing, no scores,
 * no fake targets, no fabricated dates.
 *
 * Goals are DERIVED from the configured BusinessBrain
 * primaryGoal (editable through the existing
 * business-brain PATCH). Targets stay TARGET_UNSET
 * unless the user provides them — no target fields
 * are invented.
 * =========================================================
 */

const MAX_DECISIONS = 63;

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function normKey(value: unknown): string {
  return clean(value).toLowerCase().replace(/\s+/g, ' ');
}

export interface RoadmapItem {
  id: string;
  decision: GrowthDecision;
  goalAlignment: GoalAlignment;
  goalExplanation: string;
  whyNow: string;
  horizon: TimeHorizon;
  horizonNote: string;
  workClass: WorkClass;
  dependencies: RoadmapDependency[];
  dependencyNotes: string[];
  state: string;
  verification: string | null;
  measurement: {
    what: string;
    source: string | null;
    window: string;
    baseline: string | null;
    status: string;
  };
  status: string;
  evidenceState: string;
  outcomeChain: string[];
}

@Injectable()
export class GoalRoadmapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: GrowthDecisionService,
    private readonly attribution: RevenueAttributionService,
    private readonly rankIntel: RankIntelligenceService,
  ) {}

  private async website(
    organizationId: string,
    websiteId: string,
  ) {
    return this.prisma.website.findFirst({
      where: {
        id: websiteId,
        organizationId,
        isActive: true,
      },
    });
  }

  async goals(
    organizationId: string,
    websiteId: string,
  ): Promise<{ goals: BusinessGoal[]; note: string }> {
    const site = await this.website(
      organizationId,
      websiteId,
    );
    if (!site) {
      return {
        goals: [
          composeGoal({
            primaryGoal: null,
            hasConfiguredGoal: false,
            observedBaseline: null,
            measurementSource: null,
          }),
        ],
        note: 'Website not found — goal unavailable.',
      };
    }
    const brain = await this.prisma.businessBrain
      .findUnique({ where: { websiteId } })
      .catch(() => null);
    const primaryGoal = clean((brain as any)?.primaryGoal);
    if (!primaryGoal) {
      return {
        goals: [
          composeGoal({
            primaryGoal: null,
            hasConfiguredGoal: false,
            observedBaseline: null,
            measurementSource: null,
          }),
        ],
        note: 'No configured business goal (BusinessBrain.primaryGoal empty — set it in business settings; PATCH /business-brain/:websiteId). Directional roadmap still produced.',
      };
    }
    return {
      goals: [
        composeGoal({
          primaryGoal,
          hasConfiguredGoal: true,
          observedBaseline: null,
          measurementSource: 'Phase 33 attribution where connected',
        }),
      ],
      note: 'Goal reused from existing business configuration — never upgraded beyond CONFIGURED.',
    };
  }

  private async demandMap(
    organizationId: string,
    websiteId: string,
  ): Promise<
    Map<string, { clicks: number | null; leadHint: boolean }>
  > {
    const map = new Map<
      string,
      { clicks: number | null; leadHint: boolean }
    >();
    try {
      const needs = (await this.attribution.needs(
        organizationId,
        websiteId,
        28,
      )) as any;
      for (const n of needs?.needs ?? []) {
        map.set(normKey(n.query), {
          clicks:
            n.gscClicks === null || n.gscClicks === undefined
              ? null
              : Number(n.gscClicks),
          leadHint: Boolean(n.leadHint),
        });
      }
    } catch {
      /* GSC demand unavailable — edges show missing */
    }
    return map;
  }

  private async revenuePages(
    organizationId: string,
    websiteId: string,
  ): Promise<Set<string>> {
    const set = new Set<string>();
    try {
      const pages = (await this.attribution.pages(
        organizationId,
        websiteId,
        28,
      )) as any;
      for (const p of pages?.pages ?? []) {
        if (
          String(p?.revenueState ?? '').startsWith(
            'PAGE_REVENUE_ATTRIBUTED',
          )
        ) {
          set.add(normKey(p.page));
        }
      }
    } catch {
      /* revenue linkage unavailable */
    }
    return set;
  }

  private dependenciesFor(
    decisions: GrowthDecision[],
  ): RoadmapDependency[] {
    const deps: RoadmapDependency[] = [];
    const byPage = new Map<string, GrowthDecision[]>();
    for (const d of decisions) {
      if (!d.page) continue;
      const list = byPage.get(normKey(d.page)) ?? [];
      list.push(d);
      byPage.set(normKey(d.page), list);
    }
    for (const [, group] of byPage) {
      const fixes = group.filter(
        (d) => d.decisionType === 'FIX',
      );
      const connects = group.filter(
        (d) => d.decisionType === 'CONNECT',
      );
      const builders = group.filter((d) =>
        ['IMPROVE', 'CREATE', 'RESPOND'].includes(
          d.decisionType,
        ),
      );
      /* Technical blockers gate page work on the
       * same page (existing system rule). */
      for (const fix of fixes) {
        for (const other of group) {
          if (other.fingerprint === fix.fingerprint) continue;
          if (
            ['IMPROVE', 'CREATE', 'RESPOND'].includes(
              other.decisionType,
            )
          ) {
            deps.push({
              from: fix.fingerprint,
              to: other.fingerprint,
              kind: 'BLOCKS',
              reason:
                'Technical blocker on the same page gates content work (existing execution rule).',
            });
          }
        }
      }
      /* Internal links follow page work on the
       * same page. */
      for (const link of connects) {
        for (const b of builders) {
          deps.push({
            from: b.fingerprint,
            to: link.fingerprint,
            kind: 'FOLLOWS',
            reason:
              'Internal-link support follows the page work it amplifies.',
          });
        }
      }
    }
    /* Measurement follows verification on the same
     * keyword + page. */
    const verifies = decisions.filter(
      (d) => d.decisionType === 'VERIFY',
    );
    const measures = decisions.filter(
      (d) => d.decisionType === 'MEASURE',
    );
    for (const m of measures) {
      for (const v of verifies) {
        if (
          m.keyword &&
          v.keyword &&
          normKey(m.keyword) === normKey(v.keyword) &&
          normKey(m.page) === normKey(v.page)
        ) {
          deps.push({
            from: v.fingerprint,
            to: m.fingerprint,
            kind: 'MEASURE_AFTER',
            reason:
              'Measurement follows verification on the same keyword and page.',
          });
        }
      }
    }
    return deps;
  }

  async roadmap(
    organizationId: string,
    websiteId: string,
  ) {
    const site = await this.website(
      organizationId,
      websiteId,
    );
    if (!site) {
      return {
        websiteId,
        websiteFound: false as const,
        items: [] as RoadmapItem[],
      };
    }
    const [{ goals }, { decisions }, demand, revPages] =
      await Promise.all([
        this.goals(organizationId, websiteId),
        this.plans.getDecisions(organizationId, websiteId),
        this.demandMap(organizationId, websiteId),
        this.revenuePages(organizationId, websiteId),
      ]);
    const goal = goals[0];
    const goalFamily = goal.goalType;
    const scoped = decisions.slice(0, MAX_DECISIONS);
    const deps = this.dependenciesFor(scoped);
    const { ordered, unknownRefs, cycles } = sequenceItems(
      scoped.map((d) => ({ fingerprint: d.fingerprint })),
      deps,
    );
    const orderIndex = new Map(
      ordered.map((o, i) => [o.fingerprint, i]),
    );
    /* Dependency resolution: a dependency counts as
     * resolved when its prerequisite sits earlier in
     * the sequence or is already completed. */
    const items: RoadmapItem[] = [];
    for (const d of scoped) {
      const idx = orderIndex.get(d.fingerprint) ?? 999;
      const incoming = deps.filter(
        (dep) =>
          dep.to === d.fingerprint &&
          dep.kind !== 'OPTIONAL',
      );
      const resolved = incoming.every((dep) => {
        const fromIdx = orderIndex.get(dep.from) ?? 999;
        return fromIdx < idx;
      });
      const blocked =
        d.status === 'BLOCKED' ||
        incoming.some(
          (dep) =>
            dep.kind === 'BLOCKS' &&
            !(
              (orderIndex.get(dep.from) ?? 999) <
              idx
            ),
        );
      const demandHit = d.keyword
        ? demand.get(normKey(d.keyword))
        : undefined;
      const pageRevenue =
        d.page != null &&
        revPages.has(normKey(d.page));
      const aligned = alignGoalToDecision({
        goalFamily,
        decisionType: d.decisionType,
        pageHasDemand:
          demandHit !== undefined ||
          (d.supportingEvidence ?? []).some((e) =>
            /demand|impression|click/i.test(e),
          ),
        needCommercial: Boolean(
          demandHit?.leadHint,
        ),
        hasRecommendation:
          d.existingRecommendationId !== null,
        hasRevenueEvidence: pageRevenue,
        hasTrafficEvidence: (d.supportingEvidence ?? []).some(
          (e) => /traffic|session/i.test(e),
        ),
      });
      const verificationPending =
        d.status === 'NEEDS_VERIFICATION';
      const evidenceWeak =
        d.status === 'INVESTIGATE' ||
        d.evidenceState === 'UNAVAILABLE';
      const workClass = classifyWork({
        decisionType: d.decisionType,
        priorityBand: d.priorityBand,
        hasDependency: incoming.length > 0,
        verificationPending,
        measurementPending:
          d.status === 'NEEDS_MEASUREMENT',
        evidenceWeak,
      });
      const horizon = assignHorizon({
        planOrder: idx,
        hasDependency: incoming.length > 0,
        dependencyResolved: resolved,
        evidenceWeak,
        verificationPending,
        blocked,
      });
      const state = roadmapStateFor({
        actionStatus: d.existingActionStatus,
        verificationState: d.verificationState,
        measurementPending:
          d.status === 'NEEDS_MEASUREMENT',
        blocked: horizon === 'BLOCKED',
        waiting:
          horizon === 'WAIT' || d.status === 'INVESTIGATE',
      });
      const ownDeps = deps.filter(
        (dep) =>
          dep.from === d.fingerprint ||
          dep.to === d.fingerprint,
      );
      const whyNow =
        horizon === 'NOW'
          ? `NOW because: ${d.whyFirst} No unresolved prerequisites.`
          : horizon === 'TIMING_UNCERTAIN'
            ? 'Timing uncertain — evidence or dependency does not support a date.'
            : `${horizonNote(horizon)} Order #${idx + 1} in the dependency sequence.`;
      /* Baseline rank for NOW items only (bounded —
       * deeper items keep MEASUREMENT_UNAVAILABLE). */
      let baseline: string | null = null;
      let measureSource: string | null = null;
      if (horizon === 'NOW' && d.keyword) {
        try {
          const tracked =
            await this.rankIntel.listTracked(
              organizationId,
              websiteId,
              {
                search: d.keyword,
                pageNum: 1,
                pageSize: 1,
              },
            );
          const first = (tracked as any)?.keywords?.[0];
          if (first && first.lastPosition !== null) {
            baseline = `TRACKED POSITION #${first.lastPosition} (${first.device}/${first.country}).`;
            measureSource = 'Rank tracking + GSC + GA4 where connected';
          }
        } catch {
          baseline = null;
        }
      }
      items.push({
        id: d.fingerprint,
        decision: d,
        goalAlignment: aligned.alignment,
        goalExplanation: goalFamily
          ? `${aligned.explanation} Goal: ${goal.goalLabel}.`
          : `Goal unset — ${aligned.explanation}`,
        whyNow,
        horizon,
        horizonNote: horizonNote(horizon),
        workClass,
        dependencies: ownDeps,
        dependencyNotes: ownDeps.map(dependencyNote),
        state,
        verification: d.verificationState,
        measurement: {
          what:
            d.decisionType === 'MEASURE'
              ? 'Outcome of the verified change (rank, traffic, key events where available).'
              : `Effect of the ${d.decisionType} work on rank, traffic and outcomes where available.`,
          source: measureSource,
          window: '28 days',
          baseline,
          status: baseline
            ? 'OBSERVED_CHANGE where movement is recorded, else TEMPORAL_ASSOCIATION.'
            : 'MEASUREMENT_UNAVAILABLE — no baseline recorded yet.',
        },
        status: d.status,
        evidenceState: d.evidenceState,
        outcomeChain: outcomeChain({
          GOAL: goal.goalLabel,
          'CUSTOMER NEED': d.customerNeed,
          'SEARCH DEMAND': demandHit
            ? `${demandHit.clicks ?? 'unknown'} GSC clicks`
            : null,
          'RANK / AI VISIBILITY': baseline,
          PAGE: d.page,
          TRAFFIC: null,
          'KEY EVENT': null,
          LEAD: demandHit?.leadHint
            ? 'recorded lead keyword overlap'
            : null,
          QUALIFICATION: null,
          REVENUE: pageRevenue
            ? 'page-linked recorded revenue'
            : null,
        }),
      });
    }
    /* Horizon buckets (bounded, no duplicates). */
    const seen = new Set<string>();
    const bucket = (horizons: TimeHorizon[], cap: number) =>
      items
        .filter(
          (i) =>
            horizons.includes(i.horizon) &&
            !seen.has(i.id),
        )
        .slice(0, cap)
        .map((i) => {
          seen.add(i.id);
          return i;
        });
    const now = bucket(['NOW'], 3);
    const days30 = bucket(['DAYS_0_30'], MAX_HORIZON_ITEMS);
    const days60 = bucket(['DAYS_31_60'], MAX_HORIZON_ITEMS);
    const days90 = bucket(['DAYS_61_90'], MAX_HORIZON_ITEMS);
    const later = bucket(['LATER'], MAX_LATER_ITEMS);
    const wait = bucket(
      ['WAIT', 'TIMING_UNCERTAIN'],
      MAX_LATER_ITEMS,
    );
    const blockedItems = bucket(['BLOCKED'], MAX_LATER_ITEMS);
    const leftover = items.filter((i) => !seen.has(i.id));
    return {
      websiteId,
      websiteFound: true as const,
      goal,
      now,
      days30,
      days60,
      days90,
      later: [...later, ...leftover.slice(0, MAX_LATER_ITEMS)],
      wait,
      blocked: blockedItems,
      conflicts: this.goalConflicts(
        goal,
        items,
        revPages.size > 0,
      ),
      dependencyHealth: {
        edges: deps.length,
        unknownRefs,
        cycles: cycles.length,
        note:
          cycles.length > 0
            ? 'Dependency cycle detected — items retained in deterministic order; review the cycle before executing.'
            : 'Prerequisites ordered before dependents; ties break by fingerprint.',
      },
      stability: {
        note: 'Positions retained unless priority, dependency or evidence materially changes. Recompute on new evidence; insignificant changes do not reshuffle.',
      },
    };
  }

  private goalConflicts(
    goal: Awaited<ReturnType<typeof this.goals>>['goals'][number],
    items: RoadmapItem[],
    hasRevenue: boolean,
  ) {
    const conflicts: Array<ReturnType<typeof goalConflict>> =
      [];
    const nowFixes = items.filter(
      (i) =>
        i.horizon === 'NOW' && i.decision.decisionType === 'FIX',
    );
    if (
      (goal.goalType === 'LEADS' ||
        goal.goalType === 'REVENUE' ||
        goal.goalType === 'QUALIFIED_LEADS') &&
      nowFixes.length > 0 &&
      !hasRevenue
    ) {
      conflicts.push(
        goalConflict({
          goals: [goal.goalLabel, 'Technical health'],
          affectedDecisions: nowFixes.map((i) => i.id),
          tradeoff:
            'Technical cleanup consumes near-term capacity while the configured goal needs pipeline evidence.',
          evidence:
            'FIX items occupy NOW slots without recorded revenue linkage.',
          safeChoice:
            'Keep one technical prerequisite only if it blocks revenue pages; otherwise defer to DAYS_31_60.',
        }),
      );
    }
    const weakAi = items.filter(
      (i) =>
        i.decision.decisionType === 'INVESTIGATE' &&
        /AI/i.test(i.decision.title) &&
        i.decision.evidenceState === 'UNAVAILABLE',
    );
    if (
      goal.goalType === 'AI_VISIBILITY' &&
      weakAi.length > 0
    ) {
      conflicts.push(
        goalConflict({
          goals: [goal.goalLabel, 'Evidence quality'],
          affectedDecisions: weakAi.map((i) => i.id),
          tradeoff:
            'AI visibility is the goal but AI evidence is unavailable for these items.',
          evidence: 'UNAVAILABLE AI evidence on INVESTIGATE items.',
          safeChoice:
            'Hold AI items in WAIT until AI visibility observations exist; do not force them into 30 days.',
        }),
      );
    }
    return conflicts;
  }

  async roadmapItem(
    organizationId: string,
    websiteId: string,
    id: string,
  ) {
    const plan = await this.roadmap(
      organizationId,
      websiteId,
    );
    if (!plan.websiteFound) {
      return { found: false as const };
    }
    const all = [
      ...plan.now,
      ...plan.days30,
      ...plan.days60,
      ...plan.days90,
      ...plan.later,
      ...plan.wait,
      ...plan.blocked,
    ];
    const found =
      all.find((i) => i.id === clean(id)) ?? null;
    return { found: found !== null, item: found };
  }

  async progress(
    organizationId: string,
    websiteId: string,
  ) {
    const site = await this.website(
      organizationId,
      websiteId,
    );
    if (!site) {
      return {
        websiteId,
        progress: 'INSUFFICIENT_DATA' as const,
        note: 'Website not found.',
      };
    }
    const [plan, counts] = await Promise.all([
      this.roadmap(organizationId, websiteId),
      (async () => {
        const db = this.prisma;
        const [revenue, leads] = await Promise.all([
          db.revenue.count({ where: { websiteId } }).catch(() => 0),
          db.lead.count({ where: { websiteId } }).catch(() => 0),
        ]);
        return { revenue, leads };
      })(),
    ]);
    if (!plan.websiteFound) {
      return {
        websiteId,
        progress: 'INSUFFICIENT_DATA' as const,
        note: 'Website not found.',
      };
    }
    const started =
      plan.now.length > 0 ||
      plan.days30.length > 0;
    const blocked =
      plan.blocked.length > 0 &&
      plan.now.length === 0 &&
      plan.days30.length === 0;
    const progress = goalProgress({
      revenueSourceAvailable: counts.revenue > 0,
      outcomeSourceAvailable:
        counts.leads > 0 || counts.revenue > 0,
      blocked,
      started,
      observedChange: null,
      atRiskEvidence: false,
    });
    return {
      websiteId,
      goal: plan.goal.goalLabel,
      progress,
      progressNote:
        progress === 'INSUFFICIENT_DATA'
          ? 'Revenue source unavailable or no observed change yet — INSUFFICIENT_DATA, not AT_RISK.'
          : `Evidence-based progress: ${progress}.`,
      horizons: {
        now: plan.now.length,
        days30: plan.days30.length,
        days60: plan.days60.length,
        days90: plan.days90.length,
        later: plan.later.length,
        wait: plan.wait.length,
        blocked: plan.blocked.length,
      },
      replan: replanInfo({
        lastUpdatedIso: new Date().toISOString(),
        lastEvidenceChangeIso: null,
        nextReviewIso: null,
      }),
      resources: resourceNote({
        owner: null,
        capacityKnown: false,
      }),
    };
  }

  executive(
    organizationId: string,
    websiteId: string,
  ) {
    return this.roadmap(organizationId, websiteId).then(
      (plan) => {
        if (!plan.websiteFound) {
          return {
            goal: 'No goal configured',
            currentState: 'INSUFFICIENT_DATA',
            nextThree: [],
            blocked: [],
            changed: [],
            measuring: [],
          };
        }
        return executiveView({
          goalLabel: plan.goal.goalLabel,
          progress: 'INSUFFICIENT_DATA',
          nextThree: plan.now.map((i) => ({
            title: i.decision.title,
            nextAction: i.decision.nextAction,
          })),
          blocked: plan.blocked.map(
            (i) =>
              `${i.decision.title} — ${i.decision.blockedReason ?? 'blocked'}`,
          ),
          changed: [],
          measuring: [...plan.days60, ...plan.days90]
            .filter((i) => i.state === 'MEASURING')
            .map((i) => i.decision.title),
        });
      },
    );
  }
}

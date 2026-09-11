import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { GoalRoadmapService } from './goal-roadmap.service';
import { RankTrackingService } from '../keywords/rank-tracking.service';
import {
  MAX_READY,
  MAX_SECTION,
  MAX_TODAY,
  STALE_AFTER_DAYS,
  approvalPack,
  approvalStateFor,
  assignQueueSection,
  blockerNote,
  capacityNote,
  clientApprovalFor,
  compareToday,
  isStaleWork,
  ownerFor,
  queueStatusFor,
  readyGate,
  reconsideration,
  todayReason,
  workFingerprint,
  workTypeFor,
  type ApprovalState,
  type BlockerKind,
  type QueueStatus,
  type TodaySignals,
  type WorkSection,
  type WorkType,
} from './growth-work';
import type { RoadmapItem } from './goal-roadmap.service';

/*
 * =========================================================
 * GOVERNED GROWTH WORK QUEUE 1.0 (Phase 36).
 *
 * Operational composition over EXISTING actions — no new
 * tables, no new lifecycle, no auto-execution, no
 * provider/AI calls, no billing. Reads bounded action,
 * recommendation, roadmap, alert and measurement state;
 * returns deterministic queue sections with TODAY ≤ 5.
 *
 * Existing Action state is the source of truth. Queue
 * states are a read-only mapping. Planning never
 * pretends to be execution.
 * =========================================================
 */

const MAX_ACTIONS = 120;
const MAX_ALERTS = 50;
const MAX_MEASURE_LOOKUPS = 5;

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function normKey(value: unknown): string {
  return clean(value).toLowerCase().replace(/\s+/g, ' ');
}

export interface WorkItem {
  fingerprint: string;
  actionId: string;
  title: string;
  workType: WorkType;
  status: QueueStatus;
  section: WorkSection;
  priorityBand: string;
  goal: string | null;
  goalAlignment: string | null;
  horizon: string | null;
  owner: string;
  capacity: string;
  approval: ApprovalState;
  approvalPack: string[] | null;
  clientApproval: string;
  execution: string | null;
  verification: string | null;
  measurement: string | null;
  blocker: BlockerKind | null;
  blockerNote: string | null;
  dependencies: string[];
  evidence: string[];
  evidenceState: string;
  nextStep: string;
  stale: boolean;
  trace: string[];
}

@Injectable()
export class GrowthWorkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roadmaps: GoalRoadmapService,
    private readonly ranks: RankTrackingService,
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

  private latestProposal(action: any): any | null {
    const proposals = (action?.metadata as any)?.proposals;
    if (!Array.isArray(proposals) || proposals.length === 0) {
      return null;
    }
    return proposals[proposals.length - 1];
  }

  private verificationOf(action: any): string | null {
    const meta = (action?.metadata ?? {}) as Record<
      string,
      unknown
    >;
    const v = clean(meta.verificationState);
    if (v) return v.toUpperCase();
    return clean(action?.status).toUpperCase() === 'DONE'
      ? 'UNVERIFIED'
      : null;
  }

  private async buildItems(
    organizationId: string,
    websiteId: string,
  ): Promise<{
    items: WorkItem[];
    dismissed: Array<Record<string, unknown>>;
    goal: string;
  }> {
    const site = await this.website(
      organizationId,
      websiteId,
    );
    if (!site) {
      return { items: [], dismissed: [], goal: '' };
    }
    const [actions, recommendations, roadmap, alerts] =
      await Promise.all([
        this.prisma.action.findMany({
          where: { organizationId, websiteId },
          orderBy: { updatedAt: 'desc' },
          take: MAX_ACTIONS,
        }),
        this.prisma.recommendation.findMany({
          where: {
            organizationId,
            websiteId,
            status: { in: ['OPEN', 'IN_PROGRESS'] },
          },
          take: 100,
        }),
        this.roadmaps
          .roadmap(organizationId, websiteId)
          .catch(() => null),
        this.prisma.monitoringAlert
          .findMany({
            where: {
              organizationId,
              websiteId,
              active: true,
              source: 'RANK',
            },
            orderBy: { detectedAt: 'desc' },
            take: MAX_ALERTS,
          })
          .catch(() => []),
      ]);
    const recById = new Map(
      (recommendations as Array<any>).map((r) => [r.id, r]),
    );
    const rm: any = roadmap;
    const goal: string = rm?.goal?.goalLabel ?? '';
    const allItems: RoadmapItem[] = rm?.websiteFound
      ? [
          ...(rm.now ?? []),
          ...(rm.days30 ?? []),
          ...(rm.days60 ?? []),
          ...(rm.days90 ?? []),
          ...(rm.later ?? []),
          ...(rm.wait ?? []),
          ...(rm.blocked ?? []),
        ]
      : [];
    const itemByAction = new Map<string, RoadmapItem>();
    for (const item of allItems) {
      const aid = item?.decision?.existingActionId;
      if (aid && !itemByAction.has(aid)) {
        itemByAction.set(aid, item);
      }
    }
    const alertKeywords = new Set(
      ((alerts ?? []) as Array<any>).map((a) =>
        normKey((a.evidence as any)?.keyword),
      ),
    );

    const items: WorkItem[] = [];
    const dismissed: Array<Record<string, unknown>> = [];
    const statusByAction = new Map(
      (actions as Array<any>).map((a) => [
        clean(a.id),
        clean(a.status).toUpperCase(),
      ]),
    );
    /* Action statuses for prerequisite checks. */
    for (const action of actions as Array<any>) {
      const status = clean(action.status).toUpperCase();
      if (status === 'DISMISSED') {
        const meta = (action.metadata ?? {}) as Record<
          string,
          unknown
        >;
        const kw = normKey(
          meta.strategyKeyword ?? meta.keyword ?? meta.query,
        );
        const rec = action.recommendationId
          ? recById.get(action.recommendationId)
          : null;
        const recon = reconsideration({
          actionDismissed: true,
          evidenceMateriallyChanged: Boolean(
            rec && kw !== '' && alertKeywords.has(kw),
          ),
          rulesAllow: Boolean(rec),
        });
        dismissed.push({
          actionId: action.id,
          title: action.title,
          status: 'DISMISSED',
          reconsideration: recon.available
            ? 'RECONSIDERATION_AVAILABLE'
            : 'DISMISSED',
          note: recon.note,
        });
        continue;
      }
      const proposal = this.latestProposal(action);
      const proposalStatus = proposal
        ? clean(proposal.status)
        : null;
      const verification = this.verificationOf(action);
      const approvalRequired =
        clean(action.type).toUpperCase().includes('PUBLISH') ||
        clean(action.type).toUpperCase().includes('CONTENT') ||
        proposal !== null;
      const approval = approvalStateFor(
        proposalStatus,
        approvalRequired,
      );
      const blockedByDep = this.dependencyBlocked(
        action.id,
        itemByAction,
        statusByAction,
      );
      const stale = isStaleWork({
        updatedAtIso: action.updatedAt
          ? new Date(action.updatedAt).toISOString()
          : null,
        status,
      });
      const queueStatus = queueStatusFor({
        actionStatus: status,
        proposalStatus,
        verificationState: verification,
        measurementPending:
          verification === 'VERIFIED' ||
          verification === 'PARTIALLY_VERIFIED',
        blocked:
          blockedByDep !== null ||
          approval === 'DENIED' ||
          stale,
        waiting: false,
      });
      const gate = readyGate({
        hasAction: true,
        dependencySatisfied: blockedByDep === null,
        approvalSatisfied:
          approval === 'APPROVED' ||
          approval === 'NOT_REQUIRED',
        approvalPending: approval === 'PENDING_REVIEW',
        approvalDenied: approval === 'DENIED',
        evidencePresent: true,
        executionPath: true,
      });
      const item = itemByAction.get(action.id) ?? null;
      const decision = (item as any)?.decision ?? null;
      /* Blocker precedence: explicit lifecycle blocks
       * first, then staleness, then decision-level
       * unavailability. */
      let blocker: BlockerKind | null = null;
      if (approval === 'DENIED') blocker = 'APPROVAL_DENIED';
      else if (approval === 'PENDING_REVIEW')
        blocker = 'APPROVAL_REQUIRED';
      else if (blockedByDep !== null)
        blocker = 'DEPENDENCY_INCOMPLETE';
      else if (stale) blocker = 'STALE_EVIDENCE';
      else if (
        queueStatus === 'VERIFYING' ||
        (status === 'DONE' && verification !== 'VERIFIED')
      )
        blocker = 'VERIFICATION_REQUIRED';
      else if (
        queueStatus === 'MEASURING' &&
        !(item as any)?.measurement?.baseline
      )
        blocker = 'MEASUREMENT_UNAVAILABLE';
      const rec = action.recommendationId
        ? recById.get(action.recommendationId)
        : null;
      const evidence = [
        decision
          ? `Decision ${decision.decisionType} — ${decision.title}`.slice(0, 160)
          : null,
        rec ? `Recommendation ${clean(rec.type)} (${clean(rec.status)}).` : null,
        proposal
          ? `Proposal ${clean(proposal.status)}${proposal.executedAt ? ` executed ${clean(proposal.executedAt)}` : ''}.`
          : 'No proposal yet — governed flow starts with a proposal.',
        stale
          ? `STALE_EVIDENCE — untouched for ${STALE_AFTER_DAYS}+ days; review required.`
          : null,
      ].filter(Boolean) as string[];
      const nextStep =
        queueStatus === 'AWAITING_APPROVAL'
          ? 'Review the proposal pack and approve or reject — execution stays gated.'
          : queueStatus === 'BLOCKED'
            ? `Unblock first: ${blockerNote(blocker ?? 'DEPENDENCY_INCOMPLETE')}`
            : queueStatus === 'VERIFYING'
              ? 'Verify the live change (EXECUTED ≠ VERIFIED), then measure.'
              : queueStatus === 'MEASURING'
                ? 'Record the before/after outcome — execution alone is not success.'
                : queueStatus === 'COMPLETED'
                  ? 'Completed with verification — learning input for replan.'
                  : gate.ready
                    ? 'Pick up: propose (if needed) → approve → execute → verify → measure.'
                    : `Not ready: ${gate.reasons[0] ?? 'waiting on prerequisites'}.`;
      items.push({
        fingerprint: workFingerprint({
          organizationId,
          websiteId,
          actionId: action.id,
        }),
        actionId: action.id,
        title: action.title,
        workType: workTypeFor(
          action.type,
          decision?.decisionType,
        ),
        status: queueStatus,
        section: 'WAITING',
        priorityBand: clean(action.priority) || 'MEDIUM',
        goal: goal || null,
        goalAlignment:
          (item as any)?.goalAlignment ?? null,
        horizon: (item as any)?.horizon ?? null,
        owner: ownerFor((action.metadata as any)?.owner),
        capacity: capacityNote(),
        approval,
        approvalPack:
          approval === 'PENDING_REVIEW' && proposal
            ? approvalPack({
                title: action.title,
                why: clean(decision?.summary ?? action.description).slice(0, 200),
                evidence: decision
                  ? decision.primaryEvidence
                  : 'Existing recommendation evidence.',
                page: decision?.page ?? null,
                changeType: clean(proposal.changeType ?? action.type),
                risk: clean(proposal.riskNotes ?? 'Standard governed change; reversible first where possible.'),
              })
            : null,
        clientApproval: clientApprovalFor({
          proposalStatus,
          actionStatus: status,
          verificationState: verification,
        }),
        execution: proposal
          ? clean(proposal.status)
          : status === 'DONE'
            ? 'EXECUTED (marked done)'
            : null,
        verification,
        measurement: null,
        blocker,
        blockerNote: blocker ? blockerNote(blocker) : null,
        dependencies:
          (item as any)?.dependencyNotes ?? [],
        evidence,
        evidenceState: decision?.evidenceState ?? 'UNKNOWN',
        nextStep,
        stale,
        trace: [
          `GOAL: ${goal || 'unset'}`,
          `DECISION: ${decision ? `${decision.decisionType} — ${decision.title}`.slice(0, 100) : 'direct action (no plan decision)'}`,
          `ROADMAP: ${(item as any)?.horizon ?? 'unscheduled'} / ${(item as any)?.state ?? 'unknown'}`,
          `ACTION: ${action.id} (${status})`,
          `WORK ITEM: ${action.id}`,
          `EXECUTION: ${proposal ? clean(proposal.status) : status === 'DONE' ? 'marked done' : 'not started'}`,
          `VERIFICATION: ${verification ?? 'not started'}`,
          'MEASUREMENT: pending',
        ],
      });
    }

    /* Measurement enrichment for VERIFY/MEASURE items
     * only (bounded — never per-item across the queue). */
    const needMeasure = items.filter(
      (i) => i.status === 'VERIFYING' || i.status === 'MEASURING',
    ).slice(0, MAX_MEASURE_LOOKUPS);
    for (const item of needMeasure) {
      try {
        const m = (await this.ranks.measureAction(
          organizationId,
          item.actionId,
        )) as unknown as { outcome?: string };
        item.measurement = clean(m?.outcome) || null;
      } catch {
        item.measurement = null;
      }
    }
    return { items, dismissed, goal };
  }

  private dependencyBlocked(
    actionId: string,
    itemByAction: Map<string, RoadmapItem>,
    statusByAction: Map<string, string>,
  ): string | null {
    const item = itemByAction.get(actionId);
    if (!item) return null;
    const decisionFp = (item as any)?.decision?.fingerprint;
    /* Incoming BLOCKS/REQUIRES edges: this item is
     * blocked while the prerequisite decision's action
     * is not DONE. No proof of completion → blocked
     * (explicit, never hidden). */
    const statusByDecision = new Map<string, string>();
    for (const [aid, it] of itemByAction) {
      const st = statusByAction.get(aid);
      if (st) {
        statusByDecision.set(
          (it as any)?.decision?.fingerprint ?? aid,
          st,
        );
      }
    }
    void decisionFp;
    const mine =
      (item as any)?.decision?.fingerprint ?? null;
    for (const dep of item.dependencies ?? []) {
      /* Only incoming edges block: prerequisites that
       * must come first (dep.to === this decision).
       * Outgoing edges describe what this item unlocks
       * — they never block it. */
      if (dep.to !== mine) continue;
      if (dep.kind !== 'BLOCKS' && dep.kind !== 'REQUIRES') {
        continue;
      }
      const prereq = statusByDecision.get(dep.from);
      if (prereq !== 'DONE') {
        return dep.reason;
      }
    }
    return null;
  }

  private orderToday(
    items: WorkItem[],
    nowHorizons: Set<string>,
  ): WorkItem[] {
    const candidates = items.filter(
      (i) => i.status === 'READY' || i.status === 'IN_PROGRESS',
    );
    const signals = new Map<string, TodaySignals>();
    for (const item of candidates) {
      signals.set(item.fingerprint, {
        inNow: item.horizon === 'NOW' || nowHorizons.has(item.actionId),
        queueReady: item.status === 'READY',
        dependencyReady: item.blocker !== 'DEPENDENCY_INCOMPLETE',
        priorityBand: (['HIGH', 'MEDIUM', 'LOW'] as const).includes(
          item.priorityBand as 'HIGH',
        )
          ? (item.priorityBand as 'HIGH' | 'MEDIUM' | 'LOW')
          : null,
        goalAlignment: (['DIRECT', 'STRONG', 'CONTEXTUAL', 'WEAK', 'UNKNOWN'] as const).includes(
          item.goalAlignment as 'DIRECT',
        )
          ? (item.goalAlignment as
              | 'DIRECT'
              | 'STRONG'
              | 'CONTEXTUAL'
              | 'WEAK'
              | 'UNKNOWN')
          : null,
        evidenceComplete: item.evidence.length >= 2,
      });
    }
    const sorted = [...candidates].sort((a, b) => {
      const cmp = compareToday(
        signals.get(a.fingerprint)!,
        signals.get(b.fingerprint)!,
      );
      if (cmp !== 0) return cmp;
      return a.fingerprint < b.fingerprint ? -1 : 1;
    });
    const today = sorted.slice(0, 5);
    const second = sorted[5] ?? null;
    for (const item of today) {
      const s = signals.get(item.fingerprint)!;
      (item as { todayReason?: string }).todayReason = second
        ? todayReason(s, signals.get(second.fingerprint)!)
        : 'Top of the ready set by queue ordering.';
    }
    return today;
  }

  async queue(
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
        sections: {},
      };
    }
    const { items, dismissed } = await this.buildItems(
      organizationId,
      websiteId,
    );
    const nowSet = new Set(
      items
        .filter((i) => i.horizon === 'NOW')
        .map((i) => i.actionId),
    );
    const today = this.orderToday(items, nowSet);
    const todayIds = new Set(today.map((t) => t.fingerprint));
    for (const item of items) {
      item.section = assignQueueSection(
        item.status,
        todayIds.has(item.fingerprint),
      );
    }
    const pick = (section: string, cap: number) =>
      items
        .filter((i) => i.section === section)
        .slice(0, cap);
    return {
      websiteId,
      websiteFound: true as const,
      today,
      sections: {
        READY: pick('READY', MAX_READY),
        AWAITING_APPROVAL: pick('AWAITING_APPROVAL', MAX_SECTION),
        IN_PROGRESS: pick('IN_PROGRESS', MAX_SECTION),
        BLOCKED: pick('BLOCKED', MAX_SECTION),
        VERIFY: pick('VERIFY', MAX_SECTION),
        MEASURE: pick('MEASURE', MAX_SECTION),
        COMPLETED: pick('COMPLETED', MAX_SECTION),
      },
      dismissed: dismissed.slice(0, 25),
      counts: {
        today: today.length,
        ready: items.filter((i) => i.section === 'READY').length,
        approval: items.filter((i) => i.section === 'AWAITING_APPROVAL').length,
        inProgress: items.filter((i) => i.section === 'IN_PROGRESS').length,
        blocked: items.filter((i) => i.section === 'BLOCKED').length,
        verify: items.filter((i) => i.section === 'VERIFY').length,
        measure: items.filter((i) => i.section === 'MEASURE').length,
        completed: items.filter((i) => i.section === 'COMPLETED').length,
        dismissed: dismissed.length,
      },
      note: 'Planning is not execution: TODAY items are ready to pick up through the governed flow, never auto-executed.',
    };
  }

  async today(organizationId: string, websiteId: string) {
    const q = await this.queue(organizationId, websiteId);
    if (!q.websiteFound) return q;
    return {
      websiteId,
      today: (q as any).today ?? [],
      why: 'TODAY ≤ 5 by queue ordering: NOW decisions, READY actions, satisfied prerequisites, HIGH priority, goal alignment, evidence, fingerprint tie-break.',
    };
  }

  async section(
    organizationId: string,
    websiteId: string,
    section: string,
  ) {
    const q = await this.queue(organizationId, websiteId);
    if (!q.websiteFound) return q;
    const key = clean(section).toUpperCase();
    if (key === 'TODAY') {
      return { websiteId, items: (q as any).today ?? [] };
    }
    const sections = (q as any).sections ?? {};
    return { websiteId, items: sections[key] ?? [] };
  }

  async detail(
    organizationId: string,
    websiteId: string,
    actionId: string,
  ) {
    const { items } = await this.buildItems(
      organizationId,
      websiteId,
    );
    const found =
      items.find((i) => i.actionId === clean(actionId)) ??
      null;
    if (!found) {
      throw new NotFoundException('Work item not found');
    }
    return {
      ...found,
      detail: {
        what: found.title,
        why: found.evidence[0] ?? 'Existing action evidence.',
        goal: found.goal,
        evidence: found.evidence,
        decision: found.trace[1] ?? '',
        roadmap: found.trace[2] ?? '',
        recommendation: found.trace.find((t) =>
          t.startsWith('ACTION:'),
        )
          ? found.evidence.find((e) =>
              e.startsWith('Recommendation'),
            ) ?? null
          : null,
        action: found.actionId,
        dependency: found.dependencies,
        approval: found.approval,
        approvalPack: found.approvalPack,
        execution: found.execution,
        verification: found.verification,
        measurement: found.measurement,
        blocker: found.blockerNote,
        nextStep: found.nextStep,
      },
    };
  }

  async refresh(
    organizationId: string,
    websiteId: string,
  ) {
    const q = await this.queue(organizationId, websiteId);
    if (!q.websiteFound) return q;
    const total = Object.values(
      ((q as any).counts ?? {}) as Record<string, number>,
    ).reduce((n, v) => n + (Number(v) || 0), 0);
    return {
      websiteId,
      refreshedAt: new Date().toISOString(),
      items: total,
      note: 'Recomputed from current action, roadmap, alert and measurement state. Read-only: no crawl, no DataForSEO, no AI, no credits, no execution.',
    };
  }
}

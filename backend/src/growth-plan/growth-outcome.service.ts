import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ActionMeasurementService } from '../actions/action-measurement.service';
import { RankTrackingService } from '../keywords/rank-tracking.service';
import { RevenueAttributionService } from '../roi/revenue-attribution.service';
import {
  MAX_OUTCOME_ACTIONS,
  MAX_OUTCOME_SIGNALS,
  afterChange,
  agenticEvidence,
  agentCapabilityNote,
  aiLayerNote,
  aiPresence,
  beforeAfter,
  businessHierarchy,
  classifyOutcome,
  headline,
  agencyOutcome,
  interpretationFor,
  nextDecisionFor,
  nextDecisionNote,
  normalizeWindow,
  observedDuring,
  outcomeKey,
  windowReadiness,
  type AiPresence,
  type NextDecision,
  type OutcomeSignal,
} from './growth-outcomes';

/*
 * =========================================================
 * SEARCH GROWTH OUTCOME LOOP 1.0 (Phase 37).
 *
 * Composition over existing measurements — no tables, no
 * scores, no forecasting, no causal attribution:
 * VERIFICATION → MEASUREMENT → OUTCOME SIGNAL →
 * BUSINESS INTERPRETATION → NEXT DECISION.
 *
 * Core reuse: ActionMeasurementService.getMeasurement
 * (GSC/rank/AI/business before-after), rank
 * measureAction, Phase 33 attribution, AI visibility
 * checks, verification metadata. Bounded; read-only;
 * no provider/AI calls beyond what those services
 * already do on reads (cached observations only).
 *
 * EXECUTION ≠ OUTCOME. OBSERVATION ≠ CAUSATION.
 * CITATION ≠ RECOMMENDATION. TRAFFIC ≠ REVENUE.
 * =========================================================
 */

const WINDOW = 28;

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function normKey(value: unknown): string {
  return clean(value).toLowerCase().replace(/\s+/g, ' ');
}

export interface ActionOutcome {
  key: string;
  actionId: string;
  title: string;
  actionStatus: string;
  verification: string | null;
  windowDays: number;
  readiness: string;
  readinessNote: string;
  search: Record<string, unknown>;
  ai: Record<string, unknown>;
  agentic: Record<string, unknown>;
  business: Record<string, unknown>;
  signal: OutcomeSignal;
  interpretation: string;
  causality: string;
  nextDecision: NextDecision;
  nextNote: string;
  hierarchy: string[];
  headline: ReturnType<typeof headline>;
  agency: string[];
}

@Injectable()
export class GrowthOutcomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly measurement: ActionMeasurementService,
    private readonly ranks: RankTrackingService,
    private readonly attribution: RevenueAttributionService,
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

  private completedActions(
    organizationId: string,
    websiteId: string,
    limit: number,
  ) {
    return this.prisma.action.findMany({
      where: {
        organizationId,
        websiteId,
        status: { in: ['DONE', 'IN_PROGRESS'] },
      },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(limit, MAX_OUTCOME_ACTIONS),
    });
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

  private keywordOf(action: any): string | null {
    const meta = (action?.metadata ?? {}) as Record<
      string,
      unknown
    >;
    return (
      clean(
        meta.strategyKeyword ?? meta.keyword ?? meta.query,
      ) || null
    );
  }

  async outcomeFor(
    organizationId: string,
    websiteId: string,
    actionId: string,
    windowDays = WINDOW,
  ): Promise<ActionOutcome> {
    const site = await this.website(
      organizationId,
      websiteId,
    );
    if (!site) throw new NotFoundException('Website not found');
    const action = await this.prisma.action.findFirst({
      where: { id: actionId, organizationId, websiteId },
    });
    if (!action) throw new NotFoundException('Action not found');
    const window = normalizeWindow(windowDays) ?? 28;
    const verification = this.verificationOf(action);
    const verified =
      verification === 'VERIFIED' ||
      verification === 'PARTIALLY_VERIFIED';
    const completedAt = (action as any).completedAt
      ? new Date((action as any).completedAt).toISOString()
      : null;
    const readiness = windowReadiness({
      verifiedAtIso: verified ? completedAt : null,
      windowDays: window,
    });
    const key = outcomeKey({
      organizationId,
      websiteId,
      actionId,
      windowDays: window,
    });

    /* Core measurement reuse (bounded single-action). */
    let measured: any = null;
    try {
      measured = await this.measurement.getMeasurement(
        organizationId,
        actionId,
        window,
      );
    } catch {
      measured = null;
    }
    let rank: any = null;
    try {
      rank = await this.ranks.measureAction(
        organizationId,
        actionId,
      );
    } catch {
      rank = null;
    }

    /* ---- SEARCH domain ---- */
    const rankBefore =
      rank?.before !== undefined ? rank.before : null;
    const rankAfter =
      rank?.after !== undefined ? rank.after : null;
    const rankBA = beforeAfter({
      before: rankBefore,
      after: rankAfter,
      evidenceState: 'OBSERVED',
      window: `${window}d around completion`,
      lowerIsBetter: true,
    });
    const gscNote =
      measured?.gscBefore !== undefined ||
      measured?.gscAfter !== undefined
        ? 'GSC before/after available in the measurement detail (source: GSC, aggregate — never causal proof).'
        : 'GSC before/after unavailable for this window.';

    /* ---- AI domain (mention/citation separate;
     * recommendation never inferred) ---- */
    const keyword = this.keywordOf(action);
    let mentionBefore: boolean | null = null;
    let mentionAfter: boolean | null = null;
    let citationBefore: boolean | null = null;
    let citationAfter: boolean | null = null;
    let citedUrl: string | null = null;
    try {
      const checks = (await (
        this.prisma as unknown as Record<string, any>
      ).aiVisibilityCheck?.findMany({
        where: {
          websiteId,
          ...(keyword ? { query: { contains: keyword } } : {}),
        },
        orderBy: { checkedAt: 'desc' },
        take: 20,
      })) as Array<any> | undefined;
      if (checks && checks.length > 0) {
        const anchor = completedAt
          ? new Date(completedAt).getTime()
          : null;
        const beforeChecks =
          anchor !== null
            ? checks.filter(
                (c) =>
                  c.checkedAt &&
                  new Date(c.checkedAt).getTime() < anchor,
              )
            : [];
        const afterChecks =
          anchor !== null
            ? checks.filter(
                (c) =>
                  c.checkedAt &&
                  new Date(c.checkedAt).getTime() >= anchor,
              )
            : checks;
        const anyTrue = (
          rows: Array<any>,
          field: string,
        ): boolean | null =>
          rows.length === 0
            ? null
            : rows.some((r) => r[field] === true);
        mentionBefore = anyTrue(beforeChecks, 'mentioned');
        mentionAfter = anyTrue(afterChecks, 'mentioned');
        citationBefore = anyTrue(beforeChecks, 'citationFound');
        citationAfter = anyTrue(afterChecks, 'citationFound');
        citedUrl =
          afterChecks.find((c) => c.citationUrl)?.citationUrl ??
          beforeChecks.find((c) => c.citationUrl)
            ?.citationUrl ??
          null;
      }
    } catch {
      /* AI checks unavailable — stays unavailable */
    }
    const presence: AiPresence = aiPresence({
      cited: citationAfter,
      recommended: null,
      competitorRecommended: null,
      providerSupports: true,
    });
    const aiLayers = aiLayerNote({
      mention:
        mentionBefore === null && mentionAfter === null
          ? 'UNAVAILABLE'
          : `${mentionBefore ?? 'unknown'} → ${mentionAfter ?? 'unknown'} (OBSERVED where recorded)`,
      citation:
        citationBefore === null && citationAfter === null
          ? 'UNAVAILABLE'
          : `${citationBefore ?? 'unknown'} → ${citationAfter ?? 'unknown'}${citedUrl ? ` (${citedUrl})` : ''}`,
      referral: 'see Phase 33 AI attribution (separate edge)',
      conversion: 'see Phase 33 AI attribution (separate edge)',
      revenue: 'ATTRIBUTED where GA4 attributes it, else UNAVAILABLE',
    });

    /* ---- Agentic readiness (verification targets
     * only — never scored, never assumed) ---- */
    const meta = ((action as any)?.metadata ?? {}) as Record<
      string,
      unknown
    >;
    const targets = Array.isArray(meta.verificationTargets)
      ? (meta.verificationTargets as Array<unknown>).map((t) =>
          String(t ?? '').toUpperCase(),
        )
      : [];
    const has = (t: string) => targets.includes(t);
    const agentic = agenticEvidence({
      priceAccessible: null,
      contactAccessible: null,
      productInfoAccessible: null,
      structuredData: has('STRUCTURED_DATA') || has('JSON_LD') ? true : null,
      formAccessible: null,
    });

    /* ---- Business domain (recorded outcomes in the
     * measurement windows; Phase 33 for attribution) ---- */
    const biz = (measured as any)?.business ?? null;
    const leadsBA = beforeAfter({
      before: (biz as any)?.leadsBefore ?? null,
      after: (biz as any)?.leadsAfter ?? null,
      evidenceState: 'OBSERVED',
      window: `${window}d around completion`,
    });
    const revenueBA = beforeAfter({
      before: (biz as any)?.revenueBefore ?? null,
      after: (biz as any)?.revenueAfter ?? null,
      evidenceState:
        (biz as any)?.revenueBefore !== undefined ||
        (biz as any)?.revenueAfter !== undefined
          ? 'ATTRIBUTED'
          : 'UNAVAILABLE',
      window: `${window}d around completion`,
    });

    /* ---- Signal classification ---- */
    const signal = !readiness.ready
      ? ('TOO_EARLY_TO_JUDGE' as const)
      : classifyOutcome({
          directions: [
            rankBA.direction,
            leadsBA.direction,
            revenueBA.direction,
            mentionAfter === true &&
            mentionBefore !== true
              ? 'UP'
              : mentionAfter === false &&
                  mentionBefore === true
                ? 'DOWN'
                : citationAfter === true &&
                    citationBefore !== true
                  ? 'UP'
                  : 'UNKNOWN',
          ],
          conflictingSources: false,
          dataSufficient:
            rankBA.baseline === 'AVAILABLE' ||
            leadsBA.baseline === 'AVAILABLE' ||
            revenueBA.baseline === 'AVAILABLE' ||
            mentionAfter !== null ||
            citationAfter !== null,
          measured: measured !== null,
        });
    const next = nextDecisionFor({
      signal,
      targetAchieved: null,
      verified,
    });

    const changed: string[] = [];
    const unchanged: string[] = [];
    const unknown: string[] = [];
    if (rankBA.baseline === 'AVAILABLE' && rankBA.direction !== 'FLAT') {
      changed.push(
        `rank ${rankBefore} → ${rankAfter} (${rankBA.direction === 'UP' ? 'improved' : 'declined'})`,
      );
    } else if (rankBA.direction === 'FLAT') {
      unchanged.push(`rank steady at ${rankAfter}`);
    } else {
      unknown.push('rank movement (no consecutive observations)');
    }
    if (leadsBA.baseline === 'AVAILABLE' && leadsBA.direction !== 'FLAT') {
      changed.push(`recorded leads ${leadsBA.before} → ${leadsBA.after}`);
    } else if (leadsBA.direction === 'FLAT') {
      unchanged.push('recorded leads steady');
    } else {
      unknown.push('lead movement');
    }
    if (citationAfter !== null || mentionAfter !== null) {
      changed.push(
        `AI ${citationAfter === true ? 'cited' : 'not cited'} / ${mentionAfter === true ? 'mentioned' : 'not mentioned'} after`,
      );
    } else {
      unknown.push('AI mention/citation movement');
    }
    if (revenueBA.baseline === 'AVAILABLE' && revenueBA.direction !== 'FLAT') {
      changed.push(`recorded revenue ${revenueBA.before} → ${revenueBA.after}`);
    } else {
      unknown.push('revenue movement (attribution-level only)');
    }

    return {
      key,
      actionId,
      title: (action as any).title,
      actionStatus: clean((action as any).status),
      verification,
      windowDays: window,
      readiness: readiness.state,
      readinessNote: readiness.note,
      search: {
        rank: rankBA,
        gsc: gscNote,
        statement: afterChange({
          metric: 'Rank',
          movement:
            rankBA.direction === 'UNKNOWN'
              ? 'could not be established'
              : `${rankBefore} → ${rankAfter}`,
        }),
      },
      ai: {
        presence,
        presenceNote:
          'CITATION_PRESENT is never upgraded to RECOMMENDATION_PRESENT; competitor preference unknown without source evidence.',
        layers: aiLayers,
        citedUrl,
      },
      agentic: {
        evidence: agentic,
        note: agentCapabilityNote(agentic),
      },
      business: {
        leads: leadsBA,
        revenue: revenueBA,
        statement: observedDuring(
          'Recorded leads/revenue',
          `${window}d around completion`,
        ),
      },
      signal,
      interpretation: interpretationFor(signal),
      causality: afterChange({
        metric: 'Observed outcomes',
        movement: 'are temporally associated with the completed work',
      }),
      nextDecision: next,
      nextNote: nextDecisionNote(next),
      hierarchy: businessHierarchy({
        'SEARCH VISIBILITY':
          rankBA.baseline === 'AVAILABLE'
            ? `rank ${rankBefore} → ${rankAfter}`
            : null,
        TRAFFIC: null,
        ENGAGEMENT: null,
        LEAD:
          leadsBA.baseline === 'AVAILABLE'
            ? `${leadsBA.before} → ${leadsBA.after} recorded`
            : null,
        'QUALIFIED LEAD': null,
        REVENUE:
          revenueBA.baseline === 'AVAILABLE'
            ? `${revenueBA.before} → ${revenueBA.after} recorded`
            : null,
      }),
      headline: headline({
        workTitle: (action as any).title,
        changed,
        unchanged,
        unknown,
        nextDecision: next,
      }),
      agency: agencyOutcome({
        completed: (action as any).title,
        verified:
          verification === 'VERIFIED' || verification === 'PARTIALLY_VERIFIED'
            ? `change verified (${verification})`
            : 'verification pending or unavailable',
        outcome:
          changed.length > 0
            ? changed.join('; ')
            : 'no measurable change yet',
        status: signal,
        next,
      }),
    };
  }

  async recent(
    organizationId: string,
    websiteId: string,
    limit = MAX_OUTCOME_SIGNALS,
  ) {
    const site = await this.website(
      organizationId,
      websiteId,
    );
    if (!site) {
      return { websiteId, websiteFound: false as const, items: [] };
    }
    const actions = await this.completedActions(
      organizationId,
      websiteId,
      Math.min(limit, MAX_OUTCOME_SIGNALS),
    );
    const items: Array<
      Pick<
        ActionOutcome,
        | 'actionId'
        | 'title'
        | 'signal'
        | 'interpretation'
        | 'nextDecision'
        | 'headline'
      >
    > = [];
    for (const action of actions) {
      try {
        const outcome = await this.outcomeFor(
          organizationId,
          websiteId,
          action.id,
          WINDOW,
        );
        items.push({
          actionId: outcome.actionId,
          title: outcome.title,
          signal: outcome.signal,
          interpretation: outcome.interpretation,
          nextDecision: outcome.nextDecision,
          headline: outcome.headline,
        });
      } catch {
        /* one failed outcome never breaks the loop */
      }
    }
    return {
      websiteId,
      websiteFound: true as const,
      items: items.slice(0, MAX_OUTCOME_SIGNALS),
      note: 'Maximum 3–5 headline signals: completed work, observed change, unknowns, next decision. No vanity walls.',
    };
  }

  async pending(
    organizationId: string,
    websiteId: string,
  ) {
    const site = await this.website(
      organizationId,
      websiteId,
    );
    if (!site) {
      return { websiteId, websiteFound: false as const, items: [] };
    }
    const actions = await this.completedActions(
      organizationId,
      websiteId,
      MAX_OUTCOME_ACTIONS,
    );
    const items: Array<{
      actionId: string;
      title: string;
      readiness: string;
      note: string;
    }> = [];
    for (const action of actions) {
      const verification = this.verificationOf(action);
      const verified =
        verification === 'VERIFIED' ||
        verification === 'PARTIALLY_VERIFIED';
      const completedAt = (action as any).completedAt
        ? new Date((action as any).completedAt).toISOString()
        : null;
      const readiness = windowReadiness({
        verifiedAtIso: verified ? completedAt : null,
        windowDays: WINDOW,
      });
      if (!readiness.ready) {
        items.push({
          actionId: action.id,
          title: (action as any).title,
          readiness: readiness.state,
          note: readiness.note,
        });
      }
      if (items.length >= MAX_OUTCOME_SIGNALS) break;
    }
    return {
      websiteId,
      websiteFound: true as const,
      items,
      note: 'Verified work awaiting its window, or work awaiting verification. Withheld judgment is not failure.',
    };
  }

  async outcomes(
    organizationId: string,
    websiteId: string,
  ) {
    const [recent, pending] = await Promise.all([
      this.recent(organizationId, websiteId),
      this.pending(organizationId, websiteId),
    ]);
    return {
      websiteId,
      websiteFound: (recent as any).websiteFound !== false,
      recent: (recent as any).items ?? [],
      pending: (pending as any).items ?? [],
      loop: 'VERIFICATION → MEASUREMENT → OUTCOME → NEXT DECISION. Execution is never confused with outcome.',
    };
  }
}

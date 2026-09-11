import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { GoogleService } from '../google/google.service';
import {
  sameOutcomePage,
  classifyLeadAttribution,
  classifyRevenueAttribution,
} from '../roi/revenue-intelligence';
import {
  MEASUREMENT_LIMITATIONS,
  aggregateOutcome,
  compareMetric,
  compareWindowEvidence,
  equalWindows,
  learningSummary,
  overlapNote,
  readinessForStatus,
  validateWindow,
  type OutcomeState,
} from './action-measurement';

/*
 * =========================================================
 * ACTION MEASUREMENT 1.0 (Phase 23) — composition-only
 * reads over append-only observations. Baselines are
 * re-derived from immutable history (GSC windows, rank
 * observations, AI checks, recorded outcomes); nothing
 * is rewritten. No scores, no causality, no zero
 * fallback, no invented timestamps.
 *
 * Bounds per action: GSC 4 bounded reads, ranks ≤200,
 * AI ≤200, links ≤200, leads/revenue ≤200. History
 * pages ≤100 rows.
 * =========================================================
 */

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function norm(value: unknown): string {
  return clean(value).toLowerCase();
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normPage(value: unknown): string | null {
  let raw = clean(value).toLowerCase();
  if (!raw) return null;
  raw = raw.split('?')[0].split('#')[0];
  raw = raw.replace(/^https?:\/\//, '');
  raw = raw.replace(/^www\./, '');
  raw = raw.replace(/\/+$/, '');
  return raw || null;
}

function rowsOf(response: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(response)) return response as Array<Record<string, unknown>>;
  const record = response as Record<string, unknown>;
  if (Array.isArray(record.queries))
    return record.queries as Array<Record<string, unknown>>;
  if (Array.isArray(record.rows))
    return record.rows as Array<Record<string, unknown>>;
  return [];
}

@Injectable()
export class ActionMeasurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleService,
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

  private async action(
    organizationId: string,
    id: string,
  ) {
    const row = await this.prisma.action.findFirst({
      where: { id, organizationId },
    });
    if (!row) throw new NotFoundException('Action not found');
    return row;
  }

  private actionKeyword(
    action: Record<string, unknown>,
  ): string | null {
    const meta = (action.metadata ?? {}) as Record<
      string,
      unknown
    >;
    for (const key of [
      'strategyKeyword',
      'keyword',
      'query',
    ]) {
      const value = clean(meta[key]);
      if (value) return value;
    }
    return null;
  }

  private actionUrl(
    action: Record<string, unknown>,
  ): string | null {
    const meta = (action.metadata ?? {}) as Record<
      string,
      unknown
    >;
    for (const key of ['targetPage', 'pageUrl']) {
      const value = clean(meta[key]);
      if (value) return value;
    }
    return clean(action.url) || null;
  }

  async getMeasurement(
    organizationId: string,
    id: string,
    windowDays = 28,
  ) {
    const window = validateWindow(windowDays) ?? 28;
    const action = (await this.action(
      organizationId,
      id,
    )) as unknown as Record<string, unknown>;
    const status = clean(action.status);
    const completedAt = action.completedAt
      ? new Date(action.completedAt as string)
      : null;
    const anchorValid =
      completedAt !== null &&
      !Number.isNaN(completedAt.getTime());
    const readiness = readinessForStatus(
      status,
      anchorValid,
    );
    const base = {
      action: {
        id: action.id,
        title: clean(action.title),
        type: clean(action.type),
        status,
        url: this.actionUrl(action),
        keyword: this.actionKeyword(action),
        createdAt: action.createdAt,
        completedAt: action.completedAt ?? null,
      },
      readiness,
      window,
    };
    if (readiness !== 'MEASURABLE') {
      return {
        ...base,
        outcomeState:
          status === 'TODO'
            ? 'NOT_MEASURABLE'
            : ('NOT_MEASURABLE' as OutcomeState),
        note:
          status === 'TODO'
            ? 'Measurement starts after this action is completed.'
            : status === 'IN_PROGRESS'
              ? 'Early measurement is not ready; observed change needs a completed action and observation time.'
              : status === 'DISMISSED'
                ? 'Dismissed actions carry no measurement.'
                : 'No completion timestamp was recorded; measurement cannot be anchored.',
        limitations: MEASUREMENT_LIMITATIONS,
        billing: { charged: false },
      };
    }

    const anchorIso = (
      completedAt as Date
    ).toISOString();
    const windows = equalWindows(anchorIso, window);
    if (!windows) {
      return {
        ...base,
        outcomeState: 'NOT_MEASURABLE' as OutcomeState,
        note: 'The completion timestamp is not a valid anchor.',
        limitations: MEASUREMENT_LIMITATIONS,
        billing: { charged: false },
      };
    }

    const keyword = this.actionKeyword(action);
    const url = this.actionUrl(action);
    const urlKey = normPage(url);
    const keywordKey = norm(keyword);

    const [
      gscBefore,
      gscAfter,
      ranksRes,
      checksRes,
      linksRes,
      leadsRes,
      revenueRes,
      overlapRes,
    ] = await Promise.all([
      this.settled(() =>
        this.google.getSearchQueries(
          organizationId,
          windows.beforeStart,
          windows.beforeEnd,
        ),
      ),
      this.settled(() =>
        this.google.getSearchQueries(
          organizationId,
          windows.afterStart,
          windows.afterEnd,
        ),
      ),
      this.settled(() =>
        this.prisma.rankObservation.findMany({
          where: {
            organizationId,
            ...(action.websiteId
              ? { websiteId: action.websiteId as string }
              : {}),
            ...(keywordKey
              ? { normalizedKeyword: keywordKey }
              : {}),
          },
          orderBy: { observedAt: 'asc' },
          take: 200,
        }),
      ),
      this.settled(() =>
        this.prisma.aiVisibilityCheck.findMany({
          where: {
            websiteId: (action.websiteId as string) ?? '',
            /* Phase 41 (P3-12): org-aware relation filter
             * on top of the upstream action(org) check. */
            Website: { organizationId },
            status: 'COMPLETED',
          },
          orderBy: { checkedAt: 'asc' },
          take: 200,
        }),
      ),
      this.settled(() =>
        this.prisma.backlink.findMany({
          where: {
            websiteId: (action.websiteId as string) ?? '',
            website: { organizationId },
          },
          select: {
            targetUrl: true,
            sourceDomain: true,
            status: true,
            firstSeenAt: true,
            lastSeenAt: true,
          },
          take: 200,
        }),
      ),
      this.settled(() =>
        this.prisma.lead.findMany({
          where: {
            websiteId: (action.websiteId as string) ?? '',
            website: { organizationId },
          },
          orderBy: { createdAt: 'asc' },
          take: 200,
        }),
      ),
      this.settled(() =>
        this.prisma.revenue.findMany({
          where: {
            websiteId: (action.websiteId as string) ?? '',
            website: { organizationId },
            status: 'RECOGNIZED',
          },
          orderBy: { recognizedAt: 'asc' },
          take: 200,
        }),
      ),
      this.settled(() =>
        this.prisma.action.findMany({
          where: {
            organizationId,
            websiteId: (action.websiteId as string) ?? '',
            status: 'DONE',
            id: { not: action.id as string },
          },
          select: {
            id: true,
            title: true,
            url: true,
            metadata: true,
            completedAt: true,
          },
          take: 50,
        }),
      ),
    ]);

    /* ---- GSC before/after (matched rows only) ---- */
    const matchGsc = (
      rows: Array<Record<string, unknown>>,
    ): { impressions: number; clicks: number; ctr: number | null; position: number | null } | null => {
      const matched = rows.filter((row) => {
        if (keywordKey && norm(row.query ?? row.keyword) === keywordKey)
          return true;
        if (
          urlKey &&
          normPage(row.page ?? row.url) === urlKey
        )
          return true;
        return false;
      });
      if (matched.length === 0) return null;
      let impressions = 0;
      let clicks = 0;
      let weighted = 0;
      for (const row of matched) {
        const impressionsValue = numOrNull(row.impressions) ?? 0;
        impressions += impressionsValue;
        clicks += numOrNull(row.clicks) ?? 0;
        weighted +=
          (numOrNull(row.position) ?? 0) * impressionsValue;
      }
      return {
        impressions,
        clicks,
        ctr: impressions > 0 ? clicks / impressions : null,
        position:
          impressions > 0 ? weighted / impressions : null,
      };
    };
    const before = matchGsc(rowsOf(gscBefore));
    const after = matchGsc(rowsOf(gscAfter));

    /* ---- rank movement ---- */
    const anchorTime = (completedAt as Date).getTime();
    const rankRows = (
      (ranksRes ?? []) as Array<Record<string, unknown>>
    ).filter((row) => {
      if (!urlKey) return true;
      const rowKey = normPage(row.url);
      return rowKey === null || rowKey === urlKey;
    });
    const beforeRanks = rankRows.filter(
      (row) =>
        new Date(row.observedAt as string).getTime() <
        anchorTime,
    );
    const afterRanks = rankRows.filter(
      (row) =>
        new Date(row.observedAt as string).getTime() >=
        anchorTime,
    );
    const baselineRank =
      beforeRanks.length > 0
        ? Number(
            beforeRanks[beforeRanks.length - 1].position,
          )
        : null;
    const afterRank =
      afterRanks.length > 0
        ? Number(afterRanks[0].position)
        : null;
    const latestRank =
      rankRows.length > 0
        ? Number(rankRows[rankRows.length - 1].position)
        : null;

    /* ---- AI counts ---- */
    const relevantChecks = (
      (checksRes ?? []) as Array<Record<string, unknown>>
    ).filter((row) => {
      if (!keywordKey) return false;
      return norm(row.query) === keywordKey;
    });
    const mentionsBefore = relevantChecks.filter(
      (row) =>
        row.mentioned === true &&
        new Date(row.checkedAt as string).getTime() <
          anchorTime,
    ).length;
    const mentionsAfter = relevantChecks.filter(
      (row) =>
        row.mentioned === true &&
        new Date(row.checkedAt as string).getTime() >=
          anchorTime,
    ).length;
    const citationsBefore = relevantChecks.filter(
      (row) =>
        row.citationFound === true &&
        new Date(row.checkedAt as string).getTime() <
          anchorTime,
    ).length;
    const citationsAfter = relevantChecks.filter(
      (row) =>
        row.citationFound === true &&
        new Date(row.checkedAt as string).getTime() >=
          anchorTime,
    ).length;

    /* ---- authority: explicit new/lost only ---- */
    const pageLinks = (
      (linksRes ?? []) as Array<Record<string, unknown>>
    ).filter(
      (row) =>
        !urlKey ||
        normPage(row.targetUrl) === urlKey,
    );
    const newDomains = new Set(
      pageLinks
        .filter(
          (row) =>
            new Date(row.firstSeenAt as string).getTime() >=
            anchorTime,
        )
        .map((row) =>
          clean(row.sourceDomain).toLowerCase(),
        )
        .filter(Boolean),
    );
    const lostDomains = new Set(
      pageLinks
        .filter(
          (row) =>
            clean(row.status).toUpperCase() === 'LOST',
        )
        .map((row) =>
          clean(row.sourceDomain).toLowerCase(),
        )
        .filter(Boolean),
    );

    /* ---- business: recorded outcomes in windows ---- */
    const beforeStart = new Date(windows.beforeStart).getTime();
    const afterEnd = new Date(
      windows.afterEnd,
    ).getTime();
    const inBefore = (time: number): boolean =>
      time >= beforeStart && time < anchorTime;
    const inAfter = (time: number): boolean =>
      time >= anchorTime && time <= afterEnd;
    /* Phase 41 (Group F): coverage (any tracked rows in
     * the window) is distinct from the page-matched
     * value. Missing coverage must never read as
     * 0 == 0 → UNCHANGED false stability. */
    const allLeadRows = (
      (leadsRes ?? []) as Array<Record<string, unknown>>
    );
    const leadTime = (row: Record<string, unknown>): number =>
      new Date(row.createdAt as string).getTime();
    const leadsCoveredBefore = allLeadRows.some((row) =>
      inBefore(leadTime(row)),
    );
    const leadsCoveredAfter = allLeadRows.some((row) =>
      inAfter(leadTime(row)),
    );
    const pageMatch = (landingPage: unknown): boolean => {
      if (!urlKey) return true;
      const key = normPage(landingPage);
      return key !== null && sameOutcomePage(
        clean(landingPage),
        clean(url),
      );
    };
    const leads = (
      (leadsRes ?? []) as Array<Record<string, unknown>>
    ).filter((row) => pageMatch(row.landingPage));
    const revenues = (
      (revenueRes ?? []) as Array<Record<string, unknown>>
    );
    const leadsBefore = leads.filter((row) =>
      inBefore(new Date(row.createdAt as string).getTime()),
    ).length;
    const leadsAfter = leads.filter((row) =>
      inAfter(new Date(row.createdAt as string).getTime()),
    ).length;
    /* Phase 41 (Group F): revenue coverage per window —
     * recognized rows observed, not assumed. */
    const revenueTime = (row: Record<string, unknown>): number =>
      new Date(
        (row.recognizedAt as string) ??
          (row.createdAt as string),
      ).getTime();
    const revenueCoveredBefore = revenues.some((row) =>
      inBefore(revenueTime(row)),
    );
    const revenueCoveredAfter = revenues.some((row) =>
      inAfter(revenueTime(row)),
    );
    const revenueBefore = revenues
      .filter((row) =>
        inBefore(
          revenueTime(row),
        ),
      )
      .reduce(
        (sum, row) => sum + (Number(row.amount) || 0),
        0,
      );
    const revenueAfter = revenues
      .filter((row) =>
        inAfter(
          revenueTime(row),
        ),
      )
      .reduce(
        (sum, row) => sum + (Number(row.amount) || 0),
        0,
      );
    void classifyLeadAttribution;
    void classifyRevenueAttribution;

    /* ---- overlap ---- */
    const overlapping = (
      (overlapRes ?? []) as Array<Record<string, unknown>>
    ).filter((row) => {
      if (!row.completedAt) return false;
      const time = new Date(
        row.completedAt as string,
      ).getTime();
      if (time < beforeStart || time > afterEnd)
        return false;
      const rowUrl = normPage(
        (row.metadata as Record<string, unknown> | null)
          ?.targetPage ??
          (row.metadata as Record<string, unknown> | null)
            ?.pageUrl ??
          row.url,
      );
      return (
        (urlKey !== null && rowUrl === urlKey) ||
        urlKey === null
      );
    });

    const metrics: Array<{
      key: string;
      label: string;
      before: string;
      after: string;
      outcome: OutcomeState;
      evidence: string;
    }> = [
      {
        key: 'GSC_CTR',
        label: 'CTR',
        before:
          before?.ctr !== null && before?.ctr !== undefined
            ? `${(before.ctr * 100).toFixed(2)}%`
            : 'unavailable',
        after:
          after?.ctr !== null && after?.ctr !== undefined
            ? `${(after.ctr * 100).toFixed(2)}%`
            : 'unavailable',
        outcome: compareMetric(
          'HIGHER_IMPROVED',
          before?.ctr ?? null,
          after?.ctr ?? null,
          0.0005,
        ),
        evidence: 'GSC — VERIFIED',
      },
      {
        key: 'GSC_CLICKS',
        label: 'Clicks',
        before: before ? String(before.clicks) : 'unavailable',
        after: after ? String(after.clicks) : 'unavailable',
        outcome: compareMetric(
          'HIGHER_IMPROVED',
          before ? before.clicks : null,
          after ? after.clicks : null,
        ),
        evidence: 'GSC — VERIFIED',
      },
      {
        key: 'GSC_IMPRESSIONS',
        label: 'Impressions',
        before: before
          ? String(before.impressions)
          : 'unavailable',
        after: after
          ? String(after.impressions)
          : 'unavailable',
        outcome:
          before && after
            ? 'UNCHANGED'
            : 'INSUFFICIENT_EVIDENCE',
        evidence:
          'GSC — VERIFIED. Impression changes describe demand movement, not action impact.',
      },
      {
        key: 'GSC_POSITION',
        label: 'GSC estimated position',
        before:
          before?.position != null
            ? before.position.toFixed(1)
            : 'unavailable',
        after:
          after?.position != null
            ? after.position.toFixed(1)
            : 'unavailable',
        outcome: compareMetric(
          'LOWER_IMPROVED',
          before?.position ?? null,
          after?.position ?? null,
          0.05,
        ),
        evidence:
          'GSC — VERIFIED impression-weighted estimated position, never exact rank.',
      },
      {
        key: 'RANK_POSITION',
        label: 'Rank position',
        before:
          baselineRank !== null && Number.isFinite(baselineRank)
            ? String(baselineRank)
            : 'unavailable',
        after:
          afterRank !== null && Number.isFinite(afterRank)
            ? String(afterRank)
            : 'unavailable',
        outcome: compareMetric(
          'LOWER_IMPROVED',
          Number.isFinite(baselineRank)
            ? baselineRank
            : null,
          Number.isFinite(afterRank) ? afterRank : null,
          0,
        ),
        evidence:
          'RankObservation — OBSERVED. Missing observations are never interpolated.',
      },
      {
        key: 'AI_MENTION',
        label: 'AI mentions',
        before: String(mentionsBefore),
        after: String(mentionsAfter),
        outcome:
          relevantChecks.length > 0
            ? compareMetric(
                'HIGHER_IMPROVED',
                mentionsBefore,
                mentionsAfter,
              )
            : 'INSUFFICIENT_EVIDENCE',
        evidence: 'AI monitoring — OBSERVED.',
      },
      {
        key: 'AI_CITATION',
        label: 'AI citations',
        before: String(citationsBefore),
        after: String(citationsAfter),
        outcome:
          relevantChecks.length > 0
            ? compareMetric(
                'HIGHER_IMPROVED',
                citationsBefore,
                citationsAfter,
              )
            : 'INSUFFICIENT_EVIDENCE',
        evidence:
          'AI monitoring — OBSERVED. No traffic or revenue inference.',
      },
      {
        key: 'REFERRING_DOMAINS',
        label: 'Referring domains',
        before: 'observed set',
        after: `+${newDomains.size} new / ${lostDomains.size} lost (explicit evidence)`,
        outcome:
          newDomains.size > 0 || lostDomains.size > 0
            ? 'UNCHANGED'
            : 'INSUFFICIENT_EVIDENCE',
        evidence:
          'Backlink evidence — OBSERVED. Changes never inferred from rank movement.',
      },
      {
        key: 'LEADS',
        label: 'Leads',
        before:
          leadsCoveredBefore && leadsCoveredAfter
            ? String(leadsBefore)
            : 'unavailable',
        after:
          leadsCoveredBefore && leadsCoveredAfter
            ? String(leadsAfter)
            : 'unavailable',
        outcome: compareWindowEvidence(
          leadsBefore,
          leadsAfter,
          leadsCoveredBefore,
          leadsCoveredAfter,
        ),
        evidence:
          'Recorded outcomes — OBSERVED. Never estimated. ' +
          (leadsCoveredBefore && leadsCoveredAfter
            ? 'Both windows have tracked lead coverage.'
            : 'Missing window coverage — no stability claimed.'),
      },
      {
        key: 'REVENUE',
        label: 'Revenue',
        before:
          revenueCoveredBefore && revenueCoveredAfter
            ? String(revenueBefore)
            : 'unavailable',
        after:
          revenueCoveredBefore && revenueCoveredAfter
            ? String(revenueAfter)
            : 'unavailable',
        outcome: compareWindowEvidence(
          revenueBefore,
          revenueAfter,
          revenueCoveredBefore,
          revenueCoveredAfter,
        ),
        evidence:
          'Recognized revenue — OBSERVED. Higher recorded amount is a higher recorded outcome, not proof of impact. ' +
          (revenueCoveredBefore && revenueCoveredAfter
            ? 'Both windows have recognized revenue coverage.'
            : 'Missing window coverage — no stability claimed.'),
      },
    ];

    const outcomeState = aggregateOutcome(
      metrics.map((metric) => metric.outcome),
    );
    const overlap = overlapNote(overlapping.length);

    return {
      action: {
        id: action.id,
        title: clean(action.title),
        type: clean(action.type),
        status,
        url,
        keyword,
        createdAt: action.createdAt,
        completedAt: action.completedAt,
      },
      baseline: {
        capturedFrom: 'append-only observations',
        observedThrough: windows.beforeEnd,
        metrics: metrics.map((metric) => ({
          key: metric.key,
          label: metric.label,
          before: metric.before,
          evidence: metric.evidence,
        })),
      },
      actionEvent: {
        completedAt: action.completedAt,
        anchor: 'completedAt',
      },
      after: {
        window: `${windows.afterStart} → ${windows.afterEnd}`,
        metrics: metrics.map((metric) => ({
          key: metric.key,
          label: metric.label,
          after: metric.after,
          evidence: metric.evidence,
        })),
      },
      observedChanges: metrics.map((metric) => ({
        key: metric.key,
        label: metric.label,
        before: metric.before,
        after: metric.after,
        outcome: metric.outcome,
        evidence: metric.evidence,
      })),
      outcomeState,
      latestRank,
      learning: learningSummary(
        clean(action.title),
        metrics.map((metric) => ({
          label: metric.label,
          before: metric.before,
          after: metric.after,
          outcome: metric.outcome,
        })),
      ),
      overlappingActions: overlapping.map((row) => ({
        id: row.id,
        title: clean(row.title),
        completedAt: row.completedAt,
      })),
      overlapNote: overlap,
      evidence: {
        note: 'GSC is VERIFIED; rank, AI, link and outcome rows are OBSERVED as recorded.',
      },
      freshness: {
        actionDate: anchorIso.slice(0, 10),
        dataThrough: windows.afterEnd,
        measurementWindow: `${windows.beforeStart} → ${windows.afterEnd}`,
        lastMeasuredAt: new Date().toISOString(),
        note: 'Source data may end before today; delayed data is preserved as dataThrough, never presented as the action timestamp.',
      },
      limitations: MEASUREMENT_LIMITATIONS,
      business: {
        leadsBefore,
        leadsAfter,
        revenueBefore,
        revenueAfter,
        evidenceState: 'OBSERVED',
      },
      nextBestAction: {
        guidance:
          outcomeState === 'DECLINED'
            ? 'Observed decline — consider an existing improvement action for the same page.'
            : outcomeState === 'INSUFFICIENT_EVIDENCE'
              ? 'More observation time is needed — monitor and re-measure.'
              : 'Continue monitoring the page.',
        category: 'MONITOR_CHANGE',
      },
      billing: { charged: false },
    };
  }

  async getHistory(
    organizationId: string,
    websiteId: string,
    options: {
      type?: string;
      status?: string;
      outcome?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    await this.prisma.website.findFirst({
      where: {
        id: websiteId,
        organizationId,
        isActive: true,
      },
      select: { id: true },
    }).then((website) => {
      if (!website)
        throw new NotFoundException('Website not found');
    });
    const page = Math.max(1, Number(options.page) || 1);
    const requestedPageSize = Math.max(
      1,
      Math.min(100, Number(options.pageSize) || 20),
    );
    /* Phase 41 (P1-13): ?outcome= would otherwise run a
     * full getMeasurement (2 live Google reads + 6
     * bounded DB reads) per item on the page — up to 20
     * fan-out on one request. Cap the evaluated window
     * to 5 and say so; narrow type/status filters for
     * full coverage (async measurement is FOLLOW-UP). */
    const outcomeCap = 5;
    const outcomeFiltering = Boolean(options.outcome);
    const pageSize = outcomeFiltering
      ? Math.min(requestedPageSize, outcomeCap)
      : requestedPageSize;
    const where: Record<string, unknown> = {
      organizationId,
      websiteId,
    };
    if (options.type) where.type = clean(options.type);
    if (options.status) where.status = clean(options.status);
    const [total, items] = await Promise.all([
      this.prisma.action.count({ where }),
      this.prisma.action.findMany({
        where,
        orderBy: { completedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          title: true,
          type: true,
          url: true,
          status: true,
          completedAt: true,
          createdAt: true,
        },
      }),
    ]);
    let filtered = items;
    if (options.outcome) {
      const want = clean(options.outcome).toUpperCase();
      const withOutcomes = await Promise.all(
        items.map(async (item) => {
          if (clean(item.status) !== 'DONE')
            return { item, outcome: 'NOT_MEASURABLE' };
          try {
            const measurement = await this.getMeasurement(
              organizationId,
              item.id,
              28,
            );
            return {
              item,
              outcome: clean(
                (measurement as Record<string, unknown>)
                  .outcomeState,
              ).toUpperCase(),
            };
          } catch {
            return { item, outcome: 'UNAVAILABLE' };
          }
        }),
      );
      filtered = withOutcomes
        .filter(({ outcome }) => outcome === want)
        .map(({ item }) => item);
    }
    return {
      websiteId,
      total,
      page,
      pageSize,
      items: filtered.map((item) => ({
        ...item,
        measurementHref: `/api/actions/${item.id}/measurement`,
      })),
      freshness: {
        note: outcomeFiltering
          ? `History reflects recorded action events; outcomes recompute from authoritative observations. Outcome filters evaluate at most ${outcomeCap} items per request — narrow type/status filters for full coverage.`
          : 'History reflects recorded action events; outcomes recompute from authoritative observations.',
      },
      outcomeLimited:
        outcomeFiltering && requestedPageSize > outcomeCap,
      billing: { charged: false },
    };
  }

  async getSummary(
    organizationId: string,
    websiteId: string,
  ) {
    const history = await this.getHistory(
      organizationId,
      websiteId,
      { status: 'DONE', page: 1, pageSize: 100 },
    );
    const byOutcome: Record<string, number> = {};
    /* Phase 41 (P1-13): measure at most 5 (the most
     * recent DONE actions). Per-action measurement is
     * the expensive primitive; a precomputed outcome
     * column is FOLLOW-UP, not this task. */
    const SUMMARY_MEASURE_CAP = 5;
    for (const item of history.items.slice(
      0,
      SUMMARY_MEASURE_CAP,
    )) {
      try {
        const measurement = await this.getMeasurement(
          organizationId,
          item.id,
          28,
        );
        const outcome = clean(
          (measurement as Record<string, unknown>)
            .outcomeState,
        ).toUpperCase();
        byOutcome[outcome] = (byOutcome[outcome] ?? 0) + 1;
      } catch {
        byOutcome.UNAVAILABLE =
          (byOutcome.UNAVAILABLE ?? 0) + 1;
      }
    }
    return {
      websiteId,
      measured: history.items.length,
      byOutcome,
      evidenceState: 'OBSERVED',
      outcomeCap: SUMMARY_MEASURE_CAP,
      outcomeCoverageNote:
        'Summary measures the 5 most recent DONE actions; full per-action measurement stays on demand.',
      billing: { charged: false },
    };
  }

  async getRecentWork(
    organizationId: string,
    websiteId: string,
    limit = 5,
  ) {
    const history = await this.getHistory(
      organizationId,
      websiteId,
      { status: 'DONE', page: 1, pageSize: limit },
    );
    const items = await Promise.all(
      history.items.slice(0, Math.max(1, Math.min(5, limit))).map(
        async (item) => {
          try {
            const measurement = (await this.getMeasurement(
              organizationId,
              item.id,
              28,
            )) as Record<string, unknown>;
            const changes = (
              (measurement.observedChanges as unknown[]) ??
              []
            ) as Array<Record<string, unknown>>;
            const notable = changes.filter((row) =>
              ['IMPROVED', 'DECLINED', 'MIXED'].includes(
                clean(row.outcome).toUpperCase(),
              ),
            );
            return {
              id: item.id,
              title: item.title,
              url: item.url,
              completedAt: item.completedAt,
              outcomeState: measurement.outcomeState,
              observedChanges: notable.slice(0, 3),
              evidenceState: 'OBSERVED',
            };
          } catch {
            return {
              id: item.id,
              title: item.title,
              url: item.url,
              completedAt: item.completedAt,
              outcomeState: 'UNAVAILABLE',
              observedChanges: [],
              evidenceState: 'UNAVAILABLE',
            };
          }
        },
      ),
    );
    return items;
  }
}

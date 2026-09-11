import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { GoogleService } from '../google/google.service';
import { RankTrackingService } from '../keywords/rank-tracking.service';
import { EvidenceFusionService } from '../keywords/evidence-fusion.service';
import { CustomerDemandService } from '../keywords/customer-demand.service';
import { resolveBaselineWindows } from '../keywords/search-baseline.service';
import {
  extractPageClaims,
  meaningfulConflict,
} from './information-intelligence';
import {
  CANNOT_MEASURE,
  aiDelta,
  confidenceOf,
  diffField,
  diffStringList,
  explainChange,
  higherDirection,
  multiSignal,
  normalizedBodySimilarity,
  rankDirection,
  searchAiDivergence,
  type ChangeType,
} from './change-intelligence';

/*
 * =========================================================
 * SEARCH CHANGE INTELLIGENCE 1.0 (Phase 26) — read-only
 * composition over crawl history, rank/GSC/AI/business
 * observations and recorded actions. Temporal association
 * only: never causal. No scores, no new tables, no
 * provider calls on reads.
 *
 * Bounds: changes ≤100, timeline ≤100 events, pages
 * ≤100, keywords ≤200, claims ≤200, AI rows ≤200,
 * actions ≤100, competitors ≤5, needs ≤50.
 * =========================================================
 */

const MAX_PAGES = 100;
const MAX_ROWS = 200;

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function norm(value: unknown): string {
  return clean(value).toLowerCase();
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

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function rowsOf(response: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(response))
    return response as Array<Record<string, unknown>>;
  const record = response as Record<string, unknown>;
  if (Array.isArray(record.queries))
    return record.queries as Array<Record<string, unknown>>;
  if (Array.isArray(record.rows))
    return record.rows as Array<Record<string, unknown>>;
  return [];
}

export interface TimelineEvent {
  observedAt: string | null;
  entity: string;
  entityType: string;
  changeType: string;
  detail: string;
  source: string;
  evidenceState: string;
}

@Injectable()
export class ChangeIntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleService,
    private readonly ranks: RankTrackingService,
    private readonly fusion: EvidenceFusionService,
    private readonly demand: CustomerDemandService,
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

  private async website(
    organizationId: string,
    websiteId: string,
  ) {
    const row = await this.prisma.website.findFirst({
      where: {
        id: websiteId,
        organizationId,
        isActive: true,
      },
      select: { id: true, name: true, url: true },
    });
    if (!row)
      throw new NotFoundException('Website not found');
    return row;
  }

  async getChangeSummary(
    organizationId: string,
    websiteId: string,
    days = 28,
  ) {
    if (!websiteId)
      throw new BadRequestException(
        'websiteId is required',
      );
    await this.website(organizationId, websiteId);
    const parsed =
      days === 7 || days === 14 || days === 90
        ? days
        : 28;
    const windows = resolveBaselineWindows(28);

    const [
      crawlsRes,
      rankChangesRes,
      gscCurRes,
      gscPrevRes,
      checksRes,
      officialRes,
      demandRes,
      leadsRes,
      revenueRes,
      actionsRes,
      serpRes,
      nbaRes,
    ] = await Promise.all([
      this.settled(async () => {
        const crawls = await this.prisma.crawl.findMany({
          where: { websiteId, status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
          take: 2,
        });
        if (crawls.length === 0) return null;
        const current =
          await this.prisma.crawlPage.findMany({
            where: { crawlId: crawls[0].id },
            select: {
              url: true,
              finalUrl: true,
              title: true,
              metaDescription: true,
              h1: true,
              h2: true,
              canonical: true,
              robots: true,
              statusCode: true,
              structuredDataCount: true,
              jsonLd: true,
              internalLinks: true,
            },
            take: MAX_PAGES,
          });
        let previous: Array<Record<string, unknown>> = [];
        if (crawls.length > 1) {
          previous = (await this.prisma.crawlPage.findMany(
            {
              where: { crawlId: crawls[1].id },
              select: {
                url: true,
                finalUrl: true,
                title: true,
                metaDescription: true,
                h1: true,
                h2: true,
                canonical: true,
                robots: true,
                statusCode: true,
                structuredDataCount: true,
                jsonLd: true,
                internalLinks: true,
              },
              take: 200,
            },
          )) as Array<Record<string, unknown>>;
        }
        return {
          current: crawls[0],
          previous: crawls[1] ?? null,
          currentPages: current,
          previousPages: previous,
        };
      }),
      this.settled(() =>
        this.ranks.getChanges(organizationId, websiteId, 30),
      ),
      this.settled(() =>
        this.google.getSearchQueries(
          organizationId,
          windows.current.startDate,
          windows.current.endDate,
        ),
      ),
      this.settled(() =>
        this.google.getSearchQueries(
          organizationId,
          windows.previous.startDate,
          windows.previous.endDate,
        ),
      ),
      this.settled(() =>
        this.prisma.aiVisibilityCheck.findMany({
          where: { websiteId, status: 'COMPLETED' },
          orderBy: { checkedAt: 'asc' },
          take: MAX_ROWS,
        }),
      ),
      this.settled(() =>
        this.prisma.aiOfficialObservation.findMany({
          where: { websiteId },
          orderBy: { date: 'desc' },
          take: 5,
        }),
      ),
      this.settled(() =>
        this.demand.getCustomerNeeds(
          organizationId,
          websiteId,
          28,
        ),
      ),
      this.settled(() =>
        this.prisma.lead.findMany({
          where: { websiteId },
          orderBy: { createdAt: 'desc' },
          take: MAX_ROWS,
        }),
      ),
      this.settled(() =>
        this.prisma.revenue.findMany({
          where: { websiteId, status: 'RECOGNIZED' },
          orderBy: { recognizedAt: 'desc' },
          take: MAX_ROWS,
        }),
      ),
      this.settled(() =>
        this.prisma.action.findMany({
          where: { organizationId, websiteId },
          orderBy: { completedAt: 'desc' },
          take: 100,
        }),
      ),
      this.settled(() =>
        this.prisma.keywordMetricCache.findMany({
          where: { metric: 'serp' },
          select: { keyword: true, payload: true },
          take: MAX_ROWS,
        }),
      ),
      this.settled(() =>
        this.fusion.getNextBestAction(
          organizationId,
          websiteId,
        ),
      ),
    ]);

    const timeline: TimelineEvent[] = [];
    const material: Array<{
      id: string;
      entity: string;
      entityType: string;
      changeType: ChangeType;
      before: string | null;
      after: string | null;
      direction: string;
      confidence: string;
      source: string;
      evidenceState: string;
      observedAt: string | null;
      keyword: string | null;
      actionId: string | null;
    }> = [];
    let serial = 0;
    const pushMaterial = (
      entry: Omit<(typeof material)[number], 'id'>,
    ): void => {
      if (material.length >= 100) return;
      serial++;
      material.push({ ...entry, id: `chg-${serial}` });
    };

    /* ---- content changes ---- */
    const crawlData = (crawlsRes ?? null) as {
      current: { completedAt?: unknown };
      previous: { completedAt?: unknown } | null;
      currentPages: Array<Record<string, unknown>>;
      previousPages: Array<Record<string, unknown>>;
    } | null;
    const prevByPage = new Map<string, Record<string, unknown>>();
    for (const row of crawlData?.previousPages ?? []) {
      const key = normPage(row.url ?? row.finalUrl);
      if (key && !prevByPage.has(key))
        prevByPage.set(key, row);
    }
    const currentKeys = new Set<string>();
    let contentChanges = 0;
    for (const page of (crawlData?.currentPages ?? []).slice(
      0,
      MAX_PAGES,
    )) {
      const url = clean(page.url);
      const key = normPage(page.url ?? page.finalUrl);
      if (!key) continue;
      currentKeys.add(key);
      const prev = prevByPage.get(key);
      const observedAt =
        crawlData?.current?.completedAt != null
          ? new Date(
              crawlData.current.completedAt as string,
            ).toISOString()
          : null;
      if (!prev) {
        pushMaterial({
          entity: url,
          entityType: 'PAGE',
          changeType: 'PAGE_ADDED',
          before: null,
          after: 'observed in latest crawl',
          direction: 'APPEARED',
          confidence: 'SINGLE_OBSERVATION',
          source: 'Crawl history',
          evidenceState: 'OBSERVED',
          observedAt,
          keyword: null,
          actionId: null,
        });
        timeline.push({
          observedAt,
          entity: url,
          entityType: 'PAGE',
          changeType: 'PAGE_ADDED',
          detail: 'First observation in available crawl history.',
          source: 'Crawl history',
          evidenceState: 'OBSERVED',
        });
        continue;
      }
      const diffs = [
        diffField('TITLE_CHANGED', prev.title, page.title),
        diffField(
          'META_CHANGED',
          prev.metaDescription,
          page.metaDescription,
        ),
        diffStringList('H1_CHANGED', prev.h1, page.h1),
        diffStringList('H2_CHANGED', prev.h2, page.h2),
        diffField(
          'CANONICAL_CHANGED',
          prev.canonical,
          page.canonical,
        ),
        diffField('ROBOTS_CHANGED', prev.robots, page.robots),
        diffField(
          'STRUCTURED_DATA_CHANGED',
          numOrNull(prev.structuredDataCount),
          numOrNull(page.structuredDataCount),
        ),
        diffField(
          'URL_STATUS_CHANGED',
          numOrNull(prev.statusCode),
          numOrNull(page.statusCode),
        ),
        diffField(
          'INTERNAL_LINK_CHANGE',
          numOrNull(prev.internalLinks),
          numOrNull(page.internalLinks),
        ),
      ].filter(
        (diff): diff is NonNullable<typeof diff> =>
          diff !== null,
      );
      for (const diff of diffs) {
        contentChanges++;
        pushMaterial({
          entity: url,
          entityType: 'PAGE',
          changeType: diff.type,
          before: diff.before,
          after: diff.after,
          direction: 'CHANGED',
          confidence: 'SINGLE_OBSERVATION',
          source: 'Crawl history',
          evidenceState: 'OBSERVED',
          observedAt,
          keyword: null,
          actionId: null,
        });
        timeline.push({
          observedAt,
          entity: url,
          entityType: 'PAGE',
          changeType: diff.type,
          detail: `Before ${diff.before ?? 'unavailable'} → after ${diff.after ?? 'unavailable'}.`,
          source: 'Crawl history',
          evidenceState: 'OBSERVED',
        });
      }
      /* Claim changes on this page pair. */
      const namesOf = (row: Record<string, unknown>): string[] => {
        const value = row.jsonLd;
        const entries = Array.isArray(value) ? value : [];
        const names: string[] = [];
        const visit = (node: unknown): void => {
          if (!node || typeof node !== 'object') return;
          if (Array.isArray(node)) {
            node.forEach(visit);
            return;
          }
          const name = clean(
            (node as Record<string, unknown>).name,
          );
          if (name) names.push(name);
        };
        try {
          visit(entries);
        } catch {
          /* Absent stays absent. */
        }
        return names;
      };
      const beforeClaims = extractPageClaims({
        url,
        title: clean(prev.title) || null,
        metaDescription: clean(prev.metaDescription) || null,
        h1: Array.isArray(prev.h1)
          ? (prev.h1 as unknown[]).map(clean)
          : [],
        h2: Array.isArray(prev.h2)
          ? (prev.h2 as unknown[]).map(clean)
          : [],
        jsonLdNames: namesOf(prev),
      });
      const afterClaims = extractPageClaims({
        url,
        title: clean(page.title) || null,
        metaDescription: clean(page.metaDescription) || null,
        h1: Array.isArray(page.h1)
          ? (page.h1 as unknown[]).map(clean)
          : [],
        h2: Array.isArray(page.h2)
          ? (page.h2 as unknown[]).map(clean)
          : [],
        jsonLdNames: namesOf(page),
      });
      const beforeKeys = new Set(
        beforeClaims.map((claim) => claim.key),
      );
      const afterKeys = new Set(
        afterClaims.map((claim) => claim.key),
      );
      for (const claim of afterClaims) {
        if (!beforeKeys.has(claim.key)) {
          pushMaterial({
            entity: url,
            entityType: 'CLAIM',
            changeType: 'CLAIM_ADDED',
            before: null,
            after: `${claim.predicate} ${claim.object}`.slice(0, 200),
            direction: 'APPEARED',
            confidence: 'SINGLE_OBSERVATION',
            source: 'Claim evidence',
            evidenceState: 'OBSERVED',
            observedAt,
            keyword: null,
            actionId: null,
          });
        }
      }
      for (const claim of beforeClaims) {
        if (!afterKeys.has(claim.key)) {
          pushMaterial({
            entity: url,
            entityType: 'CLAIM',
            changeType: 'CLAIM_REMOVED',
            before: `${claim.predicate} ${claim.object}`.slice(0, 200),
            after: null,
            direction: 'REMOVED',
            confidence: 'SINGLE_OBSERVATION',
            source: 'Claim evidence',
            evidenceState: 'OBSERVED',
            observedAt,
            keyword: null,
            actionId: null,
          });
        }
      }
      void meaningfulConflict;
      void normalizedBodySimilarity;
    }
    for (const [key, row] of prevByPage) {
      if (!currentKeys.has(key) && material.length < 100) {
        pushMaterial({
          entity: clean(row.url),
          entityType: 'PAGE',
          changeType: 'PAGE_REMOVED',
          before: 'observed in previous crawl',
          after: null,
          direction: 'REMOVED',
          confidence: 'SINGLE_OBSERVATION',
          source: 'Crawl history',
          evidenceState: 'OBSERVED',
          observedAt:
            crawlData?.current?.completedAt != null
              ? new Date(
                  crawlData.current.completedAt as string,
                ).toISOString()
              : null,
          keyword: null,
          actionId: null,
        });
      }
    }
    void contentChanges;

    /* ---- rank changes (existing events) ---- */
    const rankEvents = (
      ((rankChangesRes as Record<string, unknown> | null)
        ?.events as unknown[]) ??
      []
    ).slice(0, 50) as Array<Record<string, unknown>>;
    for (const event of rankEvents) {
      const kind = clean(event.kind).toUpperCase();
      const changeType: ChangeType = kind.includes('DECLIN')
        ? 'RANK_DECLINED'
        : kind.includes('NEW')
          ? 'RANK_NEW'
          : kind.includes('LOST') || kind.includes('LEFT')
            ? 'RANK_LOST'
            : 'RANK_IMPROVED';
      const direction =
        changeType === 'RANK_IMPROVED'
          ? rankDirection(
              numOrNull(event.before ?? event.previous),
              numOrNull(event.after ?? event.current),
            )
          : changeType === 'RANK_DECLINED'
            ? 'DECLINED'
            : changeType === 'RANK_NEW'
              ? 'APPEARED'
              : changeType === 'RANK_LOST'
                ? 'REMOVED'
                : 'CHANGED';
      pushMaterial({
        entity: clean(event.keyword) || 'Tracked keyword',
        entityType: 'KEYWORD',
        changeType,
        before:
          event.before != null
            ? String(event.before)
            : (event.previous != null
                ? String(event.previous)
                : null),
        after:
          event.after != null
            ? String(event.after)
            : (event.current != null
                ? String(event.current)
                : null),
        direction,
        confidence: 'SINGLE_OBSERVATION',
        source: 'RankObservation',
        evidenceState: 'OBSERVED',
        observedAt: clean(event.observedAt) || null,
        keyword: clean(event.keyword) || null,
        actionId: null,
      });
      timeline.push({
        observedAt: clean(event.observedAt) || null,
        entity: clean(event.keyword) || 'Tracked keyword',
        entityType: 'KEYWORD',
        changeType,
        detail: clean(event.statement) || 'Rank observation changed.',
        source: 'RankObservation',
        evidenceState: 'OBSERVED',
      });
    }

    /* ---- GSC changes (equal windows) ---- */
    const gscBefore = new Map<string, Record<string, unknown>>();
    for (const row of rowsOf(gscPrevRes).slice(0, MAX_ROWS)) {
      const key = norm(row.query ?? row.keyword);
      if (key && !gscBefore.has(key))
        gscBefore.set(key, row);
    }
    for (const row of rowsOf(gscCurRes).slice(0, MAX_ROWS)) {
      const key = norm(row.query ?? row.keyword);
      const prev = gscBefore.get(key);
      if (!prev) continue;
      const query = clean(row.query ?? row.keyword);
      const pairs: Array<{
        type: ChangeType;
        before: number | null;
        after: number | null;
        higher: boolean;
      }> = [
        {
          type: 'GSC_CLICKS_CHANGED',
          before: numOrNull(prev.clicks),
          after: numOrNull(row.clicks),
          higher: true,
        },
        {
          type: 'GSC_IMPRESSIONS_CHANGED',
          before: numOrNull(prev.impressions),
          after: numOrNull(row.impressions),
          higher: true,
        },
        {
          type: 'GSC_CTR_CHANGED',
          before: numOrNull(prev.ctr),
          after: numOrNull(row.ctr),
          higher: true,
        },
        {
          type: 'GSC_POSITION_CHANGED',
          before: numOrNull(prev.position),
          after: numOrNull(row.position),
          higher: false,
        },
      ];
      for (const pair of pairs) {
        if (pair.before === null || pair.after === null)
          continue;
        const direction = pair.higher
          ? higherDirection(pair.before, pair.after)
          : rankDirection(pair.before, pair.after);
        if (
          direction === 'UNCHANGED' ||
          direction === 'UNKNOWN'
        )
          continue;
        pushMaterial({
          entity: query,
          entityType: 'QUERY',
          changeType: pair.type,
          before: String(pair.before),
          after: String(pair.after),
          direction,
          confidence: 'SINGLE_OBSERVATION',
          source: 'GSC',
          evidenceState: 'VERIFIED',
          observedAt: windows.current.endDate,
          keyword: query,
          actionId: null,
        });
      }
    }

    /* ---- AI changes (prompt before/after split) ---- */
    const checksByPrompt = new Map<
      string,
      Array<Record<string, unknown>>
    >();
    for (const row of (checksRes ??
      []) as Array<Record<string, unknown>>) {
      const key = norm(row.query);
      if (!key) continue;
      const list = checksByPrompt.get(key) ?? [];
      list.push(row);
      checksByPrompt.set(key, list);
    }
    for (const [prompt, rows] of [...checksByPrompt.entries()].slice(
      0,
      100,
    )) {
      const sorted = [...rows].sort(
        (a, b) =>
          new Date(a.checkedAt as string).getTime() -
          new Date(b.checkedAt as string).getTime(),
      );
      if (sorted.length < 2) continue;
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const deltas: Array<{
        type: ChangeType;
        delta: ReturnType<typeof aiDelta>;
      }> = [
        {
          type: 'AI_MENTION_CHANGED',
          delta: aiDelta(
            first.mentioned === true,
            last.mentioned === true,
            'MENTION',
          ),
        },
        {
          type: 'AI_CITATION_CHANGED',
          delta: aiDelta(
            first.citationFound === true,
            last.citationFound === true,
            'CITATION',
          ),
        },
      ];
      for (const item of deltas) {
        if (
          item.delta === 'UNCHANGED' ||
          item.delta === 'UNKNOWN'
        )
          continue;
        pushMaterial({
          entity: prompt,
          entityType: 'AI_PROMPT',
          changeType: item.type,
          before: String(item.delta).includes('LOST')
            ? 'present'
            : 'absent',
          after: String(item.delta).includes('GAINED')
            ? 'present'
            : 'absent',
          direction: String(item.delta).includes('GAINED')
            ? 'APPEARED'
            : 'REMOVED',
          confidence: 'SINGLE_OBSERVATION',
          source: 'AiVisibilityCheck',
          evidenceState: 'OBSERVED',
          observedAt: clean(last.checkedAt) || null,
          keyword: prompt,
          actionId: null,
        });
        timeline.push({
          observedAt: clean(last.checkedAt) || null,
          entity: prompt,
          entityType: 'AI_PROMPT',
          changeType: item.type,
          detail: `${item.delta} between earliest and latest observations.`,
          source: 'AiVisibilityCheck',
          evidenceState: 'OBSERVED',
        });
      }
    }

    /* ---- demand changes (GSC query families) ---- */
    const prevQueries = new Set(
      rowsOf(gscPrevRes)
        .slice(0, MAX_ROWS)
        .map((row) => norm(row.query ?? row.keyword))
        .filter(Boolean),
    );
    const curQueries = new Set(
      rowsOf(gscCurRes)
        .slice(0, MAX_ROWS)
        .map((row) => norm(row.query ?? row.keyword))
        .filter(Boolean),
    );
    const demandNote =
      prevQueries.size === 0
        ? 'DEMAND_CHANGE_UNAVAILABLE'
        : `${[...curQueries].filter((query) => !prevQueries.has(query)).length} new observed queries; ${[...prevQueries].filter((query) => !curQueries.has(query)).length} no longer observed. Fabricated trends never created.`;

    /* ---- business changes ---- */
    const leads = (leadsRes ?? []) as Array<
      Record<string, unknown>
    >;
    const revenues = (revenueRes ?? []) as Array<
      Record<string, unknown>
    >;
    const windowStart = new Date(
      windows.current.startDate,
    ).getTime();
    const leadsInWindow = leads.filter(
      (row) =>
        new Date(row.createdAt as string).getTime() >=
        windowStart,
    ).length;
    if (leadsInWindow > 0) {
      pushMaterial({
        entity: 'Recorded leads',
        entityType: 'OUTCOME',
        changeType: 'LEAD_CHANGED',
        before: null,
        after: String(leadsInWindow),
        direction: 'CHANGED',
        confidence: 'SINGLE_OBSERVATION',
        source: 'Recorded outcomes',
        evidenceState: 'OBSERVED',
        observedAt: windows.current.endDate,
        keyword: null,
        actionId: null,
      });
    }

    /* ---- actions → change linkage ---- */
    const actions = (actionsRes ?? []) as Array<
      Record<string, unknown>
    >;
    const doneActions = actions.filter(
      (row) => clean(row.status) === 'DONE',
    );
    for (const action of doneActions.slice(0, 10)) {
      const completedAt = clean(action.completedAt);
      const actionUrl = normPage(
        (action.metadata as Record<string, unknown> | null)
          ?.targetPage ??
          (action.metadata as Record<string, unknown> | null)
            ?.pageUrl ??
          action.url,
      );
      const nearby = material.filter(
        (entry) =>
          entry.entityType !== 'OUTCOME' &&
          (actionUrl === null ||
            normPage(entry.entity) === actionUrl ||
            (entry.keyword !== null &&
              norm(
                (
                  action.metadata as Record<
                    string,
                    unknown
                  > | null
                )?.keyword,
              ) === norm(entry.keyword))),
      );
      if (nearby.length > 0) {
        for (const entry of nearby.slice(0, 3))
          entry.actionId = clean(action.id);
        timeline.push({
          observedAt: completedAt || null,
          entity: clean(action.title),
          entityType: 'ACTION',
          changeType: 'CONTENT_CHANGE',
          detail: `Action completed; ${nearby.length} observed change(s) follow in the timeline. Temporal association only.`,
          source: 'Action record',
          evidenceState: 'OBSERVED',
        });
      }
    }

    /* ---- ordering: existing priority first ---- */
    const demandPriorities = new Map<string, number>();
    try {
      const demand = (demandRes as {
        topNeeds?: Array<{ queries?: Array<{ text?: string }> }>;
      } | null)?.topNeeds;
      (demand ?? []).slice(0, 5).forEach((need, index) => {
        for (const query of need.queries ?? []) {
          const key = norm(
            (query as { text?: string }).text,
          );
          if (key && !demandPriorities.has(key))
            demandPriorities.set(key, index);
        }
      });
    } catch {
      /* Demand unavailable stays unavailable. */
    }
    const ordered = [...material].sort((a, b) => {
      const aPriority = demandPriorities.get(
        norm(a.keyword ?? a.entity),
      ) ?? 99;
      const bPriority = demandPriorities.get(
        norm(b.keyword ?? b.entity),
      ) ?? 99;
      if (aPriority !== bPriority)
        return aPriority - bPriority;
      const rank = (entry: (typeof material)[number]): number =>
        entry.entityType === 'PAGE'
          ? 0
          : entry.entityType === 'KEYWORD' ||
              entry.entityType === 'QUERY'
            ? 1
            : entry.entityType === 'AI_PROMPT'
              ? 2
              : 3;
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return a.id.localeCompare(b.id);
    });

    const orderedTimeline = [...timeline]
      .sort((a, b) =>
        clean(a.observedAt) < clean(b.observedAt)
          ? -1
          : clean(a.observedAt) > clean(b.observedAt)
            ? 1
            : 0,
      )
      .slice(0, 100);

    /* ---- divergence (Google vs AI per keyword) ---- */
    const divergence: Array<{
      keyword: string;
      search: string;
      ai: string;
      state: string;
    }> = [];
    const gscByQuery = new Map<string, string>();
    for (const entry of material) {
      if (
        entry.entityType === 'QUERY' &&
        entry.changeType === 'GSC_POSITION_CHANGED' &&
        entry.keyword &&
        !gscByQuery.has(entry.keyword)
      )
        gscByQuery.set(entry.keyword, entry.direction);
    }
    const aiByQuery = new Map<string, string>();
    for (const entry of material) {
      if (
        entry.entityType === 'AI_PROMPT' &&
        entry.keyword &&
        !aiByQuery.has(entry.keyword)
      )
        aiByQuery.set(entry.keyword, entry.direction);
    }
    for (const [keyword, search] of [...gscByQuery.entries()].slice(
      0,
      20,
    )) {
      const ai = aiByQuery.get(keyword) ?? null;
      const good = (direction: string): boolean =>
        direction === 'IMPROVED' || direction === 'APPEARED';
      const bad = (direction: string): boolean =>
        direction === 'DECLINED' || direction === 'REMOVED';
      const toDir = (direction: string): 'IMPROVED' | 'DECLINED' | 'UNCHANGED' | null =>
        good(direction)
          ? 'IMPROVED'
          : bad(direction)
            ? 'DECLINED'
            : direction === 'UNCHANGED'
              ? 'UNCHANGED'
              : null;
      const searchDir = toDir(search);
      const aiDir = ai !== null ? toDir(ai) : null;
      const state = searchAiDivergence(
        searchDir === 'IMPROVED'
          ? 'IMPROVED'
          : searchDir === 'DECLINED'
            ? 'DECLINED'
            : searchDir === 'UNCHANGED'
              ? 'UNCHANGED'
              : null,
        aiDir === 'IMPROVED'
          ? 'IMPROVED'
          : aiDir === 'DECLINED'
            ? 'DECLINED'
            : aiDir === 'UNCHANGED'
              ? 'UNCHANGED'
              : null,
      );
      if (state === 'SEARCH_AI_DIVERGENCE')
        divergence.push({
          keyword,
          search,
          ai: ai ?? 'UNKNOWN',
          state,
        });
    }

    const confidence = confidenceOf(
      material.length,
      new Set(material.map((entry) => entry.source)).size,
    );

    return {
      websiteId,
      summary: {
        total: material.length,
        content: material.filter((entry) =>
          [
            'TITLE_CHANGED',
            'META_CHANGED',
            'H1_CHANGED',
            'H2_CHANGED',
            'PAGE_ADDED',
            'PAGE_REMOVED',
          ].includes(entry.changeType),
        ).length,
        rank: material.filter((entry) =>
          entry.changeType.startsWith('RANK_'),
        ).length,
        ai: material.filter((entry) =>
          entry.changeType.startsWith('AI_'),
        ).length,
        business: material.filter(
          (entry) => entry.entityType === 'OUTCOME',
        ).length,
        confidence,
        evidenceState:
          material.length > 0 ? 'OBSERVED' : 'UNAVAILABLE',
        note: 'Temporal association only; tracker movement is not proof of a confirmed update.',
      },
      materialChanges: ordered.slice(0, 10).map((entry) => ({
        ...entry,
        explanation: explainChange({
          whatChanged: `${entry.changeType} on ${entry.entity}`,
          before: entry.before,
          after: entry.after,
          searchNote:
            entry.source === 'GSC' || entry.source === 'RankObservation'
              ? `${entry.direction} observed`
              : null,
          aiNote:
            entry.source === 'AiVisibilityCheck'
              ? `${entry.direction} observed`
              : null,
        }),
      })),
      timeline: orderedTimeline,
      contentChanges: ordered
        .filter((entry) => entry.entityType === 'PAGE')
        .slice(0, 20),
      claimChanges: ordered
        .filter((entry) => entry.entityType === 'CLAIM')
        .slice(0, 20),
      rankChanges: ordered
        .filter(
          (entry) =>
            entry.entityType === 'KEYWORD' ||
            entry.entityType === 'QUERY',
        )
        .slice(0, 20),
      gscChanges: ordered
        .filter((entry) => entry.source === 'GSC')
        .slice(0, 20),
      aiChanges: ordered
        .filter(
          (entry) =>
            entry.entityType === 'AI_PROMPT' ||
            entry.source === 'AiVisibilityCheck',
        )
        .slice(0, 20),
      demandChanges: {
        note: demandNote,
        evidenceState:
          demandNote === 'DEMAND_CHANGE_UNAVAILABLE'
            ? 'UNAVAILABLE'
            : 'OBSERVED',
      },
      competitorChanges: {
        note: 'Competitor change evidence is unavailable without historical competitor observations. No new crawler is built.',
        evidenceState: 'UNAVAILABLE',
      },
      businessChanges: {
        leads: leads.length,
        revenue: revenues.length,
        evidenceState:
          leads.length > 0 || revenues.length > 0
            ? 'OBSERVED'
            : 'UNAVAILABLE',
      },
      divergence,
      evidence: {
        note: 'GSC is VERIFIED; rank SERP rows, AI provider rows and crawls are OBSERVED; GenAI aggregates stay aggregate; manual rows are OBSERVED_MANUAL; inferred stays INFERRED.',
      },
      limitations: CANNOT_MEASURE,
      nextBestActions: (
        nbaRes as Record<string, unknown> | null
      ) ?? {
        evidenceState: 'UNAVAILABLE',
        statement:
          'Next best action unavailable for this website right now.',
      },
      measurement: {
        note: 'Change windows reuse Phase 23 logic (7/14/28/90, equal before/after). Recalculation never rewrites immutable baselines.',
      },
      freshness: {
        window: windows.current,
        note: 'Every event carries observedAt with dataThrough; stale data is never silent.',
      },
      capabilities: {
        note: 'Capability states come from the integration hub where connected.',
      },
      billing: {
        charged: false,
        note: 'Read-only change intelligence. No new meters; provider calls remain on existing rails.',
      },
    };
  }

  async getPageChanges(
    organizationId: string,
    websiteId: string,
    url: string,
  ) {
    if (!websiteId)
      throw new BadRequestException(
        'websiteId is required',
      );
    const full = await this.getChangeSummary(
      organizationId,
      websiteId,
    );
    const key = normPage(url);
    const changes = (
      full.materialChanges as Array<{ entity: string }>
    ).filter(
      (entry) => normPage(entry.entity) === key,
    );
    const timeline = (
      full.timeline as Array<{ entity: string }>
    ).filter(
      (entry) => normPage(entry.entity) === key,
    );
    return {
      websiteId,
      url: clean(url),
      total: changes.length,
      changes,
      timeline,
      evidenceState:
        changes.length > 0 ? 'OBSERVED' : 'UNAVAILABLE',
      limitations: CANNOT_MEASURE,
      billing: { charged: false },
    };
  }

  async getKeywordChanges(
    organizationId: string,
    websiteId: string,
    keyword: string,
  ) {
    if (!websiteId)
      throw new BadRequestException(
        'websiteId is required',
      );
    const full = await this.getChangeSummary(
      organizationId,
      websiteId,
    );
    const key = norm(keyword);
    const changes = (
      full.materialChanges as Array<{
        keyword: string | null;
        entity: string;
      }>
    ).filter(
      (entry) =>
        (entry.keyword !== null &&
          norm(entry.keyword) === key) ||
        norm(entry.entity) === key,
    );
    return {
      websiteId,
      keyword: clean(keyword),
      total: changes.length,
      changes,
      evidenceState:
        changes.length > 0 ? 'OBSERVED' : 'UNAVAILABLE',
      limitations: CANNOT_MEASURE,
      billing: { charged: false },
    };
  }

  async getActionChanges(
    organizationId: string,
    websiteId: string,
    actionId: string,
  ) {
    if (!websiteId)
      throw new BadRequestException(
        'websiteId is required',
      );
    const full = await this.getChangeSummary(
      organizationId,
      websiteId,
    );
    const changes = (
      full.materialChanges as Array<{
        actionId: string | null;
      }>
    ).filter((entry) => entry.actionId === actionId);
    const timeline = (
      full.timeline as Array<{
        entityType: string;
        detail: string;
      }>
    ).filter(
      (entry) =>
        entry.entityType === 'ACTION' ||
        changes.length > 0,
    );
    return {
      websiteId,
      actionId,
      total: changes.length,
      changes,
      timeline: timeline.slice(0, 50),
      evidenceState:
        changes.length > 0 ? 'OBSERVED' : 'UNAVAILABLE',
      note: 'Unplanned changes carry no actionId; measurement reuses Phase 23.',
      limitations: CANNOT_MEASURE,
      billing: { charged: false },
    };
  }
}

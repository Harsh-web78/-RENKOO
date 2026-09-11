import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { GoogleService } from '../google/google.service';
import { KeywordStrategyService } from './keyword-strategy.service';
import { ContentStrategyService } from './content-strategy.service';

/*
 * =========================================================
 * SEARCH BASELINE 1.0 — canonical "Where am I now?"
 * composition. COMPOSES existing evidence, scores nothing
 * new:
 *  - GSC observations (queries, query×page, daily series)
 *  - Strategy 5.0 priorities / buckets / mappings
 *  - ContentStrategyLink + clusters (persisted)
 *  - Recommendation / Action rows (existing queue)
 *  - Crawl + CrawlLink facts (counts only)
 *
 * Evidence states: VERIFIED (measured third-party data:
 * GSC), OBSERVED (first-party crawl/graph rows),
 * INFERRED (deterministic rules over evidence),
 * ESTIMATED (explicit approximations, labeled),
 * UNAVAILABLE (never zero, never guessed).
 * =========================================================
 */

export type BaselineEvidence =
  | 'VERIFIED'
  | 'OBSERVED'
  | 'INFERRED'
  | 'ESTIMATED'
  | 'UNAVAILABLE';

export interface BaselineWindows {
  current: { startDate: string; endDate: string };
  previous: { startDate: string; endDate: string };
}

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/*
 * Windows end yesterday (GSC freshness lag) and the
 * previous window is the equal-length period directly
 * before — compatible windows only, always labeled.
 */
export function resolveBaselineWindows(
  days: number,
  now: Date = new Date(),
): BaselineWindows {
  const allowed = [7, 28, 90];
  if (!allowed.includes(days)) {
    throw new BadRequestException(
      'days must be one of 7, 28, 90',
    );
  }
  const fmt = (d: Date) =>
    d.toISOString().slice(0, 10);
  const end = new Date(now);
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevEnd.getDate() - (days - 1));
  return {
    current: {
      startDate: fmt(start),
      endDate: fmt(end),
    },
    previous: {
      startDate: fmt(prevStart),
      endDate: fmt(prevEnd),
    },
  };
}

export interface QueryTotals {
  clicks: number;
  impressions: number;
  ctr: number;
  avgPosition: number;
  keywords: number;
}

export function aggregateQueryRows(
  rows: Array<{
    clicks?: unknown;
    impressions?: unknown;
    position?: unknown;
  }>,
): Omit<QueryTotals, 'ctr' | 'avgPosition'> & {
  ctr: number;
  avgPosition: number | null;
} {
  let clicks = 0;
  let impressions = 0;
  let weighted = 0;
  for (const row of rows) {
    const c = num(row.clicks);
    const i = num(row.impressions);
    clicks += c;
    impressions += i;
    weighted += num(row.position) * i;
  }
  return {
    clicks: Math.round(clicks),
    impressions: Math.round(impressions),
    ctr: impressions > 0 ? clicks / impressions : 0,
    /* ESTIMATED when derived: impression-weighted mean
       over the returned (capped) row set. */
    avgPosition:
      impressions > 0 ? weighted / impressions : null,
    keywords: rows.length,
  };
}

export function bandCounts(
  rows: Array<{ position?: unknown }>,
): {
  top3: number;
  top10: number;
  top20: number;
  top100: number;
} {
  let top3 = 0;
  let top10 = 0;
  let top20 = 0;
  let top100 = 0;
  for (const row of rows) {
    const pos = num(row.position);
    if (pos <= 0) continue;
    if (pos <= 100) top100++;
    if (pos <= 20) top20++;
    if (pos <= 10) top10++;
    if (pos <= 3) top3++;
  }
  return { top3, top10, top20, top100 };
}

export interface MoverRow {
  query: string;
  page: string | null;
  position: number | null;
  positionDelta: number | null;
  clicks: number;
  clicksDelta: number;
  impressions: number;
  impressionsDelta: number;
  impressionsDeltaPct: number | null;
  ctr: number;
}

/*
 * Winners/losers from valid period comparison only:
 * both windows present, minimum demand gate
 * (combined impressions >= 100) and a materiality gate
 * (|click delta| >= 5 or |position delta| >= 2).
 * Sorted by click impact — existing numbers, no score.
 */
export function pickMovers(
  current: Array<{
    query?: unknown;
    clicks?: unknown;
    impressions?: unknown;
    ctr?: unknown;
    position?: unknown;
  }>,
  previous: Array<{
    query?: unknown;
    clicks?: unknown;
    impressions?: unknown;
    ctr?: unknown;
    position?: unknown;
  }>,
  pagesByQuery: Map<string, string>,
  limit = 5,
): { winners: MoverRow[]; losers: MoverRow[] } {
  const prevByQuery = new Map<string, any>();
  for (const row of previous) {
    const key = String(row.query ?? '').toLowerCase();
    if (key && !prevByQuery.has(key)) {
      prevByQuery.set(key, row);
    }
  }
  const scored: Array<
    MoverRow & { clicksDelta: number }
  > = [];
  const seenCurrent = new Set<string>();
  for (const row of current) {
    const query = String(row.query ?? '');
    const key = query.toLowerCase();
    if (!key) continue;
    /* Duplicate rows for one query collapse to the
       first occurrence — never double-counted. */
    if (seenCurrent.has(key)) continue;
    seenCurrent.add(key);
    const prev = prevByQuery.get(key);
    if (!prev) continue;
    const clicks = num(row.clicks);
    const impressions = num(row.impressions);
    const prevClicks = num(prev.clicks);
    const prevImpr = num(prev.impressions);
    if (impressions + prevImpr < 100) continue;
    const clicksDelta = clicks - prevClicks;
    const pos = num(row.position) || null;
    const prevPos = num(prev.position) || null;
    const positionDelta =
      pos !== null && prevPos !== null
        ? +(prevPos - pos).toFixed(1)
        : null;
    if (
      Math.abs(clicksDelta) < 5 &&
      (positionDelta === null ||
        Math.abs(positionDelta) < 2)
    ) {
      continue;
    }
    const imprDelta = impressions - prevImpr;
    scored.push({
      query,
      page: pagesByQuery.get(key) ?? null,
      position: pos,
      positionDelta,
      clicks: Math.round(clicks),
      clicksDelta: Math.round(clicksDelta),
      impressions: Math.round(impressions),
      impressionsDelta: Math.round(imprDelta),
      impressionsDeltaPct:
        prevImpr > 0 ? imprDelta / prevImpr : null,
      ctr: impressions > 0 ? clicks / impressions : 0,
    });
  }
  const winners = scored
    .filter((r) => r.clicksDelta > 0)
    .sort((a, b) => b.clicksDelta - a.clicksDelta)
    .slice(0, limit);
  const losers = scored
    .filter((r) => r.clicksDelta < 0)
    .sort((a, b) => a.clicksDelta - b.clicksDelta)
    .slice(0, limit);
  return { winners, losers };
}

export function bestPageByQuery(
  queryPages: Array<{
    query?: unknown;
    page?: unknown;
    impressions?: unknown;
  }>,
): Map<string, string> {
  const best = new Map<string, { page: string; impr: number }>();
  for (const row of queryPages) {
    const key = String(row.query ?? '').toLowerCase();
    const page = String(row.page ?? '');
    if (!key || !page) continue;
    const impr = num(row.impressions);
    const prev = best.get(key);
    if (!prev || impr > prev.impr) {
      best.set(key, { page, impr });
    }
  }
  const out = new Map<string, string>();
  for (const [key, value] of best) {
    out.set(key, value.page);
  }
  return out;
}

export interface PageRow {
  url: string;
  clicks: number;
  clicksDelta: number | null;
  impressions: number;
  impressionsDelta: number | null;
  ctr: number;
  avgPosition: number | null;
  keywords: string[];
  topKeywords: string[];
  mapping: string | null;
  priority: string | null;
}

export function aggregatePages(
  current: Array<{
    query?: unknown;
    page?: unknown;
    clicks?: unknown;
    impressions?: unknown;
    ctr?: unknown;
    position?: unknown;
  }>,
  previous: Array<{
    query?: unknown;
    page?: unknown;
    clicks?: unknown;
    impressions?: unknown;
  }>,
  strategyByPage: Map<
    string,
    { mapping: string; priority: string }
  >,
  limit = 8,
): PageRow[] {
  const normUrl = (u: unknown) =>
    String(u ?? '')
      .trim()
      .toLowerCase()
      .replace(/\/$/, '');
  const prevByPage = new Map<
    string,
    { clicks: number; impressions: number }
  >();
  for (const row of previous) {
    const key = normUrl(row.page);
    if (!key) continue;
    const prev = prevByPage.get(key) ?? {
      clicks: 0,
      impressions: 0,
    };
    prev.clicks += num(row.clicks);
    prev.impressions += num(row.impressions);
    prevByPage.set(key, prev);
  }
  const byPage = new Map<
    string,
    {
      url: string;
      clicks: number;
      impressions: number;
      weighted: number;
      keywords: Map<string, number>;
    }
  >();
  for (const row of current) {
    const url = String(row.page ?? '');
    const key = normUrl(url);
    if (!key) continue;
    let entry = byPage.get(key);
    if (!entry) {
      entry = {
        url,
        clicks: 0,
        impressions: 0,
        weighted: 0,
        keywords: new Map(),
      };
      byPage.set(key, entry);
    }
    const c = num(row.clicks);
    const i = num(row.impressions);
    entry.clicks += c;
    entry.impressions += i;
    entry.weighted += num(row.position) * i;
    const query = String(row.query ?? '');
    if (query) {
      entry.keywords.set(
        query,
        (entry.keywords.get(query) ?? 0) + i,
      );
    }
  }
  const rows: PageRow[] = [...byPage.values()].map(
    (entry) => {
      const prev = prevByPage.get(
        normUrl(entry.url),
      );
      const strategy = strategyByPage.get(
        normUrl(entry.url),
      );
      const topKeywords = [...entry.keywords.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([query]) => query);
      return {
        url: entry.url,
        clicks: Math.round(entry.clicks),
        clicksDelta: prev
          ? Math.round(entry.clicks - prev.clicks)
          : null,
        impressions: Math.round(entry.impressions),
        impressionsDelta: prev
          ? Math.round(entry.impressions - prev.impressions)
          : null,
        ctr:
          entry.impressions > 0
            ? entry.clicks / entry.impressions
            : 0,
        avgPosition:
          entry.impressions > 0
            ? entry.weighted / entry.impressions
            : null,
        keywords: [...entry.keywords.keys()],
        topKeywords,
        mapping: strategy?.mapping ?? null,
        priority: strategy?.priority ?? null,
      };
    },
  );
  return rows
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, limit);
}

/*
 * Dominant insight from real numbers only. First
 * matching rule wins; every branch cites its inputs.
 */
export function buildAha(input: {
  gscAvailable: boolean;
  top10: number;
  strikingHigh: number;
  strikingTotal: number;
  bestWinner: {
    query: string;
    clicksDelta: number;
  } | null;
  worstLoser: {
    query: string;
    clicksDelta: number;
  } | null;
  clicks: number;
  clicksDeltaPct: number | null;
}): { title: string; body: string; kind: string } {
  if (!input.gscAvailable) {
    return {
      title: 'Not enough verified search data yet',
      body: 'Connect Google Search Console to unlock verified ranking and search performance data.',
      kind: 'EMPTY',
    };
  }
  if (input.strikingHigh > 0) {
    return {
      title: 'Biggest opportunity',
      body: `This site already ranks in the Top 10 for ${input.top10} searches, including ${input.strikingHigh} high-priority striking-distance keywords. This is the strongest near-term search opportunity.`,
      kind: 'OPPORTUNITY',
    };
  }
  if (input.strikingTotal > 0) {
    return {
      title: 'Biggest opportunity',
      body: `${input.strikingTotal} keywords sit in striking distance (positions 4–20) with real impressions. Small page improvements here can earn page-one visibility.`,
      kind: 'OPPORTUNITY',
    };
  }
  if (
    input.bestWinner &&
    input.bestWinner.clicksDelta >= 10
  ) {
    return {
      title: 'Momentum worth protecting',
      body: `“${input.bestWinner.query}” gained ${input.bestWinner.clicksDelta} clicks this period. Defend the page before chasing new topics.`,
      kind: 'MOMENTUM',
    };
  }
  if (
    input.worstLoser &&
    input.worstLoser.clicksDelta <= -10
  ) {
    return {
      title: 'Decline needs attention',
      body: `“${input.worstLoser.query}” lost ${Math.abs(input.worstLoser.clicksDelta)} clicks this period. A refresh is worth investigating.`,
      kind: 'DECLINE',
    };
  }
  return {
    title: 'Baseline established',
    body: `${input.clicks.toLocaleString('en-US')} clicks in the current window${input.clicksDeltaPct !== null ? ` (${input.clicksDeltaPct >= 0 ? '+' : ''}${Math.round(input.clicksDeltaPct * 100)}% vs previous)` : ''}. Build strategy depth to surface bigger opportunities.`,
    kind: 'BASELINE',
  };
}

async function settled<T>(
  fn: () => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false }> {
  try {
    return { ok: true, data: await fn() };
  } catch {
    return { ok: false };
  }
}

@Injectable()
export class SearchBaselineService {
  private readonly logger = new Logger(
    SearchBaselineService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleService: GoogleService,
    private readonly strategyService: KeywordStrategyService,
    private readonly contentStrategy: ContentStrategyService,
  ) {}

  async getBaseline(
    organizationId: string,
    dto: { websiteId: string; days?: number },
  ): Promise<Record<string, any>> {
    /* Strict: never silently substitute a different
       comparison window than requested. */
    const days = dto.days ?? 28;
    const website =
      await this.prisma.website.findFirst({
        where: {
          id: dto.websiteId,
          organizationId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          url: true,
        },
      });
    if (!website) {
      throw new NotFoundException(
        'Website not found',
      );
    }
    const windows = resolveBaselineWindows(days);
    const { current, previous } = windows;

    /* One parallel wave: GSC reads, strategy, links,
       recommendations, actions, crawl facts. Each leg
       degrades independently — a failure never zeroes
       another section. */
    const [
      queriesCur,
      queriesPrev,
      queryPagesCur,
      queryPagesPrev,
      dailyCur,
      dailyPrev,
      strategy,
      links,
      refreshRecs,
      linkRecs,
      openActions,
      crawl,
    ] = await Promise.all([
      settled(() =>
        this.googleService.getSearchQueries(
          organizationId,
          current.startDate,
          current.endDate,
        ),
      ),
      settled(() =>
        this.googleService.getSearchQueries(
          organizationId,
          previous.startDate,
          previous.endDate,
        ),
      ),
      settled(() =>
        this.googleService.getQueryPages(
          organizationId,
          current.startDate,
          current.endDate,
        ),
      ),
      settled(() =>
        this.googleService.getQueryPages(
          organizationId,
          previous.startDate,
          previous.endDate,
        ),
      ),
      settled(() =>
        this.googleService.getSearchAnalytics(
          organizationId,
          current.startDate,
          current.endDate,
        ),
      ),
      settled(() =>
        this.googleService.getSearchAnalytics(
          organizationId,
          previous.startDate,
          previous.endDate,
        ),
      ),
      settled(() =>
        this.strategyService.strategy(organizationId, {
          websiteId: dto.websiteId,
          startDate: current.startDate,
          endDate: current.endDate,
          limit: 100,
        }),
      ),
      settled(() =>
        this.contentStrategy.getLinks(
          organizationId,
          dto.websiteId,
        ),
      ),
      settled(() =>
        this.prisma.recommendation.findMany({
          where: {
            organizationId,
            websiteId: dto.websiteId,
            source: 'CONTENT',
            status: { in: ['OPEN', 'IN_PROGRESS'] },
          },
          orderBy: { updatedAt: 'desc' },
          take: 50,
        }),
      ),
      settled(() =>
        this.prisma.recommendation.findMany({
          where: {
            organizationId,
            websiteId: dto.websiteId,
            source: 'CONTENT',
            type: 'INTERNAL_LINK_OPPORTUNITY',
            status: { in: ['OPEN', 'IN_PROGRESS'] },
          },
          orderBy: { updatedAt: 'desc' },
          take: 20,
        }),
      ),
      settled(() =>
        this.prisma.action.findMany({
          where: {
            organizationId,
            websiteId: dto.websiteId,
            status: { in: ['TODO', 'IN_PROGRESS'] },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
      ),
      settled(() => this.crawlFacts(organizationId, dto.websiteId)),
    ]);

    const gscAvailable =
      queriesCur.ok && queriesPrev.ok;
    const curRows: any[] = gscAvailable
      ? ((queriesCur as any).data.rows ?? [])
      : [];
    const prevRows: any[] = gscAvailable
      ? ((queriesPrev as any).data.rows ?? [])
      : [];
    const curTotals = aggregateQueryRows(curRows);
    const prevTotals = aggregateQueryRows(prevRows);
    const bands = bandCounts(curRows);
    const pagesByQuery = gscAvailable
      ? bestPageByQuery(
          ((queryPagesCur as any).ok
            ? (queryPagesCur as any).data.rows ?? []
            : []) as any[],
        )
      : new Map<string, string>();
    const { winners, losers } = gscAvailable
      ? pickMovers(curRows, prevRows, pagesByQuery, 5)
      : { winners: [], losers: [] };

    const strategyData = strategy.ok
      ? (strategy as any).data
      : null;
    const strategyByPage = new Map<
      string,
      { mapping: string; priority: string }
    >();
    if (strategyData) {
      for (const o of strategyData.opportunities ?? []) {
        const key = String(o.targetPage ?? '')
          .trim()
          .toLowerCase()
          .replace(/\/$/, '');
        if (key && !strategyByPage.has(key)) {
          strategyByPage.set(key, {
            mapping: o.pageMapping,
            priority: o.priority,
          });
        }
      }
    }

    const striking = this.buildStriking(
      strategyData,
      gscAvailable ? curRows : [],
      pagesByQuery,
    );
    const pages = gscAvailable
      ? aggregatePages(
          ((queryPagesCur as any).ok
            ? (queryPagesCur as any).data.rows ?? []
            : []) as any[],
          ((queryPagesPrev as any).ok
            ? (queryPagesPrev as any).data.rows ?? []
            : []) as any[],
          strategyByPage,
          8,
        )
      : [];

    const opportunities = this.buildOpportunities({
      striking,
      strategyData,
      refreshRecs: refreshRecs.ok
        ? (refreshRecs as any).data
        : [],
      linkRecs: linkRecs.ok
        ? (linkRecs as any).data
        : [],
      crawl: crawl.ok ? (crawl as any).data : null,
    });
    const nextMoves = this.buildNextMoves({
      opportunities,
      refreshRecs: refreshRecs.ok
        ? (refreshRecs as any).data
        : [],
      linkRecs: linkRecs.ok
        ? (linkRecs as any).data
        : [],
      openActions: openActions.ok
        ? (openActions as any).data
        : [],
    });
    const aha = buildAha({
      gscAvailable,
      top10: bands.top10,
      strikingHigh: striking.filter(
        (s: any) => s.priority === 'HIGH',
      ).length,
      strikingTotal: striking.length,
      bestWinner: winners[0]
        ? {
            query: winners[0].query,
            clicksDelta: winners[0].clicksDelta,
          }
        : null,
      worstLoser: losers[0]
        ? {
            query: losers[0].query,
            clicksDelta: losers[0].clicksDelta,
          }
        : null,
      clicks: curTotals.clicks,
      clicksDeltaPct:
        prevTotals.clicks > 0
          ? (curTotals.clicks - prevTotals.clicks) /
            prevTotals.clicks
          : null,
    });

    const pct = (
      cur: number,
      prev: number,
    ): number | null =>
      prev > 0 ? (cur - prev) / prev : null;

    return {
      website,
      generatedAt: new Date().toISOString(),
      period: { days, ...windows },
      gscConnected: gscAvailable,
      evidence: {
        gsc: gscAvailable ? 'VERIFIED' : 'UNAVAILABLE',
        strategy: strategyData
          ? 'INFERRED'
          : 'UNAVAILABLE',
        content: links.ok ? 'OBSERVED' : 'UNAVAILABLE',
        crawl: crawl.ok ? 'OBSERVED' : 'UNAVAILABLE',
        averages: 'ESTIMATED',
        breakdowns: 'UNAVAILABLE',
      },
      unavailable: {
        brandSplit:
          'Brand / non-brand split needs business-name context not available to this endpoint.',
        deviceSplit:
          'Device breakdown is not exposed by the current Search Console wrapper.',
        countrySplit:
          'Country breakdown is not exposed by the current Search Console wrapper.',
      },
      summary: gscAvailable
        ? {
            clicks: {
              value: curTotals.clicks,
              delta: curTotals.clicks - prevTotals.clicks,
              deltaPct: pct(
                curTotals.clicks,
                prevTotals.clicks,
              ),
              evidence: 'VERIFIED',
            },
            impressions: {
              value: curTotals.impressions,
              delta:
                curTotals.impressions -
                prevTotals.impressions,
              deltaPct: pct(
                curTotals.impressions,
                prevTotals.impressions,
              ),
              evidence: 'VERIFIED',
            },
            ctr: {
              value: curTotals.ctr,
              deltaPp: curTotals.ctr - prevTotals.ctr,
              evidence: 'VERIFIED',
            },
            avgPosition: {
              value: curTotals.avgPosition,
              delta:
                curTotals.avgPosition !== null &&
                prevTotals.avgPosition !== null
                  ? +(
                      prevTotals.avgPosition -
                      curTotals.avgPosition
                    ).toFixed(1)
                  : null,
              evidence: 'ESTIMATED',
            },
          }
        : null,
      visibility: gscAvailable ? bands : null,
      trend: this.buildTrend(
        dailyCur.ok ? (dailyCur as any).data : null,
        dailyPrev.ok ? (dailyPrev as any).data : null,
      ),
      aha,
      striking,
      winners,
      losers,
      pages,
      opportunities,
      nextMoves,
      health: this.buildHealth({
        gscAvailable,
        bands,
        strategyData,
        crawl: crawl.ok ? (crawl as any).data : null,
        linkCount: linkRecs.ok
          ? (linkRecs as any).data.length
          : 0,
      }),
    };
  }

  private async crawlFacts(
    organizationId: string,
    websiteId: string,
  ): Promise<{
    crawlId: string | null;
    completedAt: string | null;
    pages: number;
    issues: number;
    links: number;
  } | null> {
    try {
      const crawl =
        await this.prisma.crawl.findFirst({
          where: {
            websiteId,
            status: 'COMPLETED',
          },
          orderBy: { completedAt: 'desc' },
          select: {
            id: true,
            completedAt: true,
          },
        });
      if (!crawl) return null;
      const website =
        await this.prisma.website.findFirst({
          where: { id: websiteId, organizationId },
          select: { id: true },
        });
      if (!website) return null;
      const [pages, issues, links] =
        await Promise.all([
          this.prisma.crawlPage.count({
            where: { crawlId: crawl.id },
          }),
          this.prisma.seoIssue.count({
            where: {
              crawlPage: { crawlId: crawl.id },
            },
          }),
          (this.prisma as any).crawlLink
            ? await (this.prisma as any).crawlLink.count({
                where: {
                  organizationId,
                  websiteId,
                  crawlId: crawl.id,
                },
              })
            : 0,
        ]);
      return {
        crawlId: crawl.id,
        completedAt: crawl.completedAt
          ? new Date(crawl.completedAt).toISOString()
          : null,
        pages,
        issues,
        links,
      };
    } catch {
      return null;
    }
  }

  private buildTrend(
    dailyCur: any,
    dailyPrev: any,
  ): {
    available: boolean;
    points: Array<{
      label: string;
      current: number | null;
      previous: number | null;
    }>;
  } {
    if (!dailyCur || !Array.isArray(dailyCur.rows)) {
      return { available: false, points: [] };
    }
    const prevRows: any[] = Array.isArray(
      dailyPrev?.rows,
    )
      ? dailyPrev.rows
      : [];
    const prevByIndex = prevRows.map((r) =>
      num(r.clicks),
    );
    /* Align by day index (equal-length windows) so the
       comparison is always compatible. */
    const points = (dailyCur.rows as any[]).map(
      (row, i) => ({
        label: String(
          row.keys?.[0] ?? row.date ?? `Day ${i + 1}`,
        ).slice(5),
        current: num(row.clicks),
        previous:
          i < prevByIndex.length
            ? prevByIndex[
                prevByIndex.length -
                  (dailyCur.rows.length - i)
              ] ?? null
            : null,
      }),
    );
    return { available: true, points };
  }

  private buildStriking(
    strategyData: any,
    curRows: any[],
    pagesByQuery: Map<string, string>,
  ): Array<Record<string, any>> {
    /* Reuse Strategy 5.0 first — never rescore. */
    if (strategyData) {
      const rows = (strategyData.opportunities ?? [])
        .filter(
          (o: any) =>
            o.bucket === 'QUICK_WIN' ||
            (typeof o.position === 'number' &&
              o.position >= 4 &&
              o.position <= 20 &&
              (o.impressions ?? 0) >= 100),
        )
        .sort(
          (a: any, b: any) =>
            (a.priority === 'HIGH'
              ? 0
              : a.priority === 'MEDIUM'
                ? 1
                : 2) -
              (b.priority === 'HIGH'
                ? 0
                : b.priority === 'MEDIUM'
                  ? 1
                  : 2) ||
            (b.impressions ?? 0) -
              (a.impressions ?? 0),
        )
        .slice(0, 8)
        .map((o: any) => ({
          keyword: o.keyword,
          position: o.position,
          impressions: o.impressions,
          ctr: o.ctr,
          page: o.targetPage,
          intent: o.intent,
          priority: o.priority,
          priorityScore: o.priorityScore,
          mapping: o.pageMapping,
          why: (o.priorityReasons ?? []).slice(0, 2),
          evidence: 'Strategy 5.0 + GSC',
          evidenceState: 'INFERRED',
        }));
      if (rows.length > 0) return rows;
    }
    /* GSC-only fallback, honestly labeled. */
    return curRows
      .filter(
        (r: any) =>
          num(r.position) >= 4 &&
          num(r.position) <= 10 &&
          num(r.impressions) >= 200,
      )
      .sort(
        (a: any, b: any) =>
          num(b.impressions) - num(a.impressions),
      )
      .slice(0, 8)
      .map((r: any) => ({
        keyword: String(r.query ?? ''),
        position: +num(r.position).toFixed(1),
        impressions: Math.round(num(r.impressions)),
        ctr: num(r.ctr),
        page:
          pagesByQuery.get(
            String(r.query ?? '').toLowerCase(),
          ) ?? null,
        intent: null,
        priority: null,
        priorityScore: null,
        mapping: null,
        why: [
          'Positions 4–10 with real impressions — page-one reach without new content.',
        ],
        evidence: 'GSC only (strategy unavailable)',
        evidenceState: 'VERIFIED',
      }));
  }

  private buildOpportunities(input: {
    striking: Array<Record<string, any>>;
    strategyData: any;
    refreshRecs: any[];
    linkRecs: any[];
    crawl: {
      issues: number;
      pages: number;
    } | null;
  }): Array<Record<string, any>> {
    const out: Array<Record<string, any>> = [];
    const first = input.striking[0];
    if (first) {
      out.push({
        rank: out.length + 1,
        kind: 'STRIKING',
        title: `Improve ${shortPage(first.page) ?? `"${first.keyword}"`}`,
        detail: `Position ${first.position ?? '?'} · ${(
          first.impressions ?? 0
        ).toLocaleString('en-US')} impressions`,
        why: first.why ?? [],
        evidence: [first.evidence ?? 'GSC'],
        action: {
          label: 'View opportunity',
          href: '/keywords?tab=strategy',
        },
      });
    }
    for (const rec of input.refreshRecs.slice(0, 2)) {
      const query =
        rec.metadata?.query ?? rec.title ?? '';
      out.push({
        rank: out.length + 1,
        kind: 'REFRESH',
        title: `Refresh content for “${query}”`,
        detail:
          rec.description ??
          'Measured decline over comparable windows.',
        why: [
          'Clicks or impressions fell vs the previous period (OBSERVED).',
        ],
        evidence: ['GSC decline', 'Content Engine'],
        action: {
          label: 'Open Content',
          href: '/content',
        },
      });
    }
    for (const rec of input.linkRecs.slice(0, 2)) {
      const meta = rec.metadata ?? {};
      if (!meta.sourceUrl || !meta.targetUrl) continue;
      if (out.length >= 8) break;
      out.push({
        rank: out.length + 1,
        kind: 'INTERNAL_LINK',
        title: `Link ${shortPage(meta.sourceUrl)} → ${shortPage(meta.targetUrl)}`,
        detail: `Suggested anchor “${meta.suggestedAnchor ?? '—'}”`,
        why: [
          meta.reason ??
            'Supporting page can pass relevance to a priority target (INFERENCE).',
        ],
        evidence: ['Strategy', 'Crawl graph'],
        action: {
          label: 'Review links',
          href: '/keywords?tab=strategy',
        },
      });
    }
    const consolidate = (
      input.strategyData?.opportunities ?? []
    ).find(
      (o: any) =>
        o.bucket === 'CONSOLIDATE' &&
        o.priority !== 'LOW',
    );
    if (consolidate && out.length < 8) {
      out.push({
        rank: out.length + 1,
        kind: 'CONSOLIDATE',
        title: `Consolidate pages for “${consolidate.keyword}”`,
        detail: `${(consolidate.priorityReasons ?? []).slice(0, 1).join(' ') || 'Multiple pages compete for one keyword.'}`,
        why: [
          'Several URLs earn impressions for one query — authority is split (OBSERVED).',
        ],
        evidence: ['GSC', 'Strategy 5.0'],
        action: {
          label: 'View opportunity',
          href: '/keywords?tab=strategy',
        },
      });
    }
    if (input.crawl && input.crawl.issues > 0) {
      out.push({
        rank: out.length + 1,
        kind: 'TECHNICAL',
        title: `Fix ${input.crawl.issues} crawl issues`,
        detail: `Across ${input.crawl.pages} crawled pages. Technical blockers cap what content can earn.`,
        why: [
          'Crawl evidence shows fixable blockers on real pages (OBSERVED).',
        ],
        evidence: ['Crawl'],
        action: {
          label: 'Open Technical SEO',
          href: '/technical-seo',
        },
      });
    }
    const grow = (
      input.strategyData?.opportunities ?? []
    ).find(
      (o: any) =>
        (o.bucket === 'GROW' ||
          o.bucket === 'CREATE') &&
        o.priority === 'HIGH',
    );
    if (grow && out.length < 8) {
      out.push({
        rank: out.length + 1,
        kind: grow.bucket,
        title:
          grow.bucket === 'CREATE'
            ? `Create content for “${grow.keyword}”`
            : `Grow “${grow.keyword}”`,
        detail: (grow.priorityReasons ?? [])
          .slice(0, 1)
          .join(' '),
        why: (grow.priorityReasons ?? []).slice(0, 2),
        evidence: ['Strategy 5.0'],
        action: {
          label: 'View opportunity',
          href: '/keywords?tab=strategy',
        },
      });
    }
    return out.slice(0, 8);
  }

  private buildNextMoves(input: {
    opportunities: Array<Record<string, any>>;
    refreshRecs: any[];
    linkRecs: any[];
    openActions: any[];
  }): Array<Record<string, any>> {
    /* Existing persisted work first — never a new queue.
       Derived opportunities fill remaining slots. */
    const moves: Array<Record<string, any>> = [];
    const inFlight = input.openActions.slice(0, 2);
    for (const action of inFlight) {
      moves.push({
        rank: moves.length + 1,
        title: action.title,
        why:
          action.description ??
          'Already committed work in the Action Engine.',
        evidence: ['Action Engine'],
        purpose:
          'Finish committed work before starting new efforts.',
        cta: { label: 'Open Actions', href: '/actions' },
      });
    }
    for (const opp of input.opportunities) {
      if (moves.length >= 5) break;
      moves.push({
        rank: moves.length + 1,
        title: opp.title,
        why: (opp.why ?? []).slice(0, 2).join(' ') || opp.detail,
        evidence: opp.evidence ?? [],
        purpose: purposeFor(opp.kind),
        cta: opp.action,
      });
    }
    return moves.slice(0, 5);
  }

  private buildHealth(input: {
    gscAvailable: boolean;
    bands: {
      top3: number;
      top10: number;
      top20: number;
      top100: number;
    };
    strategyData: any;
    crawl: {
      crawlId: string | null;
      completedAt: string | null;
      pages: number;
      issues: number;
      links: number;
    } | null;
    linkCount: number;
  }): Array<Record<string, any>> {
    const summary = input.strategyData?.summary ?? null;
    return [
      {
        key: 'visibility',
        label: 'Search visibility',
        state: input.gscAvailable
          ? input.bands.top10 > 0
            ? 'STRONG'
            : 'BASELINE'
          : 'UNAVAILABLE',
        detail: input.gscAvailable
          ? `${input.bands.top3} top-3 · ${input.bands.top10} top-10 · ${input.bands.top100} indexed`
          : 'Connect Search Console.',
        href: '/keywords?tab=yours',
      },
      {
        key: 'coverage',
        label: 'Content coverage',
        state: summary
          ? summary.CREATE > 0 || summary.GROW > 0
            ? 'GAPS'
            : 'COVERED'
          : 'UNAVAILABLE',
        detail: summary
          ? `${summary.CREATE ?? 0} to create · ${summary.GROW ?? 0} to grow · ${summary.QUICK_WIN ?? 0} quick wins`
          : 'Build strategy to assess coverage.',
        href: '/keywords?tab=strategy',
      },
      {
        key: 'technical',
        label: 'Technical readiness',
        state: input.crawl
          ? input.crawl.issues > 0
            ? 'ATTENTION'
            : 'READY'
          : 'UNAVAILABLE',
        detail: input.crawl
          ? `${input.crawl.pages} pages crawled · ${input.crawl.issues} issues`
          : 'Run a crawl to assess readiness.',
        href: '/technical-seo',
      },
      {
        key: 'linking',
        label: 'Internal linking',
        state: input.crawl
          ? input.crawl.links > 0
            ? 'BASELINE'
            : 'GAPS'
          : 'UNAVAILABLE',
        detail: input.crawl
          ? `${input.crawl.links} observed internal links${input.linkCount > 0 ? ` · ${input.linkCount} open recommendations` : ''}`
          : 'Observed after the first crawl with links.',
        href: '/keywords?tab=strategy',
      },
      {
        key: 'ai',
        label: 'AI visibility',
        state: 'UNAVAILABLE',
        detail:
          'Not part of this baseline — measured separately.',
        href: '/ai-visibility',
      },
    ];
  }
}

function shortPage(url: unknown): string | null {
  const raw = String(url ?? '').trim();
  if (!raw) return null;
  return raw
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .slice(0, 60);
}

function purposeFor(kind: unknown): string {
  switch (String(kind ?? '').toUpperCase()) {
    case 'STRIKING':
      return 'Strong near-term opportunity — existing visibility is close to page-one impact.';
    case 'REFRESH':
      return 'Worth addressing — recover measured decline before it compounds.';
    case 'INTERNAL_LINK':
      return 'High-priority opportunity — connect existing relevance with one edit.';
    case 'CONSOLIDATE':
      return 'Worth addressing — reunite split authority behind one URL.';
    case 'TECHNICAL':
      return 'Evidence suggests fixes here unblock everything else.';
    default:
      return 'High-priority opportunity based on current evidence.';
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { KeywordResearchService } from './keyword-research.service';
import { GoogleService } from '../google/google.service';
import {
  composePageRankProfile,
  detectUrlSwitch,
  measurementOutcome,
  normalizeKeywordRank,
  normalizeRankObservation,
  rankChangeEvents,
  summarizeRankHistory,
  type NormalizedRank,
  type RankSource,
} from './rank-tracking';

/*
 * =========================================================
 * RANK INTELLIGENCE 1.0 (Phase 11).
 *
 * Persistent append-only rank observations from labeled
 * sources (GSC window averages, SERP provider positions,
 * manual input). Sources are never merged. Billing reuses
 * existing rails: SERP fetches go through
 * researchService.serp (cached, allowance-gated, fresh
 * calls charged once via API_CALLS); GSC/manual/reads
 * are free. Reading stored observations never charges.
 * =========================================================
 */

const MAX_KEYWORDS_PER_TRACK = 25;
const MAX_TRACK_CONCURRENCY = 2;
const MAX_ROWS_PER_KEYWORD = 500;

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname
      .toLowerCase()
      .replace(/^www\./, '');
  } catch {
    return null;
  }
}

function windowEnd(days: 30 | 90): {
  startDate: string;
  endDate: string;
} {
  const end = new Date(
    Date.now() - 3 * 24 * 60 * 60 * 1000,
  );
  const start = new Date(
    end.getTime() - (days - 1) * 24 * 60 * 60 * 1000,
  );
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

@Injectable()
export class RankTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly researchService: KeywordResearchService,
    private readonly googleService: GoogleService,
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

  private context(input: {
    country?: string;
    language?: string;
    device?: string;
  }) {
    return {
      country:
        clean(input.country).toUpperCase() || 'US',
      language:
        clean(input.language).toLowerCase() || 'en',
      device:
        clean(input.device).toLowerCase() || 'desktop',
    };
  }

  /* ============ SERP-backed tracking ============ */

  async trackKeywords(
    organizationId: string,
    websiteId: string,
    input: {
      keywords: string[];
      country?: string;
      language?: string;
      device?: string;
      refresh?: boolean;
    },
  ) {
    const website = await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    const ctx = this.context(input);
    const keywords = Array.from(
      new Set(
        (input.keywords ?? [])
          .map((k) => clean(k))
          .filter(Boolean),
      ),
    ).slice(0, MAX_KEYWORDS_PER_TRACK);
    if (keywords.length === 0) {
      throw new BadRequestException(
        'At least one keyword is required.',
      );
    }
    const ownHost = hostOf(website.url);
    const results: Array<{
      keyword: string;
      position: number | null;
      url: string | null;
      cached: boolean;
      charged: boolean;
      evidenceState: string;
    }> = [];
    for (
      let offset = 0;
      offset < keywords.length;
      offset += MAX_TRACK_CONCURRENCY
    ) {
      const batch = keywords.slice(
        offset,
        offset + MAX_TRACK_CONCURRENCY,
      );
      const settled = await Promise.all(
        batch.map((keyword) =>
          this.trackOneKeyword(
            organizationId,
            website,
            keyword,
            ctx,
            ownHost,
            input.refresh === true,
          ).catch((error: unknown) => ({
            keyword,
            position: null as number | null,
            url: null as string | null,
            cached: false,
            charged: false,
            evidenceState: 'UNAVAILABLE' as string,
            error: String(
              (error as Error)?.message ?? error,
            ).slice(0, 300),
          })),
        ),
      );
      for (const row of settled) {
        const { error, ...rest } =
          row as typeof results[number] & {
            error?: string;
          };
        void error;
        results.push(rest);
      }
    }
    return {
      tracked: results.length,
      results,
      billing: {
        note: 'SERP fetches reuse research billing: cache hits and failures are free; fresh provider calls charge once via existing API_CALLS rails. Stored reads never charge.',
      },
    };
  }

  private async trackOneKeyword(
    organizationId: string,
    website: { id: string; url: string },
    keyword: string,
    ctx: {
      country: string;
      language: string;
      device: string;
    },
    ownHost: string | null,
    refresh: boolean,
  ) {
    const serp = await this.researchService.serp(
      organizationId,
      keyword,
      ctx.country,
      ctx.language,
      refresh,
      website.id,
    );
    let position: number | null = null;
    let url: string | null = null;
    if (ownHost) {
      for (const result of serp.observation.results) {
        if (!result.isOrganic) continue;
        const domain = (result.domain ?? '')
          .toLowerCase()
          .replace(/^www\./, '');
        if (
          domain === ownHost ||
          domain.endsWith(`.${ownHost}`)
        ) {
          position = result.position;
          url = result.url;
          break;
        }
      }
    }
    const normalized = normalizeRankObservation(
      website.id,
      {
        keyword,
        url,
        position,
        source: 'SERP_PROVIDER',
        engine: 'GOOGLE',
        country: ctx.country,
        language: ctx.language,
        device: ctx.device,
        observedAt: serp.observation.fetchedAt,
      },
    );
    let stored = false;
    if (normalized) {
      stored =
        (await this.storeBatch(
          organizationId,
          website.id,
          [normalized],
        )) > 0;
    }
    return {
      keyword,
      position,
      url,
      cached: serp.cached,
      charged: serp.cost.charged,
      evidenceState:
        position === null ? 'UNAVAILABLE' : 'OBSERVED',
      stored,
    };
  }

  /* ============ GSC sync ============ */

  async syncGsc(
    organizationId: string,
    websiteId: string,
    days: 30 | 90 = 30,
  ) {
    const website = await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    const window = windowEnd(days);
    /* Query-level window aggregates. Page-level demand
     * stays in the official sync; rank rows keep the
     * query as the identity (URL attaches when a SERP
     * or manual observation provides one). */
    const queries = await this.googleService.getSearchQueries(
      organizationId,
      window.startDate,
      window.endDate,
    );
    const candidates: NormalizedRank[] = [];
    for (const row of (queries as { rows?: Array<Record<string, unknown>> })
      .rows ?? []) {
      const normalized = normalizeRankObservation(
        website.id,
        {
          keyword: String(row.query ?? ''),
          url: null,
          position:
            row.position === null ||
            row.position === undefined
              ? null
              : Math.round(Number(row.position)),
          source: 'GSC',
          engine: 'GOOGLE',
          country: 'US',
          language: 'en',
          device: 'desktop',
          observedAt: `${window.endDate}T00:00:00.000Z`,
          impressions: row.impressions,
          clicks: row.clicks,
        },
      );
      if (normalized) candidates.push(normalized);
    }
    const stored = await this.storeBatch(
      organizationId,
      website.id,
      candidates.slice(0, 1000),
    );
    return {
      source: 'GSC',
      evidenceState: 'VERIFIED',
      window,
      semantics:
        'GSC position is the impression-weighted average position over the sync window — never an exact SERP rank.',
      candidates: candidates.length,
      stored,
      billing: {
        charged: false,
        note: 'Search Console pulls are free; no credits consumed.',
      },
    };
  }

  /* ============ manual input ============ */

  async recordManual(
    organizationId: string,
    websiteId: string,
    input: {
      rows: Array<{
        keyword?: string;
        url?: string | null;
        position?: number | null;
        country?: string;
        language?: string;
        device?: string;
        observedAt?: string;
      }>;
    },
  ) {
    const website = await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    const ctx = this.context({});
    const candidates: NormalizedRank[] = [];
    for (const row of (input.rows ?? []).slice(0, 200)) {
      const normalized = normalizeRankObservation(
        website.id,
        {
          keyword: String(row.keyword ?? ''),
          url: row.url ?? null,
          position: row.position ?? null,
          source: 'MANUAL',
          engine: 'GOOGLE',
          country: row.country ?? ctx.country,
          language: row.language ?? ctx.language,
          device: row.device ?? ctx.device,
          observedAt:
            row.observedAt ?? new Date().toISOString(),
        },
      );
      if (normalized) candidates.push(normalized);
    }
    if (candidates.length === 0) {
      throw new BadRequestException(
        'No valid rows. Each row needs a keyword and a timestamp.',
      );
    }
    const stored = await this.storeBatch(
      organizationId,
      website.id,
      candidates,
    );
    return {
      source: 'MANUAL',
      evidenceState: 'OBSERVED',
      candidates: candidates.length,
      stored,
      billing: {
        charged: false,
        note: 'Manual input is free.',
      },
    };
  }

  private async storeBatch(
    organizationId: string,
    websiteId: string,
    candidates: NormalizedRank[],
  ): Promise<number> {
    if (candidates.length === 0) return 0;
    const keys = candidates.map(
      (candidate) => candidate.identityKey,
    );
    const existing =
      await this.prisma.rankObservation.findMany({
        where: {
          organizationId,
          websiteId,
          identityKey: { in: keys },
        },
        select: { identityKey: true },
      });
    const seen = new Set(
      existing.map((row) => row.identityKey),
    );
    const fresh = candidates.filter(
      (candidate) => !seen.has(candidate.identityKey),
    );
    if (fresh.length === 0) return 0;
    await this.prisma.rankObservation.createMany({
      data: fresh.map((candidate) => ({
        organizationId,
        websiteId,
        keyword: candidate.keyword,
        normalizedKeyword: candidate.normalizedKeyword,
        url: candidate.url,
        position: candidate.position,
        engine: candidate.engine,
        country: candidate.country,
        language: candidate.language,
        device: candidate.device,
        observedAt: new Date(candidate.observedAt),
        source: candidate.source,
        evidenceState: candidate.evidenceState,
        impressions: candidate.impressions,
        clicks: candidate.clicks,
        identityKey: candidate.identityKey,
      })),
      skipDuplicates: true,
    });
    return fresh.length;
  }

  /* ============ history + overview ============ */

  private scopeKey(row: {
    source: string;
    engine: string;
    country: string;
    language: string;
    device: string;
  }): string {
    return [
      row.source,
      row.engine,
      row.country,
      row.language,
      row.device,
    ].join('|');
  }

  async getHistory(
    organizationId: string,
    websiteId: string,
    input: {
      keyword?: string;
      page?: string;
      source?: RankSource;
      days?: number;
      pageNum?: number;
      pageSize?: number;
    },
  ) {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    const days = Math.min(
      365,
      Math.max(1, Math.floor(input.days ?? 90) || 90),
    );
    const since = new Date(
      Date.now() - days * 24 * 60 * 60 * 1000,
    );
    const where: Record<string, unknown> = {
      organizationId,
      websiteId,
      observedAt: { gte: since },
    };
    if (input.keyword) {
      where.normalizedKeyword = normalizeKeywordRank(
        input.keyword,
      );
    }
    if (input.page) {
      where.url = clean(input.page);
    }
    if (input.source) where.source = input.source;
    const rows =
      await this.prisma.rankObservation.findMany({
        where,
        orderBy: { observedAt: 'asc' },
        take: 2000,
      });
    const byScope = new Map<
      string,
      Map<string, typeof rows>
    >();
    for (const row of rows) {
      const scope = this.scopeKey(row);
      let keywords = byScope.get(scope);
      if (!keywords) {
        keywords = new Map();
        byScope.set(scope, keywords);
      }
      const list =
        keywords.get(row.normalizedKeyword) ?? [];
      list.push(row);
      keywords.set(row.normalizedKeyword, list);
    }
    const all: Array<
      ReturnType<typeof summarizeRankHistory> & {
        scope: string;
        events: ReturnType<
          typeof rankChangeEvents
        >;
        urlSwitch: ReturnType<typeof detectUrlSwitch>;
      }
    > = [];
    for (const [scope, keywords] of byScope) {
      for (const [keyword, list] of keywords) {
        const ordered = [...list].sort((a, b) =>
          a.observedAt < b.observedAt ? -1 : 1,
        );
        const stats = summarizeRankHistory({
          keyword:
            ordered[ordered.length - 1].keyword,
          source: ordered[0].source as RankSource,
          rows: ordered.map((row) => ({
            position: row.position,
            url: row.url,
            observedAt: row.observedAt.toISOString(),
          })),
        });
        const ranked = ordered.filter(
          (row) => row.position !== null,
        );
        const urlSwitch = detectUrlSwitch(
          ranked.length > 1
            ? ranked[ranked.length - 2].url
            : null,
          ranked.length > 0
            ? ranked[ranked.length - 1].url
            : null,
          ranked.length > 1,
        );
        const events = rankChangeEvents({
          keyword: stats.keyword,
          url: stats.url,
          previous: stats.previous,
          current: stats.current,
          previousExists: ranked.length > 0,
          recent: ranked
            .slice(-3)
            .map((row) => row.position),
          urlSwitch,
        });
        all.push({
          ...stats,
          scope,
          events,
          urlSwitch,
        });
      }
    }
    all.sort((a, b) =>
      (b.lastObserved ?? '') < (a.lastObserved ?? '')
        ? -1
        : 1,
    );
    const size = Math.min(
      100,
      Math.max(1, Math.floor(input.pageSize ?? 20) || 20),
    );
    const pageNum = Math.max(
      1,
      Math.floor(input.pageNum ?? 1) || 1,
    );
    const totalPages = Math.max(
      1,
      Math.ceil(all.length / size),
    );
    const page = Math.min(pageNum, totalPages);
    return {
      keywords: all.slice(
        (page - 1) * size,
        page * size,
      ),
      total: all.length,
      page,
      pageSize: size,
      totalPages,
      sources: ['GSC', 'SERP_PROVIDER', 'MANUAL'],
      semantics: {
        GSC: 'VERIFIED window-average position — not an exact rank.',
        SERP_PROVIDER:
          'OBSERVED position in the fetched SERP context.',
        MANUAL: 'OBSERVED user-supplied position.',
      },
    };
  }

  async getOverview(
    organizationId: string,
    websiteId: string,
    input: { days?: number; source?: RankSource },
  ) {
    const history = await this.getHistory(
      organizationId,
      websiteId,
      {
        days: input.days ?? 30,
        source: input.source,
        pageNum: 1,
        pageSize: 100,
      },
    );
    const gaining = history.keywords.filter(
      (k) => k.movement === 'IMPROVED',
    ).length;
    const losing = history.keywords.filter(
      (k) => k.movement === 'DECLINED',
    ).length;
    return {
      tracked: history.total,
      gaining,
      losing,
      top10: history.keywords.filter(
        (k) => k.band === 'TOP_3' || k.band === 'TOP_10',
      ).length,
      striking: history.keywords.filter(
        (k) => k.strikingDistance,
      ).length,
      keywords: history.keywords.slice(0, 50),
    };
  }

  async getChanges(
    organizationId: string,
    websiteId: string,
    days = 30,
  ) {
    const history = await this.getHistory(
      organizationId,
      websiteId,
      { days, pageNum: 1, pageSize: 100 },
    );
    const events = history.keywords.flatMap((k) =>
      k.events.map((event) => ({
        keyword: k.keyword,
        scope: k.scope,
        source: k.source,
        ...event,
      })),
    );
    return {
      events: events.slice(0, 50),
      total: events.length,
      keywords: history.total,
    };
  }

  /* ============ measurement for actions ============ */

  async measureAction(
    organizationId: string,
    actionId: string,
  ) {
    const action =
      await this.prisma.action.findFirst({
        where: { id: actionId, organizationId },
      });
    if (!action)
      throw new NotFoundException('Action not found');
    const meta = (action.metadata ?? {}) as Record<
      string,
      unknown
    >;
    const keyword =
      clean(meta.strategyKeyword) ||
      clean(meta.keyword) ||
      clean(meta.query) ||
      clean(action.title) ||
      null;
    const url =
      clean(meta.targetPage) ||
      clean(meta.pageUrl) ||
      clean(action.url) ||
      null;
    if (!keyword && !url) {
      return {
        actionId: action.id,
        title: action.title,
        outcome: 'UNKNOWN',
        statement:
          'No keyword or page is attached to this action — measurement unavailable, not zero.',
      };
    }
    const rows =
      await this.prisma.rankObservation.findMany({
        where: {
          organizationId,
          ...(keyword
            ? {
                normalizedKeyword:
                  normalizeKeywordRank(keyword),
              }
            : {}),
          ...(url ? { url } : {}),
        },
        orderBy: { observedAt: 'asc' },
        take: 500,
      });
    const at = action.createdAt.getTime();
    const before = rows.filter(
      (row) => row.observedAt.getTime() < at,
    );
    const after = rows.filter(
      (row) => row.observedAt.getTime() >= at,
    );
    const beforePos = before
      .filter((row) => row.position !== null)
      .map((row) => row.position as number);
    const afterPos = after
      .filter((row) => row.position !== null)
      .map((row) => row.position as number);
    return {
      actionId: action.id,
      title: action.title,
      keyword,
      url,
      before:
        beforePos.length > 0
          ? beforePos[beforePos.length - 1]
          : null,
      after:
        afterPos.length > 0 ? afterPos[0] : null,
      outcome: measurementOutcome({
        title: action.title,
        before:
          beforePos.length > 0
            ? beforePos[beforePos.length - 1]
            : null,
        after: afterPos.length > 0 ? afterPos[0] : null,
      }),
    };
  }
}

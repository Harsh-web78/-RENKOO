import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { KeywordResearchService } from './keyword-research.service';
import {
  normalizeRankObservation,
  normalizeKeywordRank,
} from './rank-tracking';
import {
  aggregateRunStatus,
  aiGoogleDivergence,
  aiModeState,
  aiOverviewState,
  buildAlertCandidates,
  compareGscToTracked,
  competitorMove,
  describeVolatility,
  historySufficiency,
  investigationCopy,
  isStrikingDistance2,
  normalizeCountry,
  normalizeDevice,
  normalizeEngine,
  normalizeLanguage,
  normalizeOrigin,
  normalizeSerpFeatures,
  normalizeTrackedKeyword,
  observationWindowKey,
  positionBand,
  positionDelta,
  rankingUrlState,
  rankMovement2,
  targetUrlState,
  trackedKeywordIdentity,
  trackingHealth,
  type KeywordOrigin,
  type RankAlertTrigger,
  type SerpFeature,
  type TrackedDevice,
  type TrackingRunStatus,
} from './rank-intelligence';
import { isDataForSeoConfigured } from './keyword-data-provider';

/*
 * =========================================================
 * RANK INTELLIGENCE 2.0 (Phase 31).
 *
 * Persistent tracked-keyword watchlist + bounded tracking
 * runs + URL intelligence + SERP/AI divergence + alerts.
 *
 * Reuse-first:
 * - Observations persist through the existing
 *   RankObservation table (append-only, labeled sources).
 * - SERP fetches go through researchService.serp
 *   (cached, allowance-gated, failures free).
 * - Alerts persist through MonitoringService with a
 *   RANK source (descriptive, meaningful movement only).
 * - No new billing system: plan keyword caps reuse the
 *   existing entitlements abstraction; provider calls
 *   reuse existing API_CALLS rails.
 *
 * Honesty:
 * - GSC POSITION vs TRACKED POSITION are different
 *   measurement contexts, labeled everywhere.
 * - UNKNOWN (provider could not determine) is never
 *   converted to NOT_RANKING (provider confirmed
 *   absence) or to zero.
 * - Missing history is a visible gap — never
 *   interpolated, never smoothed.
 * - No causal claims: observed outcomes only.
 * =========================================================
 */

const MAX_ADD_PER_REQUEST = 100;
const MAX_RUN_KEYWORDS = 50;
const MAX_RUN_CONCURRENCY = 2;
const STALE_AFTER_HOURS = 49;
const HISTORY_WINDOWS = [7, 28, 90] as const;

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

/* Maps provider SERP feature type strings to the 2.0
 * tracked vocabulary. Unknown provider types are
 * dropped (never assumed present). */
function mapSerpFeature(type: string): SerpFeature | null {
  const v = String(type ?? '').trim().toUpperCase();
  switch (v) {
    case 'FEATURED_SNIPPET':
      return 'FEATURED_SNIPPET';
    case 'AI_OVERVIEW':
    case 'AI OVERVIEW':
      return 'AI_OVERVIEW';
    case 'LOCAL_PACK':
    case 'MAP':
      return 'LOCAL_PACK';
    case 'VIDEO':
    case 'VIDEOS':
      return 'VIDEO';
    case 'IMAGE_PACK':
    case 'IMAGES':
      return 'IMAGE_PACK';
    case 'PEOPLE_ALSO_ASK':
      return 'PEOPLE_ALSO_ASK';
    case 'TOP_STORIES':
      return 'TOP_STORIES';
    case 'SHOPPING':
      return 'SHOPPING';
    default:
      return null;
  }
}

@Injectable()
export class RankIntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly monitoring: MonitoringService,
    private readonly researchService: KeywordResearchService,
  ) {}

  private get tracked() {
    return (this.prisma as unknown as Record<string, any>)
      .trackedKeyword;
  }

  private get runs() {
    return (this.prisma as unknown as Record<string, any>)
      .rankTrackingRun;
  }

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

  private async keywordLimit(
    organizationId: string,
  ): Promise<number | null> {
    try {
      const entitlements =
        await this.billing.getEntitlements(organizationId);
      const limits = (entitlements as any)?.limits as
        | Record<string, unknown>
        | undefined;
      const raw =
        limits?.maxKeywords ??
        (entitlements as any)?.keywords ??
        null;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      /* No entitlement available: configuration
       * abstraction only — never block on billing
       * when the rails cannot answer. */
      return null;
    }
  }

  /* ============ tracked keywords: CRUD ============ */

  async listTracked(
    organizationId: string,
    websiteId: string,
    input: {
      isActive?: boolean;
      origin?: string;
      device?: string;
      country?: string;
      search?: string;
      pageNum?: number;
      pageSize?: number;
    },
  ) {
    await this.verifyWebsite(organizationId, websiteId);
    const where: Record<string, unknown> = {
      organizationId,
      websiteId,
    };
    if (typeof input.isActive === 'boolean') {
      where.isActive = input.isActive;
    }
    const origin = normalizeOrigin(input.origin ?? '');
    if (origin) where.origin = origin;
    if (input.device) {
      where.device = normalizeDevice(input.device);
    }
    if (input.country) {
      where.country = normalizeCountry(input.country);
    }
    if (clean(input.search)) {
      where.normalizedKeyword = {
        contains: normalizeTrackedKeyword(input.search),
      };
    }
    const size = Math.min(
      100,
      Math.max(1, Math.floor(input.pageSize ?? 25) || 25),
    );
    const page = Math.max(
      1,
      Math.floor(input.pageNum ?? 1) || 1,
    );
    const [total, rows] = await Promise.all([
      this.tracked.count({ where }),
      this.tracked.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
    ]);
    return {
      keywords: rows,
      total,
      page,
      pageSize: size,
      totalPages: Math.max(1, Math.ceil(total / size)),
    };
  }

  async addTracked(
    organizationId: string,
    websiteId: string,
    input: {
      items: Array<{
        keyword?: string;
        country?: string;
        language?: string;
        device?: string;
        searchEngine?: string;
        targetUrl?: string | null;
        origin?: string;
      }>;
    },
  ) {
    await this.verifyWebsite(organizationId, websiteId);
    const items = (input.items ?? []).slice(
      0,
      MAX_ADD_PER_REQUEST,
    );
    if (items.length === 0) {
      throw new BadRequestException(
        'At least one keyword is required.',
      );
    }
    const limit = await this.keywordLimit(organizationId);
    if (limit !== null) {
      const current = await this.tracked.count({
        where: { organizationId, websiteId },
      });
      if (current + items.length > limit) {
        throw new BadRequestException(
          `Plan allows ${limit} tracked keywords for this website; ${current} already tracked. Deactivate unused keywords before adding more.`,
        );
      }
    }
    const prepared: Array<{
      identity: string;
      data: Record<string, unknown>;
    }> = [];
    for (const item of items) {
      const keyword = clean(item.keyword);
      const normalized = normalizeTrackedKeyword(keyword);
      if (!normalized) continue;
      const country = normalizeCountry(item.country);
      const language = normalizeLanguage(item.language);
      const device: TrackedDevice = normalizeDevice(
        item.device,
      );
      const searchEngine = normalizeEngine(
        item.searchEngine,
      );
      const origin: KeywordOrigin =
        normalizeOrigin(item.origin ?? '') ?? 'MANUAL';
      const targetUrl = clean(item.targetUrl) || null;
      prepared.push({
        identity: trackedKeywordIdentity({
          organizationId,
          websiteId,
          keyword,
          country,
          language,
          device,
          searchEngine,
        }),
        data: {
          organizationId,
          websiteId,
          keyword,
          normalizedKeyword: normalized,
          country,
          language,
          device,
          searchEngine,
          targetUrl,
          origin,
        },
      });
    }
    if (prepared.length === 0) {
      throw new BadRequestException(
        'No valid keywords. Each item needs a non-empty keyword.',
      );
    }
    /* Pre-check existing identities so re-adds stay
     * idempotent (reactivate instead of duplicating). */
    const existing = await this.tracked.findMany({
      where: { organizationId, websiteId },
    });
    const seen = new Set(
      (existing as Array<Record<string, unknown>>).map(
        (row) =>
          trackedKeywordIdentity({
            organizationId,
            websiteId,
            keyword: String(row.normalizedKeyword ?? ''),
            country: String(row.country ?? 'US'),
            language: String(row.language ?? 'en'),
            device: String(row.device ?? 'DESKTOP'),
            searchEngine: String(
              row.searchEngine ?? 'GOOGLE',
            ),
          }),
      ),
    );
    const fresh = prepared.filter(
      (p) => !seen.has(p.identity),
    );
    let created = 0;
    if (fresh.length > 0) {
      try {
        const res = await this.tracked.createMany({
          data: fresh.map((p) => p.data),
          skipDuplicates: true,
        });
        created = Number(res?.count ?? fresh.length);
      } catch {
        /* Unique race: fall back to row-by-row so a
         * concurrent add never fails the batch. */
        for (const p of fresh) {
          try {
            await this.tracked.create({ data: p.data });
            created++;
          } catch {
            /* duplicate — idempotent, skip */
          }
        }
      }
    }
    /* Reactivate matching inactive rows (explicit
     * re-add intent, origin preserved). */
    return {
      requested: items.length,
      created,
      duplicates: prepared.length - fresh.length,
      limit,
      originNote:
        'Every tracked keyword preserves its import origin (MANUAL / GSC / KEYWORD_RESEARCH / STRATEGY / CUSTOMER_DEMAND). GSC queries are only tracked when explicitly imported.',
    };
  }

  async updateTracked(
    organizationId: string,
    websiteId: string,
    id: string,
    input: {
      targetUrl?: string | null;
      isActive?: boolean;
    },
  ) {
    await this.verifyWebsite(organizationId, websiteId);
    const row = await this.tracked.findFirst({
      where: { id, organizationId, websiteId },
    });
    if (!row)
      throw new NotFoundException(
        'Tracked keyword not found',
      );
    const data: Record<string, unknown> = {};
    if (input.targetUrl !== undefined) {
      data.targetUrl = clean(input.targetUrl) || null;
    }
    if (typeof input.isActive === 'boolean') {
      data.isActive = input.isActive;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        'Nothing to update. Provide targetUrl and/or isActive.',
      );
    }
    return this.tracked.update({
      where: { id },
      data,
    });
  }

  async getTracked(
    organizationId: string,
    websiteId: string,
    id: string,
  ) {
    await this.verifyWebsite(organizationId, websiteId);
    const row = await this.tracked.findFirst({
      where: { id, organizationId, websiteId },
    });
    if (!row)
      throw new NotFoundException(
        'Tracked keyword not found',
      );
    const observations =
      await this.prisma.rankObservation.findMany({
        where: {
          organizationId,
          websiteId,
          OR: [
            { trackedKeywordId: id },
            {
              normalizedKeyword: String(
                (row as any).normalizedKeyword ?? '',
              ),
              country: String((row as any).country ?? 'US'),
              language: String(
                (row as any).language ?? 'en',
              ),
              device: String(
                (row as any).device ?? 'desktop',
              ).toLowerCase(),
            },
          ],
        },
        orderBy: { observedAt: 'asc' },
        take: 1000,
      });
    const detail = this.composeDetail(
      row as any,
      observations as any[],
    );
    return detail;
  }

  /* ============ bounded runs (§37/§38/§39/§40) ============ */

  async startRun(
    organizationId: string,
    websiteId: string,
    input: { refresh?: boolean; limit?: number },
  ) {
    const website = await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    if (!isDataForSeoConfigured()) {
      throw new ServiceUnavailableException(
        'TRACKING_PROVIDER_UNAVAILABLE: set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to enable live rank observations. No observations were faked.',
      );
    }
    const windowKey = observationWindowKey(
      new Date().toISOString(),
    );
    /* Idempotency: repeated runs for the same window
     * return the existing run instead of duplicating. */
    const existing = await this.runs.findUnique({
      where: {
        organizationId_websiteId_windowKey: {
          organizationId,
          websiteId,
          windowKey,
        },
      },
    });
    if (existing) return existing;
    const cap = Math.min(
      MAX_RUN_KEYWORDS,
      Math.max(1, Math.floor(input.limit ?? 25) || 25),
    );
    const actives = (await this.tracked.findMany({
      where: {
        organizationId,
        websiteId,
        isActive: true,
      },
      orderBy: { createdAt: 'asc' },
      take: cap,
    })) as Array<Record<string, any>>;
    const run = await this.runs.create({
      data: {
        organizationId,
        websiteId,
        status: 'QUEUED',
        windowKey,
        totalKeywords: actives.length,
      },
    });
    if (actives.length === 0) {
      return this.runs.update({
        where: { id: (run as any).id },
        data: {
          status: 'COMPLETED',
          succeeded: 0,
          failed: 0,
          skipped: 0,
          finishedAt: new Date(),
          errorSummary: null,
        },
      });
    }
    await this.runs.update({
      where: { id: (run as any).id },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    const outcome = await this.observeActiveKeywords(
      organizationId,
      website,
      actives,
      { refresh: input.refresh === true, windowKey },
    );
    const status: TrackingRunStatus = aggregateRunStatus({
      total: actives.length,
      succeeded: outcome.succeeded,
      failed: outcome.failed,
      providerUnavailable: false,
    });
    return this.runs.update({
      where: { id: (run as any).id },
      data: {
        status,
        succeeded: outcome.succeeded,
        failed: outcome.failed,
        skipped: outcome.skipped,
        finishedAt: new Date(),
        errorSummary:
          outcome.failures.length > 0
            ? outcome.failures.join(' | ')
            : null,
      },
    });
  }

  /* Shared bounded observation loop (Phase 32 reuse).
   * Both on-demand runs and scheduled execute-next
   * collect through this single path: same batching,
   * same concurrency, same idempotent windows. */
  async observeActiveKeywords(
    organizationId: string,
    website: { id: string; url: string },
    actives: Array<Record<string, any>>,
    input: {
      refresh: boolean;
      windowKey: string;
      onProgress?: (done: number, total: number) => Promise<void>;
    },
  ): Promise<{
    succeeded: number;
    failed: number;
    skipped: number;
    failures: string[];
  }> {
    const ownHost = hostOf(website.url);
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
    const failures: string[] = [];
    for (
      let offset = 0;
      offset < actives.length;
      offset += MAX_RUN_CONCURRENCY
    ) {
      const batch = actives.slice(
        offset,
        offset + MAX_RUN_CONCURRENCY,
      );
      const settled = await Promise.all(
        batch.map((tk) =>
          this.observeOne(
            organizationId,
            website,
            tk,
            ownHost,
            input.refresh,
            input.windowKey,
          ).then(
            (r) => r,
            (error: unknown) => ({
              ok: false as const,
              skipped: false,
              message: String(
                (error as Error)?.message ?? error,
              ).slice(0, 200),
            }),
          ),
        ),
      );
      for (const s of settled) {
        if (s.ok) succeeded++;
        else if (s.skipped) skipped++;
        else {
          failed++;
          if (failures.length < 5) failures.push(s.message);
        }
      }
      if (input.onProgress) {
        await input.onProgress(
          Math.min(offset + batch.length, actives.length),
          actives.length,
        );
      }
    }
    return { succeeded, failed, skipped, failures };
  }

  private async observeOne(
    organizationId: string,
    website: { id: string; url: string },
    tk: Record<string, any>,
    ownHost: string | null,
    refresh: boolean,
    windowKey: string,
  ): Promise<
    | { ok: true; skipped: false }
    | { ok: false; skipped: boolean; message: string }
  > {
    const keyword = String(tk.keyword ?? '');
    const country = String(tk.country ?? 'US');
    const language = String(tk.language ?? 'en');
    /* Cost control: skip duplicate windows unless a
     * refresh was explicitly requested. */
    if (!refresh) {
      const dup =
        await this.prisma.rankObservation.findFirst({
          where: {
            organizationId,
            websiteId: website.id,
            trackedKeywordId: String(tk.id),
            observedAt: {
              gte: new Date(`${windowKey}T00:00:00.000Z`),
              lt: new Date(`${windowKey}T23:59:59.999Z`),
            },
          },
          select: { id: true },
        });
      if (dup) return { ok: false, skipped: true, message: 'duplicate window' };
    }
    const serp = await this.researchService.serp(
      organizationId,
      keyword,
      country,
      language,
      refresh,
      website.id,
    );
    let position: number | null = null;
    let url: string | null = null;
    let resultType: string | null = null;
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
          resultType = result.resultType ?? null;
          break;
        }
      }
    }
    const observedFeatures: SerpFeature[] = [];
    for (const f of serp.observation.features ?? []) {
      const mapped = mapSerpFeature(
        String((f as any)?.type ?? ''),
      );
      if (mapped && !observedFeatures.includes(mapped)) {
        observedFeatures.push(mapped);
      }
    }
    const aiPresence = (serp.observation as any)
      ?.aiPresence as {
      hasAiOverview?: boolean;
      citedUrls?: string[];
    } | null;
    const providerSawTop100 = Boolean(
      (serp.observation.results ?? []).length > 0,
    );
    /* NOT_RANKING only when the provider returned a
     * full SERP and the own host is absent; otherwise
     * an absent match stays UNKNOWN. */
    const confirmedAbsent =
      position === null && providerSawTop100;
    const aiOverview = aiPresence
      ? ((aiPresence.hasAiOverview
          ? 'PRESENT'
          : 'NOT_OBSERVED') as 'PRESENT' | 'NOT_OBSERVED')
      : aiOverviewState(
          observedFeatures,
          observedFeatures.length > 0 ||
            providerSawTop100,
        );
    const normalized = normalizeRankObservation(
      website.id,
      {
        keyword,
        url,
        position,
        source: 'SERP_PROVIDER',
        engine: 'GOOGLE',
        country,
        language,
        device: String(tk.device ?? 'desktop'),
        observedAt: serp.observation.fetchedAt,
      },
    );
    if (!normalized) {
      return {
        ok: false,
        skipped: false,
        message: 'invalid observation',
      };
    }
    const identityKey = normalized.identityKey;
    const exists =
      await this.prisma.rankObservation.findUnique({
        where: { identityKey },
        select: { id: true },
      });
    if (!exists) {
      await this.prisma.rankObservation.create({
        data: {
          organizationId,
          websiteId: website.id,
          keyword: normalized.keyword,
          normalizedKeyword: normalized.normalizedKeyword,
          url: normalized.url,
          position: normalized.position,
          engine: 'GOOGLE',
          country: normalized.country,
          language: normalized.language,
          device: normalized.device,
          observedAt: new Date(normalized.observedAt),
          source: 'SERP_PROVIDER',
          evidenceState: normalized.evidenceState,
          impressions: null,
          clicks: null,
          identityKey,
          ...( {
            trackedKeywordId: String(tk.id),
            rankingUrl: url,
            serpFeatures:
              observedFeatures.length > 0
                ? observedFeatures
                : undefined,
            resultType: resultType ?? undefined,
            aiOverviewState: aiOverview,
            aiCitationState:
              aiPresence?.citedUrls &&
              aiPresence.citedUrls.length > 0
                ? 'AI_CITATION'
                : undefined,
          } as Record<string, unknown>),
        } as any,
      });
    }
    await this.tracked.update({
      where: { id: String(tk.id) },
      data: {
        lastObservedAt: new Date(normalized.observedAt),
        lastPosition: normalized.position,
        lastRankingUrl: url,
      },
    });
    void confirmedAbsent;
    return { ok: true, skipped: false };
  }

  async listRuns(
    organizationId: string,
    websiteId: string,
    limit = 20,
  ) {
    await this.verifyWebsite(organizationId, websiteId);
    return this.runs.findMany({
      where: { organizationId, websiteId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(50, Math.max(1, limit)),
    });
  }

  /* ============ history + detail (§16/§17) ============ */

  private composeDetail(
    tk: {
      id: string;
      keyword: string;
      normalizedKeyword: string;
      country: string;
      language: string;
      device: string;
      searchEngine: string;
      targetUrl: string | null;
      origin: string;
      isActive: boolean;
      trackingStartedAt: Date;
      lastObservedAt: Date | null;
      lastPosition: number | null;
      lastRankingUrl: string | null;
    },
    observations: Array<{
      position: number | null;
      url: string | null;
      rankingUrl?: string | null;
      observedAt: Date;
      source: string;
      serpFeatures?: unknown;
      aiOverviewState?: string | null;
      aiCitationState?: string | null;
    }>,
  ) {
    const ordered = [...observations].sort((a, b) =>
      a.observedAt < b.observedAt ? -1 : 1,
    );
    const valid = ordered.filter(
      (o) => o.position !== null,
    );
    const current =
      valid.length > 0
        ? (valid[valid.length - 1].position as number)
        : null;
    const previous =
      valid.length > 1
        ? (valid[valid.length - 2].position as number)
        : null;
    const currentConfirmedAbsent =
      ordered.length > 0 &&
      ordered[ordered.length - 1].position === null;
    const previousConfirmedAbsent =
      ordered.length > 1 &&
      ordered[ordered.length - 2].position === null;
    const movement = rankMovement2({
      previous,
      current,
      previousExists: ordered.length > 0,
      previousConfirmedAbsent,
      currentConfirmedAbsent,
    });
    const delta = positionDelta(previous, current);
    const band = positionBand(
      current,
      currentConfirmedAbsent,
    );
    const rankingUrl =
      valid.length > 0
        ? String(
            valid[valid.length - 1].rankingUrl ??
              valid[valid.length - 1].url ??
              null,
          ) || null
        : null;
    const prevUrl =
      valid.length > 1
        ? String(
            valid[valid.length - 2].rankingUrl ??
              valid[valid.length - 2].url ??
              null,
          ) || null
        : null;
    const urlState = rankingUrlState(
      prevUrl,
      rankingUrl,
      valid.length > 0,
    );
    const target = targetUrlState({
      targetUrl: tk.targetUrl,
      rankingUrl,
      position: current,
      providerConfirmedAbsent: currentConfirmedAbsent,
    });
    const lastFeatures = normalizeSerpFeatures(
      (ordered[ordered.length - 1] as any)?.serpFeatures ??
        [],
    );
    const aiOverview =
      ordered.length > 0
        ? (((ordered[ordered.length - 1] as any)
            ?.aiOverviewState as string) ??
          (lastFeatures.includes('AI_OVERVIEW')
            ? 'PRESENT'
            : 'UNKNOWN'))
        : 'UNKNOWN';
    const aiMode =
      ordered.length > 0
        ? aiModeState({
            cited:
              (ordered[ordered.length - 1] as any)
                ?.aiCitationState === 'AI_CITATION'
                ? true
                : null,
            mentioned: null,
            providerSupportsAi:
              (ordered[ordered.length - 1] as any)
                ?.aiCitationState !== undefined ||
              lastFeatures.length > 0,
          })
        : 'UNKNOWN';
    const divergence = aiGoogleDivergence({
      trackedPosition: current,
      aiOverview: (aiOverview === 'PRESENT'
        ? 'PRESENT'
        : aiOverview === 'NOT_OBSERVED'
          ? 'NOT_OBSERVED'
          : 'UNKNOWN') as 'PRESENT' | 'NOT_OBSERVED' | 'UNKNOWN',
      aiMode: aiMode as
        | 'AI_MENTION'
        | 'AI_CITATION'
        | 'AI_NOT_OBSERVED'
        | 'UNKNOWN',
    });
    const volatility = describeVolatility(
      ordered.map((o) => o.position),
    );
    const sufficiency = historySufficiency({
      observationCount: ordered.length,
      trackingStartedAt: tk.trackingStartedAt
        ? new Date(tk.trackingStartedAt).toISOString()
        : null,
      oldestObservationAt:
        ordered.length > 0
          ? new Date(ordered[0].observedAt).toISOString()
          : null,
    });
    const gscRows = ordered.filter(
      (o) => o.source === 'GSC',
    );
    const gscPosition =
      gscRows.length > 0
        ? (gscRows[gscRows.length - 1].position as number | null)
        : null;
    return {
      trackedKeyword: tk,
      current,
      previous,
      movement,
      delta,
      band,
      strikingDistance: isStrikingDistance2(current),
      rankingUrl,
      previousUrl: prevUrl,
      urlState,
      rankingUrlChanged: urlState === 'URL_CHANGED',
      targetUrl: tk.targetUrl,
      targetState: target,
      wrongUrlRanking: target === 'OTHER_URL_RANKING',
      serpFeatures: lastFeatures,
      aiOverview,
      aiMode,
      divergence,
      volatility,
      historyState: sufficiency,
      gscComparison: compareGscToTracked({
        gscPosition,
        trackedPosition: current,
      }),
      gscPosition,
      investigation: investigationCopy({
        keyword: tk.keyword,
        previous,
        current,
        rankingUrl,
      }),
      observations: ordered.map((o) => ({
        position: o.position,
        rankingUrl:
          (o.rankingUrl ?? o.url ?? null) as string | null,
        observedAt: new Date(o.observedAt).toISOString(),
        source: o.source,
      })),
      observationCount: ordered.length,
      lastObservedAt: tk.lastObservedAt
        ? new Date(tk.lastObservedAt).toISOString()
        : null,
    };
  }

  async getHistory(
    organizationId: string,
    websiteId: string,
    id: string,
    days: number,
  ) {
    const detail = await this.getTracked(
      organizationId,
      websiteId,
      id,
    );
    const allowed = (HISTORY_WINDOWS as readonly number[]).includes(
      days,
    )
      ? days
      : 28;
    const since =
      Date.now() - allowed * 24 * 60 * 60 * 1000;
    const observations = detail.observations.filter(
      (o) => new Date(o.observedAt).getTime() >= since,
    );
    if (observations.length < 2) {
      return {
        ...detail,
        windowDays: allowed,
        observations,
        historyState: 'TRACKING_STARTED' as const,
        note: 'TRACKING STARTED — history is insufficient for this window. No values were fabricated.',
      };
    }
    return {
      ...detail,
      windowDays: allowed,
      observations,
    };
  }

  /* ============ overview (§52/§53/§62/§63) ============ */

  async getIntelligenceOverview(
    organizationId: string,
    websiteId: string,
  ) {
    await this.verifyWebsite(organizationId, websiteId);
    const [tracked, latestRun] = await Promise.all([
      this.tracked.findMany({
        where: { organizationId, websiteId },
        orderBy: { createdAt: 'asc' },
        take: 500,
      }),
      this.runs.findFirst({
        where: { organizationId, websiteId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const actives = (tracked as Array<any>).filter(
      (t) => t.isActive,
    );
    let top3 = 0;
    let top10 = 0;
    let gains = 0;
    let losses = 0;
    let wrongUrl = 0;
    for (const t of actives) {
      const band = positionBand(
        t.lastPosition ?? null,
        false,
      );
      if (band === 'TOP_3') {
        top3++;
        top10++;
      } else if (band === 'TOP_10') {
        top10++;
      }
      if (
        t.targetUrl &&
        t.lastRankingUrl &&
        String(t.targetUrl).trim().toLowerCase() !==
          String(t.lastRankingUrl).trim().toLowerCase() &&
        t.lastPosition !== null
      ) {
        wrongUrl++;
      }
    }
    /* Movement counts come from the 1.0 change feed
     * vocabulary mapped onto 2.0 GAINED/LOST wording
     * at the presentation layer; counts here use the
     * last-observation bands honestly. */
    void gains;
    void losses;
    const health = trackingHealth({
      trackedCount: actives.length,
      providerConfigured: isDataForSeoConfigured(),
      lastRunStatus: ((latestRun as any)?.status ??
        null) as TrackingRunStatus | null,
      lastRunAt: (latestRun as any)?.finishedAt
        ? new Date((latestRun as any).finishedAt).toISOString()
        : ((latestRun as any)?.createdAt
            ? new Date(
                (latestRun as any).createdAt,
              ).toISOString()
            : null),
      staleAfterHours: STALE_AFTER_HOURS,
    });
    return {
      trackedKeywords: (tracked as any[]).length,
      activeKeywords: actives.length,
      top3,
      top10,
      wrongUrlCount: wrongUrl,
      health,
      providerConfigured: isDataForSeoConfigured(),
      lastRun: latestRun,
      lastObserved: 'last observation per tracked keyword (see list)',
      gscNote:
        'GSC POSITION is aggregate Search Console performance; TRACKED POSITION is a point-in-time SERP observation. Compared as DIFFERENT_MEASUREMENT_CONTEXT.',
      providerNote: isDataForSeoConfigured()
        ? 'Provider configured.'
        : 'TRACKING_PROVIDER_UNAVAILABLE: connect DataForSEO credentials to enable live observations. Nothing is faked while unavailable.',
    };
  }

  async listPages(
    organizationId: string,
    websiteId: string,
  ) {
    await this.verifyWebsite(organizationId, websiteId);
    const tracked = (await this.tracked.findMany({
      where: { organizationId, websiteId, isActive: true },
      take: 500,
    })) as Array<any>;
    const byPage = new Map<
      string,
      {
        page: string;
        keywords: number;
        top3: number;
        top10: number;
        best: number | null;
        positions: number[];
      }
    >();
    for (const t of tracked) {
      const page =
        String(t.lastRankingUrl ?? t.targetUrl ?? '') ||
        '(no ranking URL observed)';
      let entry = byPage.get(page);
      if (!entry) {
        entry = {
          page,
          keywords: 0,
          top3: 0,
          top10: 0,
          best: null,
          positions: [],
        };
        byPage.set(page, entry);
      }
      entry.keywords++;
      if (t.lastPosition !== null) {
        entry.positions.push(t.lastPosition);
        if (entry.best === null || t.lastPosition < entry.best) {
          entry.best = t.lastPosition;
        }
        if (t.lastPosition <= 3) entry.top3++;
        if (t.lastPosition <= 10) entry.top10++;
      }
    }
    return {
      pages: [...byPage.values()]
        .map((p) => ({
          page: p.page,
          keywordCount: p.keywords,
          top3: p.top3,
          top10: p.top10,
          bestPosition: p.best,
          averagePosition:
            p.positions.length > 0
              ? Math.round(
                  (p.positions.reduce((a, b) => a + b, 0) /
                    p.positions.length) *
                    10,
                ) / 10
              : null,
          gscNote:
            'GSC clicks/impressions attach per query in the keyword detail GSC panel when Search Console is connected.',
        }))
        .sort((a, b) => b.keywordCount - a.keywordCount)
        .slice(0, 100),
    };
  }

  async listCompetitors(
    organizationId: string,
    websiteId: string,
    input: { keywordId?: string },
  ) {
    await this.verifyWebsite(organizationId, websiteId);
    /* Competitors are evidence-backed only: derived
     * from stored SERP provider observations would
     * require per-keyword SERP snapshots; until a run
     * has stored competitor rows, report UNKNOWN
     * honestly instead of inventing competitors. */
    if (!input.keywordId) {
      return {
        competitors: [],
        note: 'Competitor movement is provider-observed only. No SERP snapshot with competitor rows is stored for this website yet — no competitors invented.',
        movementState: 'UNKNOWN' as const,
      };
    }
    const detail = await this.getTracked(
      organizationId,
      websiteId,
      input.keywordId,
    );
    void competitorMove;
    return {
      keyword: detail.trackedKeyword.keyword,
      yourPosition: detail.current,
      competitors: [],
      movementState: 'UNKNOWN' as const,
      note: 'No competitor rows were provider-observed for this keyword yet. Reuse existing Competitive Intelligence (Phase 27) for domain-level evidence.',
    };
  }

  /* ============ alerts (§43/§44) ============ */

  async evaluateAlerts(
    organizationId: string,
    websiteId: string,
    input: { keywordId?: string; limit?: number },
  ) {
    await this.verifyWebsite(organizationId, websiteId);
    const cap = Math.min(
      50,
      Math.max(1, Math.floor(input.limit ?? 20) || 20),
    );
    const tracked = (await this.tracked.findMany({
      where: {
        organizationId,
        websiteId,
        isActive: true,
        ...(input.keywordId ? { id: input.keywordId } : {}),
      },
      take: cap,
    })) as Array<any>;
    const created: Array<{
      trigger: RankAlertTrigger;
      title: string;
    }> = [];
    for (const t of tracked) {
      let detail;
      try {
        detail = await this.getTracked(
          organizationId,
          websiteId,
          String(t.id),
        );
      } catch {
        continue;
      }
      const prevFeatures: SerpFeature[] = [];
      const candidates = buildAlertCandidates({
        keyword: t.keyword,
        previous: detail.previous,
        current: detail.current,
        previousUrl: detail.previousUrl,
        currentUrl: detail.rankingUrl,
        targetUrl: detail.targetUrl,
        previousFeatures: prevFeatures,
        currentFeatures: detail.serpFeatures,
        competitorOvertook: false,
        competitorDomain: null,
      });
      for (const c of candidates) {
        const dedup = `RANK:${t.id}:${c.trigger}:${observationWindowKey(new Date().toISOString())}`;
        try {
          await this.monitoring.createAlert(organizationId, {
            websiteId,
            type: c.trigger,
            source: 'RANK' as never,
            severity: c.severity,
            title: c.title,
            description: `${c.description} Keyword: ${t.keyword}. What we know: OBSERVED. Cause unknown.`,
            evidence: {
              keyword: t.keyword,
              trackedKeywordId: t.id,
              previous: detail.previous,
              current: detail.current,
              rankingUrl: detail.rankingUrl,
              targetUrl: detail.targetUrl,
              trigger: c.trigger,
            } as never,
            deduplicationKey: dedup,
          });
          created.push({
            trigger: c.trigger,
            title: c.title,
          });
        } catch {
          /* Alert infra may reject the RANK source on
           * older deployments — surface honestly. */
          continue;
        }
      }
    }
    return {
      evaluated: tracked.length,
      alertsCreated: created.length,
      alerts: created,
      note: 'Alerts are descriptive and meaningful-movement only (3+ positions, band entries/exits, wrong-URL, feature changes). No “SEO emergency” language unless configured.',
    };
  }

  /* ============ command center (max 3 signals) ============ */

  async commandSignals(
    organizationId: string,
    websiteId: string,
  ) {
    const overview = await this.getIntelligenceOverview(
      organizationId,
      websiteId,
    );
    const signals: Array<{
      title: string;
      why: string;
      evidence: Record<string, unknown>;
      action: string;
      measurement: string;
    }> = [];
    if (overview.wrongUrlCount > 0) {
      signals.push({
        title: `${overview.wrongUrlCount} target page${overview.wrongUrlCount === 1 ? ' was' : 's were'} replaced by another URL.`,
        why: 'The intended page is not the ranking URL (observed).',
        evidence: {
          count: overview.wrongUrlCount,
          evidenceState: 'OBSERVED',
        },
        action:
          'Open keyword detail → WHY → Why-Not-#1 and cannibalization review.',
        measurement:
          'Track change: before rank → execution → verification → after rank → GSC → AI → business. No causal claims.',
      });
    }
    if (overview.top10 > 0) {
      signals.push({
        title: `${overview.top10} tracked keyword${overview.top10 === 1 ? '' : 's'} in the Top 10.`,
        why: 'Tracked positions observed in striking/protect bands.',
        evidence: {
          top10: overview.top10,
          top3: overview.top3,
          evidenceState: 'OBSERVED',
        },
        action:
          'Protect pages in Top 3; review intent alignment for positions 4–10.',
        measurement:
          'Verify via tracked history (7d/28d/90d) plus GSC POSITION trend.',
      });
    }
    if (overview.health !== 'ACTIVE') {
      signals.push({
        title: `Rank tracking health: ${overview.health}.`,
        why:
          overview.health === 'NOT_CONFIGURED'
            ? 'No active tracked keywords.'
            : 'Provider or recency gap (observed).',
        evidence: {
          health: overview.health,
          providerConfigured: overview.providerConfigured,
          evidenceState: 'OBSERVED',
        },
        action:
          overview.health === 'NOT_CONFIGURED'
            ? 'Add keywords (GSC / strategy / manual), select location + device, start tracking.'
            : 'Check provider credentials and run recency.',
        measurement:
          'Last observed timestamps per keyword; stale is labeled STALE, never stable.',
      });
    }
    return { signals: signals.slice(0, 3) };
  }

  /* ============ tenant/website isolation guard ============ */

  async assertOwnership(
    organizationId: string,
    websiteId: string,
    id: string,
  ): Promise<boolean> {
    const row = await this.tracked.findFirst({
      where: { id, organizationId, websiteId },
      select: { id: true },
    });
    return Boolean(row);
  }
}

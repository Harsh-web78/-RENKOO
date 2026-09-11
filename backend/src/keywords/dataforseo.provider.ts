import { Injectable, Logger } from '@nestjs/common';

import {
  DataForSeoClient,
  DataForSeoError,
  chunk,
  dataForSeoConfigFromEnv,
  mapLimit,
} from './dataforseo.client';
import {
  MonthlyPoint,
  NormalizedCompetitorKeyword,
  NormalizedKeywordIdea,
  NormalizedKeywordMetrics,
  NormalizedSerpFeature,
  NormalizedSerpObservation,
  NormalizedSerpResult,
  PageStrengthRow,
  ProviderCapabilities,
  ProviderContext,
  ProviderIntent,
  TrendSignal,
  dataForSeoCapabilities,
  isDataForSeoConfigured,
} from './keyword-data-provider';
import {
  classifyContentType,
  normalizeSerpUrl,
} from './serp-analysis';

/*
 * =========================================================
 * DATAFORSEO PROVIDER (server-only, credentials from env)
 *
 * Selected over Semrush API and SerpApi because one vendor
 * covers the whole stack: keyword discovery (suggestions /
 * related / ideas), bulk volume + CPC + competition +
 * 12-month history (up to 1000 keywords/request), Labs KD
 * 0–100 + I/C/T/N intent in bulk, competitor ranked
 * keywords, and live SERP with rich features — all
 * pay-as-you-go with precise location/language targeting.
 * Semrush API gates access behind a ~$549/mo plan plus
 * opaque unit packages; SerpApi is SERP-only at roughly
 * 5–40x the per-SERP price with subscription hourly caps.
 *
 * Endpoints used (all synchronous "live", no polling):
 *  - labs/google/keyword_suggestions/live  ideas+metrics
 *  - labs/google/related_keywords/live     related ideas
 *  - labs/google/bulk_keyword_difficulty/live  KD x1000
 *  - labs/google/search_intent/live        intent x1000
 *  - keywords_data/google_ads/search_volume/live  vol/CPC/history x1000
 *  - labs/google/ranked_keywords/live      competitor keywords
 *  - serp/google/organic/live/advanced     SERP on demand
 *  - backlinks/bulk_ranks/live             page/domain rank
 *    (≤1000 targets per call)
 *  - labs/google/bulk_traffic_estimation/live  domain ETV
 *
 * Backlinks/referring-domains per page are NOT returned
 * by bulk_ranks — those fields stay null (unavailable),
 * never zero.
 *
 * Parsing is defensive: every field is type-checked and
 * missing values stay null. Per-task failures are logged
 * (without secrets) and skipped, never thrown upward.
 * =========================================================
 */

/* Verified DataForSEO location codes. Unknown countries
   fall back to US with locationFallback=true (surfaced). */
const LOCATION_CODES: Record<string, number> = {
  US: 2840,
  GB: 2826,
  UK: 2826,
  IN: 2356,
  CA: 2124,
  AU: 2036,
  DE: 2276,
  FR: 2250,
};

const MAX_BULK = 1000;
const MAX_CONCURRENT_LIVE = 4;

function numOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  return s ? s : null;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(
      /^www\./,
      '',
    );
  } catch {
    return '';
  }
}

function toProviderIntent(
  value: unknown,
): ProviderIntent | null {
  const s = String(value ?? '')
    .trim()
    .toLowerCase();
  if (
    s === 'informational' ||
    s === 'navigational' ||
    s === 'commercial' ||
    s === 'transactional'
  ) {
    return s;
  }
  return null;
}

export function trendFromHistory(
  points: MonthlyPoint[],
): TrendSignal | null {
  const vols = points
    .slice(-12)
    .map((p) => p.searchVolume)
    .filter(
      (v): v is number =>
        typeof v === 'number' && v >= 0,
    );
  if (vols.length < 6) {
    return {
      direction: 'insufficient',
      detail:
        'Fewer than 6 months of history — trend needs more data.',
    };
  }
  const first3 =
    vols.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  const last3 =
    vols.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const mean =
    vols.reduce((a, b) => a + b, 0) / vols.length;
  const variance =
    vols.reduce(
      (a, b) => a + (b - mean) * (b - mean),
      0,
    ) / vols.length;
  const cv =
    mean > 0 ? Math.sqrt(variance) / mean : 0;

  /* Seasonal: high variation AND oscillating direction
     (month-over-month sign flips). A steady ramp has high
     CV too but zero flips — that is rising, not seasonal. */
  const signs: number[] = [];
  for (let i = 1; i < vols.length; i++) {
    const delta = vols[i] - vols[i - 1];
    if (delta !== 0) {
      signs.push(delta > 0 ? 1 : -1);
    }
  }
  let flips = 0;
  for (let i = 1; i < signs.length; i++) {
    if (signs[i] !== signs[i - 1]) flips++;
  }
  if (vols.length >= 12 && cv > 0.35 && flips >= 3) {
    const peak = vols.indexOf(Math.max(...vols));
    return {
      direction: 'seasonal',
      detail: `Demand oscillates across the trailing 12 months (peak month ${points.slice(-12)[peak]?.month ?? '?'}) — plan content around the season.`,
    };
  }
  if (first3 > 0 && last3 >= first3 * 1.2) {
    return {
      direction: 'rising',
      detail: `Trailing 3-month demand is ${Math.round(((last3 - first3) / first3) * 100)}% above the earliest 3 months.`,
    };
  }
  if (first3 > 0 && last3 <= first3 * 0.8) {
    return {
      direction: 'declining',
      detail: `Trailing 3-month demand is ${Math.round(((first3 - last3) / first3) * 100)}% below the earliest 3 months.`,
    };
  }
  return {
    direction: 'stable',
    detail:
      'Demand is flat across the available history (within ±20%).',
  };
}

/* Labs monthly_searches is an array; Ads API returns an
   object keyed by "YYYY-MM". Both become MonthlyPoint[]. */
function parseMonthly(
  raw: unknown,
): MonthlyPoint[] {
  if (Array.isArray(raw)) {
    return raw
      .map((m: any) => ({
        year: Number(m?.year),
        month: Number(m?.month),
        searchVolume: numOrNull(
          m?.search_volume,
        ),
      }))
      .filter(
        (p) =>
          Number.isFinite(p.year) &&
          p.month >= 1 &&
          p.month <= 12,
      );
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw)
      .map(([key, value]) => {
        const match = /^(\d{4})-(\d{2})$/.exec(
          key,
        );
        if (!match) return null;
        return {
          year: Number(match[1]),
          month: Number(match[2]),
          searchVolume: numOrNull(value),
        };
      })
      .filter(
        (p): p is MonthlyPoint => p !== null,
      )
      .sort(
        (a, b) =>
          a.year - b.year || a.month - b.month,
      );
  }
  return [];
}

@Injectable()
export class DataForSeoProvider {
  readonly id = 'DATAFORSEO';
  readonly displayName =
    'DataForSEO (Keywords Data + Labs + SERP)';
  private readonly logger = new Logger(
    DataForSeoProvider.name,
  );

  isConfigured(): boolean {
    return isDataForSeoConfigured();
  }

  capabilities(): ProviderCapabilities {
    return dataForSeoCapabilities();
  }

  resolveContext(
    country?: string,
    language?: string,
  ): ProviderContext {
    const cc = (country ?? 'US')
      .trim()
      .toUpperCase();
    const code = LOCATION_CODES[cc];
    return {
      country: code ? cc : 'US',
      language: (language ?? 'en')
        .trim()
        .toLowerCase()
        .slice(0, 10),
      locationCode: code ?? LOCATION_CODES.US,
      locationFallback: !code,
    };
  }

  private client(): DataForSeoClient {
    const config = dataForSeoConfigFromEnv();
    if (!config) {
      throw new DataForSeoError(
        'PROVIDER_NOT_CONFIGURED',
        'DataForSEO credentials are not configured. Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD.',
        { retryable: false },
      );
    }
    return new DataForSeoClient(config);
  }

  /* =====================================================
   * IDEAS (suggestions + related, merged + deduped)
   * =====================================================
   */

  async fetchIdeas(
    seed: string,
    ctx: ProviderContext,
    limit = 100,
  ): Promise<NormalizedKeywordIdea[]> {
    const client = this.client();
    const perSource = Math.min(
      100,
      Math.max(20, limit),
    );

    const [suggestions, related] =
      await Promise.all([
        this.safeIdeas(
          client,
          '/v3/dataforseo_labs/google/keyword_suggestions/live',
          [
            {
              keyword: seed,
              location_code: ctx.locationCode,
              language_code: ctx.language,
              include_seed_keyword: false,
              limit: perSource,
              order_by: [
                'keyword_info.search_volume,desc',
              ],
            },
          ],
          'suggestion',
          ctx,
        ),
        this.safeIdeas(
          client,
          '/v3/dataforseo_labs/google/related_keywords/live',
          [
            {
              keyword: seed,
              location_code: ctx.locationCode,
              language_code: ctx.language,
              depth: 1,
              limit: perSource,
            },
          ],
          'related',
          ctx,
        ),
      ]);

    const merged = new Map<
      string,
      NormalizedKeywordIdea
    >();
    for (const idea of [...suggestions, ...related]) {
      const key = idea.keyword.toLowerCase();
      if (!merged.has(key)) merged.set(key, idea);
    }

    return [...merged.values()]
      .sort(
        (a, b) =>
          (b.metrics?.searchVolume ?? -1) -
          (a.metrics?.searchVolume ?? -1),
      )
      .slice(0, limit);
  }

  private async safeIdeas(
    client: DataForSeoClient,
    path: string,
    tasks: Record<string, unknown>[],
    source: NormalizedKeywordIdea['source'],
    ctx: ProviderContext,
  ): Promise<NormalizedKeywordIdea[]> {
    try {
      const { tasks: envelopes } =
        await client.postLive(path, tasks);
      const out: NormalizedKeywordIdea[] = [];
      for (const env of envelopes) {
        if (env.status_code !== 20000 || !env.result) {
          this.logger.warn(
            `DataForSEO ${path} task ${env.status_code}: ${env.status_message}`,
          );
          continue;
        }
        for (const block of env.result) {
          const items: any[] = Array.isArray(
            block?.items,
          )
            ? block.items
            : [];
          for (const item of items) {
            const parsed = this.parseIdeaItem(
              item,
              source,
              ctx,
            );
            if (parsed) out.push(parsed);
          }
        }
      }
      return out;
    } catch (err) {
      /* Auth/billing misconfiguration must fail fast with
         a clear error — never silently degrade while the
         vendor account needs attention. */
      if (
        err instanceof DataForSeoError &&
        (err.code === 'INVALID_PROVIDER_KEY' ||
          err.code === 'QUOTA_EXCEEDED')
      ) {
        throw err;
      }
      this.logger.warn(
        `DataForSEO ${path} failed: ${(err as Error)?.message ?? err}`,
      );
      return [];
    }
  }

  private parseIdeaItem(
    item: any,
    source: NormalizedKeywordIdea['source'],
    ctx: ProviderContext,
  ): NormalizedKeywordIdea | null {
    /* Related-keywords nests under keyword_data; the
       suggestions endpoint returns a flat item. */
    const node = item?.keyword_data ?? item;
    const keyword = strOrNull(node?.keyword);
    if (!keyword) return null;

    const info = node?.keyword_info ?? {};
    const props = node?.keyword_properties ?? {};
    const intentNode =
      node?.search_intent_info ?? {};
    const monthly = parseMonthly(
      info?.monthly_searches,
    );

    const metrics: NormalizedKeywordMetrics = {
      keyword: keyword.toLowerCase(),
      country: ctx.country,
      language: ctx.language,
      searchVolume: numOrNull(
        info?.search_volume,
      ),
      keywordDifficulty: numOrNull(
        props?.keyword_difficulty,
      ),
      cpc: numOrNull(info?.cpc),
      competition: numOrNull(
        info?.competition,
      ),
      competitionLevel: strOrNull(
        info?.competition_level,
      ),
      monthlySearches: monthly,
      trend: trendFromHistory(monthly),
      providerIntent: toProviderIntent(
        intentNode?.main_intent,
      ),
      serpFeatures: [],
      dataSource: 'DATAFORSEO',
      lastUpdated: new Date().toISOString(),
    };

    return {
      keyword: keyword.toLowerCase(),
      source,
      metrics,
    };
  }

  /* =====================================================
   * BULK METRICS (volume/CPC/competition + history)
   * =====================================================
   */

  async fetchMetrics(
    keywords: string[],
    ctx: ProviderContext,
  ): Promise<Map<string, NormalizedKeywordMetrics>> {
    const out = new Map<
      string,
      NormalizedKeywordMetrics
    >();
    if (keywords.length === 0) return out;
    const client = this.client();

    const batches = chunk(
      [...new Set(keywords.map((k) => k.trim()).filter(Boolean))],
      MAX_BULK,
    );

    const results = await mapLimit(
      batches,
      MAX_CONCURRENT_LIVE,
      (batch) =>
        client.postLive(
          '/v3/keywords_data/google_ads/search_volume/live',
          [
            {
              keywords: batch,
              location_code: ctx.locationCode,
              language_code: ctx.language,
            },
          ],
        ),
    );

    for (const res of results) {
      if (!res.ok) {
        this.logger.warn(
          `DataForSEO search_volume batch failed: ${(res.error as Error)?.message ?? res.error}`,
        );
        continue;
      }
      for (const env of res.value.tasks) {
        if (env.status_code !== 20000 || !env.result) {
          this.logger.warn(
            `DataForSEO search_volume task ${env.status_code}: ${env.status_message}`,
          );
          continue;
        }
        for (const block of env.result) {
          const items: any[] = Array.isArray(
            block,
          )
            ? block
            : (block?.items ?? []);
          for (const item of items) {
            const keyword = strOrNull(
              item?.keyword,
            )?.toLowerCase();
            if (!keyword) continue;
            const monthly = parseMonthly(
              item?.monthly_searches,
            );
            out.set(keyword, {
              keyword,
              country: ctx.country,
              language: ctx.language,
              searchVolume: numOrNull(
                item?.search_volume,
              ),
              keywordDifficulty: null,
              cpc: numOrNull(item?.cpc),
              competition: numOrNull(
                item?.competition,
              ),
              competitionLevel: strOrNull(
                item?.competition_level,
              ),
              monthlySearches: monthly,
              trend: trendFromHistory(monthly),
              providerIntent: null,
              serpFeatures: [],
              dataSource: 'DATAFORSEO',
              lastUpdated:
                new Date().toISOString(),
            });
          }
        }
      }
    }

    return out;
  }

  /* =====================================================
   * BULK DIFFICULTY + INTENT (up to 1000 per request)
   * =====================================================
   */

  async fetchDifficulty(
    keywords: string[],
    ctx: ProviderContext,
  ): Promise<Map<string, number | null>> {
    const out = new Map<string, number | null>();
    if (keywords.length === 0) return out;
    const client = this.client();

    const results = await mapLimit(
      chunk(
        [...new Set(keywords.map((k) => k.trim()).filter(Boolean))],
        MAX_BULK,
      ),
      MAX_CONCURRENT_LIVE,
      (batch) =>
        client.postLive(
          '/v3/dataforseo_labs/google/bulk_keyword_difficulty/live',
          [
            {
              keywords: batch,
              location_code: ctx.locationCode,
              language_code: ctx.language,
            },
          ],
        ),
    );

    for (const res of results) {
      if (!res.ok) {
        this.logger.warn(
          `DataForSEO difficulty batch failed: ${(res.error as Error)?.message ?? res.error}`,
        );
        continue;
      }
      for (const env of res.value.tasks) {
        if (env.status_code !== 20000 || !env.result) {
          this.logger.warn(
            `DataForSEO difficulty task ${env.status_code}: ${env.status_message}`,
          );
          continue;
        }
        for (const block of env.result) {
          const items: any[] = Array.isArray(
            block?.items,
          )
            ? block.items
            : [];
          for (const item of items) {
            const keyword = strOrNull(
              item?.keyword,
            )?.toLowerCase();
            if (!keyword) continue;
            out.set(
              keyword,
              numOrNull(item?.keyword_difficulty),
            );
          }
        }
      }
    }
    return out;
  }

  async fetchIntent(
    keywords: string[],
    ctx: ProviderContext,
  ): Promise<Map<string, ProviderIntent | null>> {
    const out = new Map<
      string,
      ProviderIntent | null
    >();
    if (keywords.length === 0) return out;
    const client = this.client();

    const results = await mapLimit(
      chunk(
        [...new Set(keywords.map((k) => k.trim()).filter(Boolean))],
        MAX_BULK,
      ),
      MAX_CONCURRENT_LIVE,
      (batch) =>
        client.postLive(
          '/v3/dataforseo_labs/google/search_intent/live',
          [
            {
              keywords: batch,
              location_code: ctx.locationCode,
              language_code: ctx.language,
            },
          ],
        ),
    );

    for (const res of results) {
      if (!res.ok) {
        this.logger.warn(
          `DataForSEO intent batch failed: ${(res.error as Error)?.message ?? res.error}`,
        );
        continue;
      }
      for (const env of res.value.tasks) {
        if (env.status_code !== 20000 || !env.result) {
          this.logger.warn(
            `DataForSEO intent task ${env.status_code}: ${env.status_message}`,
          );
          continue;
        }
        for (const block of env.result) {
          const items: any[] = Array.isArray(
            block?.items,
          )
            ? block.items
            : [];
          for (const item of items) {
            const keyword = strOrNull(
              item?.keyword,
            )?.toLowerCase();
            if (!keyword) continue;
            out.set(
              keyword,
              toProviderIntent(
                item?.keyword_intent?.label,
              ),
            );
          }
        }
      }
    }
    return out;
  }

  async fetchHistory(
    keywords: string[],
    ctx: ProviderContext,
  ): Promise<Map<string, MonthlyPoint[]>> {
    /* History rides on the Ads search_volume payload —
       reuse fetchMetrics and project the monthly series. */
    const metrics = await this.fetchMetrics(
      keywords,
      ctx,
    );
    const out = new Map<string, MonthlyPoint[]>();
    for (const [key, value] of metrics) {
      out.set(key, value.monthlySearches);
    }
    return out;
  }

  /* =====================================================
   * COMPETITOR KEYWORDS (ranked_keywords for a domain)
   * =====================================================
   */

  async fetchCompetitorKeywords(
    domain: string,
    ctx: ProviderContext,
    limit = 100,
  ): Promise<NormalizedCompetitorKeyword[]> {
    const client = this.client();
    const clean = domain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0];
    if (!clean) return [];

    try {
      const { tasks } = await client.postLive(
        '/v3/dataforseo_labs/google/ranked_keywords/live',
        [
          {
            target: clean,
            location_code: ctx.locationCode,
            language_code: ctx.language,
            limit: Math.min(
              1000,
              Math.max(10, limit),
            ),
            order_by: ['keyword_data.keyword_info.search_volume,desc'],
          },
        ],
      );

      const out: NormalizedCompetitorKeyword[] =
        [];
      for (const env of tasks) {
        if (env.status_code !== 20000 || !env.result) {
          this.logger.warn(
            `DataForSEO ranked_keywords task ${env.status_code}: ${env.status_message}`,
          );
          continue;
        }
        for (const block of env.result) {
          const items: any[] = Array.isArray(
            block?.items,
          )
            ? block.items
            : [];
          for (const item of items) {
            const parsed =
              this.parseCompetitorItem(
                item,
                ctx,
              );
            if (parsed) out.push(parsed);
          }
        }
      }
      return out.slice(0, limit);
    } catch (err) {
      this.logger.warn(
        `DataForSEO ranked_keywords failed: ${(err as Error)?.message ?? err}`,
      );
      if (err instanceof DataForSeoError) throw err;
      return [];
    }
  }

  private parseCompetitorItem(
    item: any,
    ctx: ProviderContext,
  ): NormalizedCompetitorKeyword | null {
    const data = item?.keyword_data ?? {};
    const keyword = strOrNull(
      data?.keyword,
    )?.toLowerCase();
    if (!keyword) return null;

    const info = data?.keyword_info ?? {};
    const serp = item?.ranked_serp_element
      ?.serp_item ?? {};
    const position = numOrNull(
      serp?.rank_absolute ??
        serp?.rank_group ??
        item?.rank_absolute,
    );
    const url =
      strOrNull(serp?.url) ??
      strOrNull(item?.url);

    return {
      keyword,
      position:
        position !== null
          ? Math.round(position)
          : null,
      searchVolume: numOrNull(
        info?.search_volume,
      ),
      keywordDifficulty: numOrNull(
        data?.keyword_properties
          ?.keyword_difficulty,
      ),
      estimatedTraffic: numOrNull(
        item?.ranked_serp_element?.etv ??
          serp?.etv,
      ),
      providerIntent: toProviderIntent(
        data?.search_intent_info?.main_intent,
      ),
      rankingUrl: url,
      dataSource: 'DATAFORSEO',
      lastUpdated: new Date().toISOString(),
    };
  }

  /* =====================================================
   * SERP (live organic advanced, on demand per keyword)
   * =====================================================
   */

  async fetchSerp(
    keyword: string,
    ctx: ProviderContext,
  ): Promise<NormalizedSerpObservation> {
    const client = this.client();
    const { tasks } = await client.postLive(
      '/v3/serp/google/organic/live/advanced',
      [
        {
          keyword,
          location_code: ctx.locationCode,
          language_code: ctx.language,
          device: 'desktop',
          os: 'windows',
          depth: 10,
        },
      ],
    );

    const env = tasks[0];
    if (
      !env ||
      env.status_code !== 20000 ||
      !env.result
    ) {
      throw new DataForSeoError(
        'PROVIDER_ERROR',
        `DataForSEO SERP unavailable: ${env?.status_message ?? 'no result'}`,
        { retryable: true },
      );
    }

    const block = env.result[0] ?? {};
    const items: any[] = Array.isArray(
      block?.items,
    )
      ? block.items
      : [];

    const results: NormalizedSerpResult[] = [];
    const features: NormalizedSerpFeature[] = [];

    for (const entry of items) {
      const type = String(
        entry?.type ?? 'unknown',
      );
      if (type === 'organic') {
        const url = strOrNull(entry?.url);
        if (!url) continue;
        const title = strOrNull(entry?.title);
        results.push({
          position: numOrNull(
            entry?.rank_absolute,
          ),
          url,
          domain:
            strOrNull(entry?.domain) ??
            domainOf(url),
          title,
          snippet: strOrNull(
            entry?.description,
          ),
          resultType: 'organic',
          isOrganic: true,
          isPaid: false,
          contentType: classifyContentType(
            url,
            title,
          ),
          /* Authority signals attach later via
             fetchPageStrength — null until then. */
          domainRank: null,
          pageRank: null,
          backlinks: null,
          referringDomains: null,
          estimatedTraffic: null,
          pageStrength: 'Unknown',
          strengthEvidence: [],
        });
        continue;
      }
      /* Every non-organic element is a SERP feature.
         Unknown future types pass through generically —
         no invented AI-Overview detection. */
      const nested: any[] = Array.isArray(
        entry?.items,
      )
        ? entry.items
        : [];
      features.push({
        type,
        title: strOrNull(entry?.title),
        count: nested.length || 1,
      });
    }

    results.sort(
      (a, b) =>
        (a.position ?? 999) - (b.position ?? 999),
    );

    return {
      keyword,
      country: ctx.country,
      language: ctx.language,
      results: results.slice(0, 10),
      features,
      totalResults: numOrNull(
        block?.se_results_count ??
          block?.results_count,
      ),
      dataSource: 'DATAFORSEO',
      fetchedAt: new Date().toISOString(),
      /* Competition/intent/feature analysis attaches in
         the research service after strength enrichment. */
      competition: null,
      intentCheck: null,
      featureOpportunities: [],
      aiPresence: null,
    };
  }

  /* =====================================================
   * PAGE STRENGTH (bulk rank + domain traffic, 2 calls)
   *
   * One bulk_ranks call covers page URLs + unique domains
   * (≤1000 targets); one bulk_traffic_estimation call
   * covers the domains. Keys: normalized URL plus
   * `domain:<host>`. Fields the provider does not return
   * stay null — bulk_ranks reports rank only, so per-page
   * backlinks/referring-domains are unavailable.
   * =====================================================
   */

  async fetchPageStrength(
    urls: string[],
    ctx: ProviderContext,
  ): Promise<Map<string, PageStrengthRow>> {
    const out = new Map<string, PageStrengthRow>();
    const clean = [
      ...new Set(
        urls
          .map((u) => u.trim())
          .filter(Boolean),
      ),
    ].slice(0, 200);
    if (clean.length === 0) return out;
    const client = this.client();
    const fetchedAt = new Date().toISOString();

    const domains = [
      ...new Set(
        clean
          .map((u) => domainOf(u))
          .filter(Boolean),
      ),
    ];
    const targets = [...clean, ...domains].slice(
      0,
      1000,
    );

    try {
      const { tasks } = await client.postLive(
        '/v3/backlinks/bulk_ranks/live',
        [{ targets }],
      );
      for (const env of tasks) {
        if (env.status_code !== 20000 || !env.result) {
          this.logger.warn(
            `DataForSEO bulk_ranks task ${env.status_code}: ${env.status_message}`,
          );
          continue;
        }
        for (const block of env.result) {
          const items: any[] = Array.isArray(
            block?.items,
          )
            ? block.items
            : [];
          for (const item of items) {
            const target = strOrNull(
              item?.target,
            );
            if (!target) continue;
            const rank = numOrNull(item?.rank);
            const host = domainOf(target);
            const key = host
              ? normalizeSerpUrl(target)
              : target.toLowerCase();
            const existing = out.get(key) ?? {
              url: target,
              domain: host || target,
              pageRank: null,
              domainRank: null,
              backlinks: null,
              referringDomains: null,
              domainTraffic: null,
              dataSource: 'DATAFORSEO',
              fetchedAt,
            };
            /* Page targets carry page rank; bare-domain
               targets carry domain rank. */
            if (host && target !== host) {
              if (rank !== null) {
                existing.pageRank = Math.round(rank);
              }
            } else if (rank !== null) {
              existing.domainRank = Math.round(rank);
            }
            /* Defensive: keep any richer fields if the
               provider ever returns them. */
            const bl = numOrNull(
              item?.backlinks,
            );
            if (bl !== null) {
              existing.backlinks = Math.round(bl);
            }
            const rd = numOrNull(
              item?.referring_domains,
            );
            if (rd !== null) {
              existing.referringDomains =
                Math.round(rd);
            }
            out.set(key, existing);
          }
        }
      }
    } catch (err) {
      this.logger.warn(
        `DataForSEO bulk_ranks failed: ${(err as Error)?.message ?? err}`,
      );
      if (err instanceof DataForSeoError) throw err;
    }

    /* Domain estimated traffic (Labs, domain-level). */
    if (domains.length > 0) {
      try {
        const { tasks } = await client.postLive(
          '/v3/dataforseo_labs/google/bulk_traffic_estimation/live',
          [
            {
              targets: domains.slice(0, 1000),
              location_code: ctx.locationCode,
              language_code: ctx.language,
            },
          ],
        );
        for (const env of tasks) {
          if (
            env.status_code !== 20000 ||
            !env.result
          ) {
            this.logger.warn(
              `DataForSEO bulk_traffic_estimation task ${env.status_code}: ${env.status_message}`,
            );
            continue;
          }
          for (const block of env.result) {
            const items: any[] = Array.isArray(
              block?.items,
            )
              ? block.items
              : [];
            for (const item of items) {
              const target = strOrNull(
                item?.target,
              )?.toLowerCase();
              if (!target) continue;
              /* ETV hides in several shapes depending on
                 API version — try each, else null. */
              const etv = numOrNull(
                item?.metrics?.organic?.etv ??
                  item?.etv ??
                  item?.metrics?.etv ??
                  item?.organic_etv,
              );
              if (etv === null) continue;
              const key = `domain:${target.replace(/^www\./, '')}`;
              const existing = out.get(key) ?? {
                url: target,
                domain: target,
                pageRank: null,
                domainRank: null,
                backlinks: null,
                referringDomains: null,
                domainTraffic: null,
                dataSource: 'DATAFORSEO',
                fetchedAt,
              };
              existing.domainTraffic =
                Math.round(etv);
              out.set(key, existing);
            }
          }
        }
      } catch (err) {
        this.logger.warn(
          `DataForSEO bulk_traffic_estimation failed: ${(err as Error)?.message ?? err}`,
        );
        if (err instanceof DataForSeoError) throw err;
      }
    }

    return out;
  }

  async fetchIdeaStrings(
    seed: string,
    country?: string,
  ): Promise<string[]> {
    const ctx = this.resolveContext(country);
    const ideas = await this.fetchIdeas(
      seed,
      ctx,
      50,
    );
    return ideas.map((i) => i.keyword);
  }
}

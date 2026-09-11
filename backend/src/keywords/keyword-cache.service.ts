import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHash } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';

/*
 * =========================================================
 * KEYWORD PROVIDER CACHE (DB-backed, no new infra)
 *
 * Redis is provisioned but explicitly unwired in this
 * codebase, so the cache lives in Postgres via
 * KeywordMetricCache. Key = provider|metric|country|
 * language|keyword-hash — country, language and provider
 * are part of the key, so US data can never serve an
 * India request and vendors can never mix.
 *
 * TTLs follow metric freshness:
 *  metrics/difficulty/intent/competitor  14–30 days
 *  history                               14 days
 *  serp                                  3 days (SERP moves)
 *
 * Graceful degradation: if the migration has not been
 * applied yet, every read is a miss and writes are
 * skipped — research still works, just uncached.
 * =========================================================
 */

export type CacheMetric =
  | 'metrics'
  | 'difficulty'
  | 'intent'
  | 'history'
  | 'serp'
  | 'page_strength'
  | 'competitor_ideas'
  | 'competitor_keywords';

const TTL_MS: Record<CacheMetric, number> = {
  metrics: 14 * 24 * 60 * 60 * 1000,
  difficulty: 30 * 24 * 60 * 60 * 1000,
  intent: 30 * 24 * 60 * 60 * 1000,
  history: 14 * 24 * 60 * 60 * 1000,
  serp: 3 * 24 * 60 * 60 * 1000,
  /* Authority moves slowly; 14 days keeps cluster jobs
     and repeat drawer opens free. */
  page_strength: 14 * 24 * 60 * 60 * 1000,
  competitor_ideas: 7 * 24 * 60 * 60 * 1000,
  competitor_keywords: 7 * 24 * 60 * 60 * 1000,
};

@Injectable()
export class KeywordCacheService {
  private readonly logger = new Logger(
    KeywordCacheService.name,
  );
  private degradedWarned = false;

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private key(
    provider: string,
    metric: CacheMetric,
    country: string,
    language: string,
    keyword: string,
  ): string {
    const hash = createHash('sha256')
      .update(keyword.toLowerCase().trim())
      .digest('hex')
      .slice(0, 32);
    return `${provider}|${metric}|${country}|${language}|${hash}`;
  }

  private degraded(): void {
    if (!this.degradedWarned) {
      this.degradedWarned = true;
      this.logger.warn(
        'KeywordMetricCache unavailable (migration not applied?) — running uncached.',
      );
    }
  }

  async get<T>(
    provider: string,
    metric: CacheMetric,
    country: string,
    language: string,
    keyword: string,
  ): Promise<{ value: T; fetchedAt: string } | null> {
    try {
      const row =
        await this.prisma.keywordMetricCache.findUnique(
          {
            where: {
              cacheKey: this.key(
                provider,
                metric,
                country,
                language,
                keyword,
              ),
            },
          },
        );
      if (!row) return null;
      if (row.expiresAt.getTime() < Date.now()) {
        return null;
      }
      return {
        value: row.payload as T,
        fetchedAt: row.fetchedAt.toISOString(),
      };
    } catch {
      this.degraded();
      return null;
    }
  }

  /*
   * Read ignoring expiry — used to surface the previous
   * fetch timestamp when refresh=true overwrites a row.
   */
  async peek<T>(
    provider: string,
    metric: CacheMetric,
    country: string,
    language: string,
    keyword: string,
  ): Promise<{ value: T; fetchedAt: string } | null> {
    try {
      const row =
        await this.prisma.keywordMetricCache.findUnique(
          {
            where: {
              cacheKey: this.key(
                provider,
                metric,
                country,
                language,
                keyword,
              ),
            },
          },
        );
      if (!row) return null;
      return {
        value: row.payload as T,
        fetchedAt: row.fetchedAt.toISOString(),
      };
    } catch {
      this.degraded();
      return null;
    }
  }

  async set(
    provider: string,
    metric: CacheMetric,
    country: string,
    language: string,
    keyword: string,
    payload: unknown,
  ): Promise<void> {
    try {
      const now = Date.now();
      await this.prisma.keywordMetricCache.upsert(
        {
          where: {
            cacheKey: this.key(
              provider,
              metric,
              country,
              language,
              keyword,
            ),
          },
          create: {
            cacheKey: this.key(
              provider,
              metric,
              country,
              language,
              keyword,
            ),
            provider,
            metric,
            country,
            language,
            keyword: keyword
              .toLowerCase()
              .trim()
              .slice(0, 300),
            payload: payload as any,
            expiresAt: new Date(
              now + TTL_MS[metric],
            ),
          },
          update: {
            payload: payload as any,
            fetchedAt: new Date(now),
            expiresAt: new Date(
              now + TTL_MS[metric],
            ),
          },
        },
      );
    } catch {
      this.degraded();
    }
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { GoogleService } from '../google/google.service';
import {
  CAPABILITY_MATRIX,
  MAX_IMPORT_ROWS,
  SEPARATE_CONCEPTS,
  backfillWindow,
  normalizeOfficialObservation,
  validateImportRows,
  type NormalizedOfficialObservation,
} from './ai-official-data';

/*
 * =========================================================
 * OFFICIAL GOOGLE/BING DATA 1.0 (Phase 8C).
 *
 * Only what official interfaces genuinely expose:
 * - Google Search Analytics API → VERIFIED organic
 *   demand snapshots (window aggregates, never
 *   AI-isolated, never relabeled).
 * - User-exported UI rows (Google GenAI report, Bing
 *   AI Performance CSVs) → OBSERVED manual imports.
 * - Everything else → UNAVAILABLE markers, never
 *   zeros, never scraped, never invented.
 *
 * Append-only AiOfficialObservation ledger with
 * identity-key dedupe. Billing: official ingestion
 * touches no AI_SCANS/AI_CREDITS counters — GSC and
 * manual imports are free operations, stated
 * explicitly per response.
 * =========================================================
 */

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

@Injectable()
export class AiOfficialDataService {
  constructor(
    private readonly prisma: PrismaService,
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

  getCapabilities() {
    return {
      matrix: CAPABILITY_MATRIX,
      concepts: [...SEPARATE_CONCEPTS],
      legend: {
        AVAILABLE:
          'Official API verified from provider documentation.',
        PARTIAL:
          'Blended or sampled — usable with stated limits.',
        UI_ONLY:
          'Interface/export only; no official API. Manual import at most.',
        NOT_AVAILABLE:
          'No official interface. Shown as UNAVAILABLE, never zero.',
        UNKNOWN:
          'Unverified. Treated as unavailable until confirmed.',
      },
      sources: [
        'Google Search Central: Generative AI performance reports (June 2026); Search Console Help: Generative AI performance report.',
        'Bing Webmaster Blog: AI Performance public preview (Feb 2026); Intents/Topics/Citation Share/Compare (June 2026).',
        'Microsoft Q&A + Search Engine Roundtable: AI Performance API on backlog, no timeline.',
      ],
    };
  }

  /*
   * Google demand sync (VERIFIED). Bounded 30/90-day
   * windows via the existing OAuth + retry path. Each
   * sync stores ONE window snapshot per query/page
   * stamped at the window end date — aggregates are
   * never presented as daily AI observations.
   */
  async syncGoogleDemand(
    organizationId: string,
    websiteId: string,
    days: 30 | 90 = 30,
  ) {
    const website = await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    void website;
    const window = backfillWindow(days);
    const [queries, pages] = await Promise.all([
      this.googleService.getSearchQueries(
        organizationId,
        window.startDate,
        window.endDate,
      ),
      this.googleService.getSearchPages(
        organizationId,
        window.startDate,
        window.endDate,
      ),
    ]);
    const candidates: NormalizedOfficialObservation[] =
      [];
    for (const row of (queries as { rows?: unknown[] })
      .rows ?? []) {
      const record = row as Record<string, unknown>;
      const normalized = normalizeOfficialObservation({
        provider: 'GOOGLE',
        method: 'SEARCH_ANALYTICS_API',
        kind: 'ORGANIC_DEMAND',
        date: window.endDate,
        query: String(record.query ?? ''),
        pageUrl: null,
        impressions: record.impressions,
        clicks: record.clicks,
      });
      if (normalized) candidates.push(normalized);
    }
    for (const row of (pages as { rows?: unknown[] })
      .rows ?? []) {
      const record = row as Record<string, unknown>;
      const normalized = normalizeOfficialObservation({
        provider: 'GOOGLE',
        method: 'SEARCH_ANALYTICS_API',
        kind: 'ORGANIC_DEMAND',
        date: window.endDate,
        query: null,
        pageUrl: String(
          record.page ?? record.pageUrl ?? '',
        ),
        impressions: record.impressions,
        clicks: record.clicks,
      });
      if (normalized) candidates.push(normalized);
    }
    const stored = await this.storeBatch(
      organizationId,
      websiteId,
      candidates.slice(0, 2000),
    );
    return {
      provider: 'GOOGLE',
      method: 'SEARCH_ANALYTICS_API',
      evidenceState: 'VERIFIED',
      window,
      semantics:
        'Organic Web totals (clicks/impressions include AI-blended traffic). NOT AI-isolated — never labeled as AI Overview, AI Mode or citation data.',
      billing: {
        charged: false,
        note: 'Search Console API pulls are free; no AI_SCANS or AI_CREDITS consumed.',
      },
      ...stored,
    };
  }

  /*
   * Manual import (OBSERVED). Accepts user-exported
   * rows from UI-only reports, bounded at 500 rows.
   * Stored exactly as MANUAL_EXPORT — never upgraded
   * to VERIFIED.
   */
  async importRows(
    organizationId: string,
    websiteId: string,
    provider: string,
    rows: unknown,
  ) {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    const { valid, rejected } = validateImportRows(
      provider,
      rows,
    );
    if (valid.length === 0) {
      throw new BadRequestException(
        `No valid rows (rejected ${rejected}). Each row needs a date plus a page/URL or grounding query.`,
      );
    }
    const candidates = valid
      .map((row) =>
        normalizeOfficialObservation({
          ...row,
          provider:
            String(provider).toUpperCase() === 'BING'
              ? 'BING'
              : 'GOOGLE',
          method: 'MANUAL_EXPORT',
        }),
      )
      .filter(
        (
          row,
        ): row is NormalizedOfficialObservation =>
          row !== null,
      );
    const stored = await this.storeBatch(
      organizationId,
      websiteId,
      candidates,
    );
    return {
      provider: String(provider).toUpperCase(),
      method: 'MANUAL_EXPORT',
      evidenceState: 'OBSERVED',
      semantics:
        'User-exported UI rows. Shown as official-export observations, never as API-verified data.',
      billing: {
        charged: false,
        note: 'Manual imports are free; no AI_SCANS or AI_CREDITS consumed.',
      },
      received: Array.isArray(rows)
        ? (rows as unknown[]).length
        : 0,
      rejected,
      maxRows: MAX_IMPORT_ROWS,
      ...stored,
    };
  }

  private async storeBatch(
    organizationId: string,
    websiteId: string,
    candidates: NormalizedOfficialObservation[],
  ): Promise<{
    candidates: number;
    stored: number;
    skipped: number;
    baseline: boolean;
  }> {
    const keys = candidates.map(
      (candidate) => candidate.identityKey,
    );
    const existing =
      await this.prisma.aiOfficialObservation.findMany({
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
    if (fresh.length > 0) {
      await this.prisma.aiOfficialObservation.createMany(
        {
          data: fresh.map((candidate) => ({
            organizationId,
            websiteId,
            provider: candidate.provider,
            method: candidate.method,
            kind: candidate.kind,
            concept: candidate.concept,
            date: toDate(candidate.date),
            query: candidate.query,
            pageUrl: candidate.pageUrl,
            country: candidate.country,
            device: candidate.device,
            impressions: candidate.impressions,
            clicks: candidate.clicks,
            citations: candidate.citations,
            groundingQuery: candidate.groundingQuery,
            evidenceState: candidate.evidenceState,
            identityKey: candidate.identityKey,
          })),
          skipDuplicates: true,
        },
      );
    }
    const total =
      await this.prisma.aiOfficialObservation.count({
        where: { organizationId, websiteId },
      });
    return {
      candidates: candidates.length,
      stored: fresh.length,
      skipped: candidates.length - fresh.length,
      baseline: total === fresh.length,
    };
  }

  async getHistory(
    organizationId: string,
    websiteId: string,
    input: {
      provider?: string;
      kind?: string;
      days?: number;
      page?: number;
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
    const size = Math.min(
      100,
      Math.max(1, Math.floor(input.pageSize ?? 20) || 20),
    );
    const page = Math.max(
      1,
      Math.floor(input.page ?? 1) || 1,
    );
    const where: Record<string, unknown> = {
      organizationId,
      websiteId,
      date: { gte: since },
    };
    if (input.provider) {
      where.provider = clean(input.provider).toUpperCase();
    }
    if (input.kind) {
      where.kind = clean(input.kind).toUpperCase();
    }
    const [total, rows] = await Promise.all([
      this.prisma.aiOfficialObservation.count({ where }),
      this.prisma.aiOfficialObservation.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
    ]);
    const allTime =
      await this.prisma.aiOfficialObservation.count({
        where: { organizationId, websiteId },
      });
    return {
      rows,
      total,
      page,
      pageSize: size,
      totalPages: Math.max(1, Math.ceil(total / size)),
      baseline:
        allTime > 0 && total === allTime
          ? 'Baseline established from first ingestion. Re-ingest to measure movement — never extrapolated.'
          : null,
      trust: {
        VERIFIED:
          'Search Analytics API pulls only.',
        OBSERVED:
          'User-exported UI rows (MANUAL_EXPORT).',
        note: 'Official rows never overwrite third-party AI observations; concepts stay separate.',
      },
    };
  }

  /*
   * Command-center summary: VERIFIED demand leaders +
   * imported AI visibility, per separate concept.
   * AI citation ingestion that lacks an API reports
   * UNAVAILABLE explicitly.
   */
  async getSummary(
    organizationId: string,
    websiteId: string,
  ) {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    const [demand, aiRows] = await Promise.all([
      this.prisma.aiOfficialObservation.findMany({
        where: {
          organizationId,
          websiteId,
          kind: 'ORGANIC_DEMAND',
        },
        orderBy: { impressions: 'desc' },
        take: 10,
      }),
      this.prisma.aiOfficialObservation.findMany({
        where: {
          organizationId,
          websiteId,
          kind: { in: ['AI_IMPRESSION', 'AI_CITATION'] },
        },
        orderBy: { date: 'desc' },
        take: 200,
      }),
    ]);
    const aiCitations = aiRows
      .filter((row) => (row.citations ?? 0) > 0)
      .slice(0, 10);
    const aiImpressions = aiRows.reduce(
      (sum, row) => sum + (row.impressions ?? 0),
      0,
    );
    return {
      demand: {
        source: 'Google Search Console',
        method: 'SEARCH_ANALYTICS_API',
        evidenceState: 'VERIFIED',
        semantics:
          'Organic Web totals. Includes AI-blended traffic; not AI-isolated.',
        topQueries: demand
          .filter((row) => row.query)
          .slice(0, 5),
        topPages: demand
          .filter((row) => !row.query && row.pageUrl)
          .slice(0, 5),
      },
      aiVisibility: {
        citations: aiCitations,
        totalImportedImpressions: aiImpressions,
        importCount: aiRows.length,
        evidenceState:
          aiRows.length > 0 ? 'OBSERVED' : 'UNAVAILABLE',
        note:
          aiRows.length > 0
            ? 'User-exported UI rows (Google GenAI / Bing AI Performance). Not API-verified.'
            : 'No official AI rows imported. Google/Bing expose no AI citation API.',
      },
      unavailable: [
        {
          key: 'google-ai-citations-api',
          reason:
            'Google exposes no API for AI Overview/Mode citations (UI report only, no clicks, no queries).',
          evidenceState: 'UNAVAILABLE',
        },
        {
          key: 'bing-ai-performance-api',
          reason:
            'Bing AI Performance is UI + CSV export only; Microsoft confirms API is backlog with no timeline.',
          evidenceState: 'UNAVAILABLE',
        },
      ],
    };
  }
}

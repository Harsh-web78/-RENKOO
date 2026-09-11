import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { BacklinksService } from './backlinks.service';
import {
  IMPORT_LIMITS,
  attributeNote,
  authorityMeasurementNote,
  classifyAuthoritySource,
  classifyOpportunityType,
  competitorGapStatement,
  constraintDiagnosis,
  dedupeImportRows,
  intersectState,
  linkAttributeOf,
  normalizeAuthorityDomain,
  parseBacklinkCsv,
  targetLinkNote,
  CANNOT_MEASURE,
  type IntersectCandidate,
} from './authority-intelligence';

/*
 * =========================================================
 * AUTHORITY INTELLIGENCE 1.0 (Phase 18) — read-only
 * composition over existing backlink evidence + bounded
 * CSV import foundation. No backlink index, no DR/DA,
 * no authority/toxicity scores, no provider calls, no
 * new persistence models, no new billing meters.
 *
 * Bounds: link rows ≤200, domains ≤100, pages ≤100,
 * competitors ≤5, opportunities ≤50, import ≤5000 rows /
 * 10 MB. One bounded Promise.all wave per read; maps
 * and sets only — no N+1.
 * =========================================================
 */

const MAX_LINK_ROWS = 200;
const MAX_DOMAINS = 100;
const MAX_PAGES = 100;
const MAX_OPPORTUNITIES = 50;

function clean(value: unknown): string {
  return String(value ?? '').trim();
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

@Injectable()
export class AuthorityIntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly backlinks: BacklinksService,
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
    if (!row) throw new NotFoundException('Website not found');
    return row;
  }

  /* ---------- CSV import: preview (no writes) ---------- */

  async previewCsvImport(
    organizationId: string,
    websiteId: string,
    csv: unknown,
  ) {
    /* Tenant-scoped even for preview (no writes). */
    await this.website(organizationId, websiteId);
    const text = String(csv ?? '');
    if (
      Buffer.byteLength(text, 'utf8') > IMPORT_LIMITS.maxBytes
    ) {
      throw new PayloadTooLargeException(
        'CSV exceeds the 10 MB import limit.',
      );
    }
    const parsed = parseBacklinkCsv(text);
    const { unique, duplicates } = dedupeImportRows(
      parsed.rows,
    );
    return {
      source: 'MANUAL_IMPORT',
      evidenceState: 'OBSERVED',
      received: parsed.received,
      parsed: parsed.rows.length,
      valid: unique.length,
      invalid: parsed.invalid.length,
      duplicates,
      truncated: parsed.truncated,
      limits: {
        maxRows: IMPORT_LIMITS.maxRows,
        maxBytes: IMPORT_LIMITS.maxBytes,
      },
      issues: parsed.invalid.slice(0, 50),
      sample: unique.slice(0, 10).map((row) => ({
        sourceUrl: row.sourceUrl,
        sourceDomain: row.sourceDomain,
        targetUrl: row.targetUrl,
        anchorText: row.anchorText,
        status: row.status,
        competitor: row.competitor,
      })),
      note: 'Based on imported backlink data. The imported set is never assumed complete.',
    };
  }

  /* ---------- CSV import: confirm (bounded writes) ---------- */

  async confirmCsvImport(
    organizationId: string,
    websiteId: string,
    csv: unknown,
  ) {
    await this.website(organizationId, websiteId);
    const text = String(csv ?? '');
    if (
      Buffer.byteLength(text, 'utf8') > IMPORT_LIMITS.maxBytes
    ) {
      throw new PayloadTooLargeException(
        'CSV exceeds the 10 MB import limit.',
      );
    }
    const parsed = parseBacklinkCsv(text);
    const { unique, duplicates } = dedupeImportRows(
      parsed.rows,
    );

    const competitors =
      await this.prisma.competitor.findMany({
        where: { organizationId, websiteId, isActive: true },
        select: { id: true, name: true, domain: true, url: true },
        take: 5,
      });
    const competitorByDomain = new Map<string, string>();
    for (const competitor of competitors) {
      const domain =
        normalizeAuthorityDomain(competitor.domain) ??
        normalizeAuthorityDomain(competitor.url);
      if (domain)
        competitorByDomain.set(domain, competitor.id);
    }

    const ownRows = unique.filter(
      (row) =>
        !row.competitor ||
        !competitorByDomain.has(
          normalizeAuthorityDomain(row.competitor) ?? '',
        ),
    );
    const competitorRows = unique.filter(
      (row) =>
        row.competitor &&
        competitorByDomain.has(
          normalizeAuthorityDomain(row.competitor) ?? '',
        ),
    );

    /* Own rows reuse the existing JSON import rail
     * (upsert by sourceUrl + targetUrl). */
    let imported = 0;
    let updated = 0;
    if (ownRows.length > 0) {
      const result = await this.backlinks.importBacklinks(
        organizationId,
        websiteId,
        {
          source: 'MANUAL_IMPORT',
          backlinks: ownRows.map((row) => ({
            sourceUrl: row.sourceUrl,
            sourceDomain: row.sourceDomain,
            targetUrl: row.targetUrl,
            anchorText: row.anchorText ?? undefined,
            linkType: row.linkType,
            status: row.status,
            source: 'MANUAL_IMPORT',
          })),
        } as unknown as Parameters<
          typeof this.backlinks.importBacklinks
        >[2],
      );
      imported = Number(result?.imported ?? 0);
      updated = Number(
        (result as Record<string, unknown>)?.updated ?? 0,
      );
    }

    /* Competitor rows become competitor-linked
     * opportunities (existing rail) — never fake
     * backlink observations for the target. */
    let opportunities = 0;
    let skipped = 0;
    for (const row of competitorRows) {
      const competitorId = competitorByDomain.get(
        normalizeAuthorityDomain(row.competitor) ?? '',
      );
      if (!competitorId) {
        skipped++;
        continue;
      }
      const existing =
        await this.prisma.backlinkOpportunity.findFirst({
          where: {
            websiteId,
            sourceDomain: row.sourceDomain,
            competitorId,
            status: { in: ['OPEN', 'IN_PROGRESS'] },
          },
          select: { id: true },
        });
      if (existing) {
        skipped++;
        continue;
      }
      await this.backlinks.createOpportunity(
        organizationId,
        websiteId,
        {
          opportunityType: 'COMPETITOR_GAP',
          competitorId,
          targetUrl: row.targetUrl,
          anchorSuggestion: row.anchorText,
          reason: `Observed linking to competitor (${clean(row.competitor)}) from ${row.sourceUrl}. ${targetLinkNote()}`,
          suggestedAction:
            'Review manually. Pursue only where genuinely relevant.',
        } as unknown as Parameters<
          typeof this.backlinks.createOpportunity
        >[2],
      );
      opportunities++;
    }

    return {
      websiteId,
      source: 'MANUAL_IMPORT',
      evidenceState: 'OBSERVED',
      received: parsed.received,
      imported,
      updated,
      opportunities,
      duplicates,
      invalid: parsed.invalid.length,
      skipped,
      truncated: parsed.truncated,
      issues: parsed.invalid.slice(0, 50),
      note: 'Based on imported backlink data. Never VERIFIED, never complete.',
      billing: { charged: false },
    };
  }

  /* ---------- authority overview (composition) ---------- */

  async getAuthorityOverview(
    organizationId: string,
    websiteId: string,
  ) {
    await this.website(organizationId, websiteId);
    const [
      overviewRes,
      domainsRes,
      competitorsRes,
      ranksRes,
      checksRes,
      linksRes,
    ] = await Promise.all([
      this.settled(() =>
        this.backlinks.getOverview(organizationId, websiteId),
      ),
      this.settled(() =>
        this.backlinks.getDomains(organizationId, websiteId),
      ),
      this.settled(() =>
        this.prisma.competitor.findMany({
          where: { organizationId, websiteId, isActive: true },
          select: { id: true, name: true, domain: true, url: true },
          take: 5,
        }),
      ),
      this.settled(() =>
        this.prisma.rankObservation.findMany({
          where: { organizationId, websiteId },
          orderBy: { observedAt: 'desc' },
          take: MAX_LINK_ROWS,
        }),
      ),
      this.settled(() =>
        this.prisma.aiVisibilityCheck.findMany({
          where: { websiteId, status: 'COMPLETED' },
          orderBy: { checkedAt: 'desc' },
          take: MAX_LINK_ROWS,
        }),
      ),
      this.settled(() =>
        this.prisma.backlink.findMany({
          where: { websiteId },
          orderBy: { lastSeenAt: 'desc' },
          take: MAX_LINK_ROWS,
        }),
      ),
    ]);

    const links = (linksRes ?? []) as Array<
      Record<string, unknown>
    >;
    const hasManualRows = links.length > 0;
    /* GSC Links: no integration exists — honestly
     * unavailable, never pretended. */
    const source = classifyAuthoritySource({
      hasGscLinks: false,
      hasManualRows,
      hasProvider: false,
    });

    const domains = new Set(
      links
        .map((row) =>
          normalizeAuthorityDomain(row.sourceDomain),
        )
        .filter(Boolean),
    );
    const newLinks = links.filter(
      (row) =>
        clean(row.status).toUpperCase() !== 'LOST',
    ).length;
    const lostLinks = links.filter(
      (row) => clean(row.status).toUpperCase() === 'LOST',
    ).length;

    const attributeDist: Record<string, number> = {};
    for (const row of links) {
      const attribute = linkAttributeOf({
        linkType: row.linkType,
      });
      attributeDist[attribute] =
        (attributeDist[attribute] ?? 0) + 1;
    }

    const competitors = (competitorsRes ?? []) as Array<
      Record<string, unknown>
    >;
    const ranks = (ranksRes ?? []) as Array<
      Record<string, unknown>
    >;
    const striking = ranks.filter((row) => {
      const position = Number(row.position);
      return (
        Number.isFinite(position) &&
        position >= 4 &&
        position <= 20
      );
    }).length;
    const cited = (checksRes ?? []).filter(
      (row) =>
        (row as Record<string, unknown>).citationFound ===
        true,
    ).length;

    const diagnosis = constraintDiagnosis({
      hasEvidence: hasManualRows,
      observedLinks: links.length,
      observedDomains: domains.size,
      hasRankingOpportunity: striking > 0,
      competitorGapObserved:
        competitors.length > 0 && hasManualRows,
    });

    return {
      websiteId,
      source,
      coverage: {
        note: hasManualRows
          ? 'Analysis reflects imported data only.'
          : 'Backlink intelligence requires a backlink data source.',
        gscLinks: 'UNAVAILABLE — no GSC Links integration exists.',
        provider: 'UNAVAILABLE — no external backlink provider is connected.',
      },
      totals: {
        observedLinks: links.length,
        observedDomains: domains.size,
        newEvidence: newLinks,
        lostEvidence: lostLinks,
        attributeDistribution: attributeDist,
        attributeNote:
          'Link attribute observed. Attributes describe crawl hints, not value.',
        evidenceState: hasManualRows
          ? 'OBSERVED'
          : 'UNAVAILABLE',
      },
      overview: overviewRes,
      domains: (domainsRes as unknown[] | null)?.slice(
        0,
        MAX_DOMAINS,
      ) ?? null,
      searchContext: {
        rankObservations: ranks.length,
        strikingDistance: striking,
        aiCitations: cited,
        evidenceState:
          ranks.length > 0 ? 'OBSERVED' : 'UNAVAILABLE',
        note: 'Authority evidence is stated alongside search visibility — never as its cause.',
      },
      diagnosis: {
        state: diagnosis,
        evidenceState: hasManualRows
          ? 'OBSERVED'
          : 'UNAVAILABLE',
      },
      competitors: competitors.map((row) => ({
        name: clean(row.name),
        domain: clean(row.domain),
      })),
      cannotMeasure: CANNOT_MEASURE,
      measurement: authorityMeasurementNote(),
      billing: {
        charged: false,
        note: 'Read-only composition over stored evidence. No AI credits, scans, or provider meters consumed.',
      },
    };
  }

  /* ---------- link opportunities (existing rail) ---------- */

  async getLinkOpportunities(
    organizationId: string,
    websiteId: string,
    limit = 20,
  ) {
    await this.website(organizationId, websiteId);
    const opportunities =
      await this.prisma.backlinkOpportunity.findMany({
        where: {
          websiteId,
          status: { notIn: ['DISMISSED', 'COMPLETED'] },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.max(1, Math.min(MAX_OPPORTUNITIES, limit)),
      });
    return {
      websiteId,
      total: opportunities.length,
      opportunities: opportunities.map((opp) => ({
        id: opp.id,
        sourceDomain: opp.sourceDomain,
        competitorId: opp.competitorId,
        targetUrl: opp.targetUrl,
        anchorSuggestion: opp.anchorSuggestion,
        opportunityType: opp.opportunityType,
        priority: opp.priority,
        status: opp.status,
        reason: opp.reason,
        suggestedAction: opp.suggestedAction,
        evidenceState: 'OBSERVED',
        measurement: authorityMeasurementNote(),
      })),
      evidenceState:
        opportunities.length > 0 ? 'OBSERVED' : 'UNAVAILABLE',
      cannotMeasure: CANNOT_MEASURE,
      billing: { charged: false },
    };
  }

  /* ---------- competitor intersect ---------- */

  async getCompetitorIntersect(
    organizationId: string,
    websiteId: string,
    limit = 50,
  ) {
    await this.website(organizationId, websiteId);
    const [gapRes, linksRes] = await Promise.all([
      this.settled(() =>
        this.backlinks.getCompetitorGap(
          organizationId,
          websiteId,
        ),
      ),
      this.settled(() =>
        this.prisma.backlink.findMany({
          where: { websiteId },
          select: { sourceDomain: true, targetUrl: true },
          take: MAX_LINK_ROWS,
        }),
      ),
    ]);

    const manual = (
      ((gapRes as Record<string, unknown> | null)
        ?.manualOpportunities as unknown[]) ??
      []
    ) as Array<Record<string, unknown>>;
    const ownDomains = new Set(
      ((linksRes ?? []) as Array<Record<string, unknown>>)
        .map((row) =>
          normalizeAuthorityDomain(row.sourceDomain),
        )
        .filter(Boolean) as string[],
    );

    const byDomain = new Map<string, IntersectCandidate>();
    for (const opp of manual) {
      const domain = normalizeAuthorityDomain(
        opp.sourceDomain,
      );
      if (!domain) continue;
      const candidate = byDomain.get(domain) ?? {
        referringDomain: domain,
        competitorsLinked: [],
        targetLinked: ownDomains.has(domain),
        sourcePages: [],
      };
      const competitor = clean(opp.competitorId);
      if (
        competitor &&
        !candidate.competitorsLinked.includes(competitor)
      )
        candidate.competitorsLinked.push(competitor);
      byDomain.set(domain, candidate);
    }

    const bounded = [...byDomain.values()]
      .sort(
        (a, b) =>
          b.competitorsLinked.length -
            a.competitorsLinked.length ||
          a.referringDomain.localeCompare(b.referringDomain),
      )
      .slice(0, Math.max(1, Math.min(100, limit)));

    return {
      websiteId,
      providerStatus: 'NOT_AVAILABLE',
      total: bounded.length,
      domains: bounded.map((candidate) => ({
        ...candidate,
        state: intersectState(candidate),
        targetNote: candidate.targetLinked
          ? 'Target link observed in available evidence.'
          : targetLinkNote(),
        evidenceState: 'OBSERVED',
      })),
      coverageNote:
        'Gaps are computed over imported evidence only. Competitor backlink completeness is unavailable.',
      evidenceState:
        bounded.length > 0 ? 'OBSERVED' : 'UNAVAILABLE',
      cannotMeasure: CANNOT_MEASURE,
      billing: { charged: false },
    };
  }

  /* ---------- page-level authority ---------- */

  async getAuthorityPages(
    organizationId: string,
    websiteId: string,
    limit = 50,
  ) {
    await this.website(organizationId, websiteId);
    const [linksRes, ranksRes, strategyRes] =
      await Promise.all([
        this.settled(() =>
          this.prisma.backlink.findMany({
            where: { websiteId },
            select: {
              targetUrl: true,
              sourceDomain: true,
              status: true,
              lastSeenAt: true,
              anchorText: true,
              linkType: true,
            },
            take: MAX_LINK_ROWS,
          }),
        ),
        this.settled(() =>
          this.prisma.rankObservation.findMany({
            where: { organizationId, websiteId },
            orderBy: { observedAt: 'desc' },
            take: MAX_LINK_ROWS,
          }),
        ),
        this.settled(() =>
          this.prisma.contentStrategyLink.findMany({
            where: { organizationId, websiteId },
            select: {
              keyword: true,
              targetPage: true,
              priority: true,
              intent: true,
            },
            take: MAX_LINK_ROWS,
          }),
        ),
      ]);

    const byPage = new Map<
      string,
      {
        url: string;
        links: number;
        domains: Set<string>;
        lastSeen: string | null;
      }
    >();
    for (const row of (linksRes ??
      []) as Array<Record<string, unknown>>) {
      const key = normPage(row.targetUrl);
      if (!key) continue;
      const entry = byPage.get(key) ?? {
        url: clean(row.targetUrl),
        links: 0,
        domains: new Set<string>(),
        lastSeen: null,
      };
      entry.links++;
      const domain = normalizeAuthorityDomain(
        row.sourceDomain,
      );
      if (domain) entry.domains.add(domain);
      byPage.set(key, entry);
    }

    const rankByPage = new Map<string, number>();
    for (const row of (ranksRes ??
      []) as Array<Record<string, unknown>>) {
      const key = normPage(row.url);
      if (!key || rankByPage.has(key)) continue;
      const position = Number(row.position);
      if (Number.isFinite(position))
        rankByPage.set(key, position);
    }

    const strategyByPage = new Map<
      string,
      { priority: string; intent: string }
    >();
    for (const row of (strategyRes ??
      []) as Array<Record<string, unknown>>) {
      const key = normPage(row.targetPage);
      if (!key || strategyByPage.has(key)) continue;
      strategyByPage.set(key, {
        priority: clean(row.priority),
        intent: clean(row.intent),
      });
    }

    const pages = [...byPage.entries()]
      .map(([key, entry]) => {
        const position = rankByPage.get(key) ?? null;
        const strategy = strategyByPage.get(key) ?? null;
        const hasOpportunity =
          position !== null &&
          position >= 4 &&
          position <= 20;
        return {
          url: entry.url,
          observedLinks: entry.links,
          observedDomains: entry.domains.size,
          lastSeen: entry.lastSeen,
          position,
          priority: strategy?.priority ?? null,
          intent: strategy?.intent ?? null,
          state:
            entry.links === 0
              ? 'PAGE_LINK_COVERAGE_GAP'
              : hasOpportunity
                ? 'PAGE_LINK_COVERAGE_GAP'
                : 'BACKLINK_OBSERVED',
          stateEvidence: 'OBSERVED' as const,
          note: hasOpportunity
            ? 'Ranking opportunity observed with limited link evidence. Stated alongside — never as cause.'
            : 'Observed link evidence for this page.',
        };
      })
      .sort((a, b) => {
        const gap =
          (a.state === 'PAGE_LINK_COVERAGE_GAP' ? 0 : 1) -
          (b.state === 'PAGE_LINK_COVERAGE_GAP' ? 0 : 1);
        if (gap !== 0) return gap;
        return b.observedLinks - a.observedLinks;
      })
      .slice(0, Math.max(1, Math.min(MAX_PAGES, limit)));

    return {
      websiteId,
      total: pages.length,
      pages: pages.map((page) => ({
        ...page,
        anchors: 'see backlink list endpoint',
        attributeNote: attributeNote('unknown'),
      })),
      evidenceState:
        pages.length > 0 ? 'OBSERVED' : 'UNAVAILABLE',
      cannotMeasure: CANNOT_MEASURE,
      billing: { charged: false },
    };
  }
}

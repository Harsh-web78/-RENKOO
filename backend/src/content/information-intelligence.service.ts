import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { EvidenceFusionService } from '../keywords/evidence-fusion.service';
import { CustomerDemandService } from '../keywords/customer-demand.service';
import {
  CANNOT_MEASURE,
  brandAlignmentOf,
  claimState,
  coverageOf,
  entityConsistencyOf,
  extractPageClaims,
  freshnessOf,
  ghostState,
  mapTrustGapToPageDecision,
  meaningfulConflict,
  type ClaimState,
  type ExtractedClaim,
  type GhostState,
  type TrustGap,
} from './information-intelligence';

/*
 * =========================================================
 * INFORMATION INTELLIGENCE 1.0 (Phase 25) — read-only
 * composition over crawl evidence, BusinessBrain, AI
 * observations, demand coverage and corroborating
 * sources. Deterministic extraction only: no LLM on
 * reads, no knowledge graph, no truth engine, no
 * scores. Composition-only: no new tables.
 *
 * Bounds: pages ≤200, claims ≤500, entities ≤100,
 * citations/AI rows ≤200, competitors ≤5, needs ≤50,
 * conflicts ≤100. One bounded wave, maps only.
 * =========================================================
 */

const MAX_PAGES = 200;
const MAX_CLAIMS = 500;

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
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function jsonLdNames(value: unknown): string[] {
  const entries = Array.isArray(value) ? value : [];
  const names: string[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const record = node as Record<string, unknown>;
    const name = clean(record.name);
    if (name && names.length < 10) names.push(name);
    for (const child of Object.values(record)) visit(child);
  };
  try {
    visit(entries);
  } catch {
    /* Unparseable stays absent. */
  }
  return names;
}

@Injectable()
export class InformationIntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
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

  private async base(
    organizationId: string,
    websiteId: string,
  ) {
    await this.website(organizationId, websiteId);
    const [brainRes, crawlRes, checksRes, strategyRes,
      competitorsRes, leadsRes, revenueRes, linksRes,
      demandRes, nbaRes,
    ] = await Promise.all([
      this.settled(() =>
        this.prisma.businessBrain.findUnique({
          where: { websiteId },
        }),
      ),
      this.settled(async () => {
        const crawls = await this.prisma.crawl.findMany({
          where: { websiteId, status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
          take: 2,
        });
        if (crawls.length === 0) return null;
        const pages = await this.prisma.crawlPage.findMany({
          where: { crawlId: crawls[0].id },
          select: {
            url: true,
            finalUrl: true,
            title: true,
            metaDescription: true,
            h1: true,
            h2: true,
            jsonLd: true,
            structuredDataCount: true,
            wordCount: true,
            statusCode: true,
          },
          take: MAX_PAGES,
        });
        let previous: Array<{ url: unknown }> = [];
        if (crawls.length > 1) {
          previous =
            await this.prisma.crawlPage.findMany({
              where: { crawlId: crawls[1].id },
              select: { url: true },
              take: MAX_PAGES,
            });
        }
        return {
          crawl: crawls[0],
          pages,
          previousUrls: new Set(
            previous
              .map((row) => normPage(row.url))
              .filter(Boolean) as string[],
          ),
        };
      }),
      this.settled(() =>
        this.prisma.aiVisibilityCheck.findMany({
          where: { websiteId, status: 'COMPLETED' },
          orderBy: { checkedAt: 'desc' },
          take: 200,
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
          take: 200,
        }),
      ),
      this.settled(() =>
        this.prisma.competitor.findMany({
          where: { organizationId, websiteId, isActive: true },
          take: 5,
        }),
      ),
      this.settled(() =>
        this.prisma.lead.findMany({
          where: { websiteId },
          orderBy: { createdAt: 'desc' },
          take: 200,
        }),
      ),
      this.settled(() =>
        this.prisma.revenue.findMany({
          where: { websiteId, status: 'RECOGNIZED' },
          orderBy: { recognizedAt: 'desc' },
          take: 200,
        }),
      ),
      this.settled(() =>
        this.prisma.backlink.findMany({
          where: { websiteId },
          select: { sourceDomain: true, targetUrl: true },
          take: 200,
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
        this.fusion.getNextBestAction(
          organizationId,
          websiteId,
        ),
      ),
    ]);
    return {
      brainRes, crawlRes, checksRes, strategyRes,
      competitorsRes, leadsRes, revenueRes, linksRes,
      demandRes, nbaRes,
    };
  }

  private compose(base: Awaited<ReturnType<typeof this.base>>, websiteId: string) {
    const {
      brainRes, crawlRes, checksRes, competitorsRes,
      leadsRes, revenueRes, linksRes, demandRes,
    } = base;
    const brain = (brainRes ?? null) as Record<
      string,
      unknown
    > | null;
    const pages = (
      (crawlRes as { pages?: Array<Record<string, unknown>> } | null)
        ?.pages ?? []
    ).slice(0, MAX_PAGES);
    const crawl = (crawlRes as { crawl?: { completedAt?: unknown } } | null)
      ?.crawl;
    const completedAt = crawl?.completedAt
      ? new Date(crawl.completedAt as string)
      : null;
    const crawlAgeDays =
      completedAt && !Number.isNaN(completedAt.getTime())
        ? Math.floor(
            (Date.now() - completedAt.getTime()) /
              (24 * 60 * 60 * 1000),
          )
        : null;
    const freshness = freshnessOf(crawlAgeDays);

    /* ---- claims ---- */
    const claims: Array<
      ExtractedClaim & {
        sources: string[];
        state: ClaimState;
        freshness: ReturnType<typeof freshnessOf>;
      }
    > = [];
    const byKey = new Map<string, number>();
    for (const page of pages) {
      const pageClaims = extractPageClaims({
        url: clean(page.url),
        title: clean(page.title) || null,
        metaDescription: clean(page.metaDescription) || null,
        h1: Array.isArray(page.h1)
          ? (page.h1 as unknown[]).map(clean)
          : [],
        h2: Array.isArray(page.h2)
          ? (page.h2 as unknown[]).map(clean)
          : [],
        jsonLdNames: jsonLdNames(page.jsonLd),
      });
      for (const claim of pageClaims.slice(
        0,
        Math.max(0, MAX_CLAIMS - claims.length),
      )) {
        const index = byKey.get(claim.key);
        if (index === undefined) {
          byKey.set(claim.key, claims.length);
          claims.push({
            ...claim,
            sources: [clean(page.url)],
            state: 'PARTIALLY_SUPPORTED',
            freshness,
          });
        } else {
          const existing = claims[index];
          if (!existing.sources.includes(clean(page.url)))
            existing.sources.push(clean(page.url));
        }
        if (claims.length >= MAX_CLAIMS) break;
      }
      if (claims.length >= MAX_CLAIMS) break;
    }
    /* Brain claims (identity/offering/location). */
    const brainName = clean(brain?.businessName);
    if (brainName)
      claims.push({
        key: `IDENTITY|${norm(brainName)}`,
        subject: 'business',
        predicate: 'named as',
        object: brainName,
        type: 'IDENTITY',
        provenance: 'BUSINESS_BRAIN',
        evidence: 'OBSERVED',
        sources: ['BusinessBrain'],
        state: 'PARTIALLY_SUPPORTED',
        freshness,
      });
    for (const entry of claims) {
      entry.state = claimState({
        sources: entry.sources.length,
        conflicts: 0,
        stale: freshness === 'STALE',
        hasEvidence: true,
      });
    }

    /* ---- conflicts (meaningful only) ---- */
    const conflicts: Array<{
      topic: string;
      sources: Array<{ page: string; value: string }>;
      evidenceState: 'OBSERVED';
    }> = [];
    const priceClaims = claims.filter(
      (claim) => claim.type === 'PRICE',
    );
    const seenValues = new Map<string, string[]>();
    for (const claim of priceClaims) {
      const list = seenValues.get(claim.object) ?? [];
      list.push(claim.sources[0]);
      seenValues.set(claim.object, list);
    }
    if (seenValues.size > 1) {
      conflicts.push({
        topic: 'Pricing',
        sources: [...seenValues.entries()]
          .slice(0, 10)
          .map(([value, sources]) => ({
            page: sources[0],
            value,
          })),
        evidenceState: 'OBSERVED',
      });
      for (const claim of priceClaims)
        claim.state = 'CONFLICTING';
    }

    /* ---- entities ---- */
    const siteNames = new Set<string>();
    for (const page of pages.slice(0, 50)) {
      const title = clean(page.title);
      if (title) siteNames.add(title.split(/[-|–]/)[0].trim());
      for (const name of jsonLdNames(page.jsonLd).slice(0, 3))
        siteNames.add(name);
    }
    const entityNames = [
      brainName || null,
      ...[...siteNames].slice(0, 5),
    ];
    const entityConsistency = entityConsistencyOf(entityNames);

    /* ---- AI citation connection ---- */
    const checks = (checksRes ?? []) as Array<
      Record<string, unknown>
    >;
    const citedPages = new Set(
      checks
        .filter((row) => row.citationFound === true)
        .map((row) => normPage(row.citationUrl))
        .filter(Boolean) as string[],
    );
    const mentioned = checks.filter(
      (row) => row.mentioned === true,
    ).length;
    const cited = checks.filter(
      (row) => row.citationFound === true,
    ).length;
    const ghost: Array<{
      page: string;
      state: GhostState;
    }> = [];
    for (const page of pages.slice(0, 50)) {
      const key = normPage(page.url);
      const pageCited =
        key !== null && citedPages.has(key);
      const pageMentioned = checks.some(
        (row) =>
          row.mentioned === true &&
          clean(row.query) &&
          norm(page.title).length > 0 &&
          norm(row.query).includes(
            norm(clean(page.title)).slice(0, 12),
          ),
      );
      if (pageCited || pageMentioned) {
        ghost.push({
          page: clean(page.url),
          state: ghostState({
            cited: pageCited,
            mentioned: pageMentioned,
          }),
        });
      }
    }

    /* ---- decision coverage ---- */
    const topNeeds = (
      ((demandRes as Record<string, unknown> | null)
        ?.topNeeds as unknown[]) ??
      []
    ).slice(0, 5) as Array<Record<string, unknown>>;
    const decisionCoverage = topNeeds.map((need) => ({
      need: clean(need.label),
      journey: clean(need.journey),
      criteria: Object.entries(
        (need.coverage ?? {}) as Record<
          string,
          { state: string; page: string | null }
        >,
      )
        .slice(0, 10)
        .map(([criterion, value]) => ({
          criterion,
          state: value.state,
          page: value.page,
          cited:
            checks.some(
              (row) =>
                row.citationFound === true &&
                normPage(row.citationUrl) ===
                  normPage(value.page),
            ) || null,
        })),
    }));

    /* ---- gaps + risks ---- */
    const gaps: TrustGap[] = [];
    if (conflicts.length > 0) gaps.push('CONFLICTING_CLAIM');
    if (freshness === 'STALE') gaps.push('STALE_CLAIM');
    if (claims.length === 0) gaps.push('MISSING_CLAIM');
    if (entityConsistency === 'CONFLICTING')
      gaps.push('AMBIGUOUS_ENTITY');
    if (
      decisionCoverage.some((need) =>
        (need.criteria as Array<{ state: string }>).some(
          (row) => row.state === 'MISSING',
        ),
      )
    )
      gaps.push('MISSING_DECISION_EVIDENCE');
    if (
      ghost.some(
        (row) => row.state === 'CITED_WITHOUT_BRAND_MENTION',
      )
    )
      gaps.push('CITED_NOT_MENTIONED');
    if ((linksRes ?? []).length === 0)
      gaps.push('THIRD_PARTY_MISMATCH');

    const risks = [
      ...conflicts.slice(0, 2).map((conflict) => ({
        title: `${conflict.topic} information conflicts across ${conflict.sources.length} sources`,
        evidence: conflict.sources,
        action: mapTrustGapToPageDecision('CONFLICTING_CLAIM'),
      })),
      ...(freshness === 'STALE'
        ? [
            {
              title:
                'Observed crawl evidence is stale; facts may be outdated',
              evidence: [],
              action:
                mapTrustGapToPageDecision('STALE_CLAIM'),
            },
          ]
        : []),
      ...decisionCoverage.slice(0, 2).map((need) => ({
        title: `Decision coverage incomplete for "${need.need}"`,
        evidence: [],
        action: mapTrustGapToPageDecision(
          'MISSING_DECISION_EVIDENCE',
        ),
      })),
    ].slice(0, 5);

    const competitors = (
      (competitorsRes ?? []) as Array<Record<string, unknown>>
    ).map((row) => ({
      name: clean(row.name),
      domain: clean(row.domain),
      note: 'Competitor observed in available evidence where present — never objectively better.',
    }));

    return {
      websiteId,
      summary: {
        claims: claims.length,
        conflicts: conflicts.length,
        entities: entityNames.filter(Boolean).length,
        evidenceState:
          claims.length > 0 ? 'OBSERVED' : 'UNAVAILABLE',
        note: 'Information clearly represented in available evidence; AI understanding itself is never claimed.',
      },
      claims: claims.slice(0, 100).map((claim) => ({
        ...claim,
        cited: claim.sources.some((source) =>
          citedPages.has(normPage(source) ?? ''),
        ),
      })),
      entities: {
        names: entityNames.filter(Boolean).slice(0, 10),
        consistency: entityConsistency,
        brandAlignment: brandAlignmentOf({
          siteSignals: siteNames.size,
          aiSignals: mentioned + cited,
          matching: cited,
        }),
        evidenceState:
          entityNames.filter(Boolean).length > 0
            ? 'OBSERVED'
            : 'UNAVAILABLE',
      },
      conflicts: conflicts.slice(0, 100),
      freshness: {
        state: freshness,
        crawlAgeDays:
          completedAt && !Number.isNaN(completedAt.getTime())
            ? Math.floor(
                (Date.now() - completedAt.getTime()) /
                  (24 * 60 * 60 * 1000),
              )
            : null,
        note: 'Observed crawl age bands; exact expiry is unavailable.',
      },
      provenance: {
        sources: [
          ...new Set(
            claims.map((claim) => claim.provenance),
          ),
        ],
        note: 'Every claim answers where it came from.',
      },
      ai: {
        mentioned,
        cited,
        ghost: ghost.slice(0, 50),
        evidenceState:
          checks.length > 0 ? 'OBSERVED' : 'UNAVAILABLE',
        note: 'Citation is an observation, not proof of correctness.',
      },
      decisionCoverage,
      competitors,
      gaps,
      risks,
      briefContext: {
        note: 'Claim gaps formatted for the existing brief evidence rail; no second brief engine.',
        claimGaps: gaps,
        decisionNeeds: decisionCoverage.slice(0, 3),
      },
      corroboration: {
        referringDomains: (
          (linksRes ?? []) as Array<Record<string, unknown>>
        ).length,
        evidenceState:
          (linksRes ?? []).length > 0
            ? 'OBSERVED'
            : 'UNAVAILABLE',
        note: 'Without connected evidence: EXTERNAL_CORROBORATION_UNAVAILABLE. Never "needs backlinks".',
      },
      business: {
        leads: (leadsRes ?? []).length,
        revenue: (revenueRes ?? []).length,
        evidenceState:
          (leadsRes ?? []).length > 0 ||
          (revenueRes ?? []).length > 0
            ? 'OBSERVED'
            : 'UNAVAILABLE',
      },
      nextBestAction: (
        base.nbaRes as Record<string, unknown> | null
      ) ?? {
        evidenceState: 'UNAVAILABLE',
        statement:
          'Next best action unavailable for this website right now.',
      },
      measurement: {
        note: 'Claim gaps connect to the existing action rail; before/after measurement uses Phase 23 where actions complete.',
      },
      limitations: CANNOT_MEASURE,
      evidence: {
        note: 'Claim states use available evidence only: SUPPORTED, PARTIAL, CONFLICTING, STALE, UNSUPPORTED, UNAVAILABLE. Never TRUE or FALSE.',
      },
      billing: {
        charged: false,
        note: 'Read-only composition over stored evidence. No AI credits, scans, or provider meters consumed.',
      },
    };
  }

  async getInformationIntelligence(
    organizationId: string,
    websiteId: string,
  ) {
    if (!websiteId)
      throw new BadRequestException(
        'websiteId is required',
      );
    const base = await this.base(
      organizationId,
      websiteId,
    );
    return this.compose(base, websiteId);
  }

  async getClaims(
    organizationId: string,
    websiteId: string,
    url: string,
  ) {
    if (!websiteId)
      throw new BadRequestException(
        'websiteId is required',
      );
    const full = await this.getInformationIntelligence(
      organizationId,
      websiteId,
    );
    const key = normPage(url);
    const matches = (
      full.claims as Array<{ sources: string[] }>
    ).filter((claim) =>
      claim.sources.some(
        (source) => normPage(source) === key,
      ),
    );
    return {
      websiteId,
      url: clean(url),
      total: matches.length,
      claims: matches,
      evidenceState:
        matches.length > 0 ? 'OBSERVED' : 'UNAVAILABLE',
      billing: { charged: false },
    };
  }

  async getConflicts(
    organizationId: string,
    websiteId: string,
  ) {
    if (!websiteId)
      throw new BadRequestException(
        'websiteId is required',
      );
    const full = await this.getInformationIntelligence(
      organizationId,
      websiteId,
    );
    return {
      websiteId,
      total: (
        full.conflicts as unknown[]
      ).length,
      conflicts: full.conflicts,
      evidenceState:
        (full.conflicts as unknown[]).length > 0
          ? 'OBSERVED'
          : 'UNAVAILABLE',
      note: 'Only meaningful semantic conflicts; wording differences are never flagged.',
      billing: { charged: false },
    };
  }

  async getEntity(
    organizationId: string,
    websiteId: string,
  ) {
    if (!websiteId)
      throw new BadRequestException(
        'websiteId is required',
      );
    const full = await this.getInformationIntelligence(
      organizationId,
      websiteId,
    );
    return {
      websiteId,
      ...(full.entities as Record<string, unknown>),
      billing: { charged: false },
    };
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { GoogleService } from '../google/google.service';
import {
  CANNOT_MEASURE,
  GBP_UNAVAILABLE_METRICS,
  GBP_UNAVAILABLE_NOTE,
  NAP_SCOPE_NOTE,
  detectLocalPattern,
  extractSchemaSignals,
  identityCompleteness,
  isLocationPageUrl,
  localHealthOf,
  localIntentContext,
  localRankLabel,
  locationPageQuality,
  mapLocalOpportunityToNba,
  napConsistency,
  schemaState,
  serviceAreaGap,
  type BusinessIdentity,
  type LocalOpportunityLabel,
} from './local-intelligence';

/*
 * =========================================================
 * LOCAL SEARCH INTELLIGENCE 1.0 (Phase 19) — read-only
 * composition over BusinessBrain, BusinessLocation,
 * LocalQuery/Citation rows, crawl JSON-LD, GSC queries,
 * rank observations, SERP cache, AI checks, outcomes.
 * No Local Score, no Maps ranks, no GBP metrics, no
 * reviews invented, no provider calls except the GSC
 * reads the existing GoogleService already performs.
 * No new persistence, no new billing meters.
 *
 * Bounds: locations ≤50, queries ≤200, pages ≤100,
 * ranks/AI/SERP/outcomes ≤200, competitors ≤5. One
 * bounded Promise.all wave; maps only — no N+1.
 * =========================================================
 */

const MAX_QUERIES = 200;
const MAX_PAGES = 100;
const MAX_ROWS = 200;
const MAX_LOCATIONS = 50;

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function norm(value: unknown): string {
  return clean(value).toLowerCase();
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function windowFor(days: number): {
  startDate: string;
  endDate: string;
} {
  const end = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const start = new Date(
    end.getTime() - (days - 1) * 24 * 60 * 60 * 1000,
  );
  const iso = (date: Date): string =>
    date.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

function serpFeatureTypes(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const features = (payload as Record<string, unknown>)
    .features;
  if (!Array.isArray(features)) return [];
  return features
    .map((entry) =>
      typeof entry === 'string'
        ? entry
        : clean(
            (entry as Record<string, unknown>)?.type,
          ),
    )
    .filter(Boolean)
    .slice(0, 12);
}

function parseJsonLd(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  }
  if (value && typeof value === 'object') return [value];
  return [];
}

@Injectable()
export class LocalIntelligenceService {
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

  private locationNames(
    brain: Record<string, unknown> | null,
    locations: Array<Record<string, unknown>>,
  ): string[] {
    const names = new Set<string>();
    const brainAreas = brain?.targetLocations;
    if (Array.isArray(brainAreas))
      for (const area of brainAreas) {
        const name = clean(area);
        if (name) names.add(name);
      }
    for (const field of ['city', 'country']) {
      const name = clean(brain?.[field]);
      if (name) names.add(name);
    }
    for (const location of locations) {
      for (const field of ['city', 'state', 'country']) {
        const name = clean(location[field]);
        if (name) names.add(name);
      }
    }
    return [...names].slice(0, 20);
  }

  async getLocalOverview(
    organizationId: string,
    websiteId: string,
    days = 28,
  ) {
    if (!websiteId)
      throw new BadRequestException('websiteId is required');
    await this.website(organizationId, websiteId);
    const window = windowFor(days);

    const [
      brainRes,
      locationsRes,
      trackedRes,
      citationsRes,
      crawlRes,
      queriesRes,
      ranksRes,
      serpRes,
      checksRes,
      competitorsRes,
      leadsRes,
      revenueRes,
      strategyRes,
    ] = await Promise.all([
      this.settled(() =>
        this.prisma.businessBrain.findUnique({
          where: { websiteId },
        }),
      ),
      this.settled(() =>
        this.prisma.businessLocation.findMany({
          where: { organizationId, websiteId },
          orderBy: { createdAt: 'asc' },
          take: MAX_LOCATIONS,
        }),
      ),
      this.settled(() =>
        this.prisma.localQuery.findMany({
          where: { organizationId, websiteId, isActive: true },
          take: MAX_QUERIES,
        }),
      ),
      this.settled(() =>
        this.prisma.localCitation.findMany({
          where: { organizationId, websiteId },
          take: MAX_QUERIES,
        }),
      ),
      this.settled(async () => {
        const crawl = await this.prisma.crawl.findFirst({
          where: { websiteId, status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
        });
        if (!crawl) return null;
        const pages = await this.prisma.crawlPage.findMany({
          where: { crawlId: crawl.id },
          select: {
            url: true,
            finalUrl: true,
            title: true,
            h1: true,
            jsonLd: true,
            structuredDataCount: true,
            statusCode: true,
            wordCount: true,
          },
          take: MAX_PAGES,
        });
        return { crawl, pages };
      }),
      this.settled(() =>
        this.google.getSearchQueries(
          organizationId,
          window.startDate,
          window.endDate,
        ),
      ),
      this.settled(() =>
        this.prisma.rankObservation.findMany({
          where: { organizationId, websiteId },
          orderBy: { observedAt: 'desc' },
          take: MAX_ROWS,
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
        this.prisma.aiVisibilityCheck.findMany({
          where: { websiteId, status: 'COMPLETED' },
          orderBy: { checkedAt: 'desc' },
          take: MAX_ROWS,
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
        this.prisma.contentStrategyLink.findMany({
          where: { organizationId, websiteId },
          select: {
            keyword: true,
            targetPage: true,
            priority: true,
            intent: true,
          },
          take: MAX_ROWS,
        }),
      ),
    ]);

    const brain = (brainRes ?? null) as Record<
      string,
      unknown
    > | null;
    const locations = (
      (locationsRes ?? []) as Array<Record<string, unknown>>
    ).slice(0, MAX_LOCATIONS);
    const areas = this.locationNames(brain, locations);

    /* ---- identity (BusinessBrain + locations; no
     * phone/address on the brain — locations carry NAP
     * fields where manually stored). */
    const primary =
      locations.find((row) => row.isPrimary === true) ??
      locations[0] ??
      null;
    const services = Array.isArray(brain?.services)
      ? (brain.services as unknown[])
          .map(clean)
          .filter(Boolean)
          .slice(0, 20)
      : [];
    const identity: BusinessIdentity = {
      businessName: clean(brain?.businessName) || null,
      website: clean(
        (await this.settled(() =>
          this.prisma.website.findFirst({
            where: { id: websiteId },
            select: { url: true },
          }),
        ))?.url,
      ),
      phone: clean(primary?.phone) || null,
      address: clean(primary?.address) || null,
      city:
        clean(primary?.city) || clean(brain?.city) || null,
      region: clean(primary?.state) || null,
      country:
        clean(primary?.country) ||
        clean(brain?.country) ||
        null,
      postalCode: clean(primary?.postalCode) || null,
      category: clean(primary?.category) || null,
      services,
      serviceAreas: areas,
    };

    /* ---- crawl signals: schema + location pages ---- */
    const crawlPages = (
      (crawlRes as {
        pages?: Array<Record<string, unknown>>;
      } | null)?.pages ?? []
    ).slice(0, MAX_PAGES);
    const hasCrawl = crawlPages.length > 0;
    const schemaEntries = crawlPages.flatMap((page) =>
      parseJsonLd(page.jsonLd),
    );
    const schemaSignals = extractSchemaSignals(
      schemaEntries,
    );
    const schema = schemaState(schemaSignals, hasCrawl);

    const locationPages = crawlPages
      .filter((page) =>
        isLocationPageUrl(clean(page.url), areas),
      )
      .slice(0, MAX_LOCATIONS)
      .map((page) => {
        const wordCount = numOrNull(page.wordCount);
        return {
          url: clean(page.url),
          title: clean(page.title) || null,
          hasContent:
            wordCount !== null && wordCount > 0
              ? true
              : null,
          hasBusinessInfo:
            schemaSignals.hasPostalAddress ||
            schemaSignals.hasLocalBusiness
              ? true
              : null,
          quality: locationPageQuality({
            hasPage: true,
            hasContent:
              wordCount !== null && wordCount > 0
                ? true
                : null,
            hasBusinessInfo:
              schemaSignals.hasPostalAddress ||
              schemaSignals.hasLocalBusiness
                ? true
                : null,
            duplicateRiskEvidence: false,
            hasEvidence: true,
          }),
          evidenceState: 'OBSERVED' as const,
        };
      });

    /* ---- NAP: brain+location vs site JSON-LD names ----
     * Only the business name is comparable without
     * invented extraction; phone/address compare where
     * both sides store them. */
    const siteNames = new Set<string>();
    for (const entry of schemaEntries.slice(0, 50)) {
      if (entry && typeof entry === 'object') {
        const name = clean(
          (entry as Record<string, unknown>).name,
        );
        if (name) siteNames.add(name);
      }
    }
    const nap = napConsistency({
      brainName: identity.businessName,
      brainPhone: identity.phone,
      brainAddress: identity.address,
      siteName: [...siteNames][0] ?? null,
      sitePhone: null,
      siteAddress: null,
    });

    /* ---- GSC local query patterns ---- */
    const queryRows = (
      Array.isArray(
        (queriesRes as unknown as { queries?: unknown })
          ?.queries,
      )
        ? (queriesRes as unknown as { queries: unknown[] })
            .queries
        : Array.isArray(
              (
                queriesRes as unknown as {
                  rows?: unknown;
                }
              )?.rows,
            )
          ? (queriesRes as unknown as { rows: unknown[] })
              .rows
          : Array.isArray(queriesRes)
            ? (queriesRes as unknown[])
            : []
    ).slice(0, MAX_QUERIES) as Array<Record<string, unknown>>;
    const localQueries = queryRows
      .map((row) => {
        const query = clean(row.query ?? row.keyword);
        if (!query) return null;
        const { pattern, evidence } = detectLocalPattern(
          query,
          areas,
        );
        return {
          query,
          pattern,
          patternEvidence: evidence,
          impressions: numOrNull(row.impressions) ?? 0,
          clicks: numOrNull(row.clicks) ?? 0,
          ctr:
            (numOrNull(row.impressions) ?? 0) > 0
              ? (numOrNull(row.clicks) ?? 0) /
                (numOrNull(row.impressions) ?? 1)
              : null,
          position: numOrNull(row.position),
          evidenceState: 'VERIFIED' as const,
        };
      })
      .filter(
        (row): row is NonNullable<typeof row> =>
          row !== null && row.pattern !== 'NON_LOCAL',
      );

    /* ---- rank + SERP + AI joins ---- */
    const rankByQuery = new Map<string, number>();
    for (const row of (ranksRes ??
      []) as Array<Record<string, unknown>>) {
      const key = norm(row.keyword ?? row.normalizedKeyword);
      if (!key || rankByQuery.has(key)) continue;
      const position = Number(row.position);
      if (Number.isFinite(position))
        rankByQuery.set(key, position);
    }
    const serpByQuery = new Map<string, string[]>();
    for (const row of (serpRes ??
      []) as Array<Record<string, unknown>>) {
      const key = norm(row.keyword);
      if (key && !serpByQuery.has(key))
        serpByQuery.set(
          key,
          serpFeatureTypes(row.payload),
        );
    }
    const localSerpFeatures = new Set<string>();
    for (const features of serpByQuery.values())
      for (const feature of features) {
        const type = feature.toLowerCase();
        if (
          type.includes('local') ||
          type.includes('map') ||
          type.includes('pack') ||
          type.includes('finder')
        )
          localSerpFeatures.add(feature);
      }
    const aiByQuery = new Map<
      string,
      { mentioned: boolean; cited: boolean }
    >();
    for (const row of (checksRes ??
      []) as Array<Record<string, unknown>>) {
      const key = norm(row.query);
      if (!key) continue;
      const entry = aiByQuery.get(key) ?? {
        mentioned: false,
        cited: false,
      };
      if (row.mentioned === true) entry.mentioned = true;
      if (row.citationFound === true) entry.cited = true;
      aiByQuery.set(key, entry);
    }

    const strategyByQuery = new Map<
      string,
      { priority: string; intent: string; targetPage: string }
    >();
    for (const row of (strategyRes ??
      []) as Array<Record<string, unknown>>) {
      const key = norm(row.keyword);
      if (!key || strategyByQuery.has(key)) continue;
      strategyByQuery.set(key, {
        priority: clean(row.priority),
        intent: clean(row.intent),
        targetPage: clean(row.targetPage),
      });
    }

    const enrichedQueries = localQueries.map((row) => {
      const key = norm(row.query);
      const position =
        row.position ?? rankByQuery.get(key) ?? null;
      const features = serpByQuery.get(key) ?? [];
      const ai = aiByQuery.get(key) ?? null;
      const strategy = strategyByQuery.get(key) ?? null;
      return {
        ...row,
        position,
        rankLabel: localRankLabel({
          hasLocalSerpObservation: features.some(
            (feature) =>
              localSerpFeatures.has(feature),
          ),
          hasOrganicRank: position !== null,
        }),
        serpFeatures: features,
        serpEvidenceState:
          features.length > 0 ? 'OBSERVED' : 'UNAVAILABLE',
        aiMentioned: ai?.mentioned ?? null,
        aiCited: ai?.cited ?? null,
        intentContext: localIntentContext(
          strategy?.intent,
          true,
        ),
        targetPage: strategy?.targetPage || null,
        priority: strategy?.priority || null,
      };
    });

    /* ---- service areas ---- */
    const serviceAreas = services.slice(0, 10).flatMap(
      (service) =>
        areas.slice(0, 5).map((location) => {
          const demand = enrichedQueries.some(
            (row) =>
              norm(row.query).includes(
                norm(service).slice(0, 12),
              ) &&
              norm(row.query).includes(
                norm(location).slice(0, 10),
              ),
          );
          const page = locationPages[0]?.url ?? null;
          return {
            service,
            location,
            hasPage: page !== null,
            observedDemand: demand,
            hasRanking: demand && page !== null,
            hasOutcome: false,
            gap: serviceAreaGap({
              service,
              location,
              hasPage: page !== null,
              observedDemand: demand,
              hasRanking: demand && page !== null,
              hasOutcome: false,
            }),
          };
        }),
    );

    /* ---- commercial local opportunities ---- */
    const commercial = enrichedQueries
      .filter(
        (row) =>
          (row.impressions ?? 0) >= 100 &&
          (row.ctr ?? 1) < 0.03,
      )
      .slice(0, 20)
      .map((row) => {
        const label: LocalOpportunityLabel =
          row.position !== null && row.position <= 10
            ? 'LOCAL_CTR_GAP'
            : 'LOCAL_VISIBILITY_GAP';
        return {
          query: row.query,
          pattern: row.pattern,
          impressions: row.impressions,
          clicks: row.clicks,
          ctr: row.ctr,
          position: row.position,
          rankLabel: row.rankLabel,
          targetPage: row.targetPage,
          label,
          suggestedNba: mapLocalOpportunityToNba(label),
          evidenceState: 'VERIFIED' as const,
        };
      });

    const opportunities: Array<{
      label: LocalOpportunityLabel;
      title: string;
      detail: string;
      suggestedNba: string;
      evidenceState: 'OBSERVED' | 'VERIFIED' | 'UNAVAILABLE';
    }> = commercial.map((row) => ({
      label: row.label,
      title: `Capture local demand for "${row.query}"`,
      detail: `${row.impressions} impressions observed with CTR ${row.ctr ?? 'unavailable'}. Organic position ${row.position ?? 'unavailable'} — never labeled Maps position.`,
      suggestedNba: row.suggestedNba,
      evidenceState: 'VERIFIED',
    }));
    if (schema === 'MISSING' || schema === 'INVALID_INCOMPLETE')
      opportunities.push({
        label: 'LOCAL_SCHEMA_GAP',
        title: 'Add local business structured data',
        detail:
          'No useful LocalBusiness/Organization machine-readable representation was observed in crawl evidence.',
        suggestedNba:
          mapLocalOpportunityToNba('LOCAL_SCHEMA_GAP'),
        evidenceState: 'OBSERVED',
      });
    if (identityCompleteness(identity) !== 'COMPLETE')
      opportunities.push({
        label: 'LOCAL_BUSINESS_INFO_GAP',
        title: 'Complete stored business identity',
        detail:
          'Business name, contact or service-area details are incomplete in stored business data.',
        suggestedNba: mapLocalOpportunityToNba(
          'LOCAL_BUSINESS_INFO_GAP',
        ),
        evidenceState: 'OBSERVED',
      });
    if (
      serviceAreas.some((row) => row.gap === 'MISSING_PAGE')
    )
      opportunities.push({
        label: 'LOCAL_SERVICE_AREA_GAP',
        title: 'Close service-area page gaps',
        detail:
          'Observed service-location demand without a supporting page.',
        suggestedNba: mapLocalOpportunityToNba(
          'LOCAL_SERVICE_AREA_GAP',
        ),
        evidenceState: 'OBSERVED',
      });

    const competitors = (
      (competitorsRes ?? []) as Array<Record<string, unknown>>
    ).map((row) => ({
      name: clean(row.name),
      domain: clean(row.domain),
      note: 'Competitor observed in local search context where evidence exists — never claimed to steal traffic.',
    }));
    const leads = (leadsRes ?? []) as Array<
      Record<string, unknown>
    >;
    const revenues = (revenueRes ?? []) as Array<
      Record<string, unknown>
    >;

    const health = [
      {
        area: 'BUSINESS_IDENTITY',
        state: localHealthOf({
          strong:
            identityCompleteness(identity) === 'COMPLETE'
              ? 1
              : 0,
          watch:
            identityCompleteness(identity) === 'PARTIAL'
              ? 1
              : 0,
          risk: 0,
          hasEvidence:
            identityCompleteness(identity) !== 'UNAVAILABLE',
        }),
      },
      {
        area: 'LOCAL_SEARCH',
        state: localHealthOf({
          strong: commercial.length > 0 ? 0 : 0,
          watch: enrichedQueries.length,
          risk: 0,
          hasEvidence: queryRows.length > 0,
        }),
      },
      {
        area: 'LOCATION_PAGES',
        state: localHealthOf({
          strong: locationPages.filter(
            (page) =>
              page.quality === 'LOCATION_PAGE_STRONG',
          ).length,
          watch: locationPages.length,
          risk: 0,
          hasEvidence: hasCrawl,
        }),
      },
      {
        area: 'STRUCTURED_DATA',
        state: localHealthOf({
          strong: schema === 'OBSERVED' ? 1 : 0,
          watch: schema === 'INVALID_INCOMPLETE' ? 1 : 0,
          risk: schema === 'MISSING' ? 1 : 0,
          hasEvidence: hasCrawl,
        }),
      },
      {
        area: 'LOCAL_SERP',
        state: localHealthOf({
          strong: localSerpFeatures.size,
          watch: 0,
          risk: 0,
          hasEvidence: serpByQuery.size > 0,
        }),
      },
      {
        area: 'AI_LOCAL_VISIBILITY',
        state: localHealthOf({
          strong: [...aiByQuery.values()].filter(
            (entry) => entry.cited || entry.mentioned,
          ).length,
          watch: 0,
          risk: 0,
          hasEvidence: aiByQuery.size > 0,
        }),
      },
      {
        area: 'BUSINESS_OUTCOMES',
        state: localHealthOf({
          strong: revenues.length,
          watch: leads.length,
          risk: 0,
          hasEvidence:
            leads.length > 0 || revenues.length > 0,
        }),
      },
    ];

    return {
      websiteId,
      identity: {
        ...identity,
        completeness: identityCompleteness(identity),
        evidenceState: brain ? 'OBSERVED' : 'UNAVAILABLE',
        source: 'BusinessBrain + stored locations',
      },
      nap: {
        state: nap,
        evidenceState:
          nap === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'OBSERVED',
        scopeNote: NAP_SCOPE_NOTE,
      },
      businessProfile: {
        state: 'UNAVAILABLE',
        evidenceState: 'UNAVAILABLE',
        note: GBP_UNAVAILABLE_NOTE,
        unavailableMetrics: GBP_UNAVAILABLE_METRICS,
      },
      reviews: {
        state: 'REVIEWS_UNAVAILABLE',
        evidenceState: 'UNAVAILABLE',
        note: 'No review source is connected. Review counts and ratings are never invented.',
      },
      localQueries: enrichedQueries.slice(0, MAX_QUERIES),
      trackedQueries: (trackedRes ?? []).slice?.(0, MAX_QUERIES) ?? trackedRes,
      citations: ((citationsRes ?? []) as unknown[]).slice(
        0,
        50,
      ),
      locations: locations.map((row) => ({
        id: row.id,
        name: clean(row.name),
        city: clean(row.city) || null,
        state: clean(row.state) || null,
        country: clean(row.country) || null,
        isPrimary: row.isPrimary === true,
        status: clean(row.status) || 'ACTIVE',
        evidenceState: 'OBSERVED' as const,
      })),
      locationPages,
      serviceAreas: serviceAreas.slice(0, 50),
      schema: {
        state: schema,
        signals: schemaSignals,
        evidenceState: hasCrawl ? 'OBSERVED' : 'UNAVAILABLE',
        note: 'Schema never guarantees rankings.',
      },
      serp: {
        localFeatures: [...localSerpFeatures],
        evidenceState:
          localSerpFeatures.size > 0
            ? 'OBSERVED'
            : 'UNAVAILABLE',
        note: 'Only actually observed features are shown. Maps visibility is never inferred from query wording.',
      },
      aiLocal: {
        observedPrompts: aiByQuery.size,
        evidenceState:
          aiByQuery.size > 0 ? 'OBSERVED' : 'UNAVAILABLE',
        note: 'Only observed prompts. No generated AI ranking.',
      },
      competitors,
      businessOutcomes: {
        leads: leads.length,
        revenueRecognized: revenues.length,
        evidenceState:
          leads.length > 0 || revenues.length > 0
            ? 'OBSERVED'
            : 'UNAVAILABLE',
        note: 'Calls, leads, customers and revenue are never estimated from rankings.',
      },
      opportunities: opportunities.slice(0, 20),
      health,
      freshness: {
        gscWindow: window,
        note: 'Each source carries its own freshness; no timestamps invented.',
      },
      cannotMeasure: CANNOT_MEASURE,
      billing: {
        charged: false,
        note: 'Read-only composition over stored evidence. No AI credits, scans, or provider meters consumed.',
      },
    };
  }

  async getLocalOpportunities(
    organizationId: string,
    websiteId: string,
    days = 28,
  ) {
    const overview = await this.getLocalOverview(
      organizationId,
      websiteId,
      days,
    );
    return {
      websiteId,
      total: overview.opportunities.length,
      opportunities: overview.opportunities,
      evidenceState:
        overview.opportunities.length > 0
          ? 'OBSERVED'
          : 'UNAVAILABLE',
      cannotMeasure: CANNOT_MEASURE,
      billing: { charged: false },
    };
  }

  async getLocalLocations(
    organizationId: string,
    websiteId: string,
  ) {
    await this.website(organizationId, websiteId);
    const locations =
      await this.prisma.businessLocation.findMany({
        where: { organizationId, websiteId },
        orderBy: { createdAt: 'asc' },
        take: MAX_LOCATIONS,
      });
    return {
      websiteId,
      total: locations.length,
      locations,
      evidenceState:
        locations.length > 0 ? 'OBSERVED' : 'UNAVAILABLE',
      note: 'Locations from stored business data and observed queries — never assumed.',
      billing: { charged: false },
    };
  }

  async getLocalLocation(
    organizationId: string,
    websiteId: string,
    location: string,
  ) {
    if (!clean(location))
      throw new BadRequestException('location is required');
    const overview = await this.getLocalOverview(
      organizationId,
      websiteId,
    );
    const key = norm(location);
    const match = (
      overview.locations as Array<Record<string, unknown>>
    ).find(
      (row) =>
        norm(row.city).includes(key) ||
        norm(row.name).includes(key) ||
        norm(row.state).includes(key),
    );
    const queries = (
      overview.localQueries as Array<Record<string, unknown>>
    ).filter((row) => norm(row.query).includes(key));
    return {
      websiteId,
      location: clean(location),
      match: match ?? null,
      queries,
      pages: overview.locationPages,
      evidenceState:
        match || queries.length > 0
          ? 'OBSERVED'
          : 'UNAVAILABLE',
      cannotMeasure: CANNOT_MEASURE,
      billing: { charged: false },
    };
  }
}

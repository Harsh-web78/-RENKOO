import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { GoogleService } from '../google/google.service';
import { CustomerDemandService } from './customer-demand.service';
import { EvidenceFusionService } from './evidence-fusion.service';
import {
  CANNOT_MEASURE,
  aiAdvantageObserved,
  aiView,
  claimDuel,
  criterionDuel,
  domainOf,
  gapStatement,
  googleView,
  identifyCompetitor,
  mapCompetitiveGapToAction,
  presenceSplit,
  uniqueInformation,
  type CompetitiveGap,
} from './competitive-intelligence';

/*
 * =========================================================
 * COMPETITIVE MOVEMENT + GAP INTELLIGENCE 1.0 (Phase 27)
 * — read-only composition over configured competitors,
 * crawl history, GSC, AI observations, demand coverage
 * and corroborating sources. Observed presence only:
 * never superiority, dominance, share, or causation.
 * No scores, no new tables, no provider calls on reads.
 *
 * Bounds: competitors ≤5, needs ≤50, queries/prompts
 * ≤200, pages ≤100, claims ≤200, criteria ≤100, sources
 * ≤200, changes ≤100, actions ≤100.
 * =========================================================
 */

const MAX_QUERIES = 200;

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

function serpResultDomains(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  const results = record.results;
  if (!Array.isArray(results)) return [];
  const domains: string[] = [];
  for (const entry of results.slice(0, 20)) {
    if (typeof entry === 'string') {
      const domain = domainOf(entry);
      if (domain) domains.push(domain);
      continue;
    }
    if (entry && typeof entry === 'object') {
      const row = entry as Record<string, unknown>;
      const domain =
        domainOf(row.url) ?? domainOf(row.link);
      if (domain) domains.push(domain);
    }
  }
  return [...new Set(domains)];
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

@Injectable()
export class CompetitiveIntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleService,
    private readonly demand: CustomerDemandService,
    private readonly fusion: EvidenceFusionService,
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

  async getCompetitiveSummary(
    organizationId: string,
    websiteId: string,
    days = 28,
  ) {
    if (!websiteId)
      throw new BadRequestException(
        'websiteId is required',
      );
    await this.website(organizationId, websiteId);
    const window = windowFor(days);

    const [
      competitorsRes,
      crawlPagesRes,
      queriesRes,
      checksRes,
      strategyRes,
      serpRes,
      demandRes,
      backlinksRes,
      leadsRes,
      revenueRes,
      nbaRes,
    ] = await Promise.all([
      this.settled(() =>
        this.prisma.competitor.findMany({
          where: { organizationId, websiteId, isActive: true },
          take: 5,
        }),
      ),
      this.settled(async () => {
        const competitors =
          await this.prisma.competitor.findMany({
            where: {
              organizationId,
              websiteId,
              isActive: true,
            },
            select: { id: true },
            take: 5,
          });
        const out: Array<Record<string, unknown>> = [];
        for (const competitor of competitors) {
          const crawl =
            await this.prisma.competitorCrawl.findFirst({
              where: {
                competitorId: competitor.id,
                status: 'COMPLETED',
              },
              orderBy: { completedAt: 'desc' },
            });
          if (!crawl) continue;
          const pages =
            await this.prisma.competitorCrawlPage.findMany({
              where: { competitorCrawlId: crawl.id },
              select: {
                url: true,
                title: true,
                h1: true,
                metaDescription: true,
              },
              take: 25,
            });
          out.push({
            competitorId: competitor.id,
            pages,
            completedAt: crawl.completedAt,
          });
        }
        return out;
      }),
      this.settled(() =>
        this.google.getSearchQueries(
          organizationId,
          window.startDate,
          window.endDate,
        ),
      ),
      this.settled(() =>
        this.prisma.aiVisibilityCheck.findMany({
          where: { websiteId, status: 'COMPLETED' },
          orderBy: { checkedAt: 'desc' },
          take: MAX_QUERIES,
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
          take: MAX_QUERIES,
        }),
      ),
      this.settled(() =>
        this.prisma.keywordMetricCache.findMany({
          where: { metric: 'serp' },
          select: { keyword: true, payload: true },
          take: MAX_QUERIES,
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
        this.prisma.backlink.findMany({
          where: { websiteId },
          select: { sourceDomain: true, targetUrl: true },
          take: MAX_QUERIES,
        }),
      ),
      this.settled(() =>
        this.prisma.lead.findMany({
          where: { websiteId },
          orderBy: { createdAt: 'desc' },
          take: MAX_QUERIES,
        }),
      ),
      this.settled(() =>
        this.prisma.revenue.findMany({
          where: { websiteId, status: 'RECOGNIZED' },
          orderBy: { recognizedAt: 'desc' },
          take: MAX_QUERIES,
        }),
      ),
      this.settled(() =>
        this.fusion.getNextBestAction(
          organizationId,
          websiteId,
        ),
      ),
    ]);

    const competitors = (
      (competitorsRes ?? []) as Array<Record<string, unknown>>
    ).slice(0, 5);
    const competitorPages = new Map<
      string,
      Array<Record<string, unknown>>
    >();
    for (const row of (crawlPagesRes ?? [])) {
      competitorPages.set(
        clean(
          (row as Record<string, unknown>).competitorId,
        ),
        (row as Record<string, unknown>).pages as Array<
          Record<string, unknown>
        >,
      );
    }
    const checks = (checksRes ?? []) as Array<
      Record<string, unknown>
    >;
    const serpDomainsByQuery = new Map<string, string[]>();
    for (const row of (serpRes ??
      []) as Array<Record<string, unknown>>) {
      const key = norm(row.keyword);
      if (key && !serpDomainsByQuery.has(key))
        serpDomainsByQuery.set(
          key,
          serpResultDomains(row.payload),
        );
    }
    const gscQueries = rowsOf(queriesRes).slice(
      0,
      MAX_QUERIES,
    );
    const gscKeys = new Set(
      gscQueries
        .map((row) => norm(row.query ?? row.keyword))
        .filter(Boolean),
    );

    /* Per-competitor composition. */
    const midpoint = Date.now() - 45 * 24 * 60 * 60 * 1000;
    const entries = competitors.map((competitor) => {
      const id = clean(competitor.id);
      const name = clean(competitor.name);
      const domain = clean(
        competitor.domain,
      ).toLowerCase();
      const pages = competitorPages.get(id) ?? [];
      const pageText = norm(
        pages
          .map((page) =>
            [
              clean(page.title),
              clean(page.metaDescription),
              ...(Array.isArray(page.h1)
                ? (page.h1 as unknown[]).map(clean)
                : []),
            ].join(' '),
          )
          .join(' '),
      );
      const matchingChecks = checks.filter((row) => {
        const names = row.competitorNames;
        if (!Array.isArray(names)) return false;
        return (names as unknown[]).some(
          (entry) =>
            norm(entry).includes(norm(name).slice(0, 12)) ||
            norm(name).slice(0, 12).length > 0 &&
              norm(entry) === norm(name),
        );
      });
      const earlier = matchingChecks.filter(
        (row) =>
          new Date(row.checkedAt as string).getTime() <
          midpoint,
      );
      const later = matchingChecks.filter(
        (row) =>
          new Date(row.checkedAt as string).getTime() >=
          midpoint,
      );
      const citedEarlier = earlier.some(
        (row) => row.citationFound === true,
      );
      const citedLater = later.some(
        (row) => row.citationFound === true,
      );
      const mentionedEarlier = earlier.some(
        (row) => row.mentioned === true,
      );
      const mentionedLater = later.some(
        (row) => row.mentioned === true,
      );
      const movements: string[] = [];
      if (earlier.length > 0 || later.length > 0) {
        if (!citedEarlier && citedLater)
          movements.push('COMPETITOR_CITED');
        if (citedEarlier && !citedLater)
          movements.push('COMPETITOR_LOST_CITATION');
        if (!mentionedEarlier && mentionedLater)
          movements.push('COMPETITOR_MENTION_GAINED');
        if (mentionedEarlier && !mentionedLater)
          movements.push('COMPETITOR_MENTION_LOST');
      } else {
        movements.push('HISTORY_UNAVAILABLE');
      }
      const serpHits = [...serpDomainsByQuery.values()].filter(
        (domains) =>
          domains.some(
            (entry) =>
              entry === domain ||
              entry.endsWith(`.${domain}`),
          ),
      ).length;
      return {
        id,
        name,
        domain,
        url: clean(competitor.url) || null,
        identity: identifyCompetitor({
          configured: true,
          observedInEvidence:
            matchingChecks.length > 0 || serpHits > 0,
          inferredFromSerp: serpHits > 0,
        }),
        pages: pages.slice(0, 10).map((page) => ({
          url: clean(page.url),
          title: clean(page.title) || null,
        })),
        pageCount: pages.length,
        crawlEvidence:
          pages.length > 0 ? 'OBSERVED' : 'UNAVAILABLE',
        ai: {
          observations: matchingChecks.length,
          cited: matchingChecks.filter(
            (row) => row.citationFound === true,
          ).length,
          mentioned: matchingChecks.filter(
            (row) => row.mentioned === true,
          ).length,
          evidenceState:
            matchingChecks.length > 0
              ? 'OBSERVED'
              : 'UNAVAILABLE',
        },
        serpHits,
        movements,
        movementNote:
          movements.includes('HISTORY_UNAVAILABLE')
            ? 'Competitor history is unavailable without historical observations. Movement is never fabricated.'
            : 'Temporal association only; page changes are not claimed to cause citations.',
      };
    });

    /* ---- need-level competition ---- */
    const needs = (
      ((demandRes as Record<string, unknown> | null)
        ?.topNeeds as unknown[]) ??
      []
    ).slice(0, 10) as Array<Record<string, unknown>>;
    const needCompetition = needs.map((need) => {
      const needCompetitors = (
        (need.competitors as string[] | undefined) ?? []
      ).slice(0, 5);
      const criteria = Object.entries(
        (need.coverage ?? {}) as Record<
          string,
          { state: string; page: string | null }
        >,
      )
        .slice(0, 20)
        .map(([criterion, value]) => {
          const ownCovered =
            value.state === 'COVERED' ||
            value.state === 'PARTIAL';
          /* Competitor coverage: criterion terms in
           * competitor crawl text (INFERRED presence). */
          const terms = norm(criterion)
            .split(/[^a-z]+/)
            .filter((term) => term.length > 3);
          const covering = entries
            .filter((entry) => {
              const text = norm(
                (competitorPages.get(entry.id) ?? [])
                  .map((page) =>
                    [
                      clean(page.title),
                      ...(Array.isArray(page.h1)
                        ? (
                            page.h1 as unknown[]
                          ).map(clean)
                        : []),
                    ].join(' '),
                  )
                  .join(' '),
              );
              return terms.some((term) => text.includes(term));
            })
            .map((entry) => entry.name);
          return {
            criterion,
            own: value.state,
            duel: criterionDuel(
              ownCovered,
              covering.length > 0,
            ),
            competitorEvidence: covering.slice(0, 3),
            competitorEvidenceState:
              (competitorPages.size > 0
                ? 'INFERRED'
                : 'UNAVAILABLE') as 'INFERRED' | 'UNAVAILABLE',
          };
        });
      return {
        key: clean(need.key),
        label: clean(need.label),
        journey: clean(need.journey),
        google: {
          own: (need.impressions as number) > 0,
          evidenceState: 'OBSERVED' as const,
        },
        ai: {
          cited: (need.queries as Array<{ aiCited?: boolean }>)
            .some((row) => row.aiCited === true),
          evidenceState: 'OBSERVED' as const,
        },
        competitors: needCompetitors,
        criteria,
        pages: (need.pages as string[] | undefined) ?? [],
      };
    });

    /* ---- gaps ---- */
    const gaps: Array<{
      gap: CompetitiveGap;
      competitor: string | null;
      need: string | null;
      detail: string;
      action: string;
      evidenceState: 'OBSERVED' | 'INFERRED' | 'UNAVAILABLE';
    }> = [];
    for (const need of needCompetition.slice(0, 10)) {
      for (const row of need.criteria.slice(0, 10)) {
        if (
          row.duel === 'COMPETITOR_COVERED' &&
          gaps.length < 50
        ) {
          gaps.push({
            gap: 'MISSING_CUSTOMER_CRITERION',
            competitor:
              row.competitorEvidence[0] ?? null,
            need: need.label,
            detail: gapStatement(
              row.competitorEvidence[0] ?? 'competitor',
              `criterion ${row.criterion} observed for "${need.label}" while own evidence is missing`,
            ),
            action: mapCompetitiveGapToAction(
              'MISSING_CUSTOMER_CRITERION',
            ),
            evidenceState: 'INFERRED',
          });
        }
      }
      const aiRows = checks.filter((row) =>
        Array.isArray(row.competitorNames) &&
        (row.competitorNames as unknown[]).length > 0,
      );
      if (aiRows.length === 0 && gscKeys.size === 0) {
        /* No cross evidence for this need; gaps come
         * from criterion duels above. */
      }
    }
    for (const entry of entries) {
      if (entry.ai.cited > 0 && gaps.length < 50) {
        gaps.push({
          gap: 'COMPETITOR_AI_CITATION',
          competitor: entry.name,
          need: null,
          detail: gapStatement(
            entry.name,
            `${entry.ai.cited} observed citation(s) in monitored AI evidence`,
          ),
          action: mapCompetitiveGapToAction(
            'COMPETITOR_AI_CITATION',
          ),
          evidenceState: 'OBSERVED',
        });
      }
      if (entry.serpHits > 0 && gaps.length < 50) {
        gaps.push({
          gap: 'COMPETITOR_GOOGLE_VISIBILITY',
          competitor: entry.name,
          need: null,
          detail: gapStatement(
            entry.name,
            `observed in ${entry.serpHits} cached SERP result set(s)`,
          ),
          action: mapCompetitiveGapToAction(
            'COMPETITOR_GOOGLE_VISIBILITY',
          ),
          evidenceState: 'OBSERVED',
        });
      }
    }
    /* Third-party representation: citation domains that
     * are neither the own site nor a configured
     * competitor. Observed presence only. */
    const ownDomain = domainOf(
      (await this.settled(() =>
        this.prisma.website.findFirst({
          where: { id: websiteId },
          select: { url: true },
        }),
      ))?.url,
    );
    const competitorDomains = new Set(
      entries
        .map((entry) => entry.domain)
        .filter(Boolean),
    );
    const thirdPartyDomains = [
      ...new Set(
        checks
          .filter((row) => row.citationFound === true)
          .map((row) => domainOf(row.citationUrl))
          .filter(
            (domain): domain is string =>
              domain !== null &&
              domain !== ownDomain &&
              !competitorDomains.has(domain),
          ),
      ),
    ].slice(0, 10);
    if (thirdPartyDomains.length > 0 && gaps.length < 50) {
      gaps.push({
        gap: 'THIRD_PARTY_REPRESENTATION_GAP',
        competitor: null,
        need: null,
        detail: `Third-party sources observed in AI citations (${thirdPartyDomains.slice(0, 3).join(', ')}); own representation there is unobserved. Authority rail applies — backlinks are never auto-recommended.`,
        action: mapCompetitiveGapToAction(
          'THIRD_PARTY_REPRESENTATION_GAP',
        ),
        evidenceState: 'OBSERVED',
      });
    }

    /* ---- google + AI views per need ---- */
    const views = needCompetition.slice(0, 10).map((need) => {
      const ownGoogle = need.google.own;
      const competitorGoogle = need.criteria.some(
        (row) =>
          row.duel === 'COMPETITOR_COVERED' ||
          row.duel === 'BOTH_COVERED',
      );
      return {
        need: need.label,
        google: googleView(ownGoogle, competitorGoogle || null),
        ai: aiView(
          null,
          need.ai.cited || null,
          null,
          need.competitors.length > 0 || null,
        ),
        split: presenceSplit(
          ownGoogle,
          competitorGoogle,
          null,
          null,
        ),
      };
    });

    const leads = (leadsRes ?? []) as Array<
      Record<string, unknown>
    >;
    const revenues = (revenueRes ?? []) as Array<
      Record<string, unknown>
    >;

    return {
      websiteId,
      summary: {
        competitors: entries.length,
        needs: needCompetition.length,
        gaps: gaps.length,
        evidenceState:
          entries.length > 0 ? 'OBSERVED' : 'UNAVAILABLE',
        note: 'Competitor presence is observed, never superiority. Absence from available evidence is not proof of non-visibility.',
      },
      competitors: entries,
      needs: needCompetition,
      movements: entries.flatMap((entry) =>
        entry.movements
          .filter((movement) => movement !== 'HISTORY_UNAVAILABLE')
          .map((movement) => ({
            competitor: entry.name,
            movement,
            evidenceState: 'OBSERVED' as const,
          })),
      ),
      views,
      gaps: gaps.slice(0, 50),
      claims: {
        note: 'Claim duels reuse Phase 25 states on observed page text; no truth judgement is made.',
        evidenceState:
          competitorPages.size > 0
            ? 'INFERRED'
            : 'UNAVAILABLE',
      },
      sources: {
        note: 'SOURCE_SELECTION_OBSERVED where third-party or competitor sources appear in AI evidence; selection reasons are never inferred.',
        evidenceState:
          checks.length > 0 ? 'OBSERVED' : 'UNAVAILABLE',
      },
      timeline: entries.flatMap((entry) =>
        entry.movements
          .filter((movement) => movement !== 'HISTORY_UNAVAILABLE')
          .map((movement) => ({
            competitor: entry.name,
            movement,
            note: 'Temporal association only.',
          })),
      ),
      divergence: views
        .filter(
          (view) =>
            view.split === 'COMPETITOR_GOOGLE_ONLY' ||
            view.split === 'COMPETITOR_AI_ONLY',
        )
        .slice(0, 10),
      business: {
        leads: leads.length,
        revenue: revenues.length,
        evidenceState:
          leads.length > 0 || revenues.length > 0
            ? 'OBSERVED'
            : 'UNAVAILABLE',
        note: 'Only recorded outcomes. A competitor never stole revenue in RENKOO language.',
      },
      nextBestAction: (
        nbaRes as Record<string, unknown> | null
      ) ?? {
        evidenceState: 'UNAVAILABLE',
        statement:
          'Next best action unavailable for this website right now.',
      },
      freshness: {
        window,
        note: 'Every observation carries source, observedAt and evidence state.',
      },
      evidence: {
        note: 'GSC is first-party truth for own pages; vendor-style estimates are never used for competitors.',
      },
      limitations: CANNOT_MEASURE,
      billing: {
        charged: false,
        note: 'Read-only composition over stored evidence. No new meters.',
      },
    };
  }

  async getCompetitorDetail(
    organizationId: string,
    websiteId: string,
    competitor: string,
  ) {
    const full = await this.getCompetitiveSummary(
      organizationId,
      websiteId,
    );
    const key = norm(competitor);
    const match = (
      full.competitors as Array<{
        id: string;
        name: string;
        domain: string;
      }>
    ).find(
      (entry) =>
        entry.id === clean(competitor) ||
        norm(entry.domain) === key ||
        norm(entry.name) === key,
    );
    if (!match) {
      return {
        competitor: clean(competitor),
        evidenceState: 'UNAVAILABLE',
        note: 'No configured competitor matches this identifier.',
        billing: { charged: false },
      };
    }
    return {
      ...match,
      needs: (
        full.needs as Array<{
          competitors?: string[];
        }>
      ).filter((need) =>
        (need.competitors ?? []).some(
          (name) =>
            norm(name) === norm(match.name) ||
            norm(name).includes(norm(match.name).slice(0, 10)),
        ),
      ),
      limitations: CANNOT_MEASURE,
      billing: { charged: false },
    };
  }

  async getNeedCompetition(
    organizationId: string,
    websiteId: string,
    needKey: string,
  ) {
    const full = await this.getCompetitiveSummary(
      organizationId,
      websiteId,
    );
    const match = (
      full.needs as Array<{ key: string }>
    ).find((need) => need.key === clean(needKey));
    if (!match) {
      return {
        needKey: clean(needKey),
        evidenceState: 'UNAVAILABLE',
        note: 'No need observation matches this key.',
        billing: { charged: false },
      };
    }
    return {
      ...match,
      limitations: CANNOT_MEASURE,
      billing: { charged: false },
    };
  }

  async getQueryCompetition(
    organizationId: string,
    websiteId: string,
    query: string,
  ) {
    if (!websiteId)
      throw new BadRequestException(
        'websiteId is required',
      );
    await this.website(organizationId, websiteId);
    const key = norm(query);
    const [checks, serp] = await Promise.all([
      this.prisma.aiVisibilityCheck.findMany({
        where: { websiteId, status: 'COMPLETED' },
        orderBy: { checkedAt: 'desc' },
        take: 200,
      }),
      this.prisma.keywordMetricCache.findMany({
        where: { metric: 'serp' },
        select: { keyword: true, payload: true },
        take: 200,
      }),
    ]);
    const matching = checks.filter(
      (row) => norm(row.query) === key,
    );
    const serpRow = serp.find(
      (row) => norm(row.keyword) === key,
    );
    const serpDomains = serpRow
      ? serpResultDomains(
          (serpRow as Record<string, unknown>).payload,
        )
      : [];
    const competitors = [
      ...new Set(
        matching.flatMap((row) =>
          Array.isArray(row.competitorNames)
            ? (row.competitorNames as unknown[]).map(clean)
            : [],
        ).filter(Boolean),
      ),
    ].slice(0, 5);
    return {
      websiteId,
      query: clean(query),
      google: {
        view: googleView(
          true,
          serpDomains.length > 1,
        ),
        serpDomains: serpDomains.slice(0, 10),
        evidenceState: serpRow ? 'OBSERVED' : 'UNAVAILABLE',
      },
      ai: {
        observations: matching.length,
        competitors,
        evidenceState:
          matching.length > 0 ? 'OBSERVED' : 'UNAVAILABLE',
      },
      split: presenceSplit(
        true,
        serpDomains.length > 1,
        matching.some((row) => row.mentioned === true) ||
          (matching.length > 0 ? false : null),
        competitors.length > 0,
      ),
      limitations: CANNOT_MEASURE,
      billing: { charged: false },
    };
  }
}

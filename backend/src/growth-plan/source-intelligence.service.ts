import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { KeywordCacheService } from '../keywords/keyword-cache.service';
import { RankIntelligenceService } from '../keywords/rank-intelligence.service';
import { GrowthWorkService } from './growth-work.service';
import { GrowthOutcomeService } from './growth-outcome.service';
import { buyerCriteriaIn } from './decision-gap';
import {
  MAX_COMPETITORS,
  MAX_SOURCES,
  MAX_SOURCE_OPPORTUNITIES,
  classifySource,
  diversityDistribution,
  diversityNote,
  domainOf,
  frequencyNote,
  freshnessCompare,
  gapForMissingType,
  opportunityFor,
  presenceNote,
  sourceFingerprint,
  sourcePresence,
  trustFor,
  agencySourceSummary,
  type SourcePresence,
  type SourceType,
} from './source-intelligence';

/*
 * =========================================================
 * AI SOURCE & BRAND AUTHORITY INTELLIGENCE 1.0 (Phase 39).
 *
 * Source landscape over observed citations: recorded AI
 * checks (citation URLs, platforms, competitors),
 * cached SERP snapshots (domains, zero fresh calls),
 * existing actions/work/outcomes.
 *
 * No authority/trust/influence scores, no recommendation
 * inference, no outreach automation, no invented
 * sources. Presence is never influence. Composition
 * only — zero migrations.
 * =========================================================
 */

const MAX_CHECKS = 100;
const MAX_KEYWORDS = 20;
const MAX_ACTIONS = 100;

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function normKey(value: unknown): string {
  return clean(value).toLowerCase().replace(/\s+/g, ' ');
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

export interface SourceRow {
  fingerprint: string;
  source: string;
  domain: string;
  type: SourceType;
  firstParty: boolean;
  brandPresent: boolean | null;
  competitorPresent: boolean | null;
  presence: SourcePresence;
  presenceNote: string;
  citationsObserved: number;
  prompts: string[];
  engines: string[];
  urls: string[];
  observedAt: string | null;
  evidenceSource: string;
  trust: string;
  opportunity: string;
}

@Injectable()
export class SourceIntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly serpCache: KeywordCacheService,
    private readonly rankIntel: RankIntelligenceService,
    private readonly work: GrowthWorkService,
    private readonly outcomes: GrowthOutcomeService,
  ) {}

  private async website(
    organizationId: string,
    websiteId: string,
  ) {
    const site = await this.prisma.website.findFirst({
      where: {
        id: websiteId,
        organizationId,
        isActive: true,
      },
    });
    if (!site) throw new NotFoundException('Website not found');
    return site;
  }

  private async aiChecks(
    websiteId: string,
    take = MAX_CHECKS,
  ): Promise<Array<any>> {
    try {
      const db = this.prisma as unknown as Record<
        string,
        any
      >;
      return (
        (await db.aiVisibilityCheck?.findMany({
          where: { websiteId },
          orderBy: { checkedAt: 'desc' },
          take,
        })) ?? []
      );
    } catch {
      return [];
    }
  }

  private async collect(
    organizationId: string,
    websiteId: string,
    ownHost: string | null,
  ): Promise<{
    rows: SourceRow[];
    prompts: number;
    engines: string[];
    unknowns: string[];
  }> {
    const checks = await this.aiChecks(websiteId);
    const byDomain = new Map<
      string,
      {
        urls: Set<string>;
        prompts: Set<string>;
        engines: Set<string>;
        brandCited: boolean;
        competitors: Set<string>;
        latestAt: string | null;
      }
    >();
    const competitorNames = new Set<string>();
    for (const check of checks) {
      const url = clean(check.citationUrl);
      if (!url) continue;
      const domain = domainOf(url);
      if (!domain) continue;
      let entry = byDomain.get(domain);
      if (!entry) {
        entry = {
          urls: new Set(),
          prompts: new Set(),
          engines: new Set(),
          brandCited: false,
          competitors: new Set(),
          latestAt: null,
        };
        byDomain.set(domain, entry);
      }
      entry.urls.add(url);
      if (clean(check.query)) entry.prompts.add(clean(check.query));
      if (clean(check.platform)) entry.engines.add(clean(check.platform));
      if (check.citationFound === true) entry.brandCited = true;
      for (const name of Array.isArray(check.competitorNames)
        ? check.competitorNames
        : []) {
        const n = clean(name);
        if (n) {
          entry.competitors.add(n);
          competitorNames.add(n);
        }
      }
      const at = check.checkedAt
        ? new Date(check.checkedAt).toISOString()
        : null;
      if (at && (!entry.latestAt || at > entry.latestAt)) {
        entry.latestAt = at;
      }
    }

    /* Google landscape: cached SERP domains for
     * tracked queries (zero fresh provider calls). */
    let tracked: Array<any> = [];
    try {
      const list = (await this.rankIntel.listTracked(
        organizationId,
        websiteId,
        { isActive: true, pageNum: 1, pageSize: MAX_KEYWORDS },
      )) as any;
      tracked = list?.keywords ?? [];
    } catch {
      tracked = [];
    }
    for (const tk of tracked) {
      const keyword = clean(tk.keyword);
      if (!keyword) continue;
      let snapshot: any = null;
      try {
        const cached = await this.serpCache.peek<any>(
          'DATAFORSEO',
          'serp',
          clean(tk.country) || 'US',
          clean(tk.language) || 'en',
          keyword,
        );
        snapshot = cached?.value ?? null;
      } catch {
        snapshot = null;
      }
      const results: Array<any> = Array.isArray(snapshot?.results)
        ? snapshot.results.slice(0, 10)
        : [];
      for (const result of results) {
        const url = clean(result.url);
        const domain = domainOf(url);
        if (!domain) continue;
        let entry = byDomain.get(domain);
        if (!entry) {
          entry = {
            urls: new Set(),
            prompts: new Set(),
            engines: new Set(),
            brandCited: false,
            competitors: new Set(),
            latestAt: null,
          };
          byDomain.set(domain, entry);
        }
        entry.urls.add(url);
        entry.prompts.add(`SERP: ${keyword}`);
        entry.engines.add('GOOGLE_SERP');
      }
    }

    const ownHosts = ownHost ? [ownHost] : [];
    const rows: SourceRow[] = [];
    for (const [domain, entry] of byDomain) {
      const firstUrl = [...entry.urls][0] ?? null;
      const type = classifySource({
        url: firstUrl,
        ownHosts,
      });
      /* Brand presence is observed citation or own
       * domain; competitor presence is observed
       * competitor names on the same source. Absence
       * is only claimed where the source was actually
       * observed without the brand. */
      const isOwn =
        ownHost !== null &&
        (domain === ownHost ||
          domain.endsWith(`.${ownHost}`));
      const brand = entry.brandCited || isOwn ? true : false;
      const competitor = entry.competitors.size > 0;
      const presence = sourcePresence({
        brandPresent: brand,
        competitorPresent: competitor,
      });
      const citations = entry.urls.size;
      rows.push({
        fingerprint: sourceFingerprint({
          organizationId,
          websiteId,
          domain,
          target: [...entry.prompts].slice(0, 3).join('|'),
        }),
        source: firstUrl ?? domain,
        domain,
        type,
        firstParty: type === 'FIRST_PARTY',
        brandPresent: brand,
        competitorPresent: competitor,
        presence,
        presenceNote: presenceNote(presence),
        citationsObserved: citations,
        prompts: [...entry.prompts].slice(0, 8),
        engines: [...entry.engines].slice(0, 8),
        urls: [...entry.urls].slice(0, 5),
        observedAt: entry.latestAt,
        evidenceSource:
          entry.engines.has('GOOGLE_SERP') && entry.engines.size === 1
            ? 'Cached SERP snapshot (no fresh fetch)'
            : 'Recorded AI checks',
        trust: trustFor({
          supported: entry.brandCited,
          contradicted: false,
          stale: false,
          observed: true,
        }),
        opportunity: opportunityFor({
          presence,
          freshness: 'FRESHNESS_UNKNOWN',
          claimGap: false,
          hasWork: false,
        }),
      });
      if (rows.length >= MAX_SOURCES) break;
    }
    rows.sort(
      (a, b) =>
        b.citationsObserved - a.citationsObserved ||
        (a.domain < b.domain ? -1 : 1),
    );
    const unknowns: string[] = [];
    if (checks.length === 0) {
      unknowns.push(
        'No recorded AI checks — AI citation states UNKNOWN.',
      );
    }
    if (tracked.length === 0) {
      unknowns.push(
        'No tracked queries — Google SERP source landscape unavailable.',
      );
    }
    unknowns.push(
      'AI recommendation: always RECOMMENDATION_UNKNOWN — never inferred from citations.',
    );
    unknowns.push(
      'Source publication dates: FRESHNESS_UNKNOWN unless a source record provides one.',
    );
    return {
      rows,
      prompts: new Set(
        checks.map((c) => clean(c.query)).filter(Boolean),
      ).size,
      engines: [
        ...new Set(
          checks.map((c) => clean(c.platform)).filter(Boolean),
        ),
      ],
      unknowns,
    };
  }

  /* ============ landscape ============ */

  async landscape(
    organizationId: string,
    websiteId: string,
  ) {
    const site = await this.website(
      organizationId,
      websiteId,
    );
    const { rows, prompts, engines, unknowns } =
      await this.collect(
        organizationId,
        websiteId,
        hostOf(site.url),
      );
    const ours = rows.filter(
      (r) =>
        r.presence === 'OUR_SOURCE_PRESENT' ||
        r.firstParty,
    );
    const competitorOnly = rows.filter(
      (r) => r.presence === 'COMPETITOR_SOURCE_PRESENT',
    );
    const shared = rows.filter(
      (r) => r.presence === 'SHARED_SOURCE',
    );
    const distribution = diversityDistribution(
      rows.map((r) => r.type),
    );
    return {
      websiteId,
      totals: {
        sources: rows.length,
        ours: ours.length,
        competitorOnly: competitorOnly.length,
        shared: shared.length,
        prompts,
        engines,
      },
      ours: ours.slice(0, 25),
      competitorOnly: competitorOnly.slice(0, 25),
      shared: shared.slice(0, 25),
      diversity: distribution,
      diversityNote: diversityNote(distribution),
      unknowns,
      note: 'Presence is never influence. Frequency is never authority. No scores.',
    };
  }

  /* ============ competitors ============ */

  async competitors(
    organizationId: string,
    websiteId: string,
  ) {
    const site = await this.website(
      organizationId,
      websiteId,
    );
    const { rows, unknowns } = await this.collect(
      organizationId,
      websiteId,
      hostOf(site.url),
    );
    const byCompetitor = new Map<
      string,
      { sources: SourceRow[]; prompts: Set<string> }
    >();
    for (const row of rows) {
      if (
        row.presence !== 'COMPETITOR_SOURCE_PRESENT' &&
        row.presence !== 'SHARED_SOURCE'
      ) {
        continue;
      }
      /* Competitor attribution per source is limited
       * to recorded names; SERP-only competitor rows
       * aggregate under their domain. */
      const key = row.domain;
      let entry = byCompetitor.get(key);
      if (!entry) {
        entry = { sources: [], prompts: new Set() };
        byCompetitor.set(key, entry);
      }
      entry.sources.push(row);
      for (const p of row.prompts) entry.prompts.add(p);
      if (byCompetitor.size >= MAX_COMPETITORS) break;
    }
    return {
      websiteId,
      competitors: [...byCompetitor.entries()].map(
        ([domain, entry]) => ({
          domain,
          sources: entry.sources.length,
          prompts: [...entry.prompts].slice(0, 8),
          rows: entry.sources.slice(0, 10),
          note: 'Observed sources only — never claimed as the cause of competitor advantage.',
        }),
      ),
      unknowns,
    };
  }

  /* ============ AI citation sources ============ */

  async ai(
    organizationId: string,
    websiteId: string,
  ) {
    const site = await this.website(
      organizationId,
      websiteId,
    );
    const checks = await this.aiChecks(websiteId);
    const byPrompt = new Map<
      string,
      {
        engines: Set<string>;
        cited: string[];
        mentioned: boolean;
        competitorNames: string[];
      }
    >();
    for (const check of checks) {
      const prompt = clean(check.query);
      if (!prompt) continue;
      let entry = byPrompt.get(prompt);
      if (!entry) {
        entry = {
          engines: new Set(),
          cited: [],
          mentioned: false,
          competitorNames: [],
        };
        byPrompt.set(prompt, entry);
      }
      if (clean(check.platform)) {
        entry.engines.add(clean(check.platform));
      }
      if (check.mentioned === true) entry.mentioned = true;
      const url = clean(check.citationUrl);
      if (url && !entry.cited.includes(url)) {
        entry.cited.push(url);
      }
      for (const name of Array.isArray(check.competitorNames)
        ? check.competitorNames
        : []) {
        const n = clean(name);
        if (n && !entry.competitorNames.includes(n)) {
          entry.competitorNames.push(n);
        }
      }
    }
    void hostOf(site.url);
    return {
      websiteId,
      prompts: [...byPrompt.entries()].slice(0, 20).map(
        ([prompt, entry]) => ({
          prompt,
          engines: [...entry.engines],
          ourMentioned: entry.mentioned,
          ourCited: entry.cited.length > 0,
          ourUrls: entry.cited.slice(0, 5),
          competitorMentioned:
            entry.competitorNames.length > 0,
          competitorNames: entry.competitorNames.slice(
            0,
            MAX_COMPETITORS,
          ),
          recommendation: 'RECOMMENDATION_UNKNOWN',
          frequency:
            entry.cited.length > 1
              ? frequencyNote(
                  prompt.slice(0, 40),
                  entry.cited.length,
                  entry.cited.length,
                )
              : null,
        }),
      ),
      unknowns: [
        checks.length === 0
          ? 'No recorded AI checks — AI source states UNKNOWN.'
          : null,
        'Recommendation: RECOMMENDATION_UNKNOWN always.',
        'Citation frequency is recurrence, never authority.',
      ].filter(Boolean) as string[],
    };
  }

  /* ============ single source ============ */

  async item(
    organizationId: string,
    websiteId: string,
    domain: string,
  ) {
    const site = await this.website(
      organizationId,
      websiteId,
    );
    const { rows } = await this.collect(
      organizationId,
      websiteId,
      hostOf(site.url),
    );
    const found =
      rows.find(
        (r) =>
          r.domain === clean(domain).toLowerCase() ||
          r.fingerprint === clean(domain),
      ) ?? null;
    if (!found) {
      throw new NotFoundException('Source not observed');
    }
    /* Existing work linkage (bounded, best-effort). */
    let actions: Array<any> = [];
    try {
      actions = await this.prisma.action.findMany({
        where: {
          organizationId,
          websiteId,
          status: { in: ['TODO', 'IN_PROGRESS', 'DONE'] },
        },
        orderBy: { updatedAt: 'desc' },
        take: MAX_COMPETITORS * 10,
      });
    } catch {
      actions = [];
    }
    const related = (actions as Array<any>)
      .filter((a) => {
        const hay = normKey(
          `${a.title} ${JSON.stringify(a.metadata ?? {})}`,
        );
        return (
          hay.includes(found.domain) ||
          found.prompts.some(
            (p) => normKey(p) !== '' && hay.includes(normKey(p).slice(0, 24)),
          )
        );
      })
      .slice(0, 5)
      .map((a) => ({
        id: a.id,
        title: a.title,
        status: a.status,
      }));
    let work: unknown = null;
    let outcome: unknown = null;
    if (related[0]) {
      try {
        work = await this.work.detail(
          organizationId,
          websiteId,
          clean(related[0].id),
        );
      } catch {
        work = null;
      }
      try {
        const det = (work ?? {}) as Record<string, unknown>;
        if (String(det.status ?? '').toUpperCase() === 'COMPLETED') {
          outcome = await this.outcomes.outcomeFor(
            organizationId,
            websiteId,
            clean(related[0].id),
            28,
          );
        }
      } catch {
        outcome = null;
      }
    }
    /* Gap categories supported by this source row. */
    const gaps: string[] = [];
    if (found.presence === 'COMPETITOR_SOURCE_PRESENT') {
      gaps.push('COMPETITOR_SOURCE_ADVANTAGE');
      const missing = gapForMissingType(found.type);
      if (missing) gaps.push(missing);
    }
    if (found.presence === 'SHARED_SOURCE') {
      gaps.push('SHARED_SOURCE_UNDERUTILIZED');
    }
    return {
      ...found,
      freshness: freshnessCompare({
        oursIso: null,
        competitorIso: null,
      }),
      freshnessNote:
        'FRESHNESS_UNKNOWN — no publication dates in observed records; never inferred.',
      claimSupport:
        'OBSERVED_CLAIM_SUPPORT where this source cites a need-relevant claim in recorded checks; granularity limited to recorded evidence.',
      buyerCriteria: buyerCriteriaIn(
        found.prompts.join(' '),
      ),
      gaps,
      opportunity: opportunityFor({
        presence: found.presence,
        freshness: 'FRESHNESS_UNKNOWN',
        claimGap: gaps.length > 0,
        hasWork: related.length > 0,
      }),
      relatedWork: related,
      work: work
        ? {
            status: (work as any).status,
            section: (work as any).section,
          }
        : null,
      outcome: outcome
        ? {
            signal: (outcome as any).signal,
            interpretation: (outcome as any).interpretation,
          }
        : null,
      agency: agencySourceSummary({
        observed: [`${found.domain} (${found.type}) — ${found.citationsObserved} observed citation(s)`],
        competitors:
          found.presence === 'COMPETITOR_SOURCE_PRESENT' ||
          found.presence === 'SHARED_SOURCE'
            ? [`competitor presence on ${found.domain}`]
            : [],
        ours:
          found.presence === 'OUR_SOURCE_PRESENT' ||
          found.presence === 'SHARED_SOURCE'
            ? [`our brand on ${found.domain}`]
            : [],
        unknown: [
          'Source influence on recommendations: unknown.',
          'Sentiment of presence: unknown (presence ≠ endorsement).',
        ],
        investigate: [
          `${opportunityFor({
            presence: found.presence,
            freshness: 'FRESHNESS_UNKNOWN',
            claimGap: gaps.length > 0,
            hasWork: related.length > 0,
          })} — decision label only, never an automated task.`,
        ],
      }),
      outreachBan:
        'No outreach automation: RENKOO never emails journalists, posts, reviews, submits, links, or impersonates. Opportunities are investigation labels.',
    };
  }
}

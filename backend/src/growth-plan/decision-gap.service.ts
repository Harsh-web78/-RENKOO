import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { KeywordCacheService } from '../keywords/keyword-cache.service';
import { RankIntelligenceService } from '../keywords/rank-intelligence.service';
import { GrowthDecisionService } from './growth-plan.service';
import { GrowthWorkService } from './growth-work.service';
import { GrowthOutcomeService } from './growth-outcome.service';
import {
  MAX_COMPETITORS,
  MAX_GAPS,
  MAX_SERP_RESULTS,
  MAX_TARGETS,
  aiGapState,
  authorityNote,
  buyerCriteriaGap,
  buyerCriteriaIn,
  conflictNote,
  coverageGap,
  dominantFormat,
  freshnessNote,
  gapFingerprint,
  inferIntent,
  intentMismatch,
  nextDecisionForGap,
  orderGaps,
  pageAngle,
  recommendationState,
  serpFormatMismatch,
  serpFormatOf,
  sourceGapNote,
  technicalGaps,
  tokenize,
  unknownNote,
  whySummary,
  type GapEvidence,
  type GapTarget,
  type OrderedGapKind,
} from './decision-gap';

/*
 * =========================================================
 * SEARCH & AI DECISION GAP INTELLIGENCE 1.0 (Phase 38).
 *
 * Explains WHY WE ARE NOT WINNING using observed
 * evidence only: cached SERP snapshots (never a fresh
 * provider call), crawl pages, rank observations, AI
 * visibility checks, existing actions/work/outcomes.
 *
 * No scores, no forecasting, no invented authority,
 * no inferred recommendations, no semantic-
 * completeness claims. Unknowns stay unknown.
 * Composition only — zero migrations.
 * =========================================================
 */

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

export interface ObservedGap {
  kind: string;
  orderKind: OrderedGapKind;
  fingerprint: string;
  title: string;
  evidence: string[];
  evidenceState: GapEvidence;
  unknown: string[];
  nextDecision: string;
}

@Injectable()
export class DecisionGapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly serpCache: KeywordCacheService,
    private readonly rankIntel: RankIntelligenceService,
    private readonly plans: GrowthDecisionService,
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

  /* ============ targets (lightweight cards) ============ */

  async targets(
    organizationId: string,
    websiteId: string,
  ) {
    await this.website(organizationId, websiteId);
    let rows: Array<any> = [];
    try {
      const list = (await this.rankIntel.listTracked(
        organizationId,
        websiteId,
        { isActive: true, pageNum: 1, pageSize: MAX_TARGETS },
      )) as any;
      rows = list?.keywords ?? [];
    } catch {
      rows = [];
    }
    return {
      websiteId,
      targets: rows.map((r: any) => ({
        fingerprint: gapFingerprint({
          organizationId,
          websiteId,
          targetType: 'GOOGLE_QUERY',
          target: String(r.keyword ?? ''),
        }),
        targetType: 'GOOGLE_QUERY' as GapTarget,
        target: String(r.keyword ?? ''),
        page: r.lastRankingUrl ?? r.targetUrl ?? null,
        position: r.lastPosition ?? null,
        device: r.device,
        country: r.country,
        note: 'Target card — full gap analysis on open. Nothing scored.',
      })),
    };
  }

  /* ============ GOOGLE_QUERY analysis ============ */

  async analyzeQuery(
    organizationId: string,
    websiteId: string,
    input: {
      query: string;
      country?: string;
      language?: string;
      page?: string;
    },
  ) {
    const site = await this.website(
      organizationId,
      websiteId,
    );
    const query = clean(input.query);
    if (!query) {
      throw new NotFoundException('Query is required');
    }
    const country = clean(input.country).toUpperCase() || 'US';
    const language = clean(input.language).toLowerCase() || 'en';
    const ownHost = hostOf(site.url);
    const fingerprint = gapFingerprint({
      organizationId,
      websiteId,
      targetType: 'GOOGLE_QUERY',
      target: `${query}|${country}`,
    });

    /* Cached SERP only — zero provider consumption. */
    let serp: any = null;
    let serpAt: string | null = null;
    try {
      const cached = await this.serpCache.peek<any>(
        'DATAFORSEO',
        'serp',
        country,
        language,
        query,
      );
      if (cached) {
        serp = cached.value;
        serpAt = cached.fetchedAt;
      }
    } catch {
      serp = null;
    }
    const results: Array<any> = Array.isArray(serp?.results)
      ? serp.results
          .filter((r: any) => r?.isOrganic !== false)
          .slice(0, MAX_SERP_RESULTS)
      : [];
    const ownResult =
      ownHost !== null
        ? (results.find((r: any) => {
            const domain = clean(r.domain)
              .toLowerCase()
              .replace(/^www\./, '');
            return (
              domain === ownHost ||
              domain.endsWith(`.${ownHost}`)
            );
          }) ?? null)
        : null;
    const competitors = results
      .filter((r: any) => r !== ownResult)
      .slice(0, MAX_COMPETITORS);

    /* Tracked rank for this query (our observation). */
    let tracked: any = null;
    try {
      const list = (await this.rankIntel.listTracked(
        organizationId,
        websiteId,
        { search: query, pageNum: 1, pageSize: 5 },
      )) as any;
      tracked =
        (list?.keywords ?? []).find(
          (k: any) =>
            normKey(k.normalizedKeyword ?? k.keyword) ===
            normKey(query),
        ) ?? null;
    } catch {
      tracked = null;
    }
    const ourUrl =
      clean(input.page) ||
      clean(ownResult?.url) ||
      clean(tracked?.lastRankingUrl) ||
      null;

    /* Crawl page for our URL (observed content). */
    const crawlPage = ourUrl
      ? await this.crawlPageFor(websiteId, ourUrl).catch(
          () => null,
        )
      : null;

    const gaps: ObservedGap[] = [];
    const push = (
      kind: string,
      orderKind: OrderedGapKind,
      title: string,
      evidence: string[],
      evidenceState: GapEvidence,
      unknown: string[] = [],
    ) => {
      gaps.push({
        kind,
        orderKind,
        fingerprint: gapFingerprint({
          organizationId,
          websiteId,
          targetType: `GAP:${kind}`,
          target: `${query}|${ourUrl ?? ''}`,
        }),
        title,
        evidence: evidence.slice(0, 6),
        evidenceState,
        unknown,
        nextDecision: nextDecisionForGap(orderKind),
      });
    };

    /* 1. Intent. */
    const intent = inferIntent(query);
    const ourAngle = pageAngle(
      `${clean(ownResult?.title)} ${clean(ownResult?.snippet)} ${((crawlPage as any)?.h1 ?? []).join(' ')}`,
    );
    const intentRes = intentMismatch({
      queryIntent: intent,
      pageAngle: ourAngle,
    });
    if (intentRes.mismatch) {
      push(
        'INTENT_MISMATCH',
        'INTENT_MISMATCH',
        'Query intent does not match our page angle',
        [
          intentRes.note,
          `Query intent observed as ${intent} from query wording.`,
          `Our page reads ${ourAngle} from observed title/snippet/headings.`,
        ],
        'OBSERVED',
        [
          'No authoritative evidence that intent mismatch alone caused the ranking difference.',
        ],
      );
    }

    /* 2. SERP format. */
    const formats = results.map((r: any) =>
      serpFormatOf(r.title, r.snippet, r.resultType),
    );
    const dominant = dominantFormat(formats);
    const ours = ownResult
      ? serpFormatOf(
          ownResult.title,
          ownResult.snippet,
          ownResult.resultType,
        )
      : 'UNKNOWN';
    const fmtRes = serpFormatMismatch({
      dominant,
      ours,
      observedCount: formats.filter((f) => f === dominant).length,
      totalCount: formats.filter((f) => f !== 'UNKNOWN').length,
    });
    if (fmtRes.mismatch && results.length > 0) {
      push(
        'SERP_FORMAT_MISMATCH',
        'SERP_FORMAT_MISMATCH',
        'SERP format differs from our page format',
        [
          fmtRes.note,
          serpAt
            ? `Cached SERP snapshot from ${serpAt} — no fresh provider call.`
            : 'SERP snapshot provenance unavailable.',
        ],
        serpAt ? 'OBSERVED' : 'SUPPORTED',
        [
          'Format fit is observed correlation, never a proven ranking factor by itself.',
        ],
      );
    }

    /* 3. Content coverage. */
    const compTokens = competitors.map((r: any) =>
      tokenize(`${clean(r.title)} ${clean(r.snippet)}`),
    );
    const ourTokens = tokenize(
      `${clean(ownResult?.title)} ${clean(ownResult?.snippet)} ${((crawlPage as any)?.h1 ?? []).join(' ')} ${((crawlPage as any)?.h2 ?? []).join(' ')}`,
    );
    if (compTokens.length > 0 && ourTokens.length > 0) {
      const cov = coverageGap({
        competitorTokens: compTokens,
        ourTokens,
        minCompetitors: 2,
      });
      if (cov.missing.length > 0) {
        push(
          'TOPIC_COVERAGE_GAP',
          'TOPIC_GAP',
          'Competitor pages cover terms ours does not',
          [cov.note],
          'SUPPORTED',
          ['Term overlap only — never semantic completeness.'],
        );
      }
    }

    /* 4. Buyer criteria. */
    const buyer = buyerCriteriaGap({
      query,
      competitorTexts: competitors.map(
        (r: any) => `${clean(r.title)} ${clean(r.snippet)}`,
      ),
      ourText: ownResult
        ? `${clean(ownResult.title)} ${clean(ownResult.snippet)}`
        : null,
    });
    if (buyer.gap) {
      push(
        'BUYER_CRITERIA_GAP',
        'NEED_BUYER_GAP',
        'Observed buyer criteria missing from our page',
        [
          buyer.note,
          `Query: “${query}” (${intent} intent).`,
        ],
        'SUPPORTED',
        ['Criteria from observed text; commercial weight not measured.'],
      );
    }

    /* 5. Title / meta / headings. */
    const queryTerms = tokenize(query).slice(0, 6);
    const titleTerms = new Set(
      tokenize(clean(ownResult?.title) || clean((crawlPage as any)?.title)),
    );
    const missingTitle = queryTerms.filter(
      (t) => !titleTerms.has(t),
    );
    if (ownResult && missingTitle.length >= 2) {
      push(
        'TITLE_GAP',
        'TOPIC_GAP',
        'Title lacks core query terms competitors carry',
        [
          `Our title: “${clean(ownResult.title).slice(0, 120)}”.`,
          `Missing observed terms: ${missingTitle.slice(0, 5).join(', ')}.`,
        ],
        'OBSERVED',
      );
    }
    const h1 = ((crawlPage as any)?.h1 ?? []) as string[];
    if (crawlPage && h1.length === 0) {
      push(
        'HEADING_GAP',
        'TOPIC_GAP',
        'No H1 observed on our page',
        ['Crawl observed zero H1 headings.'],
        'OBSERVED',
      );
    }
    const wordCount = Number((crawlPage as any)?.wordCount ?? 0);
    const compDepths = competitors
      .map(() => 0)
      .filter(() => false);
    void compDepths;
    if (
      crawlPage &&
      wordCount > 0 &&
      wordCount < 300
    ) {
      push(
        'CONTENT_DEPTH_DIFFERENCE',
        'TOPIC_GAP',
        'Our page is thin versus the topic',
        [
          `Observed word count ${wordCount} on our page (crawl). Competitor depth from snippets only — page-level depth unknown.`,
        ],
        'SUPPORTED',
        ['Depth alone never proves a ranking cause.'],
      );
    }

    /* 6. Technical (crawl-observed only). */
    if (crawlPage) {
      const cp = crawlPage as any;
      const canonicalAbs = clean(cp.canonicalAbsolute || cp.canonical);
      for (const t of technicalGaps({
        indexable:
          cp.robotsIndexable === null ||
          cp.robotsIndexable === undefined
            ? null
            : Boolean(cp.robotsIndexable),
        canonicalOk:
          canonicalAbs === ''
            ? null
            : normKey(canonicalAbs) === normKey(cp.finalUrl || ourUrl),
        robotsOk:
          cp.robotsIndexable === null ||
          cp.robotsIndexable === undefined
            ? null
            : Boolean(cp.robotsIndexable),
        structuredData:
          cp.structuredDataCount === null ||
          cp.structuredDataCount === undefined
            ? null
            : Number(cp.structuredDataCount) > 0,
        crawlable:
          cp.statusCode === null || cp.statusCode === undefined
            ? null
            : Number(cp.statusCode) < 400,
      })) {
        push(t.kind, 'TECHNICAL_BLOCKER', t.kind.replace(/_/g, ' '), [t.note], 'OBSERVED');
      }
      /* Internal links. */
      const internalLinks = Number(cp.internalLinks ?? NaN);
      if (Number.isFinite(internalLinks) && internalLinks === 0) {
        push(
          'INTERNAL_LINK_SUPPORT_GAP',
          'INTERNAL_LINK_GAP',
          'No internal links observed to our page',
          [
            `Crawl observed ${internalLinks} internal links (count only).`,
          ],
          'OBSERVED',
          ['Link quality and anchor relevance unknown.'],
        );
      }
    }

    /* 7. Authority (observed page-strength only). */
    const strengths = competitors
      .map((r: any) => ({
        domain: clean(r.domain),
        domainRank:
          r.domainRank === null || r.domainRank === undefined
            ? null
            : Number(r.domainRank),
      }))
      .filter((s) => s.domainRank !== null);
    const ownStrength =
      ownResult?.domainRank === null ||
      ownResult?.domainRank === undefined
        ? null
        : Number(ownResult.domainRank);
    if (strengths.length > 0 && ownStrength !== null) {
      const best = Math.min(
        ...strengths.map((s) => s.domainRank as number),
      );
      if (best < ownStrength) {
        const leader = strengths.find(
          (s) => s.domainRank === best,
        );
        push(
          'PAGE_STRENGTH_DIFFERENCE',
          'COMPETITIVE_DIFFERENCE',
          'Observed authority difference',
          [
            authorityNote({
              ours: ownStrength,
              competitor: best,
              metric: 'provider domain rank (lower is stronger)',
              lowerIsStronger: true,
            }),
            `Strongest observed competitor: ${leader?.domain}.`,
          ],
          'SUPPORTED',
          ['Authority is one observed signal among many — never the sole cause.'],
        );
      }
    }

    /* 8. Freshness / unique value: honest unknowns. */
    const unknowns = [
      unknownNote('Competitor page freshness (no observed dates)'),
      unknownNote(
        'Unique value (original data, first-party proof — no evidence collected)',
      ),
      results.length === 0
        ? 'No cached SERP snapshot — SERP-dependent gaps unevaluable without a fresh fetch (not performed: no new provider consumption).'
        : null,
      ownResult === null
        ? 'Our page absent from the observed SERP snapshot — position-side gaps unevaluable.'
        : null,
      crawlPage === null
        ? 'No crawl snapshot for our page — content/technical gaps limited to SERP-visible signals.'
        : null,
      strengths.length === 0 || ownStrength === null
        ? unknownNote('Backlink/authority evidence (page-strength enrichment unavailable)')
        : null,
    ].filter(Boolean) as string[];

    /* 9. Conflicts (GSC vs tracked when both present). */
    const conflicts: string[] = [];
    try {
      const detail = tracked
        ? await this.rankIntel
            .getTracked(
              organizationId,
              websiteId,
              clean(tracked.id),
            )
            .catch(() => null)
        : null;
      const gsc = (detail as any)?.gscPosition;
      const cur = (detail as any)?.current;
      if (
        gsc !== null &&
        gsc !== undefined &&
        cur !== null &&
        cur !== undefined &&
        Math.abs(Number(gsc) - Number(cur)) >= 5
      ) {
        conflicts.push(
          `CONFLICTING_EVIDENCE: GSC POSITION ${gsc} but TRACKED POSITION ${cur} — different measurement contexts, neither chosen silently.`,
        );
      }
    } catch {
      /* conflict check best-effort */
    }

    const ordered = orderGaps(
      gaps.map((g) => ({
        kind: g.orderKind,
        fingerprint: g.fingerprint,
      })),
    );
    const orderIndex = new Map(
      ordered.map((o, i) => [o.fingerprint, i]),
    );
    const top = [...gaps]
      .sort(
        (a, b) =>
          (orderIndex.get(a.fingerprint) ?? 99) -
          (orderIndex.get(b.fingerprint) ?? 99),
      )
      .slice(0, MAX_GAPS);

    const summary = whySummary({
      primary: top[0]
        ? `${top[0].kind.replace(/_/g, ' ')} — ${top[0].title}`
        : 'No observed gap with supporting evidence',
      supporting: top.flatMap((g) => g.evidence.slice(0, 2)),
      unknown: unknowns.slice(0, 4),
      nextInvestigation:
        top[0]?.kind === 'INTENT_MISMATCH'
          ? 'Compare buyer-criteria coverage.'
          : top[0]?.kind === 'SERP_FORMAT_MISMATCH'
            ? 'Compare page format against the dominant observed format.'
            : 'Deepen the top observed gap with page-level evidence.',
      existingAction: null,
    });

    /* Existing action/work/outcome links. */
    const linked = await this.linkExisting(
      organizationId,
      websiteId,
      query,
      ourUrl,
    );

    return {
      fingerprint,
      targetType: 'GOOGLE_QUERY' as GapTarget,
      target: query,
      page: ourUrl,
      position: tracked?.lastPosition ?? ownResult?.position ?? null,
      positionSource:
        tracked?.lastPosition !== null &&
        tracked?.lastPosition !== undefined
          ? 'TRACKED POSITION'
          : ownResult?.position !== null &&
              ownResult?.position !== undefined
            ? 'OBSERVED SERP POSITION (cached snapshot)'
            : 'UNKNOWN',
      intent,
      ourAngle,
      dominantFormat: dominant,
      ourFormat: ours,
      competitors: competitors.map((r: any) => ({
        domain: clean(r.domain),
        url: clean(r.url),
        title: clean(r.title).slice(0, 140),
        position: r.position ?? null,
        resultType: clean(r.resultType) || null,
      })),
      gaps: top,
      gapCount: gaps.length,
      unknowns,
      conflicts,
      summary,
      buyerCriteria: buyer.observed,
      customerNeed: {
        query,
        intent,
        coverage: buyer.gap
          ? 'PARTIAL — observed criteria missing'
          : 'No observed gap',
      },
      technical: crawlPage
        ? {
            title: clean((crawlPage as any).title) || null,
            h1: ((crawlPage as any).h1 ?? []) as string[],
            wordCount: Number(
              (crawlPage as any).wordCount ?? 0,
            ),
            canonical: clean((crawlPage as any).canonical) || null,
            structuredData: Number(
              (crawlPage as any).structuredDataCount ?? 0,
            ),
            internalLinks: Number(
              (crawlPage as any).internalLinks ?? 0,
            ),
          }
        : null,
      nextDecision:
        top[0]?.nextDecision ?? 'INVESTIGATE',
      linked,
      evidenceNote:
        'All gaps from observed snapshots (cached SERP, crawl, rank, checks). No fresh provider calls, no invented authority, no causal claims.',
    };
  }

  /* ============ AI_PROMPT analysis ============ */

  async analyzeAi(
    organizationId: string,
    websiteId: string,
    input: { prompt: string },
  ) {
    await this.website(organizationId, websiteId);
    const prompt = clean(input.prompt);
    if (!prompt) throw new NotFoundException('Prompt is required');
    const fingerprint = gapFingerprint({
      organizationId,
      websiteId,
      targetType: 'AI_PROMPT',
      target: prompt,
    });
    const db = this.prisma as unknown as Record<string, any>;
    let checks: Array<any> = [];
    try {
      checks =
        (await db.aiVisibilityCheck?.findMany({
          where: {
            websiteId,
            query: { contains: prompt, mode: 'insensitive' },
          },
          orderBy: { checkedAt: 'desc' },
          take: 20,
        })) ?? [];
    } catch {
      checks = [];
    }
    const completed = checks.filter(
      (c) => clean(c.status).toUpperCase() === 'COMPLETED',
    );
    const ourMentioned = completed.some((c) => c.mentioned === true);
    const ourCited = completed.some(
      (c) => c.citationFound === true,
    );
    const citedUrls = [
      ...new Set(
        completed
          .map((c) => clean(c.citationUrl))
          .filter(Boolean),
      ),
    ];
    const competitorNames = [
      ...new Set(
        completed.flatMap((c) =>
          Array.isArray(c.competitorNames)
            ? c.competitorNames.map((n: unknown) => clean(n)).filter(Boolean)
            : [],
        ),
      ),
    ];
    const state = aiGapState({
      ourMentioned: completed.length > 0 ? ourMentioned : null,
      ourCited: completed.length > 0 ? ourCited : null,
      competitorCited:
        competitorNames.length > 0 ? true : null,
      competitorRecommended: null,
      providerSupports: completed.length > 0,
      conflicting: false,
    });
    /* Source gap from cited URLs. */
    const thirdParty = citedUrls.filter((u) => {
      const host = hostOf(u);
      return host !== null;
    });
    const gaps: ObservedGap[] = [];
    if (state === 'NOT_MENTIONED' && completed.length > 0) {
      gaps.push({
        kind: 'NOT_MENTIONED',
        orderKind: 'NEED_BUYER_GAP',
        fingerprint: gapFingerprint({
          organizationId,
          websiteId,
          targetType: 'GAP:AI_NOT_MENTIONED',
          target: prompt,
        }),
        title: 'Brand not mentioned for this prompt',
        evidence: [
          `NOT_MENTIONED across ${completed.length} observed check(s).`,
          competitorNames.length > 0
            ? `Competitors observed: ${competitorNames.slice(0, 5).join(', ')}.`
            : 'No competitor names recorded in checks.',
        ],
        evidenceState: 'OBSERVED',
        unknown: [
          'AI recommendation state: RECOMMENDATION_UNKNOWN — never inferred.',
          'Prompt demand volume: unknown.',
        ],
        nextDecision: 'INVESTIGATE',
      });
    }
    if (
      state === 'CITED' ||
      (ourCited && competitorNames.length > 0)
    ) {
      gaps.push({
        kind: 'CITATION_PRESENT',
        orderKind: 'COMPETITIVE_DIFFERENCE',
        fingerprint: gapFingerprint({
          organizationId,
          websiteId,
          targetType: 'GAP:AI_CITED',
          target: prompt,
        }),
        title: 'Cited without recommendation evidence',
        evidence: [
          `CITATION_PRESENT on ${citedUrls.length} observed page(s).`,
          'Recommendation state stays RECOMMENDATION_UNKNOWN.',
        ],
        evidenceState: 'OBSERVED',
        unknown: [
          'Whether any engine recommends us: unknown.',
          'Citation-to-traffic linkage: see Phase 33 (separate edge).',
        ],
        nextDecision: 'STRENGTHEN',
      });
    }
    if (
      competitorNames.length > 0 &&
      !ourCited
    ) {
      gaps.push({
        kind: 'COMPETITOR_CITATION_ADVANTAGE',
        orderKind: 'COMPETITIVE_DIFFERENCE',
        fingerprint: gapFingerprint({
          organizationId,
          websiteId,
          targetType: 'GAP:AI_COMPETITOR',
          target: prompt,
        }),
        title: 'Competitor citation advantage',
        evidence: [
          `Competitors observed in checks: ${competitorNames.slice(0, 5).join(', ')}.`,
          sourceGapNote({
            ourSources: citedUrls.length,
            competitorSources: competitorNames.length,
            competitorLabel: 'Observed competitors',
          }),
        ],
        evidenceState: 'SUPPORTED',
        unknown: ['Source authority: no invented scores.'],
        nextDecision: 'INVESTIGATE',
      });
    }
    /* Buyer criteria from prompt + check responses. */
    const buyer = buyerCriteriaGap({
      query: prompt,
      competitorTexts: completed
        .map((c) => clean(c.response))
        .filter(Boolean)
        .slice(0, 5),
      ourText: null,
    });
    const linked = await this.linkExisting(
      organizationId,
      websiteId,
      prompt,
      null,
    );
    const ordered = orderGaps(
      gaps.map((g) => ({
        kind: g.orderKind,
        fingerprint: g.fingerprint,
      })),
    );
    const orderIndex = new Map(
      ordered.map((o, i) => [o.fingerprint, i]),
    );
    const top = [...gaps]
      .sort(
        (a, b) =>
          (orderIndex.get(a.fingerprint) ?? 99) -
          (orderIndex.get(b.fingerprint) ?? 99),
      )
      .slice(0, MAX_GAPS);
    return {
      fingerprint,
      targetType: 'AI_PROMPT' as GapTarget,
      target: prompt,
      state,
      recommendation: recommendationState(),
      checksObserved: completed.length,
      citedUrls: citedUrls.slice(0, 10),
      competitorNames: competitorNames.slice(0, 10),
      buyerCriteria: buyer.observed,
      gaps: top,
      gapCount: gaps.length,
      unknowns: [
        completed.length === 0
          ? 'No AI checks observed for this prompt — AI states UNKNOWN.'
          : null,
        'AI recommendation: RECOMMENDATION_UNKNOWN always.',
        'Prompt demand: unknown.',
      ].filter(Boolean) as string[],
      conflicts: [],
      summary: whySummary({
        primary:
          top[0]?.title ?? 'No observed AI gap with supporting evidence',
        supporting: top.flatMap((g) => g.evidence.slice(0, 2)),
        unknown: ['Recommendation evidence absent by design.'],
        nextInvestigation:
          'Compare cited competitor sources and buyer-criteria coverage.',
        existingAction: null,
      }),
      nextDecision: top[0]?.nextDecision ?? 'INVESTIGATE',
      linked,
      evidenceNote:
        'AI states from observed checks only. Citation is never recommendation.',
    };
  }

  /* ============ PAGE / TOPIC / NEED / COMPARISON ============ */

  async analyzeGeneral(
    organizationId: string,
    websiteId: string,
    input: {
      type: string;
      target: string;
      competitor?: string;
    },
  ) {
    const type = clean(input.type).toUpperCase();
    const target = clean(input.target);
    if (!target) throw new NotFoundException('Target is required');
    if (type === 'AI_PROMPT') {
      return this.analyzeAi(organizationId, websiteId, {
        prompt: target,
      });
    }
    if (type === 'PAGE') {
      /* Find the strongest tracked query for this URL,
       * then analyze as GOOGLE_QUERY anchored there. */
      let keyword: string | null = null;
      try {
        const rows = await this.prisma.rankObservation.findMany(
          {
            where: {
              organizationId,
              websiteId,
              url: target,
              position: { not: null },
            },
            orderBy: { position: 'asc' },
            take: 1,
          },
        );
        keyword = rows[0] ? clean((rows[0] as any).keyword) : null;
      } catch {
        keyword = null;
      }
      if (!keyword) {
        return {
          fingerprint: gapFingerprint({
            organizationId,
            websiteId,
            targetType: 'PAGE',
            target,
          }),
          targetType: 'PAGE' as GapTarget,
          target,
          gaps: [],
          gapCount: 0,
          unknowns: [
            'No tracked query observed for this page — query-side gaps unevaluable.',
          ],
          conflicts: [],
          summary: whySummary({
            primary: 'No observed query linkage for this page',
            supporting: [],
            unknown: ['Tracked ranking for this URL: none observed.'],
            nextInvestigation:
              'Track a target query for this page, then re-analyze.',
            existingAction: null,
          }),
          nextDecision: 'INVESTIGATE',
          linked: await this.linkExisting(
            organizationId,
            websiteId,
            null,
            target,
          ),
          evidenceNote: 'Page analysis without invented query linkage.',
        };
      }
      const result = await this.analyzeQuery(
        organizationId,
        websiteId,
        { query: keyword, page: target },
      );
      return { ...result, targetType: 'PAGE' as GapTarget, target };
    }
    /* TOPIC / CUSTOMER_NEED / COMPETITOR_COMPARISON:
     * analyze the label as a query with provenance. */
    const result = await this.analyzeQuery(
      organizationId,
      websiteId,
      { query: target },
    );
    return {
      ...result,
      targetType: (['TOPIC', 'CUSTOMER_NEED', 'COMPETITOR_COMPARISON'].includes(type)
        ? type
        : 'GOOGLE_QUERY') as GapTarget,
      target,
      provenanceNote:
        type === 'CUSTOMER_NEED'
          ? 'INFERRED CUSTOMER NEED — need label analyzed as query text.'
          : type === 'COMPETITOR_COMPARISON' && input.competitor
            ? `Competitor focus: ${clean(input.competitor)} (observed results filtered where present).`
            : null,
    };
  }

  /* ============ shared helpers ============ */

  private async crawlPageFor(
    websiteId: string,
    url: string,
  ): Promise<unknown> {
    const db = this.prisma as unknown as Record<string, any>;
    try {
      const crawls = await db.crawl?.findMany({
        where: { websiteId },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: { id: true },
      });
      if (!crawls || crawls.length === 0) return null;
      for (const crawl of crawls) {
        const page = await db.crawlPage?.findFirst({
          where: {
            crawlId: crawl.id,
            OR: [{ url }, { finalUrl: url }],
          },
          include: {
            issues: {
              where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
              take: 10,
            },
          },
        });
        if (page) return page;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async linkExisting(
    organizationId: string,
    websiteId: string,
    keyword: string | null,
    page: string | null,
  ) {
    const nk = normKey(keyword);
    const np = normKey(page);
    let actions: Array<any> = [];
    try {
      actions = await this.prisma.action.findMany({
        where: {
          organizationId,
          websiteId,
          status: { in: ['TODO', 'IN_PROGRESS', 'DONE'] },
        },
        orderBy: { updatedAt: 'desc' },
        take: MAX_ACTIONS,
      });
    } catch {
      actions = [];
    }
    const match = (actions as Array<any>).find((a) => {
      const meta = ((a as any).metadata ?? {}) as Record<
        string,
        unknown
      >;
      const ak = normKey(
        meta.strategyKeyword ?? meta.keyword ?? meta.query ?? a.title,
      );
      const ap = normKey(
        meta.targetPage ?? meta.pageUrl ?? a.url,
      );
      return (
        (nk !== '' &&
          ak !== '' &&
          (ak.includes(nk) || nk.includes(ak))) ||
        (np !== '' && ap !== '' && ap === np)
      );
    });
    if (!match) {
      return {
        recommendation: null,
        action: null,
        work: null,
        outcome: null,
        note: 'NEXT_STEP_AVAILABLE — no existing action; nothing auto-created.',
      };
    }
    /* Work + outcome linkage (bounded, best-effort). */
    let workItem: unknown = null;
    let outcome: unknown = null;
    try {
      workItem = await this.work.detail(
        organizationId,
        websiteId,
        clean(match.id),
      );
    } catch {
      workItem = null;
    }
    if (clean(match.status).toUpperCase() === 'DONE') {
      try {
        outcome = await this.outcomes.outcomeFor(
          organizationId,
          websiteId,
          clean(match.id),
          28,
        );
      } catch {
        outcome = null;
      }
    }
    let recommendation: unknown = null;
    if (match.recommendationId) {
      try {
        recommendation =
          await this.prisma.recommendation.findFirst({
            where: {
              id: match.recommendationId,
              organizationId,
            },
          });
      } catch {
        recommendation = null;
      }
    }
    return {
      recommendation: recommendation
        ? {
            id: (recommendation as any).id,
            title: (recommendation as any).title,
            status: (recommendation as any).status,
          }
        : null,
      action: {
        id: match.id,
        title: match.title,
        status: match.status,
      },
      work: workItem
        ? {
            status: (workItem as any).status,
            section: (workItem as any).section,
          }
        : null,
      outcome: outcome
        ? {
            signal: (outcome as any).signal,
            nextDecision: (outcome as any).nextDecision,
          }
        : null,
      note: 'Existing work reused — WORK_ALREADY_AVAILABLE where present; outcome from Phase 37 where measured.',
    };
  }
}

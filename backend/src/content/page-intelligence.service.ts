import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { GoogleService } from '../google/google.service';
import { KeywordStrategyService } from '../keywords/keyword-strategy.service';
import { ContentStrategyService } from '../keywords/content-strategy.service';
import { RankTrackingService } from '../keywords/rank-tracking.service';
import { EvidenceFusionService } from '../keywords/evidence-fusion.service';
import { BacklinksService } from '../backlinks/backlinks.service';
import {
  aiCitationState,
  authorityRow,
  citationWorthiness,
  composeContentEvidence,
  contentGap,
  decayDiagnosis,
  decayStatement,
  diagnoseWeaknesses,
  entityConsistency,
  entitySignal,
  freshnessState,
  intentCoverageRow,
  internalSupportState,
  orderGapsByPrecedence,
  pageDecision,
  topicCoverageRow,
  weaknessStatement,
  type ContentGap,
  type IntentCoverageRow,
  type TopicCoverageRow,
} from './page-intelligence';

/*
 * =========================================================
 * PAGE INTELLIGENCE 2.0 (Phase 14) — unified content +
 * entity + authority composition for one page.
 *
 * ONE bounded read wave over existing systems: latest
 * crawl page facts, internal-link graph counts, orphan
 * intelligence, strategy opportunities/clusters, rank
 * history, GSC page rows, AI citation checks,
 * competitor crawls, BusinessBrain, backlink records,
 * leads/revenue linkage, content items/briefs/drafts,
 * fusion NBA. Read-only: no provider calls, no AI
 * credits, no new scores, no new persistence.
 * Every leg degrades alone; missing stays
 * UNAVAILABLE (never zero, never estimated).
 * =========================================================
 */

const MAX_OPPS = 100;
const MAX_CHECKS = 100;
const MAX_LEADS = 200;
const MAX_BACKLINKS = 200;

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

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function windowEnd(days: 28): {
  startDate: string;
  endDate: string;
} {
  const end = new Date(
    Date.now() - 3 * 24 * 60 * 60 * 1000,
  );
  const start = new Date(
    end.getTime() - (days - 1) * 24 * 60 * 60 * 1000,
  );
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

@Injectable()
export class PageIntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleService,
    private readonly strategy: KeywordStrategyService,
    private readonly contentStrategy: ContentStrategyService,
    private readonly ranks: RankTrackingService,
    private readonly fusion: EvidenceFusionService,
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

  async getPageIntelligence(
    organizationId: string,
    websiteId: string,
    url: string,
  ) {
    const target = clean(url);
    if (!target) {
      throw new BadRequestException('url is required');
    }
    const targetKey = normPage(target);
    const website =
      await this.prisma.website.findFirst({
        where: {
          id: websiteId,
          organizationId,
          isActive: true,
        },
        select: { id: true, name: true, url: true },
      });
    if (!website)
      throw new NotFoundException('Website not found');

    const matchPage = (value: unknown): boolean =>
      normPage(value) === targetKey;

    const window = windowEnd(28);

    const [
      crawlRes,
      strategyRes,
      rankRes,
      gscRes,
      checksRes,
      competitorsRes,
      brainRes,
      backlinkRes,
      leadsRes,
      revenueRes,
      contentRes,
      orphansRes,
      nbaRes,
    ] = await Promise.all([
      /* Latest completed crawl + matching page. */
      this.settled(async () => {
        const crawl =
          await this.prisma.crawl.findFirst({
            where: { websiteId, status: 'COMPLETED' },
            orderBy: { completedAt: 'desc' },
          });
        if (!crawl) return null;
        const pages =
          await this.prisma.crawlPage.findMany({
            where: { crawlId: crawl.id },
            take: 2000,
          });
        const match =
          pages.find((row) => matchPage(row.url)) ??
          pages.find((row) =>
            matchPage(row.finalUrl),
          ) ??
          null;
        let inbound = 0;
        let anchors: string[] = [];
        let graphAvailable = false;
        try {
          inbound = await this.prisma.crawlLink.count(
            {
              where: {
                crawlId: crawl.id,
                targetUrl: match?.url ?? target,
              },
            },
          );
          const edges =
            await this.prisma.crawlLink.findMany({
              where: {
                crawlId: crawl.id,
                targetUrl: match?.url ?? target,
              },
              select: {
                anchorText: true,
                sourceUrl: true,
              },
              take: 10,
            });
          anchors = edges
            .map((edge) => clean(edge.anchorText))
            .filter(Boolean)
            .slice(0, 10);
          graphAvailable = true;
        } catch {
          graphAvailable = false;
        }
        return {
          crawl,
          page: match,
          pageCount: pages.length,
          inbound,
          anchors,
          graphAvailable,
        };
      }),
      this.settled(() =>
        this.strategy.strategy(organizationId, {
          websiteId,
          limit: 100,
        }),
      ),
      this.settled(() =>
        this.ranks.getHistory(organizationId, websiteId, {
          page: target,
          days: 90,
          pageNum: 1,
          pageSize: 100,
        }),
      ),
      this.settled(() =>
        this.google.getQueryPages(
          organizationId,
          window.startDate,
          window.endDate,
        ),
      ),
      this.settled(() =>
        this.prisma.aiVisibilityCheck.findMany({
          where: {
            websiteId,
            status: 'COMPLETED',
          },
          orderBy: { checkedAt: 'desc' },
          take: MAX_CHECKS,
        }),
      ),
      this.settled(() =>
        this.prisma.competitor.findMany({
          where: {
            organizationId,
            websiteId,
            isActive: true,
          },
          take: 5,
        }),
      ),
      this.settled(() =>
        this.prisma.businessBrain.findUnique({
          where: { websiteId },
        }),
      ),
      this.settled(async () => {
        const [overview, links] = await Promise.all([
          this.settled(() =>
            this.backlinks.getOverview(
              organizationId,
              websiteId,
            ),
          ),
          this.prisma.backlink.findMany({
            where: { websiteId, status: 'ACTIVE' },
            select: {
              targetUrl: true,
              sourceDomain: true,
              linkType: true,
              domainAuthority: true,
            },
            take: MAX_BACKLINKS,
          }),
        ]);
        return { overview, links };
      }),
      this.settled(() =>
        this.prisma.lead.findMany({
          where: { websiteId },
          orderBy: { createdAt: 'desc' },
          take: MAX_LEADS,
        }),
      ),
      this.settled(() =>
        this.prisma.revenue.findMany({
          where: {
            websiteId,
            status: 'RECOGNIZED',
          },
          orderBy: { recognizedAt: 'desc' },
          take: MAX_LEADS,
        }),
      ),
      this.settled(async () => {
        const items =
          await this.prisma.contentItem.findMany({
            where: { organizationId, websiteId },
            take: 200,
          });
        const matched = items.filter(
          (item) =>
            matchPage(item.pageUrl) ||
            clean(item.pageUrl) === '',
        );
        return { items: matched.slice(0, 20) };
      }),
      this.settled(() =>
        this.contentStrategy.getOrphanIntelligence(
          organizationId,
          websiteId,
          { limit: 20 },
        ),
      ),
      this.settled(() =>
        this.fusion.getNextBestAction(
          organizationId,
          websiteId,
        ),
      ),
    ]);

    /* ============ CONTENT (crawl facts) ============ */
    const crawlPage = (
      crawlRes as {
        page?: Record<string, unknown> | null;
      } | null
    )?.page as Record<string, unknown> | null | undefined;
    const crawlMeta = (crawlRes ?? {}) as {
      crawl?: { completedAt?: unknown } | null;
      inbound?: number;
      anchors?: string[];
      graphAvailable?: boolean;
      pageCount?: number;
    };
    const content = composeContentEvidence({
      url: target,
      title: crawlPage?.title,
      metaDescription: crawlPage?.metaDescription,
      h1: crawlPage?.h1,
      h2: crawlPage?.h2,
      wordCount: crawlPage?.wordCount,
      hasBody:
        numOrNull(crawlPage?.wordCount) !== null &&
        (numOrNull(crawlPage?.wordCount) ?? 0) > 0,
      canonical:
        crawlPage?.canonicalAbsolute ??
        crawlPage?.canonical,
      indexable:
        typeof crawlPage?.robotsIndexable === 'boolean'
          ? (crawlPage.robotsIndexable as boolean)
          : null,
      statusCode: crawlPage?.statusCode,
      contentType: crawlPage?.contentType,
      structuredData:
        numOrNull(crawlPage?.structuredDataCount) !==
          null &&
        (numOrNull(crawlPage?.structuredDataCount) ??
          0) > 0
          ? true
          : crawlPage
            ? false
            : null,
      lastCrawledAt:
        clean(
          (crawlMeta.crawl as { completedAt?: unknown })
            ?.completedAt,
        ) || null,
    });
    const hasCrawlPage = !!crawlPage;

    /* ============ SEARCH (strategy + rank + GSC) ============ */
    const opps: Array<Record<string, unknown>> =
      ((strategyRes as { opportunities?: unknown } | null)
        ?.opportunities ?? []) as Array<
        Record<string, unknown>
      >;
    const pageOpps = opps
      .filter((opp) => matchPage(opp.targetPage))
      .slice(0, MAX_OPPS);
    const rankKeywords: Array<Record<string, unknown>> =
      ((rankRes as { keywords?: unknown } | null)
        ?.keywords ?? []) as Array<
        Record<string, unknown>
      >;
    let gscClicks = 0;
    let gscImpressions = 0;
    let gscQueries = 0;
    const gscRows: Array<Record<string, unknown>> =
      ((gscRes as { rows?: unknown } | null)?.rows ??
        []) as Array<Record<string, unknown>>;
    for (const row of gscRows) {
      if (!matchPage(row.page)) continue;
      gscClicks += numOrNull(row.clicks) ?? 0;
      gscImpressions += numOrNull(row.impressions) ?? 0;
      gscQueries += 1;
    }
    const rankedQueries = rankKeywords.filter(
      (row) => numOrNull(row.current) !== null,
    );
    const declinedQueries = rankKeywords.filter(
      (row) => row.movement === 'DECLINED',
    );

    /* Intent coverage from observed demand: GSC rows +
       strategy opps joined per intent. */
    const intentDemand = new Map<
      string,
      { observed: number; ranking: number }
    >();
    const bumpIntent = (
      intent: string,
      ranking: boolean,
    ) => {
      const key = clean(intent).toUpperCase() || 'UNKNOWN';
      const entry = intentDemand.get(key) ?? {
        observed: 0,
        ranking: 0,
      };
      entry.observed += 1;
      if (ranking) entry.ranking += 1;
      intentDemand.set(key, entry);
    };
    for (const opp of pageOpps) {
      bumpIntent(
        clean(opp.intent) || 'UNKNOWN',
        numOrNull(opp.position) !== null,
      );
    }
    for (const row of rankKeywords) {
      const opp = opps.find(
        (entry) =>
          clean(entry.keyword).toLowerCase() ===
          clean(row.keyword).toLowerCase(),
      );
      bumpIntent(
        clean(opp?.intent) || 'UNKNOWN',
        numOrNull(row.current) !== null,
      );
    }
    const intents: IntentCoverageRow[] = [
      ...intentDemand.entries(),
    ]
      .map(([intent, counts]) =>
        intentCoverageRow(
          intent,
          counts.observed,
          counts.ranking,
          true,
        ),
      )
      .sort((a, b) =>
        a.intent < b.intent ? -1 : 1,
      );
    const missingIntents = intents
      .filter((row) => row.coverage === 'MISSING')
      .map((row) => row.intent);

    /* Topic coverage from the same observed demand
     * (strategy mapping + rank history), grouped per
     * topic instead of per intent. Same
     * COVERED/PARTIAL/MISSING/UNAVAILABLE rule. */
    const topicDemand = new Map<
      string,
      { observed: number; ranking: number }
    >();
    const bumpTopic = (
      topic: string,
      ranking: boolean,
    ) => {
      const key =
        clean(topic) || '(untagged)';
      const entry = topicDemand.get(key) ?? {
        observed: 0,
        ranking: 0,
      };
      entry.observed += 1;
      if (ranking) entry.ranking += 1;
      topicDemand.set(key, entry);
    };
    for (const opp of pageOpps) {
      bumpTopic(
        clean(opp.topic),
        numOrNull(opp.position) !== null,
      );
    }
    for (const row of rankKeywords) {
      const opp = opps.find(
        (entry) =>
          clean(entry.keyword).toLowerCase() ===
          clean(row.keyword).toLowerCase(),
      );
      const topic = clean(opp?.topic);
      if (topic) {
        bumpTopic(
          topic,
          numOrNull(row.current) !== null,
        );
      }
    }
    const topics: TopicCoverageRow[] = [
      ...topicDemand.entries(),
    ]
      .map(([topic, counts]) =>
        topicCoverageRow(
          topic,
          counts.observed,
          counts.ranking,
          true,
        ),
      )
      .sort((a, b) =>
        a.topic < b.topic ? -1 : 1,
      )
      .slice(0, 20);

    /* ============ AI ============ */
    const checks: Array<Record<string, unknown>> =
      ((checksRes ?? []) as Array<
        Record<string, unknown>
      >).slice(0, MAX_CHECKS);
    const pageCitations = checks.filter(
      (check) =>
        check.citationFound === true &&
        matchPage(check.citationUrl),
    );
    const pageMentions = checks.filter(
      (check) =>
        check.mentioned === true &&
        clean(check.citationUrl) !== '' &&
        matchPage(check.citationUrl),
    );
    const rivalCitations = checks.filter(
      (check) =>
        check.citationFound === true &&
        !matchPage(check.citationUrl) &&
        Array.isArray(check.competitorNames) &&
        (check.competitorNames as unknown[]).length >
          0,
    );
    const citation = aiCitationState({
      hasAiObservations: checks.length > 0,
      renkooCited: pageCitations.length > 0,
      competitorCited: rivalCitations.length > 0,
    });

    /* ============ ENTITY ============ */
    const brain = (brainRes ?? {}) as {
      businessName?: unknown;
      products?: unknown;
      services?: unknown;
      primaryKeywords?: unknown;
    };
    const brainName = clean(brain.businessName);
    const entityTerms = [
      ...((Array.isArray(brain.products)
        ? brain.products
        : []) as unknown[]),
      ...((Array.isArray(brain.services)
        ? brain.services
        : []) as unknown[]),
      ...((Array.isArray(brain.primaryKeywords)
        ? brain.primaryKeywords
        : []) as unknown[]),
    ]
      .map((entry) => clean(entry).toLowerCase())
      .filter(Boolean);
    const pageText = [
      content.title ?? '',
      ...content.h1,
      ...content.h2,
      content.metaDescription ?? '',
    ]
      .join(' ')
      .toLowerCase();
    const namedInPage =
      hasCrawlPage &&
      entityTerms.some(
        (term) =>
          term.length > 2 && pageText.includes(term),
      );
    const topicTerms = pageOpps
      .map((opp) => clean(opp.topic).toLowerCase())
      .filter(Boolean);
    const topicallyRelated =
      hasCrawlPage &&
      entityTerms.some((term) =>
        topicTerms.some(
          (topic) =>
            topic.includes(term) || term.includes(topic),
        ),
      );
    const entity = entitySignal({
      hasBrainRecord: !!brainName || entityTerms.length > 0,
      namedInPage,
      topicallyRelated,
      hasObservedDemand:
        pageOpps.length > 0 || gscQueries > 0,
    });
    const siteIdentity =
      normPage(website.url)?.split('/')[0] ?? null;
    const consistency = entityConsistency({
      brainName: brainName || null,
      siteIdentity,
      pageMentionsBrain: hasCrawlPage ? namedInPage : null,
      hasStructuredData:
        content.structuredData === true
          ? true
          : content.structuredData === false
            ? false
            : null,
    });

    /* ============ FRESHNESS + DECAY ============ */
    const freshness = freshnessState(
      content.lastCrawledAt,
      new Date().toISOString(),
    );
    const decay = decayDiagnosis({
      rankDeclined:
        rankKeywords.length > 0
          ? declinedQueries.length >
            rankKeywords.length / 2
          : null,
      trafficDeclined: null,
      freshness: freshness.state,
      aiDeclined: null,
    });

    /* ============ INTERNAL ============ */
    const inbound = crawlMeta.inbound ?? 0;
    const graphAvailable =
      crawlMeta.graphAvailable === true;
    const orphanList: Array<Record<string, unknown>> =
      ((orphansRes as { orphans?: unknown } | null)
        ?.orphans ??
        (orphansRes as {
          candidates?: unknown;
        } | null)?.candidates ??
        []) as Array<Record<string, unknown>>;
    const orphanFlag = orphanList.some((row) =>
      matchPage(
        row.url ?? row.targetPage ?? row.page,
      ),
    );
    const internal = internalSupportState({
      graphAvailable,
      inboundLinks: graphAvailable ? inbound : null,
      orphanFlag,
    });

    /* ============ COMPETITORS ============ */
    const competitors: Array<Record<string, unknown>> =
      ((competitorsRes ?? []) as Array<
        Record<string, unknown>
      >).slice(0, 5);
    const competitorEvidence = rivalCitations
      .slice(0, 10)
      .map((check) => ({
        query: clean(check.query),
        citedUrl: clean(check.citationUrl),
        competitors: (
          (check.competitorNames ?? []) as unknown[]
        )
          .map((name) => clean(name))
          .filter(Boolean),
        evidenceState: 'OBSERVED' as const,
      }));
    const competitorCovers =
      competitorEvidence.length > 0;

    /* ============ EXTERNAL AUTHORITY ============ */
    const backlinkLinks: Array<
      Record<string, unknown>
    > =
      ((backlinkRes as { links?: unknown } | null)
        ?.links ?? []) as Array<
        Record<string, unknown>
      >;
    const pageBacklinks = backlinkLinks.filter((row) =>
      matchPage(row.targetUrl),
    );
    const overview = (backlinkRes as {
      overview?: Record<string, unknown> | null;
    } | null)?.overview as
      | Record<string, unknown>
      | null
      | undefined;
    const siteAuthority = numOrNull(
      (
        overview as {
          summary?: { authorityScore?: unknown };
        }
      )?.summary?.authorityScore,
    );

    /* ============ BUSINESS (Phase 13 reuse) ============ */
    const leads: Array<Record<string, unknown>> =
      ((leadsRes ?? []) as Array<
        Record<string, unknown>
      >).slice(0, MAX_LEADS);
    const pageLeads = leads.filter((lead) =>
      matchPage(lead.landingPage),
    );
    const pageLeadIds = new Set(
      pageLeads.map((lead) => clean(lead.id)),
    );
    const revenues: Array<Record<string, unknown>> =
      ((revenueRes ?? []) as Array<
        Record<string, unknown>
      >).slice(0, MAX_LEADS);
    const pageRevenue = revenues
      .filter((row) =>
        pageLeadIds.has(clean(row.leadId)),
      )
      .reduce(
        (sum, row) =>
          sum + (numOrNull(row.amount) ?? 0),
        0,
      );

    /* ============ CONTENT LIFECYCLE ============ */
    const items: Array<Record<string, unknown>> =
      ((contentRes as { items?: unknown } | null)
        ?.items ?? []) as Array<
        Record<string, unknown>
      >;

    /* ============ GAPS ============ */
    const gaps: ContentGap[] = [];
    if (content.indexable === false) {
      gaps.push(
        contentGap('INDEXABILITY_ISSUE', {
          page: target,
          reason:
            'Crawler observed the page as non-indexable — eligibility blocked before any content work.',
          evidenceState: 'OBSERVED',
          evidenceSources: ['latest crawl page facts'],
          existingActionKind: 'OPTIMIZE',
        }),
      );
    }
    for (const intent of missingIntents) {
      gaps.push(
        contentGap('MISSING_INTENT', {
          page: target,
          reason: `Observed ${intent.toLowerCase()} intent has no ranking coverage on this page.`,
          evidenceState: 'OBSERVED',
          evidenceSources: [
            'GSC page rows',
            'strategy mapping',
            'rank history',
          ],
          existingActionKind: 'IMPROVE',
        }),
      );
    }
    if (
      pageOpps.length === 0 &&
      gscQueries === 0 &&
      rankKeywords.length === 0
    ) {
      gaps.push(
        contentGap('MISSING_TOPIC_SUPPORT', {
          page: target,
          topic: null,
          reason:
            'No observed queries map to this page across strategy, GSC, or rank history.',
          evidenceState: 'OBSERVED',
          evidenceSources: [
            'strategy opportunities',
            'GSC page rows',
            'rank history',
          ],
          existingActionKind: 'CREATE',
        }),
      );
    }
    if (
      pageOpps.length > 0 &&
      rankedQueries.length === 0
    ) {
      gaps.push(
        contentGap('WEAK_PAGE_COVERAGE', {
          page: target,
          reason: `${pageOpps.length} querie(s) map to this page but none rank.`,
          evidenceState: 'OBSERVED',
          evidenceSources: [
            'strategy mapping',
            'rank history',
          ],
          existingActionKind: 'IMPROVE',
        }),
      );
    }
    if (competitorCovers) {
      gaps.push(
        contentGap('COMPETITOR_COVERAGE', {
          page: target,
          reason: `Competitor pages cover the same observed intent in ${competitorEvidence.length} SERP/AI observation(s). Comparison only — no claim their content is better.`,
          evidenceState: 'OBSERVED',
          evidenceSources: [
            'AI citation checks',
            'competitor records',
          ],
          existingActionKind: 'IMPROVE',
        }),
      );
    }
    if (citation === 'AI_CITATION_GAP') {
      gaps.push(
        contentGap('AI_CITATION_GAP', {
          page: target,
          reason:
            'Competitors are cited for observed prompts where this page is not — citation-worthiness evidence gap.',
          evidenceState: 'OBSERVED',
          evidenceSources: ['AI citation checks'],
          existingActionKind: 'OPTIMIZE',
        }),
      );
    }
    if (
      entity === 'ENTITY_MISSING' ||
      consistency === 'CONFLICTING'
    ) {
      gaps.push(
        contentGap('ENTITY_GAP', {
          page: target,
          reason:
            consistency === 'CONFLICTING'
              ? 'BusinessBrain identity conflicts with observed site identity.'
              : 'BusinessBrain entity has observed demand but is absent from page evidence.',
          evidenceState:
            consistency === 'CONFLICTING'
              ? 'OBSERVED'
              : 'INFERRED',
          evidenceSources: [
            'BusinessBrain',
            'crawl headings/title/meta',
          ],
          existingActionKind: 'OPTIMIZE',
        }),
      );
    }
    if (
      decay === 'RANK_DECLINE_WITH_STALE_CONTENT'
    ) {
      gaps.push(
        contentGap('FRESHNESS_GAP', {
          page: target,
          reason: decayStatement(decay),
          evidenceState: 'OBSERVED',
          evidenceSources: [
            'rank history',
            'crawl timestamps',
          ],
          existingActionKind: 'IMPROVE',
        }),
      );
    }
    if (
      internal === 'ORPHAN_RISK' ||
      internal === 'THIN'
    ) {
      gaps.push(
        contentGap('INTERNAL_SUPPORT_GAP', {
          page: target,
          reason:
            internal === 'ORPHAN_RISK'
              ? 'Page shows orphan risk in the observed link graph.'
              : `Only ${inbound} inbound internal link(s) observed.`,
          evidenceState: graphAvailable
            ? 'OBSERVED'
            : 'UNAVAILABLE',
          evidenceSources: [
            'CrawlLink graph',
            'orphan intelligence',
          ],
          existingActionKind: 'OPTIMIZE',
        }),
      );
    }

    /* ============ WORTHINESS + AUTHORITY ============ */
    const worthiness = citationWorthiness({
      hasObservedQueryIntent:
        pageOpps.length > 0 || gscQueries > 0,
      hasAnswerSection:
        content.h2.length > 0
          ? true
          : hasCrawlPage
            ? false
            : null,
      entityPresent:
        entity === 'ENTITY_PRESENT'
          ? true
          : entity === 'ENTITY_UNAVAILABLE' || !hasCrawlPage
            ? null
            : false,
      topicCovered:
        pageOpps.length > 0
          ? rankedQueries.length > 0
          : null,
      hasSupportingContent:
        items.length > 0 ? true : null,
      hasAuthorOrSources: null,
      freshness: freshness.state,
      inboundLinks: graphAvailable ? inbound : null,
    });
    const authority = [
      authorityRow(
        'SEARCH_COVERAGE',
        rankedQueries.length > 0
          ? rankedQueries.length >= pageOpps.length / 2
            ? 'STRONG'
            : 'PARTIAL'
          : pageOpps.length > 0 || gscQueries > 0
            ? 'WEAK'
            : 'UNAVAILABLE',
        `${rankedQueries.length} ranking querie(s) across ${pageOpps.length} mapped + ${gscQueries} GSC querie(s).`,
        pageOpps.length > 0 || gscQueries > 0
          ? 'OBSERVED'
          : 'UNAVAILABLE',
      ),
      authorityRow(
        'CONTENT_COVERAGE',
        content.contentDepth === 'OBSERVED'
          ? content.h2.length > 0
            ? 'PARTIAL'
            : 'WEAK'
          : 'UNAVAILABLE',
        content.contentDepth === 'OBSERVED'
          ? `${content.wordCount} words observed with ${content.h2.length} H2 section(s).`
          : 'Body extraction unavailable — depth unknown, never estimated.',
        content.contentDepth,
      ),
      authorityRow(
        'ENTITY_COVERAGE',
        entity === 'ENTITY_PRESENT'
          ? 'STRONG'
          : entity === 'ENTITY_SUPPORTING'
            ? 'PARTIAL'
            : entity === 'ENTITY_MISSING'
              ? 'WEAK'
              : 'UNAVAILABLE',
        `Entity signal: ${entity.toLowerCase()}; consistency: ${consistency.toLowerCase()}.`,
        entity === 'ENTITY_UNAVAILABLE'
          ? 'UNAVAILABLE'
          : 'OBSERVED',
      ),
      authorityRow(
        'INTERNAL_SUPPORT',
        internal === 'SUPPORTED'
          ? 'STRONG'
          : internal === 'THIN'
            ? 'PARTIAL'
            : internal === 'ORPHAN_RISK'
              ? 'WEAK'
              : 'UNAVAILABLE',
        graphAvailable
          ? `${inbound} inbound internal link(s) observed.`
          : 'Link-graph coverage insufficient.',
        graphAvailable ? 'OBSERVED' : 'UNAVAILABLE',
      ),
      authorityRow(
        'AI_CITATION',
        citation === 'CITATION_OBSERVED'
          ? 'STRONG'
          : citation === 'AI_CITATION_GAP'
            ? 'WEAK'
            : 'UNAVAILABLE',
        `Citation state: ${citation.toLowerCase()} across ${checks.length} completed check(s).`,
        checks.length > 0 ? 'OBSERVED' : 'UNAVAILABLE',
      ),
      authorityRow(
        'COMPETITOR_GAP',
        competitorCovers ? 'WEAK' : 'STRONG',
        competitorCovers
          ? 'Competitor coverage observed for the same intent.'
          : 'No competitor coverage observed for this page intent.',
        competitors.length > 0 || checks.length > 0
          ? 'OBSERVED'
          : 'UNAVAILABLE',
      ),
      authorityRow(
        'FRESHNESS',
        freshness.state === 'FRESH'
          ? 'STRONG'
          : freshness.state === 'AGING'
            ? 'PARTIAL'
            : freshness.state === 'STALE'
              ? 'WEAK'
              : 'UNAVAILABLE',
        freshness.crawlAgeDays !== null
          ? `Crawl-age ${freshness.crawlAgeDays}d (crawl-age, not content-age).`
          : 'Last-seen timestamp unavailable.',
        freshness.state === 'UNKNOWN'
          ? 'UNAVAILABLE'
          : 'OBSERVED',
      ),
      authorityRow(
        'EXTERNAL_AUTHORITY',
        pageBacklinks.length > 0
          ? 'PARTIAL'
          : 'UNAVAILABLE',
        pageBacklinks.length > 0
          ? `${pageBacklinks.length} active backlink(s) to this page observed; site authority ${siteAuthority ?? 'unknown'}.`
          : 'No verified backlink data for this page — unavailable, never estimated.',
        pageBacklinks.length > 0
          ? 'OBSERVED'
          : 'UNAVAILABLE',
      ),
    ];

    /* ============ DIAGNOSIS + DECISION ============ */
    const weaknesses = diagnoseWeaknesses({
      indexBlocked: content.indexable === false,
      missingIntents,
      missingTopicSupport:
        pageOpps.length === 0 &&
        gscQueries === 0 &&
        rankKeywords.length === 0,
      weakMapping:
        pageOpps.length > 0 &&
        rankedQueries.length === 0,
      competitorCovers,
      aiCitationGap: citation === 'AI_CITATION_GAP',
      entityInconsistent:
        consistency === 'CONFLICTING' ||
        entity === 'ENTITY_MISSING',
      freshnessDecay:
        decay === 'RANK_DECLINE_WITH_STALE_CONTENT',
      internalGap:
        internal === 'ORPHAN_RISK' ||
        internal === 'THIN',
    });
    const decision = pageDecision(
      weaknesses,
      hasCrawlPage || pageOpps.length > 0,
    );

    /* ============ BRIEF ENRICHMENT (read-only) ============ */
    const briefEnrichment = {
      primaryIntent:
        pageOpps[0]?.intent != null
          ? clean(pageOpps[0].intent)
          : null,
      supportingIntents: intents.map(
        (row) => row.intent,
      ),
      primaryTopic:
        clean(pageOpps[0]?.topic) || null,
      supportingTopics: Array.from(
        new Set(
          pageOpps
            .map((opp) => clean(opp.topic))
            .filter(Boolean),
        ),
      ).slice(0, 10),
      observedQueries: pageOpps
        .map((opp) => clean(opp.keyword))
        .filter(Boolean)
        .slice(0, 20),
      entityRequirements:
        entity === 'ENTITY_MISSING' ||
        entity === 'ENTITY_SUPPORTING'
          ? entityTerms.slice(0, 10)
          : [],
      competitorGaps: competitorEvidence.slice(0, 5),
      aiCitationGaps:
        citation === 'AI_CITATION_GAP'
          ? rivalCitations.slice(0, 5).map((check) => ({
              query: clean(check.query),
              citedUrl: clean(check.citationUrl),
            }))
          : [],
      internalLinkTargets: (
        (crawlMeta.anchors ?? []) as string[]
      ).slice(0, 10),
      freshnessContext:
        freshness.crawlAgeDays !== null
          ? `Crawl-age ${freshness.crawlAgeDays}d (${freshness.state.toLowerCase()}).`
          : 'Freshness unknown.',
      evidenceState:
        pageOpps.length > 0 || hasCrawlPage
          ? 'OBSERVED'
          : 'UNAVAILABLE',
      note: 'Enrichment for the existing brief engine — unsupported recommendations are never generated.',
    };

    return {
      website,
      page: {
        url: target,
        hasCrawlPage,
        businessPurpose:
          clean(pageOpps[0]?.topic) ||
          clean(items[0]?.title) ||
          null,
        primaryIntent:
          clean(pageOpps[0]?.intent) || null,
      },
      search: {
        queries: pageOpps
          .map((opp) => ({
            query: clean(opp.keyword),
            position: numOrNull(opp.position),
            clicks: numOrNull(opp.clicks),
            impressions: numOrNull(opp.impressions),
            intent: clean(opp.intent) || null,
          }))
          .slice(0, 20),
        rankings: rankKeywords.slice(0, 20),
        clicks: gscQueries > 0 ? gscClicks : null,
        clicksState:
          gscQueries > 0 ? 'VERIFIED' : 'UNAVAILABLE',
        impressions:
          gscQueries > 0 ? gscImpressions : null,
        gscQueries,
        window: `${window.startDate} → ${window.endDate} (Search Console window)`,
      },
      content: {
        evidence: content,
        intents,
        topics,
        gaps: orderGapsByPrecedence(gaps),
      },
      entity: {
        signal: entity,
        consistency,
        businessName: brainName || null,
        terms: entityTerms.slice(0, 20),
        evidenceState:
          entity === 'ENTITY_UNAVAILABLE'
            ? 'UNAVAILABLE'
            : 'OBSERVED',
      },
      ai: {
        prompts: null,
        promptsState: 'UNAVAILABLE' as const,
        promptsNote:
          'Prompt-level linkage by page is unavailable; citation checks below are URL-matched.',
        mentions: pageMentions.length,
        citations: pageCitations.length,
        citationState: citation,
        worthiness,
        citedUrls: pageCitations
          .map((check) => clean(check.citationUrl))
          .filter(Boolean)
          .slice(0, 5),
      },
      authority: {
        dimensions: authority,
        internal: {
          state: internal,
          inbound,
          anchors: crawlMeta.anchors ?? [],
          orphanFlag,
          evidenceState: graphAvailable
            ? 'OBSERVED'
            : 'UNAVAILABLE',
        },
        external: {
          pageBacklinks: pageBacklinks.length,
          domains: Array.from(
            new Set(
              pageBacklinks.map((row) =>
                clean(row.sourceDomain),
              ),
            ),
          ).slice(0, 10),
          siteAuthority,
          evidenceState:
            pageBacklinks.length > 0
              ? 'OBSERVED'
              : 'UNAVAILABLE',
        },
        competitors: {
          tracked: competitors.map((row) => ({
            name: clean(row.name),
            domain: clean(row.domain),
          })),
          evidence: competitorEvidence,
        },
      },
      business: {
        leads: pageLeads.length,
        leadsState:
          pageLeads.length > 0
            ? 'OBSERVED'
            : 'UNAVAILABLE',
        revenue:
          pageLeadIds.size > 0 ? pageRevenue : null,
        revenueState:
          pageLeadIds.size > 0
            ? 'OBSERVED'
            : 'UNAVAILABLE',
        note: 'Phase 13 linkage reused — recorded landing-page relationships only.',
      },
      diagnosis: {
        weaknesses: weaknesses.map((reason) => ({
          reason,
          statement: weaknessStatement(reason),
        })),
        decision,
        nextAction: {
          kind: decision.decision,
          reason: decision.reason,
          evidenceState: 'OBSERVED',
          evidenceSources: [
            ...new Set(
              orderGapsByPrecedence(gaps).flatMap(
                (gap) => gap.evidenceSources,
              ),
            ),
          ].slice(0, 8),
        },
      },
      briefEnrichment,
      nextBestAction: nbaRes ?? {
        evidenceState: 'UNAVAILABLE',
        statement:
          'Next best action unavailable for this website right now.',
      },
      measurement: {
        note: 'Every recommendation is measurable through rank observations, GSC, AI monitoring, and action measurement. Before/action/after with observed change — never causal proof.',
        rankEndpoint: `/keywords/rank/history?websiteId=${website.id}`,
        actionEndpoint: `/keywords/rank/measure?actionId=`,
      },
      decay: {
        diagnosis: decay,
        statement: decayStatement(decay),
      },
      freshness: {
        state: freshness.state,
        crawlAgeDays: freshness.crawlAgeDays,
        thresholds: {
          freshDays: 90,
          staleDays: 365,
        },
        note: 'Crawl-age from the latest completed crawl — not content-age.',
      },
      billing: {
        charged: false,
        note: 'Read-only composition over stored evidence. No AI credits, scans, or provider meters consumed.',
      },
    };
  }
}

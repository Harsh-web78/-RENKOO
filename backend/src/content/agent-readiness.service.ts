import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { EvidenceFusionService } from '../keywords/evidence-fusion.service';
import {
  AGENT_NOT_OBSERVED_NOTE,
  NO_LOG_NOTE,
  actionabilityState,
  agentActivityState,
  citationBridgeNote,
  commerceSignal,
  contentExtractability,
  crawlAccessState,
  diagnoseAgentReadiness,
  discoverabilityEvidence,
  discoverabilityState,
  entityClarity,
  entityConsistency,
  freshnessFromCrawlAge,
  internalSupportState,
  isAiAgentCategory,
  mapReasonToNba,
  offeringClarity,
  structuredDataState,
  CRAWL_AGE_NOTE,
} from './agent-readiness';

/*
 * =========================================================
 * AGENT READINESS 1.0 (Phase 15) — read-only composition
 * over existing RENKOO evidence. No new scores, no new
 * crawler, no provider calls, no new persistence, no new
 * billing meters. One bounded read wave; every leg
 * degrades alone; missing stays UNAVAILABLE/UNKNOWN.
 *
 * Bounds: direct page lookup (no full-crawl scan),
 * links count + 20 anchors, agent requests <= 200,
 * AI checks <= 200, competitors <= 5, leads/revenue
 * <= 200, content items <= 100.
 * =========================================================
 */

const MAX_AGENT_REQUESTS = 200;
const MAX_CHECKS = 200;
const MAX_LEADS = 200;
const MAX_ITEMS = 100;

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

@Injectable()
export class AgentReadinessService {
  constructor(
    private readonly prisma: PrismaService,
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

  async getAgentReadiness(
    organizationId: string,
    websiteId: string,
    url: string,
  ) {
    const target = clean(url);
    if (!target) {
      throw new BadRequestException('url is required');
    }
    const targetKey = normPage(target);
    const website = await this.prisma.website.findFirst({
      where: {
        id: websiteId,
        organizationId,
        isActive: true,
      },
      select: { id: true, name: true, url: true },
    });
    if (!website) throw new NotFoundException('Website not found');

    const [
      crawlRes,
      brainRes,
      agentRes,
      checksRes,
      itemsRes,
      competitorsRes,
      leadsRes,
      revenueRes,
      nbaRes,
    ] = await Promise.all([
      /* Latest completed crawl + direct page lookup. */
      this.settled(async () => {
        const crawl = await this.prisma.crawl.findFirst({
          where: { websiteId, status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
        });
        if (!crawl) return null;
        const page =
          (await this.prisma.crawlPage.findFirst({
            where: { crawlId: crawl.id, url: target },
          })) ??
          (await this.prisma.crawlPage.findFirst({
            where: { crawlId: crawl.id, finalUrl: target },
          }));
        /* Fallback: normalized match over a bounded window. */
        let matched = page;
        let pageCount: number | null = null;
        if (!matched) {
          const window =
            await this.prisma.crawlPage.findMany({
              where: { crawlId: crawl.id },
              select: { url: true, finalUrl: true },
              take: 100,
            });
          pageCount = window.length;
          const hit = window.find(
            (row) =>
              normPage(row.url) === targetKey ||
              normPage(row.finalUrl) === targetKey,
          );
          if (hit) {
            matched =
              await this.prisma.crawlPage.findFirst({
                where: { crawlId: crawl.id, url: hit.url },
              });
          }
        }
        let inbound = 0;
        let anchors: string[] = [];
        let graphAvailable = false;
        try {
          inbound = await this.prisma.crawlLink.count({
            where: {
              crawlId: crawl.id,
              targetUrl: matched?.url ?? target,
            },
          });
          const edges =
            await this.prisma.crawlLink.findMany({
              where: {
                crawlId: crawl.id,
                targetUrl: matched?.url ?? target,
              },
              select: { anchorText: true, sourceUrl: true },
              take: 20,
            });
          anchors = edges
            .map((edge) => clean(edge.anchorText))
            .filter(Boolean)
            .slice(0, 20);
          graphAvailable = true;
        } catch {
          graphAvailable = false;
        }
        return {
          crawl,
          page: matched,
          pageCount,
          inbound,
          anchors,
          graphAvailable,
        };
      }),
      this.settled(() =>
        this.prisma.businessBrain.findUnique({
          where: { websiteId },
        }),
      ),
      /* Phase 8D agent log evidence (bounded). */
      this.settled(async () => {
        let rows: any[] = [];
        let logAvailable = false;
        try {
          rows = await this.prisma.aiAgentRequest.findMany({
            where: { organizationId, websiteId },
            orderBy: { observedAt: 'desc' },
            take: MAX_AGENT_REQUESTS,
          });
          logAvailable = true;
        } catch {
          logAvailable = false;
        }
        const normTarget = normPage(target);
        const pageRows = rows.filter(
          (row) =>
            normPage(row.normalizedUrl) === normTarget ||
            normPage(row.requestPath) === normTarget,
        );
        const aiRows = pageRows.filter((row) =>
          isAiAgentCategory(row.agentCategory),
        );
        const families = [
          ...new Set(
            aiRows.map((row) => clean(row.agentFamily)).filter(Boolean),
          ),
        ].slice(0, 12);
        const statusDist: Record<string, number> = {};
        for (const row of aiRows) {
          const key = clean(row.statusCode ?? 'unknown') || 'unknown';
          statusDist[key] = (statusDist[key] ?? 0) + 1;
        }
        return {
          logAvailable,
          pageVisits: aiRows.length,
          families,
          statusDist,
          lastObserved: aiRows[0]?.observedAt ?? null,
        };
      }),
      this.settled(() =>
        this.prisma.aiVisibilityCheck.findMany({
          where: { websiteId, status: 'COMPLETED' },
          orderBy: { checkedAt: 'desc' },
          take: MAX_CHECKS,
        }),
      ),
      this.settled(() =>
        this.prisma.contentItem.findMany({
          where: { organizationId, websiteId },
          take: MAX_ITEMS,
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
          take: MAX_LEADS,
        }),
      ),
      this.settled(() =>
        this.prisma.revenue.findMany({
          where: { websiteId, status: 'RECOGNIZED' },
          orderBy: { recognizedAt: 'desc' },
          take: MAX_LEADS,
        }),
      ),
      this.settled(() =>
        this.fusion.getNextBestAction(organizationId, websiteId),
      ),
    ]);

    const crawlPage = (crawlRes?.page ?? null) as Record<
      string,
      any
    > | null;
    const hasCrawlPage = crawlPage !== null;
    const crawl = crawlRes?.crawl as {
      completedAt?: unknown;
    } | null;
    const inbound = crawlRes?.inbound ?? 0;
    const anchors = crawlRes?.anchors ?? [];
    const graphAvailable = crawlRes?.graphAvailable ?? false;

    const title = clean(crawlPage?.title) || null;
    const h1 = Array.isArray(crawlPage?.h1)
      ? (crawlPage?.h1 as unknown[]).map(clean).filter(Boolean)
      : [];
    const h2 = Array.isArray(crawlPage?.h2)
      ? (crawlPage?.h2 as unknown[]).map(clean).filter(Boolean)
      : [];
    const wordCount = numOrNull(crawlPage?.wordCount);
    const bodyAvailable =
      wordCount !== null && (wordCount ?? 0) > 0;
    const statusCode = numOrNull(crawlPage?.statusCode);
    const indexable =
      typeof crawlPage?.robotsIndexable === 'boolean'
        ? (crawlPage.robotsIndexable as boolean)
        : null;
    const structuredCount = numOrNull(
      crawlPage?.structuredDataCount,
    );
    const jsonLd = crawlPage?.jsonLd;
    const parseable =
      structuredCount !== null &&
      (structuredCount ?? 0) > 0 &&
      jsonLd !== null &&
      jsonLd !== undefined;

    /* ---- dimensions (pure) ---- */
    const discoverability = discoverabilityState({
      hasCrawlPage,
      inboundLinks: graphAvailable ? inbound : null,
      isOrphan: null,
      inSitemap: null,
      indexable,
    });
    const access = crawlAccessState({
      statusCode,
      indexable,
      crawlFailed: false,
      hasCrawlPage,
    });
    const content = contentExtractability({
      title,
      h1Count: h1.length,
      h2Count: h2.length,
      hasBody: bodyAvailable ? true : null,
      bodyAvailable,
      hasCrawlPage,
    });

    const brain = brainRes as Record<string, any> | null;
    const services = Array.isArray(brain?.services)
      ? brain.services
      : [];
    const products = Array.isArray(brain?.products)
      ? brain.products
      : [];
    const offeringCount = services.length + products.length;
    const entity = entityClarity({
      businessName: clean(brain?.businessName) || null,
      hasBusinessType: clean(brain?.industry).length > 0,
      offeringCount,
      hasAudience: clean(brain?.targetAudience).length > 0,
      hasLocation:
        clean(brain?.city).length > 0 ||
        clean(brain?.country).length > 0,
      hasContactSignal: false,
      conflictingSignals: false,
      hasBrain: brain !== null,
    });

    const items = (itemsRes ?? []) as Array<
      Record<string, any>
    >;
    const matchedItem = items.find(
      (item) => normPage(item.pageUrl) === targetKey,
    );
    const offering = offeringClarity({
      hasBrain: brain !== null,
      offeringMapped: offeringCount > 0,
      offeringHasTopic: false,
      offeringHasPage: matchedItem !== undefined || hasCrawlPage,
      observedDemand: false,
    });

    const checks = (checksRes ?? []) as Array<
      Record<string, any>
    >;
    const pageChecks = checks.filter((row) => {
      const cand = clean(
        row.pageUrl ?? row.targetUrl ?? row.url ?? '',
      );
      return cand ? normPage(cand) === targetKey : false;
    });
    const cited = pageChecks.some((row) => {
      const rel = String(
        row.citationRelationship ?? row.relationship ?? '',
      ).toUpperCase();
      return rel.includes('CITED');
    });
    const citation: 'CITED' | 'MENTIONED_NOT_CITED' | 'NOT_MENTIONED' | 'UNAVAILABLE' =
      pageChecks.length === 0
        ? 'UNAVAILABLE'
        : cited
          ? 'CITED'
          : 'NOT_MENTIONED';

    const schemaNames: string[] = [];
    try {
      const arr = Array.isArray(jsonLd) ? jsonLd : [];
      for (const entry of arr.slice(0, 10)) {
        const obj =
          typeof entry === 'string'
            ? JSON.parse(entry)
            : entry;
        const name = clean(obj?.name ?? obj?.['@name'] ?? '');
        if (name) schemaNames.push(name);
      }
    } catch {
      /* Unparseable entries stay absent — never inferred. */
    }
    const schemaName = schemaNames[0] ?? null;
    const pageIdentity = h1[0] ?? title;
    const consistency = entityConsistency(
      clean(brain?.businessName) || null,
      clean(pageIdentity) || null,
      schemaName,
    );
    const structured = structuredDataState({
      count: structuredCount,
      parseable,
      hasMismatch: consistency === 'CONFLICTING',
      hasCrawlPage,
      pageContextSupportsSchema:
        offeringCount > 0 || clean(brain?.businessName).length > 0,
    });

    const internalSupport = internalSupportState({
      inboundLinks: graphAvailable ? inbound : null,
      isOrphan: graphAvailable ? inbound === 0 : null,
      anchorCount: anchors.length,
      graphAvailable,
    });

    const evidenceSupport: 'STRONG' | 'PARTIAL' | 'WEAK' | 'UNAVAILABLE' =
      !hasCrawlPage
        ? 'UNAVAILABLE'
        : items.length >= 3
          ? 'STRONG'
          : items.length >= 1
            ? 'PARTIAL'
            : 'WEAK';

    /* Actionability: only from observed page signals —
     * never claim execution. */
    const haystack =
      `${title ?? ''} ${h1.join(' ')} ${h2.join(' ')}`.toLowerCase();
    const observedActions = [
      'contact',
      'booking',
      'pricing',
      'demo',
      'signup',
      'purchase',
      'documentation',
      'quote',
      'location',
      'support',
    ].filter((action) => haystack.includes(action));
    const actionability = actionabilityState({
      observedActions,
      executionSupported: null,
      hasCrawlPage,
    });

    const commerce = commerceSignal({
      offeringClear: offering === 'CLEAR',
      pricingClear: observedActions.includes('pricing'),
      availabilityClear: observedActions.includes('booking'),
      contactClear: observedActions.includes('contact'),
      structuredProduct: structured === 'VALID',
      hasEvidence: hasCrawlPage || brain !== null,
    });

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
    const freshness = freshnessFromCrawlAge(crawlAgeDays, 30, 120);

    const agentActivity = agentActivityState({
      logAvailable: agentRes?.logAvailable ?? false,
      aiAgentVisits: agentRes?.pageVisits ?? 0,
    });

    const diagnosis = diagnoseAgentReadiness({
      discoverability,
      access,
      content,
      entity,
      offering,
      evidenceSupport,
      structured,
      internalSupport,
      freshness,
      actionability,
      agentActivity,
      logAvailable: agentRes?.logAvailable ?? false,
    });
    const topReason = diagnosis[0] ?? null;

    const leads = (leadsRes ?? []) as Array<
      Record<string, any>
    >;
    const revenues = (revenueRes ?? []) as Array<
      Record<string, any>
    >;

    const observedAt =
      completedAt && !Number.isNaN(completedAt.getTime())
        ? completedAt.toISOString()
        : null;

    return {
      page: { url: target, websiteId: website.id },
      discoverability: {
        state: discoverability,
        evidenceState: discoverabilityEvidence({
          hasCrawlPage,
          inboundLinks: graphAvailable ? inbound : null,
          isOrphan: null,
          inSitemap: null,
          indexable,
        }),
        source: 'CrawlPage + CrawlLink',
        statement:
          'Observed site discoverability — not a claim about external AI agents.',
        inboundLinks: graphAvailable ? inbound : null,
        indexable,
        observedAt,
      },
      access: {
        state: access,
        evidenceState: hasCrawlPage ? 'OBSERVED' : 'UNAVAILABLE',
        source: 'CrawlPage status/robots/canonical',
        statusCode,
        indexable,
        note: 'robots.txt alone is never treated as proof that an AI agent is blocked.',
        observedAt,
      },
      content: {
        state: content,
        evidenceState: hasCrawlPage
          ? bodyAvailable
            ? 'OBSERVED'
            : 'UNAVAILABLE'
          : 'UNAVAILABLE',
        source: 'CrawlPage title/headings/body extraction',
        title,
        h1: h1.slice(0, 5),
        h2Count: h2.length,
        wordCount,
        observedAt,
      },
      entity: {
        state: entity,
        evidenceState: brain ? 'OBSERVED' : 'UNAVAILABLE',
        source: 'BusinessBrain + page identity',
        businessName: clean(brain?.businessName) || null,
        consistency,
        observedAt,
      },
      offering: {
        state: offering,
        evidenceState: brain ? 'OBSERVED' : 'UNAVAILABLE',
        source: 'BusinessBrain + Content items',
        offerings: [...services, ...products].slice(0, 20),
        observedAt,
      },
      topic: {
        state: offering === 'CLEAR' ? 'STRONG' : offering === 'PARTIAL' ? 'PARTIAL' : 'UNAVAILABLE',
        evidenceState: brain ? 'INFERRED' : 'UNAVAILABLE',
        source: 'Phase 12 reuse (composition only)',
        note: 'Business → offering → topic → intent → page → supporting pages. No new topic graph.',
        observedAt,
      },
      evidence: {
        state: evidenceSupport,
        evidenceState:
          evidenceSupport === 'UNAVAILABLE'
            ? 'UNAVAILABLE'
            : 'OBSERVED',
        source: 'Phase 14 reuse (content items + crawl)',
        supportingItems: items.length,
        observedAt,
      },
      structuredData: {
        state: structured,
        evidenceState: hasCrawlPage
          ? structuredCount !== null
            ? 'OBSERVED'
            : 'UNAVAILABLE'
          : 'UNAVAILABLE',
        source: 'CrawlPage JSON-LD extraction',
        count: structuredCount,
        schemaNames: schemaNames.slice(0, 5),
        consistency,
        note: 'Missing structured data is not automatically a failure.',
        observedAt,
      },
      internalSupport: {
        state: internalSupport,
        evidenceState: graphAvailable ? 'OBSERVED' : 'UNAVAILABLE',
        source: 'CrawlLink graph',
        inboundLinks: graphAvailable ? inbound : null,
        anchors: anchors.slice(0, 10),
        observedAt,
      },
      agentActivity: {
        state: agentActivity,
        evidenceState:
          agentRes?.logAvailable && agentActivity === 'AI_AGENT_VISITED'
            ? 'OBSERVED'
            : 'UNAVAILABLE',
        source: 'Phase 8D AiAgentRequest (User-Agent signatures only, spoofable)',
        families: agentRes?.families ?? [],
        requestCount: agentRes?.pageVisits ?? 0,
        statusDistribution: agentRes?.statusDist ?? {},
        lastObserved: agentRes?.lastObserved ?? null,
        note:
          agentActivity === 'AI_AGENT_NOT_OBSERVED'
            ? AGENT_NOT_OBSERVED_NOTE
            : agentActivity === 'UNKNOWN'
              ? NO_LOG_NOTE
              : 'Agent identity comes from User-Agent signatures only (spoofable); never presented as verified official agents. A visit is never a citation, mention, ranking, traffic or conversion signal.',
        observedAt,
      },
      aiCitations: {
        state: citation,
        evidenceState:
          pageChecks.length > 0 ? 'OBSERVED' : 'UNAVAILABLE',
        source: 'AI visibility checks',
        checkedPages: pageChecks.length,
        note: citationBridgeNote(citation, agentActivity),
        observedAt,
      },
      freshness: {
        state: freshness,
        crawlAgeDays,
        thresholds: { freshDays: 30, staleDays: 120 },
        note: CRAWL_AGE_NOTE,
        observedAt,
      },
      businessIdentity: {
        businessName: clean(brain?.businessName) || null,
        evidenceState: brain ? 'OBSERVED' : 'UNAVAILABLE',
        source: 'BusinessBrain',
      },
      actionability: {
        state: actionability,
        evidenceState:
          observedActions.length > 0 ? 'OBSERVED' : 'UNAVAILABLE',
        source: 'Observed page signals',
        observedActions,
        executionSupported: false,
        executionNote:
          'ACTION_INFORMATION_AVAILABLE where actions are observed; ' +
          'ACTION_EXECUTION_SUPPORTED is never claimed. ' +
          'An agent completing a transaction is never promised.',
        observedAt,
      },
      commerce: {
        signal: commerce,
        evidenceState:
          commerce === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'INFERRED',
        source: 'Observable readiness signals only (diagnostic)',
        note: 'Diagnostic only — no transactions, no payment integration.',
      },
      businessOutcome: {
        leads: leads.length,
        revenueRecognized: revenues.length,
        evidenceState:
          leads.length > 0 || revenues.length > 0
            ? 'OBSERVED'
            : 'UNAVAILABLE',
        source: 'Phase 13 Search-to-Revenue reuse',
        note: 'Agent readiness never invents revenue impact. Unavailable stays unavailable.',
        competitors: (competitorsRes ?? []).map((row: any) => ({
          name: clean(row.name),
          domain: clean(row.domain),
        })),
      },
      diagnosis: {
        reasons: diagnosis,
        topReason,
        suggestedNbaCategory: topReason
          ? mapReasonToNba(topReason.reason)
          : 'MONITOR_CHANGE',
      },
      nextBestAction: nbaRes ?? {
        evidenceState: 'UNAVAILABLE',
        statement:
          'Next best action unavailable for this website right now.',
      },
      measurement: {
        note: 'Every recommendation is measurable through rank observations, GSC, AI monitoring, and action measurement. Observed alongside — never caused by.',
        rankEndpoint: `/keywords/rank/history?websiteId=${website.id}`,
        actionEndpoint: `/keywords/rank/measure?actionId=`,
      },
      billing: {
        charged: false,
        note: 'Read-only composition over stored evidence. No AI credits, scans, or provider meters consumed.',
      },
    };
  }
}

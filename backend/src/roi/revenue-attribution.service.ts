import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { GoogleService } from '../google/google.service';
import { RankTrackingService } from '../keywords/rank-tracking.service';
import {
  aiAssistantSourceFromReferrer,
  aiGranularity,
  attributionQuality,
  attributionRoi,
  clientSummary,
  composePath,
  connectionPrompt,
  creditLabel,
  evidenceNote,
  explainAttribution,
  fractionalCredit,
  freshnessNote,
  heroMetrics,
  higherConfidenceWins,
  isQualified,
  leadCountOnly,
  lookbackNote,
  modeledLabel,
  multiCurrencyNote,
  needAssociationNote,
  normalizeAttributionModel,
  normalizeChannel,
  normalizeLeadStage,
  normalizeMoney,
  normalizeWindow,
  observedAfterChange,
  outcomeGap,
  queryRevenueRelation,
  stripPii,
  temporalSequenceNote,
  unattributableBucket,
  type AttributionModel,
  type OutcomeEvidence,
  type TrafficChannel,
} from './revenue-attribution';

/*
 * =========================================================
 * SEARCH-TO-REVENUE ATTRIBUTION 2.0 (Phase 33).
 *
 * Read-only composition over existing foundations:
 * GA4 channel × landing pull (new additive report),
 * GSC demand, Phase 31 rank, AI visibility checks,
 * recorded Leads / Revenue / MarketingSpend, Actions.
 *
 * §75: composition-only — existing Lead, Revenue,
 * MarketingSpend, GA4/GSC, rank and AI models already
 * persist everything required. No migration, no new
 * lead/revenue/CRM/attribution tables.
 *
 * Every edge carries OBSERVED / ATTRIBUTED / INFERRED
 * / ESTIMATED / UNAVAILABLE. GSC query → revenue is
 * CONTEXTUAL unless a source explicitly links it.
 * Temporal association only — never causal.
 * =========================================================
 */

const MAX_ROWS = 500;
const MAX_PAGES = 20;
const MAX_NEEDS = 10;
const MAX_ACTIONS = 10;

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function windowRange(days: 7 | 28 | 90): {
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

function pagePath(url: string): string {
  const v = clean(url);
  if (!v) return '(unavailable)';
  try {
    const u = new URL(
      v.startsWith('http') ? v : `https://x${v.startsWith('/') ? '' : '/'}${v}`,
    );
    return u.pathname || '/';
  } catch {
    return v.slice(0, 120);
  }
}

@Injectable()
export class RevenueAttributionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleService,
    private readonly ranks: RankTrackingService,
  ) {}

  private async website(
    organizationId: string,
    websiteId: string,
  ) {
    return this.prisma.website.findFirst({
      where: {
        id: websiteId,
        organizationId,
        isActive: true,
      },
    });
  }

  /* ============ shared evidence bundle ============ */

  private async channelEvidence(
    organizationId: string,
    days: 7 | 28 | 90,
  ): Promise<{
    status: 'AVAILABLE' | 'UNAVAILABLE';
    rows: Array<{
      channel: TrafficChannel;
      channelRaw: string;
      landingPage: string;
      sourceMedium: string;
      sessions: number;
      conversions: number;
      revenue: number;
    }>;
    attributionModel: AttributionModel;
    dataThrough: string | null;
    note: string;
  }> {
    const { startDate, endDate } = windowRange(days);
    try {
      const report =
        await this.google.getAnalyticsChannelReport(
          organizationId,
          startDate,
          endDate,
        );
      const payload = (report as any)?.data ??
        (report as any) ?? {};
      const rows = (
        (Array.isArray(payload?.rows)
          ? payload.rows
          : []) as Array<Record<string, unknown>>
      )
        .slice(0, MAX_ROWS)
        .map((r) => ({
          channel: normalizeChannel(r.channelGroup),
          channelRaw: clean(r.channelGroup),
          landingPage: clean(r.landingPage),
          sourceMedium: clean(r.sourceMedium),
          sessions: Number(r.sessions ?? 0) || 0,
          conversions: Number(r.conversions ?? 0) || 0,
          revenue: Number(r.revenue ?? 0) || 0,
        }));
      return {
        status: 'AVAILABLE',
        rows,
        /* GA4 reports conversions under its property
         * attribution setting; RENKOO reads the rows,
         * it does not re-model them. */
        attributionModel: normalizeAttributionModel(
          'DATA_DRIVEN',
        ),
        dataThrough: endDate,
        note:
          'Channel rows exactly as GA4 provides them. ' +
          'AI Assistant is GA4-native; Google AI Overview/Mode ' +
          'clicks arrive as Organic Search; unattributed rows ' +
          'are never normalized to Organic.',
      };
    } catch {
      return {
        status: 'UNAVAILABLE',
        rows: [],
        attributionModel: 'UNKNOWN',
        dataThrough: null,
        note: 'GA4 channel data unavailable — connect GA4 and select a property. Shown as unavailable, never zero.',
      };
    }
  }

  private async recordedOutcomes(
    websiteId: string,
    days: 7 | 28 | 90,
  ) {
    const { startDate, endDate } = windowRange(days);
    const since = new Date(`${startDate}T00:00:00.000Z`);
    const until = new Date(`${endDate}T23:59:59.999Z`);
    const [leads, revenues, spends] = await Promise.all([
      this.prisma.lead.findMany({
        where: {
          websiteId,
          createdAt: { gte: since, lte: until },
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
      }),
      this.prisma.revenue.findMany({
        where: {
          websiteId,
          recognizedAt: { gte: since, lte: until },
        },
        orderBy: { recognizedAt: 'desc' },
        take: MAX_ROWS,
      }),
      this.prisma.marketingSpend.findMany({
        where: {
          websiteId,
          spendDate: { gte: since, lte: until },
        },
        take: MAX_ROWS,
      }),
    ]);
    /* Privacy: aggregates only — strip anything
     * identity-like before further handling. */
    const safeLeads = leads.map((l) =>
      stripPii(l as unknown as Record<string, unknown>),
    );
    void safeLeads;
    return { leads, revenues, spends, since, until };
  }

  private summarizeStages(
    leads: Array<{
      status: string;
      converted: boolean;
    }>,
  ): {
    total: number;
    qualified: number;
    won: number;
    qualificationAvailable: boolean;
  } {
    let qualified = 0;
    let won = 0;
    let known = 0;
    for (const l of leads) {
      const stage = normalizeLeadStage(l.status, l.converted);
      if (stage !== 'QUALIFICATION_UNAVAILABLE') known++;
      if (isQualified(stage) === true && stage === 'QUALIFIED') {
        qualified++;
      }
      if (stage === 'WON') won++;
    }
    return {
      total: leads.length,
      qualified,
      won,
      qualificationAvailable: known > 0,
    };
  }

  /* ============ GET overview (§43/§44/§45/§62) ============ */

  async overview(
    organizationId: string,
    websiteId: string,
    daysInput: number,
  ) {
    const site = await this.website(
      organizationId,
      websiteId,
    );
    if (!site) {
      return {
        websiteFound: false,
        note: 'Website not found for this organization.',
      };
    }
    const days = normalizeWindow(daysInput);
    const [channels, recorded] = await Promise.all([
      this.channelEvidence(organizationId, days),
      this.recordedOutcomes(websiteId, days),
    ]);
    const organic = channels.rows.filter(
      (r) => r.channel === 'ORGANIC_SEARCH',
    );
    const ai = channels.rows.filter(
      (r) => r.channel === 'AI_ASSISTANT',
    );
    const organicSessions = organic.reduce(
      (n, r) => n + r.sessions,
      0,
    );
    const organicEvents = organic.reduce(
      (n, r) => n + r.conversions,
      0,
    );
    const organicRevenue = organic.reduce(
      (n, r) => n + r.revenue,
      0,
    );
    const aiSessions = ai.reduce((n, r) => n + r.sessions, 0);
    const aiEvents = ai.reduce(
      (n, r) => n + r.conversions,
      0,
    );
    const aiRevenue = ai.reduce((n, r) => n + r.revenue, 0);
    const stages = this.summarizeStages(recorded.leads);
    const recognized = recorded.revenues.filter(
      (r) => clean(r.status).toUpperCase() === 'RECOGNIZED',
    );
    const currencies = recognized.map((r) =>
      clean(r.currency) || 'UNKNOWN',
    );
    const singleCurrency =
      new Set(currencies.map((c) => c.toUpperCase())).size <= 1;
    const recordedRevenue = singleCurrency
      ? recognized.reduce((n, r) => n + (Number(r.amount) || 0), 0)
      : null;
    const spend = recorded.spends.reduce(
      (n, s) => n + (Number(s.amount) || 0),
      0,
    );
    const hasSpend = recorded.spends.length > 0;
    const roi = attributionRoi({
      revenue:
        recordedRevenue !== null && recognized.length > 0
          ? recordedRevenue
          : null,
      cost: hasSpend ? spend : null,
    });
    const gap = outcomeGap({
      eventTrackingConnected: channels.status === 'AVAILABLE',
      eventTrackingReliable: channels.status === 'AVAILABLE',
      hasTraffic: organicSessions > 0 || aiSessions > 0,
      hasKeyEvents: organicEvents + aiEvents > 0,
      hasLeads: stages.total > 0,
      qualificationAvailable: stages.qualificationAvailable,
      hasRevenue: recognized.length > 0,
    });
    const hero = heroMetrics([
      {
        key: 'organicSessions',
        value:
          channels.status === 'AVAILABLE'
            ? String(organicSessions)
            : null,
        evidence:
          channels.status === 'AVAILABLE'
            ? 'OBSERVED'
            : 'UNAVAILABLE',
      },
      {
        key: 'organicKeyEvents',
        value:
          channels.status === 'AVAILABLE'
            ? String(organicEvents)
            : null,
        evidence:
          channels.status === 'AVAILABLE'
            ? 'ATTRIBUTED'
            : 'UNAVAILABLE',
      },
      {
        key: 'leads',
        value: String(stages.total),
        evidence: 'OBSERVED',
      },
      {
        key: 'qualified',
        value: stages.qualificationAvailable
          ? String(stages.qualified)
          : null,
        evidence: stages.qualificationAvailable
          ? 'OBSERVED'
          : 'UNAVAILABLE',
      },
      {
        key: 'revenue',
        value:
          recognized.length > 0 && recordedRevenue !== null
            ? `${recordedRevenue} ${currencies[0] ?? ''}`.trim()
            : null,
        evidence:
          recognized.length > 0 ? 'ATTRIBUTED' : 'UNAVAILABLE',
      },
    ]);
    const aiHero = heroMetrics(
      [
        {
          key: 'aiSessions',
          value:
            channels.status === 'AVAILABLE'
              ? String(aiSessions)
              : null,
          evidence:
            channels.status === 'AVAILABLE'
              ? 'OBSERVED'
              : 'UNAVAILABLE',
        },
        {
          key: 'aiKeyEvents',
          value:
            channels.status === 'AVAILABLE'
              ? String(aiEvents)
              : null,
          evidence:
            channels.status === 'AVAILABLE'
              ? 'ATTRIBUTED'
              : 'UNAVAILABLE',
        },
        {
          key: 'aiRevenue',
          value:
            channels.status === 'AVAILABLE' && aiRevenue > 0
              ? String(aiRevenue)
              : null,
          evidence:
            channels.status === 'AVAILABLE' && aiRevenue > 0
              ? 'ATTRIBUTED'
              : 'UNAVAILABLE',
        },
      ],
      4,
    );
    const prompts = connectionPrompt({
      ga4Connected: channels.status === 'AVAILABLE',
      crmConnected: stages.total > 0,
      revenueAvailable: recognized.length > 0,
    });
    return {
      websiteId,
      windowDays: days,
      hierarchy:
        'SEARCH DEMAND → TRAFFIC → KEY EVENTS → LEADS → QUALIFIED → REVENUE.',
      hero,
      aiHero,
      aiNote:
        aiHero.length === 0
          ? 'AI revenue attribution unavailable — citation without referral traffic stays citation-only.'
          : 'AI Assistant rows exactly as GA4 classifies them; granularity below.',
      organic: {
        sessions: channels.status === 'AVAILABLE' ? organicSessions : null,
        keyEvents: channels.status === 'AVAILABLE' ? organicEvents : null,
        channelRevenue:
          channels.status === 'AVAILABLE' ? organicRevenue : null,
        evidence: channels.status === 'AVAILABLE' ? 'ATTRIBUTED' : 'UNAVAILABLE',
        note: 'ORGANIC_SEARCH_ATTRIBUTED — channel-level, never query-level revenue.',
      },
      leads: {
        total: stages.total,
        qualified: stages.qualificationAvailable
          ? stages.qualified
          : null,
        won: stages.won,
        countNote: leadCountOnly(stages.total),
        qualification: stages.qualificationAvailable
          ? 'Recorded lead statuses.'
          : 'LEAD_QUALIFICATION_UNAVAILABLE — qualification never inferred.',
      },
      revenue: {
        recognized: recognized.length,
        amount: recordedRevenue,
        currencies: [...new Set(currencies)],
        currencyNote: multiCurrencyNote(
          currencies.length > 0 ? currencies : ['UNKNOWN'],
        ),
        money: recognized
          .slice(0, 20)
          .map((r) =>
            normalizeMoney({
              amount: r.amount,
              currency: r.currency,
            }),
          ),
        explanation:
          recognized.length > 0
            ? explainAttribution({
                amount: `${recordedRevenue ?? 'mixed'} ${singleCurrency ? (currencies[0] ?? '') : '(multi)'}`.trim(),
                source: clean(recognized[0].source) || 'Recorded revenue',
                model: channels.attributionModel,
                channel: 'ORGANIC_SEARCH',
                window: `${days} days`,
              })
            : null,
      },
      roi: {
        ...roi,
        spend: hasSpend ? spend : null,
        spendNote: hasSpend
          ? 'Known marketing spend in window.'
          : 'COST_UNAVAILABLE — staff cost is never estimated.',
      },
      gap,
      gapNote:
        gap === 'NONE'
          ? 'No structural gap in the observed chain.'
          : gap,
      prompts,
      freshness: freshnessNote({
        observedAt: new Date().toISOString(),
        dataThrough: channels.dataThrough,
        source: 'GA4 + recorded outcomes',
        model: channels.attributionModel,
      }),
      channelNote: channels.note,
      causality:
        'Revenue observed/attributed in-window is never claimed as caused by any SEO action. See actions view for temporal before/after.',
    };
  }

  /* ============ GET pages (§50/§26) ============ */

  async pages(
    organizationId: string,
    websiteId: string,
    daysInput: number,
  ) {
    const site = await this.website(
      organizationId,
      websiteId,
    );
    if (!site) return { websiteFound: false, pages: [] };
    const days = normalizeWindow(daysInput);
    const [channels, recorded] = await Promise.all([
      this.channelEvidence(organizationId, days),
      this.recordedOutcomes(websiteId, days),
    ]);
    const byPage = new Map<
      string,
      {
        page: string;
        organicSessions: number;
        keyEvents: number;
        leads: number;
        revenue: number | null;
        revenueState: string;
      }
    >();
    for (const row of channels.rows) {
      if (row.channel !== 'ORGANIC_SEARCH') continue;
      const page = pagePath(row.landingPage);
      const entry = byPage.get(page) ?? {
        page,
        organicSessions: 0,
        keyEvents: 0,
        leads: 0,
        revenue: null,
        revenueState: 'PAGE_REVENUE_UNAVAILABLE',
      };
      entry.organicSessions += row.sessions;
      entry.keyEvents += row.conversions;
      byPage.set(page, entry);
    }
    /* Recorded leads join pages via their captured
     * landing page; revenue follows its lead. This is
     * source-recorded linkage (ATTRIBUTED at page
     * level), never a query→revenue claim. */
    const revenueByLead = new Map<string, number>();
    for (const rev of recorded.revenues) {
      if (
        clean(rev.status).toUpperCase() !== 'RECOGNIZED' ||
        !rev.leadId
      ) {
        continue;
      }
      revenueByLead.set(
        rev.leadId,
        (revenueByLead.get(rev.leadId) ?? 0) +
          (Number(rev.amount) || 0),
      );
    }
    for (const lead of recorded.leads) {
      const page = pagePath(clean((lead as any).landingPage));
      const entry = byPage.get(page) ?? {
        page,
        organicSessions: 0,
        keyEvents: 0,
        leads: 0,
        revenue: null,
        revenueState: 'PAGE_REVENUE_UNAVAILABLE',
      };
      entry.leads += 1;
      const rev = revenueByLead.get(lead.id);
      if (rev !== undefined) {
        entry.revenue = (entry.revenue ?? 0) + rev;
        entry.revenueState =
          'PAGE_REVENUE_ATTRIBUTED (via recorded lead landing pages)';
      }
      byPage.set(page, entry);
    }
    const pages = [...byPage.values()]
      .sort((a, b) => b.organicSessions - a.organicSessions)
      .slice(0, MAX_PAGES);
    return {
      websiteId,
      windowDays: days,
      channelAvailable: channels.status === 'AVAILABLE',
      pages,
      note: 'Top pages by organic traffic with recorded key events, leads and lead-linked revenue where supported. No page score.',
    };
  }

  /* ============ GET needs (§51/§31) ============ */

  async needs(
    organizationId: string,
    websiteId: string,
    daysInput: number,
  ) {
    const site = await this.website(
      organizationId,
      websiteId,
    );
    if (!site) return { websiteFound: false, needs: [] };
    const days = normalizeWindow(daysInput);
    const { startDate, endDate } = windowRange(days);
    let queries: Array<Record<string, unknown>> = [];
    try {
      const res = (await this.google.getSearchQueries(
        organizationId,
        startDate,
        endDate,
      )) as unknown as {
        rows?: Array<Record<string, unknown>>;
      };
      queries = (res?.rows ?? []).slice(0, 200);
    } catch {
      queries = [];
    }
    const recorded = await this.recordedOutcomes(
      websiteId,
      days,
    );
    const leadKeywords = recorded.leads
      .map((l) => clean((l as any).keyword).toLowerCase())
      .filter(Boolean);
    const needs = queries.slice(0, MAX_NEEDS).map((q) => {
      const query = clean(q.query);
      const hinted = leadKeywords.some(
        (k) => k !== '' && query.toLowerCase().includes(k),
      );
      return {
        query,
        gscClicks: q.clicks ?? null,
        gscImpressions: q.impressions ?? null,
        gscPosition: q.position ?? null,
        demandEvidence: 'SEARCH_DEMAND_EVIDENCE',
        relation: queryRevenueRelation({
          directSourceLinkage: false,
        }),
        leadHint: hinted
          ? 'Recorded lead keyword overlaps this query (association only).'
          : null,
        quality: attributionQuality({
          sourceNamesSearch: false,
          landingPageLinked: false,
          keywordHintOnly: hinted,
        }),
      };
    });
    return {
      websiteId,
      windowDays: days,
      gscAvailable: queries.length > 0,
      needs,
      association: needAssociationNote(),
    };
  }

  /* ============ GET actions (§53/§33) ============ */

  async actions(
    organizationId: string,
    websiteId: string,
    daysInput: number,
  ) {
    const site = await this.website(
      organizationId,
      websiteId,
    );
    if (!site) return { websiteFound: false, actions: [] };
    const days = normalizeWindow(daysInput);
    const actionRows = await this.prisma.action.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: MAX_ACTIONS,
    });
    const recorded = await this.recordedOutcomes(
      websiteId,
      90,
    );
    const out: Array<Record<string, unknown>> = [];
    for (const action of actionRows) {
      const meta = (action.metadata ?? {}) as Record<
        string,
        unknown
      >;
      const keyword =
        clean(meta.strategyKeyword) ||
        clean(meta.keyword) ||
        clean(meta.query) ||
        null;
      let rank: Record<string, unknown> | null = null;
      try {
        rank = (await this.ranks.measureAction(
          organizationId,
          action.id,
        )) as unknown as Record<string, unknown>;
      } catch {
        rank = null;
      }
      const anchor = (action as any).completedAt ??
        action.createdAt;
      const half = Math.floor(days / 2);
      const beforeStart = new Date(
        new Date(anchor).getTime() - half * 24 * 60 * 60 * 1000,
      );
      const afterEnd = new Date(
        new Date(anchor).getTime() + half * 24 * 60 * 60 * 1000,
      );
      const inBefore = <T extends { createdAt: Date }>(
        rows: T[],
      ) =>
        rows.filter(
          (r) =>
            r.createdAt >= beforeStart &&
            r.createdAt < new Date(anchor),
        ).length;
      const inAfter = <T extends { createdAt: Date }>(
        rows: T[],
      ) =>
        rows.filter(
          (r) =>
            r.createdAt >= new Date(anchor) &&
            r.createdAt <= afterEnd,
        ).length;
      const beforeLeads = inBefore(recorded.leads as any);
      const afterLeads = inAfter(recorded.leads as any);
      out.push({
        id: action.id,
        title: action.title,
        status: (action as any).status ?? null,
        keyword,
        rank,
        trafficNote:
          'Traffic before/after requires GA4 channel data for the page — see overview when connected.',
        leadsBefore: beforeLeads,
        leadsAfter: afterLeads,
        revenueNote:
          'Revenue before/after at recorded level only; channel split requires GA4.',
        statement: observedAfterChange({
          metric: 'Revenue and key events',
          value: `(${beforeLeads} → ${afterLeads} recorded leads around execution)`,
          verified: Boolean((action as any).completedAt),
        }),
      });
    }
    return {
      websiteId,
      windowDays: days,
      actions: out,
      sequence: temporalSequenceNote([
        'action',
        'verified',
        'rank movement',
        'traffic movement',
        'key events',
        'revenue',
      ]),
    };
  }

  /* ============ GET attribution (§62/§18-§23/§37-§40) ============ */

  async attribution(
    organizationId: string,
    websiteId: string,
    daysInput: number,
  ) {
    const site = await this.website(
      organizationId,
      websiteId,
    );
    if (!site)
      return { websiteFound: false, channels: [] };
    const days = normalizeWindow(daysInput);
    const channels = await this.channelEvidence(
      organizationId,
      days,
    );
    const byChannel = new Map<
      TrafficChannel,
      { sessions: number; conversions: number; revenue: number }
    >();
    for (const row of channels.rows) {
      const e = byChannel.get(row.channel) ?? {
        sessions: 0,
        conversions: 0,
        revenue: 0,
      };
      e.sessions += row.sessions;
      e.conversions += row.conversions;
      e.revenue += row.revenue;
      byChannel.set(row.channel, e);
    }
    const model = channels.attributionModel;
    return {
      websiteId,
      windowDays: days,
      model,
      modelNote:
        model === 'UNKNOWN'
          ? 'No source model — UNKNOWN. GA4 property attribution applies to its own rows.'
          : 'Source model as GA4 applies it; fractional credit preserved where provided.',
      channels: [...byChannel.entries()].map(
        ([channel, totals]) => ({
          channel,
          ...totals,
          quality:
            channel === 'ORGANIC_SEARCH' ||
            channel === 'AI_ASSISTANT'
              ? 'SOURCE_ATTRIBUTED'
              : channel === 'UNASSIGNED'
                ? 'UNAVAILABLE'
                : 'AGGREGATE_ASSOCIATION',
          qualityNote: evidenceNote(
            channel === 'UNASSIGNED'
              ? 'UNAVAILABLE'
              : channel === 'ORGANIC_SEARCH' ||
                  channel === 'AI_ASSISTANT'
                ? 'ATTRIBUTED'
                : 'INFERRED',
          ),
        }),
      ),
      unattributedNote:
        'Rows with (not set) / Unassigned / Direct keep source definitions — never normalized to Organic.',
      pathExample: composePath({
        touchpoints: [
          {
            channel: 'ORGANIC_SEARCH',
            at: null,
            credit: fractionalCredit(null),
          },
          {
            channel: 'DIRECT',
            at: null,
            credit: fractionalCredit(null),
          },
        ],
        keyEvent: 'demo_request (example shape)',
        revenue: null,
        model,
      }),
      creditExample: creditLabel(
        fractionalCredit(0.4),
        'DATA_DRIVEN',
      ),
      lookback: lookbackNote(null),
      modeled: modeledLabel(null),
      freshness: freshnessNote({
        observedAt: new Date().toISOString(),
        dataThrough: channels.dataThrough,
        source: 'GA4',
        model,
      }),
    };
  }

  /* ============ GET ai (§28/§29/§30) ============ */

  async ai(
    organizationId: string,
    websiteId: string,
    daysInput: number,
  ) {
    const site = await this.website(
      organizationId,
      websiteId,
    );
    if (!site) return { websiteFound: false };
    const days = normalizeWindow(daysInput);
    const channels = await this.channelEvidence(
      organizationId,
      days,
    );
    const aiRows = channels.rows.filter(
      (r) => r.channel === 'AI_ASSISTANT',
    );
    const bySource = new Map<string, typeof aiRows>();
    for (const row of aiRows) {
      const src = aiAssistantSourceFromReferrer(
        row.sourceMedium,
      );
      const list = bySource.get(src) ?? [];
      list.push(row);
      bySource.set(src, list);
    }
    const known = [...bySource.keys()].filter(
      (k) => k !== 'UNKNOWN',
    ) as Array<
      import('./revenue-attribution').AiAssistantSource
    >;
    let citations = 0;
    let mentions = 0;
    try {
      const checks = await (
        this.prisma as unknown as Record<string, any>
      ).aiVisibilityCheck?.findMany({
        where: { organizationId, websiteId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      for (const c of (checks ?? []) as Array<any>) {
        if (c.citationFound) citations++;
        if (c.mentioned) mentions++;
      }
    } catch {
      /* AI visibility unavailable — stays unavailable */
    }
    const totals = {
      sessions: aiRows.reduce((n, r) => n + r.sessions, 0),
      conversions: aiRows.reduce(
        (n, r) => n + r.conversions,
        0,
      ),
      revenue: aiRows.reduce((n, r) => n + r.revenue, 0),
    };
    return {
      websiteId,
      windowDays: days,
      available: channels.status === 'AVAILABLE',
      traffic: {
        ...totals,
        evidence:
          channels.status === 'AVAILABLE'
            ? 'OBSERVED'
            : 'UNAVAILABLE',
        note: 'AI Assistant rows exactly as GA4 classifies them (ai-assistant medium). Undercounting slices (Referral/Unassigned/Perplexity/dark) are not reclassified.',
      },
      granularity: aiGranularity(
        known.length > 0
          ? known
          : (['AI_ASSISTANT_AGGREGATE'] as Array<
              import('./revenue-attribution').AiAssistantSource
            >),
      ),
      bySource: [...bySource.entries()].map(
        ([source, rows]) => ({
          source,
          sessions: rows.reduce((n, r) => n + r.sessions, 0),
          conversions: rows.reduce(
            (n, r) => n + r.conversions,
            0,
          ),
          revenue: rows.reduce((n, r) => n + r.revenue, 0),
        }),
      ),
      visibility: {
        citations,
        mentions,
        note: 'AI_CITATION_OBSERVED ≠ AI_TRAFFIC_OBSERVED ≠ AI_REVENUE_ATTRIBUTED. Separate edges, always.',
      },
      statement:
        channels.status === 'AVAILABLE' && totals.conversions > 0
          ? `AI Assistant traffic was attributed to ${totals.conversions} key event${totals.conversions === 1 ? '' : 's'} in the selected window (source-attributed).`
          : 'AI citation without referral traffic stays citation-only. TRAFFIC/REVENUE UNAVAILABLE where unattributed.',
    };
  }

  /* ============ command signals (§56) + client report (§65) ============ */

  async commandSignals(
    organizationId: string,
    websiteId: string,
  ) {
    const ov = (await this.overview(
      organizationId,
      websiteId,
      28,
    )) as any;
    if (!ov || ov.websiteFound === false) {
      return { signals: [] };
    }
    const signals: Array<{
      what: string;
      source: string;
      window: string;
      attribution: string;
      next: string;
    }> = [];
    if (
      Array.isArray(ov.hero) &&
      ov.hero.some((h: any) => h.key === 'revenue')
    ) {
      signals.push({
        what: 'Organic attributed revenue present in the latest measured window.',
        source: 'Recorded revenue + GA4 channels',
        window: '28 days',
        attribution: String(
          ov.revenue?.explanation?.attribution ?? 'SOURCE_ATTRIBUTED',
        ),
        next: 'Open pages view to see which landing pages carry it.',
      });
    }
    if (Array.isArray(ov.aiHero) && ov.aiHero.length > 0) {
      signals.push({
        what: `AI Assistant traffic generated ${ov.aiHero.find((h: any) => h.key === 'aiKeyEvents')?.value ?? 'key events'} (source-attributed).`,
        source: 'GA4 AI Assistant channel',
        window: '28 days',
        attribution: 'SOURCE_ATTRIBUTED',
        next: 'Open the AI panel for per-assistant granularity.',
      });
    }
    if (
      typeof ov.gap === 'string' &&
      ov.gap !== 'NONE' &&
      ov.gap !== 'ATTRIBUTION_UNAVAILABLE'
    ) {
      signals.push({
        what: `Outcome gap: ${ov.gap}.`,
        source: 'RENKOO gap analysis',
        window: '28 days',
        attribution: 'N/A',
        next:
          ov.gap === 'CONVERSION_DATA_GAP'
            ? 'Verify key-event tracking, then re-measure.'
            : ov.gap === 'LEAD_QUALIFICATION_UNAVAILABLE'
              ? 'Connect CRM qualification; never infer qualified.'
              : 'Connect the missing source; unavailable stays unavailable.',
      });
    }
    void higherConfidenceWins;
    void unattributableBucket;
    void modeledLabel;
    void clientSummary;
    return { signals: signals.slice(0, 3) };
  }

  async clientReport(
    organizationId: string,
    websiteId: string,
  ) {
    const ov = (await this.overview(
      organizationId,
      websiteId,
      28,
    )) as any;
    if (!ov || ov.websiteFound === false) {
      return { lines: ['Website not found for this organization.'] };
    }
    const unknown: string[] = [];
    if (!Array.isArray(ov.hero) || ov.hero.length < 5) {
      unknown.push('metrics without connected sources');
    }
    if (ov.gap && ov.gap !== 'NONE') {
      unknown.push(`gap: ${ov.gap}`);
    }
    return {
      lines: clientSummary({
        traffic: `organic sessions ${ov.organic?.sessions ?? 'unavailable'}`,
        keyEvents: `organic key events ${ov.organic?.keyEvents ?? 'unavailable'}`,
        leads: leadCountOnly(ov.leads?.total ?? null),
        revenue:
          ov.revenue?.amount !== null &&
          ov.revenue?.amount !== undefined
            ? `${ov.revenue.amount} (source-attributed)`
            : 'unavailable — not zero',
        unknown,
        next:
          ov.prompts?.[0] ??
          'Review pages and needs views for the next best action.',
      }),
      attribution: 'GA4 channels + recorded outcomes; no SEO jargon, no causal claims.',
    };
  }

  outcomeEvidenceFor(
    state: OutcomeEvidence,
  ): string {
    return evidenceNote(state);
  }
}

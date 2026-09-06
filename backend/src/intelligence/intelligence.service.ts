import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { BusinessBrainService } from '../business-brain/business-brain.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { AiVisibilityService } from '../ai-visibility/ai-visibility.service';
import { ActionsService } from '../actions/actions.service';
import { GoogleService } from '../google/google.service';
import { RoiService } from '../roi/roi.service';
import { ReportsService } from '../reports/reports.service';
import { LocalSeoService } from '../local-seo/local-seo.service';
import { ContentService } from '../content/content.service';
import { BacklinksService } from '../backlinks/backlinks.service';

import {
  routeIntent,
  type IntelligenceIntent,
} from './intent';

export interface EvidenceItem {
  source: string;
  metric: string;
  value?: string | number | null;
  previousValue?: string | number | null;
  currentValue?: string | number | null;
  change?: string | number | null;
  timestamp?: string | null;
  pageUrl?: string | null;
  entity?: string | null;
  note?: string | null;
}

export interface OpportunityLink {
  id: string;
  title: string;
  priority: string;
  score: number;
  source: string;
  recommendation: string | null;
  recommendationId: string | null;
}

const DETERMINISTIC_LABEL =
  'RENKOO analysis (deterministic, no LLM used)';

/*
 * NOTE on untrusted data: website content, crawl text and
 * competitor names are treated as DATA. Answers are built
 * from fixed templates with escaped values interpolated
 * only as facts — stored text can never change routing,
 * tenant scope, or the response contract.
 */
function clean(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

function isoDaysAgo(days: number): string {
  const date = new Date();

  date.setDate(date.getDate() - days);

  return date
    .toISOString()
    .slice(0, 10);
}

@Injectable()
export class IntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessBrainService: BusinessBrainService,
    private readonly recommendationsService: RecommendationsService,
    private readonly monitoringService: MonitoringService,
    private readonly aiVisibilityService: AiVisibilityService,
    private readonly actionsService: ActionsService,
    private readonly googleService: GoogleService,
    private readonly roiService: RoiService,
    private readonly reportsService: ReportsService,
    private readonly localSeoService: LocalSeoService,
    private readonly contentService: ContentService,
    private readonly backlinksService: BacklinksService,
  ) {}

  // =========================================================
  // ASK
  // =========================================================

  async ask(
    organizationId: string,
    websiteId: string,
    rawQuestion: string,
  ) {
    const question = clean(rawQuestion);

    if (!question) {
      throw new BadRequestException(
        'question is required',
      );
    }

    const website =
      await this.prisma.website.findFirst({
        where: {
          id: websiteId,
          organizationId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          url: true,
        },
      });

    if (!website) {
      throw new NotFoundException(
        'Website not found',
      );
    }

    const { intent, matchedKeywords } =
      routeIntent(question);

    const context =
      await this.getContext(
        organizationId,
        websiteId,
      );

    const dataAvailability: Record<
      string,
      string
    > = {};
    const evidence: EvidenceItem[] =
      [];
    const keySignals: string[] = [];
    const why: string[] = [];
    const limitations: string[] = [];
    let opportunities: OpportunityLink[] =
      [];
    const suggestedActions: string[] =
      [];

    switch (intent) {
      case 'WHAT_CHANGED':
        await this.retrieveChanges(
          organizationId,
          websiteId,
          dataAvailability,
          evidence,
          keySignals,
          why,
          limitations,
        );
        break;

      case 'WHY_TRAFFIC':
      case 'TRAFFIC':
        await this.retrieveTraffic(
          organizationId,
          websiteId,
          dataAvailability,
          evidence,
          keySignals,
          why,
          limitations,
        );
        await this.retrieveSeo(
          organizationId,
          websiteId,
          dataAvailability,
          evidence,
          keySignals,
          limitations,
          false,
        );
        break;

      case 'WHAT_FIX_FIRST':
      case 'TOP_OPPORTUNITIES':
      case 'GROWTH_BLOCKERS':
        await this.retrieveOpportunities(
          organizationId,
          websiteId,
          dataAvailability,
          evidence,
          keySignals,
          limitations,
        ).then((result) => {
          opportunities = result;
        });
        await this.retrieveSeo(
          organizationId,
          websiteId,
          dataAvailability,
          evidence,
          keySignals,
          limitations,
          false,
        );
        break;

      case 'OPEN_ACTIONS':
        await this.retrieveActions(
          organizationId,
          websiteId,
          dataAvailability,
          evidence,
          keySignals,
          limitations,
        );
        break;

      case 'COMPETITOR_AHEAD':
        await this.retrieveCompetitors(
          organizationId,
          websiteId,
          dataAvailability,
          evidence,
          keySignals,
          why,
          limitations,
        );
        break;

      case 'AI_VISIBILITY':
        await this.retrieveAiVisibility(
          organizationId,
          websiteId,
          dataAvailability,
          evidence,
          keySignals,
          why,
          limitations,
        );
        break;

      case 'SEO_HEALTH':
        await this.retrieveSeo(
          organizationId,
          websiteId,
          dataAvailability,
          evidence,
          keySignals,
          limitations,
          true,
        );
        break;

      case 'LEADS_REVENUE':
        await this.retrieveLeadsRevenue(
          organizationId,
          websiteId,
          dataAvailability,
          evidence,
          keySignals,
          limitations,
        );
        break;

      case 'MONITORING':
        await this.retrieveAlerts(
          organizationId,
          websiteId,
          dataAvailability,
          evidence,
          keySignals,
          limitations,
        );
        break;

      case 'CONTENT':
        await this.retrieveContent(
          organizationId,
          websiteId,
          dataAvailability,
          evidence,
          keySignals,
          why,
          limitations,
        );
        break;

      case 'BACKLINKS':
        await this.retrieveBacklinks(
          organizationId,
          websiteId,
          dataAvailability,
          evidence,
          keySignals,
          why,
          limitations,
        );
        break;

      case 'LOCAL_SEO':
        await this.retrieveLocal(
          organizationId,
          websiteId,
          dataAvailability,
          evidence,
          keySignals,
          why,
          limitations,
        );
        break;

      case 'BUSINESS_OVERVIEW':
      case 'GENERAL':
      default:
        await this.retrieveOverview(
          organizationId,
          websiteId,
          dataAvailability,
          evidence,
          keySignals,
          limitations,
        );
        break;
    }

    const answer = this.composeAnswer(
      intent,
      website.name,
      context?.priorities
        ?.primaryGoal ?? null,
      evidence,
      keySignals,
      opportunities,
      limitations,
    );

    for (const item of opportunities.slice(
      0,
      3,
    )) {
      suggestedActions.push(
        `Start "${item.title}" [${item.priority}] from the Opportunity Engine.`,
      );
    }

    if (
      opportunities.length === 0 &&
      (intent === 'WHAT_FIX_FIRST' ||
        intent === 'TOP_OPPORTUNITIES' ||
        intent === 'GROWTH_BLOCKERS')
    ) {
      suggestedActions.push(
        'Run a website crawl and an AI visibility check to generate fresh evidence-backed opportunities.',
      );
    }

    const confidence =
      evidence.length >= 4
        ? 'HIGH'
        : evidence.length >= 1
          ? 'MEDIUM'
          : 'LOW';

    if (evidence.length === 0) {
      limitations.push(
        "I don't have enough connected data to determine that.",
      );
    }

    return {
      website: {
        id: website.id,
        name: website.name,
        url: website.url,
      },
      question,
      intent,
      matchedKeywords,
      answer,
      answerSource: DETERMINISTIC_LABEL,
      confidence,
      confidenceNote:
        'Confidence reflects how much RENKOO evidence was available, not model certainty.',
      businessPriority:
        context?.priorities
          ?.primaryGoal ?? null,
      evidence,
      keySignals,
      why,
      opportunities,
      suggestedActions,
      dataAvailability,
      limitations,
      llm: {
        available: false,
        reason:
          'No LLM provider is configured. This answer was composed deterministically from RENKOO database records only.',
      },
    };
  }

  // =========================================================
  // AGENCY QUESTIONS (organization-wide, real aggregates)
  // =========================================================

  async askAgency(
    organizationId: string,
    rawQuestion: string,
  ) {
    const question = clean(rawQuestion);

    if (!question) {
      throw new BadRequestException(
        'question is required',
      );
    }

    const text = question.toLowerCase();
    const center =
      await this.reportsService.commandCenter(
        organizationId,
      );

    const evidence: EvidenceItem[] =
      [];
    const keySignals: string[] = [];
    const limitations: string[] = [];
    let answer: string;

    if (
      /attention|first|priorit/.test(
        text,
      )
    ) {
      const top = center.entries[0];

      answer = top
        ? `${top.website.name}${top.client ? ` (${top.client.name})` : ''} needs attention first: ${top.highOpportunities} high-priority opportunities, ${top.openActions} open actions, ${top.activeAlerts} active alerts.`
        : 'No websites are tracked yet.';

      for (const entry of center.entries.slice(
        0,
        5,
      )) {
        evidence.push({
          source: 'AGENCY',
          metric: 'attention',
          value: `score ${entry.attention}`,
          entity: entry.website.name,
          note: `${entry.highOpportunities} high, ${entry.openActions} actions, ${entry.activeAlerts} alerts.`,
        });
      }

      keySignals.push(
        `${center.needingAttention} of ${center.totalWebsites} websites need attention.`,
      );
    } else if (
      /opportunit|biggest/.test(text)
    ) {
      const ranked = [...center.entries]
        .sort(
          (a, b) =>
            b.highOpportunities -
            a.highOpportunities,
        )
        .slice(0, 5);

      answer = ranked[0]
        ? `${ranked[0].website.name} holds the biggest opportunity backlog with ${ranked[0].highOpportunities} high-priority items.`
        : 'No websites are tracked yet.';

      for (const entry of ranked) {
        evidence.push({
          source: 'AGENCY',
          metric: 'high_opportunities',
          value:
            entry.highOpportunities,
          entity:
            entry.website.name,
        });
      }
    } else if (
      /changed|change/.test(text)
    ) {
      const lines: string[] = [];

      for (const entry of center.entries.slice(
        0,
        5,
      )) {
        try {
          const result =
            await this.monitoringService.getChanges(
              organizationId,
              entry.website.id,
            );
          const items: any[] =
            result.changes ?? [];

          if (items.length > 0) {
            lines.push(
              `${entry.website.name}: ${items.length} meaningful changes, latest "${items[0].title}".`,
            );
            evidence.push({
              source: 'MONITORING',
              metric:
                'meaningful_changes',
              value: items.length,
              entity:
                entry.website.name,
              note: items[0].title,
            });
          }
        } catch {
          limitations.push(
            `Change detection unavailable for ${entry.website.name}.`,
          );
        }
      }

      answer =
        lines.length > 0
          ? lines.join('\n')
          : 'No meaningful changes detected across tracked websites.';
    } else if (
      /report|sent|deliver/.test(text)
    ) {
      const missing = center.entries.filter(
        (entry) =>
          !entry.latestReport,
      );

      answer =
        missing.length > 0
          ? `${missing.length} websites have no report yet: ${missing
              .slice(0, 5)
              .map(
                (entry) =>
                  entry.website.name,
              )
              .join(', ')}.`
          : 'Every tracked website has at least one report.';

      for (const entry of center.entries.slice(
        0,
        8,
      )) {
        evidence.push({
          source: 'REPORTS',
          metric: 'latest_report',
          value: entry.latestReport
            ? entry.latestReport.title
            : 'none',
          entity:
            entry.website.name,
        });
      }
    } else {
      const openActions =
        center.entries.reduce(
          (sum, entry) =>
            sum + entry.openActions,
          0,
        );

      answer = `${openActions} actions remain open across ${center.totalWebsites} websites. ${center.needingAttention} websites need attention.`;

      for (const entry of center.entries
        .filter(
          (item) =>
            item.openActions > 0,
        )
        .slice(0, 8)) {
        evidence.push({
          source: 'ACTIONS',
          metric: 'open_actions',
          value: entry.openActions,
          entity:
            entry.website.name,
        });
      }

      if (openActions === 0) {
        limitations.push(
          'No open actions exist in this organization.',
        );
      }
    }

    return {
      question,
      answer,
      answerSource:
        DETERMINISTIC_LABEL,
      confidence:
        evidence.length >= 3
          ? 'HIGH'
          : evidence.length >= 1
            ? 'MEDIUM'
            : 'LOW',
      evidence,
      keySignals,
      limitations,
      llm: {
        available: false,
        reason:
          'No LLM provider is configured. This answer was composed deterministically from organization records only.',
      },
    };
  }

  // =========================================================
  // EXPLICIT ACTION CREATION (no silent execution)
  // =========================================================

  async createAction(
    organizationId: string,
    websiteId: string,
    recommendationId?: string,
    opportunityId?: string,
  ) {
    const website =
      await this.prisma.website.findFirst({
        where: {
          id: websiteId,
          organizationId,
          isActive: true,
        },
        select: { id: true },
      });

    if (!website) {
      throw new NotFoundException(
        'Website not found',
      );
    }

    if (recommendationId) {
      return this.recommendationsService.createActionFromRecommendation(
        organizationId,
        recommendationId,
      );
    }

    if (opportunityId) {
      const unified =
        await this.recommendationsService.getUnifiedOpportunities(
          organizationId,
          websiteId,
        );

      const match = (
        unified.opportunities ?? []
      ).find(
        (item: any) =>
          item.id === opportunityId,
      );

      if (!match) {
        throw new NotFoundException(
          'Opportunity not found',
        );
      }

      if (
        match.id === match.sourceId &&
        !String(match.id).includes(':')
      ) {
        return this.recommendationsService.createActionFromRecommendation(
          organizationId,
          match.sourceId,
        );
      }

      return this.actionsService.createAction(
        organizationId,
        {
          websiteId,
          type:
            match.type ||
            match.source,
          title: match.title,
          description:
            match.recommendation ||
            match.description,
          url:
            match.pageUrl ??
            undefined,
          priority:
            match.priority,
          metadata: {
            source: match.source,
            sourceId:
              match.sourceId,
            opportunityId:
              match.id,
            score: match.score,
            via: 'RENKOO_INTELLIGENCE',
          },
        },
      );
    }

    throw new BadRequestException(
      'recommendationId or opportunityId is required',
    );
  }

  // =========================================================
  // CONTEXT
  // =========================================================

  private async getContext(
    organizationId: string,
    websiteId: string,
  ) {
    try {
      return await this.businessBrainService.getBusinessContext(
        organizationId,
        websiteId,
      );
    } catch {
      return null;
    }
  }

  // =========================================================
  // RETRIEVAL (intent-specific, lightweight)
  // =========================================================

  private async retrieveSeo(
    organizationId: string,
    websiteId: string,
    dataAvailability: Record<
      string,
      string
    >,
    evidence: EvidenceItem[],
    keySignals: string[],
    limitations: string[],
    verbose: boolean,
  ) {
    void organizationId;

    const latest =
      await this.prisma.crawl.findFirst({
        where: {
          websiteId,
          status: 'COMPLETED',
        },
        orderBy: {
          completedAt: 'desc',
        },
        select: {
          id: true,
          completedAt: true,
        },
      });

    if (!latest) {
      dataAvailability.crawl =
        'NO_DATA';
      limitations.push(
        'No completed crawl exists, so technical SEO cannot be assessed.',
      );
      return;
    }

    const pages =
      await this.prisma.crawlPage.findMany({
        where: {
          crawlId: latest.id,
        },
        select: {
          issues: {
            where: {
              status: 'OPEN',
            },
            select: {
              severity: true,
              code: true,
            },
          },
        },
      });

    const bySeverity: Record<
      string,
      number
    > = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };

    let open = 0;

    for (const page of pages) {
      for (const issue of page.issues) {
        open += 1;
        const key = String(
          issue.severity,
        ).toUpperCase();

        if (
          bySeverity[key] !== undefined
        ) {
          bySeverity[key] += 1;
        }
      }
    }

    const penalty =
      bySeverity.CRITICAL * 20 +
      bySeverity.HIGH * 10 +
      bySeverity.MEDIUM * 5 +
      bySeverity.LOW * 2;
    const score = Math.max(
      0,
      Math.min(100, 100 - penalty),
    );

    dataAvailability.crawl =
      'AVAILABLE';

    evidence.push({
      source: 'TECHNICAL_SEO',
      metric: 'seo_health_score',
      value: score,
      timestamp:
        latest.completedAt?.toISOString() ??
        null,
      note: 'Canonical 0-100 score from OPEN issue penalties.',
    });

    evidence.push({
      source: 'TECHNICAL_SEO',
      metric: 'open_issues',
      value: open,
      timestamp:
        latest.completedAt?.toISOString() ??
        null,
      note: `CRITICAL ${bySeverity.CRITICAL}, HIGH ${bySeverity.HIGH}, MEDIUM ${bySeverity.MEDIUM}, LOW ${bySeverity.LOW} across ${pages.length} pages.`,
    });

    keySignals.push(
      `Technical SEO score is ${score}/100 with ${open} open issues.`,
    );

    if (
      verbose &&
      bySeverity.CRITICAL > 0
    ) {
      keySignals.push(
        `${bySeverity.CRITICAL} CRITICAL issues need attention first.`,
      );
    }
  }

  private async retrieveOpportunities(
    organizationId: string,
    websiteId: string,
    dataAvailability: Record<
      string,
      string
    >,
    evidence: EvidenceItem[],
    keySignals: string[],
    limitations: string[],
  ): Promise<
    Array<{
      id: string;
      title: string;
      priority: string;
      score: number;
      source: string;
      recommendation: string | null;
      recommendationId: string | null;
    }>
  > {
    try {
      const unified =
        await this.recommendationsService.getUnifiedOpportunities(
          organizationId,
          websiteId,
        );

      const items: any[] =
        unified.opportunities ?? [];

      if (items.length === 0) {
        dataAvailability.opportunities =
          'NO_DATA';
        limitations.push(
          'The opportunity queue is empty. Run crawls and scans to generate evidence-backed items.',
        );
        return [];
      }

      dataAvailability.opportunities =
        'AVAILABLE';

      const top = items.slice(0, 5);

      for (const item of top) {
        evidence.push({
          source: item.source,
          metric: 'opportunity',
          value: `${item.priority} · score ${item.score}`,
          entity: item.title,
          note:
            item.recommendation ??
            item.description ??
            null,
        });
      }

      keySignals.push(
        `${unified.total} open opportunities (${unified.summary?.high ?? 0} high priority).`,
      );

      return top.map(
        (item: any) => ({
          id: item.id,
          title: item.title,
          priority: item.priority,
          score: item.score,
          source: item.source,
          recommendation:
            item.recommendation ??
            item.description ??
            null,
          recommendationId:
            item.id ===
              item.sourceId &&
            !String(item.id).includes(
              ':',
            )
              ? item.sourceId
              : null,
        }),
      );
    } catch {
      dataAvailability.opportunities =
        'NO_DATA';
      limitations.push(
        'Opportunities could not be loaded.',
      );
      return [];
    }
  }

  private async retrieveActions(
    organizationId: string,
    websiteId: string,
    dataAvailability: Record<
      string,
      string
    >,
    evidence: EvidenceItem[],
    keySignals: string[],
    limitations: string[],
  ) {
    const open =
      await this.prisma.action.findMany({
        where: {
          organizationId,
          websiteId,
          status: {
            in: [
              'TODO',
              'IN_PROGRESS',
            ],
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
        take: 10,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          type: true,
          updatedAt: true,
        },
      });

    if (open.length === 0) {
      dataAvailability.actions =
        'NO_DATA';
      limitations.push(
        'No open actions exist for this website.',
      );
      return;
    }

    dataAvailability.actions =
      'AVAILABLE';

    keySignals.push(
      `${open.length} open actions (showing up to 10 most recent).`,
    );

    for (const action of open) {
      evidence.push({
        source: 'ACTIONS',
        metric: 'open_action',
        value: `${action.status} · ${action.priority}`,
        entity: action.title,
        timestamp:
          action.updatedAt?.toISOString() ??
          null,
        note: `Type ${action.type}.`,
      });
    }
  }

  private async retrieveChanges(
    organizationId: string,
    websiteId: string,
    dataAvailability: Record<
      string,
      string
    >,
    evidence: EvidenceItem[],
    keySignals: string[],
    why: string[],
    limitations: string[],
  ) {
    try {
      const result =
        await this.monitoringService.getChanges(
          organizationId,
          websiteId,
        );

      if (result.notEnoughData) {
        dataAvailability.monitoring =
          'INSUFFICIENT_HISTORY';
        limitations.push(
          result.notEnoughDataReason ??
            'Not enough crawl history to detect changes.',
        );
        return;
      }

      const items: any[] =
        result.changes ?? [];

      if (items.length === 0) {
        dataAvailability.monitoring =
          'AVAILABLE';
        keySignals.push(
          'Crawls agree with each other — no meaningful changes detected.',
        );

        if (
          result.suppressedNoise > 0
        ) {
          why.push(
            `${result.suppressedNoise} tiny movements were suppressed as noise.`,
          );
        }

        return;
      }

      dataAvailability.monitoring =
        'AVAILABLE';

      keySignals.push(
        `${items.length} meaningful changes detected between the last crawls.`,
      );

      for (const item of items.slice(
        0,
        6,
      )) {
        evidence.push({
          source: 'MONITORING',
          metric: item.metric,
          previousValue:
            item.previousValue,
          currentValue:
            item.currentValue,
          change:
            item.pointChange ??
            item.absoluteChange,
          timestamp:
            item.detectedAt ?? null,
          entity: item.title,
          note: `${item.severity} · ${item.direction}.`,
        });

        for (const reason of item.why ??
          []) {
          if (
            !why.includes(reason)
          ) {
            why.push(reason);
          }
        }
      }
    } catch {
      dataAvailability.monitoring =
        'NO_DATA';
      limitations.push(
        'Change detection is unavailable right now.',
      );
    }
  }

  private async retrieveAlerts(
    organizationId: string,
    websiteId: string,
    dataAvailability: Record<
      string,
      string
    >,
    evidence: EvidenceItem[],
    keySignals: string[],
    limitations: string[],
  ) {
    try {
      const result =
        await this.monitoringService.listAlerts(
          organizationId,
          { websiteId },
        );

      if (
        (result as any)
          .storageReady === false
      ) {
        dataAvailability.monitoring =
          'NO_DATA';
        limitations.push(
          'The alert store is unavailable.',
        );
        return;
      }

      const alerts: any[] =
        result.alerts ?? [];

      if (alerts.length === 0) {
        dataAvailability.monitoring =
          'AVAILABLE';
        keySignals.push(
          'No monitoring alerts are active.',
        );
        return;
      }

      dataAvailability.monitoring =
        'AVAILABLE';

      const unread = alerts.filter(
        (alert) =>
          alert.status ===
          'DETECTED',
      ).length;

      keySignals.push(
        `${alerts.length} alerts (${unread} unread).`,
      );

      for (const alert of alerts.slice(
        0,
        6,
      )) {
        evidence.push({
          source: 'MONITORING',
          metric: 'alert',
          value: `${alert.severity} · ${alert.status}`,
          entity: alert.title,
          timestamp:
            alert.detectedAt ?? null,
          note:
            alert.description?.slice(
              0,
              200,
            ) ?? null,
        });
      }
    } catch {
      dataAvailability.monitoring =
        'NO_DATA';
      limitations.push(
        'Alerts could not be loaded.',
      );
    }
  }

  private async retrieveAiVisibility(
    organizationId: string,
    websiteId: string,
    dataAvailability: Record<
      string,
      string
    >,
    evidence: EvidenceItem[],
    keySignals: string[],
    why: string[],
    limitations: string[],
  ) {
    try {
      const intel =
        await this.aiVisibilityService.getIntelligence(
          organizationId,
          websiteId,
        );

      if (
        intel.counts.completedChecks ===
        0
      ) {
        dataAvailability.ai_visibility =
          'NO_DATA';
        limitations.push(
          'No completed AI observations exist. Track prompts and record observations first.',
        );
        return;
      }

      dataAvailability.ai_visibility =
        'AVAILABLE';

      evidence.push({
        source: 'AI_VISIBILITY',
        metric: 'brand_mentions',
        value:
          intel.counts.brandMentions,
        note: `Across ${intel.counts.completedChecks} completed observations.`,
      });

      if (intel.shareOfVoice) {
        evidence.push({
          source: 'AI_VISIBILITY',
          metric:
            'share_of_recorded_mentions',
          value: `${intel.shareOfVoice.brand}% brand`,
          note: `Competitors ${intel.shareOfVoice.competitors}% of ${intel.shareOfVoice.denominator} recorded mention events. Not a market share.`,
        });

        keySignals.push(
          `Brand holds ${intel.shareOfVoice.brand}% of recorded AI mention events.`,
        );
      }

      if (
        intel.trend?.pointChange !==
          null &&
        intel.trend?.pointChange !==
          undefined
      ) {
        evidence.push({
          source: 'AI_VISIBILITY',
          metric: 'mention_rate_trend',
          change: `${intel.trend.pointChange} pts`,
          note: `Recent ${intel.trend.recentMentionRate}% vs older ${intel.trend.olderMentionRate}%.`,
        });
      }

      for (const gap of intel.gaps.slice(
        0,
        3,
      )) {
        why.push(
          `${gap.title}: ${gap.description}`,
        );
      }

      if (intel.gaps.length === 0) {
        keySignals.push(
          'No AI visibility gaps in recorded observations.',
        );
      }
    } catch {
      dataAvailability.ai_visibility =
        'NO_DATA';
      limitations.push(
        'AI visibility data could not be loaded.',
      );
    }
  }

  private async retrieveLocal(
    organizationId: string,
    websiteId: string,
    dataAvailability: Record<
      string,
      string
    >,
    evidence: EvidenceItem[],
    keySignals: string[],
    why: string[],
    limitations: string[],
  ) {
    try {
      const [health, locations] =
        await Promise.all([
          this.localSeoService.getHealth(
            organizationId,
            websiteId,
          ),
          this.localSeoService.listLocations(
            organizationId,
            websiteId,
          ),
        ]);

      dataAvailability.local_seo =
        health.overall === 'GOOD'
          ? 'AVAILABLE'
          : 'NO_DATA';

      evidence.push({
        source: 'LOCAL_SEO',
        metric: 'overall_state',
        value: health.overall,
        note: health.overallNote,
      });

      evidence.push({
        source: 'LOCAL_SEO',
        metric: 'tracked_locations',
        value: locations.total,
        note:
          locations.locations
            .slice(0, 5)
            .map(
              (location: any) =>
                location.name,
            )
            .join(', ') || 'none',
      });

      for (const area of health.areas) {
        evidence.push({
          source: 'LOCAL_SEO',
          metric: `area_${area.key}`,
          value: area.state,
          note: area.evidence,
        });

        if (
          area.state === 'DATA_GAP' ||
          area.state === 'ATTENTION'
        ) {
          why.push(
            `${area.title}: ${area.evidence}`,
          );
        }

        if (area.limitation) {
          limitations.push(
            area.limitation,
          );
        }
      }

      if (health.overall === 'GOOD') {
        keySignals.push(
          'Local setup is complete for the evidence available.',
        );
      }

      limitations.push(
        'Local rankings, reviews and GBP data are unavailable: no ranking, review or GBP source is connected. Positions are never estimated.',
      );
    } catch {
      dataAvailability.local_seo =
        'NO_DATA';
      limitations.push(
        'Local SEO data could not be loaded.',
      );
    }
  }

  private async retrieveContent(
    organizationId: string,
    websiteId: string,
    dataAvailability: Record<
      string,
      string
    >,
    evidence: EvidenceItem[],
    keySignals: string[],
    why: string[],
    limitations: string[],
  ) {
    try {
      const end = new Date();
      const start = new Date(end);
      start.setDate(
        start.getDate() - 28,
      );

      const format = (date: Date) =>
        date.toISOString().slice(0, 10);

      const [items, briefs, opportunities] =
        await Promise.all([
          this.contentService
            .listItems(
              organizationId,
              websiteId,
            )
            .catch(() => null),
          this.contentService
            .listBriefs(
              organizationId,
              websiteId,
            )
            .catch(() => null),
          this.contentService
            .getOpportunities(
              organizationId,
              format(start),
              format(end),
              websiteId,
            )
            .catch(() => null),
        ]);

      if (!opportunities) {
        dataAvailability.content =
          'NO_DATA';
        limitations.push(
          'Content opportunity data is unavailable: GSC is likely not connected.',
        );
        return;
      }

      dataAvailability.content =
        'AVAILABLE';

      const rows: any[] =
        opportunities.opportunities ??
        [];

      evidence.push({
        source: 'CONTENT',
        metric: 'gsc_opportunities',
        value: rows.length,
        note: `Across ${opportunities.startDate} to ${opportunities.endDate} of GSC query data.`,
      });

      const top = rows.slice(0, 3);

      for (const row of top) {
        evidence.push({
          source: 'CONTENT',
          metric: 'top_opportunity',
          value: row.query,
          note: `${row.impressions} impressions, position ${row.position}, type ${row.type}.`,
        });

        why.push(
          `${row.query}: ${row.whyItMatters ?? row.recommendation ?? ''}`,
        );
      }

      evidence.push({
        source: 'CONTENT',
        metric: 'workspace_items',
        value: items?.total ?? 0,
        note: `${briefs?.total ?? 0} evidence brief(s) persisted.`,
      });

      if (rows.length === 0) {
        keySignals.push(
          'No GSC content opportunities in the last 28 days.',
        );
      }

      limitations.push(
        'GSC impressions are demand signals, not search volume. No SERP provider is connected.',
      );
    } catch {
      dataAvailability.content =
        'NO_DATA';
      limitations.push(
        'Content data could not be loaded.',
      );
    }
  }

  private async retrieveBacklinks(
    organizationId: string,
    websiteId: string,
    dataAvailability: Record<
      string,
      string
    >,
    evidence: EvidenceItem[],
    keySignals: string[],
    why: string[],
    limitations: string[],
  ) {
    try {
      const [overview, opportunities, gap] =
        await Promise.all([
          this.backlinksService
            .getOverview(
              organizationId,
              websiteId,
            )
            .catch(() => null),
          this.backlinksService
            .getOpportunities(
              organizationId,
              websiteId,
            )
            .catch(() => null),
          this.backlinksService
            .getCompetitorGap(
              organizationId,
              websiteId,
            )
            .catch(() => null),
        ]);

      if (!overview) {
        dataAvailability.backlinks =
          'NO_DATA';
        limitations.push(
          'Backlink data could not be loaded.',
        );
        return;
      }

      const total: number =
        overview.summary?.totalBacklinks ??
        0;

      if (total === 0) {
        dataAvailability.backlinks =
          'NO_DATA';
        limitations.push(
          'No backlinks are recorded. Import backlink data to enable analysis; no provider is connected.',
        );
        return;
      }

      dataAvailability.backlinks =
        'AVAILABLE';

      evidence.push({
        source: 'BACKLINKS',
        metric: 'total_backlinks',
        value: total,
        note: `Across ${overview.summary?.referringDomains ?? 0} referring domains (imported records).`,
      });

      evidence.push({
        source: 'BACKLINKS',
        metric: 'follow_split',
        value: `${overview.summary?.dofollowLinks ?? 0} dofollow / ${overview.summary?.nofollowLinks ?? 0} nofollow`,
        note: 'Authority numbers are source-supplied, never measured by RENKOO.',
      });

      const history: string =
        overview.summary?.history ??
        'NO_HISTORY';

      if (history === 'LIVE') {
        evidence.push({
          source: 'BACKLINKS',
          metric: 'snapshot_change',
          value: `+${overview.summary?.newBacklinks ?? 0} / -${overview.summary?.lostBacklinks ?? 0}`,
          note: 'Latest snapshot difference versus the previous snapshot.',
        });
      } else {
        limitations.push(
          'Only one snapshot exists, so new/lost change cannot be shown yet.',
        );
      }

      const open: any[] =
        opportunities?.opportunities ??
        [];

      for (const item of open.slice(
        0,
        3,
      )) {
        why.push(
          `${item.opportunityType}: ${item.reason ?? item.sourceDomain}`,
        );
      }

      if (open.length > 0) {
        keySignals.push(
          `${open.length} open backlink opportunitie(s) from recorded evidence.`,
        );
      }

      limitations.push(
        'No backlink provider is connected; competitor link gaps are unavailable.',
      );

      void gap;
    } catch {
      dataAvailability.backlinks =
        'NO_DATA';
      limitations.push(
        'Backlink data could not be loaded.',
      );
    }
  }

  private async retrieveCompetitors(
    organizationId: string,
    websiteId: string,
    dataAvailability: Record<
      string,
      string
    >,
    evidence: EvidenceItem[],
    keySignals: string[],
    why: string[],
    limitations: string[],
  ) {
    const competitors =
      await this.prisma.competitor.findMany({
        where: {
          organizationId,
          websiteId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          crawls: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
            select: {
              status: true,
              score: true,
              totalIssues: true,
              completedAt: true,
            },
          },
        },
      });

    if (competitors.length === 0) {
      dataAvailability.competitors =
        'NO_DATA';
      limitations.push(
        'No competitors are tracked. Add competitors to unlock this analysis.',
      );
      return;
    }

    dataAvailability.competitors =
      'AVAILABLE';

    const withCrawls = competitors.filter(
      (competitor) =>
        competitor.crawls.length > 0 &&
        competitor.crawls[0].status ===
          'COMPLETED',
    );

    if (withCrawls.length === 0) {
      keySignals.push(
        `${competitors.length} competitors tracked, but none have a completed crawl yet.`,
      );
      limitations.push(
        'Crawl competitors before comparing performance.',
      );
      return;
    }

    const ranked = [...withCrawls].sort(
      (a, b) =>
        Number(
          b.crawls[0].score ?? 0,
        ) -
        Number(
          a.crawls[0].score ?? 0,
        ),
    );

    const leader = ranked[0];

    keySignals.push(
      `${leader.name} leads tracked competitors with crawl score ${leader.crawls[0].score} (${leader.crawls[0].totalIssues} issues).`,
    );

    for (const competitor of ranked.slice(
      0,
      5,
    )) {
      evidence.push({
        source: 'COMPETITORS',
        metric: 'competitor_crawl',
        value: `score ${competitor.crawls[0].score}, ${competitor.crawls[0].totalIssues} issues`,
        entity: competitor.name,
        timestamp:
          competitor.crawls[0].completedAt?.toISOString() ??
          null,
      });
    }

    why.push(
      'Comparison uses recorded competitor crawl scores only — never inferred from SEO rankings.',
    );
  }

  private async retrieveLeadsRevenue(
    organizationId: string,
    websiteId: string,
    dataAvailability: Record<
      string,
      string
    >,
    evidence: EvidenceItem[],
    keySignals: string[],
    limitations: string[],
  ) {
    void organizationId;

    const [leadCount, convertedCount, revenueAgg, revenueCount] =
      await Promise.all([
        this.prisma.lead.count({
          where: { websiteId },
        }),
        this.prisma.lead.count({
          where: {
            websiteId,
            converted: true,
          },
        }),
        this.prisma.revenue.aggregate({
          where: {
            websiteId,
            status: 'RECOGNIZED',
          },
          _sum: { amount: true },
        }),
        this.prisma.revenue.count({
          where: { websiteId },
        }),
      ]);

    if (
      leadCount === 0 &&
      revenueCount === 0
    ) {
      dataAvailability.leads_revenue =
        'NO_DATA';
      limitations.push(
        'No leads or revenue records exist, so business impact cannot be measured.',
      );
      return;
    }

    dataAvailability.leads_revenue =
      'AVAILABLE';

    const recognized = Number(
      revenueAgg._sum.amount ?? 0,
    );

    evidence.push({
      source: 'LEADS',
      metric: 'leads',
      value: `${convertedCount}/${leadCount} converted`,
      note:
        leadCount > 0
          ? `Conversion rate ${((convertedCount / leadCount) * 100).toFixed(1)}%.`
          : null,
    });

    evidence.push({
      source: 'REVENUE',
      metric: 'recognized_revenue',
      value: recognized,
      note: `${revenueCount} revenue records.`,
    });

    keySignals.push(
      `${leadCount} leads (${convertedCount} converted), ${recognized} recognized revenue across ${revenueCount} records.`,
    );

    try {
      const outcome =
        await this.roiService.outcome(
          organizationId,
          websiteId,
          undefined,
          undefined,
        );

      if (
        outcome.attribution.coverage !==
        null
      ) {
        evidence.push({
          source: 'REVENUE',
          metric:
            'attribution_coverage',
          value: `${outcome.attribution.coverage}% directly linked`,
          note: 'Share of recognized revenue linked to a lead record.',
        });
      }

      if (
        outcome.roi.measurable &&
        outcome.roi.attributedRoi !==
          null
      ) {
        evidence.push({
          source: 'REVENUE',
          metric: 'attributed_roi',
          value: `${outcome.roi.attributedRoi}%`,
          note: `Attributed revenue ${outcome.roi.attributedRevenue} against spend ${outcome.roi.spend}.`,
        });

        keySignals.push(
          `Attributed ROI is measurable at ${outcome.roi.attributedRoi}%.`,
        );
      } else {
        limitations.push(
          'ROI is unavailable — insufficient spend/attribution data.',
        );
      }

      if (
        outcome.funnel
          .conversionRate !== null
      ) {
        evidence.push({
          source: 'LEADS',
          metric:
            'funnel_conversion_rate',
          value: `${outcome.funnel.conversionRate}%`,
          note: `${outcome.funnel.conversions} conversions from ${outcome.funnel.leads} leads.`,
        });
      }
    } catch {
      limitations.push(
        'Outcome attribution is currently unavailable.',
      );
    }
  }

  private async retrieveTraffic(
    organizationId: string,
    websiteId: string,
    dataAvailability: Record<
      string,
      string
    >,
    evidence: EvidenceItem[],
    keySignals: string[],
    why: string[],
    limitations: string[],
  ) {
    void websiteId;

    try {
      const current =
        await this.googleService.getSearchAnalytics(
          organizationId,
          isoDaysAgo(28),
          isoDaysAgo(1),
        );

      const previous =
        await this.googleService.getSearchAnalytics(
          organizationId,
          isoDaysAgo(56),
          isoDaysAgo(29),
        );

      const cur = {
        clicks: Number(
          (current as any)?.clicks ?? 0,
        ),
        impressions: Number(
          (current as any)?.impressions ??
            0,
        ),
      };
      const prev = {
        clicks: Number(
          (previous as any)?.clicks ??
            0,
        ),
        impressions: Number(
          (previous as any)?.impressions ??
            0,
        ),
      };

      dataAvailability.gsc =
        'AVAILABLE';

      evidence.push({
        source: 'GSC',
        metric: 'clicks_28d',
        value: cur.clicks,
        previousValue: prev.clicks,
        change:
          cur.clicks - prev.clicks,
        note: 'Last 28 days vs prior 28 days.',
      });

      evidence.push({
        source: 'GSC',
        metric: 'impressions_28d',
        value: cur.impressions,
        previousValue:
          prev.impressions,
        change:
          cur.impressions -
          prev.impressions,
        note: 'Last 28 days vs prior 28 days.',
      });

      if (
        cur.clicks < prev.clicks &&
        cur.impressions >=
          prev.impressions
      ) {
        keySignals.push(
          'Clicks fell while impressions held — a CTR/position pattern worth checking against technical issues on affected pages.',
        );
        why.push(
          'Possible contributor: CTR or ranking weakness rather than lost visibility. RENKOO cannot prove the cause without page-level evidence.',
        );
      } else if (
        cur.clicks < prev.clicks
      ) {
        keySignals.push(
          'Clicks fell together with visibility — check the monitoring change feed for coinciding technical causes.',
        );
        why.push(
          'Coincides-with analysis only: compare the drop window with crawl changes before concluding.',
        );
      } else {
        keySignals.push(
          'Traffic is stable or growing over the last 28 days.',
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : '';

      if (
        /not connected|no .* selected|revok|expir/i.test(
          message,
        )
      ) {
        dataAvailability.gsc =
          'NOT_CONNECTED';
        limitations.push(
          'Google Search Console is not connected, so traffic questions cannot be answered with data.',
        );
      } else {
        dataAvailability.gsc =
          'NO_DATA';
        limitations.push(
          'Search traffic data is currently unavailable.',
        );
      }
    }
  }

  private async retrieveOverview(
    organizationId: string,
    websiteId: string,
    dataAvailability: Record<
      string,
      string
    >,
    evidence: EvidenceItem[],
    keySignals: string[],
    limitations: string[],
  ) {
    await this.retrieveSeo(
      organizationId,
      websiteId,
      dataAvailability,
      evidence,
      keySignals,
      limitations,
      false,
    );

    const [oppCount, actionCount, alertCount] =
      await Promise.all([
        this.prisma.recommendation.count({
          where: {
            organizationId,
            websiteId,
            status: {
              in: [
                'OPEN',
                'IN_PROGRESS',
              ],
            },
          },
        }),
        this.prisma.action.count({
          where: {
            organizationId,
            websiteId,
            status: {
              in: [
                'TODO',
                'IN_PROGRESS',
              ],
            },
          },
        }),
        this.prisma.monitoringAlert
          .count({
            where: {
              organizationId,
              websiteId,
              active: true,
            },
          })
          .catch(() => 0),
      ]);

    evidence.push({
      source: 'OPPORTUNITIES',
      metric: 'open_recommendations',
      value: oppCount,
    });

    evidence.push({
      source: 'ACTIONS',
      metric: 'open_actions',
      value: actionCount,
    });

    evidence.push({
      source: 'MONITORING',
      metric: 'active_alerts',
      value: alertCount,
    });

    keySignals.push(
      `${oppCount} open recommendations, ${actionCount} open actions, ${alertCount} active alerts.`,
    );
  }

  // =========================================================
  // COMPOSITION (fixed templates, real values only)
  // =========================================================

  private composeAnswer(
    intent: IntelligenceIntent,
    websiteName: string,
    businessGoal: string | null,
    evidence: EvidenceItem[],
    keySignals: string[],
    opportunities: Array<{
      title: string;
      priority: string;
    }>,
    limitations: string[],
  ): string {
    const goalLine = businessGoal
      ? ` Configured business priority: "${businessGoal}".`
      : '';

    const head: Record<
      IntelligenceIntent,
      string
    > = {
      WHAT_CHANGED:
        `Here is what RENKOO measured across the last crawls for ${websiteName}.`,
      WHY_TRAFFIC:
        `Here is what the connected traffic data shows for ${websiteName}, with possible contributors.`,
      TRAFFIC:
        `Here is the connected search traffic picture for ${websiteName}.`,
      WHAT_FIX_FIRST: `Here is what to fix first for ${websiteName}, ranked by evidence.`,
      TOP_OPPORTUNITIES: `Here are the top evidence-backed opportunities for ${websiteName}.`,
      OPEN_ACTIONS: `Here are the open actions for ${websiteName}.`,
      COMPETITOR_AHEAD: `Here is how tracked competitors compare for ${websiteName}.`,
      AI_VISIBILITY: `Here is the recorded AI search visibility for ${websiteName}.`,
      SEO_HEALTH: `Here is the measured technical SEO health for ${websiteName}.`,
      LEADS_REVENUE: `Here is the recorded lead and revenue picture for ${websiteName}.`,
      MONITORING: `Here are the active monitoring signals for ${websiteName}.`,
      CONTENT: `Here is the recorded content picture for ${websiteName}.`,
      LOCAL_SEO: `Here is the recorded local SEO picture for ${websiteName}.`,
      BACKLINKS: `Here is the recorded backlink picture for ${websiteName}.`,
      GROWTH_BLOCKERS: `Here are the strongest evidence-backed growth blockers for ${websiteName}.`,
      BUSINESS_OVERVIEW: `Here is what RENKOO knows about ${websiteName}.`,
      GENERAL: `Here is the current RENKOO picture for ${websiteName}.`,
    };

    const parts = [
      `${head[intent]}${goalLine}`,
    ];

    for (const signal of keySignals.slice(
      0,
      6,
    )) {
      parts.push(`- ${signal}`);
    }

    if (opportunities.length > 0) {
      parts.push(
        `Top next items: ${opportunities
          .slice(0, 3)
          .map(
            (item) =>
              `"${item.title}" [${item.priority}]`,
          )
          .join('; ')}.`,
      );
    }

    if (limitations.length > 0) {
      parts.push(
        `Limits: ${limitations[0]}`,
      );
    }

    return parts.join('\n');
  }
}

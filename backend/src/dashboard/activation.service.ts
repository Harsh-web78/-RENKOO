import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { GoogleService } from '../google/google.service';
import { BusinessBrainService } from '../business-brain/business-brain.service';
import { SearchBaselineService } from '../keywords/search-baseline.service';
import { EvidenceFusionService } from '../keywords/evidence-fusion.service';
import {
  emptyCopy,
  firstValueReady,
  funnelProgress,
  onboardingChecklist,
  topActionsCap,
  topInsightsCap,
  type ActivationEvent,
} from './activation';

/*
 * =========================================================
 * ACTIVATION + TIME-TO-FIRST-VALUE 1.0 (Phase 30) —
 * read-only composition over websites, business context,
 * connections, crawl, baseline, opportunities and first
 * actions. Progressive disclosure, max-5 checklist,
 * READY/PARTIAL/BLOCKED (never percentages). First
 * value = an evidence-backed decision, never dashboard
 * load. TTV timestamps derive from existing records —
 * no new tables, no analytics platform.
 * =========================================================
 */

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

@Injectable()
export class ActivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleService,
    private readonly brain: BusinessBrainService,
    private readonly baseline: SearchBaselineService,
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

  async getActivation(
    organizationId: string,
    websiteId?: string,
  ) {
    const websites = await this.prisma.website.findMany({
      where: { organizationId, isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        name: true,
        url: true,
        createdAt: true,
      },
    });
    const website =
      (websiteId
        ? websites.find((entry) => entry.id === websiteId)
        : websites[0]) ?? null;
    if (!website) {
      return {
        state: 'NEW',
        hasWebsite: false,
        checklist: onboardingChecklist({
          hasWebsite: false,
          crawlReady: null,
          gscConnected: false,
          contextReady: false,
          hasFirstValue: false,
        }),
        empty: emptyCopy('GSC'),
        billing: { charged: false },
      };
    }

    const id = website.id as string;
    const [
      contextRes,
      googleRes,
      crawlRes,
      baselineRes,
      nbaRes,
      competitorsRes,
      actionsRes,
    ] = await Promise.all([
      this.settled(() =>
        this.brain.getBusinessContext(organizationId, id),
      ),
      this.settled(() =>
        this.google.getConnectionStatus(organizationId),
      ),
      this.settled(() =>
        this.prisma.crawl.findFirst({
          where: { websiteId: id, status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
        }),
      ),
      this.settled(() =>
        this.baseline.getBaseline(organizationId, {
          websiteId: id,
          days: 28,
        }),
      ),
      this.settled(() =>
        this.fusion.getNextBestAction(organizationId, id),
      ),
      this.settled(() =>
        this.prisma.competitor.count({
          where: { organizationId, websiteId: id },
        }),
      ),
      this.settled(() =>
        this.prisma.action.findMany({
          where: { organizationId, websiteId: id },
          orderBy: { updatedAt: 'desc' },
          take: 10,
          select: {
            id: true,
            title: true,
            status: true,
            updatedAt: true,
          },
        }),
      ),
    ]);

    const context = (contextRes ?? null) as {
      dataAvailability?: Record<string, string>;
      missing?: string[];
      contextConfidence?: number;
    } | null;
    const gscConnected =
      clean(
        (googleRes as { selectedProperty?: unknown } | null)
          ?.selectedProperty,
      ).length > 0;
    const crawlReady = crawlRes !== null;
    const contextReady =
      context !== null &&
      (context.dataAvailability?.businessBrain === 'AVAILABLE' ||
        (context.contextConfidence ?? 0) >= 60);
    const baselineReady = baselineRes !== null;
    const nba = (nbaRes ?? null) as {
      action?: {
        title?: string;
        category?: string;
        keyword?: string;
        targetPage?: string;
      };
      why?: string;
    } | null;
    const hasFirstValue = firstValueReady({
      hasDecision:
        nba?.action !== null &&
        nba?.action !== undefined &&
        clean(nba?.action?.title).length > 0,
      decisionLabel: clean(nba?.action?.title) || null,
    });

    const insights = topInsightsCap(
      [
        baselineReady
          ? {
              key: 'where-you-are',
              title: 'Where you are',
              detail:
                'Verified search baseline with clicks, impressions, CTR and position bands.',
              evidenceState: 'VERIFIED',
            }
          : null,
        crawlReady
          ? {
              key: 'technical-content',
              title: 'Technical and content evidence observed',
              detail:
                'Latest completed crawl exposes crawlable, analyzable pages.',
              evidenceState: 'OBSERVED',
            }
          : null,
        nba?.action
          ? {
              key: 'first-opportunity',
              title: clean(nba.action.title),
              detail: clean(nba.why) || 'Existing next best action.',
              evidenceState: 'OBSERVED',
            }
          : null,
      ].filter(Boolean),
    );
    const actions = topActionsCap(
      nba?.action
        ? [
            {
              title: clean(nba.action.title),
              target:
                clean(nba.action.targetPage) ||
                clean(nba.action.keyword) ||
                null,
              measurement:
                'Track rank, clicks, CTR and recorded outcomes before and after.',
            },
          ]
        : [],
    );

    const reached: ActivationEvent[] = ['WEBSITE_ADDED'];
    if (crawlReady) reached.push('CRAWL_COMPLETED');
    if (gscConnected) reached.push('GSC_CONNECTED');
    if (baselineReady) reached.push('BASELINE_READY');
    if (hasFirstValue) reached.push('FIRST_VALUE_READY');
    if ((actionsRes ?? []).length > 0)
      reached.push('FIRST_ACTION_OPENED');

    return {
      state: hasFirstValue
        ? 'FIRST_VALUE_READY'
        : baselineReady
          ? 'BASELINE_READY'
          : crawlReady
            ? 'CRAWL_READY'
            : 'WEBSITE_ADDED',
      website: {
        id,
        name: website.name,
        url: website.url,
        createdAt: website.createdAt,
      },
      businessContext: {
        readiness: !context
          ? 'MISSING'
          : contextReady
            ? 'READY'
            : 'PARTIAL',
        missing: context?.missing ?? [],
        confidence: context?.contextConfidence ?? null,
      },
      connections: {
        gsc: gscConnected ? 'CONNECTED' : 'NOT_CONNECTED',
        crawl: crawlReady ? 'READY' : 'RUNNING',
        ai: 'NOT_RUN',
        competitors:
          (competitorsRes ?? 0) > 0
            ? 'CONFIGURED'
            : 'UNKNOWN',
        business: contextReady ? 'READY' : 'PARTIAL',
      },
      checklist: onboardingChecklist({
        hasWebsite: true,
        crawlReady,
        gscConnected,
        contextReady,
        hasFirstValue,
      }),
      snapshot: {
        insights,
        working: insights.slice(0, 3),
        gap: nba?.why
          ? {
              title: 'Biggest gap',
              detail: clean(nba.why),
            }
          : null,
        opportunity: nba?.action ?? null,
        nextMoves: actions,
      },
      funnel: funnelProgress(reached),
      timestamps: {
        websiteAddedAt: website.createdAt,
        crawlReadyAt:
          (
            crawlRes as unknown as {
              completedAt?: string;
            } | null
          )?.completedAt ?? null,
      },
      empty: !gscConnected ? emptyCopy('GSC') : null,
      limitations: [
        'First value is an evidence-backed decision, never dashboard load.',
        'Unavailable sources stay unavailable; nothing is zero-filled.',
        'No causal claims: next moves carry measurement, not guarantees.',
      ],
      billing: { charged: false },
    };
  }

  async getFunnel(
    organizationId: string,
    websiteId: string,
  ) {
    if (!websiteId)
      throw new BadRequestException(
        'websiteId is required',
      );
    const website = await this.prisma.website.findFirst({
      where: {
        id: websiteId,
        organizationId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!website)
      throw new NotFoundException('Website not found');
    const activation = await this.getActivation(
      organizationId,
      websiteId,
    );
    return {
      websiteId,
      funnel: activation.funnel,
      timestamps: activation.timestamps,
      billing: { charged: false },
    };
  }
}

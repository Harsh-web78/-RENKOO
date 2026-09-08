import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  PROOF_WINDOW_DAYS,
  buildMetric,
  deriveState,
  type ProofMetric,
} from './proof-math';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TAKE = 20;
const MAX_TAKE = 50;

type Window = {
  beforeStart: Date;
  beforeEnd: Date;
  afterStart: Date;
  afterEnd: Date;
  afterDaysAvailable: number;
};

type CrawlRef = {
  id: string;
  createdAt: Date;
  completedAt: Date | null;
};

function windowsFor(
  completedAt: Date,
  now: Date,
): Window {
  const safeCompletedMs = Math.min(
    completedAt.getTime(),
    now.getTime(),
  );
  const beforeStart = new Date(
    safeCompletedMs - PROOF_WINDOW_DAYS * DAY_MS,
  );
  const beforeEnd = new Date(safeCompletedMs);
  const afterStart = new Date(safeCompletedMs);
  const afterEnd = new Date(
    Math.min(
      safeCompletedMs + PROOF_WINDOW_DAYS * DAY_MS,
      now.getTime(),
    ),
  );
  const afterDaysAvailable = Math.max(
    0,
    Math.floor(
      (now.getTime() - safeCompletedMs) / DAY_MS,
    ),
  );

  return {
    beforeStart,
    beforeEnd,
    afterStart,
    afterEnd,
    afterDaysAvailable,
  };
}

@Injectable()
export class ProofService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async listProofCards(
    organizationId: string,
    options?: {
      websiteId?: string;
      take?: number;
      cursorId?: string;
    },
  ) {
    const take = Math.min(
      Math.max(1, options?.take ?? DEFAULT_TAKE),
      MAX_TAKE,
    );

    if (options?.websiteId) {
      const website =
        await this.prisma.website.findFirst({
          where: {
            id: options.websiteId,
            organizationId,
          },
          select: { id: true },
        });

      if (!website) {
        throw new NotFoundException(
          'Website not found',
        );
      }
    }

    const actions = await this.prisma.action.findMany(
      {
        where: {
          organizationId,
          status: 'DONE',
          completedAt: { not: null },
          ...(options?.websiteId
            ? { websiteId: options.websiteId }
            : {}),
        },
        orderBy: [
          { completedAt: 'desc' },
          { id: 'desc' },
        ],
        take: take + 1,
        ...(options?.cursorId
          ? {
              cursor: { id: options.cursorId },
              skip: 1,
            }
          : {}),
        include: {
          recommendation: {
            select: { id: true, title: true },
          },
          website: {
            select: {
              id: true,
              name: true,
              url: true,
            },
          },
        },
      },
    );

    const hasMore = actions.length > take;
    const page = hasMore
      ? actions.slice(0, take)
      : actions;

    const google = await this.googleFlags(
      organizationId,
    );

    const cards = page.map((action) =>
      this.shellFor(action, google),
    );
    await this.hydrateCards(cards);

    return {
      cards,
      nextCursorId: hasMore
        ? page[page.length - 1].id
        : null,
    };
  }

  async getProofCard(
    organizationId: string,
    actionId: string,
  ) {
    const action =
      await this.prisma.action.findFirst({
        where: {
          id: actionId,
          organizationId,
        },
        include: {
          recommendation: {
            select: { id: true, title: true },
          },
          website: {
            select: {
              id: true,
              name: true,
              url: true,
            },
          },
        },
      });

    if (!action) {
      throw new NotFoundException(
        'Proof card not found',
      );
    }

    const google = await this.googleFlags(
      organizationId,
    );
    const card = this.shellFor(action, google);
    await this.hydrateCards([card]);

    return card;
  }

  private async googleFlags(
    organizationId: string,
  ): Promise<{
    gscConnected: boolean;
    ga4Connected: boolean;
  }> {
    const google = await this.prisma
      .googleConnection.findUnique({
        where: { organizationId },
        select: {
          selectedProperty: true,
          selectedAnalyticsProperty: true,
        },
      })
      .catch(() => null);

    return {
      gscConnected: Boolean(
        google?.selectedProperty,
      ),
      ga4Connected: Boolean(
        google?.selectedAnalyticsProperty,
      ),
    };
  }

  /*
   * Sync identity shell. Cards for actions that cannot be measured
   * (not DONE, no website) are final here; measurable cards carry
   * _hydrate context and are completed by hydrateCards().
   */
  private shellFor(
    action: any,
    google: {
      gscConnected: boolean;
      ga4Connected: boolean;
    },
  ): Record<string, any> {
    const base = {
      actionId: action.id,
      websiteId: action.websiteId ?? null,
      websiteName:
        action.website?.name ?? null,
      websiteUrl: action.website?.url ?? null,
      title: action.title,
      type: action.type,
      priority: action.priority,
      createdAt: action.createdAt,
      completedAt: action.completedAt ?? null,
      recommendationId:
        action.recommendationId ?? null,
      recommendationTitle:
        action.recommendation?.title ?? null,
    };
    const searchTraffic = {
      state: google.gscConnected
        ? 'SEE_SEARCH_VISIBILITY'
        : 'NOT_CONNECTED',
      gscConnected: google.gscConnected,
      ga4Connected: google.ga4Connected,
    };

    if (
      action.status !== 'DONE' ||
      !action.completedAt
    ) {
      return {
        ...base,
        windows: null,
        state: 'INSUFFICIENT_DATA',
        stateReason:
          'This action is not completed yet. Complete it and RENKOO will track what changed afterward.',
        metrics: [],
        evidence: {
          crawl: { state: 'NOT_APPLICABLE' },
          leads: { state: 'NOT_APPLICABLE' },
          revenue: { state: 'NOT_APPLICABLE' },
          aiVisibility: {
            state: 'NOT_APPLICABLE',
          },
          monitoring: {
            state: 'NOT_APPLICABLE',
          },
          searchTraffic,
        },
        revenueNote: null,
      };
    }

    if (!action.websiteId) {
      return {
        ...base,
        windows: null,
        state: 'INSUFFICIENT_DATA',
        stateReason:
          'No website is linked to this action, so before/after evidence cannot be compared.',
        metrics: [],
        evidence: {
          crawl: { state: 'NOT_APPLICABLE' },
          leads: { state: 'NOT_APPLICABLE' },
          revenue: { state: 'NOT_APPLICABLE' },
          aiVisibility: {
            state: 'NOT_APPLICABLE',
          },
          monitoring: {
            state: 'NOT_APPLICABLE',
          },
          searchTraffic,
        },
        revenueNote: null,
      };
    }

    const windows = windowsFor(
      new Date(action.completedAt),
      new Date(),
    );

    return {
      ...base,
      windows: {
        beforeStart: windows.beforeStart,
        beforeEnd: windows.beforeEnd,
        afterStart: windows.afterStart,
        afterEnd: windows.afterEnd,
        afterDaysAvailable:
          windows.afterDaysAvailable,
        windowDays: PROOF_WINDOW_DAYS,
      },
      state: 'INSUFFICIENT_DATA',
      stateReason: '',
      metrics: [],
      evidence: {
        crawl: { state: 'PENDING' },
        leads: { state: 'PENDING' },
        revenue: { state: 'PENDING' },
        aiVisibility: { state: 'PENDING' },
        monitoring: { state: 'PENDING' },
        searchTraffic,
      },
      revenueNote: null,
      _hydrate: {
        websiteId: action.websiteId as string,
        windows,
      },
    };
  }

  /*
   * Per-website batched hydration: each website's crawl list is read
   * once no matter how many cards it has; all reads are indexed and
   * website-scoped. No live external calls anywhere in this pass.
   */
  private async hydrateCards(
    cards: Array<Record<string, any>>,
  ): Promise<void> {
    const byWebsite = new Map<
      string,
      Array<Record<string, any>>
    >();

    for (const card of cards) {
      const hydrate = card._hydrate as
        | { websiteId: string; windows: Window }
        | undefined;
      if (!hydrate) continue;
      const list =
        byWebsite.get(hydrate.websiteId) ?? [];
      list.push(card);
      byWebsite.set(hydrate.websiteId, list);
    }

    await Promise.all(
      Array.from(byWebsite.entries()).map(
        async ([websiteId, websiteCards]) => {
          const crawls =
            await this.prisma.crawl.findMany({
              where: {
                websiteId,
                status: 'COMPLETED',
              },
              orderBy: { createdAt: 'desc' },
              take: 25,
              select: {
                id: true,
                createdAt: true,
                completedAt: true,
              },
            });

          await Promise.all(
            websiteCards.map((card) =>
              this.hydrateCard(
                card,
                websiteId,
                (
                  card._hydrate as {
                    windows: Window;
                  }
                ).windows,
                crawls,
              ),
            ),
          );
        },
      ),
    );

    for (const card of cards) {
      delete card._hydrate;
    }
  }

  private crawlOnEachSide(
    crawls: CrawlRef[],
    completedMs: number,
  ): {
    beforeId: string | null;
    beforeAt: Date | null;
    afterId: string | null;
    afterAt: Date | null;
  } {
    let before: { id: string; at: number } | null =
      null;
    let after: { id: string; at: number } | null =
      null;

    for (const crawl of crawls) {
      const at = new Date(
        crawl.completedAt ?? crawl.createdAt,
      ).getTime();
      if (at <= completedMs) {
        if (!before || at > before.at) {
          before = { id: crawl.id, at };
        }
      } else if (!after || at < after.at) {
        after = { id: crawl.id, at };
      }
    }

    return {
      beforeId: before?.id ?? null,
      beforeAt: before ? new Date(before.at) : null,
      afterId: after?.id ?? null,
      afterAt: after ? new Date(after.at) : null,
    };
  }

  private async hydrateCard(
    card: Record<string, any>,
    websiteId: string,
    windows: Window,
    crawls: CrawlRef[],
  ): Promise<void> {
    const completedMs = new Date(
      card.completedAt,
    ).getTime();
    const metrics: ProofMetric[] = [];
    const evidence: Record<string, any> = {
      ...card.evidence,
    };

    // --- Crawl: open-issue counts on nearest crawl each side ---
    const sides = this.crawlOnEachSide(
      crawls,
      completedMs,
    );
    if (sides.beforeId && sides.afterId) {
      const [beforeGroups, afterGroups] =
        await Promise.all([
          this.prisma.seoIssue.groupBy({
            by: ['severity'],
            where: {
              status: 'OPEN',
              crawlPage: {
                crawlId: sides.beforeId,
              },
            },
            _count: { _all: true },
          }),
          this.prisma.seoIssue.groupBy({
            by: ['severity'],
            where: {
              status: 'OPEN',
              crawlPage: {
                crawlId: sides.afterId,
              },
            },
            _count: { _all: true },
          }),
        ]);
      const sum = (
        groups: Array<{
          _count: { _all: number };
        }>,
      ): number =>
        groups.reduce(
          (total, g) => total + g._count._all,
          0,
        );
      metrics.push(
        buildMetric({
          key: 'openIssues',
          label: 'Open technical issues',
          before: sum(beforeGroups),
          after: sum(afterGroups),
          lowerBetter: true,
          evidence: 'crawl',
        }),
      );
      evidence.crawl = {
        state: 'READY',
        beforeCrawlAt: sides.beforeAt,
        afterCrawlAt: sides.afterAt,
      };
    } else {
      evidence.crawl = {
        state:
          sides.beforeId || sides.afterId
            ? 'WAITING'
            : 'NO_CRAWLS',
        beforeCrawlAt: sides.beforeAt,
        afterCrawlAt: sides.afterAt,
      };
    }

    // --- Leads: recorded count + self-entered estimated value ---
    const [leadsBefore, leadsAfter] =
      await Promise.all([
        this.prisma.lead.aggregate({
          where: {
            websiteId,
            createdAt: {
              gte: windows.beforeStart,
              lt: windows.beforeEnd,
            },
          },
          _count: { _all: true },
          _sum: { estimatedValue: true },
        }),
        this.prisma.lead.aggregate({
          where: {
            websiteId,
            createdAt: {
              gt: windows.afterStart,
              lte: windows.afterEnd,
            },
          },
          _count: { _all: true },
          _sum: { estimatedValue: true },
        }),
      ]);
    const leadsBeforeCount =
      leadsBefore._count._all ?? 0;
    const leadsAfterCount =
      leadsAfter._count._all ?? 0;
    if (
      leadsBeforeCount > 0 ||
      leadsAfterCount > 0
    ) {
      metrics.push(
        buildMetric({
          key: 'leads',
          label: 'Leads recorded',
          before: leadsBeforeCount,
          after: leadsAfterCount,
          lowerBetter: false,
          evidence: 'leads',
        }),
      );
      const valueBefore =
        leadsBefore._sum.estimatedValue ?? 0;
      const valueAfter =
        leadsAfter._sum.estimatedValue ?? 0;
      if (valueBefore > 0 || valueAfter > 0) {
        metrics.push(
          buildMetric({
            key: 'leadValue',
            label:
              'Lead estimated value (self-entered)',
            before: valueBefore,
            after: valueAfter,
            lowerBetter: false,
            evidence: 'leads',
          }),
        );
      }
      evidence.leads = { state: 'READY' };
    } else {
      evidence.leads = { state: 'NO_DATA' };
    }

    // --- Revenue: customer-recorded sums (never attributed) ---
    const [revenueBefore, revenueAfter] =
      await Promise.all([
        this.prisma.revenue.groupBy({
          by: ['currency'],
          where: {
            websiteId,
            recognizedAt: {
              gte: windows.beforeStart,
              lt: windows.beforeEnd,
            },
          },
          _count: { _all: true },
          _sum: { amount: true },
        }),
        this.prisma.revenue.groupBy({
          by: ['currency'],
          where: {
            websiteId,
            recognizedAt: {
              gt: windows.afterStart,
              lte: windows.afterEnd,
            },
          },
          _count: { _all: true },
          _sum: { amount: true },
        }),
      ]);
    const revenueCount = (
      groups: Array<{ _count: { _all: number } }>,
    ): number =>
      groups.reduce(
        (total, g) => total + g._count._all,
        0,
      );
    const revenueTotal = (
      groups: Array<{
        _sum: { amount: number | null };
      }>,
    ): number =>
      groups.reduce(
        (total, g) =>
          total + (g._sum.amount ?? 0),
        0,
      );
    const revBeforeCount = revenueCount(
      revenueBefore,
    );
    const revAfterCount = revenueCount(
      revenueAfter,
    );
    if (revBeforeCount > 0 || revAfterCount > 0) {
      const currencies = Array.from(
        new Set([
          ...revenueBefore.map((g) => g.currency),
          ...revenueAfter.map((g) => g.currency),
        ]),
      );
      metrics.push(
        buildMetric({
          key: 'revenue',
          label: `Recorded revenue${
            currencies.length === 1
              ? ` (${currencies[0]})`
              : currencies.length > 1
                ? ' (mixed currencies summed)'
                : ''
          }`,
          before: revenueTotal(revenueBefore),
          after: revenueTotal(revenueAfter),
          lowerBetter: false,
          evidence: 'revenue',
        }),
      );
      evidence.revenue = {
        state: 'READY',
        currencies,
      };
    } else {
      evidence.revenue = { state: 'NO_DATA' };
    }

    // --- AI visibility: mention + citation rates (stored checks) ---
    const [aiBefore, aiMentionBefore, aiCiteBefore] =
      await Promise.all([
        this.countChecks(
          websiteId,
          windows.beforeStart,
          windows.beforeEnd,
          false,
        ),
        this.countChecks(
          websiteId,
          windows.beforeStart,
          windows.beforeEnd,
          false,
          'mentioned',
        ),
        this.countChecks(
          websiteId,
          windows.beforeStart,
          windows.beforeEnd,
          false,
          'citationFound',
        ),
      ]);
    const [aiAfter, aiMentionAfter, aiCiteAfter] =
      await Promise.all([
        this.countChecks(
          websiteId,
          windows.afterStart,
          windows.afterEnd,
          true,
        ),
        this.countChecks(
          websiteId,
          windows.afterStart,
          windows.afterEnd,
          true,
          'mentioned',
        ),
        this.countChecks(
          websiteId,
          windows.afterStart,
          windows.afterEnd,
          true,
          'citationFound',
        ),
      ]);
    if (aiBefore > 0 && aiAfter > 0) {
      metrics.push(
        buildMetric({
          key: 'mentionRate',
          label: 'AI brand mention rate',
          before: (aiMentionBefore / aiBefore) * 100,
          after: (aiMentionAfter / aiAfter) * 100,
          lowerBetter: false,
          evidence: 'aiVisibility',
        }),
      );
      metrics.push(
        buildMetric({
          key: 'citationRate',
          label: 'AI citation rate',
          before: (aiCiteBefore / aiBefore) * 100,
          after: (aiCiteAfter / aiAfter) * 100,
          lowerBetter: false,
          evidence: 'aiVisibility',
        }),
      );
      evidence.aiVisibility = {
        state: 'READY',
        checksBefore: aiBefore,
        checksAfter: aiAfter,
      };
    } else {
      evidence.aiVisibility = {
        state:
          aiBefore + aiAfter > 0
            ? 'PARTIAL'
            : 'NO_DATA',
        checksBefore: aiBefore,
        checksAfter: aiAfter,
      };
    }

    // --- Monitoring: alert counts (best-effort store read) ---
    try {
      const [alertsBefore, alertsAfter] =
        await Promise.all([
          this.prisma.monitoringAlert.count({
            where: {
              websiteId,
              detectedAt: {
                gte: windows.beforeStart,
                lt: windows.beforeEnd,
              },
            },
          }),
          this.prisma.monitoringAlert.count({
            where: {
              websiteId,
              detectedAt: {
                gt: windows.afterStart,
                lte: windows.afterEnd,
              },
            },
          }),
        ]);
      if (alertsBefore > 0 || alertsAfter > 0) {
        metrics.push(
          buildMetric({
            key: 'alerts',
            label: 'Monitoring alerts',
            before: alertsBefore,
            after: alertsAfter,
            lowerBetter: true,
            evidence: 'monitoring',
          }),
        );
        evidence.monitoring = {
          state: 'READY',
        };
      } else {
        evidence.monitoring = {
          state: 'NO_DATA',
        };
      }
    } catch {
      evidence.monitoring = {
        state: 'UNAVAILABLE',
      };
    }

    const { state, reason } = deriveState(
      metrics,
      windows.afterDaysAvailable,
    );

    card.metrics = metrics;
    card.evidence = evidence;
    card.state = state;
    card.stateReason = reason;
    card.revenueNote = metrics.some(
      (m) => m.key === 'revenue',
    )
      ? 'Revenue is customer-recorded (self-entered) and shown as recorded during the comparison window — not attributed to this action alone.'
      : null;
  }

  private async countChecks(
    websiteId: string,
    start: Date,
    end: Date,
    afterSide: boolean,
    flag?: 'mentioned' | 'citationFound',
  ): Promise<number> {
    const range = afterSide
      ? { gt: start, lte: end }
      : { gte: start, lt: end };
    return this.prisma.aiVisibilityCheck.count({
      where: {
        websiteId,
        status: 'COMPLETED',
        ...(flag ? { [flag]: true } : {}),
        checkedAt: range,
      },
    });
  }
}

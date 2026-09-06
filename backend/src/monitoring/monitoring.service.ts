import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { BusinessBrainService } from '../business-brain/business-brain.service';

const SOURCES = [
  'GSC',
  'GA4',
  'TECHNICAL_SEO',
  'AI_VISIBILITY',
  'BACKLINKS',
  'LEADS_REVENUE',
] as const;

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
const STATUSES = ['DETECTED', 'ACKNOWLEDGED', 'RESOLVED'] as const;

type AlertSource = (typeof SOURCES)[number];
type AlertSeverity = (typeof SEVERITIES)[number];

export interface MonitoringAlertFilters {
  websiteId?: string;
  source?: string;
  severity?: string;
  status?: string;
  from?: string;
  to?: string;
}

export interface CreateMonitoringAlertInput {
  websiteId: string;
  type: string;
  source: AlertSource;
  severity: AlertSeverity;
  title: string;
  description: string;
  evidence: Prisma.InputJsonValue;
  deduplicationKey: string;
  detectedAt?: Date;
}

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly businessBrainService: BusinessBrainService,
  ) {}

  // Internal API for detector/adaptor modules. It is deliberately not exposed
  // through a controller so users cannot manufacture alerts.
  async createAlert(
    organizationId: string,
    input: CreateMonitoringAlertInput,
  ) {
    try {
      await this.assertWebsite(organizationId, input.websiteId);
      this.validateCreateInput(input);

      const uniqueWhere = {
        organizationId_websiteId_deduplicationKey_active: {
          organizationId,
          websiteId: input.websiteId,
          deduplicationKey: input.deduplicationKey,
          active: true,
        },
      };

      const existing = await this.prisma.monitoringAlert.findUnique({
        where: uniqueWhere,
      });

      if (existing) {
        return this.prisma.monitoringAlert.update({
          where: { id: existing.id },
          data: {
            type: input.type,
            source: input.source,
            severity: input.severity,
            title: input.title,
            description: input.description,
            evidence: input.evidence,
          },
        });
      }

      return await this.prisma.monitoringAlert.create({
        data: {
          organizationId,
          websiteId: input.websiteId,
          type: input.type,
          source: input.source,
          severity: input.severity,
          title: input.title,
          description: input.description,
          evidence: input.evidence,
          deduplicationKey: input.deduplicationKey,
          detectedAt: input.detectedAt ?? new Date(),
        },
      });
    } catch (error) {
      if (this.isPrismaUniqueError(error)) {
        const existing = await this.prisma.monitoringAlert.findUnique({
          where: {
            organizationId_websiteId_deduplicationKey_active: {
              organizationId,
              websiteId: input.websiteId,
              deduplicationKey: input.deduplicationKey,
              active: true,
            },
          },
        });

        if (existing) {
          return this.prisma.monitoringAlert.update({
            where: { id: existing.id },
            data: {
              type: input.type,
              source: input.source,
              severity: input.severity,
              title: input.title,
              description: input.description,
              evidence: input.evidence,
            },
          });
        }
      }

      return this.handleUnexpectedError('createAlert', error);
    }
  }

  async detectTechnicalSeoAlerts(
    organizationId: string,
    websiteId: string,
    crawlId: string,
  ) {
    try {
      await this.assertWebsite(organizationId, websiteId);

      const crawl = await this.prisma.crawl.findFirst({
        where: {
          id: crawlId,
          websiteId,
          status: 'COMPLETED',
        },
        select: {
          id: true,
          websiteId: true,
          completedAt: true,
          pages: {
            select: {
              id: true,
              url: true,
              issues: {
                where: {
                  status: 'OPEN',
                },
                select: {
                  code: true,
                  category: true,
                  severity: true,
                  title: true,
                  description: true,
                  recommendation: true,
                },
              },
            },
          },
        },
      });

      if (!crawl) {
        throw new NotFoundException('Completed crawl not found');
      }

      const totalPages = crawl.pages.length;

      if (totalPages === 0) {
        return {
          crawlId,
          websiteId,
          alertsCreated: 0,
          alertsUpdated: 0,
          alertsResolved: 0,
        };
      }

      type IssueGroup = {
        code: string;
        category: string;
        severity: string;
        title: string;
        description: string;
        recommendation: string;
        affectedPages: number;
        urls: string[];
      };

      const groups = new Map<string, IssueGroup>();

      for (const page of crawl.pages) {
        for (const issue of page.issues) {
          const existing = groups.get(issue.code);

          if (existing) {
            existing.affectedPages += 1;

            if (existing.urls.length < 20) {
              existing.urls.push(page.url);
            }

            if (
              ['CRITICAL', 'HIGH'].includes(issue.severity) &&
              !['CRITICAL', 'HIGH'].includes(existing.severity)
            ) {
              existing.severity = issue.severity;
            }
          } else {
            groups.set(issue.code, {
              code: issue.code,
              category: issue.category,
              severity: issue.severity,
              title: issue.title,
              description: issue.description,
              recommendation: issue.recommendation,
              affectedPages: 1,
              urls: [page.url],
            });
          }
        }
      }

      const highImpactGroups = [...groups.values()].filter((group) => {
        const affectedPercentage =
          (group.affectedPages / totalPages) * 100;

        return (
          group.severity === 'CRITICAL' ||
          group.severity === 'HIGH' ||
          affectedPercentage >= 50
        );
      });

      const currentKeys = new Set(
        highImpactGroups.map(
          (group) => `TECHNICAL_SEO:${group.code}`,
        ),
      );

      let alertsCreated = 0;
      let alertsUpdated = 0;
      let alertsResolved = 0;

      for (const group of highImpactGroups) {
        const affectedPercentage =
          (group.affectedPages / totalPages) * 100;

        const deduplicationKey =
          `TECHNICAL_SEO:${group.code}`;

        const existing =
          await this.prisma.monitoringAlert.findUnique({
            where: {
              organizationId_websiteId_deduplicationKey_active: {
                organizationId,
                websiteId,
                deduplicationKey,
                active: true,
              },
            },
            select: {
              id: true,
              status: true,
            },
          });

        const alert = await this.createAlert(
          organizationId,
          {
            websiteId,
            type: 'TECHNICAL_SEO_ISSUE',
            source: 'TECHNICAL_SEO',
            severity: group.severity as AlertSeverity,
            title: `${group.title} detected across ${group.affectedPages} page${group.affectedPages === 1 ? '' : 's'}`,
            description:
              `${group.description} ` +
              `${group.affectedPages} of ${totalPages} crawled pages are affected (${affectedPercentage.toFixed(1)}%).`,
            evidence: {
              crawlId,
              issueCode: group.code,
              category: group.category,
              severity: group.severity as AlertSeverity,
              affectedPages: group.affectedPages,
              totalPages,
              affectedPercentage: Number(
                affectedPercentage.toFixed(1),
              ),
              affectedUrls: group.urls,
              recommendation: group.recommendation,
            },
            deduplicationKey,
            detectedAt: crawl.completedAt ?? new Date(),
          },
        );

        if (existing) {
          alertsUpdated += 1;
        } else if (alert) {
          alertsCreated += 1;
        }
      }

      const activeTechnicalAlerts =
        await this.prisma.monitoringAlert.findMany({
          where: {
            organizationId,
            websiteId,
            source: 'TECHNICAL_SEO',
            active: true,
          },
          select: {
            id: true,
            deduplicationKey: true,
          },
        });

      for (const alert of activeTechnicalAlerts) {
        if (!currentKeys.has(alert.deduplicationKey)) {
          await this.prisma.monitoringAlert.update({
            where: {
              id: alert.id,
            },
            data: {
              status: 'RESOLVED',
              resolvedAt: new Date(),
              active: false,
            },
          });

          alertsResolved += 1;
        }
      }

      return {
        crawlId,
        websiteId,
        totalPages,
        issuesDetected: groups.size,
        highImpactIssues: highImpactGroups.length,
        alertsCreated,
        alertsUpdated,
        alertsResolved,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      return this.handleUnexpectedError(
        'detectTechnicalSeoAlerts',
        error,
      );
    }
  }
  // =========================================================
  // DETECT FOR ONE CRAWL (public wrapper for backfill)
  // =========================================================

  async detectForCrawl(
    organizationId: string,
    websiteId: string,
    crawlId?: string,
  ) {
    await this.assertWebsite(organizationId, websiteId);

    let targetCrawlId = crawlId?.trim();

    if (!targetCrawlId) {
      const latest =
        await this.prisma.crawl.findFirst({
          where: {
            websiteId,
            status: 'COMPLETED',
          },
          orderBy: {
            completedAt: 'desc',
          },
          select: { id: true },
        });

      if (!latest) {
        throw new NotFoundException(
          'No completed crawl found for this website',
        );
      }

      targetCrawlId = latest.id;
    }

    return this.detectTechnicalSeoAlerts(
      organizationId,
      websiteId,
      targetCrawlId,
    );
  }

  // =========================================================
  // CHANGE DETECTION — crawl-over-crawl technical SEO deltas
  //
  // Deterministic significance model (documented, no ML):
  // - score is the canonical 0-100 technical SEO score
  //   (100 - weighted OPEN-issue penalties, clamped)
  // - score moves are reported in points (valid: same scale)
  // - issue counts are reported as absolute changes only
  //   (percent change is mathematically inappropriate here)
  // - moves below threshold with no code changes are
  //   suppressed as noise (counted, not listed)
  // =========================================================

  private async getBusinessPriority(
    organizationId: string,
    websiteId: string,
  ): Promise<string> {
    try {
      const context =
        await this.businessBrainService.getBusinessContext(
          organizationId,
          websiteId,
        );

      return (
        context.priorities.primaryGoal ??
        ''
      );
    } catch {
      return '';
    }
  }

  async getChanges(
    organizationId: string,
    websiteId: string,
  ) {
    await this.assertWebsite(organizationId, websiteId);

    const businessPriority =
      await this.getBusinessPriority(
        organizationId,
        websiteId,
      );

    const crawls = await this.prisma.crawl.findMany({
      where: {
        websiteId,
        status: 'COMPLETED',
      },
      orderBy: {
        completedAt: 'asc',
      },
      select: {
        id: true,
        completedAt: true,
        createdAt: true,
        pages: {
          select: {
            id: true,
            url: true,
            issues: {
              where: { status: 'OPEN' },
              select: {
                code: true,
                category: true,
                severity: true,
                title: true,
                description: true,
                recommendation: true,
              },
            },
          },
        },
      },
      take: 8,
    });

    const ordered = [...crawls].sort(
      (a, b) =>
        new Date(
          a.completedAt ?? a.createdAt,
        ).getTime() -
        new Date(
          b.completedAt ?? b.createdAt,
        ).getTime(),
    );

    const snapshots = ordered.map((crawl) =>
      this.summarizeCrawl(crawl),
    );

    const baseline = {
      websiteId,
      completedCrawls: snapshots.length,
      oldestCrawlAt:
        snapshots[0]?.completedAt ?? null,
      latestCrawlAt:
        snapshots[snapshots.length - 1]
          ?.completedAt ?? null,
      latestScore:
        snapshots[snapshots.length - 1]
          ?.score ?? null,
    };

    if (snapshots.length < 2) {
      return {
        ...baseline,
        notEnoughData: true,
        businessPriority:
          businessPriority || null,
        notEnoughDataReason:
          snapshots.length === 0
            ? 'No completed crawls exist for this website yet. Run a crawl to establish a baseline.'
            : 'Only one completed crawl exists for this website. Run another crawl to detect what changed.',
        suppressedNoise: 0,
        changes: [],
        summary: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          positive: 0,
        },
      };
    }

    const changes: any[] = [];
    let suppressedNoise = 0;

    // Compare consecutive pairs, newest pair first.
    for (
      let index = snapshots.length - 1;
      index >= 1 &&
      changes.length < 100;
      index -= 1
    ) {
      const previous = snapshots[index - 1];
      const current = snapshots[index];

      for (const change of this.compareSnapshots(
        previous,
        current,
      )) {
        if (change.suppressed) {
          suppressedNoise += 1;
          continue;
        }

        changes.push(change);
      }
    }

    const businessNote = businessPriority
      ? `Observed against the configured business priority "${businessPriority}". RENKOO cannot prove business impact from crawl signals alone.`
      : null;

    const enriched = changes
      .slice(0, 100)
      .map((item) => ({
        ...item,
        businessNote:
          item.direction === 'NEGATIVE' &&
          (item.metric ===
            'TECHNICAL_SEO_SCORE' ||
            item.type === 'ISSUE_CODE_NEW' ||
            item.type ===
              'ISSUE_CODE_SPREAD')
            ? businessNote
            : null,
      }));

    return {
      ...baseline,
      notEnoughData: false,
      notEnoughDataReason: null,
      suppressedNoise,
      businessPriority:
        businessPriority || null,
      changes: enriched,
      summary: {
        critical: changes.filter(
          (item) =>
            item.severity === 'CRITICAL',
        ).length,
        high: changes.filter(
          (item) =>
            item.severity === 'HIGH',
        ).length,
        medium: changes.filter(
          (item) =>
            item.severity === 'MEDIUM',
        ).length,
        low: changes.filter(
          (item) =>
            item.severity === 'LOW',
        ).length,
        positive: changes.filter(
          (item) =>
            item.direction === 'POSITIVE',
        ).length,
      },
    };
  }

  private summarizeCrawl(crawl: {
    id: string;
    completedAt: Date | null;
    createdAt: Date;
    pages: Array<{
      id: string;
      url: string;
      issues: Array<{
        code: string;
        category: string;
        severity: string;
        title: string;
        description: string;
        recommendation: string;
      }>;
    }>;
  }) {
    const bySeverity: Record<
      string,
      number
    > = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };

    const byCode = new Map<
      string,
      {
        code: string;
        category: string;
        severity: string;
        title: string;
        description: string;
        recommendation: string;
        count: number;
        urls: string[];
      }
    >();

    let openIssues = 0;

    for (const page of crawl.pages) {
      for (const issue of page.issues) {
        openIssues += 1;

        const severity = String(
          issue.severity,
        ).toUpperCase();

        if (
          bySeverity[severity] !==
          undefined
        ) {
          bySeverity[severity] += 1;
        }

        const existing = byCode.get(
          issue.code,
        );

        if (existing) {
          existing.count += 1;

          if (
            existing.urls.length < 10
          ) {
            existing.urls.push(
              page.url,
            );
          }
        } else {
          byCode.set(issue.code, {
            code: issue.code,
            category: issue.category,
            severity,
            title: issue.title,
            description:
              issue.description,
            recommendation:
              issue.recommendation,
            count: 1,
            urls: [page.url],
          });
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

    return {
      crawlId: crawl.id,
      completedAt:
        crawl.completedAt ??
        crawl.createdAt,
      pages: crawl.pages.length,
      openIssues,
      bySeverity,
      byCode,
      score,
    };
  }

  private compareSnapshots(
    previous: ReturnType<
      MonitoringService['summarizeCrawl']
    >,
    current: ReturnType<
      MonitoringService['summarizeCrawl']
    >,
  ) {
    const detectedAt =
      current.completedAt;
    const items: any[] = [];

    const scoreDelta =
      current.score - previous.score;

    const push = (item: any) =>
      items.push({
        id: `crawl:${current.crawlId}:vs:${previous.crawlId}:${item.metric}`,
        websiteId: undefined,
        source: 'TECHNICAL_SEO',
        previousCrawlId:
          previous.crawlId,
        currentCrawlId:
          current.crawlId,
        detectedAt,
        ...item,
      });

    // -------------------------------------------------------
    // Score movement (0-100 scale: points are valid)
    // -------------------------------------------------------

    if (scoreDelta <= -15) {
      push({
        metric: 'TECHNICAL_SEO_SCORE',
        type: 'SCORE_DROP',
        severity: 'CRITICAL',
        direction: 'NEGATIVE',
        title: `Technical SEO score dropped ${Math.abs(scoreDelta)} points`,
        description: `Score moved from ${previous.score} to ${current.score} between crawls.`,
        previousValue: previous.score,
        currentValue: current.score,
        absoluteChange: scoreDelta,
        pointChange: scoreDelta,
      });
    } else if (scoreDelta <= -8) {
      push({
        metric: 'TECHNICAL_SEO_SCORE',
        type: 'SCORE_DROP',
        severity: 'HIGH',
        direction: 'NEGATIVE',
        title: `Technical SEO score dropped ${Math.abs(scoreDelta)} points`,
        description: `Score moved from ${previous.score} to ${current.score} between crawls.`,
        previousValue: previous.score,
        currentValue: current.score,
        absoluteChange: scoreDelta,
        pointChange: scoreDelta,
      });
    } else if (scoreDelta <= -4) {
      push({
        metric: 'TECHNICAL_SEO_SCORE',
        type: 'SCORE_DROP',
        severity: 'MEDIUM',
        direction: 'NEGATIVE',
        title: `Technical SEO score dropped ${Math.abs(scoreDelta)} points`,
        description: `Score moved from ${previous.score} to ${current.score} between crawls.`,
        previousValue: previous.score,
        currentValue: current.score,
        absoluteChange: scoreDelta,
        pointChange: scoreDelta,
      });
    } else if (scoreDelta < 0) {
      push({
        metric: 'TECHNICAL_SEO_SCORE',
        type: 'SCORE_DRIFT',
        severity: 'LOW',
        direction: 'NEGATIVE',
        suppressed: scoreDelta > -1,
        title: `Technical SEO score slipped ${Math.abs(scoreDelta)} points`,
        description: `Score moved from ${previous.score} to ${current.score} between crawls.`,
        previousValue: previous.score,
        currentValue: current.score,
        absoluteChange: scoreDelta,
        pointChange: scoreDelta,
      });
    } else if (scoreDelta >= 4) {
      push({
        metric: 'TECHNICAL_SEO_SCORE',
        type: 'SCORE_IMPROVEMENT',
        severity: 'LOW',
        direction: 'POSITIVE',
        title: `Technical SEO score improved ${scoreDelta} points`,
        description: `Score moved from ${previous.score} to ${current.score} between crawls.`,
        previousValue: previous.score,
        currentValue: current.score,
        absoluteChange: scoreDelta,
        pointChange: scoreDelta,
      });
    }

    // -------------------------------------------------------
    // Open issue volume (absolute counts only)
    // -------------------------------------------------------

    const issueDelta =
      current.openIssues -
      previous.openIssues;

    if (
      Math.abs(issueDelta) >= 5 &&
      previous.openIssues +
        current.openIssues >
        0
    ) {
      push({
        metric: 'OPEN_ISSUES',
        type:
          issueDelta > 0
            ? 'ISSUES_INCREASED'
            : 'ISSUES_DECREASED',
        severity:
          issueDelta > 0
            ? scoreDelta <= -4
              ? 'HIGH'
              : 'MEDIUM'
            : 'LOW',
        direction:
          issueDelta > 0
            ? 'NEGATIVE'
            : 'POSITIVE',
        title:
          issueDelta > 0
            ? `Open SEO issues increased by ${issueDelta}`
            : `Open SEO issues decreased by ${Math.abs(issueDelta)}`,
        description: `Open issues moved from ${previous.openIssues} to ${current.openIssues} between crawls. Counts are absolute; no percentage is inferred.`,
        previousValue:
          previous.openIssues,
        currentValue:
          current.openIssues,
        absoluteChange: issueDelta,
        pointChange: null,
      });
    }

    // -------------------------------------------------------
    // Coverage change (page count)
    // -------------------------------------------------------

    const pagesDelta =
      current.pages - previous.pages;
    const pagesBase = Math.max(
      previous.pages,
      1,
    );

    if (
      Math.abs(pagesDelta) /
        pagesBase >=
        0.2 &&
      Math.abs(pagesDelta) >= 3
    ) {
      push({
        metric: 'PAGES_CRAWLED',
        type:
          pagesDelta > 0
            ? 'COVERAGE_EXPANDED'
            : 'COVERAGE_SHRANK',
        severity: 'MEDIUM',
        direction: 'NEUTRAL',
        title:
          pagesDelta > 0
            ? `Crawl coverage expanded by ${pagesDelta} pages`
            : `Crawl coverage shrank by ${Math.abs(pagesDelta)} pages`,
        description: `Crawled pages moved from ${previous.pages} to ${current.pages}. Coverage changes can coincide with score movement without causing it.`,
        previousValue:
          previous.pages,
        currentValue: current.pages,
        absoluteChange: pagesDelta,
        pointChange: null,
      });
    }

    // -------------------------------------------------------
    // New / resolved issue codes with correlation language
    // -------------------------------------------------------

    for (const [
      code,
      group,
    ] of current.byCode) {
      const before =
        previous.byCode.get(code);

      if (!before) {
        const severity =
          group.severity ===
          'CRITICAL'
            ? 'CRITICAL'
            : group.severity === 'HIGH'
              ? 'HIGH'
              : group.severity ===
                  'MEDIUM'
                ? 'MEDIUM'
                : 'LOW';

        push({
          metric: `ISSUE_CODE:${code}`,
          type: 'ISSUE_CODE_NEW',
          severity,
          direction: 'NEGATIVE',
          title: `New issue detected: ${group.title}`,
          description: `${group.description} Affects ${group.count} page${group.count === 1 ? '' : 's'} in the latest crawl and was not present before.`,
          previousValue: 0,
          currentValue: group.count,
          absoluteChange:
            group.count,
          pointChange: null,
          evidence: {
            issueCode: code,
            category:
              group.category,
            affectedPages:
              group.count,
            affectedUrls:
              group.urls,
          },
          recommendation:
            group.recommendation,
        });
      } else if (
        group.count - before.count >=
        5
      ) {
        push({
          metric: `ISSUE_CODE:${code}`,
          type: 'ISSUE_CODE_SPREAD',
          severity:
            group.severity ===
              'CRITICAL' ||
            group.severity === 'HIGH'
              ? 'HIGH'
              : 'MEDIUM',
          direction: 'NEGATIVE',
          title: `${group.title} spread to ${group.count - before.count} more pages`,
          description: `Affected pages moved from ${before.count} to ${group.count} between crawls.`,
          previousValue:
            before.count,
          currentValue: group.count,
          absoluteChange:
            group.count -
            before.count,
          pointChange: null,
          evidence: {
            issueCode: code,
            category:
              group.category,
            affectedPages:
              group.count,
            affectedUrls:
              group.urls,
          },
          recommendation:
            group.recommendation,
        });
      }
    }

    for (const [
      code,
      group,
    ] of previous.byCode) {
      if (!current.byCode.has(code)) {
        push({
          metric: `ISSUE_CODE:${code}`,
          type: 'ISSUE_CODE_RESOLVED',
          severity: 'LOW',
          direction: 'POSITIVE',
          title: `Resolved: ${group.title}`,
          description: `This issue affected ${group.count} page${group.count === 1 ? '' : 's'} before and is no longer detected.`,
          previousValue:
            group.count,
          currentValue: 0,
          absoluteChange:
            -group.count,
          pointChange: null,
          evidence: {
            issueCode: code,
            category:
              group.category,
          },
          recommendation:
            group.recommendation,
        });
      }
    }

    // -------------------------------------------------------
    // Why engine: attach likely contributors with
    // correlation-only language, or an honest fallback.
    // -------------------------------------------------------

    const contributors = items.filter(
      (item) =>
        item.type === 'ISSUE_CODE_NEW' ||
        item.type ===
          'ISSUE_CODE_SPREAD',
    );

    const hasNegativeScore = items.some(
      (item) =>
        item.metric ===
          'TECHNICAL_SEO_SCORE' &&
        item.direction ===
          'NEGATIVE' &&
        !item.suppressed,
    );

    return items.map((item) => {
      if (
        item.metric ===
          'TECHNICAL_SEO_SCORE' &&
        item.direction ===
          'NEGATIVE' &&
        !item.suppressed
      ) {
        return {
          ...item,
          why:
            contributors.length > 0
              ? contributors.map(
                  (entry) =>
                    `Likely related: ${entry.title} — coincides with this crawl comparison, but RENKOO cannot prove it caused the score move.`,
                )
              : [
                  'RENKOO detected the change but does not have enough evidence to determine why.',
                ],
        };
      }

      if (
        item.type === 'ISSUE_CODE_NEW' ||
        item.type ===
          'ISSUE_CODE_SPREAD'
      ) {
        return {
          ...item,
          why: [
            hasNegativeScore
              ? 'This newly observed issue coincides with the score drop in the same crawl comparison and is a possible cause.'
              : 'Observed for the first time in this crawl comparison. Treat as a possible cause of future score movement, not a proven one.',
          ],
        };
      }

      return {
        ...item,
        why: [],
      };
    });
  }

  async listAlerts(
    organizationId: string,
    filters: MonitoringAlertFilters = {},
  ) {
    try {
      if (filters.websiteId) {
        await this.assertWebsite(organizationId, filters.websiteId);
      }

      const where = this.buildWhere(organizationId, filters);

      const [alerts, total] = await Promise.all([
        this.prisma.monitoringAlert.findMany({
          where,
          orderBy: [{ detectedAt: 'desc' }, { createdAt: 'desc' }],
          take: 200,
        }),
        this.prisma.monitoringAlert.count({ where }),
      ]);

      return {
        alerts,
        total,
        limit: 200,
        storageReady: true,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      if (this.isMissingTableError(error)) {
        return {
          alerts: [],
          total: 0,
          limit: 200,
          storageReady: false,
          storageError:
            'MonitoringAlert table does not exist. Apply the pending Prisma migration to enable alert persistence.',
        };
      }

      return this.handleUnexpectedError('listAlerts', error);
    }
  }

  async getAlert(organizationId: string, id: string) {
    try {
      const alert = await this.prisma.monitoringAlert.findFirst({
        where: { id, organizationId },
      }).catch((error: unknown) => {
        if (this.isMissingTableError(error)) {
          throw new InternalServerErrorException(
            'Monitoring alert store is unavailable (MonitoringAlert table is missing). Apply the pending Prisma migration.',
          );
        }

        throw error;
      });

      if (!alert) {
        throw new NotFoundException('Monitoring alert not found');
      }

      const website = await this.prisma.website.findFirst({
        where: {
          id: alert.websiteId,
          organizationId,
        },
        select: {
          id: true,
          name: true,
          url: true,
          isActive: true,
        },
      });

      return { ...alert, website };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      return this.handleUnexpectedError('getAlert', error);
    }
  }

  async getSummary(organizationId: string, websiteId?: string) {
    try {
      if (websiteId) {
        await this.assertWebsite(organizationId, websiteId);
      }

      const baseWhere: Prisma.MonitoringAlertWhereInput = {
        organizationId,
        ...(websiteId ? { websiteId } : {}),
      };

      const [
        total,
        unread,
        detected,
        acknowledged,
        resolved,
        critical,
        high,
        medium,
        low,
      ] = await Promise.all([
        this.prisma.monitoringAlert.count({ where: baseWhere }),
        this.prisma.monitoringAlert.count({
          where: { ...baseWhere, status: 'DETECTED' },
        }),
        this.prisma.monitoringAlert.count({
          where: { ...baseWhere, status: 'DETECTED' },
        }),
        this.prisma.monitoringAlert.count({
          where: { ...baseWhere, status: 'ACKNOWLEDGED' },
        }),
        this.prisma.monitoringAlert.count({
          where: { ...baseWhere, status: 'RESOLVED' },
        }),
        this.prisma.monitoringAlert.count({
          where: { ...baseWhere, severity: 'CRITICAL' },
        }),
        this.prisma.monitoringAlert.count({
          where: { ...baseWhere, severity: 'HIGH' },
        }),
        this.prisma.monitoringAlert.count({
          where: { ...baseWhere, severity: 'MEDIUM' },
        }),
        this.prisma.monitoringAlert.count({
          where: { ...baseWhere, severity: 'LOW' },
        }),
      ]);

      return {
        websiteId: websiteId ?? null,
        total,
        unread,
        detected,
        acknowledged,
        resolved,
        bySeverity: { critical, high, medium, low },
        storageReady: true,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      if (this.isMissingTableError(error)) {
        return {
          websiteId: websiteId ?? null,
          total: 0,
          unread: 0,
          detected: 0,
          acknowledged: 0,
          resolved: 0,
          bySeverity: {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
          },
          storageReady: false,
          storageError:
            'MonitoringAlert table does not exist. Apply the pending Prisma migration to enable alert persistence.',
        };
      }

      return this.handleUnexpectedError('getSummary', error);
    }
  }

  async getUnreadCount(organizationId: string, websiteId?: string) {
    try {
      if (websiteId) {
        await this.assertWebsite(organizationId, websiteId);
      }

      const unread = await this.prisma.monitoringAlert.count({
        where: {
          organizationId,
          status: 'DETECTED',
          ...(websiteId ? { websiteId } : {}),
        },
      });

      return {
        websiteId: websiteId ?? null,
        unread,
        storageReady: true,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      if (this.isMissingTableError(error)) {
        return {
          websiteId: websiteId ?? null,
          unread: 0,
          storageReady: false,
          storageError:
            'MonitoringAlert table does not exist. Apply the pending Prisma migration to enable alert persistence.',
        };
      }

      return this.handleUnexpectedError('getUnreadCount', error);
    }
  }

  async acknowledgeAlert(organizationId: string, id: string) {
    try {
      const alert = await this.findScopedAlert(organizationId, id);

      if (alert.status === 'RESOLVED') {
        throw new BadRequestException(
          'Resolved alerts cannot be acknowledged',
        );
      }

      if (alert.status === 'ACKNOWLEDGED') {
        return alert;
      }

      return await this.prisma.monitoringAlert.update({
        where: { id: alert.id },
        data: {
          status: 'ACKNOWLEDGED',
          acknowledgedAt: alert.acknowledgedAt ?? new Date(),
        },
      });
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      return this.handleUnexpectedError('acknowledgeAlert', error);
    }
  }

  async resolveAlert(organizationId: string, id: string) {
    try {
      const alert = await this.findScopedAlert(organizationId, id);

      if (alert.status === 'RESOLVED') {
        return alert;
      }

      return await this.prisma.monitoringAlert.update({
        where: { id: alert.id },
        data: {
          status: 'RESOLVED',
          resolvedAt: alert.resolvedAt ?? new Date(),
          active: false,
        },
      });
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      return this.handleUnexpectedError('resolveAlert', error);
    }
  }

  private buildWhere(
    organizationId: string,
    filters: MonitoringAlertFilters,
  ): Prisma.MonitoringAlertWhereInput {
    const where: Prisma.MonitoringAlertWhereInput = { organizationId };

    if (filters.websiteId) {
      where.websiteId = filters.websiteId;
    }

    if (filters.source) {
      where.source = this.validateEnum(
        filters.source,
        SOURCES,
        'source',
      );
    }

    if (filters.severity) {
      where.severity = this.validateEnum(
        filters.severity,
        SEVERITIES,
        'severity',
      );
    }

    if (filters.status) {
      where.status = this.validateEnum(
        filters.status,
        STATUSES,
        'status',
      );
    }

    const from = this.parseDate(filters.from, 'from');
    const to = this.parseDate(filters.to, 'to');

    if (from && to && from > to) {
      throw new BadRequestException(
        'from must be before or equal to to',
      );
    }

    if (from || to) {
      where.detectedAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }

    return where;
  }

  private async findScopedAlert(
    organizationId: string,
    id: string,
  ) {
    const alert = await this.prisma.monitoringAlert.findFirst({
      where: { id, organizationId },
    });

    if (!alert) {
      throw new NotFoundException('Monitoring alert not found');
    }

    return alert;
  }

  private async assertWebsite(
    organizationId: string,
    websiteId: string,
  ) {
    if (!websiteId?.trim()) {
      throw new BadRequestException('websiteId is required');
    }

    const website = await this.prisma.website.findFirst({
      where: {
        id: websiteId,
        organizationId,
        isActive: true,
      },
      select: { id: true },
    });

    if (!website) {
      throw new NotFoundException('Website not found');
    }

    return website;
  }

  private validateCreateInput(input: CreateMonitoringAlertInput) {
    if (!input.type?.trim()) {
      throw new BadRequestException('type is required');
    }

    if (!SOURCES.includes(input.source)) {
      throw new BadRequestException('Invalid monitoring source');
    }

    if (!SEVERITIES.includes(input.severity)) {
      throw new BadRequestException('Invalid monitoring severity');
    }

    if (!input.title?.trim()) {
      throw new BadRequestException('title is required');
    }

    if (!input.description?.trim()) {
      throw new BadRequestException('description is required');
    }

    if (!input.deduplicationKey?.trim()) {
      throw new BadRequestException(
        'deduplicationKey is required',
      );
    }

    if (input.type.length > 100) {
      throw new BadRequestException('type is too long');
    }

    if (input.title.length > 300) {
      throw new BadRequestException('title is too long');
    }

    if (input.description.length > 5000) {
      throw new BadRequestException(
        'description is too long',
      );
    }

    if (input.deduplicationKey.length > 500) {
      throw new BadRequestException(
        'deduplicationKey is too long',
      );
    }
  }

  private validateEnum<T extends string>(
    value: string,
    allowed: readonly T[],
    field: string,
  ): T {
    const normalized = value.trim().toUpperCase() as T;

    if (!allowed.includes(normalized)) {
      throw new BadRequestException(
        `Invalid monitoring ${field}`,
      );
    }

    return normalized;
  }

  private parseDate(value: string | undefined, field: string) {
    if (!value) {
      return undefined;
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid ${field} date`);
    }

    return parsed;
  }

  private isPrismaUniqueError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private isMissingTableError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2021' ||
        error.code === 'P2010')
    );
  }

  private handleUnexpectedError(
    operation: string,
    error: unknown,
  ): never {
    this.logger.error(
      `Monitoring ${operation} failed`,
      error instanceof Error ? error.stack : String(error),
    );

    throw new InternalServerErrorException(
      'Monitoring service is temporarily unavailable',
    );
  }
}

import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

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

  constructor(private readonly prisma: PrismaService) {}

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

      return { alerts, total, limit: 200 };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      return this.handleUnexpectedError('listAlerts', error);
    }
  }

  async getAlert(organizationId: string, id: string) {
    try {
      const alert = await this.prisma.monitoringAlert.findFirst({
        where: { id, organizationId },
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
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
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

      return { websiteId: websiteId ?? null, unread };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
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

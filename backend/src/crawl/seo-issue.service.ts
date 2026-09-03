import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  SeoIssueSeverity,
  SeoIssueStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SeoIssueService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /*
   * =========================================================
   * GET SINGLE ISSUE
   * =========================================================
   */

  async getIssue(
    organizationId: string,
    issueId: string,
  ) {
    const issue =
      await this.prisma.seoIssue.findFirst({
        where: {
          id: issueId,

          crawlPage: {
            crawl: {
              website: {
                organizationId,
              },
            },
          },
        },

        include: {
          crawlPage: {
            include: {
              crawl: {
                include: {
                  website: true,
                },
              },
            },
          },
        },
      });

    if (!issue) {
      throw new NotFoundException(
        'SEO issue not found',
      );
    }

    return issue;
  }

  /*
   * =========================================================
   * GET ISSUES BY CRAWL
   * =========================================================
   */

  async getIssuesByCrawl(
    organizationId: string,
    crawlId: string,
    status?: string,
  ) {
    /*
     * First verify that this crawl belongs
     * to the authenticated organization.
     */

    const crawl =
      await this.prisma.crawl.findFirst({
        where: {
          id: crawlId,

          website: {
            organizationId,
          },
        },
      });

    if (!crawl) {
      throw new NotFoundException(
        `Crawl not found: ${crawlId}`,
      );
    }

    let issueStatus:
      | SeoIssueStatus
      | undefined;

    if (status) {
      if (
        !Object.values(
          SeoIssueStatus,
        ).includes(
          status as SeoIssueStatus,
        )
      ) {
        throw new BadRequestException(
          `Invalid issue status: ${status}`,
        );
      }

      issueStatus =
        status as SeoIssueStatus;
    }

    const issues =
      await this.prisma.seoIssue.findMany({
        where: {
          crawlPage: {
            crawlId,
          },

          ...(issueStatus
            ? {
                status: issueStatus,
              }
            : {}),
        },

        include: {
          crawlPage: {
            select: {
              id: true,
              url: true,
              statusCode: true,
              title: true,
              metaDescription: true,
              canonical: true,
            },
          },
        },
      });

    /*
     * =======================================================
     * SORT
     * =======================================================
     *
     * CRITICAL
     * HIGH
     * MEDIUM
     * LOW
     *
     * Then newest first.
     */

    const severityPriority: Record<
      SeoIssueSeverity,
      number
    > = {
      [SeoIssueSeverity.CRITICAL]: 1,
      [SeoIssueSeverity.HIGH]: 2,
      [SeoIssueSeverity.MEDIUM]: 3,
      [SeoIssueSeverity.LOW]: 4,
    };

    issues.sort((a, b) => {
      const priorityA =
        severityPriority[a.severity];

      const priorityB =
        severityPriority[b.severity];

      if (
        priorityA !== priorityB
      ) {
        return (
          priorityA - priorityB
        );
      }

      return (
        b.createdAt.getTime() -
        a.createdAt.getTime()
      );
    });

    return {
      crawlId: crawl.id,

      status:
        issueStatus ?? 'ALL',

      count:
        issues.length,

      issues,
    };
  }

  /*
   * =========================================================
   * UPDATE ISSUE STATUS
   * =========================================================
   */

  async updateStatus(
    organizationId: string,
    issueId: string,
    status: SeoIssueStatus,
  ) {
    /*
     * Validate enum value.
     */

    if (
      !Object.values(
        SeoIssueStatus,
      ).includes(status)
    ) {
      throw new BadRequestException(
        `Invalid issue status: ${status}`,
      );
    }

    /*
     * Make sure the issue belongs
     * to the authenticated organization.
     */

    const issue =
      await this.prisma.seoIssue.findFirst({
        where: {
          id: issueId,

          crawlPage: {
            crawl: {
              website: {
                organizationId,
              },
            },
          },
        },
      });

    if (!issue) {
      throw new NotFoundException(
        'SEO issue not found',
      );
    }

    return this.prisma.seoIssue.update({
      where: {
        id: issueId,
      },

      data: {
        status,
      },
    });
  }

  /*
   * =========================================================
   * RESOLVE ISSUE
   * =========================================================
   */

  async resolveIssue(
    organizationId: string,
    issueId: string,
  ) {
    return this.updateStatus(
      organizationId,
      issueId,
      SeoIssueStatus.FIXED,
    );
  }

  /*
   * =========================================================
   * IGNORE ISSUE
   * =========================================================
   */

  async ignoreIssue(
    organizationId: string,
    issueId: string,
  ) {
    return this.updateStatus(
      organizationId,
      issueId,
      SeoIssueStatus.IGNORED,
    );
  }

  /*
   * =========================================================
   * REOPEN ISSUE
   * =========================================================
   */

  async reopenIssue(
    organizationId: string,
    issueId: string,
  ) {
    return this.updateStatus(
      organizationId,
      issueId,
      SeoIssueStatus.OPEN,
    );
  }
}
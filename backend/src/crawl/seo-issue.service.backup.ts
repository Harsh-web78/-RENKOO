import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';

import {
  SeoIssueStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SeoIssueService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async getIssue(issueId: string) {
    const issue =
      await this.prisma.seoIssue.findUnique({
        where: {
          id: issueId,
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
      throw new BadRequestException(
        'SEO issue not found',
      );
    }

    return issue;
  }

  async updateStatus(
    issueId: string,
    status: SeoIssueStatus,
  ) {
    const issue =
      await this.prisma.seoIssue.findUnique({
        where: {
          id: issueId,
        },
      });

    if (!issue) {
      throw new BadRequestException(
        'SEO issue not found',
      );
    }

    const updated =
      await this.prisma.seoIssue.update({
        where: {
          id: issueId,
        },
        data: {
          status,
        },
      });

    return updated;
  }
}
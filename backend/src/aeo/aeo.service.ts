import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AeoCheckType,
  AeoIssueStatus,
  SeoIssueSeverity,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AeoService {
  constructor(private readonly prisma: PrismaService) {}

  private clamp(value: number): number {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  private async getWebsite(organizationId: string, websiteId: string) {
    const website = await this.prisma.website.findFirst({
      where: {
        id: websiteId,
        organizationId,
        isActive: true,
      },
    });

    if (!website) {
      throw new NotFoundException('Website not found');
    }

    return website;
  }

  async getLatestAudit(organizationId: string, websiteId: string) {
    await this.getWebsite(organizationId, websiteId);

    return this.prisma.aeoAudit.findFirst({
      where: { websiteId },
      orderBy: { createdAt: 'desc' },
      include: {
        AeoIssue: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async getIssues(
    organizationId: string,
    websiteId: string,
    status?: AeoIssueStatus,
  ) {
    await this.getWebsite(organizationId, websiteId);

    return this.prisma.aeoIssue.findMany({
      where: {
        AeoAudit: {
          websiteId,
        },
        ...(status ? { status } : {}),
      },
      orderBy: [
        { severity: 'asc' },
        { createdAt: 'desc' },
      ],
      take: 500,
      include: {
        AeoAudit: {
          select: {
            id: true,
            websiteId: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async runAudit(organizationId: string, websiteId: string) {
    const website = await this.getWebsite(organizationId, websiteId);

    const crawl = await this.prisma.crawl.findFirst({
      where: {
        websiteId,
        status: 'COMPLETED',
      },
      orderBy: {
        completedAt: 'desc',
      },
      include: {
        pages: true,
      },
    });

    if (!crawl) {
      throw new NotFoundException(
        'No completed crawl found for this website',
      );
    }

    const pages = crawl.pages.filter(
      (page) =>
        page.statusCode === null ||
        (page.statusCode >= 200 && page.statusCode < 400),
    );

    if (pages.length === 0) {
      throw new NotFoundException(
        'Completed crawl contains no analyzable pages',
      );
    }

    const issues: Array<{
      pageUrl: string;
      checkType: AeoCheckType;
      severity: SeoIssueSeverity;
      title: string;
      description: string;
      recommendation: string;
    }> = [];

    let answerReady = 0;
    let faqReady = 0;
    let structuredReady = 0;
    let entityReady = 0;
    let contentReady = 0;
    let directAnswerReady = 0;

    const questionPattern =
      /^(what|why|how|when|where|who|which|can|is|are|do|does|should)\b/i;

    for (const page of pages) {
      const h1 = Array.isArray(page.h1) ? page.h1 : [];
      const h2 = Array.isArray(page.h2) ? page.h2 : [];

      const hasQuestionHeading =
        [...h1, ...h2].some((heading) =>
          questionPattern.test(String(heading).trim()),
        );

      const hasBasicEntitySignals =
        Boolean(page.title?.trim()) &&
        Boolean(page.metaDescription?.trim()) &&
        h1.length > 0;

      const hasStructuredData =
        page.structuredDataCount > 0;

      const hasDeepContent =
        page.wordCount >= 300;

      const hasAnswerStructure =
        hasQuestionHeading &&
        page.wordCount >= 300;

      if (hasAnswerStructure) {
        answerReady++;
        directAnswerReady++;
      } else if (!hasQuestionHeading && page.wordCount >= 500 && h2.length === 0) {
        issues.push({
          pageUrl: page.url,
          checkType: AeoCheckType.ANSWER_READINESS,
          severity: SeoIssueSeverity.LOW,
          title: 'Weak answer-oriented structure',
          description:
            'The page contains substantial content but no question-oriented headings or clear H2 sections were detected.',
          recommendation:
            'Add useful question-based sections and concise answers where they naturally match the user intent.',
        });

        issues.push({
          pageUrl: page.url,
          checkType: AeoCheckType.DIRECT_ANSWER,
          severity: SeoIssueSeverity.LOW,
          title: 'Direct-answer structure could be improved',
          description:
            'The page does not expose a clear question-and-answer structure for answer-oriented discovery.',
          recommendation:
            'Add concise, direct answers under relevant question headings.',
        });
      }

      if (hasQuestionHeading) {
        faqReady++;
      } else if (page.wordCount >= 300) {
        issues.push({
          pageUrl: page.url,
          checkType: AeoCheckType.FAQ,
          severity: SeoIssueSeverity.LOW,
          title: 'Limited FAQ-style structure',
          description:
            'No question-oriented H1 or H2 heading was detected on this substantial page.',
          recommendation:
            'Consider adding genuinely useful FAQ or question-based sections where relevant.',
        });
      }

      if (hasStructuredData) {
        structuredReady++;
      } else if (page.wordCount >= 300) {
        issues.push({
          pageUrl: page.url,
          checkType: AeoCheckType.STRUCTURED_DATA,
          severity: SeoIssueSeverity.MEDIUM,
          title: 'Structured data opportunity',
          description:
            'The page contains substantial content but no structured data was detected by the crawler.',
          recommendation:
            'Add relevant structured data only when it accurately represents the page content.',
        });
      }

      if (hasBasicEntitySignals) {
        entityReady++;
      } else if (page.wordCount >= 300) {
        issues.push({
          pageUrl: page.url,
          checkType: AeoCheckType.ENTITY,
          severity: SeoIssueSeverity.MEDIUM,
          title: 'Page lacks basic entity clarity',
          description:
            'The page is substantial but is missing one or more of its title, meta description or primary H1 signals.',
          recommendation:
            'Clearly state what the page is about, who or what it represents and the user intent it serves.',
        });
      }

      if (hasDeepContent) {
        contentReady++;
      } else if (page.wordCount > 0) {
        issues.push({
          pageUrl: page.url,
          checkType: AeoCheckType.CONTENT_DEPTH,
          severity: SeoIssueSeverity.LOW,
          title: 'Content depth could be improved',
          description:
            `The crawler recorded approximately ${page.wordCount} words on this page.`,
          recommendation:
            'Expand useful, substantive content when additional depth genuinely helps answer the target user intent.',
        });
      }
    }

    const total = pages.length;

    const answerScore = (answerReady / total) * 100;
    const faqScore = (faqReady / total) * 100;
    const structuredScore = (structuredReady / total) * 100;
    const entityScore = (entityReady / total) * 100;
    const contentScore = (contentReady / total) * 100;
    const directAnswerScore = (directAnswerReady / total) * 100;

    const overallScore = this.clamp(
      answerScore * 0.25 +
        faqScore * 0.10 +
        structuredScore * 0.15 +
        entityScore * 0.20 +
        contentScore * 0.20 +
        directAnswerScore * 0.10,
    );

    const auditId = `aeo_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 9)}`;

    const audit = await this.prisma.aeoAudit.create({
      data: {
        id: auditId,
        websiteId: website.id,
        score: overallScore,
        pagesChecked: total,
        issuesCount: issues.length,
        updatedAt: new Date(),
      },
    });

    if (issues.length > 0) {
      await this.prisma.aeoIssue.createMany({
        data: issues.map((issue) => ({
          id: `aeoi_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 10)}`,
          auditId: audit.id,
          pageUrl: issue.pageUrl,
          checkType: issue.checkType,
          status: AeoIssueStatus.OPEN,
          severity: issue.severity,
          title: issue.title,
          description: issue.description,
          recommendation: issue.recommendation,
        })),
      });
    }

    const savedAudit = await this.prisma.aeoAudit.findUnique({
      where: { id: audit.id },
      include: {
        AeoIssue: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return {
      website: {
        id: website.id,
        name: website.name,
        url: website.url,
      },
      crawlId: crawl.id,
      audit: savedAudit,
      metrics: {
        pagesAnalyzed: total,
        answerScore: this.clamp(answerScore),
        faqScore: this.clamp(faqScore),
        structuredDataScore: this.clamp(structuredScore),
        entityScore: this.clamp(entityScore),
        contentScore: this.clamp(contentScore),
        directAnswerScore: this.clamp(directAnswerScore),
        overallScore,
        issues: issues.length,
      },
    };
  }
}

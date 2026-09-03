import { Injectable } from '@nestjs/common';

import {
  SeoIssueSeverity,
  SeoIssueStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SeoAuditService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async auditPage(crawlPageId: string) {
    const page = await this.prisma.crawlPage.findUnique({
      where: {
        id: crawlPageId,
      },
    });

    if (!page) {
      throw new Error('Crawl page not found');
    }

    const issues: Array<{
      crawlPageId: string;
      code: string;
      category: string;
      severity: SeoIssueSeverity;
      title: string;
      description: string;
      recommendation: string;
      status: SeoIssueStatus;
    }> = [];

    /*
     * =========================================================
     * 1. TITLE
     * =========================================================
     */

    if (!page.title || !page.title.trim()) {
      issues.push({
        crawlPageId: page.id,
        code: 'MISSING_TITLE',
        category: 'ON_PAGE',
        severity: SeoIssueSeverity.CRITICAL,
        title: 'Missing page title',
        description:
          'This page does not have a title element.',
        recommendation:
          'Add a unique, descriptive title that clearly explains the page topic and target search intent.',
        status: SeoIssueStatus.OPEN,
      });
    } else {
      const titleLength = page.title.trim().length;

      if (titleLength < 30) {
        issues.push({
          crawlPageId: page.id,
          code: 'TITLE_TOO_SHORT',
          category: 'ON_PAGE',
          severity: SeoIssueSeverity.MEDIUM,
          title: 'Title is too short',
          description:
            'The page title contains fewer than 30 characters.',
          recommendation:
            'Expand the title to clearly communicate the page topic and search intent.',
          status: SeoIssueStatus.OPEN,
        });
      }

      if (titleLength > 60) {
        issues.push({
          crawlPageId: page.id,
          code: 'TITLE_TOO_LONG',
          category: 'ON_PAGE',
          severity: SeoIssueSeverity.MEDIUM,
          title: 'Title is too long',
          description:
            'The page title contains more than 60 characters.',
          recommendation:
            'Shorten the title while preserving the primary topic and important keywords.',
          status: SeoIssueStatus.OPEN,
        });
      }
    }

    /*
     * =========================================================
     * 2. META DESCRIPTION
     * =========================================================
     */

    if (
      !page.metaDescription ||
      !page.metaDescription.trim()
    ) {
      issues.push({
        crawlPageId: page.id,
        code: 'MISSING_META_DESCRIPTION',
        category: 'ON_PAGE',
        severity: SeoIssueSeverity.HIGH,
        title: 'Missing meta description',
        description:
          'This page does not contain a meta description.',
        recommendation:
          'Write a unique, useful meta description that summarizes the page and encourages the right users to click.',
        status: SeoIssueStatus.OPEN,
      });
    } else {
      const descriptionLength =
        page.metaDescription.trim().length;

      if (descriptionLength < 70) {
        issues.push({
          crawlPageId: page.id,
          code: 'META_DESCRIPTION_TOO_SHORT',
          category: 'ON_PAGE',
          severity: SeoIssueSeverity.MEDIUM,
          title: 'Meta description is too short',
          description:
            'The meta description is very short and may not communicate enough context.',
          recommendation:
            'Expand the description with useful context and a clear value proposition.',
          status: SeoIssueStatus.OPEN,
        });
      }

      if (descriptionLength > 160) {
        issues.push({
          crawlPageId: page.id,
          code: 'META_DESCRIPTION_TOO_LONG',
          category: 'ON_PAGE',
          severity: SeoIssueSeverity.LOW,
          title: 'Meta description is too long',
          description:
            'The meta description is longer than the recommended range.',
          recommendation:
            'Shorten it while preserving the most important information.',
          status: SeoIssueStatus.OPEN,
        });
      }
    }

    /*
     * =========================================================
     * 3. H1
     * =========================================================
     */

    if (!page.h1 || page.h1.length === 0) {
      issues.push({
        crawlPageId: page.id,
        code: 'MISSING_H1',
        category: 'ON_PAGE',
        severity: SeoIssueSeverity.HIGH,
        title: 'Missing H1 heading',
        description:
          'This page does not contain an H1 heading.',
        recommendation:
          'Add one clear H1 that describes the main topic of the page.',
        status: SeoIssueStatus.OPEN,
      });
    }

    if (page.h1 && page.h1.length > 1) {
      issues.push({
        crawlPageId: page.id,
        code: 'MULTIPLE_H1',
        category: 'ON_PAGE',
        severity: SeoIssueSeverity.MEDIUM,
        title: 'Multiple H1 headings',
        description:
          `This page contains ${page.h1.length} H1 headings.`,
        recommendation:
          'Review the heading structure and ensure the page has a clear primary heading.',
        status: SeoIssueStatus.OPEN,
      });
    }

    /*
     * =========================================================
     * 4. CANONICAL
     * =========================================================
     */

    if (
      !page.canonical ||
      !page.canonical.trim()
    ) {
      issues.push({
        crawlPageId: page.id,
        code: 'MISSING_CANONICAL',
        category: 'TECHNICAL',
        severity: SeoIssueSeverity.MEDIUM,
        title: 'Missing canonical URL',
        description:
          'This page does not expose a canonical URL.',
        recommendation:
          'Add a canonical URL when appropriate to clarify the preferred version of the page.',
        status: SeoIssueStatus.OPEN,
      });
    }

    /*
     * =========================================================
     * 5. IMAGES
     * =========================================================
     */

    if (page.imagesWithoutAlt > 0) {
      issues.push({
        crawlPageId: page.id,
        code: 'IMAGES_WITHOUT_ALT',
        category: 'ACCESSIBILITY',
        severity: SeoIssueSeverity.MEDIUM,
        title: 'Images missing alt text',
        description:
          `${page.imagesWithoutAlt} image(s) do not have useful alt text.`,
        recommendation:
          'Add descriptive alt text to meaningful images and use empty alt text for purely decorative images.',
        status: SeoIssueStatus.OPEN,
      });
    }

    /*
     * =========================================================
     * 6. THIN CONTENT
     * =========================================================
     */

    if (page.wordCount < 300) {
      issues.push({
        crawlPageId: page.id,
        code: 'THIN_CONTENT',
        category: 'CONTENT',
        severity: SeoIssueSeverity.MEDIUM,
        title: 'Low text content',
        description:
          `This page contains approximately ${page.wordCount} words of visible text.`,
        recommendation:
          'Evaluate whether the page fully satisfies its search intent. Add useful information only where it genuinely improves the page.',
        status: SeoIssueStatus.OPEN,
      });
    }

    /*
     * =========================================================
     * 7. HTTP STATUS
     * =========================================================
     */

    if (
      page.statusCode !== null &&
      page.statusCode >= 400
    ) {
      issues.push({
        crawlPageId: page.id,
        code: 'HTTP_ERROR',
        category: 'TECHNICAL',
        severity: SeoIssueSeverity.CRITICAL,
        title: 'HTTP error response',
        description:
          `The page returned HTTP status ${page.statusCode}.`,
        recommendation:
          'Investigate the server response and make sure important pages return the correct HTTP status.',
        status: SeoIssueStatus.OPEN,
      });
    }

    /*
     * =========================================================
     * 8. REMOVE ONLY CURRENT OPEN ISSUES
     *
     * FIXED and IGNORED are preserved.
     * =========================================================
     */

    await this.prisma.seoIssue.deleteMany({
      where: {
        crawlPageId: page.id,
        status: SeoIssueStatus.OPEN,
      },
    });

    /*
     * =========================================================
     * 9. SAVE CURRENT ISSUES
     * =========================================================
     */

    if (issues.length > 0) {
      await this.prisma.seoIssue.createMany({
        data: issues,
      });
    }

    /*
     * =========================================================
     * 10. RETURN AUDIT RESULT
     * =========================================================
     */

    return {
      pageId: page.id,
      issueCount: issues.length,
      issues,
    };
  }
}
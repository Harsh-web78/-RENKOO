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
    const page =
      await this.prisma.crawlPage.findUnique({
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

    const addIssue = (
      code: string,
      category: string,
      severity: SeoIssueSeverity,
      title: string,
      description: string,
      recommendation: string,
    ) => {
      issues.push({
        crawlPageId: page.id,
        code,
        category,
        severity,
        title,
        description,
        recommendation,
        status: SeoIssueStatus.OPEN,
      });
    };

    /*
     * =========================================================
     * 1. HTTP STATUS
     * =========================================================
     *
     * 4xx = HIGH
     * 5xx = CRITICAL
     *
     * A normal 404 should not automatically have the same
     * severity as a server outage.
     */

    if (
      page.statusCode !== null &&
      page.statusCode >= 500
    ) {
      addIssue(
        'HTTP_SERVER_ERROR',
        'TECHNICAL',
        SeoIssueSeverity.CRITICAL,
        'Server error response',
        `The page returned HTTP status ${page.statusCode}.`,
        'Investigate the server-side failure and make sure important URLs return a successful HTTP response.',
      );
    } else if (
      page.statusCode !== null &&
      page.statusCode >= 400
    ) {
      addIssue(
        'HTTP_CLIENT_ERROR',
        'TECHNICAL',
        SeoIssueSeverity.HIGH,
        'Client error response',
        `The page returned HTTP status ${page.statusCode}.`,
        'Fix the URL, restore the page, or redirect it to the most relevant valid destination when appropriate.',
      );
    }

    /*
     * =========================================================
     * 2. TITLE
     * =========================================================
     */

    if (
      !page.title ||
      !page.title.trim()
    ) {
      addIssue(
        'MISSING_TITLE',
        'ON_PAGE',
        SeoIssueSeverity.CRITICAL,
        'Missing page title',
        'This page does not have a title element.',
        'Add a unique, descriptive title that clearly explains the page topic and target search intent.',
      );
    } else {
      const titleLength =
        page.title.trim().length;

      if (titleLength < 30) {
        addIssue(
          'TITLE_TOO_SHORT',
          'ON_PAGE',
          SeoIssueSeverity.LOW,
          'Title may be too short',
          `The page title contains ${titleLength} characters.`,
          'Consider expanding the title if additional context would improve clarity and search intent alignment.',
        );
      }

      if (titleLength > 60) {
        addIssue(
          'TITLE_TOO_LONG',
          'ON_PAGE',
          SeoIssueSeverity.LOW,
          'Title may be too long',
          `The page title contains ${titleLength} characters.`,
          'Consider shortening the title while preserving the primary topic and important keywords.',
        );
      }
    }

    /*
     * =========================================================
     * 3. META DESCRIPTION
     * =========================================================
     */

    if (
      !page.metaDescription ||
      !page.metaDescription.trim()
    ) {
      addIssue(
        'MISSING_META_DESCRIPTION',
        'ON_PAGE',
        SeoIssueSeverity.MEDIUM,
        'Missing meta description',
        'This page does not contain a meta description.',
        'Write a unique and useful meta description that summarizes the page and encourages the right users to click.',
      );
    } else {
      const descriptionLength =
        page.metaDescription.trim().length;

      if (descriptionLength < 70) {
        addIssue(
          'META_DESCRIPTION_TOO_SHORT',
          'ON_PAGE',
          SeoIssueSeverity.LOW,
          'Meta description may be too short',
          `The meta description contains ${descriptionLength} characters.`,
          'Consider expanding the description with useful context and a clear value proposition.',
        );
      }

      if (descriptionLength > 160) {
        addIssue(
          'META_DESCRIPTION_TOO_LONG',
          'ON_PAGE',
          SeoIssueSeverity.LOW,
          'Meta description may be too long',
          `The meta description contains ${descriptionLength} characters.`,
          'Consider shortening it while preserving the most important information.',
        );
      }
    }

    /*
     * =========================================================
     * 4. H1
     * =========================================================
     */

    if (
      !page.h1 ||
      page.h1.length === 0
    ) {
      addIssue(
        'MISSING_H1',
        'ON_PAGE',
        SeoIssueSeverity.HIGH,
        'Missing H1 heading',
        'This page does not contain an H1 heading.',
        'Add one clear H1 that describes the main topic of the page.',
      );
    }

    if (
      page.h1 &&
      page.h1.length > 1
    ) {
      addIssue(
        'MULTIPLE_H1',
        'ON_PAGE',
        SeoIssueSeverity.LOW,
        'Multiple H1 headings',
        `This page contains ${page.h1.length} H1 headings.`,
        'Review the heading structure and ensure the page has a clear primary heading.',
      );
    }

    /*
     * =========================================================
     * 5. H2 STRUCTURE
     * =========================================================
     */

    if (
      page.wordCount >= 600 &&
      (!page.h2 ||
        page.h2.length === 0)
    ) {
      addIssue(
        'MISSING_H2_STRUCTURE',
        'ON_PAGE',
        SeoIssueSeverity.LOW,
        'Long page has no H2 structure',
        `The page contains approximately ${page.wordCount} words but no H2 headings were detected.`,
        'Consider using descriptive H2 sections to make the content easier to understand and navigate.',
      );
    }

    /*
     * =========================================================
     * 6. CANONICAL
     * =========================================================
     */

    if (
      !page.canonical ||
      !page.canonical.trim()
    ) {
      addIssue(
        'MISSING_CANONICAL',
        'TECHNICAL',
        SeoIssueSeverity.MEDIUM,
        'Missing canonical URL',
        'This page does not expose a canonical URL.',
        'Add a canonical URL when appropriate to clarify the preferred version of the page.',
      );
    } else {
      try {
        const pageUrl =
          new URL(page.url);

        const canonicalUrl =
          new URL(
            page.canonical.trim(),
            page.url,
          );

        if (
          canonicalUrl.protocol !==
            'http:' &&
          canonicalUrl.protocol !==
            'https:'
        ) {
          throw new Error(
            'Unsupported canonical protocol',
          );
        }

        if (
          canonicalUrl.hostname.toLowerCase() !==
          pageUrl.hostname.toLowerCase()
        ) {
          addIssue(
            'CANONICAL_CROSS_DOMAIN',
            'TECHNICAL',
            SeoIssueSeverity.HIGH,
            'Canonical points to another domain',
            `The canonical URL points to ${canonicalUrl.hostname}, while the page belongs to ${pageUrl.hostname}.`,
            `Review the canonical URL. If cross-domain canonicalization is not intentional, change it to the preferred URL on ${pageUrl.hostname}.`,
          );
        }

        if (
          canonicalUrl.username ||
          canonicalUrl.password
        ) {
          addIssue(
            'CANONICAL_HAS_CREDENTIALS',
            'TECHNICAL',
            SeoIssueSeverity.HIGH,
            'Canonical URL contains credentials',
            'The canonical URL contains username or password information.',
            'Remove credentials from the canonical URL and use a normal public URL.',
          );
        }
      } catch {
        addIssue(
          'INVALID_CANONICAL',
          'TECHNICAL',
          SeoIssueSeverity.HIGH,
          'Invalid canonical URL',
          `The canonical value "${page.canonical}" is not a valid absolute or relative URL.`,
          'Replace the canonical value with a valid absolute or relative URL.',
        );
      }
    }

    /*
     * =========================================================
     * 7. ROBOTS
     * =========================================================
     *
     * Noindex on a 404 is expected and should not create a
     * duplicate NOINDEX issue.
     */

    const isErrorPage =
      page.statusCode !== null &&
      page.statusCode >= 400;

    if (
      page.robotsIndexable === false &&
      !isErrorPage
    ) {
      addIssue(
        'NOINDEX',
        'TECHNICAL',
        SeoIssueSeverity.HIGH,
        'Page is marked noindex',
        'The page is explicitly marked as not indexable by search engines.',
        'If this page should appear in organic search, remove the noindex directive.',
      );
    }

    if (
      page.robotsFollow === false &&
      !isErrorPage
    ) {
      addIssue(
        'NOFOLLOW',
        'TECHNICAL',
        SeoIssueSeverity.MEDIUM,
        'Page is marked nofollow',
        'The page is explicitly marked with a nofollow directive.',
        'If search engines should follow links on this page, remove the nofollow directive.',
      );
    }

    /*
     * =========================================================
     * 8. VIEWPORT
     * =========================================================
     */

    if (
      !page.viewport ||
      !page.viewport.trim()
    ) {
      addIssue(
        'MISSING_VIEWPORT',
        'TECHNICAL',
        SeoIssueSeverity.MEDIUM,
        'Missing mobile viewport',
        'The page does not expose a viewport meta tag.',
        'Add a responsive viewport such as width=device-width, initial-scale=1.',
      );
    }

    /*
     * =========================================================
     * 9. LANGUAGE
     * =========================================================
     */

    if (
      !page.lang ||
      !page.lang.trim()
    ) {
      addIssue(
        'MISSING_HTML_LANG',
        'TECHNICAL',
        SeoIssueSeverity.LOW,
        'Missing HTML language',
        'The document does not declare a language.',
        'Add an appropriate lang attribute to the HTML element.',
      );
    }

    /*
     * =========================================================
     * 10. CHARSET
     * =========================================================
     */

    if (
      !page.charset ||
      !page.charset.trim()
    ) {
      addIssue(
        'MISSING_CHARSET',
        'TECHNICAL',
        SeoIssueSeverity.LOW,
        'Missing character encoding',
        'The page does not expose a detected character encoding.',
        'Declare UTF-8 character encoding using a charset meta tag.',
      );
    }

    /*
     * =========================================================
     * 11. OPEN GRAPH
     * =========================================================
     */

    const hasOgTitle =
      !!page.ogTitle?.trim();

    const hasOgDescription =
      !!page.ogDescription?.trim();

    const hasOgImage =
      !!page.ogImage?.trim();

    if (
      !hasOgTitle ||
      !hasOgDescription ||
      !hasOgImage
    ) {
      const missingOg: string[] =
        [];

      if (!hasOgTitle) {
        missingOg.push('og:title');
      }

      if (!hasOgDescription) {
        missingOg.push(
          'og:description',
        );
      }

      if (!hasOgImage) {
        missingOg.push('og:image');
      }

      addIssue(
        'INCOMPLETE_OPEN_GRAPH',
        'SOCIAL',
        SeoIssueSeverity.LOW,
        'Incomplete Open Graph metadata',
        `Missing Open Graph fields: ${missingOg.join(', ')}.`,
        'Add important Open Graph metadata so shared pages have clear titles, descriptions and images.',
      );
    }

    /*
     * =========================================================
     * 12. TWITTER CARD
     * =========================================================
     */

    if (
      !page.twitterCard ||
      !page.twitterCard.trim()
    ) {
      addIssue(
        'MISSING_TWITTER_CARD',
        'SOCIAL',
        SeoIssueSeverity.LOW,
        'Missing Twitter/X card metadata',
        'No Twitter/X card type was detected.',
        'Add an appropriate twitter:card value to control how the page appears when shared.',
      );
    }

    /*
     * =========================================================
     * 13. STRUCTURED DATA
     * =========================================================
     */

    if (
      page.structuredDataCount === 0
    ) {
      addIssue(
        'MISSING_STRUCTURED_DATA',
        'STRUCTURED_DATA',
        SeoIssueSeverity.LOW,
        'No structured data detected',
        'No JSON-LD or other detected structured data was found on this page.',
        'Consider adding schema.org structured data where it genuinely describes the page and business entity.',
      );
    }

    if (
      page.structuredDataCount > 0 &&
      page.jsonLd == null
    ) {
      addIssue(
        'STRUCTURED_DATA_PARSE_WARNING',
        'STRUCTURED_DATA',
        SeoIssueSeverity.MEDIUM,
        'Structured data could not be stored',
        'Structured data was detected, but no parsed JSON-LD payload was stored for this page.',
        'Review the JSON-LD extraction and validation pipeline and make sure valid structured data is preserved.',
      );
    }

    /*
     * =========================================================
     * 14. IMAGES
     * =========================================================
     */

    if (
      page.imagesWithoutAlt > 0
    ) {
      addIssue(
        'IMAGES_WITHOUT_ALT',
        'ACCESSIBILITY',
        SeoIssueSeverity.MEDIUM,
        'Images missing alt text',
        `${page.imagesWithoutAlt} image(s) do not have useful alt text.`,
        'Add descriptive alt text to meaningful images and use empty alt attributes for decorative images.',
      );
    }

    /*
     * =========================================================
     * 15. THIN CONTENT
     * =========================================================
     */

    if (
      page.wordCount < 300 &&
      !isErrorPage
    ) {
      addIssue(
        'THIN_CONTENT',
        'CONTENT',
        SeoIssueSeverity.MEDIUM,
        'Low text content',
        `This page contains approximately ${page.wordCount} words of visible text.`,
        'Evaluate whether the page fully satisfies its search intent. Add useful information only where it genuinely improves the page.',
      );
    }

    /*
     * =========================================================
     * 16. INTERNAL LINKING
     * =========================================================
     */

    if (
      page.internalLinks === 0 &&
      page.wordCount > 300 &&
      !isErrorPage
    ) {
      addIssue(
        'NO_INTERNAL_LINKS',
        'LINKS',
        SeoIssueSeverity.MEDIUM,
        'No internal links detected',
        'This page contains meaningful text but no internal links were detected.',
        'Add relevant internal links to important pages where they improve navigation and topical relationships.',
      );
    }

    /*
     * =========================================================
     * 17. EXTERNAL LINK SIGNAL
     * =========================================================
     */

    if (
      page.externalLinks > 50
    ) {
      addIssue(
        'EXCESSIVE_EXTERNAL_LINKS',
        'LINKS',
        SeoIssueSeverity.LOW,
        'Large number of external links',
        `This page contains ${page.externalLinks} external links.`,
        'Review the links and remove unnecessary external links where they do not provide value.',
      );
    }

    /*
     * =========================================================
     * 18. REDIRECT
     * =========================================================
     */

    if (
      page.redirectCount > 0
    ) {
      if (
        page.redirectCount >= 3
      ) {
        addIssue(
          'REDIRECT_CHAIN',
          'TECHNICAL',
          SeoIssueSeverity.HIGH,
          'Redirect chain detected',
          `This page required ${page.redirectCount} redirects before reaching the final URL.`,
          'Reduce redirect chains and point internal links directly to the final destination URL.',
        );
      } else {
        addIssue(
          'REDIRECTED_PAGE',
          'TECHNICAL',
          SeoIssueSeverity.LOW,
          'Page was redirected',
          `This URL required ${page.redirectCount} redirect(s) before reaching the final URL.`,
          'Review whether the redirect is necessary and update internal links to the final URL where possible.',
        );
      }
    }

    /*
     * =========================================================
     * 19. FINAL URL
     * =========================================================
     */

    if (
      page.finalUrl &&
      page.finalUrl.trim()
    ) {
      try {
        const original =
          new URL(page.url);

        const final =
          new URL(page.finalUrl);

        if (
          final.protocol !==
            'http:' &&
          final.protocol !==
            'https:'
        ) {
          addIssue(
            'INVALID_FINAL_URL',
            'TECHNICAL',
            SeoIssueSeverity.HIGH,
            'Invalid final URL',
            `The crawler recorded an unsupported final URL: ${page.finalUrl}.`,
            'Make sure the final destination resolves to a normal HTTP or HTTPS URL.',
          );
        }

        if (
          original.hostname.toLowerCase() !==
          final.hostname.toLowerCase()
        ) {
          addIssue(
            'FINAL_URL_CROSS_DOMAIN',
            'TECHNICAL',
            SeoIssueSeverity.MEDIUM,
            'Redirect ends on another domain',
            `The original URL belongs to ${original.hostname}, but the final URL belongs to ${final.hostname}.`,
            'Review the redirect and make sure cross-domain redirects are intentional.',
          );
        }
      } catch {
        addIssue(
          'INVALID_FINAL_URL',
          'TECHNICAL',
          SeoIssueSeverity.HIGH,
          'Invalid final URL',
          `The crawler recorded an invalid final URL: ${page.finalUrl}.`,
          'Review the redirect destination and make sure it resolves to a valid URL.',
        );
      }
    }

    /*
     * =========================================================
     * 20. CONTENT TYPE
     * =========================================================
     */

    if (
      page.contentType &&
      !page.contentType
        .toLowerCase()
        .includes('text/html')
    ) {
      addIssue(
        'NON_HTML_CONTENT',
        'TECHNICAL',
        SeoIssueSeverity.MEDIUM,
        'Page is not HTML content',
        `The detected content type is "${page.contentType}".`,
        'Review whether this URL should be crawled and indexed as an HTML page.',
      );
    }

    /*
     * =========================================================
     * 21. PERFORMANCE
     * =========================================================
     */

    if (
      page.loadTimeMs !== null &&
      page.loadTimeMs > 5000
    ) {
      addIssue(
        'SLOW_PAGE_LOAD',
        'PERFORMANCE',
        SeoIssueSeverity.HIGH,
        'Slow page load',
        `The crawler recorded a load time of approximately ${page.loadTimeMs} ms.`,
        'Investigate server response time, JavaScript execution, images, third-party scripts and other resources affecting page load.',
      );
    } else if (
      page.loadTimeMs !== null &&
      page.loadTimeMs > 3000
    ) {
      addIssue(
        'PAGE_LOAD_NEEDS_IMPROVEMENT',
        'PERFORMANCE',
        SeoIssueSeverity.MEDIUM,
        'Page load could be improved',
        `The crawler recorded a load time of approximately ${page.loadTimeMs} ms.`,
        'Review server response time and page resources to reduce loading time.',
      );
    }

    /*
     * =========================================================
     * 22. AEO CONTENT STRUCTURE
     * =========================================================
     */

    const hasQuestionLikeHeading =
      (page.h1 || []).some(
        (heading) =>
          /^(what|why|how|when|where|who|which|can|is|are|do|does|should)\b/i.test(
            heading.trim(),
          ),
      ) ||
      (page.h2 || []).some(
        (heading) =>
          /^(what|why|how|when|where|who|which|can|is|are|do|does|should)\b/i.test(
            heading.trim(),
          ),
      );

    if (
      page.wordCount >= 500 &&
      !hasQuestionLikeHeading &&
      page.h2.length === 0 &&
      !isErrorPage
    ) {
      addIssue(
        'AEO_CONTENT_STRUCTURE',
        'AEO',
        SeoIssueSeverity.LOW,
        'Content has weak answer-oriented structure',
        'The page contains substantial content but no question-oriented headings or clear H2 sections were detected.',
        'Consider adding useful question-based sections and concise answers where they naturally match the user intent.',
      );
    }

    /*
     * =========================================================
     * 23. AEO ENTITY CLARITY
     * =========================================================
     */

    if (
      page.wordCount >= 300 &&
      !isErrorPage &&
      (
        !page.title ||
        !page.metaDescription ||
        page.h1.length === 0
      )
    ) {
      addIssue(
        'AEO_ENTITY_CLARITY',
        'AEO',
        SeoIssueSeverity.MEDIUM,
        'Page lacks basic entity clarity',
        'The page is substantial but is missing one or more of its title, meta description or primary H1 signals.',
        'Clearly state what the page is about, who or what it represents and the user intent it serves.',
      );
    }

    /*
     * =========================================================
     * 24. GEO SIGNAL
     * =========================================================
     */

    if (
      page.wordCount >= 500 &&
      page.structuredDataCount === 0 &&
      page.h2.length === 0 &&
      !isErrorPage
    ) {
      addIssue(
        'GEO_DISCOVERABILITY_SIGNAL',
        'GEO',
        SeoIssueSeverity.LOW,
        'Weak generative-search discoverability signals',
        'The page contains substantial content but lacks both structured data and clear section structure.',
        'Improve semantic structure and add relevant structured data where it accurately represents the page.',
      );
    }
/*
 * =========================================================
 * 25. REFRESH OPEN ISSUES
 * =========================================================
 *
 * Remove only OPEN issues from the current crawl page.
 *
 * FIXED and IGNORED issues are intentionally preserved
 * as historical records.
 */

await this.prisma.seoIssue.deleteMany({
  where: {
    crawlPageId: page.id,
    status: SeoIssueStatus.OPEN,
  },
});

/*
 * =========================================================
 * 26. SAVE FRESH ISSUES
 * =========================================================
 *
 * Every newly detected issue starts as OPEN.
 *
 * Existing FIXED / IGNORED records are preserved.
 */

if (issues.length > 0) {
  await this.prisma.seoIssue.createMany({
    data: issues.map((issue) => ({
      ...issue,
      status: SeoIssueStatus.OPEN,
    })),
  });
}
    /*
     * =========================================================
     * RESULT
     * =========================================================
     */

    return {
      pageId: page.id,
      issueCount: issues.length,
      issues,
    };
  }
}
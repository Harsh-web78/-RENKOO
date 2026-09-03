import { Injectable } from '@nestjs/common';

@Injectable()
export class RecommendationService {
  generateRecommendations(analysis: any) {
    const recommendations: any[] = [];

    const intelligence =
      analysis?.issues?.intelligence || [];

    const duplicates =
      analysis?.duplicates?.intelligence || [];

    /*
     * =========================================================
     * ISSUE RECOMMENDATIONS
     * =========================================================
     */

    for (const issue of intelligence) {
      const affectedPages =
        Number(issue.affectedPages || 0);

      const affectedPercentage =
        Number(
          issue.affectedPercentage || 0,
        );

      let priority = 'LOW';
      let urgency = 'LOW';
      let impact = 'LOCAL';

      if (
        issue.severity === 'CRITICAL'
      ) {
        priority = 'CRITICAL';
        urgency = 'IMMEDIATE';
      } else if (
        issue.severity === 'HIGH'
      ) {
        priority = 'HIGH';
        urgency = 'HIGH';
      } else if (
        issue.severity === 'MEDIUM'
      ) {
        priority = 'MEDIUM';
        urgency = 'MEDIUM';
      }

      if (
        affectedPercentage >= 80
      ) {
        impact = 'SITE_WIDE';

        if (
          priority === 'LOW'
        ) {
          priority = 'MEDIUM';
        }
      } else if (
        affectedPercentage >= 20
      ) {
        impact = 'WIDESPREAD';
      }

      recommendations.push({
        code: issue.code,
        category: issue.category,
        title: issue.title,
        priority,
        urgency,
        impact,
        severity: issue.severity,
        affectedPages,
        affectedPercentage,
        priorityScore:
          Number(issue.priorityScore || 0),

        problem:
          issue.description,

        action:
          issue.recommendation,

        whyItMatters:
          this.getWhyItMatters(
            issue.code,
          ),

        suggestedFix:
          this.getSuggestedFix(
            issue.code,
          ),
      });
    }

    /*
     * =========================================================
     * DUPLICATE RECOMMENDATIONS
     * =========================================================
     */

    for (
      const duplicate of duplicates
    ) {
      recommendations.push({
        code: duplicate.code,
        category:
          duplicate.type || 'ON_PAGE',

        title:
          duplicate.title,

        priority:
          duplicate.severity ===
          'HIGH'
            ? 'HIGH'
            : duplicate.severity ===
                'MEDIUM'
              ? 'MEDIUM'
              : 'LOW',

        urgency:
          duplicate.severity ===
          'HIGH'
            ? 'HIGH'
            : 'MEDIUM',

        impact:
          duplicate.affectedPercentage >=
          80
            ? 'SITE_WIDE'
            : duplicate.affectedPercentage >=
                20
              ? 'WIDESPREAD'
              : 'LOCAL',

        severity:
          duplicate.severity,

        affectedPages:
          duplicate.affectedPages,

        affectedPercentage:
          duplicate.affectedPercentage,

        priorityScore:
          duplicate.priorityScore,

        problem:
          `The same value is used across ${duplicate.affectedPages} pages.`,

        action:
          'Create unique values for each affected page.',

        whyItMatters:
          'Unique page signals help search engines understand how pages differ and which search intent each page serves.',

        suggestedFix:
          this.getDuplicateFix(
            duplicate.code,
          ),
      });
    }

    /*
     * =========================================================
     * SORT
     * =========================================================
     */

    recommendations.sort(
      (a, b) =>
        (b.priorityScore || 0) -
        (a.priorityScore || 0),
    );

    return recommendations;
  }

  /*
   * =========================================================
   * WHY IT MATTERS
   * =========================================================
   */

  private getWhyItMatters(
    code: string,
  ): string {
    const map: Record<
      string,
      string
    > = {
      HTTP_SERVER_ERROR:
        'Server errors can prevent users and search engines from accessing important pages.',

      HTTP_CLIENT_ERROR:
        'Broken or unavailable URLs create poor user experience and can waste crawl opportunities.',

      MISSING_TITLE:
        'The title is a primary page-level signal used to understand the topic of a page and influence search result presentation.',

      TITLE_TOO_LONG:
        'Very long titles may be truncated and can make the primary page topic less clear.',

      TITLE_TOO_SHORT:
        'Very short titles may provide insufficient context about the page topic.',

      MISSING_META_DESCRIPTION:
        'A useful description can improve the clarity of search-result snippets and help users understand the page before clicking.',

      META_DESCRIPTION_TOO_LONG:
        'Long descriptions may be truncated in search results.',

      META_DESCRIPTION_TOO_SHORT:
        'Short descriptions may fail to communicate the page value or intent clearly.',

      MISSING_H1:
        'The primary heading helps users and systems understand the main topic of the page.',

      MULTIPLE_H1:
        'Multiple primary headings can make the page hierarchy less clear when they are not intentional.',

      MISSING_CANONICAL:
        'Canonical signals help search engines understand the preferred URL when similar or duplicate URLs exist.',

      CANONICAL_CROSS_DOMAIN:
        'An unintended cross-domain canonical can cause search engines to treat another domain as the preferred version.',

      INVALID_CANONICAL:
        'An invalid canonical cannot reliably communicate the preferred URL.',

      NOINDEX:
        'A noindex directive prevents an otherwise eligible page from being indexed.',

      NOFOLLOW:
        'A nofollow directive changes how search engines may follow links from the page.',

      MISSING_VIEWPORT:
        'A viewport declaration is important for responsive mobile rendering.',

      MISSING_HTML_LANG:
        'The language declaration helps systems understand the primary language of the document.',

      MISSING_CHARSET:
        'Character encoding helps browsers correctly interpret page content.',

      INCOMPLETE_OPEN_GRAPH:
        'Open Graph metadata controls how pages are represented when shared on supported social platforms.',

      MISSING_TWITTER_CARD:
        'Twitter/X card metadata helps control how shared URLs are presented.',

      MISSING_STRUCTURED_DATA:
        'Relevant structured data can make page entities and content easier for search systems to interpret.',

      STRUCTURED_DATA_PARSE_WARNING:
        'Detected structured data that cannot be preserved reliably should be investigated because the stored representation may be incomplete.',

      IMAGES_WITHOUT_ALT:
        'Useful alt text improves accessibility and gives search systems additional context about meaningful images.',

      THIN_CONTENT:
        'Pages with insufficient useful content may fail to fully satisfy their intended search intent.',

      NO_INTERNAL_LINKS:
        'Internal links help users navigate and help search engines understand relationships between pages.',

      EXCESSIVE_EXTERNAL_LINKS:
        'Large numbers of unnecessary external links can reduce clarity and may distract users from the primary content.',

      REDIRECT_CHAIN:
        'Redirect chains add unnecessary hops and can complicate crawling and user navigation.',

      REDIRECTED_PAGE:
        'Direct links to the final destination are generally cleaner than repeatedly routing users through redirects.',

      NON_HTML_CONTENT:
        'Non-HTML resources should be intentionally crawlable and indexable rather than accidentally treated as normal pages.',

      SLOW_PAGE_LOAD:
        'Slow pages can negatively affect user experience and performance metrics.',

      PAGE_LOAD_NEEDS_IMPROVEMENT:
        'Reducing load time can improve user experience and page responsiveness.',

      AEO_CONTENT_STRUCTURE:
        'Clear question-and-answer structure can make useful content easier for answer-oriented search systems to interpret.',

      AEO_ENTITY_CLARITY:
        'Clear titles, descriptions and primary headings help systems identify what the page represents.',

      GEO_DISCOVERABILITY_SIGNAL:
        'Semantic structure and accurate structured data can improve machine understanding of entities and content.',
    };

    return (
      map[code] ||
      'Address this issue to improve the technical quality and clarity of the website.'
    );
  }

  /*
   * =========================================================
   * SUGGESTED FIX
   * =========================================================
   */

  private getSuggestedFix(
    code: string,
  ): string {
    const map: Record<
      string,
      string
    > = {
      HTTP_SERVER_ERROR:
        'Check the server logs, application errors, hosting configuration and upstream services. Verify the URL returns a successful response.',

      HTTP_CLIENT_ERROR:
        'Open the affected URL, determine whether the page should exist, then restore it or redirect it to the closest relevant valid page.',

      MISSING_TITLE:
        'Add one unique descriptive <title> element that reflects the page topic and search intent.',

      TITLE_TOO_LONG:
        'Shorten the title while keeping the main topic, important qualifier and brand where useful.',

      TITLE_TOO_SHORT:
        'Expand the title with enough specific context to distinguish the page from other pages.',

      MISSING_META_DESCRIPTION:
        'Add a unique concise meta description describing the page and its value to the intended visitor.',

      META_DESCRIPTION_TOO_LONG:
        'Rewrite the description to retain the main topic, benefit and relevant context without unnecessary wording.',

      META_DESCRIPTION_TOO_SHORT:
        'Add useful context and a clear value proposition without keyword stuffing.',

      MISSING_H1:
        'Add one clear H1 describing the primary subject of the page.',

      MULTIPLE_H1:
        'Keep one primary H1 and convert secondary topics into H2/H3 headings where appropriate.',

      MISSING_CANONICAL:
        'Add a self-referencing canonical for the preferred indexable URL unless another canonical is intentionally preferred.',

      CANONICAL_CROSS_DOMAIN:
        'Verify whether cross-domain canonicalization is intentional. Otherwise point the canonical to the preferred URL on the same site.',

      INVALID_CANONICAL:
        'Replace the invalid canonical with a valid absolute or relative HTTP/HTTPS URL.',

      NOINDEX:
        'Remove noindex from pages that are intended to appear in organic search.',

      NOFOLLOW:
        'Remove nofollow when search engines should be allowed to follow the page links.',

      MISSING_VIEWPORT:
        'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',

      MISSING_HTML_LANG:
        'Add the correct lang attribute to the root HTML element.',

      MISSING_CHARSET:
        'Declare UTF-8 using <meta charset="UTF-8">.',

      INCOMPLETE_OPEN_GRAPH:
        'Add og:title, og:description and og:image with page-specific values.',

      MISSING_TWITTER_CARD:
        'Add an appropriate twitter:card value and supporting Twitter/X metadata.',

      MISSING_STRUCTURED_DATA:
        'Add schema.org JSON-LD only where the structured data accurately represents the page entity or content.',

      STRUCTURED_DATA_PARSE_WARNING:
        'Inspect JSON-LD extraction and validation so valid structured data is parsed and stored correctly.',

      IMAGES_WITHOUT_ALT:
        'Add descriptive alt text to meaningful images and empty alt attributes to decorative images.',

      THIN_CONTENT:
        'Improve the page with genuinely useful information that satisfies its search intent instead of adding filler text.',

      NO_INTERNAL_LINKS:
        'Add relevant contextual internal links to important related pages.',

      EXCESSIVE_EXTERNAL_LINKS:
        'Review the external links and remove those that are unnecessary or unrelated.',

      REDIRECT_CHAIN:
        'Replace redirect chains with direct links to the final destination and reduce unnecessary redirects.',

      REDIRECTED_PAGE:
        'Update internal links to point directly to the final URL where possible.',

      NON_HTML_CONTENT:
        'Confirm whether the resource should be crawled as a non-HTML asset or whether an HTML page should exist at this URL.',

      SLOW_PAGE_LOAD:
        'Investigate server response time, JavaScript, images, third-party scripts and other expensive resources.',

      PAGE_LOAD_NEEDS_IMPROVEMENT:
        'Review server response time and heavy page resources and optimize the slowest components.',

      AEO_CONTENT_STRUCTURE:
        'Add useful descriptive H2 sections and question-based sections where they naturally match user intent.',

      AEO_ENTITY_CLARITY:
        'Make the page topic, entity, audience and search intent explicit through the title, meta description and H1.',

      GEO_DISCOVERABILITY_SIGNAL:
        'Improve semantic section structure and add accurate structured data for relevant entities.',
    };

    return (
      map[code] ||
      'Review the affected pages and apply the recommendation shown for this issue.'
    );
  }

  /*
   * =========================================================
   * DUPLICATE FIXES
   * =========================================================
   */

  private getDuplicateFix(
    code: string,
  ): string {
    const map: Record<
      string,
      string
    > = {
      DUPLICATE_TITLE:
        'Create a unique title for every affected page based on its actual topic and search intent.',

      DUPLICATE_META_DESCRIPTION:
        'Write a unique meta description for each affected page instead of reusing the same description.',

      DUPLICATE_H1:
        'Give each page a distinct primary heading that accurately represents its content.',
    };

    return (
      map[code] ||
      'Create unique page-level signals for the affected URLs.'
    );
  }
}
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

type KeywordIntent =
  | 'COMMERCIAL'
  | 'INFORMATIONAL'
  | 'NAVIGATIONAL'
  | 'TRANSACTIONAL'
  | 'UNKNOWN';

type KeywordPriority =
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW';

@Injectable()
export class KeywordsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  // =========================================================
  // BASIC WEBSITE KEYWORD ANALYSIS
  // =========================================================

  async analyze(
    organizationId: string,
    websiteId: string,
  ) {
    const website =
      await this.prisma.website.findFirst({
        where: {
          id: websiteId,
          organizationId,
        },
      });

    if (!website) {
      throw new NotFoundException(
        'Website not found',
      );
    }

    const crawl =
      await this.prisma.crawl.findFirst({
        where: {
          websiteId,
          status: 'COMPLETED',
        },
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          pages: true,
        },
      });

    if (!crawl) {
      return {
        websiteId,
        keywords: [],
        summary: {
          totalPages: 0,
          totalKeywords: 0,
        },
      };
    }

    const keywordMap =
      this.extractKeywordMap(
        crawl.pages,
      );

    const result =
      Array.from(
        keywordMap.values(),
      )
        .map((item) => ({
          ...item,
          relevanceScore:
            this.calculateRelevance(
              item.pages,
              item.occurrences,
              item.totalWords,
            ),
        }))
        .sort(
          (a, b) =>
            b.relevanceScore -
            a.relevanceScore,
        )
        .slice(0, 200);

    return {
      website: {
        id: website.id,
        name: website.name,
        url: website.url,
      },

      crawlId: crawl.id,

      keywords: result,

      summary: {
        totalPages:
          crawl.pages.length,

        totalKeywords:
          result.length,

        topKeywords:
          result.slice(0, 20),
      },
    };
  }

  // =========================================================
  // KEYWORD GAP
  // =========================================================

  async gap(
    organizationId: string,
    websiteId: string,
    competitorId: string,
  ) {
    // -------------------------------------------------------
    // RENKOO WEBSITE
    // -------------------------------------------------------

    const website =
      await this.prisma.website.findFirst({
        where: {
          id: websiteId,
          organizationId,
        },
      });

    if (!website) {
      throw new NotFoundException(
        'Website not found',
      );
    }

    // -------------------------------------------------------
    // COMPETITOR
    // -------------------------------------------------------

    const competitor =
      await this.prisma.competitor.findFirst({
        where: {
          id: competitorId,
          organizationId,
          websiteId,
        },
      });

    if (!competitor) {
      throw new NotFoundException(
        'Competitor not found for this website',
      );
    }

    // -------------------------------------------------------
    // LATEST RENKOO CRAWL
    // -------------------------------------------------------

    const renkooCrawl =
      await this.prisma.crawl.findFirst({
        where: {
          websiteId,
          status: 'COMPLETED',
          pages: {
            some: {},
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          pages: true,
        },
      });

    if (!renkooCrawl) {
      throw new BadRequestException(
        'No completed RENKOO crawl found. Run a website crawl first.',
      );
    }

    // -------------------------------------------------------
    // LATEST COMPETITOR CRAWL
    // -------------------------------------------------------

    const competitorCrawl =
      await this.prisma.competitorCrawl.findFirst({
        where: {
          competitorId,
          status: 'COMPLETED',
          pages: {
            some: {},
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          pages: true,
        },
      });

    if (!competitorCrawl) {
      throw new BadRequestException(
        'No completed competitor crawl found. Crawl the competitor first.',
      );
    }

    // -------------------------------------------------------
    // EXTRACT KEYWORDS
    // -------------------------------------------------------

    const renkooMap =
      this.extractKeywordMap(
        renkooCrawl.pages,
      );

    const competitorMap =
      this.extractKeywordMap(
        competitorCrawl.pages,
      );

    const allKeywords =
      new Set<string>([
        ...renkooMap.keys(),
        ...competitorMap.keys(),
      ]);

    const missing: any[] = [];
    const shared: any[] = [];
    const renkooOnly: any[] = [];

    for (const keyword of allKeywords) {
      const renkoo =
        renkooMap.get(keyword);

      const competitor =
        competitorMap.get(keyword);

      // -----------------------------------------------------
      // COMPETITOR ONLY = KEYWORD GAP
      // -----------------------------------------------------

      if (!renkoo && competitor) {
        const opportunityScore =
          this.calculateOpportunityScore(
            competitor,
          );

        missing.push({
          keyword,

          competitorPages:
            competitor.pages,

          competitorOccurrences:
            competitor.occurrences,

          competitorTotalWords:
            competitor.totalWords,

          competitorRelevanceScore:
            competitor.relevanceScore,

          intent:
            this.detectIntent(keyword),

          opportunityScore,

          priority:
            this.getPriority(
              opportunityScore,
            ),

          suggestedAction:
            this.buildSuggestion(
              keyword,
              competitor,
            ),
        });

        continue;
      }

      // -----------------------------------------------------
      // SHARED
      // -----------------------------------------------------

      if (renkoo && competitor) {
        const gap =
          Number(
            (
              competitor.relevanceScore -
              renkoo.relevanceScore
            ).toFixed(2),
          );

        shared.push({
          keyword,

          renkooPages:
            renkoo.pages,

          competitorPages:
            competitor.pages,

          renkooOccurrences:
            renkoo.occurrences,

          competitorOccurrences:
            competitor.occurrences,

          renkooRelevanceScore:
            renkoo.relevanceScore,

          competitorRelevanceScore:
            competitor.relevanceScore,

          gap,

          winner:
            gap > 0
              ? 'COMPETITOR'
              : gap < 0
                ? 'RENKOO'
                : 'EQUAL',

          intent:
            this.detectIntent(keyword),
        });

        continue;
      }

      // -----------------------------------------------------
      // RENKOO ONLY
      // -----------------------------------------------------

      if (renkoo && !competitor) {
        renkooOnly.push({
          keyword,

          pages:
            renkoo.pages,

          occurrences:
            renkoo.occurrences,

          relevanceScore:
            renkoo.relevanceScore,

          intent:
            this.detectIntent(keyword),
        });
      }
    }

    // -------------------------------------------------------
    // SORT
    // -------------------------------------------------------

    missing.sort(
      (a, b) =>
        b.opportunityScore -
        a.opportunityScore,
    );

    shared.sort(
      (a, b) =>
        b.gap - a.gap,
    );

    renkooOnly.sort(
      (a, b) =>
        b.relevanceScore -
        a.relevanceScore,
    );

    // -------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------

    const high =
      missing.filter(
        (item) =>
          item.priority === 'HIGH',
      ).length;

    const medium =
      missing.filter(
        (item) =>
          item.priority === 'MEDIUM',
      ).length;

    const low =
      missing.filter(
        (item) =>
          item.priority === 'LOW',
      ).length;

    return {
      website: {
        id: website.id,
        name: website.name,
        url: website.url,
      },

      competitor: {
        id: competitor.id,
        name: competitor.name,
        url: competitor.url,
        domain: competitor.domain,
      },

      crawls: {
        renkoo: {
          id: renkooCrawl.id,
          pages:
            renkooCrawl.pages.length,
          date:
            renkooCrawl.createdAt,
        },

        competitor: {
          id: competitorCrawl.id,
          pages:
            competitorCrawl.pages.length,
          date:
            competitorCrawl.createdAt,
        },
      },

      summary: {
        renkooKeywords:
          renkooMap.size,

        competitorKeywords:
          competitorMap.size,

        missingKeywords:
          missing.length,

        sharedKeywords:
          shared.length,

        renkooOnlyKeywords:
          renkooOnly.length,

        highPriority: high,
        mediumPriority: medium,
        lowPriority: low,
      },

      missingKeywords:
        missing.slice(0, 200),

      sharedKeywords:
        shared.slice(0, 200),

      renkooOnlyKeywords:
        renkooOnly.slice(0, 200),

      topOpportunities:
        missing.slice(0, 20),
    };
  }

  // =========================================================
  // KEYWORD EXTRACTION
  // =========================================================

  private extractKeywordMap(
    pages: any[],
  ) {
    const keywords = new Map<
      string,
      {
        keyword: string;
        pages: number;
        totalWords: number;
        occurrences: number;
        relevanceScore: number;
      }
    >();

    for (const page of pages) {
      const textParts = [
        page.title ?? '',
        page.metaDescription ?? '',
        ...(Array.isArray(page.h1)
          ? page.h1
          : []),
        ...(Array.isArray(page.h2)
          ? page.h2
          : []),
      ];

      const text =
        textParts
          .join(' ')
          .toLowerCase();

      const tokens =
        this.tokenize(text);

      if (tokens.length === 0) {
        continue;
      }

      // -----------------------------------------------------
      // 1-word, 2-word and 3-word phrases
      // -----------------------------------------------------

      const phrases =
        this.buildNgrams(
          tokens,
          3,
        );

      const unique =
        new Set(phrases);

      for (const keyword of unique) {
        if (
          this.isIgnoredKeyword(
            keyword,
          )
        ) {
          continue;
        }

        const occurrences =
          phrases.filter(
            (item) =>
              item === keyword,
          ).length;

        const existing =
          keywords.get(keyword);

        if (existing) {
          existing.pages++;

          existing.totalWords +=
            Number(
              page.wordCount ?? 0,
            );

          existing.occurrences +=
            occurrences;
        } else {
          keywords.set(keyword, {
            keyword,
            pages: 1,

            totalWords:
              Number(
                page.wordCount ?? 0,
              ),

            occurrences,

            relevanceScore: 0,
          });
        }
      }
    }

    for (const item of keywords.values()) {
      item.relevanceScore =
        this.calculateRelevance(
          item.pages,
          item.occurrences,
          item.totalWords,
        );
    }

    return keywords;
  }

  // =========================================================
  // TOKENIZE
  // =========================================================

  private tokenize(
    text: string,
  ): string[] {
    return text
      .replace(
        /[^a-z0-9\s-]/gi,
        ' ',
      )
      .split(/\s+/)
      .map(
        (word) =>
          word
            .trim()
            .toLowerCase(),
      )
      .filter(
        (word) =>
          word.length >= 3 &&
          !this.isStopWord(word),
      );
  }

  // =========================================================
  // N-GRAMS
  // =========================================================

  private buildNgrams(
    tokens: string[],
    maxSize: number,
  ): string[] {
    const result: string[] = [];

    for (
      let i = 0;
      i < tokens.length;
      i++
    ) {
      for (
        let size = 1;
        size <= maxSize;
        size++
      ) {
        if (
          i + size >
          tokens.length
        ) {
          break;
        }

        const phrase =
          tokens
            .slice(
              i,
              i + size,
            )
            .join(' ');

        if (
          phrase.length >= 3
        ) {
          result.push(phrase);
        }
      }
    }

    return result;
  }

  // =========================================================
  // RELEVANCE
  // =========================================================

  private calculateRelevance(
    pages: number,
    occurrences: number,
    totalWords: number,
  ): number {
    const pageScore =
      Math.min(
        50,
        pages * 15,
      );

    const occurrenceScore =
      Math.min(
        35,
        occurrences * 5,
      );

    const contentScore =
      totalWords >= 1000
        ? 15
        : totalWords >= 500
          ? 10
          : totalWords >= 200
            ? 5
            : 0;

    return Math.min(
      100,
      pageScore +
        occurrenceScore +
        contentScore,
    );
  }

  // =========================================================
  // OPPORTUNITY SCORE
  // =========================================================

  private calculateOpportunityScore(
    competitor: {
      pages: number;
      occurrences: number;
      relevanceScore: number;
    },
  ): number {
    const score =
      competitor.relevanceScore +
      Math.min(
        20,
        competitor.pages * 5,
      ) +
      Math.min(
        20,
        competitor.occurrences * 2,
      );

    return Math.min(
      100,
      Math.round(score),
    );
  }

  // =========================================================
  // PRIORITY
  // =========================================================

  private getPriority(
    score: number,
  ): KeywordPriority {
    if (score >= 70) {
      return 'HIGH';
    }

    if (score >= 40) {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  // =========================================================
  // INTENT
  // =========================================================

  private detectIntent(
    keyword: string,
  ): KeywordIntent {
    const value =
      keyword.toLowerCase();

    const transactional = [
      'buy',
      'purchase',
      'order',
      'book',
      'hire',
      'pricing',
      'price',
      'cost',
      'quote',
      'deal',
      'discount',
    ];

    const commercial = [
      'best',
      'top',
      'review',
      'comparison',
      'compare',
      'alternative',
      'vs',
      'software',
      'service',
      'agency',
      'company',
    ];

    const informational = [
      'how',
      'what',
      'why',
      'when',
      'where',
      'guide',
      'tutorial',
      'tips',
      'learn',
      'meaning',
    ];

    if (
      transactional.some(
        (word) =>
          value.includes(word),
      )
    ) {
      return 'TRANSACTIONAL';
    }

    if (
      commercial.some(
        (word) =>
          value.includes(word),
      )
    ) {
      return 'COMMERCIAL';
    }

    if (
      informational.some(
        (word) =>
          value.includes(word),
      )
    ) {
      return 'INFORMATIONAL';
    }

    return 'UNKNOWN';
  }

  // =========================================================
  // SUGGESTION
  // =========================================================

  private buildSuggestion(
    keyword: string,
    competitor: {
      pages: number;
      relevanceScore: number;
    },
  ): string {
    if (
      competitor.pages >= 3
    ) {
      return `Create or optimize multiple relevant pages targeting "${keyword}".`;
    }

    if (
      competitor.relevanceScore >=
      60
    ) {
      return `Create a dedicated high-quality page targeting "${keyword}" and support it with internal links.`;
    }

    return `Evaluate "${keyword}" for search intent and create or optimize a relevant page if it matches the business.`;
  }

  // =========================================================
  // STOP WORDS
  // =========================================================

  private isStopWord(
    word: string,
  ): boolean {
    const stopWords = new Set([
      'the',
      'and',
      'for',
      'with',
      'that',
      'this',
      'from',
      'your',
      'you',
      'are',
      'was',
      'were',
      'have',
      'has',
      'had',
      'will',
      'can',
      'our',
      'their',
      'they',
      'them',
      'about',
      'into',
      'than',
      'then',
      'there',
      'here',
      'what',
      'when',
      'where',
      'which',
      'while',
      'also',
      'more',
      'most',
      'very',
      'just',
      'only',
      'over',
      'under',
      'such',
      'its',
      'not',
      'but',
      'you',
      'your',
    ]);

    return stopWords.has(
      word,
    );
  }

  private isIgnoredKeyword(
    keyword: string,
  ): boolean {
    const words =
      keyword.split(' ');

    if (
      words.length === 1 &&
      this.isStopWord(words[0])
    ) {
      return true;
    }

    return false;
  }
}

/*
 * =========================================================
 * DETERMINISTIC AI RESPONSE ANALYSIS
 *
 * Evidence-backed extraction over real provider
 * responses. No guessing: anything uncertain is
 * UNKNOWN. No network, no LLM, no side effects —
 * pure functions, safe to unit-test.
 * =========================================================
 */

export interface BrandTerm {
  term: string;
}

export interface TrackedCompetitor {
  name: string;
  domains: string[];
}

export interface TermOccurrence {
  term: string;
  count: number;
  contexts: string[];
}

export interface CompetitorMention {
  name: string;
  occurrences: number;
  contexts: string[];
}

export type SentimentLabel =
  | 'POSITIVE'
  | 'NEUTRAL'
  | 'NEGATIVE'
  | 'UNKNOWN';

export type CommercialIntent =
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW'
  | 'UNKNOWN';

export interface AiResponseAnalysis {
  mentioned: boolean;
  brandOccurrences: TermOccurrence[];
  competitorMentions: CompetitorMention[];
  sentiment: SentimentLabel;
  commercialIntent: CommercialIntent;
  recommendationContext: boolean;
  evidenceNote: string;
}

function escapeRegExp(value: string): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
}

function findOccurrences(
  text: string,
  term: string,
  maxContexts = 3,
): TermOccurrence | null {
  const clean = term.trim();

  if (!clean) {
    return null;
  }

  const pattern = new RegExp(
    `\\b${escapeRegExp(clean)}\\b`,
    'gi',
  );

  const matches = text.match(pattern);
  const count = matches?.length ?? 0;

  if (count === 0) {
    return null;
  }

  const contexts: string[] = [];
  const windowSize = 90;
  let searchFrom = 0;
  const lowerText = text.toLowerCase();
  const lowerTerm = clean.toLowerCase();

  while (
    contexts.length < maxContexts &&
    searchFrom < text.length
  ) {
    const index = lowerText.indexOf(
      lowerTerm,
      searchFrom,
    );

    if (index === -1) {
      break;
    }

    const start = Math.max(
      0,
      index - windowSize,
    );
    const end = Math.min(
      text.length,
      index +
        clean.length +
        windowSize,
    );

    contexts.push(
      `${start > 0 ? '…' : ''}${text
        .slice(start, end)
        .replace(/\s+/g, ' ')
        .trim()}${end < text.length ? '…' : ''}`,
    );

    searchFrom = index + clean.length;
  }

  return { term: clean, count, contexts };
}

const POSITIVE_HINTS = [
  'excellent',
  'outstanding',
  'best-in-class',
  'top-rated',
  'highly recommend',
  'strongly recommend',
  'exceptional',
  'industry-leading',
  'impressive',
];

const NEGATIVE_HINTS = [
  'poor',
  'terrible',
  'awful',
  'avoid',
  'worst',
  'disappointing',
  'not recommend',
  'unreliable',
  'overpriced',
  'complaint',
];

const RECOMMENDATION_HINTS = [
  'recommend',
  'top pick',
  'best choice',
  'consider',
  'worth trying',
  'go with',
  'choose',
];

const COMMERCIAL_HIGH_HINTS = [
  'price',
  'pricing',
  'cost',
  'buy',
  'purchase',
  'subscribe',
  'plan',
  'quote',
  'demo',
  'trial',
  'discount',
];

const COMMERCIAL_MEDIUM_HINTS = [
  'compare',
  'comparison',
  'vs',
  'versus',
  'alternative',
  'review',
  'best',
  'top',
];

function countHints(
  text: string,
  hints: string[],
): number {
  const lower = text.toLowerCase();
  let hits = 0;

  for (const hint of hints) {
    if (lower.includes(hint)) {
      hits += 1;
    }
  }

  return hits;
}

export function analyzeAiResponse(params: {
  text: string;
  brandTerms: string[];
  competitors: TrackedCompetitor[];
}): AiResponseAnalysis {
  const text = params.text ?? '';

  const brandOccurrences: TermOccurrence[] =
    [];

  for (const raw of params.brandTerms) {
    const found = findOccurrences(
      text,
      raw,
    );

    if (found) {
      brandOccurrences.push(found);
    }
  }

  const competitorMentions: CompetitorMention[] =
    [];

  for (const competitor of params.competitors) {
    const nameHit = findOccurrences(
      text,
      competitor.name,
    );

    let occurrences = nameHit?.count ?? 0;
    const contexts = [
      ...(nameHit?.contexts ?? []),
    ];

    for (const domain of competitor.domains) {
      const domainHit = findOccurrences(
        text,
        domain,
      );

      if (domainHit) {
        occurrences += domainHit.count;

        for (const context of domainHit.contexts) {
          if (
            contexts.length < 3 &&
            !contexts.includes(context)
          ) {
            contexts.push(context);
          }
        }
      }
    }

    if (occurrences > 0) {
      competitorMentions.push({
        name: competitor.name,
        occurrences,
        contexts,
      });
    }
  }

  const mentioned = brandOccurrences.some(
    (occurrence) => occurrence.count > 0,
  );

  const positive = countHints(
    text,
    POSITIVE_HINTS,
  );
  const negative = countHints(
    text,
    NEGATIVE_HINTS,
  );

  let sentiment: SentimentLabel = 'UNKNOWN';

  if (mentioned) {
    if (positive >= 2 && negative === 0) {
      sentiment = 'POSITIVE';
    } else if (
      negative >= 2 &&
      positive === 0
    ) {
      sentiment = 'NEGATIVE';
    } else if (
      positive === 0 &&
      negative === 0 &&
      text.length > 0
    ) {
      sentiment = 'NEUTRAL';
    }
  }

  const lowerPrompt = text.toLowerCase();
  const high = COMMERCIAL_HIGH_HINTS.some(
    (hint) => lowerPrompt.includes(hint),
  );
  const medium = COMMERCIAL_MEDIUM_HINTS.some(
    (hint) => lowerPrompt.includes(hint),
  );

  const commercialIntent: CommercialIntent =
    high
      ? 'HIGH'
      : medium
        ? 'MEDIUM'
        : text.length > 0
          ? 'LOW'
          : 'UNKNOWN';

  const recommendationContext =
    RECOMMENDATION_HINTS.some((hint) =>
      lowerPrompt.includes(hint),
    );

  const evidenceNote = mentioned
    ? `Brand matched ${brandOccurrences.reduce((total, item) => total + item.count, 0)} time(s) across ${brandOccurrences.length} term(s) in a recorded provider response.`
    : 'No brand term matched in the recorded provider response.';

  return {
    mentioned,
    brandOccurrences,
    competitorMentions,
    sentiment,
    commercialIntent,
    recommendationContext,
    evidenceNote,
  };
}

/*
 * Citation domain classification. Classifies the
 * URL that was actually returned — never source
 * quality.
 */
export type CitationDomainClass =
  | 'OWN_DOMAIN'
  | 'COMPETITOR_DOMAIN'
  | 'THIRD_PARTY'
  | 'COMMUNITY'
  | 'NEWS'
  | 'SOCIAL'
  | 'OTHER';

const COMMUNITY_SUFFIXES = [
  'reddit.com',
  'quora.com',
  'stackoverflow.com',
  'stackexchange.com',
  'medium.com',
];

const NEWS_SUFFIXES = [
  'bbc.',
  'cnn.',
  'nytimes.',
  'theguardian.',
  'reuters.',
  'forbes.',
  'techcrunch.',
  'theverge.',
  'wired.',
];

const SOCIAL_SUFFIXES = [
  'x.com',
  'twitter.com',
  'facebook.com',
  'linkedin.com',
  'instagram.com',
  'youtube.com',
  'tiktok.com',
];

function domainMatches(
  host: string,
  suffix: string,
): boolean {
  const cleanHost = host
    .toLowerCase()
    .replace(/^www\./, '');
  const cleanSuffix = suffix.toLowerCase();

  return (
    cleanHost === cleanSuffix ||
    cleanHost.endsWith(`.${cleanSuffix}`)
  );
}

export function classifyCitationDomain(params: {
  url: string;
  ownDomains: string[];
  competitorDomains: string[];
}): {
  domain: string;
  class: CitationDomainClass;
} {
  let host = '';

  try {
    host = new URL(params.url).hostname;
  } catch {
    return { domain: '', class: 'OTHER' };
  }

  for (const own of params.ownDomains) {
    if (own && domainMatches(host, own)) {
      return { domain: host, class: 'OWN_DOMAIN' };
    }
  }

  for (const competitor of params.competitorDomains) {
    if (
      competitor &&
      domainMatches(host, competitor)
    ) {
      return {
        domain: host,
        class: 'COMPETITOR_DOMAIN',
      };
    }
  }

  for (const suffix of COMMUNITY_SUFFIXES) {
    if (domainMatches(host, suffix)) {
      return { domain: host, class: 'COMMUNITY' };
    }
  }

  for (const suffix of NEWS_SUFFIXES) {
    if (domainMatches(host, suffix)) {
      return { domain: host, class: 'NEWS' };
    }
  }

  for (const suffix of SOCIAL_SUFFIXES) {
    if (domainMatches(host, suffix)) {
      return { domain: host, class: 'SOCIAL' };
    }
  }

  return { domain: host, class: 'THIRD_PARTY' };
}

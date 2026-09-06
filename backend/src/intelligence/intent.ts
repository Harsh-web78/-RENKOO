/*
 * =========================================================
 * DETERMINISTIC INTENT ROUTING
 *
 * Keyword-based classification. No LLM is required and
 * none is used. Rules are ordered by specificity; the
 * first rule with the most keyword hits wins.
 * =========================================================
 */

export type IntelligenceIntent =
  | 'WHAT_CHANGED'
  | 'WHY_TRAFFIC'
  | 'TRAFFIC'
  | 'WHAT_FIX_FIRST'
  | 'TOP_OPPORTUNITIES'
  | 'OPEN_ACTIONS'
  | 'COMPETITOR_AHEAD'
  | 'AI_VISIBILITY'
  | 'SEO_HEALTH'
  | 'LEADS_REVENUE'
  | 'MONITORING'
  | 'CONTENT'
  | 'BACKLINKS'
  | 'LOCAL_SEO'
  | 'GROWTH_BLOCKERS'
  | 'BUSINESS_OVERVIEW'
  | 'GENERAL';

const RULES: Array<{
  intent: IntelligenceIntent;
  keywords: string[];
}> = [
  {
    intent: 'OPEN_ACTIONS',
    keywords: [
      'open action',
      'actions still open',
      'actions are',
      'still open',
      'my actions',
      'in progress',
      'to do',
      'todo',
      'action status',
    ],
  },
  {
    intent: 'WHAT_FIX_FIRST',
    keywords: [
      'fix first',
      'what should i fix',
      'where do i start',
      'most important',
      'highest priority',
      'priorit',
      'what should i do',
      'next step',
    ],
  },
  {
    intent: 'WHY_TRAFFIC',
    keywords: [
      'traffic drop',
      'traffic fell',
      'why did traffic',
      'traffic down',
      'lost traffic',
      'sessions drop',
      'traffic lost',
    ],
  },
  {
    intent: 'WHAT_CHANGED',
    keywords: [
      'what changed',
      'what has changed',
      'recent change',
      'any changes',
    ],
  },
  {
    intent: 'COMPETITOR_AHEAD',
    keywords: [
      'competitor',
      'beating me',
      'ahead of',
      'competition',
      'rival',
      'who beats',
      'losing to',
    ],
  },
  {
    intent: 'AI_VISIBILITY',
    keywords: [
      'ai visibility',
      'ai search',
      'chatgpt',
      'gemini',
      'openai',
      'perplexity',
      'claude',
      'copilot',
      'ai overview',
      'answer engine',
      'generative',
      'cited',
      'citation',
      'mention',
      'ai mode',
      'which prompts',
      'prompts',
      'losing',
      'visibility',
      'strongest competitor',
      'which sources',
      'sources being cited',
      'biggest gap',
      'provider shows',
      'did ai visibility improve',
      'which prompts should we fix',
    ],
  },
  {
    intent: 'LEADS_REVENUE',
    keywords: [
      'lead',
      'revenue',
      'roi',
      'conversion',
      'pipeline',
      'sales',
      'attribution',
    ],
  },
  {
    intent: 'MONITORING',
    keywords: [
      'alert',
      'monitoring',
      'watch',
      'notified',
    ],
  },
  {
    intent: 'BACKLINKS',
    keywords: [
      'backlink',
      'backlinks',
      'referring domain',
      'referring domains',
      'link building',
      'lost links',
      'new links',
      'link coverage',
      'link gap',
      'domain authority',
      'which links',
      'link support',
    ],
  },
  {
    intent: 'CONTENT',
    keywords: [
      'content',
      'blog',
      'article',
      'brief',
      'draft',
      'refresh',
      'what should we create',
      'what to write',
      'content gap',
      'pages need',
      'high impressions but low ctr',
      'high impressions',
      'low ctr',
      'striking distance',
    ],
  },
  {
    intent: 'LOCAL_SEO',
    keywords: [
      'local seo',
      'local search',
      'locations',
      'local ranking',
      'local visibility',
      'near me',
      'gbp',
      'business profile',
      'local competitor',
      'local queries',
      'which location',
      'locations are we tracking',
      'local data',
    ],
  },
  {
    intent: 'SEO_HEALTH',
    keywords: [
      'seo health',
      'seo score',
      'technical seo',
      'crawl',
      'site health',
      'site audit',
      'issues',
      'errors',
    ],
  },
  {
    intent: 'TRAFFIC',
    keywords: [
      'traffic',
      'sessions',
      'visitors',
      'clicks',
      'impressions',
      'ctr',
      'ga4',
      'search console',
    ],
  },
  {
    intent: 'GROWTH_BLOCKERS',
    keywords: [
      'hurting growth',
      'blocking growth',
      'losing visibility',
      'problem',
      'wrong',
      'why is',
      'growth',
    ],
  },
  {
    intent: 'TOP_OPPORTUNITIES',
    keywords: [
      'opportunit',
      'top ',
      'best chance',
      'quick win',
    ],
  },
  {
    intent: 'BUSINESS_OVERVIEW',
    keywords: [
      'business',
      'overview',
      'about the',
      'what do we',
      'who are',
      'summary',
      'context',
    ],
  },
];

export function routeIntent(
  question: string,
): {
  intent: IntelligenceIntent;
  matchedKeywords: string[];
} {
  const text = question
    .toLowerCase()
    .trim();

  let best: {
    intent: IntelligenceIntent;
    matchedKeywords: string[];
  } | null = null;

  for (const rule of RULES) {
    const matched =
      rule.keywords.filter(
        (keyword) =>
          keyword.trim() &&
          text.includes(keyword),
      );

    if (
      matched.length > 0 &&
      (!best ||
        matched.length >
          best.matchedKeywords
            .length)
    ) {
      best = {
        intent: rule.intent,
        matchedKeywords: matched,
      };
    }
  }

  return (
    best ?? {
      intent: 'GENERAL',
      matchedKeywords: [],
    }
  );
}

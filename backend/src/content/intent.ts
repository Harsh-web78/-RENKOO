/*
 * =========================================================
 * DETERMINISTIC SEARCH INTENT CLASSIFICATION
 *
 * Keyword/signal-based, multi-label. Uses Business
 * Brain locations only when provided — never
 * hardcoded business examples. Pure functions.
 * =========================================================
 */

export type SearchIntent =
  | 'INFORMATIONAL'
  | 'COMMERCIAL'
  | 'TRANSACTIONAL'
  | 'NAVIGATIONAL'
  | 'LOCAL'
  | 'COMPARISON'
  | 'ALTERNATIVES'
  | 'PROBLEM_SOLUTION'
  | 'BUYER_RESEARCH';

const RULES: Array<{
  intent: SearchIntent;
  hints: string[];
}> = [
  {
    intent: 'TRANSACTIONAL',
    hints: [
      'buy',
      'purchase',
      'order',
      'checkout',
      'pricing',
      'price',
      'cost',
      'subscribe',
      'sign up',
      'signup',
      'book now',
      'get a quote',
    ],
  },
  {
    intent: 'COMPARISON',
    hints: [
      ' vs ',
      ' vs',
      'versus',
      'compared',
      'comparison',
      'difference between',
    ],
  },
  {
    intent: 'ALTERNATIVES',
    hints: [
      'alternative',
      'instead of',
      'replace',
      'switch from',
    ],
  },
  {
    intent: 'PROBLEM_SOLUTION',
    hints: [
      'how to fix',
      'how to solve',
      'problem',
      'error',
      'not working',
      'troubleshoot',
      'why is',
      'how do i',
    ],
  },
  {
    intent: 'BUYER_RESEARCH',
    hints: [
      'best',
      'top ',
      'top-',
      'review',
      'reviews',
      'worth it',
      'should i',
      'which one',
      'recommend',
    ],
  },
  {
    intent: 'COMMERCIAL',
    hints: [
      'service',
      'agency',
      'company',
      'provider',
      'hire',
      'near me',
      'demo',
      'trial',
      'quote',
    ],
  },
  {
    intent: 'NAVIGATIONAL',
    hints: [
      'login',
      'sign in',
      'official site',
      'homepage',
    ],
  },
  {
    intent: 'INFORMATIONAL',
    hints: [
      'what is',
      'what are',
      'how to',
      'guide',
      'tutorial',
      'meaning',
      'explained',
      'tips',
      'ideas',
      'examples',
    ],
  },
];

/*
 * Generic local markers only — real place names
 * come from Business Brain locations, never from
 * a hardcoded city list.
 */
const LOCAL_HINTS = [
  'near me',
  'nearby',
  'close by',
  'around me',
  'in my area',
  'local ',
  ' local',
];

export function classifyIntent(
  query: string,
  options?: {
    locations?: string[];
  },
): {
  primary: SearchIntent;
  all: SearchIntent[];
} {
  const text = ` ${query
    .toLowerCase()
    .trim()} `;

  const matched = new Set<SearchIntent>();

  for (const rule of RULES) {
    for (const hint of rule.hints) {
      if (text.includes(hint)) {
        matched.add(rule.intent);
        break;
      }
    }
  }

  const locationNames = (
    options?.locations ?? []
  )
    .map((location) =>
      location.toLowerCase().trim(),
    )
    .filter(Boolean);

  const localHit =
    LOCAL_HINTS.some((hint) =>
      text.includes(hint),
    ) ||
    locationNames.some(
      (name) =>
        name.length > 2 &&
        text.includes(name),
    );

  if (localHit) {
    matched.add('LOCAL');
  }

  if (matched.size === 0) {
    matched.add('INFORMATIONAL');
  }

  const order: SearchIntent[] = [
    'TRANSACTIONAL',
    'COMMERCIAL',
    'LOCAL',
    'COMPARISON',
    'ALTERNATIVES',
    'BUYER_RESEARCH',
    'PROBLEM_SOLUTION',
    'NAVIGATIONAL',
    'INFORMATIONAL',
  ];

  const all = order.filter((intent) =>
    matched.has(intent),
  );

  return {
    primary: all[0],
    all,
  };
}

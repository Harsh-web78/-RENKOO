/*
 * =========================================================
 * SERP ANALYSIS — pure functions, zero dependencies.
 *
 * Everything here is deterministic and unit-testable:
 * URL normalization, Jaccard similarity, page-strength
 * classification, SERP competition aggregates, intent
 * validation, content-type classification and SERP-feature
 * opportunities. No network, no secrets, no invented data —
 * every input is either provider-observed or explicitly
 * labeled RENKOO classification.
 * =========================================================
 */

export type PageStrength =
  | 'Strong'
  | 'Medium'
  | 'Weak'
  | 'Unknown';

export type SerpVerdict =
  | 'OPPORTUNITY'
  | 'MODERATE'
  | 'HARD'
  | 'UNKNOWN';

export type ContentType =
  | 'Blog/article'
  | 'Product'
  | 'Service'
  | 'Category'
  | 'Comparison'
  | 'Homepage'
  | 'Forum'
  | 'Video'
  | 'Local business'
  | 'Documentation'
  | 'Other';

export interface StrengthInput {
  pageRank: number | null;
  domainRank: number | null;
  backlinks: number | null;
  referringDomains: number | null;
  domainTraffic: number | null;
}

export interface StrengthResult {
  strength: PageStrength;
  /* Short machine-readable evidence codes, e.g.
     'pageRank:820', 'no-data'. */
  evidence: string[];
}

/*
 * Page-strength rule (documented, fixed):
 *  - Strong: pageRank >= 500 OR domainRank >= 600 OR
 *    referringDomains >= 500 OR domainTraffic >= 100k
 *  - Weak: all available signals low — every present
 *    metric below its weak ceiling (pageRank < 150,
 *    domainRank < 200, referringDomains < 25,
 *    domainTraffic < 5k) AND at least one signal present.
 *    A result with zero signals is Unknown, never Weak.
 *  - Medium: anything in between.
 * Thresholds are intentionally conservative: calling a
 * page Weak requires positive evidence of weakness.
 */
const WEAK_CEIL = {
  pageRank: 150,
  domainRank: 200,
  referringDomains: 25,
  domainTraffic: 5000,
};

export function classifyPageStrength(
  input: StrengthInput,
): StrengthResult {
  const {
    pageRank,
    domainRank,
    backlinks,
    referringDomains,
    domainTraffic,
  } = input;
  const evidence: string[] = [];

  const has = (v: number | null): v is number =>
    typeof v === 'number' && Number.isFinite(v);

  if (has(pageRank))
    evidence.push(`pageRank:${Math.round(pageRank)}`);
  if (has(domainRank))
    evidence.push(
      `domainRank:${Math.round(domainRank)}`,
    );
  if (has(backlinks))
    evidence.push(`backlinks:${Math.round(backlinks)}`);
  if (has(referringDomains))
    evidence.push(
      `referringDomains:${Math.round(referringDomains)}`,
    );
  if (has(domainTraffic))
    evidence.push(
      `domainTraffic:${Math.round(domainTraffic)}`,
    );

  if (
    (has(pageRank) && pageRank >= 500) ||
    (has(domainRank) && domainRank >= 600) ||
    (has(referringDomains) &&
      referringDomains >= 500) ||
    (has(domainTraffic) &&
      domainTraffic >= 100000)
  ) {
    return { strength: 'Strong', evidence };
  }

  const present =
    has(pageRank) ||
    has(domainRank) ||
    has(referringDomains) ||
    has(domainTraffic) ||
    has(backlinks);

  if (!present) {
    return { strength: 'Unknown', evidence };
  }

  const allWeak =
    (!has(pageRank) ||
      pageRank < WEAK_CEIL.pageRank) &&
    (!has(domainRank) ||
      domainRank < WEAK_CEIL.domainRank) &&
    (!has(referringDomains) ||
      referringDomains <
        WEAK_CEIL.referringDomains) &&
    (!has(domainTraffic) ||
      domainTraffic < WEAK_CEIL.domainTraffic);

  if (allWeak) {
    return { strength: 'Weak', evidence };
  }
  return { strength: 'Medium', evidence };
}

/*
 * Normalize a ranking URL for overlap comparison:
 * lowercase host, strip www., drop protocol, trailing
 * slash, fragment, and common tracking parameters.
 */
const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'msclkid',
  '_ga',
]);

export function normalizeSerpUrl(
  raw: string,
): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(
      /^https?:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`,
    );
    const host = url.hostname
      .toLowerCase()
      .replace(/^www\./, '');
    for (const key of [
      ...url.searchParams.keys(),
    ]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    const path = url.pathname.replace(
      /\/+$/,
      '',
    );
    return `${host}${path}${url.search}`.toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}

/*
 * Jaccard similarity over normalized URL sets:
 * |A ∩ B| / |A ∪ B|. Empty-vs-empty is 0 (no evidence
 * of sameness), never 1.
 */
export function jaccardSimilarity(
  a: string[],
  b: string[],
): number {
  const setA = new Set(
    a.map(normalizeSerpUrl).filter(Boolean),
  );
  const setB = new Set(
    b.map(normalizeSerpUrl).filter(Boolean),
  );
  if (
    setA.size === 0 ||
    setB.size === 0
  ) {
    return 0;
  }
  let intersection = 0;
  for (const url of setA) {
    if (setB.has(url)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0
    ? 0
    : Math.round((intersection / union) * 100) /
        100;
}

export interface CompetitionInput {
  strength: PageStrength;
  domainRank: number | null;
  pageRank: number | null;
  referringDomains: number | null;
  backlinks: number | null;
}

export interface CompetitionResult {
  verdict: SerpVerdict;
  totalResults: number;
  strongCount: number;
  weakCount: number;
  unknownCount: number;
  medianDomainRank: number | null;
  medianPageRank: number | null;
  medianReferringDomains: number | null;
  medianBacklinks: number | null;
  /* Human-readable evidence strings, each citing data. */
  evidence: string[];
}

function median(
  values: Array<number | null>,
): number | null {
  const nums = values.filter(
    (v): v is number =>
      typeof v === 'number' && Number.isFinite(v),
  );
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/*
 * SERP competition rule (documented, fixed):
 *  - HARD: >= 60% of analyzed results are Strong, OR
 *    median domainRank >= 500 with >= 5 results.
 *  - OPPORTUNITY: >= 30% of analyzed results are Weak
 *    (and at least 2 weak results).
 *  - UNKNOWN: no strength evidence at all.
 *  - MODERATE: everything else.
 */
export function analyzeSerpCompetition(
  results: CompetitionInput[],
): CompetitionResult {
  const total = results.length;
  const strongCount = results.filter(
    (r) => r.strength === 'Strong',
  ).length;
  const weakCount = results.filter(
    (r) => r.strength === 'Weak',
  ).length;
  const unknownCount = results.filter(
    (r) => r.strength === 'Unknown',
  ).length;

  const medianDomainRank = median(
    results.map((r) => r.domainRank),
  );
  const medianPageRank = median(
    results.map((r) => r.pageRank),
  );
  const medianReferringDomains = median(
    results.map((r) => r.referringDomains),
  );
  const medianBacklinks = median(
    results.map((r) => r.backlinks),
  );

  const evidence: string[] = [];
  if (total > 0) {
    evidence.push(
      `${strongCount}/${total} top results have strong page strength.`,
    );
    evidence.push(
      `${weakCount}/${total} top results show authority weakness.`,
    );
  }
  if (medianDomainRank !== null) {
    evidence.push(
      `Median Domain Rank across analyzed results: ${medianDomainRank}.`,
    );
  }
  if (medianPageRank !== null) {
    evidence.push(
      `Median Page Rank across analyzed results: ${medianPageRank}.`,
    );
  }
  if (medianReferringDomains !== null) {
    evidence.push(
      `Median referring domains: ${medianReferringDomains}.`,
    );
  }

  let verdict: SerpVerdict = 'MODERATE';
  if (total === 0 || unknownCount === total) {
    verdict = 'UNKNOWN';
    evidence.push(
      'No authority signals available for this SERP — difficulty cannot be judged from strength data.',
    );
  } else if (
    strongCount / total >= 0.6 ||
    (total >= 5 &&
      medianDomainRank !== null &&
      medianDomainRank >= 500)
  ) {
    verdict = 'HARD';
    evidence.push(
      'This SERP is difficult: most top results carry strong domain/page authority.',
    );
  } else if (
    weakCount >= 2 &&
    weakCount / total >= 0.3
  ) {
    verdict = 'OPPORTUNITY';
    evidence.push(
      'This SERP has room: several top results show authority weakness a focused page can beat.',
    );
  } else {
    evidence.push(
      'This SERP is mixed: neither dominated by authorities nor full of weak results.',
    );
  }

  return {
    verdict,
    totalResults: total,
    strongCount,
    weakCount,
    unknownCount,
    medianDomainRank,
    medianPageRank,
    medianReferringDomains,
    medianBacklinks,
    evidence,
  };
}

/*
 * Intent compatibility for split/merge decisions.
 * Commercial-family intents cluster together;
 * informational-family intents cluster together.
 * Crossing the family boundary means separate pages.
 */
const COMMERCIAL_FAMILY = new Set([
  'COMMERCIAL',
  'TRANSACTIONAL',
  'COMPARISON',
  'ALTERNATIVES',
  'BUYER_RESEARCH',
]);

const INFORMATIONAL_FAMILY = new Set([
  'INFORMATIONAL',
  'PROBLEM_SOLUTION',
]);

export function intentFamily(
  intent: string,
): 'commercial' | 'informational' | 'other' {
  const upper = intent.toUpperCase();
  if (COMMERCIAL_FAMILY.has(upper))
    return 'commercial';
  if (INFORMATIONAL_FAMILY.has(upper))
    return 'informational';
  return 'other';
}

export function intentsCompatible(
  a: string,
  b: string,
): boolean {
  const fa = intentFamily(a);
  const fb = intentFamily(b);
  if (fa === 'other' || fb === 'other') return true;
  return fa === fb;
}

export type IntentCheck =
  | 'MATCH'
  | 'MIXED'
  | 'MISMATCH'
  | 'UNKNOWN';

/*
 * Compare RENKOO-classified keyword intent against the
 * observed content types of ranking pages. Mapping:
 * commercial-family keyword intent matches commercial
 * page types (Product/Service/Comparison/Category);
 * informational-family matches Blog/Documentation/Video.
 */
const COMMERCIAL_TYPES = new Set<ContentType>([
  'Product',
  'Service',
  'Comparison',
  'Category',
  'Local business',
]);

const INFORMATIONAL_TYPES = new Set<ContentType>([
  'Blog/article',
  'Documentation',
  'Video',
]);

export function validateSerpIntent(
  keywordIntent: string,
  pageTypes: ContentType[],
): {
  check: IntentCheck;
  detail: string;
} {
  if (pageTypes.length === 0) {
    return {
      check: 'UNKNOWN',
      detail:
        'No ranking-page content types observed — intent cannot be validated.',
    };
  }
  const family = intentFamily(keywordIntent);
  if (family === 'other') {
    return {
      check: 'UNKNOWN',
      detail: `Keyword intent ${keywordIntent} has no SERP comparand — validation skipped.`,
    };
  }
  const expected =
    family === 'commercial'
      ? COMMERCIAL_TYPES
      : INFORMATIONAL_TYPES;
  const matching = pageTypes.filter((t) =>
    expected.has(t),
  ).length;
  const ratio = matching / pageTypes.length;
  if (ratio >= 0.6) {
    return {
      check: 'MATCH',
      detail: `${matching}/${pageTypes.length} ranking pages match the ${family} intent of this keyword.`,
    };
  }
  if (ratio >= 0.35) {
    return {
      check: 'MIXED',
      detail: `Only ${matching}/${pageTypes.length} ranking pages match the ${family} intent — the SERP serves mixed intent.`,
    };
  }
  return {
    check: 'MISMATCH',
    detail: `Only ${matching}/${pageTypes.length} ranking pages match the ${family} intent — this page angle may miss what Google rewards.`,
  };
}

/*
 * RENKOO content-type classification from URL + title
 * signals. Rule-based and labeled as such — never a
 * claim about actual page content.
 */
export function classifyContentType(
  url: string,
  title: string | null,
): ContentType {
  const u = url.toLowerCase();
  const t = (title ?? '').toLowerCase();

  if (
    /(^|\/)blog(\/|$)/.test(u) ||
    /\/(guides?|articles?|insights?|resources?|learn)\//.test(
      u,
    ) ||
    /\b(guide|how to|tutorial|tips|explained)\b/.test(
      t,
    )
  ) {
    return 'Blog/article';
  }
  if (
    /\/(vs|versus|compare|comparison|alternatives|best-|top-|review)/.test(
      u,
    ) ||
    /\b(vs\.?|versus|comparison|alternative|review)\b/.test(
      t,
    )
  ) {
    return 'Comparison';
  }
  if (
    /\/(pricing|plans|buy|checkout|signup|sign-up|demo|trial|product)\//.test(
      u,
    ) ||
    /\b(pricing|buy now|free trial|get started)\b/.test(
      t,
    )
  ) {
    return 'Product';
  }
  if (
    /\/(services?|solutions?|agency|hire)\//.test(u)
  ) {
    return 'Service';
  }
  if (
    /\/(category|categories|collections?|shop|store|catalog)\//.test(
      u,
    )
  ) {
    return 'Category';
  }
  if (
    u === '' ||
    /^https?:\/\/[^/]+\/?$/.test(
      u || `https://${url}`,
    )
  ) {
    return 'Homepage';
  }
  if (
    /(reddit\.com|quora\.com|stackoverflow\.com|stackexchange\.com|\/forum|\/community|\/threads?)/.test(
      u,
    )
  ) {
    return 'Forum';
  }
  if (
    /(youtube\.com|vimeo\.com|\/video|\/watch)/.test(
      u,
    )
  ) {
    return 'Video';
  }
  if (
    /\/(locations?|near-|contact|find-us)\//.test(u)
  ) {
    return 'Local business';
  }
  if (
    /\/(docs|documentation|api|reference|help|support)\//.test(
      u,
    )
  ) {
    return 'Documentation';
  }
  return 'Other';
}

/*
 * SERP-feature opportunities: only features actually
 * present in this SERP. Each carries a generic, honest
 * framing — presence means the format is winnable here,
 * not a promise of winning it.
 */
const FEATURE_FRAMING: Record<string, string> = {
  featured_snippet:
    'A featured snippet exists — a concise definitional answer block can compete for it.',
  people_also_ask:
    'People Also Ask is present — answer these questions in dedicated sections.',
  video:
    'Video results rank — embedded video strengthens this page.',
  images:
    'An image pack ranks — original visuals with descriptive alt text apply.',
  local_pack:
    'A local pack is present — location relevance matters for this query.',
  top_stories:
    'Top stories rank — freshness and news-worthy angles matter.',
  shopping:
    'Shopping results are present — product-level detail and pricing help.',
  knowledge_graph:
    'A knowledge panel exists — entity clarity and structured data help.',
  ai_overview:
    'An AI Overview is present — well-structured, citable sections improve citation odds.',
};

export function serpFeatureOpportunities(
  featureTypes: string[],
): Array<{
  type: string;
  opportunity: string;
}> {
  const seen = new Set<string>();
  const out: Array<{
    type: string;
    opportunity: string;
  }> = [];
  for (const raw of featureTypes) {
    const type = raw.toLowerCase();
    if (seen.has(type)) continue;
    seen.add(type);
    out.push({
      type: raw,
      opportunity:
        FEATURE_FRAMING[type] ??
        `The “${raw}” element is present — matching that format is applicable here.`,
    });
  }
  return out;
}

/* AI Overview / AI Mode element types, passed through
   from provider data — never synthesized. */
const AI_TYPES = new Set([
  'ai_overview',
  'ai_mode',
  'generative_text',
]);

export function isAiElement(
  type: string,
): boolean {
  return AI_TYPES.has(type.toLowerCase());
}

/* Union-find for SERP-similarity clustering. */
export function clusterByOverlap(
  members: string[][],
  threshold: number,
): number[][] {
  const n = members.length;
  const parent = members.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (
        jaccardSimilarity(
          members[i],
          members[j],
        ) >= threshold
      ) {
        union(i, j);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(i);
    groups.set(root, list);
  }
  return [...groups.values()];
}

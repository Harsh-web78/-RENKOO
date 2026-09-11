/*
 * =========================================================
 * QUERY FAN-OUT + TOPIC OWNERSHIP 1.0 — pure functions
 * (Phase 12).
 *
 * Deterministic composition over EXISTING evidence only:
 * GSC queries, keyword universe / strategy clusters,
 * SERP observations, rank observations, AI prompt
 * history + mention/citation checks, content links,
 * competitor rows, Business Brain entities.
 *
 * Rules:
 * - Fan-out needs come ONLY from observed queries.
 *   Never invent sub-questions to fill the UI.
 * - Fan-out types map to the EXISTING ResearchIntent
 *   taxonomy (keyword-research.service detectIntent).
 * - Ownership states are qualitative and deterministic:
 *   STRONG / PARTIAL / WEAK / INSUFFICIENT_EVIDENCE.
 *   Never a fake "Topic Authority %" score.
 * - Google/AI combinations are descriptive, never
 *   causal. Movement is observed outcome, never proof.
 * - Gap kinds reuse existing content-action vocabulary:
 *   CREATE / IMPROVE / CONSOLIDATE / OPTIMIZE / MONITOR.
 * =========================================================
 */

export type FanoutNeed =
  | 'DISCOVER'
  | 'WHAT'
  | 'WHY'
  | 'HOW'
  | 'COMPARE'
  | 'ALTERNATIVES'
  | 'PRICING'
  | 'BEST'
  | 'REVIEWS'
  | 'USE_CASE'
  | 'PROBLEM'
  | 'IMPLEMENTATION'
  | 'COMPATIBILITY'
  | 'INTEGRATION'
  | 'TRUST'
  | 'LOCAL'
  | 'TRANSACTIONAL';

export const FANOUT_NEEDS: readonly FanoutNeed[] = [
  'DISCOVER',
  'WHAT',
  'WHY',
  'HOW',
  'COMPARE',
  'ALTERNATIVES',
  'PRICING',
  'BEST',
  'REVIEWS',
  'USE_CASE',
  'PROBLEM',
  'IMPLEMENTATION',
  'COMPATIBILITY',
  'INTEGRATION',
  'TRUST',
  'LOCAL',
  'TRANSACTIONAL',
];

/* Existing ResearchIntent taxonomy (detectIntent).
 * Fan-out types map INTO it — never the reverse. */
export type FanoutIntent =
  | 'INFORMATIONAL'
  | 'COMMERCIAL'
  | 'TRANSACTIONAL'
  | 'NAVIGATIONAL'
  | 'LOCAL'
  | 'COMPARISON'
  | 'ALTERNATIVES'
  | 'PROBLEM_SOLUTION'
  | 'BUYER_RESEARCH';

export function mapFanoutToIntent(
  need: FanoutNeed,
): FanoutIntent {
  switch (need) {
    case 'COMPARE':
      return 'COMPARISON';
    case 'ALTERNATIVES':
      return 'ALTERNATIVES';
    case 'PROBLEM':
      return 'PROBLEM_SOLUTION';
    case 'PRICING':
    case 'USE_CASE':
      return 'COMMERCIAL';
    case 'BEST':
    case 'REVIEWS':
    case 'TRUST':
      return 'BUYER_RESEARCH';
    case 'LOCAL':
      return 'LOCAL';
    case 'TRANSACTIONAL':
      return 'TRANSACTIONAL';
    case 'WHAT':
    case 'WHY':
    case 'HOW':
    case 'IMPLEMENTATION':
    case 'COMPATIBILITY':
    case 'INTEGRATION':
    case 'DISCOVER':
    default:
      return 'INFORMATIONAL';
  }
}

/* Substring hints per need. Matched against padded
 * lowercase queries (same technique as detectIntent)
 * so "pricing" does not match "surprising". */
const FANOUT_HINTS: Record<FanoutNeed, string[]> = {
  WHAT: [' what ', ' mean ', ' definition ', ' explained '],
  WHY: [' why ', ' reason ', ' cause '],
  HOW: [' how ', ' guide ', ' tutorial ', ' steps ', ' setup '],
  COMPARE: [
    ' vs ',
    ' vs',
    'versus',
    'compared',
    'comparison',
    'difference between',
  ],
  ALTERNATIVES: [
    'alternative',
    'instead of',
    'replace',
    'switch from',
  ],
  PRICING: [
    'price',
    'pricing',
    'cost',
    'cheap',
    'affordable',
    'discount',
    'coupon',
    ' plan ',
  ],
  BEST: [
    'best',
    'top ',
    'top-',
    'recommend',
    'which one',
    'worth it',
  ],
  REVIEWS: ['review', 'rating', 'ratings', 'testimonial'],
  USE_CASE: [
    'use case',
    'for small business',
    'for startup',
    'for enterprise',
    'for freelancer',
    'example',
  ],
  PROBLEM: [
    'problem',
    'issue',
    'error',
    'fix',
    'broken',
    'not working',
    'pain',
  ],
  IMPLEMENTATION: [
    'implement',
    'migrat',
    'onboard',
    'deploy',
    'install',
    'getting started',
  ],
  COMPATIBILITY: [
    'compatib',
    'work with',
    'support ',
    'requirement',
  ],
  INTEGRATION: [
    'integrat',
    'connect ',
    'api ',
    'webhook',
    'zapier',
    'sync',
  ],
  TRUST: [
    'trust',
    'legit',
    'scam',
    'secure',
    'security',
    'privacy',
    'reliable',
    'safe ',
  ],
  LOCAL: [
    'near me',
    'nearby',
    ' in ',
    'location',
    'address',
    'phone',
  ],
  TRANSACTIONAL: [
    'buy',
    'purchase',
    'order',
    'subscribe',
    'sign up',
    'signup',
    'free trial',
    'demo',
    'quote',
  ],
  DISCOVER: [],
};

export function normalizeTopicQuery(
  value: unknown,
): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function classifyFanoutNeeds(
  query: string,
): FanoutNeed[] {
  const padded = ` ${normalizeTopicQuery(query)} `;
  if (!padded.trim()) return [];
  const matched: FanoutNeed[] = [];
  for (const need of FANOUT_NEEDS) {
    if (need === 'DISCOVER') continue;
    const hints = FANOUT_HINTS[need];
    if (
      hints.some((hint) => padded.includes(hint))
    ) {
      matched.push(need);
    }
  }
  /* A query matching nothing specific is a discovery /
   * general-information need — observed, not invented. */
  if (matched.length === 0) matched.push('DISCOVER');
  return matched;
}

/* ---------- fan-out derivation ---------- */

export interface FanoutQuery {
  query: string;
  needs: FanoutNeed[];
  source: string;
}

export interface FanoutNeedGroup {
  need: FanoutNeed;
  intent: FanoutIntent;
  queries: string[];
}

export function dedupeQueries(
  queries: Array<{ query: string; source: string }>,
): FanoutQuery[] {
  /* Pre-sort so the surviving source label per
   * normalized query is input-order independent. */
  const ordered = [...queries].sort((a, b) => {
    const key =
      normalizeTopicQuery(a.query) <
      normalizeTopicQuery(b.query)
        ? -1
        : normalizeTopicQuery(a.query) >
            normalizeTopicQuery(b.query)
          ? 1
          : 0;
    if (key !== 0) return key;
    return String(a.source ?? '') <
      String(b.source ?? '')
      ? -1
      : 1;
  });
  const seen = new Map<string, FanoutQuery>();
  for (const row of ordered) {
    const query = String(row.query ?? '').trim();
    const key = normalizeTopicQuery(query);
    if (!key || seen.has(key)) continue;
    seen.set(key, {
      query,
      needs: classifyFanoutNeeds(query),
      source: String(row.source ?? 'UNKNOWN'),
    });
  }
  return [...seen.values()].sort((a, b) =>
    a.query < b.query ? -1 : 1,
  );
}

/* Derive fan-out ONLY from observed queries. Needs
 * with zero observed queries are absent — never
 * synthesized. Cap keeps composition bounded. */
export function deriveFanout(
  observed: Array<{ query: string; source: string }>,
  maxPerNeed = 10,
): FanoutNeedGroup[] {
  const deduped = dedupeQueries(observed);
  const groups: FanoutNeedGroup[] = [];
  for (const need of FANOUT_NEEDS) {
    const queries = deduped
      .filter((row) => row.needs.includes(need))
      .map((row) => row.query)
      .slice(0, maxPerNeed);
    if (queries.length === 0) continue;
    groups.push({
      need,
      intent: mapFanoutToIntent(need),
      queries,
    });
  }
  return groups;
}

/* ---------- ownership states ---------- */

export type CoverageState =
  | 'STRONG_COVERAGE'
  | 'PARTIAL_COVERAGE'
  | 'WEAK_COVERAGE'
  | 'INSUFFICIENT_EVIDENCE';

export function coverageState(input: {
  covered: number;
  total: number;
  competitorCovered?: number | null;
}): CoverageState {
  const { covered, total } = input;
  const competitor = input.competitorCovered ?? 0;
  if (total <= 0) return 'INSUFFICIENT_EVIDENCE';
  if (covered <= 0) {
    return competitor > 0
      ? 'WEAK_COVERAGE'
      : 'INSUFFICIENT_EVIDENCE';
  }
  const ratio = covered / total;
  /* Competitor visibility clearly exceeding ours
   * across the same observed set is weak — even
   * with some coverage of our own. */
  if (competitor > 0 && competitor >= covered * 2) {
    return 'WEAK_COVERAGE';
  }
  if (ratio >= 0.6 && covered >= competitor) {
    return 'STRONG_COVERAGE';
  }
  return 'PARTIAL_COVERAGE';
}

export function coverageStatement(
  state: CoverageState,
  topic: string,
): string {
  switch (state) {
    case 'STRONG_COVERAGE':
      return `Ranking coverage across most observed queries for “${topic}”, with supporting content observed.`;
    case 'PARTIAL_COVERAGE':
      return `Ranks for several observed queries in “${topic}” but has gaps across supporting search intents.`;
    case 'WEAK_COVERAGE':
      return `Competitor visibility exceeds RENKOO across observed queries in “${topic}”.`;
    case 'INSUFFICIENT_EVIDENCE':
    default:
      return `Not enough connected search/AI evidence to evaluate “${topic}”.`;
  }
}

/* ---------- Google × AI relationship ----------
 * Descriptive combinations, never scores, never
 * causal claims. */

export type GoogleAiRelationship =
  | 'BOTH_STRONG'
  | 'GOOGLE_STRONG'
  | 'AI_STRONG'
  | 'BOTH_WEAK'
  | 'INSUFFICIENT';

export function googleAiRelationship(
  google: CoverageState,
  ai: CoverageState,
): GoogleAiRelationship {
  const strong = (s: CoverageState) =>
    s === 'STRONG_COVERAGE';
  const weak = (s: CoverageState) =>
    s === 'WEAK_COVERAGE';
  const missing = (s: CoverageState) =>
    s === 'INSUFFICIENT_EVIDENCE';
  if (missing(google) && missing(ai))
    return 'INSUFFICIENT';
  if (strong(google) && strong(ai))
    return 'BOTH_STRONG';
  if (strong(google) && (weak(ai) || missing(ai)))
    return 'GOOGLE_STRONG';
  if (strong(ai) && (weak(google) || missing(google)))
    return 'AI_STRONG';
  if (weak(google) && weak(ai)) return 'BOTH_WEAK';
  if (weak(google) || missing(google)) return 'AI_STRONG';
  if (weak(ai) || missing(ai)) return 'GOOGLE_STRONG';
  return 'INSUFFICIENT';
}

export function relationshipStatement(
  relationship: GoogleAiRelationship,
): string {
  switch (relationship) {
    case 'BOTH_STRONG':
      return 'Strong observed visibility in both organic search and AI answers.';
    case 'GOOGLE_STRONG':
      return 'Strong organic visibility but limited observed AI citation coverage.';
    case 'AI_STRONG':
      return 'Limited organic visibility but observed AI citation presence.';
    case 'BOTH_WEAK':
      return 'Both Google and AI evidence are currently weak.';
    case 'INSUFFICIENT':
    default:
      return 'Insufficient evidence to compare Google and AI coverage.';
  }
}

/* ---------- content gaps (existing vocabulary) ---------- */

export type TopicGapKind =
  | 'CREATE'
  | 'IMPROVE'
  | 'CONSOLIDATE'
  | 'OPTIMIZE'
  | 'MONITOR';

export function topicGapKind(input: {
  hasPage: boolean;
  pageRanks: boolean;
  competitorPresent: boolean;
  cannibalizationRisk?: boolean;
}): TopicGapKind {
  if (!input.hasPage) return 'CREATE';
  if (input.cannibalizationRisk) return 'CONSOLIDATE';
  if (!input.pageRanks && input.competitorPresent)
    return 'IMPROVE';
  if (!input.pageRanks) return 'OPTIMIZE';
  return 'MONITOR';
}

export function gapStatement(
  kind: TopicGapKind,
  query: string,
): string {
  switch (kind) {
    case 'CREATE':
      return `No relevant page observed for “${query}” — content gap.`;
    case 'IMPROVE':
      return `A page exists for “${query}” but competitors cover it more visibly — content improvement.`;
    case 'CONSOLIDATE':
      return `Multiple pages answer “${query}” — consolidation / internal-link opportunity per existing logic.`;
    case 'OPTIMIZE':
      return `A page exists for “${query}” without observed ranking — optimization opportunity.`;
    case 'MONITOR':
    default:
      return `“${query}” has an observed ranking page — monitor.`;
  }
}

/* ---------- topic measurement (observed only) ---------- */

export function topicMeasurement(input: {
  dimension: 'GOOGLE' | 'AI' | 'CONTENT';
  before: number | null;
  after: number | null;
  unit: string;
}): string {
  const { dimension, before, after, unit } = input;
  if (before === null || after === null) {
    return `${dimension} ${unit}: insufficient observations on one side — outcome unknown, not zero.`;
  }
  if (after === before) {
    return `Observed ${dimension.toLowerCase()} ${unit} unchanged at ${after}.`;
  }
  const direction =
    dimension === 'GOOGLE'
      ? after > before
        ? 'increased'
        : 'decreased'
      : after > before
        ? 'increased'
        : 'decreased';
  return (
    `Observed ${dimension.toLowerCase()} ${unit} ` +
    `${direction} from ${before} to ${after}. ` +
    `Observed outcome only — not proof any single action caused it.`
  );
}

/* ---------- entity (Business Brain) ---------- */

export interface TopicEntity {
  businessName: string | null;
  products: string[];
  services: string[];
  primaryKeywords: string[];
  targetAudience: string | null;
}

export function composeTopicEntity(input: {
  businessName?: unknown;
  products?: unknown;
  services?: unknown;
  primaryKeywords?: unknown;
  targetAudience?: unknown;
}): TopicEntity | null {
  const list = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .map((entry) => String(entry ?? '').trim())
          .filter(Boolean)
          .slice(0, 20)
      : [];
  const entity: TopicEntity = {
    businessName:
      String(input.businessName ?? '').trim() ||
      null,
    products: list(input.products),
    services: list(input.services),
    primaryKeywords: list(input.primaryKeywords),
    targetAudience:
      String(input.targetAudience ?? '').trim() ||
      null,
  };
  if (
    !entity.businessName &&
    entity.products.length === 0 &&
    entity.services.length === 0 &&
    entity.primaryKeywords.length === 0 &&
    !entity.targetAudience
  ) {
    /* No entity information — UNAVAILABLE, never
     * inferred from keyword absence. */
    return null;
  }
  return entity;
}

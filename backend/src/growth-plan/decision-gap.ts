/*
 * =========================================================
 * SEARCH & AI DECISION GAP INTELLIGENCE 1.0 — pure
 * functions (Phase 38).
 *
 * Explains WHY WE ARE NOT WINNING a search / AI
 * decision using observed evidence only. Composition
 * vocabulary, never a score:
 *
 * - No Gap Score, Win Probability, Impact Score,
 *   Difficulty Score, confidence %, expected lift.
 * - Evidence states: OBSERVED / SUPPORTED / INFERRED /
 *   UNKNOWN / CONFLICTING / UNAVAILABLE.
 * - Citation is never recommendation. Ranking is
 *   never traffic. Traffic is never revenue.
 *   Observation is never causation.
 * - Unknowns are valid outputs, never filled with
 *   generated assumptions.
 * - Deterministic EVIDENCE ORDER (10 levels), max 5
 *   gaps surfaced.
 * =========================================================
 */

import { createHash } from 'node:crypto';

export type GapTarget =
  | 'GOOGLE_QUERY'
  | 'AI_PROMPT'
  | 'PAGE'
  | 'TOPIC'
  | 'CUSTOMER_NEED'
  | 'COMPETITOR_COMPARISON';

export type GapEvidence =
  | 'OBSERVED'
  | 'SUPPORTED'
  | 'INFERRED'
  | 'UNKNOWN'
  | 'CONFLICTING'
  | 'UNAVAILABLE';

export type GoogleGapKind =
  | 'INTENT_MISMATCH'
  | 'COMPETITOR_INTENT_ALIGNMENT'
  | 'SERP_FORMAT_MISMATCH'
  | 'MISSING_TOPIC'
  | 'MISSING_SUBTOPIC'
  | 'MISSING_BUYER_CRITERION'
  | 'MISSING_ENTITY'
  | 'MISSING_QUESTION'
  | 'BUYER_CRITERIA_GAP'
  | 'TITLE_GAP'
  | 'META_GAP'
  | 'HEADING_GAP'
  | 'TOPIC_COVERAGE_GAP'
  | 'ENTITY_COVERAGE_GAP'
  | 'FRESHNESS_DIFFERENCE'
  | 'INTERNAL_LINK_SUPPORT_GAP'
  | 'CANONICAL_GAP'
  | 'INDEXABILITY_GAP'
  | 'STRUCTURED_DATA_GAP'
  | 'PAGE_STRENGTH_DIFFERENCE'
  | 'SERP_FEATURE_GAP'
  | 'CONTENT_DEPTH_DIFFERENCE'
  | 'UNIQUE_VALUE_UNKNOWN'
  | 'CUSTOMER_NEED_GAP';

export type AiGapState =
  | 'NOT_MENTIONED'
  | 'MENTIONED'
  | 'CITED'
  | 'RECOMMENDED'
  | 'COMPETITOR_RECOMMENDED'
  | 'CITED_BUT_NOT_RECOMMENDED'
  | 'CONFLICTING'
  | 'UNKNOWN'
  | 'RECOMMENDATION_UNKNOWN';

export type InfoGapKind =
  | 'CLAIM_GAP'
  | 'ENTITY_GAP'
  | 'FRESHNESS_GAP'
  | 'SUPPORT_GAP'
  | 'CONFLICT'
  | 'NONE_OBSERVED';

export type TechGapKind =
  | 'INDEXABILITY_GAP'
  | 'CANONICAL_GAP'
  | 'ROBOTS_GAP'
  | 'STRUCTURED_DATA_GAP'
  | 'INTERNAL_LINK_GAP'
  | 'CRAWLABILITY_GAP'
  | 'NONE_OBSERVED';

export type NextGapDecision =
  | 'INVESTIGATE'
  | 'IMPROVE'
  | 'CREATE'
  | 'CONSOLIDATE'
  | 'FIX'
  | 'CONNECT'
  | 'STRENGTHEN'
  | 'RESPOND'
  | 'VERIFY'
  | 'MEASURE'
  | 'WAIT';

export const GAP_TARGETS: GapTarget[] = [
  'GOOGLE_QUERY',
  'AI_PROMPT',
  'PAGE',
  'TOPIC',
  'CUSTOMER_NEED',
  'COMPETITOR_COMPARISON',
];

export const MAX_GAPS = 5;
export const MAX_TARGETS = 20;
export const MAX_COMPETITORS = 10;
export const MAX_SERP_RESULTS = 10;

export const BUYER_CRITERIA = [
  'price',
  'features',
  'quality',
  'alternatives',
  'integrations',
  'use cases',
  'support',
  'security',
  'performance',
  'location',
  'compatibility',
] as const;

/* ---------- target identity ---------- */

export function gapFingerprint(input: {
  organizationId: string;
  websiteId: string;
  targetType: string;
  target: string;
}): string {
  return createHash('sha256')
    .update(
      [
        String(input.organizationId ?? '').trim(),
        String(input.websiteId ?? '').trim(),
        String(input.targetType ?? '').trim().toUpperCase(),
        String(input.target ?? '').trim().toLowerCase(),
      ].join('|'),
    )
    .digest('hex')
    .slice(0, 32);
}

/* ---------- intent (§5) ---------- */

export type QueryIntent =
  | 'INFORMATIONAL'
  | 'COMMERCIAL'
  | 'TRANSACTIONAL'
  | 'NAVIGATIONAL'
  | 'LOCAL'
  | 'UNKNOWN';

export function inferIntent(
  query: unknown,
): QueryIntent {
  const q = String(query ?? '').toLowerCase();
  if (!q.trim()) return 'UNKNOWN';
  if (
    /\bnear me\b|\bnearby\b|\bopen now\b|\b(hours|directions)\b/.test(q) ||
    /\b(in|near) [a-z ]+$/i.test(q)
  ) {
    return 'LOCAL';
  }
  if (
    /\bbuy\b|\bprice\b|\bpricing\b|\bcheap\b|\bdiscount\b|\border\b|\bcheckout\b|\bcoupon\b/.test(
      q,
    )
  ) {
    return 'TRANSACTIONAL';
  }
  if (
    /\bbest\b|\btop\b|\bvs\b|\bversus\b|\bcompar(e|ison)s?\b|\breviews?\b|\balternatives?\b|\bwhich\b/.test(
      q,
    )
  ) {
    return 'COMMERCIAL';
  }
  if (
    /^(who|what|when|where|why|how)\b/.test(q) ||
    /\bguide\b|\btutorial\b|\bwhat is\b|\bhow to\b|\blearn\b|\bmeaning\b/.test(
      q,
    )
  ) {
    return 'INFORMATIONAL';
  }
  return 'UNKNOWN';
}

export function pageAngle(
  signals: string,
): 'INFORMATIONAL' | 'COMMERCIAL' | 'TRANSACTIONAL' | 'UNKNOWN' {
  const s = String(signals ?? '').toLowerCase();
  if (/pricing|buy now|add to cart|checkout|plans/.test(s)) {
    return 'TRANSACTIONAL';
  }
  if (/compare|versus|best|review|alternative/.test(s)) {
    return 'COMMERCIAL';
  }
  if (/guide|tutorial|learn|blog|how|\bwhat is\b|explained/.test(s)) {
    return 'INFORMATIONAL';
  }
  return 'UNKNOWN';
}

export function intentMismatch(input: {
  queryIntent: QueryIntent;
  pageAngle: 'INFORMATIONAL' | 'COMMERCIAL' | 'TRANSACTIONAL' | 'UNKNOWN';
}): {
  mismatch: boolean;
  kind: 'INTENT_MISMATCH' | 'COMPETITOR_INTENT_ALIGNMENT' | null;
  note: string;
} {
  const { queryIntent, pageAngle: page } = input;
  if (
    queryIntent === 'UNKNOWN' ||
    page === 'UNKNOWN' ||
    queryIntent === page
  ) {
    return {
      mismatch: false,
      kind: null,
      note: 'No observed intent mismatch.',
    };
  }
  /* Informational query served by a commercial page
   * (and symmetrical cases) is the classic gate. */
  return {
    mismatch: true,
    kind: 'INTENT_MISMATCH',
    note: `Observed mismatch: query reads ${queryIntent}, page reads ${page}. Observed mismatch only — never “Google penalizes this”.`,
  };
}

/* ---------- SERP format (§6) ---------- */

export type SerpFormat =
  | 'GUIDE'
  | 'COMPARISON'
  | 'PRODUCT'
  | 'LOCAL'
  | 'VIDEO'
  | 'FORUM'
  | 'FAQ'
  | 'LIST'
  | 'TOOL'
  | 'COMMERCIAL'
  | 'UNKNOWN';

export function serpFormatOf(
  title: unknown,
  snippet: unknown,
  resultType: unknown,
): SerpFormat {
  const text = `${String(title ?? '')} ${String(snippet ?? '')}`.toLowerCase();
  const rt = String(resultType ?? '').toLowerCase();
  if (/video|youtube|watch/.test(text) || rt.includes('video')) {
    return 'VIDEO';
  }
  if (/reddit|quora|forum|thread|community/.test(text)) {
    return 'FORUM';
  }
  if (/compare|vs\.? |versus|best .+ for|top \d+/.test(text)) {
    return 'COMPARISON';
  }
  if (/price|buy|product|shop|plan/.test(text) || rt.includes('product')) {
    return 'PRODUCT';
  }
  if (/near|map|address|hours|location/.test(text) || rt.includes('local')) {
    return 'LOCAL';
  }
  if (/faq|question|people also ask/.test(text)) return 'FAQ';
  if (/^\d+\.|list|ideas|ways|tips|examples/.test(text)) {
    return 'LIST';
  }
  if (/calculator|tool|generator|checker|template/.test(text)) {
    return 'TOOL';
  }
  if (/guide|tutorial|how to|learn|\bwhat is\b|\bdefinition\b|\bmeaning\b|explained/.test(text)) return 'GUIDE';
  if (/service|agency|hire|quote|demo/.test(text)) {
    return 'COMMERCIAL';
  }
  return 'UNKNOWN';
}

export function dominantFormat(
  formats: SerpFormat[],
): SerpFormat {
  const counts = new Map<SerpFormat, number>();
  for (const f of formats) {
    if (f === 'UNKNOWN') continue;
    counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  let best: SerpFormat = 'UNKNOWN';
  let bestCount = 0;
  for (const [f, n] of counts) {
    if (n > bestCount) {
      best = f;
      bestCount = n;
    }
  }
  return best;
}

export function serpFormatMismatch(input: {
  dominant: SerpFormat;
  ours: SerpFormat;
  observedCount: number;
  totalCount: number;
}): {
  mismatch: boolean;
  note: string;
} {
  if (
    input.dominant === 'UNKNOWN' ||
    input.ours === 'UNKNOWN' ||
    input.dominant === input.ours
  ) {
    return { mismatch: false, note: 'No observed format mismatch.' };
  }
  return {
    mismatch: true,
    note: `SERP_FORMAT_MISMATCH: ${input.observedCount}/${input.totalCount} observed results read ${input.dominant}; ours reads ${input.ours}. Observed from SERP results — never inferred from generic SEO rules.`,
  };
}

/* ---------- buyer criteria (§8) ---------- */

export function buyerCriteriaIn(
  text: unknown,
): string[] {
  const lower = String(text ?? '').toLowerCase();
  /* Stem-aware matching ("pricing" must match price;
   * plain substring misses it). Only criteria with
   * observed textual support are returned. */
  const patterns: Array<{ criterion: string; re: RegExp }> = [
    { criterion: 'price', re: /pric(e|ing|es)\b/ },
    { criterion: 'features', re: /features?\b/ },
    { criterion: 'quality', re: /qualit(y|ies)\b/ },
    { criterion: 'alternatives', re: /alternatives?\b/ },
    { criterion: 'integrations', re: /integrat\w+/ },
    { criterion: 'use cases', re: /use cases?\b/ },
    { criterion: 'support', re: /support\b/ },
    { criterion: 'security', re: /secur\w+/ },
    { criterion: 'performance', re: /perform\w+/ },
    { criterion: 'location', re: /location\b|near me\b|nearby\b/ },
    { criterion: 'compatibility', re: /compatib\w+/ },
  ];
  return patterns
    .filter((p) => p.re.test(lower))
    .map((p) => p.criterion);
}

export function buyerCriteriaGap(input: {
  query: string;
  competitorTexts: string[];
  ourText: string | null;
}): {
  observed: string[];
  missing: string[];
  gap: boolean;
  note: string;
} {
  const observedSet = new Set<string>();
  for (const text of input.competitorTexts) {
    for (const c of buyerCriteriaIn(text)) observedSet.add(c);
  }
  const observed = [...observedSet].sort();
  const ours = new Set(
    input.ourText ? buyerCriteriaIn(input.ourText) : [],
  );
  const missing = observed.filter((c) => !ours.has(c));
  return {
    observed,
    missing,
    gap: missing.length > 0,
    note:
      missing.length > 0
        ? `BUYER_CRITERIA_GAP: observed criteria [${observed.join(', ')}]; ours lacks [${missing.join(', ')}]. Criteria from observed text only.`
        : 'No observed buyer-criteria gap.',
  };
}

/* ---------- content comparison (§7) ---------- */

export function tokenize(text: unknown): string[] {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

export function coverageGap(input: {
  competitorTokens: string[][];
  ourTokens: string[];
  minCompetitors?: number;
}): {
  missing: string[];
  note: string;
} {
  const ours = new Set(input.ourTokens);
  const counts = new Map<string, number>();
  for (const tokens of input.competitorTokens) {
    for (const t of new Set(tokens)) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  const min = Math.max(
    1,
    Math.min(
      input.minCompetitors ?? 2,
      input.competitorTokens.length,
    ),
  );
  const missing = [...counts.entries()]
    .filter(([t, n]) => n >= min && !ours.has(t))
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 12)
    .map(([t]) => t);
  return {
    missing,
    note:
      missing.length > 0
        ? `Terms in ${min}+ competitor pages but absent from ours: ${missing.slice(0, 8).join(', ')}. Term overlap, never semantic completeness.`
        : 'No observed term-coverage gap at this threshold.',
  };
}

/* ---------- AI states (§9/§10) ---------- */

export function aiGapState(input: {
  ourMentioned: boolean | null;
  ourCited: boolean | null;
  competitorCited: boolean | null;
  competitorRecommended: boolean | null;
  providerSupports: boolean;
  conflicting: boolean;
}): AiGapState {
  if (!input.providerSupports) return 'UNKNOWN';
  if (input.conflicting) return 'CONFLICTING';
  if (input.ourMentioned === true) return 'MENTIONED';
  if (input.ourCited === true) {
    return input.competitorRecommended === true
      ? 'CITED_BUT_NOT_RECOMMENDED'
      : 'CITED';
  }
  if (input.competitorRecommended === true) {
    return 'COMPETITOR_RECOMMENDED';
  }
  if (
    input.ourMentioned === false &&
    input.ourCited === false
  ) {
    return 'NOT_MENTIONED';
  }
  return 'UNKNOWN';
}

export function recommendationState(): 'RECOMMENDATION_UNKNOWN' {
  /* No source in RENKOO observes AI recommendation
   * directly. Always unknown — never inferred from
   * citation. */
  return 'RECOMMENDATION_UNKNOWN';
}

export function sourceGapNote(input: {
  ourSources: number;
  competitorSources: number;
  competitorLabel: string;
}): string {
  return (
    `OBSERVED_SOURCE_GAP: ${input.competitorLabel} appears in ` +
    `${input.competitorSources} observed third-party sources relevant to the prompt; ` +
    `we appear in ${input.ourSources}. Counts from observed citations only — no invented source authority.`
  );
}

/* ---------- technical gaps (§14/§15) ---------- */

export function technicalGaps(input: {
  indexable: boolean | null;
  canonicalOk: boolean | null;
  robotsOk: boolean | null;
  structuredData: boolean | null;
  crawlable: boolean | null;
}): Array<{ kind: string; note: string }> {
  const out: Array<{ kind: string; note: string }> = [];
  if (input.indexable === false) {
    out.push({
      kind: 'INDEXABILITY_GAP',
      note: 'INDEXABILITY_GAP: page observed non-indexable. Directly observed only.',
    });
  }
  if (input.canonicalOk === false) {
    out.push({
      kind: 'CANONICAL_GAP',
      note: 'CANONICAL_GAP: canonical mismatch observed.',
    });
  }
  if (input.robotsOk === false) {
    out.push({
      kind: 'ROBOTS_GAP',
      note: 'ROBOTS_GAP: robots restriction observed.',
    });
  }
  if (input.structuredData === false) {
    out.push({
      kind: 'STRUCTURED_DATA_GAP',
      note: 'STRUCTURED_DATA_GAP: no structured data observed on the page.',
    });
  }
  if (input.crawlable === false) {
    out.push({
      kind: 'CRAWLABILITY_GAP',
      note: 'CRAWLABILITY_GAP: crawl failure observed.',
    });
  }
  return out;
}

/* ---------- authority honesty (§16) ---------- */

export function authorityNote(input: {
  ours: number | null;
  competitor: number | null;
  metric: string;
  lowerIsStronger?: boolean;
}): string {
  if (input.ours === null || input.competitor === null) {
    return 'Authority evidence unavailable — no DA/DR/backlink figures invented.';
  }
  const disadvantage = input.lowerIsStronger
    ? input.competitor < input.ours
    : input.competitor > input.ours;
  if (disadvantage) {
    return `OBSERVED_AUTHORITY_DIFFERENCE: competitor ${input.metric} ${input.competitor} vs ours ${input.ours} (observed values only).`;
  }
  return `No observed authority disadvantage on ${input.metric}.`;
}

/* ---------- freshness (§17) ---------- */

export function freshnessNote(input: {
  oursDays: number | null;
  competitorDays: number | null;
}): string {
  if (input.oursDays === null || input.competitorDays === null) {
    return 'Freshness evidence unavailable.';
  }
  if (input.competitorDays + 180 < input.oursDays) {
    return `FRESHNESS_DIFFERENCE: competitor content materially newer (${input.competitorDays}d vs ${input.oursDays}d). Never claimed as the cause of ranking loss.`;
  }
  return 'No material freshness difference observed.';
}

/* ---------- evidence ordering (§19) ----------
 * Deterministic EVIDENCE ORDER, never a score. */

export type OrderedGapKind =
  | 'TECHNICAL_BLOCKER'
  | 'INTENT_MISMATCH'
  | 'SERP_FORMAT_MISMATCH'
  | 'NEED_BUYER_GAP'
  | 'TOPIC_GAP'
  | 'ENTITY_CLAIM_GAP'
  | 'INTERNAL_LINK_GAP'
  | 'COMPETITIVE_DIFFERENCE'
  | 'FRESHNESS_DIFFERENCE'
  | 'UNKNOWN_GAP';

const GAP_ORDER: OrderedGapKind[] = [
  'TECHNICAL_BLOCKER',
  'INTENT_MISMATCH',
  'SERP_FORMAT_MISMATCH',
  'NEED_BUYER_GAP',
  'TOPIC_GAP',
  'ENTITY_CLAIM_GAP',
  'INTERNAL_LINK_GAP',
  'COMPETITIVE_DIFFERENCE',
  'FRESHNESS_DIFFERENCE',
  'UNKNOWN_GAP',
];

export function gapOrderRank(kind: OrderedGapKind): number {
  const i = GAP_ORDER.indexOf(kind);
  return i === -1 ? GAP_ORDER.length : i;
}

export function orderGaps<T extends { kind: OrderedGapKind; fingerprint: string }>(
  gaps: T[],
): T[] {
  return [...gaps].sort((a, b) => {
    const r = gapOrderRank(a.kind) - gapOrderRank(b.kind);
    if (r !== 0) return r;
    return a.fingerprint < b.fingerprint ? -1 : 1;
  });
}

/* ---------- why summary (§20) ---------- */

export interface WhySummary {
  primary: string;
  supporting: string[];
  unknown: string[];
  nextInvestigation: string;
  existingAction: string;
}

export function whySummary(input: {
  primary: string;
  supporting: string[];
  unknown: string[];
  nextInvestigation: string;
  existingAction: string | null;
}): WhySummary {
  return {
    primary: `PRIMARY OBSERVED GAP: ${input.primary}`,
    supporting: input.supporting.map(
      (s) => `SUPPORTING EVIDENCE: ${s}`,
    ),
    unknown: input.unknown.map(
      (u) => `UNKNOWN: ${u}. No authoritative evidence that any single gap alone caused the difference.`,
    ),
    nextInvestigation: `NEXT INVESTIGATION: ${input.nextInvestigation}`,
    existingAction: input.existingAction
      ? `EXISTING ACTION: ${input.existingAction}`
      : 'NEXT_STEP_AVAILABLE — no existing action; nothing auto-created.',
  };
}

/* ---------- conflicts + unknowns (§23/§24) ---------- */

export function conflictNote(input: {
  a: string;
  b: string;
}): string {
  return `CONFLICTING_EVIDENCE: ${input.a} but ${input.b}. Neither chosen silently.`;
}

export function unknownNote(topic: string): string {
  return `${topic}: unknown — never filled with generated assumptions.`;
}

/* ---------- next decision mapping (§26) ---------- */

export function nextDecisionForGap(
  primaryKind: OrderedGapKind,
): string {
  switch (primaryKind) {
    case 'TECHNICAL_BLOCKER':
      return 'FIX';
    case 'INTENT_MISMATCH':
    case 'SERP_FORMAT_MISMATCH':
      return 'IMPROVE';
    case 'NEED_BUYER_GAP':
      return 'IMPROVE';
    case 'TOPIC_GAP':
      return 'CREATE';
    case 'ENTITY_CLAIM_GAP':
      return 'INVESTIGATE';
    case 'INTERNAL_LINK_GAP':
      return 'CONNECT';
    case 'COMPETITIVE_DIFFERENCE':
      return 'RESPOND';
    case 'FRESHNESS_DIFFERENCE':
      return 'IMPROVE';
    default:
      return 'INVESTIGATE';
  }
}

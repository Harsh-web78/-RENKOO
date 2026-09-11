/*
 * =========================================================
 * INFORMATION + CLAIM + ENTITY TRUST INTELLIGENCE 1.0 —
 * pure functions (Phase 25).
 *
 * "What does my website actually tell an AI system?"
 * Deterministic claim extraction from existing evidence
 * (title/meta/H1/H2/JSON-LD/BusinessBrain). No LLM on
 * normal reads, no knowledge graph, no truth engine.
 *
 * Research grounding (Sept 2026):
 * - AIO cites 5–15 sources from 200–500 candidates;
 *   only ~38% overlap organic top-10 (ZipTie, VENDOR).
 * - Passage extractability, entity density, schema
 *   (+73%/2.3×), named sources (2.1×) correlate with
 *   citation (vendor studies, medium confidence).
 * - Entity prominence (Organization+Person+sameAs,
 *   consistent facts) gates disambiguation; conflicts
 *   break trust (convergent vendor + official
 *   foundations: crawlable, structured, consistent).
 * - Retrieved-without-cited and cited-without-mention
 *   occur (vendor): ghost states are observations.
 * - Citation is never truth; changed is never wrong.
 * =========================================================
 */

export type ClaimType =
  | 'IDENTITY'
  | 'OFFERING'
  | 'FEATURE'
  | 'BENEFIT'
  | 'PRICE'
  | 'PLAN'
  | 'LOCATION'
  | 'AVAILABILITY'
  | 'INTEGRATION'
  | 'AUDIENCE'
  | 'INDUSTRY'
  | 'USE_CASE'
  | 'COMPARISON'
  | 'DIFFERENTIATOR'
  | 'CONTACT'
  | 'POLICY'
  | 'FRESHNESS'
  | 'AUTHORITY'
  | 'OWNERSHIP';

export type ClaimState =
  | 'SUPPORTED'
  | 'PARTIALLY_SUPPORTED'
  | 'CONFLICTING'
  | 'STALE'
  | 'UNSUPPORTED'
  | 'UNAVAILABLE';

export type EntityKind =
  | 'ORGANIZATION'
  | 'BRAND'
  | 'PRODUCT'
  | 'SERVICE'
  | 'PERSON'
  | 'LOCATION'
  | 'COMPETITOR'
  | 'INDUSTRY'
  | 'PLATFORM';

export type EntityConsistency =
  | 'CONSISTENT'
  | 'PARTIAL'
  | 'CONFLICTING'
  | 'UNAVAILABLE';

export type ClaimFreshness =
  | 'CURRENT'
  | 'AGING'
  | 'STALE'
  | 'UNKNOWN';

export type Provenance =
  | 'PAGE'
  | 'JSON_LD'
  | 'BUSINESS_BRAIN'
  | 'GSC'
  | 'AI_OBSERVATION'
  | 'AI_CITATION'
  | 'MANUAL'
  | 'THIRD_PARTY'
  | 'COMPETITOR';

export type CitationLink =
  | 'YES'
  | 'NO'
  | 'UNKNOWN'
  | 'UNAVAILABLE';

export type GhostState =
  | 'CITED'
  | 'MENTIONED'
  | 'CITED_AND_MENTIONED'
  | 'NEITHER'
  | 'CITED_WITHOUT_BRAND_MENTION'
  | 'UNKNOWN';

export type BrandAlignment =
  | 'ALIGNED'
  | 'PARTIAL'
  | 'DIVERGENT'
  | 'UNKNOWN';

export type InformationCoverage =
  | 'COVERED'
  | 'PARTIAL'
  | 'MISSING'
  | 'CONFLICTING'
  | 'STALE'
  | 'UNAVAILABLE';

export type TrustGap =
  | 'MISSING_CLAIM'
  | 'UNSUPPORTED_CLAIM'
  | 'STALE_CLAIM'
  | 'CONFLICTING_CLAIM'
  | 'AMBIGUOUS_ENTITY'
  | 'MISSING_PROVENANCE'
  | 'MISSING_DECISION_EVIDENCE'
  | 'CITED_NOT_MENTIONED'
  | 'THIRD_PARTY_MISMATCH'
  | 'COMPETITOR_INFORMATION_GAP';

export type ClaimChange =
  | 'CLAIM_ADDED'
  | 'CLAIM_CHANGED'
  | 'CLAIM_REMOVED'
  | 'CLAIM_CONFLICT_APPEARED'
  | 'CLAIM_CONFLICT_RESOLVED'
  | 'CLAIM_STALE';

export const CANNOT_MEASURE: readonly string[] = [
  'Absolute truth is unavailable: RENKOO reports support, conflict, staleness or insufficiency — never TRUE or FALSE.',
  'AI citation is an observation, not proof of correctness.',
  'Third-party corroboration is unavailable without connected evidence.',
  'Exact claim expiry is unavailable; freshness uses observed crawl age bands.',
  'Ghost-citation classification needs answer text with citation URLs; otherwise UNKNOWN.',
];

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function norm(value: unknown): string {
  return ` ${clean(value).toLowerCase()} `;
}

/* ---------- deterministic claim extraction ---------- */

export interface ExtractedClaim {
  key: string;
  subject: string;
  predicate: string;
  object: string;
  type: ClaimType;
  provenance: Provenance;
  evidence: 'OBSERVED';
}

function moneyValue(text: string): string | null {
  const match =
    /([$€£₹])\s?(\d[\d,]*(?:\.\d{1,2})?)\s?(\/\s?(month|mo|year|yr|user|seat))?/i.exec(
      text,
    );
  if (!match) return null;
  return clean(match[0]);
}

function phoneValue(text: string): string | null {
  const match =
    /(\+\d[\d\s\-().]{6,}\d)/.exec(text);
  if (!match) return null;
  return clean(match[1]);
}

export function extractPageClaims(input: {
  url: string;
  title: string | null;
  metaDescription: string | null;
  h1: string[];
  h2: string[];
  jsonLdNames: string[];
}): ExtractedClaim[] {
  const url = clean(input.url);
  if (!url) return [];
  const claims: ExtractedClaim[] = [];
  const push = (
    subject: string,
    predicate: string,
    object: string,
    type: ClaimType,
    provenance: Provenance,
  ): void => {
    if (!clean(object)) return;
    claims.push({
      key: [type, norm(subject), norm(object)]
        .join('|')
        .slice(0, 200),
      subject: clean(subject),
      predicate,
      object: clean(object),
      type,
      provenance,
      evidence: 'OBSERVED',
    });
  };
  const haystacks = [
    clean(input.title),
    clean(input.metaDescription),
    ...input.h1,
    ...input.h2,
  ].filter(Boolean);
  for (const text of haystacks) {
    const money = moneyValue(text);
    if (money)
      push(url, 'states price', money, 'PRICE', 'PAGE');
    const phone = phoneValue(text);
    if (phone)
      push(url, 'lists contact', phone, 'CONTACT', 'PAGE');
    if (/\bintegrat/i.test(text))
      push(url, 'describes integration', text.slice(0, 120), 'INTEGRATION', 'PAGE');
    if (/\b(free trial|trial|demo|book a demo)\b/i.test(text))
      push(url, 'offers trial', text.slice(0, 120), 'OFFERING', 'PAGE');
    if (/\b(location|address|based in|serving)\b/i.test(text))
      push(url, 'states location', text.slice(0, 120), 'LOCATION', 'PAGE');
  }
  if (clean(input.title))
    push(
      url,
      'titled as',
      clean(input.title).slice(0, 140),
      'IDENTITY',
      'PAGE',
    );
  for (const name of input.jsonLdNames.slice(0, 5)) {
    if (clean(name))
      push(url, 'names entity', name, 'IDENTITY', 'JSON_LD');
  }
  return claims.slice(0, 60);
}

/* ---------- states ---------- */

export function claimState(input: {
  sources: number;
  conflicts: number;
  stale: boolean;
  hasEvidence: boolean;
}): ClaimState {
  if (!input.hasEvidence) return 'UNAVAILABLE';
  if (input.conflicts > 0) return 'CONFLICTING';
  if (input.stale) return 'STALE';
  if (input.sources >= 2) return 'SUPPORTED';
  if (input.sources === 1) return 'PARTIALLY_SUPPORTED';
  return 'UNSUPPORTED';
}

export function entityConsistencyOf(
  names: Array<string | null>,
): EntityConsistency {
  const values = names.map(clean).filter(Boolean);
  if (values.length === 0) return 'UNAVAILABLE';
  if (values.length === 1) return 'PARTIAL';
  const lowered = values.map((value) =>
    value.toLowerCase(),
  );
  if (new Set(lowered).size === 1) return 'CONSISTENT';
  const base = lowered[0];
  if (
    lowered.every(
      (value) =>
        value.includes(base) || base.includes(value),
    )
  )
    return 'PARTIAL';
  return 'CONFLICTING';
}

/* Meaningful semantic conflicts only — never wording. */
export function meaningfulConflict(
  a: string,
  b: string,
): boolean {
  const first = norm(a);
  const second = norm(b);
  if (!clean(a) || !clean(b)) return false;
  if (first === second) return false;
  const moneyA = moneyValue(a);
  const moneyB = moneyValue(b);
  if (moneyA && moneyB && moneyA !== moneyB) return true;
  const negation =
    /(\bno\b|\bnot\b|\bwithout\b|\bnever\b|\bdoesn't\b|\bdon't\b)/;
  const stripped = (text: string): string =>
    text.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (
    negation.test(first) !== negation.test(second) &&
    stripped(first).replace(/no |not |without |never /g, '') ===
      stripped(second).replace(/no |not |without |never /g, '')
  )
    return true;
  return false;
}

export function freshnessOf(
  crawlAgeDays: number | null,
): ClaimFreshness {
  if (crawlAgeDays === null || crawlAgeDays === undefined)
    return 'UNKNOWN';
  if (!Number.isFinite(crawlAgeDays) || crawlAgeDays < 0)
    return 'UNKNOWN';
  if (crawlAgeDays <= 60) return 'CURRENT';
  if (crawlAgeDays <= 180) return 'AGING';
  return 'STALE';
}

export function ghostState(input: {
  cited: boolean | null;
  mentioned: boolean | null;
}): GhostState {
  if (input.cited === null || input.mentioned === null)
    return 'UNKNOWN';
  if (input.cited && input.mentioned)
    return 'CITED_AND_MENTIONED';
  if (input.cited && !input.mentioned)
    return 'CITED_WITHOUT_BRAND_MENTION';
  if (input.cited) return 'CITED';
  if (input.mentioned) return 'MENTIONED';
  return 'NEITHER';
}

export function brandAlignmentOf(input: {
  siteSignals: number;
  aiSignals: number;
  matching: number;
}): BrandAlignment {
  if (input.siteSignals === 0 || input.aiSignals === 0)
    return 'UNKNOWN';
  if (input.matching >= input.aiSignals) return 'ALIGNED';
  if (input.matching > 0) return 'PARTIAL';
  return 'DIVERGENT';
}

export function coverageOf(input: {
  hasPage: boolean | null;
  supported: boolean | null;
  conflicting: boolean;
  stale: boolean;
}): InformationCoverage {
  if (input.conflicting) return 'CONFLICTING';
  if (input.stale && input.hasPage) return 'STALE';
  if (input.hasPage === null) return 'UNAVAILABLE';
  if (input.hasPage && input.supported) return 'COVERED';
  if (input.hasPage) return 'PARTIAL';
  return 'MISSING';
}

/* ---------- gaps → existing page decisions ---------- */

export function mapTrustGapToPageDecision(
  gap: TrustGap,
):
  | 'IMPROVE'
  | 'OPTIMIZE'
  | 'CREATE'
  | 'CONSOLIDATE'
  | 'PROTECT'
  | 'MONITOR' {
  switch (gap) {
    case 'CONFLICTING_CLAIM':
      return 'IMPROVE';
    case 'MISSING_CLAIM':
    case 'MISSING_DECISION_EVIDENCE':
      return 'CREATE';
    case 'STALE_CLAIM':
      return 'OPTIMIZE';
    case 'UNSUPPORTED_CLAIM':
    case 'AMBIGUOUS_ENTITY':
    case 'MISSING_PROVENANCE':
      return 'IMPROVE';
    case 'CITED_NOT_MENTIONED':
      return 'OPTIMIZE';
    case 'THIRD_PARTY_MISMATCH':
    case 'COMPETITOR_INFORMATION_GAP':
      return 'IMPROVE';
    default:
      return 'MONITOR';
  }
}

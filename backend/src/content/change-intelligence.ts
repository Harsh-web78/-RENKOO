/*
 * =========================================================
 * SEARCH CHANGE INTELLIGENCE + IMPACT EXPLAINER 1.0 —
 * pure functions (Phase 26).
 *
 * "What changed and what happened next?"
 * Page changed → visibility changed → AI changed →
 * demand changed → outcome changed-or-unavailable →
 * evidence timeline. Temporal association only.
 *
 * Research grounding (Sept 2026):
 * - Volatility is frequent and often unconfirmed
 *   (Aug 1–3, Jul 24 spikes vs confirmed May core,
 *   Jun/Aug spam updates; OFFICIAL dashboard vs
 *   TRACKER-OBSERVED). Tracker movement is not proof
 *   of an update; diagnosis isolates timing, surface
 *   and competitors first.
 * - AIO presence cuts pos-1 CTR ~38–58% (Ahrefs Feb
 *   2026; arXiv field experiment Aug 2026: AI Mode
 *   −18.8pp, No-AI +8.8pp; OFFICIAL-grade).
 * - ~30% of AIO citations absent from first page;
 *   11% of claims unsupported (arXiv May 2026).
 * - GSC impression logging error inflated numbers
 *   from May 2025, fixed Apr 2026 (OFFICIAL): never
 *   treat chart moves as site changes without a
 *   second source.
 *
 * Forbidden: caused, because of, resulted in, led to,
 * generated, drove, produced (action impact); all
 * *Score models (Impact/Change/Causal/Volatility/
 * SEOHealth/AIImpact/Confidence). Allowed: after,
 * following, observed, coincided, during, alongside,
 * preceded, temporal association.
 * =========================================================
 */

export type ChangeType =
  | 'CONTENT_CHANGE'
  | 'TITLE_CHANGED'
  | 'META_CHANGED'
  | 'H1_CHANGED'
  | 'H2_CHANGED'
  | 'CANONICAL_CHANGED'
  | 'ROBOTS_CHANGED'
  | 'STRUCTURED_DATA_CHANGED'
  | 'INTERNAL_LINK_CHANGE'
  | 'URL_STATUS_CHANGED'
  | 'REDIRECT_CHANGE'
  | 'PAGE_ADDED'
  | 'PAGE_REMOVED'
  | 'CLAIM_ADDED'
  | 'CLAIM_CHANGED'
  | 'CLAIM_REMOVED'
  | 'CLAIM_CONFLICT_APPEARED'
  | 'CLAIM_CONFLICT_RESOLVED'
  | 'RANK_IMPROVED'
  | 'RANK_DECLINED'
  | 'RANK_LOST'
  | 'RANK_NEW'
  | 'GSC_CLICKS_CHANGED'
  | 'GSC_IMPRESSIONS_CHANGED'
  | 'GSC_CTR_CHANGED'
  | 'GSC_POSITION_CHANGED'
  | 'AI_MENTION_CHANGED'
  | 'AI_CITATION_CHANGED'
  | 'AI_SOURCE_CHANGED'
  | 'LEAD_CHANGED'
  | 'REVENUE_CHANGED';

export type ChangeDirection =
  | 'IMPROVED'
  | 'DECLINED'
  | 'APPEARED'
  | 'REMOVED'
  | 'CHANGED'
  | 'UNCHANGED'
  | 'UNKNOWN';

export type EvidenceConfidence =
  | 'STRONG_EVIDENCE'
  | 'MULTIPLE_OBSERVATIONS'
  | 'SINGLE_OBSERVATION'
  | 'INSUFFICIENT_EVIDENCE'
  | 'UNAVAILABLE';

export type DivergenceState =
  | 'SEARCH_AI_DIVERGENCE'
  | 'ALIGNED_SIGNALS'
  | 'INSUFFICIENT_EVIDENCE';

export type AiHistoryDelta =
  | 'MENTION_GAINED'
  | 'MENTION_LOST'
  | 'CITATION_GAINED'
  | 'CITATION_LOST'
  | 'SOURCE_GAINED'
  | 'SOURCE_LOST'
  | 'UNCHANGED'
  | 'UNKNOWN';

export type MissingHistory =
  | 'FIRST_OBSERVATION'
  | 'NO_BASELINE'
  | 'NO_AI_BASELINE'
  | 'OUTCOME_UNAVAILABLE';

export const CANNOT_MEASURE: readonly string[] = [
  'Causal impact is unavailable: temporal association is never causation.',
  'Tracker or volatility movement is not proof of a confirmed update.',
  'GSC chart moves need a second source before treating them as site changes.',
  'AI citation changes need prompt-level before/after rows; aggregates stay aggregate.',
  'Missing history is never a zero baseline: FIRST_OBSERVATION, NO_BASELINE, NO_AI_BASELINE, OUTCOME_UNAVAILABLE.',
];

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function norm(value: unknown): string {
  return clean(value).toLowerCase();
}

function normList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return (value as unknown[])
    .map(clean)
    .filter(Boolean);
}

/* ---------- content field diff ---------- */

export interface ContentDiff {
  type: ChangeType;
  before: string | null;
  after: string | null;
}

export function diffField(
  type: ChangeType,
  before: unknown,
  after: unknown,
): ContentDiff | null {
  const beforeText = clean(before);
  const afterText = clean(after);
  if (!beforeText && !afterText) return null;
  if (beforeText === afterText) return null;
  return { type, before: beforeText || null, after: afterText || null };
}

export function diffStringList(
  type: ChangeType,
  before: unknown,
  after: unknown,
): ContentDiff | null {
  const beforeList = normList(before);
  const afterList = normList(after);
  if (
    beforeList.length === afterList.length &&
    beforeList.every((entry, index) => entry === afterList[index])
  )
    return null;
  return {
    type,
    before: beforeList.join(' | ') || null,
    after: afterList.join(' | ') || null,
  };
}

export function normalizedBodySimilarity(
  before: unknown,
  after: unknown,
): 'SAME' | 'CHANGED' | 'UNAVAILABLE' {
  const normalize = (value: unknown): string | null => {
    const text = clean(value);
    if (!text) return null;
    return text.toLowerCase().replace(/\s+/g, ' ').trim();
  };
  const beforeText = normalize(before);
  const afterText = normalize(after);
  if (beforeText === null || afterText === null)
    return 'UNAVAILABLE';
  return beforeText === afterText ? 'SAME' : 'CHANGED';
}

/* ---------- movement mappers (existing semantics) ---------- */

export function rankDirection(
  before: number | null,
  after: number | null,
): ChangeDirection {
  if (before === null && after === null) return 'UNKNOWN';
  if (before === null) return 'APPEARED';
  if (after === null) return 'REMOVED';
  if (after < before) return 'IMPROVED';
  if (after > before) return 'DECLINED';
  return 'UNCHANGED';
}

export function higherDirection(
  before: number | null,
  after: number | null,
  tolerance = 0,
): ChangeDirection {
  if (before === null || after === null) return 'UNKNOWN';
  if (!Number.isFinite(before) || !Number.isFinite(after))
    return 'UNKNOWN';
  if (Math.abs(after - before) <= tolerance)
    return 'UNCHANGED';
  return after > before ? 'IMPROVED' : 'DECLINED';
}

export function aiDelta(
  before: boolean | null,
  after: boolean | null,
  kind: 'MENTION' | 'CITATION' | 'SOURCE',
): AiHistoryDelta {
  if (before === null || after === null) return 'UNKNOWN';
  if (before === after) return 'UNCHANGED';
  if (after) return `${kind}_GAINED` as AiHistoryDelta;
  return `${kind}_LOST` as AiHistoryDelta;
}

/* ---------- confidence (descriptive, never a score) ---------- */

export function confidenceOf(
  observations: number,
  sources: number,
): EvidenceConfidence {
  if (observations <= 0 || sources <= 0)
    return 'INSUFFICIENT_EVIDENCE';
  if (sources >= 2 && observations >= 3)
    return 'STRONG_EVIDENCE';
  if (sources >= 2 || observations >= 2)
    return 'MULTIPLE_OBSERVATIONS';
  return 'SINGLE_OBSERVATION';
}

/* ---------- multi-signal + divergence ---------- */

export function multiSignal(
  directions: ChangeDirection[],
): 'MULTIPLE_SIGNALS_ALIGNED' | 'MIXED_SIGNALS' | 'NO_MATERIAL_CHANGE_OBSERVED' {
  const meaningful = directions.filter(
    (direction) =>
      direction !== 'UNCHANGED' &&
      direction !== 'UNKNOWN',
  );
  if (meaningful.length === 0)
    return 'NO_MATERIAL_CHANGE_OBSERVED';
  const improved = meaningful.filter(
    (direction) =>
      direction === 'IMPROVED' ||
      direction === 'APPEARED',
  ).length;
  const declined = meaningful.filter(
    (direction) =>
      direction === 'DECLINED' ||
      direction === 'REMOVED',
  ).length;
  if (improved > 0 && declined > 0) return 'MIXED_SIGNALS';
  return 'MULTIPLE_SIGNALS_ALIGNED';
}

export function searchAiDivergence(
  search: ChangeDirection | null,
  ai: ChangeDirection | null,
): DivergenceState {
  if (search === null || ai === null)
    return 'INSUFFICIENT_EVIDENCE';
  const good = (direction: ChangeDirection): boolean =>
    direction === 'IMPROVED' || direction === 'APPEARED';
  const bad = (direction: ChangeDirection): boolean =>
    direction === 'DECLINED' || direction === 'REMOVED';
  if (
    (good(search) && bad(ai)) ||
    (bad(search) && good(ai))
  )
    return 'SEARCH_AI_DIVERGENCE';
  if (
    (good(search) && !good(ai) && !bad(ai)) ||
    (bad(search) && !bad(ai) && !good(ai)) ||
    (good(ai) && !good(search) && !bad(search)) ||
    (bad(ai) && !bad(search) && !good(search))
  )
    return 'SEARCH_AI_DIVERGENCE';
  if (
    (good(search) && good(ai)) ||
    (bad(search) && bad(ai)) ||
    (search === 'UNCHANGED' && ai === 'UNCHANGED')
  )
    return 'ALIGNED_SIGNALS';
  return 'INSUFFICIENT_EVIDENCE';
}

/* ---------- explainer (deterministic, causal-free) ---------- */

export interface ExplainerInput {
  whatChanged: string;
  before: string | null;
  after: string | null;
  searchNote: string | null;
  aiNote: string | null;
}

export function explainChange(
  input: ExplainerInput,
): string[] {
  const lines: string[] = [
    `What changed: ${clean(input.whatChanged) || 'an observed change'}.`,
  ];
  if (input.before !== null || input.after !== null)
    lines.push(
      `Before ${clean(input.before) || 'unavailable'} → after ${clean(input.after) || 'unavailable'}.`,
    );
  if (input.searchNote)
    lines.push(
      `Search: ${clean(input.searchNote)} (observed after the change).`,
    );
  if (input.aiNote)
    lines.push(
      `AI: ${clean(input.aiNote)} (observed after the change).`,
    );
  lines.push(
    'Temporal association only; other factors may contribute. No causal inference.',
  );
  return lines;
}

export function containsCausalClaim(
  text: unknown,
): boolean {
  const lowered = ` ${norm(text)} `;
  return [
    'caused',
    'because of',
    'resulted in',
    'led to',
    'drove ',
    'generated ',
    'produced ',
  ].some((phrase) => lowered.includes(` ${phrase.trim()} `));
}

/*
 * =========================================================
 * EXECUTION VERIFICATION + OUTCOME LOOP 1.0 — pure
 * functions (Phase 28).
 *
 * RECOMMENDATION → EXPECTED CHANGE → EXECUTION →
 * LIVE VERIFICATION → OBSERVED CHANGE → OUTCOME →
 * LEARNING. Verification before interpretation.
 *
 * Research grounding (Sept 2026):
 * - GSC Recommendations: experimental Overview feature
 *   (issues/opportunities/configuration), expire/change
 *   over time (OFFICIAL Google docs).
 * - Before/after cannot establish causality; control
 *   groups isolate cause (SearchPilot methodology,
 *   VENDOR). RENKOO stays observational: no control
 *   groups are built, so no causal claims are made.
 * - GSC data explains results; traffic/conversions are
 *   primary; crawl data separates unseen changes
 *   (VENDOR practice). Hence verify-before-measure.
 * - SEO tests: one change, log dates, allow recrawl,
 *   before/after GSC (practitioner consensus).
 *
 * Rules: DONE ≠ VERIFIED. Semantic match, never exact
 * wording unless specified. No scores (Execution,
 * Implementation, Verification, Success, Action,
 * Impact). No causality language. No CMS writes.
 * =========================================================
 */

export type ExpectedChangeType =
  | 'CHANGE_TITLE'
  | 'CHANGE_META'
  | 'CHANGE_H1'
  | 'CHANGE_H2'
  | 'ADD_CONTENT_SECTION'
  | 'UPDATE_CLAIM'
  | 'RESOLVE_CLAIM_CONFLICT'
  | 'ADD_INTERNAL_LINK'
  | 'CREATE_PAGE'
  | 'IMPROVE_PAGE'
  | 'UPDATE_STRUCTURED_DATA'
  | 'IMPROVE_ENTITY_CONSISTENCY'
  | 'REFRESH_CONTENT'
  | 'IMPROVE_LOCAL_INFORMATION';

export type VerificationState =
  | 'VERIFIED'
  | 'PARTIALLY_VERIFIED'
  | 'NOT_VERIFIED'
  | 'CONFLICTING'
  | 'UNAVAILABLE'
  | 'NOT_APPLICABLE'
  | 'NOT_YET_VERIFIABLE';

export type VerificationTarget =
  | 'TITLE'
  | 'META'
  | 'H1'
  | 'H2'
  | 'CANONICAL'
  | 'ROBOTS'
  | 'STATUS'
  | 'STRUCTURED_DATA'
  | 'JSON_LD'
  | 'INTERNAL_LINK'
  | 'CLAIM'
  | 'ENTITY'
  | 'CONTENT_PRESENCE'
  | 'PAGE_EXISTENCE';

export interface ExpectedChange {
  actionType: string;
  targetUrl: string | null;
  targetElement: VerificationTarget | null;
  expectedState: string | null;
  sourceRecommendation: string | null;
  customerNeed: string | null;
  keyword: string | null;
  topic: string | null;
  claim: string | null;
  evidence: string;
}

export const VERIFICATION_UI_COPY: Record<
  VerificationState,
  string
> = {
  VERIFIED: 'Expected change observed on the live page.',
  PARTIALLY_VERIFIED:
    'Some expected evidence was observed.',
  NOT_VERIFIED: 'Expected change was not observed.',
  CONFLICTING:
    'Live evidence conflicts with the expected change.',
  UNAVAILABLE:
    'RENKOO could not verify this change from available evidence.',
  NOT_APPLICABLE:
    'This action has no deterministic live-page verification target.',
  NOT_YET_VERIFIABLE:
    'Action has not reached a verifiable execution state.',
};

export const DONE_NOT_VERIFIED_NOTE =
  'Action is marked complete, but the expected live-page change was not observed. Possible reasons: deployment pending, cache, wrong page, change not shipped, or crawl unavailable. This is not an accusation — verify again after deploying.';

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function norm(value: unknown): string {
  return ` ${clean(value).toLowerCase()} `;
}

/* ---------- expected-change derivation ---------- */

export function deriveExpectedChange(input: {
  actionType: string;
  targetUrl: string | null;
  keyword: string | null;
  topic: string | null;
  recommendationType: string | null;
  recommendationMetadata: Record<string, unknown> | null;
  customerNeed: string | null;
  claim: string | null;
}): ExpectedChange | null {
  const actionType = clean(input.actionType).toUpperCase();
  const recommendationType = clean(
    input.recommendationType,
  ).toUpperCase();
  const meta = input.recommendationMetadata ?? {};
  const sourceUrl = clean(meta.sourceUrl);
  const targetUrl =
    clean(meta.targetUrl) || clean(input.targetUrl) || null;

  if (
    recommendationType === 'INTERNAL_LINK_OPPORTUNITY' ||
    actionType.includes('INTERNAL_LINK')
  ) {
    if (!sourceUrl || !targetUrl) return null;
    return {
      actionType: clean(input.actionType) || 'INTERNAL_LINK',
      targetUrl: sourceUrl,
      targetElement: 'INTERNAL_LINK',
      expectedState: `Source page contains a link to ${targetUrl}`,
      sourceRecommendation:
        clean(input.recommendationType) || null,
      customerNeed: clean(input.customerNeed) || null,
      keyword: clean(input.keyword) || null,
      topic: clean(input.topic) || null,
      claim: null,
      evidence:
        'Derived from internal-link recommendation metadata.',
    };
  }
  if (!targetUrl) return null;
  if (
    /TITLE/i.test(actionType) ||
    /TITLE/i.test(recommendationType)
  ) {
    return {
      actionType: clean(input.actionType) || 'IMPROVE_PAGE',
      targetUrl,
      targetElement: 'TITLE',
      expectedState: clean(input.claim) || null,
      sourceRecommendation:
        clean(input.recommendationType) || null,
      customerNeed: clean(input.customerNeed) || null,
      keyword: clean(input.keyword) || null,
      topic: clean(input.topic) || null,
      claim: clean(input.claim) || null,
      evidence:
        'Derived from title recommendation metadata.',
    };
  }
  if (clean(input.claim)) {
    return {
      actionType: clean(input.actionType) || 'IMPROVE_PAGE',
      targetUrl,
      targetElement: 'CLAIM',
      expectedState: clean(input.claim),
      sourceRecommendation:
        clean(input.recommendationType) || null,
      customerNeed: clean(input.customerNeed) || null,
      keyword: clean(input.keyword) || null,
      topic: clean(input.topic) || null,
      claim: clean(input.claim),
      evidence:
        'Derived from claim-gap evidence attached to the action.',
    };
  }
  if (clean(input.keyword) || clean(input.topic)) {
    return {
      actionType: clean(input.actionType) || 'IMPROVE_PAGE',
      targetUrl,
      targetElement: 'CONTENT_PRESENCE',
      expectedState: `Page clearly addresses ${clean(input.keyword) || clean(input.topic)}`,
      sourceRecommendation:
        clean(input.recommendationType) || null,
      customerNeed: clean(input.customerNeed) || null,
      keyword: clean(input.keyword) || null,
      topic: clean(input.topic) || null,
      claim: null,
      evidence:
        'Derived from keyword/topic attached to the action.',
    };
  }
  /* Generic improvement prose is not a target. */
  return null;
}

/* ---------- semantic verification ---------- */

const FILLER_WORDS = new Set([
  'page',
  'should',
  'clearly',
  'address',
  'existing',
  'your',
  'with',
  'that',
  'this',
  'from',
  'into',
  'about',
  'their',
  'have',
  'will',
  'would',
  'could',
  'must',
  'need',
  'needs',
  'make',
  'more',
  'most',
  'very',
  'just',
  'also',
  'such',
  'than',
  'then',
  'when',
  'where',
  'which',
  'while',
  'what',
]);

export function semanticMatch(
  expected: string,
  observed: string,
): boolean {
  const wordsOf = (text: string): string[] =>
    norm(text)
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(
        (word) =>
          word.length > 3 && !FILLER_WORDS.has(word),
      );
  const expectedWords = wordsOf(expected);
  if (expectedWords.length === 0) return false;
  const observedText = ` ${wordsOf(observed).join(' ')} `;
  const hits = expectedWords.filter((word) =>
    observedText.includes(` ${word} `),
  ).length;
  return hits / expectedWords.length >= 0.5;
}

export function verifyTarget(
  target: VerificationTarget,
  expected: string | null,
  live: Record<string, unknown> | null,
): VerificationState {
  if (!live) return 'UNAVAILABLE';
  switch (target) {
    case 'TITLE':
    case 'META':
    case 'H1':
    case 'H2': {
      const raw =
        target === 'META'
          ? (live.metaDescription ?? live.meta)
          : live[target.toLowerCase() as 'title' | 'h1' | 'h2'];
      const observed = clean(
        raw ??
          (Array.isArray(live.h1) && target === 'H1'
            ? (live.h1 as unknown[]).join(' ')
            : undefined) ??
          (Array.isArray(live.h2) && target === 'H2'
            ? (live.h2 as unknown[]).join(' ')
            : undefined),
      );
      if (!observed) return 'UNAVAILABLE';
      if (!expected) return 'PARTIALLY_VERIFIED';
      return semanticMatch(expected, observed)
        ? 'VERIFIED'
        : 'NOT_VERIFIED';
    }
    case 'INTERNAL_LINK': {
      const links = live.internalLinks;
      if (!Array.isArray(links)) return 'UNAVAILABLE';
      const targetUrl = norm(expected).trim();
      if (targetUrl.length === 0) return 'UNAVAILABLE';
      const found = (links as unknown[]).some(
        (link) => norm(link).trim() === targetUrl,
      );
      return found ? 'VERIFIED' : 'NOT_VERIFIED';
    }
    case 'CLAIM': {
      const text = norm(
        [
          clean(live.title),
          ...(Array.isArray(live.h1)
            ? (live.h1 as unknown[]).map(clean)
            : []),
          ...(Array.isArray(live.h2)
            ? (live.h2 as unknown[]).map(clean)
            : []),
        ].join(' '),
      );
      if (!expected) return 'PARTIALLY_VERIFIED';
      return semanticMatch(expected, text)
        ? 'VERIFIED'
        : 'NOT_VERIFIED';
    }
    case 'STATUS': {
      const status = Number(live.statusCode);
      if (!Number.isFinite(status)) return 'UNAVAILABLE';
      return status >= 200 && status < 300
        ? 'VERIFIED'
        : 'CONFLICTING';
    }
    case 'STRUCTURED_DATA':
    case 'JSON_LD': {
      const count = Number(live.structuredDataCount);
      if (!Number.isFinite(count)) return 'UNAVAILABLE';
      return count > 0 ? 'VERIFIED' : 'NOT_VERIFIED';
    }
    case 'PAGE_EXISTENCE': {
      const status = Number(live.statusCode);
      if (!Number.isFinite(status)) return 'UNAVAILABLE';
      return status < 400 ? 'VERIFIED' : 'NOT_VERIFIED';
    }
    case 'CONTENT_PRESENCE': {
      if (!expected) return 'PARTIALLY_VERIFIED';
      const text = norm(
        [
          clean(live.title),
          ...(Array.isArray(live.h1)
            ? (live.h1 as unknown[]).map(clean)
            : []),
          ...(Array.isArray(live.h2)
            ? (live.h2 as unknown[]).map(clean)
            : []),
        ].join(' '),
      );
      return semanticMatch(expected, text)
        ? 'VERIFIED'
        : 'NOT_VERIFIED';
    }
    default:
      return 'NOT_APPLICABLE';
  }
}

export function readinessForVerification(
  status: string,
): boolean {
  return clean(status).toUpperCase() === 'DONE';
}

export function containsCausalClaim(
  text: unknown,
): boolean {
  const lowered = ` ${norm(text)
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')} `;
  return [
    'caused',
    'resulted in',
    'because of',
    'led to',
    'therefore improved',
    'drove ',
    'generated ',
  ].some((phrase) => lowered.includes(` ${phrase.trim()} `));
}

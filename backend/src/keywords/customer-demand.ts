/*
 * =========================================================
 * CUSTOMER DEMAND + QUERY JOURNEY INTELLIGENCE 2.0 — pure
 * functions (Phase 24).
 *
 * "Understand what the customer is trying to decide."
 * CUSTOMER NEED → QUERY → SUB-INTENT → JOURNEY STAGE →
 * TOPIC → SURFACE → PAGE → COMPETITOR → ACTION →
 * BUSINESS OUTCOME. Deterministic rules first.
 *
 * Research grounding (Sept 2026):
 * - Fan-out is real (Google Search Central: AI Mode and
 *   AI Overviews "may issue multiple related searches
 *   across subtopics and data sources"; patent
 *   US11663201B2 query variant generation; 8 subquery
 *   types per Search Engine Land Apr 2026) but counts
 *   are unpublished ("multitude") — vendor counts are
 *   third-party estimates, never targets.
 * - Fan-out queries are synthetic, probabilistic and
 *   context-dependent: PATTERNS not query targets, no
 *   fake volume, no fan-out scores.
 * - 51% of B2B buyers start in AI chat (G2 Mar 2026);
 *   shortlists form before contact; committees decide.
 *   Hence decision-criteria coverage, not keywords.
 *
 * Rules: reuse ResearchIntent vocabulary (same hint
 * words, documented); need patterns are journey
 * labels, not intent replacements. Every signal is
 * VERIFIED/OBSERVED/INFERRED/ESTIMATED/UNAVAILABLE —
 * never flattened. Inferred questions are hypotheses
 * until observed in connected evidence.
 * =========================================================
 */

export type NeedPattern =
  | 'LEARN'
  | 'UNDERSTAND'
  | 'COMPARE'
  | 'EVALUATE'
  | 'VALIDATE'
  | 'CHOOSE'
  | 'PRICE'
  | 'IMPLEMENT'
  | 'TROUBLESHOOT'
  | 'REPLACE'
  | 'SWITCH'
  | 'BUY'
  | 'LOCAL_FIND'
  | 'TRUST_CHECK'
  | 'RISK_CHECK';

export type JourneyStage =
  | 'AWARENESS'
  | 'PROBLEM_UNDERSTANDING'
  | 'SOLUTION_RESEARCH'
  | 'COMPARISON'
  | 'VALIDATION'
  | 'DECISION'
  | 'PURCHASE'
  | 'IMPLEMENTATION'
  | 'RETENTION_EXPANSION'
  | 'UNKNOWN';

export type FanoutPattern =
  | 'DISAMBIGUATION'
  | 'ENTITY_ATTRIBUTES'
  | 'JOURNEY_STAGE'
  | 'TRUST'
  | 'COMPARISON'
  | 'PERSONALIZATION'
  | 'RECENCY'
  | 'ACTION_RISK'
  | 'ALTERNATIVES'
  | 'IMPLEMENTATION';

export type DecisionCriterion =
  | 'PRICE'
  | 'FEATURES'
  | 'USE_CASE'
  | 'INTEGRATIONS'
  | 'SECURITY'
  | 'REVIEWS'
  | 'TRUST'
  | 'PERFORMANCE'
  | 'LOCALITY'
  | 'COMPATIBILITY'
  | 'IMPLEMENTATION'
  | 'SUPPORT'
  | 'ALTERNATIVES'
  | 'RISK';

export type CoverageState =
  | 'COVERED'
  | 'PARTIAL'
  | 'MISSING'
  | 'UNAVAILABLE';

export type DemandGap =
  | 'MISSING_DECISION_INFORMATION'
  | 'MISSING_COMPARISON_INFORMATION'
  | 'MISSING_TRUST_INFORMATION'
  | 'MISSING_PRICE_INFORMATION'
  | 'MISSING_IMPLEMENTATION_INFORMATION'
  | 'MISSING_ALTERNATIVE_INFORMATION'
  | 'MISSING_LOCAL_INFORMATION'
  | 'MISSING_AI_CITATION'
  | 'MISSING_GOOGLE_VISIBILITY'
  | 'MISSING_OUTCOME_DATA';

export type QuestionFamily =
  | 'WHAT'
  | 'WHY'
  | 'HOW'
  | 'WHICH'
  | 'HOW_MUCH'
  | 'WHO'
  | 'WHERE'
  | 'WHEN'
  | 'ALTERNATIVES'
  | 'COMPARISON'
  | 'RISK'
  | 'TRUST';

export const CANNOT_MEASURE: readonly string[] = [
  'Fan-out queries are synthetic and probabilistic; inferred patterns are hypotheses, not observed queries.',
  'Not every inferred need is a real customer query; inference upgrades only on connected observation.',
  'Query and prompt volumes may be unavailable; no fake demand is created.',
  'Customer CRM data may be unavailable; revenue linkage may be sparse.',
  'Third-party evidence may be incomplete; absence of evidence is not proof of absence.',
];

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function norm(value: unknown): string {
  return ` ${clean(value).toLowerCase()} `;
}

/* Hint vocabulary mirrors ResearchIntent hints
 * (keyword-research.service.ts COMPARISON/COMMERCIAL/
 * TRANSACTIONAL/PROBLEM/LOCAL lists) — same words,
 * journey labels instead of intent replacement. */
function includesAny(
  haystack: string,
  needles: string[],
): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

/* ---------- query → need + journey ---------- */

export interface QueryClassification {
  need: NeedPattern;
  journey: JourneyStage;
  evidence: 'INFERRED';
}

export function classifyQuery(
  query: string,
): QueryClassification {
  const text = norm(query);
  if (
    includesAny(text, [
      'near me',
      'nearby',
      'close by',
      'in my area',
    ])
  )
    return { need: 'LOCAL_FIND', journey: 'SOLUTION_RESEARCH', evidence: 'INFERRED' };
  if (
    includesAny(text, [
      ' vs ',
      ' versus ',
      ' vs. ',
      'compare',
      'comparison',
      'better than',
    ])
  )
    return { need: 'COMPARE', journey: 'COMPARISON', evidence: 'INFERRED' };
  if (
    includesAny(text, [
      'alternative',
      'instead of',
      'replace ',
      'replacement',
      'switch from',
      'migrate from',
      'migration from',
    ])
  )
    return { need: 'SWITCH', journey: 'DECISION', evidence: 'INFERRED' };
  if (
    includesAny(text, [
      'pricing',
      'price',
      'cost',
      'how much',
      'quote',
      'discount',
      'deal',
    ])
  )
    return { need: 'PRICE', journey: 'DECISION', evidence: 'INFERRED' };
  if (
    includesAny(text, [
      'buy',
      'purchase',
      'order',
      'checkout',
      'subscribe',
      'sign up',
      'signup',
      'book now',
    ])
  )
    return { need: 'BUY', journey: 'PURCHASE', evidence: 'INFERRED' };
  if (
    includesAny(text, [
      'how to fix',
      'how to solve',
      'troubleshoot',
      'not working',
      'error',
      'problem',
      'issue',
      'mistake',
    ])
  )
    return { need: 'TROUBLESHOOT', journey: 'RETENTION_EXPANSION', evidence: 'INFERRED' };
  if (
    includesAny(text, [
      'how to',
      'how do i',
      'guide',
      'tutorial',
      'implement',
      'setup',
      'set up',
      'install',
      'onboard',
    ])
  )
    return { need: 'IMPLEMENT', journey: 'IMPLEMENTATION', evidence: 'INFERRED' };
  if (
    includesAny(text, [
      'review',
      'reviews',
      'rating',
      'testimonial',
      'trust',
      'legit',
      'scam',
      'reliable',
    ])
  )
    return { need: 'TRUST_CHECK', journey: 'VALIDATION', evidence: 'INFERRED' };
  if (
    includesAny(text, [
      'risk',
      'risks',
      'safe',
      'security',
      'privacy',
      'compliance',
      'downside',
      'concern',
    ])
  )
    return { need: 'RISK_CHECK', journey: 'VALIDATION', evidence: 'INFERRED' };
  if (
    includesAny(text, [
      'best ',
      'top ',
      'which ',
      'recommend',
      'evaluation',
      'evaluate',
    ])
  )
    return { need: 'EVALUATE', journey: 'SOLUTION_RESEARCH', evidence: 'INFERRED' };
  if (
    includesAny(text, [
      'what is',
      "what's",
      'what are',
      'define',
      'meaning of',
      'explained',
    ])
  )
    return { need: 'LEARN', journey: 'AWARENESS', evidence: 'INFERRED' };
  if (
    includesAny(text, [
      'why ',
      'how does',
      'understand',
    ])
  )
    return { need: 'UNDERSTAND', journey: 'PROBLEM_UNDERSTANDING', evidence: 'INFERRED' };
  if (
    includesAny(text, [
      'validate',
      'verify',
      'proof',
      'case stud',
      'results',
    ])
  )
    return { need: 'VALIDATE', journey: 'VALIDATION', evidence: 'INFERRED' };
  if (
    includesAny(text, [
      'choose',
      'choosing',
      'select',
      'decision',
      'should i',
    ])
  )
    return { need: 'CHOOSE', journey: 'DECISION', evidence: 'INFERRED' };
  return { need: 'UNDERSTAND', journey: 'UNKNOWN', evidence: 'INFERRED' };
}

/* ---------- fan-out patterns (inferred) ---------- */

export function detectFanoutPatterns(
  query: string,
): FanoutPattern[] {
  const text = norm(query);
  const patterns = new Set<FanoutPattern>();
  if (
    includesAny(text, [' vs ', 'best ', 'top ', 'which ']) ||
    text.trim().split(/\s+/).length <= 3
  )
    patterns.add('DISAMBIGUATION');
  if (
    includesAny(text, [
      'feature',
      'spec',
      'price',
      'pricing',
      'cost',
      'plan',
    ])
  )
    patterns.add('ENTITY_ATTRIBUTES');
  if (
    includesAny(text, [
      'how to',
      'guide',
      'compare',
      'review',
      'buy',
      'implement',
    ])
  )
    patterns.add('JOURNEY_STAGE');
  if (
    includesAny(text, [
      'review',
      'trust',
      'legit',
      'scam',
      'rating',
    ])
  )
    patterns.add('TRUST');
  if (includesAny(text, [' vs ', 'compare', 'best ', 'alternative']))
    patterns.add('COMPARISON');
  if (
    includesAny(text, [
      'for small',
      'for enterprise',
      'for me',
      'near me',
      'my ',
    ])
  )
    patterns.add('PERSONALIZATION');
  if (
    includesAny(text, [
      '2024',
      '2025',
      '2026',
      'latest',
      'new',
      'update',
    ])
  )
    patterns.add('RECENCY');
  if (
    includesAny(text, [
      'risk',
      'safe',
      'migrat',
      'switch',
      'cancel',
    ])
  )
    patterns.add('ACTION_RISK');
  if (
    includesAny(text, [
      'alternative',
      'instead',
      'replace',
      'competitor',
    ])
  )
    patterns.add('ALTERNATIVES');
  if (
    includesAny(text, [
      'implement',
      'setup',
      'install',
      'migrat',
      'onboard',
    ])
  )
    patterns.add('IMPLEMENTATION');
  return [...patterns];
}

/* ---------- question families ---------- */

export function questionFamily(
  query: string,
): QuestionFamily | null {
  const text = norm(query);
  if (/ what /.test(text)) return 'WHAT';
  if (/ why /.test(text)) return 'WHY';
  if (/ how /.test(text)) return text.includes('much') ? 'HOW_MUCH' : 'HOW';
  if (/ which /.test(text)) return 'WHICH';
  if (/ who /.test(text)) return 'WHO';
  if (/ where /.test(text)) return 'WHERE';
  if (/ when /.test(text)) return 'WHEN';
  if (/alternative|instead|replace/.test(text)) return 'ALTERNATIVES';
  if (/ vs |compar|best |top /.test(text)) return 'COMPARISON';
  if (/risk|safe|scam/.test(text)) return 'RISK';
  if (/trust|review|legit|rating/.test(text)) return 'TRUST';
  return null;
}

/* ---------- decision criteria ---------- */

const CRITERION_HINTS: Record<DecisionCriterion, string[]> =
  {
    PRICE: ['price', 'pricing', 'cost', 'how much', 'quote', 'plan'],
    FEATURES: ['feature', 'functionality', 'capabilit'],
    USE_CASE: ['use case', 'for small', 'for enterprise', 'for real estate', 'for agencies'],
    INTEGRATIONS: ['integration', 'integrate', 'api', 'zapier', 'connect'],
    SECURITY: ['security', 'secure', 'soc', 'compliance', 'gdpr', 'privacy'],
    REVIEWS: ['review', 'rating', 'testimonial', 'g2', 'capterra'],
    TRUST: ['trust', 'legit', 'reliable', 'reputable'],
    PERFORMANCE: ['performance', 'speed', 'fast', 'reliable uptime', 'sla'],
    LOCALITY: ['near me', 'nearby', 'local', 'location', 'city'],
    COMPATIBILITY: ['compatible', 'works with', 'support for', 'requirement'],
    IMPLEMENTATION: ['implement', 'setup', 'onboard', 'migrat', 'deploy'],
    SUPPORT: ['support', 'service', 'help', 'documentation', 'community'],
    ALTERNATIVES: ['alternative', 'vs', 'compare', 'instead'],
    RISK: ['risk', 'downside', 'concern', 'safe'],
  };

export function detectCriteria(
  texts: string[],
): DecisionCriterion[] {
  const joined = norm(texts.join(' '));
  return (Object.keys(CRITERION_HINTS) as DecisionCriterion[]).filter(
    (criterion) =>
      includesAny(joined, CRITERION_HINTS[criterion]),
  );
}

export function criterionCoverage(
  criterion: DecisionCriterion,
  pageEvidence: boolean | null,
  citationEvidence: boolean | null,
): CoverageState {
  if (pageEvidence === null && citationEvidence === null)
    return 'UNAVAILABLE';
  if (pageEvidence === true) return 'COVERED';
  if (citationEvidence === true) return 'PARTIAL';
  return 'MISSING';
}

/* ---------- gaps → existing action vocabulary ---------- */

export function mapDemandGapToAction(
  gap: DemandGap,
): 'CREATE' | 'IMPROVE' | 'CONSOLIDATE' | 'OPTIMIZE' | 'MONITOR' {
  switch (gap) {
    case 'MISSING_DECISION_INFORMATION':
    case 'MISSING_ALTERNATIVE_INFORMATION':
    case 'MISSING_LOCAL_INFORMATION':
      return 'CREATE';
    case 'MISSING_COMPARISON_INFORMATION':
    case 'MISSING_TRUST_INFORMATION':
    case 'MISSING_PRICE_INFORMATION':
    case 'MISSING_IMPLEMENTATION_INFORMATION':
      return 'IMPROVE';
    case 'MISSING_AI_CITATION':
      return 'OPTIMIZE';
    case 'MISSING_GOOGLE_VISIBILITY':
      return 'IMPROVE';
    case 'MISSING_OUTCOME_DATA':
      return 'MONITOR';
    default:
      return 'MONITOR';
  }
}

export function needKey(
  need: NeedPattern,
  journey: JourneyStage,
  topic: string,
): string {
  return [need, journey, clean(topic).toLowerCase()]
    .join('|');
}

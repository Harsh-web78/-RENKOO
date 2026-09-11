/*
 * =========================================================
 * SEARCH GROWTH OUTCOME LOOP 1.0 — pure functions
 * (Phase 37).
 *
 * Closes EXECUTION → VERIFICATION → MEASUREMENT →
 * OUTCOME → NEXT DECISION over existing evidence.
 * Composition only: no tables, no scores, no
 * forecasting, no causal attribution.
 *
 * Never confused:
 * - EXECUTION with OUTCOME
 * - OBSERVATION with CAUSATION
 * - AI CITATION with AI RECOMMENDATION
 * - AI VISIBILITY with AI TRAFFIC
 * - TRAFFIC with REVENUE
 * =========================================================
 */

export type OutcomeSignal =
  | 'NOT_MEASURED'
  | 'MEASURING'
  | 'OBSERVED_POSITIVE_CHANGE'
  | 'OBSERVED_NEGATIVE_CHANGE'
  | 'NO_MATERIAL_CHANGE'
  | 'MIXED_SIGNAL'
  | 'INSUFFICIENT_DATA'
  | 'CONFLICTING_SIGNAL'
  | 'UNAVAILABLE'
  | 'TOO_EARLY_TO_JUDGE';

export type OutcomeEvidence =
  | 'EXECUTED'
  | 'VERIFIED'
  | 'OBSERVED_CHANGE'
  | 'TEMPORAL_ASSOCIATION'
  | 'ATTRIBUTED'
  | 'INFERRED'
  | 'NO_MATERIAL_CHANGE'
  | 'INSUFFICIENT_DATA'
  | 'CONFLICTING'
  | 'UNAVAILABLE';

export type MeasureWindow = 7 | 14 | 28 | 90;

export type AiPresence =
  | 'CITATION_PRESENT'
  | 'RECOMMENDATION_PRESENT'
  | 'COMPETITOR_RECOMMENDED'
  | 'CITATION_WITH_COMPETITOR_PREFERENCE'
  | 'NO_AI_PRESENCE'
  | 'UNKNOWN';

export type NextDecision =
  | 'PROTECT'
  | 'CONTINUE'
  | 'IMPROVE'
  | 'CREATE'
  | 'CONSOLIDATE'
  | 'FIX'
  | 'CONNECT'
  | 'STRENGTHEN'
  | 'RESPOND'
  | 'VERIFY'
  | 'MEASURE'
  | 'INVESTIGATE'
  | 'WAIT';

export type AgenticEvidence =
  | 'PRICE_ACCESSIBLE'
  | 'CONTACT_PATH_ACCESSIBLE'
  | 'PRODUCT_INFORMATION_ACCESSIBLE'
  | 'STRUCTURED_DATA_PRESENT'
  | 'FORM_ACCESSIBLE'
  | 'UNVERIFIED';

export const OUTCOME_SIGNALS: OutcomeSignal[] = [
  'NOT_MEASURED',
  'MEASURING',
  'OBSERVED_POSITIVE_CHANGE',
  'OBSERVED_NEGATIVE_CHANGE',
  'NO_MATERIAL_CHANGE',
  'MIXED_SIGNAL',
  'INSUFFICIENT_DATA',
  'CONFLICTING_SIGNAL',
  'UNAVAILABLE',
  'TOO_EARLY_TO_JUDGE',
];

export const MEASURE_WINDOWS: MeasureWindow[] = [7, 14, 28, 90];

export const MAX_OUTCOME_SIGNALS = 5;
export const MAX_OUTCOME_ACTIONS = 10;

/* ---------- before / after (§5) ---------- */

export interface BeforeAfter {
  before: number | null;
  after: number | null;
  delta: number | null;
  direction: 'UP' | 'DOWN' | 'FLAT' | 'UNKNOWN';
  baseline: 'AVAILABLE' | 'BASELINE_UNAVAILABLE';
  evidenceState: string;
  window: string;
}

export function beforeAfter(input: {
  before: unknown;
  after: unknown;
  evidenceState?: string;
  window?: string;
  lowerIsBetter?: boolean;
}): BeforeAfter {
  const before =
    input.before === null || input.before === undefined
      ? null
      : Number(input.before);
  const after =
    input.after === null || input.after === undefined
      ? null
      : Number(input.after);
  const validBefore =
    before !== null && Number.isFinite(before);
  const validAfter = after !== null && Number.isFinite(after);
  if (!validBefore || !validAfter) {
    return {
      before: validBefore ? (before as number) : null,
      after: validAfter ? (after as number) : null,
      delta: null,
      direction: 'UNKNOWN',
      baseline: 'BASELINE_UNAVAILABLE',
      evidenceState: input.evidenceState ?? 'UNAVAILABLE',
      window: input.window ?? 'window unsupported by source',
    };
  }
  /* For rank-like metrics lower is better; for
   * traffic-like metrics higher is better. Delta is
   * always after − before; direction interprets it. */
  const delta = (after as number) - (before as number);
  const lowerIsBetter = input.lowerIsBetter ?? false;
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  const declined = lowerIsBetter ? delta > 0 : delta < 0;
  return {
    before: before as number,
    after: after as number,
    delta,
    direction: improved ? 'UP' : declined ? 'DOWN' : 'FLAT',
    baseline: 'AVAILABLE',
    evidenceState: input.evidenceState ?? 'OBSERVED',
    window: input.window ?? 'source window',
  };
}

/* ---------- measurement windows (§7) ---------- */

export function normalizeWindow(
  days: unknown,
): MeasureWindow | null {
  const n = Math.floor(Number(days));
  if (n === 7 || n === 14 || n === 28 || n === 90) {
    return n as MeasureWindow;
  }
  return null;
}

export interface WindowReadiness {
  ready: boolean;
  state: 'READY' | 'TOO_EARLY_TO_JUDGE';
  note: string;
}

export function windowReadiness(input: {
  verifiedAtIso: string | null;
  windowDays: number;
  nowIso?: string;
}): WindowReadiness {
  if (!input.verifiedAtIso) {
    return {
      ready: false,
      state: 'TOO_EARLY_TO_JUDGE',
      note: 'No verification timestamp — measurement cannot start. This is not failure.',
    };
  }
  const verified = new Date(input.verifiedAtIso).getTime();
  const now = new Date(
    input.nowIso ?? new Date().toISOString(),
  ).getTime();
  if (!Number.isFinite(verified) || !Number.isFinite(now)) {
    return {
      ready: false,
      state: 'TOO_EARLY_TO_JUDGE',
      note: 'Timestamps unclear — judgment withheld, never guessed.',
    };
  }
  const elapsed = (now - verified) / (24 * 60 * 60 * 1000);
  if (elapsed < input.windowDays) {
    return {
      ready: false,
      state: 'TOO_EARLY_TO_JUDGE',
      note: `Only ${Math.max(0, Math.floor(elapsed))} of ${input.windowDays} days elapsed since verification — too early to judge. This is not failure.`,
    };
  }
  return {
    ready: true,
    state: 'READY',
    note: 'Window elapsed — evaluation permitted, association only.',
  };
}

/* ---------- outcome classification (§8/§15) ---------- */

export function classifyOutcome(input: {
  directions: Array<'UP' | 'DOWN' | 'FLAT' | 'UNKNOWN'>;
  conflictingSources: boolean;
  dataSufficient: boolean;
  measured: boolean;
}): OutcomeSignal {
  if (!input.measured) return 'NOT_MEASURED';
  if (input.conflictingSources) return 'CONFLICTING_SIGNAL';
  if (!input.dataSufficient) return 'INSUFFICIENT_DATA';
  const known = input.directions.filter((d) => d !== 'UNKNOWN');
  if (known.length === 0) return 'INSUFFICIENT_DATA';
  const ups = known.filter((d) => d === 'UP').length;
  const downs = known.filter((d) => d === 'DOWN').length;
  if (ups > 0 && downs > 0) return 'MIXED_SIGNAL';
  if (ups > 0) return 'OBSERVED_POSITIVE_CHANGE';
  if (downs > 0) return 'OBSERVED_NEGATIVE_CHANGE';
  return 'NO_MATERIAL_CHANGE';
}

export function interpretationFor(
  signal: OutcomeSignal,
): string {
  switch (signal) {
    case 'OBSERVED_POSITIVE_CHANGE':
      return 'Target visibility improved during the measurement window. Observed change — not proof the work caused it.';
    case 'OBSERVED_NEGATIVE_CHANGE':
      return 'Decline observed during the measurement window. Investigate before acting; cause unknown.';
    case 'NO_MATERIAL_CHANGE':
      return 'No material change was observed in the available measurement window.';
    case 'MIXED_SIGNAL':
      return 'Mixed signals across metrics (e.g. rank improved while CTR declined). No single conclusion.';
    case 'INSUFFICIENT_DATA':
      return 'Not enough data is available to evaluate this change.';
    case 'TOO_EARLY_TO_JUDGE':
      return 'The work was verified, but the measurement window is not yet sufficient. Not failure.';
    case 'CONFLICTING_SIGNAL':
      return 'Sources disagree; no outcome conclusion is presented.';
    case 'MEASURING':
      return 'Measurement in progress — judgment withheld.';
    case 'UNAVAILABLE':
      return 'Outcome source unavailable — shown as unavailable, never zero.';
    default:
      return 'Not yet measured.';
  }
}

/* ---------- causality wording (§9) ---------- */

export function afterChange(input: {
  metric: string;
  movement: string;
}): string {
  return `${input.metric} ${input.movement} after the change. Temporal association only — never “caused by”.`;
}

export function observedDuring(
  metric: string,
  window: string,
): string {
  return `${metric} during the measurement window (${window}). Observed outcome, not causal proof.`;
}

/* ---------- AI presence (§11/§12) ----------
 * Citation is never upgraded to recommendation. */

export function aiPresence(input: {
  cited: boolean | null;
  recommended: boolean | null;
  competitorRecommended: boolean | null;
  providerSupports: boolean;
}): AiPresence {
  if (!input.providerSupports) return 'UNKNOWN';
  if (input.recommended === true) return 'RECOMMENDATION_PRESENT';
  if (
    input.cited === true &&
    input.competitorRecommended === true
  ) {
    return 'CITATION_WITH_COMPETITOR_PREFERENCE';
  }
  if (
    input.cited !== true &&
    input.competitorRecommended === true
  ) {
    return 'COMPETITOR_RECOMMENDED';
  }
  if (input.cited === true) return 'CITATION_PRESENT';
  if (input.cited === false && input.recommended === false) {
    return 'NO_AI_PRESENCE';
  }
  return 'UNKNOWN';
}

export function aiLayerNote(input: {
  mention: string;
  citation: string;
  referral: string;
  conversion: string;
  revenue: string;
}): string[] {
  return [
    `MENTION: ${input.mention}`,
    `CITATION: ${input.citation}`,
    `AI REFERRAL: ${input.referral}`,
    `CONVERSION: ${input.conversion}`,
    `REVENUE: ${input.revenue}`,
    'Layers never combined into one number.',
  ];
}

/* ---------- agentic readiness (§13) ----------
 * Evidence checklist, never a score. */

export function agenticEvidence(input: {
  priceAccessible: boolean | null;
  contactAccessible: boolean | null;
  productInfoAccessible: boolean | null;
  structuredData: boolean | null;
  formAccessible: boolean | null;
}): AgenticEvidence[] {
  const out: AgenticEvidence[] = [];
  if (input.priceAccessible === true) out.push('PRICE_ACCESSIBLE');
  if (input.contactAccessible === true) {
    out.push('CONTACT_PATH_ACCESSIBLE');
  }
  if (input.productInfoAccessible === true) {
    out.push('PRODUCT_INFORMATION_ACCESSIBLE');
  }
  if (input.structuredData === true) {
    out.push('STRUCTURED_DATA_PRESENT');
  }
  if (input.formAccessible === true) out.push('FORM_ACCESSIBLE');
  if (out.length === 0) return ['UNVERIFIED'];
  return out;
}

export function agentCapabilityNote(
  evidence: AgenticEvidence[],
): string {
  if (evidence.includes('UNVERIFIED')) {
    return 'Agent capabilities UNVERIFIED — no discovery/understand/access/navigate/complete claim.';
  }
  return `Observed readiness evidence: ${evidence.join(', ')}. Capabilities described per evidence, never scored.`;
}

/* ---------- next decision rules (§16/§17) ----------
 * Deterministic interpretations, not predictions. */

export function nextDecisionFor(input: {
  signal: OutcomeSignal;
  targetAchieved: boolean | null;
  verified: boolean;
}): NextDecision {
  switch (input.signal) {
    case 'OBSERVED_POSITIVE_CHANGE':
      if (input.targetAchieved === true) return 'PROTECT';
      return 'CONTINUE';
    case 'OBSERVED_NEGATIVE_CHANGE':
      return 'INVESTIGATE';
    case 'NO_MATERIAL_CHANGE':
      return 'INVESTIGATE';
    case 'MIXED_SIGNAL':
      return 'INVESTIGATE';
    case 'INSUFFICIENT_DATA':
      return 'MEASURE';
    case 'CONFLICTING_SIGNAL':
      return 'INVESTIGATE';
    case 'TOO_EARLY_TO_JUDGE':
      return 'WAIT';
    case 'MEASURING':
      return 'WAIT';
    case 'NOT_MEASURED':
      return input.verified ? 'MEASURE' : 'VERIFY';
    default:
      return 'INVESTIGATE';
  }
}

export function nextDecisionNote(
  decision: NextDecision,
): string {
  return `${decision} — deterministic follow-up to the observed outcome, not a prediction. Routes through the existing Growth Decision Engine; nothing auto-created.`;
}

/* ---------- business hierarchy (§22) ---------- */

const HIERARCHY = [
  'SEARCH VISIBILITY',
  'TRAFFIC',
  'ENGAGEMENT',
  'LEAD',
  'QUALIFIED LEAD',
  'REVENUE',
] as const;

export function businessHierarchy(
  present: Partial<Record<(typeof HIERARCHY)[number], string | null>>,
): string[] {
  return HIERARCHY.map((layer) => {
    const value = present[layer];
    return value ? `${layer}: ${value}` : `${layer}: missing edge`;
  });
}

/* ---------- headline signals (§23) ----------
 * Maximum 3–5, work-completed framing. */

export interface HeadlineSignal {
  work: string;
  changed: string;
  unchanged: string;
  unknown: string;
  next: string;
}

export function headline(input: {
  workTitle: string;
  changed: string[];
  unchanged: string[];
  unknown: string[];
  nextDecision: NextDecision;
}): HeadlineSignal {
  return {
    work: `WORK COMPLETED: ${input.workTitle}.`,
    changed:
      input.changed.length > 0
        ? `WHAT CHANGED: ${input.changed.join('; ')}.`
        : 'WHAT CHANGED: nothing material in the measured window.',
    unchanged:
      input.unchanged.length > 0
        ? `WHAT DID NOT CHANGE: ${input.unchanged.join('; ')}.`
        : 'WHAT DID NOT CHANGE: nothing recorded.',
    unknown:
      input.unknown.length > 0
        ? `WHAT IS UNKNOWN: ${input.unknown.join('; ')}.`
        : 'WHAT IS UNKNOWN: nothing material.',
    next: `WHAT NEXT: ${input.nextDecision} — ${nextDecisionNote(input.nextDecision)}`,
  };
}

/* ---------- agency reporting (§24) ---------- */

export function agencyOutcome(input: {
  completed: string;
  verified: string;
  outcome: string;
  status: OutcomeSignal;
  next: NextDecision;
}): string[] {
  return [
    `COMPLETED: ${input.completed}.`,
    `VERIFIED: ${input.verified}.`,
    `OUTCOME: ${input.outcome}.`,
    `STATUS: ${input.status} — ${interpretationFor(input.status)}`,
    `NEXT: ${input.next} — ${nextDecisionNote(input.next)}`,
  ];
}

/* ---------- determinism ---------- */

export function outcomeKey(input: {
  organizationId: string;
  websiteId: string;
  actionId: string;
  windowDays: number;
}): string {
  return [
    String(input.organizationId ?? '').trim(),
    String(input.websiteId ?? '').trim(),
    String(input.actionId ?? '').trim(),
    String(input.windowDays),
  ].join('|');
}

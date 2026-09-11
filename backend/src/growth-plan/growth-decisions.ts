/*
 * =========================================================
 * UNIFIED GROWTH DECISION ENGINE 1.0 — pure functions
 * (Phase 34).
 *
 * Composition / decision layer over existing RENKOO
 * intelligence. NOT a recommendation engine, NOT a
 * score, NOT a roadmap database, NOT an action system,
 * NOT an agent, NOT attribution.
 *
 * Core flow: EVIDENCE → DECISION → PRIORITY ORDER →
 * EXISTING ACTION → EXECUTION → VERIFICATION →
 * MEASUREMENT → LEARNING.
 *
 * Rules:
 * - Decision ORDERING, never a score. The 12-level
 *   hierarchy below is compared lexicographically —
 *   nothing is mathematically combined.
 * - Missing evidence reduces or blocks a decision;
 *   never fabricated.
 * - Conflicts are surfaced (SIGNAL_CONFLICT), never
 *   hidden.
 * - Existing TODO/IN_PROGRESS/DONE/DISMISSED actions
 *   are reused, never duplicated; DISMISSED is never
 *   auto-resurrected.
 * - Evidence states never upgrade silently
 *   (INFERRED/MODELED/ESTIMATED/ASSOCIATION stay what
 *   they are; association is never causation).
 * =========================================================
 */

import { createHash } from 'node:crypto';

export type DecisionType =
  | 'PROTECT'
  | 'IMPROVE'
  | 'CREATE'
  | 'CONSOLIDATE'
  | 'FIX'
  | 'CONNECT'
  | 'STRENGTHEN'
  | 'RESPOND'
  | 'VERIFY'
  | 'MEASURE'
  | 'INVESTIGATE';

export type PriorityBand = 'HIGH' | 'MEDIUM' | 'LOW';

export type DecisionStatus =
  | 'READY'
  | 'NEEDS_VERIFICATION'
  | 'NEEDS_MEASUREMENT'
  | 'INVESTIGATE'
  | 'WAIT'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'NO_MATERIAL_DECISION';

export type DecisionEvidenceState =
  | 'OBSERVED'
  | 'ATTRIBUTED'
  | 'MODELED'
  | 'INFERRED'
  | 'UNAVAILABLE'
  | 'UNKNOWN';

export type ActionReuse =
  | 'EXISTING_ACTION'
  | 'VERIFY_EXISTING_ACTION'
  | 'MEASURE_EXISTING_ACTION'
  | 'NO_ACTION_YET'
  | 'DISMISSED_LEFT_ALONE';

export const DECISION_TYPES: DecisionType[] = [
  'PROTECT',
  'IMPROVE',
  'CREATE',
  'CONSOLIDATE',
  'FIX',
  'CONNECT',
  'STRENGTHEN',
  'RESPOND',
  'VERIFY',
  'MEASURE',
  'INVESTIGATE',
];

export const PLAN_SECTIONS = [
  'NOW',
  'NEXT',
  'WAIT',
  'BLOCKED',
  'COMPLETED',
] as const;

export type PlanSection = (typeof PLAN_SECTIONS)[number];

export const MAX_NOW = 3;
export const MAX_NEXT = 10;
export const MAX_WAIT = 20;
export const MAX_BLOCKED = 20;
export const MAX_COMPLETED = 10;
export const MAX_EVIDENCE_PER_DECISION = 12;

/* ---------- decision input (composition stub) ---------- */

export interface DecisionSignals {
  hasRevenueRelevance: boolean;
  revenueVerified: boolean;
  existingPriority: PriorityBand | null;
  executionDependency: 'VERIFY_PENDING' | 'MEASURE_PENDING' | 'BLOCKED_DEP' | null;
  customerNeedRelevance: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  searchOpportunity: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  aiOpportunity: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  competitiveEvidence: boolean;
  contentEvidence: boolean;
  technicalEvidence: boolean;
  internalLinkEvidence: boolean;
  changeUrgency: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  priorityBand: PriorityBand;
  evidenceCompleteness: number;
}

export interface GrowthDecision {
  fingerprint: string;
  decisionType: DecisionType;
  title: string;
  summary: string;
  priorityBand: PriorityBand;
  existingPriority: PriorityBand | null;
  status: DecisionStatus;
  primaryEvidence: string;
  supportingEvidence: string[];
  evidenceState: DecisionEvidenceState;
  page: string | null;
  keyword: string | null;
  customerNeed: string | null;
  existingRecommendationId: string | null;
  existingActionId: string | null;
  existingActionStatus: string | null;
  actionReuse: ActionReuse;
  verificationState: string | null;
  measurementState: string | null;
  nextAction: string;
  blockedReason: string | null;
  unavailableReason: string | null;
  conflict: SignalConflict | null;
  whyFirst: string;
  trace: string[];
  section: PlanSection;
}

export interface SignalConflict {
  what: string;
  sources: string[];
  known: string;
  unknown: string;
  safeNextStep: string;
}

/* ---------- deterministic fingerprint (§5) ---------- */

export function decisionFingerprint(input: {
  organizationId: string;
  websiteId: string;
  decisionType: string;
  keyword: string | null;
  page: string | null;
  recommendationId: string | null;
  actionId: string | null;
}): string {
  return createHash('sha256')
    .update(
      [
        String(input.organizationId ?? '').trim(),
        String(input.websiteId ?? '').trim(),
        String(input.decisionType ?? '').trim().toUpperCase(),
        String(input.keyword ?? '').trim().toLowerCase(),
        String(input.page ?? '').trim().toLowerCase(),
        String(input.recommendationId ?? '').trim(),
        String(input.actionId ?? '').trim(),
      ].join('|'),
    )
    .digest('hex')
    .slice(0, 32);
}

/* ---------- priority helpers ---------- */

export function normalizePriority(
  value: unknown,
): PriorityBand {
  const v = String(value ?? '').trim().toUpperCase();
  if (v === 'HIGH' || v === 'CRITICAL') return 'HIGH';
  if (v === 'MEDIUM') return 'MEDIUM';
  return 'LOW';
}

function bandRank(band: PriorityBand | null): number {
  if (band === 'HIGH') return 0;
  if (band === 'MEDIUM') return 1;
  if (band === 'LOW') return 2;
  return 3;
}

function levelRank(
  level: 'HIGH' | 'MEDIUM' | 'LOW' | null,
): number {
  if (level === 'HIGH') return 0;
  if (level === 'MEDIUM') return 1;
  if (level === 'LOW') return 2;
  return 3;
}

/* ---------- 12-level deterministic ordering (§8) ----------
 * Returns a rank tuple compared lexicographically.
 * Lower wins at every level. No arithmetic combination,
 * no score — WHY_FIRST explains the winning levels. */

export function orderRank(s: DecisionSignals): number[] {
  return [
    s.hasRevenueRelevance ? (s.revenueVerified ? 0 : 1) : 2,
    bandRank(s.existingPriority),
    s.executionDependency === null
      ? 1
      : s.executionDependency === 'VERIFY_PENDING'
        ? 0
        : 2,
    levelRank(s.customerNeedRelevance),
    levelRank(s.searchOpportunity),
    levelRank(s.aiOpportunity),
    s.competitiveEvidence ? 0 : 1,
    s.contentEvidence || s.technicalEvidence || s.internalLinkEvidence
      ? 0
      : 1,
    levelRank(s.changeUrgency),
    bandRank(s.priorityBand),
    s.evidenceCompleteness >= 3 ? 0 : 1,
    0,
  ];
}

export function compareDecisions(
  a: DecisionSignals,
  b: DecisionSignals,
): number {
  const ra = orderRank(a);
  const rb = orderRank(b);
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] !== rb[i]) return ra[i] - rb[i];
  }
  return 0;
}

const ORDER_LEVEL_NAMES = [
  'verified business/revenue relevance',
  'existing high-priority recommendation',
  'execution/verification dependency',
  'customer need relevance',
  'search visibility opportunity',
  'AI visibility opportunity',
  'competitive evidence',
  'content/technical/internal-link evidence',
  'freshness/change urgency',
  'existing priority band',
  'evidence completeness',
  'stable deterministic tie-break',
];

export function whyFirst(
  winner: DecisionSignals,
  loser: DecisionSignals,
): string {
  const a = orderRank(winner);
  const b = orderRank(loser);
  const reasons: string[] = [];
  for (let i = 0; i < a.length - 1; i++) {
    if (a[i] < b[i]) {
      reasons.push(ORDER_LEVEL_NAMES[i]);
      if (reasons.length >= 3) break;
    }
  }
  if (reasons.length === 0) {
    return 'Ordered by stable deterministic tie-break on otherwise equal evidence.';
  }
  return `Prioritized by ${reasons.join(', ')}.`;
}

/* ---------- decision gating (§9) ---------- */

export interface Availability {
  gsc: boolean;
  aiVisibility: boolean;
  ga4: boolean;
  revenueLinkage: boolean;
  crawl: boolean;
  serp: boolean;
  competitor: boolean;
}

export interface GateResult {
  blocked: string[];
  unavailable: string[];
  downgradeToInvestigate: boolean;
}

export function gateDecision(
  availability: Availability,
  claims: {
    searchPerformance: boolean;
    aiLoss: boolean;
    trafficRevenue: boolean;
    revenue: boolean;
    technical: boolean;
    serp: boolean;
    competitorAdvantage: boolean;
  },
): GateResult {
  const blocked: string[] = [];
  const unavailable: string[] = [];
  if (claims.searchPerformance && !availability.gsc) {
    blocked.push('No GSC — no search-performance claim.');
  }
  if (claims.aiLoss && !availability.aiVisibility) {
    blocked.push('No AI visibility data — no AI-loss claim.');
  }
  if (claims.trafficRevenue && !availability.ga4) {
    blocked.push('No GA4 — no traffic/revenue claim.');
  }
  if (claims.revenue && !availability.revenueLinkage) {
    blocked.push('No revenue linkage — no revenue claim.');
  }
  if (claims.technical && !availability.crawl) {
    blocked.push('No crawl — no technical claim.');
  }
  if (claims.serp && !availability.serp) {
    blocked.push('No SERP — no current SERP claim.');
  }
  if (
    claims.competitorAdvantage &&
    !availability.competitor
  ) {
    blocked.push(
      'No competitor evidence — no competitor advantage claim.',
    );
  }
  if (!availability.gsc) unavailable.push('GSC');
  if (!availability.aiVisibility)
    unavailable.push('AI visibility');
  if (!availability.ga4) unavailable.push('GA4');
  if (!availability.revenueLinkage)
    unavailable.push('Revenue linkage');
  if (!availability.crawl) unavailable.push('Crawl');
  if (!availability.serp) unavailable.push('SERP');
  if (!availability.competitor)
    unavailable.push('Competitor evidence');
  return {
    blocked,
    unavailable,
    downgradeToInvestigate: blocked.length > 0,
  };
}

/* ---------- conflict handling (§10) ---------- */

export function signalConflict(input: {
  what: string;
  sources: string[];
  known: string;
  unknown: string;
  safeNextStep: string;
}): SignalConflict {
  return {
    what: input.what,
    sources: input.sources,
    known: input.known,
    unknown: input.unknown,
    safeNextStep: input.safeNextStep,
  };
}

export function conflictNote(c: SignalConflict): string {
  return (
    `SIGNAL_CONFLICT: ${c.what} ` +
    `(sources: ${c.sources.join(', ')}). ` +
    `Known: ${c.known} Unknown: ${c.unknown} ` +
    `Safe next step: ${c.safeNextStep}`
  );
}

/* ---------- action reuse (§11) ---------- */

export function mapActionReuse(input: {
  actionId: string | null;
  actionStatus: string | null;
  verificationState: string | null;
  measurementState: string | null;
}): ActionReuse {
  const status = String(input.actionStatus ?? '')
    .trim()
    .toUpperCase();
  if (status === 'DISMISSED') return 'DISMISSED_LEFT_ALONE';
  if (input.actionId && (status === 'TODO' || status === 'IN_PROGRESS')) {
    return 'EXISTING_ACTION';
  }
  if (
    input.actionId &&
    status === 'DONE' &&
    input.verificationState !== 'VERIFIED' &&
    input.verificationState !== 'PARTIALLY_VERIFIED'
  ) {
    return 'VERIFY_EXISTING_ACTION';
  }
  if (
    input.actionId &&
    (input.verificationState === 'VERIFIED' ||
      input.verificationState === 'PARTIALLY_VERIFIED') &&
    input.measurementState !== 'MEASURED'
  ) {
    return 'MEASURE_EXISTING_ACTION';
  }
  if (input.actionId) return 'EXISTING_ACTION';
  return 'NO_ACTION_YET';
}

export function reuseNote(reuse: ActionReuse): string {
  switch (reuse) {
    case 'EXISTING_ACTION':
      return 'An existing action already covers this — reused, never duplicated.';
    case 'VERIFY_EXISTING_ACTION':
      return 'Action is DONE but not verified — verify the live change first.';
    case 'MEASURE_EXISTING_ACTION':
      return 'Action is verified — measure the outcome before new work.';
    case 'DISMISSED_LEFT_ALONE':
      return 'A dismissed action exists — never auto-resurrected.';
    default:
      return 'No existing action — propose through the governed flow.';
  }
}

/* ---------- roadmap kind → decision type (§7/§23) ---------- */

const KIND_TO_DECISION: Record<string, DecisionType> = {
  IMPROVE_PAGE: 'IMPROVE',
  OPTIMIZE_PAGE: 'IMPROVE',
  CREATE_PAGE: 'CREATE',
  CONSOLIDATE_PAGES: 'CONSOLIDATE',
  PROTECT_PAGE: 'PROTECT',
  TRACK_KEYWORD: 'MEASURE',
  BUILD_INTERNAL_SUPPORT: 'CONNECT',
  FIX_TECHNICAL_BLOCKER: 'FIX',
  REFRESH_PAGE: 'IMPROVE',
  MONITOR: 'MEASURE',
};

export function decisionTypeForRoadmapKind(
  kind: unknown,
): DecisionType {
  const v = String(kind ?? '').trim().toUpperCase();
  return KIND_TO_DECISION[v] ?? 'INVESTIGATE';
}

/* ---------- alert trigger → decision type (§22) ---------- */

const ALERT_TO_DECISION: Record<string, DecisionType> = {
  RANK_LOSS: 'RESPOND',
  RANK_GAIN: 'PROTECT',
  TOP_10_EXIT: 'RESPOND',
  TOP_10_ENTRY: 'PROTECT',
  TOP_3_EXIT: 'RESPOND',
  TOP_3_ENTRY: 'PROTECT',
  WRONG_URL: 'INVESTIGATE',
  SERP_FEATURE_LOSS: 'RESPOND',
  SERP_FEATURE_GAIN: 'STRENGTHEN',
  COMPETITOR_MOVEMENT: 'RESPOND',
  AI_VISIBILITY_CHANGE: 'INVESTIGATE',
  GSC_CHANGE: 'INVESTIGATE',
  WEBSITE_CHANGE: 'VERIFY',
  EXECUTION_VERIFIED: 'MEASURE',
};

export function decisionTypeForAlert(
  trigger: unknown,
): DecisionType {
  const v = String(trigger ?? '').trim().toUpperCase();
  return ALERT_TO_DECISION[v] ?? 'INVESTIGATE';
}

/* ---------- rank 1.0 event → decision type (§21) ---------- */

const RANK_EVENT_TO_DECISION: Record<string, DecisionType> = {
  RANK_DECLINED: 'RESPOND',
  SUSTAINED_DECLINE: 'RESPOND',
  LEFT_TOP_10: 'RESPOND',
  RANK_IMPROVED: 'PROTECT',
  SUSTAINED_IMPROVEMENT: 'PROTECT',
  ENTERED_TOP_10: 'PROTECT',
  ENTERED_STRIKING: 'IMPROVE',
  LEFT_STRIKING: 'RESPOND',
  RANK_NEW: 'INVESTIGATE',
  URL_CHANGED: 'INVESTIGATE',
};

export function decisionTypeForRankEvent(
  kind: unknown,
): DecisionType {
  const v = String(kind ?? '').trim().toUpperCase();
  return RANK_EVENT_TO_DECISION[v] ?? 'INVESTIGATE';
}

/* ---------- recommendation type → decision type ---------- */

export function decisionTypeForRecommendation(
  type: unknown,
): DecisionType {
  const v = String(type ?? '').trim().toUpperCase();
  if (/CONSOLIDAT|CANNIBAL/.test(v)) return 'CONSOLIDATE';
  if (/CREATE|CONTENT_GAP/.test(v)) return 'CREATE';
  if (/PROTECT/.test(v)) return 'PROTECT';
  if (/TECHNICAL|BLOCK|FIX/.test(v)) return 'FIX';
  if (/INTERNAL_LINK|ORPHAN|CONNECT/.test(v)) return 'CONNECT';
  if (/TRACK|MONITOR/.test(v)) return 'MEASURE';
  if (/IMPROVE|OPTIMIZ|REFRESH|QUICK_WIN|GROWTH/.test(v)) {
    return 'IMPROVE';
  }
  if (/CITATION|AI_VISIBILITY|PROMPT_GAP|SOURCE_GAP/.test(v)) {
    return 'INVESTIGATE';
  }
  return decisionTypeForRoadmapKind(v);
}

/* ---------- section assignment (§14/§27/§28) ---------- */

export function assignSection(input: {
  blockedReasons: string[];
  waitReasons: string[];
  completed: boolean;
  orderIndex: number;
}): PlanSection {
  if (input.completed) return 'COMPLETED';
  if (input.blockedReasons.length > 0) return 'BLOCKED';
  if (input.waitReasons.length > 0) return 'WAIT';
  if (input.orderIndex < MAX_NOW) return 'NOW';
  if (input.orderIndex < MAX_NOW + MAX_NEXT) return 'NEXT';
  return 'WAIT';
}

export function waitNote(reasons: string[]): string {
  if (reasons.length === 0) return '';
  return `WHY WAITING: ${reasons.join(' ')}`;
}

export function noMaterialDecision(
  reason: string,
): Pick<
  GrowthDecision,
  'status' | 'section' | 'nextAction' | 'unavailableReason'
> {
  return {
    status: 'NO_MATERIAL_DECISION',
    section: 'WAIT',
    nextAction: 'No action proposed — evidence does not support a meaningful decision.',
    unavailableReason: reason,
  };
}

/* ---------- decision trace (§29) ---------- */

const TRACE_EDGES = [
  'Decision',
  'Customer Need',
  'Keyword',
  'Rank',
  'Page',
  'SERP',
  'Recommendation',
  'Action',
  'Verification',
  'Measurement',
  'Revenue',
] as const;

export function buildTrace(
  present: Partial<Record<(typeof TRACE_EDGES)[number], string | null>>,
): string[] {
  return TRACE_EDGES.map((edge) => {
    const value = present[edge];
    return value ? `${edge}: ${value}` : `${edge}: missing edge`;
  });
}

/* ---------- evidence-state guard (§6) ---------- */

export function evidenceGuard(
  from: DecisionEvidenceState,
  to: DecisionEvidenceState,
): boolean {
  /* Upgrades INFERRED/MODELED/ESTIMATED/ASSOCIATION →
   * OBSERVED are never allowed silently (or at all
   * here — they require re-observation upstream). */
  if (
    to === 'OBSERVED' &&
    (from === 'INFERRED' ||
      from === 'UNKNOWN' ||
      from === 'UNAVAILABLE')
  ) {
    return false;
  }
  if (to === 'ATTRIBUTED' && from === 'INFERRED') {
    return false;
  }
  return true;
}

/* ---------- jargon-light client wording (§30) ---------- */

export function clientWording(
  decisionType: DecisionType,
): string {
  switch (decisionType) {
    case 'PROTECT':
      return 'Keep what is working — protect a page that is already winning.';
    case 'IMPROVE':
      return 'Make a good page better so it can rank higher and convert.';
    case 'CREATE':
      return 'Create a missing page customers are looking for.';
    case 'CONSOLIDATE':
      return 'Merge overlapping pages so they stop competing with each other.';
    case 'FIX':
      return 'Fix something broken that blocks search engines or visitors.';
    case 'CONNECT':
      return 'Link related pages so visitors and search engines find them.';
    case 'STRENGTHEN':
      return 'Build on a recent win while the momentum is fresh.';
    case 'RESPOND':
      return 'Something meaningful changed — review what happened before acting.';
    case 'VERIFY':
      return 'Check that a finished change is actually live.';
    case 'MEASURE':
      return 'See whether a finished change moved the numbers.';
    default:
      return 'Look closer before deciding — evidence is not complete yet.';
  }
}

/* ---------- determinism guard ---------- */

export function stableKey(
  fingerprint: string,
  index: number,
): string {
  return `${fingerprint}:${String(index).padStart(4, '0')}`;
}

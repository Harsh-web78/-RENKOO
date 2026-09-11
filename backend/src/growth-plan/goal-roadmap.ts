/*
 * =========================================================
 * BUSINESS GOAL → GROWTH ROADMAP 1.0 — pure functions
 * (Phase 35).
 *
 * Deterministic composition layer:
 * BUSINESS GOAL → OUTCOME/KPI → CUSTOMER NEED →
 * SEARCH + AI OPPORTUNITY → GROWTH DECISION →
 * EXISTING ACTION → DEPENDENCY → TIME HORIZON →
 * EXECUTION → VERIFICATION → MEASUREMENT → LEARNING
 * → REPLAN.
 *
 * Non-negotiable:
 * - No fake targets (TARGET_UNSET / TARGET NOT SET).
 * - No scores: alignment is categorical
 *   (DIRECT/STRONG/CONTEXTUAL/WEAK/UNKNOWN).
 * - No fabricated dates (TIMING_UNCERTAIN).
 * - No invented dependencies, effort, forecasts,
 *   revenue, or causality.
 * - Roadmap stability: retain position unless
 *   priority/dependency/evidence materially changes.
 * - Progress states are evidence-based; missing
 *   sources yield INSUFFICIENT_DATA, never AT_RISK.
 * =========================================================
 */

export type GoalFamily =
  | 'LEADS'
  | 'QUALIFIED_LEADS'
  | 'REVENUE'
  | 'ORGANIC_VISIBILITY'
  | 'AI_VISIBILITY'
  | 'CUSTOMER_DEMAND_COVERAGE'
  | 'MARKET_ENTRY'
  | 'PRODUCT_SERVICE_VISIBILITY'
  | 'LOCAL_VISIBILITY'
  | 'AUTHORITY'
  | 'CONTENT_COVERAGE'
  | 'TECHNICAL_FOUNDATION';

export type GoalProvenance =
  | 'USER_DEFINED'
  | 'CONFIGURED'
  | 'OBSERVED'
  | 'DERIVED'
  | 'UNAVAILABLE';

export type GoalAlignment =
  | 'DIRECT'
  | 'STRONG'
  | 'CONTEXTUAL'
  | 'WEAK'
  | 'UNKNOWN';

export type TimeHorizon =
  | 'NOW'
  | 'DAYS_0_30'
  | 'DAYS_31_60'
  | 'DAYS_61_90'
  | 'LATER'
  | 'WAIT'
  | 'BLOCKED'
  | 'TIMING_UNCERTAIN';

export type DependencyKind =
  | 'BLOCKS'
  | 'REQUIRES'
  | 'FOLLOWS'
  | 'MEASURE_AFTER'
  | 'VERIFY_AFTER'
  | 'OPTIONAL';

export type WorkClass =
  | 'QUICK_WIN'
  | 'FOUNDATION'
  | 'STRATEGIC_BET'
  | 'MAINTENANCE'
  | 'EXPERIMENT'
  | 'WAIT';

export type RoadmapState =
  | 'NOT_STARTED'
  | 'READY'
  | 'IN_PROGRESS'
  | 'AWAITING_APPROVAL'
  | 'EXECUTED'
  | 'VERIFYING'
  | 'VERIFIED'
  | 'MEASURING'
  | 'COMPLETED'
  | 'BLOCKED'
  | 'WAITING'
  | 'DISMISSED';

export type GoalProgress =
  | 'ON_TRACK'
  | 'CHANGING'
  | 'NO_CHANGE_OBSERVED'
  | 'AT_RISK'
  | 'BLOCKED'
  | 'INSUFFICIENT_DATA'
  | 'NOT_STARTED';

export const GOAL_FAMILIES: GoalFamily[] = [
  'LEADS',
  'QUALIFIED_LEADS',
  'REVENUE',
  'ORGANIC_VISIBILITY',
  'AI_VISIBILITY',
  'CUSTOMER_DEMAND_COVERAGE',
  'MARKET_ENTRY',
  'PRODUCT_SERVICE_VISIBILITY',
  'LOCAL_VISIBILITY',
  'AUTHORITY',
  'CONTENT_COVERAGE',
  'TECHNICAL_FOUNDATION',
];

export const TIME_HORIZONS: TimeHorizon[] = [
  'NOW',
  'DAYS_0_30',
  'DAYS_31_60',
  'DAYS_61_90',
  'LATER',
  'WAIT',
  'BLOCKED',
  'TIMING_UNCERTAIN',
];

export const DEPENDENCY_KINDS: DependencyKind[] = [
  'BLOCKS',
  'REQUIRES',
  'FOLLOWS',
  'MEASURE_AFTER',
  'VERIFY_AFTER',
  'OPTIONAL',
];

export const WORK_CLASSES: WorkClass[] = [
  'QUICK_WIN',
  'FOUNDATION',
  'STRATEGIC_BET',
  'MAINTENANCE',
  'EXPERIMENT',
  'WAIT',
];

export const ROADMAP_STATES: RoadmapState[] = [
  'NOT_STARTED',
  'READY',
  'IN_PROGRESS',
  'AWAITING_APPROVAL',
  'EXECUTED',
  'VERIFYING',
  'VERIFIED',
  'MEASURING',
  'COMPLETED',
  'BLOCKED',
  'WAITING',
  'DISMISSED',
];

export const GOAL_PROGRESSES: GoalProgress[] = [
  'ON_TRACK',
  'CHANGING',
  'NO_CHANGE_OBSERVED',
  'AT_RISK',
  'BLOCKED',
  'INSUFFICIENT_DATA',
  'NOT_STARTED',
];

export const MAX_HORIZON_ITEMS = 12;
export const MAX_LATER_ITEMS = 15;

/* ---------- goal family derivation (§4) ----------
 * Derived only from configured text (BusinessBrain
 * primaryGoal and siblings). Never invented. */

const FAMILY_PATTERNS: Array<{
  family: GoalFamily;
  patterns: RegExp[];
}> = [
  {
    family: 'QUALIFIED_LEADS',
    patterns: [/qualified/i, /pipeline/i, /demo/i, /sales.ready/i],
  },
  {
    family: 'LEADS',
    patterns: [/lead/i, /enquir/i, /inquir/i, /signup/i, /sign.up/i, /contact/i],
  },
  {
    family: 'REVENUE',
    patterns: [/revenue/i, /sales/i, /income/i, /₹|\$|£|€/, /bookings?/i],
  },
  {
    family: 'AI_VISIBILITY',
    patterns: [/ai visibility/i, /\bai\b.*visib/i, /citation/i, /chatgpt|gemini|gen ?ai/i],
  },
  {
    family: 'ORGANIC_VISIBILITY',
    patterns: [/visib/i, /rank/i, /traffic/i, /organic/i, /seo/i],
  },
  {
    family: 'LOCAL_VISIBILITY',
    patterns: [/local/i, /near me/i, /map/i, /store/i],
  },
  {
    family: 'MARKET_ENTRY',
    patterns: [/new market/i, /expand/i, /enter/i, /launch/i],
  },
  {
    family: 'PRODUCT_SERVICE_VISIBILITY',
    patterns: [/product/i, /service/i, /offering/i],
  },
  {
    family: 'AUTHORITY',
    patterns: [/authorit/i, /brand/i, /trust/i, /link/i],
  },
  {
    family: 'CONTENT_COVERAGE',
    patterns: [/content/i, /blog/i, /coverage/i, /topic/i],
  },
  {
    family: 'TECHNICAL_FOUNDATION',
    patterns: [/technical/i, /crawl/i, /speed|performance/i, /core web/i, /foundation/i],
  },
  {
    family: 'CUSTOMER_DEMAND_COVERAGE',
    patterns: [/demand/i, /need/i, /customer/i, /audience/i],
  },
];

export function deriveGoalFamily(
  configuredText: unknown,
): GoalFamily | null {
  const text = String(configuredText ?? '');
  if (!text.trim()) return null;
  for (const { family, patterns } of FAMILY_PATTERNS) {
    if (patterns.some((p) => p.test(text))) return family;
  }
  return null;
}

export interface BusinessGoal {
  goalType: GoalFamily | null;
  goalLabel: string;
  goalSource: GoalProvenance;
  goalEvidenceState: 'OBSERVED' | 'DERIVED' | 'UNAVAILABLE';
  targetValue: null;
  targetUnit: null;
  targetWindow: null;
  baseline: string | null;
  measurementSource: string | null;
  status: 'TARGET_UNSET';
  targetNote: string;
}

export function composeGoal(input: {
  primaryGoal: unknown;
  hasConfiguredGoal: boolean;
  observedBaseline: string | null;
  measurementSource: string | null;
}): BusinessGoal {
  const label = String(input.primaryGoal ?? '').trim();
  if (!label) {
    return {
      goalType: null,
      goalLabel: 'No configured business goal',
      goalSource: 'UNAVAILABLE',
      goalEvidenceState: 'UNAVAILABLE',
      targetValue: null,
      targetUnit: null,
      targetWindow: null,
      baseline: input.observedBaseline,
      measurementSource: input.measurementSource,
      status: 'TARGET_UNSET',
      targetNote:
        'TARGET NOT SET — directional roadmap only. No revenue, traffic, ranking, AI, lead or conversion target invented.',
    };
  }
  return {
    goalType: deriveGoalFamily(label),
    goalLabel: label,
    goalSource: input.hasConfiguredGoal
      ? 'CONFIGURED'
      : 'DERIVED',
    goalEvidenceState: input.hasConfiguredGoal
      ? 'OBSERVED'
      : 'DERIVED',
    targetValue: null,
    targetUnit: null,
    targetWindow: null,
    baseline: input.observedBaseline,
    measurementSource: input.measurementSource,
    status: 'TARGET_UNSET',
    targetNote:
      'TARGET NOT SET — target fields exist but are unset by design. Never “increase traffic 30%” without user input.',
  };
}

/* ---------- alignment without score (§10) ---------- */

export function alignGoalToDecision(input: {
  goalFamily: GoalFamily | null;
  decisionType: string;
  pageHasDemand: boolean;
  needCommercial: boolean;
  hasRecommendation: boolean;
  hasRevenueEvidence: boolean;
  hasTrafficEvidence: boolean;
}): {
  alignment: GoalAlignment;
  explanation: string;
} {
  const type = String(input.decisionType ?? '')
    .trim()
    .toUpperCase();
  const family = input.goalFamily;
  /* DIRECT: revenue/lead goals with recorded
   * revenue evidence on the decision's page. */
  if (
    (family === 'REVENUE' ||
      family === 'LEADS' ||
      family === 'QUALIFIED_LEADS') &&
    input.hasRevenueEvidence
  ) {
    return {
      alignment: 'DIRECT',
      explanation: `DIRECT — recorded revenue evidence exists on this decision's page and the goal is ${family}. Aligned, not predictive.`,
    };
  }
  /* STRONG: goal-family match + demand + existing
   * recommendation. */
  const familyMatches: Record<string, GoalFamily[]> = {
    FIX: ['TECHNICAL_FOUNDATION'],
    IMPROVE: [
      'LEADS',
      'QUALIFIED_LEADS',
      'REVENUE',
      'ORGANIC_VISIBILITY',
      'PRODUCT_SERVICE_VISIBILITY',
    ],
    CREATE: [
      'CUSTOMER_DEMAND_COVERAGE',
      'CONTENT_COVERAGE',
      'MARKET_ENTRY',
      'PRODUCT_SERVICE_VISIBILITY',
    ],
    CONSOLIDATE: ['ORGANIC_VISIBILITY', 'AUTHORITY'],
    PROTECT: [
      'REVENUE',
      'LEADS',
      'ORGANIC_VISIBILITY',
      'AI_VISIBILITY',
    ],
    CONNECT: ['AUTHORITY', 'ORGANIC_VISIBILITY'],
    RESPOND: [
      'ORGANIC_VISIBILITY',
      'AI_VISIBILITY',
      'REVENUE',
      'LEADS',
    ],
    VERIFY: [
      'TECHNICAL_FOUNDATION',
      'LEADS',
      'REVENUE',
    ],
    MEASURE: [
      'LEADS',
      'REVENUE',
      'ORGANIC_VISIBILITY',
      'AI_VISIBILITY',
    ],
    INVESTIGATE: [
      'AI_VISIBILITY',
      'CUSTOMER_DEMAND_COVERAGE',
      'ORGANIC_VISIBILITY',
    ],
    STRENGTHEN: [
      'ORGANIC_VISIBILITY',
      'AI_VISIBILITY',
      'AUTHORITY',
    ],
  };
  const match =
    family !== null &&
    (familyMatches[type] ?? []).includes(family);
  if (
    match &&
    input.pageHasDemand &&
    input.hasRecommendation
  ) {
    return {
      alignment: 'STRONG',
      explanation: `STRONG — ${type} matches the ${family} goal with observed demand and an existing recommendation. “Aligned because…”, never “will increase…”.`,
    };
  }
  if (match || (input.pageHasDemand && input.needCommercial)) {
    return {
      alignment: 'CONTEXTUAL',
      explanation:
        'CONTEXTUAL — related to the goal through demand or type, without direct evidence. Directional only.',
    };
  }
  if (
    input.pageHasDemand ||
    input.hasRecommendation ||
    input.hasTrafficEvidence
  ) {
    return {
      alignment: 'WEAK',
      explanation:
        'WEAK — some supporting signal exists, but the goal connection is thin. Do not prioritize on goal grounds alone.',
    };
  }
  return {
    alignment: 'UNKNOWN',
    explanation:
      'UNKNOWN — no goal connection established. Never force a fit.',
  };
}

/* ---------- work classification (§15) ---------- */

export function classifyWork(input: {
  decisionType: string;
  priorityBand: string;
  hasDependency: boolean;
  verificationPending: boolean;
  measurementPending: boolean;
  evidenceWeak: boolean;
}): WorkClass {
  const type = String(input.decisionType ?? '')
    .trim()
    .toUpperCase();
  const band = String(input.priorityBand ?? '')
    .trim()
    .toUpperCase();
  if (input.evidenceWeak) return 'WAIT';
  if (
    !input.hasDependency &&
    (band === 'HIGH' || type === 'FIX') &&
    (type === 'IMPROVE' ||
      type === 'FIX' ||
      type === 'CONNECT' ||
      type === 'RESPOND')
  ) {
    return 'QUICK_WIN';
  }
  if (type === 'FIX' || type === 'CONNECT') return 'FOUNDATION';
  if (type === 'CREATE' || type === 'CONSOLIDATE') {
    return 'STRATEGIC_BET';
  }
  if (type === 'PROTECT' || type === 'MEASURE') {
    return 'MAINTENANCE';
  }
  if (
    type === 'INVESTIGATE' ||
    input.verificationPending ||
    input.measurementPending
  ) {
    return 'EXPERIMENT';
  }
  return 'WAIT';
}

/* ---------- horizon assignment (§7/§13/§14) ---------- */

export function assignHorizon(input: {
  planOrder: number;
  hasDependency: boolean;
  dependencyResolved: boolean;
  evidenceWeak: boolean;
  verificationPending: boolean;
  blocked: boolean;
}): TimeHorizon {
  if (input.blocked) return 'BLOCKED';
  if (input.hasDependency && !input.dependencyResolved) {
    return 'WAIT';
  }
  if (input.evidenceWeak) return 'TIMING_UNCERTAIN';
  /* Verification itself is quick unblocking work, so it
   * stays in normal order; measurement-after-
   * verification lands later through plan order. */
  void input.verificationPending;
  if (input.planOrder < 3) return 'NOW';
  if (input.planOrder < 8) return 'DAYS_0_30';
  if (input.planOrder < 15) return 'DAYS_31_60';
  if (input.planOrder < 22) return 'DAYS_61_90';
  return 'LATER';
}

export function horizonNote(h: TimeHorizon): string {
  switch (h) {
    case 'NOW':
      return 'Foundation + highest-value actions, starting now.';
    case 'DAYS_0_30':
      return '30 DAYS — foundation and highest-value actions.';
    case 'DAYS_31_60':
      return '60 DAYS — follow-on and dependent work.';
    case 'DAYS_61_90':
      return '90 DAYS — longer-term bets + measurement/learning.';
    case 'LATER':
      return 'Valid but intentionally deferred beyond 90 days.';
    case 'WAIT':
      return 'Waiting on evidence or a prerequisite — reason attached.';
    case 'BLOCKED':
      return 'Blocked on a specific missing prerequisite.';
    default:
      return 'TIMING UNCERTAIN — dependency or evidence does not support timing. No date fabricated.';
  }
}

/* ---------- dependencies (§11/§12) ---------- */

export interface RoadmapDependency {
  from: string;
  to: string;
  kind: DependencyKind;
  reason: string;
}

export function dependencyNote(d: RoadmapDependency): string {
  return `${d.from} ${d.kind} ${d.to} — ${d.reason}`;
}

/* Topological order: prerequisites before dependents.
 * Unknown references are kept (flagged), never dropped
 * silently. Deterministic: ties break by fingerprint. */
export function sequenceItems<T extends { fingerprint: string }>(
  items: T[],
  dependencies: RoadmapDependency[],
): {
  ordered: T[];
  unknownRefs: string[];
  cycles: string[][];
} {
  const byFp = new Map(items.map((i) => [i.fingerprint, i]));
  const edges = new Map<string, Set<string>>();
  const unknownRefs: string[] = [];
  for (const d of dependencies) {
    if (d.kind === 'OPTIONAL') continue;
    if (!byFp.has(d.from) || !byFp.has(d.to)) {
      unknownRefs.push(`${d.from}→${d.to}`);
      continue;
    }
    /* d.from must come before d.to. */
    if (!edges.has(d.from)) edges.set(d.from, new Set());
    edges.get(d.from)!.add(d.to);
  }
  /* Kahn's algorithm with fingerprint tie-break. */
  const indegree = new Map<string, number>();
  for (const i of items) indegree.set(i.fingerprint, 0);
  for (const [, tos] of edges) {
    for (const to of tos) {
      indegree.set(to, (indegree.get(to) ?? 0) + 1);
    }
  }
  const ready = items
    .filter((i) => (indegree.get(i.fingerprint) ?? 0) === 0)
    .map((i) => i.fingerprint)
    .sort();
  const ordered: T[] = [];
  const queue = [...ready];
  while (queue.length > 0) {
    queue.sort();
    const fp = queue.shift()!;
    ordered.push(byFp.get(fp)!);
    for (const to of [...(edges.get(fp) ?? [])].sort()) {
      indegree.set(to, (indegree.get(to) ?? 1) - 1);
      if (indegree.get(to) === 0) queue.push(to);
    }
  }
  const cycles: string[][] = [];
  if (ordered.length < items.length) {
    const remaining = items
      .filter((i) => !ordered.includes(i))
      .map((i) => i.fingerprint)
      .sort();
    cycles.push(remaining);
    for (const fp of remaining) ordered.push(byFp.get(fp)!);
  }
  return { ordered, unknownRefs, cycles };
}

/* ---------- roadmap state mapping (§24) ---------- */

export function roadmapStateFor(input: {
  actionStatus: string | null;
  verificationState: string | null;
  measurementPending: boolean;
  blocked: boolean;
  waiting: boolean;
}): RoadmapState {
  if (input.blocked) return 'BLOCKED';
  if (input.waiting) return 'WAITING';
  const status = String(input.actionStatus ?? '')
    .trim()
    .toUpperCase();
  const verified = String(input.verificationState ?? '')
    .trim()
    .toUpperCase();
  if (status === 'DISMISSED') return 'DISMISSED';
  if (status === 'DONE') {
    if (
      verified === 'VERIFIED' ||
      verified === 'PARTIALLY_VERIFIED'
    ) {
      return input.measurementPending
        ? 'MEASURING'
        : 'COMPLETED';
    }
    return 'VERIFYING';
  }
  if (status === 'IN_PROGRESS') {
    const v = String(input.verificationState ?? '').trim();
    if (v !== '' && v !== 'UNVERIFIED') return 'VERIFYING';
    return 'IN_PROGRESS';
  }
  /* TODO / proposal flow states live upstream; the
   * roadmap only reflects readiness. */
  return 'READY';
}

/* ---------- progress (§27) ---------- */

export function goalProgress(input: {
  revenueSourceAvailable: boolean;
  outcomeSourceAvailable: boolean;
  blocked: boolean;
  started: boolean;
  observedChange: 'UP' | 'DOWN' | 'FLAT' | null;
  atRiskEvidence: boolean;
}): GoalProgress {
  if (input.blocked) return 'BLOCKED';
  if (!input.started) return 'NOT_STARTED';
  if (
    !input.revenueSourceAvailable &&
    !input.outcomeSourceAvailable
  ) {
    return 'INSUFFICIENT_DATA';
  }
  if (input.atRiskEvidence) return 'AT_RISK';
  if (input.observedChange === 'UP') return 'ON_TRACK';
  if (input.observedChange === 'DOWN') return 'CHANGING';
  if (input.observedChange === 'FLAT') {
    return 'NO_CHANGE_OBSERVED';
  }
  return 'INSUFFICIENT_DATA';
}

/* ---------- goal conflicts (§28) ---------- */

export interface GoalConflict {
  goals: string[];
  affectedDecisions: string[];
  tradeoff: string;
  evidence: string;
  resolution: 'SAFE_CHOICE' | 'UNRESOLVED';
  safeChoice: string | null;
}

export function goalConflict(input: {
  goals: string[];
  affectedDecisions: string[];
  tradeoff: string;
  evidence: string;
  safeChoice: string | null;
}): GoalConflict {
  return {
    goals: input.goals,
    affectedDecisions: input.affectedDecisions,
    tradeoff: input.tradeoff,
    evidence: input.evidence,
    resolution: input.safeChoice ? 'SAFE_CHOICE' : 'UNRESOLVED',
    safeChoice: input.safeChoice,
  };
}

/* ---------- resource awareness (§29) ---------- */

export function resourceNote(input: {
  owner: string | null;
  capacityKnown: boolean;
}): string {
  if (input.owner && input.capacityKnown) {
    return `Owner ${input.owner} with known capacity.`;
  }
  if (input.owner) {
    return `Owner ${input.owner}; RESOURCE_CAPACITY_UNKNOWN — no hours or days estimated.`;
  }
  return 'RESOURCE_CAPACITY_UNKNOWN — no owner, effort, hours, or developer days invented.';
}

/* ---------- replan (§22/§26) ---------- */

export interface ReplanInfo {
  lastUpdated: string;
  lastEvidenceChange: string | null;
  nextReview: string | null;
  stale: boolean;
  note: string;
}

export function replanInfo(input: {
  lastUpdatedIso: string;
  lastEvidenceChangeIso: string | null;
  nextReviewIso: string | null;
  nowIso?: string;
  staleAfterDays?: number;
}): ReplanInfo {
  const now = new Date(
    input.nowIso ?? new Date().toISOString(),
  ).getTime();
  const updated = new Date(input.lastUpdatedIso).getTime();
  const staleAfter =
    (input.staleAfterDays ?? 30) * 24 * 60 * 60 * 1000;
  const stale =
    Number.isFinite(updated) &&
    Number.isFinite(now) &&
    now - updated > staleAfter;
  return {
    lastUpdated: input.lastUpdatedIso,
    lastEvidenceChange: input.lastEvidenceChangeIso,
    nextReview: input.nextReviewIso,
    stale,
    note: stale
      ? 'Plan older than the review window — recompute before acting.'
      : 'Plan current within its review window. Recompute when rank, AI, demand, competitor, execution, verification, revenue or technical evidence changes.',
  };
}

/* ---------- stability (§23) ---------- */

export function stablePosition(
  previousOrder: string[],
  fingerprint: string,
  materiallyChanged: boolean,
): number {
  const idx = previousOrder.indexOf(fingerprint);
  if (idx === -1) return -1;
  return materiallyChanged ? -1 : idx;
}

/* ---------- executive view (§31) ---------- */

export interface ExecutiveView {
  goal: string;
  currentState: string;
  nextThree: string[];
  blocked: string[];
  changed: string[];
  measuring: string[];
}

export function executiveView(input: {
  goalLabel: string;
  progress: GoalProgress;
  nextThree: Array<{ title: string; nextAction: string }>;
  blocked: string[];
  changed: string[];
  measuring: string[];
}): ExecutiveView {
  return {
    goal: input.goalLabel,
    currentState: `Goal progress: ${input.progress} (evidence-based).`,
    nextThree: input.nextThree.map(
      (n) => `${n.title} — next: ${n.nextAction}`,
    ),
    blocked: input.blocked,
    changed: input.changed,
    measuring: input.measuring,
  };
}

/* ---------- outcome chain (§16) ---------- */

const CHAIN_EDGES = [
  'GOAL',
  'CUSTOMER NEED',
  'SEARCH DEMAND',
  'RANK / AI VISIBILITY',
  'PAGE',
  'TRAFFIC',
  'KEY EVENT',
  'LEAD',
  'QUALIFICATION',
  'REVENUE',
] as const;

export function outcomeChain(
  present: Partial<Record<(typeof CHAIN_EDGES)[number], string | null>>,
): string[] {
  return CHAIN_EDGES.map((edge) => {
    const value = present[edge];
    return value ? `${edge}: ${value}` : `${edge}: missing edge`;
  });
}

/* ---------- agency/client wording (§30) ---------- */

export function clientPlanWording(input: {
  horizon: TimeHorizon;
  items: Array<{ title: string }>;
  goalLabel: string;
}): string[] {
  const lines = [
    `${horizonNote(input.horizon)}`,
    ...input.items.map((item, i) => `${i + 1}. ${item.title}.`),
    `Why: these are the strongest currently supported actions for the configured goal${input.goalLabel ? ` (“${input.goalLabel}”)` : ''}.`,
    'No outcome promised — measurement will show what happened.',
  ];
  return lines;
}

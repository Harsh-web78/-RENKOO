/*
 * =========================================================
 * ACTION MEASUREMENT + LEARNING 1.0 — pure functions
 * (Phase 23).
 *
 * "Do the work → observe the change → learn."
 * ACTION → BEFORE → EVENT → AFTER → OBSERVED CHANGE →
 * EVIDENCE → NEXT LEARNING. Observational only.
 *
 * Forbidden language (action impact): caused, causes,
 * because of, resulted in, led to, generated, drove,
 * produced. Allowed: after, following, observed,
 * coincided, during, alongside.
 *
 * No scores: no ExperimentScore, CausalScore,
 * ImpactScore, PredictionScore, SuccessProbability,
 * tactic scores. No zero fallback: unavailable stays
 * unavailable. No invented timestamps or completions.
 * =========================================================
 */

export type MeasurementWindowDays = 7 | 14 | 28 | 90;

export type OutcomeState =
  | 'IMPROVED'
  | 'DECLINED'
  | 'UNCHANGED'
  | 'MIXED'
  | 'INSUFFICIENT_EVIDENCE'
  | 'NOT_MEASURABLE'
  | 'UNAVAILABLE';

export type ReadinessState =
  | 'READY'
  | 'WAITING_FOR_DATA'
  | 'INSUFFICIENT_DATA'
  | 'MEASURABLE'
  | 'NOT_MEASURABLE';

export type MetricDirection =
  | 'HIGHER_IMPROVED'
  | 'LOWER_IMPROVED'
  | 'DESCRIPTIVE';

export interface MetricDefinition {
  key: string;
  label: string;
  source: string;
  unit: string;
  direction: MetricDirection;
  evidenceState: 'VERIFIED' | 'OBSERVED';
  comparison: string;
}

/* GSC estimated position and rank-tracker position are
 * separate metrics — never mixed. */
export const METRIC_REGISTRY: readonly MetricDefinition[] =
  [
    {
      key: 'GSC_IMPRESSIONS',
      label: 'Impressions',
      source: 'GSC',
      unit: 'count',
      direction: 'DESCRIPTIVE',
      evidenceState: 'VERIFIED',
      comparison: 'before vs after totals',
    },
    {
      key: 'GSC_CLICKS',
      label: 'Clicks',
      source: 'GSC',
      unit: 'count',
      direction: 'HIGHER_IMPROVED',
      evidenceState: 'VERIFIED',
      comparison: 'before vs after totals',
    },
    {
      key: 'GSC_CTR',
      label: 'CTR',
      source: 'GSC',
      unit: 'percentage',
      direction: 'HIGHER_IMPROVED',
      evidenceState: 'VERIFIED',
      comparison: 'before vs after rate',
    },
    {
      key: 'GSC_POSITION',
      label: 'GSC estimated position',
      source: 'GSC',
      unit: 'position',
      direction: 'LOWER_IMPROVED',
      evidenceState: 'VERIFIED',
      comparison:
        'impression-weighted estimated position, never exact rank',
    },
    {
      key: 'RANK_POSITION',
      label: 'Rank position',
      source: 'RankObservation',
      unit: 'position',
      direction: 'LOWER_IMPROVED',
      evidenceState: 'OBSERVED',
      comparison: 'observed positions, never interpolated',
    },
    {
      key: 'AI_MENTION',
      label: 'AI mentions',
      source: 'AI monitoring',
      unit: 'count',
      direction: 'HIGHER_IMPROVED',
      evidenceState: 'OBSERVED',
      comparison: 'mention counts before vs after',
    },
    {
      key: 'AI_CITATION',
      label: 'AI citations',
      source: 'AI monitoring',
      unit: 'count',
      direction: 'HIGHER_IMPROVED',
      evidenceState: 'OBSERVED',
      comparison: 'citation counts before vs after',
    },
    {
      key: 'REFERRING_DOMAINS',
      label: 'Referring domains',
      source: 'Backlink evidence',
      unit: 'count',
      direction: 'DESCRIPTIVE',
      evidenceState: 'OBSERVED',
      comparison: 'explicit new/lost evidence only',
    },
    {
      key: 'LEADS',
      label: 'Leads',
      source: 'Recorded outcomes',
      unit: 'count',
      direction: 'DESCRIPTIVE',
      evidenceState: 'OBSERVED',
      comparison: 'recorded leads only, never estimated',
    },
    {
      key: 'REVENUE',
      label: 'Revenue',
      source: 'Recorded outcomes',
      unit: 'currency',
      direction: 'DESCRIPTIVE',
      evidenceState: 'OBSERVED',
      comparison: 'recognized revenue only, never estimated',
    },
  ];

export const FORBIDDEN_IMPACT_PHRASES: readonly string[] =
  [
    'caused',
    'causes',
    'because of',
    'resulted in',
    'led to',
    'generated',
    'drove',
    'produced',
  ];

export const MEASUREMENT_LIMITATIONS: readonly string[] =
  [
    'Seasonality and external factors are not controlled by RENKOO.',
    'Algorithm, competitor, demand and SERP changes are not modeled.',
    'Impression changes describe demand movement, not action impact. Delayed source data is preserved as dataThrough, never presented as the action timestamp.',
    'Multiple overlapping actions prevent isolating individual impact.',
    'This is observational and does not establish causality.',
  ];

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

/* ---------- windows ---------- */

export function validateWindow(
  days: unknown,
): MeasurementWindowDays | null {
  const n = Number(days);
  if (n === 7 || n === 14 || n === 28 || n === 90)
    return n;
  return null;
}

export interface MeasurementWindows {
  beforeStart: string;
  beforeEnd: string;
  afterStart: string;
  afterEnd: string;
}

export function equalWindows(
  anchorIso: string,
  days: MeasurementWindowDays,
): MeasurementWindows | null {
  const anchor = new Date(anchorIso);
  if (Number.isNaN(anchor.getTime())) return null;
  const iso = (date: Date): string =>
    date.toISOString().slice(0, 10);
  const day = 24 * 60 * 60 * 1000;
  return {
    beforeStart: iso(
      new Date(anchor.getTime() - days * day),
    ),
    beforeEnd: iso(new Date(anchor.getTime() - day)),
    afterStart: iso(anchor),
    afterEnd: iso(
      new Date(anchor.getTime() + (days - 1) * day),
    ),
  };
}

/* ---------- readiness by lifecycle ---------- */

export function readinessForStatus(
  status: string,
  hasCompletedAt: boolean,
): ReadinessState {
  switch (clean(status).toUpperCase()) {
    case 'TODO':
      return 'NOT_MEASURABLE';
    case 'IN_PROGRESS':
      return 'WAITING_FOR_DATA';
    case 'DONE':
      return hasCompletedAt ? 'MEASURABLE' : 'NOT_MEASURABLE';
    case 'DISMISSED':
      return 'NOT_MEASURABLE';
    default:
      return 'NOT_MEASURABLE';
  }
}

/* ---------- metric comparison ---------- */

export function compareMetric(
  direction: MetricDirection,
  before: number | null,
  after: number | null,
  tolerance = 0,
): OutcomeState {
  if (before === null || after === null)
    return 'INSUFFICIENT_EVIDENCE';
  if (!Number.isFinite(before) || !Number.isFinite(after))
    return 'INSUFFICIENT_EVIDENCE';
  const delta = after - before;
  if (Math.abs(delta) <= tolerance) return 'UNCHANGED';
  if (direction === 'DESCRIPTIVE')
    return 'UNCHANGED';
  if (direction === 'HIGHER_IMPROVED')
    return delta > 0 ? 'IMPROVED' : 'DECLINED';
  return delta < 0 ? 'IMPROVED' : 'DECLINED';
}

export function aggregateOutcome(
  states: OutcomeState[],
): OutcomeState {
  const meaningful = states.filter(
    (state) =>
      state !== 'INSUFFICIENT_EVIDENCE' &&
      state !== 'UNAVAILABLE' &&
      state !== 'NOT_MEASURABLE',
  );
  if (meaningful.length === 0) {
    if (
      states.some(
        (state) => state === 'NOT_MEASURABLE',
      )
    )
      return 'NOT_MEASURABLE';
    return 'INSUFFICIENT_EVIDENCE';
  }
  const improved = meaningful.filter(
    (state) => state === 'IMPROVED',
  ).length;
  const declined = meaningful.filter(
    (state) => state === 'DECLINED',
  ).length;
  if (improved > 0 && declined > 0) return 'MIXED';
  if (improved > 0) return 'IMPROVED';
  if (declined > 0) return 'DECLINED';
  return 'UNCHANGED';
}

/* ---------- windowed count/sum evidence (Phase 41, Group F) ----------
 *
 * Distinguishes measured zeros from missing coverage:
 * - A) rows observed in BOTH windows, values 0 → 0:
 *      genuine measured stability → compared (UNCHANGED).
 * - B) no rows in EITHER window: nothing was tracked →
 *      INSUFFICIENT_EVIDENCE (never 0 == 0 → UNCHANGED).
 * - C/D) rows on one side only: coverage changed, so no
 *      baseline or no follow-through exists →
 *      INSUFFICIENT_EVIDENCE (never false stability or
 *      false movement from tracking gaps).
 * Only when both windows have coverage are the values
 * compared with the standard tolerance semantics. */

export function compareWindowEvidence(
  before: number,
  after: number,
  hasBefore: boolean,
  hasAfter: boolean,
  direction:
    | 'HIGHER_IMPROVED'
    | 'LOWER_IMPROVED'
    | 'DESCRIPTIVE' = 'HIGHER_IMPROVED',
  tolerance = 0,
): OutcomeState {
  if (!hasBefore || !hasAfter) {
    return 'INSUFFICIENT_EVIDENCE';
  }
  return compareMetric(
    direction,
    before,
    after,
    tolerance,
  );
}

/* ---------- learning summary ---------- */

export interface ObservedMetric {
  label: string;
  before: string;
  after: string;
  outcome: OutcomeState;
}

export function learningSummary(
  actionTitle: string,
  metrics: ObservedMetric[],
): string {
  const parts = metrics
    .filter((metric) => clean(metric.before))
    .map(
      (metric) =>
        `${metric.label}: ${metric.before} → ${metric.after} (${metric.outcome.toLowerCase()} in the observed period)`,
    );
  if (parts.length === 0)
    return `No observed metric comparison is available for "${clean(actionTitle)}".`;
  return (
    `Following "${clean(actionTitle)}", observed: ` +
    parts.join('; ') +
    '. Observed after the action; this does not establish causality and does not generalize to other pages.'
  );
}

export function overlapNote(
  overlapping: number,
): string | null {
  if (overlapping <= 1) return null;
  return (
    'Multiple actions were observed during this measurement window; ' +
    'individual impact cannot be isolated.'
  );
}

export function containsForbiddenImpact(
  text: unknown,
): boolean {
  const lowered = ` ${clean(text).toLowerCase()} `;
  return FORBIDDEN_IMPACT_PHRASES.some((phrase) =>
    lowered.includes(` ${phrase} `),
  );
}

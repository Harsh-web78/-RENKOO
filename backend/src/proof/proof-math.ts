/*
 * RENKOO Proof Cards — deterministic impact math (no NestJS dependencies).
 *
 * Trust rules enforced here:
 * - Never NaN / Infinity: every division is guarded, every rounding is finite.
 * - Percentage change is null (not 0, not Infinity) when the before value
 *   is zero — callers must render the absolute change only.
 * - No causal claims: helpers describe movement ("recorded during the
 *   comparison window"), never attribution.
 * - Metrics where lower is better (open issues, alerts, average position)
 *   invert the improvement direction explicitly via `lowerBetter`.
 */

export type ProofDirection = 'up' | 'down' | 'flat';

export type ProofMetricInput = {
  key: string;
  label: string;
  before: number | null;
  after: number | null;
  lowerBetter: boolean;
  evidence: string;
};

export type ProofMetric = ProofMetricInput & {
  delta: number | null;
  pct: number | null;
  direction: ProofDirection;
  improved: boolean;
  declined: boolean;
};

export type ProofState =
  | 'WAITING_FOR_DATA'
  | 'EARLY_SIGNAL'
  | 'MEASURABLE_IMPACT'
  | 'MIXED_RESULTS'
  | 'NO_CLEAR_CHANGE'
  | 'INSUFFICIENT_DATA';

function isFiniteNumber(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value)
  );
}

function round1(value: number): number {
  if (!isFiniteNumber(value)) return 0;
  return Math.round(value * 10) / 10;
}

export function safeDelta(
  before: number | null,
  after: number | null,
): number | null {
  if (!isFiniteNumber(before) || !isFiniteNumber(after)) {
    return null;
  }
  const delta = after - before;
  return isFiniteNumber(delta) ? round1(delta) : null;
}

/*
 * Percentage change. Returns null when it cannot be computed honestly:
 * missing values, zero denominator, or non-finite inputs. A null pct
 * means "show the absolute change only".
 */
export function safePct(
  before: number | null,
  after: number | null,
): number | null {
  if (!isFiniteNumber(before) || !isFiniteNumber(after)) {
    return null;
  }
  if (before === 0) {
    return null;
  }
  const pct = ((after - before) / Math.abs(before)) * 100;
  return isFiniteNumber(pct) ? round1(pct) : null;
}

export function directionOf(
  before: number | null,
  after: number | null,
): ProofDirection {
  if (!isFiniteNumber(before) || !isFiniteNumber(after)) {
    return 'flat';
  }
  if (after > before) return 'up';
  if (after < before) return 'down';
  return 'flat';
}

export function buildMetric(
  input: ProofMetricInput,
): ProofMetric {
  const delta = safeDelta(input.before, input.after);
  const pct = safePct(input.before, input.after);
  const direction = directionOf(input.before, input.after);

  const moved = direction !== 'flat' && delta !== null;
  const improved =
    moved &&
    (input.lowerBetter
      ? direction === 'down'
      : direction === 'up');
  const declined =
    moved &&
    (input.lowerBetter
      ? direction === 'up'
      : direction === 'down');

  return {
    ...input,
    before:
      input.before !== null && isFiniteNumber(input.before)
        ? round1(input.before)
        : input.before,
    after:
      input.after !== null && isFiniteNumber(input.after)
        ? round1(input.after)
        : input.after,
    delta,
    pct,
    direction,
    improved,
    declined,
  };
}

/*
 * Card state from assembled metrics + data maturity.
 * - afterDaysAvailable < 3            -> WAITING_FOR_DATA (too early)
 * - no metric with both sides present -> INSUFFICIENT_DATA
 * - some improved + some declined    -> MIXED_RESULTS
 * - none moved                        -> NO_CLEAR_CHANGE
 * - moved + afterDays < 14            -> EARLY_SIGNAL
 * - moved + mature window             -> MEASURABLE_IMPACT
 */
export function deriveState(
  metrics: ProofMetric[],
  afterDaysAvailable: number,
): { state: ProofState; reason: string } {
  const measured = metrics.filter(
    (m) =>
      isFiniteNumber(m.before) &&
      isFiniteNumber(m.after),
  );

  if (!isFiniteNumber(afterDaysAvailable) || afterDaysAvailable < 0) {
    return {
      state: 'INSUFFICIENT_DATA',
      reason:
        'The comparison window could not be determined yet.',
    };
  }

  if (afterDaysAvailable < 3) {
    return {
      state: 'WAITING_FOR_DATA',
      reason:
        'Action completed recently. RENKOO is waiting for enough post-action data to measure the result.',
    };
  }

  if (measured.length === 0) {
    return {
      state: 'INSUFFICIENT_DATA',
      reason:
        'Not enough data yet — no comparable before/after evidence exists for this action.',
    };
  }

  const improved = measured.filter((m) => m.improved).length;
  const declined = measured.filter((m) => m.declined).length;

  if (improved > 0 && declined > 0) {
    return {
      state: 'MIXED_RESULTS',
      reason:
        'Mixed results — some recorded signals improved while others declined during the comparison window.',
    };
  }

  if (improved === 0 && declined === 0) {
    return {
      state: 'NO_CLEAR_CHANGE',
      reason:
        'No clear change — recorded signals show no meaningful movement during the comparison window.',
    };
  }

  if (afterDaysAvailable < 14) {
    return {
      state: 'EARLY_SIGNAL',
      reason:
        'Early positive signal — movement is visible but the comparison period is still short.',
    };
  }

  return {
    state: 'MEASURABLE_IMPACT',
    reason:
      'Measurable change — recorded signals moved across a mature comparison window. Movement is reported, not attributed to this action alone.',
  };
}

export const PROOF_WINDOW_DAYS = 28;
export const PROOF_WAITING_DAYS = 3;
export const PROOF_EARLY_DAYS = 14;

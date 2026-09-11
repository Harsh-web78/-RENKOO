/*
 * =========================================================
 * AI MONITORING OPS 1.0 — production hardening, pure
 * functions (Phase 8A).
 *
 * Stale-run detection, missed-window behavior (next
 * eligible window only, never backlog replay), failure
 * streaks, health shaping, run observability shaping,
 * retention cutoffs and pruning batches. No DB, no
 * provider calls, no billing touch. Every decision is
 * deterministic and unit-tested.
 * =========================================================
 */

export const DEFAULT_STALE_RUN_MS = 30 * 60 * 1000;
export const MAX_CLAIM_PER_TICK = 25;
export const MAX_EXECUTIONS_PER_TICK = 5;
export const MAX_PRUNE_BATCH = 500;

/* ---------- staleness ---------- */

export function isRunStale(input: {
  status: string;
  startedAt: string | Date | null;
  nowMs?: number;
  timeoutMs?: number;
}): boolean {
  if (input.status !== 'RUNNING') return false;
  if (!input.startedAt) return true;
  const timeout =
    input.timeoutMs ?? DEFAULT_STALE_RUN_MS;
  const started = new Date(input.startedAt).getTime();
  if (Number.isNaN(started)) return true;
  const now = input.nowMs ?? Date.now();
  return now - started > timeout;
}

/* ---------- missed windows: next eligible only ---------- */

export function nextEligibleRun(
  cadence: 'DAILY' | 'WEEKLY',
  now: Date = new Date(),
): Date {
  const next = new Date(now.getTime());
  if (cadence === 'DAILY') {
    next.setUTCDate(next.getUTCDate() + 1);
  } else {
    next.setUTCDate(next.getUTCDate() + 7);
  }
  return next;
}

export function missedWindows(
  cadence: 'DAILY' | 'WEEKLY',
  nextRunAt: Date,
  now: Date = new Date(),
): number {
  const gapMs =
    now.getTime() - new Date(nextRunAt).getTime();
  if (gapMs <= 0) return 0;
  const windowMs =
    cadence === 'DAILY'
      ? 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000;
  return Math.floor(gapMs / windowMs);
}

/* ---------- failure streaks ---------- */

export function consecutiveFailures(
  recentStatuses: string[],
): number {
  let count = 0;
  for (const status of recentStatuses) {
    if (
      status === 'FAILED' ||
      status === 'PARTIAL'
    ) {
      count += 1;
    } else {
      break;
    }
  }
  return count;
}

/* ---------- health shaping ---------- */

export interface OpsHealthInput {
  activeSchedules: number;
  nextRunAt: string | null;
  lastRun: {
    id: string;
    status: string;
    completedAt: string | null;
  } | null;
  lastSuccessfulRun: {
    id: string;
    completedAt: string | null;
  } | null;
  recentStatuses: string[];
  staleRuns: number;
  providers: Array<{
    id: string;
    configured: boolean;
  }>;
  allowance: {
    used: number;
    limit: number | null;
    unlimited: boolean;
  };
  creditBlocked: boolean;
  creditReason: string;
}

export interface OpsHealth {
  monitoring: 'ACTIVE' | 'PAUSED' | 'NOT_CONFIGURED';
  nextRunAt: string | null;
  lastRun: OpsHealthInput['lastRun'];
  lastSuccessfulRun: OpsHealthInput['lastSuccessfulRun'];
  consecutiveFailures: number;
  staleRuns: number;
  providers: Array<{
    id: string;
    available: boolean;
  }>;
  credits: {
    used: number;
    limit: number | null;
    blocked: boolean;
    reason: string;
  };
}

export function buildHealth(
  input: OpsHealthInput,
): OpsHealth {
  return {
    monitoring:
      input.activeSchedules > 0
        ? 'ACTIVE'
        : input.lastRun
          ? 'PAUSED'
          : 'NOT_CONFIGURED',
    nextRunAt: input.nextRunAt,
    lastRun: input.lastRun,
    lastSuccessfulRun: input.lastSuccessfulRun,
    consecutiveFailures: consecutiveFailures(
      input.recentStatuses,
    ),
    staleRuns: Math.max(
      0,
      Math.floor(input.staleRuns),
    ),
    providers: input.providers.map((provider) => ({
      id: provider.id,
      available: provider.configured === true,
    })),
    credits: {
      used: input.allowance.used,
      limit: input.allowance.limit,
      blocked: input.creditBlocked,
      reason: input.creditReason,
    },
  };
}

/* ---------- run observability ---------- */

export interface RunObservability {
  id: string;
  status: string;
  origin: string;
  requestedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  promptsRequested: number;
  promptsExecuted: number;
  successes: number;
  failures: number;
  unavailable: number;
  retries: number;
  creditsConsumed: number;
  errorSummary: string | null;
  stale: boolean;
  lastHeartbeatAt: string | null;
  heartbeatAgeMs: number | null;
}

export function shapeRunObservability(input: {
  id: string;
  status: string;
  origin: string;
  requestedAt?: string | Date | null;
  startedAt?: string | Date | null;
  completedAt?: string | Date | null;
  promptCount?: number;
  successCount?: number;
  failureCount?: number;
  unavailableCount?: number;
  retryCount?: number;
  creditUsed?: number;
  errorSummary?: string | null;
  lastHeartbeatAt?: string | Date | null;
  nowMs?: number;
  staleTimeoutMs?: number;
}): RunObservability {
  const started = input.startedAt
    ? new Date(input.startedAt).getTime()
    : NaN;
  const completed = input.completedAt
    ? new Date(input.completedAt).getTime()
    : NaN;
  const iso = (
    value: string | Date | null | undefined,
  ): string | null => {
    if (!value) return null;
    const time = new Date(value).getTime();
    return Number.isNaN(time)
      ? null
      : new Date(time).toISOString();
  };
  return {
    id: input.id,
    status: input.status,
    origin: input.origin,
    requestedAt: iso(input.requestedAt),
    startedAt: iso(input.startedAt),
    completedAt: iso(input.completedAt),
    durationMs:
      Number.isNaN(started) || Number.isNaN(completed)
        ? null
        : Math.max(0, completed - started),
    promptsRequested: Math.max(
      0,
      Math.floor(input.promptCount ?? 0),
    ),
    promptsExecuted:
      Math.max(
        0,
        Math.floor(input.successCount ?? 0),
      ) +
      Math.max(
        0,
        Math.floor(input.failureCount ?? 0),
      ),
    successes: Math.max(
      0,
      Math.floor(input.successCount ?? 0),
    ),
    failures: Math.max(
      0,
      Math.floor(input.failureCount ?? 0),
    ),
    unavailable: Math.max(
      0,
      Math.floor(input.unavailableCount ?? 0),
    ),
    retries: Math.max(
      0,
      Math.floor(input.retryCount ?? 0),
    ),
    creditsConsumed: Math.max(
      0,
      Math.floor(input.creditUsed ?? 0),
    ),
    errorSummary: input.errorSummary ?? null,
    stale: staleWithHeartbeat({
      status: input.status,
      startedAt: iso(input.startedAt),
      lastHeartbeatAt: iso(input.lastHeartbeatAt),
      nowMs: input.nowMs,
      timeoutMs: input.staleTimeoutMs,
    }),
    lastHeartbeatAt: iso(input.lastHeartbeatAt),
    heartbeatAgeMs: heartbeatAgeMs(
      iso(input.lastHeartbeatAt),
      input.nowMs,
    ),
  };
}

/* ---------- retention ---------- */

export function retentionCutoff(
  retentionDays: number,
  now: Date = new Date(),
): Date | null {
  const days = Math.floor(retentionDays);
  if (!Number.isFinite(days) || days <= 0) {
    return null;
  }
  return new Date(
    now.getTime() - days * 24 * 60 * 60 * 1000,
  );
}

export function pruneBatches<T>(
  ids: T[],
  batchSize: number = MAX_PRUNE_BATCH,
): T[][] {
  const size = Math.min(
    MAX_PRUNE_BATCH,
    Math.max(1, Math.floor(batchSize) || MAX_PRUNE_BATCH),
  );
  const batches: T[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    batches.push(ids.slice(i, i + size));
  }
  return batches;
}

/* ---------- scheduler secret ---------- */

export function schedulerConfigured(
  secret: string | undefined | null,
): boolean {
  return (
    typeof secret === 'string' &&
    secret.trim().length >= 16
  );
}

/* ---------- heartbeat (Phase 8B) ---------- */

export const DEFAULT_HEARTBEAT_MS = 90 * 1000;

export function heartbeatDue(input: {
  lastBeatMs: number | null;
  nowMs?: number;
  intervalMs?: number;
}): boolean {
  const now = input.nowMs ?? Date.now();
  const interval = input.intervalMs ?? DEFAULT_HEARTBEAT_MS;
  if (
    input.lastBeatMs === null ||
    !Number.isFinite(input.lastBeatMs)
  ) {
    return true;
  }
  return now - input.lastBeatMs >= interval;
}

export function heartbeatFresh(input: {
  lastHeartbeatAt: string | Date | null;
  nowMs?: number;
  timeoutMs?: number;
}): boolean {
  if (!input.lastHeartbeatAt) return false;
  const beat = new Date(input.lastHeartbeatAt).getTime();
  if (Number.isNaN(beat)) return false;
  const now = input.nowMs ?? Date.now();
  const timeout = input.timeoutMs ?? DEFAULT_STALE_RUN_MS;
  return now - beat <= timeout;
}

export function heartbeatAgeMs(
  lastHeartbeatAt: string | Date | null,
  nowMs: number = Date.now(),
): number | null {
  if (!lastHeartbeatAt) return null;
  const beat = new Date(lastHeartbeatAt).getTime();
  if (Number.isNaN(beat)) return null;
  return Math.max(0, nowMs - beat);
}

/*
 * Heartbeat-aware staleness. A RUNNING run is stale
 * only when its heartbeat is silent past the timeout.
 * Healthy beats protect legitimate long runs no
 * matter the wall-clock age; rows that never beat
 * fall back to startedAt; anything not RUNNING is
 * never stale.
 */
export function staleWithHeartbeat(input: {
  status: string;
  startedAt: string | Date | null;
  lastHeartbeatAt?: string | Date | null;
  nowMs?: number;
  timeoutMs?: number;
}): boolean {
  if (input.status !== 'RUNNING') return false;
  const timeout = input.timeoutMs ?? DEFAULT_STALE_RUN_MS;
  const now = input.nowMs ?? Date.now();
  if (input.lastHeartbeatAt) {
    return !heartbeatFresh({
      lastHeartbeatAt: input.lastHeartbeatAt,
      nowMs: now,
      timeoutMs: timeout,
    });
  }
  return isRunStale({
    status: input.status,
    startedAt: input.startedAt,
    nowMs: now,
    timeoutMs: timeout,
  });
}

/*
 * =========================================================
 * AI MONITORING 1.0 — pure composition (Phase 7).
 *
 * Schedule validation, idempotent identities, credit
 * estimation, bounded execution planning, append-only
 * change detection (prompt × surface × country ×
 * language), citation/competitor/topic/surface history,
 * health, prioritization on existing bands, what-changed
 * summaries, windows, pagination and alert keys.
 *
 * No DB, no provider calls, no billing touch. All
 * comparisons require identical prompt identity +
 * surface + country + language; incompatible pairs
 * yield UNKNOWN, never a fabricated delta.
 * =========================================================
 */

export type MonitorCadence = 'DAILY' | 'WEEKLY';

export type MonitorRunStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED'
  | 'CANCELLED';

export type MonitorOrigin = 'SCHEDULED' | 'MANUAL';

export const MONITOR_SURFACES = [
  'GEMINI',
  'OPENAI',
  'CHATGPT',
  'PERPLEXITY',
  'COPILOT',
  'GOOGLE_AI',
  'CLAUDE',
  'OTHER',
] as const;

export type ChangeKind =
  | 'NEW'
  | 'MENTION_GAINED'
  | 'MENTION_LOST'
  | 'CITATION_GAINED'
  | 'CITATION_LOST'
  | 'COMPETITOR_GAINED'
  | 'COMPETITOR_LOST'
  | 'SOURCE_GAINED'
  | 'SOURCE_LOST'
  | 'UNCHANGED'
  | 'UNKNOWN';

export interface ObservationLike {
  prompt: string;
  surface: string;
  country?: string | null;
  language?: string | null;
  mentioned: boolean;
  citationFound: boolean;
  citationUrl?: string | null;
  citedDomains?: string[];
  competitorNames?: string[];
  failed?: boolean;
  observedAt?: string | null;
}

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function normPrompt(prompt: string): string {
  return clean(prompt).toLowerCase().replace(/\s+/g, ' ');
}

function normSurface(surface: string): string {
  return clean(surface).toUpperCase() || 'UNKNOWN';
}

/* ---------- schedules ---------- */

export function validateSchedule(input: {
  surfaces?: unknown;
  cadence?: unknown;
  country?: unknown;
  language?: unknown;
  timezone?: unknown;
}): {
  surfaces: string[];
  cadence: MonitorCadence;
  country: string;
  language: string;
  timezone: string;
} {
  const raw = Array.isArray(input.surfaces)
    ? input.surfaces
    : [];
  const surfaces = Array.from(
    new Set(
      raw
        .map((s) => normSurface(String(s)))
        .filter((s) =>
          (MONITOR_SURFACES as readonly string[]).includes(s),
        ),
    ),
  ).slice(0, 8);
  if (surfaces.length === 0) {
    throw new Error(
      'At least one supported surface is required.',
    );
  }
  const cadence =
    String(input.cadence ?? '').toUpperCase() === 'DAILY'
      ? 'DAILY'
      : 'WEEKLY';
  const country =
    clean(input.country).toUpperCase() || 'US';
  const language =
    clean(input.language).toLowerCase() || 'en';
  const timezone = clean(input.timezone) || 'UTC';
  return { surfaces, cadence, country, language, timezone };
}

export function scheduleConfigKey(input: {
  surfaces: string[];
  cadence: MonitorCadence;
  country: string;
  language: string;
}): string {
  return [
    [...input.surfaces].sort().join(','),
    input.cadence,
    input.country.toUpperCase(),
    input.language.toLowerCase(),
  ].join('|');
}

export function nextRunAt(
  cadence: MonitorCadence,
  from: Date = new Date(),
): Date {
  const next = new Date(from.getTime());
  if (cadence === 'DAILY') {
    next.setUTCDate(next.getUTCDate() + 1);
  } else {
    next.setUTCDate(next.getUTCDate() + 7);
  }
  return next;
}

export function windowKeyFor(
  cadence: MonitorCadence,
  at: Date = new Date(),
): string {
  const day = at.toISOString().slice(0, 10);
  if (cadence === 'DAILY') return `${day}:DAILY`;
  const week = weekStart(at).toISOString().slice(0, 10);
  return `${week}:WEEKLY`;
}

function weekStart(at: Date): Date {
  const d = new Date(
    Date.UTC(
      at.getUTCFullYear(),
      at.getUTCMonth(),
      at.getUTCDate(),
    ),
  );
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d;
}

/* ---------- idempotency ---------- */

export function executionIdentity(input: {
  websiteId: string;
  prompt: string;
  surface: string;
  country: string;
  language: string;
  windowKey: string;
}): string {
  return [
    clean(input.websiteId),
    normPrompt(input.prompt),
    normSurface(input.surface),
    clean(input.country).toUpperCase() || 'US',
    clean(input.language).toLowerCase() || 'en',
    clean(input.windowKey),
  ].join('|');
}

/* ---------- credit estimation ---------- */

export function estimateRunUsage(input: {
  promptCount: number;
  surfaceCount: number;
  executableSurfaces?: number;
}): {
  totalCalls: number;
  billableEstimate: number;
  note: string;
} {
  const prompts = Math.max(0, Math.floor(input.promptCount));
  const surfaces = Math.max(0, Math.floor(input.surfaceCount));
  const totalCalls = prompts * surfaces;
  const billableEstimate =
    input.executableSurfaces !== undefined
      ? prompts *
        Math.max(
          0,
          Math.floor(input.executableSurfaces),
        )
      : totalCalls;
  return {
    totalCalls,
    billableEstimate,
    note: 'Estimate only: provider failures, unavailable surfaces and retries-after-failure are never charged. Actual usage is reported after the run.',
  };
}

export function creditGuard(input: {
  estimate: number;
  used: number;
  limit: number | null;
}): { allowed: boolean; reason: string } {
  if (input.limit === null) {
    return {
      allowed: true,
      reason: 'Unlimited allowance for this workspace.',
    };
  }
  const remaining = input.limit - input.used;
  if (input.estimate <= remaining) {
    return {
      allowed: true,
      reason: `${input.estimate} estimated call(s) fit in ${remaining} remaining.`,
    };
  }
  return {
    allowed: false,
    reason: `Estimated ${input.estimate} call(s) exceed the remaining allowance (${remaining} of ${input.limit}). Reduce prompts or surfaces, or upgrade.`,
  };
}

/* ---------- bounded execution plan ---------- */

export function executionPlan(input: {
  totalCalls: number;
  batchSize?: number;
  concurrency?: number;
}): Array<{ batch: number; size: number }> {
  const batch = Math.min(
    25,
    Math.max(1, Math.floor(input.batchSize ?? 5)),
  );
  void input.concurrency;
  const plan: Array<{ batch: number; size: number }> = [];
  let remaining = Math.max(0, input.totalCalls);
  let n = 0;
  while (remaining > 0) {
    const size = Math.min(batch, remaining);
    plan.push({ batch: n, size });
    remaining -= size;
    n += 1;
  }
  return plan;
}

/* ---------- change detection ---------- */

export interface PromptChange {
  prompt: string;
  surface: string;
  country: string;
  language: string;
  kinds: ChangeKind[];
  primary: ChangeKind;
  previousAt: string | null;
  currentAt: string | null;
  competitorsGained: string[];
  competitorsLost: string[];
  sourcesGained: string[];
  sourcesLost: string[];
  evidence: string[];
}

function sameScope(
  a: ObservationLike,
  b: ObservationLike,
): boolean {
  return (
    normPrompt(a.prompt) === normPrompt(b.prompt) &&
    normSurface(a.surface) === normSurface(b.surface) &&
    (clean(a.country).toUpperCase() || 'US') ===
      (clean(b.country).toUpperCase() || 'US') &&
    (clean(a.language).toLowerCase() || 'en') ===
      (clean(b.language).toLowerCase() || 'en')
  );
}

function names(
  list: Array<string | null | undefined> | undefined,
): string[] {
  return Array.from(
    new Set(
      (list ?? [])
        .map((v) => clean(v).toLowerCase())
        .filter(Boolean),
    ),
  );
}

export function compareObservations(
  previous: ObservationLike | null,
  current: ObservationLike | null,
): PromptChange | null {
  if (!previous && !current) return null;
  const ref = (current ?? previous) as ObservationLike;
  if (!ref || !normPrompt(ref.prompt)) return null;
  if (!previous && current) {
    if (current.failed) {
      return baseChange(ref, ['UNKNOWN'], 'UNKNOWN', null, current);
    }
    return baseChange(ref, ['NEW'], 'NEW', null, current);
  }
  if (previous && !current) {
    return baseChange(ref, ['UNKNOWN'], 'UNKNOWN', previous, null);
  }
  const prev = previous as ObservationLike;
  const curr = current as ObservationLike;
  if (!sameScope(prev, curr)) {
    return baseChange(ref, ['UNKNOWN'], 'UNKNOWN', prev, curr);
  }
  if (prev.failed && curr.failed) {
    return baseChange(ref, ['UNKNOWN'], 'UNKNOWN', prev, curr);
  }
  if (curr.failed) {
    return baseChange(ref, ['UNKNOWN'], 'UNKNOWN', prev, curr);
  }
  if (prev.failed && !curr.failed) {
    return baseChange(ref, ['NEW'], 'NEW', prev, curr);
  }
  const kinds: ChangeKind[] = [];
  if (!prev.mentioned && curr.mentioned)
    kinds.push('MENTION_GAINED');
  if (prev.mentioned && !curr.mentioned)
    kinds.push('MENTION_LOST');
  if (!prev.citationFound && curr.citationFound)
    kinds.push('CITATION_GAINED');
  if (prev.citationFound && !curr.citationFound)
    kinds.push('CITATION_LOST');
  const prevComp = names(prev.competitorNames);
  const currComp = names(curr.competitorNames);
  const compGained = currComp.filter(
    (c) => !prevComp.includes(c),
  );
  const compLost = prevComp.filter(
    (c) => !currComp.includes(c),
  );
  if (compGained.length > 0)
    kinds.push('COMPETITOR_GAINED');
  if (compLost.length > 0) kinds.push('COMPETITOR_LOST');
  const prevSrc = names(prev.citedDomains);
  const currSrc = names(curr.citedDomains);
  const srcGained = currSrc.filter(
    (s) => !prevSrc.includes(s),
  );
  const srcLost = prevSrc.filter(
    (s) => !currSrc.includes(s),
  );
  if (srcGained.length > 0) kinds.push('SOURCE_GAINED');
  if (srcLost.length > 0) kinds.push('SOURCE_LOST');
  if (kinds.length === 0) kinds.push('UNCHANGED');
  const order: ChangeKind[] = [
    'CITATION_LOST',
    'MENTION_LOST',
    'CITATION_GAINED',
    'MENTION_GAINED',
    'COMPETITOR_GAINED',
    'COMPETITOR_LOST',
    'SOURCE_GAINED',
    'SOURCE_LOST',
    'UNCHANGED',
    'NEW',
    'UNKNOWN',
  ];
  const primary =
    kinds
      .slice()
      .sort(
        (a, b) =>
          order.indexOf(a) - order.indexOf(b),
      )[0] ?? 'UNKNOWN';
  return {
    prompt: ref.prompt,
    surface: normSurface(ref.surface),
    country: clean(ref.country).toUpperCase() || 'US',
    language: clean(ref.language).toLowerCase() || 'en',
    kinds,
    primary,
    previousAt: prev.observedAt ?? null,
    currentAt: curr.observedAt ?? null,
    competitorsGained: compGained,
    competitorsLost: compLost,
    sourcesGained: srcGained,
    sourcesLost: srcLost,
    evidence: [
      `Compared consecutive valid observations for "${ref.prompt}" on ${normSurface(ref.surface)}.`,
    ],
  };
}

function baseChange(
  ref: ObservationLike,
  kinds: ChangeKind[],
  primary: ChangeKind,
  prev: ObservationLike | null,
  curr: ObservationLike | null,
): PromptChange {
  return {
    prompt: ref.prompt,
    surface: normSurface(ref.surface),
    country: clean(ref.country).toUpperCase() || 'US',
    language: clean(ref.language).toLowerCase() || 'en',
    kinds,
    primary,
    previousAt: prev?.observedAt ?? null,
    currentAt: curr?.observedAt ?? null,
    competitorsGained: [],
    competitorsLost: [],
    sourcesGained: [],
    sourcesLost: [],
    evidence:
      primary === 'NEW'
        ? ['First valid observation — baseline established.']
        : ['Insufficient comparable observations.'],
  };
}

/* ---------- run lifecycle ---------- */

export function runStatusFor(input: {
  success: number;
  failure: number;
  unavailable: number;
  cancelled?: boolean;
}): MonitorRunStatus {
  if (input.cancelled) return 'CANCELLED';
  const total =
    input.success + input.failure + input.unavailable;
  if (total === 0) return 'FAILED';
  if (input.failure === 0 && input.success > 0)
    return 'COMPLETED';
  if (input.success === 0) return 'FAILED';
  return 'PARTIAL';
}

/* ---------- what-changed + health ---------- */

export interface WhatChanged {
  mentionsGained: number;
  mentionsLost: number;
  citationsGained: number;
  citationsLost: number;
  competitorsEntered: number;
  competitorsLeft: number;
  unchanged: number;
  unknown: number;
  biggestWin: PromptChange | null;
  biggestLoss: PromptChange | null;
  headline: string;
}

export function summarizeChanges(
  changes: PromptChange[],
): WhatChanged {
  const has = (k: ChangeKind) => (c: PromptChange) =>
    c.kinds.includes(k);
  const mentionsGained = changes.filter(
    has('MENTION_GAINED'),
  ).length;
  const mentionsLost = changes.filter(
    has('MENTION_LOST'),
  ).length;
  const citationsGained = changes.filter(
    has('CITATION_GAINED'),
  ).length;
  const citationsLost = changes.filter(
    has('CITATION_LOST'),
  ).length;
  const competitorsEntered = changes.filter(
    has('COMPETITOR_GAINED'),
  ).length;
  const competitorsLeft = changes.filter(
    has('COMPETITOR_LOST'),
  ).length;
  const unchanged = changes.filter(
    (c) => c.primary === 'UNCHANGED',
  ).length;
  const unknown = changes.filter(
    (c) => c.primary === 'UNKNOWN' || c.primary === 'NEW',
  ).length;
  const winRank: ChangeKind[] = [
    'CITATION_GAINED',
    'MENTION_GAINED',
  ];
  const lossRank: ChangeKind[] = [
    'CITATION_LOST',
    'MENTION_LOST',
    'COMPETITOR_GAINED',
  ];
  const biggestWin =
    changes.find((c) => c.kinds.includes(winRank[0])) ??
    changes.find((c) => c.kinds.includes(winRank[1])) ??
    null;
  const biggestLoss =
    changes.find((c) => c.kinds.includes(lossRank[0])) ??
    changes.find((c) => c.kinds.includes(lossRank[1])) ??
    changes.find((c) => c.kinds.includes(lossRank[2])) ??
    null;
  const parts = [
    `+ ${mentionsGained} prompt(s) gained brand mentions`,
    `+ ${citationsGained} citation(s) gained`,
    `- ${citationsLost} citation(s) lost`,
    `+ ${competitorsEntered} competitor(s) entered`,
    `- ${unchanged} prompt(s) unchanged`,
  ];
  return {
    mentionsGained,
    mentionsLost,
    citationsGained,
    citationsLost,
    competitorsEntered,
    competitorsLeft,
    unchanged,
    unknown,
    biggestWin,
    biggestLoss,
    headline: parts.join(' · '),
  };
}

export type ChangePriority =
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW'
  | 'UNKNOWN';

export function prioritizeChange(input: {
  kind: ChangeKind;
  strategyPriority?: string | null;
  commercialIntent?: boolean;
}): ChangePriority {
  if (
    input.kind === 'UNKNOWN' ||
    input.kind === 'UNCHANGED' ||
    input.kind === 'NEW'
  )
    return 'UNKNOWN';
  const highBand =
    input.strategyPriority === 'HIGH' ||
    (input.commercialIntent === true &&
      (input.kind === 'CITATION_LOST' ||
        input.kind === 'MENTION_LOST'));
  if (
    input.kind === 'CITATION_LOST' ||
    input.kind === 'MENTION_LOST'
  ) {
    if (highBand) return 'HIGH';
    return 'MEDIUM';
  }
  if (
    input.kind === 'CITATION_GAINED' ||
    input.kind === 'MENTION_GAINED'
  )
    return 'MEDIUM';
  return 'LOW';
}

/* ---------- history windows ---------- */

export function bucketByDay(
  observedAt: string | null,
): string | null {
  if (!observedAt) return null;
  const d = new Date(observedAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function windowStart(
  days: 7 | 30 | 90,
  now: Date = new Date(),
): Date {
  return new Date(
    now.getTime() - days * 24 * 60 * 60 * 1000,
  );
}

export interface TrendBucket {
  day: string;
  mentions: number;
  citations: number;
  competitors: number;
  observations: number;
}

export function buildTrend(
  rows: Array<{
    observedAt: string | null;
    mentioned: boolean;
    citationFound: boolean;
    competitorCount: number;
  }>,
): TrendBucket[] {
  const byDay = new Map<string, TrendBucket>();
  for (const row of rows) {
    const day = bucketByDay(row.observedAt);
    if (!day) continue;
    const bucket = byDay.get(day) ?? {
      day,
      mentions: 0,
      citations: 0,
      competitors: 0,
      observations: 0,
    };
    bucket.observations += 1;
    if (row.mentioned) bucket.mentions += 1;
    if (row.citationFound) bucket.citations += 1;
    bucket.competitors += Math.max(
      0,
      Math.floor(row.competitorCount),
    );
    byDay.set(day, bucket);
  }
  return [...byDay.values()].sort((a, b) =>
    a.day < b.day ? -1 : 1,
  );
}

/* ---------- pagination ---------- */

export function paginate<T>(
  rows: T[],
  page: number,
  pageSize: number,
): {
  rows: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
} {
  const size = Math.min(
    100,
    Math.max(1, Math.floor(pageSize) || 20),
  );
  const totalPages = Math.max(
    1,
    Math.ceil(rows.length / size),
  );
  const current = Math.min(
    totalPages,
    Math.max(1, Math.floor(page) || 1),
  );
  const start = (current - 1) * size;
  return {
    rows: rows.slice(start, start + size),
    page: current,
    pageSize: size,
    total: rows.length,
    totalPages,
  };
}

/* ---------- alerts + opportunities ---------- */

export function alertKeyFor(
  change: PromptChange,
): string {
  return [
    'ai-monitor',
    normPrompt(change.prompt),
    change.surface,
    change.primary,
  ].join('|');
}

export function opportunityKindForChange(
  primary: ChangeKind,
): string | null {
  switch (primary) {
    case 'CITATION_LOST':
      return 'AI_CITATION_GAP';
    case 'MENTION_LOST':
      return 'AI_CONTENT_GAP';
    case 'COMPETITOR_GAINED':
      return 'AI_SOURCE_GAP';
    case 'MENTION_GAINED':
    case 'CITATION_GAINED':
      return null;
    default:
      return null;
  }
}

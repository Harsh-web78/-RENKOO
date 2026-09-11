/*
 * =========================================================
 * GROWTH REPORTING 1.0 — pure functions (Phase 20).
 *
 * Professional communication over existing evidence:
 * DATA → EVIDENCE → INSIGHT → ACTION → OBSERVED RESULT
 * → NEXT STEP. Deterministic narrative only — no LLM,
 * no invented metrics, no causal claims, no fake ROI,
 * no unavailable-as-zero.
 *
 * Lifecycle: DRAFT → PUBLISHED → ARCHIVED. Published
 * snapshots are immutable; regeneration creates a new
 * snapshot. Share tokens are opaque 48-hex credentials
 * that resolve to one whitelisted snapshot — never to
 * live tenant queries.
 * =========================================================
 */

export type ReportLifecycle =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'ARCHIVED';

export type ReportEvidenceState =
  | 'VERIFIED'
  | 'OBSERVED'
  | 'INFERRED'
  | 'ESTIMATED'
  | 'UNAVAILABLE';

export type ReportType =
  | 'EXECUTIVE'
  | 'SEO'
  | 'AI_VISIBILITY'
  | 'TECHNICAL'
  | 'COMPETITOR'
  | 'OUTCOME'
  | 'AGENCY_CLIENT';

export const REPORT_PERIODS = [7, 28, 90] as const;

export const SECTION_VISIBILITY: Record<
  ReportType,
  string[]
> = {
  EXECUTIVE: [
    'narrative',
    'changes',
    'wins',
    'risks',
    'priorities',
    'funnel',
    'actions',
    'nextPlan',
    'limitations',
  ],
  SEO: [
    'narrative',
    'changes',
    'wins',
    'risks',
    'priorities',
    'search',
    'content',
    'technical',
    'authority',
    'actions',
    'nextPlan',
    'limitations',
  ],
  AI_VISIBILITY: [
    'narrative',
    'changes',
    'wins',
    'risks',
    'ai',
    'actions',
    'nextPlan',
    'limitations',
  ],
  TECHNICAL: [
    'narrative',
    'technical',
    'actions',
    'nextPlan',
    'limitations',
  ],
  COMPETITOR: [
    'narrative',
    'changes',
    'competitors',
    'actions',
    'nextPlan',
    'limitations',
  ],
  OUTCOME: [
    'narrative',
    'funnel',
    'actions',
    'nextPlan',
    'limitations',
  ],
  AGENCY_CLIENT: [
    'narrative',
    'changes',
    'wins',
    'risks',
    'priorities',
    'search',
    'ai',
    'content',
    'technical',
    'authority',
    'local',
    'funnel',
    'actions',
    'nextPlan',
    'limitations',
  ],
};

export const CANNOT_MEASURE: readonly string[] = [
  'Complete backlink index unavailable.',
  'Google Business Profile performance unavailable.',
  'AI referral traffic unavailable where not observed.',
  'Exact zero-click sessions unavailable.',
  'Keyword-level revenue attribution unavailable where not recorded.',
  'Causal action impact unavailable: results are observed after action.',
];

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/* ---------- periods ---------- */

export interface ReportWindow {
  start: string;
  end: string;
}

export function previousWindow(
  start: string,
  end: string,
): ReportWindow | null {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    endDate < startDate
  )
    return null;
  const days =
    Math.round(
      (endDate.getTime() - startDate.getTime()) /
        (24 * 60 * 60 * 1000),
    ) + 1;
  if (days <= 0 || days > 366) return null;
  const prevEnd = new Date(
    startDate.getTime() - 24 * 60 * 60 * 1000,
  );
  const prevStart = new Date(
    prevEnd.getTime() - (days - 1) * 24 * 60 * 60 * 1000,
  );
  const iso = (date: Date): string =>
    date.toISOString().slice(0, 10);
  return { start: iso(prevStart), end: iso(prevEnd) };
}

export function validatePeriod(
  days: unknown,
): 7 | 28 | 90 | null {
  const n = Number(days);
  if (n === 7 || n === 28 || n === 90) return n;
  return null;
}

export function validateCustomRange(
  from: unknown,
  to: unknown,
): ReportWindow | null {
  const start = clean(from);
  const end = clean(to);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(end)
  )
    return null;
  if (end < start) return null;
  return { start, end };
}

/* ---------- lifecycle ---------- */

export function canPublish(
  status: string,
): boolean {
  return status === 'DRAFT';
}

export function canArchive(status: string): boolean {
  return status === 'PUBLISHED' || status === 'READY';
}

export function canShare(status: string): boolean {
  /* READY is the legacy published-equivalent value. */
  return status === 'PUBLISHED' || status === 'READY';
}

export function isPubliclyVisible(
  status: string,
  shareRevoked: boolean,
  shareExpiresAt: string | null,
  now: Date = new Date(),
): boolean {
  if (status === 'ARCHIVED') return false;
  if (!canShare(status)) return false;
  if (shareRevoked) return false;
  if (shareExpiresAt && new Date(shareExpiresAt) <= now)
    return false;
  return true;
}

/* ---------- share tokens ---------- */

export function isOpaqueToken(token: unknown): boolean {
  const text = clean(token);
  if (!/^[0-9a-f]{48}$/.test(text)) return false;
  return true;
}

export function tokenLeaksOrg(
  token: unknown,
  organizationId: unknown,
): boolean {
  const text = clean(token);
  const org = clean(organizationId);
  if (!text || !org) return false;
  return text.includes(org) || org.includes(text);
}

/* ---------- narrative (deterministic) ---------- */

export interface MetricDelta {
  label: string;
  before: number | null;
  after: number | null;
  evidenceState: ReportEvidenceState;
}

export function changeRow(
  delta: MetricDelta,
): {
  label: string;
  before: number | null;
  after: number | null;
  change: number | null;
  statement: string;
} {
  if (delta.before === null || delta.after === null) {
    return {
      label: delta.label,
      before: delta.before,
      after: delta.after,
      change: null,
      statement: `${delta.label}: UNKNOWN — both observations are required for a comparison.`,
    };
  }
  const change = delta.after - delta.before;
  const direction =
    change > 0
      ? 'increased'
      : change < 0
        ? 'decreased'
        : 'was unchanged';
  return {
    label: delta.label,
    before: delta.before,
    after: delta.after,
    change,
    statement: `${delta.label} ${direction} over the comparison period (before ${delta.before}, after ${delta.after}). Observed change — never claimed as caused by any action.`,
  };
}

export interface EvidenceSignal {
  kind: string;
  label: string;
  detail: string;
  evidenceState: ReportEvidenceState;
}

export function executiveSummary(
  signals: EvidenceSignal[],
): string[] {
  const usable = signals.filter(
    (signal) =>
      signal.evidenceState !== 'UNAVAILABLE' &&
      clean(signal.label).length > 0,
  );
  return usable.slice(0, 5).map(
    (signal) =>
      `${clean(signal.label)}: ${clean(signal.detail)}`,
  );
}

export function pickWins(
  signals: EvidenceSignal[],
  limit = 5,
): EvidenceSignal[] {
  return signals
    .filter(
      (signal) =>
        signal.evidenceState !== 'UNAVAILABLE' &&
        /improv|gain|cit|new|complet|connect/i.test(
          `${signal.kind} ${signal.label} ${signal.detail}`,
        ),
    )
    .slice(0, Math.max(0, Math.min(5, limit)))
    .map((signal) => ({
      ...signal,
      detail: `${clean(signal.detail)} Observed after action — never claimed as caused by it.`,
    }));
}

export function pickRisks(
  signals: EvidenceSignal[],
  limit = 5,
): EvidenceSignal[] {
  return signals
    .filter(
      (signal) =>
        signal.evidenceState !== 'UNAVAILABLE' &&
        /declin|loss|decay|weak|gap|miss|fail|drop|lost/i.test(
          `${signal.kind} ${signal.label} ${signal.detail}`,
        ),
    )
    .slice(0, Math.max(0, Math.min(5, limit)));
}

/* ---------- CSV export (bounded, snapshot-only) ---------- */

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text))
    return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(
  headers: string[],
  rows: Array<Array<unknown>>,
  maxRows = 500,
): string {
  const bounded = rows.slice(
    0,
    Math.max(0, Math.min(maxRows, rows.length)),
  );
  return [
    headers.map(csvCell).join(','),
    ...bounded.map((row) =>
      row.map(csvCell).join(','),
    ),
  ].join('\n');
}

export function opportunitiesCsv(
  opportunities: Array<Record<string, unknown>>,
): string {
  return toCsv(
    ['title', 'priority', 'page', 'keyword', 'status'],
    opportunities.map((opp) => [
      clean(opp.title),
      clean(opp.priority),
      clean(opp.pageUrl ?? opp.targetPage),
      clean(opp.keyword),
      clean(opp.status),
    ]),
  );
}

export function actionsCsv(
  actions: Array<Record<string, unknown>>,
): string {
  return toCsv(
    [
      'title',
      'type',
      'status',
      'page',
      'completedAt',
      'measurement',
    ],
    actions.map((action) => [
      clean(action.title),
      clean(action.type),
      clean(action.status),
      clean(action.url ?? action.pageUrl),
      clean(action.completedAt),
      clean(action.measurement).slice(0, 200),
    ]),
  );
}

export function changesCsv(
  changes: Array<{
    label: string;
    before: number | null;
    after: number | null;
    change: number | null;
  }>,
): string {
  return toCsv(
    ['metric', 'before', 'after', 'change'],
    changes.map((row) => [
      row.label,
      row.before ?? 'UNKNOWN',
      row.after ?? 'UNKNOWN',
      row.change ?? 'UNKNOWN',
    ]),
  );
}

/* ---------- scheduling ---------- */

export function scheduleIdempotencyKey(
  scheduleId: unknown,
  websiteId: unknown,
  periodStart: unknown,
): string {
  return [
    clean(scheduleId),
    clean(websiteId),
    clean(periodStart),
  ].join('|');
}

export function deliveryStatus(
  emailConfigured: boolean,
): 'READY' | 'DELIVERY_NOT_CONFIGURED' {
  return emailConfigured ? 'READY' : 'DELIVERY_NOT_CONFIGURED';
}

/*
 * =========================================================
 * SEARCH CHANGE & ALERT INTELLIGENCE 2.0 — pure functions
 * (Phase 32).
 *
 * Turns rank/GSC/SERP/AI/website/competitor/execution
 * observations into ONE reliable recurring loop:
 * SCHEDULE → COLLECT → VALIDATE → COMPARE → DETECT →
 * EXPLAIN → PRIORITIZE → NOTIFY → ACTION → VERIFY →
 * MEASURE → LEARN.
 *
 * Reuse-first, honesty-first:
 * - No new scores, no new engines, no new timelines.
 * - Phase 26 descriptive events stay authoritative;
 *   this module only schedules, validates, dedupes,
 *   cools down, resolves, digests and correlates.
 * - CHANGE ≠ CAUSE, always. Provider failure is
 *   UNKNOWN, never a loss. GSC position is an
 *   aggregate, never a deterministic rank. AI is
 *   never a rank. Muted ≠ deleted. Acknowledged ≠
 *   resolved. Execution ≠ verification ≠ outcome.
 * =========================================================
 */

export type RankCadence = 'DAILY' | 'WEEKLY';

export type ChangeRunStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED'
  | 'CANCELLED';

export type RankChangeEvent =
  | 'GAINED'
  | 'LOST'
  | 'ENTERED'
  | 'EXITED'
  | 'URL_CHANGED'
  | 'SERP_FEATURE_GAINED'
  | 'SERP_FEATURE_LOST'
  | 'COMPETITOR_MOVEMENT'
  | 'AI_STATE_CHANGED';

export type SearchAlertType =
  | 'RANK_GAIN'
  | 'RANK_LOSS'
  | 'TOP_10_ENTRY'
  | 'TOP_10_EXIT'
  | 'TOP_3_ENTRY'
  | 'TOP_3_EXIT'
  | 'WRONG_URL'
  | 'SERP_FEATURE_GAIN'
  | 'SERP_FEATURE_LOSS'
  | 'COMPETITOR_MOVEMENT'
  | 'AI_VISIBILITY_CHANGE'
  | 'GSC_CHANGE'
  | 'WEBSITE_CHANGE'
  | 'EXECUTION_VERIFIED';

export type AiChangeEvent =
  | 'AI_MENTION_GAINED'
  | 'AI_MENTION_LOST'
  | 'AI_CITATION_GAINED'
  | 'AI_CITATION_LOST'
  | 'AI_SOURCE_CHANGED';

export type AioState =
  | 'AIO_PRESENT'
  | 'AIO_NOT_OBSERVED'
  | 'AIO_UNKNOWN';

export type GscChangeKind =
  | 'CLICK_CHANGE'
  | 'IMPRESSION_CHANGE'
  | 'CTR_CHANGE'
  | 'GSC_POSITION_CHANGE';

export type WebsiteChangeKind =
  | 'CONTENT_CHANGE'
  | 'TITLE_CHANGE'
  | 'META_CHANGE'
  | 'H1_CHANGE'
  | 'INTERNAL_LINK_CHANGE';

export type ActionCorrelation =
  | 'PLANNED_CHANGE'
  | 'UNPLANNED_CHANGE';

export type AlertLifecycle =
  | 'OPEN'
  | 'ACKNOWLEDGED'
  | 'RESOLVED'
  | 'DISMISSED';

export type AlertScope =
  | 'RANK'
  | 'AI'
  | 'COMPETITOR'
  | 'SITE'
  | 'EXECUTION';

export type ChangeHealth =
  | 'ACTIVE'
  | 'HEALTHY'
  | 'PARTIAL'
  | 'STALE'
  | 'FAILED'
  | 'NOT_CONFIGURED'
  | 'UNAVAILABLE';

export type EvidenceState3 =
  | 'VERIFIED'
  | 'OBSERVED'
  | 'INFERRED'
  | 'ESTIMATED'
  | 'UNAVAILABLE';

/* Runtime vocabularies (types above are compile-time;
 * these arrays let UIs, tests and integrations assert
 * the exact supported event language). */

export const SEARCH_ALERT_TYPES: SearchAlertType[] = [
  'RANK_GAIN',
  'RANK_LOSS',
  'TOP_10_ENTRY',
  'TOP_10_EXIT',
  'TOP_3_ENTRY',
  'TOP_3_EXIT',
  'WRONG_URL',
  'SERP_FEATURE_GAIN',
  'SERP_FEATURE_LOSS',
  'COMPETITOR_MOVEMENT',
  'AI_VISIBILITY_CHANGE',
  'GSC_CHANGE',
  'WEBSITE_CHANGE',
  'EXECUTION_VERIFIED',
];

export const RANK_CHANGE_EVENTS: RankChangeEvent[] = [
  'GAINED',
  'LOST',
  'ENTERED',
  'EXITED',
  'URL_CHANGED',
  'SERP_FEATURE_GAINED',
  'SERP_FEATURE_LOST',
  'COMPETITOR_MOVEMENT',
  'AI_STATE_CHANGED',
];

export const AI_CHANGE_EVENTS: AiChangeEvent[] = [
  'AI_MENTION_GAINED',
  'AI_MENTION_LOST',
  'AI_CITATION_GAINED',
  'AI_CITATION_LOST',
  'AI_SOURCE_CHANGED',
];

export const GSC_CHANGE_KINDS: GscChangeKind[] = [
  'CLICK_CHANGE',
  'IMPRESSION_CHANGE',
  'CTR_CHANGE',
  'GSC_POSITION_CHANGE',
];

export const WEBSITE_CHANGE_KINDS: WebsiteChangeKind[] = [
  'CONTENT_CHANGE',
  'TITLE_CHANGE',
  'META_CHANGE',
  'H1_CHANGE',
  'INTERNAL_LINK_CHANGE',
];

export const ALERT_LIFECYCLES: AlertLifecycle[] = [
  'OPEN',
  'ACKNOWLEDGED',
  'RESOLVED',
  'DISMISSED',
];

export const ALERT_SCOPES: AlertScope[] = [
  'RANK',
  'AI',
  'COMPETITOR',
  'SITE',
  'EXECUTION',
];

export const CHANGE_HEALTHS: ChangeHealth[] = [
  'ACTIVE',
  'HEALTHY',
  'PARTIAL',
  'STALE',
  'FAILED',
  'NOT_CONFIGURED',
  'UNAVAILABLE',
];

/* ---------- customer pain policy (§1) ----------
 * Alert fatigue is real (IBM 2025, OneUptime 2026,
 * SEO-specific false-positive research): every alert
 * must be actionable; default digest over instant;
 * instant only for configured high-value events. */

export interface ChangePolicy {
  principle: string;
  defaultDelivery: 'DIGEST';
  instantOnlyWhen: string;
  noiseRule: string;
  maxDigestItems: number;
}

export function meaningfulChangePolicy(): ChangePolicy {
  return {
    principle:
      'Something meaningful changed — never 500 ranking changes.',
    defaultDelivery: 'DIGEST',
    instantOnlyWhen:
      'Configured high-value events only (Top 3/Top 10 exits, target URL replaced). Default conservative.',
    noiseRule:
      'Single-position moves without band context are not surfaced. Same condition does not re-notify within cooldown.',
    maxDigestItems: 10,
  };
}

/* ---------- scheduler (§3/§4/§6) ----------
 * Mirrors the Phase 8 pattern (DAILY default, WEEKLY
 * optional; no minute/hourly keyword tracking). */

export const MAX_CLAIM_PER_TICK = 25;
export const MAX_EXECUTIONS_PER_TICK = 5;
export const MAX_KEYWORDS_PER_RUN = 50;
export const MAX_PROVIDER_CONCURRENCY = 2;
export const MAX_ALERTS_PER_RUN = 50;
export const MAX_DIGEST_ITEMS = 10;
export const MAX_DB_BATCH = 500;
export const STALE_RUN_MS = 30 * 60 * 1000;
export const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function normalizeCadence(
  value: unknown,
): RankCadence {
  const v = String(value ?? '').trim().toUpperCase();
  return v === 'WEEKLY' ? 'WEEKLY' : 'DAILY';
}

export function nextRunAt(
  cadence: RankCadence,
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

export function isScheduleDue(input: {
  isActive: boolean;
  nextRunAt: Date | string | null;
  now?: Date | string;
}): boolean {
  if (!input.isActive) return false;
  if (!input.nextRunAt) return true;
  const due = new Date(input.nextRunAt).getTime();
  const now = new Date(input.now ?? new Date()).getTime();
  if (!Number.isFinite(due) || !Number.isFinite(now)) {
    return false;
  }
  return now >= due;
}

/* ---------- missed runs (§7) ----------
 * Never replay every missed day. Execute the latest
 * eligible run only; intermediate observations are
 * NOT fabricated — gaps stay gaps. */

export function missedWindowCount(input: {
  cadence: RankCadence;
  nextRunAt: Date | string;
  now?: Date | string;
}): number {
  const due = new Date(input.nextRunAt).getTime();
  const now = new Date(input.now ?? new Date()).getTime();
  if (!Number.isFinite(due) || !Number.isFinite(now)) {
    return 0;
  }
  const gap = now - due;
  if (gap <= 0) return 0;
  const windowMs =
    input.cadence === 'DAILY'
      ? 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000;
  return Math.floor(gap / windowMs);
}

export interface MissedRunDecision {
  recoverable: boolean;
  executeLatestOnly: boolean;
  skippedWindows: number;
  note: string;
}

export function missedRunDecision(input: {
  cadence: RankCadence;
  nextRunAt: Date | string;
  now?: Date | string;
}): MissedRunDecision {
  const skipped = missedWindowCount(input);
  if (skipped <= 0) {
    return {
      recoverable: true,
      executeLatestOnly: true,
      skippedWindows: 0,
      note: 'On schedule — execute the due window.',
    };
  }
  return {
    recoverable: true,
    executeLatestOnly: true,
    skippedWindows: skipped,
    note: `Missed ${skipped} window${skipped === 1 ? '' : 's'} — execute the latest eligible run only. Intermediate observations are not fabricated; gaps stay visible.`,
  };
}

/* ---------- stale runs (§8) ---------- */

export function isChangeRunStale(input: {
  status: string;
  startedAt: Date | string | null;
  lastHeartbeatAt?: Date | string | null;
  nowMs?: number;
  timeoutMs?: number;
}): boolean {
  if (input.status !== 'RUNNING') return false;
  const timeout = input.timeoutMs ?? STALE_RUN_MS;
  const beats = [
    input.lastHeartbeatAt
      ? new Date(input.lastHeartbeatAt).getTime()
      : NaN,
    input.startedAt
      ? new Date(input.startedAt).getTime()
      : NaN,
  ].filter((n) => Number.isFinite(n));
  if (beats.length === 0) return true;
  const latest = Math.max(...beats);
  const now = input.nowMs ?? Date.now();
  return now - latest > timeout;
}

/* ---------- observation validation (§12) ---------- */

export interface ObservationCandidate {
  source: unknown;
  observedAt: unknown;
  keyword: unknown;
  country: unknown;
  device: unknown;
  engine: unknown;
  position: unknown;
  providerConfirmedAbsent: unknown;
  rankingUrl: unknown;
}

export interface ValidationResult {
  valid: boolean;
  reason: string;
  positionState: 'RANKING' | 'NOT_RANKING' | 'UNKNOWN';
}

const VALID_SOURCES = ['GSC', 'SERP_PROVIDER', 'MANUAL'];

export function validateObservation(
  input: ObservationCandidate,
): ValidationResult {
  const source = String(input.source ?? '').trim();
  if (!VALID_SOURCES.includes(source)) {
    return {
      valid: false,
      reason: `Unknown source "${source}" — discarded, never silently used.`,
      positionState: 'UNKNOWN',
    };
  }
  const at = new Date(String(input.observedAt ?? ''));
  if (Number.isNaN(at.getTime())) {
    return {
      valid: false,
      reason: 'Missing or invalid timestamp — marked unavailable with reason.',
      positionState: 'UNKNOWN',
    };
  }
  if (!String(input.keyword ?? '').trim()) {
    return {
      valid: false,
      reason: 'Missing keyword — discarded.',
      positionState: 'UNKNOWN',
    };
  }
  if (!String(input.country ?? '').trim()) {
    return {
      valid: false,
      reason: 'Missing country context — discarded.',
      positionState: 'UNKNOWN',
    };
  }
  const device = String(input.device ?? '')
    .trim()
    .toUpperCase();
  if (device !== 'DESKTOP' && device !== 'MOBILE') {
    return {
      valid: false,
      reason: `Unsupported device "${device}" — discarded.`,
      positionState: 'UNKNOWN',
    };
  }
  const engine = String(input.engine ?? '')
    .trim()
    .toUpperCase();
  if (engine !== 'GOOGLE') {
    return {
      valid: false,
      reason: `Unsupported engine "${engine}" — discarded.`,
      positionState: 'UNKNOWN',
    };
  }
  const pos =
    input.position === null || input.position === undefined
      ? null
      : Number(input.position);
  if (pos !== null && (!Number.isFinite(pos) || pos < 1)) {
    return {
      valid: false,
      reason: `Invalid position "${String(input.position)}" — marked unavailable with reason.`,
      positionState: 'UNKNOWN',
    };
  }
  if (pos === null) {
    return input.providerConfirmedAbsent === true
      ? {
          valid: true,
          reason: 'Provider explicitly confirmed absence from Top 100.',
          positionState: 'NOT_RANKING',
        }
      : {
          valid: true,
          reason:
            'Provider could not determine a position — UNKNOWN, never a loss.',
          positionState: 'UNKNOWN',
        };
  }
  return {
    valid: true,
    reason: 'Valid provider observation.',
    positionState: 'RANKING',
  };
}

/* ---------- change classification (§13/§14) ---------- */

export interface ClassifiedChange {
  event: RankChangeEvent;
  alertType: SearchAlertType;
  meaningful: boolean;
  statement: string;
}

export function classifyRankChange(input: {
  keyword: string;
  previous: number | null;
  current: number | null;
  previousConfirmedAbsent: boolean;
  currentConfirmedAbsent: boolean;
  previousExists: boolean;
  urlChanged: boolean;
  targetReplaced: boolean;
  serpFeatureGained: string[];
  serpFeatureLost: string[];
  competitorMoved: boolean;
  aiStateChanged: boolean;
}): ClassifiedChange[] {
  const out: ClassifiedChange[] = [];
  const {
    keyword,
    previous,
    current,
    previousExists,
    previousConfirmedAbsent,
    currentConfirmedAbsent,
  } = input;
  /* Provider failure / unknown: NO event. Failures
   * must not become rank loss. */
  if (current === null && !currentConfirmedAbsent) {
    return out;
  }
  if (current === null && currentConfirmedAbsent) {
    if (previous !== null && previousExists) {
      out.push({
        event: 'EXITED',
        alertType: 'RANK_LOSS',
        meaningful: true,
        statement: `“${keyword}” exited the Top 100 (previously #${previous}, observed).`,
      });
    }
    return out;
  }
  if (current !== null) {
    if (
      !previousExists ||
      (previous === null && !previousConfirmedAbsent)
    ) {
      out.push({
        event: 'ENTERED',
        alertType: 'RANK_GAIN',
        meaningful: false,
        statement: `“${keyword}” newly observed at #${current}.`,
      });
      return out;
    }
    if (
      previous === null &&
      previousConfirmedAbsent
    ) {
      out.push({
        event: 'ENTERED',
        alertType: 'TOP_10_ENTRY',
        meaningful: current <= 10,
        statement: `“${keyword}” returned at #${current} (observed).`,
      });
    } else if (previous !== null) {
      const delta = previous - current;
      if (delta !== 0) {
        const meaningful =
          Math.abs(delta) >= 3 ||
          (previous <= 3 && current > 3) ||
          (previous > 3 && current <= 3) ||
          (previous <= 10 && current > 10) ||
          (previous > 10 && current <= 10);
        const event: RankChangeEvent =
          delta > 0 ? 'GAINED' : 'LOST';
        let alertType: SearchAlertType =
          delta > 0 ? 'RANK_GAIN' : 'RANK_LOSS';
        if (previous <= 3 && current > 3) {
          alertType = 'TOP_3_EXIT';
        } else if (previous > 3 && current <= 3) {
          alertType = 'TOP_3_ENTRY';
        } else if (previous <= 10 && current > 10) {
          alertType = 'TOP_10_EXIT';
        } else if (previous > 10 && current <= 10) {
          alertType = 'TOP_10_ENTRY';
        }
        out.push({
          event,
          alertType,
          meaningful,
          statement:
            delta > 0
              ? `“${keyword}” gained ${delta} position${delta === 1 ? '' : 's'} (#${previous} → #${current}, observed).`
              : `“${keyword}” lost ${-delta} position${delta === -1 ? '' : 's'} (#${previous} → #${current}, observed).`,
        });
      }
    }
  }
  if (input.urlChanged) {
    out.push({
      event: 'URL_CHANGED',
      alertType: 'WRONG_URL',
      meaningful: input.targetReplaced,
      statement: input.targetReplaced
        ? `Target URL replaced for “${keyword}” — another page now ranks (observed).`
        : `Ranking URL changed for “${keyword}” (observed signal; interpretation via existing diagnosis).`,
    });
  }
  for (const f of input.serpFeatureGained) {
    out.push({
      event: 'SERP_FEATURE_GAINED',
      alertType: 'SERP_FEATURE_GAIN',
      meaningful: f === 'AI_OVERVIEW' || f === 'FEATURED_SNIPPET',
      statement: `SERP feature appeared for “${keyword}”: ${f} (observed).`,
    });
  }
  for (const f of input.serpFeatureLost) {
    out.push({
      event: 'SERP_FEATURE_LOST',
      alertType: 'SERP_FEATURE_LOSS',
      meaningful: f === 'AI_OVERVIEW' || f === 'FEATURED_SNIPPET',
      statement: `SERP feature no longer observed for “${keyword}”: ${f}.`,
    });
  }
  if (input.competitorMoved) {
    out.push({
      event: 'COMPETITOR_MOVEMENT',
      alertType: 'COMPETITOR_MOVEMENT',
      meaningful: true,
      statement: `Competitor movement observed for “${keyword}” (observed, no causal claim).`,
    });
  }
  if (input.aiStateChanged) {
    out.push({
      event: 'AI_STATE_CHANGED',
      alertType: 'AI_VISIBILITY_CHANGE',
      meaningful: true,
      statement: `AI visibility state changed for “${keyword}” (observed; AI is not a rank).`,
    });
  }
  return out;
}

/* ---------- AI change (§20/§21/§22) ----------
 * Never AI_RANK_*. */

export function classifyAiChange(input: {
  previousMention: boolean | null;
  currentMention: boolean | null;
  previousCitation: boolean | null;
  currentCitation: boolean | null;
  previousSource: string | null;
  currentSource: string | null;
  providerSupportsAi: boolean;
}): AiChangeEvent[] {
  if (!input.providerSupportsAi) return [];
  const out: AiChangeEvent[] = [];
  if (
    input.previousMention === false &&
    input.currentMention === true
  ) {
    out.push('AI_MENTION_GAINED');
  }
  if (
    input.previousMention === true &&
    input.currentMention === false
  ) {
    out.push('AI_MENTION_LOST');
  }
  if (
    input.previousCitation === false &&
    input.currentCitation === true
  ) {
    out.push('AI_CITATION_GAINED');
  }
  if (
    input.previousCitation === true &&
    input.currentCitation === false
  ) {
    out.push('AI_CITATION_LOST');
  }
  const prev = (input.previousSource ?? '').trim();
  const curr = (input.currentSource ?? '').trim();
  if (
    prev &&
    curr &&
    prev.toLowerCase() !== curr.toLowerCase()
  ) {
    out.push('AI_SOURCE_CHANGED');
  }
  return out;
}

export function aioState(input: {
  providerSupportsAi: boolean;
  observed: boolean | null;
}): AioState {
  if (!input.providerSupportsAi) return 'AIO_UNKNOWN';
  if (input.observed === true) return 'AIO_PRESENT';
  if (input.observed === false) return 'AIO_NOT_OBSERVED';
  return 'AIO_UNKNOWN';
}

/* ---------- action correlation (§25/§69) ---------- */

export function correlateAction(input: {
  recentVerifiedAction: boolean;
}): ActionCorrelation {
  return input.recentVerifiedAction
    ? 'PLANNED_CHANGE'
    : 'UNPLANNED_CHANGE';
}

export function gainAfterVerifiedChange(input: {
  keyword: string;
  before: number | null;
  after: number | null;
  verified: boolean;
}): string {
  if (
    !input.verified ||
    input.before === null ||
    input.after === null
  ) {
    return `“${input.keyword}”: movement observed after an unverified window — outcome unknown, not zero.`;
  }
  if (input.after < input.before) {
    return `RANK_GAIN_AFTER_VERIFIED_CHANGE: “${input.keyword}” rank improved after the verified change (#${input.before} → #${input.after}). Temporal association only — not proof the change caused it.`;
  }
  return `“${input.keyword}” observed at #${input.after} after the verified change (before #${input.before}). Observed outcome only.`;
}

/* ---------- dedupe (§27) ---------- */

export function alertDedupeKey(input: {
  eventType: string;
  websiteId: string;
  keywordOrPage: string;
  windowKey: string;
  before: string;
  after: string;
}): string {
  return [
    'SEARCH_CHANGE',
    String(input.eventType ?? '').trim().toUpperCase(),
    String(input.websiteId ?? '').trim(),
    String(input.keywordOrPage ?? '')
      .trim()
      .toLowerCase(),
    String(input.windowKey ?? '').trim(),
    String(input.before ?? '').trim(),
    String(input.after ?? '').trim(),
  ].join('|');
}

/* ---------- cooldown (§28) ---------- */

export interface CooldownDecision {
  notify: boolean;
  reason: string;
}

export function cooldownDecision(input: {
  lastNotifiedAt: string | null;
  currentBefore: string;
  currentAfter: string;
  lastBefore: string | null;
  lastAfter: string | null;
  nowIso?: string;
  cooldownMs?: number;
}): CooldownDecision {
  const cooldown = input.cooldownMs ?? ALERT_COOLDOWN_MS;
  const meaningfulNew =
    input.lastBefore !== input.currentBefore ||
    input.lastAfter !== input.currentAfter;
  if (meaningfulNew) {
    return {
      notify: true,
      reason: 'Meaningful new movement — notify despite cooldown.',
    };
  }
  if (!input.lastNotifiedAt) {
    return { notify: true, reason: 'First notification.' };
  }
  const last = new Date(input.lastNotifiedAt).getTime();
  const now = new Date(
    input.nowIso ?? new Date().toISOString(),
  ).getTime();
  if (!Number.isFinite(last) || !Number.isFinite(now)) {
    return {
      notify: false,
      reason: 'Same condition, timestamps unclear — suppress rather than spam.',
    };
  }
  if (now - last >= cooldown) {
    return {
      notify: true,
      reason: 'Cooldown expired — re-notify once.',
    };
  }
  return {
    notify: false,
    reason:
      'Same condition within cooldown — suppressed. Evidence retained, nothing deleted.',
  };
}

/* ---------- resolution (§29/§56) ---------- */

export interface ResolutionDecision {
  status: AlertLifecycle;
  newEvent: boolean;
  note: string;
}

export function evaluateResolution(input: {
  alertType: SearchAlertType;
  previous: number | null;
  current: number | null;
}): ResolutionDecision {
  /* Top-10 exit resolves only when the condition
   * objectively reverses (back in Top 10); the new
   * gain is a separate event. */
  if (
    (input.alertType === 'TOP_10_EXIT' ||
      input.alertType === 'TOP_3_EXIT' ||
      input.alertType === 'RANK_LOSS') &&
    input.current !== null &&
    input.previous !== null &&
    input.current < input.previous &&
    input.current <= 10
  ) {
    return {
      status: 'RESOLVED',
      newEvent: true,
      note: 'Underlying condition objectively reversed — original event RESOLVED; the gain is a new event.',
    };
  }
  if (
    input.alertType === 'RANK_GAIN' &&
    input.current !== null &&
    input.previous !== null &&
    input.current > input.previous &&
    input.current > 10
  ) {
    return {
      status: 'RESOLVED',
      newEvent: true,
      note: 'Gain reversed — original event RESOLVED; the loss is a new event.',
    };
  }
  return {
    status: 'OPEN',
    newEvent: false,
    note: 'Condition persists — stays OPEN. Acknowledging is not resolving.',
  };
}

/* ---------- digest (§40/§41/§42) ---------- */

export interface DigestItem {
  alertType: SearchAlertType;
  title: string;
  positive: boolean;
  divergence: boolean;
}

export interface SearchDigest {
  title: string;
  total: number;
  positive: number;
  negative: number;
  divergences: number;
  topAttention: string | null;
  items: DigestItem[];
  note: string;
}

const POSITIVE_TYPES: SearchAlertType[] = [
  'RANK_GAIN',
  'TOP_10_ENTRY',
  'TOP_3_ENTRY',
  'SERP_FEATURE_GAIN',
  'EXECUTION_VERIFIED',
];

export function buildDigest(
  items: DigestItem[],
  maxItems: number = MAX_DIGEST_ITEMS,
): SearchDigest {
  const capped = items.slice(0, Math.max(1, maxItems));
  const positive = capped.filter((i) => i.positive).length;
  const negative = capped.filter(
    (i) => !i.positive && !i.divergence,
  ).length;
  const divergences = capped.filter(
    (i) => i.divergence,
  ).length;
  const attention =
    capped.find(
      (i) =>
        i.alertType === 'TOP_10_EXIT' ||
        i.alertType === 'TOP_3_EXIT' ||
        i.alertType === 'WRONG_URL',
    ) ?? capped[0] ??
    null;
  return {
    title: 'SEARCH CHANGES',
    total: items.length,
    positive,
    negative,
    divergences,
    topAttention: attention ? attention.title : null,
    items: capped,
    note:
      items.length > capped.length
        ? `Showing ${capped.length} of ${items.length} meaningful changes — digest default, never 50 alerts.`
        : `${capped.length} meaningful change${capped.length === 1 ? '' : 's'} — noise suppressed.`,
  };
}

/* ---------- evidence envelope (§17/§46) ---------- */

export interface EvidenceEnvelope {
  whatChanged: string;
  evidence: string;
  evidenceState: EvidenceState3;
  whatWeKnow: string;
  whatWeDontKnow: string;
  investigation: string[];
}

export function evidenceEnvelope(input: {
  keyword: string;
  before: number | null;
  after: number | null;
  rankingUrl: string | null;
  evidenceState: EvidenceState3;
}): EvidenceEnvelope {
  return {
    whatChanged:
      input.before !== null && input.after !== null
        ? `“${input.keyword}” #${input.before} → #${input.after}.`
        : `“${input.keyword}” movement partially unobserved.`,
    evidence:
      input.evidenceState === 'VERIFIED'
        ? 'Search Console aggregate window.'
        : input.evidenceState === 'OBSERVED'
          ? `Tracked SERP observation${input.rankingUrl ? ` on ${input.rankingUrl}` : ''}.`
          : `${input.evidenceState} — labeled, not observed.`,
    evidenceState: input.evidenceState,
    whatWeKnow: 'Position changed (observed).',
    whatWeDontKnow: 'Cause is not established.',
    investigation: [
      'Page intent',
      'Competitive gap',
      'Content freshness',
    ],
  };
}

/* ---------- preferences + mute (§54/§55) ---------- */

const ALL_SCOPES: AlertScope[] = [
  'RANK',
  'AI',
  'COMPETITOR',
  'SITE',
  'EXECUTION',
];

export function normalizeScopes(
  value: unknown,
): AlertScope[] {
  if (!Array.isArray(value)) return [...ALL_SCOPES];
  const out: AlertScope[] = [];
  for (const item of value) {
    const v = String(item ?? '').trim().toUpperCase();
    if (
      (ALL_SCOPES as string[]).includes(v) &&
      !out.includes(v as AlertScope)
    ) {
      out.push(v as AlertScope);
    }
  }
  return out.length > 0 ? out : [...ALL_SCOPES];
}

export function isMuted(input: {
  mutedTypes: string[];
  mutedKeywords: string[];
  alertType: string;
  keyword: string;
  nowIso?: string;
  muteUntil?: Record<string, string>;
}): { muted: boolean; note: string } {
  const type = String(input.alertType ?? '')
    .trim()
    .toUpperCase();
  const kw = String(input.keyword ?? '')
    .trim()
    .toLowerCase();
  const until = input.muteUntil?.[type] ?? input.muteUntil?.[kw];
  if (until) {
    const exp = new Date(until).getTime();
    const now = new Date(
      input.nowIso ?? new Date().toISOString(),
    ).getTime();
    if (Number.isFinite(exp) && Number.isFinite(now) && now > exp) {
      return {
        muted: false,
        note: 'Mute expired — notifications resume.',
      };
    }
  }
  if (
    input.mutedTypes.map((t) => t.toUpperCase()).includes(type) ||
    input.mutedKeywords.map((k) => k.toLowerCase()).includes(kw)
  ) {
    return {
      muted: true,
      note: 'Muted — evidence retained, nothing deleted. Muted ≠ nonexistent.',
    };
  }
  return { muted: false, note: 'Not muted.' };
}

/* ---------- health (§52/§53) + observability (§62) ---------- */

export function changeHealth(input: {
  scheduleCount: number;
  providerConfigured: boolean;
  lastRunStatus: ChangeRunStatus | null;
  lastSuccessAt: string | null;
  lastRunAt: string | null;
  staleAfterHours: number;
  nowIso?: string;
}): ChangeHealth {
  if (input.scheduleCount === 0) return 'NOT_CONFIGURED';
  if (!input.providerConfigured) return 'UNAVAILABLE';
  if (input.lastRunStatus === 'FAILED') return 'FAILED';
  if (
    input.lastRunStatus === 'PARTIAL' ||
    input.lastRunStatus === 'QUEUED' ||
    input.lastRunStatus === 'RUNNING' ||
    input.lastRunStatus === 'CANCELLED'
  ) {
    return 'PARTIAL';
  }
  /* Configured, provider reachable, but no run has
   * ever executed: ACTIVE (awaiting first run) —
   * distinct from HEALTHY (proven fresh success)
   * and from STALE (a previously running loop gone
   * quiet). */
  if (!input.lastRunAt && !input.lastSuccessAt) {
    return 'ACTIVE';
  }
  if (!input.lastRunAt) return 'STALE';
  const now = new Date(
    input.nowIso ?? new Date().toISOString(),
  ).getTime();
  const last = new Date(input.lastRunAt).getTime();
  if (!Number.isFinite(last)) return 'STALE';
  if ((now - last) / (1000 * 60 * 60) > input.staleAfterHours) {
    return 'STALE';
  }
  if (!input.lastSuccessAt) return 'PARTIAL';
  return 'HEALTHY';
}

export interface SchedulerObservability {
  lastTickAt: string | null;
  lastRunAt: string | null;
  lastSuccessfulRunAt: string | null;
  currentlyRunning: number;
  recoveries: number;
  providerUnavailableCount: number;
  note: string;
}

export function observabilityShape(input: {
  lastTickAt: string | null;
  lastRunAt: string | null;
  lastSuccessfulRunAt: string | null;
  currentlyRunning: number;
  recoveries: number;
  providerUnavailableCount: number;
}): SchedulerObservability {
  return {
    ...input,
    note: 'Raw counts and timestamps only — no health score, no fake percentages.',
  };
}

/* ---------- timezone-aware digest day (§48) ---------- */

export function digestDayKey(
  atIso: string,
  timeZone: string,
): string {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return fmt.format(new Date(atIso));
  } catch {
    return new Date(atIso).toISOString().slice(0, 10);
  }
}

/* ---------- SEARCH_AI_DIVERGENCE (§38) ---------- */

export function searchAiDivergenceNote(input: {
  rankImproved: boolean | null;
  citationLost: boolean | null;
}): string | null {
  if (
    input.rankImproved === true &&
    input.citationLost === true
  ) {
    return 'SEARCH_AI_DIVERGENCE — GOOGLE: IMPROVED, AI: CITATION_LOST. Descriptive state, not a score.';
  }
  return null;
}

/* ---------- run identity (§9) ---------- */

export function changeRunIdentity(input: {
  organizationId: string;
  websiteId: string;
  windowKey: string;
}): string {
  return [
    String(input.organizationId ?? '').trim(),
    String(input.websiteId ?? '').trim(),
    String(input.windowKey ?? '').trim(),
  ].join('|');
}

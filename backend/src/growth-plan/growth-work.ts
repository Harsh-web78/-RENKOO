/*
 * =========================================================
 * GOVERNED GROWTH WORK QUEUE 1.0 — pure functions
 * (Phase 36).
 *
 * Operational composition over EXISTING actions:
 * GROWTH PLAN → DECISION → EXISTING ACTION → WORK ITEM
 * → OWNER/STATUS/APPROVAL → EXECUTION → VERIFICATION
 * → MEASUREMENT.
 *
 * Non-negotiable:
 * - No new action/recommendation/execution/approval/
 *   verification/measurement engine. Existing Action
 *   state is the source of truth; queue states are a
 *   read-only mapping.
 * - QUEUE ORDERING, never a Work Score.
 * - READY requires dependency + approval + evidence;
 *   blocked work is never presented as ready.
 * - No auto-execution, no auto-publish, no blind
 *   retries, no autonomous bulk execution.
 * - EXECUTED ≠ VERIFIED; execution ≠ success.
 * - No invented owners, capacity, hours, forecasts,
 *   revenue, or causality.
 * - Same action never yields duplicate queue items;
 *   DISMISSED never auto-resurrects.
 * =========================================================
 */

import { createHash } from 'node:crypto';

export type WorkType =
  | 'IMPROVE_PAGE'
  | 'CREATE_PAGE'
  | 'CONSOLIDATE_PAGES'
  | 'PROTECT_PAGE'
  | 'FIX_TECHNICAL'
  | 'INTERNAL_LINK'
  | 'AI_VISIBILITY'
  | 'CONTENT_REFRESH'
  | 'VERIFY_CHANGE'
  | 'MEASURE_OUTCOME'
  | 'INVESTIGATE'
  | 'GENERAL';

export type QueueSection =
  | 'TODAY'
  | 'READY'
  | 'AWAITING_APPROVAL'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'VERIFY'
  | 'MEASURE'
  | 'COMPLETED';

export type QueueStatus =
  | 'READY'
  | 'IN_PROGRESS'
  | 'AWAITING_APPROVAL'
  | 'BLOCKED'
  | 'EXECUTED'
  | 'VERIFYING'
  | 'VERIFIED'
  | 'MEASURING'
  | 'COMPLETED'
  | 'WAITING'
  | 'DISMISSED';

export type ApprovalState =
  | 'NOT_REQUIRED'
  | 'REQUIRED_NOT_REQUESTED'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'DENIED'
  | 'UNKNOWN';

export type BlockerKind =
  | 'GSC_NOT_CONNECTED'
  | 'GA4_NOT_CONNECTED'
  | 'CRAWL_REQUIRED'
  | 'APPROVAL_REQUIRED'
  | 'APPROVAL_DENIED'
  | 'DEPENDENCY_INCOMPLETE'
  | 'VERIFICATION_REQUIRED'
  | 'MEASUREMENT_UNAVAILABLE'
  | 'CMS_NOT_CONNECTED'
  | 'PROVIDER_UNAVAILABLE'
  | 'STALE_EVIDENCE'
  | 'NONE';

export type ClientApprovalState =
  | 'READY_FOR_REVIEW'
  | 'AWAITING_CLIENT_APPROVAL'
  | 'APPROVED'
  | 'EXECUTING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'NOT_APPLICABLE';

export const QUEUE_SECTIONS: QueueSection[] = [
  'TODAY',
  'READY',
  'AWAITING_APPROVAL',
  'IN_PROGRESS',
  'BLOCKED',
  'VERIFY',
  'MEASURE',
  'COMPLETED',
];

export const MAX_TODAY = 5;
export const MAX_READY = 20;
export const MAX_SECTION = 25;
export const STALE_AFTER_DAYS = 60;

/* ---------- work types ---------- */

export function workTypeFor(
  actionType: unknown,
  decisionType: unknown,
): WorkType {
  const raw = `${String(actionType ?? '')} ${String(decisionType ?? '')}`.toUpperCase();
  if (/CONSOLIDAT/.test(raw)) return 'CONSOLIDATE_PAGES';
  if (/CREATE/.test(raw)) return 'CREATE_PAGE';
  if (/PROTECT/.test(raw)) return 'PROTECT_PAGE';
  if (/TECHNICAL|FIX|CRAWL/.test(raw)) return 'FIX_TECHNICAL';
  if (/INTERNAL|ORPHAN|CONNECT/.test(raw)) return 'INTERNAL_LINK';
  if (/AI_|CITATION|GEO|PROMPT/.test(raw)) return 'AI_VISIBILITY';
  if (/REFRESH/.test(raw)) return 'CONTENT_REFRESH';
  if (/VERIFY/.test(raw)) return 'VERIFY_CHANGE';
  if (/MEASURE|TRACK|MONITOR/.test(raw)) return 'MEASURE_OUTCOME';
  if (/IMPROVE|OPTIMIZ/.test(raw)) return 'IMPROVE_PAGE';
  if (/INVESTIGATE/.test(raw)) return 'INVESTIGATE';
  return 'GENERAL';
}

/* ---------- queue status mapping (§6) ----------
 * Existing Action state stays the source of truth. */

export function queueStatusFor(input: {
  actionStatus: string | null;
  proposalStatus: string | null;
  verificationState: string | null;
  measurementPending: boolean;
  blocked: boolean;
  waiting: boolean;
}): QueueStatus {
  if (input.blocked) return 'BLOCKED';
  const status = String(input.actionStatus ?? '').trim().toUpperCase();
  const proposal = String(input.proposalStatus ?? '').trim().toUpperCase();
  const verified =
    String(input.verificationState ?? '').trim().toUpperCase() ===
      'VERIFIED' ||
    String(input.verificationState ?? '').trim().toUpperCase() ===
      'PARTIALLY_VERIFIED';
  if (status === 'DISMISSED') return 'DISMISSED';
  /* A proposal awaiting review gates the next
   * execution step whatever the action state. */
  if (proposal === 'READY_FOR_REVIEW') return 'AWAITING_APPROVAL';
  if (status === 'DONE') {
    if (!verified) return 'VERIFYING';
    return input.measurementPending ? 'MEASURING' : 'COMPLETED';
  }
  if (status === 'IN_PROGRESS') {
    if (proposal === 'EXECUTED' || proposal === 'EXECUTING') {
      return 'EXECUTED';
    }
    return 'IN_PROGRESS';
  }
  /* TODO and friends (READY_FOR_REVIEW handled above). */
  if (proposal === 'REJECTED' || proposal === 'CANCELLED') {
    return 'BLOCKED';
  }
  if (input.waiting) return 'WAITING';
  return 'READY';
}

/* ---------- READY gate (§9) ---------- */

export interface ReadyGate {
  ready: boolean;
  sectionIfNot: 'WAITING' | 'BLOCKED' | 'AWAITING_APPROVAL';
  reasons: string[];
}

export function readyGate(input: {
  hasAction: boolean;
  dependencySatisfied: boolean;
  approvalSatisfied: boolean;
  approvalPending: boolean;
  approvalDenied: boolean;
  evidencePresent: boolean;
  executionPath: boolean;
}): ReadyGate {
  const reasons: string[] = [];
  if (!input.hasAction) {
    reasons.push('No existing action — propose through the governed flow.');
  }
  if (!input.dependencySatisfied) {
    reasons.push('Prerequisite dependency incomplete.');
  }
  if (input.approvalDenied) {
    return {
      ready: false,
      sectionIfNot: 'BLOCKED',
      reasons: [...reasons, 'Approval denied — blocked until re-proposed.'],
    };
  }
  if (input.approvalPending) {
    return {
      ready: false,
      sectionIfNot: 'AWAITING_APPROVAL',
      reasons: [...reasons, 'Proposal awaiting review — no execution until approved.'],
    };
  }
  if (!input.approvalSatisfied) {
    reasons.push('Approval requirement unsatisfied where needed.');
  }
  if (!input.evidencePresent) {
    reasons.push('Required evidence missing.');
  }
  if (!input.executionPath) {
    reasons.push('No execution path available (e.g. provider not connected).');
  }
  if (reasons.length > 0) {
    const blocked = reasons.some((r) =>
      /denied|no execution path/i.test(r),
    );
    return {
      ready: false,
      sectionIfNot: blocked ? 'BLOCKED' : 'WAITING',
      reasons,
    };
  }
  return { ready: true, sectionIfNot: 'WAITING', reasons: [] };
}

/* ---------- approval (§10/§18) ---------- */

export function approvalStateFor(
  proposalStatus: unknown,
  approvalRequired: boolean,
): ApprovalState {
  const p = String(proposalStatus ?? '').trim().toUpperCase();
  if (p === 'APPROVED') return 'APPROVED';
  if (p === 'READY_FOR_REVIEW') return 'PENDING_REVIEW';
  if (p === 'REJECTED' || p === 'CANCELLED') return 'DENIED';
  if (p === '' || p === 'DRAFT') {
    return approvalRequired ? 'REQUIRED_NOT_REQUESTED' : 'NOT_REQUIRED';
  }
  if (p === 'EXECUTED' || p === 'EXECUTING' || p === 'VERIFICATION_PENDING') {
    return 'APPROVED';
  }
  return 'UNKNOWN';
}

export function approvalPack(input: {
  title: string;
  why: string;
  evidence: string;
  page: string | null;
  changeType: string;
  risk: string;
}): string[] {
  return [
    `WHAT WILL CHANGE: ${input.title} (${input.changeType}).`,
    `WHY: ${input.why}`,
    `SOURCE EVIDENCE: ${input.evidence}`,
    `AFFECTED PAGE: ${input.page ?? 'not page-bound'}.`,
    `RISK / PROTECTION GATES: ${input.risk} Approval is human — never automatic.`,
  ];
}

export function clientApprovalFor(input: {
  proposalStatus: string | null;
  actionStatus: string | null;
  verificationState: string | null;
}): ClientApprovalState {
  const p = String(input.proposalStatus ?? '').trim().toUpperCase();
  const a = String(input.actionStatus ?? '').trim().toUpperCase();
  const v = String(input.verificationState ?? '').trim().toUpperCase();
  if (p === 'READY_FOR_REVIEW') return 'READY_FOR_REVIEW';
  if (p === 'APPROVED' && a === 'TODO') return 'APPROVED';
  if (p === 'APPROVED' || a === 'IN_PROGRESS') {
    if (v === 'VERIFIED' || v === 'PARTIALLY_VERIFIED') {
      return 'VERIFYING';
    }
    return 'EXECUTING';
  }
  if (a === 'DONE') {
    if (v === 'VERIFIED' || v === 'PARTIALLY_VERIFIED') {
      return 'COMPLETED';
    }
    return 'VERIFYING';
  }
  if (p === '' || p === 'DRAFT') return 'NOT_APPLICABLE';
  return 'AWAITING_CLIENT_APPROVAL';
}

/* ---------- blockers (§14) ---------- */

export function blockerNote(kind: BlockerKind): string {
  switch (kind) {
    case 'NONE':
      return 'No blockers.';
    case 'STALE_EVIDENCE':
      return 'STALE_EVIDENCE — based on old evidence; review before executing, never silently execute.';
    default:
      return `${kind} — explicit blocker; no workaround fabricated.`;
  }
}

/* ---------- owner + capacity (§16/§17) ---------- */

export function ownerFor(metadataOwner: unknown): string {
  const owner = String(metadataOwner ?? '').trim();
  return owner !== '' ? owner : 'OWNER_UNASSIGNED';
}

export function capacityNote(): string {
  return 'CAPACITY_UNKNOWN — no hours, effort, developer days, cost, or completion probability invented. Ordering still works.';
}

/* ---------- stale evidence (§30) ---------- */

export function isStaleWork(input: {
  updatedAtIso: string | null;
  status: string;
  nowIso?: string;
  staleAfterDays?: number;
}): boolean {
  const status = String(input.status ?? '').trim().toUpperCase();
  if (status !== 'TODO' && status !== 'IN_PROGRESS') return false;
  if (!input.updatedAtIso) return false;
  const updated = new Date(input.updatedAtIso).getTime();
  const now = new Date(input.nowIso ?? new Date().toISOString()).getTime();
  if (!Number.isFinite(updated) || !Number.isFinite(now)) {
    return false;
  }
  return (
    now - updated >
    (input.staleAfterDays ?? STALE_AFTER_DAYS) * 24 * 60 * 60 * 1000
  );
}

/* ---------- idempotency (§31) ---------- */

export function workFingerprint(input: {
  organizationId: string;
  websiteId: string;
  actionId: string;
}): string {
  return createHash('sha256')
    .update(
      [
        String(input.organizationId ?? '').trim(),
        String(input.websiteId ?? '').trim(),
        String(input.actionId ?? '').trim(),
      ].join('|'),
    )
    .digest('hex')
    .slice(0, 32);
}

/* ---------- TODAY ordering (§8) ----------
 * Lexicographic rank tuple — QUEUE ORDERING, never a
 * Work Score. */

export interface TodaySignals {
  inNow: boolean;
  queueReady: boolean;
  dependencyReady: boolean;
  priorityBand: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  goalAlignment: 'DIRECT' | 'STRONG' | 'CONTEXTUAL' | 'WEAK' | 'UNKNOWN' | null;
  evidenceComplete: boolean;
}

function bandRank(b: TodaySignals['priorityBand']): number {
  if (b === 'HIGH') return 0;
  if (b === 'MEDIUM') return 1;
  if (b === 'LOW') return 2;
  return 3;
}

function alignRank(a: TodaySignals['goalAlignment']): number {
  if (a === 'DIRECT') return 0;
  if (a === 'STRONG') return 1;
  if (a === 'CONTEXTUAL') return 2;
  if (a === 'WEAK') return 3;
  return 4;
}

export function todayRank(s: TodaySignals): number[] {
  return [
    s.inNow ? 0 : 1,
    s.queueReady ? 0 : 1,
    s.dependencyReady ? 0 : 1,
    bandRank(s.priorityBand),
    alignRank(s.goalAlignment),
    s.evidenceComplete ? 0 : 1,
    0,
  ];
}

export function compareToday(
  a: TodaySignals,
  b: TodaySignals,
): number {
  const ra = todayRank(a);
  const rb = todayRank(b);
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] !== rb[i]) return ra[i] - rb[i];
  }
  return 0;
}

export function todayReason(
  winner: TodaySignals,
  loser: TodaySignals,
): string {
  const names = [
    'NOW decisions',
    'READY actions',
    'prerequisite satisfied',
    'existing HIGH priority',
    'business-goal alignment',
    'evidence completeness',
    'dependency readiness',
  ];
  const a = todayRank(winner);
  const b = todayRank(loser);
  for (let i = 0; i < names.length; i++) {
    if (a[i] < b[i]) {
      return `Picked first by ${names[i]} (queue ordering, not a score).`;
    }
  }
  return 'Picked first by deterministic fingerprint tie-break.';
}

/* ---------- reconsideration (§29) ---------- */

export interface Reconsideration {
  available: boolean;
  note: string;
}

export function reconsideration(input: {
  actionDismissed: boolean;
  evidenceMateriallyChanged: boolean;
  rulesAllow: boolean;
}): Reconsideration {
  if (!input.actionDismissed) {
    return { available: false, note: 'Action not dismissed.' };
  }
  if (
    input.evidenceMateriallyChanged &&
    input.rulesAllow
  ) {
    return {
      available: true,
      note: 'RECONSIDERATION_AVAILABLE — evidence materially changed and existing rules allow a fresh proposal. Never auto-resurrected.',
    };
  }
  return {
    available: false,
    note: 'Dismissed actions stay dismissed without material evidence change.',
  };
}

/* ---------- section assignment (§7) ----------
 * One item, one section — never duplicated. */

export type WorkSection =
  | 'TODAY'
  | 'READY'
  | 'AWAITING_APPROVAL'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'VERIFY'
  | 'MEASURE'
  | 'COMPLETED'
  | 'WAITING';

export function assignQueueSection(
  status: QueueStatus,
  today: boolean,
): WorkSection {
  if (
    today &&
    (status === 'READY' || status === 'IN_PROGRESS')
  ) {
    return 'TODAY';
  }
  switch (status) {
    case 'READY':
      return 'READY';
    case 'AWAITING_APPROVAL':
      return 'AWAITING_APPROVAL';
    case 'IN_PROGRESS':
      return 'IN_PROGRESS';
    case 'BLOCKED':
      return 'BLOCKED';
    case 'EXECUTED':
    case 'VERIFYING':
      return 'VERIFY';
    case 'VERIFIED':
    case 'MEASURING':
      return 'MEASURE';
    case 'COMPLETED':
      return 'COMPLETED';
    default:
      return 'WAITING';
  }
}

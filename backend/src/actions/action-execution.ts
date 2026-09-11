/*
 * =========================================================
 * GOVERNED AI SEARCH GROWTH WORKFLOW 1.0 — pure functions
 * (Phase 29).
 *
 * SEARCH GROWTH COPILOT, not autonomous bot. Human
 * remains the approval authority. RENKOO proposes with
 * evidence, executes only approved payloads through
 * supported integrations, verifies live, measures
 * afterward, remembers the result.
 *
 * Research grounding (Sept 2026):
 * - Agents are reliable on bounded reversible work
 *   with acceptance tests; strategy/brand/uncertain
 *   evidence stays human (TotalAuthority, OFFICIAL-grade
 *   vendor analysis).
 * - Approval gates are the category safety mechanism;
 *   broad auto-publishing is not a responsible default
 *   (Indexable; Finseo inline-diff approval; Ranki
 *   post-publish verify + rollback).
 * - Honest split: finding/measuring/verifying can run
 *   unattended; the site change stays human-gated
 *   (MyAgenticSEO supervised loop).
 * - WordPress REST/Application Passwords, Shopify
 *   Custom App/scoped tokens, Webflow draft-first
 *   Collections API (OFFICIAL docs patterns).
 *
 * Rules: ALL WRITES REQUIRE HUMAN APPROVAL (AUTO_ALLOWED
 * never executes in this phase). No ExecutionScore,
 * SuccessScore, AgentScore. No arbitrary URL writes.
 * No CMS writes without a supported integration (none
 * connected: COPY/EXPORT/MANUAL only). No causality.
 * =========================================================
 */

export type ProposalStatus =
  | 'DRAFT'
  | 'READY_FOR_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXECUTING'
  | 'EXECUTED'
  | 'VERIFICATION_PENDING'
  | 'VERIFIED'
  | 'PARTIALLY_VERIFIED'
  | 'CONFLICTING'
  | 'FAILED'
  | 'CANCELLED';

export type RiskLevel =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'BLOCKED';

export type ConnectionStatus =
  | 'CONNECTED'
  | 'NOT_CONNECTED'
  | 'NOT_SUPPORTED'
  | 'AUTH_REQUIRED'
  | 'PERMISSION_REQUIRED'
  | 'UNAVAILABLE';

export type SupportedExecution =
  | 'TITLE'
  | 'META'
  | 'H1'
  | 'H2'
  | 'INTERNAL_LINK'
  | 'STRUCTURED_DATA'
  | 'CLAIM'
  | 'ENTITY'
  | 'CONTENT_SECTION';

export type BlockedExecution =
  | 'URL_CHANGE'
  | 'REDIRECT'
  | 'ROBOTS'
  | 'CANONICAL'
  | 'PAGE_DELETE'
  | 'MASS_PUBLISH'
  | 'BACKLINK'
  | 'SERVER'
  | 'DNS'
  | 'AUTH'
  | 'CODE_DEPLOY';

export interface Proposal {
  version: number;
  actionId: string;
  targetUrl: string;
  actionType: string;
  problem: string;
  customerNeed: string | null;
  evidence: string[];
  currentState: string | null;
  proposedState: string;
  expectedChange: string;
  risk: RiskLevel;
  verificationMethod: string;
  measurementPlan: string;
  approvalRequired: true;
  status: ProposalStatus;
  createdAt: string;
  createdBy: string | null;
  aiProposed: boolean;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  executedAt: string | null;
}

export const APPROVAL_CONFIRMATION_COPY =
  'You are approving this exact change for this exact URL.';

export const AI_PROPOSAL_UNAVAILABLE =
  'AI proposal generation is unavailable: no AI provider is connected for proposals. Deterministic proposals and manual editing remain available.';

export const EXECUTION_NOT_CONNECTED =
  'Connect a supported CMS to execute. Until then: copy the approved change, export it, or mark manual execution.';

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

/* ---------- risk ---------- */

export function riskFor(
  actionType: string,
  targetElement: string | null,
): RiskLevel {
  const upper = clean(targetElement).toUpperCase();
  if (
    [
      'URL_CHANGE',
      'REDIRECT',
      'ROBOTS',
      'CANONICAL',
      'PAGE_DELETE',
      'MASS_PUBLISH',
      'BACKLINK',
      'SERVER',
      'DNS',
      'AUTH',
      'CODE_DEPLOY',
    ].includes(upper)
  )
    return 'BLOCKED';
  if (
    upper === 'TITLE' ||
    upper === 'META' ||
    upper === 'H1'
  )
    return 'LOW';
  if (
    upper === 'H2' ||
    upper === 'CONTENT_SECTION' ||
    upper === 'STRUCTURED_DATA' ||
    upper === 'CLAIM' ||
    upper === 'ENTITY' ||
    upper === 'INTERNAL_LINK'
  )
    return 'MEDIUM';
  void actionType;
  return 'MEDIUM';
}

export function isExecutableTarget(
  targetElement: string | null,
): boolean {
  return (
    riskFor('', targetElement) === 'LOW' ||
    riskFor('', targetElement) === 'MEDIUM'
  );
}

/* ---------- versioning + approval ---------- */

export function nextVersion(
  existing: Proposal[],
): number {
  const max = existing.reduce(
    (top, proposal) =>
      Math.max(
        top,
        Number(proposal.version) > 0
          ? Math.floor(Number(proposal.version))
          : 0,
      ),
    0,
  );
  return max + 1;
}

export function approvalValid(
  proposal: Proposal,
  currentVersion: number,
): boolean {
  return (
    proposal.status === 'APPROVED' &&
    proposal.version === currentVersion &&
    proposal.approvedAt !== null &&
    proposal.approvedBy !== null
  );
}

export function confirmApprovalCopy(
  proposal: Proposal,
): string {
  return (
    `${APPROVAL_CONFIRMATION_COPY} URL: ${proposal.targetUrl}. ` +
    `Current: ${proposal.currentState ?? 'unavailable'}. ` +
    `Proposed: ${proposal.proposedState}. ` +
    `Evidence: ${proposal.evidence.length} source(s). ` +
    `Version: v${proposal.version}. ` +
    `Integration: manual/CMS as connected. ` +
    `Rollback: ${proposal.risk === 'LOW' ? 'restore previous value where supported' : 'unavailable unless the integration supports it'}.`
  );
}

/* ---------- stale + target protection ---------- */

export function isStale(
  proposalEvidenceAt: string | null,
  currentEvidenceAt: string | null,
): boolean {
  if (!proposalEvidenceAt || !currentEvidenceAt)
    return false;
  const proposalTime = new Date(proposalEvidenceAt).getTime();
  const currentTime = new Date(currentEvidenceAt).getTime();
  if (
    !Number.isFinite(proposalTime) ||
    !Number.isFinite(currentTime)
  )
    return false;
  return currentTime > proposalTime;
}

export interface TargetCheck {
  organizationMatch: boolean;
  websiteMatch: boolean;
  urlMatch: boolean;
  integrationConnected: boolean;
  permissionOk: boolean;
  versionApproved: boolean;
  actionAllowed: boolean;
}

export function targetProtected(
  check: TargetCheck,
): { ok: boolean; reason: string | null } {
  if (!check.organizationMatch)
    return { ok: false, reason: 'Organization mismatch.' };
  if (!check.websiteMatch)
    return { ok: false, reason: 'Website mismatch.' };
  if (!check.urlMatch)
    return { ok: false, reason: 'Target URL mismatch.' };
  if (!check.integrationConnected)
    return {
      ok: false,
      reason: 'No supported write integration is connected.',
    };
  if (!check.permissionOk)
    return { ok: false, reason: 'CMS permission is insufficient.' };
  if (!check.versionApproved)
    return {
      ok: false,
      reason: 'This proposal version requires re-approval.',
    };
  if (!check.actionAllowed)
    return {
      ok: false,
      reason: 'This action class is recommendation-only.',
    };
  return { ok: true, reason: null };
}

/* ---------- idempotency ---------- */

export function idempotencyKey(
  actionId: string,
  version: number,
  targetUrl: string,
): string {
  return [clean(actionId), version, clean(targetUrl)]
    .join('|')
    .toLowerCase();
}

/* ---------- hallucination guard ---------- */

const EVIDENCE_WORDS = (
  evidence: string[],
): Set<string> => {
  const words = new Set<string>();
  for (const source of evidence) {
    for (const word of clean(source)
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)) {
      if (word.length > 3) words.add(word);
    }
  }
  return words;
};

export function proposalSupported(
  proposedState: string,
  evidence: string[] | string,
): boolean {
  const sources = Array.isArray(evidence)
    ? evidence
    : [evidence];
  const proposed = clean(proposedState)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 4);
  if (proposed.length === 0) return true;
  const words = EVIDENCE_WORDS(sources);
  const hits = proposed.filter((word) =>
    words.has(word),
  ).length;
  return hits / proposed.length >= 0.4;
}

export function containsCausalClaim(
  text: unknown,
): boolean {
  const lowered = ` ${clean(text)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')} `;
  return [
    'caused',
    'resulted in',
    'because of',
    'led to',
    'therefore improved',
    'drove',
    'generated',
  ].some((phrase) => lowered.includes(` ${phrase} `));
}

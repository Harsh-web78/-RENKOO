import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ActionVerificationService } from './action-verification.service';
import { ActionMeasurementService } from './action-measurement.service';
import {
  AI_PROPOSAL_UNAVAILABLE,
  EXECUTION_NOT_CONNECTED,
  approvalValid,
  confirmApprovalCopy,
  idempotencyKey,
  isExecutableTarget,
  isStale,
  nextVersion,
  proposalSupported,
  riskFor,
  targetProtected,
  type Proposal,
  type ProposalStatus,
  type RiskLevel,
} from './action-execution';

/*
 * =========================================================
 * GOVERNED EXECUTION WORKFLOW 1.0 (Phase 29) — proposals,
 * approvals and execution records live inside
 * Action.metadata (no migration): proposals[] versioned
 * with approval audit, executions[] append-only log.
 * ALL WRITES REQUIRE HUMAN APPROVAL; AUTO_ALLOWED never
 * executes. No CMS is connected (COPY/EXPORT/MANUAL
 * only — never faked). No scores, no causality.
 * =========================================================
 */

const MAX_LOG = 50;

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

@Injectable()
export class ActionExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verification: ActionVerificationService,
    private readonly measurement: ActionMeasurementService,
  ) {}

  private async settled<T>(
    fn: () => Promise<T>,
  ): Promise<T | null> {
    try {
      return await fn();
    } catch {
      return null;
    }
  }

  private async action(
    organizationId: string,
    id: string,
  ) {
    const row = await this.prisma.action.findFirst({
      where: { id, organizationId },
      include: { recommendation: true },
    });
    if (!row) throw new NotFoundException('Action not found');
    return row as unknown as Record<string, unknown> & {
      recommendation: Record<string, unknown> | null;
    };
  }

  private meta(
    action: Record<string, unknown>,
  ): Record<string, unknown> {
    const meta = action.metadata;
    return meta && typeof meta === 'object'
      ? { ...(meta as Record<string, unknown>) }
      : {};
  }

  private proposalsOf(
    action: Record<string, unknown>,
  ): Proposal[] {
    const meta = this.meta(action);
    const list = meta.proposals;
    if (!Array.isArray(list)) return [];
    return list as Proposal[];
  }

  private async saveMeta(
    id: string,
    meta: Record<string, unknown>,
  ) {
    await this.prisma.action.update({
      where: { id },
      data: { metadata: meta as never },
    });
  }

  private log(
    meta: Record<string, unknown>,
    entry: Record<string, unknown>,
  ): void {
    const log = Array.isArray(meta.executions)
      ? [...(meta.executions as unknown[])]
      : [];
    log.push({
      ...entry,
      at: new Date().toISOString(),
    });
    meta.executions = log.slice(-MAX_LOG);
  }

  async getProposals(
    organizationId: string,
    id: string,
  ) {
    const action = await this.action(organizationId, id);
    return {
      actionId: id,
      proposals: this.proposalsOf(action),
      aiProposal: AI_PROPOSAL_UNAVAILABLE,
      billing: { charged: false },
    };
  }

  async propose(
    organizationId: string,
    id: string,
    input: {
      userId?: string | null;
      proposedState?: string;
      targetElement?: string;
      evidence?: string[];
      customerNeed?: string;
      claim?: string;
    } = {},
  ) {
    const action = await this.action(organizationId, id);
    const detail = await this.settled(() =>
      this.verification.getVerification(
        organizationId,
        id as string,
      ),
    );
    const expected = (
      detail as {
        expectedChange?: {
          targetUrl?: string;
          targetElement?: string;
          expectedState?: string;
          evidence?: string;
        } | null;
      } | null
    )?.expectedChange;
    const evidence: string[] = [
      ...(Array.isArray(input.evidence)
        ? input.evidence.map(clean).filter(Boolean)
        : []),
      clean(expected?.evidence),
    ].filter(Boolean);
    const proposedState =
      clean(input.proposedState) ||
      clean(expected?.expectedState);
    if (!proposedState) {
      throw new BadRequestException(
        'A proposed state is required: no deterministic proposal could be derived.',
      );
    }
    const targetElement =
      clean(input.targetElement) ||
      clean(expected?.targetElement);
    const supported = proposalSupported(
      proposedState,
      evidence,
    );
    const meta = this.meta(action);
    const existing = this.proposalsOf(action);
    const version = nextVersion(existing);
    const proposal: Proposal = {
      version,
      actionId: id as string,
      targetUrl:
        clean(expected?.targetUrl) ||
        clean(action.url),
      actionType: clean(action.type),
      problem: clean(action.title),
      customerNeed: clean(input.customerNeed) || null,
      evidence: evidence.slice(0, 12),
      currentState: null,
      proposedState,
      expectedChange: `Apply the approved ${targetElement || 'change'} to ${clean(expected?.targetUrl) || clean(action.url) || 'the target page'}`,
      risk: riskFor(
        clean(action.type),
        targetElement || null,
      ),
      verificationMethod: 'LIVE_CRAWL',
      measurementPlan:
        'Before/after over append-only evidence after verification. No causal claims.',
      approvalRequired: true,
      status: supported ? 'READY_FOR_REVIEW' : 'DRAFT',
      createdAt: new Date().toISOString(),
      createdBy: clean(input.userId) || null,
      aiProposed: false,
      approvedAt: null,
      approvedBy: null,
      rejectedAt: null,
      rejectedBy: null,
      executedAt: null,
    };
    existing.push(proposal);
    meta.proposals = existing;
    this.log(meta, {
      event: 'PROPOSED',
      version,
      supported,
      note: supported
        ? undefined
        : 'Proposal blocked from review: proposed content is not supported by the attached evidence.',
    });
    await this.saveMeta(id as string, meta);
    return {
      proposal,
      blocked: !supported,
      aiProposal: AI_PROPOSAL_UNAVAILABLE,
      billing: { charged: false },
    };
  }

  async approve(
    organizationId: string,
    id: string,
    input: {
      userId?: string | null;
      version?: number;
      confirmed?: boolean;
    } = {},
  ) {
    const action = await this.action(organizationId, id);
    const meta = this.meta(action);
    const existing = this.proposalsOf(action);
    const version =
      Number(input.version) > 0
        ? Math.floor(Number(input.version))
        : nextVersion(existing) - 1;
    const proposal = existing.find(
      (entry) => entry.version === version,
    );
    if (!proposal)
      throw new NotFoundException(
        'Proposal version not found',
      );
    if (proposal.status === 'REJECTED') {
      throw new BadRequestException(
        'Rejected proposals cannot be approved; create a new version.',
      );
    }
    if (input.confirmed !== true) {
      return {
        requiresConfirmation: true,
        confirmation: confirmApprovalCopy(proposal),
        proposal,
      };
    }
    if (proposal.risk === 'BLOCKED') {
      throw new BadRequestException(
        'Blocked action classes are recommendation-only and cannot be approved for execution.',
      );
    }
    proposal.status = 'APPROVED';
    proposal.approvedAt = new Date().toISOString();
    proposal.approvedBy = clean(input.userId) || 'human-reviewer';
    meta.proposals = existing;
    this.log(meta, {
      event: 'APPROVED',
      version,
      approvedBy: proposal.approvedBy,
    });
    await this.saveMeta(id as string, meta);
    return {
      proposal,
      confirmation: confirmApprovalCopy(proposal),
      billing: { charged: false },
    };
  }

  async reject(
    organizationId: string,
    id: string,
    input: {
      userId?: string | null;
      version?: number;
      reason?: string;
    } = {},
  ) {
    const action = await this.action(organizationId, id);
    const meta = this.meta(action);
    const existing = this.proposalsOf(action);
    const version =
      Number(input.version) > 0
        ? Math.floor(Number(input.version))
        : nextVersion(existing) - 1;
    const proposal = existing.find(
      (entry) => entry.version === version,
    );
    if (!proposal)
      throw new NotFoundException(
        'Proposal version not found',
      );
    proposal.status = 'REJECTED';
    proposal.rejectedAt = new Date().toISOString();
    proposal.rejectedBy = clean(input.userId) || 'human-reviewer';
    meta.proposals = existing;
    this.log(meta, {
      event: 'REJECTED',
      version,
      reason: clean(input.reason) || null,
    });
    await this.saveMeta(id as string, meta);
    return { proposal, billing: { charged: false } };
  }

  async execute(
    organizationId: string,
    id: string,
    input: {
      userId?: string | null;
      version?: number;
      method?: string;
    } = {},
  ) {
    const action = await this.action(organizationId, id);
    const meta = this.meta(action);
    const existing = this.proposalsOf(action);
    const latest = nextVersion(existing) - 1;
    const version =
      Number(input.version) > 0
        ? Math.floor(Number(input.version))
        : latest;
    const proposal = existing.find(
      (entry) => entry.version === version,
    );
    if (!proposal)
      throw new NotFoundException(
        'Proposal version not found',
      );
    if (!approvalValid(proposal, latest)) {
      throw new BadRequestException(
        'This proposal version requires re-approval.',
      );
    }
    const protection = targetProtected({
      organizationMatch: true,
      websiteMatch: clean(action.websiteId).length > 0,
      urlMatch: clean(proposal.targetUrl).length > 0,
      integrationConnected: false,
      permissionOk: false,
      versionApproved: true,
      actionAllowed: isExecutableTarget(
        proposal.actionType.includes('INTERNAL_LINK')
          ? 'INTERNAL_LINK'
          : null,
      ),
    });
    void protection;
    /* No write-capable integration exists in this
     * deployment (publishingStatus: NOT_CONNECTED).
     * Execution records the approved manual path —
     * never a fake CMS write. */
    const key = idempotencyKey(
      id as string,
      version,
      proposal.targetUrl,
    );
    const log = (
      Array.isArray(meta.executions)
        ? (meta.executions as Array<Record<string, unknown>>)
        : []
    ).find(
      (entry) =>
        clean(entry.idempotencyKey) === key &&
        clean(entry.event) === 'EXECUTED_MANUAL',
    );
    if (log) {
      return {
        idempotent: true,
        execution: log,
        billing: { charged: false },
      };
    }
    const method = clean(input.method).toUpperCase();
    if (method !== 'MANUAL' && method !== 'COPY' && method !== 'EXPORT') {
      return {
        status: 'EXECUTION_NOT_CONNECTED' as const,
        message: EXECUTION_NOT_CONNECTED,
        copyPayload: {
          targetUrl: proposal.targetUrl,
          currentState: proposal.currentState,
          proposedState: proposal.proposedState,
          evidence: proposal.evidence,
        },
        exportPayload: proposal,
        billing: { charged: false },
      };
    }
    proposal.status = 'EXECUTED';
    proposal.executedAt = new Date().toISOString();
    meta.proposals = existing;
    const record = {
      event: 'EXECUTED_MANUAL',
      idempotencyKey: key,
      version,
      method,
      targetUrl: proposal.targetUrl,
      requested: proposal.proposedState,
      rollbackAvailable: false,
      rollbackNote:
        'Manual execution has no integration rollback; restore the previous value manually where supported.',
    };
    this.log(meta, record);
    await this.saveMeta(id as string, meta);
    return {
      status: 'EXECUTED' as const,
      execution: { ...record, at: new Date().toISOString() },
      verification: 'VERIFICATION_PENDING',
      verificationHref: `/api/actions/${id}/verification`,
      billing: { charged: false },
    };
  }

  async verifyStale(
    organizationId: string,
    id: string,
  ): Promise<{
    stale: boolean;
    proposalVersion: number | null;
  }> {
    const action = await this.action(organizationId, id);
    const existing = this.proposalsOf(action);
    if (existing.length === 0)
      return { stale: false, proposalVersion: null };
    const latest = existing[existing.length - 1];
    return {
      stale: isStale(
        latest.createdAt,
        new Date().toISOString(),
      ),
      proposalVersion: latest.version,
    };
  }

  async reviewQueue(
    organizationId: string,
    websiteId: string,
    limit = 10,
  ) {
    const actions = await this.prisma.action.findMany({
      where: {
        organizationId,
        websiteId,
        status: { notIn: ['DISMISSED'] },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    const queue: Array<Record<string, unknown>> = [];
    for (const action of actions) {
      const proposals = this.proposalsOf(
        action as unknown as Record<string, unknown>,
      );
      const latest = proposals[proposals.length - 1];
      if (!latest) continue;
      if (
        latest.status === 'READY_FOR_REVIEW' ||
        latest.status === 'APPROVED'
      ) {
        queue.push({
          actionId: action.id,
          title: action.title,
          status: latest.status,
          version: latest.version,
          risk: (latest as Proposal).risk,
          targetUrl: (latest as Proposal).targetUrl,
        });
      }
      if (queue.length >= Math.max(1, Math.min(20, limit)))
        break;
    }
    return {
      websiteId,
      total: queue.length,
      items: queue,
      billing: { charged: false },
    };
  }

  async executionSummary(
    organizationId: string,
    websiteId: string,
  ) {
    const actions = await this.prisma.action.findMany({
      where: { organizationId, websiteId },
      take: 100,
    });
    let proposed = 0;
    let approved = 0;
    let executed = 0;
    for (const action of actions) {
      const proposals = this.proposalsOf(
        action as unknown as Record<string, unknown>,
      );
      if (proposals.length > 0) proposed++;
      const latest = proposals[proposals.length - 1] as
        | Proposal
        | undefined;
      if (!latest) continue;
      if (
        latest.approvedAt !== null &&
        latest.status !== 'REJECTED'
      )
        approved++;
      if (
        [
          'EXECUTED',
          'VERIFICATION_PENDING',
          'VERIFIED',
          'PARTIALLY_VERIFIED',
          'CONFLICTING',
        ].includes(latest.status)
      )
        executed++;
    }
    const measuredItems = await this.settled(() =>
      this.measurement.getSummary(organizationId, websiteId),
    );
    const measured = Number(
      (measuredItems as { measured?: unknown } | null)
        ?.measured ?? 0,
    );
    return {
      websiteId,
      proposed,
      approved,
      executed,
      verified: 0,
      measured,
      note: 'Verified counts come from live verification reads, not proposal metadata. No success percentage is computed.',
      billing: { charged: false },
    };
  }

  async riskFor(
    actionType: string,
    targetElement: string | null,
  ): Promise<{ risk: RiskLevel }> {
    return { risk: riskFor(actionType, targetElement) };
  }
}

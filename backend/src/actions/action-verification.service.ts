import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { CrawlService } from '../crawl/crawl.service';
import { ActionMeasurementService } from './action-measurement.service';
import {
  VERIFICATION_UI_COPY,
  DONE_NOT_VERIFIED_NOTE,
  deriveExpectedChange,
  readinessForVerification,
  verifyTarget,
  type VerificationState,
} from './action-verification';

/*
 * =========================================================
 * EXECUTION VERIFICATION 1.0 (Phase 28) — explicit,
 * user-triggered live verification reusing the existing
 * crawler (single URL, existing quota). DONE ≠ VERIFIED.
 * Verification precedes outcome interpretation; outcome
 * measurement reuses Phase 23. No CMS writes, no scores,
 * no causality. Composition-only: no new tables.
 * =========================================================
 */

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function normPage(value: unknown): string | null {
  let raw = clean(value).toLowerCase();
  if (!raw) return null;
  raw = raw.split('?')[0].split('#')[0];
  raw = raw.replace(/^https?:\/\//, '');
  raw = raw.replace(/^www\./, '');
  raw = raw.replace(/\/+$/, '');
  return raw || null;
}

@Injectable()
export class ActionVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly crawl: CrawlService,
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
      include: {
        recommendation: true,
      },
    });
    if (!row) throw new NotFoundException('Action not found');
    return row as unknown as Record<string, unknown> & {
      recommendation: Record<string, unknown> | null;
    };
  }

  expectedChange(
    action: Record<string, unknown> & {
      recommendation: Record<string, unknown> | null;
    },
  ) {
    const meta = (action.metadata ?? {}) as Record<
      string,
      unknown
    >;
    const recommendation = action.recommendation;
    const recMeta = (recommendation?.metadata ?? {}) as Record<
      string,
      unknown
    >;
    return deriveExpectedChange({
      actionType: clean(action.type),
      targetUrl:
        clean(meta.targetPage) ||
        clean(meta.pageUrl) ||
        clean(action.url) ||
        clean(recMeta.targetUrl) ||
        clean(recommendation?.pageUrl) ||
        null,
      keyword:
        clean(meta.strategyKeyword) ||
        clean(meta.keyword) ||
        clean(meta.query) ||
        null,
      topic: clean(meta.topic) || null,
      recommendationType:
        clean(recommendation?.type) || null,
      recommendationMetadata: {
        sourceUrl:
          clean(recMeta.sourceUrl) ||
          clean(meta.sourceUrl) ||
          null,
        targetUrl:
          clean(recMeta.targetUrl) ||
          clean(meta.targetPage) ||
          clean(meta.pageUrl) ||
          clean(action.url) ||
          null,
      },
      customerNeed: clean(meta.customerNeed) || null,
      claim: clean(meta.claim) || null,
    });
  }

  async getVerification(
    organizationId: string,
    id: string,
  ) {
    const action = await this.action(organizationId, id);
    const status = clean(action.status);
    const expected = this.expectedChange(action);
    if (!readinessForVerification(status)) {
      return {
        action: {
          id: action.id,
          title: clean(action.title),
          status,
          completedAt: action.completedAt ?? null,
        },
        executionStatus: status,
        verificationStatus:
          'NOT_YET_VERIFIABLE' as VerificationState,
        verificationNote:
          VERIFICATION_UI_COPY.NOT_YET_VERIFIABLE,
        expectedChange: expected,
        billing: { charged: false },
      };
    }
    if (!expected) {
      return {
        action: {
          id: action.id,
          title: clean(action.title),
          status,
          completedAt: action.completedAt ?? null,
        },
        executionStatus: status,
        verificationStatus:
          'NOT_APPLICABLE' as VerificationState,
        verificationNote:
          'This action does not have a deterministic live-page verification target.',
        expectedChange: null,
        billing: { charged: false },
      };
    }
    /* Latest completed crawl as the current live
     * evidence (free read). Explicit verify refreshes. */
    const websiteId = clean(action.websiteId);
    let live: Record<string, unknown> | null = null;
    let crawlAt: string | null = null;
    if (websiteId) {
      const latest = await this.settled(() =>
        this.prisma.crawl.findFirst({
          where: { websiteId, status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
        }),
      );
      if (latest) {
        const target = normPage(expected.targetUrl);
        const page = await this.settled(() =>
          this.prisma.crawlPage.findFirst({
            where: { crawlId: (latest as { id: string }).id },
          }),
        );
        /* Prefer exact page match; bounded fallback
         * scan stays within one crawl. */
        if (page && target) {
          const match =
            normPage(
              (page as unknown as Record<string, unknown>).url,
            ) === target ||
            normPage(
              (page as unknown as Record<string, unknown>)
                .finalUrl,
            ) === target
              ? page
              : await this.settled(async () => {
                  const pages =
                    await this.prisma.crawlPage.findMany({
                      where: {
                        crawlId: (
                          latest as { id: string }
                        ).id,
                      },
                      take: 200,
                    });
                  return (
                    pages.find(
                      (row) =>
                        normPage(row.url) === target ||
                        normPage(row.finalUrl) === target,
                    ) ?? null
                  );
                });
          if (match) {
            live = match as unknown as Record<string, unknown>;
            const completedRaw = (
              latest as unknown as {
                completedAt: unknown;
              }
            ).completedAt;
            crawlAt =
              completedRaw != null
                ? new Date(
                    completedRaw as string,
                  ).toISOString()
                : null;
          }
        }
      }
    }
    const verificationStatus = expected.targetElement
      ? verifyTarget(
          expected.targetElement,
          expected.expectedState,
          live,
        )
      : ('NOT_APPLICABLE' as VerificationState);
    return {
      action: {
        id: action.id,
        title: clean(action.title),
        status,
        completedAt: action.completedAt ?? null,
      },
      executionStatus: status,
      verificationStatus,
      verificationNote:
        verificationStatus === 'NOT_VERIFIED'
          ? DONE_NOT_VERIFIED_NOTE
          : VERIFICATION_UI_COPY[verificationStatus],
      expectedChange: expected,
      live: live
        ? {
            url: clean(
              (live as Record<string, unknown>).url,
            ),
            title: clean(
              (live as Record<string, unknown>).title,
            ) || null,
            statusCode:
              (live as Record<string, unknown>)
                .statusCode ?? null,
            crawlAt,
            source: 'LIVE_CRAWL',
            evidenceState: 'OBSERVED',
          }
        : null,
      measurementHref: `/api/actions/${action.id}/measurement`,
      billing: { charged: false },
    };
  }

  async verify(
    organizationId: string,
    id: string,
  ) {
    const action = await this.action(organizationId, id);
    const status = clean(action.status);
    if (!readinessForVerification(status)) {
      throw new BadRequestException(
        'Only completed actions can be verified',
      );
    }
    const expected = this.expectedChange(action);
    if (!expected || !expected.targetUrl) {
      throw new BadRequestException(
        'This action does not have a deterministic live-page verification target.',
      );
    }
    const websiteId = clean(action.websiteId);
    if (!websiteId) {
      throw new BadRequestException(
        'Action has no website scope for verification',
      );
    }
    /* Explicit user trigger uses existing crawl quota —
     * no new meter. */
    await this.billing.checkCrawlAllowance(
      organizationId,
    );
    const observed = await this.crawl.verifyPageUrl(
      organizationId,
      websiteId,
      expected.targetUrl,
    );
    try {
      await this.billing.consumeUsage(
        organizationId,
        'CRAWL_CREDITS',
        1,
      );
    } catch {
      /* Quota consumption follows existing rails;
       * verification evidence is already recorded. */
    }
    const live = observed.page;
    const verificationStatus = expected.targetElement
      ? verifyTarget(
          expected.targetElement,
          expected.expectedState,
          live,
        )
      : ('NOT_APPLICABLE' as VerificationState);
    const measurement = await this.settled(() =>
      this.measurement.getMeasurement(
        organizationId,
        id as string,
        28,
      ),
    );
    return {
      action: {
        id: action.id,
        title: clean(action.title),
        status,
        completedAt: action.completedAt ?? null,
      },
      executionStatus: status,
      verificationStatus,
      verificationNote:
        verificationStatus === 'NOT_VERIFIED'
          ? DONE_NOT_VERIFIED_NOTE
          : VERIFICATION_UI_COPY[verificationStatus],
      expectedChange: expected,
      live: live
        ? {
            url: clean(
              (live as Record<string, unknown>).url,
            ),
            title: clean(
              (live as Record<string, unknown>).title,
            ) || null,
            h1: (live as Record<string, unknown>).h1 ??
              null,
            statusCode:
              (live as Record<string, unknown>)
                .statusCode ?? null,
            crawlAt: observed.crawlAt,
            crawlId: observed.crawlId,
            source: 'LIVE_CRAWL',
            evidenceState: 'OBSERVED',
          }
        : null,
      search:
        measurement !== null
          ? {
              outcomeState: (
                measurement as Record<string, unknown>
              ).outcomeState,
              note: 'Observed after verified change. Causality cannot be established from the available evidence.',
            }
          : { outcomeState: 'UNAVAILABLE' },
      measurementHref: `/api/actions/${action.id}/measurement`,
      limitations: [
        'Verification observes the live page; deployment or cache delays may apply — verify again after deploying.',
        'Outcome interpretation follows verification; causality is never claimed.',
      ],
      billing: {
        charged: false,
        note: 'Explicit verification uses existing crawl quota. No new meter.',
      },
    };
  }

  async getExecution(
    organizationId: string,
    id: string,
  ) {
    const verification = await this.getVerification(
      organizationId,
      id,
    );
    const measurement = await this.settled(() =>
      this.measurement.getMeasurement(
        organizationId,
        id,
        28,
      ),
    );
    return {
      ...verification,
      measurement:
        measurement !== null
          ? {
              outcomeState: (
                measurement as Record<string, unknown>
              ).outcomeState,
              learning: (
                measurement as Record<string, unknown>
              ).learning,
            }
          : { outcomeState: 'UNAVAILABLE' },
      learning: `Execution ${clean(
        (verification.action as Record<string, unknown>).status,
      )}; verification ${clean(
        (verification as Record<string, unknown>)
          .verificationStatus,
      )}. Observed afterward; causality not established.`,
    };
  }
}

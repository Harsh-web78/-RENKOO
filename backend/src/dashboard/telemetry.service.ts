import { Injectable, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  setProviderTelemetrySink,
  type ProviderCallRecord,
} from '../keywords/dataforseo.client';

/*
 * =========================================================
 * PRODUCT TELEMETRY 1.0 (Phase 40).
 *
 * Single append-only sink for: onboarding step events,
 * DataForSEO provider-call metering, dead-end records.
 * No PII, no credentials, no request bodies. Telemetry
 * failures never break product calls. Bounded reads.
 * =========================================================
 */

const MAX_EVENTS = 500;

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

@Injectable()
export class TelemetryService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    /* Provider metering hook: operation, counts,
     * success, vendor-reported cost. Registered once;
     * removable without touching provider code. */
    setProviderTelemetrySink((record: ProviderCallRecord) => {
      void this.recordProviderCall(record).catch(() => null);
    });
  }

  private get events() {
    return (this.prisma as unknown as Record<string, any>)
      .telemetryEvent;
  }

  async record(input: {
    organizationId: string;
    websiteId?: string | null;
    kind: string;
    step?: string | null;
    status?: string | null;
    detail?: Record<string, unknown> | null;
  }) {
    if (!this.events) return null;
    try {
      return await this.events.create({
        data: {
          organizationId: clean(input.organizationId),
          websiteId: input.websiteId
            ? clean(input.websiteId)
            : null,
          kind: clean(input.kind).toUpperCase().slice(0, 40),
          step: input.step
            ? clean(input.step).toUpperCase().slice(0, 40)
            : null,
          status: input.status
            ? clean(input.status).toUpperCase().slice(0, 40)
            : null,
          detail: (input.detail ?? {}) as Record<
            string,
            unknown
          >,
        },
      });
    } catch {
      return null;
    }
  }

  private async recordProviderCall(
    record: ProviderCallRecord,
  ) {
    if (!this.events) return;
    /* Org context is unavailable at the provider
     * layer — recorded honestly as unattributed
     * provider-level metering (never fabricated). */
    try {
      await this.events.create({
        data: {
          organizationId: 'PROVIDER',
          websiteId: null,
          kind: 'PROVIDER_CALL',
          step: null,
          status: record.success ? 'SUCCESS' : 'FAILED',
          detail: {
            provider: record.provider,
            operation: record.operation,
            taskCount: record.taskCount,
            errorCode: record.errorCode,
            vendorCost: record.vendorCost,
          },
        },
      });
    } catch {
      /* never break provider calls */
    }
  }

  async list(
    organizationId: string,
    websiteId?: string,
    kind?: string,
    take = 100,
  ) {
    if (!this.events) return [];
    try {
      return await this.events.findMany({
        where: {
          organizationId,
          ...(websiteId ? { websiteId } : {}),
          ...(kind ? { kind } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(1, take), MAX_EVENTS),
      });
    } catch {
      return [];
    }
  }

  async providerSummary(input?: {
    sinceIso?: string;
    take?: number;
  }) {
    if (!this.events) {
      return {
        available: false,
        note: 'Telemetry table unavailable — provider metering unavailable, never zero-filled.',
      };
    }
    try {
      const rows = await this.events.findMany({
        where: {
          organizationId: 'PROVIDER',
          kind: 'PROVIDER_CALL',
          ...(input?.sinceIso
            ? { createdAt: { gte: new Date(input.sinceIso) } }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(1, input?.take ?? 500), 2000),
      });
      const byOperation = new Map<
        string,
        {
          calls: number;
          tasks: number;
          failures: number;
          vendorCost: number | null;
          costKnown: boolean;
        }
      >();
      for (const row of rows as Array<any>) {
        const detail = (row.detail ?? {}) as Record<
          string,
          unknown
        >;
        const op = clean(detail.operation) || 'unknown';
        let entry = byOperation.get(op);
        if (!entry) {
          entry = {
            calls: 0,
            tasks: 0,
            failures: 0,
            vendorCost: 0,
            costKnown: true,
          };
          byOperation.set(op, entry);
        }
        entry.calls += 1;
        entry.tasks += Number(detail.taskCount ?? 0) || 0;
        if (clean(row.status) !== 'SUCCESS') {
          entry.failures += 1;
        }
        if (
          detail.vendorCost === null ||
          detail.vendorCost === undefined
        ) {
          entry.costKnown = false;
        } else {
          entry.vendorCost =
            (entry.vendorCost ?? 0) +
            (Number(detail.vendorCost) || 0);
        }
      }
      return {
        available: true,
        operations: [...byOperation.entries()].map(
          ([operation, stats]) => ({
            operation,
            ...stats,
            vendorCost: stats.costKnown
              ? stats.vendorCost
              : null,
            costLabel: stats.costKnown
              ? `Vendor-reported total ${stats.vendorCost}.`
              : 'COST_UNKNOWN — vendor pricing not in repository/config.',
          }),
        ),
        note: 'Metered at the single provider choke point (retries never double-counted). Org attribution unavailable at this layer — per-feature rails (research log, rank runs) carry context.',
      };
    } catch {
      return {
        available: false,
        note: 'Provider metering query failed — unavailable, never zero-filled.',
      };
    }
  }
}

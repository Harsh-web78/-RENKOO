import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { BusinessBrainService } from '../business-brain/business-brain.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { AiProviderRegistry } from './providers/provider.registry';
import { AiProviderError } from './providers/provider.errors';
import { analyzeAiResponse } from './analysis';
import { FREE_MONTHLY_AI_SCANS } from '../billing/plans.config';
import {
  alertKeyFor,
  bucketByDay,
  buildTrend,
  compareObservations,
  creditGuard,
  estimateRunUsage,
  executionIdentity,
  executionPlan,
  nextRunAt,
  opportunityKindForChange,
  paginate,
  prioritizeChange,
  runStatusFor,
  scheduleConfigKey,
  summarizeChanges,
  validateSchedule,
  windowKeyFor,
  windowStart,
  type MonitorCadence,
  type MonitorRunStatus,
  type ObservationLike,
  type PromptChange,
} from './ai-monitoring';
import {
  DEFAULT_HEARTBEAT_MS,
  MAX_CLAIM_PER_TICK,
  MAX_PRUNE_BATCH,
  buildHealth,
  consecutiveFailures,
  heartbeatAgeMs,
  heartbeatDue,
  missedWindows,
  nextEligibleRun,
  pruneBatches,
  retentionCutoff,
  shapeRunObservability,
  staleWithHeartbeat,
} from './ai-monitoring-ops';

/*
 * =========================================================
 * AI MONITORING 1.0 — schedule + run service (Phase 7).
 *
 * Turns Phase 6 intelligence into a continuous learning
 * loop: PROMPT SET → SCHEDULE → RUN → OBSERVATION →
 * HISTORY → CHANGE → OPPORTUNITY → ACTION → ROADMAP →
 * NEXT RUN. Observations stay append-only in
 * AiVisibilityCheck; this service owns the schedule +
 * run ledger, bounded credit-safe execution, change
 * detection, alerts (MonitoringService, deduped) and
 * the opportunity bridge (Recommendation rails).
 *
 * Billing: pre-run read-only guard + consume-on-success
 * only. Failures, timeouts, unavailable surfaces and
 * idempotent skips are never charged. No negative
 * credits, no double-charged retries.
 * =========================================================
 */

const MAX_PROMPTS_PER_RUN = 200;
const MAX_SURFACES_PER_SCHEDULE = 8;

function envInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0
    ? Math.floor(raw)
    : fallback;
}

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

@Injectable()
export class AiMonitoringService {
  private readonly logger = new Logger(
    AiMonitoringService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
    private readonly businessBrainService: BusinessBrainService,
    private readonly monitoringService: MonitoringService,
    private readonly providerRegistry: AiProviderRegistry,
  ) {}

  private async verifyWebsite(
    organizationId: string,
    websiteId: string,
  ) {
    const website =
      await this.prisma.website.findFirst({
        where: {
          id: websiteId,
          organizationId,
          isActive: true,
        },
      });
    if (!website)
      throw new NotFoundException('Website not found');
    return website;
  }

  /* ================= schedules ================= */

  async createSchedule(
    organizationId: string,
    userId: string,
    input: {
      websiteId: string;
      name?: string;
      surfaces?: string[];
      country?: string;
      language?: string;
      cadence?: string;
      timezone?: string;
    },
  ) {
    const website = await this.verifyWebsite(
      organizationId,
      input.websiteId,
    );
    const validated = validateSchedule(input);
    if (
      validated.surfaces.length >
      MAX_SURFACES_PER_SCHEDULE
    ) {
      throw new BadRequestException(
        'Too many surfaces for one schedule.',
      );
    }
    const configKey = scheduleConfigKey(validated);
    const duplicate =
      await this.prisma.aiMonitorSchedule.findFirst({
        where: {
          websiteId: website.id,
          configKey,
          isActive: true,
        },
        select: { id: true },
      });
    if (duplicate) {
      throw new BadRequestException(
        'An active schedule with the same surfaces, cadence, country and language already exists.',
      );
    }
    return this.prisma.aiMonitorSchedule.create({
      data: {
        organizationId,
        websiteId: website.id,
        name: clean(input.name).slice(0, 120) || null,
        surfaces: validated.surfaces,
        country: validated.country,
        language: validated.language,
        cadence: validated.cadence,
        timezone: validated.timezone,
        configKey,
        nextRunAt: nextRunAt(validated.cadence),
        createdBy: userId,
      },
    });
  }

  async listSchedules(
    organizationId: string,
    websiteId: string,
  ) {
    await this.verifyWebsite(organizationId, websiteId);
    return this.prisma.aiMonitorSchedule.findMany({
      where: { organizationId, websiteId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async updateSchedule(
    organizationId: string,
    id: string,
    input: {
      name?: string;
      surfaces?: string[];
      cadence?: string;
      isActive?: boolean;
      timezone?: string;
    },
  ) {
    const existing =
      await this.prisma.aiMonitorSchedule.findFirst({
        where: { id, organizationId },
      });
    if (!existing)
      throw new NotFoundException('Schedule not found');
    const data: Record<string, unknown> = {};
    if (input.name !== undefined)
      data.name =
        clean(input.name).slice(0, 120) || null;
    if (input.timezone !== undefined)
      data.timezone = clean(input.timezone) || 'UTC';
    if (input.isActive !== undefined)
      data.isActive = input.isActive === true;
    let cadence: MonitorCadence =
      existing.cadence as MonitorCadence;
    let surfaces: string[] = existing.surfaces;
    if (input.cadence !== undefined) {
      cadence =
        String(input.cadence).toUpperCase() === 'DAILY'
          ? 'DAILY'
          : 'WEEKLY';
      data.cadence = cadence;
      data.nextRunAt = nextRunAt(cadence);
    }
    if (input.surfaces !== undefined) {
      const validated = validateSchedule({
        surfaces: input.surfaces,
        cadence,
        country: existing.country,
        language: existing.language,
        timezone: existing.timezone,
      });
      surfaces = validated.surfaces;
      data.surfaces = surfaces;
    }
    const configKey = scheduleConfigKey({
      surfaces,
      cadence,
      country: existing.country,
      language: existing.language,
    });
    if (configKey !== existing.configKey) {
      const duplicate =
        await this.prisma.aiMonitorSchedule.findFirst({
          where: {
            websiteId: existing.websiteId,
            configKey,
            isActive: true,
            id: { not: existing.id },
          },
          select: { id: true },
        });
      if (
        duplicate &&
        (input.isActive === true ||
          (input.isActive === undefined &&
            existing.isActive))
      ) {
        throw new BadRequestException(
          'Another active schedule already uses this configuration.',
        );
      }
      data.configKey = configKey;
    }
    return this.prisma.aiMonitorSchedule.update({
      where: { id: existing.id },
      data,
    });
  }

  async deleteSchedule(
    organizationId: string,
    id: string,
  ) {
    const existing =
      await this.prisma.aiMonitorSchedule.findFirst({
        where: { id, organizationId },
        select: { id: true },
      });
    if (!existing)
      throw new NotFoundException('Schedule not found');
    await this.prisma.aiMonitorSchedule.delete({
      where: { id: existing.id },
    });
    return { deleted: true };
  }

  /* ================= estimates + credit guard ================= */

  private async scanAllowance(
    organizationId: string,
  ): Promise<{
    used: number;
    limit: number | null;
    unlimited: boolean;
  }> {
    if (
      await this.billingService.isInternalTestOrg(
        organizationId,
      )
    ) {
      return { used: 0, limit: null, unlimited: true };
    }
    const subscription =
      await this.billingService.getSubscription(
        organizationId,
      );
    if (!subscription) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const used =
        await this.prisma.aiVisibilityCheck.count({
          where: {
            Website: { organizationId },
            createdAt: { gte: monthStart },
          },
        });
      return {
        used,
        limit: FREE_MONTHLY_AI_SCANS,
        unlimited: false,
      };
    }
    const check = await this.billingService.checkUsage(
      organizationId,
      'AI_SCANS',
    );
    return {
      used: check.used,
      limit: check.limit,
      unlimited: check.limit === null,
    };
  }

  async estimate(
    organizationId: string,
    websiteId: string,
    input: {
      surfaces?: string[];
      country?: string;
      language?: string;
    },
  ) {
    const website = await this.verifyWebsite(
      organizationId,
      websiteId,
    );
    void website;
    const validated = validateSchedule({
      surfaces: input.surfaces ?? ['GEMINI'],
      cadence: 'WEEKLY',
      country: input.country,
      language: input.language,
      timezone: 'UTC',
    });
    const promptCount =
      await this.prisma.aiVisibilityQuery.count({
        where: { websiteId, isActive: true },
      });
    const executable = validated.surfaces.filter((s) =>
      this.providerRegistry
        .get(s as never)
        ?.isConfigured(),
    ).length;
    const usage = estimateRunUsage({
      promptCount: Math.min(
        promptCount,
        MAX_PROMPTS_PER_RUN,
      ),
      surfaceCount: validated.surfaces.length,
      executableSurfaces: executable,
    });
    const allowance =
      await this.scanAllowance(organizationId);
    const guard = creditGuard({
      estimate: usage.billableEstimate,
      used: allowance.used,
      limit: allowance.limit,
    });
    const monthly =
      usage.billableEstimate * (4 + 1);
    return {
      prompts: Math.min(promptCount, MAX_PROMPTS_PER_RUN),
      surfaces: validated.surfaces,
      executableSurfaces: executable,
      perRun: usage,
      estimatedMonthlyChecks: monthly,
      allowance: {
        used: allowance.used,
        limit: allowance.limit,
        unlimited: allowance.unlimited,
      },
      guard,
    };
  }

  /* ================= runs ================= */

  async requestRun(
    organizationId: string,
    input: {
      websiteId: string;
      scheduleId?: string;
      surfaces?: string[];
      country?: string;
      language?: string;
      origin?: 'SCHEDULED' | 'MANUAL';
    },
  ) {
    const website = await this.verifyWebsite(
      organizationId,
      input.websiteId,
    );
    let schedule: {
      id: string;
      cadence: string;
      surfaces: string[];
      country: string;
      language: string;
    } | null = null;
    if (input.scheduleId) {
      const row =
        await this.prisma.aiMonitorSchedule.findFirst({
          where: {
            id: input.scheduleId,
            organizationId,
            websiteId: website.id,
          },
        });
      if (!row)
        throw new NotFoundException(
          'Schedule not found',
        );
      schedule = {
        id: row.id,
        cadence: row.cadence,
        surfaces: row.surfaces,
        country: row.country,
        language: row.language,
      };
    }
    const validated = validateSchedule({
      surfaces:
        input.surfaces ?? schedule?.surfaces ?? ['GEMINI'],
      cadence: schedule?.cadence ?? 'WEEKLY',
      country:
        input.country ?? schedule?.country ?? 'US',
      language:
        input.language ?? schedule?.language ?? 'en',
      timezone: 'UTC',
    });
    const promptCount =
      await this.prisma.aiVisibilityQuery.count({
        where: { websiteId: website.id, isActive: true },
      });
    if (promptCount === 0) {
      throw new BadRequestException(
        'No tracked prompts for this website. Generate a prompt set first.',
      );
    }
    const executable = validated.surfaces.filter((s) =>
      this.providerRegistry
        .get(s as never)
        ?.isConfigured(),
    );
    const usage = estimateRunUsage({
      promptCount: Math.min(
        promptCount,
        MAX_PROMPTS_PER_RUN,
      ),
      surfaceCount: validated.surfaces.length,
      executableSurfaces: executable.length,
    });
    const allowance =
      await this.scanAllowance(organizationId);
    const guard = creditGuard({
      estimate: usage.billableEstimate,
      used: allowance.used,
      limit: allowance.limit,
    });
    if (!guard.allowed) {
      throw new BadRequestException(guard.reason);
    }
    const windowKey = `${windowKeyFor(
      validated.cadence as MonitorCadence,
    )}|${Date.now()}`;
    const run = await this.prisma.aiMonitorRun.create({
      data: {
        organizationId,
        websiteId: website.id,
        scheduleId: schedule?.id ?? null,
        origin: input.origin ?? 'MANUAL',
        status: 'QUEUED',
        windowKey,
        promptCount: Math.min(
          promptCount,
          MAX_PROMPTS_PER_RUN,
        ),
      },
    });
    await this.prisma.aiMonitorRun.update({
      where: { id: run.id },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
        lastHeartbeatAt: new Date(),
      },
    });
    this.lastBeatAt.set(run.id, Date.now());
    return this.executeRunUnits(organizationId, run.id, {
      surfaces: validated.surfaces,
      country: validated.country,
      language: validated.language,
    });
  }

  /*
   * Legacy synchronous due-runner (Phase 7 JWT path).
   * Phase 8A: claim-only — creation is fast and
   * bounded; execution runs via execute-next (tick)
   * or a manual run. `started` counts claimed runs.
   */
  async runDueSchedules(): Promise<{
    due: number;
    started: number;
    runIds: string[];
  }> {
    const claimed = await this.claimDueRuns();
    return {
      due: claimed.due,
      started: claimed.claimed,
      runIds: claimed.runIds,
    };
  }

  async cancelRun(
    organizationId: string,
    runId: string,
  ) {
    const run = await this.prisma.aiMonitorRun.findFirst(
      {
        where: { id: runId, organizationId },
      },
    );
    if (!run)
      throw new NotFoundException('Run not found');
    if (
      run.status === 'COMPLETED' ||
      run.status === 'FAILED' ||
      run.status === 'PARTIAL'
    ) {
      return run;
    }
    return this.prisma.aiMonitorRun.update({
      where: { id: run.id },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
        errorSummary: 'Cancelled by the workspace.',
      },
    });
  }

  async listRuns(
    organizationId: string,
    websiteId: string,
    page = 1,
    pageSize = 20,
  ) {
    await this.verifyWebsite(organizationId, websiteId);
    const runs = await this.prisma.aiMonitorRun.findMany(
      {
        where: { organizationId, websiteId },
        orderBy: { createdAt: 'desc' },
        take: 200,
      },
    );
    const paged = paginate(runs, page, pageSize);
    return {
      ...paged,
      rows: paged.rows,
    };
  }

  async getRun(
    organizationId: string,
    runId: string,
  ) {
    const run = await this.prisma.aiMonitorRun.findFirst(
      {
        where: { id: runId, organizationId },
        include: {
          checks: {
            orderBy: { checkedAt: 'desc' },
            take: 200,
          },
        },
      },
    );
    if (!run)
      throw new NotFoundException('Run not found');
    return {
      ...run,
      observability: shapeRunObservability({
        id: run.id,
        status: run.status,
        origin: run.origin,
        requestedAt: run.requestedAt,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        promptCount: run.promptCount,
        successCount: run.successCount,
        failureCount: run.failureCount,
        unavailableCount: run.unavailableCount,
        retryCount: run.retryCount,
        creditUsed: run.creditUsed,
        errorSummary: run.errorSummary,
        lastHeartbeatAt: run.lastHeartbeatAt,
        staleTimeoutMs: this.staleTimeoutMs(),
      }),
    };
  }

  /* ============ bounded credit-safe execution ============ */

  /*
   * Units executor. The caller owns the QUEUED→RUNNING
   * claim (manual request, execute-next worker) so
   * startedAt always reflects the real claim moment —
   * this is what stale recovery measures against.
   */
  private async executeRunUnits(
    organizationId: string,
    runId: string,
    scope: {
      surfaces: string[];
      country: string;
      language: string;
    },
  ) {
    const batchSize = envInt('AI_MONITOR_BATCH_SIZE', 5);
    const concurrency = Math.min(
      4,
      Math.max(1, envInt('AI_MONITOR_CONCURRENCY', 2)),
    );
    const providerTimeoutMs = envInt(
      'AI_MONITOR_PROVIDER_TIMEOUT_MS',
      30000,
    );
    const maxRetries = Math.min(
      2,
      Math.max(0, envInt('AI_MONITOR_MAX_RETRIES', 1)),
    );
    const deadline =
      Date.now() +
      envInt('AI_MONITOR_RUN_TIMEOUT_MS', 600000);

    const run = await this.prisma.aiMonitorRun.findFirst(
      {
        where: { id: runId, organizationId },
      },
    );
    if (!run)
      throw new NotFoundException('Run not found');
    const website = await this.verifyWebsite(
      organizationId,
      run.websiteId,
    );

    const queries =
      await this.prisma.aiVisibilityQuery.findMany({
        where: {
          websiteId: website.id,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_PROMPTS_PER_RUN,
      });

    const executableSurfaces = scope.surfaces.filter(
      (surface) => {
        const provider = this.providerRegistry.get(
          surface as never,
        );
        return (
          !!provider && provider.isConfigured()
        );
      },
    );
    const unavailableSurfaces = scope.surfaces.filter(
      (surface) => !executableSurfaces.includes(surface),
    );

    type Unit = {
      prompt: string;
      surface: string;
      key: string;
    };
    const units: Unit[] = [];
    for (const query of queries) {
      for (const surface of executableSurfaces) {
        units.push({
          prompt: query.query,
          surface,
          key: executionIdentity({
            websiteId: website.id,
            prompt: query.query,
            surface,
            country: scope.country,
            language: scope.language,
            windowKey: run.windowKey ?? run.id,
          }),
        });
      }
    }

    let success = 0;
    let failure = 0;
    let creditUsed = 0;
    const errors: string[] = [];

    const cancelled = async (): Promise<boolean> => {
      const current =
        await this.prisma.aiMonitorRun.findFirst({
          where: { id: runId },
          select: { status: true },
        });
      return current?.status === 'CANCELLED';
    };

    const attempt = async (unit: Unit): Promise<void> => {
      if (Date.now() > deadline) {
        errors.push(
          `Run deadline reached before "${unit.prompt}" on ${unit.surface}.`,
        );
        failure += 1;
        return;
      }
      const seen =
        await this.prisma.aiVisibilityCheck.findUnique({
          where: { idempotencyKey: unit.key },
          select: { id: true },
        });
      if (seen) return;
      const provider = this.providerRegistry.get(
        unit.surface as never,
      );
      if (!provider || !provider.isConfigured()) {
        failure += 1;
        return;
      }
      try {
        const output = await this.withTimeout(
          provider.executePrompt({
            prompt: unit.prompt,
            maxOutputTokens: 512,
          }),
          providerTimeoutMs,
          `${unit.surface} timed out`,
        );
        const analysis = await this.analyzeOutput(
          organizationId,
          website,
          output.text,
        );
        await this.prisma.aiVisibilityCheck.create({
          data: {
            id: crypto.randomUUID(),
            websiteId: website.id,
            runId,
            idempotencyKey: unit.key,
            country: scope.country,
            language: scope.language,
            platform: unit.surface as never,
            query: unit.prompt,
            status: 'COMPLETED',
            mentioned: analysis.mentioned,
            citationFound: false,
            position: null,
            response: output.text.slice(0, 20000),
            citationUrl: null,
            competitorNames: analysis.competitors,
            checkedAt: new Date(),
          },
        });
        success += 1;
        const consumed = await this.consumeOnSuccess(
          organizationId,
        );
        if (consumed) creditUsed += 1;
      } catch (error) {
        const message = String(
          (error as Error)?.message ?? error,
        ).slice(0, 300);
        await this.prisma.aiVisibilityCheck.create({
          data: {
            id: crypto.randomUUID(),
            websiteId: website.id,
            runId,
            idempotencyKey: `${unit.key}|attempt`,
            country: scope.country,
            language: scope.language,
            platform: unit.surface as never,
            query: unit.prompt,
            status: 'FAILED',
            mentioned: false,
            citationFound: false,
            errorMessage:
              error instanceof AiProviderError
                ? `${error.code}: ${error.message}`.slice(
                    0,
                    500,
                  )
                : message,
            checkedAt: new Date(),
          },
        });
        failure += 1;
        if (errors.length < 5) errors.push(message);
      }
    };

    const plan = executionPlan({
      totalCalls: units.length,
      batchSize,
    });
    await this.beatRun(runId, true);
    for (const entry of plan) {
      if (await cancelled()) break;
      const slice = units.splice(0, entry.size);
      for (
        let offset = 0;
        offset < slice.length;
        offset += concurrency
      ) {
        if (await cancelled()) break;
        await Promise.all(
          slice
            .slice(offset, offset + concurrency)
            .map((unit) => attempt(unit)),
        );
      }
      /* Throttled heartbeat: per batch, never per prompt. */
      await this.beatRun(runId);
    }

    /* One bounded retry pass over FAILED units only. */
    let retriesExecuted = 0;
    for (
      let round = 0;
      round < maxRetries;
      round += 1
    ) {
      if (await cancelled()) break;
      const failed =
        await this.prisma.aiVisibilityCheck.findMany({
          where: {
            runId,
            status: 'FAILED',
          },
          select: { query: true, platform: true },
          take: 100,
        });
      if (failed.length === 0) break;
      retriesExecuted += 1;
      await this.beatRun(runId);
      for (const row of failed) {
        if (await cancelled()) break;
        failure -= 1;
        await attempt({
          prompt: row.query,
          surface: row.platform,
          key: executionIdentity({
            websiteId: website.id,
            prompt: row.query,
            surface: row.platform,
            country: scope.country,
            language: scope.language,
            windowKey: run.windowKey ?? run.id,
          }),
        });
      }
    }

    const stillCancelled = await cancelled();
    const status: MonitorRunStatus =
      stillCancelled
        ? 'CANCELLED'
        : runStatusFor({
            success,
            failure,
            unavailable:
              unavailableSurfaces.length *
              queries.length,
          });
    const finished =
      await this.prisma.aiMonitorRun.update({
        where: { id: runId },
        data: {
          status,
          completedAt: new Date(),
          promptCount: queries.length,
          successCount: success,
          failureCount: failure,
          unavailableCount:
            unavailableSurfaces.length *
            queries.length,
          creditUsed,
          retryCount: retriesExecuted,
          errorSummary:
            errors.length > 0
              ? errors.slice(0, 5).join(' | ').slice(0, 2000)
              : null,
        },
      });
    this.lastBeatAt.delete(runId);

    if (!stillCancelled && success > 0) {
      await this.detectAndBridge(
        organizationId,
        website,
        finished,
      ).catch((error) => {
        this.logger.warn(
          `Post-run intelligence skipped: ${String((error as Error)?.message ?? error).slice(0, 200)}`,
        );
      });
    }
    return finished;
  }

  private withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    message: string,
  ): Promise<T> {
    let timer: NodeJS.Timeout | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(message)),
        ms,
      );
    });
    return Promise.race([promise, timeout]).finally(
      () => {
        if (timer) clearTimeout(timer);
      },
    );
  }

  private async analyzeOutput(
    organizationId: string,
    website: { id: string; name: string; url: string },
    text: string,
  ): Promise<{ mentioned: boolean; competitors: string[] }> {
    let businessName: string | null = null;
    try {
      const context =
        await this.businessBrainService.getBusinessContext(
          organizationId,
          website.id,
        );
      businessName =
        context.profile?.businessName ?? null;
    } catch {
      businessName = null;
    }
    const competitors =
      await this.prisma.competitor.findMany({
        where: {
          organizationId,
          websiteId: website.id,
          isActive: true,
        },
        select: { name: true, url: true, domain: true },
        take: 50,
      });
    const hostOf = (url: string): string | null => {
      try {
        return new URL(url).hostname
          .toLowerCase()
          .replace(/^www\./, '');
      } catch {
        return null;
      }
    };
    const analysis = analyzeAiResponse({
      text,
      brandTerms: [
        website.name,
        businessName,
        website.url,
        hostOf(website.url),
      ].filter(
        (term): term is string =>
          Boolean(term && term.trim()),
      ),
      competitors: competitors.map((competitor) => ({
        name: competitor.name,
        domains: [
          competitor.domain,
          hostOf(competitor.url),
        ].filter(
          (domain): domain is string =>
            Boolean(domain),
        ),
      })),
    });
    return {
      mentioned: analysis.mentioned,
      competitors: analysis.competitorMentions.map(
        (mention) => mention.name,
      ),
    };
  }

  /*
   * Charge only successful executions. Free workspaces
   * are measured from check rows (no counter write);
   * internal test workspaces are unlimited.
   */
  private async consumeOnSuccess(
    organizationId: string,
  ): Promise<boolean> {
    if (
      await this.billingService.isInternalTestOrg(
        organizationId,
      )
    ) {
      return false;
    }
    const subscription =
      await this.billingService.getSubscription(
        organizationId,
      );
    if (!subscription) return false;
    try {
      await this.billingService.consumeUsage(
        organizationId,
        'AI_SCANS',
        1,
      );
      return true;
    } catch {
      return false;
    }
  }

  /* ============ change → alert → opportunity ============ */

  private toObservation(row: {
    query: string;
    platform: string;
    country: string | null;
    language: string | null;
    mentioned: boolean;
    citationFound: boolean;
    citationUrl: string | null;
    competitorNames: string[];
    status: string;
    checkedAt: Date | null;
    response: string | null;
  }): ObservationLike {
    const domains: string[] = [];
    if (row.citationUrl) {
      try {
        domains.push(
          new URL(row.citationUrl).hostname
            .toLowerCase()
            .replace(/^www\./, ''),
        );
      } catch {
        /* recorded URL kept as-is elsewhere */
      }
    }
    return {
      prompt: row.query,
      surface: row.platform,
      country: row.country,
      language: row.language,
      mentioned: row.mentioned,
      citationFound: row.citationFound,
      citationUrl: row.citationUrl,
      citedDomains: domains,
      competitorNames: row.competitorNames ?? [],
      failed: row.status === 'FAILED',
      observedAt: row.checkedAt
        ? row.checkedAt.toISOString()
        : null,
    };
  }

  private async detectAndBridge(
    organizationId: string,
    website: { id: string; name: string },
    run: {
      id: string;
      scheduleId: string | null;
      windowKey: string | null;
    },
  ): Promise<{ changes: number; alerts: number }> {
    const changes = await this.compareRunAgainstPrevious(
      organizationId,
      website.id,
      run.id,
    );
    let alerts = 0;
    for (const change of changes) {
      if (
        change.primary === 'UNCHANGED' ||
        change.primary === 'UNKNOWN' ||
        change.primary === 'NEW'
      ) {
        continue;
      }
      const severity =
        change.primary === 'CITATION_LOST'
          ? 'HIGH'
          : change.primary === 'MENTION_LOST' ||
              change.primary === 'COMPETITOR_GAINED'
            ? 'MEDIUM'
            : 'LOW';
      await this.monitoringService
        .createAlert(organizationId, {
          websiteId: website.id,
          type: `AI_${change.primary}`,
          source: 'AI_VISIBILITY',
          severity: severity as never,
          title: `AI ${change.primary.replace(/_/g, ' ').toLowerCase()} — ${change.prompt.slice(0, 80)}`,
          description: `${change.prompt} on ${change.surface}: ${change.evidence[0] ?? 'movement detected'}.`,
          evidence: {
            prompt: change.prompt,
            surface: change.surface,
            primary: change.primary,
            runId: run.id,
          } as never,
          deduplicationKey: alertKeyFor(change),
        })
        .catch(() => null);
      alerts += 1;
      const kind =
        opportunityKindForChange(change.primary);
      if (kind) {
        await this.bridgeOpportunity(
          organizationId,
          website.id,
          {
            kind,
            prompt: change.prompt,
            why: `${change.prompt} on ${change.surface} ${change.primary.replace(/_/g, ' ').toLowerCase()}. Re-run the tracked prompt to confirm recovery.`,
          },
        ).catch(() => null);
      }
    }
    return { changes: changes.length, alerts };
  }

  private async bridgeOpportunity(
    organizationId: string,
    websiteId: string,
    input: {
      kind: string;
      prompt: string;
      why: string;
    },
  ) {
    const decided =
      await this.prisma.recommendation.findFirst({
        where: {
          organizationId,
          websiteId,
          source: 'AI_VISIBILITY',
          type: input.kind,
          status: { in: ['COMPLETED', 'DISMISSED'] },
        },
        select: { id: true },
      });
    if (decided) return null;
    const open =
      await this.prisma.recommendation.findFirst({
        where: {
          organizationId,
          websiteId,
          source: 'AI_VISIBILITY',
          type: input.kind,
          status: { in: ['OPEN', 'IN_PROGRESS'] },
        },
        orderBy: { createdAt: 'desc' },
      });
    if (
      open &&
      (open.metadata as Record<string, unknown> | null)?.[
        'aiPrompt'
      ] === input.prompt
    ) {
      return open;
    }
    return this.prisma.recommendation.create({
      data: {
        organizationId,
        websiteId,
        source: 'AI_VISIBILITY',
        type: input.kind,
        title: `${input.kind.replace(/_/g, ' ').toLowerCase()} — ${input.prompt.slice(0, 80)}`,
        description: input.why.slice(0, 2000),
        priority:
          input.kind === 'AI_CITATION_GAP'
            ? 'HIGH'
            : 'MEDIUM',
        impact: 'MEDIUM',
        effort: 'MEDIUM',
        actionText:
          'Open the AI prompt detail to execute.',
        metadata: {
          aiPrompt: input.prompt,
          measurement:
            'Re-run the tracked prompt / citation observation after the action ships.',
        },
      },
    });
  }

  /* ============ history + changes reads ============ */

  private async latestPair(
    websiteId: string,
    scopes: Array<{
      prompt: string;
      surface: string;
      country: string;
      language: string;
    }>,
  ): Promise<
    Array<{
      previous: ObservationLike | null;
      current: ObservationLike | null;
    }>
  > {
    const out: Array<{
      previous: ObservationLike | null;
      current: ObservationLike | null;
    }> = [];
    for (const scope of scopes.slice(0, 200)) {
      const rows =
        await this.prisma.aiVisibilityCheck.findMany({
          where: {
            websiteId,
            query: scope.prompt,
            platform: scope.surface as never,
          },
          orderBy: { checkedAt: 'desc' },
          take: 10,
        });
      const valid = rows.filter(
        (row) =>
          row.status === 'COMPLETED' && row.checkedAt,
      );
      const current = valid[0]
        ? this.toObservation(valid[0])
        : null;
      const previous = valid[1]
        ? this.toObservation(valid[1])
        : null;
      out.push({ previous, current });
    }
    return out;
  }

  async compareRunAgainstPrevious(
    organizationId: string,
    websiteId: string,
    runId: string,
  ): Promise<PromptChange[]> {
    await this.verifyWebsite(organizationId, websiteId);
    const rows =
      await this.prisma.aiVisibilityCheck.findMany({
        where: { websiteId, runId },
        orderBy: { checkedAt: 'desc' },
        take: 500,
      });
    const scopes = rows.map((row) => ({
      prompt: row.query,
      surface: row.platform,
      country: row.country ?? 'US',
      language: row.language ?? 'en',
    }));
    const pairs = await this.latestPair(
      websiteId,
      scopes,
    );
    const changes: PromptChange[] = [];
    for (const pair of pairs) {
      const change = compareObservations(
        pair.previous,
        pair.current,
      );
      if (change) changes.push(change);
    }
    return changes;
  }

  async getChanges(
    organizationId: string,
    websiteId: string,
    input: {
      runId?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    await this.verifyWebsite(organizationId, websiteId);
    let changes: PromptChange[];
    let baseline = false;
    if (input.runId) {
      changes = await this.compareRunAgainstPrevious(
        organizationId,
        websiteId,
        input.runId,
      );
    } else {
      const latest =
        await this.prisma.aiVisibilityCheck.findMany({
          where: {
            websiteId,
            status: 'COMPLETED',
          },
          orderBy: { checkedAt: 'desc' },
          take: 500,
        });
      const seen = new Map<string, (typeof latest)[0]>();
      for (const row of latest) {
        const key = `${row.query}|${row.platform}`;
        if (!seen.has(key)) seen.set(key, row);
      }
      const pairs = await this.latestPair(
        websiteId,
        [...seen.values()].map((row) => ({
          prompt: row.query,
          surface: row.platform,
          country: row.country ?? 'US',
          language: row.language ?? 'en',
        })),
      );
      changes = [];
      for (const pair of pairs) {
        const change = compareObservations(
          pair.previous,
          pair.current,
        );
        if (change) changes.push(change);
      };
      baseline =
        changes.length > 0 &&
        changes.every((c) => c.primary === 'NEW');
    }
    const summary = summarizeChanges(changes);
    const paged = paginate(
      changes,
      input.page ?? 1,
      input.pageSize ?? 20,
    );
    return {
      baseline: baseline
        ? 'Baseline established — first comparable observations recorded. Re-run to measure movement.'
        : null,
      summary,
      ...paged,
    };
  }

  async getHistory(
    organizationId: string,
    websiteId: string,
    input: {
      days?: 7 | 30 | 90;
      surface?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    await this.verifyWebsite(organizationId, websiteId);
    const days =
      input.days === 7 || input.days === 90 ? input.days : 30;
    const since = windowStart(days);
    const rows =
      await this.prisma.aiVisibilityCheck.findMany({
        where: {
          websiteId,
          checkedAt: { gte: since },
          ...(input.surface
            ? {
                platform: input.surface as never,
              }
            : {}),
        },
        orderBy: { checkedAt: 'asc' },
        take: 2000,
      });
    const trend = buildTrend(
      rows.map((row) => ({
        observedAt: row.checkedAt
          ? row.checkedAt.toISOString()
          : null,
        mentioned: row.mentioned,
        citationFound: row.citationFound,
        competitorCount: row.competitorNames.length,
      })),
    );
    const bySurface = new Map<
      string,
      typeof trend
    >();
    for (const surface of Array.from(
      new Set(rows.map((row) => row.platform)),
    )) {
      bySurface.set(
        surface,
        buildTrend(
          rows
            .filter((row) => row.platform === surface)
            .map((row) => ({
              observedAt: row.checkedAt
                ? row.checkedAt.toISOString()
                : null,
              mentioned: row.mentioned,
              citationFound: row.citationFound,
              competitorCount:
                row.competitorNames.length,
            })),
        ),
      );
    }
    const paged = paginate(trend, 1, 100);
    return {
      days,
      since: since.toISOString(),
      trend: paged.rows,
      bySurface: [...bySurface.entries()].map(
        ([surface, buckets]) => ({ surface, buckets }),
      ),
      observations: rows.length,
      missingNote:
        'Missing days remain missing — RENKOO never interpolates observations.',
    };
  }

  async getPromptHistory(
    organizationId: string,
    websiteId: string,
    prompt: string,
    page = 1,
    pageSize = 20,
  ) {
    await this.verifyWebsite(organizationId, websiteId);
    const text = clean(prompt);
    if (!text)
      throw new BadRequestException(
        'prompt is required',
      );
    const rows =
      await this.prisma.aiVisibilityCheck.findMany({
        where: { websiteId, query: text },
        orderBy: { checkedAt: 'desc' },
        take: 200,
      });
    const timeline = rows.map((row) => ({
      id: row.id,
      surface: row.platform,
      status: row.status,
      mentioned: row.mentioned,
      citationFound: row.citationFound,
      citationUrl: row.citationUrl,
      competitors: row.competitorNames,
      observedAt: row.checkedAt,
      runId: row.runId,
      evidenceState:
        row.status === 'FAILED'
          ? 'UNAVAILABLE'
          : row.citationUrl
            ? 'OBSERVED'
            : row.response
              ? 'INFERRED'
              : 'UNAVAILABLE',
    }));
    const perSurface = new Map<
      string,
      { previous: ObservationLike | null; current: ObservationLike | null }
    >();
    for (const row of [...rows].reverse()) {
      if (row.status !== 'COMPLETED') continue;
      const key = `${row.platform}|${row.country ?? 'US'}|${row.language ?? 'en'}`;
      const entry = perSurface.get(key) ?? {
        previous: null,
        current: null,
      };
      entry.previous = entry.current;
      entry.current = this.toObservation(row);
      perSurface.set(key, entry);
    }
    const changes: PromptChange[] = [];
    for (const entry of perSurface.values()) {
      if (!entry.current) continue;
      const change = compareObservations(
        entry.previous,
        entry.current,
      );
      if (change) changes.push(change);
    }
    const paged = paginate(timeline, page, pageSize);
    return {
      prompt: text,
      changes,
      summary: summarizeChanges(changes),
      ...paged,
      rows: paged.rows,
    };
  }

  async getStatus(
    organizationId: string,
    websiteId: string,
  ) {
    await this.verifyWebsite(organizationId, websiteId);
    const [schedules, lastRun, promptCount] =
      await Promise.all([
        this.prisma.aiMonitorSchedule.findMany({
          where: {
            organizationId,
            websiteId,
            isActive: true,
          },
          orderBy: { nextRunAt: 'asc' },
          take: 10,
        }),
        this.prisma.aiMonitorRun.findFirst({
          where: { organizationId, websiteId },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.aiVisibilityQuery.count({
          where: { websiteId, isActive: true },
        }),
      ]);
    const nextRun = schedules
      .map((schedule) => schedule.nextRunAt)
      .sort((a, b) => a.getTime() - b.getTime())[0] ??
      null;
    return {
      status:
        schedules.length > 0
          ? 'ACTIVE'
          : promptCount > 0
            ? 'PAUSED'
            : 'NOT_CONFIGURED',
      schedules: schedules.length,
      nextRunAt: nextRun,
      lastRun: lastRun
        ? {
            id: lastRun.id,
            status: lastRun.status,
            origin: lastRun.origin,
            completedAt: lastRun.completedAt,
            success: lastRun.successCount,
            failure: lastRun.failureCount,
            unavailable: lastRun.unavailableCount,
            creditUsed: lastRun.creditUsed,
          }
        : null,
      prompts: promptCount,
    };
  }

  /* =====================================================
   * PRODUCTION OPS 1.0 (Phase 8A).
   *
   * External tick claims due schedules (fast, bounded,
   * race-safe) and execution happens separately via
   * execute-next with an atomic QUEUED→RUNNING claim.
   * Stale RUNNING rows are recovered after a
   * configurable timeout; missed windows advance to
   * the next eligible window (never backlog replay);
   * retention pruning is explicit, bounded and
   * privileged. Observations stay append-only.
   * ===================================================== */

  private staleTimeoutMs(): number {
    return envInt(
      'AI_MONITOR_STALE_RUN_MS',
      30 * 60 * 1000,
    );
  }

  /*
   * Phase 8B — heartbeat throttle state. Process-local
   * beat timestamps per run id: a crash loses them,
   * which is harmless (next beat simply writes).
   * Beats are time-throttled writes, never per-prompt.
   */
  private readonly lastBeatAt = new Map<
    string,
    number
  >();

  private heartbeatMs(): number {
    return envInt(
      'AI_MONITOR_HEARTBEAT_MS',
      DEFAULT_HEARTBEAT_MS,
    );
  }

  private async beatRun(
    runId: string,
    force = false,
  ): Promise<void> {
    const now = Date.now();
    const last = this.lastBeatAt.get(runId) ?? null;
    if (
      !force &&
      !heartbeatDue({
        lastBeatMs: last,
        nowMs: now,
        intervalMs: this.heartbeatMs(),
      })
    ) {
      return;
    }
    await this.prisma.aiMonitorRun.updateMany({
      where: { id: runId, status: 'RUNNING' },
      data: { lastHeartbeatAt: new Date(now) },
    });
    this.lastBeatAt.set(runId, now);
  }

  private retentionDaysEnv(): number {
    const raw = Number(
      process.env.AI_MONITOR_RETENTION_DAYS,
    );
    return Number.isFinite(raw) && raw > 0
      ? Math.floor(raw)
      : 0;
  }

  /*
   * Fast claim pass for the external tick. Creates at
   * most MAX_CLAIM_PER_TICK QUEUED runs and returns
   * immediately — no provider execution inside the
   * scheduler request. Same (schedule, window) can
   * never produce two runs: the unique constraint is
   * authoritative and P2002 resolves to the winner.
   */
  async claimDueRuns(): Promise<{
    due: number;
    claimed: number;
    skipped: number;
    missedWindows: number;
    runIds: string[];
    note: string;
  }> {
    const now = new Date();
    const due =
      await this.prisma.aiMonitorSchedule.findMany({
        where: {
          isActive: true,
          nextRunAt: { lte: now },
        },
        orderBy: { nextRunAt: 'asc' },
        take: MAX_CLAIM_PER_TICK,
      });
    const runIds: string[] = [];
    let claimed = 0;
    let skipped = 0;
    let missed = 0;
    for (const schedule of due) {
      missed += missedWindows(
        schedule.cadence as MonitorCadence,
        schedule.nextRunAt,
        now,
      );
      const website =
        await this.prisma.website.findFirst({
          where: {
            id: schedule.websiteId,
            organizationId: schedule.organizationId,
            isActive: true,
          },
          select: { id: true },
        });
      if (!website) {
        await this.prisma.aiMonitorSchedule.update({
          where: { id: schedule.id },
          data: {
            isActive: false,
            nextRunAt: nextEligibleRun(
              schedule.cadence as MonitorCadence,
              now,
            ),
          },
        });
        skipped += 1;
        continue;
      }
      const windowKey = windowKeyFor(
        schedule.cadence as MonitorCadence,
        now,
      );
      try {
        const run =
          await this.prisma.aiMonitorRun.create({
            data: {
              organizationId: schedule.organizationId,
              websiteId: schedule.websiteId,
              scheduleId: schedule.id,
              origin: 'SCHEDULED',
              status: 'QUEUED',
              windowKey,
            },
          });
        runIds.push(run.id);
        claimed += 1;
      } catch (error) {
        if (
          (error as { code?: string })?.code ===
          'P2002'
        ) {
          const existing =
            await this.prisma.aiMonitorRun.findUnique({
              where: {
                scheduleId_windowKey: {
                  scheduleId: schedule.id,
                  windowKey,
                },
              },
              select: { id: true },
            });
          if (existing) runIds.push(existing.id);
          skipped += 1;
        } else {
          this.logger.warn(
            `Claim skipped for schedule ${schedule.id}: ${String((error as Error)?.message ?? error).slice(0, 200)}`,
          );
          skipped += 1;
        }
      } finally {
        await this.prisma.aiMonitorSchedule.update({
          where: { id: schedule.id },
          data: {
            lastRunAt: now,
            nextRunAt: nextEligibleRun(
              schedule.cadence as MonitorCadence,
              now,
            ),
          },
        });
      }
    }
    return {
      due: due.length,
      claimed,
      skipped,
      missedWindows: missed,
      runIds,
      note: 'Claim only — execution runs separately via execute-next. Missed windows advance to the next eligible window; backlog is never replayed.',
    };
  }

  /*
   * Atomic single-run execution for the tick worker.
   * The QUEUED→RUNNING transition is one conditional
   * update: concurrent workers cannot execute the
   * same run twice.
   */
  async executeNextRun(): Promise<{
    executed: boolean;
    runId: string | null;
    status: string | null;
  }> {
    const next =
      await this.prisma.aiMonitorRun.findFirst({
        where: { status: 'QUEUED' },
        orderBy: { requestedAt: 'asc' },
      });
    if (!next) {
      return {
        executed: false,
        runId: null,
        status: null,
      };
    }
    const claimed =
      await this.prisma.aiMonitorRun.updateMany({
        where: { id: next.id, status: 'QUEUED' },
        data: {
          status: 'RUNNING',
          startedAt: new Date(),
          lastHeartbeatAt: new Date(),
        },
      });
    if (claimed.count !== 1) {
      return {
        executed: false,
        runId: next.id,
        status: 'CLAIMED_ELSEWHERE',
      };
    }
    this.lastBeatAt.set(next.id, Date.now());
    const website =
      await this.prisma.website.findFirst({
        where: {
          id: next.websiteId,
          organizationId: next.organizationId,
          isActive: true,
        },
        select: { id: true },
      });
    if (!website) {
      await this.prisma.aiMonitorRun.update({
        where: { id: next.id },
        data: {
          status: 'CANCELLED',
          completedAt: new Date(),
          errorSummary:
            'Website or organization no longer available.',
        },
      });
      return {
        executed: false,
        runId: next.id,
        status: 'CANCELLED',
      };
    }
    const finished = await this.executeClaimedRun(
      next.organizationId,
      next.id,
    );
    return {
      executed: true,
      runId: finished.id,
      status: finished.status,
    };
  }

  /*
   * Execute a run that is already RUNNING (claimed by
   * execute-next or a manual request). Shared by the
   * tick worker and manual runs.
   */
  private async executeClaimedRun(
    organizationId: string,
    runId: string,
  ) {
    const run = await this.prisma.aiMonitorRun.findFirst(
      {
        where: { id: runId, organizationId },
      },
    );
    if (!run)
      throw new NotFoundException('Run not found');
    const schedules =
      run.scheduleId != null
        ? await this.prisma.aiMonitorSchedule.findFirst(
            {
              where: { id: run.scheduleId },
            },
          )
        : null;
    const surfaces =
      schedules != null &&
      Array.isArray(schedules.surfaces) &&
      schedules.surfaces.length > 0
        ? schedules.surfaces
        : ['GEMINI'];
    return this.executeRunUnits(organizationId, runId, {
      surfaces,
      country: schedules?.country ?? 'US',
      language: schedules?.language ?? 'en',
    });
  }

  /*
   * Stale recovery: a RUNNING row is stale only when
   * its heartbeat is silent past the timeout (or, for
   * rows that never beat, its wall-clock age is past
   * the timeout). Healthy beats protect legitimate
   * long runs. Nothing is re-charged; safe retry
   * happens through a fresh run (idempotency keys
   * skip already-succeeded work).
   */
  async recoverStaleRuns(): Promise<{
    recovered: number;
    runIds: string[];
  }> {
    const cutoff = new Date(
      Date.now() - this.staleTimeoutMs(),
    );
    const candidates =
      await this.prisma.aiMonitorRun.findMany({
        where: {
          status: 'RUNNING',
          OR: [
            { lastHeartbeatAt: { lt: cutoff } },
            {
              lastHeartbeatAt: null,
              startedAt: { lt: cutoff },
            },
          ],
        },
        orderBy: { startedAt: 'asc' },
        take: MAX_CLAIM_PER_TICK,
      });
    const runIds: string[] = [];
    for (const run of candidates) {
      if (
        !staleWithHeartbeat({
          status: run.status,
          startedAt: run.startedAt,
          lastHeartbeatAt: run.lastHeartbeatAt,
          timeoutMs: this.staleTimeoutMs(),
        })
      ) {
        continue;
      }
      const confirmed =
        await this.prisma.aiMonitorRun.updateMany({
          where: { id: run.id, status: 'RUNNING' },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            errorSummary:
              'Recovered stale run: no heartbeat within the configured timeout (worker likely crashed). Retry safely with a fresh run — completed observations are kept by idempotency key.',
          },
        });
      if (confirmed.count === 1) runIds.push(run.id);
    }
    return { recovered: runIds.length, runIds };
  }

  /*
   * Bounded retention pruning. Deletes only rows
   * older than the cutoff that are NOT the latest
   * observation of their (website, prompt, surface)
   * group — current intelligence is never removed.
   * Disabled when retention days <= 0.
   */
  async pruneObservations(
    retentionDays?: number,
  ): Promise<{
    enabled: boolean;
    deleted: number;
    batches: number;
    cutoff: string | null;
  }> {
    const days =
      retentionDays ?? this.retentionDaysEnv();
    const cutoff = retentionCutoff(days);
    if (!cutoff) {
      return {
        enabled: false,
        deleted: 0,
        batches: 0,
        cutoff: null,
      };
    }
    const candidates: Array<{ id: string }> =
      await this.prisma.$queryRaw`
        SELECT "id" FROM "AiVisibilityCheck"
        WHERE "checkedAt" < ${cutoff}
        ORDER BY "checkedAt" ASC
        LIMIT ${MAX_PRUNE_BATCH * 2}
      `;
    if (candidates.length === 0) {
      return {
        enabled: true,
        deleted: 0,
        batches: 0,
        cutoff: cutoff.toISOString(),
      };
    }
    const ids = candidates.map((row) => row.id);
    const deletable: Array<{ id: string }> =
      await this.prisma.$queryRaw`
        SELECT c."id" FROM "AiVisibilityCheck" c
        WHERE c."id" = ANY(${ids}::text[])
        AND EXISTS (
          SELECT 1 FROM "AiVisibilityCheck" n
          WHERE n."websiteId" = c."websiteId"
            AND n."query" = c."query"
            AND n."platform" = c."platform"
            AND n."checkedAt" > c."checkedAt"
        )
      `;
    const batches = pruneBatches(
      deletable.map((row) => row.id),
      MAX_PRUNE_BATCH,
    );
    let deleted = 0;
    for (const batch of batches) {
      const result =
        await this.prisma.aiVisibilityCheck.deleteMany({
          where: { id: { in: batch } },
        });
      deleted += result.count;
    }
    return {
      enabled: true,
      deleted,
      batches: batches.length,
      cutoff: cutoff.toISOString(),
    };
  }

  /* ============ health (extends MonitoringService use) ============ */

  async getMonitoringHealth(
    organizationId: string,
    websiteId: string,
  ) {
    await this.verifyWebsite(organizationId, websiteId);
    const [
      activeSchedules,
      recentRuns,
      lastSuccessful,
      promptCount,
      currentRunning,
      recoveries,
    ] = await Promise.all([
      this.prisma.aiMonitorSchedule.findMany({
        where: {
          organizationId,
          websiteId,
          isActive: true,
        },
        orderBy: { nextRunAt: 'asc' },
        take: 10,
      }),
      this.prisma.aiMonitorRun.findMany({
        where: { organizationId, websiteId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.aiMonitorRun.findFirst({
        where: {
          organizationId,
          websiteId,
          status: 'COMPLETED',
        },
        orderBy: { completedAt: 'desc' },
      }),
      this.prisma.aiVisibilityQuery.count({
        where: { websiteId, isActive: true },
      }),
      this.prisma.aiMonitorRun.findFirst({
        where: {
          organizationId,
          websiteId,
          status: 'RUNNING',
        },
        orderBy: { startedAt: 'asc' },
      }),
      this.prisma.aiMonitorRun.count({
        where: {
          organizationId,
          websiteId,
          status: 'FAILED',
          completedAt: {
            gte: new Date(
              Date.now() - 24 * 60 * 60 * 1000,
            ),
          },
        },
      }),
    ]);
    const staleCutoff = new Date(
      Date.now() - this.staleTimeoutMs(),
    );
    const staleCount =
      await this.prisma.aiMonitorRun.count({
        where: {
          organizationId,
          websiteId,
          status: 'RUNNING',
          OR: [
            { lastHeartbeatAt: { lt: staleCutoff } },
            {
              lastHeartbeatAt: null,
              startedAt: { lt: staleCutoff },
            },
          ],
        },
      });
    const lastRun = recentRuns[0] ?? null;
    const nextRun =
      activeSchedules
        .map((schedule) => schedule.nextRunAt)
        .sort(
          (a, b) => a.getTime() - b.getTime(),
        )[0] ?? null;
    const surfaces =
      activeSchedules[0]?.surfaces?.length > 0
        ? activeSchedules[0].surfaces
        : ['GEMINI'];
    const executable = surfaces.filter((surface) =>
      this.providerRegistry
        .get(surface as never)
        ?.isConfigured(),
    ).length;
    const allowance =
      await this.scanAllowance(organizationId);
    const guard = creditGuard({
      estimate: estimateRunUsage({
        promptCount: Math.min(
          promptCount,
          MAX_PROMPTS_PER_RUN,
        ),
        surfaceCount: surfaces.length,
        executableSurfaces: executable,
      }).billableEstimate,
      used: allowance.used,
      limit: allowance.limit,
    });
    return {
      ...buildHealth({
        activeSchedules: activeSchedules.length,
        nextRunAt: nextRun
          ? nextRun.toISOString()
          : null,
        lastRun: lastRun
          ? {
              id: lastRun.id,
              status: lastRun.status,
              completedAt:
                lastRun.completedAt?.toISOString() ??
                null,
            }
          : null,
        lastSuccessfulRun: lastSuccessful
          ? {
              id: lastSuccessful.id,
              completedAt:
                lastSuccessful.completedAt?.toISOString() ??
                null,
            }
          : null,
        recentStatuses: recentRuns.map(
          (run) => run.status,
        ),
        staleRuns: staleCount,
        providers: this.providerRegistry
          .listDeclaredStates()
          .map((state) => ({
            id: state.id,
            configured: state.configured === true,
          })),
        allowance: {
          used: allowance.used,
          limit: allowance.limit,
          unlimited: allowance.unlimited,
        },
        creditBlocked: !guard.allowed,
        creditReason: guard.reason,
      }),
      consecutiveFailuresDetail: consecutiveFailures(
        recentRuns.map((run) => run.status),
      ),
      prompts: promptCount,
      /* Phase 8B — tick activity derived from existing
       * ledger rows (no new tables, no fake uptime). */
      schedulerActivity: {
        lastTickAt:
          activeSchedules
            .map((schedule) => schedule.lastRunAt)
            .filter(
              (value): value is Date =>
                value instanceof Date,
            )
            .sort(
              (a, b) => b.getTime() - a.getTime(),
            )[0]?.toISOString() ?? null,
        recoveriesLast24h: recoveries,
      },
      currentRunning: currentRunning
        ? {
            id: currentRunning.id,
            startedAt:
              currentRunning.startedAt?.toISOString() ??
              null,
            lastHeartbeatAt:
              currentRunning.lastHeartbeatAt?.toISOString() ??
              null,
            heartbeatAgeMs: heartbeatAgeMs(
              currentRunning.lastHeartbeatAt,
            ),
          }
        : null,
    };
  }

  /* ============ run observability detail ============ */

  async getRunObservability(
    organizationId: string,
    runId: string,
  ) {
    const run = await this.prisma.aiMonitorRun.findFirst(
      {
        where: { id: runId, organizationId },
      },
    );
    if (!run)
      throw new NotFoundException('Run not found');
    return shapeRunObservability({
      id: run.id,
      status: run.status,
      origin: run.origin,
      requestedAt: run.requestedAt,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      promptCount: run.promptCount,
      successCount: run.successCount,
      failureCount: run.failureCount,
      unavailableCount: run.unavailableCount,
      retryCount: run.retryCount,
      creditUsed: run.creditUsed,
      errorSummary: run.errorSummary,
      lastHeartbeatAt: run.lastHeartbeatAt,
      staleTimeoutMs: this.staleTimeoutMs(),
    });
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { RankIntelligenceService } from './rank-intelligence.service';
import {
  MAX_ALERTS_PER_RUN,
  MAX_CLAIM_PER_TICK,
  MAX_DB_BATCH,
  MAX_DIGEST_ITEMS,
  MAX_EXECUTIONS_PER_TICK,
  MAX_KEYWORDS_PER_RUN,
  STALE_RUN_MS,
  alertDedupeKey,
  buildDigest,
  changeHealth,
  changeRunIdentity,
  classifyAiChange,
  classifyRankChange,
  cooldownDecision,
  correlateAction,
  digestDayKey,
  evaluateResolution,
  evidenceEnvelope,
  gainAfterVerifiedChange,
  isChangeRunStale,
  isMuted,
  isScheduleDue,
  missedRunDecision,
  missedWindowCount,
  nextRunAt,
  normalizeCadence,
  normalizeScopes,
  observabilityShape,
  searchAiDivergenceNote,
  type AlertLifecycle,
  type AlertScope,
  type ChangeRunStatus,
  type RankCadence,
  type SearchAlertType,
} from './search-change';
import {
  aggregateRunStatus,
  normalizeCountry,
  normalizeDevice,
  normalizeLanguage,
  normalizeTrackedKeyword,
  observationWindowKey,
  observationWindowKey as rankWindowKey,
} from './rank-intelligence';
import { isDataForSeoConfigured } from './keyword-data-provider';

/*
 * =========================================================
 * SEARCH CHANGE & ALERT INTELLIGENCE 2.0 (Phase 32).
 *
 * Recurring loop over the Phase 31 watchlist reusing:
 * - Phase 8 scheduler pattern (due / execute-next /
 *   recover, heartbeat, latest-eligible-window-only,
 *   x-scheduler-secret guard at the controller).
 * - RankTrackingRun lifecycle (+ nullable heartbeat).
 * - MonitoringAlert dedupe/state (deterministic keys,
 *   OPEN/ACKNOWLEDGED/RESOLVED/DISMISSED).
 * - Phase 31 meaningful-movement philosophy.
 * - Phase 26 descriptive events (consumed, not
 *   duplicated); Phase 29 execution/verification and
 *   Phase 23 measurement (referenced, not rebuilt).
 *
 * Honesty: CHANGE ≠ CAUSE. Provider failure is
 * UNKNOWN, never a loss. GSC position stays an
 * aggregate. AI is never a rank. Muted ≠ deleted.
 * =========================================================
 */

const STALE_AFTER_HOURS = 49;
const GAIN_LOOKBACK_DAYS = 14;

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

const TRIGGER_TO_ALERT: Record<string, SearchAlertType> = {
  TOP_3_EXIT: 'TOP_3_EXIT',
  TOP_10_EXIT: 'TOP_10_EXIT',
  TOP_10_ENTRY: 'TOP_10_ENTRY',
  POSITION_DROP: 'RANK_LOSS',
  POSITION_GAIN: 'RANK_GAIN',
  WRONG_URL: 'WRONG_URL',
  SERP_FEATURE_LOST: 'SERP_FEATURE_LOSS',
  SERP_FEATURE_GAINED: 'SERP_FEATURE_GAIN',
  COMPETITOR_OVERTAKE: 'COMPETITOR_MOVEMENT',
};

const ALERT_TO_SCOPE: Record<SearchAlertType, AlertScope> = {
  RANK_GAIN: 'RANK',
  RANK_LOSS: 'RANK',
  TOP_10_ENTRY: 'RANK',
  TOP_10_EXIT: 'RANK',
  TOP_3_ENTRY: 'RANK',
  TOP_3_EXIT: 'RANK',
  WRONG_URL: 'RANK',
  SERP_FEATURE_GAIN: 'RANK',
  SERP_FEATURE_LOSS: 'RANK',
  COMPETITOR_MOVEMENT: 'COMPETITOR',
  AI_VISIBILITY_CHANGE: 'AI',
  GSC_CHANGE: 'RANK',
  WEBSITE_CHANGE: 'SITE',
  EXECUTION_VERIFIED: 'EXECUTION',
};

@Injectable()
export class SearchChangeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly monitoring: MonitoringService,
    private readonly rankIntelligence: RankIntelligenceService,
  ) {}

  private get schedules() {
    return (this.prisma as unknown as Record<string, any>)
      .rankTrackingSchedule;
  }

  private get prefs() {
    return (this.prisma as unknown as Record<string, any>)
      .rankAlertPreference;
  }

  private get runs() {
    return (this.prisma as unknown as Record<string, any>)
      .rankTrackingRun;
  }

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

  /* ============ schedules (§4) ============ */

  async listSchedules(
    organizationId: string,
    websiteId: string,
  ) {
    await this.verifyWebsite(organizationId, websiteId);
    const rows = await this.schedules.findMany({
      where: { organizationId, websiteId },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    return {
      schedules: (rows as Array<any>).map((r) => ({
        ...r,
        missedWindows: r.nextRunAt
          ? missedWindowCount({
              cadence: normalizeCadence(r.cadence),
              nextRunAt: new Date(r.nextRunAt),
            })
          : 0,
      })),
    };
  }

  async createSchedule(
    organizationId: string,
    websiteId: string,
    input: {
      country?: string;
      language?: string;
      device?: string;
      cadence?: string;
    },
  ) {
    await this.verifyWebsite(organizationId, websiteId);
    const country = normalizeCountry(input.country);
    const language = normalizeLanguage(input.language);
    const device = normalizeDevice(input.device);
    const cadence = normalizeCadence(input.cadence);
    const existing = await this.schedules.findUnique({
      where: {
        organizationId_websiteId_country_language_device_searchEngine:
          {
            organizationId,
            websiteId,
            country,
            language,
            device,
            searchEngine: 'GOOGLE',
          },
      },
    });
    /* Idempotent: re-creating the same context
     * reactivates instead of duplicating. */
    if (existing) {
      return this.schedules.update({
        where: { id: (existing as any).id },
        data: {
          cadence,
          isActive: true,
          nextRunAt:
            (existing as any).nextRunAt ?? new Date(),
        },
      });
    }
    return this.schedules.create({
      data: {
        organizationId,
        websiteId,
        country,
        language,
        device,
        searchEngine: 'GOOGLE',
        cadence,
        isActive: true,
        nextRunAt: new Date(),
      },
    });
  }

  async updateSchedule(
    organizationId: string,
    websiteId: string,
    id: string,
    input: { cadence?: string; isActive?: boolean },
  ) {
    await this.verifyWebsite(organizationId, websiteId);
    const row = await this.schedules.findFirst({
      where: { id, organizationId, websiteId },
    });
    if (!row)
      throw new NotFoundException('Schedule not found');
    const data: Record<string, unknown> = {};
    if (input.cadence !== undefined) {
      data.cadence = normalizeCadence(input.cadence);
      data.nextRunAt = nextRunAt(
        normalizeCadence(input.cadence),
        new Date(),
      );
    }
    if (typeof input.isActive === 'boolean') {
      data.isActive = input.isActive;
      if (input.isActive && !(row as any).nextRunAt) {
        data.nextRunAt = new Date();
      }
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        'Nothing to update. Provide cadence and/or isActive.',
      );
    }
    return this.schedules.update({
      where: { id },
      data,
    });
  }

  async deleteSchedule(
    organizationId: string,
    websiteId: string,
    id: string,
  ) {
    await this.verifyWebsite(organizationId, websiteId);
    const row = await this.schedules.findFirst({
      where: { id, organizationId, websiteId },
    });
    if (!row)
      throw new NotFoundException('Schedule not found');
    /* Config-only delete: observations, runs and
     * alert evidence are never touched. */
    await this.schedules.delete({ where: { id } });
    return { deleted: id };
  }

  /* ============ due (§6) ============ */

  async claimDue(input?: { nowIso?: string }) {
    const now = input?.nowIso
      ? new Date(input.nowIso)
      : new Date();
    const due = await this.schedules.findMany({
      where: {
        isActive: true,
        OR: [
          { nextRunAt: null },
          { nextRunAt: { lte: now } },
        ],
      },
      orderBy: { nextRunAt: 'asc' },
      take: MAX_CLAIM_PER_TICK,
    });
    const claimed: Array<Record<string, unknown>> = [];
    for (const s of due as Array<any>) {
      if (
        !isScheduleDue({
          isActive: s.isActive,
          nextRunAt: s.nextRunAt,
          now,
        })
      ) {
        continue;
      }
      const cadence = normalizeCadence(s.cadence);
      const decision = missedRunDecision({
        cadence,
        nextRunAt: s.nextRunAt
          ? new Date(s.nextRunAt)
          : now,
        now,
      });
      const windowKey = observationWindowKey(
        now.toISOString(),
      );
      const identity = changeRunIdentity({
        organizationId: s.organizationId,
        websiteId: s.websiteId,
        windowKey,
      });
      void identity;
      const existingRun = await this.runs.findUnique({
        where: {
          organizationId_websiteId_windowKey: {
            organizationId: s.organizationId,
            websiteId: s.websiteId,
            windowKey,
          },
        },
      });
      if (existingRun) {
        /* Same window already claimed — idempotent. */
        await this.schedules.update({
          where: { id: s.id },
          data: {
            nextRunAt: nextRunAt(cadence, now),
            lastRunAt: now,
            lastStatus: (existingRun as any).status,
          },
        });
        continue;
      }
      const run = await this.runs.create({
        data: {
          organizationId: s.organizationId,
          websiteId: s.websiteId,
          status: 'QUEUED',
          windowKey,
          scheduleId: s.id,
        },
      });
      await this.schedules.update({
        where: { id: s.id },
        data: {
          lastRunAt: now,
          lastStatus: 'QUEUED',
        },
      });
      claimed.push({
        ...(run as object),
        scheduleId: s.id,
        cadence,
        skippedWindows: decision.skippedWindows,
        missedNote: decision.note,
      });
    }
    return {
      claimed: claimed.length,
      runs: claimed,
      note: 'Latest eligible window only — missed days are never replayed or fabricated.',
    };
  }

  /* ============ execute-next (§6) ============ */

  async executeNext(input?: {
    maxRuns?: number;
    nowIso?: string;
  }) {
    if (!isDataForSeoConfigured()) {
      return {
        executed: 0,
        runs: [],
        code: 'RANK_TRACKING_UNAVAILABLE',
        note: 'Provider credentials unavailable — no observations faked, no runs marked complete.',
      };
    }
    const cap = Math.min(
      MAX_EXECUTIONS_PER_TICK,
      Math.max(1, input?.maxRuns ?? 2),
    );
    const queued = await this.runs.findMany({
      where: { status: 'QUEUED' },
      orderBy: { createdAt: 'asc' },
      take: cap,
    });
    const results: Array<Record<string, unknown>> = [];
    for (const run of queued as Array<any>) {
      results.push(
        await this.executeOne(
          run.organizationId,
          run.websiteId,
          run,
        ),
      );
    }
    return {
      executed: results.length,
      runs: results,
    };
  }

  private async executeOne(
    organizationId: string,
    websiteId: string,
    run: any,
  ) {
    const website = await this.verifyWebsite(
      organizationId,
      websiteId,
    ).catch(() => null);
    if (!website) {
      await this.runs.update({
        where: { id: run.id },
        data: {
          status: 'CANCELLED',
          finishedAt: new Date(),
          errorSummary: 'Website missing or inactive.',
        },
      });
      return { id: run.id, status: 'CANCELLED' };
    }
    await this.runs.update({
      where: { id: run.id },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
        lastHeartbeatAt: new Date(),
      },
    });
    const schedule = run.scheduleId
      ? await this.schedules
          .findFirst({
            where: {
              id: run.scheduleId,
              organizationId,
              websiteId,
            },
          })
          .catch(() => null)
      : null;
    const tracked = (await (
      this.rankIntelligence as any
    ).tracked.findMany({
      where: {
        organizationId,
        websiteId,
        isActive: true,
        ...(schedule
          ? {
              country: (schedule as any).country ?? 'US',
              language: (schedule as any).language ?? 'en',
              device: String(
                (schedule as any).device ?? 'DESKTOP',
              ),
            }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_KEYWORDS_PER_RUN,
    })) as Array<any>;
    const heartbeat = async () => {
      await this.runs.update({
        where: { id: run.id },
        data: { lastHeartbeatAt: new Date() },
      });
    };
    const outcome =
      await this.rankIntelligence.observeActiveKeywords(
        organizationId,
        website,
        tracked,
        {
          refresh: false,
          windowKey: run.windowKey,
          onProgress: async () => {
            await heartbeat();
          },
        },
      );
    const status = aggregateRunStatus({
      total: tracked.length,
      succeeded: outcome.succeeded,
      failed: outcome.failed,
      providerUnavailable: false,
    }) as ChangeRunStatus;
    await this.runs.update({
      where: { id: run.id },
      data: {
        status,
        totalKeywords: tracked.length,
        succeeded: outcome.succeeded,
        failed: outcome.failed,
        skipped: outcome.skipped,
        finishedAt: new Date(),
        lastHeartbeatAt: new Date(),
        errorSummary:
          outcome.failures.length > 0
            ? outcome.failures.join(' | ')
            : null,
      },
    });
    if (schedule) {
      const cadence = normalizeCadence(
        (schedule as any).cadence,
      );
      await this.schedules.update({
        where: { id: (schedule as any).id },
        data: {
          nextRunAt: nextRunAt(cadence, new Date()),
          lastRunAt: new Date(),
          lastStatus: status,
        },
      });
    }
    /* Detect → alert on the fresh observations. */
    const detection = await this.detectForRun(
      organizationId,
      websiteId,
      tracked,
      run.windowKey,
    );
    return {
      id: run.id,
      status,
      totalKeywords: tracked.length,
      ...outcome,
      alertsCreated: detection.created,
      alertsSuppressed: detection.suppressed,
    };
  }

  /* ============ recover (§8) ============ */

  async recover(input?: {
    nowMs?: number;
    timeoutMs?: number;
  }) {
    const running = await this.runs.findMany({
      where: { status: 'RUNNING' },
      orderBy: { createdAt: 'asc' },
      take: MAX_DB_BATCH,
    });
    let recovered = 0;
    for (const run of running as Array<any>) {
      const stale = isChangeRunStale({
        status: run.status,
        startedAt: run.startedAt,
        lastHeartbeatAt: run.lastHeartbeatAt ?? null,
        nowMs: input?.nowMs,
        timeoutMs: input?.timeoutMs ?? STALE_RUN_MS,
      });
      if (!stale) continue;
      await this.runs.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          errorSummary:
            'Stale run recovered: no heartbeat within timeout. Never left RUNNING indefinitely.',
        },
      });
      /* Schedule retries the latest window only. */
      if (run.scheduleId) {
        await this.schedules
          .update({
            where: { id: run.scheduleId },
            data: {
              nextRunAt: new Date(),
              lastStatus: 'FAILED',
            },
          })
          .catch(() => null);
      }
      recovered++;
    }
    return {
      recovered,
      note: 'Stale RUNNING runs fail safely; schedules retry the latest eligible window only.',
    };
  }

  /* ============ detection → alerts (§13–§19) ============ */

  private async loadPrefs(organizationId: string, websiteId: string) {
    const rows = (await this.prefs
      .findMany({
        where: { organizationId, websiteId },
        take: 200,
      })
      .catch(() => [])) as Array<any>;
    const enabledScopes = normalizeScopes(
      rows
        .filter((r) => r.kind === 'SCOPE' && r.enabled)
        .map((r) => r.key),
    );
    const allScopesDisabled =
      rows.some((r) => r.kind === 'SCOPE') &&
      enabledScopes.length === 0;
    return {
      enabledScopes: allScopesDisabled ? [] : enabledScopes,
      mutedTypes: rows
        .filter((r) => r.kind === 'MUTE_TYPE')
        .map((r) => String(r.key).toUpperCase()),
      mutedKeywords: rows
        .filter((r) => r.kind === 'MUTE_KEYWORD')
        .map((r) =>
          normalizeTrackedKeyword(String(r.key)),
        ),
      muteUntil: Object.fromEntries(
        rows
          .filter((r) => r.mutedUntil)
          .map((r) => [
            String(r.key),
            new Date(r.mutedUntil).toISOString(),
          ]),
      ) as Record<string, string>,
    };
  }

  private async detectForRun(
    organizationId: string,
    websiteId: string,
    tracked: Array<any>,
    windowKey: string,
  ): Promise<{ created: number; suppressed: number }> {
    const prefs = await this.loadPrefs(
      organizationId,
      websiteId,
    );
    let created = 0;
    let suppressed = 0;
    for (const tk of tracked.slice(0, MAX_ALERTS_PER_RUN)) {
      let detail: any = null;
      try {
        detail = await this.rankIntelligence.getTracked(
          organizationId,
          websiteId,
          String(tk.id),
        );
      } catch {
        continue;
      }
      const obs = detail.observations ?? [];
      if (obs.length < 2) continue;
      /* Compare the two latest VALID observations —
       * UNKNOWN never participates in movement. */
      const valid = obs.filter(
        (o: any) => o.position !== null,
      );
      const prev = valid.length > 1 ? valid[valid.length - 2] : null;
      const curr = valid.length > 0 ? valid[valid.length - 1] : null;
      const urlChanged =
        detail.urlState === 'URL_CHANGED';
      const targetReplaced = detail.wrongUrlRanking === true;
      const prevFeatures: string[] = [];
      const currFeatures: string[] = detail.serpFeatures ?? [];
      const gained = currFeatures.filter(
        (f) => !prevFeatures.includes(f),
      );
      const lost: string[] = [];
      const aiChanged =
        detail.divergence === 'GOOGLE_WEAK_AI_STRONG' ||
        detail.divergence === 'GOOGLE_STRONG_AI_WEAK';
      const changes = classifyRankChange({
        keyword: detail.trackedKeyword.keyword,
        previous: prev?.position ?? null,
        current: curr?.position ?? null,
        previousConfirmedAbsent: false,
        currentConfirmedAbsent: false,
        previousExists: valid.length > 0,
        urlChanged,
        targetReplaced,
        serpFeatureGained: gained,
        serpFeatureLost: lost,
        competitorMoved: false,
        aiStateChanged: aiChanged,
      });
      /* AI citation transitions from stored states. */
      const aiEvents = classifyAiChange({
        previousMention: null,
        currentMention:
          detail.aiMode === 'AI_MENTION' ||
          detail.aiMode === 'AI_CITATION'
            ? true
            : null,
        previousCitation: null,
        currentCitation:
          detail.aiMode === 'AI_CITATION' ? true : null,
        previousSource: null,
        currentSource: detail.rankingUrl,
        providerSupportsAi: currFeatures.length > 0,
      });
      void aiEvents;
      for (const change of changes) {
        if (!change.meaningful) {
          suppressed++;
          continue;
        }
        const scope = ALERT_TO_SCOPE[change.alertType];
        if (!prefs.enabledScopes.includes(scope)) {
          suppressed++;
          continue;
        }
        const mute = isMuted({
          mutedTypes: prefs.mutedTypes,
          mutedKeywords: prefs.mutedKeywords,
          alertType: change.alertType,
          keyword: detail.trackedKeyword.keyword,
          muteUntil: prefs.muteUntil,
        });
        if (mute.muted) {
          suppressed++;
          continue;
        }
        const before =
          prev?.position !== null &&
          prev?.position !== undefined
            ? String(prev.position)
            : 'unobserved';
        const after =
          curr?.position !== null &&
          curr?.position !== undefined
            ? String(curr.position)
            : 'unobserved';
        const dedupe = alertDedupeKey({
          eventType: change.alertType,
          websiteId,
          keywordOrPage: detail.trackedKeyword.keyword,
          windowKey,
          before,
          after,
        });
        /* Cooldown: same condition → suppress unless
         * meaningful new movement. */
        const prefix = [
          'SEARCH_CHANGE',
          change.alertType,
          websiteId,
          normalizeTrackedKeyword(
            detail.trackedKeyword.keyword,
          ),
        ].join('|');
        const prior =
          await this.prisma.monitoringAlert.findMany({
            where: {
              organizationId,
              websiteId,
              active: true,
              deduplicationKey: { startsWith: prefix },
            },
            orderBy: { detectedAt: 'desc' },
            take: 1,
          });
        if (prior.length > 0) {
          const ev = (prior[0].evidence ?? {}) as Record<
            string,
            unknown
          >;
          const decision = cooldownDecision({
            lastNotifiedAt: new Date(
              prior[0].detectedAt,
            ).toISOString(),
            currentBefore: before,
            currentAfter: after,
            lastBefore:
              ev.before !== undefined
                ? String(ev.before)
                : null,
            lastAfter:
              ev.after !== undefined
                ? String(ev.after)
                : null,
          });
          if (!decision.notify) {
            suppressed++;
            continue;
          }
        }
        const correlation = await this.correlateExecution(
          organizationId,
          detail.trackedKeyword.keyword,
          curr?.position ?? null,
          prev?.position ?? null,
        );
        const envelope = evidenceEnvelope({
          keyword: detail.trackedKeyword.keyword,
          before: prev?.position ?? null,
          after: curr?.position ?? null,
          rankingUrl: detail.rankingUrl,
          evidenceState: 'OBSERVED',
        });
        const severity =
          change.alertType === 'TOP_3_EXIT' ||
          change.alertType === 'TOP_10_EXIT'
            ? 'HIGH'
            : change.alertType === 'WRONG_URL' ||
                change.alertType === 'RANK_LOSS' ||
                change.alertType === 'COMPETITOR_MOVEMENT'
              ? 'MEDIUM'
              : 'LOW';
        try {
          await this.monitoring.createAlert(organizationId, {
            websiteId,
            type: change.alertType,
            source: 'RANK' as never,
            severity: severity as never,
            title: change.statement,
            description:
              `${change.statement} ${envelope.whatWeKnow} ${envelope.whatWeDontKnow} ` +
              `Correlation: ${correlation}. Ranking URL: ${detail.rankingUrl ?? 'UNAVAILABLE'}. ` +
              `Target: ${detail.targetUrl ?? 'UNAVAILABLE'}.`,
            evidence: {
              keyword: detail.trackedKeyword.keyword,
              trackedKeywordId: tk.id,
              alertType: change.alertType,
              event: change.event,
              before,
              after,
              rankingUrl: detail.rankingUrl,
              targetUrl: detail.targetUrl,
              correlation,
              evidenceState: 'OBSERVED',
              windowKey,
            } as never,
            deduplicationKey: dedupe,
          });
          created++;
        } catch {
          suppressed++;
        }
      }
    }
    return { created, suppressed };
  }

  private async correlateExecution(
    organizationId: string,
    keyword: string,
    current: number | null,
    previous: number | null,
  ): Promise<string> {
    try {
      const since = new Date(
        Date.now() - GAIN_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
      );
      const actions = await this.prisma.action.findMany({
        where: {
          organizationId,
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      const norm = normalizeTrackedKeyword(keyword);
      const match = actions.find((a) => {
        const meta = (a.metadata ?? {}) as Record<
          string,
          unknown
        >;
        const hay = [
          meta.strategyKeyword,
          meta.keyword,
          meta.query,
          a.title,
        ]
          .map((v) => normalizeTrackedKeyword(String(v ?? '')))
          .join(' ');
        return norm !== '' && hay.includes(norm);
      });
      if (match) {
        const verified =
          String((match as any).status ?? '').toUpperCase() ===
            'VERIFIED' ||
          (match as any).completedAt !== null;
        const corr = correlateAction({
          recentVerifiedAction: verified,
        });
        if (
          corr === 'PLANNED_CHANGE' &&
          current !== null &&
          previous !== null &&
          current < previous
        ) {
          return gainAfterVerifiedChange({
            keyword,
            before: previous,
            after: current,
            verified: true,
          });
        }
        return corr;
      }
    } catch {
      /* attribution unavailable — never block */
    }
    return correlateAction({ recentVerifiedAction: false });
  }

  /* ============ digest (§40/§41) ============ */

  async getDigest(
    organizationId: string,
    websiteId: string,
    input: { timeZone?: string; maxItems?: number },
  ) {
    await this.verifyWebsite(organizationId, websiteId);
    const tz = clean(input.timeZone) || 'UTC';
    const today = digestDayKey(new Date().toISOString(), tz);
    const since = new Date(`${today}T00:00:00.000Z`);
    const alerts = await this.prisma.monitoringAlert.findMany(
      {
        where: {
          organizationId,
          websiteId,
          active: true,
          source: 'RANK',
          detectedAt: { gte: since },
        },
        orderBy: { detectedAt: 'desc' },
        take: MAX_DB_BATCH,
      },
    );
    const items = alerts.map((a) => {
      const t = String(a.type) as SearchAlertType;
      return {
        alertType: t,
        title: a.title,
        positive:
          t === 'RANK_GAIN' ||
          t === 'TOP_10_ENTRY' ||
          t === 'TOP_3_ENTRY',
        divergence: t === 'AI_VISIBILITY_CHANGE',
      };
    });
    return {
      ...buildDigest(
        items,
        Math.min(
          MAX_DIGEST_ITEMS,
          Math.max(1, input.maxItems ?? MAX_DIGEST_ITEMS),
        ),
      ),
      day: today,
      timeZone: tz,
      delivery:
        'Digest default; instant only for configured high-value events. No email infrastructure created.',
    };
  }

  /* ============ preferences (§54/§55) ============ */

  async getPreferences(
    organizationId: string,
    websiteId: string,
  ) {
    await this.verifyWebsite(organizationId, websiteId);
    const rows = (await this.prefs.findMany({
      where: { organizationId, websiteId },
      take: 200,
    })) as Array<any>;
    return {
      scopes: normalizeScopes(
        rows
          .filter((r) => r.kind === 'SCOPE' && r.enabled)
          .map((r) => r.key),
      ),
      mutedTypes: rows
        .filter((r) => r.kind === 'MUTE_TYPE')
        .map((r) => ({
          key: r.key,
          mutedUntil: r.mutedUntil,
        })),
      mutedKeywords: rows
        .filter((r) => r.kind === 'MUTE_KEYWORD')
        .map((r) => ({
          key: r.key,
          mutedUntil: r.mutedUntil,
        })),
      note: 'Muted alerts keep their evidence. Muted ≠ nonexistent.',
    };
  }

  async setScope(
    organizationId: string,
    websiteId: string,
    scope: string,
    enabled: boolean,
  ) {
    await this.verifyWebsite(organizationId, websiteId);
    const scopes = normalizeScopes([scope]);
    if (scopes.length === 0 || normalizeScopes([scope])[0] !== scope.toUpperCase()) {
      throw new BadRequestException(
        'Scope must be one of RANK, AI, COMPETITOR, SITE, EXECUTION.',
      );
    }
    const key = scope.toUpperCase();
    const existing = await this.prefs.findUnique({
      where: {
        organizationId_websiteId_kind_key: {
          organizationId,
          websiteId,
          kind: 'SCOPE',
          key,
        },
      },
    }).catch(() => null);
    if (existing) {
      return this.prefs.update({
        where: { id: (existing as any).id },
        data: { enabled },
      });
    }
    return this.prefs.create({
      data: {
        organizationId,
        websiteId,
        kind: 'SCOPE',
        key,
        enabled,
      },
    });
  }

  async mute(
    organizationId: string,
    websiteId: string,
    input: {
      alertType?: string;
      keyword?: string;
      mutedUntil?: string;
    },
  ) {
    await this.verifyWebsite(organizationId, websiteId);
    const type = clean(input.alertType).toUpperCase();
    const keyword = normalizeTrackedKeyword(input.keyword ?? '');
    if (!type && !keyword) {
      throw new BadRequestException(
        'Provide alertType and/or keyword to mute.',
      );
    }
    const rows: Array<any> = [];
    if (type) {
      rows.push(
        await this.prefs.upsert({
          where: {
            organizationId_websiteId_kind_key: {
              organizationId,
              websiteId,
              kind: 'MUTE_TYPE',
              key: type,
            },
          },
          create: {
            organizationId,
            websiteId,
            kind: 'MUTE_TYPE',
            key: type,
            enabled: true,
            mutedUntil: input.mutedUntil
              ? new Date(input.mutedUntil)
              : null,
          },
          update: {
            mutedUntil: input.mutedUntil
              ? new Date(input.mutedUntil)
              : null,
          },
        }),
      );
    }
    if (keyword) {
      rows.push(
        await this.prefs.upsert({
          where: {
            organizationId_websiteId_kind_key: {
              organizationId,
              websiteId,
              kind: 'MUTE_KEYWORD',
              key: keyword,
            },
          },
          create: {
            organizationId,
            websiteId,
            kind: 'MUTE_KEYWORD',
            key: keyword,
            enabled: true,
            mutedUntil: input.mutedUntil
              ? new Date(input.mutedUntil)
              : null,
          },
          update: {
            mutedUntil: input.mutedUntil
              ? new Date(input.mutedUntil)
              : null,
          },
        }),
      );
    }
    return {
      muted: rows.map((r) => ({
        kind: r.kind,
        key: r.key,
        mutedUntil: r.mutedUntil,
      })),
      note: 'Muted — evidence retained, nothing deleted.',
    };
  }

  async unmute(
    organizationId: string,
    websiteId: string,
    input: { alertType?: string; keyword?: string },
  ) {
    await this.verifyWebsite(organizationId, websiteId);
    const type = clean(input.alertType).toUpperCase();
    const keyword = normalizeTrackedKeyword(input.keyword ?? '');
    const deleted = await this.prefs.deleteMany({
      where: {
        organizationId,
        websiteId,
        OR: [
          ...(type
            ? [{ kind: 'MUTE_TYPE', key: type }]
            : []),
          ...(keyword
            ? [{ kind: 'MUTE_KEYWORD', key: keyword }]
            : []),
        ],
      },
    });
    return { unmuted: deleted.count };
  }

  /* ============ resolution (§29/§56) ============ */

  async resolveWhereReversed(
    organizationId: string,
    websiteId: string,
    keywordId?: string,
  ) {
    await this.verifyWebsite(organizationId, websiteId);
    const open = await this.prisma.monitoringAlert.findMany({
      where: {
        organizationId,
        websiteId,
        active: true,
        source: 'RANK',
        status: { in: ['DETECTED', 'ACKNOWLEDGED'] },
        ...(keywordId
          ? {
              deduplicationKey: {
                contains: keywordId,
              },
            }
          : {}),
      },
      orderBy: { detectedAt: 'desc' },
      take: 100,
    });
    let resolved = 0;
    for (const alert of open) {
      const ev = (alert.evidence ?? {}) as Record<
        string,
        unknown
      >;
      const before =
        ev.before !== undefined &&
        ev.before !== 'unobserved'
          ? Number(ev.before)
          : null;
      const after =
        ev.after !== undefined && ev.after !== 'unobserved'
          ? Number(ev.after)
          : null;
      /* Re-read current tracked position when the
       * alert carries a tracked keyword. */
      let current = after;
      const tkId = ev.trackedKeywordId
        ? String(ev.trackedKeywordId)
        : null;
      if (tkId) {
        try {
          const detail =
            await this.rankIntelligence.getTracked(
              organizationId,
              websiteId,
              tkId,
            );
          current = detail.current;
        } catch {
          /* keep stored value */
        }
      }
      const decision = evaluateResolution({
        alertType: String(alert.type) as SearchAlertType,
        previous: before,
        current,
      });
      if (decision.status === 'RESOLVED') {
        await this.monitoring
          .resolveAlert(organizationId, alert.id)
          .catch(() => null);
        resolved++;
      }
    }
    return {
      evaluated: open.length,
      resolved,
      note: 'Resolution only when the condition objectively reverses. ACKNOWLEDGED ≠ RESOLVED.',
    };
  }

  /* ============ observability (§62) + health (§52/§53) ============ */

  async observability(
    organizationId: string,
    websiteId: string,
  ) {
    await this.verifyWebsite(organizationId, websiteId);
    const [latest, lastSuccess, running, failed] =
      await Promise.all([
        this.runs.findFirst({
          where: { organizationId, websiteId },
          orderBy: { createdAt: 'desc' },
        }),
        this.runs.findFirst({
          where: {
            organizationId,
            websiteId,
            status: 'COMPLETED',
          },
          orderBy: { finishedAt: 'desc' },
        }),
        this.runs.count({
          where: {
            organizationId,
            websiteId,
            status: 'RUNNING',
          },
        }),
        this.runs.findMany({
          where: {
            organizationId,
            websiteId,
            status: 'FAILED',
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      ]);
    const recoveries = (failed as Array<any>).filter((r) =>
      String(r.errorSummary ?? '').includes('Stale run'),
    ).length;
    const providerDown = (failed as Array<any>).filter(
      (r) =>
        String(r.errorSummary ?? '').includes(
          'TRACKING_PROVIDER_UNAVAILABLE',
        ),
    ).length;
    const schedules = (await this.schedules.count({
      where: {
        organizationId,
        websiteId,
        isActive: true,
      },
    }).catch(() => 0)) as number;
    const health = changeHealth({
      scheduleCount: schedules,
      providerConfigured: isDataForSeoConfigured(),
      lastRunStatus: ((latest as any)?.status ??
        null) as ChangeRunStatus | null,
      lastSuccessAt: (lastSuccess as any)?.finishedAt
        ? new Date((lastSuccess as any).finishedAt).toISOString()
        : null,
      lastRunAt: (latest as any)?.finishedAt
        ? new Date((latest as any).finishedAt).toISOString()
        : (latest as any)?.createdAt
          ? new Date((latest as any).createdAt).toISOString()
          : null,
      staleAfterHours: STALE_AFTER_HOURS,
    });
    return {
      health,
      ...observabilityShape({
        lastTickAt: (latest as any)?.createdAt
          ? new Date((latest as any).createdAt).toISOString()
          : null,
        lastRunAt: (latest as any)?.finishedAt
          ? new Date((latest as any).finishedAt).toISOString()
          : null,
        lastSuccessfulRunAt: (lastSuccess as any)?.finishedAt
          ? new Date(
              (lastSuccess as any).finishedAt,
            ).toISOString()
          : null,
        currentlyRunning: running,
        recoveries,
        providerUnavailableCount: providerDown,
      }),
    };
  }

  async commandSignals(
    organizationId: string,
    websiteId: string,
  ) {
    /* Max 3 change signals — delegate to the rank
     * command surface (single source of truth). */
    return this.rankIntelligence.commandSignals(
      organizationId,
      websiteId,
    );
  }

  async searchAiDivergence(
    organizationId: string,
    websiteId: string,
    keywordId: string,
  ) {
    const detail = await this.rankIntelligence.getTracked(
      organizationId,
      websiteId,
      keywordId,
    );
    const prev = detail.previous;
    const curr = detail.current;
    const note = searchAiDivergenceNote({
      rankImproved:
        prev !== null && curr !== null
          ? curr < prev
          : null,
      citationLost:
        detail.aiMode === 'AI_NOT_OBSERVED' ||
        detail.aiOverview === 'NOT_OBSERVED'
          ? true
          : null,
    });
    return {
      keyword: detail.trackedKeyword.keyword,
      google: curr,
      aiOverview: detail.aiOverview,
      aiMode: detail.aiMode,
      divergence: detail.divergence,
      note,
    };
  }

  async assertOwnership(
    organizationId: string,
    websiteId: string,
    id: string,
  ): Promise<boolean> {
    const row = await this.schedules.findFirst({
      where: { id, organizationId, websiteId },
      select: { id: true },
    });
    return Boolean(row);
  }

  mapTriggerToAlert(trigger: string): SearchAlertType | null {
    return TRIGGER_TO_ALERT[trigger] ?? null;
  }

  lifecycleNote(status: AlertLifecycle): string {
    switch (status) {
      case 'OPEN':
        return 'Detected, awaiting review.';
      case 'ACKNOWLEDGED':
        return 'Seen by a human — not resolved.';
      case 'RESOLVED':
        return 'Condition objectively reversed.';
      default:
        return 'Dismissed by a human — evidence retained.';
    }
  }

  historyWindows(): number[] {
    return [7, 28, 90];
  }

  staleAfterHours(): number {
    return STALE_AFTER_HOURS;
  }

  rankWindowFor(iso: string): string {
    return rankWindowKey(iso);
  }
}

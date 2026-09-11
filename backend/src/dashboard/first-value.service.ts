import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { GoogleService } from '../google/google.service';
import { SearchBaselineService } from '../keywords/search-baseline.service';
import { TelemetryService } from './telemetry.service';
import { VERIFICATION_CRAWL_STATUSES } from '../crawl/crawl-status';
import {
  acceptanceSummary,
  classifyUnknown,
  continueSetupCopy,
  deliveryTruth as buildDeliveryTruth,
  deriveSteps,
  detectDeadEnd,
  emptyStateCopy,
  firstValueProgress,
  firstValueReady,
  googleConnectionState,
  resumeChecklist,
  shouldRecordDeadEnd,
  selectTtvBounds,
  timeToFirstValueMs,
  unknownRate,
  type FirstValueStep,
  type StepState,
} from './first-value';

/*
 * =========================================================
 * GUIDED FIRST-VALUE SEQUENCER 1.0 (Phase 40).
 *
 * ONE guided first-run flow over EXISTING state —
 * website, crawl, GSC OAuth/property, GA4 (optional),
 * baseline, top-3 existing actions → FIRST_VALUE_READY
 * → Command Center. No new intelligence, no provider
 * calls from onboarding, no fake completion.
 *
 * Skips persist as telemetry events and resurface as
 * CONTINUE SETUP. Dead ends are detected and recorded.
 * =========================================================
 */

const MAX_TOP_ACTIONS = 3;
const STEP_EVENT_KINDS = new Set([
  'ONBOARDING_START',
  'ONBOARDING_STEP',
  'FIRST_VALUE_READY',
]);

/* Phase 41 (Group I): short-lived baseline cache.
 * getBaseline() costs 6 live GSC reads + strategy +
 * links + recs per call, but status() runs on every
 * page mount. Cache per (organization, website) for
 * 60s; explicit refresh bypasses. In-memory per
 * instance (documented), bounded, never cross-tenant
 * (org is part of the key). Failures are NOT cached. */
const BASELINE_CACHE_TTL_MS = 60 * 1000;
const BASELINE_CACHE_MAX_ENTRIES = 500;

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function normStep(value: unknown): FirstValueStep | null {
  const v = clean(value).toUpperCase();
  const valid: FirstValueStep[] = [
    'WEBSITE',
    'CRAWL',
    'GSC_CONNECT',
    'GSC_PROPERTY',
    'GA4_CONNECT',
    'GA4_PROPERTY',
    'BASELINE',
    'TOP_ACTIONS',
  ];
  return (valid as string[]).includes(v)
    ? (v as FirstValueStep)
    : null;
}

@Injectable()
export class FirstValueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleService,
    private readonly baseline: SearchBaselineService,
    private readonly telemetry: TelemetryService,
  ) {}

  private async website(
    organizationId: string,
    websiteId: string,
  ) {
    const site = await this.prisma.website.findFirst({
      where: {
        id: websiteId,
        organizationId,
        isActive: true,
      },
    });
    if (!site) throw new NotFoundException('Website not found');
    return site;
  }

  private async skippedSteps(
    organizationId: string,
    websiteId: string,
  ): Promise<string[]> {
    const events = await this.telemetry.list(
      organizationId,
      websiteId,
      'ONBOARDING_STEP',
      200,
    );
    const skipped = new Set<string>();
    const completed = new Set<string>();
    for (const event of (events ?? []) as Array<any>) {
      const step = normStep(event.step);
      if (!step) continue;
      const status = clean(event.status).toUpperCase();
      if (status === 'SKIPPED') skipped.add(step);
      if (status === 'COMPLETED' || status === 'STARTED') {
        completed.add(step);
      }
    }
    /* A later COMPLETED clears an earlier SKIPPED —
     * evidence wins over history. */
    return [...skipped].filter((s) => !completed.has(s));
  }

  private async crawlStatus(
    organizationId: string,
    websiteId: string,
  ): Promise<string | null> {
    try {
      /* Phase 41 (Group G): latest FULL crawl only —
       * single-page verification rows
       * (COMPLETED_VERIFICATION / FAILED_VERIFICATION)
       * never decide the CRAWL step. Org-scoped via the
       * website relation on top of website() above. */
      const crawl = await this.prisma.crawl.findFirst({
        where: {
          websiteId,
          website: { organizationId },
          status: {
            notIn: [...VERIFICATION_CRAWL_STATUSES],
          },
        },
        orderBy: { createdAt: 'desc' },
        select: { status: true },
      });
      return crawl ? clean((crawl as any).status) : null;
    } catch {
      return null;
    }
  }

  private async googleState(
    organizationId: string,
  ): Promise<{
    gscConnected: boolean;
    gscProperty: boolean;
    ga4Connected: boolean;
    ga4Property: boolean;
  }> {
    try {
      const status = (await this.google.getConnectionStatus(
        organizationId,
      )) as any;
      /* Pure mapping (regression-tested): OAuth alone
       * never marks GA4 complete. */
      return googleConnectionState({
        connected: status?.connected,
        selectedProperty: status?.selectedProperty,
        selectedAnalyticsProperty:
          status?.selectedAnalyticsProperty,
      });
    } catch {
      return {
        gscConnected: false,
        gscProperty: false,
        ga4Connected: false,
        ga4Property: false,
      };
    }
  }

  private readonly baselineCache = new Map<
    string,
    {
      at: number;
      value: { ready: boolean; partial: boolean };
    }
  >();

  private baselineCacheKey(
    organizationId: string,
    websiteId: string,
  ): string {
    return `${organizationId}::${websiteId}`;
  }

  private readBaselineCache(
    organizationId: string,
    websiteId: string,
  ): { ready: boolean; partial: boolean } | null {
    const entry = this.baselineCache.get(
      this.baselineCacheKey(organizationId, websiteId),
    );
    if (!entry) return null;
    if (Date.now() - entry.at > BASELINE_CACHE_TTL_MS) {
      this.baselineCache.delete(
        this.baselineCacheKey(organizationId, websiteId),
      );
      return null;
    }
    return entry.value;
  }

  private writeBaselineCache(
    organizationId: string,
    websiteId: string,
    value: { ready: boolean; partial: boolean },
  ): void {
    if (
      this.baselineCache.size >=
      BASELINE_CACHE_MAX_ENTRIES
    ) {
      const oldest = this.baselineCache.keys().next();
      if (!oldest.done) {
        this.baselineCache.delete(oldest.value);
      }
    }
    this.baselineCache.set(
      this.baselineCacheKey(organizationId, websiteId),
      { at: Date.now(), value },
    );
  }

  private async baselineState(
    organizationId: string,
    websiteId: string,
    gscProperty: boolean,
    fresh = false,
  ): Promise<{ ready: boolean; partial: boolean }> {
    if (!gscProperty) return { ready: false, partial: false };
    if (!fresh) {
      const cached = this.readBaselineCache(
        organizationId,
        websiteId,
      );
      if (cached) return cached;
    }
    try {
      const baseline = (await this.baseline.getBaseline(
        organizationId,
        { websiteId, days: 28 },
      )) as any;
      if (!baseline) return { ready: false, partial: false };
      /* Partial when the baseline itself reports
       * limited coverage; never called complete. */
      const partial = Boolean(
        baseline.partial === true ||
          baseline.limited === true ||
          (Array.isArray(baseline.missing) &&
            baseline.missing.length > 0),
      );
      const result = { ready: true, partial };
      this.writeBaselineCache(
        organizationId,
        websiteId,
        result,
      );
      return result;
    } catch {
      return { ready: false, partial: false };
    }
  }

  private async topActions(
    organizationId: string,
    websiteId: string,
    baselineReady: boolean,
  ): Promise<
    Array<{ id: string; title: string; priority: string }>
  > {
    if (!baselineReady) return [];
    try {
      const recs = await this.prisma.recommendation.findMany(
        {
          where: {
            organizationId,
            websiteId,
            status: { in: ['OPEN', 'IN_PROGRESS'] },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            title: true,
            priority: true,
          },
        },
      );
      const rank: Record<string, number> = {
        HIGH: 0,
        MEDIUM: 1,
        LOW: 2,
      };
      return (recs as Array<any>)
        .sort(
          (a, b) =>
            (rank[clean(a.priority).toUpperCase()] ?? 3) -
            (rank[clean(b.priority).toUpperCase()] ?? 3),
        )
        .slice(0, MAX_TOP_ACTIONS)
        .map((r) => ({
          id: r.id,
          title: r.title,
          priority: clean(r.priority) || 'MEDIUM',
        }));
    } catch {
      return [];
    }
  }

  /* ============ status (the sequencer read) ============ */

  async status(
    organizationId: string,
    websiteId: string,
    opts?: { fresh?: boolean },
  ) {
    const fresh = opts?.fresh === true;
    const site = await this.website(
      organizationId,
      websiteId,
    );
    const [skipped, crawl, google] = await Promise.all([
      this.skippedSteps(organizationId, websiteId),
      this.crawlStatus(organizationId, websiteId),
      this.googleState(organizationId),
    ]);
    const baselineInfo = await this.baselineState(
      organizationId,
      websiteId,
      google.gscProperty,
      fresh,
    );
    const actions = await this.topActions(
      organizationId,
      websiteId,
      baselineInfo.ready,
    );
    /* Evidence wins over history: a skipped step that is
     * now COMPLETED from real state no longer resumes. */
    const completedNow = new Set(
      ['CRAWL', 'GSC_CONNECT', 'GSC_PROPERTY', 'GA4_CONNECT', 'GA4_PROPERTY'].filter(
        (s) => {
          if (s === 'CRAWL') return crawl === 'COMPLETED';
          if (s === 'GSC_CONNECT') return google.gscConnected;
          if (s === 'GSC_PROPERTY') return google.gscProperty;
          if (s === 'GA4_CONNECT') return google.ga4Connected;
          return google.ga4Property;
        },
      ),
    );
    const effectiveSkipped = skipped.filter(
      (s) => !completedNow.has(s),
    );
    const steps = deriveSteps({
      websiteExists: true,
      crawlStatus: crawl,
      gscConnected: google.gscConnected,
      gscPropertySelected: google.gscProperty,
      ga4Connected: google.ga4Connected,
      ga4PropertySelected: google.ga4Property,
      baselineReady: baselineInfo.ready,
      baselinePartial: baselineInfo.partial,
      actionsAvailable: actions.length > 0,
      skipped: effectiveSkipped,
      providerAvailable: true,
    });
    const readiness = firstValueReady({
      websiteExists: true,
      baselineReady: baselineInfo.ready,
      baselinePartial: baselineInfo.partial,
      actionsAvailable: actions.length > 0,
    });
    const progress = firstValueProgress(steps);
    const resume = resumeChecklist(steps);
    const deadEnd = detectDeadEnd(steps);
    if (deadEnd.dead) {
      /* Idempotent: same pattern within 24h is not
       * re-recorded — status() runs on every page
       * load and must not grow the table unboundedly
       * (validated finding, Phase 41). Pure guard
       * below is regression-tested. */
      const recent = await this.telemetry.list(
        organizationId,
        websiteId,
        'DEAD_END',
        5,
      );
      if (
        shouldRecordDeadEnd(
          ((recent ?? []) as Array<any>).map((e) => ({
            status: e.status,
            createdAt: e.createdAt,
          })),
          deadEnd.pattern ?? '',
          Date.now(),
        )
      ) {
        await this.telemetry.record({
          organizationId,
          websiteId,
          kind: 'DEAD_END',
          step: null,
          status: deadEnd.pattern,
          detail: { recovery: deadEnd.recovery },
        });
      }
    }
    return {
      websiteId,
      website: { id: site.id, name: site.name, url: site.url },
      steps,
      progress,
      ready: readiness.ready,
      readyReasons: readiness.reasons,
      resume,
      continueSetup: continueSetupCopy(resume),
      deadEnd,
      baseline: {
        ready: baselineInfo.ready,
        partial: baselineInfo.partial,
        label: baselineInfo.ready
          ? baselineInfo.partial
            ? 'Partial baseline — labeled clearly, never called complete.'
            : 'Search baseline built from real data.'
          : 'Baseline not built yet.',
      },
      topActions: actions,
      noActionAvailable:
        baselineInfo.ready && actions.length === 0
          ? 'NO_ACTION_AVAILABLE — baseline exists but no supported action; missing data dependency is recorded, never invented.'
          : null,
      unknowns: this.unknownsFor(steps),
    };
  }

  private unknownsFor(
    steps: ReturnType<typeof deriveSteps>,
  ): Array<{ step: string; class: string }> {
    const by = new Map(steps.map((s) => [s.step, s.state]));
    const out: Array<{ step: string; class: string }> = [];
    const push = (
      step: string,
      connected: boolean,
      ran: boolean,
      failed: boolean,
    ) => {
      out.push({
        step,
        class: classifyUnknown({
          connected,
          ran,
          failed,
          sampleEnough: true,
        }),
      });
    };
    const crawlState = by.get('CRAWL');
    push(
      'CRAWL',
      true,
      crawlState === 'COMPLETED' || crawlState === 'FAILED',
      crawlState === 'FAILED',
    );
    const gscState = by.get('GSC_CONNECT');
    push(
      'GSC',
      gscState === 'COMPLETED',
      gscState === 'COMPLETED',
      false,
    );
    const baselineState = by.get('BASELINE');
    push(
      'BASELINE',
      by.get('GSC_PROPERTY') === 'COMPLETED',
      baselineState === 'COMPLETED',
      false,
    );
    return out;
  }

  /* ============ events (skip/resume/failure records) ============ */

  async recordEvent(
    organizationId: string,
    websiteId: string,
    input: {
      kind?: string;
      step?: string;
      status?: string;
    },
  ) {
    await this.website(organizationId, websiteId);
    const kind = clean(input.kind).toUpperCase() || 'ONBOARDING_STEP';
    if (
      kind !== 'ONBOARDING_START' &&
      kind !== 'ONBOARDING_STEP' &&
      kind !== 'FIRST_VALUE_READY'
    ) {
      throw new BadRequestException(
        'kind must be ONBOARDING_START, ONBOARDING_STEP, or FIRST_VALUE_READY.',
      );
    }
    const step = input.step ? normStep(input.step) : null;
    if (kind === 'ONBOARDING_STEP' && !step) {
      throw new BadRequestException(
        'step is required for ONBOARDING_STEP events.',
      );
    }
    /* Phase 41 (Group C): ONBOARDING_START is the first
     * meaningful start per website. Repeated mounts /
     * reloads return the existing record instead of
     * inserting duplicates that would distort TTV. */
    if (kind === 'ONBOARDING_START') {
      const existing = await this.telemetry.list(
        organizationId,
        websiteId,
        'ONBOARDING_START',
        1,
      );
      if (
        Array.isArray(existing) &&
        existing.length > 0
      ) {
        return existing[0];
      }
    }
    const status = clean(input.status).toUpperCase();
    const allowed = [
      'STARTED',
      'COMPLETED',
      'FAILED',
      'SKIPPED',
      'RESUMED',
      'BLOCKED',
    ];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `status must be one of ${allowed.join(', ')}.`,
      );
    }
    /* FAILED never records as COMPLETED; SKIPPED never
     * records as COMPLETED — enforced by separate
     * statuses, never converted. */
    return this.telemetry.record({
      organizationId,
      websiteId,
      kind,
      step,
      status,
      detail: {},
    });
  }

  /* ============ acceptance (§24/§25) ============ */

  async acceptance(
    organizationId: string,
    websiteId: string,
  ) {
    const site = await this.website(
      organizationId,
      websiteId,
    );
    /* Phase 41 (Groups C+I): kind-scoped bounded reads
     * instead of one 500-row scan. START/READY need only
     * the earliest valid occurrence (selectTtvBounds);
     * STEP/DEAD_END feeds bounded counters below. */
    const [starts, readies, steps, deadEndRows] =
      await Promise.all([
        this.telemetry.list(
          organizationId,
          websiteId,
          'ONBOARDING_START',
          100,
        ) as Promise<Array<any>>,
        this.telemetry.list(
          organizationId,
          websiteId,
          'FIRST_VALUE_READY',
          20,
        ) as Promise<Array<any>>,
        this.telemetry.list(
          organizationId,
          websiteId,
          'ONBOARDING_STEP',
          200,
        ) as Promise<Array<any>>,
        this.telemetry.list(
          organizationId,
          websiteId,
          'DEAD_END',
          100,
        ) as Promise<Array<any>>,
      ]);
    const bounds = selectTtvBounds(
      [...(starts ?? []), ...(readies ?? [])],
      { organizationId, websiteId },
    );
    /* No valid start recorded — fall back to website
     * creation (documented), never null-invented TTV. */
    const startIso =
      bounds.startIso ??
      new Date(site.createdAt).toISOString();
    const readyIso = bounds.readyIso;
    const count = (rows: Array<any>, statuses: string[]) =>
      rows.filter((e) =>
        statuses.includes(clean(e.status).toUpperCase()),
      ).length;
    const failures = count(steps ?? [], ['FAILED']);
    const blocks = count(steps ?? [], ['BLOCKED']);
    const skips = count(steps ?? [], ['SKIPPED']);
    const resumes = count(steps ?? [], ['RESUMED']);
    const deadEnds = count(deadEndRows ?? [], [
      'GSC_SKIPPED_BASELINE_BLOCKED',
      'CRAWL_FAILED_NO_RETRY',
      'PROPERTY_MISSING_NO_SELECTION_PATH',
    ]);
    const summary = acceptanceSummary({
      startIso,
      readyIso,
      failures,
      blocks,
      skips,
      resumes,
      deadEnds,
    });
    /* Day-1/7 UNKNOWN rate over first-value step
     * unknowns (bounded sample from current status). */
    const current = await this.status(
      organizationId,
      websiteId,
    );
    const unknownStates = current.unknowns.filter(
      (u) =>
        u.class === 'DATA_NOT_CONNECTED' ||
        u.class === 'DATA_NOT_RUN' ||
        u.class === 'SYSTEM_FAILURE',
    ).length;
    const dayRate = unknownRate(
      unknownStates,
      current.unknowns.length,
    );
    return {
      websiteId,
      ...summary,
      unknownRate: dayRate,
      ready: current.ready,
      deadEndsDetected: deadEnds,
      note: 'Derived from recorded events + current state. No PII collected.',
    };
  }

  /* ============ provider usage (§22) ============ */

  async providerUsage(
    organizationId: string,
    userId: string,
  ) {
    /* Phase 41 (P3-9): aggregate provider metering is
     * cross-tenant operational data — organization
     * owners/admins only. Never trusts the JWT role
     * claim; reads membership fresh per call. */
    const membership =
      await this.prisma.organizationMember
        .findUnique({
          where: {
            userId_organizationId: {
              userId,
              organizationId,
            },
          },
          select: { role: true },
        })
        .catch(() => null);
    if (
      !membership ||
      (membership.role !== 'OWNER' &&
        membership.role !== 'ADMIN')
    ) {
      throw new ForbiddenException(
        'Provider usage is restricted to organization owners and admins.',
      );
    }
    return this.telemetry.providerSummary();
  }

  /* ============ delivery truth (§16) ============ */

  deliveryTruth() {
    return buildDeliveryTruth();
  }

  emptyCopy(
    surface:
      | 'KEYWORDS'
      | 'BASELINE'
      | 'RANK'
      | 'AI'
      | 'REVENUE'
      | 'COMMAND_CENTER',
  ) {
    return emptyStateCopy({
      surface,
      connected: false,
      ran: false,
    });
  }
}

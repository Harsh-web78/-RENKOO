/*
 * =========================================================
 * FIRST-VALUE & ONE-PRODUCT CONSOLIDATION 1.0 — pure
 * functions (Phase 40).
 *
 * One guided first-run flow over EXISTING state:
 * WEBSITE → CRAWL → GSC → PROPERTY → GA4 → PROPERTY →
 * BASELINE → TOP 3 ACTIONS → FIRST_VALUE_READY →
 * COMMAND CENTER.
 *
 * Non-negotiable:
 * - No new intelligence, scores, forecasts, agents.
 * - Step states: NOT_STARTED / IN_PROGRESS / COMPLETED
 *   / FAILED / BLOCKED / SKIPPED / UNAVAILABLE. FAILED
 *   never becomes COMPLETED; SKIPPED never becomes
 *   COMPLETED without evidence.
 * - Progress is completed-required/total-required —
 *   never a fake percentage.
 * - FIRST_VALUE_READY means data readiness (website +
 *   baseline inputs + meaningful baseline + ≥1
 *   action), never screen completion.
 * - GA4 optional; GSC primary. Skips persist and
 *   resurface as CONTINUE SETUP, never "complete".
 * - Unknowns classified: HONEST_UNKNOWN /
 *   DATA_NOT_CONNECTED / DATA_NOT_RUN /
 *   SYSTEM_FAILURE / INSUFFICIENT_DATA.
 * - Paid-tier truth: IMPLEMENTED / PARTIAL /
 *   UNAVAILABLE; runtime truth wins over marketing.
 * - Provider cost: vendor-reported or COST_UNKNOWN —
 *   never fabricated.
 * =========================================================
 */

export type FirstValueStep =
  | 'WEBSITE'
  | 'CRAWL'
  | 'GSC_CONNECT'
  | 'GSC_PROPERTY'
  | 'GA4_CONNECT'
  | 'GA4_PROPERTY'
  | 'BASELINE'
  | 'TOP_ACTIONS';

export type StepState =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'BLOCKED'
  | 'SKIPPED'
  | 'UNAVAILABLE';

export type UnknownClass =
  | 'HONEST_UNKNOWN'
  | 'DATA_NOT_CONNECTED'
  | 'DATA_NOT_RUN'
  | 'SYSTEM_FAILURE'
  | 'INSUFFICIENT_DATA';

export type DeliveryTruth =
  | 'IMPLEMENTED'
  | 'PARTIALLY_IMPLEMENTED'
  | 'UNAVAILABLE';

export const FIRST_VALUE_STEPS: FirstValueStep[] = [
  'WEBSITE',
  'CRAWL',
  'GSC_CONNECT',
  'GSC_PROPERTY',
  'GA4_CONNECT',
  'GA4_PROPERTY',
  'BASELINE',
  'TOP_ACTIONS',
];

/* GA4 steps are optional in the existing architecture;
 * everything else is required for first value. */
const REQUIRED_STEPS: FirstValueStep[] = [
  'WEBSITE',
  'CRAWL',
  'GSC_CONNECT',
  'GSC_PROPERTY',
  'BASELINE',
  'TOP_ACTIONS',
];

export interface StepInput {
  websiteExists: boolean;
  crawlStatus: string | null;
  gscConnected: boolean;
  gscPropertySelected: boolean;
  ga4Connected: boolean;
  ga4PropertySelected: boolean;
  baselineReady: boolean;
  baselinePartial: boolean;
  actionsAvailable: boolean;
  skipped: string[];
  providerAvailable: boolean;
}

export interface StepResult {
  step: FirstValueStep;
  state: StepState;
  required: boolean;
  why: string;
  next: string | null;
}

/* ---------- step derivation (evidence only) ---------- */

export function deriveSteps(
  input: StepInput,
): StepResult[] {
  const skipped = new Set(
    (input.skipped ?? []).map((s) =>
      String(s ?? '').trim().toUpperCase(),
    ),
  );
  const crawl = String(input.crawlStatus ?? '')
    .trim()
    .toUpperCase();
  const isSkipped = (s: FirstValueStep) => skipped.has(s);
  const results: StepResult[] = [
    {
      step: 'WEBSITE',
      state: input.websiteExists ? 'COMPLETED' : 'NOT_STARTED',
      required: true,
      why: input.websiteExists
        ? 'Website record exists.'
        : 'No website yet — create one to begin.',
      next: input.websiteExists ? null : 'Create website',
    },
    {
      step: 'CRAWL',
      state: !input.websiteExists
        ? 'BLOCKED'
        : crawl === 'COMPLETED'
          ? 'COMPLETED'
          : crawl === 'FAILED'
            ? 'FAILED'
            : crawl === 'RUNNING' || crawl === 'IN_PROGRESS'
              ? 'IN_PROGRESS'
              : isSkipped('CRAWL')
                ? 'SKIPPED'
                : 'NOT_STARTED',
      required: true,
      why: !input.websiteExists
        ? 'Blocked: website first.'
        : crawl === 'COMPLETED'
          ? 'Crawl completed.'
          : crawl === 'FAILED'
            ? 'Crawl failed — actual failure shown, retry available.'
            : crawl === 'RUNNING' || crawl === 'IN_PROGRESS'
              ? 'Crawl running.'
              : 'Crawl not started.',
      next: crawl === 'COMPLETED' ? null : 'Run crawl',
    },
    {
      step: 'GSC_CONNECT',
      state: input.gscConnected
        ? 'COMPLETED'
        : !input.websiteExists
          ? 'BLOCKED'
          : isSkipped('GSC_CONNECT')
            ? 'SKIPPED'
            : 'NOT_STARTED',
      required: true,
      why: input.gscConnected
        ? 'Google connection active.'
        : 'Primary search-data connection.',
      next: input.gscConnected ? null : 'Connect Google',
    },
    {
      step: 'GSC_PROPERTY',
      state: input.gscPropertySelected
        ? 'COMPLETED'
        : !input.gscConnected
          ? 'BLOCKED'
          : isSkipped('GSC_PROPERTY')
            ? 'SKIPPED'
            : 'NOT_STARTED',
      required: true,
      why: input.gscPropertySelected
        ? 'Search Console property selected.'
        : input.gscConnected
          ? 'Connected, but no property selected.'
          : 'Blocked: connect Google first.',
      next: input.gscPropertySelected ? null : 'Select property',
    },
    {
      step: 'GA4_CONNECT',
      state: input.ga4Connected
        ? 'COMPLETED'
        : !input.websiteExists
          ? 'BLOCKED'
          : isSkipped('GA4_CONNECT')
            ? 'SKIPPED'
            : 'NOT_STARTED',
      required: false,
      why: input.ga4Connected
        ? 'Analytics connection active.'
        : 'Optional — search baseline can already be meaningful without it.',
      next: input.ga4Connected ? null : 'Connect GA4 (optional)',
    },
    {
      step: 'GA4_PROPERTY',
      state: input.ga4PropertySelected
        ? 'COMPLETED'
        : !input.ga4Connected
          ? 'BLOCKED'
          : isSkipped('GA4_PROPERTY')
            ? 'SKIPPED'
            : 'NOT_STARTED',
      required: false,
      why: input.ga4PropertySelected
        ? 'Analytics property selected.'
        : input.ga4Connected
          ? 'Connected, but no property selected.'
          : 'Blocked: connect analytics first.',
      next: input.ga4PropertySelected ? null : 'Select property',
    },
    {
      step: 'BASELINE',
      state:
        input.baselineReady && !input.baselinePartial
          ? 'COMPLETED'
          : input.baselineReady && input.baselinePartial
            ? 'COMPLETED'
            : !input.gscPropertySelected
              ? 'BLOCKED'
              : !input.providerAvailable
                ? 'UNAVAILABLE'
                : 'NOT_STARTED',
      required: true,
      why:
        input.baselineReady && !input.baselinePartial
          ? 'Search baseline built from real data.'
          : input.baselineReady && input.baselinePartial
            ? 'Partial baseline — labeled clearly, never called complete.'
            : !input.gscPropertySelected
              ? 'Blocked: GSC property required for search evidence.'
              : 'Baseline not built yet.',
      next:
        input.baselineReady ? null : 'Build baseline',
    },
    {
      step: 'TOP_ACTIONS',
      state: input.actionsAvailable
        ? 'COMPLETED'
        : input.baselineReady
          ? 'NOT_STARTED'
          : 'BLOCKED',
      required: true,
      why: input.actionsAvailable
        ? 'Top existing actions surfaced.'
        : input.baselineReady
          ? 'Baseline ready; actions not yet surfaced.'
          : 'Blocked: baseline first.',
      next: input.actionsAvailable ? null : 'Surface actions',
    },
  ];
  return results;
}

/* ---------- FIRST_VALUE_READY (§3/§10) ---------- */

export interface FirstValueReady {
  ready: boolean;
  reasons: string[];
}

export function firstValueReady(input: {
  websiteExists: boolean;
  baselineReady: boolean;
  baselinePartial: boolean;
  actionsAvailable: boolean;
}): FirstValueReady {
  const reasons: string[] = [];
  if (!input.websiteExists) reasons.push('website missing');
  if (!input.baselineReady) reasons.push('baseline missing');
  if (!input.actionsAvailable) {
    reasons.push('no supported action');
  }
  return {
    ready:
      input.websiteExists &&
      input.baselineReady &&
      input.actionsAvailable,
    reasons,
  };
}

/* ---------- progress (§4, no fake %) ---------- */

export function firstValueProgress(
  steps: StepResult[],
): {
  completedRequired: number;
  totalRequired: number;
  label: string;
} {
  const required = steps.filter((s) => s.required);
  const done = required.filter(
    (s) => s.state === 'COMPLETED',
  ).length;
  return {
    completedRequired: done,
    totalRequired: required.length,
    label: `${done} of ${required.length} required steps complete`,
  };
}

/* ---------- resume checklist (§5/§6) ---------- */

export interface ResumeItem {
  step: FirstValueStep;
  state: StepState;
  label: string;
  action: string;
}

export function resumeChecklist(
  steps: StepResult[],
): ResumeItem[] {
  return steps
    .filter(
      (s) =>
        s.required &&
        s.state !== 'COMPLETED' &&
        (s.state === 'SKIPPED' ||
          s.state === 'NOT_STARTED' ||
          s.state === 'FAILED' ||
          s.state === 'BLOCKED'),
    )
    .map((s) => ({
      step: s.step,
      state: s.state,
      label:
        s.state === 'SKIPPED'
          ? `${prettyStep(s.step)} — skipped`
          : s.state === 'FAILED'
            ? `${prettyStep(s.step)} — failed, retry available`
            : s.state === 'BLOCKED'
              ? `${prettyStep(s.step)} — blocked`
              : prettyStep(s.step),
      action: s.next ?? 'Continue setup',
    }));
}

function prettyStep(step: FirstValueStep): string {
  switch (step) {
    case 'WEBSITE':
      return 'Website';
    case 'CRAWL':
      return 'Crawl';
    case 'GSC_CONNECT':
      return 'Connect GSC';
    case 'GSC_PROPERTY':
      return 'Select property';
    case 'GA4_CONNECT':
      return 'Connect GA4';
    case 'GA4_PROPERTY':
      return 'Select GA4 property';
    case 'BASELINE':
      return 'Baseline';
    default:
      return 'Top actions';
  }
}

export function continueSetupCopy(
  resume: ResumeItem[],
): string | null {
  if (resume.length === 0) return null;
  const first = resume[0];
  const nouns: Record<FirstValueStep, string> = {
    WEBSITE: 'a website',
    CRAWL: 'a completed crawl',
    GSC_CONNECT: 'Google Search Console to unlock search baseline',
    GSC_PROPERTY: 'a Search Console property',
    GA4_CONNECT: 'Google Analytics',
    GA4_PROPERTY: 'an Analytics property',
    BASELINE: 'your search baseline',
    TOP_ACTIONS: 'your first actions',
  };
  return `CONTINUE SETUP — connect ${nouns[first.step]}. Never “setup complete” while required setup remains.`;
}

/* ---------- error states (§7) ---------- */

export function isTerminalState(state: StepState): boolean {
  return state === 'COMPLETED' || state === 'FAILED';
}

/* ---------- dead-end detection (§26) ---------- */

export interface DeadEnd {
  dead: boolean;
  pattern: string | null;
  recovery: string | null;
}

export function detectDeadEnd(
  steps: StepResult[],
): DeadEnd {
  const by = new Map(steps.map((s) => [s.step, s.state]));
  const skippedGsc =
    by.get('GSC_CONNECT') === 'SKIPPED' ||
    by.get('GSC_PROPERTY') === 'SKIPPED';
  const baselineBlocked =
    by.get('BASELINE') === 'BLOCKED' && skippedGsc;
  if (skippedGsc && baselineBlocked) {
    return {
      dead: true,
      pattern: 'GSC_SKIPPED_BASELINE_BLOCKED',
      recovery:
        'CONTINUE SETUP — connect Google Search Console and select a property to unblock the baseline.',
    };
  }
  if (by.get('CRAWL') === 'FAILED') {
    const retried = false;
    if (!retried) {
      return {
        dead: true,
        pattern: 'CRAWL_FAILED_NO_RETRY',
        recovery:
          'Crawl failed — retry the crawl from technical SEO. Failure shown honestly, never as progress.',
      };
    }
  }
  if (
    by.get('GSC_CONNECT') === 'COMPLETED' &&
    by.get('GSC_PROPERTY') !== 'COMPLETED'
  ) {
    return {
      dead: true,
      pattern: 'PROPERTY_MISSING_NO_SELECTION_PATH',
      recovery:
        'Connected but no property selected — open property selection to continue.',
    };
  }
  return { dead: false, pattern: null, recovery: null };
}

/* ---------- connection-state mapping (§8/§9) ----------
 * Pure regression hook for the Phase 41 P2: Google
 * OAuth authentication must NOT imply GA4 property
 * connection. GA4 steps complete only on an actual
 * selected Analytics property; GSC state never
 * satisfies GA4. Skip/resume and UNKNOWN semantics
 * are preserved by callers. */

export interface ConnectionFlags {
  gscConnected: boolean;
  gscProperty: boolean;
  ga4Connected: boolean;
  ga4Property: boolean;
}

export function googleConnectionState(
  status: {
    connected?: unknown;
    selectedProperty?: unknown;
    selectedAnalyticsProperty?: unknown;
  } | null,
): ConnectionFlags {
  const none = {
    gscConnected: false,
    gscProperty: false,
    ga4Connected: false,
    ga4Property: false,
  };
  if (!status) return none;
  const gscConnected = Boolean(status.connected);
  const gscProperty =
    String(status.selectedProperty ?? '').trim().length > 0;
  const ga4Property =
    String(status.selectedAnalyticsProperty ?? '').trim().length >
    0;
  return {
    gscConnected,
    gscProperty,
    ga4Connected: ga4Property,
    ga4Property,
  };
}

/* ---------- dead-end record guard (§26) ----------
 * Pure regression hook for the Phase 41 P2: repeated
 * status polling must not create duplicate equivalent
 * dead-end records. Same pattern recorded within the
 * window suppresses re-recording; anything else (new
 * pattern, expired window, unreadable timestamps)
 * records normally so no useful telemetry is lost. */

export function shouldRecordDeadEnd(
  recent: Array<{
    status?: unknown;
    createdAt?: unknown;
  }>,
  pattern: string,
  nowMs: number,
  windowMs = 24 * 60 * 60 * 1000,
): boolean {
  const want = String(pattern ?? '').trim();
  if (!want) return false;
  if (!Number.isFinite(nowMs)) return true;
  for (const event of recent ?? []) {
    if (String(event?.status ?? '').trim() !== want) continue;
    const at = new Date(String(event?.createdAt ?? '')).getTime();
    if (!Number.isFinite(at)) continue;
    if (nowMs - at < windowMs) return false;
  }
  return true;
}

/* ---------- UNKNOWN classification (§25) ---------- */

export function classifyUnknown(input: {
  connected: boolean;
  ran: boolean;
  failed: boolean;
  sampleEnough: boolean;
}): 'HONEST_UNKNOWN' | 'DATA_NOT_CONNECTED' | 'DATA_NOT_RUN' | 'SYSTEM_FAILURE' | 'INSUFFICIENT_DATA' {
  if (input.failed) return 'SYSTEM_FAILURE';
  if (!input.connected) return 'DATA_NOT_CONNECTED';
  if (!input.ran) return 'DATA_NOT_RUN';
  if (!input.sampleEnough) return 'INSUFFICIENT_DATA';
  return 'HONEST_UNKNOWN';
}

export function unknownRate(
  unknowns: number,
  total: number,
): { value: number | null; label: string } {
  if (!Number.isFinite(total) || total < 10) {
    return {
      value: null,
      label: 'INSUFFICIENT_DATA — no percentage for zero/insufficient sample.',
    };
  }
  return {
    value: Math.round((unknowns / total) * 1000) / 10,
    label: `${Math.round((unknowns / total) * 1000) / 10}% unknown across ${total} observed states.`,
  };
}

/* ---------- paid-tier delivery truth (§16/§21) ---------- */

export function deliveryTruth(): {
  whiteLabel: DeliveryTruth;
  scheduledReports: DeliveryTruth;
  pdfExport: DeliveryTruth;
  apiAccess: DeliveryTruth;
  agencyReporting: DeliveryTruth;
  note: string;
} {
  return {
    /* Runtime truth wins over entitlement flags:
     * whiteLabel is one agencyName string; scheduled
     * delivery answers supported:false; server PDF
     * rendering does not exist (print/CSV/share
     * instead); no public API product exists; agency
     * reporting (clients + report sections) exists. */
    whiteLabel: 'UNAVAILABLE',
    scheduledReports: 'UNAVAILABLE',
    pdfExport: 'UNAVAILABLE',
    apiAccess: 'UNAVAILABLE',
    agencyReporting: 'IMPLEMENTED',
    note: 'Runtime truth wins: only agency client/report sections are implemented. Everything else is COMING / NOT AVAILABLE until built — never marketed as available.',
  };
}

export function deliveryLabel(truth: DeliveryTruth): string {
  switch (truth) {
    case 'IMPLEMENTED':
      return 'Available';
    case 'PARTIALLY_IMPLEMENTED':
      return 'Partially available';
    default:
      return 'Coming soon';
  }
}

/* ---------- provider cost (§22, never fabricated) ---------- */

export interface ProviderCost {
  provider: string;
  operation: string;
  taskCount: number;
  success: boolean;
  vendorCost: number | null;
  label: string;
}

export function providerCost(input: {
  provider: string;
  operation: string;
  taskCount: number;
  success: boolean;
  vendorCost: unknown;
}): ProviderCost {
  const cost =
    input.vendorCost === null || input.vendorCost === undefined
      ? NaN
      : Number(input.vendorCost);
  const known = Number.isFinite(cost);
  return {
    provider: String(input.provider ?? '').toUpperCase() || 'UNKNOWN',
    operation: String(input.operation ?? ''),
    taskCount: Math.max(0, Math.floor(Number(input.taskCount) || 0)),
    success: input.success,
    vendorCost: known ? cost : null,
    label: known
      ? `Vendor-reported cost ${cost} for ${input.operation}.`
      : 'COST_UNKNOWN — vendor pricing not in repository/config; never estimated.',
  };
}

/* ---------- acceptance derivations (§24) ---------- */

/*
 * TTV event bounds (Phase 41, Group C).
 *
 * ONBOARDING_START represents the FIRST meaningful start
 * for a website: repeated mounts, reloads, and later
 * sessions never move it. FIRST_VALUE_READY likewise
 * resolves to the earliest valid occurrence. Malformed
 * timestamps are skipped (never crash, never invent).
 * Optional scope filtering keeps cross-website/org rows
 * out even if a caller passes an unscoped list.
 */
export interface TtvEvent {
  kind?: unknown;
  createdAt?: unknown;
  organizationId?: unknown;
  websiteId?: unknown;
}

function validEventIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const time = new Date(value as string).getTime();
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString();
}

export function selectTtvBounds(
  events: TtvEvent[] | null | undefined,
  scope?: {
    organizationId?: string;
    websiteId?: string;
  },
): {
  startIso: string | null;
  readyIso: string | null;
} {
  let startIso: string | null = null;
  let readyIso: string | null = null;
  for (const event of events ?? []) {
    if (!event || typeof event !== 'object') continue;
    if (
      scope?.organizationId !== undefined &&
      String(event.organizationId ?? '') !== scope.organizationId
    ) {
      continue;
    }
    if (
      scope?.websiteId !== undefined &&
      String(event.websiteId ?? '') !== scope.websiteId
    ) {
      continue;
    }
    const kind = String(event.kind ?? '')
      .trim()
      .toUpperCase();
    const at = validEventIso(event.createdAt);
    if (!at) continue;
    if (
      kind === 'ONBOARDING_START' &&
      (startIso === null || at < startIso)
    ) {
      startIso = at;
    }
    if (
      kind === 'FIRST_VALUE_READY' &&
      (readyIso === null || at < readyIso)
    ) {
      readyIso = at;
    }
  }
  return { startIso, readyIso };
}

export function timeToFirstValueMs(input: {
  startIso: string | null;
  readyIso: string | null;
}): number | null {
  if (!input.startIso || !input.readyIso) return null;
  const start = new Date(input.startIso).getTime();
  const ready = new Date(input.readyIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(ready)) {
    return null;
  }
  if (ready < start) return null;
  return ready - start;
}

export function acceptanceSummary(input: {
  startIso: string | null;
  readyIso: string | null;
  failures: number;
  blocks: number;
  skips: number;
  resumes: number;
  deadEnds: number;
}): {
  timeToFirstValueMs: number | null;
  timeToFirstValueLabel: string;
  failures: number;
  blocks: number;
  skips: number;
  resumes: number;
  deadEnds: number;
} {
  const ms = timeToFirstValueMs({
    startIso: input.startIso,
    readyIso: input.readyIso,
  });
  return {
    timeToFirstValueMs: ms,
    timeToFirstValueLabel:
      ms === null
        ? 'FIRST_VALUE_READY not yet reached — no duration invented.'
        : `First value in ${Math.round(ms / 1000)}s of recorded onboarding time.`,
    failures: input.failures,
    blocks: input.blocks,
    skips: input.skips,
    resumes: input.resumes,
    deadEnds: input.deadEnds,
  };
}

/* ---------- empty-state copy (§27) ---------- */

export function emptyStateCopy(input: {
  surface: 'KEYWORDS' | 'BASELINE' | 'RANK' | 'AI' | 'REVENUE' | 'COMMAND_CENTER';
  connected: boolean;
  ran: boolean;
}): {
  title: string;
  why: string;
  required: string;
  next: string;
} {
  switch (input.surface) {
    case 'KEYWORDS':
      return {
        title: 'No search data yet.',
        why: input.connected
          ? 'Connected, but no queries observed for this website yet.'
          : 'Search Console is not connected, so RENKOO has no query evidence.',
        required: 'Google Search Console connection + selected property.',
        next: 'Connect GSC',
      };
    case 'BASELINE':
      return {
        title: 'No search baseline yet.',
        why: input.connected
          ? 'Connected, but baseline has not been built.'
          : 'Search baseline needs Search Console evidence.',
        required: 'Google Search Console connection + selected property.',
        next: 'Connect GSC',
      };
    case 'RANK':
      return {
        title: 'No rank observations yet.',
        why: 'Rank tracking needs tracked keywords and a provider run.',
        required: 'Tracked keywords + DataForSEO availability.',
        next: 'Add keywords',
      };
    case 'AI':
      return {
        title: 'No AI visibility yet.',
        why: input.ran
          ? 'Monitoring ran without observations.'
          : 'AI monitoring has not run for this website.',
        required: 'Tracked prompts + monitoring run.',
        next: 'Run monitoring',
      };
    case 'REVENUE':
      return {
        title: 'No revenue evidence yet.',
        why: 'No recorded leads or revenue for this website.',
        required: 'Recorded leads/revenue or a connected source.',
        next: 'Record outcomes',
      };
    default:
      return {
        title: 'Setup required.',
        why: 'First value is not ready — required setup remains.',
        required: 'Complete CONTINUE SETUP.',
        next: 'Continue setup',
      };
  }
}

/*
 * =========================================================
 * SEARCH-TO-REVENUE + AI ROI 1.0 — pure functions
 * (Phase 13).
 *
 * Evidence-first composition over EXISTING records:
 * GSC demand, rank observations, pages, leads, revenue,
 * spend, AI mention/citation checks, actions.
 *
 * Hard rules encoded here:
 * - UNAVAILABLE is null, never zero. OBSERVED is never
 *   upgraded to VERIFIED. INFERRED is never VERIFIED.
 * - Correlation is never causation: every movement
 *   sentence uses "observed after", never "caused".
 * - AI citation is not traffic; traffic is not a lead;
 *   a lead is not revenue; ranking is not revenue.
 * - CPC is not acquisition cost. SEO cost is never
 *   assumed zero — missing cost makes ROI UNAVAILABLE.
 * - Revenue is never allocated proportionally to fill
 *   a chart. Only recorded relationships are shown.
 * =========================================================
 */

export type OutcomeEvidenceState =
  | 'VERIFIED'
  | 'OBSERVED'
  | 'INFERRED'
  | 'ESTIMATED'
  | 'UNAVAILABLE';

export type AttributionLevel =
  | 'DIRECT'
  | 'CONNECTED'
  | 'INFERRED'
  | 'UNAVAILABLE';

/* Sources that explicitly connect an outcome to
 * organic search. Matched case-insensitively against
 * source + sourceDetail. */
const SEARCH_SOURCES = [
  'ORGANIC_SEARCH',
  'ORGANIC',
  'SEO',
  'GOOGLE',
  'SEARCH CONSOLE',
  'GSC',
  'SEARCH',
];

function textOf(value: unknown): string {
  return String(value ?? '').trim();
}

function upperOf(value: unknown): string {
  return textOf(value).toUpperCase();
}

function mentionsSearch(...values: unknown[]): boolean {
  const joined = ` ${values.map(upperOf).join(' ')} `;
  return SEARCH_SOURCES.some((source) =>
    joined.includes(source),
  );
}

export function normalizeOutcomeUrl(
  value: unknown,
): string | null {
  let raw = textOf(value).toLowerCase();
  if (!raw) return null;
  raw = raw.split('?')[0].split('#')[0];
  raw = raw.replace(/^https?:\/\//, '');
  raw = raw.replace(/^www\./, '');
  raw = raw.replace(/\/+$/, '');
  return raw || null;
}

export function sameOutcomePage(
  a: unknown,
  b: unknown,
): boolean {
  const left = normalizeOutcomeUrl(a);
  const right = normalizeOutcomeUrl(b);
  return !!left && left === right;
}

/* ---------- lead attribution ----------
 * DIRECT: source explicitly ties the lead to search.
 * CONNECTED: lead lands on a known page but keyword
 *   causality is unproven.
 * INFERRED: only a keyword hint exists (suggested,
 *   not observed).
 * UNAVAILABLE: no defensible connection. */

export function classifyLeadAttribution(input: {
  source?: unknown;
  sourceDetail?: unknown;
  landingPage?: unknown;
  keyword?: unknown;
}): AttributionLevel {
  if (
    mentionsSearch(input.source, input.sourceDetail)
  ) {
    return 'DIRECT';
  }
  if (textOf(input.landingPage)) {
    return 'CONNECTED';
  }
  if (textOf(input.keyword)) {
    return 'INFERRED';
  }
  return 'UNAVAILABLE';
}

/* ---------- revenue attribution ----------
 * Follows the recorded lead link first (never
 * proportional allocation), then explicit source,
 * else UNAVAILABLE. */

export function classifyRevenueAttribution(input: {
  leadId?: unknown;
  leadAttribution?: AttributionLevel | null;
  source?: unknown;
  sourceDetail?: unknown;
}): AttributionLevel {
  if (textOf(input.leadId)) {
    /* Recorded lead relationship — inherit the lead's
     * level, capped at CONNECTED unless the money
     * itself names search. */
    if (
      mentionsSearch(input.source, input.sourceDetail)
    ) {
      return 'DIRECT';
    }
    if (input.leadAttribution === 'DIRECT') {
      return 'CONNECTED';
    }
    return input.leadAttribution ?? 'CONNECTED';
  }
  if (
    mentionsSearch(input.source, input.sourceDetail)
  ) {
    return 'DIRECT';
  }
  return 'UNAVAILABLE';
}

export function attributionStatement(
  level: AttributionLevel,
  subject: string,
): string {
  switch (level) {
    case 'DIRECT':
      return `${subject} is directly connected to organic search by a recorded source.`;
    case 'CONNECTED':
      return `${subject} is linked to a known landing page, but keyword causality is not proven.`;
    case 'INFERRED':
      return `${subject} has an analytically suggested search relationship — not directly observed.`;
    case 'UNAVAILABLE':
    default:
      return `${subject} has no defensible search connection — unavailable, not zero.`;
  }
}

/* ---------- funnel ----------
 * Every stage is { value|null, window, evidenceState }.
 * Missing is null + UNAVAILABLE — never 0. */

export interface FunnelStage {
  stage: string;
  value: number | null;
  window: string;
  evidenceState: OutcomeEvidenceState;
}

export function funnelStage(
  stage: string,
  value: number | null,
  window: string,
  evidenceState: OutcomeEvidenceState,
): FunnelStage {
  const safe =
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0
      ? value
      : null;
  return {
    stage,
    value: safe,
    window,
    evidenceState:
      safe === null ? 'UNAVAILABLE' : evidenceState,
  };
}

/* ---------- qualification ---------- */

export type LeadTier =
  | 'LEAD'
  | 'QUALIFIED'
  | 'CUSTOMER';

export function classifyLeadTier(input: {
  status?: unknown;
  converted?: unknown;
  hasRevenue?: boolean;
}): LeadTier {
  if (
    input.converted === true ||
    upperOf(input.status) === 'CONVERTED' ||
    input.hasRevenue === true
  ) {
    return 'CUSTOMER';
  }
  if (upperOf(input.status) === 'QUALIFIED') {
    return 'QUALIFIED';
  }
  return 'LEAD';
}

/* ---------- zero-click / diagnostic states ----------
 * Descriptive states, never scores. Thresholds are
 * fixed and documented: visibility means ≥500
 * impressions (GSC VERIFIED); low traffic means CTR
 * below 1% with that visibility. */

export type ZeroClickState =
  | 'HIGH_SEARCH_VISIBILITY_LOW_TRAFFIC'
  | 'HIGH_AI_VISIBILITY_NO_OBSERVED_TRAFFIC'
  | 'HIGH_CITATION_NO_OBSERVED_LEAD'
  | 'HIGH_TRAFFIC_LOW_LEAD'
  | 'HIGH_LEAD_LOW_REVENUE_EVIDENCE'
  | 'INSUFFICIENT_EVIDENCE';

export function zeroClickState(input: {
  impressions: number | null;
  clicks: number | null;
  aiCitations: number | null;
  aiTraffic: number | null;
  leads: number | null;
  revenue: number | null;
}): ZeroClickState {
  const {
    impressions,
    clicks,
    aiCitations,
    aiTraffic,
    leads,
    revenue,
  } = input;
  const visible =
    impressions !== null && impressions >= 500;
  const noClicks =
    clicks === null ||
    clicks === 0 ||
    (visible &&
      impressions !== null &&
      impressions > 0 &&
      clicks / impressions < 0.01);
  if (visible && noClicks) {
    return 'HIGH_SEARCH_VISIBILITY_LOW_TRAFFIC';
  }
  if (
    aiCitations !== null &&
    aiCitations > 0 &&
    (aiTraffic === null || aiTraffic === 0)
  ) {
    return 'HIGH_AI_VISIBILITY_NO_OBSERVED_TRAFFIC';
  }
  if (
    aiCitations !== null &&
    aiCitations > 0 &&
    (leads === null || leads === 0)
  ) {
    return 'HIGH_CITATION_NO_OBSERVED_LEAD';
  }
  if (
    clicks !== null &&
    clicks > 0 &&
    (leads === null || leads === 0)
  ) {
    return 'HIGH_TRAFFIC_LOW_LEAD';
  }
  if (
    leads !== null &&
    leads > 0 &&
    (revenue === null || revenue === 0)
  ) {
    return 'HIGH_LEAD_LOW_REVENUE_EVIDENCE';
  }
  return 'INSUFFICIENT_EVIDENCE';
}

export function zeroClickStatement(
  state: ZeroClickState,
): string {
  switch (state) {
    case 'HIGH_SEARCH_VISIBILITY_LOW_TRAFFIC':
      return 'High search visibility with low observed traffic — possible zero-click or SERP-feature capture.';
    case 'HIGH_AI_VISIBILITY_NO_OBSERVED_TRAFFIC':
      return 'AI citation observed, but AI referral traffic is unavailable.';
    case 'HIGH_CITATION_NO_OBSERVED_LEAD':
      return 'AI citations observed with no observed lead connection.';
    case 'HIGH_TRAFFIC_LOW_LEAD':
      return 'Organic clicks observed with no observed lead attribution.';
    case 'HIGH_LEAD_LOW_REVENUE_EVIDENCE':
      return 'Leads observed with no connected revenue evidence.';
    case 'INSUFFICIENT_EVIDENCE':
    default:
      return 'Insufficient evidence for a visibility diagnostic.';
  }
}

/* ---------- commercial relevance ----------
 * Qualitative only. CPC informs relevance, never a
 * cost claim: CPC is not acquisition cost. */

export type CommercialRelevance =
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW'
  | 'UNAVAILABLE';

export function commercialRelevance(input: {
  intent?: unknown;
  cpc?: number | null;
  volume?: number | null;
  priority?: unknown;
}): CommercialRelevance {
  const intent = upperOf(input.intent);
  const cpc =
    typeof input.cpc === 'number' &&
    Number.isFinite(input.cpc) &&
    input.cpc > 0
      ? input.cpc
      : null;
  const volume =
    typeof input.volume === 'number' &&
    Number.isFinite(input.volume) &&
    input.volume > 0
      ? input.volume
      : null;
  if (!intent && cpc === null && volume === null) {
    return 'UNAVAILABLE';
  }
  if (
    intent === 'TRANSACTIONAL' ||
    intent === 'COMPARISON' ||
    intent === 'ALTERNATIVES' ||
    upperOf(input.priority) === 'HIGH'
  ) {
    return 'HIGH';
  }
  if (
    intent === 'COMMERCIAL' ||
    intent === 'BUYER_RESEARCH' ||
    cpc !== null
  ) {
    return 'MEDIUM';
  }
  if (intent === 'INFORMATIONAL') {
    return 'LOW';
  }
  return volume !== null ? 'MEDIUM' : 'UNAVAILABLE';
}

/* ---------- action → observed outcome ----------
 * "Observed after action" — never "this action
 * increased revenue". */

export function actionOutcomeStatement(input: {
  title: string;
  metric: string;
  before: number | null;
  after: number | null;
  unit?: string;
}): string {
  const unit = input.unit ? ` ${input.unit}` : '';
  if (input.before === null || input.after === null) {
    return `${input.title}: ${input.metric} has insufficient observations around the action — outcome unknown, not zero.`;
  }
  if (input.after === input.before) {
    return `${input.title}: observed ${input.metric} unchanged at ${input.after}${unit} after the action.`;
  }
  const direction =
    input.after > input.before
      ? 'moved up'
      : 'moved down';
  return (
    `${input.title}: observed ${input.metric} ${direction} ` +
    `from ${input.before} to ${input.after}${unit} after the action. ` +
    `Observed outcome only — not proof the action caused it.`
  );
}

/* ---------- ROI language ----------
 * Real inputs only. Missing cost makes ROI
 * UNAVAILABLE — SEO cost is never assumed zero,
 * so "infinite ROI" can never be produced. */

export interface RoiVerdict {
  roiPercent: number | null;
  statement: string;
  evidenceState: OutcomeEvidenceState;
}

export function roiVerdict(input: {
  revenue: number | null;
  cost: number | null;
  currency?: string;
}): RoiVerdict {
  const revenue =
    typeof input.revenue === 'number' &&
    Number.isFinite(input.revenue) &&
    input.revenue >= 0
      ? input.revenue
      : null;
  const cost =
    typeof input.cost === 'number' &&
    Number.isFinite(input.cost) &&
    input.cost > 0
      ? input.cost
      : null;
  if (revenue === null || cost === null) {
    return {
      roiPercent: null,
      statement:
        'ROI unavailable — revenue or cost data is missing. SEO cost is never assumed zero.',
      evidenceState: 'UNAVAILABLE',
    };
  }
  const roi = ((revenue - cost) / cost) * 100;
  return {
    roiPercent: Math.round(roi * 100) / 100,
    statement: `Attributed revenue ${revenue} against recorded spend ${cost}: ROI ${roi.toFixed(1)}%. Observed inputs only.`,
    evidenceState: 'OBSERVED',
  };
}

/* ---------- channel rows ----------
 * Only channels with at least one evidenced field
 * are returned. No fake rows for missing channels. */

export interface ChannelRow {
  channel: string;
  traffic: number | null;
  trafficState: OutcomeEvidenceState;
  leads: number | null;
  leadsState: OutcomeEvidenceState;
  revenue: number | null;
  revenueState: OutcomeEvidenceState;
  note: string;
}

export function channelRow(input: {
  channel: string;
  traffic?: number | null;
  trafficState?: OutcomeEvidenceState;
  leads?: number | null;
  leadsState?: OutcomeEvidenceState;
  revenue?: number | null;
  revenueState?: OutcomeEvidenceState;
  note?: string;
}): ChannelRow | null {
  const traffic = input.traffic ?? null;
  const leads = input.leads ?? null;
  const revenue = input.revenue ?? null;
  if (
    traffic === null &&
    leads === null &&
    revenue === null
  ) {
    /* No evidence — no row. The gap list explains
     * what is missing instead. */
    return null;
  }
  return {
    channel: input.channel,
    traffic,
    trafficState:
      traffic === null
        ? 'UNAVAILABLE'
        : (input.trafficState ?? 'OBSERVED'),
    leads,
    leadsState:
      leads === null
        ? 'UNAVAILABLE'
        : (input.leadsState ?? 'OBSERVED'),
    revenue,
    revenueState:
      revenue === null
        ? 'UNAVAILABLE'
        : (input.revenueState ?? 'OBSERVED'),
    note: input.note ?? '',
  };
}

/* ---------- deterministic ordering ---------- */

export function orderByAmountDesc<
  T extends { amount: number },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.amount - a.amount);
}

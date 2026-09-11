/*
 * =========================================================
 * SEARCH-TO-REVENUE ATTRIBUTION 2.0 — pure functions
 * (Phase 33).
 *
 * Evidence-first business-outcome attribution over the
 * chain: NEED → QUERY/SURFACE → RANK/AI → PAGE →
 * VISIT → KEY EVENT → LEAD → QUALIFIED → REVENUE.
 *
 * Non-negotiable:
 * - OBSERVED vs ATTRIBUTED vs INFERRED vs ESTIMATED
 *   vs UNAVAILABLE are never collapsed.
 * - GSC query → revenue is NEVER deterministic
 *   (GSC has no user identity, journey, or lead link).
 * - No universal ROI score, no conversion score, no
 *   causal model. Temporal association only.
 * - Source attribution is used exactly as the
 *   connected system provides it (fractional credit
 *   preserved, modeled labeled modeled).
 * - Lower-confidence data never overwrites
 *   higher-confidence source data.
 * - No PII in outputs: counts, never identities.
 * =========================================================
 */

export type OutcomeEvidence =
  | 'OBSERVED'
  | 'ATTRIBUTED'
  | 'INFERRED'
  | 'ESTIMATED'
  | 'UNAVAILABLE';

export type AttributionModel =
  | 'DATA_DRIVEN'
  | 'PAID_AND_ORGANIC_LAST_CLICK'
  | 'LAST_CLICK'
  | 'SOURCE_DEFINED'
  | 'UNKNOWN';

export type TrafficChannel =
  | 'ORGANIC_SEARCH'
  | 'AI_ASSISTANT'
  | 'DIRECT'
  | 'UNASSIGNED'
  | 'PAID_SEARCH'
  | 'REFERRAL'
  | 'OTHER';

export type AiAssistantSource =
  | 'CHATGPT'
  | 'GEMINI'
  | 'COPILOT'
  | 'GROK'
  | 'DEEPSEEK'
  | 'CLAUDE'
  | 'PERPLEXITY'
  | 'AI_ASSISTANT_AGGREGATE'
  | 'UNKNOWN';

export type LeadStage =
  | 'NEW'
  | 'CONTACTED'
  | 'QUALIFIED'
  | 'DISQUALIFIED'
  | 'WON'
  | 'LOST'
  | 'QUALIFICATION_UNAVAILABLE';

export type AttributionQuality =
  | 'DIRECT_SOURCE'
  | 'SOURCE_ATTRIBUTED'
  | 'AGGREGATE_ASSOCIATION'
  | 'INFERRED'
  | 'UNAVAILABLE';

export type OutcomeGap =
  | 'NONE'
  | 'CONVERSION_DATA_GAP'
  | 'LEAD_QUALIFICATION_UNAVAILABLE'
  | 'REVENUE_UNAVAILABLE'
  | 'COST_UNAVAILABLE'
  | 'ROI_UNAVAILABLE'
  | 'PAGE_REVENUE_UNAVAILABLE'
  | 'ATTRIBUTION_UNAVAILABLE';

export type QueryRevenueRelation =
  | 'CONTEXTUAL'
  | 'DIRECT_SOURCE_LINKED';

export const ATTRIBUTION_MODELS: AttributionModel[] = [
  'DATA_DRIVEN',
  'PAID_AND_ORGANIC_LAST_CLICK',
  'LAST_CLICK',
  'SOURCE_DEFINED',
  'UNKNOWN',
];

export const TRAFFIC_CHANNELS: TrafficChannel[] = [
  'ORGANIC_SEARCH',
  'AI_ASSISTANT',
  'DIRECT',
  'UNASSIGNED',
  'PAID_SEARCH',
  'REFERRAL',
  'OTHER',
];

export const AI_ASSISTANT_SOURCES: AiAssistantSource[] = [
  'CHATGPT',
  'GEMINI',
  'COPILOT',
  'GROK',
  'DEEPSEEK',
  'CLAUDE',
  'PERPLEXITY',
  'AI_ASSISTANT_AGGREGATE',
  'UNKNOWN',
];

export const OUTCOME_WINDOWS = [7, 28, 90] as const;

export const MAX_ATTRIBUTION_PAGES = 20;
export const MAX_ATTRIBUTION_NEEDS = 10;
export const MAX_ATTRIBUTION_ACTIONS = 10;
export const MAX_PATH_TOUCHPOINTS = 10;
export const MAX_DB_ROWS = 500;

/* Known AI-referral host fragments (GA4 recognizes a
 * moving subset; RENKOO keeps provider/source
 * metadata and never overrides GA4 classification). */
const AI_SOURCE_HOSTS: Array<{
  match: string;
  source: AiAssistantSource;
}> = [
  { match: 'chatgpt.com', source: 'CHATGPT' },
  { match: 'openai.com', source: 'CHATGPT' },
  { match: 'gemini.google.com', source: 'GEMINI' },
  { match: 'copilot.microsoft.com', source: 'COPILOT' },
  { match: 'bing.com/chat', source: 'COPILOT' },
  { match: 'grok.com', source: 'GROK' },
  { match: 'x.ai', source: 'GROK' },
  { match: 'deepseek.com', source: 'DEEPSEEK' },
  { match: 'claude.ai', source: 'CLAUDE' },
  { match: 'perplexity.ai', source: 'PERPLEXITY' },
];

/* ---------- source hierarchy (§4) ----------
 * 1 GA4 → 2 CRM/revenue source → 3 GSC → 4 rank →
 * 5 AI visibility → 6 RENKOO inference. Lower never
 * overwrites higher. */

export const SOURCE_HIERARCHY = [
  'GA4',
  'CRM_REVENUE_SOURCE',
  'GSC',
  'RANK_TRACKING',
  'AI_VISIBILITY',
  'RENKOO_INFERENCE',
] as const;

export function sourceRank(source: string): number {
  const i = (
    SOURCE_HIERARCHY as readonly string[]
  ).indexOf(String(source ?? '').toUpperCase());
  return i === -1 ? SOURCE_HIERARCHY.length : i;
}

export function higherConfidenceWins(
  current: string,
  incoming: string,
): string {
  return sourceRank(incoming) < sourceRank(current)
    ? incoming
    : current;
}

/* ---------- evidence labels (§3) ---------- */

export function evidenceNote(
  state: OutcomeEvidence,
): string {
  switch (state) {
    case 'OBSERVED':
      return 'Directly observed in the connected system.';
    case 'ATTRIBUTED':
      return 'Attributed by the connected source under its own model — not a RENKOO causal claim.';
    case 'INFERRED':
      return 'RENKOO inference from associated evidence — interpretation only.';
    case 'ESTIMATED':
      return 'Estimated value — labeled estimated everywhere it appears.';
    default:
      return 'Unavailable — not zero, not absent, not a loss.';
  }
}

/* ---------- attribution models (§18/§19/§20) ---------- */

export function normalizeAttributionModel(
  value: unknown,
): AttributionModel {
  const v = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[-\s]+/g, '_');
  if (
    (ATTRIBUTION_MODELS as string[]).includes(v) ||
    v === 'GOOGLE_PAID_AND_ORGANIC_LAST_CLICK'
  ) {
    return v === 'GOOGLE_PAID_AND_ORGANIC_LAST_CLICK'
      ? 'PAID_AND_ORGANIC_LAST_CLICK'
      : (v as AttributionModel);
  }
  if (v.includes('DATA_DRIVEN')) return 'DATA_DRIVEN';
  if (v.includes('LAST_CLICK')) {
    return v.includes('PAID')
      ? 'PAID_AND_ORGANIC_LAST_CLICK'
      : 'LAST_CLICK';
  }
  return 'UNKNOWN';
}

export function modelComparisonNote(
  a: AttributionModel,
  b: AttributionModel,
): string {
  if (a === b) {
    return `Both figures use ${a} — comparable within that model.`;
  }
  return (
    `${a} and ${b} credit touchpoints differently ` +
    `(data-driven uses fractional credit; last-click assigns full credit ` +
    `to the final touchpoint). Do not compare them directly without ` +
    `explaining the model difference.`
  );
}

/* Fractional credit from data-driven sources is
 * preserved exactly — never rounded away. */
export function fractionalCredit(
  value: unknown,
): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function creditLabel(
  credit: number | null,
  model: AttributionModel,
): string {
  if (credit === null) return 'Credit unavailable — not zero.';
  if (model === 'DATA_DRIVEN') {
    return `${credit} (fractional SOURCE_ATTRIBUTED credit, preserved exactly — not RENKOO causal).`;
  }
  return `${credit} (${model} credit, source-attributed).`;
}

/* ---------- channels (§6/§7/§40) ---------- */

export function normalizeChannel(
  value: unknown,
): TrafficChannel {
  const v = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[-\s]+/g, '_');
  if (v === 'ORGANIC_SEARCH') return 'ORGANIC_SEARCH';
  if (v === 'AI_ASSISTANT' || v === 'AI') return 'AI_ASSISTANT';
  if (v === 'DIRECT' || v === '(NONE)' || v === 'NONE')
    return 'DIRECT';
  if (
    v === 'UNASSIGNED' ||
    v === '(NOT_SET)' ||
    v === '(OTHER)' ||
    v === 'UNATTRIBUTED'
  )
    return 'UNASSIGNED';
  if (v === 'PAID_SEARCH' || v === 'PAID') return 'PAID_SEARCH';
  if (v === 'REFERRAL') return 'REFERRAL';
  return 'OTHER';
}

/* (not set) / Unassigned / Direct are NEVER silently
 * normalized to Organic. */
export function unattributableBucket(
  value: unknown,
): 'NOT_SET' | 'UNASSIGNED' | 'DIRECT' | 'OTHER' | null {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === '(not set)' || v === 'not set') return 'NOT_SET';
  if (v === 'unassigned') return 'UNASSIGNED';
  if (v === 'direct' || v === '(none)') return 'DIRECT';
  if (v === 'other' || v === 'unattributable')
    return 'OTHER';
  return null;
}

export function aiAssistantSourceFromReferrer(
  referrer: unknown,
): AiAssistantSource {
  const v = String(referrer ?? '').toLowerCase();
  for (const { match, source } of AI_SOURCE_HOSTS) {
    if (v.includes(match)) return source;
  }
  return 'UNKNOWN';
}

export function aiGranularity(
  sources: AiAssistantSource[],
): AiAssistantSource {
  const known = sources.filter(
    (s) => s !== 'UNKNOWN' && s !== 'AI_ASSISTANT_AGGREGATE',
  );
  if (known.length === 1) return known[0];
  if (known.length > 1) return 'AI_ASSISTANT_AGGREGATE';
  return 'AI_ASSISTANT_AGGREGATE';
}

/* ---------- GSC limitation (§5/§11) ---------- */

export function gscDemandRole(): string {
  return (
    'SEARCH_DEMAND_EVIDENCE — aggregate query/page demand ' +
    '(no user identity, no journey, no lead link). ' +
    'GSC query → revenue is never deterministic.'
  );
}

export function queryRevenueRelation(input: {
  directSourceLinkage: boolean;
}): {
  relation: QueryRevenueRelation;
  statement: string;
} {
  if (input.directSourceLinkage) {
    return {
      relation: 'DIRECT_SOURCE_LINKED',
      statement:
        'An authoritative source explicitly links this query to revenue. Shown as SOURCE_ATTRIBUTED.',
    };
  }
  return {
    relation: 'CONTEXTUAL',
    statement:
      'Search demand is associated with this page; revenue is attributed ' +
      'at the organic/page/channel level. No “keyword X generated ₹X” claim.',
  };
}

/* ---------- leads (§14/§15/§71) ---------- */

export function normalizeLeadStage(
  status: unknown,
  converted: unknown,
): LeadStage {
  if (converted === true) return 'WON';
  const v = String(status ?? '').trim().toUpperCase();
  if (
    v === 'NEW' ||
    v === 'CONTACTED' ||
    v === 'QUALIFIED' ||
    v === 'DISQUALIFIED' ||
    v === 'WON' ||
    v === 'LOST'
  ) {
    return v as LeadStage;
  }
  if (v === 'CONVERTED' || v === 'CUSTOMER') return 'WON';
  return 'QUALIFICATION_UNAVAILABLE';
}

export function isQualified(stage: LeadStage): boolean | null {
  if (stage === 'QUALIFIED' || stage === 'WON') return true;
  if (stage === 'DISQUALIFIED' || stage === 'LOST')
    return false;
  if (stage === 'QUALIFICATION_UNAVAILABLE') return null;
  return false;
}

export function duplicateLeadLabel(input: {
  possibleDuplicate: boolean;
}): string {
  return input.possibleDuplicate
    ? 'DUPLICATE_UNCERTAIN — not silently merged; counts may overlap.'
    : 'No duplicate signal.';
}

/* ---------- revenue + currency (§16/§17/§72) ---------- */

export interface MoneyInput {
  amount: unknown;
  currency: unknown;
}

export interface MoneyResult {
  amount: number | null;
  currency: string | null;
  state: 'MONEY' | 'MULTI_CURRENCY' | 'UNAVAILABLE';
  note: string;
}

export function normalizeMoney(
  input: MoneyInput,
): MoneyResult {
  const n =
    input.amount === null || input.amount === undefined
      ? NaN
      : Number(input.amount);
  const currency = String(input.currency ?? '')
    .trim()
    .toUpperCase();
  if (!Number.isFinite(n)) {
    return {
      amount: null,
      currency: currency || null,
      state: 'UNAVAILABLE',
      note: 'Revenue unavailable — not zero.',
    };
  }
  return {
    amount: n,
    currency: currency || null,
    state: 'MONEY',
    note: 'Recorded amount in its own currency — never silently converted.',
  };
}

export function multiCurrencyNote(
  currencies: string[],
): string {
  const unique = [...new Set(currencies.map((c) => c.toUpperCase()))];
  if (unique.length <= 1) {
    return `Single currency (${unique[0] ?? 'unknown'}) — safe to total.`;
  }
  return (
    `MULTI_CURRENCY (${unique.join(', ')}) — never aggregated into one ` +
    `number without a supported conversion. Shown separately.`
  );
}

/* ---------- ROI (§46/§47/§48) — never a score ---------- */

export interface RoiResult {
  roi: number | null;
  label: string;
  state: 'ATTRIBUTION_BASED_ROI' | 'ROI_UNAVAILABLE';
}

export function attributionRoi(input: {
  revenue: number | null;
  cost: number | null;
}): RoiResult {
  if (
    input.revenue === null ||
    input.cost === null ||
    !Number.isFinite(input.revenue) ||
    !Number.isFinite(input.cost) ||
    input.cost <= 0
  ) {
    const gap =
      input.cost === null
        ? 'COST_UNAVAILABLE — staff cost is never estimated.'
        : 'ROI_UNAVAILABLE — both attributed revenue and known cost are required.';
    return {
      roi: null,
      label: gap,
      state: 'ROI_UNAVAILABLE',
    };
  }
  return {
    roi: (input.revenue - input.cost) / input.cost,
    label:
      'ATTRIBUTION-BASED ROI — under the source attribution model, not causal ROI.',
    state: 'ATTRIBUTION_BASED_ROI',
  }
}

/* ---------- attribution paths (§21/§22/§23) ---------- */

export interface PathTouchpoint {
  channel: TrafficChannel;
  at: string | null;
  credit: number | null;
}

export interface AttributionPath {
  touchpoints: PathTouchpoint[];
  keyEvent: string | null;
  revenue: number | null;
  timeToKeyEvent: string | null;
  touchpointCount: number;
  assisted: boolean;
  firstTouch: TrafficChannel | null;
  note: string;
}

export function composePath(input: {
  touchpoints: PathTouchpoint[];
  keyEvent?: string | null;
  revenue?: number | null;
  model?: AttributionModel;
}): AttributionPath {
  const capped = input.touchpoints.slice(
    0,
    MAX_PATH_TOUCHPOINTS,
  );
  const organicAssists = capped.filter(
    (t) =>
      t.channel === 'ORGANIC_SEARCH' &&
      capped[capped.length - 1]?.channel !== 'ORGANIC_SEARCH',
  ).length;
  return {
    touchpoints: capped,
    keyEvent: input.keyEvent ?? null,
    revenue: input.revenue ?? null,
    timeToKeyEvent: null,
    touchpointCount: capped.length,
    assisted: organicAssists > 0,
    firstTouch: capped.length > 0 ? capped[0].channel : null,
    note:
      organicAssists > 0
        ? 'ASSISTED — organic search appears before the closing touchpoint. Assisted ≠ caused.'
        : 'Path as the source provides it — never reconstructed when hidden.',
  };
}

/* ---------- gaps (§58/§59/§60/§61) ---------- */

export function outcomeGap(input: {
  eventTrackingConnected: boolean;
  eventTrackingReliable: boolean;
  hasTraffic: boolean;
  hasKeyEvents: boolean;
  hasLeads: boolean;
  qualificationAvailable: boolean;
  hasRevenue: boolean;
}): OutcomeGap {
  /* Binding-constraint order: missing qualification
   * beats missing events when leads exist; missing
   * revenue beats both when qualified demand exists.
   * Conversion gap applies to traffic with no recorded
   * outcomes at all. */
  if (
    input.hasKeyEvents &&
    input.hasLeads &&
    !input.qualificationAvailable
  ) {
    return 'LEAD_QUALIFICATION_UNAVAILABLE';
  }
  if (
    (input.hasKeyEvents || input.hasLeads) &&
    !input.hasRevenue
  ) {
    return 'REVENUE_UNAVAILABLE';
  }
  if (
    input.hasTraffic &&
    !input.hasKeyEvents &&
    !input.hasLeads &&
    input.eventTrackingConnected &&
    input.eventTrackingReliable
  ) {
    return 'CONVERSION_DATA_GAP';
  }
  return 'NONE';
}

export function attributionQuality(input: {
  sourceNamesSearch: boolean;
  landingPageLinked: boolean;
  keywordHintOnly: boolean;
}): AttributionQuality {
  if (input.sourceNamesSearch) return 'DIRECT_SOURCE';
  if (input.landingPageLinked) return 'SOURCE_ATTRIBUTED';
  if (input.keywordHintOnly) return 'AGGREGATE_ASSOCIATION';
  return 'UNAVAILABLE';
}

/* ---------- causality protection (§33/§34/§35) ---------- */

export function observedAfterChange(input: {
  metric: string;
  value: string;
  verified: boolean;
}): string {
  const base = `${input.metric} ${input.value} was observed after the verified change.`;
  if (!input.verified) {
    return `${input.metric} ${input.value} observed in the window — verification unavailable, outcome unknown.`;
  }
  return `${base} Temporal association only — not proof the change caused it.`;
}

export function temporalSequenceNote(
  steps: string[],
): string {
  return (
    `${steps.join(' → ')}. ` +
    `TEMPORAL_ASSOCIATION unless a stronger causal design exists.`
  );
}

export function forbiddenRevenueClaim(
  keyword: string,
): string {
  return (
    `Never “${keyword} generated revenue” without an authoritative ` +
    `source linkage. Allowed: revenue observed/attributed in the ` +
    `post-change window at page/channel level.`
  );
}

/* ---------- attribution explanation (§62) ---------- */

export interface AttributionExplanation {
  where: string;
  source: string;
  attribution: AttributionModel;
  channel: TrafficChannel;
  window: string;
  status: string;
}

export function explainAttribution(input: {
  amount: string;
  source: string;
  model: AttributionModel;
  channel: TrafficChannel;
  window: string;
}): AttributionExplanation {
  return {
    where: `${input.amount} — from ${input.source}, not inferred by RENKOO.`,
    source: input.source,
    attribution: input.model,
    channel: input.channel,
    window: input.window,
    status: 'SOURCE_ATTRIBUTED',
  };
}

/* ---------- freshness / windows / modeled (§36/§37/§38/§39) ---------- */

export function normalizeWindow(
  days: unknown,
): 7 | 28 | 90 {
  const n = Math.floor(Number(days));
  if (n === 7) return 7;
  if (n === 90) return 90;
  return 28;
}

export function freshnessNote(input: {
  observedAt: string | null;
  dataThrough: string | null;
  source: string;
  model: AttributionModel;
}): string {
  return (
    `Observed ${input.observedAt ?? 'unknown'}; data through ` +
    `${input.dataThrough ?? 'unknown'}; source ${input.source}; ` +
    `model ${input.model}. Attribution may update after the event — ` +
    `never call data final prematurely.`
  );
}

export function modeledLabel(
  isModeled: boolean | null,
): OutcomeEvidence {
  if (isModeled === true) return 'ESTIMATED';
  if (isModeled === false) return 'OBSERVED';
  return 'UNAVAILABLE';
}

/* ---------- client report (§65) ---------- */

export function clientSummary(input: {
  traffic: string;
  keyEvents: string;
  leads: string;
  revenue: string;
  unknown: string[];
  next: string;
}): string[] {
  return [
    `WHAT HAPPENED: ${input.traffic}.`,
    `WHAT GENERATED KEY EVENTS: ${input.keyEvents}.`,
    `WHAT GENERATED LEADS: ${input.leads}.`,
    `WHAT REVENUE IS ATTRIBUTED: ${input.revenue}.`,
    `WHAT IS UNKNOWN: ${input.unknown.length > 0 ? input.unknown.join('; ') : 'nothing material'}.`,
    `WHAT TO DO NEXT: ${input.next}.`,
  ];
}

/* ---------- privacy (§41/§42) ---------- */

const PII_KEYS = [
  'email',
  'phone',
  'ip',
  'cookie',
  'userId',
  'user_id',
  'clientId',
  'name',
];

export function stripPii<T extends Record<string, unknown>>(
  row: T,
): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (PII_KEYS.includes(key)) continue;
    out[key] = value;
  }
  return out as Partial<T>;
}

export function leadCountOnly(
  count: number | null,
): string {
  if (count === null) return 'Lead count unavailable — not zero.';
  return `${count} lead${count === 1 ? '' : 's'} (counts only — no personal identities).`;
}

/* ---------- hero gating (§44/§45) ----------
 * Only metrics with evidence; unavailable never 0. */

export interface HeroMetric {
  key: string;
  value: string | null;
  evidence: OutcomeEvidence;
}

export function heroMetrics(
  metrics: HeroMetric[],
  max = 5,
): HeroMetric[] {
  return metrics
    .filter((m) => m.value !== null && m.evidence !== 'UNAVAILABLE')
    .slice(0, Math.max(1, max));
}

/* ---------- need/keyword association (§51/§52) ---------- */

export function needAssociationNote(): string {
  return (
    'NEED_TO_REVENUE_ASSOCIATION — need demand, associated pages, ' +
    'organic traffic, organic conversions, revenue at page/channel ' +
    'level. Never NEED_REVENUE_DIRECT without source linkage.'
  );
}

/* ---------- connection prompts (§67) ---------- */

export function connectionPrompt(input: {
  ga4Connected: boolean;
  crmConnected: boolean;
  revenueAvailable: boolean;
}): string[] {
  const out: string[] = [];
  if (!input.ga4Connected) {
    out.push(
      'CONNECT GA4 — unlock traffic, key events and attribution paths.',
    );
  }
  if (!input.crmConnected) {
    out.push(
      'CRM NOT CONNECTED — continuing with available analytics; qualification may be unavailable.',
    );
  }
  if (!input.revenueAvailable) {
    out.push('REVENUE DATA UNAVAILABLE — shown as unavailable, never zero.');
  }
  return out;
}

/* ---------- lookback (§37) ---------- */

export function lookbackNote(
  sourceWindow: string | null,
): string {
  if (!sourceWindow) {
    return 'No source lookback window — RENKOO never silently substitutes its own.';
  }
  return `Source lookback window: ${sourceWindow}.`;
}

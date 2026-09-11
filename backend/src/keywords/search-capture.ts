/*
 * =========================================================
 * ZERO-CLICK + COMMERCIAL SEARCH INTELLIGENCE 1.0 — pure
 * deterministic composition (Phase 16).
 *
 * Answers: where is the site visible but failing to
 * capture clicks or business value, which queries carry
 * the strongest commercial intent, what SERP/AI context
 * is actually observed, and what to do next.
 *
 * Reuses: GSC windows (VERIFIED), Search Baseline window
 * math, Rank striking-distance 4–20, ResearchIntent
 * taxonomy, revenue-intelligence commercialRelevance +
 * zeroClickState, SERP FEATURE_FRAMING vocabulary,
 * EvidenceFusion action vocabulary.
 *
 * Mandatory language rule: LOW CTR is NEVER proven
 * zero-click. Without direct source evidence the state
 * is HIGH_VISIBILITY_LOW_CLICK_CAPTURE. Unavailable is
 * never zero; correlation is never causation; VISIBLE ≠
 * CLICKED ≠ LEAD ≠ CUSTOMER ≠ REVENUE; AI MENTION ≠ AI
 * CITATION ≠ AI TRAFFIC ≠ LEAD.
 * =========================================================
 */

export type CaptureEvidenceState =
  | 'VERIFIED'
  | 'OBSERVED'
  | 'INFERRED'
  | 'ESTIMATED'
  | 'UNAVAILABLE';

export type CapturePattern =
  | 'HIGH_VISIBILITY_LOW_CLICK_CAPTURE'
  | 'HIGH_CTR_OPPORTUNITY'
  | 'LOW_VISIBILITY'
  | 'COMMERCIAL_VISIBILITY_GAP'
  | 'AI_VISIBILITY_WITHOUT_OBSERVED_TRAFFIC'
  | 'SERP_FEATURE_EXPOSURE'
  | 'INSUFFICIENT_EVIDENCE';

export type CtrDiagnosis =
  | 'HIGH_CTR_OPPORTUNITY'
  | 'RANKING_FIRST'
  | 'CAPTURED_WELL'
  | 'INSUFFICIENT_DEMAND';

export type CtrTrend =
  | 'CTR_IMPROVED'
  | 'CTR_DECLINED'
  | 'CTR_STABLE'
  | 'UNKNOWN';

export type CommercialTier =
  | 'HIGH_COMMERCIAL'
  | 'MEDIUM_COMMERCIAL'
  | 'LOW_COMMERCIAL'
  | 'UNAVAILABLE';

export type CommercialGap =
  | 'COMMERCIAL_VISIBILITY_GAP'
  | 'COMMERCIAL_CTR_GAP'
  | 'COMMERCIAL_OUTCOME_UNAVAILABLE'
  | 'COMMERCIAL_OUTCOME_OBSERVED'
  | 'INSUFFICIENT_EVIDENCE';

export type AiSearchRelationship =
  | 'GOOGLE_STRONG_AI_STRONG'
  | 'GOOGLE_STRONG_AI_WEAK'
  | 'GOOGLE_WEAK_AI_STRONG'
  | 'GOOGLE_WEAK_AI_WEAK'
  | 'INSUFFICIENT_EVIDENCE';

export type PageCaptureDiagnosis =
  | 'HIGH_VISIBILITY_LOW_CTR'
  | 'COMMERCIAL_QUERY_UNDERPERFORMING'
  | 'RANKING_GAP'
  | 'SERP_FEATURE_COMPETITION'
  | 'AI_VISIBILITY_WITHOUT_OBSERVED_TRAFFIC'
  | 'TRAFFIC_WITHOUT_LEAD_EVIDENCE'
  | 'LEAD_WITHOUT_REVENUE_EVIDENCE'
  | 'INSUFFICIENT_EVIDENCE';

export type OpportunityGroup =
  | 'HIGH_IMPRESSION_LOW_CTR'
  | 'HIGH_COMMERCIAL_LOW_VISIBILITY'
  | 'STRIKING_DISTANCE_COMMERCIAL'
  | 'STRONG_RANK_LOW_CTR'
  | 'AI_VISIBLE_SEARCH_WEAK'
  | 'TRAFFIC_WITHOUT_OUTCOME_EVIDENCE'
  | 'OUTCOME_CONNECTED_SEARCH';

/* Existing EvidenceFusion vocabulary — reused only. */
export type CaptureNbaCategory =
  | 'IMPROVE_EXISTING_PAGE'
  | 'CREATE_CONTENT'
  | 'CONSOLIDATE_CONTENT'
  | 'INTERNAL_LINK'
  | 'FIX_TECHNICAL'
  | 'IMPROVE_AI_CITABILITY'
  | 'IMPROVE_AI_VISIBILITY'
  | 'FIX_AI_AGENT_ACCESS'
  | 'PROTECT_WINNING_PAGE'
  | 'MONITOR_CHANGE';

export const CAPTURE_THRESHOLDS = {
  visibleImpressions: 500,
  lowCtr: 0.01,
  strongCtr: 0.05,
  strongPosition: 10,
  /* Striking distance reuses the existing Rank
   * definition (4–20) — never redefined here. */
  strikingMin: 4,
  strikingMax: 20,
} as const;

export const CANNOT_MEASURE: readonly string[] = [
  'Actual zero-click session count is unavailable: no source exposes it.',
  'Exact AI-generated answer impressions are unavailable unless official data exists.',
  'AI referral traffic is unavailable where not observed — never treated as zero.',
  'Keyword-level revenue attribution is unavailable where not recorded.',
  'Causal SERP-feature impact on clicks is unavailable: observed presence is stated alongside CTR, never as its cause.',
];

/* ---------- CTR diagnostics ---------- */

export interface CtrRowInput {
  impressions: number | null;
  clicks: number | null;
  position: number | null;
}

function ctrOf(input: CtrRowInput): number | null {
  if (
    input.impressions === null ||
    input.impressions <= 0 ||
    input.clicks === null
  )
    return null;
  return input.clicks / input.impressions;
}

export function ctrDiagnosis(
  input: CtrRowInput,
): CtrDiagnosis {
  const impressions = input.impressions ?? 0;
  if (impressions < CAPTURE_THRESHOLDS.visibleImpressions)
    return 'INSUFFICIENT_DEMAND';
  const ctr = ctrOf(input);
  if (ctr === null) return 'INSUFFICIENT_DEMAND';
  if (ctr >= CAPTURE_THRESHOLDS.strongCtr)
    return 'CAPTURED_WELL';
  if (ctr < CAPTURE_THRESHOLDS.lowCtr) {
    const pos = input.position;
    if (
      pos !== null &&
      pos <= CAPTURE_THRESHOLDS.strongPosition
    )
      return 'HIGH_CTR_OPPORTUNITY';
    return 'RANKING_FIRST';
  }
  return 'CAPTURED_WELL';
}

export function ctrTrend(
  currentCtr: number | null,
  previousCtr: number | null,
): CtrTrend {
  if (currentCtr === null || previousCtr === null)
    return 'UNKNOWN';
  const delta = currentCtr - previousCtr;
  if (delta > 0.001) return 'CTR_IMPROVED';
  if (delta < -0.001) return 'CTR_DECLINED';
  return 'CTR_STABLE';
}

/* ---------- capture pattern (honest zero-click) ---------- */

export interface CapturePatternInput extends CtrRowInput {
  hasSerpFeatures: boolean;
  hasAiCitation: boolean;
  commercialTier: CommercialTier;
  hasRanking: boolean;
}

export function capturePattern(
  input: CapturePatternInput,
): CapturePattern {
  const impressions = input.impressions ?? 0;
  const ctr = ctrOf(input);
  if (
    impressions < CAPTURE_THRESHOLDS.visibleImpressions ||
    ctr === null
  )
    return 'INSUFFICIENT_EVIDENCE';
  if (
    input.hasAiCitation &&
    (input.clicks ?? 0) === 0
  )
    return 'AI_VISIBILITY_WITHOUT_OBSERVED_TRAFFIC';
  if (
    ctr < CAPTURE_THRESHOLDS.lowCtr &&
    input.commercialTier === 'HIGH_COMMERCIAL' &&
    !input.hasRanking
  )
    return 'COMMERCIAL_VISIBILITY_GAP';
  if (
    ctr < CAPTURE_THRESHOLDS.lowCtr &&
    input.hasSerpFeatures
  )
    return 'SERP_FEATURE_EXPOSURE';
  if (ctr < CAPTURE_THRESHOLDS.lowCtr) {
    const pos = input.position;
    if (
      pos !== null &&
      pos <= CAPTURE_THRESHOLDS.strongPosition
    )
      return 'HIGH_VISIBILITY_LOW_CLICK_CAPTURE';
    return 'HIGH_CTR_OPPORTUNITY';
  }
  if (ctr >= CAPTURE_THRESHOLDS.strongCtr)
    return 'HIGH_CTR_OPPORTUNITY';
  return 'LOW_VISIBILITY';
}

export function captureStatement(
  pattern: CapturePattern,
): string {
  switch (pattern) {
    case 'HIGH_VISIBILITY_LOW_CLICK_CAPTURE':
      return 'High search visibility with low observed click capture. Low CTR is not proven zero-click.';
    case 'HIGH_CTR_OPPORTUNITY':
      return 'Observed impressions with headroom to capture more clicks from current visibility.';
    case 'LOW_VISIBILITY':
      return 'Limited observed visibility; capture cannot be diagnosed from this window.';
    case 'COMMERCIAL_VISIBILITY_GAP':
      return 'High commercial relevance with observed demand but weak or no ranking capture.';
    case 'AI_VISIBILITY_WITHOUT_OBSERVED_TRAFFIC':
      return 'AI visibility observed, but AI referral traffic is unavailable.';
    case 'SERP_FEATURE_EXPOSURE':
      return 'Observed SERP features coincide with low click capture. Presence is stated alongside CTR, never as its cause.';
    case 'INSUFFICIENT_EVIDENCE':
    default:
      return 'Insufficient evidence for a capture diagnostic. Unavailable is not zero.';
  }
}

/* ---------- commercial intent (existing taxonomy) ---------- */

const HIGH_INTENTS = new Set([
  'TRANSACTIONAL',
  'COMPARISON',
  'ALTERNATIVES',
]);

const MEDIUM_INTENTS = new Set([
  'COMMERCIAL',
  'BUYER_RESEARCH',
  'LOCAL',
  'SERVICE',
]);

export function commercialTier(input: {
  intent?: unknown;
  cpc?: number | null;
  volume?: number | null;
  priority?: unknown;
}): CommercialTier {
  const intent = String(input.intent ?? '')
    .trim()
    .toUpperCase();
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
  const priority = String(input.priority ?? '')
    .trim()
    .toUpperCase();
  if (!intent && cpc === null && volume === null)
    return 'UNAVAILABLE';
  if (HIGH_INTENTS.has(intent) || priority === 'HIGH')
    return 'HIGH_COMMERCIAL';
  if (MEDIUM_INTENTS.has(intent) || cpc !== null)
    return 'MEDIUM_COMMERCIAL';
  if (intent === 'INFORMATIONAL') return 'LOW_COMMERCIAL';
  if (intent) return 'LOW_COMMERCIAL';
  return volume !== null ? 'MEDIUM_COMMERCIAL' : 'UNAVAILABLE';
}

/* Commercial query-type labels map to existing
 * ResearchIntent — no duplicate labels created. */
export const COMMERCIAL_QUERY_TYPES = [
  'BEST',
  'COMPARE',
  'ALTERNATIVE',
  'PRICING',
  'REVIEW',
  'BUY',
  'SERVICE',
  'LOCAL',
  'IMPLEMENTATION',
  'USE_CASE',
] as const;

export function commercialGap(input: {
  tier: CommercialTier;
  hasRanking: boolean;
  position: number | null;
  ctr: number | null;
  leads: number | null;
  revenue: number | null;
}): CommercialGap {
  if (input.tier === 'UNAVAILABLE')
    return 'INSUFFICIENT_EVIDENCE';
  if (
    input.tier === 'HIGH_COMMERCIAL' &&
    !input.hasRanking
  )
    return 'COMMERCIAL_VISIBILITY_GAP';
  if (
    input.position !== null &&
    input.position <= CAPTURE_THRESHOLDS.strongPosition &&
    input.ctr !== null &&
    input.ctr < CAPTURE_THRESHOLDS.lowCtr
  )
    return 'COMMERCIAL_CTR_GAP';
  if (
    (input.revenue ?? 0) > 0 ||
    (input.leads ?? 0) > 0
  ) {
    if ((input.revenue ?? 0) > 0)
      return 'COMMERCIAL_OUTCOME_OBSERVED';
    return 'COMMERCIAL_OUTCOME_UNAVAILABLE';
  }
  return 'COMMERCIAL_OUTCOME_UNAVAILABLE';
}

/* ---------- SERP feature → click context ---------- */

export function serpClickContext(input: {
  features: string[];
  ctr: number | null;
}): 'SERP_FEATURE_COMPETITION' | 'NO_OBSERVED_FEATURE' | 'INSUFFICIENT_EVIDENCE' {
  if (input.ctr === null) return 'INSUFFICIENT_EVIDENCE';
  const observed = (input.features ?? []).filter(
    (f) => String(f ?? '').trim().length > 0,
  );
  if (observed.length === 0) return 'NO_OBSERVED_FEATURE';
  if (input.ctr < CAPTURE_THRESHOLDS.lowCtr)
    return 'SERP_FEATURE_COMPETITION';
  return 'NO_OBSERVED_FEATURE';
}

/* ---------- AI visibility context (descriptive) ---------- */

export function aiSearchRelationship(input: {
  googleStrong: boolean | null;
  aiStrong: boolean | null;
}): AiSearchRelationship {
  if (input.googleStrong === null || input.aiStrong === null)
    return 'INSUFFICIENT_EVIDENCE';
  if (input.googleStrong && input.aiStrong)
    return 'GOOGLE_STRONG_AI_STRONG';
  if (input.googleStrong && !input.aiStrong)
    return 'GOOGLE_STRONG_AI_WEAK';
  if (!input.googleStrong && input.aiStrong)
    return 'GOOGLE_WEAK_AI_STRONG';
  return 'GOOGLE_WEAK_AI_WEAK';
}

/* ---------- striking distance (existing definition) ---------- */

export function isStrikingDistanceCommercial(
  position: number | null,
  tier: CommercialTier,
): boolean {
  if (position === null || !Number.isFinite(position))
    return false;
  return (
    position >= CAPTURE_THRESHOLDS.strikingMin &&
    position <= CAPTURE_THRESHOLDS.strikingMax &&
    (tier === 'HIGH_COMMERCIAL' ||
      tier === 'MEDIUM_COMMERCIAL')
  );
}

/* ---------- opportunity groups ---------- */

export interface GroupInput {
  impressions: number | null;
  clicks: number | null;
  position: number | null;
  tier: CommercialTier;
  hasRanking: boolean;
  hasAiCitation: boolean;
  aiStrong: boolean | null;
  googleStrong: boolean | null;
  leads: number | null;
  revenue: number | null;
}

export function opportunityGroups(
  input: GroupInput,
): OpportunityGroup[] {
  const out = new Set<OpportunityGroup>();
  const impressions = input.impressions ?? 0;
  const ctr =
    impressions > 0 && input.clicks !== null
      ? input.clicks / impressions
      : null;
  if (
    impressions >= CAPTURE_THRESHOLDS.visibleImpressions &&
    ctr !== null &&
    ctr < CAPTURE_THRESHOLDS.lowCtr
  )
    out.add('HIGH_IMPRESSION_LOW_CTR');
  if (
    (input.tier === 'HIGH_COMMERCIAL' ||
      input.tier === 'MEDIUM_COMMERCIAL') &&
    !input.hasRanking
  )
    out.add('HIGH_COMMERCIAL_LOW_VISIBILITY');
  if (
    isStrikingDistanceCommercial(input.position, input.tier)
  )
    out.add('STRIKING_DISTANCE_COMMERCIAL');
  if (
    input.position !== null &&
    input.position <= CAPTURE_THRESHOLDS.strongPosition &&
    ctr !== null &&
    ctr < CAPTURE_THRESHOLDS.lowCtr
  )
    out.add('STRONG_RANK_LOW_CTR');
  if (
    input.hasAiCitation &&
    input.googleStrong === false
  )
    out.add('AI_VISIBLE_SEARCH_WEAK');
  if (
    (input.clicks ?? 0) > 0 &&
    (input.leads ?? 0) === 0 &&
    (input.revenue ?? 0) === 0
  )
    out.add('TRAFFIC_WITHOUT_OUTCOME_EVIDENCE');
  if ((input.revenue ?? 0) > 0 || (input.leads ?? 0) > 0)
    out.add('OUTCOME_CONNECTED_SEARCH');
  return [...out];
}

/* ---------- page-level diagnosis ---------- */

export interface PageDiagnosisInput {
  impressions: number | null;
  clicks: number | null;
  position: number | null;
  commercialQueries: number;
  hasSerpFeatures: boolean;
  hasAiCitation: boolean;
  aiTraffic: number | null;
  leads: number | null;
  revenue: number | null;
  hasRanking: boolean;
}

export function pageDiagnosis(
  input: PageDiagnosisInput,
): PageCaptureDiagnosis {
  const impressions = input.impressions ?? 0;
  const ctr =
    impressions > 0 && input.clicks !== null
      ? input.clicks / impressions
      : null;
  if (
    impressions < CAPTURE_THRESHOLDS.visibleImpressions ||
    ctr === null
  )
    return 'INSUFFICIENT_EVIDENCE';
  if (
    ctr < CAPTURE_THRESHOLDS.lowCtr &&
    input.position !== null &&
    input.position <= CAPTURE_THRESHOLDS.strongPosition
  )
    return 'HIGH_VISIBILITY_LOW_CTR';
  if (
    input.commercialQueries > 0 &&
    (!input.hasRanking ||
      (input.position !== null &&
        input.position > CAPTURE_THRESHOLDS.strikingMax))
  )
    return 'COMMERCIAL_QUERY_UNDERPERFORMING';
  if (!input.hasRanking) return 'RANKING_GAP';
  if (
    input.hasSerpFeatures &&
    ctr < CAPTURE_THRESHOLDS.lowCtr
  )
    return 'SERP_FEATURE_COMPETITION';
  if (
    input.hasAiCitation &&
    (input.aiTraffic === null || input.aiTraffic === 0)
  )
    return 'AI_VISIBILITY_WITHOUT_OBSERVED_TRAFFIC';
  if (
    (input.clicks ?? 0) > 0 &&
    (input.leads ?? 0) === 0
  )
    return 'TRAFFIC_WITHOUT_LEAD_EVIDENCE';
  if (
    (input.leads ?? 0) > 0 &&
    (input.revenue ?? 0) === 0
  )
    return 'LEAD_WITHOUT_REVENUE_EVIDENCE';
  return 'INSUFFICIENT_EVIDENCE';
}

/* ---------- action mapping (existing vocabulary) ---------- */

export function mapGroupToNba(
  group: OpportunityGroup,
): CaptureNbaCategory {
  switch (group) {
    case 'HIGH_IMPRESSION_LOW_CTR':
      return 'IMPROVE_EXISTING_PAGE';
    case 'HIGH_COMMERCIAL_LOW_VISIBILITY':
      return 'CREATE_CONTENT';
    case 'STRIKING_DISTANCE_COMMERCIAL':
      return 'IMPROVE_EXISTING_PAGE';
    case 'STRONG_RANK_LOW_CTR':
      return 'IMPROVE_EXISTING_PAGE';
    case 'AI_VISIBLE_SEARCH_WEAK':
      return 'IMPROVE_AI_VISIBILITY';
    case 'TRAFFIC_WITHOUT_OUTCOME_EVIDENCE':
      return 'MONITOR_CHANGE';
    case 'OUTCOME_CONNECTED_SEARCH':
      return 'PROTECT_WINNING_PAGE';
    default:
      return 'MONITOR_CHANGE';
  }
}

export function mapPageDiagnosisToNba(
  diagnosis: PageCaptureDiagnosis,
): CaptureNbaCategory {
  switch (diagnosis) {
    case 'HIGH_VISIBILITY_LOW_CTR':
      return 'IMPROVE_EXISTING_PAGE';
    case 'COMMERCIAL_QUERY_UNDERPERFORMING':
      return 'IMPROVE_EXISTING_PAGE';
    case 'RANKING_GAP':
      return 'CREATE_CONTENT';
    case 'SERP_FEATURE_COMPETITION':
      return 'IMPROVE_EXISTING_PAGE';
    case 'AI_VISIBILITY_WITHOUT_OBSERVED_TRAFFIC':
      return 'IMPROVE_AI_CITABILITY';
    case 'TRAFFIC_WITHOUT_LEAD_EVIDENCE':
      return 'MONITOR_CHANGE';
    case 'LEAD_WITHOUT_REVENUE_EVIDENCE':
      return 'MONITOR_CHANGE';
    case 'INSUFFICIENT_EVIDENCE':
    default:
      return 'MONITOR_CHANGE';
  }
}

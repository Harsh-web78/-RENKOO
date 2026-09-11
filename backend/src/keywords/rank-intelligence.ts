/*
 * =========================================================
 * RANK INTELLIGENCE 2.0 — pure functions (Phase 31).
 *
 * Production-grade organic rank intelligence vocabulary.
 * Every function is pure, deterministic, and honesty-first:
 *
 * - GSC POSITION (aggregate Search Console performance)
 *   is NEVER labeled TRACKED POSITION (deterministic
 *   daily rank observation). Different measurement
 *   contexts — never treated as equivalent.
 * - UNKNOWN means the provider could not determine a
 *   position. NOT_RANKING means the provider explicitly
 *   confirmed absence from the Top 100. Never convert
 *   one into the other.
 * - Missing history stays missing: no interpolation,
 *   no smoothing, no fabricated daily values.
 * - Movement compares valid consecutive observations
 *   only — never inferred from missing data.
 * - AI mentions/citations are NEVER positions.
 * - Estimated values are NEVER observed values.
 * - No causal claims anywhere: observed outcomes only.
 * =========================================================
 */

export type TrackedPositionBand =
  | 'TOP_3'
  | 'TOP_10'
  | 'TOP_20'
  | 'TOP_50'
  | 'TOP_100'
  | 'NOT_RANKING'
  | 'UNKNOWN';

export type RankMovement2 =
  | 'GAINED'
  | 'LOST'
  | 'STABLE'
  | 'NEW'
  | 'DROPPED_OUT'
  | 'RETURNED'
  | 'UNKNOWN';

export type RankingUrlState =
  | 'SAME_URL'
  | 'URL_CHANGED'
  | 'NO_URL'
  | 'UNKNOWN';

export type TargetUrlState =
  | 'TARGET_RANKING'
  | 'OTHER_URL_RANKING'
  | 'NOT_RANKING'
  | 'UNKNOWN';

export type KeywordOrigin =
  | 'MANUAL'
  | 'GSC'
  | 'KEYWORD_RESEARCH'
  | 'STRATEGY'
  | 'CUSTOMER_DEMAND';

export type TrackedDevice = 'DESKTOP' | 'MOBILE';

export type TrackEngine = 'GOOGLE';

export type SerpFeature =
  | 'FEATURED_SNIPPET'
  | 'AI_OVERVIEW'
  | 'LOCAL_PACK'
  | 'VIDEO'
  | 'IMAGE_PACK'
  | 'PEOPLE_ALSO_ASK'
  | 'TOP_STORIES'
  | 'SHOPPING';

export type FeatureOwnership =
  | 'OWNED'
  | 'COMPETITOR_OWNED'
  | 'PRESENT_NOT_OWNED'
  | 'UNKNOWN';

export type AiOverviewState =
  | 'PRESENT'
  | 'NOT_OBSERVED'
  | 'UNKNOWN';

export type AiModeState =
  | 'AI_MENTION'
  | 'AI_CITATION'
  | 'AI_NOT_OBSERVED'
  | 'UNKNOWN';

export type AiGoogleDivergence =
  | 'GOOGLE_STRONG_AI_WEAK'
  | 'GOOGLE_WEAK_AI_STRONG'
  | 'BOTH_STRONG'
  | 'BOTH_WEAK'
  | 'MIXED'
  | 'UNKNOWN';

export type RankVolatility =
  | 'STABLE'
  | 'CHANGING'
  | 'HIGHLY_VARIABLE'
  | 'INSUFFICIENT_HISTORY';

export type TrackingHealth =
  | 'ACTIVE'
  | 'PARTIAL'
  | 'STALE'
  | 'FAILED'
  | 'NOT_CONFIGURED';

export type TrackingRunStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED';

export type CompetitorMoveState =
  | 'COMPETITOR_GAINED'
  | 'COMPETITOR_DROPPED'
  | 'COMPETITOR_STABLE'
  | 'COMPETITOR_ENTERED'
  | 'COMPETITOR_LEFT'
  | 'UNKNOWN';

export type RankAlertTrigger =
  | 'TOP_3_EXIT'
  | 'TOP_10_EXIT'
  | 'TOP_10_ENTRY'
  | 'POSITION_DROP'
  | 'POSITION_GAIN'
  | 'WRONG_URL'
  | 'SERP_FEATURE_LOST'
  | 'SERP_FEATURE_GAINED'
  | 'COMPETITOR_OVERTAKE';

export type EvidenceState2 =
  | 'VERIFIED'
  | 'OBSERVED'
  | 'ESTIMATED'
  | 'UNAVAILABLE'
  | 'UNKNOWN';

/* ---------- normalization ---------- */

export function normalizeTrackedKeyword(
  value: unknown,
): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function normalizeCountry(
  value: unknown,
): string {
  const v = String(value ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : 'US';
}

export function normalizeLanguage(
  value: unknown,
): string {
  const v = String(value ?? '').trim().toLowerCase();
  return /^[a-z]{2}(-[a-z]{2})?$/.test(v) ? v : 'en';
}

export function normalizeDevice(
  value: unknown,
): TrackedDevice {
  const v = String(value ?? '').trim().toUpperCase();
  return v === 'MOBILE' ? 'MOBILE' : 'DESKTOP';
}

export function normalizeEngine(
  value: unknown,
): TrackEngine {
  return 'GOOGLE';
}

export function normalizeOrigin(
  value: unknown,
): KeywordOrigin | null {
  const v = String(value ?? '').trim().toUpperCase();
  if (
    v === 'MANUAL' ||
    v === 'GSC' ||
    v === 'KEYWORD_RESEARCH' ||
    v === 'STRATEGY' ||
    v === 'CUSTOMER_DEMAND'
  ) {
    return v;
  }
  return null;
}

/* ---------- position bands (§13) ----------
 * Bands, not scores. Null position with explicit
 * provider confirmation of absence = NOT_RANKING;
 * null without confirmation = UNKNOWN. */

export function positionBand(
  position: number | null,
  providerConfirmedAbsent: boolean,
): TrackedPositionBand {
  if (position === null || position === undefined) {
    return providerConfirmedAbsent
      ? 'NOT_RANKING'
      : 'UNKNOWN';
  }
  if (!Number.isFinite(position) || position < 1) {
    return 'UNKNOWN';
  }
  if (position <= 3) return 'TOP_3';
  if (position <= 10) return 'TOP_10';
  if (position <= 20) return 'TOP_20';
  if (position <= 50) return 'TOP_50';
  if (position <= 100) return 'TOP_100';
  return 'NOT_RANKING';
}

export function isStrikingDistance2(
  position: number | null,
): boolean {
  return (
    position !== null &&
    Number.isFinite(position) &&
    position >= 4 &&
    position <= 10
  );
}

/* ---------- movement (§14) ----------
 * Compares valid consecutive observations only.
 * previousExists=false means no prior valid
 * observation in the same tracking context. */

export function rankMovement2(input: {
  previous: number | null;
  current: number | null;
  previousExists: boolean;
  previousConfirmedAbsent: boolean;
  currentConfirmedAbsent: boolean;
}): RankMovement2 {
  const {
    previous,
    current,
    previousExists,
    previousConfirmedAbsent,
    currentConfirmedAbsent,
  } = input;
  /* Current unknown (provider could not determine):
   * never infer — always UNKNOWN. */
  if (current === null && !currentConfirmedAbsent) {
    return 'UNKNOWN';
  }
  /* Current confirmed absent from Top 100. */
  if (current === null && currentConfirmedAbsent) {
    if (!previousExists) return 'UNKNOWN';
    if (previous !== null) return 'DROPPED_OUT';
    /* Previously absent too, still absent: stable
     * non-ranking, not a new loss. */
    return 'STABLE';
  }
  /* Current has a valid position from here on. */
  if (
    current !== null &&
    (!previousExists ||
      (previous === null && !previousConfirmedAbsent))
  ) {
    return 'NEW';
  }
  if (
    current !== null &&
    previous === null &&
    previousConfirmedAbsent
  ) {
    return 'RETURNED';
  }
  if (previous !== null && current !== null) {
    if (current < previous) return 'GAINED';
    if (current > previous) return 'LOST';
    return 'STABLE';
  }
  return 'UNKNOWN';
}

/* ---------- delta (§15) ----------
 * Improvement old 10 → new 5 is +5 gained.
 * Direction is explicit; never confused with
 * business impact. */

export interface PositionDelta {
  delta: number | null;
  direction: 'GAINED' | 'LOST' | 'STABLE' | 'UNKNOWN';
  statement: string;
}

export function positionDelta(
  previous: number | null,
  current: number | null,
): PositionDelta {
  if (previous === null || current === null) {
    return {
      delta: null,
      direction: 'UNKNOWN',
      statement:
        'Insufficient consecutive observations — delta unknown, not zero.',
    };
  }
  const delta = previous - current;
  if (delta > 0) {
    return {
      delta,
      direction: 'GAINED',
      statement: `+${delta} position${delta === 1 ? '' : 's'} gained (${previous} → ${current}). Direction only — not business impact.`,
    };
  }
  if (delta < 0) {
    return {
      delta,
      direction: 'LOST',
      statement: `${delta} positions lost (${previous} → ${current}). Direction only — not business impact.`,
    };
  }
  return {
    delta: 0,
    direction: 'STABLE',
    statement: `Position unchanged at ${current} (observed).`,
  };
}

/* ---------- URL states (§18/§19) ---------- */

export function rankingUrlState(
  previousUrl: string | null,
  currentUrl: string | null,
  hasHistory: boolean,
): RankingUrlState {
  const prev = String(previousUrl ?? '').trim().toLowerCase();
  const curr = String(currentUrl ?? '').trim().toLowerCase();
  if (!hasHistory) return 'UNKNOWN';
  if (!prev && !curr) return 'NO_URL';
  if (!prev || !curr) return 'UNKNOWN';
  return prev === curr ? 'SAME_URL' : 'URL_CHANGED';
}

export function isRankingUrlChanged(
  state: RankingUrlState,
): boolean {
  return state === 'URL_CHANGED';
}

/* ---------- target URL (§21/§22) ---------- */

function urlsEqual(
  a: string | null,
  b: string | null,
): boolean {
  const x = String(a ?? '').trim().toLowerCase();
  const y = String(b ?? '').trim().toLowerCase();
  return x !== '' && x === y;
}

export function targetUrlState(input: {
  targetUrl: string | null;
  rankingUrl: string | null;
  position: number | null;
  providerConfirmedAbsent: boolean;
}): TargetUrlState {
  const { targetUrl, rankingUrl, position } = input;
  if (position === null && !input.providerConfirmedAbsent) {
    return 'UNKNOWN';
  }
  if (position === null && input.providerConfirmedAbsent) {
    return 'NOT_RANKING';
  }
  if (!targetUrl) return 'UNKNOWN';
  if (!rankingUrl) return 'UNKNOWN';
  return urlsEqual(targetUrl, rankingUrl)
    ? 'TARGET_RANKING'
    : 'OTHER_URL_RANKING';
}

export function isWrongUrlRanking(
  state: TargetUrlState,
): boolean {
  return state === 'OTHER_URL_RANKING';
}

/* ---------- SERP features (§23/§24) ---------- */

const KNOWN_SERP_FEATURES: SerpFeature[] = [
  'FEATURED_SNIPPET',
  'AI_OVERVIEW',
  'LOCAL_PACK',
  'VIDEO',
  'IMAGE_PACK',
  'PEOPLE_ALSO_ASK',
  'TOP_STORIES',
  'SHOPPING',
];

export function normalizeSerpFeatures(
  value: unknown,
): SerpFeature[] {
  if (!Array.isArray(value)) return [];
  const out: SerpFeature[] = [];
  for (const item of value) {
    const v = String(item ?? '').trim().toUpperCase();
    if (
      (KNOWN_SERP_FEATURES as string[]).includes(v) &&
      !out.includes(v as SerpFeature)
    ) {
      out.push(v as SerpFeature);
    }
  }
  return out;
}

export function featureOwnership(input: {
  feature: SerpFeature;
  observedFeatures: SerpFeature[];
  ownUrlCited: boolean | null;
  competitorUrlCited: boolean | null;
}): FeatureOwnership {
  if (!input.observedFeatures.includes(input.feature)) {
    return 'UNKNOWN';
  }
  if (input.ownUrlCited === true) return 'OWNED';
  if (input.competitorUrlCited === true)
    return 'COMPETITOR_OWNED';
  if (
    input.ownUrlCited === false ||
    input.competitorUrlCited === false
  ) {
    return 'PRESENT_NOT_OWNED';
  }
  return 'UNKNOWN';
}

/* ---------- AI overview / AI mode (§25/§26) ---------- */

export function aiOverviewState(
  observedFeatures: SerpFeature[],
  providerSupportsAi: boolean,
): AiOverviewState {
  if (!providerSupportsAi) return 'UNKNOWN';
  return observedFeatures.includes('AI_OVERVIEW')
    ? 'PRESENT'
    : 'NOT_OBSERVED';
}

export function aiModeState(input: {
  cited: boolean | null;
  mentioned: boolean | null;
  providerSupportsAi: boolean;
}): AiModeState {
  if (!input.providerSupportsAi) return 'UNKNOWN';
  if (input.cited === true) return 'AI_CITATION';
  if (input.mentioned === true) return 'AI_MENTION';
  if (
    input.cited === false &&
    input.mentioned === false
  ) {
    return 'AI_NOT_OBSERVED';
  }
  return 'UNKNOWN';
}

/* ---------- AI + Google divergence (§27) ---------- */

export function aiGoogleDivergence(input: {
  trackedPosition: number | null;
  aiOverview: AiOverviewState;
  aiMode: AiModeState;
}): AiGoogleDivergence {
  const googleStrong =
    input.trackedPosition !== null &&
    input.trackedPosition <= 10;
  const aiPresent =
    input.aiOverview === 'PRESENT' ||
    input.aiMode === 'AI_CITATION' ||
    input.aiMode === 'AI_MENTION';
  const aiUnknown =
    input.aiOverview === 'UNKNOWN' &&
    input.aiMode === 'UNKNOWN';
  if (aiUnknown) return 'UNKNOWN';
  if (googleStrong && aiPresent) return 'BOTH_STRONG';
  if (!googleStrong && !aiPresent) {
    const googleWeak =
      input.trackedPosition === null ||
      input.trackedPosition > 20;
    if (googleWeak) return 'BOTH_WEAK';
    return 'MIXED';
  }
  if (googleStrong && !aiPresent)
    return 'GOOGLE_STRONG_AI_WEAK';
  if (!googleStrong && aiPresent)
    return 'GOOGLE_WEAK_AI_STRONG';
  return 'MIXED';
}

/* ---------- GSC vs tracked (§28) ---------- */

export interface GscComparison {
  context: 'DIFFERENT_MEASUREMENT_CONTEXT';
  gscLabel: 'GSC POSITION';
  trackedLabel: 'TRACKED POSITION';
  statement: string;
}

export function compareGscToTracked(input: {
  gscPosition: number | null;
  trackedPosition: number | null;
}): GscComparison {
  return {
    context: 'DIFFERENT_MEASUREMENT_CONTEXT',
    gscLabel: 'GSC POSITION',
    trackedLabel: 'TRACKED POSITION',
    statement:
      'GSC position is an impression-weighted average over a window; tracked position is a point-in-time SERP observation. ' +
      `GSC POSITION ${input.gscPosition ?? 'unavailable'} vs TRACKED POSITION ${input.trackedPosition ?? 'unavailable'} — ` +
      'a difference is expected and is not automatically an error.',
  };
}

/* ---------- volatility (§34) ---------- */

export function describeVolatility(
  positions: Array<number | null>,
): RankVolatility {
  const valid = positions.filter(
    (p): p is number => p !== null && Number.isFinite(p),
  );
  if (valid.length < 3) return 'INSUFFICIENT_HISTORY';
  const range = Math.max(...valid) - Math.min(...valid);
  const moves = valid.slice(1).filter(
    (p, i) => p !== valid[i],
  ).length;
  if (range <= 2 && moves <= 1) return 'STABLE';
  if (range >= 10 || moves >= valid.length - 1)
    return 'HIGHLY_VARIABLE';
  return 'CHANGING';
}

/* ---------- tracking health (§63/§64) ---------- */

export function trackingHealth(input: {
  trackedCount: number;
  providerConfigured: boolean;
  lastRunStatus: TrackingRunStatus | null;
  lastRunAt: string | null;
  staleAfterHours: number;
  nowIso?: string;
}): TrackingHealth {
  if (input.trackedCount === 0) return 'NOT_CONFIGURED';
  if (!input.providerConfigured) return 'FAILED';
  if (input.lastRunStatus === 'FAILED') return 'FAILED';
  if (
    input.lastRunStatus === 'PARTIAL' ||
    input.lastRunStatus === 'QUEUED' ||
    input.lastRunStatus === 'RUNNING'
  ) {
    return 'PARTIAL';
  }
  if (!input.lastRunAt) return 'STALE';
  const now = new Date(
    input.nowIso ?? new Date().toISOString(),
  ).getTime();
  const last = new Date(input.lastRunAt).getTime();
  if (!Number.isFinite(last)) return 'STALE';
  const hours = (now - last) / (1000 * 60 * 60);
  if (hours > input.staleAfterHours) return 'STALE';
  return 'ACTIVE';
}

/* ---------- run aggregation (§38/§40) ---------- */

export function aggregateRunStatus(input: {
  total: number;
  succeeded: number;
  failed: number;
  providerUnavailable: boolean;
}): TrackingRunStatus {
  if (input.providerUnavailable) return 'FAILED';
  if (input.total === 0) return 'FAILED';
  if (input.failed === 0) return 'COMPLETED';
  if (input.succeeded === 0) return 'FAILED';
  return 'PARTIAL';
}

/* ---------- observation identity (§39) ---------- */

export function observationWindowKey(
  observedAtIso: string,
): string {
  const d = new Date(observedAtIso);
  if (Number.isNaN(d.getTime())) return 'UNKNOWN_WINDOW';
  return d.toISOString().slice(0, 10);
}

export function trackedKeywordIdentity(input: {
  organizationId: string;
  websiteId: string;
  keyword: string;
  country: string;
  language: string;
  device: TrackedDevice | string;
  searchEngine: string;
}): string {
  return [
    String(input.organizationId ?? '').trim(),
    String(input.websiteId ?? '').trim(),
    normalizeTrackedKeyword(input.keyword),
    normalizeCountry(input.country),
    normalizeLanguage(input.language),
    String(input.device ?? '')
      .trim()
      .toUpperCase(),
    String(input.searchEngine ?? '')
      .trim()
      .toUpperCase(),
  ].join('|');
}

/* ---------- alerts (§43/§44) ---------- */

export interface AlertCandidate {
  trigger: RankAlertTrigger;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
}

const NOISE_FLOOR_DESCRIPTION =
  'Single-position moves are not surfaced as wins or losses.';

/* Meaningful movement only: drops/gains of 3+
 * positions, band exits/entries, target-URL
 * replacement, SERP-feature ownership change,
 * or a competitor overtaking on the same keyword. */
export function buildAlertCandidates(input: {
  keyword: string;
  previous: number | null;
  current: number | null;
  previousUrl: string | null;
  currentUrl: string | null;
  targetUrl: string | null;
  previousFeatures: SerpFeature[];
  currentFeatures: SerpFeature[];
  competitorOvertook: boolean;
  competitorDomain: string | null;
}): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const { previous, current, keyword } = input;
  if (previous !== null && current !== null) {
    const delta = previous - current;
    if (delta <= -3) {
      out.push({
        trigger: 'POSITION_DROP',
        severity: current > 10 ? 'HIGH' : 'MEDIUM',
        title: `“${keyword}” dropped ${-delta} positions (${previous} → ${current}).`,
        description: `Tracked rank moved from #${previous} to #${current} (observed). Cause unknown — review page intent and competitive gap before acting.`,
      });
    } else if (delta >= 3) {
      out.push({
        trigger: 'POSITION_GAIN',
        severity: 'LOW',
        title: `“${keyword}” gained ${delta} positions (${previous} → ${current}).`,
        description: `Tracked rank improved from #${previous} to #${current} (observed outcome, not causal proof).`,
      });
    }
    if (previous <= 3 && current > 3) {
      out.push({
        trigger: 'TOP_3_EXIT',
        severity: 'HIGH',
        title: `“${keyword}” left the Top 3 (#${previous} → #${current}).`,
        description:
          'Priority keyword exited the Top 3 band (observed). Review before acting; cause unknown.',
      });
    }
    if (previous <= 10 && current > 10) {
      out.push({
        trigger: 'TOP_10_EXIT',
        severity: 'HIGH',
        title: `“${keyword}” left the Top 10 (#${previous} → #${current}).`,
        description:
          'Priority keyword exited the Top 10 band (observed). Review before acting; cause unknown.',
      });
    }
    if (previous > 10 && current <= 10) {
      out.push({
        trigger: 'TOP_10_ENTRY',
        severity: 'LOW',
        title: `“${keyword}” entered the Top 10 (#${previous} → #${current}).`,
        description:
          'Tracked keyword entered the Top 10 band (observed outcome).',
      });
    }
  }
  const urlState = rankingUrlState(
    input.previousUrl,
    input.currentUrl,
    input.previousUrl !== null ||
      input.currentUrl !== null,
  );
  if (urlState === 'URL_CHANGED' && input.targetUrl) {
    const targetStill =
      String(input.currentUrl ?? '')
        .trim()
        .toLowerCase() ===
      String(input.targetUrl ?? '')
        .trim()
        .toLowerCase();
    if (!targetStill) {
      out.push({
        trigger: 'WRONG_URL',
        severity: 'MEDIUM',
        title: `Wrong page ranking for “${keyword}”.`,
        description: `Target ${input.targetUrl} is not the ranking URL; ${input.currentUrl} ranks instead (observed). Check cannibalization, internal links, and Why-Not-#1.`,
      });
    }
  }
  const lost = input.previousFeatures.filter(
    (f) => !input.currentFeatures.includes(f),
  );
  const gained = input.currentFeatures.filter(
    (f) => !input.previousFeatures.includes(f),
  );
  for (const f of lost) {
    out.push({
      trigger: 'SERP_FEATURE_LOST',
      severity: 'MEDIUM',
      title: `SERP feature lost for “${keyword}”: ${f}.`,
      description: `Provider no longer observes ${f} on this SERP (observed change).`,
    });
  }
  for (const f of gained) {
    out.push({
      trigger: 'SERP_FEATURE_GAINED',
      severity: 'LOW',
      title: `SERP feature appeared for “${keyword}”: ${f}.`,
      description: `Provider now observes ${f} on this SERP (observed change).`,
    });
  }
  if (
    input.competitorOvertook &&
    input.competitorDomain
  ) {
    out.push({
      trigger: 'COMPETITOR_OVERTAKE',
      severity: 'MEDIUM',
      title: `${input.competitorDomain} moved ahead for “${keyword}”.`,
      description: `Competitor movement observed on the same SERP (observed). No causal claim — investigate before acting.`,
    });
  }
  return out;
}

export function noiseFloorNote(): string {
  return NOISE_FLOOR_DESCRIPTION;
}

/* ---------- competitor movement (§35) ---------- */

export function competitorMove(input: {
  competitorPrevious: number | null;
  competitorCurrent: number | null;
  competitorExists: boolean;
}): CompetitorMoveState {
  if (
    !input.competitorExists ||
    input.competitorCurrent === null
  ) {
    return 'UNKNOWN';
  }
  if (input.competitorPrevious === null) {
    return 'COMPETITOR_ENTERED';
  }
  if (
    input.competitorCurrent < input.competitorPrevious
  ) {
    return 'COMPETITOR_GAINED';
  }
  if (
    input.competitorCurrent > input.competitorPrevious
  ) {
    return 'COMPETITOR_DROPPED';
  }
  return 'COMPETITOR_STABLE';
}

/* ---------- honesty helpers (§78) ---------- */

export function honestyLabel(
  value: 'OBSERVED' | 'ESTIMATED' | 'INFERRED' | 'UNKNOWN',
): string {
  switch (value) {
    case 'OBSERVED':
      return 'What we know: OBSERVED.';
    case 'ESTIMATED':
      return 'Estimated — not observed. Labeled estimated everywhere.';
    case 'INFERRED':
      return 'Inferred — not observed. Interpretation only.';
    default:
      return 'Unknown — not zero, not a loss, not a rank.';
  }
}

/* GSC POSITION vs TRACKED POSITION labels (§4). */
export const GSC_POSITION_LABEL = 'GSC POSITION';
export const TRACKED_POSITION_LABEL =
  'TRACKED POSITION';

/* History sufficiency (§16/§17). */
export function historySufficiency(input: {
  observationCount: number;
  trackingStartedAt: string | null;
  oldestObservationAt: string | null;
}): 'SUFFICIENT' | 'TRACKING_STARTED' {
  if (
    input.observationCount >= 2 &&
    input.trackingStartedAt &&
    input.oldestObservationAt &&
    new Date(input.oldestObservationAt).getTime() >=
      new Date(input.trackingStartedAt).getTime()
  ) {
    return 'SUFFICIENT';
  }
  return 'TRACKING_STARTED';
}

/* Command-center signal copy (§71/§84): evidence +
 * unknowns + next action, never causal claims. */
export function investigationCopy(input: {
  keyword: string;
  previous: number | null;
  current: number | null;
  rankingUrl: string | null;
}): string {
  return (
    `Target page movement observed for “${input.keyword}”` +
    (input.previous !== null && input.current !== null
      ? ` (#${input.previous} → #${input.current})`
      : ' (positions partially unobserved)') +
    (input.rankingUrl
      ? ` on ${input.rankingUrl}.`
      : '.') +
    ' Evidence: tracked rank, ranking URL.' +
    ' What we know: OBSERVED.' +
    ' What we don’t know: CAUSE.' +
    ' Next best action: review page intent and competitive gap.'
  );
}

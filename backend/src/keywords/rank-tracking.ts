/*
 * =========================================================
 * RANK INTELLIGENCE 1.0 — pure functions (Phase 11).
 *
 * Persistent rank observations from three labeled
 * sources that are NEVER merged into one unexplained
 * number:
 * - GSC: VERIFIED impression-weighted average position
 *   over a window (never an exact SERP rank).
 * - SERP_PROVIDER: OBSERVED position in a fetched SERP.
 * - MANUAL: OBSERVED user-supplied position.
 *
 * Missing positions stay UNAVAILABLE (never zero).
 * Movement is OBSERVED OUTCOME, never causal proof.
 * LOST requires a prior observation in the same
 * source + context — never one empty response.
 * =========================================================
 */

import { createHash } from 'node:crypto';

export type RankSource =
  | 'GSC'
  | 'SERP_PROVIDER'
  | 'MANUAL';

export type RankEvidenceState =
  | 'VERIFIED'
  | 'OBSERVED'
  | 'INFERRED'
  | 'UNAVAILABLE';

export type RankingBand =
  | 'TOP_3'
  | 'TOP_10'
  | 'TOP_20'
  | 'TOP_100'
  | 'NOT_OBSERVED'
  | 'UNAVAILABLE';

export type RankMovement =
  | 'IMPROVED'
  | 'DECLINED'
  | 'UNCHANGED'
  | 'NEW'
  | 'LOST'
  | 'UNKNOWN';

export interface RankObservationInput {
  keyword: string;
  url: string | null;
  position: number | null;
  source: RankSource;
  engine?: string;
  country?: string;
  language?: string;
  device?: string;
  observedAt: string;
  impressions?: unknown;
  clicks?: unknown;
}

export interface NormalizedRank {
  keyword: string;
  normalizedKeyword: string;
  url: string | null;
  position: number | null;
  source: RankSource;
  engine: string;
  country: string;
  language: string;
  device: string;
  observedAt: string;
  impressions: number | null;
  clicks: number | null;
  evidenceState: RankEvidenceState;
  identityKey: string;
}

export function normalizeKeywordRank(
  value: unknown,
): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function cleanStr(value: unknown): string {
  return String(value ?? '').trim();
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function evidenceForSource(
  source: RankSource,
  position: number | null,
): RankEvidenceState {
  if (position === null) return 'UNAVAILABLE';
  return source === 'GSC' ? 'VERIFIED' : 'OBSERVED';
}

export function rankIdentityKey(input: {
  websiteId: string;
  keyword: string;
  url: string | null;
  source: RankSource;
  engine: string;
  country: string;
  language: string;
  device: string;
  observedAt: string;
}): string {
  return createHash('sha256')
    .update(
      [
        input.websiteId.trim(),
        normalizeKeywordRank(input.keyword),
        (input.url ?? '').trim().toLowerCase(),
        input.source,
        input.engine.toUpperCase(),
        input.country.toUpperCase(),
        input.language.toLowerCase(),
        input.device.toLowerCase(),
        input.observedAt,
      ].join('|'),
    )
    .digest('hex');
}

export function normalizeRankObservation(
  websiteId: string,
  input: RankObservationInput,
): NormalizedRank | null {
  const keyword = normalizeKeywordRank(input.keyword);
  if (!keyword) return null;
  const observed = new Date(input.observedAt);
  if (Number.isNaN(observed.getTime())) return null;
  const position =
    input.position === null ||
    input.position === undefined
      ? null
      : Math.floor(Number(input.position)) > 0
        ? Math.floor(Number(input.position))
        : null;
  const engine = cleanStr(input.engine).toUpperCase() || 'GOOGLE';
  const country = cleanStr(input.country).toUpperCase() || 'US';
  const language = cleanStr(input.language).toLowerCase() || 'en';
  const device = cleanStr(input.device).toLowerCase() || 'desktop';
  const url = cleanStr(input.url) || null;
  return {
    keyword: cleanStr(input.keyword),
    normalizedKeyword: keyword,
    url,
    position,
    source: input.source,
    engine,
    country,
    language,
    device,
    observedAt: observed.toISOString(),
    impressions: numOrNull(input.impressions),
    clicks: numOrNull(input.clicks),
    evidenceState: evidenceForSource(
      input.source,
      position,
    ),
    identityKey: rankIdentityKey({
      websiteId,
      keyword,
      url,
      source: input.source,
      engine,
      country,
      language,
      device,
      observedAt: observed.toISOString(),
    }),
  };
}

/* ---------- bands + movement ---------- */

export function rankingBand(
  position: number | null,
): RankingBand {
  if (position === null) return 'UNAVAILABLE';
  if (position <= 3) return 'TOP_3';
  if (position <= 10) return 'TOP_10';
  if (position <= 20) return 'TOP_20';
  if (position <= 100) return 'TOP_100';
  return 'NOT_OBSERVED';
}

export function isStrikingDistance(
  position: number | null,
): boolean {
  return (
    position !== null && position >= 4 && position <= 20
  );
}

/* LOST requires sustained absence, never a single
 * empty response: trailingNulls counts consecutive
 * null observations at the end of the window. One
 * trailing null stays UNKNOWN (could be a fetch gap);
 * two or more after a prior ranking is LOST. */
export function rankMovement(
  previous: number | null,
  current: number | null,
  previousExists: boolean,
  trailingNulls = 0,
): RankMovement {
  if (current === null) {
    if (
      previousExists &&
      previous !== null &&
      trailingNulls >= 2
    ) {
      return 'LOST';
    }
    return 'UNKNOWN';
  }
  if (previous === null || !previousExists) return 'NEW';
  if (current < previous) return 'IMPROVED';
  if (current > previous) return 'DECLINED';
  return 'UNCHANGED';
}

/* ---------- history stats ---------- */

export interface RankHistoryStats {
  keyword: string;
  url: string | null;
  source: RankSource;
  current: number | null;
  previous: number | null;
  change: number | null;
  movement: RankMovement;
  best: number | null;
  worst: number | null;
  firstObserved: string | null;
  lastObserved: string | null;
  observations: number;
  band: RankingBand;
  strikingDistance: boolean;
}

export function summarizeRankHistory(input: {
  keyword: string;
  source: RankSource;
  rows: Array<{
    position: number | null;
    url: string | null;
    observedAt: string;
  }>;
}): RankHistoryStats {
  const rows = [...input.rows].sort((a, b) =>
    a.observedAt < b.observedAt ? -1 : 1,
  );
  const ranked = rows.filter(
    (row) => row.position !== null,
  );
  /* Trailing nulls: consecutive missing observations
   * at the end of the window. Missing stays missing —
   * never interpolated, never zeroed. */
  let trailingNulls = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].position === null) trailingNulls++;
    else break;
  }
  /* Current is the latest observation when ranked;
   * trailing nulls mean the keyword is currently
   * unobserved (previous keeps the last seen rank so
   * LOST vs UNKNOWN can be decided honestly). */
  const lastRanked =
    ranked.length > 0
      ? ranked[ranked.length - 1].position
      : null;
  const current =
    trailingNulls > 0 ? null : lastRanked;
  const previous =
    trailingNulls > 0
      ? lastRanked
      : ranked.length > 1
        ? ranked[ranked.length - 2].position
        : null;
  const positions = ranked.map(
    (row) => row.position as number,
  );
  return {
    keyword: input.keyword,
    url:
      ranked.length > 0
        ? ranked[ranked.length - 1].url
        : null,
    source: input.source,
    current,
    previous,
    change:
      current !== null && previous !== null
        ? previous - current
        : null,
    movement: rankMovement(
      previous,
      current,
      ranked.length > 0,
      trailingNulls,
    ),
    best:
      positions.length > 0
        ? Math.min(...positions)
        : null,
    worst:
      positions.length > 0
        ? Math.max(...positions)
        : null,
    firstObserved:
      rows.length > 0 ? rows[0].observedAt : null,
    lastObserved:
      rows.length > 0
        ? rows[rows.length - 1].observedAt
        : null,
    observations: rows.length,
    band: rankingBand(current),
    strikingDistance: isStrikingDistance(current),
  };
}

/* ---------- URL switching ---------- */

export interface UrlSwitchSignal {
  switched: boolean;
  previousUrl: string | null;
  currentUrl: string | null;
  note: string;
}

export function detectUrlSwitch(
  previousUrl: string | null,
  currentUrl: string | null,
  hasHistory: boolean,
): UrlSwitchSignal {
  const prev = (previousUrl ?? '').toLowerCase();
  const curr = (currentUrl ?? '').toLowerCase();
  if (!hasHistory || !prev || !curr) {
    return {
      switched: false,
      previousUrl: previousUrl,
      currentUrl: currentUrl,
      note: 'Insufficient URL history.',
    };
  }
  if (prev === curr) {
    return {
      switched: false,
      previousUrl,
      currentUrl: curr,
      note: 'Ranking URL unchanged.',
    };
  }
  return {
    switched: true,
    previousUrl: prev,
    currentUrl: curr,
    note: 'Potential URL switching observed — same keyword now resolves to a different URL. Observed signal only; connect to existing diagnosis for interpretation.',
  };
}

/* ---------- change events ---------- */

export type RankChangeKind =
  | 'RANK_IMPROVED'
  | 'RANK_DECLINED'
  | 'RANK_NEW'
  | 'ENTERED_TOP_10'
  | 'LEFT_TOP_10'
  | 'ENTERED_STRIKING'
  | 'LEFT_STRIKING'
  | 'URL_CHANGED'
  | 'SUSTAINED_DECLINE'
  | 'SUSTAINED_IMPROVEMENT';

/* Deterministic noise gate: single-position moves
 * inside the top 3, or any move of exactly 1 outside
 * money bands, stay UNCHANGED-adjacent (no event). */
export function rankChangeEvents(input: {
  keyword: string;
  url: string | null;
  previous: number | null;
  current: number | null;
  previousExists: boolean;
  recent: Array<number | null>;
  urlSwitch: UrlSwitchSignal;
}): Array<{
  kind: RankChangeKind;
  statement: string;
}> {
  const events: Array<{
    kind: RankChangeKind;
    statement: string;
  }> = [];
  const { previous, current } = input;
  if (current === null) return events;
  if (previous === null || !input.previousExists) {
    events.push({
      kind: 'RANK_NEW',
      statement: `“${input.keyword}” newly observed at position ${current}.`,
    });
    return events;
  }
  const delta = previous - current;
  const crossedTop10 =
    previous > 10 && current <= 10
      ? 'ENTERED_TOP_10'
      : previous <= 10 && current > 10
        ? 'LEFT_TOP_10'
        : null;
  const crossedStriking =
    !isStrikingDistance(previous) &&
    isStrikingDistance(current)
      ? 'ENTERED_STRIKING'
      : isStrikingDistance(previous) &&
          !isStrikingDistance(current)
        ? 'LEFT_STRIKING'
        : null;
  if (delta >= 3 || crossedTop10 || crossedStriking) {
    events.push({
      kind:
        delta > 0 ? 'RANK_IMPROVED' : 'RANK_DECLINED',
      statement: `“${input.keyword}” moved from ${previous} to ${current} (observed).`,
    });
  }
  if (crossedTop10) {
    events.push({
      kind: crossedTop10,
      statement:
        crossedTop10 === 'ENTERED_TOP_10'
          ? `“${input.keyword}” entered the top 10 (observed ${current}).`
          : `“${input.keyword}” left the top 10 (observed ${current}).`,
    });
  }
  if (crossedStriking) {
    events.push({
      kind: crossedStriking,
      statement:
        crossedStriking === 'ENTERED_STRIKING'
          ? `“${input.keyword}” entered striking distance (4–20) at ${current}.`
          : `“${input.keyword}” left striking distance (now ${current}).`,
    });
  }
  if (input.urlSwitch.switched) {
    events.push({
      kind: 'URL_CHANGED',
      statement: `URL changed for “${input.keyword}”: ${input.urlSwitch.previousUrl} → ${input.urlSwitch.currentUrl} (observed).`,
    });
  }
  const trail = input.recent
    .filter((p): p is number => p !== null)
    .slice(-3);
  if (
    trail.length === 3 &&
    trail[0] < trail[1] &&
    trail[1] < trail[2]
  ) {
    events.push({
      kind: 'SUSTAINED_DECLINE',
      statement: `“${input.keyword}” declined across three consecutive observations (${trail.join(' → ')}).`,
    });
  }
  if (
    trail.length === 3 &&
    trail[0] > trail[1] &&
    trail[1] > trail[2]
  ) {
    events.push({
      kind: 'SUSTAINED_IMPROVEMENT',
      statement: `“${input.keyword}” improved across three consecutive observations (${trail.join(' → ')}).`,
    });
  }
  return events;
}

/* ---------- recommendation bridge (Phase 13) ----------
 *
 * Maps rank change events to EXISTING recommendation /
 * action kinds. No new taxonomy is introduced: every
 * value returned is a kind the Recommendation / Action
 * lifecycle already supports. Returns null when the
 * event carries no actionable direction on its own
 * (existing strategy / diagnosis decides instead).
 * Movement alone never proves causality — the bridge
 * routes to an existing path, it does not claim one. */

export type ExistingRankRecommendationKind =
  | 'IMPROVE_PAGE'
  | 'OPTIMIZE_PAGE'
  | 'CONSOLIDATE_PAGES'
  | 'PROTECT_PAGE'
  | 'MONITOR'
  | 'TRACK_KEYWORD';

export function rankEventToRecommendation(
  kind: RankChangeKind,
  current: number | null,
): ExistingRankRecommendationKind | null {
  switch (kind) {
    case 'RANK_DECLINED':
    case 'SUSTAINED_DECLINE':
    case 'LEFT_TOP_10':
      /* Ranking decline → existing IMPROVE path,
       * subject to strategy/diagnosis support. */
      return 'IMPROVE_PAGE';
    case 'ENTERED_STRIKING':
      /* Striking distance → existing optimization. */
      return 'OPTIMIZE_PAGE';
    case 'RANK_IMPROVED':
    case 'SUSTAINED_IMPROVEMENT':
    case 'ENTERED_TOP_10':
      /* Gains → existing monitor/protect path. */
      return 'PROTECT_PAGE';
    case 'RANK_NEW':
      return 'MONITOR';
    case 'URL_CHANGED':
      /* URL switching → existing consolidation /
       * diagnosis path where evidence supports it. */
      return 'CONSOLIDATE_PAGES';
    case 'LEFT_STRIKING':
      if (current !== null && current <= 3)
        return 'PROTECT_PAGE';
      if (current !== null && current > 20)
        return 'IMPROVE_PAGE';
      return null;
    default:
      return null;
  }
}

/* ---------- page profile ---------- */

export interface PageRankProfile {
  page: string;
  keywords: number;
  bestPosition: number | null;
  averagePosition: number | null;
  top3: number;
  top10: number;
  top20: number;
  top100: number;
  improved: string[];
  declined: string[];
  added: string[];
  lost: string[];
  urlSwitches: string[];
  gscClicks: number | null;
  gscImpressions: number | null;
  gscCtr: number | null;
}

export function composePageRankProfile(input: {
  page: string;
  stats: RankHistoryStats[];
  gsc?: {
    clicks: number | null;
    impressions: number | null;
    ctr: number | null;
  } | null;
}): PageRankProfile {
  const ranked = input.stats.filter(
    (stat) => stat.current !== null,
  );
  const positions = ranked.map(
    (stat) => stat.current as number,
  );
  return {
    page: input.page,
    keywords: input.stats.length,
    bestPosition:
      positions.length > 0
        ? Math.min(...positions)
        : null,
    averagePosition:
      positions.length > 0
        ? Math.round(
            (positions.reduce((a, b) => a + b, 0) /
              positions.length) *
              10,
          ) / 10
        : null,
    top3: ranked.filter(
      (stat) => (stat.current as number) <= 3,
    ).length,
    top10: ranked.filter(
      (stat) => (stat.current as number) <= 10,
    ).length,
    top20: ranked.filter(
      (stat) => (stat.current as number) <= 20,
    ).length,
    top100: ranked.filter(
      (stat) => (stat.current as number) <= 100,
    ).length,
    improved: input.stats
      .filter((stat) => stat.movement === 'IMPROVED')
      .map((stat) => stat.keyword),
    declined: input.stats
      .filter((stat) => stat.movement === 'DECLINED')
      .map((stat) => stat.keyword),
    added: input.stats
      .filter((stat) => stat.movement === 'NEW')
      .map((stat) => stat.keyword),
    lost: input.stats
      .filter((stat) => stat.movement === 'LOST')
      .map((stat) => stat.keyword),
    urlSwitches: [],
    gscClicks: input.gsc?.clicks ?? null,
    gscImpressions: input.gsc?.impressions ?? null,
    gscCtr: input.gsc?.ctr ?? null,
  };
}

/* ---------- measurement outcome ---------- */

export function measurementOutcome(input: {
  title: string;
  before: number | null;
  after: number | null;
}): string {
  if (input.before === null || input.after === null) {
    return `${input.title}: insufficient observations on one side of the action — outcome unknown, not zero.`;
  }
  if (input.after < input.before) {
    return `${input.title}: observed position improved from ${input.before} to ${input.after}. Observed outcome only — not causal proof the action caused it.`;
  }
  if (input.after > input.before) {
    return `${input.title}: observed position moved from ${input.before} to ${input.after} (declined) after the action. Observed outcome only.`;
  }
  return `${input.title}: observed position unchanged at ${input.after}.`;
}

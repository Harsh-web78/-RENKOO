/*
 * =========================================================
 * SEARCH EVERYWHERE INTELLIGENCE 1.0 — pure functions
 * (Phase 22).
 *
 * "Understand where your customers search."
 * CUSTOMER NEED → QUERY/TOPIC → SURFACE → VISIBILITY →
 * SOURCE/CITATION → COMPETITOR → PAGE → TRAFFIC/LEAD →
 * REVENUE. Unified evidence, never a universal score.
 *
 * Rules:
 * - A surface is observed only with actual evidence.
 * - NOT_OBSERVED is never NOT_VISIBLE; unchecked is
 *   UNKNOWN/UNAVAILABLE, never absence.
 * - No query-level AI Overview impressions invented:
 *   aggregates stay aggregate.
 * - Organic rank is never Maps rank; Bing never merges
 *   with Google; citations never become traffic.
 * - No causality across surfaces, no dominance claims,
 *   no authority inference from co-occurrence.
 * =========================================================
 */

export type SurfaceKey =
  | 'GOOGLE_SEARCH'
  | 'GOOGLE_AI_OVERVIEW'
  | 'GOOGLE_AI_MODE'
  | 'BING_SEARCH'
  | 'BING_AI'
  | 'CHATGPT'
  | 'PERPLEXITY'
  | 'GEMINI'
  | 'CLAUDE'
  | 'COPILOT'
  | 'LOCAL_SEARCH'
  | 'COMMUNITY_DISCOVERY';

export type SurfaceAvailability =
  | 'AVAILABLE'
  | 'CONNECTED'
  | 'OBSERVED'
  | 'MANUAL_IMPORT'
  | 'NOT_CONNECTED'
  | 'NOT_APPROVED'
  | 'UNAVAILABLE'
  | 'LIMITED_EVIDENCE';

export type SurfaceState =
  | 'VISIBLE'
  | 'NOT_OBSERVED'
  | 'UNAVAILABLE'
  | 'NOT_RELEVANT'
  | 'UNKNOWN';

export type BrandSignal = 'YES' | 'NO' | 'UNKNOWN';

export type CompetitorGapState =
  | 'COMPETITOR_VISIBLE_BRAND_NOT_OBSERVED'
  | 'COMPETITOR_CITED_BRAND_NOT_CITED'
  | 'BOTH_OBSERVED'
  | 'INSUFFICIENT_EVIDENCE';

export type PageSurfaceState =
  | 'MULTI_SURFACE_VISIBLE'
  | 'GOOGLE_ONLY_OBSERVED'
  | 'AI_ONLY_OBSERVED'
  | 'LIMITED_SURFACE_EVIDENCE'
  | 'INSUFFICIENT_EVIDENCE';

export type HistoryState =
  | 'GAINED'
  | 'LOST'
  | 'UNCHANGED'
  | 'UNKNOWN';

export type SurfaceOpportunity =
  | 'GOOGLE_VISIBILITY_GAP'
  | 'AI_VISIBILITY_GAP'
  | 'AI_CITATION_GAP'
  | 'LOCAL_VISIBILITY_GAP'
  | 'BING_VISIBILITY_GAP'
  | 'CROSS_SURFACE_GAP'
  | 'COMPETITOR_SURFACE_GAP'
  | 'SOURCE_COVERAGE_GAP'
  | 'COMMERCIAL_SURFACE_GAP'
  | 'MEASUREMENT_GAP';

export interface SurfaceDefinition {
  key: SurfaceKey;
  label: string;
  category: 'SEARCH' | 'AI' | 'LOCAL' | 'DISCOVERY';
  provider: string;
  observationType: string;
  availability: SurfaceAvailability;
  requiredIntegration: string;
  limitation: string;
}

export const SURFACE_REGISTRY: readonly SurfaceDefinition[] =
  [
    {
      key: 'GOOGLE_SEARCH',
      label: 'Google Search',
      category: 'SEARCH',
      provider: 'Google Search Console',
      observationType: 'VERIFIED demand rows + OBSERVED SERP cache',
      availability: 'AVAILABLE',
      requiredIntegration: 'GOOGLE_SEARCH_CONSOLE',
      limitation:
        'GSC and SERP cache are never merged into one rank.',
    },
    {
      key: 'GOOGLE_AI_OVERVIEW',
      label: 'Google AI Overviews',
      category: 'AI',
      provider: 'Official Google evidence',
      observationType: 'Aggregate official rows where provided',
      availability: 'LIMITED_EVIDENCE',
      requiredIntegration: 'GOOGLE_SEARCH_CONSOLE',
      limitation:
        'Aggregates stay aggregate; no fake query-level AI Overview impressions.',
    },
    {
      key: 'GOOGLE_AI_MODE',
      label: 'Google AI Mode',
      category: 'AI',
      provider: 'Official Google evidence',
      observationType: 'Separate only where the API exposes it',
      availability: 'UNAVAILABLE',
      requiredIntegration: 'GOOGLE_SEARCH_CONSOLE',
      limitation:
        'AI Mode visibility is never inferred from organic rankings.',
    },
    {
      key: 'BING_SEARCH',
      label: 'Bing Search',
      category: 'SEARCH',
      provider: 'Bing Webmaster',
      observationType: 'BING_VERIFIED where connected',
      availability: 'NOT_CONNECTED',
      requiredIntegration: 'BING_WEBMASTER',
      limitation: 'Bing rankings never merge with Google rankings.',
    },
    {
      key: 'BING_AI',
      label: 'Bing AI',
      category: 'AI',
      provider: 'Manual or official evidence',
      observationType: 'OBSERVED/MANUAL_IMPORT where rows exist',
      availability: 'UNAVAILABLE',
      requiredIntegration: 'BING_WEBMASTER',
      limitation:
        'No public AI Performance API is assumed; never scraped.',
    },
    {
      key: 'CHATGPT',
      label: 'ChatGPT',
      category: 'AI',
      provider: 'AI monitoring',
      observationType: 'OBSERVED executed prompts',
      availability: 'OBSERVED',
      requiredIntegration: 'AI_MONITORING',
      limitation:
        'Mention and citation only; no fake ranking or position.',
    },
    {
      key: 'PERPLEXITY',
      label: 'Perplexity',
      category: 'AI',
      provider: 'AI monitoring',
      observationType: 'OBSERVED where provider configured',
      availability: 'OBSERVED',
      requiredIntegration: 'AI_MONITORING',
      limitation: 'No scraping; no fake citation data.',
    },
    {
      key: 'GEMINI',
      label: 'Gemini',
      category: 'AI',
      provider: 'AI monitoring',
      observationType: 'OBSERVED executed prompts',
      availability: 'OBSERVED',
      requiredIntegration: 'AI_MONITORING',
      limitation: 'No invented visibility.',
    },
    {
      key: 'CLAUDE',
      label: 'Claude',
      category: 'AI',
      provider: 'AI monitoring',
      observationType: 'OBSERVED where provider available',
      availability: 'UNAVAILABLE',
      requiredIntegration: 'AI_MONITORING',
      limitation:
        'Unavailable providers are never fabricated or scraped.',
    },
    {
      key: 'COPILOT',
      label: 'Copilot',
      category: 'AI',
      provider: 'Bing AI evidence',
      observationType: 'OBSERVED where Bing AI rows exist',
      availability: 'UNAVAILABLE',
      requiredIntegration: 'BING_WEBMASTER',
      limitation:
        'Copilot data is never claimed from generic Bing rankings.',
    },
    {
      key: 'LOCAL_SEARCH',
      label: 'Local search',
      category: 'LOCAL',
      provider: 'Local intelligence',
      observationType: 'Local queries, SERP features, organic rank',
      availability: 'OBSERVED',
      requiredIntegration: 'GOOGLE_SEARCH_CONSOLE',
      limitation:
        'Organic rank is never labeled Maps rank; shown only where relevant.',
    },
    {
      key: 'COMMUNITY_DISCOVERY',
      label: 'Community and discovery',
      category: 'DISCOVERY',
      provider: 'Connected sources only',
      observationType: 'OBSERVED where official/import rows exist',
      availability: 'UNAVAILABLE',
      requiredIntegration: 'BACKLINK_PROVIDER',
      limitation:
        'No scrapers are built; unavailable without real evidence.',
    },
  ];

export function surfaceDefinition(
  key: SurfaceKey,
): SurfaceDefinition {
  const found = SURFACE_REGISTRY.find(
    (entry) => entry.key === key,
  );
  if (!found)
    throw new Error(`Unknown surface: ${String(key)}`);
  return found;
}

export const CANNOT_MEASURE: readonly string[] = [
  'Query-level AI Overview impressions are unavailable unless official data provides them.',
  'AI Mode query-level visibility is unavailable unless officially exposed.',
  'Bing AI performance has no public API; only manual or official rows count.',
  'Community and discovery surfaces are unavailable without connected evidence.',
  'AI citations never convert to traffic automatically.',
  'Causal links across surfaces are unavailable: co-observation is never causation.',
];

/* ---------- normalization (existing convention) ---------- */

export function normalizeSurfaceQuery(
  value: unknown,
): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/* Distinct variants must not auto-merge: identity keeps
 * full normalized text; callers join on exact equality. */
export function surfaceQueryKey(
  value: unknown,
): string {
  return normalizeSurfaceQuery(value);
}

/* ---------- coverage ---------- */

export interface SurfaceObservation {
  observed: boolean;
  checked: boolean;
  relevant: boolean;
  brandMention: BrandSignal;
  brandCited: BrandSignal;
  competitorPresent: boolean;
  lastObserved: string | null;
}

export function surfaceState(
  observation: SurfaceObservation,
): SurfaceState {
  if (!observation.relevant) return 'NOT_RELEVANT';
  if (observation.observed) return 'VISIBLE';
  if (!observation.checked) return 'UNKNOWN';
  return 'NOT_OBSERVED';
}

export function brandVisibility(
  mentions: number | null,
  citations: number | null,
  checked: boolean,
): { mention: BrandSignal; citation: BrandSignal } {
  if (!checked || (mentions === null && citations === null))
    return { mention: 'UNKNOWN', citation: 'UNKNOWN' };
  return {
    mention: (mentions ?? 0) > 0 ? 'YES' : 'NO',
    citation: (citations ?? 0) > 0 ? 'YES' : 'NO',
  };
}

/* ---------- competitor gaps ---------- */

export function competitorGap(
  brandObserved: boolean | null,
  brandCited: boolean | null,
  competitorObserved: boolean | null,
  competitorCited: boolean | null,
): CompetitorGapState {
  if (
    brandObserved === null ||
    competitorObserved === null
  )
    return 'INSUFFICIENT_EVIDENCE';
  if (
    competitorCited === true &&
    brandCited === false
  )
    return 'COMPETITOR_CITED_BRAND_NOT_CITED';
  if (
    competitorObserved &&
    !brandObserved
  )
    return 'COMPETITOR_VISIBLE_BRAND_NOT_OBSERVED';
  if (competitorObserved && brandObserved)
    return 'BOTH_OBSERVED';
  return 'INSUFFICIENT_EVIDENCE';
}

export function competitorGapStatement(): string {
  return (
    'Competitor was observed while the brand was not observed ' +
    'in the available sample. Never stated as dominance.'
  );
}

/* ---------- cross-surface sources ---------- */

export interface SourceSurfaceHit {
  domain: string;
  surfaces: SurfaceKey[];
  citations: number;
}

export function crossSurfaceSource(
  hit: SourceSurfaceHit,
): boolean {
  const unique = new Set(hit.surfaces);
  return unique.size >= 2 && hit.citations > 0;
}

export function sourceGap(
  competitorSourceObserved: boolean | null,
  ownSourceObserved: boolean | null,
): boolean {
  return (
    competitorSourceObserved === true &&
    ownSourceObserved === false
  );
}

/* ---------- page states ---------- */

export function pageSurfaceState(input: {
  google: boolean | null;
  ai: boolean | null;
  local: boolean | null;
  bing: boolean | null;
}): PageSurfaceState {
  const values = [input.google, input.ai, input.local, input.bing];
  if (values.every((value) => value === null))
    return 'INSUFFICIENT_EVIDENCE';
  const visible = values.filter(
    (value) => value === true,
  ).length;
  if (visible >= 2) return 'MULTI_SURFACE_VISIBLE';
  if (input.google === true && input.ai !== true)
    return 'GOOGLE_ONLY_OBSERVED';
  if (input.ai === true && input.google !== true)
    return 'AI_ONLY_OBSERVED';
  if (visible === 1) return 'LIMITED_SURFACE_EVIDENCE';
  return 'INSUFFICIENT_EVIDENCE';
}

/* ---------- history ---------- */

export function historyState(
  before: boolean | null,
  after: boolean | null,
): HistoryState {
  if (before === null || after === null) return 'UNKNOWN';
  if (before === after) return 'UNCHANGED';
  return after ? 'GAINED' : 'LOST';
}

/* ---------- opportunities → NBA (existing) ---------- */

export function mapSurfaceOpportunityToNba(
  opportunity: SurfaceOpportunity,
): string {
  switch (opportunity) {
    case 'GOOGLE_VISIBILITY_GAP':
      return 'IMPROVE_EXISTING_PAGE';
    case 'AI_VISIBILITY_GAP':
      return 'IMPROVE_AI_VISIBILITY';
    case 'AI_CITATION_GAP':
      return 'IMPROVE_AI_CITABILITY';
    case 'LOCAL_VISIBILITY_GAP':
      return 'IMPROVE_EXISTING_PAGE';
    case 'BING_VISIBILITY_GAP':
      return 'IMPROVE_EXISTING_PAGE';
    case 'CROSS_SURFACE_GAP':
      return 'CREATE_CONTENT';
    case 'COMPETITOR_SURFACE_GAP':
      return 'IMPROVE_EXISTING_PAGE';
    case 'SOURCE_COVERAGE_GAP':
      return 'CREATE_CONTENT';
    case 'COMMERCIAL_SURFACE_GAP':
      return 'IMPROVE_EXISTING_PAGE';
    case 'MEASUREMENT_GAP':
      return 'MONITOR_CHANGE';
    default:
      return 'MONITOR_CHANGE';
  }
}

/*
 * =========================================================
 * LOCAL SEARCH INTELLIGENCE 1.0 — pure functions
 * (Phase 19).
 *
 * "Own the searches that happen near your customer."
 * Evidence discipline (mandatory):
 * - No Local Score, no invented Maps rankings, no GBP
 *   metrics without a real integration (currently none),
 *   no scraped or invented reviews, no fake volumes.
 * - Organic rank is never labeled Maps position.
 * - NAP consistency is website-vs-stored-profile only,
 *   never claimed across the web.
 * - No evidence becomes UNAVAILABLE — never zero.
 * - Imported/tracked rows are OBSERVED/MANUAL, never
 *   VERIFIED. GSC rows are VERIFIED.
 * - Reuses ResearchIntent (LOCAL is existing); local
 *   context labels are descriptive only.
 * =========================================================
 */

export type LocalEvidenceState =
  | 'VERIFIED'
  | 'OBSERVED'
  | 'INFERRED'
  | 'ESTIMATED'
  | 'UNAVAILABLE';

export type NapState =
  | 'CONSISTENT'
  | 'INCONSISTENT'
  | 'PARTIAL'
  | 'UNAVAILABLE';

export type LocalRankLabel =
  | 'LOCAL_SERP_OBSERVED'
  | 'ORGANIC_LOCAL_QUERY'
  | 'LOCAL_PACK_RANK_UNAVAILABLE';

export type LocalSchemaState =
  | 'OBSERVED'
  | 'MISSING'
  | 'INVALID_INCOMPLETE'
  | 'UNAVAILABLE';

export type LocationPageQuality =
  | 'LOCATION_PAGE_STRONG'
  | 'LOCATION_PAGE_INCOMPLETE'
  | 'LOCATION_PAGE_MISSING'
  | 'LOCATION_PAGE_DUPLICATE_RISK'
  | 'LOCATION_PAGE_UNAVAILABLE';

export type LocalGap =
  | 'LOCAL_VISIBILITY_GAP'
  | 'LOCAL_COMPETITOR_OBSERVED'
  | 'LOCAL_PAGE_GAP'
  | 'LOCAL_SERVICE_AREA_GAP'
  | 'LOCAL_EVIDENCE_LIMITED';

export type LocalHealth =
  | 'STRONG'
  | 'WATCH'
  | 'NEEDS_ATTENTION'
  | 'UNAVAILABLE';

export type LocalOpportunityLabel =
  | 'LOCAL_CTR_GAP'
  | 'LOCAL_VISIBILITY_GAP'
  | 'LOCAL_PAGE_GAP'
  | 'LOCAL_SCHEMA_GAP'
  | 'LOCAL_BUSINESS_INFO_GAP'
  | 'LOCAL_SERVICE_AREA_GAP'
  | 'LOCAL_AI_VISIBILITY_GAP'
  | 'LOCAL_OUTCOME_MEASUREMENT_GAP';

export type LocalIntentContext =
  | 'LOCAL_TRANSACTIONAL'
  | 'LOCAL_COMMERCIAL'
  | 'LOCAL_RESEARCH'
  | 'LOCAL_NAVIGATIONAL'
  | 'LOCAL_INFORMATIONAL'
  | 'UNAVAILABLE';

export const GBP_UNAVAILABLE_NOTE =
  'RENKOO cannot currently verify Google Business Profile performance for this website.';

export const GBP_UNAVAILABLE_METRICS: readonly string[] = [
  'profile completeness',
  'profile views',
  'calls',
  'directions',
  'reviews',
  'local pack position',
  'GBP posts',
  'category',
  'attributes',
];

export const CANNOT_MEASURE: readonly string[] = [
  'Google Maps rankings are unavailable: organic rank is never labeled Maps position.',
  'Google Business Profile performance is unavailable: no live integration exists.',
  'Review counts, ratings, calls and directions are unavailable unless manually imported or a verified source exists.',
  'Local pack position is unavailable unless a verified local ranking source observes it.',
  'Call, lead, customer and revenue counts are never estimated from rankings.',
];

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function norm(value: unknown): string {
  return clean(value).toLowerCase();
}

/* ---------- business identity ---------- */

export interface BusinessIdentity {
  businessName: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  postalCode: string | null;
  category: string | null;
  services: string[];
  serviceAreas: string[];
}

export function identityCompleteness(
  identity: BusinessIdentity,
): 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE' {
  const present = [
    identity.businessName,
    identity.website,
    identity.phone,
    identity.address,
    identity.city,
    identity.country,
  ].filter((field) => clean(field).length > 0).length;
  if (present === 0) return 'UNAVAILABLE';
  if (
    clean(identity.businessName).length > 0 &&
    (clean(identity.phone).length > 0 ||
      clean(identity.address).length > 0) &&
    (clean(identity.city).length > 0 ||
      identity.serviceAreas.length > 0)
  )
    return 'COMPLETE';
  return 'PARTIAL';
}

/* ---------- NAP consistency (site vs stored) ---------- */

export function napConsistency(input: {
  brainName: string | null;
  brainPhone: string | null;
  brainAddress: string | null;
  siteName: string | null;
  sitePhone: string | null;
  siteAddress: string | null;
}): NapState {
  const pairs: Array<[string, string]> = [
    [clean(input.brainName), clean(input.siteName)],
    [clean(input.brainPhone), clean(input.sitePhone)],
    [clean(input.brainAddress), clean(input.siteAddress)],
  ];
  const comparable = pairs.filter(
    ([brain, site]) => brain.length > 0 && site.length > 0,
  );
  if (comparable.length === 0) return 'UNAVAILABLE';
  const matching = comparable.filter(
    ([brain, site]) => {
      if (norm(brain) === norm(site)) return true;
      /* Digit comparison only when both sides carry
       * digits — empty digit strings must never match. */
      const brainDigits = norm(brain).replace(/\D/g, '');
      const siteDigits = norm(site).replace(/\D/g, '');
      return (
        brainDigits.length > 0 &&
        brainDigits === siteDigits
      );
    },
  ).length;
  if (matching === comparable.length) return 'CONSISTENT';
  if (matching === 0) return 'INCONSISTENT';
  return 'PARTIAL';
}

export const NAP_SCOPE_NOTE =
  'Website business details match the stored business profile. Consistency across the wider web is not claimed.';

/* ---------- local query patterns ---------- */

export type LocalQueryPattern =
  | 'SERVICE_CITY'
  | 'SERVICE_NEIGHBORHOOD'
  | 'SERVICE_NEAR_ME'
  | 'CITY_SERVICE'
  | 'BEST_SERVICE_LOCATION'
  | 'SERVICE_AREA'
  | 'BRAND_LOCATION'
  | 'NON_LOCAL';

export function detectLocalPattern(
  query: string,
  locations: string[],
): {
  pattern: LocalQueryPattern;
  evidence: LocalEvidenceState;
} {
  const lowered = ` ${norm(query)} `;
  const areas = locations
    .map((location) => norm(location))
    .filter((location) => location.length > 1);
  const mentionsArea = areas.some(
    (area) =>
      area.length > 0 && lowered.includes(` ${area} `),
  );
  if (
    lowered.includes(' near me ') ||
    lowered.includes(' nearby ') ||
    lowered.includes(' close by ') ||
    lowered.includes(' in my area ')
  )
    return { pattern: 'SERVICE_NEAR_ME', evidence: 'INFERRED' };
  if (mentionsArea) {
    if (/\bbest\b/.test(lowered))
      return { pattern: 'BEST_SERVICE_LOCATION', evidence: 'INFERRED' };
    if (/^\s*[a-z][a-z\s]*\b/.test(lowered) && areas.some((area) => lowered.trimStart().startsWith(area)))
      return { pattern: 'CITY_SERVICE', evidence: 'INFERRED' };
    return { pattern: 'SERVICE_CITY', evidence: 'INFERRED' };
  }
  if (/\b(area|neighborhood|neighbourhood|district|suburb)\b/.test(lowered))
    return { pattern: 'SERVICE_AREA', evidence: 'INFERRED' };
  return { pattern: 'NON_LOCAL', evidence: 'UNAVAILABLE' };
}

/* ---------- local intent context (existing intent + place) ---------- */

export function localIntentContext(
  intent: unknown,
  hasLocationEvidence: boolean,
): LocalIntentContext {
  if (!hasLocationEvidence) return 'UNAVAILABLE';
  switch (norm(intent).toUpperCase()) {
    case 'TRANSACTIONAL':
      return 'LOCAL_TRANSACTIONAL';
    case 'COMMERCIAL':
    case 'COMPARISON':
    case 'ALTERNATIVES':
    case 'BUYER_RESEARCH':
      return 'LOCAL_COMMERCIAL';
    case 'NAVIGATIONAL':
      return 'LOCAL_NAVIGATIONAL';
    case 'INFORMATIONAL':
      return 'LOCAL_INFORMATIONAL';
    case 'LOCAL':
      return 'LOCAL_RESEARCH';
    default:
      return 'LOCAL_RESEARCH';
  }
}

/* ---------- rank labeling (never Maps) ---------- */

export function localRankLabel(input: {
  hasLocalSerpObservation: boolean;
  hasOrganicRank: boolean;
}): LocalRankLabel {
  if (input.hasLocalSerpObservation)
    return 'LOCAL_SERP_OBSERVED';
  if (input.hasOrganicRank) return 'ORGANIC_LOCAL_QUERY';
  return 'LOCAL_PACK_RANK_UNAVAILABLE';
}

/* ---------- schema detection over parsed JSON-LD ---------- */

export interface SchemaSignals {
  hasLocalBusiness: boolean;
  hasOrganization: boolean;
  hasPostalAddress: boolean;
  hasGeo: boolean;
  hasOpeningHours: boolean;
  hasSameAs: boolean;
  parseable: boolean;
}

export function schemaState(
  signals: SchemaSignals,
  hasCrawl: boolean,
): LocalSchemaState {
  if (!hasCrawl) return 'UNAVAILABLE';
  if (!signals.parseable) return 'INVALID_INCOMPLETE';
  const hits = [
    signals.hasLocalBusiness,
    signals.hasOrganization,
    signals.hasPostalAddress,
    signals.hasGeo,
    signals.hasOpeningHours,
    signals.hasSameAs,
  ].filter(Boolean).length;
  if (hits === 0) return 'MISSING';
  if (
    (signals.hasLocalBusiness || signals.hasOrganization) &&
    signals.hasPostalAddress
  )
    return 'OBSERVED';
  return 'INVALID_INCOMPLETE';
}

export function extractSchemaSignals(
  entries: unknown[],
): SchemaSignals {
  const signals: SchemaSignals = {
    hasLocalBusiness: false,
    hasOrganization: false,
    hasPostalAddress: false,
    hasGeo: false,
    hasOpeningHours: false,
    hasSameAs: false,
    parseable: false,
  };
  let seen = false;
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    seen = true;
    const record = node as Record<string, unknown>;
    const types = Array.isArray(record['@type'])
      ? (record['@type'] as unknown[]).map((type) =>
          norm(type),
        )
      : [norm(record['@type'])];
    if (
      types.some(
        (type) =>
          type === 'localbusiness' ||
          type.endsWith('localbusiness') ||
          /^(dentist|plumber|restaurant|hotel|store|physician|attorney|realestateagent|homeandconstructionbusiness)/.test(
            type,
          ),
      )
    )
      signals.hasLocalBusiness = true;
    if (types.includes('organization'))
      signals.hasOrganization = true;
    if (types.includes('postaladdress'))
      signals.hasPostalAddress = true;
    if (
      types.includes('geocoordinates') ||
      record.geo !== undefined
    )
      signals.hasGeo = true;
    if (
      types.includes('openinghoursspecification') ||
      record.openingHours !== undefined ||
      record.openingHoursSpecification !== undefined
    )
      signals.hasOpeningHours = true;
    if (
      record.sameAs !== undefined &&
      ((Array.isArray(record.sameAs) &&
        record.sameAs.length > 0) ||
        clean(record.sameAs).length > 0)
    )
      signals.hasSameAs = true;
    for (const value of Object.values(record)) visit(value);
  };
  try {
    visit(entries);
    signals.parseable = seen;
  } catch {
    signals.parseable = false;
  }
  return signals;
}

/* ---------- location pages ---------- */

export function isLocationPageUrl(
  url: string,
  locations: string[],
): boolean {
  const lowered = norm(url);
  if (/\/locations?\//.test(lowered)) return true;
  if (/\/service-areas?\//.test(lowered)) return true;
  if (/\/areas?-(we-)?serve/.test(lowered)) return true;
  return locations
    .map((location) => norm(location))
    .filter((location) => location.length > 2)
    .some((location) =>
      lowered
        .split(/[^a-z]+/)
        .includes(location.replace(/[^a-z]+/g, '')),
    );
}

export function locationPageQuality(input: {
  hasPage: boolean;
  hasContent: boolean | null;
  hasBusinessInfo: boolean | null;
  duplicateRiskEvidence: boolean;
  hasEvidence: boolean;
}): LocationPageQuality {
  if (!input.hasEvidence) return 'LOCATION_PAGE_UNAVAILABLE';
  if (!input.hasPage) return 'LOCATION_PAGE_MISSING';
  /* Duplicate risk only with evidence — never assumed. */
  if (input.duplicateRiskEvidence)
    return 'LOCATION_PAGE_DUPLICATE_RISK';
  if (
    input.hasContent === true &&
    input.hasBusinessInfo === true
  )
    return 'LOCATION_PAGE_STRONG';
  return 'LOCATION_PAGE_INCOMPLETE';
}

/* ---------- service areas ---------- */

export interface ServiceAreaRow {
  service: string;
  location: string;
  hasPage: boolean;
  observedDemand: boolean;
  hasRanking: boolean;
  hasOutcome: boolean;
}

export function serviceAreaGap(
  row: ServiceAreaRow,
): 'SUPPORTED' | 'MISSING_PAGE' | 'WEAK_VISIBILITY' | 'UNAVAILABLE' {
  if (!row.service || !row.location) return 'UNAVAILABLE';
  if (!row.hasPage && row.observedDemand)
    return 'MISSING_PAGE';
  if (row.hasPage && row.observedDemand && !row.hasRanking)
    return 'WEAK_VISIBILITY';
  if (row.hasPage) return 'SUPPORTED';
  return 'UNAVAILABLE';
}

/* ---------- health ---------- */

export function localHealthOf(input: {
  strong: number;
  watch: number;
  risk: number;
  hasEvidence: boolean;
}): LocalHealth {
  if (!input.hasEvidence) return 'UNAVAILABLE';
  if (input.risk >= 1) return 'NEEDS_ATTENTION';
  if (input.watch >= 1) return 'WATCH';
  if (input.strong >= 1) return 'STRONG';
  return 'WATCH';
}

/* ---------- opportunity → NBA mapping (existing) ---------- */

export function mapLocalOpportunityToNba(
  label: LocalOpportunityLabel,
): string {
  switch (label) {
    case 'LOCAL_PAGE_GAP':
      return 'CREATE_CONTENT';
    case 'LOCAL_CTR_GAP':
      return 'IMPROVE_EXISTING_PAGE';
    case 'LOCAL_VISIBILITY_GAP':
      return 'IMPROVE_EXISTING_PAGE';
    case 'LOCAL_SCHEMA_GAP':
      return 'FIX_TECHNICAL';
    case 'LOCAL_BUSINESS_INFO_GAP':
      return 'FIX_TECHNICAL';
    case 'LOCAL_SERVICE_AREA_GAP':
      return 'CREATE_CONTENT';
    case 'LOCAL_AI_VISIBILITY_GAP':
      return 'IMPROVE_AI_VISIBILITY';
    case 'LOCAL_OUTCOME_MEASUREMENT_GAP':
      return 'MONITOR_CHANGE';
    default:
      return 'MONITOR_CHANGE';
  }
}

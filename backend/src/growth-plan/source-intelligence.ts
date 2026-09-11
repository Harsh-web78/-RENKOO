/*
 * =========================================================
 * AI SOURCE & BRAND AUTHORITY INTELLIGENCE 1.0 — pure
 * functions (Phase 39).
 *
 * Source intelligence over observed citations: which
 * external sources shape search/AI decisions, where
 * our brand is absent, where competitors appear, and
 * which source opportunities to investigate.
 *
 * Non-negotiable:
 * - No Authority/Trust/Influence/PR/Backlink scores,
 *   no recommendation probability, no win probability.
 * - Source presence is never source influence.
 *   Citation is never recommendation. Frequency is
 *   never authority. Visibility is never traffic.
 *   Traffic is never revenue. Observation is never
 *   causation.
 * - Ambiguous domains stay OTHER/UNKNOWN — never
 *   over-classified.
 * - No outreach automation of any kind.
 * - Unknowns stay unknown.
 * =========================================================
 */

import { createHash } from 'node:crypto';

export type SourceType =
  | 'FIRST_PARTY'
  | 'EDITORIAL'
  | 'REVIEW'
  | 'COMMUNITY'
  | 'FORUM'
  | 'DIRECTORY'
  | 'MARKETPLACE'
  | 'SOCIAL'
  | 'INDUSTRY_PUBLICATION'
  | 'COMPARISON'
  | 'RESEARCH'
  | 'GOVERNMENT'
  | 'ACADEMIC'
  | 'OTHER'
  | 'UNKNOWN';

export type SourcePresence =
  | 'OUR_SOURCE_PRESENT'
  | 'OUR_SOURCE_ABSENT'
  | 'COMPETITOR_SOURCE_PRESENT'
  | 'COMPETITOR_SOURCE_ABSENT'
  | 'SHARED_SOURCE'
  | 'UNKNOWN';

export type SourceGapKind =
  | 'MISSING_REVIEW_SOURCE'
  | 'MISSING_COMPARISON_SOURCE'
  | 'MISSING_EDITORIAL_SOURCE'
  | 'MISSING_COMMUNITY_SOURCE'
  | 'MISSING_INDUSTRY_SOURCE'
  | 'MISSING_DIRECTORY_SOURCE'
  | 'MISSING_RESEARCH_SOURCE'
  | 'COMPETITOR_SOURCE_ADVANTAGE'
  | 'SHARED_SOURCE_UNDERUTILIZED'
  | 'SOURCE_FRESHNESS_GAP'
  | 'SOURCE_CLAIM_GAP';

export type SourceOpportunity =
  | 'INVESTIGATE_SOURCE'
  | 'UPDATE_EXISTING_SOURCE'
  | 'PURSUE_SOURCE'
  | 'DEFEND_SOURCE'
  | 'EXPAND_SOURCE_COVERAGE'
  | 'VALIDATE_SOURCE'
  | 'REVIEW_SOURCE'
  | 'COMMUNITY_SOURCE'
  | 'EDITORIAL_SOURCE'
  | 'COMPARISON_SOURCE';

export type SourceTrust =
  | 'SUPPORTED'
  | 'PARTIALLY_SUPPORTED'
  | 'CONFLICTING'
  | 'STALE'
  | 'UNSUPPORTED'
  | 'UNKNOWN';

export const SOURCE_TYPES: SourceType[] = [
  'FIRST_PARTY',
  'EDITORIAL',
  'REVIEW',
  'COMMUNITY',
  'FORUM',
  'DIRECTORY',
  'MARKETPLACE',
  'SOCIAL',
  'INDUSTRY_PUBLICATION',
  'COMPARISON',
  'RESEARCH',
  'GOVERNMENT',
  'ACADEMIC',
  'OTHER',
  'UNKNOWN',
];

export const SOURCE_GAPS: SourceGapKind[] = [
  'MISSING_REVIEW_SOURCE',
  'MISSING_COMPARISON_SOURCE',
  'MISSING_EDITORIAL_SOURCE',
  'MISSING_COMMUNITY_SOURCE',
  'MISSING_INDUSTRY_SOURCE',
  'MISSING_DIRECTORY_SOURCE',
  'MISSING_RESEARCH_SOURCE',
  'COMPETITOR_SOURCE_ADVANTAGE',
  'SHARED_SOURCE_UNDERUTILIZED',
  'SOURCE_FRESHNESS_GAP',
  'SOURCE_CLAIM_GAP',
];

export const SOURCE_OPPORTUNITIES: SourceOpportunity[] = [
  'INVESTIGATE_SOURCE',
  'UPDATE_EXISTING_SOURCE',
  'PURSUE_SOURCE',
  'DEFEND_SOURCE',
  'EXPAND_SOURCE_COVERAGE',
  'VALIDATE_SOURCE',
  'REVIEW_SOURCE',
  'COMMUNITY_SOURCE',
  'EDITORIAL_SOURCE',
  'COMPARISON_SOURCE',
];

export const MAX_SOURCES = 100;
export const MAX_SOURCE_OPPORTUNITIES = 5;
export const MAX_COMPETITORS = 10;

/* ---------- classification (§3) ----------
 * Conservative patterns only. Anything ambiguous is
 * OTHER (known domain, unclear role) or UNKNOWN
 * (unparseable). Never over-classified. */

interface TypeRule {
  type: SourceType;
  patterns: RegExp[];
}

const RULES: TypeRule[] = [
  {
    type: 'REVIEW',
    patterns: [
      /g2\.com|capterra|trustpilot|clutch\.co|trustradius|gartner\.com\/reviews|testimonial/i,
      /glassdoor/i,
      /goodfirms|sourceforge|slashdot/i,
    ],
  },
  {
    type: 'COMPARISON',
    patterns: [/\/compare|\bvs\b|versus|best-.*-for|top-\d+|\balternatives?\b/i],
  },
  {
    type: 'COMMUNITY',
    patterns: [/reddit\.com|quora\.com|stackexchange|stackoverflow|discord|community\./i],
  },
  {
    type: 'FORUM',
    patterns: [/\/forum|\/forums|\/thread|\/topic\/|discourse/i],
  },
  {
    type: 'DIRECTORY',
    patterns: [/yelp|yellowpages|pagesjaunes|kompass|crunchbase|linkedin\.com\/company|trustpilot\/review/i, /directory/i],
  },
  {
    type: 'MARKETPLACE',
    patterns: [/amazon\.|ebay\.|etsy\.|walmart\.|aliexpress|shopify\.com\/store/i, /apps?\.apple|play\.google/i],
  },
  {
    type: 'SOCIAL',
    patterns: [/twitter\.com|x\.com\/|facebook\.com|instagram\.com|linkedin\.com\/(posts|feed)|tiktok\.com|youtube\.com\/(watch|shorts)/i],
  },
  {
    type: 'GOVERNMENT',
    patterns: [/\.gov(\.|$|\/)|data\.gouv\.fr|annuaire-entreprises/i],
  },
  {
    type: 'ACADEMIC',
    patterns: [/\.edu(\.|$|\/)|arxiv\.org|scholar\.google|researchgate|nih\.gov|pubmed/i],
  },
  {
    type: 'RESEARCH',
    patterns: [/gartner\.com|forrester|idc\.com|statista|mckinsey|bain|bcg\.com|deloitte|pwc|ey\.com|kpmg/i, /pewresearch|emarketer|insiderintelligence/i],
  },
  {
    type: 'INDUSTRY_PUBLICATION',
    patterns: [/techcrunch|theverge|wired\.com|forbes\.com|businessinsider|bloomberg|reuters|apnews|bbc\./i, /searchengineland|searchenginejournal|martech/i],
  },
  {
    type: 'EDITORIAL',
    patterns: [/nytimes|washingtonpost|theguardian|medium\.com|substack|blog\./i, /\bnews\b|\bpress\b|\btimes\b|\bjournal\b|\btribune\b|\bherald\b/i],
  },
];

export function domainOf(url: unknown): string | null {
  try {
    const u = new URL(String(url ?? ''));
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function classifySource(input: {
  url: string | null;
  ownHosts: string[];
}): SourceType {
  if (!input.url) return 'UNKNOWN';
  const host = domainOf(input.url);
  if (!host) return 'UNKNOWN';
  const normalized = host.toLowerCase();
  for (const own of input.ownHosts) {
    const o = String(own ?? '').toLowerCase().replace(/^www\./, '');
    if (o !== '' && (normalized === o || normalized.endsWith(`.${o}`))) {
      return 'FIRST_PARTY';
    }
  }
  const hay = `${host} ${String(input.url)}`;
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(hay))) {
      return rule.type;
    }
  }
  /* Known domain but unclear role — OTHER, never a
   * guessed specific type. */
  return 'OTHER';
}

/* ---------- presence (§5/§7/§8/§9) ---------- */

export function sourcePresence(input: {
  brandPresent: boolean | null;
  competitorPresent: boolean | null;
}): SourcePresence {
  const { brandPresent, competitorPresent } = input;
  if (brandPresent === true && competitorPresent === true) {
    return 'SHARED_SOURCE';
  }
  if (brandPresent === true && competitorPresent === false) {
    return 'OUR_SOURCE_PRESENT';
  }
  if (brandPresent === false && competitorPresent === true) {
    return 'COMPETITOR_SOURCE_PRESENT';
  }
  if (brandPresent === false && competitorPresent === false) {
    return 'COMPETITOR_SOURCE_ABSENT';
  }
  if (brandPresent === false) return 'OUR_SOURCE_ABSENT';
  return 'UNKNOWN';
}

export function presenceNote(
  presence: SourcePresence,
): string {
  switch (presence) {
    case 'SHARED_SOURCE':
      return 'SHARED_SOURCE — both appear. Often more actionable than new sources. Presence says nothing about sentiment.';
    case 'OUR_SOURCE_PRESENT':
      return 'OUR_ONLY_SOURCE — existing authority/source presence. Connect to citation and outcomes.';
    case 'COMPETITOR_SOURCE_PRESENT':
      return 'COMPETITOR_ONLY_SOURCE — observed where a competitor appears and we do not. Never claimed as the cause of advantage.';
    case 'OUR_SOURCE_ABSENT':
      return 'Our brand absent from this observed source.';
    case 'COMPETITOR_SOURCE_ABSENT':
      return 'No competitor observed on this source.';
    default:
      return 'UNKNOWN — presence could not be established from observed evidence.';
  }
}

/* ---------- diversity (§10, descriptive only) ---------- */

export function diversityDistribution(
  types: SourceType[],
): Array<{ type: SourceType; count: number }> {
  const counts = new Map<SourceType, number>();
  for (const t of types) {
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || (a.type < b.type ? -1 : 1));
}

export function diversityNote(
  distribution: Array<{ type: SourceType; count: number }>,
): string {
  if (distribution.length === 0) {
    return 'No observed sources — distribution unavailable.';
  }
  const parts = distribution.map((d) => `${d.type}: ${d.count}`);
  return `Observed source mix — ${parts.join(', ')}. Descriptive counts only, never a diversity score.`;
}

/* ---------- freshness (§12) ---------- */

export function freshnessCompare(input: {
  oursIso: string | null;
  competitorIso: string | null;
}): 'FRESHER_COMPETITOR_SOURCE' | 'OUR_SOURCE_FRESHER' | 'FRESHNESS_UNKNOWN' | 'NO_MATERIAL_DIFFERENCE' {
  const ours = input.oursIso ? new Date(input.oursIso).getTime() : NaN;
  const comp = input.competitorIso
    ? new Date(input.competitorIso).getTime()
    : NaN;
  if (!Number.isFinite(ours) || !Number.isFinite(comp)) {
    return 'FRESHNESS_UNKNOWN';
  }
  const days = (ours - comp) / (24 * 60 * 60 * 1000);
  if (days < -180) return 'FRESHER_COMPETITOR_SOURCE';
  if (days > 180) return 'OUR_SOURCE_FRESHER';
  return 'NO_MATERIAL_DIFFERENCE';
}

/* ---------- frequency (§22, never authority) ---------- */

export function frequencyNote(
  domain: string,
  count: number,
  windows: number,
): string {
  if (count <= 1) {
    return `${domain} observed once — single observation, no frequency claim.`;
  }
  return `OBSERVED_SOURCE_RECURRING: ${domain} in ${count}/${windows} observed windows. Recurrence is not influence and never called authority.`;
}

/* ---------- conflicts + trust (§23/§24) ---------- */

export function conflictNote(a: string, b: string): string {
  return `CONFLICTING_SOURCE_EVIDENCE: source A says ${a}; source B says ${b}. Phase 25 conflict semantics apply.`;
}

export function trustFor(input: {
  supported: boolean;
  contradicted: boolean;
  stale: boolean;
  observed: boolean;
}): SourceTrust {
  if (!input.observed) return 'UNKNOWN';
  if (input.contradicted) return 'CONFLICTING';
  if (input.stale) return 'STALE';
  if (input.supported) return 'SUPPORTED';
  return 'PARTIALLY_SUPPORTED';
}

/* ---------- gap categories (§11) ---------- */

const GAP_BY_MISSING_TYPE: Partial<Record<SourceType, string>> = {
  REVIEW: 'MISSING_REVIEW_SOURCE',
  COMPARISON: 'MISSING_COMPARISON_SOURCE',
  EDITORIAL: 'MISSING_EDITORIAL_SOURCE',
  COMMUNITY: 'MISSING_COMMUNITY_SOURCE',
  INDUSTRY_PUBLICATION: 'MISSING_INDUSTRY_SOURCE',
  DIRECTORY: 'MISSING_DIRECTORY_SOURCE',
  RESEARCH: 'MISSING_RESEARCH_SOURCE',
};

export function gapForMissingType(
  type: SourceType,
): string | null {
  return GAP_BY_MISSING_TYPE[type] ?? null;
}

/* ---------- opportunities (§19, labels only) ---------- */

export function opportunityFor(input: {
  presence: SourcePresence;
  freshness: string;
  claimGap: boolean;
  hasWork: boolean;
}): string {
  if (input.hasWork) return 'VALIDATE_SOURCE';
  switch (input.presence) {
    case 'COMPETITOR_SOURCE_PRESENT':
      return 'INVESTIGATE_SOURCE';
    case 'SHARED_SOURCE':
      return input.freshness === 'FRESHER_COMPETITOR_SOURCE'
        ? 'UPDATE_EXISTING_SOURCE'
        : 'EXPAND_SOURCE_COVERAGE';
    case 'OUR_SOURCE_PRESENT':
      return 'DEFEND_SOURCE';
    case 'OUR_SOURCE_ABSENT':
      return input.claimGap ? 'PURSUE_SOURCE' : 'REVIEW_SOURCE';
    default:
      return 'INVESTIGATE_SOURCE';
  }
}

/* ---------- identity ---------- */

export function sourceFingerprint(input: {
  organizationId: string;
  websiteId: string;
  domain: string;
  target: string;
}): string {
  return createHash('sha256')
    .update(
      [
        String(input.organizationId ?? '').trim(),
        String(input.websiteId ?? '').trim(),
        String(input.domain ?? '').trim().toLowerCase(),
        String(input.target ?? '').trim().toLowerCase(),
      ].join('|'),
    )
    .digest('hex')
    .slice(0, 32);
}

/* ---------- agency wording (§35) ---------- */

export function agencySourceSummary(input: {
  observed: string[];
  competitors: string[];
  ours: string[];
  unknown: string[];
  investigate: string[];
}): string[] {
  return [
    `WHAT WE OBSERVED: ${input.observed.length > 0 ? input.observed.join('; ') : 'no observed sources'}.`,
    `WHERE COMPETITORS APPEAR: ${input.competitors.length > 0 ? input.competitors.join('; ') : 'no observed competitor sources'}.`,
    `WHERE WE APPEAR: ${input.ours.length > 0 ? input.ours.join('; ') : 'no observed own sources'}.`,
    `WHAT IS UNKNOWN: ${input.unknown.length > 0 ? input.unknown.join('; ') : 'nothing material'}.`,
    `WHAT WE SHOULD INVESTIGATE: ${input.investigate.length > 0 ? input.investigate.join('; ') : 'nothing prioritized'}.`,
  ];
}

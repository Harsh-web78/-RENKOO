/*
 * =========================================================
 * AUTHORITY + BACKLINK INTELLIGENCE 1.0 — pure functions
 * (Phase 18).
 *
 * Evidence discipline (mandatory):
 * - RENKOO builds no backlink index, invents no DR/DA/UR,
 *   Authority Score, backlink totals, link equity, ranking
 *   probability, or toxicity scores.
 * - CrawlLink (internal edges) is never a backlink index.
 * - Outgoing links observed on customer sites are not
 *   incoming backlinks.
 * - "Not observed" never becomes "does not exist".
 * - Imported data is OBSERVED/MANUAL_IMPORT, never
 *   VERIFIED. Imported sets are never complete.
 * - nofollow is not useless; dofollow is not valuable.
 * - Links never cause rankings in RENKOO copy: observed
 *   alongside only.
 * =========================================================
 */

export type AuthoritySourceType =
  | 'FIRST_PARTY_LINKS'
  | 'OBSERVED_CRAWL'
  | 'MANUAL_IMPORT'
  | 'EXTERNAL_PROVIDER'
  | 'UNAVAILABLE';

export type AuthorityEvidenceState =
  | 'VERIFIED'
  | 'OBSERVED'
  | 'INFERRED'
  | 'ESTIMATED'
  | 'UNAVAILABLE';

export type BacklinkState =
  | 'BACKLINK_OBSERVED'
  | 'BACKLINK_LOST'
  | 'REFERRING_DOMAIN_OBSERVED'
  | 'REFERRING_DOMAIN_GAP'
  | 'PAGE_LINK_COVERAGE_GAP'
  | 'COMPETITOR_LINK_GAP'
  | 'AUTHORITY_EVIDENCE_LIMITED'
  | 'AUTHORITY_EVIDENCE_UNAVAILABLE';

export type ConstraintDiagnosis =
  | 'AUTHORITY_EVIDENCE_STRONG'
  | 'AUTHORITY_EVIDENCE_LIMITED'
  | 'AUTHORITY_EVIDENCE_GAP'
  | 'AUTHORITY_UNAVAILABLE';

export type LinkOpportunityType =
  | 'COMPETITOR_GAP'
  | 'RESOURCE_PAGE'
  | 'EDITORIAL_MENTION'
  | 'DIRECTORY_OR_CITATION'
  | 'PARTNERSHIP'
  | 'CONTENT_CITATION'
  | 'UNCLASSIFIED';

export type IntersectState =
  | 'DOMAIN_LINKS_MULTIPLE_COMPETITORS'
  | 'DOMAIN_LINKS_ONE_COMPETITOR'
  | 'PAGE_LINKS_COMPETITOR'
  | 'NO_TARGET_LINK_OBSERVED';

export type LinkAttribute =
  | 'dofollow'
  | 'nofollow'
  | 'sponsored'
  | 'ugc'
  | 'unknown';

export const IMPORT_LIMITS = {
  maxRows: 5000,
  maxBytes: 10 * 1024 * 1024,
} as const;

export const IMPORT_COLUMNS = [
  'sourceUrl',
  'sourceDomain',
  'targetUrl',
  'anchorText',
  'linkType',
  'nofollow',
  'firstSeen',
  'lastSeen',
  'status',
  'competitor',
  'notes',
] as const;

export const CANNOT_MEASURE: readonly string[] = [
  'Complete backlink count is unavailable: RENKOO builds no backlink index.',
  'Complete referring-domain count is unavailable without a complete data source.',
  'DR, DA, Authority Score, link equity and toxic-link certainty are unavailable: RENKOO invents none of them.',
  'Competitor backlink completeness is unavailable: gaps are computed over imported evidence only.',
  'First-party link evidence (where connected) shows examples, never a complete index.',
  'Causal link-to-ranking impact is unavailable: evidence is stated alongside rankings, never as their cause.',
];

/* ---------- normalization / identity ---------- */

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

export function normalizeAuthorityUrl(
  value: unknown,
): string | null {
  let raw = clean(value).toLowerCase();
  if (!raw) return null;
  if (!/^https?:\/\//.test(raw)) return null;
  raw = raw.split('#')[0].split('?')[0];
  raw = raw.replace(/\/+$/, '');
  return raw || null;
}

export function normalizeAuthorityDomain(
  value: unknown,
): string | null {
  let raw = clean(value).toLowerCase();
  if (!raw) return null;
  raw = raw.replace(/^https?:\/\//, '');
  raw = raw.split('/')[0].split('?')[0];
  raw = raw.replace(/^www\./, '');
  raw = raw.replace(/:\d+$/, '');
  if (!raw.includes('.')) return null;
  return raw || null;
}

export function normalizeAnchor(
  value: unknown,
): string {
  return clean(value).toLowerCase().replace(/\s+/g, ' ');
}

export function linkAttributeOf(input: {
  nofollow?: unknown;
  sponsored?: unknown;
  ugc?: unknown;
  linkType?: unknown;
}): LinkAttribute {
  const truthy = (value: unknown): boolean => {
    const text = clean(value).toLowerCase();
    return (
      text === 'true' ||
      text === '1' ||
      text === 'yes' ||
      text === 'nofollow' ||
      text === 'sponsored' ||
      text === 'ugc'
    );
  };
  if (truthy(input.sponsored)) return 'sponsored';
  if (truthy(input.ugc)) return 'ugc';
  if (truthy(input.nofollow)) return 'nofollow';
  const linkType = clean(input.linkType).toUpperCase();
  if (linkType === 'NOFOLLOW') return 'nofollow';
  if (linkType === 'SPONSORED') return 'sponsored';
  if (linkType === 'UGC') return 'ugc';
  if (linkType === 'DOFOLLOW' || linkType === 'FOLLOW')
    return 'dofollow';
  return 'unknown';
}

export function backlinkIdentity(input: {
  sourceUrl: unknown;
  targetUrl: unknown;
  anchorText?: unknown;
  linkAttribute?: unknown;
}): string | null {
  const source = normalizeAuthorityUrl(input.sourceUrl);
  const target = normalizeAuthorityUrl(input.targetUrl);
  if (!source || !target) return null;
  return [
    source,
    target,
    normalizeAnchor(input.anchorText),
    clean(input.linkAttribute).toLowerCase() || 'unknown',
  ].join('|');
}

/* ---------- source classification ---------- */

export function classifyAuthoritySource(input: {
  hasGscLinks: boolean;
  hasManualRows: boolean;
  hasProvider: boolean;
}): {
  sourceType: AuthoritySourceType;
  evidenceState: AuthorityEvidenceState;
  label: string;
} {
  if (input.hasGscLinks)
    return {
      sourceType: 'FIRST_PARTY_LINKS',
      evidenceState: 'VERIFIED',
      label:
        'First-party link evidence. Shows examples of top linking sites and pages — not a complete backlink index.',
    };
  if (input.hasProvider)
    return {
      sourceType: 'EXTERNAL_PROVIDER',
      evidenceState: 'OBSERVED',
      label:
        'External provider evidence. Coverage depends on the provider contract.',
    };
  if (input.hasManualRows)
    return {
      sourceType: 'MANUAL_IMPORT',
      evidenceState: 'OBSERVED',
      label:
        'Based on imported backlink data. The imported set is never assumed complete.',
    };
  return {
    sourceType: 'UNAVAILABLE',
    evidenceState: 'UNAVAILABLE',
    label:
      'Backlink intelligence requires a backlink data source.',
  };
}

/* ---------- CSV parsing / validation ---------- */

export interface ParsedImportRow {
  line: number;
  sourceUrl: string;
  sourceDomain: string;
  targetUrl: string;
  anchorText: string | null;
  linkType: string;
  nofollow: boolean;
  firstSeen: string | null;
  lastSeen: string | null;
  status: string;
  competitor: string | null;
  notes: string | null;
}

export interface ImportRowIssue {
  line: number;
  reason: string;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      out.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  out.push(current);
  return out.map((cell) => cell.trim());
}

export function parseBacklinkCsv(
  csv: unknown,
): {
  rows: ParsedImportRow[];
  invalid: ImportRowIssue[];
  received: number;
  truncated: boolean;
} {
  const text = String(csv ?? '');
  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length === 0)
    return { rows: [], invalid: [], received: 0, truncated: false };
  const header = splitCsvLine(lines[0]).map((cell) =>
    cell.toLowerCase(),
  );
  const indexOf = (name: string): number =>
    header.indexOf(name);
  const rows: ParsedImportRow[] = [];
  const invalid: ImportRowIssue[] = [];
  const received = lines.length - 1;
  const limit = Math.min(received, IMPORT_LIMITS.maxRows);
  for (let i = 1; i <= limit; i++) {
    const cells = splitCsvLine(lines[i]);
    const cell = (name: string): string => {
      const idx = indexOf(name);
      return idx >= 0 ? clean(cells[idx]) : '';
    };
    const line = i + 1;
    const sourceUrl = cell('sourceurl') || cell('source_url');
    const targetUrl = cell('targeturl') || cell('target_url');
    const explicitDomain =
      cell('sourcedomain') || cell('source_domain');
    const sourceDomain =
      normalizeAuthorityDomain(explicitDomain) ??
      normalizeAuthorityDomain(sourceUrl);
    if (!normalizeAuthorityUrl(sourceUrl)) {
      invalid.push({ line, reason: 'malformed sourceUrl' });
      continue;
    }
    if (!normalizeAuthorityUrl(targetUrl)) {
      invalid.push({ line, reason: 'missing or malformed targetUrl' });
      continue;
    }
    if (!sourceDomain) {
      invalid.push({ line, reason: 'unresolvable sourceDomain' });
      continue;
    }
    const nofollowRaw = cell('nofollow');
    rows.push({
      line,
      sourceUrl: normalizeAuthorityUrl(sourceUrl) as string,
      sourceDomain,
      targetUrl: normalizeAuthorityUrl(targetUrl) as string,
      anchorText: cell('anchortext') || cell('anchor_text') || null,
      linkType: (cell('linktype') || cell('link_type') || 'UNKNOWN').toUpperCase(),
      nofollow: ['true', '1', 'yes'].includes(
        nofollowRaw.toLowerCase(),
      ),
      firstSeen: cell('firstseen') || cell('first_seen') || null,
      lastSeen: cell('lastseen') || cell('last_seen') || null,
      status: (cell('status') || 'ACTIVE').toUpperCase(),
      competitor: cell('competitor') || null,
      notes: cell('notes') || null,
    });
  }
  return {
    rows,
    invalid,
    received,
    truncated: received > IMPORT_LIMITS.maxRows,
  };
}

export function dedupeImportRows(
  rows: ParsedImportRow[],
): {
  unique: ParsedImportRow[];
  duplicates: number;
} {
  const seen = new Set<string>();
  const unique: ParsedImportRow[] = [];
  let duplicates = 0;
  for (const row of rows) {
    const key = [
      row.sourceUrl,
      row.targetUrl,
      normalizeAnchor(row.anchorText),
      row.nofollow ? 'nofollow' : 'unknown',
    ].join('|');
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    unique.push(row);
  }
  return { unique, duplicates };
}

/* ---------- states / diagnosis ---------- */

export function backlinkState(input: {
  hasRows: boolean;
  status: unknown;
}): BacklinkState {
  if (!input.hasRows) return 'AUTHORITY_EVIDENCE_UNAVAILABLE';
  if (clean(input.status).toUpperCase() === 'LOST')
    return 'BACKLINK_LOST';
  return 'BACKLINK_OBSERVED';
}

export function constraintDiagnosis(input: {
  hasEvidence: boolean;
  observedLinks: number;
  observedDomains: number;
  hasRankingOpportunity: boolean;
  competitorGapObserved: boolean;
}): ConstraintDiagnosis {
  if (!input.hasEvidence) return 'AUTHORITY_UNAVAILABLE';
  if (
    input.hasRankingOpportunity &&
    input.competitorGapObserved &&
    (input.observedLinks === 0 || input.observedDomains === 0)
  )
    return 'AUTHORITY_EVIDENCE_GAP';
  if (input.observedLinks > 0 && input.observedDomains > 0)
    return input.hasRankingOpportunity
      ? 'AUTHORITY_EVIDENCE_LIMITED'
      : 'AUTHORITY_EVIDENCE_STRONG';
  return 'AUTHORITY_EVIDENCE_LIMITED';
}

export function competitorGapStatement(input: {
  competitorName: string;
  domainCount: number;
}): string {
  return (
    `Competitor ${clean(input.competitorName) || 'page'} has ` +
    `observed link evidence from ${input.domainCount} referring ` +
    `domain(s) not observed for your page. Target links not observed ` +
    `in available evidence — this is not proof they do not exist, and ` +
    `not proof links cause the ranking difference.`
  );
}

/* ---------- intersect ---------- */

export interface IntersectCandidate {
  referringDomain: string;
  competitorsLinked: string[];
  targetLinked: boolean;
  sourcePages: string[];
}

export function intersectState(
  candidate: IntersectCandidate,
): IntersectState {
  if (candidate.targetLinked) return 'NO_TARGET_LINK_OBSERVED';
  if (candidate.sourcePages.length > 0 && candidate.competitorsLinked.length >= 1)
    return 'PAGE_LINKS_COMPETITOR';
  if (candidate.competitorsLinked.length >= 2)
    return 'DOMAIN_LINKS_MULTIPLE_COMPETITORS';
  if (candidate.competitorsLinked.length === 1)
    return 'DOMAIN_LINKS_ONE_COMPETITOR';
  return 'NO_TARGET_LINK_OBSERVED';
}

export function targetLinkNote(): string {
  return (
    'Target link not observed in available evidence. ' +
    'Not observed is not proof the link does not exist.'
  );
}

/* ---------- opportunity typing (deterministic) ---------- */

export function classifyOpportunityType(input: {
  sourceUrl: unknown;
  sourceDomain: unknown;
  hasCompetitor: boolean;
}): LinkOpportunityType {
  if (input.hasCompetitor) return 'COMPETITOR_GAP';
  const url = clean(input.sourceUrl).toLowerCase();
  const domain = clean(input.sourceDomain).toLowerCase();
  if (
    /resource|links|toolbox|bibliograph/i.test(url)
  )
    return 'RESOURCE_PAGE';
  if (/blog|news|magazine|journal|press/i.test(url))
    return 'EDITORIAL_MENTION';
  if (
    /director|listing|citation|yellow|yelp|chamber/i.test(
      url,
    ) ||
    /director|chamber|association/i.test(domain)
  )
    return 'DIRECTORY_OR_CITATION';
  if (/partner|sponsor|member|association/i.test(url))
    return 'PARTNERSHIP';
  if (/guide|research|study|report|whitepaper/i.test(url))
    return 'CONTENT_CITATION';
  /* Never guess without evidence. */
  return 'UNCLASSIFIED';
}

/* ---------- measurement ---------- */

export function authorityMeasurementNote(): string {
  return (
    'After the action, the following changes will be observed where ' +
    'connected: rank, impressions, clicks, CTR, AI visibility, leads, ' +
    'revenue. Observed after action — never "link caused ranking increase".'
  );
}

export function attributeNote(
  attribute: LinkAttribute,
): string {
  return `Link attribute observed: ${attribute}. Attributes describe crawl hints, not value.`;
}

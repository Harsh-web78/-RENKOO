/*
 * =========================================================
 * CRAWL LINK GRAPH 6.0 Phase 2B — pure edge helpers.
 *
 * Single source of truth for crawl URL normalization
 * (moved verbatim from CrawlService so links, frontier
 * discovery and page URLs share one semantics) plus
 * deterministic edge construction / deduplication.
 *
 * Everything here is OBSERVED data handling: no scores,
 * no authority, no ranking claims. Anchors are stored
 * exactly as found in the HTML (bounded length only).
 * =========================================================
 */

/*
 * Bounds (documented, enforced in code):
 * - MAX_ANCHOR_LENGTH: anchorText/anchorKey truncated to
 *   500 chars. Control characters stripped. Nav repeats
 *   collapse via dedupe, so rows stay small.
 * - MAX_EDGES_PER_PAGE: at most 1000 distinct edges per
 *   page are persisted; the rest still count toward
 *   CrawlPage.internalLinks. Prevents unbounded arrays
 *   on mega-menu/footer-heavy pages.
 */
export const MAX_ANCHOR_LENGTH = 500;
export const MAX_EDGES_PER_PAGE = 1000;

export function normalizeCrawlHostname(
  hostname: string,
): string {
  return hostname
    .toLowerCase()
    .replace(/^www\./, '');
}

/*
 * Normalization rules (identical to the pre-2B crawler):
 * 1. HTTP/HTTPS only (else '').
 * 2. Remove hash.
 * 3. Remove tracking parameters.
 * 4. Remove remaining query parameters (crawler
 *    semantics: query strings are NOT meaningful for
 *    page identity here — documented, not destroyed
 *    blindly: this matches frontier + page URL logic).
 * 5. Remove trailing slash except root.
 * 6. Lowercase hostname (+ strip www.).
 * 7. Remove default ports.
 */
export function normalizeCrawlUrl(
  input: string,
): string {
  try {
    const url = new URL(input);

    if (
      url.protocol !== 'http:' &&
      url.protocol !== 'https:'
    ) {
      return '';
    }

    url.hostname = normalizeCrawlHostname(
      url.hostname,
    );

    url.hash = '';

    const trackingParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'gclid',
      'fbclid',
      'msclkid',
      'dclid',
      'ref',
      'referrer',
    ];

    for (const param of trackingParams) {
      url.searchParams.delete(param);
    }

    url.search = '';

    if (
      url.pathname.length > 1 &&
      url.pathname.endsWith('/')
    ) {
      url.pathname = url.pathname.slice(0, -1);
    }

    if (
      url.protocol === 'http:' &&
      url.port === '80'
    ) {
      url.port = '';
    }

    if (
      url.protocol === 'https:' &&
      url.port === '443'
    ) {
      url.port = '';
    }

    return url.toString();
  } catch {
    return '';
  }
}

export interface ParsedLinkRel {
  nofollow: boolean;
  sponsored: boolean;
  ugc: boolean;
}

/*
 * Factual rel parsing: only tokens present in the
 * attribute count. Nothing inferred.
 */
export function parseLinkRel(
  rel: unknown,
): ParsedLinkRel {
  const tokens = String(rel ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return {
    nofollow: tokens.includes('nofollow'),
    sponsored: tokens.includes('sponsored'),
    ugc: tokens.includes('ugc'),
  };
}

/*
 * Display anchor: original text trimmed, control chars
 * stripped, bounded. Empty string stays empty (image /
 * empty links are factual edges with no text — alt text
 * is deliberately NOT substituted).
 */
export function cleanAnchorText(
  text: unknown,
): string {
  return String(text ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, MAX_ANCHOR_LENGTH);
}

/*
 * Dedupe key input: normalized anchor for grouping.
 * Case/whitespace-insensitive so "Learn More" and
 * "learn  more" collapse; display text in anchorText
 * keeps first-seen original.
 */
export function anchorKeyOf(
  text: unknown,
): string {
  return cleanAnchorText(text)
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export interface RawLinkObservation {
  sourceUrl: string;
  targetUrl: string;
  anchorText: string;
  nofollow: boolean;
  sponsored: boolean;
  ugc: boolean;
}

export interface LinkEdgeInput extends RawLinkObservation {
  organizationId: string;
  websiteId: string;
  crawlId: string;
}

/*
 * Deduplication decision (documented): one logical edge
 * per (source, target, normalized anchor, rel-attribute
 * set) within a page parse, with occurrenceCount for
 * repeats (header/footer/nav duplication collapses).
 * Different anchors for the same source → target stay
 * distinguishable rows. First-seen display anchor and
 * attributes win; repeats only bump the count.
 */
export function dedupeLinkEdges(
  edges: RawLinkObservation[],
): Array<
  RawLinkObservation & { occurrenceCount: number }
> {
  const byKey = new Map<
    string,
    RawLinkObservation & { occurrenceCount: number }
  >();
  for (const edge of edges) {
    const key = [
      edge.sourceUrl,
      edge.targetUrl,
      anchorKeyOf(edge.anchorText),
      edge.nofollow ? 'nf' : '',
      edge.sponsored ? 'sp' : '',
      edge.ugc ? 'ugc' : '',
    ].join('|');
    const prev = byKey.get(key);
    if (prev) {
      prev.occurrenceCount += 1;
    } else {
      byKey.set(key, { ...edge, occurrenceCount: 1 });
    }
  }
  return [...byKey.values()];
}

/*
 * Identity key shared with future recommendation
 * comparison (Phase 2C): normalized source, target and
 * anchor. Recommendation metadata uses the lighter
 * source|target|keyword key; edge-level verification
 * must use THIS key (anchor-aware) instead.
 */
export function linkEdgeIdentityKey(edge: {
  sourceUrl: unknown;
  targetUrl: unknown;
  anchorText: unknown;
}): string {
  const norm = (value: unknown) =>
    String(value ?? '')
      .trim()
      .toLowerCase();
  return [
    norm(edge.sourceUrl),
    norm(edge.targetUrl),
    anchorKeyOf(edge.anchorText),
  ].join('|');
}

/*
 * Phase 2A → 2B factual bridge (no scoring, no
 * verdicts): does an OBSERVED edge exist for a
 * recommended source → target pair? Both sides pass
 * through crawl normalization so frontier, page and
 * recommendation URL spellings compare safely.
 * Anchor comparison is exact on the normalized key
 * when a suggested anchor is supplied, ignored when
 * null (existence check only).
 */
export function edgeMatchesRecommendation(
  edge: {
    sourceUrl: unknown;
    targetUrl: unknown;
    anchorText?: unknown;
  },
  recommendation: {
    sourceUrl: unknown;
    targetUrl: unknown;
    suggestedAnchor?: unknown;
  },
): boolean {
  const normUrl = (value: unknown) =>
    normalizeCrawlUrl(String(value ?? ''));
  if (
    !normUrl(edge.sourceUrl) ||
    !normUrl(edge.targetUrl)
  ) {
    return false;
  }
  if (
    normUrl(edge.sourceUrl) !==
      normUrl(recommendation.sourceUrl) ||
    normUrl(edge.targetUrl) !==
      normUrl(recommendation.targetUrl)
  ) {
    return false;
  }
  if (
    recommendation.suggestedAnchor === null ||
    recommendation.suggestedAnchor === undefined ||
    String(recommendation.suggestedAnchor).trim() === ''
  ) {
    return true;
  }
  return (
    anchorKeyOf(edge.anchorText) ===
    anchorKeyOf(recommendation.suggestedAnchor)
  );
}

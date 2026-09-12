/*
 * =========================================================
 * TECHNICAL SEO VIEW (crawl → results consistency).
 *
 * Single authoritative rule shared by every technical-SEO
 * read path: only a full-site crawl with status exactly
 * 'COMPLETED', scoped to the requesting website/org, and
 * containing at least one persisted page may back the
 * Technical SEO page. A crawl with one un-fetchable page
 * (49/50 + PAGE_FETCH_FAILED evidence) is still a valid
 * completed crawl — the failed page must never erase the
 * valid results.
 *
 * Pure module (no imports except the status vocabulary)
 * — unit-testable, reused by the service guards.
 * =========================================================
 */

import { FULL_CRAWL_COMPLETED } from './crawl-status';

export type TechnicalSeoView =
  | 'results'
  | 'healthy'
  | 'empty-no-crawl'
  | 'incomplete';

interface ScopedCrawl {
  status?: unknown;
  websiteId?: unknown;
  website?: {
    organizationId?: unknown;
  } | null;
  organizationId?: unknown;
  pages?: unknown;
}

interface ViewScope {
  websiteId: string;
  organizationId: string;
}

function orgOf(crawl: ScopedCrawl): string {
  return String(
    crawl.website?.organizationId ??
      crawl.organizationId ??
      '',
  );
}

/*
 * An authoritative technical-SEO crawl: exact COMPLETED
 * status (verification rows never qualify), requesting
 * website scope, requesting org scope.
 */
export function isAuthoritativeTechnicalCrawl(
  crawl: ScopedCrawl | null | undefined,
  scope: ViewScope,
): boolean {
  if (!crawl) return false;
  if (crawl.status !== FULL_CRAWL_COMPLETED)
    return false;
  if (String(crawl.websiteId ?? '') !== scope.websiteId)
    return false;
  if (orgOf(crawl) !== scope.organizationId)
    return false;
  return true;
}

/*
 * Page presence: when the pages relation is loaded it
 * must be non-empty; when it is not loaded (id-only
 * reads) the caller guarantees presence via the query
 * (pages: { some: {} }).
 */
export function hasCrawlPages(
  crawl: ScopedCrawl | null | undefined,
): boolean {
  if (!crawl) return false;
  if (!('pages' in crawl)) return true;
  return (
    Array.isArray(crawl.pages) &&
    crawl.pages.length > 0
  );
}

/*
 * Latest-authoritative selection over an in-memory list
 * (mirrors the DB read: COMPLETED + scope + ≥1 page,
 * newest createdAt wins). Stale/older crawls and rows
 * scoped to another website/org never win.
 */
export function selectAuthoritativeCrawl<
  T extends ScopedCrawl & { createdAt?: unknown },
>(
  crawls: T[],
  scope: ViewScope,
): T | null {
  const eligible = (crawls ?? []).filter(
    (crawl) =>
      isAuthoritativeTechnicalCrawl(crawl, scope) &&
      hasCrawlPages(crawl),
  );
  if (eligible.length === 0) return null;
  return eligible.sort(
    (a, b) =>
      new Date(String(b.createdAt ?? 0)).getTime() -
      new Date(String(a.createdAt ?? 0)).getTime(),
  )[0];
}

/*
 * View resolution for one authoritative read: crawl
 * state and results state must agree. Completed crawls
 * with pages always show results — zero open issues is
 * a healthy crawl, never "no data". Incomplete crawls
 * are never shown as completed.
 */
export function resolveTechnicalSeoView(input: {
  crawl: { status?: unknown } | null | undefined;
  pagesTotal: number;
  openIssues: number;
}): TechnicalSeoView {
  const { crawl, pagesTotal, openIssues } = input;
  if (!crawl) return 'empty-no-crawl';
  if (crawl.status !== FULL_CRAWL_COMPLETED)
    return 'incomplete';
  if (!Number.isFinite(pagesTotal) || pagesTotal <= 0)
    return 'empty-no-crawl';
  if (openIssues > 0) return 'results';
  return 'healthy';
}

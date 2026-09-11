/*
 * =========================================================
 * CRAWL STATUS VOCABULARY (Phase 41, Group G).
 *
 * Full site crawls and single-page verification crawls
 * share the Crawl table but must never share authority:
 * verification rows carry a distinct terminal status so
 * every `status: 'COMPLETED'` authority query keeps
 * resolving to full site crawls without a migration.
 *
 * Pure module (no imports) — unit-testable, reused by
 * the crawl engine and first-value sequencing.
 * =========================================================
 */

export const FULL_CRAWL_COMPLETED = 'COMPLETED';

export const VERIFICATION_CRAWL_COMPLETED =
  'COMPLETED_VERIFICATION';

export const VERIFICATION_CRAWL_FAILED =
  'FAILED_VERIFICATION';

export const VERIFICATION_CRAWL_STATUSES = [
  VERIFICATION_CRAWL_COMPLETED,
  VERIFICATION_CRAWL_FAILED,
] as const;

export function isVerificationCrawlStatus(
  status: unknown,
): boolean {
  const normalized = String(status ?? '')
    .trim()
    .toUpperCase();
  return (
    normalized === VERIFICATION_CRAWL_COMPLETED ||
    normalized === VERIFICATION_CRAWL_FAILED
  );
}

export function isAuthoritativeCrawlStatus(
  status: unknown,
): boolean {
  return (
    String(status ?? '').trim().toUpperCase() ===
    FULL_CRAWL_COMPLETED
  );
}

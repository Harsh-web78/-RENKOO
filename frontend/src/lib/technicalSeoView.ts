/*
 * RENKOO — Technical SEO view helpers (pure, no imports).
 *
 * ONE authoritative state: the persisted technical-SEO
 * report for the latest authoritative COMPLETED crawl.
 * The header ("Audit complete") must never claim success
 * while this view is empty, and a valid report must never
 * render "No crawl data yet" — zero open issues is a
 * healthy crawl, not missing data.
 */

export type TechnicalSeoUiState =
  | 'empty'
  | 'healthy'
  | 'results';

function num(
  value: unknown,
  fallback = 0,
): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/*
 * The persisted view exists only when the response
 * carries the authoritative crawl identity. A falsy
 * body, an envelope change, or a shape without the
 * crawl MUST NOT be treated as completed results —
 * doRequest resolves 204/empty bodies without
 * throwing, so callers must assert this before
 * claiming "Audit complete".
 */
export function hasAuthoritativeReport(
  report: unknown,
): boolean {
  if (!report || typeof report !== 'object')
    return false;
  const crawl = (report as any)?.crawl;
  return (
    !!crawl &&
    typeof crawl === 'object' &&
    typeof crawl.id === 'string' &&
    crawl.id.length > 0
  );
}

export interface TechnicalSeoRow {
  id: unknown;
  code: unknown;
  category: unknown;
  title: unknown;
  description: unknown;
  recommendation: unknown;
  severity: unknown;
  status: string;
  affectedPages: number;
  affectedUrls: string[];
  firstSeenAt: unknown;
  createdAt: unknown;
  page: unknown;
}

/*
 * Row derivation from the ONE report response:
 * topIssues carry the per-issue rows, issueGroups
 * carry per-code reach. The legacy `issues` counts
 * object is never read as a row list.
 */
export function issueRowsFromReport(
  report: unknown,
): TechnicalSeoRow[] {
  const data = (report ?? {}) as any;
  const tops = Array.isArray(data?.topIssues)
    ? data.topIssues
    : [];
  const groups = Array.isArray(data?.issueGroups)
    ? data.issueGroups
    : [];
  const byCode = new Map<string, any>(
    groups.map((g: any) => [String(g?.code), g]),
  );
  const seen =
    data?.crawl?.completedAt ||
    data?.crawl?.createdAt ||
    null;
  return tops.map((t: any) => {
    const group = byCode.get(String(t?.code));
    const sampleUrls = Array.isArray(group?.pages)
      ? group.pages
          .map((p: any) => String(p?.url || ''))
          .filter(Boolean)
          .slice(0, 8)
      : [];
    const pageUrl = String(
      t?.page?.url || sampleUrls[0] || '',
    );
    const affectedUrls =
      sampleUrls.length > 0
        ? sampleUrls
        : pageUrl
          ? [pageUrl]
          : [];
    return {
      id: t?.id,
      code: t?.code,
      category: t?.category,
      title: t?.title,
      description: t?.description,
      recommendation: t?.recommendation,
      severity: t?.severity,
      status: t?.status || 'OPEN',
      affectedPages: num(group?.affectedPages, 1),
      affectedUrls,
      firstSeenAt: seen,
      createdAt: seen,
      page: t?.page,
    };
  });
}

/*
 * Header/body/empty-state agreement: empty only when
 * the persisted view is missing; healthy when a valid
 * report carries zero open rows (50/50, 49/50 with only
 * a failed-page row resolved, or genuinely clean).
 */
export function resolveTechnicalSeoUiState(
  report: unknown,
): TechnicalSeoUiState {
  if (!hasAuthoritativeReport(report)) return 'empty';
  return issueRowsFromReport(report).length > 0
    ? 'results'
    : 'healthy';
}

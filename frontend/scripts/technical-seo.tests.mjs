/*
 * RENKOO — Technical SEO consistency tests (node, no runner).
 *
 * Static wiring validation that crawl state and results
 * state share one authoritative source of truth: the
 * latest COMPLETED crawl with pages. Run from frontend/:
 *   node scripts/technical-seo.tests.mjs
 *
 * Style mirrors scripts/tour.tests.mjs.
 */

import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const backendRoot = join(root, '..', 'backend');

let passed = 0;
let failed = 0;

function check(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function readFrontend(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

function readBackend(rel) {
  return readFileSync(join(backendRoot, rel), 'utf8');
}

const page = readFrontend('src/app/technical-seo/page.tsx');
const viewHelper = readFrontend('src/lib/technicalSeoView.ts');
const service = readBackend('src/crawl/technical-seo.service.ts');
const crawlService = readBackend('src/crawl/crawl.service.ts');
const view = readBackend('src/crawl/technical-seo-view.ts');

/* ---------- 1. completed crawl (50/50) → results shown ---------- */

check(
  'rows derive from topIssues (real report shape)',
  viewHelper.includes('topIssues') &&
    page.includes('issueRowsFromReport(data)'),
);

check(
  'rows join issueGroups for reach (same response)',
  page.includes('issueGroups'),
);

check(
  'results never read data.issues as an array',
  !/Array\.isArray\(\(data as any\)\?\.issues\)/.test(page) &&
    !/Array\.isArray\(data\?\.issues\)/.test(page),
);

check(
  'score reads score.value (report shape)',
  page.includes('score?.value'),
);

check(
  'pages metric reads pages.total (report shape)',
  page.includes('pages?.total'),
);

/* ---------- 2. completed crawl (49/50) → results shown ---------- */

check(
  'failed-page audit copy present (49 of 50)',
  page.includes('could not be fetched'),
);

check(
  'PAGE_FETCH_FAILED evidence path documented',
  page.includes('PAGE_FETCH_FAILED') ||
    crawlService.includes("code: 'PAGE_FETCH_FAILED'"),
);

check(
  'crawl persists failed page instead of failing run',
  crawlService.includes('pagesFailed++') &&
    crawlService.includes('COMPLETED'),
);

/* ---------- 3. incomplete crawl → not shown as completed ---------- */

check(
  'getByCrawl requires COMPLETED authority',
  service.includes("status: 'COMPLETED'") ||
    service.includes('isAuthoritativeTechnicalCrawl'),
);

check(
  'getByCrawl rejects crawls without pages',
  service.includes('hasCrawlPages'),
);

check(
  'view resolves incomplete status honestly',
  view.includes("'incomplete'") &&
    view.includes('FULL_CRAWL_COMPLETED'),
);

check(
  'no hardcoded Audit complete outside run result',
  (page.match(/Audit complete/g) ?? []).length <= 2,
);

/* ---------- 4. no completed crawl → honest empty state ---------- */

check(
  'empty state gated on missing data only',
  /!data \? \(/.test(page) &&
    !/\!data \|\| issues\.length === 0/.test(page),
);

check(
  'empty title stays honest (no fake complete)',
  page.includes('No crawl data yet') &&
    !/Audit complete — 0 /.test(page),
);

check(
  'getLatest throws honest no-crawl error',
  service.includes('No valid completed crawl found'),
);

check(
  'zero open issues renders healthy, not no-data',
  page.includes('No open issues'),
);

/* ---------- 5. foreign website/org → excluded ---------- */

check(
  'getLatest scopes website + org',
  service.includes('websiteId') &&
    service.includes('organizationId'),
);

check(
  'page loads per-website latest (passes websiteId)',
  page.includes('getTechnicalSeoLatest(id)') ||
    page.includes('getTechnicalSeoLatest(websiteId)'),
);

check(
  'authority helper checks website + org scope',
  view.includes('scope.websiteId') &&
    view.includes('scope.organizationId'),
);

/* ---------- 6. stale vs latest ---------- */

check(
  'getLatest orders newest first',
  service.includes("createdAt: 'desc'"),
);

check(
  'crawl summary uses same newest-first rule',
  crawlService.includes("createdAt: 'desc'"),
);

check(
  'selector prefers newest authoritative crawl',
  view.includes('getTime()'),
);

/* ---------- 7. summary + results use the same crawl ---------- */

check(
  'both reads require COMPLETED + pages',
  service.includes('pages: {') &&
    crawlService.includes('pages: {'),
);

check(
  'both reads scope the same org',
  service.includes('organizationId') &&
    crawlService.includes('organizationId'),
);

check(
  'page uses one source (no second issues endpoint)',
  !page.includes('getCrawlIssues('),
);

check(
  'lifecycle updates stay inside the same response',
  page.includes('prev.topIssues') &&
    page.includes('topIssues: nextTops'),
);

/* ---------- 8. one failed page never erases results ---------- */

check(
  'failed rows count as crawl presence',
  view.includes('hasCrawlPages'),
);

check(
  'healthy view distinct from empty view',
  view.includes("'healthy'") &&
    view.includes("'empty-no-crawl'"),
);

/* ---------- audit-complete gate (root-cause class) ----------
 *
 * The header must never claim "Audit complete" while the
 * persisted view is empty: doRequest resolves 204/empty
 * bodies without throwing, so the audit path asserts the
 * authoritative report before publishing data + copy.
 */

check(
  'audit asserts authoritative view before success copy',
  page.includes('hasAuthoritativeReport(technicalSeo)'),
);

check(
  'empty gate uses shared helper (header/body agree)',
  page.includes('!hasAuthoritativeReport(data)'),
);

check(
  'rows derive via shared pure helper',
  page.includes('issueRowsFromReport(data)'),
);

/* ---------- behavioral truth table ----------
 *
 * Compiles the REAL pure view module and executes it
 * against the production incident shapes: a valid
 * report (50/50, 49/50, zero issues) must never
 * resolve to empty; null/204 resolving without a
 * throw must never back an "Audit complete" claim.
 */
{
  const tmp = mkdtempSync(join(tmpdir(), 'tseoview-verify-'));
  let compiled = null;
  try {
    execSync(
      `npx tsc src/lib/technicalSeoView.ts --outDir "${tmp}" --module commonjs --target es2020 --esModuleInterop --skipLibCheck`,
      { cwd: root, stdio: 'pipe' },
    );
    compiled = await import(
      pathToFileURL(join(tmp, 'technicalSeoView.js')).href
    );
  } catch (e) {
    check('technicalSeoView compiles standalone', false, String(e).slice(0, 160));
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}
  }

  if (compiled) {
    const { hasAuthoritativeReport, issueRowsFromReport, resolveTechnicalSeoUiState } = compiled;
    check('view helpers exported', typeof hasAuthoritativeReport === 'function' && typeof resolveTechnicalSeoUiState === 'function');

    const report = (tops, groups) => ({
      crawl: { id: 'crawl-1', status: 'COMPLETED', completedAt: '2026-09-12T10:00:00.000Z', createdAt: '2026-09-12T10:00:00.000Z' },
      score: { value: 82, label: 'Good' },
      pages: { total: 50 },
      issues: { total: tops.length, open: tops.length },
      topIssues: tops,
      issueGroups: groups,
    });
    const top = (code) => ({ id: `i-${code}`, code, severity: 'HIGH', title: code, description: 'd', recommendation: 'r', page: { id: 'p', url: 'https://example.com/' } });
    const group = (code, n) => ({ code, severity: 'HIGH', title: code, description: 'd', recommendation: 'r', affectedPages: n, pages: [{ id: 'p', url: 'https://example.com/' }] });

    /* completed 50/50 → results, never empty */
    const full = report([top('A'), top('B')], [group('A', 30), group('B', 20)]);
    check('50/50 report is authoritative', hasAuthoritativeReport(full) === true);
    check('50/50 rows render', issueRowsFromReport(full).length === 2);
    check('50/50 resolves to results', resolveTechnicalSeoUiState(full) === 'results');

    /* completed 49/50 (failed page row) → results */
    const withFailed = report([top('A'), { id: 'i-fetch', code: 'PAGE_FETCH_FAILED', severity: 'HIGH', title: 'Page could not be fetched', description: 'd', recommendation: 'r', page: { id: 'pf', url: 'https://example.com/broken' } }], [group('A', 49), group('PAGE_FETCH_FAILED', 1)]);
    check('49/50 resolves to results', resolveTechnicalSeoUiState(withFailed) === 'results');

    /* zero open issues → healthy, never "No crawl data yet" */
    const clean = report([], []);
    check('zero-issue report is still authoritative', hasAuthoritativeReport(clean) === true);
    check('zero issues resolves to healthy', resolveTechnicalSeoUiState(clean) === 'healthy');

    /* falsy bodies (204/empty resolving without throw) → empty, never complete */
    for (const [name, body] of [['null', null], ['undefined', undefined], ['envelope w/o crawl', { data: {} }], ['crawl w/o id', { crawl: {} }]]) {
      check(`falsy body (${name}) is not authoritative`, hasAuthoritativeReport(body) === false);
      check(`falsy body (${name}) resolves to empty`, resolveTechnicalSeoUiState(body) === 'empty');
    }

    /* refresh-after-completion + website switching read the same view */
    check('refreshed report resolves identically', resolveTechnicalSeoUiState(JSON.parse(JSON.stringify(full))) === 'results');
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

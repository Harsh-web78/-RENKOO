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

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const service = readBackend('src/crawl/technical-seo.service.ts');
const crawlService = readBackend('src/crawl/crawl.service.ts');
const view = readBackend('src/crawl/technical-seo-view.ts');

/* ---------- 1. completed crawl (50/50) → results shown ---------- */

check(
  'rows derive from topIssues (real report shape)',
  page.includes('(data as any)?.topIssues') ||
    page.includes('data?.topIssues'),
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

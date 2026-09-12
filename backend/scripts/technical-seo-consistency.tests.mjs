/*
 * RENKOO Technical SEO consistency — tests.
 *
 * One authoritative flow: crawl state → completed crawl
 * → technical SEO results. Only a full-site crawl with
 * status exactly COMPLETED, scoped to the requesting
 * website/org, holding at least one page may back the
 * Technical SEO page. A 49/50 crawl (one PAGE_FETCH_FAILED
 * page) is still completed — the failed page never erases
 * valid results. No DB, no browser, no provider calls.
 *
 * Run: npm run test:technical-seo   (dist built)
 */
import assert from 'node:assert/strict';

const view = await import(
  '../dist/crawl/technical-seo-view.js'
);
const cs = await import(
  '../dist/crawl/crawl-status.js'
);

const results = [];
let passCount = 0;
async function test(name, fn) {
  try {
    await fn();
    passCount++;
    results.push(`PASS ${name}`);
  } catch (err) {
    results.push(`FAIL ${name}: ${err.message}`);
    console.error(err);
  }
}

const SCOPE = {
  websiteId: 'site-1',
  organizationId: 'org-1',
};

function page(url, issues = []) {
  return { id: `page-${url}`, url, issues };
}

function issue(code = 'MISSING_TITLE') {
  return { id: `issue-${code}`, code };
}

function crawl(over = {}) {
  return {
    id: 'crawl-1',
    websiteId: 'site-1',
    website: { organizationId: 'org-1' },
    status: 'COMPLETED',
    createdAt: new Date('2026-09-12T10:00:00Z'),
    pages: [page('https://example.com/', [issue()])],
    ...over,
  };
}

/* ---------- 1. completed 50/50 → results shown ---------- */

await test('completed crawl is authoritative', async () => {
  assert.equal(
    view.isAuthoritativeTechnicalCrawl(crawl(), SCOPE),
    true,
  );
});

await test('completed 50/50 resolves to results', async () => {
  assert.equal(
    view.resolveTechnicalSeoView({
      crawl: { status: 'COMPLETED' },
      pagesTotal: 50,
      openIssues: 12,
    }),
    'results',
  );
});

/* ---------- 2. completed 49/50 → results shown ---------- */

function failedPageRow() {
  return {
    id: 'page-failed',
    url: 'https://example.com/broken',
    statusCode: null,
    issues: [
      {
        id: 'issue-fetch',
        code: 'PAGE_FETCH_FAILED',
      },
    ],
  };
}

await test('49/50 crawl with failed page stays authoritative', async () => {
  const pages = Array.from({ length: 49 }, (_, i) =>
    page(`https://example.com/p${i}`, [issue(`ISSUE-${i}`)]),
  );
  pages.push(failedPageRow());
  const c = crawl({ pages });
  assert.equal(c.pages.length, 50);
  assert.equal(
    view.isAuthoritativeTechnicalCrawl(c, SCOPE),
    true,
  );
  assert.equal(view.hasCrawlPages(c), true);
});

await test('49/50 resolves to results, not empty', async () => {
  assert.equal(
    view.resolveTechnicalSeoView({
      crawl: { status: 'COMPLETED' },
      pagesTotal: 50,
      openIssues: 13,
    }),
    'results',
  );
});

/* ---------- 3. incomplete → never completed ---------- */

for (const status of [
  'RUNNING',
  'FAILED',
  'PENDING',
  'COMPLETED_VERIFICATION',
  'FAILED_VERIFICATION',
]) {
  await test(`status ${status} is not authoritative`, async () => {
    assert.equal(
      view.isAuthoritativeTechnicalCrawl(
        crawl({ status }),
        SCOPE,
      ),
      false,
    );
  });
}

await test('incomplete crawl resolves to incomplete view', async () => {
  assert.equal(
    view.resolveTechnicalSeoView({
      crawl: { status: 'RUNNING' },
      pagesTotal: 50,
      openIssues: 5,
    }),
    'incomplete',
  );
  assert.equal(
    view.resolveTechnicalSeoView({
      crawl: { status: 'FAILED' },
      pagesTotal: 50,
      openIssues: 5,
    }),
    'incomplete',
  );
});

await test('verification terminal status never authoritative', async () => {
  assert.equal(
    view.isAuthoritativeTechnicalCrawl(
      crawl({ status: cs.VERIFICATION_CRAWL_COMPLETED }),
      SCOPE,
    ),
    false,
  );
});

/* ---------- 4. no completed crawl → honest empty ---------- */

await test('null crawl resolves to empty-no-crawl', async () => {
  assert.equal(
    view.resolveTechnicalSeoView({
      crawl: null,
      pagesTotal: 0,
      openIssues: 0,
    }),
    'empty-no-crawl',
  );
});

await test('empty crawl list selects nothing', async () => {
  assert.equal(
    view.selectAuthoritativeCrawl([], SCOPE),
    null,
  );
});

await test('completed crawl with zero pages is not valid', async () => {
  const c = crawl({ pages: [] });
  assert.equal(view.hasCrawlPages(c), false);
  assert.equal(
    view.selectAuthoritativeCrawl([c], SCOPE),
    null,
  );
  assert.equal(
    view.resolveTechnicalSeoView({
      crawl: { status: 'COMPLETED' },
      pagesTotal: 0,
      openIssues: 0,
    }),
    'empty-no-crawl',
  );
});

/* ---------- 5. foreign website/org → excluded ---------- */

await test('crawl from another website excluded', async () => {
  assert.equal(
    view.isAuthoritativeTechnicalCrawl(
      crawl({ websiteId: 'site-2' }),
      SCOPE,
    ),
    false,
  );
  assert.equal(
    view.selectAuthoritativeCrawl(
      [crawl({ websiteId: 'site-2' })],
      SCOPE,
    ),
    null,
  );
});

await test('crawl from another org excluded', async () => {
  assert.equal(
    view.isAuthoritativeTechnicalCrawl(
      crawl({
        website: { organizationId: 'org-2' },
      }),
      SCOPE,
    ),
    false,
  );
  assert.equal(
    view.selectAuthoritativeCrawl(
      [
        crawl({
          id: 'foreign',
          website: { organizationId: 'org-2' },
        }),
      ],
      SCOPE,
    ),
    null,
  );
});

/* ---------- 6. stale vs latest ---------- */

await test('latest completed crawl wins over stale', async () => {
  const stale = crawl({
    id: 'stale',
    createdAt: new Date('2026-09-01T10:00:00Z'),
  });
  const latest = crawl({
    id: 'latest',
    createdAt: new Date('2026-09-12T10:00:00Z'),
  });
  assert.equal(
    view.selectAuthoritativeCrawl(
      [stale, latest],
      SCOPE,
    )?.id,
    'latest',
  );
  assert.equal(
    view.selectAuthoritativeCrawl(
      [latest, stale],
      SCOPE,
    )?.id,
    'latest',
  );
});

await test('newer incomplete crawl never shadows latest completed', async () => {
  const completed = crawl({
    id: 'completed',
    createdAt: new Date('2026-09-10T10:00:00Z'),
  });
  const running = crawl({
    id: 'running',
    status: 'RUNNING',
    createdAt: new Date('2026-09-12T10:00:00Z'),
  });
  assert.equal(
    view.selectAuthoritativeCrawl(
      [completed, running],
      SCOPE,
    )?.id,
    'completed',
  );
});

/* ---------- 7. summary + results share one crawl ---------- */

await test('selector is deterministic for both projections', async () => {
  const list = [
    crawl({
      id: 'a',
      createdAt: new Date('2026-09-11T10:00:00Z'),
    }),
    crawl({
      id: 'b',
      createdAt: new Date('2026-09-12T10:00:00Z'),
    }),
  ];
  const forSummary = view.selectAuthoritativeCrawl(
    list,
    SCOPE,
  );
  const forResults = view.selectAuthoritativeCrawl(
    list,
    SCOPE,
  );
  assert.ok(forSummary && forResults);
  assert.equal(forSummary.id, forResults.id);
});

/* ---------- 8. failed page never erases results ---------- */

await test('failed page row counts as crawl presence', async () => {
  const c = crawl({ pages: [failedPageRow()] });
  assert.equal(view.hasCrawlPages(c), true);
  assert.equal(
    view.isAuthoritativeTechnicalCrawl(c, SCOPE),
    true,
  );
});

await test('zero open issues is healthy, never no-data', async () => {
  assert.equal(
    view.resolveTechnicalSeoView({
      crawl: { status: 'COMPLETED' },
      pagesTotal: 49,
      openIssues: 0,
    }),
    'healthy',
  );
});

console.log(`\n${passCount} passed, ${results.length - passCount} failed`);
for (const r of results) console.log(r);
process.exit(passCount === results.length ? 0 : 1);

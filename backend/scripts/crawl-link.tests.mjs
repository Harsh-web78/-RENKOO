/*
 * RENKOO 6.0 Phase 2B — crawl link graph foundation tests.
 *
 * Pure edge-helper tests run against dist output with no
 * I/O. Service tests use an in-memory Prisma stub (no
 * live Postgres available in this environment — see
 * report: migration UNVERIFIED). No crawler browser is
 * launched; per-element extraction semantics are covered
 * by helper contracts plus the unchanged counting code
 * path in crawl.service.ts.
 *
 * Run: npm run test:crawl-links   (builds first)
 */
import assert from 'node:assert/strict';

const dist = (p) => import(`../dist/${p}`);

const ORG = 'org1';
const ORG2 = 'org2';
const WEBSITE_ID = 'w1';
const WEBSITE2_ID = 'w2';
const CRAWL_A = 'crawl_a';
const CRAWL_B = 'crawl_b';

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push(`PASS ${name}`);
  } catch (err) {
    results.push(`FAIL ${name}: ${err.message}`);
    console.error(err);
  }
}

async function helpers() {
  return dist('crawl/crawl-links.js');
}

/* Stub Prisma capturing calls for batching/isolation
   assertions. Respects equality where + take only. */
function stubPrisma(seeds = {}) {
  const calls = { createMany: [] };
  const linkRows = [...(seeds.links ?? [])];
  const pageRows = [...(seeds.pages ?? [])];
  const matches = (row, where = {}) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        if ('in' in v) return v.in.includes(row[k]);
        if ('gte' in v || 'lt' in v) {
          if ('gte' in v && !(row[k] >= v.gte)) return false;
          if ('lt' in v && !(row[k] < v.lt)) return false;
          return true;
        }
        return true;
      }
      return row[k] === v;
    });
  return {
    __calls: calls,
    __links: linkRows,
    website: {
      findFirst: async ({ where }) => {
        if (
          seeds.websitesMissing ||
          (where.id === WEBSITE2_ID && seeds.noWebsite2)
        )
          return null;
        return { id: where.id };
      },
    },
    crawlLink: {
      createMany: async ({ data, skipDuplicates }) => {
        calls.createMany.push({
          count: data.length,
          skipDuplicates: !!skipDuplicates,
        });
        for (const row of data) linkRows.push(row);
        return { count: data.length };
      },
      findMany: async ({ where, take } = {}) => {
        const out = linkRows.filter((r) =>
          matches(r, where),
        );
        return typeof take === 'number'
          ? out.slice(0, take)
          : out;
      },
      count: async ({ where } = {}) =>
        linkRows.filter((r) => matches(r, where)).length,
    },
    crawlPage: {
      findMany: async ({ where, take } = {}) => {
        const out = pageRows.filter((r) =>
          matches(r, where),
        );
        return typeof take === 'number'
          ? out.slice(0, take)
          : out;
      },
    },
    crawl: {
      findFirst: async () => ({ id: CRAWL_A }),
    },
  };
}

async function buildLinkService(seeds = {}) {
  const prisma = stubPrisma(seeds);
  const mod = await dist('crawl/crawl-link.service.js');
  const svc = new mod.CrawlLinkService(prisma);
  return { prisma, svc };
}

/* 1. Internal absolute URL. */
await test('internal absolute url', async () => {
  const h = await helpers();
  assert.equal(
    h.normalizeCrawlUrl('https://SITE.com/About/'),
    'https://site.com/About',
  );
});

/* 2. Internal relative URL (resolved form, as the
   crawler passes it via new URL(href, finalUrl)). */
await test('internal relative url', async () => {
  const h = await helpers();
  assert.equal(
    h.normalizeCrawlUrl('https://site.com/blog/../about'),
    'https://site.com/about',
  );
  assert.equal(
    h.normalizeCrawlUrl('https://site.com/blog'),
    'https://site.com/blog',
  );
});

/* 3. Internal root-relative URL (resolved form). */
await test('internal root-relative url', async () => {
  const h = await helpers();
  assert.equal(
    h.normalizeCrawlUrl('https://site.com/'),
    'https://site.com/',
  );
  assert.equal(
    h.normalizeCrawlUrl('https://site.com/pricing/'),
    'https://site.com/pricing',
  );
});

/* 4. External URL excluded (host gate discriminates). */
await test('external url excluded', async () => {
  const h = await helpers();
  assert.notEqual(
    h.normalizeCrawlHostname('WWW.Rival.com'),
    h.normalizeCrawlHostname('site.com'),
  );
  assert.equal(
    h.normalizeCrawlHostname('WWW.Site.com'),
    'site.com',
  );
});

/* 5-7. Non-navigation schemes excluded. */
await test('mailto excluded', async () => {
  const h = await helpers();
  assert.equal(
    h.normalizeCrawlUrl('mailto:hi@site.com'),
    '',
  );
});
await test('tel excluded', async () => {
  const h = await helpers();
  assert.equal(h.normalizeCrawlUrl('tel:+123'), '');
});
await test('javascript excluded', async () => {
  const h = await helpers();
  assert.equal(
    h.normalizeCrawlUrl('javascript:void(0)'),
    '',
  );
});

/* 8. Fragment handling. */
await test('fragment handling', async () => {
  const h = await helpers();
  assert.equal(
    h.normalizeCrawlUrl('https://site.com/blog#section'),
    'https://site.com/blog',
  );
});

/* 9. Trailing slash normalization. */
await test('trailing slash normalization', async () => {
  const h = await helpers();
  assert.equal(
    h.normalizeCrawlUrl('https://site.com/a/'),
    'https://site.com/a',
  );
  assert.equal(
    h.normalizeCrawlUrl('https://site.com/'),
    'https://site.com/',
  );
});

/* 10. Duplicate suppression with occurrence count. */
await test('duplicate suppression', async () => {
  const h = await helpers();
  const out = h.dedupeLinkEdges([
    {
      sourceUrl: 'https://site.com/a',
      targetUrl: 'https://site.com/b',
      anchorText: 'Learn More',
      nofollow: false,
      sponsored: false,
      ugc: false,
    },
    {
      sourceUrl: 'https://site.com/a',
      targetUrl: 'https://site.com/b',
      anchorText: 'learn  more',
      nofollow: false,
      sponsored: false,
      ugc: false,
    },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].occurrenceCount, 2);
  assert.equal(out[0].anchorText, 'Learn More');
});

/* 11. Different anchors stay distinguishable. */
await test('different anchors distinguishable', async () => {
  const h = await helpers();
  const out = h.dedupeLinkEdges([
    {
      sourceUrl: 'https://site.com/seo-guide',
      targetUrl: 'https://site.com/keyword-research',
      anchorText: 'keyword research',
      nofollow: false,
      sponsored: false,
      ugc: false,
    },
    {
      sourceUrl: 'https://site.com/seo-guide',
      targetUrl: 'https://site.com/keyword-research',
      anchorText: 'learn more',
      nofollow: false,
      sponsored: false,
      ugc: false,
    },
  ]);
  assert.equal(out.length, 2);
  const anchors = out.map((e) => e.anchorText).sort();
  assert.deepEqual(anchors, ['keyword research', 'learn more']);
});

/* 12-14. Rel attribute capture. */
await test('nofollow capture', async () => {
  const h = await helpers();
  assert.deepEqual(h.parseLinkRel('nofollow noopener'), {
    nofollow: true,
    sponsored: false,
    ugc: false,
  });
});
await test('sponsored capture', async () => {
  const h = await helpers();
  assert.deepEqual(h.parseLinkRel('sponsored'), {
    nofollow: false,
    sponsored: true,
    ugc: false,
  });
});
await test('ugc capture', async () => {
  const h = await helpers();
  assert.deepEqual(h.parseLinkRel('UGC nofollow'), {
    nofollow: true,
    sponsored: false,
    ugc: true,
  });
});

/* 15. Malformed href never crashes helpers. */
await test('malformed href safe', async () => {
  const h = await helpers();
  assert.equal(h.normalizeCrawlUrl(':::::'), '');
  assert.equal(h.normalizeCrawlUrl(''), '');
  assert.deepEqual(h.parseLinkRel(undefined), {
    nofollow: false,
    sponsored: false,
    ugc: false,
  });
  assert.equal(h.cleanAnchorText(undefined), '');
  assert.equal(h.anchorKeyOf('  Learn   MORE '), 'learn more');
});

/* 16-17. Source/target normalization incl. tracking
   and query stripping per crawler semantics. */
await test('source url normalization', async () => {
  const h = await helpers();
  assert.equal(
    h.normalizeCrawlUrl('HTTPS://Site.COM/Blog/?utm_source=x#top'),
    'https://site.com/Blog',
  );
});
await test('target url normalization', async () => {
  const h = await helpers();
  assert.equal(
    h.normalizeCrawlUrl('https://site.com/p?ref=nav&x=1'),
    'https://site.com/p',
  );
  assert.equal(
    h.normalizeCrawlUrl('http://site.com:80/p/'),
    'http://site.com/p',
  );
});

/* 18-20. Tenant / website / crawl isolation on reads. */
await test('tenant isolation', async () => {
  const { svc } = await buildLinkService({
    links: [
      {
        organizationId: ORG2,
        websiteId: WEBSITE2_ID,
        crawlId: CRAWL_A,
        sourceUrl: 'https://other.com/a',
        targetUrl: 'https://other.com/b',
      },
    ],
  });
  const outbound = await svc.getOutboundEdges(
    ORG,
    WEBSITE_ID,
    CRAWL_A,
    'https://other.com/a',
  );
  assert.equal(outbound.length, 0);
});
await test('website isolation', async () => {
  const { svc } = await buildLinkService({
    links: [
      {
        organizationId: ORG,
        websiteId: WEBSITE2_ID,
        crawlId: CRAWL_A,
        sourceUrl: 'https://site.com/a',
        targetUrl: 'https://site.com/b',
      },
    ],
  });
  const inbound = await svc.getInboundEdges(
    ORG,
    WEBSITE_ID,
    CRAWL_A,
    'https://site.com/b',
  );
  assert.equal(inbound.length, 0);
});
await test('crawl isolation', async () => {
  const { svc } = await buildLinkService({
    links: [
      {
        organizationId: ORG,
        websiteId: WEBSITE_ID,
        crawlId: CRAWL_B,
        sourceUrl: 'https://site.com/a',
        targetUrl: 'https://site.com/b',
      },
    ],
  });
  const inbound = await svc.getInboundEdges(
    ORG,
    WEBSITE_ID,
    CRAWL_A,
    'https://site.com/b',
  );
  assert.equal(inbound.length, 0);
  const count = await svc.countInbound(
    ORG,
    WEBSITE_ID,
    CRAWL_A,
    'https://site.com/b',
  );
  assert.equal(count, 0);
});

/* 21. Zero-inbound detection foundation. */
await test('zero inbound candidates', async () => {
  const { svc } = await buildLinkService({
    pages: [
      {
        crawlId: CRAWL_A,
        url: 'https://site.com/',
        title: 'Home',
        statusCode: 200,
      },
      {
        crawlId: CRAWL_A,
        url: 'https://site.com/orphan',
        title: 'Orphan',
        statusCode: 200,
      },
      {
        crawlId: CRAWL_A,
        url: 'https://site.com/gone',
        title: 'Gone',
        statusCode: 404,
      },
    ],
    links: [
      {
        organizationId: ORG,
        websiteId: WEBSITE_ID,
        crawlId: CRAWL_A,
        sourceUrl: 'https://site.com/',
        targetUrl: 'https://site.com/',
      },
    ],
  });
  const candidates = await svc.getOrphanCandidates(
    ORG,
    WEBSITE_ID,
    CRAWL_A,
  );
  const urls = candidates.map((c) => c.url);
  assert.ok(urls.includes('https://site.com/orphan'));
  assert.ok(!urls.includes('https://site.com/'));
  assert.ok(
    !urls.includes('https://site.com/gone'),
    'non-2xx pages are not candidates',
  );
});

/* 22. Outbound edge retrieval (+ bridge match). */
await test('outbound edge retrieval', async () => {
  const { svc } = await buildLinkService({
    links: [
      {
        organizationId: ORG,
        websiteId: WEBSITE_ID,
        crawlId: CRAWL_A,
        sourceUrl: 'https://site.com/a',
        targetUrl: 'https://site.com/b',
        anchorText: 'Bee',
      },
      {
        organizationId: ORG,
        websiteId: WEBSITE_ID,
        crawlId: CRAWL_A,
        sourceUrl: 'https://site.com/a',
        targetUrl: 'https://site.com/c',
        anchorText: 'Cee',
      },
    ],
  });
  const rows = await svc.getOutboundEdges(
    ORG,
    WEBSITE_ID,
    CRAWL_A,
    'https://site.com/a',
  );
  assert.equal(rows.length, 2);
  const h = await helpers();
  assert.equal(
    h.edgeMatchesRecommendation(
      {
        sourceUrl: 'https://site.com/a/',
        targetUrl: 'https://site.com/b?utm_source=x',
        anchorText: 'bee',
      },
      {
        sourceUrl: 'https://site.com/a',
        targetUrl: 'https://site.com/b',
        suggestedAnchor: 'Bee',
      },
    ),
    true,
  );
  assert.equal(
    h.edgeMatchesRecommendation(
      {
        sourceUrl: 'https://site.com/a',
        targetUrl: 'https://site.com/c',
        anchorText: 'Cee',
      },
      {
        sourceUrl: 'https://site.com/a',
        targetUrl: 'https://site.com/b',
        suggestedAnchor: 'Bee',
      },
    ),
    false,
  );
});

/* 23. Inbound edge retrieval. */
await test('inbound edge retrieval', async () => {
  const { svc } = await buildLinkService({
    links: [
      {
        organizationId: ORG,
        websiteId: WEBSITE_ID,
        crawlId: CRAWL_A,
        sourceUrl: 'https://site.com/a',
        targetUrl: 'https://site.com/b',
        anchorText: 'Bee',
      },
    ],
  });
  const rows = await svc.getInboundEdges(
    ORG,
    WEBSITE_ID,
    CRAWL_A,
    'https://site.com/b',
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sourceUrl, 'https://site.com/a');
  assert.equal(
    await svc.countInbound(
      ORG,
      WEBSITE_ID,
      CRAWL_A,
      'https://site.com/b',
    ),
    1,
  );
});

/* 24. Very large page link batching. */
await test('large page batching', async () => {
  const { prisma, svc } = await buildLinkService();
  const edges = Array.from({ length: 2500 }, (_, i) => ({
    sourceUrl: 'https://site.com/mega',
    targetUrl: `https://site.com/p-${i % 1200}`,
    anchorText: `link ${i % 1200}`,
    nofollow: false,
    sponsored: false,
    ugc: false,
  }));
  const out = await svc.persistPageEdges({
    organizationId: ORG,
    websiteId: WEBSITE_ID,
    crawlId: CRAWL_A,
    sourceUrl: 'https://site.com/mega',
    edges,
  });
  assert.equal(out.truncated, true);
  assert.equal(prisma.__calls.createMany.length, 1);
  assert.equal(
    prisma.__calls.createMany[0].count,
    1000,
  );
  assert.equal(
    prisma.__calls.createMany[0].skipDuplicates,
    true,
  );
});

/* 25. Multiple crawls remain isolated. */
await test('multiple crawls isolated', async () => {
  const { svc } = await buildLinkService({
    links: [
      {
        organizationId: ORG,
        websiteId: WEBSITE_ID,
        crawlId: CRAWL_A,
        sourceUrl: 'https://site.com/a',
        targetUrl: 'https://site.com/b',
      },
      {
        organizationId: ORG,
        websiteId: WEBSITE_ID,
        crawlId: CRAWL_B,
        sourceUrl: 'https://site.com/a',
        targetUrl: 'https://site.com/c',
      },
    ],
  });
  const a = await svc.getOutboundEdges(
    ORG,
    WEBSITE_ID,
    CRAWL_A,
    'https://site.com/a',
  );
  assert.deepEqual(
    a.map((r) => r.targetUrl),
    ['https://site.com/b'],
  );
});

/* 26. Failed crawl never corrupts the prior snapshot. */
await test('failure keeps prior snapshot', async () => {
  const { prisma, svc } = await buildLinkService({
    links: [
      {
        organizationId: ORG,
        websiteId: WEBSITE_ID,
        crawlId: CRAWL_A,
        sourceUrl: 'https://site.com/a',
        targetUrl: 'https://site.com/b',
      },
    ],
  });
  /* Crawl B writes partial edges then "fails" — crawl A
     rows must be untouched. */
  await svc.persistPageEdges({
    organizationId: ORG,
    websiteId: WEBSITE_ID,
    crawlId: CRAWL_B,
    sourceUrl: 'https://site.com/a',
    edges: [
      {
        sourceUrl: 'https://site.com/a',
        targetUrl: 'https://site.com/z',
        anchorText: 'Zed',
        nofollow: false,
        sponsored: false,
        ugc: false,
      },
    ],
  });
  const before = prisma.__links.filter(
    (r) => r.crawlId === CRAWL_A,
  );
  assert.equal(before.length, 1);
  assert.equal(before[0].targetUrl, 'https://site.com/b');
  const failed = await svc.getOutboundEdges(
    ORG,
    WEBSITE_ID,
    'crawl_missing',
    'https://site.com/a',
  );
  assert.equal(failed.length, 0);
});

/* 27. No unbounded per-link DB writes. */
await test('batched writes only', async () => {
  const { prisma, svc } = await buildLinkService();
  const edges = Array.from({ length: 500 }, (_, i) => ({
    sourceUrl: 'https://site.com/a',
    targetUrl: `https://site.com/p-${i}`,
    anchorText: `link ${i}`,
    nofollow: false,
    sponsored: false,
    ugc: false,
  }));
  const out = await svc.persistPageEdges({
    organizationId: ORG,
    websiteId: WEBSITE_ID,
    crawlId: CRAWL_A,
    sourceUrl: 'https://site.com/a',
    edges,
  });
  assert.equal(out.written, 500);
  assert.equal(out.truncated, false);
  assert.equal(prisma.__calls.createMany.length, 1);
  const empty = await svc.persistPageEdges({
    organizationId: ORG,
    websiteId: WEBSITE_ID,
    crawlId: CRAWL_A,
    sourceUrl: 'https://site.com/empty',
    edges: [],
  });
  assert.deepEqual(empty, { written: 0, truncated: false });
  assert.equal(prisma.__calls.createMany.length, 1);
});

/* 28. Existing crawler normalization preserved. */
await test('crawler normalization preserved', async () => {
  const h = await helpers();
  const vectors = [
    ['https://site.com/', 'https://site.com/'],
    ['https://site.com/a/', 'https://site.com/a'],
    [
      'https://WWW.Site.COM/Blog/?utm_medium=x&keep=no',
      'https://site.com/Blog',
    ],
    ['http://site.com:80/x', 'http://site.com/x'],
    ['https://site.com:443/x', 'https://site.com/x'],
    ['https://site.com/a#b', 'https://site.com/a'],
    ['ftp://site.com/a', ''],
    ['not a url', ''],
  ];
  for (const [input, expected] of vectors) {
    assert.equal(
      h.normalizeCrawlUrl(input),
      expected,
      `normalize(${input})`,
    );
  }
});

/* 29. Phase 2A regression (no drift in shared terms). */
await test('phase 2a regression', async () => {
  const strategyMod = await dist(
    'keywords/content-strategy.service.js',
  );
  assert.equal(
    strategyMod.normalizeKeyword('  CRM Pricing '),
    'crm pricing',
  );
  assert.equal(
    strategyMod.normalizeUrl('https://Site.com/A/'),
    'https://site.com/a',
  );
  assert.equal(
    strategyMod.decideContentAction({
      pageMapping: 'IMPROVE',
      bucket: 'QUICK_WIN',
      refreshHit: false,
    }),
    'IMPROVE',
  );
  assert.equal(
    strategyMod.linkIdentityKey({
      sourceUrl: 'https://site.com/A/',
      targetUrl: 'https://site.com/B',
      keyword: 'CRM',
    }),
    'https://site.com/a|https://site.com/b|crm',
  );
});

/* 30. Keyword/content/strategy suites still green is
   asserted by CI order (strategy, keywords,
   content-strategy run alongside this file). Here we
   lock the bridge contract they share. */
await test('bridge contract', async () => {
  const h = await helpers();
  assert.equal(
    h.linkEdgeIdentityKey({
      sourceUrl: 'https://site.com/A/',
      targetUrl: 'https://site.com/B',
      anchorText: ' Learn  MORE ',
    }),
    'https://site.com/a/|https://site.com/b|learn more',
  );
  assert.equal(
    h.edgeMatchesRecommendation(
      {
        sourceUrl: 'https://site.com/a',
        targetUrl: 'https://site.com/b',
        anchorText: 'Pricing guide',
      },
      {
        sourceUrl: 'https://site.com/a',
        targetUrl: 'https://site.com/b',
      },
    ),
    true,
    'existence check ignores anchor when none suggested',
  );
  assert.equal(
    h.edgeMatchesRecommendation(
      { sourceUrl: '', targetUrl: 'https://site.com/b' },
      {
        sourceUrl: 'https://site.com/a',
        targetUrl: 'https://site.com/b',
      },
    ),
    false,
  );
});

console.log(results.join('\n'));
const failed = results.filter((r) =>
  r.startsWith('FAIL'),
);
console.log(
  `\n${results.length - failed.length}/${results.length} passed`,
);
if (failed.length > 0) process.exit(1);

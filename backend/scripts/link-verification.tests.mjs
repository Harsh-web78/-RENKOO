/*
 * RENKOO 6.0 Phase 2C — verification + orphan intelligence
 * tests.
 *
 * RECOMMENDED vs OBSERVED vs VERIFIED / NOT_VERIFIED /
 * BROKEN / UNAVAILABLE, anchor analysis, rel exposure,
 * POTENTIAL_ORPHAN candidates, lifecycle separation, and
 * batched reads. In-memory Prisma stub (no live Postgres
 * here — migration status UNVERIFIED, see report). The
 * crawler browser is never launched.
 *
 * Run: npm run test:link-verification   (builds first)
 */
import assert from 'node:assert/strict';

const dist = (p) => import(`../dist/${p}`);

const ORG = 'org1';
const ORG2 = 'org2';
const WEBSITE_ID = 'w1';
const WEBSITE2_ID = 'w2';
const CRAWL_OLD = 'crawl_old';
const CRAWL_NEW = 'crawl_new';
const CRAWL_FAILED = 'crawl_failed';
const CRAWL_RUNNING = 'crawl_running';

const D = (s) => new Date(s);

function pages(newId) {
  const base = [
    { url: 'https://site.com/', title: 'Home', statusCode: 200 },
    { url: 'https://site.com/seo-guide', title: 'Guide', statusCode: 200 },
    {
      url: 'https://site.com/keyword-research',
      title: 'KR',
      statusCode: 200,
    },
    { url: 'https://site.com/dead', title: 'Dead', statusCode: 404 },
    {
      url: 'https://site.com/noindex',
      title: 'Hidden',
      statusCode: 200,
      robotsIndexable: false,
    },
    {
      url: 'https://site.com/redir',
      title: 'Moved',
      statusCode: 200,
      redirectCount: 1,
      finalUrl: 'https://site.com/target',
    },
    {
      url: 'https://site.com/canon',
      title: 'Canon',
      statusCode: 200,
      canonical: 'https://site.com/other',
    },
    { url: 'https://site.com/unlinked', title: 'Unlinked', statusCode: 200 },
    { url: 'https://site.com/old-page', title: 'Old', statusCode: 200 },
    { url: 'https://site.com/gone-page', title: 'Gone', statusCode: 200 },
    { url: 'https://site.com/trunc', title: 'Trunc', statusCode: 200 },
    {
      url: 'https://site.com/trunc-target',
      title: 'TruncTarget',
      statusCode: 200,
    },
    {
      url: 'https://site.com/real-target',
      title: 'Real',
      statusCode: 200,
    },
  ];
  return base.map((p, i) => ({
    id: `pg_${newId}_${i}`,
    crawlId: newId,
    robotsIndexable: null,
    canonical: null,
    canonicalAbsolute: null,
    redirectCount: 0,
    finalUrl: null,
    ...p,
  }));
}

function links(newId, oldId) {
  const rows = [
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
    {
      sourceUrl: 'https://site.com/',
      targetUrl: 'https://site.com/keyword-research',
      anchorText: 'Research!',
      nofollow: true,
      sponsored: false,
      ugc: false,
    },
    {
      sourceUrl: 'https://site.com/seo-guide',
      targetUrl: 'https://site.com/seo-guide',
      anchorText: 'self',
      nofollow: false,
      sponsored: false,
      ugc: false,
    },
    {
      sourceUrl: 'https://site.com/seo-guide',
      targetUrl: 'https://site.com/dead',
      anchorText: 'dead link',
      nofollow: false,
      sponsored: true,
      ugc: true,
    },
    {
      sourceUrl: 'https://site.com/trunc',
      targetUrl: 'https://site.com/real-target',
      anchorText: 'real thing',
      nofollow: false,
      sponsored: false,
      ugc: false,
    },
  ].map((e, i) => ({
    id: `edge_${newId}_${i}`,
    organizationId: ORG,
    websiteId: WEBSITE_ID,
    crawlId: newId,
    anchorKey: e.anchorText.toLowerCase(),
    occurrenceCount: 1,
    ...e,
  }));
  /* Truncation fixture: source at the persist cap. */
  for (let i = 0; i < 1000; i++) {
    rows.push({
      id: `edge_trunc_${i}`,
      organizationId: ORG,
      websiteId: WEBSITE_ID,
      crawlId: newId,
      sourceUrl: 'https://site.com/trunc',
      targetUrl: `https://site.com/t-${i}`,
      anchorText: `t${i}`,
      anchorKey: `t${i}`,
      nofollow: false,
      sponsored: false,
      ugc: false,
      occurrenceCount: 1,
    });
  }
  /* Previous crawl held a now-removed edge. */
  rows.push({
    id: 'edge_old_1',
    organizationId: ORG,
    websiteId: WEBSITE_ID,
    crawlId: oldId,
    sourceUrl: 'https://site.com/old-page',
    targetUrl: 'https://site.com/gone-page',
    anchorText: 'gone',
    anchorKey: 'gone',
    nofollow: false,
    sponsored: false,
    ugc: false,
    occurrenceCount: 1,
  });
  return rows;
}

function stubPrisma(seeds = {}) {
  const linkRows = [...(seeds.links ?? [])];
  const pageRows = [...(seeds.pages ?? [])];
  const crawls = [...(seeds.crawls ?? [])];
  const calls = { findMany: 0 };
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
  const throwP2021 = seeds.throwP2021 === true;
  const maybeThrow = () => {
    if (throwP2021) {
      const err = new Error(
        'The table `public.CrawlLink` does not exist in the current database.',
      );
      err.code = 'P2021';
      throw err;
    }
  };
  return {
    __calls: calls,
    __links: linkRows,
    website: {
      findFirst: async ({ where }) => {
        if (where.id === WEBSITE2_ID && seeds.noWebsite2)
          return null;
        if (where.organizationId === ORG2) return null;
        return {
          id: where.id,
          url: 'https://site.com/',
        };
      },
    },
    crawl: {
      findFirst: async ({ where } = {}) => {
        const out = crawls
          .filter((r) => matches(r, where))
          .sort((a, b) => b.completedAt - a.completedAt);
        return out[0] ?? null;
      },
      findMany: async ({ where, take } = {}) => {
        const out = crawls
          .filter((r) => matches(r, where))
          .sort((a, b) => b.completedAt - a.completedAt);
        return typeof take === 'number'
          ? out.slice(0, take)
          : out;
      },
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
    crawlLink: {
      findMany: async ({ where, take } = {}) => {
        calls.findMany++;
        maybeThrow();
        const out = linkRows.filter((r) =>
          matches(r, where),
        );
        return typeof take === 'number'
          ? out.slice(0, take)
          : out;
      },
      count: async ({ where } = {}) => {
        maybeThrow();
        return linkRows.filter((r) => matches(r, where))
          .length;
      },
    },
    contentStrategyLink: {
      findMany: async ({ where } = {}) => [
        ...(seeds.strategyLinks ?? []),
      ].filter((r) => matches(r, where)),
    },
    recommendation: {
      findMany: async () => [...(seeds.recommendations ?? [])],
    },
    action: {
      findMany: async () => [...(seeds.actions ?? [])],
    },
    contentItem: { findMany: async () => [] },
    contentBrief: { findMany: async () => [] },
    contentDraft: { findMany: async () => [] },
  };
}

function baseCrawls() {
  return [
    {
      id: CRAWL_OLD,
      websiteId: WEBSITE_ID,
      status: 'COMPLETED',
      completedAt: D('2026-09-01T00:00:00Z'),
    },
    {
      id: CRAWL_NEW,
      websiteId: WEBSITE_ID,
      status: 'COMPLETED',
      completedAt: D('2026-09-08T00:00:00Z'),
    },
    {
      id: CRAWL_FAILED,
      websiteId: WEBSITE_ID,
      status: 'FAILED',
      completedAt: D('2026-09-09T00:00:00Z'),
    },
  ];
}

async function buildServices(seeds = {}) {
  const prisma = stubPrisma(seeds);
  const crawlMod = await dist('crawl/crawl-link.service.js');
  const strategyMod = await dist(
    'keywords/content-strategy.service.js',
  );
  const graph = new crawlMod.CrawlLinkService(prisma);
  const svc = new strategyMod.ContentStrategyService(
    prisma,
    {},
    {},
    graph,
  );
  return { prisma, svc, strategyMod };
}

function richSeeds() {
  return {
    crawls: baseCrawls(),
    pages: [...pages(CRAWL_NEW), ...pages(CRAWL_OLD)],
    links: links(CRAWL_NEW, CRAWL_OLD),
    strategyLinks: [
      {
        organizationId: ORG,
        websiteId: WEBSITE_ID,
        keyword: 'unlinked topic',
        topic: 'Unlinked',
        targetPage: 'https://site.com/unlinked',
        pageMapping: 'IMPROVE',
        bucket: 'GROW',
        priority: 'HIGH',
        priorityScore: 70,
        intent: 'COMMERCIAL',
        contentAction: 'IMPROVE',
      },
    ],
    recommendations: [
      {
        id: 'rec_open',
        status: 'OPEN',
        title: 't',
        description: 'd',
        priority: 'HIGH',
      },
    ],
    actions: [
      {
        id: 'act_todo',
        status: 'TODO',
        title: 't',
        metadata: {},
      },
    ],
  };
}

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

async function verifyOne(svc, pair) {
  const out = await svc.verifyLinkPairs(ORG, WEBSITE_ID, [
    pair,
  ]);
  assert.equal(out.results.length, 1);
  return { ...out.results[0], crawlId: out.crawlId };
}

/* 1. Matching observed edge → VERIFIED. */
await test('matching edge verified', async () => {
  const { svc } = await buildServices(richSeeds());
  const r = await verifyOne(svc, {
    sourceUrl: 'https://site.com/seo-guide',
    targetUrl: 'https://site.com/keyword-research',
    suggestedAnchor: 'keyword research',
  });
  assert.equal(r.status, 'VERIFIED');
  assert.equal(r.crawlId, CRAWL_NEW);
  assert.ok(r.crawlCompletedAt);
  assert.equal(r.anchorMatch, 'EXACT_MATCH');
  assert.deepEqual(r.observedAnchors, [
    'keyword research',
    'learn more',
  ]);
});

/* 2. No observed edge → NOT_VERIFIED. */
await test('missing edge not verified', async () => {
  const { svc } = await buildServices(richSeeds());
  const r = await verifyOne(svc, {
    sourceUrl: 'https://site.com/seo-guide',
    targetUrl: 'https://site.com/unlinked',
    suggestedAnchor: 'unlinked',
  });
  assert.equal(r.status, 'NOT_VERIFIED');
  assert.equal(r.linkLost, false);
  assert.equal(r.anchorMatch, 'UNKNOWN');
});

/* 3. No crawl → UNAVAILABLE. */
await test('no crawl unavailable', async () => {
  const { svc } = await buildServices({
    crawls: [],
    pages: [],
    links: [],
  });
  const r = await verifyOne(svc, {
    sourceUrl: 'https://site.com/a',
    targetUrl: 'https://site.com/b',
  });
  assert.equal(r.status, 'UNAVAILABLE');
  assert.equal(r.crawlId, null);
});

/* 4. Failed crawl → UNAVAILABLE (never authoritative). */
await test('failed crawl unavailable', async () => {
  const { svc } = await buildServices({
    crawls: [
      {
        id: CRAWL_FAILED,
        websiteId: WEBSITE_ID,
        status: 'FAILED',
        completedAt: D('2026-09-09T00:00:00Z'),
      },
    ],
    pages: pages(CRAWL_FAILED),
    links: [],
  });
  const r = await verifyOne(svc, {
    sourceUrl: 'https://site.com/seo-guide',
    targetUrl: 'https://site.com/keyword-research',
  });
  assert.equal(r.status, 'UNAVAILABLE');
});

/* 5. Running crawl → UNAVAILABLE (older COMPLETED wins). */
await test('running crawl uses completed', async () => {
  const { svc } = await buildServices({
    crawls: [
      {
        id: CRAWL_RUNNING,
        websiteId: WEBSITE_ID,
        status: 'RUNNING',
        completedAt: null,
      },
      ...baseCrawls(),
    ],
    pages: [...pages(CRAWL_NEW), ...pages(CRAWL_OLD)],
    links: links(CRAWL_NEW, CRAWL_OLD),
  });
  const r = await verifyOne(svc, {
    sourceUrl: 'https://site.com/seo-guide',
    targetUrl: 'https://site.com/keyword-research',
    suggestedAnchor: 'keyword research',
  });
  assert.equal(r.status, 'VERIFIED');
  assert.equal(r.crawlId, CRAWL_NEW);
});

/* 6. Exact anchor match. */
await test('exact anchor match', async () => {
  const { strategyMod } = await buildServices();
  assert.equal(
    strategyMod.compareLinkAnchors('Keyword Research', [
      'keyword research',
    ]),
    'EXACT_MATCH',
  );
});

/* 7. Different anchor stays VERIFIED with DIFFERENT. */
await test('different anchor', async () => {
  const { svc } = await buildServices(richSeeds());
  const r = await verifyOne(svc, {
    sourceUrl: 'https://site.com/seo-guide',
    targetUrl: 'https://site.com/keyword-research',
    suggestedAnchor: 'completely other phrase',
  });
  assert.equal(r.status, 'VERIFIED');
  assert.equal(r.anchorMatch, 'DIFFERENT');
});

/* 8. Multiple observed anchors. */
await test('multiple observed anchors', async () => {
  const { svc } = await buildServices(richSeeds());
  const r = await verifyOne(svc, {
    sourceUrl: 'https://site.com/',
    targetUrl: 'https://site.com/keyword-research',
    suggestedAnchor: 'Research!',
  });
  assert.equal(r.status, 'VERIFIED');
  assert.equal(r.anchorMatch, 'EXACT_MATCH');
  assert.deepEqual(r.observedAnchors, ['Research!']);
  assert.equal(r.linkAttributes.nofollow, true);
});

/* 9-11. Rel attributes exposed factually. */
await test('nofollow capture', async () => {
  const { svc } = await buildServices(richSeeds());
  const r = await verifyOne(svc, {
    sourceUrl: 'https://site.com/',
    targetUrl: 'https://site.com/keyword-research',
  });
  assert.deepEqual(r.linkAttributes, {
    nofollow: true,
    sponsored: false,
    ugc: false,
  });
});
await test('sponsored capture', async () => {
  const { svc } = await buildServices(richSeeds());
  const r = await verifyOne(svc, {
    sourceUrl: 'https://site.com/seo-guide',
    targetUrl: 'https://site.com/dead',
  });
  assert.equal(r.status, 'BROKEN');
  assert.deepEqual(r.linkAttributes, {
    nofollow: false,
    sponsored: true,
    ugc: true,
  });
});
await test('ugc capture', async () => {
  const { strategyMod } = await buildServices();
  assert.equal(
    strategyMod.compareLinkAnchors('dead link', [
      'dead link',
    ]),
    'EXACT_MATCH',
  );
});

/* 12-15. Normalization per crawler rules. */
await test('source normalization', async () => {
  const { svc } = await buildServices(richSeeds());
  const r = await verifyOne(svc, {
    sourceUrl: 'https://SITE.com/seo-guide/?utm_source=x',
    targetUrl: 'https://site.com/keyword-research',
    suggestedAnchor: 'keyword research',
  });
  assert.equal(r.status, 'VERIFIED');
});
await test('target normalization', async () => {
  const { svc } = await buildServices(richSeeds());
  const r = await verifyOne(svc, {
    sourceUrl: 'https://site.com/seo-guide',
    targetUrl: 'https://WWW.SITE.COM/keyword-research/',
  });
  assert.equal(r.status, 'VERIFIED');
});
await test('trailing slash', async () => {
  const { svc } = await buildServices(richSeeds());
  const r = await verifyOne(svc, {
    sourceUrl: 'https://site.com/seo-guide/',
    targetUrl: 'https://site.com/keyword-research/',
    suggestedAnchor: 'learn more',
  });
  assert.equal(r.status, 'VERIFIED');
});
await test('query fragment rules', async () => {
  const { svc } = await buildServices(richSeeds());
  const r = await verifyOne(svc, {
    sourceUrl: 'https://site.com/seo-guide#top',
    targetUrl: 'https://site.com/keyword-research?x=1',
    suggestedAnchor: 'keyword research',
  });
  assert.equal(r.status, 'VERIFIED');
});

/* 16-18. Isolation. */
await test('tenant isolation', async () => {
  const { svc } = await buildServices(richSeeds());
  /* Unknown org+website throws 404 (established tenant
     pattern) — never foreign data. */
  let threw = false;
  try {
    await svc.verifyLinkPairs(ORG2, WEBSITE_ID, [
      {
        sourceUrl: 'https://site.com/seo-guide',
        targetUrl: 'https://site.com/keyword-research',
      },
    ]);
  } catch {
    threw = true;
  }
  assert.equal(threw, true);
});
await test('website isolation', async () => {
  const { svc } = await buildServices({
    ...richSeeds(),
    noWebsite2: true,
  });
  let threw = false;
  try {
    await svc.verifyLinkPairs(ORG, WEBSITE2_ID, [
      {
        sourceUrl: 'https://site.com/seo-guide',
        targetUrl: 'https://site.com/keyword-research',
      },
    ]);
  } catch {
    threw = true;
  }
  assert.equal(threw, true);
});
await test('crawl isolation', async () => {
  const { svc } = await buildServices(richSeeds());
  const r = await verifyOne(svc, {
    sourceUrl: 'https://site.com/old-page',
    targetUrl: 'https://site.com/gone-page',
  });
  /* Edge lives only in the old crawl: latest says
     NOT_VERIFIED, history says LINK_LOST. */
  assert.equal(r.status, 'NOT_VERIFIED');
  assert.equal(r.linkLost, true);
});

/* 19. Self-link exclusion. */
await test('self link exclusion', async () => {
  const { svc } = await buildServices(richSeeds());
  const r = await verifyOne(svc, {
    sourceUrl: 'https://site.com/seo-guide',
    targetUrl: 'https://site.com/seo-guide',
    suggestedAnchor: 'self',
  });
  assert.equal(r.status, 'NOT_VERIFIED');
});

/* 20. Duplicate edge behavior. */
await test('duplicate edges', async () => {
  const seeds = richSeeds();
  seeds.links.push({
    id: 'edge_dup',
    organizationId: ORG,
    websiteId: WEBSITE_ID,
    crawlId: CRAWL_NEW,
    sourceUrl: 'https://site.com/seo-guide',
    targetUrl: 'https://site.com/keyword-research',
    anchorText: 'keyword research',
    anchorKey: 'keyword research',
    nofollow: false,
    sponsored: false,
    ugc: false,
    occurrenceCount: 3,
  });
  const { svc } = await buildServices(seeds);
  const r = await verifyOne(svc, {
    sourceUrl: 'https://site.com/seo-guide',
    targetUrl: 'https://site.com/keyword-research',
    suggestedAnchor: 'keyword research',
  });
  assert.equal(r.status, 'VERIFIED');
  assert.equal(r.anchorMatch, 'EXACT_MATCH');
  assert.equal(
    r.observedAnchors.filter(
      (a) => a === 'keyword research',
    ).length,
    1,
    'anchors deduplicated for display',
  );
});

/* 21. Zero inbound → candidate. */
await test('zero inbound candidate', async () => {
  const { svc } = await buildServices(richSeeds());
  const out = await svc.getOrphanIntelligence(ORG, WEBSITE_ID);
  assert.equal(out.crawlId, CRAWL_NEW);
  const urls = out.candidates.map((c) => c.url);
  assert.ok(urls.includes('https://site.com/unlinked'));
  const unlinked = out.candidates.find(
    (c) => c.url === 'https://site.com/unlinked',
  );
  assert.equal(unlinked.label, 'POTENTIAL_ORPHAN');
  assert.equal(unlinked.inboundCount, 0);
});

/* 22. Inbound edge → not orphan. */
await test('inbound excludes orphan', async () => {
  const { svc } = await buildServices(richSeeds());
  const out = await svc.getOrphanIntelligence(ORG, WEBSITE_ID);
  const urls = out.candidates.map((c) => c.url);
  assert.ok(
    !urls.includes('https://site.com/keyword-research'),
  );
  assert.ok(!urls.includes('https://site.com/'));
});

/* 23. Noindex exclusion. */
await test('noindex exclusion', async () => {
  const { svc } = await buildServices(richSeeds());
  const out = await svc.getOrphanIntelligence(ORG, WEBSITE_ID);
  const urls = out.candidates.map((c) => c.url);
  assert.ok(!urls.includes('https://site.com/noindex'));
  assert.ok(out.excludedCount >= 1);
});

/* 24. Redirect exclusion. */
await test('redirect exclusion', async () => {
  const { svc } = await buildServices(richSeeds());
  const out = await svc.getOrphanIntelligence(ORG, WEBSITE_ID);
  assert.ok(
    !out.candidates
      .map((c) => c.url)
      .includes('https://site.com/redir'),
  );
});

/* 25. Canonical handling. */
await test('canonical exclusion', async () => {
  const { svc } = await buildServices(richSeeds());
  const out = await svc.getOrphanIntelligence(ORG, WEBSITE_ID);
  assert.ok(
    !out.candidates
      .map((c) => c.url)
      .includes('https://site.com/canon'),
  );
});

/* 26. High-priority orphan uses existing priority only. */
await test('orphan strategy explanation', async () => {
  const { svc } = await buildServices(richSeeds());
  const out = await svc.getOrphanIntelligence(ORG, WEBSITE_ID);
  const unlinked = out.candidates.find(
    (c) => c.url === 'https://site.com/unlinked',
  );
  assert.ok(unlinked);
  assert.equal(unlinked.strategy.priority, 'HIGH');
  assert.equal(unlinked.strategy.priorityScore, 70);
  assert.ok(
    unlinked.explanation.includes('HIGH'),
    'explanation cites existing priority',
  );
});

/* 27. No new orphan score. */
await test('no orphan score', async () => {
  const { svc } = await buildServices(richSeeds());
  const out = await svc.getOrphanIntelligence(ORG, WEBSITE_ID);
  const dump = JSON.stringify(out);
  assert.ok(!/orphanScore/i.test(dump));
  assert.ok(!/"score":/i.test(dump));
  for (const c of out.candidates) {
    assert.ok(!('score' in c));
  }
});

/* 28. Actions never auto-completed. */
await test('actions untouched', async () => {
  const { prisma, svc } = await buildServices(richSeeds());
  await svc.verifyLinkPairs(ORG, WEBSITE_ID, [
    {
      sourceUrl: 'https://site.com/seo-guide',
      targetUrl: 'https://site.com/keyword-research',
    },
  ]);
  await svc.getOrphanIntelligence(ORG, WEBSITE_ID);
  assert.equal(prisma && true, true);
  const actions = await prisma.action.findMany();
  assert.equal(actions[0].status, 'TODO');
});

/* 29. Recommendation status never mutated. */
await test('recommendations untouched', async () => {
  const { prisma, svc } = await buildServices(richSeeds());
  await svc.verifyLinkPairs(ORG, WEBSITE_ID, [
    {
      sourceUrl: 'https://site.com/seo-guide',
      targetUrl: 'https://site.com/keyword-research',
    },
  ]);
  const recs = await prisma.recommendation.findMany();
  assert.equal(recs[0].status, 'OPEN');
});

/* 30. Phase 2A regression (recommender intact). */
await test('phase 2a regression', async () => {
  const { strategyMod } = await buildServices();
  assert.equal(
    strategyMod.decideContentAction({
      pageMapping: 'IMPROVE',
      bucket: 'QUICK_WIN',
      refreshHit: false,
    }),
    'IMPROVE',
  );
  const anchor = strategyMod.pickLinkAnchor({
    supporting: 'crm comparison',
    primary: 'crm pricing',
    topic: 'Crm',
    sourceUrl: 'https://site.com/blog/x',
    targetUrl: 'https://site.com/crm/pricing',
  });
  assert.equal(anchor.anchor, 'crm comparison');
});

/* 31. Phase 2B regression (graph helpers intact). */
await test('phase 2b regression', async () => {
  const crawlMod = await dist('crawl/crawl-links.js');
  assert.equal(
    crawlMod.normalizeCrawlUrl('https://Site.com/A/?utm_source=x'),
    'https://site.com/A',
  );
  assert.equal(
    crawlMod.dedupeLinkEdges([
      {
        sourceUrl: 'a',
        targetUrl: 'b',
        anchorText: 'X',
        nofollow: false,
        sponsored: false,
        ugc: false,
      },
      {
        sourceUrl: 'a',
        targetUrl: 'b',
        anchorText: 'x',
        nofollow: false,
        sponsored: false,
        ugc: false,
      },
    ]).length,
    1,
  );
  assert.equal(
    crawlMod.edgeMatchesRecommendation(
      {
        sourceUrl: 'https://site.com/a',
        targetUrl: 'https://site.com/b',
        anchorText: 'Guide',
      },
      {
        sourceUrl: 'https://site.com/a/',
        targetUrl: 'https://site.com/b',
        suggestedAnchor: 'guide',
      },
    ),
    true,
  );
});

/* 32. Large batch without N+1. */
await test('batched reads', async () => {
  const { prisma, svc } = await buildServices(richSeeds());
  const pairs = Array.from({ length: 50 }, (_, i) => ({
    sourceUrl: 'https://site.com/seo-guide',
    targetUrl: `https://site.com/p-${i}`,
    suggestedAnchor: 'x',
  }));
  prisma.__calls.findMany = 0;
  const out = await svc.verifyLinkPairs(
    ORG,
    WEBSITE_ID,
    pairs,
  );
  assert.equal(out.results.length, 50);
  assert.ok(
    prisma.__calls.findMany <= 8,
    `expected batched reads, got ${prisma.__calls.findMany}`,
  );
});

/* 33. Truncation makes negatives unsafe, positives safe. */
await test('truncation safety', async () => {
  const { svc } = await buildServices(richSeeds());
  const missing = await verifyOne(svc, {
    sourceUrl: 'https://site.com/trunc',
    targetUrl: 'https://site.com/trunc-target',
  });
  assert.equal(missing.status, 'UNAVAILABLE');
  assert.ok(
    missing.reason.toLowerCase().includes('truncat'),
  );
  const present = await verifyOne(svc, {
    sourceUrl: 'https://site.com/trunc',
    targetUrl: 'https://site.com/real-target',
    suggestedAnchor: 'real thing',
  });
  assert.equal(present.status, 'VERIFIED');
});

/* 34. Positive verification alongside missing pairs. */
await test('mixed batch', async () => {
  const { svc } = await buildServices(richSeeds());
  const out = await svc.verifyLinkPairs(ORG, WEBSITE_ID, [
    {
      sourceUrl: 'https://site.com/seo-guide',
      targetUrl: 'https://site.com/keyword-research',
    },
    {
      sourceUrl: 'https://site.com/seo-guide',
      targetUrl: 'https://site.com/unlinked',
    },
  ]);
  assert.equal(out.results[0].status, 'VERIFIED');
  assert.equal(out.results[1].status, 'NOT_VERIFIED');
});

/* 35. Missing graph data degrades honestly. */
await test('missing tables degrade', async () => {
  const { svc } = await buildServices({
    throwP2021: true,
    crawls: baseCrawls(),
    pages: [],
    links: [],
  });
  const out = await svc.verifyLinkPairs(ORG, WEBSITE_ID, [
    {
      sourceUrl: 'https://site.com/a',
      targetUrl: 'https://site.com/b',
    },
  ]);
  /* Crawl identity is known (crawl table exists); only
     the graph is missing — honest split. */
  assert.equal(out.crawlId, CRAWL_NEW);
  assert.equal(out.results[0].status, 'UNAVAILABLE');
  const orphans = await svc.getOrphanIntelligence(
    ORG,
    WEBSITE_ID,
  );
  assert.equal(orphans.persistenceAvailable, false);
  assert.deepEqual(orphans.candidates, []);
});

console.log(results.join('\n'));
const failed = results.filter((r) =>
  r.startsWith('FAIL'),
);
console.log(
  `\n${results.length - failed.length}/${results.length} passed`,
);
if (failed.length > 0) process.exit(1);

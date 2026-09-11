/*
 * RENKOO Search Baseline 1.0 — composition tests.
 *
 * Verifies window resolution, aggregation, movers with
 * valid-comparison gates, striking reuse, page rollups,
 * opportunity/next-move composition, evidence states and
 * tenant isolation. GSC/strategy/prisma are stubbed; no
 * live Google calls, no invented metrics.
 *
 * Run: npm run test:search-baseline   (builds first)
 */
import assert from 'node:assert/strict';

const dist = (p) => import(`../dist/${p}`);

const ORG = 'org1';
const WEBSITE_ID = 'w1';

const CUR_QUERIES = [
  {
    query: 'pricing',
    clicks: 120,
    impressions: 4200,
    ctr: 0.0286,
    position: 7.5,
  },
  {
    query: 'crm',
    clicks: 30,
    impressions: 900,
    ctr: 0.0333,
    position: 14,
  },
  {
    query: 'brand name',
    clicks: 500,
    impressions: 3000,
    ctr: 0.1667,
    position: 1.8,
  },
  {
    query: 'widgets',
    clicks: 2,
    impressions: 150,
    ctr: 0.0133,
    position: 32,
  },
  {
    query: 'tiny',
    clicks: 1,
    impressions: 5,
    ctr: 0.2,
    position: 45,
  },
];

const PREV_QUERIES = [
  {
    query: 'pricing',
    clicks: 80,
    impressions: 3000,
    ctr: 0.0267,
    position: 9.1,
  },
  {
    query: 'crm',
    clicks: 60,
    impressions: 1200,
    ctr: 0.05,
    position: 11,
  },
  {
    query: 'brand name',
    clicks: 480,
    impressions: 2900,
    ctr: 0.1655,
    position: 1.9,
  },
  {
    query: 'widgets',
    clicks: 3,
    impressions: 140,
    ctr: 0.0214,
    position: 30,
  },
];

const CUR_QP = [
  {
    query: 'pricing',
    page: 'https://site.com/pricing',
    clicks: 120,
    impressions: 4200,
    ctr: 0.0286,
    position: 7.5,
  },
  {
    query: 'crm',
    page: 'https://site.com/blog/crm-guide',
    clicks: 30,
    impressions: 900,
    ctr: 0.0333,
    position: 14,
  },
  {
    query: 'brand name',
    page: 'https://site.com/',
    clicks: 500,
    impressions: 3000,
    ctr: 0.1667,
    position: 1.8,
  },
];

const STRATEGY_FIXTURE = {
  opportunities: [
    {
      keyword: 'pricing',
      intent: 'COMMERCIAL',
      position: 7.5,
      impressions: 4200,
      clicks: 120,
      ctr: 0.0286,
      targetPage: 'https://site.com/pricing',
      pageMapping: 'IMPROVE',
      priority: 'HIGH',
      priorityScore: 95,
      bucket: 'QUICK_WIN',
      priorityReasons: ['Ranking at #7.5 — striking distance.'],
    },
  ],
  summary: {
    TARGET_NOW: 0,
    QUICK_WIN: 1,
    GROW: 0,
    PROTECT: 1,
    CREATE: 0,
    CONSOLIDATE: 0,
    MONITOR: 0,
    IGNORE: 0,
  },
};

function stubGoogle(overrides = {}) {
  const fail = new Set(overrides.fail ?? []);
  let queryCalls = 0;
  return {
    getSearchQueries: async () => {
      queryCalls++;
      const key =
        queryCalls === 1 ? 'queriesCur' : 'queriesPrev';
      if (fail.has('queries') || fail.has(key)) {
        throw new Error('gsc down');
      }
      return {
        rows:
          queryCalls === 1
            ? (overrides.curQueries ?? CUR_QUERIES)
            : (overrides.prevQueries ?? PREV_QUERIES),
      };
    },
    getQueryPages: async () => {
      if (fail.has('queryPages')) throw new Error('gsc down');
      return { rows: CUR_QP };
    },
    getSearchAnalytics: async (org, start) => {
      if (fail.has('daily')) throw new Error('gsc down');
      return {
        rows: [
          { keys: [`${start.slice(0, 7)}-01`], clicks: 10 },
          { keys: [`${start.slice(0, 7)}-02`], clicks: 12 },
        ],
      };
    },
  };
}

function stubPrisma(seeds = {}) {
  return {
    website: {
      findFirst: async ({ where }) => {
        if (seeds.noWebsite) return null;
        assert.equal(where.organizationId, ORG);
        return {
          id: WEBSITE_ID,
          name: 'Site',
          url: 'https://site.com',
        };
      },
    },
    recommendation: {
      findMany: async ({ where }) => {
        assert.equal(where.organizationId, ORG);
        assert.equal(where.websiteId, WEBSITE_ID);
        return seeds.recommendations ?? [];
      },
    },
    action: {
      findMany: async () => seeds.actions ?? [],
    },
    crawl: {
      findFirst: async () =>
        seeds.crawl === false
          ? null
          : {
              id: 'crawl_1',
              completedAt: new Date('2026-09-08T00:00:00Z'),
            },
    },
    crawlPage: {
      count: async () => seeds.pages ?? 42,
    },
    seoIssue: {
      count: async () => seeds.issues ?? 3,
    },
    crawlLink: {
      count: async () => seeds.links ?? 120,
    },
  };
}

async function buildService({
  google = stubGoogle(),
  prismaSeeds = {},
  strategy = STRATEGY_FIXTURE,
  links = { ok: true },
} = {}) {
  const mod = await dist(
    'keywords/search-baseline.service.js',
  );
  const prisma = stubPrisma(prismaSeeds);
  const svc = new mod.SearchBaselineService(
    prisma,
    google,
    {
      strategy: async () => {
        if (strategy === null)
          throw new Error('strategy down');
        return strategy;
      },
    },
    {
      getLinks: async () => {
        if (!links.ok) throw new Error('links down');
        return {
          persistenceAvailable: true,
          total: 0,
          clusters: [],
          links: [],
        };
      },
    },
  );
  return { svc, mod };
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

/* 1. Baseline composition happy path. */
await test('baseline composition', async () => {
  const { svc } = await buildService();
  const res = await svc.getBaseline(ORG, {
    websiteId: WEBSITE_ID,
    days: 28,
  });
  assert.equal(res.website.id, WEBSITE_ID);
  assert.equal(res.gscConnected, true);
  assert.equal(res.summary.clicks.value, 653);
  assert.equal(res.summary.impressions.value, 8255);
  assert.equal(res.visibility.top3, 1);
  assert.equal(res.visibility.top10, 2);
  assert.ok(res.trend.available);
  assert.ok(res.aha.title.length > 0);
  assert.ok(res.striking.length > 0);
  assert.ok(res.pages.length > 0);
  assert.ok(res.opportunities.length > 0);
  assert.ok(res.nextMoves.length <= 5);
  assert.equal(res.health.length, 5);
});

/* 2. No GSC data. */
await test('no gsc data', async () => {
  const { svc } = await buildService({
    google: stubGoogle({ fail: ['queries'] }),
  });
  const res = await svc.getBaseline(ORG, {
    websiteId: WEBSITE_ID,
  });
  assert.equal(res.gscConnected, false);
  assert.equal(res.summary, null);
  assert.equal(res.visibility, null);
  assert.equal(res.aha.kind, 'EMPTY');
  assert.deepEqual(res.winners, []);
  assert.deepEqual(res.losers, []);
  assert.equal(res.evidence.gsc, 'UNAVAILABLE');
});

/* 3. Partial GSC data degrades honestly. */
await test('partial gsc data', async () => {
  const { svc } = await buildService({
    google: stubGoogle({ fail: ['queriesPrev'] }),
  });
  const res = await svc.getBaseline(ORG, {
    websiteId: WEBSITE_ID,
  });
  assert.equal(res.gscConnected, false);
  assert.equal(res.summary, null);
});

/* 4. Valid comparison windows. */
await test('valid comparison', async () => {
  const { svc } = await buildService();
  const res = await svc.getBaseline(ORG, {
    websiteId: WEBSITE_ID,
    days: 28,
  });
  assert.equal(res.period.days, 28);
  assert.ok(
    res.period.previous.endDate <
      res.period.current.startDate,
  );
  const span = (w) =>
    (new Date(w.endDate) - new Date(w.startDate)) /
    86400000 +
    1;
  assert.equal(span(res.period.current), 28);
  assert.equal(span(res.period.previous), 28);
  assert.equal(res.summary.clicks.delta, 653 - 623);
});

/* 5. Invalid window rejected. */
await test('invalid window', async () => {
  const { svc, mod } = await buildService();
  assert.throws(
    () => mod.resolveBaselineWindows(30),
    /days must be one of/,
  );
  await assert.rejects(
    svc.getBaseline(ORG, {
      websiteId: WEBSITE_ID,
      days: 30,
    }),
    /days must be one of/,
  );
});

/* 6. Striking distance reuses strategy. */
await test('striking distance', async () => {
  const { svc } = await buildService();
  const res = await svc.getBaseline(ORG, {
    websiteId: WEBSITE_ID,
  });
  const row = res.striking[0];
  assert.equal(row.keyword, 'pricing');
  assert.equal(row.mapping, 'IMPROVE');
  assert.equal(row.priority, 'HIGH');
  assert.ok(row.why.length > 0);
  assert.ok(row.evidence.includes('Strategy'));
});

/* 7-8. Winners and losers. */
await test('winners', async () => {
  const { svc } = await buildService();
  const res = await svc.getBaseline(ORG, {
    websiteId: WEBSITE_ID,
  });
  assert.equal(res.winners[0].query, 'pricing');
  assert.equal(res.winners[0].clicksDelta, 40);
  assert.ok(
    !res.winners.some((w) => w.query === 'tiny'),
    'demand gate excludes trivia',
  );
});
await test('losers', async () => {
  const { svc } = await buildService();
  const res = await svc.getBaseline(ORG, {
    websiteId: WEBSITE_ID,
  });
  assert.equal(res.losers[0].query, 'crm');
  assert.equal(res.losers[0].clicksDelta, -30);
});

/* 9. Page aggregation with strategy mapping. */
await test('page aggregation', async () => {
  const { svc } = await buildService();
  const res = await svc.getBaseline(ORG, {
    websiteId: WEBSITE_ID,
  });
  const page = res.pages.find(
    (p) => p.url === 'https://site.com/pricing',
  );
  assert.ok(page);
  assert.equal(page.clicks, 120);
  assert.deepEqual(page.topKeywords, ['pricing']);
  assert.equal(page.mapping, 'IMPROVE');
  assert.equal(page.priority, 'HIGH');
});

/* 10. Strategy integration fallback. */
await test('strategy fallback', async () => {
  const { svc } = await buildService({ strategy: null });
  const res = await svc.getBaseline(ORG, {
    websiteId: WEBSITE_ID,
  });
  assert.equal(res.evidence.strategy, 'UNAVAILABLE');
  assert.ok(
    res.striking.every((s) => s.priority === null),
    'GSC fallback carries no strategy priority',
  );
  assert.ok(
    res.striking.some((s) => s.keyword === 'pricing'),
  );
});

/* 11. Recommendation/action integration. */
await test('recommendation action integration', async () => {
  const { svc } = await buildService({
    prismaSeeds: {
      recommendations: [
        {
          id: 'rec1',
          source: 'CONTENT',
          type: 'REFRESH_REQUIRED',
          title: 'Refresh x',
          description: 'Declining.',
          priority: 'MEDIUM',
          status: 'OPEN',
          metadata: { query: 'crm' },
        },
      ],
      actions: [
        {
          id: 'act1',
          title: 'Ship pricing update',
          description: 'Committed.',
          status: 'TODO',
        },
      ],
    },
  });
  const res = await svc.getBaseline(ORG, {
    websiteId: WEBSITE_ID,
  });
  assert.ok(
    res.opportunities.some((o) => o.kind === 'REFRESH'),
  );
  assert.equal(
    res.nextMoves[0].title,
    'Ship pricing update',
  );
  assert.ok(res.nextMoves.length <= 5);
});

/* 12. Evidence states travel with metrics. */
await test('evidence states', async () => {
  const { svc } = await buildService();
  const res = await svc.getBaseline(ORG, {
    websiteId: WEBSITE_ID,
  });
  assert.equal(res.summary.clicks.evidence, 'VERIFIED');
  assert.equal(
    res.summary.avgPosition.evidence,
    'ESTIMATED',
  );
  assert.ok(
    ['INFERRED', 'VERIFIED'].includes(
      res.striking[0].evidenceState,
    ),
  );
});

/* 13. Unavailable states are explicit. */
await test('unavailable states', async () => {
  const { svc } = await buildService();
  const res = await svc.getBaseline(ORG, {
    websiteId: WEBSITE_ID,
  });
  assert.ok(res.unavailable.brandSplit);
  assert.ok(res.unavailable.deviceSplit);
  assert.ok(res.unavailable.countrySplit);
  const ai = res.health.find((h) => h.key === 'ai');
  assert.equal(ai.state, 'UNAVAILABLE');
});

/* 14. Tenant isolation. */
await test('tenant isolation', async () => {
  const { svc } = await buildService({
    prismaSeeds: { noWebsite: true },
  });
  await assert.rejects(
    svc.getBaseline(ORG, {
      websiteId: WEBSITE_ID,
    }),
    /Website not found/,
  );
});

/* 15. Empty website rows stay honest. */
await test('empty website', async () => {
  const g = stubGoogle();
  g.getSearchQueries = async () => ({ rows: [] });
  g.getQueryPages = async () => ({ rows: [] });
  g.getSearchAnalytics = async () => ({ rows: [] });
  const { svc } = await buildService({
    google: g,
    strategy: { opportunities: [], summary: {} },
  });
  const res = await svc.getBaseline(ORG, {
    websiteId: WEBSITE_ID,
  });
  assert.equal(res.gscConnected, true);
  assert.equal(res.summary.clicks.value, 0);
  assert.equal(res.summary.avgPosition.value, null);
  assert.equal(res.visibility.top10, 0);
  assert.deepEqual(res.striking, []);
  assert.equal(res.aha.kind, 'BASELINE');
});

/* 16. Crawl unavailable degrades health. */
await test('crawl unavailable', async () => {
  const { svc } = await buildService({
    prismaSeeds: { crawl: false, pages: 0, issues: 0 },
  });
  const res = await svc.getBaseline(ORG, {
    websiteId: WEBSITE_ID,
  });
  const tech = res.health.find(
    (h) => h.key === 'technical',
  );
  assert.equal(tech.state, 'UNAVAILABLE');
  assert.ok(
    !res.opportunities.some(
      (o) => o.kind === 'TECHNICAL',
    ),
  );
});

/* 17. Malformed rows never crash or inflate bands. */
await test('malformed rows', async () => {
  const { svc, mod } = await buildService();
  assert.deepEqual(
    mod.bandCounts([
      { position: 0 },
      { position: null },
      { position: 'abc' },
      { position: 5 },
    ]),
    { top3: 0, top10: 1, top20: 1, top100: 1 },
  );
  const totals = mod.aggregateQueryRows([
    { clicks: 'x', impressions: NaN },
    {},
  ]);
  assert.equal(totals.clicks, 0);
  assert.equal(totals.avgPosition, null);
});

/* 18. Duplicate rows collapse. */
await test('duplicate prevention', async () => {
  const { svc, mod } = await buildService();
  const { winners } = mod.pickMovers(
    [
      ...CUR_QUERIES,
      { ...CUR_QUERIES[0] },
      { ...CUR_QUERIES[0] },
    ],
    PREV_QUERIES,
    new Map(),
    10,
  );
  assert.equal(
    winners.filter((w) => w.query === 'pricing').length,
    1,
  );
});

/* 19. Window resolution across periods. */
await test('window resolution', async () => {
  const { svc, mod } = await buildService();
  for (const days of [7, 28, 90]) {
    const w = mod.resolveBaselineWindows(
      days,
      new Date('2026-09-09T00:00:00Z'),
    );
    assert.equal(w.current.endDate, '2026-09-08');
    const span = (p) =>
      (new Date(p.endDate) - new Date(p.startDate)) /
        86400000 +
      1;
    assert.equal(span(w.current), days);
    assert.equal(span(w.previous), days);
  }
  void svc;
});

console.log(results.join('\n'));
const failed = results.filter((r) =>
  r.startsWith('FAIL'),
);
console.log(
  `\n${results.length - failed.length}/${results.length} passed`,
);
if (failed.length > 0) process.exit(1);

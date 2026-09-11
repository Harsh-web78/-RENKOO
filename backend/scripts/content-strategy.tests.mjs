/*
 * RENKOO 6.0 Content Strategy Foundation — persistence +
 * composition tests.
 *
 * Verifies that strategy opportunities, clusters and the
 * keyword -> topic -> page -> decision -> item -> brief ->
 * draft -> action chain persist idempotently and compose
 * from EXISTING rows only (no new scoring, no fabricated
 * metrics, no live provider calls).
 *
 * Zero new dependencies: plain node + assert against the
 * compiled dist output, with an in-memory Prisma stub.
 *
 * Run: npm run test:content-strategy   (builds first)
 */
import assert from 'node:assert/strict';

delete process.env.DATAFORSEO_LOGIN;
delete process.env.DATAFORSEO_PASSWORD;

const dist = (p) => import(`../dist/${p}`);

const ORG = 'org1';
const ORG2 = 'org2';
const WEBSITE_ID = 'w1';
const WEBSITE2_ID = 'w2';

/* Strategy-shaped fixtures (same vocabulary as the real
   KeywordStrategyService output — scores pass through,
   never recomputed here). */
const OPPORTUNITIES = [
  {
    keyword: 'pricing',
    intent: 'COMMERCIAL',
    position: 8.2,
    impressions: 4200,
    clicks: 120,
    ctr: 0.0286,
    volume: 8100,
    keywordDifficulty: 22,
    targetPage: 'https://site.com/pricing',
    targetPageSource: 'OBSERVED',
    pageMapping: 'IMPROVE',
    priority: 'HIGH',
    priorityScore: 95,
    bucket: 'QUICK_WIN',
    quickWin: { action: 'On https://site.com/pricing: rewrite the title; add one internal link.' },
  },
  {
    keyword: 'crm',
    intent: 'COMMERCIAL',
    position: 14,
    impressions: 900,
    clicks: 30,
    ctr: 0.0333,
    volume: null,
    keywordDifficulty: null,
    targetPage: 'https://site.com/blog/crm-guide',
    targetPageSource: 'OBSERVED',
    pageMapping: 'CONSOLIDATE',
    priority: 'MEDIUM',
    priorityScore: 55,
    bucket: 'CONSOLIDATE',
    quickWin: null,
  },
  {
    keyword: 'demo',
    intent: 'TRANSACTIONAL',
    position: null,
    impressions: null,
    clicks: null,
    ctr: null,
    volume: null,
    keywordDifficulty: null,
    targetPage: null,
    targetPageSource: null,
    pageMapping: 'CREATE',
    priority: 'MEDIUM',
    priorityScore: 44,
    bucket: 'CREATE',
    quickWin: null,
  },
  {
    keyword: 'brand name',
    intent: 'NAVIGATIONAL',
    position: 1.8,
    impressions: 3000,
    clicks: 500,
    ctr: 0.1667,
    volume: null,
    keywordDifficulty: null,
    targetPage: 'https://site.com/',
    targetPageSource: 'OBSERVED',
    pageMapping: 'PROTECT',
    priority: 'LOW',
    priorityScore: 30,
    bucket: 'PROTECT',
    quickWin: null,
  },
  {
    keyword: 'enterprise widgets',
    intent: 'INFORMATIONAL',
    position: 32,
    impressions: 150,
    clicks: 2,
    ctr: 0.0133,
    volume: null,
    keywordDifficulty: null,
    targetPage: 'https://site.com/blog/old',
    targetPageSource: 'OBSERVED',
    pageMapping: 'OPTIMIZE',
    priority: 'LOW',
    priorityScore: 25,
    bucket: 'GROW',
    quickWin: null,
  },
  {
    keyword: 'gmail homepage',
    intent: 'NAVIGATIONAL',
    position: 45,
    impressions: 8,
    clicks: 1,
    ctr: 0.125,
    volume: null,
    keywordDifficulty: null,
    targetPage: null,
    targetPageSource: null,
    pageMapping: 'IGNORE',
    priority: 'LOW',
    priorityScore: 10,
    bucket: 'IGNORE',
    quickWin: null,
  },
];

const CLUSTERS = [
  {
    topic: 'Pricing',
    primaryKeyword: 'pricing',
    supportingKeywords: ['pricing plans'],
    size: 2,
    intent: 'COMMERCIAL',
    existingPages: ['https://site.com/pricing'],
    missingPages: 0,
    cannibalizationRisk: false,
    priority: 'HIGH',
    pillarPage: 'https://site.com/pricing',
    supportingContent: [],
    recommendedPageType: 'Comparison / commercial landing page',
  },
  {
    topic: 'Crm',
    primaryKeyword: 'crm',
    supportingKeywords: [],
    size: 1,
    intent: 'COMMERCIAL',
    existingPages: [
      'https://site.com/blog/crm-guide',
      'https://site.com/blog/crm-tips',
    ],
    missingPages: 0,
    cannibalizationRisk: true,
    priority: 'MEDIUM',
    pillarPage: 'https://site.com/blog/crm-guide',
    supportingContent: [],
    recommendedPageType: 'Comparison / commercial landing page',
  },
];

/* Tiny in-memory collection supporting the equality where
   shapes this service uses (top-level fields only; nested
   metadata matched in service-side JS, same as prod). */
function collection(rows = [], idPrefix = 'row') {
  let seq = rows.length;
  const matches = (row, where = {}) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        if ('in' in v) return v.in.includes(row[k]);
        return true;
      }
      return row[k] === v;
    });
  return {
    __rows: rows,
    findMany: async ({ where, take } = {}) => {
      const out = rows.filter((r) => matches(r, where));
      return typeof take === 'number' ? out.slice(0, take) : out;
    },
    findFirst: async ({ where } = {}) =>
      rows.find((r) => matches(r, where)) ?? null,
    create: async ({ data }) => {
      seq += 1;
      const row = {
        ...data,
        id: data.id ?? `${idPrefix}_${seq}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      rows.push(row);
      return row;
    },
    update: async ({ where, data }) => {
      const row = rows.find((r) => {
        const key = Object.keys(where)[0];
        const val = where[key];
        if (val && typeof val === 'object') {
          return Object.entries(val).every(
            ([k, v]) => r[k] === v,
          );
        }
        return r[key] === val;
      });
      if (!row) throw new Error('record not found');
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
    upsert: async ({ where, create, update }) => {
      const key = Object.keys(where)[0];
      const val = where[key];
      const row = rows.find((r) =>
        Object.entries(val).every(([k, v]) => r[k] === v),
      );
      if (row) {
        Object.assign(row, update, { updatedAt: new Date() });
        return row;
      }
      seq += 1;
      const created = {
        ...create,
        id: `${idPrefix}_${seq}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      rows.push(created);
      return created;
    },
  };
}

function makePrisma(seeds = {}) {
  const db = {
    contentCluster: collection([], 'cc'),
    contentStrategyLink: collection([], 'csl'),
    contentItem: collection(seeds.items ?? [], 'item'),
    contentBrief: collection(seeds.briefs ?? [], 'brief'),
    contentDraft: collection(seeds.drafts ?? [], 'draft'),
    action: collection(seeds.actions ?? [], 'act'),
    recommendation: collection(seeds.recommendations ?? [], 'rec'),
  };
  return {
    ...db,
    website: {
      findFirst: async () => ({
        id: WEBSITE_ID,
        organizationId: ORG,
        name: 'Site',
        url: 'https://site.com',
      }),
    },
  };
}

const RICH_SEEDS = {
  items: [
    {
      id: 'item_pricing',
      organizationId: ORG,
      websiteId: WEBSITE_ID,
      title: 'Pricing page',
      targetQuery: 'pricing',
      pageUrl: 'https://site.com/pricing',
      status: 'DRAFT',
    },
  ],
  briefs: [
    {
      id: 'brief_pricing',
      organizationId: ORG,
      websiteId: WEBSITE_ID,
      itemId: 'item_pricing',
      targetQuery: 'pricing',
      createdAt: new Date(),
    },
    {
      id: 'brief_demo',
      organizationId: ORG,
      websiteId: WEBSITE_ID,
      itemId: null,
      targetQuery: 'demo',
      createdAt: new Date(),
    },
  ],
  drafts: [
    {
      id: 'draft_pricing',
      organizationId: ORG,
      websiteId: WEBSITE_ID,
      itemId: 'item_pricing',
      briefId: 'brief_pricing',
      mode: 'DRAFT',
      createdAt: new Date(),
    },
  ],
  actions: [
    {
      id: 'act_pricing',
      organizationId: ORG,
      websiteId: WEBSITE_ID,
      status: 'TODO',
      title: 'Improve pricing',
      metadata: { strategyKeyword: 'pricing' },
      recommendationId: null,
      createdAt: new Date(),
    },
    {
      id: 'act_pricing_dead',
      organizationId: ORG,
      websiteId: WEBSITE_ID,
      status: 'DISMISSED',
      title: 'Old pricing task',
      metadata: { strategyKeyword: 'pricing' },
      recommendationId: null,
      createdAt: new Date('2020-01-01'),
    },
  ],
  recommendations: [
    {
      id: 'rec_widgets',
      organizationId: ORG,
      websiteId: WEBSITE_ID,
      source: 'CONTENT',
      type: 'REFRESH_REQUIRED',
      status: 'OPEN',
      description: 'Clicks fell 20 to 5 over comparable 28-day windows.',
      metadata: { query: 'enterprise widgets' },
    },
  ],
};

const ISOLATION_SEEDS = {
  items: [
    {
      id: 'item_other_org',
      organizationId: ORG2,
      websiteId: WEBSITE2_ID,
      title: 'Other org page',
      targetQuery: 'pricing',
      status: 'DRAFT',
    },
    {
      id: 'item_other_site',
      organizationId: ORG,
      websiteId: WEBSITE2_ID,
      title: 'Other site page',
      targetQuery: 'pricing',
      status: 'DRAFT',
    },
  ],
  briefs: [],
  drafts: [],
  actions: [],
  recommendations: [],
};

async function buildService(seeds = {}, strategyResult = null) {
  const svcMod = await dist('keywords/content-strategy.service.js');
  const prisma = makePrisma(seeds);
  const fakeStrategy = {
    strategy: async () => ({
      website: {
        id: WEBSITE_ID,
        name: 'Site',
        url: 'https://site.com',
      },
      period: { startDate: '2026-08-12', endDate: '2026-09-08' },
      dataAvailability: {
        provider: false,
        gscConnected: true,
        notes: ['Search volume unavailable — connect a supported provider.'],
      },
      opportunities: OPPORTUNITIES,
      clusters: CLUSTERS,
    }),
  };
  const fakeResearch = {
    getCorpora: async () => ({
      website: { id: WEBSITE_ID },
      siteCorpus: new Map(),
      competitorCorpus: new Map(),
      competitorCount: 0,
    }),
    getGscMaps: async () => ({
      byQuery: new Map(),
      byQueryPages: new Map(),
    }),
    getParentTopic: (kw) => kw,
  };
  const svc = new svcMod.ContentStrategyService(
    prisma,
    strategyResult ?? fakeStrategy,
    fakeResearch,
  );
  return { prisma, svc, svcMod };
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

/* 1. Strategy opportunity persistence. */
await test('strategy opportunity persistence', async () => {
  const { prisma, svc } = await buildService();
  const out = await svc.syncFromStrategy(ORG, WEBSITE_ID, {
    opportunities: OPPORTUNITIES,
    clusters: [],
  });
  assert.equal(out.persisted, true);
  assert.equal(out.links, OPPORTUNITIES.length);
  const rows = prisma.contentStrategyLink.__rows;
  assert.equal(rows.length, OPPORTUNITIES.length);
  const pricing = rows.find((r) => r.keyword === 'pricing');
  assert.ok(pricing);
  assert.equal(pricing.targetPage, 'https://site.com/pricing');
  assert.equal(pricing.pageMapping, 'IMPROVE');
  assert.equal(pricing.bucket, 'QUICK_WIN');
  assert.equal(pricing.priority, 'HIGH');
  assert.equal(pricing.priorityScore, 95);
});

/* 2. Cluster persistence. */
await test('cluster persistence', async () => {
  const { prisma, svc } = await buildService();
  const out = await svc.syncFromStrategy(ORG, WEBSITE_ID, {
    opportunities: [],
    clusters: CLUSTERS,
  });
  assert.equal(out.clusters, CLUSTERS.length);
  const rows = prisma.contentCluster.__rows;
  assert.equal(rows.length, CLUSTERS.length);
  const pricing = rows.find((r) => r.topic === 'Pricing');
  assert.ok(pricing);
  assert.equal(pricing.primaryKeyword, 'pricing');
  assert.deepEqual(pricing.supportingKeywords, ['pricing plans']);
  assert.equal(pricing.pillarPage, 'https://site.com/pricing');
  assert.equal(pricing.priority, 'HIGH');
  const crm = rows.find((r) => r.topic === 'Crm');
  assert.equal(crm.cannibalizationRisk, true);
});

/* 3. Keyword -> topic relationship. */
await test('keyword to topic relationship', async () => {
  const { prisma, svc } = await buildService();
  await svc.syncFromStrategy(ORG, WEBSITE_ID, {
    opportunities: OPPORTUNITIES,
    clusters: CLUSTERS,
  });
  const pricing = prisma.contentStrategyLink.__rows.find(
    (r) => r.keyword === 'pricing',
  );
  assert.equal(pricing.topic, 'Pricing');
  const crm = prisma.contentStrategyLink.__rows.find(
    (r) => r.keyword === 'crm',
  );
  assert.equal(crm.topic, 'Crm');
});

/* 4. Keyword -> page relationship. */
await test('keyword to page relationship', async () => {
  const { prisma, svc } = await buildService();
  await svc.syncFromStrategy(ORG, WEBSITE_ID, {
    opportunities: OPPORTUNITIES,
    clusters: [],
  });
  const byKw = Object.fromEntries(
    prisma.contentStrategyLink.__rows.map((r) => [r.keyword, r]),
  );
  assert.equal(byKw.pricing.targetPage, 'https://site.com/pricing');
  assert.equal(byKw.demo.targetPage, null);
  assert.equal(byKw['brand name'].targetPage, 'https://site.com/');
});

/* 5. Opportunity -> content relationship (+REFRESH decision). */
await test('opportunity to content relationship', async () => {
  const { svc } = await buildService(RICH_SEEDS);
  const res = await svc.getContentOpportunities(ORG, {
    websiteId: WEBSITE_ID,
  });
  const pricing = res.opportunities.find(
    (o) => o.keyword === 'pricing',
  );
  assert.ok(pricing.content.exists);
  assert.equal(pricing.content.id, 'item_pricing');
  assert.equal(pricing.content.status, 'DRAFT');
  assert.equal(pricing.contentAction, 'IMPROVE');
  const widgets = res.opportunities.find(
    (o) => o.keyword === 'enterprise widgets',
  );
  /* Persisted GSC decline on an existing page -> REFRESH,
     with the original mapping preserved in mappingNote. */
  assert.equal(widgets.contentAction, 'REFRESH');
  assert.ok(widgets.refresh && widgets.refresh.needed);
  assert.equal(widgets.refresh.recommendationId, 'rec_widgets');
  assert.ok(widgets.mappingNote.includes('OPTIMIZE'));
  const demo = res.opportunities.find((o) => o.keyword === 'demo');
  assert.equal(demo.content.exists, false);
  assert.equal(demo.contentAction, 'CREATE');
});

/* 6. Opportunity -> brief relationship (item-linked + standalone). */
await test('opportunity to brief relationship', async () => {
  const { svc } = await buildService(RICH_SEEDS);
  const res = await svc.getContentOpportunities(ORG, {
    websiteId: WEBSITE_ID,
  });
  const pricing = res.opportunities.find(
    (o) => o.keyword === 'pricing',
  );
  assert.ok(pricing.brief.exists);
  assert.equal(pricing.brief.id, 'brief_pricing');
  const demo = res.opportunities.find((o) => o.keyword === 'demo');
  assert.ok(demo.brief.exists);
  assert.equal(demo.brief.id, 'brief_demo');
  const crm = res.opportunities.find((o) => o.keyword === 'crm');
  assert.equal(crm.brief.exists, false);
});

/* 7. Opportunity -> draft relationship. */
await test('opportunity to draft relationship', async () => {
  const { svc } = await buildService(RICH_SEEDS);
  const res = await svc.getContentOpportunities(ORG, {
    websiteId: WEBSITE_ID,
  });
  const pricing = res.opportunities.find(
    (o) => o.keyword === 'pricing',
  );
  assert.ok(pricing.draft.exists);
  assert.equal(pricing.draft.id, 'draft_pricing');
  const demo = res.opportunities.find((o) => o.keyword === 'demo');
  assert.equal(demo.draft.exists, false);
});

/* 8. Opportunity -> action relationship (DISMISSED ignored). */
await test('opportunity to action relationship', async () => {
  const { svc } = await buildService(RICH_SEEDS);
  const res = await svc.getContentOpportunities(ORG, {
    websiteId: WEBSITE_ID,
  });
  const pricing = res.opportunities.find(
    (o) => o.keyword === 'pricing',
  );
  assert.ok(pricing.action.exists);
  assert.equal(pricing.action.id, 'act_pricing');
  assert.equal(pricing.action.status, 'TODO');
  const crm = res.opportunities.find((o) => o.keyword === 'crm');
  assert.equal(crm.action.exists, false);
});

/* 9. Idempotent strategy rebuild. */
await test('idempotent strategy rebuild', async () => {
  const { prisma, svc } = await buildService();
  const input = {
    opportunities: OPPORTUNITIES,
    clusters: CLUSTERS,
  };
  await svc.syncFromStrategy(ORG, WEBSITE_ID, input);
  await svc.syncFromStrategy(ORG, WEBSITE_ID, input);
  await svc.syncFromStrategy(ORG, WEBSITE_ID, input);
  assert.equal(
    prisma.contentStrategyLink.__rows.length,
    OPPORTUNITIES.length,
  );
  assert.equal(
    prisma.contentCluster.__rows.length,
    CLUSTERS.length,
  );
  /* Rescored values update the same rows. */
  const rescored = OPPORTUNITIES.map((o) =>
    o.keyword === 'pricing'
      ? { ...o, priorityScore: 96 }
      : o,
  );
  await svc.syncFromStrategy(ORG, WEBSITE_ID, {
    opportunities: rescored,
    clusters: CLUSTERS,
  });
  assert.equal(
    prisma.contentStrategyLink.__rows.length,
    OPPORTUNITIES.length,
  );
  assert.equal(
    prisma.contentStrategyLink.__rows.find(
      (r) => r.keyword === 'pricing',
    ).priorityScore,
    96,
  );
});

/* 10. Duplicate prevention (case-insensitive identity). */
await test('duplicate prevention', async () => {
  const { prisma, svc } = await buildService();
  await svc.syncFromStrategy(ORG, WEBSITE_ID, {
    opportunities: OPPORTUNITIES,
    clusters: [],
  });
  await svc.syncFromStrategy(ORG, WEBSITE_ID, {
    opportunities: OPPORTUNITIES.map((o) => ({
      ...o,
      keyword: o.keyword.toUpperCase(),
    })),
    clusters: [],
  });
  assert.equal(
    prisma.contentStrategyLink.__rows.length,
    OPPORTUNITIES.length,
  );
});

/* 11. Existing brief reuse (no new brief rows). */
await test('existing brief reuse', async () => {
  const { prisma, svc } = await buildService(RICH_SEEDS);
  const before = prisma.contentBrief.__rows.length;
  const res = await svc.getContentOpportunities(ORG, {
    websiteId: WEBSITE_ID,
  });
  assert.equal(prisma.contentBrief.__rows.length, before);
  const pricing = res.opportunities.find(
    (o) => o.keyword === 'pricing',
  );
  assert.equal(pricing.brief.id, 'brief_pricing');
  const link = prisma.contentStrategyLink.__rows.find(
    (r) => r.keyword === 'pricing',
  );
  assert.equal(link.briefId, 'brief_pricing');
});

/* 12. Existing draft reuse. */
await test('existing draft reuse', async () => {
  const { prisma, svc } = await buildService(RICH_SEEDS);
  const before = prisma.contentDraft.__rows.length;
  const res = await svc.getContentOpportunities(ORG, {
    websiteId: WEBSITE_ID,
  });
  assert.equal(prisma.contentDraft.__rows.length, before);
  const pricing = res.opportunities.find(
    (o) => o.keyword === 'pricing',
  );
  assert.equal(pricing.draft.id, 'draft_pricing');
  const link = prisma.contentStrategyLink.__rows.find(
    (r) => r.keyword === 'pricing',
  );
  assert.equal(link.draftId, 'draft_pricing');
});

/* 13. Existing action reuse. */
await test('existing action reuse', async () => {
  const { prisma, svc } = await buildService(RICH_SEEDS);
  const before = prisma.action.__rows.length;
  const res = await svc.getContentOpportunities(ORG, {
    websiteId: WEBSITE_ID,
  });
  assert.equal(prisma.action.__rows.length, before);
  const link = prisma.contentStrategyLink.__rows.find(
    (r) => r.keyword === 'pricing',
  );
  assert.equal(link.actionId, 'act_pricing');
});

/* 14. Tenant isolation. */
await test('tenant isolation', async () => {
  const { svc } = await buildService(ISOLATION_SEEDS);
  const res = await svc.getContentOpportunities(ORG, {
    websiteId: WEBSITE_ID,
  });
  const pricing = res.opportunities.find(
    (o) => o.keyword === 'pricing',
  );
  assert.equal(pricing.content.exists, false);
  assert.equal(pricing.brief.exists, false);
  assert.equal(pricing.action.exists, false);
});

/* 15. Website isolation. */
await test('website isolation', async () => {
  const { svc } = await buildService(ISOLATION_SEEDS);
  const links = await svc.getLinks(ORG, WEBSITE2_ID);
  assert.equal(links.total, 0);
  const res = await svc.getContentOpportunities(ORG, {
    websiteId: WEBSITE_ID,
  });
  const pricing = res.opportunities.find(
    (o) => o.keyword === 'pricing',
  );
  assert.equal(pricing.content.exists, false);
});

/* 16. DataForSEO unavailable degradation. */
await test('provider unavailable degradation', async () => {
  const { svc } = await buildService();
  const res = await svc.getContentOpportunities(ORG, {
    websiteId: WEBSITE_ID,
  });
  assert.equal(res.dataAvailability.provider, false);
  assert.ok(
    res.dataAvailability.notes.some((n) =>
      n.includes('unavailable'),
    ),
  );
  const crm = res.opportunities.find((o) => o.keyword === 'crm');
  assert.equal(crm.volume, null);
  assert.equal(crm.keywordDifficulty, null);
  assert.equal(crm.sources.provider, 'UNAVAILABLE');
  const pricing = res.opportunities.find(
    (o) => o.keyword === 'pricing',
  );
  assert.equal(pricing.sources.provider, 'PROVIDER');
});

/* 17. No fabricated metrics. */
await test('no fabricated metrics', async () => {
  const { svc } = await buildService();
  const res = await svc.getContentOpportunities(ORG, {
    websiteId: WEBSITE_ID,
  });
  const providerNumber = /(\$\d|KD \d|[\d,]{5,} searches)/;
  for (const o of res.opportunities) {
    if (o.volume === null) {
      assert.ok(
        !providerNumber.test(
          [o.mappingNote ?? ''].join(' '),
        ),
        `fabricated provider number for ${o.keyword}`,
      );
    }
    assert.ok(
      ['OBSERVED', 'PROVIDER', 'INFERENCE', 'UNAVAILABLE'].includes(
        o.sources.provider,
      ),
      `unknown source label for ${o.keyword}`,
    );
    assert.equal(o.sources.position, 'OBSERVED');
    assert.equal(o.sources.decision, 'INFERENCE');
  }
});

/* 18. StrategyBrief history still works. */
await test('strategy brief history', async () => {
  const strategyMod = await dist(
    'keywords/keyword-strategy.service.js',
  );
  const prisma = makePrisma();
  prisma.strategyBrief = {
    create: async ({ data }) => ({
      ...data,
      id: 'br_1',
      createdAt: new Date(),
    }),
    findMany: async () => [
      {
        id: 'br_1',
        provider: 'GEMINI',
        model: 'gemini-3.6-flash',
        itemCount: 8,
        createdAt: new Date(),
      },
    ],
    count: async () => 1,
  };
  const svc = new strategyMod.KeywordStrategyService(
    prisma,
    {},
    {},
    {},
    {},
    {},
  );
  const out = await svc.listBriefs(ORG, WEBSITE_ID);
  assert.equal(out.total, 1);
  assert.equal(out.briefs[0].provider, 'GEMINI');
  assert.equal(out.briefs[0].itemCount, 8);
});

/* 19. Empty content state. */
await test('empty content state', async () => {
  const { svc } = await buildService();
  const res = await svc.getContentOpportunities(ORG, {
    websiteId: WEBSITE_ID,
  });
  assert.equal(res.persistenceAvailable, true);
  for (const o of res.opportunities) {
    assert.equal(o.content.exists, false);
    assert.equal(o.brief.exists, false);
    assert.equal(o.draft.exists, false);
    assert.equal(o.action.exists, false);
    assert.equal(o.refresh, null);
  }
  const links = await svc.getLinks(ORG, WEBSITE_ID);
  assert.equal(links.total, OPPORTUNITIES.length);
  assert.equal(links.clusters.length, CLUSTERS.length);
});

/* 20. Partial content state. */
await test('partial content state', async () => {
  const { svc } = await buildService({
    items: [
      {
        id: 'item_demo',
        organizationId: ORG,
        websiteId: WEBSITE_ID,
        title: 'Demo page',
        targetQuery: 'demo',
        status: 'IDEA',
      },
    ],
    briefs: [],
    drafts: [],
    actions: [],
    recommendations: [],
  });
  const res = await svc.getContentOpportunities(ORG, {
    websiteId: WEBSITE_ID,
  });
  const demo = res.opportunities.find((o) => o.keyword === 'demo');
  assert.equal(demo.content.exists, true);
  assert.equal(demo.brief.exists, false);
  assert.equal(demo.draft.exists, false);
  assert.equal(demo.action.exists, false);
  assert.equal(demo.contentAction, 'CREATE');
});

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(
  `\n${results.length - failed.length}/${results.length} passed`,
);
if (failed.length > 0) process.exit(1);

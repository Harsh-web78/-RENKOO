/*
 * RENKOO Keyword Strategy 5.0 — strategy intelligence tests.
 *
 * Zero new dependencies: plain node + assert against the
 * compiled dist output, with stubbed Prisma / Google /
 * billing / AI registry. No DataForSEO credentials needed:
 * the strategy endpoint only ever reads cached provider
 * rows, which the fixtures seed directly.
 *
 * Run: npm run test:strategy   (builds first)
 */
import assert from 'node:assert/strict';

/* Strategy reads cache only: make sure no provider
   credentials leak in from the environment. */
delete process.env.DATAFORSEO_LOGIN;
delete process.env.DATAFORSEO_PASSWORD;

const dist = (p) => import(`../dist/${p}`);

const ORG = 'org1';
const WEBSITE_ID = 'w1';

const GSC_ROWS = [
  {
    query: 'pricing',
    position: 8.2,
    clicks: 120,
    impressions: 4200,
    ctr: 0.0286,
  },
  {
    query: 'crm',
    position: 14,
    clicks: 30,
    impressions: 900,
    ctr: 0.0333,
  },
  {
    query: 'enterprise widgets',
    position: 32,
    clicks: 2,
    impressions: 150,
    ctr: 0.0133,
  },
  {
    query: 'brand name',
    position: 1.8,
    clicks: 500,
    impressions: 3000,
    ctr: 0.1667,
  },
  {
    query: 'gmail homepage',
    position: 45,
    clicks: 1,
    impressions: 8,
    ctr: 0.125,
  },
];

const GSC_PAGE_ROWS = [
  {
    query: 'pricing',
    page: 'https://site.com/pricing',
    position: 8.2,
    clicks: 120,
    impressions: 4200,
  },
  {
    query: 'crm',
    page: 'https://site.com/blog/crm-guide',
    position: 14,
    clicks: 30,
    impressions: 900,
  },
  {
    query: 'crm',
    page: 'https://site.com/blog/crm-tips',
    position: 22,
    clicks: 3,
    impressions: 60,
  },
  {
    query: 'enterprise widgets',
    page: 'https://site.com/blog/old',
    position: 32,
    clicks: 2,
    impressions: 150,
  },
  {
    query: 'brand name',
    page: 'https://site.com/',
    position: 1.8,
    clicks: 500,
    impressions: 3000,
  },
  {
    query: 'gmail homepage',
    page: 'https://site.com/blog/x',
    position: 45,
    clicks: 1,
    impressions: 8,
  },
];

const CRAWL_PAGES = [
  {
    url: 'https://site.com/pricing',
    title: 'Pricing',
    metaDescription: 'Buy our software pricing plans',
    h1: ['Simple pricing'],
    h2: [],
    wordCount: 400,
  },
  {
    url: 'https://site.com/blog/crm-guide',
    title: 'CRM guide',
    metaDescription: 'how to choose crm software',
    h1: ['Best CRM guide'],
    h2: [],
    wordCount: 1500,
  },
  {
    url: 'https://site.com/blog/crm-tips',
    title: 'CRM tips',
    metaDescription: 'crm tips and tricks',
    h1: ['CRM tips'],
    h2: [],
    wordCount: 900,
  },
  {
    url: 'https://site.com/',
    title: 'Brand name home',
    metaDescription: 'brand name official site',
    h1: ['Brand name'],
    h2: [],
    wordCount: 300,
  },
];

const COMPETITOR_PAGES = [
  {
    url: 'https://rival.example/widgets',
    title: 'Acme Enterprise Widgets',
    metaDescription:
      'Buy enterprise widgets online demo trial',
    h1: ['Enterprise widgets'],
    h2: [],
    wordCount: 800,
  },
];

function risingSeries(base = 100, step = 20) {
  return Array.from({ length: 12 }, (_, i) => ({
    year: 2025,
    month: i + 1,
    searchVolume: base + i * step,
  }));
}

/* In-memory Prisma stub. */
function makePrisma(opts = {}) {
  const cache = new Map();
  const briefs = [];
  return {
    __cache: cache,
    __briefs: briefs,
    __opts: opts,
    keywordMetricCache: {
      findUnique: async ({ where }) =>
        cache.get(where.cacheKey) ?? null,
      upsert: async ({ where, create, update }) => {
        const row = cache.has(where.cacheKey)
          ? { ...cache.get(where.cacheKey), ...update }
          : {
              fetchedAt: new Date(),
              createdAt: new Date(),
              ...create,
            };
        cache.set(where.cacheKey, row);
        return row;
      },
    },
    website: {
      findFirst: async () =>
        opts.noWebsite
          ? null
          : {
              id: WEBSITE_ID,
              organizationId: ORG,
              name: 'Site',
              url: 'https://site.com',
            },
    },
    crawl: {
      findFirst: async () => ({
        id: 'c1',
        pages: opts.emptyCorpus ? [] : CRAWL_PAGES,
      }),
    },
    competitor: {
      findMany: async () =>
        opts.emptyCorpus
          ? []
          : [
              {
                id: 'comp1',
                crawls: [
                  { id: 'cc1', pages: COMPETITOR_PAGES },
                ],
              },
            ],
    },
    googleConnection: {
      findUnique: async () =>
        opts.gscDisconnected
          ? null
          : { selectedProperty: 'sc-domain:site.com' },
    },
    contentDraft: {
      count: async () => opts.draftCount ?? 0,
    },
    strategyBrief: {
      count: async () => briefs.length,
      create: async ({ data }) => {
        const row = {
          ...data,
          id: `br_${briefs.length + 1}`,
          createdAt: new Date(),
        };
        briefs.push(row);
        return row;
      },
      findMany: async () => briefs,
    },
  };
}

function makeGoogle(rows = GSC_ROWS, pageRows = GSC_PAGE_ROWS) {
  return {
    getSearchQueries: async () => ({ rows }),
    getQueryPages: async () => ({ rows: pageRows }),
  };
}

function makeBilling(subscription = null) {
  const calls = [];
  return {
    __calls: calls,
    getSubscription: async () => subscription,
    checkUsage: async () => ({ allowed: true }),
    consumeUsage: async (...a) => {
      calls.push(a);
    },
  };
}

function makeRegistry(captured, configured = true) {
  return {
    get: (id) => {
      if (id !== 'GEMINI' && id !== 'OPENAI')
        return null;
      return {
        id,
        displayName: id === 'GEMINI' ? 'Gemini' : 'OpenAI',
        isConfigured: () => configured,
        executePrompt: async ({ prompt }) => {
          captured.prompt = prompt;
          return {
            text: 'Strategy summary. Act on pricing first.',
            model: 'test-model',
          };
        },
      };
    },
  };
}

async function seedProviderCache(cache) {
  await cache.set(
    'DATAFORSEO',
    'metrics',
    'US',
    'en',
    'pricing',
    {
      keyword: 'pricing',
      country: 'US',
      language: 'en',
      searchVolume: 8100,
      keywordDifficulty: null,
      cpc: null,
      competition: null,
      competitionLevel: null,
      monthlySearches: risingSeries(),
      trend: null,
      providerIntent: null,
      serpFeatures: [],
      dataSource: 'DATAFORSEO',
      lastUpdated: new Date().toISOString(),
    },
  );
  await cache.set(
    'DATAFORSEO',
    'difficulty',
    'US',
    'en',
    'pricing',
    25,
  );
  await cache.set(
    'DATAFORSEO',
    'intent',
    'US',
    'en',
    'pricing',
    'commercial',
  );
  await cache.set(
    'DATAFORSEO',
    'serp',
    'US',
    'en',
    'pricing',
    {
      keyword: 'pricing',
      country: 'US',
      language: 'en',
      results: [],
      features: [],
      totalResults: null,
      dataSource: 'DATAFORSEO',
      fetchedAt: new Date().toISOString(),
      competition: {
        verdict: 'OPPORTUNITY',
        totalResults: 10,
        strongCount: 1,
        weakCount: 3,
        unknownCount: 0,
        medianDomainRank: null,
        medianPageRank: null,
        medianReferringDomains: null,
        medianBacklinks: null,
        evidence: [],
      },
      intentCheck: null,
      featureOpportunities: [],
      aiPresence: null,
    },
  );
}

function buildHarness(opts = {}) {
  return (async () => {
    const cacheMod = await dist(
      'keywords/keyword-cache.service.js',
    );
    const providerMod = await dist(
      'keywords/dataforseo.provider.js',
    );
    const researchMod = await dist(
      'keywords/keyword-research.service.js',
    );
    const strategyMod = await dist(
      'keywords/keyword-strategy.service.js',
    );
    const prisma = makePrisma(opts);
    const cache = new cacheMod.KeywordCacheService(
      prisma,
    );
    const billing = makeBilling(
      opts.subscription ?? null,
    );
    const google = makeGoogle(
      opts.gscRows === undefined
        ? GSC_ROWS
        : opts.gscRows,
      opts.gscPageRows === undefined
        ? GSC_PAGE_ROWS
        : opts.gscPageRows,
    );
    const provider = new providerMod.DataForSeoProvider();
    const research = new researchMod.KeywordResearchService(
      prisma,
      provider,
      cache,
      billing,
      google,
    );
    const captured = {};
    const registry = makeRegistry(
      captured,
      opts.aiConfigured ?? true,
    );
    const svc = new strategyMod.KeywordStrategyService(
      prisma,
      research,
      billing,
      cache,
      provider,
      registry,
    );
    if (opts.seedCache !== false) {
      await seedProviderCache(cache);
    }
    return {
      prisma,
      cache,
      billing,
      google,
      provider,
      research,
      captured,
      svc,
    };
  })();
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

const byKeyword = (res, kw) =>
  res.opportunities.find((o) => o.keyword === kw);

/* 1. Priority scoring: exact transparent math. */
await test('priority scoring', async () => {
  const { svc, billing } = await buildHarness();
  const res = await svc.strategy(ORG, {
    websiteId: WEBSITE_ID,
  });
  const pricing = byKeyword(res, 'pricing');
  assert.ok(pricing, 'pricing scored');
  // 30 pos + 15 impr + 12 ctr + 6 intent + 8 site +
  // 5 trend + 7 volume + 6 kd + 6 serp = 95
  assert.equal(pricing.priorityScore, 95);
  assert.equal(pricing.priority, 'HIGH');
  assert.equal(pricing.isTargetNow, true);
  assert.equal(pricing.intent, 'COMMERCIAL');
  assert.equal(pricing.intentSource, 'PROVIDER');
  /* Strategy endpoint is cache-only: no API_CALLS. */
  assert.ok(
    billing.__calls.every((c) => c[1] !== 'API_CALLS'),
    'strategy must not consume API_CALLS',
  );
});

/* 2. Missing provider metrics stay null, unlabeled. */
await test('missing provider metrics', async () => {
  const { svc } = await buildHarness();
  const res = await svc.strategy(ORG, {
    websiteId: WEBSITE_ID,
  });
  const crm = byKeyword(res, 'crm');
  assert.ok(crm, 'crm scored');
  assert.equal(crm.volume, null);
  assert.equal(crm.keywordDifficulty, null);
  assert.equal(crm.cpc, null);
  assert.equal(crm.serpVerdict, null);
  assert.ok(
    crm.priorityReasons.every(
      (r) => !r.includes('PROVIDER'),
    ),
    'no provider claims without provider data',
  );
  assert.ok(
    crm.signals.every((s) => s.source !== 'PROVIDER'),
    'no provider signals without provider data',
  );
});

/* 3. Quick-win classification with why/action/impact. */
await test('quick-win classification', async () => {
  const { svc } = await buildHarness();
  const res = await svc.strategy(ORG, {
    websiteId: WEBSITE_ID,
  });
  const pricing = byKeyword(res, 'pricing');
  assert.equal(pricing.bucket, 'QUICK_WIN');
  assert.equal(pricing.pageMapping, 'IMPROVE');
  assert.ok(pricing.quickWin, 'quickWin struct present');
  assert.ok(pricing.quickWin.why.length >= 2);
  assert.ok(
    pricing.quickWin.action.includes(
      'https://site.com/pricing',
    ),
  );
  assert.ok(
    pricing.quickWin.expectedImpact.includes(
      'No traffic increase is promised',
    ),
  );
  assert.equal(pricing.quickWin.effort, 'LOW');
});

/* 4. Page mapping: improve vs optimize. */
await test('page mapping improve vs optimize', async () => {
  const { svc } = await buildHarness();
  const res = await svc.strategy(ORG, {
    websiteId: WEBSITE_ID,
  });
  const pricing = byKeyword(res, 'pricing');
  assert.equal(pricing.pageMapping, 'IMPROVE');
  assert.equal(
    pricing.targetPage,
    'https://site.com/pricing',
  );
  assert.equal(pricing.targetPageSource, 'OBSERVED');
  const widgets = byKeyword(res, 'enterprise widgets');
  assert.ok(widgets, 'enterprise widgets scored');
  assert.equal(widgets.pageMapping, 'OPTIMIZE');
  assert.equal(widgets.bucket, 'GROW');
  assert.equal(
    widgets.targetPage,
    'https://site.com/blog/old',
  );
});

/* 5. Create vs improve. */
await test('create vs improve', async () => {
  const { svc } = await buildHarness();
  const res = await svc.strategy(ORG, {
    websiteId: WEBSITE_ID,
  });
  const demo = byKeyword(res, 'demo');
  assert.ok(demo, 'gap term demo scored');
  assert.equal(demo.pageMapping, 'CREATE');
  assert.equal(demo.bucket, 'CREATE');
  assert.equal(demo.targetPage, null);
});

/* 6. Consolidation detection. */
await test('consolidation detection', async () => {
  const { svc } = await buildHarness();
  const res = await svc.strategy(ORG, {
    websiteId: WEBSITE_ID,
  });
  const crm = byKeyword(res, 'crm');
  assert.equal(crm.pageMapping, 'CONSOLIDATE');
  assert.equal(crm.bucket, 'CONSOLIDATE');
});

/* 7. Protect classification. */
await test('protect classification', async () => {
  const { svc } = await buildHarness();
  const res = await svc.strategy(ORG, {
    websiteId: WEBSITE_ID,
  });
  const brand = byKeyword(res, 'brand name');
  assert.ok(brand, 'brand name scored');
  assert.equal(brand.pageMapping, 'PROTECT');
  assert.equal(brand.bucket, 'PROTECT');
});

/* 8. Ignore classification. */
await test('ignore classification', async () => {
  const { svc } = await buildHarness();
  const res = await svc.strategy(ORG, {
    websiteId: WEBSITE_ID,
  });
  const fb = byKeyword(res, 'gmail homepage');
  assert.ok(fb, 'gmail homepage scored');
  assert.equal(fb.intent, 'NAVIGATIONAL');
  assert.equal(fb.pageMapping, 'IGNORE');
  assert.equal(fb.bucket, 'IGNORE');
  assert.equal(fb.isTargetNow, false);
});

/* 9. Strategy cluster generation. */
await test('strategy cluster generation', async () => {
  const { svc } = await buildHarness();
  const res = await svc.strategy(ORG, {
    websiteId: WEBSITE_ID,
  });
  assert.ok(res.clusters.length > 0);
  for (const c of res.clusters) {
    assert.ok(c.topic && c.primaryKeyword);
    assert.ok(c.size >= 1);
    assert.ok(
      ['HIGH', 'MEDIUM', 'LOW'].includes(c.priority),
    );
    assert.ok(
      typeof c.recommendedPageType === 'string' &&
        c.recommendedPageType.length > 0,
    );
    assert.ok(Array.isArray(c.existingPages));
    assert.equal(
      typeof c.missingPages,
      'number',
    );
    assert.equal(
      typeof c.cannibalizationRisk,
      'boolean',
    );
  }
  const pricingCluster = res.clusters.find(
    (c) =>
      c.primaryKeyword === 'pricing' ||
      c.supportingKeywords.includes('pricing'),
  );
  assert.ok(pricingCluster, 'pricing clustered');
  assert.ok(
    pricingCluster.existingPages.includes(
      'https://site.com/pricing',
    ),
  );
});

/* 10. Deterministic scoring. */
await test('deterministic scoring', async () => {
  const { svc } = await buildHarness();
  const a = await svc.strategy(ORG, {
    websiteId: WEBSITE_ID,
  });
  const b = await svc.strategy(ORG, {
    websiteId: WEBSITE_ID,
  });
  assert.deepEqual(a.opportunities, b.opportunities);
  assert.deepEqual(a.clusters, b.clusters);
  assert.deepEqual(a.nextActions, b.nextActions);
  assert.deepEqual(a.summary, b.summary);
});

/* 11. No fabricated metrics anywhere. */
await test('no fabricated metrics', async () => {
  const { svc } = await buildHarness();
  const res = await svc.strategy(ORG, {
    websiteId: WEBSITE_ID,
  });
  const providerNumber = /(\$\d|KD \d|[\d,]{5,} searches)/;
  for (const o of res.opportunities) {
    if (o.volume === null) {
      assert.ok(
        !providerNumber.test(
          o.priorityReasons.join(' '),
        ),
        `fabricated provider number for ${o.keyword}`,
      );
    }
    for (const s of o.signals) {
      if (s.source !== 'PROVIDER') {
        assert.ok(
          !providerNumber.test(`${s.label} ${s.value}`),
          `fabricated provider signal for ${o.keyword}`,
        );
      }
    }
  }
});

/* 12. AI input contains only verified evidence. */
await test('ai input contains only verified evidence', async () => {
  const { svc, captured, billing } = await buildHarness({
    subscription: { id: 'sub1' },
  });
  const out = await svc.strategyBrief(ORG, {
    websiteId: WEBSITE_ID,
    provider: 'GEMINI',
    maxItems: 8,
  });
  assert.ok(out.id && out.text);
  assert.equal(out.provider, 'GEMINI');
  const prompt = captured.prompt;
  assert.ok(prompt.includes('"pricing"'));
  assert.ok(prompt.includes('NOT AVAILABLE'));
  assert.ok(
    prompt.includes('Do not invent'),
    'evidence-only guardrail present',
  );
  /* Every numeric volume in the prompt must be a real
     cached value (8100); everything else NOT AVAILABLE. */
  const volumes = [
    ...prompt.matchAll(/volume=(\d+|NOT AVAILABLE)/g),
  ].map((m) => m[1]);
  assert.ok(volumes.length > 0);
  assert.ok(
    volumes.every(
      (v) => v === 'NOT AVAILABLE' || v === '8100',
    ),
    `invented volume in prompt: ${volumes}`,
  );
  assert.deepEqual(billing.__calls, [
    [ORG, 'AI_CREDITS', 1],
  ]);

  /* Free tier shares the 5/month AI pool with content. */
  const free = await buildHarness({ draftCount: 5 });
  const freeErr = await free.svc
    .strategyBrief(ORG, {
      websiteId: WEBSITE_ID,
      provider: 'GEMINI',
    })
    .catch((e) => e);
  assert.equal(
    freeErr?.response?.code,
    'LIMIT_REACHED',
  );
  assert.equal(
    freeErr?.response?.metric,
    'AI_CREDITS',
  );
});

/* 13. Empty GSC data degrades gracefully. */
await test('empty gsc data', async () => {
  const { svc } = await buildHarness({
    gscRows: [],
    gscPageRows: [],
  });
  const res = await svc.strategy(ORG, {
    websiteId: WEBSITE_ID,
  });
  assert.equal(res.universe.gscKeywords, 0);
  assert.ok(res.opportunities.length > 0);
  assert.ok(
    res.dataAvailability.notes.some((n) =>
      n.includes('crawl corpus'),
    ) || res.universe.gapCandidates > 0,
  );
});

/* 14. Empty crawl corpus degrades gracefully. */
await test('empty crawl corpus', async () => {
  const { svc } = await buildHarness({
    emptyCorpus: true,
  });
  const res = await svc.strategy(ORG, {
    websiteId: WEBSITE_ID,
  });
  assert.equal(res.universe.gapCandidates, 0);
  assert.ok(res.opportunities.length > 0);
  const pricing = byKeyword(res, 'pricing');
  assert.ok(pricing, 'gsc-only opportunity survives');
});

/* 15. No SERP data means no SERP bonus. */
await test('no serp data', async () => {
  const { svc } = await buildHarness({
    seedCache: false,
  });
  const res = await svc.strategy(ORG, {
    websiteId: WEBSITE_ID,
  });
  for (const o of res.opportunities) {
    assert.equal(o.serpVerdict, null);
  }
  const pricing = byKeyword(res, 'pricing');
  // 95 with SERP bonus; without any cached provider rows:
  // 30 pos + 15 impr + 12 ctr + 6 intent + 8 site = 71
  assert.equal(pricing.priorityScore, 71);
  assert.equal(pricing.bucket, 'QUICK_WIN');
});

/* 16. API error states. */
await test('api error states', async () => {
  const { svc } = await buildHarness({
    noWebsite: true,
  });
  await assert.rejects(
    svc.strategy(ORG, { websiteId: 'missing' }),
    /not found/i,
  );
  const { svc: svc2 } = await buildHarness();
  await assert.rejects(
    svc2.strategy(ORG, {
      websiteId: WEBSITE_ID,
      startDate: '2026-09-08',
      endDate: '2026-09-01',
    }),
    /startDate must be on or before endDate/,
  );
  await assert.rejects(
    svc2.strategyBrief(ORG, {
      websiteId: WEBSITE_ID,
      provider: 'GEMINI',
      keywords: ['no-such-keyword-xyz'],
    }),
    /None of the selected keywords/,
  );
  const { svc: svc3 } = await buildHarness({
    aiConfigured: false,
  });
  const err = await svc3
    .strategyBrief(ORG, {
      websiteId: WEBSITE_ID,
      provider: 'OPENAI',
    })
    .catch((e) => e);
  assert.equal(err.status, 503);
});

console.log(results.join('\n'));
const failed = results.filter((r) =>
  r.startsWith('FAIL'),
);
console.log(
  `\n${results.length - failed.length}/${results.length} passed`,
);
process.exit(failed.length ? 1 : 0);

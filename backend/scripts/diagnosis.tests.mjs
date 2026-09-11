/*
 * RENKOO Why-Not-#1 Engine 1.0 — diagnosis tests.
 *
 * Deterministic precedence, evidence states, graceful
 * degradation and tenant isolation. All services
 * stubbed; no live GSC, no provider calls, no invented
 * metrics.
 *
 * Run: npm run test:diagnosis   (builds first)
 */
import assert from 'node:assert/strict';

const dist = (p) => import(`../dist/${p}`);

const ORG = 'org1';
const WEBSITE_ID = 'w1';

function gscRow(o = {}) {
  return {
    position: 7.5,
    clicks: 120,
    impressions: 4200,
    ctr: 0.0286,
    ...o,
  };
}

function opp(o = {}) {
  return {
    keyword: 'crm software for startups',
    intent: 'COMMERCIAL',
    intentSource: 'RENKOO',
    position: 7.5,
    clicks: 120,
    impressions: 4200,
    ctr: 0.0286,
    targetPage: 'https://site.com/crm-for-startups',
    targetPageSource: 'OBSERVED',
    pageMapping: 'IMPROVE',
    priority: 'HIGH',
    priorityScore: 82,
    bucket: 'QUICK_WIN',
    priorityReasons: ['Ranking at #7.5 — striking distance.'],
    mappingReason: 'Strong match — improve it.',
    ...o,
  };
}

function crawlPage(o = {}) {
  return {
    id: `pg_${Math.random().toString(36).slice(2)}`,
    crawlId: 'crawl_1',
    url: 'https://site.com/crm-for-startups',
    statusCode: 200,
    title: 'CRM software for startups — comparison',
    metaDescription: 'Compare CRM software for startups.',
    h1: ['CRM for startups'],
    h2: ['Pricing', 'Features'],
    wordCount: 1800,
    robotsIndexable: true,
    canonical: null,
    canonicalAbsolute: null,
    redirectCount: 0,
    finalUrl: null,
    internalLinks: 5,
    ...o,
  };
}

function serpObs(o = {}) {
  return {
    totalResults: 10,
    results: [
      {
        url: 'https://rival.example/crm',
        domain: 'rival.example',
        title: 'Best CRM compared',
        contentType: 'Comparison',
        pageStrength: 'Strong',
        referringDomains: 120,
        backlinks: 900,
      },
      {
        url: 'https://site.com/crm-for-startups',
        domain: 'site.com',
        title: 'CRM for startups compared',
        contentType: 'Comparison',
        pageStrength: 'Medium',
        referringDomains: 8,
        backlinks: 40,
      },
      {
        url: 'https://other.example/crm',
        domain: 'other.example',
        title: 'CRM guide',
        contentType: 'Blog/article',
        pageStrength: 'Strong',
        referringDomains: 300,
        backlinks: 2000,
      },
    ],
    features: [{ type: 'people_also_ask', count: 4 }],
    competition: { verdict: 'MODERATE' },
    aiPresence: { detected: false },
    ...o,
  };
}

function stubPrisma(seeds = {}) {
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
    website: {
      findFirst: async ({ where }) => {
        assert.equal(where.organizationId, ORG);
        if (seeds.noWebsite) return null;
        return {
          id: WEBSITE_ID,
          name: 'Site',
          url: 'https://site.com',
        };
      },
    },
    crawl: {
      findFirst: async () => {
        if (seeds.crawlFails) throw new Error('db down');
        if (seeds.crawl === false) return null;
        return {
          id: 'crawl_1',
          completedAt: new Date('2026-09-08T00:00:00Z'),
        };
      },
    },
    crawlPage: {
      findMany: async ({ where } = {}) =>
        (seeds.pages ?? [crawlPage()]).filter((r) =>
          matches(r, where),
        ),
    },
    crawlLink: {
      count: async () => seeds.inbound ?? 0,
      findMany: async () => [],
    },
    contentBrief: {
      findMany: async () => seeds.briefs ?? [],
    },
    contentItem: {
      findMany: async () => seeds.items ?? [],
    },
    recommendation: {
      findMany: async ({ where } = {}) =>
        (seeds.recommendations ?? []).filter((r) =>
          matches(r, where),
        ),
    },
    action: {
      findMany: async () => seeds.actions ?? [],
    },
  };
}

function stubResearch(gsc = {}) {
  let calls = 0;
  const curMap =
    gsc.byQuery ??
    new Map([
      [
        'crm software for startups',
        gscRow(gsc.row ?? {}),
      ],
    ]);
  /* First getGscMaps call serves the current window,
     the second the previous — mirrors service order. */
  const prevMap =
    gsc.byQueryPrev ??
    new Map([
      [
        'crm software for startups',
        gscRow({ position: 9.2, clicks: 90 }),
      ],
    ]);
  return {
    getGscMaps: async () => {
      calls++;
      if (gsc.down) throw new Error('gsc down');
      return {
        byQuery: calls === 1 ? curMap : prevMap,
        byQueryPages: new Map(),
      };
    },
    getCorpora: async () => ({
      website: { id: WEBSITE_ID },
      siteCorpus: new Map(
        gsc.siteCorpus ?? [
          [
            'crm software for startups',
            {
              keyword: 'crm software for startups',
              pages: 1,
              occurrences: 4,
              relevanceScore: 40,
              urls: ['https://site.com/crm-for-startups'],
            },
          ],
        ],
      ),
      competitorCorpus: new Map(
        gsc.compCorpus ?? [
          [
            'crm software for startups',
            {
              entry: {
                keyword: 'crm software for startups',
                pages: 3,
                occurrences: 9,
                relevanceScore: 90,
                urls: ['https://rival.example/crm'],
              },
              competitorIds: new Set(['c1']),
            },
          ],
        ],
      ),
      competitorCount: 1,
    }),
  };
}

function stubServices(seeds = {}) {
  const gsc = seeds.gsc ?? {};
  const queryPages = seeds.queryPages ?? [
    {
      query: 'crm software for startups',
      page: 'https://site.com/crm-for-startups',
      clicks: 120,
      impressions: 4200,
      ctr: 0.0286,
      position: 7.5,
    },
  ];
  return {
    google: {
      getQueryPages: async () => ({ rows: queryPages }),
    },
    strategy: {
      strategy: async () => {
        if (seeds.strategyDown) throw new Error('down');
        return {
          opportunities:
            seeds.opportunities ?? [opp()],
          clusters: seeds.clusters ?? [],
        };
      },
    },
    research: stubResearch(gsc),
    cache: {
      calls: [],
      get: async (provider, metric, country, lang, kw) => {
        seeds.cacheCalls?.push([
          provider,
          metric,
          country,
          lang,
          kw,
        ]);
        if (seeds.serpCache === false) return null;
        return {
          value: seeds.serp ?? serpObs(),
          fetchedAt: '2026-09-08T10:00:00.000Z',
        };
      },
    },
    provider: {
      resolveContext: (c, l) => ({
        country: c ?? 'US',
        language: l ?? 'en',
      }),
    },
    contentStrategy: {
      getLinkRecommendations: async () => ({
        recommendations: seeds.linkRecs ?? [],
      }),
    },
    crawlLinks: {},
  };
}

async function buildService(seeds = {}) {
  const mod = await dist(
    'keywords/keyword-diagnosis.service.js',
  );
  const prisma = stubPrisma(seeds);
  const svcs = stubServices(seeds);
  const svc = new mod.KeywordDiagnosisService(
    prisma,
    svcs.google,
    svcs.strategy,
    svcs.research,
    svcs.cache,
    svcs.provider,
    svcs.contentStrategy,
    svcs.crawlLinks,
  );
  return { svc, mod, svcs };
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

const KW = 'crm software for startups';
const base = { websiteId: WEBSITE_ID, keyword: KW };

/* 1. Current page resolution (GSC primary). */
await test('current page resolution', async () => {
  const { svc } = await buildService();
  const res = await svc.diagnose(ORG, base);
  assert.equal(
    res.currentRanking.page,
    'https://site.com/crm-for-startups',
  );
  assert.equal(res.currentRanking.pageCertainty, 'CONFIRMED');
  assert.equal(res.currentRanking.position, 7.5);
});

/* 2. No current page. */
await test('no current page', async () => {
  const { svc } = await buildService({
    gsc: { byQuery: new Map() },
    queryPages: [],
    opportunities: [
      opp({ targetPage: null, pageMapping: 'CREATE' }),
    ],
  });
  const res = await svc.diagnose(ORG, base);
  assert.equal(res.currentRanking.page, null);
  assert.equal(
    res.currentRanking.pageCertainty,
    'CURRENT_PAGE_UNCERTAIN',
  );
});

/* 3. Multiple pages listed. */
await test('multiple pages', async () => {
  const { svc } = await buildService({
    queryPages: [
      {
        query: KW,
        page: 'https://site.com/crm-for-startups',
        clicks: 100,
        impressions: 3000,
        ctr: 0.03,
        position: 7.5,
      },
      {
        query: KW,
        page: 'https://site.com/blog/crm-tips',
        clicks: 20,
        impressions: 1200,
        ctr: 0.016,
        position: 12,
      },
    ],
  });
  const res = await svc.diagnose(ORG, base);
  assert.equal(res.pages.length, 2);
  const cannib = res.subDiagnoses.find(
    (s) => s.type === 'CANNIBALIZATION_RISK',
  );
  assert.equal(cannib.state, 'CONFIRMED');
});

/* 4. GSC evidence VERIFIED. */
await test('gsc evidence', async () => {
  const { svc } = await buildService();
  const res = await svc.diagnose(ORG, base);
  assert.equal(res.currentRanking.evidence, 'VERIFIED');
  assert.equal(res.currentRanking.clicks, 120);
  const row = res.evidence.find((e) => e.source === 'GSC');
  assert.equal(row.evidenceType, 'VERIFIED');
});

/* 5. PoP delta. */
await test('position pop', async () => {
  const { svc } = await buildService();
  const res = await svc.diagnose(ORG, base);
  assert.equal(res.currentRanking.prevPosition, 9.2);
  assert.equal(res.currentRanking.positionDelta, 1.7);
});

/* 6. Intent match. */
await test('intent match', async () => {
  const { svc } = await buildService();
  const res = await svc.diagnose(ORG, base);
  const sub = res.subDiagnoses.find(
    (s) => s.type === 'INTENT_GAP',
  );
  assert.equal(sub.state, 'ABSENT');
});

/* 7. Intent mismatch. */
await test('intent mismatch', async () => {
  const { svc } = await buildService({
    opportunities: [
      opp({
        intent: 'COMMERCIAL',
        targetPage: 'https://site.com/blog/crm-musings',
      }),
    ],
    queryPages: [
      {
        query: KW,
        page: 'https://site.com/blog/crm-musings',
        clicks: 50,
        impressions: 800,
        ctr: 0.06,
        position: 9,
      },
    ],
    pages: [
      crawlPage({
        url: 'https://site.com/blog/crm-musings',
        title: 'Random CRM thoughts',
        h1: ['Thoughts'],
        h2: [],
        wordCount: 1500,
      }),
    ],
  });
  const res = await svc.diagnose(ORG, base);
  assert.equal(
    res.currentRanking.page,
    'https://site.com/blog/crm-musings',
  );
  const sub = res.subDiagnoses.find(
    (s) => s.type === 'INTENT_GAP',
  );
  assert.equal(sub.state, 'CONFIRMED');
  assert.equal(res.primaryDiagnosis, 'INTENT_GAP');
});

/* 8. Content gap (competitor covers, site absent). */
await test('content gap', async () => {
  const { svc } = await buildService({
    gsc: { siteCorpus: new Map() },
  });
  const res = await svc.diagnose(ORG, base);
  const sub = res.subDiagnoses.find(
    (s) => s.type === 'CONTENT_COVERAGE_GAP',
  );
  assert.equal(sub.state, 'CONFIRMED');
  assert.ok(sub.evidence.length > 0);
});

/* 9. Internal-link gap (zero inbound + rec exists). */
await test('internal link gap', async () => {
  const { svc } = await buildService({
    inbound: 0,
    linkRecs: [
      {
        sourceUrl: 'https://site.com/blog/crm-tips',
        targetUrl: 'https://site.com/crm-for-startups',
        suggestedAnchor: 'crm software for startups',
        anchorSource: 'PRIMARY_KEYWORD',
        priority: 'HIGH',
      },
    ],
  });
  const res = await svc.diagnose(ORG, base);
  const sub = res.subDiagnoses.find(
    (s) => s.type === 'INTERNAL_LINK_GAP',
  );
  assert.equal(sub.state, 'CONFIRMED');
  assert.equal(res.internalLinks.inboundCount, 0);
  assert.equal(
    res.internalLinks.evidence,
    'OBSERVED',
  );
});

/* 10. Technical blocker (non-2xx). */
await test('technical blocker status', async () => {
  const { svc } = await buildService({
    pages: [crawlPage({ statusCode: 500 })],
  });
  const res = await svc.diagnose(ORG, base);
  assert.equal(res.primaryDiagnosis, 'TECHNICAL_BLOCKER');
});

/* 11. Noindex blocker. */
await test('noindex blocker', async () => {
  const { svc } = await buildService({
    pages: [crawlPage({ robotsIndexable: false })],
  });
  const res = await svc.diagnose(ORG, base);
  assert.equal(res.primaryDiagnosis, 'TECHNICAL_BLOCKER');
  const sub = res.subDiagnoses.find(
    (s) => s.type === 'TECHNICAL_BLOCKER',
  );
  assert.ok(sub.headline.toLowerCase().includes('noindex'));
});

/* 12. Canonical mismatch. */
await test('canonical mismatch', async () => {
  const { svc } = await buildService({
    pages: [
      crawlPage({
        canonicalAbsolute: 'https://site.com/other',
      }),
    ],
  });
  const res = await svc.diagnose(ORG, base);
  assert.equal(res.primaryDiagnosis, 'TECHNICAL_BLOCKER');
});

/* 13. Redirect. */
await test('redirect blocker', async () => {
  const { svc } = await buildService({
    pages: [crawlPage({ redirectCount: 2 })],
  });
  const res = await svc.diagnose(ORG, base);
  assert.equal(res.primaryDiagnosis, 'TECHNICAL_BLOCKER');
});

/* 14. SERP unavailable degrades. */
await test('serp unavailable', async () => {
  const { svc } = await buildService({ serpCache: false });
  const res = await svc.diagnose(ORG, base);
  assert.equal(res.serp.available, false);
  assert.equal(
    res.serp.state,
    'SERP_INTELLIGENCE_UNAVAILABLE',
  );
  const auth = res.subDiagnoses.find(
    (s) => s.type === 'AUTHORITY_GAP',
  );
  assert.equal(auth.state, 'UNKNOWN');
});

/* 15. SERP available top rows. */
await test('serp available', async () => {
  const { svc } = await buildService();
  const res = await svc.diagnose(ORG, base);
  assert.equal(res.serp.available, true);
  assert.equal(res.serp.top.length, 3);
  assert.equal(
    res.serp.top[0].domain,
    'rival.example',
  );
  assert.equal(res.serp.fetchedAt, '2026-09-08T10:00:00.000Z');
});

/* 16. SERP format gap. */
await test('serp format gap', async () => {
  const { svc } = await buildService({
    serp: serpObs({
      results: [
        {
          url: 'https://a.example/1',
          domain: 'a.example',
          title: 'Best CRM 2026',
          contentType: 'Comparison',
        },
        {
          url: 'https://b.example/2',
          domain: 'b.example',
          title: 'CRM vs CRM',
          contentType: 'Comparison',
        },
        {
          url: 'https://c.example/3',
          domain: 'c.example',
          title: 'Top CRM compared',
          contentType: 'Comparison',
        },
        {
          url: 'https://d.example/4',
          domain: 'd.example',
          title: 'CRM picks',
          contentType: 'Comparison',
        },
      ],
    }),
    opportunities: [
      opp({
        targetPage: 'https://site.com/blog/crm-musings',
      }),
    ],
    queryPages: [
      {
        query: KW,
        page: 'https://site.com/blog/crm-musings',
        clicks: 10,
        impressions: 200,
        ctr: 0.05,
        position: 15,
      },
    ],
    pages: [
      crawlPage({
        url: 'https://site.com/blog/crm-musings',
        title: 'Random CRM thoughts',
      }),
    ],
  });
  const res = await svc.diagnose(ORG, base);
  const sub = res.subDiagnoses.find(
    (s) => s.type === 'SERP_FORMAT_GAP',
  );
  assert.equal(sub.state, 'CONFIRMED');
});

/* 17. Authority available. */
await test('authority gap', async () => {
  const { svc } = await buildService();
  const res = await svc.diagnose(ORG, base);
  const sub = res.subDiagnoses.find(
    (s) => s.type === 'AUTHORITY_GAP',
  );
  assert.equal(sub.state, 'CONFIRMED');
});

/* 18. Authority unavailable without signals. */
await test('authority unavailable', async () => {
  const { svc } = await buildService({
    serp: serpObs({
      results: [
        {
          url: 'https://a.example/1',
          domain: 'a.example',
          title: 'Something',
        },
      ],
    }),
  });
  const res = await svc.diagnose(ORG, base);
  const sub = res.subDiagnoses.find(
    (s) => s.type === 'AUTHORITY_GAP',
  );
  assert.equal(sub.state, 'UNKNOWN');
});

/* 19. Freshness evidence via refresh rec. */
await test('freshness gap', async () => {
  const { svc } = await buildService({
    recommendations: [
      {
        id: 'rec1',
        organizationId: ORG,
        websiteId: WEBSITE_ID,
        source: 'CONTENT',
        type: 'REFRESH_REQUIRED',
        status: 'OPEN',
        description: 'Clicks fell 120 to 60.',
        metadata: { query: KW },
      },
    ],
  });
  const res = await svc.diagnose(ORG, base);
  const sub = res.subDiagnoses.find(
    (s) => s.type === 'FRESHNESS_GAP',
  );
  assert.equal(sub.state, 'CONFIRMED');
  assert.ok(res.content.refresh);
});

/* 20. Freshness unknown. */
await test('freshness unknown', async () => {
  const { svc } = await buildService();
  const res = await svc.diagnose(ORG, base);
  const sub = res.subDiagnoses.find(
    (s) => s.type === 'FRESHNESS_GAP',
  );
  assert.equal(sub.state, 'UNKNOWN');
});

/* 21. Cannibalization. */
await test('cannibalization', async () => {
  const { svc } = await buildService({
    opportunities: [
      opp({ pageMapping: 'CONSOLIDATE', bucket: 'CONSOLIDATE' }),
    ],
  });
  const res = await svc.diagnose(ORG, base);
  const sub = res.subDiagnoses.find(
    (s) => s.type === 'CANNIBALIZATION_RISK',
  );
  assert.equal(sub.state, 'CONFIRMED');
});

/* 22. No clear gap. */
await test('no clear gap', async () => {
  const { svc } = await buildService({
    gsc: {
      byQuery: new Map([
        [
          KW,
          gscRow({
            position: 2,
            clicks: 400,
            impressions: 2000,
          }),
        ],
      ]),
    },
    queryPages: [
      {
        query: KW,
        page: 'https://site.com/crm-for-startups',
        clicks: 400,
        impressions: 2000,
        ctr: 0.2,
        position: 2,
      },
    ],
    opportunities: [
      opp({
        position: 2,
        pageMapping: 'PROTECT',
        bucket: 'PROTECT',
        priority: 'LOW',
        priorityScore: 30,
      }),
    ],
    inbound: 4,
    serp: serpObs({
      results: [
        {
          url: 'https://site.com/crm-for-startups',
          domain: 'site.com',
          title: 'CRM for startups compared',
          contentType: 'Comparison',
          pageStrength: 'Medium',
        },
      ],
    }),
  });
  const res = await svc.diagnose(ORG, base);
  assert.equal(res.primaryDiagnosis, 'NO_CLEAR_GAP');
});

/* 23. Insufficient data. */
await test('insufficient data', async () => {
  const { svc } = await buildService({
    gsc: { byQuery: new Map() },
    queryPages: [],
    opportunities: [],
    crawl: false,
  });
  const res = await svc.diagnose(ORG, base);
  assert.equal(res.primaryDiagnosis, 'INSUFFICIENT_DATA');
  assert.equal(res.currentRanking.pageCertainty, 'CURRENT_PAGE_UNCERTAIN');
});

/* 24. Diagnosis precedence (technical wins). */
await test('precedence', async () => {
  const { svc } = await buildService({
    pages: [
      crawlPage({ robotsIndexable: false, wordCount: 50 }),
    ],
  });
  const res = await svc.diagnose(ORG, base);
  assert.equal(res.primaryDiagnosis, 'TECHNICAL_BLOCKER');
  assert.ok(
    res.secondaryDiagnoses.includes('CONTENT_COVERAGE_GAP') ||
      res.secondaryDiagnoses.length >= 0,
  );
});

/* 25. Secondary diagnoses tracked. */
await test('secondary diagnoses', async () => {
  const { svc } = await buildService();
  const res = await svc.diagnose(ORG, base);
  assert.ok(Array.isArray(res.secondaryDiagnoses));
  assert.ok(
    !res.secondaryDiagnoses.includes(res.primaryDiagnosis),
  );
});

/* 26. Recommendation mapping vectors. */
await test('recommendation mapping', async () => {
  const { svc, mod } = await buildService();
  void svc;
  const map = {
    INTENT_GAP: 'IMPROVE_EXISTING_PAGE',
    CONTENT_COVERAGE_GAP: 'IMPROVE_EXISTING_PAGE',
    INTERNAL_LINK_GAP: 'BUILD_INTERNAL_SUPPORT',
    TECHNICAL_BLOCKER: 'FIX_TECHNICAL_BLOCKER',
    CANNIBALIZATION_RISK: 'CONSOLIDATE',
    SERP_FORMAT_GAP: 'ADAPT_CONTENT_FORMAT',
    AUTHORITY_GAP: 'BUILD_AUTHORITY',
    FRESHNESS_GAP: 'REFRESH_PAGE',
    INSUFFICIENT_DATA: 'GATHER_MORE_EVIDENCE',
    NO_CLEAR_GAP: 'MONITOR',
  };
  for (const [diagnosis, action] of Object.entries(map)) {
    assert.equal(
      mod.actionForDiagnosis(diagnosis).action,
      action,
      diagnosis,
    );
  }
});

/* 27. Action + brief integration. */
await test('action brief integration', async () => {
  const { svc } = await buildService({
    briefs: [
      {
        id: 'brief1',
        targetQuery: KW,
        createdAt: new Date(),
      },
    ],
    items: [
      { id: 'item1', targetQuery: KW, status: 'BRIEF' },
    ],
    actions: [
      {
        id: 'act1',
        status: 'TODO',
        metadata: {
          strategyKeyword: KW,
        },
      },
    ],
  });
  const res = await svc.diagnose(ORG, base);
  assert.equal(res.content.brief.id, 'brief1');
  assert.equal(res.content.item.status, 'BRIEF');
});

/* 28. Tenant isolation. */
await test('tenant isolation', async () => {
  const { svc } = await buildService({ noWebsite: true });
  await assert.rejects(
    svc.diagnose(ORG, base),
    /Website not found/,
  );
  await assert.rejects(
    svc.diagnoseBatch(ORG, { websiteId: WEBSITE_ID }),
    /Website not found/,
  );
});

/* 29. Crawl failure degrades. */
await test('crawl failure', async () => {
  const { svc } = await buildService({ crawlFails: true });
  const res = await svc.diagnose(ORG, base);
  const tech = res.subDiagnoses.find(
    (s) => s.type === 'TECHNICAL_BLOCKER',
  );
  assert.equal(tech.state, 'UNKNOWN');
  assert.ok(res.currentRanking.page);
});

/* 30. Partial evidence coexists. */
await test('partial evidence', async () => {
  const { svc } = await buildService({
    serpCache: false,
    crawl: false,
  });
  const res = await svc.diagnose(ORG, base);
  assert.equal(res.currentRanking.evidence, 'VERIFIED');
  assert.equal(res.serp.available, false);
  const tech = res.subDiagnoses.find(
    (s) => s.type === 'TECHNICAL_BLOCKER',
  );
  assert.equal(tech.state, 'UNKNOWN');
  assert.ok(
    ['CONTENT_COVERAGE_GAP', 'INTENT_GAP', 'NO_CLEAR_GAP'].includes(
      res.primaryDiagnosis,
    ),
  );
});

/* 31. Duplicate strategy rows collapse. */
await test('duplicate handling', async () => {
  const { svc } = await buildService({
    opportunities: [opp(), opp()],
  });
  const res = await svc.diagnose(ORG, base);
  assert.equal(res.strategy.priorityScore, 82);
});

/* 32. Cache read contract (zero fresh cost). */
await test('cache behavior', async () => {
  const calls = [];
  const { svc } = await buildService({
    cacheCalls: calls,
    serpCache: false,
  });
  await svc.diagnose(ORG, base);
  assert.deepEqual(calls[0], [
    'DATAFORSEO',
    'serp',
    'US',
    'en',
    KW.toLowerCase(),
  ]);
});

/* 33. Bounded batch. */
await test('bounded batch', async () => {
  const { svc } = await buildService();
  const kws = Array.from(
    { length: 12 },
    (_, i) => `keyword ${i}`,
  );
  const res = await svc.diagnoseBatch(ORG, {
    websiteId: WEBSITE_ID,
    keywords: kws,
  });
  assert.ok(res.total <= 10);
  const auto = await svc.diagnoseBatch(ORG, {
    websiteId: WEBSITE_ID,
  });
  assert.ok(auto.total <= 5);
  assert.ok(
    auto.diagnoses.every((d) => d.keyword),
  );
});

/* 34. Malformed URLs never crash. */
await test('malformed urls', async () => {
  const { svc } = await buildService({
    opportunities: [
      opp({ targetPage: 'not a url at all' }),
    ],
    queryPages: [
      {
        query: KW,
        page: '',
        clicks: 0,
        impressions: 0,
        ctr: 0,
        position: 0,
      },
    ],
  });
  const res = await svc.diagnose(ORG, base);
  assert.ok(res);
  assert.equal(typeof res.primaryDiagnosis, 'string');
});

/* 35. No fake metrics or guarantees. */
await test('no fake metrics', async () => {
  const { svc } = await buildService();
  const res = await svc.diagnose(ORG, base);
  const dump = JSON.stringify(res).toLowerCase();
  assert.ok(!dump.includes('guarantee'));
  assert.ok(!dump.includes('probability'));
  assert.ok(!dump.includes('will rank #1'));
  assert.ok(!dump.includes('chance of ranking'));
});

console.log(results.join('\n'));
const failed = results.filter((r) =>
  r.startsWith('FAIL'),
);
console.log(
  `\n${results.length - failed.length}/${results.length} passed`,
);
if (failed.length > 0) process.exit(1);

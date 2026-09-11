/*
 * RENKOO Keyword Research 4.0 — SERP intelligence tests.
 *
 * Zero new dependencies: plain node + assert against the
 * compiled dist output, with a stub DataForSEO server.
 * No paid credentials required (DATAFORSEO_BASE_URL points
 * at the stub; dummy login/password).
 *
 * Run: npm run test:keywords   (builds first)
 */
import assert from 'node:assert/strict';
import http from 'node:http';

const PORT = 45971;
process.env.DATAFORSEO_LOGIN = 'test';
process.env.DATAFORSEO_PASSWORD = 'test';
process.env.DATAFORSEO_BASE_URL = `http://127.0.0.1:${PORT}`;

const dist = (p) => import(`../dist/${p}`);

function urls(prefix, n) {
  return Array.from(
    { length: n },
    (_, i) => `https://example${prefix}.com/page-${i + 1}`,
  );
}

/* Keyword A/B share 6 of 10 URLs; C is disjoint. */
const SERPS = {
  'crm software': [
    ...urls('-shared', 6),
    ...urls('-a', 4),
  ],
  'best crm software': [
    ...urls('-shared', 6),
    ...urls('-b', 4),
  ],
  'how to train a dog': [...urls('-dog', 10)],
  'flaky keyword': 'FAIL_500',
};

const RANKS = {};
urls('-shared', 6).forEach((u, i) => {
  RANKS[u] = i < 2 ? 720 : 90;
});
urls('-a', 4).forEach((u) => (RANKS[u] = 60));
urls('-b', 4).forEach((u) => (RANKS[u] = 640));
urls('-dog', 10).forEach((u) => (RANKS[u] = 300));

function serpPayload(keyword, location = 2840) {
  void location;
  const list = SERPS[keyword] ?? urls('-gen', 10);
  return {
    tasks: [
      {
        id: '1',
        status_code: 20000,
        status_message: 'Ok.',
        cost: 0.002,
        result: [
          {
            se_results_count: 128000000,
            items: [
              ...list.map((u, i) => ({
                type: 'organic',
                rank_absolute: i + 1,
                url: u,
                domain: new URL(u).hostname,
                title: `Title ${i + 1} for ${keyword}`,
                description: `Snippet ${i + 1}`,
              })),
              {
                type: 'people_also_ask',
                items: [{ title: 'q1' }, { title: 'q2' }],
              },
              {
                type: 'ai_overview',
                items: [{ title: 'AI answer' }],
              },
              { type: 'weird_future_element', items: [] },
            ],
          },
        ],
      },
    ],
  };
}

function startStub() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        let tasks = [];
        try {
          tasks = JSON.parse(body);
        } catch {
          tasks = [];
        }
        const send = (payload, status = 200) => {
          res.writeHead(status, {
            'Content-Type': 'application/json',
          });
          res.end(JSON.stringify(payload));
        };
        if (
          req.url ===
          '/v3/serp/google/organic/live/advanced'
        ) {
          const kw = tasks?.[0]?.keyword ?? '';
          if (SERPS[kw] === 'FAIL_500') {
            return send({ error: 'boom' }, 500);
          }
          return send(serpPayload(kw));
        }
        if (
          req.url === '/v3/backlinks/bulk_ranks/live'
        ) {
          const targets = tasks?.[0]?.targets ?? [];
          return send({
            tasks: [
              {
                id: 'r',
                status_code: 20000,
                status_message: 'Ok.',
                result: [
                  {
                    items: targets
                      .filter((t) => RANKS[t] !== undefined)
                      .map((t) => ({
                        target: t,
                        rank: RANKS[t],
                      })),
                  },
                ],
              },
            ],
          });
        }
        if (
          req.url ===
          '/v3/dataforseo_labs/google/bulk_traffic_estimation/live'
        ) {
          const targets = tasks?.[0]?.targets ?? [];
          return send({
            tasks: [
              {
                id: 't',
                status_code: 20000,
                status_message: 'Ok.',
                result: [
                  {
                    items: targets.map((t) => ({
                      target: t,
                      metrics: {
                        organic: { etv: 50000 },
                      },
                    })),
                  },
                ],
              },
            ],
          });
        }
        return send({ tasks: [] });
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

/* In-memory Prisma stub for cache + ledger. */
function makePrisma() {
  const cache = new Map();
  const logs = [];
  return {
    __cache: cache,
    __logs: logs,
    keywordMetricCache: {
      findUnique: async ({ where }) =>
        cache.get(where.cacheKey) ?? null,
      upsert: async ({ where, create, update }) => {
        /* Mirror the DB defaults (@default(now())) that
           Postgres applies in production. */
        const row = cache.has(where.cacheKey)
          ? {
              ...cache.get(where.cacheKey),
              ...update,
            }
          : {
              fetchedAt: new Date(),
              createdAt: new Date(),
              ...create,
            };
        cache.set(where.cacheKey, row);
        return row;
      },
    },
    keywordResearchLog: {
      count: async () => logs.length,
      create: async ({ data }) => {
        logs.push(data);
        return data;
      },
    },
    website: {
      findFirst: async () => ({
        id: 'w1',
        organizationId: 'org1',
        name: 'Site',
        url: 'https://site.com',
      }),
    },
    crawl: {
      findFirst: async () => ({
        id: 'c1',
        pages: [
          {
            url: 'https://site.com/crm',
            title: 'CRM Software Guide',
            metaDescription: 'Best crm software compared',
            h1: ['CRM Software'],
            h2: [],
            wordCount: 1200,
          },
        ],
      }),
    },
    competitor: { findMany: async () => [] },
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

const server = await startStub();
const sa = await dist('keywords/serp-analysis.js');
const providerMod = await dist(
  'keywords/dataforseo.provider.js',
);
const cacheMod = await dist(
  'keywords/keyword-cache.service.js',
);
const svcMod = await dist(
  'keywords/keyword-research.service.js',
);

const prisma = makePrisma();
const cache = new cacheMod.KeywordCacheService(prisma);
const billing = {
  calls: [],
  getSubscription: async () => null,
  checkUsage: async () => ({ allowed: true }),
  consumeUsage: async (...a) => {
    billing.calls.push(a);
  },
};
const googleOrg1 = {
  getSearchQueries: async () => ({ rows: [] }),
  getQueryPages: async () => ({
    rows: [
      {
        query: 'crm software',
        page: 'https://site.com/crm',
        position: 11,
        clicks: 40,
        impressions: 900,
        ctr: 0.04,
      },
      {
        query: 'crm software',
        page: 'https://site.com/crm-guide',
        position: 18,
        clicks: 5,
        impressions: 120,
        ctr: 0.04,
      },
    ],
  }),
};
const provider = new providerMod.DataForSeoProvider();
const svc = new svcMod.KeywordResearchService(
  prisma,
  provider,
  cache,
  billing,
  googleOrg1,
);
const CTX = { country: 'US', language: 'en' };

await test('serp parsing: organics + feature passthrough', async () => {
  const obs = await provider.fetchSerp(
    'crm software',
    CTX,
  );
  assert.equal(obs.results.length, 10);
  assert.equal(obs.results[0].position, 1);
  assert.equal(obs.results[0].isOrganic, true);
  assert.equal(obs.totalResults, 128000000);
  const types = obs.features.map((f) => f.type);
  assert.ok(types.includes('people_also_ask'));
  assert.ok(types.includes('ai_overview'));
  assert.ok(types.includes('weird_future_element'));
  assert.equal(
    obs.features.find((f) => f.type === 'people_also_ask')
      .count,
    2,
  );
});

await test('url normalization', () => {
  const { normalizeSerpUrl } = sa;
  assert.equal(
    normalizeSerpUrl(
      'https://WWW.Example.com/Page/?utm_source=x#frag',
    ),
    'example.com/page',
  );
  assert.equal(
    normalizeSerpUrl('example.com/a/?gclid=1&x=2'),
    'example.com/a?x=2',
  );
  assert.equal(normalizeSerpUrl(''), '');
});

await test('jaccard incl. empty edge', () => {
  const { jaccardSimilarity } = sa;
  assert.equal(jaccardSimilarity([], []), 0);
  assert.equal(jaccardSimilarity(['a'], []), 0);
  assert.equal(
    jaccardSimilarity(['a', 'b'], ['b', 'c']),
    0.33,
  );
});

await test('page strength tiers', () => {
  const { classifyPageStrength } = sa;
  assert.equal(
    classifyPageStrength({
      pageRank: 720,
      domainRank: null,
      backlinks: null,
      referringDomains: null,
      domainTraffic: null,
    }).strength,
    'Strong',
  );
  assert.equal(
    classifyPageStrength({
      pageRank: 60,
      domainRank: 120,
      backlinks: null,
      referringDomains: 5,
      domainTraffic: 100,
    }).strength,
    'Weak',
  );
  assert.equal(
    classifyPageStrength({
      pageRank: null,
      domainRank: null,
      backlinks: null,
      referringDomains: null,
      domainTraffic: null,
    }).strength,
    'Unknown',
  );
  assert.equal(
    classifyPageStrength({
      pageRank: 300,
      domainRank: 300,
      backlinks: null,
      referringDomains: 100,
      domainTraffic: 20000,
    }).strength,
    'Medium',
  );
});

await test('competition aggregates + verdicts', () => {
  const { analyzeSerpCompetition } = sa;
  const mk = (s, d) => ({
    strength: s,
    domainRank: d,
    pageRank: null,
    referringDomains: null,
    backlinks: null,
  });
  const hard = analyzeSerpCompetition([
    ...Array(7).fill(mk('Strong', 700)),
    ...Array(3).fill(mk('Medium', 300)),
  ]);
  assert.equal(hard.verdict, 'HARD');
  assert.equal(hard.medianDomainRank, 700);
  const opp = analyzeSerpCompetition([
    ...Array(4).fill(mk('Weak', 80)),
    ...Array(6).fill(mk('Medium', 300)),
  ]);
  assert.equal(opp.verdict, 'OPPORTUNITY');
  const unknown = analyzeSerpCompetition([
    mk('Unknown', null),
  ]);
  assert.equal(unknown.verdict, 'UNKNOWN');
});

await test('intent validation + content types', () => {
  const { validateSerpIntent, classifyContentType } = sa;
  assert.equal(
    classifyContentType(
      'https://x.com/blog/guide',
      'How to Rank',
    ),
    'Blog/article',
  );
  assert.equal(
    classifyContentType('https://x.com/', null),
    'Homepage',
  );
  assert.equal(
    classifyContentType(
      'https://x.com/pricing/',
      'Pricing',
    ),
    'Product',
  );
  const match = validateSerpIntent('COMMERCIAL', [
    'Product',
    'Comparison',
    'Product',
  ]);
  assert.equal(match.check, 'MATCH');
  const mismatch = validateSerpIntent('COMMERCIAL', [
    'Blog/article',
    'Blog/article',
    'Documentation',
  ]);
  assert.equal(mismatch.check, 'MISMATCH');
  const mixed = validateSerpIntent('COMMERCIAL', [
    'Product',
    'Product',
    'Blog/article',
    'Blog/article',
    'Blog/article',
  ]);
  assert.equal(mixed.check, 'MIXED');
});

await test('serp/threshold calibration', () => {
  const { jaccardSimilarity } = sa;
  const neighbors = jaccardSimilarity(
    urls('-shared', 3).concat(urls('-x', 7)),
    urls('-shared', 3).concat(urls('-y', 7)),
  );
  assert.ok(
    neighbors < 0.4,
    `neighbors ${neighbors} should stay below threshold`,
  );
  const variants = jaccardSimilarity(
    [...urls('-shared', 6), ...urls('-a', 4)],
    [...urls('-shared', 6), ...urls('-b', 4)],
  );
  assert.ok(
    variants >= 0.4,
    `variants ${variants} should meet threshold`,
  );
});

await test('cache hit/miss on serp()', async () => {
  const first = await svc.serp(
    'org1',
    'crm software',
    'US',
    'en',
    false,
  );
  assert.equal(first.cached, false);
  assert.equal(first.cost.providerCalls, 3);
  assert.ok(first.observation.competition);
  assert.equal(
    first.observation.results.filter(
      (r) => r.pageStrength === 'Strong',
    ).length,
    2,
  );
  const second = await svc.serp(
    'org1',
    'crm software',
    'US',
    'en',
    false,
  );
  assert.equal(second.cached, true);
  assert.equal(second.cost.providerCalls, 0);
  assert.ok(second.cost.cacheHits > 0);
});

await test('provider failure surfaces, no credit burn', async () => {
  const before = prisma.__logs.length;
  let code = '';
  try {
    await svc.serp('org1', 'flaky keyword', 'US', 'en', true);
  } catch (e) {
    code = e.code ?? e.message;
  }
  assert.ok(code, 'expected an error');
  assert.equal(
    prisma.__logs.length,
    before,
    'failed SERP must not write usage',
  );
});

await test('serp scoring + page decision + cannibalization', async () => {
  const res = await svc.serp(
    'org1',
    'crm software',
    'US',
    'en',
    false,
    'w1',
  );
  const sc = res.scoring;
  assert.ok(sc, 'scoring present with websiteId');
  assert.equal(
    sc.pageDecision.action,
    'CONSOLIDATE_PAGES',
    `got ${sc.pageDecision.action}`,
  );
  assert.equal(
    sc.pageDecision.cannibalization.confidence,
    'strong',
  );
  assert.ok(
    sc.serpReasons.every((r) => /\d/.test(r)),
    'reasons must cite numbers',
  );
});

await test('serp clustering merges + splits', async () => {
  const res = await svc.clusterBySerp('org1', {
    keywords: [
      'crm software',
      'best crm software',
      'how to train a dog',
    ],
    country: 'US',
    language: 'en',
    maxSerp: 10,
  });
  assert.equal(res.analyzed, 3);
  const crm = res.clusters.find((c) =>
    c.supportingKeywords.includes('best crm software'),
  );
  assert.ok(crm, 'same-SERP pair must merge');
  assert.ok(
    crm.serpSimilarity >= 0.4,
    `similarity ${crm.serpSimilarity}`,
  );
  assert.ok(
    res.clusters.some((c) =>
      [c.primaryKeyword, ...c.supportingKeywords].includes(
        'how to train a dog',
      ),
    ),
    'disjoint SERP stays separate',
  );
  assert.ok(
    res.basis.includes('SERP similarity'),
    'basis must be stated',
  );
});

await test('intent split within overlap', async () => {
  const { intentsCompatible } = sa;
  assert.equal(
    intentsCompatible('COMMERCIAL', 'TRANSACTIONAL'),
    true,
  );
  assert.equal(
    intentsCompatible('COMMERCIAL', 'INFORMATIONAL'),
    false,
  );
  assert.equal(
    intentsCompatible('LOCAL', 'COMMERCIAL'),
    true,
  );
});

await test('partial serp failure stays unclustered', async () => {
  const res = await svc.clusterBySerp('org1', {
    keywords: ['crm software', 'flaky keyword'],
    country: 'US',
    language: 'en',
    maxSerp: 10,
  });
  assert.deepEqual(res.unclustered, ['flaky keyword']);
  assert.equal(res.analyzed, 1);
});

await test('credit accounting + free cap', async () => {
  const logsBefore = prisma.__logs.length;
  await svc.serp('org1', 'crm software', 'US', 'en', true);
  assert.ok(
    prisma.__logs.length > logsBefore,
    'success must log usage',
  );
  prisma.__logs.push(
    ...Array(30).fill({ organizationId: 'org1' }),
  );
  let threw = '';
  try {
    await svc.clusterBySerp('org1', {
      keywords: ['brand new kw xyz', 'another new kw xyz'],
      country: 'US',
      language: 'en',
      maxSerp: 2,
      refresh: true,
    });
  } catch (e) {
    threw = e?.response?.code ?? e.message;
  }
  assert.ok(
    String(threw).includes('LIMIT_REACHED'),
    `free cap must gate, got: ${threw}`,
  );
});

await test('tenant isolation of usage ledger', async () => {
  const n1 = prisma.__logs.filter(
    (l) => l.organizationId === 'org1',
  ).length;
  const n2 = prisma.__logs.filter(
    (l) => l.organizationId === 'org2',
  ).length;
  assert.ok(n1 > 0 && n2 === 0);
});

await test('competitor strength + why-it-matters', async () => {
  const { DataForSeoProvider } = providerMod;
  void DataForSeoProvider;
  const rows = await provider.fetchPageStrength(
    ['https://example-shared.com/page-1', 'example-shared.com'],
    CTX,
  );
  const page = rows.get('example-shared.com/page-1');
  assert.equal(page.pageRank, 720);
  const dom = rows.get('domain:example-shared.com');
  assert.ok(dom, 'domain entry keyed');
  assert.equal(
    dom.domainTraffic,
    50000,
    'domain ETV parsed defensively',
  );
});

server.close();
console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(
  `\n${results.length - failed.length}/${results.length} passed`,
);
process.exit(failed.length ? 1 : 0);

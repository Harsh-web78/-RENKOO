/*
 * RENKOO 6.0 Phase 2A — deterministic internal-link
 * recommender tests.
 *
 * Verifies source/target selection, anchor inference
 * labeling, quality gates, persistence idempotency and
 * honest unavailable states — using existing data shapes
 * only (persisted links/clusters, corpus n-grams, GSC
 * joins, brief candidates). No live provider, no link
 * graph, no fabricated authority.
 *
 * Run: npm run test:internal-links   (builds first)
 */
import assert from 'node:assert/strict';

delete process.env.DATAFORSEO_LOGIN;
delete process.env.DATAFORSEO_PASSWORD;

const dist = (p) => import(`../dist/${p}`);

const ORG = 'org1';
const ORG2 = 'org2';
const WEBSITE_ID = 'w1';
const WEBSITE2_ID = 'w2';

const LINKS = [
  {
    keyword: 'crm pricing',
    topic: 'Crm',
    targetPage: 'https://site.com/crm/pricing',
    pageMapping: 'IMPROVE',
    bucket: 'QUICK_WIN',
    priority: 'HIGH',
    priorityScore: 80,
    intent: 'COMMERCIAL',
  },
  {
    keyword: 'crm comparison',
    topic: 'Crm',
    targetPage: 'https://site.com/blog/crm-comparison',
    pageMapping: 'OPTIMIZE',
    bucket: 'GROW',
    priority: 'MEDIUM',
    priorityScore: 50,
    intent: 'COMMERCIAL',
  },
  {
    keyword: 'pricing',
    topic: 'Pricing',
    targetPage: 'https://site.com/pricing',
    pageMapping: 'IMPROVE',
    bucket: 'QUICK_WIN',
    priority: 'HIGH',
    priorityScore: 95,
    intent: 'COMMERCIAL',
  },
  {
    keyword: 'demo',
    topic: 'Demo',
    targetPage: null,
    pageMapping: 'CREATE',
    bucket: 'CREATE',
    priority: 'MEDIUM',
    priorityScore: 44,
    intent: 'TRANSACTIONAL',
  },
  {
    keyword: 'gmail homepage',
    topic: 'Gmail',
    targetPage: null,
    pageMapping: 'IGNORE',
    bucket: 'IGNORE',
    priority: 'LOW',
    priorityScore: 10,
    intent: 'NAVIGATIONAL',
  },
  {
    keyword: 'stale feature',
    topic: 'Stale',
    targetPage: null,
    pageMapping: 'OPTIMIZE',
    bucket: 'GROW',
    priority: 'LOW',
    priorityScore: 25,
    intent: 'INFORMATIONAL',
  },
];

const CLUSTERS = [
  {
    topic: 'Crm',
    primaryKeyword: 'crm pricing',
    supportingKeywords: ['crm comparison'],
    size: 2,
    intent: 'COMMERCIAL',
    existingPages: [
      'https://site.com/crm/pricing',
      'https://site.com/blog/crm-comparison',
    ],
    missingPages: 0,
    cannibalizationRisk: false,
    priority: 'HIGH',
    pillarPage: 'https://site.com/crm/pricing',
  },
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
  },
];

function corpus() {
  return new Map([
    [
      'crm comparison',
      {
        keyword: 'crm comparison',
        pages: 2,
        occurrences: 4,
        relevanceScore: 45,
        urls: ['https://site.com/blog/crm-comparison'],
      },
    ],
    [
      'pricing plans',
      {
        keyword: 'pricing plans',
        pages: 1,
        occurrences: 2,
        relevanceScore: 25,
        urls: ['https://site.com/blog/pricing-guide'],
      },
    ],
    [
      'crm pricing',
      {
        keyword: 'crm pricing',
        pages: 3,
        occurrences: 6,
        relevanceScore: 80,
        urls: ['https://site.com/crm/pricing'],
      },
    ],
    [
      'unrelated topic xyz',
      {
        keyword: 'unrelated topic xyz',
        pages: 1,
        occurrences: 2,
        relevanceScore: 20,
        urls: ['https://site.com/blog/xyz'],
      },
    ],
  ]);
}

function gscPages() {
  return new Map([
    [
      'crm comparison',
      [
        {
          page: 'https://site.com/blog/crm-comparison',
          position: 12,
          clicks: 5,
          impressions: 300,
        },
      ],
    ],
    [
      'pricing',
      [
        {
          page: 'https://site.com/pricing',
          position: 8.2,
          clicks: 120,
          impressions: 4200,
        },
      ],
    ],
  ]);
}

const PARENT_TOPICS = {
  'crm comparison': 'Crm',
  'crm pricing': 'Crm',
  'pricing plans': 'Pricing',
  pricing: 'Pricing',
  demo: 'Demo',
};

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
      const row = rows.find((r) => r.id === where.id);
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

function seedLinks(extra = {}) {
  return LINKS.map((l, i) => ({
    id: `link_${i}`,
    organizationId: ORG,
    websiteId: WEBSITE_ID,
    contentAction: l.pageMapping,
    ...extra,
    ...l,
  }));
}

function makePrisma(seeds = {}) {
  return {
    contentCluster: collection(
      (seeds.clusters ?? CLUSTERS).map((c, i) => ({
        id: `cc_${i}`,
        organizationId: ORG,
        websiteId: WEBSITE_ID,
        ...c,
      })),
    ),
    contentStrategyLink: collection(seeds.links ?? seedLinks()),
    contentBrief: collection(seeds.briefs ?? []),
    recommendation: collection(
      seeds.recommendations ?? [],
      'rec',
    ),
    action: collection(seeds.actions ?? [], 'act'),
    contentItem: collection([], 'item'),
    contentDraft: collection([], 'draft'),
  };
}

function makeResearch(overrides = {}) {
  return {
    getCorpora: async () => ({
      website: { id: WEBSITE_ID },
      siteCorpus: overrides.corpus ?? corpus(),
      competitorCorpus: new Map(),
      competitorCount: 0,
    }),
    getGscMaps: async () => ({
      byQuery: new Map(),
      byQueryPages: overrides.gscPages ?? gscPages(),
    }),
    getParentTopic: (kw) =>
      PARENT_TOPICS[kw.trim().toLowerCase()] ??
      kw
        .trim()
        .split(/\s+/)
        .slice(-2)
        .join(' '),
  };
}

const RICH_BRIEFS = [
  {
    id: 'brief_crm',
    organizationId: ORG,
    websiteId: WEBSITE_ID,
    targetQuery: 'crm pricing',
    payload: {
      internalLinks: [
        {
          title: 'Pricing guide',
          url: 'https://site.com/blog/pricing-guide',
        },
      ],
    },
  },
];

async function buildService(seeds = {}, researchOverrides = {}) {
  const svcMod = await dist(
    'keywords/content-strategy.service.js',
  );
  const prisma = makePrisma(seeds);
  /* No completed crawl in these fixtures: verification
     degrades to UNAVAILABLE entries by design. */
  const fakeGraph = {
    latestCompletedCrawl: async () => null,
  };
  const svc = new svcMod.ContentStrategyService(
    prisma,
    {},
    makeResearch(researchOverrides),
    fakeGraph,
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

/* 1. Source candidate generation. */
await test('source candidate generation', async () => {
  const { svc } = await buildService({ briefs: RICH_BRIEFS });
  const res = await svc.getLinkRecommendations(ORG, WEBSITE_ID, {
    keyword: 'crm pricing',
  });
  assert.ok(res.total > 0, 'expected sources for crm pricing');
  const urls = res.recommendations.map((r) => r.sourceUrl);
  assert.ok(
    urls.includes('https://site.com/blog/crm-comparison'),
    'corpus+GSC source expected',
  );
  assert.ok(
    urls.includes('https://site.com/blog/pricing-guide'),
    'brief candidate source expected',
  );
});

/* 2. Target candidate generation. */
await test('target candidate generation', async () => {
  const { svc } = await buildService();
  const res = await svc.getLinkRecommendations(ORG, WEBSITE_ID, {
    limit: 100,
  });
  const targets = new Set(
    res.recommendations.map((r) => r.targetUrl),
  );
  assert.ok(targets.has('https://site.com/crm/pricing'));
  assert.ok(targets.has('https://site.com/pricing'));
  assert.ok(
    !res.recommendations.some(
      (r) => r.keyword === 'gmail homepage',
    ),
    'IGNORE target must never appear',
  );
});

/* 3. Source can never equal target. */
await test('source never equals target', async () => {
  const { svc } = await buildService();
  const res = await svc.getLinkRecommendations(ORG, WEBSITE_ID, {
    limit: 100,
  });
  for (const r of res.recommendations) {
    assert.notEqual(
      r.sourceUrl.trim().toLowerCase().replace(/\/$/, ''),
      String(r.targetUrl ?? '')
        .trim()
        .toLowerCase()
        .replace(/\/$/, ''),
      `self-link for ${r.targetUrl}`,
    );
  }
});

/* 4. Same-cluster recommendation. */
await test('same cluster recommendation', async () => {
  const { svc } = await buildService();
  const res = await svc.getLinkRecommendations(ORG, WEBSITE_ID, {
    keyword: 'crm pricing',
  });
  const rec = res.recommendations.find(
    (r) =>
      r.sourceUrl ===
      'https://site.com/blog/crm-comparison',
  );
  assert.ok(rec, 'same-cluster source expected');
  assert.ok(
    rec.reason.includes('Crm') ||
      rec.reason.toLowerCase().includes('cluster'),
    'reason must cite the cluster relationship',
  );
});

/* 5. Supporting keyword page links to primary target. */
await test('supporting keyword to primary target', async () => {
  const { svc } = await buildService();
  const res = await svc.getLinkRecommendations(ORG, WEBSITE_ID, {
    keyword: 'crm pricing',
  });
  const rec = res.recommendations.find(
    (r) =>
      r.sourceUrl ===
      'https://site.com/blog/crm-comparison',
  );
  assert.ok(rec);
  assert.equal(rec.targetUrl, 'https://site.com/crm/pricing');
  assert.equal(rec.suggestedAnchor, 'crm comparison');
  assert.equal(rec.anchorSource, 'SUPPORTING_KEYWORD');
});

/* 6. Anchor selection prefers supporting over primary. */
await test('anchor selection order', async () => {
  const { svcMod } = await buildService();
  const withSupport = svcMod.pickLinkAnchor({
    supporting: 'crm comparison',
    primary: 'crm pricing',
    topic: 'Crm',
    sourceUrl: 'https://site.com/blog/crm-comparison',
    targetUrl: 'https://site.com/crm/pricing',
  });
  assert.equal(withSupport.anchor, 'crm comparison');
  assert.equal(withSupport.source, 'SUPPORTING_KEYWORD');
  const fallback = svcMod.pickLinkAnchor({
    supporting: null,
    primary: 'crm pricing',
    topic: 'Crm',
    sourceUrl: 'https://site.com/blog/x',
    targetUrl: 'https://site.com/crm/pricing',
  });
  assert.equal(fallback.anchor, 'crm pricing');
  assert.equal(fallback.source, 'PRIMARY_KEYWORD');
  const topicOnly = svcMod.pickLinkAnchor({
    supporting: null,
    primary: null,
    topic: 'Crm',
    sourceUrl: 'https://site.com/blog/x',
    targetUrl: 'https://site.com/crm/pricing',
  });
  assert.equal(topicOnly.source, 'TOPIC_TERM');
  assert.equal(
    svcMod.pickLinkAnchor({
      supporting: 'https://site.com/blog/x',
      primary: null,
      topic: null,
      sourceUrl: 'https://site.com/blog/x',
      targetUrl: 'https://site.com/y',
    }),
    null,
    'URL-like anchor must be rejected',
  );
});

/* 7. Anchor source labeling is always INFERENCE. */
await test('anchor source labeling', async () => {
  const { svc } = await buildService();
  const res = await svc.getLinkRecommendations(ORG, WEBSITE_ID, {
    limit: 100,
  });
  assert.ok(res.total > 0);
  const allowed = new Set([
    'SUPPORTING_KEYWORD',
    'PRIMARY_KEYWORD',
    'TOPIC_TERM',
  ]);
  for (const r of res.recommendations) {
    assert.ok(
      allowed.has(r.anchorSource),
      `bad anchorSource ${r.anchorSource}`,
    );
    const anchorEvidence = r.evidenceSources.find((e) =>
      e.label.toLowerCase().includes('anchor'),
    );
    assert.ok(anchorEvidence, 'anchor evidence required');
    assert.equal(anchorEvidence.source, 'INFERENCE');
  }
  const dump = JSON.stringify(res.recommendations).toLowerCase();
  assert.ok(!dump.includes('observed anchor'));
  assert.ok(!dump.includes('current anchor'));
  /* The honest UNAVAILABLE label for unpersisted anchor
     text is required — it must never read as observed. */
  const existingAnchorEntries = res.recommendations.flatMap(
    (r) => r.evidenceSources,
  ).filter((e) => e.label === 'Existing anchors');
  assert.ok(existingAnchorEntries.length > 0);
  for (const entry of existingAnchorEntries) {
    assert.equal(entry.source, 'UNAVAILABLE');
  }
});

/* 8. Irrelevant pairs rejected. */
await test('irrelevant pair rejection', async () => {
  const { svc } = await buildService();
  const res = await svc.getLinkRecommendations(ORG, WEBSITE_ID, {
    limit: 100,
  });
  assert.ok(
    !res.recommendations.some(
      (r) =>
        r.sourceUrl === 'https://site.com/blog/xyz',
    ),
    'unrelated-corpus page must never be a source',
  );
});

/* 9. IGNORE targets rejected. */
await test('ignore target rejection', async () => {
  const { svc } = await buildService();
  const res = await svc.getLinkRecommendations(ORG, WEBSITE_ID, {
    keyword: 'gmail homepage',
  });
  assert.equal(res.total, 0);
});

/* 10. Missing targets rejected, CREATE stays future-only. */
await test('missing target handling', async () => {
  const { svc } = await buildService();
  const stale = await svc.getLinkRecommendations(ORG, WEBSITE_ID, {
    keyword: 'stale feature',
  });
  assert.equal(
    stale.total,
    0,
    'OPTIMIZE with unknown null target must be rejected',
  );
  const demo = await svc.getLinkRecommendations(ORG, WEBSITE_ID, {
    keyword: 'demo',
  });
  for (const r of demo.recommendations) {
    assert.equal(r.futureContent, true);
    assert.equal(r.targetUrl, null);
  }
});

/* 11. Duplicate prevention on sync. */
await test('duplicate prevention', async () => {
  const { prisma, svc } = await buildService({
    briefs: RICH_BRIEFS,
  });
  const first = await svc.syncLinkRecommendations(ORG, WEBSITE_ID);
  assert.ok(first.created > 0);
  const count = prisma.recommendation.__rows.length;
  const second = await svc.syncLinkRecommendations(ORG, WEBSITE_ID);
  assert.equal(second.created, 0, 'resync must not recreate');
  assert.equal(prisma.recommendation.__rows.length, count);
  assert.ok(second.updated >= 0);
});

/* 12. Idempotent regeneration. */
await test('idempotent regeneration', async () => {
  const { prisma, svc } = await buildService();
  await svc.syncLinkRecommendations(ORG, WEBSITE_ID);
  const n = prisma.recommendation.__rows.length;
  await svc.syncLinkRecommendations(ORG, WEBSITE_ID);
  await svc.syncLinkRecommendations(ORG, WEBSITE_ID);
  assert.equal(prisma.recommendation.__rows.length, n);
});

/* 13. Recommendation metadata contract. */
await test('recommendation metadata', async () => {
  const { prisma, svc } = await buildService();
  await svc.syncLinkRecommendations(ORG, WEBSITE_ID);
  const row = prisma.recommendation.__rows.find(
    (r) => r.type === 'INTERNAL_LINK_OPPORTUNITY',
  );
  assert.ok(row, 'expected persisted rec');
  assert.equal(row.source, 'CONTENT');
  assert.equal(row.pageUrl, row.metadata.sourceUrl);
  for (const key of [
    'sourceUrl',
    'targetUrl',
    'suggestedAnchor',
    'anchorSource',
    'keyword',
    'topic',
    'reason',
    'priority',
    'priorityBand',
    'evidenceSources',
  ]) {
    assert.ok(
      row.metadata[key] !== undefined,
      `metadata.${key} required`,
    );
  }
  assert.ok(['HIGH', 'MEDIUM', 'LOW'].includes(row.priority));
  assert.equal(row.effort, 'LOW');
});

/* 14. Action linkage. */
await test('action linkage', async () => {
  const { svc } = await buildService({
    briefs: RICH_BRIEFS,
    actions: [
      {
        id: 'act_link_1',
        organizationId: ORG,
        websiteId: WEBSITE_ID,
        status: 'TODO',
        title: 'Add link',
        metadata: {
          sourceUrl: 'https://site.com/blog/crm-comparison',
          targetUrl: 'https://site.com/crm/pricing',
          strategyKeyword: 'crm pricing',
        },
      },
    ],
  });
  const res = await svc.getLinkRecommendations(ORG, WEBSITE_ID, {
    keyword: 'crm pricing',
  });
  const rec = res.recommendations.find(
    (r) =>
      r.sourceUrl ===
      'https://site.com/blog/crm-comparison',
  );
  assert.ok(rec);
  assert.equal(rec.action.exists, true);
  assert.equal(rec.action.id, 'act_link_1');
  assert.equal(rec.action.status, 'TODO');
});

/* 15. Dismissed recommendations never reappear. */
await test('dismissed recommendation handling', async () => {
  const dismissedPair = {
    id: 'rec_dead',
    organizationId: ORG,
    websiteId: WEBSITE_ID,
    source: 'CONTENT',
    type: 'INTERNAL_LINK_OPPORTUNITY',
    status: 'DISMISSED',
    title: 'dead',
    description: 'dead',
    priority: 'HIGH',
    metadata: {
      sourceUrl: 'https://site.com/blog/crm-comparison',
      targetUrl: 'https://site.com/crm/pricing',
      keyword: 'crm pricing',
    },
  };
  const { prisma, svc } = await buildService({
    recommendations: [dismissedPair],
  });
  const res = await svc.getLinkRecommendations(ORG, WEBSITE_ID, {
    keyword: 'crm pricing',
  });
  assert.ok(
    !res.recommendations.some(
      (r) =>
        r.sourceUrl ===
        'https://site.com/blog/crm-comparison',
    ),
    'dismissed pair must not reappear',
  );
  const sync = await svc.syncLinkRecommendations(ORG, WEBSITE_ID);
  const sameIdentity = prisma.recommendation.__rows.filter(
    (r) =>
      r.metadata?.sourceUrl ===
        'https://site.com/blog/crm-comparison' &&
      r.metadata?.targetUrl ===
        'https://site.com/crm/pricing' &&
      r.metadata?.keyword === 'crm pricing',
  );
  assert.equal(
    sameIdentity.length,
    1,
    'dismissed pair must not be duplicated',
  );
  assert.equal(
    sameIdentity[0].status,
    'DISMISSED',
    'dismissed row must not be resurrected',
  );
  assert.ok(sync.skippedDismissed >= 0);
});

/* 16. Deterministic output. */
await test('deterministic output', async () => {
  const { svc } = await buildService({ briefs: RICH_BRIEFS });
  const a = await svc.getLinkRecommendations(ORG, WEBSITE_ID, {
    limit: 100,
  });
  const b = await svc.getLinkRecommendations(ORG, WEBSITE_ID, {
    limit: 100,
  });
  assert.deepEqual(a.recommendations, b.recommendations);
});

/* 17. No fabricated anchor/link facts. */
await test('no fabricated facts', async () => {
  const { svc } = await buildService({ briefs: RICH_BRIEFS });
  const res = await svc.getLinkRecommendations(ORG, WEBSITE_ID, {
    limit: 100,
  });
  const dump = JSON.stringify(res.recommendations);
  assert.ok(!/will increase rankings/i.test(dump));
  assert.ok(!/backlink/i.test(dump));
  assert.ok(!/domain authority/i.test(dump));
  assert.ok(!/orphan/i.test(dump));
  assert.ok(
    !/observed anchor|current anchor/i.test(dump),
    'anchors must never read as observed',
  );
  for (const r of res.recommendations) {
    assert.ok(
      r.evidenceSources.some(
        (e) => e.source === 'UNAVAILABLE',
      ),
      'unavailable states must be explicit',
    );
    assert.ok(
      !/^https?:\/\//i.test(r.suggestedAnchor),
      'anchor must not be a URL',
    );
  }
});

/* 18. Unavailable-state handling. */
await test('unavailable states', async () => {
  const { svc } = await buildService({
    links: [],
    clusters: [],
  });
  const res = await svc.getLinkRecommendations(ORG, WEBSITE_ID);
  assert.equal(res.total, 0);
  assert.deepEqual(res.recommendations, []);
  assert.equal(res.persistenceAvailable, true);
  const { svc: svc2 } = await buildService(
    {},
    { corpus: new Map(), gscPages: new Map() },
  );
  const res2 = await svc2.getLinkRecommendations(ORG, WEBSITE_ID, {
    keyword: 'crm pricing',
  });
  assert.equal(res2.total, 0);
});

/* 19. Tenant isolation. */
await test('tenant isolation', async () => {
  const { prisma, svc } = await buildService({
    recommendations: [
      {
        id: 'rec_other',
        organizationId: ORG2,
        websiteId: WEBSITE2_ID,
        source: 'CONTENT',
        type: 'INTERNAL_LINK_OPPORTUNITY',
        status: 'OPEN',
        title: 'other',
        description: 'other',
        priority: 'HIGH',
        metadata: {
          sourceUrl: 'https://site.com/blog/crm-comparison',
          targetUrl: 'https://site.com/crm/pricing',
          keyword: 'crm pricing',
        },
      },
    ],
  });
  const res = await svc.getLinkRecommendations(ORG, WEBSITE_ID, {
    keyword: 'crm pricing',
  });
  assert.ok(
    res.recommendations.some(
      (r) =>
        r.sourceUrl ===
        'https://site.com/blog/crm-comparison',
    ),
    'other-org dismissal/seeding must not affect org1 compute',
  );
  await svc.syncLinkRecommendations(ORG, WEBSITE_ID);
  const mine = prisma.recommendation.__rows.filter(
    (r) => r.organizationId === ORG,
  );
  const theirs = prisma.recommendation.__rows.filter(
    (r) => r.organizationId === ORG2,
  );
  assert.equal(theirs.length, 1);
  assert.ok(mine.every((r) => r.websiteId === WEBSITE_ID));
});

/* 20. Website isolation. */
await test('website isolation', async () => {
  const { svc } = await buildService({
    links: seedLinks({ websiteId: WEBSITE2_ID }),
    clusters: CLUSTERS.map((c) => ({
      organizationId: ORG,
      websiteId: WEBSITE2_ID,
      ...c,
    })),
  });
  const res = await svc.getLinkRecommendations(ORG, WEBSITE_ID);
  assert.equal(res.total, 0);
});

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(
  `\n${results.length - failed.length}/${results.length} passed`,
);
if (failed.length > 0) process.exit(1);

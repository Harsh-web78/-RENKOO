/*
 * RENKOO Search Opportunity Command Center 1.0 — tests
 * (Phase 17).
 *
 * 71 tests over pure functions only: top-5 selection,
 * diversification, dedup, evidence states, conflicts,
 * NBA reuse + do-this-first, changes, risk, working,
 * business honesty, integration vocabulary, security
 * neutrality, performance bounds, partial data. No DB,
 * no provider calls, no billing touch.
 *
 * Run: npm run test:command-center   (dist built)
 */
import assert from 'node:assert/strict';

const cc = await import('../dist/keywords/command-center.js');

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

function opp(overrides = {}) {
  const tag = overrides.id ?? Math.random().toString(36).slice(2);
  return {
    id: `opp-${tag}`,
    category: 'CONTENT',
    title: 'Improve page',
    pageUrl: `https://example.com/page-${tag}`,
    keyword: `example keyword ${tag}`,
    topic: `example topic ${tag}`,
    priority: 'MEDIUM',
    actionType: 'IMPROVE_EXISTING_PAGE',
    why: ['observed signal'],
    evidence: [
      {
        source: 'GSC',
        label: 'demand observed',
        evidenceState: 'VERIFIED',
      },
    ],
    measurement: 'Track position and clicks.',
    source: 'roadmap',
    status: 'READY',
    businessFlags: [],
    ...overrides,
  };
}

/* ---------- TOP-5 SELECTION (10) ---------- */

await test('high priority sorts first', async () => {
  const list = [
    opp({ id: 'b', priority: 'LOW' }),
    opp({ id: 'a', priority: 'HIGH' }),
    opp({ id: 'c', priority: 'MEDIUM' }),
  ].map((raw) => cc.normalizeCandidate(raw));
  const top = cc.selectTopOpportunities(list, 5);
  assert.equal(top[0].priority, 'HIGH');
  assert.equal(top[1].priority, 'MEDIUM');
  assert.equal(top[2].priority, 'LOW');
});

await test('medium before low with equal evidence', async () => {
  const top = cc.selectTopOpportunities(
    [
      cc.normalizeCandidate(opp({ id: 'l', priority: 'LOW' })),
      cc.normalizeCandidate(opp({ id: 'm', priority: 'MEDIUM' })),
    ],
    5,
  );
  assert.equal(top[0].id, 'm');
});

await test('deterministic tie-break by id', async () => {
  const a = cc.normalizeCandidate(opp({ id: 'aaa' }));
  const b = cc.normalizeCandidate(opp({ id: 'zzz' }));
  const first = cc.selectTopOpportunities([b, a], 5);
  const second = cc.selectTopOpportunities([a, b], 5);
  assert.deepEqual(
    first.map((o) => o.id),
    second.map((o) => o.id),
  );
  assert.equal(first[0].id, 'aaa');
});

await test('fewer than 5 when insufficient', async () => {
  const top = cc.selectTopOpportunities(
    [cc.normalizeCandidate(opp({ id: 'only' }))],
    5,
  );
  assert.equal(top.length, 1);
});

await test('never manufactures opportunities', async () => {
  assert.deepEqual(cc.selectTopOpportunities([], 5), []);
});

await test('max 5 even with many candidates', async () => {
  const list = Array.from({ length: 20 }, (_, i) =>
    cc.normalizeCandidate(
      opp({
        id: `o-${String(i).padStart(2, '0')}`,
        pageUrl: `https://example.com/p-${i}`,
        keyword: `keyword ${i}`,
        topic: `topic ${i}`,
        category: [
          'RANKING',
          'CONTENT',
          'TECHNICAL',
          'INTERNAL_LINK',
          'AI_SEARCH',
        ][i % 5],
      }),
    ),
  );
  assert.equal(cc.selectTopOpportunities(list, 5).length, 5);
});

await test('blocked excluded from selection', async () => {
  const top = cc.selectTopOpportunities(
    [
      cc.normalizeCandidate(
        opp({ id: 'blocked', priority: 'HIGH', status: 'BLOCKED' }),
      ),
      cc.normalizeCandidate(opp({ id: 'ready', priority: 'LOW' })),
    ],
    5,
  );
  assert.equal(top.length, 1);
  assert.equal(top[0].id, 'ready');
});

await test('evidence strength breaks priority ties', async () => {
  const weak = cc.normalizeCandidate(
    opp({
      id: 'weak',
      priority: 'MEDIUM',
      evidence: [
        { source: 'x', label: 'y', evidenceState: 'UNAVAILABLE' },
      ],
    }),
  );
  const strong = cc.normalizeCandidate(
    opp({
      id: 'strong',
      priority: 'MEDIUM',
      evidence: [
        { source: 'GSC', label: 'a', evidenceState: 'VERIFIED' },
        { source: 'rank', label: 'b', evidenceState: 'OBSERVED' },
      ],
    }),
  );
  const top = cc.selectTopOpportunities([weak, strong], 5);
  assert.equal(top[0].id, 'strong');
});

await test('business relevance breaks remaining ties', async () => {
  const plain = cc.normalizeCandidate(
    opp({ id: 'plain', priority: 'MEDIUM' }),
  );
  const flagged = cc.normalizeCandidate(
    opp({
      id: 'flagged',
      priority: 'MEDIUM',
      businessFlags: ['commercial-demand'],
    }),
  );
  const top = cc.selectTopOpportunities([plain, flagged], 5);
  assert.equal(top[0].id, 'flagged');
});

await test('no numeric score exported', async () => {
  assert.equal('growthScore' in cc, false);
  assert.equal('impactScore' in cc, false);
  assert.equal('roiScore' in cc, false);
  assert.equal('chanceOfRanking' in cc, false);
  assert.equal('aiScore' in cc, false);
});

/* ---------- DIVERSIFICATION (6) ---------- */

await test('url cap at 2', async () => {
  const list = ['a', 'b', 'c'].map((id) =>
    cc.normalizeCandidate(
      opp({
        id,
        pageUrl: 'https://example.com/same',
        keyword: `kw-${id}`,
        topic: `t-${id}`,
      }),
    ),
  );
  assert.equal(cc.selectTopOpportunities(list, 5).length, 2);
});

await test('keyword cap at 2', async () => {
  const list = ['a', 'b', 'c'].map((id) =>
    cc.normalizeCandidate(
      opp({
        id,
        pageUrl: `https://example.com/${id}`,
        keyword: 'same keyword',
        topic: `t-${id}`,
      }),
    ),
  );
  assert.equal(cc.selectTopOpportunities(list, 5).length, 2);
});

await test('topic cap at 2', async () => {
  const list = ['a', 'b', 'c'].map((id) =>
    cc.normalizeCandidate(
      opp({
        id,
        pageUrl: `https://example.com/${id}`,
        keyword: `kw-${id}`,
        topic: 'same topic',
      }),
    ),
  );
  assert.equal(cc.selectTopOpportunities(list, 5).length, 2);
});

await test('category cap at 3', async () => {
  const list = ['a', 'b', 'c', 'd'].map((id, i) =>
    cc.normalizeCandidate(
      opp({
        id,
        category: 'CONTENT',
        pageUrl: `https://example.com/${id}`,
        keyword: `kw-${id}`,
        topic: `t-${id}`,
      }),
    ),
  );
  assert.equal(cc.selectTopOpportunities(list, 5).length, 3);
});

await test('caps are explicit constants', async () => {
  assert.equal(cc.DIVERSITY_CAPS.perUrl, 2);
  assert.equal(cc.DIVERSITY_CAPS.perKeyword, 2);
  assert.equal(cc.DIVERSITY_CAPS.perTopic, 2);
  assert.equal(cc.DIVERSITY_CAPS.perCategory, 3);
});

await test('diverse pages pass through', async () => {
  const list = ['a', 'b', 'c', 'd', 'e'].map((id) =>
    cc.normalizeCandidate(
      opp({
        id,
        pageUrl: `https://example.com/${id}`,
        keyword: `kw-${id}`,
        topic: `t-${id}`,
        category: ['RANKING', 'CONTENT', 'CTR', 'AI_SEARCH', 'TECHNICAL'][
          ['a', 'b', 'c', 'd', 'e'].indexOf(id)
        ],
      }),
    ),
  );
  assert.equal(cc.selectTopOpportunities(list, 5).length, 5);
});

/* ---------- DEDUP (6) ---------- */

await test('same url and action dedupes', async () => {
  const shared = {
    pageUrl: 'https://example.com/shared',
    keyword: 'shared keyword',
    topic: 'shared topic',
  };
  const a = cc.normalizeCandidate(
    opp({ id: 'a', source: 'roadmap', ...shared }),
  );
  const b = cc.normalizeCandidate(
    opp({ id: 'b', source: 'why-not', ...shared }),
  );
  const merged = cc.dedupeOpportunities([a, b]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].sources.sort(), ['roadmap', 'why-not']);
});

await test('same keyword and action dedupes', async () => {
  const shared = {
    pageUrl: null,
    keyword: 'shared keyword only',
    topic: 'shared topic only',
  };
  const a = cc.normalizeCandidate(
    opp({ id: 'a', source: 'baseline', ...shared }),
  );
  const b = cc.normalizeCandidate(
    opp({ id: 'b', source: 'commercial', ...shared }),
  );
  assert.equal(cc.dedupeOpportunities([a, b]).length, 1);
});

await test('different actions do not dedupe', async () => {
  const a = cc.normalizeCandidate(
    opp({ id: 'a', actionType: 'IMPROVE_EXISTING_PAGE' }),
  );
  const b = cc.normalizeCandidate(
    opp({ id: 'b', actionType: 'ADD_INTERNAL_LINK' }),
  );
  assert.equal(cc.dedupeOpportunities([a, b]).length, 2);
});

await test('multi-source evidence merged up to 12', async () => {
  const shared = {
    pageUrl: 'https://example.com/merge',
    keyword: 'merge keyword',
    topic: 'merge topic',
  };
  const a = cc.normalizeCandidate(
    opp({
      id: 'a',
      ...shared,
      evidence: Array.from({ length: 10 }, (_, i) => ({
        source: `s${i}`,
        label: `l${i}`,
        evidenceState: 'OBSERVED',
      })),
    }),
  );
  const b = cc.normalizeCandidate(
    opp({
      id: 'b',
      ...shared,
      evidence: Array.from({ length: 10 }, (_, i) => ({
        source: `t${i}`,
        label: `m${i}`,
        evidenceState: 'OBSERVED',
      })),
    }),
  );
  const merged = cc.dedupeOpportunities([a, b]);
  assert.equal(merged.length, 1);
  assert.ok(merged[0].evidence.length <= 12);
});

await test('stronger priority wins merge', async () => {
  const sharedPriority = {
    pageUrl: 'https://example.com/prio',
    keyword: 'prio keyword',
    topic: 'prio topic',
  };
  const low = cc.normalizeCandidate(
    opp({ id: 'low', priority: 'LOW', source: 'a', ...sharedPriority }),
  );
  const high = cc.normalizeCandidate(
    opp({ id: 'high', priority: 'HIGH', source: 'b', ...sharedPriority }),
  );
  const merged = cc.dedupeOpportunities([low, high]);
  assert.equal(merged[0].priority, 'HIGH');
});

await test('why capped at 3 reasons', async () => {
  const n = cc.normalizeCandidate(
    opp({ why: ['one', 'two', 'three', 'four', 'five'] }),
  );
  assert.equal(n.why.length, 3);
});

/* ---------- EVIDENCE (8) ---------- */

await test('verified evidence preserved', async () => {
  const n = cc.normalizeCandidate(
    opp({
      evidence: [
        { source: 'GSC', label: 'x', evidenceState: 'VERIFIED' },
      ],
    }),
  );
  assert.equal(n.evidence[0].evidenceState, 'VERIFIED');
});

await test('observed evidence preserved', async () => {
  const n = cc.normalizeCandidate(
    opp({
      evidence: [
        { source: 'crawl', label: 'x', evidenceState: 'OBSERVED' },
      ],
    }),
  );
  assert.equal(n.evidence[0].evidenceState, 'OBSERVED');
});

await test('inferred evidence preserved', async () => {
  const n = cc.normalizeCandidate(
    opp({
      evidence: [
        { source: 'intent', label: 'x', evidenceState: 'INFERRED' },
      ],
    }),
  );
  assert.equal(n.evidence[0].evidenceState, 'INFERRED');
});

await test('estimated evidence preserved', async () => {
  const n = cc.normalizeCandidate(
    opp({
      evidence: [
        { source: 'model', label: 'x', evidenceState: 'ESTIMATED' },
      ],
    }),
  );
  assert.equal(n.evidence[0].evidenceState, 'ESTIMATED');
});

await test('unavailable evidence preserved not zeroed', async () => {
  const n = cc.normalizeCandidate(
    opp({
      evidence: [
        { source: 'revenue', label: 'x', evidenceState: 'UNAVAILABLE' },
      ],
    }),
  );
  assert.equal(n.evidence[0].evidenceState, 'UNAVAILABLE');
});

await test('unknown evidence state falls back unavailable', async () => {
  const n = cc.normalizeCandidate(
    opp({
      evidence: [{ source: 's', label: 'x', evidenceState: 'BOGUS' }],
    }),
  );
  assert.equal(n.evidence[0].evidenceState, 'UNAVAILABLE');
});

await test('missing title or action rejected', async () => {
  assert.equal(cc.normalizeCandidate({ title: '', actionType: 'X' }), null);
  assert.equal(cc.normalizeCandidate({ title: 'T', actionType: '' }), null);
});

await test('unknown category falls back content', async () => {
  const n = cc.normalizeCandidate(
    opp({ category: 'MADE_UP_THING' }),
  );
  assert.equal(n.category, 'CONTENT');
});

/* ---------- CONFLICTS (3) ---------- */

await test('mixed evidence disclosed', async () => {
  const n = cc.normalizeCandidate(
    opp({
      title: 'Improve pricing',
      evidence: [
        { source: 'GSC', label: 'strong demand observed', evidenceState: 'OBSERVED' },
        { source: 'rank', label: 'weak visibility gap', evidenceState: 'OBSERVED' },
        { source: 'revenue', label: 'pending', evidenceState: 'UNAVAILABLE' },
      ],
    }),
  );
  assert.equal(cc.hasConflictingEvidence(n), true);
  assert.match(cc.mixedEvidenceStatement(n), /mixed/i);
});

await test('uniform evidence is not conflict', async () => {
  const n = cc.normalizeCandidate(opp({}));
  assert.equal(cc.hasConflictingEvidence(n), false);
  assert.equal(cc.mixedEvidenceStatement(n), null);
});

await test('single source is not conflict', async () => {
  const n = cc.normalizeCandidate(
    opp({
      evidence: [
        { source: 'GSC', label: 'demand', evidenceState: 'VERIFIED' },
      ],
    }),
  );
  assert.equal(cc.hasConflictingEvidence(n), false);
});

/* ---------- NBA + DO THIS FIRST (6) ---------- */

await test('existing nba matched by keyword', async () => {
  const list = [
    cc.normalizeCandidate(opp({ id: 'a', keyword: 'pricing software' })),
    cc.normalizeCandidate(opp({ id: 'b', keyword: 'other topic' })),
  ];
  const first = cc.selectDoThisFirst(list, {
    category: 'IMPROVE_EXISTING_PAGE',
    title: 'Something',
    keyword: 'pricing software',
    targetPage: null,
  });
  assert.equal(first.id, 'a');
});

await test('existing nba matched by page', async () => {
  const list = [
    cc.normalizeCandidate(
      opp({ id: 'a', pageUrl: 'https://example.com/pricing' }),
    ),
  ];
  const first = cc.selectDoThisFirst(list, {
    category: 'OTHER',
    title: 'Something',
    keyword: null,
    targetPage: 'https://example.com/pricing',
  });
  assert.equal(first.id, 'a');
});

await test('falls back to best opportunity without nba', async () => {
  const list = [
    cc.normalizeCandidate(opp({ id: 'low', priority: 'LOW' })),
    cc.normalizeCandidate(opp({ id: 'high', priority: 'HIGH' })),
  ];
  assert.equal(cc.selectDoThisFirst(list, null).id, 'high');
});

await test('nothing qualifies returns null', async () => {
  assert.equal(cc.selectDoThisFirst([], null), null);
  const blocked = [
    cc.normalizeCandidate(opp({ id: 'b', status: 'BLOCKED' })),
  ];
  assert.equal(cc.selectDoThisFirst(blocked, null), null);
});

await test('no-confidence note is honest', async () => {
  assert.match(cc.NO_ACTION_CONFIDENCE_NOTE, /enough evidence/i);
});

await test('no second scoring system', async () => {
  assert.equal('rankOpportunities' in cc, false);
  assert.equal('scoreOpportunity' in cc, false);
});

/* ---------- CHANGES (5) ---------- */

await test('rank improved statement is non-causal', async () => {
  const s = cc.changeStatement({
    kind: 'RANK',
    direction: 'IMPROVED',
    label: 'pricing software',
    detail: 'Position 5 observed.',
  });
  assert.match(s, /improved/);
  assert.match(s, /never claimed as caused/i);
});

await test('rank declined statement', async () => {
  const s = cc.changeStatement({
    kind: 'RANK',
    direction: 'DECLINED',
    label: 'pricing software',
    detail: 'Position 12 observed.',
  });
  assert.match(s, /declined/);
});

await test('ai gained statement', async () => {
  const s = cc.changeStatement({
    kind: 'AI',
    direction: 'GAINED',
    label: 'prompt',
    detail: 'Citation observed.',
  });
  assert.match(s, /gained/);
});

await test('action observed statement', async () => {
  const s = cc.changeStatement({
    kind: 'ACTION',
    direction: 'OBSERVED',
    label: 'action',
    detail: 'Positive change observed.',
  });
  assert.match(s, /observed/);
});

await test('lead change kinds supported', async () => {
  const lead = cc.changeStatement({
    kind: 'LEAD',
    direction: 'IMPROVED',
    label: 'leads',
    detail: '3 recorded.',
  });
  const revenue = cc.changeStatement({
    kind: 'REVENUE',
    direction: 'IMPROVED',
    label: 'revenue',
    detail: '2 rows.',
  });
  assert.match(lead, /improved/);
  assert.match(revenue, /improved/);
});

/* ---------- RISK (5) ---------- */

await test('two bad signals is at risk', async () => {
  assert.equal(
    cc.assessRisk({
      rankingDeclined: true,
      ctrDeclined: true,
      aiCitationLost: false,
      commercialWeak: false,
      hasEvidence: true,
    }),
    'AT_RISK',
  );
});

await test('one bad signal is watch', async () => {
  assert.equal(
    cc.assessRisk({
      rankingDeclined: true,
      ctrDeclined: false,
      aiCitationLost: false,
      commercialWeak: false,
      hasEvidence: true,
    }),
    'WATCH',
  );
});

await test('no evidence is no evidence', async () => {
  assert.equal(
    cc.assessRisk({
      rankingDeclined: null,
      ctrDeclined: null,
      aiCitationLost: null,
      commercialWeak: null,
      hasEvidence: false,
    }),
    'NO_EVIDENCE',
  );
});

await test('no probability in risk states', async () => {
  assert.ok(!('riskScore' in cc));
  assert.ok(!('probability' in cc));
  const states = ['AT_RISK', 'WATCH', 'NO_EVIDENCE'];
  for (const s of states) assert.equal(typeof s, 'string');
});

await test('all unknown with evidence is no evidence', async () => {
  assert.equal(
    cc.assessRisk({
      rankingDeclined: null,
      ctrDeclined: null,
      aiCitationLost: null,
      commercialWeak: null,
      hasEvidence: true,
    }),
    'NO_EVIDENCE',
  );
});

/* ---------- WORKING + HEALTH (5) ---------- */

await test('health strong with signals', async () => {
  assert.equal(
    cc.healthOf({
      strongSignals: 2,
      watchSignals: 0,
      riskSignals: 0,
      hasEvidence: true,
    }),
    'Strong',
  );
});

await test('health needs attention on risks', async () => {
  assert.equal(
    cc.healthOf({
      strongSignals: 0,
      watchSignals: 0,
      riskSignals: 2,
      hasEvidence: true,
    }),
    'Needs attention',
  );
});

await test('health unavailable without evidence', async () => {
  assert.equal(
    cc.healthOf({
      strongSignals: 0,
      watchSignals: 0,
      riskSignals: 0,
      hasEvidence: false,
    }),
    'Unavailable',
  );
});

await test('health watch on mixed signals', async () => {
  assert.equal(
    cc.healthOf({
      strongSignals: 0,
      watchSignals: 2,
      riskSignals: 0,
      hasEvidence: true,
    }),
    'Watch',
  );
});

await test('no health score numbers', async () => {
  assert.equal('healthScore' in cc, false);
  assert.equal('seoScore' in cc, false);
});

/* ---------- BUSINESS (4) ---------- */

await test('business flags preserved', async () => {
  const n = cc.normalizeCandidate(
    opp({ businessFlags: ['commercial-demand', 'striking'] }),
  );
  assert.deepEqual(n.businessFlags, ['commercial-demand', 'striking']);
});

await test('no revenue inference helper', async () => {
  assert.equal('estimateRevenue' in cc, false);
  assert.equal('revenueEstimate' in cc, false);
  assert.equal('monetaryUpside' in cc, false);
});

await test('cannot-measure covers five gaps', async () => {
  assert.ok(cc.CANNOT_MEASURE.length >= 5);
  const joined = cc.CANNOT_MEASURE.join(' ').toLowerCase();
  assert.match(joined, /ranking/);
  assert.match(joined, /revenue estimate/);
  assert.match(joined, /causal/);
  assert.match(joined, /zero-click/);
  assert.match(joined, /ai referral traffic/);
});

await test('sources tracked per opportunity', async () => {
  const n = cc.normalizeCandidate(opp({ source: 'roadmap' }));
  assert.deepEqual(n.sources, ['roadmap']);
});

/* ---------- INTEGRATION VOCABULARY (5) ---------- */

await test('categories reuse existing semantics', async () => {
  for (const category of [
    'RANKING',
    'CONTENT',
    'TECHNICAL',
    'INTERNAL_LINK',
    'AI_SEARCH',
    'COMMERCIAL_SEARCH',
    'CTR',
    'AUTHORITY',
    'MEASUREMENT',
    'BUSINESS_OUTCOME',
  ]) {
    const n = cc.normalizeCandidate(opp({ category }));
    assert.equal(n.category, category);
  }
});

await test('statuses match lifecycle', async () => {
  for (const status of [
    'READY',
    'IN_PROGRESS',
    'BLOCKED',
    'OBSERVED',
    'UNAVAILABLE',
  ]) {
    const n = cc.normalizeCandidate(opp({ status }));
    assert.equal(n.status, status);
  }
});

await test('measurement defaults honestly', async () => {
  const n = cc.normalizeCandidate(opp({ measurement: '' }));
  assert.match(n.measurement, /never causal proof/i);
});

await test('dedupe key is action plus url plus keyword', async () => {
  const n = cc.normalizeCandidate(
    opp({
      actionType: 'ADD_INTERNAL_LINK',
      pageUrl: 'HTTPS://Example.com/X/?a=b',
      keyword: '  Pricing  ',
    }),
  );
  assert.equal(
    cc.dedupeKey(n),
    'ADD_INTERNAL_LINK|example.com/x|pricing',
  );
});

await test('normalizers handle empties', async () => {
  assert.equal(cc.normUrl(''), null);
  assert.equal(cc.normKeyword('  '), null);
  assert.equal(cc.normTopic(null), null);
});

/* ---------- SECURITY + PERFORMANCE (3) ---------- */

await test('no tenant fields in pure layer', async () => {
  assert.equal('organizationId' in cc, false);
  assert.equal('tenantId' in cc, false);
});

await test('no provider calls in pure layer', async () => {
  assert.equal('fetch' in cc, false);
  assert.equal('dataForSeo' in cc, false);
});

await test('selection is bounded at 5', async () => {
  const list = Array.from({ length: 40 }, (_, i) =>
    cc.normalizeCandidate(
      opp({
        id: `x-${String(i).padStart(2, '0')}`,
        category: 'MEASUREMENT',
        pageUrl: `https://example.com/${i}`,
        keyword: `kw ${i}`,
        topic: `topic ${i}`,
      }),
    ),
  );
  assert.ok(cc.selectTopOpportunities(list, 5).length <= 5);
});

/* ---------- PARTIAL DATA (5) ---------- */

await test('empty website returns empty hero set', async () => {
  assert.deepEqual(cc.selectTopOpportunities([], 5), []);
});

await test('gsc-only candidates still select', async () => {
  const top = cc.selectTopOpportunities(
    [cc.normalizeCandidate(opp({ id: 'g', source: 'search-baseline' }))],
    5,
  );
  assert.equal(top.length, 1);
});

await test('ai-only candidates still select', async () => {
  const top = cc.selectTopOpportunities(
    [
      cc.normalizeCandidate(
        opp({ id: 'ai', category: 'AI_SEARCH', source: 'ai-search-os' }),
      ),
    ],
    5,
  );
  assert.equal(top.length, 1);
});

await test('unavailable evidence candidates are last resort', async () => {
  const empty = cc.normalizeCandidate(
    opp({
      id: 'empty',
      priority: 'HIGH',
      evidence: [
        { source: 's', label: 'l', evidenceState: 'UNAVAILABLE' },
      ],
    }),
  );
  const full = cc.normalizeCandidate(
    opp({ id: 'full', priority: 'HIGH' }),
  );
  const top = cc.selectTopOpportunities([empty, full], 5);
  assert.equal(top[0].id, 'full');
});

await test('do-this-first null when only unavailable evidence', async () => {
  const list = [
    cc.normalizeCandidate(
      opp({
        id: 'u',
        evidence: [
          { source: 's', label: 'l', evidenceState: 'UNAVAILABLE' },
        ],
      }),
    ),
  ];
  assert.equal(cc.selectDoThisFirst(list, null), null);
});

const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(`\nCommand Center: ${results.length - failed.length}/${results.length} passed`);
for (const r of results) console.log(r);
if (failed.length > 0) process.exit(1);

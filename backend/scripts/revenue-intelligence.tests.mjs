/*
 * RENKOO Search-to-Revenue + AI ROI 1.0 — tests (Phase 13).
 *
 * 54 tests over pure functions only: URL matching,
 * funnel composition,
 * evidence states, unavailable handling, page matching,
 * lead tiers, direct/connected/inferred/unavailable
 * attribution, AI citation-without-traffic, revenue
 * without source, action before/after language, topic
 * and page outcomes, commercial relevance, zero-click
 * states, window handling, dedupe/ordering, empty and
 * partial data, no fake ROI/revenue/conversion claims.
 * No DB, no provider calls, no billing touch.
 *
 * Run: npm run test:revenue-intelligence   (dist built)
 */
import assert from 'node:assert/strict';

const rev = await import(
  '../dist/roi/revenue-intelligence.js'
);

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

/* ---------- URL matching (4) ---------- */

await test('same page matches across www and slash', async () => {
  assert.equal(
    rev.sameOutcomePage(
      'https://www.acme.com/pricing/',
      'http://acme.com/pricing',
    ),
    true,
  );
});

await test('query strings ignored in page match', async () => {
  assert.equal(
    rev.sameOutcomePage(
      'https://acme.com/blog?utm_source=google',
      'https://acme.com/blog',
    ),
    true,
  );
});

await test('different pages do not match', async () => {
  assert.equal(
    rev.sameOutcomePage(
      'https://acme.com/a',
      'https://acme.com/b',
    ),
    false,
  );
});

await test('empty urls never match', async () => {
  assert.equal(rev.sameOutcomePage('', null), false);
  assert.equal(
    rev.normalizeOutcomeUrl('   '),
    null,
  );
});

/* ---------- lead attribution (6) ---------- */

await test('explicit search source is direct', async () => {
  assert.equal(
    rev.classifyLeadAttribution({
      source: 'ORGANIC_SEARCH',
      landingPage: 'https://acme.com/x',
    }),
    'DIRECT',
  );
});

await test('source detail mentioning search is direct', async () => {
  assert.equal(
    rev.classifyLeadAttribution({
      source: 'OTHER',
      sourceDetail: 'came via google organic',
    }),
    'DIRECT',
  );
});

await test('landing page without source is connected', async () => {
  assert.equal(
    rev.classifyLeadAttribution({
      source: 'REFERRAL',
      landingPage: 'https://acme.com/pricing',
    }),
    'CONNECTED',
  );
});

await test('keyword hint alone is inferred', async () => {
  assert.equal(
    rev.classifyLeadAttribution({
      source: 'OTHER',
      keyword: 'best crm',
    }),
    'INFERRED',
  );
});

await test('bare lead is unavailable', async () => {
  assert.equal(
    rev.classifyLeadAttribution({ source: 'OTHER' }),
    'UNAVAILABLE',
  );
});

await test('attribution statements disclose limits', async () => {
  assert.ok(
    rev
      .attributionStatement('CONNECTED', 'Lead')
      .includes('not proven'),
  );
  assert.ok(
    rev
      .attributionStatement('UNAVAILABLE', 'Lead')
      .includes('not zero'),
  );
});

/* ---------- revenue attribution (5) ---------- */

await test('revenue via search lead inherits connected', async () => {
  assert.equal(
    rev.classifyRevenueAttribution({
      leadId: 'l1',
      leadAttribution: 'DIRECT',
    }),
    'CONNECTED',
  );
});

await test('revenue naming search is direct', async () => {
  assert.equal(
    rev.classifyRevenueAttribution({
      leadId: 'l1',
      leadAttribution: 'CONNECTED',
      source: 'ORGANIC_SEARCH',
    }),
    'DIRECT',
  );
});

await test('revenue without lead or source is unavailable', async () => {
  assert.equal(
    rev.classifyRevenueAttribution({}),
    'UNAVAILABLE',
  );
});

await test('no proportional allocation exists', async () => {
  const dump = rev
    .classifyRevenueAttribution.toString()
    .toLowerCase();
  assert.ok(!dump.includes('proport'));
  assert.ok(!dump.includes('allocat'));
  assert.ok(!dump.includes('split'));
});

await test('unlinked revenue keeps lead tier path', async () => {
  assert.equal(
    rev.classifyRevenueAttribution({
      leadId: 'l9',
      leadAttribution: 'UNAVAILABLE',
    }),
    'UNAVAILABLE',
  );
});

/* ---------- funnel (4) ---------- */

await test('funnel stages carry evidence states', async () => {
  const stage = rev.funnelStage(
    'LEADS',
    12,
    '28d',
    'OBSERVED',
  );
  assert.equal(stage.value, 12);
  assert.equal(stage.evidenceState, 'OBSERVED');
});

await test('missing funnel value stays null unavailable', async () => {
  const stage = rev.funnelStage(
    'REVENUE',
    null,
    '28d',
    'OBSERVED',
  );
  assert.equal(stage.value, null);
  assert.equal(stage.evidenceState, 'UNAVAILABLE');
});

await test('unavailable never renders as zero', async () => {
  const stage = rev.funnelStage(
    'CUSTOMERS',
    null,
    '28d',
    'VERIFIED',
  );
  assert.notEqual(stage.value, 0);
});

await test('negative values degrade to unavailable', async () => {
  const stage = rev.funnelStage(
    'LEADS',
    -3,
    '28d',
    'OBSERVED',
  );
  assert.equal(stage.value, null);
});

/* ---------- lead tiers (3) ---------- */

await test('converted leads are customers', async () => {
  assert.equal(
    rev.classifyLeadTier({
      status: 'NEW',
      converted: true,
    }),
    'CUSTOMER',
  );
});

await test('revenue-linked leads are customers', async () => {
  assert.equal(
    rev.classifyLeadTier({
      status: 'QUALIFIED',
      hasRevenue: true,
    }),
    'CUSTOMER',
  );
});

await test('qualification requires recorded status', async () => {
  assert.equal(
    rev.classifyLeadTier({ status: 'CONTACTED' }),
    'LEAD',
  );
  assert.equal(
    rev.classifyLeadTier({ status: 'QUALIFIED' }),
    'QUALIFIED',
  );
});

/* ---------- zero-click states (7) ---------- */

await test('visible without clicks flags zero-click', async () => {
  assert.equal(
    rev.zeroClickState({
      impressions: 5000,
      clicks: 10,
      aiCitations: 0,
      aiTraffic: null,
      leads: 0,
      revenue: 0,
    }),
    'HIGH_SEARCH_VISIBILITY_LOW_TRAFFIC',
  );
});

await test('citations without traffic flag ai gap', async () => {
  assert.equal(
    rev.zeroClickState({
      impressions: 100,
      clicks: 5,
      aiCitations: 4,
      aiTraffic: null,
      leads: 1,
      revenue: 0,
    }),
    'HIGH_AI_VISIBILITY_NO_OBSERVED_TRAFFIC',
  );
});

await test('citations without leads flag lead gap', async () => {
  assert.equal(
    rev.zeroClickState({
      impressions: 100,
      clicks: 5,
      aiCitations: 2,
      aiTraffic: 3,
      leads: 0,
      revenue: 0,
    }),
    'HIGH_CITATION_NO_OBSERVED_LEAD',
  );
});

await test('traffic without leads flags conversion gap', async () => {
  assert.equal(
    rev.zeroClickState({
      impressions: 800,
      clicks: 60,
      aiCitations: 0,
      aiTraffic: 0,
      leads: 0,
      revenue: 0,
    }),
    'HIGH_TRAFFIC_LOW_LEAD',
  );
});

await test('leads without revenue flag evidence gap', async () => {
  assert.equal(
    rev.zeroClickState({
      impressions: 800,
      clicks: 60,
      aiCitations: 0,
      aiTraffic: 0,
      leads: 4,
      revenue: 0,
    }),
    'HIGH_LEAD_LOW_REVENUE_EVIDENCE',
  );
});

await test('empty evidence is insufficient', async () => {
  assert.equal(
    rev.zeroClickState({
      impressions: null,
      clicks: null,
      aiCitations: null,
      aiTraffic: null,
      leads: null,
      revenue: null,
    }),
    'INSUFFICIENT_EVIDENCE',
  );
});

await test('diagnostic language is descriptive', async () => {
  const text = rev
    .zeroClickStatement('HIGH_TRAFFIC_LOW_LEAD')
    .toLowerCase();
  assert.ok(!text.includes('because'));
  assert.ok(!text.includes('caused'));
});

/* ---------- commercial relevance (4) ---------- */

await test('transactional intent is high relevance', async () => {
  assert.equal(
    rev.commercialRelevance({ intent: 'TRANSACTIONAL' }),
    'HIGH',
  );
});

await test('commercial intent with cpc is medium', async () => {
  assert.equal(
    rev.commercialRelevance({
      intent: 'COMMERCIAL',
      cpc: 4.2,
    }),
    'MEDIUM',
  );
});

await test('informational intent is low relevance', async () => {
  assert.equal(
    rev.commercialRelevance({ intent: 'INFORMATIONAL' }),
    'LOW',
  );
});

await test('no commercial data is unavailable', async () => {
  assert.equal(rev.commercialRelevance({}), 'UNAVAILABLE');
  assert.equal(
    rev.commercialRelevance({
      intent: '',
      cpc: null,
      volume: null,
    }),
    'UNAVAILABLE',
  );
});

/* ---------- action outcomes (3) ---------- */

await test('action outcomes use observed-after language', async () => {
  const text = rev.actionOutcomeStatement({
    title: 'Improve /pricing',
    metric: 'leads',
    before: 2,
    after: 5,
  });
  assert.ok(text.includes('after the action'));
  assert.ok(text.includes('not proof'));
  assert.ok(
    !/this action (increased|drove|generated|caused)/i.test(
      text,
    ),
  );
  assert.ok(!text.includes('increased revenue'));
});

await test('missing action sides stay unknown', async () => {
  const text = rev.actionOutcomeStatement({
    title: 't',
    metric: 'revenue',
    before: null,
    after: 100,
  });
  assert.ok(text.includes('unknown'));
  assert.ok(!text.includes('0'));
});

await test('unchanged outcomes say unchanged', async () => {
  const text = rev.actionOutcomeStatement({
    title: 't',
    metric: 'clicks',
    before: 40,
    after: 40,
  });
  assert.ok(text.includes('unchanged'));
});

/* ---------- ROI (4) ---------- */

await test('roi computes from real inputs', async () => {
  const verdict = rev.roiVerdict({
    revenue: 200,
    cost: 100,
  });
  assert.equal(verdict.roiPercent, 100);
  assert.equal(verdict.evidenceState, 'OBSERVED');
});

await test('missing cost makes roi unavailable', async () => {
  const verdict = rev.roiVerdict({
    revenue: 200,
    cost: null,
  });
  assert.equal(verdict.roiPercent, null);
  assert.equal(verdict.evidenceState, 'UNAVAILABLE');
  assert.ok(
    verdict.statement.includes('never assumed zero'),
  );
});

await test('zero cost never yields infinite roi', async () => {
  const verdict = rev.roiVerdict({
    revenue: 200,
    cost: 0,
  });
  assert.equal(verdict.roiPercent, null);
  assert.ok(!verdict.statement.includes('nfinite'));
});

await test('missing revenue makes roi unavailable', async () => {
  const verdict = rev.roiVerdict({
    revenue: null,
    cost: 100,
  });
  assert.equal(verdict.roiPercent, null);
});

/* ---------- channels (3) ---------- */

await test('channels without evidence produce no row', async () => {
  assert.equal(
    rev.channelRow({ channel: 'AI SEARCH' }),
    null,
  );
});

await test('partial channels keep missing as unavailable', async () => {
  const row = rev.channelRow({
    channel: 'ORGANIC SEARCH',
    traffic: 1200,
    trafficState: 'VERIFIED',
  });
  assert.ok(row);
  assert.equal(row.leads, null);
  assert.equal(row.leadsState, 'UNAVAILABLE');
  assert.equal(row.revenueState, 'UNAVAILABLE');
});

await test('ai citation channel separates traffic truth', async () => {
  const row = rev.channelRow({
    channel: 'AI SEARCH',
    leads: null,
    revenue: null,
    traffic: null,
    note: 'Mentions observed; traffic unavailable.',
  });
  assert.equal(row, null);
});

/* ---------- ordering + honesty (7) ---------- */

await test('page rows order by amount descending', async () => {
  const rows = rev.orderByAmountDesc([
    { amount: 10 },
    { amount: 50 },
    { amount: 30 },
  ]);
  assert.deepEqual(
    rows.map((r) => r.amount),
    [50, 30, 10],
  );
});

await test('no fake conversion rate helper exists', async () => {
  assert.equal(
    typeof rev.conversionRate,
    'undefined',
  );
});

await test('no numeric confidence score exists', async () => {
  for (const key of [
    'confidence',
    'confidenceScore',
    'probability',
  ]) {
    assert.equal(typeof rev[key], 'undefined');
  }
});

await test('observed never equals verified helper', async () => {
  const direct = rev.attributionStatement(
    'DIRECT',
    'Revenue',
  );
  assert.ok(!direct.includes('VERIFIED'));
});

await test('cpc never presented as acquisition cost', async () => {
  const dump = JSON.stringify(
    rev.commercialRelevance({
      intent: 'COMMERCIAL',
      cpc: 3,
    }),
  );
  assert.ok(!dump.toLowerCase().includes('acquisition'));
});

await test('volume never presented as traffic', async () => {
  const text = rev
    .zeroClickStatement('INSUFFICIENT_EVIDENCE')
    .toLowerCase();
  assert.ok(!text.includes('volume'));
});

await test('deterministic outputs repeat', async () => {
  const a = rev.zeroClickState({
    impressions: 900,
    clicks: 90,
    aiCitations: 0,
    aiTraffic: 0,
    leads: 0,
    revenue: 0,
  });
  const b = rev.zeroClickState({
    impressions: 900,
    clicks: 90,
    aiCitations: 0,
    aiTraffic: 0,
    leads: 0,
    revenue: 0,
  });
  assert.equal(a, b);
  assert.equal(a, 'HIGH_TRAFFIC_LOW_LEAD');
});

await test('source matching is case-insensitive', async () => {
  assert.equal(
    rev.classifyLeadAttribution({
      source: 'organic',
      landingPage: null,
    }),
    'DIRECT',
  );
});

await test('revenue via connected lead stays connected', async () => {
  assert.equal(
    rev.classifyRevenueAttribution({
      leadId: 'l2',
      leadAttribution: 'CONNECTED',
    }),
    'CONNECTED',
  );
});

await test('funnel stages keep their window label', async () => {
  const stage = rev.funnelStage(
    'TRAFFIC',
    400,
    'GSC 28d window',
    'VERIFIED',
  );
  assert.equal(stage.window, 'GSC 28d window');
});

await test('inferred attribution disclosed as suggested', async () => {
  assert.ok(
    rev
      .attributionStatement('INFERRED', 'Lead')
      .includes('not directly observed'),
  );
});

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(
  `\n${results.length - failed.length}/${results.length} passed`,
);
if (failed.length > 0) process.exit(1);

/*
 * RENKOO Query Fan-Out + Topic Ownership 1.0 — tests
 * (Phase 12).
 *
 * 48 tests over pure functions only: fan-out
 * classification, intent mapping into the EXISTING
 * ResearchIntent taxonomy, observed-only derivation,
 * dedupe, deterministic ordering, coverage states,
 * Google/AI combinations, competitor evidence, gap
 * kinds (existing vocabulary), entity handling,
 * measurement language, no fake scores, no causal
 * claims. No DB, no provider calls, no billing touch.
 *
 * Run: npm run test:topic-intelligence   (dist built)
 */
import assert from 'node:assert/strict';

const topic = await import(
  '../dist/keywords/topic-intelligence.js'
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

/* ---------- classification (10) ---------- */

await test('pricing queries classify', async () => {
  assert.deepEqual(
    topic.classifyFanoutNeeds('crm pricing plans'),
    ['PRICING'],
  );
});

await test('comparison queries classify', async () => {
  const needs = topic.classifyFanoutNeeds(
    'hubspot vs salesforce',
  );
  assert.ok(needs.includes('COMPARE'));
});

await test('alternatives queries classify', async () => {
  const needs = topic.classifyFanoutNeeds(
    'salesforce alternatives for startups',
  );
  assert.ok(needs.includes('ALTERNATIVES'));
});

await test('how queries classify', async () => {
  const needs = topic.classifyFanoutNeeds(
    'how to migrate crm data',
  );
  assert.ok(needs.includes('HOW'));
});

await test('best queries classify', async () => {
  const needs = topic.classifyFanoutNeeds(
    'best crm for small business',
  );
  assert.ok(needs.includes('BEST'));
});

await test('reviews queries classify', async () => {
  const needs = topic.classifyFanoutNeeds(
    'hubspot reviews and ratings',
  );
  assert.ok(needs.includes('REVIEWS'));
});

await test('integration queries classify', async () => {
  const needs = topic.classifyFanoutNeeds(
    'crm email integration with gmail api',
  );
  assert.ok(needs.includes('INTEGRATION'));
});

await test('trust queries classify', async () => {
  const needs = topic.classifyFanoutNeeds(
    'is this crm secure and reliable',
  );
  assert.ok(needs.includes('TRUST'));
});

await test('transactional queries classify', async () => {
  const needs = topic.classifyFanoutNeeds(
    'buy crm subscription free trial',
  );
  assert.ok(needs.includes('TRANSACTIONAL'));
});

await test('generic queries fall back to discover', async () => {
  assert.deepEqual(
    topic.classifyFanoutNeeds('customer relationship management'),
    ['DISCOVER'],
  );
});

/* ---------- empty + normalization (4) ---------- */

await test('empty query yields no needs', async () => {
  assert.deepEqual(
    topic.classifyFanoutNeeds('   '),
    [],
  );
});

await test('normalization collapses whitespace', async () => {
  assert.equal(
    topic.normalizeTopicQuery('  Best   CRM  '),
    'best crm',
  );
});

await test('padding prevents substring false hits', async () => {
  const needs = topic.classifyFanoutNeeds('surprising facts');
  assert.ok(!needs.includes('PRICING'));
});

await test('multi-need queries carry all needs', async () => {
  const needs = topic.classifyFanoutNeeds(
    'best crm pricing reviews',
  );
  assert.ok(needs.includes('BEST'));
  assert.ok(needs.includes('PRICING'));
  assert.ok(needs.includes('REVIEWS'));
});

/* ---------- intent mapping (8) ---------- */

await test('compare maps to existing comparison intent', async () => {
  assert.equal(
    topic.mapFanoutToIntent('COMPARE'),
    'COMPARISON',
  );
});

await test('alternatives maps to existing intent', async () => {
  assert.equal(
    topic.mapFanoutToIntent('ALTERNATIVES'),
    'ALTERNATIVES',
  );
});

await test('problem maps to problem solution', async () => {
  assert.equal(
    topic.mapFanoutToIntent('PROBLEM'),
    'PROBLEM_SOLUTION',
  );
});

await test('pricing maps to commercial', async () => {
  assert.equal(
    topic.mapFanoutToIntent('PRICING'),
    'COMMERCIAL',
  );
});

await test('best maps to buyer research', async () => {
  assert.equal(
    topic.mapFanoutToIntent('BEST'),
    'BUYER_RESEARCH',
  );
});

await test('local maps to local', async () => {
  assert.equal(
    topic.mapFanoutToIntent('LOCAL'),
    'LOCAL',
  );
});

await test('transactional maps to transactional', async () => {
  assert.equal(
    topic.mapFanoutToIntent('TRANSACTIONAL'),
    'TRANSACTIONAL',
  );
});

await test('all needs map inside existing taxonomy', async () => {
  const allowed = new Set([
    'INFORMATIONAL',
    'COMMERCIAL',
    'TRANSACTIONAL',
    'NAVIGATIONAL',
    'LOCAL',
    'COMPARISON',
    'ALTERNATIVES',
    'PROBLEM_SOLUTION',
    'BUYER_RESEARCH',
  ]);
  for (const need of topic.FANOUT_NEEDS) {
    assert.ok(
      allowed.has(topic.mapFanoutToIntent(need)),
      `${need} escapes the existing taxonomy`,
    );
  }
});

/* ---------- derivation + dedupe (7) ---------- */

function observed() {
  return [
    { query: 'best crm', source: 'GSC' },
    { query: 'Best CRM', source: 'UNIVERSE' },
    { query: 'crm pricing', source: 'GSC' },
    { query: 'crm vs spreadsheets', source: 'SERP' },
    { query: 'how to migrate crm', source: 'PROMPT' },
  ];
}

await test('fan-out derives only observed needs', async () => {
  const groups = topic.deriveFanout(observed());
  const kinds = groups.map((g) => g.need);
  assert.ok(kinds.includes('BEST'));
  assert.ok(kinds.includes('PRICING'));
  assert.ok(kinds.includes('COMPARE'));
  assert.ok(!kinds.includes('LOCAL'));
  assert.ok(!kinds.includes('REVIEWS'));
});

await test('duplicates collapse case-insensitively', async () => {
  const deduped = topic.dedupeQueries(observed());
  assert.equal(
    deduped.filter(
      (row) => row.query.toLowerCase() === 'best crm',
    ).length,
    1,
  );
});

await test('empty observations yield no fan-out', async () => {
  assert.deepEqual(topic.deriveFanout([]), []);
});

await test('unobserved types never synthesized', async () => {
  const groups = topic.deriveFanout([
    { query: 'crm pricing', source: 'GSC' },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].need, 'PRICING');
});

await test('per-need caps bound composition', async () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({
    query: `best crm ${i} pricing`,
    source: 'GSC',
  }));
  const groups = topic.deriveFanout(rows, 10);
  for (const group of groups) {
    assert.ok(group.queries.length <= 10);
  }
});

await test('derivation orders deterministically', async () => {
  const a = topic.deriveFanout(observed());
  const b = topic.deriveFanout([...observed()].reverse());
  assert.deepEqual(a, b);
});

await test('groups carry mapped intent', async () => {
  const groups = topic.deriveFanout(observed());
  for (const group of groups) {
    assert.equal(
      group.intent,
      topic.mapFanoutToIntent(group.need),
    );
  }
});

/* ---------- coverage states (7) ---------- */

await test('no observed queries is insufficient', async () => {
  assert.equal(
    topic.coverageState({ covered: 0, total: 0 }),
    'INSUFFICIENT_EVIDENCE',
  );
});

await test('zero coverage without competitors is insufficient', async () => {
  assert.equal(
    topic.coverageState({ covered: 0, total: 8 }),
    'INSUFFICIENT_EVIDENCE',
  );
});

await test('broad coverage is strong', async () => {
  assert.equal(
    topic.coverageState({ covered: 7, total: 10 }),
    'STRONG_COVERAGE',
  );
});

await test('partial coverage is partial', async () => {
  assert.equal(
    topic.coverageState({ covered: 3, total: 10 }),
    'PARTIAL_COVERAGE',
  );
});

await test('competitor dominance is weak', async () => {
  assert.equal(
    topic.coverageState({
      covered: 4,
      total: 10,
      competitorCovered: 9,
    }),
    'WEAK_COVERAGE',
  );
});

await test('zero own coverage with rivals is weak', async () => {
  assert.equal(
    topic.coverageState({
      covered: 0,
      total: 6,
      competitorCovered: 4,
    }),
    'WEAK_COVERAGE',
  );
});

await test('statements never claim owned percentages', async () => {
  for (const state of [
    'STRONG_COVERAGE',
    'PARTIAL_COVERAGE',
    'WEAK_COVERAGE',
    'INSUFFICIENT_EVIDENCE',
  ]) {
    const text = topic.coverageStatement(state, 'crm');
    assert.ok(!text.includes('%'));
    assert.ok(!text.toLowerCase().includes('authority ='));
  }
});

/* ---------- google × ai (5) ---------- */

await test('both strong combines', async () => {
  assert.equal(
    topic.googleAiRelationship(
      'STRONG_COVERAGE',
      'STRONG_COVERAGE',
    ),
    'BOTH_STRONG',
  );
});

await test('google strong ai weak describes gap', async () => {
  assert.equal(
    topic.googleAiRelationship(
      'STRONG_COVERAGE',
      'WEAK_COVERAGE',
    ),
    'GOOGLE_STRONG',
  );
  assert.ok(
    topic
      .relationshipStatement('GOOGLE_STRONG')
      .includes('AI'),
  );
});

await test('ai presence with weak google describes', async () => {
  assert.equal(
    topic.googleAiRelationship(
      'WEAK_COVERAGE',
      'STRONG_COVERAGE',
    ),
    'AI_STRONG',
  );
});

await test('dual missing is insufficient', async () => {
  assert.equal(
    topic.googleAiRelationship(
      'INSUFFICIENT_EVIDENCE',
      'INSUFFICIENT_EVIDENCE',
    ),
    'INSUFFICIENT',
  );
});

await test('relationship language never causal', async () => {
  for (const rel of [
    'BOTH_STRONG',
    'GOOGLE_STRONG',
    'AI_STRONG',
    'BOTH_WEAK',
    'INSUFFICIENT',
  ]) {
    const text = topic
      .relationshipStatement(rel)
      .toLowerCase();
    assert.ok(!text.includes('because'));
    assert.ok(!text.includes('caused'));
  }
});

/* ---------- gaps (4) ---------- */

await test('no page means create gap', async () => {
  assert.equal(
    topic.topicGapKind({
      hasPage: false,
      pageRanks: false,
      competitorPresent: true,
    }),
    'CREATE',
  );
});

await test('weak page against rivals means improve', async () => {
  assert.equal(
    topic.topicGapKind({
      hasPage: true,
      pageRanks: false,
      competitorPresent: true,
    }),
    'IMPROVE',
  );
});

await test('cannibalization risk means consolidate', async () => {
  assert.equal(
    topic.topicGapKind({
      hasPage: true,
      pageRanks: true,
      competitorPresent: false,
      cannibalizationRisk: true,
    }),
    'CONSOLIDATE',
  );
});

await test('gap kinds stay in existing vocabulary', async () => {
  const allowed = new Set([
    'CREATE',
    'IMPROVE',
    'CONSOLIDATE',
    'OPTIMIZE',
    'MONITOR',
  ]);
  assert.ok(
    allowed.has(
      topic.topicGapKind({
        hasPage: true,
        pageRanks: true,
        competitorPresent: false,
      }),
    ),
  );
  assert.ok(
    topic
      .gapStatement('CREATE', 'crm pricing')
      .includes('content gap'),
  );
});

/* ---------- measurement + entity (3) ---------- */

await test('topic measurement never claims causality', async () => {
  const text = topic.topicMeasurement({
    dimension: 'GOOGLE',
    before: 3,
    after: 7,
    unit: 'queries covered',
  });
  assert.ok(text.includes('Observed'));
  assert.ok(text.includes('not proof'));
});

await test('missing measurement sides stay unknown', async () => {
  const text = topic.topicMeasurement({
    dimension: 'AI',
    before: null,
    after: 2,
    unit: 'citations',
  });
  assert.ok(text.includes('unknown'));
  assert.ok(!text.includes('0 to'));
});

await test('empty entity degrades to unavailable', async () => {
  assert.equal(
    topic.composeTopicEntity({
      businessName: '  ',
      products: [],
      services: 'not-a-list',
      primaryKeywords: [],
      targetAudience: null,
    }),
    null,
  );
  const entity = topic.composeTopicEntity({
    businessName: 'Acme',
    products: ['CRM'],
    services: [],
    primaryKeywords: ['crm'],
    targetAudience: 'startups',
  });
  assert.equal(entity.businessName, 'Acme');
  assert.deepEqual(entity.products, ['CRM']);
});

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(
  `\n${results.length - failed.length}/${results.length} passed`,
);
if (failed.length > 0) process.exit(1);

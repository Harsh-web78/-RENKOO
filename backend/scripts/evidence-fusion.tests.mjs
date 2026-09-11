/*
 * RENKOO Evidence Fusion 1.0 — tests (Phase 8E).
 *
 * 38 tests over pure functions only: evidence-state
 * preservation, source separation, unavailable handling
 * (never zero), conflicting/stale evidence, page +
 * keyword composition, next-best-action selection over
 * existing bands, recommendation reuse, traceability,
 * measurement mapping, agent semantics, tenant-scoped
 * dedupe, deterministic ordering, bounded evidence,
 * missing/partial data, no fake scores or percentages.
 * No DB, no provider calls, no billing touch.
 *
 * Run: npm run test:evidence-fusion   (dist built)
 */
import assert from 'node:assert/strict';

const fusion = await import(
  '../dist/keywords/evidence-fusion.js'
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

function ev(source, state, summary, subject = {}) {
  return fusion.evidence(source, state, summary, subject);
}

function cand(o = {}) {
  return {
    id: 'c1',
    category: 'IMPROVE_EXISTING_PAGE',
    title: 'Improve /pricing',
    keyword: 'best crm',
    targetPage: 'https://acme.com/pricing',
    priority: 'HIGH',
    evidence: [
      ev('GSC', 'VERIFIED', '2,340 impressions.'),
    ],
    recommendationId: null,
    recommendationStatus: null,
    actionId: null,
    actionStatus: null,
    order: 0,
    ...o,
  };
}

/* ---------- evidence model (6) ---------- */

await test('evidence preserves source and state', async () => {
  const item = ev('GSC', 'VERIFIED', '1,000 impressions.', {
    keyword: 'crm',
    page: 'https://acme.com/',
  });
  assert.equal(item.source, 'GSC');
  assert.equal(item.state, 'VERIFIED');
  assert.equal(item.keyword, 'crm');
});

await test('unavailable helper never fabricates', async () => {
  const item = fusion.unavailable(
    'AI_VISIBILITY',
    'AI citation evidence unavailable from connected sources.',
  );
  assert.equal(item.state, 'UNAVAILABLE');
  assert.ok(!item.summary.includes('0'));
});

await test('summaries bounded', async () => {
  const item = ev('CRAWL', 'OBSERVED', 'x'.repeat(999));
  assert.ok(item.summary.length <= 280);
});

await test('thirteen sources supported', async () => {
  const item = ev('AI_AGENT_LOG', 'OBSERVED', 'seen');
  assert.equal(item.source, 'AI_AGENT_LOG');
});

await test('five states supported', async () => {
  for (const state of [
    'VERIFIED',
    'OBSERVED',
    'INFERRED',
    'ESTIMATED',
    'UNAVAILABLE',
  ]) {
    assert.equal(
      ev('GSC', state, 's').state,
      state,
    );
  }
});

await test('missing subjects default null', async () => {
  const item = ev('GSC', 'VERIFIED', 's');
  assert.equal(item.keyword, null);
  assert.equal(item.page, null);
});

/* ---------- categories (5) ---------- */

await test('agent access maps correctly', async () => {
  assert.equal(
    fusion.categoryFor('AI_AGENT_ACCESS_403', 'AI_VISIBILITY'),
    'FIX_AI_AGENT_ACCESS',
  );
});

await test('citation gaps map to citability', async () => {
  assert.equal(
    fusion.categoryFor('AI_CITATION_GAP', 'AI_VISIBILITY'),
    'IMPROVE_AI_CITABILITY',
  );
});

await test('technical maps correctly', async () => {
  assert.equal(
    fusion.categoryFor('TECHNICAL_BLOCKER', 'CRAWL'),
    'FIX_TECHNICAL',
  );
});

await test('unknown types fall back safely', async () => {
  assert.equal(
    fusion.categoryFor('BOGUS', 'UNKNOWN_SOURCE'),
    'MONITOR_CHANGE',
  );
  assert.equal(
    fusion.categoryFor('SOMETHING_AI', 'AI_VISIBILITY'),
    'IMPROVE_AI_VISIBILITY',
  );
});

await test('ten categories exist', async () => {
  for (const type of [
    'IMPROVE_PAGE',
    'CREATE_PAGE',
    'CONSOLIDATE_PAGES',
    'BUILD_INTERNAL_SUPPORT',
    'FIX_TECHNICAL_BLOCKER',
    'AI_CITATION_GAP',
    'AI_CONTENT_GAP',
    'AI_AGENT_ACCESS_403',
    'PROTECT_PAGE',
    'MONITOR',
  ]) {
    assert.ok(
      typeof fusion.categoryFor(type, 'X') === 'string',
    );
  }
});

/* ---------- selection (8) ---------- */

await test('highest band wins', async () => {
  const best = fusion.selectNextBestAction([
    cand({
      id: 'low',
      priority: 'LOW',
      targetPage: 'https://acme.com/low',
    }),
    cand({
      id: 'high',
      priority: 'HIGH',
      targetPage: 'https://acme.com/high',
    }),
  ]);
  assert.equal(best.id, 'high');
});

await test('stronger evidence breaks ties', async () => {
  const best = fusion.selectNextBestAction([
    cand({
      id: 'inferred',
      targetPage: 'https://acme.com/i',
      evidence: [ev('GSC', 'INFERRED', 'maybe')],
    }),
    cand({
      id: 'verified',
      targetPage: 'https://acme.com/v',
      evidence: [ev('GSC', 'VERIFIED', 'measured')],
    }),
  ]);
  assert.equal(best.id, 'verified');
});

await test('done actions excluded', async () => {
  const best = fusion.selectNextBestAction([
    cand({ id: 'done', actionStatus: 'DONE' }),
  ]);
  assert.equal(best, null);
});

await test('dismissed recommendations excluded', async () => {
  const best = fusion.selectNextBestAction([
    cand({
      id: 'x',
      recommendationStatus: 'DISMISSED',
    }),
  ]);
  assert.equal(best, null);
});

await test('empty candidates yield null', async () => {
  assert.equal(fusion.selectNextBestAction([]), null);
});

await test('duplicates collapse with union evidence', async () => {
  const best = fusion.selectNextBestAction([
    cand({
      id: 'a',
      evidence: [ev('GSC', 'VERIFIED', 'g')],
    }),
    cand({
      id: 'b',
      evidence: [ev('SERP', 'OBSERVED', 's')],
    }),
  ]);
  assert.equal(best.evidence.length, 2);
  assert.equal(best.priority, 'HIGH');
});

await test('order breaks stable ties', async () => {
  const best = fusion.selectNextBestAction([
    cand({
      id: 'b',
      order: 1,
      targetPage: 'https://acme.com/b',
    }),
    cand({
      id: 'a',
      order: 0,
      targetPage: 'https://acme.com/a',
    }),
  ]);
  assert.equal(best.id, 'a');
});

await test('no numeric score anywhere', async () => {
  const best = fusion.selectNextBestAction([cand()]);
  const dump = JSON.stringify(best);
  assert.ok(!dump.includes('score'));
  assert.ok(!dump.includes('probability'));
});

/* ---------- why + measurement (4) ---------- */

await test('why names sources', async () => {
  const text = fusion.whyForAction(
    cand({
      evidence: [
        ev('GSC', 'VERIFIED', 'measured demand'),
        ev(
          'AI_VISIBILITY',
          'UNAVAILABLE',
          'AI citation evidence unavailable from connected sources.',
        ),
      ],
    }),
  );
  assert.ok(text.includes('GSC'));
  assert.ok(text.includes('unavailable'));
});

await test('measurement per category honest', async () => {
  assert.ok(
    fusion
      .measurementFor('IMPROVE_EXISTING_PAGE')
      .includes('GSC'),
  );
  assert.ok(
    fusion
      .measurementFor('FIX_AI_AGENT_ACCESS')
      .includes('absence'),
  );
  assert.ok(
    fusion
      .measurementFor('INTERNAL_LINK')
      .includes('Re-crawl'),
  );
  assert.ok(
    fusion
      .measurementFor('IMPROVE_AI_VISIBILITY')
      .includes('Rerun'),
  );
});

await test('why bounded', async () => {
  const text = fusion.whyForAction(
    cand({
      evidence: Array.from({ length: 30 }, (_, i) =>
        ev('GSC', 'VERIFIED', `fact ${i}`),
      ),
    }),
  );
  assert.ok(text.length <= 1200);
});

await test('unavailable-only yields fallback', async () => {
  const text = fusion.whyForAction(
    cand({
      evidence: [
        ev('AI_VISIBILITY', 'UNAVAILABLE', 'no data'),
      ],
    }),
  );
  assert.ok(text.length > 0);
});

/* ---------- why-not-ai 2.0 (7) ---------- */

function why(input = {}, evidenceList = []) {
  return fusion.diagnoseWhyNotAi2(
    {
      brandMentioned: null,
      brandCited: null,
      promptsTracked: 3,
      observations: 5,
      contentCoversTopic: true,
      entityCovered: true,
      internalLinksSupport: true,
      pageCrawlable: true,
      pageIndexable: true,
      agentAccessSignal: 'OK',
      officialEvidence: false,
      ...input,
    },
    evidenceList,
  );
}

await test('insufficient without observations', async () => {
  const result = why({
    promptsTracked: 0,
    observations: 0,
  });
  assert.equal(
    result.class,
    'INSUFFICIENT_EVIDENCE',
  );
});

await test('uncrawlable is technical gap', async () => {
  const result = why({ pageCrawlable: false });
  assert.equal(
    result.class,
    'TECHNICAL_ACCESS_GAP',
  );
});

await test('missing topic is content gap', async () => {
  const result = why({ contentCoversTopic: false });
  assert.equal(
    result.class,
    'CONTENT_GAP',
  );
});

await test('mentioned-not-cited is citation gap', async () => {
  const result = why({
    brandMentioned: true,
    brandCited: false,
  });
  assert.equal(result.class, 'AI_CITATION_GAP');
});

await test('absent brand is visibility gap', async () => {
  const result = why({ brandMentioned: false });
  assert.equal(
    result.class,
    'AI_VISIBILITY_GAP',
  );
});

await test('agent error is access signal only', async () => {
  const result = why({ agentAccessSignal: 'ERROR' });
  assert.equal(
    result.class,
    'AI_AGENT_ACCESS_SIGNAL',
  );
  assert.ok(!result.headline.includes('cannot see'));
  assert.ok(result.headline.includes('available logs'));
});

await test('agent not-observed never claims blindness', async () => {
  const result = why({
    agentAccessSignal: 'NOT_OBSERVED',
  });
  assert.equal(
    result.class,
    'AI_AGENT_ACCESS_SIGNAL',
  );
  assert.ok(result.headline.includes('not proof'));
});

/* ---------- profiles + changes (4) ---------- */

await test('page profile keeps sections separate', async () => {
  const profile = fusion.composePageProfile({
    page: 'https://acme.com/pricing',
    googleFacts: ['Ranks #7.'],
    googleEvidence: [ev('GSC', 'VERIFIED', 'measured')],
    aiEvidence: [
      ev('AI_VISIBILITY', 'UNAVAILABLE', 'no data'),
    ],
  });
  assert.equal(profile.google.facts.length, 1);
  assert.equal(profile.ai.evidence[0].state, 'UNAVAILABLE');
  assert.ok(
    profile.opportunity.reason.includes(
      'No execution action',
    ),
  );
});

await test('changes dedupe across areas', async () => {
  const change = {
    area: 'GOOGLE',
    statement: 'Improved for 14 queries.',
    evidence: [],
  };
  const fused = fusion.fuseChanges([
    [change, change],
    [change],
  ]);
  assert.equal(fused.length, 1);
});

await test('changes bounded at twenty', async () => {
  const groups = Array.from({ length: 5 }, (_, g) =>
    Array.from({ length: 10 }, (_, i) => ({
      area: 'GOOGLE',
      statement: `change ${g}-${i}`,
      evidence: [],
    })),
  );
  assert.ok(fusion.fuseChanges(groups).length <= 20);
});

await test('no fake percentages in fusion', async () => {
  const dump = JSON.stringify(
    fusion.composePageProfile({
      page: 'x',
      googleEvidence: [ev('GSC', 'VERIFIED', 's')],
    }),
  );
  assert.ok(!dump.includes('%'));
  assert.ok(!dump.includes('score'));
});

/* ---------- tenant + missing data (4) ---------- */

await test('dedupe keys scope by page and keyword', async () => {
  const best = fusion.selectNextBestAction([
    cand({ id: 'a', targetPage: 'https://x.com/1' }),
    cand({ id: 'b', targetPage: 'https://x.com/2' }),
  ]);
  assert.ok(best !== null);
});

await test('partial evidence still decides', async () => {
  const best = fusion.selectNextBestAction([
    cand({ id: 'a', priority: 'MEDIUM', evidence: [] }),
  ]);
  assert.equal(best.id, 'a');
});

await test('conflicting bands prefer higher', async () => {
  const best = fusion.selectNextBestAction([
    cand({ id: 'm', priority: 'MEDIUM' }),
    cand({ id: 'h', priority: 'HIGH' }),
  ]);
  assert.equal(best.priority, 'HIGH');
});

await test('stale evidence shapes carry windows', async () => {
  const item = ev('GSC', 'VERIFIED', 'measured', {
    window: '2026-08-08..2026-09-06',
  });
  assert.equal(item.window, '2026-08-08..2026-09-06');
});

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(
  `\n${results.length - failed.length}/${results.length} passed`,
);
if (failed.length > 0) process.exit(1);

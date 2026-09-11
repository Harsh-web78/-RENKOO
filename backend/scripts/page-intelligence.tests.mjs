/*
 * RENKOO Content + Entity + Authority 2.0 — tests (Phase 14).
 *
 * 60 tests over pure functions only: intent coverage,
 * topic gaps, content evidence honesty, entity presence
 * and consistency, citation-worthiness dimensions, AI
 * citation states, freshness and decay, internal
 * support, authority dimensions, diagnosis ordering,
 * page decisions, honesty invariants, tenant-neutral
 * determinism, bounded precedence. No DB, no provider
 * calls, no billing touch.
 *
 * Run: npm run test:page-intelligence   (dist built)
 */
import assert from 'node:assert/strict';

const page = await import(
  '../dist/content/page-intelligence.js'
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

/* ---------- intent coverage (6) ---------- */

await test('broad ranking is covered', async () => {
  const row = page.intentCoverageRow(
    'COMMERCIAL',
    10,
    7,
    true,
  );
  assert.equal(row.coverage, 'COVERED');
  assert.equal(row.evidenceState, 'OBSERVED');
});

await test('partial ranking is partial', async () => {
  assert.equal(
    page.intentCoverageRow('HOW', 10, 3, true).coverage,
    'PARTIAL',
  );
});

await test('no ranking with demand is missing', async () => {
  const row = page.intentCoverageRow(
    'COMPARISON',
    5,
    0,
    true,
  );
  assert.equal(row.coverage, 'MISSING');
});

await test('no demand is unavailable not missing', async () => {
  const row = page.intentCoverageRow(
    'TRANSACTIONAL',
    0,
    0,
    true,
  );
  assert.equal(row.coverage, 'UNAVAILABLE');
  assert.equal(row.evidenceState, 'UNAVAILABLE');
});

await test('no evidence source is unavailable', async () => {
  assert.equal(
    page.intentCoverageRow('WHAT', 6, 4, false).coverage,
    'UNAVAILABLE',
  );
});

await test('ranking clamps to observed', async () => {
  const row = page.intentCoverageRow(
    'WHY',
    3,
    9,
    true,
  );
  assert.equal(row.rankingQueries, 3);
  assert.equal(row.coverage, 'COVERED');
});

/* ---------- content evidence (6) ---------- */

await test('crawler facts pass through', async () => {
  const evidence = page.composeContentEvidence({
    url: 'https://acme.com/crm',
    title: 'CRM',
    h1: ['CRM'],
    h2: ['Pricing', 'Features'],
    wordCount: 1200,
    hasBody: true,
    indexable: true,
    statusCode: 200,
    lastCrawledAt: '2026-09-01T00:00:00.000Z',
  });
  assert.equal(evidence.wordCount, 1200);
  assert.equal(evidence.contentDepth, 'OBSERVED');
  assert.equal(evidence.indexability, 'OBSERVED');
});

await test('word count never estimated from headings', async () => {
  const evidence = page.composeContentEvidence({
    url: 'https://acme.com/crm',
    h1: ['A very long heading with many words'],
    h2: ['More', 'Headings', 'Here'],
    hasBody: false,
  });
  assert.equal(evidence.wordCount, null);
  assert.equal(evidence.contentDepth, 'UNAVAILABLE');
});

await test('missing word count is unavailable', async () => {
  const evidence = page.composeContentEvidence({
    url: 'https://acme.com/x',
  });
  assert.equal(evidence.contentDepth, 'UNAVAILABLE');
  assert.equal(evidence.title, null);
});

await test('null indexability is unavailable', async () => {
  const evidence = page.composeContentEvidence({
    url: 'https://acme.com/x',
    indexable: null,
  });
  assert.equal(evidence.indexability, 'UNAVAILABLE');
});

await test('heading lists bound and trim', async () => {
  const evidence = page.composeContentEvidence({
    url: 'https://acme.com/x',
    h1: 'not-a-list',
    h2: ['  ok  ', '', 'fine'],
  });
  assert.deepEqual(evidence.h1, []);
  assert.deepEqual(evidence.h2, ['ok', 'fine']);
});

await test('structured data absence stays null', async () => {
  const evidence = page.composeContentEvidence({
    url: 'https://acme.com/x',
  });
  assert.equal(evidence.structuredData, null);
});

/* ---------- gaps (4) ---------- */

await test('gaps carry action kinds', async () => {
  const gap = page.contentGap('MISSING_INTENT', {
    page: 'https://acme.com/crm',
    topic: 'crm',
    evidenceSources: ['GSC queries', 'strategy'],
    reason: 'Comparison demand with no ranking page.',
    existingActionKind: 'IMPROVE',
  });
  assert.equal(gap.gapKind, 'MISSING_INTENT');
  assert.equal(gap.existingActionKind, 'IMPROVE');
  assert.deepEqual(gap.evidenceSources, [
    'GSC queries',
    'strategy',
  ]);
});

await test('gap ordering follows precedence', async () => {
  const mk = (kind) =>
    page.contentGap(kind, {
      reason: 'r',
      existingActionKind: 'MONITOR',
    });
  const ordered = page.orderGapsByPrecedence([
    mk('FRESHNESS_GAP'),
    mk('INDEXABILITY_ISSUE'),
    mk('AI_CITATION_GAP'),
  ]);
  assert.deepEqual(
    ordered.map((g) => g.gapKind),
    [
      'INDEXABILITY_ISSUE',
      'AI_CITATION_GAP',
      'FRESHNESS_GAP',
    ],
  );
});

await test('gap kinds stay in vocabulary', async () => {
  const allowed = new Set([
    'MISSING_INTENT',
    'MISSING_TOPIC_SUPPORT',
    'WEAK_PAGE_COVERAGE',
    'COMPETITOR_COVERAGE',
    'AI_CITATION_GAP',
    'INTERNAL_SUPPORT_GAP',
    'FRESHNESS_GAP',
    'ENTITY_GAP',
    'INDEXABILITY_ISSUE',
  ]);
  for (const gap of [
    page.contentGap('ENTITY_GAP', {
      reason: 'r',
      existingActionKind: 'OPTIMIZE',
    }),
  ]) {
    assert.ok(allowed.has(gap.gapKind));
  }
});

await test('duplicate pages map to consolidate', async () => {
  const gap = page.contentGap('WEAK_PAGE_COVERAGE', {
    reason: 'Two pages target one intent.',
    existingActionKind: 'CONSOLIDATE',
  });
  assert.equal(gap.existingActionKind, 'CONSOLIDATE');
});

/* ---------- entity (7) ---------- */

await test('named entity is present', async () => {
  assert.equal(
    page.entitySignal({
      hasBrainRecord: true,
      namedInPage: true,
      topicallyRelated: true,
      hasObservedDemand: true,
    }),
    'ENTITY_PRESENT',
  );
});

await test('related but undemanded entity supports', async () => {
  assert.equal(
    page.entitySignal({
      hasBrainRecord: true,
      namedInPage: false,
      topicallyRelated: true,
      hasObservedDemand: false,
    }),
    'ENTITY_SUPPORTING',
  );
});

await test('demanded but absent entity is missing', async () => {
  assert.equal(
    page.entitySignal({
      hasBrainRecord: true,
      namedInPage: false,
      topicallyRelated: true,
      hasObservedDemand: true,
    }),
    'ENTITY_MISSING',
  );
});

await test('no brain record is unavailable', async () => {
  assert.equal(
    page.entitySignal({
      hasBrainRecord: false,
      namedInPage: false,
      topicallyRelated: false,
      hasObservedDemand: true,
    }),
    'ENTITY_UNAVAILABLE',
  );
});

await test('matching identity with mention is consistent', async () => {
  assert.equal(
    page.entityConsistency({
      brainName: 'Acme',
      siteIdentity: 'acme',
      pageMentionsBrain: true,
      hasStructuredData: false,
    }),
    'CONSISTENT',
  );
});

await test('name mismatch conflicts', async () => {
  assert.equal(
    page.entityConsistency({
      brainName: 'Acme',
      siteIdentity: 'Beta Corp',
      pageMentionsBrain: true,
      hasStructuredData: true,
    }),
    'CONFLICTING',
  );
});

await test('missing structured data is not failure', async () => {
  const state = page.entityConsistency({
    brainName: 'Acme',
    siteIdentity: 'acme',
    pageMentionsBrain: null,
    hasStructuredData: false,
  });
  assert.ok(state === 'PARTIAL' || state === 'UNAVAILABLE');
  assert.notEqual(state, 'CONFLICTING');
});

/* ---------- worthiness (7) ---------- */

function worthy(o = {}) {
  return page.citationWorthiness({
    hasObservedQueryIntent: true,
    hasAnswerSection: false,
    entityPresent: true,
    topicCovered: true,
    hasSupportingContent: true,
    hasAuthorOrSources: false,
    freshness: 'FRESH',
    inboundLinks: 6,
    ...o,
  });
}

await test('eight dimensions returned', async () => {
  assert.equal(worthy().length, 8);
});

await test('missing answer section is weak with reason', async () => {
  const row = worthy().find(
    (r) => r.dimension === 'DIRECT_ANSWER',
  );
  assert.equal(row.level, 'WEAK');
  assert.ok(row.reason.includes('no directly matching'));
});

await test('entity clarity follows page evidence', async () => {
  const row = worthy().find(
    (r) => r.dimension === 'ENTITY_CLARITY',
  );
  assert.equal(row.level, 'STRONG');
});

await test('no intent means unavailable answerability', async () => {
  const row = worthy({
    hasObservedQueryIntent: false,
  }).find((r) => r.dimension === 'ANSWERABILITY');
  assert.equal(row.level, 'UNAVAILABLE');
});

await test('null inputs stay unavailable', async () => {
  const rows = worthy({
    hasAnswerSection: null,
    entityPresent: null,
    topicCovered: null,
    hasSupportingContent: null,
    hasAuthorOrSources: null,
    freshness: 'UNKNOWN',
    inboundLinks: null,
  });
  for (const row of rows) {
    assert.equal(row.level, 'UNAVAILABLE');
  }
});

await test('inbound thresholds deterministic', async () => {
  const level = (n) =>
    worthy({ inboundLinks: n }).find(
      (r) => r.dimension === 'INTERNAL_SUPPORT',
    ).level;
  assert.equal(level(6), 'STRONG');
  assert.equal(level(2), 'PARTIAL');
  assert.equal(level(0), 'WEAK');
  assert.equal(level(null), 'UNAVAILABLE');
});

await test('no ai score language exists', async () => {
  const dump = JSON.stringify(worthy()).toLowerCase();
  assert.ok(!dump.includes('score'));
  assert.ok(!dump.includes('%'));
});

/* ---------- citation states (3) ---------- */

await test('observed citation reported', async () => {
  assert.equal(
    page.aiCitationState({
      hasAiObservations: true,
      renkooCited: true,
      competitorCited: true,
    }),
    'CITATION_OBSERVED',
  );
});

await test('rival citation without ours is gap', async () => {
  assert.equal(
    page.aiCitationState({
      hasAiObservations: true,
      renkooCited: false,
      competitorCited: true,
    }),
    'AI_CITATION_GAP',
  );
});

await test('no observation never means not cited', async () => {
  assert.equal(
    page.aiCitationState({
      hasAiObservations: false,
      renkooCited: false,
      competitorCited: false,
    }),
    'AI_EVIDENCE_UNAVAILABLE',
  );
  assert.equal(
    page.aiCitationState({
      hasAiObservations: true,
      renkooCited: false,
      competitorCited: false,
    }),
    'AI_EVIDENCE_UNAVAILABLE',
  );
});

/* ---------- freshness + decay (8) ---------- */

await test('recent crawl is fresh', async () => {
  const out = page.freshnessState(
    '2026-09-01T00:00:00.000Z',
    '2026-09-09T00:00:00.000Z',
  );
  assert.equal(out.state, 'FRESH');
  assert.equal(out.crawlAgeDays, 8);
});

await test('old crawl is stale', async () => {
  assert.equal(
    page.freshnessState(
      '2024-01-01T00:00:00.000Z',
      '2026-09-09T00:00:00.000Z',
    ).state,
    'STALE',
  );
});

await test('mid-age crawl is aging', async () => {
  assert.equal(
    page.freshnessState(
      '2026-04-01T00:00:00.000Z',
      '2026-09-09T00:00:00.000Z',
    ).state,
    'AGING',
  );
});

await test('missing timestamp is unknown', async () => {
  assert.deepEqual(
    page.freshnessState(null, '2026-09-09T00:00:00.000Z'),
    { state: 'UNKNOWN', crawlAgeDays: null },
  );
});

await test('thresholds are configurable', async () => {
  const out = page.freshnessState(
    '2026-08-01T00:00:00.000Z',
    '2026-09-09T00:00:00.000Z',
    { freshDays: 60, staleDays: 120 },
  );
  assert.equal(out.state, 'FRESH');
});

await test('rank decline with stale is co-occurrence', async () => {
  const diagnosis = page.decayDiagnosis({
    rankDeclined: true,
    trafficDeclined: true,
    freshness: 'STALE',
    aiDeclined: false,
  });
  assert.equal(
    diagnosis,
    'RANK_DECLINE_WITH_STALE_CONTENT',
  );
  const text = page.decayStatement(diagnosis);
  assert.ok(text.includes('alongside'));
  assert.ok(!/caused by/i.test(text));
});

await test('stable rank with traffic drop diagnosed', async () => {
  assert.equal(
    page.decayDiagnosis({
      rankDeclined: false,
      trafficDeclined: true,
      freshness: 'FRESH',
      aiDeclined: false,
    }),
    'TRAFFIC_DECLINE_WITH_STABLE_RANK',
  );
});

await test('no history is insufficient data', async () => {
  assert.equal(
    page.decayDiagnosis({
      rankDeclined: null,
      trafficDeclined: null,
      freshness: 'UNKNOWN',
      aiDeclined: null,
    }),
    'INSUFFICIENT_DATA',
  );
});

/* ---------- internal + authority (6) ---------- */

await test('strong inbound is supported', async () => {
  assert.equal(
    page.internalSupportState({
      graphAvailable: true,
      inboundLinks: 8,
      orphanFlag: false,
    }),
    'SUPPORTED',
  );
});

await test('orphan flag is risk', async () => {
  assert.equal(
    page.internalSupportState({
      graphAvailable: true,
      inboundLinks: 4,
      orphanFlag: true,
    }),
    'ORPHAN_RISK',
  );
});

await test('thin support detected', async () => {
  assert.equal(
    page.internalSupportState({
      graphAvailable: true,
      inboundLinks: 1,
      orphanFlag: false,
    }),
    'THIN',
  );
});

await test('missing graph is unavailable', async () => {
  assert.equal(
    page.internalSupportState({
      graphAvailable: false,
      inboundLinks: 5,
      orphanFlag: false,
    }),
    'UNAVAILABLE',
  );
});

await test('authority rows carry no scores', async () => {
  const row = page.authorityRow(
    'EXTERNAL_AUTHORITY',
    'UNAVAILABLE',
    'No verified backlink data connected.',
    'UNAVAILABLE',
  );
  assert.equal(row.level, 'UNAVAILABLE');
  assert.ok(!('score' in row));
  assert.ok(!JSON.stringify(row).includes('%'));
});

await test('competitor claim language is bounded', async () => {
  const text = page
    .weaknessStatement(
      'COMPETITOR_SERP_COVERAGE',
      'Rival X ranks #4 for observed commercial intent.',
    )
    .toLowerCase();
  assert.ok(!text.includes('better content'));
});

/* ---------- diagnosis + decisions (8) ---------- */

await test('blocker leads precedence', async () => {
  const reasons = page.diagnoseWeaknesses({
    indexBlocked: true,
    missingIntents: ['COMPARISON'],
    missingTopicSupport: true,
    weakMapping: true,
    competitorCovers: true,
    aiCitationGap: true,
    entityInconsistent: true,
    freshnessDecay: true,
    internalGap: true,
  });
  assert.equal(reasons[0], 'INDEXABILITY_BLOCKER');
  assert.equal(reasons.length, 9);
});

await test('empty evidence is insufficient', async () => {
  assert.deepEqual(
    page.diagnoseWeaknesses({
      indexBlocked: false,
      missingIntents: [],
      missingTopicSupport: false,
      weakMapping: false,
      competitorCovers: false,
      aiCitationGap: false,
      entityInconsistent: false,
      freshnessDecay: false,
      internalGap: false,
    }),
    ['INSUFFICIENT_EVIDENCE'],
  );
});

await test('ordering deterministic regardless of input', async () => {
  const a = page.diagnoseWeaknesses({
    indexBlocked: false,
    missingIntents: ['X'],
    missingTopicSupport: false,
    weakMapping: true,
    competitorCovers: false,
    aiCitationGap: true,
    entityInconsistent: false,
    freshnessDecay: false,
    internalGap: false,
  });
  assert.deepEqual(a, [
    'MISSING_INTENT',
    'WEAK_MAPPING',
    'AI_CITATION_GAP',
  ]);
});

await test('missing page decides create', async () => {
  assert.deepEqual(
    page.pageDecision(['MISSING_TOPIC_SUPPORT'], false),
    {
      decision: 'CREATE',
      reason:
        'No relevant page observed for evidenced demand.',
    },
  );
});

await test('blocker decides optimize', async () => {
  assert.equal(
    page.pageDecision(['INDEXABILITY_BLOCKER'], true)
      .decision,
    'OPTIMIZE',
  );
});

await test('weak mapping decides improve', async () => {
  assert.equal(
    page.pageDecision(['WEAK_MAPPING'], true).decision,
    'IMPROVE',
  );
});

await test('no evidence decides ignore', async () => {
  assert.equal(
    page.pageDecision(
      ['INSUFFICIENT_EVIDENCE'],
      true,
    ).decision,
    'IGNORE',
  );
});

await test('decisions stay in existing vocabulary', async () => {
  const allowed = new Set([
    'IMPROVE',
    'OPTIMIZE',
    'CREATE',
    'CONSOLIDATE',
    'PROTECT',
    'IGNORE',
  ]);
  for (const lead of [
    'MISSING_INTENT',
    'COMPETITOR_SERP_COVERAGE',
    'AI_CITATION_GAP',
    'FRESHNESS_DECAY',
    'INTERNAL_SUPPORT_GAP',
  ]) {
    assert.ok(
      allowed.has(
        page.pageDecision([lead], true).decision,
      ),
    );
  }
});

/* ---------- honesty invariants (5) ---------- */

await test('unavailable never zero in evidence', async () => {
  const evidence = page.composeContentEvidence({
    url: 'https://acme.com/x',
  });
  assert.notEqual(evidence.wordCount, 0);
});

await test('correlation never causation in decay', async () => {
  for (const d of [
    'RANK_DECLINE_WITH_STALE_CONTENT',
    'TRAFFIC_DECLINE_WITH_STABLE_RANK',
    'AI_VISIBILITY_DECLINE',
    'NO_DECAY_EVIDENCE',
    'INSUFFICIENT_DATA',
  ]) {
    assert.ok(
      !/caused by|causes|because of/i.test(
        page.decayStatement(d),
      ),
    );
  }
});

await test('citation never traffic claim', async () => {
  assert.equal(
    page.aiCitationState({
      hasAiObservations: true,
      renkooCited: true,
      competitorCited: false,
    }),
    'CITATION_OBSERVED',
  );
});

await test('precedence list covers all reasons', async () => {
  assert.equal(page.WEAKNESS_PRECEDENCE.length, 10);
});

await test('freshness defaults documented', async () => {
  assert.equal(
    page.DEFAULT_FRESHNESS_THRESHOLDS.freshDays,
    90,
  );
  assert.equal(
    page.DEFAULT_FRESHNESS_THRESHOLDS.staleDays,
    365,
  );
});

/* ---------- topic coverage (6) ---------- */

await test('topic ranking is covered', async () => {
  const row = page.topicCoverageRow('crm', 8, 6, true);
  assert.equal(row.topic, 'crm');
  assert.equal(row.coverage, 'COVERED');
  assert.equal(row.evidenceState, 'OBSERVED');
});

await test('topic partial ranking is partial', async () => {
  assert.equal(
    page.topicCoverageRow('crm', 8, 2, true).coverage,
    'PARTIAL',
  );
});

await test('topic demand without rank is missing', async () => {
  const row = page.topicCoverageRow('crm', 4, 0, true);
  assert.equal(row.coverage, 'MISSING');
  assert.equal(row.evidenceState, 'OBSERVED');
});

await test('topic without demand is unavailable', async () => {
  const row = page.topicCoverageRow('crm', 0, 0, true);
  assert.equal(row.coverage, 'UNAVAILABLE');
  assert.equal(row.evidenceState, 'UNAVAILABLE');
});

await test('topic without source is unavailable', async () => {
  assert.equal(
    page.topicCoverageRow('crm', 5, 5, false).coverage,
    'UNAVAILABLE',
  );
});

await test('topic ranking clamps to observed', async () => {
  const row = page.topicCoverageRow('crm', 2, 7, true);
  assert.equal(row.rankingQueries, 2);
  assert.equal(row.coverage, 'COVERED');
});

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(
  `\n${results.length - failed.length}/${results.length} passed`,
);
if (failed.length > 0) process.exit(1);

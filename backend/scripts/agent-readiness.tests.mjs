/*
 * RENKOO Agent Readiness 1.0 — tests (Phase 15).
 *
 * 72 tests over pure functions only: discoverability,
 * access, content extractability, entity, offering,
 * structured data, consistency, internal support, agent
 * logs + family mapping + SEARCH_ENGINE distinction,
 * actionability, commerce signals, freshness, citation
 * bridge (no causality), deterministic diagnosis +
 * NBA mapping, honesty invariants. No DB, no provider
 * calls, no billing touch.
 *
 * Run: npm run test:agent-readiness   (dist built)
 */
import assert from 'node:assert/strict';

const ar = await import('../dist/content/agent-readiness.js');

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

/* ---------- DISCOVERY (8) ---------- */

await test('discovery strong with crawl + inbound links', async () => {
  assert.equal(
    ar.discoverabilityState({
      hasCrawlPage: true,
      inboundLinks: 5,
      isOrphan: false,
      inSitemap: true,
      indexable: true,
    }),
    'STRONG',
  );
});

await test('discovery partial with single inbound', async () => {
  assert.equal(
    ar.discoverabilityState({
      hasCrawlPage: true,
      inboundLinks: 1,
      isOrphan: false,
      inSitemap: null,
      indexable: true,
    }),
    'PARTIAL',
  );
});

await test('discovery weak when orphan', async () => {
  assert.equal(
    ar.discoverabilityState({
      hasCrawlPage: true,
      inboundLinks: 4,
      isOrphan: true,
      inSitemap: true,
      indexable: true,
    }),
    'WEAK',
  );
});

await test('discovery weak with zero inbound', async () => {
  assert.equal(
    ar.discoverabilityState({
      hasCrawlPage: true,
      inboundLinks: 0,
      isOrphan: false,
      inSitemap: null,
      indexable: true,
    }),
    'WEAK',
  );
});

await test('discovery weak when noindex', async () => {
  assert.equal(
    ar.discoverabilityState({
      hasCrawlPage: true,
      inboundLinks: 6,
      isOrphan: false,
      inSitemap: true,
      indexable: false,
    }),
    'WEAK',
  );
});

await test('discovery unavailable without crawl', async () => {
  assert.equal(
    ar.discoverabilityState({
      hasCrawlPage: false,
      inboundLinks: null,
      isOrphan: null,
      inSitemap: null,
      indexable: null,
    }),
    'UNAVAILABLE',
  );
});

await test('discovery partial without graph evidence', async () => {
  assert.equal(
    ar.discoverabilityState({
      hasCrawlPage: true,
      inboundLinks: null,
      isOrphan: null,
      inSitemap: null,
      indexable: true,
    }),
    'PARTIAL',
  );
});

await test('discovery evidence unavailable without crawl', async () => {
  assert.equal(
    ar.discoverabilityEvidence({
      hasCrawlPage: false,
      inboundLinks: null,
      isOrphan: null,
      inSitemap: null,
      indexable: null,
    }),
    'UNAVAILABLE',
  );
});

/* ---------- ACCESS (6) ---------- */

await test('access accessible on 2xx indexable', async () => {
  assert.equal(
    ar.crawlAccessState({
      statusCode: 200,
      indexable: true,
      crawlFailed: false,
      hasCrawlPage: true,
    }),
    'ACCESSIBLE',
  );
});

await test('access partial on redirect', async () => {
  assert.equal(
    ar.crawlAccessState({
      statusCode: 301,
      indexable: null,
      crawlFailed: false,
      hasCrawlPage: true,
    }),
    'PARTIAL',
  );
});

await test('access blocked on 4xx', async () => {
  assert.equal(
    ar.crawlAccessState({
      statusCode: 404,
      indexable: null,
      crawlFailed: false,
      hasCrawlPage: true,
    }),
    'BLOCKED',
  );
});

await test('access blocked on 5xx', async () => {
  assert.equal(
    ar.crawlAccessState({
      statusCode: 503,
      indexable: null,
      crawlFailed: false,
      hasCrawlPage: true,
    }),
    'BLOCKED',
  );
});

await test('access unavailable without evidence', async () => {
  assert.equal(
    ar.crawlAccessState({
      statusCode: null,
      indexable: null,
      crawlFailed: false,
      hasCrawlPage: false,
    }),
    'UNAVAILABLE',
  );
});

await test('access partial when noindex on 200', async () => {
  assert.equal(
    ar.crawlAccessState({
      statusCode: 200,
      indexable: false,
      crawlFailed: false,
      hasCrawlPage: true,
    }),
    'PARTIAL',
  );
});

/* ---------- CONTENT (5) ---------- */

await test('content strong with title+h1+headings', async () => {
  assert.equal(
    ar.contentExtractability({
      title: 'Plumbing Services',
      h1Count: 1,
      h2Count: 3,
      hasBody: true,
      bodyAvailable: true,
      hasCrawlPage: true,
    }),
    'STRONG',
  );
});

await test('content partial with title only', async () => {
  assert.equal(
    ar.contentExtractability({
      title: 'Plumbing Services',
      h1Count: 0,
      h2Count: 0,
      hasBody: false,
      bodyAvailable: true,
      hasCrawlPage: true,
    }),
    'PARTIAL',
  );
});

await test('content unavailable without body extraction', async () => {
  assert.equal(
    ar.contentExtractability({
      title: 'Plumbing Services',
      h1Count: 1,
      h2Count: 2,
      hasBody: null,
      bodyAvailable: false,
      hasCrawlPage: true,
    }),
    'UNAVAILABLE',
  );
});

await test('content unavailable without crawl', async () => {
  assert.equal(
    ar.contentExtractability({
      title: null,
      h1Count: 0,
      h2Count: 0,
      hasBody: null,
      bodyAvailable: false,
      hasCrawlPage: false,
    }),
    'UNAVAILABLE',
  );
});

await test('missing body extraction is not weak content', async () => {
  const state = ar.contentExtractability({
    title: null,
    h1Count: 0,
    h2Count: 0,
    hasBody: null,
    bodyAvailable: false,
    hasCrawlPage: true,
  });
  assert.notEqual(state, 'WEAK');
  assert.equal(state, 'UNAVAILABLE');
});

/* ---------- ENTITY (5) ---------- */

await test('entity clear with rich signals', async () => {
  assert.equal(
    ar.entityClarity({
      businessName: 'ABC Software',
      hasBusinessType: true,
      offeringCount: 3,
      hasAudience: true,
      hasLocation: true,
      hasContactSignal: false,
      conflictingSignals: false,
      hasBrain: true,
    }),
    'CLEAR',
  );
});

await test('entity partial with name only', async () => {
  assert.equal(
    ar.entityClarity({
      businessName: 'ABC Software',
      hasBusinessType: false,
      offeringCount: 0,
      hasAudience: false,
      hasLocation: false,
      hasContactSignal: false,
      conflictingSignals: false,
      hasBrain: true,
    }),
    'PARTIAL',
  );
});

await test('entity conflicting on contradiction', async () => {
  assert.equal(
    ar.entityClarity({
      businessName: 'ABC Software',
      hasBusinessType: true,
      offeringCount: 2,
      hasAudience: true,
      hasLocation: true,
      hasContactSignal: true,
      conflictingSignals: true,
      hasBrain: true,
    }),
    'CONFLICTING',
  );
});

await test('entity unavailable without brain or name', async () => {
  assert.equal(
    ar.entityClarity({
      businessName: null,
      hasBusinessType: false,
      offeringCount: 0,
      hasAudience: false,
      hasLocation: false,
      hasContactSignal: false,
      conflictingSignals: false,
      hasBrain: false,
    }),
    'UNAVAILABLE',
  );
});

await test('missing fields are not contradictions', async () => {
  assert.notEqual(
    ar.entityClarity({
      businessName: 'ABC Software',
      hasBusinessType: false,
      offeringCount: 0,
      hasAudience: false,
      hasLocation: false,
      hasContactSignal: false,
      conflictingSignals: false,
      hasBrain: true,
    }),
    'CONFLICTING',
  );
});

/* ---------- OFFERING (4) ---------- */

await test('offering clear when mapped to page', async () => {
  assert.equal(
    ar.offeringClarity({
      hasBrain: true,
      offeringMapped: true,
      offeringHasTopic: true,
      offeringHasPage: true,
      observedDemand: true,
    }),
    'CLEAR',
  );
});

await test('offering partial when mapped without page', async () => {
  assert.equal(
    ar.offeringClarity({
      hasBrain: true,
      offeringMapped: true,
      offeringHasTopic: false,
      offeringHasPage: false,
      observedDemand: false,
    }),
    'PARTIAL',
  );
});

await test('offering missing requires observed demand', async () => {
  assert.equal(
    ar.offeringClarity({
      hasBrain: true,
      offeringMapped: false,
      offeringHasTopic: false,
      offeringHasPage: false,
      observedDemand: true,
    }),
    'MISSING',
  );
});

await test('offering unavailable without demand or brain', async () => {
  assert.equal(
    ar.offeringClarity({
      hasBrain: true,
      offeringMapped: false,
      offeringHasTopic: false,
      offeringHasPage: false,
      observedDemand: false,
    }),
    'UNAVAILABLE',
  );
  assert.equal(
    ar.offeringClarity({
      hasBrain: false,
      offeringMapped: false,
      offeringHasTopic: false,
      offeringHasPage: false,
      observedDemand: true,
    }),
    'UNAVAILABLE',
  );
});

/* ---------- STRUCTURED DATA (5) ---------- */

await test('structured valid when parseable', async () => {
  assert.equal(
    ar.structuredDataState({
      count: 2,
      parseable: true,
      hasMismatch: false,
      hasCrawlPage: true,
      pageContextSupportsSchema: true,
    }),
    'VALID',
  );
});

await test('structured partial when unparseable', async () => {
  assert.equal(
    ar.structuredDataState({
      count: 1,
      parseable: false,
      hasMismatch: false,
      hasCrawlPage: true,
      pageContextSupportsSchema: true,
    }),
    'PARTIAL',
  );
});

await test('structured conflicting on mismatch', async () => {
  assert.equal(
    ar.structuredDataState({
      count: 1,
      parseable: true,
      hasMismatch: true,
      hasCrawlPage: true,
      pageContextSupportsSchema: true,
    }),
    'CONFLICTING',
  );
});

await test('missing schema only where context supports it', async () => {
  assert.equal(
    ar.structuredDataState({
      count: 0,
      parseable: false,
      hasMismatch: false,
      hasCrawlPage: true,
      pageContextSupportsSchema: true,
    }),
    'MISSING',
  );
  assert.equal(
    ar.structuredDataState({
      count: 0,
      parseable: false,
      hasMismatch: false,
      hasCrawlPage: true,
      pageContextSupportsSchema: false,
    }),
    'UNAVAILABLE',
  );
});

await test('structured unavailable without crawl', async () => {
  assert.equal(
    ar.structuredDataState({
      count: null,
      parseable: false,
      hasMismatch: false,
      hasCrawlPage: false,
      pageContextSupportsSchema: true,
    }),
    'UNAVAILABLE',
  );
});

/* ---------- CONSISTENCY (3) ---------- */

await test('consistency clear on matching names', async () => {
  assert.equal(
    ar.entityConsistency('ABC Software', 'ABC Software', 'ABC Software'),
    'CLEAR',
  );
});

await test('consistency conflicting on mismatch', async () => {
  assert.equal(
    ar.entityConsistency('ABC Software', 'ABC Software', 'XYZ Software'),
    'CONFLICTING',
  );
});

await test('single source is partial not conflicting', async () => {
  assert.equal(
    ar.entityConsistency('ABC Software', null, null),
    'PARTIAL',
  );
  assert.equal(ar.entityConsistency(null, null, null), 'UNAVAILABLE');
});

/* ---------- INTERNAL SUPPORT (4) ---------- */

await test('internal strong with many inbound', async () => {
  assert.equal(
    ar.internalSupportState({
      inboundLinks: 6,
      isOrphan: false,
      anchorCount: 4,
      graphAvailable: true,
    }),
    'STRONG',
  );
});

await test('internal weak when orphan', async () => {
  assert.equal(
    ar.internalSupportState({
      inboundLinks: 3,
      isOrphan: true,
      anchorCount: 2,
      graphAvailable: true,
    }),
    'WEAK',
  );
});

await test('internal weak with zero inbound', async () => {
  assert.equal(
    ar.internalSupportState({
      inboundLinks: 0,
      isOrphan: false,
      anchorCount: 0,
      graphAvailable: true,
    }),
    'WEAK',
  );
});

await test('internal unavailable without graph', async () => {
  assert.equal(
    ar.internalSupportState({
      inboundLinks: null,
      isOrphan: null,
      anchorCount: 0,
      graphAvailable: false,
    }),
    'UNAVAILABLE',
  );
});

/* ---------- AGENT LOGS + FAMILY (7) ---------- */

await test('agent visited when visits observed', async () => {
  assert.equal(
    ar.agentActivityState({ logAvailable: true, aiAgentVisits: 3 }),
    'AI_AGENT_VISITED',
  );
});

await test('agent not observed with logs but no visits', async () => {
  assert.equal(
    ar.agentActivityState({ logAvailable: true, aiAgentVisits: 0 }),
    'AI_AGENT_NOT_OBSERVED',
  );
});

await test('agent unknown without log data', async () => {
  assert.equal(
    ar.agentActivityState({ logAvailable: false, aiAgentVisits: 0 }),
    'UNKNOWN',
  );
});

await test('ai assistant is an ai agent category', async () => {
  assert.equal(ar.isAiAgentCategory('AI_ASSISTANT'), true);
  assert.equal(ar.isAiAgentCategory('AI_SEARCH_CRAWLER'), true);
  assert.equal(ar.isAiAgentCategory('AI_TRAINING'), true);
});

await test('search engine is not an ai agent', async () => {
  assert.equal(ar.isAiAgentCategory('SEARCH_ENGINE'), false);
  assert.equal(ar.isSearchEngineNotAgent('SEARCH_ENGINE'), true);
  assert.equal(ar.isSearchEngineNotAgent('AI_ASSISTANT'), false);
});

await test('googlebot/bingbot taxonomy is search engine', async () => {
  assert.equal(ar.isSearchEngineNotAgent('SEARCH_ENGINE'), true);
  assert.equal(ar.isAiAgentCategory('SEARCH_ENGINE'), false);
});

await test('not observed note denies blocking claim', async () => {
  assert.match(ar.AGENT_NOT_OBSERVED_NOTE, /not proof/i);
  assert.match(ar.NO_LOG_NOTE, /unknown, not zero/i);
});

/* ---------- ACTIONABILITY (4) ---------- */

await test('actionability information available when action observed', async () => {
  assert.equal(
    ar.actionabilityState({
      observedActions: ['contact'],
      executionSupported: null,
      hasCrawlPage: true,
    }),
    'INFORMATION_AVAILABLE',
  );
});

await test('actionability unknown without observed action', async () => {
  assert.equal(
    ar.actionabilityState({
      observedActions: [],
      executionSupported: null,
      hasCrawlPage: true,
    }),
    'UNKNOWN',
  );
});

await test('execution capability is never claimed', async () => {
  const state = ar.actionabilityState({
    observedActions: ['purchase', 'pricing'],
    executionSupported: true,
    hasCrawlPage: true,
  });
  assert.equal(state, 'INFORMATION_AVAILABLE');
  assert.match(ar.executionCapabilityNote(), /unavailable/i);
});

await test('actionability unknown without crawl', async () => {
  assert.equal(
    ar.actionabilityState({
      observedActions: [],
      executionSupported: null,
      hasCrawlPage: false,
    }),
    'UNKNOWN',
  );
});

/* ---------- COMMERCE (3) ---------- */

await test('commerce ready signal with rich clarity', async () => {
  assert.equal(
    ar.commerceSignal({
      offeringClear: true,
      pricingClear: true,
      availabilityClear: true,
      contactClear: true,
      structuredProduct: true,
      hasEvidence: true,
    }),
    'READY_SIGNAL',
  );
});

await test('commerce partial with single signal', async () => {
  assert.equal(
    ar.commerceSignal({
      offeringClear: true,
      pricingClear: false,
      availabilityClear: false,
      contactClear: false,
      structuredProduct: false,
      hasEvidence: true,
    }),
    'PARTIAL_SIGNAL',
  );
});

await test('commerce unavailable without evidence', async () => {
  assert.equal(
    ar.commerceSignal({
      offeringClear: true,
      pricingClear: true,
      availabilityClear: true,
      contactClear: true,
      structuredProduct: true,
      hasEvidence: false,
    }),
    'UNAVAILABLE',
  );
});

/* ---------- FRESHNESS (4) ---------- */

await test('freshness fresh within window', async () => {
  assert.equal(ar.freshnessFromCrawlAge(5), 'FRESH');
});

await test('freshness aging in middle window', async () => {
  assert.equal(ar.freshnessFromCrawlAge(60), 'AGING');
});

await test('freshness stale beyond window', async () => {
  assert.equal(ar.freshnessFromCrawlAge(200), 'STALE');
});

await test('freshness unknown without crawl age', async () => {
  assert.equal(ar.freshnessFromCrawlAge(null), 'UNKNOWN');
  assert.match(ar.CRAWL_AGE_NOTE, /not verified content age/i);
});

/* ---------- CITATION BRIDGE (4) ---------- */

await test('citation + visit notes coexistence not causality', async () => {
  const note = ar.citationBridgeNote('CITED', 'AI_AGENT_VISITED');
  assert.match(note, /no causal link/i);
});

await test('citation alone denies visit implication', async () => {
  const note = ar.citationBridgeNote('CITED', 'AI_AGENT_NOT_OBSERVED');
  assert.match(note, /not/i);
});

await test('citation unavailable stays unavailable', async () => {
  assert.match(
    ar.citationBridgeNote('UNAVAILABLE', 'UNKNOWN'),
    /no ai citation observation is available/i,
  );
});

await test('no citation observed honestly stated', async () => {
  assert.match(
    ar.citationBridgeNote('NOT_MENTIONED', 'UNKNOWN'),
    /no ai citation has been observed/i,
  );
});

/* ---------- DIAGNOSIS + NBA (6) ---------- */

await test('diagnosis deterministic precedence', async () => {
  const input = {
    discoverability: 'WEAK',
    access: 'BLOCKED',
    content: 'WEAK',
    entity: 'CONFLICTING',
    offering: 'MISSING',
    evidenceSupport: 'WEAK',
    structured: 'CONFLICTING',
    internalSupport: 'WEAK',
    freshness: 'STALE',
    actionability: 'UNKNOWN',
    agentActivity: 'UNKNOWN',
    logAvailable: false,
  };
  const a = ar.diagnoseAgentReadiness(input);
  const b = ar.diagnoseAgentReadiness(input);
  assert.deepEqual(
    a.map((r) => r.reason),
    b.map((r) => r.reason),
  );
  assert.equal(a[0].reason, 'DISCOVERY_GAP');
  assert.equal(a[a.length - 1].reason, 'AGENT_EVIDENCE_UNAVAILABLE');
});

await test('diagnosis carries evidence state', async () => {
  const out = ar.diagnoseAgentReadiness({
    discoverability: 'STRONG',
    access: 'ACCESSIBLE',
    content: 'STRONG',
    entity: 'CLEAR',
    offering: 'CLEAR',
    evidenceSupport: 'STRONG',
    structured: 'VALID',
    internalSupport: 'STRONG',
    freshness: 'FRESH',
    actionability: 'INFORMATION_AVAILABLE',
    agentActivity: 'AI_AGENT_VISITED',
    logAvailable: true,
  });
  assert.equal(out.length, 0);
});

await test('access gap maps to fix agent access', async () => {
  assert.equal(ar.mapReasonToNba('ACCESS_GAP'), 'FIX_AI_AGENT_ACCESS');
});

await test('internal gap maps to internal link', async () => {
  assert.equal(ar.mapReasonToNba('INTERNAL_SUPPORT_GAP'), 'INTERNAL_LINK');
});

await test('offering gap maps to create content', async () => {
  assert.equal(ar.mapReasonToNba('OFFERING_GAP'), 'CREATE_CONTENT');
});

await test('unknown agent evidence maps to monitor', async () => {
  assert.equal(
    ar.mapReasonToNba('AGENT_EVIDENCE_UNAVAILABLE'),
    'MONITOR_CHANGE',
  );
});

/* ---------- HONESTY (4) ---------- */

await test('no numeric score exported', async () => {
  assert.equal(typeof ar.diagnoseAgentReadiness, 'function');
  assert.equal('agentReadinessScore' in ar, false);
  assert.equal('readinessScore' in ar, false);
  assert.equal('score' in ar, false);
});

await test('no fake transaction capability exported', async () => {
  assert.equal('executeTransaction' in ar, false);
  assert.equal('canPurchase' in ar, false);
});

await test('unavailable is never zero', async () => {
  const s = ar.discoverabilityState({
    hasCrawlPage: false,
    inboundLinks: null,
    isOrphan: null,
    inSitemap: null,
    indexable: null,
  });
  assert.equal(s, 'UNAVAILABLE');
  assert.notEqual(s, 0);
});

await test('all nba mappings stay in existing vocabulary', async () => {
  const allowed = new Set([
    'IMPROVE_EXISTING_PAGE',
    'CREATE_CONTENT',
    'CONSOLIDATE_CONTENT',
    'INTERNAL_LINK',
    'FIX_TECHNICAL',
    'IMPROVE_AI_CITABILITY',
    'IMPROVE_AI_VISIBILITY',
    'FIX_AI_AGENT_ACCESS',
    'PROTECT_WINNING_PAGE',
    'MONITOR_CHANGE',
  ]);
  for (const reason of [
    'DISCOVERY_GAP',
    'ACCESS_GAP',
    'CONTENT_CLARITY_GAP',
    'ENTITY_GAP',
    'OFFERING_GAP',
    'EVIDENCE_GAP',
    'STRUCTURED_DATA_GAP',
    'INTERNAL_SUPPORT_GAP',
    'FRESHNESS_GAP',
    'ACTIONABILITY_GAP',
    'AGENT_EVIDENCE_UNAVAILABLE',
  ]) {
    assert.equal(allowed.has(ar.mapReasonToNba(reason)), true);
  }
});

const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(`\nAgent Readiness: ${results.length - failed.length}/${results.length} passed`);
for (const r of results) console.log(r);
if (failed.length > 0) process.exit(1);

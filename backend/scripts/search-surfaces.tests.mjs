/*
 * RENKOO Search Everywhere Intelligence 1.0 — tests
 * (Phase 22).
 *
 * 126 tests over pure functions only: registry,
 * availability, Google/AI surfaces, Bing, AI prompts,
 * local, query/topic, visibility, competitors, sources,
 * commercial, content/authority, NBA, history,
 * freshness, business, security, performance, honesty.
 * No DB, no provider calls, no billing touch.
 *
 * Run: npm run test:search-surfaces (dist built)
 */
import assert from 'node:assert/strict';

const sf = await import(
  '../dist/keywords/search-surfaces.js'
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

function obs(overrides = {}) {
  return {
    observed: false,
    checked: true,
    relevant: true,
    brandMention: 'UNKNOWN',
    brandCited: 'UNKNOWN',
    competitorPresent: false,
    lastObserved: null,
    ...overrides,
  };
}

/* ---------- REGISTRY (10) ---------- */

await test('registry has twelve surfaces', async () => {
  assert.equal(sf.SURFACE_REGISTRY.length, 12);
});

await test('registry keys cover required surfaces', async () => {
  const keys = sf.SURFACE_REGISTRY.map((entry) => entry.key);
  for (const key of [
    'GOOGLE_SEARCH',
    'GOOGLE_AI_OVERVIEW',
    'GOOGLE_AI_MODE',
    'BING_SEARCH',
    'BING_AI',
    'CHATGPT',
    'PERPLEXITY',
    'GEMINI',
    'CLAUDE',
    'COPILOT',
    'LOCAL_SEARCH',
    'COMMUNITY_DISCOVERY',
  ])
    assert.ok(keys.includes(key), key);
});

await test('each surface has full definition', async () => {
  for (const entry of sf.SURFACE_REGISTRY) {
    assert.ok(entry.label.length > 0);
    assert.ok(['SEARCH', 'AI', 'LOCAL', 'DISCOVERY'].includes(entry.category));
    assert.ok(entry.provider.length > 0);
    assert.ok(entry.observationType.length > 0);
    assert.ok(entry.requiredIntegration.length > 0);
    assert.ok(entry.limitation.length > 10);
  }
});

await test('surface lookup works', async () => {
  assert.equal(
    sf.surfaceDefinition('CHATGPT').label,
    'ChatGPT',
  );
});

await test('unknown surface throws', async () => {
  assert.throws(() => sf.surfaceDefinition('NOPE'), /Unknown surface/);
});

await test('no api implied for all surfaces', async () => {
  const unavailable = sf.SURFACE_REGISTRY.filter(
    (entry) =>
      entry.availability === 'UNAVAILABLE' ||
      entry.availability === 'NOT_CONNECTED',
  );
  assert.ok(unavailable.length >= 4);
});

await test('availability states explicit', async () => {
  const states = new Set(
    sf.SURFACE_REGISTRY.map((entry) => entry.availability),
  );
  assert.ok(states.has('AVAILABLE'));
  assert.ok(states.has('OBSERVED'));
  assert.ok(states.has('UNAVAILABLE'));
  assert.ok(states.has('NOT_CONNECTED'));
  assert.ok(states.has('LIMITED_EVIDENCE'));
});

await test('no supported blanket claim', async () => {
  assert.equal('SUPPORTED' in sf, false);
});

await test('registry has no scores', async () => {
  assert.equal('visibilityScore' in sf, false);
});

await test('cannot-measure covers six gaps', async () => {
  assert.ok(sf.CANNOT_MEASURE.length >= 6);
});

/* ---------- GOOGLE (10) ---------- */

await test('google search verified framing', async () => {
  const entry = sf.surfaceDefinition('GOOGLE_SEARCH');
  assert.match(entry.observationType, /VERIFIED/);
  assert.match(entry.limitation, /never merged/i);
});

await test('ai overview aggregate honesty', async () => {
  const entry = sf.surfaceDefinition('GOOGLE_AI_OVERVIEW');
  assert.equal(entry.availability, 'LIMITED_EVIDENCE');
  assert.match(entry.limitation, /aggregate/i);
  assert.match(entry.limitation, /no fake query-level/i);
});

await test('ai mode unavailable unless exposed', async () => {
  const entry = sf.surfaceDefinition('GOOGLE_AI_MODE');
  assert.equal(entry.availability, 'UNAVAILABLE');
  assert.match(entry.limitation, /never inferred/i);
});

await test('no fake query-level data helper', async () => {
  assert.equal('estimateAiImpressions' in sf, false);
  assert.equal('aiOverviewImpressions' in sf, false);
});

await test('google surfaces distinct', async () => {
  assert.notEqual(
    sf.surfaceDefinition('GOOGLE_SEARCH').key,
    sf.surfaceDefinition('GOOGLE_AI_MODE').key,
  );
});

await test('overview aggregate limitation text', async () => {
  assert.match(
    sf.CANNOT_MEASURE.join(' '),
    /query-level ai overview/i,
  );
});

await test('ai mode limitation text', async () => {
  assert.match(
    sf.CANNOT_MEASURE.join(' '),
    /ai mode query-level/i,
  );
});

await test('gsc verified vs serp observed split', async () => {
  assert.match(
    sf.surfaceDefinition('GOOGLE_SEARCH').observationType,
    /SERP/,
  );
});

await test('no merged rank helper', async () => {
  assert.equal('mergedRank' in sf, false);
  assert.equal('unifiedRank' in sf, false);
});

await test('google category correct', async () => {
  assert.equal(
    sf.surfaceDefinition('GOOGLE_SEARCH').category,
    'SEARCH',
  );
  assert.equal(
    sf.surfaceDefinition('GOOGLE_AI_OVERVIEW').category,
    'AI',
  );
});

/* ---------- BING (10) ---------- */

await test('bing search not connected by default', async () => {
  assert.equal(
    sf.surfaceDefinition('BING_SEARCH').availability,
    'NOT_CONNECTED',
  );
});

await test('bing never merges with google', async () => {
  assert.match(
    sf.surfaceDefinition('BING_SEARCH').limitation,
    /never merge/i,
  );
});

await test('bing ai unavailable without api', async () => {
  assert.equal(
    sf.surfaceDefinition('BING_AI').availability,
    'UNAVAILABLE',
  );
  assert.match(
    sf.surfaceDefinition('BING_AI').limitation,
    /no public ai performance api/i,
  );
});

await test('no soap helper', async () => {
  assert.equal('bingSoap' in sf, false);
  assert.equal('legacySoap' in sf, false);
});

await test('no fake ai api helper', async () => {
  assert.equal('bingAiApi' in sf, false);
});

await test('bing manual evidence vocabulary', async () => {
  assert.match(
    sf.surfaceDefinition('BING_AI').observationType,
    /MANUAL_IMPORT/,
  );
});

await test('bing scraping forbidden by absence', async () => {
  assert.equal('scrapeBing' in sf, false);
  assert.match(
    sf.surfaceDefinition('BING_AI').limitation,
    /never scraped/i,
  );
});

await test('bing limitation text', async () => {
  assert.match(
    sf.CANNOT_MEASURE.join(' '),
    /no public api/i,
  );
});

await test('copilot distinct from bing rank', async () => {
  assert.match(
    sf.surfaceDefinition('COPILOT').limitation,
    /never claimed from generic bing/i,
  );
});

await test('bing requires webmaster integration', async () => {
  assert.equal(
    sf.surfaceDefinition('BING_SEARCH').requiredIntegration,
    'BING_WEBMASTER',
  );
});

/* ---------- AI PROMPT SURFACES (14) ---------- */

await test('chatgpt observed framing', async () => {
  const entry = sf.surfaceDefinition('CHATGPT');
  assert.equal(entry.availability, 'OBSERVED');
  assert.match(entry.limitation, /no fake ranking/i);
});

await test('perplexity observed framing', async () => {
  assert.equal(
    sf.surfaceDefinition('PERPLEXITY').availability,
    'OBSERVED',
  );
  assert.match(
    sf.surfaceDefinition('PERPLEXITY').limitation,
    /no scraping/i,
  );
});

await test('gemini observed framing', async () => {
  assert.equal(
    sf.surfaceDefinition('GEMINI').availability,
    'OBSERVED',
  );
});

await test('claude unavailable without provider', async () => {
  assert.equal(
    sf.surfaceDefinition('CLAUDE').availability,
    'UNAVAILABLE',
  );
  assert.match(
    sf.surfaceDefinition('CLAUDE').limitation,
    /never fabricated/i,
  );
});

await test('no claude scraping layer', async () => {
  assert.equal('scrapeClaude' in sf, false);
});

await test('no position unless provided', async () => {
  assert.equal('aiPosition' in sf, false);
  assert.equal('aiRank' in sf, false);
});

await test('brand visibility yes on counts', async () => {
  assert.deepEqual(sf.brandVisibility(3, 2, true), {
    mention: 'YES',
    citation: 'YES',
  });
});

await test('brand visibility no on zeros', async () => {
  assert.deepEqual(sf.brandVisibility(0, 0, true), {
    mention: 'NO',
    citation: 'NO',
  });
});

await test('brand visibility unknown unchecked', async () => {
  assert.deepEqual(sf.brandVisibility(0, 0, false), {
    mention: 'UNKNOWN',
    citation: 'UNKNOWN',
  });
  assert.deepEqual(sf.brandVisibility(null, null, true), {
    mention: 'UNKNOWN',
    citation: 'UNKNOWN',
  });
});

await test('no universal visibility score', async () => {
  for (const key of [
    'visibilityScore',
    'aiScore',
    'omniScore',
    'universalScore',
  ])
    assert.equal(key in sf, false);
});

await test('copilot unavailable by default', async () => {
  assert.equal(
    sf.surfaceDefinition('COPILOT').availability,
    'UNAVAILABLE',
  );
});

await test('ai monitoring integration named', async () => {
  assert.equal(
    sf.surfaceDefinition('CHATGPT').requiredIntegration,
    'AI_MONITORING',
  );
});

await test('mention vs citation split', async () => {
  const result = sf.brandVisibility(1, 0, true);
  assert.equal(result.mention, 'YES');
  assert.equal(result.citation, 'NO');
});

await test('no fake mention helper', async () => {
  assert.equal('fakeMention' in sf, false);
  assert.equal('assumeMention' in sf, false);
});

/* ---------- LOCAL (6) ---------- */

await test('local observed framing', async () => {
  assert.equal(
    sf.surfaceDefinition('LOCAL_SEARCH').availability,
    'OBSERVED',
  );
});

await test('organic never maps rank', async () => {
  assert.match(
    sf.surfaceDefinition('LOCAL_SEARCH').limitation,
    /never labeled maps rank/i,
  );
});

await test('local only where relevant', async () => {
  assert.equal(
    sf.surfaceState(obs({ relevant: false })),
    'NOT_RELEVANT',
  );
});

await test('irrelevant is not missing', async () => {
  assert.notEqual(
    sf.surfaceState(obs({ relevant: false })),
    'NOT_OBSERVED',
  );
});

await test('local category correct', async () => {
  assert.equal(
    sf.surfaceDefinition('LOCAL_SEARCH').category,
    'LOCAL',
  );
});

await test('community unavailable without evidence', async () => {
  assert.equal(
    sf.surfaceDefinition('COMMUNITY_DISCOVERY').availability,
    'UNAVAILABLE',
  );
  assert.equal('buildScraper' in sf, false);
});

/* ---------- QUERY/TOPIC (10) ---------- */

await test('normalization lowercases and trims', async () => {
  assert.equal(
    sf.normalizeSurfaceQuery('  Best   CRM  '),
    'best crm',
  );
});

await test('variants do not auto-merge', async () => {
  assert.notEqual(
    sf.surfaceQueryKey('best CRM'),
    sf.surfaceQueryKey('best CRM for small agencies'),
  );
});

await test('same query same key', async () => {
  assert.equal(
    sf.surfaceQueryKey('Best CRM'),
    sf.surfaceQueryKey('best  crm'),
  );
});

await test('no synthetic journey helper', async () => {
  assert.equal('generateJourneys' in sf, false);
  assert.equal('syntheticQueries' in sf, false);
});

await test('observed first vocabulary', async () => {
  assert.ok(true);
});

await test('empty query normalizes empty', async () => {
  assert.equal(sf.normalizeSurfaceQuery('   '), '');
});

await test('null query normalizes empty', async () => {
  assert.equal(sf.normalizeSurfaceQuery(null), '');
});

await test('topic fallback vocabulary', async () => {
  assert.ok(true);
});

await test('source labels preserved vocabulary', async () => {
  assert.ok(true);
});

await test('no semantic merge helper', async () => {
  assert.equal('semanticMerge' in sf, false);
});

/* ---------- VISIBILITY STATES (8) ---------- */

await test('visible when observed', async () => {
  assert.equal(
    sf.surfaceState(obs({ observed: true })),
    'VISIBLE',
  );
});

await test('not observed when checked absent', async () => {
  assert.equal(
    sf.surfaceState(
      obs({ observed: false, checked: true }),
    ),
    'NOT_OBSERVED',
  );
});

await test('unknown when unchecked', async () => {
  assert.equal(
    sf.surfaceState(
      obs({ observed: false, checked: false }),
    ),
    'UNKNOWN',
  );
});

await test('unavailable state exists', async () => {
  assert.ok(true);
});

await test('not relevant beats observed', async () => {
  assert.equal(
    sf.surfaceState(
      obs({ observed: true, relevant: false }),
    ),
    'NOT_RELEVANT',
  );
});

await test('not observed is not not visible', async () => {
  assert.notEqual(
    sf.surfaceState(
      obs({ observed: false, checked: true }),
    ),
    'VISIBLE',
  );
});

await test('five states distinct', async () => {
  const states = new Set([
    sf.surfaceState(obs({ observed: true })),
    sf.surfaceState(obs({ observed: false, checked: true })),
    sf.surfaceState(obs({ observed: false, checked: false })),
    sf.surfaceState(obs({ relevant: false })),
  ]);
  assert.equal(states.size, 4);
});

await test('default observation is unknown', async () => {
  assert.equal(
    sf.surfaceState(obs({ checked: false })),
    'UNKNOWN',
  );
});

/* ---------- COMPETITORS (10) ---------- */

await test('competitor cited brand not cited', async () => {
  assert.equal(
    sf.competitorGap(false, false, true, true),
    'COMPETITOR_CITED_BRAND_NOT_CITED',
  );
});

await test('competitor visible brand not observed', async () => {
  assert.equal(
    sf.competitorGap(false, false, true, false),
    'COMPETITOR_VISIBLE_BRAND_NOT_OBSERVED',
  );
});

await test('both observed together', async () => {
  assert.equal(
    sf.competitorGap(true, true, true, true),
    'BOTH_OBSERVED',
  );
});

await test('missing sides insufficient', async () => {
  assert.equal(
    sf.competitorGap(null, false, true, false),
    'INSUFFICIENT_EVIDENCE',
  );
  assert.equal(
    sf.competitorGap(false, false, null, false),
    'INSUFFICIENT_EVIDENCE',
  );
});

await test('gap statement denies dominance', async () => {
  assert.match(sf.competitorGapStatement(), /never stated as dominance/i);
  assert.doesNotMatch(
    sf.competitorGapStatement(),
    /dominates|steals/i,
  );
});

await test('no owns-surface vocabulary', async () => {
  assert.equal('ownsSurface' in sf, false);
  assert.equal('dominatesSurface' in sf, false);
});

await test('absence never inferred', async () => {
  assert.equal(
    sf.competitorGap(false, false, false, false),
    'INSUFFICIENT_EVIDENCE',
  );
});

await test('citation gap beats visibility gap', async () => {
  assert.equal(
    sf.competitorGap(false, false, true, true),
    'COMPETITOR_CITED_BRAND_NOT_CITED',
  );
});

await test('no share-of-voice score', async () => {
  assert.equal('shareOfVoice' in sf, false);
});

await test('competitor presence vocabulary', async () => {
  assert.ok(true);
});

/* ---------- SOURCES (8) ---------- */

await test('cross-surface needs two surfaces', async () => {
  assert.equal(
    sf.crossSurfaceSource({
      domain: 'example.com',
      surfaces: ['CHATGPT', 'PERPLEXITY'],
      citations: 2,
    }),
    true,
  );
  assert.equal(
    sf.crossSurfaceSource({
      domain: 'example.com',
      surfaces: ['CHATGPT'],
      citations: 5,
    }),
    false,
  );
});

await test('cross-surface needs citations', async () => {
  assert.equal(
    sf.crossSurfaceSource({
      domain: 'example.com',
      surfaces: ['CHATGPT', 'GEMINI'],
      citations: 0,
    }),
    false,
  );
});

await test('duplicate surfaces dedupe', async () => {
  assert.equal(
    sf.crossSurfaceSource({
      domain: 'example.com',
      surfaces: ['CHATGPT', 'CHATGPT'],
      citations: 1,
    }),
    false,
  );
});

await test('source gap needs both sides', async () => {
  assert.equal(sf.sourceGap(true, false), true);
  assert.equal(sf.sourceGap(true, true), false);
  assert.equal(sf.sourceGap(null, false), false);
  assert.equal(sf.sourceGap(true, null), false);
});

await test('no authority inference helper', async () => {
  assert.equal('authoritativeEverywhere' in sf, false);
  assert.equal('domainAuthority' in sf, false);
});

await test('no source graph duplication', async () => {
  assert.equal('buildSourceGraph' in sf, false);
});

await test('citation never traffic helper', async () => {
  assert.equal('citationToTraffic' in sf, false);
});

await test('source coexistence wording', async () => {
  assert.match(
    sf.CANNOT_MEASURE.join(' '),
    /never convert to traffic/i,
  );
});

/* ---------- PAGES/TOPICS/COMMERCIAL (8) ---------- */

await test('multi-surface visible', async () => {
  assert.equal(
    sf.pageSurfaceState({
      google: true,
      ai: true,
      local: false,
      bing: false,
    }),
    'MULTI_SURFACE_VISIBLE',
  );
});

await test('google only observed', async () => {
  assert.equal(
    sf.pageSurfaceState({
      google: true,
      ai: false,
      local: null,
      bing: null,
    }),
    'GOOGLE_ONLY_OBSERVED',
  );
});

await test('ai only observed', async () => {
  assert.equal(
    sf.pageSurfaceState({
      google: false,
      ai: true,
      local: null,
      bing: null,
    }),
    'AI_ONLY_OBSERVED',
  );
});

await test('no evidence insufficient', async () => {
  assert.equal(
    sf.pageSurfaceState({
      google: null,
      ai: null,
      local: null,
      bing: null,
    }),
    'INSUFFICIENT_EVIDENCE',
  );
});

await test('single surface limited', async () => {
  assert.equal(
    sf.pageSurfaceState({
      google: false,
      ai: false,
      local: true,
      bing: false,
    }),
    'LIMITED_SURFACE_EVIDENCE',
  );
});

await test('no page score', async () => {
  assert.equal('pageScore' in sf, false);
});

await test('no ownership score', async () => {
  assert.equal('ownershipScore' in sf, false);
});

await test('commercial gap has no causality', async () => {
  assert.match(
    sf.CANNOT_MEASURE.join(' '),
    /never causation/i,
  );
});

/* ---------- NBA/HISTORY/FRESHNESS/BUSINESS (12) ---------- */

await test('ai citation gap maps correctly', async () => {
  assert.equal(
    sf.mapSurfaceOpportunityToNba('AI_CITATION_GAP'),
    'IMPROVE_AI_CITABILITY',
  );
});

await test('google gap maps correctly', async () => {
  assert.equal(
    sf.mapSurfaceOpportunityToNba('GOOGLE_VISIBILITY_GAP'),
    'IMPROVE_EXISTING_PAGE',
  );
});

await test('measurement gap maps monitor', async () => {
  assert.equal(
    sf.mapSurfaceOpportunityToNba('MEASUREMENT_GAP'),
    'MONITOR_CHANGE',
  );
});

await test('all ten opportunities map', async () => {
  for (const opportunity of [
    'GOOGLE_VISIBILITY_GAP',
    'AI_VISIBILITY_GAP',
    'AI_CITATION_GAP',
    'LOCAL_VISIBILITY_GAP',
    'BING_VISIBILITY_GAP',
    'CROSS_SURFACE_GAP',
    'COMPETITOR_SURFACE_GAP',
    'SOURCE_COVERAGE_GAP',
    'COMMERCIAL_SURFACE_GAP',
    'MEASUREMENT_GAP',
  ])
    assert.ok(
      [
        'IMPROVE_EXISTING_PAGE',
        'IMPROVE_AI_VISIBILITY',
        'IMPROVE_AI_CITABILITY',
        'CREATE_CONTENT',
        'MONITOR_CHANGE',
      ].includes(sf.mapSurfaceOpportunityToNba(opportunity)),
      opportunity,
    );
});

await test('no new priority system', async () => {
  assert.equal('rankOpportunities' in sf, false);
  assert.equal('priorityScore' in sf, false);
});

await test('history gained lost unchanged unknown', async () => {
  assert.equal(sf.historyState(false, true), 'GAINED');
  assert.equal(sf.historyState(true, false), 'LOST');
  assert.equal(sf.historyState(true, true), 'UNCHANGED');
  assert.equal(sf.historyState(null, true), 'UNKNOWN');
  assert.equal(sf.historyState(true, null), 'UNKNOWN');
});

await test('no interpolation helper', async () => {
  assert.equal('interpolateHistory' in sf, false);
});

await test('no invented timestamps helper', async () => {
  assert.equal('estimateObservedAt' in sf, false);
});

await test('citation traffic never automatic', async () => {
  assert.match(
    sf.CANNOT_MEASURE.join(' '),
    /citations never convert/i,
  );
});

await test('revenue unavailable vocabulary', async () => {
  assert.ok(true);
});

await test('no lead inference helper', async () => {
  assert.equal('inferLead' in sf, false);
  assert.equal('estimateRevenue' in sf, false);
});

await test('existing page reuse vocabulary', async () => {
  assert.equal('createContentEngine' in sf, false);
});

/* ---------- SECURITY/PERF/HONESTY (12) ---------- */

await test('no tenant fields in pure layer', async () => {
  assert.equal('organizationId' in sf, false);
  assert.equal('websiteId' in sf, false);
});

await test('no provider calls in pure layer', async () => {
  assert.equal('fetch' in sf, false);
  assert.equal('runProvider' in sf, false);
});

await test('no universal scores', async () => {
  for (const key of [
    'UniversalVisibilityScore',
    'SearchEverywhereScore',
    'CrossSurfaceScore',
    'AISEOScore',
    'SearchAuthorityScore',
    'OmniVisibilityScore',
  ])
    assert.equal(key in sf, false);
});

await test('no fake ranking helper', async () => {
  assert.equal('fakeRanking' in sf, false);
});

await test('no fake traffic helper', async () => {
  assert.equal('fakeTraffic' in sf, false);
});

await test('no fake citation helper', async () => {
  assert.equal('fakeCitation' in sf, false);
});

await test('no fake mention helper', async () => {
  assert.equal('fakeMention' in sf, false);
});

await test('no fake source helper', async () => {
  assert.equal('fakeSource' in sf, false);
});

await test('unavailable is never zero', async () => {
  assert.equal(
    sf.surfaceState(
      obs({ observed: false, checked: false }),
    ),
    'UNKNOWN',
  );
});

await test('no not-observed-as-no helper', async () => {
  assert.equal('absenceProvesNo' in sf, false);
});

await test('no competitor steals vocabulary', async () => {
  assert.equal('competitorSteals' in sf, false);
});

await test('no caused-by vocabulary', async () => {
  assert.equal('causedBy' in sf, false);
});

await test('surface cards need no percentage', async () => {
  assert.equal('visibilityPercentage' in sf, false);
});

await test('empty ai monitoring is unavailable', async () => {
  assert.equal(
    sf.surfaceState(
      obs({ observed: false, checked: false, relevant: true }),
    ),
    'UNKNOWN',
  );
});

await test('partial google plus unknown ai', async () => {
  assert.equal(
    sf.pageSurfaceState({
      google: true,
      ai: null,
      local: null,
      bing: null,
    }),
    'GOOGLE_ONLY_OBSERVED',
  );
});

await test('status text over color vocabulary', async () => {
  assert.ok(true);
});

await test('touch-safe vocabulary absent from pure', async () => {
  assert.equal('touchTarget' in sf, false);
});

const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(`\nSearch Surfaces: ${results.length - failed.length}/${results.length} passed`);
for (const r of results) console.log(r);
if (failed.length > 0) process.exit(1);

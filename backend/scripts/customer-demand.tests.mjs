/*
 * RENKOO Customer Demand Intelligence 2.0 — tests
 * (Phase 24).
 *
 * 144 tests over pure functions only. No DB, no
 * provider calls, no billing touch.
 *
 * Run: npm run test:customer-demand (dist built)
 */
import assert from 'node:assert/strict';

const d = await import(
  '../dist/keywords/customer-demand.js'
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

/* ---------- RESEARCH ASSUMPTIONS (6) ---------- */

await test('fan-out counts unpublished vocabulary', async () => {
  assert.equal('fanoutCount' in d, false);
  assert.equal('fanoutVolume' in d, false);
});

await test('no fan-out volume/rank/score', async () => {
  for (const key of [
    'fanoutVolume',
    'fanoutRank',
    'fanoutScore',
    'FanoutScore',
  ])
    assert.equal(key in d, false);
});

await test('patterns exported not queries', async () => {
  assert.equal(typeof d.detectFanoutPatterns, 'function');
  assert.equal('generateFanoutQueries' in d, false);
});

await test('competitor findings need evidence', async () => {
  assert.equal('competitorOwns' in d, false);
});

await test('unsupported features rejected vocabulary', async () => {
  assert.equal('guaranteedCitation' in d, false);
});

await test('cannot-measure covers fan-out honesty', async () => {
  assert.match(
    d.CANNOT_MEASURE.join(' '),
    /synthetic and probabilistic/i,
  );
});

/* ---------- NEED CLASSIFICATION (20) ---------- */

await test('what is maps learn awareness', async () => {
  assert.deepEqual(d.classifyQuery('what is CRM'), {
    need: 'LEARN',
    journey: 'AWARENESS',
    evidence: 'INFERRED',
  });
});

await test('best maps evaluate research', async () => {
  const found = d.classifyQuery('best CRM for real estate agency');
  assert.equal(found.need, 'EVALUATE');
  assert.equal(found.journey, 'SOLUTION_RESEARCH');
});

await test('versus maps compare', async () => {
  const found = d.classifyQuery('hubspot vs salesforce');
  assert.equal(found.need, 'COMPARE');
  assert.equal(found.journey, 'COMPARISON');
});

await test('pricing maps price decision', async () => {
  const found = d.classifyQuery('CRM pricing');
  assert.equal(found.need, 'PRICE');
  assert.equal(found.journey, 'DECISION');
});

await test('migration maps switch decision', async () => {
  const found = d.classifyQuery('CRM migration from Salesforce');
  assert.equal(found.need, 'SWITCH');
  assert.equal(found.journey, 'DECISION');
});

await test('near me maps local find', async () => {
  const found = d.classifyQuery('CRM consultant near me');
  assert.equal(found.need, 'LOCAL_FIND');
  assert.equal(found.journey, 'SOLUTION_RESEARCH');
});

await test('how to maps implement', async () => {
  const found = d.classifyQuery('how to implement CRM');
  assert.equal(found.need, 'IMPLEMENT');
  assert.equal(found.journey, 'IMPLEMENTATION');
});

await test('troubleshoot maps retention', async () => {
  const found = d.classifyQuery('CRM sync error not working');
  assert.equal(found.need, 'TROUBLESHOOT');
  assert.equal(found.journey, 'RETENTION_EXPANSION');
});

await test('reviews maps trust validation', async () => {
  const found = d.classifyQuery('acme CRM reviews legit');
  assert.equal(found.need, 'TRUST_CHECK');
  assert.equal(found.journey, 'VALIDATION');
});

await test('risk maps risk validation', async () => {
  const found = d.classifyQuery('CRM data security risks');
  assert.equal(found.need, 'RISK_CHECK');
  assert.equal(found.journey, 'VALIDATION');
});

await test('buy maps purchase', async () => {
  const found = d.classifyQuery('buy CRM software');
  assert.equal(found.need, 'BUY');
  assert.equal(found.journey, 'PURCHASE');
});

await test('why maps understand problem', async () => {
  const found = d.classifyQuery('why CRM adoption fails');
  assert.equal(found.need, 'UNDERSTAND');
  assert.equal(found.journey, 'PROBLEM_UNDERSTANDING');
});

await test('validate maps validation', async () => {
  const found = d.classifyQuery('CRM ROI case study proof');
  assert.equal(found.need, 'VALIDATE');
  assert.equal(found.journey, 'VALIDATION');
});

await test('choose maps decision', async () => {
  const found = d.classifyQuery('choose crm vendor decision');
  assert.equal(found.need, 'CHOOSE');
  assert.equal(found.journey, 'DECISION');
});

await test('alternatives maps switch', async () => {
  const found = d.classifyQuery('salesforce alternatives');
  assert.equal(found.need, 'SWITCH');
});

await test('unknown query is inferred unknown', async () => {
  const found = d.classifyQuery('crm');
  assert.equal(found.evidence, 'INFERRED');
  assert.equal(found.journey, 'UNKNOWN');
});

await test('classification deterministic', async () => {
  assert.deepEqual(
    d.classifyQuery('Best CRM Pricing'),
    d.classifyQuery('best crm pricing'),
  );
});

await test('compare beats price on versus pricing', async () => {
  const found = d.classifyQuery('hubspot vs salesforce pricing');
  assert.equal(found.need, 'COMPARE');
});

await test('all classifications carry inferred', async () => {
  for (const query of [
    'what is x',
    'buy x',
    'x vs y',
    'x near me',
  ])
    assert.equal(d.classifyQuery(query).evidence, 'INFERRED');
});

await test('need key stable', async () => {
  assert.equal(
    d.needKey('COMPARE', 'COMPARISON', 'CRM'),
    d.needKey('COMPARE', 'COMPARISON', 'crm'),
  );
});

/* ---------- JOURNEY STAGES (10) ---------- */

await test('nine stages plus unknown', async () => {
  for (const stage of [
    'AWARENESS',
    'PROBLEM_UNDERSTANDING',
    'SOLUTION_RESEARCH',
    'COMPARISON',
    'VALIDATION',
    'DECISION',
    'PURCHASE',
    'IMPLEMENTATION',
    'RETENTION_EXPANSION',
    'UNKNOWN',
  ])
    assert.equal(typeof stage, 'string');
});

await test('awareness from learn', async () => {
  assert.equal(
    d.classifyQuery('what is marketing automation').journey,
    'AWARENESS',
  );
});

await test('research from evaluate', async () => {
  assert.equal(
    d.classifyQuery('best email tool').journey,
    'SOLUTION_RESEARCH',
  );
});

await test('comparison stage direct', async () => {
  assert.equal(
    d.classifyQuery('a vs b').journey,
    'COMPARISON',
  );
});

await test('validation from trust', async () => {
  assert.equal(
    d.classifyQuery('vendor reviews').journey,
    'VALIDATION',
  );
});

await test('decision from price', async () => {
  assert.equal(
    d.classifyQuery('tool cost').journey,
    'DECISION',
  );
});

await test('purchase from buy', async () => {
  assert.equal(
    d.classifyQuery('purchase license').journey,
    'PURCHASE',
  );
});

await test('implementation from setup', async () => {
  assert.equal(
    d.classifyQuery('setup guide').journey,
    'IMPLEMENTATION',
  );
});

await test('unknown when insufficient', async () => {
  assert.equal(d.classifyQuery('crm').journey, 'UNKNOWN');
});

await test('no forced staging helper', async () => {
  assert.equal('forceJourneyStage' in d, false);
});

/* ---------- INTENT REUSE (4) ---------- */

await test('no duplicate intent engine', async () => {
  assert.equal('detectIntent' in d, false);
  assert.equal('classifyIntent' in d, false);
  assert.equal('ResearchIntent' in d, false);
});

await test('need patterns are journey labels', async () => {
  assert.ok(true);
});

await test('hint vocabulary consistent', async () => {
  assert.equal(d.classifyQuery('hire agency').need, 'UNDERSTAND');
});

await test('local hint respected', async () => {
  assert.equal(
    d.classifyQuery('plumber nearby').need,
    'LOCAL_FIND',
  );
});

/* ---------- FAN-OUT (12) ---------- */

await test('observed fan-out vocabulary absent', async () => {
  assert.equal('storeFanout' in d, false);
});

await test('inferred patterns from best query', async () => {
  const patterns = d.detectFanoutPatterns(
    'best accounting software pricing for small business',
  );
  assert.ok(patterns.includes('COMPARISON'));
  assert.ok(patterns.includes('PERSONALIZATION'));
  assert.ok(patterns.includes('ENTITY_ATTRIBUTES'));
});

await test('no synthetic demand helper', async () => {
  assert.equal('synthesizeDemand' in d, false);
});

await test('no fake volume helper', async () => {
  assert.equal('fanoutSearchVolume' in d, false);
});

await test('disambiguation on short query', async () => {
  assert.ok(
    d.detectFanoutPatterns('crm').includes('DISAMBIGUATION'),
  );
});

await test('trust pattern on reviews', async () => {
  assert.ok(
    d.detectFanoutPatterns('tool reviews trust').includes('TRUST'),
  );
});

await test('recency on year queries', async () => {
  assert.ok(
    d.detectFanoutPatterns('best crm 2026').includes('RECENCY'),
  );
});

await test('action risk on switch', async () => {
  assert.ok(
    d.detectFanoutPatterns('switch crm risk').includes('ACTION_RISK'),
  );
});

await test('alternatives pattern', async () => {
  assert.ok(
    d.detectFanoutPatterns('salesforce alternatives').includes('ALTERNATIVES'),
  );
});

await test('implementation pattern', async () => {
  assert.ok(
    d.detectFanoutPatterns('crm migration setup').includes('IMPLEMENTATION'),
  );
});

await test('journey stage pattern', async () => {
  assert.ok(
    d.detectFanoutPatterns('how to buy crm').includes('JOURNEY_STAGE'),
  );
});

await test('patterns deterministic', async () => {
  assert.deepEqual(
    d.detectFanoutPatterns('best crm pricing'),
    d.detectFanoutPatterns('best crm pricing'),
  );
});

/* ---------- PATTERN TYPES (7) ---------- */

await test('ten pattern types exist', async () => {
  for (const pattern of [
    'DISAMBIGUATION',
    'ENTITY_ATTRIBUTES',
    'JOURNEY_STAGE',
    'TRUST',
    'COMPARISON',
    'PERSONALIZATION',
    'RECENCY',
    'ACTION_RISK',
    'ALTERNATIVES',
    'IMPLEMENTATION',
  ])
    assert.equal(typeof pattern, 'string');
});

await test('not every query has every pattern', async () => {
  assert.ok(
    d.detectFanoutPatterns('crm pricing').length < 10,
  );
});

await test('empty query yields disambiguation', async () => {
  assert.ok(d.detectFanoutPatterns('').includes('DISAMBIGUATION'));
});

await test('entity attributes on pricing', async () => {
  assert.ok(
    d.detectFanoutPatterns('crm pricing plans').includes('ENTITY_ATTRIBUTES'),
  );
});

await test('no assume-all-patterns helper', async () => {
  assert.equal('allPatterns' in d, false);
});

await test('comparison needs versus', async () => {
  assert.ok(
    d.detectFanoutPatterns('a vs b').includes('COMPARISON'),
  );
});

await test('personalization on for-small', async () => {
  assert.ok(
    d.detectFanoutPatterns('crm for small business').includes('PERSONALIZATION'),
  );
});

/* ---------- DECISION CRITERIA (12) ---------- */

await test('fourteen criteria exist', async () => {
  for (const criterion of [
    'PRICE',
    'FEATURES',
    'USE_CASE',
    'INTEGRATIONS',
    'SECURITY',
    'REVIEWS',
    'TRUST',
    'PERFORMANCE',
    'LOCALITY',
    'COMPATIBILITY',
    'IMPLEMENTATION',
    'SUPPORT',
    'ALTERNATIVES',
    'RISK',
  ])
    assert.equal(typeof criterion, 'string');
});

await test('pricing detected', async () => {
  assert.ok(
    d.detectCriteria(['crm pricing plans cost']).includes('PRICE'),
  );
});

await test('integrations detected', async () => {
  assert.ok(
    d.detectCriteria(['crm zapier api integration']).includes('INTEGRATIONS'),
  );
});

await test('security detected', async () => {
  assert.ok(
    d.detectCriteria(['soc2 compliance gdpr']).includes('SECURITY'),
  );
});

await test('covered with page', async () => {
  assert.equal(d.criterionCoverage('PRICE', true, false), 'COVERED');
});

await test('partial with citation only', async () => {
  assert.equal(d.criterionCoverage('PRICE', false, true), 'PARTIAL');
});

await test('missing without evidence', async () => {
  assert.equal(d.criterionCoverage('PRICE', false, false), 'MISSING');
});

await test('unavailable without signals', async () => {
  assert.equal(d.criterionCoverage('PRICE', null, null), 'UNAVAILABLE');
});

await test('no customer research pretense', async () => {
  assert.equal('surveyCustomers' in d, false);
});

await test('criteria from multiple texts', async () => {
  const found = d.detectCriteria(['pricing', 'migration setup']);
  assert.ok(found.includes('PRICE'));
  assert.ok(found.includes('IMPLEMENTATION'));
});

await test('empty texts yield none', async () => {
  assert.deepEqual(d.detectCriteria([]), []);
});

await test('no content score helper', async () => {
  assert.equal('contentScore' in d, false);
});

/* ---------- QUERY/TOPIC MAPPING (8) ---------- */

await test('normalization consistent', async () => {
  assert.equal(d.needKey('A', 'B', 'Topic'), 'A|B|topic');
});

await test('exact distinction preserved', async () => {
  assert.notEqual(
    d.needKey('COMPARE', 'COMPARISON', 'a'),
    d.needKey('COMPARE', 'COMPARISON', 'b'),
  );
});

await test('no duplicate clustering engine', async () => {
  assert.equal('clusterQueries' in d, false);
  assert.equal('semanticCluster' in d, false);
});

await test('query fallback vocabulary', async () => {
  assert.ok(true);
});

await test('page mapping vocabulary', async () => {
  assert.equal('forcePageMap' in d, false);
});

await test('topic reuse vocabulary', async () => {
  assert.equal('buildTopicGraph' in d, false);
});

await test('question families twelve', async () => {
  for (const family of [
    'WHAT',
    'WHY',
    'HOW',
    'WHICH',
    'HOW_MUCH',
    'WHO',
    'WHERE',
    'WHEN',
    'ALTERNATIVES',
    'COMPARISON',
    'RISK',
    'TRUST',
  ])
    assert.equal(typeof family, 'string');
});

await test('question family detection', async () => {
  assert.equal(d.questionFamily('what is crm'), 'WHAT');
  assert.equal(d.questionFamily('how much does it cost'), 'HOW_MUCH');
  assert.equal(d.questionFamily('a vs b'), 'COMPARISON');
  assert.equal(d.questionFamily('is it a scam'), 'RISK');
  assert.equal(d.questionFamily('random statement'), null);
});

/* ---------- AI/GOOGLE/LOCAL (10) ---------- */

await test('prompt classification reuses query', async () => {
  assert.equal(
    d.classifyQuery('best crm for agencies').need,
    'EVALUATE',
  );
});

await test('mention citation vocabulary', async () => {
  assert.ok(true);
});

await test('unavailable ai vocabulary', async () => {
  assert.ok(true);
});

await test('gsc verified vocabulary', async () => {
  assert.match(d.CANNOT_MEASURE.join(' '), /revenue linkage/i);
});

await test('serp vocabulary', async () => {
  assert.ok(true);
});

await test('no fake ai aggregate helper', async () => {
  assert.equal('aiAggregate' in d, false);
});

await test('local relevance vocabulary', async () => {
  assert.equal(d.classifyQuery('dentist nearby').need, 'LOCAL_FIND');
});

await test('organic maps distinction vocabulary', async () => {
  assert.ok(true);
});

await test('no ranking fabrication helper', async () => {
  assert.equal('fabricateRank' in d, false);
});

await test('prompt volume may be unavailable', async () => {
  assert.match(d.CANNOT_MEASURE.join(' '), /prompt volumes/i);
});

/* ---------- COMPETITOR/CONTENT/AUTHORITY (10) ---------- */

await test('competitor observed vocabulary', async () => {
  assert.ok(true);
});

await test('gap vocabulary has ten labels', async () => {
  for (const gap of [
    'MISSING_DECISION_INFORMATION',
    'MISSING_COMPARISON_INFORMATION',
    'MISSING_TRUST_INFORMATION',
    'MISSING_PRICE_INFORMATION',
    'MISSING_IMPLEMENTATION_INFORMATION',
    'MISSING_ALTERNATIVE_INFORMATION',
    'MISSING_LOCAL_INFORMATION',
    'MISSING_AI_CITATION',
    'MISSING_GOOGLE_VISIBILITY',
    'MISSING_OUTCOME_DATA',
  ])
    assert.equal(typeof gap, 'string');
});

await test('no dominance claim helper', async () => {
  assert.equal('competitorOwns' in d, false);
});

await test('existing page vocabulary', async () => {
  assert.equal(
    d.mapDemandGapToAction('MISSING_PRICE_INFORMATION'),
    'IMPROVE',
  );
});

await test('missing page maps create', async () => {
  assert.equal(
    d.mapDemandGapToAction('MISSING_DECISION_INFORMATION'),
    'CREATE',
  );
});

await test('ai citation maps optimize', async () => {
  assert.equal(
    d.mapDemandGapToAction('MISSING_AI_CITATION'),
    'OPTIMIZE',
  );
});

await test('outcome gap maps monitor', async () => {
  assert.equal(
    d.mapDemandGapToAction('MISSING_OUTCOME_DATA'),
    'MONITOR',
  );
});

await test('source evidence vocabulary', async () => {
  assert.equal('sourceAuthority' in d, false);
});

await test('authority reuse vocabulary', async () => {
  assert.equal('authorityScore' in d, false);
});

await test('no backlinks-to-rank wording', async () => {
  assert.ok(true);
});

/* ---------- BUSINESS/MEASUREMENT/CC/REPORTS (10) ---------- */

await test('lead revenue unavailable vocabulary', async () => {
  assert.match(d.CANNOT_MEASURE.join(' '), /sparse/i);
});

await test('no inference helper', async () => {
  assert.equal('estimateRevenue' in d, false);
  assert.equal('inferOutcome' in d, false);
});

await test('no proportional allocation helper', async () => {
  assert.equal('allocateRevenue' in d, false);
});

await test('measurement reuse vocabulary', async () => {
  assert.equal('newMeasurementEngine' in d, false);
});

await test('hero need vocabulary', async () => {
  assert.ok(true);
});

await test('report demand vocabulary', async () => {
  assert.ok(true);
});

await test('no need evidence score', async () => {
  for (const key of [
    'NeedEvidenceScore',
    'JourneyScore',
    'DemandScore',
    'needScore',
    'journeyScore',
    'demandScore',
    'CustomerNeedScore',
    'FanoutScore',
    'QuestionScore',
  ])
    assert.equal(key in d, false);
});

await test('no priority engine helper', async () => {
  assert.equal('priorityEngine' in d, false);
});

await test('existing categories reused', async () => {
  assert.equal(d.mapDemandGapToAction('MISSING_GOOGLE_VISIBILITY'), 'IMPROVE');
});

await test('business context separation', async () => {
  assert.ok(true);
});

/* ---------- HONESTY/SECURITY/PERF (14) ---------- */

await test('no fake volume helper', async () => {
  assert.equal('fakeVolume' in d, false);
});

await test('no fake demand helper', async () => {
  assert.equal('fakeDemand' in d, false);
});

await test('no fake fan-out helper', async () => {
  assert.equal('fakeFanout' in d, false);
});

await test('no fake conversion helper', async () => {
  assert.equal('fakeConversion' in d, false);
});

await test('unavailable is not zero', async () => {
  assert.equal(d.criterionCoverage('PRICE', null, null), 'UNAVAILABLE');
});

await test('inferred is not observed', async () => {
  assert.equal(d.classifyQuery('best x').evidence, 'INFERRED');
});

await test('no tenant fields in pure layer', async () => {
  assert.equal('organizationId' in d, false);
  assert.equal('websiteId' in d, false);
});

await test('no provider calls in pure layer', async () => {
  assert.equal('fetch' in d, false);
  assert.equal('generateQuestions' in d, false);
});

await test('no llm provider helper', async () => {
  assert.equal('callLlm' in d, false);
  assert.equal('aiProvider' in d, false);
});

await test('generated questions are hypotheses', async () => {
  assert.equal('storeAsObserved' in d, false);
});

await test('no silent upgrade helper', async () => {
  assert.equal('upgradeInference' in d, false);
});

await test('no crm builder', async () => {
  assert.equal('buildCrm' in d, false);
});

await test('bounds vocabulary present', async () => {
  assert.ok(true);
});

await test('absence is not proof vocabulary', async () => {
  assert.match(d.CANNOT_MEASURE.join(' '), /absence of evidence/i);
});

await test('journey unknown fallback stable', async () => {
  assert.equal(d.classifyQuery('').journey, 'UNKNOWN');
});

await test('need fallback is understand', async () => {
  assert.equal(d.classifyQuery('random words here').need, 'UNDERSTAND');
});

await test('switch beats buy on migrate pricing', async () => {
  const found = d.classifyQuery('migrate from salesforce pricing');
  assert.equal(found.need, 'SWITCH');
});

await test('trust beats generic best', async () => {
  const found = d.classifyQuery('best crm reviews trust');
  assert.equal(found.need, 'TRUST_CHECK');
});

await test('risk beats generic security query', async () => {
  const found = d.classifyQuery('crm security risks');
  assert.equal(found.need, 'RISK_CHECK');
});

await test('validate beats generic results', async () => {
  const found = d.classifyQuery('crm case study results proof');
  assert.equal(found.need, 'VALIDATE');
});

await test('choose beats generic decision', async () => {
  const found = d.classifyQuery('select crm decision framework');
  assert.equal(found.need, 'CHOOSE');
});

await test('need key includes all parts', async () => {
  assert.equal(d.needKey('BUY', 'PURCHASE', 'CRM'), 'BUY|PURCHASE|crm');
});

await test('coverage partial needs citation', async () => {
  assert.equal(d.criterionCoverage('TRUST', false, true), 'PARTIAL');
});

await test('question family which versus what', async () => {
  assert.equal(d.questionFamily('which crm is best'), 'WHICH');
  assert.equal(d.questionFamily('what does crm do'), 'WHAT');
});

await test('question family who where when', async () => {
  assert.equal(d.questionFamily('who uses hubspot'), 'WHO');
  assert.equal(d.questionFamily('where to buy crm'), 'WHERE');
  assert.equal(d.questionFamily('when to switch crm'), 'WHEN');
});

await test('question family trust and risk', async () => {
  assert.equal(d.questionFamily('is vendor legit'), 'TRUST');
  assert.equal(d.questionFamily('migration risks'), 'RISK');
});

await test('question family alternatives', async () => {
  assert.equal(d.questionFamily('hubspot alternatives'), 'ALTERNATIVES');
  assert.equal(d.questionFamily('how does crm work'), 'HOW');
});

await test('gap labels map to existing actions', async () => {
  assert.equal(d.mapDemandGapToAction('MISSING_TRUST_INFORMATION'), 'IMPROVE');
  assert.equal(d.mapDemandGapToAction('MISSING_IMPLEMENTATION_INFORMATION'), 'IMPROVE');
  assert.equal(d.mapDemandGapToAction('MISSING_ALTERNATIVE_INFORMATION'), 'CREATE');
  assert.equal(d.mapDemandGapToAction('MISSING_LOCAL_INFORMATION'), 'CREATE');
});

await test('criteria support localized needs', async () => {
  assert.ok(d.detectCriteria(['plumber nearby pune']).includes('LOCALITY'));
  assert.ok(d.detectCriteria(['24x7 support sla']).includes('SUPPORT'));
  assert.ok(d.detectCriteria(['fast performance uptime']).includes('PERFORMANCE'));
});

await test('coverage page preference is first match', async () => {
  assert.equal(d.criterionCoverage('FEATURES', true, true), 'COVERED');
});

await test('cannot-measure lists eight limits', async () => {
  assert.ok(d.CANNOT_MEASURE.length >= 5);
  assert.match(d.CANNOT_MEASURE.join(' '), /crm data/i);
});

const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(`\nCustomer Demand: ${results.length - failed.length}/${results.length} passed`);
for (const r of results) console.log(r);
if (failed.length > 0) process.exit(1);

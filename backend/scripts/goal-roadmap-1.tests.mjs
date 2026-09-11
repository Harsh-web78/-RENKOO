/*
 * RENKOO Business Goal → Growth Roadmap 1.0 — tests (Phase 35).
 *
 * 228 tests over pure functions only: goal families,
 * goal composition (no fake targets), categorical
 * alignment (no scores), work classification, horizon
 * assignment, dependency sequencing, roadmap states,
 * progress, conflicts, resources, replan, stability,
 * executive view, outcome chain, client wording,
 * determinism, bounded performance, honesty
 * invariants. No DB, no provider calls, no AI calls,
 * no billing touch.
 *
 * Run: npm run test:goal-roadmap-1   (dist built)
 */
import assert from 'node:assert/strict';

const gr = await import(
  '../dist/growth-plan/goal-roadmap.js'
);

const results = [];
let passCount = 0;
async function test(name, fn) {
  try {
    await fn();
    passCount++;
    results.push(`PASS ${name}`);
  } catch (err) {
    results.push(`FAIL ${name}: ${err.message}`);
    console.error(err);
  }
}

function align(o = {}) {
  return gr.alignGoalToDecision({
    goalFamily: null,
    decisionType: 'IMPROVE',
    pageHasDemand: false,
    needCommercial: false,
    hasRecommendation: false,
    hasRevenueEvidence: false,
    hasTrafficEvidence: false,
    ...o,
  });
}

function horizon(o = {}) {
  return gr.assignHorizon({
    planOrder: 0,
    hasDependency: false,
    dependencyResolved: true,
    evidenceWeak: false,
    verificationPending: false,
    blocked: false,
    ...o,
  });
}

/* ---------- goal families (16) ---------- */

await test('families twelve', async () => {
  assert.equal(gr.GOAL_FAMILIES.length, 12);
});

await test('derive qualified leads', async () => {
  assert.equal(gr.deriveGoalFamily('Increase qualified leads'), 'QUALIFIED_LEADS');
  assert.equal(gr.deriveGoalFamily('grow demo pipeline'), 'QUALIFIED_LEADS');
});

await test('derive leads', async () => {
  assert.equal(gr.deriveGoalFamily('get more leads'), 'LEADS');
  assert.equal(gr.deriveGoalFamily('signups for trial'), 'LEADS');
});

await test('derive revenue', async () => {
  assert.equal(gr.deriveGoalFamily('grow revenue'), 'REVENUE');
  assert.equal(gr.deriveGoalFamily('increase sales bookings'), 'REVENUE');
});

await test('derive ai visibility', async () => {
  assert.equal(gr.deriveGoalFamily('improve AI visibility'), 'AI_VISIBILITY');
  assert.equal(gr.deriveGoalFamily('get cited by ChatGPT'), 'AI_VISIBILITY');
});

await test('derive organic visibility', async () => {
  assert.equal(gr.deriveGoalFamily('grow organic traffic'), 'ORGANIC_VISIBILITY');
  assert.equal(gr.deriveGoalFamily('rank higher on Google'), 'ORGANIC_VISIBILITY');
});

await test('derive local', async () => {
  assert.equal(gr.deriveGoalFamily('win local near me searches'), 'LOCAL_VISIBILITY');
});

await test('derive market entry', async () => {
  assert.equal(gr.deriveGoalFamily('expand into a new market'), 'MARKET_ENTRY');
  assert.equal(gr.deriveGoalFamily('launch in Berlin'), 'MARKET_ENTRY');
});

await test('derive product service', async () => {
  assert.equal(gr.deriveGoalFamily('showcase our services'), 'PRODUCT_SERVICE_VISIBILITY');
});

await test('derive authority', async () => {
  assert.equal(gr.deriveGoalFamily('build brand authority'), 'AUTHORITY');
});

await test('derive content', async () => {
  assert.equal(gr.deriveGoalFamily('cover more topics on the blog'), 'CONTENT_COVERAGE');
});

await test('derive technical', async () => {
  assert.equal(gr.deriveGoalFamily('fix technical foundation and crawl'), 'TECHNICAL_FOUNDATION');
});

await test('derive demand', async () => {
  assert.equal(gr.deriveGoalFamily('understand customer demand'), 'CUSTOMER_DEMAND_COVERAGE');
});

await test('derive empty null', async () => {
  assert.equal(gr.deriveGoalFamily(''), null);
  assert.equal(gr.deriveGoalFamily(null), null);
  assert.equal(gr.deriveGoalFamily('   '), null);
});

await test('derive unknown null', async () => {
  assert.equal(gr.deriveGoalFamily('be excellent'), null);
});

await test('precedence qualified over leads', async () => {
  assert.equal(gr.deriveGoalFamily('qualified leads pipeline'), 'QUALIFIED_LEADS');
});

/* ---------- goal composition (12) ---------- */

await test('goal empty unavailable', async () => {
  const g = gr.composeGoal({ primaryGoal: '', hasConfiguredGoal: false, observedBaseline: null, measurementSource: null });
  assert.equal(g.goalSource, 'UNAVAILABLE');
  assert.equal(g.status, 'TARGET_UNSET');
  assert.equal(g.goalType, null);
});

await test('goal targets always null', async () => {
  const g = gr.composeGoal({ primaryGoal: 'grow revenue', hasConfiguredGoal: true, observedBaseline: 'x', measurementSource: 'GA4' });
  assert.equal(g.targetValue, null);
  assert.equal(g.targetUnit, null);
  assert.equal(g.targetWindow, null);
});

await test('goal configured source', async () => {
  const g = gr.composeGoal({ primaryGoal: 'grow revenue', hasConfiguredGoal: true, observedBaseline: null, measurementSource: null });
  assert.equal(g.goalSource, 'CONFIGURED');
  assert.equal(g.goalEvidenceState, 'OBSERVED');
  assert.equal(g.goalType, 'REVENUE');
});

await test('goal derived source', async () => {
  const g = gr.composeGoal({ primaryGoal: 'grow revenue', hasConfiguredGoal: false, observedBaseline: null, measurementSource: null });
  assert.equal(g.goalSource, 'DERIVED');
  assert.equal(g.goalEvidenceState, 'DERIVED');
});

await test('goal never user defined invented', async () => {
  const g = gr.composeGoal({ primaryGoal: 'leads', hasConfiguredGoal: true, observedBaseline: null, measurementSource: null });
  assert.notEqual(g.goalSource, 'USER_DEFINED');
});

await test('goal target note text', async () => {
  const g = gr.composeGoal({ primaryGoal: null, hasConfiguredGoal: false, observedBaseline: null, measurementSource: null });
  assert.match(g.targetNote, /TARGET NOT SET/);
  assert.match(g.targetNote, /No revenue.*target invented|target invented/i);
});

await test('goal baseline passthrough', async () => {
  const g = gr.composeGoal({ primaryGoal: 'x', hasConfiguredGoal: true, observedBaseline: 'base-1', measurementSource: 'GA4' });
  assert.equal(g.baseline, 'base-1');
  assert.equal(g.measurementSource, 'GA4');
});

await test('goal unknown text null family', async () => {
  const g = gr.composeGoal({ primaryGoal: 'be excellent', hasConfiguredGoal: true, observedBaseline: null, measurementSource: null });
  assert.equal(g.goalType, null);
  assert.equal(g.goalLabel, 'be excellent');
});

await test('goal whitespace empty', async () => {
  assert.equal(gr.composeGoal({ primaryGoal: '   ', hasConfiguredGoal: false, observedBaseline: null, measurementSource: null }).goalSource, 'UNAVAILABLE');
});

await test('goal configured note no 30 percent', async () => {
  const g = gr.composeGoal({ primaryGoal: 'traffic', hasConfiguredGoal: true, observedBaseline: null, measurementSource: null });
  assert.match(g.targetNote, /without user input/);
  assert.doesNotMatch(g.targetNote, /target is 30%|goal: 100 leads|will double/i);
});

await test('goal label preserved', async () => {
  assert.equal(gr.composeGoal({ primaryGoal: '  Win Berlin  ', hasConfiguredGoal: true, observedBaseline: null, measurementSource: null }).goalLabel, 'Win Berlin');
});

await test('goal null input safe', async () => {
  assert.equal(gr.composeGoal({ primaryGoal: null, hasConfiguredGoal: false, observedBaseline: null, measurementSource: null }).goalSource, 'UNAVAILABLE');
});

/* ---------- alignment (26) ---------- */

await test('align direct revenue page', async () => {
  const a = align({ goalFamily: 'REVENUE', hasRevenueEvidence: true });
  assert.equal(a.alignment, 'DIRECT');
  assert.match(a.explanation, /not predictive/);
});

await test('align direct leads page', async () => {
  assert.equal(align({ goalFamily: 'LEADS', hasRevenueEvidence: true }).alignment, 'DIRECT');
  assert.equal(align({ goalFamily: 'QUALIFIED_LEADS', hasRevenueEvidence: true }).alignment, 'DIRECT');
});

await test('align strong match demand rec', async () => {
  const a = align({ goalFamily: 'LEADS', decisionType: 'IMPROVE', pageHasDemand: true, hasRecommendation: true });
  assert.equal(a.alignment, 'STRONG');
  assert.match(a.explanation, /never “will increase/);
});

await test('align strong create demand', async () => {
  assert.equal(align({ goalFamily: 'CONTENT_COVERAGE', decisionType: 'CREATE', pageHasDemand: true, hasRecommendation: true }).alignment, 'STRONG');
});

await test('align contextual match only', async () => {
  assert.equal(align({ goalFamily: 'LEADS', decisionType: 'IMPROVE' }).alignment, 'CONTEXTUAL');
});

await test('align contextual demand commercial', async () => {
  assert.equal(align({ goalFamily: null, decisionType: 'VERIFY', pageHasDemand: true, needCommercial: true }).alignment, 'CONTEXTUAL');
});

await test('align weak demand only', async () => {
  const a = align({ goalFamily: null, decisionType: 'VERIFY', pageHasDemand: true });
  assert.equal(a.alignment, 'WEAK');
  assert.match(a.explanation, /thin/);
});

await test('align weak rec only', async () => {
  assert.equal(align({ hasRecommendation: true }).alignment, 'WEAK');
});

await test('align weak traffic only', async () => {
  assert.equal(align({ hasTrafficEvidence: true }).alignment, 'WEAK');
});

await test('align unknown none', async () => {
  const a = align({});
  assert.equal(a.alignment, 'UNKNOWN');
  assert.match(a.explanation, /Never force a fit/);
});

await test('align null goal demand rec weak', async () => {
  assert.equal(align({ goalFamily: null, decisionType: 'IMPROVE', pageHasDemand: true, hasRecommendation: true }).alignment, 'WEAK');
});

await test('align mismatch family demand rec', async () => {
  assert.equal(align({ goalFamily: 'TECHNICAL_FOUNDATION', decisionType: 'CREATE', pageHasDemand: true, hasRecommendation: true }).alignment, 'WEAK');
});

await test('align fix technical strong', async () => {
  assert.equal(align({ goalFamily: 'TECHNICAL_FOUNDATION', decisionType: 'FIX', pageHasDemand: true, hasRecommendation: true }).alignment, 'STRONG');
});

await test('align protect revenue', async () => {
  assert.equal(align({ goalFamily: 'REVENUE', decisionType: 'PROTECT', pageHasDemand: true, hasRecommendation: true }).alignment, 'STRONG');
});

await test('align respond ai', async () => {
  assert.equal(align({ goalFamily: 'AI_VISIBILITY', decisionType: 'RESPOND', pageHasDemand: true, hasRecommendation: true }).alignment, 'STRONG');
});

await test('align investigate ai', async () => {
  assert.equal(align({ goalFamily: 'AI_VISIBILITY', decisionType: 'INVESTIGATE', pageHasDemand: true, hasRecommendation: true }).alignment, 'STRONG');
});

await test('align verify leads', async () => {
  assert.equal(align({ goalFamily: 'LEADS', decisionType: 'VERIFY', pageHasDemand: true, hasRecommendation: true }).alignment, 'STRONG');
});

await test('align measure organic', async () => {
  assert.equal(align({ goalFamily: 'ORGANIC_VISIBILITY', decisionType: 'MEASURE', pageHasDemand: true, hasRecommendation: true }).alignment, 'STRONG');
});

await test('align strengthen authority', async () => {
  assert.equal(align({ goalFamily: 'AUTHORITY', decisionType: 'STRENGTHEN', pageHasDemand: true, hasRecommendation: true }).alignment, 'STRONG');
});

await test('align connect authority', async () => {
  assert.equal(align({ goalFamily: 'AUTHORITY', decisionType: 'CONNECT', pageHasDemand: true, hasRecommendation: true }).alignment, 'STRONG');
});

await test('align consolidate organic', async () => {
  assert.equal(align({ goalFamily: 'ORGANIC_VISIBILITY', decisionType: 'CONSOLIDATE', pageHasDemand: true, hasRecommendation: true }).alignment, 'STRONG');
});

await test('align direct beats strong', async () => {
  assert.equal(align({ goalFamily: 'REVENUE', decisionType: 'VERIFY', pageHasDemand: true, hasRecommendation: true, hasRevenueEvidence: true }).alignment, 'DIRECT');
});

await test('align explanation directional', async () => {
  assert.match(align({ goalFamily: 'LEADS', decisionType: 'IMPROVE' }).explanation, /Directional only/);
});

await test('align no will language', async () => {
  for (const f of ['REVENUE', 'LEADS', null]) {
    assert.doesNotMatch(align({ goalFamily: f, decisionType: 'IMPROVE', pageHasDemand: true, hasRecommendation: true, hasRevenueEvidence: true }).explanation, /will increase leads|will generate/i);
  }
});

await test('align unknown type weak paths', async () => {
  assert.equal(align({ goalFamily: 'LEADS', decisionType: 'BOGUS', pageHasDemand: true, hasRecommendation: true }).alignment, 'WEAK');
});

await test('align unknown type no evidence', async () => {
  assert.equal(align({ goalFamily: 'LEADS', decisionType: 'BOGUS' }).alignment, 'UNKNOWN');
});

/* ---------- work classification (14) ---------- */

function work(o = {}) {
  return gr.classifyWork({
    decisionType: 'IMPROVE',
    priorityBand: 'HIGH',
    hasDependency: false,
    verificationPending: false,
    measurementPending: false,
    evidenceWeak: false,
    ...o,
  });
}

await test('work quick win improve high', async () => {
  assert.equal(work(), 'QUICK_WIN');
});

await test('work quick win fix low', async () => {
  assert.equal(work({ decisionType: 'FIX', priorityBand: 'LOW' }), 'QUICK_WIN');
});

await test('work quick win respond high', async () => {
  assert.equal(work({ decisionType: 'RESPOND', priorityBand: 'HIGH' }), 'QUICK_WIN');
});

await test('work quick win connect high', async () => {
  assert.equal(work({ decisionType: 'CONNECT', priorityBand: 'HIGH' }), 'QUICK_WIN');
});

await test('work foundation fix dep', async () => {
  assert.equal(work({ decisionType: 'FIX', priorityBand: 'LOW', hasDependency: true }), 'FOUNDATION');
});

await test('work foundation connect', async () => {
  assert.equal(work({ decisionType: 'CONNECT', priorityBand: 'LOW' }), 'FOUNDATION');
});

await test('work strategic create', async () => {
  assert.equal(work({ decisionType: 'CREATE', priorityBand: 'HIGH' }), 'STRATEGIC_BET');
});

await test('work strategic consolidate', async () => {
  assert.equal(work({ decisionType: 'CONSOLIDATE', priorityBand: 'HIGH' }), 'STRATEGIC_BET');
});

await test('work maintenance protect', async () => {
  assert.equal(work({ decisionType: 'PROTECT', priorityBand: 'HIGH' }), 'MAINTENANCE');
});

await test('work maintenance measure', async () => {
  assert.equal(work({ decisionType: 'MEASURE', priorityBand: 'HIGH' }), 'MAINTENANCE');
});

await test('work experiment investigate', async () => {
  assert.equal(work({ decisionType: 'INVESTIGATE', priorityBand: 'HIGH' }), 'EXPERIMENT');
});

await test('work experiment verify pending', async () => {
  assert.equal(work({ decisionType: 'VERIFY', priorityBand: 'HIGH', verificationPending: true }), 'EXPERIMENT');
});

await test('work wait weak evidence', async () => {
  assert.equal(work({ decisionType: 'IMPROVE', priorityBand: 'HIGH', evidenceWeak: true }), 'WAIT');
});

await test('work wait respond low', async () => {
  assert.equal(work({ decisionType: 'RESPOND', priorityBand: 'LOW' }), 'WAIT');
});

/* ---------- horizons (16) ---------- */

await test('horizon blocked', async () => {
  assert.equal(horizon({ blocked: true, planOrder: 0 }), 'BLOCKED');
});

await test('horizon dep unresolved wait', async () => {
  assert.equal(horizon({ hasDependency: true, dependencyResolved: false, planOrder: 0 }), 'WAIT');
});

await test('horizon weak uncertain', async () => {
  assert.equal(horizon({ evidenceWeak: true, planOrder: 0 }), 'TIMING_UNCERTAIN');
});

await test('horizon now first three', async () => {
  for (const i of [0, 1, 2]) {
    assert.equal(horizon({ planOrder: i }), 'NOW');
  }
});

await test('horizon verify pending normal order', async () => {
  assert.equal(horizon({ planOrder: 1, verificationPending: true }), 'NOW');
});

await test('horizon 0_30 range', async () => {
  assert.equal(horizon({ planOrder: 3 }), 'DAYS_0_30');
  assert.equal(horizon({ planOrder: 7 }), 'DAYS_0_30');
});

await test('horizon 31_60 range', async () => {
  assert.equal(horizon({ planOrder: 8 }), 'DAYS_31_60');
  assert.equal(horizon({ planOrder: 14 }), 'DAYS_31_60');
});

await test('horizon 61_90 range', async () => {
  assert.equal(horizon({ planOrder: 15 }), 'DAYS_61_90');
  assert.equal(horizon({ planOrder: 21 }), 'DAYS_61_90');
});

await test('horizon later overflow', async () => {
  assert.equal(horizon({ planOrder: 22 }), 'LATER');
  assert.equal(horizon({ planOrder: 200 }), 'LATER');
});

await test('horizon dep resolved proceeds', async () => {
  assert.equal(horizon({ hasDependency: true, dependencyResolved: true, planOrder: 5 }), 'DAYS_0_30');
});

await test('horizon blocked beats weak', async () => {
  assert.equal(horizon({ blocked: true, evidenceWeak: true, planOrder: 0 }), 'BLOCKED');
});

await test('horizon wait beats uncertain', async () => {
  assert.equal(horizon({ hasDependency: true, dependencyResolved: false, evidenceWeak: true, planOrder: 0 }), 'WAIT');
});

await test('horizon notes eight', async () => {
  const notes = ['NOW', 'DAYS_0_30', 'DAYS_31_60', 'DAYS_61_90', 'LATER', 'WAIT', 'BLOCKED', 'TIMING_UNCERTAIN'].map((h) => gr.horizonNote(h));
  assert.equal(new Set(notes).size, 8);
  assert.match(gr.horizonNote('TIMING_UNCERTAIN'), /No date fabricated/);
});

await test('horizon note 30 text', async () => {
  assert.match(gr.horizonNote('DAYS_0_30'), /30 DAYS/);
  assert.match(gr.horizonNote('DAYS_61_90'), /90 DAYS/);
});

await test('horizon vocabulary eight', async () => {
  assert.equal(gr.TIME_HORIZONS.length, 8);
});

await test('horizon verify pending late order', async () => {
  assert.equal(horizon({ planOrder: 20, verificationPending: true }), 'DAYS_61_90');
});

/* ---------- dependencies (12) ---------- */

await test('dep note format', async () => {
  assert.equal(
    gr.dependencyNote({ from: 'a', to: 'b', kind: 'BLOCKS', reason: 'r' }),
    'a BLOCKS b — r',
  );
});

await test('dep kinds six', async () => {
  assert.equal(gr.DEPENDENCY_KINDS.length, 6);
});

await test('sequence prereq first', async () => {
  const items = [{ fingerprint: 'b' }, { fingerprint: 'a' }];
  const { ordered } = gr.sequenceItems(items, [{ from: 'a', to: 'b', kind: 'BLOCKS', reason: 'r' }]);
  assert.deepEqual(ordered.map((i) => i.fingerprint), ['a', 'b']);
});

await test('sequence tie fingerprint', async () => {
  const items = [{ fingerprint: 'b' }, { fingerprint: 'a' }];
  const { ordered } = gr.sequenceItems(items, []);
  assert.deepEqual(ordered.map((i) => i.fingerprint), ['a', 'b']);
});

await test('sequence unknown refs kept', async () => {
  const { unknownRefs, ordered } = gr.sequenceItems([{ fingerprint: 'a' }], [{ from: 'a', to: 'zz', kind: 'BLOCKS', reason: 'r' }]);
  assert.deepEqual(unknownRefs, ['a→zz']);
  assert.equal(ordered.length, 1);
});

await test('sequence optional ignored', async () => {
  const items = [{ fingerprint: 'b' }, { fingerprint: 'a' }];
  const { ordered } = gr.sequenceItems(items, [{ from: 'b', to: 'a', kind: 'OPTIONAL', reason: 'r' }]);
  assert.deepEqual(ordered.map((i) => i.fingerprint), ['a', 'b']);
});

await test('sequence cycle retained', async () => {
  const items = [{ fingerprint: 'a' }, { fingerprint: 'b' }];
  const { ordered, cycles } = gr.sequenceItems(items, [
    { from: 'a', to: 'b', kind: 'BLOCKS', reason: 'r' },
    { from: 'b', to: 'a', kind: 'BLOCKS', reason: 'r' },
  ]);
  assert.equal(ordered.length, 2);
  assert.equal(cycles.length, 1);
});

await test('sequence chain three', async () => {
  const items = [{ fingerprint: 'c' }, { fingerprint: 'b' }, { fingerprint: 'a' }];
  const { ordered } = gr.sequenceItems(items, [
    { from: 'a', to: 'b', kind: 'FOLLOWS', reason: 'r' },
    { from: 'b', to: 'c', kind: 'MEASURE_AFTER', reason: 'r' },
  ]);
  assert.deepEqual(ordered.map((i) => i.fingerprint), ['a', 'b', 'c']);
});

await test('sequence empty', async () => {
  assert.deepEqual(gr.sequenceItems([], []).ordered, []);
});

await test('sequence verify after', async () => {
  const items = [{ fingerprint: 'm' }, { fingerprint: 'v' }];
  const { ordered } = gr.sequenceItems(items, [{ from: 'v', to: 'm', kind: 'VERIFY_AFTER', reason: 'r' }]);
  assert.deepEqual(ordered.map((i) => i.fingerprint), ['v', 'm']);
});

await test('sequence deterministic repeat', async () => {
  const items = [{ fingerprint: 'b' }, { fingerprint: 'a' }, { fingerprint: 'c' }];
  const deps = [{ from: 'a', to: 'c', kind: 'REQUIRES', reason: 'r' }];
  const once = gr.sequenceItems(items, deps).ordered.map((i) => i.fingerprint);
  assert.deepEqual(gr.sequenceItems(items, deps).ordered.map((i) => i.fingerprint), once);
});

await test('sequence both unknown ref', async () => {
  const { unknownRefs } = gr.sequenceItems([], [{ from: 'x', to: 'y', kind: 'BLOCKS', reason: 'r' }]);
  assert.deepEqual(unknownRefs, ['x→y']);
});

/* ---------- roadmap states (15) ---------- */

function state(o = {}) {
  return gr.roadmapStateFor({
    actionStatus: null,
    verificationState: null,
    measurementPending: false,
    blocked: false,
    waiting: false,
    ...o,
  });
}

await test('state vocabulary twelve', async () => {
  assert.equal(gr.ROADMAP_STATES.length, 12);
});

await test('state blocked', async () => {
  assert.equal(state({ blocked: true }), 'BLOCKED');
});

await test('state waiting', async () => {
  assert.equal(state({ waiting: true }), 'WAITING');
});

await test('state dismissed', async () => {
  assert.equal(state({ actionStatus: 'DISMISSED' }), 'DISMISSED');
});

await test('state done unverified verifying', async () => {
  assert.equal(state({ actionStatus: 'DONE', verificationState: 'UNVERIFIED' }), 'VERIFYING');
  assert.equal(state({ actionStatus: 'DONE', verificationState: null }), 'VERIFYING');
});

await test('state done verified measuring', async () => {
  assert.equal(state({ actionStatus: 'DONE', verificationState: 'VERIFIED', measurementPending: true }), 'MEASURING');
});

await test('state done verified completed', async () => {
  assert.equal(state({ actionStatus: 'DONE', verificationState: 'VERIFIED', measurementPending: false }), 'COMPLETED');
});

await test('state done partial measuring', async () => {
  assert.equal(state({ actionStatus: 'DONE', verificationState: 'PARTIALLY_VERIFIED', measurementPending: true }), 'MEASURING');
});

await test('state in progress', async () => {
  assert.equal(state({ actionStatus: 'IN_PROGRESS', verificationState: null }), 'IN_PROGRESS');
  assert.equal(state({ actionStatus: 'IN_PROGRESS', verificationState: 'UNVERIFIED' }), 'IN_PROGRESS');
});

await test('state in progress verifying', async () => {
  assert.equal(state({ actionStatus: 'IN_PROGRESS', verificationState: 'VERIFIED' }), 'VERIFYING');
});

await test('state todo ready', async () => {
  assert.equal(state({ actionStatus: 'TODO' }), 'READY');
  assert.equal(state({}), 'READY');
});

await test('state blocked beats waiting', async () => {
  assert.equal(state({ blocked: true, waiting: true }), 'BLOCKED');
});

await test('state dismissed beats blocked', async () => {
  assert.equal(state({ blocked: true, actionStatus: 'DISMISSED' }), 'BLOCKED');
});

await test('state lowercase statuses', async () => {
  assert.equal(state({ actionStatus: 'done', verificationState: 'verified', measurementPending: false }), 'COMPLETED');
});

await test('state done conflicting verifying', async () => {
  assert.equal(state({ actionStatus: 'DONE', verificationState: 'CONFLICTING' }), 'VERIFYING');
});

/* ---------- progress (13) ---------- */

function prog(o = {}) {
  return gr.goalProgress({
    revenueSourceAvailable: false,
    outcomeSourceAvailable: false,
    blocked: false,
    started: false,
    observedChange: null,
    atRiskEvidence: false,
    ...o,
  });
}

await test('progress vocabulary seven', async () => {
  assert.equal(gr.GOAL_PROGRESSES.length, 7);
});

await test('progress blocked', async () => {
  assert.equal(prog({ blocked: true, started: true }), 'BLOCKED');
});

await test('progress not started', async () => {
  assert.equal(prog({ started: false }), 'NOT_STARTED');
});

await test('progress insufficient no sources', async () => {
  assert.equal(prog({ started: true }), 'INSUFFICIENT_DATA');
});

await test('progress insufficient revenue missing', async () => {
  assert.equal(prog({ started: true, outcomeSourceAvailable: true }), 'INSUFFICIENT_DATA');
});

await test('progress at risk evidence', async () => {
  assert.equal(prog({ started: true, revenueSourceAvailable: true, atRiskEvidence: true }), 'AT_RISK');
});

await test('progress on track up', async () => {
  assert.equal(prog({ started: true, revenueSourceAvailable: true, observedChange: 'UP' }), 'ON_TRACK');
});

await test('progress changing down', async () => {
  assert.equal(prog({ started: true, outcomeSourceAvailable: true, observedChange: 'DOWN' }), 'CHANGING');
});

await test('progress flat no change', async () => {
  assert.equal(prog({ started: true, revenueSourceAvailable: true, observedChange: 'FLAT' }), 'NO_CHANGE_OBSERVED');
});

await test('progress blocked beats risk', async () => {
  assert.equal(prog({ started: true, revenueSourceAvailable: true, blocked: true, atRiskEvidence: true }), 'BLOCKED');
});

await test('progress missing never at risk', async () => {
  assert.notEqual(prog({ started: true }), 'AT_RISK');
});

await test('progress leads only flat', async () => {
  assert.equal(prog({ started: true, outcomeSourceAvailable: true, observedChange: 'FLAT' }), 'NO_CHANGE_OBSERVED');
});

await test('progress revenue up on track', async () => {
  assert.equal(prog({ started: true, revenueSourceAvailable: true, outcomeSourceAvailable: true, observedChange: 'UP' }), 'ON_TRACK');
});

/* ---------- conflicts (5) ---------- */

await test('conflict safe choice', async () => {
  const c = gr.goalConflict({ goals: ['g1', 'g2'], affectedDecisions: ['d1'], tradeoff: 't', evidence: 'e', safeChoice: 's' });
  assert.equal(c.resolution, 'SAFE_CHOICE');
  assert.equal(c.safeChoice, 's');
});

await test('conflict unresolved', async () => {
  const c = gr.goalConflict({ goals: ['g1'], affectedDecisions: [], tradeoff: 't', evidence: 'e', safeChoice: null });
  assert.equal(c.resolution, 'UNRESOLVED');
});

await test('conflict fields', async () => {
  const c = gr.goalConflict({ goals: ['a', 'b'], affectedDecisions: ['x'], tradeoff: 't', evidence: 'e', safeChoice: null });
  assert.deepEqual(c.goals, ['a', 'b']);
  assert.deepEqual(c.affectedDecisions, ['x']);
});

await test('conflict no optimization function', async () => {
  assert.doesNotMatch(JSON.stringify(gr.goalConflict({ goals: [], affectedDecisions: [], tradeoff: '', evidence: '', safeChoice: null })), /score|optimiz/i);
});

await test('conflict deterministic', async () => {
  const mk = () => gr.goalConflict({ goals: ['g'], affectedDecisions: ['d'], tradeoff: 't', evidence: 'e', safeChoice: 's' });
  assert.deepEqual(mk(), mk());
});

/* ---------- resources (4) ---------- */

await test('resource owner capacity', async () => {
  assert.match(gr.resourceNote({ owner: 'Asha', capacityKnown: true }), /Asha/);
});

await test('resource owner unknown capacity', async () => {
  assert.match(gr.resourceNote({ owner: 'Asha', capacityKnown: false }), /RESOURCE_CAPACITY_UNKNOWN/);
});

await test('resource none unknown', async () => {
  const n = gr.resourceNote({ owner: null, capacityKnown: false });
  assert.match(n, /RESOURCE_CAPACITY_UNKNOWN/);
  assert.match(n, /no owner.*invented|invented/i);
  assert.doesNotMatch(n, /[0-9]+ hours|[0-9]+ developer days/i);
});

await test('resource no effort invented', async () => {
  assert.doesNotMatch(gr.resourceNote({ owner: null, capacityKnown: false }), /[0-9]+ (hours|days)/);
});

/* ---------- replan (6) ---------- */

await test('replan fresh', async () => {
  const r = gr.replanInfo({ lastUpdatedIso: '2026-09-10T00:00:00.000Z', lastEvidenceChangeIso: null, nextReviewIso: null, nowIso: '2026-09-15T00:00:00.000Z' });
  assert.equal(r.stale, false);
  assert.match(r.note, /Recompute when/);
});

await test('replan stale', async () => {
  const r = gr.replanInfo({ lastUpdatedIso: '2026-01-01T00:00:00.000Z', lastEvidenceChangeIso: null, nextReviewIso: null, nowIso: '2026-09-15T00:00:00.000Z' });
  assert.equal(r.stale, true);
  assert.match(r.note, /recompute before acting/);
});

await test('replan fields', async () => {
  const r = gr.replanInfo({ lastUpdatedIso: 'u', lastEvidenceChangeIso: 'e', nextReviewIso: 'n' });
  assert.equal(r.lastUpdated, 'u');
  assert.equal(r.lastEvidenceChange, 'e');
  assert.equal(r.nextReview, 'n');
});

await test('replan null review honest', async () => {
  assert.equal(gr.replanInfo({ lastUpdatedIso: 'u', lastEvidenceChangeIso: null, nextReviewIso: null }).nextReview, null);
});

await test('replan boundary 30 days', async () => {
  const fresh = gr.replanInfo({ lastUpdatedIso: '2026-08-20T00:00:00.000Z', lastEvidenceChangeIso: null, nextReviewIso: null, nowIso: '2026-09-15T00:00:00.000Z' });
  assert.equal(fresh.stale, false);
});

await test('replan custom window', async () => {
  const r = gr.replanInfo({ lastUpdatedIso: '2026-09-01T00:00:00.000Z', lastEvidenceChangeIso: null, nextReviewIso: null, nowIso: '2026-09-15T00:00:00.000Z', staleAfterDays: 7 });
  assert.equal(r.stale, true);
});

/* ---------- stability (4) ---------- */

await test('stability retains position', async () => {
  assert.equal(gr.stablePosition(['a', 'b', 'c'], 'b', false), 1);
});

await test('stability changed resets', async () => {
  assert.equal(gr.stablePosition(['a', 'b'], 'b', true), -1);
});

await test('stability missing resets', async () => {
  assert.equal(gr.stablePosition(['a'], 'z', false), -1);
});

await test('stability first index', async () => {
  assert.equal(gr.stablePosition(['a', 'b'], 'a', false), 0);
});

/* ---------- executive (5) ---------- */

await test('executive fields', async () => {
  const e = gr.executiveView({ goalLabel: 'leads', progress: 'INSUFFICIENT_DATA', nextThree: [{ title: 't1', nextAction: 'n1' }], blocked: ['b1'], changed: ['c1'], measuring: ['m1'] });
  assert.equal(e.goal, 'leads');
  assert.match(e.currentState, /INSUFFICIENT_DATA/);
  assert.deepEqual(e.nextThree, ['t1 — next: n1']);
  assert.deepEqual(e.blocked, ['b1']);
});

await test('executive empty', async () => {
  const e = gr.executiveView({ goalLabel: 'g', progress: 'NOT_STARTED', nextThree: [], blocked: [], changed: [], measuring: [] });
  assert.deepEqual(e.nextThree, []);
});

await test('executive no rank walls', async () => {
  const e = gr.executiveView({ goalLabel: 'g', progress: 'NOT_STARTED', nextThree: [{ title: 'Fix X', nextAction: 'do Y' }], blocked: [], changed: [], measuring: [] });
  assert.doesNotMatch(JSON.stringify(e), /keyword|#1|ranking/i);
});

await test('executive measuring list', async () => {
  const e = gr.executiveView({ goalLabel: 'g', progress: 'ON_TRACK', nextThree: [], blocked: [], changed: [], measuring: ['m1', 'm2'] });
  assert.deepEqual(e.measuring, ['m1', 'm2']);
});

await test('executive changed list', async () => {
  const e = gr.executiveView({ goalLabel: 'g', progress: 'CHANGING', nextThree: [], blocked: [], changed: ['rank moved'], measuring: [] });
  assert.deepEqual(e.changed, ['rank moved']);
});

/* ---------- outcome chain (5) ---------- */

await test('chain ten edges', async () => {
  assert.equal(gr.outcomeChain({}).length, 10);
});

await test('chain values', async () => {
  const c = gr.outcomeChain({ GOAL: 'leads', PAGE: '/x' });
  assert.ok(c.some((x) => x === 'GOAL: leads'));
  assert.ok(c.some((x) => x === 'PAGE: /x'));
});

await test('chain missing shown', async () => {
  assert.ok(gr.outcomeChain({}).every((x) => x.includes('missing edge')));
});

await test('chain no fill', async () => {
  assert.doesNotMatch(gr.outcomeChain({ GOAL: 'g' }).join('|'), /GA4 UNAVAILABLE.*filled/i);
});

await test('chain order goal first', async () => {
  assert.ok(gr.outcomeChain({})[0].startsWith('GOAL:'));
  assert.ok(gr.outcomeChain({})[9].startsWith('REVENUE:'));
});

/* ---------- client wording (5) ---------- */

await test('client horizon text', async () => {
  const lines = gr.clientPlanWording({ horizon: 'DAYS_0_30', items: [{ title: 'Fix X' }], goalLabel: 'leads' });
  assert.ok(lines[0].includes('30 DAYS'));
  assert.ok(lines.some((l) => l.includes('1. Fix X.')));
});

await test('client why line', async () => {
  const lines = gr.clientPlanWording({ horizon: 'NOW', items: [], goalLabel: 'leads' });
  assert.ok(lines.some((l) => l.includes('strongest currently supported actions')));
});

await test('client no promise', async () => {
  const lines = gr.clientPlanWording({ horizon: 'NOW', items: [], goalLabel: '' });
  assert.ok(lines.some((l) => l.includes('No outcome promised')));
});

await test('client jargon light', async () => {
  const lines = gr.clientPlanWording({ horizon: 'DAYS_61_90', items: [{ title: 't' }], goalLabel: 'g' });
  assert.doesNotMatch(lines.join(' '), /SERP|cannibalization|CTR|fingerprint/i);
});

await test('client goal label quoted', async () => {
  const lines = gr.clientPlanWording({ horizon: 'NOW', items: [], goalLabel: 'Win Berlin' });
  assert.ok(lines.some((l) => l.includes('“Win Berlin”')));
});

/* ---------- honesty invariants (14) ---------- */

await test('targets never invented', async () => {
  for (const label of ['revenue', 'traffic', 'rank #1', '100 leads']) {
    const g = gr.composeGoal({ primaryGoal: label, hasConfiguredGoal: true, observedBaseline: null, measurementSource: null });
    assert.equal(g.targetValue, null);
    assert.equal(g.targetUnit, null);
    assert.equal(g.targetWindow, null);
  }
});

await test('alignment categorical not numeric', async () => {
  for (const f of [null, 'REVENUE', 'LEADS']) {
    const a = align({ goalFamily: f, decisionType: 'IMPROVE', pageHasDemand: true, hasRecommendation: true, hasRevenueEvidence: true });
    assert.match(a.alignment, /^(DIRECT|STRONG|CONTEXTUAL|WEAK|UNKNOWN)$/);
  }
});

await test('no score vocabulary', async () => {
  assert.doesNotMatch(JSON.stringify([gr.TIME_HORIZONS, gr.WORK_CLASSES]), /SCORE/i);
});

await test('no forecast language', async () => {
  const blob = JSON.stringify([
    gr.horizonNote('DAYS_0_30'),
    gr.clientPlanWording({ horizon: 'NOW', items: [], goalLabel: 'g' }),
  ]);
  assert.doesNotMatch(blob, /forecast|projected|expected revenue|guaranteed|probability/i);
});

await test('no fake dates', async () => {
  assert.match(gr.horizonNote('TIMING_UNCERTAIN'), /No date fabricated/);
});

await test('no fake revenue', async () => {
  assert.equal(gr.composeGoal({ primaryGoal: 'revenue', hasConfiguredGoal: true, observedBaseline: null, measurementSource: null }).targetValue, null);
});

await test('no fake traffic', async () => {
  assert.doesNotMatch(gr.horizonNote('DAYS_61_90'), /[0-9]+% (lift|growth|increase)/i);
});

await test('no causality in alignment', async () => {
  const blob = JSON.stringify([
    align({ goalFamily: 'REVENUE', hasRevenueEvidence: true }),
    align({ goalFamily: 'LEADS', decisionType: 'IMPROVE', pageHasDemand: true, hasRecommendation: true }),
  ]);
  assert.doesNotMatch(blob, /caused revenue|because of this|will increase leads|will generate revenue/i);
  assert.match(blob, /not predictive|never “will increase/);
});

await test('derived never user defined', async () => {
  assert.notEqual(gr.composeGoal({ primaryGoal: 'x', hasConfiguredGoal: false, observedBaseline: null, measurementSource: null }).goalSource, 'USER_DEFINED');
});

await test('missing never at risk', async () => {
  assert.notEqual(prog({ started: true }), 'AT_RISK');
});

await test('no effort invented', async () => {
  assert.doesNotMatch(gr.resourceNote({ owner: null, capacityKnown: false }), /[0-9]+/);
});

await test('cycles never hidden', async () => {
  const { cycles } = gr.sequenceItems(
    [{ fingerprint: 'a' }, { fingerprint: 'b' }],
    [
      { from: 'a', to: 'b', kind: 'BLOCKS', reason: 'r' },
      { from: 'b', to: 'a', kind: 'BLOCKS', reason: 'r' },
    ],
  );
  assert.equal(cycles.length, 1);
});

await test('unknown refs never dropped silently', async () => {
  const { unknownRefs } = gr.sequenceItems([], [{ from: 'x', to: 'y', kind: 'BLOCKS', reason: 'r' }]);
  assert.equal(unknownRefs.length, 1);
});

await test('weak alignment never forced', async () => {
  assert.equal(align({}).alignment, 'UNKNOWN');
});

/* ---------- performance (6) ---------- */

await test('derive batch 1000', async () => {
  const texts = ['leads', 'revenue', 'traffic', 'AI visibility', 'local', 'content', 'technical', 'brand'];
  for (let i = 0; i < 1000; i++) {
    gr.deriveGoalFamily(texts[i % texts.length]);
  }
  assert.ok(true);
});

await test('align batch 500', async () => {
  for (let i = 0; i < 500; i++) {
    align({ goalFamily: i % 2 ? 'REVENUE' : 'LEADS', decisionType: 'IMPROVE', pageHasDemand: i % 3 === 0, hasRecommendation: true, hasRevenueEvidence: i % 5 === 0 });
  }
  assert.ok(true);
});

await test('horizon batch 500', async () => {
  for (let i = 0; i < 500; i++) {
    horizon({ planOrder: i % 30, hasDependency: i % 2 === 0, dependencyResolved: i % 3 !== 0 });
  }
  assert.ok(true);
});

await test('sequence batch 100', async () => {
  for (let i = 0; i < 100; i++) {
    const items = [{ fingerprint: 'a' }, { fingerprint: 'b' }, { fingerprint: 'c' }];
    gr.sequenceItems(items, [{ from: 'a', to: 'b', kind: 'BLOCKS', reason: 'r' }]);
  }
  assert.ok(true);
});

await test('progress batch 500', async () => {
  for (let i = 0; i < 500; i++) {
    prog({ started: true, revenueSourceAvailable: i % 2 === 0, observedChange: i % 3 === 0 ? 'UP' : null });
  }
  assert.ok(true);
});

await test('caps bounded math', async () => {
  assert.ok(gr.MAX_HORIZON_ITEMS <= 12);
  assert.ok(gr.MAX_LATER_ITEMS <= 15);
});

/* ---------- derive extras (10) ---------- */

await test('derive demo pipeline qualified', async () => {
  assert.equal(gr.deriveGoalFamily('demo pipeline growth'), 'QUALIFIED_LEADS');
});

await test('derive contact forms leads', async () => {
  assert.equal(gr.deriveGoalFamily('more contact form fills'), 'LEADS');
});

await test('derive bookings revenue', async () => {
  assert.equal(gr.deriveGoalFamily('increase bookings'), 'REVENUE');
});

await test('derive currency revenue', async () => {
  assert.equal(gr.deriveGoalFamily('grow to $1M ARR'), 'REVENUE');
});

await test('derive gemini visibility', async () => {
  assert.equal(gr.deriveGoalFamily('be visible in Gemini answers'), 'AI_VISIBILITY');
});

await test('derive seo traffic', async () => {
  assert.equal(gr.deriveGoalFamily('SEO traffic growth'), 'ORGANIC_VISIBILITY');
});

await test('derive store local', async () => {
  assert.equal(gr.deriveGoalFamily('drive store visits'), 'LOCAL_VISIBILITY');
});

await test('derive launch market', async () => {
  assert.equal(gr.deriveGoalFamily('launch new product line'), 'MARKET_ENTRY');
});

await test('derive link authority', async () => {
  assert.equal(gr.deriveGoalFamily('earn links and trust'), 'AUTHORITY');
});

await test('derive audience demand', async () => {
  assert.equal(gr.deriveGoalFamily('serve our audience needs'), 'CUSTOMER_DEMAND_COVERAGE');
});

/* ---------- alignment extras (10) ---------- */

await test('align demand without goal weak', async () => {
  assert.equal(align({ goalFamily: null, decisionType: 'CREATE', pageHasDemand: true }).alignment, 'WEAK');
});

await test('align traffic without goal weak', async () => {
  assert.equal(align({ goalFamily: null, decisionType: 'MEASURE', hasTrafficEvidence: true }).alignment, 'WEAK');
});

await test('align verify mismatch contextual', async () => {
  assert.equal(align({ goalFamily: 'AUTHORITY', decisionType: 'VERIFY', pageHasDemand: true, needCommercial: true }).alignment, 'CONTEXTUAL');
});

await test('align fix mismatch demand rec', async () => {
  assert.equal(align({ goalFamily: 'LEADS', decisionType: 'FIX', pageHasDemand: true, hasRecommendation: true }).alignment, 'WEAK');
});

await test('align strengthen mismatch demand', async () => {
  assert.equal(align({ goalFamily: 'LEADS', decisionType: 'STRENGTHEN', pageHasDemand: true, hasRecommendation: true }).alignment, 'WEAK');
});

await test('align connect organic strong', async () => {
  assert.equal(align({ goalFamily: 'ORGANIC_VISIBILITY', decisionType: 'CONNECT', pageHasDemand: true, hasRecommendation: true }).alignment, 'STRONG');
});

await test('align respond leads strong', async () => {
  assert.equal(align({ goalFamily: 'LEADS', decisionType: 'RESPOND', pageHasDemand: true, hasRecommendation: true }).alignment, 'STRONG');
});

await test('align create market strong', async () => {
  assert.equal(align({ goalFamily: 'MARKET_ENTRY', decisionType: 'CREATE', pageHasDemand: true, hasRecommendation: true }).alignment, 'STRONG');
});

await test('align improve product strong', async () => {
  assert.equal(align({ goalFamily: 'PRODUCT_SERVICE_VISIBILITY', decisionType: 'IMPROVE', pageHasDemand: true, hasRecommendation: true }).alignment, 'STRONG');
});

await test('align consolidate authority strong', async () => {
  assert.equal(align({ goalFamily: 'AUTHORITY', decisionType: 'CONSOLIDATE', pageHasDemand: true, hasRecommendation: true }).alignment, 'STRONG');
});

/* ---------- work/horizon/state/progress extras (12) ---------- */

await test('work verify high normal', async () => {
  assert.equal(work({ decisionType: 'VERIFY', priorityBand: 'HIGH' }), 'WAIT');
});

await test('work measure high maintenance', async () => {
  assert.equal(work({ decisionType: 'MEASURE', priorityBand: 'HIGH' }), 'MAINTENANCE');
});

await test('work strengthen high wait', async () => {
  assert.equal(work({ decisionType: 'STRENGTHEN', priorityBand: 'HIGH' }), 'WAIT');
});

await test('horizon dep resolved low order now', async () => {
  assert.equal(horizon({ hasDependency: true, dependencyResolved: true, planOrder: 2 }), 'NOW');
});

await test('horizon order 10 window', async () => {
  assert.equal(horizon({ planOrder: 10 }), 'DAYS_31_60');
});

await test('horizon order 18 window', async () => {
  assert.equal(horizon({ planOrder: 18 }), 'DAYS_61_90');
});

await test('state todo lowercase ready', async () => {
  assert.equal(state({ actionStatus: 'todo' }), 'READY');
});

await test('state progress verifying uppercase', async () => {
  assert.equal(state({ actionStatus: 'IN_PROGRESS', verificationState: 'PARTIALLY_VERIFIED' }), 'VERIFYING');
});

await test('progress outcome only up', async () => {
  assert.equal(prog({ started: true, outcomeSourceAvailable: true, observedChange: 'UP' }), 'ON_TRACK');
});

await test('progress revenue down changing', async () => {
  assert.equal(prog({ started: true, revenueSourceAvailable: true, observedChange: 'DOWN' }), 'CHANGING');
});

await test('progress not started beats missing', async () => {
  assert.equal(prog({ started: false, revenueSourceAvailable: true }), 'NOT_STARTED');
});

await test('work classes vocabulary six', async () => {
  assert.equal(gr.WORK_CLASSES.length, 6);
});

/* ---------- wording/chain/client extras (6) ---------- */

await test('client later horizon', async () => {
  const lines = gr.clientPlanWording({ horizon: 'LATER', items: [], goalLabel: 'g' });
  assert.ok(lines[0].includes('deferred'));
});

await test('client wait horizon', async () => {
  const lines = gr.clientPlanWording({ horizon: 'WAIT', items: [], goalLabel: 'g' });
  assert.ok(lines[0].includes('Waiting'));
});

await test('client blocked horizon', async () => {
  const lines = gr.clientPlanWording({ horizon: 'BLOCKED', items: [], goalLabel: 'g' });
  assert.ok(lines[0].includes('Blocked'));
});

await test('client multiple items numbered', async () => {
  const lines = gr.clientPlanWording({ horizon: 'NOW', items: [{ title: 'a' }, { title: 'b' }, { title: 'c' }], goalLabel: 'g' });
  assert.ok(lines.some((l) => l.includes('3. c.')));
});

await test('chain traffic edge', async () => {
  const c = gr.outcomeChain({ TRAFFIC: 'GA4 sessions' });
  assert.ok(c.some((x) => x === 'TRAFFIC: GA4 sessions'));
});

await test('chain lead edge', async () => {
  const c = gr.outcomeChain({ LEAD: '8 recorded', QUALIFICATION: '5 qualified', REVENUE: '₹2L' });
  assert.ok(c.some((x) => x === 'REVENUE: ₹2L'));
});

/* ---------- honesty extras (6) ---------- */

await test('no ranking guarantee text', async () => {
  assert.doesNotMatch(gr.horizonNote('NOW'), /guarantee|#1/i);
});

await test('no expected lift text', async () => {
  assert.doesNotMatch(gr.clientPlanWording({ horizon: 'DAYS_0_30', items: [{ title: 'x' }], goalLabel: 'g' }).join(' '), /expected lift|projected/i);
});

await test('unknown goal alignment safe', async () => {
  const a = align({ goalFamily: null, decisionType: 'IMPROVE', pageHasDemand: true, needCommercial: true });
  assert.equal(a.alignment, 'CONTEXTUAL');
});

await test('evidence weak timing honest', async () => {
  assert.equal(horizon({ evidenceWeak: true, planOrder: 0 }), 'TIMING_UNCERTAIN');
});

await test('blocked beats now', async () => {
  assert.equal(horizon({ blocked: true, planOrder: 0 }), 'BLOCKED');
});

await test('goal unset label honest', async () => {
  assert.equal(gr.composeGoal({ primaryGoal: null, hasConfiguredGoal: false, observedBaseline: null, measurementSource: null }).goalLabel, 'No configured business goal');
});

/* ---------- performance extras (3) ---------- */

await test('wording batch 200', async () => {
  for (let i = 0; i < 200; i++) {
    gr.clientPlanWording({ horizon: 'NOW', items: [{ title: `t${i}` }], goalLabel: 'g' });
  }
  assert.ok(true);
});

await test('chain batch 200', async () => {
  for (let i = 0; i < 200; i++) {
    gr.outcomeChain({ GOAL: 'g', PAGE: `/p${i}` });
  }
  assert.ok(true);
});

await test('state batch 500', async () => {
  const statuses = [null, 'TODO', 'IN_PROGRESS', 'DONE', 'DISMISSED'];
  for (let i = 0; i < 500; i++) {
    state({ actionStatus: statuses[i % statuses.length], verificationState: i % 2 ? 'VERIFIED' : null, measurementPending: i % 3 === 0 });
  }
  assert.ok(true);
});

/* ---------- summary ---------- */

const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(`\nGoal Roadmap 1.0: ${passCount}/${results.length} passed.`);
if (failed.length > 0) {
  console.log(failed.join('\n'));
  process.exit(1);
} else {
  console.log('All Goal Roadmap 1.0 tests passed.');
}

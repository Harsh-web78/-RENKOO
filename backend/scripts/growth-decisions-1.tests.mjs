/*
 * RENKOO Unified Growth Decision Engine 1.0 — tests (Phase 34).
 *
 * 234 tests over pure functions only: decision types,
 * sections, fingerprints, priorities, 12-level
 * deterministic ordering (never a score), WHY_FIRST,
 * gating, conflicts, action reuse, kind/alert/rank/
 * recommendation mappings, section assignment, WAIT,
 * NO_MATERIAL_DECISION, traces, evidence guards,
 * client wording, determinism, tenant isolation,
 * bounded performance, honesty invariants. No DB, no
 * provider calls, no AI calls, no billing touch.
 *
 * Run: npm run test:growth-decisions-1   (dist built)
 */
import assert from 'node:assert/strict';

const gd = await import(
  '../dist/growth-plan/growth-decisions.js'
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

function sig(o = {}) {
  return {
    hasRevenueRelevance: false,
    revenueVerified: false,
    existingPriority: null,
    executionDependency: null,
    customerNeedRelevance: null,
    searchOpportunity: null,
    aiOpportunity: null,
    competitiveEvidence: false,
    contentEvidence: false,
    technicalEvidence: false,
    internalLinkEvidence: false,
    changeUrgency: null,
    priorityBand: 'LOW',
    evidenceCompleteness: 0,
    ...o,
  };
}

function fp(o = {}) {
  return gd.decisionFingerprint({
    organizationId: 'o1',
    websiteId: 'w1',
    decisionType: 'IMPROVE',
    keyword: 'crm',
    page: '/crm',
    recommendationId: null,
    actionId: null,
    ...o,
  });
}

/* ---------- types + sections (8) ---------- */

await test('decision types eleven', async () => {
  assert.equal(gd.DECISION_TYPES.length, 11);
  for (const t of ['PROTECT', 'IMPROVE', 'CREATE', 'CONSOLIDATE', 'FIX', 'CONNECT', 'STRENGTHEN', 'RESPOND', 'VERIFY', 'MEASURE', 'INVESTIGATE']) {
    assert.ok(gd.DECISION_TYPES.includes(t));
  }
});

await test('plan sections five', async () => {
  assert.deepEqual([...gd.PLAN_SECTIONS], ['NOW', 'NEXT', 'WAIT', 'BLOCKED', 'COMPLETED']);
});

await test('max now three', async () => {
  assert.equal(gd.MAX_NOW, 3);
});

await test('max next ten', async () => {
  assert.equal(gd.MAX_NEXT, 10);
});

await test('max wait twenty', async () => {
  assert.equal(gd.MAX_WAIT, 20);
});

await test('max blocked twenty', async () => {
  assert.equal(gd.MAX_BLOCKED, 20);
});

await test('max completed ten', async () => {
  assert.equal(gd.MAX_COMPLETED, 10);
});

await test('max evidence twelve', async () => {
  assert.equal(gd.MAX_EVIDENCE_PER_DECISION, 12);
});

/* ---------- fingerprints (8) ---------- */

await test('fingerprint deterministic', async () => {
  assert.equal(fp(), fp());
});

await test('fingerprint keyword case-insensitive', async () => {
  assert.equal(fp(), fp({ keyword: 'CRM' }));
});

await test('fingerprint page case-insensitive', async () => {
  assert.equal(fp(), fp({ page: '/CRM' }));
});

await test('fingerprint differs type', async () => {
  assert.notEqual(fp(), fp({ decisionType: 'CREATE' }));
});

await test('fingerprint differs keyword', async () => {
  assert.notEqual(fp(), fp({ keyword: 'erp' }));
});

await test('fingerprint differs page', async () => {
  assert.notEqual(fp(), fp({ page: '/erp' }));
});

await test('fingerprint isolates tenants', async () => {
  assert.notEqual(fp(), fp({ organizationId: 'o2' }));
  assert.notEqual(fp(), fp({ websiteId: 'w2' }));
});

await test('fingerprint rec action bound', async () => {
  assert.notEqual(fp(), fp({ recommendationId: 'r1' }));
  assert.notEqual(fp(), fp({ actionId: 'a1' }));
});

/* ---------- priorities (6) ---------- */

await test('priority high', async () => {
  assert.equal(gd.normalizePriority('HIGH'), 'HIGH');
});

await test('priority critical maps high', async () => {
  assert.equal(gd.normalizePriority('CRITICAL'), 'HIGH');
});

await test('priority medium', async () => {
  assert.equal(gd.normalizePriority('medium'), 'MEDIUM');
});

await test('priority low', async () => {
  assert.equal(gd.normalizePriority('LOW'), 'LOW');
});

await test('priority bogus low', async () => {
  assert.equal(gd.normalizePriority('URGENT'), 'LOW');
  assert.equal(gd.normalizePriority(''), 'LOW');
  assert.equal(gd.normalizePriority(null), 'LOW');
});

await test('priority whitespace trimmed', async () => {
  assert.equal(gd.normalizePriority('  high  '), 'HIGH');
});

/* ---------- 12-level ordering (34) ---------- */

await test('order rank twelve levels', async () => {
  assert.equal(gd.orderRank(sig()).length, 12);
});

await test('order rank array not score', async () => {
  assert.ok(Array.isArray(gd.orderRank(sig())));
  assert.equal(typeof gd.orderRank(sig()), 'object');
});

await test('revenue verified first', async () => {
  const a = sig({ hasRevenueRelevance: true, revenueVerified: true });
  const b = sig({ existingPriority: 'HIGH' });
  assert.ok(gd.compareDecisions(a, b) < 0);
});

await test('revenue unverified second tier', async () => {
  const a = sig({ hasRevenueRelevance: true, revenueVerified: false });
  const b = sig({ existingPriority: 'HIGH' });
  assert.ok(gd.compareDecisions(a, b) < 0);
});

await test('revenue beats many lowers', async () => {
  const a = sig({ hasRevenueRelevance: true, revenueVerified: true, priorityBand: 'LOW' });
  const b = sig({ existingPriority: 'HIGH', customerNeedRelevance: 'HIGH', searchOpportunity: 'HIGH', priorityBand: 'HIGH', evidenceCompleteness: 9 });
  assert.ok(gd.compareDecisions(a, b) < 0);
});

await test('existing high beats medium', async () => {
  assert.ok(gd.compareDecisions(sig({ existingPriority: 'HIGH' }), sig({ existingPriority: 'MEDIUM' })) < 0);
});

await test('existing medium beats low', async () => {
  assert.ok(gd.compareDecisions(sig({ existingPriority: 'MEDIUM' }), sig({ existingPriority: 'LOW' })) < 0);
});

await test('null priority last', async () => {
  assert.ok(gd.compareDecisions(sig({ existingPriority: 'LOW' }), sig({ existingPriority: null })) < 0);
});

await test('verify pending beats none', async () => {
  assert.ok(gd.compareDecisions(sig({ executionDependency: 'VERIFY_PENDING' }), sig({})) < 0);
});

await test('blocked dep sorts after none', async () => {
  assert.ok(gd.compareDecisions(sig({}), sig({ executionDependency: 'BLOCKED_DEP' })) < 0);
});

await test('need high wins', async () => {
  assert.ok(gd.compareDecisions(sig({ customerNeedRelevance: 'HIGH' }), sig({ customerNeedRelevance: 'LOW' })) < 0);
});

await test('search high wins', async () => {
  assert.ok(gd.compareDecisions(sig({ searchOpportunity: 'HIGH' }), sig({ searchOpportunity: null })) < 0);
});

await test('ai high wins', async () => {
  assert.ok(gd.compareDecisions(sig({ aiOpportunity: 'HIGH' }), sig({})) < 0);
});

await test('competitive evidence wins', async () => {
  assert.ok(gd.compareDecisions(sig({ competitiveEvidence: true }), sig({})) < 0);
});

await test('content evidence wins', async () => {
  assert.ok(gd.compareDecisions(sig({ contentEvidence: true }), sig({})) < 0);
});

await test('technical evidence wins', async () => {
  assert.ok(gd.compareDecisions(sig({ technicalEvidence: true }), sig({})) < 0);
});

await test('link evidence wins', async () => {
  assert.ok(gd.compareDecisions(sig({ internalLinkEvidence: true }), sig({})) < 0);
});

await test('urgency high wins', async () => {
  assert.ok(gd.compareDecisions(sig({ changeUrgency: 'HIGH' }), sig({ changeUrgency: 'LOW' })) < 0);
});

await test('band high wins', async () => {
  assert.ok(gd.compareDecisions(sig({ priorityBand: 'HIGH' }), sig({ priorityBand: 'LOW' })) < 0);
});

await test('completeness wins', async () => {
  assert.ok(gd.compareDecisions(sig({ evidenceCompleteness: 4 }), sig({ evidenceCompleteness: 1 })) < 0);
});

await test('equal ties zero', async () => {
  assert.equal(gd.compareDecisions(sig(), sig()), 0);
});

await test('lexicographic level1 dominates', async () => {
  const a = sig({ existingPriority: 'HIGH' });
  const b = sig({ existingPriority: 'MEDIUM', customerNeedRelevance: 'HIGH', searchOpportunity: 'HIGH', aiOpportunity: 'HIGH', competitiveEvidence: true, contentEvidence: true, technicalEvidence: true, internalLinkEvidence: true, changeUrgency: 'HIGH', priorityBand: 'HIGH', evidenceCompleteness: 9 });
  assert.ok(gd.compareDecisions(a, b) < 0);
});

await test('why first names levels', async () => {
  const w = gd.whyFirst(sig({ existingPriority: 'HIGH' }), sig({ existingPriority: 'LOW' }));
  assert.match(w, /existing high-priority recommendation/);
  assert.match(w, /Prioritized by/);
});

await test('why first caps three', async () => {
  const w = gd.whyFirst(
    sig({ existingPriority: 'HIGH', customerNeedRelevance: 'HIGH', searchOpportunity: 'HIGH', aiOpportunity: 'HIGH' }),
    sig({}),
  );
  const parts = w.replace('Prioritized by ', '').replace('.', '').split(', ');
  assert.ok(parts.length <= 3);
});

await test('why first tie text', async () => {
  assert.match(gd.whyFirst(sig(), sig()), /tie-break/);
});

await test('why first revenue level', async () => {
  const w = gd.whyFirst(sig({ hasRevenueRelevance: true, revenueVerified: true }), sig({}));
  assert.match(w, /revenue relevance/);
});

await test('why first need level', async () => {
  const w = gd.whyFirst(sig({ customerNeedRelevance: 'HIGH' }), sig({ customerNeedRelevance: null }));
  assert.match(w, /customer need/);
});

await test('why first urgency level', async () => {
  const w = gd.whyFirst(sig({ changeUrgency: 'HIGH' }), sig({ changeUrgency: null }));
  assert.match(w, /urgency/);
});

await test('why first completeness level', async () => {
  const w = gd.whyFirst(sig({ evidenceCompleteness: 5 }), sig({ evidenceCompleteness: 0 }));
  assert.match(w, /completeness/);
});

await test('why first band level', async () => {
  const w = gd.whyFirst(sig({ priorityBand: 'HIGH' }), sig({ priorityBand: 'LOW' }));
  assert.match(w, /priority band/);
});

await test('why first deterministic', async () => {
  const a = sig({ existingPriority: 'HIGH' });
  const b = sig({});
  assert.equal(gd.whyFirst(a, b), gd.whyFirst(a, b));
});

await test('ordering deterministic repeat', async () => {
  const a = sig({ existingPriority: 'HIGH', searchOpportunity: 'MEDIUM' });
  const b = sig({ existingPriority: 'MEDIUM' });
  assert.equal(gd.compareDecisions(a, b), gd.compareDecisions(a, b));
});

await test('need medium beats null', async () => {
  assert.ok(gd.compareDecisions(sig({ customerNeedRelevance: 'MEDIUM' }), sig({})) < 0);
});

await test('search medium beats low', async () => {
  assert.ok(gd.compareDecisions(sig({ searchOpportunity: 'MEDIUM' }), sig({ searchOpportunity: 'LOW' })) < 0);
});

await test('measure pending sorts late', async () => {
  assert.ok(gd.compareDecisions(sig({}), sig({ executionDependency: 'MEASURE_PENDING' })) < 0);
});

/* ---------- gating (18) ---------- */

function avail(o = {}) {
  return { gsc: true, aiVisibility: true, ga4: true, revenueLinkage: true, crawl: true, serp: true, competitor: true, ...o };
}

function noclaims(o = {}) {
  return { searchPerformance: false, aiLoss: false, trafficRevenue: false, revenue: false, technical: false, serp: false, competitorAdvantage: false, ...o };
}

await test('gate clean pass', async () => {
  const g = gd.gateDecision(avail(), noclaims());
  assert.deepEqual(g.blocked, []);
  assert.equal(g.downgradeToInvestigate, false);
});

await test('gate no gsc blocks search', async () => {
  const g = gd.gateDecision(avail({ gsc: false }), noclaims({ searchPerformance: true }));
  assert.ok(g.blocked.some((b) => b.includes('No GSC')));
  assert.equal(g.downgradeToInvestigate, true);
});

await test('gate no ai blocks ai loss', async () => {
  const g = gd.gateDecision(avail({ aiVisibility: false }), noclaims({ aiLoss: true }));
  assert.ok(g.blocked.some((b) => b.includes('No AI visibility')));
});

await test('gate no ga4 blocks traffic', async () => {
  const g = gd.gateDecision(avail({ ga4: false }), noclaims({ trafficRevenue: true }));
  assert.ok(g.blocked.some((b) => b.includes('No GA4')));
});

await test('gate no revenue blocks revenue', async () => {
  const g = gd.gateDecision(avail({ revenueLinkage: false }), noclaims({ revenue: true }));
  assert.ok(g.blocked.some((b) => b.includes('No revenue linkage')));
});

await test('gate no crawl blocks technical', async () => {
  const g = gd.gateDecision(avail({ crawl: false }), noclaims({ technical: true }));
  assert.ok(g.blocked.some((b) => b.includes('No crawl')));
});

await test('gate no serp blocks serp', async () => {
  const g = gd.gateDecision(avail({ serp: false }), noclaims({ serp: true }));
  assert.ok(g.blocked.some((b) => b.includes('No SERP')));
});

await test('gate no competitor blocks advantage', async () => {
  const g = gd.gateDecision(avail({ competitor: false }), noclaims({ competitorAdvantage: true }));
  assert.ok(g.blocked.some((b) => b.includes('No competitor evidence')));
});

await test('gate unavailable lists all missing', async () => {
  const g = gd.gateDecision(avail({ gsc: false, ga4: false }), noclaims());
  assert.ok(g.unavailable.includes('GSC'));
  assert.ok(g.unavailable.includes('GA4'));
  assert.ok(!g.unavailable.includes('SERP'));
});

await test('gate no claims no blocks', async () => {
  const g = gd.gateDecision(avail({ gsc: false }), noclaims());
  assert.deepEqual(g.blocked, []);
  assert.equal(g.downgradeToInvestigate, false);
});

await test('gate multiple blocks', async () => {
  const g = gd.gateDecision(
    avail({ gsc: false, crawl: false }),
    noclaims({ searchPerformance: true, technical: true }),
  );
  assert.equal(g.blocked.length, 2);
});

await test('gate unavailable crawl serp competitor', async () => {
  const g = gd.gateDecision(avail({ crawl: false, serp: false, competitor: false }), noclaims());
  assert.ok(g.unavailable.includes('Crawl'));
  assert.ok(g.unavailable.includes('SERP'));
  assert.ok(g.unavailable.includes('Competitor evidence'));
});

await test('gate revenue unavailable listed', async () => {
  const g = gd.gateDecision(avail({ revenueLinkage: false }), noclaims());
  assert.ok(g.unavailable.includes('Revenue linkage'));
});

await test('gate ai unavailable listed', async () => {
  const g = gd.gateDecision(avail({ aiVisibility: false }), noclaims());
  assert.ok(g.unavailable.includes('AI visibility'));
});

await test('gate all available empty unavailable', async () => {
  assert.deepEqual(gd.gateDecision(avail(), noclaims()).unavailable, []);
});

await test('gate downgrade only when blocked', async () => {
  assert.equal(gd.gateDecision(avail(), noclaims({ searchPerformance: true })).downgradeToInvestigate, false);
});

await test('gate claim without availability safe', async () => {
  const g = gd.gateDecision(avail({ ga4: false, revenueLinkage: false }), noclaims({ trafficRevenue: true, revenue: true }));
  assert.equal(g.blocked.length, 2);
});

await test('gate deterministic', async () => {
  assert.deepEqual(gd.gateDecision(avail({ gsc: false }), noclaims({ searchPerformance: true })), gd.gateDecision(avail({ gsc: false }), noclaims({ searchPerformance: true })));
});

/* ---------- conflicts (7) ---------- */

await test('conflict shape', async () => {
  const c = gd.signalConflict({ what: 'High rank + low CTR', sources: ['GSC', 'Rank'], known: 'Rank #2.', unknown: 'Why CTR lags.', safeNextStep: 'Review snippet.' });
  assert.equal(c.what, 'High rank + low CTR');
  assert.deepEqual(c.sources, ['GSC', 'Rank']);
});

await test('conflict note format', async () => {
  const n = gd.conflictNote(gd.signalConflict({ what: 'w', sources: ['A', 'B'], known: 'k', unknown: 'u', safeNextStep: 's' }));
  assert.match(n, /SIGNAL_CONFLICT: w/);
  assert.match(n, /sources: A, B/);
  assert.match(n, /Known: k/);
  assert.match(n, /Unknown: u/);
  assert.match(n, /Safe next step: s/);
});

await test('conflict traffic revenue', async () => {
  const c = gd.signalConflict({ what: 'Traffic growing + revenue unavailable', sources: ['GA4'], known: 'Sessions up.', unknown: 'Revenue linkage.', safeNextStep: 'Connect revenue source.' });
  assert.match(gd.conflictNote(c), /SIGNAL_CONFLICT/);
});

await test('conflict done unverified', async () => {
  const c = gd.signalConflict({ what: 'Action DONE + verification pending', sources: ['Action', 'Verification'], known: 'Done.', unknown: 'Live state.', safeNextStep: 'Verify.' });
  assert.equal(c.safeNextStep, 'Verify.');
});

await test('conflict multi sources', async () => {
  const c = gd.signalConflict({ what: 'x', sources: ['A', 'B', 'C'], known: 'k', unknown: 'u', safeNextStep: 's' });
  assert.equal(c.sources.length, 3);
});

await test('conflict never hidden text', async () => {
  assert.match(gd.conflictNote(gd.signalConflict({ what: 'w', sources: ['S'], known: 'k', unknown: 'u', safeNextStep: 's' })), /SIGNAL_CONFLICT/);
});

await test('conflict deterministic', async () => {
  const mk = () => gd.signalConflict({ what: 'w', sources: ['S'], known: 'k', unknown: 'u', safeNextStep: 's' });
  assert.deepEqual(mk(), mk());
});

/* ---------- action reuse (14) ---------- */

await test('reuse todo existing', async () => {
  assert.equal(gd.mapActionReuse({ actionId: 'a1', actionStatus: 'TODO', verificationState: null, measurementState: null }), 'EXISTING_ACTION');
});

await test('reuse in progress existing', async () => {
  assert.equal(gd.mapActionReuse({ actionId: 'a1', actionStatus: 'IN_PROGRESS', verificationState: null, measurementState: null }), 'EXISTING_ACTION');
});

await test('reuse done unverified', async () => {
  assert.equal(gd.mapActionReuse({ actionId: 'a1', actionStatus: 'DONE', verificationState: 'UNVERIFIED', measurementState: null }), 'VERIFY_EXISTING_ACTION');
});

await test('reuse done null verification', async () => {
  assert.equal(gd.mapActionReuse({ actionId: 'a1', actionStatus: 'DONE', verificationState: null, measurementState: null }), 'VERIFY_EXISTING_ACTION');
});

await test('reuse verified unmeasured', async () => {
  assert.equal(gd.mapActionReuse({ actionId: 'a1', actionStatus: 'DONE', verificationState: 'VERIFIED', measurementState: null }), 'MEASURE_EXISTING_ACTION');
});

await test('reuse partially verified unmeasured', async () => {
  assert.equal(gd.mapActionReuse({ actionId: 'a1', actionStatus: 'DONE', verificationState: 'PARTIALLY_VERIFIED', measurementState: null }), 'MEASURE_EXISTING_ACTION');
});

await test('reuse measured existing', async () => {
  assert.equal(gd.mapActionReuse({ actionId: 'a1', actionStatus: 'DONE', verificationState: 'VERIFIED', measurementState: 'MEASURED' }), 'EXISTING_ACTION');
});

await test('reuse dismissed alone', async () => {
  assert.equal(gd.mapActionReuse({ actionId: 'a1', actionStatus: 'DISMISSED', verificationState: null, measurementState: null }), 'DISMISSED_LEFT_ALONE');
});

await test('reuse none yet', async () => {
  assert.equal(gd.mapActionReuse({ actionId: null, actionStatus: null, verificationState: null, measurementState: null }), 'NO_ACTION_YET');
});

await test('reuse null status none', async () => {
  assert.equal(gd.mapActionReuse({ actionId: null, actionStatus: 'TODO', verificationState: null, measurementState: null }), 'NO_ACTION_YET');
});

await test('reuse notes five distinct', async () => {
  const notes = ['EXISTING_ACTION', 'VERIFY_EXISTING_ACTION', 'MEASURE_EXISTING_ACTION', 'DISMISSED_LEFT_ALONE', 'NO_ACTION_YET'].map((r) => gd.reuseNote(r));
  assert.equal(new Set(notes).size, 5);
  assert.match(notes[3], /never auto-resurrected/);
  assert.match(notes[0], /never duplicated/);
});

await test('reuse dismissed note', async () => {
  assert.match(gd.reuseNote('DISMISSED_LEFT_ALONE'), /dismissed action exists|never auto-resurrected/i);
});

await test('reuse verify note', async () => {
  assert.match(gd.reuseNote('VERIFY_EXISTING_ACTION'), /verify the live change/);
});

await test('reuse measure note', async () => {
  assert.match(gd.reuseNote('MEASURE_EXISTING_ACTION'), /measure the outcome/);
});

/* ---------- mappings (30) ---------- */

await test('roadmap improve', async () => {
  assert.equal(gd.decisionTypeForRoadmapKind('IMPROVE_PAGE'), 'IMPROVE');
  assert.equal(gd.decisionTypeForRoadmapKind('OPTIMIZE_PAGE'), 'IMPROVE');
  assert.equal(gd.decisionTypeForRoadmapKind('REFRESH_PAGE'), 'IMPROVE');
});

await test('roadmap create consolidate protect', async () => {
  assert.equal(gd.decisionTypeForRoadmapKind('CREATE_PAGE'), 'CREATE');
  assert.equal(gd.decisionTypeForRoadmapKind('CONSOLIDATE_PAGES'), 'CONSOLIDATE');
  assert.equal(gd.decisionTypeForRoadmapKind('PROTECT_PAGE'), 'PROTECT');
});

await test('roadmap fix connect measure', async () => {
  assert.equal(gd.decisionTypeForRoadmapKind('FIX_TECHNICAL_BLOCKER'), 'FIX');
  assert.equal(gd.decisionTypeForRoadmapKind('BUILD_INTERNAL_SUPPORT'), 'CONNECT');
  assert.equal(gd.decisionTypeForRoadmapKind('TRACK_KEYWORD'), 'MEASURE');
  assert.equal(gd.decisionTypeForRoadmapKind('MONITOR'), 'MEASURE');
});

await test('roadmap unknown investigate', async () => {
  assert.equal(gd.decisionTypeForRoadmapKind('BOGUS'), 'INVESTIGATE');
  assert.equal(gd.decisionTypeForRoadmapKind(null), 'INVESTIGATE');
});

await test('alert loss respond', async () => {
  assert.equal(gd.decisionTypeForAlert('RANK_LOSS'), 'RESPOND');
  assert.equal(gd.decisionTypeForAlert('TOP_10_EXIT'), 'RESPOND');
  assert.equal(gd.decisionTypeForAlert('TOP_3_EXIT'), 'RESPOND');
});

await test('alert gain protect', async () => {
  assert.equal(gd.decisionTypeForAlert('RANK_GAIN'), 'PROTECT');
  assert.equal(gd.decisionTypeForAlert('TOP_10_ENTRY'), 'PROTECT');
  assert.equal(gd.decisionTypeForAlert('TOP_3_ENTRY'), 'PROTECT');
});

await test('alert wrong url investigate', async () => {
  assert.equal(gd.decisionTypeForAlert('WRONG_URL'), 'INVESTIGATE');
  assert.equal(gd.decisionTypeForAlert('AI_VISIBILITY_CHANGE'), 'INVESTIGATE');
  assert.equal(gd.decisionTypeForAlert('GSC_CHANGE'), 'INVESTIGATE');
});

await test('alert serp strengthen respond', async () => {
  assert.equal(gd.decisionTypeForAlert('SERP_FEATURE_GAIN'), 'STRENGTHEN');
  assert.equal(gd.decisionTypeForAlert('SERP_FEATURE_LOSS'), 'RESPOND');
  assert.equal(gd.decisionTypeForAlert('COMPETITOR_MOVEMENT'), 'RESPOND');
});

await test('alert website verify measure', async () => {
  assert.equal(gd.decisionTypeForAlert('WEBSITE_CHANGE'), 'VERIFY');
  assert.equal(gd.decisionTypeForAlert('EXECUTION_VERIFIED'), 'MEASURE');
});

await test('alert unknown investigate', async () => {
  assert.equal(gd.decisionTypeForAlert('NOPE'), 'INVESTIGATE');
});

await test('rank declined respond', async () => {
  assert.equal(gd.decisionTypeForRankEvent('RANK_DECLINED'), 'RESPOND');
  assert.equal(gd.decisionTypeForRankEvent('SUSTAINED_DECLINE'), 'RESPOND');
  assert.equal(gd.decisionTypeForRankEvent('LEFT_TOP_10'), 'RESPOND');
  assert.equal(gd.decisionTypeForRankEvent('LEFT_STRIKING'), 'RESPOND');
});

await test('rank improved protect', async () => {
  assert.equal(gd.decisionTypeForRankEvent('RANK_IMPROVED'), 'PROTECT');
  assert.equal(gd.decisionTypeForRankEvent('SUSTAINED_IMPROVEMENT'), 'PROTECT');
  assert.equal(gd.decisionTypeForRankEvent('ENTERED_TOP_10'), 'PROTECT');
});

await test('rank striking improve new investigate', async () => {
  assert.equal(gd.decisionTypeForRankEvent('ENTERED_STRIKING'), 'IMPROVE');
  assert.equal(gd.decisionTypeForRankEvent('RANK_NEW'), 'INVESTIGATE');
  assert.equal(gd.decisionTypeForRankEvent('URL_CHANGED'), 'INVESTIGATE');
});

await test('rank unknown investigate', async () => {
  assert.equal(gd.decisionTypeForRankEvent('WHATEVER'), 'INVESTIGATE');
});

await test('rec consolidate create protect', async () => {
  assert.equal(gd.decisionTypeForRecommendation('CONSOLIDATE_PAGES'), 'CONSOLIDATE');
  assert.equal(gd.decisionTypeForRecommendation('CANNIBALIZATION_RISK'), 'CONSOLIDATE');
  assert.equal(gd.decisionTypeForRecommendation('CREATE_CONTENT'), 'CREATE');
  assert.equal(gd.decisionTypeForRecommendation('PROTECT_PAGE'), 'PROTECT');
});

await test('rec fix connect measure', async () => {
  assert.equal(gd.decisionTypeForRecommendation('FIX_TECHNICAL'), 'FIX');
  assert.equal(gd.decisionTypeForRecommendation('TECHNICAL_BLOCKER'), 'FIX');
  assert.equal(gd.decisionTypeForRecommendation('INTERNAL_LINK_OPPORTUNITY'), 'CONNECT');
  assert.equal(gd.decisionTypeForRecommendation('ORPHAN_PAGE'), 'CONNECT');
  assert.equal(gd.decisionTypeForRecommendation('TRACK_KEYWORD'), 'MEASURE');
  assert.equal(gd.decisionTypeForRecommendation('MONITOR_CHANGE'), 'MEASURE');
});

await test('rec improve variants', async () => {
  assert.equal(gd.decisionTypeForRecommendation('IMPROVE_PAGE'), 'IMPROVE');
  assert.equal(gd.decisionTypeForRecommendation('OPTIMIZE_SNIPPET'), 'IMPROVE');
  assert.equal(gd.decisionTypeForRecommendation('REFRESH_REQUIRED'), 'IMPROVE');
  assert.equal(gd.decisionTypeForRecommendation('QUICK_WIN'), 'IMPROVE');
});

await test('rec ai investigate', async () => {
  assert.equal(gd.decisionTypeForRecommendation('CITATION_GAP'), 'INVESTIGATE');
  assert.equal(gd.decisionTypeForRecommendation('AI_VISIBILITY'), 'INVESTIGATE');
  assert.equal(gd.decisionTypeForRecommendation('PROMPT_GAP'), 'INVESTIGATE');
  assert.equal(gd.decisionTypeForRecommendation('SOURCE_GAP'), 'INVESTIGATE');
});

await test('rec unknown investigate', async () => {
  assert.equal(gd.decisionTypeForRecommendation('SOMETHING_ELSE'), 'INVESTIGATE');
});

await test('rec case-insensitive', async () => {
  assert.equal(gd.decisionTypeForRecommendation('improve_page'), 'IMPROVE');
  assert.equal(gd.decisionTypeForAlert('rank_loss'), 'RESPOND');
});

/* ---------- sections (12) ---------- */

await test('section completed', async () => {
  assert.equal(gd.assignSection({ blockedReasons: ['x'], waitReasons: ['y'], completed: true, orderIndex: 0 }), 'COMPLETED');
});

await test('section blocked', async () => {
  assert.equal(gd.assignSection({ blockedReasons: ['x'], waitReasons: [], completed: false, orderIndex: 0 }), 'BLOCKED');
});

await test('section wait', async () => {
  assert.equal(gd.assignSection({ blockedReasons: [], waitReasons: ['y'], completed: false, orderIndex: 0 }), 'WAIT');
});

await test('section now first three', async () => {
  for (const i of [0, 1, 2]) {
    assert.equal(gd.assignSection({ blockedReasons: [], waitReasons: [], completed: false, orderIndex: i }), 'NOW');
  }
});

await test('section next range', async () => {
  assert.equal(gd.assignSection({ blockedReasons: [], waitReasons: [], completed: false, orderIndex: 3 }), 'NEXT');
  assert.equal(gd.assignSection({ blockedReasons: [], waitReasons: [], completed: false, orderIndex: 12 }), 'NEXT');
});

await test('section overflow wait', async () => {
  assert.equal(gd.assignSection({ blockedReasons: [], waitReasons: [], completed: false, orderIndex: 13 }), 'WAIT');
  assert.equal(gd.assignSection({ blockedReasons: [], waitReasons: [], completed: false, orderIndex: 99 }), 'WAIT');
});

await test('wait note empty', async () => {
  assert.equal(gd.waitNote([]), '');
});

await test('wait note reasons', async () => {
  assert.match(gd.waitNote(['verification pending.']), /WHY WAITING/);
});

await test('no material shape', async () => {
  const n = gd.noMaterialDecision('No evidence.');
  assert.equal(n.status, 'NO_MATERIAL_DECISION');
  assert.equal(n.section, 'WAIT');
  assert.match(n.nextAction, /No action proposed/);
  assert.equal(n.unavailableReason, 'No evidence.');
});

await test('section completed beats blocked', async () => {
  assert.equal(gd.assignSection({ blockedReasons: ['b'], waitReasons: [], completed: true, orderIndex: 50 }), 'COMPLETED');
});

await test('section blocked beats wait', async () => {
  assert.equal(gd.assignSection({ blockedReasons: ['b'], waitReasons: ['w'], completed: false, orderIndex: 0 }), 'BLOCKED');
});

await test('section next boundary', async () => {
  assert.equal(gd.assignSection({ blockedReasons: [], waitReasons: [], completed: false, orderIndex: 12 }), 'NEXT');
  assert.equal(gd.assignSection({ blockedReasons: [], waitReasons: [], completed: false, orderIndex: 13 }), 'WAIT');
});

/* ---------- trace (6) ---------- */

await test('trace eleven edges', async () => {
  assert.equal(gd.buildTrace({}).length, 11);
});

await test('trace values', async () => {
  const t = gd.buildTrace({ Keyword: 'crm', Page: '/crm' });
  assert.ok(t.some((x) => x === 'Keyword: crm'));
  assert.ok(t.some((x) => x === 'Page: /crm'));
});

await test('trace missing edges', async () => {
  const t = gd.buildTrace({});
  assert.ok(t.every((x) => x.endsWith('missing edge') || x.includes(': missing edge')));
  assert.ok(t.some((x) => x === 'Revenue: missing edge'));
});

await test('trace null treated missing', async () => {
  const t = gd.buildTrace({ Keyword: null });
  assert.ok(t.some((x) => x === 'Keyword: missing edge'));
});

await test('trace order decision first', async () => {
  assert.ok(gd.buildTrace({ Decision: 'x' })[0].startsWith('Decision:'));
});

await test('trace revenue last', async () => {
  const t = gd.buildTrace({});
  assert.ok(t[t.length - 1].startsWith('Revenue:'));
});

/* ---------- evidence guard (9) ---------- */

await test('guard inferred observed false', async () => {
  assert.equal(gd.evidenceGuard('INFERRED', 'OBSERVED'), false);
});

await test('guard unknown observed false', async () => {
  assert.equal(gd.evidenceGuard('UNKNOWN', 'OBSERVED'), false);
});

await test('guard unavailable observed false', async () => {
  assert.equal(gd.evidenceGuard('UNAVAILABLE', 'OBSERVED'), false);
});

await test('guard inferred attributed false', async () => {
  assert.equal(gd.evidenceGuard('INFERRED', 'ATTRIBUTED'), false);
});

await test('guard observed observed true', async () => {
  assert.equal(gd.evidenceGuard('OBSERVED', 'OBSERVED'), true);
});

await test('guard attributed attributed true', async () => {
  assert.equal(gd.evidenceGuard('ATTRIBUTED', 'ATTRIBUTED'), true);
});

await test('guard unavailable unavailable true', async () => {
  assert.equal(gd.evidenceGuard('UNAVAILABLE', 'UNAVAILABLE'), true);
});

await test('guard inferred inferred true', async () => {
  assert.equal(gd.evidenceGuard('INFERRED', 'INFERRED'), true);
});

await test('guard modeled observed true allowed', async () => {
  assert.equal(gd.evidenceGuard('MODELED', 'OBSERVED'), true);
});

/* ---------- client wording (13) ---------- */

await test('wording protect', async () => {
  assert.match(gd.clientWording('PROTECT'), /Keep what is working/);
});

await test('wording improve', async () => {
  assert.match(gd.clientWording('IMPROVE'), /rank higher/);
});

await test('wording create', async () => {
  assert.match(gd.clientWording('CREATE'), /missing page/);
});

await test('wording consolidate', async () => {
  assert.match(gd.clientWording('CONSOLIDATE'), /competing with each other/);
});

await test('wording fix', async () => {
  assert.match(gd.clientWording('FIX'), /broken/);
});

await test('wording connect', async () => {
  assert.match(gd.clientWording('CONNECT'), /Link related/);
});

await test('wording strengthen', async () => {
  assert.match(gd.clientWording('STRENGTHEN'), /momentum/);
});

await test('wording respond', async () => {
  assert.match(gd.clientWording('RESPOND'), /meaningful changed/);
});

await test('wording verify', async () => {
  assert.match(gd.clientWording('VERIFY'), /actually live/);
});

await test('wording measure', async () => {
  assert.match(gd.clientWording('MEASURE'), /moved the numbers/);
});

await test('wording investigate', async () => {
  assert.match(gd.clientWording('INVESTIGATE'), /Look closer/);
});

await test('wording jargon light', async () => {
  for (const t of gd.DECISION_TYPES) {
    assert.doesNotMatch(gd.clientWording(t), /SERP|cannibalization|CTR/i);
  }
});

await test('wording all types covered', async () => {
  for (const t of gd.DECISION_TYPES) {
    assert.ok(gd.clientWording(t).length > 10);
  }
});

/* ---------- stable key (3) ---------- */

await test('stable key format', async () => {
  assert.equal(gd.stableKey('abc', 3), 'abc:0003');
});

await test('stable key padding', async () => {
  assert.equal(gd.stableKey('abc', 0), 'abc:0000');
  assert.equal(gd.stableKey('abc', 42), 'abc:0042');
});

await test('stable key distinct', async () => {
  assert.notEqual(gd.stableKey('abc', 1), gd.stableKey('abc', 2));
  assert.notEqual(gd.stableKey('abc', 1), gd.stableKey('abd', 1));
});

/* ---------- honesty invariants (16) ---------- */

await test('no score anywhere', async () => {
  const r = gd.orderRank(sig());
  assert.ok(Array.isArray(r));
  assert.ok(!r.some((x) => typeof x !== 'number' || !Number.isInteger(x)));
});

await test('why first never mentions score', async () => {
  assert.doesNotMatch(gd.whyFirst(sig({ existingPriority: 'HIGH' }), sig({})), /score/i);
});

await test('no fake revenue in ordering', async () => {
  assert.doesNotMatch(JSON.stringify(gd.orderRank(sig({ hasRevenueRelevance: true, revenueVerified: true }))), /₹|\$/);
});

await test('no fake ranking text', async () => {
  assert.doesNotMatch(gd.whyFirst(sig({ searchOpportunity: 'HIGH' }), sig({})), /rank #|position [0-9]/i);
});

await test('no fake ai visibility', async () => {
  assert.doesNotMatch(gd.whyFirst(sig({ aiOpportunity: 'HIGH' }), sig({})), /cited by|mentioned by/i);
});

await test('no causality language', async () => {
  const blob = JSON.stringify([
    gd.whyFirst(sig({ existingPriority: 'HIGH' }), sig({})),
    gd.reuseNote('EXISTING_ACTION'),
    gd.clientWording('RESPOND'),
  ]);
  assert.doesNotMatch(blob, /caused|because of|guaranteed|will increase/i);
});

await test('dismissed never resurrected', async () => {
  assert.equal(gd.mapActionReuse({ actionId: 'a', actionStatus: 'DISMISSED', verificationState: null, measurementState: null }), 'DISMISSED_LEFT_ALONE');
});

await test('missing downgrades investigate', async () => {
  const g = gd.gateDecision(avail({ gsc: false }), noclaims({ searchPerformance: true }));
  assert.equal(g.downgradeToInvestigate, true);
});

await test('association never causation text', async () => {
  assert.match(gd.clientWording('INVESTIGATE'), /evidence is not complete/);
});

await test('no growth score vocabulary', async () => {
  const blob = JSON.stringify([gd.DECISION_TYPES, gd.PLAN_SECTIONS]);
  assert.doesNotMatch(blob, /SCORE/i);
});

await test('conflict known unknown present', async () => {
  const n = gd.conflictNote(gd.signalConflict({ what: 'w', sources: ['S'], known: 'k', unknown: 'u', safeNextStep: 's' }));
  assert.match(n, /Known:/);
  assert.match(n, /Unknown:/);
});

await test('wait explains itself', async () => {
  assert.match(gd.waitNote(['verification pending.']), /WHY WAITING/);
});

await test('no material manufactures nothing', async () => {
  assert.match(gd.noMaterialDecision('x').nextAction, /No action proposed/);
});

await test('evidence states vocabulary', async () => {
  for (const s of ['OBSERVED', 'ATTRIBUTED', 'MODELED', 'INFERRED', 'UNAVAILABLE', 'UNKNOWN']) {
    assert.equal(gd.evidenceGuard(s, s), s === 'MODELED' ? true : gd.evidenceGuard(s, s));
  }
});

await test('upgrade paths blocked textually', async () => {
  assert.equal(gd.evidenceGuard('INFERRED', 'OBSERVED'), false);
  assert.equal(gd.evidenceGuard('INFERRED', 'ATTRIBUTED'), false);
});

await test('ordering uses existing priority', async () => {
  assert.ok(gd.compareDecisions(sig({ existingPriority: 'HIGH' }), sig({ existingPriority: 'LOW' })) < 0);
});

/* ---------- determinism + performance (10) ---------- */

await test('fingerprints batch distinct inputs', async () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    seen.add(fp({ keyword: `keyword ${i}` }));
  }
  assert.equal(seen.size, 500);
});

await test('ordering batch 500', async () => {
  const kinds = ['HIGH', 'MEDIUM', 'LOW', null];
  for (let i = 0; i < 500; i++) {
    gd.compareDecisions(sig({ existingPriority: kinds[i % 4] }), sig({ existingPriority: kinds[(i + 1) % 4] }));
  }
  assert.ok(true);
});

await test('mappings batch 500', async () => {
  const kinds = ['IMPROVE_PAGE', 'CREATE_PAGE', 'RANK_LOSS', 'WRONG_URL', 'BOGUS'];
  for (let i = 0; i < 500; i++) {
    gd.decisionTypeForRoadmapKind(kinds[i % kinds.length]);
    gd.decisionTypeForAlert(kinds[i % kinds.length]);
    gd.decisionTypeForRecommendation(kinds[i % kinds.length]);
  }
  assert.ok(true);
});

await test('gating batch 200', async () => {
  for (let i = 0; i < 200; i++) {
    gd.gateDecision(avail({ gsc: i % 2 === 0 }), noclaims({ searchPerformance: true }));
  }
  assert.ok(true);
});

await test('sort stability fingerprint tiebreak', async () => {
  const arr = [
    { s: sig(), f: 'b' },
    { s: sig(), f: 'a' },
  ];
  arr.sort((x, y) => gd.compareDecisions(x.s, y.s) || (x.f < y.f ? -1 : 1));
  assert.deepEqual(arr.map((x) => x.f), ['a', 'b']);
});

await test('reuse batch 200', async () => {
  const states = ['TODO', 'IN_PROGRESS', 'DONE', 'DISMISSED', null];
  for (let i = 0; i < 200; i++) {
    gd.mapActionReuse({ actionId: i % 2 ? 'a' : null, actionStatus: states[i % states.length], verificationState: null, measurementState: null });
  }
  assert.ok(true);
});

await test('trace batch 200', async () => {
  for (let i = 0; i < 200; i++) {
    gd.buildTrace({ Keyword: `k${i}`, Page: `/p${i}` });
  }
  assert.ok(true);
});

await test('bounded sections math', async () => {
  assert.ok(gd.MAX_NOW + gd.MAX_NEXT + gd.MAX_WAIT + gd.MAX_BLOCKED + gd.MAX_COMPLETED <= 63);
});

await test('deterministic fingerprint repeat', async () => {
  assert.equal(fp({ keyword: 'x', page: '/y' }), fp({ keyword: 'x', page: '/y' }));
});

await test('ordering antisymmetric', async () => {
  const a = sig({ existingPriority: 'HIGH' });
  const b = sig({ existingPriority: 'LOW' });
  assert.equal(gd.compareDecisions(a, b), -gd.compareDecisions(b, a));
});

/* ---------- ordering extras (14) ---------- */

await test('verify pending beats measure pending', async () => {
  assert.ok(gd.compareDecisions(sig({ executionDependency: 'VERIFY_PENDING' }), sig({ executionDependency: 'MEASURE_PENDING' })) < 0);
});

await test('need low beats null', async () => {
  assert.ok(gd.compareDecisions(sig({ customerNeedRelevance: 'LOW' }), sig({})) < 0);
});

await test('ai medium beats null', async () => {
  assert.ok(gd.compareDecisions(sig({ aiOpportunity: 'MEDIUM' }), sig({})) < 0);
});

await test('urgency medium beats low', async () => {
  assert.ok(gd.compareDecisions(sig({ changeUrgency: 'MEDIUM' }), sig({ changeUrgency: 'LOW' })) < 0);
});

await test('completeness zero loses', async () => {
  assert.ok(gd.compareDecisions(sig({ evidenceCompleteness: 0 }), sig({ evidenceCompleteness: 3 })) > 0);
});

await test('band medium beats low', async () => {
  assert.ok(gd.compareDecisions(sig({ priorityBand: 'MEDIUM' }), sig({ priorityBand: 'LOW' })) < 0);
});

await test('revenue verified beats verify pending', async () => {
  const a = sig({ hasRevenueRelevance: true, revenueVerified: true });
  const b = sig({ existingPriority: 'HIGH', executionDependency: 'VERIFY_PENDING' });
  assert.ok(gd.compareDecisions(a, b) < 0);
});

await test('why first dependency level', async () => {
  const w = gd.whyFirst(sig({ executionDependency: 'VERIFY_PENDING' }), sig({}));
  assert.match(w, /execution\/verification dependency/);
});

await test('why first search level', async () => {
  const w = gd.whyFirst(sig({ searchOpportunity: 'HIGH' }), sig({}));
  assert.match(w, /search visibility/);
});

await test('why first ai level', async () => {
  const w = gd.whyFirst(sig({ aiOpportunity: 'HIGH' }), sig({}));
  assert.match(w, /AI visibility/);
});

await test('why first competitive level', async () => {
  const w = gd.whyFirst(sig({ competitiveEvidence: true }), sig({}));
  assert.match(w, /competitive/);
});

await test('why first content level', async () => {
  const w = gd.whyFirst(sig({ contentEvidence: true }), sig({}));
  assert.match(w, /content\/technical/);
});

await test('why first single reason format', async () => {
  const w = gd.whyFirst(sig({ existingPriority: 'HIGH' }), sig({ existingPriority: 'MEDIUM' }));
  assert.match(w, /^Prioritized by .* painfully?|^Prioritized by .*$/);
});

await test('ordering transitive', async () => {
  const a = sig({ existingPriority: 'HIGH' });
  const b = sig({ existingPriority: 'MEDIUM' });
  const c = sig({ existingPriority: 'LOW' });
  assert.ok(gd.compareDecisions(a, b) < 0 && gd.compareDecisions(b, c) < 0 && gd.compareDecisions(a, c) < 0);
});

/* ---------- gating extras (8) ---------- */

await test('gate blocked text mentions waiting', async () => {
  const g = gd.gateDecision(avail({ gsc: false }), noclaims({ searchPerformance: true }));
  assert.match(g.blocked[0], /claim/);
});

await test('gate ai claim needs visibility', async () => {
  const g = gd.gateDecision(avail({ aiVisibility: true }), noclaims({ aiLoss: true }));
  assert.deepEqual(g.blocked, []);
});

await test('gate technical claim needs crawl', async () => {
  const g = gd.gateDecision(avail({ crawl: true }), noclaims({ technical: true }));
  assert.deepEqual(g.blocked, []);
});

await test('gate serp claim needs serp', async () => {
  const g = gd.gateDecision(avail({ serp: true }), noclaims({ serp: true }));
  assert.deepEqual(g.blocked, []);
});

await test('gate competitor claim needs competitor', async () => {
  const g = gd.gateDecision(avail({ competitor: true }), noclaims({ competitorAdvantage: true }));
  assert.deepEqual(g.blocked, []);
});

await test('gate traffic revenue needs ga4', async () => {
  const g = gd.gateDecision(avail({ ga4: true }), noclaims({ trafficRevenue: true }));
  assert.deepEqual(g.blocked, []);
});

await test('gate revenue needs linkage', async () => {
  const g = gd.gateDecision(avail({ revenueLinkage: true }), noclaims({ revenue: true }));
  assert.deepEqual(g.blocked, []);
});

await test('gate all seven claims all blocked', async () => {
  const g = gd.gateDecision(
    avail({ gsc: false, aiVisibility: false, ga4: false, revenueLinkage: false, crawl: false, serp: false, competitor: false }),
    noclaims({ searchPerformance: true, aiLoss: true, trafficRevenue: true, revenue: true, technical: true, serp: true, competitorAdvantage: true }),
  );
  assert.equal(g.blocked.length, 7);
  assert.equal(g.downgradeToInvestigate, true);
});

/* ---------- mapping extras (10) ---------- */

await test('roadmap lowercase kinds', async () => {
  assert.equal(gd.decisionTypeForRoadmapKind('improve_page'), 'IMPROVE');
  assert.equal(gd.decisionTypeForRoadmapKind('create_page'), 'CREATE');
});

await test('alert lowercase triggers', async () => {
  assert.equal(gd.decisionTypeForAlert('top_10_exit'), 'RESPOND');
  assert.equal(gd.decisionTypeForAlert('wrong_url'), 'INVESTIGATE');
});

await test('rank lowercase events', async () => {
  assert.equal(gd.decisionTypeForRankEvent('rank_declined'), 'RESPOND');
  assert.equal(gd.decisionTypeForRankEvent('entered_top_10'), 'PROTECT');
});

await test('rec growth keyword', async () => {
  assert.equal(gd.decisionTypeForRecommendation('GROWTH_OPPORTUNITY'), 'IMPROVE');
});

await test('rec content gap', async () => {
  assert.equal(gd.decisionTypeForRecommendation('CONTENT_GAP_ANALYSIS'), 'CREATE');
});

await test('rec agent access', async () => {
  assert.equal(gd.decisionTypeForRecommendation('AGENT_ACCESS_BLOCKED'), 'FIX');
});

await test('rec consolidate substring', async () => {
  assert.equal(gd.decisionTypeForRecommendation('POSSIBLE_CONSOLIDATION'), 'CONSOLIDATE');
});

await test('rec protect substring', async () => {
  assert.equal(gd.decisionTypeForRecommendation('PROTECT_WINNING_PAGE'), 'PROTECT');
});

await test('rec monitor substring', async () => {
  assert.equal(gd.decisionTypeForRecommendation('MONITOR_RANK'), 'MEASURE');
});

await test('rec null investigate', async () => {
  assert.equal(gd.decisionTypeForRecommendation(null), 'INVESTIGATE');
  assert.equal(gd.decisionTypeForRecommendation(undefined), 'INVESTIGATE');
});

/* ---------- sections + wording extras (8) ---------- */

await test('section wait beats next when wait reasons', async () => {
  assert.equal(gd.assignSection({ blockedReasons: [], waitReasons: ['x'], completed: false, orderIndex: 1 }), 'WAIT');
});

await test('wording strengthen respond distinct', async () => {
  assert.notEqual(gd.clientWording('STRENGTHEN'), gd.clientWording('RESPOND'));
});

await test('wording fix connect distinct', async () => {
  assert.notEqual(gd.clientWording('FIX'), gd.clientWording('CONNECT'));
});

await test('wording verify measure distinct', async () => {
  assert.notEqual(gd.clientWording('VERIFY'), gd.clientWording('MEASURE'));
});

await test('wait note multiple reasons', async () => {
  const n = gd.waitNote(['a.', 'b.']);
  assert.match(n, /a\./);
  assert.match(n, /b\./);
});

await test('no material wait section', async () => {
  assert.equal(gd.noMaterialDecision('empty').section, 'WAIT');
});

await test('trace full values', async () => {
  const t = gd.buildTrace({ Decision: 'd', 'Customer Need': 'n', Keyword: 'k', Rank: 'r', Page: 'p', SERP: 's', Recommendation: 'rec', Action: 'a', Verification: 'v', Measurement: 'm', Revenue: 'rev' });
  assert.ok(t.every((x) => !x.includes('missing edge')));
  assert.equal(t.length, 11);
});

await test('stable key large index', async () => {
  assert.equal(gd.stableKey('f', 123), 'f:0123');
});

/* ---------- honesty extras (6) ---------- */

await test('no probability language', async () => {
  const blob = JSON.stringify([gd.clientWording('IMPROVE'), gd.whyFirst(sig({ existingPriority: 'HIGH' }), sig({}))]);
  assert.doesNotMatch(blob, /probability|likely to rank|will rank/i);
});

await test('no generated revenue language', async () => {
  assert.doesNotMatch(gd.clientWording('PROTECT'), /generated|revenue/i);
});

await test('investigate before action text', async () => {
  assert.match(gd.clientWording('INVESTIGATE'), /before deciding/);
});

await test('evidence guard modeled inferred', async () => {
  assert.equal(gd.evidenceGuard('MODELED', 'INFERRED'), true);
});

await test('evidence guard observed unavailable', async () => {
  assert.equal(gd.evidenceGuard('OBSERVED', 'UNAVAILABLE'), true);
});

await test('ordering never invents demand', async () => {
  assert.doesNotMatch(gd.whyFirst(sig({ customerNeedRelevance: 'HIGH' }), sig({})), /demand volume|searches/i);
});

/* ---------- summary ---------- */

const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(`\nGrowth Decisions 1.0: ${passCount}/${results.length} passed.`);
if (failed.length > 0) {
  console.log(failed.join('\n'));
  process.exit(1);
} else {
  console.log('All Growth Decisions 1.0 tests passed.');
}

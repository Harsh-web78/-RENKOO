/*
 * RENKOO Zero-Click + Commercial Search Intelligence 1.0
 * — tests (Phase 16).
 *
 * 66 tests over pure functions only: capture honesty,
 * CTR diagnostics + trends, commercial tiers + gaps,
 * SERP context (no causality), AI relationships,
 * striking distance reuse, opportunity groups, page
 * diagnosis, NBA mapping, measurement wording, evidence
 * states, bounded determinism. No DB, no provider calls,
 * no billing touch.
 *
 * Run: npm run test:search-capture   (dist built)
 */
import assert from 'node:assert/strict';

const cap = await import('../dist/keywords/search-capture.js');

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

/* ---------- ZERO-CLICK HONESTY (6) ---------- */

await test('no direct zero-click evidence ever claimed', async () => {
  assert.equal('zeroClickCount' in cap, false);
  assert.equal('zeroClickSessions' in cap, false);
  assert.equal('stolenTraffic' in cap, false);
});

await test('high visibility low ctr pattern is honest', async () => {
  const pattern = cap.capturePattern({
    impressions: 5000,
    clicks: 10,
    position: 3,
    hasSerpFeatures: false,
    hasAiCitation: false,
    commercialTier: 'LOW_COMMERCIAL',
    hasRanking: true,
  });
  assert.equal(pattern, 'HIGH_VISIBILITY_LOW_CLICK_CAPTURE');
  assert.match(cap.captureStatement(pattern), /not proven zero-click/i);
});

await test('no fake zero-click count in statements', async () => {
  for (const pattern of [
    'HIGH_VISIBILITY_LOW_CLICK_CAPTURE',
    'SERP_FEATURE_EXPOSURE',
    'AI_VISIBILITY_WITHOUT_OBSERVED_TRAFFIC',
  ]) {
    const statement = cap.captureStatement(pattern);
    assert.doesNotMatch(statement, /stole/i);
    assert.doesNotMatch(statement, /definitely/i);
  }
});

await test('unavailable is not zero', async () => {
  assert.equal(
    cap.capturePattern({
      impressions: null,
      clicks: null,
      position: null,
      hasSerpFeatures: false,
      hasAiCitation: false,
      commercialTier: 'UNAVAILABLE',
      hasRanking: false,
    }),
    'INSUFFICIENT_EVIDENCE',
  );
});

await test('low impressions cannot diagnose capture', async () => {
  assert.equal(
    cap.capturePattern({
      impressions: 40,
      clicks: 0,
      position: 5,
      hasSerpFeatures: false,
      hasAiCitation: false,
      commercialTier: 'HIGH_COMMERCIAL',
      hasRanking: true,
    }),
    'INSUFFICIENT_EVIDENCE',
  );
});

await test('cannot-measure disclosure covers five gaps', async () => {
  assert.equal(cap.CANNOT_MEASURE.length >= 5, true);
  const joined = cap.CANNOT_MEASURE.join(' ').toLowerCase();
  assert.match(joined, /zero-click session/);
  assert.match(joined, /ai referral traffic/);
  assert.match(joined, /revenue attribution/);
  assert.match(joined, /causal/);
});

/* ---------- CTR (10) ---------- */

await test('strong rank low ctr is high ctr opportunity', async () => {
  assert.equal(
    cap.ctrDiagnosis({ impressions: 2000, clicks: 8, position: 4 }),
    'HIGH_CTR_OPPORTUNITY',
  );
});

await test('weak rank low ctr is ranking first', async () => {
  assert.equal(
    cap.ctrDiagnosis({ impressions: 2000, clicks: 8, position: 28 }),
    'RANKING_FIRST',
  );
});

await test('strong ctr is captured well', async () => {
  assert.equal(
    cap.ctrDiagnosis({ impressions: 2000, clicks: 200, position: 2 }),
    'CAPTURED_WELL',
  );
});

await test('mid ctr is captured well', async () => {
  assert.equal(
    cap.ctrDiagnosis({ impressions: 2000, clicks: 60, position: 6 }),
    'CAPTURED_WELL',
  );
});

await test('low impressions is insufficient demand', async () => {
  assert.equal(
    cap.ctrDiagnosis({ impressions: 100, clicks: 0, position: 3 }),
    'INSUFFICIENT_DEMAND',
  );
});

await test('null metrics is insufficient demand', async () => {
  assert.equal(
    cap.ctrDiagnosis({ impressions: null, clicks: null, position: null }),
    'INSUFFICIENT_DEMAND',
  );
});

await test('ctr improved on meaningful lift', async () => {
  assert.equal(cap.ctrTrend(0.02, 0.01), 'CTR_IMPROVED');
});

await test('ctr declined on meaningful drop', async () => {
  assert.equal(cap.ctrTrend(0.005, 0.02), 'CTR_DECLINED');
});

await test('ctr stable within tolerance', async () => {
  assert.equal(cap.ctrTrend(0.02, 0.0205), 'CTR_STABLE');
});

await test('ctr unknown without previous window', async () => {
  assert.equal(cap.ctrTrend(0.02, null), 'UNKNOWN');
  assert.equal(cap.ctrTrend(null, null), 'UNKNOWN');
});

/* ---------- COMMERCIAL (10) ---------- */

await test('transactional is high commercial', async () => {
  assert.equal(
    cap.commercialTier({ intent: 'TRANSACTIONAL' }),
    'HIGH_COMMERCIAL',
  );
});

await test('comparison is high commercial', async () => {
  assert.equal(
    cap.commercialTier({ intent: 'COMPARISON' }),
    'HIGH_COMMERCIAL',
  );
});

await test('high priority is high commercial', async () => {
  assert.equal(
    cap.commercialTier({ intent: 'INFORMATIONAL', priority: 'HIGH' }),
    'HIGH_COMMERCIAL',
  );
});

await test('commercial intent with cpc is medium', async () => {
  assert.equal(
    cap.commercialTier({ intent: 'COMMERCIAL', cpc: 2.5 }),
    'MEDIUM_COMMERCIAL',
  );
});

await test('cpc alone is medium commercial', async () => {
  assert.equal(
    cap.commercialTier({ cpc: 1.2 }),
    'MEDIUM_COMMERCIAL',
  );
});

await test('informational is low commercial', async () => {
  assert.equal(
    cap.commercialTier({ intent: 'INFORMATIONAL' }),
    'LOW_COMMERCIAL',
  );
});

await test('no signals is unavailable', async () => {
  assert.equal(cap.commercialTier({}), 'UNAVAILABLE');
});

await test('high commercial without ranking is visibility gap', async () => {
  assert.equal(
    cap.commercialGap({
      tier: 'HIGH_COMMERCIAL',
      hasRanking: false,
      position: null,
      ctr: 0.002,
      leads: 0,
      revenue: 0,
    }),
    'COMMERCIAL_VISIBILITY_GAP',
  );
});

await test('strong rank low ctr is commercial ctr gap', async () => {
  assert.equal(
    cap.commercialGap({
      tier: 'MEDIUM_COMMERCIAL',
      hasRanking: true,
      position: 5,
      ctr: 0.004,
      leads: 0,
      revenue: 0,
    }),
    'COMMERCIAL_CTR_GAP',
  );
});

await test('connected revenue is observed not inferred', async () => {
  assert.equal(
    cap.commercialGap({
      tier: 'HIGH_COMMERCIAL',
      hasRanking: true,
      position: 3,
      ctr: 0.04,
      leads: 4,
      revenue: 1200,
    }),
    'COMMERCIAL_OUTCOME_OBSERVED',
  );
  assert.equal(
    cap.commercialGap({
      tier: 'HIGH_COMMERCIAL',
      hasRanking: true,
      position: 3,
      ctr: 0.04,
      leads: 0,
      revenue: 0,
    }),
    'COMMERCIAL_OUTCOME_UNAVAILABLE',
  );
});

/* ---------- SERP (6) ---------- */

await test('observed features are surfaced', async () => {
  assert.equal(
    cap.serpClickContext({
      features: ['ai_overview', 'people_also_ask'],
      ctr: 0.004,
    }),
    'SERP_FEATURE_COMPETITION',
  );
});

await test('no features is explicit', async () => {
  assert.equal(
    cap.serpClickContext({ features: [], ctr: 0.004 }),
    'NO_OBSERVED_FEATURE',
  );
});

await test('features with healthy ctr are not competition', async () => {
  assert.equal(
    cap.serpClickContext({
      features: ['featured_snippet'],
      ctr: 0.08,
    }),
    'NO_OBSERVED_FEATURE',
  );
});

await test('no ctr is insufficient evidence', async () => {
  assert.equal(
    cap.serpClickContext({ features: ['video'], ctr: null }),
    'INSUFFICIENT_EVIDENCE',
  );
});

await test('serp exposure pattern needs observed features', async () => {
  assert.equal(
    cap.capturePattern({
      impressions: 3000,
      clicks: 12,
      position: 12,
      hasSerpFeatures: true,
      hasAiCitation: false,
      commercialTier: 'LOW_COMMERCIAL',
      hasRanking: true,
    }),
    'SERP_FEATURE_EXPOSURE',
  );
  assert.equal(
    cap.capturePattern({
      impressions: 3000,
      clicks: 12,
      position: 12,
      hasSerpFeatures: false,
      hasAiCitation: false,
      commercialTier: 'LOW_COMMERCIAL',
      hasRanking: true,
    }),
    'HIGH_CTR_OPPORTUNITY',
  );
});

await test('no causal claim in serp statement', async () => {
  assert.match(
    cap.captureStatement('SERP_FEATURE_EXPOSURE'),
    /never as its cause/,
  );
});

/* ---------- AI (7) ---------- */

await test('google strong ai strong', async () => {
  assert.equal(
    cap.aiSearchRelationship({ googleStrong: true, aiStrong: true }),
    'GOOGLE_STRONG_AI_STRONG',
  );
});

await test('google strong ai weak', async () => {
  assert.equal(
    cap.aiSearchRelationship({ googleStrong: true, aiStrong: false }),
    'GOOGLE_STRONG_AI_WEAK',
  );
});

await test('google weak ai strong', async () => {
  assert.equal(
    cap.aiSearchRelationship({ googleStrong: false, aiStrong: true }),
    'GOOGLE_WEAK_AI_STRONG',
  );
});

await test('google weak ai weak', async () => {
  assert.equal(
    cap.aiSearchRelationship({ googleStrong: false, aiStrong: false }),
    'GOOGLE_WEAK_AI_WEAK',
  );
});

await test('missing side is insufficient evidence', async () => {
  assert.equal(
    cap.aiSearchRelationship({ googleStrong: true, aiStrong: null }),
    'INSUFFICIENT_EVIDENCE',
  );
});

await test('ai citation without clicks is honest', async () => {
  assert.equal(
    cap.capturePattern({
      impressions: 1200,
      clicks: 0,
      position: 6,
      hasSerpFeatures: false,
      hasAiCitation: true,
      commercialTier: 'MEDIUM_COMMERCIAL',
      hasRanking: true,
    }),
    'AI_VISIBILITY_WITHOUT_OBSERVED_TRAFFIC',
  );
  assert.match(
    cap.captureStatement('AI_VISIBILITY_WITHOUT_OBSERVED_TRAFFIC'),
    /unavailable/i,
  );
});

await test('no combined ai plus seo score', async () => {
  assert.equal('aiSeoScore' in cap, false);
  assert.equal('combinedScore' in cap, false);
});

/* ---------- BUSINESS (5) ---------- */

await test('clicks without leads is traffic without lead', async () => {
  assert.equal(
    cap.pageDiagnosis({
      impressions: 4000,
      clicks: 120,
      position: 4,
      commercialQueries: 0,
      hasSerpFeatures: false,
      hasAiCitation: false,
      aiTraffic: null,
      leads: 0,
      revenue: 0,
      hasRanking: true,
    }),
    'TRAFFIC_WITHOUT_LEAD_EVIDENCE',
  );
});

await test('leads without revenue is honest', async () => {
  assert.equal(
    cap.pageDiagnosis({
      impressions: 4000,
      clicks: 200,
      position: 2,
      commercialQueries: 0,
      hasSerpFeatures: false,
      hasAiCitation: false,
      aiTraffic: null,
      leads: 5,
      revenue: 0,
      hasRanking: true,
    }),
    'LEAD_WITHOUT_REVENUE_EVIDENCE',
  );
});

await test('strong rank low ctr page diagnosis', async () => {
  assert.equal(
    cap.pageDiagnosis({
      impressions: 6000,
      clicks: 20,
      position: 3,
      commercialQueries: 0,
      hasSerpFeatures: false,
      hasAiCitation: false,
      aiTraffic: null,
      leads: 0,
      revenue: 0,
      hasRanking: true,
    }),
    'HIGH_VISIBILITY_LOW_CTR',
  );
});

await test('no ranking is ranking gap', async () => {
  assert.equal(
    cap.pageDiagnosis({
      impressions: 900,
      clicks: 9,
      position: null,
      commercialQueries: 0,
      hasSerpFeatures: false,
      hasAiCitation: false,
      aiTraffic: null,
      leads: 0,
      revenue: 0,
      hasRanking: false,
    }),
    'RANKING_GAP',
  );
});

await test('thin evidence is insufficient', async () => {
  assert.equal(
    cap.pageDiagnosis({
      impressions: 30,
      clicks: 1,
      position: 8,
      commercialQueries: 0,
      hasSerpFeatures: false,
      hasAiCitation: false,
      aiTraffic: null,
      leads: 0,
      revenue: 0,
      hasRanking: true,
    }),
    'INSUFFICIENT_EVIDENCE',
  );
});

/* ---------- STRIKING DISTANCE (3) ---------- */

await test('striking distance reuses 4 to 20', async () => {
  assert.equal(cap.CAPTURE_THRESHOLDS.strikingMin, 4);
  assert.equal(cap.CAPTURE_THRESHOLDS.strikingMax, 20);
  assert.equal(
    cap.isStrikingDistanceCommercial(11, 'HIGH_COMMERCIAL'),
    true,
  );
  assert.equal(
    cap.isStrikingDistanceCommercial(3, 'HIGH_COMMERCIAL'),
    false,
  );
  assert.equal(
    cap.isStrikingDistanceCommercial(21, 'HIGH_COMMERCIAL'),
    false,
  );
});

await test('striking distance needs commercial tier', async () => {
  assert.equal(
    cap.isStrikingDistanceCommercial(11, 'LOW_COMMERCIAL'),
    false,
  );
  assert.equal(
    cap.isStrikingDistanceCommercial(11, 'MEDIUM_COMMERCIAL'),
    true,
  );
});

await test('null position is never striking', async () => {
  assert.equal(
    cap.isStrikingDistanceCommercial(null, 'HIGH_COMMERCIAL'),
    false,
  );
});

/* ---------- GROUPS + ACTION (8) ---------- */

await test('high impression low ctr groups', async () => {
  const groups = cap.opportunityGroups({
    impressions: 4000,
    clicks: 10,
    position: 5,
    tier: 'LOW_COMMERCIAL',
    hasRanking: true,
    hasAiCitation: false,
    aiStrong: false,
    googleStrong: true,
    leads: 0,
    revenue: 0,
  });
  assert.ok(groups.includes('HIGH_IMPRESSION_LOW_CTR'));
  assert.ok(groups.includes('STRONG_RANK_LOW_CTR'));
});

await test('commercial low visibility groups', async () => {
  const groups = cap.opportunityGroups({
    impressions: 800,
    clicks: 2,
    position: null,
    tier: 'HIGH_COMMERCIAL',
    hasRanking: false,
    hasAiCitation: false,
    aiStrong: null,
    googleStrong: null,
    leads: 0,
    revenue: 0,
  });
  assert.ok(groups.includes('HIGH_COMMERCIAL_LOW_VISIBILITY'));
});

await test('striking commercial groups', async () => {
  const groups = cap.opportunityGroups({
    impressions: 800,
    clicks: 20,
    position: 11,
    tier: 'HIGH_COMMERCIAL',
    hasRanking: true,
    hasAiCitation: false,
    aiStrong: false,
    googleStrong: false,
    leads: 0,
    revenue: 0,
  });
  assert.ok(groups.includes('STRIKING_DISTANCE_COMMERCIAL'));
});

await test('outcome connected groups', async () => {
  const groups = cap.opportunityGroups({
    impressions: 2000,
    clicks: 150,
    position: 2,
    tier: 'HIGH_COMMERCIAL',
    hasRanking: true,
    hasAiCitation: false,
    aiStrong: false,
    googleStrong: true,
    leads: 3,
    revenue: 900,
  });
  assert.ok(groups.includes('OUTCOME_CONNECTED_SEARCH'));
});

await test('ai visible search weak groups', async () => {
  const groups = cap.opportunityGroups({
    impressions: 700,
    clicks: 5,
    position: 14,
    tier: 'LOW_COMMERCIAL',
    hasRanking: true,
    hasAiCitation: true,
    aiStrong: true,
    googleStrong: false,
    leads: 0,
    revenue: 0,
  });
  assert.ok(groups.includes('AI_VISIBLE_SEARCH_WEAK'));
});

await test('group to nba uses existing vocabulary', async () => {
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
  for (const group of [
    'HIGH_IMPRESSION_LOW_CTR',
    'HIGH_COMMERCIAL_LOW_VISIBILITY',
    'STRIKING_DISTANCE_COMMERCIAL',
    'STRONG_RANK_LOW_CTR',
    'AI_VISIBLE_SEARCH_WEAK',
    'TRAFFIC_WITHOUT_OUTCOME_EVIDENCE',
    'OUTCOME_CONNECTED_SEARCH',
  ]) {
    assert.ok(allowed.has(cap.mapGroupToNba(group)));
  }
});

await test('commercial gap maps to improve or create', async () => {
  assert.equal(
    cap.mapGroupToNba('HIGH_COMMERCIAL_LOW_VISIBILITY'),
    'CREATE_CONTENT',
  );
  assert.equal(
    cap.mapGroupToNba('STRIKING_DISTANCE_COMMERCIAL'),
    'IMPROVE_EXISTING_PAGE',
  );
  assert.equal(
    cap.mapGroupToNba('OUTCOME_CONNECTED_SEARCH'),
    'PROTECT_WINNING_PAGE',
  );
});

await test('page diagnosis maps without second system', async () => {
  assert.equal(
    cap.mapPageDiagnosisToNba('HIGH_VISIBILITY_LOW_CTR'),
    'IMPROVE_EXISTING_PAGE',
  );
  assert.equal(
    cap.mapPageDiagnosisToNba('RANKING_GAP'),
    'CREATE_CONTENT',
  );
  assert.equal(
    cap.mapPageDiagnosisToNba('INSUFFICIENT_EVIDENCE'),
    'MONITOR_CHANGE',
  );
  assert.equal('priorityScore' in cap, false);
});

/* ---------- MEASUREMENT + EVIDENCE (5) ---------- */

await test('no causality in capture statements', async () => {
  for (const pattern of [
    'HIGH_VISIBILITY_LOW_CLICK_CAPTURE',
    'HIGH_CTR_OPPORTUNITY',
    'LOW_VISIBILITY',
    'COMMERCIAL_VISIBILITY_GAP',
    'AI_VISIBILITY_WITHOUT_OBSERVED_TRAFFIC',
    'SERP_FEATURE_EXPOSURE',
    'INSUFFICIENT_EVIDENCE',
  ]) {
    assert.doesNotMatch(
      cap.captureStatement(pattern),
      /caused/i,
    );
  }
});

await test('thresholds are explicit and documented', async () => {
  assert.equal(cap.CAPTURE_THRESHOLDS.visibleImpressions, 500);
  assert.equal(cap.CAPTURE_THRESHOLDS.lowCtr, 0.01);
  assert.equal(cap.CAPTURE_THRESHOLDS.strongCtr, 0.05);
  assert.equal(cap.CAPTURE_THRESHOLDS.strongPosition, 10);
});

await test('commercial query types map to research intent', async () => {
  assert.ok(cap.COMMERCIAL_QUERY_TYPES.includes('PRICING'));
  assert.ok(cap.COMMERCIAL_QUERY_TYPES.includes('COMPARE'));
  assert.equal(cap.COMMERCIAL_QUERY_TYPES.length, 10);
});

await test('no numeric opportunity score exported', async () => {
  assert.equal('opportunityScore' in cap, false);
  assert.equal('captureScore' in cap, false);
  assert.equal('commercialScore' in cap, false);
});

await test('grouping is deterministic', async () => {
  const input = {
    impressions: 4000,
    clicks: 10,
    position: 5,
    tier: 'HIGH_COMMERCIAL',
    hasRanking: true,
    hasAiCitation: false,
    aiStrong: false,
    googleStrong: true,
    leads: 0,
    revenue: 0,
  };
  assert.deepEqual(
    cap.opportunityGroups(input),
    cap.opportunityGroups(input),
  );
});

/* ---------- SECURITY + PERFORMANCE (2) ---------- */

await test('no tenant fields inside pure layer', async () => {
  assert.equal('organizationId' in cap, false);
  assert.equal('tenantId' in cap, false);
});

await test('bounds are explicit constants', async () => {
  assert.ok(cap.CAPTURE_THRESHOLDS.visibleImpressions > 0);
});

const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(`\nSearch Capture: ${results.length - failed.length}/${results.length} passed`);
for (const r of results) console.log(r);
if (failed.length > 0) process.exit(1);

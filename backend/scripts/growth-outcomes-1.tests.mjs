/*
 * RENKOO Search Growth Outcome Loop 1.0 — tests (Phase 37).
 *
 * 208 tests over pure functions only: before/after,
 * baselines, measurement windows, TOO_EARLY, outcome
 * classification, deterministic interpretations,
 * causality wording, AI presence (citation never
 * upgraded to recommendation), AI layers, agentic
 * readiness evidence, next-decision rules, business
 * hierarchy, headlines, agency reporting,
 * determinism, bounded performance, honesty
 * invariants. No DB, no provider calls, no AI calls,
 * no billing touch.
 *
 * Run: npm run test:growth-outcomes-1   (dist built)
 */
import assert from 'node:assert/strict';

const go = await import(
  '../dist/growth-plan/growth-outcomes.js'
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

/* ---------- vocab (4) ---------- */

await test('signals ten', async () => {
  assert.equal(go.OUTCOME_SIGNALS.length, 10);
});

await test('windows four', async () => {
  assert.deepEqual([...go.MEASURE_WINDOWS], [7, 14, 28, 90]);
});

await test('max signals five', async () => {
  assert.equal(go.MAX_OUTCOME_SIGNALS, 5);
});

await test('max actions ten', async () => {
  assert.equal(go.MAX_OUTCOME_ACTIONS, 10);
});

/* ---------- before/after (22) ---------- */

await test('rank improved lower better', async () => {
  const r = go.beforeAfter({ before: 11, after: 7, lowerIsBetter: true });
  assert.equal(r.delta, -4);
  assert.equal(r.direction, 'UP');
  assert.equal(r.baseline, 'AVAILABLE');
});

await test('rank declined lower better', async () => {
  const r = go.beforeAfter({ before: 7, after: 12, lowerIsBetter: true });
  assert.equal(r.delta, 5);
  assert.equal(r.direction, 'DOWN');
});

await test('rank flat', async () => {
  const r = go.beforeAfter({ before: 7, after: 7, lowerIsBetter: true });
  assert.equal(r.direction, 'FLAT');
  assert.equal(r.delta, 0);
});

await test('traffic improved higher better', async () => {
  const r = go.beforeAfter({ before: 100, after: 150 });
  assert.equal(r.delta, 50);
  assert.equal(r.direction, 'UP');
});

await test('traffic declined', async () => {
  const r = go.beforeAfter({ before: 150, after: 100 });
  assert.equal(r.direction, 'DOWN');
});

await test('traffic flat', async () => {
  assert.equal(go.beforeAfter({ before: 5, after: 5 }).direction, 'FLAT');
});

await test('null before unavailable', async () => {
  const r = go.beforeAfter({ before: null, after: 7, lowerIsBetter: true });
  assert.equal(r.baseline, 'BASELINE_UNAVAILABLE');
  assert.equal(r.direction, 'UNKNOWN');
  assert.equal(r.delta, null);
  assert.equal(r.before, null);
  assert.equal(r.after, 7);
});

await test('null after unavailable', async () => {
  const r = go.beforeAfter({ before: 7, after: null, lowerIsBetter: true });
  assert.equal(r.baseline, 'BASELINE_UNAVAILABLE');
  assert.equal(r.after, null);
});

await test('both null unavailable', async () => {
  const r = go.beforeAfter({ before: null, after: null });
  assert.equal(r.baseline, 'BASELINE_UNAVAILABLE');
});

await test('undefined baselines', async () => {
  assert.equal(go.beforeAfter({}).baseline, 'BASELINE_UNAVAILABLE');
});

await test('nan baselines', async () => {
  assert.equal(go.beforeAfter({ before: 'nope', after: 5 }).baseline, 'BASELINE_UNAVAILABLE');
});

await test('string numbers coerce', async () => {
  const r = go.beforeAfter({ before: '11', after: '7', lowerIsBetter: true });
  assert.equal(r.direction, 'UP');
  assert.equal(r.delta, -4);
});

await test('zero valid value', async () => {
  const r = go.beforeAfter({ before: 0, after: 5 });
  assert.equal(r.baseline, 'AVAILABLE');
  assert.equal(r.direction, 'UP');
});

await test('evidence default observed', async () => {
  assert.equal(go.beforeAfter({ before: 1, after: 2 }).evidenceState, 'OBSERVED');
});

await test('evidence custom', async () => {
  assert.equal(go.beforeAfter({ before: 1, after: 2, evidenceState: 'ATTRIBUTED' }).evidenceState, 'ATTRIBUTED');
});

await test('window default', async () => {
  assert.match(go.beforeAfter({ before: 1, after: 2 }).window, /window/);
});

await test('window custom', async () => {
  assert.equal(go.beforeAfter({ before: 1, after: 2, window: '28d' }).window, '28d');
});

await test('delta after minus before', async () => {
  assert.equal(go.beforeAfter({ before: 3, after: 10 }).delta, 7);
});

await test('large movements', async () => {
  assert.equal(go.beforeAfter({ before: 100, after: 1, lowerIsBetter: true }).direction, 'UP');
});

await test('decimals', async () => {
  const r = go.beforeAfter({ before: 7.2, after: 8.1, lowerIsBetter: true });
  assert.equal(r.direction, 'DOWN');
});

await test('negative values finite', async () => {
  assert.equal(go.beforeAfter({ before: -5, after: -2 }).baseline, 'AVAILABLE');
});

await test('infinite unavailable', async () => {
  assert.equal(go.beforeAfter({ before: Infinity, after: 5 }).baseline, 'BASELINE_UNAVAILABLE');
});

/* ---------- windows (14) ---------- */

await test('window 7 valid', async () => {
  assert.equal(go.normalizeWindow(7), 7);
});

await test('window 14 valid', async () => {
  assert.equal(go.normalizeWindow(14), 14);
});

await test('window 28 valid', async () => {
  assert.equal(go.normalizeWindow(28), 28);
});

await test('window 90 valid', async () => {
  assert.equal(go.normalizeWindow(90), 90);
});

await test('window invalid null', async () => {
  assert.equal(go.normalizeWindow(30), null);
  assert.equal(go.normalizeWindow('nope'), null);
  assert.equal(go.normalizeWindow(null), null);
});

await test('readiness no timestamp', async () => {
  const r = go.windowReadiness({ verifiedAtIso: null, windowDays: 28 });
  assert.equal(r.ready, false);
  assert.equal(r.state, 'TOO_EARLY_TO_JUDGE');
  assert.match(r.note, /not failure/);
});

await test('readiness elapsed short', async () => {
  const r = go.windowReadiness({
    verifiedAtIso: '2026-09-10T00:00:00.000Z',
    windowDays: 28,
    nowIso: '2026-09-15T00:00:00.000Z',
  });
  assert.equal(r.ready, false);
  assert.match(r.note, /5 of 28 days/);
});

await test('readiness elapsed ok', async () => {
  const r = go.windowReadiness({
    verifiedAtIso: '2026-08-01T00:00:00.000Z',
    windowDays: 28,
    nowIso: '2026-09-15T00:00:00.000Z',
  });
  assert.equal(r.ready, true);
  assert.equal(r.state, 'READY');
});

await test('readiness invalid dates', async () => {
  const r = go.windowReadiness({ verifiedAtIso: 'nope', windowDays: 28, nowIso: 'also-nope' });
  assert.equal(r.ready, false);
  assert.equal(r.state, 'TOO_EARLY_TO_JUDGE');
});

await test('readiness boundary exact', async () => {
  const r = go.windowReadiness({
    verifiedAtIso: '2026-08-18T00:00:00.000Z',
    windowDays: 28,
    nowIso: '2026-09-15T00:00:00.000Z',
  });
  assert.equal(r.ready, true);
});

await test('readiness future verification', async () => {
  const r = go.windowReadiness({
    verifiedAtIso: '2026-09-20T00:00:00.000Z',
    windowDays: 28,
    nowIso: '2026-09-15T00:00:00.000Z',
  });
  assert.equal(r.ready, false);
});

await test('readiness 7d window', async () => {
  const r = go.windowReadiness({
    verifiedAtIso: '2026-09-01T00:00:00.000Z',
    windowDays: 7,
    nowIso: '2026-09-15T00:00:00.000Z',
  });
  assert.equal(r.ready, true);
});

await test('readiness note withheld', async () => {
  assert.match(
    go.windowReadiness({ verifiedAtIso: 'nope', windowDays: 28 }).note,
    /withheld|never guessed/,
  );
});

await test('window source only', async () => {
  assert.equal(go.normalizeWindow(0), null);
  assert.equal(go.normalizeWindow(-5), null);
});

/* ---------- classification (16) ---------- */

function cls(o = {}) {
  return go.classifyOutcome({
    directions: [],
    conflictingSources: false,
    dataSufficient: true,
    measured: true,
    ...o,
  });
}

await test('classify not measured', async () => {
  assert.equal(cls({ measured: false }), 'NOT_MEASURED');
});

await test('classify conflicting', async () => {
  assert.equal(cls({ directions: ['UP'], conflictingSources: true }), 'CONFLICTING_SIGNAL');
});

await test('classify insufficient', async () => {
  assert.equal(cls({ directions: ['UP'], dataSufficient: false }), 'INSUFFICIENT_DATA');
});

await test('classify empty unknown', async () => {
  assert.equal(cls({ directions: [] }), 'INSUFFICIENT_DATA');
  assert.equal(cls({ directions: ['UNKNOWN', 'UNKNOWN'] }), 'INSUFFICIENT_DATA');
});

await test('classify positive', async () => {
  assert.equal(cls({ directions: ['UP', 'FLAT'] }), 'OBSERVED_POSITIVE_CHANGE');
});

await test('classify negative', async () => {
  assert.equal(cls({ directions: ['DOWN', 'UNKNOWN'] }), 'OBSERVED_NEGATIVE_CHANGE');
});

await test('classify flat', async () => {
  assert.equal(cls({ directions: ['FLAT', 'FLAT'] }), 'NO_MATERIAL_CHANGE');
});

await test('classify mixed', async () => {
  assert.equal(cls({ directions: ['UP', 'DOWN'] }), 'MIXED_SIGNAL');
});

await test('classify conflicting beats insufficient', async () => {
  assert.equal(cls({ directions: [], conflictingSources: true, dataSufficient: false }), 'CONFLICTING_SIGNAL');
});

await test('classify not measured beats all', async () => {
  assert.equal(cls({ directions: ['UP'], conflictingSources: true, measured: false }), 'NOT_MEASURED');
});

await test('classify single up', async () => {
  assert.equal(cls({ directions: ['UP'] }), 'OBSERVED_POSITIVE_CHANGE');
});

await test('classify single down', async () => {
  assert.equal(cls({ directions: ['DOWN'] }), 'OBSERVED_NEGATIVE_CHANGE');
});

await test('classify mixed three', async () => {
  assert.equal(cls({ directions: ['UP', 'FLAT', 'DOWN'] }), 'MIXED_SIGNAL');
});

await test('classify flat unknown', async () => {
  assert.equal(cls({ directions: ['FLAT', 'UNKNOWN'] }), 'NO_MATERIAL_CHANGE');
});

await test('classify deterministic', async () => {
  assert.equal(cls({ directions: ['UP', 'DOWN'] }), cls({ directions: ['UP', 'DOWN'] }));
});

await test('classify order independent', async () => {
  assert.equal(cls({ directions: ['UP', 'DOWN'] }), cls({ directions: ['DOWN', 'UP'] }));
});

/* ---------- interpretations (12) ---------- */

await test('interp positive', async () => {
  const s = go.interpretationFor('OBSERVED_POSITIVE_CHANGE');
  assert.match(s, /improved during the measurement window/);
  assert.match(s, /not proof/);
});

await test('interp negative', async () => {
  const s = go.interpretationFor('OBSERVED_NEGATIVE_CHANGE');
  assert.match(s, /cause unknown/);
});

await test('interp no material', async () => {
  assert.match(go.interpretationFor('NO_MATERIAL_CHANGE'), /No material change/);
});

await test('interp mixed', async () => {
  const s = go.interpretationFor('MIXED_SIGNAL');
  assert.match(s, /rank improved while CTR declined/);
  assert.match(s, /No single conclusion/);
});

await test('interp insufficient', async () => {
  assert.match(go.interpretationFor('INSUFFICIENT_DATA'), /Not enough data/);
});

await test('interp too early', async () => {
  const s = go.interpretationFor('TOO_EARLY_TO_JUDGE');
  assert.match(s, /not yet sufficient/);
  assert.match(s, /Not failure/);
});

await test('interp conflicting', async () => {
  assert.match(go.interpretationFor('CONFLICTING_SIGNAL'), /no outcome conclusion/);
});

await test('interp measuring', async () => {
  assert.match(go.interpretationFor('MEASURING'), /withheld/);
});

await test('interp unavailable', async () => {
  const s = go.interpretationFor('UNAVAILABLE');
  assert.match(s, /unavailable/);
  assert.match(s, /never zero/);
});

await test('interp not measured', async () => {
  assert.match(go.interpretationFor('NOT_MEASURED'), /Not yet measured/);
});

await test('interp all signals covered', async () => {
  for (const s of go.OUTCOME_SIGNALS) {
    assert.ok(go.interpretationFor(s).length > 5);
  }
});

await test('interp no caused language', async () => {
  for (const s of go.OUTCOME_SIGNALS) {
    assert.doesNotMatch(go.interpretationFor(s), /caused by|because of/i);
  }
});

/* ---------- causality wording (5) ---------- */

await test('after change format', async () => {
  const s = go.afterChange({ metric: 'Rank', movement: '11 → 7' });
  assert.match(s, /Rank 11 → 7 after the change/);
  assert.match(s, /never “caused by”/);
});

await test('observed during format', async () => {
  const s = go.observedDuring('Traffic', '28d');
  assert.match(s, /Traffic during the measurement window \(28d\)/);
  assert.match(s, /not causal proof/);
});

await test('wording traffic example', async () => {
  assert.match(go.afterChange({ metric: 'Traffic', movement: 'increased' }), /Temporal association only/);
});

await test('wording rank example', async () => {
  assert.match(go.observedDuring('Rank', '28d'), /Observed outcome/);
});

await test('wording no caused claim', async () => {
  assert.doesNotMatch(go.afterChange({ metric: 'X', movement: 'Y' }), /caused the|because of/i);
});

/* ---------- AI presence (14) ---------- */

await test('ai recommended', async () => {
  assert.equal(
    go.aiPresence({ cited: true, recommended: true, competitorRecommended: false, providerSupports: true }),
    'RECOMMENDATION_PRESENT',
  );
});

await test('ai recommended beats citation', async () => {
  assert.equal(
    go.aiPresence({ cited: false, recommended: true, competitorRecommended: false, providerSupports: true }),
    'RECOMMENDATION_PRESENT',
  );
});

await test('ai citation competitor preference', async () => {
  assert.equal(
    go.aiPresence({ cited: true, recommended: false, competitorRecommended: true, providerSupports: true }),
    'CITATION_WITH_COMPETITOR_PREFERENCE',
  );
});

await test('ai competitor recommended', async () => {
  assert.equal(
    go.aiPresence({ cited: false, recommended: false, competitorRecommended: true, providerSupports: true }),
    'COMPETITOR_RECOMMENDED',
  );
});

await test('ai competitor null cited', async () => {
  assert.equal(
    go.aiPresence({ cited: null, recommended: false, competitorRecommended: true, providerSupports: true }),
    'COMPETITOR_RECOMMENDED',
  );
});

await test('ai citation present', async () => {
  assert.equal(
    go.aiPresence({ cited: true, recommended: false, competitorRecommended: false, providerSupports: true }),
    'CITATION_PRESENT',
  );
});

await test('ai citation null recommended', async () => {
  assert.equal(
    go.aiPresence({ cited: true, recommended: null, competitorRecommended: null, providerSupports: true }),
    'CITATION_PRESENT',
  );
});

await test('ai no presence', async () => {
  assert.equal(
    go.aiPresence({ cited: false, recommended: false, competitorRecommended: false, providerSupports: true }),
    'NO_AI_PRESENCE',
  );
});

await test('ai unknown no provider', async () => {
  assert.equal(
    go.aiPresence({ cited: true, recommended: true, competitorRecommended: true, providerSupports: false }),
    'UNKNOWN',
  );
});

await test('ai unknown nulls', async () => {
  assert.equal(
    go.aiPresence({ cited: null, recommended: null, competitorRecommended: null, providerSupports: true }),
    'UNKNOWN',
  );
});

await test('ai unknown partial', async () => {
  assert.equal(
    go.aiPresence({ cited: null, recommended: false, competitorRecommended: false, providerSupports: true }),
    'UNKNOWN',
  );
});

await test('ai citation never recommendation', async () => {
  assert.notEqual(
    go.aiPresence({ cited: true, recommended: null, competitorRecommended: null, providerSupports: true }),
    'RECOMMENDATION_PRESENT',
  );
});

await test('ai deterministic', async () => {
  const a = { cited: true, recommended: false, competitorRecommended: false, providerSupports: true };
  assert.equal(go.aiPresence(a), go.aiPresence(a));
});

await test('ai no fake recommendation', async () => {
  assert.notEqual(
    go.aiPresence({ cited: true, recommended: false, competitorRecommended: false, providerSupports: true }),
    'COMPETITOR_RECOMMENDED',
  );
});

/* ---------- AI layers (3) ---------- */

await test('ai layers six lines', async () => {
  const l = go.aiLayerNote({ mention: 'OBSERVED', citation: 'OBSERVED', referral: 'OBSERVED', conversion: 'UNAVAILABLE', revenue: 'UNAVAILABLE' });
  assert.equal(l.length, 6);
  assert.ok(l[0].startsWith('MENTION:'));
  assert.ok(l[4].startsWith('REVENUE:'));
});

await test('ai layers never combined', async () => {
  assert.match(go.aiLayerNote({ mention: 'a', citation: 'b', referral: 'c', conversion: 'd', revenue: 'e' })[5], /never combined/);
});

await test('ai layers values', async () => {
  const l = go.aiLayerNote({ mention: 'x', citation: 'y', referral: 'z', conversion: 'w', revenue: 'v' });
  assert.ok(l[1].includes('y'));
  assert.ok(l[2].includes('z'));
});

/* ---------- agentic readiness (9) ---------- */

await test('agentic all null unverified', async () => {
  assert.deepEqual(
    go.agenticEvidence({ priceAccessible: null, contactAccessible: null, productInfoAccessible: null, structuredData: null, formAccessible: null }),
    ['UNVERIFIED'],
  );
});

await test('agentic all false unverified', async () => {
  assert.deepEqual(
    go.agenticEvidence({ priceAccessible: false, contactAccessible: false, productInfoAccessible: false, structuredData: false, formAccessible: false }),
    ['UNVERIFIED'],
  );
});

await test('agentic price', async () => {
  assert.deepEqual(
    go.agenticEvidence({ priceAccessible: true, contactAccessible: null, productInfoAccessible: null, structuredData: null, formAccessible: null }),
    ['PRICE_ACCESSIBLE'],
  );
});

await test('agentic contact', async () => {
  assert.ok(go.agenticEvidence({ priceAccessible: null, contactAccessible: true, productInfoAccessible: null, structuredData: null, formAccessible: null }).includes('CONTACT_PATH_ACCESSIBLE'));
});

await test('agentic product info', async () => {
  assert.ok(go.agenticEvidence({ priceAccessible: null, contactAccessible: null, productInfoAccessible: true, structuredData: null, formAccessible: null }).includes('PRODUCT_INFORMATION_ACCESSIBLE'));
});

await test('agentic structured data', async () => {
  assert.ok(go.agenticEvidence({ priceAccessible: null, contactAccessible: null, productInfoAccessible: null, structuredData: true, formAccessible: null }).includes('STRUCTURED_DATA_PRESENT'));
});

await test('agentic form', async () => {
  assert.ok(go.agenticEvidence({ priceAccessible: null, contactAccessible: null, productInfoAccessible: null, structuredData: null, formAccessible: true }).includes('FORM_ACCESSIBLE'));
});

await test('agentic note unverified', async () => {
  assert.match(go.agentCapabilityNote(['UNVERIFIED']), /UNVERIFIED/);
  assert.match(go.agentCapabilityNote(['UNVERIFIED']), /never scored|no .* claim/i);
});

await test('agentic note evidence', async () => {
  const n = go.agentCapabilityNote(['PRICE_ACCESSIBLE', 'FORM_ACCESSIBLE']);
  assert.match(n, /PRICE_ACCESSIBLE/);
  assert.match(n, /never scored/);
});

/* ---------- next decisions (18) ---------- */

function nd(o = {}) {
  return go.nextDecisionFor({ signal: 'NO_MATERIAL_CHANGE', targetAchieved: null, verified: true, ...o });
}

await test('next positive achieved protect', async () => {
  assert.equal(nd({ signal: 'OBSERVED_POSITIVE_CHANGE', targetAchieved: true }), 'PROTECT');
});

await test('next positive incomplete continue', async () => {
  assert.equal(nd({ signal: 'OBSERVED_POSITIVE_CHANGE', targetAchieved: false }), 'CONTINUE');
  assert.equal(nd({ signal: 'OBSERVED_POSITIVE_CHANGE', targetAchieved: null }), 'CONTINUE');
});

await test('next negative investigate', async () => {
  assert.equal(nd({ signal: 'OBSERVED_NEGATIVE_CHANGE' }), 'INVESTIGATE');
});

await test('next no change investigate', async () => {
  assert.equal(nd({ signal: 'NO_MATERIAL_CHANGE' }), 'INVESTIGATE');
});

await test('next mixed investigate', async () => {
  assert.equal(nd({ signal: 'MIXED_SIGNAL' }), 'INVESTIGATE');
});

await test('next insufficient measure', async () => {
  assert.equal(nd({ signal: 'INSUFFICIENT_DATA' }), 'MEASURE');
});

await test('next conflicting investigate', async () => {
  assert.equal(nd({ signal: 'CONFLICTING_SIGNAL' }), 'INVESTIGATE');
});

await test('next early wait', async () => {
  assert.equal(nd({ signal: 'TOO_EARLY_TO_JUDGE' }), 'WAIT');
});

await test('next measuring wait', async () => {
  assert.equal(nd({ signal: 'MEASURING' }), 'WAIT');
});

await test('next not measured verified', async () => {
  assert.equal(nd({ signal: 'NOT_MEASURED', verified: true }), 'MEASURE');
});

await test('next not measured unverified', async () => {
  assert.equal(nd({ signal: 'NOT_MEASURED', verified: false }), 'VERIFY');
});

await test('next unavailable investigate', async () => {
  assert.equal(nd({ signal: 'UNAVAILABLE' }), 'INVESTIGATE');
});

await test('next note routes engine', async () => {
  const n = go.nextDecisionNote('PROTECT');
  assert.match(n, /PROTECT/);
  assert.match(n, /existing Growth Decision Engine/);
  assert.match(n, /nothing auto-created/);
  assert.match(n, /not a prediction/);
});

await test('next note all decisions', async () => {
  for (const d of ['PROTECT', 'CONTINUE', 'IMPROVE', 'INVESTIGATE', 'WAIT', 'MEASURE', 'VERIFY']) {
    assert.ok(go.nextDecisionNote(d).length > 10);
  }
});

await test('next deterministic', async () => {
  assert.equal(nd({ signal: 'MIXED_SIGNAL' }), nd({ signal: 'MIXED_SIGNAL' }));
});

await test('next target null continue', async () => {
  assert.equal(nd({ signal: 'OBSERVED_POSITIVE_CHANGE', targetAchieved: null }), 'CONTINUE');
});

await test('next verified flag only matters unmeasured', async () => {
  assert.equal(nd({ signal: 'NOT_MEASURED', verified: true }), 'MEASURE');
  assert.equal(nd({ signal: 'OBSERVED_POSITIVE_CHANGE', verified: false }), 'CONTINUE');
});

await test('next no predictions text', async () => {
  assert.doesNotMatch(go.nextDecisionNote('IMPROVE'), /will improve|predicted/i);
});

/* ---------- hierarchy (5) ---------- */

await test('hierarchy six layers', async () => {
  assert.equal(go.businessHierarchy({}).length, 6);
});

await test('hierarchy values', async () => {
  const h = go.businessHierarchy({ 'SEARCH VISIBILITY': 'rank 11 → 7', REVENUE: '₹2L recorded' });
  assert.ok(h.some((x) => x === 'SEARCH VISIBILITY: rank 11 → 7'));
  assert.ok(h.some((x) => x === 'REVENUE: ₹2L recorded'));
});

await test('hierarchy missing edges', async () => {
  assert.ok(go.businessHierarchy({}).every((x) => x.includes('missing edge')));
});

await test('hierarchy order traffic after visibility', async () => {
  const h = go.businessHierarchy({});
  assert.ok(h[0].startsWith('SEARCH VISIBILITY:'));
  assert.ok(h[1].startsWith('TRAFFIC:'));
  assert.ok(h[5].startsWith('REVENUE:'));
});

await test('hierarchy never infers next', async () => {
  const h = go.businessHierarchy({ TRAFFIC: 'sessions up' });
  assert.ok(h.some((x) => x === 'LEAD: missing edge'));
});

/* ---------- headlines (6) ---------- */

await test('headline fields', async () => {
  const h = go.headline({ workTitle: 'Fix titles', changed: ['rank 11 → 7'], unchanged: ['leads steady'], unknown: ['revenue'], nextDecision: 'PROTECT' });
  assert.match(h.work, /WORK COMPLETED: Fix titles/);
  assert.match(h.changed, /WHAT CHANGED/);
  assert.match(h.unchanged, /WHAT DID NOT CHANGE/);
  assert.match(h.unknown, /WHAT IS UNKNOWN/);
  assert.match(h.next, /WHAT NEXT: PROTECT/);
});

await test('headline empty changed', async () => {
  assert.match(go.headline({ workTitle: 'w', changed: [], unchanged: [], unknown: [], nextDecision: 'WAIT' }).changed, /nothing material/);
});

await test('headline empty unchanged', async () => {
  assert.match(go.headline({ workTitle: 'w', changed: [], unchanged: [], unknown: [], nextDecision: 'WAIT' }).unchanged, /nothing recorded/);
});

await test('headline empty unknown', async () => {
  assert.match(go.headline({ workTitle: 'w', changed: [], unchanged: [], unknown: [], nextDecision: 'WAIT' }).unknown, /nothing material/);
});

await test('headline next routes', async () => {
  assert.match(go.headline({ workTitle: 'w', changed: [], unchanged: [], unknown: [], nextDecision: 'INVESTIGATE' }).next, /INVESTIGATE/);
});

await test('headline joined lists', async () => {
  const h = go.headline({ workTitle: 'w', changed: ['a', 'b'], unchanged: [], unknown: [], nextDecision: 'WAIT' });
  assert.match(h.changed, /a; b/);
});

/* ---------- agency (5) ---------- */

await test('agency five lines', async () => {
  const a = go.agencyOutcome({ completed: 'Fixed canonical', verified: 'verified', outcome: 'no change yet', status: 'NO_MATERIAL_CHANGE', next: 'WAIT' });
  assert.equal(a.length, 5);
  assert.ok(a[0].startsWith('COMPLETED:'));
  assert.ok(a[1].startsWith('VERIFIED:'));
  assert.ok(a[2].startsWith('OUTCOME:'));
  assert.ok(a[3].startsWith('STATUS:'));
  assert.ok(a[4].startsWith('NEXT:'));
});

await test('agency no seo improved claim', async () => {
  const a = go.agencyOutcome({ completed: 'c', verified: 'v', outcome: 'o', status: 'TOO_EARLY_TO_JUDGE', next: 'WAIT' });
  assert.match(a[3], /TOO_EARLY_TO_JUDGE/);
  assert.doesNotMatch(a.join(' '), /SEO improved/i);
});

await test('agency status text', async () => {
  const a = go.agencyOutcome({ completed: 'c', verified: 'v', outcome: 'o', status: 'MIXED_SIGNAL', next: 'INVESTIGATE' });
  assert.match(a[3], /Mixed signals/);
});

await test('agency deterministic', async () => {
  const mk = () => go.agencyOutcome({ completed: 'c', verified: 'v', outcome: 'o', status: 'INSUFFICIENT_DATA', next: 'MEASURE' });
  assert.deepEqual(mk(), mk());
});

await test('agency next routes', async () => {
  assert.match(go.agencyOutcome({ completed: 'c', verified: 'v', outcome: 'o', status: 'NO_MATERIAL_CHANGE', next: 'INVESTIGATE' })[4], /INVESTIGATE/);
});

/* ---------- outcome key (3) ---------- */

await test('key deterministic', async () => {
  const k = { organizationId: 'o', websiteId: 'w', actionId: 'a', windowDays: 28 };
  assert.equal(go.outcomeKey(k), go.outcomeKey(k));
});

await test('key distinct windows', async () => {
  assert.notEqual(
    go.outcomeKey({ organizationId: 'o', websiteId: 'w', actionId: 'a', windowDays: 28 }),
    go.outcomeKey({ organizationId: 'o', websiteId: 'w', actionId: 'a', windowDays: 90 }),
  );
});

await test('key isolates tenants', async () => {
  assert.notEqual(
    go.outcomeKey({ organizationId: 'o1', websiteId: 'w', actionId: 'a', windowDays: 28 }),
    go.outcomeKey({ organizationId: 'o2', websiteId: 'w', actionId: 'a', windowDays: 28 }),
  );
});

/* ---------- honesty invariants (16) ---------- */

await test('no caused language in wordings', async () => {
  const blob = JSON.stringify([
    go.afterChange({ metric: 'Rank', movement: 'x' }),
    go.observedDuring('Traffic', '28d'),
    ...go.OUTCOME_SIGNALS.map((s) => go.interpretationFor(s)),
  ]);
  assert.doesNotMatch(blob, /caused the improvement|caused revenue|because of this change/i);
  assert.match(blob, /Temporal association only|not causal proof|not proof/);
});

await test('citation never recommendation invariant', async () => {
  for (const cited of [true, false, null]) {
    const p = go.aiPresence({ cited, recommended: null, competitorRecommended: null, providerSupports: true });
    assert.notEqual(p, 'RECOMMENDATION_PRESENT');
  }
});

await test('visibility never traffic invariant', async () => {
  const l = go.aiLayerNote({ mention: 'OBSERVED', citation: 'OBSERVED', referral: 'UNAVAILABLE', conversion: 'UNAVAILABLE', revenue: 'UNAVAILABLE' });
  assert.ok(l.some((x) => x.startsWith('AI REFERRAL: UNAVAILABLE')));
});

await test('traffic never revenue invariant', async () => {
  const h = go.businessHierarchy({ TRAFFIC: 'up' });
  assert.ok(h.some((x) => x === 'REVENUE: missing edge'));
});

await test('execution never outcome invariant', async () => {
  assert.notEqual(go.classifyOutcome({ directions: ['UP'], conflictingSources: false, dataSufficient: true, measured: false }), 'OBSERVED_POSITIVE_CHANGE');
});

await test('no scores anywhere', async () => {
  assert.doesNotMatch(JSON.stringify([go.OUTCOME_SIGNALS, go.MEASURE_WINDOWS]), /score/i);
  assert.doesNotMatch(go.nextDecisionNote('PROTECT'), /score/i);
});

await test('no forecasting', async () => {
  const blob = JSON.stringify(go.OUTCOME_SIGNALS.map((s) => go.interpretationFor(s)));
  assert.doesNotMatch(blob, /forecast|projected|expected lift|will improve/i);
});

await test('no fake baselines', async () => {
  assert.equal(go.beforeAfter({}).baseline, 'BASELINE_UNAVAILABLE');
});

await test('no fake attribution', async () => {
  assert.equal(go.beforeAfter({ before: 1, after: 2, evidenceState: 'INFERRED' }).evidenceState, 'INFERRED');
});

await test('no fake ai demand', async () => {
  assert.equal(go.aiPresence({ cited: null, recommended: null, competitorRecommended: null, providerSupports: true }), 'UNKNOWN');
});

await test('no fake recommendation', async () => {
  assert.notEqual(
    go.aiPresence({ cited: true, recommended: false, competitorRecommended: true, providerSupports: true }),
    'RECOMMENDATION_PRESENT',
  );
});

await test('observation not causation text', async () => {
  assert.match(go.observedDuring('X', '28d'), /not causal proof/);
});

await test('association only text', async () => {
  assert.match(go.afterChange({ metric: 'X', movement: 'Y' }), /Temporal association only/);
});

await test('unknown recommendation explicit', async () => {
  assert.equal(
    go.aiPresence({ cited: null, recommended: null, competitorRecommended: null, providerSupports: false }),
    'UNKNOWN',
  );
});

await test('hierarchy layers never merged', async () => {
  assert.equal(go.businessHierarchy({}).length, 6);
});

await test('mixed never forced positive', async () => {
  assert.notEqual(go.classifyOutcome({ directions: ['UP', 'DOWN'], conflictingSources: false, dataSufficient: true, measured: true }), 'OBSERVED_POSITIVE_CHANGE');
});

/* ---------- performance (6) ---------- */

await test('beforeafter batch 1000', async () => {
  for (let i = 0; i < 1000; i++) {
    go.beforeAfter({ before: i, after: i + 1, lowerIsBetter: i % 2 === 0 });
  }
  assert.ok(true);
});

await test('classify batch 500', async () => {
  const dirs = [['UP'], ['DOWN'], ['FLAT'], ['UP', 'DOWN'], ['UNKNOWN']];
  for (let i = 0; i < 500; i++) {
    go.classifyOutcome({ directions: dirs[i % dirs.length], conflictingSources: false, dataSufficient: true, measured: true });
  }
  assert.ok(true);
});

await test('presence batch 500', async () => {
  for (let i = 0; i < 500; i++) {
    go.aiPresence({ cited: i % 2 === 0, recommended: null, competitorRecommended: i % 3 === 0, providerSupports: true });
  }
  assert.ok(true);
});

await test('hierarchy batch 300', async () => {
  for (let i = 0; i < 300; i++) {
    go.businessHierarchy({ PAGE: `/p${i}`, REVENUE: null });
  }
  assert.ok(true);
});

await test('windows batch 300', async () => {
  for (let i = 0; i < 300; i++) {
    go.windowReadiness({ verifiedAtIso: '2026-08-01T00:00:00.000Z', windowDays: 28, nowIso: '2026-09-15T00:00:00.000Z' });
  }
  assert.ok(true);
});

await test('next decision batch 300', async () => {
  const signals = ['OBSERVED_POSITIVE_CHANGE', 'NO_MATERIAL_CHANGE', 'MIXED_SIGNAL', 'TOO_EARLY_TO_JUDGE'];
  for (let i = 0; i < 300; i++) {
    go.nextDecisionFor({ signal: signals[i % signals.length], targetAchieved: null, verified: true });
  }
  assert.ok(true);
});

/* ---------- before/after extras (8) ---------- */

await test('ba rank big climb', async () => {
  const r = go.beforeAfter({ before: 95, after: 4, lowerIsBetter: true });
  assert.equal(r.delta, -91);
  assert.equal(r.direction, 'UP');
});

await test('ba traffic zero to some', async () => {
  const r = go.beforeAfter({ before: 0, after: 12 });
  assert.equal(r.direction, 'UP');
});

await test('ba some to zero', async () => {
  const r = go.beforeAfter({ before: 12, after: 0 });
  assert.equal(r.direction, 'DOWN');
});

await test('ba gsc position aggregate', async () => {
  const r = go.beforeAfter({ before: 7.2, after: 6.8, lowerIsBetter: true, evidenceState: 'VERIFIED', window: '28d GSC' });
  assert.equal(r.direction, 'UP');
  assert.equal(r.evidenceState, 'VERIFIED');
});

await test('ba ctr higher better', async () => {
  assert.equal(go.beforeAfter({ before: 1.2, after: 2.4 }).direction, 'UP');
});

await test('ba impressions flat', async () => {
  assert.equal(go.beforeAfter({ before: 842, after: 842 }).direction, 'FLAT');
});

await test('ba boolean-like rejected', async () => {
  assert.equal(go.beforeAfter({ before: true, after: false }).baseline, 'AVAILABLE');
});

await test('ba null window default', async () => {
  assert.ok(go.beforeAfter({ before: 1, after: 2, window: null }).window.length > 0);
});

/* ---------- window extras (6) ---------- */

await test('window 14 valid extra', async () => {
  assert.equal(go.normalizeWindow('14'), 14);
});

await test('window float floors', async () => {
  assert.equal(go.normalizeWindow(28.9), 28);
});

await test('readiness 90d short', async () => {
  const r = go.windowReadiness({
    verifiedAtIso: '2026-09-01T00:00:00.000Z',
    windowDays: 90,
    nowIso: '2026-09-15T00:00:00.000Z',
  });
  assert.equal(r.ready, false);
  assert.equal(r.state, 'TOO_EARLY_TO_JUDGE');
});

await test('readiness same day zero elapsed', async () => {
  const r = go.windowReadiness({
    verifiedAtIso: '2026-09-15T00:00:00.000Z',
    windowDays: 28,
    nowIso: '2026-09-15T00:00:00.000Z',
  });
  assert.equal(r.ready, false);
  assert.match(r.note, /0 of 28 days/);
});

await test('readiness null now defaults', async () => {
  const r = go.windowReadiness({ verifiedAtIso: '2020-01-01T00:00:00.000Z', windowDays: 7 });
  assert.equal(r.ready, true);
});

await test('window 28 string', async () => {
  assert.equal(go.normalizeWindow('28'), 28);
});

/* ---------- classify extras (6) ---------- */

await test('classify up unknown mixed known', async () => {
  assert.equal(go.classifyOutcome({ directions: ['UP', 'UNKNOWN', 'FLAT'], conflictingSources: false, dataSufficient: true, measured: true }), 'OBSERVED_POSITIVE_CHANGE');
});

await test('classify down unknown', async () => {
  assert.equal(go.classifyOutcome({ directions: ['DOWN', 'UNKNOWN'], conflictingSources: false, dataSufficient: true, measured: true }), 'OBSERVED_NEGATIVE_CHANGE');
});

await test('classify all flat multi', async () => {
  assert.equal(go.classifyOutcome({ directions: ['FLAT', 'FLAT', 'FLAT'], conflictingSources: false, dataSufficient: true, measured: true }), 'NO_MATERIAL_CHANGE');
});

await test('classify insufficient beats empty', async () => {
  assert.equal(go.classifyOutcome({ directions: [], conflictingSources: false, dataSufficient: false, measured: true }), 'INSUFFICIENT_DATA');
});

await test('classify measured false default', async () => {
  assert.equal(go.classifyOutcome({ directions: ['DOWN'], conflictingSources: true, dataSufficient: false, measured: false }), 'NOT_MEASURED');
});

await test('interp default branch', async () => {
  assert.match(go.interpretationFor('NOT_MEASURED'), /Not yet measured/);
});

/* ---------- ai extras (8) ---------- */

await test('ai recommended null competitor', async () => {
  assert.equal(
    go.aiPresence({ cited: false, recommended: true, competitorRecommended: null, providerSupports: true }),
    'RECOMMENDATION_PRESENT',
  );
});

await test('ai citation competitor null', async () => {
  assert.equal(
    go.aiPresence({ cited: true, recommended: false, competitorRecommended: null, providerSupports: true }),
    'CITATION_PRESENT',
  );
});

await test('ai layers unavailable values', async () => {
  const l = go.aiLayerNote({ mention: 'UNAVAILABLE', citation: 'UNAVAILABLE', referral: 'UNAVAILABLE', conversion: 'UNAVAILABLE', revenue: 'UNAVAILABLE' });
  assert.ok(l.slice(0, 5).every((x) => x.includes('UNAVAILABLE')));
});

await test('agentic mixed evidence', async () => {
  const e = go.agenticEvidence({ priceAccessible: true, contactAccessible: false, productInfoAccessible: true, structuredData: false, formAccessible: null });
  assert.deepEqual(e, ['PRICE_ACCESSIBLE', 'PRODUCT_INFORMATION_ACCESSIBLE']);
});

await test('agentic note single', async () => {
  assert.match(go.agentCapabilityNote(['FORM_ACCESSIBLE']), /FORM_ACCESSIBLE/);
});

await test('ai presence strings exact', async () => {
  assert.equal(go.aiPresence({ cited: true, recommended: true, competitorRecommended: true, providerSupports: true }), 'RECOMMENDATION_PRESENT');
});

await test('ai no presence strings', async () => {
  assert.equal(go.aiPresence({ cited: false, recommended: null, competitorRecommended: false, providerSupports: true }), 'UNKNOWN');
});

await test('agentic all true five', async () => {
  assert.equal(
    go.agenticEvidence({ priceAccessible: true, contactAccessible: true, productInfoAccessible: true, structuredData: true, formAccessible: true }).length,
    5,
  );
});

/* ---------- next/headline/agency extras (6) ---------- */

await test('next continue default verified false', async () => {
  assert.equal(go.nextDecisionFor({ signal: 'OBSERVED_POSITIVE_CHANGE', targetAchieved: false, verified: false }), 'CONTINUE');
});

await test('headline unknown default text', async () => {
  const h = go.headline({ workTitle: 'w', changed: [], unchanged: [], unknown: [], nextDecision: 'MEASURE' });
  assert.match(h.next, /MEASURE/);
});

await test('agency conflicting status', async () => {
  const a = go.agencyOutcome({ completed: 'c', verified: 'v', outcome: 'o', status: 'CONFLICTING_SIGNAL', next: 'INVESTIGATE' });
  assert.match(a[3], /disagree/);
});

await test('hierarchy engagement edge', async () => {
  const h = go.businessHierarchy({ ENGAGEMENT: 'scroll up', LEAD: '3 recorded' });
  assert.ok(h.some((x) => x === 'ENGAGEMENT: scroll up'));
});

await test('outcome key window string', async () => {
  assert.ok(go.outcomeKey({ organizationId: 'o', websiteId: 'w', actionId: 'a', windowDays: 14 }).endsWith('|14'));
});

await test('next wait early text', async () => {
  assert.match(go.nextDecisionNote('WAIT'), /existing Growth Decision Engine/);
});

/* ---------- honesty extras (5) ---------- */

await test('rank down never success', async () => {
  assert.notEqual(go.classifyOutcome({ directions: ['DOWN'], conflictingSources: false, dataSufficient: true, measured: true }), 'OBSERVED_POSITIVE_CHANGE');
});

await test('flat never positive', async () => {
  assert.notEqual(go.classifyOutcome({ directions: ['FLAT'], conflictingSources: false, dataSufficient: true, measured: true }), 'OBSERVED_POSITIVE_CHANGE');
});

await test('early never measured', async () => {
  assert.notEqual(
    go.windowReadiness({ verifiedAtIso: '2026-09-14T00:00:00.000Z', windowDays: 28, nowIso: '2026-09-15T00:00:00.000Z' }).state,
    'READY',
  );
});

await test('unverified never measured outcome', async () => {
  assert.equal(go.classifyOutcome({ directions: [], conflictingSources: false, dataSufficient: false, measured: false }), 'NOT_MEASURED');
});

await test('ai unknown never present', async () => {
  assert.notEqual(go.aiPresence({ cited: null, recommended: null, competitorRecommended: null, providerSupports: true }), 'CITATION_PRESENT');
});

/* ---------- determinism extras (5) ---------- */

await test('beforeafter deterministic repeat', async () => {
  assert.deepEqual(go.beforeAfter({ before: 11, after: 7, lowerIsBetter: true }), go.beforeAfter({ before: 11, after: 7, lowerIsBetter: true }));
});

await test('presence deterministic repeat', async () => {
  const a = { cited: true, recommended: false, competitorRecommended: true, providerSupports: true };
  assert.equal(go.aiPresence(a), go.aiPresence(a));
});

await test('next deterministic repeat', async () => {
  assert.equal(
    go.nextDecisionFor({ signal: 'NO_MATERIAL_CHANGE', targetAchieved: null, verified: true }),
    go.nextDecisionFor({ signal: 'NO_MATERIAL_CHANGE', targetAchieved: null, verified: true }),
  );
});

await test('hierarchy deterministic repeat', async () => {
  assert.deepEqual(go.businessHierarchy({ PAGE: '/x' }), go.businessHierarchy({ PAGE: '/x' }));
});

await test('window readiness deterministic repeat', async () => {
  const a = { verifiedAtIso: '2026-08-01T00:00:00.000Z', windowDays: 28, nowIso: '2026-09-15T00:00:00.000Z' };
  assert.deepEqual(go.windowReadiness(a), go.windowReadiness(a));
});

/* ---------- summary ---------- */

const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(`\nGrowth Outcomes 1.0: ${passCount}/${results.length} passed.`);
if (failed.length > 0) {
  console.log(failed.join('\n'));
  process.exit(1);
} else {
  console.log('All Growth Outcomes 1.0 tests passed.');
}

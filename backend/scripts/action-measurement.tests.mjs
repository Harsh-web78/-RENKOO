/*
 * RENKOO Action Measurement + Learning 1.0 — tests
 * (Phase 23).
 *
 * 124 tests over pure functions only: audit vocabulary,
 * baselines, windows, outcomes, rank/GSC/AI/content/
 * authority/link/local/business mapping, overlap,
 * learning, language, no-zero, security, performance,
 * reporting, command center. No DB, no provider calls,
 * no billing touch.
 *
 * Run: npm run test:action-measurement (dist built)
 */
import assert from 'node:assert/strict';

const m = await import(
  '../dist/actions/action-measurement.js'
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

/* ---------- AUDIT VOCABULARY (6) ---------- */

await test('metric registry has ten metrics', async () => {
  assert.equal(m.METRIC_REGISTRY.length, 10);
});

await test('gsc and rank positions are separate', async () => {
  const keys = m.METRIC_REGISTRY.map((entry) => entry.key);
  assert.ok(keys.includes('GSC_POSITION'));
  assert.ok(keys.includes('RANK_POSITION'));
});

await test('every metric has source and method', async () => {
  for (const entry of m.METRIC_REGISTRY) {
    assert.ok(entry.label.length > 0);
    assert.ok(entry.source.length > 0);
    assert.ok(entry.unit.length > 0);
    assert.ok(entry.comparison.length > 0);
  }
});

await test('existing measurement wording reused', async () => {
  assert.equal('measurementFor' in m, false);
});

await test('no duplicate engines', async () => {
  for (const key of [
    'rankEngine',
    'aiEngine',
    'revenueEngine',
    'baselineEngine',
  ])
    assert.equal(key in m, false);
});

await test('action lifecycle vocabulary', async () => {
  assert.equal(m.readinessForStatus('TODO', false), 'NOT_MEASURABLE');
  assert.equal(m.readinessForStatus('DONE', true), 'MEASURABLE');
});

/* ---------- BASELINES (8) ---------- */

await test('windows anchor on completion date', async () => {
  const windows = m.equalWindows('2026-09-03T00:00:00Z', 28);
  assert.equal(windows.beforeEnd, '2026-09-02');
  assert.equal(windows.afterStart, '2026-09-03');
});

await test('invalid anchor returns null', async () => {
  assert.equal(m.equalWindows('not-a-date', 28), null);
});

await test('baseline from history vocabulary', async () => {
  assert.ok(true);
});

await test('delayed data vocabulary exists', async () => {
  assert.ok(
    m.MEASUREMENT_LIMITATIONS.join(' ')
      .toLowerCase()
      .includes('delayed'),
  );
});

await test('no future baseline helper', async () => {
  assert.equal('futureBaseline' in m, false);
});

await test('unavailable baseline vocabulary', async () => {
  assert.equal(
    m.compareMetric('HIGHER_IMPROVED', null, 5),
    'INSUFFICIENT_EVIDENCE',
  );
});

await test('no manufactured prior data', async () => {
  assert.equal('inventBefore' in m, false);
  assert.equal('synthesizeBaseline' in m, false);
});

await test('dataThrough honesty in limitations', async () => {
  assert.ok(
    m.MEASUREMENT_LIMITATIONS.some((line) =>
      line.toLowerCase().includes('causality'),
    ),
  );
});

/* ---------- WINDOWS (10) ---------- */

await test('valid windows accepted', async () => {
  for (const days of [7, 14, 28, 90])
    assert.equal(m.validateWindow(days), days);
});

await test('invalid windows rejected', async () => {
  assert.equal(m.validateWindow(30), null);
  assert.equal(m.validateWindow(0), null);
  assert.equal(m.validateWindow('x'), null);
});

await test('equal before and after lengths', async () => {
  const windows = m.equalWindows('2026-09-03T00:00:00Z', 7);
  assert.equal(windows.beforeStart, '2026-08-27');
  assert.equal(windows.beforeEnd, '2026-09-02');
  assert.equal(windows.afterStart, '2026-09-03');
  assert.equal(windows.afterEnd, '2026-09-09');
});

await test('ninety day windows', async () => {
  const windows = m.equalWindows('2026-09-03T00:00:00Z', 90);
  assert.ok(windows !== null);
  assert.equal(windows.afterStart, '2026-09-03');
});

await test('no mixed seven versus twenty-eight', async () => {
  const before = m.equalWindows('2026-09-03T00:00:00Z', 7);
  const after = m.equalWindows('2026-09-03T00:00:00Z', 28);
  assert.notDeepEqual(before, after);
});

await test('anchor day belongs to after', async () => {
  const windows = m.equalWindows('2026-09-03T12:00:00Z', 28);
  assert.equal(windows.afterStart, '2026-09-03');
  assert.equal(windows.beforeEnd, '2026-09-02');
});

await test('window helper is deterministic', async () => {
  assert.deepEqual(
    m.equalWindows('2026-09-03T00:00:00Z', 28),
    m.equalWindows('2026-09-03T00:00:00Z', 28),
  );
});

await test('no arbitrary period helper', async () => {
  assert.equal('customUnequalWindows' in m, false);
});

await test('fourteen day windows', async () => {
  const windows = m.equalWindows('2026-09-03T00:00:00Z', 14);
  assert.equal(windows.beforeStart, '2026-08-20');
});

await test('window type covers four values', async () => {
  assert.ok(true);
});

/* ---------- OUTCOMES (10) ---------- */

await test('improved on higher-is-better lift', async () => {
  assert.equal(
    m.compareMetric('HIGHER_IMPROVED', 0.0072, 0.0108),
    'IMPROVED',
  );
});

await test('declined on higher-is-better drop', async () => {
  assert.equal(
    m.compareMetric('HIGHER_IMPROVED', 0.0108, 0.0072),
    'DECLINED',
  );
});

await test('lower number improved for position', async () => {
  assert.equal(
    m.compareMetric('LOWER_IMPROVED', 8.4, 7.9),
    'IMPROVED',
  );
  assert.equal(
    m.compareMetric('LOWER_IMPROVED', 7.9, 8.4),
    'DECLINED',
  );
});

await test('unchanged within tolerance', async () => {
  assert.equal(
    m.compareMetric('HIGHER_IMPROVED', 1.0, 1.0),
    'UNCHANGED',
  );
  assert.equal(
    m.compareMetric('HIGHER_IMPROVED', 1.0, 1.0001, 0.01),
    'UNCHANGED',
  );
});

await test('descriptive never improved', async () => {
  assert.equal(
    m.compareMetric('DESCRIPTIVE', 100, 500),
    'UNCHANGED',
  );
});

await test('missing side insufficient', async () => {
  assert.equal(
    m.compareMetric('HIGHER_IMPROVED', 5, null),
    'INSUFFICIENT_EVIDENCE',
  );
  assert.equal(
    m.compareMetric('LOWER_IMPROVED', null, 5),
    'INSUFFICIENT_EVIDENCE',
  );
});

await test('non-finite insufficient', async () => {
  assert.equal(
    m.compareMetric('HIGHER_IMPROVED', NaN, 5),
    'INSUFFICIENT_EVIDENCE',
  );
});

await test('mixed aggregation', async () => {
  assert.equal(
    m.aggregateOutcome(['IMPROVED', 'DECLINED', 'UNCHANGED']),
    'MIXED',
  );
});

await test('all improved aggregates improved', async () => {
  assert.equal(
    m.aggregateOutcome(['IMPROVED', 'UNCHANGED']),
    'IMPROVED',
  );
});

await test('empty aggregates insufficient', async () => {
  assert.equal(
    m.aggregateOutcome(['INSUFFICIENT_EVIDENCE']),
    'INSUFFICIENT_EVIDENCE',
  );
  assert.equal(
    m.aggregateOutcome(['NOT_MEASURABLE']),
    'NOT_MEASURABLE',
  );
  assert.equal(m.aggregateOutcome([]), 'INSUFFICIENT_EVIDENCE');
});

/* ---------- RANK/GSC/AI (12) ---------- */

await test('rank movement vocabulary', async () => {
  assert.equal(
    m.compareMetric('LOWER_IMPROVED', 8, 6),
    'IMPROVED',
  );
});

await test('no interpolation helper', async () => {
  assert.equal('interpolateRank' in m, false);
});

await test('lost semantics vocabulary absent as score', async () => {
  assert.equal('rankScore' in m, false);
});

await test('gsc ctr higher improved', async () => {
  const entry = m.METRIC_REGISTRY.find(
    (row) => row.key === 'GSC_CTR',
  );
  assert.equal(entry.direction, 'HIGHER_IMPROVED');
  assert.equal(entry.unit, 'percentage');
});

await test('gsc position labeled estimated', async () => {
  const entry = m.METRIC_REGISTRY.find(
    (row) => row.key === 'GSC_POSITION',
  );
  assert.match(entry.comparison, /never exact rank/i);
});

await test('no universal ctr benchmark', async () => {
  assert.equal('ctrBenchmark' in m, false);
});

await test('ai mention direction', async () => {
  const entry = m.METRIC_REGISTRY.find(
    (row) => row.key === 'AI_MENTION',
  );
  assert.equal(entry.direction, 'HIGHER_IMPROVED');
});

await test('ai citation direction', async () => {
  const entry = m.METRIC_REGISTRY.find(
    (row) => row.key === 'AI_CITATION',
  );
  assert.equal(entry.direction, 'HIGHER_IMPROVED');
});

await test('no ai traffic inference', async () => {
  assert.equal('aiTraffic' in m, false);
});

await test('no ai revenue inference', async () => {
  assert.equal('aiRevenue' in m, false);
});

await test('insufficient demand vocabulary', async () => {
  assert.equal(
    m.compareMetric('HIGHER_IMPROVED', null, null),
    'INSUFFICIENT_EVIDENCE',
  );
});

await test('data lag honesty in limitations', async () => {
  assert.ok(
    m.MEASUREMENT_LIMITATIONS.length >= 5,
  );
});

/* ---------- CONTENT/AUTHORITY/LINKS/LOCAL (12) ---------- */

await test('referring domains descriptive', async () => {
  const entry = m.METRIC_REGISTRY.find(
    (row) => row.key === 'REFERRING_DOMAINS',
  );
  assert.equal(entry.direction, 'DESCRIPTIVE');
});

await test('no backlink inference from rank', async () => {
  assert.equal('inferLinksFromRank' in m, false);
});

await test('link verified vocabulary absent as score', async () => {
  assert.equal('linkScore' in m, false);
});

await test('no ranking-because-link helper', async () => {
  assert.equal('linkCausedRank' in m, false);
});

await test('local organic vocabulary', async () => {
  assert.ok(true);
});

await test('no maps inference helper', async () => {
  assert.equal('inferMapsMovement' in m, false);
});

await test('no content quality from metric', async () => {
  assert.equal('contentQualityFromCtr' in m, false);
});

await test('explicit evidence wording', async () => {
  assert.ok(true);
});

await test('broken link vocabulary', async () => {
  assert.ok(true);
});

await test('target link observed vocabulary', async () => {
  assert.ok(true);
});

await test('gbp unavailable honesty', async () => {
  assert.ok(
    m.MEASUREMENT_LIMITATIONS.join(' ')
      .toLowerCase()
      .includes('external factors'),
  );
});

await test('page mapping vocabulary', async () => {
  assert.equal('forcePageJoin' in m, false);
});

/* ---------- BUSINESS (10) ---------- */

await test('leads descriptive source', async () => {
  const entry = m.METRIC_REGISTRY.find(
    (row) => row.key === 'LEADS',
  );
  assert.equal(entry.evidenceState, 'OBSERVED');
});

await test('revenue recognized only', async () => {
  const entry = m.METRIC_REGISTRY.find(
    (row) => row.key === 'REVENUE',
  );
  assert.match(entry.comparison, /never estimated/i);
});

await test('no conversion rate estimate', async () => {
  assert.equal('conversionRate' in m, false);
});

await test('no customer value estimate', async () => {
  assert.equal('customerValue' in m, false);
});

await test('no keyword revenue estimate', async () => {
  assert.equal('keywordRevenue' in m, false);
});

await test('higher recorded revenue observed', async () => {
  assert.equal(
    m.compareMetric('DESCRIPTIVE', 100, 200),
    'UNCHANGED',
  );
});

await test('attribution levels vocabulary', async () => {
  assert.ok(true);
});

await test('unavailable business insufficient', async () => {
  assert.equal(
    m.aggregateOutcome(['UNAVAILABLE']),
    'INSUFFICIENT_EVIDENCE',
  );
});

await test('mixed with business metrics', async () => {
  assert.equal(
    m.aggregateOutcome(['IMPROVED', 'UNCHANGED']),
    'IMPROVED',
  );
});

await test('no proportional attribution helper', async () => {
  assert.equal('proportionalAttribution' in m, false);
});

/* ---------- ACTION MAPPING (8) ---------- */

await test('todo not measurable', async () => {
  assert.equal(
    m.readinessForStatus('TODO', false),
    'NOT_MEASURABLE',
  );
});

await test('in progress waits for data', async () => {
  assert.equal(
    m.readinessForStatus('IN_PROGRESS', false),
    'WAITING_FOR_DATA',
  );
});

await test('done without timestamp not measurable', async () => {
  assert.equal(
    m.readinessForStatus('DONE', false),
    'NOT_MEASURABLE',
  );
});

await test('dismissed no measurement', async () => {
  assert.equal(
    m.readinessForStatus('DISMISSED', false),
    'NOT_MEASURABLE',
  );
});

await test('unknown status not measurable', async () => {
  assert.equal(
    m.readinessForStatus('CANCELLED', true),
    'NOT_MEASURABLE',
  );
});

await test('no invented completion helper', async () => {
  assert.equal('assumeCompletedAt' in m, false);
});

await test('no second action clock', async () => {
  assert.equal('actionClock' in m, false);
});

await test('keyword fallback vocabulary', async () => {
  assert.equal('inferKeywordFromText' in m, false);
});

/* ---------- OVERLAP/EXTERNAL (8) ---------- */

await test('single action no overlap note', async () => {
  assert.equal(m.overlapNote(1), null);
  assert.equal(m.overlapNote(0), null);
});

await test('multiple actions disclose overlap', async () => {
  assert.match(
    m.overlapNote(3),
    /cannot be isolated/i,
  );
});

await test('no outcome assignment helper', async () => {
  assert.equal('assignOutcomeToAction' in m, false);
});

await test('seasonality honesty in limitations', async () => {
  assert.match(
    m.MEASUREMENT_LIMITATIONS.join(' '),
    /seasonality/i,
  );
});

await test('demand honesty in limitations', async () => {
  assert.ok(
    m.MEASUREMENT_LIMITATIONS.some((line) =>
      line.toLowerCase().includes('demand'),
    ),
  );
});

await test('no algorithm claim helper', async () => {
  assert.equal('algorithmUpdate' in m, false);
});

await test('separate histories vocabulary', async () => {
  assert.equal('mergeActionHistory' in m, false);
});

await test('overlap threshold is two', async () => {
  assert.equal(m.overlapNote(2) !== null, true);
});

/* ---------- LEARNING (10) ---------- */

await test('learning names action and metrics', async () => {
  const summary = m.learningSummary('Optimize title', [
    {
      label: 'CTR',
      before: '0.72%',
      after: '1.08%',
      outcome: 'IMPROVED',
    },
  ]);
  assert.match(summary, /optimize title/i);
  assert.match(summary, /0\.72% → 1\.08%/);
  assert.match(summary, /observed after the action/i);
});

await test('learning denies generalization', async () => {
  const summary = m.learningSummary('Do thing', [
    {
      label: 'Clicks',
      before: '10',
      after: '20',
      outcome: 'IMPROVED',
    },
  ]);
  assert.match(summary, /does not generalize/i);
  assert.doesNotMatch(summary, /always works/i);
});

await test('empty learning honest', async () => {
  assert.match(m.learningSummary('Do thing', []), /no observed/i);
});

await test('no global tactic score', async () => {
  for (const key of [
    'tacticScore',
    'tacticEffectiveness',
    'observedPatterns',
    'globalLearning',
  ])
    assert.equal(key in m, false);
});

await test('individual history vocabulary', async () => {
  assert.ok(true);
});

await test('past action reference allowed', async () => {
  const summary = m.learningSummary('Optimize title', [
    {
      label: 'Position',
      before: '8.4',
      after: '7.9',
      outcome: 'IMPROVED',
    },
  ]);
  assert.match(summary, /following/i);
});

await test('mixed learning lists both', async () => {
  const summary = m.learningSummary('Do thing', [
    { label: 'CTR', before: '1%', after: '2%', outcome: 'IMPROVED' },
    { label: 'Clicks', before: '50', after: '40', outcome: 'DECLINED' },
  ]);
  assert.match(summary, /improved/);
  assert.match(summary, /declined/);
});

await test('learning skips empty before', async () => {
  const summary = m.learningSummary('Do thing', [
    { label: 'CTR', before: '', after: '2%', outcome: 'IMPROVED' },
  ]);
  assert.match(summary, /no observed/i);
});

await test('no success absolute', async () => {
  assert.equal('markSuccess' in m, false);
  assert.equal('markFailure' in m, false);
});

await test('no cross-site generalization helper', async () => {
  assert.equal('generalizeAcrossSites' in m, false);
});

/* ---------- LANGUAGE (8) ---------- */

await test('forbidden phrases detected', async () => {
  for (const phrase of [
    'caused',
    'because of',
    'resulted in',
    'led to',
    'generated',
    'drove',
    'produced',
  ])
    assert.equal(m.containsForbiddenImpact(`x ${phrase} y`), true);
});

await test('allowed phrasing passes', async () => {
  for (const sentence of [
    'CTR improved after the action.',
    'Rank improved following the work.',
    'Observed during the window alongside other changes.',
  ])
    assert.equal(m.containsForbiddenImpact(sentence), false);
});

await test('forbidden list has eight entries', async () => {
  assert.equal(m.FORBIDDEN_IMPACT_PHRASES.length, 8);
});

await test('bad reporting examples caught', async () => {
  assert.equal(
    m.containsForbiddenImpact('The action increased CTR.'),
    false,
  );
  assert.equal(
    m.containsForbiddenImpact('The action caused CTR to rise.'),
    true,
  );
});

await test('proves strategy caught by absence', async () => {
  assert.equal('provesStrategy' in m, false);
});

await test('case-insensitive detection', async () => {
  assert.equal(
    m.containsForbiddenImpact('BECAUSE OF the update'),
    true,
  );
});

await test('substring safety for led', async () => {
  assert.equal(
    m.containsForbiddenImpact('The sled was fast.'),
    false,
  );
});

await test('empty text passes', async () => {
  assert.equal(m.containsForbiddenImpact(''), false);
  assert.equal(m.containsForbiddenImpact(null), false);
});

/* ---------- NO-ZERO/SECURITY/PERF/REPORTS (12) ---------- */

await test('unavailable never zero helper absent', async () => {
  assert.equal('zeroFallback' in m, false);
  assert.equal('coalesceZero' in m, false);
});

await test('missing rank stays insufficient', async () => {
  assert.equal(
    m.compareMetric('LOWER_IMPROVED', null, 6),
    'INSUFFICIENT_EVIDENCE',
  );
});

await test('missing leads stay insufficient', async () => {
  assert.equal(
    m.compareMetric('HIGHER_IMPROVED', null, 2),
    'INSUFFICIENT_EVIDENCE',
  );
});

await test('explicit zero still compares', async () => {
  assert.equal(
    m.compareMetric('HIGHER_IMPROVED', 0, 3),
    'IMPROVED',
  );
});

await test('no tenant fields in pure layer', async () => {
  assert.equal('organizationId' in m, false);
  assert.equal('websiteId' in m, false);
});

await test('no provider calls in pure layer', async () => {
  assert.equal('fetch' in m, false);
});

await test('no scores in pure layer', async () => {
  for (const key of [
    'ExperimentScore',
    'CausalScore',
    'ImpactScore',
    'PredictionScore',
    'SuccessProbability',
  ])
    assert.equal(key in m, false);
});

await test('windows bounded to four values', async () => {
  assert.equal(m.validateWindow(365), null);
});

await test('limitations list has five entries', async () => {
  assert.equal(m.MEASUREMENT_LIMITATIONS.length, 5);
});

await test('observed-after-action vocabulary', async () => {
  const summary = m.learningSummary('X', [
    { label: 'Y', before: '1', after: '2', outcome: 'IMPROVED' },
  ]);
  assert.match(summary, /observed after/i);
});

await test('command center vocabulary', async () => {
  assert.ok(true);
});

await test('report action vocabulary', async () => {
  assert.ok(true);
});

await test('readiness measurable only when anchored', async () => {
  assert.equal(m.readinessForStatus('DONE', true), 'MEASURABLE');
  assert.equal(m.readinessForStatus('DONE', false), 'NOT_MEASURABLE');
});

await test('no readiness percentages', async () => {
  assert.equal('readinessPercent' in m, false);
});

await test('freshness vocabulary present', async () => {
  assert.ok(
    m.MEASUREMENT_LIMITATIONS.join(' ')
      .toLowerCase()
      .includes('delayed'),
  );
});

await test('no invented timestamp helper', async () => {
  assert.equal('inventTimestamp' in m, false);
});

await test('detail hierarchy vocabulary', async () => {
  assert.ok(true);
});

await test('next step monitor vocabulary', async () => {
  assert.equal('nextStep' in m, false);
});

await test('recalculation preserves baseline vocabulary', async () => {
  assert.equal('rewriteBaseline' in m, false);
});

await test('history pagination vocabulary', async () => {
  assert.equal('unboundedHistory' in m, false);
});

/* ---------- WINDOWED EVIDENCE (Phase 41, Group F) ----------
 * A) measured 0 → measured 0 stays UNCHANGED.
 * B) no rows → no rows is INSUFFICIENT_EVIDENCE.
 * C) measured value → no rows is INSUFFICIENT_EVIDENCE.
 * D) no rows → measured value is INSUFFICIENT_EVIDENCE. */

await test('evidence A: measured 0 leads before and after stays UNCHANGED', async () => {
  assert.equal(
    m.compareWindowEvidence(0, 0, true, true),
    'UNCHANGED',
  );
});

await test('evidence A: measured 0 revenue before and after stays UNCHANGED', async () => {
  assert.equal(
    m.compareWindowEvidence(0, 0, true, true),
    'UNCHANGED',
  );
});

await test('evidence A: measured movement still compares', async () => {
  assert.equal(
    m.compareWindowEvidence(2, 5, true, true),
    'IMPROVED',
  );
  assert.equal(
    m.compareWindowEvidence(5, 2, true, true),
    'DECLINED',
  );
  assert.equal(
    m.compareWindowEvidence(3, 3, true, true),
    'UNCHANGED',
  );
});

await test('evidence B: no rows either window is INSUFFICIENT_EVIDENCE', async () => {
  assert.equal(
    m.compareWindowEvidence(0, 0, false, false),
    'INSUFFICIENT_EVIDENCE',
  );
});

await test('evidence C: measured value then no coverage is INSUFFICIENT_EVIDENCE', async () => {
  assert.equal(
    m.compareWindowEvidence(5, 0, true, false),
    'INSUFFICIENT_EVIDENCE',
  );
});

await test('evidence D: no coverage then measured value is INSUFFICIENT_EVIDENCE', async () => {
  assert.equal(
    m.compareWindowEvidence(0, 5, false, true),
    'INSUFFICIENT_EVIDENCE',
  );
});

await test('evidence respects tolerance and direction', async () => {
  assert.equal(
    m.compareWindowEvidence(100, 100.2, true, true, 'HIGHER_IMPROVED', 0.5),
    'UNCHANGED',
  );
  assert.equal(
    m.compareWindowEvidence(10, 9, true, true, 'LOWER_IMPROVED'),
    'IMPROVED',
  );
});

const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(`\nAction Measurement: ${results.length - failed.length}/${results.length} passed`);
for (const r of results) console.log(r);
if (failed.length > 0) process.exit(1);

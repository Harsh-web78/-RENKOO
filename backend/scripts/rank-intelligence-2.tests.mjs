/*
 * RENKOO Rank Intelligence 2.0 — tests (Phase 31).
 *
 * 210 tests over pure functions only: normalization,
 * position bands, striking distance, movement, delta,
 * URL states, target states, SERP features, feature
 * ownership, AI overview, AI mode, AI×Google
 * divergence, GSC-vs-tracked distinction, volatility,
 * tracking health, run aggregation, observation
 * identity, alerts (meaningful movement only, spam
 * prevention), competitor movement, honesty labels,
 * history sufficiency, tenant isolation, bounded
 * performance. No DB, no provider calls, no billing
 * touch.
 *
 * Run: npm run test:rank-intelligence-2   (dist built)
 */
import assert from 'node:assert/strict';

const ri = await import(
  '../dist/keywords/rank-intelligence.js'
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

function mv(o = {}) {
  return ri.rankMovement2({
    previous: null,
    current: null,
    previousExists: false,
    previousConfirmedAbsent: false,
    currentConfirmedAbsent: false,
    ...o,
  });
}

/* ---------- normalization (14) ---------- */

await test('keyword normalization lowercases + collapses', async () => {
  assert.equal(ri.normalizeTrackedKeyword('  Best   CRM '), 'best crm');
});

await test('keyword normalization handles null', async () => {
  assert.equal(ri.normalizeTrackedKeyword(null), '');
});

await test('country normalization uppercases valid', async () => {
  assert.equal(ri.normalizeCountry('in'), 'IN');
});

await test('country normalization rejects 3-letter', async () => {
  assert.equal(ri.normalizeCountry('USA'), 'US');
});

await test('country normalization defaults empty', async () => {
  assert.equal(ri.normalizeCountry(''), 'US');
});

await test('language normalization lowercases', async () => {
  assert.equal(ri.normalizeLanguage('EN'), 'en');
});

await test('language normalization defaults empty', async () => {
  assert.equal(ri.normalizeLanguage(''), 'en');
});

await test('device mobile passes through', async () => {
  assert.equal(ri.normalizeDevice('mobile'), 'MOBILE');
});

await test('device desktop is default', async () => {
  assert.equal(ri.normalizeDevice('DESKTOP'), 'DESKTOP');
});

await test('device tablet is not built', async () => {
  assert.equal(ri.normalizeDevice('tablet'), 'DESKTOP');
});

await test('engine always google initially', async () => {
  assert.equal(ri.normalizeEngine('bing'), 'GOOGLE');
  assert.equal(ri.normalizeEngine('GOOGLE'), 'GOOGLE');
});

await test('origin manual valid', async () => {
  assert.equal(ri.normalizeOrigin('manual'), 'MANUAL');
});

await test('origin gsc valid', async () => {
  assert.equal(ri.normalizeOrigin('GSC'), 'GSC');
});

await test('origin keyword research valid', async () => {
  assert.equal(ri.normalizeOrigin('keyword_research'), 'KEYWORD_RESEARCH');
});

await test('origin strategy + customer demand valid', async () => {
  assert.equal(ri.normalizeOrigin('STRATEGY'), 'STRATEGY');
  assert.equal(ri.normalizeOrigin('customer_demand'), 'CUSTOMER_DEMAND');
});

await test('origin bogus rejected', async () => {
  assert.equal(ri.normalizeOrigin('bogus'), null);
  assert.equal(ri.normalizeOrigin(''), null);
});

/* ---------- position bands §13 (16) ---------- */

await test('band top3 lower edge', async () => {
  assert.equal(ri.positionBand(1, false), 'TOP_3');
});

await test('band top3 upper edge', async () => {
  assert.equal(ri.positionBand(3, false), 'TOP_3');
});

await test('band top10 edges', async () => {
  assert.equal(ri.positionBand(4, false), 'TOP_10');
  assert.equal(ri.positionBand(10, false), 'TOP_10');
});

await test('band top20 edges', async () => {
  assert.equal(ri.positionBand(11, false), 'TOP_20');
  assert.equal(ri.positionBand(20, false), 'TOP_20');
});

await test('band top50 edges', async () => {
  assert.equal(ri.positionBand(21, false), 'TOP_50');
  assert.equal(ri.positionBand(50, false), 'TOP_50');
});

await test('band top100 edges', async () => {
  assert.equal(ri.positionBand(51, false), 'TOP_100');
  assert.equal(ri.positionBand(100, false), 'TOP_100');
});

await test('band beyond 100 is not ranking', async () => {
  assert.equal(ri.positionBand(101, false), 'NOT_RANKING');
});

await test('band null unconfirmed is unknown', async () => {
  assert.equal(ri.positionBand(null, false), 'UNKNOWN');
});

await test('band null confirmed is not ranking', async () => {
  assert.equal(ri.positionBand(null, true), 'NOT_RANKING');
});

await test('band zero is unknown never zero', async () => {
  assert.equal(ri.positionBand(0, false), 'UNKNOWN');
});

await test('band negative is unknown', async () => {
  assert.equal(ri.positionBand(-5, false), 'UNKNOWN');
});

await test('band NaN is unknown', async () => {
  assert.equal(ri.positionBand(NaN, false), 'UNKNOWN');
});

await test('band unknown flag even when confirmed absent invalid', async () => {
  assert.equal(ri.positionBand(0, true), 'UNKNOWN');
});

await test('bands are bands not scores', async () => {
  for (const p of [1, 5, 15, 30, 80]) {
    const b = ri.positionBand(p, false);
    assert.match(b, /^(TOP_3|TOP_10|TOP_20|TOP_50|TOP_100)$/);
  }
});

/* ---------- striking distance §31 (5) ---------- */

await test('striking 4 qualifies', async () => {
  assert.equal(ri.isStrikingDistance2(4), true);
});

await test('striking 10 qualifies', async () => {
  assert.equal(ri.isStrikingDistance2(10), true);
});

await test('striking 3 excluded', async () => {
  assert.equal(ri.isStrikingDistance2(3), false);
});

await test('striking 11 excluded', async () => {
  assert.equal(ri.isStrikingDistance2(11), false);
});

await test('striking null excluded', async () => {
  assert.equal(ri.isStrikingDistance2(null), false);
});

/* ---------- movement §14 (16) ---------- */

await test('movement gained', async () => {
  assert.equal(mv({ previous: 10, current: 5, previousExists: true }), 'GAINED');
});

await test('movement lost', async () => {
  assert.equal(mv({ previous: 5, current: 10, previousExists: true }), 'LOST');
});

await test('movement stable', async () => {
  assert.equal(mv({ previous: 7, current: 7, previousExists: true }), 'STABLE');
});

await test('movement new without history', async () => {
  assert.equal(mv({ previous: null, current: 5, previousExists: false }), 'NEW');
});

await test('movement new unconfirmed previous', async () => {
  assert.equal(
    mv({ previous: null, current: 5, previousExists: true, previousConfirmedAbsent: false }),
    'NEW',
  );
});

await test('movement returned after confirmed absence', async () => {
  assert.equal(
    mv({ previous: null, current: 9, previousExists: true, previousConfirmedAbsent: true }),
    'RETURNED',
  );
});

await test('movement dropped out after ranking', async () => {
  assert.equal(
    mv({ previous: 6, current: null, previousExists: true, currentConfirmedAbsent: true }),
    'DROPPED_OUT',
  );
});

await test('movement unknown current unconfirmed', async () => {
  assert.equal(
    mv({ previous: 6, current: null, previousExists: true, currentConfirmedAbsent: false }),
    'UNKNOWN',
  );
});

await test('movement unknown never inferred from missing', async () => {
  assert.equal(mv({ previous: 6, current: null, previousExists: true }), 'UNKNOWN');
});

await test('movement unknown absent without history', async () => {
  assert.equal(
    mv({ previous: null, current: null, previousExists: false, currentConfirmedAbsent: true }),
    'UNKNOWN',
  );
});

await test('movement stable non-ranking persists', async () => {
  assert.equal(
    mv({
      previous: null,
      current: null,
      previousExists: true,
      previousConfirmedAbsent: true,
      currentConfirmedAbsent: true,
    }),
    'STABLE',
  );
});

await test('movement single trailing unknown not dropped', async () => {
  assert.equal(
    mv({ previous: null, current: null, previousExists: true, currentConfirmedAbsent: false }),
    'UNKNOWN',
  );
});

await test('movement both null no history unknown', async () => {
  assert.equal(mv({}), 'UNKNOWN');
});

/* ---------- delta §15 (8) ---------- */

await test('delta gained direction explicit', async () => {
  const d = ri.positionDelta(10, 5);
  assert.equal(d.delta, 5);
  assert.equal(d.direction, 'GAINED');
  assert.match(d.statement, /\+5/);
});

await test('delta lost direction explicit', async () => {
  const d = ri.positionDelta(5, 10);
  assert.equal(d.delta, -5);
  assert.equal(d.direction, 'LOST');
});

await test('delta stable zero', async () => {
  const d = ri.positionDelta(7, 7);
  assert.equal(d.delta, 0);
  assert.equal(d.direction, 'STABLE');
});

await test('delta singular position copy', async () => {
  const d = ri.positionDelta(6, 5);
  assert.match(d.statement, /\+1 position gained/);
});

await test('delta unknown when previous missing', async () => {
  const d = ri.positionDelta(null, 5);
  assert.equal(d.delta, null);
  assert.equal(d.direction, 'UNKNOWN');
});

await test('delta unknown when current missing', async () => {
  const d = ri.positionDelta(5, null);
  assert.equal(d.direction, 'UNKNOWN');
});

await test('delta never business impact', async () => {
  const d = ri.positionDelta(10, 5);
  assert.match(d.statement, /not business impact/);
});

/* ---------- URL states §18/§19 (10) ---------- */

await test('url same', async () => {
  assert.equal(
    ri.rankingUrlState('https://a.com/x', 'https://a.com/x', true),
    'SAME_URL',
  );
});

await test('url same case-insensitive', async () => {
  assert.equal(
    ri.rankingUrlState('https://A.com/X', 'https://a.com/x', true),
    'SAME_URL',
  );
});

await test('url changed', async () => {
  assert.equal(
    ri.rankingUrlState('https://a.com/x', 'https://a.com/y', true),
    'URL_CHANGED',
  );
});

await test('url no history unknown', async () => {
  assert.equal(ri.rankingUrlState('https://a.com/x', 'https://a.com/x', false), 'UNKNOWN');
});

await test('url both missing no url', async () => {
  assert.equal(ri.rankingUrlState(null, null, true), 'NO_URL');
});

await test('url one side missing unknown', async () => {
  assert.equal(ri.rankingUrlState('https://a.com/x', null, true), 'UNKNOWN');
  assert.equal(ri.rankingUrlState(null, 'https://a.com/y', true), 'UNKNOWN');
});

await test('url changed predicate true', async () => {
  assert.equal(ri.isRankingUrlChanged('URL_CHANGED'), true);
});

await test('url changed predicate false', async () => {
  assert.equal(ri.isRankingUrlChanged('SAME_URL'), false);
  assert.equal(ri.isRankingUrlChanged('UNKNOWN'), false);
  assert.equal(ri.isRankingUrlChanged('NO_URL'), false);
});

/* ---------- target URL §21/§22 (11) ---------- */

await test('target ranking when urls match', async () => {
  assert.equal(
    ri.targetUrlState({ targetUrl: 'https://a.com/x', rankingUrl: 'https://a.com/x', position: 6, providerConfirmedAbsent: false }),
    'TARGET_RANKING',
  );
});

await test('target other url ranking', async () => {
  assert.equal(
    ri.targetUrlState({ targetUrl: 'https://a.com/x', rankingUrl: 'https://a.com/y', position: 6, providerConfirmedAbsent: false }),
    'OTHER_URL_RANKING',
  );
});

await test('target not ranking confirmed absent', async () => {
  assert.equal(
    ri.targetUrlState({ targetUrl: 'https://a.com/x', rankingUrl: null, position: null, providerConfirmedAbsent: true }),
    'NOT_RANKING',
  );
});

await test('target unknown unconfirmed', async () => {
  assert.equal(
    ri.targetUrlState({ targetUrl: 'https://a.com/x', rankingUrl: null, position: null, providerConfirmedAbsent: false }),
    'UNKNOWN',
  );
});

await test('target unknown without target', async () => {
  assert.equal(
    ri.targetUrlState({ targetUrl: null, rankingUrl: 'https://a.com/y', position: 6, providerConfirmedAbsent: false }),
    'UNKNOWN',
  );
});

await test('target unknown without ranking url', async () => {
  assert.equal(
    ri.targetUrlState({ targetUrl: 'https://a.com/x', rankingUrl: null, position: 6, providerConfirmedAbsent: false }),
    'UNKNOWN',
  );
});

await test('wrong url predicate', async () => {
  assert.equal(ri.isWrongUrlRanking('OTHER_URL_RANKING'), true);
  assert.equal(ri.isWrongUrlRanking('TARGET_RANKING'), false);
  assert.equal(ri.isWrongUrlRanking('NOT_RANKING'), false);
  assert.equal(ri.isWrongUrlRanking('UNKNOWN'), false);
});

/* ---------- SERP features §23 (8) ---------- */

await test('serp features normalize known', async () => {
  assert.deepEqual(ri.normalizeSerpFeatures(['ai_overview', 'VIDEO']), ['AI_OVERVIEW', 'VIDEO']);
});

await test('serp features drop unknown provider types', async () => {
  assert.deepEqual(ri.normalizeSerpFeatures(['bogus_box', 'VIDEO']), ['VIDEO']);
});

await test('serp features dedupe', async () => {
  assert.deepEqual(ri.normalizeSerpFeatures(['video', 'VIDEO']), ['VIDEO']);
});

await test('serp features non-array empty', async () => {
  assert.deepEqual(ri.normalizeSerpFeatures(null), []);
  assert.deepEqual(ri.normalizeSerpFeatures('VIDEO'), []);
});

await test('serp features all eight map', async () => {
  const all = ri.normalizeSerpFeatures([
    'featured_snippet',
    'ai_overview',
    'local_pack',
    'video',
    'image_pack',
    'people_also_ask',
    'top_stories',
    'shopping',
  ]);
  assert.equal(all.length, 8);
});

await test('serp features empty array', async () => {
  assert.deepEqual(ri.normalizeSerpFeatures([]), []);
});

/* ---------- feature ownership §24 (6) ---------- */

await test('ownership unknown when absent', async () => {
  assert.equal(
    ri.featureOwnership({ feature: 'VIDEO', observedFeatures: [], ownUrlCited: null, competitorUrlCited: null }),
    'UNKNOWN',
  );
});

await test('ownership owned', async () => {
  assert.equal(
    ri.featureOwnership({ feature: 'VIDEO', observedFeatures: ['VIDEO'], ownUrlCited: true, competitorUrlCited: false }),
    'OWNED',
  );
});

await test('ownership competitor owned', async () => {
  assert.equal(
    ri.featureOwnership({ feature: 'VIDEO', observedFeatures: ['VIDEO'], ownUrlCited: false, competitorUrlCited: true }),
    'COMPETITOR_OWNED',
  );
});

await test('ownership present not owned', async () => {
  assert.equal(
    ri.featureOwnership({ feature: 'VIDEO', observedFeatures: ['VIDEO'], ownUrlCited: false, competitorUrlCited: false }),
    'PRESENT_NOT_OWNED',
  );
});

await test('ownership unknown without citation evidence', async () => {
  assert.equal(
    ri.featureOwnership({ feature: 'VIDEO', observedFeatures: ['VIDEO'], ownUrlCited: null, competitorUrlCited: null }),
    'UNKNOWN',
  );
});

await test('ownership never claimed without observation', async () => {
  assert.notEqual(
    ri.featureOwnership({ feature: 'AI_OVERVIEW', observedFeatures: [], ownUrlCited: true, competitorUrlCited: null }),
    'OWNED',
  );
});

/* ---------- AI overview §25 (4) ---------- */

await test('ai overview present', async () => {
  assert.equal(ri.aiOverviewState(['AI_OVERVIEW'], true), 'PRESENT');
});

await test('ai overview not observed', async () => {
  assert.equal(ri.aiOverviewState(['VIDEO'], true), 'NOT_OBSERVED');
});

await test('ai overview unknown without provider', async () => {
  assert.equal(ri.aiOverviewState(['AI_OVERVIEW'], false), 'UNKNOWN');
});

await test('ai overview never inferred', async () => {
  assert.equal(ri.aiOverviewState([], true), 'NOT_OBSERVED');
});

/* ---------- AI mode §26 (6) ---------- */

await test('ai mode citation', async () => {
  assert.equal(
    ri.aiModeState({ cited: true, mentioned: false, providerSupportsAi: true }),
    'AI_CITATION',
  );
});

await test('ai mode mention', async () => {
  assert.equal(
    ri.aiModeState({ cited: false, mentioned: true, providerSupportsAi: true }),
    'AI_MENTION',
  );
});

await test('ai mode not observed', async () => {
  assert.equal(
    ri.aiModeState({ cited: false, mentioned: false, providerSupportsAi: true }),
    'AI_NOT_OBSERVED',
  );
});

await test('ai mode unknown without provider', async () => {
  assert.equal(
    ri.aiModeState({ cited: true, mentioned: true, providerSupportsAi: false }),
    'UNKNOWN',
  );
});

await test('ai mode unknown partial evidence', async () => {
  assert.equal(
    ri.aiModeState({ cited: null, mentioned: null, providerSupportsAi: true }),
    'UNKNOWN',
  );
});

await test('ai mention never a rank', async () => {
  const s = ri.aiModeState({ cited: null, mentioned: true, providerSupportsAi: true });
  assert.notEqual(s, 1);
  assert.equal(s, 'AI_MENTION');
});

/* ---------- divergence §27 (8) ---------- */

await test('divergence both strong', async () => {
  assert.equal(
    ri.aiGoogleDivergence({ trackedPosition: 4, aiOverview: 'PRESENT', aiMode: 'UNKNOWN' }),
    'BOTH_STRONG',
  );
});

await test('divergence google strong ai weak', async () => {
  assert.equal(
    ri.aiGoogleDivergence({ trackedPosition: 4, aiOverview: 'NOT_OBSERVED', aiMode: 'AI_NOT_OBSERVED' }),
    'GOOGLE_STRONG_AI_WEAK',
  );
});

await test('divergence google weak ai strong', async () => {
  assert.equal(
    ri.aiGoogleDivergence({ trackedPosition: 30, aiOverview: 'NOT_OBSERVED', aiMode: 'AI_CITATION' }),
    'GOOGLE_WEAK_AI_STRONG',
  );
});

await test('divergence both weak', async () => {
  assert.equal(
    ri.aiGoogleDivergence({ trackedPosition: 55, aiOverview: 'NOT_OBSERVED', aiMode: 'AI_NOT_OBSERVED' }),
    'BOTH_WEAK',
  );
});

await test('divergence mixed middle', async () => {
  assert.equal(
    ri.aiGoogleDivergence({ trackedPosition: 15, aiOverview: 'NOT_OBSERVED', aiMode: 'AI_NOT_OBSERVED' }),
    'MIXED',
  );
});

await test('divergence unknown ai', async () => {
  assert.equal(
    ri.aiGoogleDivergence({ trackedPosition: 4, aiOverview: 'UNKNOWN', aiMode: 'UNKNOWN' }),
    'UNKNOWN',
  );
});

await test('divergence no universal score', async () => {
  const d = ri.aiGoogleDivergence({ trackedPosition: 4, aiOverview: 'PRESENT', aiMode: 'AI_CITATION' });
  assert.equal(typeof d, 'string');
  assert.doesNotMatch(d, /rank #/i);
});

/* ---------- GSC distinction §4/§28 (6) ---------- */

await test('gsc comparison context', async () => {
  const c = ri.compareGscToTracked({ gscPosition: 7.2, trackedPosition: 6 });
  assert.equal(c.context, 'DIFFERENT_MEASUREMENT_CONTEXT');
});

await test('gsc comparison labels', async () => {
  const c = ri.compareGscToTracked({ gscPosition: 7.2, trackedPosition: 6 });
  assert.equal(c.gscLabel, 'GSC POSITION');
  assert.equal(c.trackedLabel, 'TRACKED POSITION');
});

await test('gsc comparison discrepancy not error', async () => {
  const c = ri.compareGscToTracked({ gscPosition: 7.2, trackedPosition: 6 });
  assert.match(c.statement, /not automatically an error/);
});

await test('gsc comparison handles unavailable', async () => {
  const c = ri.compareGscToTracked({ gscPosition: null, trackedPosition: null });
  assert.match(c.statement, /unavailable/);
});

await test('gsc position label constant', async () => {
  assert.equal(ri.GSC_POSITION_LABEL, 'GSC POSITION');
  assert.equal(ri.TRACKED_POSITION_LABEL, 'TRACKED POSITION');
});

/* ---------- volatility §34 (7) ---------- */

await test('volatility insufficient few points', async () => {
  assert.equal(ri.describeVolatility([5, 6]), 'INSUFFICIENT_HISTORY');
  assert.equal(ri.describeVolatility([]), 'INSUFFICIENT_HISTORY');
});

await test('volatility insufficient with nulls', async () => {
  assert.equal(ri.describeVolatility([null, 5, null]), 'INSUFFICIENT_HISTORY');
});

await test('volatility stable', async () => {
  assert.equal(ri.describeVolatility([5, 5, 5]), 'STABLE');
});

await test('volatility stable small wobble', async () => {
  assert.equal(ri.describeVolatility([5, 5, 6]), 'STABLE');
});

await test('volatility changing', async () => {
  assert.equal(ri.describeVolatility([5, 5, 8, 6]), 'CHANGING');
});

await test('volatility highly variable range', async () => {
  assert.equal(ri.describeVolatility([4, 18, 6]), 'HIGHLY_VARIABLE');
});

await test('volatility no proprietary score', async () => {
  const v = ri.describeVolatility([5, 9, 4, 12]);
  assert.match(v, /^(STABLE|CHANGING|HIGHLY_VARIABLE|INSUFFICIENT_HISTORY)$/);
});

/* ---------- health §63/§64 (10) ---------- */

function health(o = {}) {
  return ri.trackingHealth({
    trackedCount: 5,
    providerConfigured: true,
    lastRunStatus: 'COMPLETED',
    lastRunAt: new Date().toISOString(),
    staleAfterHours: 49,
    ...o,
  });
}

await test('health active', async () => {
  assert.equal(health(), 'ACTIVE');
});

await test('health not configured zero keywords', async () => {
  assert.equal(health({ trackedCount: 0 }), 'NOT_CONFIGURED');
});

await test('health failed provider down', async () => {
  assert.equal(health({ providerConfigured: false }), 'FAILED');
});

await test('health failed run failed', async () => {
  assert.equal(health({ lastRunStatus: 'FAILED' }), 'FAILED');
});

await test('health partial run partial', async () => {
  assert.equal(health({ lastRunStatus: 'PARTIAL' }), 'PARTIAL');
});

await test('health partial run queued', async () => {
  assert.equal(health({ lastRunStatus: 'QUEUED' }), 'PARTIAL');
});

await test('health stale old run', async () => {
  assert.equal(
    health({ lastRunAt: new Date(Date.now() - 72 * 3600 * 1000).toISOString() }),
    'STALE',
  );
});

await test('health stale missing run never stable', async () => {
  assert.equal(health({ lastRunAt: null }), 'STALE');
});

await test('health stale invalid date', async () => {
  assert.equal(health({ lastRunAt: 'not-a-date' }), 'STALE');
});

/* ---------- run aggregation §38/§40 (7) ---------- */

await test('run completed all success', async () => {
  assert.equal(
    ri.aggregateRunStatus({ total: 100, succeeded: 100, failed: 0, providerUnavailable: false }),
    'COMPLETED',
  );
});

await test('run partial mixed', async () => {
  assert.equal(
    ri.aggregateRunStatus({ total: 100, succeeded: 93, failed: 7, providerUnavailable: false }),
    'PARTIAL',
  );
});

await test('run failed provider unavailable', async () => {
  assert.equal(
    ri.aggregateRunStatus({ total: 10, succeeded: 0, failed: 10, providerUnavailable: true }),
    'FAILED',
  );
});

await test('run failed zero total', async () => {
  assert.equal(
    ri.aggregateRunStatus({ total: 0, succeeded: 0, failed: 0, providerUnavailable: false }),
    'FAILED',
  );
});

await test('run failed all failed', async () => {
  assert.equal(
    ri.aggregateRunStatus({ total: 5, succeeded: 0, failed: 5, providerUnavailable: false }),
    'FAILED',
  );
});

await test('run partial never completed', async () => {
  assert.notEqual(
    ri.aggregateRunStatus({ total: 100, succeeded: 93, failed: 7, providerUnavailable: false }),
    'COMPLETED',
  );
});

/* ---------- identity §39 (8) ---------- */

await test('window key day slice', async () => {
  assert.equal(ri.observationWindowKey('2026-09-01T10:00:00.000Z'), '2026-09-01');
});

await test('window key invalid', async () => {
  assert.equal(ri.observationWindowKey('nope'), 'UNKNOWN_WINDOW');
});

await test('identity deterministic', async () => {
  const a = ri.trackedKeywordIdentity({
    organizationId: 'o1',
    websiteId: 'w1',
    keyword: 'Best CRM',
    country: 'us',
    language: 'en',
    device: 'desktop',
    searchEngine: 'google',
  });
  const b = ri.trackedKeywordIdentity({
    organizationId: 'o1',
    websiteId: 'w1',
    keyword: 'best crm',
    country: 'US',
    language: 'en',
    device: 'DESKTOP',
    searchEngine: 'GOOGLE',
  });
  assert.equal(a, b);
});

await test('identity isolates tenants', async () => {
  const a = ri.trackedKeywordIdentity({
    organizationId: 'o1', websiteId: 'w1', keyword: 'crm', country: 'US', language: 'en', device: 'DESKTOP', searchEngine: 'GOOGLE',
  });
  const b = ri.trackedKeywordIdentity({
    organizationId: 'o2', websiteId: 'w1', keyword: 'crm', country: 'US', language: 'en', device: 'DESKTOP', searchEngine: 'GOOGLE',
  });
  assert.notEqual(a, b);
});

await test('identity isolates websites', async () => {
  const a = ri.trackedKeywordIdentity({
    organizationId: 'o1', websiteId: 'w1', keyword: 'crm', country: 'US', language: 'en', device: 'DESKTOP', searchEngine: 'GOOGLE',
  });
  const b = ri.trackedKeywordIdentity({
    organizationId: 'o1', websiteId: 'w2', keyword: 'crm', country: 'US', language: 'en', device: 'DESKTOP', searchEngine: 'GOOGLE',
  });
  assert.notEqual(a, b);
});

await test('identity separates devices', async () => {
  const a = ri.trackedKeywordIdentity({
    organizationId: 'o1', websiteId: 'w1', keyword: 'crm', country: 'US', language: 'en', device: 'DESKTOP', searchEngine: 'GOOGLE',
  });
  const b = ri.trackedKeywordIdentity({
    organizationId: 'o1', websiteId: 'w1', keyword: 'crm', country: 'US', language: 'en', device: 'MOBILE', searchEngine: 'GOOGLE',
  });
  assert.notEqual(a, b);
});

await test('identity separates countries', async () => {
  const a = ri.trackedKeywordIdentity({
    organizationId: 'o1', websiteId: 'w1', keyword: 'crm', country: 'US', language: 'en', device: 'DESKTOP', searchEngine: 'GOOGLE',
  });
  const b = ri.trackedKeywordIdentity({
    organizationId: 'o1', websiteId: 'w1', keyword: 'crm', country: 'IN', language: 'en', device: 'DESKTOP', searchEngine: 'GOOGLE',
  });
  assert.notEqual(a, b);
});

/* ---------- alerts §43/§44 (18) ---------- */

function alerts(o = {}) {
  return ri.buildAlertCandidates({
    keyword: 'real estate CRM',
    previous: null,
    current: null,
    previousUrl: null,
    currentUrl: null,
    targetUrl: null,
    previousFeatures: [],
    currentFeatures: [],
    competitorOvertook: false,
    competitorDomain: null,
    ...o,
  });
}

await test('alert drop meaningful', async () => {
  const a = alerts({ previous: 5, current: 12 });
  assert.ok(a.some((x) => x.trigger === 'POSITION_DROP'));
});

await test('alert drop high severity outside top10', async () => {
  const a = alerts({ previous: 5, current: 12 });
  assert.equal(a.find((x) => x.trigger === 'POSITION_DROP').severity, 'HIGH');
});

await test('alert drop medium inside top10', async () => {
  const a = alerts({ previous: 5, current: 8 });
  assert.equal(a.find((x) => x.trigger === 'POSITION_DROP').severity, 'MEDIUM');
});

await test('alert gain meaningful', async () => {
  const a = alerts({ previous: 12, current: 7 });
  assert.ok(a.some((x) => x.trigger === 'POSITION_GAIN'));
});

await test('alert noise single position suppressed', async () => {
  const a = alerts({ previous: 5, current: 6 });
  assert.ok(!a.some((x) => x.trigger === 'POSITION_DROP'));
  assert.ok(!a.some((x) => x.trigger === 'POSITION_GAIN'));
});

await test('alert top3 exit', async () => {
  const a = alerts({ previous: 2, current: 5 });
  assert.ok(a.some((x) => x.trigger === 'TOP_3_EXIT'));
});

await test('alert top10 exit', async () => {
  const a = alerts({ previous: 8, current: 12 });
  assert.ok(a.some((x) => x.trigger === 'TOP_10_EXIT'));
});

await test('alert top10 entry', async () => {
  const a = alerts({ previous: 12, current: 8 });
  assert.ok(a.some((x) => x.trigger === 'TOP_10_ENTRY'));
});

await test('alert wrong url', async () => {
  const a = alerts({
    previous: 6,
    current: 6,
    previousUrl: 'https://a.com/target',
    currentUrl: 'https://a.com/other',
    targetUrl: 'https://a.com/target',
  });
  assert.ok(a.some((x) => x.trigger === 'WRONG_URL'));
});

await test('alert no wrong url when target ranks', async () => {
  const a = alerts({
    previous: 6,
    current: 6,
    previousUrl: 'https://a.com/target',
    currentUrl: 'https://a.com/target',
    targetUrl: 'https://a.com/target',
  });
  assert.ok(!a.some((x) => x.trigger === 'WRONG_URL'));
});

await test('alert serp feature lost', async () => {
  const a = alerts({
    previous: 6,
    current: 6,
    previousFeatures: ['VIDEO'],
    currentFeatures: [],
  });
  assert.ok(a.some((x) => x.trigger === 'SERP_FEATURE_LOST'));
});

await test('alert serp feature gained', async () => {
  const a = alerts({
    previous: 6,
    current: 6,
    previousFeatures: [],
    currentFeatures: ['AI_OVERVIEW'],
  });
  assert.ok(a.some((x) => x.trigger === 'SERP_FEATURE_GAINED'));
});

await test('alert competitor overtake', async () => {
  const a = alerts({
    previous: 6,
    current: 7,
    competitorOvertook: true,
    competitorDomain: 'rival.com',
  });
  assert.ok(a.some((x) => x.trigger === 'COMPETITOR_OVERTAKE'));
});

await test('alert no competitor invented', async () => {
  const a = alerts({ previous: 6, current: 7, competitorOvertook: false, competitorDomain: 'rival.com' });
  assert.ok(!a.some((x) => x.trigger === 'COMPETITOR_OVERTAKE'));
});

await test('alert descriptive no emergency', async () => {
  const a = alerts({ previous: 5, current: 12 });
  for (const x of a) {
    assert.doesNotMatch(x.description, /emergency/i);
    assert.match(x.description, /observed/i);
  }
});

await test('alert missing positions no triggers', async () => {
  assert.deepEqual(alerts({ previous: null, current: null }), []);
});

await test('noise floor note exists', async () => {
  assert.match(ri.noiseFloorNote(), /Single-position/);
});

/* ---------- competitor §35/§36 (7) ---------- */

await test('competitor gained', async () => {
  assert.equal(
    ri.competitorMove({ competitorPrevious: 9, competitorCurrent: 4, competitorExists: true }),
    'COMPETITOR_GAINED',
  );
});

await test('competitor dropped', async () => {
  assert.equal(
    ri.competitorMove({ competitorPrevious: 4, competitorCurrent: 9, competitorExists: true }),
    'COMPETITOR_DROPPED',
  );
});

await test('competitor stable', async () => {
  assert.equal(
    ri.competitorMove({ competitorPrevious: 4, competitorCurrent: 4, competitorExists: true }),
    'COMPETITOR_STABLE',
  );
});

await test('competitor entered', async () => {
  assert.equal(
    ri.competitorMove({ competitorPrevious: null, competitorCurrent: 4, competitorExists: true }),
    'COMPETITOR_ENTERED',
  );
});

await test('competitor unknown missing', async () => {
  assert.equal(
    ri.competitorMove({ competitorPrevious: 4, competitorCurrent: null, competitorExists: true }),
    'UNKNOWN',
  );
});

await test('competitor unknown no evidence', async () => {
  assert.equal(
    ri.competitorMove({ competitorPrevious: 4, competitorCurrent: 4, competitorExists: false }),
    'UNKNOWN',
  );
});

await test('competitor no causal claim type', async () => {
  assert.equal(
    ri.competitorMove({ competitorPrevious: 9, competitorCurrent: 4, competitorExists: true }),
    'COMPETITOR_GAINED',
  );
});

/* ---------- honesty §78 (14) ---------- */

await test('honesty observed label', async () => {
  assert.match(ri.honestyLabel('OBSERVED'), /OBSERVED/);
});

await test('honesty estimated labeled', async () => {
  assert.match(ri.honestyLabel('ESTIMATED'), /Estimated/);
});

await test('honesty inferred labeled', async () => {
  assert.match(ri.honestyLabel('INFERRED'), /Inferred/);
});

await test('honesty unknown not zero', async () => {
  assert.match(ri.honestyLabel('UNKNOWN'), /not zero/);
});

await test('history sufficient', async () => {
  assert.equal(
    ri.historySufficiency({
      observationCount: 5,
      trackingStartedAt: '2026-08-01T00:00:00.000Z',
      oldestObservationAt: '2026-08-02T00:00:00.000Z',
    }),
    'SUFFICIENT',
  );
});

await test('history tracking started single point', async () => {
  assert.equal(
    ri.historySufficiency({
      observationCount: 1,
      trackingStartedAt: '2026-08-01T00:00:00.000Z',
      oldestObservationAt: '2026-08-02T00:00:00.000Z',
    }),
    'TRACKING_STARTED',
  );
});

await test('history tracking started imported older', async () => {
  assert.equal(
    ri.historySufficiency({
      observationCount: 5,
      trackingStartedAt: '2026-09-01T00:00:00.000Z',
      oldestObservationAt: '2026-08-01T00:00:00.000Z',
    }),
    'TRACKING_STARTED',
  );
});

await test('history tracking started missing dates', async () => {
  assert.equal(
    ri.historySufficiency({ observationCount: 5, trackingStartedAt: null, oldestObservationAt: null }),
    'TRACKING_STARTED',
  );
});

await test('investigation copy renkoo standard', async () => {
  const s = ri.investigationCopy({
    keyword: 'real estate CRM',
    previous: 12,
    current: 7,
    rankingUrl: 'https://a.com/real-estate-crm',
  });
  assert.match(s, /real estate CRM/);
  assert.match(s, /#12 → #7/);
  assert.match(s, /OBSERVED/);
  assert.match(s, /CAUSE/);
  assert.match(s, /Next best action/);
});

await test('investigation copy partial observations', async () => {
  const s = ri.investigationCopy({
    keyword: 'crm',
    previous: null,
    current: null,
    rankingUrl: null,
  });
  assert.match(s, /partially unobserved/);
});

await test('unknown never zero band', async () => {
  assert.notEqual(ri.positionBand(null, false), 'NOT_RANKING');
});

await test('missing never loss movement', async () => {
  assert.notEqual(mv({ previous: 6, current: null, previousExists: true }), 'DROPPED_OUT');
});

await test('ai citation never rank', async () => {
  const d = ri.aiGoogleDivergence({ trackedPosition: null, aiOverview: 'UNKNOWN', aiMode: 'AI_CITATION' });
  assert.equal(d, 'GOOGLE_WEAK_AI_STRONG');
});

/* ---------- performance bounds (4) ---------- */

await test('identity batch 1000 unique', async () => {
  const seen = new Set();
  for (let i = 0; i < 1000; i++) {
    seen.add(
      ri.trackedKeywordIdentity({
        organizationId: 'o1',
        websiteId: 'w1',
        keyword: `keyword ${i}`,
        country: 'US',
        language: 'en',
        device: 'DESKTOP',
        searchEngine: 'GOOGLE',
      }),
    );
  }
  assert.equal(seen.size, 1000);
});

await test('band batch no throw', async () => {
  for (let i = 0; i < 500; i++) {
    ri.positionBand((i % 120) + 1, false);
  }
  assert.ok(true);
});

await test('movement batch consecutive pairs', async () => {
  let prev = 50;
  for (let i = 0; i < 200; i++) {
    const cur = (i % 50) + 1;
    const m = mv({ previous: prev, current: cur, previousExists: true });
    assert.match(m, /^(GAINED|LOST|STABLE)$/);
    prev = cur;
  }
});

await test('alert batch bounded', async () => {
  for (let i = 0; i < 200; i++) {
    const a = alerts({ previous: (i % 20) + 1, current: ((i + 5) % 20) + 1 });
    assert.ok(a.length <= 8);
  }
});

/* ---------- import origins + config §8/§9/§10 (10) ---------- */

await test('origin strategy isolated', async () => {
  assert.equal(ri.normalizeOrigin('STRATEGY'), 'STRATEGY');
});

await test('origin customer demand isolated', async () => {
  assert.equal(ri.normalizeOrigin('CUSTOMER_DEMAND'), 'CUSTOMER_DEMAND');
});

await test('origin never silently gsc', async () => {
  assert.equal(ri.normalizeOrigin(''), null);
  assert.equal(ri.normalizeOrigin('auto'), null);
});

await test('device uppercase mobile', async () => {
  assert.equal(ri.normalizeDevice('MOBILE'), 'MOBILE');
});

await test('country gb maps', async () => {
  assert.equal(ri.normalizeCountry('gb'), 'GB');
});

await test('language region preserved lowercase', async () => {
  assert.equal(ri.normalizeLanguage('en-US'), 'en-us');
});

await test('identity separates origins by keyword set not origin field', async () => {
  const a = ri.trackedKeywordIdentity({
    organizationId: 'o1', websiteId: 'w1', keyword: 'crm', country: 'US', language: 'en', device: 'DESKTOP', searchEngine: 'GOOGLE',
  });
  assert.ok(a.includes('crm'));
});

await test('identity separates languages', async () => {
  const a = ri.trackedKeywordIdentity({
    organizationId: 'o1', websiteId: 'w1', keyword: 'crm', country: 'US', language: 'en', device: 'DESKTOP', searchEngine: 'GOOGLE',
  });
  const b = ri.trackedKeywordIdentity({
    organizationId: 'o1', websiteId: 'w1', keyword: 'crm', country: 'US', language: 'de', device: 'DESKTOP', searchEngine: 'GOOGLE',
  });
  assert.notEqual(a, b);
});

await test('window key second date', async () => {
  assert.equal(ri.observationWindowKey('2026-01-15T23:59:59.000Z'), '2026-01-15');
});

await test('window key midnight boundary', async () => {
  assert.equal(ri.observationWindowKey('2026-12-31T00:00:00.000Z'), '2026-12-31');
});

/* ---------- history + measurement honesty §16/§48/§51 (10) ---------- */

await test('history boundary two points sufficient', async () => {
  assert.equal(
    ri.historySufficiency({
      observationCount: 2,
      trackingStartedAt: '2026-08-01T00:00:00.000Z',
      oldestObservationAt: '2026-08-01T00:00:00.000Z',
    }),
    'SUFFICIENT',
  );
});

await test('delta large climb', async () => {
  const d = ri.positionDelta(100, 1);
  assert.equal(d.delta, 99);
  assert.equal(d.direction, 'GAINED');
});

await test('delta large fall', async () => {
  const d = ri.positionDelta(1, 100);
  assert.equal(d.delta, -99);
  assert.equal(d.direction, 'LOST');
});

await test('divergence null position ai present', async () => {
  assert.equal(
    ri.aiGoogleDivergence({ trackedPosition: null, aiOverview: 'UNKNOWN', aiMode: 'AI_CITATION' }),
    'GOOGLE_WEAK_AI_STRONG',
  );
});

await test('divergence null position ai absent', async () => {
  assert.equal(
    ri.aiGoogleDivergence({ trackedPosition: null, aiOverview: 'NOT_OBSERVED', aiMode: 'AI_NOT_OBSERVED' }),
    'BOTH_WEAK',
  );
});

await test('volatility gaps stay gaps', async () => {
  assert.equal(ri.describeVolatility([5, null, 6, null, 7]), 'HIGHLY_VARIABLE');
});

await test('volatility all null insufficient', async () => {
  assert.equal(ri.describeVolatility([null, null, null, null]), 'INSUFFICIENT_HISTORY');
});

await test('movement new ignores stray previous value', async () => {
  assert.equal(mv({ previous: 3, current: 5, previousExists: false }), 'NEW');
});

await test('gsc vs tracked both present statement', async () => {
  const c = ri.compareGscToTracked({ gscPosition: 7.2, trackedPosition: 6 });
  assert.match(c.statement, /7\.2/);
  assert.match(c.statement, /TRACKED POSITION 6/);
});

await test('estimated never observed honesty', async () => {
  assert.notEqual(ri.honestyLabel('ESTIMATED'), ri.honestyLabel('OBSERVED'));
});

/* ---------- alert severity + spam prevention §44 (10) ---------- */

await test('alert top3 exit high severity', async () => {
  const a = alerts({ previous: 2, current: 5 });
  assert.equal(a.find((x) => x.trigger === 'TOP_3_EXIT').severity, 'HIGH');
});

await test('alert gain low severity', async () => {
  const a = alerts({ previous: 15, current: 11 });
  assert.equal(a.find((x) => x.trigger === 'POSITION_GAIN').severity, 'LOW');
});

await test('alert top10 entry low severity', async () => {
  const a = alerts({ previous: 11, current: 9 });
  assert.equal(a.find((x) => x.trigger === 'TOP_10_ENTRY').severity, 'LOW');
});

await test('alert wrong url medium severity', async () => {
  const a = alerts({
    previous: 6,
    current: 6,
    previousUrl: 'https://a.com/t',
    currentUrl: 'https://a.com/o',
    targetUrl: 'https://a.com/t',
  });
  assert.equal(a.find((x) => x.trigger === 'WRONG_URL').severity, 'MEDIUM');
});

await test('alert feature lost medium', async () => {
  const a = alerts({ previous: 6, current: 6, previousFeatures: ['VIDEO'], currentFeatures: [] });
  assert.equal(a.find((x) => x.trigger === 'SERP_FEATURE_LOST').severity, 'MEDIUM');
});

await test('alert feature gained low', async () => {
  const a = alerts({ previous: 6, current: 6, previousFeatures: [], currentFeatures: ['VIDEO'] });
  assert.equal(a.find((x) => x.trigger === 'SERP_FEATURE_GAINED').severity, 'LOW');
});

await test('alert drop carries cause unknown', async () => {
  const a = alerts({ previous: 5, current: 12 });
  assert.match(a.find((x) => x.trigger === 'POSITION_DROP').description, /unknown/i);
});

await test('alert no wrong url without target', async () => {
  const a = alerts({
    previous: 6,
    current: 6,
    previousUrl: 'https://a.com/a',
    currentUrl: 'https://a.com/b',
    targetUrl: null,
  });
  assert.ok(!a.some((x) => x.trigger === 'WRONG_URL'));
});

await test('alert feature swap both triggers', async () => {
  const a = alerts({
    previous: 6,
    current: 6,
    previousFeatures: ['VIDEO'],
    currentFeatures: ['SHOPPING'],
  });
  assert.ok(a.some((x) => x.trigger === 'SERP_FEATURE_LOST'));
  assert.ok(a.some((x) => x.trigger === 'SERP_FEATURE_GAINED'));
});

await test('alert top3 exit also drop trigger', async () => {
  const a = alerts({ previous: 2, current: 6 });
  assert.ok(a.some((x) => x.trigger === 'POSITION_DROP'));
  assert.ok(a.some((x) => x.trigger === 'TOP_3_EXIT'));
});

/* ---------- url + target edges (6) ---------- */

await test('url empty strings no url', async () => {
  assert.equal(ri.rankingUrlState('', '', true), 'NO_URL');
});

await test('url whitespace treated missing', async () => {
  assert.equal(ri.rankingUrlState('   ', null, true), 'NO_URL');
});

await test('target case-insensitive match', async () => {
  assert.equal(
    ri.targetUrlState({ targetUrl: 'HTTPS://A.COM/X', rankingUrl: 'https://a.com/x', position: 3, providerConfirmedAbsent: false }),
    'TARGET_RANKING',
  );
});

await test('serp uppercase input kept', async () => {
  assert.deepEqual(ri.normalizeSerpFeatures(['SHOPPING']), ['SHOPPING']);
});

await test('ai overview empty supports not observed', async () => {
  assert.equal(ri.aiOverviewState([], true), 'NOT_OBSERVED');
});

await test('health running partial', async () => {
  assert.equal(health({ lastRunStatus: 'RUNNING' }), 'PARTIAL');
});

/* ---------- summary ---------- */

const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(`\nRank Intelligence 2.0: ${passCount}/${results.length} passed.`);
if (failed.length > 0) {
  console.log(failed.join('\n'));
  process.exit(1);
} else {
  console.log('All Rank Intelligence 2.0 tests passed.');
}

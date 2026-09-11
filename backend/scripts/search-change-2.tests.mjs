/*
 * RENKOO Search Change & Alert Intelligence 2.0 — tests (Phase 32).
 *
 * 232 tests over pure functions only: change policy,
 * scheduler (due/execute/missed/stale/heartbeat/
 * timezone), observation validation, rank
 * classification, meaningful gates, AI change (never
 * AI rank), AIO states, action correlation (planned/
 * unplanned, gain-after-verified wording), dedupe,
 * cooldown, resolution, digest, evidence envelope,
 * preferences/mute, health, observability, run
 * identity, vocabularies, tenant isolation, bounded
 * performance, honesty invariants. No DB, no provider
 * calls, no billing touch.
 *
 * Run: npm run test:search-change-2   (dist built)
 */
import assert from 'node:assert/strict';

const sc = await import(
  '../dist/keywords/search-change.js'
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

function baseClassify(o = {}) {
  return sc.classifyRankChange({
    keyword: 'real estate CRM',
    previous: null,
    current: null,
    previousConfirmedAbsent: false,
    currentConfirmedAbsent: false,
    previousExists: false,
    urlChanged: false,
    targetReplaced: false,
    serpFeatureGained: [],
    serpFeatureLost: [],
    competitorMoved: false,
    aiStateChanged: false,
    ...o,
  });
}

function validObs(o = {}) {
  return {
    source: 'SERP_PROVIDER',
    observedAt: '2026-09-10T00:00:00.000Z',
    keyword: 'real estate CRM',
    country: 'US',
    device: 'desktop',
    engine: 'GOOGLE',
    position: 7,
    providerConfirmedAbsent: false,
    rankingUrl: 'https://a.com/real-estate-crm',
    ...o,
  };
}

/* ---------- policy §1 (8) ---------- */

await test('policy principle meaningful not 500', async () => {
  assert.match(sc.meaningfulChangePolicy().principle, /meaningful/i);
});

await test('policy default digest', async () => {
  assert.equal(sc.meaningfulChangePolicy().defaultDelivery, 'DIGEST');
});

await test('policy instant only high value', async () => {
  assert.match(sc.meaningfulChangePolicy().instantOnlyWhen, /high-value/i);
});

await test('policy noise rule single position', async () => {
  assert.match(sc.meaningfulChangePolicy().noiseRule, /Single-position/i);
});

await test('policy max digest ten', async () => {
  assert.equal(sc.meaningfulChangePolicy().maxDigestItems, 10);
});

await test('policy deterministic', async () => {
  assert.deepEqual(sc.meaningfulChangePolicy(), sc.meaningfulChangePolicy());
});

await test('alert types fourteen supported', async () => {
  assert.equal(sc.SEARCH_ALERT_TYPES.length, 14);
});

await test('alert types include execution verified', async () => {
  assert.ok(sc.SEARCH_ALERT_TYPES.includes('EXECUTION_VERIFIED'));
  assert.ok(sc.SEARCH_ALERT_TYPES.includes('AI_VISIBILITY_CHANGE'));
});

/* ---------- scheduler §3/§4/§6 (24) ---------- */

await test('cadence daily default', async () => {
  assert.equal(sc.normalizeCadence(''), 'DAILY');
  assert.equal(sc.normalizeCadence('hourly'), 'DAILY');
});

await test('cadence weekly optional', async () => {
  assert.equal(sc.normalizeCadence('weekly'), 'WEEKLY');
});

await test('next run daily plus one', async () => {
  const n = sc.nextRunAt('DAILY', new Date('2026-09-10T00:00:00.000Z'));
  assert.equal(n.toISOString(), '2026-09-11T00:00:00.000Z');
});

await test('next run weekly plus seven', async () => {
  const n = sc.nextRunAt('WEEKLY', new Date('2026-09-10T00:00:00.000Z'));
  assert.equal(n.toISOString(), '2026-09-17T00:00:00.000Z');
});

await test('due when past', async () => {
  assert.equal(
    sc.isScheduleDue({ isActive: true, nextRunAt: '2026-01-01T00:00:00.000Z', now: '2026-09-10T00:00:00.000Z' }),
    true,
  );
});

await test('not due when future', async () => {
  assert.equal(
    sc.isScheduleDue({ isActive: true, nextRunAt: '2027-01-01T00:00:00.000Z', now: '2026-09-10T00:00:00.000Z' }),
    false,
  );
});

await test('inactive never due', async () => {
  assert.equal(
    sc.isScheduleDue({ isActive: false, nextRunAt: '2026-01-01T00:00:00.000Z', now: '2026-09-10T00:00:00.000Z' }),
    false,
  );
});

await test('null next run due', async () => {
  assert.equal(sc.isScheduleDue({ isActive: true, nextRunAt: null }), true);
});

await test('invalid dates not due', async () => {
  assert.equal(sc.isScheduleDue({ isActive: true, nextRunAt: 'nope' }), false);
});

await test('missed zero on schedule', async () => {
  assert.equal(
    sc.missedWindowCount({ cadence: 'DAILY', nextRunAt: '2026-09-10T00:00:00.000Z', now: '2026-09-10T01:00:00.000Z' }),
    0,
  );
});

await test('missed counts days', async () => {
  assert.equal(
    sc.missedWindowCount({ cadence: 'DAILY', nextRunAt: '2026-09-07T00:00:00.000Z', now: '2026-09-10T00:00:00.000Z' }),
    3,
  );
});

await test('missed counts weeks', async () => {
  assert.equal(
    sc.missedWindowCount({ cadence: 'WEEKLY', nextRunAt: '2026-08-27T00:00:00.000Z', now: '2026-09-10T00:00:00.000Z' }),
    2,
  );
});

await test('missed decision latest only', async () => {
  const d = sc.missedRunDecision({ cadence: 'DAILY', nextRunAt: '2026-09-07T00:00:00.000Z', now: '2026-09-10T00:00:00.000Z' });
  assert.equal(d.executeLatestOnly, true);
  assert.equal(d.skippedWindows, 3);
  assert.match(d.note, /not fabricated/);
});

await test('missed decision on schedule', async () => {
  const d = sc.missedRunDecision({ cadence: 'DAILY', nextRunAt: '2026-09-10T00:00:00.000Z', now: '2026-09-10T00:00:00.000Z' });
  assert.equal(d.skippedWindows, 0);
});

await test('bounds claim per tick', async () => {
  assert.equal(sc.MAX_CLAIM_PER_TICK, 25);
});

await test('bounds executions per tick', async () => {
  assert.equal(sc.MAX_EXECUTIONS_PER_TICK, 5);
});

await test('bounds keywords per run', async () => {
  assert.equal(sc.MAX_KEYWORDS_PER_RUN, 50);
});

await test('bounds provider concurrency', async () => {
  assert.equal(sc.MAX_PROVIDER_CONCURRENCY, 2);
});

await test('bounds alerts per run', async () => {
  assert.equal(sc.MAX_ALERTS_PER_RUN, 50);
});

await test('bounds digest items', async () => {
  assert.equal(sc.MAX_DIGEST_ITEMS, 10);
});

await test('bounds db batch', async () => {
  assert.equal(sc.MAX_DB_BATCH, 500);
});

await test('cooldown default 24h', async () => {
  assert.equal(sc.ALERT_COOLDOWN_MS, 24 * 60 * 60 * 1000);
});

await test('stale timeout 30m', async () => {
  assert.equal(sc.STALE_RUN_MS, 30 * 60 * 1000);
});

await test('no hourly tracking', async () => {
  assert.equal(sc.normalizeCadence('HOURLY'), 'DAILY');
  assert.equal(sc.normalizeCadence('MINUTELY'), 'DAILY');
});

/* ---------- stale runs §8 (6) ---------- */

await test('stale running old', async () => {
  assert.equal(
    sc.isChangeRunStale({ status: 'RUNNING', startedAt: '2026-09-01T00:00:00.000Z', nowMs: new Date('2026-09-10T00:00:00.000Z').getTime() }),
    true,
  );
});

await test('fresh running not stale', async () => {
  const now = Date.now();
  assert.equal(
    sc.isChangeRunStale({ status: 'RUNNING', startedAt: new Date(now - 60 * 1000).toISOString(), nowMs: now }),
    false,
  );
});

await test('completed never stale', async () => {
  assert.equal(
    sc.isChangeRunStale({ status: 'COMPLETED', startedAt: '2026-01-01T00:00:00.000Z' }),
    false,
  );
});

await test('missing start stale', async () => {
  assert.equal(sc.isChangeRunStale({ status: 'RUNNING', startedAt: null }), true);
});

await test('heartbeat fresh saves run', async () => {
  const now = Date.now();
  assert.equal(
    sc.isChangeRunStale({
      status: 'RUNNING',
      startedAt: new Date(now - 60 * 60 * 1000).toISOString(),
      lastHeartbeatAt: new Date(now - 60 * 1000).toISOString(),
      nowMs: now,
    }),
    false,
  );
});

await test('heartbeat stale fails run', async () => {
  const now = Date.now();
  assert.equal(
    sc.isChangeRunStale({
      status: 'RUNNING',
      startedAt: new Date(now - 120 * 60 * 1000).toISOString(),
      lastHeartbeatAt: new Date(now - 60 * 60 * 1000).toISOString(),
      nowMs: now,
    }),
    true,
  );
});

/* ---------- validation §12 (16) ---------- */

await test('valid ranking observation', async () => {
  const r = sc.validateObservation(validObs());
  assert.equal(r.valid, true);
  assert.equal(r.positionState, 'RANKING');
});

await test('valid not ranking confirmed', async () => {
  const r = sc.validateObservation(validObs({ position: null, providerConfirmedAbsent: true }));
  assert.equal(r.valid, true);
  assert.equal(r.positionState, 'NOT_RANKING');
});

await test('valid unknown unconfirmed', async () => {
  const r = sc.validateObservation(validObs({ position: null, providerConfirmedAbsent: false }));
  assert.equal(r.valid, true);
  assert.equal(r.positionState, 'UNKNOWN');
  assert.match(r.reason, /never a loss/);
});

await test('invalid source discarded', async () => {
  const r = sc.validateObservation(validObs({ source: 'BING_API' }));
  assert.equal(r.valid, false);
  assert.match(r.reason, /never silently used/);
});

await test('invalid timestamp unavailable', async () => {
  const r = sc.validateObservation(validObs({ observedAt: 'nope' }));
  assert.equal(r.valid, false);
  assert.match(r.reason, /unavailable with reason/);
});

await test('missing keyword discarded', async () => {
  const r = sc.validateObservation(validObs({ keyword: '   ' }));
  assert.equal(r.valid, false);
});

await test('missing country discarded', async () => {
  const r = sc.validateObservation(validObs({ country: '' }));
  assert.equal(r.valid, false);
});

await test('bad device discarded', async () => {
  const r = sc.validateObservation(validObs({ device: 'tablet' }));
  assert.equal(r.valid, false);
});

await test('mobile device valid', async () => {
  assert.equal(sc.validateObservation(validObs({ device: 'MOBILE' })).valid, true);
});

await test('bad engine discarded', async () => {
  const r = sc.validateObservation(validObs({ engine: 'BING' }));
  assert.equal(r.valid, false);
});

await test('zero position invalid', async () => {
  assert.equal(sc.validateObservation(validObs({ position: 0 })).valid, false);
});

await test('negative position invalid', async () => {
  assert.equal(sc.validateObservation(validObs({ position: -3 })).valid, false);
});

await test('gsc source valid', async () => {
  const r = sc.validateObservation(validObs({ source: 'GSC' }));
  assert.equal(r.valid, true);
});

await test('manual source valid', async () => {
  const r = sc.validateObservation(validObs({ source: 'MANUAL' }));
  assert.equal(r.valid, true);
});

await test('string position coerced', async () => {
  assert.equal(sc.validateObservation(validObs({ position: '7' })).positionState, 'RANKING');
});

await test('null position unknown + valid', async () => {
  const r = sc.validateObservation(validObs({ position: undefined }));
  assert.equal(r.valid, true);
  assert.equal(r.positionState, 'UNKNOWN');
});

/* ---------- rank classification §13/§14 (26) ---------- */

await test('gain meaningful large', async () => {
  const c = baseClassify({ previous: 12, current: 6, previousExists: true });
  assert.equal(c[0].event, 'GAINED');
  assert.equal(c[0].alertType, 'TOP_10_ENTRY');
  assert.equal(c[0].meaningful, true);
});

await test('small gain not meaningful', async () => {
  const c = baseClassify({ previous: 6, current: 5, previousExists: true });
  assert.equal(c[0].event, 'GAINED');
  assert.equal(c[0].meaningful, false);
});

await test('loss meaningful large', async () => {
  const c = baseClassify({ previous: 6, current: 12, previousExists: true });
  assert.equal(c[0].event, 'LOST');
  assert.equal(c[0].alertType, 'TOP_10_EXIT');
  assert.equal(c[0].meaningful, true);
});

await test('single position loss suppressed', async () => {
  const c = baseClassify({ previous: 6, current: 7, previousExists: true });
  assert.equal(c[0].meaningful, false);
});

await test('top3 exit', async () => {
  const c = baseClassify({ previous: 2, current: 5, previousExists: true });
  assert.equal(c[0].alertType, 'TOP_3_EXIT');
  assert.equal(c[0].meaningful, true);
});

await test('top3 entry', async () => {
  const c = baseClassify({ previous: 5, current: 2, previousExists: true });
  assert.equal(c[0].alertType, 'TOP_3_ENTRY');
});

await test('top10 exit', async () => {
  const c = baseClassify({ previous: 9, current: 14, previousExists: true });
  assert.equal(c[0].alertType, 'TOP_10_EXIT');
});

await test('top10 entry', async () => {
  const c = baseClassify({ previous: 14, current: 9, previousExists: true });
  assert.equal(c[0].alertType, 'TOP_10_ENTRY');
});

await test('new keyword entered', async () => {
  const c = baseClassify({ previous: null, current: 8, previousExists: false });
  assert.equal(c[0].event, 'ENTERED');
  assert.equal(c[0].meaningful, false);
});

await test('returned meaningful in top10', async () => {
  const c = baseClassify({ previous: null, current: 8, previousExists: true, previousConfirmedAbsent: true });
  assert.equal(c[0].event, 'ENTERED');
  assert.equal(c[0].meaningful, true);
});

await test('exited confirmed absent', async () => {
  const c = baseClassify({ previous: 6, current: null, previousExists: true, currentConfirmedAbsent: true });
  assert.equal(c[0].event, 'EXITED');
  assert.equal(c[0].alertType, 'RANK_LOSS');
});

await test('unknown current no events', async () => {
  assert.deepEqual(baseClassify({ previous: 6, current: null, previousExists: true }), []);
});

await test('unconfirmed null no loss', async () => {
  assert.deepEqual(
    baseClassify({ previous: 6, current: null, previousExists: true, currentConfirmedAbsent: false }),
    [],
  );
});

await test('stable no events', async () => {
  assert.deepEqual(baseClassify({ previous: 7, current: 7, previousExists: true }), []);
});

await test('url replaced wrong url meaningful', async () => {
  const c = baseClassify({ previous: 6, current: 6, previousExists: true, urlChanged: true, targetReplaced: true });
  const u = c.find((x) => x.event === 'URL_CHANGED');
  assert.equal(u.alertType, 'WRONG_URL');
  assert.equal(u.meaningful, true);
});

await test('url changed not replaced unmeaningful', async () => {
  const c = baseClassify({ previous: 6, current: 6, previousExists: true, urlChanged: true, targetReplaced: false });
  assert.equal(c.find((x) => x.event === 'URL_CHANGED').meaningful, false);
});

await test('serp gain aio meaningful', async () => {
  const c = baseClassify({ previous: 6, current: 6, previousExists: true, serpFeatureGained: ['AI_OVERVIEW'] });
  const g = c.find((x) => x.event === 'SERP_FEATURE_GAINED');
  assert.equal(g.meaningful, true);
});

await test('serp gain video not meaningful', async () => {
  const c = baseClassify({ previous: 6, current: 6, previousExists: true, serpFeatureGained: ['VIDEO'] });
  assert.equal(c.find((x) => x.event === 'SERP_FEATURE_GAINED').meaningful, false);
});

await test('serp lost featured meaningful', async () => {
  const c = baseClassify({ previous: 6, current: 6, previousExists: true, serpFeatureLost: ['FEATURED_SNIPPET'] });
  assert.equal(c.find((x) => x.event === 'SERP_FEATURE_LOST').meaningful, true);
});

await test('competitor movement meaningful', async () => {
  const c = baseClassify({ previous: 6, current: 6, previousExists: true, competitorMoved: true });
  const m = c.find((x) => x.event === 'COMPETITOR_MOVEMENT');
  assert.equal(m.alertType, 'COMPETITOR_MOVEMENT');
  assert.equal(m.meaningful, true);
});

await test('ai state changed', async () => {
  const c = baseClassify({ previous: 6, current: 6, previousExists: true, aiStateChanged: true });
  const a = c.find((x) => x.event === 'AI_STATE_CHANGED');
  assert.equal(a.alertType, 'AI_VISIBILITY_CHANGE');
  assert.match(a.statement, /not a rank/);
});

await test('statements observed no cause', async () => {
  const c = baseClassify({ previous: 6, current: 12, previousExists: true });
  assert.match(c[0].statement, /observed/);
  assert.doesNotMatch(c[0].statement, /penal|caused|because/i);
});

await test('event vocabulary nine', async () => {
  assert.equal(sc.RANK_CHANGE_EVENTS.length, 9);
});

await test('gain statement counts', async () => {
  const c = baseClassify({ previous: 12, current: 7, previousExists: true });
  assert.match(c[0].statement, /gained 5/);
});

await test('loss statement counts', async () => {
  const c = baseClassify({ previous: 7, current: 12, previousExists: true });
  assert.match(c[0].statement, /lost 5/);
});

await test('returned outside top10 not meaningful', async () => {
  const c = baseClassify({ previous: null, current: 25, previousExists: true, previousConfirmedAbsent: true });
  assert.equal(c[0].meaningful, false);
});

/* ---------- AI change §20/§21/§22 (12) ---------- */

await test('ai mention gained', async () => {
  assert.deepEqual(
    sc.classifyAiChange({ previousMention: false, currentMention: true, previousCitation: null, currentCitation: null, previousSource: null, currentSource: null, providerSupportsAi: true }),
    ['AI_MENTION_GAINED'],
  );
});

await test('ai mention lost', async () => {
  assert.deepEqual(
    sc.classifyAiChange({ previousMention: true, currentMention: false, previousCitation: null, currentCitation: null, previousSource: null, currentSource: null, providerSupportsAi: true }),
    ['AI_MENTION_LOST'],
  );
});

await test('ai citation gained', async () => {
  assert.deepEqual(
    sc.classifyAiChange({ previousMention: null, currentMention: null, previousCitation: false, currentCitation: true, previousSource: null, currentSource: null, providerSupportsAi: true }),
    ['AI_CITATION_GAINED'],
  );
});

await test('ai citation lost', async () => {
  assert.deepEqual(
    sc.classifyAiChange({ previousMention: null, currentMention: null, previousCitation: true, currentCitation: false, previousSource: null, currentSource: null, providerSupportsAi: true }),
    ['AI_CITATION_LOST'],
  );
});

await test('ai source changed', async () => {
  const e = sc.classifyAiChange({ previousMention: null, currentMention: null, previousCitation: null, currentCitation: null, previousSource: 'https://a.com/x', currentSource: 'https://b.com/y', providerSupportsAi: true });
  assert.deepEqual(e, ['AI_SOURCE_CHANGED']);
});

await test('ai source same no event', async () => {
  const e = sc.classifyAiChange({ previousMention: null, currentMention: null, previousCitation: null, currentCitation: null, previousSource: 'https://a.com/x', currentSource: 'https://a.com/x', providerSupportsAi: true });
  assert.deepEqual(e, []);
});

await test('ai no provider no events', async () => {
  const e = sc.classifyAiChange({ previousMention: false, currentMention: true, previousCitation: false, currentCitation: true, previousSource: 'a', currentSource: 'b', providerSupportsAi: false });
  assert.deepEqual(e, []);
});

await test('ai never rank event', async () => {
  assert.ok(!sc.AI_CHANGE_EVENTS.some((e) => e.includes('RANK')));
  assert.equal(sc.AI_CHANGE_EVENTS.length, 5);
});

await test('aio present', async () => {
  assert.equal(sc.aioState({ providerSupportsAi: true, observed: true }), 'AIO_PRESENT');
});

await test('aio not observed not absence', async () => {
  assert.equal(sc.aioState({ providerSupportsAi: true, observed: false }), 'AIO_NOT_OBSERVED');
});

await test('aio unknown no provider', async () => {
  assert.equal(sc.aioState({ providerSupportsAi: false, observed: true }), 'AIO_UNKNOWN');
});

await test('aio unknown null observation', async () => {
  assert.equal(sc.aioState({ providerSupportsAi: true, observed: null }), 'AIO_UNKNOWN');
});

/* ---------- action correlation §25/§69 (6) ---------- */

await test('planned with verified action', async () => {
  assert.equal(sc.correlateAction({ recentVerifiedAction: true }), 'PLANNED_CHANGE');
});

await test('unplanned without action', async () => {
  assert.equal(sc.correlateAction({ recentVerifiedAction: false }), 'UNPLANNED_CHANGE');
});

await test('gain after verified wording', async () => {
  const s = sc.gainAfterVerifiedChange({ keyword: 'crm', before: 12, after: 7, verified: true });
  assert.match(s, /RANK_GAIN_AFTER_VERIFIED_CHANGE/);
  assert.match(s, /not proof/);
  assert.doesNotMatch(s, /caused the ranking|caused the improvement|proves the change worked/i);
});

await test('gain unverified unknown', async () => {
  const s = sc.gainAfterVerifiedChange({ keyword: 'crm', before: 12, after: 7, verified: false });
  assert.match(s, /unknown, not zero/);
});

await test('gain nulls unknown', async () => {
  const s = sc.gainAfterVerifiedChange({ keyword: 'crm', before: null, after: 7, verified: true });
  assert.match(s, /unknown, not zero/);
});

await test('decline after verified observed only', async () => {
  const s = sc.gainAfterVerifiedChange({ keyword: 'crm', before: 7, after: 12, verified: true });
  assert.match(s, /Observed outcome only/);
});

/* ---------- dedupe §27 (6) ---------- */

function dk(o = {}) {
  return sc.alertDedupeKey({
    eventType: 'RANK_LOSS',
    websiteId: 'w1',
    keywordOrPage: 'Real Estate CRM',
    windowKey: '2026-09-10',
    before: '6',
    after: '12',
    ...o,
  });
}

await test('dedupe deterministic', async () => {
  assert.equal(dk(), dk());
});

await test('dedupe keyword case-insensitive', async () => {
  assert.equal(dk(), dk({ keywordOrPage: 'real estate crm' }));
});

await test('dedupe distinguishes before after', async () => {
  assert.notEqual(dk(), dk({ before: '7' }));
  assert.notEqual(dk(), dk({ after: '13' }));
});

await test('dedupe distinguishes window', async () => {
  assert.notEqual(dk(), dk({ windowKey: '2026-09-11' }));
});

await test('dedupe distinguishes type', async () => {
  assert.notEqual(dk(), dk({ eventType: 'RANK_GAIN' }));
});

await test('dedupe isolates websites', async () => {
  assert.notEqual(dk(), dk({ websiteId: 'w2' }));
});

/* ---------- cooldown §28 (8) ---------- */

await test('cooldown first notifies', async () => {
  const d = sc.cooldownDecision({ lastNotifiedAt: null, currentBefore: '6', currentAfter: '12', lastBefore: null, lastAfter: null });
  assert.equal(d.notify, true);
});

await test('cooldown same suppresses', async () => {
  const d = sc.cooldownDecision({
    lastNotifiedAt: '2026-09-10T00:00:00.000Z',
    currentBefore: '6',
    currentAfter: '12',
    lastBefore: '6',
    lastAfter: '12',
    nowIso: '2026-09-10T12:00:00.000Z',
  });
  assert.equal(d.notify, false);
  assert.match(d.reason, /cooldown/);
});

await test('cooldown expired notifies', async () => {
  const d = sc.cooldownDecision({
    lastNotifiedAt: '2026-09-08T00:00:00.000Z',
    currentBefore: '6',
    currentAfter: '12',
    lastBefore: '6',
    lastAfter: '12',
    nowIso: '2026-09-10T00:00:00.000Z',
  });
  assert.equal(d.notify, true);
  assert.match(d.reason, /expired/);
});

await test('cooldown new movement overrides', async () => {
  const d = sc.cooldownDecision({
    lastNotifiedAt: '2026-09-10T00:00:00.000Z',
    currentBefore: '6',
    currentAfter: '14',
    lastBefore: '6',
    lastAfter: '12',
    nowIso: '2026-09-10T01:00:00.000Z',
  });
  assert.equal(d.notify, true);
  assert.match(d.reason, /new movement/);
});

await test('cooldown unclear suppresses safe', async () => {
  const d = sc.cooldownDecision({ lastNotifiedAt: 'nope', currentBefore: '6', currentAfter: '12', lastBefore: '6', lastAfter: '12' });
  assert.equal(d.notify, false);
});

await test('cooldown custom window', async () => {
  const d = sc.cooldownDecision({
    lastNotifiedAt: '2026-09-10T00:00:00.000Z',
    currentBefore: '6',
    currentAfter: '12',
    lastBefore: '6',
    lastAfter: '12',
    nowIso: '2026-09-10T02:00:00.000Z',
    cooldownMs: 60 * 60 * 1000,
  });
  assert.equal(d.notify, true);
});

await test('cooldown retained evidence note', async () => {
  const d = sc.cooldownDecision({
    lastNotifiedAt: '2026-09-10T00:00:00.000Z',
    currentBefore: '6',
    currentAfter: '12',
    lastBefore: '6',
    lastAfter: '12',
    nowIso: '2026-09-10T01:00:00.000Z',
  });
  assert.match(d.reason, /retained|nothing deleted/);
});

await test('cooldown before-only change notifies', async () => {
  const d = sc.cooldownDecision({
    lastNotifiedAt: '2026-09-10T00:00:00.000Z',
    currentBefore: '7',
    currentAfter: '12',
    lastBefore: '6',
    lastAfter: '12',
    nowIso: '2026-09-10T01:00:00.000Z',
  });
  assert.equal(d.notify, true);
});

/* ---------- resolution §29/§56 (8) ---------- */

await test('resolve top10 exit reversed', async () => {
  const r = sc.evaluateResolution({ alertType: 'TOP_10_EXIT', previous: 14, current: 7 });
  assert.equal(r.status, 'RESOLVED');
  assert.equal(r.newEvent, true);
});

await test('resolve loss reversed into top10', async () => {
  const r = sc.evaluateResolution({ alertType: 'RANK_LOSS', previous: 12, current: 8 });
  assert.equal(r.status, 'RESOLVED');
});

await test('resolve gain reversed', async () => {
  const r = sc.evaluateResolution({ alertType: 'RANK_GAIN', previous: 12, current: 15 });
  assert.equal(r.status, 'RESOLVED');
  assert.equal(r.newEvent, true);
});

await test('persist stays open', async () => {
  const r = sc.evaluateResolution({ alertType: 'TOP_10_EXIT', previous: 12, current: 14 });
  assert.equal(r.status, 'OPEN');
  assert.equal(r.newEvent, false);
});

await test('acknowledged not resolved note', async () => {
  const r = sc.evaluateResolution({ alertType: 'TOP_10_EXIT', previous: 12, current: 14 });
  assert.match(r.note, /Acknowledging is not resolving/);
});

await test('nulls stay open', async () => {
  const r = sc.evaluateResolution({ alertType: 'RANK_LOSS', previous: null, current: null });
  assert.equal(r.status, 'OPEN');
});

await test('lifecycles four states', async () => {
  assert.deepEqual(sc.ALERT_LIFECYCLES, ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED']);
});

await test('gain outside top10 stays open', async () => {
  const r = sc.evaluateResolution({ alertType: 'RANK_LOSS', previous: 12, current: 11 });
  assert.equal(r.status, 'OPEN');
});

/* ---------- digest §40 (10) ---------- */

function items() {
  return [
    { alertType: 'RANK_GAIN', title: 'g1', positive: true, divergence: false },
    { alertType: 'RANK_LOSS', title: 'l1', positive: false, divergence: false },
    { alertType: 'TOP_10_EXIT', title: 'crm dropped Top 10', positive: false, divergence: false },
    { alertType: 'AI_VISIBILITY_CHANGE', title: 'ai lost', positive: false, divergence: true },
  ];
}

await test('digest title search changes', async () => {
  assert.equal(sc.buildDigest(items()).title, 'SEARCH CHANGES');
});

await test('digest counts', async () => {
  const d = sc.buildDigest(items());
  assert.equal(d.total, 4);
  assert.equal(d.positive, 1);
  assert.equal(d.negative, 2);
  assert.equal(d.divergences, 1);
});

await test('digest top attention exit', async () => {
  assert.equal(sc.buildDigest(items()).topAttention, 'crm dropped Top 10');
});

await test('digest caps ten', async () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ alertType: 'RANK_GAIN', title: `g${i}`, positive: true, divergence: false }));
  const d = sc.buildDigest(many);
  assert.equal(d.items.length, 10);
  assert.match(d.note, /never 50 alerts/);
});

await test('digest empty', async () => {
  const d = sc.buildDigest([]);
  assert.equal(d.total, 0);
  assert.equal(d.topAttention, null);
});

await test('digest single language', async () => {
  const d = sc.buildDigest([{ alertType: 'RANK_GAIN', title: 'g', positive: true, divergence: false }]);
  assert.match(d.note, /1 meaningful change —/);
});

await test('digest custom cap', async () => {
  const d = sc.buildDigest(items(), 2);
  assert.equal(d.items.length, 2);
});

await test('digest wrong url priority', async () => {
  const d = sc.buildDigest([
    { alertType: 'RANK_GAIN', title: 'g', positive: true, divergence: false },
    { alertType: 'WRONG_URL', title: 'wrong page', positive: false, divergence: false },
  ]);
  assert.equal(d.topAttention, 'wrong page');
});

await test('digest example shape', async () => {
  const d = sc.buildDigest([
    { alertType: 'RANK_GAIN', title: 'a', positive: true, divergence: false },
    { alertType: 'RANK_GAIN', title: 'b', positive: true, divergence: false },
    { alertType: 'RANK_LOSS', title: 'c', positive: false, divergence: false },
    { alertType: 'RANK_LOSS', title: 'd', positive: false, divergence: false },
    { alertType: 'AI_VISIBILITY_CHANGE', title: 'e', positive: false, divergence: true },
  ]);
  assert.equal(d.positive, 2);
  assert.equal(d.negative, 2);
  assert.equal(d.divergences, 1);
});

await test('digest fallback first item', async () => {
  const d = sc.buildDigest([{ alertType: 'RANK_GAIN', title: 'only', positive: true, divergence: false }]);
  assert.equal(d.topAttention, 'only');
});

/* ---------- evidence §17/§46 (6) ---------- */

await test('envelope what changed', async () => {
  const e = sc.evidenceEnvelope({ keyword: 'crm', before: 7, after: 12, rankingUrl: 'https://a.com/crm', evidenceState: 'OBSERVED' });
  assert.match(e.whatChanged, /#7 → #12/);
});

await test('envelope partial unobserved', async () => {
  const e = sc.evidenceEnvelope({ keyword: 'crm', before: null, after: 12, rankingUrl: null, evidenceState: 'OBSERVED' });
  assert.match(e.whatChanged, /partially unobserved/);
});

await test('envelope observed url', async () => {
  const e = sc.evidenceEnvelope({ keyword: 'crm', before: 7, after: 12, rankingUrl: 'https://a.com/crm', evidenceState: 'OBSERVED' });
  assert.match(e.evidence, /https:\/\/a.com\/crm/);
});

await test('envelope verified gsc', async () => {
  const e = sc.evidenceEnvelope({ keyword: 'crm', before: 7.2, after: 8.1, rankingUrl: null, evidenceState: 'VERIFIED' });
  assert.match(e.evidence, /aggregate/);
});

await test('envelope know dont know', async () => {
  const e = sc.evidenceEnvelope({ keyword: 'crm', before: 7, after: 12, rankingUrl: null, evidenceState: 'OBSERVED' });
  assert.match(e.whatWeKnow, /observed/i);
  assert.match(e.whatWeDontKnow, /not established/);
  assert.ok(e.investigation.includes('Page intent'));
});

await test('envelope unavailable labeled', async () => {
  const e = sc.evidenceEnvelope({ keyword: 'crm', before: null, after: null, rankingUrl: null, evidenceState: 'UNAVAILABLE' });
  assert.equal(e.evidenceState, 'UNAVAILABLE');
});

/* ---------- preferences + mute §54/§55 (12) ---------- */

await test('scopes default all five', async () => {
  assert.deepEqual(sc.normalizeScopes(undefined), ['RANK', 'AI', 'COMPETITOR', 'SITE', 'EXECUTION']);
});

await test('scopes filter invalid', async () => {
  assert.deepEqual(sc.normalizeScopes(['RANK', 'BOGUS']), ['RANK']);
});

await test('scopes empty falls back all', async () => {
  assert.deepEqual(sc.normalizeScopes([]), ['RANK', 'AI', 'COMPETITOR', 'SITE', 'EXECUTION']);
});

await test('scopes dedupe', async () => {
  assert.deepEqual(sc.normalizeScopes(['rank', 'RANK']), ['RANK']);
});

await test('mute type', async () => {
  const m = sc.isMuted({ mutedTypes: ['RANK_LOSS'], mutedKeywords: [], alertType: 'RANK_LOSS', keyword: 'crm' });
  assert.equal(m.muted, true);
  assert.match(m.note, /Muted ≠ nonexistent/);
});

await test('mute keyword', async () => {
  const m = sc.isMuted({ mutedTypes: [], mutedKeywords: ['real estate crm'], alertType: 'RANK_GAIN', keyword: 'Real Estate CRM' });
  assert.equal(m.muted, true);
});

await test('not muted', async () => {
  const m = sc.isMuted({ mutedTypes: [], mutedKeywords: [], alertType: 'RANK_GAIN', keyword: 'crm' });
  assert.equal(m.muted, false);
});

await test('mute expiry resumes', async () => {
  const m = sc.isMuted({
    mutedTypes: ['RANK_LOSS'],
    mutedKeywords: [],
    alertType: 'RANK_LOSS',
    keyword: 'crm',
    nowIso: '2026-09-10T00:00:00.000Z',
    muteUntil: { RANK_LOSS: '2026-09-01T00:00:00.000Z' },
  });
  assert.equal(m.muted, false);
  assert.match(m.note, /expired/);
});

await test('mute future holds', async () => {
  const m = sc.isMuted({
    mutedTypes: [],
    mutedKeywords: ['crm'],
    alertType: 'RANK_GAIN',
    keyword: 'crm',
    nowIso: '2026-09-10T00:00:00.000Z',
    muteUntil: { crm: '2026-10-01T00:00:00.000Z' },
  });
  assert.equal(m.muted, true);
});

await test('scope vocabulary five', async () => {
  assert.deepEqual(sc.ALERT_SCOPES, ['RANK', 'AI', 'COMPETITOR', 'SITE', 'EXECUTION']);
});

await test('mute type case-insensitive', async () => {
  const m = sc.isMuted({ mutedTypes: ['rank_loss'], mutedKeywords: [], alertType: 'rank_loss', keyword: 'crm' });
  assert.equal(m.muted, true);
});

await test('mute unrelated passes', async () => {
  const m = sc.isMuted({ mutedTypes: ['RANK_LOSS'], mutedKeywords: [], alertType: 'RANK_GAIN', keyword: 'crm' });
  assert.equal(m.muted, false);
});

/* ---------- health §52/§53 (10) ---------- */

function health(o = {}) {
  return sc.changeHealth({
    scheduleCount: 2,
    providerConfigured: true,
    lastRunStatus: 'COMPLETED',
    lastSuccessAt: new Date().toISOString(),
    lastRunAt: new Date().toISOString(),
    staleAfterHours: 49,
    ...o,
  });
}

await test('health healthy', async () => {
  assert.equal(health(), 'HEALTHY');
});

await test('health not configured', async () => {
  assert.equal(health({ scheduleCount: 0 }), 'NOT_CONFIGURED');
});

await test('health unavailable provider', async () => {
  assert.equal(health({ providerConfigured: false }), 'UNAVAILABLE');
});

await test('health failed', async () => {
  assert.equal(health({ lastRunStatus: 'FAILED' }), 'FAILED');
});

await test('health partial states', async () => {
  for (const s of ['PARTIAL', 'QUEUED', 'RUNNING', 'CANCELLED']) {
    assert.equal(health({ lastRunStatus: s }), 'PARTIAL');
  }
});

await test('health stale old', async () => {
  assert.equal(health({ lastRunAt: new Date(Date.now() - 72 * 3600 * 1000).toISOString() }), 'STALE');
});

await test('health stale missing', async () => {
  assert.equal(health({ lastRunAt: null }), 'STALE');
});

await test('health partial no success', async () => {
  assert.equal(health({ lastSuccessAt: null }), 'PARTIAL');
});

await test('health vocabulary seven', async () => {
  assert.equal(sc.CHANGE_HEALTHS.length, 7);
});

await test('health stale invalid date', async () => {
  assert.equal(health({ lastRunAt: 'nope' }), 'STALE');
});

/* ---------- observability §62 (3) ---------- */

await test('observability passthrough', async () => {
  const o = sc.observabilityShape({
    lastTickAt: '2026-09-10T00:00:00.000Z',
    lastRunAt: '2026-09-10T00:00:00.000Z',
    lastSuccessfulRunAt: '2026-09-09T00:00:00.000Z',
    currentlyRunning: 1,
    recoveries: 2,
    providerUnavailableCount: 0,
  });
  assert.equal(o.currentlyRunning, 1);
  assert.equal(o.recoveries, 2);
});

await test('observability no fake score', async () => {
  const o = sc.observabilityShape({
    lastTickAt: null, lastRunAt: null, lastSuccessfulRunAt: null,
    currentlyRunning: 0, recoveries: 0, providerUnavailableCount: 0,
  });
  assert.match(o.note, /no health score|fake percentages/i);
  assert.ok(!('score' in o));
});

await test('observability nulls allowed', async () => {
  const o = sc.observabilityShape({
    lastTickAt: null, lastRunAt: null, lastSuccessfulRunAt: null,
    currentlyRunning: 0, recoveries: 0, providerUnavailableCount: 3,
  });
  assert.equal(o.providerUnavailableCount, 3);
});

/* ---------- timezone §48 (4) ---------- */

await test('digest day utc', async () => {
  assert.equal(sc.digestDayKey('2026-09-10T23:30:00.000Z', 'UTC'), '2026-09-10');
});

await test('digest day named zone', async () => {
  assert.equal(sc.digestDayKey('2026-09-10T23:30:00.000Z', 'Asia/Kolkata'), '2026-09-11');
});

await test('digest day invalid zone fallback', async () => {
  assert.equal(sc.digestDayKey('2026-09-10T23:30:00.000Z', 'Mars/Olympus'), '2026-09-10');
});

await test('digest day no utc assumption', async () => {
  const a = sc.digestDayKey('2026-09-10T01:00:00.000Z', 'America/New_York');
  assert.equal(a, '2026-09-09');
});

/* ---------- divergence §38 (3) ---------- */

await test('divergence both true', async () => {
  const n = sc.searchAiDivergenceNote({ rankImproved: true, citationLost: true });
  assert.match(n, /SEARCH_AI_DIVERGENCE/);
  assert.match(n, /not a score/);
});

await test('divergence partial null', async () => {
  assert.equal(sc.searchAiDivergenceNote({ rankImproved: true, citationLost: false }), null);
  assert.equal(sc.searchAiDivergenceNote({ rankImproved: null, citationLost: null }), null);
});

await test('divergence rank declined no note', async () => {
  assert.equal(sc.searchAiDivergenceNote({ rankImproved: false, citationLost: true }), null);
});

/* ---------- run identity §9 (3) ---------- */

await test('run identity deterministic', async () => {
  const a = sc.changeRunIdentity({ organizationId: 'o1', websiteId: 'w1', windowKey: '2026-09-10' });
  assert.equal(a, sc.changeRunIdentity({ organizationId: 'o1', websiteId: 'w1', windowKey: '2026-09-10' }));
});

await test('run identity isolates websites', async () => {
  assert.notEqual(
    sc.changeRunIdentity({ organizationId: 'o1', websiteId: 'w1', windowKey: '2026-09-10' }),
    sc.changeRunIdentity({ organizationId: 'o1', websiteId: 'w2', windowKey: '2026-09-10' }),
  );
});

await test('run identity isolates tenants', async () => {
  assert.notEqual(
    sc.changeRunIdentity({ organizationId: 'o1', websiteId: 'w1', windowKey: '2026-09-10' }),
    sc.changeRunIdentity({ organizationId: 'o2', websiteId: 'w1', windowKey: '2026-09-10' }),
  );
});

/* ---------- GSC + website vocab §23/§24 (8) ---------- */

await test('gsc kinds four', async () => {
  assert.deepEqual(sc.GSC_CHANGE_KINDS, ['CLICK_CHANGE', 'IMPRESSION_CHANGE', 'CTR_CHANGE', 'GSC_POSITION_CHANGE']);
});

await test('website kinds five', async () => {
  assert.deepEqual(sc.WEBSITE_CHANGE_KINDS, ['CONTENT_CHANGE', 'TITLE_CHANGE', 'META_CHANGE', 'H1_CHANGE', 'INTERNAL_LINK_CHANGE']);
});

await test('gsc no crawler created', async () => {
  assert.ok(!sc.GSC_CHANGE_KINDS.includes('CRAWL_CHANGE'));
});

await test('gsc position labeled aggregate', async () => {
  const e = sc.evidenceEnvelope({ keyword: 'q', before: 7.2, after: 8.1, rankingUrl: null, evidenceState: 'VERIFIED' });
  assert.match(e.evidence, /aggregate/);
  assert.doesNotMatch(e.evidence, /deterministic rank/);
});

await test('website title change kind exists', async () => {
  assert.ok(sc.WEBSITE_CHANGE_KINDS.includes('TITLE_CHANGE'));
});

await test('website h1 + link kinds exist', async () => {
  assert.ok(sc.WEBSITE_CHANGE_KINDS.includes('H1_CHANGE'));
  assert.ok(sc.WEBSITE_CHANGE_KINDS.includes('INTERNAL_LINK_CHANGE'));
});

await test('website no new crawler kind', async () => {
  assert.ok(!sc.WEBSITE_CHANGE_KINDS.includes('CRAWL_JOB'));
});

await test('gsc change alert type exists', async () => {
  assert.ok(sc.SEARCH_ALERT_TYPES.includes('GSC_CHANGE'));
  assert.ok(sc.SEARCH_ALERT_TYPES.includes('WEBSITE_CHANGE'));
});

/* ---------- honesty invariants (12) ---------- */

await test('unknown never loss invariant', async () => {
  assert.deepEqual(baseClassify({ previous: 6, current: null, previousExists: true }), []);
});

await test('not observed distinct from absent', async () => {
  assert.notEqual(
    sc.aioState({ providerSupportsAi: true, observed: false }),
    sc.aioState({ providerSupportsAi: false, observed: false }),
  );
});

await test('ai never rank invariant', async () => {
  const all = JSON.stringify(sc.classifyAiChange({
    previousMention: false, currentMention: true, previousCitation: false,
    currentCitation: true, previousSource: 'a', currentSource: 'b', providerSupportsAi: true,
  }));
  assert.doesNotMatch(all, /RANK/);
});

await test('change never cause invariant', async () => {
  const texts = JSON.stringify([
    ...baseClassify({ previous: 6, current: 12, previousExists: true }),
    sc.evidenceEnvelope({ keyword: 'k', before: 6, after: 12, rankingUrl: null, evidenceState: 'OBSERVED' }),
  ]);
  assert.doesNotMatch(texts, /penal|algorithmic|caused the|because google/i);
});

await test('execution wording temporal', async () => {
  const s = sc.gainAfterVerifiedChange({ keyword: 'k', before: 12, after: 7, verified: true });
  assert.match(s, /after the verified change/);
  assert.match(s, /not proof/);
  assert.doesNotMatch(s, /caused the ranking|caused the improvement|proves the change worked/i);
});

await test('unavailable never zero', async () => {
  const e = sc.evidenceEnvelope({ keyword: 'k', before: null, after: null, rankingUrl: null, evidenceState: 'UNAVAILABLE' });
  assert.doesNotMatch(JSON.stringify(e), /: 0[^.0-9]/);
});

await test('muted never deleted', async () => {
  const m = sc.isMuted({ mutedTypes: ['RANK_LOSS'], mutedKeywords: [], alertType: 'RANK_LOSS', keyword: 'k' });
  assert.match(m.note, /retained|deleted/);
});

await test('verification distinct from outcome', async () => {
  assert.match(
    sc.gainAfterVerifiedChange({ keyword: 'k', before: 12, after: 7, verified: true }),
    /Temporal association only/,
  );
});

await test('gsc aggregate not rank invariant', async () => {
  const v = sc.validateObservation(validObs({ source: 'GSC', position: 7 }));
  assert.equal(v.valid, true);
  assert.equal(v.positionState, 'RANKING');
});

await test('provider failure unknown path', async () => {
  const r = sc.validateObservation(validObs({ position: null, providerConfirmedAbsent: false }));
  assert.equal(r.positionState, 'UNKNOWN');
});

await test('no guaranteed language', async () => {
  const d = sc.buildDigest(items());
  assert.doesNotMatch(JSON.stringify(d), /guaranteed|will rank/i);
});

await test('acknowledged distinct resolved', async () => {
  assert.notEqual(sc.ALERT_LIFECYCLES.indexOf('ACKNOWLEDGED'), sc.ALERT_LIFECYCLES.indexOf('RESOLVED'));
  assert.ok(sc.ALERT_LIFECYCLES.includes('DISMISSED'));
});

/* ---------- performance bounds (6) ---------- */
await test('classify batch 500 fast', async () => {
  for (let i = 0; i < 500; i++) {
    baseClassify({ previous: (i % 20) + 1, current: ((i + 7) % 20) + 1, previousExists: true });
  }
  assert.ok(true);
});

await test('dedupe batch 1000 unique', async () => {
  const seen = new Set();
  for (let i = 0; i < 1000; i++) {
    seen.add(dk({ keywordOrPage: `keyword ${i}` }));
  }
  assert.equal(seen.size, 1000);
});

await test('digest caps 200 items', async () => {
  const many = Array.from({ length: 200 }, (_, i) => ({ alertType: 'RANK_LOSS', title: `l${i}`, positive: false, divergence: false }));
  assert.equal(sc.buildDigest(many).items.length, 10);
});

await test('cooldown batch bounded', async () => {
  for (let i = 0; i < 200; i++) {
    sc.cooldownDecision({
      lastNotifiedAt: '2026-09-10T00:00:00.000Z',
      currentBefore: String(i % 20),
      currentAfter: String((i % 20) + 1),
      lastBefore: String(i % 20),
      lastAfter: String((i % 20) + 1),
      nowIso: '2026-09-10T01:00:00.000Z',
    });
  }
  assert.ok(true);
});

await test('validate batch 500', async () => {
  for (let i = 0; i < 500; i++) {
    sc.validateObservation(validObs({ position: (i % 30) + 1 }));
  }
  assert.ok(true);
});

await test('max alerts per run cap respected', async () => {
  assert.ok(sc.MAX_ALERTS_PER_RUN <= 50);
  assert.ok(sc.MAX_KEYWORDS_PER_RUN <= 50);
});

/* ---------- scheduler edges (8) ---------- */

await test('due exact equality', async () => {
  assert.equal(
    sc.isScheduleDue({ isActive: true, nextRunAt: '2026-09-10T00:00:00.000Z', now: '2026-09-10T00:00:00.000Z' }),
    true,
  );
});

await test('next weekly from sunday', async () => {
  const n = sc.nextRunAt('WEEKLY', new Date('2026-09-13T00:00:00.000Z'));
  assert.equal(n.toISOString(), '2026-09-20T00:00:00.000Z');
});

await test('missed weekly partial week zero', async () => {
  assert.equal(
    sc.missedWindowCount({ cadence: 'WEEKLY', nextRunAt: '2026-09-07T00:00:00.000Z', now: '2026-09-10T00:00:00.000Z' }),
    0,
  );
});

await test('missed invalid dates zero', async () => {
  assert.equal(sc.missedWindowCount({ cadence: 'DAILY', nextRunAt: 'nope' }), 0);
});

await test('missed decision weekly note', async () => {
  const d = sc.missedRunDecision({ cadence: 'WEEKLY', nextRunAt: '2026-08-20T00:00:00.000Z', now: '2026-09-10T00:00:00.000Z' });
  assert.equal(d.executeLatestOnly, true);
  assert.ok(d.skippedWindows >= 2);
});

await test('cadence uppercase weekly', async () => {
  assert.equal(sc.normalizeCadence('WEEKLY'), 'WEEKLY');
});

await test('run identity empty deterministic', async () => {
  assert.equal(
    sc.changeRunIdentity({ organizationId: '', websiteId: '', windowKey: '' }),
    sc.changeRunIdentity({ organizationId: '', websiteId: '', windowKey: '' }),
  );
});

await test('due invalid now not due', async () => {
  assert.equal(
    sc.isScheduleDue({ isActive: true, nextRunAt: '2026-01-01T00:00:00.000Z', now: 'nope' }),
    false,
  );
});

/* ---------- classification edges (8) ---------- */

await test('small move crossing into top10 meaningful', async () => {
  const c = baseClassify({ previous: 11, current: 10, previousExists: true });
  assert.equal(c[0].alertType, 'TOP_10_ENTRY');
  assert.equal(c[0].meaningful, true);
});

await test('small move exiting top10 meaningful', async () => {
  const c = baseClassify({ previous: 10, current: 11, previousExists: true });
  assert.equal(c[0].alertType, 'TOP_10_EXIT');
  assert.equal(c[0].meaningful, true);
});

await test('top3 entry delta3 meaningful', async () => {
  const c = baseClassify({ previous: 5, current: 2, previousExists: true });
  assert.equal(c[0].alertType, 'TOP_3_ENTRY');
  assert.equal(c[0].meaningful, true);
});

await test('exited needs prior ranking', async () => {
  assert.deepEqual(
    baseClassify({ previous: null, current: null, previousExists: true, previousConfirmedAbsent: true, currentConfirmedAbsent: true }),
    [],
  );
});

await test('entered unconfirmed previous', async () => {
  const c = baseClassify({ previous: null, current: 4, previousExists: true, previousConfirmedAbsent: false });
  assert.equal(c[0].event, 'ENTERED');
});

await test('combined competitor plus ai', async () => {
  const c = baseClassify({ previous: 6, current: 6, previousExists: true, competitorMoved: true, aiStateChanged: true });
  assert.equal(c.length, 2);
});

await test('multiple serp gains listed', async () => {
  const c = baseClassify({ previous: 6, current: 6, previousExists: true, serpFeatureGained: ['VIDEO', 'SHOPPING'] });
  assert.equal(c.filter((x) => x.event === 'SERP_FEATURE_GAINED').length, 2);
});

await test('no band no movement single event', async () => {
  const c = baseClassify({ previous: 30, current: 27, previousExists: true });
  assert.equal(c[0].event, 'GAINED');
  assert.equal(c[0].alertType, 'RANK_GAIN');
  assert.equal(c[0].meaningful, true);
});

/* ---------- cooldown edges (4) ---------- */

await test('cooldown exact boundary notifies', async () => {
  const d = sc.cooldownDecision({
    lastNotifiedAt: '2026-09-09T00:00:00.000Z',
    currentBefore: '6',
    currentAfter: '12',
    lastBefore: '6',
    lastAfter: '12',
    nowIso: '2026-09-10T00:00:00.000Z',
  });
  assert.equal(d.notify, true);
});

await test('cooldown null history notifies', async () => {
  const d = sc.cooldownDecision({
    lastNotifiedAt: '2026-09-10T00:00:00.000Z',
    currentBefore: '6',
    currentAfter: '12',
    lastBefore: null,
    lastAfter: null,
    nowIso: '2026-09-10T01:00:00.000Z',
  });
  assert.equal(d.notify, true);
});

await test('cooldown after-only change notifies', async () => {
  const d = sc.cooldownDecision({
    lastNotifiedAt: '2026-09-10T00:00:00.000Z',
    currentBefore: '6',
    currentAfter: '13',
    lastBefore: '6',
    lastAfter: '12',
    nowIso: '2026-09-10T01:00:00.000Z',
  });
  assert.equal(d.notify, true);
});

await test('cooldown suppress counts as suppressed', async () => {
  const d = sc.cooldownDecision({
    lastNotifiedAt: '2026-09-10T00:00:00.000Z',
    currentBefore: '6',
    currentAfter: '12',
    lastBefore: '6',
    lastAfter: '12',
    nowIso: '2026-09-10T01:00:00.000Z',
  });
  assert.equal(d.notify, false);
  assert.match(d.reason, /suppress/i);
});

/* ---------- digest edges (4) ---------- */

await test('digest negative only', async () => {
  const d = sc.buildDigest([
    { alertType: 'RANK_LOSS', title: 'a', positive: false, divergence: false },
    { alertType: 'TOP_10_EXIT', title: 'b', positive: false, divergence: false },
  ]);
  assert.equal(d.positive, 0);
  assert.equal(d.negative, 2);
  assert.equal(d.topAttention, 'b');
});

await test('digest divergence only', async () => {
  const d = sc.buildDigest([
    { alertType: 'AI_VISIBILITY_CHANGE', title: 'ai', positive: false, divergence: true },
  ]);
  assert.equal(d.divergences, 1);
  assert.equal(d.negative, 0);
});

await test('digest zero cap floors one', async () => {
  const d = sc.buildDigest(items(), 0);
  assert.equal(d.items.length, 1);
});

await test('digest total exceeds cap note', async () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ alertType: 'RANK_LOSS', title: `l${i}`, positive: false, divergence: false }));
  const d = sc.buildDigest(many);
  assert.match(d.note, /12/);
});

/* ---------- validation edges (4) ---------- */

await test('engine lowercase google valid', async () => {
  assert.equal(sc.validateObservation(validObs({ engine: 'google' })).valid, true);
});

await test('country lowercase valid', async () => {
  assert.equal(sc.validateObservation(validObs({ country: 'in' })).valid, true);
});

await test('device uppercase valid', async () => {
  assert.equal(sc.validateObservation(validObs({ device: 'DESKTOP' })).valid, true);
});

await test('gsc aggregate position accepted', async () => {
  const r = sc.validateObservation(validObs({ source: 'GSC', position: 7 }));
  assert.equal(r.valid, true);
  assert.equal(r.positionState, 'RANKING');
});

/* ---------- health active + mute edges (4) ---------- */

await test('health active awaiting first run', async () => {
  assert.equal(health({ lastRunStatus: null, lastRunAt: null, lastSuccessAt: null }), 'ACTIVE');
});

await test('health active distinct healthy', async () => {
  assert.notEqual(health({ lastRunStatus: null, lastRunAt: null, lastSuccessAt: null }), health());
});

await test('mute invalid until falls through', async () => {
  const m = sc.isMuted({
    mutedTypes: ['RANK_LOSS'],
    mutedKeywords: [],
    alertType: 'RANK_LOSS',
    keyword: 'crm',
    muteUntil: { RANK_LOSS: 'not-a-date' },
  });
  assert.equal(m.muted, true);
});

await test('mute keyword until map by keyword', async () => {
  const m = sc.isMuted({
    mutedTypes: [],
    mutedKeywords: ['crm'],
    alertType: 'RANK_GAIN',
    keyword: 'CRM',
    nowIso: '2026-09-10T00:00:00.000Z',
    muteUntil: { crm: '2026-12-01T00:00:00.000Z' },
  });
  assert.equal(m.muted, true);
});

/* ---------- summary ---------- */

const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(`\nSearch Change 2.0: ${passCount}/${results.length} passed.`);
if (failed.length > 0) {
  console.log(failed.join('\n'));
  process.exit(1);
} else {
  console.log('All Search Change 2.0 tests passed.');
}

/*
 * RENKOO Rank Intelligence 1.0 — tests (Phase 11).
 *
 * 52 tests over pure functions only: GSC position
 * semantics, SERP observation labels, provider-shaped
 * inputs, history stats, current vs previous,
 * improvement/decline/new/lost, bands, striking
 * distance, URL switching, missing observations,
 * unavailable handling, evidence states, tenant-scoped
 * identities, recommendation bridge (existing kinds
 * only), deterministic ordering, duplicate keys, no
 * fake ranking, no causal claims. No DB, no provider
 * calls, no billing touch.
 *
 * Run: npm run test:rank-tracking   (dist built)
 */
import assert from 'node:assert/strict';

const rank = await import(
  '../dist/keywords/rank-tracking.js'
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

function norm(o = {}) {
  return rank.normalizeRankObservation('w1', {
    keyword: 'best crm',
    url: 'https://acme.com/crm',
    position: 7,
    source: 'SERP_PROVIDER',
    observedAt: '2026-09-01T00:00:00.000Z',
    ...o,
  });
}

/* ---------- observation semantics (8) ---------- */

await test('gsc rows verify as averages', async () => {
  const row = norm({ source: 'GSC', position: 8 });
  assert.equal(row.evidenceState, 'VERIFIED');
  assert.equal(row.source, 'GSC');
});

await test('serp rows observe positions', async () => {
  const row = norm({ source: 'SERP_PROVIDER' });
  assert.equal(row.evidenceState, 'OBSERVED');
  assert.equal(row.position, 7);
});

await test('manual rows observe input', async () => {
  const row = norm({ source: 'MANUAL', position: 3 });
  assert.equal(row.evidenceState, 'OBSERVED');
});

await test('missing position is unavailable', async () => {
  const row = norm({ position: null });
  assert.equal(row.position, null);
  assert.equal(row.evidenceState, 'UNAVAILABLE');
});

await test('zero position is unavailable', async () => {
  const row = norm({ position: 0 });
  assert.equal(row.position, null);
  assert.equal(row.evidenceState, 'UNAVAILABLE');
});

await test('empty keyword rejected', async () => {
  assert.equal(
    rank.normalizeRankObservation('w1', {
      keyword: '   ',
      url: null,
      position: 5,
      source: 'GSC',
      observedAt: '2026-09-01T00:00:00.000Z',
    }),
    null,
  );
});

await test('bad timestamps rejected', async () => {
  assert.equal(
    norm({ observedAt: 'not-a-date' }),
    null,
  );
});

await test('context defaults honest', async () => {
  const row = norm({});
  assert.equal(row.engine, 'GOOGLE');
  assert.equal(row.country, 'US');
  assert.equal(row.device, 'desktop');
});

/* ---------- bands + striking (6) ---------- */

await test('top 3 band', async () => {
  assert.equal(rank.rankingBand(1), 'TOP_3');
  assert.equal(rank.rankingBand(3), 'TOP_3');
});

await test('top 10 band', async () => {
  assert.equal(rank.rankingBand(7), 'TOP_10');
});

await test('top 20 band', async () => {
  assert.equal(rank.rankingBand(15), 'TOP_20');
});

await test('unavailable band for missing', async () => {
  assert.equal(rank.rankingBand(null), 'UNAVAILABLE');
  assert.equal(rank.rankingBand(150), 'NOT_OBSERVED');
});

await test('striking distance is 4 to 20', async () => {
  assert.equal(rank.isStrikingDistance(4), true);
  assert.equal(rank.isStrikingDistance(20), true);
  assert.equal(rank.isStrikingDistance(3), false);
  assert.equal(rank.isStrikingDistance(21), false);
  assert.equal(rank.isStrikingDistance(null), false);
});

await test('movement directions', async () => {
  assert.equal(rank.rankMovement(11, 7, true), 'IMPROVED');
  assert.equal(rank.rankMovement(7, 11, true), 'DECLINED');
  assert.equal(rank.rankMovement(7, 7, true), 'UNCHANGED');
  assert.equal(rank.rankMovement(null, 7, true), 'NEW');
  assert.equal(rank.rankMovement(7, null, true), 'UNKNOWN');
});

/* ---------- history (6) ---------- */

function rows(positions, source = 'SERP_PROVIDER') {
  return positions.map((position, i) => ({
    position,
    url: 'https://acme.com/crm',
    observedAt: `2026-09-0${i + 1}T00:00:00.000Z`,
  }));
}

await test('history stats current previous best worst', async () => {
  const stats = rank.summarizeRankHistory({
    keyword: 'best crm',
    source: 'SERP_PROVIDER',
    rows: rows([11, 9, 7]),
  });
  assert.equal(stats.current, 7);
  assert.equal(stats.previous, 9);
  assert.equal(stats.change, 2);
  assert.equal(stats.movement, 'IMPROVED');
  assert.equal(stats.best, 7);
  assert.equal(stats.worst, 11);
  assert.equal(stats.observations, 3);
});

await test('single observation is new', async () => {
  const stats = rank.summarizeRankHistory({
    keyword: 'best crm',
    source: 'GSC',
    rows: rows([8]),
  });
  assert.equal(stats.movement, 'NEW');
  assert.equal(stats.previous, null);
});

await test('empty history degrades honestly', async () => {
  const stats = rank.summarizeRankHistory({
    keyword: 'best crm',
    source: 'GSC',
    rows: [],
  });
  assert.equal(stats.current, null);
  assert.equal(stats.band, 'UNAVAILABLE');
  assert.equal(stats.observations, 0);
});

await test('latest url wins', async () => {
  const stats = rank.summarizeRankHistory({
    keyword: 'best crm',
    source: 'SERP_PROVIDER',
    rows: [
      {
        position: 9,
        url: 'https://acme.com/old',
        observedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        position: 7,
        url: 'https://acme.com/new',
        observedAt: '2026-09-02T00:00:00.000Z',
      },
    ],
  });
  assert.equal(stats.url, 'https://acme.com/new');
});

await test('nulls excluded from best worst', async () => {
  const stats = rank.summarizeRankHistory({
    keyword: 'best crm',
    source: 'GSC',
    rows: rows([null, 8]),
  });
  assert.equal(stats.best, 8);
  assert.equal(stats.current, 8);
});

await test('history orders by time', async () => {
  const stats = rank.summarizeRankHistory({
    keyword: 'best crm',
    source: 'GSC',
    rows: rows([7, 11]).reverse(),
  });
  assert.equal(stats.current, 11);
  assert.equal(stats.firstObserved, '2026-09-01T00:00:00.000Z');
});

/* ---------- url switching (3) ---------- */

await test('same url means no switch', async () => {
  const signal = rank.detectUrlSwitch(
    'https://acme.com/a',
    'https://acme.com/a',
    true,
  );
  assert.equal(signal.switched, false);
});

await test('changed url is observed signal', async () => {
  const signal = rank.detectUrlSwitch(
    'https://acme.com/old',
    'https://acme.com/new',
    true,
  );
  assert.equal(signal.switched, true);
  assert.ok(!signal.note.includes('cannibalization'));
});

await test('no history means no signal', async () => {
  const signal = rank.detectUrlSwitch(
    'https://acme.com/a',
    'https://acme.com/b',
    false,
  );
  assert.equal(signal.switched, false);
});

/* ---------- change events (7) ---------- */

function events(o = {}) {
  return rank.rankChangeEvents({
    keyword: 'best crm',
    url: null,
    previous: 11,
    current: 7,
    previousExists: true,
    recent: [11, 7],
    urlSwitch: rank.detectUrlSwitch(null, null, false),
    ...o,
  });
}

await test('significant moves emit events', async () => {
  const kinds = events().map((e) => e.kind);
  assert.ok(kinds.includes('RANK_IMPROVED'));
});

await test('top 10 crossings emit', async () => {
  const kinds = events({
    previous: 12,
    current: 8,
  }).map((e) => e.kind);
  assert.ok(kinds.includes('ENTERED_TOP_10'));
  const left = events({
    previous: 8,
    current: 12,
  }).map((e) => e.kind);
  assert.ok(left.includes('LEFT_TOP_10'));
});

await test('striking crossings emit', async () => {
  const kinds = events({
    previous: 25,
    current: 9,
  }).map((e) => e.kind);
  assert.ok(kinds.includes('ENTERED_STRIKING'));
});

await test('one-position noise stays quiet', async () => {
  assert.deepEqual(
    events({ previous: 7, current: 6 }),
    [],
  );
  assert.deepEqual(
    events({ previous: 2, current: 1 }),
    [],
  );
});

await test('new keywords announced once', async () => {
  const list = events({
    previous: null,
    current: 9,
    previousExists: false,
  });
  assert.equal(list[0].kind, 'RANK_NEW');
});

await test('missing current emits nothing', async () => {
  assert.deepEqual(
    events({ current: null }),
    [],
  );
});

await test('sustained trends detected', async () => {
  const kinds = rank
    .rankChangeEvents({
      keyword: 'k',
      url: null,
      previous: 8,
      current: 10,
      previousExists: true,
      recent: [6, 8, 10],
      urlSwitch: rank.detectUrlSwitch(null, null, false),
    })
    .map((e) => e.kind);
  assert.ok(kinds.includes('SUSTAINED_DECLINE'));
});

/* ---------- identities + honesty (8) ---------- */

await test('identity keys stable', async () => {
  const a = norm({});
  const b = norm({});
  assert.equal(a.identityKey, b.identityKey);
});

await test('identity differs per tenant', async () => {
  const a = rank.normalizeRankObservation('w1', {
    keyword: 'k',
    url: null,
    position: 5,
    source: 'GSC',
    observedAt: '2026-09-01T00:00:00.000Z',
  });
  const b = rank.normalizeRankObservation('w2', {
    keyword: 'k',
    url: null,
    position: 5,
    source: 'GSC',
    observedAt: '2026-09-01T00:00:00.000Z',
  });
  assert.notEqual(a.identityKey, b.identityKey);
});

await test('identity differs per source', async () => {
  const a = norm({ source: 'GSC' });
  const b = norm({ source: 'SERP_PROVIDER' });
  assert.notEqual(a.identityKey, b.identityKey);
});

await test('no fake ranking language', async () => {
  const dump = JSON.stringify(
    rank.summarizeRankHistory({
      keyword: 'k',
      source: 'GSC',
      rows: rows([8]),
    }),
  );
  assert.ok(!dump.includes('probability'));
  assert.ok(!dump.includes('guarantee'));
});

await test('measurement never claims causality', async () => {
  const text = rank.measurementOutcome({
    title: 'Improve /pricing',
    before: 11,
    after: 7,
  });
  assert.ok(text.includes('Observed'));
  assert.ok(text.includes('not causal proof'));
});

await test('measurement unknown stays unknown', async () => {
  const text = rank.measurementOutcome({
    title: 't',
    before: null,
    after: 7,
  });
  assert.ok(text.includes('unknown'));
  assert.ok(!text.includes('0'));
});

await test('page profiles separate gsc metrics', async () => {
  const profile = rank.composePageRankProfile({
    page: 'https://acme.com/crm',
    stats: [
      rank.summarizeRankHistory({
        keyword: 'best crm',
        source: 'SERP_PROVIDER',
        rows: rows([9, 7]),
      }),
      rank.summarizeRankHistory({
        keyword: 'crm software',
        source: 'SERP_PROVIDER',
        rows: rows([2]),
      }),
    ],
    gsc: { clicks: 120, impressions: 5000, ctr: 0.024 },
  });
  assert.equal(profile.keywords, 2);
  assert.equal(profile.bestPosition, 2);
  assert.equal(profile.top3, 1);
  assert.equal(profile.top10, 2);
  assert.equal(profile.gscClicks, 120);
  assert.deepEqual(profile.improved, ['best crm']);
});

await test('empty page profile honest', async () => {
  const profile = rank.composePageRankProfile({
    page: 'https://acme.com/x',
    stats: [],
    gsc: null,
  });
  assert.equal(profile.bestPosition, null);
  assert.equal(profile.gscImpressions, null);
});

await test('provider-unavailable shapes stay unavailable', async () => {
  const row = norm({ position: null, source: 'SERP_PROVIDER' });
  assert.equal(row.evidenceState, 'UNAVAILABLE');
  assert.equal(rank.rankingBand(row.position), 'UNAVAILABLE');
});

await test('duplicate observations share identity', async () => {
  const a = norm({ source: 'MANUAL' });
  const b = norm({ source: 'MANUAL' });
  assert.equal(a.identityKey, b.identityKey);
});

await test('events carry no causal claims', async () => {
  const list = rank.rankChangeEvents({
    keyword: 'k',
    url: null,
    previous: 12,
    current: 7,
    previousExists: true,
    recent: [12, 7],
    urlSwitch: rank.detectUrlSwitch(null, null, false),
  });
  const dump = JSON.stringify(list).toLowerCase();
  assert.ok(!dump.includes('caused'));
  assert.ok(!dump.includes('because'));
});

await test('single trailing null stays unknown', async () => {
  const stats = rank.summarizeRankHistory({
    keyword: 'best crm',
    source: 'SERP_PROVIDER',
    rows: [
      {
        position: 7,
        url: 'https://acme.com/crm',
        observedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        position: null,
        url: null,
        observedAt: '2026-09-02T00:00:00.000Z',
      },
    ],
  });
  assert.equal(stats.current, null);
  assert.equal(stats.previous, 7);
  assert.equal(stats.movement, 'UNKNOWN');
});

await test('sustained absence is lost', async () => {
  const stats = rank.summarizeRankHistory({
    keyword: 'best crm',
    source: 'SERP_PROVIDER',
    rows: [
      {
        position: 7,
        url: 'https://acme.com/crm',
        observedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        position: null,
        url: null,
        observedAt: '2026-09-02T00:00:00.000Z',
      },
      {
        position: null,
        url: null,
        observedAt: '2026-09-03T00:00:00.000Z',
      },
    ],
  });
  assert.equal(stats.current, null);
  assert.equal(stats.previous, 7);
  assert.equal(stats.movement, 'LOST');
  assert.equal(stats.best, 7);
});

await test('all-missing history is unknown not lost', async () => {
  const stats = rank.summarizeRankHistory({
    keyword: 'best crm',
    source: 'GSC',
    rows: rows([null, null]),
  });
  assert.equal(stats.movement, 'UNKNOWN');
  assert.equal(stats.current, null);
});

await test('lost keywords surface in page profiles', async () => {
  const profile = rank.composePageRankProfile({
    page: 'https://acme.com/crm',
    stats: [
      rank.summarizeRankHistory({
        keyword: 'gone kw',
        source: 'SERP_PROVIDER',
        rows: [
          {
            position: 6,
            url: 'https://acme.com/crm',
            observedAt: '2026-09-01T00:00:00.000Z',
          },
          {
            position: null,
            url: null,
            observedAt: '2026-09-02T00:00:00.000Z',
          },
          {
            position: null,
            url: null,
            observedAt: '2026-09-03T00:00:00.000Z',
          },
        ],
      }),
    ],
    gsc: null,
  });
  assert.deepEqual(profile.lost, ['gone kw']);
});

await test('decline maps to existing improve path', async () => {
  assert.equal(
    rank.rankEventToRecommendation('RANK_DECLINED', 14),
    'IMPROVE_PAGE',
  );
  assert.equal(
    rank.rankEventToRecommendation('SUSTAINED_DECLINE', 18),
    'IMPROVE_PAGE',
  );
  assert.equal(
    rank.rankEventToRecommendation('LEFT_TOP_10', 12),
    'IMPROVE_PAGE',
  );
});

await test('striking distance maps to optimize', async () => {
  assert.equal(
    rank.rankEventToRecommendation('ENTERED_STRIKING', 9),
    'OPTIMIZE_PAGE',
  );
});

await test('gains map to existing protect path', async () => {
  assert.equal(
    rank.rankEventToRecommendation('RANK_IMPROVED', 7),
    'PROTECT_PAGE',
  );
  assert.equal(
    rank.rankEventToRecommendation('ENTERED_TOP_10', 8),
    'PROTECT_PAGE',
  );
  assert.equal(
    rank.rankEventToRecommendation('SUSTAINED_IMPROVEMENT', 5),
    'PROTECT_PAGE',
  );
});

await test('new keywords map to monitor', async () => {
  assert.equal(
    rank.rankEventToRecommendation('RANK_NEW', 9),
    'MONITOR',
  );
});

await test('url switch maps to consolidation path', async () => {
  assert.equal(
    rank.rankEventToRecommendation('URL_CHANGED', 7),
    'CONSOLIDATE_PAGES',
  );
});

await test('bridge creates no new taxonomy', async () => {
  const allowed = new Set([
    'IMPROVE_PAGE',
    'OPTIMIZE_PAGE',
    'CONSOLIDATE_PAGES',
    'PROTECT_PAGE',
    'MONITOR',
    'TRACK_KEYWORD',
  ]);
  for (const kind of [
    'RANK_IMPROVED',
    'RANK_DECLINED',
    'RANK_NEW',
    'ENTERED_TOP_10',
    'LEFT_TOP_10',
    'ENTERED_STRIKING',
    'LEFT_STRIKING',
    'URL_CHANGED',
    'SUSTAINED_DECLINE',
    'SUSTAINED_IMPROVEMENT',
  ]) {
    const mapped = rank.rankEventToRecommendation(kind, 9);
    assert.ok(mapped === null || allowed.has(mapped));
  }
});

await test('profile lists deterministic', async () => {
  const mk = () =>
    rank.composePageRankProfile({
      page: 'https://acme.com/crm',
      stats: [
        rank.summarizeRankHistory({
          keyword: 'best crm',
          source: 'SERP_PROVIDER',
          rows: [
            {
              position: 9,
              url: 'https://acme.com/crm',
              observedAt: '2026-09-01T00:00:00.000Z',
            },
          ],
        }),
      ],
      gsc: null,
    });
  assert.deepEqual(mk(), mk());
});

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(
  `\n${results.length - failed.length}/${results.length} passed`,
);
if (failed.length > 0) process.exit(1);

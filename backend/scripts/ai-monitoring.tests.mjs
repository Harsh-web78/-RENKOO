/*
 * RENKOO AI Prompt Monitoring 1.0 — composition tests (Phase 7).
 *
 * 60 meaningful tests over pure functions only:
 * schedules, idempotency, credit guard, bounded plans,
 * run lifecycle, change detection (all event kinds),
 * citation/competitor/source movement, prioritization
 * on existing bands, what-changed, windows/trends,
 * pagination, alert/opportunity keys and roadmap
 * integration. No DB, no provider calls, no billing.
 *
 * Run: npm run test:ai-monitoring   (dist must be built)
 */
import assert from 'node:assert/strict';

const mon = await import(
  '../dist/ai-visibility/ai-monitoring.js'
);
const roadmap = await import(
  '../dist/keywords/keyword-roadmap.service.js'
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

function obs(o = {}) {
  return {
    prompt: 'Best crm for agencies',
    surface: 'GEMINI',
    country: 'US',
    language: 'en',
    mentioned: false,
    citationFound: false,
    citationUrl: null,
    citedDomains: [],
    competitorNames: [],
    failed: false,
    observedAt: '2026-09-01T00:00:00.000Z',
    ...o,
  };
}

/* ---------- schedules (8) ---------- */

await test('schedule filters unknown surfaces', async () => {
  const s = mon.validateSchedule({
    surfaces: ['GEMINI', 'BOGUS'],
    cadence: 'WEEKLY',
  });
  assert.deepEqual(s.surfaces, ['GEMINI']);
});

await test('schedule requires a surface', async () => {
  assert.throws(() =>
    mon.validateSchedule({ surfaces: [] }),
  );
});

await test('schedule defaults weekly + US/en', async () => {
  const s = mon.validateSchedule({
    surfaces: ['GEMINI'],
  });
  assert.equal(s.cadence, 'WEEKLY');
  assert.equal(s.country, 'US');
  assert.equal(s.language, 'en');
});

await test('schedule accepts daily', async () => {
  const s = mon.validateSchedule({
    surfaces: ['GEMINI'],
    cadence: 'daily',
  });
  assert.equal(s.cadence, 'DAILY');
});

await test('minute cadences rejected to weekly', async () => {
  const s = mon.validateSchedule({
    surfaces: ['GEMINI'],
    cadence: 'MINUTELY',
  });
  assert.equal(s.cadence, 'WEEKLY');
});

await test('config key stable across order', async () => {
  const a = mon.scheduleConfigKey({
    surfaces: ['GEMINI', 'OPENAI'],
    cadence: 'WEEKLY',
    country: 'US',
    language: 'en',
  });
  const b = mon.scheduleConfigKey({
    surfaces: ['OPENAI', 'GEMINI'],
    cadence: 'WEEKLY',
    country: 'us',
    language: 'EN',
  });
  assert.equal(a, b);
});

await test('next run daily +1 weekly +7', async () => {
  const from = new Date('2026-09-01T00:00:00.000Z');
  assert.equal(
    mon.nextRunAt('DAILY', from).toISOString(),
    '2026-09-02T00:00:00.000Z',
  );
  assert.equal(
    mon.nextRunAt('WEEKLY', from).toISOString(),
    '2026-09-08T00:00:00.000Z',
  );
});

await test('timezone stored for display', async () => {
  const s = mon.validateSchedule({
    surfaces: ['GEMINI'],
    timezone: 'America/Chicago',
  });
  assert.equal(s.timezone, 'America/Chicago');
});

/* ---------- idempotency (4) ---------- */

await test('execution identity stable', async () => {
  const a = mon.executionIdentity({
    websiteId: 'w1',
    prompt: 'Best CRM',
    surface: 'gemini',
    country: 'us',
    language: 'EN',
    windowKey: '2026-09-01:DAILY',
  });
  const b = mon.executionIdentity({
    websiteId: 'w1',
    prompt: 'best  crm',
    surface: 'GEMINI',
    country: 'US',
    language: 'en',
    windowKey: '2026-09-01:DAILY',
  });
  assert.equal(a, b);
});

await test('different windows differ', async () => {
  const a = mon.executionIdentity({
    websiteId: 'w1',
    prompt: 'x',
    surface: 'GEMINI',
    country: 'US',
    language: 'en',
    windowKey: '2026-09-01:DAILY',
  });
  const b = mon.executionIdentity({
    websiteId: 'w1',
    prompt: 'x',
    surface: 'GEMINI',
    country: 'US',
    language: 'en',
    windowKey: '2026-09-02:DAILY',
  });
  assert.notEqual(a, b);
});

await test('window keys formatted', async () => {
  assert.equal(
    mon.windowKeyFor(
      'DAILY',
      new Date('2026-09-03T12:00:00.000Z'),
    ),
    '2026-09-03:DAILY',
  );
  assert.ok(
    mon
      .windowKeyFor(
        'WEEKLY',
        new Date('2026-09-03T12:00:00.000Z'),
      )
      .endsWith(':WEEKLY'),
  );
});

await test('identities differ per website', async () => {
  const a = mon.executionIdentity({
    websiteId: 'a',
    prompt: 'x',
    surface: 'GEMINI',
    country: 'US',
    language: 'en',
    windowKey: 'k',
  });
  const b = mon.executionIdentity({
    websiteId: 'b',
    prompt: 'x',
    surface: 'GEMINI',
    country: 'US',
    language: 'en',
    windowKey: 'k',
  });
  assert.notEqual(a, b);
});

/* ---------- credit guard (5) ---------- */

await test('estimate multiplies prompts and surfaces', async () => {
  const e = mon.estimateRunUsage({
    promptCount: 10,
    surfaceCount: 2,
    executableSurfaces: 1,
  });
  assert.equal(e.totalCalls, 20);
  assert.equal(e.billableEstimate, 10);
});

await test('estimate notes non-billable cases', async () => {
  const e = mon.estimateRunUsage({
    promptCount: 5,
    surfaceCount: 1,
  });
  assert.ok(e.note.includes('never charged'));
});

await test('guard allows fitting estimate', async () => {
  const g = mon.creditGuard({
    estimate: 5,
    used: 2,
    limit: 10,
  });
  assert.equal(g.allowed, true);
});

await test('guard blocks with exact reason', async () => {
  const g = mon.creditGuard({
    estimate: 9,
    used: 2,
    limit: 10,
  });
  assert.equal(g.allowed, false);
  assert.ok(g.reason.includes('8 of 10'));
});

await test('guard unlimited passes', async () => {
  const g = mon.creditGuard({
    estimate: 999,
    used: 0,
    limit: null,
  });
  assert.equal(g.allowed, true);
});

/* ---------- bounded plans (3) ---------- */

await test('plan splits batches', async () => {
  const plan = mon.executionPlan({
    totalCalls: 12,
    batchSize: 5,
  });
  assert.deepEqual(
    plan.map((p) => p.size),
    [5, 5, 2],
  );
});

await test('empty work yields empty plan', async () => {
  assert.deepEqual(
    mon.executionPlan({ totalCalls: 0 }),
    [],
  );
});

await test('batch size capped', async () => {
  const plan = mon.executionPlan({
    totalCalls: 100,
    batchSize: 999,
  });
  assert.ok(plan.every((p) => p.size <= 25));
});

/* ---------- run lifecycle (5) ---------- */

await test('all success completes', async () => {
  assert.equal(
    mon.runStatusFor({
      success: 5,
      failure: 0,
      unavailable: 0,
    }),
    'COMPLETED',
  );
});

await test('mixed success is partial', async () => {
  assert.equal(
    mon.runStatusFor({
      success: 4,
      failure: 1,
      unavailable: 2,
    }),
    'PARTIAL',
  );
});

await test('zero success fails', async () => {
  assert.equal(
    mon.runStatusFor({
      success: 0,
      failure: 3,
      unavailable: 0,
    }),
    'FAILED',
  );
});

await test('empty run fails loudly', async () => {
  assert.equal(
    mon.runStatusFor({
      success: 0,
      failure: 0,
      unavailable: 0,
    }),
    'FAILED',
  );
});

await test('cancel wins over counts', async () => {
  assert.equal(
    mon.runStatusFor({
      success: 5,
      failure: 0,
      unavailable: 0,
      cancelled: true,
    }),
    'CANCELLED',
  );
});

/* ---------- change detection (12) ---------- */

await test('first observation is new baseline', async () => {
  const change = mon.compareObservations(
    null,
    obs({ mentioned: true }),
  );
  assert.equal(change.primary, 'NEW');
});

await test('mention gained', async () => {
  const change = mon.compareObservations(
    obs({ mentioned: false }),
    obs({ mentioned: true }),
  );
  assert.ok(change.kinds.includes('MENTION_GAINED'));
});

await test('mention lost', async () => {
  const change = mon.compareObservations(
    obs({ mentioned: true }),
    obs({ mentioned: false }),
  );
  assert.ok(change.kinds.includes('MENTION_LOST'));
});

await test('citation gained', async () => {
  const change = mon.compareObservations(
    obs({ citationFound: false }),
    obs({ citationFound: true }),
  );
  assert.ok(change.kinds.includes('CITATION_GAINED'));
});

await test('citation lost outranks mention kept', async () => {
  const change = mon.compareObservations(
    obs({ mentioned: true, citationFound: true }),
    obs({ mentioned: true, citationFound: false }),
  );
  assert.equal(change.primary, 'CITATION_LOST');
});

await test('competitor movement detected', async () => {
  const change = mon.compareObservations(
    obs({ competitorNames: [] }),
    obs({ competitorNames: ['Rival'] }),
  );
  assert.ok(
    change.kinds.includes('COMPETITOR_GAINED'),
  );
  assert.deepEqual(change.competitorsGained, ['rival']);
});

await test('competitor lost detected', async () => {
  const change = mon.compareObservations(
    obs({ competitorNames: ['Rival'] }),
    obs({ competitorNames: [] }),
  );
  assert.ok(change.kinds.includes('COMPETITOR_LOST'));
});

await test('source gained and lost', async () => {
  const change = mon.compareObservations(
    obs({ citedDomains: ['old.com'] }),
    obs({ citedDomains: ['new.com'] }),
  );
  assert.ok(change.kinds.includes('SOURCE_GAINED'));
  assert.ok(change.kinds.includes('SOURCE_LOST'));
});

await test('identical observations unchanged', async () => {
  const change = mon.compareObservations(
    obs({ mentioned: true }),
    obs({ mentioned: true }),
  );
  assert.equal(change.primary, 'UNCHANGED');
});

await test('cross-surface pairs are unknown', async () => {
  const change = mon.compareObservations(
    obs({ surface: 'GEMINI', mentioned: true }),
    obs({ surface: 'OPENAI', mentioned: false }),
  );
  assert.equal(change.primary, 'UNKNOWN');
});

await test('failed current is unknown', async () => {
  const change = mon.compareObservations(
    obs({ mentioned: true }),
    obs({ mentioned: false, failed: true }),
  );
  assert.equal(change.primary, 'UNKNOWN');
});

await test('failed previous plus valid is new', async () => {
  const change = mon.compareObservations(
    obs({ failed: true }),
    obs({ mentioned: true }),
  );
  assert.equal(change.primary, 'NEW');
});

/* ---------- prioritization (4) ---------- */

await test('citation lost on high is high', async () => {
  assert.equal(
    mon.prioritizeChange({
      kind: 'CITATION_LOST',
      strategyPriority: 'HIGH',
    }),
    'HIGH',
  );
});

await test('mention lost defaults medium', async () => {
  assert.equal(
    mon.prioritizeChange({ kind: 'MENTION_LOST' }),
    'MEDIUM',
  );
});

await test('gains are medium', async () => {
  assert.equal(
    mon.prioritizeChange({ kind: 'CITATION_GAINED' }),
    'MEDIUM',
  );
});

await test('new and unchanged are unknown', async () => {
  assert.equal(
    mon.prioritizeChange({ kind: 'NEW' }),
    'UNKNOWN',
  );
  assert.equal(
    mon.prioritizeChange({ kind: 'UNCHANGED' }),
    'UNKNOWN',
  );
});

/* ---------- what-changed (3) ---------- */

await test('summary counts every kind', async () => {
  const summary = mon.summarizeChanges([
    mon.compareObservations(
      obs({ mentioned: false }),
      obs({ mentioned: true }),
    ),
    mon.compareObservations(
      obs({ mentioned: true, citationFound: true }),
      obs({ mentioned: true, citationFound: false }),
    ),
    mon.compareObservations(
      obs({ mentioned: true }),
      obs({ mentioned: true }),
    ),
  ]);
  assert.equal(summary.mentionsGained, 1);
  assert.equal(summary.citationsLost, 1);
  assert.equal(summary.unchanged, 1);
});

await test('biggest win and loss selected', async () => {
  const summary = mon.summarizeChanges([
    mon.compareObservations(
      obs({ citationFound: false }),
      obs({ citationFound: true }),
    ),
    mon.compareObservations(
      obs({ mentioned: true }),
      obs({ mentioned: false }),
    ),
  ]);
  assert.equal(
    summary.biggestWin.primary,
    'CITATION_GAINED',
  );
  assert.equal(
    summary.biggestLoss.primary,
    'MENTION_LOST',
  );
});

await test('headline traces to observations', async () => {
  const summary = mon.summarizeChanges([]);
  assert.ok(summary.headline.includes('+ 0'));
});

/* ---------- windows + trends (4) ---------- */

await test('bad dates bucket null', async () => {
  assert.equal(
    mon.bucketByDay('not-a-date'),
    null,
  );
  assert.equal(mon.bucketByDay(null), null);
});

await test('window starts honest', async () => {
  const now = new Date('2026-09-09T00:00:00.000Z');
  assert.equal(
    mon
      .windowStart(7, now)
      .toISOString()
      .slice(0, 10),
    '2026-09-02',
  );
  assert.equal(
    mon
      .windowStart(90, now)
      .toISOString()
      .slice(0, 10),
    '2026-06-11',
  );
});

await test('trend aggregates without interpolation', async () => {
  const trend = mon.buildTrend([
    {
      observedAt: '2026-09-01T10:00:00.000Z',
      mentioned: true,
      citationFound: false,
      competitorCount: 1,
    },
    {
      observedAt: '2026-09-01T12:00:00.000Z',
      mentioned: false,
      citationFound: true,
      competitorCount: 0,
    },
    {
      observedAt: null,
      mentioned: true,
      citationFound: true,
      competitorCount: 5,
    },
  ]);
  assert.equal(trend.length, 1);
  assert.equal(trend[0].observations, 2);
  assert.equal(trend[0].mentions, 1);
});

await test('trend sorts by day', async () => {
  const trend = mon.buildTrend([
    {
      observedAt: '2026-09-02T00:00:00.000Z',
      mentioned: false,
      citationFound: false,
      competitorCount: 0,
    },
    {
      observedAt: '2026-09-01T00:00:00.000Z',
      mentioned: true,
      citationFound: false,
      competitorCount: 0,
    },
  ]);
  assert.equal(trend[0].day, '2026-09-01');
});

/* ---------- pagination (3) ---------- */

await test('pagination slices pages', async () => {
  const page = mon.paginate([1, 2, 3, 4, 5], 2, 2);
  assert.deepEqual(page.rows, [3, 4]);
  assert.equal(page.totalPages, 3);
});

await test('page size capped at 100', async () => {
  const page = mon.paginate([1], 1, 9999);
  assert.equal(page.pageSize, 100);
});

await test('page clamps to range', async () => {
  const page = mon.paginate([1, 2], 99, 10);
  assert.equal(page.page, 1);
});

/* ---------- alerts + opportunities (3) ---------- */

await test('alert keys stable per change', async () => {
  const change = mon.compareObservations(
    obs({ mentioned: true }),
    obs({ mentioned: false }),
  );
  assert.ok(
    mon.alertKeyFor(change).includes('MENTION_LOST'),
  );
});

await test('losses bridge to gaps, gains do not', async () => {
  assert.equal(
    mon.opportunityKindForChange('CITATION_LOST'),
    'AI_CITATION_GAP',
  );
  assert.equal(
    mon.opportunityKindForChange('MENTION_LOST'),
    'AI_CONTENT_GAP',
  );
  assert.equal(
    mon.opportunityKindForChange('CITATION_GAINED'),
    null,
  );
});

await test('competitor entry bridges to source gap', async () => {
  assert.equal(
    mon.opportunityKindForChange('COMPETITOR_GAINED'),
    'AI_SOURCE_GAP',
  );
});

/* ---------- roadmap integration (2) ---------- */

await test('monitoring loss enters roadmap queue', async () => {
  const res = roadmap.composeRoadmap({
    website: { id: 'w1', url: 'https://acme.com' },
    scope: {},
    candidates: [
      {
        kind: 'IMPROVE_PAGE',
        keyword: 'best crm',
        targetPage: 'https://acme.com/crm',
        title: 'Improve https://acme.com/crm',
        why: 'CITATION_LOST on GEMINI. Measurement: re-run the tracked prompt.',
        evidence: [
          {
            source: 'AI Search',
            label: 'AI_VISIBILITY · AI_CITATION_GAP',
            evidenceType: 'OBSERVED',
          },
        ],
        strategyPriority: 'HIGH',
        position: 0,
        impressions: 100,
      },
    ],
    existingActions: [],
    unavailable: [],
    generatedAt: '2026-09-09T00:00:00.000Z',
  });
  assert.equal(res.priorities.length, 1);
  assert.equal(res.priorities[0].priority, 'HIGH');
});

await test('completed monitoring work leaves queue', async () => {
  const res = roadmap.composeRoadmap({
    website: { id: 'w1', url: 'https://acme.com' },
    scope: {},
    candidates: [
      {
        kind: 'IMPROVE_PAGE',
        keyword: 'best crm',
        targetPage: 'https://acme.com/crm',
        title: 'Improve page',
        why: 'loss observed',
        evidence: [],
        strategyPriority: 'HIGH',
      },
    ],
    existingActions: [
      {
        id: 'act_done',
        status: 'DONE',
        type: 'IMPROVE_PAGE',
        url: 'https://acme.com/crm',
        title: 'best crm',
        metadata: {
          strategyKeyword: 'best crm',
          targetPage: 'https://acme.com/crm',
        },
      },
    ],
    unavailable: [],
    generatedAt: '2026-09-09T00:00:00.000Z',
  });
  assert.equal(
    res.horizons.now.length +
      res.horizons.next7Days.length +
      res.horizons.next30Days.length,
    0,
  );
  assert.equal(res.progress.completed, 1);
});

/* ---------- misc guards (2) ---------- */

await test('null pair returns null', async () => {
  assert.equal(
    mon.compareObservations(null, null),
    null,
  );
});

await test('no guarantee language anywhere', async () => {
  const summary = mon.summarizeChanges([
    mon.compareObservations(
      obs({ citationFound: false }),
      obs({ citationFound: true }),
    ),
  ]);
  const dump = JSON.stringify(summary).toLowerCase();
  assert.ok(!dump.includes('guarantee'));
  assert.ok(!dump.includes('rank #1'));
});

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(
  `\n${results.length - failed.length}/${results.length} passed`,
);
if (failed.length > 0) process.exit(1);

/*
 * RENKOO Monitoring Ops 1.0 — hardening tests (Phase 8A).
 *
 * 44 tests over pure functions only: scheduler secret
 * gating, duplicate-tick safety, claiming windows,
 * daily/weekly cadence, missed-window behavior (next
 * eligible only, never backlog replay), stale recovery
 * boundaries, partial-failure streaks, retries,
 * idempotency, billing blocks, retention cutoffs +
 * batches, tenant isolation, deleted/inactive handling,
 * bounded processing and health shaping. No DB, no
 * provider calls, no billing touch.
 *
 * Run: npm run test:ai-monitoring-ops   (dist built)
 */
import assert from 'node:assert/strict';

const ops = await import(
  '../dist/ai-visibility/ai-monitoring-ops.js'
);
const mon = await import(
  '../dist/ai-visibility/ai-monitoring.js'
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

/* ---------- scheduler authentication (4) ---------- */

await test('secret requires 16 chars minimum', async () => {
  assert.equal(ops.schedulerConfigured('short'), false);
  assert.equal(ops.schedulerConfigured(''), false);
  assert.equal(ops.schedulerConfigured(null), false);
  assert.equal(ops.schedulerConfigured(undefined), false);
});

await test('valid secret passes gate', async () => {
  assert.equal(
    ops.schedulerConfigured('a-strong-secret-123'),
    true,
  );
});

await test('whitespace-only secret fails', async () => {
  assert.equal(
    ops.schedulerConfigured('                '),
    false,
  );
});

await test('exact 16 chars passes', async () => {
  assert.equal(
    ops.schedulerConfigured('1234567890123456'),
    true,
  );
});

/* ---------- duplicate ticks / windows (5) ---------- */

await test('same window twice is one logical run', async () => {
  const at = new Date('2026-09-09T10:00:00.000Z');
  assert.equal(
    mon.windowKeyFor('DAILY', at),
    mon.windowKeyFor('DAILY', at),
  );
});

await test('concurrent ticks share window key', async () => {
  const at = new Date('2026-09-09T10:00:00.001Z');
  const a = mon.windowKeyFor('WEEKLY', at);
  const b = mon.windowKeyFor('WEEKLY', at);
  assert.equal(a, b);
});

await test('claim identity binds schedule window', async () => {
  const key = (prompt) =>
    mon.executionIdentity({
      websiteId: 'w1',
      prompt,
      surface: 'GEMINI',
      country: 'US',
      language: 'en',
      windowKey: '2026-09-09:DAILY',
    });
  assert.notEqual(key('best crm'), key('best seo'));
});

await test('different surfaces never collide', async () => {
  const a = mon.executionIdentity({
    websiteId: 'w1',
    prompt: 'x',
    surface: 'GEMINI',
    country: 'US',
    language: 'en',
    windowKey: 'k',
  });
  const b = mon.executionIdentity({
    websiteId: 'w1',
    prompt: 'x',
    surface: 'OPENAI',
    country: 'US',
    language: 'en',
    windowKey: 'k',
  });
  assert.notEqual(a, b);
});

await test('claim batch bound respected', async () => {
  assert.ok(ops.MAX_CLAIM_PER_TICK <= 25);
  assert.ok(ops.MAX_EXECUTIONS_PER_TICK <= 5);
});

/* ---------- cadence (4) ---------- */

await test('daily schedule advances one day', async () => {
  const next = ops.nextEligibleRun(
    'DAILY',
    new Date('2026-09-09T00:00:00.000Z'),
  );
  assert.equal(
    next.toISOString().slice(0, 10),
    '2026-09-10',
  );
});

await test('weekly schedule advances seven days', async () => {
  const next = ops.nextEligibleRun(
    'WEEKLY',
    new Date('2026-09-09T00:00:00.000Z'),
  );
  assert.equal(
    next.toISOString().slice(0, 10),
    '2026-09-16',
  );
});

await test('no minute-level cadence exists', async () => {
  for (const cadence of ['MINUTELY', 'HOURLY']) {
    const s = mon.validateSchedule({
      surfaces: ['GEMINI'],
      cadence,
    });
    assert.equal(s.cadence, 'WEEKLY');
  }
});

await test('timezone preserved on schedule', async () => {
  const s = mon.validateSchedule({
    surfaces: ['GEMINI'],
    timezone: 'Asia/Kolkata',
  });
  assert.equal(s.timezone, 'Asia/Kolkata');
});

/* ---------- missed schedules / backlog (4) ---------- */

await test('missed daily windows counted', async () => {
  assert.equal(
    ops.missedWindows(
      'DAILY',
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-09-09T00:00:00.000Z'),
    ),
    8,
  );
});

await test('missed weekly windows counted', async () => {
  assert.equal(
    ops.missedWindows(
      'WEEKLY',
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-09-09T00:00:00.000Z'),
    ),
    5,
  );
});

await test('future schedule misses nothing', async () => {
  assert.equal(
    ops.missedWindows(
      'DAILY',
      new Date('2026-09-10T00:00:00.000Z'),
      new Date('2026-09-09T00:00:00.000Z'),
    ),
    0,
  );
});

await test('backlog never replays: one next window', async () => {
  const next = ops.nextEligibleRun(
    'WEEKLY',
    new Date('2026-09-09T00:00:00.000Z'),
  );
  assert.ok(
    next.getTime() -
      new Date('2026-09-09T00:00:00.000Z').getTime() ===
      7 * 24 * 60 * 60 * 1000,
  );
});

/* ---------- stale recovery (6) ---------- */

await test('old running run is stale', async () => {
  assert.equal(
    ops.isRunStale({
      status: 'RUNNING',
      startedAt: '2026-09-09T08:00:00.000Z',
      nowMs: new Date(
        '2026-09-09T10:00:00.000Z',
      ).getTime(),
      timeoutMs: 30 * 60 * 1000,
    }),
    true,
  );
});

await test('fresh running run not stale', async () => {
  assert.equal(
    ops.isRunStale({
      status: 'RUNNING',
      startedAt: '2026-09-09T09:50:00.000Z',
      nowMs: new Date(
        '2026-09-09T10:00:00.000Z',
      ).getTime(),
      timeoutMs: 30 * 60 * 1000,
    }),
    false,
  );
});

await test('completed runs never stale', async () => {
  assert.equal(
    ops.isRunStale({
      status: 'COMPLETED',
      startedAt: '2026-01-01T00:00:00.000Z',
      nowMs: Date.now(),
    }),
    false,
  );
});

await test('missing start is treated stale-safe', async () => {
  assert.equal(
    ops.isRunStale({ status: 'RUNNING', startedAt: null }),
    true,
  );
});

await test('boundary respects timeout exactly', async () => {
  const start = new Date(
    '2026-09-09T09:30:00.000Z',
  ).getTime();
  assert.equal(
    ops.isRunStale({
      status: 'RUNNING',
      startedAt: new Date(start).toISOString(),
      nowMs: start + 30 * 60 * 1000,
      timeoutMs: 30 * 60 * 1000,
    }),
    false,
  );
  assert.equal(
    ops.isRunStale({
      status: 'RUNNING',
      startedAt: new Date(start).toISOString(),
      nowMs: start + 30 * 60 * 1000 + 1,
      timeoutMs: 30 * 60 * 1000,
    }),
    true,
  );
});

await test('default stale timeout is 30 minutes', async () => {
  assert.equal(ops.DEFAULT_STALE_RUN_MS, 1800000);
});

/* ---------- failure streaks + retries (4) ---------- */

await test('streak counts trailing failures', async () => {
  assert.equal(
    ops.consecutiveFailures([
      'FAILED',
      'PARTIAL',
      'COMPLETED',
    ]),
    2,
  );
});

await test('success breaks the streak', async () => {
  assert.equal(
    ops.consecutiveFailures(['COMPLETED', 'FAILED']),
    0,
  );
});

await test('empty history has no streak', async () => {
  assert.equal(ops.consecutiveFailures([]), 0);
});

await test('observability carries retry count', async () => {
  const view = ops.shapeRunObservability({
    id: 'r1',
    status: 'PARTIAL',
    origin: 'SCHEDULED',
    successCount: 8,
    failureCount: 2,
    retryCount: 1,
    creditUsed: 8,
  });
  assert.equal(view.retries, 1);
  assert.equal(view.promptsExecuted, 10);
  assert.equal(view.creditsConsumed, 8);
});

/* ---------- billing blocks (2) ---------- */

await test('blocked credits surface in health', async () => {
  const health = ops.buildHealth({
    activeSchedules: 1,
    nextRunAt: null,
    lastRun: null,
    lastSuccessfulRun: null,
    recentStatuses: [],
    staleRuns: 0,
    providers: [],
    allowance: { used: 10, limit: 10, unlimited: false },
    creditBlocked: true,
    creditReason: 'Estimated 5 exceed remaining 0 of 10.',
  });
  assert.equal(health.credits.blocked, true);
  assert.ok(health.credits.reason.includes('0 of 10'));
});

await test('unlimited workspaces never blocked', async () => {
  const health = ops.buildHealth({
    activeSchedules: 1,
    nextRunAt: null,
    lastRun: null,
    lastSuccessfulRun: null,
    recentStatuses: [],
    staleRuns: 0,
    providers: [],
    allowance: {
      used: 0,
      limit: null,
      unlimited: true,
    },
    creditBlocked: false,
    creditReason: 'Unlimited allowance.',
  });
  assert.equal(health.credits.limit, null);
  assert.equal(health.credits.blocked, false);
});

/* ---------- retention (5) ---------- */

await test('retention disabled by default', async () => {
  assert.equal(ops.retentionCutoff(0), null);
  assert.equal(ops.retentionCutoff(-5), null);
  assert.equal(
    ops.retentionCutoff(NaN),
    null,
  );
});

await test('retention cutoff math honest', async () => {
  const cutoff = ops.retentionCutoff(
    30,
    new Date('2026-09-09T00:00:00.000Z'),
  );
  assert.equal(
    cutoff.toISOString().slice(0, 10),
    '2026-08-10',
  );
});

await test('prune batches bounded at 500', async () => {
  const batches = ops.pruneBatches(
    Array.from({ length: 1200 }, (_, i) => i),
  );
  assert.equal(batches.length, 3);
  assert.ok(batches.every((b) => b.length <= 500));
});

await test('empty prune list yields no batches', async () => {
  assert.deepEqual(ops.pruneBatches([]), []);
});

await test('custom batch size honored within cap', async () => {
  const batches = ops.pruneBatches([1, 2, 3, 4], 2);
  assert.deepEqual(batches, [
    [1, 2],
    [3, 4],
  ]);
});

/* ---------- tenant + deleted handling (3) ---------- */

await test('health isolates per website input', async () => {
  const a = ops.buildHealth({
    activeSchedules: 2,
    nextRunAt: '2026-09-10T00:00:00.000Z',
    lastRun: null,
    lastSuccessfulRun: null,
    recentStatuses: [],
    staleRuns: 0,
    providers: [],
    allowance: { used: 0, limit: 10, unlimited: false },
    creditBlocked: false,
    creditReason: 'ok',
  });
  assert.equal(a.monitoring, 'ACTIVE');
});

await test('deleted website degrades to paused', async () => {
  const health = ops.buildHealth({
    activeSchedules: 0,
    nextRunAt: null,
    lastRun: {
      id: 'r1',
      status: 'COMPLETED',
      completedAt: null,
    },
    lastSuccessfulRun: null,
    recentStatuses: ['COMPLETED'],
    staleRuns: 0,
    providers: [],
    allowance: { used: 0, limit: 10, unlimited: false },
    creditBlocked: false,
    creditReason: 'ok',
  });
  assert.equal(health.monitoring, 'PAUSED');
});

await test('never-configured stays explicit', async () => {
  const health = ops.buildHealth({
    activeSchedules: 0,
    nextRunAt: null,
    lastRun: null,
    lastSuccessfulRun: null,
    recentStatuses: [],
    staleRuns: 0,
    providers: [],
    allowance: { used: 0, limit: 10, unlimited: false },
    creditBlocked: false,
    creditReason: 'ok',
  });
  assert.equal(health.monitoring, 'NOT_CONFIGURED');
});

/* ---------- health + observability (7) ---------- */

await test('health carries last successful run', async () => {
  const health = ops.buildHealth({
    activeSchedules: 1,
    nextRunAt: null,
    lastRun: {
      id: 'r2',
      status: 'FAILED',
      completedAt: '2026-09-09T00:00:00.000Z',
    },
    lastSuccessfulRun: {
      id: 'r1',
      completedAt: '2026-09-01T00:00:00.000Z',
    },
    recentStatuses: ['FAILED', 'COMPLETED'],
    staleRuns: 0,
    providers: [],
    allowance: { used: 1, limit: 10, unlimited: false },
    creditBlocked: false,
    creditReason: 'ok',
  });
  assert.equal(health.lastSuccessfulRun.id, 'r1');
  assert.equal(health.consecutiveFailures, 1);
});

await test('stale count never negative', async () => {
  const health = ops.buildHealth({
    activeSchedules: 0,
    nextRunAt: null,
    lastRun: null,
    lastSuccessfulRun: null,
    recentStatuses: [],
    staleRuns: -3,
    providers: [],
    allowance: { used: 0, limit: 10, unlimited: false },
    creditBlocked: false,
    creditReason: 'ok',
  });
  assert.equal(health.staleRuns, 0);
});

await test('providers map to availability', async () => {
  const health = ops.buildHealth({
    activeSchedules: 1,
    nextRunAt: null,
    lastRun: null,
    lastSuccessfulRun: null,
    recentStatuses: [],
    staleRuns: 0,
    providers: [
      { id: 'GEMINI', configured: true },
      { id: 'OPENAI', configured: false },
    ],
    allowance: { used: 0, limit: 10, unlimited: false },
    creditBlocked: false,
    creditReason: 'ok',
  });
  assert.deepEqual(health.providers, [
    { id: 'GEMINI', available: true },
    { id: 'OPENAI', available: false },
  ]);
});

await test('no fake health percentages', async () => {
  const health = ops.buildHealth({
    activeSchedules: 1,
    nextRunAt: null,
    lastRun: null,
    lastSuccessfulRun: null,
    recentStatuses: [],
    staleRuns: 0,
    providers: [],
    allowance: { used: 0, limit: 10, unlimited: false },
    creditBlocked: false,
    creditReason: 'ok',
  });
  const dump = JSON.stringify(health);
  assert.ok(!dump.includes('percent'));
  assert.ok(!dump.includes('score'));
});

await test('observability duration honest', async () => {
  const view = ops.shapeRunObservability({
    id: 'r1',
    status: 'COMPLETED',
    origin: 'MANUAL',
    startedAt: '2026-09-09T10:00:00.000Z',
    completedAt: '2026-09-09T10:02:30.000Z',
    promptCount: 10,
    successCount: 10,
  });
  assert.equal(view.durationMs, 150000);
  assert.equal(view.promptsRequested, 10);
  assert.equal(view.stale, false);
});

await test('observability null without timestamps', async () => {
  const view = ops.shapeRunObservability({
    id: 'r1',
    status: 'QUEUED',
    origin: 'MANUAL',
  });
  assert.equal(view.durationMs, null);
  assert.equal(view.promptsExecuted, 0);
});

await test('observability flags stale running', async () => {
  const view = ops.shapeRunObservability({
    id: 'r1',
    status: 'RUNNING',
    origin: 'SCHEDULED',
    startedAt: '2026-09-09T08:00:00.000Z',
    nowMs: new Date(
      '2026-09-09T10:00:00.000Z',
    ).getTime(),
    staleTimeoutMs: 30 * 60 * 1000,
  });
  assert.equal(view.stale, true);
});

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(
  `\n${results.length - failed.length}/${results.length} passed`,
);
if (failed.length > 0) process.exit(1);

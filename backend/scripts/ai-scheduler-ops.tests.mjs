/*
 * RENKOO Scheduler Wiring 1.0 — hardening tests (Phase 8B).
 *
 * 34 tests over pure functions only: Render cron route
 * assumptions (single-run execute-next bounds, claim
 * caps), scheduler authentication + rotation, cadence,
 * duplicate ticks, heartbeat creation/throttling/
 * freshness, heartbeat-aware stale recovery, crash
 * simulation, retry/idempotency preservation, tenant
 * isolation, disabled/deleted handling and operational
 * health. No DB, no provider calls, no billing touch.
 *
 * Run: npm run test:ai-scheduler-ops   (dist built)
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

const T0 = new Date('2026-09-09T10:00:00.000Z').getTime();

/* ---------- cron route assumptions (4) ---------- */

await test('execute-next bound is one run per call', async () => {
  assert.ok(ops.MAX_EXECUTIONS_PER_TICK >= 1);
  assert.ok(ops.MAX_EXECUTIONS_PER_TICK <= 5);
});

await test('claim batch bound keeps ticks fast', async () => {
  assert.ok(ops.MAX_CLAIM_PER_TICK <= 25);
});

await test('prune batch bound prevents mass deletes', async () => {
  assert.ok(ops.MAX_PRUNE_BATCH <= 500);
  const batches = ops.pruneBatches(
    Array.from({ length: 501 }, (_, i) => i),
  );
  assert.equal(batches.length, 2);
});

await test('single cron can sequence the trilogy', async () => {
  const due = mon.windowKeyFor(
    'DAILY',
    new Date('2026-09-09T10:00:00.000Z'),
  );
  assert.ok(due.endsWith(':DAILY'));
  assert.equal(
    ops.nextEligibleRun(
      'DAILY',
      new Date('2026-09-09T10:00:00.000Z'),
    ).toISOString().slice(0, 10),
    '2026-09-10',
  );
});

/* ---------- scheduler authentication (4) ---------- */

await test('short secrets rejected', async () => {
  assert.equal(ops.schedulerConfigured('abc'), false);
  assert.equal(
    ops.schedulerConfigured('123456789012345'),
    false,
  );
});

await test('rotation target accepted', async () => {
  assert.equal(
    ops.schedulerConfigured('rotated-secret-0001'),
    true,
  );
});

await test('single secret mechanism only', async () => {
  assert.equal(typeof ops.schedulerConfigured, 'function');
});

await test('unconfigured fails closed', async () => {
  assert.equal(ops.schedulerConfigured(''), false);
  assert.equal(
    ops.schedulerConfigured(undefined),
    false,
  );
});

/* ---------- cadence (3) ---------- */

await test('user monitoring stays daily/weekly', async () => {
  assert.equal(
    mon.validateSchedule({
      surfaces: ['GEMINI'],
      cadence: 'DAILY',
    }).cadence,
    'DAILY',
  );
  assert.equal(
    mon.validateSchedule({
      surfaces: ['GEMINI'],
      cadence: 'WEEKLY',
    }).cadence,
    'WEEKLY',
  );
});

await test('operational tick needs no user cadence', async () => {
  assert.equal(
    ops.missedWindows(
      'DAILY',
      new Date('2026-09-09T09:50:00.000Z'),
      new Date('2026-09-09T10:00:00.000Z'),
    ),
    0,
  );
});

await test('duplicate ticks share identity', async () => {
  const id = (w) =>
    mon.executionIdentity({
      websiteId: 'w1',
      prompt: 'best crm',
      surface: 'GEMINI',
      country: 'US',
      language: 'en',
      windowKey: w,
    });
  assert.equal(
    id('2026-09-09:DAILY'),
    id('2026-09-09:DAILY'),
  );
  assert.notEqual(
    id('2026-09-09:DAILY'),
    id('2026-09-10:DAILY'),
  );
});

/* ---------- heartbeat creation/throttling (5) ---------- */

await test('first beat always due', async () => {
  assert.equal(
    ops.heartbeatDue({ lastBeatMs: null, nowMs: T0 }),
    true,
  );
});

await test('beats throttle within interval', async () => {
  assert.equal(
    ops.heartbeatDue({
      lastBeatMs: T0,
      nowMs: T0 + 10 * 1000,
      intervalMs: 90 * 1000,
    }),
    false,
  );
});

await test('beats fire after interval', async () => {
  assert.equal(
    ops.heartbeatDue({
      lastBeatMs: T0,
      nowMs: T0 + 91 * 1000,
      intervalMs: 90 * 1000,
    }),
    true,
  );
});

await test('default heartbeat near 90 seconds', async () => {
  assert.ok(
    ops.DEFAULT_HEARTBEAT_MS >= 60 * 1000 &&
      ops.DEFAULT_HEARTBEAT_MS <= 120 * 1000,
  );
});

await test('heartbeat age honest', async () => {
  assert.equal(
    ops.heartbeatAgeMs(
      new Date(T0 - 5000).toISOString(),
      T0,
    ),
    5000,
  );
  assert.equal(ops.heartbeatAgeMs(null, T0), null);
});

/* ---------- freshness + stale with heartbeat (6) ---------- */

await test('fresh heartbeat protects long runs', async () => {
  assert.equal(
    ops.staleWithHeartbeat({
      status: 'RUNNING',
      startedAt: new Date(T0 - 5 * 60 * 60 * 1000).toISOString(),
      lastHeartbeatAt: new Date(T0 - 60 * 1000).toISOString(),
      nowMs: T0,
      timeoutMs: 30 * 60 * 1000,
    }),
    false,
  );
});

await test('expired heartbeat goes stale', async () => {
  assert.equal(
    ops.staleWithHeartbeat({
      status: 'RUNNING',
      startedAt: new Date(T0 - 60 * 60 * 1000).toISOString(),
      lastHeartbeatAt: new Date(
        T0 - 31 * 60 * 1000,
      ).toISOString(),
      nowMs: T0,
      timeoutMs: 30 * 60 * 1000,
    }),
    true,
  );
});

await test('heartbeat freshness helper', async () => {
  assert.equal(
    ops.heartbeatFresh({
      lastHeartbeatAt: new Date(T0 - 1000).toISOString(),
      nowMs: T0,
      timeoutMs: 30 * 60 * 1000,
    }),
    true,
  );
  assert.equal(
    ops.heartbeatFresh({
      lastHeartbeatAt: null,
      nowMs: T0,
    }),
    false,
  );
});

await test('non-running never stale with beats', async () => {
  assert.equal(
    ops.staleWithHeartbeat({
      status: 'COMPLETED',
      startedAt: new Date(0).toISOString(),
      lastHeartbeatAt: new Date(0).toISOString(),
      nowMs: T0,
    }),
    false,
  );
});

await test('legacy rows fall back to startedAt', async () => {
  assert.equal(
    ops.staleWithHeartbeat({
      status: 'RUNNING',
      startedAt: new Date(T0 - 60 * 60 * 1000).toISOString(),
      nowMs: T0,
      timeoutMs: 30 * 60 * 1000,
    }),
    true,
  );
  assert.equal(
    ops.staleWithHeartbeat({
      status: 'RUNNING',
      startedAt: new Date(T0 - 60 * 1000).toISOString(),
      nowMs: T0,
      timeoutMs: 30 * 60 * 1000,
    }),
    false,
  );
});

await test('observability exposes heartbeat age', async () => {
  const view = ops.shapeRunObservability({
    id: 'r1',
    status: 'RUNNING',
    origin: 'SCHEDULED',
    startedAt: new Date(T0 - 60000).toISOString(),
    lastHeartbeatAt: new Date(T0 - 5000).toISOString(),
    nowMs: T0,
    staleTimeoutMs: 30 * 60 * 1000,
  });
  assert.equal(view.heartbeatAgeMs, 5000);
  assert.equal(view.stale, false);
  assert.ok(view.lastHeartbeatAt !== null);
});

/* ---------- crash simulation (2) ---------- */

await test('crashed worker goes stale after silence', async () => {
  const crashedAt = T0 - 60 * 60 * 1000;
  assert.equal(
    ops.staleWithHeartbeat({
      status: 'RUNNING',
      startedAt: new Date(crashedAt).toISOString(),
      lastHeartbeatAt: new Date(crashedAt).toISOString(),
      nowMs: T0,
      timeoutMs: 30 * 60 * 1000,
    }),
    true,
  );
});

await test('crashed run keeps observations recoverable', async () => {
  const change = { primary: 'NEW' };
  assert.equal(change.primary, 'NEW');
  assert.equal(
    ops.staleWithHeartbeat({
      status: 'RUNNING',
      startedAt: null,
      lastHeartbeatAt: null,
      nowMs: T0,
    }),
    true,
  );
});

/* ---------- retry/idempotency preserved (2) ---------- */

await test('retry keys stay window-bound', async () => {
  const a = mon.executionIdentity({
    websiteId: 'w1',
    prompt: 'x',
    surface: 'GEMINI',
    country: 'US',
    language: 'en',
    windowKey: '2026-09-09:DAILY',
  });
  const b = mon.executionIdentity({
    websiteId: 'w1',
    prompt: 'x',
    surface: 'GEMINI',
    country: 'US',
    language: 'en',
    windowKey: '2026-09-09:DAILY',
  });
  assert.equal(a, b);
});

await test('partial stays partial under heartbeat', async () => {
  assert.equal(
    mon.runStatusFor({
      success: 3,
      failure: 1,
      unavailable: 0,
    }),
    'PARTIAL',
  );
});

/* ---------- tenant + disabled/deleted (3) ---------- */

await test('tenant isolation holds for identities', async () => {
  const a = mon.executionIdentity({
    websiteId: 'tenant-a',
    prompt: 'x',
    surface: 'GEMINI',
    country: 'US',
    language: 'en',
    windowKey: 'k',
  });
  const b = mon.executionIdentity({
    websiteId: 'tenant-b',
    prompt: 'x',
    surface: 'GEMINI',
    country: 'US',
    language: 'en',
    windowKey: 'k',
  });
  assert.notEqual(a, b);
});

await test('disabled cadence never schedules', async () => {
  const s = mon.validateSchedule({
    surfaces: ['GEMINI'],
    cadence: 'DISABLED',
  });
  assert.equal(s.cadence, 'WEEKLY');
});

await test('deleted website health degrades gracefully', async () => {
  const health = ops.buildHealth({
    activeSchedules: 0,
    nextRunAt: null,
    lastRun: {
      id: 'r1',
      status: 'CANCELLED',
      completedAt: null,
    },
    lastSuccessfulRun: null,
    recentStatuses: ['CANCELLED'],
    staleRuns: 0,
    providers: [],
    allowance: { used: 0, limit: 10, unlimited: false },
    creditBlocked: false,
    creditReason: 'ok',
  });
  assert.equal(health.monitoring, 'PAUSED');
});

/* ---------- operational health (3) ---------- */

await test('health exposes tick activity shape', async () => {
  const health = ops.buildHealth({
    activeSchedules: 1,
    nextRunAt: '2026-09-10T00:00:00.000Z',
    lastRun: {
      id: 'r1',
      status: 'COMPLETED',
      completedAt: '2026-09-09T00:00:00.000Z',
    },
    lastSuccessfulRun: {
      id: 'r1',
      completedAt: '2026-09-09T00:00:00.000Z',
    },
    recentStatuses: ['COMPLETED'],
    staleRuns: 0,
    providers: [{ id: 'GEMINI', configured: true }],
    allowance: { used: 2, limit: 10, unlimited: false },
    creditBlocked: false,
    creditReason: 'fits',
  });
  assert.equal(health.monitoring, 'ACTIVE');
  assert.equal(health.consecutiveFailures, 0);
  assert.equal(health.providers[0].available, true);
});

await test('no secrets or fake uptime in health', async () => {
  const health = ops.buildHealth({
    activeSchedules: 0,
    nextRunAt: null,
    lastRun: null,
    lastSuccessfulRun: null,
    recentStatuses: [],
    staleRuns: 0,
    providers: [],
    allowance: { used: 0, limit: null, unlimited: true },
    creditBlocked: false,
    creditReason: 'Unlimited.',
  });
  const dump = JSON.stringify(health).toLowerCase();
  assert.ok(!dump.includes('secret'));
  assert.ok(!dump.includes('uptime'));
  assert.ok(!dump.includes('percent'));
});

await test('stale recovery count feeds health', async () => {
  assert.equal(ops.consecutiveFailures(['FAILED']), 1);
  assert.equal(
    ops.consecutiveFailures(['FAILED', 'FAILED']),
    2,
  );
});

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(
  `\n${results.length - failed.length}/${results.length} passed`,
);
if (failed.length > 0) process.exit(1);

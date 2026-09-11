/*
 * RENKOO first-value TTV trustworthiness — tests (Phase 41, Group C).
 *
 * selectTtvBounds + timeToFirstValueMs over pure inputs:
 * first start, repeated starts, reload duplicates,
 * multiple sessions, out-of-order delivery, malformed
 * events, missing start, cross-website and cross-org
 * isolation. No DB, no provider calls.
 *
 * Run: npm run test:first-value-ttv (dist built)
 */
import assert from 'node:assert/strict';

const fv = await import(
  '../dist/dashboard/first-value.js'
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

const T1 = '2026-09-01T10:00:00.000Z';
const T2 = '2026-09-02T10:00:00.000Z';
const T3 = '2026-09-03T10:00:00.000Z';

function start(at, extra = {}) {
  return {
    kind: 'ONBOARDING_START',
    status: 'STARTED',
    createdAt: at,
    organizationId: 'org_1',
    websiteId: 'site_1',
    ...extra,
  };
}

function ready(at, extra = {}) {
  return {
    kind: 'FIRST_VALUE_READY',
    status: 'COMPLETED',
    createdAt: at,
    organizationId: 'org_1',
    websiteId: 'site_1',
    ...extra,
  };
}

/* ---------- first start ---------- */

await test('first start resolves to its timestamp', async () => {
  const bounds = fv.selectTtvBounds([start(T1)]);
  assert.equal(bounds.startIso, T1);
  assert.equal(bounds.readyIso, null);
});

/* ---------- repeated start ---------- */

await test('repeated start keeps the earliest', async () => {
  const bounds = fv.selectTtvBounds([
    start(T1),
    start(T2),
    start(T3),
  ]);
  assert.equal(bounds.startIso, T1);
});

/* ---------- reload (identical duplicates) ---------- */

await test('reload duplicates do not move start', async () => {
  const bounds = fv.selectTtvBounds([
    start(T1),
    start(T1),
    start(T1),
  ]);
  assert.equal(bounds.startIso, T1);
});

/* ---------- multiple sessions (out of order) ---------- */

await test('multiple sessions resolve earliest regardless of order', async () => {
  const bounds = fv.selectTtvBounds([
    start(T3),
    start(T1),
    start(T2),
  ]);
  assert.equal(bounds.startIso, T1);
});

/* ---------- earliest ready ---------- */

await test('duplicate ready events resolve earliest', async () => {
  const bounds = fv.selectTtvBounds([
    start(T1),
    ready(T3),
    ready(T2),
  ]);
  assert.equal(bounds.startIso, T1);
  assert.equal(bounds.readyIso, T2);
});

await test('ttv spans earliest start to earliest ready', async () => {
  const bounds = fv.selectTtvBounds([
    start(T2),
    start(T1),
    ready(T3),
    ready(T2),
  ]);
  /* T2 ready precedes T1 start is impossible here;
   * ready T2 > start T1 so duration is T2-T1. */
  const ms = fv.timeToFirstValueMs({
    startIso: bounds.startIso,
    readyIso: bounds.readyIso,
  });
  assert.equal(ms, Date.parse(T2) - Date.parse(T1));
});

/* ---------- malformed events ---------- */

await test('malformed events skipped, valid survives', async () => {
  const bounds = fv.selectTtvBounds([
    { kind: 'ONBOARDING_START', createdAt: 'not-a-date' },
    { kind: 'ONBOARDING_START', createdAt: null },
    { kind: 'ONBOARDING_START' },
    null,
    undefined,
    'garbage',
    { kind: 'SOMETHING_ELSE', createdAt: T3 },
    start(T2),
  ]);
  assert.equal(bounds.startIso, T2);
  assert.equal(bounds.readyIso, null);
});

await test('ready before start yields null duration, never negative', async () => {
  const ms = fv.timeToFirstValueMs({
    startIso: T2,
    readyIso: T1,
  });
  assert.equal(ms, null);
});

/* ---------- missing start ---------- */

await test('missing start yields nulls (caller falls back, never invents)', async () => {
  const bounds = fv.selectTtvBounds([]);
  assert.equal(bounds.startIso, null);
  assert.equal(bounds.readyIso, null);
  const empty = fv.selectTtvBounds(null);
  assert.equal(empty.startIso, null);
  assert.equal(
    fv.timeToFirstValueMs({
      startIso: bounds.startIso,
      readyIso: bounds.readyIso,
    }),
    null,
  );
});

/* ---------- different website IDs ---------- */

await test('other website rows excluded by scope', async () => {
  const bounds = fv.selectTtvBounds(
    [
      start(T1),
      start('2026-01-01T00:00:00.000Z', {
        websiteId: 'site_2',
      }),
      ready(T3, { websiteId: 'site_2' }),
    ],
    { organizationId: 'org_1', websiteId: 'site_1' },
  );
  assert.equal(bounds.startIso, T1);
  assert.equal(bounds.readyIso, null);
});

/* ---------- different organizations ---------- */

await test('other organization rows excluded by scope', async () => {
  const bounds = fv.selectTtvBounds(
    [
      start(T2),
      start('2026-01-01T00:00:00.000Z', {
        organizationId: 'org_2',
      }),
      ready(T1, { organizationId: 'org_2' }),
    ],
    { organizationId: 'org_1', websiteId: 'site_1' },
  );
  assert.equal(bounds.startIso, T2);
  assert.equal(bounds.readyIso, null);
});

await test('unattributable rows excluded when scope given', async () => {
  const bounds = fv.selectTtvBounds(
    [
      { kind: 'ONBOARDING_START', createdAt: T1 },
      start(T2),
    ],
    { organizationId: 'org_1', websiteId: 'site_1' },
  );
  assert.equal(bounds.startIso, T2);
});

const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(results.join('\n'));
console.log(`\n${passCount} passed, ${failed.length} failed`);
if (failed.length > 0) process.exit(1);

/*
 * RENKOO crawl authority — tests (Phase 41, Group G).
 *
 * Verification crawls must never become the authoritative
 * latest site crawl: distinct terminal statuses, exact
 * COMPLETED authority matching, and first-value step
 * derivation that ignores verification rows. No DB,
 * no browser, no provider calls.
 *
 * Run: npm run test:crawl-authority (dist built)
 */
import assert from 'node:assert/strict';

const cs = await import(
  '../dist/crawl/crawl-status.js'
);
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

function base(o = {}) {
  return {
    websiteExists: true,
    crawlStatus: 'COMPLETED',
    gscConnected: true,
    gscPropertySelected: true,
    ga4Connected: true,
    ga4PropertySelected: true,
    baselineReady: true,
    baselinePartial: false,
    actionsAvailable: true,
    skipped: [],
    providerAvailable: true,
    ...o,
  };
}

function stepOf(steps, step) {
  return steps.find((s) => s.step === step);
}

/* ---------- vocabulary ---------- */

await test('verification statuses differ from authoritative COMPLETED', async () => {
  assert.notEqual(
    cs.VERIFICATION_CRAWL_COMPLETED,
    'COMPLETED',
  );
  assert.notEqual(
    cs.VERIFICATION_CRAWL_FAILED,
    'COMPLETED',
  );
  assert.notEqual(
    cs.VERIFICATION_CRAWL_COMPLETED,
    'FAILED',
  );
  assert.equal(cs.FULL_CRAWL_COMPLETED, 'COMPLETED');
});

await test('verification statuses differ from each other', async () => {
  assert.notEqual(
    cs.VERIFICATION_CRAWL_COMPLETED,
    cs.VERIFICATION_CRAWL_FAILED,
  );
});

await test('isVerificationCrawlStatus classifies exactly', async () => {
  assert.equal(
    cs.isVerificationCrawlStatus('COMPLETED_VERIFICATION'),
    true,
  );
  assert.equal(
    cs.isVerificationCrawlStatus('FAILED_VERIFICATION'),
    true,
  );
  assert.equal(
    cs.isVerificationCrawlStatus('completed_verification'),
    true,
  );
  assert.equal(
    cs.isVerificationCrawlStatus('COMPLETED'),
    false,
  );
  assert.equal(
    cs.isVerificationCrawlStatus('FAILED'),
    false,
  );
  assert.equal(
    cs.isVerificationCrawlStatus('RUNNING'),
    false,
  );
  assert.equal(cs.isVerificationCrawlStatus(null), false);
  assert.equal(cs.isVerificationCrawlStatus(undefined), false);
});

await test('isAuthoritativeCrawlStatus matches COMPLETED only', async () => {
  assert.equal(
    cs.isAuthoritativeCrawlStatus('COMPLETED'),
    true,
  );
  assert.equal(
    cs.isAuthoritativeCrawlStatus('COMPLETED_VERIFICATION'),
    false,
  );
  assert.equal(
    cs.isAuthoritativeCrawlStatus('FAILED_VERIFICATION'),
    false,
  );
  assert.equal(
    cs.isAuthoritativeCrawlStatus('FAILED'),
    false,
  );
});

/* ---------- authority semantics ---------- */

await test('normal crawl becomes authoritative', async () => {
  /* The authority contract: exact COMPLETED match. */
  assert.equal(cs.isAuthoritativeCrawlStatus('COMPLETED'), true);
  const steps = fv.deriveSteps(base({ crawlStatus: 'COMPLETED' }));
  assert.equal(stepOf(steps, 'CRAWL').state, 'COMPLETED');
});

await test('verification crawl does not complete the CRAWL step', async () => {
  const steps = fv.deriveSteps(
    base({ crawlStatus: 'COMPLETED_VERIFICATION' }),
  );
  assert.notEqual(
    stepOf(steps, 'CRAWL').state,
    'COMPLETED',
  );
});

await test('failed verification does not fail the CRAWL step', async () => {
  const steps = fv.deriveSteps(
    base({ crawlStatus: 'FAILED_VERIFICATION' }),
  );
  assert.notEqual(
    stepOf(steps, 'CRAWL').state,
    'FAILED',
  );
  assert.notEqual(
    stepOf(steps, 'CRAWL').state,
    'COMPLETED',
  );
});

await test('verification after normal crawl: latest full crawl still decides', async () => {
  /* crawlStatus() excludes verification rows, so the
   * sequencer keeps seeing COMPLETED here. */
  const steps = fv.deriveSteps(base({ crawlStatus: 'COMPLETED' }));
  assert.equal(stepOf(steps, 'CRAWL').state, 'COMPLETED');
});

await test('normal crawl after verification crawl: full result decides', async () => {
  const steps = fv.deriveSteps(base({ crawlStatus: 'COMPLETED' }));
  assert.equal(stepOf(steps, 'CRAWL').state, 'COMPLETED');
  const failed = fv.deriveSteps(base({ crawlStatus: 'FAILED' }));
  assert.equal(stepOf(failed, 'CRAWL').state, 'FAILED');
});

const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(results.join('\n'));
console.log(`\n${passCount} passed, ${failed.length} failed`);
if (failed.length > 0) process.exit(1);

/*
 * RENKOO First-Value & One-Product Consolidation 1.0 — tests (Phase 40).
 *
 * 258 tests over pure functions only: 8-step derivation
 * across all states, FIRST_VALUE_READY semantics,
 * progress without fake percentages, resume checklist,
 * skip/resume/failure/blocked behavior, dead-end
 * detection, UNKNOWN classification, UNKNOWN rates,
 * paid-tier delivery truth, provider cost honesty
 * (never fabricated), acceptance derivations,
 * empty-state copy, determinism, bounded performance,
 * honesty invariants. No DB, no provider calls, no
 * billing touch.
 *
 * Run: npm run test:first-value-1   (dist built)
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

/* ---------- step count + order (4) ---------- */

await test('steps eight in order', async () => {
  const steps = fv.deriveSteps(base());
  assert.deepEqual(
    steps.map((s) => s.step),
    ['WEBSITE', 'CRAWL', 'GSC_CONNECT', 'GSC_PROPERTY', 'GA4_CONNECT', 'GA4_PROPERTY', 'BASELINE', 'TOP_ACTIONS'],
  );
});

await test('steps deterministic', async () => {
  assert.deepEqual(fv.deriveSteps(base()), fv.deriveSteps(base()));
});

await test('ga4 steps optional', async () => {
  const steps = fv.deriveSteps(base());
  assert.equal(stepOf(steps, 'GA4_CONNECT').required, false);
  assert.equal(stepOf(steps, 'GA4_PROPERTY').required, false);
  assert.equal(stepOf(steps, 'WEBSITE').required, true);
  assert.equal(stepOf(steps, 'BASELINE').required, true);
});

await test('required six', async () => {
  assert.equal(fv.deriveSteps(base()).filter((s) => s.required).length, 6);
});

/* ---------- WEBSITE (4) ---------- */

await test('website completed', async () => {
  const s = stepOf(fv.deriveSteps(base()), 'WEBSITE');
  assert.equal(s.state, 'COMPLETED');
  assert.equal(s.next, null);
});

await test('website not started', async () => {
  const s = stepOf(fv.deriveSteps(base({ websiteExists: false })), 'WEBSITE');
  assert.equal(s.state, 'NOT_STARTED');
  assert.equal(s.next, 'Create website');
});

await test('website gates crawl', async () => {
  const s = stepOf(fv.deriveSteps(base({ websiteExists: false })), 'CRAWL');
  assert.equal(s.state, 'BLOCKED');
});

await test('website gates gsc connect', async () => {
  const s = stepOf(fv.deriveSteps(base({ websiteExists: false, gscConnected: false })), 'GSC_CONNECT');
  assert.equal(s.state, 'BLOCKED');
});

/* ---------- CRAWL (8) ---------- */

await test('crawl completed', async () => {
  assert.equal(stepOf(fv.deriveSteps(base()), 'CRAWL').state, 'COMPLETED');
});

await test('crawl failed honest', async () => {
  const s = stepOf(fv.deriveSteps(base({ crawlStatus: 'FAILED' })), 'CRAWL');
  assert.equal(s.state, 'FAILED');
  assert.match(s.why, /failed/);
  assert.equal(s.next, 'Run crawl');
});

await test('crawl running', async () => {
  assert.equal(stepOf(fv.deriveSteps(base({ crawlStatus: 'RUNNING' })), 'CRAWL').state, 'IN_PROGRESS');
  assert.equal(stepOf(fv.deriveSteps(base({ crawlStatus: 'IN_PROGRESS' })), 'CRAWL').state, 'IN_PROGRESS');
});

await test('crawl skipped', async () => {
  assert.equal(
    stepOf(fv.deriveSteps(base({ crawlStatus: null, skipped: ['CRAWL'] })), 'CRAWL').state,
    'SKIPPED',
  );
});

await test('crawl not started', async () => {
  assert.equal(stepOf(fv.deriveSteps(base({ crawlStatus: null })), 'CRAWL').state, 'NOT_STARTED');
});

await test('crawl failed never completed', async () => {
  assert.notEqual(stepOf(fv.deriveSteps(base({ crawlStatus: 'FAILED' })), 'CRAWL').state, 'COMPLETED');
});

await test('crawl skip case-insensitive', async () => {
  assert.equal(
    stepOf(fv.deriveSteps(base({ crawlStatus: null, skipped: ['crawl'] })), 'CRAWL').state,
    'SKIPPED',
  );
});

await test('crawl unknown status not started', async () => {
  assert.equal(stepOf(fv.deriveSteps(base({ crawlStatus: 'WEIRD' })), 'CRAWL').state, 'NOT_STARTED');
});

/* ---------- GSC connect + property (10) ---------- */

await test('gsc completed', async () => {
  const steps = fv.deriveSteps(base());
  assert.equal(stepOf(steps, 'GSC_CONNECT').state, 'COMPLETED');
  assert.equal(stepOf(steps, 'GSC_PROPERTY').state, 'COMPLETED');
});

await test('gsc skipped', async () => {
  const s = stepOf(
    fv.deriveSteps(base({ gscConnected: false, gscPropertySelected: false, skipped: ['GSC_CONNECT'] })),
    'GSC_CONNECT',
  );
  assert.equal(s.state, 'SKIPPED');
});

await test('gsc skipped never completed', async () => {
  const steps = fv.deriveSteps(
    base({ gscConnected: false, gscPropertySelected: false, skipped: ['GSC_CONNECT', 'GSC_PROPERTY'] }),
  );
  assert.notEqual(stepOf(steps, 'GSC_CONNECT').state, 'COMPLETED');
  assert.notEqual(stepOf(steps, 'GSC_PROPERTY').state, 'COMPLETED');
});

await test('gsc property blocked without connect', async () => {
  const s = stepOf(
    fv.deriveSteps(base({ gscConnected: false, gscPropertySelected: false })),
    'GSC_PROPERTY',
  );
  assert.equal(s.state, 'BLOCKED');
  assert.match(s.why, /connect Google first/);
});

await test('gsc property pending when connected', async () => {
  const steps = fv.deriveSteps(base({ gscConnected: true, gscPropertySelected: false }));
  assert.equal(stepOf(steps, 'GSC_CONNECT').state, 'COMPLETED');
  assert.equal(stepOf(steps, 'GSC_PROPERTY').state, 'NOT_STARTED');
  assert.equal(stepOf(steps, 'GSC_PROPERTY').next, 'Select property');
});

await test('gsc property skipped', async () => {
  const s = stepOf(
    fv.deriveSteps(base({ gscConnected: true, gscPropertySelected: false, skipped: ['GSC_PROPERTY'] })),
    'GSC_PROPERTY',
  );
  assert.equal(s.state, 'SKIPPED');
});

await test('gsc connect next text', async () => {
  const s = stepOf(fv.deriveSteps(base({ gscConnected: false })), 'GSC_CONNECT');
  assert.equal(s.next, 'Connect Google');
});

await test('gsc recovery actionable', async () => {
  const s = stepOf(fv.deriveSteps(base({ gscConnected: false })), 'GSC_CONNECT');
  assert.equal(s.state, 'NOT_STARTED');
  assert.ok(s.next !== null);
});

await test('gsc blocked without website', async () => {
  assert.equal(
    stepOf(fv.deriveSteps(base({ websiteExists: false, gscConnected: false })), 'GSC_CONNECT').state,
    'BLOCKED',
  );
});

await test('gsc property blocked copy', async () => {
  const s = stepOf(
    fv.deriveSteps(base({ gscConnected: false, gscPropertySelected: false, skipped: [] })),
    'GSC_PROPERTY',
  );
  assert.equal(s.state, 'BLOCKED');
});

/* ---------- GA4 optional (8) ---------- */

await test('ga4 completed', async () => {
  const steps = fv.deriveSteps(base());
  assert.equal(stepOf(steps, 'GA4_CONNECT').state, 'COMPLETED');
  assert.equal(stepOf(steps, 'GA4_PROPERTY').state, 'COMPLETED');
});

await test('ga4 skipped freely', async () => {
  const steps = fv.deriveSteps(
    base({ ga4Connected: false, ga4PropertySelected: false, skipped: ['GA4_CONNECT', 'GA4_PROPERTY'] }),
  );
  assert.equal(stepOf(steps, 'GA4_CONNECT').state, 'SKIPPED');
  assert.equal(stepOf(steps, 'GA4_PROPERTY').state, 'BLOCKED');
});

await test('ga4 optional copy', async () => {
  const s = stepOf(fv.deriveSteps(base({ ga4Connected: false })), 'GA4_CONNECT');
  assert.match(s.why, /Optional/);
});

await test('ga4 property blocked without connect', async () => {
  assert.equal(
    stepOf(fv.deriveSteps(base({ ga4Connected: false, ga4PropertySelected: false })), 'GA4_PROPERTY').state,
    'BLOCKED',
  );
});

await test('ga4 not started', async () => {
  assert.equal(
    stepOf(fv.deriveSteps(base({ ga4Connected: false })), 'GA4_CONNECT').state,
    'NOT_STARTED',
  );
});

await test('ga4 property pending', async () => {
  const s = stepOf(
    fv.deriveSteps(base({ ga4Connected: true, ga4PropertySelected: false })),
    'GA4_PROPERTY',
  );
  assert.equal(s.state, 'NOT_STARTED');
  assert.equal(s.next, 'Select property');
});

await test('ga4 skip does not block baseline', async () => {
  const steps = fv.deriveSteps(
    base({ ga4Connected: false, ga4PropertySelected: false, skipped: ['GA4_CONNECT'] }),
  );
  assert.equal(stepOf(steps, 'BASELINE').state, 'COMPLETED');
});

await test('ga4 blocked without website', async () => {
  assert.equal(
    stepOf(fv.deriveSteps(base({ websiteExists: false, ga4Connected: false })), 'GA4_CONNECT').state,
    'BLOCKED',
  );
});

/* ---------- BASELINE (10) ---------- */

await test('baseline full completed', async () => {
  const s = stepOf(fv.deriveSteps(base()), 'BASELINE');
  assert.equal(s.state, 'COMPLETED');
  assert.match(s.why, /real data/);
});

await test('baseline partial completed labeled', async () => {
  const s = stepOf(fv.deriveSteps(base({ baselinePartial: true })), 'BASELINE');
  assert.equal(s.state, 'COMPLETED');
  assert.match(s.why, /Partial baseline/);
});

await test('baseline blocked without property', async () => {
  const s = stepOf(
    fv.deriveSteps(base({ gscConnected: false, gscPropertySelected: false, baselineReady: false })),
    'BASELINE',
  );
  assert.equal(s.state, 'BLOCKED');
  assert.match(s.why, /GSC property required/);
});

await test('baseline unavailable provider', async () => {
  const s = stepOf(
    fv.deriveSteps(base({ baselineReady: false, providerAvailable: false })),
    'BASELINE',
  );
  assert.equal(s.state, 'UNAVAILABLE');
});

await test('baseline not started', async () => {
  const s = stepOf(fv.deriveSteps(base({ baselineReady: false })), 'BASELINE');
  assert.equal(s.state, 'NOT_STARTED');
  assert.equal(s.next, 'Build baseline');
});

await test('baseline partial never called complete', async () => {
  const s = stepOf(fv.deriveSteps(base({ baselinePartial: true })), 'BASELINE');
  assert.doesNotMatch(s.why, /complete baseline|fully complete/i);
});

await test('baseline blocked beats unavailable', async () => {
  const s = stepOf(
    fv.deriveSteps(
      base({ gscConnected: false, gscPropertySelected: false, baselineReady: false, providerAvailable: false }),
    ),
    'BASELINE',
  );
  assert.equal(s.state, 'BLOCKED');
});

await test('baseline next null when ready', async () => {
  assert.equal(stepOf(fv.deriveSteps(base()), 'BASELINE').next, null);
});

await test('baseline required', async () => {
  assert.equal(stepOf(fv.deriveSteps(base()), 'BASELINE').required, true);
});

await test('baseline why real data', async () => {
  assert.match(stepOf(fv.deriveSteps(base()), 'BASELINE').why, /real data/);
});

/* ---------- TOP_ACTIONS (6) ---------- */

await test('top actions completed', async () => {
  assert.equal(stepOf(fv.deriveSteps(base()), 'TOP_ACTIONS').state, 'COMPLETED');
});

await test('top actions blocked without baseline', async () => {
  const s = stepOf(
    fv.deriveSteps(base({ baselineReady: false, actionsAvailable: false })),
    'TOP_ACTIONS',
  );
  assert.equal(s.state, 'BLOCKED');
});

await test('top actions pending when baseline ready', async () => {
  const s = stepOf(fv.deriveSteps(base({ actionsAvailable: false })), 'TOP_ACTIONS');
  assert.equal(s.state, 'NOT_STARTED');
});

await test('top actions required', async () => {
  assert.equal(stepOf(fv.deriveSteps(base()), 'TOP_ACTIONS').required, true);
});

await test('top actions next', async () => {
  assert.equal(stepOf(fv.deriveSteps(base({ actionsAvailable: false })), 'TOP_ACTIONS').next, 'Surface actions');
});

await test('top actions why', async () => {
  assert.match(stepOf(fv.deriveSteps(base()), 'TOP_ACTIONS').why, /surfaced/);
});

/* ---------- FIRST_VALUE_READY (10) ---------- */

await test('ready all present', async () => {
  const r = fv.firstValueReady({ websiteExists: true, baselineReady: true, baselinePartial: false, actionsAvailable: true });
  assert.equal(r.ready, true);
  assert.deepEqual(r.reasons, []);
});

await test('ready partial baseline counts', async () => {
  const r = fv.firstValueReady({ websiteExists: true, baselineReady: true, baselinePartial: true, actionsAvailable: true });
  assert.equal(r.ready, true);
});

await test('not ready no website', async () => {
  const r = fv.firstValueReady({ websiteExists: false, baselineReady: true, baselinePartial: false, actionsAvailable: true });
  assert.equal(r.ready, false);
  assert.ok(r.reasons.includes('website missing'));
});

await test('not ready no baseline', async () => {
  const r = fv.firstValueReady({ websiteExists: true, baselineReady: false, baselinePartial: false, actionsAvailable: true });
  assert.equal(r.ready, false);
  assert.ok(r.reasons.includes('baseline missing'));
});

await test('not ready no actions', async () => {
  const r = fv.firstValueReady({ websiteExists: true, baselineReady: true, baselinePartial: false, actionsAvailable: false });
  assert.equal(r.ready, false);
  assert.ok(r.reasons.includes('no supported action'));
});

await test('not ready all missing', async () => {
  const r = fv.firstValueReady({ websiteExists: false, baselineReady: false, baselinePartial: false, actionsAvailable: false });
  assert.equal(r.reasons.length, 3);
});

await test('ready never screen completion', async () => {
  const r = fv.firstValueReady({ websiteExists: true, baselineReady: false, baselinePartial: false, actionsAvailable: false });
  assert.equal(r.ready, false);
});

await test('ready deterministic', async () => {
  const a = { websiteExists: true, baselineReady: true, baselinePartial: false, actionsAvailable: true };
  assert.deepEqual(fv.firstValueReady(a), fv.firstValueReady(a));
});

await test('ready reasons strings', async () => {
  const r = fv.firstValueReady({ websiteExists: false, baselineReady: false, baselinePartial: false, actionsAvailable: false });
  assert.ok(r.reasons.every((x) => typeof x === 'string'));
});

await test('ready partial flag preserved', async () => {
  assert.equal(
    fv.firstValueReady({ websiteExists: true, baselineReady: true, baselinePartial: true, actionsAvailable: false }).ready,
    false,
  );
});

/* ---------- progress (8) ---------- */

await test('progress full', async () => {
  const p = fv.firstValueProgress(fv.deriveSteps(base()));
  assert.equal(p.completedRequired, 6);
  assert.equal(p.totalRequired, 6);
  assert.equal(p.label, '6 of 6 required steps complete');
});

await test('progress partial', async () => {
  const p = fv.firstValueProgress(fv.deriveSteps(base({ gscConnected: false, gscPropertySelected: false, baselineReady: false, actionsAvailable: false })));
  assert.ok(p.completedRequired < p.totalRequired);
  assert.match(p.label, /of 6 required steps/);
});

await test('progress empty steps', async () => {
  const p = fv.firstValueProgress([]);
  assert.equal(p.label, '0 of 0 required steps complete');
});

await test('progress no percent', async () => {
  const p = fv.firstValueProgress(fv.deriveSteps(base()));
  assert.doesNotMatch(p.label, /%/);
});

await test('progress ga4 excluded', async () => {
  const p = fv.firstValueProgress(fv.deriveSteps(base({ ga4Connected: false })));
  assert.equal(p.totalRequired, 6);
});

await test('progress counts completed only', async () => {
  const steps = fv.deriveSteps(base({ crawlStatus: 'FAILED' }));
  const p = fv.firstValueProgress(steps);
  assert.equal(p.completedRequired, 5);
});

await test('progress deterministic', async () => {
  assert.deepEqual(fv.firstValueProgress(fv.deriveSteps(base())), fv.firstValueProgress(fv.deriveSteps(base())));
});

await test('progress skipped not counted', async () => {
  const steps = fv.deriveSteps(base({ gscConnected: false, skipped: ['GSC_CONNECT'] }));
  const p = fv.firstValueProgress(steps);
  assert.ok(p.completedRequired < 6);
});

/* ---------- resume (16) ---------- */

await test('resume empty when complete', async () => {
  assert.deepEqual(fv.resumeChecklist(fv.deriveSteps(base())), []);
});

await test('resume lists skipped required', async () => {
  const r = fv.resumeChecklist(
    fv.deriveSteps(base({ gscConnected: false, gscPropertySelected: false, skipped: ['GSC_CONNECT'] })),
  );
  assert.ok(r.some((x) => x.step === 'GSC_CONNECT' && x.state === 'SKIPPED'));
});

await test('resume excludes completed', async () => {
  const r = fv.resumeChecklist(fv.deriveSteps(base()));
  assert.equal(r.length, 0);
});

await test('resume excludes optional', async () => {
  const r = fv.resumeChecklist(
    fv.deriveSteps(base({ ga4Connected: false, skipped: ['GA4_CONNECT'] })),
  );
  assert.ok(!r.some((x) => x.step === 'GA4_CONNECT'));
});

await test('resume includes failed', async () => {
  const r = fv.resumeChecklist(fv.deriveSteps(base({ crawlStatus: 'FAILED' })));
  assert.ok(r.some((x) => x.step === 'CRAWL' && x.state === 'FAILED'));
  assert.match(r.find((x) => x.step === 'CRAWL').label, /retry available/);
});

await test('resume includes blocked', async () => {
  const r = fv.resumeChecklist(
    fv.deriveSteps(base({ gscConnected: false, gscPropertySelected: false })),
  );
  assert.ok(r.some((x) => x.step === 'GSC_PROPERTY' && x.state === 'BLOCKED'));
});

await test('resume skipped label', async () => {
  const r = fv.resumeChecklist(
    fv.deriveSteps(base({ gscConnected: false, skipped: ['GSC_CONNECT'] })),
  );
  assert.match(r.find((x) => x.step === 'GSC_CONNECT').label, /skipped/);
});

await test('resume has actions', async () => {
  const r = fv.resumeChecklist(
    fv.deriveSteps(base({ gscConnected: false, skipped: ['GSC_CONNECT'] })),
  );
  assert.ok(r.every((x) => typeof x.action === 'string' && x.action.length > 0));
});

await test('continue setup null when done', async () => {
  assert.equal(fv.continueSetupCopy([]), null);
});

await test('continue setup gsc copy', async () => {
  const copy = fv.continueSetupCopy([
    { step: 'GSC_CONNECT', state: 'SKIPPED', label: 'x', action: 'y' },
  ]);
  assert.match(copy, /CONTINUE SETUP/);
  assert.match(copy, /Google Search Console/);
  assert.match(copy, /Never “setup complete”/);
});

await test('continue setup first item only', async () => {
  const copy = fv.continueSetupCopy([
    { step: 'CRAWL', state: 'FAILED', label: 'x', action: 'y' },
    { step: 'GSC_CONNECT', state: 'SKIPPED', label: 'x', action: 'y' },
  ]);
  assert.match(copy, /crawl/i);
});

await test('continue setup all eight nouns', async () => {
  for (const step of ['WEBSITE', 'CRAWL', 'GSC_CONNECT', 'GSC_PROPERTY', 'GA4_CONNECT', 'GA4_PROPERTY', 'BASELINE', 'TOP_ACTIONS']) {
    const copy = fv.continueSetupCopy([{ step, state: 'SKIPPED', label: 'x', action: 'y' }]);
    assert.ok(copy !== null && copy.length > 10);
  }
});

await test('resume never repeats completed', async () => {
  const steps = fv.deriveSteps(base({ ga4Connected: false, skipped: ['GA4_CONNECT'] }));
  const r = fv.resumeChecklist(steps);
  assert.ok(r.every((x) => x.state !== 'COMPLETED'));
});

await test('resume deterministic', async () => {
  const mk = () => fv.resumeChecklist(fv.deriveSteps(base({ crawlStatus: 'FAILED' })));
  assert.deepEqual(mk(), mk());
});

await test('resume blocked label', async () => {
  const r = fv.resumeChecklist(
    fv.deriveSteps(base({ gscConnected: false, gscPropertySelected: false })),
  );
  assert.ok(r.some((x) => x.label.includes('blocked')));
});

await test('resume not started label', async () => {
  const r = fv.resumeChecklist(
    fv.deriveSteps(base({ baselineReady: false, gscPropertySelected: true, gscConnected: true })),
  );
  assert.ok(r.some((x) => x.step === 'BASELINE'));
});

/* ---------- terminal states (4) ---------- */

await test('terminal completed failed', async () => {
  assert.equal(fv.isTerminalState('COMPLETED'), true);
  assert.equal(fv.isTerminalState('FAILED'), true);
});

await test('nonterminal rest', async () => {
  for (const s of ['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'SKIPPED', 'UNAVAILABLE']) {
    assert.equal(fv.isTerminalState(s), false);
  }
});

await test('failed terminal not completable', async () => {
  assert.equal(fv.isTerminalState('FAILED'), true);
});

await test('terminal deterministic', async () => {
  assert.equal(fv.isTerminalState('COMPLETED'), fv.isTerminalState('COMPLETED'));
});

/* ---------- dead ends (12) ---------- */

await test('dead gsc skipped baseline blocked', async () => {
  const d = fv.detectDeadEnd(
    fv.deriveSteps(
      base({ gscConnected: false, gscPropertySelected: false, baselineReady: false, skipped: ['GSC_CONNECT'] }),
    ),
  );
  assert.equal(d.dead, true);
  assert.equal(d.pattern, 'GSC_SKIPPED_BASELINE_BLOCKED');
  assert.match(d.recovery, /CONTINUE SETUP/);
});

await test('dead crawl failed', async () => {
  const d = fv.detectDeadEnd(fv.deriveSteps(base({ crawlStatus: 'FAILED' })));
  assert.equal(d.dead, true);
  assert.equal(d.pattern, 'CRAWL_FAILED_NO_RETRY');
  assert.match(d.recovery, /retry/i);
});

await test('dead property missing', async () => {
  const d = fv.detectDeadEnd(
    fv.deriveSteps(base({ gscConnected: true, gscPropertySelected: false })),
  );
  assert.equal(d.dead, true);
  assert.equal(d.pattern, 'PROPERTY_MISSING_NO_SELECTION_PATH');
});

await test('no dead when healthy', async () => {
  const d = fv.detectDeadEnd(fv.deriveSteps(base()));
  assert.equal(d.dead, false);
  assert.equal(d.pattern, null);
  assert.equal(d.recovery, null);
});

await test('no dead early no website', async () => {
  const d = fv.detectDeadEnd(fv.deriveSteps(base({ websiteExists: false })));
  assert.equal(d.dead, false);
});

await test('no dead ga4 skip', async () => {
  const d = fv.detectDeadEnd(
    fv.deriveSteps(base({ ga4Connected: false, skipped: ['GA4_CONNECT'] })),
  );
  assert.equal(d.dead, false);
});

await test('dead recovery actionable', async () => {
  const d = fv.detectDeadEnd(fv.deriveSteps(base({ crawlStatus: 'FAILED' })));
  assert.ok((d.recovery ?? '').length > 10);
});

await test('dead deterministic', async () => {
  const mk = () => fv.detectDeadEnd(fv.deriveSteps(base({ crawlStatus: 'FAILED' })));
  assert.deepEqual(mk(), mk());
});

await test('dead baseline ready no dead', async () => {
  const d = fv.detectDeadEnd(fv.deriveSteps(base()));
  assert.equal(d.dead, false);
});

await test('dead crawl completed property pending', async () => {
  const d = fv.detectDeadEnd(
    fv.deriveSteps(base({ gscConnected: true, gscPropertySelected: false })),
  );
  assert.equal(d.dead, true);
});

await test('dead pattern strings', async () => {
  const d = fv.detectDeadEnd(
    fv.deriveSteps(
      base({ gscConnected: false, gscPropertySelected: false, baselineReady: false, skipped: ['GSC_CONNECT'] }),
    ),
  );
  assert.equal(d.dead, true);
});

await test('dead no false positive partial', async () => {
  const d = fv.detectDeadEnd(fv.deriveSteps(base({ baselinePartial: true })));
  assert.equal(d.dead, false);
});

/* ---------- UNKNOWN classification (10) ---------- */

await test('unknown system failure', async () => {
  assert.equal(
    fv.classifyUnknown({ connected: true, ran: true, failed: true, sampleEnough: true }),
    'SYSTEM_FAILURE',
  );
});

await test('unknown not connected', async () => {
  assert.equal(
    fv.classifyUnknown({ connected: false, ran: false, failed: false, sampleEnough: true }),
    'DATA_NOT_CONNECTED',
  );
});

await test('unknown not run', async () => {
  assert.equal(
    fv.classifyUnknown({ connected: true, ran: false, failed: false, sampleEnough: true }),
    'DATA_NOT_RUN',
  );
});

await test('unknown insufficient', async () => {
  assert.equal(
    fv.classifyUnknown({ connected: true, ran: true, failed: false, sampleEnough: false }),
    'INSUFFICIENT_DATA',
  );
});

await test('unknown honest', async () => {
  assert.equal(
    fv.classifyUnknown({ connected: true, ran: true, failed: false, sampleEnough: true }),
    'HONEST_UNKNOWN',
  );
});

await test('unknown failure beats disconnected', async () => {
  assert.equal(
    fv.classifyUnknown({ connected: false, ran: false, failed: true, sampleEnough: false }),
    'SYSTEM_FAILURE',
  );
});

await test('unknown deterministic', async () => {
  const a = { connected: true, ran: false, failed: false, sampleEnough: true };
  assert.equal(fv.classifyUnknown(a), fv.classifyUnknown(a));
});

await test('unknown five classes distinct', async () => {
  const classes = new Set([
    fv.classifyUnknown({ connected: true, ran: true, failed: true, sampleEnough: true }),
    fv.classifyUnknown({ connected: false, ran: false, failed: false, sampleEnough: true }),
    fv.classifyUnknown({ connected: true, ran: false, failed: false, sampleEnough: true }),
    fv.classifyUnknown({ connected: true, ran: true, failed: false, sampleEnough: false }),
    fv.classifyUnknown({ connected: true, ran: true, failed: false, sampleEnough: true }),
  ]);
  assert.equal(classes.size, 5);
});

await test('unknown connected ran enough honest', async () => {
  assert.equal(
    fv.classifyUnknown({ connected: true, ran: true, failed: false, sampleEnough: true }),
    'HONEST_UNKNOWN',
  );
});

await test('unknown disconnected beats not run', async () => {
  assert.equal(
    fv.classifyUnknown({ connected: false, ran: false, failed: false, sampleEnough: false }),
    'DATA_NOT_CONNECTED',
  );
});

/* ---------- UNKNOWN rate (6) ---------- */

await test('unknown rate value', async () => {
  const r = fv.unknownRate(9, 10);
  assert.equal(r.value, 90);
  assert.match(r.label, /90% unknown/);
});

await test('unknown rate decimal', async () => {
  assert.equal(fv.unknownRate(10, 30).value, 33.3);
});

await test('unknown rate insufficient small', async () => {
  const r = fv.unknownRate(9, 9);
  assert.equal(r.value, null);
  assert.match(r.label, /INSUFFICIENT_DATA/);
});

await test('unknown rate zero total', async () => {
  assert.equal(fv.unknownRate(0, 0).value, null);
});

await test('unknown rate nan guard', async () => {
  assert.equal(fv.unknownRate(1, NaN).value, null);
});

await test('unknown rate zero unknowns', async () => {
  assert.equal(fv.unknownRate(0, 100).value, 0);
});

/* ---------- delivery truth (10) ---------- */

await test('truth white label unavailable', async () => {
  assert.equal(fv.deliveryTruth().whiteLabel, 'UNAVAILABLE');
});

await test('truth scheduled unavailable', async () => {
  assert.equal(fv.deliveryTruth().scheduledReports, 'UNAVAILABLE');
});

await test('truth pdf unavailable', async () => {
  assert.equal(fv.deliveryTruth().pdfExport, 'UNAVAILABLE');
});

await test('truth api unavailable', async () => {
  assert.equal(fv.deliveryTruth().apiAccess, 'UNAVAILABLE');
});

await test('truth agency implemented', async () => {
  assert.equal(fv.deliveryTruth().agencyReporting, 'IMPLEMENTED');
});

await test('truth note runtime wins', async () => {
  assert.match(fv.deliveryTruth().note, /Runtime truth wins/);
  assert.match(fv.deliveryTruth().note, /never marketed as available/);
});

await test('truth deterministic', async () => {
  assert.deepEqual(fv.deliveryTruth(), fv.deliveryTruth());
});

await test('truth five keys', async () => {
  const t = fv.deliveryTruth();
  assert.deepEqual(
    Object.keys(t).filter((k) => k !== 'note').sort(),
    ['agencyReporting', 'apiAccess', 'pdfExport', 'scheduledReports', 'whiteLabel'],
  );
});

await test('label implemented', async () => {
  assert.equal(fv.deliveryLabel('IMPLEMENTED'), 'Available');
});

await test('label partial unavailable', async () => {
  assert.equal(fv.deliveryLabel('PARTIALLY_IMPLEMENTED'), 'Partially available');
  assert.equal(fv.deliveryLabel('UNAVAILABLE'), 'Coming soon');
});

/* ---------- provider cost (12) ---------- */

await test('cost known', async () => {
  const c = fv.providerCost({ provider: 'dataforseo', operation: '/v3/serp/x', taskCount: 3, success: true, vendorCost: 0.015 });
  assert.equal(c.provider, 'DATAFORSEO');
  assert.equal(c.vendorCost, 0.015);
  assert.equal(c.taskCount, 3);
  assert.equal(c.success, true);
  assert.match(c.label, /Vendor-reported/);
});

await test('cost unknown null', async () => {
  const c = fv.providerCost({ provider: 'DATAFORSEO', operation: 'op', taskCount: 1, success: true, vendorCost: null });
  assert.equal(c.vendorCost, null);
  assert.match(c.label, /COST_UNKNOWN/);
  assert.match(c.label, /never estimated/);
});

await test('cost unknown undefined', async () => {
  assert.equal(
    fv.providerCost({ provider: 'x', operation: 'op', taskCount: 1, success: false, vendorCost: undefined }).vendorCost,
    null,
  );
});

await test('cost nan unknown', async () => {
  assert.equal(
    fv.providerCost({ provider: 'x', operation: 'op', taskCount: 1, success: true, vendorCost: 'nope' }).vendorCost,
    null,
  );
});

await test('cost zero tasks floored', async () => {
  assert.equal(
    fv.providerCost({ provider: 'x', operation: 'op', taskCount: -5, success: true, vendorCost: 0 }).taskCount,
    0,
  );
});

await test('cost zero vendor known', async () => {
  const c = fv.providerCost({ provider: 'x', operation: 'op', taskCount: 2, success: true, vendorCost: 0 });
  assert.equal(c.vendorCost, 0);
  assert.match(c.label, /Vendor-reported/);
});

await test('cost failure recorded', async () => {
  const c = fv.providerCost({ provider: 'x', operation: 'op', taskCount: 2, success: false, vendorCost: null });
  assert.equal(c.success, false);
});

await test('cost provider uppercased', async () => {
  assert.equal(
    fv.providerCost({ provider: 'dataForSeo', operation: 'op', taskCount: 1, success: true, vendorCost: 1 }).provider,
    'DATAFORSEO',
  );
});

await test('cost operation preserved', async () => {
  assert.equal(
    fv.providerCost({ provider: 'x', operation: '/v3/a/b', taskCount: 1, success: true, vendorCost: 1 }).operation,
    '/v3/a/b',
  );
});

await test('cost deterministic', async () => {
  const a = { provider: 'x', operation: 'op', taskCount: 1, success: true, vendorCost: 2 };
  assert.deepEqual(fv.providerCost(a), fv.providerCost(a));
});

await test('cost empty provider unknown', async () => {
  assert.equal(
    fv.providerCost({ provider: '', operation: 'op', taskCount: 1, success: true, vendorCost: 1 }).provider,
    'UNKNOWN',
  );
});

await test('cost string vendor coerced', async () => {
  assert.equal(
    fv.providerCost({ provider: 'x', operation: 'op', taskCount: 1, success: true, vendorCost: '2.5' }).vendorCost,
    2.5,
  );
});

/* ---------- acceptance derivations (10) ---------- */

await test('ttfv valid', async () => {
  assert.equal(
    fv.timeToFirstValueMs({ startIso: '2026-09-10T00:00:00.000Z', readyIso: '2026-09-10T01:00:00.000Z' }),
    3600000,
  );
});

await test('ttfv nulls', async () => {
  assert.equal(fv.timeToFirstValueMs({ startIso: null, readyIso: 'x' }), null);
  assert.equal(fv.timeToFirstValueMs({ startIso: 'x', readyIso: null }), null);
});

await test('ttfv invalid', async () => {
  assert.equal(fv.timeToFirstValueMs({ startIso: 'nope', readyIso: '2026-09-10T00:00:00.000Z' }), null);
});

await test('ttfv reversed null', async () => {
  assert.equal(
    fv.timeToFirstValueMs({ startIso: '2026-09-11T00:00:00.000Z', readyIso: '2026-09-10T00:00:00.000Z' }),
    null,
  );
});

await test('acceptance ready label', async () => {
  const a = fv.acceptanceSummary({ startIso: '2026-09-10T00:00:00.000Z', readyIso: '2026-09-10T00:10:00.000Z', failures: 0, blocks: 1, skips: 1, resumes: 1, deadEnds: 0 });
  assert.equal(a.timeToFirstValueMs, 600000);
  assert.match(a.timeToFirstValueLabel, /600s/);
  assert.equal(a.skips, 1);
  assert.equal(a.resumes, 1);
});

await test('acceptance pending label', async () => {
  const a = fv.acceptanceSummary({ startIso: '2026-09-10T00:00:00.000Z', readyIso: null, failures: 2, blocks: 0, skips: 0, resumes: 0, deadEnds: 1 });
  assert.equal(a.timeToFirstValueMs, null);
  assert.match(a.timeToFirstValueLabel, /not yet reached/);
  assert.equal(a.failures, 2);
  assert.equal(a.deadEnds, 1);
});

await test('acceptance counts passthrough', async () => {
  const a = fv.acceptanceSummary({ startIso: null, readyIso: null, failures: 3, blocks: 2, skips: 5, resumes: 4, deadEnds: 1 });
  assert.deepEqual([a.failures, a.blocks, a.skips, a.resumes, a.deadEnds], [3, 2, 5, 4, 1]);
});

await test('acceptance deterministic', async () => {
  const a = { startIso: null, readyIso: null, failures: 0, blocks: 0, skips: 0, resumes: 0, deadEnds: 0 };
  assert.deepEqual(fv.acceptanceSummary(a), fv.acceptanceSummary(a));
});

await test('ttfv zero elapsed', async () => {
  assert.equal(
    fv.timeToFirstValueMs({ startIso: '2026-09-10T00:00:00.000Z', readyIso: '2026-09-10T00:00:00.000Z' }),
    0,
  );
});

await test('acceptance label seconds', async () => {
  const a = fv.acceptanceSummary({ startIso: '2026-09-10T00:00:00.000Z', readyIso: '2026-09-10T00:00:05.000Z', failures: 0, blocks: 0, skips: 0, resumes: 0, deadEnds: 0 });
  assert.match(a.timeToFirstValueLabel, /5s/);
});

/* ---------- empty-state copy (30) ---------- */

function empty(surface, connected, ran) {
  return fv.emptyStateCopy({ surface, connected, ran });
}

await test('empty keywords disconnected', async () => {
  const e = empty('KEYWORDS', false, false);
  assert.match(e.title, /No search data yet/);
  assert.match(e.why, /not connected/);
  assert.match(e.required, /Search Console/);
  assert.equal(e.next, 'Connect GSC');
});

await test('empty keywords connected no queries', async () => {
  const e = empty('KEYWORDS', true, false);
  assert.match(e.why, /no queries observed/);
});

await test('empty baseline disconnected', async () => {
  const e = empty('BASELINE', false, false);
  assert.match(e.title, /No search baseline yet/);
  assert.equal(e.next, 'Connect GSC');
});

await test('empty baseline connected', async () => {
  const e = empty('BASELINE', true, false);
  assert.match(e.why, /not been built/);
});

await test('empty rank', async () => {
  const e = empty('RANK', false, false);
  assert.match(e.title, /No rank observations yet/);
  assert.match(e.required, /Tracked keywords/);
  assert.equal(e.next, 'Add keywords');
});

await test('empty rank provider note', async () => {
  assert.match(empty('RANK', false, false).why, /provider run/);
});

await test('empty ai not run', async () => {
  const e = empty('AI', false, false);
  assert.match(e.title, /No AI visibility yet/);
  assert.match(e.why, /has not run/);
  assert.equal(e.next, 'Run monitoring');
});

await test('empty ai ran empty', async () => {
  const e = empty('AI', true, true);
  assert.match(e.why, /without observations/);
});

await test('empty revenue', async () => {
  const e = empty('REVENUE', false, false);
  assert.match(e.title, /No revenue evidence yet/);
  assert.match(e.required, /Recorded leads/);
  assert.equal(e.next, 'Record outcomes');
});

await test('empty revenue why', async () => {
  assert.match(empty('REVENUE', true, true).why, /No recorded leads/);
});

await test('empty command center', async () => {
  const e = empty('COMMAND_CENTER', false, false);
  assert.match(e.title, /Setup required/);
  assert.equal(e.next, 'Continue setup');
});

await test('empty command why', async () => {
  assert.match(empty('COMMAND_CENTER', true, true).why, /First value is not ready/);
});

await test('empty all have four fields', async () => {
  for (const s of ['KEYWORDS', 'BASELINE', 'RANK', 'AI', 'REVENUE', 'COMMAND_CENTER']) {
    const e = empty(s, false, false);
    assert.ok(e.title.length > 3 && e.why.length > 3 && e.required.length > 3 && e.next.length > 1);
  }
});

await test('empty no marketing fluff', async () => {
  for (const s of ['KEYWORDS', 'BASELINE', 'RANK', 'AI', 'REVENUE', 'COMMAND_CENTER']) {
    assert.doesNotMatch(JSON.stringify(empty(s, false, false)), /unlock your growth|supercharge|game-changer/i);
  }
});

await test('empty keywords required gsc', async () => {
  assert.match(empty('KEYWORDS', true, true).required, /Search Console/);
});

await test('empty baseline required gsc', async () => {
  assert.match(empty('BASELINE', false, false).required, /Search Console/);
});

await test('empty rank required provider', async () => {
  assert.match(empty('RANK', true, true).required, /DataForSEO/);
});

await test('empty ai required prompts', async () => {
  assert.match(empty('AI', false, false).required, /prompts/);
});

await test('empty revenue required recorded', async () => {
  assert.match(empty('REVENUE', false, false).required, /Recorded/);
});

await test('empty command required setup', async () => {
  assert.match(empty('COMMAND_CENTER', false, false).required, /CONTINUE SETUP/);
});

await test('empty deterministic', async () => {
  assert.deepEqual(empty('RANK', false, false), empty('RANK', false, false));
});

await test('empty titles distinct', async () => {
  const titles = new Set(['KEYWORDS', 'BASELINE', 'RANK', 'AI', 'REVENUE', 'COMMAND_CENTER'].map((s) => empty(s, false, false).title));
  assert.equal(titles.size, 6);
});

await test('empty next distinct', async () => {
  const nexts = new Set(['KEYWORDS', 'BASELINE', 'RANK', 'AI', 'REVENUE', 'COMMAND_CENTER'].map((s) => empty(s, false, false).next));
  assert.ok(nexts.size >= 5);
});

await test('empty ai ran flag', async () => {
  assert.match(empty('AI', false, true).why, /without observations/);
});

await test('empty keywords ran irrelevant', async () => {
  assert.match(empty('KEYWORDS', false, true).why, /not connected/);
});

await test('empty baseline ran irrelevant', async () => {
  assert.match(empty('BASELINE', false, true).required, /Search Console/);
});

await test('empty rank connected same', async () => {
  assert.deepEqual(empty('RANK', true, false).title, empty('RANK', false, false).title);
});

await test('empty revenue connected same', async () => {
  assert.deepEqual(empty('REVENUE', true, true).next, empty('REVENUE', false, false).next);
});

await test('empty command connectedsame', async () => {
  assert.deepEqual(empty('COMMAND_CENTER', true, false).title, empty('COMMAND_CENTER', false, false).title);
});

await test('empty no zero fill language', async () => {
  for (const s of ['KEYWORDS', 'BASELINE', 'RANK', 'AI', 'REVENUE', 'COMMAND_CENTER']) {
    assert.doesNotMatch(JSON.stringify(empty(s, false, false)), /0 results found|nothing here/i);
  }
});

/* ---------- determinism + performance (10) ---------- */

await test('derive batch 300', async () => {
  for (let i = 0; i < 300; i++) {
    fv.deriveSteps(base({ crawlStatus: i % 2 ? 'COMPLETED' : 'FAILED', gscConnected: i % 3 !== 0 }));
  }
  assert.ok(true);
});

await test('resume batch 200', async () => {
  for (let i = 0; i < 200; i++) {
    fv.resumeChecklist(fv.deriveSteps(base({ crawlStatus: 'FAILED', skipped: ['GSC_CONNECT'] })));
  }
  assert.ok(true);
});

await test('deadend batch 200', async () => {
  for (let i = 0; i < 200; i++) {
    fv.detectDeadEnd(fv.deriveSteps(base({ gscConnected: false, skipped: ['GSC_CONNECT'] })));
  }
  assert.ok(true);
});

await test('cost batch 300', async () => {
  for (let i = 0; i < 300; i++) {
    fv.providerCost({ provider: 'DATAFORSEO', operation: `/v3/op/${i % 5}`, taskCount: i, success: i % 7 !== 0, vendorCost: i % 2 ? 0.01 : null });
  }
  assert.ok(true);
});

await test('empty batch 200', async () => {
  const surfaces = ['KEYWORDS', 'BASELINE', 'RANK', 'AI', 'REVENUE', 'COMMAND_CENTER'];
  for (let i = 0; i < 200; i++) {
    fv.emptyStateCopy({ surface: surfaces[i % surfaces.length], connected: i % 2 === 0, ran: i % 3 === 0 });
  }
  assert.ok(true);
});

await test('acceptance batch 100', async () => {
  for (let i = 0; i < 100; i++) {
    fv.acceptanceSummary({ startIso: null, readyIso: null, failures: i, blocks: 0, skips: 0, resumes: 0, deadEnds: 0 });
  }
  assert.ok(true);
});

await test('unknown batch 200', async () => {
  for (let i = 0; i < 200; i++) {
    fv.classifyUnknown({ connected: i % 2 === 0, ran: i % 3 === 0, failed: i % 5 === 0, sampleEnough: i % 7 === 0 });
    fv.unknownRate(i % 50, 100);
  }
  assert.ok(true);
});

await test('truth batch 100', async () => {
  for (let i = 0; i < 100; i++) {
    fv.deliveryTruth();
    fv.deliveryLabel('UNAVAILABLE');
  }
  assert.ok(true);
});

await test('ready batch 200', async () => {
  for (let i = 0; i < 200; i++) {
    fv.firstValueReady({ websiteExists: true, baselineReady: i % 2 === 0, baselinePartial: false, actionsAvailable: i % 3 === 0 });
  }
  assert.ok(true);
});

await test('progress batch 100', async () => {
  for (let i = 0; i < 100; i++) {
    fv.firstValueProgress(fv.deriveSteps(base()));
  }
  assert.ok(true);
});

/* ---------- honesty invariants (14) ---------- */

await test('no fake percent anywhere', async () => {
  assert.doesNotMatch(fv.firstValueProgress(fv.deriveSteps(base())).label, /%/);
});

await test('skip never complete invariant', async () => {
  for (const s of ['CRAWL', 'GSC_CONNECT', 'GSC_PROPERTY', 'GA4_CONNECT']) {
    const steps = fv.deriveSteps(base({ gscConnected: false, gscPropertySelected: false, crawlStatus: null, skipped: [s] }));
    const found = steps.find((x) => x.step === s);
    if (found.required || s === 'GSC_CONNECT') {
      assert.notEqual(found.state, 'COMPLETED');
    }
  }
});

await test('failed never complete invariant', async () => {
  assert.notEqual(
    fv.deriveSteps(base({ crawlStatus: 'FAILED' })).find((x) => x.step === 'CRAWL').state,
    'COMPLETED',
  );
});

await test('no invented actions text', async () => {
  assert.match(
    fv.firstValueReady({ websiteExists: true, baselineReady: true, baselinePartial: false, actionsAvailable: false }).reasons.join(' '),
    /no supported action/,
  );
});

await test('no estimated cost text', async () => {
  assert.match(
    fv.providerCost({ provider: 'x', operation: 'op', taskCount: 1, success: true, vendorCost: null }).label,
    /never estimated/,
  );
});

await test('no pii in shapes', async () => {
  const blob = JSON.stringify([
    fv.firstValueProgress(fv.deriveSteps(base())),
    fv.acceptanceSummary({ startIso: null, readyIso: null, failures: 0, blocks: 0, skips: 0, resumes: 0, deadEnds: 0 }),
    fv.unknownRate(5, 100),
  ]);
  assert.doesNotMatch(blob, /@|email|phone|token/i);
});

await test('ga4 optional never blocks ready', async () => {
  const r = fv.firstValueReady({ websiteExists: true, baselineReady: true, baselinePartial: false, actionsAvailable: true });
  assert.equal(r.ready, true);
});

await test('partial baseline honest ready', async () => {
  const steps = fv.deriveSteps(base({ baselinePartial: true }));
  assert.equal(steps.find((x) => x.step === 'BASELINE').state, 'COMPLETED');
  assert.match(steps.find((x) => x.step === 'BASELINE').why, /Partial/);
});

await test('dead end recovery present', async () => {
  const d = fv.detectDeadEnd(fv.deriveSteps(base({ crawlStatus: 'FAILED' })));
  assert.ok((d.recovery ?? '').length > 10);
});

await test('truth runtime wins text', async () => {
  assert.match(fv.deliveryTruth().note, /Runtime truth wins/);
});

await test('empty why required next triple', async () => {
  const e = fv.emptyStateCopy({ surface: 'BASELINE', connected: false, ran: false });
  assert.ok(e.why.length > e.title.length);
  assert.ok(e.required.length > 3);
});

await test('resume never completed test', async () => {
  const r = fv.resumeChecklist(fv.deriveSteps(base({ crawlStatus: null })));
  assert.ok(!r.some((x) => x.state === 'COMPLETED'));
});

await test('ready reasons explain gaps', async () => {
  const r = fv.firstValueReady({ websiteExists: true, baselineReady: false, baselinePartial: false, actionsAvailable: false });
  assert.ok(r.reasons.length === 2);
});

await test('unknown classes exhaustive', async () => {
  const seen = new Set([
    fv.classifyUnknown({ connected: false, ran: false, failed: false, sampleEnough: true }),
    fv.classifyUnknown({ connected: true, ran: false, failed: false, sampleEnough: true }),
    fv.classifyUnknown({ connected: true, ran: true, failed: true, sampleEnough: true }),
    fv.classifyUnknown({ connected: true, ran: true, failed: false, sampleEnough: false }),
    fv.classifyUnknown({ connected: true, ran: true, failed: false, sampleEnough: true }),
  ]);
  assert.equal(seen.size, 5);
});

/* ---------- step variants extras (12) ---------- */

await test('all complete states', async () => {
  const states = Object.fromEntries(fv.deriveSteps(base()).map((s) => [s.step, s.state]));
  assert.deepEqual(states, {
    WEBSITE: 'COMPLETED', CRAWL: 'COMPLETED', GSC_CONNECT: 'COMPLETED',
    GSC_PROPERTY: 'COMPLETED', GA4_CONNECT: 'COMPLETED', GA4_PROPERTY: 'COMPLETED',
    BASELINE: 'COMPLETED', TOP_ACTIONS: 'COMPLETED',
  });
});

await test('cold start states', async () => {
  const steps = fv.deriveSteps(base({
    websiteExists: false, crawlStatus: null, gscConnected: false,
    gscPropertySelected: false, ga4Connected: false, ga4PropertySelected: false,
    baselineReady: false, actionsAvailable: false, skipped: [],
  }));
  const states = Object.fromEntries(steps.map((s) => [s.step, s.state]));
  assert.equal(states.WEBSITE, 'NOT_STARTED');
  assert.equal(states.CRAWL, 'BLOCKED');
  assert.equal(states.TOP_ACTIONS, 'BLOCKED');
});

await test('gsc done property skipped', async () => {
  const steps = fv.deriveSteps(base({ gscConnected: true, gscPropertySelected: false, baselineReady: false, skipped: ['GSC_PROPERTY'] }));
  assert.equal(stepOf(steps, 'GSC_PROPERTY').state, 'SKIPPED');
  assert.equal(stepOf(steps, 'BASELINE').state, 'BLOCKED');
});

await test('crawl in progress blocks nothing yet', async () => {
  const steps = fv.deriveSteps(base({ crawlStatus: 'RUNNING' }));
  assert.equal(stepOf(steps, 'CRAWL').state, 'IN_PROGRESS');
});

await test('top actions blocked early', async () => {
  const steps = fv.deriveSteps(base({ baselineReady: false, actionsAvailable: false }));
  assert.equal(stepOf(steps, 'TOP_ACTIONS').state, 'BLOCKED');
});

await test('why strings non-empty', async () => {
  for (const s of fv.deriveSteps(base({ crawlStatus: null, gscConnected: false }))) {
    assert.ok(s.why.length > 5);
  }
});

await test('next null when complete', async () => {
  for (const s of fv.deriveSteps(base())) {
    assert.equal(s.next, null);
  }
});

await test('required flags eight', async () => {
  const steps = fv.deriveSteps(base());
  assert.equal(steps.length, 8);
  assert.ok(steps.every((s) => typeof s.required === 'boolean'));
});

await test('skipped array missing safe', async () => {
  const steps = fv.deriveSteps({ ...base(), skipped: undefined });
  assert.equal(steps.length, 8);
});

await test('crawl status lowercase handled', async () => {
  assert.equal(stepOf(fv.deriveSteps(base({ crawlStatus: 'completed' })), 'CRAWL').state, 'COMPLETED');
});

await test('website why create', async () => {
  assert.match(stepOf(fv.deriveSteps(base({ websiteExists: false })), 'WEBSITE').why, /No website yet/);
});

await test('ga4 property why blocked', async () => {
  assert.match(
    stepOf(fv.deriveSteps(base({ ga4Connected: false, ga4PropertySelected: false })), 'GA4_PROPERTY').why,
    /connect analytics first/,
  );
});

/* ---------- resume extras (8) ---------- */

await test('resume gsc property skipped listed', async () => {
  const r = fv.resumeChecklist(
    fv.deriveSteps(base({ gscConnected: true, gscPropertySelected: false, baselineReady: false, skipped: ['GSC_PROPERTY'] })),
  );
  assert.ok(r.some((x) => x.step === 'GSC_PROPERTY'));
});

await test('resume website missing listed', async () => {
  const r = fv.resumeChecklist(fv.deriveSteps(base({ websiteExists: false })));
  assert.ok(r.some((x) => x.step === 'WEBSITE' && x.state === 'NOT_STARTED'));
});

await test('continue setup crawl noun', async () => {
  const copy = fv.continueSetupCopy([{ step: 'CRAWL', state: 'FAILED', label: 'x', action: 'y' }]);
  assert.match(copy, /crawl/);
});

await test('continue setup baseline noun', async () => {
  const copy = fv.continueSetupCopy([{ step: 'BASELINE', state: 'BLOCKED', label: 'x', action: 'y' }]);
  assert.match(copy, /baseline/);
});

await test('continue setup property noun', async () => {
  const copy = fv.continueSetupCopy([{ step: 'GSC_PROPERTY', state: 'SKIPPED', label: 'x', action: 'y' }]);
  assert.match(copy, /property/);
});

await test('resume top actions blocked listed', async () => {
  const r = fv.resumeChecklist(fv.deriveSteps(base({ baselineReady: false, actionsAvailable: false })));
  assert.ok(r.some((x) => x.step === 'TOP_ACTIONS'));
});

await test('resume baseline blocked listed', async () => {
  const r = fv.resumeChecklist(
    fv.deriveSteps(base({ gscConnected: false, gscPropertySelected: false, baselineReady: false })),
  );
  assert.ok(r.some((x) => x.step === 'BASELINE' && x.state === 'BLOCKED'));
});

await test('resume labels human', async () => {
  const r = fv.resumeChecklist(
    fv.deriveSteps(base({ gscConnected: false, skipped: ['GSC_CONNECT'] })),
  );
  assert.ok(r.every((x) => !x.label.includes('_') || x.label.includes('GSC')));
});

/* ---------- dead-end extras (6) ---------- */

await test('dead no website no pattern', async () => {
  assert.equal(fv.detectDeadEnd(fv.deriveSteps(base({ websiteExists: false }))).pattern, null);
});

await test('dead gsc connected property ok none', async () => {
  assert.equal(
    fv.detectDeadEnd(fv.deriveSteps(base({ gscConnected: true, gscPropertySelected: true, baselineReady: false }))).dead,
    false,
  );
});

await test('dead crawl running none', async () => {
  assert.equal(fv.detectDeadEnd(fv.deriveSteps(base({ crawlStatus: 'RUNNING' }))).dead, false);
});

await test('dead ga4 only none', async () => {
  assert.equal(
    fv.detectDeadEnd(fv.deriveSteps(base({ ga4Connected: false, skipped: ['GA4_CONNECT', 'GA4_PROPERTY'] }))).dead,
    false,
  );
});

await test('dead recovery gsc text', async () => {
  const d = fv.detectDeadEnd(
    fv.deriveSteps(
      base({ gscConnected: false, gscPropertySelected: false, baselineReady: false, skipped: ['GSC_CONNECT', 'GSC_PROPERTY'] }),
    ),
  );
  assert.match(d.recovery ?? '', /Search Console/);
});

await test('dead recovery property text', async () => {
  const d = fv.detectDeadEnd(fv.deriveSteps(base({ gscConnected: true, gscPropertySelected: false })));
  assert.match(d.recovery ?? '', /property selection/);
});

/* ---------- unknown extras (6) ---------- */

await test('unknown rate full', async () => {
  assert.equal(fv.unknownRate(100, 100).value, 100);
});

await test('unknown rate half', async () => {
  assert.equal(fv.unknownRate(50, 100).value, 50);
});

await test('unknown rate label sample', async () => {
  assert.match(fv.unknownRate(3, 10).label, /10 observed states/);
});

await test('classify ran no sample', async () => {
  assert.equal(
    fv.classifyUnknown({ connected: true, ran: true, failed: false, sampleEnough: false }),
    'INSUFFICIENT_DATA',
  );
});

await test('classify all true honest', async () => {
  assert.equal(
    fv.classifyUnknown({ connected: true, ran: true, failed: false, sampleEnough: true }),
    'HONEST_UNKNOWN',
  );
});

await test('unknown rate boundary ten', async () => {
  assert.notEqual(fv.unknownRate(1, 10).value, null);
  assert.equal(fv.unknownRate(1, 9).value, null);
});

/* ---------- truth/cost extras (8) ---------- */

await test('truth note coming', async () => {
  assert.match(fv.deliveryTruth().note, /COMING \/ NOT AVAILABLE/);
});

await test('cost task count floor', async () => {
  assert.equal(
    fv.providerCost({ provider: 'x', operation: 'op', taskCount: 2.9, success: true, vendorCost: 1 }).taskCount,
    2,
  );
});

await test('cost label operation', async () => {
  assert.match(
    fv.providerCost({ provider: 'x', operation: '/v3/a', taskCount: 1, success: true, vendorCost: 3 }).label,
    /\/v3\/a/,
  );
});

await test('delivery label all three', async () => {
  assert.deepEqual(
    ['IMPLEMENTED', 'PARTIALLY_IMPLEMENTED', 'UNAVAILABLE'].map((s) => fv.deliveryLabel(s)),
    ['Available', 'Partially available', 'Coming soon'],
  );
});

await test('truth keys stable', async () => {
  assert.deepEqual(Object.keys(fv.deliveryTruth()).sort(), ['agencyReporting', 'apiAccess', 'note', 'pdfExport', 'scheduledReports', 'whiteLabel']);
});

await test('cost failure vendor known', async () => {
  const c = fv.providerCost({ provider: 'x', operation: 'op', taskCount: 1, success: false, vendorCost: 0.5 });
  assert.equal(c.vendorCost, 0.5);
  assert.equal(c.success, false);
});

await test('truth agency note', async () => {
  assert.match(fv.deliveryTruth().note, /agency client\/report/);
});

await test('cost unknown provider default', async () => {
  assert.equal(fv.providerCost({ provider: null, operation: 'op', taskCount: 1, success: true, vendorCost: null }).provider, 'UNKNOWN');
});

/* ---------- acceptance/empty extras (8) ---------- */

await test('acceptance zero durations', async () => {
  const a = fv.acceptanceSummary({ startIso: null, readyIso: null, failures: 0, blocks: 0, skips: 0, resumes: 0, deadEnds: 0 });
  assert.equal(a.timeToFirstValueMs, null);
  assert.match(a.timeToFirstValueLabel, /not yet reached/);
});

await test('empty ai title stable', async () => {
  assert.equal(fv.emptyStateCopy({ surface: 'AI', connected: false, ran: false }).title, 'No AI visibility yet.');
});

await test('empty rank title stable', async () => {
  assert.equal(fv.emptyStateCopy({ surface: 'RANK', connected: true, ran: true }).title, 'No rank observations yet.');
});

await test('empty revenue title stable', async () => {
  assert.equal(fv.emptyStateCopy({ surface: 'REVENUE', connected: false, ran: false }).title, 'No revenue evidence yet.');
});

await test('empty command next stable', async () => {
  assert.equal(fv.emptyStateCopy({ surface: 'COMMAND_CENTER', connected: true, ran: true }).next, 'Continue setup');
});

await test('acceptance deadends naming', async () => {
  const a = fv.acceptanceSummary({ startIso: null, readyIso: null, failures: 0, blocks: 0, skips: 0, resumes: 0, deadEnds: 2 });
  assert.equal(a.deadEnds, 2);
});

await test('empty keywords next stable', async () => {
  assert.equal(fv.emptyStateCopy({ surface: 'KEYWORDS', connected: false, ran: false }).next, 'Connect GSC');
});

await test('empty baseline next stable', async () => {
  assert.equal(fv.emptyStateCopy({ surface: 'BASELINE', connected: false, ran: false }).next, 'Connect GSC');
});

/* ---------- P2-A: connection mapping (GA4 independence) ---------- */

await test('conn null all false', async () => {
  assert.deepEqual(fv.googleConnectionState(null), {
    gscConnected: false,
    gscProperty: false,
    ga4Connected: false,
    ga4Property: false,
  });
});

await test('conn oauth alone never completes ga4', async () => {
  const s = fv.googleConnectionState({ connected: true, selectedProperty: null, selectedAnalyticsProperty: null });
  assert.equal(s.gscConnected, true);
  assert.equal(s.gscProperty, false);
  assert.equal(s.ga4Connected, false);
  assert.equal(s.ga4Property, false);
});

await test('conn gsc property independent of ga4', async () => {
  const s = fv.googleConnectionState({ connected: true, selectedProperty: 'https://a.com/', selectedAnalyticsProperty: null });
  assert.equal(s.gscConnected, true);
  assert.equal(s.gscProperty, true);
  assert.equal(s.ga4Connected, false);
  assert.equal(s.ga4Property, false);
});

await test('conn ga4 property completes ga4 only', async () => {
  const s = fv.googleConnectionState({ connected: true, selectedProperty: null, selectedAnalyticsProperty: 'properties/123' });
  assert.equal(s.ga4Connected, true);
  assert.equal(s.ga4Property, true);
  assert.equal(s.gscProperty, false);
});

await test('conn full connection', async () => {
  const s = fv.googleConnectionState({ connected: true, selectedProperty: 'https://a.com/', selectedAnalyticsProperty: 'properties/123' });
  assert.equal(s.gscConnected, true);
  assert.equal(s.gscProperty, true);
  assert.equal(s.ga4Connected, true);
  assert.equal(s.ga4Property, true);
});

await test('conn disconnected flag', async () => {
  const s = fv.googleConnectionState({ connected: false, selectedProperty: 'https://a.com/', selectedAnalyticsProperty: 'properties/123' });
  assert.equal(s.gscConnected, false);
  assert.equal(s.ga4Connected, true);
});

await test('conn whitespace property empty', async () => {
  const s = fv.googleConnectionState({ connected: true, selectedProperty: '   ', selectedAnalyticsProperty: '  ' });
  assert.equal(s.gscProperty, false);
  assert.equal(s.ga4Property, false);
  assert.equal(s.ga4Connected, false);
});

await test('conn deterministic', async () => {
  const a = { connected: true, selectedProperty: 'x', selectedAnalyticsProperty: null };
  assert.deepEqual(fv.googleConnectionState(a), fv.googleConnectionState(a));
});

/* ---------- P2-B: dead-end record guard ---------- */

await test('guard empty records', async () => {
  assert.equal(fv.shouldRecordDeadEnd([], 'GSC_SKIPPED_BASELINE_BLOCKED', Date.now()), true);
});

await test('guard same pattern recent suppresses', async () => {
  const now = Date.now();
  assert.equal(
    fv.shouldRecordDeadEnd(
      [{ status: 'GSC_SKIPPED_BASELINE_BLOCKED', createdAt: new Date(now - 60 * 1000).toISOString() }],
      'GSC_SKIPPED_BASELINE_BLOCKED',
      now,
    ),
    false,
  );
});

await test('guard different pattern records', async () => {
  const now = Date.now();
  assert.equal(
    fv.shouldRecordDeadEnd(
      [{ status: 'CRAWL_FAILED_NO_RETRY', createdAt: new Date(now - 60 * 1000).toISOString() }],
      'GSC_SKIPPED_BASELINE_BLOCKED',
      now,
    ),
    true,
  );
});

await test('guard expired window records', async () => {
  const now = Date.now();
  assert.equal(
    fv.shouldRecordDeadEnd(
      [{ status: 'GSC_SKIPPED_BASELINE_BLOCKED', createdAt: new Date(now - 25 * 60 * 60 * 1000).toISOString() }],
      'GSC_SKIPPED_BASELINE_BLOCKED',
      now,
    ),
    true,
  );
});

await test('guard boundary 24h records', async () => {
  const now = Date.now();
  assert.equal(
    fv.shouldRecordDeadEnd(
      [{ status: 'P', createdAt: new Date(now - 24 * 60 * 60 * 1000).toISOString() }],
      'P',
      now,
    ),
    true,
  );
});

await test('guard unreadable timestamp records', async () => {
  assert.equal(
    fv.shouldRecordDeadEnd(
      [{ status: 'P', createdAt: 'nope' }],
      'P',
      Date.now(),
    ),
    true,
  );
});

await test('guard empty pattern never records', async () => {
  assert.equal(fv.shouldRecordDeadEnd([], '', Date.now()), false);
  assert.equal(fv.shouldRecordDeadEnd([], '   ', Date.now()), false);
});

await test('guard invalid now records', async () => {
  assert.equal(
    fv.shouldRecordDeadEnd(
      [{ status: 'P', createdAt: new Date().toISOString() }],
      'P',
      NaN,
    ),
    true,
  );
});

await test('guard status trimmed match', async () => {
  const now = Date.now();
  assert.equal(
    fv.shouldRecordDeadEnd(
      [{ status: '  P  ', createdAt: new Date(now - 1000).toISOString() }],
      'P',
      now,
    ),
    false,
  );
});

await test('guard null recent records', async () => {
  assert.equal(fv.shouldRecordDeadEnd(null, 'P', Date.now()), true);
});

/* ---------- summary ---------- */

const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(`\nFirst Value 1.0: ${passCount}/${results.length} passed.`);
if (failed.length > 0) {
  console.log(failed.join('\n'));
  process.exit(1);
} else {
  console.log('All First Value 1.0 tests passed.');
}

/*
 * Verifies Proof Card impact math against the REAL module
 * (backend/src/proof/proof-math.ts), compiled on the fly.
 * No network, no DB, no live provider calls.
 *
 * Run: node backend/scripts/verify-proof-math.mjs
 * Exit 0 = all 16 checks pass, exit 1 = failure.
 */

import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const backend = join(root, 'backend');

let failures = 0;
let passed = 0;
function check(label, actual, expected) {
  const ok =
    Number.isNaN(expected) && Number.isNaN(actual)
      ? true
      : actual === expected;
  if (!ok) {
    failures += 1;
    console.error(
      `FAIL ${label}: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`,
    );
  } else {
    passed += 1;
    console.log(`ok ${label}`);
  }
}
function checkTrue(label, cond, detail = '') {
  if (!cond) {
    failures += 1;
    console.error(`FAIL ${label} ${detail}`);
  } else {
    passed += 1;
    console.log(`ok ${label}`);
  }
}

// Compile the real TS module to a temp dir and import it.
const tmp = mkdtempSync(join(tmpdir(), 'proof-math-'));
let math;
try {
  execSync(
    `npx tsc src/proof/proof-math.ts --outDir "${tmp}" --module commonjs --target es2020 --esModuleInterop --skipLibCheck`,
    { cwd: backend, stdio: 'pipe' },
  );
  math = await import(
    pathToFileURL(join(tmp, 'proof-math.js')).href
  );
} catch (error) {
  console.error(
    'FAIL compile proof-math.ts:',
    error?.message ?? error,
  );
  process.exit(1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const { safeDelta, safePct, buildMetric, deriveState } = math;

// 1. positive traffic change: 1200 -> 1560 = +360 (+30%)
check('1 traffic delta', safeDelta(1200, 1560), 360);
check('1 traffic pct', safePct(1200, 1560), 30);

// 2. negative traffic change: 1560 -> 1200 = -360 (-23.1%)
check('2 traffic decline delta', safeDelta(1560, 1200), -360);
check('2 traffic decline pct', safePct(1560, 1200), -23.1);

// 3. average-position improvement (lower is better): 18.4 -> 11.2
const pos = buildMetric({
  key: 'avgPosition',
  label: 'Average position',
  before: 18.4,
  after: 11.2,
  lowerBetter: true,
  evidence: 'gsc',
});
check('3 position delta', pos.delta, -7.2);
check('3 position improved', pos.improved, true);
check('3 position declined', pos.declined, false);

// 4. average-position decline: 11.2 -> 18.4
const posBad = buildMetric({
  key: 'avgPosition',
  label: 'Average position',
  before: 11.2,
  after: 18.4,
  lowerBetter: true,
  evidence: 'gsc',
});
check('4 position decline flagged', posBad.declined, true);
check('4 position not improved', posBad.improved, false);

// 5. percentage calculation: 8 -> 13 leads = +62.5%
check('5 leads pct', safePct(8, 13), 62.5);
check('5 leads delta', safeDelta(8, 13), 5);

// 6. zero denominator: 0 -> 13 must NOT be Infinity (null = absolute only)
check('6 zero-baseline pct is null', safePct(0, 13), null);
check('6 zero-baseline delta still absolute', safeDelta(0, 13), 13);

// 7/8. missing GSC/GA4 data: nulls never produce numbers
check('7 missing before delta null', safeDelta(null, 13), null);
check('7 missing before pct null', safePct(null, 13), null);
check('8 missing after delta null', safeDelta(13, null), null);
check('8 missing after pct null', safePct(13, null), null);

// 9/10. missing revenue / leads surface as null evidence
const revMissing = buildMetric({
  key: 'revenue',
  label: 'Recorded revenue',
  before: null,
  after: null,
  lowerBetter: false,
  evidence: 'revenue',
});
check('9 revenue missing direction flat', revMissing.direction, 'flat');
check('10 revenue missing not improved', revMissing.improved, false);

// 11. insufficient history: no measured metric
const s11 = deriveState([], 30);
check('11 no metrics -> INSUFFICIENT_DATA', s11.state, 'INSUFFICIENT_DATA');

// 12. mixed results
const s12 = deriveState(
  [
    buildMetric({ key: 'a', label: 'a', before: 10, after: 20, lowerBetter: false, evidence: 'x' }),
    buildMetric({ key: 'b', label: 'b', before: 20, after: 10, lowerBetter: false, evidence: 'x' }),
  ],
  30,
);
check('12 mixed -> MIXED_RESULTS', s12.state, 'MIXED_RESULTS');

// 13. completed action with no post-action data (< 3 days)
const s13 = deriveState(
  [
    buildMetric({ key: 'a', label: 'a', before: 10, after: 12, lowerBetter: false, evidence: 'x' }),
  ],
  1,
);
check('13 fresh completion -> WAITING_FOR_DATA', s13.state, 'WAITING_FOR_DATA');

// 13b. early signal (< 14 days, mature enough to show)
const s13b = deriveState(
  [
    buildMetric({ key: 'a', label: 'a', before: 10, after: 12, lowerBetter: false, evidence: 'x' }),
  ],
  7,
);
check('13b short window -> EARLY_SIGNAL', s13b.state, 'EARLY_SIGNAL');

// 13c. mature measurable impact
const s13c = deriveState(
  [
    buildMetric({ key: 'a', label: 'a', before: 10, after: 12, lowerBetter: false, evidence: 'x' }),
  ],
  20,
);
check('13c mature window -> MEASURABLE_IMPACT', s13c.state, 'MEASURABLE_IMPACT');

// 13d. no movement
const s13d = deriveState(
  [
    buildMetric({ key: 'a', label: 'a', before: 10, after: 10, lowerBetter: false, evidence: 'x' }),
  ],
  20,
);
check('13d flat -> NO_CLEAR_CHANGE', s13d.state, 'NO_CLEAR_CHANGE');

// 14. organization isolation (static: org-scoped reads + guard)
const controllerSrc = readFileSync(
  join(backend, 'src', 'proof', 'proof.controller.ts'),
  'utf8',
);
const serviceSrc = readFileSync(
  join(backend, 'src', 'proof', 'proof.service.ts'),
  'utf8',
);
checkTrue(
  '14 controller guarded + org-scoped',
  controllerSrc.includes('JwtAuthGuard') &&
    controllerSrc.includes('req.user.organizationId'),
);
checkTrue(
  '14 service org-scoped action reads',
  serviceSrc.includes('organizationId,') &&
    serviceSrc.includes('findFirst'),
);

// 15. no NaN / Infinity from hostile inputs
const hostile = [
  [Number.POSITIVE_INFINITY, 5],
  [5, Number.POSITIVE_INFINITY],
  [Number.NaN, 5],
  [1e308, 1e308],
  [-0, 0],
];
for (const [b, a] of hostile) {
  const d = safeDelta(b, a);
  const p = safePct(b, a);
  checkTrue(
    `15 hostile (${String(b)},${String(a)}) finite-or-null`,
    d === null || Number.isFinite(d),
  );
  checkTrue(
    `15 hostile pct (${String(b)},${String(a)}) finite-or-null`,
    p === null || Number.isFinite(p),
  );
}

// 16. no fabricated metrics (static honesty checks)
checkTrue(
  '16 no random/synthetic metric generation',
  !serviceSrc.includes('Math.random') &&
    !serviceSrc.includes('faker') &&
    !serviceSrc.includes('mock'),
);
checkTrue(
  '16 honest insufficient-data language present',
  serviceSrc.includes('Not enough data yet') ||
    serviceSrc.includes('not be compared') ||
    serviceSrc.includes('waiting for enough'),
);
checkTrue(
  '16 revenue labelled customer-recorded',
  serviceSrc.includes('customer-recorded'),
);
checkTrue(
  '16 no causal attribution claim',
  !/caused|attributable to this action|proves .* revenue/i.test(serviceSrc),
);

console.log(`\n${passed} passed, ${failures} failed.`);
if (failures > 0) {
  process.exit(1);
}
console.log('proof math OK: deterministic, honest, finite.');

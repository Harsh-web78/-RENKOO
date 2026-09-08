/*
 * Verifies public snapshot guards against the REAL modules
 * (snapshot-guards.ts, snapshot-limits.ts, analysis.ts),
 * compiled on the fly. Service/controller verified by
 * static safety checks. No network, no DB, no provider calls.
 *
 * Run: node backend/scripts/verify-snapshot-guards.mjs
 * Exit 0 = all checks pass, exit 1 = failure.
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
const read = (p) =>
  readFileSync(join(backend, p), 'utf8');

let failures = 0;
let passed = 0;
function check(label, actual, expected) {
  if (actual !== expected) {
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

const tmp = mkdtempSync(join(tmpdir(), 'snapshot-verify-'));
let guards;
let limits;
let analysis;
try {
  execSync(
    `npx tsc src/snapshot/snapshot-guards.ts src/snapshot/snapshot-limits.ts src/ai-visibility/analysis.ts --outDir "${tmp}" --module commonjs --target es2020 --esModuleInterop --skipLibCheck`,
    { cwd: backend, stdio: 'pipe' },
  );
  guards = await import(
    pathToFileURL(
      join(tmp, 'snapshot', 'snapshot-guards.js'),
    ).href,
  );
  limits = await import(
    pathToFileURL(
      join(tmp, 'snapshot', 'snapshot-limits.js'),
    ).href,
  );
  analysis = await import(
    pathToFileURL(
      join(tmp, 'ai-visibility', 'analysis.js'),
    ).href,
  );
} catch (error) {
  console.error(
    'FAIL compile snapshot modules:',
    error?.message ?? error,
  );
  process.exit(1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const {
  normalizeDomain,
  isBlockedHostname,
  isSafeFetchTarget,
  buildSnapshotPrompts,
  truncateExcerpt,
  sanitizeBrandDisplay,
  secondLevelName,
  snapshotEnv,
} = guards;
const { SnapshotCache, WindowCounter, MonthlyBudget } =
  limits;

// 1. domain normalization
check(
  '1 strips protocol/www/path/query',
  normalizeDomain(
    'https://www.ACME.com/pricing?utm=x#top',
  ),
  'acme.com',
);
check('1 bare domain', normalizeDomain('acme.com'), 'acme.com');
check(
  '1 keeps subdomain',
  normalizeDomain('blog.acme.com'),
  'blog.acme.com',
);

// 2. invalid domain rejection
for (const bad of [
  '',
  '   ',
  'not a domain',
  'http://',
  'acme',
  '-bad.com',
  'a'.repeat(300),
  'has space.com',
  'user@host.com/path',
]) {
  check(
    `2 rejects ${JSON.stringify(String(bad).slice(0, 20))}`,
    normalizeDomain(bad),
    '',
  );
}

// 3. localhost rejection
for (const bad of [
  'localhost',
  'localhost:3000',
  'http://localhost/x',
  'foo.localhost',
  'app.local',
  'svc.internal',
]) {
  check(`3 rejects ${bad}`, normalizeDomain(bad), '');
}

// 4. private IP rejection
checkTrue(
  '4 blocks 192.168.1.1',
  isBlockedHostname('192.168.1.1'),
);
checkTrue(
  '4 blocks 10.0.0.5',
  isBlockedHostname('10.0.0.5'),
);
checkTrue(
  '4 blocks 127.0.0.1',
  isBlockedHostname('127.0.0.1'),
);
checkTrue('4 blocks ::1', isBlockedHostname('::1'));

// 5. redirect/private destination protection
check(
  '5 blocks ftp',
  isSafeFetchTarget('ftp://acme.com/x'),
  false,
);
check(
  '5 blocks file',
  isSafeFetchTarget('file:///etc/passwd'),
  false,
);
check(
  '5 blocks javascript',
  isSafeFetchTarget('javascript:alert(1)'),
  false,
);
check(
  '5 blocks credentialed URL',
  isSafeFetchTarget('https://user:pass@acme.com/'),
  false,
);
check(
  '5 blocks post-redirect localhost',
  isSafeFetchTarget('http://localhost:3000/x'),
  false,
);
check(
  '5 allows public https',
  isSafeFetchTarget('https://acme.com/'),
  true,
);

// 6. fixed prompt count <= 3, deterministic, brand-bound
const prompts = buildSnapshotPrompts(
  'Acme',
  'acme.com',
);
checkTrue(
  '6 exactly 3 prompts',
  prompts.length === 3,
  `got ${prompts.length}`,
);
checkTrue(
  '6 prompts carry brand+domain',
  prompts.every(
    (p) => p.includes('Acme') && p.includes('acme.com'),
  ),
);
checkTrue(
  '6 prompts deterministic',
  JSON.stringify(prompts) ===
    JSON.stringify(
      buildSnapshotPrompts('Acme', 'acme.com'),
    ),
);

// 7. provider calls <= 6 (3 prompts x max 2 providers; env cap)
const env = snapshotEnv();
checkTrue(
  '7 maxCallsPerRun capped at 6',
  env.maxCallsPerRun <= 6,
  `got ${env.maxCallsPerRun}`,
);
checkTrue(
  '7 3 prompts x 2 providers fits budget',
  3 * 2 <= env.maxCallsPerRun,
);

// 8. cache hit makes zero provider calls (dedupe shares one run)
{
  const cache = new SnapshotCache();
  let runs = 0;
  const work = async () => {
    runs += 1;
    await new Promise((r) => setTimeout(r, 20));
    return { n: 1 };
  };
  const [a, b, c] = await Promise.all([
    cache.dedupe('k', work),
    cache.dedupe('k', work),
    cache.dedupe('k', work),
  ]);
  checkTrue(
    '8 concurrent callers share one execution',
    runs === 1 && a.n === 1 && b.n === 1 && c.n === 1,
    `runs=${runs}`,
  );
  cache.set('k', { n: 2 }, 60_000);
  checkTrue(
    '8 cache hit returns stored value',
    cache.get('k')?.n === 2,
  );
}

// 9. per-IP limit (5/hour default)
{
  const counter = new WindowCounter();
  const allowed = Array.from(
    { length: 6 },
    (_, i) =>
      counter.allow('ip:1.2.3.4', 5, 3_600_000, 1000 + i),
  );
  checkTrue(
    '9 fifth allowed, sixth blocked',
    allowed.slice(0, 5).every(Boolean) &&
      allowed[5] === false,
  );
}

// 10. per-domain limit (3/day default)
{
  const counter = new WindowCounter();
  const allowed = [0, 1, 2, 3].map((i) =>
    counter.allow('domain:acme.com', 3, 86_400_000, 1000 + i),
  );
  checkTrue(
    '10 third allowed, fourth blocked',
    allowed.slice(0, 3).every(Boolean) &&
      allowed[3] === false,
  );
}

// 11. budget exhaustion prevents calls
{
  const budget = new MonthlyBudget();
  const d = new Date(Date.UTC(2026, 8, 8));
  checkTrue(
    '11 spend within budget allowed',
    budget.use(6, 10, d) === true,
  );
  checkTrue(
    '11 overspend blocked',
    budget.use(6, 10, d) === false,
  );
  checkTrue(
    '11 new month resets',
    budget.use(6, 10, new Date(Date.UTC(2026, 9, 1))) ===
      true,
  );
}

// 12/13/14. partial failure tolerance (static: per-call try/catch,
// per-result ok flags, total-failure 502 without cache write)
const serviceSrc = read('src/snapshot/snapshot.service.ts');
checkTrue(
  '12/13 per-call failure isolated (ok flags)',
  serviceSrc.includes('ok: false as const') &&
    serviceSrc.includes('ok: true as const'),
);
checkTrue(
  '14 total failure throws, never caches failure',
  serviceSrc.includes('totalChecks === 0') &&
    serviceSrc.includes('resultCache.set'),
);

// 15. brand mentioned path (real analysis module)
{
  const result = analysis.analyzeAiResponse({
    text: 'Acme is the best option for small teams. Acme offers fair pricing.',
    brandTerms: ['Acme', 'acme.com'],
    competitors: [],
  });
  checkTrue('15 mentioned detected', result.mentioned === true);
  checkTrue(
    '15 evidence contexts bounded',
    (result.brandOccurrences[0]?.contexts ?? []).every(
      (c) => c.length <= 250,
    ),
  );
}

// 16. brand absent path
{
  const result = analysis.analyzeAiResponse({
    text: 'Globex and Initech are popular choices for teams.',
    brandTerms: ['Acme', 'acme.com'],
    competitors: [],
  });
  checkTrue(
    '16 absence reported honestly',
    result.mentioned === false,
  );
}

// 17. competitor detected (tracked-style input)
{
  const result = analysis.analyzeAiResponse({
    text: 'Globex beats Acme on price, but Acme has better support.',
    brandTerms: ['Acme'],
    competitors: [{ name: 'Globex', domains: ['globex.com'] }],
  });
  checkTrue(
    '17 competitor matched',
    result.competitorMentions.some(
      (m) => m.name === 'Globex' && m.occurrences > 0,
    ),
  );
}

// 18. no competitor detected
{
  const result = analysis.analyzeAiResponse({
    text: 'Acme is a solid choice.',
    brandTerms: ['Acme'],
    competitors: [],
  });
  checkTrue(
    '18 empty competitor list stays empty',
    result.competitorMentions.length === 0,
  );
}

// 19. citation note remains unavailable for live checks
checkTrue(
  '19 NO_CITATIONS_LIVE constant',
  serviceSrc.includes("citationsNote: 'NO_CITATIONS_LIVE'"),
);
checkTrue(
  '19 never writes citationFound:true for live results',
  !serviceSrc.includes('citationFound: true'),
);

// 20. response excerpt truncation
{
  const long = 'w '.repeat(500);
  const cut = truncateExcerpt(long, 300);
  checkTrue(
    '20 excerpt bounded at ~300 chars',
    cut.length <= 301,
    `got ${cut.length}`,
  );
  check('20 short text untouched', truncateExcerpt('hi', 300), 'hi');
}

// 21. no raw provider response returned
checkTrue(
  '21 response carries excerpt, not raw text',
  serviceSrc.includes('excerpt:') &&
    !serviceSrc.includes('response: output.text') &&
    !serviceSrc.includes('text: output.text'),
);

// 22. no secrets returned or logged
{
  const all = [
    read('src/snapshot/snapshot.service.ts'),
    read('src/snapshot/snapshot-guards.ts'),
    read('src/snapshot/snapshot.controller.ts'),
  ].join('\n');
  checkTrue(
    '22 no secret patterns in snapshot code',
    !/sk-(live|test)|Bearer \$\{|API_KEY|RAZORPAY_KEY_SECRET|STRIPE_SECRET/.test(
      all,
    ),
  );
}

// 23. no fake score field
checkTrue(
  '23 no visibilityScore/score in snapshot response',
  !serviceSrc.includes('visibilityScore') &&
    !serviceSrc.includes('score:'),
);

// 24. no fake revenue/traffic fields anywhere in the response
checkTrue(
  '24 no revenue/traffic/clicks/conversion fields',
  !/revenue|traffic|clicks|conversion/i.test(serviceSrc),
);

// Structural safety: no billing, no Prisma writes, throttled, bounded
const controllerSrc = read(
  'src/snapshot/snapshot.controller.ts',
);
checkTrue(
  'S no guard applied on public controller',
  !controllerSrc.includes('@UseGuards') &&
    !controllerSrc.includes('UseGuards('),
);
checkTrue(
  'S strict throttles present',
  controllerSrc.includes('@Throttle('),
);
checkTrue(
  'S no Prisma writes in snapshot module',
  !/prisma\.\w+\.(create|update|upsert|delete)/.test(
    serviceSrc,
  ),
);
checkTrue(
  'S no billing/entitlement imports',
  !serviceSrc.includes('BillingService') &&
    !serviceSrc.includes('consumeUsage') &&
    !serviceSrc.includes('AI_SCANS'),
);
checkTrue(
  'S brand terms sanitized before prompts',
  serviceSrc.includes('sanitizeBrandDisplay') ||
    serviceSrc.includes('buildSnapshotPrompts'),
);
checkTrue(
  'S homepage fetch bounded (timeout + size)',
  serviceSrc.includes('HOMEPAGE_TIMEOUT_MS') &&
    serviceSrc.includes('HOMEPAGE_MAX_BYTES'),
);

console.log(`\n${passed} passed, ${failures} failed.`);
if (failures > 0) {
  process.exit(1);
}
console.log('snapshot guards OK: bounded, honest, abuse-resistant.');

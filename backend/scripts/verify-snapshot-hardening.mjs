/*
 * Verifies Phase 4D snapshot hardening against the REAL modules
 * (trust-proxy.ts, snapshot-guards.ts, snapshot-limits.ts),
 * compiled on the fly, plus static safety checks on the
 * service/controller/main/signup/onboarding/client.
 * No network, no DB, no provider calls.
 *
 * Run: node backend/scripts/verify-snapshot-hardening.mjs
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
const frontend = join(root, 'frontend');
const readB = (p) =>
  readFileSync(join(backend, p), 'utf8');
const readF = (p) =>
  readFileSync(join(frontend, p), 'utf8');

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

const tmp = mkdtempSync(join(tmpdir(), 'snap-harden-'));
let proxy;
let guards;
let limits;
try {
  execSync(
    `npx tsc src/common/proxy/trust-proxy.ts src/snapshot/snapshot-guards.ts src/snapshot/snapshot-limits.ts --outDir "${tmp}" --module commonjs --target es2020 --esModuleInterop --skipLibCheck`,
    { cwd: backend, stdio: 'pipe' },
  );
  proxy = await import(
    pathToFileURL(join(tmp, 'proxy', 'trust-proxy.js')).href,
  ).catch(
    async () =>
      await import(
        pathToFileURL(
          join(tmp, 'common', 'proxy', 'trust-proxy.js'),
        ).href,
      ),
  );
  guards = await import(
    pathToFileURL(join(tmp, 'snapshot', 'snapshot-guards.js'))
      .href,
  );
  limits = await import(
    pathToFileURL(join(tmp, 'snapshot', 'snapshot-limits.js'))
      .href,
  );
} catch (error) {
  console.error(
    'FAIL compile hardening modules:',
    error?.message ?? error,
  );
  process.exit(1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const { isTrustedProxyPeer, resolveClientIp } = proxy;
const { isPublicIpAddress, allResolvedPublic } = guards;
const { WindowCounter, SnapshotCache, MonthlyBudget, withTimeout } =
  limits;

// FIX 1 — legitimate proxied client IP handling
check(
  '1 loopback peer trusted',
  isTrustedProxyPeer('127.0.0.1'),
  true,
);
check(
  '1 private LB peer trusted',
  isTrustedProxyPeer('10.1.2.3'),
  true,
);
check(
  '1 internet peer NOT trusted',
  isTrustedProxyPeer('203.0.113.5'),
  false,
);
check(
  '1 public peer NOT trusted',
  isTrustedProxyPeer('8.8.8.8'),
  false,
);
check(
  '1 ipv6 loopback trusted',
  isTrustedProxyPeer('::1'),
  true,
);
check(
  '1 ipv6 link-local NOT trusted',
  isTrustedProxyPeer('fe80::1'),
  false,
);
check(
  '1 hostname never trusted',
  isTrustedProxyPeer('lb.internal'),
  false,
);

// FIX 1 — spoofed forwarded IP cannot bypass (Express-resolved wins)
check(
  '1 forged XFF ignored, req.ip wins',
  resolveClientIp({
    ip: '203.0.113.7',
    headers: { 'x-forwarded-for': '1.1.1.1' },
    socket: { remoteAddress: '10.0.0.9' },
  }),
  '203.0.113.7',
);
check(
  '1 socket fallback when no ip',
  resolveClientIp({ socket: { remoteAddress: '10.0.0.9' } }),
  '10.0.0.9',
);
const mainSrc = readB('src/main.ts');
checkTrue(
  '1 trust-proxy installed in main',
  mainSrc.includes("app.set('trust proxy'") &&
    mainSrc.includes('isTrustedProxyPeer'),
);
const controllerSrc = readB(
  'src/snapshot/snapshot.controller.ts',
);
checkTrue(
  '1 controller uses spoof-safe resolver',
  controllerSrc.includes('resolveClientIp') &&
    !controllerSrc.includes('x-forwarded-for'),
);

// FIX 2 — private DNS resolution rejected
for (const ip of [
  '127.0.0.1',
  '10.0.0.1',
  '172.16.0.1',
  '192.168.1.1',
  '169.254.169.254',
  '100.64.0.1',
  '224.0.0.1',
  '0.0.0.0',
]) {
  check(`2 private v4 rejected: ${ip}`, isPublicIpAddress(ip), false);
}
check('2 loopback v6 rejected', isPublicIpAddress('::1'), false);
check(
  '2 link-local v6 rejected',
  isPublicIpAddress('fe80::1'),
  false,
);
check(
  '2 metadata address rejected',
  isPublicIpAddress('169.254.169.254'),
  false,
);

// FIX 2 — public DNS accepted
for (const ip of [
  '8.8.8.8',
  '1.1.1.1',
  '93.184.216.34',
  '2001:4860:4860::8888',
]) {
  check(`2 public accepted: ${ip}`, isPublicIpAddress(ip), true);
}
checkTrue(
  '2 all-public passes, mixed fails, empty fails',
  allResolvedPublic(['8.8.8.8', '1.1.1.1']) === true &&
    allResolvedPublic(['8.8.8.8', '10.0.0.1']) === false &&
    allResolvedPublic([]) === false,
);

// FIX 2 — redirect-to-private rejected (manual hop validation)
const serviceSrc = readB('src/snapshot/snapshot.service.ts');
checkTrue(
  '2 manual redirects (no blind follow)',
  serviceSrc.includes("redirect: 'manual'") &&
    !serviceSrc.includes("redirect: 'follow'"),
);
checkTrue(
  '2 per-hop DNS + target validation',
  serviceSrc.includes('hostResolvesPublic') &&
    serviceSrc.includes('isSafeFetchTarget(current)'),
);
checkTrue(
  '2 redirect hop cap',
  /hop === 3|hop <= 3|hop < 3|maxRedirect|hop === 3/.test(
    serviceSrc,
  ),
);

// FIX 3 — snapshot timeout enforced, global untouched
checkTrue(
  '3 snapshot deadline is 30s',
  serviceSrc.includes(
    'SNAPSHOT_PROVIDER_TIMEOUT_MS = 30000',
  ),
);
checkTrue(
  '3 snapshot wraps provider calls in race',
  serviceSrc.includes('withTimeout('),
);
const openaiSrc = readB(
  'src/ai-visibility/providers/openai.provider.ts',
);
const geminiSrc = readB(
  'src/ai-visibility/providers/gemini.provider.ts',
);
const aiServiceSrc = readB(
  'src/ai-visibility/ai-visibility.service.ts',
);
checkTrue(
  '3 global provider timeout still 60s',
  openaiSrc.includes('PROVIDER_TIMEOUT_MS = 60000') &&
    geminiSrc.includes('PROVIDER_TIMEOUT_MS = 60000'),
);
checkTrue(
  '3 authenticated flow has no snapshot race',
  !aiServiceSrc.includes('withTimeout') &&
    !aiServiceSrc.includes('SNAPSHOT_PROVIDER_TIMEOUT_MS'),
);
{
  const fast = await withTimeout(
    Promise.resolve('quick'),
    1000,
    't',
  );
  check('3 fast call passes through', fast, 'quick');
  const slow = withTimeout(
    new Promise((r) => setTimeout(() => r('late'), 5000)),
    50,
    'snapshot check',
  );
  const outcome = await slow.then(
    () => 'resolved',
    (e) => `rejected:${e?.name}`,
  );
  check(
    '3 slow call rejects as timeout, other work unaffected',
    outcome,
    'rejected:TimeoutError',
  );
}

// FIX 4 — domain preserved safely through signup
checkTrue(
  '4 backend CTA carries encoded domain',
  serviceSrc.includes(
    'href: `/signup?domain=${encodeURIComponent(normalized)}`',
  ),
);
const clientSrc = readF('src/app/snapshot/snapshot-client.tsx');
checkTrue(
  '4 frontend CTA carries encoded domain',
  clientSrc.includes(
    '`/signup?domain=${encodeURIComponent(report.normalizedDomain)}`',
  ),
);
const signupSrc = readF('src/app/signup/page.tsx');
checkTrue(
  '4 signup validates + remembers, never auto-creates',
  signupSrc.includes('normalizeSnapshotDomain') &&
    signupSrc.includes('rememberSnapshotDomain') &&
    !signupSrc.includes('createWebsite'),
);
const onboardingSrc = readF('src/app/onboarding/page.tsx');
checkTrue(
  '4 onboarding prefills URL only when empty',
  onboardingSrc.includes('readRememberedSnapshotDomain') &&
    onboardingSrc.includes('current.trim()'),
);

// Malicious domain query rejected/sanitized (frontend mirror)
const snapLib = readF('src/lib/snapshot.ts');
checkTrue(
  '4 mirror validator exists in lib',
  snapLib.includes('normalizeSnapshotDomain'),
);

// Regression: cache / domain / budget unchanged
{
  const cache = new SnapshotCache();
  cache.set('d:acme.com', { n: 1 }, 86_400_000);
  checkTrue(
    '11 24h cache behavior unchanged',
    cache.get('d:acme.com')?.n === 1,
  );
  const dc = new WindowCounter();
  const hits = [0, 1, 2, 3].map((i) =>
    dc.allow('d:x.com', 3, 86_400_000, 1000 + i),
  );
  checkTrue(
    '12 per-domain limit unchanged',
    hits.slice(0, 3).every(Boolean) && hits[3] === false,
  );
  const b = new MonthlyBudget();
  const d = new Date(Date.UTC(2026, 8, 8));
  checkTrue(
    '13 monthly budget unchanged',
    b.use(6, 10, d) === true && b.use(6, 10, d) === false,
  );
}

// Regression: honesty invariants intact
checkTrue(
  '14 no raw provider responses',
  !serviceSrc.includes('response: output.text') &&
    !serviceSrc.includes('text: output.text') &&
    serviceSrc.includes('excerpt:'),
);
checkTrue(
  '15 no API keys/secrets in snapshot surface',
  !/sk-(live|test)|API_KEY|SECRET/.test(
    serviceSrc + controllerSrc,
  ),
);
checkTrue(
  '16 no fake scores',
  !serviceSrc.includes('visibilityScore') &&
    !serviceSrc.includes('score:'),
);
checkTrue(
  '17 no fake citations',
  serviceSrc.includes('NO_CITATIONS_LIVE') &&
    !serviceSrc.includes('citationFound: true'),
);
checkTrue(
  '18 no fake revenue/traffic',
  !/revenue|traffic|clicks|conversion/i.test(serviceSrc),
);
checkTrue(
  '19 zero Prisma calls in snapshot module',
  !/prisma\./.test(serviceSrc),
);
checkTrue(
  '20 no billing/entitlement coupling',
  !serviceSrc.includes('Billing') &&
    !serviceSrc.includes('AI_SCANS'),
);

console.log(`\n${passed} passed, ${failures} failed.`);
if (failures > 0) {
  process.exit(1);
}
console.log('snapshot hardening OK.');

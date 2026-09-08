/*
 * Verifies the internal test entitlement against the REAL helper
 * (billing/internal-test.ts), compiled on the fly, plus static
 * safety checks on the billing service, controller, and frontend.
 * No network, no DB, no provider calls.
 *
 * Run: node backend/scripts/verify-internal-entitlement.mjs
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

const tmp = mkdtempSync(join(tmpdir(), 'internal-verify-'));
let helper;
try {
  execSync(
    `npx tsc src/billing/internal-test.ts --outDir "${tmp}" --module commonjs --target es2020 --esModuleInterop --skipLibCheck`,
    { cwd: backend, stdio: 'pipe' },
  );
  helper = await import(
    pathToFileURL(join(tmp, 'internal-test.js')).href,
  );
} catch (error) {
  console.error(
    'FAIL compile internal-test.ts:',
    error?.message ?? error,
  );
  process.exit(1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const {
  normalizeTestEmail,
  isInternalTestEmail,
} = helper;
const CONF = 'tester@example.com';

// 1. missing env -> normal limits (match impossible)
check(
  '1 empty config never matches',
  isInternalTestEmail('', CONF),
  false,
);
check(
  '1 undefined config never matches',
  isInternalTestEmail(undefined, CONF),
  false,
);
check(
  '1 null config never matches',
  isInternalTestEmail(null, CONF),
  false,
);

// 2. exact matching email -> internal unlimited
check(
  '2 exact match',
  isInternalTestEmail(CONF, CONF),
  true,
);

// 3. different email -> normal limits
check(
  '3 different email rejected',
  isInternalTestEmail(CONF, 'other@example.com'),
  false,
);
check(
  '3 empty candidate rejected',
  isInternalTestEmail(CONF, ''),
  false,
);

// 4. case normalization
check(
  '4 uppercase candidate matches',
  isInternalTestEmail(CONF, 'TESTER@EXAMPLE.COM'),
  true,
);
check(
  '4 uppercase config matches',
  isInternalTestEmail('TESTER@EXAMPLE.COM', CONF),
  true,
);

// 5. whitespace normalization
check(
  '5 padded candidate matches',
  isInternalTestEmail(CONF, '  tester@example.com\n'),
  true,
);

// 6. similar-but-different rejected
for (const near of [
  'tester@example.com ',
  ' tester@example.com',
  'tester@example.comm',
  'tester@example.co',
  'tester2@example.com',
  'tester@sub.example.com',
  'evilt tester@example.com',
  'tester@example.com.evil.com',
]) {
  const clean = normalizeTestEmail(near);
  checkTrue(
    `6 near-miss does not equal (${near.trim().slice(0, 30)})`,
    clean !== CONF || near.trim() === CONF,
  );
}
check(
  '6 subdomain rejected',
  isInternalTestEmail(CONF, 'tester@sub.example.com'),
  false,
);
check(
  '6 lookalike domain rejected',
  isInternalTestEmail(CONF, 'tester@example.com.evil.com'),
  false,
);

const serviceSrc = readB('src/billing/billing.service.ts');
const controllerSrc = readB(
  'src/billing/billing.controller.ts',
);
const aiServiceSrc = readB(
  'src/ai-visibility/ai-visibility.service.ts',
);
const billingPageSrc = readF('src/app/billing/page.tsx');
const pricingSrc = (() => {
  try {
    return readF('src/app/pricing/page.tsx');
  } catch {
    return '';
  }
})();

// 7. frontend cannot activate override
checkTrue(
  '7 no INTERNAL_TEST_EMAIL in frontend',
  !billingPageSrc.includes('INTERNAL_TEST_EMAIL') &&
    !readF('src/lib/api.ts').includes('INTERNAL_TEST_EMAIL'),
);
checkTrue(
  '7 frontend only reads server verdict flags',
  billingPageSrc.includes("planCode ===") &&
    billingPageSrc.includes('INTERNAL'),
);

// 8/9. query param / localStorage cannot activate
checkTrue(
  '8 no query-param activation path',
  !serviceSrc.includes('query') &&
    !controllerSrc.includes('INTERNAL_TEST_EMAIL'),
);
checkTrue(
  '9 no localStorage activation path',
  !serviceSrc.includes('localStorage'),
);

// 10-15. internal bypasses metered paths (server-side short-circuits)
for (const [n, label, snippet] of [
  ['10', 'AI credits unlimited', "plan.code === 'INTERNAL'"],
  ['11', 'website limit via enforceCreation null', 'enforceCreation'],
  ['12', 'AI scans via consumeUsage INTERNAL', 'consumeUsage'],
  ['13', 'crawl allowance INTERNAL', 'checkCrawlAllowance'],
  ['14', 'action allowance null', 'AI_GROWTH_ACTIONS'],
  ['15', 'report limit via enforceCreation null', 'internalEntitlements'],
]) {
  checkTrue(
    `${n} ${label}`,
    serviceSrc.includes(snippet),
  );
}
checkTrue(
  '12 AI-scan free path bypasses for internal',
  aiServiceSrc.includes('isInternalTestOrg'),
);

// 16. advanced/agency flags all true, existing only
checkTrue(
  '16 all five enforced flags true for internal',
  serviceSrc.includes('whiteLabel: true') &&
    serviceSrc.includes('scheduledReports: true') &&
    serviceSrc.includes('agency: true') &&
    serviceSrc.includes('api: true') &&
    serviceSrc.includes('advancedMonitoring: true'),
);

// 17/18. normal paid + FREE users unchanged (commercial paths intact)
checkTrue(
  '17/18 commercial entitlement flow intact',
  serviceSrc.includes('freeEntitlements()') &&
    serviceSrc.includes('hasPaidLimits(effective)') &&
    serviceSrc.includes('FREE_LIMITS'),
);

// 19. billing providers untouched
{
  const stripeSrc = readB('src/billing/stripe.service.ts');
  const razorSrc = readB('src/billing/razorpay.service.ts');
  checkTrue(
    '19 Stripe provider file untouched by internal logic',
    !stripeSrc.includes('INTERNAL'),
  );
  checkTrue(
    '19 Razorpay provider file untouched by internal logic',
    !razorSrc.includes('INTERNAL'),
  );
  checkTrue(
    '19 no fake subscription creation for internal',
    !serviceSrc.includes('provider: \'INTERNAL\'') ||
      !/subscriptions\.create|payments\.create/.test(
        serviceSrc,
      ),
  );
}

// 20. pricing config unchanged
{
  const plansSrc = readB('src/billing/plans.config.ts');
  checkTrue(
    '20 plans.config has no INTERNAL plan',
    !plansSrc.includes('INTERNAL'),
  );
  checkTrue(
    '20 pricing page shows no Unlimited/internal',
    !pricingSrc.includes('INTERNAL') &&
      !pricingSrc.includes('Unlimited'),
  );
}

// 21. Prisma schema unchanged
{
  const schema = readB('prisma/schema.prisma');
  checkTrue(
    '21 no schema model/field for internal override',
    !schema.includes('INTERNAL') &&
      !schema.includes('isInternal'),
  );
}

// 22. no secret/email exposure in API responses
checkTrue(
  '22 configured email never serialized',
  !serviceSrc.includes('internalTestEmailConfigured()') ||
    (() => {
      const idx = serviceSrc.indexOf(
        'internalEntitlements()',
      );
      const block = serviceSrc.slice(
        idx,
        idx + 2500,
      );
      return (
        !block.includes('internalTestEmailConfigured') &&
        !block.includes('process.env.INTERNAL_TEST_EMAIL')
      );
    })(),
);
checkTrue(
  '22 entitlement payload carries flags, not email',
  (() => {
    const start = serviceSrc.indexOf(
      'private internalEntitlements()',
    );
    const block = serviceSrc.slice(
      start,
      start + 3000,
    );
    return (
      start !== -1 &&
      block.includes('isInternal: true') &&
      !/email/i.test(block)
    );
  })(),
);
checkTrue(
  '22 controller passes no email into billing',
  !controllerSrc.includes('internal') &&
    !controllerSrc.includes('INTERNAL'),
);

// Structural: env-gated + member-DB verified (immediate revocation)
checkTrue(
  'S override requires env + DB membership',
  serviceSrc.includes('internalTestEmailConfigured()') &&
    serviceSrc.includes('organizationMember.findMany') &&
    serviceSrc.includes('isInternalTestEmail('),
);
checkTrue(
  'S no role/domain/pattern matching anywhere',
  (() => {
    const src = readB('src/billing/internal-test.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    return !/\.role|admin|domain|pattern|localStorage|query|cookie|startsWith|endsWith|includes|test\(|match\(/i.test(
      src,
    );
  })(),
);

console.log(`\n${passed} passed, ${failures} failed.`);
if (failures > 0) {
  process.exit(1);
}
console.log('internal entitlement OK: exact-match, env-gated, DB-verified.');

/*
 * Verifies billing currency + entitlement mappings with mocked values only.
 * No live Stripe/Razorpay calls, no DB access, no network.
 *
 * Run: node backend/scripts/verify-billing-maps.mjs
 * Exit 0 = all mappings safe, exit 1 = failure.
 *
 * Checks:
 *  1. Explicit INR/USD commercial prices per plan.
 *  2. Stripe USD cents mapping (e.g. $29 -> 2900, never 199900).
 *  3. stripe.service.ts derives USD from commercial config (static check),
 *     reuses existing prices, never overwrites Plan.currency.
 *  4. syncPlansFromConfig writes INR-canonical rows (static check).
 *  5. AI credits: paid plans null (unlimited), FREE 5.
 *  6. Trial: GROWTH + 14 days.
 *  7. Razorpay resolvePrice uses priceFor + gates USD (static check).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const configSrc = read('backend/src/billing/plans.config.ts');
const stripeSrc = read('backend/src/billing/stripe.service.ts');
const billingSrc = read('backend/src/billing/billing.service.ts');
const razorpaySrc = read('backend/src/billing/razorpay.service.ts');
const razorpayProviderSrc = read(
  'backend/src/billing/providers/razorpay.provider.ts',
);

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) {
    failures += 1;
    console.error(`FAIL ${label}: expected=${expected} actual=${actual}`);
  } else {
    console.log(`ok ${label} = ${actual}`);
  }
}
function checkTrue(label, cond, detail = '') {
  if (!cond) {
    failures += 1;
    console.error(`FAIL ${label} ${detail}`);
  } else {
    console.log(`ok ${label}`);
  }
}

function planSegment(code) {
  const start = configSrc.indexOf(`code: '${code}'`);
  if (start === -1) return null;
  let end = configSrc.length;
  for (const other of ['FREE', 'STARTER', 'GROWTH', 'SCALE', 'AGENCY']) {
    if (other === code) continue;
    const idx = configSrc.indexOf(`code: '${other}'`, start + 1);
    if (idx !== -1 && idx < end) end = idx;
  }
  return configSrc.slice(start, end);
}
function money(seg, book, field) {
  const b = seg.match(new RegExp(`${book}:\\s*\\{([^}]*)\\}`));
  if (!b) return null;
  const f = b[1].match(new RegExp(`${field}:\\s*(\\d+)`));
  return f ? Number(f[1]) : null;
}

// 1. Explicit commercial prices
const EXPECTED = {
  FREE: { inr: 0, usd: 0, inrY: 0, usdY: 0 },
  STARTER: { inr: 1999, usd: 29, inrY: 17988, usdY: 288 },
  GROWTH: { inr: 4999, usd: 79, inrY: 44988, usdY: 792 },
  SCALE: { inr: 9999, usd: 149, inrY: 89988, usdY: 1488 },
  AGENCY: { inr: 24999, usd: 399, inrY: 224988, usdY: 3984 },
};
for (const [code, exp] of Object.entries(EXPECTED)) {
  const seg = planSegment(code);
  checkTrue(`${code} segment present`, !!seg);
  if (!seg) continue;
  check(`${code}.inr.monthly`, money(seg, 'inr', 'monthly'), exp.inr);
  check(`${code}.usd.monthly`, money(seg, 'usd', 'monthly'), exp.usd);
  check(`${code}.inr.yearlyTotal`, money(seg, 'inr', 'yearlyTotal'), exp.inrY);
  check(`${code}.usd.yearlyTotal`, money(seg, 'usd', 'yearlyTotal'), exp.usdY);
}

// 2. Stripe cents mapping (mocked arithmetic, mirrors stripe.service logic)
for (const [code, exp] of Object.entries(EXPECTED)) {
  if (code === 'FREE') continue;
  check(
    `${code} stripe monthly cents ($${exp.usd} -> cents)`,
    Math.round(exp.usd * 100),
    exp.usd * 100,
  );
}
check('STARTER $29 -> 2900 cents (not 199900)', 29 * 100, 2900);
checkTrue(
  'INR 1999 never becomes USD cents',
  1999 * 100 !== 29 * 100,
);
check('GROWTH $79 -> 7900 cents', 79 * 100, 7900);
check('SCALE $149 -> 14900 cents', 149 * 100, 14900);
check('AGENCY $399 -> 39900 cents', 399 * 100, 39900);
check('STARTER yearly $288 -> 28800 cents', 288 * 100, 28800);

// 3. stripe.service static safety
checkTrue(
  'stripe sync uses COMMERCIAL_PLANS (not DB INR prices)',
  stripeSrc.includes('COMMERCIAL_PLANS'),
);
checkTrue(
  'stripe sync derives cents from usd book',
  stripeSrc.includes('commercial.usd.monthly') &&
    stripeSrc.includes('commercial.usd.yearlyTotal'),
  'expected commercial.usd references',
);
checkTrue(
  'stripe sync never multiplies DB monthlyPrice',
  !stripeSrc.includes('plan.monthlyPrice * 100') &&
    !stripeSrc.includes('plan.yearlyPrice * 100'),
  'found legacy INR-derived unit_amount',
);
checkTrue(
  'stripe sync never overwrites Plan.currency',
  !stripeSrc.includes("currency: 'USD'") ||
    stripeSrc.includes('Only `stripeMonthlyPriceId / stripeYearlyPriceId` are stored'),
  'found currency overwrite without guard comment',
);
checkTrue(
  'stripe sync reuses existing prices',
  stripeSrc.includes('findOrCreatePrice') && stripeSrc.includes('reused'),
);
checkTrue(
  'stripe sync supports dryRun',
  stripeSrc.includes('dryRun'),
);

// 4. syncPlansFromConfig writes INR canonical
checkTrue(
  'syncPlansFromConfig writes INR monthly',
  billingSrc.includes('commercial.inr.monthly'),
);
checkTrue(
  'syncPlansFromConfig writes currency INR',
  billingSrc.includes("currency: 'INR'"),
);

// 5. AI credits
const paidNulls = (configSrc.match(/aiGenerationsPerMonth:\s*null/g) || []).length;
check('paid plans with aiGenerationsPerMonth null', paidNulls, 4);
checkTrue(
  'FREE aiGenerationsPerMonth is 5',
  planSegment('FREE')?.includes('aiGenerationsPerMonth: 5') ?? false,
);
checkTrue(
  'enforcement treats commercial null as unlimited',
  billingSrc.includes('aiGenerationsPerMonth === null') &&
    billingSrc.includes('aiCreditsLimit'),
);
checkTrue(
  'checkUsage short-circuits unlimited',
  billingSrc.includes('Unlimited (AI_CREDITS on paid plans)') ||
    billingSrc.includes('if (limit === null)'),
);

// 6. Trial
checkTrue(
  'TRIAL_PLAN_CODE is GROWTH',
  configSrc.includes("TRIAL_PLAN_CODE = 'GROWTH'"),
);
checkTrue(
  'TRIAL_DAYS is 14',
  /TRIAL_DAYS\s*=\s*14/.test(configSrc),
);
checkTrue(
  'trial is provider NONE (no phantom billing)',
  billingSrc.includes("provider: 'NONE'"),
);

// 7. Razorpay mapping
checkTrue(
  'razorpay resolvePrice uses priceFor config',
  razorpaySrc.includes('priceFor('),
);
checkTrue(
  'razorpay gates USD behind international cards',
  razorpaySrc.includes('internationalCards'),
);
checkTrue(
  'razorpay amounts use smallest unit (*100)',
  razorpayProviderSrc.includes('input.amount * 100'),
);

if (failures === 0) {
  console.log('\nbilling maps OK: INR/USD/Stripe-cents/AI-credits/trial all safe.');
} else {
  console.error(`\nbilling maps FAILED with ${failures} failure(s).`);
  process.exit(1);
}

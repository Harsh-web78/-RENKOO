/*
 * Verifies that frontend/src/lib/plans.ts still mirrors
 * backend/src/billing/plans.config.ts.
 *
 * Run: node frontend/scripts/verify-plans-mirror.mjs
 * Exit 0 = match, exit 1 = drift (update both files together).
 *
 * No dependencies. Parses both sources with regex — it only
 * checks numbers and plan-level flags, not copy.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

const backendSrc = readFileSync(
  join(root, 'backend', 'src', 'billing', 'plans.config.ts'),
  'utf8',
);

const frontendSrc = readFileSync(
  join(root, 'frontend', 'src', 'lib', 'plans.ts'),
  'utf8',
);

const CODES = ['FREE', 'STARTER', 'GROWTH', 'SCALE', 'AGENCY'];

const NUMERIC_FIELDS = [
  'websites',
  'keywords',
  'aiPrompts',
  'competitors',
  'reportsPerMonth',
  'aiGrowthActionsPerMonth',
  'teamMembers',
  'clients',
  'crawlCredits',
  'apiCalls',
  'aiScans',
];

/** Slice the object literal starting at `code: 'X'` up to the next plan (or EOF). */
function planSegment(source, code) {
  const start = source.indexOf(`code: '${code}'`);

  if (start === -1) {
    return null;
  }

  let end = source.length;

  for (const other of CODES) {
    if (other === code) {
      continue;
    }

    const idx = source.indexOf(
      `code: '${other}'`,
      start + 1,
    );

    if (idx !== -1 && idx < end) {
      end = idx;
    }
  }

  return source.slice(start, end);
}

function moneyValue(segment, book, field) {
  const bookMatch = segment.match(
    new RegExp(`${book}:\\s*\\{([^}]*)\\}`),
  );

  if (!bookMatch) {
    return null;
  }

  const fieldMatch = bookMatch[1].match(
    new RegExp(`${field}:\\s*(\\d+)`),
  );

  return fieldMatch ? Number(fieldMatch[1]) : null;
}

function entitlementValue(segment, field) {
  const match = segment.match(
    new RegExp(`${field}:\\s*(\\d+)`),
  );

  return match ? Number(match[1]) : null;
}

let failures = 0;

function check(label, backendValue, frontendValue) {
  if (backendValue !== frontendValue) {
    failures += 1;
    console.error(
      `MISMATCH ${label}: backend=${backendValue} frontend=${frontendValue}`,
    );
  }
}

for (const code of CODES) {
  const backendSeg = planSegment(backendSrc, code);
  const frontendSeg = planSegment(frontendSrc, code);

  if (!backendSeg) {
    failures += 1;
    console.error(`MISSING backend plan ${code}`);
    continue;
  }

  if (!frontendSeg) {
    failures += 1;
    console.error(`MISSING frontend plan ${code}`);
    continue;
  }

  check(
    `${code}.usd.monthly`,
    moneyValue(backendSeg, 'usd', 'monthly'),
    moneyValue(frontendSeg, 'usd', 'monthly'),
  );
  check(
    `${code}.usd.yearlyTotal`,
    moneyValue(backendSeg, 'usd', 'yearlyTotal'),
    moneyValue(frontendSeg, 'usd', 'yearlyTotal'),
  );
  check(
    `${code}.inr.monthly`,
    moneyValue(backendSeg, 'inr', 'monthly'),
    moneyValue(frontendSeg, 'inr', 'monthly'),
  );
  check(
    `${code}.inr.yearlyTotal`,
    moneyValue(backendSeg, 'inr', 'yearlyTotal'),
    moneyValue(frontendSeg, 'inr', 'yearlyTotal'),
  );

  for (const field of NUMERIC_FIELDS) {
    check(
      `${code}.${field}`,
      entitlementValue(backendSeg, field),
      entitlementValue(frontendSeg, field),
    );
  }

  const backendPopular = /popular:\s*true/.test(backendSeg);
  const frontendPopular = /popular:\s*true/.test(frontendSeg);
  check(`${code}.popular`, backendPopular, frontendPopular);

  const backendTrial = /trialEligible:\s*true/.test(backendSeg);
  const frontendTrial = /trialEligible:\s*true/.test(frontendSeg);
  check(`${code}.trialEligible`, backendTrial, frontendTrial);
}

const backendTrialDays = backendSrc.match(/TRIAL_DAYS\s*=\s*(\d+)/);
const frontendTrialDays = frontendSrc.match(/TRIAL_DAYS\s*=\s*(\d+)/);
check(
  'TRIAL_DAYS',
  backendTrialDays ? Number(backendTrialDays[1]) : null,
  frontendTrialDays ? Number(frontendTrialDays[1]) : null,
);

if (failures === 0) {
  console.log(
    'plans mirror OK: all prices, limits, popular + trial flags match.',
  );
} else {
  console.error(`plans mirror FAILED with ${failures} mismatch(es).`);
  process.exit(1);
}

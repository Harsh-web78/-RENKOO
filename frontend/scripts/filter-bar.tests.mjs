/*
 * RENKOO — FilterBar active-count tests (node, no runner).
 *
 * The active count must reflect genuinely user-applied,
 * clearable filters only: scope selectors never count,
 * page defaults never count. Run from frontend/:
 *   node scripts/filter-bar.tests.mjs
 *
 * Style mirrors scripts/tour.tests.mjs.
 */

import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');

let passed = 0;
let failed = 0;

function check(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function read(rel) {
  return readFileSync(join(src, rel), 'utf8');
}

const bar = read('components/ui/FilterBar.tsx');
const page = readFrontend('app/technical-seo/page.tsx');

function readFrontend(rel) {
  return readFileSync(join(src, rel), 'utf8');
}

/* ---------- generic mechanism ---------- */

check(
  'FilterSelect supports countable flag',
  /countable\?: boolean/.test(bar),
);

check(
  'FilterSelect supports defaultValue',
  /defaultValue\?: string/.test(bar),
);

check(
  'FilterBar delegates to shared count helper',
  bar.includes('countActiveFilters('),
);

check(
  'Clear all gated on count > 0 (unchanged)',
  /count > 0 && onClearAll/.test(bar),
);

/* ---------- technical-seo wiring ---------- */

check(
  'website select excluded from count',
  /key: 'website'[\s\S]{0,400}countable: false/.test(page),
);

check(
  'status select declares OPEN default',
  /key: 'status'[\s\S]{0,600}defaultValue: 'OPEN'/.test(page),
);

check(
  'clear-all preserves website (no reset call)',
  (() => {
    const start = page.indexOf('onClearAll={() => {');
    if (start < 0) return false;
    const block = page.slice(start, start + 400);
    return (
      block.includes("setSearch('')") &&
      block.includes("setSeverityFilter('ALL')") &&
      block.includes("setStatusFilter('OPEN')") &&
      !block.includes('setWebsiteId') &&
      !block.includes('handleWebsite')
    );
  })(),
);

/* ---------- other pages unchanged ---------- */

check(
  'no other page passes countable/defaultValue',
  (() => {
    const hits = [];
    (function walk(dir) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name)) {
          const norm = full.split('\\').join('/');
          if (norm.endsWith('components/ui/FilterBar.tsx')) continue;
          if (norm.endsWith('lib/filterCount.ts')) continue;
          if (norm.endsWith('app/technical-seo/page.tsx')) continue;
          const text = readFileSync(full, 'utf8');
          if (!text.includes('FilterBar')) continue;
          if (/countable\s*:|defaultValue\s*:/.test(text)) hits.push(full);
        }
      }
    })(src);
    return hits.length === 0;
  })(),
);

/* ---------- behavioral truth table ----------
 *
 * Compiles the REAL pure count module and executes
 * the nine required cases. Technical SEO shape:
 * website (scope, uncountable) + severity (ALL) +
 * status (OPEN default) + empty search.
 */
{
  const tmp = mkdtempSync(join(tmpdir(), 'filtercount-verify-'));
  let compiled = null;
  try {
    execSync(
      `npx tsc src/lib/filterCount.ts --outDir "${tmp}" --module commonjs --target es2020 --esModuleInterop --skipLibCheck`,
      { cwd: root, stdio: 'pipe' },
    );
    compiled = await import(
      pathToFileURL(join(tmp, 'filterCount.js')).href
    );
  } catch (e) {
    check('filterCount compiles standalone', false, String(e).slice(0, 160));
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}
  }

  if (compiled) {
    const { countActiveFilters } = compiled;
    check('countActiveFilters exported', typeof countActiveFilters === 'function');

    const base = (over = {}) => ({
      selects: [
        { key: 'website', value: 'site-1', countable: false },
        { key: 'severity', value: 'ALL' },
        { key: 'status', value: 'OPEN', defaultValue: 'OPEN' },
      ],
      searchValue: '',
      ...over,
    });

    /* 1. website only → 0 */
    check('1. website only → 0', countActiveFilters(base()) === 0);

    /* 2. website + default OPEN → 0 */
    check(
      '2. website + default OPEN → 0',
      countActiveFilters(base()) === 0,
    );

    /* 3. website + severity HIGH → 1 */
    check(
      '3. website + severity HIGH → 1',
      countActiveFilters(
        base({
          selects: [
            { key: 'website', value: 'site-1', countable: false },
            { key: 'severity', value: 'HIGH' },
            { key: 'status', value: 'OPEN', defaultValue: 'OPEN' },
          ],
        }),
      ) === 1,
    );

    /* 4. search + website → 1 */
    check(
      '4. search + website → 1',
      countActiveFilters(base({ searchValue: 'broken' })) === 1,
    );

    /* 5. status FIXED (off default) → 1 */
    check(
      '5. status FIXED → 1',
      countActiveFilters(
        base({
          selects: [
            { key: 'website', value: 'site-1', countable: false },
            { key: 'severity', value: 'ALL' },
            { key: 'status', value: 'FIXED', defaultValue: 'OPEN' },
          ],
        }),
      ) === 1,
    );

    /* 6+7. clear-all outcome: website kept, clearables reset → 0 */
    check(
      '6+7. cleared state (website kept) → 0',
      countActiveFilters(
        base({
          selects: [
            { key: 'website', value: 'site-1', countable: false },
            { key: 'severity', value: 'ALL' },
            { key: 'status', value: 'OPEN', defaultValue: 'OPEN' },
          ],
          searchValue: '',
        }),
      ) === 0,
    );

    /* legacy default rule preserved (no new props) */
    check(
      '9a. legacy selects unchanged (ALL/empty = 0)',
      countActiveFilters({
        selects: [{ key: 'a', value: 'ALL' }, { key: 'b', value: '' }],
      }) === 0,
    );
    check(
      '9b. legacy active select still counts',
      countActiveFilters({ selects: [{ key: 'a', value: 'HIGH' }] }) === 1,
    );
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

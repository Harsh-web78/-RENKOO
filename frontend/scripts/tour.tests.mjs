/*
 * RENKOO — Product Tour 1.0 tests (node, no runner).
 *
 * Static wiring validation for the guided tour:
 * step config shape, route existence, data-tour
 * anchor coverage, copy bounds, await semantics and
 * telemetry vocabulary. Run from frontend/:
 *   node scripts/tour.tests.mjs
 *
 * Style mirrors backend/scripts/*.tests.mjs.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/* ---------- parse step blocks ---------- */

function extractArray(source, constName) {
  const start = source.indexOf(`export const ${constName}`);
  if (start < 0) return null;
  /* Skip the TourStep[] type annotation: the array
   * literal starts at the first '[' after '='. */
  const eq = source.indexOf('=', start);
  if (eq < 0) return null;
  const open = source.indexOf('[', eq);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '[') depth++;
    if (source[i] === ']') {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

function splitObjects(body) {
  const out = [];
  let depth = 0;
  let current = '';
  for (const ch of body) {
    if (ch === '{') {
      if (depth === 0) current = '';
      depth++;
    }
    if (depth > 0) current += ch;
    if (ch === '}') {
      depth--;
      if (depth === 0) out.push(current);
    }
  }
  return out;
}

function field(block, name) {
  const m = block.match(new RegExp(`${name}:\\s*'((?:[^'\\\\]|\\\\.)*)'`, 's'));
  return m ? m[1] : null;
}

function hasProp(block, name) {
  return new RegExp(`\\b${name}:`).test(block);
}

const stepsSource = read('components/tour/tourSteps.ts');
const coreBody = extractArray(stepsSource, 'CORE_STEPS');
const discBody = extractArray(stepsSource, 'DISCOVERY_STEPS');

check('core steps array parses', typeof coreBody === 'string');
check('discovery steps array parses', typeof discBody === 'string');

const core = splitObjects(coreBody ?? '').map((b) => ({
  raw: b,
  id: field(b, 'id'),
  tour: field(b, 'tour'),
  route: field(b, 'route'),
  target: field(b, 'target'),
  title: field(b, 'title'),
  body: field(b, 'body'),
  await: field(b, 'await'),
  awaitRoute: field(b, 'awaitRoute'),
  group: field(b, 'group'),
  skippable: /skippable:\s*true/.test(b),
}));

const disc = splitObjects(discBody ?? '').map((b) => ({
  raw: b,
  id: field(b, 'id'),
  tour: field(b, 'tour'),
  route: field(b, 'route'),
  target: field(b, 'target'),
  title: field(b, 'title'),
  body: field(b, 'body'),
  await: field(b, 'await'),
  awaitRoute: field(b, 'awaitRoute'),
  group: field(b, 'group'),
  skippable: /skippable:\s*true/.test(b),
}));

const all = [...core, ...disc];

/* ---------- journey shape ---------- */

const expectedCore = [
  'website', 'crawl', 'connect-gsc', 'gsc-property',
  'connect-ga4', 'ga4-property', 'baseline', 'command-center',
  'top-actions', 'growth-plan', 'growth-work', 'verification',
  'outcomes', 'complete',
];

check('core tour has 14 steps', core.length === 14, `got ${core.length}`);
check(
  'core step order matches activation journey',
  JSON.stringify(core.map((s) => s.id)) === JSON.stringify(expectedCore),
  core.map((s) => s.id).join(','),
);
check(
  'all core steps declare tour core',
  core.every((s) => s.tour === 'core'),
);
check('discovery tour has 12 steps', disc.length === 12, `got ${disc.length}`);
check(
  'all discovery steps declare tour discovery',
  disc.every((s) => s.tour === 'discovery'),
);

const groups = ['A', 'B', 'C', 'D', 'E', 'F'];
for (const g of groups) {
  const inGroup = disc.filter((s) => s.group === g);
  check(`discovery group ${g} has 2 steps`, inGroup.length === 2, `got ${inGroup.length}`);
}

const ids = all.map((s) => s.id);
check('step ids unique', new Set(ids).size === ids.length);
check('every step has id + title + body + route', all.every((s) => s.id && s.title && s.body && s.route));

/* ---------- copy bounds (concise, no docs) ---------- */

function sentences(text) {
  return text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
}

for (const s of all) {
  check(
    `copy bounds ${s.id}`,
    s.title.length <= 60 && s.body.length <= 400 && sentences(s.body).length >= 1 && sentences(s.body).length <= 3,
    `title=${s.title?.length} body=${s.body?.length} sentences=${s.body ? sentences(s.body).length : 0}`,
  );
}

check(
  'welcome copy present',
  stepsSource.includes("Welcome to RENKOO") &&
    stepsSource.includes("Let's get your first Search Growth insight."),
);
check(
  'completion copy present',
  stepsSource.includes('You are ready') &&
    stepsSource.includes('Search Visibility → Decisions → Action → Verification → Outcomes'),
);

/* ---------- routes exist ---------- */

const appDir = join(src, 'app');
for (const s of all) {
  const page = join(appDir, s.route.replace(/^\//, ''), 'page.tsx');
  check(`route exists ${s.id} → ${s.route}`, existsSync(page), page);
}

/* ---------- data-tour anchor coverage ---------- */

const tsxFiles = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.tsx?$/.test(entry.name)) tsxFiles.push(full);
  }
})(src);

const anchored = new Set();
for (const file of tsxFiles) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/data-tour="([^"]+)"/g)) anchored.add(m[1]);
  for (const m of text.matchAll(/tourAnchor="([^"]+)"/g)) anchored.add(m[1]);
  for (const m of text.matchAll(/'data-tour':\s*'([^']+)'/g)) anchored.add(m[1]);
}

for (const s of all) {
  if (!s.target) continue;
  check(`anchor coverage ${s.id} → ${s.target}`, anchored.has(s.target), 'no data-tour/tourAnchor found');
}

for (const anchor of ['restart-tour']) {
  check(`restart anchor exists (${anchor})`, anchored.has(anchor));
}

/* ---------- await semantics ---------- */

const knownAwaits = new Set([
  'websites', 'crawl', 'gsc', 'gsc-property',
  'ga4', 'ga4-property', 'baseline', 'route',
]);

for (const s of all) {
  if (!s.await) continue;
  check(`known await ${s.id}:${s.await}`, knownAwaits.has(s.await));
  if (s.await === 'route') {
    check(
      `route await has awaitRoute ${s.id}`,
      typeof s.awaitRoute === 'string' && s.awaitRoute.startsWith('/'),
    );
    check(
      `route await target exists ${s.id}`,
      existsSync(join(appDir, s.awaitRoute.replace(/^\//, ''), 'page.tsx')),
    );
  }
}

const optionalGa4 = core.filter((s) => s.id === 'connect-ga4' || s.id === 'ga4-property');
check(
  'GA4 steps optional + skippable',
  optionalGa4.length === 2 && optionalGa4.every((s) => s.skippable && /optional:\s*true/.test(s.raw)),
);
check(
  'website step not skippable (tour-level Skip tour always available)',
  core.some((s) => s.id === 'website' && !hasProp(s.raw, 'skip') && /skippable:\s*false/.test(s.raw)),
);

/* ---------- telemetry vocabulary ---------- */

const storageSource = read('components/tour/tourStorage.ts');
for (const ev of ['TOUR_STARTED', 'TOUR_STEP_VIEWED', 'TOUR_STEP_COMPLETED', 'TOUR_STEP_SKIPPED', 'TOUR_COMPLETED', 'TOUR_DISMISSED']) {
  check(`telemetry event ${ev}`, storageSource.includes(`'${ev}'`));
}
check('telemetry bounded (no unbounded growth)', /slice\(-\w+\)|slice\(-\d+\)/.test(storageSource));
check('no PII in telemetry record', !/email|token|password/i.test(storageSource));

/* ---------- engine reuses existing APIs ---------- */

const apiSource = read('lib/api.ts');
for (const fn of ['getWebsites', 'getFirstValueStatus', 'getGoogleHealth', 'getGoogleConnectionStatus', 'getCurrentAccount', 'invalidateSessionCache', 'isAuthenticated']) {
  check(
    `engine API exists: ${fn}`,
    new RegExp(`export (async )?function ${fn}`).test(apiSource),
  );
}

const tourEngineSource = read('components/tour/TourProvider.tsx');
check('provider polls only (no new endpoints)', !/fetch\(|axios/.test(tourEngineSource));
check(
  'provider imports tourEvents (no bundle duplication)',
  tourEngineSource.includes("from './tourEvents'"),
);

/* ---------- overlay accessibility ---------- */

const overlaySource = read('components/tour/TourOverlay.tsx');
check('dialog semantics', overlaySource.includes('role="dialog"'));
check('escape handling', overlaySource.includes("'Escape'") || overlaySource.includes('"Escape"'));
check('step counter with live region', overlaySource.includes('aria-live'));
check('overlay never blocks target (pointer-events-none)', overlaySource.includes('pointer-events-none'));
check('mobile bottom sheet', overlaySource.includes('isMobile'));

/* ---------- user-controlled progression (Part A) ---------- */

const tourProviderSource = read('components/tour/TourProvider.tsx');

check(
  'no auto-advance helper remains',
  !tourProviderSource.includes('completeCoreStep'),
);
check(
  'phase state machine exists',
  tourProviderSource.includes("useState<StepPhase>('idle')") &&
    tourProviderSource.includes("setPhase('done')") &&
    tourProviderSource.includes("setPhase('working')") &&
    tourProviderSource.includes("setPhase('blocked')"),
);
check(
  'poll reports truth only (no advance/router in poll)',
  (() => {
    const start = tourProviderSource.indexOf('async function poll()');
    if (start < 0) return false;
    const block = tourProviderSource.slice(start, start + 1800);
    return !block.includes('advance(') && !block.includes('router.push');
  })(),
);
check(
  'route effect marks done without advancing',
  (() => {
    const start = tourProviderSource.indexOf('Route-change detection');
    if (start < 0) return false;
    const block = tourProviderSource.slice(start, start + 1200);
    return block.includes("setPhase('done')") && !block.includes('advance(');
  })(),
);
check(
  'explicit Next records completion then advances',
  tourProviderSource.includes("'TOUR_STEP_COMPLETED'") &&
    tourProviderSource.includes('advance('),
);
check(
  'no automatic-progression copy',
  !overlaySource.includes('continues automatically') &&
    !tourProviderSource.includes('continues automatically') &&
    !stepsSource.includes('continues automatically'),
);
check(
  'waiting copy is explicit',
  overlaySource.includes("Complete this step in RENKOO. We'll detect when it's ready.") ||
    overlaySource.includes('Complete this step in RENKOO. We will'),
);
check(
  'working copy is explicit',
  overlaySource.includes('RENKOO is working on this step'),
);
check(
  'Next gated on done in overlay',
  overlaySource.includes("phase === 'done'"),
);
check(
  'welcome offers Start Tour / Skip Tour',
  overlaySource.includes('Start Tour') && overlaySource.includes('Skip Tour'),
);
check(
  'welcome does not auto-start (gate only shows)',
  tourProviderSource.includes('setShowWelcome(true)') &&
    !/welcome[\s\S]{0,400}startTour\('core'\)/.test(
      tourProviderSource.slice(tourProviderSource.indexOf('welcome gate')),
    ),
);
check(
  'resume pill copy restores current step',
  overlaySource.includes('Resume your guided tour'),
);
check(
  'final step has no auto-redirect',
  (() => {
    const start = overlaySource.indexOf('Core completion card');
    if (start < 0) return false;
    const block = overlaySource.slice(start, start + 2500);
    return block.includes('Go to Command Center') && !block.includes('router.push');
  })(),
);
check(
  'CTA activates the real target (click-through)',
  tourProviderSource.includes('el.click()') && overlaySource.includes('onCta'),
);
check(
  'blocked phase renders honestly',
  overlaySource.includes("phase === 'blocked'") && overlaySource.includes('hit a problem'),
);

/* Every awaited step needs completion copy; action
 * steps need a CTA label for the real control. */
const awaitedSteps = all.filter((s) => s.await);
for (const s of awaitedSteps) {
  const block = s.raw;
  check(
    `completion copy ${s.id}`,
    /completedTitle:\s*'/.test(block) && /completedBody:\s*'/.test(block),
  );
}
const ctaExpected = ['website', 'crawl', 'connect-gsc', 'gsc-property', 'connect-ga4', 'ga4-property'];
for (const id of ctaExpected) {
  const s = all.find((x) => x.id === id);
  check(
    `action CTA label ${id}`,
    !!s && /ctaLabel:\s*'/.test(s.raw),
  );
}

/* ---------- route-aware journey (§11) ---------- */

const expectedRoutes = [
  '/first-value', '/first-value', '/first-value',
  '/first-value', '/first-value', '/first-value',
  '/first-value', '/command-center', '/command-center',
  '/growth-plan', '/growth-work', '/growth-work',
  '/growth-work', '/growth-work',
];
check(
  'core route sequence matches product journey',
  JSON.stringify(core.map((s) => s.route)) ===
    JSON.stringify(expectedRoutes),
  core.map((s) => `${s.id}:${s.route}`).join(','),
);

const routeHops = [
  ['baseline', 'command-center', '/command-center'],
  ['command-center', 'top-actions', '/command-center'],
  ['top-actions', 'growth-plan', '/growth-plan'],
  ['growth-plan', 'growth-work', '/growth-work'],
  ['outcomes', 'complete', '/growth-work'],
];
for (const [from, to, route] of routeHops) {
  const a = core.findIndex((s) => s.id === from);
  const b = core.findIndex((s) => s.id === to);
  check(
    `hop ${from} → ${to} lands on ${route}`,
    a >= 0 && b === a + 1 && core[b].route === route,
  );
}

check(
  'GSC/GA4 steps stay on first-value (OAuth returns there)',
  ['connect-gsc', 'gsc-property', 'connect-ga4', 'ga4-property'].every(
    (id) =>
      core.find((s) => s.id === id)?.route ===
      '/first-value',
  ),
);
check(
  'verification uses existing VERIFY section route',
  core.find((s) => s.id === 'verification')?.route ===
    '/growth-work' &&
    core.find((s) => s.id === 'verification')
      ?.target === 'verification',
);
check(
  'outcomes uses existing outcomes section route',
  core.find((s) => s.id === 'outcomes')?.route ===
    '/growth-work' &&
    core.find((s) => s.id === 'outcomes')?.target ===
      'outcomes',
);
check(
  'final step completes only via explicit CTA',
  overlaySource.includes('onClick={onFinishCore}') &&
    tourProviderSource.includes('onFinishCore'),
);
check(
  'advance navigates only when routes differ',
  tourProviderSource.includes(
    'upcoming.route !== window.location.pathname',
  ),
);

/* Transition + target-wait UX. */
check(
  'transition state on user-driven navigation',
  tourProviderSource.includes('setNavigating(true)') &&
    overlaySource.includes('Taking you to the next step'),
);
check(
  'resume pill hidden while navigating',
  tourProviderSource.includes("!navigating") ||
    tourProviderSource.includes('&& !navigating'),
);
check(
  'target observed via rAF with timeout + scroll',
  tourProviderSource.includes('requestAnimationFrame') &&
    tourProviderSource.includes('TARGET_TIMEOUT_MS') &&
    tourProviderSource.includes('scrollIntoView'),
);
check(
  'waiting card while target renders',
  /Waiting for this RENKOO feature to\s+load/.test(
    overlaySource,
  ),
);
check(
  'not-found card is honest with Retry',
  /Couldn.+?t find this step/.test(overlaySource) &&
    !overlaySource.includes('continue below without losing progress'),
);
check(
  'Retry re-runs target observation',
  tourProviderSource.includes('setRetryKey') &&
    (overlaySource.match(/onClick=\{onRetry\}/g) ?? [])
      .length >= 2,
);
check(
  'no tooltip before target exists',
  /targetEl &&\s*rect &&/.test(overlaySource),
);
check(
  'Back navigates across routes',
  tourProviderSource.includes(
    'previous.route !== window.location.pathname',
  ),
);
check(
  'Resume navigates to persisted step route',
  tourProviderSource.includes(
    'router.push(activeEntry.step.route)',
  ),
);
check(
  'progress persisted per user (step index + group)',
  read(
    'components/tour/tourStorage.ts',
  ).includes('stepIndex') &&
    read('components/tour/tourStorage.ts').includes(
      'discoveryGroup',
    ) &&
    read('components/tour/tourStorage.ts').includes(
      'renkoo_tour_state',
    ),
);
check(
  'mobile transition card is viewport-safe',
  overlaySource.includes('Taking you to the next step') &&
    overlaySource.includes('max-w-sm'),
);

/* ---------- layout mount is lazy ---------- */

const layoutSource = read('app/layout.tsx');
check('tour loads via next/dynamic ssr:false', /dynamic\(/.test(layoutSource) && /ssr:\s*false/.test(layoutSource));
check('tour mounts inside AuthGate', /<AuthGate>[\s\S]*TourRoot[\s\S]*<\/AuthGate>/.test(layoutSource));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

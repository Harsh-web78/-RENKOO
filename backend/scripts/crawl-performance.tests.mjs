/*
 * RENKOO — crawl performance regression tests (node, no runner).
 *
 * Guards the three safe crawl optimizations without
 * changing crawl semantics:
 *  1. stylesheet blocking in the existing route policy
 *  2. non-HTML pre-filter at both queue ingress points
 *     (start URL never filtered)
 *  3. overlapped audit + link-graph write tails with
 *     identical error propagation
 * plus the safety invariants that must never regress:
 * SSRF posture, caps, concurrency clamp, robots/
 * sitemap discovery, canonical-from-DOM, no sleeps,
 * no screenshots, no per-link inserts.
 *
 * The extension policy is executed as the REAL regex
 * extracted from crawl.service.ts (not a copy).
 * Run from backend/: node scripts/crawl-performance.tests.mjs
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const backend = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
);
const readB = (p) =>
  readFileSync(join(backend, p), 'utf8');

let passed = 0;
let failed = 0;
function check(label, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`ok ${label}`);
  } else {
    failed += 1;
    console.error(
      `FAIL ${label}${detail ? ` — ${detail}` : ''}`,
    );
  }
}

const src = readB('src/crawl/crawl.service.ts');

/* ---------- 1. stylesheet blocking ---------- */

check(
  'stylesheet aborted in route policy',
  /resourceType\s*===\s*'stylesheet'/.test(src),
);
check(
  'image/media/font blocking intact',
  /resourceType\s*===\s*'image'/.test(src) &&
    /resourceType\s*===\s*'media'/.test(src) &&
    /resourceType\s*===\s*'font'/.test(src),
);
check(
  'scripts still execute (JS-rendered DOM preserved)',
  !/resourceType\s*===\s*'script'/.test(src),
);
check(
  'tracker host block list intact',
  src.includes('googletagmanager.com') &&
    src.includes('doubleclick.net'),
);

/* ---------- 2. non-HTML pre-filter ---------- */

const helperDef = src.indexOf(
  'private isProbablyNonHtmlUrl(',
);
check('non-HTML helper exists', helperDef >= 0);

const callSites = (
  src.match(/this\.isProbablyNonHtmlUrl\(/g) ?? []
).length;
check(
  'filter applied at both queue ingress points only',
  callSites === 2,
  `got ${callSites}`,
);

/* The start URL is queued unconditionally. */
{
  const start = src.indexOf('queue.push(startUrl)');
  const block = src.slice(
    Math.max(0, start - 400),
    start,
  );
  check(
    'start URL never filtered',
    !block.includes('isProbablyNonHtmlUrl'),
  );
}

/* Execute the REAL production regex from source. */
let nonHtml = null;
{
  const m = src.match(
    /return\s*(\/\\\.\([^)]+\)\$\/i)\.test\(\s*pathname/,
  );
  check('production regex extracted', !!m);
  if (m) {
    // eslint-disable-next-line no-eval
    nonHtml = eval(m[1]);
  }
}

if (nonHtml) {
  const skipped = [
    'https://acme.com/whitepaper.pdf',
    'https://acme.com/logo.PNG',
    'https://acme.com/photo.webp',
    'https://acme.com/clip.mp4',
    'https://acme.com/archive.zip',
    'https://acme.com/theme/style.CSS',
    'https://acme.com/app.JS',
    'https://acme.com/sitemap-posts.xml',
    'https://acme.com/feed.json',
    'https://acme.com/data.csv',
    'https://acme.com/deck.pptx',
    'https://acme.com/font.woff2',
  ];
  const kept = [
    'https://acme.com/',
    'https://acme.com/pricing',
    'https://acme.com/blog/seo-guide',
    'https://acme.com/search?q=pdf',
    'https://acme.com/PDF-guide',
    'https://acme.com/page.pdf/preview',
  ];
  const u = (s) =>
    new URL(s).pathname.toLowerCase();
  check(
    'non-HTML bytes skipped',
    skipped.every((s) => nonHtml.test(u(s))),
  );
  check(
    'HTML pages never skipped',
    kept.every((s) => !nonHtml.test(u(s))),
  );
}

/* Sitemap discovery untouched (plain fetch, no recursion change). */
check(
  'robots fetch intact',
  src.includes('fetchRobotsTxt(') &&
    src.includes('AbortSignal.timeout('),
);
check(
  'sitemap fetch intact',
  src.includes('fetchSitemap(') &&
    src.includes('<loc>'),
);

/* ---------- 3. overlapped write tails ---------- */

check(
  'audit + link writes overlap',
  /await Promise\.all\(\[\s*auditPromise,\s*linksPromise,\s*\]\)/.test(
    src,
  ),
);
check(
  'audit errors still propagate (no swallow)',
  (() => {
    const start = src.indexOf('const auditPromise =');
    if (start < 0) return false;
    const block = src.slice(start, start + 2200);
    /* links leg keeps its own try/catch; the
     * audit leg has none — rejection surfaces. */
    return (
      block.includes('persistPageEdges') &&
      block.includes('console.error') &&
      !/auditPromise[\s\S]{0,200}catch/.test(block)
    );
  })(),
);
check(
  'link edges stay batched (createMany, capped)',
  src.includes('createMany'),
);

/* ---------- safety invariants ---------- */

check(
  'same-host gate intact (SSRF posture)',
  src.includes('websiteHost') &&
    /linkHost\s*!==\s*websiteHost/.test(src),
);
check(
  'caps intact (pages/time/timeout via clamped env)',
  src.includes('MAX_PAGES') &&
    src.includes('MAX_CRAWL_TIME_MS') &&
    src.includes('PAGE_TIMEOUT'),
);
check(
  'concurrency stays bounded 1..10',
  /PAGE_CONCURRENCY[\s\S]{0,120}1,\s*10/.test(src),
);
check(
  'canonical read from DOM (no second navigation)',
  src.includes('link[rel="canonical"]'),
);
check(
  'no fixed sleeps in hot loop',
  !/waitForTimeout|waitForLoadState|waitForSelector/.test(
    src,
  ),
);
check(
  'no screenshots or PDFs captured',
  !/\.screenshot\(|\.pdf\(/.test(src),
);
check(
  'no per-link inserts (edges batched per page)',
  !/for\s*\([^)]*\)\s*{[^}]*crawlLink\.create\(/.test(src),
);
check(
  'no per-page external/AI calls',
  !/DataForSEO|openai|anthropic/i.test(src),
);
check(
  'worker pool + browser lifecycle intact',
  /Promise\.all\(\s*Array\.from\(/.test(src) &&
    src.includes('browser.close()') &&
    src.includes('context.close()'),
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

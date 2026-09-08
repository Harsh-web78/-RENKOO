/*
 * RENKOO — Playwright production-equivalence smoke test.
 *
 * Verifies, with the EXACT launch flags the website crawler uses:
 *   1. the playwright package loads
 *   2. the browser executable exists on disk
 *   3. Chromium launches (headless shell, as in production)
 *   4. a page opens and loads an HTTPS URL
 *   5. the browser closes cleanly
 *
 * Usage:
 *   node backend/scripts/verify-playwright.mjs [url]
 *
 * On Render this can run in a shell session AFTER the build step
 * (`npx playwright install chromium`) to prove the runtime has
 * the browser before any customer crawl runs. Exit code is 0 on
 * success, 1 on any failure. No database, no auth, no mocks.
 */

import { chromium } from 'playwright';

const TARGET_URL =
  process.argv[2] ||
  'https://example.com';

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
];

function fail(message, error) {
  console.error(`[smoke] FAIL: ${message}`);

  if (error) {
    console.error(
      error instanceof Error
        ? error.stack || error.message
        : error,
    );
  }

  process.exit(1);
}

const executablePath =
  chromium.executablePath();

console.log(
  `[smoke] playwright executable: ${executablePath}`,
);

const { existsSync } = await import('node:fs');

if (!existsSync(executablePath)) {
  fail(
    `browser executable missing at ${executablePath}. ` +
      'Run `npx playwright install chromium` for the installed Playwright version.',
  );
}

console.log('[smoke] executable exists, launching...');

let browser;

try {
  const startedAt = Date.now();

  browser = await chromium.launch({
    headless: true,
    args: LAUNCH_ARGS,
  });

  console.log(
    `[smoke] launched in ${Date.now() - startedAt}ms`,
  );

  const context =
    await browser.newContext();

  await context.route(
    '**/*',
    async (route) => {
      try {
        const type =
          route.request().resourceType();

        if (
          type === 'image' ||
          type === 'media' ||
          type === 'font'
        ) {
          await route.abort();
          return;
        }

        await route.continue();
      } catch {
        try {
          await route.continue();
        } catch {
          // Ignore routing teardown races.
        }
      }
    },
  );

  const page =
    await context.newPage();

  const navigatedAt = Date.now();

  const response = await page.goto(
    TARGET_URL,
    {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    },
  );

  console.log(
    `[smoke] navigated in ${Date.now() - navigatedAt}ms`,
  );
  console.log(
    `[smoke] status: ${response?.status() ?? 'no-response'}`,
  );
  console.log(
    `[smoke] final URL: ${page.url()}`,
  );
  console.log(
    `[smoke] title: ${(await page.title()).slice(0, 120) || '(empty)'}`,
  );

  await context.close();
  await browser.close();
  browser = null;

  console.log('[smoke] browser closed cleanly — PASS');
} catch (error) {
  try {
    if (browser) {
      await browser.close();
    }
  } catch {
    // Ignore close errors during failure teardown.
  }

  fail('browser smoke test failed', error);
}

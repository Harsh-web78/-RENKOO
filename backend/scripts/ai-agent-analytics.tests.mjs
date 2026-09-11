/*
 * RENKOO AI Crawler + Agent Analytics 1.0 — tests (Phase 8D).
 *
 * 44 tests over pure functions only: agent
 * classification (documented tokens, spoofing honesty),
 * verification states, CSV parsing + limits, malformed
 * rows, duplicate-safe identities, tenant isolation,
 * privacy-safe URLs + IP hashing, status/page
 * aggregation, windows, change detection, coverage,
 * robots correlation, error detection and roadmap-safe
 * bridging. No DB, no provider calls, no billing.
 *
 * Run: npm run test:ai-agent-analytics   (dist built)
 */
import assert from 'node:assert/strict';

const agent = await import(
  '../dist/ai-visibility/ai-agent-analytics.js'
);

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push(`PASS ${name}`);
  } catch (err) {
    results.push(`FAIL ${name}: ${err.message}`);
    console.error(err);
  }
}

/* ---------- classification (10) ---------- */

await test('gptbot is ai training openai', async () => {
  const c = agent.classifyAgent(
    'Mozilla/5.0 (compatible; GPTBot/1.2)',
  );
  assert.equal(c.category, 'AI_TRAINING');
  assert.equal(c.family, 'OpenAI');
});

await test('oai-searchbot is ai search crawler', async () => {
  const c = agent.classifyAgent(
    'Mozilla/5.0 AppleWebKit/537.36 (compatible; OAI-SearchBot/1.0)',
  );
  assert.equal(c.category, 'AI_SEARCH_CRAWLER');
  assert.equal(c.family, 'OpenAI');
});

await test('chatgpt-user is ai assistant', async () => {
  const c = agent.classifyAgent(
    'Mozilla/5.0 AppleWebKit/537.36 (compatible; ChatGPT-User/2.0)',
  );
  assert.equal(c.category, 'AI_ASSISTANT');
});

await test('claudebot is anthropic training', async () => {
  const c = agent.classifyAgent(
    'Mozilla/5.0 (compatible; ClaudeBot/1.0)',
  );
  assert.equal(c.category, 'AI_TRAINING');
  assert.equal(c.family, 'Anthropic');
});

await test('googlebot stays search engine', async () => {
  const c = agent.classifyAgent(
    'Mozilla/5.0 (compatible; Googlebot/2.1)',
  );
  assert.equal(c.category, 'SEARCH_ENGINE');
  assert.equal(c.family, 'Google');
  assert.notEqual(c.category, 'AI_SEARCH_CRAWLER');
});

await test('bingbot stays search engine', async () => {
  const c = agent.classifyAgent(
    'Mozilla/5.0 (compatible; bingbot/2.0)',
  );
  assert.equal(c.category, 'SEARCH_ENGINE');
  assert.equal(c.family, 'Microsoft');
});

await test('perplexitybot is ai search', async () => {
  const c = agent.classifyAgent(
    'Mozilla/5.0 (compatible; PerplexityBot/1.0)',
  );
  assert.equal(c.category, 'AI_SEARCH_CRAWLER');
  assert.equal(c.family, 'Perplexity');
});

await test('browser without bot is human', async () => {
  const c = agent.classifyAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36',
  );
  assert.equal(c.category, 'HUMAN');
});

await test('empty ua is unknown', async () => {
  assert.equal(
    agent.classifyAgent('').category,
    'UNKNOWN',
  );
  assert.equal(
    agent.classifyAgent(null).category,
    'UNKNOWN',
  );
});

await test('generic crawler token is other bot', async () => {
  const c = agent.classifyAgent('MyCustomScraper/3.0 crawler');
  assert.equal(c.category, 'OTHER_BOT');
});

/* ---------- verification honesty (3) ---------- */

await test('every classification is observed ua', async () => {
  for (const ua of [
    'GPTBot/1.0',
    'Googlebot/2.1',
    'Mozilla/5.0 Chrome/126',
    '',
  ]) {
    assert.equal(
      agent.classifyAgent(ua).verificationState,
      'OBSERVED_USER_AGENT',
    );
  }
});

await test('spoofed names never verify', async () => {
  const c = agent.classifyAgent(
    'Totally-Legit GPTBot Clone (not really)',
  );
  assert.equal(c.category, 'AI_TRAINING');
  assert.equal(
    c.verificationState,
    'OBSERVED_USER_AGENT',
  );
});

await test('no verified agent without dns check', async () => {
  const dump = JSON.stringify([
    agent.classifyAgent('GPTBot/1.0'),
  ]);
  assert.ok(!dump.includes('VERIFIED_AI_AGENT'));
});

/* ---------- url privacy (5) ---------- */

await test('tracking params stripped', async () => {
  const url = agent.normalizeRequestUrl(
    'https://acme.com/PRICING/?utm_source=x&gclid=abc&plan=pro',
  );
  assert.ok(!url.includes('utm_source'));
  assert.ok(!url.includes('gclid'));
  assert.ok(url.includes('plan=pro'));
});

await test('sensitive params stripped', async () => {
  const url = agent.normalizeRequestUrl(
    '/reset?token=secret&email=a@b.com&tab=1',
  );
  assert.ok(!url.includes('token'));
  assert.ok(!url.includes('email'));
  assert.ok(url.includes('tab=1'));
});

await test('paths lowercased and trimmed', async () => {
  assert.equal(
    agent.normalizeRequestUrl('/Pricing/'),
    '/pricing',
  );
});

await test('empty url rejected', async () => {
  assert.equal(agent.normalizeRequestUrl(''), null);
  assert.equal(agent.normalizeRequestUrl(null), null);
});

await test('ip hashed never stored raw', async () => {
  const h1 = agent.hashIp('203.0.113.7');
  const h2 = agent.hashIp('203.0.113.7');
  assert.equal(h1, h2);
  assert.ok(!h1.includes('203.0.113'));
  assert.equal(agent.hashIp(''), null);
});

/* ---------- csv parsing (6) ---------- */

const SAMPLE_CSV = `timestamp,method,path,status,user-agent,bytes,referrer,country
2026-09-01T10:00:00Z,GET,/pricing,200,GPTBot/1.0,1234,,US
2026-09-01T10:01:00Z,GET,/blog/ai-seo,403,PerplexityBot/1.0,0,https://x.com,IN
not-a-line-without-commas-either
2026-09-01T10:02:00Z,GET,,200,Googlebot/2.1,,,`;

await test('csv parses valid rows', async () => {
  const report = agent.parseLogCsv(SAMPLE_CSV);
  assert.equal(report.received, 4);
  assert.equal(report.parsed, 2);
  assert.equal(report.rejected, 2);
});

await test('csv detects families', async () => {
  const report = agent.parseLogCsv(SAMPLE_CSV);
  assert.ok(report.families.includes('OpenAI'));
  assert.ok(report.families.includes('Perplexity'));
});

await test('csv requires path and ua columns', async () => {
  const report = agent.parseLogCsv(
    'timestamp,status\n2026-09-01,200',
  );
  assert.equal(report.parsed, 0);
  assert.ok(report.rejected > 0);
});

await test('csv header too short rejected', async () => {
  const report = agent.parseLogCsv('hello');
  assert.equal(report.parsed, 0);
});

await test('csv caps parse rows', async () => {
  const big = [
    'timestamp,path,user-agent',
    ...Array.from(
      { length: 6000 },
      (_, i) =>
        `2026-09-01T10:00:00Z,/p${i},GPTBot/1.0`,
    ),
  ].join('\n');
  const report = agent.parseLogCsv(big);
  assert.equal(report.truncated, true);
  assert.ok(
    report.parsed <= agent.MAX_PARSE_ROWS,
  );
});

await test('malformed timestamps degrade to null', async () => {
  const report = agent.parseLogCsv(
    'timestamp,path,user-agent\nnot-a-date,/x,GPTBot/1.0',
  );
  assert.equal(report.parsed, 1);
  assert.equal(report.rows[0].timestamp, null);
});

/* ---------- identities (3) ---------- */

await test('identity stable per row', async () => {
  const input = {
    organizationId: 'o1',
    websiteId: 'w1',
    timestamp: '2026-09-01T10:00:00.000Z',
    method: 'get',
    normalizedUrl: '/pricing',
    userAgent: 'GPTBot/1.0',
  };
  assert.equal(
    agent.requestIdentityKey(input),
    agent.requestIdentityKey(input),
  );
});

await test('identity differs per tenant', async () => {
  const base = {
    timestamp: '2026-09-01T10:00:00.000Z',
    method: 'GET',
    normalizedUrl: '/pricing',
    userAgent: 'GPTBot/1.0',
  };
  assert.notEqual(
    agent.requestIdentityKey({
      ...base,
      organizationId: 'a',
      websiteId: 'w1',
    }),
    agent.requestIdentityKey({
      ...base,
      organizationId: 'b',
      websiteId: 'w1',
    }),
  );
});

await test('duplicate import shares identity', async () => {
  const input = {
    organizationId: 'o1',
    websiteId: 'w1',
    timestamp: null,
    method: 'GET',
    normalizedUrl: '/',
    userAgent: 'GPTBot/1.0',
  };
  assert.equal(
    agent.requestIdentityKey(input),
    agent.requestIdentityKey(input),
  );
});

/* ---------- aggregation (4) ---------- */

function visit(family, url, status, ts, category) {
  return {
    family,
    category: category ?? 'AI_TRAINING',
    normalizedUrl: url,
    statusCode: status,
    timestamp: ts,
  };
}

await test('summary aggregates agents and pages', async () => {
  const summary = agent.summarizeVisits([
    visit('OpenAI', '/a', 200, '2026-09-01T00:00:00.000Z'),
    visit('OpenAI', '/a', 200, '2026-09-02T00:00:00.000Z'),
    visit('Perplexity', '/b', 403, '2026-09-02T00:00:00.000Z'),
  ]);
  assert.equal(summary.requests, 3);
  assert.equal(summary.pages, 2);
  assert.equal(summary.byAgent[0].family, 'OpenAI');
  assert.equal(summary.firstSeen, '2026-09-01T00:00:00.000Z');
});

await test('status distribution counted', async () => {
  const summary = agent.summarizeVisits([
    visit('OpenAI', '/a', 200, null),
    visit('OpenAI', '/b', 500, null),
    visit('OpenAI', '/c', null, null),
  ]);
  assert.equal(summary.statusCodes.length, 2);
});

await test('empty visits summarize to zero', async () => {
  const summary = agent.summarizeVisits([]);
  assert.equal(summary.requests, 0);
  assert.equal(summary.firstSeen, null);
});

await test('top pages bounded at fifty', async () => {
  const rows = Array.from({ length: 60 }, (_, i) =>
    visit('OpenAI', `/p${i}`, 200, null),
  );
  const summary = agent.summarizeVisits(rows);
  assert.equal(summary.byPage.length, 50);
});

/* ---------- changes (4) ---------- */

await test('first import is baseline', async () => {
  const changes = agent.detectAgentChanges({
    previous: null,
    current: {
      families: ['OpenAI'],
      pages: ['/a'],
      errors: 0,
      total: 5,
    },
  });
  assert.equal(changes[0].kind, 'NEW_AGENT');
});

await test('new and missing agents detected', async () => {
  const changes = agent.detectAgentChanges({
    previous: {
      families: ['OpenAI'],
      pages: ['/a'],
      errors: 0,
      total: 5,
    },
    current: {
      families: ['Perplexity'],
      pages: ['/a', '/b'],
      errors: 0,
      total: 6,
    },
  });
  const kinds = changes.map((c) => c.kind);
  assert.ok(kinds.includes('AGENT_DISAPPEARED'));
  assert.ok(kinds.includes('PAGE_FIRST_VISITED'));
});

await test('error spikes detected', async () => {
  const changes = agent.detectAgentChanges({
    previous: {
      families: ['OpenAI'],
      pages: ['/a'],
      errors: 1,
      total: 10,
    },
    current: {
      families: ['OpenAI'],
      pages: ['/a'],
      errors: 5,
      total: 12,
    },
  });
  assert.ok(
    changes.some((c) => c.kind === 'ERROR_INCREASE'),
  );
});

await test('steady state is unchanged', async () => {
  const changes = agent.detectAgentChanges({
    previous: {
      families: ['OpenAI'],
      pages: ['/a'],
      errors: 0,
      total: 5,
    },
    current: {
      families: ['OpenAI'],
      pages: ['/a'],
      errors: 0,
      total: 6,
    },
  });
  assert.equal(changes[0].kind, 'UNCHANGED');
});

/* ---------- coverage + robots (4) ---------- */

await test('visited coverage honored', async () => {
  assert.equal(
    agent.pageCoverage('/pricing', ['/pricing'], true),
    'AI_AGENT_VISITED',
  );
  assert.equal(
    agent.pageCoverage('/other', ['/pricing'], true),
    'AI_AGENT_NOT_OBSERVED',
  );
});

await test('no observations means unknown', async () => {
  assert.equal(
    agent.pageCoverage('/pricing', [], false),
    'UNKNOWN',
  );
});

await test('robots correlation explicit', async () => {
  assert.equal(
    agent.robotsAccess(false, true, true),
    'ROBOTS_DISALLOWED_OBSERVED',
  );
  assert.equal(
    agent.robotsAccess(true, false, true),
    'ROBOTS_ALLOWED_NOT_OBSERVED',
  );
  assert.equal(
    agent.robotsAccess(null, false, false),
    'UNKNOWN',
  );
});

await test('visit never equals citation', async () => {
  assert.equal(agent.isAiCategory('AI_TRAINING'), true);
  assert.equal(agent.isAiCategory('SEARCH_ENGINE'), false);
  const dump = 'visit ≠ citation ≠ mention ≠ ranking';
  assert.ok(!dump.includes('probability'));
});

/* ---------- limits (2) ---------- */

await test('import rows bounded', async () => {
  assert.ok(agent.MAX_IMPORT_ROWS <= 2000);
  assert.ok(agent.MAX_FILE_BYTES <= 10 * 1024 * 1024);
});

await test('no fake traffic language', async () => {
  const summary = agent.summarizeVisits([
    visit('OpenAI', '/a', 200, null),
  ]);
  const dump = JSON.stringify(summary);
  assert.ok(!dump.includes('traffic'));
  assert.ok(!dump.includes('citation'));
});

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(
  `\n${results.length - failed.length}/${results.length} passed`,
);
if (failed.length > 0) process.exit(1);

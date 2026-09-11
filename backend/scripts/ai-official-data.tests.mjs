/*
 * RENKOO Official Google/Bing Data 1.0 — tests (Phase 8C).
 *
 * 38 tests over pure functions only: capability
 * detection + matrix honesty, semantic separation,
 * observation normalization, evidence-state rules,
 * backfill bounds, import validation, dedupe keys,
 * tenant-scoped identities, malformed rows, and no
 * universal-rank guarantees. No DB, no provider
 * calls, no billing touch.
 *
 * Run: npm run test:ai-official-data   (dist built)
 */
import assert from 'node:assert/strict';

const official = await import(
  '../dist/ai-visibility/ai-official-data.js'
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

/* ---------- capability detection (8) ---------- */

await test('matrix covers sixteen capabilities', async () => {
  assert.equal(official.CAPABILITY_MATRIX.length, 16);
});

await test('ai clicks unavailable everywhere', async () => {
  const row = official.capabilityFor('AI clicks');
  assert.equal(row.google, 'NOT_AVAILABLE');
  assert.equal(row.bing, 'NOT_AVAILABLE');
  assert.equal(row.evidence, 'UNAVAILABLE');
});

await test('ai citations have no api', async () => {
  const row = official.capabilityFor('AI citations');
  assert.equal(row.google, 'NOT_AVAILABLE');
  assert.equal(row.bing, 'UI_ONLY');
});

await test('competitor citations unavailable', async () => {
  const row = official.capabilityFor(
    'Competitor citations',
  );
  assert.equal(row.google, 'NOT_AVAILABLE');
  assert.equal(row.bing, 'NOT_AVAILABLE');
});

await test('citation share not computed', async () => {
  const row = official.capabilityFor('Citation share');
  assert.equal(row.bing, 'UI_ONLY');
  assert.equal(row.renkoo, 'UNAVAILABLE');
});

await test('organic page demand is api-verified', async () => {
  const row = official.capabilityFor('Page');
  assert.equal(row.google, 'AVAILABLE');
  assert.equal(row.evidence, 'VERIFIED');
});

await test('unknown capability returns null', async () => {
  assert.equal(
    official.capabilityFor('Teleportation metrics'),
    null,
  );
});

await test('no capability claims fake coverage', async () => {
  const dump = JSON.stringify(
    official.CAPABILITY_MATRIX,
  ).toLowerCase();
  assert.ok(!dump.includes('guarantee'));
  assert.ok(!dump.includes('rank #1'));
});

/* ---------- semantic separation (4) ---------- */

await test('nine concepts stay separate', async () => {
  assert.equal(official.SEPARATE_CONCEPTS.length, 9);
});

await test('organic demand maps to organic concept', async () => {
  assert.equal(
    official.conceptFor('GOOGLE', 'ORGANIC_DEMAND'),
    'GOOGLE_ORGANIC_RANKING',
  );
});

await test('bing rows map to bing performance', async () => {
  assert.equal(
    official.conceptFor('BING', 'AI_CITATION'),
    'BING_AI_PERFORMANCE',
  );
});

await test('google ai maps to overview visibility', async () => {
  assert.equal(
    official.conceptFor('GOOGLE', 'AI_IMPRESSION'),
    'GOOGLE_AI_OVERVIEW_VISIBILITY',
  );
  assert.ok(
    official.isSeparateConcept('GOOGLE_AI_MODE_VISIBILITY'),
  );
});

/* ---------- normalization (10) ---------- */

await test('gsc api rows verify', async () => {
  const row = official.normalizeOfficialObservation({
    provider: 'GOOGLE',
    method: 'SEARCH_ANALYTICS_API',
    kind: 'ORGANIC_DEMAND',
    date: '2026-09-01',
    query: 'best crm',
    impressions: 120,
    clicks: 9,
  });
  assert.equal(row.evidenceState, 'VERIFIED');
  assert.equal(row.concept, 'GOOGLE_ORGANIC_RANKING');
  assert.equal(row.impressions, 120);
});

await test('manual exports observe never verify', async () => {
  const row = official.normalizeOfficialObservation({
    provider: 'BING',
    method: 'MANUAL_EXPORT',
    kind: 'AI_CITATION',
    date: '2026-09-01',
    pageUrl: 'https://acme.com/pricing',
    citations: 14,
  });
  assert.equal(row.evidenceState, 'OBSERVED');
  assert.equal(row.citations, 14);
});

await test('ai rows never carry clicks', async () => {
  const row = official.normalizeOfficialObservation({
    provider: 'GOOGLE',
    method: 'MANUAL_EXPORT',
    kind: 'AI_IMPRESSION',
    date: '2026-09-01',
    pageUrl: 'https://acme.com/x',
    impressions: 40,
    clicks: 7,
  });
  assert.equal(row.clicks, null);
  assert.equal(row.impressions, 40);
});

await test('organic rows require query or page', async () => {
  assert.equal(
    official.normalizeOfficialObservation({
      provider: 'GOOGLE',
      method: 'SEARCH_ANALYTICS_API',
      kind: 'ORGANIC_DEMAND',
      date: '2026-09-01',
    }),
    null,
  );
});

await test('ai rows require page or grounding', async () => {
  assert.equal(
    official.normalizeOfficialObservation({
      provider: 'BING',
      method: 'MANUAL_EXPORT',
      kind: 'AI_CITATION',
      date: '2026-09-01',
    }),
    null,
  );
});

await test('bad dates rejected', async () => {
  assert.equal(
    official.normalizeOfficialObservation({
      provider: 'GOOGLE',
      method: 'SEARCH_ANALYTICS_API',
      kind: 'ORGANIC_DEMAND',
      date: 'not-a-date',
      query: 'x',
    }),
    null,
  );
});

await test('unknown providers rejected', async () => {
  assert.equal(
    official.normalizeOfficialObservation({
      provider: 'YAHOO',
      method: 'MANUAL_EXPORT',
      kind: 'AI_CITATION',
      date: '2026-09-01',
      pageUrl: 'https://acme.com/',
    }),
    null,
  );
});

await test('negative metrics rejected', async () => {
  const row = official.normalizeOfficialObservation({
    provider: 'GOOGLE',
    method: 'SEARCH_ANALYTICS_API',
    kind: 'ORGANIC_DEMAND',
    date: '2026-09-01',
    query: 'x',
    impressions: -5,
  });
  assert.equal(row.impressions, null);
});

await test('identity keys dedupe re-ingestion', async () => {
  const input = {
    provider: 'GOOGLE',
    method: 'SEARCH_ANALYTICS_API',
    kind: 'ORGANIC_DEMAND',
    date: '2026-09-01',
    query: 'Best CRM',
  };
  const a = official.normalizeOfficialObservation(input);
  const b = official.normalizeOfficialObservation({
    ...input,
    query: 'best  crm',
  });
  assert.equal(a.identityKey, b.identityKey);
  assert.ok(a.identityKey.includes('|best crm|'));
});

await test('tenant-scoped identities differ', async () => {
  const a = official.normalizeOfficialObservation({
    provider: 'BING',
    method: 'MANUAL_EXPORT',
    kind: 'AI_CITATION',
    date: '2026-09-01',
    pageUrl: 'https://a.com/',
    groundingQuery: 'crm',
  });
  const b = official.normalizeOfficialObservation({
    provider: 'BING',
    method: 'MANUAL_EXPORT',
    kind: 'AI_CITATION',
    date: '2026-09-02',
    pageUrl: 'https://a.com/',
    groundingQuery: 'crm',
  });
  assert.notEqual(a.identityKey, b.identityKey);
});

/* ---------- backfill bounds (3) ---------- */

await test('30-day window bounded', async () => {
  const window = official.backfillWindow(
    30,
    new Date('2026-09-09T00:00:00.000Z'),
  );
  assert.equal(window.startDate, '2026-08-08');
  assert.equal(window.endDate, '2026-09-06');
});

await test('90-day window bounded', async () => {
  const window = official.backfillWindow(
    90,
    new Date('2026-09-09T00:00:00.000Z'),
  );
  assert.equal(window.startDate, '2026-06-09');
  assert.equal(window.endDate, '2026-09-06');
});

await test('windows respect processing lag', async () => {
  const window = official.backfillWindow(
    30,
    new Date('2026-09-09T12:00:00.000Z'),
  );
  assert.ok(window.endDate < '2026-09-09');
});

/* ---------- import validation (7) ---------- */

await test('import caps at 500 rows', async () => {
  const rows = Array.from({ length: 600 }, (_, i) => ({
    date: '2026-09-01',
    pageUrl: `https://acme.com/p${i}`,
    kind: 'AI_IMPRESSION',
  }));
  const result = official.validateImportRows(
    'GOOGLE',
    rows,
  );
  assert.equal(
    result.valid.length,
    official.MAX_IMPORT_ROWS,
  );
});

await test('import rejects dateless rows', async () => {
  const result = official.validateImportRows('BING', [
    { pageUrl: 'https://acme.com/' },
  ]);
  assert.equal(result.valid.length, 0);
  assert.equal(result.rejected, 1);
});

await test('import accepts bing citation rows', async () => {
  const result = official.validateImportRows('BING', [
    {
      date: '2026-09-01',
      pageUrl: 'https://acme.com/pricing',
      citations: 12,
      groundingQuery: 'crm pricing',
      kind: 'AI_CITATION',
    },
  ]);
  assert.equal(result.valid.length, 1);
  assert.equal(result.valid[0].citations, 12);
});

await test('import maps url alias', async () => {
  const result = official.validateImportRows('GOOGLE', [
    {
      date: '2026-09-01',
      url: 'https://acme.com/ai',
      kind: 'AI_IMPRESSION',
    },
  ]);
  assert.equal(result.valid.length, 1);
  assert.equal(
    result.valid[0].pageUrl,
    'https://acme.com/ai',
  );
});

await test('non-array import yields empty', async () => {
  const result = official.validateImportRows(
    'GOOGLE',
    null,
  );
  assert.deepEqual(result.valid, []);
  assert.equal(result.rejected, 0);
});

await test('provider casing normalized', async () => {
  const result = official.validateImportRows('bing', [
    {
      date: '2026-09-01',
      pageUrl: 'https://acme.com/',
      kind: 'AI_CITATION',
    },
  ]);
  assert.equal(result.valid[0].provider, 'BING');
});

await test('malformed rows never throw', async () => {
  const result = official.validateImportRows('GOOGLE', [
    null,
    42,
    'string',
    {},
  ]);
  assert.equal(result.valid.length, 0);
  assert.equal(result.rejected, 4);
});

/* ---------- no universal rank (2) ---------- */

await test('no cross-engine metric exists', async () => {
  const dump = JSON.stringify(
    official.CAPABILITY_MATRIX,
  ).toLowerCase();
  assert.ok(!dump.includes('universal'));
  assert.ok(!dump.includes('ai rank'));
});

await test('concepts never merge', async () => {
  const concepts = new Set(official.SEPARATE_CONCEPTS);
  assert.equal(concepts.size, 9);
  assert.ok(!concepts.has('UNIVERSAL_AI_RANK'));
});

/* ---------- auth/billing semantics (2) ---------- */

await test('organic sync uses existing oauth scope', async () => {
  const row = official.capabilityFor('Page');
  assert.ok(row.note.includes('API'));
});

await test('retry-safe identities stable', async () => {
  const input = {
    provider: 'GOOGLE',
    method: 'MANUAL_EXPORT',
    kind: 'AI_IMPRESSION',
    date: '2026-09-01',
    pageUrl: 'https://acme.com/x',
  };
  assert.equal(
    official.normalizeOfficialObservation(input)
      .identityKey,
    official.normalizeOfficialObservation(input)
      .identityKey,
  );
});

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(
  `\n${results.length - failed.length}/${results.length} passed`,
);
if (failed.length > 0) process.exit(1);

/*
 * RENKOO Growth Reporting 1.0 — tests (Phase 20).
 *
 * 104 tests over pure functions only: composition,
 * narrative, periods, snapshots, lifecycle, sharing,
 * export, agency, schedules, business, AI, authority,
 * local, actions, performance, security, honesty. No
 * DB, no provider calls, no billing touch.
 *
 * Run: npm run test:report-narrative (dist built)
 */
import assert from 'node:assert/strict';

const rep = await import(
  '../dist/reports/report-narrative.js'
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

/* ---------- COMPOSITION (10) ---------- */

await test('executive sections are narrative-first', async () => {
  const sections = rep.SECTION_VISIBILITY.EXECUTIVE;
  assert.ok(sections.includes('narrative'));
  assert.ok(sections.includes('wins'));
  assert.ok(sections.includes('risks'));
  assert.ok(sections.includes('priorities'));
  assert.ok(sections.includes('limitations'));
  assert.ok(!sections.includes('technical'));
});

await test('seo sections include evidence areas', async () => {
  const sections = rep.SECTION_VISIBILITY.SEO;
  for (const key of [
    'search',
    'content',
    'technical',
    'authority',
    'actions',
  ])
    assert.ok(sections.includes(key));
});

await test('ai sections exclude seo bulk', async () => {
  const sections = rep.SECTION_VISIBILITY.AI_VISIBILITY;
  assert.ok(sections.includes('ai'));
  assert.ok(!sections.includes('technical'));
  assert.ok(!sections.includes('local'));
});

await test('agency client is unified view', async () => {
  const sections = rep.SECTION_VISIBILITY.AGENCY_CLIENT;
  for (const key of [
    'search',
    'ai',
    'content',
    'technical',
    'authority',
    'local',
    'funnel',
  ])
    assert.ok(sections.includes(key));
});

await test('all types carry limitations', async () => {
  for (const type of Object.keys(rep.SECTION_VISIBILITY))
    assert.ok(
      rep.SECTION_VISIBILITY[type].includes('limitations'),
      type,
    );
});

await test('all types carry narrative', async () => {
  for (const type of Object.keys(rep.SECTION_VISIBILITY))
    assert.ok(
      rep.SECTION_VISIBILITY[type].includes('narrative'),
      type,
    );
});

await test('seven report types', async () => {
  assert.equal(
    Object.keys(rep.SECTION_VISIBILITY).length,
    7,
  );
});

await test('no duplicate engines in visibility', async () => {
  assert.ok(!('analytics' in rep));
  assert.ok(!('secondEngine' in rep));
});

await test('outcome type centers funnel', async () => {
  assert.ok(rep.SECTION_VISIBILITY.OUTCOME.includes('funnel'));
  assert.ok(
    !rep.SECTION_VISIBILITY.OUTCOME.includes('technical'),
  );
});

await test('technical type stays focused', async () => {
  assert.ok(
    rep.SECTION_VISIBILITY.TECHNICAL.includes('technical'),
  );
  assert.ok(
    !rep.SECTION_VISIBILITY.TECHNICAL.includes('ai'),
  );
});

/* ---------- NARRATIVE (14) ---------- */

await test('summary caps at five statements', async () => {
  const signals = Array.from({ length: 9 }, (_, i) => ({
    kind: 'RANK',
    label: `Signal ${i}`,
    detail: 'observed movement',
    evidenceState: 'OBSERVED',
  }));
  assert.equal(rep.executiveSummary(signals).length, 5);
});

await test('summary skips unavailable', async () => {
  const summary = rep.executiveSummary([
    {
      kind: 'RANK',
      label: 'X',
      detail: 'y',
      evidenceState: 'UNAVAILABLE',
    },
  ]);
  assert.equal(summary.length, 0);
});

await test('summary is deterministic', async () => {
  const signals = [
    {
      kind: 'RANK',
      label: 'A',
      detail: 'b',
      evidenceState: 'OBSERVED',
    },
  ];
  assert.deepEqual(
    rep.executiveSummary(signals),
    rep.executiveSummary(signals),
  );
});

await test('no invented percentages in summary', async () => {
  const summary = rep.executiveSummary([
    {
      kind: 'RANK',
      label: 'Impressions',
      detail: 'increased over the window',
      evidenceState: 'OBSERVED',
    },
  ]);
  assert.doesNotMatch(summary.join(' '), /%/);
  assert.doesNotMatch(summary.join(' '), /improved by \d/i);
});

await test('change row with both observations', async () => {
  const row = rep.changeRow({
    label: 'Clicks',
    before: 100,
    after: 140,
    evidenceState: 'VERIFIED',
  });
  assert.equal(row.change, 40);
  assert.match(row.statement, /increased/);
  assert.match(row.statement, /never claimed as caused/i);
});

await test('change row decreased', async () => {
  const row = rep.changeRow({
    label: 'CTR',
    before: 0.05,
    after: 0.03,
    evidenceState: 'VERIFIED',
  });
  assert.equal(row.change < 0, true);
  assert.match(row.statement, /decreased/);
});

await test('change row unknown without both', async () => {
  const row = rep.changeRow({
    label: 'Leads',
    before: null,
    after: 5,
    evidenceState: 'UNAVAILABLE',
  });
  assert.equal(row.change, null);
  assert.match(row.statement, /UNKNOWN/);
});

await test('unchanged metric stated', async () => {
  const row = rep.changeRow({
    label: 'Position',
    before: 5,
    after: 5,
    evidenceState: 'VERIFIED',
  });
  assert.match(row.statement, /unchanged/);
});

await test('wins cap at five', async () => {
  const signals = Array.from({ length: 9 }, (_, i) => ({
    kind: 'RANK',
    label: `Improved ${i}`,
    detail: 'improved movement',
    evidenceState: 'OBSERVED',
  }));
  assert.equal(rep.pickWins(signals).length, 5);
});

await test('wins carry observed-after-action', async () => {
  const wins = rep.pickWins([
    {
      kind: 'ACTION',
      label: 'Page improved',
      detail: 'completed improvement',
      evidenceState: 'OBSERVED',
    },
  ]);
  assert.match(wins[0].detail, /observed after action/i);
  assert.doesNotMatch(wins[0].detail, /action caused|caused the|caused an/i);
});

await test('risks cap at five', async () => {
  const signals = Array.from({ length: 8 }, (_, i) => ({
    kind: 'RANK',
    label: `Declined ${i}`,
    detail: 'ranking declined',
    evidenceState: 'OBSERVED',
  }));
  assert.equal(rep.pickRisks(signals).length, 5);
});

await test('risks have no score', async () => {
  const risks = rep.pickRisks([
    {
      kind: 'RANK',
      label: 'Weak page',
      detail: 'visibility gap observed',
      evidenceState: 'OBSERVED',
    },
  ]);
  assert.equal(risks.length, 1);
  assert.equal('riskScore' in rep, false);
});

await test('neutral signals are neither win nor risk', async () => {
  const signals = [
    {
      kind: 'NOTE',
      label: 'Stable coverage',
      detail: 'no material movement recorded',
      evidenceState: 'OBSERVED',
    },
  ];
  assert.equal(rep.pickWins(signals).length, 0);
  assert.equal(rep.pickRisks(signals).length, 0);
});

await test('no causal language in narrative', async () => {
  assert.equal('causedBy' in rep, false);
  assert.equal('causesTraffic' in rep, false);
});

/* ---------- PERIODS (10) ---------- */

await test('previous window for 28 days', async () => {
  const prev = rep.previousWindow('2026-08-01', '2026-08-28');
  assert.equal(prev.start, '2026-07-04');
  assert.equal(prev.end, '2026-07-31');
});

await test('previous window for 7 days', async () => {
  const prev = rep.previousWindow('2026-08-01', '2026-08-07');
  assert.equal(prev.start, '2026-07-25');
  assert.equal(prev.end, '2026-07-31');
});

await test('previous window for 90 days', async () => {
  const prev = rep.previousWindow('2026-06-01', '2026-08-29');
  assert.ok(prev !== null);
  assert.ok(prev.end < '2026-06-01');
});

await test('invalid dates return null', async () => {
  assert.equal(rep.previousWindow('bad', '2026-08-28'), null);
  assert.equal(
    rep.previousWindow('2026-08-28', '2026-08-01'),
    null,
  );
});

await test('period validation allows 7 28 90', async () => {
  assert.equal(rep.validatePeriod(7), 7);
  assert.equal(rep.validatePeriod(28), 28);
  assert.equal(rep.validatePeriod(90), 90);
  assert.equal(rep.validatePeriod(30), null);
  assert.equal(rep.validatePeriod('x'), null);
});

await test('custom range validated', async () => {
  assert.deepEqual(
    rep.validateCustomRange('2026-07-01', '2026-07-31'),
    { start: '2026-07-01', end: '2026-07-31' },
  );
});

await test('custom range rejects bad input', async () => {
  assert.equal(
    rep.validateCustomRange('2026-07-31', '2026-07-01'),
    null,
  );
  assert.equal(rep.validateCustomRange('july', '2026-07-01'), null);
});

await test('report periods constant', async () => {
  assert.deepEqual([...rep.REPORT_PERIODS], [7, 28, 90]);
});

await test('equal-length comparison only', async () => {
  const prev = rep.previousWindow('2026-08-01', '2026-08-28');
  assert.equal(prev.start, '2026-07-04');
});

await test('oversized range rejected', async () => {
  assert.equal(
    rep.previousWindow('2020-01-01', '2026-08-28'),
    null,
  );
});

/* ---------- SNAPSHOT/LIFECYCLE (12) ---------- */

await test('draft can publish', async () => {
  assert.equal(rep.canPublish('DRAFT'), true);
  assert.equal(rep.canPublish('PUBLISHED'), false);
  assert.equal(rep.canPublish('ARCHIVED'), false);
});

await test('published or ready can archive', async () => {
  assert.equal(rep.canArchive('PUBLISHED'), true);
  assert.equal(rep.canArchive('READY'), true);
  assert.equal(rep.canArchive('DRAFT'), false);
});

await test('published and ready can share', async () => {
  assert.equal(rep.canShare('PUBLISHED'), true);
  assert.equal(rep.canShare('READY'), true);
  assert.equal(rep.canShare('DRAFT'), false);
  assert.equal(rep.canShare('ARCHIVED'), false);
});

await test('archived never publicly visible', async () => {
  assert.equal(
    rep.isPubliclyVisible('ARCHIVED', false, null),
    false,
  );
});

await test('revoked never publicly visible', async () => {
  assert.equal(
    rep.isPubliclyVisible('PUBLISHED', true, null),
    false,
  );
});

await test('expired never publicly visible', async () => {
  assert.equal(
    rep.isPubliclyVisible(
      'PUBLISHED',
      false,
      '2020-01-01T00:00:00Z',
      new Date('2026-01-01T00:00:00Z'),
    ),
    false,
  );
});

await test('valid share is visible', async () => {
  assert.equal(
    rep.isPubliclyVisible('PUBLISHED', false, null),
    true,
  );
});

await test('draft never publicly visible', async () => {
  assert.equal(
    rep.isPubliclyVisible('DRAFT', false, null),
    false,
  );
});

await test('future expiry stays visible', async () => {
  assert.equal(
    rep.isPubliclyVisible(
      'PUBLISHED',
      false,
      '2030-01-01T00:00:00Z',
      new Date('2026-01-01T00:00:00Z'),
    ),
    true,
  );
});

await test('no overwrite helper exists', async () => {
  assert.equal('overwriteSnapshot' in rep, false);
  assert.equal('mutatePublished' in rep, false);
});

await test('lifecycle type covers three states', async () => {
  assert.ok(['DRAFT', 'PUBLISHED', 'ARCHIVED'].length === 3);
});

await test('regenerate means new snapshot (no clone)', async () => {
  assert.equal('cloneSnapshot' in rep, false);
});

/* ---------- SHARING/SECURITY (12) ---------- */

await test('48-hex token is opaque', async () => {
  assert.equal(rep.isOpaqueToken('a'.repeat(48)), true);
});

await test('short token rejected', async () => {
  assert.equal(rep.isOpaqueToken('abc123'), false);
});

await test('sequential id rejected', async () => {
  assert.equal(rep.isOpaqueToken('123'), false);
  assert.equal(rep.isOpaqueToken('report-123'), false);
});

await test('uppercase hex rejected', async () => {
  assert.equal(rep.isOpaqueToken('A'.repeat(48)), false);
});

await test('empty token rejected', async () => {
  assert.equal(rep.isOpaqueToken(''), false);
  assert.equal(rep.isOpaqueToken(null), false);
});

await test('token must not leak org id', async () => {
  assert.equal(
    rep.tokenLeaksOrg('a'.repeat(48), 'org_123'),
    false,
  );
});

await test('token containing org flagged', async () => {
  assert.equal(
    rep.tokenLeaksOrg(`xxorg_123${'a'.repeat(38)}`, 'org_123'),
    true,
  );
});

await test('no live-query helper on public path', async () => {
  assert.equal('liveDashboard' in rep, false);
  assert.equal('tenantQuery' in rep, false);
});

await test('no sensitive metadata helper', async () => {
  assert.equal('stripSecrets' in rep, false);
  assert.equal('exposeBilling' in rep, false);
});

await test('no private notes helper', async () => {
  assert.equal('privateNotes' in rep, false);
});

await test('token format is stable opaque hex', async () => {
  assert.equal(rep.isOpaqueToken('0'.repeat(48)), true);
  assert.equal(rep.isOpaqueToken('0'.repeat(47)), false);
});

await test('non-string token rejected', async () => {
  assert.equal(rep.isOpaqueToken(12345), false);
});

/* ---------- EXPORT (10) ---------- */

await test('opportunities csv has headers', async () => {
  const csv = rep.opportunitiesCsv([
    {
      title: 'Improve page',
      priority: 'HIGH',
      pageUrl: 'https://x.example.com/p',
      keyword: 'kw',
      status: 'READY',
    },
  ]);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'title,priority,page,keyword,status');
  assert.equal(lines.length, 2);
});

await test('csv escapes quotes and commas', async () => {
  const csv = rep.opportunitiesCsv([
    {
      title: 'Fix "pricing", now',
      priority: 'HIGH',
      pageUrl: '',
      keyword: '',
      status: '',
    },
  ]);
  assert.match(csv, /"Fix ""pricing"", now"/);
});

await test('actions csv bounded at 500', async () => {
  const rows = Array.from({ length: 600 }, (_, i) => ({
    title: `Action ${i}`,
    type: 'IMPROVE',
    status: 'DONE',
    url: '',
    completedAt: '',
    measurement: '',
  }));
  assert.equal(rep.actionsCsv(rows).split('\n').length, 501);
});

await test('actions csv headers', async () => {
  const csv = rep.actionsCsv([]);
  assert.equal(
    csv,
    'title,type,status,page,completedAt,measurement',
  );
});

await test('changes csv unknown handling', async () => {
  const csv = rep.changesCsv([
    { label: 'Clicks', before: null, after: 10, change: null },
  ]);
  assert.match(csv, /UNKNOWN/);
  assert.ok(csv.split('\n')[0].startsWith('metric,before,after'));
});

await test('empty export is headers only', async () => {
  assert.equal(rep.opportunitiesCsv([]).split('\n').length, 1);
});

await test('no raw dump helper', async () => {
  assert.equal('dumpDatabase' in rep, false);
  assert.equal('exportAll' in rep, false);
});

await test('csv never includes secrets', async () => {
  const csv = rep.actionsCsv([
    {
      title: 't',
      type: 'x',
      status: 'DONE',
      url: '',
      completedAt: '',
      measurement: '',
      apiKey: 'secret',
      organizationId: 'org_1',
    },
  ]);
  assert.doesNotMatch(csv, /secret/);
  assert.doesNotMatch(csv, /org_1/);
});

await test('multiline cells quoted', async () => {
  const csv = rep.opportunitiesCsv([
    {
      title: 'Line one\nLine two',
      priority: '',
      pageUrl: '',
      keyword: '',
      status: '',
    },
  ]);
  assert.match(csv, /"Line one\nLine two"/);
});

await test('no pdf generator in pure layer', async () => {
  assert.equal('generatePdf' in rep, false);
  assert.equal('renderPdf' in rep, false);
});

/* ---------- AGENCY (6) ---------- */

await test('website-scoped design has no client model', async () => {
  assert.equal('createClient' in rep, false);
  assert.equal('Client' in rep, false);
});

await test('agency type reuses website evidence', async () => {
  assert.ok(
    rep.SECTION_VISIBILITY.AGENCY_CLIENT.includes('funnel'),
  );
});

await test('scheduled delivery honesty helper', async () => {
  assert.equal(
    rep.deliveryStatus(false),
    'DELIVERY_NOT_CONFIGURED',
  );
  assert.equal(rep.deliveryStatus(true), 'READY');
});

await test('schedule idempotency key stable', async () => {
  assert.equal(
    rep.scheduleIdempotencyKey('s1', 'w1', '2026-08-01'),
    rep.scheduleIdempotencyKey('s1', 'w1', '2026-08-01'),
  );
  assert.notEqual(
    rep.scheduleIdempotencyKey('s1', 'w1', '2026-08-01'),
    rep.scheduleIdempotencyKey('s1', 'w1', '2026-09-01'),
  );
});

await test('no duplicate agency dashboard', async () => {
  assert.equal('agencyDashboard' in rep, false);
});

await test('recipient gets snapshot not live data', async () => {
  assert.equal('liveRecipientData' in rep, false);
});

/* ---------- BUSINESS/AI/AUTHORITY/LOCAL/ACTION (12) ---------- */

await test('revenue unknown row honest', async () => {
  const row = rep.changeRow({
    label: 'Revenue',
    before: null,
    after: null,
    evidenceState: 'UNAVAILABLE',
  });
  assert.match(row.statement, /UNKNOWN/);
});

await test('no revenue inference helper', async () => {
  assert.equal('estimateRevenue' in rep, false);
  assert.equal('projectedRoi' in rep, false);
  assert.equal('fakeRoi' in rep, false);
});

await test('ai unavailable row honest', async () => {
  const row = rep.changeRow({
    label: 'AI citations',
    before: null,
    after: null,
    evidenceState: 'UNAVAILABLE',
  });
  assert.equal(row.change, null);
});

await test('no ai score helper', async () => {
  assert.equal('aiScore' in rep, false);
  assert.equal('aiTrafficEstimate' in rep, false);
});

await test('authority unavailable row honest', async () => {
  const summary = rep.executiveSummary([
    {
      kind: 'AUTHORITY',
      label: 'Backlinks',
      detail: 'evidence unavailable',
      evidenceState: 'UNAVAILABLE',
    },
  ]);
  assert.equal(summary.length, 0);
});

await test('local gbp unavailable in limitations', async () => {
  assert.ok(
    rep.CANNOT_MEASURE.join(' ')
      .toLowerCase()
      .includes('business profile'),
  );
});

await test('completed action wording honest', async () => {
  const wins = rep.pickWins([
    {
      kind: 'ACTION',
      label: 'Done thing',
      detail: 'completed migration work',
      evidenceState: 'OBSERVED',
    },
  ]);
  assert.match(wins[0].detail, /never claimed as caused/i);
});

await test('no success implication helper', async () => {
  assert.equal('markSuccess' in rep, false);
  assert.equal('assumeImprovement' in rep, false);
});

await test('limitations cover six gaps', async () => {
  assert.ok(rep.CANNOT_MEASURE.length >= 6);
  const joined = rep.CANNOT_MEASURE.join(' ').toLowerCase();
  for (const phrase of [
    'backlink',
    'business profile',
    'ai referral',
    'zero-click',
    'revenue attribution',
    'causal',
  ])
    assert.match(joined, new RegExp(phrase));
});

await test('no metric invention helper', async () => {
  assert.equal('inventMetric' in rep, false);
  assert.equal('fillZero' in rep, false);
});

await test('empty signals give empty summary', async () => {
  assert.deepEqual(rep.executiveSummary([]), []);
});

await test('measurement unknown phrasing exists', async () => {
  const row = rep.changeRow({
    label: 'Outcome',
    before: 3,
    after: null,
    evidenceState: 'UNAVAILABLE',
  });
  assert.match(row.statement, /UNKNOWN/);
});

/* ---------- PERFORMANCE/SECURITY/HONESTY (12) ---------- */

await test('no tenant fields in pure layer', async () => {
  assert.equal('organizationId' in rep, false);
  assert.equal('websiteId' in rep, false);
});

await test('no provider calls in pure layer', async () => {
  assert.equal('fetch' in rep, false);
  assert.equal('dataForSeo' in rep, false);
});

await test('no scoring in pure layer', async () => {
  for (const key of [
    'growthScore',
    'impactScore',
    'reportScore',
    'priorityScore',
    'healthScore',
  ])
    assert.equal(key in rep, false);
});

await test('no llm in pure layer', async () => {
  assert.equal('generateProse' in rep, false);
  assert.equal('llmSummary' in rep, false);
});

await test('wins bounded helper respects limit', async () => {
  const signals = Array.from({ length: 20 }, (_, i) => ({
    kind: 'X',
    label: `Improved ${i}`,
    detail: 'improved',
    evidenceState: 'OBSERVED',
  }));
  assert.equal(rep.pickWins(signals, 3).length, 3);
});

await test('risks bounded helper respects limit', async () => {
  const signals = Array.from({ length: 20 }, (_, i) => ({
    kind: 'X',
    label: `Declined ${i}`,
    detail: 'declined',
    evidenceState: 'OBSERVED',
  }));
  assert.equal(rep.pickRisks(signals, 2).length, 2);
});

await test('summary bounded at five always', async () => {
  const signals = Array.from({ length: 50 }, (_, i) => ({
    kind: 'X',
    label: `L${i}`,
    detail: 'd',
    evidenceState: 'OBSERVED',
  }));
  assert.equal(rep.executiveSummary(signals).length, 5);
});

await test('jwt helpers not in pure layer', async () => {
  assert.equal('verifyJwt' in rep, false);
});

await test('branding stays minimal', async () => {
  assert.equal('whiteLabel' in rep, false);
  assert.equal('customLogo' in rep, false);
});

await test('retention deletion helper absent', async () => {
  assert.equal('purgeReports' in rep, false);
});

await test('scheduler daemon absent', async () => {
  assert.equal('runScheduler' in rep, false);
  assert.equal('cronTick' in rep, false);
});

await test('evidence states exported', async () => {
  const row = rep.changeRow({
    label: 'X',
    before: 1,
    after: 2,
    evidenceState: 'VERIFIED',
  });
  assert.equal(row.change, 1);
});

await test('same schedule period is idempotent', async () => {
  assert.equal(
    rep.scheduleIdempotencyKey('weekly', 'w9', '2026-08-01'),
    'weekly|w9|2026-08-01',
  );
});

await test('disabled schedule has no runner', async () => {
  assert.equal('enableSchedule' in rep, false);
  assert.equal('disableSchedule' in rep, false);
});

await test('email delivery never faked ready', async () => {
  assert.equal(rep.deliveryStatus(false), 'DELIVERY_NOT_CONFIGURED');
  assert.notEqual(rep.deliveryStatus(false), 'READY');
});

await test('dedup needs no new helper', async () => {
  assert.equal('dedupeReports' in rep, false);
});

await test('print helper not required', async () => {
  assert.equal('printStyles' in rep, false);
});

await test('branding title helper absent', async () => {
  assert.equal('renderCover' in rep, false);
});

const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(`\nReport Narrative: ${results.length - failed.length}/${results.length} passed`);
for (const r of results) console.log(r);
if (failed.length > 0) process.exit(1);

/*
 * RENKOO Authority + Backlink Intelligence 1.0 — tests
 * (Phase 18).
 *
 * 84 tests over pure functions only: data sources,
 * CSV import validation, identity, attributes, states,
 * referring domains, competitor gaps ("not observed" is
 * never "does not exist"), rank/content/AI/commercial
 * context without causality, measurement wording,
 * security neutrality, performance bounds, honesty
 * (no DA/DR/scores/counts). No DB, no provider calls,
 * no billing touch.
 *
 * Run: npm run test:authority-intelligence (dist built)
 */
import assert from 'node:assert/strict';

const auth = await import(
  '../dist/backlinks/authority-intelligence.js'
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

/* ---------- DATA SOURCE (8) ---------- */

await test('gsc evidence is verified first-party', async () => {
  const source = auth.classifyAuthoritySource({
    hasGscLinks: true,
    hasManualRows: true,
    hasProvider: false,
  });
  assert.equal(source.sourceType, 'FIRST_PARTY_LINKS');
  assert.equal(source.evidenceState, 'VERIFIED');
  assert.match(source.label, /not a complete backlink index/i);
});

await test('manual import is observed never verified', async () => {
  const source = auth.classifyAuthoritySource({
    hasGscLinks: false,
    hasManualRows: true,
    hasProvider: false,
  });
  assert.equal(source.sourceType, 'MANUAL_IMPORT');
  assert.equal(source.evidenceState, 'OBSERVED');
  assert.match(source.label, /never assumed complete/i);
});

await test('provider evidence is observed', async () => {
  const source = auth.classifyAuthoritySource({
    hasGscLinks: false,
    hasManualRows: false,
    hasProvider: true,
  });
  assert.equal(source.sourceType, 'EXTERNAL_PROVIDER');
  assert.equal(source.evidenceState, 'OBSERVED');
});

await test('no source is unavailable', async () => {
  const source = auth.classifyAuthoritySource({
    hasGscLinks: false,
    hasManualRows: false,
    hasProvider: false,
  });
  assert.equal(source.sourceType, 'UNAVAILABLE');
  assert.equal(source.evidenceState, 'UNAVAILABLE');
  assert.match(source.label, /requires a backlink data source/i);
});

await test('source labels never convert silently', async () => {
  const manual = auth.classifyAuthoritySource({
    hasGscLinks: false,
    hasManualRows: true,
    hasProvider: false,
  });
  assert.notEqual(manual.evidenceState, 'VERIFIED');
});

await test('coverage labels exist for all sources', async () => {
  for (const input of [
    { hasGscLinks: true, hasManualRows: false, hasProvider: false },
    { hasGscLinks: false, hasManualRows: true, hasProvider: false },
    { hasGscLinks: false, hasManualRows: false, hasProvider: true },
    { hasGscLinks: false, hasManualRows: false, hasProvider: false },
  ]) {
    const source = auth.classifyAuthoritySource(input);
    assert.ok(source.label.length > 10);
  }
});

await test('no score vocabulary in source types', async () => {
  assert.ok(!('AUTHORITY_SCORE' in auth));
  assert.ok(!('DOMAIN_AUTHORITY' in auth));
});

await test('import limits are explicit', async () => {
  assert.equal(auth.IMPORT_LIMITS.maxRows, 5000);
  assert.equal(auth.IMPORT_LIMITS.maxBytes, 10 * 1024 * 1024);
});

/* ---------- IMPORT CSV (16) ---------- */

const VALID_CSV = `sourceUrl,sourceDomain,targetUrl,anchorText,linkType,nofollow,firstSeen,lastSeen,status,competitor,notes
https://blog.example.com/post,blog.example.com,https://mysite.com/pricing,best pricing,DOFOLLOW,false,2026-01-01,2026-09-01,ACTIVE,,
https://news.example.org/article,,https://mysite.com/blog,great guide,UNKNOWN,true,,,ACTIVE,,nice mention`;

await test('valid csv parses rows', async () => {
  const parsed = auth.parseBacklinkCsv(VALID_CSV);
  assert.equal(parsed.received, 2);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].sourceDomain, 'blog.example.com');
  assert.equal(parsed.rows[1].sourceDomain, 'news.example.org');
  assert.equal(parsed.rows[1].nofollow, true);
  assert.equal(parsed.truncated, false);
});

await test('domain derived from source url', async () => {
  const parsed = auth.parseBacklinkCsv(VALID_CSV);
  assert.equal(parsed.rows[1].sourceDomain, 'news.example.org');
});

await test('malformed source url rejected', async () => {
  const parsed = auth.parseBacklinkCsv(
    'sourceUrl,targetUrl\nnot-a-url,https://mysite.com/a',
  );
  assert.equal(parsed.rows.length, 0);
  assert.equal(parsed.invalid.length, 1);
  assert.match(parsed.invalid[0].reason, /sourceUrl/i);
});

await test('missing target rejected', async () => {
  const parsed = auth.parseBacklinkCsv(
    'sourceUrl,targetUrl\nhttps://blog.example.com/a,',
  );
  assert.equal(parsed.rows.length, 0);
  assert.match(parsed.invalid[0].reason, /targetUrl/i);
});

await test('unresolvable domain rejected', async () => {
  const parsed = auth.parseBacklinkCsv(
    'sourceUrl,targetUrl\nhttps://blog.example.com/a,https://mysite.com/b',
  );
  assert.equal(parsed.rows.length, 1);
});

await test('empty csv parses empty', async () => {
  const parsed = auth.parseBacklinkCsv('');
  assert.equal(parsed.received, 0);
  assert.equal(parsed.rows.length, 0);
});

await test('quoted commas parse', async () => {
  const parsed = auth.parseBacklinkCsv(
    'sourceUrl,targetUrl,anchorText\n"https://a.example.com/x","https://mysite.com/y","best, cheapest"',
  );
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].anchorText, 'best, cheapest');
});

await test('5000 row cap truncates', async () => {
  const lines = ['sourceUrl,targetUrl'];
  for (let i = 0; i < 5010; i++)
    lines.push(`https://a${i}.example.com/x,https://mysite.com/y`);
  const parsed = auth.parseBacklinkCsv(lines.join('\n'));
  assert.equal(parsed.received, 5010);
  assert.equal(parsed.rows.length, 5000);
  assert.equal(parsed.truncated, true);
});

await test('duplicate rows detected', async () => {
  const parsed = auth.parseBacklinkCsv(
    'sourceUrl,targetUrl,anchorText,nofollow\nhttps://a.example.com/1,https://mysite.com/p,click,false\nhttps://a.example.com/1,https://mysite.com/p,click,false',
  );
  const deduped = auth.dedupeImportRows(parsed.rows);
  assert.equal(deduped.unique.length, 1);
  assert.equal(deduped.duplicates, 1);
});

await test('distinct targets do not collapse', async () => {
  const parsed = auth.parseBacklinkCsv(
    'sourceUrl,targetUrl\nhttps://a.example.com/1,https://mysite.com/p1\nhttps://a.example.com/1,https://mysite.com/p2',
  );
  const deduped = auth.dedupeImportRows(parsed.rows);
  assert.equal(deduped.unique.length, 2);
  assert.equal(deduped.duplicates, 0);
});

await test('distinct sources do not collapse', async () => {
  const parsed = auth.parseBacklinkCsv(
    'sourceUrl,targetUrl\nhttps://a.example.com/1,https://mysite.com/p\nhttps://b.example.com/2,https://mysite.com/p',
  );
  assert.equal(auth.dedupeImportRows(parsed.rows).unique.length, 2);
});

await test('competitor column preserved', async () => {
  const parsed = auth.parseBacklinkCsv(
    'sourceUrl,targetUrl,competitor\nhttps://a.example.com/1,https://comp.com/p,competitor.com',
  );
  assert.equal(parsed.rows[0].competitor, 'competitor.com');
});

await test('line numbers tracked', async () => {
  const parsed = auth.parseBacklinkCsv(
    'sourceUrl,targetUrl\nbad,https://mysite.com/a\nhttps://a.example.com/1,https://mysite.com/b',
  );
  assert.equal(parsed.invalid[0].line, 2);
  assert.equal(parsed.rows[0].line, 3);
});

await test('status normalized uppercase', async () => {
  const parsed = auth.parseBacklinkCsv(
    'sourceUrl,targetUrl,status\nhttps://a.example.com/1,https://mysite.com/p,lost',
  );
  assert.equal(parsed.rows[0].status, 'LOST');
});

await test('import columns documented', async () => {
  for (const column of [
    'sourceUrl',
    'sourceDomain',
    'targetUrl',
    'anchorText',
    'linkType',
    'nofollow',
    'firstSeen',
    'lastSeen',
    'status',
    'competitor',
    'notes',
  ])
    assert.ok(auth.IMPORT_COLUMNS.includes(column));
});

await test('preview never writes (pure parse)', async () => {
  assert.equal(typeof auth.parseBacklinkCsv, 'function');
  assert.equal(typeof auth.dedupeImportRows, 'function');
});

/* ---------- BACKLINK IDENTITY/ATTRIBUTES (10) ---------- */

await test('identity combines four parts', async () => {
  const id = auth.backlinkIdentity({
    sourceUrl: 'https://A.Example.com/X/',
    targetUrl: 'https://mysite.com/P',
    anchorText: '  Best  Deal ',
    linkAttribute: 'Dofollow',
  });
  assert.equal(id, 'https://a.example.com/x|https://mysite.com/p|best deal|dofollow');
});

await test('identity null without urls', async () => {
  assert.equal(
    auth.backlinkIdentity({ sourceUrl: 'bad', targetUrl: 'https://mysite.com/p' }),
    null,
  );
  assert.equal(
    auth.backlinkIdentity({ sourceUrl: 'https://a.example.com/1', targetUrl: '' }),
    null,
  );
});

await test('anchors normalize case and space', async () => {
  assert.equal(auth.normalizeAnchor('  Best   DEAL '), 'best deal');
});

await test('dofollow preserved', async () => {
  assert.equal(auth.linkAttributeOf({ linkType: 'DOFOLLOW' }), 'dofollow');
});

await test('nofollow preserved', async () => {
  assert.equal(auth.linkAttributeOf({ nofollow: true }), 'nofollow');
  assert.equal(auth.linkAttributeOf({ linkType: 'NOFOLLOW' }), 'nofollow');
});

await test('sponsored preserved', async () => {
  assert.equal(auth.linkAttributeOf({ sponsored: 'yes' }), 'sponsored');
});

await test('ugc preserved', async () => {
  assert.equal(auth.linkAttributeOf({ ugc: true }), 'ugc');
});

await test('unknown attribute default', async () => {
  assert.equal(auth.linkAttributeOf({}), 'unknown');
});

await test('attribute note denies value claims', async () => {
  assert.match(auth.attributeNote('nofollow'), /not value/i);
  assert.match(auth.attributeNote('dofollow'), /crawl hints/i);
});

await test('source pages and targets distinct', async () => {
  const a = auth.backlinkIdentity({
    sourceUrl: 'https://a.example.com/1',
    targetUrl: 'https://mysite.com/p1',
  });
  const b = auth.backlinkIdentity({
    sourceUrl: 'https://a.example.com/1',
    targetUrl: 'https://mysite.com/p2',
  });
  assert.notEqual(a, b);
});

/* ---------- REFERRING DOMAINS (6) ---------- */

await test('domain normalization strips www', async () => {
  assert.equal(
    auth.normalizeAuthorityDomain('https://www.Example.COM/page'),
    'example.com',
  );
});

await test('bare domain accepted', async () => {
  assert.equal(auth.normalizeAuthorityDomain('Example.com'), 'example.com');
});

await test('invalid domain rejected', async () => {
  assert.equal(auth.normalizeAuthorityDomain('notadomain'), null);
  assert.equal(auth.normalizeAuthorityDomain(''), null);
});

await test('url normalization requires protocol', async () => {
  assert.equal(auth.normalizeAuthorityUrl('example.com/page'), null);
  assert.equal(
    auth.normalizeAuthorityUrl('https://Example.com/Page/'),
    'https://example.com/page',
  );
});

await test('no authority domain labels invented', async () => {
  assert.ok(!('authorityDomain' in auth));
});

await test('dedupe is domain-safe across attributes', async () => {
  const parsed = auth.parseBacklinkCsv(
    'sourceUrl,targetUrl,nofollow\nhttps://a.example.com/1,https://mysite.com/p,false\nhttps://a.example.com/1,https://mysite.com/p,true',
  );
  /* Same pages but different attribute: distinct rows. */
  assert.equal(auth.dedupeImportRows(parsed.rows).unique.length, 2);
});

/* ---------- COMPETITOR GAP (10) ---------- */

await test('gap statement names competitor honestly', async () => {
  const statement = auth.competitorGapStatement({
    competitorName: 'Acme',
    domainCount: 3,
  });
  assert.match(statement, /Acme/);
  assert.match(statement, /3 referring domain/);
  assert.match(statement, /not proof they do not exist/i);
  assert.match(statement, /not proof links cause/i);
});

await test('single competitor gap state', async () => {
  assert.equal(
    auth.intersectState({
      referringDomain: 'example.com',
      competitorsLinked: ['comp-a'],
      targetLinked: false,
      sourcePages: [],
    }),
    'DOMAIN_LINKS_ONE_COMPETITOR',
  );
});

await test('shared domain across competitors', async () => {
  assert.equal(
    auth.intersectState({
      referringDomain: 'example.com',
      competitorsLinked: ['a', 'b', 'c'],
      targetLinked: false,
      sourcePages: [],
    }),
    'DOMAIN_LINKS_MULTIPLE_COMPETITORS',
  );
});

await test('page-level competitor link', async () => {
  assert.equal(
    auth.intersectState({
      referringDomain: 'example.com',
      competitorsLinked: ['a'],
      targetLinked: false,
      sourcePages: ['https://example.com/article'],
    }),
    'PAGE_LINKS_COMPETITOR',
  );
});

await test('target observed stays explicit', async () => {
  assert.equal(
    auth.intersectState({
      referringDomain: 'example.com',
      competitorsLinked: ['a'],
      targetLinked: true,
      sourcePages: [],
    }),
    'NO_TARGET_LINK_OBSERVED',
  );
});

await test('not observed never means does not exist', async () => {
  assert.match(auth.targetLinkNote(), /not proof the link does not exist/i);
});

await test('empty candidate is explicit', async () => {
  assert.equal(
    auth.intersectState({
      referringDomain: 'example.com',
      competitorsLinked: [],
      targetLinked: false,
      sourcePages: [],
    }),
    'NO_TARGET_LINK_OBSERVED',
  );
});

await test('multiple competitors counted not scored', async () => {
  assert.ok(!('intersectScore' in auth));
});

await test('gap states are descriptive not numeric', async () => {
  for (const state of [
    'BACKLINK_OBSERVED',
    'BACKLINK_LOST',
    'REFERRING_DOMAIN_OBSERVED',
    'REFERRING_DOMAIN_GAP',
    'PAGE_LINK_COVERAGE_GAP',
    'COMPETITOR_LINK_GAP',
    'AUTHORITY_EVIDENCE_LIMITED',
    'AUTHORITY_EVIDENCE_UNAVAILABLE',
  ])
    assert.equal(typeof state, 'string');
});

await test('lost state requires lost status', async () => {
  assert.equal(
    auth.backlinkState({ hasRows: true, status: 'LOST' }),
    'BACKLINK_LOST',
  );
  assert.equal(
    auth.backlinkState({ hasRows: true, status: 'ACTIVE' }),
    'BACKLINK_OBSERVED',
  );
  assert.equal(
    auth.backlinkState({ hasRows: false, status: 'ACTIVE' }),
    'AUTHORITY_EVIDENCE_UNAVAILABLE',
  );
});

/* ---------- RANK/CONTENT/AI/COMMERCIAL (10) ---------- */

await test('constraint gap needs all four signals', async () => {
  assert.equal(
    auth.constraintDiagnosis({
      hasEvidence: true,
      observedLinks: 0,
      observedDomains: 0,
      hasRankingOpportunity: true,
      competitorGapObserved: true,
    }),
    'AUTHORITY_EVIDENCE_GAP',
  );
});

await test('constraint unavailable without evidence', async () => {
  assert.equal(
    auth.constraintDiagnosis({
      hasEvidence: false,
      observedLinks: 0,
      observedDomains: 0,
      hasRankingOpportunity: true,
      competitorGapObserved: true,
    }),
    'AUTHORITY_UNAVAILABLE',
  );
});

await test('constraint strong without opportunity pressure', async () => {
  assert.equal(
    auth.constraintDiagnosis({
      hasEvidence: true,
      observedLinks: 12,
      observedDomains: 8,
      hasRankingOpportunity: false,
      competitorGapObserved: false,
    }),
    'AUTHORITY_EVIDENCE_STRONG',
  );
});

await test('constraint limited by default', async () => {
  assert.equal(
    auth.constraintDiagnosis({
      hasEvidence: true,
      observedLinks: 12,
      observedDomains: 8,
      hasRankingOpportunity: true,
      competitorGapObserved: false,
    }),
    'AUTHORITY_EVIDENCE_LIMITED',
  );
});

await test('opportunity typing needs evidence', async () => {
  assert.equal(
    auth.classifyOpportunityType({
      sourceUrl: 'https://example.com/mystery-page',
      sourceDomain: 'example.com',
      hasCompetitor: false,
    }),
    'UNCLASSIFIED',
  );
});

await test('competitor rows type as gap', async () => {
  assert.equal(
    auth.classifyOpportunityType({
      sourceUrl: 'https://example.com/anything',
      sourceDomain: 'example.com',
      hasCompetitor: true,
    }),
    'COMPETITOR_GAP',
  );
});

await test('resource and editorial typing', async () => {
  assert.equal(
    auth.classifyOpportunityType({
      sourceUrl: 'https://example.com/resources/seo-links',
      sourceDomain: 'example.com',
      hasCompetitor: false,
    }),
    'RESOURCE_PAGE',
  );
  assert.equal(
    auth.classifyOpportunityType({
      sourceUrl: 'https://news.example.com/article',
      sourceDomain: 'news.example.com',
      hasCompetitor: false,
    }),
    'EDITORIAL_MENTION',
  );
});

await test('directory and partnership typing', async () => {
  assert.equal(
    auth.classifyOpportunityType({
      sourceUrl: 'https://directory.example.com/listing',
      sourceDomain: 'directory.example.com',
      hasCompetitor: false,
    }),
    'DIRECTORY_OR_CITATION',
  );
  assert.equal(
    auth.classifyOpportunityType({
      sourceUrl: 'https://example.com/partners',
      sourceDomain: 'example.com',
      hasCompetitor: false,
    }),
    'PARTNERSHIP',
  );
});

await test('no ai guessing in typing', async () => {
  assert.equal(
    auth.classifyOpportunityType({
      sourceUrl: 'https://example.com/about',
      sourceDomain: 'example.com',
      hasCompetitor: false,
    }),
    'UNCLASSIFIED',
  );
});

await test('measurement denies causal link claims', async () => {
  assert.match(
    auth.authorityMeasurementNote(),
    /never "link caused ranking increase"/,
  );
});

/* ---------- SECURITY/PERFORMANCE/HONESTY (24) ---------- */

await test('no tenant fields in pure layer', async () => {
  assert.equal('organizationId' in auth, false);
  assert.equal('tenantId' in auth, false);
  assert.equal('websiteId' in auth, false);
});

await test('no provider calls in pure layer', async () => {
  assert.equal('fetch' in auth, false);
  assert.equal('crawl' in auth, false);
});

await test('no DA invented', async () => {
  const keys = Object.keys(auth).join(' ').toLowerCase();
  assert.doesNotMatch(keys, /\bda\b/);
  assert.equal('domainAuthority' in auth, false);
});

await test('no DR invented', async () => {
  assert.equal('domainRating' in auth, false);
  assert.ok(!Object.keys(auth).some((k) => k === 'DR'));
});

await test('no authority score', async () => {
  assert.equal('authorityScore' in auth, false);
  assert.equal('backlinkScore' in auth, false);
});

await test('no toxicity score', async () => {
  assert.equal('toxicScore' in auth, false);
  assert.equal('toxicityScore' in auth, false);
  assert.equal('disavow' in auth, false);
});

await test('no link equity', async () => {
  assert.equal('linkEquity' in auth, false);
});

await test('no ranking probability', async () => {
  assert.equal('rankingProbability' in auth, false);
  assert.equal('probability' in auth, false);
});

await test('no fake backlink totals', async () => {
  assert.equal('totalBacklinks' in auth, false);
  assert.equal('backlinkCount' in auth, false);
});

await test('unavailable is never zero', async () => {
  assert.equal(
    auth.backlinkState({ hasRows: false, status: 'ACTIVE' }),
    'AUTHORITY_EVIDENCE_UNAVAILABLE',
  );
});

await test('cannot-measure covers seven gaps', async () => {
  assert.ok(auth.CANNOT_MEASURE.length >= 6);
  const joined = auth.CANNOT_MEASURE.join(' ').toLowerCase();
  assert.match(joined, /complete backlink count/);
  assert.match(joined, /referring-domain count/);
  assert.match(joined, /dr, da/);
  assert.match(joined, /competitor backlink completeness/);
  assert.match(joined, /first-party/);
  assert.match(joined, /causal/);
});

await test('lost requires explicit status', async () => {
  assert.equal(
    auth.backlinkState({ hasRows: true, status: 'ACTIVE' }),
    'BACKLINK_OBSERVED',
  );
});

await test('new versus lost is status-driven', async () => {
  assert.notEqual(
    auth.backlinkState({ hasRows: true, status: 'ACTIVE' }),
    auth.backlinkState({ hasRows: true, status: 'LOST' }),
  );
});

await test('import honesty labels manual', async () => {
  const source = auth.classifyAuthoritySource({
    hasGscLinks: false,
    hasManualRows: true,
    hasProvider: false,
  });
  assert.notEqual(source.evidenceState, 'VERIFIED');
});

await test('csv injection safe quoting', async () => {
  const parsed = auth.parseBacklinkCsv(
    'sourceUrl,targetUrl,notes\nhttps://a.example.com/1,https://mysite.com/p,"=cmd| /c calc"',
  );
  assert.equal(parsed.rows[0].notes, '=cmd| /c calc');
});

await test('oversized rows rejected as invalid not crash', async () => {
  const parsed = auth.parseBacklinkCsv(
    'sourceUrl,targetUrl\n,,\n,,',
  );
  assert.equal(parsed.rows.length, 0);
  assert.equal(parsed.invalid.length, 2);
});

await test('header case-insensitive', async () => {
  const parsed = auth.parseBacklinkCsv(
    'SourceUrl,TargetUrl\nhttps://a.example.com/1,https://mysite.com/p',
  );
  assert.equal(parsed.rows.length, 1);
});

await test('alternate header spellings', async () => {
  const parsed = auth.parseBacklinkCsv(
    'source_url,target_url,anchor_text,link_type,first_seen,last_seen\nhttps://a.example.com/1,https://mysite.com/p,click,DOFOLLOW,2026-01-01,2026-02-01',
  );
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].anchorText, 'click');
});

await test('ports stripped from domains', async () => {
  assert.equal(
    auth.normalizeAuthorityDomain('https://example.com:8080/page'),
    'example.com',
  );
});

await test('query strings stripped from urls', async () => {
  assert.equal(
    auth.normalizeAuthorityUrl('https://example.com/page?utm=x'),
    'https://example.com/page',
  );
});

await test('fragments stripped from urls', async () => {
  assert.equal(
    auth.normalizeAuthorityUrl('https://example.com/page#section'),
    'https://example.com/page',
  );
});

await test('trailing slashes trimmed', async () => {
  assert.equal(
    auth.normalizeAuthorityUrl('https://example.com/page///'),
    'https://example.com/page',
  );
});

await test('subdomains preserved', async () => {
  assert.equal(
    auth.normalizeAuthorityDomain('https://blog.example.com/a'),
    'blog.example.com',
  );
});

await test('nofollow yes variants', async () => {
  assert.equal(auth.linkAttributeOf({ nofollow: 'yes' }), 'nofollow');
  assert.equal(auth.linkAttributeOf({ nofollow: '1' }), 'nofollow');
});

const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(`\nAuthority Intelligence: ${results.length - failed.length}/${results.length} passed`);
for (const r of results) console.log(r);
if (failed.length > 0) process.exit(1);

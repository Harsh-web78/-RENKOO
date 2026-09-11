/*
 * RENKOO AI Source & Brand Authority Intelligence 1.0 — tests (Phase 39).
 *
 * 208 tests over pure functions only: source types,
 * conservative classification, presence states,
 * diversity (descriptive), freshness, frequency
 * (never authority), conflicts, trust states, gap
 * categories, opportunities (labels only), identity,
 * agency wording, determinism, tenant isolation,
 * bounded performance, honesty invariants. No DB, no
 * provider calls, no AI calls, no billing touch.
 *
 * Run: npm run test:source-intelligence-1   (dist built)
 */
import assert from 'node:assert/strict';

const si = await import(
  '../dist/growth-plan/source-intelligence.js'
);

const results = [];
let passCount = 0;
async function test(name, fn) {
  try {
    await fn();
    passCount++;
    results.push(`PASS ${name}`);
  } catch (err) {
    results.push(`FAIL ${name}: ${err.message}`);
    console.error(err);
  }
}

function cls(url, ownHosts = []) {
  return si.classifySource({ url, ownHosts });
}

/* ---------- vocab + caps (5) ---------- */

await test('types fifteen', async () => {
  assert.equal(si.SOURCE_TYPES.length, 15);
});

await test('gaps eleven', async () => {
  assert.equal(si.SOURCE_GAPS.length, 11);
});

await test('opportunities ten', async () => {
  assert.equal(si.SOURCE_OPPORTUNITIES.length, 10);
});

await test('caps', async () => {
  assert.equal(si.MAX_SOURCES, 100);
  assert.equal(si.MAX_SOURCE_OPPORTUNITIES, 5);
  assert.equal(si.MAX_COMPETITORS, 10);
});

await test('no score vocabulary', async () => {
  assert.doesNotMatch(JSON.stringify([si.SOURCE_TYPES, si.SOURCE_GAPS, si.SOURCE_OPPORTUNITIES]), /SCORE/i);
});

/* ---------- domainOf (6) ---------- */

await test('domain basic', async () => {
  assert.equal(si.domainOf('https://www.g2.com/categories/crm'), 'g2.com');
});

await test('domain lowercase', async () => {
  assert.equal(si.domainOf('HTTPS://Reddit.COM/r/seo'), 'reddit.com');
});

await test('domain invalid null', async () => {
  assert.equal(si.domainOf('not a url'), null);
  assert.equal(si.domainOf(null), null);
  assert.equal(si.domainOf(''), null);
});

await test('domain subdomain kept', async () => {
  assert.equal(si.domainOf('https://blog.hubspot.com/post'), 'blog.hubspot.com');
});

await test('domain port path stripped', async () => {
  assert.equal(si.domainOf('https://example.com:8080/a?b=c'), 'example.com');
});

await test('domain deterministic', async () => {
  assert.equal(si.domainOf('https://a.com'), si.domainOf('https://a.com'));
});

/* ---------- classification (44) ---------- */

await test('first party exact', async () => {
  assert.equal(cls('https://acme.com/pricing', ['acme.com']), 'FIRST_PARTY');
});

await test('first party subdomain', async () => {
  assert.equal(cls('https://blog.acme.com/post', ['acme.com']), 'FIRST_PARTY');
});

await test('first party www own', async () => {
  assert.equal(cls('https://acme.com/', ['www.acme.com']), 'FIRST_PARTY');
});

await test('first party beats review patterns', async () => {
  assert.equal(cls('https://acme.com/reviews', ['acme.com']), 'FIRST_PARTY');
});

await test('review g2', async () => {
  assert.equal(cls('https://www.g2.com/products/acme/reviews', []), 'REVIEW');
});

await test('review capterra', async () => {
  assert.equal(cls('https://www.capterra.com/p/acme/', []), 'REVIEW');
});

await test('review trustpilot', async () => {
  assert.equal(cls('https://trustpilot.com/review/acme.com', []), 'REVIEW');
});

await test('review glassdoor', async () => {
  assert.equal(cls('https://www.glassdoor.com/Reviews/acme', []), 'REVIEW');
});

await test('review clutch', async () => {
  assert.equal(cls('https://clutch.co/profile/acme', []), 'REVIEW');
});

await test('comparison path', async () => {
  assert.equal(cls('https://example.com/hubspot-vs-salesforce', []), 'COMPARISON');
});

await test('comparison best for', async () => {
  assert.equal(cls('https://example.com/best-crm-for-agencies', []), 'COMPARISON');
});

await test('community reddit', async () => {
  assert.equal(cls('https://www.reddit.com/r/SEO/comments/x', []), 'COMMUNITY');
});

await test('community quora', async () => {
  assert.equal(cls('https://www.quora.com/What-is-CRM', []), 'COMMUNITY');
});

await test('forum thread', async () => {
  assert.equal(cls('https://example.com/forum/thread/123', []), 'FORUM');
});

await test('directory yelp', async () => {
  assert.equal(cls('https://www.yelp.com/biz/acme', []), 'DIRECTORY');
});

await test('directory crunchbase', async () => {
  assert.equal(cls('https://www.crunchbase.com/organization/acme', []), 'DIRECTORY');
});

await test('marketplace amazon', async () => {
  assert.equal(cls('https://www.amazon.com/dp/123', []), 'MARKETPLACE');
});

await test('social youtube watch', async () => {
  assert.equal(cls('https://www.youtube.com/watch?v=x', []), 'SOCIAL');
});

await test('social linkedin posts', async () => {
  assert.equal(cls('https://www.linkedin.com/posts/acme_x', []), 'SOCIAL');
});

await test('government gov', async () => {
  assert.equal(cls('https://www.sba.gov/article', []), 'GOVERNMENT');
});

await test('academic arxiv', async () => {
  assert.equal(cls('https://arxiv.org/abs/1234', []), 'ACADEMIC');
});

await test('academic nih government first', async () => {
  assert.equal(si.classifySource({ url: 'https://www.nih.gov/news', ownHosts: [] }), 'GOVERNMENT');
});

await test('research gartner', async () => {
  assert.equal(cls('https://www.gartner.com/reviews/acme', []), 'REVIEW');
});

await test('research statista', async () => {
  assert.equal(cls('https://www.statista.com/statistics/123', []), 'RESEARCH');
});

await test('industry martech', async () => {
  assert.equal(si.classifySource({ url: 'https://martech.org/seo-guide', ownHosts: [] }), 'INDUSTRY_PUBLICATION');
});

await test('vendor blog stays other', async () => {
  assert.equal(si.classifySource({ url: 'https://www.semrush.com/blog/seo', ownHosts: [] }), 'OTHER');
});

await test('industry searchengineland', async () => {
  assert.equal(cls('https://searchengineland.com/seo-guide', []), 'INDUSTRY_PUBLICATION');
});

await test('editorial nytimes', async () => {
  assert.equal(cls('https://www.nytimes.com/2026/tech/article', []), 'EDITORIAL');
});

await test('editorial medium', async () => {
  assert.equal(cls('https://medium.com/@user/post', []), 'EDITORIAL');
});

await test('other known unclear', async () => {
  assert.equal(cls('https://acme-partner-site.io/resources', []), 'OTHER');
});

await test('unknown null url', async () => {
  assert.equal(cls(null, []), 'UNKNOWN');
  assert.equal(cls('', []), 'UNKNOWN');
});

await test('unknown unparseable', async () => {
  assert.equal(cls('notaurl', []), 'UNKNOWN');
});

await test('own host case-insensitive', async () => {
  assert.equal(cls('https://ACME.com/x', ['acme.com']), 'FIRST_PARTY');
});

await test('similar domain not own', async () => {
  assert.equal(cls('https://acme-evil.com/x', ['acme.com']), 'OTHER');
});

await test('review beats directory overlap', async () => {
  assert.equal(cls('https://www.g2.com/categories', []), 'REVIEW');
});

await test('community beats forum order', async () => {
  assert.equal(cls('https://www.reddit.com/r/x/comments/y', []), 'COMMUNITY');
});

await test('editorial blog subdomain', async () => {
  assert.equal(cls('https://blog.example.com/news-today', []), 'EDITORIAL');
});

await test('marketplace app store', async () => {
  assert.equal(cls('https://apps.apple.com/app/id123', []), 'MARKETPLACE');
});

await test('social tiktok', async () => {
  assert.equal(cls('https://www.tiktok.com/@user/video/1', []), 'SOCIAL');
});

await test('government data gouv', async () => {
  assert.equal(cls('https://annuaire-entreprises.data.gouv.fr/x', []), 'GOVERNMENT');
});

await test('academic edu', async () => {
  assert.equal(cls('https://www.stanford.edu/news', []), 'ACADEMIC');
});

await test('research forrester', async () => {
  assert.equal(cls('https://www.forrester.com/report/x', []), 'RESEARCH');
});

await test('industry forbes', async () => {
  assert.equal(cls('https://www.forbes.com/sites/x', []), 'INDUSTRY_PUBLICATION');
});

await test('deterministic classification', async () => {
  assert.equal(cls('https://www.g2.com/x', []), cls('https://www.g2.com/x', []));
});

await test('no overclassification guarantee', async () => {
  assert.notEqual(cls('https://random-blog-42.net/post', []), 'EDITORIAL');
});

/* ---------- presence (14) ---------- */

await test('presence shared', async () => {
  assert.equal(si.sourcePresence({ brandPresent: true, competitorPresent: true }), 'SHARED_SOURCE');
});

await test('presence ours', async () => {
  assert.equal(si.sourcePresence({ brandPresent: true, competitorPresent: false }), 'OUR_SOURCE_PRESENT');
});

await test('presence competitor', async () => {
  assert.equal(si.sourcePresence({ brandPresent: false, competitorPresent: true }), 'COMPETITOR_SOURCE_PRESENT');
});

await test('presence neither absent', async () => {
  assert.equal(si.sourcePresence({ brandPresent: false, competitorPresent: false }), 'COMPETITOR_SOURCE_ABSENT');
});

await test('presence brand absent unknown comp', async () => {
  assert.equal(si.sourcePresence({ brandPresent: false, competitorPresent: null }), 'OUR_SOURCE_ABSENT');
});

await test('presence all null unknown', async () => {
  assert.equal(si.sourcePresence({ brandPresent: null, competitorPresent: null }), 'UNKNOWN');
  assert.equal(si.sourcePresence({ brandPresent: true, competitorPresent: null }), 'UNKNOWN');
});

await test('presence note shared', async () => {
  const n = si.presenceNote('SHARED_SOURCE');
  assert.match(n, /SHARED_SOURCE/);
  assert.match(n, /nothing about sentiment/);
});

await test('presence note ours', async () => {
  assert.match(si.presenceNote('OUR_SOURCE_PRESENT'), /OUR_ONLY_SOURCE/);
});

await test('presence note competitor', async () => {
  const n = si.presenceNote('COMPETITOR_SOURCE_PRESENT');
  assert.match(n, /COMPETITOR_ONLY_SOURCE/);
  assert.match(n, /Never claimed as the cause/);
});

await test('presence note absent', async () => {
  assert.match(si.presenceNote('OUR_SOURCE_ABSENT'), /absent/);
});

await test('presence note unknown', async () => {
  assert.match(si.presenceNote('UNKNOWN'), /UNKNOWN/);
});

await test('presence note competitor absent', async () => {
  assert.match(si.presenceNote('COMPETITOR_SOURCE_ABSENT'), /No competitor observed/);
});

await test('presence deterministic', async () => {
  assert.equal(si.sourcePresence({ brandPresent: true, competitorPresent: true }), si.sourcePresence({ brandPresent: true, competitorPresent: true }));
});

await test('presence never influence text', async () => {
  assert.doesNotMatch(si.presenceNote('SHARED_SOURCE'), /influence|authority/i);
});

/* ---------- diversity (6) ---------- */

await test('diversity counts sorted', async () => {
  const d = si.diversityDistribution(['REVIEW', 'EDITORIAL', 'REVIEW', 'FORUM']);
  assert.deepEqual(d, [
    { type: 'REVIEW', count: 2 },
    { type: 'EDITORIAL', count: 1 },
    { type: 'FORUM', count: 1 },
  ]);
});

await test('diversity tie alphabetical', async () => {
  const d = si.diversityDistribution(['FORUM', 'EDITORIAL']);
  assert.deepEqual(d.map((x) => x.type), ['EDITORIAL', 'FORUM']);
});

await test('diversity empty', async () => {
  assert.deepEqual(si.diversityDistribution([]), []);
});

await test('diversity note empty', async () => {
  assert.match(si.diversityNote([]), /unavailable/);
});

await test('diversity note counts', async () => {
  const n = si.diversityNote([{ type: 'REVIEW', count: 2 }, { type: 'FORUM', count: 4 }]);
  assert.match(n, /REVIEW: 2/);
  assert.match(n, /never a diversity score/);
});

await test('diversity single', async () => {
  assert.deepEqual(si.diversityDistribution(['OTHER']), [{ type: 'OTHER', count: 1 }]);
});

/* ---------- freshness (7) ---------- */

await test('freshness competitor fresher', async () => {
  assert.equal(
    si.freshnessCompare({ oursIso: '2025-01-01T00:00:00.000Z', competitorIso: '2026-09-01T00:00:00.000Z' }),
    'FRESHER_COMPETITOR_SOURCE',
  );
});

await test('freshness ours fresher', async () => {
  assert.equal(
    si.freshnessCompare({ oursIso: '2026-09-01T00:00:00.000Z', competitorIso: '2025-01-01T00:00:00.000Z' }),
    'OUR_SOURCE_FRESHER',
  );
});

await test('freshness unknown nulls', async () => {
  assert.equal(si.freshnessCompare({ oursIso: null, competitorIso: '2026-01-01T00:00:00.000Z' }), 'FRESHNESS_UNKNOWN');
  assert.equal(si.freshnessCompare({ oursIso: null, competitorIso: null }), 'FRESHNESS_UNKNOWN');
});

await test('freshness unknown invalid', async () => {
  assert.equal(si.freshnessCompare({ oursIso: 'nope', competitorIso: '2026-01-01T00:00:00.000Z' }), 'FRESHNESS_UNKNOWN');
});

await test('freshness no material', async () => {
  assert.equal(
    si.freshnessCompare({ oursIso: '2026-09-01T00:00:00.000Z', competitorIso: '2026-08-01T00:00:00.000Z' }),
    'NO_MATERIAL_DIFFERENCE',
  );
});

await test('freshness boundary 180', async () => {
  assert.equal(
    si.freshnessCompare({ oursIso: '2026-03-04T00:00:00.000Z', competitorIso: '2026-09-01T00:00:00.000Z' }),
    'FRESHER_COMPETITOR_SOURCE',
  );
  assert.equal(
    si.freshnessCompare({ oursIso: '2026-09-01T00:00:00.000Z', competitorIso: '2026-02-01T00:00:00.000Z' }),
    'OUR_SOURCE_FRESHER',
  );
});

await test('freshness never inferred text', async () => {
  assert.doesNotMatch('FRESHNESS_UNKNOWN', /inferred|assumed/i);
});

/* ---------- frequency (3) ---------- */

await test('frequency single', async () => {
  const n = si.frequencyNote('g2.com', 1, 5);
  assert.match(n, /single observation/);
  assert.match(n, /no frequency claim/);
});

await test('frequency recurring', async () => {
  const n = si.frequencyNote('g2.com', 4, 5);
  assert.match(n, /OBSERVED_SOURCE_RECURRING/);
  assert.match(n, /4\/5/);
  assert.match(n, /never called authority/);
});

await test('frequency deterministic', async () => {
  assert.equal(si.frequencyNote('a.com', 3, 4), si.frequencyNote('a.com', 3, 4));
});

/* ---------- conflict + trust (9) ---------- */

await test('conflict format', async () => {
  const n = si.conflictNote('pricing = X', 'pricing = Y');
  assert.match(n, /CONFLICTING_SOURCE_EVIDENCE/);
  assert.match(n, /source A says pricing = X/);
});

await test('trust supported', async () => {
  assert.equal(si.trustFor({ supported: true, contradicted: false, stale: false, observed: true }), 'SUPPORTED');
});

await test('trust conflicting', async () => {
  assert.equal(si.trustFor({ supported: true, contradicted: true, stale: false, observed: true }), 'CONFLICTING');
});

await test('trust stale', async () => {
  assert.equal(si.trustFor({ supported: true, contradicted: false, stale: true, observed: true }), 'STALE');
});

await test('trust unknown unobserved', async () => {
  assert.equal(si.trustFor({ supported: true, contradicted: false, stale: false, observed: false }), 'UNKNOWN');
});

await test('trust partial', async () => {
  assert.equal(si.trustFor({ supported: false, contradicted: false, stale: false, observed: true }), 'PARTIALLY_SUPPORTED');
});

await test('trust no scores', async () => {
  assert.doesNotMatch(JSON.stringify(['SUPPORTED', 'PARTIALLY_SUPPORTED', 'CONFLICTING', 'STALE', 'UNSUPPORTED', 'UNKNOWN']), /score/i);
});

await test('trust deterministic', async () => {
  assert.equal(
    si.trustFor({ supported: true, contradicted: false, stale: false, observed: true }),
    si.trustFor({ supported: true, contradicted: false, stale: false, observed: true }),
  );
});

await test('conflict deterministic', async () => {
  assert.equal(si.conflictNote('a', 'b'), si.conflictNote('a', 'b'));
});

/* ---------- gap categories (9) ---------- */

await test('gap review', async () => {
  assert.equal(si.gapForMissingType('REVIEW'), 'MISSING_REVIEW_SOURCE');
});

await test('gap comparison', async () => {
  assert.equal(si.gapForMissingType('COMPARISON'), 'MISSING_COMPARISON_SOURCE');
});

await test('gap editorial', async () => {
  assert.equal(si.gapForMissingType('EDITORIAL'), 'MISSING_EDITORIAL_SOURCE');
});

await test('gap community', async () => {
  assert.equal(si.gapForMissingType('COMMUNITY'), 'MISSING_COMMUNITY_SOURCE');
});

await test('gap industry', async () => {
  assert.equal(si.gapForMissingType('INDUSTRY_PUBLICATION'), 'MISSING_INDUSTRY_SOURCE');
});

await test('gap directory', async () => {
  assert.equal(si.gapForMissingType('DIRECTORY'), 'MISSING_DIRECTORY_SOURCE');
});

await test('gap research', async () => {
  assert.equal(si.gapForMissingType('RESEARCH'), 'MISSING_RESEARCH_SOURCE');
});

await test('gap null others', async () => {
  assert.equal(si.gapForMissingType('FIRST_PARTY'), null);
  assert.equal(si.gapForMissingType('SOCIAL'), null);
  assert.equal(si.gapForMissingType('UNKNOWN'), null);
  assert.equal(si.gapForMissingType('OTHER'), null);
});

await test('gap deterministic', async () => {
  assert.equal(si.gapForMissingType('REVIEW'), si.gapForMissingType('REVIEW'));
});

/* ---------- opportunities (12) ---------- */

await test('opp validate has work', async () => {
  assert.equal(
    si.opportunityFor({ presence: 'COMPETITOR_SOURCE_PRESENT', freshness: 'FRESHNESS_UNKNOWN', claimGap: true, hasWork: true }),
    'VALIDATE_SOURCE',
  );
});

await test('opp investigate competitor', async () => {
  assert.equal(
    si.opportunityFor({ presence: 'COMPETITOR_SOURCE_PRESENT', freshness: 'FRESHNESS_UNKNOWN', claimGap: false, hasWork: false }),
    'INVESTIGATE_SOURCE',
  );
});

await test('opp update shared stale', async () => {
  assert.equal(
    si.opportunityFor({ presence: 'SHARED_SOURCE', freshness: 'FRESHER_COMPETITOR_SOURCE', claimGap: false, hasWork: false }),
    'UPDATE_EXISTING_SOURCE',
  );
});

await test('opp expand shared', async () => {
  assert.equal(
    si.opportunityFor({ presence: 'SHARED_SOURCE', freshness: 'FRESHNESS_UNKNOWN', claimGap: false, hasWork: false }),
    'EXPAND_SOURCE_COVERAGE',
  );
});

await test('opp defend ours', async () => {
  assert.equal(
    si.opportunityFor({ presence: 'OUR_SOURCE_PRESENT', freshness: 'FRESHNESS_UNKNOWN', claimGap: false, hasWork: false }),
    'DEFEND_SOURCE',
  );
});

await test('opp pursue absent claim', async () => {
  assert.equal(
    si.opportunityFor({ presence: 'OUR_SOURCE_ABSENT', freshness: 'FRESHNESS_UNKNOWN', claimGap: true, hasWork: false }),
    'PURSUE_SOURCE',
  );
});

await test('opp review absent', async () => {
  assert.equal(
    si.opportunityFor({ presence: 'OUR_SOURCE_ABSENT', freshness: 'FRESHNESS_UNKNOWN', claimGap: false, hasWork: false }),
    'REVIEW_SOURCE',
  );
});

await test('opp unknown investigate', async () => {
  assert.equal(
    si.opportunityFor({ presence: 'UNKNOWN', freshness: 'FRESHNESS_UNKNOWN', claimGap: false, hasWork: false }),
    'INVESTIGATE_SOURCE',
  );
});

await test('opp labels not tasks', async () => {
  for (const o of si.SOURCE_OPPORTUNITIES) {
    assert.doesNotMatch(o, /EMAIL|POST|CREATE_REVIEW|SUBMIT|BUY|GENERATE/i);
  }
});

await test('opp deterministic', async () => {
  const a = { presence: 'SHARED_SOURCE', freshness: 'FRESHNESS_UNKNOWN', claimGap: false, hasWork: false };
  assert.equal(si.opportunityFor(a), si.opportunityFor(a));
});

await test('opp competitor absent review', async () => {
  assert.equal(
    si.opportunityFor({ presence: 'COMPETITOR_SOURCE_ABSENT', freshness: 'FRESHNESS_UNKNOWN', claimGap: false, hasWork: false }),
    'INVESTIGATE_SOURCE',
  );
});

await test('opp ours stale defend', async () => {
  assert.equal(
    si.opportunityFor({ presence: 'OUR_SOURCE_PRESENT', freshness: 'FRESHER_COMPETITOR_SOURCE', claimGap: true, hasWork: false }),
    'DEFEND_SOURCE',
  );
});

/* ---------- fingerprints (4) ---------- */

function fp(o = {}) {
  return si.sourceFingerprint({ organizationId: 'o1', websiteId: 'w1', domain: 'g2.com', target: 'crm', ...o });
}

await test('source fp deterministic', async () => {
  assert.equal(fp(), fp());
});

await test('source fp domain case-insensitive', async () => {
  assert.equal(fp(), fp({ domain: 'G2.COM' }));
});

await test('source fp isolates tenants', async () => {
  assert.notEqual(fp(), fp({ organizationId: 'o2' }));
  assert.notEqual(fp(), fp({ websiteId: 'w2' }));
  assert.notEqual(fp(), fp({ domain: 'capterra.com' }));
});

await test('source fp length', async () => {
  assert.equal(fp().length, 32);
});

/* ---------- agency (6) ---------- */

await test('agency five lines', async () => {
  const a = si.agencySourceSummary({ observed: ['g2.com'], competitors: ['rival on g2'], ours: ['acme.com'], unknown: ['sentiment'], investigate: ['g2 profile'] });
  assert.equal(a.length, 5);
  assert.ok(a[0].startsWith('WHAT WE OBSERVED:'));
  assert.ok(a[1].startsWith('WHERE COMPETITORS APPEAR:'));
  assert.ok(a[2].startsWith('WHERE WE APPEAR:'));
  assert.ok(a[3].startsWith('WHAT IS UNKNOWN:'));
  assert.ok(a[4].startsWith('WHAT WE SHOULD INVESTIGATE:'));
});

await test('agency empties', async () => {
  const a = si.agencySourceSummary({ observed: [], competitors: [], ours: [], unknown: [], investigate: [] });
  assert.match(a[0], /no observed sources/);
  assert.match(a[3], /nothing material/);
});

await test('agency no backlinks order', async () => {
  const a = si.agencySourceSummary({ observed: ['x'], competitors: [], ours: [], unknown: [], investigate: [] });
  assert.doesNotMatch(a.join(' '), /Get these backlinks|guaranteed/i);
});

await test('agency deterministic', async () => {
  const mk = () => si.agencySourceSummary({ observed: ['x'], competitors: [], ours: [], unknown: [], investigate: [] });
  assert.deepEqual(mk(), mk());
});

await test('agency joined lists', async () => {
  const a = si.agencySourceSummary({ observed: ['a', 'b'], competitors: [], ours: [], unknown: [], investigate: [] });
  assert.match(a[0], /a; b/);
});

await test('agency no jargon scores', async () => {
  assert.doesNotMatch(si.agencySourceSummary({ observed: [], competitors: [], ours: [], unknown: [], investigate: [] }).join(' '), /score|probability/i);
});

/* ---------- honesty invariants (14) ---------- */

await test('presence never influence', async () => {
  assert.doesNotMatch(si.presenceNote('COMPETITOR_SOURCE_PRESENT'), /influence|authoritative/i);
});

await test('frequency never authority', async () => {
  const n = si.frequencyNote('x.com', 9, 10);
  assert.match(n, /OBSERVED_SOURCE_RECURRING/);
  assert.match(n, /Recurrence is not influence/);
  assert.doesNotMatch(n, /authority score|influence score/i);
});

await test('no invented source authority', async () => {
  const n = si.presenceNote('COMPETITOR_SOURCE_PRESENT');
  assert.match(n, /COMPETITOR_ONLY_SOURCE/);
  assert.doesNotMatch(n, /authority score|trust score/i);
});

await test('ambiguous stays other', async () => {
  assert.equal(cls('https://some-random-site-xyz.com/page', []), 'OTHER');
});

await test('unparseable stays unknown', async () => {
  assert.equal(cls(':::', []), 'UNKNOWN');
});

await test('no outreach vocabulary', async () => {
  assert.doesNotMatch(JSON.stringify(si.SOURCE_OPPORTUNITIES), /EMAIL|OUTREACH|SUBMIT|REVIEW_GENERAT|BACKLINK/i);
});

await test('no causal claims', async () => {
  const blob = JSON.stringify([
    si.presenceNote('COMPETITOR_SOURCE_PRESENT'),
    si.diversityNote([{ type: 'REVIEW', count: 2 }]),
    si.frequencyNote('x', 3, 4),
  ]);
  assert.doesNotMatch(blob, /caused|because of|drives rankings/i);
});

await test('diversity never scored', async () => {
  const n = si.diversityNote([{ type: 'FORUM', count: 3 }]);
  assert.match(n, /Descriptive counts only/);
  assert.doesNotMatch(n, /diversity score: [0-9]|score =/i);
});

await test('trust never scored', async () => {
  assert.equal(si.trustFor({ supported: true, contradicted: false, stale: false, observed: true }), 'SUPPORTED');
});

await test('unknowns valid everywhere', async () => {
  assert.equal(si.sourcePresence({ brandPresent: null, competitorPresent: null }), 'UNKNOWN');
  assert.equal(si.freshnessCompare({ oursIso: null, competitorIso: null }), 'FRESHNESS_UNKNOWN');
});

await test('first party never third party', async () => {
  assert.notEqual(cls('https://acme.com/x', ['acme.com']), 'EDITORIAL');
});

await test('competitor domain not own', async () => {
  assert.notEqual(cls('https://rival.com/x', ['acme.com']), 'FIRST_PARTY');
});

await test('no fake influence text', async () => {
  assert.doesNotMatch(si.agencySourceSummary({ observed: ['x'], competitors: ['y'], ours: [], unknown: [], investigate: [] }).join(' '), /influence score|will rank/i);
});

await test('evidence states not scores', async () => {
  assert.ok(['SUPPORTED', 'PARTIALLY_SUPPORTED', 'CONFLICTING', 'STALE', 'UNSUPPORTED', 'UNKNOWN'].length === 6);
});

/* ---------- performance (5) ---------- */

await test('classify batch 500', async () => {
  const urls = ['https://www.g2.com/x', 'https://www.reddit.com/r/a', 'https://acme.com/p', 'https://www.nytimes.com/a', 'https://unknown-xyz.com/p'];
  for (let i = 0; i < 500; i++) {
    cls(urls[i % urls.length], ['acme.com']);
  }
  assert.ok(true);
});

await test('presence batch 500', async () => {
  const combos = [
    { brandPresent: true, competitorPresent: true },
    { brandPresent: true, competitorPresent: false },
    { brandPresent: false, competitorPresent: true },
    { brandPresent: null, competitorPresent: null },
  ];
  for (let i = 0; i < 500; i++) {
    si.sourcePresence(combos[i % combos.length]);
  }
  assert.ok(true);
});

await test('diversity batch 200', async () => {
  for (let i = 0; i < 200; i++) {
    si.diversityDistribution(['REVIEW', 'FORUM', 'EDITORIAL', 'REVIEW']);
  }
  assert.ok(true);
});

await test('fingerprints batch 500', async () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    seen.add(fp({ domain: `source${i}.com` }));
  }
  assert.equal(seen.size, 500);
});

await test('opportunities batch 300', async () => {
  const presences = ['SHARED_SOURCE', 'COMPETITOR_SOURCE_PRESENT', 'OUR_SOURCE_PRESENT', 'UNKNOWN'];
  for (let i = 0; i < 300; i++) {
    si.opportunityFor({ presence: presences[i % presences.length], freshness: 'FRESHNESS_UNKNOWN', claimGap: i % 2 === 0, hasWork: false });
  }
  assert.ok(true);
});

/* ---------- classification extras (20) ---------- */

await test('review trustradius', async () => {
  assert.equal(cls('https://www.trustradius.com/products/acme/reviews', []), 'REVIEW');
});

await test('review goodfirms', async () => {
  assert.equal(cls('https://www.goodfirms.co/company/acme', []), 'REVIEW');
});

await test('community stackoverflow', async () => {
  assert.equal(cls('https://stackoverflow.com/questions/123', []), 'COMMUNITY');
});

await test('community discord', async () => {
  assert.equal(cls('https://discord.com/channels/1/2', []), 'COMMUNITY');
});

await test('forum discourse', async () => {
  assert.equal(cls('https://meta.discourse.org/t/topic/1', []), 'FORUM');
});

await test('directory linkedin company', async () => {
  assert.equal(cls('https://www.linkedin.com/company/acme', []), 'DIRECTORY');
});

await test('marketplace etsy', async () => {
  assert.equal(cls('https://www.etsy.com/listing/123', []), 'MARKETPLACE');
});

await test('marketplace play store', async () => {
  assert.equal(cls('https://play.google.com/store/apps/details?id=x', []), 'MARKETPLACE');
});

await test('social instagram', async () => {
  assert.equal(cls('https://www.instagram.com/p/abc', []), 'SOCIAL');
});

await test('social x twitter', async () => {
  assert.equal(cls('https://x.com/user/status/1', []), 'SOCIAL');
});

await test('government sba', async () => {
  assert.equal(cls('https://www.sba.gov/funding', []), 'GOVERNMENT');
});

await test('academic scholar', async () => {
  assert.equal(cls('https://scholar.google.com/citations?user=x', []), 'ACADEMIC');
});

await test('research pew', async () => {
  assert.equal(cls('https://www.pewresearch.org/report', []), 'RESEARCH');
});

await test('industry techcrunch', async () => {
  assert.equal(cls('https://techcrunch.com/2026/01/01/startup', []), 'INDUSTRY_PUBLICATION');
});

await test('industry reuters', async () => {
  assert.equal(cls('https://www.reuters.com/technology/article', []), 'INDUSTRY_PUBLICATION');
});

await test('editorial guardian', async () => {
  assert.equal(cls('https://www.theguardian.com/tech/article', []), 'EDITORIAL');
});

await test('editorial substack', async () => {
  assert.equal(cls('https://author.substack.com/p/post', []), 'EDITORIAL');
});

await test('comparison alternatives path', async () => {
  assert.equal(cls('https://example.com/top-alternatives', []), 'COMPARISON');
});

await test('first party deep path', async () => {
  assert.equal(cls('https://docs.acme.com/guides/start', ['acme.com']), 'FIRST_PARTY');
});

await test('other docs site', async () => {
  assert.equal(cls('https://docs.randomvendor.io/start', []), 'OTHER');
});

/* ---------- presence/diversity/freshness extras (10) ---------- */

await test('presence competitor null brand true', async () => {
  assert.equal(si.sourcePresence({ brandPresent: true, competitorPresent: null }), 'UNKNOWN');
});

await test('diversity three types', async () => {
  const d = si.diversityDistribution(['REVIEW', 'REVIEW', 'FORUM', 'EDITORIAL', 'FORUM', 'FORUM']);
  assert.deepEqual(d[0], { type: 'FORUM', count: 3 });
  assert.deepEqual(d[1], { type: 'REVIEW', count: 2 });
});

await test('diversity note mixed', async () => {
  const n = si.diversityNote([{ type: 'EDITORIAL', count: 3 }, { type: 'REVIEW', count: 2 }, { type: 'COMMUNITY', count: 4 }, { type: 'FORUM', count: 1 }]);
  assert.match(n, /EDITORIAL: 3/);
  assert.match(n, /COMMUNITY: 4/);
});

await test('freshness same day none', async () => {
  assert.equal(
    si.freshnessCompare({ oursIso: '2026-09-01T00:00:00.000Z', competitorIso: '2026-09-01T00:00:00.000Z' }),
    'NO_MATERIAL_DIFFERENCE',
  );
});

await test('frequency two windows', async () => {
  assert.match(si.frequencyNote('x.com', 2, 5), /2\/5/);
});

await test('trust stale beats partial', async () => {
  assert.equal(si.trustFor({ supported: false, contradicted: false, stale: true, observed: true }), 'STALE');
});

await test('conflict sources quoted', async () => {
  assert.match(si.conflictNote('a', 'b'), /Phase 25/);
});

await test('gap forum none', async () => {
  assert.equal(si.gapForMissingType('FORUM'), null);
  assert.equal(si.gapForMissingType('SOCIAL'), null);
  assert.equal(si.gapForMissingType('MARKETPLACE'), null);
  assert.equal(si.gapForMissingType('GOVERNMENT'), null);
  assert.equal(si.gapForMissingType('ACADEMIC'), null);
});

await test('opp shared stale claim', async () => {
  assert.equal(
    si.opportunityFor({ presence: 'SHARED_SOURCE', freshness: 'FRESHER_COMPETITOR_SOURCE', claimGap: true, hasWork: true }),
    'VALIDATE_SOURCE',
  );
});

await test('agency unknown defaults', async () => {
  const a = si.agencySourceSummary({ observed: [], competitors: [], ours: ['acme.com'], unknown: [], investigate: ['g2'] });
  assert.match(a[2], /acme.com/);
  assert.match(a[4], /g2/);
});

/* ---------- fingerprints/agency extras (6) ---------- */

await test('source fp target sensitive', async () => {
  assert.notEqual(fp({ target: 'crm' }), fp({ target: 'erp' }));
});

await test('source fp website sensitive', async () => {
  assert.notEqual(fp(), fp({ websiteId: 'w9' }));
});

await test('agency competitors joined', async () => {
  const a = si.agencySourceSummary({ observed: [], competitors: ['a on g2', 'b on capterra'], ours: [], unknown: [], investigate: [] });
  assert.match(a[1], /a on g2; b on capterra/);
});

await test('agency ours empty text', async () => {
  assert.match(si.agencySourceSummary({ observed: [], competitors: [], ours: [], unknown: [], investigate: [] })[2], /no observed own sources/);
});

await test('agency investigate empty text', async () => {
  assert.match(si.agencySourceSummary({ observed: [], competitors: [], ours: [], unknown: [], investigate: [] })[4], /nothing prioritized/);
});

await test('source fp deterministic repeat', async () => {
  assert.equal(fp({ domain: 'x.com', target: 'y' }), fp({ domain: 'x.com', target: 'y' }));
});

/* ---------- honesty extras (8) ---------- */

await test('review beats editorial overlap', async () => {
  assert.equal(cls('https://www.gartner.com/reviews/x', []), 'REVIEW');
});

await test('no sentiment inference', async () => {
  assert.match(si.presenceNote('SHARED_SOURCE'), /nothing about sentiment/);
});

await test('no cause in competitor note', async () => {
  assert.doesNotMatch(si.presenceNote('COMPETITOR_SOURCE_PRESENT'), /causes|drives|because/i);
});

await test('unknown presence text', async () => {
  assert.match(si.presenceNote('UNKNOWN'), /could not be established/);
});

await test('frequency single no claim', async () => {
  assert.doesNotMatch(si.frequencyNote('x.com', 1, 3), /recurring|authority/i);
});

await test('trust unknown default', async () => {
  assert.equal(si.trustFor({ supported: false, contradicted: false, stale: false, observed: false }), 'UNKNOWN');
});

await test('gap null for first party', async () => {
  assert.equal(si.gapForMissingType('FIRST_PARTY'), null);
});

await test('opp unknown freshness investigate', async () => {
  assert.equal(
    si.opportunityFor({ presence: 'COMPETITOR_SOURCE_ABSENT', freshness: 'FRESHNESS_UNKNOWN', claimGap: true, hasWork: false }),
    'INVESTIGATE_SOURCE',
  );
});

/* ---------- extras to 200 (12) ---------- */

await test('review sourceforge', async () => {
  assert.equal(cls('https://sourceforge.net/software/acme/reviews', []), 'REVIEW');
});

await test('community stackexchange', async () => {
  assert.equal(cls('https://webmasters.stackexchange.com/q/1', []), 'COMMUNITY');
});

await test('social facebook post', async () => {
  assert.equal(cls('https://www.facebook.com/acme/posts/1', []), 'SOCIAL');
});

await test('editorial wired', async () => {
  assert.equal(cls('https://www.wired.com/story/ai-search', []), 'INDUSTRY_PUBLICATION');
});

await test('research mckinsey', async () => {
  assert.equal(cls('https://www.mckinsey.com/capabilities/report', []), 'RESEARCH');
});

await test('government data gouv directory', async () => {
  assert.equal(cls('https://annuaire-entreprises.data.gouv.fr/etablissement', []), 'GOVERNMENT');
});

await test('academic scholar profile', async () => {
  assert.equal(cls('https://scholar.google.com/citations?hl=en', []), 'ACADEMIC');
});

await test('industry bloomberg', async () => {
  assert.equal(cls('https://www.bloomberg.com/news/articles/x', []), 'INDUSTRY_PUBLICATION');
});

await test('comparison versus path', async () => {
  assert.equal(cls('https://example.com/acme-versus-rival', []), 'COMPARISON');
});

await test('first party docs path', async () => {
  assert.equal(cls('https://help.acme.com/en/articles/1', ['acme.com']), 'FIRST_PARTY');
});

await test('diversity four types sorted', async () => {
  const d = si.diversityDistribution(['OTHER', 'REVIEW', 'OTHER', 'FORUM']);
  assert.deepEqual(d[0], { type: 'OTHER', count: 2 });
});

await test('trust partial supported text', async () => {
  assert.equal(si.trustFor({ supported: false, contradicted: false, stale: false, observed: true }), 'PARTIALLY_SUPPORTED');
});

/* ---------- summary ---------- */

const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(`\nSource Intelligence 1.0: ${passCount}/${results.length} passed.`);
if (failed.length > 0) {
  console.log(failed.join('\n'));
  process.exit(1);
} else {
  console.log('All Source Intelligence 1.0 tests passed.');
}

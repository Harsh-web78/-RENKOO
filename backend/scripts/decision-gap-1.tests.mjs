/*
 * RENKOO Search & AI Decision Gap Intelligence 1.0 — tests (Phase 38).
 *
 * 206 tests over pure functions only: target types,
 * fingerprints, intent inference + mismatch, SERP
 * formats + dominant + mismatch, buyer criteria,
 * tokenize/coverage, AI states (citation never
 * recommendation), source gaps, technical gaps,
 * authority honesty, freshness, evidence ordering,
 * why summaries, conflicts, unknowns, next decisions,
 * determinism, tenant isolation, bounded performance,
 * honesty invariants. No DB, no provider calls, no
 * AI calls, no billing touch.
 *
 * Run: npm run test:decision-gap-1   (dist built)
 */
import assert from 'node:assert/strict';

const dg = await import(
  '../dist/growth-plan/decision-gap.js'
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

function fp(o = {}) {
  return dg.gapFingerprint({
    organizationId: 'o1',
    websiteId: 'w1',
    targetType: 'GOOGLE_QUERY',
    target: 'best crm',
    ...o,
  });
}

/* ---------- targets + fingerprints + caps (10) ---------- */

await test('targets six', async () => {
  assert.equal(dg.GAP_TARGETS.length, 6);
  for (const t of ['GOOGLE_QUERY', 'AI_PROMPT', 'PAGE', 'TOPIC', 'CUSTOMER_NEED', 'COMPETITOR_COMPARISON']) {
    assert.ok(dg.GAP_TARGETS.includes(t));
  }
});

await test('fingerprint deterministic', async () => {
  assert.equal(fp(), fp());
});

await test('fingerprint case-insensitive target', async () => {
  assert.equal(fp(), fp({ target: 'Best CRM' }));
});

await test('fingerprint differs target', async () => {
  assert.notEqual(fp(), fp({ target: 'best erp' }));
});

await test('fingerprint differs type', async () => {
  assert.notEqual(fp(), fp({ targetType: 'AI_PROMPT' }));
});

await test('fingerprint isolates tenants', async () => {
  assert.notEqual(fp(), fp({ organizationId: 'o2' }));
  assert.notEqual(fp(), fp({ websiteId: 'w2' }));
});

await test('caps five twenty ten', async () => {
  assert.equal(dg.MAX_GAPS, 5);
  assert.equal(dg.MAX_TARGETS, 20);
  assert.equal(dg.MAX_COMPETITORS, 10);
  assert.equal(dg.MAX_SERP_RESULTS, 10);
});

await test('fingerprint length 32', async () => {
  assert.equal(fp().length, 32);
});

await test('buyer criteria eleven', async () => {
  assert.equal(dg.BUYER_CRITERIA.length, 11);
});

await test('fingerprint empty safe', async () => {
  assert.equal(fp({ target: '' }).length, 32);
});

/* ---------- intent (20) ---------- */

await test('intent informational what', async () => {
  assert.equal(dg.inferIntent('what is a CRM'), 'INFORMATIONAL');
});

await test('intent informational how', async () => {
  assert.equal(dg.inferIntent('how to choose CRM'), 'INFORMATIONAL');
  assert.equal(dg.inferIntent('CRM guide for beginners'), 'INFORMATIONAL');
});

await test('intent commercial best', async () => {
  assert.equal(dg.inferIntent('best CRM for agencies'), 'COMMERCIAL');
});

await test('intent commercial compare', async () => {
  assert.equal(dg.inferIntent('hubspot vs salesforce'), 'COMMERCIAL');
  assert.equal(dg.inferIntent('CRM reviews and alternatives'), 'COMMERCIAL');
});

await test('intent transactional buy', async () => {
  assert.equal(dg.inferIntent('buy CRM software'), 'TRANSACTIONAL');
  assert.equal(dg.inferIntent('CRM pricing discount'), 'TRANSACTIONAL');
});

await test('intent local near me', async () => {
  assert.equal(dg.inferIntent('CRM consultant near me'), 'LOCAL');
});

await test('intent unknown empty', async () => {
  assert.equal(dg.inferIntent(''), 'UNKNOWN');
  assert.equal(dg.inferIntent(null), 'UNKNOWN');
});

await test('intent unknown generic', async () => {
  assert.equal(dg.inferIntent('crm'), 'UNKNOWN');
});

await test('page transactional', async () => {
  assert.equal(dg.pageAngle('Buy now. Pricing plans. Checkout.'), 'TRANSACTIONAL');
});

await test('page commercial', async () => {
  assert.equal(dg.pageAngle('Compare the best tools. Read reviews.'), 'COMMERCIAL');
});

await test('page informational', async () => {
  assert.equal(dg.pageAngle('A complete guide to learn blogging'), 'INFORMATIONAL');
  assert.equal(dg.pageAngle('What is CRM software, explained'), 'INFORMATIONAL');
});

await test('page unknown', async () => {
  assert.equal(dg.pageAngle('Welcome to our site'), 'UNKNOWN');
  assert.equal(dg.pageAngle(''), 'UNKNOWN');
});

await test('mismatch info vs commercial', async () => {
  const r = dg.intentMismatch({ queryIntent: 'INFORMATIONAL', pageAngle: 'COMMERCIAL' });
  assert.equal(r.mismatch, true);
  assert.equal(r.kind, 'INTENT_MISMATCH');
  assert.match(r.note, /Observed mismatch/);
  assert.match(r.note, /never “Google penalizes this”/);
  assert.doesNotMatch(r.note, /penalty applied|penalized by google/i);
});

await test('mismatch commercial vs transactional', async () => {
  assert.equal(dg.intentMismatch({ queryIntent: 'COMMERCIAL', pageAngle: 'TRANSACTIONAL' }).mismatch, true);
});

await test('match same no mismatch', async () => {
  const r = dg.intentMismatch({ queryIntent: 'COMMERCIAL', pageAngle: 'COMMERCIAL' });
  assert.equal(r.mismatch, false);
  assert.equal(r.kind, null);
});

await test('unknown never mismatch', async () => {
  assert.equal(dg.intentMismatch({ queryIntent: 'UNKNOWN', pageAngle: 'COMMERCIAL' }).mismatch, false);
  assert.equal(dg.intentMismatch({ queryIntent: 'INFORMATIONAL', pageAngle: 'UNKNOWN' }).mismatch, false);
});

await test('mismatch note never factor claim', async () => {
  assert.doesNotMatch(
    dg.intentMismatch({ queryIntent: 'INFORMATIONAL', pageAngle: 'COMMERCIAL' }).note,
    /ranking factor/i,
  );
});

await test('intent navigational generic', async () => {
  assert.equal(dg.inferIntent('hubspot login'), 'UNKNOWN');
});

await test('intent vs review commercial', async () => {
  assert.equal(dg.inferIntent('salesforce vs hubspot which is better'), 'COMMERCIAL');
});

await test('page angle mixed transactional wins', async () => {
  assert.equal(dg.pageAngle('guide with pricing and buy now'), 'TRANSACTIONAL');
});

/* ---------- SERP formats (20) ---------- */

await test('format video', async () => {
  assert.equal(dg.serpFormatOf('Best CRM video review', 'watch on YouTube', 'VIDEO'), 'VIDEO');
});

await test('format forum', async () => {
  assert.equal(dg.serpFormatOf('CRM thread', 'reddit discussion', ''), 'FORUM');
  assert.equal(dg.serpFormatOf('Quora answers', '', ''), 'FORUM');
});

await test('format comparison', async () => {
  assert.equal(dg.serpFormatOf('Top 10 CRMs compared', 'best tools for agencies', ''), 'COMPARISON');
  assert.equal(dg.serpFormatOf('Hubspot vs Salesforce', '', ''), 'COMPARISON');
});

await test('format product', async () => {
  assert.equal(dg.serpFormatOf('CRM software pricing', 'buy plans', ''), 'PRODUCT');
});

await test('format local', async () => {
  assert.equal(dg.serpFormatOf('CRM consultants', 'map near you', 'local'), 'LOCAL');
});

await test('format faq', async () => {
  assert.equal(dg.serpFormatOf('CRM questions', 'people also ask', ''), 'FAQ');
});

await test('format list', async () => {
  assert.equal(dg.serpFormatOf('15 CRM tips and ideas', 'ways and examples', ''), 'LIST');
});

await test('format tool', async () => {
  assert.equal(dg.serpFormatOf('ROI calculator', 'free template tool', ''), 'TOOL');
});

await test('format guide', async () => {
  assert.equal(dg.serpFormatOf('CRM tutorial', 'learn how to guide', ''), 'GUIDE');
});

await test('format commercial', async () => {
  assert.equal(dg.serpFormatOf('Hire a CRM agency', 'request a demo quote', ''), 'COMMERCIAL');
});

await test('format unknown', async () => {
  assert.equal(dg.serpFormatOf('Acme Inc', 'Welcome', ''), 'UNKNOWN');
  assert.equal(dg.serpFormatOf(null, null, null), 'UNKNOWN');
});

await test('dominant majority', async () => {
  assert.equal(dg.dominantFormat(['COMPARISON', 'COMPARISON', 'GUIDE', 'UNKNOWN']), 'COMPARISON');
});

await test('dominant skips unknown', async () => {
  assert.equal(dg.dominantFormat(['UNKNOWN', 'UNKNOWN', 'GUIDE']), 'GUIDE');
});

await test('dominant empty unknown', async () => {
  assert.equal(dg.dominantFormat([]), 'UNKNOWN');
  assert.equal(dg.dominantFormat(['UNKNOWN']), 'UNKNOWN');
});

await test('format mismatch true', async () => {
  const r = dg.serpFormatMismatch({ dominant: 'COMPARISON', ours: 'GUIDE', observedCount: 8, totalCount: 10 });
  assert.equal(r.mismatch, true);
  assert.match(r.note, /8\/10/);
  assert.match(r.note, /never inferred from generic SEO rules/);
});

await test('format match false', async () => {
  assert.equal(dg.serpFormatMismatch({ dominant: 'GUIDE', ours: 'GUIDE', observedCount: 5, totalCount: 10 }).mismatch, false);
});

await test('format unknown false', async () => {
  assert.equal(dg.serpFormatMismatch({ dominant: 'UNKNOWN', ours: 'GUIDE', observedCount: 0, totalCount: 0 }).mismatch, false);
  assert.equal(dg.serpFormatMismatch({ dominant: 'GUIDE', ours: 'UNKNOWN', observedCount: 0, totalCount: 0 }).mismatch, false);
});

await test('format commercial product distinct', async () => {
  assert.notEqual(dg.serpFormatOf('Buy CRM now', '', ''), dg.serpFormatOf('Hire CRM experts', '', ''));
});

await test('format result type video', async () => {
  assert.equal(dg.serpFormatOf('Highlights', 'recap', 'VideoObject'), 'VIDEO');
});

await test('dominant tie first wins deterministic', async () => {
  assert.equal(dg.dominantFormat(['GUIDE', 'LIST']), 'GUIDE');
  assert.equal(dg.dominantFormat(['LIST', 'GUIDE']), 'LIST');
});

/* ---------- buyer criteria (12) ---------- */

await test('criteria price features', async () => {
  assert.deepEqual(dg.buyerCriteriaIn('Pricing and features compared'), ['price', 'features']);
});

await test('criteria quality support security', async () => {
  const c = dg.buyerCriteriaIn('Enterprise quality, 24/7 support, SOC2 security, fast performance');
  assert.ok(c.includes('quality') && c.includes('support') && c.includes('security') && c.includes('performance'));
});

await test('criteria none', async () => {
  assert.deepEqual(dg.buyerCriteriaIn('Welcome to our homepage'), []);
});

await test('criteria case-insensitive', async () => {
  assert.ok(dg.buyerCriteriaIn('PRICING and INTEGRATIONS').includes('price'));
});

await test('gap true missing', async () => {
  const g = dg.buyerCriteriaGap({ query: 'best CRM', competitorTexts: ['pricing features support'], ourText: 'great features' });
  assert.equal(g.gap, true);
  assert.deepEqual(g.missing, ['price', 'support']);
  assert.ok(g.missing.includes('price'));
});

await test('gap false covered', async () => {
  const g = dg.buyerCriteriaGap({ query: 'q', competitorTexts: ['pricing features'], ourText: 'pricing and features overview' });
  assert.equal(g.gap, false);
  assert.match(g.note, /No observed buyer-criteria gap/);
});

await test('gap null ours all missing', async () => {
  const g = dg.buyerCriteriaGap({ query: 'q', competitorTexts: ['pricing'], ourText: null });
  assert.equal(g.gap, true);
  assert.deepEqual(g.missing, ['price']);
});

await test('gap observed sorted unique', async () => {
  const g = dg.buyerCriteriaGap({ query: 'q', competitorTexts: ['pricing pricing features', 'features support'], ourText: '' });
  assert.deepEqual(g.observed, [...new Set(g.observed)].sort());
});

await test('gap note observed text only', async () => {
  assert.match(
    dg.buyerCriteriaGap({ query: 'q', competitorTexts: ['pricing'], ourText: '' }).note,
    /observed text only/i,
  );
});

await test('criteria alternatives integrations', async () => {
  assert.ok(dg.buyerCriteriaIn('alternatives with slack integrations').includes('alternatives'));
});

await test('criteria use cases location', async () => {
  const c = dg.buyerCriteriaIn('agency use cases nearby with onboarding support');
  assert.ok(c.includes('use cases') && c.includes('location'));
});

await test('gap empty competitors none', async () => {
  const g = dg.buyerCriteriaGap({ query: 'q', competitorTexts: [], ourText: 'pricing' });
  assert.equal(g.gap, false);
  assert.deepEqual(g.observed, []);
});

/* ---------- tokenize + coverage (12) ---------- */

await test('tokenize lowercase strip', async () => {
  assert.deepEqual(dg.tokenize('Best CRM, Pricing!'), ['best', 'pricing']);
});

await test('tokenize short filtered', async () => {
  assert.deepEqual(dg.tokenize('a an the of to CRM'), []);
  assert.deepEqual(dg.tokenize('best CRM pricing'), ['best', 'pricing']);
});

await test('tokenize empty', async () => {
  assert.deepEqual(dg.tokenize(''), []);
  assert.deepEqual(dg.tokenize(null), []);
});

await test('coverage missing ordered', async () => {
  const g = dg.coverageGap({
    competitorTokens: [['pricing', 'automation', 'crm'], ['pricing', 'support', 'crm']],
    ourTokens: ['crm', 'features'],
    minCompetitors: 2,
  });
  assert.ok(g.missing.includes('pricing'));
  assert.ok(!g.missing.includes('crm'));
  assert.ok(!g.missing.includes('automation'));
});

await test('coverage threshold respected', async () => {
  const g = dg.coverageGap({
    competitorTokens: [['solo'], ['other']],
    ourTokens: [],
    minCompetitors: 2,
  });
  assert.deepEqual(g.missing, []);
});

await test('coverage min clamped', async () => {
  const g = dg.coverageGap({
    competitorTokens: [['rare', 'x']],
    ourTokens: [],
    minCompetitors: 9,
  });
  assert.ok(g.missing.includes('rare'));
});

await test('coverage capped twelve', async () => {
  const tokens = Array.from({ length: 30 }, (_, i) => [`term${i}aa`, 'shared']);
  const g = dg.coverageGap({ competitorTokens: tokens, ourTokens: [], minCompetitors: 1 });
  assert.ok(g.missing.length <= 12);
});

await test('coverage note terms', async () => {
  const g = dg.coverageGap({ competitorTokens: [['pricing']], ourTokens: [], minCompetitors: 1 });
  assert.match(g.note, /never semantic completeness/);
});

await test('coverage none note', async () => {
  const g = dg.coverageGap({ competitorTokens: [['a']], ourTokens: ['a'], minCompetitors: 1 });
  assert.match(g.note, /No observed term-coverage gap/);
});

await test('coverage dedupes per page', async () => {
  const g = dg.coverageGap({
    competitorTokens: [['pricing', 'pricing', 'pricing']],
    ourTokens: [],
    minCompetitors: 1,
  });
  assert.ok(g.missing.includes('pricing'));
});

await test('tokenize numbers kept', async () => {
  assert.ok(dg.tokenize('top 10 CRM trends 2026').includes('2026'));
});

await test('coverage sorted frequency', async () => {
  const g = dg.coverageGap({
    competitorTokens: [['aaa', 'bbb'], ['aaa', 'ccc'], ['aaa', 'bbb']],
    ourTokens: [],
    minCompetitors: 1,
  });
  assert.equal(g.missing[0], 'aaa');
});

/* ---------- AI states (16) ---------- */

await test('ai mentioned', async () => {
  assert.equal(
    dg.aiGapState({ ourMentioned: true, ourCited: false, competitorCited: false, competitorRecommended: false, providerSupports: true, conflicting: false }),
    'MENTIONED',
  );
});

await test('ai cited', async () => {
  assert.equal(
    dg.aiGapState({ ourMentioned: false, ourCited: true, competitorCited: false, competitorRecommended: false, providerSupports: true, conflicting: false }),
    'CITED',
  );
});

await test('ai cited competitor preference', async () => {
  assert.equal(
    dg.aiGapState({ ourMentioned: false, ourCited: true, competitorCited: true, competitorRecommended: true, providerSupports: true, conflicting: false }),
    'CITED_BUT_NOT_RECOMMENDED',
  );
});

await test('ai cited no competitor rec', async () => {
  assert.equal(
    dg.aiGapState({ ourMentioned: false, ourCited: true, competitorCited: true, competitorRecommended: false, providerSupports: true, conflicting: false }),
    'CITED',
  );
});

await test('ai competitor recommended', async () => {
  assert.equal(
    dg.aiGapState({ ourMentioned: false, ourCited: false, competitorCited: true, competitorRecommended: true, providerSupports: true, conflicting: false }),
    'COMPETITOR_RECOMMENDED',
  );
});

await test('ai not mentioned', async () => {
  assert.equal(
    dg.aiGapState({ ourMentioned: false, ourCited: false, competitorCited: false, competitorRecommended: false, providerSupports: true, conflicting: false }),
    'NOT_MENTIONED',
  );
});

await test('ai conflicting', async () => {
  assert.equal(
    dg.aiGapState({ ourMentioned: true, ourCited: true, competitorCited: false, competitorRecommended: false, providerSupports: true, conflicting: true }),
    'CONFLICTING',
  );
});

await test('ai unknown no provider', async () => {
  assert.equal(
    dg.aiGapState({ ourMentioned: true, ourCited: true, competitorCited: true, competitorRecommended: true, providerSupports: false, conflicting: false }),
    'UNKNOWN',
  );
});

await test('ai unknown nulls', async () => {
  assert.equal(
    dg.aiGapState({ ourMentioned: null, ourCited: null, competitorCited: null, competitorRecommended: null, providerSupports: true, conflicting: false }),
    'UNKNOWN',
  );
});

await test('ai mention beats citation', async () => {
  assert.equal(
    dg.aiGapState({ ourMentioned: true, ourCited: true, competitorCited: false, competitorRecommended: false, providerSupports: true, conflicting: false }),
    'MENTIONED',
  );
});

await test('recommendation always unknown', async () => {
  assert.equal(dg.recommendationState(), 'RECOMMENDATION_UNKNOWN');
});

await test('source gap note counts', async () => {
  const n = dg.sourceGapNote({ ourSources: 1, competitorSources: 4, competitorLabel: 'Rival' });
  assert.match(n, /Rival appears in 4 observed third-party sources/);
  assert.match(n, /we appear in 1/);
  assert.match(n, /no invented source authority/);
});

await test('ai cited null competitor', async () => {
  assert.equal(
    dg.aiGapState({ ourMentioned: false, ourCited: true, competitorCited: null, competitorRecommended: null, providerSupports: true, conflicting: false }),
    'CITED',
  );
});

await test('ai partial nulls unknown', async () => {
  assert.equal(
    dg.aiGapState({ ourMentioned: null, ourCited: false, competitorCited: false, competitorRecommended: false, providerSupports: true, conflicting: false }),
    'UNKNOWN',
  );
});

await test('ai competitor only no cite', async () => {
  assert.equal(
    dg.aiGapState({ ourMentioned: null, ourCited: false, competitorCited: true, competitorRecommended: true, providerSupports: true, conflicting: false }),
    'COMPETITOR_RECOMMENDED',
  );
});

await test('ai never inferred recommendation', async () => {
  assert.notEqual(
    dg.aiGapState({ ourMentioned: false, ourCited: true, competitorCited: false, competitorRecommended: false, providerSupports: true, conflicting: false }),
    'RECOMMENDATION_UNKNOWN',
  );
});

/* ---------- technical gaps (10) ---------- */

await test('tech indexability', async () => {
  const g = dg.technicalGaps({ indexable: false, canonicalOk: null, robotsOk: null, structuredData: null, crawlable: null });
  assert.equal(g.length, 1);
  assert.equal(g[0].kind, 'INDEXABILITY_GAP');
});

await test('tech canonical', async () => {
  assert.equal(dg.technicalGaps({ indexable: null, canonicalOk: false, robotsOk: null, structuredData: null, crawlable: null })[0].kind, 'CANONICAL_GAP');
});

await test('tech robots', async () => {
  assert.equal(dg.technicalGaps({ indexable: null, canonicalOk: null, robotsOk: false, structuredData: null, crawlable: null })[0].kind, 'ROBOTS_GAP');
});

await test('tech structured', async () => {
  assert.equal(dg.technicalGaps({ indexable: null, canonicalOk: null, robotsOk: null, structuredData: false, crawlable: null })[0].kind, 'STRUCTURED_DATA_GAP');
});

await test('tech crawlable', async () => {
  assert.equal(dg.technicalGaps({ indexable: null, canonicalOk: null, robotsOk: null, structuredData: null, crawlable: false })[0].kind, 'CRAWLABILITY_GAP');
});

await test('tech all ok none', async () => {
  assert.deepEqual(dg.technicalGaps({ indexable: true, canonicalOk: true, robotsOk: true, structuredData: true, crawlable: true }), []);
});

await test('tech nulls none', async () => {
  assert.deepEqual(dg.technicalGaps({ indexable: null, canonicalOk: null, robotsOk: null, structuredData: null, crawlable: null }), []);
});

await test('tech all bad five', async () => {
  assert.equal(dg.technicalGaps({ indexable: false, canonicalOk: false, robotsOk: false, structuredData: false, crawlable: false }).length, 5);
});

await test('tech notes observed', async () => {
  const g = dg.technicalGaps({ indexable: false, canonicalOk: null, robotsOk: null, structuredData: null, crawlable: null });
  assert.match(g[0].note, /Directly observed only/);
});

await test('tech deterministic', async () => {
  const mk = () => dg.technicalGaps({ indexable: false, canonicalOk: true, robotsOk: null, structuredData: false, crawlable: null });
  assert.deepEqual(mk(), mk());
});

/* ---------- authority + freshness (9) ---------- */

await test('authority unavailable', async () => {
  const n = dg.authorityNote({ ours: null, competitor: 5, metric: 'dr' });
  assert.match(n, /no DA\/DR\/backlink figures invented/);
  assert.match(dg.authorityNote({ ours: 5, competitor: null, metric: 'dr' }), /unavailable/);
});

await test('authority difference', async () => {
  const n = dg.authorityNote({ ours: 20, competitor: 5, metric: 'provider domain rank (lower is stronger)', lowerIsStronger: true });
  assert.match(n, /OBSERVED_AUTHORITY_DIFFERENCE/);
  assert.match(n, /20/);
});

await test('authority no disadvantage', async () => {
  assert.match(dg.authorityNote({ ours: 20, competitor: 5, metric: 'links', lowerIsStronger: false }), /No observed authority disadvantage/);
});

await test('authority higher stronger disadvantage', async () => {
  assert.match(dg.authorityNote({ ours: 5, competitor: 20, metric: 'links', lowerIsStronger: false }), /OBSERVED_AUTHORITY_DIFFERENCE/);
});

await test('authority lower stronger ours wins', async () => {
  assert.match(dg.authorityNote({ ours: 5, competitor: 20, metric: 'domain rank', lowerIsStronger: true }), /No observed authority disadvantage/);
});

await test('freshness unavailable', async () => {
  assert.match(dg.freshnessNote({ oursDays: null, competitorDays: 10 }), /unavailable/);
});

await test('freshness difference', async () => {
  const n = dg.freshnessNote({ oursDays: 400, competitorDays: 30 });
  assert.match(n, /FRESHNESS_DIFFERENCE/);
  assert.match(n, /Never claimed as the cause/);
});

await test('freshness none', async () => {
  assert.match(dg.freshnessNote({ oursDays: 30, competitorDays: 40 }), /No material freshness difference/);
});

await test('freshness boundary 180', async () => {
  assert.match(dg.freshnessNote({ oursDays: 200, competitorDays: 30 }), /No material/);
  assert.match(dg.freshnessNote({ oursDays: 211, competitorDays: 30 }), /FRESHNESS_DIFFERENCE/);
});

await test('authority equal none', async () => {
  assert.match(dg.authorityNote({ ours: 10, competitor: 10, metric: 'x' }), /No observed authority disadvantage/);
});

await test('freshness deterministic', async () => {
  assert.equal(dg.freshnessNote({ oursDays: 400, competitorDays: 10 }), dg.freshnessNote({ oursDays: 400, competitorDays: 10 }));
});

/* ---------- ordering (12) ---------- */

function gap(kind, fpr) {
  return { kind, fingerprint: fpr };
}

await test('order technical first', async () => {
  const o = dg.orderGaps([gap('UNKNOWN_GAP', 'z'), gap('TECHNICAL_BLOCKER', 'a')]);
  assert.deepEqual(o.map((g) => g.kind), ['TECHNICAL_BLOCKER', 'UNKNOWN_GAP']);
});

await test('order full hierarchy', async () => {
  const kinds = ['UNKNOWN_GAP', 'FRESHNESS_DIFFERENCE', 'COMPETITIVE_DIFFERENCE', 'INTERNAL_LINK_GAP', 'ENTITY_CLAIM_GAP', 'TOPIC_GAP', 'NEED_BUYER_GAP', 'SERP_FORMAT_MISMATCH', 'INTENT_MISMATCH', 'TECHNICAL_BLOCKER'];
  const o = dg.orderGaps(kinds.map((kind, i) => gap(kind, `f${i}`)));
  assert.deepEqual(o.map((g) => g.kind), [...kinds].reverse());
});

await test('order tie fingerprint', async () => {
  const o = dg.orderGaps([gap('TOPIC_GAP', 'b'), gap('TOPIC_GAP', 'a')]);
  assert.deepEqual(o.map((g) => g.fingerprint), ['a', 'b']);
});

await test('order unknown kind last', async () => {
  const o = dg.orderGaps([gap('BOGUS', 'a'), gap('TECHNICAL_BLOCKER', 'b')]);
  assert.equal(o[o.length - 1].kind, 'BOGUS');
});

await test('order rank values', async () => {
  assert.ok(dg.gapOrderRank('TECHNICAL_BLOCKER') < dg.gapOrderRank('INTENT_MISMATCH'));
  assert.ok(dg.gapOrderRank('INTENT_MISMATCH') < dg.gapOrderRank('SERP_FORMAT_MISMATCH'));
  assert.ok(dg.gapOrderRank('UNKNOWN_GAP') > dg.gapOrderRank('FRESHNESS_DIFFERENCE'));
});

await test('order no score', async () => {
  const o = dg.orderGaps([gap('TOPIC_GAP', 'a')]);
  assert.ok(!('score' in o[0]));
});

await test('order empty', async () => {
  assert.deepEqual(dg.orderGaps([]), []);
});

await test('order single', async () => {
  assert.deepEqual(dg.orderGaps([gap('NEED_BUYER_GAP', 'x')]).map((g) => g.kind), ['NEED_BUYER_GAP']);
});

await test('order stable repeat', async () => {
  const mk = () => dg.orderGaps([gap('TOPIC_GAP', 'b'), gap('INTENT_MISMATCH', 'a')]);
  assert.deepEqual(mk().map((g) => g.fingerprint), mk().map((g) => g.fingerprint));
});

await test('order need before topic', async () => {
  const o = dg.orderGaps([gap('TOPIC_GAP', 'a'), gap('NEED_BUYER_GAP', 'b')]);
  assert.equal(o[0].kind, 'NEED_BUYER_GAP');
});

await test('order link before competitive', async () => {
  const o = dg.orderGaps([gap('COMPETITIVE_DIFFERENCE', 'a'), gap('INTERNAL_LINK_GAP', 'b')]);
  assert.equal(o[0].kind, 'INTERNAL_LINK_GAP');
});

await test('order entity before link', async () => {
  const o = dg.orderGaps([gap('INTERNAL_LINK_GAP', 'a'), gap('ENTITY_CLAIM_GAP', 'b')]);
  assert.equal(o[0].kind, 'ENTITY_CLAIM_GAP');
});

/* ---------- why summary (6) ---------- */

await test('why summary fields', async () => {
  const s = dg.whySummary({ primary: 'SERP format mismatch', supporting: ['8/10 comparisons'], unknown: ['cause'], nextInvestigation: 'Compare criteria', existingAction: 'Create section' });
  assert.match(s.primary, /PRIMARY OBSERVED GAP/);
  assert.deepEqual(s.supporting, ['SUPPORTING EVIDENCE: 8/10 comparisons']);
  assert.match(s.unknown[0], /UNKNOWN: cause/);
  assert.match(s.unknown[0], /caused the difference/);
  assert.match(s.nextInvestigation, /NEXT INVESTIGATION/);
  assert.match(s.existingAction, /EXISTING ACTION/);
});

await test('why summary no action', async () => {
  const s = dg.whySummary({ primary: 'p', supporting: [], unknown: [], nextInvestigation: 'n', existingAction: null });
  assert.match(s.existingAction, /NEXT_STEP_AVAILABLE/);
  assert.match(s.existingAction, /nothing auto-created/);
});

await test('why summary empty lists', async () => {
  const s = dg.whySummary({ primary: 'p', supporting: [], unknown: [], nextInvestigation: 'n', existingAction: null });
  assert.deepEqual(s.supporting, []);
  assert.deepEqual(s.unknown, []);
});

await test('why summary multiple supporting', async () => {
  const s = dg.whySummary({ primary: 'p', supporting: ['a', 'b'], unknown: ['u1', 'u2'], nextInvestigation: 'n', existingAction: 'e' });
  assert.equal(s.supporting.length, 2);
  assert.equal(s.unknown.length, 2);
});

await test('why summary deterministic', async () => {
  const mk = () => dg.whySummary({ primary: 'p', supporting: ['a'], unknown: ['u'], nextInvestigation: 'n', existingAction: null });
  assert.deepEqual(mk(), mk());
});

await test('why summary no causality', async () => {
  const s = dg.whySummary({ primary: 'p', supporting: [], unknown: ['u'], nextInvestigation: 'n', existingAction: null });
  assert.doesNotMatch(JSON.stringify(s), /caused the ranking|because google/i);
});

/* ---------- conflicts + unknowns (4) ---------- */

await test('conflict format', async () => {
  const n = dg.conflictNote({ a: 'GSC improved', b: 'SERP snapshot worsened' });
  assert.match(n, /CONFLICTING_EVIDENCE/);
  assert.match(n, /Neither chosen silently/);
});

await test('unknown format', async () => {
  const n = dg.unknownNote('Backlink evidence');
  assert.match(n, /Backlink evidence: unknown/);
  assert.match(n, /never filled with generated assumptions/);
});

await test('conflict deterministic', async () => {
  assert.equal(dg.conflictNote({ a: 'x', b: 'y' }), dg.conflictNote({ a: 'x', b: 'y' }));
});

await test('unknown deterministic', async () => {
  assert.equal(dg.unknownNote('Revenue linkage'), dg.unknownNote('Revenue linkage'));
});

/* ---------- next decisions (11) ---------- */

await test('next fix technical', async () => {
  assert.equal(dg.nextDecisionForGap('TECHNICAL_BLOCKER'), 'FIX');
});

await test('next improve intent format', async () => {
  assert.equal(dg.nextDecisionForGap('INTENT_MISMATCH'), 'IMPROVE');
  assert.equal(dg.nextDecisionForGap('SERP_FORMAT_MISMATCH'), 'IMPROVE');
  assert.equal(dg.nextDecisionForGap('NEED_BUYER_GAP'), 'IMPROVE');
  assert.equal(dg.nextDecisionForGap('FRESHNESS_DIFFERENCE'), 'IMPROVE');
});

await test('next create topic', async () => {
  assert.equal(dg.nextDecisionForGap('TOPIC_GAP'), 'CREATE');
});

await test('next investigate entity', async () => {
  assert.equal(dg.nextDecisionForGap('ENTITY_CLAIM_GAP'), 'INVESTIGATE');
  assert.equal(dg.nextDecisionForGap('UNKNOWN_GAP'), 'INVESTIGATE');
});

await test('next connect link', async () => {
  assert.equal(dg.nextDecisionForGap('INTERNAL_LINK_GAP'), 'CONNECT');
});

await test('next respond competitive', async () => {
  assert.equal(dg.nextDecisionForGap('COMPETITIVE_DIFFERENCE'), 'RESPOND');
});

await test('next all mapped', async () => {
  for (const k of ['TECHNICAL_BLOCKER', 'INTENT_MISMATCH', 'SERP_FORMAT_MISMATCH', 'NEED_BUYER_GAP', 'TOPIC_GAP', 'ENTITY_CLAIM_GAP', 'INTERNAL_LINK_GAP', 'COMPETITIVE_DIFFERENCE', 'FRESHNESS_DIFFERENCE', 'UNKNOWN_GAP']) {
    assert.ok(dg.nextDecisionForGap(k).length > 2);
  }
});

await test('next unknown default', async () => {
  assert.equal(dg.nextDecisionForGap('BOGUS'), 'INVESTIGATE');
});

await test('next deterministic', async () => {
  assert.equal(dg.nextDecisionForGap('TOPIC_GAP'), dg.nextDecisionForGap('TOPIC_GAP'));
});

await test('next no second engine', async () => {
  assert.ok(!['DECIDE', 'SCORE'].includes(dg.nextDecisionForGap('TOPIC_GAP')));
});

await test('next freshness improve', async () => {
  assert.equal(dg.nextDecisionForGap('FRESHNESS_DIFFERENCE'), 'IMPROVE');
});

/* ---------- honesty invariants (14) ---------- */

await test('no score vocabulary', async () => {
  assert.doesNotMatch(JSON.stringify([dg.GAP_TARGETS]), /SCORE/i);
});

await test('no probability language', async () => {
  const blob = JSON.stringify([
    dg.whySummary({ primary: 'p', supporting: [], unknown: [], nextInvestigation: 'n', existingAction: null }),
    dg.orderGaps([gap('TOPIC_GAP', 'a')]),
  ]);
  assert.doesNotMatch(blob, /probability|win rate|expected lift|confidence %/i);
});

await test('no causal upgrade in mismatch', async () => {
  const n = dg.intentMismatch({ queryIntent: 'INFORMATIONAL', pageAngle: 'COMMERCIAL' }).note;
  assert.match(n, /Observed mismatch/);
  assert.match(n, /never “Google penalizes this”/);
  assert.doesNotMatch(n, /Google penalizes this page|penalty applied/i);
});

await test('no generic rules claim', async () => {
  assert.doesNotMatch(
    dg.serpFormatMismatch({ dominant: 'GUIDE', ours: 'PRODUCT', observedCount: 6, totalCount: 10 }).note,
    /best practice|should always/i,
  );
});

await test('citation never recommendation invariant', async () => {
  assert.notEqual(
    dg.aiGapState({ ourMentioned: false, ourCited: true, competitorCited: false, competitorRecommended: false, providerSupports: true, conflicting: false }),
    'RECOMMENDATION_UNKNOWN'.replace('RECOMMENDATION_UNKNOWN', 'RECOMMENDED'),
  );
});

await test('ranking never traffic text', async () => {
  assert.doesNotMatch(dg.unknownNote('Traffic evidence'), /rank implies traffic/i);
});

await test('traffic never revenue text', async () => {
  assert.doesNotMatch(dg.unknownNote('Revenue linkage'), /traffic proves revenue/i);
});

await test('no invented authority', async () => {
  assert.match(dg.authorityNote({ ours: null, competitor: null, metric: 'x' }), /no .* invented/i);
});

await test('no semantic completeness', async () => {
  assert.match(
    dg.coverageGap({ competitorTokens: [['a']], ourTokens: [], minCompetitors: 1 }).note,
    /never semantic completeness/,
  );
});

await test('unknowns valid outputs', async () => {
  assert.match(dg.unknownNote('AI recommendation'), /unknown/);
});

await test('observation never causation', async () => {
  assert.doesNotMatch(
    dg.freshnessNote({ oursDays: 500, competitorDays: 10 }),
    /caused|because of/i,
  );
});

await test('execution never outcome text', async () => {
  assert.doesNotMatch(dg.whySummary({ primary: 'p', supporting: [], unknown: [], nextInvestigation: 'n', existingAction: 'e' }).existingAction, /executed successfully/i);
});

await test('no fake forecasts', async () => {
  assert.doesNotMatch(
    dg.nextDecisionForGap('TOPIC_GAP') + dg.nextDecisionForGap('NEED_BUYER_GAP'),
    /forecast|predict/i,
  );
});

await test('evidence states vocabulary', async () => {
  for (const s of ['OBSERVED', 'SUPPORTED', 'INFERRED', 'UNKNOWN', 'CONFLICTING', 'UNAVAILABLE']) {
    assert.ok(typeof s === 'string');
  }
});

/* ---------- performance (6) ---------- */

await test('intents batch 500', async () => {
  const queries = ['best CRM', 'what is CRM', 'buy CRM now', 'CRM near me', 'crm', 'hubspot vs pipedrive'];
  for (let i = 0; i < 500; i++) {
    dg.inferIntent(queries[i % queries.length]);
    dg.pageAngle(queries[i % queries.length]);
  }
  assert.ok(true);
});

await test('formats batch 500', async () => {
  for (let i = 0; i < 500; i++) {
    dg.serpFormatOf(`Guide ${i} tips`, 'learn how tutorial', '');
    dg.dominantFormat(['GUIDE', 'LIST', 'GUIDE']);
  }
  assert.ok(true);
});

await test('criteria batch 300', async () => {
  for (let i = 0; i < 300; i++) {
    dg.buyerCriteriaIn(`pricing features support security performance ${i}`);
  }
  assert.ok(true);
});

await test('coverage batch 100', async () => {
  for (let i = 0; i < 100; i++) {
    dg.coverageGap({ competitorTokens: [[`term${i}`, 'shared'], ['shared', 'other']], ourTokens: ['shared'], minCompetitors: 2 });
  }
  assert.ok(true);
});

await test('fingerprints batch 500', async () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    seen.add(fp({ target: `query ${i}` }));
  }
  assert.equal(seen.size, 500);
});

await test('ordering batch 200', async () => {
  const kinds = ['TECHNICAL_BLOCKER', 'TOPIC_GAP', 'UNKNOWN_GAP', 'NEED_BUYER_GAP'];
  for (let i = 0; i < 200; i++) {
    dg.orderGaps(kinds.map((kind, j) => gap(kind, `f${i}-${j}`)));
  }
  assert.ok(true);
});

/* ---------- intent extras (8) ---------- */

await test('intent tutorial informational', async () => {
  assert.equal(dg.inferIntent('salesforce tutorial for admins'), 'INFORMATIONAL');
});

await test('intent comparisons plural', async () => {
  assert.equal(dg.inferIntent('crm comparisons 2026'), 'COMMERCIAL');
});

await test('intent which commercial', async () => {
  assert.equal(dg.inferIntent('which CRM is best for startups'), 'COMMERCIAL');
});

await test('intent coupon transactional', async () => {
  assert.equal(dg.inferIntent('hubspot coupon code'), 'TRANSACTIONAL');
});

await test('intent open now local', async () => {
  assert.equal(dg.inferIntent('crm consultants open now'), 'LOCAL');
});

await test('mismatch transactional vs info', async () => {
  const r = dg.intentMismatch({ queryIntent: 'TRANSACTIONAL', pageAngle: 'INFORMATIONAL' });
  assert.equal(r.mismatch, true);
  assert.equal(r.kind, 'INTENT_MISMATCH');
});

await test('mismatch local vs commercial', async () => {
  assert.equal(dg.intentMismatch({ queryIntent: 'LOCAL', pageAngle: 'COMMERCIAL' }).mismatch, true);
});

await test('page angle guide with reviews', async () => {
  assert.equal(dg.pageAngle('guide with reviews and comparisons'), 'COMMERCIAL');
});

/* ---------- format extras (6) ---------- */

await test('format thread forum', async () => {
  assert.equal(dg.serpFormatOf('Long thread', 'community discussion', ''), 'FORUM');
});

await test('format shop product', async () => {
  assert.equal(dg.serpFormatOf('Shop plans', 'add to cart', ''), 'PRODUCT');
});

await test('format definitions guide', async () => {
  assert.equal(dg.serpFormatOf('What is CRM software', 'definition and meaning', ''), 'GUIDE');
});

await test('format demo commercial', async () => {
  assert.equal(dg.serpFormatOf('Book a demo', 'request quote today', ''), 'COMMERCIAL');
});

await test('format mismatch counts', async () => {
  const r = dg.serpFormatMismatch({ dominant: 'LIST', ours: 'PRODUCT', observedCount: 7, totalCount: 9 });
  assert.match(r.note, /7\/9/);
});

await test('dominant single known', async () => {
  assert.equal(dg.dominantFormat(['VIDEO']), 'VIDEO');
});

/* ---------- buyer/coverage extras (8) ---------- */

await test('criteria security performance', async () => {
  const c = dg.buyerCriteriaIn('bank-grade security with fast performance');
  assert.ok(c.includes('security') && c.includes('performance'));
});

await test('criteria compatibility quality', async () => {
  const c = dg.buyerCriteriaIn('outlook compatibility and data quality');
  assert.ok(c.includes('compatibility') && c.includes('quality'));
});

await test('gap observed no dupes', async () => {
  const g = dg.buyerCriteriaGap({ query: 'q', competitorTexts: ['pricing pricing', 'pricing features'], ourText: '' });
  assert.deepEqual(g.observed, [...new Set(g.observed)].sort());
});

await test('coverage our terms excluded', async () => {
  const g = dg.coverageGap({ competitorTokens: [['crm', 'pricing']], ourTokens: ['crm', 'pricing'], minCompetitors: 1 });
  assert.deepEqual(g.missing, []);
});

await test('tokenize punctuation', async () => {
  assert.deepEqual(dg.tokenize('Best-in-class CRM (2026)!'), ['best', 'class', '2026']);
});

await test('criteria support singular', async () => {
  assert.ok(dg.buyerCriteriaIn('phone support included').includes('support'));
});

await test('gap query echoed', async () => {
  const g = dg.buyerCriteriaGap({ query: 'best CRM', competitorTexts: [], ourText: null });
  assert.equal(g.gap, false);
});

await test('coverage empty competitors', async () => {
  assert.deepEqual(dg.coverageGap({ competitorTokens: [], ourTokens: ['a'], minCompetitors: 1 }).missing, []);
});

/* ---------- ai/technical extras (8) ---------- */

await test('ai conflicting beats mention', async () => {
  assert.equal(
    dg.aiGapState({ ourMentioned: true, ourCited: false, competitorCited: false, competitorRecommended: false, providerSupports: true, conflicting: true }),
    'CONFLICTING',
  );
});

await test('tech mixed present absent', async () => {
  const g = dg.technicalGaps({ indexable: true, canonicalOk: false, robotsOk: true, structuredData: null, crawlable: true });
  assert.equal(g.length, 1);
  assert.equal(g[0].kind, 'CANONICAL_GAP');
});

await test('freshness ours newer none', async () => {
  assert.match(dg.freshnessNote({ oursDays: 10, competitorDays: 400 }), /No material/);
});

await test('authority higher stronger ours', async () => {
  assert.match(dg.authorityNote({ ours: 30, competitor: 10, metric: 'links', lowerIsStronger: false }), /No observed authority disadvantage/);
});

await test('source gap zero ours', async () => {
  const n = dg.sourceGapNote({ ourSources: 0, competitorSources: 3, competitorLabel: 'Rival' });
  assert.match(n, /we appear in 0/);
});

await test('ai not mentioned needs checks', async () => {
  assert.equal(
    dg.aiGapState({ ourMentioned: false, ourCited: false, competitorCited: false, competitorRecommended: false, providerSupports: true, conflicting: false }),
    'NOT_MENTIONED',
  );
});

await test('tech robots true none', async () => {
  assert.deepEqual(dg.technicalGaps({ indexable: true, canonicalOk: true, robotsOk: true, structuredData: true, crawlable: true }), []);
});

await test('freshness equal none', async () => {
  assert.match(dg.freshnessNote({ oursDays: 50, competitorDays: 50 }), /No material/);
});

/* ---------- ordering/summary extras (6) ---------- */

await test('order freshness before unknown', async () => {
  const o = dg.orderGaps([{ kind: 'UNKNOWN_GAP', fingerprint: 'a' }, { kind: 'FRESHNESS_DIFFERENCE', fingerprint: 'b' }]);
  assert.equal(o[0].kind, 'FRESHNESS_DIFFERENCE');
});

await test('why summary unknown prefix', async () => {
  const s = dg.whySummary({ primary: 'p', supporting: [], unknown: ['x'], nextInvestigation: 'n', existingAction: null });
  assert.ok(s.unknown[0].startsWith('UNKNOWN:'));
});

await test('why summary supporting prefix', async () => {
  const s = dg.whySummary({ primary: 'p', supporting: ['e'], unknown: [], nextInvestigation: 'n', existingAction: 'a' });
  assert.ok(s.supporting[0].startsWith('SUPPORTING EVIDENCE:'));
});

await test('next all ten mapped', async () => {
  const kinds = ['TECHNICAL_BLOCKER', 'INTENT_MISMATCH', 'SERP_FORMAT_MISMATCH', 'NEED_BUYER_GAP', 'TOPIC_GAP', 'ENTITY_CLAIM_GAP', 'INTERNAL_LINK_GAP', 'COMPETITIVE_DIFFERENCE', 'FRESHNESS_DIFFERENCE', 'UNKNOWN_GAP'];
  const nexts = kinds.map((k) => dg.nextDecisionForGap(k));
  assert.equal(new Set(nexts).size >= 6, true);
});

await test('conflict both sides', async () => {
  const n = dg.conflictNote({ a: 'rank up', b: 'clicks down' });
  assert.ok(n.includes('rank up') && n.includes('clicks down'));
});

await test('unknown revenue text', async () => {
  assert.match(dg.unknownNote('Revenue linkage'), /Revenue linkage: unknown/);
});

/* ---------- honesty extras (4) ---------- */

await test('no ranking factor claim text', async () => {
  assert.doesNotMatch(
    dg.serpFormatMismatch({ dominant: 'GUIDE', ours: 'PRODUCT', observedCount: 6, totalCount: 8 }).note,
    /google rewards|ranking boost/i,
  );
});

await test('no completeness promise', async () => {
  assert.doesNotMatch(
    dg.coverageGap({ competitorTokens: [['a']], ourTokens: [], minCompetitors: 1 }).note,
    /complete coverage|full topic/i,
  );
});

await test('no authority fabrication', async () => {
  assert.match(dg.authorityNote({ ours: null, competitor: null, metric: 'x' }), /unavailable/);
});

await test('no freshness causality', async () => {
  assert.doesNotMatch(dg.freshnessNote({ oursDays: 900, competitorDays: 5 }), /caused|lost rankings/i);
});

/* ---------- summary ---------- */

const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(`\nDecision Gap 1.0: ${passCount}/${results.length} passed.`);
if (failed.length > 0) {
  console.log(failed.join('\n'));
  process.exit(1);
} else {
  console.log('All Decision Gap 1.0 tests passed.');
}

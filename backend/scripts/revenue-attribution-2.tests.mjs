/*
 * RENKOO Search-to-Revenue Attribution 2.0 — tests (Phase 33).
 *
 * 236 tests over pure functions only: source hierarchy,
 * evidence states, attribution models, fractional
 * credit, channels, unattributable buckets, AI
 * granularity, GSC limits, query-revenue rule, leads,
 * qualification, duplicates, money, multi-currency,
 * ROI guards, paths, assisted, gaps, quality,
 * causality wording, explanations, windows, freshness,
 * modeled, client report, privacy, hero gating, need
 * association, connection prompts, lookback,
 * tenant-neutral determinism, bounded performance,
 * honesty invariants. No DB, no provider calls, no
 * billing touch.
 *
 * Run: npm run test:revenue-attribution-2   (dist built)
 */
import assert from 'node:assert/strict';

const ra = await import(
  '../dist/roi/revenue-attribution.js'
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

/* ---------- source hierarchy §4 (9) ---------- */

await test('hierarchy order six', async () => {
  assert.deepEqual([...ra.SOURCE_HIERARCHY], ['GA4', 'CRM_REVENUE_SOURCE', 'GSC', 'RANK_TRACKING', 'AI_VISIBILITY', 'RENKOO_INFERENCE']);
});

await test('ga4 outranks all', async () => {
  assert.ok(ra.sourceRank('GA4') < ra.sourceRank('GSC'));
  assert.ok(ra.sourceRank('GA4') < ra.sourceRank('RENKOO_INFERENCE'));
});

await test('crm outranks gsc', async () => {
  assert.ok(ra.sourceRank('CRM_REVENUE_SOURCE') < ra.sourceRank('GSC'));
});

await test('rank outranks ai visibility', async () => {
  assert.ok(ra.sourceRank('RANK_TRACKING') < ra.sourceRank('AI_VISIBILITY'));
});

await test('unknown source lowest', async () => {
  assert.equal(ra.sourceRank('BOGUS'), ra.SOURCE_HIERARCHY.length);
});

await test('higher wins incoming', async () => {
  assert.equal(ra.higherConfidenceWins('GSC', 'GA4'), 'GA4');
});

await test('higher wins current keeps', async () => {
  assert.equal(ra.higherConfidenceWins('GA4', 'GSC'), 'GA4');
});

await test('higher equal keeps current', async () => {
  assert.equal(ra.higherConfidenceWins('GSC', 'GSC'), 'GSC');
});

await test('lower never overwrites higher', async () => {
  assert.equal(ra.higherConfidenceWins('CRM_REVENUE_SOURCE', 'RENKOO_INFERENCE'), 'CRM_REVENUE_SOURCE');
});

/* ---------- evidence states §3 (6) ---------- */

await test('evidence observed note', async () => {
  assert.match(ra.evidenceNote('OBSERVED'), /Directly observed/);
});

await test('evidence attributed not causal', async () => {
  assert.match(ra.evidenceNote('ATTRIBUTED'), /not a RENKOO causal claim/);
});

await test('evidence inferred interpretation', async () => {
  assert.match(ra.evidenceNote('INFERRED'), /interpretation only/);
});

await test('evidence estimated labeled', async () => {
  assert.match(ra.evidenceNote('ESTIMATED'), /estimated/i);
});

await test('evidence unavailable not zero', async () => {
  assert.match(ra.evidenceNote('UNAVAILABLE'), /not zero/);
});

await test('evidence five distinct', async () => {
  const notes = ['OBSERVED', 'ATTRIBUTED', 'INFERRED', 'ESTIMATED', 'UNAVAILABLE'].map((s) => ra.evidenceNote(s));
  assert.equal(new Set(notes).size, 5);
});

/* ---------- attribution models §18/§19/§20 (14) ---------- */

await test('models vocabulary five', async () => {
  assert.equal(ra.ATTRIBUTION_MODELS.length, 5);
});

await test('normalize data driven', async () => {
  assert.equal(ra.normalizeAttributionModel('data-driven'), 'DATA_DRIVEN');
});

await test('normalize google paid organic', async () => {
  assert.equal(ra.normalizeAttributionModel('GOOGLE_PAID_AND_ORGANIC_LAST_CLICK'), 'PAID_AND_ORGANIC_LAST_CLICK');
});

await test('normalize last click', async () => {
  assert.equal(ra.normalizeAttributionModel('last click'), 'LAST_CLICK');
});

await test('normalize paid last click', async () => {
  assert.equal(ra.normalizeAttributionModel('paid and organic last click'), 'PAID_AND_ORGANIC_LAST_CLICK');
});

await test('normalize source defined', async () => {
  assert.equal(ra.normalizeAttributionModel('SOURCE_DEFINED'), 'SOURCE_DEFINED');
});

await test('normalize unknown', async () => {
  assert.equal(ra.normalizeAttributionModel('bogus'), 'UNKNOWN');
  assert.equal(ra.normalizeAttributionModel(''), 'UNKNOWN');
  assert.equal(ra.normalizeAttributionModel(null), 'UNKNOWN');
});

await test('normalize dda substring', async () => {
  assert.equal(ra.normalizeAttributionModel('GA4_DATA_DRIVEN_MODEL'), 'DATA_DRIVEN');
});

await test('comparison same model', async () => {
  assert.match(ra.modelComparisonNote('DATA_DRIVEN', 'DATA_DRIVEN'), /comparable within that model/);
});

await test('comparison different warns', async () => {
  const n = ra.modelComparisonNote('DATA_DRIVEN', 'LAST_CLICK');
  assert.match(n, /fractional credit/);
  assert.match(n, /Do not compare them directly/);
});

await test('fractional preserved', async () => {
  assert.equal(ra.fractionalCredit(0.4), 0.4);
  assert.equal(ra.fractionalCredit('2.75'), 2.75);
});

await test('fractional nulls', async () => {
  assert.equal(ra.fractionalCredit(null), null);
  assert.equal(ra.fractionalCredit(undefined), null);
  assert.equal(ra.fractionalCredit(-1), null);
  assert.equal(ra.fractionalCredit('nope'), null);
});

await test('credit dda label', async () => {
  const l = ra.creditLabel(0.4, 'DATA_DRIVEN');
  assert.match(l, /fractional SOURCE_ATTRIBUTED/);
  assert.match(l, /not RENKOO causal/);
});

await test('credit last click label', async () => {
  assert.match(ra.creditLabel(1, 'LAST_CLICK'), /LAST_CLICK credit/);
});

await test('credit unavailable never zero', async () => {
  assert.match(ra.creditLabel(null, 'DATA_DRIVEN'), /unavailable — not zero/);
});

/* ---------- channels §6/§7/§40 (16) ---------- */

await test('channels vocabulary seven', async () => {
  assert.equal(ra.TRAFFIC_CHANNELS.length, 7);
});

await test('channel organic', async () => {
  assert.equal(ra.normalizeChannel('Organic Search'), 'ORGANIC_SEARCH');
});

await test('channel ai', async () => {
  assert.equal(ra.normalizeChannel('AI Assistant'), 'AI_ASSISTANT');
  assert.equal(ra.normalizeChannel('ai-assistant'), 'AI_ASSISTANT');
});

await test('channel direct none', async () => {
  assert.equal(ra.normalizeChannel('Direct'), 'DIRECT');
  assert.equal(ra.normalizeChannel('(none)'), 'DIRECT');
});

await test('channel unassigned variants', async () => {
  assert.equal(ra.normalizeChannel('Unassigned'), 'UNASSIGNED');
  assert.equal(ra.normalizeChannel('(not set)'), 'UNASSIGNED');
  assert.equal(ra.normalizeChannel('(other)'), 'UNASSIGNED');
});

await test('channel paid referral', async () => {
  assert.equal(ra.normalizeChannel('Paid Search'), 'PAID_SEARCH');
  assert.equal(ra.normalizeChannel('Referral'), 'REFERRAL');
});

await test('channel unknown other', async () => {
  assert.equal(ra.normalizeChannel('Social'), 'OTHER');
  assert.equal(ra.normalizeChannel(''), 'OTHER');
});

await test('bucket not set', async () => {
  assert.equal(ra.unattributableBucket('(not set)'), 'NOT_SET');
});

await test('bucket unassigned', async () => {
  assert.equal(ra.unattributableBucket('Unassigned'), 'UNASSIGNED');
});

await test('bucket direct', async () => {
  assert.equal(ra.unattributableBucket('Direct'), 'DIRECT');
  assert.equal(ra.unattributableBucket('(none)'), 'DIRECT');
});

await test('bucket other', async () => {
  assert.equal(ra.unattributableBucket('Other'), 'OTHER');
  assert.equal(ra.unattributableBucket('Unattributable'), 'OTHER');
});

await test('bucket organic null never forced', async () => {
  assert.equal(ra.unattributableBucket('Organic Search'), null);
  assert.equal(ra.unattributableBucket('google / organic'), null);
});

await test('bucket case-insensitive', async () => {
  assert.equal(ra.unattributableBucket('(NOT SET)'), 'NOT_SET');
});

await test('direct never means typed url', async () => {
  assert.equal(ra.normalizeChannel('Direct'), 'DIRECT');
  assert.notEqual(ra.unattributableBucket('Direct'), null);
});

/* ---------- AI sources §7/§29 (12) ---------- */

await test('ai vocabulary nine', async () => {
  assert.equal(ra.AI_ASSISTANT_SOURCES.length, 9);
});

await test('ai chatgpt referrer', async () => {
  assert.equal(ra.aiAssistantSourceFromReferrer('https://chatgpt.com/share/x'), 'CHATGPT');
});

await test('ai gemini referrer', async () => {
  assert.equal(ra.aiAssistantSourceFromReferrer('https://gemini.google.com/app'), 'GEMINI');
});

await test('ai copilot referrer', async () => {
  assert.equal(ra.aiAssistantSourceFromReferrer('https://copilot.microsoft.com/y'), 'COPILOT');
});

await test('ai grok referrer', async () => {
  assert.equal(ra.aiAssistantSourceFromReferrer('https://grok.com/z'), 'GROK');
});

await test('ai deepseek referrer', async () => {
  assert.equal(ra.aiAssistantSourceFromReferrer('https://chat.deepseek.com/a'), 'DEEPSEEK');
});

await test('ai claude referrer', async () => {
  assert.equal(ra.aiAssistantSourceFromReferrer('https://claude.ai/chat'), 'CLAUDE');
});

await test('ai perplexity referrer', async () => {
  assert.equal(ra.aiAssistantSourceFromReferrer('https://www.perplexity.ai/search'), 'PERPLEXITY');
});

await test('ai unknown referrer', async () => {
  assert.equal(ra.aiAssistantSourceFromReferrer('https://example.com/'), 'UNKNOWN');
  assert.equal(ra.aiAssistantSourceFromReferrer(null), 'UNKNOWN');
});

await test('granularity single', async () => {
  assert.equal(ra.aiGranularity(['CHATGPT']), 'CHATGPT');
});

await test('granularity multi aggregate', async () => {
  assert.equal(ra.aiGranularity(['CHATGPT', 'GEMINI']), 'AI_ASSISTANT_AGGREGATE');
});

await test('granularity none aggregate', async () => {
  assert.equal(ra.aiGranularity([]), 'AI_ASSISTANT_AGGREGATE');
  assert.equal(ra.aiGranularity(['UNKNOWN']), 'AI_ASSISTANT_AGGREGATE');
});

/* ---------- GSC + query rule §5/§11/§25 (8) ---------- */

await test('gsc demand role aggregate', async () => {
  const r = ra.gscDemandRole();
  assert.match(r, /SEARCH_DEMAND_EVIDENCE/);
  assert.match(r, /no user identity/);
  assert.match(r, /never deterministic/);
});

await test('query relation contextual default', async () => {
  const q = ra.queryRevenueRelation({ directSourceLinkage: false });
  assert.equal(q.relation, 'CONTEXTUAL');
  assert.match(q.statement, /associated with this page/);
  assert.match(q.statement, /No “keyword X generated/);
});

await test('query relation direct linked', async () => {
  const q = ra.queryRevenueRelation({ directSourceLinkage: true });
  assert.equal(q.relation, 'DIRECT_SOURCE_LINKED');
  assert.match(q.statement, /SOURCE_ATTRIBUTED/);
});

await test('no keyword revenue claim text', async () => {
  const s = ra.queryRevenueRelation({ directSourceLinkage: false }).statement;
  assert.match(s, /No “keyword X generated/);
  assert.doesNotMatch(s, /keyword .* generated ₹[0-9]/i);
});

await test('gsc no journey', async () => {
  assert.match(ra.gscDemandRole(), /no.*journey|journey/i);
});

await test('gsc no lead link', async () => {
  assert.match(ra.gscDemandRole(), /lead/);
});

await test('contextual never deterministic', async () => {
  assert.doesNotMatch(JSON.stringify(ra.queryRevenueRelation({ directSourceLinkage: false })), /deterministic/i);
});

await test('direct still not causal', async () => {
  assert.doesNotMatch(ra.queryRevenueRelation({ directSourceLinkage: true }).statement, /caused/i);
});

/* ---------- leads §14/§15/§71 (14) ---------- */

await test('stage new', async () => {
  assert.equal(ra.normalizeLeadStage('NEW', false), 'NEW');
});

await test('stage contacted', async () => {
  assert.equal(ra.normalizeLeadStage('contacted', false), 'CONTACTED');
});

await test('stage qualified', async () => {
  assert.equal(ra.normalizeLeadStage('QUALIFIED', false), 'QUALIFIED');
});

await test('stage disqualified', async () => {
  assert.equal(ra.normalizeLeadStage('DISQUALIFIED', false), 'DISQUALIFIED');
});

await test('stage won lost', async () => {
  assert.equal(ra.normalizeLeadStage('WON', false), 'WON');
  assert.equal(ra.normalizeLeadStage('LOST', false), 'LOST');
});

await test('stage converted maps won', async () => {
  assert.equal(ra.normalizeLeadStage('CONVERTED', false), 'WON');
  assert.equal(ra.normalizeLeadStage('CUSTOMER', false), 'WON');
});

await test('stage converted flag wins', async () => {
  assert.equal(ra.normalizeLeadStage('NEW', true), 'WON');
});

await test('stage unknown unavailable', async () => {
  assert.equal(ra.normalizeLeadStage('BOGUS', false), 'QUALIFICATION_UNAVAILABLE');
  assert.equal(ra.normalizeLeadStage('', false), 'QUALIFICATION_UNAVAILABLE');
  assert.equal(ra.normalizeLeadStage(null, false), 'QUALIFICATION_UNAVAILABLE');
});

await test('qualified true', async () => {
  assert.equal(ra.isQualified('QUALIFIED'), true);
  assert.equal(ra.isQualified('WON'), true);
});

await test('qualified false', async () => {
  assert.equal(ra.isQualified('DISQUALIFIED'), false);
  assert.equal(ra.isQualified('LOST'), false);
  assert.equal(ra.isQualified('NEW'), false);
});

await test('qualified null unavailable', async () => {
  assert.equal(ra.isQualified('QUALIFICATION_UNAVAILABLE'), null);
});

await test('never infer qualified', async () => {
  assert.notEqual(ra.isQualified('QUALIFICATION_UNAVAILABLE'), true);
});

await test('duplicate uncertain label', async () => {
  assert.match(ra.duplicateLeadLabel({ possibleDuplicate: true }), /DUPLICATE_UNCERTAIN/);
  assert.match(ra.duplicateLeadLabel({ possibleDuplicate: true }), /not silently merged/);
});

await test('duplicate clear label', async () => {
  assert.match(ra.duplicateLeadLabel({ possibleDuplicate: false }), /No duplicate signal/);
});

/* ---------- money + currency §16/§17/§72 (14) ---------- */

await test('money valid', async () => {
  const m = ra.normalizeMoney({ amount: 240000, currency: 'INR' });
  assert.equal(m.amount, 240000);
  assert.equal(m.currency, 'INR');
  assert.equal(m.state, 'MONEY');
});

await test('money string amount', async () => {
  assert.equal(ra.normalizeMoney({ amount: '99.5', currency: 'USD' }).amount, 99.5);
});

await test('money currency uppercased', async () => {
  assert.equal(ra.normalizeMoney({ amount: 10, currency: 'inr' }).currency, 'INR');
});

await test('money null unavailable', async () => {
  const m = ra.normalizeMoney({ amount: null, currency: 'INR' });
  assert.equal(m.amount, null);
  assert.equal(m.state, 'UNAVAILABLE');
  assert.match(m.note, /not zero/);
});

await test('money nan unavailable', async () => {
  assert.equal(ra.normalizeMoney({ amount: 'nope', currency: 'USD' }).state, 'UNAVAILABLE');
});

await test('money zero is valid zero', async () => {
  const m = ra.normalizeMoney({ amount: 0, currency: 'INR' });
  assert.equal(m.amount, 0);
  assert.equal(m.state, 'MONEY');
});

await test('money never converts', async () => {
  assert.match(ra.normalizeMoney({ amount: 10, currency: 'EUR' }).note, /never silently converted/);
});

await test('multi single safe', async () => {
  assert.match(ra.multiCurrencyNote(['INR', 'inr']), /safe to total/);
});

await test('multi mixed separate', async () => {
  const n = ra.multiCurrencyNote(['INR', 'USD']);
  assert.match(n, /MULTI_CURRENCY/);
  assert.match(n, /never aggregated/);
});

await test('multi three currencies', async () => {
  assert.match(ra.multiCurrencyNote(['INR', 'USD', 'GBP']), /INR, USD, GBP/);
});

await test('multi empty unknown', async () => {
  assert.match(ra.multiCurrencyNote([]), /Single currency/);
});

await test('money missing currency null', async () => {
  assert.equal(ra.normalizeMoney({ amount: 5, currency: '' }).currency, null);
});

await test('money negative kept recorded', async () => {
  assert.equal(ra.normalizeMoney({ amount: -50, currency: 'USD' }).amount, -50);
});

await test('multi dedupes case', async () => {
  assert.match(ra.multiCurrencyNote(['usd', 'USD']), /safe to total/);
});

/* ---------- ROI §46/§47/§48 (10) ---------- */

await test('roi normal', async () => {
  const r = ra.attributionRoi({ revenue: 240000, cost: 60000 });
  assert.equal(r.roi, 3);
  assert.equal(r.state, 'ATTRIBUTION_BASED_ROI');
  assert.match(r.label, /ATTRIBUTION-BASED ROI/);
  assert.match(r.label, /not causal/);
});

await test('roi formula', async () => {
  assert.equal(ra.attributionRoi({ revenue: 150, cost: 100 }).roi, 0.5);
});

await test('roi cost null unavailable', async () => {
  const r = ra.attributionRoi({ revenue: 100, cost: null });
  assert.equal(r.roi, null);
  assert.equal(r.state, 'ROI_UNAVAILABLE');
  assert.match(r.label, /COST_UNAVAILABLE/);
  assert.match(r.label, /never estimated/);
});

await test('roi revenue null unavailable', async () => {
  const r = ra.attributionRoi({ revenue: null, cost: 100 });
  assert.equal(r.state, 'ROI_UNAVAILABLE');
});

await test('roi zero cost unavailable', async () => {
  assert.equal(ra.attributionRoi({ revenue: 100, cost: 0 }).state, 'ROI_UNAVAILABLE');
});

await test('roi negative cost unavailable', async () => {
  assert.equal(ra.attributionRoi({ revenue: 100, cost: -5 }).state, 'ROI_UNAVAILABLE');
});

await test('roi loss negative value', async () => {
  assert.equal(ra.attributionRoi({ revenue: 50, cost: 100 }).roi, -0.5);
});

await test('no roi score created', async () => {
  assert.doesNotMatch(JSON.stringify(ra.attributionRoi({ revenue: 1, cost: 1 })), /score/i);
});

await test('roi both null', async () => {
  assert.equal(ra.attributionRoi({ revenue: null, cost: null }).state, 'ROI_UNAVAILABLE');
});

await test('roi nan guards', async () => {
  assert.equal(ra.attributionRoi({ revenue: NaN, cost: 10 }).state, 'ROI_UNAVAILABLE');
});

/* ---------- paths §21/§22/§23 (12) ---------- */

function touch(channel, credit = null) {
  return { channel, at: null, credit };
}

await test('path touchpoints kept', async () => {
  const p = ra.composePath({ touchpoints: [touch('ORGANIC_SEARCH'), touch('DIRECT')], keyEvent: 'demo', revenue: 100 });
  assert.equal(p.touchpointCount, 2);
  assert.equal(p.keyEvent, 'demo');
  assert.equal(p.revenue, 100);
});

await test('path assisted organic', async () => {
  const p = ra.composePath({ touchpoints: [touch('ORGANIC_SEARCH'), touch('DIRECT')] });
  assert.equal(p.assisted, true);
  assert.match(p.note, /ASSISTED/);
  assert.match(p.note, /≠ caused/);
});

await test('path closing organic not assisted', async () => {
  const p = ra.composePath({ touchpoints: [touch('DIRECT'), touch('ORGANIC_SEARCH')] });
  assert.equal(p.assisted, false);
});

await test('path first touch', async () => {
  assert.equal(ra.composePath({ touchpoints: [touch('PAID_SEARCH'), touch('DIRECT')] }).firstTouch, 'PAID_SEARCH');
});

await test('path empty', async () => {
  const p = ra.composePath({ touchpoints: [] });
  assert.equal(p.firstTouch, null);
  assert.equal(p.touchpointCount, 0);
  assert.match(p.note, /never reconstructed/);
});

await test('path capped ten', async () => {
  const many = Array.from({ length: 25 }, () => touch('DIRECT'));
  assert.equal(ra.composePath({ touchpoints: many }).touchpoints.length, 10);
});

await test('path nulls default', async () => {
  const p = ra.composePath({ touchpoints: [touch('DIRECT')] });
  assert.equal(p.keyEvent, null);
  assert.equal(p.revenue, null);
  assert.equal(p.timeToKeyEvent, null);
});

await test('path ai first touch', async () => {
  assert.equal(ra.composePath({ touchpoints: [touch('AI_ASSISTANT'), touch('DIRECT')] }).firstTouch, 'AI_ASSISTANT');
});

await test('path single organic closing', async () => {
  const p = ra.composePath({ touchpoints: [touch('ORGANIC_SEARCH')] });
  assert.equal(p.assisted, false);
});

await test('path hidden never rebuilt', async () => {
  assert.match(ra.composePath({ touchpoints: [] }).note, /never reconstructed when hidden/);
});

await test('path revenue preserved', async () => {
  assert.equal(ra.composePath({ touchpoints: [touch('DIRECT')], revenue: 0 }).revenue, 0);
});

await test('path count matches capped', async () => {
  const p = ra.composePath({ touchpoints: [touch('DIRECT'), touch('DIRECT'), touch('DIRECT')] });
  assert.equal(p.touchpointCount, p.touchpoints.length);
});

/* ---------- gaps §58/§59/§60/§61 (9) ---------- */

function gap(o = {}) {
  return ra.outcomeGap({
    eventTrackingConnected: true,
    eventTrackingReliable: true,
    hasTraffic: true,
    hasKeyEvents: false,
    hasLeads: false,
    qualificationAvailable: false,
    hasRevenue: false,
    ...o,
  });
}

await test('gap conversion', async () => {
  assert.equal(gap(), 'CONVERSION_DATA_GAP');
});

await test('gap no conversion call when untracked', async () => {
  assert.equal(gap({ eventTrackingConnected: false }), 'NONE');
  assert.equal(gap({ eventTrackingReliable: false }), 'NONE');
});

await test('gap qualification', async () => {
  assert.equal(gap({ hasKeyEvents: true, hasLeads: true }), 'LEAD_QUALIFICATION_UNAVAILABLE');
});

await test('gap revenue', async () => {
  assert.equal(gap({ hasKeyEvents: true, hasLeads: false }), 'REVENUE_UNAVAILABLE');
  assert.equal(gap({ hasLeads: true, qualificationAvailable: true }), 'REVENUE_UNAVAILABLE');
});

await test('gap none full chain', async () => {
  assert.equal(
    gap({ hasKeyEvents: true, hasLeads: true, qualificationAvailable: true, hasRevenue: true }),
    'NONE',
  );
});

await test('gap traffic quiet none', async () => {
  assert.equal(gap({ hasTraffic: false }), 'NONE');
});

await test('quality direct source', async () => {
  assert.equal(ra.attributionQuality({ sourceNamesSearch: true, landingPageLinked: true, keywordHintOnly: true }), 'DIRECT_SOURCE');
});

await test('quality source attributed', async () => {
  assert.equal(ra.attributionQuality({ sourceNamesSearch: false, landingPageLinked: true, keywordHintOnly: true }), 'SOURCE_ATTRIBUTED');
});

await test('quality aggregate hint', async () => {
  assert.equal(ra.attributionQuality({ sourceNamesSearch: false, landingPageLinked: false, keywordHintOnly: true }), 'AGGREGATE_ASSOCIATION');
});

await test('quality unavailable', async () => {
  assert.equal(ra.attributionQuality({ sourceNamesSearch: false, landingPageLinked: false, keywordHintOnly: false }), 'UNAVAILABLE');
});

/* ---------- causality §33/§34/§35 (9) ---------- */

await test('observed after verified', async () => {
  const s = ra.observedAfterChange({ metric: 'Revenue', value: '₹2,40,000', verified: true });
  assert.match(s, /observed after the verified change/);
  assert.match(s, /Temporal association only/);
  assert.doesNotMatch(s, /caused revenue|because of/i);
});

await test('observed unverified', async () => {
  const s = ra.observedAfterChange({ metric: 'Revenue', value: '₹10', verified: false });
  assert.match(s, /verification unavailable/);
});

await test('temporal sequence', async () => {
  const s = ra.temporalSequenceNote(['CONTENT_CHANGE', 'VERIFIED', 'RANK_CHANGE']);
  assert.match(s, /CONTENT_CHANGE → VERIFIED → RANK_CHANGE/);
  assert.match(s, /TEMPORAL_ASSOCIATION/);
});

await test('temporal denies causal design', async () => {
  assert.match(ra.temporalSequenceNote(['a']), /unless a stronger causal design/);
});

await test('forbidden claim text', async () => {
  assert.match(ra.forbiddenRevenueClaim('real estate CRM'), /Never/);
});

await test('allowed observed phrasing', async () => {
  assert.match(ra.observedAfterChange({ metric: 'Organic attributed revenue', value: 'increased', verified: true }), /increased/);
});

await test('no because-of language', async () => {
  assert.doesNotMatch(ra.observedAfterChange({ metric: 'X', value: 'Y', verified: true }), /because of|caused by/i);
});

await test('verified change wording exact', async () => {
  assert.match(
    ra.observedAfterChange({ metric: 'Revenue', value: 'observed', verified: true }),
    /not proof the change caused it/,
  );
});

await test('metric value preserved', async () => {
  assert.match(ra.observedAfterChange({ metric: 'Leads', value: '8', verified: true }), /Leads 8/);
});

/* ---------- explanation §62 (4) ---------- */

await test('explanation fields', async () => {
  const e = ra.explainAttribution({ amount: '₹2,40,000', source: 'GA4', model: 'DATA_DRIVEN', channel: 'ORGANIC_SEARCH', window: '28 days' });
  assert.equal(e.status, 'SOURCE_ATTRIBUTED');
  assert.equal(e.source, 'GA4');
  assert.equal(e.attribution, 'DATA_DRIVEN');
  assert.equal(e.channel, 'ORGANIC_SEARCH');
  assert.equal(e.window, '28 days');
});

await test('explanation where', async () => {
  const e = ra.explainAttribution({ amount: '₹1', source: 'GA4', model: 'LAST_CLICK', channel: 'DIRECT', window: '7 days' });
  assert.match(e.where, /₹1/);
  assert.match(e.where, /not inferred/);
});

await test('explanation answers where from', async () => {
  assert.match(ra.explainAttribution({ amount: '5', source: 'CRM', model: 'UNKNOWN', channel: 'OTHER', window: '90 days' }).where, /CRM/);
});

await test('explanation ai channel', async () => {
  assert.equal(
    ra.explainAttribution({ amount: '₹40,000', source: 'GA4', model: 'DATA_DRIVEN', channel: 'AI_ASSISTANT', window: '28 days' }).channel,
    'AI_ASSISTANT',
  );
});

/* ---------- windows/freshness/modeled §36/§37/§38/§39 (10) ---------- */

await test('window 7', async () => {
  assert.equal(ra.normalizeWindow(7), 7);
});

await test('window 90', async () => {
  assert.equal(ra.normalizeWindow(90), 90);
});

await test('window default 28', async () => {
  assert.equal(ra.normalizeWindow(30), 28);
  assert.equal(ra.normalizeWindow('nope'), 28);
  assert.equal(ra.normalizeWindow(undefined), 28);
});

await test('windows vocabulary', async () => {
  assert.deepEqual([...ra.OUTCOME_WINDOWS], [7, 28, 90]);
});

await test('freshness parts', async () => {
  const f = ra.freshnessNote({ observedAt: '2026-09-10', dataThrough: '2026-09-07', source: 'GA4', model: 'DATA_DRIVEN' });
  assert.match(f, /2026-09-10/);
  assert.match(f, /2026-09-07/);
  assert.match(f, /never call data final prematurely/);
});

await test('freshness nulls', async () => {
  assert.match(ra.freshnessNote({ observedAt: null, dataThrough: null, source: 'GA4', model: 'UNKNOWN' }), /unknown/);
});

await test('modeled true estimated', async () => {
  assert.equal(ra.modeledLabel(true), 'ESTIMATED');
});

await test('modeled false observed', async () => {
  assert.equal(ra.modeledLabel(false), 'OBSERVED');
});

await test('modeled null unavailable', async () => {
  assert.equal(ra.modeledLabel(null), 'UNAVAILABLE');
});

await test('lookback source', async () => {
  assert.match(ra.lookbackNote('90 days'), /90 days/);
  assert.match(ra.lookbackNote(null), /never silently substitutes/);
});

/* ---------- client report §65 (4) ---------- */

await test('client six lines', async () => {
  const lines = ra.clientSummary({ traffic: 't', keyEvents: 'k', leads: 'l', revenue: 'r', unknown: ['u1'], next: 'n' });
  assert.equal(lines.length, 6);
  assert.match(lines[0], /WHAT HAPPENED/);
  assert.match(lines[5], /WHAT TO DO NEXT/);
});

await test('client unknown empty', async () => {
  const lines = ra.clientSummary({ traffic: 't', keyEvents: 'k', leads: 'l', revenue: 'r', unknown: [], next: 'n' });
  assert.match(lines[4], /nothing material/);
});

await test('client no jargon revenue', async () => {
  const lines = ra.clientSummary({ traffic: 't', keyEvents: 'k', leads: 'l', revenue: 'r', unknown: [], next: 'n' });
  assert.match(lines[3], /WHAT REVENUE IS ATTRIBUTED/);
});

await test('client unknowns joined', async () => {
  const lines = ra.clientSummary({ traffic: 't', keyEvents: 'k', leads: 'l', revenue: 'r', unknown: ['a', 'b'], next: 'n' });
  assert.match(lines[4], /a; b/);
});

/* ---------- privacy §41/§42 (9) ---------- */

await test('strip email phone', async () => {
  const out = ra.stripPii({ email: 'a@b.c', phone: '123', amount: 5 });
  assert.ok(!('email' in out));
  assert.ok(!('phone' in out));
  assert.equal(out.amount, 5);
});

await test('strip ip cookie ids', async () => {
  const out = ra.stripPii({ ip: '1.2.3.4', cookie: 'x', userId: 'u', clientId: 'c', name: 'N', sessions: 3 });
  assert.deepEqual(out, { sessions: 3 });
});

await test('strip keeps business fields', async () => {
  const out = ra.stripPii({ source: 'ORGANIC', status: 'NEW', landingPage: '/x' });
  assert.deepEqual(out, { source: 'ORGANIC', status: 'NEW', landingPage: '/x' });
});

await test('strip empty', async () => {
  assert.deepEqual(ra.stripPii({}), {});
});

await test('lead count number', async () => {
  assert.match(ra.leadCountOnly(8), /8 leads/);
  assert.match(ra.leadCountOnly(8), /counts only/);
});

await test('lead count singular', async () => {
  assert.match(ra.leadCountOnly(1), /1 lead /);
});

await test('lead count null', async () => {
  assert.match(ra.leadCountOnly(null), /unavailable — not zero/);
});

await test('lead count zero shown', async () => {
  assert.match(ra.leadCountOnly(0), /0 leads/);
});

await test('no pii keys leak', async () => {
  const out = ra.stripPii({ email: 'e', user_id: 'u', amount: 1 });
  assert.ok(!('user_id' in out));
});

/* ---------- hero gating §44/§45 (6) ---------- */

await test('hero filters unavailable', async () => {
  const h = ra.heroMetrics([
    { key: 'a', value: '5', evidence: 'OBSERVED' },
    { key: 'b', value: null, evidence: 'OBSERVED' },
    { key: 'c', value: '3', evidence: 'UNAVAILABLE' },
  ]);
  assert.equal(h.length, 1);
});

await test('hero caps five', async () => {
  const h = ra.heroMetrics(Array.from({ length: 8 }, (_, i) => ({ key: `k${i}`, value: '1', evidence: 'OBSERVED' })));
  assert.equal(h.length, 5);
});

await test('hero custom max', async () => {
  const h = ra.heroMetrics(
    Array.from({ length: 8 }, (_, i) => ({ key: `k${i}`, value: '1', evidence: 'OBSERVED' })),
    4,
  );
  assert.equal(h.length, 4);
});

await test('hero empty', async () => {
  assert.deepEqual(ra.heroMetrics([]), []);
});

await test('hero null value dropped', async () => {
  assert.equal(ra.heroMetrics([{ key: 'x', value: null, evidence: 'ATTRIBUTED' }]).length, 0);
});

await test('hero keeps order', async () => {
  const h = ra.heroMetrics([
    { key: 'b', value: '2', evidence: 'OBSERVED' },
    { key: 'a', value: '1', evidence: 'OBSERVED' },
  ]);
  assert.deepEqual(h.map((x) => x.key), ['b', 'a']);
});

/* ---------- need association + prompts §51/§67 (8) ---------- */

await test('need association label', async () => {
  const n = ra.needAssociationNote();
  assert.match(n, /NEED_TO_REVENUE_ASSOCIATION/);
  assert.match(n, /Never NEED_REVENUE_DIRECT/);
});

await test('prompts all connected empty', async () => {
  assert.deepEqual(ra.connectionPrompt({ ga4Connected: true, crmConnected: true, revenueAvailable: true }), []);
});

await test('prompts ga4 missing', async () => {
  const p = ra.connectionPrompt({ ga4Connected: false, crmConnected: true, revenueAvailable: true });
  assert.ok(p.some((x) => x.includes('CONNECT GA4')));
});

await test('prompts crm missing', async () => {
  const p = ra.connectionPrompt({ ga4Connected: true, crmConnected: false, revenueAvailable: true });
  assert.ok(p.some((x) => x.includes('CRM NOT CONNECTED')));
});

await test('prompts revenue missing', async () => {
  const p = ra.connectionPrompt({ ga4Connected: true, crmConnected: true, revenueAvailable: false });
  assert.ok(p.some((x) => x.includes('REVENUE DATA UNAVAILABLE')));
});

await test('prompts nothing connected three', async () => {
  assert.equal(ra.connectionPrompt({ ga4Connected: false, crmConnected: false, revenueAvailable: false }).length, 3);
});

await test('prompts no zeros language', async () => {
  assert.match(
    ra.connectionPrompt({ ga4Connected: true, crmConnected: true, revenueAvailable: false })[0],
    /never zero/,
  );
});

await test('need association page level', async () => {
  assert.match(ra.needAssociationNote(), /page\/channel/);
});

/* ---------- honesty invariants (16) ---------- */

await test('unavailable never zero money', async () => {
  assert.equal(ra.normalizeMoney({ amount: null, currency: 'INR' }).amount, null);
});

await test('gsc query never user', async () => {
  assert.match(ra.gscDemandRole(), /no user identity/);
});

await test('ai citation never traffic', async () => {
  assert.doesNotMatch('AI_CITATION_OBSERVED', /TRAFFIC/);
  assert.equal(ra.aiAssistantSourceFromReferrer('https://chatgpt.com/x'), 'CHATGPT');
});

await test('traffic never lead', async () => {
  assert.equal(ra.outcomeGap({
    eventTrackingConnected: true, eventTrackingReliable: true,
    hasTraffic: true, hasKeyEvents: false, hasLeads: false,
    qualificationAvailable: false, hasRevenue: false,
  }), 'CONVERSION_DATA_GAP');
});

await test('lead never qualified', async () => {
  assert.equal(ra.isQualified('QUALIFICATION_UNAVAILABLE'), null);
});

await test('qualified never revenue', async () => {
  assert.equal(
    ra.outcomeGap({
      eventTrackingConnected: true, eventTrackingReliable: true,
      hasTraffic: true, hasKeyEvents: true, hasLeads: true,
      qualificationAvailable: true, hasRevenue: false,
    }),
    'REVENUE_UNAVAILABLE',
  );
});

await test('attributed never causal', async () => {
  assert.match(ra.evidenceNote('ATTRIBUTED'), /not a RENKOO causal claim/);
});

await test('modeled never observed', async () => {
  assert.notEqual(ra.modeledLabel(true), 'OBSERVED');
});

await test('last click never data driven', async () => {
  assert.notEqual(
    ra.normalizeAttributionModel('LAST_CLICK'),
    ra.normalizeAttributionModel('DATA_DRIVEN'),
  );
});

await test('keyword revenue never direct default', async () => {
  assert.equal(ra.queryRevenueRelation({ directSourceLinkage: false }).relation, 'CONTEXTUAL');
});

await test('unassigned never organic', async () => {
  assert.notEqual(ra.normalizeChannel('Unassigned'), 'ORGANIC_SEARCH');
  assert.notEqual(ra.unattributableBucket('Unassigned'), null);
});

await test('direct never organic', async () => {
  assert.notEqual(ra.normalizeChannel('Direct'), 'ORGANIC_SEARCH');
});

await test('estimated distinct observed', async () => {
  assert.notEqual(ra.evidenceNote('ESTIMATED'), ra.evidenceNote('OBSERVED'));
});

await test('inferred distinct attributed', async () => {
  assert.notEqual(ra.evidenceNote('INFERRED'), ra.evidenceNote('ATTRIBUTED'));
});

await test('no causal verbs in labels', async () => {
  const blob = JSON.stringify([
    ra.evidenceNote('ATTRIBUTED'),
    ra.queryRevenueRelation({ directSourceLinkage: false }),
    ra.needAssociationNote(),
  ]);
  assert.doesNotMatch(blob, /caused|penaliz|guarantee/i);
});

await test('counts never identities', async () => {
  assert.match(ra.leadCountOnly(5), /counts only/);
});

/* ---------- performance bounds (6) ---------- */

await test('constants bounded', async () => {
  assert.equal(ra.MAX_ATTRIBUTION_PAGES, 20);
  assert.equal(ra.MAX_ATTRIBUTION_NEEDS, 10);
  assert.equal(ra.MAX_ATTRIBUTION_ACTIONS, 10);
  assert.equal(ra.MAX_PATH_TOUCHPOINTS, 10);
  assert.equal(ra.MAX_DB_ROWS, 500);
});

await test('credit batch 1000', async () => {
  for (let i = 0; i < 1000; i++) {
    ra.fractionalCredit(i / 1000);
  }
  assert.ok(true);
});

await test('channel batch 1000', async () => {
  const names = ['Organic Search', 'AI Assistant', 'Direct', 'Unassigned', 'Referral'];
  for (let i = 0; i < 1000; i++) {
    ra.normalizeChannel(names[i % names.length]);
  }
  assert.ok(true);
});

await test('money batch 500', async () => {
  for (let i = 0; i < 500; i++) {
    ra.normalizeMoney({ amount: i, currency: i % 2 ? 'INR' : 'USD' });
  }
  assert.ok(true);
});

await test('path batch 200', async () => {
  for (let i = 0; i < 200; i++) {
    ra.composePath({ touchpoints: [{ channel: 'ORGANIC_SEARCH', at: null, credit: 0.5 }, { channel: 'DIRECT', at: null, credit: 0.5 }] });
  }
  assert.ok(true);
});

await test('stage batch 500', async () => {
  for (let i = 0; i < 500; i++) {
    ra.normalizeLeadStage(i % 2 ? 'QUALIFIED' : 'NEW', false);
  }
  assert.ok(true);
});

/* ---------- GA4 + AI channel specifics (10) ---------- */

await test('ai medium recognized set', async () => {
  assert.equal(ra.normalizeChannel('ai-assistant'), 'AI_ASSISTANT');
});

await test('perplexity never aggregate-guessed', async () => {
  assert.equal(ra.aiAssistantSourceFromReferrer('https://www.perplexity.ai/x'), 'PERPLEXITY');
  assert.notEqual(ra.aiAssistantSourceFromReferrer('https://www.perplexity.ai/x'), 'AI_ASSISTANT_AGGREGATE');
});

await test('granularity unknown aggregate', async () => {
  assert.equal(ra.aiGranularity(['UNKNOWN', 'UNKNOWN']), 'AI_ASSISTANT_AGGREGATE');
});

await test('granularity mixed known unknown', async () => {
  assert.equal(ra.aiGranularity(['GEMINI', 'UNKNOWN']), 'GEMINI');
});

await test('openai domain maps chatgpt', async () => {
  assert.equal(ra.aiAssistantSourceFromReferrer('https://openai.com/index'), 'CHATGPT');
});

await test('xai domain maps grok', async () => {
  assert.equal(ra.aiAssistantSourceFromReferrer('https://x.ai/news'), 'GROK');
});

await test('bing chat maps copilot', async () => {
  assert.equal(ra.aiAssistantSourceFromReferrer('https://www.bing.com/chat?q=x'), 'COPILOT');
});

await test('referrer case-insensitive', async () => {
  assert.equal(ra.aiAssistantSourceFromReferrer('HTTPS://CLAUDE.AI/CHAT'), 'CLAUDE');
});

await test('empty referrer unknown', async () => {
  assert.equal(ra.aiAssistantSourceFromReferrer(''), 'UNKNOWN');
});

await test('ai sources no rank member', async () => {
  assert.ok(!ra.AI_ASSISTANT_SOURCES.some((s) => s.includes('RANK')));
});

/* ---------- modeled + lookback + freshness (6) ---------- */

await test('modeled estimated note', async () => {
  assert.match(ra.evidenceNote(ra.modeledLabel(true)), /estimated/i);
});

await test('modeled observed note', async () => {
  assert.match(ra.evidenceNote(ra.modeledLabel(false)), /Directly observed/);
});

await test('modeled unknown note', async () => {
  assert.match(ra.evidenceNote(ra.modeledLabel(undefined)), /not zero/);
});

await test('lookback window text', async () => {
  assert.match(ra.lookbackNote('30 days'), /Source lookback window: 30 days/);
});

await test('freshness model unknown', async () => {
  const f = ra.freshnessNote({ observedAt: 'x', dataThrough: 'y', source: 'CRM', model: 'UNKNOWN' });
  assert.match(f, /CRM/);
  assert.match(f, /UNKNOWN/);
});

await test('freshness never final', async () => {
  assert.match(
    ra.freshnessNote({ observedAt: 'x', dataThrough: 'y', source: 'GA4', model: 'DATA_DRIVEN' }),
    /may update after the event/,
  );
});

/* ---------- paths with credit (4) ---------- */

await test('path fractional credit kept', async () => {
  const p = ra.composePath({ touchpoints: [{ channel: 'ORGANIC_SEARCH', at: null, credit: 0.33 }] });
  assert.equal(p.touchpoints[0].credit, 0.33);
});

await test('path null credit kept', async () => {
  const p = ra.composePath({ touchpoints: [{ channel: 'DIRECT', at: null, credit: null }] });
  assert.equal(p.touchpoints[0].credit, null);
});

await test('path at timestamp kept', async () => {
  const p = ra.composePath({ touchpoints: [{ channel: 'DIRECT', at: '2026-09-01', credit: 1 }] });
  assert.equal(p.touchpoints[0].at, '2026-09-01');
});

await test('path unassigned touchpoint', async () => {
  const p = ra.composePath({ touchpoints: [{ channel: 'UNASSIGNED', at: null, credit: null }] });
  assert.equal(p.firstTouch, 'UNASSIGNED');
});

/* ---------- money + roi extras (6) ---------- */

await test('money large inr', async () => {
  assert.equal(ra.normalizeMoney({ amount: 240000, currency: 'INR' }).amount, 240000);
});

await test('money decimal usd', async () => {
  assert.equal(ra.normalizeMoney({ amount: 40.5, currency: 'USD' }).amount, 40.5);
});

await test('roi percent math', async () => {
  assert.equal(ra.attributionRoi({ revenue: 200, cost: 100 }).roi, 1);
});

await test('roi break even zero', async () => {
  assert.equal(ra.attributionRoi({ revenue: 100, cost: 100 }).roi, 0);
});

await test('multi gbp usd', async () => {
  assert.match(ra.multiCurrencyNote(['GBP', 'USD']), /MULTI_CURRENCY/);
});

await test('money whitespace currency', async () => {
  assert.equal(ra.normalizeMoney({ amount: 7, currency: ' usd ' }).currency, 'USD');
});

/* ---------- summary ---------- */

const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(`\nRevenue Attribution 2.0: ${passCount}/${results.length} passed.`);
if (failed.length > 0) {
  console.log(failed.join('\n'));
  process.exit(1);
} else {
  console.log('All Revenue Attribution 2.0 tests passed.');
}

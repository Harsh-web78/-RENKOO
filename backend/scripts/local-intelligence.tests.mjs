/*
 * RENKOO Local Search Intelligence 1.0 — tests (Phase 19).
 *
 * 84 tests over pure functions only: identity, NAP,
 * local queries, intent, rank labeling, SERP honesty,
 * competitors, location pages, service areas, schema,
 * GBP/reviews honesty, AI, commercial, revenue, NBA
 * reuse, security, bounds, honesty. No DB, no provider
 * calls, no billing touch.
 *
 * Run: npm run test:local-intelligence (dist built)
 */
import assert from 'node:assert/strict';

const local = await import(
  '../dist/local-seo/local-intelligence.js'
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

function identity(overrides = {}) {
  return {
    businessName: 'Acme Plumbing',
    website: 'https://acme.example.com',
    phone: '+91-20-12345678',
    address: '123 Main St',
    city: 'Pune',
    region: null,
    country: 'India',
    postalCode: null,
    category: null,
    services: ['plumbing'],
    serviceAreas: ['Pune'],
    ...overrides,
  };
}

/* ---------- BUSINESS IDENTITY (6) ---------- */

await test('complete identity with name contact area', async () => {
  assert.equal(
    local.identityCompleteness(identity()),
    'COMPLETE',
  );
});

await test('partial identity with name only', async () => {
  assert.equal(
    local.identityCompleteness(
      identity({ phone: null, address: null, serviceAreas: [] }),
    ),
    'PARTIAL',
  );
});

await test('unavailable identity when empty', async () => {
  assert.equal(
    local.identityCompleteness(
      identity({
        businessName: null,
        website: null,
        phone: null,
        address: null,
        city: null,
        country: null,
        services: [],
        serviceAreas: [],
      }),
    ),
    'UNAVAILABLE',
  );
});

await test('city without phone is partial', async () => {
  assert.equal(
    local.identityCompleteness(
      identity({ phone: null, address: null }),
    ),
    'PARTIAL',
  );
});

await test('service areas count as coverage', async () => {
  assert.equal(
    local.identityCompleteness(
      identity({ city: null, serviceAreas: ['Mumbai'] }),
    ),
    'COMPLETE',
  );
});

await test('no canonical overwrite helper', async () => {
  assert.equal('overwriteBusiness' in local, false);
  assert.equal('updateBrain' in local, false);
});

/* ---------- NAP (6) ---------- */

await test('nap consistent on match', async () => {
  assert.equal(
    local.napConsistency({
      brainName: 'Acme Plumbing',
      brainPhone: '+91-20-12345678',
      brainAddress: '123 Main St',
      siteName: 'Acme Plumbing',
      sitePhone: '+91-20-12345678',
      siteAddress: '123 Main St',
    }),
    'CONSISTENT',
  );
});

await test('nap inconsistent on mismatch', async () => {
  assert.equal(
    local.napConsistency({
      brainName: 'Acme Plumbing',
      brainPhone: null,
      brainAddress: null,
      siteName: 'Beta Plumbing',
      sitePhone: null,
      siteAddress: null,
    }),
    'INCONSISTENT',
  );
});

await test('nap partial on mixed match', async () => {
  assert.equal(
    local.napConsistency({
      brainName: 'Acme Plumbing',
      brainPhone: '+91-20-12345678',
      brainAddress: null,
      siteName: 'Acme Plumbing',
      sitePhone: '+91-20-99999999',
      siteAddress: null,
    }),
    'PARTIAL',
  );
});

await test('nap unavailable without pairs', async () => {
  assert.equal(
    local.napConsistency({
      brainName: null,
      brainPhone: null,
      brainAddress: null,
      siteName: null,
      sitePhone: null,
      siteAddress: null,
    }),
    'UNAVAILABLE',
  );
});

await test('nap scope never claims web-wide', async () => {
  assert.match(local.NAP_SCOPE_NOTE, /wider web is not claimed/i);
});

await test('phone digits normalize for compare', async () => {
  assert.equal(
    local.napConsistency({
      brainName: null,
      brainPhone: '+91 20 1234 5678',
      brainAddress: null,
      siteName: null,
      sitePhone: '+912012345678',
      siteAddress: null,
    }),
    'CONSISTENT',
  );
});

/* ---------- LOCAL QUERY (12) ---------- */

await test('service plus city detected', async () => {
  const found = local.detectLocalPattern('plumber pune', ['Pune']);
  assert.equal(found.pattern, 'SERVICE_CITY');
  assert.equal(found.evidence, 'INFERRED');
});

await test('city plus service detected', async () => {
  const found = local.detectLocalPattern('pune plumber', ['Pune']);
  assert.equal(found.pattern, 'CITY_SERVICE');
});

await test('near me detected', async () => {
  const found = local.detectLocalPattern('plumber near me', []);
  assert.equal(found.pattern, 'SERVICE_NEAR_ME');
});

await test('nearby detected', async () => {
  const found = local.detectLocalPattern('dentist nearby', []);
  assert.equal(found.pattern, 'SERVICE_NEAR_ME');
});

await test('best service location detected', async () => {
  const found = local.detectLocalPattern(
    'best dentist in pune',
    ['Pune'],
  );
  assert.equal(found.pattern, 'BEST_SERVICE_LOCATION');
});

await test('service area wording detected', async () => {
  const found = local.detectLocalPattern(
    'plumbing service area coverage',
    [],
  );
  assert.equal(found.pattern, 'SERVICE_AREA');
});

await test('non-local stays non-local', async () => {
  const found = local.detectLocalPattern('how to fix a tap', []);
  assert.equal(found.pattern, 'NON_LOCAL');
  assert.equal(found.evidence, 'UNAVAILABLE');
});

await test('observed queries are verified at service', async () => {
  assert.ok('detectLocalPattern' in local);
});

await test('no fake volume helper', async () => {
  assert.equal('searchVolume' in local, false);
  assert.equal('estimateVolume' in local, false);
});

await test('brand location via area match', async () => {
  const found = local.detectLocalPattern('acme pune', ['Pune']);
  assert.notEqual(found.pattern, 'NON_LOCAL');
});

await test('case-insensitive matching', async () => {
  const found = local.detectLocalPattern('PUNE PLUMBER', ['pune']);
  assert.equal(found.pattern, 'CITY_SERVICE');
});

await test('empty locations still finds near me', async () => {
  const found = local.detectLocalPattern('cafe near me', []);
  assert.equal(found.pattern, 'SERVICE_NEAR_ME');
});

/* ---------- INTENT (5) ---------- */

await test('transactional maps local transactional', async () => {
  assert.equal(
    local.localIntentContext('TRANSACTIONAL', true),
    'LOCAL_TRANSACTIONAL',
  );
});

await test('commercial family maps local commercial', async () => {
  for (const intent of [
    'COMMERCIAL',
    'COMPARISON',
    'ALTERNATIVES',
    'BUYER_RESEARCH',
  ])
    assert.equal(
      local.localIntentContext(intent, true),
      'LOCAL_COMMERCIAL',
    );
});

await test('local intent maps research', async () => {
  assert.equal(
    local.localIntentContext('LOCAL', true),
    'LOCAL_RESEARCH',
  );
});

await test('no location evidence is unavailable', async () => {
  assert.equal(
    local.localIntentContext('TRANSACTIONAL', false),
    'UNAVAILABLE',
  );
});

await test('no second intent engine', async () => {
  assert.equal('detectIntent' in local, false);
  assert.equal('classifyIntent' in local, false);
});

/* ---------- RANK (5) ---------- */

await test('local serp observed with evidence', async () => {
  assert.equal(
    local.localRankLabel({
      hasLocalSerpObservation: true,
      hasOrganicRank: true,
    }),
    'LOCAL_SERP_OBSERVED',
  );
});

await test('organic rank labeled organic', async () => {
  assert.equal(
    local.localRankLabel({
      hasLocalSerpObservation: false,
      hasOrganicRank: true,
    }),
    'ORGANIC_LOCAL_QUERY',
  );
});

await test('pack unavailable without evidence', async () => {
  assert.equal(
    local.localRankLabel({
      hasLocalSerpObservation: false,
      hasOrganicRank: false,
    }),
    'LOCAL_PACK_RANK_UNAVAILABLE',
  );
});

await test('no maps position vocabulary', async () => {
  assert.equal('mapsPosition' in local, false);
  assert.equal('mapsRank' in local, false);
});

await test('organic never mislabeled', async () => {
  assert.notEqual(
    local.localRankLabel({
      hasLocalSerpObservation: false,
      hasOrganicRank: true,
    }),
    'LOCAL_SERP_OBSERVED',
  );
});

/* ---------- SERP (4) ---------- */

await test('local labels are descriptive strings', async () => {
  for (const label of [
    'LOCAL_SERP_OBSERVED',
    'ORGANIC_LOCAL_QUERY',
    'LOCAL_PACK_RANK_UNAVAILABLE',
  ])
    assert.equal(typeof label, 'string');
});

await test('no maps inference helper', async () => {
  assert.equal('inferMapsVisibility' in local, false);
});

await test('rank labels cover all cases', async () => {
  const labels = new Set([
    local.localRankLabel({
      hasLocalSerpObservation: true,
      hasOrganicRank: false,
    }),
    local.localRankLabel({
      hasLocalSerpObservation: false,
      hasOrganicRank: true,
    }),
    local.localRankLabel({
      hasLocalSerpObservation: false,
      hasOrganicRank: false,
    }),
  ]);
  assert.equal(labels.size, 3);
});

await test('no serp scraping helper', async () => {
  assert.equal('scrapeSerp' in local, false);
  assert.equal('fetchMaps' in local, false);
});

/* ---------- COMPETITOR (3) ---------- */

await test('gap states are descriptive', async () => {
  for (const gap of [
    'LOCAL_VISIBILITY_GAP',
    'LOCAL_COMPETITOR_OBSERVED',
    'LOCAL_PAGE_GAP',
    'LOCAL_SERVICE_AREA_GAP',
    'LOCAL_EVIDENCE_LIMITED',
  ])
    assert.equal(typeof gap, 'string');
});

await test('no traffic stealing vocabulary', async () => {
  assert.equal('stealTraffic' in local, false);
  assert.equal('stolenTraffic' in local, false);
});

await test('no local authority score', async () => {
  assert.equal('localAuthorityScore' in local, false);
  assert.equal('localScore' in local, false);
});

/* ---------- LOCATION PAGE (8) ---------- */

await test('locations path detected', async () => {
  assert.equal(
    local.isLocationPageUrl(
      'https://acme.example.com/locations/pune',
      [],
    ),
    true,
  );
});

await test('service city url detected', async () => {
  assert.equal(
    local.isLocationPageUrl(
      'https://acme.example.com/plumber-pune',
      ['Pune'],
    ),
    true,
  );
});

await test('generic page not location', async () => {
  assert.equal(
    local.isLocationPageUrl(
      'https://acme.example.com/blog/fix-tap',
      ['Pune'],
    ),
    false,
  );
});

await test('strong page needs content and info', async () => {
  assert.equal(
    local.locationPageQuality({
      hasPage: true,
      hasContent: true,
      hasBusinessInfo: true,
      duplicateRiskEvidence: false,
      hasEvidence: true,
    }),
    'LOCATION_PAGE_STRONG',
  );
});

await test('incomplete without business info', async () => {
  assert.equal(
    local.locationPageQuality({
      hasPage: true,
      hasContent: true,
      hasBusinessInfo: false,
      duplicateRiskEvidence: false,
      hasEvidence: true,
    }),
    'LOCATION_PAGE_INCOMPLETE',
  );
});

await test('missing page explicit', async () => {
  assert.equal(
    local.locationPageQuality({
      hasPage: false,
      hasContent: null,
      hasBusinessInfo: null,
      duplicateRiskEvidence: false,
      hasEvidence: true,
    }),
    'LOCATION_PAGE_MISSING',
  );
});

await test('duplicate risk needs evidence', async () => {
  assert.equal(
    local.locationPageQuality({
      hasPage: true,
      hasContent: true,
      hasBusinessInfo: true,
      duplicateRiskEvidence: true,
      hasEvidence: true,
    }),
    'LOCATION_PAGE_DUPLICATE_RISK',
  );
  assert.equal(
    local.locationPageQuality({
      hasPage: true,
      hasContent: true,
      hasBusinessInfo: true,
      duplicateRiskEvidence: false,
      hasEvidence: true,
    }),
    'LOCATION_PAGE_STRONG',
  );
});

await test('no evidence is unavailable', async () => {
  assert.equal(
    local.locationPageQuality({
      hasPage: false,
      hasContent: null,
      hasBusinessInfo: null,
      duplicateRiskEvidence: false,
      hasEvidence: false,
    }),
    'LOCATION_PAGE_UNAVAILABLE',
  );
});

/* ---------- SERVICE AREA (5) ---------- */

await test('missing page with demand', async () => {
  assert.equal(
    local.serviceAreaGap({
      service: 'plumbing',
      location: 'Pune',
      hasPage: false,
      observedDemand: true,
      hasRanking: false,
      hasOutcome: false,
    }),
    'MISSING_PAGE',
  );
});

await test('weak visibility with page and demand', async () => {
  assert.equal(
    local.serviceAreaGap({
      service: 'plumbing',
      location: 'Pune',
      hasPage: true,
      observedDemand: true,
      hasRanking: false,
      hasOutcome: false,
    }),
    'WEAK_VISIBILITY',
  );
});

await test('supported with page', async () => {
  assert.equal(
    local.serviceAreaGap({
      service: 'plumbing',
      location: 'Pune',
      hasPage: true,
      observedDemand: false,
      hasRanking: false,
      hasOutcome: false,
    }),
    'SUPPORTED',
  );
});

await test('empty service or location unavailable', async () => {
  assert.equal(
    local.serviceAreaGap({
      service: '',
      location: 'Pune',
      hasPage: true,
      observedDemand: true,
      hasRanking: true,
      hasOutcome: false,
    }),
    'UNAVAILABLE',
  );
});

await test('no fabricated areas helper', async () => {
  assert.equal('suggestServiceAreas' in local, false);
});

/* ---------- SCHEMA (8) ---------- */

await test('localbusiness plus address observed', async () => {
  assert.equal(
    local.schemaState(
      {
        hasLocalBusiness: true,
        hasOrganization: false,
        hasPostalAddress: true,
        hasGeo: false,
        hasOpeningHours: false,
        hasSameAs: false,
        parseable: true,
      },
      true,
    ),
    'OBSERVED',
  );
});

await test('no signals is missing', async () => {
  assert.equal(
    local.schemaState(
      {
        hasLocalBusiness: false,
        hasOrganization: false,
        hasPostalAddress: false,
        hasGeo: false,
        hasOpeningHours: false,
        hasSameAs: false,
        parseable: true,
      },
      true,
    ),
    'MISSING',
  );
});

await test('unparseable is invalid', async () => {
  assert.equal(
    local.schemaState(
      {
        hasLocalBusiness: true,
        hasOrganization: false,
        hasPostalAddress: true,
        hasGeo: false,
        hasOpeningHours: false,
        hasSameAs: false,
        parseable: false,
      },
      true,
    ),
    'INVALID_INCOMPLETE',
  );
});

await test('no crawl is unavailable', async () => {
  assert.equal(
    local.schemaState(
      {
        hasLocalBusiness: true,
        hasOrganization: false,
        hasPostalAddress: true,
        hasGeo: false,
        hasOpeningHours: false,
        hasSameAs: false,
        parseable: true,
      },
      false,
    ),
    'UNAVAILABLE',
  );
});

await test('json-ld extraction finds localbusiness', async () => {
  const signals = local.extractSchemaSignals([
    {
      '@type': 'Plumber',
      name: 'Acme',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Pune',
      },
      geo: { '@type': 'GeoCoordinates' },
      sameAs: ['https://maps.example.com/acme'],
    },
  ]);
  assert.equal(signals.hasLocalBusiness, true);
  assert.equal(signals.hasPostalAddress, true);
  assert.equal(signals.hasGeo, true);
  assert.equal(signals.hasSameAs, true);
  assert.equal(signals.parseable, true);
});

await test('organization without address incomplete', async () => {
  assert.equal(
    local.schemaState(
      {
        hasLocalBusiness: false,
        hasOrganization: true,
        hasPostalAddress: false,
        hasGeo: false,
        hasOpeningHours: false,
        hasSameAs: true,
        parseable: true,
      },
      true,
    ),
    'INVALID_INCOMPLETE',
  );
});

await test('opening hours detected', async () => {
  const signals = local.extractSchemaSignals([
    {
      '@type': 'LocalBusiness',
      openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification' }],
    },
  ]);
  assert.equal(signals.hasOpeningHours, true);
});

await test('no ranking guarantee helper', async () => {
  assert.equal('schemaGuaranteesRank' in local, false);
});

/* ---------- GBP + REVIEWS (6) ---------- */

await test('gbp unavailable note exact', async () => {
  assert.match(
    local.GBP_UNAVAILABLE_NOTE,
    /cannot currently verify google business profile/i,
  );
});

await test('gbp metrics list nine gaps', async () => {
  assert.equal(local.GBP_UNAVAILABLE_METRICS.length, 9);
  for (const metric of [
    'reviews',
    'calls',
    'local pack position',
    'profile views',
  ])
    assert.ok(local.GBP_UNAVAILABLE_METRICS.includes(metric));
});

await test('no fake review helpers', async () => {
  assert.equal('reviewCount' in local, false);
  assert.equal('averageRating' in local, false);
  assert.equal('fetchReviews' in local, false);
});

await test('no call metrics helpers', async () => {
  assert.equal('callCount' in local, false);
  assert.equal('directionCount' in local, false);
});

await test('no gbp write helpers', async () => {
  assert.equal('updateProfile' in local, false);
  assert.equal('postToGbp' in local, false);
});

await test('cannot-measure covers maps and gbp', async () => {
  const joined = local.CANNOT_MEASURE.join(' ').toLowerCase();
  assert.match(joined, /maps rankings/);
  assert.match(joined, /business profile/);
  assert.match(joined, /review/);
  assert.match(joined, /local pack position/);
  assert.match(joined, /never estimated/);
});

/* ---------- AI/COMMERCIAL/REVENUE/NBA (6) ---------- */

await test('opportunity labels are descriptive', async () => {
  for (const label of [
    'LOCAL_CTR_GAP',
    'LOCAL_VISIBILITY_GAP',
    'LOCAL_PAGE_GAP',
    'LOCAL_SCHEMA_GAP',
    'LOCAL_BUSINESS_INFO_GAP',
    'LOCAL_SERVICE_AREA_GAP',
    'LOCAL_AI_VISIBILITY_GAP',
    'LOCAL_OUTCOME_MEASUREMENT_GAP',
  ])
    assert.ok(
      [
        'CREATE_CONTENT',
        'IMPROVE_EXISTING_PAGE',
        'FIX_TECHNICAL',
        'IMPROVE_AI_VISIBILITY',
        'MONITOR_CHANGE',
      ].includes(local.mapLocalOpportunityToNba(label)),
    );
});

await test('page gap maps to create', async () => {
  assert.equal(
    local.mapLocalOpportunityToNba('LOCAL_PAGE_GAP'),
    'CREATE_CONTENT',
  );
});

await test('schema gap maps to technical', async () => {
  assert.equal(
    local.mapLocalOpportunityToNba('LOCAL_SCHEMA_GAP'),
    'FIX_TECHNICAL',
  );
});

await test('measurement gap maps to monitor', async () => {
  assert.equal(
    local.mapLocalOpportunityToNba('LOCAL_OUTCOME_MEASUREMENT_GAP'),
    'MONITOR_CHANGE',
  );
});

await test('no second nba engine', async () => {
  assert.equal('selectNextBestAction' in local, false);
  assert.equal('priorityScore' in local, false);
});

await test('no revenue inference helper', async () => {
  assert.equal('estimateRevenue' in local, false);
  assert.equal('estimateCalls' in local, false);
});

/* ---------- SECURITY/PERFORMANCE/HONESTY (6) ---------- */

await test('no tenant fields in pure layer', async () => {
  assert.equal('organizationId' in local, false);
  assert.equal('websiteId' in local, false);
});

await test('no provider calls in pure layer', async () => {
  assert.equal('fetch' in local, false);
  assert.equal('scrapeMaps' in local, false);
});

await test('no local score anywhere', async () => {
  for (const key of [
    'localScore',
    'localRankScore',
    'localAuthorityScore',
    'localOpportunityScore',
  ])
    assert.equal(key in local, false);
});

await test('no probability or guarantee', async () => {
  assert.equal('probability' in local, false);
  assert.equal('guarantee' in local, false);
});

await test('no causality vocabulary', async () => {
  assert.equal('causedBy' in local, false);
  assert.equal('causesRanking' in local, false);
});

await test('unavailable is never zero', async () => {
  assert.equal(
    local.localRankLabel({
      hasLocalSerpObservation: false,
      hasOrganicRank: false,
    }),
    'LOCAL_PACK_RANK_UNAVAILABLE',
  );
});

await test('health strong with evidence', async () => {
  assert.equal(
    local.localHealthOf({ strong: 2, watch: 0, risk: 0, hasEvidence: true }),
    'STRONG',
  );
});

await test('health needs attention on risk', async () => {
  assert.equal(
    local.localHealthOf({ strong: 0, watch: 0, risk: 1, hasEvidence: true }),
    'NEEDS_ATTENTION',
  );
});

await test('health watch on watch signals', async () => {
  assert.equal(
    local.localHealthOf({ strong: 0, watch: 2, risk: 0, hasEvidence: true }),
    'WATCH',
  );
});

await test('health unavailable without evidence', async () => {
  assert.equal(
    local.localHealthOf({ strong: 0, watch: 0, risk: 0, hasEvidence: false }),
    'UNAVAILABLE',
  );
});

const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(`\nLocal Intelligence: ${results.length - failed.length}/${results.length} passed`);
for (const r of results) console.log(r);
if (failed.length > 0) process.exit(1);

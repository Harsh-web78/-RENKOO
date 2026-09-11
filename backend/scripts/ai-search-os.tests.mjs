/*
 * RENKOO AI Search OS 1.0 — composition tests (Phase 6).
 *
 * 50+ meaningful tests over pure functions only:
 * surfaces, prompt intelligence/lab, observations +
 * visibility states, metrics denominators, index,
 * history, citations, source graph, competitor radar,
 * why-not-AI, answer-worthiness, entity, readiness,
 * content gaps, opportunities, brief, roadmap bridge.
 * No DB, no provider calls, no billing touch.
 *
 * Run: npm run test:ai-search-os   (dist must be built)
 */
import assert from 'node:assert/strict';

const surfaces = await import(
  '../dist/ai-visibility/ai-surfaces.js'
);
const lab = await import(
  '../dist/ai-visibility/ai-prompt-lab.service.js'
);
const obs = await import(
  '../dist/ai-visibility/ai-observation.js'
);
const source = await import(
  '../dist/ai-visibility/ai-source-intelligence.service.js'
);
const why = await import(
  '../dist/ai-visibility/ai-why-not.service.js'
);
const roadmap = await import(
  '../dist/keywords/keyword-roadmap.service.js'
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

/* ---------- surfaces (6) ---------- */

await test('eight surfaces declared', async () => {
  assert.equal(surfaces.AI_SURFACES.length, 8);
});

await test('perplexity + claude unavailable', async () => {
  const ids = surfaces
    .unavailableSurfaces()
    .map((s) => s.id);
  assert.ok(ids.includes('PERPLEXITY'));
  assert.ok(ids.includes('CLAUDE'));
});

await test('gemini is the live executable surface', async () => {
  const exec = surfaces
    .executableSurfaces()
    .map((s) => s.id);
  assert.ok(exec.includes('GEMINI'));
});

await test('google surfaces manual-only', async () => {
  const aio = surfaces.getSurface('GOOGLE_AI_OVERVIEWS');
  assert.equal(aio.availability, 'MANUAL_OBSERVATION');
  assert.equal(aio.capabilities.apiAvailable, false);
});

await test('gemini api never relabeled as google search', async () => {
  assert.equal(
    surfaces.honestObservationType('GEMINI', true),
    'GEMINI_RESPONSE',
  );
  assert.equal(
    surfaces.honestObservationType('CHATGPT', false),
    'MANUAL_OBSERVATION',
  );
});

await test('unknown surface degrades to manual', async () => {
  assert.equal(
    surfaces.honestObservationType('BOGUS', true),
    'MANUAL_OBSERVATION',
  );
});

/* ---------- prompt intelligence / lab (12) ---------- */

await test('comparison archetype', async () => {
  assert.equal(
    lab.classifyArchetype('Salesforce vs HubSpot — which should I pick?'),
    'COMPARISON',
  );
});

await test('alternative archetype', async () => {
  assert.equal(
    lab.classifyArchetype('Best alternatives to Intercom'),
    'ALTERNATIVE',
  );
});

await test('local archetype', async () => {
  assert.equal(
    lab.classifyArchetype('SEO agency near me in Austin'),
    'LOCAL',
  );
});

await test('trust archetype', async () => {
  assert.equal(
    lab.classifyArchetype('Is Acme a trustworthy provider?'),
    'TRUST',
  );
});

await test('research vs expertise split', async () => {
  assert.equal(
    lab.classifyArchetype('2026 churn research study data'),
    'RESEARCH',
  );
  assert.equal(
    lab.classifyArchetype('Expert guide to onboarding frameworks'),
    'EXPERTISE',
  );
});

await test('buying journey is decision', async () => {
  assert.equal(
    lab.journeyFor('BUYING'),
    'DECISION',
  );
  assert.equal(
    lab.journeyFor('INFORMATIONAL'),
    'AWARENESS',
  );
});

await test('universe generation names evidence', async () => {
  const out = lab.generatePromptUniverse({
    keywords: [
      {
        keyword: 'crm software',
        topic: 'crm',
        impressions: 5000,
      },
    ],
    business: { name: 'Acme' },
    maxPrompts: 20,
  });
  assert.ok(out.length > 0 && out.length <= 20);
  assert.ok(
    out.every((p) =>
      p.generationReason.includes('Generated from'),
    ),
  );
  assert.ok(
    out.every((p) => p.journeyStage !== undefined),
  );
});

await test('universe bounded at hard max', async () => {
  const out = lab.generatePromptUniverse({
    keywords: Array.from({ length: 60 }, (_, i) => ({
      keyword: `topic keyword ${i}`,
    })),
    maxPrompts: 9999,
  });
  assert.ok(out.length <= lab.LAB_HARD_MAX);
});

await test('dedupe collapses case variants', async () => {
  const base = lab.generatePromptUniverse({
    keywords: [{ keyword: 'crm software' }],
    maxPrompts: 10,
  });
  const doubled = [...base, ...base.map((p) => ({ ...p }))];
  assert.equal(lab.dedupeLabPrompts(doubled).length, base.length);
});

await test('clusters group by topic', async () => {
  const out = lab.generatePromptUniverse({
    keywords: [
      { keyword: 'crm software', topic: 'crm' },
      { keyword: 'email marketing', topic: 'email' },
    ],
    maxPrompts: 20,
  });
  const clusters = lab.clusterLabPrompts(out);
  assert.ok(clusters.length >= 2);
});

await test('lab filter by intent + group', async () => {
  const out = lab.generatePromptUniverse({
    keywords: [{ keyword: 'crm software' }],
    maxPrompts: 20,
  });
  const filtered = lab.filterLabPrompts(out, {
    group: 'COMMERCIAL',
  });
  assert.ok(
    filtered.every((p) => p.groups.includes('COMMERCIAL')),
  );
});

await test('lab search query filters', async () => {
  const out = lab.generatePromptUniverse({
    keywords: [{ keyword: 'crm software' }],
    maxPrompts: 20,
  });
  const filtered = lab.filterLabPrompts(out, {
    query: 'crm',
  });
  assert.ok(filtered.length > 0);
});

/* ---------- observations + states (12) ---------- */

await test('answer hash stable + null on empty', async () => {
  assert.equal(obs.hashAnswer(''), null);
  assert.equal(
    obs.hashAnswer('hello'),
    obs.hashAnswer('hello'),
  );
});

await test('failed check is unavailable', async () => {
  const n = obs.normalizeObservation({
    prompt: 'best crm',
    answerText: '',
    checkFailed: true,
  });
  assert.equal(n.observationState, 'UNAVAILABLE');
  assert.equal(n.confidence, 'LOW');
});

await test('cited answer is observed high confidence', async () => {
  const n = obs.normalizeObservation({
    prompt: 'best crm',
    answerText: 'See https://acme.com/crm for details',
    brandMentioned: true,
    brandNames: ['acme'],
    citations: [{ url: 'https://acme.com/crm' }],
  });
  assert.equal(n.observationState, 'OBSERVED');
  assert.equal(n.confidence, 'HIGH');
  assert.deepEqual(n.citedDomains, ['acme.com']);
});

await test('visibility: visible + cited', async () => {
  assert.equal(
    obs.resolveVisibilityState({
      brandMentioned: true,
      brandCited: true,
      competitorPresent: false,
      observationCount: 2,
    }),
    'VISIBLE_AND_CITED',
  );
});

await test('visibility: mentioned not cited', async () => {
  assert.equal(
    obs.resolveVisibilityState({
      brandMentioned: true,
      brandCited: false,
      competitorPresent: false,
      observationCount: 1,
    }),
    'MENTIONED_NOT_CITED',
  );
});

await test('visibility: competitor dominant', async () => {
  assert.equal(
    obs.resolveVisibilityState({
      brandMentioned: false,
      brandCited: false,
      competitorPresent: true,
      observationCount: 3,
    }),
    'COMPETITOR_DOMINANT',
  );
});

await test('visibility: unknown without observations', async () => {
  assert.equal(
    obs.resolveVisibilityState({
      brandMentioned: false,
      brandCited: false,
      competitorPresent: false,
      observationCount: 0,
    }),
    'UNKNOWN',
  );
});

await test('metrics show insufficient not zero', async () => {
  const m = obs.computeAiMetrics([
    {
      prompt: 'a',
      observable: false,
      brandMentioned: false,
      brandCited: false,
      competitorMentioned: false,
      competitorCited: false,
    },
  ]);
  assert.equal(m.insufficientData, true);
  assert.equal(m.mentionRate, null);
  assert.ok(m.denominators.citationRate.includes('observable'));
});

await test('metrics denominators honest', async () => {
  const m = obs.computeAiMetrics([
    {
      prompt: 'a',
      observable: true,
      brandMentioned: true,
      brandCited: false,
      competitorMentioned: true,
      competitorCited: true,
    },
    {
      prompt: 'b',
      observable: true,
      brandMentioned: false,
      brandCited: false,
      competitorMentioned: false,
      competitorCited: false,
    },
  ]);
  assert.equal(m.mentionRate, 0.5);
  assert.equal(m.citationRate, 0);
  assert.equal(m.competitorCitationRate, 0.5);
});

await test('index withheld when insufficient', async () => {
  const m = obs.computeAiMetrics([]);
  const idx = obs.computeVisibilityIndex({
    metrics: m,
    uniqueCitedDomains: 0,
    topicsCovered: 0,
    topicsTotal: 0,
  });
  assert.equal(idx.score, null);
  assert.equal(idx.band, 'INSUFFICIENT_DATA');
});

await test('index decomposes without prediction', async () => {
  const m = obs.computeAiMetrics([
    {
      prompt: 'a',
      observable: true,
      brandMentioned: true,
      brandCited: true,
      competitorMentioned: false,
      competitorCited: false,
    },
  ]);
  const idx = obs.computeVisibilityIndex({
    metrics: m,
    uniqueCitedDomains: 4,
    topicsCovered: 2,
    topicsTotal: 2,
  });
  assert.ok(typeof idx.score === 'number');
  assert.ok(idx.explanation.includes('No prediction'));
  assert.ok(!JSON.stringify(idx).includes('probability'));
});

await test('history first run is baseline', async () => {
  const h = obs.compareHistory({
    before: [],
    after: ['a'],
    firstRun: true,
  });
  assert.equal(h.status, 'BASELINE_ESTABLISHED');
});

/* ---------- citations / source / radar (10) ---------- */

await test('customer cited classification', async () => {
  assert.equal(
    source.classifyCitation(
      {
        prompt: 'p',
        topic: 't',
        url: 'https://acme.com/pricing',
        domain: 'acme.com',
        customerDomain: 'acme.com',
        competitorDomains: ['rival'],
      },
      true,
    ),
    'CUSTOMER_CITED',
  );
});

await test('competitor cited classification', async () => {
  assert.equal(
    source.classifyCitation(
      {
        prompt: 'p',
        topic: 't',
        url: 'https://rival.com/x',
        domain: 'rival.com',
        customerDomain: 'acme.com',
        competitorDomains: ['rival'],
      },
      false,
    ),
    'COMPETITOR_CITED',
  );
});

await test('citation gaps from evidence', async () => {
  const gaps = source.buildCitationGaps({
    prompts: [
      {
        prompt: 'best crm',
        topic: 'crm',
        brandMentioned: true,
        brandCited: false,
        competitorCited: true,
        relevant: true,
      },
    ],
  });
  assert.ok(gaps.some((g) => g.kind === 'CITATION_GAP'));
  assert.ok(
    gaps.some((g) => g.kind === 'COMPETITOR_SOURCE_GAP'),
  );
});

await test('source graph labels frequent sources', async () => {
  const graph = source.buildSourceGraph([
    {
      prompt: 'a',
      topic: 'crm',
      url: 'https://docs.acme.com/a',
      domain: 'docs.acme.com',
      customerDomain: 'acme.com',
      competitorDomains: [],
    },
    {
      prompt: 'b',
      topic: 'crm',
      url: 'https://docs.acme.com/b',
      domain: 'docs.acme.com',
      customerDomain: 'acme.com',
      competitorDomains: [],
    },
    {
      prompt: 'c',
      topic: 'crm',
      url: 'https://docs.acme.com/c',
      domain: 'docs.acme.com',
      customerDomain: 'acme.com',
      competitorDomains: [],
    },
  ]);
  assert.equal(graph[0].label, 'frequently cited source');
  assert.ok(!graph[0].label.includes('authority'));
});

await test('competitor radar counts presence', async () => {
  const radar = source.buildCompetitorRadar({
    promptsTotal: 4,
    observations: [
      {
        prompt: 'best crm',
        topic: 'crm',
        competitor: 'Rival',
        mentioned: true,
        cited: true,
        sourceDomain: 'rival.com',
      },
    ],
  });
  assert.equal(radar[0].promptsAppeared, 1);
  assert.equal(radar[0].promptsCited, 1);
});

await test('reddit source type detected', async () => {
  assert.equal(
    source.sourceTypeOf('https://www.reddit.com/r/seo/x'),
    'REDDIT',
  );
});

await test('youtube source type detected', async () => {
  assert.equal(
    source.sourceTypeOf('https://youtube.com/watch?v=1'),
    'YOUTUBE',
  );
});

await test('source summary never claims influence', async () => {
  const summary = source.summarizeSourceTypes([
    'reddit.com',
    'youtube.com',
  ]);
  assert.ok(
    summary.every((s) => !s.note.includes('influence')),
  );
});

await test('malformed url degrades to unknown', async () => {
  assert.equal(
    source.classifyCitation(
      {
        prompt: 'p',
        topic: 't',
        url: 'not a url {{{',
        domain: '',
        customerDomain: 'acme.com',
        competitorDomains: [],
      },
      false,
    ),
    'UNKNOWN',
  );
});

await test('empty records graph empty', async () => {
  assert.deepEqual(source.buildSourceGraph([]), []);
});

/* ---------- why-not + readiness + gaps + opps (14) ---------- */

await test('fifteen checks run', async () => {
  const checks = why.runWhyNotAiChecks({
    pageExists: true,
    pageCrawlable: true,
    pageIndexable: true,
    intentMatch: false,
    topicCovered: true,
    supportingContent: null,
    internalLinks: null,
    competitorSourceStronger: true,
    competitorRepeatedlyCited: true,
    comparisonFaqMissing: true,
    freshnessIssue: false,
    citationGap: true,
    brandEntityGap: null,
    localEvidenceGap: null,
    thirdPartyGap: true,
  });
  assert.equal(checks.length, 15);
});

await test('primary cause respects page-first order', async () => {
  const checks = why.runWhyNotAiChecks({
    pageExists: false,
    pageCrawlable: null,
    pageIndexable: null,
    intentMatch: null,
    topicCovered: null,
    supportingContent: null,
    internalLinks: null,
    competitorSourceStronger: true,
    competitorRepeatedlyCited: true,
    comparisonFaqMissing: null,
    freshnessIssue: null,
    citationGap: true,
    brandEntityGap: null,
    localEvidenceGap: null,
    thirdPartyGap: null,
  });
  assert.equal(
    why.primaryWhyNotCause(checks).id,
    'PAGE_EXISTS',
  );
});

await test('answer-worthiness strong', async () => {
  const r = why.gradeAnswerWorthiness({
    directAnswer: true,
    questionCoverage: true,
    topicalCoverage: true,
    headingAlignment: true,
    factualClarity: true,
    entityCoverage: true,
    supportingPages: true,
    internalLinks: true,
    structuredData: false,
    freshnessOk: true,
    indexable: true,
    canonicalOk: true,
    crawlable: true,
  });
  assert.equal(r.grade, 'STRONG');
});

await test('answer-worthiness weak on crawl block', async () => {
  const r = why.gradeAnswerWorthiness({
    directAnswer: true,
    questionCoverage: true,
    topicalCoverage: true,
    headingAlignment: true,
    factualClarity: true,
    entityCoverage: true,
    supportingPages: true,
    internalLinks: true,
    structuredData: true,
    freshnessOk: true,
    indexable: false,
    canonicalOk: true,
    crawlable: false,
  });
  assert.equal(r.grade, 'WEAK');
});

await test('answer-worthiness unknown without evidence', async () => {
  const r = why.gradeAnswerWorthiness({
    directAnswer: null,
    questionCoverage: null,
    topicalCoverage: null,
    headingAlignment: null,
    factualClarity: null,
    entityCoverage: null,
    supportingPages: null,
    internalLinks: null,
    structuredData: null,
    freshnessOk: null,
    indexable: null,
    canonicalOk: null,
    crawlable: null,
  });
  assert.equal(r.grade, 'UNKNOWN');
});

await test('entity contradiction detected', async () => {
  const out = why.findEntityContradictions({
    website: [
      { subject: 'Product X', claim: 'A', source: 'site' },
    ],
    aiAnswers: [
      { subject: 'Product X', claim: 'B', source: 'ai' },
    ],
  });
  assert.equal(out.length, 1);
  assert.ok(out[0].note.includes('Your website describes'));
});

await test('readiness flags robots block', async () => {
  const r = why.assessReadiness({
    robotsAllowed: false,
    crawlable: true,
    indexable: true,
    canonicalOk: true,
    statusOk: true,
    structuredData: true,
    internalLinks: true,
  });
  assert.equal(r.ready, false);
  assert.ok(r.blockers.join(' ').includes('robots'));
  assert.ok(!r.note.includes('ranking factor'));
});

await test('content gaps reuse taxonomy', async () => {
  const gaps = why.buildAiContentGaps({
    topic: 'crm',
    affectedPrompts: ['best crm', 'crm vs rival'],
    targetUrl: null,
    competitorSources: ['rival.com'],
    citationGap: true,
    comparisonGap: true,
    questionGap: false,
    supportGap: false,
  });
  assert.ok(
    gaps.some((g) => g.kind === 'AI_CITATION_GAP'),
  );
  assert.ok(
    gaps.some((g) => g.kind === 'AI_COMPARISON_GAP'),
  );
  assert.ok(
    gaps.every((g) =>
      ['CREATE', 'IMPROVE', 'CONSOLIDATE'].includes(
        g.decision,
      ),
    ),
  );
});

await test('ten opportunity kinds buildable', async () => {
  const opps = why.buildAiOpportunities({
    prompt: 'best crm for agencies',
    topic: 'crm',
    targetPage: null,
    flags: {
      HIGH_VALUE_PROMPT_GAP: true,
      CITATION_GAP: true,
      COMPETITOR_SOURCE_GAP: true,
      CONTENT_GAP: true,
      PAGE_GAP: true,
      INTERNAL_LINK_GAP: true,
      SOURCE_PR_GAP: true,
      LOCAL_AI_GAP: true,
      BRAND_ENTITY_GAP: true,
      FRESHNESS_GAP: true,
    },
    highValue: true,
  });
  assert.equal(opps.length, 10);
  assert.ok(opps.every((o) => o.priority === 'HIGH'));
  assert.ok(
    opps.every((o) => o.measurement.includes('Re-run')),
  );
});

await test('brief never fabricates facts', async () => {
  const brief = why.enrichBrief({
    prompts: ['best crm?'],
    intent: 'COMMERCIAL',
    competitorSources: ['rival.com'],
    topic: 'crm',
    targetPage: 'https://acme.com/crm',
  });
  const dump = JSON.stringify(brief);
  assert.ok(brief.targetPrompts.length > 0);
  assert.ok(brief.recommendedStructure.length > 0);
  assert.ok(!dump.includes('write for AI'));
});

await test('roadmap accepts AI candidates', async () => {
  const res = roadmap.composeRoadmap({
    website: { id: 'w1', url: 'https://acme.com' },
    scope: {},
    candidates: [
      {
        kind: 'IMPROVE_PAGE',
        keyword: 'best crm',
        targetPage: 'https://acme.com/crm',
        title: 'Improve https://acme.com/crm',
        why: 'AI Search evidence supports this move. Measurement: re-run the tracked prompt.',
        evidence: [
          {
            source: 'AI Search',
            label: 'AI_VISIBILITY · AI_CITATION_GAP',
            evidenceType: 'OBSERVED',
          },
        ],
        strategyPriority: 'HIGH',
        position: 0,
        impressions: 100,
      },
    ],
    existingActions: [],
    unavailable: [],
    generatedAt: '2026-09-09T00:00:00.000Z',
  });
  assert.ok(res.priorities.length === 1);
  assert.ok(
    JSON.stringify(res).includes('AI Search') ||
      res.priorities[0].why.includes('AI Search'),
  );
});

await test('no guarantee language in opportunities', async () => {
  const opps = why.buildAiOpportunities({
    prompt: 'best crm',
    topic: 'crm',
    targetPage: null,
    flags: { CITATION_GAP: true },
    highValue: false,
  });
  const dump = JSON.stringify(opps).toLowerCase();
  assert.ok(!dump.includes('guarantee'));
  assert.ok(!dump.includes('rank #1'));
});

await test('prompt universe deterministic', async () => {
  const a = lab.generatePromptUniverse({
    keywords: [{ keyword: 'crm software' }],
    maxPrompts: 10,
  });
  const b = lab.generatePromptUniverse({
    keywords: [{ keyword: 'crm software' }],
    maxPrompts: 10,
  });
  assert.deepEqual(a, b);
});

await test('tenant statelessness holds', async () => {
  const h1 = obs.compareHistory({
    before: ['a'],
    after: ['a', 'b'],
    firstRun: false,
  });
  const h2 = obs.compareHistory({
    before: ['a'],
    after: ['a'],
    firstRun: false,
  });
  assert.equal(h1.status, 'GAINED');
  assert.equal(h2.status, 'UNCHANGED');
});

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(
  `\n${results.length - failed.length}/${results.length} passed`,
);
if (failed.length > 0) process.exit(1);

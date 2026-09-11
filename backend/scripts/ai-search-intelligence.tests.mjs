/*
 * RENKOO AI Search Intelligence 1.0 — composition tests.
 *
 * Pure-function coverage for prompt sets, citation
 * extraction, competitor comparison, gap diagnosis,
 * opportunity/roadmap bridges and history. No DB, no
 * provider calls, no billing touch.
 *
 * Run: npm run test:ai-intelligence   (dist must be built)
 */
import assert from 'node:assert/strict';

const promptMod = await import(
  '../dist/ai-visibility/ai-prompt-set.service.js'
);
const citationMod = await import(
  '../dist/ai-visibility/ai-citation.service.js'
);
const intelMod = await import(
  '../dist/ai-visibility/ai-search-intelligence.service.js'
);

const {
  classifyPromptIntent,
  generatePromptSet,
  dedupePrompts,
  countPromptsByIntent,
  promptIdentityKey,
  PROMPT_SET_HARD_MAX,
} = promptMod;

const {
  extractCitedUrls,
  extractCitationDomains,
  classifyCitationRelationship,
  summarizeAiCitations,
  overlapCitedDomains,
} = citationMod;

const {
  buildComparisonMatrix,
  classifyAiGaps,
  diagnoseAiGap,
  bridgeToContentOpportunity,
  bridgeToRoadmapCandidate,
  comparePromptHistory,
  recurringCompetitorSources,
} = intelMod;

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

const SITE = 'https://site.com';

/* ---------- 1. prompt generation ---------- */
await test('keyword prompts generated verbatim', async () => {
  const prompts = generatePromptSet({
    keywords: [
      { keyword: 'crm software' },
      { keyword: 'best crm for startups' },
    ],
  });
  assert.ok(
    prompts.some((p) => p.text === 'crm software'),
  );
  assert.ok(
    prompts.some(
      (p) => p.text === 'best crm for startups',
    ),
  );
  assert.ok(
    prompts.every(
      (p) => p.evidenceSource.length > 0,
    ),
  );
});

await test('generation is bounded', async () => {
  const keywords = Array.from(
    { length: 500 },
    (_, i) => ({ keyword: `keyword ${i}` }),
  );
  const prompts = generatePromptSet({
    keywords,
    maxPrompts: 10,
  });
  assert.equal(prompts.length, 10);
  const capped = generatePromptSet({
    keywords,
    maxPrompts: 99999,
  });
  assert.ok(capped.length <= PROMPT_SET_HARD_MAX);
});

await test('generation is deterministic', async () => {
  const input = {
    keywords: [{ keyword: 'crm software' }],
    gscQueries: ['crm pricing'],
    business: { name: 'Acme', offerings: ['CRM'] },
  };
  assert.deepEqual(
    generatePromptSet(input),
    generatePromptSet(input),
  );
});

await test('empty evidence yields empty set', async () => {
  assert.deepEqual(generatePromptSet({}), []);
  assert.deepEqual(
    generatePromptSet({ keywords: [] }),
    [],
  );
});

/* ---------- 2. deduplication ---------- */
await test('duplicate prompts collapse', async () => {
  const prompts = generatePromptSet({
    keywords: [{ keyword: 'CRM Software' }],
    gscQueries: ['crm software?', 'crm  software'],
  });
  assert.equal(prompts.length, 1);
});

await test('dedupe is case and punctuation insensitive', async () => {
  assert.equal(
    promptIdentityKey('Best CRM!'),
    promptIdentityKey('best crm'),
  );
  const out = dedupePrompts([
    {
      text: 'Best CRM?',
      intent: 'COMMERCIAL',
      topic: 't',
      sourceKeyword: null,
      sourceUrl: null,
      country: 'US',
      language: 'en',
      evidenceSource: 'X',
      status: 'SUGGESTED',
    },
    {
      text: 'best crm',
      intent: 'COMMERCIAL',
      topic: 't',
      sourceKeyword: null,
      sourceUrl: null,
      country: 'US',
      language: 'en',
      evidenceSource: 'Y',
      status: 'SUGGESTED',
    },
  ]);
  assert.equal(out.length, 1);
});

/* ---------- 3. intent classification ---------- */
await test('comparison intent', async () => {
  assert.equal(
    classifyPromptIntent('acme vs competitor'),
    'COMPARISON',
  );
  assert.equal(
    classifyPromptIntent('compare crm tools'),
    'COMPARISON',
  );
});

await test('alternative intent', async () => {
  assert.equal(
    classifyPromptIntent('salesforce alternatives'),
    'ALTERNATIVE',
  );
});

await test('transactional intent', async () => {
  assert.equal(
    classifyPromptIntent('buy crm software pricing'),
    'TRANSACTIONAL',
  );
});

await test('commercial intent', async () => {
  assert.equal(
    classifyPromptIntent('best crm reviews'),
    'COMMERCIAL',
  );
});

await test('local intent', async () => {
  assert.equal(
    classifyPromptIntent('crm consultant near me'),
    'LOCAL',
  );
});

await test('problem solution intent', async () => {
  assert.equal(
    classifyPromptIntent('how to migrate crm data'),
    'PROBLEM_SOLUTION',
  );
});

await test('brand intent from business name', async () => {
  assert.equal(
    classifyPromptIntent('about acme company', 'Acme'),
    'BRAND',
  );
});

await test('expertise trust intent', async () => {
  assert.equal(
    classifyPromptIntent('is acme crm legit'),
    'EXPERTISE_TRUST',
  );
});

await test('unknown falls back to informational', async () => {
  assert.equal(
    classifyPromptIntent('customer relationship management'),
    'INFORMATIONAL',
  );
});

await test('intent counts cover all categories', async () => {
  const prompts = generatePromptSet({
    keywords: [
      { keyword: 'crm software' },
      { keyword: 'best crm' },
      { keyword: 'buy crm' },
      { keyword: 'acme vs rival' },
    ],
  });
  const counts = countPromptsByIntent(prompts);
  const total = Object.values(counts).reduce(
    (sum, value) => sum + value,
    0,
  );
  assert.equal(total, prompts.length);
});

/* ---------- 4. tenant isolation ---------- */
await test('prompts never mix across inputs', async () => {
  const matrix = buildComparisonMatrix({
    prompts: [{ text: 'crm software' }],
    observations: [
      {
        prompt: 'crm software',
        provider: 'GEMINI',
        answerText: 'Acme is great. See https://site.com/crm.',
        brandMentioned: true,
        competitorMentions: [],
      },
      {
        prompt: 'unrelated prompt',
        provider: 'GEMINI',
        answerText: 'Rival wins.',
        brandMentioned: false,
        competitorMentions: ['Rival'],
      },
    ],
    competitors: ['Rival'],
    websiteUrl: SITE,
  });
  assert.equal(matrix.length, 1);
  assert.equal(matrix[0].prompts, 1);
  assert.deepEqual(
    matrix[0].competitorsPresent,
    [],
  );
});

await test('own domain scoping separates competitors', async () => {
  const summary = summarizeAiCitations({
    answerText:
      'See https://site.com/a and https://rival.com/b.',
    brandMentioned: true,
    ownDomains: ['site.com'],
    competitorDomains: ['rival.com'],
  });
  assert.equal(summary.relationship, 'CITED');
  assert.deepEqual(summary.competitorCited, [
    'rival.com',
  ]);
});

/* ---------- 5. citation extraction ---------- */
await test('markdown links extracted', async () => {
  const urls = extractCitedUrls(
    'Read [the guide](https://site.com/guide) today.',
  );
  assert.deepEqual(urls, ['https://site.com/guide']);
});

await test('bare urls extracted', async () => {
  const urls = extractCitedUrls(
    'Source: https://example.com/page and https://other.io/x.',
  );
  assert.ok(urls.includes('https://example.com/page'));
  assert.ok(urls.includes('https://other.io/x'));
});

await test('invalid urls rejected', async () => {
  assert.deepEqual(
    extractCitedUrls(
      'See ftp://files.com/x and javascript:alert(1) andnotaurl.',
    ),
    [],
  );
});

await test('empty text yields no citations', async () => {
  assert.deepEqual(extractCitedUrls(''), []);
  assert.deepEqual(extractCitedUrls(null), []);
  assert.deepEqual(extractCitedUrls(42), []);
});

await test('extraction is bounded and deduplicated', async () => {
  const text = Array.from(
    { length: 200 },
    (_, i) => `https://site.com/p-${i}`,
  ).join(' ');
  const urls = extractCitedUrls(
    `${text} https://site.com/p-0`,
  );
  assert.ok(urls.length <= 50);
  assert.equal(new Set(urls).size, urls.length);
});

await test('domains extracted in order', async () => {
  assert.deepEqual(
    extractCitationDomains([
      'https://www.site.com/a',
      'https://rival.com/b',
      'https://www.site.com/c',
    ]),
    ['site.com', 'rival.com'],
  );
});

await test('relationship CITED', async () => {
  assert.equal(
    classifyCitationRelationship({
      usableText: true,
      brandMentioned: true,
      ownCited: true,
    }),
    'CITED',
  );
});

await test('relationship MENTIONED_NOT_CITED', async () => {
  assert.equal(
    classifyCitationRelationship({
      usableText: true,
      brandMentioned: true,
      ownCited: false,
    }),
    'MENTIONED_NOT_CITED',
  );
});

await test('relationship NOT_MENTIONED', async () => {
  assert.equal(
    classifyCitationRelationship({
      usableText: true,
      brandMentioned: false,
      ownCited: false,
    }),
    'NOT_MENTIONED',
  );
});

await test('relationship UNKNOWN without usable text', async () => {
  assert.equal(
    classifyCitationRelationship({
      usableText: false,
      brandMentioned: true,
      ownCited: true,
    }),
    'UNKNOWN',
  );
});

await test('failed check summarizes as UNAVAILABLE', async () => {
  const summary = summarizeAiCitations({
    answerText: 'partial text',
    brandMentioned: false,
    checkFailed: true,
    ownDomains: ['site.com'],
  });
  assert.equal(summary.relationship, 'UNKNOWN');
  assert.equal(summary.evidenceState, 'UNAVAILABLE');
  assert.deepEqual(summary.citedUrls, []);
});

await test('malformed provider response never throws', async () => {
  for (const bad of [
    null,
    undefined,
    42,
    {},
    [],
    'https://',
  ]) {
    const summary = summarizeAiCitations({
      answerText: bad,
      brandMentioned: false,
      ownDomains: ['site.com'],
    });
    assert.ok(summary.relationship);
    assert.ok(Array.isArray(summary.citedUrls));
  }
});

await test('unavailable provider evidence preserved', async () => {
  const summary = summarizeAiCitations({
    answerText: '',
    brandMentioned: false,
    ownDomains: ['site.com'],
  });
  assert.equal(summary.evidenceState, 'UNAVAILABLE');
});

/* ---------- 6. competitor comparison ---------- */
await test('matrix detects brand and competitor presence', async () => {
  const [row] = buildComparisonMatrix({
    prompts: [{ text: 'best crm' }],
    observations: [
      {
        prompt: 'best crm',
        provider: 'OPENAI',
        answerText: 'Acme and Rival are options.',
        brandMentioned: true,
        competitorMentions: ['Rival'],
      },
    ],
    competitors: ['Rival'],
    websiteUrl: SITE,
  });
  assert.equal(row.brandPresent, true);
  assert.deepEqual(row.competitorsPresent, ['Rival']);
  assert.equal(row.evidenceState, 'OBSERVED');
});

await test('unobserved prompt is UNAVAILABLE', async () => {
  const [row] = buildComparisonMatrix({
    prompts: [{ text: 'best crm' }],
    observations: [],
    competitors: [],
    websiteUrl: SITE,
  });
  assert.equal(row.evidenceState, 'UNAVAILABLE');
  assert.equal(row.brandPresent, false);
});

await test('duplicate observations kept per provider', async () => {
  const [row] = buildComparisonMatrix({
    prompts: [{ text: 'best crm' }],
    observations: [
      {
        prompt: 'best crm',
        provider: 'GEMINI',
        answerText: 'Acme.',
        brandMentioned: true,
        competitorMentions: [],
      },
      {
        prompt: 'best crm',
        provider: 'OPENAI',
        answerText: 'Rival.',
        brandMentioned: false,
        competitorMentions: ['Rival'],
      },
    ],
    competitors: ['Rival'],
    websiteUrl: SITE,
  });
  assert.equal(row.observations.length, 2);
  assert.equal(row.brandPresent, true);
});

await test('gap classification covers all three kinds', async () => {
  const comparisons = buildComparisonMatrix({
    prompts: [
      { text: 'invisible prompt' },
      { text: 'mentioned prompt' },
      { text: 'competitor prompt' },
    ],
    observations: [
      {
        prompt: 'mentioned prompt',
        provider: 'GEMINI',
        answerText: 'Acme is fine.',
        brandMentioned: true,
        competitorMentions: [],
      },
      {
        prompt: 'competitor prompt',
        provider: 'GEMINI',
        answerText: 'Rival wins. See https://rival.com/x.',
        brandMentioned: false,
        competitorMentions: ['Rival'],
      },
    ],
    competitors: ['Rival'],
    websiteUrl: SITE,
  });
  const kinds = new Set(
    classifyAiGaps(comparisons).map((gap) => gap.kind),
  );
  assert.ok(kinds.has('AI_VISIBILITY_GAP'));
  assert.ok(kinds.has('AI_CITATION_GAP'));
  assert.ok(kinds.has('CONTENT_SOURCE_GAP'));
});

await test('recurring sources ordered by prompt count', async () => {
  const ranked = recurringCompetitorSources([
    ['rival.com', 'news.com'],
    ['rival.com'],
    ['rival.com', 'blog.io'],
  ]);
  assert.equal(ranked[0].domain, 'rival.com');
  assert.equal(ranked[0].prompts, 3);
  assert.ok(
    overlapCitedDomains([[]]).length === 0,
  );
});

/* ---------- 7. diagnosis ---------- */
function gap(kind = 'AI_VISIBILITY_GAP') {
  return {
    kind,
    prompt: 'best crm',
    topic: 'crm',
    priority: 'HIGH',
    why: 'why',
    evidence: [],
    evidenceState: 'OBSERVED',
  };
}

await test('insufficient data diagnosis', async () => {
  const diagnosis = diagnoseAiGap({
    gap: gap(),
    hasRelevantPage: false,
    pageAlignedWithPrompt: false,
    competitorRepeatedlyCited: false,
    topicCoveredAnywhere: false,
    supportingContentExists: false,
    pageIndexable: true,
    observationCount: 0,
  });
  assert.equal(diagnosis.diagnosis, 'INSUFFICIENT_DATA');
  assert.equal(diagnosis.evidenceState, 'UNAVAILABLE');
  assert.ok(diagnosis.action.label.length > 0);
});

await test('technical blocker diagnosis', async () => {
  const diagnosis = diagnoseAiGap({
    gap: gap(),
    hasRelevantPage: true,
    pageAlignedWithPrompt: false,
    competitorRepeatedlyCited: false,
    topicCoveredAnywhere: true,
    supportingContentExists: true,
    pageIndexable: false,
    observationCount: 3,
  });
  assert.equal(diagnosis.diagnosis, 'TECHNICAL_BLOCKER');
});

await test('missing topic diagnosis', async () => {
  const diagnosis = diagnoseAiGap({
    gap: gap(),
    hasRelevantPage: false,
    pageAlignedWithPrompt: false,
    competitorRepeatedlyCited: false,
    topicCoveredAnywhere: false,
    supportingContentExists: false,
    pageIndexable: true,
    observationCount: 2,
  });
  assert.equal(
    diagnosis.diagnosis,
    'CONTENT_COVERAGE_GAP',
  );
});

await test('misaligned page diagnosis', async () => {
  const diagnosis = diagnoseAiGap({
    gap: gap(),
    hasRelevantPage: true,
    pageAlignedWithPrompt: false,
    competitorRepeatedlyCited: false,
    topicCoveredAnywhere: true,
    supportingContentExists: true,
    pageIndexable: true,
    observationCount: 2,
  });
  assert.equal(diagnosis.diagnosis, 'INTENT_GAP');
});

await test('repeated competitor citation diagnosis', async () => {
  const diagnosis = diagnoseAiGap({
    gap: gap('CONTENT_SOURCE_GAP'),
    hasRelevantPage: true,
    pageAlignedWithPrompt: true,
    competitorRepeatedlyCited: true,
    topicCoveredAnywhere: true,
    supportingContentExists: true,
    pageIndexable: true,
    observationCount: 4,
  });
  assert.equal(
    diagnosis.diagnosis,
    'CONTENT_COVERAGE_GAP',
  );
  assert.ok(
    diagnosis.headline.includes('competitor'),
  );
});

await test('every diagnosis carries evidence', async () => {
  for (const params of [
    { topicCoveredAnywhere: true, supportingContentExists: false, hasRelevantPage: true, pageAlignedWithPrompt: true, competitorRepeatedlyCited: false, pageIndexable: true, observationCount: 1 },
    { topicCoveredAnywhere: true, supportingContentExists: true, hasRelevantPage: true, pageAlignedWithPrompt: true, competitorRepeatedlyCited: false, pageIndexable: true, observationCount: 1 },
  ]) {
    const diagnosis = diagnoseAiGap({
      gap: gap(),
      ...params,
    });
    assert.ok(diagnosis.evidence.length > 0);
    assert.ok(diagnosis.headline.length > 0);
    assert.ok(diagnosis.action.href.length > 0);
  }
});

/* ---------- 8. opportunity + roadmap bridges ---------- */
await test('opportunity reuses content decision', async () => {
  const create = bridgeToContentOpportunity({
    topic: 'crm comparisons',
    affectedPrompts: ['acme vs rival'],
    competitorCitedSources: ['rival.com'],
    citationGap: true,
    recommendedPage: null,
    pageMapping: 'CREATE',
    bucket: null,
  });
  assert.equal(create.decision, 'CREATE');
  assert.deepEqual(create.missingTopics, [
    'crm comparisons',
  ]);
  const improve = bridgeToContentOpportunity({
    topic: 'crm',
    affectedPrompts: ['best crm'],
    competitorCitedSources: [],
    citationGap: false,
    recommendedPage: 'https://site.com/crm',
    pageMapping: 'IMPROVE',
    bucket: null,
  });
  assert.equal(improve.decision, 'IMPROVE');
  assert.deepEqual(improve.missingTopics, []);
});

await test('roadmap candidate extends existing bands', async () => {
  const candidate = bridgeToRoadmapCandidate({
    gap: gap('CONTENT_SOURCE_GAP'),
    diagnosis: diagnoseAiGap({
      gap: gap('CONTENT_SOURCE_GAP'),
      hasRelevantPage: false,
      pageAlignedWithPrompt: false,
      competitorRepeatedlyCited: true,
      topicCoveredAnywhere: false,
      supportingContentExists: false,
      pageIndexable: true,
      observationCount: 3,
    }),
    keyword: 'best crm',
    targetPage: null,
  });
  assert.ok(candidate.kind.length > 0);
  assert.ok(
    ['HIGH', 'MEDIUM', 'LOW'].includes(
      candidate.strategyPriority,
    ),
  );
  assert.ok(candidate.impact.length > 0);
  assert.ok(candidate.effort.length > 0);
  assert.ok(candidate.why.includes('measure'));
  assert.ok(!candidate.why.includes('#1 in'));
});

/* ---------- 9. history ---------- */
await test('single observation establishes baseline', async () => {
  const trend = comparePromptHistory({
    prompt: 'best crm',
    baseline: {
      mentioned: true,
      cited: false,
      competitors: [],
    },
    current: null,
  });
  assert.equal(trend.status, 'BASELINE_ESTABLISHED');
  assert.ok(trend.note.includes('Baseline'));
});

await test('no observations is insufficient data', async () => {
  const trend = comparePromptHistory({
    prompt: 'best crm',
    baseline: null,
    current: null,
  });
  assert.equal(trend.status, 'INSUFFICIENT_DATA');
});

await test('improvement and decline detected', async () => {
  const improved = comparePromptHistory({
    prompt: 'best crm',
    baseline: {
      mentioned: false,
      cited: false,
      competitors: ['Rival'],
    },
    current: {
      mentioned: true,
      cited: true,
      competitors: [],
    },
  });
  assert.equal(improved.status, 'IMPROVED');
  assert.deepEqual(improved.lostCompetitors, ['Rival']);
  const declined = comparePromptHistory({
    prompt: 'best crm',
    baseline: {
      mentioned: true,
      cited: true,
      competitors: [],
    },
    current: {
      mentioned: false,
      cited: false,
      competitors: ['Rival'],
    },
  });
  assert.equal(declined.status, 'DECLINED');
  assert.deepEqual(declined.newCompetitors, ['Rival']);
});

await test('unchanged history stays unchanged', async () => {
  const trend = comparePromptHistory({
    prompt: 'best crm',
    baseline: {
      mentioned: true,
      cited: false,
      competitors: ['Rival'],
    },
    current: {
      mentioned: true,
      cited: false,
      competitors: ['Rival'],
    },
  });
  assert.equal(trend.status, 'UNCHANGED');
  assert.equal(trend.mentionChange, 0);
});

const failed = results.filter((line) =>
  line.startsWith('FAIL'),
);

for (const line of results) {
  console.log(line);
}

console.log(`\n${results.length - failed.length}/${results.length} passed`);

if (failed.length > 0) {
  process.exit(1);
}

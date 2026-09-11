/*
 * =========================================================
 * WHY-NOT-AI + ANSWER-WORTHINESS + ENTITY + READINESS
 * + AI CONTENT GAPS + AI OPPORTUNITIES 1.0
 * (Phase 6 / Parts 12–18 + 22).
 *
 * 15 evidence-bound diagnostic checks, deterministic
 * page answer-worthiness (STRONG/PARTIAL/WEAK/UNKNOWN),
 * lightweight entity-contradiction detection, AI crawler
 * readiness from existing crawl facts, six AI content
 * gap kinds reusing the existing CREATE/IMPROVE/
 * CONSOLIDATE taxonomy, and ten explainable AI
 * opportunities on the existing HIGH/MEDIUM/LOW bands.
 * No invented facts, no causal claims, no GEO hacks.
 * =========================================================
 */

export type WhyNotAiCheckId =
  | 'PAGE_EXISTS'
  | 'PAGE_CRAWLABLE'
  | 'PAGE_INDEXABLE'
  | 'INTENT_MATCH'
  | 'TOPIC_COVERED'
  | 'SUPPORTING_CONTENT'
  | 'INTERNAL_LINK_SUPPORT'
  | 'COMPETITOR_SOURCE_COVERAGE'
  | 'COMPETITOR_REPEATEDLY_CITED'
  | 'COMPARISON_FAQ_COVERAGE'
  | 'FRESHNESS'
  | 'CITATION_GAP'
  | 'BRAND_ENTITY_GAP'
  | 'LOCAL_EVIDENCE_GAP'
  | 'THIRD_PARTY_SOURCE_GAP';

export interface WhyNotAiCheck {
  id: WhyNotAiCheckId;
  label: string;
  passed: boolean | null;
  evidence: string;
  evidenceState: 'VERIFIED' | 'OBSERVED' | 'INFERRED' | 'UNAVAILABLE';
}

export interface WhyNotAiInput {
  pageExists: boolean | null;
  pageCrawlable: boolean | null;
  pageIndexable: boolean | null;
  intentMatch: boolean | null;
  topicCovered: boolean | null;
  supportingContent: boolean | null;
  internalLinks: boolean | null;
  competitorSourceStronger: boolean | null;
  competitorRepeatedlyCited: boolean | null;
  comparisonFaqMissing: boolean | null;
  freshnessIssue: boolean | null;
  citationGap: boolean | null;
  brandEntityGap: boolean | null;
  localEvidenceGap: boolean | null;
  thirdPartyGap: boolean | null;
}

const CHECK_LABELS: Record<WhyNotAiCheckId, string> = {
  PAGE_EXISTS: 'Relevant page exists',
  PAGE_CRAWLABLE: 'Page is crawlable',
  PAGE_INDEXABLE: 'Page is indexable',
  INTENT_MATCH: 'Page matches prompt intent',
  TOPIC_COVERED: 'Topic covered on site',
  SUPPORTING_CONTENT: 'Supporting content exists',
  INTERNAL_LINK_SUPPORT: 'Internal links support the page',
  COMPETITOR_SOURCE_COVERAGE:
    'Competitors lack stronger source coverage',
  COMPETITOR_REPEATEDLY_CITED:
    'No competitor repeatedly cited',
  COMPARISON_FAQ_COVERAGE:
    'Comparison / FAQ / problem content present',
  FRESHNESS: 'No freshness issue in evidence',
  CITATION_GAP: 'No citation / source gap',
  BRAND_ENTITY_GAP: 'No brand / entity evidence gap',
  LOCAL_EVIDENCE_GAP: 'No local evidence gap',
  THIRD_PARTY_SOURCE_GAP: 'No third-party source gap',
};

export function runWhyNotAiChecks(
  input: WhyNotAiInput,
): WhyNotAiCheck[] {
  const entries: Array<[WhyNotAiCheckId, boolean | null]> =
    [
      ['PAGE_EXISTS', input.pageExists],
      ['PAGE_CRAWLABLE', input.pageCrawlable],
      ['PAGE_INDEXABLE', input.pageIndexable],
      ['INTENT_MATCH', input.intentMatch],
      ['TOPIC_COVERED', input.topicCovered],
      ['SUPPORTING_CONTENT', input.supportingContent],
      ['INTERNAL_LINK_SUPPORT', input.internalLinks],
      [
        'COMPETITOR_SOURCE_COVERAGE',
        input.competitorSourceStronger === null
          ? null
          : !input.competitorSourceStronger,
      ],
      [
        'COMPETITOR_REPEATEDLY_CITED',
        input.competitorRepeatedlyCited === null
          ? null
          : !input.competitorRepeatedlyCited,
      ],
      [
        'COMPARISON_FAQ_COVERAGE',
        input.comparisonFaqMissing === null
          ? null
          : !input.comparisonFaqMissing,
      ],
      [
        'FRESHNESS',
        input.freshnessIssue === null
          ? null
          : !input.freshnessIssue,
      ],
      [
        'CITATION_GAP',
        input.citationGap === null
          ? null
          : !input.citationGap,
      ],
      [
        'BRAND_ENTITY_GAP',
        input.brandEntityGap === null
          ? null
          : !input.brandEntityGap,
      ],
      [
        'LOCAL_EVIDENCE_GAP',
        input.localEvidenceGap === null
          ? null
          : !input.localEvidenceGap,
      ],
      [
        'THIRD_PARTY_SOURCE_GAP',
        input.thirdPartyGap === null
          ? null
          : !input.thirdPartyGap,
      ],
    ];
  return entries.map(([id, value]) => ({
    id,
    label: CHECK_LABELS[id],
    passed: value,
    evidence:
      value === null
        ? `${CHECK_LABELS[id]}: no evidence — marked UNKNOWN.`
        : value
          ? `${CHECK_LABELS[id]}: evidence supports this.`
          : `${CHECK_LABELS[id]}: evidence shows a gap here.`,
    evidenceState:
      value === null ? 'UNAVAILABLE' : 'INFERRED',
  }));
}

export function primaryWhyNotCause(
  checks: WhyNotAiCheck[],
): WhyNotAiCheck | null {
  const order: WhyNotAiCheckId[] = [
    'PAGE_EXISTS',
    'PAGE_CRAWLABLE',
    'PAGE_INDEXABLE',
    'INTENT_MATCH',
    'TOPIC_COVERED',
    'CITATION_GAP',
    'COMPETITOR_REPEATEDLY_CITED',
    'COMPETITOR_SOURCE_COVERAGE',
    'COMPARISON_FAQ_COVERAGE',
    'SUPPORTING_CONTENT',
    'INTERNAL_LINK_SUPPORT',
    'FRESHNESS',
    'BRAND_ENTITY_GAP',
    'LOCAL_EVIDENCE_GAP',
    'THIRD_PARTY_SOURCE_GAP',
  ];
  for (const id of order) {
    const check = checks.find((c) => c.id === id);
    if (check && check.passed === false) return check;
  }
  return null;
}

/* ---------- answer-worthiness ---------- */

export type AnswerWorthiness =
  | 'STRONG'
  | 'PARTIAL'
  | 'WEAK'
  | 'UNKNOWN';

export function gradeAnswerWorthiness(input: {
  directAnswer: boolean | null;
  questionCoverage: boolean | null;
  topicalCoverage: boolean | null;
  headingAlignment: boolean | null;
  factualClarity: boolean | null;
  entityCoverage: boolean | null;
  supportingPages: boolean | null;
  internalLinks: boolean | null;
  structuredData: boolean | null;
  freshnessOk: boolean | null;
  indexable: boolean | null;
  canonicalOk: boolean | null;
  crawlable: boolean | null;
}): { grade: AnswerWorthiness; evidence: string[] } {
  const values = Object.values(input);
  const known = values.filter((v) => v !== null);
  if (known.length === 0)
    return {
      grade: 'UNKNOWN',
      evidence: ['No page evidence available.'],
    };
  const positives = known.filter((v) => v === true).length;
  const ratio = positives / known.length;
  const evidence = Object.entries(input).map(
    ([key, value]) =>
      `${key}: ${value === null ? 'unknown' : value ? 'yes' : 'no'}`,
  );
  if (
    input.crawlable === false ||
    input.indexable === false
  )
    return {
      grade: 'WEAK',
      evidence: [
        'Page cannot be used as an AI source (crawl/index blocked).',
        ...evidence,
      ],
    };
  if (ratio >= 0.7)
    return { grade: 'STRONG', evidence };
  if (ratio >= 0.4)
    return { grade: 'PARTIAL', evidence };
  return { grade: 'WEAK', evidence };
}

/* ---------- entity contradictions ---------- */

export interface EntityStatement {
  subject: string;
  claim: string;
  source: string;
}

export function findEntityContradictions(input: {
  website: EntityStatement[];
  aiAnswers: EntityStatement[];
}): Array<{
  subject: string;
  websiteClaim: string;
  aiClaim: string;
  note: string;
}> {
  const out: Array<{
    subject: string;
    websiteClaim: string;
    aiClaim: string;
    note: string;
  }> = [];
  for (const w of input.website) {
    for (const a of input.aiAnswers) {
      if (
        w.subject.trim().toLowerCase() ===
          a.subject.trim().toLowerCase() &&
        w.claim.trim().toLowerCase() !==
          a.claim.trim().toLowerCase()
      ) {
        out.push({
          subject: w.subject,
          websiteClaim: w.claim,
          aiClaim: a.claim,
          note: `Your website describes ${w.subject} as "${w.claim}", while observed AI answers repeatedly describe it as "${a.claim}".`,
        });
      }
    }
  }
  return out.slice(0, 10);
}

/* ---------- AI crawler readiness ---------- */

export interface ReadinessInput {
  robotsAllowed: boolean | null;
  crawlable: boolean | null;
  indexable: boolean | null;
  canonicalOk: boolean | null;
  statusOk: boolean | null;
  structuredData: boolean | null;
  internalLinks: boolean | null;
}

export function assessReadiness(
  input: ReadinessInput,
): {
  ready: boolean | null;
  blockers: string[];
  note: string;
} {
  const blockers: string[] = [];
  if (input.robotsAllowed === false)
    blockers.push('robots.txt disallows the page');
  if (input.crawlable === false)
    blockers.push('page not crawlable');
  if (input.indexable === false)
    blockers.push('page not indexable');
  if (input.statusOk === false)
    blockers.push('non-OK status code');
  if (input.canonicalOk === false)
    blockers.push('canonical points elsewhere');
  const known = Object.values(input).filter(
    (v) => v !== null,
  );
  if (known.length === 0)
    return {
      ready: null,
      blockers,
      note: 'No crawl evidence — readiness UNKNOWN.',
    };
  return {
    ready: blockers.length === 0,
    blockers,
    note:
      blockers.length === 0
        ? 'No crawl-evidence blockers found. Readiness is eligibility only — never an AI ranking factor claim.'
        : `Blocked by: ${blockers.join('; ')}. No GEO hacks recommended.`,
  };
}

/* ---------- AI content gaps (reuse taxonomy) ---------- */

export type AiContentGapKind =
  | 'AI_CONTENT_GAP'
  | 'AI_CITATION_GAP'
  | 'AI_COMPARISON_GAP'
  | 'AI_QUESTION_GAP'
  | 'AI_SOURCE_GAP'
  | 'AI_SUPPORTING_CONTENT_GAP';

export interface AiContentGap {
  kind: AiContentGapKind;
  topic: string;
  affectedPrompts: string[];
  targetUrl: string | null;
  decision: 'CREATE' | 'IMPROVE' | 'CONSOLIDATE';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  evidence: string[];
  competitorEvidence: string[];
  recommendedAction: string;
}

export function buildAiContentGaps(input: {
  topic: string;
  affectedPrompts: string[];
  targetUrl: string | null;
  competitorSources: string[];
  citationGap: boolean;
  comparisonGap: boolean;
  questionGap: boolean;
  supportGap: boolean;
}): AiContentGap[] {
  const gaps: AiContentGap[] = [];
  const base = {
    topic: input.topic,
    affectedPrompts: input.affectedPrompts,
    targetUrl: input.targetUrl,
    decision: (input.targetUrl
      ? 'IMPROVE'
      : 'CREATE') as 'CREATE' | 'IMPROVE',
    priority: (input.affectedPrompts.length >= 5
      ? 'HIGH'
      : input.affectedPrompts.length >= 2
        ? 'MEDIUM'
        : 'LOW') as 'HIGH' | 'MEDIUM' | 'LOW',
    evidence: [
      `${input.affectedPrompts.length} tracked prompt(s) affected.`,
    ],
    competitorEvidence: input.competitorSources.slice(0, 5),
    recommendedAction: input.targetUrl
      ? `Improve ${input.targetUrl} to answer ${input.affectedPrompts.length} prompt(s).`
      : `Create a page for "${input.topic}" covering ${input.affectedPrompts.length} prompt(s).`,
  };
  if (input.citationGap)
    gaps.push({ ...base, kind: 'AI_CITATION_GAP' });
  if (input.comparisonGap)
    gaps.push({ ...base, kind: 'AI_COMPARISON_GAP' });
  if (input.questionGap)
    gaps.push({ ...base, kind: 'AI_QUESTION_GAP' });
  if (input.supportGap)
    gaps.push({
      ...base,
      kind: 'AI_SUPPORTING_CONTENT_GAP',
    });
  if (
    !input.citationGap &&
    !input.comparisonGap &&
    !input.questionGap &&
    !input.supportGap
  ) {
    gaps.push({
      ...base,
      kind: input.competitorSources.length
        ? 'AI_SOURCE_GAP'
        : 'AI_CONTENT_GAP',
    });
  }
  return gaps;
}

/* ---------- AI opportunities (10 explainable) ---------- */

export type AiOpportunityKind =
  | 'HIGH_VALUE_PROMPT_GAP'
  | 'CITATION_GAP'
  | 'COMPETITOR_SOURCE_GAP'
  | 'CONTENT_GAP'
  | 'PAGE_GAP'
  | 'INTERNAL_LINK_GAP'
  | 'SOURCE_PR_GAP'
  | 'LOCAL_AI_GAP'
  | 'BRAND_ENTITY_GAP'
  | 'FRESHNESS_GAP';

export interface AiOpportunity {
  kind: AiOpportunityKind;
  title: string;
  prompt: string | null;
  topic: string | null;
  targetPage: string | null;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  why: string;
  evidence: string[];
  measurement: string;
}

export function buildAiOpportunities(input: {
  prompt: string;
  topic: string;
  targetPage: string | null;
  flags: Partial<Record<AiOpportunityKind, boolean>>;
  highValue: boolean;
}): AiOpportunity[] {
  const titles: Record<AiOpportunityKind, string> = {
    HIGH_VALUE_PROMPT_GAP: `Close high-value prompt gap for "${input.prompt}"`,
    CITATION_GAP: `Earn a citation for "${input.prompt}"`,
    COMPETITOR_SOURCE_GAP: `Reclaim source ground on "${input.topic}"`,
    CONTENT_GAP: `Cover "${input.topic}" for AI answers`,
    PAGE_GAP: `Create or fix the page behind "${input.prompt}"`,
    INTERNAL_LINK_GAP: `Support ${input.targetPage ?? input.topic} with internal links`,
    SOURCE_PR_GAP: `Build third-party source presence for "${input.topic}"`,
    LOCAL_AI_GAP: `Strengthen local evidence for "${input.prompt}"`,
    BRAND_ENTITY_GAP: `Clarify brand entity for "${input.topic}"`,
    FRESHNESS_GAP: `Refresh stale coverage of "${input.topic}"`,
  };
  const out: AiOpportunity[] = [];
  for (const [kind, on] of Object.entries(input.flags)) {
    if (!on) continue;
    const k = kind as AiOpportunityKind;
    out.push({
      kind: k,
      title: titles[k],
      prompt: input.prompt,
      topic: input.topic,
      targetPage: input.targetPage,
      priority: input.highValue ? 'HIGH' : 'MEDIUM',
      why: `${titles[k]} — evidence from tracked prompts and citations.`,
      evidence: [
        `Prompt: ${input.prompt}`,
        `Topic: ${input.topic}`,
      ],
      measurement:
        'Re-run the tracked prompt / citation observation after the action ships.',
    });
  }
  return out.slice(0, 10);
}

/* ---------- AI-enriched content brief ---------- */

export interface AiBriefEnrichment {
  targetPrompts: string[];
  answerIntent: string;
  questionsToAnswer: string[];
  competitorCitedSources: string[];
  citationPatterns: string[];
  entitiesToCover: string[];
  recommendedStructure: string[];
  faqOpportunities: string[];
  comparisonOpportunities: string[];
  internalLinks: string[];
  freshnessNote: string | null;
}

export function enrichBrief(input: {
  prompts: string[];
  intent: string;
  competitorSources: string[];
  topic: string;
  targetPage: string | null;
}): AiBriefEnrichment {
  const questions = input.prompts
    .slice(0, 8)
    .map((p) =>
      p.endsWith('?') ? p : `${p} — what should buyers know?`,
    );
  return {
    targetPrompts: input.prompts.slice(0, 10),
    answerIntent: input.intent,
    questionsToAnswer: questions,
    competitorCitedSources: input.competitorSources.slice(0, 5),
    citationPatterns: input.competitorSources.length
      ? [
          `Competitor sources appear for this topic: ${input.competitorSources.slice(0, 3).join(', ')}. Cover the same questions with first-party facts.`,
        ]
      : ['No competitor citation pattern recorded yet.'],
    entitiesToCover: [input.topic],
    recommendedStructure: [
      'Direct answer first (2–4 sentences, first-party facts).',
      'Supporting detail with structure (H2 per question).',
      'Comparison / FAQ where prompts demand it.',
      'Internal links to supporting pages.',
    ],
    faqOpportunities: questions.slice(0, 4),
    comparisonOpportunities: input.prompts
      .filter((p) => /vs|compare|alternative/i.test(p))
      .slice(0, 3),
    internalLinks: input.targetPage
      ? [input.targetPage]
      : [],
    freshnessNote: null,
  };
}

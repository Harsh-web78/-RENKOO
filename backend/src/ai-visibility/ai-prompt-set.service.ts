import { Injectable } from '@nestjs/common';

/*
 * =========================================================
 * AI PROMPT SETS 1.0 — deterministic, evidence-based,
 * bounded, deduplicated (Phase 6 / Phase 1).
 *
 * A prompt set is GENERATED from first-party evidence
 * only: tracked keywords + intents + topics, GSC queries,
 * SERP topics, business/category context, existing content
 * pages, competitor terms. Nothing is invented: unknown
 * fields stay UNKNOWN / UNAVAILABLE, businesses facts are
 * never guessed, and generation never calls a provider
 * (no billing, no credits — pure local composition).
 *
 * Persistence reuses AiVisibilityQuery (query + category
 * + isActive, unique per website). This file is the
 * generation + classification + dedupe layer; the
 * AiSearchIntelligenceService persists via the existing
 * createQuery path (AI_PROMPTS gate unchanged).
 * =========================================================
 */

export type AiPromptCategory =
  | 'INFORMATIONAL'
  | 'COMMERCIAL'
  | 'TRANSACTIONAL'
  | 'COMPARISON'
  | 'ALTERNATIVE'
  | 'PROBLEM_SOLUTION'
  | 'LOCAL'
  | 'BRAND'
  | 'CATEGORY'
  | 'EXPERTISE_TRUST';

export const AI_PROMPT_CATEGORIES: readonly AiPromptCategory[] =
  [
    'INFORMATIONAL',
    'COMMERCIAL',
    'TRANSACTIONAL',
    'COMPARISON',
    'ALTERNATIVE',
    'PROBLEM_SOLUTION',
    'LOCAL',
    'BRAND',
    'CATEGORY',
    'EXPERTISE_TRUST',
  ];

export type AiPromptStatus =
  | 'SUGGESTED'
  | 'TRACKED'
  | 'PAUSED';

export const UNKNOWN_VALUE = 'UNKNOWN';
export const UNAVAILABLE_VALUE = 'UNAVAILABLE';

/* Hard bounds: never generate thousands blindly. */
export const PROMPT_SET_DEFAULT_MAX = 60;
export const PROMPT_SET_HARD_MAX = 120;
export const PROMPT_SET_MIN = 1;

export interface PromptEvidenceKeyword {
  keyword: string;
  intent?: string | null;
  topic?: string | null;
  sourceUrl?: string | null;
  country?: string | null;
  language?: string | null;
}

export interface PromptEvidenceContent {
  url: string;
  topic?: string | null;
}

export interface PromptEvidenceBusiness {
  name?: string | null;
  category?: string | null;
  locations?: string[];
  offerings?: string[];
}

export interface GeneratedAiPrompt {
  text: string;
  intent: AiPromptCategory;
  topic: string;
  sourceKeyword: string | null;
  sourceUrl: string | null;
  country: string;
  language: string;
  evidenceSource: string;
  status: AiPromptStatus;
}

export interface PromptSetInput {
  keywords?: PromptEvidenceKeyword[];
  gscQueries?: string[];
  serpTopics?: string[];
  business?: PromptEvidenceBusiness;
  competitorTerms?: string[];
  existingContent?: PromptEvidenceContent[];
  maxPrompts?: number;
  defaultCountry?: string;
  defaultLanguage?: string;
}

const COMPARISON_HINTS = [
  ' vs ',
  ' versus ',
  ' vs. ',
  'compare',
  'comparison',
  'better than',
  'alternative to',
  'alternatives to',
];

const ALTERNATIVE_HINTS = [
  'alternative',
  'alternatives',
  'instead of',
  'replace',
  'replacement',
  'switch from',
];

const TRANSACTIONAL_HINTS = [
  'buy',
  'purchase',
  'pricing',
  'price',
  'cost',
  'quote',
  'demo',
  'trial',
  'sign up',
  'signup',
  'order',
  'hire',
  'book',
];

const COMMERCIAL_HINTS = [
  'best',
  'top',
  'review',
  'reviews',
  'rated',
  'recommend',
  'recommendation',
  'which ',
  'should i',
];

const LOCAL_HINTS = [
  'near me',
  'nearby',
  ' in ',
  'local',
  'city',
  'area',
  'location',
];

const PROBLEM_HINTS = [
  'how to',
  'how do',
  'why ',
  'fix',
  'solve',
  'problem',
  'issue',
  'error',
  'not working',
  'guide',
];

const BRAND_HINTS = [
  'brand',
  'company',
  'about us',
  'who is',
  'our ',
];

const EXPERTISE_HINTS = [
  'expert',
  'trust',
  'certified',
  'certification',
  'experience',
  'proven',
  'case study',
  'testimonial',
  'is it safe',
  'legit',
  'reliable',
];

export function normalizePromptText(
  value: unknown,
): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[?\s]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function promptIdentityKey(
  value: unknown,
): string {
  return normalizePromptText(value);
}

/*
 * Deterministic intent classification from hint
 * lists. Order matters: most specific first.
 * Never throws; unknown text is INFORMATIONAL only
 * when it carries real words, else UNKNOWN is
 * handled by callers via empty text rejection.
 */
export function classifyPromptIntent(
  text: unknown,
  businessName?: string | null,
): AiPromptCategory {
  const normalized = ` ${normalizePromptText(text)} `;

  if (!normalized.trim()) {
    return 'INFORMATIONAL';
  }

  if (
    COMPARISON_HINTS.some((hint) =>
      normalized.includes(hint),
    )
  ) {
    return 'COMPARISON';
  }

  if (
    ALTERNATIVE_HINTS.some((hint) =>
      normalized.includes(hint),
    )
  ) {
    return 'ALTERNATIVE';
  }

  if (
    TRANSACTIONAL_HINTS.some((hint) =>
      normalized.includes(hint),
    )
  ) {
    return 'TRANSACTIONAL';
  }

  if (
    COMMERCIAL_HINTS.some((hint) =>
      normalized.includes(hint),
    )
  ) {
    return 'COMMERCIAL';
  }

  if (
    LOCAL_HINTS.some((hint) =>
      normalized.includes(hint),
    )
  ) {
    return 'LOCAL';
  }

  if (
    PROBLEM_HINTS.some((hint) =>
      normalized.includes(hint),
    )
  ) {
    return 'PROBLEM_SOLUTION';
  }

  const brand = normalizePromptText(
    businessName ?? '',
  );

  if (
    (brand && normalized.includes(` ${brand} `)) ||
    BRAND_HINTS.some((hint) =>
      normalized.includes(hint),
    )
  ) {
    return 'BRAND';
  }

  if (
    EXPERTISE_HINTS.some((hint) =>
      normalized.includes(hint),
    )
  ) {
    return 'EXPERTISE_TRUST';
  }

  return 'INFORMATIONAL';
}

function cleanWord(value: unknown): string {
  return String(value ?? '').trim();
}

function clampMax(value: unknown): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return PROMPT_SET_DEFAULT_MAX;
  }

  return Math.min(
    PROMPT_SET_HARD_MAX,
    Math.max(PROMPT_SET_MIN, Math.floor(parsed)),
  );
}

function pushCandidate(
  out: GeneratedAiPrompt[],
  seen: Set<string>,
  candidate: GeneratedAiPrompt,
): void {
  const text = cleanWord(candidate.text);

  if (!text) {
    return;
  }

  const key = promptIdentityKey(text);

  if (!key || seen.has(key)) {
    return;
  }

  seen.add(key);
  out.push({ ...candidate, text });
}

function topicFor(
  keyword: PromptEvidenceKeyword,
): string {
  return (
    cleanWord(keyword.topic) ||
    cleanWord(keyword.keyword) ||
    UNKNOWN_VALUE
  );
}

/*
 * Bounded deterministic generation. Template order is
 * fixed (category coverage first, then volume), so the
 * same evidence always yields the same set. Every
 * prompt carries its evidence source; nothing claims a
 * business fact that was not supplied.
 */
export function generatePromptSet(
  input: PromptSetInput,
): GeneratedAiPrompt[] {
  const max = clampMax(input?.maxPrompts);
  const country = cleanWord(input?.defaultCountry) || 'US';
  const language =
    cleanWord(input?.defaultLanguage) || 'en';
  const business = input?.business ?? {};
  const businessName = cleanWord(business.name);
  const businessCategory = cleanWord(business.category);
  const locations = Array.isArray(business.locations)
    ? business.locations
        .map(cleanWord)
        .filter(Boolean)
        .slice(0, 5)
    : [];
  const offerings = Array.isArray(business.offerings)
    ? business.offerings
        .map(cleanWord)
        .filter(Boolean)
        .slice(0, 8)
    : [];

  const out: GeneratedAiPrompt[] = [];
  const seen = new Set<string>();

  const keywords = Array.isArray(input?.keywords)
    ? input.keywords.filter(
        (item) => cleanWord(item?.keyword),
      )
    : [];

  /* 1. One prompt per evidence keyword (verbatim). */
  for (const item of keywords) {
    if (out.length >= max) {
      break;
    }

    const keyword = cleanWord(item.keyword);

    pushCandidate(out, seen, {
      text: keyword,
      intent: classifyPromptIntent(
        keyword,
        businessName || null,
      ),
      topic: topicFor(item),
      sourceKeyword: keyword,
      sourceUrl: cleanWord(item.sourceUrl) || null,
      country: cleanWord(item.country) || country,
      language: cleanWord(item.language) || language,
      evidenceSource: 'TRACKED_KEYWORD',
      status: 'SUGGESTED',
    });
  }

  /* 2. GSC queries not already covered. */
  const gscQueries = Array.isArray(input?.gscQueries)
    ? input.gscQueries.map(cleanWord).filter(Boolean)
    : [];

  for (const query of gscQueries) {
    if (out.length >= max) {
      break;
    }

    pushCandidate(out, seen, {
      text: query,
      intent: classifyPromptIntent(
        query,
        businessName || null,
      ),
      topic: query,
      sourceKeyword: query,
      sourceUrl: null,
      country,
      language,
      evidenceSource: 'GSC_QUERY',
      status: 'SUGGESTED',
    });
  }

  /* 3. Category templates from offerings (bounded). */
  const subject =
    businessName || businessCategory || null;

  if (subject) {
    const templates: Array<{
      build: (offering: string) => string;
      intent: AiPromptCategory;
      source: string;
    }> = [
      {
        build: (offering) =>
          `What is the best ${offering} for a ${subject} customer?`,
        intent: 'COMMERCIAL',
        source: 'BUSINESS_OFFERING',
      },
      {
        build: (offering) =>
          `How do I choose ${offering} for ${subject}?`,
        intent: 'PROBLEM_SOLUTION',
        source: 'BUSINESS_OFFERING',
      },
      {
        build: (offering) =>
          `${offering} vs alternatives for ${subject}`,
        intent: 'COMPARISON',
        source: 'BUSINESS_OFFERING',
      },
    ];

    for (const offering of offerings) {
      for (const template of templates) {
        if (out.length >= max) {
          break;
        }

        pushCandidate(out, seen, {
          text: template.build(offering),
          intent: template.intent,
          topic: offering,
          sourceKeyword: null,
          sourceUrl: null,
          country,
          language,
          evidenceSource: template.source,
          status: 'SUGGESTED',
        });
      }

      if (out.length >= max) {
        break;
      }
    }
  }

  /* 4. Local prompts from real locations only. */
  for (const location of locations) {
    if (out.length >= max) {
      break;
    }

    const base = businessCategory || subject;

    if (!base) {
      break;
    }

    pushCandidate(out, seen, {
      text: `Best ${base} in ${location}`,
      intent: 'LOCAL',
      topic: base,
      sourceKeyword: null,
      sourceUrl: null,
      country,
      language,
      evidenceSource: 'BUSINESS_LOCATION',
      status: 'SUGGESTED',
    });
  }

  /* 5. SERP topics as informational prompts. */
  const serpTopics = Array.isArray(input?.serpTopics)
    ? input.serpTopics.map(cleanWord).filter(Boolean)
    : [];

  for (const topic of serpTopics) {
    if (out.length >= max) {
      break;
    }

    pushCandidate(out, seen, {
      text: topic,
      intent: classifyPromptIntent(
        topic,
        businessName || null,
      ),
      topic,
      sourceKeyword: null,
      sourceUrl: null,
      country,
      language,
      evidenceSource: 'SERP_TOPIC',
      status: 'SUGGESTED',
    });
  }

  /* 6. Competitor terms as comparison prompts. */
  const competitorTerms = Array.isArray(
    input?.competitorTerms,
  )
    ? input.competitorTerms
        .map(cleanWord)
        .filter(Boolean)
        .slice(0, 10)
    : [];

  for (const term of competitorTerms) {
    if (out.length >= max) {
      break;
    }

    const text = subject
      ? `${subject} vs ${term}`
      : `${term} alternatives`;

    pushCandidate(out, seen, {
      text,
      intent: subject ? 'COMPARISON' : 'ALTERNATIVE',
      topic: term,
      sourceKeyword: null,
      sourceUrl: null,
      country,
      language,
      evidenceSource: 'COMPETITOR_TERM',
      status: 'SUGGESTED',
    });
  }

  /* 7. Existing content pages as brand/expertise prompts. */
  const pages = Array.isArray(input?.existingContent)
    ? input.existingContent.filter((item) =>
        cleanWord(item?.url),
      )
    : [];

  for (const page of pages.slice(0, 10)) {
    if (out.length >= max) {
      break;
    }

    const topic =
      cleanWord(page.topic) || UNKNOWN_VALUE;

    if (topic === UNKNOWN_VALUE) {
      continue;
    }

    pushCandidate(out, seen, {
      text: `What should I know about ${topic}?`,
      intent: 'INFORMATIONAL',
      topic,
      sourceKeyword: null,
      sourceUrl: cleanWord(page.url) || null,
      country,
      language,
      evidenceSource: 'EXISTING_CONTENT',
      status: 'SUGGESTED',
    });
  }

  return out;
}

export function dedupePrompts(
  prompts: GeneratedAiPrompt[],
): GeneratedAiPrompt[] {
  const seen = new Set<string>();
  const out: GeneratedAiPrompt[] = [];

  for (const prompt of prompts) {
    const key = promptIdentityKey(prompt?.text);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    out.push(prompt);
  }

  return out;
}

export function countPromptsByIntent(
  prompts: GeneratedAiPrompt[],
): Record<AiPromptCategory, number> {
  const counts = Object.fromEntries(
    AI_PROMPT_CATEGORIES.map((category) => [
      category,
      0,
    ]),
  ) as Record<AiPromptCategory, number>;

  for (const prompt of prompts) {
    if (
      prompt?.intent &&
      counts[prompt.intent] !== undefined
    ) {
      counts[prompt.intent] += 1;
    }
  }

  return counts;
}

@Injectable()
export class AiPromptSetService {
  generate(input: PromptSetInput): GeneratedAiPrompt[] {
    return generatePromptSet(input);
  }

  classify(
    text: unknown,
    businessName?: string | null,
  ): AiPromptCategory {
    return classifyPromptIntent(text, businessName);
  }

  dedupe(
    prompts: GeneratedAiPrompt[],
  ): GeneratedAiPrompt[] {
    return dedupePrompts(prompts);
  }
}

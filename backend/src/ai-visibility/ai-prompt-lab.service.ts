/*
 * =========================================================
 * PROMPT INTELLIGENCE + PROMPT LAB 1.0
 * (Phase 6 / Parts 3 + 4).
 *
 * Generates prompts ONLY from the user's real business /
 * search universe (keywords, GSC queries, SERP topics,
 * content pages, competitors, Business Brain). 14
 * archetypes, journey stages, evidence-stamped reasons,
 * aggressive dedupe, topic clustering, plan-bounded
 * volume, and 11 Prompt Lab groups. Pure functions —
 * no DB, no provider calls, no billing.
 * =========================================================
 */

export type AiPromptArchetype =
  | 'INFORMATIONAL'
  | 'COMMERCIAL'
  | 'TRANSACTIONAL'
  | 'COMPARISON'
  | 'ALTERNATIVE'
  | 'PROBLEM_SOLUTION'
  | 'LOCAL'
  | 'BRAND'
  | 'CATEGORY'
  | 'EXPERTISE'
  | 'TRUST'
  | 'RESEARCH'
  | 'EVALUATION'
  | 'BUYING';

export const AI_PROMPT_ARCHETYPES: readonly AiPromptArchetype[] =
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
    'EXPERTISE',
    'TRUST',
    'RESEARCH',
    'EVALUATION',
    'BUYING',
  ];

export type AiJourneyStage =
  | 'AWARENESS'
  | 'CONSIDERATION'
  | 'DECISION'
  | 'RETENTION'
  | 'UNKNOWN';

export type AiPromptGroup =
  | 'CORE'
  | 'COMMERCIAL'
  | 'COMPARISON'
  | 'COMPETITOR'
  | 'PROBLEM'
  | 'LOCAL'
  | 'BRAND'
  | 'CATEGORY'
  | 'HIGH_VALUE'
  | 'CONTENT_GAP'
  | 'AI_OPPORTUNITY';

export const AI_PROMPT_GROUPS: readonly AiPromptGroup[] =
  [
    'CORE',
    'COMMERCIAL',
    'COMPARISON',
    'COMPETITOR',
    'PROBLEM',
    'LOCAL',
    'BRAND',
    'CATEGORY',
    'HIGH_VALUE',
    'CONTENT_GAP',
    'AI_OPPORTUNITY',
  ];

export interface LabPrompt {
  prompt: string;
  intent: AiPromptArchetype;
  topic: string;
  sourceKeyword: string | null;
  sourcePage: string | null;
  country: string;
  language: string;
  journeyStage: AiJourneyStage;
  evidenceSource: string;
  generationReason: string;
  status: 'SUGGESTED' | 'TRACKED' | 'PAUSED';
  groups: AiPromptGroup[];
}

export interface PromptUniverseInput {
  keywords: Array<{
    keyword: string;
    intent?: string | null;
    topic?: string | null;
    pageUrl?: string | null;
    impressions?: number | null;
  }>;
  gscQueries?: string[];
  serpTopics?: string[];
  competitorTerms?: string[];
  contentPages?: Array<{
    url: string;
    topic?: string | null;
  }>;
  business?: {
    name?: string | null;
    category?: string | null;
    locations?: string[];
    services?: string[];
    products?: string[];
    audience?: string | null;
  } | null;
  country?: string;
  language?: string;
  maxPrompts?: number;
}

export const LAB_HARD_MAX = 150;
export const LAB_DEFAULT_MAX = 60;

function clean(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function identityOf(prompt: string): string {
  return clean(prompt).toLowerCase();
}

function topicOf(keyword: string): string {
  const words = clean(keyword)
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
  return words.slice(0, 3).join(' ') || 'general';
}

const STOP = new Set([
  'what',
  'best',
  'with',
  'your',
  'from',
  'that',
  'this',
  'have',
  'more',
  'than',
  'when',
  'which',
  'their',
  'there',
  'about',
  'into',
]);

export function classifyArchetype(
  prompt: string,
): AiPromptArchetype {
  const p = clean(prompt).toLowerCase();
  if (/\bvs\b|versus|compare|comparison/.test(p))
    return 'COMPARISON';
  if (/alternative|instead of|replace/.test(p))
    return 'ALTERNATIVE';
  if (/best|top \d|review|worth it|is .* worth/.test(p))
    return 'COMMERCIAL';
  if (/buy|price|pricing|cost|demo|trial|quote/.test(p))
    return p.includes('best') ||
      p.includes('compare')
      ? 'EVALUATION'
      : 'TRANSACTIONAL';
  if (/how to|fix|solve|problem|why.*not|struggling/.test(p))
    return 'PROBLEM_SOLUTION';
  if (/near me|in [a-z ]+$|local|nearby/.test(p))
    return 'LOCAL';
  if (/who provides|who.*best|trust|reliable|legit|scam/.test(p))
    return 'TRUST';
  if (/expert|guide|framework|research|study|data|benchmark/.test(p))
    return p.includes('research') ||
      p.includes('study')
      ? 'RESEARCH'
      : 'EXPERTISE';
  if (/should i|which.*should|evaluate|evaluation|pros and cons/.test(p))
    return 'EVALUATION';
  if (/for (agencies|startups|teams|enterprise|small business)/.test(p))
    return 'BUYING';
  if (/what is|how does|why does|explain/.test(p))
    return 'INFORMATIONAL';
  return 'CATEGORY';
}

export function journeyFor(
  intent: AiPromptArchetype,
): AiJourneyStage {
  switch (intent) {
    case 'INFORMATIONAL':
    case 'RESEARCH':
    case 'EXPERTISE':
      return 'AWARENESS';
    case 'COMMERCIAL':
    case 'COMPARISON':
    case 'ALTERNATIVE':
    case 'PROBLEM_SOLUTION':
    case 'CATEGORY':
      return 'CONSIDERATION';
    case 'TRANSACTIONAL':
    case 'EVALUATION':
    case 'BUYING':
    case 'BRAND':
      return 'DECISION';
    case 'LOCAL':
    case 'TRUST':
      return 'CONSIDERATION';
    default:
      return 'UNKNOWN';
  }
}

function groupsFor(
  intent: AiPromptArchetype,
  opts: {
    competitorBacked: boolean;
    highValue: boolean;
    contentGap: boolean;
  },
): AiPromptGroup[] {
  const groups = new Set<AiPromptGroup>(['CORE']);
  if (
    intent === 'COMMERCIAL' ||
    intent === 'TRANSACTIONAL' ||
    intent === 'BUYING' ||
    intent === 'EVALUATION'
  ) {
    groups.add('COMMERCIAL');
  }
  if (
    intent === 'COMPARISON' ||
    intent === 'ALTERNATIVE'
  ) {
    groups.add('COMPARISON');
  }
  if (opts.competitorBacked) groups.add('COMPETITOR');
  if (intent === 'PROBLEM_SOLUTION')
    groups.add('PROBLEM');
  if (intent === 'LOCAL') groups.add('LOCAL');
  if (intent === 'BRAND') groups.add('BRAND');
  if (intent === 'CATEGORY' || intent === 'RESEARCH')
    groups.add('CATEGORY');
  if (opts.highValue) groups.add('HIGH_VALUE');
  if (opts.contentGap) groups.add('CONTENT_GAP');
  if (opts.highValue && opts.competitorBacked)
    groups.add('AI_OPPORTUNITY');
  return [...groups];
}

function templateVariants(
  keyword: string,
  businessName: string | null,
): Array<{ text: string; intent: AiPromptArchetype }> {
  const kw = clean(keyword);
  if (!kw) return [];
  const out: Array<{
    text: string;
    intent: AiPromptArchetype;
  }> = [
    { text: `What is the best way to choose ${kw}?`, intent: 'INFORMATIONAL' },
    { text: `Best ${kw} for growing businesses`, intent: 'COMMERCIAL' },
    { text: `${kw} vs alternatives — which should I pick?`, intent: 'COMPARISON' },
    { text: `How to solve ${kw} problems step by step`, intent: 'PROBLEM_SOLUTION' },
  ];
  if (businessName) {
    out.push({
      text: `Is ${businessName} a good choice for ${kw}?`,
      intent: 'BRAND',
    });
  }
  return out;
}

/*
 * Deterministic universe generation. Every prompt names
 * its evidence: "Generated from GSC query + commercial
 * intent" — never "AI generated this".
 */
export function generatePromptUniverse(
  input: PromptUniverseInput,
): LabPrompt[] {
  const country = clean(input.country) || 'US';
  const language = clean(input.language) || 'en';
  const max = Math.min(
    Math.max(input.maxPrompts ?? LAB_DEFAULT_MAX, 1),
    LAB_HARD_MAX,
  );
  const businessName = clean(
    input.business?.name ?? '',
  );
  const seen = new Map<string, LabPrompt>();
  const push = (p: LabPrompt) => {
    const key = identityOf(p.prompt);
    if (!key || seen.has(key)) return;
    if (seen.size >= max) return;
    seen.set(key, p);
  };

  const keywords = (input.keywords ?? [])
    .map((k) => ({
      keyword: clean(k.keyword),
      intent: k.intent,
      topic: clean(k.topic) || topicOf(k.keyword),
      pageUrl: clean(k.pageUrl) || null,
      impressions: Number(k.impressions) || 0,
    }))
    .filter((k) => k.keyword);

  for (const k of keywords.slice(0, 40)) {
    const variants = templateVariants(
      k.keyword,
      businessName || null,
    );
    for (const v of variants) {
      const intent = classifyArchetype(v.text);
      const highValue = k.impressions >= 1000;
      push({
        prompt: v.text,
        intent,
        topic: k.topic,
        sourceKeyword: k.keyword,
        sourcePage: k.pageUrl,
        country,
        language,
        journeyStage: journeyFor(intent),
        evidenceSource: 'keyword-universe',
        generationReason: `Generated from tracked keyword "${k.keyword}" + ${intent.toLowerCase()} intent.`,
        status: 'SUGGESTED',
        groups: groupsFor(intent, {
          competitorBacked: false,
          highValue,
          contentGap: !k.pageUrl,
        }),
      });
    }
  }

  for (const q of (input.gscQueries ?? [])
    .map(clean)
    .filter(Boolean)
    .slice(0, 20)) {
    const intent = classifyArchetype(q);
    push({
      prompt: q,
      intent,
      topic: topicOf(q),
      sourceKeyword: q,
      sourcePage: null,
      country,
      language,
      journeyStage: journeyFor(intent),
      evidenceSource: 'GSC-query',
      generationReason: `Generated from GSC query "${q}" + ${intent.toLowerCase()} intent.`,
      status: 'SUGGESTED',
      groups: groupsFor(intent, {
        competitorBacked: false,
        highValue: true,
        contentGap: false,
      }),
    });
  }

  for (const term of (input.competitorTerms ?? [])
    .map(clean)
    .filter(Boolean)
    .slice(0, 15)) {
    const text = `${term} alternatives compared`;
    const intent: AiPromptArchetype = 'ALTERNATIVE';
    push({
      prompt: text,
      intent,
      topic: topicOf(term),
      sourceKeyword: term,
      sourcePage: null,
      country,
      language,
      journeyStage: journeyFor(intent),
      evidenceSource: 'competitor-SERP',
      generationReason: `Generated from competitor SERP term "${term}" + alternative intent.`,
      status: 'SUGGESTED',
      groups: groupsFor(intent, {
        competitorBacked: true,
        highValue: false,
        contentGap: true,
      }),
    });
  }

  for (const page of (input.contentPages ?? []).slice(
    0,
    15,
  )) {
    const url = clean(page.url);
    if (!url) continue;
    const topic = clean(page.topic) || 'site content';
    const text = `What does the page about ${topic} explain best?`;
    const intent = classifyArchetype(text);
    push({
      prompt: text,
      intent,
      topic,
      sourceKeyword: null,
      sourcePage: url,
      country,
      language,
      journeyStage: journeyFor(intent),
      evidenceSource: 'site-content',
      generationReason: `Generated from site content ${url} + topic "${topic}".`,
      status: 'SUGGESTED',
      groups: groupsFor(intent, {
        competitorBacked: false,
        highValue: false,
        contentGap: false,
      }),
    });
  }

  return [...seen.values()];
}

export function dedupeLabPrompts(
  prompts: LabPrompt[],
): LabPrompt[] {
  const byId = new Map<string, LabPrompt>();
  for (const p of prompts) {
    const key = identityOf(p.prompt);
    if (!key) continue;
    if (!byId.has(key)) byId.set(key, { ...p });
  }
  return [...byId.values()];
}

/* Topic clusters: prompts sharing a topic stem. */
export function clusterLabPrompts(
  prompts: LabPrompt[],
): Array<{ topic: string; prompts: LabPrompt[] }> {
  const byTopic = new Map<string, LabPrompt[]>();
  for (const p of prompts) {
    const key = clean(p.topic).toLowerCase() || 'general';
    const list = byTopic.get(key) ?? [];
    list.push(p);
    byTopic.set(key, list);
  }
  return [...byTopic.entries()]
    .map(([topic, list]) => ({ topic, prompts: list }))
    .sort((a, b) => b.prompts.length - a.prompts.length);
}

export interface LabFilter {
  query?: string;
  intent?: AiPromptArchetype | null;
  topic?: string | null;
  stage?: AiJourneyStage | null;
  group?: AiPromptGroup | null;
  competitor?: string | null;
  visibilityState?: string | null;
  visibilityByPrompt?: Record<string, string>;
}

export function filterLabPrompts(
  prompts: LabPrompt[],
  filter: LabFilter,
): LabPrompt[] {
  const q = clean(filter.query).toLowerCase();
  return prompts.filter((p) => {
    if (
      filter.intent &&
      p.intent !== filter.intent
    )
      return false;
    if (
      filter.topic &&
      clean(p.topic).toLowerCase() !==
        clean(filter.topic).toLowerCase()
    )
      return false;
    if (filter.stage && p.journeyStage !== filter.stage)
      return false;
    if (filter.group && !p.groups.includes(filter.group))
      return false;
    if (
      filter.competitor &&
      !p.generationReason
        .toLowerCase()
        .includes(clean(filter.competitor).toLowerCase()) &&
      !(p.sourceKeyword ?? '')
        .toLowerCase()
        .includes(clean(filter.competitor).toLowerCase())
    )
      return false;
    if (filter.visibilityState) {
      const state =
        filter.visibilityByPrompt?.[identityOf(p.prompt)] ??
        'UNKNOWN';
      if (state !== filter.visibilityState) return false;
    }
    if (
      q &&
      !(
        p.prompt.toLowerCase().includes(q) ||
        p.topic.toLowerCase().includes(q)
      )
    )
      return false;
    return true;
  });
}

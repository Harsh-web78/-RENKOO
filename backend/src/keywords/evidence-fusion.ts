/*
 * =========================================================
 * EVIDENCE FUSION 1.0 — pure composition (Phase 8E).
 *
 * ONE additive evidence representation for cross-system
 * decisions. No new score, no new priority system, no
 * duplicated Strategy/Diagnosis/Roadmap/Content/Crawl/
 * AI logic: this file only assembles existing evidence
 * into explainable decisions.
 *
 * Bands reused: HIGH/MEDIUM/LOW everywhere.
 * States reused: VERIFIED/OBSERVED/INFERRED/ESTIMATED/
 * UNAVAILABLE. UNAVAILABLE is never zero; inference is
 * labeled ("Evidence suggests"), never fact.
 * =========================================================
 */

export type FusionSource =
  | 'GSC'
  | 'SEARCH_BASELINE'
  | 'KEYWORD'
  | 'SERP'
  | 'CRAWL'
  | 'CRAWL_LINK'
  | 'CONTENT'
  | 'AI_VISIBILITY'
  | 'AI_MONITORING'
  | 'OFFICIAL_AI'
  | 'AI_AGENT_LOG'
  | 'STRATEGY'
  | 'DIAGNOSIS';

export type FusionState =
  | 'VERIFIED'
  | 'OBSERVED'
  | 'INFERRED'
  | 'ESTIMATED'
  | 'UNAVAILABLE';

export interface FusedEvidence {
  source: FusionSource;
  state: FusionState;
  keyword: string | null;
  page: string | null;
  prompt: string | null;
  topic: string | null;
  window: string | null;
  summary: string;
}

export const MAX_EVIDENCE_PER_DECISION = 12;

const STATE_RANK: Record<FusionState, number> = {
  VERIFIED: 0,
  OBSERVED: 1,
  INFERRED: 2,
  ESTIMATED: 3,
  UNAVAILABLE: 4,
};

export function evidence(
  source: FusionSource,
  state: FusionState,
  summary: string,
  subject: {
    keyword?: string | null;
    page?: string | null;
    prompt?: string | null;
    topic?: string | null;
    window?: string | null;
  } = {},
): FusedEvidence {
  return {
    source,
    state,
    keyword: subject.keyword ?? null,
    page: subject.page ?? null,
    prompt: subject.prompt ?? null,
    topic: subject.topic ?? null,
    window: subject.window ?? null,
    summary: summary.slice(0, 280),
  };
}

export function unavailable(
  source: FusionSource,
  summary: string,
): FusedEvidence {
  return evidence(source, 'UNAVAILABLE', summary);
}

/* ---------- next best action ---------- */

export type ActionCategory =
  | 'IMPROVE_EXISTING_PAGE'
  | 'CREATE_CONTENT'
  | 'CONSOLIDATE_CONTENT'
  | 'INTERNAL_LINK'
  | 'FIX_TECHNICAL'
  | 'IMPROVE_AI_CITABILITY'
  | 'IMPROVE_AI_VISIBILITY'
  | 'FIX_AI_AGENT_ACCESS'
  | 'PROTECT_WINNING_PAGE'
  | 'MONITOR_CHANGE';

export interface ActionCandidate {
  id: string;
  category: ActionCategory;
  title: string;
  keyword: string | null;
  targetPage: string | null;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  evidence: FusedEvidence[];
  recommendationId: string | null;
  recommendationStatus: string | null;
  actionId: string | null;
  actionStatus: string | null;
  order: number;
}

const PRIORITY_RANK: Record<string, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

/*
 * Existing recommendation/roadmap types → the ten
 * decision categories. Unknown types fall back by
 * source (AI recs → AI visibility) or to monitoring.
 * Nothing new is persisted; mapping only.
 */
export function categoryFor(
  type: string,
  source: string,
): ActionCategory {
  const t = String(type ?? '').toUpperCase();
  const src = String(source ?? '').toUpperCase();
  if (
    t.includes('AGENT_ACCESS') ||
    t.includes('AGENT_403') ||
    t.includes('AGENT_5XX')
  ) {
    return 'FIX_AI_AGENT_ACCESS';
  }
  if (
    t.includes('CITATION_GAP') ||
    t.includes('SOURCE_GAP')
  ) {
    return 'IMPROVE_AI_CITABILITY';
  }
  if (
    t.includes('AI_VISIBILITY') ||
    t.includes('AI_CONTENT_GAP') ||
    t.includes('AI_OPPORTUNITY') ||
    t.includes('PROMPT_GAP')
  ) {
    return 'IMPROVE_AI_VISIBILITY';
  }
  if (
    t.includes('TECHNICAL') ||
    t.includes('BLOCKER')
  ) {
    return 'FIX_TECHNICAL';
  }
  if (
    t.includes('INTERNAL_LINK') ||
    t.includes('ORPHAN') ||
    t.includes('SUPPORTING')
  ) {
    return 'INTERNAL_LINK';
  }
  if (
    t.includes('CONSOLIDAT') ||
    t.includes('CANNIBAL')
  ) {
    return 'CONSOLIDATE_CONTENT';
  }
  if (
    t.includes('CREATE') ||
    t.includes('CONTENT_GAP') ||
    t.includes('PAGE_GAP')
  ) {
    return 'CREATE_CONTENT';
  }
  if (t.includes('PROTECT')) {
    return 'PROTECT_WINNING_PAGE';
  }
  if (
    t.includes('MONITOR') ||
    t.includes('TRACK') ||
    t.includes('IGNORE')
  ) {
    return 'MONITOR_CHANGE';
  }
  if (
    t.includes('IMPROVE') ||
    t.includes('OPTIMIZ') ||
    t.includes('REFRESH') ||
    t.includes('QUICK_WIN') ||
    t.includes('GROWTH')
  ) {
    return 'IMPROVE_EXISTING_PAGE';
  }
  if (src === 'AI_VISIBILITY') {
    return 'IMPROVE_AI_VISIBILITY';
  }
  if (src === 'CONTENT') return 'IMPROVE_EXISTING_PAGE';
  return 'MONITOR_CHANGE';
}

function candidateKey(candidate: ActionCandidate): string {
  return [
    candidate.category,
    (candidate.targetPage ?? '').toLowerCase(),
    (candidate.keyword ?? '').toLowerCase(),
  ].join('|');
}

export function dedupeCandidates(
  candidates: ActionCandidate[],
): ActionCandidate[] {
  const byKey = new Map<string, ActionCandidate>();
  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...candidate });
      continue;
    }
    for (const item of candidate.evidence) {
      const signature = `${item.source}|${item.summary}`;
      if (
        !existing.evidence.some(
          (current) =>
            `${current.source}|${current.summary}` ===
            signature,
        )
      ) {
        existing.evidence.push(item);
      }
    }
    if (
      PRIORITY_RANK[candidate.priority] <
      PRIORITY_RANK[existing.priority]
    ) {
      existing.priority = candidate.priority;
      existing.title = candidate.title;
    }
    if (!existing.recommendationId && candidate.recommendationId) {
      existing.recommendationId =
        candidate.recommendationId;
      existing.recommendationStatus =
        candidate.recommendationStatus;
    }
    if (!existing.actionId && candidate.actionId) {
      existing.actionId = candidate.actionId;
      existing.actionStatus = candidate.actionStatus;
    }
  }
  return [...byKey.values()];
}

/*
 * Deterministic selection over existing bands only:
 * priority band → evidence strength (strongest cited
 * state) → roadmap/source order → stable id. No score.
 */
export function selectNextBestAction(
  candidates: ActionCandidate[],
): ActionCandidate | null {
  const deduped = dedupeCandidates(candidates).filter(
    (candidate) =>
      candidate.actionStatus !== 'DONE' &&
      candidate.actionStatus !== 'DISMISSED' &&
      candidate.recommendationStatus !== 'COMPLETED' &&
      candidate.recommendationStatus !== 'DISMISSED',
  );
  if (deduped.length === 0) return null;
  const strength = (candidate: ActionCandidate) =>
    candidate.evidence.length === 0
      ? 99
      : Math.min(
          ...candidate.evidence.map(
            (item) => STATE_RANK[item.state],
          ),
        );
  return (
    [...deduped].sort((a, b) => {
      const priority =
        (PRIORITY_RANK[a.priority] ?? 2) -
        (PRIORITY_RANK[b.priority] ?? 2);
      if (priority !== 0) return priority;
      const evidence = strength(a) - strength(b);
      if (evidence !== 0) return evidence;
      if (a.order !== b.order) return a.order - b.order;
      return a.id < b.id ? -1 : 1;
    })[0] ?? null
  );
}

export function whyForAction(
  action: ActionCandidate,
): string {
  const bits: string[] = [];
  for (const item of action.evidence.slice(
    0,
    MAX_EVIDENCE_PER_DECISION,
  )) {
    if (item.state === 'UNAVAILABLE') continue;
    bits.push(
      `${item.source}: ${item.summary}`,
    );
  }
  const reason =
    bits.length > 0
      ? bits.join(' ')
      : 'Prioritized from existing strategy evidence.';
  const missing = action.evidence
    .filter((item) => item.state === 'UNAVAILABLE')
    .slice(0, 2)
    .map((item) => item.summary);
  return (
    reason +
    (missing.length > 0 ? ` ${missing.join(' ')}` : '')
  ).slice(0, 1200);
}

/* ---------- measurement mapping ---------- */

export function measurementFor(
  category: ActionCategory,
): string {
  switch (category) {
    case 'IMPROVE_EXISTING_PAGE':
    case 'CREATE_CONTENT':
    case 'CONSOLIDATE_CONTENT':
    case 'PROTECT_WINNING_PAGE':
      return 'Monitor GSC clicks/impressions/position for the target keyword and page.';
    case 'INTERNAL_LINK':
      return 'Re-crawl and verify the source→target edge, then watch GSC for the target page.';
    case 'FIX_TECHNICAL':
      return 'Re-crawl and verify issue resolution; confirm eligibility in crawl evidence.';
    case 'IMPROVE_AI_CITABILITY':
    case 'IMPROVE_AI_VISIBILITY':
      return 'Rerun tracked prompts and compare mention/citation observations against this baseline.';
    case 'FIX_AI_AGENT_ACCESS':
      return 'Observe future log requests for 2xx recovery; absence of requests is not proof of non-access.';
    default:
      return 'Keep monitoring; compare the next window against this baseline.';
  }
}

/* ---------- Why-Not-AI 2.0 (composition) ---------- */

export type WhyNotAi2Class =
  | 'AI_VISIBILITY_GAP'
  | 'AI_CITATION_GAP'
  | 'CONTENT_GAP'
  | 'ENTITY_COVERAGE_GAP'
  | 'INTERNAL_LINK_GAP'
  | 'TECHNICAL_ACCESS_GAP'
  | 'AI_AGENT_ACCESS_SIGNAL'
  | 'INSUFFICIENT_EVIDENCE';

export interface WhyNotAi2Input {
  brandMentioned: boolean | null;
  brandCited: boolean | null;
  promptsTracked: number;
  observations: number;
  contentCoversTopic: boolean | null;
  entityCovered: boolean | null;
  internalLinksSupport: boolean | null;
  pageCrawlable: boolean | null;
  pageIndexable: boolean | null;
  agentAccessSignal: 'ERROR' | 'NOT_OBSERVED' | 'OK' | null;
  officialEvidence: boolean;
}

export interface WhyNotAi2 {
  class: WhyNotAi2Class;
  headline: string;
  evidence: FusedEvidence[];
  primaryGap: string | null;
}

export function diagnoseWhyNotAi2(
  input: WhyNotAi2Input,
  evidence: FusedEvidence[],
): WhyNotAi2 {
  const pick = (
    cls: WhyNotAi2Class,
    headline: string,
    primaryGap: string | null = null,
  ): WhyNotAi2 => ({
    class: cls,
    headline,
    evidence: evidence.slice(
      0,
      MAX_EVIDENCE_PER_DECISION,
    ),
    primaryGap,
  });
  if (
    input.observations === 0 ||
    input.promptsTracked === 0
  ) {
    return pick(
      'INSUFFICIENT_EVIDENCE',
      'No tracked prompts or recorded observations exist for this topic yet — nothing to diagnose.',
    );
  }
  if (input.pageCrawlable === false) {
    return pick(
      'TECHNICAL_ACCESS_GAP',
      'The page cannot be crawled, so it cannot serve as an AI source in its current state.',
      'PAGE_CRAWLABLE',
    );
  }
  if (input.pageIndexable === false) {
    return pick(
      'TECHNICAL_ACCESS_GAP',
      'The page is not indexable, so search and AI surfaces cannot use it.',
      'PAGE_INDEXABLE',
    );
  }
  if (input.contentCoversTopic === false) {
    return pick(
      'CONTENT_GAP',
      'No site page covers the prompt topic, so there is nothing for AI answers to cite.',
      'TOPIC_COVERED',
    );
  }
  if (
    input.brandMentioned === true &&
    input.brandCited === false
  ) {
    return pick(
      'AI_CITATION_GAP',
      'The brand is mentioned in observed answers but none of its pages are cited as a source.',
      'CITATION_GAP',
    );
  }
  if (input.brandMentioned === false) {
    return pick(
      'AI_VISIBILITY_GAP',
      'The brand was not mentioned across recorded observations for these prompts.',
      'VISIBILITY_GAP',
    );
  }
  if (input.entityCovered === false) {
    return pick(
      'ENTITY_COVERAGE_GAP',
      'The brand entity and key facts are not covered clearly enough on the relevant pages.',
      'BRAND_ENTITY_GAP',
    );
  }
  if (input.internalLinksSupport === false) {
    return pick(
      'INTERNAL_LINK_GAP',
      'No supporting internal links reinforce the relevant page for these prompts.',
      'INTERNAL_LINK_SUPPORT',
    );
  }
  if (input.agentAccessSignal === 'ERROR') {
    return pick(
      'AI_AGENT_ACCESS_SIGNAL',
      'Observed AI-agent requests indicate an access signal (repeated error responses) in the available logs.',
      'AGENT_ACCESS',
    );
  }
  if (input.agentAccessSignal === 'NOT_OBSERVED') {
    return pick(
      'AI_AGENT_ACCESS_SIGNAL',
      'Your page has not yet shown an observed AI-agent request in the available logs — not proof AI cannot see it.',
      'AGENT_ACCESS',
    );
  }
  return pick(
    'INSUFFICIENT_EVIDENCE',
    'Recorded evidence does not isolate a single cause; keep monitoring.',
  );
}

/* ---------- rank history sentence ---------- */

export function rankHistorySentence(
  rows: Array<{
    position: number | null;
    source: string;
  }>,
): string {
  const trail = rows
    .filter((row) => row.position !== null)
    .map((row) => row.position as number);
  if (trail.length === 0) {
    return 'Rank observations exist but carry no positions.';
  }
  const current = trail[trail.length - 1];
  const source =
    rows[rows.length - 1].source === 'GSC'
      ? 'window-average position'
      : 'observed position';
  if (trail.length === 1) {
    return `Observed ranking at ${source} ${current}.`;
  }
  const previous = trail[trail.length - 2];
  if (current === previous) {
    return `Observed ranking unchanged at ${source} ${current}.`;
  }
  const direction =
    current < previous ? 'improved' : 'declined';
  return `Observed ranking has ${direction} from the previous period (${previous} → ${current}, ${source}). Movement is observed only — not proof of cause.`;
}

/* ---------- page profile ---------- */

export interface PageProfileSection {
  facts: string[];
  evidence: FusedEvidence[];
}

export interface PageProfile {
  page: string;
  google: PageProfileSection;
  ai: PageProfileSection;
  technical: PageProfileSection;
  content: PageProfileSection;
  opportunity: {
    recommendationId: string | null;
    actionId: string | null;
    priority: string | null;
    reason: string | null;
    evidence: FusedEvidence[];
  };
}

export function composePageProfile(input: {
  page: string;
  googleFacts?: string[];
  googleEvidence?: FusedEvidence[];
  aiFacts?: string[];
  aiEvidence?: FusedEvidence[];
  technicalFacts?: string[];
  technicalEvidence?: FusedEvidence[];
  contentFacts?: string[];
  contentEvidence?: FusedEvidence[];
  opportunity?: PageProfile['opportunity'];
}): PageProfile {
  const section = (
    facts: string[] = [],
    ev: FusedEvidence[] = [],
  ): PageProfileSection => ({
    facts: facts.slice(0, 8),
    evidence: ev.slice(0, MAX_EVIDENCE_PER_DECISION),
  });
  return {
    page: input.page,
    google: section(
      input.googleFacts,
      input.googleEvidence,
    ),
    ai: section(input.aiFacts, input.aiEvidence),
    technical: section(
      input.technicalFacts,
      input.technicalEvidence,
    ),
    content: section(
      input.contentFacts,
      input.contentEvidence,
    ),
    opportunity: input.opportunity ?? {
      recommendationId: null,
      actionId: null,
      priority: null,
      reason: 'No execution action available.',
      evidence: [],
    },
  };
}

/* ---------- what-changed fusion ---------- */

export interface FusedChange {
  area:
    | 'GOOGLE'
    | 'AI_VISIBILITY'
    | 'AI_CITATION'
    | 'AI_AGENT'
    | 'TECHNICAL'
    | 'LINKS'
    | 'CONTENT';
  statement: string;
  evidence: FusedEvidence[];
}

export function fuseChanges(
  groups: FusedChange[][],
): FusedChange[] {
  const out: FusedChange[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const change of group.slice(0, 10)) {
      const key = `${change.area}|${change.statement}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        ...change,
        evidence: change.evidence.slice(
          0,
          MAX_EVIDENCE_PER_DECISION,
        ),
      });
      if (out.length >= 20) return out;
    }
  }
  return out;
}

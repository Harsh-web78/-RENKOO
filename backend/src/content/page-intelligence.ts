/*
 * =========================================================
 * CONTENT + ENTITY + AUTHORITY 2.0 — pure functions
 * (Phase 14).
 *
 * Deterministic composition over EXISTING evidence:
 * crawl page facts, strategy intent/topics, GSC demand,
 * rank observations, AI mention/citation checks, internal
 * link graph counts, backlink snapshots, BusinessBrain
 * entities, lead/revenue linkage.
 *
 * Rules:
 * - Never invent content facts the crawler did not
 *   expose. CONTENT_DEPTH is UNAVAILABLE without body
 *   extraction — never estimated from title/H1/H2.
 * - Intent states: COVERED / PARTIAL / MISSING /
 *   UNAVAILABLE. MISSING requires observed demand;
 *   without evidence the state is UNAVAILABLE.
 * - No authority score, no AI score, no percentages.
 *   Dimensions are STRONG / PARTIAL / WEAK /
 *   UNAVAILABLE with cited reasons.
 * - Movement and co-occurrence use "observed
 *   alongside" — never "caused by".
 * - Freshness thresholds are explicit parameters with
 *   documented defaults; crawl-age is labeled as
 *   crawl-age, never content-age.
 * =========================================================
 */

export type ContentEvidenceState =
  | 'VERIFIED'
  | 'OBSERVED'
  | 'INFERRED'
  | 'ESTIMATED'
  | 'UNAVAILABLE';

export type IntentCoverage =
  | 'COVERED'
  | 'PARTIAL'
  | 'MISSING'
  | 'UNAVAILABLE';

export interface IntentCoverageRow {
  intent: string;
  coverage: IntentCoverage;
  observedQueries: number;
  rankingQueries: number;
  evidenceState: ContentEvidenceState;
}

/* Per intent: with observed demand, ranking share
 * decides COVERED (≥60% of observed queries rank),
 * PARTIAL (>0), MISSING (none rank). With zero
 * observed queries the state is UNAVAILABLE — never
 * MISSING, since absence of evidence is not a gap. */
export function intentCoverageRow(
  intent: string,
  observedQueries: number,
  rankingQueries: number,
  hasEvidenceSource: boolean,
): IntentCoverageRow {
  const observed = Math.max(0, Math.floor(observedQueries));
  const ranking = Math.max(
    0,
    Math.min(Math.floor(rankingQueries), observed),
  );
  if (observed === 0 || !hasEvidenceSource) {
    return {
      intent,
      coverage: 'UNAVAILABLE',
      observedQueries: observed,
      rankingQueries: ranking,
      evidenceState: 'UNAVAILABLE',
    };
  }
  if (ranking === 0) {
    return {
      intent,
      coverage: 'MISSING',
      observedQueries: observed,
      rankingQueries: ranking,
      evidenceState: 'OBSERVED',
    };
  }
  if (ranking / observed >= 0.6) {
    return {
      intent,
      coverage: 'COVERED',
      observedQueries: observed,
      rankingQueries: ranking,
      evidenceState: 'OBSERVED',
    };
  }
  return {
    intent,
    coverage: 'PARTIAL',
    observedQueries: observed,
    rankingQueries: ranking,
    evidenceState: 'OBSERVED',
  };
}

export interface TopicCoverageRow {
  topic: string;
  coverage: IntentCoverage;
  observedQueries: number;
  rankingQueries: number;
  evidenceState: ContentEvidenceState;
}

/* Per topic: same observed-demand rule as intents,
 * reused (not duplicated) — a topic with observed
 * queries and no rankings is MISSING; with zero
 * observed queries it is UNAVAILABLE, never MISSING. */
export function topicCoverageRow(
  topic: string,
  observedQueries: number,
  rankingQueries: number,
  hasEvidenceSource: boolean,
): TopicCoverageRow {
  const row = intentCoverageRow(
    topic,
    observedQueries,
    rankingQueries,
    hasEvidenceSource,
  );
  return {
    topic: row.intent,
    coverage: row.coverage,
    observedQueries: row.observedQueries,
    rankingQueries: row.rankingQueries,
    evidenceState: row.evidenceState,
  };
}

/* ---------- content evidence ---------- */

export interface PageContentEvidence {
  url: string;
  title: string | null;
  metaDescription: string | null;
  h1: string[];
  h2: string[];
  wordCount: number | null;
  contentDepth: ContentEvidenceState;
  canonical: string | null;
  indexable: boolean | null;
  indexability: ContentEvidenceState;
  statusCode: number | null;
  contentType: string | null;
  structuredData: boolean | null;
  lastCrawledAt: string | null;
}

/* wordCount: pass the crawler's number through only
 * when it actually extracted body text (hasBody).
 * Otherwise CONTENT_DEPTH stays UNAVAILABLE — never
 * estimated from headings. */
export function composeContentEvidence(input: {
  url: string;
  title?: unknown;
  metaDescription?: unknown;
  h1?: unknown;
  h2?: unknown;
  wordCount?: unknown;
  hasBody?: boolean;
  canonical?: unknown;
  indexable?: boolean | null;
  statusCode?: unknown;
  contentType?: unknown;
  structuredData?: boolean | null;
  lastCrawledAt?: unknown;
}): PageContentEvidence {
  const text = (value: unknown): string | null => {
    const raw = String(value ?? '').trim();
    return raw || null;
  };
  const list = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .map((entry) => String(entry ?? '').trim())
          .filter(Boolean)
          .slice(0, 20)
      : [];
  const rawWords = Number(input.wordCount);
  const words =
    input.hasBody === true &&
    Number.isFinite(rawWords) &&
    rawWords > 0
      ? Math.floor(rawWords)
      : null;
  const indexable =
    typeof input.indexable === 'boolean'
      ? input.indexable
      : null;
  const status =
    Number.isFinite(Number(input.statusCode)) &&
    Number(input.statusCode) > 0
      ? Number(input.statusCode)
      : null;
  return {
    url: text(input.url) ?? '',
    title: text(input.title),
    metaDescription: text(input.metaDescription),
    h1: list(input.h1),
    h2: list(input.h2),
    wordCount: words,
    contentDepth:
      words !== null ? 'OBSERVED' : 'UNAVAILABLE',
    canonical: text(input.canonical),
    indexable,
    indexability:
      indexable === null ? 'UNAVAILABLE' : 'OBSERVED',
    statusCode: status,
    contentType: text(input.contentType),
    structuredData:
      typeof input.structuredData === 'boolean'
        ? input.structuredData
        : null,
    lastCrawledAt: text(input.lastCrawledAt),
  };
}

/* ---------- content gaps ---------- */

export type ContentGapKind =
  | 'MISSING_INTENT'
  | 'MISSING_TOPIC_SUPPORT'
  | 'WEAK_PAGE_COVERAGE'
  | 'COMPETITOR_COVERAGE'
  | 'AI_CITATION_GAP'
  | 'INTERNAL_SUPPORT_GAP'
  | 'FRESHNESS_GAP'
  | 'ENTITY_GAP'
  | 'INDEXABILITY_ISSUE';

export type ExistingContentAction =
  | 'CREATE'
  | 'IMPROVE'
  | 'OPTIMIZE'
  | 'CONSOLIDATE'
  | 'MONITOR';

export interface ContentGap {
  gapKind: ContentGapKind;
  page: string | null;
  topic: string | null;
  evidenceState: ContentEvidenceState;
  evidenceSources: string[];
  reason: string;
  existingActionKind: ExistingContentAction;
}

export function contentGap(
  gapKind: ContentGapKind,
  input: {
    page?: string | null;
    topic?: string | null;
    evidenceState?: ContentEvidenceState;
    evidenceSources?: string[];
    reason: string;
    existingActionKind: ExistingContentAction;
  },
): ContentGap {
  return {
    gapKind,
    page: input.page ?? null,
    topic: input.topic ?? null,
    evidenceState: input.evidenceState ?? 'OBSERVED',
    evidenceSources: (input.evidenceSources ?? []).filter(
      Boolean,
    ),
    reason: input.reason,
    existingActionKind: input.existingActionKind,
  };
}

/* ---------- entity ---------- */

export type EntitySignal =
  | 'ENTITY_PRESENT'
  | 'ENTITY_SUPPORTING'
  | 'ENTITY_MISSING'
  | 'ENTITY_UNAVAILABLE';

/* PRESENT: entity named in page evidence (title /
 * headings / meta). SUPPORTING: entity known in
 * BusinessBrain and topically related but not named
 * on the page. MISSING: entity known in the brain
 * with observed demand, absent from page evidence.
 * Without a brain record: UNAVAILABLE — never
 * inferred from extraction absence. */
export function entitySignal(input: {
  hasBrainRecord: boolean;
  namedInPage: boolean;
  topicallyRelated: boolean;
  hasObservedDemand: boolean;
}): EntitySignal {
  if (!input.hasBrainRecord) return 'ENTITY_UNAVAILABLE';
  if (input.namedInPage) return 'ENTITY_PRESENT';
  if (
    input.topicallyRelated &&
    !input.hasObservedDemand
  ) {
    return 'ENTITY_SUPPORTING';
  }
  if (input.topicallyRelated && input.hasObservedDemand) {
    return 'ENTITY_MISSING';
  }
  return 'ENTITY_SUPPORTING';
}

export type EntityConsistency =
  | 'CONSISTENT'
  | 'PARTIAL'
  | 'CONFLICTING'
  | 'UNAVAILABLE';

export function entityConsistency(input: {
  brainName: string | null;
  siteIdentity: string | null;
  pageMentionsBrain: boolean | null;
  hasStructuredData: boolean | null;
}): EntityConsistency {
  const brain = (input.brainName ?? '')
    .trim()
    .toLowerCase();
  const site = (input.siteIdentity ?? '')
    .trim()
    .toLowerCase();
  if (!brain) return 'UNAVAILABLE';
  if (site && brain !== site) return 'CONFLICTING';
  if (input.pageMentionsBrain === true)
    return 'CONSISTENT';
  if (input.pageMentionsBrain === false)
    return 'PARTIAL';
  /* Missing structured data is not a failure:
   * without page evidence the state is PARTIAL
   * only when identity agrees, else UNAVAILABLE. */
  if (site && brain === site) return 'PARTIAL';
  return 'UNAVAILABLE';
}

/* ---------- AI citation-worthiness ----------
 * Eight dimensions, each STRONG / PARTIAL / WEAK /
 * UNAVAILABLE from available facts only. */

export type WorthinessLevel =
  | 'STRONG'
  | 'PARTIAL'
  | 'WEAK'
  | 'UNAVAILABLE';

export type WorthinessDimension =
  | 'ANSWERABILITY'
  | 'ENTITY_CLARITY'
  | 'TOPIC_COVERAGE'
  | 'DIRECT_ANSWER'
  | 'SUPPORTING_EVIDENCE'
  | 'SOURCE_QUALITY_SIGNALS'
  | 'FRESHNESS'
  | 'INTERNAL_SUPPORT';

export interface WorthinessRow {
  dimension: WorthinessDimension;
  level: WorthinessLevel;
  reason: string;
  evidenceState: ContentEvidenceState;
}

function worthiness(
  dimension: WorthinessDimension,
  level: WorthinessLevel,
  reason: string,
  evidenceState: ContentEvidenceState,
): WorthinessRow {
  return { dimension, level, reason, evidenceState };
}

export function citationWorthiness(input: {
  hasObservedQueryIntent: boolean;
  hasAnswerSection: boolean | null;
  entityPresent: boolean | null;
  topicCovered: boolean | null;
  hasSupportingContent: boolean | null;
  hasAuthorOrSources: boolean | null;
  freshness: 'FRESH' | 'AGING' | 'STALE' | 'UNKNOWN';
  inboundLinks: number | null;
}): WorthinessRow[] {
  const tri = (
    value: boolean | null,
    strongReason: string,
    weakReason: string,
  ): {
    level: WorthinessLevel;
    reason: string;
    state: ContentEvidenceState;
  } => {
    if (value === true)
      return {
        level: 'STRONG',
        reason: strongReason,
        state: 'OBSERVED',
      };
    if (value === false)
      return {
        level: 'WEAK',
        reason: weakReason,
        state: 'OBSERVED',
      };
    return {
      level: 'UNAVAILABLE',
      reason: 'No page evidence available.',
      state: 'UNAVAILABLE',
    };
  };
  const answer = tri(
    input.hasAnswerSection,
    'A directly matching answer section was observed in page evidence.',
    'Observed query intent exists, but no directly matching answer section was observed in available page evidence.',
  );
  const entity = tri(
    input.entityPresent,
    'The business entity is named in observed page evidence.',
    'The business entity was not observed in available page evidence.',
  );
  const topic = tri(
    input.topicCovered,
    'Supporting topic coverage observed across mapped queries.',
    'Topic coverage incomplete across observed queries.',
  );
  const supporting = tri(
    input.hasSupportingContent,
    'Supporting pages observed for this topic.',
    'No supporting pages observed for this topic.',
  );
  const source = tri(
    input.hasAuthorOrSources,
    'Author or source signals observed on the page.',
    'No author or source signals observed in available page evidence.',
  );
  const freshnessLevel: WorthinessLevel =
    input.freshness === 'FRESH'
      ? 'STRONG'
      : input.freshness === 'AGING'
        ? 'PARTIAL'
        : input.freshness === 'STALE'
          ? 'WEAK'
          : 'UNAVAILABLE';
  const inbound =
    input.inboundLinks === null
      ? {
          level: 'UNAVAILABLE' as WorthinessLevel,
          reason: 'Internal-link graph coverage insufficient.',
          state: 'UNAVAILABLE' as ContentEvidenceState,
        }
      : input.inboundLinks >= 5
        ? {
            level: 'STRONG' as WorthinessLevel,
            reason: `${input.inboundLinks} inbound internal links observed.`,
            state: 'OBSERVED' as ContentEvidenceState,
          }
        : input.inboundLinks >= 1
          ? {
              level: 'PARTIAL' as WorthinessLevel,
              reason: `Only ${input.inboundLinks} inbound internal link(s) observed.`,
              state: 'OBSERVED' as ContentEvidenceState,
            }
          : {
              level: 'WEAK' as WorthinessLevel,
              reason: 'No inbound internal links observed.',
              state: 'OBSERVED' as ContentEvidenceState,
            };
  return [
    worthiness(
      'ANSWERABILITY',
      input.hasObservedQueryIntent
        ? answer.level
        : 'UNAVAILABLE',
      input.hasObservedQueryIntent
        ? answer.reason
        : 'No observed query intent for this page.',
      input.hasObservedQueryIntent
        ? answer.state
        : 'UNAVAILABLE',
    ),
    worthiness(
      'ENTITY_CLARITY',
      entity.level,
      entity.reason,
      entity.state,
    ),
    worthiness(
      'TOPIC_COVERAGE',
      topic.level,
      topic.reason,
      topic.state,
    ),
    worthiness(
      'DIRECT_ANSWER',
      answer.level,
      answer.reason,
      answer.state,
    ),
    worthiness(
      'SUPPORTING_EVIDENCE',
      supporting.level,
      supporting.reason,
      supporting.state,
    ),
    worthiness(
      'SOURCE_QUALITY_SIGNALS',
      source.level,
      source.reason,
      source.state,
    ),
    worthiness(
      'FRESHNESS',
      freshnessLevel,
      `Crawl-age freshness: ${input.freshness.toLowerCase()}.`,
      input.freshness === 'UNKNOWN'
        ? 'UNAVAILABLE'
        : 'OBSERVED',
    ),
    worthiness(
      'INTERNAL_SUPPORT',
      inbound.level,
      inbound.reason,
      inbound.state,
    ),
  ];
}

export type AiCitationState =
  | 'CITATION_OBSERVED'
  | 'AI_CITATION_GAP'
  | 'AI_EVIDENCE_UNAVAILABLE';

export function aiCitationState(input: {
  hasAiObservations: boolean;
  renkooCited: boolean;
  competitorCited: boolean;
}): AiCitationState {
  if (!input.hasAiObservations)
    return 'AI_EVIDENCE_UNAVAILABLE';
  if (input.renkooCited) return 'CITATION_OBSERVED';
  /* No observation is never converted into
   * "not cited": the gap fires only when a
   * competitor citation was actually observed. */
  if (input.competitorCited) return 'AI_CITATION_GAP';
  return 'AI_EVIDENCE_UNAVAILABLE';
}

/* ---------- freshness ----------
 * Crawl-age only, labeled as such. Content-age
 * requires last-modified evidence the crawler may
 * not expose — without it the state is UNKNOWN. */

export type FreshnessState =
  | 'FRESH'
  | 'AGING'
  | 'STALE'
  | 'UNKNOWN';

export interface FreshnessThresholds {
  freshDays: number;
  staleDays: number;
}

export const DEFAULT_FRESHNESS_THRESHOLDS: FreshnessThresholds =
  {
    freshDays: 90,
    staleDays: 365,
  };

export function freshnessState(
  lastSeenAt: string | null,
  nowAt: string,
  thresholds: FreshnessThresholds = DEFAULT_FRESHNESS_THRESHOLDS,
): { state: FreshnessState; crawlAgeDays: number | null } {
  if (!lastSeenAt) {
    return { state: 'UNKNOWN', crawlAgeDays: null };
  }
  const seen = new Date(lastSeenAt).getTime();
  const now = new Date(nowAt).getTime();
  if (!Number.isFinite(seen) || !Number.isFinite(now)) {
    return { state: 'UNKNOWN', crawlAgeDays: null };
  }
  const ageDays = Math.max(
    0,
    Math.floor((now - seen) / (24 * 60 * 60 * 1000)),
  );
  if (ageDays <= thresholds.freshDays) {
    return { state: 'FRESH', crawlAgeDays: ageDays };
  }
  if (ageDays <= thresholds.staleDays) {
    return { state: 'AGING', crawlAgeDays: ageDays };
  }
  return { state: 'STALE', crawlAgeDays: ageDays };
}

/* ---------- decay ---------- */

export type DecayDiagnosis =
  | 'RANK_DECLINE_WITH_STALE_CONTENT'
  | 'TRAFFIC_DECLINE_WITH_STABLE_RANK'
  | 'AI_VISIBILITY_DECLINE'
  | 'NO_DECAY_EVIDENCE'
  | 'INSUFFICIENT_DATA';

export function decayDiagnosis(input: {
  rankDeclined: boolean | null;
  trafficDeclined: boolean | null;
  freshness: FreshnessState;
  aiDeclined: boolean | null;
}): DecayDiagnosis {
  if (
    input.rankDeclined === true &&
    (input.freshness === 'STALE' ||
      input.freshness === 'AGING')
  ) {
    return 'RANK_DECLINE_WITH_STALE_CONTENT';
  }
  if (
    input.trafficDeclined === true &&
    input.rankDeclined === false
  ) {
    return 'TRAFFIC_DECLINE_WITH_STABLE_RANK';
  }
  if (input.aiDeclined === true) {
    return 'AI_VISIBILITY_DECLINE';
  }
  if (
    input.rankDeclined === null &&
    input.trafficDeclined === null &&
    input.aiDeclined === null
  ) {
    return 'INSUFFICIENT_DATA';
  }
  return 'NO_DECAY_EVIDENCE';
}

export function decayStatement(
  diagnosis: DecayDiagnosis,
): string {
  switch (diagnosis) {
    case 'RANK_DECLINE_WITH_STALE_CONTENT':
      return 'Ranking decline observed alongside aging crawl state — co-occurrence only, not proof freshness caused it.';
    case 'TRAFFIC_DECLINE_WITH_STABLE_RANK':
      return 'Traffic decline observed alongside stable rankings — points at SERP presentation or intent fit, not rank.';
    case 'AI_VISIBILITY_DECLINE':
      return 'AI visibility decline observed alongside current page state.';
    case 'NO_DECAY_EVIDENCE':
      return 'No decay pattern evidenced across rank, traffic, and AI observations.';
    case 'INSUFFICIENT_DATA':
    default:
      return 'Insufficient history to evaluate decay.';
  }
}

/* ---------- internal support ---------- */

export type InternalSupportState =
  | 'SUPPORTED'
  | 'THIN'
  | 'ORPHAN_RISK'
  | 'UNAVAILABLE';

export function internalSupportState(input: {
  graphAvailable: boolean;
  inboundLinks: number | null;
  orphanFlag: boolean | null;
}): InternalSupportState {
  if (!input.graphAvailable || input.inboundLinks === null) {
    return 'UNAVAILABLE';
  }
  if (
    input.orphanFlag === true ||
    input.inboundLinks === 0
  ) {
    return 'ORPHAN_RISK';
  }
  if (input.inboundLinks < 3) return 'THIN';
  return 'SUPPORTED';
}

/* ---------- authority evidence ----------
 * Dimensions only — never a score. External
 * authority uses verified stored backlink data;
 * without it: UNAVAILABLE (never estimated). */

export type AuthorityDimension =
  | 'SEARCH_COVERAGE'
  | 'CONTENT_COVERAGE'
  | 'ENTITY_COVERAGE'
  | 'INTERNAL_SUPPORT'
  | 'AI_CITATION'
  | 'COMPETITOR_GAP'
  | 'FRESHNESS'
  | 'EXTERNAL_AUTHORITY';

export interface AuthorityRow {
  dimension: AuthorityDimension;
  level: WorthinessLevel;
  detail: string;
  evidenceState: ContentEvidenceState;
}

export function authorityRow(
  dimension: AuthorityDimension,
  level: WorthinessLevel,
  detail: string,
  evidenceState: ContentEvidenceState,
): AuthorityRow {
  return { dimension, level, detail, evidenceState };
}

/* ---------- page diagnosis ----------
 * Ten deterministic reasons in fixed precedence.
 * No scoring: the first evidenced reason leads;
 * existing strategy/fusion priority orders action. */

export type PageWeaknessReason =
  | 'INDEXABILITY_BLOCKER'
  | 'MISSING_INTENT'
  | 'MISSING_TOPIC_SUPPORT'
  | 'WEAK_MAPPING'
  | 'COMPETITOR_SERP_COVERAGE'
  | 'AI_CITATION_GAP'
  | 'ENTITY_INCONSISTENCY'
  | 'FRESHNESS_DECAY'
  | 'INTERNAL_SUPPORT_GAP'
  | 'INSUFFICIENT_EVIDENCE';

export const WEAKNESS_PRECEDENCE: readonly PageWeaknessReason[] =
  [
    'INDEXABILITY_BLOCKER',
    'MISSING_INTENT',
    'MISSING_TOPIC_SUPPORT',
    'WEAK_MAPPING',
    'COMPETITOR_SERP_COVERAGE',
    'AI_CITATION_GAP',
    'ENTITY_INCONSISTENCY',
    'FRESHNESS_DECAY',
    'INTERNAL_SUPPORT_GAP',
    'INSUFFICIENT_EVIDENCE',
  ];

export function diagnoseWeaknesses(input: {
  indexBlocked: boolean;
  missingIntents: string[];
  missingTopicSupport: boolean;
  weakMapping: boolean;
  competitorCovers: boolean;
  aiCitationGap: boolean;
  entityInconsistent: boolean;
  freshnessDecay: boolean;
  internalGap: boolean;
}): PageWeaknessReason[] {
  const found: PageWeaknessReason[] = [];
  if (input.indexBlocked)
    found.push('INDEXABILITY_BLOCKER');
  if (input.missingIntents.length > 0)
    found.push('MISSING_INTENT');
  if (input.missingTopicSupport)
    found.push('MISSING_TOPIC_SUPPORT');
  if (input.weakMapping) found.push('WEAK_MAPPING');
  if (input.competitorCovers)
    found.push('COMPETITOR_SERP_COVERAGE');
  if (input.aiCitationGap)
    found.push('AI_CITATION_GAP');
  if (input.entityInconsistent)
    found.push('ENTITY_INCONSISTENCY');
  if (input.freshnessDecay)
    found.push('FRESHNESS_DECAY');
  if (input.internalGap)
    found.push('INTERNAL_SUPPORT_GAP');
  if (found.length === 0)
    found.push('INSUFFICIENT_EVIDENCE');
  return WEAKNESS_PRECEDENCE.filter((reason) =>
    found.includes(reason),
  );
}

export function weaknessStatement(
  reason: PageWeaknessReason,
  detail?: string,
): string {
  const extra = detail ? ` ${detail}` : '';
  switch (reason) {
    case 'INDEXABILITY_BLOCKER':
      return `A directly observed indexability or canonical issue blocks eligibility.${extra}`;
    case 'MISSING_INTENT':
      return `Observed search intent has no ranking coverage on this page.${extra}`;
    case 'MISSING_TOPIC_SUPPORT':
      return `Observed topic demand has no supporting page.${extra}`;
    case 'WEAK_MAPPING':
      return `Queries map to this page but it does not rank for them.${extra}`;
    case 'COMPETITOR_SERP_COVERAGE':
      return `Competitor pages cover the same observed intent in SERP results.${extra}`;
    case 'AI_CITATION_GAP':
      return `Competitors are cited for observed prompts where this page is not.${extra}`;
    case 'ENTITY_INCONSISTENCY':
      return `Entity signals conflict between BusinessBrain and observed page evidence.${extra}`;
    case 'FRESHNESS_DECAY':
      return `Decline observed alongside aging content state — co-occurrence, not causation.${extra}`;
    case 'INTERNAL_SUPPORT_GAP':
      return `Internal support below the observed threshold for this page.${extra}`;
    case 'INSUFFICIENT_EVIDENCE':
    default:
      return 'Available evidence does not identify one dominant weakness. Continue monitoring.';
  }
}

/* ---------- page decision (existing vocabulary) ---------- */

export type PageDecision =
  | 'IMPROVE'
  | 'OPTIMIZE'
  | 'CREATE'
  | 'CONSOLIDATE'
  | 'PROTECT'
  | 'IGNORE';

export function pageDecision(
  weaknesses: PageWeaknessReason[],
  hasPage: boolean,
): {
  decision: PageDecision;
  reason: string;
} {
  if (!hasPage) {
    return {
      decision: 'CREATE',
      reason:
        'No relevant page observed for evidenced demand.',
    };
  }
  const lead = weaknesses[0] ?? 'INSUFFICIENT_EVIDENCE';
  switch (lead) {
    case 'INDEXABILITY_BLOCKER':
      return {
        decision: 'OPTIMIZE',
        reason:
          'Resolve the observed eligibility blocker before content work.',
      };
    case 'MISSING_INTENT':
    case 'WEAK_MAPPING':
    case 'FRESHNESS_DECAY':
      return {
        decision: 'IMPROVE',
        reason: weaknessStatement(lead),
      };
    case 'MISSING_TOPIC_SUPPORT':
      return {
        decision: 'CREATE',
        reason: weaknessStatement(lead),
      };
    case 'COMPETITOR_SERP_COVERAGE':
      return {
        decision: 'IMPROVE',
        reason: weaknessStatement(lead),
      };
    case 'AI_CITATION_GAP':
    case 'ENTITY_INCONSISTENCY':
    case 'INTERNAL_SUPPORT_GAP':
      return {
        decision: 'OPTIMIZE',
        reason: weaknessStatement(lead),
      };
    case 'INSUFFICIENT_EVIDENCE':
    default:
      return {
        decision: 'IGNORE',
        reason:
          'No evidenced weakness — monitor rather than act.',
      };
  }
}

/* ---------- deterministic ordering ---------- */

export function orderGapsByPrecedence(
  gaps: ContentGap[],
): ContentGap[] {
  const rank: Record<string, number> = {
    INDEXABILITY_ISSUE: 0,
    MISSING_INTENT: 1,
    MISSING_TOPIC_SUPPORT: 2,
    WEAK_PAGE_COVERAGE: 3,
    COMPETITOR_COVERAGE: 4,
    AI_CITATION_GAP: 5,
    ENTITY_GAP: 6,
    FRESHNESS_GAP: 7,
    INTERNAL_SUPPORT_GAP: 8,
  };
  return [...gaps].sort(
    (a, b) =>
      (rank[a.gapKind] ?? 99) - (rank[b.gapKind] ?? 99),
  );
}

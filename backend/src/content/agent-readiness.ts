/*
 * =========================================================
 * AGENT READINESS 1.0 — pure deterministic composition
 * (Phase 15).
 *
 * Evidence-backed diagnostic: can an automated search/AI
 * agent reliably discover, understand, and act on a page
 * from evidence RENKOO already holds? No scores, no
 * numeric readiness rating, no provider calls.
 *
 * Reuses existing evidence only: CrawlPage/CrawlLink,
 * robots/indexability/canonical/status facts, BusinessBrain,
 * Phase 12 topics, Phase 14 content/entity/freshness,
 * Phase 8D AiAgentRequest taxonomy, AI citation checks,
 * EvidenceFusion action vocabulary.
 *
 * Honesty invariants (mandatory):
 * - AI_AGENT_NOT_OBSERVED != blocked.
 * - No agent log != no AI access.
 * - Googlebot/Bingbot (SEARCH_ENGINE) != AI agent.
 * - AI citation != agent visit; visit != citation.
 * - Citation != traffic; traffic != lead; lead != revenue.
 * - Missing schema != automatic failure.
 * - Missing body extraction != weak content.
 * - Crawl age != content age.
 * - Correlation != causation.
 * - UNAVAILABLE != zero.
 * =========================================================
 */

export type ReadinessEvidenceState =
  | 'VERIFIED'
  | 'OBSERVED'
  | 'INFERRED'
  | 'ESTIMATED'
  | 'UNAVAILABLE';

export type SignalStrength =
  | 'STRONG'
  | 'PARTIAL'
  | 'WEAK'
  | 'UNAVAILABLE';

export type AccessState =
  | 'ACCESSIBLE'
  | 'PARTIAL'
  | 'BLOCKED'
  | 'UNAVAILABLE';

export type EntityState =
  | 'CLEAR'
  | 'PARTIAL'
  | 'CONFLICTING'
  | 'UNAVAILABLE';

export type OfferingState =
  | 'CLEAR'
  | 'PARTIAL'
  | 'MISSING'
  | 'UNAVAILABLE';

export type StructuredState =
  | 'VALID'
  | 'PARTIAL'
  | 'CONFLICTING'
  | 'MISSING'
  | 'UNAVAILABLE';

export type AgentActivityState =
  | 'AI_AGENT_VISITED'
  | 'AI_AGENT_NOT_OBSERVED'
  | 'UNKNOWN';

export type FreshnessState =
  | 'FRESH'
  | 'AGING'
  | 'STALE'
  | 'UNKNOWN';

export type ActionabilityState =
  | 'INFORMATION_AVAILABLE'
  | 'EXECUTION_CAPABILITY_UNAVAILABLE'
  | 'UNKNOWN';

export type CommerceSignal =
  | 'READY_SIGNAL'
  | 'PARTIAL_SIGNAL'
  | 'UNAVAILABLE';

export type AgentReadinessReason =
  | 'DISCOVERY_GAP'
  | 'ACCESS_GAP'
  | 'CONTENT_CLARITY_GAP'
  | 'ENTITY_GAP'
  | 'OFFERING_GAP'
  | 'EVIDENCE_GAP'
  | 'STRUCTURED_DATA_GAP'
  | 'INTERNAL_SUPPORT_GAP'
  | 'FRESHNESS_GAP'
  | 'ACTIONABILITY_GAP'
  | 'AGENT_EVIDENCE_UNAVAILABLE';

/* Existing EvidenceFusion action vocabulary — reused,
 * never extended here. */
export type AgentNbaCategory =
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

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function norm(value: unknown): string {
  return clean(value).toLowerCase();
}

/* ---------- 3. DISCOVERABILITY ---------- */

export interface DiscoverabilityInput {
  hasCrawlPage: boolean;
  inboundLinks: number | null;
  isOrphan: boolean | null;
  inSitemap: boolean | null;
  indexable: boolean | null;
}

export function discoverabilityState(
  input: DiscoverabilityInput,
): SignalStrength {
  if (!input.hasCrawlPage) return 'UNAVAILABLE';
  if (input.indexable === false) return 'WEAK';
  const inbound =
    input.inboundLinks === null || input.inboundLinks === undefined
      ? null
      : Math.max(0, Math.floor(input.inboundLinks));
  if (input.isOrphan === true) return 'WEAK';
  if (inbound !== null && inbound === 0) return 'WEAK';
  if (inbound !== null && inbound >= 2) return 'STRONG';
  if (inbound === 1) return 'PARTIAL';
  /* Crawl exists but no link graph evidence. */
  return 'PARTIAL';
}

export function discoverabilityEvidence(
  input: DiscoverabilityInput,
): ReadinessEvidenceState {
  if (!input.hasCrawlPage) return 'UNAVAILABLE';
  return 'OBSERVED';
}

/* ---------- 4. CRAWL ACCESS ---------- */

export interface CrawlAccessInput {
  statusCode: number | null;
  indexable: boolean | null;
  crawlFailed: boolean;
  hasCrawlPage: boolean;
}

export function crawlAccessState(
  input: CrawlAccessInput,
): AccessState {
  if (!input.hasCrawlPage && input.statusCode === null)
    return 'UNAVAILABLE';
  if (input.crawlFailed) return 'PARTIAL';
  const status = input.statusCode;
  if (status === null || status === undefined)
    return 'UNAVAILABLE';
  if (status >= 200 && status < 300) {
    if (input.indexable === false) return 'PARTIAL';
    return 'ACCESSIBLE';
  }
  if (status >= 300 && status < 400) return 'PARTIAL';
  if (status >= 400) return 'BLOCKED';
  return 'UNAVAILABLE';
}

/* ---------- 5/6. AGENT LOG EVIDENCE + FAMILY ---------- */

export type AgentCategoryLike =
  | 'AI_SEARCH_CRAWLER'
  | 'AI_ASSISTANT'
  | 'AI_TRAINING'
  | 'SEARCH_ENGINE'
  | 'SOCIAL'
  | 'OTHER_BOT'
  | 'HUMAN'
  | 'UNKNOWN';

/* Googlebot/Bingbot are SEARCH_ENGINE, never AI agents. */
export function isAiAgentCategory(
  category: AgentCategoryLike | string,
): boolean {
  return (
    category === 'AI_SEARCH_CRAWLER' ||
    category === 'AI_ASSISTANT' ||
    category === 'AI_TRAINING'
  );
}

export function isSearchEngineNotAgent(
  category: AgentCategoryLike | string,
): boolean {
  return category === 'SEARCH_ENGINE';
}

export interface AgentActivityInput {
  logAvailable: boolean;
  aiAgentVisits: number;
}

export function agentActivityState(
  input: AgentActivityInput,
): AgentActivityState {
  if (!input.logAvailable) return 'UNKNOWN';
  const visits = Math.max(0, Math.floor(input.aiAgentVisits));
  if (visits > 0) return 'AI_AGENT_VISITED';
  return 'AI_AGENT_NOT_OBSERVED';
}

export const AGENT_NOT_OBSERVED_NOTE =
  'AI agents were not observed for this page in imported log evidence. ' +
  'Not observed is not proof that AI agents cannot access this page.';

export const NO_LOG_NOTE =
  'No agent log evidence is available. Coverage is unknown, not zero.';

/* ---------- 7. CONTENT EXTRACTABILITY ---------- */

export interface ContentExtractInput {
  title: string | null;
  h1Count: number;
  h2Count: number;
  hasBody: boolean | null;
  bodyAvailable: boolean;
  hasCrawlPage: boolean;
}

export function contentExtractability(
  input: ContentExtractInput,
): SignalStrength {
  if (!input.hasCrawlPage) return 'UNAVAILABLE';
  if (!input.bodyAvailable && input.hasBody !== true)
    return 'UNAVAILABLE';
  const hasTitle = clean(input.title).length > 0;
  const h1 = Math.max(0, Math.floor(input.h1Count));
  const h2 = Math.max(0, Math.floor(input.h2Count));
  /* Body extraction unavailable must not be read as
   * weak content. */
  if (!input.bodyAvailable) return 'UNAVAILABLE';
  if (hasTitle && h1 >= 1 && (h2 >= 1 || input.hasBody === true))
    return 'STRONG';
  if (hasTitle || h1 >= 1) return 'PARTIAL';
  return 'WEAK';
}

/* ---------- 8. ENTITY CLARITY ---------- */

export interface EntityInput {
  businessName: string | null;
  hasBusinessType: boolean;
  offeringCount: number;
  hasAudience: boolean;
  hasLocation: boolean;
  hasContactSignal: boolean;
  conflictingSignals: boolean;
  hasBrain: boolean;
}

export function entityClarity(
  input: EntityInput,
): EntityState {
  if (!input.hasBrain && !clean(input.businessName))
    return 'UNAVAILABLE';
  /* Never infer contradiction from a missing field. */
  if (input.conflictingSignals) return 'CONFLICTING';
  const name = clean(input.businessName).length > 0;
  if (!name) return 'UNAVAILABLE';
  const signals = [
    input.hasBusinessType,
    input.offeringCount > 0,
    input.hasAudience,
    input.hasLocation,
    input.hasContactSignal,
  ].filter(Boolean).length;
  if (signals >= 3) return 'CLEAR';
  if (signals >= 1) return 'PARTIAL';
  return 'PARTIAL';
}

/* ---------- 9. OFFERING CLARITY ---------- */

export interface OfferingInput {
  hasBrain: boolean;
  offeringMapped: boolean;
  offeringHasTopic: boolean;
  offeringHasPage: boolean;
  observedDemand: boolean;
}

export function offeringClarity(
  input: OfferingInput,
): OfferingState {
  if (!input.hasBrain) return 'UNAVAILABLE';
  if (input.offeringMapped && input.offeringHasPage)
    return 'CLEAR';
  if (input.offeringMapped || input.offeringHasTopic)
    return 'PARTIAL';
  /* MISSING requires observed demand; otherwise the
   * gap is unknown, not a gap. */
  if (input.observedDemand) return 'MISSING';
  return 'UNAVAILABLE';
}

/* ---------- 12. STRUCTURED DATA ---------- */

export interface StructuredInput {
  count: number | null;
  parseable: boolean;
  hasMismatch: boolean;
  hasCrawlPage: boolean;
  pageContextSupportsSchema: boolean;
}

export function structuredDataState(
  input: StructuredInput,
): StructuredState {
  if (!input.hasCrawlPage || input.count === null)
    return 'UNAVAILABLE';
  if (input.hasMismatch) return 'CONFLICTING';
  const count = Math.max(0, Math.floor(input.count));
  if (count > 0 && input.parseable) return 'VALID';
  if (count > 0 && !input.parseable) return 'PARTIAL';
  /* Missing schema is not automatically a failure —
   * only flag MISSING where page context would
   * usefully support machine-readable data. */
  if (count === 0 && input.pageContextSupportsSchema)
    return 'MISSING';
  if (count === 0) return 'UNAVAILABLE';
  return 'UNAVAILABLE';
}

/* ---------- 13. ENTITY / STRUCTURED CONSISTENCY ---------- */

export function entityConsistency(
  brainName: string | null,
  pageName: string | null,
  schemaName: string | null,
): EntityState {
  const names = [brainName, pageName, schemaName]
    .map((v) => norm(v))
    .filter((v) => v.length > 0);
  if (names.length === 0) return 'UNAVAILABLE';
  if (names.length === 1) return 'PARTIAL';
  const unique = new Set(names);
  if (unique.size === 1) return 'CLEAR';
  return 'CONFLICTING';
}

/* ---------- 14. INTERNAL DISCOVERABILITY ---------- */

export interface InternalSupportInput {
  inboundLinks: number | null;
  isOrphan: boolean | null;
  anchorCount: number;
  graphAvailable: boolean;
}

export function internalSupportState(
  input: InternalSupportInput,
): SignalStrength {
  if (!input.graphAvailable) return 'UNAVAILABLE';
  if (input.isOrphan === true) return 'WEAK';
  const inbound =
    input.inboundLinks === null ? null : Math.max(0, Math.floor(input.inboundLinks));
  if (inbound === null) return 'UNAVAILABLE';
  if (inbound === 0) return 'WEAK';
  if (inbound === 1) return 'PARTIAL';
  return 'STRONG';
}

/* ---------- 15. ACTIONABILITY ---------- */

export const OBSERVABLE_ACTIONS = [
  'contact',
  'booking',
  'pricing',
  'demo',
  'signup',
  'purchase',
  'documentation',
  'quote',
  'location',
  'support',
] as const;

export type ObservableAction =
  (typeof OBSERVABLE_ACTIONS)[number];

export interface ActionabilityInput {
  observedActions: string[];
  executionSupported: boolean | null;
  hasCrawlPage: boolean;
}

export function actionabilityState(
  input: ActionabilityInput,
): ActionabilityState {
  if (!input.hasCrawlPage) return 'UNKNOWN';
  const observed = input.observedActions
    .map((a) => norm(a))
    .filter((a) => a.length > 0);
  if (observed.length === 0) return 'UNKNOWN';
  void input.executionSupported;
  /* RENKOO never claims an agent can complete a
   * transaction: execution capability is unavailable
   * unless a verified machine-actionable mechanism is
   * observed, which this phase does not verify. */
  return 'INFORMATION_AVAILABLE';
}

export function executionCapabilityNote(): string {
  return (
    'Information about the next step is available. ' +
    'Execution capability is unavailable: no verified ' +
    'machine-actionable execution mechanism was observed.'
  );
}

/* ---------- 16. AGENTIC COMMERCE SIGNALS ---------- */

export interface CommerceInput {
  offeringClear: boolean;
  pricingClear: boolean;
  availabilityClear: boolean;
  contactClear: boolean;
  structuredProduct: boolean;
  hasEvidence: boolean;
}

export function commerceSignal(
  input: CommerceInput,
): CommerceSignal {
  if (!input.hasEvidence) return 'UNAVAILABLE';
  const hits = [
    input.offeringClear,
    input.pricingClear,
    input.availabilityClear,
    input.contactClear,
    input.structuredProduct,
  ].filter(Boolean).length;
  if (hits >= 3) return 'READY_SIGNAL';
  if (hits >= 1) return 'PARTIAL_SIGNAL';
  return 'UNAVAILABLE';
}

/* ---------- 17. FRESHNESS (crawl age labeled) ---------- */

export function freshnessFromCrawlAge(
  crawlAgeDays: number | null,
  freshDays = 30,
  staleDays = 120,
): FreshnessState {
  if (crawlAgeDays === null || crawlAgeDays === undefined)
    return 'UNKNOWN';
  const age = Math.floor(crawlAgeDays);
  if (!Number.isFinite(age) || age < 0) return 'UNKNOWN';
  if (age <= freshDays) return 'FRESH';
  if (age <= staleDays) return 'AGING';
  return 'STALE';
}

export const CRAWL_AGE_NOTE =
  'Freshness reflects observed crawl age, not verified content age.';

/* ---------- 18. AI CITATION BRIDGE (no causality) ---------- */

export type CitationObservation =
  | 'CITED'
  | 'MENTIONED_NOT_CITED'
  | 'NOT_MENTIONED'
  | 'UNAVAILABLE';

export function citationBridgeNote(
  citation: CitationObservation,
  activity: AgentActivityState,
): string {
  if (
    citation === 'CITED' &&
    activity === 'AI_AGENT_VISITED'
  ) {
    return (
      'AI citation has been observed while agent request ' +
      'evidence is also present. No causal link is claimed.'
    );
  }
  if (citation === 'CITED') {
    return (
      'AI citation has been observed. Citation is not ' +
      'evidence of an agent visit and does not imply traffic.'
    );
  }
  if (citation === 'UNAVAILABLE') {
    return 'No AI citation observation is available.';
  }
  return 'No AI citation has been observed for this page in available checks.';
}

/* ---------- 20. DIAGNOSIS (deterministic precedence) ---------- */

export interface DiagnosisInput {
  discoverability: SignalStrength;
  access: AccessState;
  content: SignalStrength;
  entity: EntityState;
  offering: OfferingState;
  evidenceSupport: SignalStrength;
  structured: StructuredState;
  internalSupport: SignalStrength;
  freshness: FreshnessState;
  actionability: ActionabilityState;
  agentActivity: AgentActivityState;
  logAvailable: boolean;
}

export interface DiagnosisReason {
  reason: AgentReadinessReason;
  evidenceState: ReadinessEvidenceState;
  statement: string;
}

const PRECEDENCE: AgentReadinessReason[] = [
  'DISCOVERY_GAP',
  'ACCESS_GAP',
  'CONTENT_CLARITY_GAP',
  'ENTITY_GAP',
  'OFFERING_GAP',
  'EVIDENCE_GAP',
  'STRUCTURED_DATA_GAP',
  'INTERNAL_SUPPORT_GAP',
  'FRESHNESS_GAP',
  'ACTIONABILITY_GAP',
  'AGENT_EVIDENCE_UNAVAILABLE',
];

export function diagnoseAgentReadiness(
  input: DiagnosisInput,
): DiagnosisReason[] {
  const out: DiagnosisReason[] = [];
  if (
    input.discoverability === 'WEAK' ||
    input.discoverability === 'UNAVAILABLE'
  ) {
    out.push({
      reason: 'DISCOVERY_GAP',
      evidenceState:
        input.discoverability === 'UNAVAILABLE'
          ? 'UNAVAILABLE'
          : 'OBSERVED',
      statement:
        'Observed site discoverability is weak or unavailable: ' +
        'the page lacks sufficient crawl or internal-link evidence.',
    });
  }
  if (
    input.access === 'BLOCKED' ||
    input.access === 'PARTIAL'
  ) {
    out.push({
      reason: 'ACCESS_GAP',
      evidenceState: 'OBSERVED',
      statement:
        'Observed crawl access shows a barrier (status, redirect chain, ' +
        'or indexability signal). Ordinary browser access is not evidence ' +
        'of agent access.',
    });
  }
  if (
    input.content === 'WEAK' ||
    input.content === 'PARTIAL'
  ) {
    out.push({
      reason: 'CONTENT_CLARITY_GAP',
      evidenceState: 'OBSERVED',
      statement:
        'Important information is only partially represented in observed ' +
        'page signals (title, headings, extracted content).',
    });
  }
  if (
    input.entity === 'CONFLICTING' ||
    input.entity === 'PARTIAL'
  ) {
    out.push({
      reason: 'ENTITY_GAP',
      evidenceState: 'OBSERVED',
      statement:
        'Business entity signals are ambiguous or inconsistent across ' +
        'observed sources.',
    });
  }
  if (
    input.offering === 'MISSING' ||
    input.offering === 'PARTIAL'
  ) {
    out.push({
      reason: 'OFFERING_GAP',
      evidenceState:
        input.offering === 'MISSING' ? 'OBSERVED' : 'INFERRED',
      statement:
        'The offering lacks a clearly mapped page or supporting topic context.',
    });
  }
  if (
    input.evidenceSupport === 'WEAK' ||
    input.evidenceSupport === 'UNAVAILABLE'
  ) {
    out.push({
      reason: 'EVIDENCE_GAP',
      evidenceState:
        input.evidenceSupport === 'UNAVAILABLE'
          ? 'UNAVAILABLE'
          : 'OBSERVED',
      statement:
        'Supporting evidence within observed site content is weak or unavailable.',
    });
  }
  if (input.structured === 'CONFLICTING') {
    out.push({
      reason: 'STRUCTURED_DATA_GAP',
      evidenceState: 'OBSERVED',
      statement:
        'Observed structured data conflicts with visible page or business identity.',
    });
  }
  if (
    input.internalSupport === 'WEAK' ||
    input.internalSupport === 'PARTIAL'
  ) {
    out.push({
      reason: 'INTERNAL_SUPPORT_GAP',
      evidenceState: 'OBSERVED',
      statement:
        'Internal support for this page is weak: few or no observed inbound ' +
        'internal links.',
    });
  }
  if (input.freshness === 'STALE') {
    out.push({
      reason: 'FRESHNESS_GAP',
      evidenceState: 'OBSERVED',
      statement:
        'Observed crawl age is stale. Crawl age is not content age.',
    });
  }
  if (input.actionability === 'UNKNOWN') {
    out.push({
      reason: 'ACTIONABILITY_GAP',
      evidenceState: 'UNAVAILABLE',
      statement:
        'No observable next-step action was found in available page evidence.',
    });
  }
  if (
    !input.logAvailable ||
    input.agentActivity === 'UNKNOWN'
  ) {
    out.push({
      reason: 'AGENT_EVIDENCE_UNAVAILABLE',
      evidenceState: 'UNAVAILABLE',
      statement:
        'No agent log evidence is available. Coverage is unknown, not zero.',
    });
  }
  return out.sort(
    (a, b) =>
      PRECEDENCE.indexOf(a.reason) -
      PRECEDENCE.indexOf(b.reason),
  );
}

/* ---------- 21. NBA MAPPING (existing vocabulary) ---------- */

export function mapReasonToNba(
  reason: AgentReadinessReason,
): AgentNbaCategory {
  switch (reason) {
    case 'DISCOVERY_GAP':
      return 'FIX_TECHNICAL';
    case 'ACCESS_GAP':
      return 'FIX_AI_AGENT_ACCESS';
    case 'CONTENT_CLARITY_GAP':
      return 'IMPROVE_EXISTING_PAGE';
    case 'ENTITY_GAP':
      return 'IMPROVE_EXISTING_PAGE';
    case 'OFFERING_GAP':
      return 'CREATE_CONTENT';
    case 'EVIDENCE_GAP':
      return 'CREATE_CONTENT';
    case 'STRUCTURED_DATA_GAP':
      return 'FIX_TECHNICAL';
    case 'INTERNAL_SUPPORT_GAP':
      return 'INTERNAL_LINK';
    case 'FRESHNESS_GAP':
      return 'MONITOR_CHANGE';
    case 'ACTIONABILITY_GAP':
      return 'IMPROVE_EXISTING_PAGE';
    case 'AGENT_EVIDENCE_UNAVAILABLE':
      return 'MONITOR_CHANGE';
    default:
      return 'MONITOR_CHANGE';
  }
}

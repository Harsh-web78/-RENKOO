/*
 * =========================================================
 * COMPETITIVE MOVEMENT + GAP INTELLIGENCE 1.0 — pure
 * functions (Phase 27).
 *
 * "Where is my competitor actually winning?"
 * Observed presence only — never superiority, never
 * dominance, never market share, never causal claims.
 *
 * Research grounding (Sept 2026):
 * - Semrush Keyword Gap (Missing/Weak/Untapped, ≤5
 *   domains) vs Ahrefs Content Gap (≤10): keyword
 *   portfolios compared, filtered by intent/volume/
 *   difficulty, tiered by winnability (VENDOR product
 *   facts; practitioner workflow).
 * - Vendor exports disagree (separate crawlers/models);
 *   GSC is the only first-party truth for own pages
 *   (practitioner consensus, INFERENCE-grade).
 * - AI competitive: Profound (enterprise source-level),
 *   Peec (mid-market share-of-voice), Otterly
 *   (budget), ZipTie (AIO); share-of-voice = % answers
 *   naming/citing; answers vary run-to-run (VENDOR).
 * - Engines differ (AIO ~4.8 tools/answer vs ChatGPT
 *   ~1.0; Foglift benchmark): per-surface evidence,
 *   never blended.
 *
 * Forbidden: CompetitorScore, ThreatScore,
 * DominanceScore, MarketShareScore, CompetitiveScore,
 * AICompetitorScore; "because competitor", "competitor
 * caused", "competitor is better", "competitor
 * dominates". Allowed: observed, present, absent from
 * available evidence, higher/lower position, cited,
 * mentioned, covered, missing.
 * =========================================================
 */

export type CompetitorIdentity =
  | 'CONFIGURED'
  | 'OBSERVED'
  | 'INFERRED'
  | 'UNKNOWN';

export type CompetitiveMovement =
  | 'COMPETITOR_ENTERED'
  | 'COMPETITOR_EXITED'
  | 'COMPETITOR_RANK_IMPROVED'
  | 'COMPETITOR_RANK_DECLINED'
  | 'COMPETITOR_CITED'
  | 'COMPETITOR_LOST_CITATION'
  | 'COMPETITOR_MENTION_GAINED'
  | 'COMPETITOR_MENTION_LOST'
  | 'COMPETITOR_SOURCE_GAINED'
  | 'COMPETITOR_SOURCE_LOST'
  | 'COMPETITOR_PAGE_CHANGED'
  | 'COMPETITOR_CLAIM_CHANGED'
  | 'HISTORY_UNAVAILABLE';

export type GoogleView =
  | 'COMPETITOR_VISIBLE'
  | 'OWN_SITE_VISIBLE'
  | 'BOTH_VISIBLE'
  | 'COMPETITOR_ONLY'
  | 'OWN_ONLY'
  | 'NEITHER'
  | 'UNKNOWN';

export type AiView =
  | 'OWN_MENTIONED'
  | 'OWN_CITED'
  | 'COMPETITOR_MENTIONED'
  | 'COMPETITOR_CITED'
  | 'BOTH_OBSERVED'
  | 'NOT_OBSERVED'
  | 'UNAVAILABLE';

export type PresenceSplit =
  | 'COMPETITOR_GOOGLE_ONLY'
  | 'COMPETITOR_AI_ONLY'
  | 'COMPETITOR_BOTH'
  | 'OWN_GOOGLE_ONLY'
  | 'OWN_AI_ONLY'
  | 'BOTH_VISIBLE'
  | 'NEITHER_OBSERVED';

export type CriterionDuel =
  | 'OWN_COVERED'
  | 'COMPETITOR_COVERED'
  | 'BOTH_COVERED'
  | 'OWN_MISSING'
  | 'COMPETITOR_MISSING'
  | 'UNKNOWN';

export type ClaimDuel =
  | 'OWN_SUPPORTED'
  | 'COMPETITOR_SUPPORTED'
  | 'BOTH_SUPPORTED'
  | 'OWN_MISSING'
  | 'COMPETITOR_MISSING'
  | 'CONFLICTING'
  | 'UNAVAILABLE';

export type CompetitiveGap =
  | 'MISSING_CUSTOMER_CRITERION'
  | 'COMPETITOR_UNIQUE_INFORMATION'
  | 'MISSING_PAGE'
  | 'MISSING_CLAIM'
  | 'COMPETITOR_AI_CITATION'
  | 'COMPETITOR_AI_MENTION'
  | 'COMPETITOR_GOOGLE_VISIBILITY'
  | 'THIRD_PARTY_REPRESENTATION_GAP'
  | 'FRESHNESS_GAP'
  | 'ENTITY_CONSISTENCY_GAP'
  | 'INTERNAL_SUPPORT_GAP'
  | 'AUTHORITY_EVIDENCE_GAP'
  | 'LOCAL_EVIDENCE_GAP'
  | 'SERP_FEATURE_GAP';

export const CANNOT_MEASURE: readonly string[] = [
  'Competitor presence is observed, never superiority: evidence does not establish why a competitor was selected.',
  'Absence from available evidence is not proof of non-visibility.',
  'Citation is not truth; mention is not endorsement.',
  'Competitor history is unavailable without historical observations.',
  'Revenue impact of competitive gaps is never inferred: no competitor stole revenue.',
];

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function norm(value: unknown): string {
  return clean(value).toLowerCase();
}

/* ---------- identity ---------- */

export function identifyCompetitor(input: {
  configured: boolean;
  observedInEvidence: boolean;
  inferredFromSerp: boolean;
}): CompetitorIdentity {
  if (input.configured) return 'CONFIGURED';
  if (input.observedInEvidence) return 'OBSERVED';
  if (input.inferredFromSerp) return 'INFERRED';
  return 'UNKNOWN';
}

/* ---------- Google view ---------- */

export function googleView(
  ownVisible: boolean | null,
  competitorVisible: boolean | null,
): GoogleView {
  if (ownVisible === null || competitorVisible === null)
    return 'UNKNOWN';
  if (ownVisible && competitorVisible) return 'BOTH_VISIBLE';
  if (!ownVisible && competitorVisible)
    return 'COMPETITOR_ONLY';
  if (ownVisible && !competitorVisible) return 'OWN_ONLY';
  return 'NEITHER';
}

/* ---------- AI view ---------- */

export function aiView(
  ownMentioned: boolean | null,
  ownCited: boolean | null,
  competitorMentioned: boolean | null,
  competitorCited: boolean | null,
): AiView {
  const anyNull =
    ownMentioned === null ||
    ownCited === null ||
    competitorMentioned === null ||
    competitorCited === null;
  if (anyNull) return 'UNAVAILABLE';
  const own = ownMentioned || ownCited;
  const competitor = competitorMentioned || competitorCited;
  if (own && competitor) return 'BOTH_OBSERVED';
  if (!own && !competitor) return 'NOT_OBSERVED';
  if (competitorCited && !ownCited)
    return 'COMPETITOR_CITED';
  if (competitorMentioned && !ownMentioned)
    return 'COMPETITOR_MENTIONED';
  if (ownCited) return 'OWN_CITED';
  return 'OWN_MENTIONED';
}

export function aiAdvantageObserved(
  view: AiView,
): boolean {
  return (
    view === 'COMPETITOR_CITED' ||
    view === 'COMPETITOR_MENTIONED'
  );
}

/* ---------- presence split ---------- */

export function presenceSplit(
  googleOwn: boolean | null,
  googleCompetitor: boolean | null,
  aiOwn: boolean | null,
  aiCompetitor: boolean | null,
): PresenceSplit {
  if (
    googleOwn === null ||
    googleCompetitor === null ||
    aiOwn === null ||
    aiCompetitor === null
  )
    return 'NEITHER_OBSERVED';
  if (googleCompetitor && aiCompetitor)
    return 'COMPETITOR_BOTH';
  if (googleCompetitor && !aiCompetitor)
    return 'COMPETITOR_GOOGLE_ONLY';
  if (aiCompetitor && !googleCompetitor)
    return 'COMPETITOR_AI_ONLY';
  if (googleOwn && aiOwn) return 'BOTH_VISIBLE';
  if (googleOwn && !aiOwn) return 'OWN_GOOGLE_ONLY';
  if (aiOwn && !googleOwn) return 'OWN_AI_ONLY';
  return 'NEITHER_OBSERVED';
}

/* ---------- criterion + claim duels ---------- */

export function criterionDuel(
  ownCovered: boolean | null,
  competitorCovered: boolean | null,
): CriterionDuel {
  if (ownCovered === null || competitorCovered === null)
    return 'UNKNOWN';
  if (ownCovered && competitorCovered)
    return 'BOTH_COVERED';
  if (!ownCovered && competitorCovered)
    return 'COMPETITOR_COVERED';
  if (ownCovered && !competitorCovered)
    return 'OWN_COVERED';
  return 'OWN_MISSING';
}

export function claimDuel(
  ownSupported: boolean | null,
  competitorSupported: boolean | null,
  conflicting: boolean,
): ClaimDuel {
  if (conflicting) return 'CONFLICTING';
  if (ownSupported === null || competitorSupported === null)
    return 'UNAVAILABLE';
  if (ownSupported && competitorSupported)
    return 'BOTH_SUPPORTED';
  if (!ownSupported && competitorSupported)
    return 'COMPETITOR_SUPPORTED';
  if (ownSupported && !competitorSupported)
    return 'OWN_SUPPORTED';
  return 'OWN_MISSING';
}

/* ---------- unique information ---------- */

export function uniqueInformation(
  competitorHas: boolean | null,
  ownHas: boolean | null,
): 'COMPETITOR_UNIQUE_CLAIM_OBSERVED' | 'OWN_UNIQUE_CLAIM_OBSERVED' | 'SHARED_CLAIM' | 'CLAIM_UNAVAILABLE' {
  if (competitorHas === null || ownHas === null)
    return 'CLAIM_UNAVAILABLE';
  if (competitorHas && !ownHas)
    return 'COMPETITOR_UNIQUE_CLAIM_OBSERVED';
  if (ownHas && !competitorHas)
    return 'OWN_UNIQUE_CLAIM_OBSERVED';
  return 'SHARED_CLAIM';
}

/* ---------- gaps → existing actions ---------- */

export function mapCompetitiveGapToAction(
  gap: CompetitiveGap,
):
  | 'IMPROVE_PAGE'
  | 'CREATE'
  | 'OPTIMIZE_PAGE'
  | 'INTERNAL_LINK'
  | 'AUTHORITY'
  | 'LOCAL'
  | 'MONITOR' {
  switch (gap) {
    case 'MISSING_CUSTOMER_CRITERION':
      return 'IMPROVE_PAGE';
    case 'MISSING_PAGE':
      return 'CREATE';
    case 'MISSING_CLAIM':
    case 'COMPETITOR_AI_CITATION':
    case 'COMPETITOR_AI_MENTION':
    case 'COMPETITOR_GOOGLE_VISIBILITY':
    case 'SERP_FEATURE_GAP':
      return 'OPTIMIZE_PAGE';
    case 'INTERNAL_SUPPORT_GAP':
      return 'INTERNAL_LINK';
    case 'AUTHORITY_EVIDENCE_GAP':
      return 'AUTHORITY';
    case 'LOCAL_EVIDENCE_GAP':
      return 'LOCAL';
    case 'COMPETITOR_UNIQUE_INFORMATION':
    case 'THIRD_PARTY_REPRESENTATION_GAP':
    case 'FRESHNESS_GAP':
    case 'ENTITY_CONSISTENCY_GAP':
    default:
      return 'MONITOR';
  }
}

export function gapStatement(
  competitorName: string,
  detail: string,
): string {
  return (
    `Competitor ${clean(competitorName) || 'page'} was observed: ` +
    `${clean(detail)} Present in available evidence only — never superiority, never causation.`
  );
}

export function domainOf(url: unknown): string | null {
  try {
    const host = new URL(clean(url)).hostname
      .toLowerCase()
      .replace(/^www\./, '');
    return host.includes('.') ? host : null;
  } catch {
    return null;
  }
}

export { norm as normalizeCompetitorText };

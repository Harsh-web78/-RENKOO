/*
 * =========================================================
 * SEARCH OPPORTUNITY COMMAND CENTER 1.0 — pure decision
 * layer (Phase 17).
 *
 * Composition + decision over EXISTING systems only:
 * roadmap priorities, EvidenceFusion NBA, baseline
 * opportunities, commercial capture, link recommendations,
 * AI Search OS, agent readiness, unified opportunities.
 *
 * Forbidden: growthScore, impactScore, AI score, ROI
 * score, probability or chance-of-ranking scores, second
 * priority systems, second roadmaps, fake opportunities,
 * revenue estimates, causal claims, unavailable-as-zero.
 *
 * Selection order: existing HIGH → MEDIUM → LOW, then
 * evidence strength, business relevance, actionability,
 * stable deterministic tie-break (id).
 * =========================================================
 */

export type CommandEvidenceState =
  | 'VERIFIED'
  | 'OBSERVED'
  | 'INFERRED'
  | 'ESTIMATED'
  | 'UNAVAILABLE';

export type OpportunityStatus =
  | 'READY'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'OBSERVED'
  | 'UNAVAILABLE';

export type OpportunityCategory =
  | 'RANKING'
  | 'CONTENT'
  | 'TECHNICAL'
  | 'INTERNAL_LINK'
  | 'AI_SEARCH'
  | 'COMMERCIAL_SEARCH'
  | 'CTR'
  | 'AUTHORITY'
  | 'MEASUREMENT'
  | 'BUSINESS_OUTCOME';

export type OpportunityPriority =
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW';

export interface OpportunityEvidence {
  source: string;
  label: string;
  evidenceState: CommandEvidenceState;
}

export interface NormalizedOpportunity {
  id: string;
  category: OpportunityCategory;
  title: string;
  pageUrl: string | null;
  keyword: string | null;
  topic: string | null;
  priority: OpportunityPriority;
  actionType: string;
  why: string[];
  evidence: OpportunityEvidence[];
  measurement: string;
  sources: string[];
  status: OpportunityStatus;
  businessFlags: string[];
}

export const CANNOT_MEASURE: readonly string[] = [
  'Ranking probability is unavailable: RENKOO never predicts chances of ranking.',
  'Monetary upside is unavailable: business relevance is descriptive, never a revenue estimate.',
  'Causal impact of any single action is unavailable: results are observed after action, never caused by it.',
  'Zero-click session counts are unavailable: low CTR is not proven zero-click.',
  'AI referral traffic is unavailable where not observed — never treated as zero.',
];

export function normUrl(value: unknown): string | null {
  let raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return null;
  raw = raw.split('?')[0].split('#')[0];
  raw = raw.replace(/^https?:\/\//, '');
  raw = raw.replace(/^www\./, '');
  raw = raw.replace(/\/+$/, '');
  return raw || null;
}

export function normKeyword(value: unknown): string | null {
  const raw = String(value ?? '').trim().toLowerCase();
  return raw || null;
}

export function normTopic(value: unknown): string | null {
  const raw = String(value ?? '').trim().toLowerCase();
  return raw || null;
}

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

const PRIORITY_RANK: Record<OpportunityPriority, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

function priorityOf(value: unknown): OpportunityPriority {
  const upper = clean(value).toUpperCase();
  if (upper === 'HIGH' || upper === 'H') return 'HIGH';
  if (upper === 'LOW' || upper === 'L') return 'LOW';
  return 'MEDIUM';
}

/* ---------- normalization ---------- */

export interface RawCandidate {
  id?: unknown;
  category?: unknown;
  title?: unknown;
  pageUrl?: unknown;
  keyword?: unknown;
  topic?: unknown;
  priority?: unknown;
  actionType?: unknown;
  why?: unknown;
  evidence?: unknown;
  measurement?: unknown;
  source?: unknown;
  status?: unknown;
  businessFlags?: unknown;
}

const VALID_CATEGORIES = new Set<string>([
  'RANKING',
  'CONTENT',
  'TECHNICAL',
  'INTERNAL_LINK',
  'AI_SEARCH',
  'COMMERCIAL_SEARCH',
  'CTR',
  'AUTHORITY',
  'MEASUREMENT',
  'BUSINESS_OUTCOME',
]);

export function normalizeCandidate(
  raw: RawCandidate,
): NormalizedOpportunity | null {
  const title = clean(raw.title);
  const actionType = clean(raw.actionType);
  if (!title || !actionType) return null;
  const categoryRaw = clean(raw.category)
    .toUpperCase()
    .replaceAll(' ', '_');
  const category: OpportunityCategory = VALID_CATEGORIES.has(
    categoryRaw,
  )
    ? (categoryRaw as OpportunityCategory)
    : 'CONTENT';
  const why = Array.isArray(raw.why)
    ? raw.why.map(clean).filter(Boolean).slice(0, 3)
    : [];
  const evidence = Array.isArray(raw.evidence)
    ? raw.evidence
        .map((entry) => {
          if (!entry || typeof entry !== 'object')
            return null;
          const record = entry as Record<string, unknown>;
          return {
            source: clean(record.source) || 'stored evidence',
            label: clean(record.label) || 'observed signal',
            evidenceState: ([
              'VERIFIED',
              'OBSERVED',
              'INFERRED',
              'ESTIMATED',
              'UNAVAILABLE',
            ].includes(clean(record.evidenceState).toUpperCase())
              ? clean(record.evidenceState).toUpperCase()
              : 'UNAVAILABLE') as CommandEvidenceState,
          };
        })
        .filter(
          (entry): entry is OpportunityEvidence =>
            entry !== null,
        )
        .slice(0, 12)
    : [];
  const statusRaw = clean(raw.status).toUpperCase();
  const status: OpportunityStatus = ([
    'READY',
    'IN_PROGRESS',
    'BLOCKED',
    'OBSERVED',
    'UNAVAILABLE',
  ].includes(statusRaw)
    ? statusRaw
    : 'READY') as OpportunityStatus;
  return {
    id: clean(raw.id) || `${actionType}:${normUrl(raw.pageUrl) ?? ''}:${normKeyword(raw.keyword) ?? ''}`,
    category,
    title,
    pageUrl: clean(raw.pageUrl) || null,
    keyword: clean(raw.keyword) || null,
    topic: clean(raw.topic) || null,
    priority: priorityOf(raw.priority),
    actionType,
    why,
    evidence,
    measurement:
      clean(raw.measurement) ||
      'Track position, clicks, CTR and connected outcomes before and after action. Observed change — never causal proof.',
    sources: clean(raw.source)
      ? [clean(raw.source)]
      : [],
    status,
    businessFlags: Array.isArray(raw.businessFlags)
      ? raw.businessFlags.map(clean).filter(Boolean)
      : [],
  };
}

/* ---------- dedup: actionType + url + keyword ---------- */

export function dedupeKey(
  opp: NormalizedOpportunity,
): string {
  return [
    opp.actionType.toUpperCase(),
    normUrl(opp.pageUrl) ?? '',
    normKeyword(opp.keyword) ?? '',
  ].join('|');
}

export function dedupeOpportunities(
  list: NormalizedOpportunity[],
): NormalizedOpportunity[] {
  const byKey = new Map<string, NormalizedOpportunity>();
  for (const opp of list) {
    const key = dedupeKey(opp);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...opp,
        evidence: [...opp.evidence],
        why: [...opp.why],
        sources: [...opp.sources],
        businessFlags: [...opp.businessFlags],
      });
      continue;
    }
    /* Merge: keep stronger priority, union evidence
     * (≤12), reasons (≤3), sources and flags. */
    if (
      PRIORITY_RANK[opp.priority] <
      PRIORITY_RANK[existing.priority]
    ) {
      existing.priority = opp.priority;
      existing.title = opp.title || existing.title;
    }
    const seenEvidence = new Set(
      existing.evidence.map(
        (entry) => `${entry.source}|${entry.label}`,
      ),
    );
    for (const entry of opp.evidence) {
      const fingerprint = `${entry.source}|${entry.label}`;
      if (!seenEvidence.has(fingerprint)) {
        seenEvidence.add(fingerprint);
        if (existing.evidence.length < 12)
          existing.evidence.push(entry);
      }
    }
    for (const reason of opp.why) {
      if (
        !existing.why.includes(reason) &&
        existing.why.length < 3
      )
        existing.why.push(reason);
    }
    for (const source of opp.sources) {
      if (!existing.sources.includes(source))
        existing.sources.push(source);
    }
    for (const flag of opp.businessFlags) {
      if (!existing.businessFlags.includes(flag))
        existing.businessFlags.push(flag);
    }
  }
  return [...byKey.values()];
}

/* ---------- diversity caps ---------- */

export const DIVERSITY_CAPS = {
  perUrl: 2,
  perKeyword: 2,
  perTopic: 2,
  perCategory: 3,
} as const;

export function diversify(
  list: NormalizedOpportunity[],
): NormalizedOpportunity[] {
  const urlCount = new Map<string, number>();
  const keywordCount = new Map<string, number>();
  const topicCount = new Map<string, number>();
  const categoryCount = new Map<string, number>();
  const out: NormalizedOpportunity[] = [];
  for (const opp of list) {
    const url = normUrl(opp.pageUrl) ?? '';
    const keyword = normKeyword(opp.keyword) ?? '';
    const topic = normTopic(opp.topic) ?? '';
    if (
      url &&
      (urlCount.get(url) ?? 0) >= DIVERSITY_CAPS.perUrl
    )
      continue;
    if (
      keyword &&
      (keywordCount.get(keyword) ?? 0) >=
        DIVERSITY_CAPS.perKeyword
    )
      continue;
    if (
      topic &&
      (topicCount.get(topic) ?? 0) >= DIVERSITY_CAPS.perTopic
    )
      continue;
    if (
      (categoryCount.get(opp.category) ?? 0) >=
      DIVERSITY_CAPS.perCategory
    )
      continue;
    out.push(opp);
    if (url) urlCount.set(url, (urlCount.get(url) ?? 0) + 1);
    if (keyword)
      keywordCount.set(
        keyword,
        (keywordCount.get(keyword) ?? 0) + 1,
      );
    if (topic)
      topicCount.set(
        topic,
        (topicCount.get(topic) ?? 0) + 1,
      );
    categoryCount.set(
      opp.category,
      (categoryCount.get(opp.category) ?? 0) + 1,
    );
  }
  return out;
}

/* ---------- selection: existing priority first ---------- */

function evidenceStrength(
  opp: NormalizedOpportunity,
): number {
  return opp.evidence.filter(
    (entry) => entry.evidenceState !== 'UNAVAILABLE',
  ).length;
}

function actionabilityRank(
  opp: NormalizedOpportunity,
): number {
  /* READY sorts before IN_PROGRESS before the rest. */
  if (opp.status === 'READY') return 0;
  if (opp.status === 'IN_PROGRESS') return 1;
  return 2;
}

export function compareOpportunities(
  a: NormalizedOpportunity,
  b: NormalizedOpportunity,
): number {
  if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority])
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  const strengthDiff =
    evidenceStrength(b) - evidenceStrength(a);
  if (strengthDiff !== 0) return strengthDiff;
  if (a.businessFlags.length !== b.businessFlags.length)
    return b.businessFlags.length - a.businessFlags.length;
  if (actionabilityRank(a) !== actionabilityRank(b))
    return actionabilityRank(a) - actionabilityRank(b);
  return a.id.localeCompare(b.id);
}

export function selectTopOpportunities(
  list: NormalizedOpportunity[],
  limit = 5,
): NormalizedOpportunity[] {
  const eligible = list.filter(
    (opp) =>
      opp.status !== 'BLOCKED' && opp.title.length > 0,
  );
  const merged = dedupeOpportunities(eligible);
  const ordered = [...merged].sort(compareOpportunities);
  const diverse = diversify(ordered);
  /* Never manufacture: return fewer when fewer exist. */
  return diverse.slice(0, Math.max(0, Math.min(5, limit)));
}

/* ---------- conflicting evidence ---------- */

export function hasConflictingEvidence(
  opp: NormalizedOpportunity,
): boolean {
  const states = new Set(
    opp.evidence.map((entry) => entry.evidenceState),
  );
  /* Mixed availability (some observed, some
   * unavailable) is normal, not conflict. True mixed
   * evidence is surfaced by the service layer joining
   * disagreeing source signals; here: weak-signal mix. */
  void states;
  const weak = opp.evidence.filter(
    (entry) => entry.evidenceState === 'UNAVAILABLE',
  ).length;
  return (
    opp.evidence.length >= 2 &&
    weak > 0 &&
    weak < opp.evidence.length &&
    opp.evidence.some((entry) =>
      /weak|declin|loss|gap/i.test(entry.label),
    )
  );
}

export function mixedEvidenceStatement(
  opp: NormalizedOpportunity,
): string | null {
  if (!hasConflictingEvidence(opp)) return null;
  return `Evidence is mixed for "${opp.title}": some observed signals disagree. No forced conclusion — review the listed sources.`;
}

/* ---------- do-this-first ---------- */

export interface NbaLike {
  category?: unknown;
  title?: unknown;
  keyword?: unknown;
  targetPage?: unknown;
  priority?: unknown;
}

export function selectDoThisFirst(
  opportunities: NormalizedOpportunity[],
  nba: NbaLike | null,
): NormalizedOpportunity | null {
  const actionable = opportunities.filter(
    (opp) =>
      opp.status === 'READY' &&
      opp.evidence.some(
        (entry) => entry.evidenceState !== 'UNAVAILABLE',
      ),
  );
  if (actionable.length === 0) return null;
  if (nba && clean(nba.title)) {
    const nbaKeyword = normKeyword(nba.keyword);
    const nbaPage = normUrl(nba.targetPage);
    const nbaAction = clean(nba.category)
      .toUpperCase()
      .replaceAll(' ', '_');
    const match = actionable.find(
      (opp) =>
        (nbaKeyword !== null &&
          normKeyword(opp.keyword) === nbaKeyword) ||
        (nbaPage !== null &&
          normUrl(opp.pageUrl) === nbaPage) ||
        (nbaAction !== '' &&
          opp.actionType.toUpperCase() === nbaAction),
    );
    if (match) return match;
  }
  return [...actionable].sort(compareOpportunities)[0] ?? null;
}

export const NO_ACTION_CONFIDENCE_NOTE =
  'RENKOO does not have enough evidence for a high-confidence next action yet.';

/* ---------- what changed / risk / working ---------- */

export type ChangeDirection =
  | 'IMPROVED'
  | 'DECLINED'
  | 'GAINED'
  | 'LOST'
  | 'OBSERVED';

export interface ChangeEntry {
  kind: 'RANK' | 'CTR' | 'AI' | 'LEAD' | 'REVENUE' | 'ACTION';
  direction: ChangeDirection;
  label: string;
  detail: string;
}

export function changeStatement(entry: ChangeEntry): string {
  const verb =
    entry.direction === 'IMPROVED'
      ? 'improved'
      : entry.direction === 'DECLINED'
        ? 'declined'
        : entry.direction === 'GAINED'
          ? 'gained'
          : entry.direction === 'LOST'
            ? 'lost'
            : 'observed';
  return `${entry.label} ${verb}. ${entry.detail} Observed alongside current evidence — never claimed as caused by any action.`;
}

export type RiskState = 'AT_RISK' | 'WATCH' | 'NO_EVIDENCE';

export function assessRisk(input: {
  rankingDeclined: boolean | null;
  ctrDeclined: boolean | null;
  aiCitationLost: boolean | null;
  commercialWeak: boolean | null;
  hasEvidence: boolean;
}): RiskState {
  if (!input.hasEvidence) return 'NO_EVIDENCE';
  const hits = [
    input.rankingDeclined,
    input.ctrDeclined,
    input.aiCitationLost,
    input.commercialWeak,
  ].filter((value) => value === true).length;
  if (hits >= 2) return 'AT_RISK';
  if (hits === 1) return 'WATCH';
  const unknowns = [
    input.rankingDeclined,
    input.ctrDeclined,
    input.aiCitationLost,
    input.commercialWeak,
  ].filter((value) => value === null).length;
  if (unknowns === 4) return 'NO_EVIDENCE';
  return 'WATCH';
}

export type HealthState =
  | 'Strong'
  | 'Watch'
  | 'Needs attention'
  | 'Unavailable';

export function healthOf(input: {
  strongSignals: number;
  watchSignals: number;
  riskSignals: number;
  hasEvidence: boolean;
}): HealthState {
  if (!input.hasEvidence) return 'Unavailable';
  if (input.riskSignals >= 2) return 'Needs attention';
  if (
    input.riskSignals === 1 ||
    input.watchSignals >= 2
  )
    return 'Watch';
  if (input.strongSignals > 0) return 'Strong';
  return 'Watch';
}

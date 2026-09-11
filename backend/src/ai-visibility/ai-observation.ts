/*
 * =========================================================
 * AI OBSERVATION MODEL 1.0 (Phase 6 / Parts 5+6+10+11+20+21).
 *
 * Normalized observation over recorded answer text only.
 * Visibility states, denominator-honest metrics, an
 * explainable visibility index (no opaque ML), and
 * historical comparison. Never invents a rank; never
 * mixes UNAVAILABLE into denominators; first run is
 * BASELINE_ESTABLISHED.
 * =========================================================
 */

import { createHash } from 'node:crypto';

export type AiEvidenceState =
  | 'VERIFIED'
  | 'OBSERVED'
  | 'INFERRED'
  | 'ESTIMATED'
  | 'UNAVAILABLE';

export type AiVisibilityState =
  | 'VISIBLE_AND_CITED'
  | 'VISIBLE_NOT_CITED'
  | 'MENTIONED_NOT_CITED'
  | 'NOT_MENTIONED'
  | 'COMPETITOR_DOMINANT'
  | 'UNKNOWN';

export type AiVisibilityBadge =
  | 'TOP_RECOMMENDATION'
  | 'ALTERNATIVE'
  | 'COMPARISON_MENTION'
  | 'SOURCE_CITED'
  | 'SOURCE_NOT_CITED';

export type AiAnswerType =
  | 'DIRECT_ANSWER'
  | 'COMPARISON'
  | 'LIST'
  | 'GUIDE'
  | 'LOCAL_PACK'
  | 'UNKNOWN';

export interface NormalizedObservation {
  prompt: string;
  surface: string;
  provider: string;
  observationMethod: string;
  observedAt: string | null;
  country: string;
  language: string;
  answerHash: string | null;
  brandMentioned: boolean;
  mentionPosition: number | null;
  competitorMentions: string[];
  citedUrls: string[];
  citedDomains: string[];
  sourceOrder: string[];
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'UNKNOWN';
  answerType: AiAnswerType;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  observationState: AiEvidenceState;
  evidence: Array<{
    source: string;
    label: string;
    evidenceType: AiEvidenceState;
  }>;
}

export function hashAnswer(
  text: unknown,
): string | null {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  return createHash('sha256')
    .update(raw.slice(0, 20000))
    .digest('hex')
    .slice(0, 32);
}

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname
      .toLowerCase()
      .replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function normalizeObservation(input: {
  prompt: string;
  surface?: string;
  provider?: string;
  observationMethod?: string;
  observedAt?: string | null;
  country?: string;
  language?: string;
  answerText?: unknown;
  brandMentioned?: boolean;
  brandNames?: string[];
  competitorMentions?: string[];
  citations?: Array<{ url: string }>;
  sentiment?: string;
  answerType?: string;
  checkFailed?: boolean;
}): NormalizedObservation {
  const answerText = String(input.answerText ?? '');
  const failed = input.checkFailed === true;
  const citedUrls = (input.citations ?? [])
    .map((c) => String(c.url ?? '').trim())
    .filter(Boolean)
    .slice(0, 50);
  const citedDomains = Array.from(
    new Set(
      citedUrls
        .map(domainOf)
        .filter((d): d is string => !!d),
    ),
  );
  const brandNames = (input.brandNames ?? [])
    .map((b) => b.trim().toLowerCase())
    .filter(Boolean);
  const lowered = answerText.toLowerCase();
  const brandInText = brandNames.some((b) =>
    b ? lowered.includes(b) : false,
  );
  const brandMentioned = failed
    ? false
    : Boolean(input.brandMentioned) || brandInText;
  const mentionPosition = (() => {
    if (failed || !brandMentioned || !answerText)
      return null;
    let best: number | null = null;
    for (const b of brandNames) {
      if (!b) continue;
      const idx = lowered.indexOf(b);
      if (idx >= 0)
        best =
          best === null ? idx : Math.min(best, idx);
    }
    return best;
  })();
  const sentiment = (() => {
    const s = String(input.sentiment ?? '').toUpperCase();
    if (s === 'POSITIVE' || s === 'NEGATIVE') return s;
    if (/excellent|best|highly recommend|outstanding/.test(lowered))
      return 'POSITIVE';
    if (/avoid|poor|worst|scam/.test(lowered))
      return 'NEGATIVE';
    if (!answerText) return 'UNKNOWN';
    return 'NEUTRAL';
  })() as NormalizedObservation['sentiment'];
  const answerType = (() => {
    const t = String(input.answerType ?? '').toUpperCase();
    if (
      ['DIRECT_ANSWER', 'COMPARISON', 'LIST', 'GUIDE', 'LOCAL_PACK'].includes(t)
    )
      return t as AiAnswerType;
    if (/\bvs\b|versus|compare/i.test(answerText))
      return 'COMPARISON';
    if (/^\s*(1\.|- )/m.test(answerText)) return 'LIST';
    return answerText ? 'DIRECT_ANSWER' : 'UNKNOWN';
  })();
  const observationState: AiEvidenceState = failed
    ? 'UNAVAILABLE'
    : !answerText
      ? 'UNAVAILABLE'
      : citedUrls.length > 0
        ? 'OBSERVED'
        : 'INFERRED';
  return {
    prompt: String(input.prompt ?? '').trim(),
    surface: String(input.surface ?? 'UNKNOWN'),
    provider: String(input.provider ?? 'UNKNOWN'),
    observationMethod: String(
      input.observationMethod ?? 'MANUAL_OBSERVATION',
    ),
    observedAt: input.observedAt ?? null,
    country: String(input.country ?? 'US'),
    language: String(input.language ?? 'en'),
    answerHash: hashAnswer(answerText),
    brandMentioned,
    mentionPosition,
    competitorMentions: (input.competitorMentions ?? [])
      .map((c) => String(c ?? '').trim())
      .filter(Boolean)
      .slice(0, 20),
    citedUrls,
    citedDomains,
    sourceOrder: citedDomains.slice(),
    sentiment,
    answerType,
    confidence: failed
      ? 'LOW'
      : citedUrls.length > 0
        ? 'HIGH'
        : answerText
          ? 'MEDIUM'
          : 'LOW',
    observationState,
    evidence:
      observationState === 'UNAVAILABLE'
        ? [
            {
              source: 'AI observations',
              label: 'No usable answer recorded',
              evidenceType: 'UNAVAILABLE',
            },
          ]
        : [
            {
              source: 'AI observations',
              label: `${citedUrls.length} citation(s) extracted from recorded answer`,
              evidenceType: observationState,
            },
          ],
  };
}

/*
 * Visibility resolution. No rank is invented: position
 * fields stay null unless the surface exposes order,
 * and COMPETITOR_DOMINANT requires competitor presence
 * with no brand presence across observable answers.
 */
export function resolveVisibilityState(input: {
  brandMentioned: boolean;
  brandCited: boolean;
  competitorPresent: boolean;
  observationCount: number;
}): AiVisibilityState {
  if (input.observationCount < 1) return 'UNKNOWN';
  if (
    input.competitorPresent &&
    !input.brandMentioned &&
    !input.brandCited
  )
    return 'COMPETITOR_DOMINANT';
  if (input.brandCited) return 'VISIBLE_AND_CITED';
  if (input.brandMentioned) return 'MENTIONED_NOT_CITED';
  return 'NOT_MENTIONED';
}

export function badgesFor(input: {
  brandCited: boolean;
  brandMentioned: boolean;
  competitorPresent: boolean;
  answerType: AiAnswerType;
}): AiVisibilityBadge[] {
  const badges: AiVisibilityBadge[] = [];
  if (input.brandCited) badges.push('SOURCE_CITED');
  else if (input.brandMentioned)
    badges.push('SOURCE_NOT_CITED');
  if (
    input.answerType === 'COMPARISON' &&
    (input.brandMentioned || input.competitorPresent)
  )
    badges.push('COMPARISON_MENTION');
  return badges;
}

/* ---------- denominator-honest metrics ---------- */

export interface AiMetricInput {
  prompt: string;
  observable: boolean;
  brandMentioned: boolean;
  brandCited: boolean;
  competitorMentioned: boolean;
  competitorCited: boolean;
}

export interface AiMetrics {
  promptsTracked: number;
  promptsObservable: number;
  mentionRate: number | null;
  citationRate: number | null;
  competitorMentionRate: number | null;
  competitorCitationRate: number | null;
  citationShare: number | null;
  insufficientData: boolean;
  denominators: Record<string, string>;
}

export function computeAiMetrics(
  rows: AiMetricInput[],
): AiMetrics {
  const tracked = rows.length;
  const observable = rows.filter((r) => r.observable);
  const denominators = {
    mentionRate:
      'prompts with brand mention / prompts with observable answers',
    citationRate:
      'prompts with customer citation / prompts with observable answers',
    competitorMentionRate:
      'prompts with competitor mention / prompts with observable answers',
    competitorCitationRate:
      'prompts with competitor citation / prompts with observable answers',
    citationShare:
      'customer citations / (customer + competitor citations)',
  };
  if (observable.length === 0) {
    return {
      promptsTracked: tracked,
      promptsObservable: 0,
      mentionRate: null,
      citationRate: null,
      competitorMentionRate: null,
      competitorCitationRate: null,
      citationShare: null,
      insufficientData: true,
      denominators,
    };
  }
  const rate = (n: number) => n / observable.length;
  const mentions = observable.filter(
    (r) => r.brandMentioned,
  ).length;
  const cites = observable.filter(
    (r) => r.brandCited,
  ).length;
  const compMentions = observable.filter(
    (r) => r.competitorMentioned,
  ).length;
  const compCites = observable.filter(
    (r) => r.competitorCited,
  ).length;
  const totalCites = cites + compCites;
  return {
    promptsTracked: tracked,
    promptsObservable: observable.length,
    mentionRate: rate(mentions),
    citationRate: rate(cites),
    competitorMentionRate: rate(compMentions),
    competitorCitationRate: rate(compCites),
    citationShare:
      totalCites > 0 ? cites / totalCites : null,
    insufficientData: false,
    denominators,
  };
}

export function metricsByTopic(
  rows: Array<AiMetricInput & { topic: string }>,
): Array<{ topic: string; metrics: AiMetrics }> {
  const byTopic = new Map<string, AiMetricInput[]>();
  for (const r of rows) {
    const key = r.topic.trim().toLowerCase() || 'general';
    const list = byTopic.get(key) ?? [];
    list.push(r);
    byTopic.set(key, list);
  }
  return [...byTopic.entries()].map(([topic, list]) => ({
    topic,
    metrics: computeAiMetrics(list),
  }));
}

/* ---------- explainable visibility index ---------- */

export interface AiVisibilityIndex {
  score: number | null;
  band: 'STRONG' | 'PARTIAL' | 'WEAK' | 'INSUFFICIENT_DATA';
  components: {
    promptCoverage: number | null;
    mentionCoverage: number | null;
    citationCoverage: number | null;
    sourceDiversity: number | null;
    topicCoverage: number | null;
    competitorGap: number | null;
  };
  explanation: string;
}

export function computeVisibilityIndex(input: {
  metrics: AiMetrics;
  uniqueCitedDomains: number;
  topicsCovered: number;
  topicsTotal: number;
}): AiVisibilityIndex {
  const m = input.metrics;
  if (m.insufficientData) {
    return {
      score: null,
      band: 'INSUFFICIENT_DATA',
      components: {
        promptCoverage: null,
        mentionCoverage: null,
        citationCoverage: null,
        sourceDiversity: null,
        topicCoverage: null,
        competitorGap: null,
      },
      explanation:
        'Insufficient observable answers — index withheld, not zero.',
    };
  }
  const promptCoverage =
    m.promptsTracked > 0
      ? m.promptsObservable / m.promptsTracked
      : null;
  const mentionCoverage = m.mentionRate;
  const citationCoverage = m.citationRate;
  const sourceDiversity = Math.min(
    1,
    input.uniqueCitedDomains / 10,
  );
  const topicCoverage =
    input.topicsTotal > 0
      ? input.topicsCovered / input.topicsTotal
      : null;
  const competitorGap =
    m.competitorCitationRate === null ||
    m.citationRate === null
      ? null
      : Math.max(
          0,
          1 -
            (m.competitorCitationRate -
              m.citationRate),
        );
  const parts = [
    promptCoverage,
    mentionCoverage,
    citationCoverage,
    sourceDiversity,
    topicCoverage,
    competitorGap,
  ].filter((v): v is number => typeof v === 'number');
  const score =
    parts.length > 0
      ? Math.round(
          (parts.reduce((a, b) => a + b, 0) /
            parts.length) *
            100,
        )
      : null;
  const band =
    score === null
      ? 'INSUFFICIENT_DATA'
      : score >= 60
        ? 'STRONG'
        : score >= 30
          ? 'PARTIAL'
          : 'WEAK';
  return {
    score,
    band,
    components: {
      promptCoverage,
      mentionCoverage,
      citationCoverage,
      sourceDiversity,
      topicCoverage,
      competitorGap,
    },
    explanation: `Index ${score ?? '—'} (${band}) decomposes into prompt, mention, citation, source, topic and competitor components. No prediction, no ranking guarantee.`,
  };
}

/* ---------- historical comparison ---------- */

export type AiHistoryStatus =
  | 'BASELINE_ESTABLISHED'
  | 'GAINED'
  | 'LOST'
  | 'UNCHANGED'
  | 'NEW'
  | 'UNKNOWN';

export function compareHistory<T extends string>(input: {
  before: T[];
  after: T[];
  firstRun: boolean;
}): {
  status: AiHistoryStatus;
  gained: T[];
  lost: T[];
  unchanged: T[];
} {
  if (input.firstRun) {
    return {
      status: 'BASELINE_ESTABLISHED',
      gained: [],
      lost: [],
      unchanged: [...input.after],
    };
  }
  const beforeSet = new Set(input.before);
  const afterSet = new Set(input.after);
  const gained = [...afterSet].filter((x) => !beforeSet.has(x));
  const lost = [...beforeSet].filter((x) => !afterSet.has(x));
  const unchanged = [...afterSet].filter((x) =>
    beforeSet.has(x),
  );
  if (input.before.length === 0 && input.after.length > 0)
    return { status: 'NEW', gained, lost, unchanged };
  if (gained.length > 0 && lost.length === 0)
    return { status: 'GAINED', gained, lost, unchanged };
  if (lost.length > 0 && gained.length === 0)
    return { status: 'LOST', gained, lost, unchanged };
  if (gained.length === 0 && lost.length === 0)
    return { status: 'UNCHANGED', gained, lost, unchanged };
  return { status: 'UNCHANGED', gained, lost, unchanged };
}

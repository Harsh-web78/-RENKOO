import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { KeywordStrategyService } from './keyword-strategy.service';
import {
  KeywordDiagnosisService,
  actionForDiagnosis,
  type DiagnosisType,
} from './keyword-diagnosis.service';
import { ContentStrategyService } from './content-strategy.service';
import {
  linkIdentityKey,
  normalizeKeyword,
  normalizeUrl,
} from './content-strategy.service';

/*
 * =========================================================
 * SEARCH GROWTH ROADMAP 1.0 — "What exactly should I do
 * next?" COMPOSITION ONLY. Reuses Strategy 5.0 priorities,
 * Why-Not-#1 diagnoses, content opportunities, link
 * recommendations, Recommendation/Action lifecycle and
 * crawl facts. Scores nothing new:
 *  - priority: composed from existing strategy priority +
 *    diagnosis precedence + observed demand (HIGH/MED/LOW)
 *  - impact/effort: deterministic planning labels from
 *    the action kind + available evidence (never a score)
 *  - order: fixed dependency ranks (technical eligibility
 *    → page work → internal support → new content →
 *    monitor), then priority, then observed demand
 *
 * Language contract: planning objectives only
 * ("Target: Top 3", "Evidence suggests", "Recommended
 * next step"). No ranking guarantees anywhere.
 *
 * Evidence states reuse the baseline vocabulary:
 * VERIFIED (measured: GSC), OBSERVED (first-party rows:
 * crawl/graph/persisted), INFERRED (deterministic rules
 * over evidence), UNAVAILABLE (never zero, never
 * guessed).
 * =========================================================
 */

export type RoadmapPriority =
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW';

export type RoadmapImpact =
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW';

export type RoadmapEffort =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'UNKNOWN';

export type RoadmapHorizon =
  | 'NOW'
  | 'NEXT_7_DAYS'
  | 'NEXT_30_DAYS'
  | 'ONGOING';

export type RoadmapActionKind =
  | 'IMPROVE_PAGE'
  | 'OPTIMIZE_PAGE'
  | 'CREATE_PAGE'
  | 'CONSOLIDATE_PAGES'
  | 'PROTECT_PAGE'
  | 'TRACK_KEYWORD'
  | 'BUILD_INTERNAL_SUPPORT'
  | 'FIX_TECHNICAL_BLOCKER'
  | 'REFRESH_PAGE'
  | 'MONITOR';

export type RoadmapEvidenceState =
  | 'VERIFIED'
  | 'OBSERVED'
  | 'INFERRED'
  | 'UNAVAILABLE';

export interface RoadmapEvidenceRef {
  source: string;
  label: string;
  evidenceType: RoadmapEvidenceState;
}

export type RoadmapExecutionStatus =
  | 'NOT_STARTED'
  | 'TODO'
  | 'IN_PROGRESS'
  | 'DONE'
  | 'DISMISSED';

export interface RoadmapItem {
  id: string;
  kind: RoadmapActionKind;
  title: string;
  keyword: string | null;
  targetPage: string | null;
  topic: string | null;
  why: string;
  evidence: RoadmapEvidenceRef[];
  evidenceState: RoadmapEvidenceState;
  priority: RoadmapPriority;
  impact: RoadmapImpact;
  effort: RoadmapEffort;
  dependsOn: string[];
  executionStatus: RoadmapExecutionStatus;
  action: {
    id: string;
    status: string;
  } | null;
  recommendation: {
    id: string;
    status: string;
  } | null;
  cta: {
    label: string;
    href: string;
  } | null;
  planNote: string | null;
  ranking: {
    current: number | null;
    target: string;
  } | null;
  observedChange: string | null;
  measurement: {
    keyword: string | null;
    targetPage: string | null;
    identityKey: string;
  };
}

export interface RoadmapCandidate {
  kind: RoadmapActionKind;
  keyword?: unknown;
  targetPage?: unknown;
  topic?: unknown;
  title: string;
  why: string;
  evidence: RoadmapEvidenceRef[];
  strategyPriority?: unknown;
  diagnosisType?: DiagnosisType | null;
  position?: unknown;
  impressions?: unknown;
  clicks?: unknown;
  issueCode?: string;
  recommendationId?: string;
  recommendationStatus?: string;
  existingImpact?: unknown;
  existingEffort?: unknown;
  positionDelta?: unknown;
}

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/*
 * Dependency ranks: page eligibility first, then the
 * page itself, then support around it, then net-new
 * content, then watch-and-measure work.
 */
const KIND_RANK: Record<RoadmapActionKind, number> = {
  FIX_TECHNICAL_BLOCKER: 0,
  CONSOLIDATE_PAGES: 1,
  IMPROVE_PAGE: 2,
  OPTIMIZE_PAGE: 2,
  REFRESH_PAGE: 2,
  BUILD_INTERNAL_SUPPORT: 3,
  CREATE_PAGE: 4,
  PROTECT_PAGE: 5,
  TRACK_KEYWORD: 5,
  MONITOR: 5,
};

const ONGOING_KINDS: RoadmapActionKind[] = [
  'MONITOR',
  'TRACK_KEYWORD',
  'PROTECT_PAGE',
];

const PRIORITY_RANK: Record<RoadmapPriority, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

/*
 * Strategy page mapping → roadmap action kind. Reuses
 * the existing taxonomy; TRACK_KEYWORD covers IGNORE
 * (keep watching, do not work it).
 */
export function kindForMapping(
  mapping: unknown,
  bucket: unknown,
): RoadmapActionKind {
  if (bucket === 'CONSOLIDATE' || mapping === 'CONSOLIDATE') {
    return 'CONSOLIDATE_PAGES';
  }
  switch (mapping) {
    case 'IMPROVE':
      return 'IMPROVE_PAGE';
    case 'OPTIMIZE':
      return 'OPTIMIZE_PAGE';
    case 'CREATE':
      return 'CREATE_PAGE';
    case 'PROTECT':
      return 'PROTECT_PAGE';
    case 'IGNORE':
      return 'TRACK_KEYWORD';
    default:
      return 'MONITOR';
  }
}

/*
 * Priority composes existing signals — never a new
 * score. Technical blockers on pages with observed
 * demand outrank everything (page must be eligible
 * before any other work matters). Otherwise the
 * strategy priority leads, lifted one band when a
 * confirmed Phase 4 diagnosis names the same target.
 */
export function composeRoadmapPriority(input: {
  strategyPriority?: unknown;
  diagnosisType?: DiagnosisType | null;
  isTechnicalBlocker?: boolean;
  impressions?: unknown;
}): RoadmapPriority {
  const base =
    input.strategyPriority === 'HIGH' ||
    input.strategyPriority === 'MEDIUM' ||
    input.strategyPriority === 'LOW'
      ? input.strategyPriority
      : 'LOW';
  if (
    input.isTechnicalBlocker &&
    num(input.impressions) > 0
  ) {
    return 'HIGH';
  }
  const confirmedGap =
    !!input.diagnosisType &&
    input.diagnosisType !== 'NO_CLEAR_GAP' &&
    input.diagnosisType !== 'INSUFFICIENT_DATA';
  if (confirmedGap && base === 'LOW') {
    return 'MEDIUM';
  }
  if (
    confirmedGap &&
    base === 'MEDIUM' &&
    num(input.impressions) >= 1000
  ) {
    return 'HIGH';
  }
  return base;
}

/*
 * Impact is a planning label from observed demand +
 * action kind — never a score, never a guarantee.
 */
export function classifyRoadmapImpact(input: {
  kind: RoadmapActionKind;
  priority: RoadmapPriority;
  impressions?: unknown;
  clicks?: unknown;
  position?: unknown;
  existingImpact?: unknown;
}): RoadmapImpact {
  const existing = input.existingImpact;
  if (
    existing === 'HIGH' ||
    existing === 'MEDIUM' ||
    existing === 'LOW'
  ) {
    return existing;
  }
  const impressions = num(input.impressions);
  const position = num(input.position);
  if (input.kind === 'FIX_TECHNICAL_BLOCKER') {
    return impressions > 0 ? 'HIGH' : 'MEDIUM';
  }
  if (
    input.priority === 'HIGH' &&
    (impressions >= 1000 ||
      (position >= 4 && position <= 10))
  ) {
    return 'HIGH';
  }
  if (
    input.priority === 'HIGH' ||
    impressions >= 300 ||
    num(input.clicks) >= 20
  ) {
    return 'MEDIUM';
  }
  if (
    input.priority === 'MEDIUM' &&
    impressions > 0
  ) {
    return 'MEDIUM';
  }
  return 'LOW';
}

/*
 * Effort is estimated only where the work shape is
 * known (metadata/refresh/link insertion = LOW, page
 * improvement = MEDIUM, net-new/consolidation = HIGH,
 * watch work = LOW). Anything else — including most
 * engineering fixes — is UNKNOWN, never guessed.
 */
const LOW_EFFORT_ISSUE_CODES = [
  'NOINDEX',
  'META',
  'TITLE',
  'DESCRIPTION',
  'CANONICAL',
  'ROBOTS',
];

export function classifyRoadmapEffort(input: {
  kind: RoadmapActionKind;
  issueCode?: string;
  existingEffort?: unknown;
}): RoadmapEffort {
  const existing = input.existingEffort;
  if (
    existing === 'LOW' ||
    existing === 'MEDIUM' ||
    existing === 'HIGH'
  ) {
    return existing;
  }
  switch (input.kind) {
    case 'REFRESH_PAGE':
    case 'BUILD_INTERNAL_SUPPORT':
    case 'MONITOR':
    case 'TRACK_KEYWORD':
    case 'PROTECT_PAGE':
      return 'LOW';
    case 'IMPROVE_PAGE':
    case 'OPTIMIZE_PAGE':
      return 'MEDIUM';
    case 'CREATE_PAGE':
    case 'CONSOLIDATE_PAGES':
      return 'HIGH';
    case 'FIX_TECHNICAL_BLOCKER': {
      const code = String(
        input.issueCode ?? '',
      ).toUpperCase();
      return LOW_EFFORT_ISSUE_CODES.some((k) =>
        code.includes(k),
      )
        ? 'LOW'
        : 'UNKNOWN';
    }
    default:
      return 'UNKNOWN';
  }
}

/*
 * Ranking targets are planning objectives. "Top 3"
 * when there is ground to gain, "Hold Top 3" when
 * the page already defends it. Never an expectation.
 */
export function targetLabelFor(
  position: unknown,
): string {
  const pos = num(position);
  if (pos > 0 && pos <= 3) {
    return 'Hold Top 3';
  }
  return 'Top 3';
}

/*
 * Stable identity so the same underlying task —
 * seen via strategy, recommendations, content or
 * links — collapses to ONE roadmap item and maps to
 * the SAME existing action row.
 */
export function roadmapItemId(input: {
  kind: RoadmapActionKind;
  keyword?: unknown;
  targetPage?: unknown;
}): string {
  const kw = normalizeKeyword(input.keyword ?? '');
  const url = normalizeUrl(input.targetPage ?? '');
  if (input.kind === 'BUILD_INTERNAL_SUPPORT') {
    return `link|${url ?? 'unmapped'}|${kw}`;
  }
  if (input.kind === 'FIX_TECHNICAL_BLOCKER') {
    return `tech|${url ?? 'site'}`;
  }
  if (kw && url) {
    return `${input.kind}|${url}|${kw}`;
  }
  if (kw) {
    return `${input.kind}|${kw}`;
  }
  if (url) {
    return `${input.kind}|${url}`;
  }
  return `${input.kind}|site`;
}

/*
 * CTA per kind, reusing existing surfaces. Diagnosis
 * items reuse actionForDiagnosis hrefs; everything
 * else points at the surface that already executes
 * that work. Null CTA + planNote when RENKOO cannot
 * execute the work yet ("Plan this action", never a
 * fake "Done").
 */
export function ctaForRoadmapItem(
  kind: RoadmapActionKind,
  diagnosisType?: DiagnosisType | null,
): {
  label: string;
  href: string;
} | null {
  if (
    diagnosisType &&
    diagnosisType !== 'NO_CLEAR_GAP' &&
    diagnosisType !== 'INSUFFICIENT_DATA'
  ) {
    const mapped = actionForDiagnosis(diagnosisType);
    if (mapped?.href) {
      return {
        label: mapped.label ?? 'Open recommended surface',
        href: mapped.href,
      };
    }
  }
  switch (kind) {
    case 'IMPROVE_PAGE':
      return {
        label: 'Open content brief',
        href: '/content',
      };
    case 'OPTIMIZE_PAGE':
      return {
        label: 'Open page optimization',
        href: '/content',
      };
    case 'CREATE_PAGE':
      return {
        label: 'Start content brief',
        href: '/content',
      };
    case 'CONSOLIDATE_PAGES':
      return {
        label: 'Open consolidation plan',
        href: '/content',
      };
    case 'REFRESH_PAGE':
      return {
        label: 'Open refresh queue',
        href: '/content',
      };
    case 'BUILD_INTERNAL_SUPPORT':
      return {
        label: 'Open link recommendations',
        href: '/keywords?tab=links',
      };
    case 'FIX_TECHNICAL_BLOCKER':
      return {
        label: 'Open technical issue',
        href: '/technical-seo',
      };
    case 'PROTECT_PAGE':
    case 'TRACK_KEYWORD':
    case 'MONITOR':
      return {
        label: 'Open monitoring',
        href: '/monitoring',
      };
    default:
      return null;
  }
}

function candidateToItem(
  candidate: RoadmapCandidate,
): RoadmapItem {
  const priority = composeRoadmapPriority({
    strategyPriority: candidate.strategyPriority,
    diagnosisType: candidate.diagnosisType ?? null,
    isTechnicalBlocker:
      candidate.kind === 'FIX_TECHNICAL_BLOCKER',
    impressions: candidate.impressions,
  });
  const impact = classifyRoadmapImpact({
    kind: candidate.kind,
    priority,
    impressions: candidate.impressions,
    clicks: candidate.clicks,
    position: candidate.position,
    existingImpact: candidate.existingImpact,
  });
  const effort = classifyRoadmapEffort({
    kind: candidate.kind,
    issueCode: candidate.issueCode,
    existingEffort: candidate.existingEffort,
  });
  const id = roadmapItemId({
    kind: candidate.kind,
    keyword: candidate.keyword,
    targetPage: candidate.targetPage,
  });
  const kw = normalizeKeyword(candidate.keyword ?? '');
  const url = normalizeUrl(
    candidate.targetPage ?? '',
  );
  const position = num(candidate.position);
  const delta = Number(candidate.positionDelta);
  const cta = ctaForRoadmapItem(
    candidate.kind,
    candidate.diagnosisType ?? null,
  );
  const evidenceState: RoadmapEvidenceState =
    candidate.evidence.length === 0
      ? 'UNAVAILABLE'
      : candidate.evidence.some(
            (e) => e.evidenceType === 'VERIFIED',
          )
        ? 'VERIFIED'
        : candidate.evidence.some(
              (e) => e.evidenceType === 'OBSERVED',
            )
          ? 'OBSERVED'
          : 'INFERRED';
  return {
    id,
    kind: candidate.kind,
    title: candidate.title,
    keyword: kw || null,
    targetPage: url,
    topic:
      typeof candidate.topic === 'string' &&
      candidate.topic.trim()
        ? candidate.topic.trim()
        : null,
    why: candidate.why,
    evidence: candidate.evidence,
    evidenceState,
    priority,
    impact,
    effort,
    dependsOn: [],
    executionStatus: 'NOT_STARTED',
    action: null,
    recommendation: candidate.recommendationId
      ? {
          id: candidate.recommendationId,
          status: candidate.recommendationStatus ?? 'OPEN',
        }
      : null,
    cta,
    planNote: cta
      ? null
      : 'Plan this action — RENKOO cannot execute this step yet.',
    ranking:
      position > 0
        ? {
            current: position,
            target: targetLabelFor(position),
          }
        : null,
    /* Observation only: movement seen around the
       work is reported with "after" language —
       never causal attribution. */
    observedChange: Number.isFinite(delta)
      ? delta < 0
        ? `Position improved after recent movement (observed ${Math.abs(delta).toFixed(1)}).`
        : delta > 0
          ? `Position declined after recent movement (observed ${delta.toFixed(1)}).`
          : null
      : null,
    measurement: {
      keyword: kw || null,
      targetPage: url,
      identityKey: id,
    },
  };
}

/*
 * Deduplicate: same stable identity → ONE item.
 * Evidence unions, strongest priority/impact wins,
 * execution state prefers a real action row, CTAs
 * prefer an executable surface.
 */
const EXECUTION_RANK: Record<
  RoadmapExecutionStatus,
  number
> = {
  IN_PROGRESS: 0,
  TODO: 1,
  NOT_STARTED: 2,
  DONE: 3,
  DISMISSED: 4,
};

export function dedupeRoadmapItems(
  items: RoadmapItem[],
): RoadmapItem[] {
  const byId = new Map<string, RoadmapItem>();
  for (const item of items) {
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, { ...item });
      continue;
    }
    const seen = new Set(
      existing.evidence.map(
        (e) => `${e.source}|${e.label}`,
      ),
    );
    for (const ref of item.evidence) {
      if (!seen.has(`${ref.source}|${ref.label}`)) {
        seen.add(`${ref.source}|${ref.label}`);
        existing.evidence.push(ref);
      }
    }
    if (
      PRIORITY_RANK[item.priority] <
      PRIORITY_RANK[existing.priority]
    ) {
      existing.priority = item.priority;
      existing.why = item.why;
    }
    if (
      PRIORITY_RANK[
        item.impact as RoadmapPriority
      ] <
      PRIORITY_RANK[existing.impact as RoadmapPriority]
    ) {
      existing.impact = item.impact;
    }
    if (
      EXECUTION_RANK[item.executionStatus] <
      EXECUTION_RANK[existing.executionStatus]
    ) {
      existing.executionStatus = item.executionStatus;
      existing.action = item.action;
    }
    if (!existing.action && item.action) {
      existing.action = item.action;
    }
    if (!existing.recommendation && item.recommendation) {
      existing.recommendation = item.recommendation;
    }
    if (!existing.cta && item.cta) {
      existing.cta = item.cta;
      existing.planNote = null;
    }
    if (!existing.ranking && item.ranking) {
      existing.ranking = item.ranking;
    }
    if (!existing.observedChange && item.observedChange) {
      existing.observedChange = item.observedChange;
    }
    if (!existing.topic && item.topic) {
      existing.topic = item.topic;
    }
    existing.evidenceState =
      existing.evidence.length === 0
        ? 'UNAVAILABLE'
        : existing.evidence.some(
              (e) => e.evidenceType === 'VERIFIED',
            )
          ? 'VERIFIED'
          : existing.evidence.some(
                (e) => e.evidenceType === 'OBSERVED',
              )
            ? 'OBSERVED'
            : 'INFERRED';
  }
  return [...byId.values()];
}

/*
 * Deterministic order: dependency rank → priority →
 * observed demand (impressions, then clicks) →
 * stable id tiebreak. No scores, fully explainable.
 */
export function orderRoadmapItems(
  items: RoadmapItem[],
): RoadmapItem[] {
  const demandOf = (item: RoadmapItem): number => {
    const impr = item.evidence.find((e) =>
      e.label.toLowerCase().includes('impression'),
    );
    return impr ? 1 : 0;
  };
  return [...items].sort((a, b) => {
    const rank =
      (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9);
    if (rank !== 0) return rank;
    const prio =
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (prio !== 0) return prio;
    const demand = demandOf(b) - demandOf(a);
    if (demand !== 0) return demand;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/*
 * Explicit, minimal dependencies. A technical
 * blocker gates every other item on the same page
 * (eligibility first). Internal support follows the
 * page improvement for the same target (link to the
 * improved page). Nothing else is linked — this is
 * a roadmap, not project management.
 */
export function attachRoadmapDependencies(
  items: RoadmapItem[],
): Array<{
  from: string;
  to: string;
  reason: string;
}> {
  const deps: Array<{
    from: string;
    to: string;
    reason: string;
  }> = [];
  const byTarget = new Map<string, RoadmapItem[]>();
  for (const item of items) {
    const key = item.targetPage ?? 'site';
    const list = byTarget.get(key) ?? [];
    list.push(item);
    byTarget.set(key, list);
  }
  for (const item of items) {
    const group =
      byTarget.get(item.targetPage ?? 'site') ?? [];
    const blocker = group.find(
      (g) =>
        g.kind === 'FIX_TECHNICAL_BLOCKER' &&
        g.id !== item.id,
    );
    if (
      blocker &&
      item.kind !== 'FIX_TECHNICAL_BLOCKER' &&
      !item.dependsOn.includes(blocker.id)
    ) {
      item.dependsOn.push(blocker.id);
      deps.push({
        from: item.id,
        to: blocker.id,
        reason:
          'Page eligibility first — resolve the technical blocker before further work.',
      });
    }
    if (item.kind === 'BUILD_INTERNAL_SUPPORT') {
      const pageWork = group.find(
        (g) =>
          g.kind === 'IMPROVE_PAGE' ||
          g.kind === 'OPTIMIZE_PAGE' ||
          g.kind === 'REFRESH_PAGE',
      );
      if (
        pageWork &&
        !item.dependsOn.includes(pageWork.id)
      ) {
        item.dependsOn.push(pageWork.id);
        deps.push({
          from: item.id,
          to: pageWork.id,
          reason:
            'Improve the target page first, then point internal support at it.',
        });
      }
    }
  }
  return deps;
}

export interface RoadmapHorizons {
  now: RoadmapItem[];
  next7Days: RoadmapItem[];
  next30Days: RoadmapItem[];
  ongoing: RoadmapItem[];
}

/*
 * NOW: unblocked HIGH work (cap 3 — focus beats
 * volume). NEXT 7 DAYS: remaining HIGH + unblocked
 * MEDIUM. NEXT 30 DAYS: everything else, including
 * blocked items waiting on earlier work. ONGOING:
 * watch-and-measure kinds. No dates are promised.
 */
export function assignRoadmapHorizons(
  ordered: RoadmapItem[],
): RoadmapHorizons {
  const horizons: RoadmapHorizons = {
    now: [],
    next7Days: [],
    next30Days: [],
    ongoing: [],
  };
  const blocked = (item: RoadmapItem) =>
    item.dependsOn.length > 0 &&
    item.executionStatus !== 'DONE';
  for (const item of ordered) {
    if (ONGOING_KINDS.includes(item.kind)) {
      horizons.ongoing.push(item);
      continue;
    }
    if (
      item.priority === 'HIGH' &&
      !blocked(item) &&
      horizons.now.length < 3
    ) {
      horizons.now.push(item);
      continue;
    }
    if (
      item.priority === 'HIGH' ||
      (item.priority === 'MEDIUM' && !blocked(item))
    ) {
      horizons.next7Days.push(item);
      continue;
    }
    horizons.next30Days.push(item);
  }
  return horizons;
}

/*
 * Exactly one primary action: the first NOW item.
 * Falls back to NEXT 7 DAYS when NOW is blocked,
 * and to an honest empty state when nothing is
 * evidence-backed.
 */
export function selectDoThisFirst(
  horizons: RoadmapHorizons,
  unavailable: Array<{ key: string }>,
): {
  item: RoadmapItem | null;
  reason: string;
} {
  const first =
    horizons.now.find(
      (i) => i.executionStatus !== 'DONE',
    ) ??
    horizons.now[0] ??
    horizons.next7Days.find(
      (i) => i.executionStatus !== 'DONE',
    ) ??
    horizons.next7Days[0] ??
    null;
  if (!first) {
    const unlocks = unavailable
      .map((u) => u.key)
      .filter(Boolean)
      .slice(0, 3);
    return {
      item: null,
      reason:
        'RENKOO does not have enough evidence to recommend a single first move yet.' +
        (unlocks.length > 0
          ? ` Connect ${unlocks.join(', ')} to unlock the roadmap.`
          : ''),
    };
  }
  return {
    item: first,
    reason: `Strongest evidence-backed move: ${first.why}`,
  };
}

export interface RoadmapComposeInput {
  website: {
    id: string;
    url?: string | null;
    name?: string | null;
  };
  scope: {
    keyword?: string | null;
    page?: string | null;
    topic?: string | null;
  };
  candidates: RoadmapCandidate[];
  existingActions: Array<{
    id: string;
    status: string;
    type?: string;
    recommendationId?: string | null;
    url?: string | null;
    title?: string;
    metadata?: any;
  }>;
  unavailable: Array<{
    key: string;
    reason: string;
    unlocks: string;
  }>;
  generatedAt?: string;
}

function matchActionForItem(
  item: RoadmapItem,
  actions: RoadmapComposeInput['existingActions'],
): RoadmapComposeInput['existingActions'][number] | null {
  for (const action of actions) {
    if (
      action.status === 'DISMISSED' ||
      action.status === 'DONE'
    ) {
      continue;
    }
    if (
      item.recommendation?.id &&
      action.recommendationId === item.recommendation.id
    ) {
      return action;
    }
  }
  const itemUrl = item.targetPage;
  const itemKw = item.keyword ?? '';
  for (const action of actions) {
    if (
      action.status === 'DISMISSED' ||
      action.status === 'DONE'
    ) {
      continue;
    }
    const meta = action.metadata ?? {};
    const metaKw = normalizeKeyword(
      meta.strategyKeyword ??
        meta.keyword ??
        meta.query ??
        '',
    );
    const metaUrl =
      normalizeUrl(meta.targetPage ?? meta.pageUrl ?? '') ??
      normalizeUrl(action.url ?? '');
    if (
      (itemUrl && metaUrl && metaUrl === itemUrl) ||
      (itemKw && metaKw && metaKw === itemKw)
    ) {
      return action;
    }
    if (item.kind === 'BUILD_INTERNAL_SUPPORT') {
      const pair = linkIdentityKey({
        sourceUrl: meta.sourceUrl ?? '',
        targetUrl: meta.targetUrl ?? itemUrl ?? '',
        keyword: meta.keyword ?? itemKw,
      });
      const itemPair = linkIdentityKey({
        sourceUrl: '',
        targetUrl: itemUrl ?? '',
        keyword: itemKw,
      });
      if (
        pair.split('|')[1] === itemPair.split('|')[1]
      ) {
        return action;
      }
    }
  }
  return null;
}

function toExecutionStatus(
  status: string,
): RoadmapExecutionStatus {
  switch (status) {
    case 'IN_PROGRESS':
      return 'IN_PROGRESS';
    case 'TODO':
      return 'TODO';
    case 'DONE':
      return 'DONE';
    case 'DISMISSED':
      return 'DISMISSED';
    default:
      return 'NOT_STARTED';
  }
}

/*
 * Canonical composition: scope filter → items →
 * execution attach → terminal-state exclusion →
 * dedupe → order → dependencies → horizons →
 * do-this-first → progress. Terminal states
 * (DONE/DISMISSED) never re-enter the queue; they
 * count toward progress only.
 */
export function composeRoadmap(
  input: RoadmapComposeInput,
) {
  const scopeKw = normalizeKeyword(
    input.scope.keyword ?? '',
  );
  const scopePage = normalizeUrl(
    input.scope.page ?? '',
  );
  const scopeTopic = (input.scope.topic ?? '')
    .trim()
    .toLowerCase();

  const scoped = input.candidates.filter((c) => {
    /* Terminal recommendation states never re-enter
       the queue — dismissed/completed work stays
       finished unless explicitly reopened upstream. */
    if (
      c.recommendationStatus === 'DISMISSED' ||
      c.recommendationStatus === 'COMPLETED'
    ) {
      return false;
    }
    if (
      scopeKw &&
      normalizeKeyword(c.keyword ?? '') !== scopeKw
    ) {
      return false;
    }
    if (
      scopePage &&
      normalizeUrl(c.targetPage ?? '') !== scopePage
    ) {
      return false;
    }
    if (
      scopeTopic &&
      String(c.topic ?? '')
        .trim()
        .toLowerCase() !== scopeTopic
    ) {
      return false;
    }
    return true;
  });

  let items = scoped.map(candidateToItem);

  const doneKeys = new Set<string>();
  for (const action of input.existingActions) {
    if (
      action.status !== 'DONE' &&
      action.status !== 'DISMISSED'
    ) {
      continue;
    }
    const meta = action.metadata ?? {};
    doneKeys.add(
      roadmapItemId({
        kind: (action.type as RoadmapActionKind) ?? 'MONITOR',
        keyword:
          meta.strategyKeyword ??
          meta.keyword ??
          meta.query ??
          action.title ??
          '',
        targetPage:
          meta.targetPage ?? meta.pageUrl ?? action.url ?? '',
      }),
    );
  }

  for (const item of items) {
    const match = matchActionForItem(
      item,
      input.existingActions,
    );
    if (match) {
      item.action = {
        id: match.id,
        status: match.status,
      };
      item.executionStatus = toExecutionStatus(
        match.status,
      );
    }
  }

  /* Terminal work leaves the queue (progress only). */
  items = items.filter(
    (i) =>
      i.executionStatus !== 'DONE' &&
      i.executionStatus !== 'DISMISSED' &&
      !doneKeys.has(i.id),
  );

  items = dedupeRoadmapItems(items);
  const ordered = orderRoadmapItems(items);
  const dependencies =
    attachRoadmapDependencies(ordered);
  const horizons = assignRoadmapHorizons(ordered);
  const doThisFirst = selectDoThisFirst(
    horizons,
    input.unavailable,
  );

  const executable = ordered.filter(
    (i) => !ONGOING_KINDS.includes(i.kind),
  );
  const priorities = [
    ...executable.slice(0, 5),
    ...ordered
      .filter((i) => ONGOING_KINDS.includes(i.kind))
      .slice(0, Math.max(0, 5 - executable.slice(0, 5).length)),
  ].slice(0, 5);

  const completed = input.existingActions.filter(
    (a) => a.status === 'DONE',
  ).length;
  const inProgress = input.existingActions.filter(
    (a) => a.status === 'IN_PROGRESS',
  ).length;

  const highCount = ordered.filter(
    (i) => i.priority === 'HIGH',
  ).length;
  const keyword =
    input.scope.keyword?.trim() || null;
  const goal = keyword
    ? `Improve ranking for “${keyword}” — path toward stronger rankings, prioritized from current evidence.`
    : input.scope.page
      ? `Grow this page from current evidence — prioritized, executable next steps.`
      : `Grow search visibility from current evidence — your biggest opportunities first.`;

  return {
    website: input.website,
    generatedAt:
      input.generatedAt ?? new Date().toISOString(),
    scope: {
      keyword: keyword,
      page: input.scope.page?.trim() || null,
      topic: input.scope.topic?.trim() || null,
    },
    goal,
    currentState: {
      candidates: ordered.length,
      highPriority: highCount,
      horizons: {
        now: horizons.now.length,
        next7Days: horizons.next7Days.length,
        next30Days: horizons.next30Days.length,
        ongoing: horizons.ongoing.length,
      },
    },
    doThisFirst,
    priorities,
    horizons,
    dependencies,
    progress: {
      total: ordered.length + completed,
      open: ordered.length,
      completed,
      inProgress,
      /* Action completion is reported as work done;
         ranking movement is reported separately as
         observation. Never "x% closer to #1". */
      searchResult: 'Still measuring',
      searchResultNote:
        'Completed actions count finished work. Ranking movement is observed separately — completion alone never implies a ranking gain.',
    },
    evidence: ordered
      .flatMap((i) => i.evidence)
      .filter(
        (e, idx, arr) =>
          arr.findIndex(
            (x) => x.source === e.source && x.label === e.label,
          ) === idx,
      )
      .slice(0, 30),
    unavailable: input.unavailable,
  };
}

@Injectable()
export class KeywordRoadmapService {
  private readonly logger = new Logger(
    KeywordRoadmapService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly strategyService: KeywordStrategyService,
    private readonly diagnosisService: KeywordDiagnosisService,
    private readonly contentStrategyService: ContentStrategyService,
  ) {}

  private async settled<T>(
    label: string,
    fn: Promise<T> | (() => Promise<T>),
  ): Promise<
    | { ok: true; value: T }
    | { ok: false; error: string }
  > {
    try {
      const value =
        typeof fn === 'function' ? await fn() : await fn;
      return { ok: true, value };
    } catch (err) {
      this.logger.warn(
        `roadmap leg failed (${label}): ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /*
   * GET /keywords/roadmap — one composed request.
   * Every leg degrades independently; missing legs
   * render as UNAVAILABLE entries, never zeros.
   */
  async getRoadmap(
    organizationId: string,
    dto: {
      websiteId: string;
      keyword?: string;
      page?: string;
      topic?: string;
      limit?: number;
    },
  ) {
    const website = await this.prisma.website.findFirst({
      where: {
        id: dto.websiteId,
        organizationId,
      },
      select: { id: true, name: true, url: true },
    });
    if (!website) {
      throw new NotFoundException('Website not found');
    }

    const limit =
      Number.isFinite(Number(dto.limit)) &&
      Number(dto.limit) > 0
        ? Math.min(Number(dto.limit), 100)
        : 50;

    const [
      strategyRes,
      diagnosisRes,
      contentRes,
      linksRes,
      orphansRes,
      recsRes,
      actionsRes,
      techRes,
    ] = await Promise.all([
      this.settled('strategy', () =>
        this.strategyService.strategy(organizationId, {
          websiteId: dto.websiteId,
          limit: 100,
        }),
      ),
      this.settled('diagnosis', () =>
        this.diagnosisService.diagnoseBatch(organizationId, {
          websiteId: dto.websiteId,
          keywords: dto.keyword ? [dto.keyword] : [],
          limit: 5,
        }),
      ),
      this.settled('content', () =>
        this.contentStrategyService.getContentOpportunities(
          organizationId,
          { websiteId: dto.websiteId, limit: 50 },
        ),
      ),
      this.settled('links', () =>
        this.contentStrategyService.getLinkRecommendations(
          organizationId,
          dto.websiteId,
          { limit: 20 },
        ),
      ),
      this.settled('orphans', () =>
        this.contentStrategyService.getOrphanIntelligence(
          organizationId,
          dto.websiteId,
          { limit: 10 },
        ),
      ),
      this.settled('recommendations', () =>
        this.prisma.recommendation.findMany({
          where: {
            organizationId,
            websiteId: dto.websiteId,
            status: { in: ['OPEN', 'IN_PROGRESS'] },
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      ),
      this.settled('actions', () =>
        this.prisma.action.findMany({
          where: {
            organizationId,
            websiteId: dto.websiteId,
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      ),
      this.settled('technical', () =>
        this.latestBlockingIssues(organizationId, dto.websiteId),
      ),
    ]);

    const unavailable: Array<{
      key: string;
      reason: string;
      unlocks: string;
    }> = [];
    const candidates: RoadmapCandidate[] = [];

    if (strategyRes.ok) {
      const opps =
        (strategyRes.value as any)?.opportunities ?? [];
      for (const opp of opps.slice(0, limit)) {
        candidates.push({
          kind: kindForMapping(
            (opp as any).pageMapping,
            (opp as any).bucket,
          ),
          keyword: (opp as any).keyword,
          targetPage: (opp as any).targetPage,
          topic: (opp as any).topic,
          title: roadmapTitleFor(
            kindForMapping(
              (opp as any).pageMapping,
              (opp as any).bucket,
            ),
            (opp as any).keyword,
            (opp as any).targetPage,
          ),
          why: roadmapWhyFor(
            (opp as any),
            null,
          ),
          evidence: [
            {
              source: 'Strategy',
              label: `Priority ${(opp as any).priority} · score ${(opp as any).priorityScore ?? '—'}`,
              evidenceType: 'INFERRED',
            },
            ...(((opp as any).impressions ?? 0) > 0
              ? [
                  {
                    source: 'GSC',
                    label: `${Number((opp as any).impressions).toLocaleString('en-US')} impressions at #${Number((opp as any).position).toFixed(1)}`,
                    evidenceType:
                      'VERIFIED' as RoadmapEvidenceState,
                  },
                ]
              : []),
          ],
          strategyPriority: (opp as any).priority,
          position: (opp as any).position,
          impressions: (opp as any).impressions,
          clicks: (opp as any).clicks,
          positionDelta: (opp as any).positionDelta,
        });
      }
    } else {
      unavailable.push({
        key: 'strategy',
        reason: 'Keyword strategy unavailable.',
        unlocks: 'Run keyword strategy to unlock prioritized opportunities.',
      });
    }

    if (diagnosisRes.ok) {
      const diags =
        (diagnosisRes.value as any)?.diagnoses ?? [];
      for (const diag of diags) {
        const primary = (diag as any)
          .primaryDiagnosis as DiagnosisType | undefined;
        if (
          !primary ||
          primary === 'NO_CLEAR_GAP' ||
          primary === 'INSUFFICIENT_DATA'
        ) {
          continue;
        }
        const mapped = actionForDiagnosis(primary);
        const kind = diagnosisKindFor(primary);
        candidates.push({
          kind,
          keyword: (diag as any).keyword,
          targetPage:
            (diag as any).page ??
            (diag as any)?.strategy?.targetPage,
          title: (mapped as any)?.label ?? 'Act on diagnosis',
          why:
            (diag as any)?.explanation?.body ??
            `Primary gap: ${primary}. Evidence suggests this is the binding constraint.`,
          evidence: [
            {
              source: 'Why-Not-#1',
              label: `Primary diagnosis: ${primary}`,
              evidenceType: 'INFERRED',
            },
            ...(((diag as any)?.currentRanking?.impressions ?? 0) > 0
              ? [
                  {
                    source: 'GSC',
                    label: `#${Number((diag as any).currentRanking.position).toFixed(1)} · ${Number((diag as any).currentRanking.impressions).toLocaleString('en-US')} impressions`,
                    evidenceType:
                      'VERIFIED' as RoadmapEvidenceState,
                  },
                ]
              : []),
          ],
          strategyPriority: (diag as any)?.strategy?.priority,
          diagnosisType: primary,
          position: (diag as any)?.currentRanking?.position,
          impressions: (diag as any)?.currentRanking?.impressions,
          clicks: (diag as any)?.currentRanking?.clicks,
          positionDelta: (diag as any)?.currentRanking?.positionDelta,
        });
      }
    } else {
      unavailable.push({
        key: 'diagnosis',
        reason: 'Why-Not-#1 diagnosis unavailable.',
        unlocks: 'Diagnose a keyword to explain the binding constraint.',
      });
    }

    if (contentRes.ok) {
      const opps =
        (contentRes.value as any)?.opportunities ??
        (contentRes.value as any)?.items ??
        [];
      for (const opp of (opps as any[]).slice(0, 20)) {
        const action = String(
          (opp as any).contentAction ??
            (opp as any).action ??
            'IMPROVE',
        ).toUpperCase();
        const kind = (
          [
            'IMPROVE_PAGE',
            'OPTIMIZE_PAGE',
            'CREATE_PAGE',
            'CONSOLIDATE_PAGES',
            'REFRESH_PAGE',
            'PROTECT_PAGE',
          ] as RoadmapActionKind[]
        ).includes(action as RoadmapActionKind)
          ? (action as RoadmapActionKind)
          : 'IMPROVE_PAGE';
        candidates.push({
          kind,
          keyword:
            (opp as any).keyword ??
            (opp as any).targetQuery,
          targetPage:
            (opp as any).targetPage ?? (opp as any).pageUrl,
          topic: (opp as any).topic,
          title: roadmapTitleFor(
            kind,
            (opp as any).keyword ??
              (opp as any).targetQuery,
            (opp as any).targetPage ?? (opp as any).pageUrl,
          ),
          why: `Observed content opportunity: ${String(
            (opp as any).reason ?? (opp as any).detail ?? 'content evidence supports this move',
          ).slice(0, 220)}`,
          evidence: [
            {
              source: 'Content',
              label: `Content action: ${action}`,
              evidenceType: 'OBSERVED',
            },
          ],
          strategyPriority: (opp as any).priority,
          position: (opp as any).position,
          impressions: (opp as any).impressions,
          existingImpact: (opp as any).impact,
          existingEffort: (opp as any).effort,
          recommendationId:
            (opp as any).recommendationId ??
            (opp as any).recommendation?.id,
          recommendationStatus: (opp as any).recommendation
            ?.status,
        });
      }
    } else {
      unavailable.push({
        key: 'content',
        reason: 'Content opportunities unavailable.',
        unlocks: 'Connect content evidence to unlock page work.',
      });
    }

    if (linksRes.ok) {
      const recs =
        (linksRes.value as any)?.recommendations ??
        (linksRes.value as any)?.links ??
        [];
      for (const rec of (recs as any[]).slice(0, 15)) {
        const target =
          (rec as any).targetUrl ?? (rec as any).targetPage;
        const kw =
          (rec as any).keyword ?? (rec as any).topic;
        candidates.push({
          kind: 'BUILD_INTERNAL_SUPPORT',
          keyword: kw,
          targetPage: target,
          topic: (rec as any).topic,
          title: `Build internal support${target ? ` for ${shortTarget(target)}` : ''}`,
          why: `Relevant verified internal-link ${((rec as any).sources?.length ?? 1) > 1 ? 'opportunities exist' : 'opportunity exists'}. Evidence suggests supporting links help the target page.`,
          evidence: [
            {
              source: 'CrawlLink',
              label: `Link evidence: ${String((rec as any).verification?.status ?? (rec as any).status ?? 'recommended')}`,
              evidenceType: 'OBSERVED',
            },
          ],
          strategyPriority: (rec as any).priority,
          recommendationId: (rec as any).id,
          recommendationStatus: (rec as any).status,
        });
      }
    } else {
      unavailable.push({
        key: 'internal-links',
        reason: 'Internal-link recommendations unavailable.',
        unlocks: 'Run a crawl to unlock link support.',
      });
    }

    if (orphansRes.ok) {
      const orphans =
        (orphansRes.value as any)?.orphans ??
        (orphansRes.value as any)?.candidates ??
        [];
      for (const orphan of (orphans as any[]).slice(0, 5)) {
        candidates.push({
          kind: 'BUILD_INTERNAL_SUPPORT',
          keyword: (orphan as any)?.strategy?.keyword,
          targetPage: (orphan as any).url,
          title: `Link orphan candidate ${shortTarget((orphan as any).url ?? 'a page')}`,
          why: 'Observed page with no detected inbound internal links. Evidence suggests orphan pages struggle to accumulate relevance.',
          evidence: [
            {
              source: 'CrawlLink',
              label: 'POTENTIAL_ORPHAN — zero inbound in latest completed crawl',
              evidenceType: 'OBSERVED',
            },
          ],
          strategyPriority: (orphan as any)?.strategy?.priority,
        });
      }
    }

    if (recsRes.ok) {
      for (const rec of (recsRes.value as any[]).slice(
        0,
        30,
      )) {
        const kind = recommendationKindFor(
          String((rec as any).type ?? ''),
          String((rec as any).source ?? ''),
        );
        if (!kind) continue;
        const isAi =
          String((rec as any).source ?? '').toUpperCase() ===
          'AI_VISIBILITY';
        candidates.push({
          kind,
          keyword:
            (rec as any)?.metadata?.query ??
            (rec as any)?.metadata?.keyword ??
            (rec as any)?.metadata?.aiPrompt,
          targetPage:
            (rec as any).pageUrl ??
            (rec as any)?.metadata?.targetUrl ??
            (rec as any)?.metadata?.pageUrl ??
            (rec as any)?.metadata?.aiTargetPage,
          title: String((rec as any).title ?? 'Open recommendation'),
          why: isAi
            ? `${String(
                (rec as any).description ??
                  'AI Search evidence supports this move.',
              ).slice(0, 200)} Measurement: re-run the tracked prompt and compare mention/citation presence against this baseline.`
            : String(
                (rec as any).description ??
                  'Existing recommendation supports this move.',
              ).slice(0, 240),
          evidence: [
            {
              source: isAi ? 'AI Search' : 'Recommendations',
              label: `${(rec as any).source} · ${(rec as any).type}`,
              evidenceType: 'OBSERVED',
            },
          ],
          strategyPriority: (rec as any).priority,
          existingImpact: (rec as any).impact,
          existingEffort: (rec as any).effort,
          recommendationId: (rec as any).id,
          recommendationStatus: (rec as any).status,
        });
      }
    }

    if (techRes.ok) {
      for (const issue of (techRes.value as any[]).slice(
        0,
        10,
      )) {
        candidates.push({
          kind: 'FIX_TECHNICAL_BLOCKER',
          targetPage: (issue as any).pageUrl,
          title: String(
            (issue as any).title ?? 'Fix technical blocker',
          ),
          why: `Growth-critical technical issue: ${String(
            (issue as any).recommendation ??
              (issue as any).description ??
              'page eligibility is at risk',
          ).slice(0, 220)}`,
          evidence: [
            {
              source: 'Crawl',
              label: `${(issue as any).severity} · ${(issue as any).code}`,
              evidenceType: 'OBSERVED',
            },
          ],
          issueCode: String((issue as any).code ?? ''),
        });
      }
    } else {
      unavailable.push({
        key: 'technical',
        reason: 'Technical crawl evidence unavailable.',
        unlocks: 'Run a crawl to surface growth-critical blockers.',
      });
    }

    if (!strategyRes.ok && !diagnosisRes.ok) {
      unavailable.push({
        key: 'demand',
        reason: 'No search demand evidence available.',
        unlocks: 'Connect Google Search Console to unlock demand-backed priorities.',
      });
    }

    const actions = actionsRes.ok
      ? ((actionsRes.value as any[]) ?? []).map((a: any) => ({
          id: String(a.id),
          status: String(a.status),
          type: String(a.type ?? 'GENERAL'),
          recommendationId: a.recommendationId
            ? String(a.recommendationId)
            : null,
          url: (a.url as string | null) ?? null,
          title: a.title as string | undefined,
          metadata: a.metadata as any,
        }))
      : [];

    return composeRoadmap({
      website: {
        id: website.id,
        url: website.url ?? null,
        name: website.name ?? null,
      },
      scope: {
        keyword: dto.keyword,
        page: dto.page,
        topic: dto.topic,
      },
      candidates,
      existingActions: actions,
      unavailable,
    });
  }

  /*
   * Growth-critical blockers only: CRITICAL/HIGH open
   * issues from the latest COMPLETED crawl, bounded.
   * The roadmap is for growth-critical work — never
   * every low-level warning.
   */
  private async latestBlockingIssues(
    organizationId: string,
    websiteId: string,
  ) {
    const crawl = await this.prisma.crawl.findFirst({
      where: { websiteId, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
    });
    if (!crawl) return [];
    const pages = await this.prisma.crawlPage.findMany({
      where: { crawlId: crawl.id },
      select: { id: true, url: true },
      take: 2000,
    });
    if (pages.length === 0) return [];
    const pageIds = pages.map((p) => p.id);
    const urlById = new Map(
      pages.map((p) => [p.id, p.url]),
    );
    void organizationId;
    const issues = await this.prisma.seoIssue.findMany({
      where: {
        crawlPageId: { in: pageIds },
        status: 'OPEN',
        severity: { in: ['CRITICAL', 'HIGH'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return issues.map((issue) => ({
      ...issue,
      pageUrl: urlById.get(issue.crawlPageId) ?? null,
    }));
  }
}

function shortTarget(target: unknown): string {
  const raw = String(target ?? '').trim();
  if (!raw) return 'the target page';
  return raw
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .slice(0, 72);
}

function roadmapTitleFor(
  kind: RoadmapActionKind,
  keyword: unknown,
  targetPage: unknown,
): string {
  const kw = String(keyword ?? '').trim();
  const page = shortTarget(targetPage ?? '');
  switch (kind) {
    case 'IMPROVE_PAGE':
      return `Improve ${page || kw || 'priority page'}`;
    case 'OPTIMIZE_PAGE':
      return `Optimize ${page || kw || 'priority page'}`;
    case 'CREATE_PAGE':
      return kw ? `Create “${kw}”` : 'Create supporting page';
    case 'CONSOLIDATE_PAGES':
      return `Consolidate ${page || kw || 'overlapping pages'}`;
    case 'PROTECT_PAGE':
      return `Protect ${page || kw || 'top performer'}`;
    case 'REFRESH_PAGE':
      return `Refresh ${page || kw || 'declining page'}`;
    default:
      return kw
        ? `${humanKind(kind)} — ${kw}`
        : humanKind(kind);
  }
}

function humanKind(kind: RoadmapActionKind): string {
  switch (kind) {
    case 'IMPROVE_PAGE':
      return 'Improve page';
    case 'OPTIMIZE_PAGE':
      return 'Optimize page';
    case 'CREATE_PAGE':
      return 'Create supporting content';
    case 'CONSOLIDATE_PAGES':
      return 'Consolidate pages';
    case 'PROTECT_PAGE':
      return 'Protect page';
    case 'TRACK_KEYWORD':
      return 'Track keyword';
    case 'BUILD_INTERNAL_SUPPORT':
      return 'Build internal support';
    case 'FIX_TECHNICAL_BLOCKER':
      return 'Fix technical blocker';
    case 'REFRESH_PAGE':
      return 'Refresh page';
    default:
      return 'Monitor';
  }
}

function roadmapWhyFor(
  opp: {
    position?: unknown;
    impressions?: unknown;
    priority?: unknown;
    mappingReason?: unknown;
  },
  diagnosis: { body?: string } | null,
): string {
  if (diagnosis?.body) {
    return String(diagnosis.body).slice(0, 240);
  }
  const pos = num(opp.position);
  const impr = num(opp.impressions);
  if (pos >= 4 && pos <= 20 && impr >= 100) {
    return `Position #${pos.toFixed(1).replace(/\.0$/, '')} with ${impr.toLocaleString('en-US')} impressions — striking distance with observed demand. Evidence suggests this page can move with focused work.`;
  }
  if (impr >= 1000) {
    return `High-impression opportunity (${impr.toLocaleString('en-US')}). Evidence suggests demand already exists.`;
  }
  return String(
    opp.mappingReason ??
      'Recommended next step from current strategy evidence.',
  ).slice(0, 240);
}

/*
 * Phase 4 diagnosis → roadmap kind. Technical and
 * intent problems gate page work; coverage/format/
 * freshness resolve to page work; thin authority and
 * link gaps resolve to internal support first
 * (earned links RENKOO can observe and verify).
 */
function diagnosisKindFor(
  diagnosis: DiagnosisType,
): RoadmapActionKind {
  switch (diagnosis) {
    case 'TECHNICAL_BLOCKER':
      return 'FIX_TECHNICAL_BLOCKER';
    case 'CANNIBALIZATION_RISK':
      return 'CONSOLIDATE_PAGES';
    case 'INTENT_GAP':
    case 'CONTENT_COVERAGE_GAP':
    case 'SERP_FORMAT_GAP':
      return 'IMPROVE_PAGE';
    case 'FRESHNESS_GAP':
      return 'REFRESH_PAGE';
    case 'INTERNAL_LINK_GAP':
    case 'AUTHORITY_GAP':
      return 'BUILD_INTERNAL_SUPPORT';
    default:
      return 'MONITOR';
  }
}

/*
 * Existing recommendation types → roadmap kinds.
 * Unknown types return null (skipped, never forced
 * into a wrong shape).
 */
function recommendationKindFor(
  type: string,
  source: string,
): RoadmapActionKind | null {
  const t = type.toUpperCase();
  const src = source.toUpperCase();
  /*
   * Phase 6 — AI Search actions extend YOUR #1 ROADMAP
   * (no fork). Every AI opportunity is executable via
   * the existing kinds: page work first, internal
   * support for source gaps, net-new for missing
   * coverage. Measurement travels in `why`.
   */
  if (src === 'AI_VISIBILITY') {
    if (
      t.includes('INTERNAL_LINK') ||
      t.includes('SOURCE_PR') ||
      t.includes('SOURCE_GAP') ||
      t.includes('SUPPORTING')
    ) {
      return 'BUILD_INTERNAL_SUPPORT';
    }
    if (
      t.includes('CREATE') ||
      t.includes('PAGE_GAP')
    ) {
      return 'CREATE_PAGE';
    }
    if (t.includes('REFRESH') || t.includes('FRESHNESS')) {
      return 'REFRESH_PAGE';
    }
    if (
      t.includes('CONSOLIDAT') ||
      t.includes('CANNIBAL')
    ) {
      return 'CONSOLIDATE_PAGES';
    }
    if (t.includes('TECHNICAL') || t.includes('BLOCKER')) {
      return 'FIX_TECHNICAL_BLOCKER';
    }
    return 'IMPROVE_PAGE';
  }
  if (
    t.includes('INTERNAL_LINK') ||
    t.includes('ORPHAN') ||
    t.includes('BACKLINK')
  ) {
    return 'BUILD_INTERNAL_SUPPORT';
  }
  if (t.includes('REFRESH')) {
    return 'REFRESH_PAGE';
  }
  if (t.includes('CONSOLIDAT') || t.includes('CANNIBAL')) {
    return 'CONSOLIDATE_PAGES';
  }
  if (
    t.includes('QUICK_WIN') ||
    t.includes('PAGE_ONE') ||
    t.includes('GROWTH') ||
    t.includes('IMPROVE')
  ) {
    return 'IMPROVE_PAGE';
  }
  if (t.includes('CREATE') || t.includes('CONTENT_GAP')) {
    return 'CREATE_PAGE';
  }
  if (t.includes('PROTECT')) {
    return 'PROTECT_PAGE';
  }
  if (t.includes('LOW_CTR') || t.includes('OPTIMIZ')) {
    return 'OPTIMIZE_PAGE';
  }
  if (source.toUpperCase().includes('CONTENT')) {
    return 'IMPROVE_PAGE';
  }
  return null;
}

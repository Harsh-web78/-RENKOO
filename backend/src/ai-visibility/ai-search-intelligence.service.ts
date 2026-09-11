import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  actionForDiagnosis,
  type DiagnosisType,
} from '../keywords/keyword-diagnosis.service';
import {
  classifyRoadmapEffort,
  classifyRoadmapImpact,
  composeRoadmapPriority,
  kindForMapping,
  type RoadmapActionKind,
  type RoadmapImpact,
  type RoadmapEffort,
  type RoadmapPriority,
} from '../keywords/keyword-roadmap.service';
import {
  decideContentAction,
  normalizeKeyword,
  normalizeUrl,
} from '../keywords/content-strategy.service';
import {
  overlapCitedDomains,
  summarizeAiCitations,
  type AiCitationRelationship,
  type AiEvidenceState,
} from './ai-citation.service';
import {
  generatePromptSet,
  type AiPromptCategory,
  type GeneratedAiPrompt,
} from './ai-prompt-set.service';

/*
 * =========================================================
 * AI SEARCH INTELLIGENCE 1.0 (Phase 6 / Phases 5–9).
 *
 * One unified layer over EXISTING evidence:
 *   tracked AI prompts (AiVisibilityQuery)
 *   → recorded observations (AiVisibilityCheck)
 *   → extracted citations (computed on read, INFERRED)
 *   → competitor matrix (tracked Competitor = truth)
 *   → evidence-backed diagnoses (DiagnosisType reuse)
 *   → content opportunities (existing lifecycle shapes)
 *   → roadmap candidates (existing composeRoadmap inputs)
 *   → historical comparison (baseline, never invented)
 *
 * No new tables, no new billing counters, no new
 * scores: priorities reuse composeRoadmapPriority and
 * the HIGH/MEDIUM/LOW bands. No ranking guarantees
 * anywhere in copy.
 * =========================================================
 */

export type AiGapKind =
  | 'AI_VISIBILITY_GAP'
  | 'AI_CITATION_GAP'
  | 'CONTENT_SOURCE_GAP';

export interface AiObservationView {
  prompt: string;
  provider: string;
  observedAt: string | null;
  mentioned: boolean;
  relationship: AiCitationRelationship;
  citedDomains: string[];
  competitorMentions: string[];
  evidenceState: AiEvidenceState;
}

export interface AiPromptComparison {
  prompt: string;
  intent: AiPromptCategory | 'UNKNOWN';
  observations: AiObservationView[];
  prompts: number;
  brandPresent: boolean;
  brandCited: boolean;
  competitorsPresent: string[];
  competitorsCited: string[];
  citedDomains: string[];
  evidenceState: AiEvidenceState;
}

export interface AiGap {
  kind: AiGapKind;
  prompt: string;
  topic: string;
  priority: RoadmapPriority;
  why: string;
  evidence: Array<{
    source: string;
    label: string;
    evidenceType: AiEvidenceState;
  }>;
  evidenceState: AiEvidenceState;
}

export interface AiLosingDiagnosis {
  prompt: string;
  topic: string;
  diagnosis: DiagnosisType;
  headline: string;
  evidence: string[];
  evidenceState: AiEvidenceState;
  action: {
    action: string;
    label: string;
    href: string;
  };
}

export interface AiContentOpportunity {
  topic: string;
  affectedPrompts: string[];
  missingTopics: string[];
  competitorCitedSources: string[];
  citationGap: boolean;
  recommendedPage: string | null;
  decision: 'CREATE' | 'IMPROVE' | 'REFRESH' | 'CONSOLIDATE' | 'MONITOR';
  evidence: string[];
  evidenceState: AiEvidenceState;
}

export interface AiRoadmapCandidate {
  kind: RoadmapActionKind;
  keyword: string | null;
  targetPage: string | null;
  title: string;
  why: string;
  evidence: Array<{
    source: string;
    label: string;
    evidenceType: AiEvidenceState;
  }>;
  strategyPriority: RoadmapPriority;
  impact: RoadmapImpact;
  effort: RoadmapEffort;
  evidenceState: AiEvidenceState;
}

export interface AiPromptTrend {
  prompt: string;
  status:
    | 'BASELINE_ESTABLISHED'
    | 'IMPROVED'
    | 'DECLINED'
    | 'UNCHANGED'
    | 'INSUFFICIENT_DATA';
  mentionChange: number;
  citationChange: number;
  newCompetitors: string[];
  lostCompetitors: string[];
  note: string;
}

const MAX_PROMPTS_PER_WEBSITE = 200;
const MAX_OBSERVATIONS_PER_PROMPT = 100;

function cleanText(value: unknown): string {
  return String(value ?? '').trim();
}

function ownDomainsOfWebsite(
  websiteUrl: unknown,
): string[] {
  try {
    const host = new URL(
      String(websiteUrl ?? ''),
    ).hostname
      .toLowerCase()
      .replace(/^www\./, '');

    return host ? [host] : [];
  } catch {
    return [];
  }
}

/* Phase 5 — prompt × provider × competitor matrix. */
export function buildComparisonMatrix(params: {
  prompts: Array<{
    text: string;
    intent?: AiPromptCategory | string | null;
  }>;
  observations: Array<{
    prompt: string;
    provider: string;
    observedAt?: string | null;
    answerText?: unknown;
    brandMentioned: boolean;
    checkFailed?: boolean;
    competitorMentions?: string[];
  }>;
  competitors: string[];
  websiteUrl?: unknown;
}): AiPromptComparison[] {
  const ownDomains = ownDomainsOfWebsite(
    params.websiteUrl,
  );
  const competitorNames = params.competitors
    .map(cleanText)
    .filter(Boolean);
  const competitorDomains = competitorNames.map(
    (name) =>
      name.toLowerCase().replace(/\s+/g, ''),
  );

  const byPrompt = new Map<string, typeof params.observations>();

  for (const observation of params.observations) {
    const key = normalizeKeyword(observation.prompt);

    if (!key) {
      continue;
    }

    const list = byPrompt.get(key) ?? [];
    list.push(observation);
    byPrompt.set(key, list);
  }

  return params.prompts.map((prompt) => {
    const key = normalizeKeyword(prompt.text);
    const rows = (byPrompt.get(key) ?? []).slice(
      0,
      MAX_OBSERVATIONS_PER_PROMPT,
    );

    const views: AiObservationView[] = rows.map(
      (row) => {
        const summary = summarizeAiCitations({
          answerText: row.answerText,
          brandMentioned: row.brandMentioned,
          checkFailed: row.checkFailed === true,
          ownDomains,
          competitorDomains,
        });

        return {
          prompt: prompt.text,
          provider: cleanText(row.provider) || 'UNKNOWN',
          observedAt: row.observedAt ?? null,
          mentioned: row.brandMentioned,
          relationship: summary.relationship,
          citedDomains: summary.citedDomains,
          competitorMentions: (
            row.competitorMentions ?? []
          )
            .map(cleanText)
            .filter(Boolean),
          evidenceState: summary.evidenceState,
        };
      },
    );

    const brandPresent = views.some(
      (view) => view.mentioned,
    );
    const brandCited = views.some(
      (view) => view.relationship === 'CITED',
    );

    const competitorsPresent = Array.from(
      new Set(
        views.flatMap(
          (view) => view.competitorMentions,
        ),
      ),
    ).sort();

    const competitorCited = Array.from(
      new Set(
        views.flatMap((view) =>
          view.citedDomains.filter((domain) =>
            competitorDomains.some((candidate) =>
              domain.includes(candidate),
            ),
          ),
        ),
      ),
    ).sort();

    const citedDomains = Array.from(
      new Set(
        views.flatMap((view) => view.citedDomains),
      ),
    ).sort();

    return {
      prompt: prompt.text,
      intent:
        (prompt.intent as AiPromptCategory) ??
        'UNKNOWN',
      observations: views,
      prompts: views.length,
      brandPresent,
      brandCited,
      competitorsPresent,
      competitorsCited: competitorCited,
      citedDomains,
      evidenceState:
        views.length > 0
          ? 'OBSERVED'
          : 'UNAVAILABLE',
    };
  });
}

/* Phase 5 — gap classification on existing bands. */
export function classifyAiGaps(
  comparisons: AiPromptComparison[],
): AiGap[] {
  const gaps: AiGap[] = [];

  for (const comparison of comparisons) {
    if (comparison.evidenceState === 'UNAVAILABLE') {
      gaps.push({
        kind: 'AI_VISIBILITY_GAP',
        prompt: comparison.prompt,
        topic: comparison.prompt,
        priority: 'LOW',
        why: 'No recorded AI observation exists for this prompt yet.',
        evidence: [
          {
            source: 'AI observations',
            label: '0 recorded observations',
            evidenceType: 'UNAVAILABLE',
          },
        ],
        evidenceState: 'UNAVAILABLE',
      });
      continue;
    }

    if (!comparison.brandPresent) {
      gaps.push({
        kind: 'AI_VISIBILITY_GAP',
        prompt: comparison.prompt,
        topic: comparison.prompt,
        priority: composeRoadmapPriority({
          strategyPriority:
            comparison.competitorsPresent.length > 0
              ? 'HIGH'
              : 'MEDIUM',
          impressions: comparison.prompts,
        }),
        why: `The brand was not mentioned across ${comparison.prompts} recorded observation(s)${comparison.competitorsPresent.length > 0 ? ` while ${comparison.competitorsPresent.slice(0, 3).join(', ')} appeared` : ''}.`,
        evidence: [
          {
            source: 'AI observations',
            label: `${comparison.prompts} observation(s), 0 brand mentions`,
            evidenceType: 'OBSERVED',
          },
        ],
        evidenceState: 'OBSERVED',
      });
    }

    if (
      comparison.brandPresent &&
      !comparison.brandCited
    ) {
      gaps.push({
        kind: 'AI_CITATION_GAP',
        prompt: comparison.prompt,
        topic: comparison.prompt,
        priority: composeRoadmapPriority({
          strategyPriority: 'MEDIUM',
          impressions: comparison.prompts,
        }),
        why: 'The brand is mentioned but none of its pages were cited as a source.',
        evidence: [
          {
            source: 'AI citations',
            label: `Mentioned in ${comparison.observations.filter((o) => o.mentioned).length} observation(s), cited in 0`,
            evidenceType: 'INFERRED',
          },
        ],
        evidenceState: 'INFERRED',
      });
    }

    if (comparison.competitorsCited.length > 0) {
      gaps.push({
        kind: 'CONTENT_SOURCE_GAP',
        prompt: comparison.prompt,
        topic: comparison.prompt,
        priority: composeRoadmapPriority({
          strategyPriority: 'HIGH',
          impressions: comparison.prompts,
        }),
        why: `Competitor source domain(s) repeatedly cited: ${comparison.competitorsCited.slice(0, 3).join(', ')}.`,
        evidence: [
          {
            source: 'AI citations',
            label: `${comparison.competitorsCited.length} competitor source domain(s) cited`,
            evidenceType: 'OBSERVED',
          },
        ],
        evidenceState: 'OBSERVED',
      });
    }
  }

  return gaps;
}

/* Phase 6 — explainable why-losing diagnoses. */
export function diagnoseAiGap(params: {
  gap: AiGap;
  hasRelevantPage: boolean;
  pageAlignedWithPrompt: boolean;
  competitorRepeatedlyCited: boolean;
  topicCoveredAnywhere: boolean;
  supportingContentExists: boolean;
  pageIndexable: boolean;
  observationCount: number;
}): AiLosingDiagnosis {
  const evidence: string[] = [];
  let diagnosis: DiagnosisType;
  let headline: string;

  if (params.observationCount < 1) {
    diagnosis = 'INSUFFICIENT_DATA';
    headline =
      'No recorded AI observation exists for this prompt yet.';
    evidence.push(
      '0 recorded observations — nothing to diagnose.',
    );
  } else if (!params.pageIndexable) {
    diagnosis = 'TECHNICAL_BLOCKER';
    headline =
      'The relevant page cannot be used as an AI source because it is not available or indexable.';
    evidence.push(
      'Relevant page is missing, blocked, or not indexable.',
    );
  } else if (!params.topicCoveredAnywhere) {
    diagnosis = 'CONTENT_COVERAGE_GAP';
    headline =
      'The topic behind this prompt is not covered anywhere on the site.';
    evidence.push(
      'No site page covers the prompt topic.',
    );
  } else if (
    params.hasRelevantPage &&
    !params.pageAlignedWithPrompt
  ) {
    diagnosis = 'INTENT_GAP';
    headline =
      'A relevant page exists but does not align with what the prompt is asking.';
    evidence.push(
      'Relevant page exists; prompt intent alignment missing.',
    );
  } else if (params.competitorRepeatedlyCited) {
    diagnosis = 'CONTENT_COVERAGE_GAP';
    headline =
      'A competitor source page is repeatedly cited for this prompt.';
    evidence.push(
      'Competitor source cited across multiple observations.',
    );
  } else if (!params.supportingContentExists) {
    diagnosis = 'INTERNAL_LINK_GAP';
    headline =
      'No supporting content reinforces the relevant page for this prompt.';
    evidence.push(
      'No supporting pages found for the prompt topic.',
    );
  } else {
    diagnosis = 'NO_CLEAR_GAP';
    headline =
      'Recorded evidence does not isolate a single cause; keep monitoring.';
    evidence.push(
      'Observations exist but no gap pattern is confirmed.',
    );
  }

  evidence.push(
    `Gap kind: ${params.gap.kind}; prompt observations: ${params.observationCount}.`,
  );

  const action = actionForDiagnosis(diagnosis);

  return {
    prompt: params.gap.prompt,
    topic: params.gap.topic,
    diagnosis,
    headline,
    evidence,
    evidenceState:
      params.observationCount < 1
        ? 'UNAVAILABLE'
        : 'INFERRED',
    action,
  };
}

/* Phase 7 — enrich existing content opportunities. */
export function bridgeToContentOpportunity(params: {
  topic: string;
  affectedPrompts: string[];
  competitorCitedSources: string[];
  citationGap: boolean;
  recommendedPage: string | null;
  pageMapping?: string | null;
  bucket?: string | null;
  refreshHit?: boolean;
}): AiContentOpportunity {
  const decision = decideContentAction({
    pageMapping: params.pageMapping ?? null,
    bucket: params.bucket ?? null,
    refreshHit: params.refreshHit ?? false,
  });

  const missingTopics =
    params.pageMapping === 'CREATE' ||
    !params.recommendedPage
      ? [params.topic]
      : [];

  return {
    topic: params.topic,
    affectedPrompts: params.affectedPrompts,
    missingTopics,
    competitorCitedSources:
      params.competitorCitedSources,
    citationGap: params.citationGap,
    recommendedPage: params.recommendedPage,
    decision:
      decision === 'CREATE' ||
      decision === 'IMPROVE' ||
      decision === 'REFRESH' ||
      decision === 'CONSOLIDATE'
        ? decision
        : 'MONITOR',
    evidence: [
      `${params.affectedPrompts.length} tracked AI prompt(s) affected.`,
      params.citationGap
        ? 'Brand mentioned without citation.'
        : 'Citation pattern recorded.',
      params.competitorCitedSources.length > 0
        ? `Competitor sources cited: ${params.competitorCitedSources.slice(0, 3).join(', ')}.`
        : 'No competitor source cited.',
    ],
    evidenceState: 'INFERRED',
  };
}

/* Phase 8 — extend the existing roadmap (no fork). */
export function bridgeToRoadmapCandidate(params: {
  gap: AiGap;
  diagnosis: AiLosingDiagnosis;
  keyword?: string | null;
  targetPage?: string | null;
}): AiRoadmapCandidate {
  const mapping =
    params.diagnosis.diagnosis === 'CONTENT_COVERAGE_GAP'
      ? 'CREATE'
      : 'IMPROVE';

  const kind = kindForMapping(mapping, null);
  const priority = params.gap.priority;
  const impact = classifyRoadmapImpact({
    kind,
    priority,
    impressions: undefined,
    clicks: undefined,
    position: undefined,
  });
  const effort = classifyRoadmapEffort({
    kind,
    issueCode:
      params.diagnosis.diagnosis === 'TECHNICAL_BLOCKER'
        ? 'TECHNICAL_BLOCKER'
        : undefined,
  });

  const targetPage =
    normalizeUrl(params.targetPage ?? '') ??
    (cleanText(params.targetPage)
      ? cleanText(params.targetPage)
      : null);

  return {
    kind,
    keyword:
      normalizeKeyword(params.keyword ?? '') ||
      params.gap.prompt,
    targetPage,
    title:
      mapping === 'CREATE'
        ? `Create answer page for "${params.gap.topic}"`
        : `Improve page for "${params.gap.topic}"`,
    why:
      `${params.diagnosis.headline} Evidence direction: closing this gap should improve AI mention and citation presence. ` +
      'How to measure: re-run the tracked prompt and compare mention/citation presence against this baseline.',
    evidence: params.gap.evidence.map((item) => ({
      source: item.source,
      label: item.label,
      evidenceType: item.evidenceType,
    })),
    strategyPriority: priority,
    impact,
    effort,
    evidenceState: params.gap.evidenceState,
  };
}

/* Phase 9 — historical comparison, baseline-first. */
export function comparePromptHistory(params: {
  prompt: string;
  baseline: {
    mentioned: boolean;
    cited: boolean;
    competitors: string[];
  } | null;
  current: {
    mentioned: boolean;
    cited: boolean;
    competitors: string[];
  } | null;
}): AiPromptTrend {
  if (!params.baseline || !params.current) {
    return {
      prompt: params.prompt,
      status: params.baseline
        ? 'BASELINE_ESTABLISHED'
        : 'INSUFFICIENT_DATA',
      mentionChange: 0,
      citationChange: 0,
      newCompetitors: [],
      lostCompetitors: [],
      note: params.baseline
        ? 'Baseline established from the first recorded observation. Re-run the prompt to measure movement.'
        : 'No recorded observations for this prompt yet.',
    };
  }

  const mentionChange =
    Number(params.current.mentioned) -
    Number(params.baseline.mentioned);
  const citationChange =
    Number(params.current.cited) -
    Number(params.baseline.cited);

  const baselineSet = new Set(
    params.baseline.competitors,
  );
  const currentSet = new Set(
    params.current.competitors,
  );

  const newCompetitors = Array.from(
    currentSet,
  ).filter((name) => !baselineSet.has(name));
  const lostCompetitors = Array.from(
    baselineSet,
  ).filter((name) => !currentSet.has(name));

  const score = mentionChange + citationChange;

  return {
    prompt: params.prompt,
    status:
      score > 0
        ? 'IMPROVED'
        : score < 0
          ? 'DECLINED'
          : 'UNCHANGED',
    mentionChange,
    citationChange,
    newCompetitors,
    lostCompetitors,
    note:
      score > 0
        ? 'Brand presence improved versus baseline.'
        : score < 0
          ? 'Brand presence declined versus baseline.'
          : 'No change versus baseline.',
  };
}

export function recurringCompetitorSources(
  perPromptDomains: string[][],
): Array<{ domain: string; prompts: number }> {
  return overlapCitedDomains(perPromptDomains);
}

@Injectable()
export class AiSearchIntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private async verifyWebsite(
    organizationId: string,
    websiteId: string,
  ) {
    const website =
      await this.prisma.website.findFirst({
        where: {
          id: websiteId,
          organizationId,
          isActive: true,
        },
      });

    if (!website) {
      throw new NotFoundException(
        'Website not found',
      );
    }

    return website;
  }

  /*
   * Bounded parallel reads (no N+1): one wave for
   * queries + checks + competitors + website. The
   * dashboard stays useful when providers never ran:
   * every prompt simply reports UNAVAILABLE.
   */
  async getComparison(
    organizationId: string,
    websiteId: string,
  ): Promise<{
    comparisons: AiPromptComparison[];
    gaps: AiGap[];
  }> {
    const website = await this.verifyWebsite(
      organizationId,
      websiteId,
    );

    const [queries, checks, competitors] =
      await Promise.all([
        this.prisma.aiVisibilityQuery.findMany({
          where: { websiteId, isActive: true },
          orderBy: { createdAt: 'desc' },
          take: MAX_PROMPTS_PER_WEBSITE,
        }),
        this.prisma.aiVisibilityCheck.findMany({
          where: { websiteId },
          orderBy: { checkedAt: 'desc' },
          take: 1000,
        }),
        this.prisma.competitor.findMany({
          where: { organizationId },
          take: 50,
        }),
      ]);

    const comparisons = buildComparisonMatrix({
      prompts: queries.map((query) => ({
        text: query.query,
        intent: query.category,
      })),
      observations: checks.map((check) => ({
        prompt: check.query,
        provider: check.platform,
        observedAt: check.checkedAt
          ? check.checkedAt.toISOString()
          : null,
        answerText: check.response,
        brandMentioned: check.mentioned,
        checkFailed: check.status === 'FAILED',
        competitorMentions: check.competitorNames ?? [],
      })),
      competitors: competitors.map(
        (competitor) => competitor.name,
      ),
      websiteUrl: website.url,
    });

    return {
      comparisons,
      gaps: classifyAiGaps(comparisons),
    };
  }

  async getCitationReport(
    organizationId: string,
    websiteId: string,
  ) {
    const website = await this.verifyWebsite(
      organizationId,
      websiteId,
    );

    const checks =
      await this.prisma.aiVisibilityCheck.findMany({
        where: { websiteId },
        orderBy: { checkedAt: 'desc' },
        take: 200,
      });

    const ownDomains = ownDomainsOfWebsite(
      website.url,
    );

    return checks.map((check) => ({
      checkId: check.id,
      prompt: check.query,
      provider: check.platform,
      observedAt: check.checkedAt,
      ...summarizeAiCitations({
        answerText: check.response,
        brandMentioned: check.mentioned,
        checkFailed: check.status === 'FAILED',
        ownDomains,
        competitorDomains: [],
      }),
    }));
  }

  async getDiagnoses(
    organizationId: string,
    websiteId: string,
  ): Promise<{
    gaps: AiGap[];
    diagnoses: AiLosingDiagnosis[];
  }> {
    const { comparisons, gaps } =
      await this.getComparison(
        organizationId,
        websiteId,
      );

    const byPrompt = new Map(
      comparisons.map((comparison) => [
        normalizeKeyword(comparison.prompt),
        comparison,
      ]),
    );

    const diagnoses = gaps.map((gap) => {
      const comparison = byPrompt.get(
        normalizeKeyword(gap.prompt),
      );

      const observationCount =
        comparison?.prompts ?? 0;

      return diagnoseAiGap({
        gap,
        hasRelevantPage: false,
        pageAlignedWithPrompt: false,
        competitorRepeatedlyCited: (
          comparison?.competitorsCited ?? []
        ).length > 0,
        topicCoveredAnywhere: observationCount > 0,
        supportingContentExists: false,
        pageIndexable: true,
        observationCount,
      });
    });

    return { gaps, diagnoses };
  }

  async getRoadmapCandidates(
    organizationId: string,
    websiteId: string,
  ): Promise<{
    candidates: AiRoadmapCandidate[];
  }> {
    const { gaps, diagnoses } =
      await this.getDiagnoses(
        organizationId,
        websiteId,
      );

    const byPrompt = new Map(
      diagnoses.map((diagnosis) => [
        normalizeKeyword(diagnosis.prompt),
        diagnosis,
      ]),
    );

    const candidates = gaps
      .filter(
        (gap) =>
          gap.evidenceState !== 'UNAVAILABLE',
      )
      .map((gap) =>
        bridgeToRoadmapCandidate({
          gap,
          diagnosis: byPrompt.get(
            normalizeKeyword(gap.prompt),
          ) ?? {
            prompt: gap.prompt,
            topic: gap.topic,
            diagnosis: 'INSUFFICIENT_DATA' as const,
            headline: gap.why,
            evidence: [],
            evidenceState: gap.evidenceState,
            action: actionForDiagnosis(
              'INSUFFICIENT_DATA',
            ),
          },
          keyword: gap.prompt,
          targetPage: null,
        }),
      );

    return { candidates };
  }

  async getPromptHistory(
    organizationId: string,
    websiteId: string,
    days: number,
  ): Promise<{
    trends: AiPromptTrend[];
  }> {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );

    const windowDays = Math.min(
      365,
      Math.max(1, Math.floor(days) || 30),
    );
    const since = new Date(
      Date.now() - windowDays * 24 * 60 * 60 * 1000,
    );

    const checks =
      await this.prisma.aiVisibilityCheck.findMany({
        where: {
          websiteId,
          checkedAt: { gte: since },
        },
        orderBy: { checkedAt: 'asc' },
        take: 1000,
      });

    const byPrompt = new Map<
      string,
      typeof checks
    >();

    for (const check of checks) {
      const key = normalizeKeyword(check.query);

      if (!key) {
        continue;
      }

      const list = byPrompt.get(key) ?? [];
      list.push(check);
      byPrompt.set(key, list);
    }

    const trends: AiPromptTrend[] = [];

    for (const [
      key,
      rows,
    ] of byPrompt.entries()) {
      const completed = rows.filter(
        (row) => row.status === 'COMPLETED',
      );

      if (completed.length === 0) {
        trends.push(
          comparePromptHistory({
            prompt: rows[0]?.query ?? key,
            baseline: null,
            current: null,
          }),
        );
        continue;
      }

      const first = completed[0];
      const last =
        completed[completed.length - 1];

      trends.push(
        comparePromptHistory({
          prompt: first.query,
          baseline: {
            mentioned: first.mentioned,
            cited: first.citationFound,
            competitors:
              first.competitorNames ?? [],
          },
          current:
            completed.length < 2
              ? null
              : {
                  mentioned: last.mentioned,
                  cited: last.citationFound,
                  competitors:
                    last.competitorNames ?? [],
                },
        }),
      );
    }

    return { trends };
  }

  generatePromptSet(input: {
    keywords?: Array<{
      keyword: string;
      intent?: string | null;
      topic?: string | null;
      sourceUrl?: string | null;
      country?: string | null;
      language?: string | null;
    }>;
    gscQueries?: string[];
    serpTopics?: string[];
    business?: {
      name?: string | null;
      category?: string | null;
      locations?: string[];
      offerings?: string[];
    };
    competitorTerms?: string[];
    existingContent?: Array<{
      url: string;
      topic?: string | null;
    }>;
    maxPrompts?: number;
    defaultCountry?: string;
    defaultLanguage?: string;
  }): GeneratedAiPrompt[] {
    return generatePromptSet({
      ...input,
      keywords: (input.keywords ?? []).map(
        (item) => ({ ...item }),
      ),
    });
  }
}

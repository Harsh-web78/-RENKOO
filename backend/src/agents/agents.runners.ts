/*
 * =========================================================
 * DETERMINISTIC AGENT RUNNERS
 *
 * Real RENKOO analyses over recorded data. No LLM, no
 * chain-of-thought persistence — concise evidence and
 * summaries only.
 * =========================================================
 */

export interface ProposedAction {
  title: string;
  description: string;
  priority: string;
  type: string;
  kind?: 'action' | 'report';
  reportType?: string;
  metadata?: Record<
    string,
    unknown
  >;
  recommendationId?: string;
}

export interface RunnerEvidence {
  source: string;
  metric: string;
  value?: string | number | null;
  entity?: string | null;
  note?: string | null;
}

export interface RunnerResult {
  evidence: RunnerEvidence[];
  resultSummary: string;
  proposedActions: ProposedAction[];
  dataAvailability: Record<
    string,
    string
  >;
}

export interface RunnerContext {
  input: string;
  usedTools: string[];
  call(
    tool: string,
    params?: Record<string, any>,
  ): Promise<any>;
}

const SEVERITY_WEIGHT: Record<
  string,
  number
> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

function priorityOf(
  severity: string,
): string {
  const key = String(
    severity || '',
  ).toUpperCase();

  if (key === 'CRITICAL') {
    return 'HIGH';
  }

  return key === 'HIGH' ||
    key === 'MEDIUM' ||
    key === 'LOW'
    ? key
    : 'MEDIUM';
}

export const RUNNERS: Record<
  string,
  (
    ctx: RunnerContext,
  ) => Promise<RunnerResult>
> = {
  async 'technical-seo'(ctx) {
    const summary =
      await ctx.call(
        'getCrawlSummary',
      );
    const issues: any[] =
      (await ctx.call(
        'getTechnicalIssues',
        { limit: 10 },
      )) ?? [];

    const ranked = [...issues].sort(
      (a, b) =>
        (SEVERITY_WEIGHT[
          String(
            b.severity || '',
          ).toUpperCase()
        ] ?? 0) -
        (SEVERITY_WEIGHT[
          String(
            a.severity || '',
          ).toUpperCase()
        ] ?? 0) ||
        Number(b.count ?? 0) -
          Number(a.count ?? 0),
    );

    const top = ranked.slice(0, 3);

    return {
      evidence: [
        {
          source: 'TECHNICAL_SEO',
          metric: 'seo_health_score',
          value: summary.score,
          note: `${summary.openIssues} OPEN issues across ${summary.pages} pages.`,
        },
        ...top.map((issue) => ({
          source: 'TECHNICAL_SEO',
          metric: 'issue_group',
          value: `${issue.severity} × ${issue.count}`,
          entity: issue.title,
          note: issue.code,
        })),
      ],
      resultSummary:
        top.length > 0
          ? `Highest-impact groups: ${top.map((issue) => `"${issue.title}" (${issue.severity}, ${issue.count} pages)`).join('; ')}.`
          : 'No OPEN technical issues in the latest crawl.',
      proposedActions: top.map(
        (issue) => ({
          title: `Fix: ${issue.title}`,
          description:
            issue.recommendation ||
            issue.description ||
            `Resolve ${issue.code} across affected pages.`,
          priority: priorityOf(
            issue.severity,
          ),
          type: 'SEO_ISSUE',
          metadata: {
            issueCode: issue.code,
            affectedPages:
              issue.count,
            via: issue.code
              ? 'AGENT:technical-seo'
              : 'AGENT:technical-seo',
          },
        }),
      ),
      dataAvailability: {
        crawl: 'AVAILABLE',
      },
    };
  },

  async 'seo-researcher'(ctx) {
    const context = await ctx.call(
      'getBusinessContext',
    );
    const queries: any[] =
      (await ctx.call(
        'getGSCQueries',
      )) ?? [];

    const offerings = [
      ...(context?.offerings
        ?.services ?? []),
      ...(context?.offerings
        ?.products ?? []),
      ...(context?.priorities
        ?.primaryKeywords ?? []),
    ].map((item: string) =>
      String(item).toLowerCase(),
    );

    const matched = queries
      .filter((row: any) =>
        offerings.some(
          (term) =>
            term &&
            String(
              row.query || '',
            )
              .toLowerCase()
              .includes(term),
        ),
      )
      .slice(0, 10);

    return {
      evidence: matched.map(
        (row: any) => ({
          source: 'GSC',
          metric: 'query',
          value: `${row.impressions ?? 0} impressions, position ${row.position ?? '—'}`,
          entity: row.query,
        }),
      ),
      resultSummary:
        matched.length > 0
          ? `${matched.length} connected queries match business offerings and merit research.`
          : 'No connected queries match the configured offerings yet.',
      proposedActions: matched
        .slice(0, 3)
        .map((row: any) => ({
          title: `Research topic: ${row.query}`,
          description: `Query records ${row.impressions ?? 0} impressions at position ${row.position ?? 'unknown'}. Validate intent and map it to the closest offering page.`,
          priority: 'MEDIUM',
          type: 'SEO_RESEARCH',
          metadata: {
            query: row.query,
            via: 'AGENT:seo-researcher',
          },
        })),
      dataAvailability: {
        gsc: 'AVAILABLE',
      },
    };
  },

  async 'content-strategist'(ctx) {
    const rows: any[] =
      (await ctx.call(
        'getGSCQueries',
      )) ?? [];

    const striking = rows
      .filter((row: any) => {
        const position = Number(
          row.position ?? 0,
        );
        const impressions = Number(
          row.impressions ?? 0,
        );

        return (
          position >= 8 &&
          position <= 25 &&
          impressions >= 100
        );
      })
      .sort(
        (a: any, b: any) =>
          Number(
            b.impressions ?? 0,
          ) -
          Number(
            a.impressions ?? 0,
          ),
      )
      .slice(0, 5);

    /*
     * Workspace evidence: persisted briefs,
     * drafts and refresh queue. Refresh and
     * brief proposals reference real records.
     */
    const workspace: any =
      (await ctx
        .call('getContentWorkspace')
        .catch(() => null)) ?? {};
    const briefs: any =
      (await ctx
        .call('getContentBriefs')
        .catch(() => null)) ?? {};
    const briefedQueries = new Set(
      (briefs.briefs ?? []).map(
        (brief: any) =>
          String(
            brief.targetQuery ?? '',
          ).toLowerCase(),
      ),
    );
    const refreshQueue: any[] =
      workspace.refreshQueue ?? [];

    const unbriefed = striking.filter(
      (row: any) =>
        !briefedQueries.has(
          String(
            row.query ?? '',
          ).toLowerCase(),
        ),
    );

    return {
      evidence: [
        ...striking.map(
          (row: any) => ({
            source: 'GSC',
            metric: 'striking_distance',
            value: `position ${row.position}, ${row.impressions} impressions`,
            entity: row.query,
          }),
        ),
        {
          source: 'CONTENT',
          metric: 'workspace',
          value: `${workspace.totalItems ?? 0} items, ${workspace.totalBriefs ?? 0} briefs, ${workspace.totalDrafts ?? 0} drafts`,
          entity: 'workspace',
          note: `Refresh queue holds ${workspace.refreshTotal ?? 0} evidence-backed candidate(s).`,
        },
      ],
      resultSummary:
        striking.length > 0
          ? `${striking.length} queries sit in striking distance (positions 8-25, 100+ impressions). ${unbriefed.length} without an evidence brief. Refresh queue: ${workspace.refreshTotal ?? 0}.`
          : 'No striking-distance queries in connected data.',
      proposedActions: [
        ...striking.map(
          (row: any) => ({
            title: `Strengthen content for "${row.query}"`,
            description: `Recorded at position ${row.position} with ${row.impressions} impressions. Improve intent match, headings and internal links on the ranking page.`,
            priority: 'HIGH',
            type: 'CONTENT',
            metadata: {
              query: row.query,
              via: 'AGENT:content-strategist',
            },
          }),
        ),
        ...unbriefed
          .slice(0, 3)
          .map((row: any) => ({
            title: `Create evidence brief for "${row.query}"`,
            description: `No persisted brief exists for this striking-distance query (${row.impressions} impressions). Generate a brief from GSC, Business Brain and competitor evidence first.`,
            priority: 'MEDIUM',
            type: 'CONTENT_BRIEF',
            metadata: {
              query: row.query,
              via: 'AGENT:content-strategist',
            },
          })),
        ...refreshQueue
          .slice(0, 2)
          .map((item: any) => ({
            title: `Refresh content for "${item.query}"`,
            description:
              item.reason ??
              'Period-over-period decline in recorded GSC evidence.',
            priority: 'MEDIUM',
            type: 'CONTENT',
            metadata: {
              query: item.query,
              via: 'AGENT:content-strategist',
            },
          })),
      ],
      dataAvailability: {
        gsc: 'AVAILABLE',
        content_workspace: 'AVAILABLE',
        serp: 'NOT_AVAILABLE',
      },
    };
  },

  async 'ai-visibility'(ctx) {
    const intel: any =
      (await ctx.call(
        'getAiVisibility',
      )) ?? {};
    const gaps: any[] =
      intel.gaps ?? [];

    return {
      evidence: gaps.map(
        (gap: any) => ({
          source: 'AI_VISIBILITY',
          metric: gap.key,
          value: gap.priority,
          entity: gap.title,
          note: gap.description,
        }),
      ),
      resultSummary:
        gaps.length > 0
          ? `${gaps.length} AI visibility gaps in recorded observations.`
          : 'No AI visibility gaps in recorded observations.',
      proposedActions: gaps
        .slice(0, 5)
        .map((gap: any) => ({
          title: gap.title,
          description: `${gap.description} Affected prompts: ${(gap.queries ?? []).slice(0, 5).join(', ') || 'none listed'}.`,
          priority:
            gap.priority === 'HIGH'
              ? 'HIGH'
              : 'MEDIUM',
          type: 'AI_VISIBILITY',
          metadata: {
            gapKey: gap.key,
            via: 'AGENT:ai-visibility',
          },
        })),
      dataAvailability: {
        ai_visibility: 'AVAILABLE',
      },
    };
  },

  async 'local-seo'(ctx) {
    const context = await ctx.call(
      'getBusinessContext',
    );
    const intel: any =
      (await ctx.call(
        'getAiVisibility',
      )) ?? {};
    const gaps: any[] =
      intel.gaps ?? [];
    const locations: string[] =
      context?.priorities
        ?.targetLocations ?? [];

    /*
     * Real configured locations + deterministic
     * local health. Rankings, reviews and GBP
     * are reported as unavailable — never
     * invented by the worker.
     */
    const health: any =
      (await ctx.call(
        'getLocalHealth',
      ).catch(() => null)) ?? {};
    const stored: any =
      (await ctx.call(
        'getBusinessLocations',
      ).catch(() => null)) ?? {};
    const storedLocations: any[] =
      stored.locations ?? [];
    const healthAreas: any[] =
      health.areas ?? [];
    const localOpportunities: any[] =
      health.opportunities ?? [];

    const relevant = gaps.slice(0, 5);

    const marketNames =
      storedLocations.length > 0
        ? storedLocations
            .slice(0, 5)
            .map(
              (location: any) =>
                location.name,
            )
        : locations.slice(0, 5);

    return {
      evidence: [
        ...relevant.map(
          (gap: any) => ({
            source: 'GEO',
            metric: gap.key,
            value: gap.priority,
            entity: gap.title,
            note: gap.description,
          }),
        ),
        ...healthAreas.map(
          (area: any) => ({
            source: 'LOCAL_SEO',
            metric: area.key,
            value: area.state,
            entity: area.title,
            note: area.evidence,
          }),
        ),
      ],
      resultSummary:
        marketNames.length > 0
          ? `Target markets (${marketNames.join(', ')}) checked against ${gaps.length} recorded GEO gaps. Local health: ${health.overall ?? 'unknown'}. Rankings, reviews and GBP are unavailable — not assessed.`
          : 'No target locations configured, so local relevance cannot be assessed.',
      proposedActions: [
        ...relevant.map(
          (gap: any) => ({
            title: gap.title,
            description: `${gap.description}${marketNames.length > 0 ? ` Priority markets: ${marketNames.join(', ')}.` : ''}`,
            priority: 'MEDIUM',
            type: 'GEO',
            metadata: {
              gapKey: gap.key,
              via: 'AGENT:local-seo',
            },
          }),
        ),
        ...localOpportunities
          .slice(0, 3)
          .map((opportunity: any) => ({
            title: opportunity.title,
            description:
              opportunity.description,
            priority:
              opportunity.priority ??
              'MEDIUM',
            type: 'LOCAL_SEO',
            metadata: {
              gapKey:
                opportunity.key,
              recommendationId:
                opportunity.recommendationId ??
                null,
              via: 'AGENT:local-seo',
            },
          })),
      ],
      dataAvailability: {
        geo:
          gaps.length > 0
            ? 'AVAILABLE'
            : 'NO_DATA',
        local_seo:
          health.overall ?? 'NO_DATA',
        rankings: 'NOT_AVAILABLE',
        reviews: 'NOT_AVAILABLE',
        gbp: 'NOT_AVAILABLE',
      },
    };
  },

  async 'competitor-intel'(ctx) {
    const competitors: any[] =
      (await ctx.call(
        'getCompetitors',
      )) ?? [];

    const scored = competitors
      .filter(
        (item: any) =>
          item?.crawl?.status ===
          'COMPLETED',
      )
      .sort(
        (a: any, b: any) =>
          Number(
            b.crawl?.score ?? 0,
          ) -
          Number(
            a.crawl?.score ?? 0,
          ),
      );

    if (scored.length === 0) {
      return {
        evidence: [],
        resultSummary:
          'Tracked competitors have no completed crawls yet.',
        proposedActions: [],
        dataAvailability: {
          competitors: 'INSUFFICIENT_HISTORY',
        },
      };
    }

    const leader = scored[0];
    const comparison: any =
      await ctx.call(
        'getCompetitorComparison',
        { competitorId: leader.id },
      );
    const gaps: any[] = [
      ...(comparison?.opportunities ??
        []),
    ].slice(0, 5);

    return {
      evidence: [
        {
          source: 'COMPETITORS',
          metric: 'leader',
          value: `score ${leader.crawl?.score}`,
          entity: leader.name,
        },
        ...gaps.map(
          (gap: any) => ({
            source: 'COMPETITORS',
            metric: 'comparison_gap',
            value: gap.priority,
            entity: gap.title,
            note: gap.description,
          }),
        ),
      ],
      resultSummary: `${leader.name} leads with crawl score ${leader.crawl?.score}. ${gaps.length} evidence-backed gaps identified.`,
      proposedActions: gaps.map(
        (gap: any) => ({
          title: gap.title,
          description: `${gap.description ?? ''}${gap.recommendation ? ` Recommendation: ${gap.recommendation}` : ''}`,
          priority:
            gap.priority ===
            'CRITICAL'
              ? 'HIGH'
              : (gap.priority ??
                'MEDIUM'),
          type: 'COMPETITOR_GAP',
          metadata: {
            competitorId:
              leader.id,
            via: 'AGENT:competitor-intel',
          },
        }),
      ),
      dataAvailability: {
        competitors: 'AVAILABLE',
      },
    };
  },

  async 'monitoring-analyst'(ctx) {
    const changes: any =
      (await ctx.call(
        'getMonitoringChanges',
      )) ?? {};
    const items: any[] =
      changes.changes ?? [];

    const negative = items
      .filter(
        (item: any) =>
          item.direction ===
          'NEGATIVE',
      )
      .slice(0, 5);

    return {
      evidence: negative.map(
        (item: any) => ({
          source: 'MONITORING',
          metric: item.metric,
          value: `${item.previousValue} → ${item.currentValue}`,
          entity: item.title,
          note: `${item.severity}.`,
        }),
      ),
      resultSummary:
        negative.length > 0
          ? `${negative.length} negative movements deserve review first.`
          : 'No negative movements in the latest crawl comparison.',
      proposedActions: negative
        .slice(0, 3)
        .map((item: any) => ({
          title: `Address change: ${item.title}`,
          description: `${item.description ?? ''}${item.recommendation ? ` Recommendation: ${item.recommendation}` : ''}`,
          priority:
            item.severity ===
            'CRITICAL'
              ? 'HIGH'
              : 'MEDIUM',
          type: 'MONITORING_CHANGE',
          metadata: {
            currentCrawlId:
              item.currentCrawlId,
            previousCrawlId:
              item.previousCrawlId,
            via: 'AGENT:monitoring-analyst',
          },
        })),
      dataAvailability: {
        monitoring: 'AVAILABLE',
      },
    };
  },

  async 'growth-strategist'(ctx) {
    const context = await ctx.call(
      'getBusinessContext',
    );
    const opportunities: any[] =
      (await ctx.call(
        'getOpportunities',
        { limit: 10 },
      )) ?? [];

    const top = opportunities.slice(
      0,
      5,
    );

    /*
     * Authority evidence from recorded
     * backlinks. No provider data exists, so
     * only imported-record counts appear.
     */
    const backlinks: any =
      (await ctx
        .call('getBacklinkOverview')
        .catch(() => null)) ?? {};

    const backlinkEvidence: any[] = [];

    if (
      (backlinks?.summary?.totalBacklinks ??
        0) > 0
    ) {
      backlinkEvidence.push({
        source: 'BACKLINKS',
        metric: 'inventory',
        value: `${backlinks.summary.totalBacklinks} links / ${backlinks.summary.referringDomains} domains`,
        entity: 'authority',
        note: `Quality split: ${JSON.stringify(backlinks.qualityBreakdown ?? {})}. Authority numbers are source-supplied.`,
      });
    }

    return {
      evidence: [
        ...top.map(
          (item: any) => ({
            source: item.source,
            metric: 'opportunity',
            value: `${item.priority} · score ${item.score}`,
            entity: item.title,
            note:
              item.businessReason ??
              null,
          }),
        ),
        ...backlinkEvidence,
      ],
      resultSummary:
        top.length > 0
          ? `Top priorities${context?.priorities?.primaryGoal ? ` against "${context.priorities.primaryGoal}"` : ''}: ${top.map((item: any) => `"${item.title}"`).join('; ')}.`
          : 'The opportunity queue is empty.',
      proposedActions: top.map(
        (item: any) => ({
          title: item.title,
          description:
            item.recommendation ??
            item.description,
          priority: item.priority,
          type:
            item.type ??
            item.source,
          recommendationId:
            item.id ===
              item.sourceId &&
            !String(item.id).includes(
              ':',
            )
              ? item.sourceId
              : undefined,
          metadata: {
            source: item.source,
            sourceId:
              item.sourceId,
            via: 'AGENT:growth-strategist',
          },
        }),
      ),
      dataAvailability: {
        opportunities:
          top.length > 0
            ? 'AVAILABLE'
            : 'NO_DATA',
        backlinks:
          backlinkEvidence.length > 0
            ? 'AVAILABLE'
            : 'NO_DATA',
      },
    };
  },

  async 'report-generator'(ctx) {
    const context = await ctx.call(
      'getBusinessContext',
    );
    const crawl: any =
      await ctx.call(
        'getCrawlSummary',
      ).catch(() => null);
    const opportunities: any[] =
      (await ctx.call(
        'getOpportunities',
        { limit: 200 },
      ).catch(() => [])) ?? [];
    const actions: any[] =
      (await ctx.call(
        'getActions',
      ).catch(() => [])) ?? [];
    const changes: any =
      await ctx.call(
        'getMonitoringChanges',
      ).catch(() => null);
    const revenue: any =
      await ctx.call(
        'getLeadsRevenue',
      ).catch(() => null);

    const high = opportunities.filter(
      (item: any) =>
        item.priority === 'HIGH',
    ).length;

    const businessName =
      context?.profile
        ?.businessName ??
      context?.website?.name ??
      'Website';

    return {
      evidence: [
        {
          source: 'BUSINESS',
          metric: 'context_confidence',
          value:
            context?.contextConfidence ??
            null,
          entity: businessName,
        },
        {
          source: 'TECHNICAL_SEO',
          metric: 'seo_health_score',
          value:
            crawl?.score ?? null,
        },
        {
          source: 'OPPORTUNITIES',
          metric: 'open_count',
          value:
            opportunities.length,
          note: `${high} high priority.`,
        },
        {
          source: 'ACTIONS',
          metric: 'open_count',
          value: actions.length,
        },
        {
          source: 'MONITORING',
          metric: 'detected_changes',
          value:
            changes?.changes
              ?.length ?? null,
        },
        {
          source: 'LEADS',
          metric: 'leads_revenue',
          value: revenue
            ? `${revenue.leads ?? 0} leads, ${revenue.recognized ?? 0} recognized revenue`
            : null,
        },
      ],
      resultSummary: `Status compiled from connected sources: SEO ${crawl?.score ?? 'unknown'}, ${opportunities.length} open opportunities (${high} high), ${actions.length} open actions.`,
      proposedActions: [
        {
          title: `Executive Growth Report — ${businessName}`,
          description: `Generate a persisted Executive Growth Report snapshot from connected sources for ${businessName}.`,
          priority: 'MEDIUM',
          type: 'REPORT',
          kind: 'report',
          reportType: 'EXECUTIVE',
          metadata: {
            via: 'AGENT:report-generator',
          },
        },
      ],
      dataAvailability: {
        report: 'AVAILABLE',
      },
    };
  },
};

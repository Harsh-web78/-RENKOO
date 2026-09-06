import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { BusinessBrainService } from '../business-brain/business-brain.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { AiVisibilityService } from '../ai-visibility/ai-visibility.service';
import { ActionsService } from '../actions/actions.service';
import { ComparisonService } from '../comparison/comparison.service';
import { GoogleService } from '../google/google.service';
import { ReportsService } from '../reports/reports.service';
import { LocalSeoService } from '../local-seo/local-seo.service';
import { ContentService } from '../content/content.service';
import { BacklinksService } from '../backlinks/backlinks.service';

import {
  AGENTS,
  FUTURE_EXTERNAL_TOOLS,
  type AgentAvailability,
  type AgentDefinition,
} from './agents.registry';
import {
  getTool,
  TOOLS,
} from './tools.registry';
import {
  RUNNERS,
  type ProposedAction,
} from './agents.runners';

function isoDaysAgo(days: number): string {
  const date = new Date();

  date.setDate(date.getDate() - days);

  return date
    .toISOString()
    .slice(0, 10);
}

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessBrainService: BusinessBrainService,
    private readonly recommendationsService: RecommendationsService,
    private readonly monitoringService: MonitoringService,
    private readonly aiVisibilityService: AiVisibilityService,
    private readonly actionsService: ActionsService,
    private readonly comparisonService: ComparisonService,
    private readonly googleService: GoogleService,
    private readonly reportsService: ReportsService,
    private readonly localSeoService: LocalSeoService,
    private readonly contentService: ContentService,
    private readonly backlinksService: BacklinksService,
  ) {}

  // =========================================================
  // REGISTRY + AVAILABILITY
  // =========================================================

  async listAgents(
    organizationId: string,
    websiteId?: string,
  ) {
    let availability: Record<
      string,
      AgentAvailability
    > = {};

    if (websiteId) {
      await this.assertWebsite(
        organizationId,
        websiteId,
      );

      availability =
        await this.computeAvailability(
          organizationId,
          websiteId,
        );
    }

    return {
      providerUnavailable: true,
      providerNote:
        'No LLM provider is configured. Agents run deterministic workflows over recorded RENKOO data only.',
      futureExternalTools:
        FUTURE_EXTERNAL_TOOLS,
      tools: TOOLS.map((tool) => ({
        name: tool.name,
        description:
          tool.description,
        permission:
          tool.permission,
      })),
      agents: AGENTS.map(
        (agent) => ({
          ...agent,
          status: websiteId
            ? (availability[agent.id] ??
              'ERROR')
            : 'DETERMINISTIC',
        }),
      ),
    };
  }

  private async computeAvailability(
    organizationId: string,
    websiteId: string,
  ): Promise<
    Record<string, AgentAvailability>
  > {
    try {
      const [
        crawl,
        connection,
        aiChecks,
        geoQueries,
        competitors,
        openRecommendations,
      ] = await Promise.all([
        this.prisma.crawl.findFirst({
          where: {
            websiteId,
            status: 'COMPLETED',
          },
          select: { id: true },
        }),

        this.prisma.googleConnection.findUnique(
          {
            where: { organizationId },
            select: {
              selectedProperty: true,
            },
          },
        ),

        this.prisma.aiVisibilityCheck.count(
          {
            where: {
              websiteId,
              status: 'COMPLETED',
            },
          },
        ),

        this.prisma.geoQuery.count({
          where: { websiteId },
        }),

        this.prisma.competitor.count({
          where: {
            websiteId,
            organizationId,
            isActive: true,
          },
        }),

        this.prisma.recommendation.count(
          {
            where: {
              organizationId,
              websiteId,
              status: {
                in: [
                  'OPEN',
                  'IN_PROGRESS',
                ],
              },
            },
          },
        ),
      ]);

      const met: Record<
        string,
        boolean
      > = {
        crawl: Boolean(crawl),
        gsc: Boolean(
          connection?.selectedProperty,
        ),
        ai_visibility: aiChecks > 0,
        geo: geoQueries > 0,
        competitors:
          competitors > 0,
        opportunities:
          openRecommendations > 0,
      };

      const result: Record<
        string,
        AgentAvailability
      > = {};

      for (const agent of AGENTS) {
        const missing =
          agent.requiredData.filter(
            (key) => !met[key],
          );

        result[agent.id] =
          missing.length === 0
            ? 'DETERMINISTIC'
            : 'NOT_AVAILABLE';
      }

      return result;
    } catch {
      const result: Record<
        string,
        AgentAvailability
      > = {};

      for (const agent of AGENTS) {
        result[agent.id] = 'ERROR';
      }

      return result;
    }
  }

  // =========================================================
  // RUN
  // =========================================================

  async runAgent(
    organizationId: string,
    userId: string | null,
    websiteId: string,
    agentId: string,
    input: string | undefined,
    trigger: string,
  ) {
    const agent = this.findAgent(
      agentId,
    );

    await this.assertWebsite(
      organizationId,
      websiteId,
    );

    const run =
      await this.prisma.agentRun.create(
        {
          data: {
            organizationId,
            websiteId,
            userId: userId ?? undefined,
            agentId: agent.id,
            trigger:
              trigger ===
                'QUICK_TASK' ||
              trigger ===
                'USER_REQUEST'
                ? trigger
                : 'USER_REQUEST',
            input: input
              ?.slice(0, 2000)
              .trim() || null,
            status: 'RUNNING',
            approvalState:
              'NOT_REQUIRED',
            selectedTools: [],
          },
        },
      );

    const usedTools = new Set<string>();

    try {
      const runner =
        RUNNERS[agent.id];

      if (!runner) {
        throw new BadRequestException(
          `Agent "${agent.id}" has no deterministic workflow yet`,
        );
      }

      const result =
        await runner({
          input: input ?? '',
          usedTools: [],
          call: async (
            tool: string,
            params?: Record<
              string,
              any
            >,
          ) => {
            usedTools.add(tool);

            return this.executeTool(
              agent,
              organizationId,
              websiteId,
              tool,
              params ?? {},
              false,
            );
          },
        });

      const proposals: ProposedAction[] =
        result.proposedActions ?? [];

      const updated =
        await this.prisma.agentRun.update(
          {
            where: {
              id: run.id,
            },
            data: {
              status: 'COMPLETED',
              approvalState:
                proposals.length > 0 &&
                agent.approvalRequired
                  ? 'PENDING'
                  : 'NOT_REQUIRED',
              selectedTools: [
                ...usedTools,
              ],
              evidence:
                result.evidence as any,
              resultSummary:
                result.resultSummary,
              proposedActions:
                proposals as any,
              completedAt: new Date(),
            },
          },
        );

      return this.toContract(
        updated,
        agent,
      );
    } catch (error) {
      const failed =
        await this.prisma.agentRun.update(
          {
            where: {
              id: run.id,
            },
            data: {
              status: 'FAILED',
              selectedTools: [
                ...usedTools,
              ],
              error:
                error instanceof
                Error
                  ? error.message.slice(
                      0,
                      2000,
                    )
                  : 'Agent run failed',
              completedAt: new Date(),
            },
          },
        );

      return this.toContract(
        failed,
        agent,
      );
    }
  }

  // =========================================================
  // APPROVE + EXECUTE (explicit approval only)
  // =========================================================

  async approveAndExecute(
    organizationId: string,
    runId: string,
    approve: boolean,
    indexes?: number[],
  ) {
    const run =
      await this.prisma.agentRun.findFirst(
        {
          where: {
            id: runId,
            organizationId,
          },
        },
      );

    if (!run) {
      throw new NotFoundException(
        'Agent run not found',
      );
    }

    const agent = this.findAgent(
      run.agentId,
    );

    if (run.status !== 'COMPLETED') {
      throw new BadRequestException(
        'Only completed runs can be executed',
      );
    }

    if (
      run.approvalState ===
      'EXECUTED'
    ) {
      throw new BadRequestException(
        'This run was already executed',
      );
    }

    if (
      agent.approvalRequired &&
      approve !== true
    ) {
      throw new ForbiddenException(
        'Explicit approval is required before execution',
      );
    }

    const proposals: ProposedAction[] =
      Array.isArray(
        run.proposedActions,
      )
        ? (run.proposedActions as unknown as ProposedAction[])
        : [];

    const selected =
      Array.isArray(indexes) &&
      indexes.length > 0
        ? indexes
            .filter(
              (index) =>
                Number.isInteger(
                  index,
                ) &&
                index >= 0 &&
                index <
                  proposals.length,
            )
            .map(
              (index) =>
                proposals[index],
            )
        : proposals;

    if (selected.length === 0) {
      throw new BadRequestException(
        'This run proposed no actions to execute',
      );
    }

    const executedActionIds: string[] =
      [];
    const executedReportIds: string[] =
      [];

    try {
      for (const proposal of selected) {
        if (
          proposal.kind === 'report'
        ) {
          const report =
            await this.reportsService.generate(
              organizationId,
              null,
              run.websiteId,
              proposal.reportType ||
                'EXECUTIVE',
              {
                title:
                  proposal.title,
              },
            );

          executedReportIds.push(
            report.id,
          );
          continue;
        }

        if (
          proposal.recommendationId
        ) {
          const action =
            await this.recommendationsService.createActionFromRecommendation(
              organizationId,
              proposal.recommendationId,
            );

          executedActionIds.push(
            action.id,
          );
        } else {
          const action =
            await this.actionsService.createAction(
              organizationId,
              {
                websiteId:
                  run.websiteId,
                type:
                  proposal.type ||
                  'GENERAL',
                title:
                  proposal.title,
                description:
                  proposal.description,
                priority:
                  proposal.priority ||
                  'MEDIUM',
                metadata: {
                  ...(proposal.metadata &&
                  typeof proposal.metadata ===
                    'object'
                    ? proposal.metadata
                    : {}),
                  agentRunId: run.id,
                  agentId: agent.id,
                },
              },
            );

          executedActionIds.push(
            action.id,
          );
        }
      }

      const existingEvidence: any[] =
        Array.isArray(
          run.evidence,
        )
          ? (run.evidence as any[])
          : [];

      const updated =
        await this.prisma.agentRun.update(
          {
            where: {
              id: run.id,
            },
            data: {
              approvalState:
                'EXECUTED',
              executedActionIds,
              resultSummary: `${run.resultSummary ?? ''}${
                executedReportIds.length >
                0
                  ? ` Generated report ${executedReportIds.join(', ')}.`
                  : ''
              }`.trim(),
              evidence: [
                ...existingEvidence,
                ...executedReportIds.map(
                  (reportId) => ({
                    source: 'REPORTS',
                    metric:
                      'generated_report',
                    value: reportId,
                  }),
                ),
              ] as any,
            },
          },
        );

      return {
        ...this.toContract(
          updated,
          agent,
        ),
        executedActions:
          executedActionIds.length,
        executedReports:
          executedReportIds,
      };
    } catch (error) {
      await this.prisma.agentRun.update(
        {
          where: {
            id: run.id,
          },
          data: {
            approvalState: 'PENDING',
            executedActionIds,
            error:
              error instanceof
              Error
                ? `Execution stopped: ${error.message}`.slice(
                    0,
                    2000,
                  )
                : 'Execution stopped',
          },
        },
      );

      throw error;
    }
  }

  // =========================================================
  // HISTORY
  // =========================================================

  async listRuns(
    organizationId: string,
    websiteId?: string,
    agentId?: string,
  ) {
    if (websiteId) {
      await this.assertWebsite(
        organizationId,
        websiteId,
      );
    }

    if (
      agentId &&
      !AGENTS.some(
        (agent) =>
          agent.id === agentId,
      )
    ) {
      throw new BadRequestException(
        'Unknown agent',
      );
    }

    const runs =
      await this.prisma.agentRun.findMany(
        {
          where: {
            organizationId,
            ...(websiteId
              ? { websiteId }
              : {}),
            ...(agentId
              ? { agentId }
              : {}),
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 50,
        },
      );

    return {
      total: runs.length,
      runs: runs.map((run) =>
        this.toContract(
          run,
          this.findAgent(
            run.agentId,
          ),
        ),
      ),
    };
  }

  async getRun(
    organizationId: string,
    runId: string,
  ) {
    const run =
      await this.prisma.agentRun.findFirst(
        {
          where: {
            id: runId,
            organizationId,
          },
        },
      );

    if (!run) {
      throw new NotFoundException(
        'Agent run not found',
      );
    }

    return this.toContract(
      run,
      this.findAgent(run.agentId),
    );
  }

  // =========================================================
  // TOOL DISPATCH (permission-enforced)
  // =========================================================

  private async executeTool(
    agent: AgentDefinition,
    organizationId: string,
    websiteId: string,
    tool: string,
    params: Record<string, any>,
    allowWrite: boolean,
  ): Promise<any> {
    const definition =
      getTool(tool);

    if (!definition) {
      throw new BadRequestException(
        `Unknown tool "${tool}"`,
      );
    }

    if (
      !agent.allowedTools.includes(
        tool,
      )
    ) {
      throw new ForbiddenException(
        `Agent "${agent.id}" is not allowed to use tool "${tool}"`,
      );
    }

    if (
      definition.permission ===
        'WRITE_INTERNAL' &&
      !allowWrite
    ) {
      throw new ForbiddenException(
        `Tool "${tool}" requires explicit approval and cannot run inside analysis`,
      );
    }

    if (
      definition.permission ===
      'EXTERNAL_EXECUTION'
    ) {
      throw new ForbiddenException(
        `Tool "${tool}" is not available: no external integration exists`,
      );
    }

    switch (tool) {
      case 'getBusinessContext':
        return this.businessBrainService
          .getBusinessContext(
            organizationId,
            websiteId,
          )
          .catch(() => null);

      case 'getWebsite':
        return this.prisma.website.findFirst(
          {
            where: {
              id: websiteId,
              organizationId,
            },
            select: {
              id: true,
              name: true,
              url: true,
              industry: true,
              country: true,
            },
          },
        );

      case 'getCrawlSummary':
        return this.crawlSummary(
          websiteId,
        );

      case 'getTechnicalIssues':
        return this.technicalIssues(
          websiteId,
          Number(params.limit ?? 10),
        );

      case 'getGSCQueries':
        return this.gscQueries(
          organizationId,
        );

      case 'getLocalHealth':
        return this.localSeoService
          .getHealth(
            organizationId,
            websiteId,
          )
          .catch(() => null);

      case 'getBusinessLocations':
        return this.localSeoService
          .listLocations(
            organizationId,
            websiteId,
          )
          .catch(() => null);

      case 'getContentWorkspace':
        return this.contentWorkspace(
          organizationId,
          websiteId,
        ).catch(() => null);

      case 'getContentBriefs':
        return this.contentService
          .listBriefs(
            organizationId,
            websiteId,
          )
          .catch(() => null);

      case 'getBacklinkOverview':
        return this.backlinksService
          .getOverview(
            organizationId,
            websiteId,
          )
          .catch(() => null);

      case 'getBacklinkOpportunities':
        return this.backlinksService
          .getOpportunities(
            organizationId,
            websiteId,
          )
          .catch(() => null);

      case 'getCompetitors':
        return this.prisma.competitor.findMany(
          {
            where: {
              websiteId,
              organizationId,
              isActive: true,
            },
            select: {
              id: true,
              name: true,
              url: true,
              crawls: {
                orderBy: {
                  createdAt: 'desc',
                },
                take: 1,
                select: {
                  status: true,
                  score: true,
                  totalIssues: true,
                  completedAt: true,
                },
              },
            },
          },
        );

      case 'getCompetitorComparison': {
        const competitorId = String(
          params.competitorId ?? '',
        );

        if (!competitorId) {
          throw new BadRequestException(
            'competitorId is required',
          );
        }

        const competitor =
          await this.prisma.competitor.findFirst(
            {
              where: {
                id: competitorId,
                websiteId,
                organizationId,
              },
              select: { id: true },
            },
          );

        if (!competitor) {
          throw new NotFoundException(
            'Competitor not found',
          );
        }

        return this.comparisonService.compare(
          organizationId,
          competitorId,
        );
      }

      case 'getAiVisibility':
        return this.aiVisibilityService.getIntelligence(
          organizationId,
          websiteId,
        );

      case 'getMonitoringChanges': {
        const result =
          await this.monitoringService.getChanges(
            organizationId,
            websiteId,
          );

        return result.changes ?? [];
      }

      case 'getMonitoringAlerts': {
        const result =
          await this.monitoringService.listAlerts(
            organizationId,
            { websiteId },
          );

        return (
          result.alerts ?? []
        ).slice(0, 20);
      }

      case 'getOpportunities': {
        const unified =
          await this.recommendationsService.getUnifiedOpportunities(
            organizationId,
            websiteId,
          );

        return (
          unified.opportunities ??
          []
        ).slice(
          0,
          Math.min(
            Math.max(
              Number(
                params.limit ?? 10,
              ),
              1,
            ),
            50,
          ),
        );
      }

      case 'getActions':
        return this.prisma.action.findMany(
          {
            where: {
              organizationId,
              websiteId,
              status: {
                in: [
                  'TODO',
                  'IN_PROGRESS',
                ],
              },
            },
            orderBy: {
              updatedAt: 'desc',
            },
            take: 20,
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
              type: true,
              updatedAt: true,
            },
          },
        );

      case 'getLeadsRevenue': {
        const [
          leads,
          converted,
          revenue,
          attributed,
        ] = await Promise.all([
          this.prisma.lead.count({
            where: { websiteId },
          }),
          this.prisma.lead.count({
            where: {
              websiteId,
              converted: true,
            },
          }),
          this.prisma.revenue.aggregate(
            {
              where: {
                websiteId,
                status: 'RECOGNIZED',
              },
              _sum: {
                amount: true,
              },
            },
          ),
          this.prisma.revenue.aggregate(
            {
              where: {
                websiteId,
                status: 'RECOGNIZED',
                leadId: { not: null },
              },
              _sum: {
                amount: true,
              },
            },
          ),
        ]);

        const total = Number(
          revenue._sum.amount ?? 0,
        );
        const linked = Number(
          attributed._sum.amount ?? 0,
        );

        return {
          leads,
          converted,
          recognized: total,
          attributed: linked,
          attributionCoverage:
            total > 0
              ? Number(
                  (
                    (linked /
                      total) *
                    100
                  ).toFixed(2),
                )
              : null,
          conversionRate:
            leads > 0
              ? Number(
                  (
                    (converted /
                      leads) *
                    100
                  ).toFixed(2),
                )
              : null,
        };
      }

      case 'proposeAction': {
        const title = String(
          params.title ?? '',
        ).trim();
        const description = String(
          params.description ?? '',
        ).trim();

        if (!title || !description) {
          throw new BadRequestException(
            'proposeAction requires title and description',
          );
        }

        return {
          title,
          description,
          priority: String(
            params.priority ??
              'MEDIUM',
          ).toUpperCase(),
          type: String(
            params.type ?? 'GENERAL',
          ),
        };
      }

      default:
        throw new BadRequestException(
          `Tool "${tool}" is not executable here`,
        );
    }
  }

  private async crawlSummary(
    websiteId: string,
  ) {
    const latest =
      await this.prisma.crawl.findFirst({
        where: {
          websiteId,
          status: 'COMPLETED',
        },
        orderBy: {
          completedAt: 'desc',
        },
        select: { id: true },
      });

    if (!latest) {
      throw new NotFoundException(
        'No completed crawl found',
      );
    }

    const pages =
      await this.prisma.crawlPage.findMany(
        {
          where: {
            crawlId: latest.id,
          },
          select: {
            issues: {
              where: {
                status: 'OPEN',
              },
              select: {
                severity: true,
              },
            },
          },
        },
      );

    const bySeverity: Record<
      string,
      number
    > = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };

    let open = 0;

    for (const page of pages) {
      for (const issue of page.issues) {
        open += 1;
        const key = String(
          issue.severity,
        ).toUpperCase();

        if (
          bySeverity[key] !== undefined
        ) {
          bySeverity[key] += 1;
        }
      }
    }

    const penalty =
      bySeverity.CRITICAL * 20 +
      bySeverity.HIGH * 10 +
      bySeverity.MEDIUM * 5 +
      bySeverity.LOW * 2;

    return {
      crawlId: latest.id,
      pages: pages.length,
      openIssues: open,
      bySeverity,
      score: Math.max(
        0,
        Math.min(100, 100 - penalty),
      ),
    };
  }

  private async technicalIssues(
    websiteId: string,
    limit: number,
  ) {
    const latest =
      await this.prisma.crawl.findFirst({
        where: {
          websiteId,
          status: 'COMPLETED',
        },
        orderBy: {
          completedAt: 'desc',
        },
        select: { id: true },
      });

    if (!latest) {
      throw new NotFoundException(
        'No completed crawl found',
      );
    }

    const pages =
      await this.prisma.crawlPage.findMany(
        {
          where: {
            crawlId: latest.id,
          },
          select: {
            url: true,
            issues: {
              where: {
                status: 'OPEN',
              },
              select: {
                code: true,
                severity: true,
                title: true,
                description: true,
                recommendation: true,
              },
            },
          },
        },
      );

    const groups = new Map<
      string,
      any
    >();

    for (const page of pages) {
      for (const issue of page.issues) {
        const existing = groups.get(
          issue.code,
        );

        if (existing) {
          existing.count += 1;

          if (
            existing.urls.length < 5
          ) {
            existing.urls.push(
              page.url,
            );
          }
        } else {
          groups.set(issue.code, {
            code: issue.code,
            severity: String(
              issue.severity,
            ).toUpperCase(),
            title: issue.title,
            description:
              issue.description,
            recommendation:
              issue.recommendation,
            count: 1,
            urls: [page.url],
          });
        }
      }
    }

    return [...groups.values()]
      .sort(
        (a, b) =>
          b.count - a.count,
      )
      .slice(
        0,
        Math.min(
          Math.max(limit || 10, 1),
          25,
        ),
      );
  }

  private async contentWorkspace(
    organizationId: string,
    websiteId: string,
  ) {
    const [items, briefs, drafts, refresh] =
      await Promise.all([
        this.contentService
          .listItems(
            organizationId,
            websiteId,
          )
          .catch(() => null),
        this.contentService
          .listBriefs(
            organizationId,
            websiteId,
          )
          .catch(() => null),
        this.contentService
          .listDrafts(
            organizationId,
            websiteId,
          )
          .catch(() => null),
        this.contentService
          .getRefreshQueue(
            organizationId,
            websiteId,
          )
          .catch(() => null),
      ]);

    const byStatus: Record<string, number> =
      {};

    for (const item of items?.items ??
      []) {
      byStatus[item.status] =
        (byStatus[item.status] ?? 0) + 1;
    }

    return {
      itemsByStatus: byStatus,
      totalItems: items?.total ?? 0,
      totalBriefs: briefs?.total ?? 0,
      totalDrafts: drafts?.total ?? 0,
      aiDrafts: drafts?.aiGenerated ?? 0,
      refreshQueue:
        refresh?.refresh ?? [],
      refreshTotal: refresh?.total ?? 0,
      publishing:
        items?.publishing ?? null,
    };
  }

  private async gscQueries(
    organizationId: string,
  ) {
    const end = isoDaysAgo(1);
    const start = isoDaysAgo(30);

    const response: any =
      await this.googleService.getSearchQueries(
        organizationId,
        start,
        end,
      );

    const rows: any[] =
      response?.rows ?? [];

    return rows
      .map((row: any) => ({
        query: String(
          row.query ?? '',
        ),
        clicks: Number(
          row.clicks ?? 0,
        ),
        impressions: Number(
          row.impressions ?? 0,
        ),
        ctr: Number(
          row.ctr ?? 0,
        ),
        position: Number(
          row.position ?? 0,
        ),
      }))
      .filter(
        (row) => row.query,
      )
      .slice(0, 50);
  }

  // =========================================================
  // HELPERS
  // =========================================================

  private findAgent(
    agentId: string,
  ) {
    const agent = AGENTS.find(
      (item) => item.id === agentId,
    );

    if (!agent) {
      throw new NotFoundException(
        'Unknown agent',
      );
    }

    return agent;
  }

  private async assertWebsite(
    organizationId: string,
    websiteId: string,
  ) {
    const website =
      await this.prisma.website.findFirst(
        {
          where: {
            id: websiteId,
            organizationId,
            isActive: true,
          },
          select: { id: true },
        },
      );

    if (!website) {
      throw new NotFoundException(
        'Website not found',
      );
    }
  }

  private toContract(
    run: any,
    agent: {
      id: string;
      name: string;
      approvalRequired: boolean;
      mode: string;
    },
  ) {
    return {
      runId: run.id,
      agent: {
        id: agent.id,
        name: agent.name,
        approvalRequired:
          agent.approvalRequired,
        mode: agent.mode,
      },
      organizationId:
        run.organizationId,
      websiteId: run.websiteId,
      trigger: run.trigger,
      input: run.input,
      status: run.status,
      approvalState:
        run.approvalState,
      selectedTools:
        run.selectedTools ?? [],
      evidence: run.evidence ?? [],
      resultSummary:
        run.resultSummary,
      proposedActions:
        run.proposedActions ?? [],
      executedActionIds:
        run.executedActionIds ?? [],
      error: run.error,
      startedAt: run.startedAt,
      completedAt:
        run.completedAt,
      providerUnavailable: true,
    };
  }
}

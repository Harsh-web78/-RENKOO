import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessBrainService } from '../business-brain/business-brain.service';
import { BillingService } from '../billing/billing.service';
import { CreateAiVisibilityQueryDto } from './dto/ai-visibility-query.dto';
import { UpdateAiVisibilityQueryDto } from './dto/ai-visibility-query.dto';
import { RecordAiCheckDto } from './dto/record-ai-check.dto';
import {
  LiveAiProviderParam,
  RunAiCheckDto,
} from './dto/run-ai-check.dto';
import { AiProviderRegistry } from './providers/provider.registry';
import { AiProviderError } from './providers/provider.errors';
import {
  LiveAiProviderId,
  LiveProviderResultType,
} from './providers/provider.interface';
import { analyzeAiResponse } from './analysis';

/*
 * Free-workspace monthly allowance for live
 * provider checks. Mirrors BillingService
 * FREE_LIMITS AI_SCANS. Measured from persisted
 * checks (no subscription counter exists for
 * free workspaces).
 */
const FREE_MONTHLY_AI_SCANS = 5;

const RUN_MAX_OUTPUT_TOKENS = 512;

@Injectable()
export class AiVisibilityService {
  private readonly logger = new Logger(
    AiVisibilityService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly businessBrainService: BusinessBrainService,
    private readonly billingService: BillingService,
    private readonly providerRegistry: AiProviderRegistry,
  ) {}

  private async verifyWebsite(
    organizationId: string,
    websiteId: string,
  ) {
    const website = await this.prisma.website.findFirst({
      where: {
        id: websiteId,
        organizationId,
        isActive: true,
      },
    });

    if (!website) {
      throw new NotFoundException('Website not found');
    }

    return website;
  }

  async getDashboard(
    organizationId: string,
    websiteId: string,
  ) {
    const website = await this.verifyWebsite(
      organizationId,
      websiteId,
    );

    const queries =
      await this.prisma.aiVisibilityQuery.findMany({
        where: {
          websiteId,
          isActive: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

    const checks =
      await this.prisma.aiVisibilityCheck.findMany({
        where: {
          websiteId,
        },
        orderBy: {
          checkedAt: 'desc',
        },
        take: 100,
      });

    const latestSummary =
      await this.prisma.aiVisibilitySummary.findFirst({
        where: {
          websiteId,
        },
        orderBy: {
          date: 'desc',
        },
      });

    const latestAeoAudit =
      await this.prisma.aeoAudit.findFirst({
        where: {
          websiteId,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

    const latestGeoAudit =
      await this.prisma.geoAudit.findFirst({
        where: {
          websiteId,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

    const completedChecks = checks.filter(
      (check) => check.status === 'COMPLETED',
    );

    const mentionedChecks = completedChecks.filter(
      (check) => check.mentioned,
    );

    const mentionedQueries = new Set<string>();
    const citedQueries = new Set<string>();

    for (const check of completedChecks) {
      if (check.mentioned) {
        mentionedQueries.add(check.query);
      }

      if (check.citationFound) {
        citedQueries.add(check.query);
      }
    }

    const positions = mentionedChecks
      .map((check) => check.position)
      .filter(
        (position): position is number =>
          position !== null,
      );

    const averagePosition = positions.length
      ? positions.reduce(
          (sum, position) => sum + position,
          0,
        ) / positions.length
      : null;

    const visibilityScore =
      latestSummary?.visibilityScore ??
      this.calculateVisibilityScore(
        queries.length,
        mentionedQueries.size,
        citedQueries.size,
      );

    const platformStats = new Map<
      string,
      {
        completed: number;
        mentioned: number;
        cited: number;
      }
    >();

    for (const check of completedChecks) {
      const platform = check.platform || 'Unknown';

      const current = platformStats.get(platform) ?? {
        completed: 0,
        mentioned: 0,
        cited: 0,
      };

      current.completed += 1;

      if (check.mentioned) {
        current.mentioned += 1;
      }

      if (check.citationFound) {
        current.cited += 1;
      }

      platformStats.set(platform, current);
    }

    const queryPerformance = queries.map((query) => {
      const queryChecks = completedChecks.filter(
        (check) => check.query === query.query,
      );

      const mentioned = queryChecks.filter(
        (check) => check.mentioned,
      ).length;

      const cited = queryChecks.filter(
        (check) => check.citationFound,
      ).length;

      const queryPositions = queryChecks
        .map((check) => check.position)
        .filter(
          (position): position is number =>
            position !== null,
        );

      return {
        id: query.id,
        query: query.query,
        category: query.category,
        checks: queryChecks.length,
        mentioned,
        cited,
        mentionRate:
          queryChecks.length > 0
            ? Math.round(
                (mentioned / queryChecks.length) * 100,
              )
            : null,
        citationRate:
          queryChecks.length > 0
            ? Math.round(
                (cited / queryChecks.length) * 100,
              )
            : null,
        averagePosition: queryPositions.length
          ? queryPositions.reduce(
              (sum, position) => sum + position,
              0,
            ) / queryPositions.length
          : null,
      };
    });

    const citationGapQueries = queryPerformance
      .filter(
        (item) =>
          item.checks > 0 &&
          item.mentioned > 0 &&
          item.cited === 0,
      )
      .sort(
        (a, b) => b.mentioned - a.mentioned,
      );

    const visibilityGapQueries = queryPerformance
      .filter(
        (item) =>
          item.checks > 0 &&
          item.mentioned === 0,
      );

    const competitorMentionCount =
      completedChecks.reduce(
        (total, check) =>
          total +
          (check.competitorNames?.length ?? 0),
        0,
      );

    const opportunities: any[] = [];

    if (citationGapQueries.length > 0) {
      opportunities.push({
        key: 'AI_CITATION_GAP',
        type: 'AI_VISIBILITY',
        priority: 'HIGH',
        title: 'Convert AI mentions into citations',
        description:
          `${citationGapQueries.length} tracked queries mention the website without a recorded citation.`,
        count: citationGapQueries.length,
        queries: citationGapQueries
          .slice(0, 10)
          .map((item) => item.query),
        actionText:
          'Strengthen authoritative, quotable content around these queries and improve supporting entity signals.',
      });
    }

    if (visibilityGapQueries.length > 0) {
      opportunities.push({
        key: 'AI_VISIBILITY_GAP',
        type: 'AI_VISIBILITY',
        priority: 'MEDIUM',
        title: 'Improve uncovered AI queries',
        description:
          `${visibilityGapQueries.length} tracked queries have completed checks without a recorded brand mention.`,
        count: visibilityGapQueries.length,
        queries: visibilityGapQueries
          .slice(0, 10)
          .map((item) => item.query),
        actionText:
          'Create or improve content that directly answers these queries and reinforces the website entity.',
      });
    }

    if (
      competitorMentionCount > 0 &&
      citedQueries.size < mentionedQueries.size
    ) {
      opportunities.push({
        key: 'AI_COMPETITOR_GAP',
        type: 'AI_VISIBILITY',
        priority: 'MEDIUM',
        title: 'Close competitor visibility gaps',
        description:
          'Completed AI checks contain competitor mentions while some tracked queries lack a recorded citation.',
        count: competitorMentionCount,
        actionText:
          'Compare competitor-mentioned topics with your strongest pages and strengthen missing authority signals.',
      });
    }

    // Persist AI visibility opportunities as real Recommendation records.
    // Uses findFirst because Recommendation has no compound unique constraint.
    const persistedOpportunities: any[] = [];

    for (const opportunity of opportunities) {
      const existing = await this.prisma.recommendation.findFirst({
        where: {
          organizationId,
          websiteId,
          source: 'AI_VISIBILITY',
          type: opportunity.key,
          title: opportunity.title,
        },
      });

      const data = {
        organizationId,
        websiteId,
        source: 'AI_VISIBILITY',
        type: opportunity.key,
        title: opportunity.title,
        description: opportunity.description,
        priority: opportunity.priority,
        impact: opportunity.impact || 'MEDIUM',
        effort: opportunity.effort || 'MEDIUM',
        actionText: opportunity.actionText || null,
        metadata: {
          websiteId,
          source: 'AI_VISIBILITY',
          opportunityKey: opportunity.key,
          count: opportunity.count || 0,
          queries: opportunity.queries || [],
        },
      };

      const recommendation = existing
        ? await this.prisma.recommendation.update({
            where: { id: existing.id },
            data,
          })
        : await this.prisma.recommendation.create({
            data,
          });

      persistedOpportunities.push({
        ...opportunity,
        recommendationId: recommendation.id,
      });
    }

    return {
      website,
      score: visibilityScore,
      queries,
      checks,
      summary: latestSummary,
      metrics: {
        totalQueries: queries.length,
        completedChecks: completedChecks.length,
        mentionedQueries: mentionedQueries.size,
        citedQueries: citedQueries.size,
        averagePosition,
        competitorMentions: competitorMentionCount,
      },
      platformStats: Array.from(
        platformStats.entries(),
      ).map(([platform, stats]) => ({
        platform,
        ...stats,
        mentionRate:
          stats.completed > 0
            ? Math.round(
                (stats.mentioned / stats.completed) * 100,
              )
            : 0,
        citationRate:
          stats.completed > 0
            ? Math.round(
                (stats.cited / stats.completed) * 100,
              )
            : 0,
      })),
      queryPerformance,
      opportunities: persistedOpportunities,
      aeo: latestAeoAudit,
      geo: latestGeoAudit,
    };
  }
  async getHistory(
    organizationId: string,
    websiteId: string,
    days = 30,
  ) {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );

    const safeDays = Math.min(
      Math.max(Number(days) || 30, 1),
      365,
    );

    const from = new Date();

    from.setHours(0, 0, 0, 0);

    from.setDate(
      from.getDate() - (safeDays - 1),
    );

    const summaries =
      await this.prisma.aiVisibilitySummary.findMany({
        where: {
          websiteId,
          date: {
            gte: from,
          },
        },
        orderBy: {
          date: 'asc',
        },
      });

    return {
      websiteId,
      days: safeDays,
      summaries,
    };
  }

  async createSnapshot(
    organizationId: string,
    websiteId: string,
  ) {
    await this.verifyWebsite(
      organizationId,
      websiteId,
    );

    const queries =
      await this.prisma.aiVisibilityQuery.findMany({
        where: {
          websiteId,
          isActive: true,
        },
        select: {
          id: true,
          query: true,
        },
      });

    const checks =
      await this.prisma.aiVisibilityCheck.findMany({
        where: {
          websiteId,
          status: 'COMPLETED',
        },
        orderBy: {
          checkedAt: 'desc',
        },
        take: 1000,
      });

    const uniqueMentionedQueries =
      new Set<string>();

    const uniqueCitedQueries =
      new Set<string>();

    for (const check of checks) {
      if (check.mentioned) {
        uniqueMentionedQueries.add(check.query);
      }

      if (check.citationFound) {
        uniqueCitedQueries.add(check.query);
      }
    }

    const mentionedQueries =
      uniqueMentionedQueries.size;

    const citedQueries =
      uniqueCitedQueries.size;

    const positions = checks
      .filter((check) => check.mentioned)
      .map((check) => check.position)
      .filter(
        (position): position is number =>
          position !== null,
      );

    const averagePosition = positions.length
      ? positions.reduce(
          (sum, position) => sum + position,
          0,
        ) / positions.length
      : null;

    const totalQueries = queries.length;

    const visibilityScore =
      this.calculateVisibilityScore(
        totalQueries,
        mentionedQueries,
        citedQueries,
      );

    const citationRate =
      totalQueries > 0
        ? (citedQueries / totalQueries) * 100
        : 0;

    const competitorMentions =
      checks.reduce(
        (total, check) =>
          total +
          (check.competitorNames?.length ?? 0),
        0,
      );

    const now = new Date();

    const date = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    return this.prisma.aiVisibilitySummary.upsert({
      where: {
        websiteId_date: {
          websiteId,
          date,
        },
      },
      create: {
        id: crypto.randomUUID(),
        websiteId,
        date,
        totalQueries,
        mentionedQueries,
        citedQueries,
        visibilityScore,
        citationRate,
        averagePosition,
        competitorMentions,
        updatedAt: now,
      },
      update: {
        totalQueries,
        mentionedQueries,
        citedQueries,
        visibilityScore,
        citationRate,
        averagePosition,
        competitorMentions,
        updatedAt: now,
      },
    });
  }

  // =========================================================
  // TRACKED PROMPT (QUERY) MANAGEMENT
  // =========================================================

  async createQuery(
    organizationId: string,
    dto: CreateAiVisibilityQueryDto,
  ) {
    await this.verifyWebsite(
      organizationId,
      dto.websiteId,
    );

    const query = dto.query.trim();

    if (!query) {
      throw new BadRequestException(
        'query is required',
      );
    }

    const websiteIds = (
      await this.prisma.website.findMany({
        where: { organizationId },
        select: { id: true },
      })
    ).map((site) => site.id);

    const current =
      websiteIds.length > 0
        ? await this.prisma.aiVisibilityQuery.count(
            {
              where: {
                websiteId: {
                  in: websiteIds,
                },
              },
            },
          )
        : 0;

    await this.billingService.enforceCreation(
      organizationId,
      'AI_PROMPTS',
      current,
    );

    const existing =
      await this.prisma.aiVisibilityQuery.findUnique(
        {
          where: {
            websiteId_query: {
              websiteId: dto.websiteId,
              query,
            },
          },
        },
      );

    if (existing) {
      if (!existing.isActive) {
        return this.prisma.aiVisibilityQuery.update(
          {
            where: {
              id: existing.id,
            },
            data: {
              isActive: true,
              category:
                dto.category?.trim() ||
                existing.category,
              updatedAt: new Date(),
            },
          },
        );
      }

      throw new BadRequestException(
        'This prompt is already tracked',
      );
    }

    return this.prisma.aiVisibilityQuery.create(
      {
        data: {
          id: crypto.randomUUID(),
          websiteId: dto.websiteId,
          query,
          category:
            dto.category?.trim() ||
            null,
          updatedAt: new Date(),
        },
      },
    );
  }

  private async getOwnedQuery(
    organizationId: string,
    id: string,
  ) {
    const record =
      await this.prisma.aiVisibilityQuery.findUnique(
        {
          where: { id },
        },
      );

    if (!record) {
      throw new NotFoundException(
        'Tracked prompt not found',
      );
    }

    await this.verifyWebsite(
      organizationId,
      record.websiteId,
    );

    return record;
  }

  async updateQuery(
    organizationId: string,
    id: string,
    dto: UpdateAiVisibilityQueryDto,
  ) {
    const record =
      await this.getOwnedQuery(
        organizationId,
        id,
      );

    const nextQuery =
      dto.query !== undefined
        ? dto.query.trim()
        : record.query;

    if (!nextQuery) {
      throw new BadRequestException(
        'query is required',
      );
    }

    if (
      nextQuery !== record.query
    ) {
      const duplicate =
        await this.prisma.aiVisibilityQuery.findUnique(
          {
            where: {
              websiteId_query: {
                websiteId:
                  record.websiteId,
                query: nextQuery,
              },
            },
          },
        );

      if (
        duplicate &&
        duplicate.id !== record.id
      ) {
        throw new BadRequestException(
          'Another tracked prompt already uses this text',
        );
      }
    }

    return this.prisma.aiVisibilityQuery.update(
      {
        where: { id: record.id },
        data: {
          query: nextQuery,
          category:
            dto.category !== undefined
              ? dto.category.trim() ||
                null
              : record.category,
          isActive:
            dto.isActive !== undefined
              ? dto.isActive
              : record.isActive,
          updatedAt: new Date(),
        },
      },
    );
  }

  async deleteQuery(
    organizationId: string,
    id: string,
  ) {
    const record =
      await this.getOwnedQuery(
        organizationId,
        id,
      );

    await this.prisma.aiVisibilityQuery.delete(
      {
        where: { id: record.id },
      },
    );

    return {
      success: true,
      id: record.id,
    };
  }

  // =========================================================
  // MANUAL RESULT RECORDING
  //
  // For observations recorded by the workspace owner
  // (no provider integration exists yet). Every record is
  // a real stored observation, never a provider response.
  // =========================================================

  async recordCheck(
    organizationId: string,
    dto: RecordAiCheckDto,
  ) {
    await this.verifyWebsite(
      organizationId,
      dto.websiteId,
    );

    const query = dto.query.trim();

    if (!query) {
      throw new BadRequestException(
        'query is required',
      );
    }

    const competitorNames = [
      ...new Set(
        (dto.competitorNames ?? [])
          .map((name) =>
            name.trim(),
          )
          .filter(Boolean)
          .slice(0, 20),
      ),
    ];

    let citationUrl: string | null =
      dto.citationUrl?.trim() ||
      null;

    if (
      citationUrl &&
      !/^https?:\/\//i.test(
        citationUrl,
      )
    ) {
      throw new BadRequestException(
        'citationUrl must start with http:// or https://',
      );
    }

    if (
      dto.citationFound &&
      !citationUrl
    ) {
      throw new BadRequestException(
        'citationUrl is required when citationFound is true',
      );
    }

    return this.prisma.aiVisibilityCheck.create(
      {
        data: {
          id: crypto.randomUUID(),
          websiteId: dto.websiteId,
          platform: dto.platform,
          query,
          status: 'COMPLETED',
          mentioned: dto.mentioned,
          citationFound:
            dto.citationFound,
          position:
            dto.position ?? null,
          response:
            dto.response?.trim() ||
            null,
          citationUrl,
          competitorNames,
          checkedAt: new Date(),
        },
      },
    );
  }

  // =========================================================
  // LIVE PROVIDER RUN CHECK
  //
  // Manual, controlled single-prompt execution:
  // entitlement check -> provider execution ->
  // persisted response -> deterministic analysis.
  // One request = one provider call = one AI_SCANS
  // unit. No background loops, no auto-scanning.
  // The tracked question is sent verbatim so the
  // observation is unbiased; no workspace
  // internals travel to the provider.
  // =========================================================

  listLiveProviderStates() {
    return this.providerRegistry.listDeclaredStates();
  }

  private async consumeAiScanAllowance(
    organizationId: string,
  ): Promise<void> {
    const subscription =
      await this.billingService.getSubscription(
        organizationId,
      );

    if (!subscription) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const used =
        await this.prisma.aiVisibilityCheck.count(
          {
            where: {
              Website: {
                organizationId,
              },
              createdAt: {
                gte: monthStart,
              },
            },
          },
        );

      if (used >= FREE_MONTHLY_AI_SCANS) {
        throw new ForbiddenException({
          code: 'LIMIT_REACHED',
          message:
            'Monthly AI check allowance reached. Upgrade your plan to continue.',
          metric: 'AI_SCANS',
          used,
          limit: FREE_MONTHLY_AI_SCANS,
        });
      }

      return;
    }

    try {
      await this.billingService.consumeUsage(
        organizationId,
        'AI_SCANS',
        1,
      );
    } catch (error: any) {
      throw new ForbiddenException({
        code: 'LIMIT_REACHED',
        message:
          error?.message ??
          'AI check allowance reached. Upgrade your plan to continue.',
        metric: 'AI_SCANS',
      });
    }
  }

  private providerErrorStatus(
    code: string,
  ): HttpStatus {
    switch (code) {
      case 'PROVIDER_NOT_CONFIGURED':
        return HttpStatus.SERVICE_UNAVAILABLE;
      case 'INVALID_PROVIDER_KEY':
        return HttpStatus.UNPROCESSABLE_ENTITY;
      case 'RATE_LIMITED':
      case 'QUOTA_EXCEEDED':
        return HttpStatus.TOO_MANY_REQUESTS;
      case 'PROVIDER_TIMEOUT':
        return HttpStatus.GATEWAY_TIMEOUT;
      default:
        return HttpStatus.BAD_GATEWAY;
    }
  }

  private toProviderHttpError(
    error: AiProviderError,
  ): HttpException {
    return new HttpException(
      {
        code: error.code,
        provider: error.provider,
        message: error.message,
        observationType: null,
      },
      this.providerErrorStatus(error.code),
    );
  }

  private hostOf(url: string): string | null {
    try {
      return new URL(url).hostname
        .toLowerCase()
        .replace(/^www\./, '');
    } catch {
      return null;
    }
  }

  async runCheck(
    organizationId: string,
    dto: RunAiCheckDto,
  ) {
    const website = await this.verifyWebsite(
      organizationId,
      dto.websiteId,
    );

    let promptText =
      dto.query?.trim() ?? '';
    let queryId: string | null = null;
    let category: string | null = null;

    if (dto.queryId?.trim()) {
      const tracked =
        await this.prisma.aiVisibilityQuery.findFirst(
          {
            where: {
              id: dto.queryId.trim(),
              websiteId: dto.websiteId,
              Website: {
                organizationId,
              },
            },
          },
        );

      if (!tracked) {
        throw new NotFoundException(
          'Tracked prompt not found',
        );
      }

      promptText = tracked.query;
      queryId = tracked.id;
      category = tracked.category;
    }

    if (!promptText) {
      throw new BadRequestException(
        'Either queryId or query is required',
      );
    }

    const provider =
      this.providerRegistry.get(
        dto.provider as LiveAiProviderId,
      );

    if (!provider) {
      throw new BadRequestException(
        `Provider ${dto.provider} is not available for live checks`,
      );
    }

    if (!provider.isConfigured()) {
      throw new HttpException(
        {
          code: 'PROVIDER_NOT_CONFIGURED',
          provider: provider.id,
          message: `${provider.displayName} is not configured. Set the provider API key on the backend.`,
          observationType: null,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    /*
     * Entitlement gate BEFORE any provider spend.
     * LIMIT_REACHED surfaces when the allowance
     * is exhausted.
     */
    await this.consumeAiScanAllowance(
      organizationId,
    );

    let output: Awaited<
      ReturnType<typeof provider.executePrompt>
    >;

    try {
      output =
        await provider.executePrompt({
          prompt: promptText,
          maxOutputTokens:
            RUN_MAX_OUTPUT_TOKENS,
        });
    } catch (error) {
      if (error instanceof AiProviderError) {
        await this.prisma.aiVisibilityCheck.create(
          {
            data: {
              id: crypto.randomUUID(),
              websiteId: dto.websiteId,
              platform: provider.id,
              query: promptText,
              status: 'FAILED',
              mentioned: false,
              citationFound: false,
              errorMessage: `${error.code}: ${error.message}`.slice(
                0,
                500,
              ),
              checkedAt: new Date(),
            },
          },
        );

        throw this.toProviderHttpError(
          error,
        );
      }

      throw error;
    }

    /*
     * Deterministic, evidence-backed analysis of
     * the REAL response. Brand terms come from
     * the website + Business Brain; competitors
     * from tracked competitors only.
     */
    let businessName: string | null = null;

    try {
      const context =
        await this.businessBrainService.getBusinessContext(
          organizationId,
          dto.websiteId,
        );

      businessName =
        context.profile?.businessName ??
        null;
    } catch {
      businessName = null;
    }

    const trackedCompetitors =
      await this.prisma.competitor.findMany({
        where: {
          organizationId,
          websiteId: dto.websiteId,
          isActive: true,
        },
        select: {
          name: true,
          url: true,
          domain: true,
        },
        take: 50,
      });

    const brandTerms = [
      website.name,
      businessName,
      website.url,
      this.hostOf(website.url),
    ].filter(
      (term): term is string =>
        Boolean(term && term.trim()),
    );

    const analysis = analyzeAiResponse({
      text: output.text,
      brandTerms,
      competitors:
        trackedCompetitors.map(
          (competitor) => ({
            name: competitor.name,
            domains: [
              competitor.domain,
              this.hostOf(competitor.url),
            ].filter(
              (
                domain,
              ): domain is string =>
                Boolean(domain),
            ),
          }),
        ),
    });

    const check =
      await this.prisma.aiVisibilityCheck.create(
        {
          data: {
            id: crypto.randomUUID(),
            websiteId: dto.websiteId,
            platform: provider.id,
            query: promptText,
            status: 'COMPLETED',
            mentioned: analysis.mentioned,
            citationFound: false,
            position: null,
            response: output.text.slice(
              0,
              20000,
            ),
            citationUrl: null,
            competitorNames:
              analysis.competitorMentions.map(
                (mention) => mention.name,
              ),
            checkedAt: new Date(),
          },
        },
      );

    try {
      await this.createSnapshot(
        organizationId,
        dto.websiteId,
      );
    } catch (error) {
      this.logger.warn(
        `Snapshot refresh skipped after live check: ${String((error as Error)?.message ?? error).slice(0, 160)}`,
      );
    }

    const completedForPrompt =
      await this.prisma.aiVisibilityCheck.count(
        {
          where: {
            websiteId: dto.websiteId,
            query: promptText,
            status: 'COMPLETED',
          },
        },
      );

    const resultType: LiveProviderResultType =
      output.resultType;

    return {
      check,
      queryId,
      category,
      analysis,
      provider: {
        id: provider.id,
        displayName:
          provider.displayName,
        model: output.model,
        latencyMs: output.latencyMs,
        usage: output.usage,
      },
      observationType: resultType,
      resultLabel:
        'LIVE_PROVIDER_RESULT' as const,
      citations: [],
      citationsNote:
        'NO_CITATIONS' as const,
      citationsReason:
        `${provider.displayName} text responses do not include source metadata; citation tracking continues via manual observations.`,
      sampleSize: {
        promptChecks: completedForPrompt,
        note: `Based on ${completedForPrompt} recorded check(s) for this prompt — not on all provider answers.`,
      },
    };
  }

  // =========================================================
  // DETERMINISTIC PROMPT SUGGESTIONS
  //
  // Templates built only from Business Brain products,
  // services and locations. Labeled deterministic,
  // never persisted, never presented as AI output.
  // =========================================================

  async suggestQueries(
    organizationId: string,
    websiteId: string,
  ) {
    const website =
      await this.verifyWebsite(
        organizationId,
        websiteId,
      );

    let context: any = null;

    try {
      context =
        await this.businessBrainService.getBusinessContext(
          organizationId,
          websiteId,
        );
    } catch {
      context = null;
    }

    const offerings = [
      ...(context?.offerings?.services ??
        []),
      ...(context?.offerings?.products ??
        []),
    ].slice(0, 4);

    const locations = (
      context?.priorities
        ?.targetLocations ?? []
    ).slice(0, 2);

    const suggestions: Array<{
      query: string;
      category: string;
      deterministic: true;
      alreadyTracked: boolean;
    }> = [];

    const seen = new Set<string>();

    const push = (
      query: string,
      category: string,
    ) => {
      const key = query
        .toLowerCase()
        .trim();

      if (!key || seen.has(key)) {
        return;
      }

      seen.add(key);
      suggestions.push({
        query: query.trim(),
        category,
        deterministic: true,
        alreadyTracked: false,
      });
    };

    /*
     * Category coverage driven by real Business
     * Brain context: commercial, comparison,
     * alternatives, problem/solution, local,
     * trust/evidence, and buyer-research angles.
     */
    for (const offering of offerings) {
      push(
        `best ${offering}`,
        'commercial',
      );
      push(
        `what is ${offering}`,
        'informational',
      );
      push(
        `${offering} vs alternatives compared`,
        'comparison',
      );
      push(
        `alternatives to ${offering}`,
        'alternatives',
      );
      push(
        `how to choose ${offering}`,
        'buyer-research',
      );
      push(
        `common problems with ${offering} and how to fix them`,
        'problem-solution',
      );
      push(
        `is ${offering} worth it reviews`,
        'trust-evidence',
      );

      for (const location of locations) {
        push(
          `best ${offering} in ${location}`,
          'local-intent',
        );
        push(
          `${offering} near ${location} price and options`,
          'local-intent',
        );
      }
    }

    for (const keyword of (
      context?.priorities
        ?.primaryKeywords ?? []
    ).slice(0, 4)) {
      push(
        `${keyword}`,
        'keyword',
      );
    }

    if (suggestions.length === 0) {
      return {
        websiteId,
        websiteUrl: website.url,
        deterministic: true,
        suggestions: [],
        reason:
          'Business Brain has no products, services or keywords yet, so no deterministic suggestions can be built. Configure them first.',
      };
    }

    const tracked =
      await this.prisma.aiVisibilityQuery.findMany(
        {
          where: { websiteId },
          select: { query: true },
        },
      );

    const trackedSet = new Set(
      tracked.map((item) =>
        item.query
          .toLowerCase()
          .trim(),
      ),
    );

    const limited = suggestions.slice(
      0,
      24,
    );

    for (const suggestion of limited) {
      suggestion.alreadyTracked =
        trackedSet.has(
          suggestion.query
            .toLowerCase()
            .trim(),
        );
    }

    return {
      websiteId,
      websiteUrl: website.url,
      deterministic: true,
      disclaimer:
        'Deterministic templates from Business Brain context only. Not AI-generated and not provider data.',
      suggestions: limited,
    };
  }

  // =========================================================
  // INTELLIGENCE — citations, competitors, share of voice,
  // trend and gaps from persisted results only.
  // =========================================================

  async getIntelligence(
    organizationId: string,
    websiteId: string,
  ) {
    const website =
      await this.verifyWebsite(
        organizationId,
        websiteId,
      );

    const [queries, checks, competitors] =
      await Promise.all([
        this.prisma.aiVisibilityQuery.findMany(
          {
            where: {
              websiteId,
              isActive: true,
            },
            orderBy: {
              createdAt: 'asc',
            },
          },
        ),

        this.prisma.aiVisibilityCheck.findMany(
          {
            where: { websiteId },
            orderBy: {
              checkedAt: 'desc',
            },
            take: 500,
          },
        ),

        this.prisma.competitor.findMany(
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
            },
          },
        ),
      ]);

    const completed = checks.filter(
      (check) =>
        check.status === 'COMPLETED',
    );

    const checksByQuery = new Map<
      string,
      typeof completed
    >();

    for (const check of completed) {
      const list =
        checksByQuery.get(
          check.query,
        ) ?? [];

      list.push(check);
      checksByQuery.set(
        check.query,
        list,
      );
    }

    // -------------------------------------------------------
    // Citations (only stored citationUrl values)
    // -------------------------------------------------------

    const citationsByDomain = new Map<
      string,
      {
        domain: string;
        citations: number;
        urls: string[];
        queries: string[];
      }
    >();

    for (const check of completed) {
      if (
        !check.citationFound ||
        !check.citationUrl
      ) {
        continue;
      }

      let domain = '';

      try {
        domain = new URL(
          check.citationUrl,
        )
          .hostname.replace(/^www\./i, '')
          .toLowerCase();
      } catch {
        continue;
      }

      const entry =
        citationsByDomain.get(
          domain,
        ) ?? {
          domain,
          citations: 0,
          urls: [],
          queries: [],
        };

      entry.citations += 1;

      if (
        !entry.urls.includes(
          check.citationUrl,
        ) &&
        entry.urls.length < 10
      ) {
        entry.urls.push(
          check.citationUrl,
        );
      }

      if (
        !entry.queries.includes(
          check.query,
        ) &&
        entry.queries.length < 10
      ) {
        entry.queries.push(
          check.query,
        );
      }

      citationsByDomain.set(
        domain,
        entry,
      );
    }

    const citations = [
      ...citationsByDomain.values(),
    ].sort(
      (a, b) =>
        b.citations - a.citations,
    );

    // -------------------------------------------------------
    // Brand vs competitors (recorded mentions only)
    // -------------------------------------------------------

    const brandMentions =
      completed.filter(
        (check) => check.mentioned,
      ).length;

    const competitorMentionEvents =
      new Map<string, number>();

    for (const check of completed) {
      for (const name of check.competitorNames ??
        []) {
        const clean = name.trim();

        if (!clean) {
          continue;
        }

        competitorMentionEvents.set(
          clean,
          (competitorMentionEvents.get(
            clean,
          ) ?? 0) + 1,
        );
      }
    }

    const trackedCompetitors =
      competitors.map(
        (competitor) => {
          let mentions = 0;

          for (const [
            name,
            count,
          ] of competitorMentionEvents) {
            if (
              name
                .toLowerCase()
                .includes(
                  competitor.name
                    .toLowerCase(),
                ) ||
              competitor.name
                .toLowerCase()
                .includes(
                  name.toLowerCase(),
                )
            ) {
              mentions += count;
            }
          }

          return {
            id: competitor.id,
            name: competitor.name,
            url: competitor.url,
            mentions,
            hasData:
              completed.length > 0,
          };
        },
      );

    const totalCompetitorEvents = [
      ...competitorMentionEvents.values(),
    ].reduce(
      (sum, count) => sum + count,
      0,
    );

    const shareDenominator =
      brandMentions +
      totalCompetitorEvents;

    // -------------------------------------------------------
    // Trend (recent half vs older half, points only)
    // -------------------------------------------------------

    const ordered = [...completed].sort(
      (a, b) =>
        new Date(
          a.checkedAt ??
            a.createdAt,
        ).getTime() -
        new Date(
          b.checkedAt ??
            b.createdAt,
        ).getTime(),
    );

    let trend: {
      recentMentionRate: number | null;
      olderMentionRate: number | null;
      pointChange: number | null;
      recentCount: number;
      olderCount: number;
    } | null = null;

    if (ordered.length >= 4) {
      const half = Math.floor(
        ordered.length / 2,
      );
      const older = ordered.slice(
        0,
        half,
      );
      const recent = ordered.slice(
        half,
      );

      const olderRate =
        (older.filter(
          (check) => check.mentioned,
        ).length /
          older.length) *
        100;
      const recentRate =
        (recent.filter(
          (check) => check.mentioned,
        ).length /
          recent.length) *
        100;

      trend = {
        recentMentionRate: Number(
          recentRate.toFixed(1),
        ),
        olderMentionRate: Number(
          olderRate.toFixed(1),
        ),
        pointChange: Number(
          (
            recentRate - olderRate
          ).toFixed(1),
        ),
        recentCount: recent.length,
        olderCount: older.length,
      };
    }

    // -------------------------------------------------------
    // Gaps with evidence
    // -------------------------------------------------------

    const gaps: Array<{
      key: string;
      title: string;
      description: string;
      priority: string;
      queries: string[];
      evidence: Record<
        string,
        unknown
      >;
    }> = [];

    const unresulted = queries
      .filter(
        (query) =>
          !checksByQuery.has(
            query.query,
          ),
      )
      .map((query) => query.query);

    if (unresulted.length > 0) {
      gaps.push({
        key: 'AI_NO_RESULT',
        title:
          'Tracked prompts have no recorded results',
        description: `${unresulted.length} tracked prompt${unresulted.length === 1 ? '' : 's'} have no recorded AI results yet. Record results manually until a provider is connected.`,
        priority: 'MEDIUM',
        queries: unresulted.slice(
          0,
          10,
        ),
        evidence: {
          count: unresulted.length,
        },
      });
    }

    const mentionedNotCited: string[] =
      [];

    for (const [
      query,
      list,
    ] of checksByQuery) {
      const mentioned = list.some(
        (check) => check.mentioned,
      );
      const cited = list.some(
        (check) =>
          check.citationFound,
      );

      if (mentioned && !cited) {
        mentionedNotCited.push(
          query,
        );
      }
    }

    if (
      mentionedNotCited.length > 0
    ) {
      gaps.push({
        key: 'AI_CITATION_GAP',
        title:
          'Mentioned without citation',
        description: `${mentionedNotCited.length} quer${mentionedNotCited.length === 1 ? 'y is' : 'ies are'} recording brand mentions without any stored citation.`,
        priority: 'HIGH',
        queries: mentionedNotCited.slice(
          0,
          10,
        ),
        evidence: {
          count:
            mentionedNotCited.length,
        },
      });
    }

    const competitorAhead: Array<{
      query: string;
      competitors: string[];
    }> = [];

    for (const [
      query,
      list,
    ] of checksByQuery) {
      const brandMentioned =
        list.some(
          (check) => check.mentioned,
        );

      if (brandMentioned) {
        continue;
      }

      const names = [
        ...new Set(
          list.flatMap(
            (check) =>
              check.competitorNames ??
              [],
          ),
        ),
      ].slice(0, 5);

      if (names.length > 0) {
        competitorAhead.push({
          query,
          competitors: names,
        });
      }
    }

    if (competitorAhead.length > 0) {
      gaps.push({
        key: 'AI_COMPETITOR_AHEAD',
        title:
          'Competitors mentioned where the brand is absent',
        description: `${competitorAhead.length} quer${competitorAhead.length === 1 ? 'y records' : 'ies record'} competitor mentions without a brand mention. Never inferred from SEO rankings.`,
        priority: 'HIGH',
        queries: competitorAhead
          .slice(0, 10)
          .map((item) => item.query),
        evidence: {
          count:
            competitorAhead.length,
          details:
            competitorAhead.slice(
              0,
              10,
            ),
        },
      });
    }

    /*
     * Live provider connection states (real key
     * presence), plus declared NOT_CONFIGURED
     * entries for pluggable future providers.
     */
    const providerStates =
      this.listLiveProviderStates();

    return {
      website: {
        id: website.id,
        name: website.name,
        url: website.url,
      },
      providers: providerStates,
      counts: {
        trackedQueries:
          queries.length,
        completedChecks:
          completed.length,
        brandMentions,
        competitorMentionEvents:
          totalCompetitorEvents,
        citedDomains:
          citations.length,
      },
      shareOfVoice:
        shareDenominator > 0
          ? {
              brand: Number(
                (
                  (brandMentions /
                    shareDenominator) *
                  100
                ).toFixed(1),
              ),
              competitors: Number(
                (
                  (totalCompetitorEvents /
                    shareDenominator) *
                  100
                ).toFixed(1),
              ),
              denominator:
                shareDenominator,
              note: 'Share of recorded mention events only. Not a market share.',
            }
          : null,
      trend,
      citations,
      competitors: {
        tracked: trackedCompetitors,
        unlisted: [
          ...competitorMentionEvents.entries(),
        ]
          .map(([name, mentions]) => ({
            name,
            mentions,
          }))
          .sort(
            (a, b) =>
              b.mentions - a.mentions,
          )
          .slice(0, 10),
      },
      gaps,
    };
  }

  private calculateVisibilityScore(
    totalQueries: number,
    mentions: number,
    citations: number,
  ) {
    if (!totalQueries) {
      return 0;
    }

    const mentionRate = Math.min(
      mentions / totalQueries,
      1,
    );

    const citationRate = Math.min(
      citations / totalQueries,
      1,
    );

    return Math.round(
      mentionRate * 70 +
      citationRate * 30,
    );
  }
}






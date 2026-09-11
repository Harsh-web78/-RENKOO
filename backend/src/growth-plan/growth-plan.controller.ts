import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GrowthDecisionService } from './growth-plan.service';
import { GoalRoadmapService } from './goal-roadmap.service';
import type { PlanSection } from './growth-decisions';

/*
 * Phase 34 — Unified Growth Decision Engine 1.0
 * (additive composition). Read-only decision ordering
 * over existing evidence. No recommendation CRUD, no
 * action CRUD, no scores, no auto-execution.
 */
@Controller('growth-plan')
@UseGuards(JwtAuthGuard)
export class GrowthPlanController {
  constructor(
    private readonly plans: GrowthDecisionService,
    private readonly roadmaps: GoalRoadmapService,
  ) {}

  @Get(':websiteId')
  plan(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.plans.getPlan(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/now')
  now(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.plans.getNow(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/decisions')
  decisions(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Query('section') section?: string,
  ) {
    const valid: PlanSection[] = [
      'NOW',
      'NEXT',
      'WAIT',
      'BLOCKED',
      'COMPLETED',
    ];
    return this.plans.getDecisions(
      req.user.organizationId,
      websiteId,
      valid.includes(section as PlanSection)
        ? (section as PlanSection)
        : undefined,
    );
  }

  @Get(':websiteId/decisions/:fingerprint')
  decision(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Param('fingerprint') fingerprint: string,
  ) {
    return this.plans.getDecision(
      req.user.organizationId,
      websiteId,
      fingerprint,
    );
  }

  @Get(':websiteId/blocked')
  blocked(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.plans.getBlocked(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/completed')
  completed(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.plans.getCompleted(
      req.user.organizationId,
      websiteId,
    );
  }

  /* Stateless recompute: read-only, nothing written,
   * nothing consumed, nothing created. */
  @Post(':websiteId/refresh')
  refresh(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Body() _body: Record<string, unknown>,
  ) {
    void _body;
    return this.plans.refresh(
      req.user.organizationId,
      websiteId,
    );
  }

  /*
   * Phase 35 — Business Goal → Growth Roadmap 1.0
   * (additive composition). Goal-aligned 30/60/90
   * sequencing over Phase 34 decisions. No targets
   * invented, no dates fabricated, no scores.
   */
  @Get(':websiteId/goals')
  goals(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.roadmaps.goals(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/roadmap')
  roadmap(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.roadmaps.roadmap(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/roadmap/item')
  roadmapItemByQuery(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Query('id') id: string,
  ) {
    return this.roadmaps.roadmapItem(
      req.user.organizationId,
      websiteId,
      String(id ?? ''),
    );
  }

  @Get(':websiteId/progress')
  progress(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.roadmaps.progress(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/executive')
  executive(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.roadmaps.executive(
      req.user.organizationId,
      websiteId,
    );
  }
}

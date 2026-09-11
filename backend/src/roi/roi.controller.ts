import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RoiService } from './roi.service';
import { SearchRevenueService } from './search-revenue.service';
import { RevenueAttributionService } from './revenue-attribution.service';

@Controller('roi')
@UseGuards(JwtAuthGuard)
export class RoiController {
  constructor(
    private readonly roiService: RoiService,
    private readonly searchRevenue: SearchRevenueService,
    private readonly attribution: RevenueAttributionService,
  ) {}

  @Get(':websiteId/summary')
  summary(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.roiService.summary(
      req.user.organizationId,
      websiteId,
      from,
      to,
    );
  }

  @Get(':websiteId/outcome')
  outcome(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.roiService.outcome(
      req.user.organizationId,
      websiteId,
      from,
      to,
    );
  }

  /*
   * Phase 13 — Search-to-Revenue (additive composition).
   * Reuses the outcome engine + search/AI evidence graph.
   * Read-only: no provider calls, no new meters.
   */
  @Get(':websiteId/search-revenue')
  searchRevenueGraph(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Query('days') days?: string,
  ) {
    return this.searchRevenue.getSearchRevenue(
      req.user.organizationId,
      websiteId,
      Number(days) || 28,
    );
  }

  /*
   * Phase 33 — Search-to-Revenue Attribution 2.0
   * (additive composition). Evidence-first outcome
   * attribution over GA4 channels, GSC demand, rank,
   * AI visibility, recorded leads/revenue/spend and
   * actions. OBSERVED vs ATTRIBUTED vs INFERRED vs
   * ESTIMATED vs UNAVAILABLE on every edge. GSC
   * query → revenue stays CONTEXTUAL. Temporal
   * association only — never causal.
   */
  @Get(':websiteId/attribution/overview')
  attributionOverview(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Query('days') days?: string,
  ) {
    return this.attribution.overview(
      req.user.organizationId,
      websiteId,
      Number(days) || 28,
    );
  }

  @Get(':websiteId/attribution/pages')
  attributionPages(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Query('days') days?: string,
  ) {
    return this.attribution.pages(
      req.user.organizationId,
      websiteId,
      Number(days) || 28,
    );
  }

  @Get(':websiteId/attribution/needs')
  attributionNeeds(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Query('days') days?: string,
  ) {
    return this.attribution.needs(
      req.user.organizationId,
      websiteId,
      Number(days) || 28,
    );
  }

  @Get(':websiteId/attribution/actions')
  attributionActions(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Query('days') days?: string,
  ) {
    return this.attribution.actions(
      req.user.organizationId,
      websiteId,
      Number(days) || 28,
    );
  }

  @Get(':websiteId/attribution/model')
  attributionModel(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Query('days') days?: string,
  ) {
    return this.attribution.attribution(
      req.user.organizationId,
      websiteId,
      Number(days) || 28,
    );
  }

  @Get(':websiteId/attribution/ai')
  attributionAi(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Query('days') days?: string,
  ) {
    return this.attribution.ai(
      req.user.organizationId,
      websiteId,
      Number(days) || 28,
    );
  }

  @Get(':websiteId/attribution/signals')
  attributionSignals(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.attribution.commandSignals(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/attribution/client-report')
  attributionClientReport(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.attribution.clientReport(
      req.user.organizationId,
      websiteId,
    );
  }
}

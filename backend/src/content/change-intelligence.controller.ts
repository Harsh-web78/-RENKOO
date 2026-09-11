import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChangeIntelligenceService } from './change-intelligence.service';

/*
 * Change Intelligence reads (Phase 26): bounded
 * composition over crawl/rank/GSC/AI/business history.
 * Temporal association only — never causal. No scores,
 * no provider calls, charged:false.
 */
@Controller('change-intelligence')
@UseGuards(JwtAuthGuard)
export class ChangeIntelligenceController {
  constructor(
    private readonly changes: ChangeIntelligenceService,
  ) {}

  @Get()
  summary(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('days') days?: string,
  ) {
    const parsed = Number(days);
    return this.changes.getChangeSummary(
      req.user.organizationId,
      websiteId,
      parsed === 7 || parsed === 14 || parsed === 90
        ? parsed
        : 28,
    );
  }

  @Get('page')
  page(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('url') url: string,
  ) {
    return this.changes.getPageChanges(
      req.user.organizationId,
      websiteId,
      url ?? '',
    );
  }

  @Get('keyword')
  keyword(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('keyword') keyword: string,
  ) {
    return this.changes.getKeywordChanges(
      req.user.organizationId,
      websiteId,
      keyword ?? '',
    );
  }

  @Get('action')
  action(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('actionId') actionId: string,
  ) {
    return this.changes.getActionChanges(
      req.user.organizationId,
      websiteId,
      actionId ?? '',
    );
  }
}

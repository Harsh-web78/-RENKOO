import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DecisionGapService } from './decision-gap.service';

/*
 * Phase 38 — Search & AI Decision Gap Intelligence 1.0
 * (additive composition). WHY WE ARE NOT WINNING from
 * observed evidence only. Read-only; no scores, no
 * CRUD, no provider calls.
 */
@Controller('decision-gap')
@UseGuards(JwtAuthGuard)
export class DecisionGapController {
  constructor(
    private readonly gaps: DecisionGapService,
  ) {}

  @Get(':websiteId/targets')
  targets(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.gaps.targets(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/query')
  query(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Query('query') query: string,
    @Query('country') country?: string,
    @Query('language') language?: string,
    @Query('page') page?: string,
  ) {
    return this.gaps.analyzeQuery(
      req.user.organizationId,
      websiteId,
      {
        query: String(query ?? ''),
        country: country || undefined,
        language: language || undefined,
        page: page || undefined,
      },
    );
  }

  @Get(':websiteId/ai')
  ai(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Query('prompt') prompt: string,
  ) {
    return this.gaps.analyzeAi(
      req.user.organizationId,
      websiteId,
      { prompt: String(prompt ?? '') },
    );
  }

  @Get(':websiteId/item')
  item(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Query('type') type: string,
    @Query('target') target: string,
    @Query('competitor') competitor?: string,
  ) {
    return this.gaps.analyzeGeneral(
      req.user.organizationId,
      websiteId,
      {
        type: String(type ?? 'GOOGLE_QUERY'),
        target: String(target ?? ''),
        competitor: competitor || undefined,
      },
    );
  }
}

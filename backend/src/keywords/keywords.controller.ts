import {
  Controller,
  Get,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { KeywordsService } from './keywords.service';

@Controller('keywords')
@UseGuards(JwtAuthGuard)
export class KeywordsController {
  constructor(
    private readonly keywordsService: KeywordsService,
  ) {}

  // =========================================================
  // WEBSITE KEYWORD ANALYSIS
  // GET /api/keywords/:websiteId/analyze
  // =========================================================

  @Get(':websiteId/analyze')
  analyze(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.keywordsService.analyze(
      req.user.organizationId,
      websiteId,
    );
  }

  // =========================================================
  // KEYWORD GAP
  // GET /api/keywords/:websiteId/gap/:competitorId
  // =========================================================

  @Get(':websiteId/gap/:competitorId')
  gap(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Param('competitorId') competitorId: string,
  ) {
    return this.keywordsService.gap(
      req.user.organizationId,
      websiteId,
      competitorId,
    );
  }
}

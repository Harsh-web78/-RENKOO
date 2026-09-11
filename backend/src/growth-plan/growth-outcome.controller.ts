import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GrowthOutcomeService } from './growth-outcome.service';

/*
 * Phase 37 — Search Growth Outcome Loop 1.0 (additive).
 * VERIFICATION → MEASUREMENT → OUTCOME → NEXT
 * DECISION over existing evidence. Read-only; no
 * scores, no forecasting, no causal claims.
 */
@Controller('growth-outcomes')
@UseGuards(JwtAuthGuard)
export class GrowthOutcomeController {
  constructor(
    private readonly outcomes: GrowthOutcomeService,
  ) {}

  @Get(':websiteId')
  all(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.outcomes.outcomes(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/recent')
  recent(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.outcomes.recent(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/pending')
  pending(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.outcomes.pending(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/:actionId')
  one(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Param('actionId') actionId: string,
    @Query('window') window?: string,
  ) {
    return this.outcomes.outcomeFor(
      req.user.organizationId,
      websiteId,
      actionId,
      Number(window) || 28,
    );
  }
}

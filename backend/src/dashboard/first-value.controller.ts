import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FirstValueService } from './first-value.service';

/*
 * Phase 40 — Guided First-Value Sequencer 1.0
 * (additive). One guided first-run flow over existing
 * state: WEBSITE → CRAWL → GSC → PROPERTY → GA4 →
 * PROPERTY → BASELINE → TOP 3 ACTIONS →
 * FIRST_VALUE_READY → Command Center. Read-only
 * except step-event records (skip/resume/failure
 * evidence — never completion without data).
 */
@Controller('first-value')
@UseGuards(JwtAuthGuard)
export class FirstValueController {
  constructor(
    private readonly firstValue: FirstValueService,
  ) {}

  @Get('provider/usage')
  providerUsage(@Req() req: any) {
    return this.firstValue.providerUsage(
      req.user.organizationId,
      req.user.userId,
    );
  }

  @Get(':websiteId/status')
  status(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    /* Phase 41 (Group I): ?fresh=1 bypasses the
     * short-lived baseline cache after explicit user
     * actions (crawl dispatch, property select) and
     * manual Refresh. Mounts stay on the cached path. */
    @Query('fresh') fresh?: string,
  ) {
    return this.firstValue.status(
      req.user.organizationId,
      websiteId,
      { fresh: fresh === '1' },
    );
  }

  @Post(':websiteId/events')
  recordEvent(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Body()
    body: {
      kind?: string;
      step?: string;
      status?: string;
    },
  ) {
    return this.firstValue.recordEvent(
      req.user.organizationId,
      websiteId,
      {
        kind: body?.kind,
        step: body?.step,
        status: body?.status,
      },
    );
  }

  @Get(':websiteId/acceptance')
  acceptance(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.firstValue.acceptance(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get('delivery/truth')
  deliveryTruth(@Req() req: any) {
    void req;
    return this.firstValue.deliveryTruth();
  }
}

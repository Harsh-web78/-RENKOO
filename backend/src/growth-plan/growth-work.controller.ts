import {
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GrowthWorkService } from './growth-work.service';

/*
 * Phase 36 — Governed Growth Work Queue 1.0 (additive).
 * Operational composition over existing actions:
 * TODAY / READY / APPROVAL / IN PROGRESS / BLOCKED /
 * VERIFY / MEASURE / COMPLETED. Read-only; no CRUD,
 * no auto-execution, no new lifecycle.
 */
@Controller('growth-work')
@UseGuards(JwtAuthGuard)
export class GrowthWorkController {
  constructor(
    private readonly work: GrowthWorkService,
  ) {}

  @Get(':websiteId')
  queue(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.work.queue(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/today')
  today(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.work.today(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/ready')
  ready(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.work.section(
      req.user.organizationId,
      websiteId,
      'READY',
    );
  }

  @Get(':websiteId/approval')
  approval(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.work.section(
      req.user.organizationId,
      websiteId,
      'AWAITING_APPROVAL',
    );
  }

  @Get(':websiteId/blocked')
  blocked(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.work.section(
      req.user.organizationId,
      websiteId,
      'BLOCKED',
    );
  }

  @Get(':websiteId/verify')
  verify(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.work.section(
      req.user.organizationId,
      websiteId,
      'VERIFY',
    );
  }

  @Get(':websiteId/measure')
  measure(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.work.section(
      req.user.organizationId,
      websiteId,
      'MEASURE',
    );
  }

  @Get(':websiteId/item/:actionId')
  item(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Param('actionId') actionId: string,
  ) {
    return this.work.detail(
      req.user.organizationId,
      websiteId,
      actionId,
    );
  }

  /* Stateless recompute: read-only, nothing written,
   * nothing consumed, nothing executed. */
  @Post(':websiteId/refresh')
  refresh(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.work.refresh(
      req.user.organizationId,
      websiteId,
    );
  }
}

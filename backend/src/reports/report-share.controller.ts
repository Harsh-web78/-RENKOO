import {
  Controller,
  Get,
  Param,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { ReportsService } from './reports.service';

/*
 * Public, token-gated, read-only report access.
 * Deliberately NOT behind JwtAuthGuard: the share
 * token is the credential. Returns a whitelisted
 * snapshot only — never organization internals.
 */
@Controller('reports/shared')
export class ReportShareController {
  constructor(
    private readonly reportsService: ReportsService,
  ) {}

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get(':token')
  shared(
    @Param('token') token: string,
  ) {
    return this.reportsService.getShared(
      token,
    );
  }
}

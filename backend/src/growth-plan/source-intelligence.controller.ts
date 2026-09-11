import {
  Controller,
  Get,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SourceIntelligenceService } from './source-intelligence.service';

/*
 * Phase 39 — AI Source & Brand Authority Intelligence
 * 1.0 (additive composition). Which external sources
 * shape search/AI decisions and where the brand is
 * missing. Read-only; no scores, no CRUD, no
 * outreach, no provider calls.
 */
@Controller('source-intelligence')
@UseGuards(JwtAuthGuard)
export class SourceIntelligenceController {
  constructor(
    private readonly sources: SourceIntelligenceService,
  ) {}

  @Get(':websiteId')
  landscape(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.sources.landscape(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/landscape')
  landscapeAlias(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.sources.landscape(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/competitors')
  competitors(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.sources.competitors(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/ai')
  ai(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.sources.ai(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/item/:domain')
  item(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Param('domain') domain: string,
  ) {
    return this.sources.item(
      req.user.organizationId,
      websiteId,
      domain,
    );
  }
}
